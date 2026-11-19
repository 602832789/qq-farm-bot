export {};

/**
 * Gateway 流量整形（流量保险丝 + 前台豁免）。
 *
 * 历史问题（2026-11 之前）：
 * 这里原本是一道「60s 内最多 80 个请求」的硬预算，对所有非白名单请求一视同仁。
 * 但一个开着全自动的账号，60s 内光是 ACE AntiData（12 次）、心跳（3 次）、
 * 农场/好友定时任务、活动自动化加起来就能把预算吃满。预算一满，用户在面板上
 * 点「我的农场」发起的 AllLands 也会被直接拒绝，前端只看到一句失败，
 * 表现为「页面打不开 / 点了没反应」。
 *
 * 现在的设计（对齐上游 docs/network-concurrency.md 的分层并发模型）：
 *
 * 1. 前台（foreground）与保命流量（critical：心跳 / Login / ACE）**永不因配额被拒**。
 *    用户在等结果，任何情况下都要让它进队列，慢一点可以，直接失败不行。
 * 2. 只有自动任务（farm / friend / background）受这道保险丝约束。正常情况下上限
 *    足够高（默认 180/60s），只在异常时才收紧，作用是防止某个任务自旋把连接打爆。
 * 3. 上限随网关健康度自适应，而不是写死一个数字：
 *    - healthy  —— 没有漏心跳、最老在途 < 2s：180/60s；
 *    - cautious —— 最老在途 ≥ 2s 或入站开始变慢：90/60s；
 *    - stall    —— 心跳漏拍 / 最老在途 ≥ 5s / 有在途但长时间无入站：24/60s，
 *                  此时自动任务基本停摆，把连接完整留给心跳和 ACE 自己恢复。
 * 4. 前台活跃信号：最近 2.5s 内有前台请求时，定时任务入口会主动短顺延
 *    （见 core/worker.ts），避免用户点击时正好被自动任务占着业务槽位。
 *
 * 真正限制并发的是 utils/request-priority.ts：业务总在途 3、非前台业务 1、
 * 心跳与 ACE 各留 1 个专属槽位、background 只在彻底空闲时发。这道保险丝
 * 只兜住「速率」这一个维度，且只对会自动重试的流量生效。
 */

/** 滑动窗口长度。 */
const WINDOW_MS = 60 * 1000;

/** 自动任务在健康状态下 60s 内的请求上限（保险丝，正常跑不到）。 */
const AUTO_LIMIT_HEALTHY = Math.max(1, Number(process.env.FARM_AUTO_LIMIT_60S) || 180);
/** 网关开始变慢时的自动任务上限。 */
const AUTO_LIMIT_CAUTIOUS = Math.max(1, Number(process.env.FARM_AUTO_CAUTIOUS_LIMIT_60S) || 90);
/** 网关卡住（心跳漏拍 / 长时间无回包）时的自动任务上限。 */
const AUTO_LIMIT_STALL = Math.max(0, Number(process.env.FARM_AUTO_STALL_LIMIT_60S) || 24);
/** 单个自动接口的上限，防止某个接口自旋把额度吃光。 */
const AUTO_METHOD_LIMIT = Math.max(1, Number(process.env.FARM_AUTO_METHOD_LIMIT_60S) || 60);
/** 网关卡住时单接口上限。 */
const AUTO_METHOD_LIMIT_STALL = Math.max(1, Number(process.env.FARM_AUTO_METHOD_LIMIT_STALL_60S) || 8);
/** 前台活跃判定窗口：这段时间内有过前台请求，就认为用户正在操作。 */
const FOREGROUND_ACTIVE_MS = Math.max(0, Number(process.env.FARM_FOREGROUND_ACTIVE_MS) || 2500);

/** 兼容旧导出的命名。 */
const TOTAL_LIMIT = AUTO_LIMIT_HEALTHY;
const PER_METHOD_LIMIT = AUTO_METHOD_LIMIT;

/**
 * 不受保险丝约束的接口：
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

/** 施肥 HOT / 抢收竞速涉及的接口：单接口上限可放宽。 */
const WATCHMODE_METHODS = new Set<string>([
    'gamepb.visitpb.VisitService.Enter',
    'gamepb.plantpb.PlantService.AllLands',
]);
/** 施肥 HOT 窗口内放宽倍数。 */
const WATCHMODE_BOOST = Math.max(1, Number(process.env.FARM_WATCHMODE_BOOST) || 3);

/** 施肥 HOT 到期时刻；0 = 无窗口。 */
let watchModeUntil = 0;
/** 最近一次前台请求时间，用于「用户正在操作」判定。 */
let lastForegroundAt = 0;

type FlowMode = 'healthy' | 'cautious' | 'stall';
type EventKind = 'auto' | 'foreground' | 'critical';

interface FlowHealth {
    /** 连续心跳失败次数。 */
    heartbeatMisses?: number;
    /** 当前最老在途请求的年龄（毫秒）。 */
    oldestPendingAgeMs?: number;
    /** 距离上一次收到入站数据的时长（毫秒）。 */
    inboundSilenceMs?: number;
    /** 当前在途请求数。 */
    pending?: number;
}

