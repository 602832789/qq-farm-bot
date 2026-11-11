const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const statsFile = path.resolve(__dirname, '../dist/services/stats.js');
const statsSource = path.resolve(__dirname, '../src/services/stats.ts');
const runtimeSource = path.resolve(__dirname, '../src/runtime/runtime-state.ts');

// 每个用例一份独立的 stats 模块实例 + 独立数据目录，避免模块级状态互相污染。
function loadStats(dataDir) {
    const actualRequire = require('node:module').createRequire(statsFile);
    const box = { exports: {} };
    vm.runInNewContext(fs.readFileSync(statsFile, 'utf8'), {
        module: box,
        exports: box.exports,
        require: actualRequire,
        Date,
        setTimeout,
        clearTimeout,
        process: { env: { FARM_DATA_DIR: dataDir }, pid: 12345, uptime: () => 90000 },
        console: { warn: () => {}, log: () => {} },
    });
    return box.exports;
}

function makeDataDir(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-stats-gold-bean-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}

function state(gold, exp, coupon, goldBean) {
    return { gold, exp, coupon, goldBean };
}

function savedFile(dataDir, accountId) {
    return path.join(dataDir, 'stats', `${accountId}.json`);
}

function writeSaved(dataDir, accountId, payload) {
    fs.mkdirSync(path.dirname(savedFile(dataDir, accountId)), { recursive: true });
    fs.writeFileSync(savedFile(dataDir, accountId), JSON.stringify(payload), 'utf8');
}

test('金豆当日净值与金币/点券同口径：首次为 0，增加为正，消费为负', (t) => {
    const dataDir = makeDataDir(t);
    const api = loadStats(dataDir);
    api.initStatsWithPersistence('acc-1', 1000, 5000, 30);
    api.resetSessionGains();

    const first = api.getStats({}, state(1000, 5000, 30, 800), true, {});
    assert.equal(first.status.goldBean, 800);
    assert.equal(first.sessionGoldBeanGained, 0, '当日首次看到余额，净增为 0');
    assert.equal(first.sessionGoldGained, 0);

    const gained = api.getStats({}, state(1120, 5100, 40, 920), true, {});
    assert.equal(gained.sessionGoldBeanGained, 120);
    assert.equal(gained.sessionGoldGained, 120);
    assert.equal(gained.sessionCouponGained, 10);
    assert.equal(gained.sessionExpGained, 100);

    const spent = api.getStats({}, state(900, 5100, 20, 700), true, {});
    assert.equal(spent.sessionGoldBeanGained, -100, '花掉金豆后必须显示负数，不能 clamp 到 0');
    assert.equal(spent.sessionGoldGained, -100);
    assert.equal(spent.sessionCouponGained, -10);

    const offline = api.getStats({}, state(1, 1, 1, 1), false, {});
    assert.equal(offline.sessionGoldBeanGained, -100, '掉线时不拿脏数据重算净值');
});

test('同日重启：金豆当日基线从存档恢复，跨浏览器/刷新数值一致', (t) => {
    const dataDir = makeDataDir(t);
    const api = loadStats(dataDir);
    api.initStatsWithPersistence('acc-1', 1000, 5000, 30);
    api.getStats({}, state(1000, 5000, 30, 800), true, {});
    api.getStats({}, state(1000, 5000, 30, 950), true, {});
    api.saveStats();

    const saved = JSON.parse(fs.readFileSync(savedFile(dataDir, 'acc-1'), 'utf8'));
    assert.equal(saved.date, api.getTodayKey());
    assert.equal(saved.initialState.goldBean, 800, '存档里要带金豆当日基线');

    // 模拟重启：新模块实例，登录时余额已涨到 950。
    const restarted = loadStats(dataDir);
    restarted.initStatsWithPersistence('acc-1', 1000, 5000, 30);
    restarted.resetSessionGains();
    const after = restarted.getStats({}, state(1000, 5000, 30, 950), true, {});
    assert.equal(after.sessionGoldBeanGained, 150, '同日重启不从头算');
    const spent = restarted.getStats({}, state(1000, 5000, 30, 700), true, {});
    assert.equal(spent.sessionGoldBeanGained, -100, '恢复基线后仍可为负');
});

