const test = require('node:test');
const assert = require('node:assert/strict');
const { wxCredentialRemainingMs } = require('../dist/services/code-watch');

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function wxAccount(patch = {}) {
    return {
        id: '1',
        name: '微信一号',
        platform: 'wx',
        expires_at: NOW + 2 * HOUR,
        expires_in: 7200,
        refreshtoken: 'rt-1',
        ...patch,
    };
}

test('剩余时间直接由 expires_at 算出', () => {
    assert.equal(wxCredentialRemainingMs(wxAccount({ expires_at: NOW + 2 * HOUR }), NOW), 2 * HOUR);
    assert.equal(wxCredentialRemainingMs(wxAccount({ expires_at: NOW + 8 * MINUTE }), NOW), 8 * MINUTE);
});

test('已过期返回 0，不返回负数', () => {
    assert.equal(wxCredentialRemainingMs(wxAccount({ expires_at: NOW - 1000 }), NOW), 0);
    assert.equal(wxCredentialRemainingMs(wxAccount({ expires_at: NOW - 10 * HOUR }), NOW), 0);
});

test('秒级到期时间戳按秒解析，不会被误判为早已过期', () => {
    const account = wxAccount({ expires_at: Math.floor((NOW + HOUR) / 1000) });
    assert.equal(wxCredentialRemainingMs(account, NOW), HOUR);
});

test('缺 expires_at 时按「最近一次滚动 token 的时间 + TTL」补算', () => {
    const account = wxAccount({ expires_at: 0, wxCredentialRefreshedAt: NOW - 30 * MINUTE, expires_in: 7200 });
    assert.equal(wxCredentialRemainingMs(account, NOW), 2 * HOUR - 30 * MINUTE);
});

test('expires_at 与 refreshedAt 同时存在时取较晚的那个（重新扫码后不被旧到期时间拖回去）', () => {
    // 旧 expires_at 只剩 5 分钟，但 refreshedAt 显示刚滚过 token → 应按 2 小时起算。
    const account = wxAccount({ expires_at: NOW + 5 * MINUTE, wxCredentialRefreshedAt: NOW - MINUTE, expires_in: 7200 });
    assert.equal(wxCredentialRemainingMs(account, NOW), 2 * HOUR - MINUTE);
});

test('refreshedAt 在未来（时钟回拨）时不参与补算，避免算出超长剩余时间', () => {
    const account = wxAccount({ expires_at: NOW + HOUR, wxCredentialRefreshedAt: NOW + 10 * MINUTE, expires_in: 7200 });
    assert.equal(wxCredentialRemainingMs(account, NOW), HOUR);
});

test('完全没有到期信息时返回 0（keepalive 仍会尝试滚一次 token）', () => {
    assert.equal(wxCredentialRemainingMs(wxAccount({ expires_at: 0 }), NOW), 0);
});

test('脏数据（NaN / Infinity / 负数 / 字符串）一律收敛为 0 而不是 NaN', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, 'abc', null, undefined, {}]) {
        const remaining = wxCredentialRemainingMs(wxAccount({ expires_at: bad, wxCredentialRefreshedAt: bad }), NOW);
        assert.ok(Number.isFinite(remaining), `${String(bad)} 应返回有限数，实际 ${remaining}`);
        assert.equal(remaining, 0, `${String(bad)} 应收敛为 0`);
    }
});

test('QQ 账号没有微信凭证字段，剩余时间为 0 而不是抛错', () => {
    assert.equal(wxCredentialRemainingMs({ id: '2', platform: 'qq' }, NOW), 0);
});

test('code-watch 不再导出任何「自动补 Code / 健康等级」能力（闸门）', () => {
    const service = require('../dist/services/code-watch');
    assert.deepEqual(Object.keys(service).sort(), ['wxCredentialRemainingMs']);
    assert.equal(service.inspectAccountCodeHealth, undefined);
    assert.equal(service.buildCodeHealthSnapshot, undefined);
    assert.equal(service.autoFixAccountCode, undefined);
    assert.equal(service.WARNING_WINDOW_MS, undefined);
    assert.equal(service.OFFLINE_LOG_ACTIONS, undefined);
});
