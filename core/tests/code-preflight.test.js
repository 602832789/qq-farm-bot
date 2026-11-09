const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SRC = path.join(__dirname, '..', 'src');

// 保活调度器的 store / 微信续期服务全部注入内存假实现：不发网络、不碰 core/data。
const mocks = {
    accounts: [],
    running: new Set(),
    restarts: [],
    logs: [],
    printed: [],
    systemConfig: null,
    refreshImpl: null,
};

const storeMock = {
    getAccounts: () => ({ accounts: mocks.accounts }),
    getSystemConfig: () => mocks.systemConfig,
};

const wxCredentialMock = {
    hasWxCredential: account => !!account
        && String(account.platform || '') === 'wx'
        && !!String(account.wxid || '').trim()
        && !!String(account.refreshtoken || '').trim(),
    refreshAccountCredential: async id => mocks.refreshImpl(id),
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '../models/store') return storeMock;
    if (request === './wx-credential') return wxCredentialMock;
    return originalLoad.call(this, request, parent, isMain);
};

const ka = require('../dist/services/wx-keepalive');
const { OFFLINE_LOG_ACTIONS } = require('../dist/services/code-watch');

after(() => {
    ka.stopWxKeepAlive();
    Module._load = originalLoad;
});

function wxAccount(patch = {}) {
    return {
        id: '1',
        name: '微信一号',
        platform: 'wx',
        wxid: 'wxid-1',
        refreshtoken: 'rt-1',
        loginBuffer: 'lb-1',
        expires_in: 7200,
        expires_at: NOW + 2 * HOUR,
        ...patch,
    };
}

function reset() {
    mocks.accounts = [];
    mocks.running = new Set();
    mocks.restarts = [];
    mocks.logs = [];
    mocks.printed = [];
    mocks.systemConfig = null;
    mocks.refreshImpl = async id => ({ ok: true, accountId: id, accountName: '微信一号' });
    ka.stopWxKeepAlive(); // 清掉定时器、inFlight 与熔断计数
    ka.startWxKeepAlive({
        isAccountRunning: id => mocks.running.has(id),
        restartWorker: acc => mocks.restarts.push(String(acc.id)),
        log: (tag, msg) => mocks.printed.push({ tag, msg }),
        addAccountLog: (action, msg, id) => mocks.logs.push({ action, msg, id: String(id || '') }),
    });
}

test('移植老版本阈值：45 分钟窗口 / 日 8 次 / 连续 3 次 / 失败冷却 5 分钟', () => {
    assert.equal(ka.PREFLIGHT_WINDOW_MS, 45 * MINUTE);
    assert.equal(ka.MAX_DAILY_PREFLIGHT, 8);
    assert.equal(ka.MAX_CONSECUTIVE_FAILURES, 3);
    assert.equal(ka.PREFLIGHT_RETRY_MS, 5 * MINUTE);
});

test('isCredentialDue：凭证充足不刷，到期前 45 分钟 / 已过期 / 无到期信息才刷', () => {
    assert.equal(ka.isCredentialDue(wxAccount({ expires_at: NOW + 2 * HOUR }), NOW), false);
    assert.equal(ka.isCredentialDue(wxAccount({ expires_at: NOW + 50 * MINUTE }), NOW), false);
    assert.equal(ka.isCredentialDue(wxAccount({ expires_at: NOW + 45 * MINUTE }), NOW), true);
    assert.equal(ka.isCredentialDue(wxAccount({ expires_at: NOW + 10 * MINUTE }), NOW), true);
    assert.equal(ka.isCredentialDue(wxAccount({ expires_at: NOW - MINUTE }), NOW), true);
    assert.equal(ka.isCredentialDue(wxAccount({ expires_at: 0, wxCredentialRefreshedAt: 0 }), NOW), true);
    // 秒级到期时间戳也要兼容（老数据可能由外部写成秒）
    assert.equal(ka.isCredentialDue(wxAccount({ expires_at: (NOW + 2 * HOUR) / 1000 }), NOW), false);
});

