/**
 * 账号管理页「访问凭证」状态判定。
 *
 * 拆成纯函数是为了能单测，也避免 .vue 里的时间单位/历史失败标记把刚重新
 * 扫码登录的账号误染成「待续期」的琥珀色。
 */

const COLOR_GREEN = 'text-green-600 dark:text-green-400'
const COLOR_AMBER = 'text-amber-600 dark:text-amber-400'
const COLOR_RED = 'text-red-600 dark:text-red-400'
const COLOR_GRAY = 'text-gray-500'

const WARNING_WINDOW_MS = 45 * 60_000
const DEFAULT_TTL_SECONDS = 7200

export interface CredentialStatus {
  text: string
  color: string
}

/** 兼容秒级 / 毫秒级到期时间戳；老数据可能由外部写成秒。 */
function normalizeExpiry(value: number): number {
  if (!Number.isFinite(value) || value <= 0)
    return 0
  return value < 1e11 ? value * 1000 : value
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor(seconds / 60) % 60
  const s = seconds % 60
  return `${h} 小时 ${m} 分 ${String(s).padStart(2, '0')} 秒`
}

export function getCredentialStatus(acc: any, now: number = Date.now()): CredentialStatus {
  const rawExpiresAt = Number(acc?.expires_at)
  const refreshedAt = Number(acc?.wxCredentialRefreshedAt) || 0
  const lastAttemptAt = Number(acc?.wxCredentialLastAttemptAt) || 0
  const ttlSeconds = Number(acc?.expires_in) > 0 ? Number(acc.expires_in) : DEFAULT_TTL_SECONDS

  let expiresAt = normalizeExpiry(rawExpiresAt)
  if (!expiresAt) {
    if (!refreshedAt)
      return { text: '访问凭证：到期时间未知', color: COLOR_GRAY }
    if (refreshedAt > now)
      return { text: '访问凭证：时间异常', color: COLOR_RED }
    // 旧账号没有 expires_at：用最近一次成功续期时间 + TTL 兜底。
    expiresAt = refreshedAt + ttlSeconds * 1000
  }
  else if (refreshedAt > 0 && refreshedAt <= now) {
    // 重新扫码 / 换 Code 后若仍留着旧的（已过期或即将过期）到期时间，
    // 以最近一次成功时间重新起算，避免刚登录就显示黄色或红色。
    expiresAt = Math.max(expiresAt, refreshedAt + ttlSeconds * 1000)
  }

  // 失败标记只在「最近一次失败晚于最近一次成功」时才生效。
  // 历史错误不应让一次已经成功的新扫码继续显示待续期颜色。
  const hasError = !!String(acc?.wxCredentialRefreshError || '').trim()
  const warning = hasError && lastAttemptAt > refreshedAt

  const remaining = expiresAt - now
  const seconds = Math.max(0, Math.ceil(remaining / 1000))
  const nearExpiry = remaining > 0 && remaining <= WARNING_WINDOW_MS

  return {
    text: remaining <= 0
      ? '访问凭证：已过期'
      : `访问凭证：剩余 ${formatDuration(seconds)}${nearExpiry ? ' · 待续期' : ''}${warning ? ' · 上次续期失败' : ''}`,
    color: remaining <= 0
      ? COLOR_RED
      : warning || nearExpiry
        ? COLOR_AMBER
        : COLOR_GREEN,
  }
}
