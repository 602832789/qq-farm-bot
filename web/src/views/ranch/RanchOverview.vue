<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import RanchAnimalsPanel from '@/components/ranch/RanchAnimalsPanel.vue'
import RanchResourceStrip from '@/components/ranch/RanchResourceStrip.vue'
import RanchSceneHost from '@/components/ranch/RanchSceneHost.vue'
import RanchVisualScene from '@/components/ranch/RanchVisualScene.vue'
import { useRanchStore } from '@/stores/ranch'

/**
 * 牧场概览：和农场首页对应，主体是栏舍场景。
 *
 * 顶部资产条用牧场自己的等级 / 货币 / 牧草 / 罐头桶（不是农场那一份），
 * 场景壳里的紧凑资源条关掉，否则同一批资源会显示两遍。
 */
const ranchStore = useRanchStore()
const { state } = storeToRefs(ranchStore)
const mode = ref<'scene' | 'list'>('scene')
</script>

<template>
  <div class="space-y-4">
    <RanchResourceStrip :state="state" />

    <div class="flex justify-end">
      <div class="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800" role="group" aria-label="栏舍展示方式">
        <button
          v-for="option in [{ key: 'scene', label: '场景' }, { key: 'list', label: '列表' }] as const"
          :key="option.key"
          type="button"
          class="rounded-md px-2.5 py-1 text-xs transition"
          :class="mode === option.key ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'"
          :aria-pressed="mode === option.key"
          @click="mode = option.key"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <RanchSceneHost
      view="animals"
      title="牧场概览"
      icon="i-carbon-chart-pie"
      hide-resources
    >
      <template #default="{ state: snapshot, onRequest }">
        <RanchVisualScene v-if="mode === 'scene'" :state="snapshot" @request="onRequest" />
        <RanchAnimalsPanel v-else :state="snapshot" @request="onRequest" />
      </template>
    </RanchSceneHost>
  </div>
</template>
