<script setup lang="ts">
import { computed, ref } from 'vue'
import RanchCansPanel from '@/components/ranch/RanchCansPanel.vue'
import RanchMarketPanel from '@/components/ranch/RanchMarketPanel.vue'
import RanchSceneHost from '@/components/ranch/RanchSceneHost.vue'
import RanchShopPanel from '@/components/ranch/RanchShopPanel.vue'

/**
 * 牧场「商城」：商店 / 交易市场 / 罐头商城三个页签。
 *
 * 商店按 shopId、罐头商城按货架 slot 取货，页签切换时清空这些参数，
 * 否则会拿着上一页的 id 去请求另一个视图。
 */
const TABS = [
  { key: 'shop', label: '商店', view: 'shop', title: '牧场商店', icon: 'i-carbon-shopping-cart' },
  { key: 'market', label: '交易市场', view: 'market', title: '交易市场', icon: 'i-carbon-store' },
  { key: 'cans', label: '罐头商城', view: 'cans', title: '罐头商城', icon: 'i-carbon-cube' },
] as const

type TabKey = (typeof TABS)[number]['key']

const activeKey = ref<TabKey>('shop')
const shopId = ref<number | null>(null)
const cansSlot = ref<number | null>(null)

const activeTab = computed(() => TABS.find(tab => tab.key === activeKey.value) || TABS[0]!)

const params = computed(() => {
  if (activeTab.value.view === 'shop' && shopId.value !== null)
    return { shopId: shopId.value }
  if (activeTab.value.view === 'cans' && cansSlot.value !== null)
    return { shopId: cansSlot.value }
  return {}
})

function selectTab(key: TabKey) {
  activeKey.value = key
  shopId.value = null
  cansSlot.value = null
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

    <RanchSceneHost :view="activeTab.view" :params="params" :title="activeTab.title" :icon="activeTab.icon">
      <template #default="{ state, onRequest }">
        <RanchShopPanel
          v-if="activeTab.view === 'shop'"
          :state="state"
          @request="onRequest"
          @shop-id="shopId = $event"
        />
        <RanchMarketPanel v-else-if="activeTab.view === 'market'" :state="state" @request="onRequest" />
        <RanchCansPanel v-else :state="state" @request="onRequest" @slot-type="cansSlot = $event" />
      </template>
    </RanchSceneHost>
  </div>
</template>
