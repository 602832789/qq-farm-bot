<script setup lang="ts">
import { NButton } from 'naive-ui/es/button'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import api, { getApiErrorMessage } from '@/api'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useAccountStore } from '@/stores/account'

/**
 * 牧场分析：纯配置推导，不需要牧场已解锁，也不写游戏状态。
 * 数据来自 GET /api/ranch?view=analytics（后端 state.ts 的 analyticsPayload）。
 * 页面结构与桌面副本 RanchAnalytics.vue 一致：说明 + 搜索/排序 + 明细表。
 */
interface AnimalRow {
  id: number
  name: string
  husbandryType: string
  infantSec: number
  growSec: number
  matureSec: number
  cycleSeconds: number
  harvestExp: number
  harvestExpPerHour: number | null
  produceCycleSec: number
  maxProduceCount: number
  grassSecPerItem: number
  product: { id: number, count: string, name: string, image?: string } | null
  byproduct: { id: number, count: string, name: string, image?: string } | null
}
interface AnalyticsData {
  animals: AnimalRow[]
  summary: { animalCount: number, coopCount: number, penCount: number }
  assumptions: string
}

const { currentAccountId } = storeToRefs(useAccountStore())
const data = ref<AnalyticsData | null>(null)
const error = ref('')
const loading = ref(false)

const query = ref('')
const sort = ref('id')
const direction = ref('asc')
const sortOptions = [
  { label: '动物 ID', value: 'id' },
  { label: '基础周期', value: 'cycleSeconds' },
  { label: '收获经验/小时（基础）', value: 'harvestExpPerHour' },
]
const directionOptions = [
  { label: '升序', value: 'asc' },
  { label: '降序', value: 'desc' },
]

async function load() {
  error.value = ''
  data.value = null
  const accountId = currentAccountId.value
  if (!accountId)
    return
  loading.value = true
  try {
    const response = await api.get('/api/ranch', {
      params: { view: 'analytics' },
      headers: { 'x-account-id': accountId },
    })
    data.value = (response.data?.data as AnalyticsData) ?? null
  }
  catch (cause) {
    error.value = getApiErrorMessage(cause, '牧场分析读取失败')
  }
  finally {
    loading.value = false
  }
}

watch(currentAccountId, () => { void load() }, { immediate: true })

const animals = computed<AnimalRow[]>(() => {
  const rows = (data.value?.animals || []).filter((row) => {
    const keyword = query.value.trim()
    return !keyword || String(row.name || '').includes(keyword) || String(row.id).includes(keyword)
  })
  return rows.slice().sort((a, b) => {
    const av = Number((a as any)[sort.value]) || 0
    const bv = Number((b as any)[sort.value]) || 0
    return (av - bv) * (direction.value === 'asc' ? 1 : -1)
  })
})

function duration(seconds: any) {
  const n = Number(seconds)
  if (!Number.isFinite(n) || n <= 0)
    return '—'
  return n >= 3600 ? `${(n / 3600).toFixed(2)} 小时` : `${n} 秒`
}

function expPerHour(row: AnimalRow) {
  return row.harvestExpPerHour == null ? '待确认' : Number(row.harvestExpPerHour).toFixed(2)
}
</script>

