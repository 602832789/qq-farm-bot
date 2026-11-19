export {};

/**
 * 心跳保活判定策略（纯函数，可单测）。
 *
 * 现场故障形态：网关突然对所有请求不回包（连接不断开、也不报错），本地 pending
 * 一路堆积，心跳同样收不到回包，最终连判 3 次 miss 才下线，前后要 95s。
 * 这 95s 里所有业务请求都在陪着死等，日志刷满「请求超时」，看不出根因。
 *
 * 这里保留原来的三连判据（miss 计数 + 30s 静默），另外补一条「极端静默」判据：
 * 只要连续 2 次心跳失败且已经整整 60s 没有任何入站数据，就不必再等第三次。
 * 空闲期靠心跳回包维持入站计时，所以 60s 全静默基本只有断流一种解释。
 */

const HEARTBEAT_STALE_AFTER_MS = 30000;
const MAX_HEARTBEAT_MISSES = 3;

/** 极端静默：连续失败次数达到这个值 + 这么久没有任何入站数据，直接判定连接已死。 */
const HEARTBEAT_DEAD_MISSES = 2;
const HEARTBEAT_DEAD_SILENCE_MS = 60000;

function shouldTerminateForHeartbeat(missCount: number, inboundSilenceMs: number): boolean {
    return Number(missCount) >= MAX_HEARTBEAT_MISSES
        && Number(inboundSilenceMs) > HEARTBEAT_STALE_AFTER_MS;
}

/**
 * 极端静默判据：连接一条入站数据都没有了，心跳也连续失败。
 * 与 {@link shouldTerminateForHeartbeat} 取并集使用。
 */
function shouldTerminateForSilence(missCount: number, inboundSilenceMs: number): boolean {
    return Number(missCount) >= HEARTBEAT_DEAD_MISSES
        && Number(inboundSilenceMs) > HEARTBEAT_DEAD_SILENCE_MS;
}

module.exports = {
    HEARTBEAT_STALE_AFTER_MS,
    HEARTBEAT_DEAD_MISSES,
    HEARTBEAT_DEAD_SILENCE_MS,
    MAX_HEARTBEAT_MISSES,
    shouldTerminateForHeartbeat,
    shouldTerminateForSilence,
};
