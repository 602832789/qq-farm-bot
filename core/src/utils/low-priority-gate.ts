export {};

/**
 * background 班次（后台补数据）请求的让路策略。
 *
 * Gateway 是单连接复用，background 代表「补数据」：任何业务流量在场时它都应该让位，
 * 而不是排进队列里熬到超时——排队本身会拖长队列、把 pending 拉满，最后连心跳都被挤到超时。
 *
 * 判定口径（见 utils/request-priority.ts 的 selectDispatchIndex）：
 * - 队列里有任何非 background 请求 → 业务流量正在排队，必须让路；
 * - 有业务请求在飞（foreground/farm/friend）→ 有人正在等回包，必须让路；
 * - 已经有 background 在飞 → 那唯一的后台槽位被占着，别再叠加；
 * - 心跳已经漏过、或有在途请求卡了 5 秒以上 → 连接本身可疑，后台请求一律不发；
 * - critical（心跳 / ACE）自身不参与判定，它们有独立保留槽位，不会被 background 影响。
 */

interface GatewayLoadLike {
    blockingQueued?: number;
    businessPending?: number;
    backgroundPending?: number;
    heartbeatMisses?: number;
    oldestPendingAgeMs?: number;
}

// background 请求在队列里最多等这么久；等不到槽位就按「让路」失败，让调用方把剩下的活留给下一轮
const LOW_PRIORITY_QUEUE_WAIT_MS = 8000;
// 后台任务发请求之前等网关空闲的最长时间与轮询间隔
const LOW_PRIORITY_IDLE_WAIT_MAX_MS = 8000;
const LOW_PRIORITY_IDLE_POLL_MS = 250;
// 在途请求超过这个年龄就当成「网关正在卡住」：服务端一旦静默，主流程请求会挂到十几秒，
// 这时候后台请求必须立刻停手，别再往一条已经没有回包的连接上加东西。
const GATEWAY_STALL_PENDING_MS = 5000;

function isGatewayIdleForLowPriority(load: GatewayLoadLike | null | undefined): boolean {
    if (!load) return false;
    if (Number(load.blockingQueued) > 0) return false;
    if (Number(load.businessPending) > 0) return false;
    if (Number(load.backgroundPending) > 0) return false;
    if (Number(load.heartbeatMisses) > 0) return false;
    if (Number(load.oldestPendingAgeMs) >= GATEWAY_STALL_PENDING_MS) return false;
    return true;
}

/**
 * 后台任务遇到这些错误说明网关/连接没有余力，应该整轮让路而不是逐个重试：
 * 让路错误、队列已满、连接断开或还没登录。
 */
function isGatewayYieldError(error: any): boolean {
    if (!error) return false;
    if (error.name === 'GatewayBusyError') return true;
    const message = String((error && error.message) || error || '');
    if (!message) return false;
    return message.includes('已让路')
        // 超时的时候还卡在队列里，说明压根没排到连接，和让路是同一回事
        || message.includes('stage=queued')
        || message.includes('请求等待队列已满')
        || message.includes('请求已中断')
        || message.includes('连接未打开')
        || message.includes('尚未登录');
}

module.exports = {
    GATEWAY_STALL_PENDING_MS,
    LOW_PRIORITY_QUEUE_WAIT_MS,
    LOW_PRIORITY_IDLE_WAIT_MAX_MS,
    LOW_PRIORITY_IDLE_POLL_MS,
    isGatewayIdleForLowPriority,
    isGatewayYieldError,
};