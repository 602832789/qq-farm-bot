/**
 * 活动自动化执行器。
 *
 * 旧版把这些开关直接写在 worker 的调度里；这一版把开关还原成 Same 语义的
 * automation 字段，并按「活动 → 可执行操作」的注册表分发到 activity-center
 * 的新协议实现上。所有操作都经过冷却与串行保护，单个活动失败不影响其它活动。
 */
export {};

const { createModuleLogger } = require('./logger');

const logger = createModuleLogger('activity-automation');

/** 单个操作的最小重试间隔，避免把「不可领取」类错误刷成请求风暴。 */
const OP_COOLDOWN_MS = 10 * 60 * 1000;
/** 每轮最多执行的操作数，防止一轮里串太久。 */
const MAX_OPS_PER_ROUND = 12;

const lastRunAt = new Map<string, number>();
const warnedKeys = new Set<string>();

let ticking = false;
let timer: any = null;

interface AutomationOp {
    /** automation 字段名 */
    key: string;
    /** 面向用户的操作名，用于日志 */
    label: string;
    /** 执行体；返回 true 表示确实做了操作（用于日志），返回 false / 抛错都只记录 */
    run: (automation: any) => Promise<boolean>;
}

function getAutomationSnapshot(): any {
    try {
        const store = require('../models/store');
        return store.getAutomation ? (store.getAutomation() || {}) : {};
    } catch {
        return {};
    }
}

function isCoolingDown(key: string, now: number): boolean {
    const last = lastRunAt.get(key) || 0;
    return now - last < OP_COOLDOWN_MS;
}

async function claimableSolarTermId(): Promise<string | null> {
    const activityCenter = require('./activity-center');
    const terms = await activityCenter.getCurrentSolarTerms();
    const list = Array.isArray(terms?.terms) ? terms.terms : [];
    const claimable = list.find((term: any) => term && term.canClaim);
    return claimable ? String(claimable.id) : null;
}

function buildOps(): AutomationOp[] {
    const activityCenter = require('./activity-center');

    return [
        {
            key: 'star_passport_claim',
            label: '领取星旅通行证奖励',
            run: async () => {
                await activityCenter.claimBattlePassRewards();
                return true;
            },
        },
        {
            key: 'star_solar_claim',
            label: '领取节气奖励',
            run: async () => {
                const termId = await claimableSolarTermId();
                if (!termId) return false;
                await activityCenter.claimSolarTerm(termId);
                return true;
            },
        },
        {
            key: 'qingmei_seed_claim',
            label: '领取青莓每日种子',
            run: async () => {
                await activityCenter.claimQingMeiDailySeed();
                return true;
            },
        },
        {
            key: 'qingmei_wine_brew',
            label: '青莓酿酒推进',
            run: async () => {
                const settled = await activityCenter.settleQingMeiBrew().catch(() => null);
                if (settled) return true;
                const continued = await activityCenter.continueQingMeiBrew().catch(() => null);
                return !!continued;
            },
        },
        {
            key: 'qixi_bridge_build',
            label: '领取七夕鹊桥奖励',
            run: async () => {
                await activityCenter.claimQixiBridgeRewards();
                return true;
            },
        },
        {
            key: 'qixi_sachet_gift',
            label: '赠送七夕香囊',
            run: async (automation: any) => {
                const priority = Array.isArray(automation.qixi_friend_priority)
                    ? automation.qixi_friend_priority
                    : [];
                const gid = priority.find((value: any) => Number(value) > 0);
                if (!gid) return false;
                await activityCenter.giftQixiSachet(gid);
                return true;
            },
        },
        {
            key: 'charity_flower_donate',
            label: '公益红花捐爱心',
            run: async () => {
                await activityCenter.donateCharityRedFlowerLove();
                return true;
            },
        },
        {
            key: 'charity_flower_share_claim',
            label: '公益红花分享领取',
            run: async () => {
                const share = require('./share');
                const can = await share.checkCanShare();
                if (can && can.can_share === false) return false;
                await share.reportShare();
                return true;
            },
        },
        {
            key: 'share_reward_share',
            label: '分享奖励-分享',
            run: async () => {
                const share = require('./share');
                await share.reportShare();
                return true;
            },
        },
        {
            key: 'share_reward_daily',
            label: '分享奖励-每日领取',
            run: async () => {
                const share = require('./share');
                await share.claimShareReward();
                return true;
            },
        },
        {
            key: 'pet_diary_adopt',
            label: '萌宠日记-领养',
            run: async () => {
                await activityCenter.operatePetDiary('initialize', {});
                return true;
            },
        },
        {
            key: 'pet_diary_feed',
            label: '萌宠日记-投喂',
            run: async () => {
                await activityCenter.operatePetDiary('feed', {});
                return true;
            },
        },
        {
            key: 'pet_diary_draw',
            label: '萌宠日记-寻宝',
            run: async () => {
                await activityCenter.operatePetDiary('draw', {});
                return true;
            },
        },
        {
            key: 'pet_diary_seed_claim',
            label: '萌宠日记-种子礼包',
            run: async () => {
                await activityCenter.operatePetDiary('seeds', {});
                return true;
            },
        },
        {
            key: 'pet_diary_treasure_open',
            label: '萌宠日记-开启宝藏',
            run: async () => {
                await activityCenter.operatePetDiary('openTreasure', {});
                return true;
            },
        },
        {
            key: 'rain_poem_bottle_buy',
            label: '雨落成诗-兑换采集瓶',
            run: async () => {
                await activityCenter.exchangeWeatherCollectorBottle();
                return true;
            },
        },
        {
            key: 'rain_poem_summon_use',
            label: '雨落成诗-使用祈雨瓶',
            run: async () => {
                await activityCenter.useWeatherSummonBottle();
                return true;
            },
        },
    ];
}

