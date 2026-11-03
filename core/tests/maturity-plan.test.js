const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeAbsoluteTime,
    findNearestFutureMaturity,
    observeFriendSummary,
    observeFriendLands,
    claimDueFriends,
    getNextStealDelayMs,
    resetFriendMaturityPlans,
} = require('../dist/services/friend/maturity-plan');

const NOW_MS = 1_700_000_000_000;
const NOW_SEC = Math.floor(NOW_MS / 1000);

test('normalizeAbsoluteTime treats countdown seconds and absolute timestamps differently', () => {
    // 倒计时秒：now + 120
    assert.equal(normalizeAbsoluteTime(120, NOW_SEC), NOW_SEC + 120);
    // 绝对时间戳（秒级）：原样返回
    assert.equal(normalizeAbsoluteTime(1_800_000_000, NOW_SEC), 1_800_000_000);
    // 毫秒时间戳折算成秒
    assert.equal(normalizeAbsoluteTime(1_800_000_000_000, NOW_SEC), 1_800_000_000);
    // 无效值归零
    assert.equal(normalizeAbsoluteTime(0, NOW_SEC), 0);
    assert.equal(normalizeAbsoluteTime(-5, NOW_SEC), 0);
});

test('findNearestFutureMaturity picks the earliest future phase begin_time', () => {
    const lands = [
        { plant: { phases: [{ phase: 6, begin_time: NOW_SEC + 300 }] } },
        { plant: { phases: [{ phase_id: 19, begin_time: NOW_SEC + 60 }] } },
        { plant: { phases: [{ phase: 6, begin_time: NOW_SEC - 10 }] } }, // 已 mature，忽略
        { plant: { phases: [{ phase: 2, begin_time: NOW_SEC + 5 }] } },  // 非 mature phase
    ];
    assert.equal(findNearestFutureMaturity(lands, NOW_SEC), NOW_SEC + 60);
    assert.equal(findNearestFutureMaturity([], NOW_SEC), 0);
});

test('observeFriendSummary stores future ripeness and clears stale plans', () => {
    resetFriendMaturityPlans();
    observeFriendSummary({ gid: 1, plant: { ripe_time_sec: 600 } }, NOW_MS, NOW_SEC);
    let delay = getNextStealDelayMs({ nowMs: NOW_MS, nowSec: NOW_SEC });
    assert.ok(delay > 590 * 1000 && delay <= 600 * 1000, `delay=${delay}`);

    // 摘要不再给未来成熟点且旧计划已过期（超过宽限期）→ 计划清零，回退 fallback
    observeFriendSummary({ gid: 1, plant: { ripe_time_sec: 0 } }, NOW_MS + 12 * 60 * 1000, NOW_SEC + 720);
    delay = getNextStealDelayMs({ nowMs: NOW_MS + 12 * 60 * 1000, nowSec: NOW_SEC + 720, fallbackMs: 300_000 });
    assert.equal(delay, 300_000);
});

test('observeFriendLands overrides summary with precise phase wall clock', () => {
    resetFriendMaturityPlans();
    observeFriendSummary({ gid: 2, plant: { ripe_time_sec: 1200 } }, NOW_MS, NOW_SEC);
    // 地块显示 60 秒后成熟，比摘要更早更准
    observeFriendLands(2, [{ plant: { phases: [{ phase: 6, begin_time: NOW_SEC + 60 }] } }], { nowMs: NOW_MS, nowSec: NOW_SEC });
    const delay = getNextStealDelayMs({ nowMs: NOW_MS, nowSec: NOW_SEC });
    assert.ok(delay > 55 * 1000 && delay <= 61 * 1000, `delay=${delay}`);
});

test('claimDueFriends bumps due plans and getNextStealDelayMs stops waking early', () => {
    resetFriendMaturityPlans();
    observeFriendSummary({ gid: 3, plant: { ripe_time_sec: 10 } }, NOW_MS, NOW_SEC);
    // 时间走到成熟之后（宽限期内），动态唤醒贴最小值
    const afterMs = NOW_MS + 20 * 1000;
    const afterSec = NOW_SEC + 20;
    const due = getNextStealDelayMs({ nowMs: afterMs, nowSec: afterSec });
    assert.ok(due <= 1000, `due=${due}`);

    const claimed = claimDueFriends({ nowSec: afterSec });
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].gid, 3);
    // 归位后 5 分钟内不再动态提前唤醒
    const delay = getNextStealDelayMs({ nowMs: afterMs, nowSec: afterSec });
    assert.ok(delay > 4 * 60 * 1000, `delay=${delay}`);
});

test('getNextStealDelayMs clamps and falls back with no plans', () => {
    resetFriendMaturityPlans();
    assert.equal(getNextStealDelayMs({ nowMs: NOW_MS, nowSec: NOW_SEC }), 15 * 60 * 1000);
    assert.equal(getNextStealDelayMs({ nowMs: NOW_MS, nowSec: NOW_SEC, fallbackMs: 30_000 }), 30_000);
    // 极远成熟点被 fallback 钳制
    observeFriendSummary({ gid: 4, plant: { ripe_time_sec: 86400 * 30 } }, NOW_MS, NOW_SEC);
    assert.equal(getNextStealDelayMs({ nowMs: NOW_MS, nowSec: NOW_SEC, fallbackMs: 900_000 }), 900_000);
});
