export {};
/**
 * 土地分析 - 纯分析函数 + 阶段/生命周期
 */

const { PlantPhase, PHASE_NAMES } = require('../../config/config');
const { getPlantName, getPlantExp } = require('../../config/gameConfig');
const { toNum, toTimeSec, getServerTimeSec, log, logWarn } = require('../../utils/utils');

function getCurrentPhase(phases: any[], debug?: boolean, landLabel?: string): any | null {
    if (!phases || phases.length === 0) return null;

    const nowSec: number = getServerTimeSec();

    if (debug) {
        console.warn(`    ${landLabel} 服务器时间=${nowSec} (${new Date(nowSec * 1000).toLocaleTimeString()})`);
        for (let i = 0; i < phases.length; i++) {
            const p = phases[i];
            const bt = toTimeSec(p.begin_time);
            const phaseName = PHASE_NAMES[p.phase] || `阶段${p.phase}`;
            const diff = bt > 0 ? (bt - nowSec) : 0;
            const diffStr = diff > 0 ? `(未来 ${diff}s)` : diff < 0 ? `(已过 ${-diff}s)` : '';
            console.warn(`    ${landLabel}   [${i}] ${phaseName}(${p.phase}) begin=${bt} ${diffStr} dry=${toTimeSec(p.dry_time)} weed=${toTimeSec(p.weeds_time)} insect=${toTimeSec(p.insect_time)}`);
        }
    }

    for (let i = phases.length - 1; i >= 0; i--) {
        const beginTime = toTimeSec(phases[i].begin_time);
        if (beginTime > 0 && beginTime <= nowSec) {
            if (debug) {
                console.warn(`    ${landLabel}   → 当前阶段: ${PHASE_NAMES[phases[i].phase] || phases[i].phase}`);
            }
            return phases[i];
        }
    }

    if (debug) {
        console.warn(`    ${landLabel}   → 所有阶段都在未来，使用第一个: ${PHASE_NAMES[phases[0].phase] || phases[0].phase}`);
    }
    return phases[0];
}

function getOrganicFertilizerTargetsFromLands(lands: any[]): number[] {
    const list: any[] = Array.isArray(lands) ? lands : [];
    const targets: number[] = [];
    for (const land of list) {
        if (!land || !land.unlocked) continue;
        const landId = toNum(land.id);
        if (!landId) continue;

        const plant = land.plant;
        if (!plant || !plant.phases || plant.phases.length === 0) continue;
        const currentPhase = getCurrentPhase(plant.phases);
        if (!currentPhase) continue;
        if (currentPhase.phase === PlantPhase.DEAD) continue;

        // 服务端有该字段时，<=0 说明该地当前不能再施有机肥
        if (Object.prototype.hasOwnProperty.call(plant, 'left_inorc_fert_times')) {
            const leftTimes = toNum(plant.left_inorc_fert_times);
            if (leftTimes <= 0) continue;
        }

        targets.push(landId);
    }
    return targets;
}

function getFastMatureLands(lands: any[], thresholdSec: number = 300): number[] {
    const list: any[] = Array.isArray(lands) ? lands : [];
    const targets: number[] = [];
    const nowSec: number = getServerTimeSec();
    const threshold: number = Math.max(0, toNum(thresholdSec) || 300);

    for (const land of list) {
        if (!land || !land.unlocked) continue;
        const landId = toNum(land.id);
        if (!landId) continue;

        const plant = land.plant;
        if (!plant || !plant.phases || plant.phases.length === 0) continue;
        const currentPhase = getCurrentPhase(plant.phases);
        if (!currentPhase) continue;
        if (currentPhase.phase === PlantPhase.DEAD) continue;
        if (currentPhase.phase === PlantPhase.MATURE) continue;

        const maturePhase = plant.phases.find((p: any) => toNum(p.phase) === PlantPhase.MATURE);
        if (!maturePhase) continue;

        const matureBeginTime = toTimeSec(maturePhase.begin_time);
        if (matureBeginTime <= 0) continue;

        const timeToMature = matureBeginTime - nowSec;

        if (timeToMature <= threshold && timeToMature >= 0) {
            if (Object.prototype.hasOwnProperty.call(plant, 'left_inorc_fert_times')) {
                const leftTimes = toNum(plant.left_inorc_fert_times);
                if (leftTimes <= 0) continue;
            }
            targets.push(landId);
        }
    }
    return targets;
}

