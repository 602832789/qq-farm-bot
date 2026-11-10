const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const worker = readFileSync(join(__dirname, '..', 'src', 'core', 'worker.ts'), 'utf8');

// 回归：上游 checkFriends 改成「单次访问 detached 独立入队」后，外层 tick 不能再持锁。
// 持锁 + detached 子调用 = 子调用排到持有者后面，持有者又在 await 它 → 死锁，整机自动化停摆。
test('好友 / 偷菜 tick 不能在自动化锁里调用（否则与内部 detached 互相等死）', () => {
    assert.doesNotMatch(worker, /runExclusiveAutomationTask\(\s*'friend_tick'/);
    assert.doesNotMatch(worker, /runExclusiveAutomationTask\(\s*'steal_tick'/);
    assert.match(worker, /void runFriendTick\(auto\)/);
    assert.match(worker, /void runStealTick\(auto\)/);
});

// 农场 tick 反过来必须串行：种植轮、2×2 预留窗口都依赖它真做完。
test('农场 tick 仍然串行执行', () => {
    assert.match(worker, /await runExclusiveAutomationTask\('farm_tick'/);
});

test('停调度器时三个运行中标记一起复位', () => {
    const start = worker.indexOf('function stopUnifiedScheduler');
    assert.ok(start > 0, '找不到 stopUnifiedScheduler');
    const body = worker.slice(start, worker.indexOf('\n}', start));
    for (const flag of ['farmTaskRunning', 'friendTaskRunning', 'stealTaskRunning'])
        assert.match(body, new RegExp(`${flag} = false`), `${flag} 没有复位`);
});
