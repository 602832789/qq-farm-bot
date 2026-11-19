const assert = require('node:assert/strict');
const test = require('node:test');

const {
    pickSeedGoods,
    milkTeaFertilizerKind,
    pickFertilizerGoods,
    buildOps,
} = require('../dist/services/activity-automation');
const sharedState = require('../dist/models/store/shared-state');

function goods(id, name, rewardId, extra = {}) {
    return {
        id: String(id), name, category: 'seed', available: true, remaining: 5,
        rewards: [{ id: String(rewardId), count: 1 }], costs: [], ...extra,
    };
}

const activitySeed = goods(1, '森野甜莓种子', 20525);
const coinSeed = goods(2, '金币果种子', 20522);
const expSeed = goods(3, '经验蘑菇种子', 20523);
const otherSeed = goods(4, '未分类种子', 29999);

test('购种默认只选活动种子：金币果与经验蘑菇种子要额外开关才纳入', () => {
    const catalog = [coinSeed, expSeed, activitySeed];
    assert.equal(pickSeedGoods(catalog, { allowCoin: false, allowExp: false }).id, '1');

    // 活动种子售罄后，默认不回退到金币果/经验蘑菇。
    const soldOut = { ...activitySeed, remaining: 0 };
    assert.equal(pickSeedGoods([coinSeed, expSeed, soldOut], { allowCoin: false, allowExp: false }), null);
});

test('同时购买金币果/经验蘑菇：分别放行，且仍保持活动种子优先', () => {
    assert.equal(pickSeedGoods([coinSeed, expSeed, activitySeed], { allowCoin: true, allowExp: false }).id, '1');
    assert.equal(pickSeedGoods([coinSeed, expSeed], { allowCoin: true, allowExp: false }).id, '2');
    assert.equal(pickSeedGoods([coinSeed, expSeed], { allowCoin: false, allowExp: true }).id, '3');
    // 两类都放行时沿用既有优先级：经验种子排在金币种子之前。
    assert.equal(pickSeedGoods([coinSeed, expSeed, otherSeed], { allowCoin: true, allowExp: true }).id, '3');
});

test('不传范围参数时保持旧口径（活动 → 经验 → 金币）', () => {
    assert.equal(pickSeedGoods([coinSeed, expSeed]).id, '3');
    assert.equal(pickSeedGoods([coinSeed]).id, '2');
});

test('化肥识别：普通 / 有机按物品 ID 优先，名称兜底，未知商品不误判', () => {
    const normal = goods(10, '化肥(1小时)', 80001);
    const organic = goods(11, '有机化肥(1小时)', 80011);
    assert.equal(milkTeaFertilizerKind(normal), 'normal');
    assert.equal(milkTeaFertilizerKind(organic), 'organic');
    assert.equal(milkTeaFertilizerKind(goods(12, '化肥(4小时)', 80002)), 'normal');
    assert.equal(milkTeaFertilizerKind(goods(13, '有机化肥(8小时)', 80013)), 'organic');
    assert.equal(milkTeaFertilizerKind({ id: '14', name: '普通化肥礼包', rewards: [] }), 'normal');
    assert.equal(milkTeaFertilizerKind({ id: '15', name: '有机化肥礼包', rewards: [] }), 'organic');
    assert.equal(milkTeaFertilizerKind(coinSeed), null);
    assert.equal(milkTeaFertilizerKind(null), null);
    // 目录里的脏数据（奖励字段不是数组）不能让整轮自动化抛错，仍按名称兜底识别。
    assert.equal(milkTeaFertilizerKind({ id: '16', name: '普通化肥', rewards: { id: 80001 } }), 'normal');
    assert.equal(milkTeaFertilizerKind({ id: '17', name: '森野种子', rewards: {} }), null);
});

test('两个化肥选购互不干扰，且跳过售罄/不可兑换商品', () => {
    const normal = goods(10, '化肥(1小时)', 80001);
    const organic = goods(11, '有机化肥(1小时)', 80011);
    const catalog = [coinSeed, normal, organic];
    assert.equal(pickFertilizerGoods(catalog, 'normal').id, '10');
    assert.equal(pickFertilizerGoods(catalog, 'organic').id, '11');
    assert.equal(pickFertilizerGoods([normal], 'organic'), null);
    assert.equal(pickFertilizerGoods([{ ...normal, remaining: 0 }, { ...normal, id: '20' }], 'normal').id, '20');
    assert.equal(pickFertilizerGoods([{ ...normal, available: false }], 'normal'), null);
    // 目录中混有形状异常的商品时仍能选出目标化肥。
    assert.equal(pickFertilizerGoods([{ id: '99', name: '坏数据', rewards: {} }, organic], 'organic').id, '11');
});

test('四个新键登记进默认配置，且全部默认关闭', () => {
    const automation = sharedState.DEFAULT_ACCOUNT_CONFIG.automation;
    for (const key of [
        'milk_tea_seed_buy_coin',
        'milk_tea_seed_buy_exp',
        'milk_tea_fertilizer_buy_normal',
        'milk_tea_fertilizer_buy_organic',
    ]) {
        assert.equal(automation[key], false, `${key} 应默认关闭`);
    }
});

test('化肥是独立操作；金币果/经验蘑菇只是购种范围，不是独立调度动作', () => {
    const keys = buildOps().map(op => op.key);
    assert.ok(keys.includes('milk_tea_fertilizer_buy_normal'));
    assert.ok(keys.includes('milk_tea_fertilizer_buy_organic'));
    assert.ok(keys.includes('milk_tea_seed_buy'));
    assert.ok(!keys.includes('milk_tea_seed_buy_coin'));
    assert.ok(!keys.includes('milk_tea_seed_buy_exp'));
    const fertilizerOps = buildOps().filter(op => op.key.startsWith('milk_tea_fertilizer_buy_'));
    assert.equal(fertilizerOps.length, 2);
});
