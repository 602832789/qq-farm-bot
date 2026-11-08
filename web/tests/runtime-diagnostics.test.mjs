import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const coreRoot = resolve(root, '../core')
const read = p => readFileSync(p, 'utf8')

const card = read(resolve(root, 'src/components/RuntimeDiagnosticsCard.vue'))
const store = read(resolve(root, 'src/stores/runtime-diagnostics.ts'))
const utils = read(resolve(root, 'src/utils/runtime-diagnostics.ts'))
const dashboard = read(resolve(root, 'src/views/Dashboard.vue'))
const service = read(resolve(coreRoot, 'src/services/runtime-diagnostics.ts'))
const routes = read(resolve(coreRoot, 'src/controllers/admin/runtime-diagnostics-routes.ts'))
const adminIndex = read(resolve(coreRoot, 'src/controllers/admin/index.ts'))
const scheduler = read(resolve(coreRoot, 'src/services/scheduler.ts'))
const worker = read(resolve(coreRoot, 'src/core/worker.ts'))

test('后端采集 CPU / 堆内存 / 事件循环 P99 / 队列与 10 分钟窗口', () => {
  assert.match(service, /process\.cpuUsage\(\)/)
  assert.match(service, /process\.memoryUsage\(\)/)
  assert.match(service, /computePercentile\(loopLags, 99\)/)
  assert.match(service, /WINDOW_MS = 10 \* 60 \* 1000/)
  assert.match(service, /DEFAULT_QUEUE_CAPACITY = 256/)
  assert.match(service, /completed10m|failed10m|timeout10m/)
  assert.match(service, /label: '队列空闲'/)
  assert.match(service, /readProcessMetrics/)
})

test('调度器与账号 Worker 均有真实埋点', () => {
  assert.match(scheduler, /trackScheduledTask\(\(\) => runWithRequestClass/)
  assert.match(worker, /processMetrics: readProcessMetrics\(\)/)
  assert.match(service, /trackScheduledTask/)
})

test('API 注册到 admin server 并带 Worker 读数缓存', () => {
  assert.match(routes, /app\.get\('\/api\/runtime-diagnostics'/)
  assert.match(routes, /WORKER_CACHE_MS = 5000/)
  assert.match(routes, /getSchedulerStatus\(accountId\)/)
  assert.match(adminIndex, /mountRuntimeDiagnosticsRoutes\(app, ctx\)/)
  assert.match(adminIndex, /startRuntimeDiagnostics\(\)/)
})

test('store 使用同一 API 且防止旧响应覆盖', () => {
  assert.match(store, /api\.get\('\/api\/runtime-diagnostics'/)
  assert.match(store, /const current = \+\+sequence/)
  assert.match(store, /if \(current !== sequence\)\s+return/)
  assert.match(store, /getApiErrorMessage/)
})

test('卡片完整呈现截图里的四块指标与汇总', () => {
  for (const label of ['当前排队', 'CPU · 区间平均', '账号堆内存 · 当前', '事件循环 P99 · 区间', '近 10 分钟完成', '更多指标', '队列空闲']) {
    assert.ok(card.includes(label) || service.includes(label), `缺少 ${label}`)
  }
  assert.match(card, /近 10 分钟峰值 \{\{ formatInteger\(queue\.peak10m\) \}\} 项/)
  assert.match(card, /近 10 分钟完成[\s\S]*?失败[\s\S]*?排队超时/)
  assert.match(card, /snap\?\.updatedAt \|\| '--:--:--'/)
  assert.match(card, /:class="`is-\$\{status\.tone\}`"/)
})

test('两张迷你趋势图：堆内存面积折线 + P99 警戒虚线', () => {
  assert.match(card, /buildSparkline\(heap\.value\.series\)/)
  assert.match(card, /buildSparkline\(loop\.value\.series, \{ baseline: loop\.value\.thresholdMs \|\| 50 \}\)/)
  assert.match(card, /rd-spark__area/)
  assert.match(card, /rd-spark__threshold/)
  assert.match(card, /rd-spark__dot/)
})

test('更多指标可展开，展示峰值 / RSS / 调度器 / 账号 Worker', () => {
  assert.match(card, /@click="expanded = !expanded"/)
  assert.match(card, /v-if="expanded"/)
  for (const key of ['CPU 峰值', '堆内存峰值', 'P99 峰值', '队列峰值', '进程 RSS', '账号 Worker 堆', '采样点']) {
    assert.ok(card.includes(key), `缺少 ${key}`)
  }
})

test('10 秒自动刷新并处理加载错误与空数据', () => {
  assert.match(card, /const REFRESH_MS = 10000/)
  assert.match(card, /useIntervalFn\(/)
  assert.match(card, /onMounted\(\(\) => \{[\s\S]*?fetchDiagnostics\(\)/)
  assert.match(card, /v-if="diagnosticsStore\.error"/)
  assert.match(card, /等待采样/)
})

test('卡片挂到首页右侧列，位于自动巡查与今日统计之间', () => {
  assert.match(dashboard, /import RuntimeDiagnosticsCard from '@\/components\/RuntimeDiagnosticsCard\.vue'/)
  const checks = dashboard.indexOf('自动巡查：旧版四项倒计时')
  const diag = dashboard.indexOf('<RuntimeDiagnosticsCard />')
  const stats = dashboard.indexOf('<!-- Operations Grid -->')
  assert.ok(checks > 0 && diag > checks && stats > diag, '运行诊断卡片位置不正确')
})

test('手机端与暗色主题均有适配', () => {
  assert.match(card, /@media \(max-width: 640px\)/)
  assert.match(card, /\.dark \.rd-tile/)
  assert.match(card, /\.dark \.rd-track/)
  assert.match(card, /var\(--ui-ink\)/)
  assert.match(card, /var\(--theme-primary\)/)
})

test('sparkline 工具处理空序列、单点序列与基线', () => {
  assert.match(utils, /const single = clean\[0\] \?\? 0/)
  assert.match(utils, /const series: number\[\] = clean\.length >= 2 \? clean : \[single, single\]/)
  assert.match(utils, /if \(max - min < 0\.001\)/)
  assert.match(utils, /baselineY: baseline === undefined \? -1 : toY\(baseline\)/)
  assert.match(utils, /export function formatUptime/)
})

test('指标全部来自接口，不硬编码截图数值', () => {
  for (const fake of ['29.0 MB', '4.6%', '20.5 ms', '296 项']) {
    assert.equal(card.includes(fake), false, `不应硬编码 ${fake}`)
  }
})
