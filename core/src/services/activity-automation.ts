/**
 * 活动自动化执行器。
 *
 * 旧版把这些开关直接写在 worker 的调度里；这一版把开关还原成 Same 语义的
 * automation 字段，并按「活动 → 可执行操作」的注册表分发到 activity-center
 * 的新协议实现上。所有操作都经过冷却与串行保护，单个活动失败不影响其它活动。
 */
export {};

const { log, logWarn, toNum } = require('../utils/utils');

/** 单个操作的最小重试间隔，避免把「不可领取」类错误刷成请求风暴。 */
const OP_COOLDOWN_MS = 10 * 60 * 1000;
/** 每轮最多执行的操作数，防止一轮里串太久。奶茶/活动开关较多时按单键预留。 */
const MAX_OPS_PER_ROUND = 24;

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
    /** 覆盖默认冷却间隔；奶茶动作与老版节奏一致用 5 分钟。 */
    cooldownMs?: number;
}

function getAutomationSnapshot(): any {
    try {
        const store = require('../models/store');
        return store.getAutomation ? (store.getAutomation() || {}) : {};
    } catch {
        return {};
    }
}

function isCoolingDown(op: AutomationOp, now: number): boolean {
    const last = lastRunAt.get(op.key) || 0;
    return now - last < (op.cooldownMs || OP_COOLDOWN_MS);
}

/** 奶茶人才偏好：与老版 selectHireCandidate 相同的选人策略。 */
function selectHireCandidate(candidates: any, primaryTalentId: number, backupTalentId: number, now: number): any {
    const idle = (entry: any) => entry?.friend?.gid && toNum(entry.state) === 0
        && toNum(entry.state_until_at || 0) <= now && toNum(entry.rehire_available_at || 0) <= now;
    const friends = (candidates.friends || []).filter((entry: any) => !entry.is_robot && idle(entry));
    const robots = (candidates.robots || []).filter(idle);
    const findByTalent = (talentId: number) => talentId === 9004
        ? robots[0]
        : talentId === 0
            ? (friends[0] || robots[0])
            : friends.find((entry: any) => toNum(entry.talent_id) === talentId);
    return findByTalent(primaryTalentId) || (backupTalentId !== primaryTalentId ? findByTalent(backupTalentId) : undefined);
}

/**
 * 奶茶热销中自动操作（老版 runStarActivityAutoClaims 的 milkTea 分支移植）。
 * 基于本版 milk-tea.ts 协议实现；每个操作先查状态、无可做时静默返回 false。
 */