test('跨天：旧日期存档不沿用金豆基线，从当天首次观测重新起算', (t) => {
    const dataDir = makeDataDir(t);
    const today = loadStats(dataDir).getTodayKey();
    assert.notEqual(today, '2000-01-01');
    writeSaved(dataDir, 'acc-1', {
        date: '2000-01-01',
        operations: {},
        initialState: { gold: 100, exp: 100, coupon: 10, goldBean: 100 },
        savedAt: 1,
    });

    const api = loadStats(dataDir);
    api.initStatsWithPersistence('acc-1', 1000, 5000, 30);
    const first = api.getStats({}, state(1000, 5000, 30, 600), true, {});
    assert.equal(first.sessionGoldBeanGained, 0, '不能把昨天的 100 当今天的基线');
    const next = api.getStats({}, state(1000, 5000, 30, 650), true, {});
    assert.equal(next.sessionGoldBeanGained, 50);
});

test('旧存档没有金豆基线段：保持首次观测，不能把 null 当 0 恢复', (t) => {
    const dataDir = makeDataDir(t);
    const seed = loadStats(dataDir);
    writeSaved(dataDir, 'acc-1', {
        date: seed.getTodayKey(),
        operations: {},
        initialState: { gold: 1000, exp: 5000, coupon: 30 },
        savedAt: 1,
    });

    const api = loadStats(dataDir);
    api.initStatsWithPersistence('acc-1', 1000, 5000, 30);
    const first = api.getStats({}, state(1000, 5000, 30, 600), true, {});
    assert.equal(first.sessionGoldBeanGained, 0, 'Number(null) === 0，若误恢复会把 600 全算成今日净增');
    const next = api.getStats({}, state(1000, 5000, 30, 650), true, {});
    assert.equal(next.sessionGoldBeanGained, 50);
});

test('余额是非法值时金豆净值仍为有限数，不会渲染 NaN', (t) => {
    const dataDir = makeDataDir(t);
    const api = loadStats(dataDir);
    api.initStatsWithPersistence('acc-1', 1000, 5000, 30);
    const bad = api.getStats({}, { gold: 1000, exp: 5000, coupon: 30, goldBean: 'abc' }, true, {});
    assert.equal(bad.sessionGoldBeanGained, 0);
    const missing = api.getStats({}, { gold: 1000, exp: 5000, coupon: 30 }, true, {});
    assert.equal(Number.isFinite(missing.sessionGoldBeanGained), true);
});

test('资产卡「本次运行」三项增量不受金豆接入影响', (t) => {
    const dataDir = makeDataDir(t);
    const api = loadStats(dataDir);
    api.initStatsWithPersistence('acc-1', 1000, 5000, 30);
    const s = api.getStats({}, state(1200, 5300, 50, 900), true, {});
    assert.equal(s.sessionGoldBeanGained, 0);
    assert.equal(s.runGoldGained, 200);
    assert.equal(s.runExpGained, 300);
    assert.equal(s.runCouponGained, 20);
    assert.equal(s.runGoldBeanGained, undefined, '不新增资产卡金豆「本次运行」增量');
});

test('跨天与登录重置、未登录默认 status 都覆盖金豆字段', () => {
    const src = fs.readFileSync(statsSource, 'utf8');
    const dayReset = src.slice(src.indexOf('function checkAndResetDailyStats'), src.indexOf('function scheduleSave'));
    assert.match(dayReset, /initialState\.goldBean = null/);
    assert.match(dayReset, /session\.goldBeanGained = 0/);
    const loginReset = src.slice(src.indexOf('function resetSessionGains'), src.indexOf('function recomputeSessionTotals'));
    assert.match(loginReset, /session\.goldBeanGained = 0/);
    const runtime = fs.readFileSync(runtimeSource, 'utf8');
    assert.match(runtime, /sessionGoldBeanGained: 0/, '未登录默认 status 也要带该字段');
});
