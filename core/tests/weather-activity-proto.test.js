const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const protobuf = require('protobufjs');

async function loadRoot() {
    const root = new protobuf.Root();
    await root.load([
        path.join(__dirname, '../src/proto/activitypb.proto'),
        path.join(__dirname, '../src/proto/itempb.proto'),
        path.join(__dirname, '../src/proto/weatherpb.proto'),
        path.join(__dirname, '../src/proto/friendpb.proto'),
    ], { keepCase: true });
    return root;
}

test('weather research request reproduces the capture-verified field 140 selector', async () => {
    const root = await loadRoot();
    const Request = root.lookupType('gamepb.activitypb.AdvanceWeatherResearchRequest');
    const body = Buffer.from(Request.encode(Request.create({
        activity_id: '2026070304',
        operate_type: 40,
        weather_research_operate: { node_id: 1000 },
    })).finish());

    assert.equal(body.toString('hex'), '08a0c28dc6071028e2080308e807');
});

test('weather bottle use target preserves the host and explicit zero use config', async () => {
    const root = await loadRoot();
    const Request = root.lookupType('gamepb.itempb.UseRequest');
    const decoded = Request.decode(Request.encode(Request.create({
        item: { id: 5002, count: 1, uid: 77 },
        target: { host_gid: 123456, use_config_id: 0 },
    })).finish());

    assert.equal(Number(decoded.item.id), 5002);
    assert.equal(Number(decoded.target.host_gid), 123456);
    assert.equal(Number(decoded.target.use_config_id), 0);
});

test('friend summaries decode the weather status from field 20', async () => {
    const root = await loadRoot();
    const Friend = root.lookupType('gamepb.friendpb.GameFriend');
    const decoded = Friend.decode(Friend.encode(Friend.create({
        gid: 123456,
        weather: {
            weather_type: 1,
            status: 2,
            begin_time: 1787723547,
            end_time: 1787730747,
            source: 1,
        },
    })).finish());

    assert.equal(Number(decoded.weather.weather_type), 1);
    assert.equal(Number(decoded.weather.status), 2);
    assert.equal(Number(decoded.weather.end_time) - Number(decoded.weather.begin_time), 7200);
});
