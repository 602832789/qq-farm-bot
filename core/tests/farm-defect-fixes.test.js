const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const src = file => fs.readFileSync(path.join(root, 'src', file), 'utf8');
const worker = src('core/worker.ts');
const farmScheduler = src('services/farm/scheduler.ts');
const planting = src('services/farm/planting.ts');
const task = src('services/task.ts');
const notification = src('controllers/admin/panel-notification-routes.ts');

function bodyOf(text, startMarker, endMarker) {
    const start = text.indexOf(startMarker);
    assert.ok(start > 0, `找不到 ${startMarker}`);
    const end = text.indexOf(endMarker, start);
    assert.ok(end > start, `找不到 ${endMarker}`);
    return text.slice(start, end);
}

// ============ 真跑：铲除后空地合并 ============
const { mergeConfirmedEmptyLands } = require('../dist/services/farm/planting');

test('铲除后空地只增不减：滞后/空快照不能抹掉开场已确认的空地', () => {
    assert.deepEqual(mergeConfirmedEmptyLands([1, 2, 3], []), [1, 2, 3], '空快照等于没有补充');
    assert.deepEqual(mergeConfirmedEmptyLands([1, 2, 3], null), [1, 2, 3], '非数组回包同样不删减');
    assert.deepEqual(mergeConfirmedEmptyLands([1, 2, 3], [4]), [1, 2, 3, 4], '补充新释放的地块');
    assert.deepEqual(mergeConfirmedEmptyLands([1, 2, 3], [2, 3, 4, 5]), [1, 2, 3, 4, 5], '按地块 id 去重，不重复种植');
    assert.deepEqual(mergeConfirmedEmptyLands([], [7, 8]), [7, 8], '开场无空地时照常接收新空地');
});

test('合并时过滤非法地块编号，结果里不出现 0 / 负数 / NaN', () => {
    const merged = mergeConfirmedEmptyLands([1, '2', null, 0, -1, 'abc'], [2, 6, undefined]);
    assert.deepEqual(merged, [1, 2, 6]);
    assert.equal(new Set(merged).size, merged.length, '每个地块只出现一次');
    assert.ok(merged.every(id => Number.isInteger(id) && id > 0));
});

test('源码里不再用「服务端快照覆盖」开场空地', () => {
    assert.doesNotMatch(planting, /landsToPlant = analyzeLands\(latestLands\)\.empty/, '覆盖写法会把已有空地抹成 0');
    const recheck = bodyOf(planting, 'const latest = await getAllLands()', 'if (landsToPlant.length === 0)');
    assert.match(recheck, /confirmedLands\.length === 0/, '成功但空快照要有保护');
    assert.match(recheck, /mergeConfirmedEmptyLands\(landsToPlant, analyzeLands\(confirmedLands\)\.empty\)/);
    assert.match(recheck, /保留开场已确认的空地/);
});

// ============ 真跑：网关退避上限 ============
// nextBusinessTickDeferMs 依赖的是模块级状态与几个纯函数，这里把函数体抽出来注入
// mock 后真实执行，验证「第 6 次强制探活」，而不只是匹配源码文本。
const deferStart = worker.indexOf('function nextBusinessTickDeferMs');
assert.ok(deferStart > 0);
const deferEnd = worker.indexOf('\n}\n', deferStart) + 3;
const deferBody = worker.slice(deferStart, deferEnd)
    .replace(/^function nextBusinessTickDeferMs\(kind: string\): number \{/, '')
    .replace(/\}\s*$/, '');
