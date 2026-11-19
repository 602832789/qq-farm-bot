export {};

const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { toLong, toNum, logWarn } = require('../utils/utils');
const { getItemById, getItemImageById, getPlantByFruitId } = require('../config/gameConfig');

export interface CareerInfo {
    gid: number;
    harvest: number;
    steal: number;
    level: number;
    name: string;
}

export interface CareerHarvestItem {
    seedId: number;
    fruitId: number;
    name: string;
    image: string;
    harvestCount: number;
}

/** 个人页（角色生涯）完整数据，字段与老版本 /api/career 保持一致。 */
export interface CareerProfile {
    items: CareerHarvestItem[];
    totalHarvestCount: number;
    totalStealCount: number;
    name: string;
    avatar: string;
    level: number;
    exp: number;
    gid: number;
    platform: number;
    openId: string;
}

async function requestCareerReply(gid: number): Promise<any> {
    const numericGid: number = toNum(gid);
    if (!numericGid) throw new Error('缺少有效的角色 GID');

    const body: Uint8Array = types.CareerInfoGetRequest.encode(types.CareerInfoGetRequest.create({
        gid: toLong(numericGid),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.careerpb.CareerService', 'CareerInfoGet', body);
    return types.CareerInfoGetReply.toObject(
        types.CareerInfoGetReply.decode(replyBody),
        { longs: Number, defaults: true },
    );
}

/** 把协议回包转成个人页结构；纯函数，方便单测覆盖字段映射。 */
export function buildCareerProfile(reply: any, fallbackGid: number = 0): CareerProfile {
    const items: CareerHarvestItem[] = (reply?.harvest_items || reply?.harvestItems || []).map((raw: any) => {
        const fruitId = toNum(raw?.fruit_id ?? raw?.fruitId);
        const config = getItemById(fruitId);
        const plant = getPlantByFruitId(fruitId);
        return {
            seedId: fruitId,
            fruitId,
            name: String(config?.name || plant?.name || `果实${fruitId}`),
            image: getItemImageById(fruitId),
            harvestCount: toNum(raw?.harvest_count ?? raw?.harvestCount),
        };
    });

    return {
        items,
        totalHarvestCount: toNum(reply?.total_harvest_count ?? reply?.totalHarvestCount),
        totalStealCount: toNum(reply?.total_steal_count ?? reply?.totalStealCount),
        name: String(reply?.name || ''),
        avatar: String(reply?.avatar_url ?? reply?.avatarUrl ?? ''),
        level: toNum(reply?.level),
        exp: toNum(reply?.exp),
        gid: toNum(reply?.gid) || toNum(fallbackGid),
        platform: toNum(reply?.platform),
        openId: String(reply?.open_id ?? reply?.openId ?? ''),
    };
}

/** 个人页用：返回收获明细与完整角色资料。 */
async function getCareerProfile(gid: number): Promise<CareerProfile> {
    const numericGid = toNum(gid);
    const reply = await requestCareerReply(numericGid);
    return buildCareerProfile(reply, numericGid);
}

/** 偷菜过滤 / 土地详情用：只取简版收偷数量，行为保持不变。 */
async function getCareerInfo(gid: number): Promise<CareerInfo> {
    const reply = await requestCareerReply(gid);
    return {
        gid: toNum(reply.gid) || toNum(gid),
        harvest: toNum(reply.total_harvest_count ?? reply.totalHarvestCount),
        steal: toNum(reply.total_steal_count ?? reply.totalStealCount),
        level: toNum(reply.level),
        name: String(reply.name || ''),
    };
}

async function getCareerInfoOrNull(gid: number, propagateErrors: boolean = false): Promise<CareerInfo | null> {
    try {
        return await getCareerInfo(gid);
    } catch (error: any) {
        if (propagateErrors) throw error;
        logWarn('生涯', `查询失败: ${error && error.message ? error.message : error}`);
        return null;
    }
}

module.exports = { getCareerInfo, getCareerInfoOrNull, getCareerProfile, buildCareerProfile };
