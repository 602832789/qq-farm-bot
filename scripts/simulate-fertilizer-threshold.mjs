#!/usr/bin/env node
/**
 * 「快成熟判定」阈值命中率模拟（60 秒 vs 300 秒）
 *
 * 模型来自真实代码：
 *   - worker.ts `runFarmTick`：`nextFarmRunAt = Date.now() + farmMs` 在 finally（本轮工作结束后）设置，
 *     因此两轮施肥判定之间的实际周期 G = 本轮工作耗时 W + farmMs。
 *   - `randomIntervalMs`：farmMs = 20 + floor(random()*6) 秒（默认 farmMin=20 / farmMax=25）。
 *   - planting.ts smart 分支：每轮 `getFastMatureLands(lands, smartSeconds)`，
 *     条件 `0 <= timeToMature <= threshold`；命中后有机肥循环推进到成熟并在同轮收获。
 *
 * 命中率定义：作物成熟前最后一次巡查时，剩余生长时间 R 落在阈值窗口内 → 被有机肥催熟。
 * 未命中则作物自然成熟，要等下一轮巡查才收获，期间暴露「成熟 → 收获」的被偷窗口。
 *
 * 采样：构造长时巡查时间轴，随机取成熟时刻（等价于 renewal 过程的长度偏置采样），
 * 二分定位成熟前最后一次巡查，统计命中率、有机肥容器消耗（= R 秒）、被偷暴露窗口。
 * 不含「普通肥推进阶段」造成的剩余时间跳变，结果偏保守（真实命中率略高）。
 *
 * 用法：node scripts/simulate-fertilizer-threshold.mjs [--samples 200000] [--seed 20261109] [--json]
 */
import process from 'node:process';

const THRESHOLDS = [30, 60, 120, 300];

// 每轮工作耗时的现实区间（秒）：网络请求、收获/种植、好友任务、礼包、有机肥循环串行延迟等。
const SCENARIOS = [
    { key: 'ideal', name: 'A 理想（无工作耗时）', work: () => 0, note: '纯调度 20~25 秒' },
    { key: 'light', name: 'B 轻负载', work: r => 2 + r * 6, note: 'W 2~8 秒，周期 22~33 秒' },
    { key: 'typical', name: 'C 典型', work: r => 8 + r * 17, note: 'W 8~25 秒，周期 28~50 秒' },
    { key: 'busy', name: 'D 繁忙', work: r => 25 + r * 35, note: 'W 25~60 秒，周期 45~85 秒' },
    { key: 'congested', name: 'E 拥堵/退避', work: r => 60 + r * 60, note: 'W 60~120 秒，周期 80~145 秒' },
];

function parseArgs(argv) {
    const opts = { samples: 200000, seed: 20261109, json: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--samples') opts.samples = Number(argv[++i]) || opts.samples;
        else if (argv[i] === '--seed') opts.seed = Number(argv[++i]) || opts.seed;
        else if (argv[i] === '--json') opts.json = true;
    }
    return opts;
}

/** 可复现 PRNG（mulberry32） */
function makeRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function farmInterval(r) {
    return 20 + Math.floor(r() * 6); // 20~25 整数秒
}

/** 构造巡查时间轴；返回 tick 时刻数组与相邻间隔数组。 */
function buildTicks(scenario, random, horizonSec) {
    const ticks = [0];
    const gaps = [];
    let t = 0;
    while (t < horizonSec) {
        const gap = farmInterval(random) + scenario.work(random());
        gaps.push(gap);
        t += gap;
        ticks.push(t);
    }
    return { ticks, gaps };
}

/** 找到 <= T 的最后一个 tick 下标 */
function lastTickBefore(ticks, T) {
    let lo = 0;
    let hi = ticks.length - 2;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ticks[mid] <= T) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