test('governor：失败 5 分钟冷却、连续 3 次熔断、成功清零', () => {
    const g = ka.createPreflightGovernor(() => NOW);
    assert.equal(g.canAttempt('x', NOW), true);
    g.recordAttempt('x', NOW);
    g.recordFailure('x', '网络超时', NOW);
    assert.equal(g.canAttempt('x', NOW + MINUTE), false, '冷却期内不重复打续期接口');
    assert.equal(g.canAttempt('x', NOW + 5 * MINUTE), true);

    g.recordAttempt('x', NOW + 5 * MINUTE);
    g.recordFailure('x', '网络超时', NOW + 5 * MINUTE);
    g.recordSuccess('x', NOW + 5 * MINUTE + 1);
    assert.equal(g.snapshot('x', NOW + 5 * MINUTE + 1).failures, 0, '成功后连续失败计数清零');

    g.recordAttempt('x', NOW + 11 * MINUTE);
    g.recordFailure('x', '网络超时', NOW + 11 * MINUTE);
    g.recordAttempt('x', NOW + 17 * MINUTE);
    g.recordFailure('x', '网络超时', NOW + 17 * MINUTE);
    g.recordAttempt('x', NOW + 23 * MINUTE);
    g.recordFailure('x', '网络超时', NOW + 23 * MINUTE);
    assert.equal(g.canAttempt('x', NOW + 30 * MINUTE), false, '连续 3 次失败熔断');
});

test('governor：凭证明确失效直接熔断，UTC+8 换日后重新放行', () => {
    const g = ka.createPreflightGovernor(() => NOW);
    g.recordAttempt('y', NOW);
    g.recordFailure('y', '凭证已失效，请重新扫码登录', NOW);
    assert.equal(g.canAttempt('y', NOW + 6 * MINUTE), false, '当天不再重试');
    assert.equal(g.canAttempt('y', NOW + DAY), true, '跨 UTC+8 自然日后重新计数');
});

test('governor：日上限 8 次，换日后重置', () => {
    const g = ka.createPreflightGovernor(() => NOW);
    for (let i = 0; i < 8; i++) {
        const at = NOW + i * 6 * MINUTE;
        assert.equal(g.canAttempt('z', at), true, `第 ${i + 1} 次应放行`);
        g.recordAttempt('z', at);
        g.recordFailure('z', '网络超时', at);
        g.recordSuccess('z', at);
    }
    assert.equal(g.snapshot('z', NOW + 7 * 6 * MINUTE).attempts, 8);
    assert.equal(g.canAttempt('z', NOW + 9 * 6 * MINUTE), false, '当日超过 8 次熔断');
    assert.equal(g.canAttempt('z', NOW + DAY), true, '换日后重新计数');
});

test('后端自主：保活配置默认全关时，到期账号仍会续期并重启', async () => {
    reset();
    const acc = wxAccount({ expires_at: NOW + 20 * MINUTE });
    mocks.accounts = [acc];
    mocks.running.add('1');
    mocks.refreshImpl = async id => {
        acc.expires_at = NOW + 2 * HOUR + 20 * MINUTE; // 模拟滚动续期写回新到期时间
        return { ok: true, accountId: id, accountName: '微信一号' };
    };
    assert.equal(ka.getConfig().enabled, false, '系统配置默认关闭定时重登');
    assert.deepEqual(await ka.runCodePreflight(NOW), ['1']);
    assert.deepEqual(mocks.restarts, ['1'], '运行中账号立刻用新 Code 重新上线');
    assert.ok(mocks.logs.some(entry => entry.action === 'auto_code_preflight'));
    assert.ok(mocks.printed.some(entry => entry.msg.includes('到期前预防性续期常开')));
});

test('成功续期推进 expires_at 后，下一轮不再重复消耗滚动 token', async () => {
    reset();
    const acc = wxAccount({ expires_at: NOW + 20 * MINUTE });
    mocks.accounts = [acc];
    mocks.running.add('1');
    let calls = 0;
    mocks.refreshImpl = async id => {
        calls++;
        acc.expires_at = NOW + 2 * HOUR + 20 * MINUTE;
        return { ok: true, accountId: id, accountName: '微信一号' };
    };
    assert.deepEqual(await ka.runCodePreflight(NOW), ['1']);
    assert.deepEqual(await ka.runCodePreflight(NOW + 6 * MINUTE), [], '已过冷却期仍不触发');
    assert.equal(calls, 1);
});

