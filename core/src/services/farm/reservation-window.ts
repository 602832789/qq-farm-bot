export {};
/**
 * 2×2 预留时间闸门与整轮状态闸门
 *
 * 老版本（legacy planting-service.js / planting-2x2-window.test.js）设计口径：
 * - 只有「剩余植株 ≤60 秒清空（含 60）且已到末季」的组合才允许圈住空地等待；
 *   远期、未知阶段、非末季一律不预留，空地立即交回普通种植。
 * - 等待期限 = 首次圈住空地时刻 + 60 秒，用服务器时钟连续推进，轮询不续期。
 * - 期限耗尽/资格变化立即释放，并记下占用者身份防止同一停滞组合反复圈地；
 *   只有出现新的种植周期（新的播种时刻）才允许重来。
 * - 已被 2×2 作物占着的 footprint 不作为候选；候选按真实清空时刻、锁地代价排序。
 * - 种植失败按组冷却 30 秒。
 *
 * 现版本额外补的止血闸门：整轮土地状态签名不变时跳过种植分支，
 * 最多每 30 秒强制重查一次（防止背包变化被无限期忽略）。
 */

const { toNum, toTimeSec, getServerTimeSec } = require('../../utils/utils');
const { getPlantById, getPlantGrowTime } = require('../../config/gameConfig');

/** 只允许等待「这么快就能清空」的组合；含边界值。 */
const WAIT_QUALIFY_WINDOW_SEC = 60;
/** 首次预留后的硬期限；到期无条件释放，不因轮询重置。 */
const WAIT_DEADLINE_SEC = 60;
/** 同一组种植失败后的冷却。 */
const FAIL_COOLDOWN_MS = 30_000;
/** 状态完全不变时，仍要周期性重查背包/商店，避免新增种子被漏掉。 */
const PLANTING_ROUND_RECHECK_MS = 30_000;

const FAR_FUTURE = Number.MAX_SAFE_INTEGER;

interface ClearMetrics {
    clearAt: number;
    clearTimes: number[];
    lockCost: number;
    waiting: boolean;
    /** 缺阶段数据 / 无成熟阶段，无法估算清空时刻。 */
    unknown: boolean;
}

interface WindowDecision {
    allowed: boolean;
    reason: 'new' | 'active' | 'expired' | 'released';
    deadlineSec: number;
}

function buildLandMap(lands: any[]): Map<number, any> {
    const map = new Map<number, any>();
    for (const land of Array.isArray(lands) ? lands : []) {
        const id = toNum(land && land.id);
        if (id > 0) map.set(id, land);
    }
    return map;
}

function phaseBeginSec(phases: any[], phaseNo: number): number {
    const list = Array.isArray(phases) ? phases : [];
    const hit = list.find((phase: any) => toNum(phase && phase.phase) === phaseNo);
    return hit ? toTimeSec(hit.begin_time) : 0;
}

/**
 * 估算单块地清空时刻（服务器秒）。
 * 空地 = 0；缺 phases / 缺成熟阶段 = 无穷远；多季作物必须等到末季。
 */
function estimateLandClearAt(land: any, emptySet: Set<number>, nowSec: number): number {
    const landId = toNum(land && land.id);
    if (emptySet.has(landId)) return 0;

    const plant = land && land.plant;
    const phases = Array.isArray(plant && plant.phases) ? plant.phases : [];
    if (phases.length === 0) return FAR_FUTURE;

    const matureAt = phaseBeginSec(phases, 6);
    if (matureAt <= 0) return FAR_FUTURE;

    const plantId = toNum(plant.id);
    const cfg = getPlantById(plantId);
    const currentSeason = Math.max(1, toNum(plant.season) || 1);
    const totalSeasons = Math.max(currentSeason, toNum(cfg && cfg.seasons) || currentSeason);
    const remainingSeasons = Math.max(0, totalSeasons - currentSeason);
    const growSeconds = Math.max(0, toNum(getPlantGrowTime(plantId)));

    return Math.max(nowSec, matureAt) + remainingSeasons * growSeconds;
}

function getLayoutClearMetrics(
    landIds: number[],
    landMap: Map<number, any>,
    emptySet: Set<number>,
    nowSec: number,
): ClearMetrics {
    const clearTimes = landIds.map(id => estimateLandClearAt(landMap.get(id), emptySet, nowSec));
    const clearAt = Math.max(...clearTimes);
    const unknown = clearAt >= FAR_FUTURE;
    const lockCost = unknown
        ? FAR_FUTURE
        : clearTimes.reduce((sum, time) => {
            const normalized = time === 0 ? nowSec : time;
            return Math.min(FAR_FUTURE, sum + Math.max(0, clearAt - normalized));
        }, 0);
    return {
        clearAt,
        clearTimes,
        lockCost,
        waiting: !landIds.every(id => emptySet.has(id)),
        unknown,
    };
}

