export {};
/**
 * 账号保活（微信账号）。
 *
 * - 到期前预防性续期（常开）：后端自主按 expires_at 在到期前主动滚动续期并重启，
 *   不依赖浏览器是否打开、也不依赖用户是否停在「账号管理」页。这是老版本
 *   auto-code-refresh 的「后端 scheduler + onlyIfDue 只在到期前刷」思路，
 *   执行器换成现版本更稳的 refreshAccountCredential（自带同账号串行锁、
 *   滚动 token 落盘、expires_at 写回）。
 * - 定时重登（可选）：每隔 N 分钟续期一次微信授权并重启账号。
 * - 掉线重登（可选）：账号因断开或被踢下线而停止后，等待 N 秒自动续期并重新启动。
 *
 * 所有模式都只对“具备微信刷新凭证（wxid + refreshtoken）”的账号生效；
 * 扫码时未回传 refreshtoken、仅有 loginBuffer 的账号无法滚动续期，仍需重新扫码。
 */

const store = require('../models/store');
const { normalizeAutoCodeRefresh, DEFAULT_AUTO_CODE_REFRESH } = require('../config/config');
const { refreshAccountCredential, hasWxCredential } = require('./wx-credential');
const { inspectAccountCodeHealth } = require('./code-watch');

/** 30 秒巡检一次，比老版本 wx_keepalive 的 60 秒更勤；成功续期会推进 expires_at，不会重复刷。 */
const TICK_MS = 30_000;
/** 到期前预警窗口：与 code-watch.WARNING_WINDOW_MS、老版本 WX_CREDENTIAL_REFRESH_WINDOW_MS 一致。 */
const PREFLIGHT_WINDOW_MS = 45 * 60_000;
/** 老版本 MAX_DAILY_RECOVERIES：按 UTC+8 自然日限制单账号主动续期次数，避免打爆续期接口。 */
const MAX_DAILY_PREFLIGHT = 8;
/** 老版本 MAX_CONSECUTIVE_FAILURES：连续失败熔断。 */
const MAX_CONSECUTIVE_FAILURES = 3;
/** 老版本 WX_CREDENTIAL_RETRY_MS：失败后 5 分钟内不重复打续期接口。 */
const PREFLIGHT_RETRY_MS = 5 * 60_000;

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

interface PreflightState {
    date: string;
    attempts: number;
    failures: number;
    lastAttemptAt: number;
}

/**
 * 到期前预防性续期的限速 / 熔断状态机。移植老版本 auto-code-refresh.js 的
 * MAX_DAILY_RECOVERIES(8) / MAX_CONSECUTIVE_FAILURES(3) 与 UTC+8 自然日计数，
 * 失败后再叠加 5 分钟冷却，避免反复消耗一次性 refreshtoken。
 */
function createPreflightGovernor(nowFn: () => number = Date.now) {
    const states = new Map<string, PreflightState>();
    function stateOf(id: string, now: number): PreflightState {
        const date = new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
        const existing = states.get(id);
        if (existing && existing.date === date) return existing;
        const fresh: PreflightState = { date, attempts: 0, failures: 0, lastAttemptAt: 0 };
        states.set(id, fresh);
        return fresh;
    }
    return {
        canAttempt(id: string, now: number = nowFn()): boolean {
            const state = stateOf(id, now);
            if (state.attempts >= MAX_DAILY_PREFLIGHT || state.failures >= MAX_CONSECUTIVE_FAILURES) return false;
            return !state.lastAttemptAt || now - state.lastAttemptAt >= PREFLIGHT_RETRY_MS;
        },
        recordAttempt(id: string, now: number = nowFn()): void {
            const state = stateOf(id, now);
            state.attempts += 1;
            state.lastAttemptAt = now;
        },
        recordSuccess(id: string, now: number = nowFn()): void {
            stateOf(id, now).failures = 0;
        },
        recordFailure(id: string, error: unknown, now: number = nowFn()): void {
            const state = stateOf(id, now);
            state.failures += 1;
            // 凭证已失效 / 需要重新扫码：继续重试只会反复打接口，直接熔断到当天结束。
            if (/重新扫码|凭证.*(?:失效|过期)|token.*(?:expired|invalid)/i.test(String(error || ''))) {
                state.failures = MAX_CONSECUTIVE_FAILURES;
            }
        },
        snapshot(id: string, now: number = nowFn()): PreflightState {
            return { ...stateOf(id, now) };
        },
        reset(): void { states.clear(); },
    };
}

