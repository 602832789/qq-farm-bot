export {};

/**
 * 首页「运行诊断」数据源。
 *
 * 采集主进程 CPU 区间平均、堆内存趋势、事件循环 P99、调度器队列积压，
 * 以及近 10 分钟任务完成 / 失败 / 排队超时统计。所有指标都来自真实进程数据，
 * 不依赖外部监控服务；采样器只在 admin server 启动时开启，测试可注入时钟与读数。
 */
const os = require('node:os');
const { performance } = require('node:perf_hooks');

const MB = 1024 * 1024;
const WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_QUEUE_CAPACITY = 256;
const SAMPLE_INTERVAL_MS = 2000;
const LOOP_PROBE_INTERVAL_MS = 200;
const LOOP_ALERT_MS = 50;
const QUEUE_TIMEOUT_MS = 5000;
const SERIES_LIMIT = 60;
const SAMPLE_LIMIT = 600;
const LOOP_LAG_LIMIT = 2000;

interface CpuUsageSample {
    user: number;
    system: number;
}

interface DiagnosticsOptions {
    now?: () => number;
    monotonic?: () => number;
    cpuUsage?: () => CpuUsageSample;
    memoryUsage?: () => any;
    schedulerSnapshot?: () => any;
    cpuCount?: number;
    queueCapacity?: number;
    windowMs?: number;
    sampleIntervalMs?: number;
    loopProbeIntervalMs?: number;
    queueTimeoutMs?: number;
}

interface DiagnosticsSample {
    t: number;
    cpuPct: number;
    heapMb: number;
    loopP99Ms: number;
    queueDepth: number;
}

interface TaskEvent {
    t: number;
    type: 'completed' | 'failed' | 'timeout';
}

