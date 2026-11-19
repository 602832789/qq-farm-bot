const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

// 拦截动态 require：启动链路里的换码服务、QQ 授权服务、store 与 axios 全部可注入，
// 保证测试不触碰真实 core/data、也不发网络请求。
const mocks = { wx: null, qq: null, store: null, axiosPost: null };
// qq-credential 在模块顶层就缓存了 store/axios 引用，因此这里必须用稳定代理对象，
// 否则后续测试替换 mock 时模块拿到的仍是第一次加载时的旧实例。
const storeMock = {
    getLoginSettings: () => mocks.loginSettings,
    getAccounts: () => ({ accounts: mocks.accounts || [] }),
    addOrUpdateAccount: patch => (mocks.writes || []).push(patch),
};
const axiosMock = { default: { post: (...args) => mocks.axiosPost(...args) } };
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '../services/wx-credential' && mocks.wx) return mocks.wx;
    if (request === '../services/qq-credential' && mocks.qq) return mocks.qq;
    if (request === '../models/store' && mocks.store) return storeMock;
    if (request === 'axios' && mocks.axiosPost) return axiosMock;
    return originalLoad.call(this, request, parent, isMain);
};
after(() => { Module._load = originalLoad; });

const { createDataProvider } = require('../dist/runtime/data-provider');
const { resolveAutoStartAccounts } = require('../dist/config/config');

function makeProvider(account) {
    const accounts = [account];
    const started = [];
    const logs = [];
    const getAccounts = () => ({ accounts, nextId: 2 });
    const provider = createDataProvider({
        workers: {},
        globalLogs: [],
        accountLogs: [],
        store: { getAccounts },
        getAccounts,
        callWorkerApi: async () => ({}),
        buildDefaultStatus: () => ({}),
        normalizeStatusForPanel: value => value,
        filterLogs: list => list,
        addAccountLog: (...args) => logs.push(args),
        nextConfigRevision: () => 1,
        broadcastConfigToWorkers: () => {},
        buildConfigSnapshotForAccount: () => ({}),
        startWorker: acc => { started.push({ ...acc }); return true; },
        stopWorker: () => {},
        restartWorker: () => {},
    });
    return { provider, started, logs, accounts };
}

function resetMocks() {
    mocks.wx = null;
    mocks.qq = null;
    mocks.store = null;
    mocks.axiosPost = null;
    mocks.loginSettings = null;
    mocks.accounts = [];
    mocks.writes = [];
}

test('服务启动自动登录开关：默认开启，可持久化关闭，环境变量优先', () => {
    assert.equal(resolveAutoStartAccounts(undefined, ''), true);
    assert.equal(resolveAutoStartAccounts(true, ''), true);
    assert.equal(resolveAutoStartAccounts(false, ''), false);
    assert.equal(resolveAutoStartAccounts(false, '1'), true);
    assert.equal(resolveAutoStartAccounts(true, '0'), false);
    assert.equal(resolveAutoStartAccounts(true, 'false'), false);
    assert.equal(resolveAutoStartAccounts(true, 'OFF'), false);
});

test('仅有 loginBuffer（无 refreshtoken）的微信账号启动前也会自动换 Code', async () => {
    resetMocks();
    let calls = 0;
    mocks.wx = { ensureFreshGameCode: async () => { calls += 1; return { ok: true, accountName: '微信账号', code: 'FRESH' }; } };
    mocks.qq = { tryRefreshQqGameCode: async () => { throw new Error('不应调用 QQ 重签'); } };
    const { provider, started } = makeProvider({
        id: '1', name: '微信账号', platform: 'wx', code: 'STALE', loginBuffer: 'long-lived-buffer', refreshtoken: '',
    });

    assert.equal(await provider.startAccount('1'), true);
    assert.equal(calls, 1, '旧实现只认 refreshtoken，会跳过这个账号');
    assert.equal(started.length, 1);
});

test('没有任何微信长效凭证时直接用已保存 Code 启动，不阻塞启动', async () => {
    resetMocks();
    mocks.wx = { ensureFreshGameCode: async () => { throw new Error('不应调用续期'); } };
    mocks.qq = { tryRefreshQqGameCode: async () => { throw new Error('不应调用 QQ 重签'); } };
    const { provider, started } = makeProvider({
        id: '2', name: '手工 Code', platform: 'wx', code: 'MANUAL', loginBuffer: '', refreshtoken: '',
    });

    assert.equal(await provider.startAccount('2'), true);
    assert.equal(started.length, 1);
    assert.equal(started[0].code, 'MANUAL');
});

