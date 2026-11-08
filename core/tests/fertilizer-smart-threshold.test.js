const test = require('node:test');
const assert = require('node:assert/strict');
const {
    pickSmartMatureThreshold,
    SMART_MATURE_RANDOM_CAP_SEC,
} = require('../dist/services/farm/land-analysis');

test('快成熟判定阈值上限封顶 300 秒，最小 1 秒', () => {
    assert.equal(SMART_MATURE_RANDOM_CAP_SEC, 300);
    assert.equal(pickSmartMatureThreshold(300, () => 0), 1);
    assert.equal(pickSmartMatureThreshold(300, () => 0.999999), 300);
    assert.equal(pickSmartMatureThreshold(300, () => 1), 300, 'random 取到 1 也不越界');
    assert.equal(pickSmartMatureThreshold(300, () => -1), 1, '负数随机源按 0 处理');
    assert.equal(pickSmartMatureThreshold(300, () => Number.NaN), 1, 'NaN 随机源按 0 处理');
});

test('配置值作为随机上限，超过 300 时截到 300', () => {
    assert.equal(pickSmartMatureThreshold(60, () => 0.999999), 60);
    assert.equal(pickSmartMatureThreshold(3600, () => 0.999999), 300);
    assert.equal(pickSmartMatureThreshold(0, () => 0.999999), 300, '非法配置回退默认 300');
    assert.equal(pickSmartMatureThreshold(undefined, () => 0.999999), 300);
    assert.equal(pickSmartMatureThreshold(30, () => 0.5), 16);
});

test('每轮取不同阈值：连续采样覆盖多个值且始终落在 [1, 上限]', () => {
    const samples = new Set();
    for (let i = 0; i < 200; i += 1) {
        const value = pickSmartMatureThreshold(300);
        assert.ok(Number.isInteger(value) && value >= 1 && value <= 300, `阈值 ${value} 越界`);
        samples.add(value);
    }
    assert.ok(samples.size > 20, `随机阈值只出现 ${samples.size} 种，疑似固定值`);
});
