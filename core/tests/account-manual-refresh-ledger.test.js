const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const test = require('node:test');

/**
 * 「上次自动续期」账本的手动入口回归测试。
 *
 * 用户口径：
 *   - 点「续期全部微信授权」成功 → 算一次续期成功，刷新时间与今日成功次数；
 *   - 重新扫码 / 填写新 Code 重新登录成功 → 同样算一次续期成功；
 *   - 手动失败**不记**：点一下失败不该把卡片整行染红。
 *
 * 这里用 vm 沙箱把 store / wx-credential / preflight-stats 换掉，
 * 直接驱动真实注册的路由 handler，断言账本调用的账号与次数。
 */
function load(file, overrides = {}) {
    const filename = path.resolve(__dirname, '../dist', file);
    const realRequire = createRequire(filename);
    const sandbox = {
        require: name => (name in overrides ? overrides[name] : realRequire(name)),
        module: { exports: {} },
        exports: {},
        Buffer,
        process,
        console,
    };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
    return sandbox.module.exports;
}

function harness(options = {}) {
    const ledger = [];
    let accounts = options.accounts || [
        { id: '1', name: '微信一号', platform: 'wx', code: 'C1', refreshtoken: 'r1', loginBuffer: 'b1' },
        { id: '2', name: '微信二号', platform: 'wx', code: 'C2', loginBuffer: 'b2' },
        { id: '3', name: 'QQ 一号', platform: 'qq', code: 'C3' },
    ];
    const store = {
        getAccounts: () => ({ accounts: JSON.parse(JSON.stringify(accounts)) }),
        addOrUpdateAccount: (payload) => {
            const idx = accounts.findIndex(a => String(a.id) === String(payload.id));
            if (idx >= 0) accounts[idx] = { ...accounts[idx], ...payload };
            else accounts = [...accounts, payload];
            return { accounts };
        },
        deleteAccount: () => {},
    };
    const preflightStats = {
        getPreflightStatsSnapshot: () => ({}),
        recordAutoRefreshSuccess: (accountId, at) => ledger.push({ accountId: String(accountId), at }),
        recordAutoRefreshFailure: (accountId) => ledger.push({ accountId: String(accountId), failure: true }),
    };
    const wxCredential = {
        hasRenewableCredential: (account) => !!(account && (account.loginBuffer || account.refreshtoken)),
        hasWxCredential: (account) => !!(account && account.refreshtoken),
        ensureFreshGameCode: async (accountId) => {
            const failing = options.failing || [];
            if (failing.includes(String(accountId))) return { ok: false, error: '刷新失败', accountName: `acc-${accountId}` };
            return { ok: true, accountName: `acc-${accountId}` };
        },
    };
    const routes = new Map();
    const app = {
        get(route, handler) { routes.set(`GET ${route}`, handler); },
        post(route, handler) { routes.set(`POST ${route}`, handler); },
        delete() {},
        put() {},
        patch() {},
    };
    const running = new Set(options.running || []);
    const provider = {
        getAccounts: () => ({ accounts: JSON.parse(JSON.stringify(accounts)) }),
        isAccountRunning: id => running.has(String(id)),
        startAccount: () => Promise.resolve(true),
        stopAccount: () => true,
        restartAccount: () => true,
        addAccountLog: () => {},
        resolveAccountId: ref => String(ref || ''),
    };
    const { mountAccountRoutes } = load('controllers/admin/account-routes.js', {
        '../../models/store': store,
        '../../services/preflight-stats': preflightStats,
        '../../services/wx-credential': wxCredential,
    });
    mountAccountRoutes(app, { provider });

    return {
        ledger,
        accounts: () => accounts,
        async post(route, body, params = {}) {
            const handler = routes.get(`POST ${route}`);
            assert.equal(typeof handler, 'function', `${route} 未注册`);
            const captured = { statusCode: 200, body: null };
            const res = {
                status(code) { captured.statusCode = code; return this; },
                json(value) { captured.body = value; return this; },
            };
            await handler({ body, params, headers: {}, query: {} }, res);
            return captured;
        },
    };
}

test('批量续期：成功的账号写账本，失败的账号不写', async () => {
    const h = harness({ failing: ['2'] });
    const res = await h.post('/api/accounts/refresh-wx-credentials', {});
    assert.equal(res.body.ok, false, '有账号失败时整体 ok=false');
    assert.deepEqual(
        h.ledger.map(item => item.accountId),
        ['1'],
        '只有成功的账号 1 计入账本，失败的账号 2 不记',
    );
    assert.ok(!h.ledger.some(item => item.failure), '手动失败不得写失败计数');
});

test('批量续期全部成功：每个账号各记一次成功', async () => {
    const h = harness();
    const res = await h.post('/api/accounts/refresh-wx-credentials', {});
    assert.equal(res.body.ok, true);
    assert.deepEqual(h.ledger.map(item => item.accountId), ['1', '2']);
    assert.ok(h.ledger.every(item => !item.failure));
});

test('单账号续期成功也刷新账本；失败不记', async () => {
    const ok = harness();
    await ok.post('/api/accounts/:id/refresh-wx-credential', {}, { id: '1' });
    assert.deepEqual(ok.ledger.map(item => item.accountId), ['1']);

    const bad = harness({ failing: ['1'] });
    const res = await bad.post('/api/accounts/:id/refresh-wx-credential', {}, { id: '1' });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(bad.ledger, [], '单账号续期失败不写账本');
});

test('重新扫码 / 填写新 Code 重新登录（微信）：记一次成功', async () => {
    const h = harness();
    const res = await h.post('/api/accounts', {
        id: '1',
        name: '微信一号',
        platform: 'wx',
        code: 'NEW_CODE',
        refreshtoken: 'r2',
        loginBuffer: 'b2',
    });
    assert.equal(res.body.ok, true);
    assert.deepEqual(h.ledger.map(item => item.accountId), ['1']);
});

test('重新登录 QQ 账号：不写账本（这行只在微信卡片展示）', async () => {
    const h = harness();
    const res = await h.post('/api/accounts', { id: '3', name: 'QQ 一号', platform: 'qq', code: 'QQ_NEW' });
    assert.equal(res.body.ok, true);
    assert.deepEqual(h.ledger, [], 'QQ 没有长效凭证，也不展示这行');
});

test('只改备注 / 头像：不算续期，不写账本', async () => {
    const onlyName = harness();
    await onlyName.post('/api/accounts', { id: '1', name: '改个备注' });
    assert.deepEqual(onlyName.ledger, [], '仅改备注不该计入续期成功');

    const withAvatar = harness();
    await withAvatar.post('/api/accounts', { id: '1', name: '微信一号', avatar: 'http://x/a.png' });
    assert.deepEqual(withAvatar.ledger, [], '只改头像没有新凭据，不算续期');
});