/** 等待组是否落在 60 秒资格窗口内（完全空闲组恒为 true）。 */
function isQualifiedForWaiting(metrics: ClearMetrics, nowSec: number): boolean {
    if (!metrics.waiting) return true;
    return !metrics.unknown && metrics.clearAt - nowSec <= WAIT_QUALIFY_WINDOW_SEC;
}

/** 已被 2×2 作物占据的 footprint；全部落在空地里的残留 footprint 不算占用。 */
function collectActive2x2Footprints(lands: any[], emptySet: Set<number>): Set<number>[] {
    const footprints: Set<number>[] = [];
    for (const land of Array.isArray(lands) ? lands : []) {
        const masterId = toNum(land && land.id);
        const slaves = Array.isArray(land && land.slave_land_ids)
            ? land.slave_land_ids.map(toNum).filter((id: number) => id > 0)
            : [];
        if (slaves.length !== 3) continue;
        const ids = new Set<number>([masterId, ...slaves].filter((id: number) => id > 0));
        if ([...ids].every(id => emptySet.has(id))) continue;
        footprints.push(ids);
    }
    return footprints;
}

/**
 * 占用者身份：只认「播种时刻」，不认预测成熟时刻。
 * 老版本规格：成熟时刻抖动不算新周期；收割让表变短也不算；重种才是新周期。
 */
function occupantIdentity(land: any): string {
    const plant = land && land.plant;
    const phases = Array.isArray(plant && plant.phases) ? plant.phases : [];
    return [
        toNum(plant && plant.id),
        toNum(plant && plant.season) || 1,
        phaseBeginSec(phases, 1),
    ].join(':');
}

function occupantsOf(
    landIds: number[],
    landMap: Map<number, any>,
    emptySet: Set<number>,
): Map<number, string> {
    const map = new Map<number, string>();
    for (const id of landIds) {
        if (emptySet.has(id)) continue;
        map.set(id, occupantIdentity(landMap.get(id)));
    }
    return map;
}

function isNewPlantingCycle(previous: Map<number, string>, current: Map<number, string>): boolean {
    for (const [id, identity] of current) {
        if (previous.get(id) !== identity) return true;
    }
    return false;
}

/**
 * 单个等待组的硬期限状态机。每个账号跑在独立 worker 进程，模块级实例天然隔离。
 * 调用方在「准备圈住空地」前 evaluate，在「资格变化/整组已可种」时 release。
 */
function createReservationWindow() {
    // 按组独立记账：同一轮可能出现多个等待组，不能让后一组重置前一组的期限。
    const active = new Map<string, number>();          // key -> deadlineSec
    const released = new Map<string, Map<number, string>>(); // key -> 占用者身份

    function evaluate(
        key: string,
        occupants: Map<number, string>,
        nowSec: number = getServerTimeSec(),
    ): WindowDecision {
        const releasedOccupants = released.get(key);
        if (releasedOccupants) {
            if (!isNewPlantingCycle(releasedOccupants, occupants)) {
                return { allowed: false, reason: 'released', deadlineSec: 0 };
            }
            released.delete(key);
        }
        const deadlineSec = active.get(key);
        if (deadlineSec === undefined) {
            const next = nowSec + WAIT_DEADLINE_SEC;
            active.set(key, next);
            return { allowed: true, reason: 'new', deadlineSec: next };
        }
        if (nowSec > deadlineSec) {
            released.set(key, occupants);
            active.delete(key);
            return { allowed: false, reason: 'expired', deadlineSec: 0 };
        }
        return { allowed: true, reason: 'active', deadlineSec };
    }

    /** 资格变化或整组已清空时主动释放，并记录占用者身份防止立刻重圈。 */
    function release(key: string, occupants: Map<number, string> = new Map()): void {
        active.delete(key);
        released.set(key, occupants);
    }

    /** 本轮没有合格候选时，把正在等待的组转成释放态（不再续期、不再圈地）。 */
    function invalidate(occupants: Map<number, string> = new Map()): void {
        for (const key of active.keys()) released.set(key, occupants);
        active.clear();
    }

    function activeKeys(): string[] {
        return [...active.keys()];
    }

    /** 有等待组已经越过硬期限：整轮状态闸门必须放行，让调用方立即释放空地。 */
    function hasExpiredWindow(nowSec: number = getServerTimeSec()): boolean {
        for (const deadlineSec of active.values()) {
            if (nowSec > deadlineSec) return true;
        }
        return false;
    }

    function clear(): void {
        active.clear();
        released.clear();
    }

    function snapshot(): any {
        return {
            active: [...active].map(([key, deadlineSec]) => ({ key, deadlineSec })),
            released: [...released].map(([key, occupants]) => ({ key, occupants: [...occupants] })),
        };
    }

    return { evaluate, release, invalidate, activeKeys, hasExpiredWindow, clear, snapshot };
}

