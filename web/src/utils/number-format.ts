export type ResourceCurrency = 'gold' | 'coupon' | 'goldBean'

const WAN_UNIT = '万'
const YI_UNIT = '亿'
const WAN_THRESHOLD = 10000
const YI_THRESHOLD = 100000000

function toFiniteNumber(value: unknown) {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function formatCompactAmount(value: unknown) {
  const amount = toFiniteNumber(value)
  const absAmount = Math.abs(amount)
  if (absAmount >= YI_THRESHOLD)
    return `${(amount / YI_THRESHOLD).toFixed(2)}${YI_UNIT}`
  if (absAmount >= WAN_THRESHOLD)
    return `${(amount / WAN_THRESHOLD).toFixed(2)}${WAN_UNIT}`
  return amount.toLocaleString('zh-CN')
}

export function formatGoldAmount(value: unknown) {
  return formatCompactAmount(value)
}

export function formatCouponAmount(value: unknown) {
  return formatCompactAmount(value)
}

export function formatGoldBeanAmount(value: unknown) {
  return formatCompactAmount(value)
}

export function formatCurrencyAmount(value: unknown, currency: ResourceCurrency) {
  if (currency === 'gold')
    return formatGoldAmount(value)
  return formatCompactAmount(value)
}

export function formatCurrencyAmountByLabel(value: unknown, label: string) {
  const text = String(label || '')
  if (text.includes('金币'))
    return formatGoldAmount(value)
  if (text.includes('点券') || text.includes('金豆豆'))
    return formatCompactAmount(value)
  return toFiniteNumber(value).toLocaleString('zh-CN')
}
