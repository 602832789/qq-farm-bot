const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const protobuf = require('protobufjs');

let syncRequest;
let syncReply;

test.before(async () => {
    const root = new protobuf.Root();
    await root.load(path.join(__dirname, '../src/proto/friendpb.proto'), { keepCase: true });
    syncRequest = root.lookupType('gamepb.friendpb.SyncAllRequest');
    syncReply = root.lookupType('gamepb.friendpb.SyncAllReply');
});

function loadServiceWithMocks({
    platform = 'qq',
    sendMsgAsync = async () => ({ body: syncReply.encode(syncReply.create({})).finish() }),
    onSyncKnownGids = () => {},
    onClearCache = () => {},
} = {}) {
    const servicePath = require.resolve('../dist/services/friend/open-id-sync');
    const configPath = require.resolve('../dist/config/config');
    const networkPath = require.resolve('../dist/utils/network');
    const protoPath = require.resolve('../dist/utils/proto');
    const gidManagerPath = require.resolve('../dist/services/friend/gid-manager');
    const visitStrategyPath = require.resolve('../dist/services/friend/visit-strategy');
    const paths = [servicePath, configPath, networkPath, protoPath, gidManagerPath, visitStrategyPath];
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
        setMock(configPath, { CONFIG: { platform } });
        setMock(networkPath, { sendMsgAsync });
        setMock(protoPath, {
            types: {
                SyncAllFriendsRequest: syncRequest,
                SyncAllFriendsReply: syncReply,
            },
        });
        setMock(gidManagerPath, {
            dedupeFriendsByGid(friends) {
                const seen = new Set();
                return friends.filter((friend) => {
                    const gid = Number(friend && friend.gid);
                    if (!gid || seen.has(gid)) return false;
                    seen.add(gid);
                    return true;
                });
            },
            extractReplyFriends: reply => reply.game_friends || [],
            syncKnownFriendGidsFromFriends: onSyncKnownGids,
        });
        setMock(visitStrategyPath, { clearFriendsListCache: onClearCache });
        return require(servicePath);
    } finally {
        for (const modulePath of paths) {
            const previous = previousCache.get(modulePath);
            if (previous) require.cache[modulePath] = previous;
            else delete require.cache[modulePath];
        }
    }
}

test('validates, trims, and deduplicates friend OpenIDs', () => {
    const service = loadServiceWithMocks();

    assert.deepEqual(service.parseFriendOpenIds([' open-a ', 'open-b', 'open-a']), {
        ok: true,
        openIds: ['open-a', 'open-b'],
    });
    assert.equal(service.parseFriendOpenIds([]).ok, false);
    assert.equal(service.parseFriendOpenIds(['']).ok, false);
    assert.equal(service.parseFriendOpenIds([123]).ok, false);
    assert.equal(service.parseFriendOpenIds(['x'.repeat(129)]).ok, false);
    assert.equal(service.parseFriendOpenIds(Array.from({ length: 201 }, (_, index) => `id-${index}`)).ok, false);
});

test('encodes OpenIDs in SyncAll request field 2 and refreshes friend state', async () => {
    const calls = [];
    const syncedFriends = [];
    let cacheClearCount = 0;
    const service = loadServiceWithMocks({
        sendMsgAsync: async (serviceName, methodName, body) => {
            const request = syncRequest.decode(body);
            calls.push({ serviceName, methodName, openIds: request.open_ids });
            return {
                body: syncReply.encode(syncReply.create({
                    game_friends: [
                        { gid: 101, open_id: 'open-a', name: 'A' },
                        { gid: 102, open_id: 'open-b', name: 'B' },
                        { gid: 101, open_id: 'open-a', name: 'A duplicate' },
                    ],
                })).finish(),
            };
        },
        onSyncKnownGids: friends => syncedFriends.push(...friends),
        onClearCache: () => { cacheClearCount += 1; },
    });

    const result = await service.syncFriendsByOpenIds(['open-a', 'open-b']);

    assert.deepEqual(calls, [{
        serviceName: 'gamepb.friendpb.FriendService',
        methodName: 'SyncAll',
        openIds: ['open-a', 'open-b'],
    }]);
    assert.equal(Buffer.from(syncRequest.encode(syncRequest.create({ open_ids: ['open-a'] })).finish())[0], 0x12);
    assert.deepEqual(syncedFriends.map(friend => Number(friend.gid)), [101, 102]);
    assert.equal(cacheClearCount, 1);
    assert.deepEqual(result, { receivedCount: 2, friendCount: 2 });
});

test('does not send SyncAll for empty or invalid OpenID input', async () => {
    let callCount = 0;
    const service = loadServiceWithMocks({
        sendMsgAsync: async () => {
            callCount += 1;
            return { body: syncReply.encode(syncReply.create({})).finish() };
        },
    });

    await assert.rejects(() => service.syncFriendsByOpenIds([]), /OpenID/);
    await assert.rejects(() => service.syncFriendsByOpenIds(['x'.repeat(129)]), /OpenID/);
    assert.equal(callCount, 0);
});

test('rejects non-QQ accounts before sending SyncAll', async () => {
    let callCount = 0;
    const service = loadServiceWithMocks({
        platform: 'wx',
        sendMsgAsync: async () => {
            callCount += 1;
            return { body: syncReply.encode(syncReply.create({})).finish() };
        },
    });

    await assert.rejects(() => service.syncFriendsByOpenIds(['open-a']), /QQ/);
    assert.equal(callCount, 0);
});
