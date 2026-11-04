const assert = require('node:assert/strict');
const test = require('node:test');

// 本次开关修复新增/改动的纯逻辑与关键分支回归。
// 覆盖：自家黄金虫地块识别、好友可放黄金虫判定、点券礼包可买数、黄金虫计数、种子优先级覆盖。
const { analyzeLands } = require('../dist/services/farm/land-analysis');
const { analyzeFriendLands } = require('../dist/services/friend/visit-strategy');
const { pickSeedGoods } = require('../dist/services/activity-automation');
const { getCouponGiftPurchase } = require('../dist/services/mall-coupon-gift');
const { getGoldenBugCount } = require('../dist/services/friend/golden-bug');

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

function friendGrowingLand(id, socialItems = [], status = {}) {
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
            social_items: socialItems,
            ...status,
        },
    };
}

// ── golden_bug_clear：自家黄金虫地块单独标注 ──
test('analyzeLands reports golden bug land ids separately from normal cleanup', () => {
    const status = analyzeLands([
        growingLand(1, 301101), // 自家黄金虫
        growingLand(2, 301102), // 足球：属常规清理
        growingLand(3, 0),      // 干净
    ], false, 9001);

    assert.deepEqual(status.goldenBugLandIds, [1]);
    // 301101 / 301102 都是农场主自家可清理的交互物
    assert.deepEqual(status.needInteractionCleanup, [1, 2]);
});

test('analyzeLands goldenBugLandIds is empty when no golden bug present', () => {
    const status = analyzeLands([growingLand(1, 301102), growingLand(2, 0)], false, 9001);
    assert.deepEqual(status.goldenBugLandIds, []);
});

// ── friend_golden_bug：好友地块未放黄金虫才进候选 ──
test('friend land without golden bug is a placement candidate', () => {
    const status = analyzeFriendLands([
        friendGrowingLand(1),
        friendGrowingLand(2, [{ item_id: 301101 }]),
    ], 9002);

    assert.deepEqual(status.canPutGoldenBug, [1]);
    assert.deepEqual(status.needWater, []);
    assert.deepEqual(status.needWeed, []);
    assert.deepEqual(status.needBug, []);
});

test('friend land cannot place golden bug again once already placed', () => {
    const status = analyzeFriendLands([
        friendGrowingLand(1, [{ item_id: 301101 }]),
    ], 9002);
    assert.deepEqual(status.canPutGoldenBug, []);
});

// ── mall_coupon_gift_buy：点券限购礼包可买数计算 ──
test('getCouponGiftPurchase returns buyable count only for point-coupon limited goods', () => {
    const now = Math.floor(Date.now() / 1000);
    const couponGoods = {
        goods_id: 1061,
        name: '点券礼包',
        is_available: 1,
        price: { id: 1002, count: 10 },
        purchase_limit: { limit_count: 5, bought_count: 1 },
    };
    // 余额足够：remaining(4) * 单价(10)=40 <= 200 → 买 4
    assert.equal(getCouponGiftPurchase(couponGoods, 200, now), 4);
    // 余额不足：4*10=40 > 30 → 0
    assert.equal(getCouponGiftPurchase(couponGoods, 30, now), 0);
    // 非点券计价（currency id 不是 1002）→ 0
    assert.equal(getCouponGiftPurchase({ ...couponGoods, price: { id: 1, count: 10 } }, 200, now), 0);
    // 无限购（无 purchase_limit）→ 0
    assert.equal(getCouponGiftPurchase({ ...couponGoods, purchase_limit: null }, 200, now), 0);
    // 已过期 → 0
    assert.equal(getCouponGiftPurchase({ ...couponGoods, discount_end_time: now - 100 }, 200, now), 0);
    // 已售罄（remaining<=0）→ 0
    assert.equal(getCouponGiftPurchase({ ...couponGoods, purchase_limit: { limit_count: 2, bought_count: 2 } }, 200, now), 0);
});

// ── friend_golden_bug：黄金虫计数只累加 301101 ──
test('getGoldenBugCount sums only item 301101', () => {
    const items = [
        { id: 301101, count: 3 },
        { id: 301102, count: 5 },
        { id: 301101, count: 2 },
    ];
    assert.equal(getGoldenBugCount(items), 5);
    assert.equal(getGoldenBugCount([]), 0);
    assert.equal(getGoldenBugCount(null), 0);
    assert.equal(getGoldenBugCount(undefined), 0);
});

// ── milk_tea_seed_policy：偏好档位覆盖默认「活动种子优先」 ──
function seedGoods(id, name, rewardId, extra = {}) {
    return { id: String(id), name, category: 'seed', available: true, remaining: 5, rewards: [{ id: String(rewardId), count: 1 }], costs: [], ...extra };
}

test('pickSeedGoods prefers policy overridden tier over default activity-first', () => {
    const activity = seedGoods(3, '森野甜莓种子', 20525);
    const coin = seedGoods(1, '金币果种子', 20522);

    // 默认顺序：活动种子优先
    assert.equal(pickSeedGoods([coin, activity]).id, '3');
    assert.equal(pickSeedGoods([activity, coin]).id, '3');

    // milk_tea_seed_policy.preferred = coin(2) → 金币种子提到最高优先级
    assert.equal(pickSeedGoods([coin, activity], 2).id, '1');

    // 命中偏好档位的商品即使排在后面也应被选中
    assert.equal(pickSeedGoods([activity, coin], 2).id, '1');
});

test('pickSeedGoods with policy preferred tier falls back when no matching tier', () => {
    const activity = seedGoods(3, '森野甜莓种子', 20525);
    // 偏好 exp(1)，但目录里没有经验种子 → 退回默认活动种子优先
    assert.equal(pickSeedGoods([activity], 1).id, '3');
});
