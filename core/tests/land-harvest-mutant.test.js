const assert = require('node:assert/strict');
const test = require('node:test');

const { buildLandDetail } = require('../dist/services/farm/land-analysis');

// 风信子：exp=720，果实 40112 单价 240、数量 24 → 基础每季 720 经验 / 5760 金币。
const PLANT_ID = 1020112;

function land(mutantIds = [], plantId = PLANT_ID) {
    const now = Math.floor(Date.now() / 1000);
    return {
        id: 7,
        unlocked: true,
        level: 1,
        plant: {
            id: plantId,
            phases: [
                { phase: 2, begin_time: now - 60 },
                { phase: 6, begin_time: now + 3600 },
            ],
            mutant_config_ids: mutantIds,
        },
    };
}

test('无变异：每季收益为基础口径，且不带加成明细', () => {
    const detail = buildLandDetail(land());
    assert.equal(detail.harvestExpPerSeason, 720);
    assert.equal(detail.harvestGoldPerSeason, 5760);
    assert.equal(detail.harvestBonus.countMultiplier, 1);
    assert.equal(detail.harvestBonus.priceMultiplier, 1);
    assert.equal(detail.harvestBonus.details.length, 0);
});

test('数量倍率（4 湿润 2:2）：经验与金币同时翻倍', () => {
    const detail = buildLandDetail(land([4]));
    assert.equal(detail.harvestExpPerSeason, 1440);
    assert.equal(detail.harvestGoldPerSeason, 11520);
    assert.equal(detail.harvestBonus.baseExp, 720);
    assert.equal(detail.harvestBonus.baseGold, 5760);
    assert.equal(detail.harvestBonus.countMultiplier, 2);
    assert.equal(detail.harvestBonus.priceMultiplier, 1);
    assert.deepEqual(detail.harvestBonus.details.map(item => item.label), ['数量×2']);
});

test('售价倍率（1 冰冻 3:3）：只放大金币，经验保持不变', () => {
    const detail = buildLandDetail(land([1]));
    assert.equal(detail.harvestExpPerSeason, 720);
    assert.equal(detail.harvestGoldPerSeason, 17280);
    assert.equal(detail.harvestBonus.priceMultiplier, 3);
    assert.deepEqual(detail.harvestBonus.details.map(item => item.label), ['售价×3']);
});

test('数量与售价倍率叠加：相乘而不是取最大值', () => {
    const detail = buildLandDetail(land([4, 1]));
    assert.equal(detail.harvestExpPerSeason, 1440);
    assert.equal(detail.harvestGoldPerSeason, 34560);
    assert.equal(detail.harvestBonus.countMultiplier, 2);
    assert.equal(detail.harvestBonus.priceMultiplier, 3);
});

test('多个同类变异继续相乘（爱心 3 × 晶辉 4 × 比熊售价 4）', () => {
    const detail = buildLandDetail(land([2, 14, 15]));
    assert.equal(detail.harvestBonus.countMultiplier, 12);
    assert.equal(detail.harvestBonus.priceMultiplier, 4);
    assert.equal(detail.harvestExpPerSeason, 720 * 12);
    assert.equal(detail.harvestGoldPerSeason, 5760 * 12 * 4);
    assert.deepEqual(detail.harvestBonus.details.map(item => item.label), ['数量×3', '数量×4', '售价×4']);
});

test('变身类变异标注产出变化，但不把金豆豆/活动币误算成金币', () => {
    const detail = buildLandDetail(land([5]));
    assert.equal(detail.harvestBonus.transformed, true);
    assert.match(detail.harvestBonus.transformedPlantName, /黄金/);
    assert.deepEqual(detail.harvestBonus.details.map(item => item.label), ['变身·黄金果实']);
    assert.equal(detail.harvestExpPerSeason, 720);
    assert.equal(detail.harvestGoldPerSeason, 5760);
});

test('空地与未解锁地块：收益归零且不产生加成明细', () => {
    const empty = buildLandDetail({ id: 9, unlocked: true, level: 1 });
    assert.equal(empty.harvestExpPerSeason, 0);
    assert.equal(empty.harvestGoldPerSeason, 0);
    assert.equal(empty.harvestBonus, null);

    const locked = buildLandDetail({ id: 10, unlocked: false, level: 0 });
    assert.equal(locked.harvestExpPerSeason, 0);
    assert.equal(locked.harvestGoldPerSeason, 0);
    assert.equal(locked.harvestBonus, null);
});
