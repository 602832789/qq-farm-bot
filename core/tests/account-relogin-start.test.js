const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const test = require('node:test');

/**
 * POST /api/accounts 的「保存后是否自动登录」回归测试。
 *
 * 背景：为了让编辑态重扫把新凭据写回原账号，前端开始带 id 提交。
 * 带 id 后不再走「备注名碰巧匹配」那条 relogin 分支，掉进了
 * `wasRunning && !onlyRemarkChanged`，于是停止中的账号重扫/填新 Code
 * 后既不 restart 也不 start —— 用户看到「重新登录后不会直接登录」。
 */
function load(file, overrides = {}) {
    const filename = path.resolve(__dirname, '../dist', file);
    const realRequire = createRequire(filename);
    const sandbox = {
        require: name => {
            if (name in overrides) return overrides[name];
            return realRequire(name);
        },
        module: { exports: {} },
        exports: {},
        Buffer,
        process,
        console,
    };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
    return sandbox.module.exports;
}

/** 用内存 store 顶掉真实文件读写，并记录调用。 */
function harness(options = {}) {
    const calls = [];
    let accounts = options.accounts || [
        { id: '1', name: '账号一', platform: 'wx', code: 'OLD', refreshtoken: 'r1', loginBuffer: 'b1' },
        { id: '2', name: '账号二', platform: 'qq', code: 'OLD2' },
    ];
    const store = {
        getAccounts: () => ({ accounts: JSON.parse(JSON.stringify(accounts)) }),
        addOrUpdateAccount: (payload) => {
            calls.push({ type: 'save', payload });
            const idx = accounts.findIndex(a => a.id === String(payload.id));
            if (idx >= 0) accounts[idx] = { ...accounts[idx], ...payload };
            else accounts = [...accounts, payload];
            return { accounts };
        },
        deleteAccount: () => {},
    };
    const routes = new Map();
    const app = {
        get() {},
        post: (route, handler) => routes.set(route, handler),
        delete() {},
        put() {},
    };
    const running = new Set(options.running || []);
    const provider = {
        getAccounts: () => ({ accounts: JSON.parse(JSON.stringify(accounts)) }),
        isAccountRunning: (id) => running.has(String(id)),
        startAccount: (id) => { calls.push({ type: 'start', id: String(id) }); return Promise.resolve(true); },
        stopAccount: (id) => { calls.push({ type: 'stop', id: String(id) }); return true; },
        restartAccount: (id) => { calls.push({ type: 'restart', id: String(id) }); return true; },
        addAccountLog: () => {},
        resolveAccountId: (ref) => String(ref || ''),
    };
    const { mountAccountRoutes } = load('controllers/admin/account-routes.js', {
        '../../models/store': store,
    });
    mountAccountRoutes(app, { provider });

    const handler = routes.get('/api/accounts');
    assert.equal(typeof handler, 'function', 'POST /api/accounts 未注册');

    return {
        calls,
        running,
        accounts: () => accounts,
        post(body) {
            const captured = { statusCode: 200, body: null };
            const res = {
                status(code) { captured.statusCode = code; return this; },
                json(value) { captured.body = value; return this; },
            };
            handler({ body }, res);
            return captured;
        },
        actions: () => calls.filter(call => call.type !== 'save').map(call => `${call.type}:${call.id}`),
        saved: () => calls.filter(call => call.type === 'save').map(call => call.payload),
    };
}

test('仅改备注：不重启、不启动', () => {
    const h = harness({ running: ['1'] });
    const res = h.post({ id: '1', name: '账号一改' });
    assert.equal(res.body.ok, true);
    assert.deepEqual(h.actions(), [], '只改备注不应触发任何启停');
    assert.equal(h.accounts().find(a => a.id === '1').name, '账号一改');
});

test('带 id 重新扫码（账号已停止）：应当启动登录', () => {
    const h = harness({ running: [] });
    const res = h.post({
        id: '1',
        name: '账号一',
        code: 'NEW_CODE',
        platform: 'wx',
        loginType: 'manual',
        wxCredentialRefreshError: '',
        refreshtoken: 'r2',
        loginBuffer: 'b2',
    });
    assert.equal(res.body.ok, true);
    assert.deepEqual(h.actions(), ['start:1'], '停止中的账号重登后必须被启动');
    const saved = h.saved().at(-1);
    assert.equal(saved.code, 'NEW_CODE', '新 Code 必须落盘');
    assert.equal(saved.refreshtoken, 'r2', '新的滚动凭证必须落盘');
});

test('带 id 重新扫码（账号在运行）：应当重启让新凭据生效', () => {
    const h = harness({ running: ['1'] });
    h.post({ id: '1', name: '账号一', code: 'NEW_CODE', platform: 'wx' });
    assert.deepEqual(h.actions(), ['restart:1']);
});

test('带 id 只改非登录字段（正在运行）：保持原重启行为', () => {
    const h = harness({ running: ['1'] });
    h.post({ id: '1', name: '账号一', avatar: 'http://x/a.png' });
    assert.deepEqual(h.actions(), ['restart:1']);
});

test('带 id 只改非登录字段（已停止）：不会被自动拉起', () => {
    const h = harness({ running: [] });
    h.post({ id: '1', name: '账号一', avatar: 'http://x/a.png' });
    assert.deepEqual(h.actions(), [], '非登录类更新不应把停止的账号拉起来');
});

test('不带 id、备注名匹配已有账号：仍按备注重登处理（QQ 填新 Code）', () => {
    const h = harness({ running: [] });
    h.post({ name: '账号二', code: 'QQ_NEW', platform: 'qq', loginType: 'manual' });
    assert.deepEqual(h.actions(), ['start:2']);
    assert.equal(h.accounts().find(a => a.id === '2').code, 'QQ_NEW');
});

test('不带 id、备注名不匹配：新增账号并启动', () => {
    const h = harness({ running: [] });
    const res = h.post({ name: '新账号', code: 'C', platform: 'qq' });
    assert.equal(res.body.ok, true);
    assert.equal(h.actions().length, 1);
    assert.ok(h.actions()[0].startsWith('start:'), '新增账号要自动启动');
    assert.notEqual(h.actions()[0], 'start:1');
});