interface WindowEvent {
    at: number;
    key: string;
    kind: EventKind;
    ok: boolean;
}

const windowEvents: WindowEvent[] = [];
let droppedTotal = 0;
let lastDropAt = 0;
let lastDropKey = '';
let lastHealthMode: FlowMode = 'healthy';

function methodKey(serviceName: string, methodName: string): string {
    return `${String(serviceName || '')}.${String(methodName || '')}`;
}

function prune(now: number): void {
    while (windowEvents.length > 0 && now - windowEvents[0].at > WINDOW_MS) windowEvents.shift();
}

function kindOfRequestClass(requestClass: any): EventKind {
    const cls = String(requestClass || 'foreground');
    if (cls === 'foreground') return 'foreground';
    if (cls === 'critical') return 'critical';
    return 'auto';
}

function countKind(kind: EventKind): number {
    let count = 0;
    for (const event of windowEvents) {
        if (event.kind === kind) count += 1;
    }
    return count;
}

function countByKey(key: string): number {
    let count = 0;
    for (const event of windowEvents) {
        if (event.key === key) count += 1;
    }
    return count;
}

/**
 * 网关健康度分档。
 *
 * 入站静默只有在「有在途请求」时才有意义：空闲时本来就没有入站数据，
 * 不能因此判定网关卡住，否则账号一空闲自动任务就会被误停。
 */
function classifyHealth(health: FlowHealth | null | undefined): FlowMode {
    const misses = Math.max(0, Number(health && health.heartbeatMisses) || 0);
    const oldest = Math.max(0, Number(health && health.oldestPendingAgeMs) || 0);
    const silence = Math.max(0, Number(health && health.inboundSilenceMs) || 0);
    const pending = Math.max(0, Number(health && health.pending) || 0);

    if (misses > 0 || oldest >= 5000 || (pending > 0 && silence >= 20000)) return 'stall';
    if (oldest >= 2000 || (pending > 0 && silence >= 8000)) return 'cautious';
    return 'healthy';
}

function limitForMode(mode: FlowMode): number {
    if (mode === 'stall') return AUTO_LIMIT_STALL;
    if (mode === 'cautious') return AUTO_LIMIT_CAUTIOUS;
    return AUTO_LIMIT_HEALTHY;
}

function methodLimitForMode(mode: FlowMode, key: string, now: number): number {
    const boosted = WATCHMODE_METHODS.has(key) && watchModeActive(now);
    const base = mode === 'stall' ? AUTO_METHOD_LIMIT_STALL : AUTO_METHOD_LIMIT;
    return boosted ? base * WATCHMODE_BOOST : base;
}

/** 进入/退出施肥 HOT 窗口（确认出现施肥趋势后调用）。 */
function setWatchMode(active: boolean, untilMs: number = 0): void {
    watchModeUntil = active ? Math.max(watchModeUntil, Number(untilMs) || 0) : 0;
}

function watchModeActive(now: number = Date.now()): boolean {
    return now < watchModeUntil;
}

/** 最近是否有用户在面板上操作（前台请求）。 */
function noteForegroundActivity(now: number = Date.now()): void {
    lastForegroundAt = now;
}

function isForegroundActive(now: number = Date.now(), windowMs: number = FOREGROUND_ACTIVE_MS): boolean {
    if (lastForegroundAt <= 0) return false;
    return now - lastForegroundAt <= Math.max(0, Number(windowMs) || 0);
}

interface CheckOptions {
    /** 请求班次，见 utils/request-priority.ts。缺省按前台处理。 */
    requestClass?: string;
    /** 网关当前负载快照，用于自适应限速。 */
    health?: FlowHealth | null;
}

interface CheckResult {
    allowed: boolean;
    reason: string;
    key: string;
    /** 被拦截时建议的等待时间（窗口内最早事件过期所需时间）。 */
    retryAfterMs: number;
    /** 本次判定使用的健康度档位。 */
    mode: FlowMode;
}

/**
 * 发送前过闸。
 *
 * 只有自动任务（farm / friend / background）会返回 allowed=false；
 * 前台与保命流量永远放行，调用方不需要为「用户操作被限额」写兜底。
 */
