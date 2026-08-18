/** 七夕鹊羽灵露：候选地块读取与定向物品使用。 */

export {};

const LongModule = require('long');
const { PHASE_NAMES, PlantPhase } = require('../config/config');
const { getItemById, getItemImageById, getPlantById, getPlantName, getSeedImageBySeedId } = require('../config/gameConfig');
const { sendMsgAsync, getUserState, GatewayError } = require('../utils/network');
const { types } = require('../utils/proto');
const { toNum } = require('../utils/utils');
const { getAllLands } = require('./farm/api');
const { buildLandMap, getCurrentPhase, getDisplayLandContext } = require('./farm/land-analysis');
const { enterFriendFarm, leaveFriendFarm } = require('./friend/api');
const { getBag, getBagItems } = require('./warehouse');

const QIXI_DEW_ITEM_ID = 301103;
const QIXI_DEW_USE_CONFIG_ID = 0;
const MAX_QIXI_DEW_BATCH_LANDS = 48;
const MAX_SIGNED_INT64 = 9223372036854775807n;

class QixiDewBusinessError extends Error {
    code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = 'QixiDewBusinessError';
        this.code = code;
    }
}

function businessError(code: string, message: string): QixiDewBusinessError {
    return new QixiDewBusinessError(code, message);
}

function int64String(value: any): string {
    if (value == null) return '0';
    if (LongModule.isLong(value)) return value.toString();
    const text = String(value).trim();
    return /^-?\d+$/.test(text) ? text : '0';
}

function positiveDecimal(value: unknown, code: string, fieldName: string): string {
    const normalized = int64String(value);
    if (!/^[1-9]\d*$/.test(normalized) || normalized.length > 19 || BigInt(normalized) > MAX_SIGNED_INT64) {
        throw businessError(code, `${fieldName} 必须是 int64 范围内的正十进制整数`);
    }
    return normalized;
}

function normalizeLandIds(value: unknown): string[] {
    const source = Array.isArray(value) ? value : [value];
    const unique = new Set<string>();
    for (const entry of source) {
        unique.add(positiveDecimal(entry, 'INVALID_QIXI_DEW_LAND_IDS', 'landIds'));
    }
    if (unique.size === 0) {
        throw businessError('INVALID_QIXI_DEW_LAND_IDS', '至少选择一块地');
    }
    if (unique.size > MAX_QIXI_DEW_BATCH_LANDS) {
        throw businessError('INVALID_QIXI_DEW_LAND_IDS', `单次最多选择 ${MAX_QIXI_DEW_BATCH_LANDS} 块地`);
    }
    return [...unique].sort((left, right) => {
        const leftId = BigInt(left);
        const rightId = BigInt(right);
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    });
}

function landTypeName(levelInput: unknown): string {
    const level = toNum(levelInput);
    if (level <= 1) return '普通土地';
    return ({
        2: '红土地',
        3: '黑土地',
        4: '金土地',
        5: '紫金土地',
    } as Record<number, string>)[level] || `等级 ${level} 土地`;
}

function currentUser() {
    const state = getUserState() || {};
    const gid = positiveDecimal(state.gid, 'QIXI_DEW_ACCOUNT_UNAVAILABLE', '当前账号 GID');
    return {
        gid,
        name: String(state.remark || state.name || `GID:${gid}`),
        avatarUrl: String(state.avatar_url || state.avatarUrl || ''),
    };
}

function resolveHost(hostGidInput: unknown) {
    const user = currentUser();
    const input = String(hostGidInput ?? '').trim();
    const gid = !input || input === '0'
        ? user.gid
        : positiveDecimal(input, 'INVALID_QIXI_DEW_HOST_GID', 'hostGid');
    return { ...user, gid, isSelf: gid === user.gid };
}

function itemDto(item: any) {
    const id = int64String(item?.id ?? item?.item_id);
    const numericId = Number(id);
    const metadata = Number.isSafeInteger(numericId) && numericId > 0 ? getItemById(numericId) : null;
    return {
        id,
        count: int64String(item?.count),
        uid: int64String(item?.uid),
        name: metadata?.name || `物品${id}`,
        image: metadata ? getItemImageById(numericId) : '',
    };
}

