/**
 * 拜访好友策略 - 访问逻辑、好友分析、错误处理、安静时段
 */

const { CONFIG, PlantPhase, PHASE_NAMES } = require('../../config/config');
const { getPlantName, getPlantById, getSeedImageBySeedId, getPlantGrowTime } = require('../../config/gameConfig');
const {
    isAutomationOn,
    getFriendQuietHours,
    getFriendBlacklist,
    getPlantBlacklist,
    getFriendsListCacheTtlSec,
} = require('../../models/store');
const { getUserState } = require('../../utils/network');
const { toNum, toLong, toTimeSec, getServerTimeSec, log, logWarn, sleep, randomDelay } = require('../../utils/utils');
const { types } = require('../../utils/proto');
const { getCurrentPhase, buildLandMap, getDisplayLandContext, isOccupiedSlaveLand } = require('../farm');
const { recordOperation } = require('../stats');
const { sellAllFruits } = require('../warehouse');
const {
    getAllFriends,
    enterFriendFarm,
    leaveFriendFarm,
    helpFarming,
    stealHarvest,
    putInsects,
    putWeeds,
    putInsectsDetailed,
    putWeedsDetailed,
    checkCanOperateRemote,
} = require('./api');
const {
    postToMaster,
    removeKnownFriendGid,
} = require('./gid-manager');

// 延迟引用 scheduler 模块，避免循环依赖
let _scheduler: any = null;
function schedulerRef(): any {
    if (!_scheduler) _scheduler = require('./scheduler');
    return _scheduler;
}

// ============ 内部状态 ============
let friendsListCache: any[] | null = null;
let friendsListCacheTime: number = 0;

function getFriendsListCacheTtlMs(): number {
    const sec: number = Number(getFriendsListCacheTtlSec ? getFriendsListCacheTtlSec() : 0);
    if (!Number.isFinite(sec) || sec <= 0) return 60 * 1000;
    return Math.max(10 * 1000, sec * 1000);
}

// ============ 错误处理 ============

function isEnterFarmBannedError(error: any): boolean {
    const message: string = String((error && error.message) || error || '');
    if (!message) return false;
    return message.includes('1002003');
}

function parseRpcErrorCode(error: any): number {
    const message: string = String((error && error.message) || error || '');
    const match: RegExpMatchArray | null = message.match(/code=(\d+)/i);
    return match ? (Number.parseInt(match[1], 10) || 0) : 0;
}

function isTransientNetworkError(error: any): boolean {
    const message: string = String((error && error.message) || error || '');
    if (!message) return false;
    return [
        '连接未打开',
        '请求超时',
        '请求已中断',
        '连接关闭',
        '连接已在加密途中关闭',
        'worker exited',
    ].some(keyword => message.includes(keyword));
}

function isInvalidFriendAccessError(error: any): boolean {
    const message: string = String((error && error.message) || error || '');
    if (!message || isEnterFarmBannedError(error) || isTransientNetworkError(error)) {
        return false;
    }

    const lowerMessage: string = message.toLowerCase();
    const hasInvalidKeyword: boolean = [
        '无效',
        '不存在',
        '删除',
        '关系',
        'not found',
        'invalid',
        'not friend',
        'friend',
    ].some(keyword => lowerMessage.includes(keyword.toLowerCase()));

    return hasInvalidKeyword && parseRpcErrorCode(error) > 0;
}

function addFriendToBlacklist(friendGid: any, friendName: string, reason: string = ''): boolean {
    const gid: number = toNum(friendGid);
    if (!gid) return false;
    const accountId: string = process.env.FARM_ACCOUNT_ID || '';
    const currentList: any = getFriendBlacklist(accountId);
    const current: number[] = Array.isArray(currentList) ? currentList : [];
    if (current.includes(gid)) return false;

    const sent: boolean = postToMaster({
        type: 'friend_blacklist_add',
        gid,
        friendName: friendName || `GID:${gid}`,
        reason: String(reason || ''),
    });
    if (!sent) return false;

    logWarn('好友', `检测到封禁好友，已自动加入黑名单: ${friendName || `GID:${gid}`}`, {
        module: 'friend',
        event: '加黑名单',
        result: 'auto_blocked',
        friendName: friendName || `GID:${gid}`,
        friendGid: gid,
        reason: String(reason || ''),
    });
    return true;
}

