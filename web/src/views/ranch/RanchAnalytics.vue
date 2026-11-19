<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import RanchSceneHost from '@/components/ranch/RanchSceneHost.vue'
import { useRanchStore } from '@/stores/ranch'
import { formatQuantity } from '@/utils/ranch'

/**
 * 牧场分析：只看基础快照，不再额外请求。
 *
 * 取的是 `view="animals"` 返回的同一份快照——栏舍、动物阶段、设施升级、待核对操作
 * 都在里面；统计口径全部来自后端字段，不在前端按名字猜状态。
 */
const ranchStore = useRanchStore()
const { state } = storeToRefs(ranchStore)

const stats = computed(() => {
  const snapshot = state.value
  const facilities = snapshot?.facilities || []
  const ranches = facilities.filter(facility => facility.isRanch)
  const animals = ranches.flatMap(ranch => ranch.ranch?.animals || [])
  return {
    level: snapshot?.level ?? 0,
    progress: snapshot?.progressPercent ?? 0,
    currentExp: snapshot?.currentExp ?? '0',
    neededExp: snapshot?.neededExp ?? null,
    ranches: ranches.length,
    occupied: ranches.reduce((sum, ranch) => sum + (ranch.ranch?.count || 0), 0),
    capacity: ranches.reduce((sum, ranch) => sum + (ranch.ranch?.capacity || 0), 0),
    animals: animals.length,
    harvest: animals.filter(animal => animal.stageName === '可收获').length,
    produce: animals.filter(animal => animal.stageName === '可生产').length,
    hungry: animals.filter(animal => animal.grassBlocked).length,
    upgrading: facilities.filter(facility => facility.upgradeState > 0).length,
    pending: snapshot?.pending.length ?? 0,
    hazards: ranches.reduce((sum, ranch) => sum + (ranch.ranch?.hazards?.length || 0), 0),
  }
})

const cards = computed(() => [
  { label: '牧场等级', value: `Lv.${stats.value.level}`, hint: `经验 ${formatQuantity(stats.value.currentExp)}${stats.value.neededExp ? ` / ${formatQuantity(stats.value.neededExp)}` : ''}` },
  { label: '栏舍', value: `${stats.value.ranches}`, hint: `占用 ${stats.value.occupied} / ${stats.value.capacity}` },
  { label: '动物', value: `${stats.value.animals}`, hint: `可收获 ${stats.value.harvest} · 可生产 ${stats.value.produce}` },
  { label: '需要照料', value: `${stats.value.hungry}`, hint: '缺草或状态受阻的动物' },
  { label: '设施升级中', value: `${stats.value.upgrading}`, hint: '升级完成后需要手动确认' },
  { label: '待核对操作', value: `${stats.value.pending}`, hint: '后端已预留资源、等待回读确认' },
])
</script>

<template>
  <RanchSceneHost view="animals" title="牧场分析" icon="i-carbon-analytics">
    <template #default="{ state: snapshot }">
      <div v-if="snapshot" class="space-y-4">
        <div class="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
          <div class="h-full rounded-full" :style="{ width: `${stats.progress}%`, background: 'var(--theme-gradient)' }" />
        </div>
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div v-for="card in cards" :key="card.label" class="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {{ card.label }}
            </div>
            <div class="mt-1 text-xl tabular-nums font-bold">
              {{ card.value }}
            </div>
            <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ card.hint }}
            </div>
          </div>
        </div>
        <p v-if="stats.hazards > 0" class="text-xs text-amber-600 dark:text-amber-400">
          当前有 {{ stats.hazards }} 个栏舍异常，请到栏舍场景处理。
        </p>
      </div>
    </template>
  </RanchSceneHost>
</template>
