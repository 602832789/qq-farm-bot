/** 七夕鹊羽灵露：候选地块读取与定向物品使用。 */

export {};

const LongModule = require('long');
const { PHASE_NAMES, PlantPhase } = require('../config/config');
const { getItemById, getItemImageById, getPlantById, getPlantName, getSeedImageBySeedId } = require('../config/gameConfig');
const { sendMsgAsync, getUserState } = require('../utils/network');
const { types } = require('../utils/proto');
const { toNum } = require('../utils/utils');
const { getAllLands } = require('./farm/api');
const { buildLandMap, getCurrentPhase, getDisplayLandContext } = require('./farm/land-analysis');
const { enterFriendFarm, leaveFriendFarm } = require('./friend/api');
const { getBag, getBagItems } = require('./warehouse');

const QIXI_DEW_ITEM_ID = 301103;
const QIXI_DEW_USE_CONFIG_ID = 0;
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

function requireSelectedTarget(lands: any[], host: any, landId: string): any {
    const targets = buildDewLandTargets(lands, host);
    const target = targets.find((entry: any) => entry.landId === landId);
    if (!target) {
        throw businessError('QIXI_DEW_TARGET_UNAVAILABLE', '所选地块已无可使用灵露的作物，请刷新后重选');
    }
    return target;
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

let mutationTail: Promise<void> = Promise.resolve();

function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = mutationTail.then(operation, operation);
    mutationTail = run.then(() => undefined, () => undefined);
    return run;
}

async function useQixiDew(hostGidInput: unknown, landIdInput: unknown) {
    const host = resolveHost(hostGidInput);
    const landId = positiveDecimal(landIdInput, 'INVALID_QIXI_DEW_LAND_ID', 'landId');

    return serializeMutation(async () => {
        const activity = await require('./activity-center').getCurrentQixiActivity();
        if (!activity?.active) {
            throw businessError('QIXI_DEW_UNAVAILABLE', '鹊桥寄情活动未进行，灵露当前不可使用');
        }

        const bagReply = await getBag();
        const dewStack = findDewStack(bagReply);
        if (!dewStack) {
            throw businessError('INSUFFICIENT_QIXI_DEW', '背包中没有可用的鹊羽灵露');
        }

        let target: any;
        let reply: any;
        if (host.isSelf) {
            const landsReply = await getAllLands();
            target = requireSelectedTarget(landsReply?.lands || [], host, landId);
            reply = await sendDewUse(dewStack, host.gid, landId);
        } else {
            const enterReply = await enterFriendFarm(Number(host.gid));
            try {
                const enteredHost = friendHost(enterReply, host.gid);
                target = requireSelectedTarget(enterReply?.lands || [], enteredHost, landId);
                // Visit state must remain active until ItemService.Use completes.
                reply = await sendDewUse(dewStack, host.gid, landId);
            } finally {
                await leaveFriendFarm(Number(host.gid));
            }
        }

        const directRewards = Array.isArray(reply?.items) ? reply.items : [];
        const landRewards = Array.isArray(reply?.land_reward?.items) ? reply.land_reward.items : [];
        const rewards = [...directRewards, ...landRewards].map(itemDto);
        const usedItems = (Array.isArray(reply?.used_items) ? reply.used_items : []).map(itemDto);
        return {
            hostGid: host.gid,
            landId,
            target,
            updatedLand: reply?.land || null,
            rewardLandId: int64String(reply?.land_reward?.land_id),
            usedItems,
            rewards,
            message: `已在${host.isSelf ? '自己农场' : `${target.ownerName}的农场`}第 ${landId} 块地使用 1 份鹊羽灵露`,
            snapshot: await require('./activity-center').getActivityCenterSnapshot(),
        };
    });
}

module.exports = {
    QIXI_DEW_ITEM_ID,
    buildDewLandTargets,
    getQixiDewTargets,
    useQixiDew,
};
