const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// 续期链路的 store / 微信登录服务全部注入内存假实现：不发网络、不碰 core/data。
const mocks = {
    accounts: [],
    writes: [],
    refreshImpl: null,
    issueImpl: null,
};

class MockWxLoginService {
    async refreshLoginBuffer(input) { return mocks.refreshImpl(input); }
    async issueCode(session, appId) { return mocks.issueImpl(session, appId); }
    destroy() {}
}

const storeMock = {
    getAccounts: () => ({ accounts: mocks.accounts }),
    addOrUpdateAccount: (patch) => {
        mocks.writes.push(patch);
        const account = mocks.accounts.find(item => String(item.id) === String(patch.id));
        if (account) Object.assign(account, patch);
    },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '../models/store') return storeMock;
    if (request === './wx-login/service') return { WxLoginService: MockWxLoginService };
    return originalLoad.call(this, request, parent, isMain);
};
after(() => { Module._load = originalLoad; });

const wx = require('../dist/services/wx-credential');

function reset(patch = {}) {
    mocks.accounts = [{
        id: '1',
        name: '微信账号',
        platform: 'wx',
        wxid: 'openid-1',
        code: 'OLD',
        refreshtoken: 'r1',
        accesstoken: 'a1',
        loginBuffer: 'b1',
        expires_in: 7200,
        expires_at: Date.now() + 7200_000,
        ...patch,
    }];
    mocks.writes = [];
    mocks.refreshImpl = async () => { throw new Error('不应调用 refreshtoken 滚动'); };
    mocks.issueImpl = async () => 'FRESH_CODE';
}

test('只有 loginBuffer、没有 refreshtoken 的账号仍属于可续期账号', () => {
    assert.equal(wx.hasRenewableCredential({ platform: 'wx', loginBuffer: 'b1', refreshtoken: '' }), true);
    assert.equal(wx.hasRenewableCredential({ platform: 'wx', loginBuffer: '', refreshtoken: '' }), false);
    assert.equal(wx.hasRenewableCredential({ platform: 'qq', loginBuffer: 'b1' }), false);
});

test('手动续期优先用长效 loginBuffer 换 Code，不消耗一次性 refreshtoken', async () => {
    reset();
    let refreshCalls = 0;
    mocks.refreshImpl = async () => { refreshCalls += 1; throw new Error('不应滚动 token'); };
    mocks.issueImpl = async session => {
        assert.equal(session.loginBuffer, 'b1');
        return 'CODE_FROM_BUFFER';
    };

    const result = await wx.ensureFreshGameCode('1');
    assert.equal(result.ok, true);
    assert.equal(result.code, 'CODE_FROM_BUFFER');
    assert.equal(refreshCalls, 0);
    assert.equal(mocks.accounts[0].code, 'CODE_FROM_BUFFER');
    assert.equal(mocks.accounts[0].wxCredentialRefreshError, '');
});

test('换 Code 失败时仍落盘已滚动的新 refreshtoken / loginBuffer', async () => {
    reset();
    mocks.refreshImpl = async () => ({
        openid: 'openid-1',
        refreshtoken: 'r2',
        accesstoken: 'a2',
        loginBuffer: 'b2',
        expires_in: 7200,
        expires_at: Date.now() + 7200_000,
        refreshedAt: Date.now(),
    });
    mocks.issueImpl = async () => { throw new Error('MMTLS 连接超时'); };

    const result = await wx.refreshAccountCredential('1');
    assert.equal(result.ok, false);
    assert.match(result.error, /MMTLS/);
    assert.equal(mocks.accounts[0].refreshtoken, 'r2', '旧 token 已作废，必须保存新值');
    assert.equal(mocks.accounts[0].loginBuffer, 'b2');
    assert.ok(Number(mocks.accounts[0].wxCredentialRefreshedAt) > 0);
});

test('同账号并发续期串行化：第二次拿到的是刚落盘的新 refreshtoken', async () => {
    reset();
    const seen = [];
    let sequence = 0;
    mocks.refreshImpl = async (input) => {
        assert.equal(input.refreshtoken, mocks.accounts[0].refreshtoken, '不能使用已作废的旧 token');
        seen.push(input.refreshtoken);
        sequence += 1;
        return {
            openid: 'openid-1',
            refreshtoken: `r${sequence + 1}`,
            accesstoken: `a${sequence + 1}`,
            loginBuffer: `b${sequence + 1}`,
            expires_in: 7200,
            expires_at: Date.now() + 7200_000,
            refreshedAt: Date.now(),
        };
    };

    await Promise.all([wx.refreshAccountCredential('1'), wx.refreshAccountCredential('1')]);
    assert.deepEqual(seen, ['r1', 'r2']);
    assert.equal(mocks.accounts[0].refreshtoken, 'r3');
});

test('loginBuffer 过期时回落到滚动续期，且不会因同一把锁重入死锁', async () => {
    reset({ loginBuffer: '', expires_at: Date.now() - 1000 });
    mocks.refreshImpl = async () => ({
        openid: 'openid-1',
        refreshtoken: 'r2',
        accesstoken: 'a2',
        loginBuffer: 'b2',
        expires_in: 7200,
        expires_at: Date.now() + 7200_000,
        refreshedAt: Date.now(),
    });

    const result = await wx.ensureFreshGameCode('1');
    assert.equal(result.ok, true);
    assert.equal(result.code, 'FRESH_CODE');
    assert.equal(mocks.accounts[0].refreshtoken, 'r2');
});