function getSlaveLandIds(land: any): number[] {
    const ids: any[] = Array.isArray(land && land.slave_land_ids) ? land.slave_land_ids : [];
    return [...new Set(ids.map((id: any) => toNum(id)).filter(Boolean))];
}

function hasPlantData(land: any): boolean {
    const plant = land && land.plant;
    return !!(plant && Array.isArray(plant.phases) && plant.phases.length > 0);
}

function getLinkedMasterLand(land: any, landsMap: Map<number, any>): any | null {
    const landId = toNum(land && land.id);
    const masterLandId = toNum(land && land.master_land_id);
    if (!masterLandId || masterLandId === landId) return null;

    const masterLand = landsMap.get(masterLandId);
    if (!masterLand) return null;

    const slaveIds = getSlaveLandIds(masterLand);
    if (slaveIds.length > 0 && !slaveIds.includes(landId)) return null;

    return masterLand;
}

function getDisplayLandContext(land: any, landsMap: Map<number, any>): {
    sourceLand: any;
    occupiedByMaster: boolean;
    masterLandId: number;
    occupiedLandIds: number[];
} {
    const masterLand = getLinkedMasterLand(land, landsMap);
    if (masterLand && hasPlantData(masterLand)) {
        const occupiedLandIds = [toNum(masterLand.id), ...getSlaveLandIds(masterLand)].filter(Boolean);
        return {
            sourceLand: masterLand,
            occupiedByMaster: true,
            masterLandId: toNum(masterLand.id),
            occupiedLandIds: occupiedLandIds.length > 0 ? occupiedLandIds : [toNum(masterLand.id)].filter(Boolean),
        };
    }

    const selfId = toNum(land && land.id);
    return {
        sourceLand: land,
        occupiedByMaster: false,
        masterLandId: selfId,
        occupiedLandIds: [selfId].filter(Boolean),
    };
}

function isOccupiedSlaveLand(land: any, landsMap: Map<number, any>): boolean {
    return !!getDisplayLandContext(land, landsMap).occupiedByMaster;
}

function buildSlaveToMasterMap(lands: any[]): Map<number, number> {
    const map = new Map<number, number>();
    for (const land of (Array.isArray(lands) ? lands : [])) {
        const slaveIds = getSlaveLandIds(land);
        const masterId = toNum(land && land.id);
        if (slaveIds.length > 0 && masterId > 0) {
            for (const slaveId of slaveIds) {
                if (slaveId > 0 && slaveId !== masterId) {
                    map.set(slaveId, masterId);
                }
            }
        }
    }
    return map;
}

function isOccupiedSlaveLandWithMap(land: any, landsMap: Map<number, any>, slaveToMasterMap: Map<number, number>): boolean {
    const landId = toNum(land && land.id);
    if (!landId) return false;
    return slaveToMasterMap.has(landId);
}

function summarizeLandDetails(lands: any[]): {
    harvestable: number;
    growing: number;
    empty: number;
    dead: number;
    needWater: number;
    needWeed: number;
    needBug: number;
} {
    const summary = {
        harvestable: 0,
        growing: 0,
        empty: 0,
        dead: 0,
        needWater: 0,
        needWeed: 0,
        needBug: 0,
    };

    for (const land of Array.isArray(lands) ? lands : []) {
        if (!land || !land.unlocked) continue;

        const status = String(land.status || '');
        if (status === 'harvestable') summary.harvestable++;
        else if (status === 'dead') summary.dead++;
        else if (status === 'empty') summary.empty++;
        else if (status === 'growing' || status === 'stealable' || status === 'harvested') summary.growing++;

        if (land.needWater) summary.needWater++;
        if (land.needWeed) summary.needWeed++;
        if (land.needBug) summary.needBug++;
    }

    return summary;
}

const ALL_FERTILIZER_LAND_TYPES: string[] = ['purple-gold', 'gold', 'black', 'red', 'normal'];
const FERTILIZER_LAND_TYPE_LABELS: Record<string, string> = {
    'purple-gold': '紫金土地',
    gold: '金土地',
    black: '黑土地',
    red: '红土地',
    normal: '普通土地',
};

function getLandTypeByLevel(level: number | any): string {
    const lv = toNum(level);
    if (lv >= 5) return 'purple-gold';
    if (lv === 4) return 'gold';
    if (lv === 3) return 'black';
    if (lv === 2) return 'red';
    return 'normal';
}

