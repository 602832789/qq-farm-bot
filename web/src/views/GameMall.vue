<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { NTab } from 'naive-ui/es/tabs'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MallCatalogPanel from '@/components/commerce/MallCatalogPanel.vue'
import MysteryArrivalBanner from '@/components/commerce/MysteryArrivalBanner.vue'
import MysteryShopPanel from '@/components/commerce/MysteryShopPanel.vue'
import PageTabs from '@/components/PageTabs.vue'
import { useAccountStore } from '@/stores/account'
import { useCommerceStore } from '@/stores/commerce'

type MallTab = 'mall' | 'svip' | 'mystery' | 'limited' | 'props'
const TAB_KEYS: MallTab[] = ['mall', 'limited', 'props', 'mystery', 'svip']
/** 直接打开 /game-mall 时的默认页签；侧栏「农场商城」入口由 menuLink 带 ?tab=mystery 打开神秘商人。 */
const DEFAULT_TAB: MallTab = 'mall'

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const commerceStore = useCommerceStore()
const { currentAccountId } = storeToRefs(accountStore)
const { purchasingGoodsId, mysteryPurchasing } = storeToRefs(commerceStore)
const tabs: Array<{ key: MallTab, label: string, icon: string }> = [
  { key: 'mall', label: '游戏商城', icon: 'i-carbon-shopping-bag' },
  { key: 'limited', label: '限时商店', icon: 'i-carbon-timer' },
  { key: 'props', label: '道具商店', icon: 'i-carbon-store' },
  { key: 'mystery', label: '神秘商人', icon: 'i-carbon-store' },
  { key: 'svip', label: 'SVIP 专属商城', icon: 'i-carbon-diamond-outline' },
]
const activeTab = computed<MallTab>(() => {
  const tab = route.query.tab
  return typeof tab === 'string' && (TAB_KEYS as string[]).includes(tab) ? tab as MallTab : DEFAULT_TAB
})
const purchasing = computed(() => purchasingGoodsId.value !== null || mysteryPurchasing.value)

function selectTab(tab: MallTab) {
  if (purchasing.value || tab === activeTab.value)
    return
  router.replace({ query: { ...route.query, tab: tab === DEFAULT_TAB ? undefined : tab }, hash: route.hash })
}

/** 来访横幅常驻商城页顶部；停在其它页签时也要能读到当前来访与购买状态。 */
function refreshMysteryBanner() {
  const id = String(currentAccountId.value || '').trim()
  if (!id)
    return
  void commerceStore.fetchMystery(id)
  void commerceStore.fetchMysteryHistory(id)
}

onMounted(() => {
  if (activeTab.value !== 'mystery')
    refreshMysteryBanner()
})
watch(currentAccountId, () => refreshMysteryBanner())
useIntervalFn(() => {
  if (activeTab.value !== 'mystery')
    refreshMysteryBanner()
}, 30000)
</script>

<template>
  <div class="mall-page page-stack">
    <PageTabs :value="activeTab" @update:value="selectTab">
      <NTab v-for="tab in tabs" :key="tab.key" :name="tab.key" :disabled="purchasing && activeTab !== tab.key">
        <span class="inline-flex items-center gap-2">
          <span :class="tab.icon" />
          {{ tab.label }}
        </span>
      </NTab>
    </PageTabs>

    <MysteryArrivalBanner @go="selectTab('mystery')" />

    <MysteryShopPanel v-if="activeTab === 'mystery'" />
    <MallCatalogPanel v-else :slot-type="activeTab === 'svip' ? 4 : activeTab === 'limited' ? 5 : 1" :props-shop="activeTab === 'props'" />
  </div>
</template>

<style scoped>
.mall-page {
  min-height: 100%;
  color: var(--ui-ink);
}
</style>
