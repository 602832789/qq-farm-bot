/**
 * 黄金虫投放（老版 golden-bug-service.js 移植）。
 *
 * 向好友地块投放黄金虫（物品 301101），通过 PutSocialItem 社交道具接口实现。
 * 受「好友」+「放黄金虫」两个开关联合控制；每天上限 100 只、单轮上限可配置、最低 10 分钟跑一次。
 */
export {};

const { isAutomationOn, getConfigSnapshot, getUserState, getFriendBlacklist } = require('../../models/store');
const { isConnected } = require('../../utils/network');
const { log, logWarn, randomDelay, toNum, getSystemDateKey } = require('../../utils/utils');
const { enterFriendFarm, leaveFriendFarm, getAllFriends, putSocialItem } = require('./api');
const { analyzeFriendLands, inFriendQuietHours, handleFriendEnterError } = require('./visit-strategy');
const { extractReplyFriends } = require('./gid-manager');
const { updateOperationLimits } = require('./scheduler');
const { recordOperation } = require('../stats');
const { getBag, getBagItems } = require('../warehouse');

const GOLDEN_BUG_ITEM_ID = 301101;
const GOLDEN_BUG_DAILY_LIMIT = 100;
const MIN_RUN_INTERVAL_MS = 10 * 60 * 1000;

let lastRunAt = 0;
let running = false;
let dailyCount = 0;
let dailyKey = '';

function getGoldenBugCount(items: any[]): number {
    return (Array.isArray(items) ? items : []).reduce((total: number, item: any) => (
        toNum(item && item.id) === GOLDEN_BUG_ITEM_ID
            ? total + Math.max(0, toNum(item && item.count))
            : total
    ), 0);
}

async function runGoldenBugPlacement(options: { force?: boolean } = {}): Promise<any> {
    if (running || !isConnected() || !isAutomationOn('friend') || !isAutomationOn('friend_golden_bug')) return null;
    if (inFriendQuietHours()) return null;

    const now = Date.now();
    if (!options.force && now - lastRunAt < MIN_RUN_INTERVAL_MS) return null;

    // 按系统日切重置当天计数
    const today = getSystemDateKey();
    if (today !== dailyKey) {
        dailyKey = today;
        dailyCount = 0;
    }

    running = true;
    lastRunAt = now;
    try {
        const userState = getUserState();
        if (!toNum(userState && userState.gid)) return null;

        const accountId = process.env.FARM_ACCOUNT_ID || '';
        const config = getConfigSnapshot ? (getConfigSnapshot(accountId) || {}) : {};
        const keepCount = Math.max(0, toNum(config.goldenBugKeepCount));
        const roundLimit = Math.max(1, Math.min(100, toNum(config.goldenBugRoundLimit) || 24));
        const bag = await getBag();
        const inventory = getGoldenBugCount(getBagItems(bag));
        const usableInventory = Math.max(0, inventory - keepCount);
        const dailyRemaining = Math.max(0, GOLDEN_BUG_DAILY_LIMIT - dailyCount);
        let remaining = Math.min(usableInventory, dailyRemaining, roundLimit);

        if (remaining <= 0) return { placed: 0, inventory, dailyRemaining };

        const allFriendsReply = await getAllFriends();
        const blacklist = new Set(getFriendBlacklist ? getFriendBlacklist(accountId).map(toNum) : []);
        const friends = extractReplyFriends(allFriendsReply)
            .map((friend: any) => ({
                gid: toNum(friend && friend.gid),
                name: friend && (friend.remark || friend.name) || '',
                level: toNum(friend && friend.level),
            }))
            .filter((friend: any) => friend.gid > 0 && friend.gid !== toNum(userState.gid) && !blacklist.has(friend.gid))
            .sort((a: any, b: any) => b.level - a.level);

        let placed = 0;
        let consecutiveFailures = 0;
        for (const friend of friends) {
            if (remaining <= 0) break;

            let entered = false;
            try {
                const enterReply = await enterFriendFarm(friend.gid);
                entered = true;
                const analysis = analyzeFriendLands(
                    enterReply.lands || [],
                    toNum(userState.gid),
                    friend.name,
                );
                const targets = (analysis.canPutGoldenBug || []).slice(0, remaining);

                for (const landId of targets) {
                    try {
                        const reply: any = await putSocialItem(friend.gid, landId, GOLDEN_BUG_ITEM_ID);
                        if (reply && Array.isArray(reply.operation_limits)) {
                            try { updateOperationLimits(reply.operation_limits); } catch { /* ignore */ }
                        }
                        placed++;
                        dailyCount++;
                        remaining--;
                        consecutiveFailures = 0;
                        recordOperation('goldenBugPut', 1);
                        await randomDelay(500, 1000);
                    } catch (err: any) {
                        const message = String(err && err.message || '未知错误');
                        logWarn('好友', `给 ${friend.name || `GID:${friend.gid}`} 放置黄金虫失败: ${message}`, {
                            module: 'friend',
                            event: '放置黄金虫',
                            result: 'error',
                            friendGid: friend.gid,
                            landId,
                        });
                        consecutiveFailures++;
                        if (consecutiveFailures >= 3) remaining = 0;
                        break;
                    }
                }
            } catch (err: any) {
                handleFriendEnterError(friend.gid, friend.name || `GID:${friend.gid}`, err);
            } finally {
                if (entered) {
                    try { await leaveFriendFarm(friend.gid); } catch { /* ignore */ }
                }
            }

            if (remaining > 0) await randomDelay(500, 1500);
        }

        if (placed > 0) {
            log('好友', `黄金虫投放完成 ${placed} 只，获得经验 ${placed * 30}`, {
                module: 'friend',
                event: '放置黄金虫',
                result: 'ok',
                count: placed,
                exp: placed * 30,
                inventoryBefore: inventory,
            });
        }
        return { placed, inventory, dailyRemaining };
    } catch (err: any) {
        logWarn('好友', `黄金虫投放检查失败: ${err && err.message || err}`, {
            module: 'friend',
            event: '放置黄金虫',
            result: 'error',
        });
        return null;
    } finally {
        running = false;
    }
}

export {
    getGoldenBugCount,
    GOLDEN_BUG_DAILY_LIMIT,
    GOLDEN_BUG_ITEM_ID,
    runGoldenBugPlacement,
};
