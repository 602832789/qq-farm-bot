const assert = require('node:assert/strict');
const test = require('node:test');
const { getEffectiveSellInfo, getItemById } = require('../dist/config/gameConfig');

test('鹊羽灵露仅在服务端活动结束条件满足后开放手动出售', () => {
    const dew = getItemById(301103);
    assert.equal(dew.name, '鹊羽灵露');
    assert.equal(dew.sell_cond, '活动结束后:2026081801');

    const activeWindows = new Map([
        ['2026081801', { id: '2026081801', beginTime: 100, endTime: 300 }],
    ]);
    const duringEvent = getEffectiveSellInfo(dew, {
        nowSec: 200,
        activityWindows: activeWindows,
        activityWindowsLoaded: true,
    });
    assert.equal(duringEvent.sellable, false);
    assert.equal(duringEvent.status, 'conditional');

    const afterEvent = getEffectiveSellInfo(dew, {
        nowSec: 301,
        activityWindows: activeWindows,
        activityWindowsLoaded: true,
    });
    assert.equal(afterEvent.sellable, true);
    assert.equal(afterEvent.status, 'available');
    assert.deepEqual(afterEvent.sells, [{ currencyId: 1001, price: 100 }]);
});
