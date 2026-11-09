export {};

const { toNum, getServerTimeSec } = require('../../utils/utils');
const { buildPlantingLayouts } = require('./land-analysis');
const {
    buildLandMap,
    getLayoutClearMetrics,
    isQualifiedForWaiting,
    collectActive2x2Footprints,
} = require('./reservation-window');

interface PlantingLayout {
    anchorLandId: number;
    landIds: number[];
}

interface FutureLayoutReservation {
    layout: PlantingLayout;
    reservedLandIds: number[];
    /** 以下字段仅在传入 timeWindow（真实土地状态）时附加。 */
    key?: string;
    clearAt?: number;
    lockCost?: number;
}

interface ReservationTimeWindow {
    /** 本轮服务端返回的最新土地快照，用于估算清空时刻与排除已有 2×2 占地。 */
    lands: any[];
    /** 本轮全部真实空地（不限土地类型），用于清空时刻判定；不传时回退到候选空地集合。 */
    emptyLandIds?: number[];
    /** 权威服务器秒；不传时取 getServerTimeSec()。 */
    nowSec?: number;
    /** 种植失败冷却中的布局 key，跳过不重试。 */
    cooldownKeys?: Set<string>;
}

interface SelectFutureLayoutOptions {
    /** 上一轮为该种子登记的目标布局；在“预留格数不吃亏”的前提下优先沿用。 */
    registered?: PlantingLayout | null;
    /** 本轮已被其他种子占用的整组目标布局土地；与之重叠的候选布局不可选。 */
    excludeLandIds?: Iterable<number>;
    /** 老版本 60 秒资格窗口；不传时保持旧的纯几何选择行为（用于既有回归测试）。 */
    timeWindow?: ReservationTimeWindow | null;
}

// seedId -> 已登记的目标布局。每个账号运行在独立 worker 进程内，模块级状态天然按账号隔离。
const registeredLayouts = new Map<number, PlantingLayout>();

function layoutKey(layout: PlantingLayout | null | undefined): string {
    if (!layout || !Array.isArray(layout.landIds)) return '';
    return layout.landIds.map((id: any) => toNum(id)).sort((a: number, b: number) => a - b).join(',');
}

/**
 * 为暂时凑不齐的多格作物选择一组未来布局，并只预留其中当前已经空出的土地。
 *
 * 默认（不传 timeWindow）：#89 的纯几何规则 —— 已预留格数最多 → 沿用登记 → 锚点最小。
 * 传 timeWindow：对齐老版本规格 —— 排除已有 2×2 footprint，只保留 60 秒内能清空的组，
 * 按真实清空时刻 → 锁地代价 → 沿用登记 → 已空格数 → 锚点排序。
 */
