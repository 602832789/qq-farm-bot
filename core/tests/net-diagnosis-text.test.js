const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    EMPTY_LIST_TEXT,
    describeBudgetReasonZh,
    describeFlowModeZh,
    formatDurationZh,
    formatGatewayCounts,
    formatInflightSegment,
    formatPendingItem,
    formatQueuedItem,
    joinListZh,
    formatRequestPressureZh,
} = require('../dist/utils/net-diagnosis-text');

const read = file => readFileSync(path.join(__dirname, file), 'utf8');

test('耗时统一换成中文单位，不再输出浮点毫秒尾巴', () => {
    assert.equal(formatDurationZh(0), '0 毫秒');
    // 现场日志里的原值：`GetIllustratedListV2#513:12.327675000065938ms`
    assert.equal(formatDurationZh(12.327675000065938), '12 毫秒');
    assert.equal(formatDurationZh(850), '850 毫秒');
    assert.equal(formatDurationZh(3276), '3.3 秒');
    assert.equal(formatDurationZh(12327), '12 秒');
    assert.equal(formatDurationZh(65000), '1 分 5 秒');
    assert.equal(formatDurationZh(120000), '2 分钟');
    // 脏数据不该让日志崩掉
    assert.equal(formatDurationZh(-5), '0 毫秒');
    assert.equal(formatDurationZh(Number.NaN), '0 毫秒');
    assert.equal(formatDurationZh(undefined), '0 毫秒');
});

test('压力行整句中文：不再出现 pending= / queued= / active=', () => {
    const line = formatRequestPressureZh({
        pending: 3,
        queued: 1,
        active: 'GetIllustratedListV2#513（12 毫秒）、AllLands#515（1.1 毫秒）',
        queuedMethods: 'Bag（前台）',
    });
    assert.equal(
        line,
        '网关请求压力：等待回包 3 个、排队 1 个；回包中：GetIllustratedListV2#513（12 毫秒）、AllLands#515（1.1 毫秒）；排队中：Bag（前台）',
    );
    for (const english of ['pending=', 'queued=', 'active=', 'queuedMethods=', 'Gateway'])
        assert.ok(!line.includes(english), `压力行不应出现英文键名 ${english}`);
});

test('压力行按计数裁剪分段，不写「回包中：无」', () => {
    assert.equal(
        formatRequestPressureZh({ pending: 0, queued: 2, active: EMPTY_LIST_TEXT, queuedMethods: 'Bag（前台）' }),
        '网关请求压力：等待回包 0 个、排队 2 个；排队中：Bag（前台）',
    );
    assert.equal(
        formatRequestPressureZh({ pending: 1, queued: 0, active: 'AllLands#1（2 秒）' }),
        '网关请求压力：等待回包 1 个、排队 0 个；回包中：AllLands#1（2 秒）',
    );
    assert.equal(
        formatRequestPressureZh({ pending: 0, queued: 0, active: EMPTY_LIST_TEXT }),
        '网关请求压力：队列空闲',
    );
});

test('在途 / 排队列表项保留方法名与序号，只把耗时和班次换成中文', () => {
    assert.equal(formatPendingItem('AllLands', 515, 1099.81), 'AllLands#515（1.1 秒）');
    assert.equal(formatPendingItem('Bag', null, 800), 'Bag（800 毫秒）');
    assert.equal(formatPendingItem('', 7, 0), '未知请求#7（0 毫秒）');
    assert.equal(formatQueuedItem('Bag', '前台'), 'Bag（前台）');
    assert.equal(formatQueuedItem('Bag', ''), 'Bag');
    assert.equal(joinListZh(['A', 'B']), 'A、B');
    assert.equal(joinListZh([]), EMPTY_LIST_TEXT);
    assert.equal(formatGatewayCounts(0, 0), '队列空闲');
    assert.equal(formatGatewayCounts(3, 1), '等待回包 3 个、排队 1 个');
    assert.equal(formatInflightSegment(EMPTY_LIST_TEXT, 3), '');
    assert.equal(formatInflightSegment('AllLands#1（1 秒）', 1), '；回包中：AllLands#1（1 秒）');
});

test('额度让路的原因与模式翻成人话，没收录的新枚举原样保留', () => {
    assert.equal(describeBudgetReasonZh('budget_total'), '总量额度用尽');
    assert.equal(describeBudgetReasonZh('budget_method'), '单方法额度用尽');
    assert.equal(describeBudgetReasonZh('foreground'), '前台请求不限额');
    assert.equal(describeBudgetReasonZh('critical'), '心跳/ACE 不限额');
    // 后端以后新增原因时不能让日志变成「未知」
    assert.equal(describeBudgetReasonZh('budget_new_rule'), 'budget_new_rule');
    assert.equal(describeBudgetReasonZh(''), '未知');
    assert.equal(describeFlowModeZh('healthy'), '连接正常');
    assert.equal(describeFlowModeZh('cautious'), '连接受限（降速）');
    assert.equal(describeFlowModeZh('stall'), '连接无响应');
    assert.equal(describeFlowModeZh('future_mode'), 'future_mode');
});

test('network / worker 的诊断日志都走中文文案，分类关键字保持可识别', () => {
    const network = read('../src/utils/network.ts');
    assert.doesNotMatch(network, /Gateway 请求压力/);
    assert.doesNotMatch(network, /pending=\$\{/);
    assert.doesNotMatch(network, /queued=\$\{/);
    assert.doesNotMatch(network, /active=\$\{/);
    assert.doesNotMatch(network, /stage=\$\{stage\}/);
    assert.match(network, /formatRequestPressureZh\(/);
    // 超时的两种阶段都要用中文说清楚
    assert.match(network, /尚未排到连接/);
    assert.match(network, /已发往网关但未回包/);
    // 这些中文前缀被 utils.ts / error-handler / low-priority-gate 用来做分类，不能翻译掉
    assert.match(network, /请求等待队列已满/);
    assert.match(network, /连接未打开/);
    assert.match(network, /账号尚未登录/);
    assert.match(network, /自动任务请求已达流量上限/);
    assert.match(network, /后台请求已让路/);
    // 额度原因 / 模式也要翻成人话，不能再把 budget_total 这类枚举直接扔到面板上
    assert.doesNotMatch(network, /原因=\$\{budget\.reason\}/);
    assert.match(network, /原因=\$\{describeBudgetReasonZh\(budget\.reason\)\}/);
    assert.match(network, /模式=\$\{describeFlowModeZh\(budget\.mode\)\}/);

    const worker = read('../src/core/worker.ts');
    assert.doesNotMatch(worker, /pending=\$\{/);
    assert.doesNotMatch(worker, /queued=\$\{/);
    assert.match(worker, /formatDurationZh\(oldest\)/);

    const gate = read('../src/utils/low-priority-gate.ts');
    assert.match(gate, /message\.includes\('尚未排到连接'\)/);
});
