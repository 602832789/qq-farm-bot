<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useAccountStore } from '@/stores/account'

/**
 * 好友外挂检测（移植自 BUGDey 版）。
 *
 * 数据来自 /api/friend-cheat-analysis：服务端把挂机过程中累积的访客互动样本
 * 按六个维度打分，这里只负责呈现与筛选，点击动作仍是拉黑/忽略的手工判断。
 */
const accountStore = useAccountStore()
const { currentAccountId } = storeToRefs(accountStore)

const analysis = ref<any>(null)
const loading = ref(false)
const error = ref('')
const filter = ref<'all' | 'danger' | 'warn' | 'insufficient'>('all')

const FILTERS: Array<{ key: typeof filter.value, label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'danger', label: '建议清洗' },
  { key: 'warn', label: '关注' },
  { key: 'insufficient', label: '样本不足' },
]

async function load() {
  const accountId = String(currentAccountId.value || '')
  if (!accountId) {
    analysis.value = null
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await api.get('/api/friend-cheat-analysis', { headers: { 'x-account-id': accountId }, skipErrorToast: true } as any)
    if (res.data?.ok)
      analysis.value = res.data.data
    else
      error.value = res.data?.error || '外挂检测失败'
  }
  catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || '外挂检测失败'
  }
  finally {
    loading.value = false
  }
}

watch(currentAccountId, () => { void load() }, { immediate: true })

const visitors = computed<any[]>(() => analysis.value?.visitors || [])

const filteredVisitors = computed(() => visitors.value.filter((v: any) => {
  if (filter.value === 'danger')
    return v.level === 'danger' && !v.protected
  if (filter.value === 'warn')
    return v.level === 'warn' && !v.protected
  if (filter.value === 'insufficient')
    return !!v.insufficientSamples
  return true
}))

function levelLabel(v: any) {
  if (v.protected)
    return '护主犬'
  return v.level === 'danger' ? '建议清洗' : v.level === 'warn' ? '关注' : '正常'
}

function levelClass(v: any) {
  if (v.protected)
    return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
  if (v.level === 'danger')
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  if (v.level === 'warn')
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
}

function scoreClass(v: any) {
  if (v.level === 'danger')
    return 'bg-red-500'
  if (v.level === 'warn')
    return 'bg-amber-500'
  return 'bg-green-500'
}

function metricsParts(v: any) {
  const m = v.metrics || {}
  const parts: Array<{ label: string, value: string }> = [
    { label: '样本', value: `${m.count ?? 0} 条` },
    { label: '日均', value: Number(m.perDay ?? 0).toFixed(1) },
    { label: '凌晨占比', value: `${Math.round((m.dawnRatio ?? 0) * 100)}%` },
  ]
  if (m.regularityCv != null)
    parts.push({ label: '间隔变异', value: String(m.regularityCv) })
  if (m.singleAction)
    parts.push({ label: '', value: '行为单一' })
  parts.push({ label: '24h 在线', value: `${v.activeHours24 ?? 0} 小时` })
  parts.push({ label: '帮忙', value: String(m.helpCount ?? 0) })
  parts.push({ label: '偷菜', value: `${m.stealCount ?? 0}（价值 ${m.stealValue ?? 0}）` })
  if ((m.fastStealCount ?? 0) > 0)
    parts.push({ label: '秒偷', value: `${m.fastStealCount} 次` })
  return parts
}

