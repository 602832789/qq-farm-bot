const test = require('node:test');
const assert = require('node:assert/strict');

const { pickSeedGoods } = require('../dist/services/activity-automation');

/** 兑换商店商品的最小形状：category=seed、available、remaining、rewards（奖励道具 ID）。 */
function seedGoods(id, name, rewardId, extra = {}) {
    return { id: String(id), name, category: 'seed', available: true, remaining: 5, rewards: [{ id: String(rewardId), count: 1 }], costs: [], ...extra };
}

test('seed purchase prefers activity (milk tea) seeds, then exp seeds, then coin seeds', () => {
    const coin = seedGoods(1, '金币果种子', 20522);
    const exp = seedGoods(2, '经验蘑菇种子', 20523);
    const activity = seedGoods(3, '森野甜莓种子', 20525);
    // 官方目录顺序是随机的，优先级不能依赖遍历顺序。
    assert.equal(pickSeedGoods([coin, exp, activity]).id, '3');
    assert.equal(pickSeedGoods([coin, activity, exp]).id, '3');
    assert.equal(pickSeedGoods([activity, coin, exp]).id, '3');
});

test('seed purchase falls back to exp seeds when activity seeds are sold out, then to coin seeds', () => {
    const coin = seedGoods(1, '金币果种子', 20522);
    const exp = seedGoods(2, '经验蘑菇种子', 20523);
    const soldOutActivity = seedGoods(3, '森野甜莓种子', 20525, { remaining: 0 });
    assert.equal(pickSeedGoods([coin, exp, soldOutActivity]).id, '2');
    assert.equal(pickSeedGoods([coin]).id, '1');
});

test('seed purchase ignores unavailable, non-seed and stockless goods', () => {
    const activity = seedGoods(3, '森野白桃种子', 40526, { available: false });
    const other = { id: '9', name: '奶茶店装饰', category: 'decor', available: true, remaining: 5, rewards: [{ id: '9001', count: 1 }] };
    const exp = seedGoods(2, '经验蘑菇种子', 20523);
    assert.equal(pickSeedGoods([activity, other, exp]).id, '2');
    assert.equal(pickSeedGoods([other]), null);
    assert.equal(pickSeedGoods([]), null);
});
