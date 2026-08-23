export {};

const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { toLong, toNum } = require('../utils/utils');

export interface CareerInfo {
    gid: number;
    harvest: number;
    steal: number;
    level: number;
    name: string;
}

async function getCareerInfo(gid: number): Promise<CareerInfo> {
    const numericGid: number = toNum(gid);
    if (!numericGid) throw new Error('缺少有效的角色 GID');

    const body: Uint8Array = types.CareerInfoGetRequest.encode(types.CareerInfoGetRequest.create({
        gid: toLong(numericGid),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.careerpb.CareerService', 'CareerInfoGet', body);
    const reply: any = types.CareerInfoGetReply.decode(replyBody);

    return {
        gid: toNum(reply.gid) || numericGid,
        harvest: toNum(reply.total_harvest_count),
        steal: toNum(reply.total_steal_count),
        level: toNum(reply.level),
        name: String(reply.name || ''),
    };
}

module.exports = { getCareerInfo };
