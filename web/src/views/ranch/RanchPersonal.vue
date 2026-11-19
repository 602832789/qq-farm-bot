<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RanchBagPanel from '@/components/ranch/RanchBagPanel.vue'
import RanchFacilitiesPanel from '@/components/ranch/RanchFacilitiesPanel.vue'
import RanchSceneHost from '@/components/ranch/RanchSceneHost.vue'
import RanchTasksPanel from '@/components/ranch/RanchTasksPanel.vue'

/**
 * 牧场「个人」：设施 / 背包 / 任务三个页签。
 *
 * 页签写在地址栏（`?view=warehouse` / `?view=tasks`），刷新和分享都能回到同一个页签；
 * 旧地址 `ranch/buildings`、`ranch/warehouse`、`ranch/orders` 由路由重定向到这里。
 */
const route = useRoute()
const router = useRouter()

const TABS = [
  { key: 'buildings', label: '设施', view: 'facilities', title: '我的设施', icon: 'i-carbon-building' },
  { key: 'warehouse', label: '背包', view: 'bag', title: '牧场背包', icon: 'i-carbon-catalog' },
  { key: 'tasks', label: '任务', view: 'tasks', title: '牧场任务', icon: 'i-carbon-task' },
] as const

type TabKey = (typeof TABS)[number]['key']

const activeTab = computed(() => {
  const requested = String(route.query.view || '')
  return TABS.find(tab => tab.key === requested) || TABS[0]!
})

function selectTab(key: TabKey) {
  void router.replace({
    path: '/ranch/personal',
    query: key === 'buildings' ? {} : { view: key },
  })
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-1.5">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        class="rounded-lg px-3 py-1.5 text-sm transition"
        :class="activeTab.key === tab.key
          ? 'text-white shadow-sm'
          : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
        :style="activeTab.key === tab.key ? { backgroundColor: 'var(--theme-primary)' } : {}"
        @click="selectTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <RanchSceneHost :view="activeTab.view" :title="activeTab.title" :icon="activeTab.icon">
      <template #default="{ state, onRequest }">
        <RanchFacilitiesPanel v-if="activeTab.view === 'facilities'" :state="state" @request="onRequest" />
        <RanchBagPanel v-else-if="activeTab.view === 'bag'" :state="state" @request="onRequest" />
        <RanchTasksPanel v-else :state="state" @request="onRequest" />
      </template>
    </RanchSceneHost>
  </div>
</template>
