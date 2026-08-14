const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const protobuf = require('protobufjs');

let refreshRequest;
let refreshReply;
let statusRequest;
let statusReply;
let claimRequest;
let claimReply;

test.before(async () => {
    const root = new protobuf.Root();
    await root.load([
        path.join(__dirname, '../src/proto/corepb.proto'),
        path.join(__dirname, '../src/proto/qqvippb.proto'),
    ], { keepCase: true });

    refreshRequest = root.lookupType('gamepb.qqvippb.RefreshVipInfoRequest');
    refreshReply = root.lookupType('gamepb.qqvippb.RefreshVipInfoReply');
    statusRequest = root.lookupType('gamepb.qqvippb.GetQQVipRewardsStatusRequest');
    statusReply = root.lookupType('gamepb.qqvippb.GetQQVipRewardsStatusReply');
    claimRequest = root.lookupType('gamepb.qqvippb.ClaimQQVipRewardsRequest');
    claimReply = root.lookupType('gamepb.qqvippb.ClaimQQVipRewardsReply');
});

function loadServiceWithMocks(sendMsgAsync, log) {
    const servicePath = require.resolve('../dist/services/qqvip');
    const networkPath = require.resolve('../dist/utils/network');
    const protoPath = require.resolve('../dist/utils/proto');
    const utilsPath = require.resolve('../dist/utils/utils');
    const paths = [servicePath, networkPath, protoPath, utilsPath];
    const previousCache = new Map(paths.map(modulePath => [modulePath, require.cache[modulePath]]));

    const setMock = (modulePath, exports) => {
        const mock = new Module(modulePath);
        mock.filename = modulePath;
        mock.loaded = true;
        mock.exports = exports;
        require.cache[modulePath] = mock;
    };

    try {
        delete require.cache[servicePath];
        setMock(networkPath, { sendMsgAsync });
        setMock(protoPath, {
            types: {
                RefreshVipInfoRequest: refreshRequest,
                RefreshVipInfoReply: refreshReply,
                GetQQVipRewardsStatusRequest: statusRequest,
                GetQQVipRewardsStatusReply: statusReply,
                ClaimQQVipRewardsRequest: claimRequest,
                ClaimQQVipRewardsReply: claimReply,
            },
        });
        setMock(utilsPath, {
            log,
            toNum: value => Number(value),
            getSystemDateKey: () => '2026-08-15',
        });
        return require(servicePath);
    } finally {
        for (const modulePath of paths) {
            const previous = previousCache.get(modulePath);
            if (previous) require.cache[modulePath] = previous;
            else delete require.cache[modulePath];
        }
    }
}

test('decodes VIP reward types from status field 5', () => {
    const status = statusReply.decode(Buffer.from('2a0228012a022802', 'hex'));
    const vipTypes = status.reward_configs.map(config => config.vip_type);

    assert.deepEqual(vipTypes, [1, 2]);
});

test('encodes selected VIP types in claim request field 1', () => {
    const svipOnly = claimRequest.encode(claimRequest.create({ vip_types: [2] })).finish();
    const bothTypes = claimRequest.encode(claimRequest.create({ vip_types: [1, 2] })).finish();

    assert.equal(Buffer.from(svipOnly).toString('hex'), '0a0102');
    assert.equal(Buffer.from(bothTypes).toString('hex'), '0a020102');
});

test('decodes claimed items from response field 3', () => {
    const encoded = claimReply.encode(claimReply.create({
        items: [{ id: 80011, count: 10 }],
    })).finish();
    const reply = claimReply.decode(encoded);

    assert.equal(encoded[0], 0x1A);
    assert.equal(Number(reply.items[0].id), 80011);
    assert.equal(Number(reply.items[0].count), 10);
});

test('uses the current QQ VIP RPC sequence and claims available types', async () => {
    const calls = [];
    const logs = [];
    const sendMsgAsync = async (serviceName, methodName, body) => {
        calls.push({ serviceName, methodName });
        if (methodName === 'RefreshVipInfo') {
            return { body: refreshReply.encode(refreshReply.create({})).finish() };
        }
        if (methodName === 'GetQQVipRewardsStatus') {
            return {
                body: statusReply.encode(statusReply.create({
                    reward_configs: [{ vip_type: 2 }],
                })).finish(),
            };
        }
        if (methodName === 'ClaimQQVipRewards') {
            const request = claimRequest.decode(body);
            assert.deepEqual(request.vip_types, [2]);
            return {
                body: claimReply.encode(claimReply.create({
                    items: [{ id: 80011, count: 10 }],
                })).finish(),
            };
        }
        throw new Error(`unexpected method: ${methodName}`);
    };
    const service = loadServiceWithMocks(sendMsgAsync, (...args) => logs.push(args));

    assert.equal(await service.performDailyVipGift(true), true);
    assert.deepEqual(calls, [
        { serviceName: 'gamepb.qqvippb.QQVipService', methodName: 'RefreshVipInfo' },
        { serviceName: 'gamepb.qqvippb.QQVipService', methodName: 'GetQQVipRewardsStatus' },
        { serviceName: 'gamepb.qqvippb.QQVipService', methodName: 'ClaimQQVipRewards' },
    ]);
    assert.deepEqual(logs.at(-1)[2].vipTypes, [2]);
});
