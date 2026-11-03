export {};
/**
 * 账号保活（微信账号）。
 *
 * - 定时重登：每隔 N 分钟续期一次微信授权并重启账号，避免 Code / accessToken 过期掉线。
 * - 掉线重登：账号因断开或被踢下线而停止后，等待 N 秒自动续期并重新启动。
 * 两种模式都只对“具备微信刷新凭证”的账号生效；扫描时未回传 refreshtoken 的账号只能重新扫码。
 */

const store = require('../models/store');
const { normalizeAutoCodeRefresh, DEFAULT_AUTO_CODE_REFRESH } = require('../config/config');
const { refreshAccountCredential, hasWxCredential } = require('./wx-credential');

const TICK_MS = 30_000;

interface KeepAliveDeps {
    restartWorker?: (account: any) => void;
    isAccountRunning?: (accountId: string) => boolean;
    log?: (tag: string, msg: string, extra?: any) => void;
    addAccountLog?: (action: string, msg: string, accountId?: string, accountName?: string, extra?: any) => void;
}

let deps: KeepAliveDeps = {};
let timer: any = null;
let running = false;
/** 上一轮定时重登的时间；首次进入时从当前时间起算，避免一启动就集体重登。 */
const lastRefreshAt = new Map<string, number>();
const inFlight = new Set<string>();
const offlineTimers = new Map<string, any>();

function log(tag: string, msg: string, extra: any = {}): void {
    if (typeof deps.log === 'function') deps.log(tag, msg, extra);
}

function addAccountLog(action: string, msg: string, accountId: string, accountName: string, extra: any = {}): void {
    if (typeof deps.addAccountLog === 'function') deps.addAccountLog(action, msg, accountId, accountName, extra);
}

function getConfig(): any {
    return normalizeAutoCodeRefresh(store.getSystemConfig?.()?.autoCodeRefresh || DEFAULT_AUTO_CODE_REFRESH);
}

function listWxAccounts(): any[] {
    return (store.getAccounts().accounts || []).filter((account: any) => String(account.platform || '') === 'wx');
}

function findAccount(accountId: unknown): any {
    return (store.getAccounts().accounts || []).find((account: any) => String(account.id) === String(accountId)) || null;
}

function isRunning(accountId: unknown): boolean {
    if (typeof deps.isAccountRunning !== 'function') return false;
    try {
        return !!deps.isAccountRunning(String(accountId));
    } catch {
        return false;
    }
}

/**
 * 续期 + 按需重启。同一账号同时只允许一个续期任务，避免滚动 token 互相覆盖。
 */
async function refreshAndMaybeRestart(accountId: unknown, reason: 'timer' | 'offline' | 'manual'): Promise<boolean> {
    const key = String(accountId);
    if (inFlight.has(key)) return false;
    const account = findAccount(key);
    if (!hasWxCredential(account)) return false;
    inFlight.add(key);
    try {
        const result = await refreshAccountCredential(key);
        lastRefreshAt.set(key, Date.now());
        if (!result.ok) {
            const message = `账号 ${result.accountName} 续期失败：${result.error || '未知错误'}`;
            log('错误', message, { accountId: key, accountName: result.accountName, reason });
            addAccountLog('auto_code_refresh_failed', message, key, result.accountName, { reason });
            return false;
        }
        const message = `账号 ${result.accountName} 微信授权已续期`;
        log('系统', message, { accountId: key, accountName: result.accountName, reason });
        addAccountLog('auto_code_refresh', message, key, result.accountName, { reason });

        // 定时重登与掉线重登都需要立刻用新 Code 重新上线；手动续期只更新 Code。
        const shouldRestart = reason !== 'manual' && typeof deps.restartWorker === 'function';
        if (shouldRestart) {
            const latest = findAccount(key);
            if (latest) {
                try {
                    deps.restartWorker!(latest);
                } catch (error: any) {
                    log('错误', `账号 ${result.accountName} 重启失败: ${error?.message || error}`, { accountId: key });
                }
            }
        }
        return true;
    } finally {
        inFlight.delete(key);
    }
}

function tick(): void {
    if (running) return;
    running = true;
    try {
        const config = getConfig();
        if (!config.enabled) return;
        const intervalMs = Math.max(1, Number(config.intervalMinutes) || 60) * 60_000;
        const now = Date.now();
        for (const account of listWxAccounts()) {
            const key = String(account.id);
            if (!hasWxCredential(account) || !isRunning(key)) {
                lastRefreshAt.delete(key);
                continue;
            }
            const last = lastRefreshAt.get(key);
            if (!last) {
                lastRefreshAt.set(key, now);
                continue;
            }
            if (now - last < intervalMs) continue;
            lastRefreshAt.set(key, now);
            void refreshAndMaybeRestart(key, 'timer');
        }
    } finally {
        running = false;
    }
}

/** 账号掉线（断开 / 被踢下线）时调用；按配置延时续期并重启。 */
function notifyAccountOffline(accountId: unknown, reason = 'offline'): void {
    const key = String(accountId);
    const config = getConfig();
    if (!config.offlineEnabled) return;
    const account = findAccount(key);
    if (!hasWxCredential(account)) return;
    if (offlineTimers.has(key)) return;
    const delayMs = Math.max(1, Number(config.offlineDelaySeconds) || 60) * 1000;
    log('系统', `账号 ${account?.name || key} 掉线，${Math.round(delayMs / 1000)} 秒后尝试自动续期重登`, {
        accountId: key,
        accountName: account?.name || '',
        reason,
    });
    const handle = setTimeout(() => {
        offlineTimers.delete(key);
        const latest = findAccount(key);
        if (!latest || isRunning(key)) return;
        void refreshAndMaybeRestart(key, 'offline');
    }, delayMs);
    if (typeof handle.unref === 'function') handle.unref();
    offlineTimers.set(key, handle);
}

function startWxKeepAlive(options: KeepAliveDeps = {}): void {
    deps = { ...deps, ...options };
    if (timer) return;
    timer = setInterval(tick, TICK_MS);
    if (typeof timer.unref === 'function') timer.unref();
    const config = getConfig();
    log('系统', `账号保活已启动：定时重登${config.enabled ? `每 ${config.intervalMinutes} 分钟` : '关闭'}，掉线重登${config.offlineEnabled ? `等待 ${config.offlineDelaySeconds} 秒` : '关闭'}`);
}

function stopWxKeepAlive(): void {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    for (const handle of offlineTimers.values()) clearTimeout(handle);
    offlineTimers.clear();
    lastRefreshAt.clear();
    inFlight.clear();
}

/** 配置变更后重新校准：关闭定时重登时清空计时，重新开启从当前时间重新计数。 */
function applyWxKeepAliveConfig(): void {
    lastRefreshAt.clear();
    const config = getConfig();
    log('系统', `账号保活配置已更新：定时重登${config.enabled ? `每 ${config.intervalMinutes} 分钟` : '关闭'}，掉线重登${config.offlineEnabled ? `等待 ${config.offlineDelaySeconds} 秒` : '关闭'}`);
}

module.exports = {
    startWxKeepAlive,
    stopWxKeepAlive,
    applyWxKeepAliveConfig,
    notifyAccountOffline,
    refreshAndMaybeRestart,
    getConfig,
};
