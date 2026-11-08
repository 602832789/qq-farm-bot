/** 运行诊断卡片的纯展示逻辑：迷你趋势图路径、指标格式化。 */
export interface SparklineGeometry {
  line: string
  area: string
  lastX: number
  lastY: number
  baselineY: number
  min: number
  max: number
}

export interface SparklineOptions {
  width?: number
  height?: number
  padding?: number
  /** 虚线参考值（事件循环 P99 的警戒线），会纳入纵轴范围。 */
  baseline?: number
}

export function buildSparkline(rawSeries: number[], options: SparklineOptions = {}): SparklineGeometry {
  const width = options.width ?? 240
  const height = options.height ?? 48
  const padding = options.padding ?? 4
  const baseline = options.baseline
  const clean: number[] = (rawSeries || []).filter(v => Number.isFinite(v) && v >= 0)
  const single = clean[0] ?? 0
  const series: number[] = clean.length >= 2 ? clean : [single, single]

  let min = Math.min(...series)
  let max = Math.max(...series)
  if (baseline !== undefined && Number.isFinite(baseline)) {
    min = Math.min(min, baseline)
    max = Math.max(max, baseline)
  }
  if (max - min < 0.001) {
    max = min + 1
  }
  const plotWidth = Math.max(1, width - padding * 2)
  const plotHeight = Math.max(1, height - padding * 2)
  const toY = (value: number) => padding + plotHeight - ((value - min) / (max - min)) * plotHeight
  const points = series.map((value, index) => ({
    x: padding + (index / (series.length - 1)) * plotWidth,
    y: toY(value),
  }))
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const baseY = padding + plotHeight
  const first = points[0] ?? { x: padding, y: baseY }
  const last = points[points.length - 1] ?? { x: padding + plotWidth, y: baseY }
  return {
    line,
    area: `${line} L${last.x.toFixed(1)},${baseY.toFixed(1)} L${first.x.toFixed(1)},${baseY.toFixed(1)} Z`,
    lastX: last.x,
    lastY: last.y,
    baselineY: baseline === undefined ? -1 : toY(baseline),
    min,
    max,
  }
}

export function formatMetric(value: unknown, digits = 1, suffix = ''): string {
  const n = Number(value)
  return Number.isFinite(n) ? `${n.toFixed(digits)}${suffix}` : `--${suffix}`
}

export function formatInteger(value: unknown, suffix = ''): string {
  const n = Number(value)
  return Number.isFinite(n) ? `${Math.round(n)}${suffix}` : `--${suffix}`
}

export function formatUptime(seconds: unknown): string {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0)
    return `${hours} 小时 ${minutes} 分`
  if (minutes > 0)
    return `${minutes} 分 ${secs} 秒`
  return `${secs} 秒`
}
