export {};

/**
 * Gateway 请求预算（速率护栏）。
 *
 * 为什么需要它：
 * 现有的 request-priority 只限制「同时在途数」（critical 2 / foreground 3 / business 1）。
 * 在途数受控，但**速率**完全不受控：一次 AllLands 卡 15s，串行仍能在 60s 内发十几轮；
 * 叠加 ACE AntiData 每 5s 一次、心跳每 25s 一次、每日例行、神秘商店、化肥检测之后，
 * 单个账号 60s 内的请求量可以轻松破百。
 *
 * 服务端对这种突发并不返回错误，它只是**不再回包**（连接不断开）。于是本地表现为
 * 「pending 堆积 → 心跳也拿不到回包 → 连续 miss → 心跳超时下线」，而日志里看到的
 * 全是「请求超时」，看不出是本地自己把连接打死的。
 *
 * 所以这里加一道滑动窗口硬预算：超过就丢弃非白名单请求（让上层走既有的退避分支），
 * 保住连接不被自己压垮。白名单是保命流量与协议必需流量，永不拦截。
 *
 * 2026-11 预算自旋治理（参考 qq-farm-evolution 的 request-governor）：
 * - 画像：按 service.method 统计窗口内请求量与失败量，用于定位是谁在吃预算；
 * - 预算余量：暴露剩余量给调度器，让 tick 在预算打满时主动让路，而不是反复撞墙；
 * - 后台班次储备：预算接近上限时先丢 background（补数据类轮询），把名额留给农场/好友；
 * - 紧急窗口：成熟抢收链路（Enter/Leave/CheckCanOperate/Harvest）在极短窗口内不被丢弃；
 * - 施肥 HOT：确认出现施肥趋势后，总预算 ×1.5、读地/进门单项 ×3。
 */

/** 滑动窗口长度。 */
const WINDOW_MS = 60 * 1000;
/** 60s 内总请求上限。多账号各自是独立 worker，互不累计。 */
const TOTAL_LIMIT = Math.max(1, Number(process.env.FARM_REQUEST_LIMIT_60S) || 80);
/** 60s 内单接口上限：防止某个接口自旋把预算吃光。 */
const PER_METHOD_LIMIT = Math.max(1, Number(process.env.FARM_REQUEST_METHOD_LIMIT_60S) || 30);
/** 预算占用超过该比例后，后台班次（补数据轮询）先让路。 */
const BACKGROUND_RESERVE_RATIO = 0.85;

/**
 * 不受预算限制的接口：
 * - Heartbeat / Login：连接保活与登录，拦了就直接掉线；
 * - AntiData：ACE 风控上报，官方客户端固定节奏，漏报会被判定异常客户端。
 */
const WHITELIST = new Set<string>([
    'gamepb.userpb.UserService.Heartbeat',
    'gamepb.gatepb.GateService.Login',
    'gamepb.acepb.AceService.AntiData',
]);

/** Heartbeat / Login / Harvest / Steal 这类必发请求的兜底放行正则。 */
const ESSENTIAL_RE = /(?:Heartbeat|Login|Harvest|Steal)$/;

/** 施肥 HOT / 抢收竞速涉及的接口：单项限值可放宽。 */
const WATCHMODE_METHODS = new Set<string>([
    'gamepb.visitpb.VisitService.Enter',
    'gamepb.plantpb.PlantService.AllLands',
]);
/** 施肥 HOT 窗口内放宽倍数。 */
const WATCHMODE_BOOST = Math.max(1, Number(process.env.FARM_WATCHMODE_BOOST) || 3);
/** 成熟抢收紧急窗口内不被硬预算丢弃的链路请求。 */
const URGENT_METHODS = new Set<string>([
    'gamepb.visitpb.VisitService.Enter',
    'gamepb.visitpb.VisitService.Leave',
    'gamepb.plantpb.PlantService.CheckCanOperate',
    'gamepb.plantpb.PlantService.Harvest',
]);

/** 施肥 HOT 到期时刻；0 = 无窗口。 */
let watchModeUntil = 0;
/** 成熟抢收紧急窗口到期时刻；0 = 无窗口。窗口极短（秒级），不会演变成请求风暴。 */
let urgentModeUntil = 0;

interface WindowEvent {
    at: number;
    key: string;
    ok: boolean;
}

const windowEvents: WindowEvent[] = [];
let droppedTotal = 0;
let lastDropAt = 0;
let lastDropKey = '';

function methodKey(serviceName: string, methodName: string): string {
    return `${String(serviceName || '')}.${String(methodName || '')}`;
}

function prune(now: number): void {
    while (windowEvents.length > 0 && now - windowEvents[0].at > WINDOW_MS) windowEvents.shift();
}

function countByKey(key: string): number {
    let count = 0;
    for (const event of windowEvents) {
        if (event.key === key) count += 1;
    }
    return count;
}

/** 进入/退出施肥 HOT 窗口（确认出现施肥趋势后调用）。 */
function setWatchMode(active: boolean, untilMs: number = 0): void {
    watchModeUntil = active ? Math.max(watchModeUntil, Number(untilMs) || 0) : 0;
}

function watchModeActive(now: number = Date.now()): boolean {
    return now < watchModeUntil;
}

/** 进入/退出成熟抢收紧急窗口（哨兵到点前后、预进门链路调用）。 */
function setUrgentMode(active: boolean, untilMs: number = 0): void {
    urgentModeUntil = active ? Math.max(urgentModeUntil, Number(untilMs) || 0) : 0;
}

function urgentModeActive(now: number = Date.now()): boolean {
    return now < urgentModeUntil;
}

interface CheckOptions {
    /** 请求班次：background 在预算吃紧时先让路。 */
    requestClass?: string;
}

