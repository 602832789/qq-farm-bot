const assert = require('node:assert/strict');
const test = require('node:test');

const { buildActivityDirectory } = require('../dist/services/activity-center');

test('activity directory groups overlapping sub-activity ids into one card', () => {
    const windows = [
        { id: '2026081201', name: '青酿换万金', beginTime: 100, endTime: 190 },
        { id: '2026081202', name: '青酿换万金', beginTime: 100, endTime: 200 },
        { id: '2026081200', name: '青酿换万金', beginTime: 90, endTime: 200 },
    ];
    const season = { pass: { activityId: '2026081202' } };

    const result = buildActivityDirectory(windows, season, null, null, null);

    assert.equal(result.length, 1);
    assert.equal(result[0].id, '2026081200');
    assert.deepEqual(result[0].activityIds, ['2026081201', '2026081202', '2026081200']);
    assert.equal(result[0].startTime, 90);
    assert.equal(result[0].endTime, 200);
    assert.equal(result[0].gameplayKey, 'stellar');
    assert.deepEqual(result[0].gameplayKeys, ['stellar']);
    assert.equal(result[0].detailTarget, 'travel');
    assert.deepEqual(result[0].gameplayTargets, ['travel']);
});

test('activity directory exposes all implemented gameplay targets in stable priority order', () => {
    const windows = [
        { id: '2026081203', name: '同一活动', beginTime: 100, endTime: 200 },
        { id: '2026081201', name: '同一活动', beginTime: 100, endTime: 200 },
        { id: '2026081202', name: '同一活动', beginTime: 100, endTime: 200 },
    ];
    const season = { pass: { activityId: '2026081201' } };
    const constellation = { activityId: '2026081202' };
    const shop = { activityId: '2026081203' };

    const [activity] = buildActivityDirectory(windows, season, shop, null, constellation);

    assert.equal(activity.gameplayKey, 'stellar');
    assert.equal(activity.detailTarget, 'travel');
    assert.deepEqual(activity.gameplayTargets, ['travel', 'constellation', 'shop']);
});

test('activity directory keeps separate runs with the same name', () => {
    const windows = [
        { id: '2026080100', name: '青酿换万金', beginTime: 100, endTime: 200 },
        { id: '2026081200', name: '青酿换万金', beginTime: 300, endTime: 400 },
    ];

    const result = buildActivityDirectory(windows, null, null, null, null);

    assert.equal(result.length, 2);
    assert.deepEqual(result.map(entry => entry.id), ['2026080100', '2026081200']);
    assert.ok(result.every(entry => entry.gameplayKey === null));
    assert.ok(result.every(entry => entry.detailTarget === null));
});
