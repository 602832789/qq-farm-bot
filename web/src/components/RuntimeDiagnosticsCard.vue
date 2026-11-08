<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'
import { useRuntimeDiagnosticsStore } from '@/stores/runtime-diagnostics'
import { buildSparkline, formatInteger, formatMetric, formatUptime } from '@/utils/runtime-diagnostics'

const diagnosticsStore = useRuntimeDiagnosticsStore()
const expanded = ref(false)
const REFRESH_MS = 10000

onMounted(() => {
  diagnosticsStore.fetchDiagnostics()
})
useIntervalFn(() => {
  diagnosticsStore.fetchDiagnostics()
}, REFRESH_MS)

const snap = computed(() => diagnosticsStore.snapshot)
const hasData = computed(() => !!snap.value)
const status = computed(() => snap.value?.status || { key: 'idle', label: '等待采样', tone: 'ok' })
const queue = computed(() => snap.value?.queue || {
  current: 0,
  capacity: 256,
  running: 0,
  peak10m: 0,
  completed10m: 0,
  failed10m: 0,
  timeout10m: 0,
})
const cpu = computed(() => snap.value?.cpu || { avgPct: 0, peakPct: 0, cores: 0, label: '进程合计' })
const heap = computed(() => snap.value?.heap || { currentMb: 0, peakMb: 0, series: [], unit: 'MB' })
const loop = computed(() => snap.value?.loop || { p99Ms: 0, peakMs: 0, thresholdMs: 50, series: [] })
const more = computed(() => snap.value?.more || {})
const heapChart = computed(() => buildSparkline(heap.value.series))
const loopChart = computed(() => buildSparkline(loop.value.series, { baseline: loop.value.thresholdMs || 50 }))
const queuePercent = computed(() => {
  const capacity = Math.max(1, Number(queue.value.capacity) || 1)
  return Math.min(100, Math.max(0, (Number(queue.value.current) / capacity) * 100))
})
const moreItems = computed(() => [
  { label: 'CPU 峰值', value: formatMetric(cpu.value.peakPct, 1, '%') },
  { label: '堆内存峰值', value: formatMetric(heap.value.peakMb, 1, ' MB') },
  { label: 'P99 峰值', value: formatMetric(loop.value.peakMs, 1, ' ms') },
  { label: '队列峰值', value: formatInteger(queue.value.peak10m, ' 项') },
  { label: '进程 RSS', value: formatMetric(more.value.rssMb, 1, ' MB') },
  { label: '进程运行', value: formatUptime(more.value.processUptimeSec) },
  { label: 'CPU 核数', value: formatInteger(cpu.value.cores) },
  { label: '调度器 / 任务', value: `${formatInteger(more.value.schedulerNamespaces)} / ${formatInteger(more.value.schedulerTasks)}` },
  { label: '运行中任务', value: formatInteger(queue.value.running) },
  { label: '采样点', value: formatInteger(more.value.sampleCount) },
  {
    label: '账号 Worker 堆',
    value: more.value.accountWorker?.heapUsedMb != null
      ? formatMetric(more.value.accountWorker.heapUsedMb, 1, ' MB')
      : '未运行',
  },
  { label: '统计窗口', value: `${Math.round((Number(snap.value?.windowMs) || 600000) / 60000)} 分钟` },
])
</script>

<template>
  <section class="rd-card farm-card rounded-2xl bg-white p-5 shadow-md dark:bg-gray-800" aria-label="运行诊断">
    <header class="rd-head">
      <h2 class="rd-title">
        <span class="i-carbon-activity" aria-hidden="true" /> <span>运行诊断</span>
      </h2>
      <span class="rd-updated" :title="hasData ? '最近采样时间' : '等待首次采样'">{{ snap?.updatedAt || '--:--:--' }}</span>
    </header>

    <div class="rd-status" :class="`is-${status.tone}`" role="status">
      <span class="rd-status__dot" aria-hidden="true" />{{ status.label }}
    </div>

    <div v-if="diagnosticsStore.error" class="rd-error">
      <span class="i-carbon-warning" aria-hidden="true" />
      <span class="rd-error__text">{{ diagnosticsStore.error }}</span>
      <button type="button" @click="diagnosticsStore.fetchDiagnostics()">
        重试
      </button>
    </div>

    <div class="rd-grid">
      <div class="rd-tile">
        <span class="rd-tile__label">当前排队</span>
        <strong class="rd-tile__value">{{ formatInteger(queue.current) }} <small>/ {{ formatInteger(queue.capacity) }}</small></strong>
        <div class="rd-track" role="progressbar" :aria-valuenow="queue.current" aria-valuemin="0" :aria-valuemax="queue.capacity">
          <span :style="{ width: `${queuePercent}%` }" />
        </div>
        <span class="rd-tile__note">近 10 分钟峰值 {{ formatInteger(queue.peak10m) }} 项</span>
      </div>

      <div class="rd-tile">
        <span class="rd-tile__label">CPU · 区间平均</span>
        <strong class="rd-tile__value">{{ hasData ? formatMetric(cpu.avgPct, 1, '%') : '-- %' }}</strong>
        <span class="rd-tile__note">{{ cpu.label }}</span>
      </div>

      <div class="rd-tile rd-tile--chart">
        <span class="rd-tile__label">账号堆内存 · 当前</span>
        <strong class="rd-tile__value">{{ hasData ? formatMetric(heap.currentMb, 1, ` ${heap.unit}`) : '-- MB' }}</strong>
        <svg class="rd-spark" viewBox="0 0 240 48" preserveAspectRatio="none" aria-hidden="true">
          <path :d="heapChart.area" class="rd-spark__area" />
          <path :d="heapChart.line" class="rd-spark__line" />
          <circle :cx="heapChart.lastX" :cy="heapChart.lastY" r="2.6" class="rd-spark__dot" />
        </svg>
      </div>

      <div class="rd-tile rd-tile--chart">
        <span class="rd-tile__label">事件循环 P99 · 区间</span>
        <strong class="rd-tile__value">{{ hasData ? formatMetric(loop.p99Ms, 1, ' ms') : '-- ms' }}</strong>
        <svg class="rd-spark" viewBox="0 0 240 48" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" :y1="loopChart.baselineY" x2="240" :y2="loopChart.baselineY" class="rd-spark__threshold" />
          <path :d="loopChart.line" class="rd-spark__line" />
          <circle :cx="loopChart.lastX" :cy="loopChart.lastY" r="2.6" class="rd-spark__dot" />
        </svg>
      </div>
    </div>

    <p class="rd-summary">
      近 10 分钟完成 <b>{{ formatInteger(queue.completed10m) }}</b> 项 · 失败 <b :class="{ 'is-bad': queue.failed10m > 0 }">{{ formatInteger(queue.failed10m) }}</b> 项 · 排队超时 <b :class="{ 'is-bad': queue.timeout10m > 0 }">{{ formatInteger(queue.timeout10m) }}</b> 项
    </p>

    <button type="button" class="rd-more-btn" :aria-expanded="expanded" @click="expanded = !expanded">
      <span>更多指标</span>
      <span class="i-carbon-chevron-right" :class="{ 'is-open': expanded }" aria-hidden="true" />
    </button>

    <div v-if="expanded" class="rd-more-grid">
      <div v-for="item in moreItems" :key="item.label" class="rd-more-item">
        <span>{{ item.label }}</span><b>{{ item.value }}</b>
      </div>
    </div>
  </section>