// 用 vm 沙箱注入模块级状态与依赖，真实执行抽出来的函数体（core 测试禁用 new Function）。
function makeDeferFn(ctx) {
    const code = `(function nextBusinessTickDeferMs(kind) { ${deferBody} })`;
    return vm.runInNewContext(code, {
        getGatewayLoad: () => ctx.load,
        isGatewayHealthyForBusiness: () => ctx.healthy,
        nextBusinessBackoffMs: previous => (previous <= 0 ? 30000 : Math.min(60000, previous * 2)),
        businessBackoffMs: ctx.businessBackoffMs,
        businessBackoffStreak: ctx.businessBackoffStreak,
        businessBackoffTotalMs: ctx.businessBackoffTotalMs,
        BUSINESS_BACKOFF_MAX_STREAK: ctx.BUSINESS_BACKOFF_MAX_STREAK,
        BUSINESS_BACKOFF_MAX_TOTAL_MS: ctx.BUSINESS_BACKOFF_MAX_TOTAL_MS,
        BUSINESS_TICK_LABEL: { farm: '农场定时任务', friend: '好友定时任务' },
        formatDurationZh: ms => `${ms}ms`,
        describeGatewayStall: () => 'mock stall',
        log: (...args) => ctx.logs.push(['log', ...args]),
        logWarn: (...args) => ctx.logs.push(['warn', ...args]),
    });
}

function makeDeferContext(overrides = {}) {
    return {
        load: { heartbeatMisses: 1, oldestPendingAgeMs: 6000 },
        healthy: false,
        logs: [],
        businessBackoffMs: { farm: 0, friend: 0 },
        businessBackoffStreak: { farm: 0, friend: 0 },
        businessBackoffTotalMs: { farm: 0, friend: 0 },
        BUSINESS_BACKOFF_MAX_STREAK: 5,
        BUSINESS_BACKOFF_MAX_TOTAL_MS: 5 * 60 * 1000,
        ...overrides,
    };
}

function callDefer(ctx, kind = 'farm') {
    return makeDeferFn(ctx)(kind);
}

test('网关持续不健康：退避 30s→60s 封顶，连续 6 次后强制探活并重置计数', () => {
    const ctx = makeDeferContext();
    const seq = Array.from({ length: 6 }, () => callDefer(ctx));
    assert.deepEqual(seq, [30000, 60000, 60000, 60000, 60000, 0], '第 6 次返回 0 让本轮照常跑');
    assert.equal(ctx.businessBackoffMs.farm, 0);
    assert.equal(ctx.businessBackoffStreak.farm, 0);
    assert.equal(ctx.businessBackoffTotalMs.farm, 0);
    assert.ok(ctx.logs.some(([, , , meta]) => meta && meta.result === 'force_probe'), '强制探活要打日志');
    // 重置后从 30s 重新计，不会一直返回 0
    assert.equal(callDefer(ctx), 30000);
});

test('累计推迟超过 5 分钟同样强制探活，不受次数上限放宽影响', () => {
    const ctx = makeDeferContext({ BUSINESS_BACKOFF_MAX_STREAK: 1000 });
    let forcedAt = -1;
    for (let i = 1; i <= 12; i++) {
        if (callDefer(ctx) === 0) { forcedAt = i; break; }
    }
    assert.ok(forcedAt > 0, '累计上限要能独立触发');
    assert.ok(ctx.businessBackoffTotalMs.farm === 0, '触发后累计清零');
});

test('网关恢复后第一次调用即回到正常间隔并清空所有退避计数', () => {
    const ctx = makeDeferContext();
    callDefer(ctx);
    callDefer(ctx);
    ctx.healthy = true;
    assert.equal(callDefer(ctx), 0);
    assert.equal(ctx.businessBackoffMs.farm, 0);
    assert.equal(ctx.businessBackoffStreak.farm, 0);
    assert.equal(ctx.businessBackoffTotalMs.farm, 0);
    assert.ok(ctx.logs.some(([, , , meta]) => meta && meta.result === 'resume'), '恢复要打 resume 日志');
});