interface CheckResult {
    allowed: boolean;
    reason: string;
    key: string;
    /** 被拦截时建议的等待时间（窗口内最早事件过期所需时间）。 */
    retryAfterMs: number;
}

/**
 * 发送前过闸。allowed=false 时调用方应直接以可识别错误拒绝该请求，
 * 让上层既有的 catch / 退避逻辑接管，而不是继续往网关里塞。
 */
function checkRequest(
    serviceName: string,
    methodName: string,
    now: number = Date.now(),
    options: CheckOptions = {},
): CheckResult {
    prune(now);
    const key = methodKey(serviceName, methodName);
    if (WHITELIST.has(key) || ESSENTIAL_RE.test(key)) {
        return { allowed: true, reason: 'whitelist', key, retryAfterMs: 0 };
    }

    // 成熟抢收紧急窗口：只豁免偷菜快路径的四个目标方法，其余请求照常过闸，
    // 防止窗口被滥用成全局限流旁路。仍计入画像（recordSent 正常登记）。
    if (urgentModeActive(now) && URGENT_METHODS.has(key)) {
        return { allowed: true, reason: 'urgent', key, retryAfterMs: 0 };
    }

    const totalLimit = watchModeActive(now) ? Math.floor(TOTAL_LIMIT * 1.5) : TOTAL_LIMIT;
    let reason = '';
    if (windowEvents.length >= totalLimit) reason = 'budget_total';
    else {
        const methodLimit = WATCHMODE_METHODS.has(key) && watchModeActive(now)
            ? PER_METHOD_LIMIT * WATCHMODE_BOOST
            : PER_METHOD_LIMIT;
        if (countByKey(key) >= methodLimit) reason = 'budget_method';
        // 预算接近上限时，后台补数据类请求先让路，把余量留给农场/好友主链路。
        else if (options.requestClass === 'background'
            && windowEvents.length >= Math.floor(totalLimit * BACKGROUND_RESERVE_RATIO)) {
            reason = 'budget_reserve';
        }
    }

    if (!reason) return { allowed: true, reason: 'ok', key, retryAfterMs: 0 };

    droppedTotal += 1;
    lastDropAt = now;
    lastDropKey = key;
    const oldest = windowEvents[0];
    return {
        allowed: false,
        reason,
        key,
        retryAfterMs: oldest ? Math.max(0, WINDOW_MS - (now - oldest.at)) : 1000,
    };
}

/** 请求真正发出后登记（只登记成功发到 socket 的，排队中被拒的不算）。 */
function recordSent(serviceName: string, methodName: string, now: number = Date.now()): void {
    prune(now);
    windowEvents.push({ at: now, key: methodKey(serviceName, methodName), ok: true });
}

/** 回包后补记结果：只用于画像，不影响预算判定。 */
function recordOutcome(serviceName: string, methodName: string, ok: boolean): void {
    if (ok) return;
    const key = methodKey(serviceName, methodName);
    for (let i = windowEvents.length - 1; i >= 0; i -= 1) {
        const event = windowEvents[i];
        if (event.key === key && event.ok) {
            event.ok = false;
            return;
        }
    }
}

/** 当前窗口的预算占用情况，供调度器决定本轮是否让路。 */
function getBudgetPressure(now: number = Date.now()) {
    prune(now);
    const limit = watchModeActive(now) ? Math.floor(TOTAL_LIMIT * 1.5) : TOTAL_LIMIT;
    const used = windowEvents.length;
    const oldest = windowEvents[0];
    return {
        used,
        limit,
        ratio: limit > 0 ? used / limit : 0,
        full: used >= limit,
        /** 预算打满时，最早一条滑出窗口所需时间；未满为 0。 */
        retryAfterMs: used >= limit && oldest ? Math.max(0, WINDOW_MS - (now - oldest.at)) : 0,
    };
}

function getGovernorStats(now: number = Date.now()) {
    prune(now);
    return {
        windowMs: WINDOW_MS,
        totalLimit: TOTAL_LIMIT,
        perMethodLimit: PER_METHOD_LIMIT,
        sentInWindow: windowEvents.length,
        watchModeActive: watchModeActive(now),
        urgentModeActive: urgentModeActive(now),
        droppedTotal,
        lastDropAt,
        lastDropKey,
        topMethods: getRequestProfile(now).top.slice(0, 8),
    };
}

/** 画像：窗口内按接口统计请求量与失败量，用来定位是谁在吃预算。 */
function getRequestProfile(now: number = Date.now()) {
    prune(now);
    const byMethod = new Map<string, { count: number; errCount: number }>();
    for (const event of windowEvents) {
        const item = byMethod.get(event.key) || { count: 0, errCount: 0 };
        item.count += 1;
        if (!event.ok) item.errCount += 1;
        byMethod.set(event.key, item);
    }
    const top = [...byMethod.entries()]
        .map(([method, stat]) => ({ method, ...stat }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 12);
    return {
        windowMs: WINDOW_MS,
        windowCount: windowEvents.length,
        totalLimit: TOTAL_LIMIT,
        perMethodLimit: PER_METHOD_LIMIT,
        droppedTotal,
        top,
    };
}

/** 仅供测试重置。 */
function resetGovernor(): void {
    windowEvents.length = 0;
    droppedTotal = 0;
    lastDropAt = 0;
    lastDropKey = '';
    watchModeUntil = 0;
    urgentModeUntil = 0;
}

module.exports = {
    WINDOW_MS,
    TOTAL_LIMIT,
    PER_METHOD_LIMIT,
    WHITELIST,
    checkRequest,
    recordSent,
    recordOutcome,
    getBudgetPressure,
    getRequestProfile,
    getGovernorStats,
    setWatchMode,
    setUrgentMode,
    watchModeActive,
    urgentModeActive,
    resetGovernor,
};
