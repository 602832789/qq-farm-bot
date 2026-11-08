export {};
/**
 * 种植诊断日志节流。
 *
 * 「背包种子执行顺序 / 布局检查 / 预留空地」这几条日志每轮巡查都会输出，
 * 状态没变化时内容完全相同，会在运行日志里刷屏。这里按 key + 状态签名
 * 在窗口内只放行一次，被拦下的次数累加，下一次放行时附带在文案里，
 * 既压掉重复日志，也不丢「这段时间重复了多少轮」的诊断信息。
 */

const PLANTING_LOG_THROTTLE_WINDOW_MS = 5 * 60 * 1000;

interface ThrottleEntry {
    signature: string;
    lastEmitAt: number;
    suppressed: number;
}

interface ThrottleDecision {
    emit: boolean;
    suppressed: number;
}

function createPlantingLogThrottle(windowMs: number = PLANTING_LOG_THROTTLE_WINDOW_MS) {
    const window: number = Math.max(1000, Number(windowMs) || PLANTING_LOG_THROTTLE_WINDOW_MS);
    const entries = new Map<string, ThrottleEntry>();

    return {
        /** 状态变化或超过窗口时放行；否则累计重复次数并返回 emit=false。 */
        check(key: string, signature: string, now: number = Date.now()): ThrottleDecision {
            const stamp: number = Number.isFinite(now) ? now : Date.now();
            const previous = entries.get(key);
            if (!previous || previous.signature !== signature || stamp - previous.lastEmitAt >= window) {
                const suppressed = previous && previous.signature === signature ? previous.suppressed : 0;
                entries.set(key, { signature, lastEmitAt: stamp, suppressed: 0 });
                return { emit: true, suppressed };
            }
            previous.suppressed += 1;
            return { emit: false, suppressed: previous.suppressed };
        },
        reset(): void {
            entries.clear();
        },
    };
}

function suppressedSuffix(count: number): string {
    return count > 0 ? `（同样状态重复 ${count} 次，已合并）` : '';
}

module.exports = {
    PLANTING_LOG_THROTTLE_WINDOW_MS,
    createPlantingLogThrottle,
    suppressedSuffix,
};