export function handleFriendEnterError(friendGid: any, friendName: string, error: any): { handled: boolean; kind: string } {
    const gid: number = toNum(friendGid);
    const displayName: string = String(friendName || '').trim() || `GID:${gid}`;
    const reason: string = String((error && error.message) || error || '');
    if (isEnterFarmBannedError(error)) {
        addFriendToBlacklist(gid, displayName, reason);
        return { handled: true, kind: 'blacklist' };
    }
    if (isInvalidFriendAccessError(error)) {
        removeKnownFriendGid(gid, displayName, reason);
        return { handled: true, kind: 'invalid_removed' };
    }
    return { handled: false, kind: 'error' };
}

// ============ 安静时段 ============

export function parseTimeToMinutes(timeStr: string): number | null {
    const m: RegExpMatchArray | null = String(timeStr || '').match(/^(\d{1,2}):(\d{1,2})$/);
    if (!m) return null;
    const h: number = Number.parseInt(m[1], 10);
    const min: number = Number.parseInt(m[2], 10);
    if (Number.isNaN(h) || Number.isNaN(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
}

export function inFriendQuietHours(now: Date = new Date()): boolean {
    const cfg: any = getFriendQuietHours();
    if (!cfg || !cfg.enabled) return false;

    const start: number | null = parseTimeToMinutes(cfg.start);
    const end: number | null = parseTimeToMinutes(cfg.end);
    if (start === null || end === null) return false;

    const cur: number = now.getHours() * 60 + now.getMinutes();
    if (start === end) return true; // 起止相同视为全天静默
    if (start < end) return cur >= start && cur < end;
    return cur >= start || cur < end; // 跨天时段
}

// ============ 好友土地分析 ============

interface AnalyzeResult {
    stealable: number[];
    stealableInfo: any[];
    needWater: number[];
    needWeed: number[];
    needBug: number[];
    canPutWeed: number[];
    canPutBug: number[];
}

interface AnalyzeOptions {
    plantBlacklist?: number[] | null;
}

export function analyzeFriendLands(lands: any[], myGid: number, friendName: string = '', options: AnalyzeOptions = {}): AnalyzeResult {
    const { plantBlacklist = null } = options;
    const result: AnalyzeResult = {
        stealable: [],   // 可偷
        stealableInfo: [],  // 可偷植物信息 { landId, plantId, name }
        needWater: [],   // 需要浇水
        needWeed: [],    // 需要除草
        needBug: [],     // 需要除虫
        canPutWeed: [],  // 可以放草
        canPutBug: [],   // 可以放虫
    };
    const landsMap: any = buildLandMap(lands);

    for (const land of lands) {
        const id: number = toNum(land.id);
        if (isOccupiedSlaveLand(land, landsMap)) {
            continue;
        }
        const plant: any = land.plant;

        if (!plant || !plant.phases || plant.phases.length === 0) {
            continue;
        }

        const currentPhase: any = getCurrentPhase(plant.phases, false, `[${friendName}]土地#${id}`);
        if (!currentPhase) {
            continue;
        }
        const phaseVal: number = currentPhase.phase;

        if (phaseVal === PlantPhase.MATURE) {
            if (plant.stealable) {
                const plantId: number = toNum(plant.id);
                const plantName: string = getPlantName(plantId) || plant.name || '未知';

                // 获取种子ID用于黑名单检查（前端黑名单使用seedId）
                const plantCfg: any = getPlantById(plantId);
                const seedId: number = plantCfg ? toNum(plantCfg.seed_id) : 0;

                // 蔬菜黑名单过滤 - 使用seedId检查
                if (plantBlacklist && seedId > 0 && plantBlacklist.includes(seedId)) {
                    // log('好友', `${friendName} 土地#${id}: ${plantName}(${plantId},种子${seedId}) 被蔬菜黑名单过滤跳过`,
                    //     {
                    //     module: 'friend', event: '蔬菜黑名单跳过', friendName, landId: id, plantId, seedId, plantName
                    // });
                    continue;
                }
                result.stealable.push(id);
                result.stealableInfo.push({ landId: id, plantId, name: plantName });
            }
            continue;
        }

        if (phaseVal === PlantPhase.DEAD) continue;

        // 帮助操作
        if (toNum(plant.dry_num) > 0) result.needWater.push(id);
        if (plant.weed_owners && plant.weed_owners.length > 0) result.needWeed.push(id);
        if (plant.insect_owners && plant.insect_owners.length > 0) result.needBug.push(id);

        // 捣乱操作: 检查是否可以放草/放虫
        // 条件: 植物未成熟 + 没有草/虫且我没放过 + 每块地最多2个草/虫
        if (phaseVal !== PlantPhase.MATURE) {
            const weedOwners: number[] = plant.weed_owners || [];
            const insectOwners: number[] = plant.insect_owners || [];
            const iAlreadyPutWeed: boolean = weedOwners.some((gid: number) => toNum(gid) === myGid);
            const iAlreadyPutBug: boolean = insectOwners.some((gid: number) => toNum(gid) === myGid);

            // 每块地最多2个草/虫，且我没放过
            if (weedOwners.length < 2 && !iAlreadyPutWeed) {
                result.canPutWeed.push(id);
            }
            if (insectOwners.length < 2 && !iAlreadyPutBug) {
                result.canPutBug.push(id);
            }
        }
    }
    return result;
}

// ============ 好友列表与土地详情 ============

/**
 * 获取好友列表 (供面板)
 */
export async function getFriendsList(forceSync: boolean = false): Promise<any[]> {
    try {
        // 检查缓存
        const now: number = Date.now();
        if (!forceSync && friendsListCache && (now - friendsListCacheTime) < getFriendsListCacheTtlMs()) {

            return friendsListCache;
        }

        log('好友', '开始获取好友列表', {
            module: 'friend',
            event: '获取好友列表',
        });
        const reply: any = await getAllFriends(forceSync);
        const friends: any[] = reply.game_friends || [];
        const state: any = getUserState();
        const result: any[] = friends
            .filter((f: any) => toNum(f.gid) !== state.gid && f.name !== '小小农夫' && f.remark !== '小小农夫')
            .map((f: any) => ({
                gid: toNum(f.gid),
                name: f.remark || f.name || `GID:${toNum(f.gid)}`,
                avatarUrl: String(f.avatar_url || '').trim(),
                level: toNum(f.level),
                gold: toNum(f.gold),
                plant: f.plant ? {
                    stealNum: toNum(f.plant.steal_plant_num),
                    dryNum: toNum(f.plant.dry_num),
                    weedNum: toNum(f.plant.weed_num),
                    insectNum: toNum(f.plant.insect_num),
                } : null,
            }))
            .sort((a: any, b: any) => {
                // 固定顺序：先按名称，再按 GID，避免刷新时顺序抖动
                const an: string = String(a.name || '');
                const bn: string = String(b.name || '');
                const byName: number = an.localeCompare(bn, 'zh-CN');
                if (byName !== 0) return byName;
                return Number(a.gid || 0) - Number(b.gid || 0);
            });

        // 更新缓存
        friendsListCache = result;
        friendsListCacheTime = now;

        log('好友', `获取好友列表成功，共 ${result.length} 位好友`, {
            module: 'friend',
            event: '获取好友列表',
            result: 'ok',
            count: result.length,
        });
        return result;
    } catch (e: any) {
        log('好友', `获取好友列表失败: ${e.message}`, {
            module: 'friend',
            event: '获取好友列表',
            result: 'error',
            error: e.message,
        });
        return [];
    }
}

/**
 * 获取指定好友的农田详情 (进入-获取-离开)
 */
export async function getFriendLandsDetail(friendGid: number): Promise<any> {
    try {
        const enterReply: any = await enterFriendFarm(friendGid);
        const lands: any[] = enterReply.lands || [];
        const state: any = getUserState();
        const plantBlacklist: number[] = getPlantBlacklist(state.accountId);
        const analyzed: AnalyzeResult = analyzeFriendLands(lands, state.gid, '', { plantBlacklist });
        await leaveFriendFarm(friendGid);

        const landsList: any[] = [];
        const nowSec: number = getServerTimeSec();
        const landsMap: any = buildLandMap(lands);
        for (const land of lands) {
            const id: number = toNum(land.id);
            const level: number = toNum(land.level);
            const unlocked: boolean = !!land.unlocked;
            const {
                sourceLand,
                occupiedByMaster,
                masterLandId,
                occupiedLandIds,
            } = getDisplayLandContext(land, landsMap);
            if (!unlocked) {
                landsList.push({
                    id,
                    unlocked: false,
                    status: 'locked',
                    plantName: '',
                    phaseName: '未解锁',
                    level,
                    needWater: false,
                    needWeed: false,
                    needBug: false,
                    occupiedByMaster: false,
                    masterLandId: 0,
                    occupiedLandIds: [],
                    plantSize: 1,
                });
                continue;
            }
            const plant: any = sourceLand && sourceLand.plant;
            if (!plant || !plant.phases || plant.phases.length === 0) {
                landsList.push({
                    id,
                    unlocked: true,
                    status: 'empty',
                    plantName: '',
                    phaseName: '空地',
                    level,
                    occupiedByMaster,
                    masterLandId,
                    occupiedLandIds,
                    plantSize: 1,
                });
                continue;
            }
            const currentPhase: any = getCurrentPhase(plant.phases, false, '');
            if (!currentPhase) {
                landsList.push({
                    id,
                    unlocked: true,
                    status: 'empty',
                    plantName: '',
                    phaseName: '',
                    level,
                    occupiedByMaster,
                    masterLandId,
                    occupiedLandIds,
                    plantSize: 1,
                });
                continue;
            }
            const phaseVal: number = currentPhase.phase;
            const plantId: number = toNum(plant.id);
            const plantName: string = getPlantName(plantId) || plant.name || '未知';
            const plantCfg: any = getPlantById(plantId);
            const seedId: number = toNum(plantCfg && plantCfg.seed_id);
            const seedImage: string = seedId > 0 ? getSeedImageBySeedId(seedId) : '';
            const plantSize: number = Math.max(1, toNum(plantCfg && plantCfg.size) || 1);
            const totalSeason: number = Math.max(1, toNum(plantCfg && plantCfg.seasons) || 1);
            const currentSeasonRaw: number = toNum(plant.season);
            const currentSeason: number = currentSeasonRaw > 0 ? Math.min(currentSeasonRaw, totalSeason) : 1;
            const phaseName: string = PHASE_NAMES[phaseVal] || '';
            const maturePhase: any = Array.isArray(plant.phases)
                ? plant.phases.find((p: any) => p && toNum(p.phase) === PlantPhase.MATURE)
                : null;
            const matureBegin: number = maturePhase ? toTimeSec(maturePhase.begin_time) : 0;
            const matureInSec: number = matureBegin > nowSec ? (matureBegin - nowSec) : 0;
            const totalGrowTime: number = getPlantGrowTime(plantId);
            let landStatus: string = 'growing';
            if (phaseVal === PlantPhase.MATURE) landStatus = plant.stealable ? 'stealable' : 'harvested';
            else if (phaseVal === PlantPhase.DEAD) landStatus = 'dead';

            landsList.push({
                id,
                unlocked: true,
                status: landStatus,
                plantName,
                seedId,
                seedImage,
                phaseName,
                currentSeason,
                totalSeason,
                level,
                matureInSec,
                totalGrowTime,
                needWater: toNum(plant.dry_num) > 0,
                needWeed: (plant.weed_owners && plant.weed_owners.length > 0),
                needBug: (plant.insect_owners && plant.insect_owners.length > 0),
                occupiedByMaster,
                masterLandId,
                occupiedLandIds,
                plantSize,
            });
        }

        return {
            lands: landsList,
            summary: analyzed,
        };
    } catch {
        return { lands: [], summary: {} };
    }
}

// ============ 批量操作与面板操作 ============

export async function runBatchWithFallback(ids: number[], batchFn: (ids: number[]) => Promise<any>, singleFn: (ids: number[]) => Promise<any>): Promise<number> {
    const target: number[] = Array.isArray(ids) ? ids.filter(Boolean) : [];
    if (target.length === 0) return 0;
    try {
        await batchFn(target);
        return target.length;
    } catch {
        let ok: number = 0;
        for (const landId of target) {
            try {
                await singleFn([landId]);
                ok++;
            } catch { /* ignore */ }
            await sleep(100);
        }
        return ok;
    }
}

/**
 * 面板手动好友操作（单个好友）
 * opType: 'steal' | 'water' | 'weed' | 'bug' | 'bad'
 */
export async function doFriendOperation(friendGid: any, opType: string): Promise<any> {
    const gid: number = toNum(friendGid);
    if (!gid) return { ok: false, message: '无效好友ID', opType };

    let enterReply: any;
    try {
        enterReply = await enterFriendFarm(gid);
    } catch (e: any) {
        const handled: { handled: boolean; kind: string } = handleFriendEnterError(gid, `GID:${gid}`, e);
        if (handled.handled && handled.kind === 'blacklist') {
            return { ok: true, opType, count: 0, message: '好友已自动加入黑名单' };
        }
        if (handled.handled && handled.kind === 'invalid_removed') {
            return { ok: true, opType, count: 0, message: '好友 GID 已失效，已自动移出已知列表' };
        }
        return { ok: false, message: `进入好友农场失败: ${e.message}`, opType };
    }

    try {
        const lands: any[] = enterReply.lands || [];
        const state: any = getUserState();
        const plantBlacklist: number[] = getPlantBlacklist(state.accountId);
        const status: AnalyzeResult = analyzeFriendLands(lands, state.gid, '', { plantBlacklist });
        let count: number = 0;

        if (opType === 'steal') {
            if (!status.stealable.length) return { ok: true, opType, count: 0, message: '没有可偷取土地' };
            const precheck: { canOperate: boolean; canStealNum: number } = await checkCanOperateRemote(gid, 10004);
            if (!precheck.canOperate) return { ok: true, opType, count: 0, message: 'Ta已经被偷的精光了QAQ' };
            const maxNum: number = precheck.canStealNum > 0 ? precheck.canStealNum : status.stealable.length;
            const target: number[] = status.stealable.slice(0, maxNum);
            count = await runBatchWithFallback(target, (ids: number[]) => stealHarvest(gid, ids), (ids: number[]) => stealHarvest(gid, ids));
            if (count > 0) {
                recordOperation('steal', count);
                // 手动偷取成功后立即尝试出售一次果实
                try {
                    await sellAllFruits();
                } catch (e: any) {
                    logWarn('仓库', `手动偷取后自动出售失败: ${e.message}`, {
                        module: 'warehouse',
                        event: '偷菜后出售',
                        result: 'error',
                        mode: 'manual',
                    });
                }
            }
            return { ok: true, opType, count, message: `偷取完成 ${count} 块` };
        }

        if (opType === 'farming' || opType === 'water' || opType === 'weed' || opType === 'bug') {
            const landIds: number[] = opType === 'farming'
                ? [...new Set([...status.needWeed, ...status.needBug, ...status.needWater])]
                : opType === 'water' ? status.needWater
                : opType === 'weed' ? status.needWeed
                : status.needBug;
            if (!landIds.length) return { ok: true, opType, count: 0, message: '没有需要照顾的土地' };
            const precheck: { canOperate: boolean; canStealNum: number } = await checkCanOperateRemote(gid, 10001);
            if (!precheck.canOperate) return { ok: true, opType, count: 0, message: '一键务农失败，来晚一步，可惜' };
            count = await runBatchWithFallback(landIds, (ids: number[]) => helpFarming(gid, ids), (ids: number[]) => helpFarming(gid, ids));
            if (count > 0) recordOperation('helpFarming', count);
            return { ok: true, opType, count, message: `一键务农完成 ${count} 块` };
        }

        if (opType === 'bad') {
            let bugCount: number = 0;
            let weedCount: number = 0;
            if (!status.canPutBug.length && !status.canPutWeed.length) {
                return { ok: true, opType, count: 0, bugCount: 0, weedCount: 0, message: '没有可捣乱土地' };
            }

            // 手动捣乱不依赖预检查，逐块执行（与 terminal-farm-main 保持一致）
            let failDetails: string[] = [];
            if (status.canPutBug.length) {
                const bugRet: { ok: number; failed: any[] } = await putInsectsDetailed(gid, status.canPutBug);
                bugCount = bugRet.ok;
                failDetails = failDetails.concat((bugRet.failed || []).map((f: any) => `放虫#${f.landId}:${f.reason}`));
                if (bugCount > 0) recordOperation('bug', bugCount);
            }
            if (status.canPutWeed.length) {
                const weedRet: { ok: number; failed: any[] } = await putWeedsDetailed(gid, status.canPutWeed);
                weedCount = weedRet.ok;
                failDetails = failDetails.concat((weedRet.failed || []).map((f: any) => `放草#${f.landId}:${f.reason}`));
                if (weedCount > 0) recordOperation('weed', weedCount);
            }
            count = bugCount + weedCount;
            if (count <= 0) {
                const reasonPreview: string = failDetails.slice(0, 2).join(' | ');
                return {
                    ok: true,
                    opType,
                    count: 0,
                    bugCount,
                    weedCount,
                    message: reasonPreview ? `捣乱失败: ${reasonPreview}` : '捣乱失败或今日次数已用完'
                };
            }
            return { ok: true, opType, count, bugCount, weedCount, message: `捣乱完成 虫${bugCount}/草${weedCount}` };
        }

        return { ok: false, opType, count: 0, message: '未知操作类型' };
    } catch (e: any) {
        return { ok: false, opType, count: 0, message: e.message || '操作失败' };
    } finally {
        try { await leaveFriendFarm(gid); } catch { /* ignore */ }
    }
}

// ============ 拜访好友 ============

interface VisitResult {
    acted: boolean;
    entered: boolean;
}

export async function visitFriend(friend: any, totalActions: any, myGid: number, accountId: string): Promise<VisitResult> {
    const { gid, name } = friend;

    let enterReply: any;
    try {
        enterReply = await enterFriendFarm(gid);
    } catch (e: any) {
        const handled: { handled: boolean; kind: string } = handleFriendEnterError(gid, name, e);
        if (handled.handled && handled.kind === 'blacklist') {
            return { acted: false, entered: false };
        }
        if (handled.handled && handled.kind === 'invalid_removed') {
            return { acted: false, entered: false };
        }
        logWarn('好友', `进入 ${name} 农场失败: ${e.message}`, {
            module: 'friend', event: '进入农场', result: 'error', friendName: name, friendGid: gid
        });
        return { acted: false, entered: false };
    }

    const lands: any[] = enterReply.lands || [];
    if (lands.length === 0) {
        await leaveFriendFarm(gid);
        return { acted: false, entered: true };
    }

    const plantBlacklist: number[] = getPlantBlacklist(accountId);
    const status: AnalyzeResult = analyzeFriendLands(lands, myGid, name, { plantBlacklist });

    // 执行操作
    const actions: string[] = [];

    // 1. 帮助操作 (除草/除虫/浇水)
    const helpEnabled: boolean = !!isAutomationOn('friend_help');
    const stopWhenExpLimit: boolean = !!isAutomationOn('friend_help_exp_limit');
    if (!stopWhenExpLimit) schedulerRef().setCanGetHelpExp(true);
    if (!helpEnabled) {
        // 自动帮忙关闭，直接跳过帮助操作
    } else if (stopWhenExpLimit && !schedulerRef().getCanGetHelpExp()) {
        // 今日已达到经验上限后停止帮忙
    } else {
        const allHelpLandIds: number[] = [...new Set([...status.needWeed, ...status.needBug, ...status.needWater])];
        const allExpIds: number[] = [10001, 10002, 10003, 10004, 10005, 10006];
        const allowByExp: boolean = (!stopWhenExpLimit) || (schedulerRef().canGetExpByCandidates(allExpIds) && schedulerRef().getCanGetHelpExp());
        if (allHelpLandIds.length > 0 && allowByExp) {
            const precheck: { canOperate: boolean; canStealNum: number } = await checkCanOperateRemote(gid, 10001);
            if (precheck.canOperate) {
                const count: number = await runBatchWithFallback(
                    allHelpLandIds,
                    (ids: number[]) => helpFarming(gid, ids, stopWhenExpLimit),
                    (ids: number[]) => helpFarming(gid, ids, stopWhenExpLimit)
                );
                if (count > 0) {
                    const parts: string[] = [];
                    if (status.needWeed.length) parts.push(`草${status.needWeed.length}`);
                    if (status.needBug.length) parts.push(`虫${status.needBug.length}`);
                    if (status.needWater.length) parts.push(`水${status.needWater.length}`);
                    actions.push(`一键务农${count}(${parts.join('/')})`);
                    totalActions.farming += count;
                    recordOperation('helpFarming', count);
                }
            }
        }
    }

    // 2. 偷菜操作
    if (isAutomationOn('friend_steal') && status.stealable.length > 0) {
        const precheck: { canOperate: boolean; canStealNum: number } = await checkCanOperateRemote(gid, 10004);
        if (precheck.canOperate) {
            const canStealNum: number = precheck.canStealNum > 0 ? precheck.canStealNum : status.stealable.length;
            const targetLands: number[] = status.stealable.slice(0, canStealNum);

            let ok: number = 0;
            const stolenPlants: string[] = [];

            // 尝试批量偷取
            try {
                await stealHarvest(gid, targetLands);
                ok = targetLands.length;
                targetLands.forEach((id: number) => {
                    const info: any = status.stealableInfo.find((x: any) => x.landId === id);
                    if (info) stolenPlants.push(info.name);
                });
            } catch {
                // 批量失败，降级为单个
                for (const landId of targetLands) {
                    try {
                        await stealHarvest(gid, [landId]);
                        ok++;
                        const info: any = status.stealableInfo.find((x: any) => x.landId === landId);
                        if (info) stolenPlants.push(info.name);
                    } catch { /* ignore */ }
                    await randomDelay(500, 800);
                }
            }

            if (ok > 0) {
                const plantNames: string = [...new Set(stolenPlants)].join('/');
                actions.push(`偷${ok}${plantNames ? `(${  plantNames  })` : ''}`);
                totalActions.steal += ok;
                recordOperation('steal', ok);
                await randomDelay(500, 800);
            }
        }
    }

    // 3. 捣乱操作 (放虫/放草)
    const autoBad: boolean = isAutomationOn('friend_bad');
    if (autoBad) {
        // 使用远程检查获取准确的剩余次数
        const bugCheck: { canOperate: boolean; canStealNum: number } = await checkCanOperateRemote(gid, 10005);
        const weedCheck: { canOperate: boolean; canStealNum: number } = await checkCanOperateRemote(gid, 10006);

        if (status.canPutBug.length > 0 && bugCheck.canOperate) {
            const remaining: number = schedulerRef().getRemainingTimes(10005);
            const toProcess: number[] = status.canPutBug.slice(0, remaining);
            const ok: number = await putInsects(gid, toProcess);
            if (ok > 0) { actions.push(`放虫${ok}`); totalActions.putBug += ok; }
            await randomDelay(500, 800);
        }

        if (status.canPutWeed.length > 0 && weedCheck.canOperate) {
            const remaining: number = schedulerRef().getRemainingTimes(10006);
            const toProcess: number[] = status.canPutWeed.slice(0, remaining);
            const ok: number = await putWeeds(gid, toProcess);
            if (ok > 0) { actions.push(`放草${ok}`); totalActions.putWeed += ok; }
            await randomDelay(500, 800);
        }
    }

    if (actions.length > 0) {
        log('好友', `${name}: ${actions.join('/')}`, {
            module: 'friend', event: '照顾好友', result: 'ok', friendName: name, friendGid: gid, actions
        });
    }

    await leaveFriendFarm(gid);
    return { acted: actions.length > 0, entered: true };
}

// ============ 仅偷菜 ============

export async function visitFriendForSteal(friend: any, totalActions: any, myGid: number, accountId: string): Promise<VisitResult | undefined> {
    const { gid, name } = friend;

    let enterReply: any;
    try {
        enterReply = await enterFriendFarm(gid);
    } catch (e: any) {
        const handled: { handled: boolean; kind: string } = handleFriendEnterError(gid, name, e);
        if (handled.handled) {
            return { acted: false, entered: false };
        }
        logWarn('好友', `进入 ${name} 农场失败: ${e.message}`, {
            module: 'friend', event: '进入农场', result: 'error', friendName: name, friendGid: gid
        });
        return { acted: false, entered: false };
    }

    const lands: any[] = enterReply.lands || [];
    if (lands.length === 0) {
        await leaveFriendFarm(gid);
        return { acted: false, entered: true };
    }

    const plantBlacklist: number[] = getPlantBlacklist(accountId);
    const status: AnalyzeResult = analyzeFriendLands(lands, myGid, name, { plantBlacklist });

    const actions: string[] = [];

    // 检查是否所有可偷蔬菜都被黑名单过滤了（只统计成熟的、可偷的植物）
    const hasStealableBeforeFilter: boolean = lands.some((land: any) => {
        const plant: any = land.plant;
        if (!plant || !plant.phases || plant.phases.length === 0) return false;
        const currentPhase: any = getCurrentPhase(land.plant.phases, false);
        if (!currentPhase || currentPhase.phase !== PlantPhase.MATURE) return false;
        if (!plant.stealable) return false;
        // stealers 字段为 bytes 类型，需手动解析为 StealPlayer 数组
        let stealInfo: any[] = [];
        if (plant.stealers && plant.stealers.length > 0 && plant.stealers[0] === 0x08) {
            try {
                const decoded = types.StealPlayer.decode(plant.stealers);
                stealInfo = [decoded];
            } catch {}
        }
        if (stealInfo.length === 0) return true; // 无人偷过，可偷
        const mySteal: any = stealInfo.find((s: any) => toNum(s.gid) === myGid);
        const stealCount: number = mySteal ? toNum(mySteal.num) : 0;
        // steal_num 为 bytes 类型，手动解析 varint
        let maxSteal = 2;
        if (plant.steal_num && plant.steal_num.length > 0) {
            let v = 0, s = 0;
            for (let i = 0; i < plant.steal_num.length && i < 10; i++) {
                v |= (plant.steal_num[i] & 0x7f) << s;
                if ((plant.steal_num[i] & 0x80) === 0) break;
                s += 7;
            }
            if (v > 0) maxSteal = v;
        }
        return stealCount < maxSteal;
    });

    if (hasStealableBeforeFilter && status.stealable.length === 0) {
        // log('好友', `${name}: 跳过，所有可偷蔬菜都被黑名单过滤`, {
        //     module: 'friend', event: '偷菜全部过滤', friendName: name, friendGid: gid
        // });
        await leaveFriendFarm(gid);
        return;
    }

    // 只执行偷菜
    if (status.stealable.length > 0) {
        const precheck: { canOperate: boolean; canStealNum: number } = await checkCanOperateRemote(gid, 10004);
        if (precheck.canOperate) {
            const canStealNum: number = precheck.canStealNum > 0 ? precheck.canStealNum : status.stealable.length;
            const targetLands: number[] = status.stealable.slice(0, canStealNum);

            let ok: number = 0;
            const stolenPlants: string[] = [];

            // 尝试批量偷取
            try {
                await stealHarvest(gid, targetLands);
                ok = targetLands.length;
                targetLands.forEach((id: number) => {
                    const info: any = status.stealableInfo.find((x: any) => x.landId === id);
                    if (info) stolenPlants.push(info.name);
                });
            } catch {
                // 批量失败，降级为单个
                for (const landId of targetLands) {
                    try {
                        await stealHarvest(gid, [landId]);
                        ok++;
                        const info: any = status.stealableInfo.find((x: any) => x.landId === landId);
                        if (info) stolenPlants.push(info.name);
                    } catch { /* ignore */ }
                    await randomDelay(500, 800);
                }
            }

            if (ok > 0) {
                const plantNames: string = [...new Set(stolenPlants)].join('/');
                actions.push(`偷${ok}${plantNames ? `(${plantNames})` : ''}`);
                totalActions.steal += ok;
                recordOperation('steal', ok);
                await randomDelay(500, 800);
            }
        }
    }

    if (actions.length > 0) {
        log('好友', `${name}: ${actions.join('/')}`, {
            module: 'friend', event: '偷好友菜', result: 'ok', friendName: name, friendGid: gid, actions
        });
    }

    await leaveFriendFarm(gid);
    return { acted: actions.length > 0, entered: true };
}

// ============ 仅帮助 ============

export async function visitFriendForHelp(friend: any, totalActions: any, myGid: number, accountId: string, ignoreExpLimit: boolean = false): Promise<VisitResult | undefined> {
    const { gid, name } = friend;

    const stopWhenExpLimit: boolean = !!isAutomationOn('friend_help_exp_limit') && !ignoreExpLimit;
    if (!stopWhenExpLimit) schedulerRef().setCanGetHelpExp(true);
    if (stopWhenExpLimit && !schedulerRef().getCanGetHelpExp()) {
        return { acted: false, entered: false };
    }

    let enterReply: any;
    try {
        enterReply = await enterFriendFarm(gid);
    } catch (e: any) {
        const handled: { handled: boolean; kind: string } = handleFriendEnterError(gid, name, e);
        if (handled.handled) {
            return { acted: false, entered: false };
        }
        logWarn('好友', `进入 ${name} 农场失败: ${e.message}`, {
            module: 'friend', event: '进入农场', result: 'error', friendName: name, friendGid: gid
        });
        return { acted: false, entered: false };
    }

    const lands: any[] = enterReply.lands || [];
    if (lands.length === 0) {
        await leaveFriendFarm(gid);
        return;
    }

    const status: AnalyzeResult = analyzeFriendLands(lands, myGid, name, {});

    const actions: string[] = [];

    const allHelpLandIds: number[] = [...new Set([...status.needWeed, ...status.needBug, ...status.needWater])];
    const allExpIds: number[] = [10001, 10002, 10003, 10004, 10005, 10006];
    const allowByExp: boolean = (!stopWhenExpLimit) || (schedulerRef().canGetExpByCandidates(allExpIds) && schedulerRef().getCanGetHelpExp());
    if (allHelpLandIds.length > 0 && allowByExp) {
        const precheck: { canOperate: boolean; canStealNum: number } = await checkCanOperateRemote(gid, 10001);
        if (precheck.canOperate) {
            const count: number = await runBatchWithFallback(
                allHelpLandIds,
                (ids: number[]) => helpFarming(gid, ids, stopWhenExpLimit),
                (ids: number[]) => helpFarming(gid, ids, stopWhenExpLimit)
            );
            if (count > 0) {
                const parts: string[] = [];
                if (status.needWeed.length) parts.push(`草${status.needWeed.length}`);
                if (status.needBug.length) parts.push(`虫${status.needBug.length}`);
                if (status.needWater.length) parts.push(`水${status.needWater.length}`);
                actions.push(`一键务农${count}(${parts.join('/')})`);
                totalActions.farming += count;
                recordOperation('helpFarming', count);
            }
        }
    }

    if (actions.length > 0) {
        log('好友', `${name}: ${actions.join('/')}`, {
            module: 'friend', event: '帮助好友', result: 'ok', friendName: name, friendGid: gid, actions
        });
    }

    await leaveFriendFarm(gid);
    return { acted: actions.length > 0, entered: true };
}

// ============ 缓存管理 ============

export function clearFriendsListCache(): void {
    friendsListCache = null;
    friendsListCacheTime = 0;
}