function buildMilkTeaOps(): AutomationOp[] {
    const milkTea = require('./milk-tea');
    const shareReward = require('./share-reward-activity');
    const MILK_SHARE_ID = '2026110104';
    /** 奶茶动作统一 5 分钟冷却，与老版轮询节奏一致。 */
    const cooldown = 5 * 60 * 1000;
    const shopOps: AutomationOp[] = [
        {
            key: 'milk_tea_cashier', label: '奶茶热销中-领取收益', cooldownMs: cooldown,
            run: async () => {
                const state = await milkTea.getMilkTeaActivity('shop');
                if (!state.active || !(state.shop?.pending_rewards || []).some((v: any) => toNum(v.count) > 0)) return false;
                await milkTea.operateMilkTeaActivity('claim');
                return true;
            },
        },
        {
            key: 'milk_tea_wages', label: '奶茶热销中-领取工资', cooldownMs: cooldown,
            run: async () => {
                const state = await milkTea.getMilkTeaActivity('work');
                if (!state.active || !(state.work?.slips || []).some((v: any) => toNum(v.wage_status) === 1)) return false;
                await milkTea.operateMilkTeaActivity('wages');
                return true;
            },
        },
        {
            key: 'milk_tea_upgrade', label: '奶茶热销中-升级店铺', cooldownMs: cooldown,
            run: async () => {
                const state = await milkTea.getMilkTeaActivity('upgrade');
                if (!state.active || !state.summary?.can_upgrade) return false;
                await milkTea.operateMilkTeaActivity('upgrade', { expectedLevel: toNum(state.shop?.level) });
                return true;
            },
        },
        {
            key: 'milk_tea_craft', label: '奶茶热销中-制作奶茶', cooldownMs: cooldown,
            run: async () => {
                const state = await milkTea.getMilkTeaActivity('workshop');
                if (!state.active || state.settling) return false;
                const eligible = new Set((state.recipes || []).filter((r: any) => r.unlocked && r.is_advanced).map((r: any) => toNum(r.fruitId)));
                const fruits = (state.fruits || []).filter((f: any) => eligible.has(toNum(f.id)) && toNum(f.count) > 0 && !f.locked)
                    .map((f: any) => ({ uid: String(f.uid), count: toNum(f.count) }));
                if (!fruits.length) return false;
                await milkTea.operateMilkTeaActivity('craft', { fruits });
                return true;
            },
        },
        {
            key: 'milk_tea_boost', label: '奶茶热销中-使用宣传喇叭', cooldownMs: cooldown,
            run: async () => {
                const state = await milkTea.getMilkTeaActivity('shop');
                const salesItemId = toNum(state.shop?.sales_item_id);
                if (!state.active || state.settling || !salesItemId || toNum(state.balances?.[String(salesItemId)]) <= 0) return false;
                await milkTea.operateMilkTeaActivity('boost', { count: 1, expectedCosts: [{ id: salesItemId, count: 1 }] });
                return true;
            },
        },
        {
            key: 'milk_tea_hire', label: '奶茶热销中-雇佣员工', cooldownMs: cooldown,
            run: async (automation: any) => {
                const state = await milkTea.getMilkTeaActivity('hireList');
                const now = toNum(state.serverTime);
                const hire = state.hire;
                if (!state.active || state.settling || !hire) return false;
                if (toNum(state.settleStartTime) - now < toNum(hire.min_remain_biz_sec)) return false;
                const capacity = (state.levels || []).find((v: any) => toNum(v.level) === toNum(state.shop?.level))?.employee_slot_count || 0;
                const slot = Array.from({ length: capacity }, (_, i) => i)
                    .find(i => !(state.shop?.slots || []).some((v: any) => toNum(v.slot_index) === i && toNum(v.end_at) > now));
                if (slot == null) return false;
                const primaryInput = Number(automation.milk_tea_hire_primary_talent ?? automation.milk_tea_hire_talent);
                const primaryTalentId = [0, 9001, 9002, 9003, 9004].includes(primaryInput) ? primaryInput : 0;
                const backupInput = Number(automation.milk_tea_hire_backup_talent);
                const backupTalentId = primaryTalentId === 0 ? 0 : ([0, 9001, 9002, 9003, 9004].includes(backupInput) ? backupInput : 0);
                const target = selectHireCandidate(hire, primaryTalentId, backupTalentId, now);
                if (!target) return false;
                await milkTea.operateMilkTeaActivity('hire', {
                    targetGid: String(target.friend.gid),
                    expectedCosts: [{ id: 1041, count: toNum(hire.wage_total) }],
                });
                return true;
            },
        },
        {
            key: 'milk_tea_interact', label: '奶茶热销中-打工互动', cooldownMs: cooldown,
            run: async (automation: any) => {
                const state = await milkTea.getMilkTeaActivity('work');
                const shift = state.work?.my_shift;
                if (!state.active || state.settling || !shift) return false;
                if (toNum(shift.begin_at) > toNum(state.serverTime) || toNum(shift.end_at) <= toNum(state.serverTime)) return false;
                if (state.work.interact_done || toNum(shift.interact_count) >= toNum(shift.interact_limit)) return false;
                const type = Number(automation.milk_tea_interaction_type);
                const kind = [1, 2, 3, 4, 5].includes(type) ? type : 1;
                await milkTea.operateMilkTeaActivity('interact', { interactionType: kind, expectedShiftId: String(shift.shift_id) });
                return true;
            },
        },
        {
            key: 'milk_tea_seed_buy', label: '奶茶热销中-购买活动种子', cooldownMs: cooldown,
            run: async () => {
                const state = await milkTea.getMilkTeaActivity('exchange');
                if (!state.active || state.settling) return false;
                const goods = (state.goods || []).find((g: any) => g.category === 'seed' && g.available && g.remaining !== null && g.remaining > 0);
                if (!goods) return false;
                let count = Number(goods.remaining);
                for (const cost of goods.costs || []) {
                    const balance = toNum(state.balances?.[String(toNum(cost.id))]);
                    count = Math.min(count, Math.floor(balance / Math.max(1, toNum(cost.count))));
                }
                if (!Number.isSafeInteger(count) || count < 1) return false;
                await milkTea.operateMilkTeaActivity('exchange', { goodsId: goods.id, count, expectedCosts: goods.costs });
                return true;
            },
        },
        {
            key: 'milk_tea_fund_rewards', label: '奶茶热销中-领取成长基金奖励', cooldownMs: cooldown,
            run: async () => {
                const state = await milkTea.getMilkTeaActivity('fund');
                if (!state.active || !state.fund?.unlocked) return false;
                if (!(state.fund.tiers || []).some((t: any) => toNum(t.state) === 2)) return false;
                await milkTea.operateMilkTeaActivity('fundClaim');
                return true;
            },
        },
    ];
    // 奶茶的分享子活动（首次分享 / 每日快乐值 / 快乐值档位奖励）走通用分享奖励协议。
    const shareOps: AutomationOp[] = ([
        { key: 'milk_tea_share', label: '奶茶热销中-首次分享', gate: (s: any) => s.canShare, action: 'share' },
        { key: 'milk_tea_share_daily', label: '奶茶热销中-领取每日快乐值', gate: (s: any) => s.canClaimDaily, action: 'daily' },
        { key: 'milk_tea_share_rewards', label: '奶茶热销中-领取快乐值奖励', gate: (s: any) => s.canClaimMilestones, action: 'milestones' },
    ] as Array<{ key: string, label: string, gate: (s: any) => boolean, action: string }>).map(({ key, label, gate, action }) => ({
        key, label, cooldownMs: cooldown,
        run: async () => {
            const state = await shareReward.getShareRewardActivity(MILK_SHARE_ID).catch(() => null);
            if (!state?.active || !gate(state)) return false;
            await shareReward.operateShareRewardActivity(MILK_SHARE_ID, action);
            return true;
        },
    }));
    return [...shopOps, ...shareOps];
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
        {
            key: 'star_solar_quiz_claim',
            label: '节令答题自动领取',
            run: async () => {
                const solar = require('./solar-calendar');
                const state = await solar.getSolarCalendar();
                let answered = false;
                for (const event of state.events || []) {
                    if (!event.canAnswer || event.answerIndex == null) continue;
                    if ((event.wrongOptions || []).includes(event.answerIndex)) continue;
                    const result = await solar.operateSolarCalendar('answer', {
                        id: event.id,
                        optionIndex: event.answerIndex,
                        expectedQuestion: event.question,
                    });
                    answered = true;
                    log('活动', `活动自动化：节令答题${result?.correct ? '答对并领取附加奖励' : '答错'}：${event.name}`, { event: 'activity_automation' });
                }
                return answered;
            },
        },
        {
            key: 'share_reward_milestones',
            label: '分享奖励-里程碑领取',
            run: async () => {
                const shareReward = require('./share-reward-activity');
                const instances = require('../activity-data/share-reward-instances.json');
                let claimed = false;
                for (const instance of instances) {
                    const state = await shareReward.getShareRewardActivity(instance.activityId).catch(() => null);
                    if (!state?.active || !state.canClaimMilestones) continue;
                    await shareReward.operateShareRewardActivity(instance.activityId, 'milestones');
                    claimed = true;
                }
                return claimed;
            },
        },
        ...buildMilkTeaOps(),
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
            if (isCoolingDown(op, now)) continue;

            budget -= 1;
            lastRunAt.set(op.key, now);
            try {
                const did = await op.run(automation);
                if (did) {
                    executed.push(op.label);
                    log('活动', `活动自动化：${op.label} 执行完成`, { event: 'activity_automation' });
                } else {
                    // 无可领取 / 未开放也是常态，但要让用户在日志里能看到开关确实在跑。
                    log('活动', `活动自动化：${op.label} 本轮无可领取或活动未开放`, { event: 'activity_automation' });
                }
            } catch (error: any) {
                // 活动未开启 / 无奖励 + 冷却未到都是常态，但保持可见，让用户看得到跳过原因。
                const message = String(error?.message || error || '');
                log('活动', `活动自动化：${op.label} 跳过（${message}）`, { event: 'activity_automation' });
            }
        }

        // 只提醒一次：开关打开了但本版本没有对应协议实现的字段。
        const unsupported = [
            'star_record_claim',
            'milk_tea_auto_open',
            'qixi_dew_use',
            'rain_poem_weather_collect',
            'rain_poem_prank_use',
            'rain_poem_research_unlock',
            'charity_flower_reward_claim',
            'charity_flower_public_fund_claim',
            'wish_sign_draw',
            'wish_sign_claim',
            'pet_diary_story_claim',
            'pet_diary_solar_claim',
            'pet_diary_compensation_claim',
            'pet_diary_charm_equip',
            'pet_diary_battle',
        ];
        for (const key of unsupported) {
            if (!automation[key] || warnedKeys.has(key)) continue;
            warnedKeys.add(key);
            // key 写进消息正文：组合日志只保留 message 字段，放 meta 会丢。
            logWarn('活动', `活动自动化待接入：${key} 已开启，但当前版本尚未接入对应协议实现`, { event: 'activity_automation' });
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
                logWarn('活动', `活动自动化执行异常：${String(error?.message || error || '')}`, { event: 'activity_automation' });
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
