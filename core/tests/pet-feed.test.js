const test = require('node:test');
const assert = require('node:assert/strict');

const {
    TARGET_PROTECT_SECONDS,
    planDogFoodFeeds,
    findDogFoodMallGoods,
} = require('../dist/services/pet-feed');

const DAY = 24 * 60 * 60;
const FOOD_1D = { id: 90004, duration: DAY, count: 0 };
const FOOD_3D = { id: 90005, duration: 3 * DAY, count: 0 };
const FOOD_5D = { id: 90006, duration: 5 * DAY, count: 0 };

function foods(spec) {
    return [
        { ...FOOD_1D, count: spec[90004] || 0 },
        { ...FOOD_3D, count: spec[90005] || 0 },
        { ...FOOD_5D, count: spec[90006] || 0 },
    ];
}

function totalDuration(plan) {
    const durationById = { 90004: DAY, 90005: 3 * DAY, 90006: 5 * DAY };
    return plan.feeds.reduce((sum, feed) => sum + durationById[feed.id] * feed.count, 0);
}

test('planDogFoodFeeds returns empty plan when gap is zero', () => {
    const plan = planDogFoodFeeds(0, foods({ 90006: 2 }));
    assert.deepEqual(plan.feeds, []);
    assert.equal(plan.sufficient, true);
});

test('planDogFoodFeeds fills one week with 5d + 3d greedily', () => {
    const plan = planDogFoodFeeds(7 * DAY, foods({ 90006: 1, 90005: 1 }));
    assert.deepEqual(plan.feeds, [
        { id: 90006, count: 1 },
        { id: 90005, count: 1 },
    ]);
    assert.equal(plan.sufficient, true);
    assert.ok(totalDuration(plan) >= 7 * DAY);
});

test('planDogFoodFeeds caps counts at available stock', () => {
    // 缺口 7 天，只有 2 个 5 天粮：ceil(7/5)=2 全部用上，恰好 10 天 ≥ 7 天
    const plan = planDogFoodFeeds(7 * DAY, foods({ 90006: 2 }));
    assert.deepEqual(plan.feeds, [{ id: 90006, count: 2 }]);
    assert.equal(plan.sufficient, true);
});

test('planDogFoodFeeds overshoots with small food when large food is missing', () => {
    // 缺口 7 天，只有 2 个 1 天粮：先用完 2 天，仍缺 5 天 → 走第二轮允许超出
    const plan = planDogFoodFeeds(7 * DAY, foods({ 90004: 2 }));
    assert.deepEqual(plan.feeds, [{ id: 90004, count: 2 }]);
    assert.equal(plan.sufficient, false);
});

test('planDogFoodFeeds uses small food to top up the remainder', () => {
    // 缺口 4 天：一个 5 天粮就够了
    const plan = planDogFoodFeeds(4 * DAY, foods({ 90006: 1 }));
    assert.deepEqual(plan.feeds, [{ id: 90006, count: 1 }]);
    assert.equal(plan.sufficient, true);
});

test('planDogFoodFeeds handles empty stock', () => {
    const plan = planDogFoodFeeds(7 * DAY, foods({}));
    assert.deepEqual(plan.feeds, []);
    assert.equal(plan.sufficient, false);
});

test('TARGET_PROTECT_SECONDS is exactly one week', () => {
    assert.equal(TARGET_PROTECT_SECONDS, 7 * 24 * 60 * 60);
});

test('findDogFoodMallGoods filters by name and availability, sorted by price', () => {
    const goods = [
        { goods_id: 1, name: '化肥礼包', price: { count: 10 } },
        { goods_id: 2, name: '狗粮礼包（含3天狗粮x2）', price: { count: 50 }, is_available: true },
        { goods_id: 3, name: '狗粮礼包（限时）', price: { count: 20 }, is_available: false },
        { goods_id: 4, name: '狗粮礼包（广告）', price: { count: 0 }, ad_only: true },
        { goods_id: 5, name: '狗粮小礼包', price: { count: 30 }, is_available: true },
    ];
    const found = findDogFoodMallGoods(goods);
    assert.deepEqual(found.map(item => item.goods_id), [5, 2]);
});
