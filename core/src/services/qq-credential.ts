export {};
/**
 * QQ 账号启动前的 Code 重签（尽力而为）。
 *
 * 游戏登录 Code 是一次性的：worker 用它建立 WS 连接后即被服务端消费，
 * accounts.json 里保存的永远是「上一次用过的旧值」，因此服务重启后
 * 直接拿旧 Code 连接会被网关以 400 拒绝，表现就是「必须重新扫码/填 Code」。
 *
 * 标准 qq-miniapp-auth 服务的 /api/qq/miniapp/code 必须携带扫码产生的
 * taskId（任务 2 分钟过期、取码后会注销 QQ 会话），无法免扫码续期；
 * 但仓库内置 NapCat 插件的 /miniapp 端点可以凭当前已登录会话直接签发 Code。
 *
 * 因此这里做一次轻量探测：带空 taskId 请求，标准服务会立即返回
 * TASK_EXPIRED（参数校验阶段即返回，不会进入等待授权流程），此时标记
 * 「该服务不支持免扫码重签」并静默回退；支持的服务则返回新 Code 并写回账号。
 * 整个过程失败不影响原有启动流程，也不会占用扫码工作流。
 */

const axios = require('axios').default;
const store = require('../models/store');

const QQ_MINIAPP_APP_ID = '1112386029';
const REQUEST_TIMEOUT_MS = 2500;
const UNSUPPORTED_CODES = /^(?:TASK_EXPIRED|LOGIN_REQUIRED|LOGOUT_REQUIRED|WORKFLOW_BUSY|INVALID_SIGNATURE|SIGNATURE_REQUIRED)$/i;

export interface QqCodeRefreshResult {
    ok: boolean;
    code?: string;
    error?: string;
    /** 未启用 QQ 扫码服务或该服务不支持免扫码重签。 */
    skipped?: boolean;
}

let unsupported = false;

function extractCode(data: any): string {
    if (!data || typeof data !== 'object' || data.ok === false) return '';
    return String(data.code || (data.data && data.data.code) || '').trim();
}

function loginSettings(): any {
    const settings = typeof store.getLoginSettings === 'function' ? store.getLoginSettings() : null;
    if (!settings || settings.qqQrLogin !== true) return null;
    const endpoint = String(settings.napCatEndpoint || '').trim().replace(/\/+$/, '');
    const signature = String(settings.napCatSignature || '').trim();
    if (!endpoint || !signature) return null;
    return { endpoint, signature };
}

/** 仅供测试重置进程内的「服务不支持」标记。 */
function resetQqCodeRefreshState(): void {
    unsupported = false;
}

async function tryRefreshQqGameCode(accountId: unknown): Promise<QqCodeRefreshResult> {
    if (unsupported) return { ok: false, skipped: true, error: '当前 QQ 授权服务不支持免扫码重签' };
    const settings = loginSettings();
    if (!settings) return { ok: false, skipped: true, error: '未启用 QQ 扫码服务' };

    const accounts = (store.getAccounts().accounts || []);
    const account = accounts.find((item: any) => String(item.id) === String(accountId));
    if (!account) return { ok: false, error: '账号不存在' };

    // 仓库内置 NapCat 插件走 /miniapp；外部服务默认走 /api/qq/miniapp/code。
    // 可用 FARM_QQ_CODE_REFRESH_PATH 显式指定端点路径。
    const path = String(process.env.FARM_QQ_CODE_REFRESH_PATH || '/api/qq/miniapp/code').trim();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-API-Signature': settings.signature,
    };
    // 内置插件使用 Bearer token 鉴权；未额外配置时省略，由插件自行放行。
    const pluginToken = String(process.env.FARM_NAPCAT_PLUGIN_TOKEN || '').trim();
    if (pluginToken) headers.Authorization = `Bearer ${pluginToken}`;

    try {
        const response = await axios.post(`${settings.endpoint}${path}`, {
            appId: QQ_MINIAPP_APP_ID,
            taskId: '',
            uin: String(account.uin || account.qq || '').trim(),
        }, {
            timeout: REQUEST_TIMEOUT_MS,
            validateStatus: () => true,
            headers,
        });
        const data = response?.data;
        const code = extractCode(data);
        if (code) {
            store.addOrUpdateAccount({ id: String(account.id), code });
            return { ok: true, code };
        }
        const reason = String(data?.code || data?.error || '').trim();
        // 标准服务明确不支持时不再重复探测，避免每次启动都发无效请求。
        if (data?.ok === false || UNSUPPORTED_CODES.test(reason)) unsupported = true;
        return { ok: false, skipped: unsupported, error: reason || 'QQ 授权服务未返回新 Code' };
    }
    catch (error: any) {
        return { ok: false, error: String((error && error.message) || 'QQ Code 重签请求失败') };
    }
}

module.exports = {
    QQ_MINIAPP_APP_ID,
    tryRefreshQqGameCode,
    resetQqCodeRefreshState,
};
