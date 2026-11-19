export {};

/**
 * 好友外挂检测（移植自 BUGDey 版 cheat-detect）。
 *
 * 原理：挂机/查询过程中每次拉取访客互动记录，就把记录累积到本地样本库
 * （72 小时滚动窗口），再对每个访客从六个维度评分，综合出 0-100 嫌疑分：
 *   1. 操作间隔规律性（真人抖动大，脚本间隔高度均匀）
 *   2. 凌晨活跃占比（0-6 点高活跃是典型挂机特征）
 *   3. 日均频率（频率异常偏高）
 *   4. 行为单一性（只会一种动作）
 *   5. 24 小时在线时长（以最近 24h 有真实操作覆盖的小时数计）
 *   6. 秒偷（我方作物成熟后 60 秒内被该访客偷走）
 * 样本不足 20 条时嫌疑分按样本量线性压缩并封顶在关注线以下，
 * 避免小样本误伤；护主犬的免伤保护依赖原版的 dog 缓存，本仓库没有
 * 这份缓存，因此该保护在本实现里是空操作（保留字段位以便后续接入）。
 */

const fs = require('node:fs');
const path = require('node:path');
const { getDataFile } = require('../../config/runtime-paths');
const { writeJsonFileAtomic } = require('../json-db');
const { logWarn, toTimeSec } = require('../../utils/utils');

const SAMPLE_WINDOW_MS = 72 * 60 * 60 * 1000;
const SAMPLE_MAX_ENTRIES = 8000;
/** 秒偷判定：我方作物成熟后多少秒内被偷视为「踩点秒偷」 */
const FAST_STEAL_WINDOW_SEC = 60;
/** 成熟时刻历史最大条数（按时刻去重） */
const MATURE_HISTORY_MAX = 4000;
/** 样本置信阈值：低于该条数不标记可疑/高活跃，嫌疑分按比例压缩 */
const SAMPLE_MIN_TRUST = 20;
/** 样本不足时嫌疑分封顶值：压在关注线（warn >= 30）之下，保证分数与等级一致 */
const INSUFFICIENT_SAMPLE_SCORE_CAP = 29;
const GUARD_DOG_ID = 90021;

interface SampleData {
    samples: any[];
    matureHistory: number[];
}

