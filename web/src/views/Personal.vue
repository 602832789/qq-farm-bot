<script setup lang="ts">
import { ref, watch } from 'vue'
import BagPanel from '@/components/BagPanel.vue'
import FarmPanel from '@/components/FarmPanel.vue'
import PetPanel from '@/components/PetPanel.vue'
import TaskPanel from '@/components/TaskPanel.vue'
import FarmPageHeader from '@/components/ui/FarmPageHeader.vue'

type PersonalTab = 'farm' | 'pet' | 'bag' | 'task'

const TABS: Array<{ key: PersonalTab, label: string, icon: string }> = [
  { key: 'farm', label: '我的农场', icon: 'i-carbon-sprout' },
  { key: 'pet', label: '我的宠物', icon: 'i-carbon-dog-walker' },
  { key: 'bag', label: '我的背包', icon: 'i-carbon-box' },
  { key: 'task', label: '我的任务', icon: 'i-carbon-task' },
]

const currentTab = ref<PersonalTab>('farm')

const tabPanels: Record<PersonalTab, any> = {
  farm: FarmPanel,
  pet: PetPanel,
  bag: BagPanel,
  task: TaskPanel,
}

const visitedTabs = ref<PersonalTab[]>(['farm'])

watch(currentTab, (tab) => {
  if (!visitedTabs.value.includes(tab))
    visitedTabs.value.push(tab)
})
</script>

<template>
  <div class="personal-page">
    <FarmPageHeader title="我的农场" description="照看作物，整理背包，收下每一份成长。" icon="i-carbon-sprout" />
    <div class="personal-tabs" role="tablist" aria-label="个人板块">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="personal-tab" role="tab"
        :class="{ 'is-active': currentTab === tab.key }"
        :aria-selected="currentTab === tab.key"
        @click="currentTab = tab.key"
      >
        <div class="flex items-center space-x-2">
          <div :class="tab.icon" class="text-lg" />
          <span>{{ tab.label }}</span>
        </div>
      </button>
    </div>

    <div class="personal-content">
      <div v-for="tab in visitedTabs" v-show="tab === currentTab" :key="tab">
        <component :is="tabPanels[tab]" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.personal-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.personal-tabs {
  display: flex;
  gap: 26px;
  border-bottom: 1px solid var(--surface-border);
  overflow-x: auto;
}
.personal-tab {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 10px 1px 13px;
  border-bottom: 3px solid transparent;
  font-size: 13px;
  color: var(--muted-text);
}
.personal-tab:hover {
  color: var(--theme-primary);
}
.personal-tab.is-active {
  color: var(--theme-primary);
  border-bottom-color: var(--theme-primary);
  font-weight: 650;
}
.personal-content {
  min-width: 0;
  padding-bottom: 16px;
}
:deep(.personal-panel) {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 16px;
}
:deep(.personal-panel__card) {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
:deep(.personal-panel__scroll) {
  min-width: 0;
}
@media (max-width: 639px) {
  .personal-page {
    gap: 14px;
  }
  .personal-tabs {
    gap: 20px;
  }
  .personal-tab {
    font-size: 12px;
  }
  :deep(.personal-panel) {
    gap: 12px;
  }
}
</style>