function buildDewLandTargets(landsInput: any[], host: any): any[] {
    const lands = Array.isArray(landsInput) ? landsInput : [];
    const landsMap = buildLandMap(lands);
    const seen = new Set<number>();
    const targets: any[] = [];

    for (const land of lands) {
        if (!land?.unlocked) continue;
        const context = getDisplayLandContext(land, landsMap);
        if (context.occupiedByMaster) continue;
        const sourceLand = context.sourceLand || land;
        const landId = toNum(sourceLand?.id);
        if (landId <= 0 || seen.has(landId)) continue;

        const plant = sourceLand?.plant;
        if (!plant || !Array.isArray(plant.phases) || plant.phases.length === 0) continue;
        const currentPhase = getCurrentPhase(plant.phases, false, '');
        const phaseCode = toNum(currentPhase?.phase);
        if (phaseCode < PlantPhase.SEED || phaseCode > PlantPhase.MATURE || phaseCode === PlantPhase.DEAD) continue;

        const plantId = toNum(plant.id);
        const plantConfig = getPlantById(plantId);
        const seedId = toNum(plantConfig?.seed_id);
        const landLevel = toNum(sourceLand?.level ?? land?.level);
        seen.add(landId);
        targets.push({
            id: String(landId),
            landId: String(landId),
            hostGid: String(host.gid),
            ownerName: String(host.name || `GID:${host.gid}`),
            isSelf: !!host.isSelf,
            plantId: String(plantId),
            plantName: getPlantName(plantId) || String(plant.name || '未知作物'),
            seedId: String(seedId || 0),
            seedImage: seedId > 0 ? getSeedImageBySeedId(seedId) : '',
            landLevel,
            landTypeName: landTypeName(landLevel),
            phaseCode,
            phaseName: PHASE_NAMES[phaseCode] || `阶段${phaseCode}`,
            mature: phaseCode === PlantPhase.MATURE,
            occupiedLandIds: (Array.isArray(context.occupiedLandIds) ? context.occupiedLandIds : [landId])
                .map((id: any) => String(toNum(id)))
                .filter((id: string) => id !== '0'),
            activityMarker: int64String(plant?.field_36?.activity_id),
        });
    }

    return targets.sort((left, right) => Number(left.landId) - Number(right.landId));
}

function friendHost(reply: any, requestedGid: string) {
    const actualGid = int64String(reply?.basic?.gid);
    if (actualGid !== '0' && actualGid !== requestedGid) {
        throw businessError('QIXI_DEW_HOST_MISMATCH', '进入的好友农场与所选 GID 不一致');
    }
    return {
        gid: requestedGid,
        name: String(reply?.basic?.remark || reply?.basic?.name || `GID:${requestedGid}`),
        avatarUrl: String(reply?.basic?.avatar_url || ''),
        isSelf: false,
    };
}

async function getQixiDewTargets(hostGidInput: unknown = '') {
    const host = resolveHost(hostGidInput);
    if (host.isSelf) {
        const reply = await getAllLands();
        const lands = buildDewLandTargets(reply?.lands || [], host);
        return { host, lands, count: lands.length, serverValidationRequired: true };
    }

    const reply = await enterFriendFarm(Number(host.gid));
    try {
        const enteredHost = friendHost(reply, host.gid);
        const lands = buildDewLandTargets(reply?.lands || [], enteredHost);
        return { host: enteredHost, lands, count: lands.length, serverValidationRequired: true };
    } finally {
        await leaveFriendFarm(Number(host.gid));
    }
}

function findDewStack(bagReply: any): any | null {
    return getBagItems(bagReply).find((item: any) => (
        int64String(item?.id ?? item?.item_id) === String(QIXI_DEW_ITEM_ID)
        && BigInt(int64String(item?.count)) > 0n
    )) || null;
}

