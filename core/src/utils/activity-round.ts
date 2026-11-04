import { AsyncLocalStorage } from 'node:async_hooks';

export {};

/**
 * 活动轮次作用域（一轮只读一次组数据再分发）。
 *
 * 活动自动化一轮会依次跑奶茶 9 个 op + 分享 3 个 op，每个 op 过去都会自己拉一遍
 * GetGroup / 背包 / 页面数据，一轮下来重复读几十次，把 60s 请求预算吃满。
 *
 * 这里用 AsyncLocalStorage 做「轮次上下文」：
 * - 轮内（withActivityRound 的调用栈）按 key 命中同一份读结果，只发一次请求；
 * - 轮外（面板手动操作、REST 接口、脚本、单测）完全直连，永远读实时数据；
 * - 写操作成功后调用 invalidateActivityRound(prefix) 失效，下一个 op 重新读一次最新状态，
 *   所以不会拿陈旧数据做决策。
 */
const roundStorage = new AsyncLocalStorage<Map<string, Promise<any>>>();

/** 在活动轮次作用域内运行 fn：作用域内的 readActivityRound 共享缓存。 */
function withActivityRound<T>(fn: () => Promise<T>): Promise<T> {
    return roundStorage.run(new Map<string, Promise<any>>(), fn);
}

/** 当前调用栈是否在活动轮次内（面板/手动操作返回 false，走直连）。 */
function isInActivityRound(): boolean {
    return roundStorage.getStore() != null;
}

/**
 * 轮内按 key 读取并缓存；轮外直接执行 loader。
 * 同一个 key 并发读取会复用同一个 Promise（单飞）；失败不缓存，便于下一个 op 重试。
 */
async function readActivityRound<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const store = roundStorage.getStore();
    if (!store) return loader();
    const cached = store.get(key);
    if (cached) return cached as Promise<T>;
    const pending = (async () => loader())();
    store.set(key, pending);
    try {
        return await pending;
    } catch (error) {
        // 轮次可能已经结束（异步边界穿越），只在同一个 store 且仍是同一请求时清理。
        if (roundStorage.getStore() === store && store.get(key) === pending) store.delete(key);
        throw error;
    }
}

/** 写操作后失效：给前缀只清该前缀，不给则清空整轮。 */
function invalidateActivityRound(prefix?: string): void {
    const store = roundStorage.getStore();
    if (!store) return;
    if (!prefix) {
        store.clear();
        return;
    }
    for (const key of Array.from(store.keys())) {
        if (key.startsWith(prefix)) store.delete(key);
    }
}

module.exports = {
    withActivityRound,
    isInActivityRound,
    readActivityRound,
    invalidateActivityRound,
};