</template>

<style scoped>
.rd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.rd-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--ui-ink);
  font-size: 16px;
  font-weight: var(--fw-600, 600);
}

.rd-title > span:first-child {
  color: var(--theme-primary);
  font-size: 18px;
}

.rd-updated {
  color: var(--ui-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.rd-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 13px;
  font-weight: 600;
}

.rd-status.is-ok {
  color: var(--theme-primary);
}

.rd-status.is-warn {
  color: #b7791f;
}

.rd-status.is-danger {
  color: var(--ui-danger, #dc2626);
}

.rd-status__dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 16%, transparent);
}

.dark .rd-status.is-warn {
  color: #fbbf24;
}

.rd-error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 7px 9px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--ui-danger, #dc2626) 10%, transparent);
  color: var(--ui-danger, #dc2626);
  font-size: 12px;
}

.rd-error__text {
  flex: 1;
  min-width: 0;
}

.rd-error button {
  flex: none;
  text-decoration: underline;
}

.rd-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.rd-tile {
  display: flex;
  min-height: 108px;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 14px;
  background: var(--ui-surface-soft);
}

.dark .rd-tile {
  background: rgba(255, 255, 255, 0.05);
}

.rd-tile__label {
  color: var(--ui-muted);
  font-size: 12px;
}

.rd-tile__value {
  color: var(--ui-ink);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
}

.rd-tile__value small {
  color: var(--ui-muted);
  font-size: 13px;
  font-weight: 400;
}

.rd-tile__note {
  color: var(--ui-muted);
  font-size: 11px;
}

.rd-track {
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.08);
}

.dark .rd-track {
  background: rgba(255, 255, 255, 0.12);
}

.rd-track span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--theme-primary);
  transition: width 0.3s ease;
}

.rd-spark {
  width: 100%;
  height: 36px;
  margin-top: auto;
  overflow: visible;
}

.rd-spark__area {
  fill: color-mix(in srgb, var(--theme-primary) 18%, transparent);
}

.rd-spark__line {
  fill: none;
  stroke: var(--theme-primary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.rd-spark__dot {
  fill: var(--theme-primary);
}

.rd-spark__threshold {
  stroke: #e5a54b;
  stroke-width: 1.5;
  stroke-dasharray: 4 4;
  vector-effect: non-scaling-stroke;
}

.rd-summary {
  margin: 12px 0 0;
  color: var(--ui-muted);
  font-size: 12px;
  line-height: 1.6;
}

.rd-summary b {
  color: var(--ui-ink);
  font-weight: 600;
}

.rd-summary b.is-bad {
  color: var(--ui-danger, #dc2626);
}

.rd-more-btn {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 8px;
  padding: 6px;
  background: transparent;
  color: var(--ui-muted);
  font-size: 13px;
}

.rd-more-btn:hover {
  color: var(--theme-primary);
}

.rd-more-btn .is-open {
  transform: rotate(90deg);
}

.rd-more-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--ui-border);
}

.rd-more-item {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  color: var(--ui-muted);
  font-size: 11px;
}

.rd-more-item b {
  color: var(--ui-ink);
  font-weight: 600;
}

@media (max-width: 640px) {
  .rd-card {
    padding: 14px;
  }

  .rd-title {
    font-size: 15px;
  }

  .rd-grid {
    gap: 8px;
  }

  .rd-tile {
    min-height: 96px;
    padding: 10px;
    border-radius: 12px;
  }

  .rd-tile__value {
    font-size: 19px;
  }

  .rd-tile__label,
  .rd-tile__note {
    font-size: 11px;
  }

  .rd-spark {
    height: 30px;
  }

  .rd-more-grid {
    grid-template-columns: 1fr;
  }
}
</style>
