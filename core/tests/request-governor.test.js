const test = require('node:test');
const assert = require('node:assert/strict');

const {
    WINDOW_MS,
    TOTAL_LIMIT,
    PER_METHOD_LIMIT,
    checkRequest,
    recordSent,
    getGovernorStats,
    resetGovernor,
} = require('../dist/utils/request-governor');

const ALL_LANDS = ['gamepb.plantpb.PlantService', 'AllLands'];
const BAG = ['gamepb.itempb.ItemService', 'Bag'];
const HEARTBEAT = ['gamepb.userpb.UserService', 'Heartbeat'];
const ANTI_DATA = ['gamepb.acepb.AceService', 'AntiData'];

test('request budget never blocks heartbeat, login or anti-cheat reporting', () => {
    resetGovernor();
    const now = Date.now();
    for (let i = 0; i < TOTAL_LIMIT * 2; i++) recordSent(...HEARTBEAT, now);
    assert.equal(checkRequest(...HEARTBEAT, now).allowed, true);
    assert.equal(checkRequest(...ANTI_DATA, now).allowed, true);
    assert.equal(checkRequest('gamepb.gatepb.GateService', 'Login', now).allowed, true);
    // 收菜/偷菜属于核心收益链路，预算耗尽时也必须放行。
    assert.equal(checkRequest('gamepb.plantpb.PlantService', 'Harvest', now).allowed, true);
    // 普通业务请求照常被拦。
    assert.equal(checkRequest(...ALL_LANDS, now).allowed, false);
});

test('request budget stops a burst once the 60s window is full', () => {
    resetGovernor();
    const now = Date.now();
    for (let i = 0; i < TOTAL_LIMIT; i++) recordSent(...ALL_LANDS, now);
    const blocked = checkRequest(...BAG, now);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'budget_total');
    assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= WINDOW_MS);

    const stats = getGovernorStats(now);
    assert.equal(stats.sentInWindow, TOTAL_LIMIT);
    assert.equal(stats.droppedTotal, 1);
    assert.equal(stats.lastDropKey, 'gamepb.itempb.ItemService.Bag');
});

test('a single hot method cannot eat the whole budget', () => {
    resetGovernor();
    const now = Date.now();
    for (let i = 0; i < PER_METHOD_LIMIT; i++) recordSent(...ALL_LANDS, now);
    assert.equal(checkRequest(...ALL_LANDS, now).allowed, false);
    assert.equal(checkRequest(...ALL_LANDS, now).reason, 'budget_method');
    // 别的接口还有余量，不该被连坐。
    assert.equal(checkRequest(...BAG, now).allowed, true);
});

test('budget slides back once the window elapses', () => {
    resetGovernor();
    const start = Date.now();
    for (let i = 0; i < TOTAL_LIMIT; i++) recordSent(...ALL_LANDS, start);
    assert.equal(checkRequest(...BAG, start).allowed, false);

    const later = start + WINDOW_MS + 1;
    assert.equal(checkRequest(...BAG, later).allowed, true);
    const stats = getGovernorStats(later);
    assert.equal(stats.sentInWindow, 0);
});
