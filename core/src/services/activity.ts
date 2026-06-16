export {};
/**
 * 活动服务 - 获取活动列表、参与活动、领取奖励
 */

const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { log, toNum, sleep } = require('../utils/utils');

// 活动类型常量
const ACTIVITY_TYPE_LOTTERY = 8;   // 抽奖类
const ACTIVITY_TYPE_SHOP = 3;      // 商店类
const ACTIVITY_TYPE_DAILY = 1;     // 每日任务类

// 操作类型常量
const OPERATE_CLAIM = 1;           // 领取奖励
const OPERATE_DRAW = 7;            // 抽奖
const OPERATE_DRAW_MULTI = 9;      // 十连抽
const OPERATE_VIEW = 10;           // 查看/进入活动

/**
 * 获取活动列表
 */
async function getActivityList(): Promise<any> {
    const body: Uint8Array = types.ActivityListRequest.encode(types.ActivityListRequest.create({})).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.activitypb.ActivityService', 'List', body);
    return types.ActivityListReply.decode(replyBody);
}

/**
 * 获取活动组详情
 */
async function getActivityGroup(groupId: number): Promise<any> {
    const body: Uint8Array = types.ActivityGetGroupRequest.encode(types.ActivityGetGroupRequest.create({
        group_id: Number(groupId) || 0,
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.activitypb.ActivityService', 'GetGroup', body);
    return types.ActivityGetGroupReply.decode(replyBody);
}

/**
 * 活动操作
 */
async function operateActivity(activityId: number, operateType: number = 0, param: number = 0): Promise<any> {
    const body: Uint8Array = types.ActivityOperateRequest.encode(types.ActivityOperateRequest.create({
        activity_id: Number(activityId) || 0,
        operate_type: Number(operateType) || 0,
        param: Number(param) || 0,
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.activitypb.ActivityService', 'Operate', body);
    const reply = types.ActivityOperateReply.decode(replyBody);
    // 解析 data 字段中的抽奖信息
    const drawInfo = parseDrawInfo(reply.data);
    // 解析 rewards 字段中的实际中奖奖品
    const rewards = parseRewards(reply.rewards);
    console.log('[Activity] operateActivity:', { activityId, operateType, result: reply.result, dataLen: reply.data?.length, drawInfo, rewardCount: rewards.length });
    return { ...reply.toJSON(), drawInfo, rewards };
}

/**
 * 解析 varint
 */
function readVarint(buf: Buffer, offset: number): { value: number; next: number } | null {
    let result = 0, shift = 0, pos = offset;
    while (pos < buf.length) {
        const b = buf[pos]; pos++;
        result |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
    }
    return pos <= buf.length ? { value: result >>> 0, next: pos } : null;
}

/**
 * 解析 OperateReply.data 中的抽奖信息 (field 105)
 */
function parseDrawInfo(data: Buffer | null): any {
    if (!data || data.length === 0) return null;

    try {
        // 找 field 105
        let off = 0;
        while (off < data.length) {
            const tag = readVarint(data, off);
            if (!tag) break;
            const fn = tag.value >> 3, wt = tag.value & 0x7;
            if (fn === 105 && wt === 2) {
                const len = readVarint(data, tag.next);
                if (!len) break;
                return parseDrawConfig(data, len.next, len.next + len.value);
            }
            if (wt === 0) { const v = readVarint(data, tag.next); if (!v) break; off = v.next; }
            else if (wt === 2) { const v = readVarint(data, tag.next); if (!v) break; off = v.next + v.value; }
            else if (wt === 5) { off = tag.next + 4; }
            else if (wt === 1) { off = tag.next + 8; }
            else break;
        }
    } catch {}
    return null;
}

/**
 * 解析 field 105 的内容
 */
function parseDrawConfig(buf: Buffer, start: number, end: number): any {
    const config: any = { prizes: [] };
    let off = start;

    while (off < end) {
        const tag = readVarint(buf, off);
        if (!tag) break;
        const fn = tag.value >> 3, wt = tag.value & 0x7;

        if (wt === 0) {
            const v = readVarint(buf, tag.next);
            if (!v) break;
            if (fn === 1) config.freeRemaining = v.value;
            else if (fn === 2) config.freeLimit = v.value;
            else if (fn === 3) config.paidRemaining = v.value;
            else if (fn === 4) config.paidLimit = v.value;
            else if (fn === 5) config.ticketItemId = v.value;
            off = v.next;
        } else if (wt === 2) {
            const len = readVarint(buf, tag.next);
            if (!len) break;
            if (fn === 8) {
                const prize = parsePrizeItem(buf, len.next, len.next + len.value);
                if (prize) config.prizes.push(prize);
            }
            off = len.next + len.value;
        } else if (wt === 5) { off = tag.next + 4; }
        else if (wt === 1) { off = tag.next + 8; }
        else break;
    }

    return config;
}

/**
 * 解析奖品项 (field 105.field 8 / rewards field 108)
 */
function parsePrizeItem(buf: Buffer, start: number, end: number): any {
    const prize: any = {};
    let off = start;

    while (off < end) {
        const tag = readVarint(buf, off);
        if (!tag) break;
        const fn = tag.value >> 3, wt = tag.value & 0x7;

        if (wt === 0) {
            const v = readVarint(buf, tag.next);
            if (!v) break;
            if (fn === 1) prize.prizeId = v.value;
            else if (fn === 2) prize.quality = v.value;
            else if (fn === 4) prize.count = v.value;
            off = v.next;
        } else if (wt === 2) {
            const len = readVarint(buf, tag.next);
            if (!len) break;
            const sub = buf.slice(len.next, len.next + len.value);
            if (fn === 3) {
                // 种子信息: field 1 = seed_id, field 2 = count
                const seedTag = readVarint(sub, 0);
                if (seedTag) {
                    const seedVal = readVarint(sub, seedTag.next);
                    if (seedVal) prize.seedId = seedVal.value;
                }
            } else if (fn === 6) {
                // 概率字符串
                prize.probability = sub.toString();
            }
            off = len.next + len.value;
        } else if (wt === 5) { off = tag.next + 4; }
        else if (wt === 1) { off = tag.next + 8; }
        else break;
    }

    // 解析种子名称
    if (prize.seedId) {
        try {
            const { getPlantNameBySeedId } = require('../config/gameConfig');
            prize.seedName = getPlantNameBySeedId(prize.seedId);
        } catch {
            prize.seedName = `种子${prize.seedId}`;
        }
    }

    return prize.seedId ? prize : null;
}

/**
 * 解析 rewards 字段 (field 108) — 实际抽奖获得的奖品列表
 * rewards 是 repeated message，每个 item 结构与 parsePrizeItem 相同
 */
function parseRewards(rewards: Buffer | null): any[] {
    if (!rewards || rewards.length === 0) return [];

    const items: any[] = [];
    try {
        let off = 0;
        while (off < rewards.length) {
            const tag = readVarint(rewards, off);
            if (!tag) break;
            const fn = tag.value >> 3, wt = tag.value & 0x7;
            if (wt === 2) {
                const len = readVarint(rewards, tag.next);
                if (!len) break;
                const item = parsePrizeItem(rewards, len.next, len.next + len.value);
                if (item) items.push(item);
                off = len.next + len.value;
            } else if (wt === 0) {
                const v = readVarint(rewards, tag.next);
                if (!v) break;
                off = v.next;
            } else if (wt === 5) { off = tag.next + 4; }
            else if (wt === 1) { off = tag.next + 8; }
            else break;
        }
    } catch {}
    return items;
}

/**
 * 获取活动组中的所有活动
 */
async function getActivitiesInGroup(groupId: number): Promise<any[]> {
    try {
        const reply = await getActivityGroup(groupId);
        const group = reply.group;
        if (!group) return [];

        const activities = group.activities || [];
        const result: any[] = [];

        for (const item of activities) {
            const content = item.content;
            if (!content) continue;
            const extra = content.extra;
            let extraJson = null;
            if (extra && extra.length > 0) {
                try { extraJson = JSON.parse(extra.toString()); } catch {}
            }
            // 解析 field 105 (抽奖信息) - item.field_105 已经是 field 105 的内容
            const drawInfo = parseDrawConfig(item.field_105, 0, item.field_105?.length || 0);
            result.push({
                activityId: toNum(content.activity_id),
                groupId: toNum(content.group_id),
                type: toNum(content.type),
                name: content.name || '未知活动',
                beginTime: toNum(content.begin_time),
                endTime: toNum(content.end_time),
                sortOrder: toNum(content.sort_order),
                extra: extraJson,
                drawInfo,
            });
        }

        return result;
    } catch (e: any) {
        log('活动', `获取活动组失败: ${e.message}`);
        return [];
    }
}

/**
 * 领取活动奖励 (operate_type=1)
 */
async function claimActivityReward(activityId: number): Promise<{ success: boolean; rewardCount: number }> {
    try {
        const reply = await operateActivity(activityId, OPERATE_CLAIM);
        const result = toNum(reply.result);
        const hasRewards = reply.rewards && reply.rewards.length > 0;
        return { success: result > 0 || hasRewards, rewardCount: hasRewards ? 1 : 0 };
    } catch {
        return { success: false, rewardCount: 0 };
    }
}

/**
 * 自动领取所有可领取的活动奖励
 */
async function autoClaimActivityRewards(): Promise<{ claimed: number; errors: number }> {
    let claimed = 0;
    let errors = 0;

    try {
        // 获取当前活动组
        const listReply = await getActivityList();
        const activities = listReply.activities || [];

        if (activities.length === 0) {
            return { claimed: 0, errors: 0 };
        }

        for (const activity of activities) {
            const activityId = toNum(activity.activity_id);
            if (activityId <= 0) continue;

            try {
                const reply = await operateActivity(activityId, OPERATE_CLAIM);
                const result = toNum(reply.result);
                if (result > 0) {
                    claimed++;
                    log('活动', `领取奖励成功: ${activity.name || activityId}`);
                }
                await sleep(500);
            } catch {
                errors++;
            }
        }
    } catch (e: any) {
        log('活动', `自动领取奖励失败: ${e.message}`);
    }

    return { claimed, errors };
}

module.exports = {
    getActivityList,
    getActivityGroup,
    operateActivity,
    getActivitiesInGroup,
    claimActivityReward,
    autoClaimActivityRewards,
    // 常量
    ACTIVITY_TYPE_LOTTERY,
    ACTIVITY_TYPE_SHOP,
    ACTIVITY_TYPE_DAILY,
    OPERATE_CLAIM,
    OPERATE_DRAW,
    OPERATE_DRAW_MULTI,
    OPERATE_VIEW,
};
