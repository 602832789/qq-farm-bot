export {};
/**
 * 微信访问凭证「还剩多久到期」的纯计算。
 *
 * 只服务后端 keepalive：`wx-keepalive` 用它判断是否进入到期前 5 分钟的滚令牌窗口。
 *
 * **这里不再有「Code 健康等级 / 能否自动补 Code」这类概念** —— 账号管理页的
 * Code 自动监听已整条移除。那套逻辑会在到期前 10 分钟就换 Code、并
 * `restartAccount` 重启运行中的账号，与后端「只滚 token、不重启连接」的设计
 * 直接冲突：每 2 小时一张卡片闪一次掉线，还会额外消耗一次性 refreshtoken。
 * 现在换 Code 只发生在两个明确的时机：掉线重登（后端自动）与用户手动补码。
 */

const DEFAULT_TTL_SECONDS = 7200;

/** 兼容秒级 / 毫秒级到期时间戳；老数据可能由外部写成秒。 */
function normalizeExpiry(value: unknown): number {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return raw < 1e11 ? raw * 1000 : raw;
}

/**
 * 微信账号的访问凭证剩余毫秒数；0 表示已过期，或者根本没有到期信息
 * （两种情况下 keepalive 都值得尝试滚一次 token）。
 *
 * 到期时间优先用 `expires_at`，缺失时按「最近一次真正滚动 token 的时间 + TTL」补算；
 * 两者都有时取较晚的那个 —— 重新扫码 / 换 Code 后旧到期时间可能还留着，
 * 按最近一次成功时间重新起算才不会把刚续期的账号立刻判成待续期。
 *
 * 两个字段都可能是脏数据（老版本写过秒级、外部工具写进 Infinity / 文本）：
 * expires_at 走 normalizeExpiry 过滤；refreshedAt 靠最后一道 `Number.isFinite(expiresAt)`
 * 兜住 —— 否则 `Infinity + TTL` 仍是 Infinity，keepalive 会以为「还剩无限久」，
 * 到期前再也不滚令牌，账号直接过期掉线。
 */
export function wxCredentialRemainingMs(account: any, now: number = Date.now()): number {
    const refreshedAt = Number(account && account.wxCredentialRefreshedAt) || 0;
    const ttlSeconds = Number(account && account.expires_in) > 0 ? Number(account.expires_in) : DEFAULT_TTL_SECONDS;
    let expiresAt = normalizeExpiry(account && account.expires_at);
    if (!expiresAt && refreshedAt) expiresAt = refreshedAt + ttlSeconds * 1000;
    else if (expiresAt && refreshedAt > 0 && refreshedAt <= now) {
        expiresAt = Math.max(expiresAt, refreshedAt + ttlSeconds * 1000);
    }
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) return 0;
    if (!Number.isFinite(now)) return 0;
    return Math.max(0, expiresAt - now);
}

module.exports = {
    wxCredentialRemainingMs,
};
