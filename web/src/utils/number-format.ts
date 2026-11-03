/**
 * 资产数字格式化（自老版 utils/number-format.ts 移植）：
 * 金币 / 点券 / 金豆达到万、亿级别时自动缩写为「万」「亿」。
 */
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
