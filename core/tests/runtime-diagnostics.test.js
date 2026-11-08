const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createRuntimeDiagnostics,
    computePercentile,
    readProcessMetrics,
    formatClock,
} = require('../dist/services/runtime-diagnostics');

const MB = 1024 * 1024;
const T0 = 1_800_000_000_000;

function fixture(patch = {}) {
    let t = T0;
    let mono = 0;
    let cpuCalls = 0;
    const d = createRuntimeDiagnostics({
        now: () => t,
        monotonic: () => mono,
        cpuUsage: () => ({ user: cpuCalls++ * 100_000, system: 0 }),
        memoryUsage: () => ({ heapUsed: 29 * MB, heapTotal: 40 * MB, rss: 80 * MB, external: 2 * MB, arrayBuffers: 1 * MB }),
        schedulerSnapshot: () => ({ schedulers: [] }),
        cpuCount: 1,
        ...patch,
    });
    return {
        d,
        now: () => t,
        advance: (ms) => { t += ms; mono += ms; },
    };
}

test('computePercentile 覆盖空数组、P50 与 P99 尾部', () => {
    assert.equal(computePercentile([], 99), 0);
    assert.equal(computePercentile([5, 1, 3], 50), 3);
    assert.equal(computePercentile(Array.from({ length: 100 }, (_, i) => i + 1), 99), 99);
    assert.equal(computePercentile([-2, Number.NaN, 7], 99), 7);
});

test('readProcessMetrics 统一换算为 MB 并带进程信息', () => {
    const m = readProcessMetrics({ heapUsed: 29 * MB, heapTotal: 40 * MB, rss: 80 * MB, external: 2 * MB, arrayBuffers: 1 * MB });
    assert.equal(m.heapUsedMb, 29);
    assert.equal(m.heapTotalMb, 40);
    assert.equal(m.rssMb, 80);
    assert.equal(m.externalMb, 2);
    assert.equal(m.arrayBuffersMb, 1);
    assert.equal(typeof m.pid, 'number');
    assert.equal(typeof m.uptimeSec, 'number');
});

test('formatClock 输出 HH:mm:ss', () => {
    assert.match(formatClock(T0), /^\d{2}:\d{2}:\d{2}$/);
});

test('初始快照结构完整，状态为队列空闲', () => {
    const { d } = fixture();
    const snap = d.getSnapshot();
    assert.equal(snap.windowMs, 600_000);
    assert.equal(snap.queue.capacity, 256);
    assert.equal(snap.queue.current, 0);
    assert.deepEqual(snap.status, { key: 'idle', label: '队列空闲', tone: 'ok' });
    assert.equal(snap.cpu.label, '进程合计');
    assert.equal(snap.cpu.cores, 1);
    assert.equal(snap.heap.unit, 'MB');
    assert.equal(snap.loop.thresholdMs, 50);
    assert.deepEqual(snap.heap.series, []);
    assert.deepEqual(snap.loop.series, []);
    assert.ok(snap.more.sampleCount === 0);
    assert.match(snap.updatedAt, /^\d{2}:\d{2}:\d{2}$/);
});

test('同步/异步任务埋点分别记录完成与失败', async () => {
    const { d } = fixture();
    assert.equal(d.trackTask(() => 42), 42);
    await d.trackTask(async () => 7);
    await assert.rejects(() => d.trackTask(async () => { throw new Error('boom'); }), /boom/);
    const snap = d.getSnapshot();
    assert.equal(snap.queue.completed10m, 2);
    assert.equal(snap.queue.failed10m, 1);
    assert.equal(snap.queue.running, 0);
    assert.equal(snap.status.key, 'attention');
});

test('未埋点时不会虚报完成数（反向验证）', () => {
    const { d } = fixture();
    d.sample();
    assert.equal(d.getSnapshot().queue.completed10m, 0);
});