test('农场与好友两条线的退避计数互相独立', () => {
    const ctx = makeDeferContext();
    callDefer(ctx, 'farm');
    callDefer(ctx, 'farm');
    assert.equal(ctx.businessBackoffStreak.farm, 2);
    assert.equal(ctx.businessBackoffStreak.friend, 0);
    assert.equal(callDefer(ctx, 'friend'), 30000, '好友线从自己的 30s 起算');
});

// ============ 静态锁：其余修复的结构不回退 ============
test('本轮没走到种植决策时，被清掉的分次种植续跑要接回', () => {
    const check = bodyOf(farmScheduler, 'async function checkFarm()', 'async function runMultiSeasonFertilizer');
    assert.match(check, /const hadPendingContinuation = farmScheduler\.has\('farm_plant_continue'\)/);
    assert.match(check, /pacing\.plantingResolved = false/);
    assert.match(check, /if \(hadPendingContinuation && !pacing\.plantingResolved/);
    assert.match(check, /getRemainingPlantDelayMs\(pacing\) > 0/, '剩余间隔为 0 时不重排，避免 0ms 空转');
    assert.match(check, /pacing\.deferred = true/);
    assert.match(check, /canContinueFarm\(generation\)/, '兜底也要守代次，切账号/停机不重排');
    const plantBlock = bodyOf(farmScheduler, '// 执行种植', '// 执行土地解锁');
    assert.match(plantBlock, /if \(automatic\) automatic\.pacing\.plantingResolved = true/, '确实没地时不触发兜底空转');
    const stop = bodyOf(farmScheduler, 'function stopFarmCheckLoop', 'function refreshFarmCheckLoop');
    assert.match(stop, /plantingResolved: false/, '停机重建 pacing 时带上标记');
});

test('农场整轮异常不再被空 catch 静默吞掉；退避计数在重置/停机时清零', () => {
    const farmTick = bodyOf(worker, 'async function runFarmTick', '// ============ 帮助 Tick');
    assert.match(farmTick, /catch \(e: any\)/);
    assert.match(farmTick, /result: 'error'/);
    assert.doesNotMatch(farmTick, /\/\/ ignore/);
    const defer = bodyOf(worker, 'function nextBusinessTickDeferMs', 'async function runFarmTick');
    assert.match(defer, /businessBackoffStreak\[kind\] > BUSINESS_BACKOFF_MAX_STREAK/);
    assert.match(defer, /businessBackoffTotalMs\[kind\] > BUSINESS_BACKOFF_MAX_TOTAL_MS/);
    assert.match(worker, /BUSINESS_BACKOFF_MAX_STREAK = 5/);
    assert.match(worker, /BUSINESS_BACKOFF_MAX_TOTAL_MS = 5 \* 60 \* 1000/);
    for (const section of [
        bodyOf(worker, 'function resetUnifiedSchedule', 'const BUSINESS_TICK_LABEL'),
        bodyOf(worker, 'function stopUnifiedScheduler', 'function stopMysteryShopTimer'),
    ]) {
        for (const field of ['businessBackoffStreak.farm', 'businessBackoffStreak.friend', 'businessBackoffTotalMs.farm', 'businessBackoffTotalMs.friend'])
            assert.match(section, new RegExp(`${field.replaceAll('.', '\\.')} = 0`), `${field} 未在该处复位`);
    }
});

test('任务推送 debounce 与农场巡查共用 checking 锁，且 finally 复位', () => {
    const debounce = bodyOf(task, "taskScheduler.setTimeoutTask('task_claim_debounce'", 'function claimTasksFromList');
    assert.match(debounce, /if \(checking\) return/);
    assert.match(debounce, /checking = true/);
    assert.match(debounce, /finally \{\s*checking = false;/);
});

test('面板通知读取失败仍降级为空列表，但不再静默', () => {
    assert.match(notification, /notificationLogger\.warn/);
    assert.match(notification, /result: 'error'/);
    assert.match(notification, /res\.json\(\{ ok: true, data: \[\] \}\)/, '降级语义保持不变，不破坏前端');
});
