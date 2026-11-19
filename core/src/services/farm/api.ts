export {};
/**
 * 低级农场 API - protobuf 请求、商店、铲除
 */

const protobuf = require('protobufjs');
const { sendMsgAsync, getUserState } = require('../../utils/network');
const { types } = require('../../utils/proto');
const { toLong, toNum, sleep, randomDelay, log, logWarn, toTimeSec } = require('../../utils/utils');
const { PlantPhase } = require('../../config/config');
const { getCurrentPhase } = require('./land-analysis');

// 操作限制更新回调 (由 friend.js 设置)
let onOperationLimitsUpdate: ((limits: any) => void) | null = null;
function setOperationLimitsCallback(callback: (limits: any) => void): void {
    onOperationLimitsUpdate = callback;
}

/**
 * 通用植物操作请求
 */
async function sendPlantRequest(
    RequestType: any,
    ReplyType: any,
    method: string,
    landIds: number[],
    hostGid: number | string,
): Promise<any> {
    const body = RequestType.encode(RequestType.create({
        land_ids: landIds,
        host_gid: toLong(hostGid),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.plantpb.PlantService', method, body);
    return ReplyType.decode(replyBody);
}

async function fetchAllLandsRaw(): Promise<any> {
    const forecast = require('../level-forecast');
    const revision = forecast.getLandForecastRevision();
    const body = types.AllLandsRequest.encode(types.AllLandsRequest.create({})).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.plantpb.PlantService', 'AllLands', body);
    const reply = types.AllLandsReply.decode(replyBody);
    forecast.rememberLandForecast(reply.lands, getUserState(), revision);
    // 更新操作限制
    if (reply.operation_limits && onOperationLimitsUpdate) {
        onOperationLimitsUpdate(reply.operation_limits);
    }
    return reply;
}

/**
 * 读自家地块。
 *
 * 每次调用都直接读服务端最新状态。2026-11-05 回滚了「1.2s TTL 快照 + 并发合并」：
 * 那份缓存在硬预算时期用来省请求，但它会让「刚种完/刚收完立刻再读」拿到旧地块，
 * 手动操作与自动任务在同一秒内交错时尤其容易误判。现在预算已改为只约束自动任务的
 * 保险丝，前台操作不会再被限额，因此恢复每次都读实时数据。
 */
async function getAllLands(): Promise<any> {
    return fetchAllLandsRaw();
}

async function harvest(landIds: number[]): Promise<any> {
    const state = getUserState();
    const body = types.HarvestRequest.encode(types.HarvestRequest.create({
        land_ids: landIds,
        host_gid: toLong(state.gid),
        is_all: true,
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.plantpb.PlantService', 'Harvest', body);
    return types.HarvestReply.decode(replyBody);
}

async function waterLand(landIds: number[]): Promise<any> {
    const state = getUserState();
    return sendPlantRequest(types.WaterLandRequest, types.WaterLandReply, 'WaterLand', landIds, state.gid);
}

async function farming(landIds: number[], socialEventItemIds: Array<number | string> = []): Promise<any> {
    const state = getUserState();
    const body = encodeOwnFarmingRequest(landIds, state.gid, socialEventItemIds);
    const { body: replyBody } = await sendMsgAsync('gamepb.plantpb.PlantService', 'Farming', body);
    return types.FarmingReply.decode(replyBody);
}

/**
 * 自家单点/一键务农。官方抓包会显式编码两个值为 0 的场景字段；不能依赖 proto3 默认省略。
 * 青蛙使坏瓶属于农场级社交事件，存在时还会以 packed int64 写入 field 5。
 * 好友帮助务农使用 field_4=2，由 friend/api.ts 单独编码。
 */
function encodeOwnFarmingRequest(
    landIds: number[],
    hostGid: number | string,
    socialEventItemIds: Array<number | string> = [],
): Uint8Array {
    const normalizedSocialEventItemIds = [...new Set(
        (Array.isArray(socialEventItemIds) ? socialEventItemIds : [])
            .map((value: number | string) => toNum(value))
            .filter((value: number) => value > 0),
    )];
    return types.FarmingRequest.encode(types.FarmingRequest.create({
        land_ids: landIds,
        host_gid: toLong(hostGid),
        field_3: 0,
        field_4: 0,
        social_event_item_ids: normalizedSocialEventItemIds.map((value: number) => toLong(value)),
    })).finish();
}

// 普通肥料 ID
const NORMAL_FERTILIZER_ID: number = 1011;
// 有机肥料 ID
const ORGANIC_FERTILIZER_ID: number = 1012;
const MAX_ORGANIC_FERTILIZE_OPERATIONS: number = 240;
const MAX_ORGANIC_FERTILIZE_ROUNDS: number = 20;

async function fertilizeOne(landId: number, fertilizerId: number = NORMAL_FERTILIZER_ID): Promise<any> {
    return fertilizeBatch([landId], fertilizerId);
}

// 官方一键施肥：一条请求提交多个地块，每个地块只施一次。
async function fertilizeBatch(landIds: number[], fertilizerId: number, options: { validateBeforeSend?: () => void } = {}): Promise<any> {
    if (typeof options?.validateBeforeSend === 'function')
        options.validateBeforeSend();
    const body = types.FertilizeRequest.encode(types.FertilizeRequest.create({
        land_ids: landIds.map((landId: number) => toLong(landId)),
        fertilizer_id: toLong(fertilizerId),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.plantpb.PlantService', 'Fertilize', body);
    const reply = types.FertilizeReply.decode(replyBody);
    if (reply.operation_limits && onOperationLimitsUpdate) {
        onOperationLimitsUpdate(reply.operation_limits);
    }
    return reply;
}

function getGatewayErrorCode(error: any): number {
    const fromField = toNum(error?.code ?? error?.errorCode ?? error?.error_code);
    if (fromField > 0) return fromField;
    const match = String(error?.message || '').match(/\bcode=(\d+)\b/i);
    return match ? toNum(match[1]) : 0;
}

function isSkippableFertilizeLandError(error: any): boolean {
    const code = getGatewayErrorCode(error);
    return code === 1001024 || code === 1001025;
}

/**
 * 自动施肥保留逐块执行方式；手动一键施肥使用 fertilizeBatch。
 * 游戏中拖动施肥间隔很短，这里用 50ms
 */
async function fertilize(landIds: number[], fertilizerId: number = NORMAL_FERTILIZER_ID, propagateErrors: boolean = false): Promise<number> {
    let successCount: number = 0;
    for (const landId of landIds) {
        try {
            const body = types.FertilizeRequest.encode(types.FertilizeRequest.create({
                land_ids: [toLong(landId)],
                fertilizer_id: toLong(fertilizerId),
            })).finish();
            await sendMsgAsync('gamepb.plantpb.PlantService', 'Fertilize', body);
            successCount++;
        } catch (error) {
            if (isSkippableFertilizeLandError(error)) {
                log('施肥', `第 ${landId} 块地当前不能施肥，已跳过`, {
                    module: 'farm',
                    event: '施肥',
                    result: 'skip',
                    landId,
                    code: getGatewayErrorCode(error),
                });
            } else if (propagateErrors) {
                throw error;
            } else {
                break;
            }
        }
        if (landIds.length > 1) await sleep(50);  // 50ms 间隔
    }
    return successCount;
}

/**
 * 有机肥循环施肥:
 * 按地块顺序循环施肥，失败或达到单次操作上限时停止。
 *
 * options.ripenSize2（老版 2x2 催熟模式）：每施一次都校验施肥结果里的作物状态，
 * 成熟/枯死/确认不了生长推进/肥料耗尽时立即停止，避免把肥料浪费在打不满的循环上。
 */
async function fertilizeOrganicLoop(
    landIds: number[] | any[],
    options: { propagateErrors?: boolean; ripenSize2?: boolean } | boolean = false,
): Promise<number> {
    // 兼容旧的布尔参数签名（propagateErrors）。
    const opts: { propagateErrors?: boolean; ripenSize2?: boolean } = typeof options === 'boolean'
        ? { propagateErrors: options }
        : (options || {});
    const propagateErrors = opts.propagateErrors === true;
    const ripenSize2 = opts.ripenSize2 === true;
    const ids: number[] = (Array.isArray(landIds) ? landIds : []).filter(Boolean);
    if (ids.length === 0) return 0;

    let successCount: number = 0;
    let idx: number = 0;
    let previousMatureTime: number = 0;
    const operationLimit = Math.min(
        MAX_ORGANIC_FERTILIZE_OPERATIONS,
        ids.length * MAX_ORGANIC_FERTILIZE_ROUNDS,
    );

    while (successCount < operationLimit) {
        const landId = ids[idx];
        try {
            const body = types.FertilizeRequest.encode(types.FertilizeRequest.create({
                land_ids: [toLong(landId)],
                fertilizer_id: toLong(ORGANIC_FERTILIZER_ID),
            })).finish();
            const { body: replyBody } = await sendMsgAsync('gamepb.plantpb.PlantService', 'Fertilize', body);
            successCount++;
            if (ripenSize2) {
                const reply = types.FertilizeReply.decode(replyBody);
                const updatedLand = (reply.land || []).find((land: any) => toNum(land && land.id) === toNum(landId));
                const plant = updatedLand && updatedLand.plant;
                const phase = plant && getCurrentPhase(plant.phases, false, '', toNum(plant.id));
                if (!phase || phase.phase === PlantPhase.UNKNOWN) {
                    logWarn('施肥', `2x2催熟：土地 ${landId} 缺少有效施肥结果，已停止本轮催熟`);
                    break;
                }
                if (phase.phase === PlantPhase.MATURE || phase.phase === PlantPhase.DEAD) break;
                const matureTime = Math.max(0, ...(Array.isArray(plant.phases) ? plant.phases : []).map((p: any) => toTimeSec(p && p.begin_time)));
                if (!matureTime || (previousMatureTime && matureTime >= previousMatureTime)) {
                    logWarn('施肥', `2x2催熟：土地 ${landId} 未确认生长推进，已停止本轮催熟`);
                    break;
                }
                previousMatureTime = matureTime;
                if (reply.fertilizer && Object.prototype.hasOwnProperty.call(reply.fertilizer, 'count') && toNum(reply.fertilizer.count) <= 0) break;
            }
        } catch (error: any) {
            // 常见是有机肥耗尽，按需求直接停止
            if (ripenSize2) {
                logWarn('施肥', `2x2催熟：土地 ${landId} 有机肥施肥停止: ${error && error.message ? error.message : error}`);
            }
            if (propagateErrors) throw error;
            break;
        }

        idx = (idx + 1) % ids.length;
        await randomDelay(1000, 1500);
    }

    if (successCount >= operationLimit) {
        logWarn('施肥', `有机肥循环达到单次上限 ${operationLimit}，已停止继续请求`);
    }

    return successCount;
}

async function removePlant(landIds: number[]): Promise<any> {
    const body = types.RemovePlantRequest.encode(types.RemovePlantRequest.create({
        land_ids: landIds.map(id => toLong(id)),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.plantpb.PlantService', 'RemovePlant', body);
    return types.RemovePlantReply.decode(replyBody);
}

async function upgradeLand(landId: number): Promise<any> {
    const body = types.UpgradeLandRequest.encode(types.UpgradeLandRequest.create({
        land_id: toLong(landId),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.plantpb.PlantService', 'UpgradeLand', body);
    return types.UpgradeLandReply.decode(replyBody);
}

async function unlockLand(landId: number, doShared: boolean = false): Promise<any> {
    const body = types.UnlockLandRequest.encode(types.UnlockLandRequest.create({
        land_id: toLong(landId),
        do_shared: !!doShared,
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.plantpb.PlantService', 'UnlockLand', body);
    return types.UnlockLandReply.decode(replyBody);
}

// ============ 商店 API ============

async function getShopInfo(shopId: number): Promise<any> {
    const body = types.ShopInfoRequest.encode(types.ShopInfoRequest.create({
        shop_id: toLong(shopId),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.shoppb.ShopService', 'ShopInfo', body);
    return types.ShopInfoReply.decode(replyBody);
}

async function buyGoods(goodsId: number, num: number, price: number): Promise<any> {
    const body = types.BuyGoodsRequest.encode(types.BuyGoodsRequest.create({
        goods_id: toLong(goodsId),
        num: toLong(num),
        price: toLong(price),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.shoppb.ShopService', 'BuyGoods', body);
    return types.BuyGoodsReply.decode(replyBody);
}

// ============ 变异图鉴 ============

async function readMutantBook(): Promise<void> {
    const body: Uint8Array = types.ReadMutantBookRequest.encode(types.ReadMutantBookRequest.create({})).finish();
    await sendMsgAsync('gamepb.mutantpb.MutantService', 'ReadMutantBook', body);
}

// ============ 种植编码 ============

function encodePlantRequest(seedId: number | string, landIds: number[]): Uint8Array {
    const writer = protobuf.Writer.create();
    const itemWriter = writer.uint32(18).fork();
    itemWriter.uint32(8).int64(seedId);
    const idsWriter = itemWriter.uint32(18).fork();
    for (const id of landIds) {
        idsWriter.int64(id);
    }
    idsWriter.ldelim();
    itemWriter.ldelim();
    return writer.finish();
}

module.exports = {
    setOperationLimitsCallback,
    sendPlantRequest,
    getAllLands,
    harvest,
    waterLand,
    farming,
    encodeOwnFarmingRequest,
    fertilizeOne,
    fertilizeBatch,
    fertilize,
    NORMAL_FERTILIZER_ID,
    ORGANIC_FERTILIZER_ID,
    isSkippableFertilizeLandError,
    fertilizeOrganicLoop,
    removePlant,
    upgradeLand,
    unlockLand,
    getShopInfo,
    buyGoods,
    encodePlantRequest,
    readMutantBook,
};
