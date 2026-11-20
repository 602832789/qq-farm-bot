/**
 * 牧歌初启自动化 runner（移植 BUGDey 版方案）。
 *
 * 开关 → 动作映射与 BUGDey 完全一致：只使用既有已验证的操作，问卷自动化只补
 * 未答题目（保留已保存的答案），绝不重置进度、绝不伪造分享。
 * 去重：指纹 = activityId + 起止时间 + 动作 + 已达成条目 id 排序列表，
 * 跨 tick（含重连）共享，提交前用最新状态再算一次指纹防并发双提交。
 */
export {};

const questions = require('../activity-data/muge-20261117.json').questions;

export const AUTO_ACTIONS: Record<string, string> = {
    muge_task_claim: 'claimTask',
    muge_celebration_claim: 'claimCelebration',
    muge_friend_claim: 'claimFriends',
    muge_personality_settle: 'settle',
    muge_auto_answer: 'autoAnswer',
    muge_handbook_claim: 'claimHandbook',
};

interface MugeState {
    activityId?: string | number;
    startTime?: number;
    endTime?: number;
    active?: boolean;
    celebration?: { tiers?: Array<{ id: any, status: number }> } | null;
    friends?: { tiers?: Array<{ id: any, status: number }> } | null;
    handbook?: { tiers?: Array<{ id: any, status: number }>, tasks?: Array<{ id: any, status: number }> } | null;
    personality?: { answers?: Record<string, number>, personalityId?: number, settleCount?: number } | null;
}

function claimable(state: MugeState, action: string): boolean {
    if (action === 'claimTask') return !!state.handbook?.tasks?.some(task => task.status === 2);
    const section = { claimCelebration: 'celebration', claimFriends: 'friends', claimHandbook: 'handbook' }[action];
    if (section) return !!(state as any)[section]?.tiers?.some(tier => tier.status === 2);
    const survey = state.personality;
    return action === 'settle' && !!survey && survey.personalityId === 0 && survey.settleCount === 0
        && questions.every((question: any) => question.options.some((option: any) => option.value === survey.answers?.[String(question.id)]));
}

function fingerprint(state: MugeState, action: string): string {
    const section = { claimTask: 'handbook', claimCelebration: 'celebration', claimFriends: 'friends', claimHandbook: 'handbook' }[action];
    const entries = section ? (action === 'claimTask' ? state[section as 'handbook']?.tasks : state[section as 'celebration']?.tiers) : null;
    const payload = entries
        ? entries.filter(entry => entry.status === 2).map(entry => String(entry.id)).sort()
        : questions.map((question: any) => state.personality?.answers?.[String(question.id)]);
    return JSON.stringify([state.activityId, state.startTime, state.endTime, action, payload]);
}

export interface MugeAutomationDeps {
    getState: () => Promise<MugeState>;
    operate: (action: string, input?: any, options?: { guard?: () => void, beforeWrite?: (state: MugeState) => void }) => Promise<any>;
    getAutomation: () => Record<string, any> | undefined;
    isReady?: () => boolean;
    now?: () => number;
    budgetMs?: number;
    submitted?: Set<string>;
}

export function createMugeAutomation({
    getState,
    operate,
    getAutomation,
    isReady = () => true,
    now = Date.now,
    budgetMs = 20000,
    submitted = new Set(),
}: MugeAutomationDeps = {} as any) {
    let running = false;
    return async function runMugeAutomation() {
        if (running || !isReady() || !Object.keys(AUTO_ACTIONS).some(key => getAutomation()?.[key] === true)) return;
        running = true;
        const deadline = now() + budgetMs;
        const guard = (key: string) => {
            if (!isReady() || now() >= deadline || getAutomation()?.[key] !== true) {
                throw Object.assign(new Error('牧歌自动化已停止或本轮已超时'), { code: 'MUGE_AUTO_STOPPED' });
            }
        };
        try {
            for (const [key, action] of Object.entries(AUTO_ACTIONS)) {
                if (getAutomation()?.[key] !== true) continue;
                guard(key);
                const state = await getState();
                guard(key);
                if (action === 'autoAnswer') {
                    const survey = state.personality;
                    if (!state.active || !survey || survey.personalityId !== 0 || survey.settleCount !== 0) continue;
                    const answers: Record<string, number> = {};
                    for (const question of questions as any[]) {
                        const saved = survey.answers?.[String(question.id)];
                        if (question.options.some((option: any) => option.value === saved)) continue;
                        // 保留已保存的选择；只确定性地填充未答题目。
                        if (saved != null && saved !== 0) continue;
                        if (question.options.length) answers[String(question.id)] = question.options[0].value;
                    }
                    if (Object.keys(answers).length) {
                        const stamp = JSON.stringify([state.activityId, state.startTime, 'saveAnswers', survey.answers, answers]);
                        if (submitted.has(stamp)) continue;
                        await operate('saveAnswers', { answers, clear: false }, {
                            guard: () => guard(key),
                            beforeWrite: (fresh) => {
                                guard(key);
                                const current = fresh.personality;
                                if (!fresh.active || !current || current.personalityId !== 0 || current.settleCount !== 0
                                    || Object.keys(answers).some(id => current.answers?.[id] != null && current.answers[id] !== 0)) {
                                    throw Object.assign(new Error('问卷进度已变化，下一轮重新核对'), { code: 'MUGE_AUTO_STOPPED' });
                                }
                                submitted.add(stamp);
                            },
                        });
                    }
                    guard(key);
                    const fresh = await getState();
                    guard(key);
                    const stamp = fingerprint(fresh, 'settle');
                    if (!fresh.active || !claimable(fresh, 'settle') || submitted.has(stamp)) continue;
                    await operate('settle', {}, {
                        guard: () => guard(key),
                        beforeWrite: (latest) => {
                            guard(key);
                            if (!latest.active || !claimable(latest, 'settle') || submitted.has(fingerprint(latest, 'settle'))) {
                                throw Object.assign(new Error('问卷结算状态已变化'), { code: 'MUGE_AUTO_STOPPED' });
                            }
                            submitted.add(fingerprint(latest, 'settle'));
                        },
                    });
                    continue;
                }
                if (!state.active || !claimable(state, action) || submitted.has(fingerprint(state, action))) continue;
                await operate(action, {}, {
                    guard: () => guard(key),
                    beforeWrite: (fresh) => {
                        guard(key);
                        if (!claimable(fresh, action)) throw Object.assign(new Error('牧歌状态已变化'), { code: 'MUGE_AUTO_STOPPED' });
                        const stamp = fingerprint(fresh, action);
                        if (submitted.has(stamp)) throw Object.assign(new Error('牧歌操作已提交，等待人工核对'), { code: 'MUGE_AUTO_STOPPED' });
                        submitted.add(stamp);
                    },
                });
            }
        }
        finally {
            running = false;
        }
    };
}
