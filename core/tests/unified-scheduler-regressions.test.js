const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const src = (file) => readFileSync(join(__dirname, '..', 'src', file), 'utf8');
const worker = src('core/worker.ts');
const friendScheduler = src('services/friend/scheduler.ts');
const farmScheduler = src('services/farm/scheduler.ts');
const planting = src('services/farm/planting.ts');

function bodyOf(text, startMarker, endMarker) {
    const start = text.indexOf(startMarker);
    assert.ok(start > 0, `找不到 ${startMarker}`);
    return text.slice(start, text.indexOf(endMarker, start));
}

// 回归：同一个 configRevision 的补充下发（好友黑名单 / 已知 GID 同步）带着新内容，
// 不能因为「配置同步」就把成熟驱动的偷菜排程、活动定时器、after_save 任务全部重来一遍。
test('配置补充下发只应用内容，不重复执行保存后的重排副作用', () => {
    const apply = bodyOf(worker, 'function applyRuntimeConfig', '// 接收主进程指令');
    assert.match(apply, /const freshRevision = rev > appliedConfigRevision/);
    assert.match(apply, /if \(loginReady && \(freshRevision \|\| rev === 0\)\)/);
    assert.match(apply, /applyConfigSnapshot\(/);
    assert.match(apply, /configureEmailClaim\(/);
    assert.match(apply, /resetUnifiedSchedule\(\{ preserveSteal: true \}\)/);
    assert.doesNotMatch(apply, /resetUnifiedSchedule\(\);/);
});

test('配置下发不再把偷菜的成熟时刻打回随机窗口', () => {
    const reset = bodyOf(worker, 'function resetUnifiedSchedule', 'const BUSINESS_TICK_LABEL');
    assert.match(reset, /if \(!options\.preserveSteal\) nextStealRunAt/);
    const start = bodyOf(worker, 'function startUnifiedScheduler', 'function stopUnifiedScheduler');
    assert.match(start, /resetUnifiedSchedule\(\);/, '首次启动仍要全量重置');
});

test('农场 tick 的 finally 与好友/偷菜一致带代次守卫', () => {
    const farm = bodyOf(worker, 'async function runFarmTick', '// ============ 帮助 Tick');
    assert.match(farm, /const generation = runtimeGeneration/);
    assert.match(farm, /if \(generation === runtimeGeneration\)/);
    const stop = bodyOf(worker, 'function stopUnifiedScheduler', 'function stopMysteryShopTimer');
    for (const field of ['businessBackoffMs.farm', 'businessBackoffMs.friend', 'foregroundYieldStreak.farm', 'foregroundYieldStreak.friend', 'nextStealDelayMs']) {
        assert.match(stop, new RegExp(`${field.replaceAll('.', '\\.')} = 0`), `${field} 没有在停机时复位`);
    }
});

test('好友巡查占住互斥标志时，偷菜按成熟计划重新唤醒而不是写死 60 秒', () => {
    const run = bodyOf(friendScheduler, 'export async function runScheduledStealCheck', '// ============ 循环控制');
    assert.match(run, /if \(isCheckingFriends\) return getNextStealDelayMs\(\)/);
    assert.doesNotMatch(run, /isCheckingFriends \|\| !state\.gid/);
});

test('配置刷新不覆盖分次种植的剩余延迟，也不会先 clear 又排不上', () => {
    const refresh = bodyOf(farmScheduler, 'function refreshFarmCheckLoop', '// ============ 化肥自动购买定时检测');
    assert.doesNotMatch(refresh, /farmScheduler\.clear\('farm_plant_continue'\)/);
    assert.match(refresh, /schedulePlantContinuation\(farmLoopGeneration, automaticPlantPacing\);/);
    assert.doesNotMatch(refresh, /schedulePlantContinuation\([^)]*delayMs/);
    const schedule = bodyOf(farmScheduler, 'function schedulePlantContinuation', 'async function checkFarm');
    assert.match(schedule, /getRemainingPlantDelayMs\(pacing\)/);
});

test('停机时复位全部 2×2 跨轮状态，包含已注册的布局', () => {
    const reset = bodyOf(planting, 'function resetPlantingRoundState', 'function logPlantingThrottled');
    assert.match(reset, /resetRegisteredLayouts\(\)/);
    const quiesce = bodyOf(worker, 'function quiesceBot', 'async function stopBot');
    assert.match(quiesce, /resetPlantingRoundState\(\)/);
});
