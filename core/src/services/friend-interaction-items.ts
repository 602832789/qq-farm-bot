/** 好友土地特殊互动道具：库存发现、协议适配与顺序批量使用。 */

export {};

const LongModule = require('long');
const { PlantPhase } = require('../config/config');
const { getItemById, getItemImageById } = require('../config/gameConfig');
const { isSellConditionSatisfied } = require('../config/sell-conditions');
const { sendMsgAsync, GatewayError } = require('../utils/network');
const { types } = require('../utils/proto');
const { toNum } = require('../utils/utils');
const { getSellConditionContext } = require('./activity-windows');
const { buildLandMap, getCurrentPhase, getDisplayLandContext } = require('./farm/land-analysis');
const { enterFriendFarm, leaveFriendFarm } = require('./friend/api');
const { getBag, getBagItems } = require('./warehouse');

const SPECIAL_INTERACTION_TYPE = 'additemuseitem';
const MAX_BATCH_LANDS = 48;
const MAX_SIGNED_INT64 = 9223372036854775807n;

class FriendInteractionBusinessError extends Error {
    code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = 'FriendInteractionBusinessError';
        this.code = code;
    }
}

function businessError(code: string, message: string): FriendInteractionBusinessError {
    return new FriendInteractionBusinessError(code, message);
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

function safePositiveNumber(value: unknown, code: string, fieldName: string): number {
    const normalized = positiveDecimal(value, code, fieldName);
    const numeric = Number(normalized);
    if (!Number.isSafeInteger(numeric) || numeric <= 0) {
        throw businessError(code, `${fieldName} 超出当前客户端可处理范围`);
    }
    return numeric;
}

function normalizeLandIds(value: unknown): string[] {
    const source = Array.isArray(value) ? value : [value];
    const unique = new Set<string>();
    for (const entry of source) {
        unique.add(positiveDecimal(entry, 'INVALID_FRIEND_INTERACTION_LAND_IDS', 'landIds'));
    }
    if (unique.size === 0) {
        throw businessError('INVALID_FRIEND_INTERACTION_LAND_IDS', '至少选择一块地');
    }
    if (unique.size > MAX_BATCH_LANDS) {
        throw businessError('INVALID_FRIEND_INTERACTION_LAND_IDS', `单次最多选择 ${MAX_BATCH_LANDS} 块地`);
    }
    return [...unique].sort((left, right) => {
        const leftId = BigInt(left);
        const rightId = BigInt(right);
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    });
}

function isFriendLandInteractionMetadata(info: any): boolean {
    if (!info || typeof info !== 'object') return false;
    if (Number(info.type) !== 23 || Number(info.can_use) <= 0) return false;
    if (String(info.interaction_type || '').trim().toLowerCase() !== SPECIAL_INTERACTION_TYPE) return false;

    const id = Number(info.id) || 0;
    if (id === 301101 || id === 301102 || id === 301103) return true;

    // 排除同属 additemuseItem、但描述明确只作用于自己作物的物品。
    const targetDescription = `${String(info.desc || '')} ${String(info.effectDesc || '')}`;
    return /好友|他人/.test(targetDescription);
}

function getStackExpireTime(stack: any): number {
    return toNum(stack?.expire_time ?? stack?.expireTime);
}

function isStackSaleConditionSatisfied(info: any, stack: any, baseContext: any): boolean {
    const condition = String(info?.sell_cond || '').trim();
    if (!condition) return false;
    return isSellConditionSatisfied(condition, {
        ...baseContext,
        expireTime: getStackExpireTime(stack),
    });
}

function eligibleStacksForItem(bagItems: any[], itemId: number, info: any, baseContext: any): any[] {
    return (Array.isArray(bagItems) ? bagItems : [])
        .filter((stack: any) => (
            toNum(stack?.id ?? stack?.item_id) === itemId
            && toNum(stack?.uid) > 0
            && toNum(stack?.count) > 0
        ))
        .map((stack: any) => ({
            raw: stack,
            remaining: Math.max(0, toNum(stack?.count)),
            expireTime: getStackExpireTime(stack),
            saleConditionSatisfied: isStackSaleConditionSatisfied(info, stack, baseContext),
        }))
        .sort((left: any, right: any) => {
            const leftExpire = left.expireTime > 0 ? left.expireTime : Number.MAX_SAFE_INTEGER;
            const rightExpire = right.expireTime > 0 ? right.expireTime : Number.MAX_SAFE_INTEGER;
            return leftExpire - rightExpire;
        });
}

function buildInteractionItemDto(info: any, stacks: any[]): any {
    const count = stacks.reduce((sum: number, stack: any) => sum + Math.max(0, Number(stack.remaining) || 0), 0);
    const saleConditionSatisfiedCount = stacks
        .filter((stack: any) => stack.saleConditionSatisfied)
        .reduce((sum: number, stack: any) => sum + Math.max(0, Number(stack.remaining) || 0), 0);
    const expirations = stacks
        .map((stack: any) => Number(stack.expireTime) || 0)
        .filter((expireTime: number) => expireTime > 0)
        .sort((left: number, right: number) => left - right);
    const itemId = Number(info.id) || 0;
    return {
        id: String(itemId),
        itemId: String(itemId),
        name: String(info.name || `物品${itemId}`),
        image: getItemImageById(itemId) || '',
        count,
        saleConditionSatisfiedCount,
        interactionType: String(info.interaction_type || ''),
        protocol: 'item-use',
        description: String(info.desc || info.effectDesc || ''),
        activityId: info.activity_id == null ? '' : String(info.activity_id),
        sellCondition: String(info.sell_cond || ''),
        nearestExpireTime: expirations[0] || 0,
        serverValidationRequired: true,
    };
}

async function collectFriendInteractionInventory(): Promise<{ items: any[]; stacksByItemId: Map<number, any[]> }> {
    const [bagReply, baseContext] = await Promise.all([getBag(), getSellConditionContext()]);
    const bagItems = getBagItems(bagReply);
    const itemIds = new Set<number>();
    for (const stack of (Array.isArray(bagItems) ? bagItems : [])) {
        const itemId = toNum(stack?.id ?? stack?.item_id);
        if (itemId > 0 && toNum(stack?.count) > 0) itemIds.add(itemId);
    }

    const items: any[] = [];
    const stacksByItemId = new Map<number, any[]>();
    for (const itemId of itemIds) {
        const info = getItemById(itemId);
        if (!isFriendLandInteractionMetadata(info)) continue;
        const allItemStacks = bagItems.filter((stack: any) => toNum(stack?.id ?? stack?.item_id) === itemId);
        const stacks = eligibleStacksForItem(allItemStacks, itemId, info, baseContext);
        const dto = buildInteractionItemDto(info, stacks);
        if (dto.count <= 0) continue;
        stacksByItemId.set(itemId, stacks);
        items.push(dto);
    }

    items.sort((left: any, right: any) => {
        if (right.count !== left.count) return right.count - left.count;
        return Number(left.itemId) - Number(right.itemId);
    });
    return { items, stacksByItemId };
}

async function getFriendInteractionItems(): Promise<any> {
    const inventory = await collectFriendInteractionInventory();
    return {
        items: inventory.items,
        count: inventory.items.length,
        serverValidationRequired: true,
        confirmationRequired: true,
        message: inventory.items.length > 0
            ? '特殊互动道具由服务端在实际使用时最终校验'
            : '背包中暂无可用于好友土地的特殊互动道具',
    };
}

function buildTargetLandMap(landsInput: any[]): Map<string, any> {
    const lands = Array.isArray(landsInput) ? landsInput : [];
    const landsMap = buildLandMap(lands);
    const targets = new Map<string, any>();
    for (const land of lands) {
        if (!land?.unlocked) continue;
        const context = getDisplayLandContext(land, landsMap);
        if (context.occupiedByMaster) continue;
        const sourceLand = context.sourceLand || land;
        const landId = toNum(sourceLand?.id);
        if (landId <= 0 || targets.has(String(landId))) continue;
        const plant = sourceLand?.plant;
        if (!plant || !Array.isArray(plant.phases) || plant.phases.length === 0) continue;
        const currentPhase = getCurrentPhase(plant.phases, false, '');
        if (toNum(currentPhase?.phase) === PlantPhase.DEAD) continue;
        targets.set(String(landId), {
            landId: String(landId),
            plantId: int64String(plant.id),
            occupiedLandIds: (Array.isArray(context.occupiedLandIds) ? context.occupiedLandIds : [landId])
                .map((id: any) => String(toNum(id)))
                .filter((id: string) => id !== '0'),
        });
    }
    return targets;
}

function currentStack(stacks: any[]): any | null {
    return stacks.find((stack: any) => Number(stack.remaining) > 0) || null;
}

async function sendTargetedItemUse(itemId: number, stack: any, friendGid: string, landId: string): Promise<any> {
    const request = types.UseRequest.create({
        item: {
            id: itemId,
            count: 1,
            uid: stack.raw.uid,
        },
        target: {
            host_gid: friendGid,
            land_ids: [landId],
            use_config_id: 0,
        },
    });
    const body = Buffer.from(types.UseRequest.encode(request).finish());
    const { body: replyBody } = await sendMsgAsync('gamepb.itempb.ItemService', 'Use', body);
    return types.UseReply.decode(replyBody);
}

function normalizedErrorCode(error: any): string {
    return String(error?.code || String(error?.message || '').match(/\bcode=(\d+)\b/)?.[1] || 'FRIEND_INTERACTION_USE_FAILED');
}

function interactionFailure(itemName: string, landId: string, error: any, target: any = null): any {
    const code = normalizedErrorCode(error);
    const knownMessages: Record<string, string> = {
        '1001065': `该地块当前不符合${itemName}的使用条件，作物品级或状态可能已变化`,
        '1003008': `该好友农场当前已达到${itemName}的使用限制`,
        FRIEND_INTERACTION_TARGET_UNAVAILABLE: '该地块已经没有可互动的作物',
    };
    const serverMessage = String(error?.errorMessage || '').trim();
    const businessMessage = error instanceof FriendInteractionBusinessError ? String(error.message || '') : '';
    return {
        landId,
        ok: false,
        code,
        message: knownMessages[code] || businessMessage || serverMessage || `服务器未接受该地块的${itemName}使用请求`,
        target,
    };
}

function normalizeReplyItems(itemsInput: any[]): any[] {
    return (Array.isArray(itemsInput) ? itemsInput : []).map((item: any) => ({
        id: int64String(item?.id ?? item?.item_id),
        count: int64String(item?.count),
        landId: int64String(item?.land_id),
    }));
}

async function performFriendInteractionItemBatch(friendGidInput: unknown, itemIdInput: unknown, landIdsInput: unknown): Promise<any> {
    const friendGid = positiveDecimal(friendGidInput, 'INVALID_FRIEND_INTERACTION_GID', 'friendGid');
    const friendGidNumber = safePositiveNumber(friendGid, 'INVALID_FRIEND_INTERACTION_GID', 'friendGid');
    const itemId = safePositiveNumber(itemIdInput, 'INVALID_FRIEND_INTERACTION_ITEM_ID', 'itemId');
    const landIds = normalizeLandIds(landIdsInput);
    const info = getItemById(itemId);
    if (!isFriendLandInteractionMetadata(info)) {
        throw businessError('FRIEND_INTERACTION_ITEM_UNSUPPORTED', '该物品不是可用于好友土地的特殊互动道具');
    }

    const inventory = await collectFriendInteractionInventory();
    const stacks = inventory.stacksByItemId.get(itemId) || [];
    const available = stacks.reduce((sum: number, stack: any) => sum + Math.max(0, Number(stack.remaining) || 0), 0);
    if (available <= 0) {
        throw businessError('FRIEND_INTERACTION_ITEM_UNAVAILABLE', `${info.name || `物品${itemId}`}当前没有可提交服务器校验的库存`);
    }
    if (landIds.length > available) {
        throw businessError('FRIEND_INTERACTION_SELECTION_EXCEEDS_BALANCE', `已选择 ${landIds.length} 块地，但当前只有 ${available} 个${info.name || `物品${itemId}`}`);
    }

    const enterReply = await enterFriendFarm(friendGidNumber);
    const attempts: any[] = [];
    try {
        const actualGid = int64String(enterReply?.basic?.gid);
        if (actualGid !== '0' && actualGid !== friendGid) {
            throw businessError('FRIEND_INTERACTION_HOST_MISMATCH', '进入的好友农场与所选 GID 不一致');
        }
        const targetMap = buildTargetLandMap(enterReply?.lands || []);
        for (let index = 0; index < landIds.length; index += 1) {
            const landId = landIds[index];
            const target = targetMap.get(landId) || null;
            if (!target) {
                attempts.push(interactionFailure(
                    String(info.name || `物品${itemId}`),
                    landId,
                    businessError('FRIEND_INTERACTION_TARGET_UNAVAILABLE', '所选地块已无可互动作物'),
                ));
                continue;
            }

            const stack = currentStack(stacks);
            if (!stack) {
                attempts.push(interactionFailure(
                    String(info.name || `物品${itemId}`),
                    landId,
                    businessError('FRIEND_INTERACTION_ITEM_DEPLETED', '本次可用库存已经用完'),
                    target,
                ));
                continue;
            }

            try {
                const reply = await sendTargetedItemUse(itemId, stack, friendGid, landId);
                stack.remaining -= 1;
                attempts.push({
                    landId,
                    ok: true,
                    code: '',
                    message: `第 ${landId} 块地使用成功`,
                    target,
                    updatedLand: reply?.land || null,
                    consumed: normalizeReplyItems(reply?.consumed || reply?.used_items || []),
                    rewards: normalizeReplyItems([
                        ...(Array.isArray(reply?.rewards) ? reply.rewards : []),
                        ...(Array.isArray(reply?.items) ? reply.items : []),
                        ...(Array.isArray(reply?.land_reward?.items) ? reply.land_reward.items : []),
                    ]),
                });
            } catch (error: any) {
                attempts.push(interactionFailure(String(info.name || `物品${itemId}`), landId, error, target));
                const gatewayFailure = typeof GatewayError === 'function' && error instanceof GatewayError;
                if (!gatewayFailure && !(error instanceof FriendInteractionBusinessError)) {
                    for (const remainingLandId of landIds.slice(index + 1)) {
                        attempts.push({
                            landId: remainingLandId,
                            ok: false,
                            code: 'FRIEND_INTERACTION_BATCH_ABORTED',
                            message: '前序请求被中断，本地未继续提交该地块',
                            target: targetMap.get(remainingLandId) || null,
                        });
                    }
                    break;
                }
            }
        }
    } finally {
        await leaveFriendFarm(friendGidNumber);
    }

    const succeeded = attempts.filter((attempt: any) => attempt.ok);
    const failed = attempts.filter((attempt: any) => !attempt.ok);
    const ownerName = String(enterReply?.basic?.remark || enterReply?.basic?.name || `GID:${friendGid}`);
    const itemName = String(info.name || `物品${itemId}`);
    const refreshedInventory = await getFriendInteractionItems();
    return {
        hostGid: friendGid,
        ownerName,
        itemId: String(itemId),
        itemName,
        protocol: 'item-use',
        requestedLandIds: landIds,
        usedLandIds: succeeded.map((attempt: any) => attempt.landId),
        failedLandIds: failed.map((attempt: any) => attempt.landId),
        successCount: succeeded.length,
        failureCount: failed.length,
        results: attempts,
        items: refreshedInventory.items,
        message: failed.length > 0
            ? `已在${ownerName}的农场按顺序使用 ${succeeded.length} 个${itemName}，跳过 ${failed.length} 块地`
            : `已在${ownerName}的农场按顺序使用 ${succeeded.length} 个${itemName}`,
    };
}

let mutationTail: Promise<void> = Promise.resolve();

function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = mutationTail.then(operation, operation);
    mutationTail = run.then(() => undefined, () => undefined);
    return run;
}

function useFriendInteractionItemBatch(friendGidInput: unknown, itemIdInput: unknown, landIdsInput: unknown): Promise<any> {
    return serializeMutation(() => performFriendInteractionItemBatch(friendGidInput, itemIdInput, landIdsInput));
}

module.exports = {
    MAX_BATCH_LANDS,
    isFriendLandInteractionMetadata,
    getFriendInteractionItems,
    useFriendInteractionItemBatch,
};