function checkRequest(
    serviceName: string,
    methodName: string,
    now: number = Date.now(),
    options: CheckOptions = {},
): CheckResult {
    prune(now);
    const key = methodKey(serviceName, methodName);
    const kind = kindOfRequestClass(options.requestClass);

    // 前台：无条件放行，只登记活跃时间。
    if (kind === 'foreground') {
        noteForegroundActivity(now);
        return { allowed: true, reason: 'foreground', key, retryAfterMs: 0, mode: lastHealthMode };
    }

    // 保命流量：心跳 / 登录 / ACE，以及收菜偷菜这类核心链路。
    if (kind === 'critical' || WHITELIST.has(key) || ESSENTIAL_RE.test(key)) {
        return { allowed: true, reason: 'critical', key, retryAfterMs: 0, mode: lastHealthMode };
    }

    // 成熟抢收、收菜偷菜这类链路本身就在 critical/essential 白名单里，
    // 不再需要额外的紧急窗口。

    const mode = classifyHealth(options.health);
    lastHealthMode = mode;
    const totalLimit = limitForMode(mode);
    const autoCount = countKind('auto');

    let reason = '';
    if (autoCount >= totalLimit) reason = 'budget_total';
    else if (countByKey(key) >= methodLimitForMode(mode, key, now)) reason = 'budget_method';

    if (!reason) return { allowed: true, reason: 'ok', key, retryAfterMs: 0, mode };

    droppedTotal += 1;
    lastDropAt = now;
    lastDropKey = key;
    const oldest = windowEvents[0];
    return {
        allowed: false,
        reason,
        key,
        retryAfterMs: oldest ? Math.max(0, WINDOW_MS - (now - oldest.at)) : 1000,
        mode,
    };
}

/** 请求真正发出后登记。排队中被拒的不算。 */
function recordSent(
    serviceName: string,
    methodName: string,
    requestClass: any = 'foreground',
    now: number = Date.now(),
): void {
    prune(now);
    const kind = kindOfRequestClass(requestClass);
    windowEvents.push({ at: now, key: methodKey(serviceName, methodName), kind, ok: true });
    if (kind === 'foreground') noteForegroundActivity(now);
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

/**
 * 自动任务的额度占用情况，供活动自动化决定首轮是否顺延。
 * 只统计自动任务——前台请求不消耗额度，也不应该影响这个比例。
 */
function getBudgetPressure(now: number = Date.now(), health: FlowHealth | null = null) {
    prune(now);
    const mode = classifyHealth(health);
    const limit = limitForMode(mode);
    const used = countKind('auto');
    const oldest = windowEvents.find(event => event.kind === 'auto');
    return {
        used,
        limit,
        ratio: limit > 0 ? used / limit : 0,
        full: used >= limit,
        mode,
        /** 额度打满时，最早一条滑出窗口所需时间；未满为 0。 */
        retryAfterMs: used >= limit && oldest ? Math.max(0, WINDOW_MS - (now - oldest.at)) : 0,
    };
}

function getGovernorStats(now: number = Date.now(), health: FlowHealth | null = null) {
    prune(now);
    const mode = classifyHealth(health);
    const autoSent = countKind('auto');
    return {
        windowMs: WINDOW_MS,
        // 兼容旧字段：sentInWindow / totalLimit 现在都只描述自动任务。
        totalLimit: limitForMode(mode),
        perMethodLimit: mode === 'stall' ? AUTO_METHOD_LIMIT_STALL : AUTO_METHOD_LIMIT,
        sentInWindow: autoSent,
        autoSentInWindow: autoSent,
        foregroundSentInWindow: countKind('foreground'),
        criticalSentInWindow: countKind('critical'),
        mode,
        foregroundActive: isForegroundActive(now),
        watchModeActive: watchModeActive(now),
        droppedTotal,
        lastDropAt,
        lastDropKey,
        topMethods: getRequestProfile(now).top.slice(0, 8),
    };
}

/** 画像：窗口内按接口统计请求量与失败量，用来定位是谁在吃额度。 */
function getRequestProfile(now: number = Date.now()) {
    prune(now);
    const byMethod = new Map<string, { count: number; errCount: number; kind: EventKind }>();
    for (const event of windowEvents) {
        const item = byMethod.get(event.key) || { count: 0, errCount: 0, kind: event.kind };
        item.count += 1;
        if (!event.ok) item.errCount += 1;
        item.kind = event.kind;
        byMethod.set(event.key, item);
    }
    const top = [...byMethod.entries()]
        .map(([method, stat]) => ({ method, ...stat }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 12);
    const autoCount = countKind('auto');
    return {
        windowMs: WINDOW_MS,
        windowCount: windowEvents.length,
        autoCount,
        foregroundCount: countKind('foreground'),
        criticalCount: countKind('critical'),
        totalLimit: limitForMode(classifyHealth(null)),
        perMethodLimit: AUTO_METHOD_LIMIT,
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
    lastForegroundAt = 0;
    lastHealthMode = 'healthy';
}

module.exports = {
    WINDOW_MS,
    TOTAL_LIMIT,
    PER_METHOD_LIMIT,
    AUTO_LIMIT_HEALTHY,
    AUTO_LIMIT_CAUTIOUS,
    AUTO_LIMIT_STALL,
    AUTO_METHOD_LIMIT,
    FOREGROUND_ACTIVE_MS,
    WHITELIST,
    checkRequest,
    recordSent,
    recordOutcome,
    getBudgetPressure,
    getRequestProfile,
    getGovernorStats,
    classifyHealth,
    noteForegroundActivity,
    isForegroundActive,
    setWatchMode,
    watchModeActive,
    resetGovernor,
};
