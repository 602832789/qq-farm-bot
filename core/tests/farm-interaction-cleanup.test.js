const assert = require('node:assert/strict');
const test = require('node:test');

const { loadProto, types } = require('../dist/utils/proto');
const {
    analyzeLands,
} = require('../dist/services/farm/land-analysis');
const {
    analyzeFriendLands,
} = require('../dist/services/friend/visit-strategy');

function growingLand(id, itemId = 0, status = {}) {
    const now = Math.floor(Date.now() / 1000);
    return {
        id,
        unlocked: true,
        plant: {
            id: 100001,
            phases: [
                { phase: 2, begin_time: now - 60 },
                { phase: 6, begin_time: now + 3600 },
            ],
            interaction_uses: itemId > 0 ? [{ item_id: itemId }] : [],
            interaction_targets: itemId > 0 ? [{ item_id: itemId, land_id: id }] : [],
            ...status,
        },
    };
}

test('own farm cleanup selects golden beetles and footballs only', () => {
    const status = analyzeLands([
        growingLand(1, 301101),
        growingLand(2, 301102),
        growingLand(3, 301103),
    ], false, 9001);

    assert.deepEqual(status.needInteractionCleanup, [1, 2]);
    assert.deepEqual(status.needWeed, []);
    assert.deepEqual(status.needBug, []);
    assert.deepEqual(status.needWater, []);
});

test('friend help does not treat golden beetles or footballs as help targets', () => {
    const status = analyzeFriendLands([
        growingLand(1, 301101),
        growingLand(2, 301102),
    ], 9002);

    assert.deepEqual(status.needWeed, []);
    assert.deepEqual(status.needBug, []);
    assert.deepEqual(status.needWater, []);
});

test('ordinary watering, weeding and bug removal targets stay unchanged', () => {
    const land = growingLand(3, 0, {
        dry_num: 1,
        weed_owners: [8001],
        insect_owners: [8002],
    });
    const ownStatus = analyzeLands([land], false, 9001);
    const friendStatus = analyzeFriendLands([land], 9002);

    assert.deepEqual(ownStatus.needWater, [3]);
    assert.deepEqual(ownStatus.needWeed, [3]);
    assert.deepEqual(ownStatus.needBug, [3]);
    assert.deepEqual(friendStatus.needWater, [3]);
    assert.deepEqual(friendStatus.needWeed, [3]);
    assert.deepEqual(friendStatus.needBug, [3]);
});

test('own Farming request keeps the two explicit zero-valued scene fields', async () => {
    await loadProto();
    const { encodeOwnFarmingRequest } = require('../dist/services/farm/api');
    const body = encodeOwnFarmingRequest([8, 15], 1234);
    const decoded = types.FarmingRequest.decode(body);

    assert.deepEqual(Array.from(decoded.land_ids, value => Number(value)), [8, 15]);
    assert.equal(Number(decoded.host_gid), 1234);
    assert.deepEqual(Array.from(body.slice(-4)), [0x18, 0x00, 0x20, 0x00]);
});