function toFinite(value: any, fallback = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function round(value: number, digits = 1): number {
    const scale = 10 ** digits;
    return Math.round(toFinite(value) * scale) / scale;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function maxOf(values: number[], fallback = 0): number {
    let max = fallback;
    for (const value of values) {
        if (Number.isFinite(value) && value > max) max = value;
    }
    return max;
}

/** 已排序/未排序均可用；空数组返回 0。用于事件循环延迟 P99。 */
function computePercentile(values: number[], percentile: number): number {
    const list = (values || []).filter(v => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
    if (!list.length) return 0;
    const rank = clamp(percentile, 0, 100) / 100;
    const index = Math.min(list.length - 1, Math.max(0, Math.ceil(rank * list.length) - 1));
    return list[index];
}

function formatClock(timestamp: number): string {
    const d = new Date(timestamp);
    const pad = (v: number) => String(v).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 轻量进程读数：主进程与账号 Worker 共用，供「账号堆内存」等指标使用。 */
function readProcessMetrics(source?: any): any {
    let mem: any = source;
    if (!mem) {
        try {
            mem = process.memoryUsage();
        } catch {
            mem = {};
        }
    }
    return {
        pid: typeof process !== 'undefined' ? process.pid : 0,
        heapUsedMb: round(toFinite(mem.heapUsed) / MB),
        heapTotalMb: round(toFinite(mem.heapTotal) / MB),
        rssMb: round(toFinite(mem.rss) / MB),
        externalMb: round(toFinite(mem.external) / MB),
        arrayBuffersMb: round(toFinite(mem.arrayBuffers) / MB),
        uptimeSec: Math.max(0, Math.round(typeof process !== 'undefined' ? process.uptime() : 0)),
        cpuCount: (() => {
            try { return os.cpus().length || 1; } catch { return 1; }
        })(),
    };
}

function resolveCpuCount(injected?: number): number {
    const explicit = Math.floor(toFinite(injected));
    if (explicit > 0) return explicit;
    try { return Math.max(1, os.cpus().length || 1); } catch { return 1; }
}

function createRuntimeDiagnostics(options: DiagnosticsOptions = {}) {
    const now = options.now || (() => Date.now());
    const monotonic = options.monotonic || (() => performance.now());
    const readCpu = options.cpuUsage || (() => process.cpuUsage() as CpuUsageSample);
    const readMemory = options.memoryUsage || (() => process.memoryUsage());
    const readSchedulers = options.schedulerSnapshot || (() => {
        try { return require('./scheduler').getSchedulerRegistrySnapshot(); } catch { return null; }
    });
    const cores = resolveCpuCount(options.cpuCount);
    const capacity = Math.max(1, Math.floor(toFinite(options.queueCapacity, DEFAULT_QUEUE_CAPACITY)));
    const windowMs = Math.max(1000, Math.floor(toFinite(options.windowMs, WINDOW_MS)));
    const sampleIntervalMs = Math.max(200, Math.floor(toFinite(options.sampleIntervalMs, SAMPLE_INTERVAL_MS)));
    const loopProbeIntervalMs = Math.max(20, Math.floor(toFinite(options.loopProbeIntervalMs, LOOP_PROBE_INTERVAL_MS)));
    const queueTimeoutMs = Math.max(100, Math.floor(toFinite(options.queueTimeoutMs, QUEUE_TIMEOUT_MS)));

    let samples: DiagnosticsSample[] = [];
    let events: TaskEvent[] = [];
    let pending = new Map<string, { t: number; name: string }>();
    let running = 0;
    let loopLags: number[] = [];
    let lastCpu: { usage: CpuUsageSample; mono: number } | null = null;
    let sampleTimer: any = null;
    let probeTimer: any = null;
    let taskSeq = 0;
    const startedAt = now();

    function safeCpu(): CpuUsageSample {
        try {
            const usage = readCpu() || ({} as CpuUsageSample);
            return { user: toFinite(usage.user), system: toFinite(usage.system) };
        } catch {
            return { user: 0, system: 0 };
        }
    }

    function safeMemory(): any {
        try { return readMemory() || {}; } catch { return {}; }
    }

    function pushEvent(type: TaskEvent['type'], t = now()): void {
        events.push({ t, type });
        if (events.length > 4000) events = events.slice(-4000);
    }

    /** 到期超过 1 秒仍未执行的定时任务算作排队；加上外部埋点登记的等待数。 */
    function currentQueueDepth(): number {
        let due = 0;
        try {
            const snapshot = readSchedulers();
            const t = now();
            for (const scheduler of (snapshot?.schedulers || [])) {
                for (const task of (scheduler?.tasks || [])) {
                    const nextRunAt = toFinite(task?.nextRunAt);
                    if (!task?.running && nextRunAt > 0 && t - nextRunAt >= 1000) due += 1;
                }
            }
        } catch {
            due = 0;
        }
        return Math.max(0, pending.size + due);
    }

    function expirePending(t = now()): void {
        for (const [token, item] of pending) {
            if (t - item.t >= queueTimeoutMs) {
                pending.delete(token);
                pushEvent('timeout', t);
            }
        }
    }

    function prune(t = now()): void {
        const cutoff = t - windowMs;
        while (samples.length && samples[0].t < cutoff) samples.shift();
        while (events.length && events[0].t < cutoff) events.shift();
    }

    function recordTaskQueued(name = 'task'): string {
        const token = `t${++taskSeq}`;
        pending.set(token, { t: now(), name: String(name || 'task') });
        if (pending.size > 2000) {
            const oldest = pending.keys().next().value;
            if (oldest) pending.delete(oldest);
        }
        return token;
    }

    function recordTaskStarted(token: string): void {
        if (!token) return;
        pending.delete(token);
        running += 1;
    }

    function recordTaskFinished(token: string, ok = true): void {
        if (!token) return;
        running = Math.max(0, running - 1);
        pushEvent(ok ? 'completed' : 'failed');
    }

    function recordTaskTimeout(token?: string): void {
        if (token) {
            pending.delete(token);
            running = Math.max(0, running - 1);
        }
        pushEvent('timeout');
    }

    /** 同步函数保持同步返回，异步函数用 then 记录成功/失败，不改变调度器行为。 */
    function trackTask<T>(taskFn: () => Promise<T> | T, name = 'task'): Promise<T> | T {
        const token = recordTaskQueued(name);
        recordTaskStarted(token);
        let result: Promise<T> | T;
        try {
            result = taskFn();
        } catch (e) {
            recordTaskFinished(token, false);
            throw e;
        }
        if (result && typeof (result as any).then === 'function') {
            return Promise.resolve(result).then(
                (value) => { recordTaskFinished(token, true); return value; },
                (error) => { recordTaskFinished(token, false); throw error; },
            );
        }
        recordTaskFinished(token, true);
        return result;
    }

    /** 事件循环延迟探针由外部注入或内部定时器写入；单位毫秒。 */
    function recordLoopLag(lagMs: number): void {
        const value = toFinite(lagMs);
        if (!Number.isFinite(value) || value < 0) return;
        loopLags.push(value);
        if (loopLags.length > LOOP_LAG_LIMIT) loopLags.splice(0, loopLags.length - LOOP_LAG_LIMIT);
    }

    function sample(): DiagnosticsSample {
        const t = now();
        prune(t);
        expirePending(t);

        const mono = monotonic();
        const usage = safeCpu();
        let cpuPct = 0;
        if (lastCpu && mono > lastCpu.mono) {
            const deltaCpu = Math.max(0, (usage.user - lastCpu.usage.user) + (usage.system - lastCpu.usage.system));
            const deltaWallMs = Math.max(1, mono - lastCpu.mono);
            cpuPct = clamp((deltaCpu / (deltaWallMs * 1000 * cores)) * 100, 0, 100);
        }
        lastCpu = { usage, mono };

        const mem = safeMemory();
        const loopP99Ms = round(computePercentile(loopLags, 99));
        loopLags = [];
        const entry: DiagnosticsSample = {
            t,
            cpuPct: round(cpuPct),
            heapMb: round(toFinite(mem.heapUsed) / MB),
            loopP99Ms,
            queueDepth: currentQueueDepth(),
        };
        samples.push(entry);
        if (samples.length > SAMPLE_LIMIT) samples = samples.slice(-SAMPLE_LIMIT);
        return entry;
    }

    function schedulerStats(): any {
        try {
            const snapshot = readSchedulers();
            const schedulers = snapshot?.schedulers || [];
            let taskCount = 0;
            let runningTasks = 0;
            for (const scheduler of schedulers) {
                for (const task of (scheduler?.tasks || [])) {
                    taskCount += 1;
                    if (task?.running) runningTasks += 1;
                }
            }
            return { namespaces: schedulers.length, taskCount, runningTasks };
        } catch {
            return { namespaces: 0, taskCount: 0, runningTasks: 0 };
        }
    }

    function resolveStatus(input: any): any {
        const { current, capacity: cap, runningTasks, failed, timeout, loopP99 } = input;
        if (current >= Math.max(8, Math.floor(cap * 0.25)) || timeout > 0) {
            return { key: 'backlog', label: '队列积压', tone: 'danger' };
        }
        if (failed > 0 || loopP99 > LOOP_ALERT_MS) {
            return { key: 'attention', label: '需要关注', tone: 'warn' };
        }
        if (current > 0 || runningTasks > 0) {
            return { key: 'busy', label: '运行中', tone: 'ok' };
        }
        return { key: 'idle', label: '队列空闲', tone: 'ok' };
    }

    function getSnapshot(extra: any = {}): any {
        const t = now();
        prune(t);
        const latest = samples.length ? samples[samples.length - 1] : null;
        const cpuValues = samples.map(s => s.cpuPct);
        const avgCpu = cpuValues.length
            ? round(cpuValues.reduce((sum, v) => sum + v, 0) / cpuValues.length)
            : 0;
        const heapSeries = samples.slice(-SERIES_LIMIT).map(s => s.heapMb);
        const loopSeries = samples.slice(-SERIES_LIMIT).map(s => s.loopP99Ms);
        const completed = events.filter(e => e.type === 'completed').length;
        const failed = events.filter(e => e.type === 'failed').length;
        const timeout = events.filter(e => e.type === 'timeout').length;
        const current = currentQueueDepth();
        const queuePeak = Math.max(maxOf(samples.map(s => s.queueDepth)), current);
        const loopP99 = latest ? latest.loopP99Ms : 0;
        const scheduler = schedulerStats();
        const heapMb = latest ? latest.heapMb : round(toFinite(safeMemory().heapUsed) / MB);
        const metrics = readProcessMetrics(safeMemory());

        return {
            generatedAt: t,
            updatedAt: formatClock(latest ? latest.t : t),
            windowMs,
            status: resolveStatus({
                current,
                capacity,
                runningTasks: running + scheduler.runningTasks,
                failed,
                timeout,
                loopP99,
            }),
            queue: {
                current,
                capacity,
                running: running + scheduler.runningTasks,
                peak10m: queuePeak,
                completed10m: completed,
                failed10m: failed,
                timeout10m: timeout,
            },
            cpu: {
                avgPct: avgCpu,
                peakPct: round(maxOf(cpuValues)),
                cores,
                label: '进程合计',
            },
            heap: {
                currentMb: heapMb,
                peakMb: round(maxOf(samples.map(s => s.heapMb), heapMb)),
                series: heapSeries,
                unit: 'MB',
            },
            loop: {
                p99Ms: loopP99,
                peakMs: round(maxOf(samples.map(s => s.loopP99Ms))),
                thresholdMs: LOOP_ALERT_MS,
                series: loopSeries,
            },
            more: {
                uptimeSec: Math.max(0, Math.round((t - startedAt) / 1000)),
                processUptimeSec: metrics.uptimeSec,
                rssMb: metrics.rssMb,
                heapTotalMb: metrics.heapTotalMb,
                externalMb: metrics.externalMb,
                arrayBuffersMb: metrics.arrayBuffersMb,
                schedulerNamespaces: scheduler.namespaces,
                schedulerTasks: scheduler.taskCount,
                runningSchedulerTasks: scheduler.runningTasks,
                sampleCount: samples.length,
                loopSampleCount: loopLags.length,
                accountWorker: extra?.accountWorker || null,
            },
        };
    }

    function start(): void {
        if (sampleTimer) return;
        sample();
        sampleTimer = setInterval(() => {
            try { sample(); } catch { /* 采样失败不影响主流程 */ }
        }, sampleIntervalMs);
        if (sampleTimer && typeof sampleTimer.unref === 'function') sampleTimer.unref();
        probeTimer = setInterval(() => {
            const scheduled = monotonic();
            setTimeout(() => recordLoopLag(Math.max(0, monotonic() - scheduled)), 0);
        }, loopProbeIntervalMs);
        if (probeTimer && typeof probeTimer.unref === 'function') probeTimer.unref();
    }

    function stop(): void {
        if (sampleTimer) clearInterval(sampleTimer);
        if (probeTimer) clearInterval(probeTimer);
        sampleTimer = null;
        probeTimer = null;
    }

    function reset(): void {
        samples = [];
        events = [];
        pending = new Map();
        running = 0;
        loopLags = [];
        lastCpu = null;
    }

    return {
        start,
        stop,
        reset,
        sample,
        getSnapshot,
        recordTaskQueued,
        recordTaskStarted,
        recordTaskFinished,
        recordTaskTimeout,
        recordLoopLag,
        trackTask,
        isRunning: () => !!sampleTimer,
    };
}

const runtimeDiagnostics = createRuntimeDiagnostics();

function startRuntimeDiagnostics(): void {
    runtimeDiagnostics.start();
}

function stopRuntimeDiagnostics(): void {
    runtimeDiagnostics.stop();
}

/** 调度器统一埋点入口：所有定时任务都计入近 10 分钟完成 / 失败统计。 */
function trackScheduledTask<T>(taskFn: () => Promise<T> | T, namespace = 'default'): Promise<T> | T {
    return runtimeDiagnostics.trackTask(taskFn, namespace);
}

function getRuntimeDiagnosticsSnapshot(extra: any = {}): any {
    return runtimeDiagnostics.getSnapshot(extra);
}

module.exports = {
    createRuntimeDiagnostics,
    computePercentile,
    readProcessMetrics,
    formatClock,
    startRuntimeDiagnostics,
    stopRuntimeDiagnostics,
    trackScheduledTask,
    getRuntimeDiagnosticsSnapshot,
    runtimeDiagnostics,
};
