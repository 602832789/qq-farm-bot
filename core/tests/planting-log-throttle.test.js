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

test('checkStateChange：状态不变时永不周期性重新播报', () => {
    const throttle = createPlantingLogThrottle(60_000);
    assert.deepEqual(throttle.checkStateChange('round', 'A', 0), { emit: true, suppressed: 0 });
    for (let i = 1; i <= 20; i++) {
        const at = i * 10 * 60_000; // 累计 200 分钟，远超 5 分钟窗口
        assert.deepEqual(throttle.checkStateChange('round', 'A', at), { emit: false, suppressed: i });
    }
    assert.deepEqual(throttle.checkStateChange('round', 'B', 201 * 60_000), { emit: true, suppressed: 0 }, '状态变化立即放行');
    assert.deepEqual(throttle.checkStateChange('round', 'A', 202 * 60_000), { emit: true, suppressed: 0 }, '切回旧状态也算变化');
});

test('check 仍保留 5 分钟窗口播报，checkStateChange 与 check 共用同一份状态', () => {
    const throttle = createPlantingLogThrottle(60_000);
    assert.equal(throttle.checkStateChange('k', 's', 0).emit, true);
    assert.equal(throttle.check('k', 's', 61_000).emit, true, 'check 到期仍放行');
    assert.equal(throttle.checkStateChange('k', 's', 122_000).emit, false, '状态没变就不再放行');
    throttle.reset();
    assert.equal(throttle.checkStateChange('k', 's', 123_000).emit, true);
});

test('种植引擎的三类刷屏日志都接入整轮合并（反向验证：不再各自输出）', () => {
    const planting = readFileSync(path.join(__dirname, '../src/services/farm/planting.ts'), 'utf8');
    assert.match(planting, /logPlantingThrottled\('bag_priority_order', orderedSeeds/);
    assert.match(planting, /logPlantingThrottled\(`layout_check:\$\{seed\.seedId\}`/);
    assert.match(planting, /logPlantingThrottled\(`reserve_future_layout:\$\{seed\.seedId\}`/);
    assert.match(planting, /logPlantingThrottled\(`skip_no_layout:\$\{seed\.seedId\}`/);
    assert.doesNotMatch(planting, /log\('种植', `背包种子执行顺序/);
    assert.doesNotMatch(planting, /log\('种植', `背包种子 \$\{seed\.name\}\(\$\{seed\.seedId\}\) size=/);
    assert.match(planting, /suppressedSuffix\(decision\.suppressed\)/);
    // 整轮合并：入口开启缓冲、收尾用状态变化判定、finally 保证提前 return 也收尾
    assert.match(planting, /if \(!nested\) plantingRound = \[\]/);
    assert.match(planting, /try \{\s*const result = await runPlantFromBagSeeds\(/);
    assert.match(planting, /finally \{\s*if \(!nested\) flushPlantingRound\(\);/);
    // 整轮状态闸门：土地状态没变时复用上一轮结论，不读背包也不发种植请求。
    assert.match(planting, /plantingRoundGate\.cached\(roundSignature\)/);
    assert.match(planting, /reservationWindow\.hasExpiredWindow\(/);
    assert.match(planting, /checkStateChange\('bag_planting_round', signature\)/);
    assert.match(planting, /shown\.join\('；'\)/, '一轮的多条诊断合成一条正文');
    assert.match(planting, /if \(plantingRound\) \{\s*plantingRound\.push/, '巡查内只入队、不单独输出');
});