function normalizeFertilizerLandTypes(input: any[] | undefined | null): string[] {
    const source: any[] = Array.isArray(input) ? input : ALL_FERTILIZER_LAND_TYPES;
    const result: string[] = [];
    for (const item of source) {
        const value = String(item || '').trim().toLowerCase();
        if (!ALL_FERTILIZER_LAND_TYPES.includes(value)) continue;
        if (result.includes(value)) continue;
        result.push(value);
    }
    return result;
}

function filterLandIdsByTypes(landIds: number[], landTypeById: Map<number, string>, selectedTypes: any[]): number[] {
    const ids: number[] = Array.isArray(landIds) ? landIds : [];
    const selected = new Set(normalizeFertilizerLandTypes(selectedTypes));
    if (selected.size === 0) return [];
    if (selected.size === ALL_FERTILIZER_LAND_TYPES.length) return [...ids];

    const filtered: number[] = [];
    for (const id of ids) {
        const type = String(landTypeById.get(id) || '');
        if (!type) continue;
        if (selected.has(type)) filtered.push(id);
    }
    return filtered;
}

function formatFertilizerLandTypes(types: any[] | undefined | null): string[] {
    return normalizeFertilizerLandTypes(types).map(type => FERTILIZER_LAND_TYPE_LABELS[type] || type);
}

function analyzeLands(lands: any[], debug?: boolean, ownGid?: number): {
    harvestable: number[];
    needWater: number[];
    needWeed: number[];
    needBug: number[];
    growing: number[];
    empty: number[];
    dead: number[];
    unlockable: number[];
    upgradable: number[];
    harvestableInfo: any[];
} {
    const result = {
        harvestable: [] as number[],
        needWater: [] as number[],
        needWeed: [] as number[],
        needBug: [] as number[],
        growing: [] as number[],
        empty: [] as number[],
        dead: [] as number[],
        unlockable: [] as number[],
        upgradable: [] as number[],
        harvestableInfo: [] as any[],
    };

    const nowSec: number = getServerTimeSec();
    const landsMap = buildLandMap(lands);

    for (const land of lands) {
        const id = toNum(land.id);
        if (!land.unlocked) {
            if (land.could_unlock) {
                result.unlockable.push(id);
            }
            continue;
        }
        if (land.could_upgrade) {
            result.upgradable.push(id);
        }

        if (isOccupiedSlaveLand(land, landsMap)) {
            continue;
        }

        const plant = land.plant;
        if (!plant || !plant.phases || plant.phases.length === 0) {
            result.empty.push(id);
            continue;
        }

        const plantName = plant.name || '未知作物';
        const landLabel = `土地#${id}(${plantName})`;

        const currentPhase = getCurrentPhase(plant.phases, debug, landLabel);
        if (!currentPhase) {
            result.empty.push(id);
            continue;
        }
        const phaseVal = currentPhase.phase;

        if (phaseVal === PlantPhase.DEAD) {
            result.dead.push(id);
            continue;
        }

        if (phaseVal === PlantPhase.MATURE) {
            result.harvestable.push(id);
            const plantId = toNum(plant.id);
            const plantNameFromConfig = getPlantName(plantId);
            const plantExp = getPlantExp(plantId);
            result.harvestableInfo.push({
                landId: id,
                plantId,
                name: plantNameFromConfig || plantName,
                exp: plantExp,
            });
            continue;
        }

        const dryNum = toNum(plant.dry_num);
        const dryTime = toTimeSec(currentPhase.dry_time);
        if (dryNum > 0 || (dryTime > 0 && dryTime <= nowSec)) {
            result.needWater.push(id);
        }

        const weedsTime = toTimeSec(currentPhase.weeds_time);
        let hasWeeds = weedsTime > 0 && weedsTime <= nowSec;
        if (!hasWeeds && plant.weed_owners && plant.weed_owners.length > 0) {
            // 如果指定了 ownGid，检查是否只有自己放的草
            if (ownGid) {
                const isOwnWeeds = plant.weed_owners.every((id: any) => toNum(id) === ownGid);
                hasWeeds = !isOwnWeeds; // 只有自己放的草 → 不需要除
            } else {
                hasWeeds = true;
            }
        }
        if (hasWeeds) {
            result.needWeed.push(id);
        }

        const insectTime = toTimeSec(currentPhase.insect_time);
        let hasBugs = insectTime > 0 && insectTime <= nowSec;
        if (!hasBugs && plant.insect_owners && plant.insect_owners.length > 0) {
            // 如果指定了 ownGid，检查是否只有自己放的虫
            if (ownGid) {
                const isOwnBugs = plant.insect_owners.every((id: any) => toNum(id) === ownGid);
                hasBugs = !isOwnBugs; // 只有自己放的虫 → 不需要除
            } else {
                hasBugs = true;
            }
        }
        if (hasBugs) {
            result.needBug.push(id);
        }

        result.growing.push(id);
    }

    return result;
}

