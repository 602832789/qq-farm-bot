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
 */

/** 滑动窗口长度。 */
const WINDOW_MS = 60 * 1000;
/** 60s 内总请求上限。多账号各自是独立 worker，互不累计。 */
const TOTAL_LIMIT = Math.max(1, Number(process.env.FARM_REQUEST_LIMIT_60S) || 80);
/** 60s 内单接口上限：防止某个接口自旋把预算吃光。 */
const PER_METHOD_LIMIT = Math.max(1, Number(process.env.FARM_REQUEST_METHOD_LIMIT_60S) || 30);

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

interface WindowEvent {
    at: number;
    key: string;
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
function checkRequest(serviceName: string, methodName: string, now: number = Date.now()): CheckResult {
    prune(now);
    const key = methodKey(serviceName, methodName);
    if (WHITELIST.has(key) || ESSENTIAL_RE.test(key)) {
        return { allowed: true, reason: 'whitelist', key, retryAfterMs: 0 };
    }

    let reason = '';
    if (windowEvents.length >= TOTAL_LIMIT) reason = 'budget_total';
    else if (countByKey(key) >= PER_METHOD_LIMIT) reason = 'budget_method';

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
    windowEvents.push({ at: now, key: methodKey(serviceName, methodName) });
}

function getGovernorStats(now: number = Date.now()) {
    prune(now);
    return {
        windowMs: WINDOW_MS,
        totalLimit: TOTAL_LIMIT,
        perMethodLimit: PER_METHOD_LIMIT,
        sentInWindow: windowEvents.length,
        droppedTotal,
        lastDropAt,
        lastDropKey,
    };
}

/** 仅供测试重置。 */
function resetGovernor(): void {
    windowEvents.length = 0;
    droppedTotal = 0;
    lastDropAt = 0;
    lastDropKey = '';
}

module.exports = {
    WINDOW_MS,
    TOTAL_LIMIT,
    PER_METHOD_LIMIT,
    WHITELIST,
    checkRequest,
    recordSent,
    getGovernorStats,
    resetGovernor,
};