async function sendDewUse(stack: any, hostGid: string, landId: string): Promise<any> {
    const request = types.UseRequest.create({
        item: {
            id: QIXI_DEW_ITEM_ID,
            count: 1,
            uid: stack.uid,
        },
        target: {
            host_gid: hostGid,
            land_ids: [landId],
            use_config_id: QIXI_DEW_USE_CONFIG_ID,
        },
    });
    const body = Buffer.from(types.UseRequest.encode(request).finish());
    const { body: replyBody } = await sendMsgAsync('gamepb.itempb.ItemService', 'Use', body);
    return types.UseReply.decode(replyBody);
}

function dewAttemptFailure(landId: string, error: any, target: any = null) {
    const code = String(error?.code || String(error?.message || '').match(/\bcode=(\d+)\b/)?.[1] || 'QIXI_DEW_USE_FAILED');
    const knownMessages: Record<string, string> = {
        '1001065': '该地块当前不符合灵露使用条件，可能是作物品级不足或状态已变化',
        '1003008': '该农场当前已达到灵露使用限制',
        QIXI_DEW_TARGET_UNAVAILABLE: '该地块已经没有可使用灵露的作物',
    };
    const serverMessage = String(error?.errorMessage || '').trim();
    const businessMessage = error instanceof QixiDewBusinessError ? String(error.message || '') : '';
    return {
        landId,
        ok: false,
        code,
        message: knownMessages[code] || businessMessage || serverMessage || '服务器未接受该地块的灵露使用请求',
        target,
        error,
    };
}

async function useDewOnLands(stack: any, host: any, landsInput: any[], landIds: string[]) {
    const targets = buildDewLandTargets(landsInput, host);
    const targetsById = new Map(targets.map((target: any) => [target.landId, target]));
    const attempts: any[] = [];

    for (let index = 0; index < landIds.length; index += 1) {
        const landId = landIds[index];
        const target = targetsById.get(landId) || null;
        if (!target) {
            attempts.push(dewAttemptFailure(
                landId,
                businessError('QIXI_DEW_TARGET_UNAVAILABLE', '所选地块已无可使用灵露的作物'),
            ));
            continue;
        }

        try {
            const reply = await sendDewUse(stack, host.gid, landId);
            const directRewards = Array.isArray(reply?.items) ? reply.items : [];
            const landRewards = Array.isArray(reply?.land_reward?.items) ? reply.land_reward.items : [];
            attempts.push({
                landId,
                ok: true,
                code: '',
                message: `第 ${landId} 块地使用成功`,
                target,
                updatedLand: reply?.land || null,
                rewardLandId: int64String(reply?.land_reward?.land_id),
                usedItems: (Array.isArray(reply?.used_items) ? reply.used_items : []).map(itemDto),
                rewards: [...directRewards, ...landRewards].map(itemDto),
            });
        } catch (error: any) {
            attempts.push(dewAttemptFailure(landId, error, target));
            const gatewayFailure = typeof GatewayError === 'function' && error instanceof GatewayError;
            if (!gatewayFailure && !(error instanceof QixiDewBusinessError)) {
                for (const remainingLandId of landIds.slice(index + 1)) {
                    attempts.push({
                        landId: remainingLandId,
                        ok: false,
                        code: 'QIXI_DEW_BATCH_ABORTED',
                        message: '前序请求被中断，本地未继续提交该地块',
                        target: targetsById.get(remainingLandId) || null,
                    });
                }
                break;
            }
        }
    }

    return attempts;
}