<template>
  <div class="page-stack ranch-analytics">
    <EmptyState v-if="!currentAccountId" title="请先选择账号" description="在左侧选择账号后查看牧场分析" icon="i-carbon-user-avatar" />
    <template v-else>
      <div class="analytics-loading" v-if="loading && !data" role="status" aria-label="正在读取牧场分析">
        <span class="i-svg-spinners-90-ring-with-bg" />
      </div>
      <EmptyState v-else-if="!data" tone="error" title="牧场分析读取失败" :description="error" icon="i-carbon-warning-alt">
        <NButton secondary @click="load">
          重新读取
        </NButton>
      </EmptyState>
      <template v-else>
        <div class="analytics-note">
          {{ data.assumptions }}
        </div>

        <div class="analytics-toolbar">
          <b>动物 {{ data.summary?.animalCount ?? animals.length }} 种</b>
          <span class="analytics-summary">窝 {{ data.summary?.coopCount ?? 0 }} · 棚 {{ data.summary?.penCount ?? 0 }}</span>
          <input v-model="query" class="analytics-search" placeholder="搜索动物" aria-label="搜索动物">
          <BaseSelect v-model="sort" :options="sortOptions" class="analytics-sort" />
          <BaseSelect v-model="direction" :options="directionOptions" class="analytics-direction" />
          <NButton size="tiny" secondary @click="load">
            刷新
          </NButton>
        </div>

        <div class="analytics-table-wrap">
          <table class="analytics-table">
            <thead>
              <tr>
                <th>动物</th>
                <th>窝/棚</th>
                <th>幼年/成长</th>
                <th>基础周期</th>
                <th>理论收获经验/小时</th>
                <th>生产周期</th>
                <th>生产轮数</th>
                <th>每轮产物</th>
                <th>副产物</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="animal in animals" :key="animal.id">
                <td class="analytics-name">{{ animal.name }}</td>
                <td>{{ animal.husbandryType || '—' }}</td>
                <td>{{ duration(animal.infantSec) }} / {{ duration(animal.growSec) }}</td>
                <td>{{ duration(animal.cycleSeconds) }}</td>
                <td class="tabular-nums">{{ expPerHour(animal) }}</td>
                <td>{{ duration(animal.produceCycleSec) }}</td>
                <td>{{ animal.maxProduceCount || '—' }}</td>
                <td>{{ animal.product?.name || '—' }} × {{ animal.product?.count || '—' }}</td>
                <td>{{ animal.byproduct?.name || '—' }} × {{ animal.byproduct?.count || '—' }}</td>
              </tr>
              <tr v-if="animals.length === 0">
                <td colspan="9" class="analytics-empty">
                  没有符合条件的动物
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.ranch-analytics {
  gap: 14px;
}
.analytics-loading {
  display: grid;
  min-height: 280px;
  place-items: center;
  color: var(--ui-primary);
  font-size: 28px;
}
.analytics-note {
  padding: 14px 16px;
  border: 1px solid var(--surface-border);
  border-radius: var(--ui-radius-control, 10px);
  background: var(--surface-2);
  color: var(--muted-text);
  font-size: 13px;
  line-height: 1.6;
}
.analytics-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.analytics-summary {
  color: var(--muted-text);
  font-size: 13px;
}
.analytics-search {
  min-width: 180px;
  padding: 7px 12px;
  border: 1px solid var(--surface-border);
  border-radius: var(--ui-radius-control, 8px);
  background: transparent;
  color: var(--theme-text);
  font-size: 13px;
}
.analytics-search:focus {
  outline: none;
  border-color: var(--theme-primary);
}
.analytics-sort {
  width: 220px;
}
.analytics-direction {
  width: 110px;
}
.analytics-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--surface-border);
  border-radius: var(--ui-radius-control, 10px);
}
.analytics-table {
  width: 100%;
  white-space: nowrap;
  text-align: left;
  font-size: 13px;
}
.analytics-table th,
.analytics-table td {
  padding: 12px 14px;
}
.analytics-table thead {
  background: var(--surface-2);
  color: var(--muted-text);
  font-weight: 600;
}
.analytics-table tbody tr:not(:last-child) {
  border-top: 1px solid var(--surface-border);
}
.analytics-name {
  font-weight: 600;
}
.analytics-empty {
  padding: 28px;
  text-align: center;
  color: var(--muted-text);
}
@media (max-width: 640px) {
  .analytics-toolbar {
    gap: 8px;
  }
  .analytics-sort,
  .analytics-direction {
    width: 100%;
  }
}
</style>