function getSampleDir(): string {
    const dir = getDataFile('interact_samples');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function getSampleFile(accountId: string): string {
    const safeName = String(accountId || '').replace(/[^\w-]/g, '_');
    return path.join(getSampleDir(), `${safeName}.json`);
}

function readSampleData(accountId: string): SampleData {
    try {
        const data = JSON.parse(fs.readFileSync(getSampleFile(accountId), 'utf8'));
        return {
            samples: data && Array.isArray(data.samples) ? data.samples : [],
            matureHistory: data && Array.isArray(data.matureHistory) ? data.matureHistory : [],
        };
    }
    catch {
        return { samples: [], matureHistory: [] };
    }
}

function writeSampleData(accountId: string, samples: any[], matureHistory: number[]): void {
    try {
        writeJsonFileAtomic(getSampleFile(accountId), {
            samples: samples.slice(-SAMPLE_MAX_ENTRIES),
            matureHistory: (matureHistory || []).slice(-MATURE_HISTORY_MAX),
            updatedAt: Date.now(),
        });
    }
    catch (err: any) {
        try {
            logWarn('好友', `外挂检测样本写入失败: ${err && err.message}`, {
                module: 'friend',
                event: 'cheat_samples_save',
                result: 'error',
            });
        }
        catch { /* 日志失败不影响主流程 */ }
    }
}

/**
 * 记录我方农场各地块的成熟时刻（秒），供「秒偷」判定使用。
 * 成熟时刻 = 该地块 plant.phases 中最大的 begin_time。
 */
function recordOwnMaturityHistory(lands: any[], now: number = Date.now()): number {
    const accountId = String(process.env.FARM_ACCOUNT_ID || '');
    if (!accountId || !Array.isArray(lands)) return 0;
    const nowSec = Math.floor(now / 1000);
    const horizonSec = nowSec + 36 * 3600; // 只收录 36h 内会发生的成熟
    const data = readSampleData(accountId);
    const known = new Set(data.matureHistory.map((at: number) => Number(at)));
    let added = 0;
    for (const land of lands) {
        const phases = land && land.plant && Array.isArray(land.plant.phases) ? land.plant.phases : null;
        if (!phases) continue;
        let mature = 0;
        for (const phase of phases) {
            const t = toTimeSec(phase.begin_time);
            if (t > mature) mature = t;
        }
        if (mature <= 0 || mature > horizonSec) continue;
        if (known.has(mature)) continue;
        known.add(mature);
        data.matureHistory.push(mature);
        added += 1;
    }
    const cutoff = Math.floor((now - SAMPLE_WINDOW_MS) / 1000);
    data.matureHistory = data.matureHistory.filter((at: number) => Number(at) >= cutoff);
    if (added > 0)
        writeSampleData(accountId, data.samples, data.matureHistory);
    return added;
}

function pruneSamples(samples: any[], now: number = Date.now()): any[] {
    const cutoff = Math.floor((now - SAMPLE_WINDOW_MS) / 1000);
    return samples.filter(s => Number(s[0]) >= cutoff);
}

/**
 * 累积访客互动样本（在拉取互动记录后调用）。
 * records: interact.ts 里 normalizeInteractRecord 的输出
 */
function recordInteractSamples(accountId: string, records: any[], now: number = Date.now()): number {
    if (!accountId || !Array.isArray(records) || records.length === 0) return 0;
    const data = readSampleData(accountId);
    const existing = data.samples;
    const seen = new Set(existing.map(([ts, gid, action]: any[]) => `${ts}-${gid}-${action}`));
    let added = 0;
    const nowSec = Math.floor(now / 1000);
    for (const record of records) {
        const ts = Number(record.serverTimeSec) || 0;
        const gid = Number(record.visitorGid) || 0;
        const action = Number(record.actionType) || 0;
        if (!ts || !gid || ts > nowSec + 60) continue;
        const key = `${ts}-${gid}-${action}`;
        if (seen.has(key)) continue;
        seen.add(key);
        existing.push([ts, gid, action, Number(record.cropCount) || 0, String(record.nick || '')]);
        added += 1;
    }
    const pruned = pruneSamples(existing, now);
    if (added > 0 || pruned.length !== existing.length)
        writeSampleData(accountId, pruned, data.matureHistory);
    return added;
}

// ---- 评分 ----

function stdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

function computeRegularityScore(intervals: number[]) {
    if (intervals.length < 3) return { score: 0, cv: null as number | null };
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (mean <= 0) return { score: 0, cv: null as number | null };
    const cv = stdDev(intervals) / mean;
    let score = 0;
    if (cv < 0.08) score = 20;
    else if (cv < 0.15) score = 14;
    else if (cv < 0.25) score = 8;
    else if (cv < 0.4) score = 3;
    return { score, cv: Number(cv.toFixed(3)) };
}

function computeDawnScore(dawnCount: number, total: number) {
    if (!total) return { score: 0, ratio: 0 };
    const ratio = dawnCount / total;
    let score = 0;
    if (ratio >= 0.3) score = 15;
    else if (ratio >= 0.15) score = 8;
    else if (ratio >= 0.08) score = 3;
    return { score, ratio: Number(ratio.toFixed(3)) };
}

function computeFrequencyScore(perDay: number): number {
    if (perDay >= 40) return 15;
    if (perDay >= 20) return 10;
    if (perDay >= 10) return 5;
    return 0;
}

function computeSingleActionScore(actionTypes: Set<number>, total: number): number {
    return actionTypes.size === 1 && total >= 5 ? 10 : 0;
}

function computeActiveHoursScore(activeHours24: number): number {
    if (activeHours24 >= 10) return 20;
    if (activeHours24 >= 6) return 12;
    if (activeHours24 >= 4) return 6;
    return 0;
}

function computeFastStealScore(fastStealCount: number, stealCount: number): number {
    if (fastStealCount >= 3 && stealCount >= 3) return 30;
    if (fastStealCount >= 2) return 20;
    if (fastStealCount >= 1) return 8;
    return 0;
}

/** 综合分析：返回每个访客的嫌疑评估。 */
function analyzeFriendCheat(accountId: string, now: number = Date.now()): any {
    const sampleData = readSampleData(accountId);
    const rawSamples = pruneSamples(sampleData.samples, now);
    const matureSet = new Set((sampleData.matureHistory || []).map((at: number) => Number(at)));

    const dayCutoffMs = now - 24 * 60 * 60 * 1000;
    const byVisitor = new Map<number, any>();
    for (const [ts, gid, action, cropCount, nick] of rawSamples as any[][]) {
        if (!byVisitor.has(gid)) {
            byVisitor.set(gid, { tsList: [], actions: [], cropCount: 0, nick: '', recentOpHours: new Set<number>(), fastStealCount: 0 });
        }
        const entry = byVisitor.get(gid);
        const tsMs = Number(ts) * 1000;
        entry.tsList.push(tsMs);
        entry.actions.push(Number(action) || 0);
        entry.cropCount += Number(cropCount) || 0;
        if (nick) entry.nick = nick;
        if (tsMs >= dayCutoffMs && (action === 1 || action === 2))
            entry.recentOpHours.add(Math.floor(tsMs / 3600000));
        if (Number(action) === 1 && matureSet.size > 0) {
            const tsSec = Number(ts);
            for (let at = tsSec; at >= tsSec - FAST_STEAL_WINDOW_SEC; at -= 1) {
                if (matureSet.has(at)) {
                    entry.fastStealCount += 1;
                    break;
                }
            }
        }
    }

    const visitors: any[] = [];
    for (const [gid, entry] of byVisitor) {
        const tsList: number[] = [...entry.tsList].sort((a: number, b: number) => a - b);
        const total: number = tsList.length;
        const intervals: number[] = [];
        for (let i = 1; i < tsList.length; i++)
            intervals.push((tsList[i]! - tsList[i - 1]!) / 1000);

        const dawnCount = tsList.filter((ts: number) => {
            const hour = new Date(ts).getHours();
            return hour >= 0 && hour < 6;
        }).length;

        const spanMs = tsList.length >= 2 ? tsList[tsList.length - 1]! - tsList[0]! : 0;
        const firstDay = new Date(tsList[0]!);
        firstDay.setHours(0, 0, 0, 0);
        const lastDay = new Date(tsList[tsList.length - 1]!);
        lastDay.setHours(0, 0, 0, 0);
        const daySpanDays = Math.max(1, Math.round((lastDay.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000)) + 1);

        const actionSet = new Set<number>(entry.actions);
        const helpCount = entry.actions.filter((a: number) => a === 2).length;
        const stealCount = entry.actions.filter((a: number) => a === 1).length;
        const nuisanceCount = entry.actions.filter((a: number) => a === 3).length;

        const regularity = computeRegularityScore(intervals);
        const dawn = computeDawnScore(dawnCount, total);
        const perDay = Number((total / daySpanDays).toFixed(2));

        // 本仓库没有护主犬缓存，这里恒为 false；保留字段位便于后续接入。
        const isGuardDog = false;

        let score: number =
            regularity.score
            + dawn.score
            + computeFrequencyScore(perDay)
            + computeSingleActionScore(actionSet, total)
            + computeActiveHoursScore(entry.recentOpHours.size)
            + computeFastStealScore(entry.fastStealCount, stealCount);

        if (isGuardDog) score = Math.min(score, 15);

        const insufficientSamples = total < SAMPLE_MIN_TRUST;
        if (insufficientSamples) {
            score = Math.min(
                Math.round(score * (total / SAMPLE_MIN_TRUST)),
                INSUFFICIENT_SAMPLE_SCORE_CAP,
            );
        }
        score = Math.max(0, Math.min(100, Math.round(score)));

        const level = !insufficientSamples && score >= 60
            ? 'danger'
            : !insufficientSamples && score >= 30
                ? 'warn'
                : 'safe';

        visitors.push({
            gid,
            nick: entry.nick || `GID:${gid}`,
            score,
            level,
            protected: isGuardDog,
            insufficientSamples,
            activeHours24: entry.recentOpHours.size,
            highActive: !insufficientSamples && entry.recentOpHours.size >= 6,
            metrics: {
                count: total,
                perDay,
                dawnRatio: dawn.ratio,
                regularityCv: regularity.cv,
                singleAction: actionSet.size === 1,
                spanHours: Number((spanMs / 3600000).toFixed(1)),
                helpCount,
                stealCount,
                stealValue: entry.cropCount,
                nuisanceCount,
                fastStealCount: entry.fastStealCount,
            },
            lastTs: tsList[tsList.length - 1] || 0,
        });
    }

    visitors.sort((a, b) => b.score - a.score || b.metrics.count - a.metrics.count);

    return {
        windowHours: SAMPLE_WINDOW_MS / (60 * 60 * 1000),
        sampleMinTrust: SAMPLE_MIN_TRUST,
        sampleCount: rawSamples.length,
        visitorCount: visitors.length,
        suspiciousCount: visitors.filter(v => v.level === 'danger' && !v.protected).length,
        visitors,
    };
}

module.exports = {
    recordInteractSamples,
    recordOwnMaturityHistory,
    analyzeFriendCheat,
    SAMPLE_WINDOW_MS,
    SAMPLE_MIN_TRUST,
    GUARD_DOG_ID,
};
