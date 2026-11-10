export {};

const { AsyncLocalStorage } = require('node:async_hooks');

interface AutomationLockStore {
    exclusive: true;
    active: boolean;
}

const storage: any = new AsyncLocalStorage();
let tail: Promise<void> = Promise.resolve();
let running = false;

function runExclusiveAutomationTask<T>(
    taskName: string,
    taskFn: () => T | PromiseLike<T>,
    options: { detached?: boolean } = {},
): Promise<T> {
    const store: AutomationLockStore | undefined = storage.getStore();
    // 已经持锁（store.active）时一律就地执行，detached 也不例外：
    // detached 的用途只有一个 —— 定时器继承了**已结束**任务的异步上下文（active=false），
    // 那时必须重新排队。若持有者此刻正 await 这个 detached 子任务，重新排队会排到持有者
    // 自己后面，队列永远等不到它结束，整个进程的自动化全部卡死。就地执行最差只是少让一次锁。
    // 用 .then 包一层：taskFn 同步抛错时也要变成 rejected Promise，
    // 否则调用方惯用的 .catch(() => null) 接不住，异常会冒泡打断本轮调度。
    if (store && store.exclusive && (store.active || !options.detached)) return Promise.resolve().then(taskFn);

    const run = tail.then(async () => {
        running = true;
        const taskStore: AutomationLockStore = { exclusive: true, active: true };
        try {
            return await storage.run(taskStore, taskFn);
        } finally {
            taskStore.active = false;
            running = false;
        }
    });
    tail = run.then(() => undefined, () => undefined);
    return run;
}

function isAutomationTaskRunning(): boolean {
    return running;
}

module.exports = {
    runExclusiveAutomationTask,
    isAutomationTaskRunning,
};
