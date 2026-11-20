const assert = require('node:assert/strict');
const test = require('node:test');

const { AUTO_ACTIONS, createMugeAutomation } = require('../dist/services/muge-automation');
const sharedState = require('../dist/models/store/shared-state');

const MUGE_KEYS = ['muge_task_claim', 'muge_celebration_claim', 'muge_friend_claim', 'muge_handbook_claim', 'muge_personality_settle', 'muge_auto_answer'];

const state = (overrides = {}) => ({
    activityId: '2026111700', startTime: 1, endTime: 2, active: true,
    celebration: { tiers: [{ id: 1, status: 2 }] },
    friends: { tiers: [] },
    handbook: { tiers: [{ id: 5, status: 2 }], tasks: [{ id: 9, status: 2 }] },
    personality: { answers: {}, personalityId: 0, settleCount: 0 },
    ...overrides,
});

test('牧歌初启自动化：BUGDey 版动作映射与默认开关', () => {
    assert.deepEqual(Object.values(AUTO_ACTIONS), ['claimTask', 'claimCelebration', 'claimFriends', 'settle', 'autoAnswer', 'claimHandbook']);
    // AUTO_ACTIONS 不含 claimShare：分享奖励只保留手动。
    assert.ok(!Object.values(AUTO_ACTIONS).includes('claimShare'));
    const automation = sharedState.DEFAULT_ACCOUNT_CONFIG.automation;
    for (const key of MUGE_KEYS) {
        assert.equal(automation[key], false, `${key} 默认应为 false`);
        assert.ok(sharedState.ALLOWED_AUTOMATION_KEYS.has(key), `${key} 不在允许字段中`);
    }
});

test('牧歌初启自动化：按开关逐项领取，提交前用最新状态算指纹去重', async () => {
    const submitted = new Set();
    const operations = [];
    const states = [state(), state()];
    let calls = 0;
    const runner = createMugeAutomation({
        getState: async () => states[Math.min(calls, states.length - 1)],
        operate: async (action, input, options) => {
            calls += 1;
            // beforeWrite 收到的必须是最新状态，且重复指纹会抛错。
            options?.beforeWrite?.(state());
            operations.push(action);
            return { activity: state(), rewards: [] };
        },
        getAutomation: () => ({ muge_task_claim: true, muge_celebration_claim: true }),
        isReady: () => true,
        submitted,
    });
    await runner();
    assert.deepEqual(operations, ['claimTask', 'claimCelebration']);
    // 再跑一轮：相同状态指纹已在 submitted 中，不应重复提交。
    await runner();
    assert.deepEqual(operations, ['claimTask', 'claimCelebration']);
});

test('牧歌初启自动化：开关中途关闭立即中止，无残留提交', async () => {
    let enabled = true;
    const operations = [];
    const runner = createMugeAutomation({
        getState: async () => state(),
        operate: async (action, input, options) => {
            // 模拟服务端提交前的护栏调用：此刻用户已关闭开关，应立即中止。
            enabled = false
            options?.guard?.()
            operations.push('claimTask')
            return { activity: state(), rewards: [] }
        },
        getAutomation: () => ({ muge_task_claim: enabled, muge_celebration_claim: false }),
        isReady: () => true,
        submitted: new Set(),
    });
    await assert.rejects(() => runner(), error => error.code === 'MUGE_AUTO_STOPPED');
    // 护栏在提交前中止：任何动作都不应真正提交。
    assert.deepEqual(operations, []);
});

test('牧歌初启自动化：活动未开启或全部已领取时不发任何写操作', async () => {
    const operations = [];
    const runner = createMugeAutomation({
        getState: async () => state({ active: false }),
        operate: async action => operations.push(action),
        getAutomation: () => ({ muge_task_claim: true, muge_celebration_claim: true }),
        submitted: new Set(),
    });
    await runner();
    assert.deepEqual(operations, []);
});
