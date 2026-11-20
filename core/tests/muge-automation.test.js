const assert = require('node:assert/strict');
const test = require('node:test');

const { buildOps } = require('../dist/services/activity-automation');
const sharedState = require('../dist/models/store/shared-state');

test('牧歌初启自动化：op 已注册且带活动窗口闸门', () => {
    const op = buildOps().find(item => item.key === 'muge_auto_claim');
    assert.ok(op, '缺少 muge_auto_claim 自动化 op');
    assert.match(op.label, /牧歌初启/);
    assert.ok(Array.isArray(op.activityIds) && op.activityIds.includes('2026111700'), 'muge op 未绑定活动窗口 ID');
    assert.equal(typeof op.run, 'function');
});

test('牧歌初启自动化：默认关闭，且纳入 automation 白名单', () => {
    const automation = sharedState.DEFAULT_ACCOUNT_CONFIG.automation;
    assert.equal(automation.muge_auto_claim, false, 'muge_auto_claim 默认应为 false');
    // ALLOWED_AUTOMATION_KEYS 由 DEFAULT_ACCOUNT_CONFIG.automation 的键生成。
    assert.ok(sharedState.ALLOWED_AUTOMATION_KEYS.has('muge_auto_claim'), 'muge_auto_claim 不在允许字段中');
});
