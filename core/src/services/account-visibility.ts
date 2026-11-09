export {};
/**
 * 账号列表接口（/api/accounts）的对外投影。
 *
 * 该接口被浏览器每 10 秒轮询一次，历史上直接把 store 里的账号对象整个
 * 返回，等于把 refreshtoken / accesstoken / loginBuffer 这些能直接换游戏
 * 登录 Code 的长效凭证明文送到浏览器（F12 网络面板可见）。这里改成只对外
 * 暴露一个布尔能力标记 wxPreflightSupported，判定由调用方注入，与
 * wx-keepalive 使用的 hasWxCredential 保持同一口径，浏览器既拿不到明文，
 * 又能直接显示「免扫码续期：支持 / 不支持」。
 *
 * 注意：只作用于 HTTP 响应副本，provider.getAccounts() 及其他后端调用方
 * 仍然拿到完整账号对象，续期 / 补 Code / 启动换码逻辑不受影响。
 */

const PRIVATE_CREDENTIAL_KEYS = ['refreshtoken', 'accesstoken', 'loginBuffer'] as const;

type CanPreflight = (account: any) => boolean;

function toPublicAccount(account: any, canPreflight: CanPreflight): any {
    const safe: any = { ...(account || {}) };
    for (const key of PRIVATE_CREDENTIAL_KEYS) delete safe[key];
    safe.wxPreflightSupported = typeof canPreflight === 'function' ? !!canPreflight(account) : false;
    return safe;
}

function toPublicAccountsData(data: any, canPreflight: CanPreflight): any {
    const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
    return {
        ...(data || {}),
        accounts: accounts.map((account: any) => toPublicAccount(account, canPreflight)),
    };
}

module.exports = {
    PRIVATE_CREDENTIAL_KEYS,
    toPublicAccount,
    toPublicAccountsData,
};