function buildLandMap(lands: any[] | undefined | null): Map<number, any> {
    const map = new Map<number, any>();
    const list: any[] = Array.isArray(lands) ? lands : [];
    for (const land of list) {
        const id = toNum(land && land.id);
        if (id > 0) map.set(id, land);
    }
    return map;
}

function getLandLifecycleState(land: any): string {
    if (!land) return 'unknown';
    const plant = land.plant;
    if (!plant || !Array.isArray(plant.phases) || plant.phases.length === 0) {
        return 'empty';
    }

    const currentPhase = getCurrentPhase(plant.phases, false, '');
    if (!currentPhase) return 'empty';

    const phaseVal = toNum(currentPhase.phase);
    if (phaseVal === PlantPhase.DEAD) return 'dead';
    if (phaseVal === PlantPhase.UNKNOWN) return 'empty';
    if (phaseVal >= PlantPhase.SEED && phaseVal <= PlantPhase.MATURE) return 'growing';
    return 'unknown';
}

function classifyHarvestedLandsByMap(landIds: number[], landsMap: Map<number, any>): {
    removable: number[];
    growing: number[];
    unknown: number[];
} {
    const removable: number[] = [];
    const growing: number[] = [];
    const unknown: number[] = [];
    for (const id of landIds) {
        const land = landsMap.get(id);
        if (!land) {
            unknown.push(id);
            continue;
        }
        const state = getLandLifecycleState(land);
        if (state === 'dead' || state === 'empty') {
            removable.push(id);
            continue;
        }
        if (state === 'growing') {
            growing.push(id);
            continue;
        }
        unknown.push(id);
    }
    return { removable, growing, unknown };
}

async function resolveRemovableHarvestedLands(harvestedLandIds: number[], harvestReply: any): Promise<{
    removable: number[];
    growing: number[];
    fallbackRemoved: number;
}> {
    const ids: number[] = Array.isArray(harvestedLandIds) ? harvestedLandIds.filter(Boolean) : [];
    if (ids.length === 0) {
        return { removable: [], growing: [], fallbackRemoved: 0 };
    }

    const replyMap = buildLandMap(harvestReply && harvestReply.land);
    const firstPass = classifyHarvestedLandsByMap(ids, replyMap);
    const removable: number[] = [...firstPass.removable];
    const growing: number[] = [...firstPass.growing];
    let unknown: number[] = [...firstPass.unknown];
    let fallbackRemoved: number = 0;

    if (unknown.length > 0) {
        try {
            // 注意：这里需要动态引入 getAllLands 以避免循环依赖
            const { getAllLands } = require('./api');
            const latestLandsReply = await getAllLands();
            const latestMap = buildLandMap(latestLandsReply && latestLandsReply.lands);
            const secondPass = classifyHarvestedLandsByMap(unknown, latestMap);
            removable.push(...secondPass.removable);
            growing.push(...secondPass.growing);
            unknown = secondPass.unknown;
        } catch (e: any) {
            logWarn('农场', `收后状态补拉失败: ${e.message}`, {
                module: 'farm',
                event: '收获后状态补拉',
                result: 'error',
            });
        }
    }

    if (unknown.length > 0) {
        // 按兼容策略：不可判定时保持旧行为，继续铲除
        removable.push(...unknown);
        fallbackRemoved = unknown.length;
    }

    return {
        removable: [...new Set(removable)],
        growing: [...new Set(growing)],
        fallbackRemoved,
    };
}

module.exports = {
    getCurrentPhase,
    getOrganicFertilizerTargetsFromLands,
    getFastMatureLands,
    getSlaveLandIds,
    hasPlantData,
    getLinkedMasterLand,
    getDisplayLandContext,
    isOccupiedSlaveLand,
    buildSlaveToMasterMap,
    isOccupiedSlaveLandWithMap,
    summarizeLandDetails,
    getLandTypeByLevel,
    normalizeFertilizerLandTypes,
    filterLandIdsByTypes,
    formatFertilizerLandTypes,
    analyzeLands,
    buildLandMap,
    getLandLifecycleState,
    classifyHarvestedLandsByMap,
    resolveRemovableHarvestedLands,
};
