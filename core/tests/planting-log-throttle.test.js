const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const {
    PLANTING_LOG_THROTTLE_WINDOW_MS,
    createPlantingLogThrottle,
    suppressedSuffix,
} = require('../dist/services/farm/planting-log-throttle');

test('默认节流窗口为 5 分钟', () => {
    assert.equal(PLANTING_LOG_THROTTLE_WINDOW_MS, 5 * 60 * 1000);
});

test('同一状态在窗口内只放行一次，重复次数累加', () => {
    const throttle = createPlantingLogThrottle(60_000);
    assert.deepEqual(throttle.check('bag_order', 'A(1)x1 -> B(2)x2', 1_000), { emit: true, suppressed: 0 });
    assert.deepEqual(throttle.check('bag_order', 'A(1)x1 -> B(2)x2', 2_000), { emit: false, suppressed: 1 });
    assert.deepEqual(throttle.check('bag_order', 'A(1)x1 -> B(2)x2', 3_000), { emit: false, suppressed: 2 });
});

test('超过窗口后放行，并带出被合并的重复次数', () => {
    const throttle = createPlantingLogThrottle(60_000);
    throttle.check('k', 's', 0);
    throttle.check('k', 's', 1_000);
    throttle.check('k', 's', 2_000);
    assert.deepEqual(throttle.check('k', 's', 61_000), { emit: true, suppressed: 2 });
    assert.deepEqual(throttle.check('k', 's', 62_000), { emit: false, suppressed: 1 });
});

test('状态签名变化立即放行，旧状态的计数不会串过来', () => {
    const throttle = createPlantingLogThrottle(60_000);
    throttle.check('layout_check:1', '2|1|3|3|0|0', 0);
    throttle.check('layout_check:1', '2|1|3|3|0|0', 1_000);
    assert.deepEqual(throttle.check('layout_check:1', '2|1|2|2|1|1', 2_000), { emit: true, suppressed: 0 });
});

test('不同 key 互不干扰，reset 清空状态', () => {
    const throttle = createPlantingLogThrottle(60_000);
    throttle.check('a', 's', 0);
    assert.deepEqual(throttle.check('b', 's', 1), { emit: true, suppressed: 0 });
    assert.equal(throttle.check('a', 's', 1).emit, false);
    throttle.reset();
    assert.deepEqual(throttle.check('a', 's', 2), { emit: true, suppressed: 0 });
});

test('非法时间与非法窗口参数都有兜底，不抛异常', () => {
    const throttle = createPlantingLogThrottle(0);
    assert.deepEqual(throttle.check('k', 's', Number.NaN), { emit: true, suppressed: 0 });
    assert.equal(throttle.check('k', 's', 1_000).emit, false);
});

test('合并次数只在大于 0 时追加文案', () => {
    assert.equal(suppressedSuffix(0), '');
    assert.equal(suppressedSuffix(-1), '');
    assert.match(suppressedSuffix(3), /重复 3 次/);
    assert.match(suppressedSuffix(3), /已合并/);
});

test('种植引擎的三类刷屏日志都接入节流（反向验证：不再直接 log）', () => {
    const planting = readFileSync(path.join(__dirname, '../src/services/farm/planting.ts'), 'utf8');
    assert.match(planting, /logPlantingThrottled\('bag_priority_order', orderedSeeds/);
    assert.match(planting, /logPlantingThrottled\(`layout_check:\$\{seed\.seedId\}`/);
    assert.match(planting, /logPlantingThrottled\(`reserve_future_layout:\$\{seed\.seedId\}`/);
    assert.match(planting, /logPlantingThrottled\(`skip_no_layout:\$\{seed\.seedId\}`/);
    assert.doesNotMatch(planting, /log\('种植', `背包种子执行顺序/);
    assert.doesNotMatch(planting, /log\('种植', `背包种子 \$\{seed\.name\}\(\$\{seed\.seedId\}\) size=/);
    assert.match(planting, /suppressedSuffix\(decision\.suppressed\)/);
});