async function performQixiDewBatch(hostGidInput: unknown, landIdsInput: unknown) {
    const host = resolveHost(hostGidInput);
    const landIds = normalizeLandIds(landIdsInput);
    const activity = await require('./activity-center').getCurrentQixiActivity();
    if (!activity?.active) {
        throw businessError('QIXI_DEW_UNAVAILABLE', '鹊桥寄情活动未进行，灵露当前不可使用');
    }

    const bagReply = await getBag();
    const dewStack = findDewStack(bagReply);
    if (!dewStack) {
        throw businessError('INSUFFICIENT_QIXI_DEW', '背包中没有可用的鹊羽灵露');
    }
    const available = BigInt(int64String(dewStack.count));
    if (BigInt(landIds.length) > available) {
        throw businessError(
            'QIXI_DEW_SELECTION_EXCEEDS_BALANCE',
            `已选择 ${landIds.length} 块地，但当前只有 ${available.toString()} 份鹊羽灵露`,
        );
    }

    let activeHost = host;
    let attempts: any[] = [];
    if (host.isSelf) {
        const landsReply = await getAllLands();
        attempts = await useDewOnLands(dewStack, host, landsReply?.lands || [], landIds);
    } else {
        const enterReply = await enterFriendFarm(Number(host.gid));
        try {
            activeHost = friendHost(enterReply, host.gid);
            // The whole ordered batch stays inside one Visit Enter/Leave session.
            attempts = await useDewOnLands(dewStack, activeHost, enterReply?.lands || [], landIds);
        } finally {
            await leaveFriendFarm(Number(host.gid));
        }
    }

    const publicResults = attempts.map(({ error: _error, ...attempt }) => attempt);
    const succeeded = publicResults.filter((attempt: any) => attempt.ok);
    const failed = publicResults.filter((attempt: any) => !attempt.ok);
    const snapshot = await require('./activity-center').getActivityCenterSnapshot();
    const owner = activeHost.isSelf ? '自己农场' : `${activeHost.name}的农场`;
    const summary = failed.length > 0
        ? `已在${owner}按顺序使用 ${succeeded.length} 份灵露，跳过 ${failed.length} 块地`
        : `已在${owner}按顺序使用 ${succeeded.length} 份灵露`;
    return {
        activityKey: `${String(activity.activityId || activity.groupId || '')}:${String(activity.startTime || '')}`,
        hostGid: activeHost.gid,
        ownerName: activeHost.name,
        requestedLandIds: landIds,
        usedLandIds: succeeded.map((attempt: any) => attempt.landId),
        failedLandIds: failed.map((attempt: any) => attempt.landId),
        successCount: succeeded.length,
        failureCount: failed.length,
        results: publicResults,
        usedItems: succeeded.flatMap((attempt: any) => attempt.usedItems || []),
        rewards: succeeded.flatMap((attempt: any) => attempt.rewards || []),
        message: summary,
        snapshot,
    };
}

let mutationTail: Promise<void> = Promise.resolve();

function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = mutationTail.then(operation, operation);
    mutationTail = run.then(() => undefined, () => undefined);
    return run;
}

async function useQixiDew(hostGidInput: unknown, landIdInput: unknown) {
    return serializeMutation(async () => {
        const landId = positiveDecimal(landIdInput, 'INVALID_QIXI_DEW_LAND_ID', 'landId');
        const batch = await performQixiDewBatch(hostGidInput, [landId]);
        const attempt = batch.results[0];
        if (!attempt?.ok) {
            throw businessError(String(attempt?.code || 'QIXI_DEW_USE_FAILED'), String(attempt?.message || '灵露使用失败'));
        }
        return {
            hostGid: batch.hostGid,
            landId,
            target: attempt.target,
            updatedLand: attempt.updatedLand,
            rewardLandId: attempt.rewardLandId,
            usedItems: attempt.usedItems,
            rewards: attempt.rewards,
            message: `已在${attempt.target.isSelf ? '自己农场' : `${attempt.target.ownerName}的农场`}第 ${landId} 块地使用 1 份鹊羽灵露`,
            snapshot: batch.snapshot,
        };
    });
}

async function useQixiDewBatch(hostGidInput: unknown, landIdsInput: unknown) {
    return serializeMutation(() => performQixiDewBatch(hostGidInput, landIdsInput));
}

module.exports = {
    QIXI_DEW_ITEM_ID,
    buildDewLandTargets,
    getQixiDewTargets,
    useQixiDew,
    useQixiDewBatch,
};