function selectFutureLayoutReservation(
    currentEmptyLandIds: any[],
    allEligibleLandIds: any[],
    plantSize: number,
    options: SelectFutureLayoutOptions = {},
): FutureLayoutReservation | null {
    const size = Math.max(1, toNum(plantSize) || 1);
    if (size <= 1) return null;

    const emptyIds = new Set<number>((Array.isArray(currentEmptyLandIds) ? currentEmptyLandIds : [])
        .map((id: any) => toNum(id))
        .filter((id: number) => id > 0));
    if (emptyIds.size === 0) return null;
    if (buildPlantingLayouts([...emptyIds], size).length > 0) return null;

    const excluded = new Set<number>([...(options.excludeLandIds || [])]
        .map((id: any) => toNum(id))
        .filter((id: number) => id > 0));
    const registeredKey = layoutKey(options.registered);
    const window = options.timeWindow;
    const nowSec = window && Number.isFinite(window.nowSec) ? Number(window.nowSec) : getServerTimeSec();
    const landMap = window ? buildLandMap(window.lands) : null;
    const qualifyEmptyIds = window && Array.isArray(window.emptyLandIds)
        ? new Set<number>(window.emptyLandIds.map((id: any) => toNum(id)).filter((id: number) => id > 0))
        : emptyIds;
    const footprints = window ? collectActive2x2Footprints(window.lands, qualifyEmptyIds) : [];
    const cooldownKeys = window && window.cooldownKeys instanceof Set ? window.cooldownKeys : new Set<string>();

    let candidates = buildPlantingLayouts(allEligibleLandIds, size)
        .map((layout: PlantingLayout) => {
            const key = layoutKey(layout);
            const metrics = landMap
                ? getLayoutClearMetrics(layout.landIds, landMap, qualifyEmptyIds, nowSec)
                : null;
            return {
                layout,
                reservedLandIds: layout.landIds.filter((id: number) => emptyIds.has(id)),
                key,
                metrics,
            };
        })
        .filter((candidate: any) => (
            candidate.reservedLandIds.length > 0
            && candidate.reservedLandIds.length < candidate.layout.landIds.length
            && !candidate.layout.landIds.some((id: number) => excluded.has(id))
        ));

    if (window) {
        candidates = candidates.filter((candidate: any) => {
            if (cooldownKeys.has(candidate.key)) return false;
            if (footprints.some((footprint: Set<number>) => (
                candidate.layout.landIds.some((id: number) => footprint.has(id))
            ))) return false;
            return isQualifiedForWaiting(candidate.metrics, nowSec);
        });
    }

    candidates.sort((a: any, b: any) => {
        if (window) {
            // 老版本「最早清空优先」：按真实清空时刻，不用并列容差，避免回退到按锚点选。
            const byClearAt = a.metrics.clearAt - b.metrics.clearAt;
            if (byClearAt !== 0) return byClearAt;
            const byLockCost = a.metrics.lockCost - b.metrics.lockCost;
            if (byLockCost !== 0) return byLockCost;
            if (registeredKey) {
                const aReg = a.key === registeredKey ? 0 : 1;
                const bReg = b.key === registeredKey ? 0 : 1;
                if (aReg !== bReg) return aReg - bReg;
            }
            const byReserved = b.reservedLandIds.length - a.reservedLandIds.length;
            if (byReserved !== 0) return byReserved;
            return a.layout.anchorLandId - b.layout.anchorLandId;
        }
        const byReserved = b.reservedLandIds.length - a.reservedLandIds.length;
        if (byReserved !== 0) return byReserved;
        if (registeredKey) {
            const aReg = a.key === registeredKey ? 0 : 1;
            const bReg = b.key === registeredKey ? 0 : 1;
            if (aReg !== bReg) return aReg - bReg;
        }
        return a.layout.anchorLandId - b.layout.anchorLandId;
    });

    const winner = candidates[0];
    if (!winner) return null;
    if (!window) return { layout: winner.layout, reservedLandIds: winner.reservedLandIds };
    return {
        layout: winner.layout,
        reservedLandIds: winner.reservedLandIds,
        key: winner.key,
        clearAt: winner.metrics.clearAt,
        lockCost: winner.metrics.lockCost,
    };
}

function getRegisteredLayout(seedId: any): PlantingLayout | null {
    const layout = registeredLayouts.get(toNum(seedId));
    return layout ? { anchorLandId: layout.anchorLandId, landIds: [...layout.landIds] } : null;
}

function registerLayout(seedId: any, layout: PlantingLayout): void {
    const id = toNum(seedId);
    if (!id || !layout || !Array.isArray(layout.landIds) || layout.landIds.length === 0) return;
    registeredLayouts.set(id, { anchorLandId: layout.anchorLandId, landIds: [...layout.landIds] });
}

function clearRegisteredLayout(seedId: any): void {
    registeredLayouts.delete(toNum(seedId));
}

function resetRegisteredLayouts(): void {
    registeredLayouts.clear();
}

module.exports = {
    selectFutureLayoutReservation,
    getRegisteredLayout,
    registerLayout,
    clearRegisteredLayout,
    resetRegisteredLayouts,
    layoutKey,
};
