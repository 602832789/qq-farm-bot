const test = require('node:test');
const assert = require('node:assert/strict');

const { isSellConditionSatisfied } = require('../dist/config/sell-conditions');
const { getEffectiveSellInfo } = require('../dist/config/gameConfig');

function context(nowSec, windows = [], extra = {}) {
    return {
        nowSec,
        activityWindowsLoaded: true,
        activityWindows: new Map(windows.map((window) => [window.id, window])),
        ...extra,
    };
}

const qingmeiWindow = {
    id: '2026081202',
    beginTime: 1786464000,
    endTime: 1786895999,
};

test('activity conditions preserve the original client boundary rules', () => {
    const atEnd = context(qingmeiWindow.endTime, [qingmeiWindow]);
    assert.equal(isSellConditionSatisfied('活动结束后:2026081202', atEnd), true);
    assert.equal(isSellConditionSatisfied('活动区间外:2026081202', atEnd), false);

    const afterEnd = context(qingmeiWindow.endTime + 1, [qingmeiWindow]);
    assert.equal(isSellConditionSatisfied('活动区间外:2026081202', afterEnd), true);

    const beforeStart = context(qingmeiWindow.beginTime - 1, [qingmeiWindow]);
    assert.equal(isSellConditionSatisfied('活动区间外:2026081202', beforeStart), true);
    assert.equal(isSellConditionSatisfied('活动结束后:2026081202', beforeStart), false);
});

test('missing activity records match the original client only after a list was loaded', () => {
    const loaded = context(100, []);
    assert.equal(isSellConditionSatisfied('活动结束后:missing', loaded), true);
    assert.equal(isSellConditionSatisfied('活动区间外:missing', loaded), true);
    assert.equal(isSellConditionSatisfied('活动结束前:missing', loaded), false);

    assert.equal(isSellConditionSatisfied('活动结束后:missing', {
        nowSec: 100,
        activityWindowsLoaded: false,
        activityWindows: new Map(),
    }), false);
});

test('item expiry and multiple conditions use the concrete bag stack expiry', () => {
    assert.equal(isSellConditionSatisfied('道具过期后:expire_time', context(99, [], { expireTime: 100 })), false);
    assert.equal(isSellConditionSatisfied('道具过期后:expire_time', context(100, [], { expireTime: 100 })), true);
    assert.equal(isSellConditionSatisfied('道具过期后:expire_time', context(100, [], { expireTime: 0 })), false);
    assert.equal(isSellConditionSatisfied(
        '活动区间外:2026081202;道具过期后:expire_time',
        context(qingmeiWindow.endTime + 1, [qingmeiWindow], { expireTime: 100 })
    ), true);
});

test('effective prices switch between normal and conditional sales', () => {
    const duringQingmei = getEffectiveSellInfo(41221, context(qingmeiWindow.beginTime, [qingmeiWindow]));
    assert.equal(duringQingmei.sellable, false);

    const afterQingmei = getEffectiveSellInfo(41221, context(qingmeiWindow.endTime + 1, [qingmeiWindow]));
    assert.deepEqual(afterQingmei.sells, [{ currencyId: 1001, price: 240 }]);

    const pumpkinWindow = { id: '2026030202', beginTime: 1777514400, endTime: 1779897599 };
    const duringPumpkin = getEffectiveSellInfo(49001, context(1778000000, [pumpkinWindow]));
    assert.deepEqual(duringPumpkin.sells, [{ currencyId: 1017, price: 2 }]);

    const afterPumpkin = getEffectiveSellInfo(49001, context(pumpkinWindow.endTime, [pumpkinWindow]));
    assert.deepEqual(afterPumpkin.sells, [{ currencyId: 1001, price: 4000 }]);

    const expiredBottle = getEffectiveSellInfo(5001, context(100, [], { expireTime: 100 }));
    assert.deepEqual(expiredBottle.sells, [{ currencyId: 1001, price: 1000 }]);
});