function createFailureCooldown() {
    const until = new Map<string, number>();
    let lastPruneMs = 0;

    function mark(key: string, nowMs: number = Date.now()): void {
        until.set(key, nowMs + FAIL_COOLDOWN_MS);
    }
    function isBlocked(key: string, nowMs: number = Date.now()): boolean {
        return (until.get(key) || 0) > nowMs;
    }
    function prune(nowMs: number = Date.now()): void {
        if (nowMs - lastPruneMs < FAIL_COOLDOWN_MS) return;
        lastPruneMs = nowMs;
        for (const [key, deadline] of until) {
            if (deadline <= nowMs) until.delete(key);
        }
    }
    function blockedKeys(nowMs: number = Date.now()): Set<string> {
        const keys = new Set<string>();
        for (const [key, deadline] of until) {
            if (deadline > nowMs) keys.add(key);
        }
        return keys;
    }
    function clear(): void {
        until.clear();
        lastPruneMs = 0;
    }
    return { mark, isBlocked, prune, blockedKeys, clear, size: () => until.size };
}

/**
 * 整轮土地状态签名。刻意只使用「固定时间戳」而非「剩余秒数」，
 * 保证同一作物周期内签名稳定；成熟时刻抖动会放行一次，属于可接受的保守行为。
 */
function buildPlantingRoundSignature(
    landsToPlant: any[],
    allUnlockedLandIds: any[],
    lands: any[],
): string {
    const empty = [...new Set<number>((Array.isArray(landsToPlant) ? landsToPlant : [])
        .map((id: any) => toNum(id)).filter((id: number) => id > 0))].sort((a, b) => a - b).join(',');
    const unlocked = [...new Set<number>((Array.isArray(allUnlockedLandIds) ? allUnlockedLandIds : [])
        .map((id: any) => toNum(id)).filter((id: number) => id > 0))].sort((a, b) => a - b).join(',');
    const occupied = (Array.isArray(lands) ? lands : [])
        .map((land: any) => {
            const id = toNum(land && land.id);
            const plant = land && land.plant;
            const phases = Array.isArray(plant && plant.phases) ? plant.phases : [];
            return [
                id,
                toNum(plant && plant.id),
                toNum(plant && plant.season),
                phaseBeginSec(phases, 1),
                phaseBeginSec(phases, 6),
                Array.isArray(land && land.slave_land_ids) ? land.slave_land_ids.length : 0,
            ].join(':');
        })
        .sort()
        .join('|');
    return `empty=${empty}|unlocked=${unlocked}|lands=${occupied}`;
}

/** 状态不变时跳过整轮种植分支；每 RECHECK 周期强制放行一次。 */
function createPlantingRoundGate() {
    let last: { signature: string; atMs: number; result: any } | null = null;

    function shouldSkip(signature: string, nowMs: number = Date.now()): boolean {
        if (!last || last.signature !== signature) return false;
        return nowMs - last.atMs < PLANTING_ROUND_RECHECK_MS;
    }
    function cached(signature: string, nowMs: number = Date.now()): any {
        if (!last || last.signature !== signature) return null;
        if (nowMs - last.atMs >= PLANTING_ROUND_RECHECK_MS) return null;
        return last.result;
    }
    function commit(signature: string, result: any, nowMs: number = Date.now()): void {
        const planted = Array.isArray(result && result.plantedLandIds) ? result.plantedLandIds.length : 0;
        if (planted > 0) {
            last = null;
            return;
        }
        last = { signature, atMs: nowMs, result };
    }
    function clear(): void { last = null; }
    function snapshot(): any { return last ? { ...last } : null; }

    return { shouldSkip, cached, commit, clear, snapshot };
}

module.exports = {
    WAIT_QUALIFY_WINDOW_SEC,
    WAIT_DEADLINE_SEC,
    FAIL_COOLDOWN_MS,
    PLANTING_ROUND_RECHECK_MS,
    FAR_FUTURE,
    buildLandMap,
    estimateLandClearAt,
    getLayoutClearMetrics,
    isQualifiedForWaiting,
    collectActive2x2Footprints,
    occupantIdentity,
    occupantsOf,
    isNewPlantingCycle,
    createReservationWindow,
    createFailureCooldown,
    buildPlantingRoundSignature,
    createPlantingRoundGate,
};