test('排队超过 5 秒记为排队超时，状态变为积压', () => {
    const { d, advance } = fixture();
    d.recordTaskQueued('slow_task');
    advance(6000);
    d.sample();
    const snap = d.getSnapshot();
    assert.equal(snap.queue.timeout10m, 1);
    assert.equal(snap.queue.current, 0);
    assert.equal(snap.status.key, 'backlog');
});

test('10 分钟窗口外的事件与采样会被裁剪', () => {
    const { d, advance } = fixture();
    d.trackTask(() => 1);
    d.recordLoopLag(12);
    d.sample();
    assert.equal(d.getSnapshot().queue.completed10m, 1);
    advance(11 * 60 * 1000);
    d.sample();
    const snap = d.getSnapshot();
    assert.equal(snap.queue.completed10m, 0);
    assert.equal(snap.loop.p99Ms, 0);
    assert.equal(snap.more.sampleCount, 1);
});

test('CPU 区间平均按进程合计换算，峰值取窗口内最大值', () => {
    const { d, advance } = fixture();
    d.sample();
    advance(1000);
    const second = d.sample();
    assert.equal(second.cpuPct, 10);
    const snap = d.getSnapshot();
    assert.equal(snap.cpu.avgPct, 5);
    assert.equal(snap.cpu.peakPct, 10);
});

test('事件循环 P99 取区间读数并记录趋势与峰值', () => {
    const { d, advance } = fixture();
    for (let i = 1; i <= 100; i++) d.recordLoopLag(i);
    const s = d.sample();
    assert.equal(s.loopP99Ms, 99);
    advance(1000);
    d.recordLoopLag(3);
    d.sample();
    const snap = d.getSnapshot();
    assert.equal(snap.loop.p99Ms, 3);
    assert.equal(snap.loop.peakMs, 99);
    assert.deepEqual(snap.loop.series, [99, 3]);
});

test('堆内存与队列峰值、趋势序列随采样更新', () => {
    let heap = 20 * MB;
    const { d, advance } = fixture({ memoryUsage: () => ({ heapUsed: heap }) });
    d.sample();
    heap = 35 * MB;
    advance(1000);
    d.sample();
    const snap = d.getSnapshot();
    assert.equal(snap.heap.currentMb, 35);
    assert.equal(snap.heap.peakMb, 35);
    assert.deepEqual(snap.heap.series, [20, 35]);
    assert.equal(snap.more.sampleCount, 2);
});

test('到期未执行的定时任务计入当前排队，状态切换为运行中/积压', () => {
    const due = (count) => ({
        schedulers: [{
            tasks: Array.from({ length: count }, (_, i) => ({
                name: `t${i}`,
                running: false,
                nextRunAt: T0 - 2000,
            })),
        }],
    });
    const { d: busy } = fixture({ schedulerSnapshot: () => due(2), now: () => T0 });
    assert.equal(busy.getSnapshot().queue.current, 2);
    assert.equal(busy.getSnapshot().status.key, 'busy');
    const { d: backlog } = fixture({ schedulerSnapshot: () => due(70), now: () => T0 });
    assert.equal(backlog.getSnapshot().status.key, 'backlog');
});

test('status 在失败/高 P99 时需要关注，正常空闲恢复队列空闲', () => {
    const { d, advance } = fixture();
    d.recordLoopLag(120);
    d.sample();
    assert.equal(d.getSnapshot().status.key, 'attention');
    advance(11 * 60 * 1000);
    d.sample();
    assert.equal(d.getSnapshot().status.key, 'idle');
});

test('start 幂等且 stop 后不再持有采样定时器', () => {
    const { d } = fixture({ sampleIntervalMs: 60_000, loopProbeIntervalMs: 60_000 });
    assert.equal(d.isRunning(), false);
    d.start();
    d.start();
    assert.equal(d.isRunning(), true);
    d.stop();
    assert.equal(d.isRunning(), false);
});

test('getSnapshot 可携带账号 Worker 读数', () => {
    const { d } = fixture();
    const snap = d.getSnapshot({ accountWorker: { heapUsedMb: 42.5 } });
    assert.deepEqual(snap.more.accountWorker, { heapUsedMb: 42.5 });
});
