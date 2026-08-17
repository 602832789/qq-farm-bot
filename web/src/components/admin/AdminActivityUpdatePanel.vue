<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useToastStore } from '@/stores/toast'

interface ActivityUpdateReport {
  scannedAt: number
  appId: string
  status: 'unavailable' | 'update-found' | 'up-to-date'
  source: null | { version: string, modifiedAt: number, wasmSize: number }
  candidateCount: number
  incompleteCandidates: Array<{ version: string, missing: string[] }>
  detectedActivityIds: number[]
  unknownActivityIds: number[]
  caches: Array<{ cacheListModifiedAt: number, bundles: string[] }>
  warnings: string[]
  sourceChanged?: boolean
  previousSourceVersion?: string | null
  analysis?: {
    candidateGroups: Array<{ date: string, ids: number[] }>
    requiresProtocolSample: boolean
    safeToAutoApply: boolean
    summary: string
  }
}

const toast = useToastStore()
const loading = ref(false)
const report = ref<ActivityUpdateReport | null>(null)
const error = ref('')
const intervalMs = ref(0)
const nextScanAt = ref(0)

const statusLabel = computed(() => {
  if (!report.value)
    return '尚未扫描'
  if (report.value.status === 'update-found')
    return '发现候选更新'
  if (report.value.status === 'up-to-date')
    return '未发现未知活动'
  return '扫描环境不可用'
})

const statusClass = computed(() => {
  if (report.value?.status === 'update-found')
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
  if (report.value?.status === 'up-to-date')
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200'
  return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
})

function formatTime(value?: number) {
  return value ? new Date(value).toLocaleString() : '—'
}

function formatBytes(value?: number) {
  if (!value)
    return '—'
  return `${(value / 1024 / 1024).toFixed(2)} MB`
}

async function scanUpdates() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await api.post('/api/activity/update/scan')
    if (!data.ok)
      throw new Error(data.error || '活动更新扫描失败')
    report.value = data.report
    intervalMs.value = Number(data.intervalMs) || intervalMs.value
    nextScanAt.value = Number(data.nextScanAt) || nextScanAt.value
    if (data.report?.status === 'update-found')
      toast.warning(`发现 ${data.report.unknownActivityIds.length} 个候选活动 ID`)
    else
      toast.success('活动更新扫描完成')
  }
  catch (err: any) {
    error.value = err?.response?.data?.error || err.message || '活动更新扫描失败'
  }
  finally {
    loading.value = false
  }
}

async function loadUpdateStatus() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await api.get('/api/activity/update/status')
    if (!data.ok)
      throw new Error(data.error || '读取活动更新状态失败')
    report.value = data.report || null
    intervalMs.value = Number(data.intervalMs) || 0
    nextScanAt.value = Number(data.nextScanAt) || 0
  }
  catch (err: any) {
    error.value = err?.response?.data?.error || err.message || '读取活动更新状态失败'
  }
  finally {
    loading.value = false
  }
}

onMounted(loadUpdateStatus)
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 class="font-semibold text-gray-900 dark:text-white">
          活动自动更新
        </h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          服务端会定时扫描并自动分析本机 QQ 农场最新源码和资源缓存。未知协议只生成候选报告，不执行游戏操作。
        </p>
      </div>
      <BaseButton variant="primary" :loading="loading" @click="scanUpdates">
        <span class="i-carbon-search mr-2" />
        立即重新分析
      </BaseButton>
    </div>

    <div v-if="error" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
      {{ error }}
    </div>

    <template v-if="report">
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div class="text-xs text-gray-500">扫描状态</div>
          <span class="mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium" :class="statusClass">{{ statusLabel }}</span>
        </div>
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div class="text-xs text-gray-500">源码版本</div>
          <div class="mt-2 break-all text-sm font-medium text-gray-900 dark:text-white">{{ report.source?.version || '未找到' }}</div>
        </div>
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div class="text-xs text-gray-500">TSDK 更新时间 / 大小</div>
          <div class="mt-2 text-sm text-gray-900 dark:text-white">{{ formatTime(report.source?.modifiedAt) }}</div>
          <div class="text-xs text-gray-500">{{ formatBytes(report.source?.wasmSize) }}</div>
        </div>
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div class="text-xs text-gray-500">资源缓存</div>
          <div class="mt-2 text-sm font-medium text-gray-900 dark:text-white">{{ report.caches.length }} 个账号缓存</div>
          <div class="text-xs text-gray-500">{{ report.caches[0]?.bundles.join('、') || '未找到 bundle' }}</div>
        </div>
      </div>

      <div class="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span>{{ report.analysis?.summary || '自动分析已完成' }}</span>
          <span class="text-xs opacity-75">
            每 {{ Math.round(intervalMs / 60000) || 30 }} 分钟自动分析 · 下次 {{ formatTime(nextScanAt) }}
          </span>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white">候选新活动 ID</h4>
          <div v-if="report.unknownActivityIds.length" class="mt-3 flex flex-wrap gap-2">
            <code v-for="id in report.unknownActivityIds" :key="id" class="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">{{ id }}</code>
          </div>
          <p v-else class="mt-3 text-sm text-gray-500">没有发现当前代码尚未登记的活动 ID。</p>
          <p class="mt-3 text-xs text-gray-400">共识别 {{ report.detectedActivityIds.length }} 个日期型活动 ID；候选项仍需协议样本确认。</p>
          <div v-if="report.analysis?.candidateGroups.length" class="mt-3 space-y-2 border-t border-gray-100 pt-3 dark:border-gray-700">
            <div v-for="group in report.analysis.candidateGroups" :key="group.date" class="text-xs text-gray-500">
              {{ group.date }}：{{ group.ids.join('、') }}
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white">扫描提示</h4>
          <ul v-if="report.warnings.length" class="mt-3 space-y-2 text-sm text-amber-700 dark:text-amber-300">
            <li v-for="warning in report.warnings" :key="warning" class="flex gap-2">
              <span class="i-carbon-warning-alt mt-0.5 shrink-0" />{{ warning }}
            </li>
          </ul>
          <p v-else class="mt-3 text-sm text-gray-500">源码目录与资源缓存检查正常。</p>
          <div class="mt-3 text-xs text-gray-400">扫描时间：{{ formatTime(report.scannedAt) }}</div>
        </div>
      </div>
    </template>
  </section>
</template>