test('onlyIfDue：凭证充足的账号完全不调用续期接口', async () => {
    reset();
    mocks.accounts = [wxAccount({ expires_at: NOW + 2 * HOUR })];
    mocks.running.add('1');
    let calls = 0;
    mocks.refreshImpl = async id => { calls++; return { ok: true, accountId: id, accountName: '微信一号' }; };
    assert.deepEqual(await ka.runCodePreflight(NOW), []);
    assert.equal(calls, 0);
});

test('用户手动停止的账号不会被预防性续期拉起', async () => {
    reset();
    mocks.accounts = [wxAccount({ expires_at: NOW + 10 * MINUTE })];
    assert.deepEqual(await ka.runCodePreflight(NOW), []);
    assert.deepEqual(mocks.restarts, []);
});

test('仅 loginBuffer、缺少 refreshtoken 的账号跳过滚动续期', async () => {
    reset();
    mocks.accounts = [wxAccount({ expires_at: NOW + 10 * MINUTE, refreshtoken: '' })];
    mocks.running.add('1');
    assert.deepEqual(await ka.runCodePreflight(NOW), []);
});

test('续期失败写 auto_code_preflight_failed 并进入 5 分钟冷却', async () => {
    reset();
    mocks.accounts = [wxAccount({ expires_at: NOW + 10 * MINUTE })];
    mocks.running.add('1');
    mocks.refreshImpl = async id => ({ ok: false, accountId: id, accountName: '微信一号', error: '网络超时' });
    assert.deepEqual(await ka.runCodePreflight(NOW), ['1']);
    assert.deepEqual(mocks.restarts, [], '失败不重启账号');
    assert.ok(mocks.logs.some(entry => entry.action === 'auto_code_preflight_failed'));
    assert.deepEqual(await ka.runCodePreflight(NOW + MINUTE), [], '冷却期内不重试');
});

test('同一账号续期在途时不会重复触发（inFlight 去重）', async () => {
    reset();
    mocks.accounts = [wxAccount({ expires_at: NOW + 10 * MINUTE })];
    mocks.running.add('1');
    let release;
    mocks.refreshImpl = () => new Promise((resolve) => {
        release = () => resolve({ ok: true, accountId: '1', accountName: '微信一号' });
    });
    const first = ka.runCodePreflight(NOW);
    assert.deepEqual(await ka.runCodePreflight(NOW), []);
    release();
    assert.deepEqual(await first, ['1']);
});

test('接线断言：预防通道写在 enabled 判断之前，且定时器由 runtime-engine 启动', () => {
    const keepAlive = fs.readFileSync(path.join(SRC, 'services/wx-keepalive.ts'), 'utf8');
    const engine = fs.readFileSync(path.join(SRC, 'runtime/runtime-engine.ts'), 'utf8');
    assert.match(keepAlive, /void runCodePreflight\(now\)\.catch/);
    const idxPre = keepAlive.indexOf('void runCodePreflight(now)');
    const idxEnabled = keepAlive.indexOf('if (!config.enabled) return;', idxPre);
    assert.ok(idxPre > -1 && idxEnabled > idxPre, '预防性续期必须不受 config.enabled 控制');
    assert.match(engine, /startWxKeepAlive\(/);
    assert.match(engine, /startAccountKeepAlive\(\)/);
});

test('Code 失效信号：ws_400（worker 实际写入）与预防续期失败日志均已纳入判定', () => {
    assert.ok(OFFLINE_LOG_ACTIONS.has('ws_400'));
    assert.ok(OFFLINE_LOG_ACTIONS.has('auto_code_preflight_failed'));
    const workerManager = fs.readFileSync(path.join(SRC, 'runtime/worker-manager.ts'), 'utf8');
    assert.match(workerManager, /'ws_400'/);
});