function simulate(scenario, opts) {
    const random = makeRandom(opts.seed);
    const horizonSec = Math.max(2_000_000, opts.samples * 8);
    const { ticks, gaps } = buildTicks(scenario, random, horizonSec);
    // 留出尾部，保证 T 一定落在两个 tick 之间
    const upper = ticks[ticks.length - 2];
    const sampleRandom = makeRandom(opts.seed ^ 0x9E3779B9);

    const stats = THRESHOLDS.map(th => ({
        threshold: th,
        hits: 0,
        organicSeconds: 0,
        exposureSeconds: 0,
        missExposureSeconds: 0,
        misses: 0,
    }));

    for (let n = 0; n < opts.samples; n++) {
        const T = sampleRandom() * upper;
        const i = lastTickBefore(ticks, T);
        const R = T - ticks[i]; // 成熟前最后一次巡查时的剩余生长时间
        const G = gaps[i];
        if (!(R > 0 && R <= G)) continue;
        for (const s of stats) {
            if (R <= s.threshold) {
                s.hits += 1;
                s.organicSeconds += R; // 有机肥容器消耗 = 推进的剩余生长秒数
            }
            else {
                s.misses += 1;
                const exposure = G - R; // 自然成熟后等到下一轮巡查才收获
                s.exposureSeconds += exposure;
                s.missExposureSeconds += exposure;
            }
        }
    }

    const N = stats[0].hits + stats[0].misses;
    const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const analytic = THRESHOLDS.map(th => ({
        threshold: th,
        hitRate: gaps.reduce((a, g) => a + Math.min(g, th), 0) / gaps.reduce((a, g) => a + g, 0),
    }));

    return {
        key: scenario.key,
        name: scenario.name,
        note: scenario.note,
        samples: N,
        meanGapSec: Number(meanGap.toFixed(2)),
        maxGapSec: Number(Math.max(...gaps).toFixed(2)),
        results: stats.map((s, idx) => ({
            threshold: s.threshold,
            hitRate: Number((s.hits / N * 100).toFixed(2)),
            analyticHitRate: Number((analytic[idx].hitRate * 100).toFixed(2)),
            organicSecPerLand: Number((s.organicSeconds / N).toFixed(2)),
            organicSecWhenHit: s.hits ? Number((s.organicSeconds / s.hits).toFixed(2)) : 0,
            exposureSecPerLand: Number((s.exposureSeconds / N).toFixed(2)),
            exposureSecWhenMissed: s.misses ? Number((s.missExposureSeconds / s.misses).toFixed(2)) : 0,
            missRate: Number((s.misses / N * 100).toFixed(2)),
        })),
    };
}

function printReport(report, opts) {
    const lines = [];
    lines.push('# 快成熟判定阈值模拟（60 秒 vs 300 秒）');
    lines.push('');
    lines.push(`样本 ${opts.samples.toLocaleString()} 株 / 场景，随机种子 ${opts.seed}；周期 G = 本轮工作耗时 + 20~25 秒随机。`);
    lines.push('命中 = 成熟前最后一次巡查时剩余生长时间 ≤ 阈值 → 当轮有机肥催熟并收获；未命中 = 自然成熟后等下一轮收获。');
    lines.push('');
    lines.push('| 场景 | 平均周期 | 阈值 | 命中率 | 解析校验 | 有机肥消耗(秒/株) | 命中时提前(秒) | 未命中率 | 被偷暴露(秒/株) | 漏掉时暴露(秒) |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const scene of report) {
        for (const r of scene.results) {
            const focus = r.threshold === 60 || r.threshold === 300;
            lines.push(`| ${r.threshold === 30 ? scene.name : ''} | ${r.threshold === 30 ? `${scene.meanGapSec}s` : ''} | ${focus ? `**${r.threshold}s**` : `${r.threshold}s`} | ${focus ? `**${r.hitRate}%**` : `${r.hitRate}%`} | ${r.analyticHitRate}% | ${r.organicSecPerLand} | ${r.organicSecWhenHit} | ${r.missRate}% | ${r.exposureSecPerLand} | ${r.exposureSecWhenMissed} |`);
        }
    }
    lines.push('');
    lines.push('> 解析校验 = Σmin(G,阈值)/ΣG（renewal 长度偏置下的理论命中率），与模拟值应基本一致。');
    lines.push('> 不含普通肥推进阶段造成的剩余时间跳变，真实命中率略高于此表；有机肥消耗按「推进多少生长时间就扣多少容器秒数」计。');
    return lines.join('\n');
}

const opts = parseArgs(process.argv.slice(2));
const report = SCENARIOS.map(scene => simulate(scene, opts));
if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
else {
    process.stdout.write(`${printReport(report, opts)}\n`);
}
