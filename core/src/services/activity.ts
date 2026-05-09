export {};
/**
 * 活动服务 - 获取活动列表、参与活动、领取奖励
 */

const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { log, toNum } = require('../utils/utils');

async function getActivityList(): Promise<any> {
    const body: Uint8Array = types.ActivityListRequest.encode(types.ActivityListRequest.create({})).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.activitypb.ActivityService', 'List', body);
    return types.ActivityListReply.decode(replyBody);
}

async function getActivityGroup(groupId: number): Promise<any> {
    const body: Uint8Array = types.ActivityGetGroupRequest.encode(types.ActivityGetGroupRequest.create({
        group_id: Number(groupId) || 0,
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.activitypb.ActivityService', 'GetGroup', body);
    return types.ActivityGetGroupReply.decode(replyBody);
}

async function operateActivity(activityId: number, operateType: number = 0, param: number = 0): Promise<any> {
    const body: Uint8Array = types.ActivityOperateRequest.encode(types.ActivityOperateRequest.create({
        activity_id: Number(activityId) || 0,
        operate_type: Number(operateType) || 0,
        param: Number(param) || 0,
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.activitypb.ActivityService', 'Operate', body);
    return types.ActivityOperateReply.decode(replyBody);
}

function getRewardSummary(items: any[]): string {
    const list: any[] = Array.isArray(items) ? items : [];
    const summary: string[] = [];
    for (const it of list) {
        const id: number = toNum(it.id);
        const count: number = toNum(it.count);
        if (count <= 0) continue;
        if (id === 1 || id === 1001) summary.push(`金币${count}`);
        else if (id === 2 || id === 1101) summary.push(`经验${count}`);
        else if (id === 1002) summary.push(`点券${count}`);
        else summary.push(`物品#${id}x${count}`);
    }
    return summary.join('/');
}

async function claimActivityRewards(): Promise<{ claimed: number; rewardItems: number }> {
    try {
        const listReply = await getActivityList();
        const activities = listReply.activities || [];
        if (activities.length === 0) {
            return { claimed: 0, rewardItems: 0 };
        }

        let claimed = 0;
        const rewards: any[] = [];

        for (const activity of activities) {
            const activityId = toNum(activity.activity_id);
            const status = toNum(activity.status);
            if (activityId <= 0) continue;

            try {
                const reply = await operateActivity(activityId, 1);
                if (reply.items && reply.items.length > 0) {
                    rewards.push(...reply.items);
                    claimed++;
                }
            } catch {
                // 某些活动可能无法操作，静默跳过
            }
        }

        if (claimed > 0) {
            const rewardStr = getRewardSummary(rewards);
            log('活动', rewardStr ? `领取活动奖励 ${claimed} 个 → ${rewardStr}` : `领取活动奖励 ${claimed} 个`);
        }

        return { claimed, rewardItems: rewards.length };
    } catch (e: any) {
        log('活动', `领取活动奖励失败: ${e.message}`);
        return { claimed: 0, rewardItems: 0 };
    }
}

module.exports = {
    getActivityList,
    getActivityGroup,
    operateActivity,
    claimActivityRewards,
};
