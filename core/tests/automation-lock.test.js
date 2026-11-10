const assert = require('node:assert/strict');
const test = require('node:test');

const {
    runExclusiveAutomationTask,
} = require('../dist/services/automation-lock');

test('automation lock serializes top-level tasks', async () => {
    let active = 0;
    let maxActive = 0;

    const task = async (delay) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, delay));
        active -= 1;
    };

    await Promise.all([
        runExclusiveAutomationTask('task-a', () => task(15)),
        runExclusiveAutomationTask('task-b', () => task(5)),
        runExclusiveAutomationTask('task-c', () => task(10)),
    ]);

    assert.equal(maxActive, 1);
});

test('automation lock allows nested calls in the same task', async () => {
    let active = 0;
    let maxActive = 0;

    await runExclusiveAutomationTask('outer', async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await runExclusiveAutomationTask('inner', async () => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await new Promise(resolve => setTimeout(resolve, 5));
            active -= 1;
        });
        active -= 1;
    });

    assert.equal(maxActive, 2);
});

/** 死锁不是异常，是永远不返回；没有超时的话测试会一直挂着。 */
function withTimeout(promise, ms = 2000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`超过 ${ms}ms 未完成（死锁）`)), ms)),
    ]);
}

// 回归：checkFriends 内部按单次访问用 detached 独立入队。只要外层 tick 也持锁，
// detached 子调用就会排到「外层任务自己」后面，而外层正在 await 它 —— 整个自动化停摆。
test('automation lock: 持锁任务内 await 的 detached 子调用就地执行，不会死锁', async () => {
    const result = await withTimeout(runExclusiveAutomationTask('parent', async () => {
        const child = await runExclusiveAutomationTask('child', async () => 'child', { detached: true });
        return `parent+${child}`;
    }));
    assert.equal(result, 'parent+child');
});

test('automation lock: 持锁上下文内同步抛错也必须返回 rejected Promise', async () => {
    await runExclusiveAutomationTask('outer', async () => {
        let caught = null;
        const promise = runExclusiveAutomationTask('inner', () => {
            throw new Error('sync boom');
        }, { detached: true });
        assert.equal(typeof promise.catch, 'function');
        await promise.catch((error) => { caught = error; });
        assert.equal(caught && caught.message, 'sync boom');
    });
});

test('automation lock: 顶层同步抛错不会让锁队列卡死', async () => {
    await assert.rejects(
        runExclusiveAutomationTask('bad', () => { throw new Error('sync error'); }),
        /sync error/,
    );
    const value = await withTimeout(runExclusiveAutomationTask('after', async () => 'ok'));
    assert.equal(value, 'ok');
});

// detached 真正的用途：定时器继承了已结束任务的异步上下文（active=false），必须重新排队。
test('automation lock: 任务结束后的定时器调用 detached 仍然重新排队', async () => {
    const order = [];

    await runExclusiveAutomationTask('first', async () => {
        order.push('first');
        setTimeout(() => {
            runExclusiveAutomationTask('late', async () => { order.push('late'); }, { detached: true });
        }, 20);
    });

    await runExclusiveAutomationTask('second', async () => {
        order.push('second');
        await new Promise(resolve => setTimeout(resolve, 120));
    });

    await new Promise(resolve => setTimeout(resolve, 60));
    assert.deepEqual(order, ['first', 'second', 'late']);
});