const preflight = createPreflightGovernor();

/**
 * 与 code-watch 共用同一套到期判定（秒/毫秒兼容、以最近一次成功时间补算），
 * 避免两处逻辑分叉。remainingMs 为 0 表示已过期或暂无到期信息，都值得尝试一次。
 * 老版本 shouldRefreshWxCredential / onlyIfDue 的等价实现。
 */
function isCredentialDue(account: any, now: number = Date.now()): boolean {
    return inspectAccountCodeHealth(account, { now }).remainingMs <= PREFLIGHT_WINDOW_MS;
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
async function refreshAndMaybeRestart(accountId: unknown, reason: 'timer' | 'offline' | 'manual' | 'preflight', now: number = Date.now()): Promise<boolean> {
    const key = String(accountId);
    if (inFlight.has(key)) return false;
    const account = findAccount(key);
    if (!hasWxCredential(account)) return false;
    inFlight.add(key);
    try {
        const result = await refreshAccountCredential(key);
        lastRefreshAt.set(key, now);
        const isPreflight = reason === 'preflight';
        if (!result.ok) {
            const message = `账号 ${result.accountName} 续期失败：${result.error || '未知错误'}`;
            log('错误', message, { accountId: key, accountName: result.accountName, reason });
            if (isPreflight) preflight.recordFailure(key, result.error, now);
            addAccountLog(isPreflight ? 'auto_code_preflight_failed' : 'auto_code_refresh_failed', message, key, result.accountName, { reason });
            return false;
        }
        const message = `账号 ${result.accountName} 微信授权已续期`;
        log('系统', message, { accountId: key, accountName: result.accountName, reason });
        if (isPreflight) preflight.recordSuccess(key, now);
        addAccountLog(isPreflight ? 'auto_code_preflight' : 'auto_code_refresh', message, key, result.accountName, { reason });

        // 预防性续期 / 定时重登 / 掉线重登都要立刻用新 Code 重新上线；手动续期只更新 Code。
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

/**
 * 常开的到期前预防性续期通道。返回被触发的账号 id，便于回归测试断言。
 * 与「定时重登」共享 inFlight / lastRefreshAt / 账号串行锁，因此用户即使开了
 * 定时重登也不会重复刷新；滚动续期成功后 expires_at 推进，下一轮自然跳过。
 */
function runCodePreflight(now: number = Date.now()): Promise<string[]> {
    const triggered: string[] = [];
    const tasks: Promise<boolean>[] = [];
    for (const account of listWxAccounts()) {
        const key = String(account.id);
        // 只续期「正在运行」的账号：用户手动停止的账号不能被自动拉起
        // （老版本 versions 代次锁 / manuallyStopped 的等价约束）。
        if (!hasWxCredential(account) || !isRunning(key)) continue;
        if (inFlight.has(key) || !isCredentialDue(account, now)) continue;
        if (!preflight.canAttempt(key, now)) continue;
        preflight.recordAttempt(key, now);
        triggered.push(key);
        tasks.push(refreshAndMaybeRestart(key, 'preflight', now));
    }
    return Promise.all(tasks).then(() => triggered);
}

function tick(): void {
    if (running) return;
    running = true;
    try {
        const config = getConfig();
        const now = Date.now();
        // 不受 config.enabled 控制：预防性续期默认常开，关掉网页后端照样工作。
        void runCodePreflight(now).catch(() => {});
        if (!config.enabled) return;
        const intervalMs = Math.max(1, Number(config.intervalMinutes) || 60) * 60_000;
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
    log('系统', `账号保活已启动：到期前预防性续期常开（每 ${Math.round(TICK_MS / 1000)} 秒检查、到期前 ${Math.round(PREFLIGHT_WINDOW_MS / 60000)} 分钟续期，日上限 ${MAX_DAILY_PREFLIGHT} 次 / 连续失败 ${MAX_CONSECUTIVE_FAILURES} 次熔断），定时重登${config.enabled ? `每 ${config.intervalMinutes} 分钟` : '关闭'}，掉线重登${config.offlineEnabled ? `等待 ${config.offlineDelaySeconds} 秒` : '关闭'}`);
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
    preflight.reset();
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
    runCodePreflight,
    isCredentialDue,
    createPreflightGovernor,
    getConfig,
    PREFLIGHT_WINDOW_MS,
    PREFLIGHT_RETRY_MS,
    MAX_DAILY_PREFLIGHT,
    MAX_CONSECUTIVE_FAILURES,
};