/**
 * 跑一轮活动自动化。返回本轮实际执行成功的操作名列表。
 */
async function runActivityAutomationOnce(): Promise<string[]> {
    if (ticking) return [];
    ticking = true;
    const executed: string[] = [];
    const now = Date.now();
    try {
        const automation = getAutomationSnapshot();
        const ops = buildOps();
        let budget = MAX_OPS_PER_ROUND;

        for (const op of ops) {
            if (budget <= 0) break;
            if (!automation[op.key]) continue;
            if (isCoolingDown(op.key, now)) continue;

            budget -= 1;
            lastRunAt.set(op.key, now);
            try {
                const did = await op.run(automation);
                if (did) {
                    executed.push(op.label);
                    logger.info('活动自动化执行', `${op.label} 完成`);
                } else {
                    // 无可领取 / 未开放也是常态，但要让用户在日志里能看到开关确实在跑。
                    logger.info('活动自动化检查', `${op.label}：本轮无可领取或活动未开放`);
                }
            } catch (error: any) {
                // 活动未开启 / 无奖励 + 冷却未到都是常态，但提升到 info，让用户看得到跳过原因。
                const message = String(error?.message || error || '');
                logger.info('活动自动化跳过', `${op.label}: ${message}`);
            }
        }

        // 只提醒一次：开关打开了但本版本没有对应协议实现的字段。
        const unsupported = [
            'star_solar_quiz_claim',
            'star_record_claim',
            'qixi_dew_use',
            'rain_poem_weather_collect',
            'rain_poem_prank_use',
            'rain_poem_research_unlock',
            'charity_flower_reward_claim',
            'charity_flower_public_fund_claim',
            'wish_sign_draw',
            'wish_sign_claim',
            'share_reward_milestones',
            'pet_diary_story_claim',
            'pet_diary_solar_claim',
            'pet_diary_compensation_claim',
            'pet_diary_charm_equip',
            'pet_diary_battle',
            'milk_tea_share',
            'milk_tea_share_daily',
            'milk_tea_share_rewards',
            'milk_tea_fund_rewards',
            'milk_tea_cashier',
            'milk_tea_wages',
            'milk_tea_upgrade',
            'milk_tea_craft',
            'milk_tea_boost',
            'milk_tea_interact',
            'milk_tea_hire',
            'milk_tea_seed_buy',
        ];
        for (const key of unsupported) {
            if (!automation[key] || warnedKeys.has(key)) continue;
            warnedKeys.add(key);
            // key 写进消息正文：组合日志只保留 message 字段，放 meta 会丢。
            logger.warn(`活动自动化待接入: ${key} 已开启，但当前版本尚未接入对应协议实现`);
        }
    } finally {
        ticking = false;
    }
    return executed;
}

function startActivityAutomation(workerScheduler: any, intervalMs: number = 5 * 60 * 1000): void {
    stopActivityAutomation();
    const tick = () => {
        const { runExclusiveAutomationTask } = require('./automation-lock');
        return runExclusiveAutomationTask('activity_automation', () => runActivityAutomationOnce())
            .catch((error: any) => {
                logger.debug('活动自动化异常', String(error?.message || error || ''));
            });
    };
    if (workerScheduler && typeof workerScheduler.setIntervalTask === 'function') {
        workerScheduler.setIntervalTask('activity_automation_interval', intervalMs, tick, { preventOverlap: true });
        timer = true;
        return;
    }
    timer = setInterval(tick, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
}

function stopActivityAutomation(): void {
    if (timer && timer !== true && typeof clearInterval === 'function') {
        clearInterval(timer);
    }
    timer = null;
}

module.exports = {
    runActivityAutomationOnce,
    startActivityAutomation,
    stopActivityAutomation,
    buildOps,
};