function formatTime(ts: number) {
  if (!ts)
    return '—'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <p class="max-w-3xl text-xs text-gray-500 leading-relaxed dark:text-gray-400">
        基于访客互动记录的行为分析：操作间隔规律性 / 在线时长 / 凌晨活跃占比 / 日均频率 / 行为单一性 / 秒偷，
        综合评出 0-100 嫌疑分。单个访客样本不足 {{ analysis?.sampleMinTrust ?? 20 }} 条时按比例压缩且不标记可疑
        （标注「样本不足」）。样本在挂机过程中持续积累，窗口 {{ analysis?.windowHours ?? 72 }} 小时。
      </p>
      <BaseButton variant="secondary" size="sm" :loading="loading" @click="load">
        重新分析
      </BaseButton>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div class="farm-card rounded-lg p-4">
        <div class="text-xs text-gray-500">
          样本总量
        </div>
        <div class="mt-1 text-2xl font-bold">
          {{ analysis?.sampleCount ?? 0 }}
        </div>
      </div>
      <div class="farm-card rounded-lg p-4">
        <div class="text-xs text-gray-500">
          访客数
        </div>
        <div class="mt-1 text-2xl font-bold">
          {{ analysis?.visitorCount ?? 0 }}
        </div>
      </div>
      <div class="farm-card rounded-lg p-4">
        <div class="text-xs text-gray-500">
          建议清洗
        </div>
        <div class="mt-1 text-2xl text-red-600 font-bold dark:text-red-400">
          {{ analysis?.suspiciousCount ?? 0 }}
        </div>
      </div>
      <div class="farm-card rounded-lg p-4">
        <div class="text-xs text-gray-500">
          分析窗口
        </div>
        <div class="mt-1 text-2xl font-bold">
          {{ analysis?.windowHours ?? 72 }}<span class="ml-1 text-sm font-normal text-gray-400">小时</span>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="item in FILTERS"
        :key="item.key"
        type="button"
        class="rounded-full px-3 py-1 text-xs transition-colors"
        :class="filter === item.key ? 'bg-[var(--theme-primary)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'"
        @click="filter = item.key"
      >
        {{ item.label }}
      </button>
      <span class="ml-auto text-xs text-gray-400">{{ filteredVisitors.length }} 人</span>
    </div>

    <div v-if="loading && !analysis" class="py-10 text-center text-sm text-gray-500">
      <span class="i-carbon-circle-dash mx-auto mb-2 inline-block animate-spin text-2xl" />
      <div>正在分析访客样本…</div>
    </div>

    <EmptyState
      v-else-if="error"
      bare
      :title="error"
      description="检查账号是否已选择，或稍后重试"
      icon="i-carbon-warning-alt"
    />

    <EmptyState
      v-else-if="!visitors.length"
      bare
      title="还没有足够的访客样本"
      description="挂机过程中每次拉取访客记录都会累积样本，跑一段时间后再来看"
      icon="i-carbon-document-blank"
    />

    <div v-else class="space-y-2">
      <div
        v-for="v in filteredVisitors"
        :key="v.gid"
        class="farm-card rounded-lg p-4"
      >
        <div class="flex items-start gap-3">
          <div class="h-10 w-10 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600">
            <img v-if="v.avatarUrl" :src="v.avatarUrl" alt="" class="h-full w-full object-cover" loading="lazy">
            <span v-else class="i-carbon-user text-gray-400" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <strong class="truncate text-sm">{{ v.name || v.nick || `GID:${v.gid}` }}</strong>
              <span class="text-xs text-gray-400">{{ v.gid }}</span>
              <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="levelClass(v)">{{ levelLabel(v) }}</span>
              <span v-if="v.insufficientSamples" class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">样本不足</span>
              <span class="ml-auto text-xs text-gray-400">最近 {{ formatTime(v.lastTs) }}</span>
            </div>
            <div class="mt-2 flex items-center gap-2">
              <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                <div class="h-full rounded-full transition-all" :class="scoreClass(v)" :style="{ width: `${v.score}%` }" />
              </div>
              <span class="w-10 text-right text-sm font-bold tabular-nums">{{ v.score }}</span>
            </div>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <span
                v-for="part in metricsParts(v)"
                :key="`${part.label}-${part.value}`"
                class="rounded-md bg-gray-50 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-900/40 dark:text-gray-300"
              >
                <template v-if="part.label">{{ part.label }} </template><b>{{ part.value }}</b>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
