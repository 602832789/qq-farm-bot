const test = require('node:test');
const assert = require('node:assert/strict');

const {
    WINDOW_MS,
    TOTAL_LIMIT,
    PER_METHOD_LIMIT,
    AUTO_LIMIT_CAUTIOUS,
    AUTO_LIMIT_STALL,
    checkRequest,
    recordSent,
    getGovernorStats,
    getBudgetPressure,
    isForegroundActive,
    resetGovernor,
} = require('../dist/utils/request-governor');

const ALL_LANDS = ['gamepb.plantpb.PlantService', 'AllLands'];
const BAG = ['gamepb.itempb.ItemService', 'Bag'];
const HEARTBEAT = ['gamepb.userpb.UserService', 'Heartbeat'];
const ANTI_DATA = ['gamepb.acepb.AceService', 'AntiData'];

const healthy = { heartbeatMisses: 0, oldestPendingAgeMs: 0, inboundSilenceMs: 0, pending: 0 };
const cautious = { heartbeatMisses: 0, oldestPendingAgeMs: 2500, inboundSilenceMs: 9000, pending: 1 };
const stalled = { heartbeatMisses: 1, oldestPendingAgeMs: 6000, inboundSilenceMs: 21000, pending: 3 };

function fillAuto(count, now, requestClass = 'farm') {
    for (let i = 0; i < count; i++) recordSent(...ALL_LANDS, requestClass, now);
}

test('前台请求永不被流量保险丝拒绝', () => {
    resetGovernor();
    const now = Date.now();
    // 把自动任务额度彻底打满，前台请求依然要放行。
    fillAuto(TOTAL_LIMIT * 2, now);
    for (let i = 0; i < 50; i++) {
        const result = checkRequest(...ALL_LANDS, now, { requestClass: 'foreground', health: healthy });
        assert.equal(result.allowed, true);
        assert.equal(result.reason, 'foreground');
    }
    // 面板请求不会消耗自动任务额度。
    const pressure = getBudgetPressure(now, healthy);
    assert.equal(pressure.used, TOTAL_LIMIT * 2);
});

test('心跳、登录、ACE 与收菜偷菜始终放行', () => {
    resetGovernor();
    const now = Date.now();
    fillAuto(TOTAL_LIMIT * 2, now);
    assert.equal(checkRequest(...HEARTBEAT, now, { requestClass: 'critical', health: healthy }).allowed, true);
    assert.equal(checkRequest(...ANTI_DATA, now, { requestClass: 'critical', health: healthy }).allowed, true);
    assert.equal(checkRequest('gamepb.gatepb.GateService', 'Login', now, { requestClass: 'critical', health: healthy }).allowed, true);
    assert.equal(checkRequest('gamepb.plantpb.PlantService', 'Harvest', now, { requestClass: 'farm', health: healthy }).allowed, true);
});

test('自动任务额度打满后让路，而不是继续往网关里塞', () => {
    resetGovernor();
    const now = Date.now();
    fillAuto(TOTAL_LIMIT, now);
    const blocked = checkRequest(...BAG, now, { requestClass: 'farm', health: healthy });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'budget_total');
    assert.equal(blocked.mode, 'healthy');
    assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= WINDOW_MS);

    const stats = getGovernorStats(now, healthy);
    assert.equal(stats.sentInWindow, TOTAL_LIMIT);
    assert.equal(stats.droppedTotal, 1);
    assert.equal(stats.lastDropKey, 'gamepb.itempb.ItemService.Bag');
});

test('单个自动接口不能把额度吃光', () => {
    resetGovernor();
    const now = Date.now();
    fillAuto(PER_METHOD_LIMIT, now);
    const blocked = checkRequest(...ALL_LANDS, now, { requestClass: 'farm', health: healthy });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'budget_method');
    // 其它自动接口还有余量，不该被连坐。
    assert.equal(checkRequest(...BAG, now, { requestClass: 'friend', health: healthy }).allowed, true);
});

test('网关变慢时自动任务额度自动收紧', () => {
    resetGovernor();
    const now = Date.now();
    fillAuto(AUTO_LIMIT_CAUTIOUS, now);

    // 健康状态下还有余量，cautious 已经打满。
    assert.equal(checkRequest(...BAG, now, { requestClass: 'farm', health: healthy }).allowed, true);
    const cautiousResult = checkRequest(...BAG, now, { requestClass: 'farm', health: cautious });
    assert.equal(cautiousResult.allowed, false);
    assert.equal(cautiousResult.mode, 'cautious');
});

test('网关卡住时自动任务几乎停摆，把连接留给心跳', () => {
    resetGovernor();
    const now = Date.now();
    fillAuto(AUTO_LIMIT_STALL, now);

    const stalledResult = checkRequest(...BAG, now, { requestClass: 'friend', health: stalled });
    assert.equal(stalledResult.allowed, false);
    assert.equal(stalledResult.mode, 'stall');
    // 但前台和心跳照旧。
    assert.equal(checkRequest(...BAG, now, { requestClass: 'foreground', health: stalled }).allowed, true);
    assert.equal(checkRequest(...HEARTBEAT, now, { requestClass: 'critical', health: stalled }).allowed, true);
});

test('前台活跃信号按时间窗口生效', () => {
    resetGovernor();
    const now = Date.now();
    assert.equal(isForegroundActive(now), false);
    checkRequest(...ALL_LANDS, now, { requestClass: 'foreground', health: healthy });
    assert.equal(isForegroundActive(now), true);
    assert.equal(isForegroundActive(now + 1000), true);
    assert.equal(isForegroundActive(now + 5000), false);
});

test('额度随时间滑出窗口后恢复', () => {
    resetGovernor();
    const start = Date.now();
    fillAuto(TOTAL_LIMIT, start);
    assert.equal(checkRequest(...BAG, start, { requestClass: 'farm', health: healthy }).allowed, false);

    const later = start + WINDOW_MS + 1;
    assert.equal(checkRequest(...BAG, later, { requestClass: 'farm', health: healthy }).allowed, true);
    const stats = getGovernorStats(later, healthy);
    assert.equal(stats.sentInWindow, 0);
});