test('QQ 账号启动前尝试免扫码重签，成功后写回新 Code 再启动', async () => {
    resetMocks();
    let calls = 0;
    mocks.wx = { ensureFreshGameCode: async () => { throw new Error('不应调用微信续期'); } };
    mocks.qq = {
        tryRefreshQqGameCode: async () => {
            calls += 1;
            return { ok: true, code: 'QQ-FRESH' };
        },
    };
    const { provider, started, logs, accounts } = makeProvider({
        id: '3', name: 'QQ账号', platform: 'qq', code: 'QQ-STALE', uin: '12345',
    });

    assert.equal(await provider.startAccount('3'), true);
    assert.equal(calls, 1);
    assert.equal(started.length, 1);
    assert.ok(logs.some(entry => String(entry[1]).includes('自动重签 QQ Code')));
    assert.equal(accounts.length, 1);
});

test('QQ 重签不可用时静默回退旧 Code，并留下可诊断的账号日志', async () => {
    resetMocks();
    mocks.wx = { ensureFreshGameCode: async () => { throw new Error('不应调用微信续期'); } };
    mocks.qq = { tryRefreshQqGameCode: async () => ({ ok: false, skipped: true, error: '当前 QQ 授权服务不支持免扫码重签' }) };
    const { provider, started, logs } = makeProvider({
        id: '4', name: 'QQ账号', platform: 'qq', code: 'QQ-STALE', uin: '12345',
    });

    assert.equal(await provider.startAccount('4'), true);
    assert.equal(started.length, 1);
    assert.equal(started[0].code, 'QQ-STALE', '不得因重签失败而拒绝启动');
    assert.ok(logs.some(entry => String(entry[1]).includes('未能自动重签 QQ Code')));
});

test('QQ Code 重签：标准服务返回 TASK_EXPIRED 后标记不支持且不再重复请求', async () => {
    resetMocks();
    const writes = [];
    let posts = 0;
    mocks.store = true;
    mocks.loginSettings = { qqQrLogin: true, napCatEndpoint: 'http://napcat.test', napCatSignature: 'sig' };
    mocks.accounts = [{ id: '9', name: 'Q', platform: 'qq', code: 'OLD', uin: '999' }];
    mocks.writes = writes;
    mocks.axiosPost = async () => {
        posts += 1;
        return { data: { ok: false, code: 'TASK_EXPIRED', status: 'expired' } };
    };
    const qqCredential = require('../dist/services/qq-credential');
    qqCredential.resetQqCodeRefreshState();

    const first = await qqCredential.tryRefreshQqGameCode('9');
    assert.equal(first.ok, false);
    assert.equal(first.skipped, true);
    assert.equal(posts, 1);
    assert.equal(writes.length, 0);

    const second = await qqCredential.tryRefreshQqGameCode('9');
    assert.equal(second.ok, false);
    assert.equal(posts, 1, '不支持的服务不应每次启动都发无效请求');
});

test('QQ Code 重签：提供免扫码端点的服务返回新 Code 并写回账号', async () => {
    resetMocks();
    const writes = [];
    mocks.store = true;
    mocks.loginSettings = { qqQrLogin: true, napCatEndpoint: 'http://napcat.test', napCatSignature: 'sig' };
    mocks.accounts = [{ id: '9', name: 'Q', platform: 'qq', code: 'OLD', uin: '999' }];
    mocks.writes = writes;
    mocks.axiosPost = async () => ({ data: { ok: true, code: 'QQ-NEW' } });
    const qqCredential = require('../dist/services/qq-credential');
    qqCredential.resetQqCodeRefreshState();

    const result = await qqCredential.tryRefreshQqGameCode('9');
    assert.equal(result.ok, true);
    assert.equal(result.code, 'QQ-NEW');
    assert.deepEqual(writes, [{ id: '9', code: 'QQ-NEW' }]);
});

test('服务启动自动登录必须复用 startAccount（含启动前换码），不得直接 startWorker', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/runtime/runtime-engine.ts'), 'utf8');
    assert.match(source, /await dataProvider\.startAccount\(id\)/);
    assert.doesNotMatch(source, /accounts\.forEach\(\(acc: any\) => startWorker\(acc\)\)/);
    assert.match(source, /错峰启动/);
});

test('入口不再硬编码关闭自动登录，改为读取系统配置/环境变量', () => {
    const source = fs.readFileSync(path.join(__dirname, '../client.ts'), 'utf8');
    assert.match(source, /resolveAutoStartAccounts/);
    assert.doesNotMatch(source, /autoStartAccounts:\s*false/);
});
