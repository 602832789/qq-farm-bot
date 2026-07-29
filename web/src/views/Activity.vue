<script setup lang="ts">
import type { ActivityLabels, ActivitySection, ActivitySectionKey } from '@/components/activity/types'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import HeluExchangePanel from '@/components/activity/HeluExchangePanel.vue'
import HeluPassportPanel from '@/components/activity/HeluPassportPanel.vue'
import HeluSolarTermsPanel from '@/components/activity/HeluSolarTermsPanel.vue'
import StarRecordPanel from '@/components/activity/StarRecordPanel.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAccountStore } from '@/stores/account'
import { useActivityStore } from '@/stores/activity'
import { useToastStore } from '@/stores/toast'

const L: ActivityLabels = {
  title: '活动中心',
  currentAccount: '当前账号',
  none: '未选择',
  needAccount: '请先选择账号，再查看活动数据。',
  refresh: '刷新',
  loading: '正在加载活动数据...',
  empty: '暂无数据',
  warningTitle: '活动提示',
  heluTitle: '心许千灯星垂野',
  giftLotusTab: '观星礼录',
  shopTab: '星砂兑换商店',
  journeyTab: '千星游记',
  notesTab: '节令小札',
  pool: '奖池',
  recent: '最近结果',
  freeRemain: '免费剩余',
  paidRemain: '点券剩余',
  dailyUsed: '今日已用',
  dailyRemain: '今日剩余',
  helu: '星砂',
  heluBalance: '星砂余额',
  exchangeGoods: '兑换奖励',
  drawOne: '点亮',
  drawBatch: '一键点亮',
  drawDone: '点亮完成',
  batchDone: '点亮完成',
  drawFail: '点亮失败',
  exchangeDone: '兑换成功：',
  exchangeFail: '兑换失败',
  canExchange: '立即兑换',
  unavailable: '暂不可用',
  owned: '已拥有',
  noHelu: '星砂不足',
  unsupportedCurrency: '暂不支持该货币',
  priceLabel: '价格',
  stateLabel: '状态',
  drawCostLabel: '操作说明',
  freeDraw: '免费',
  paidDraw: '消耗',
  recentCost: '本次消耗',
  rewardPoolCount: '星宿奖励',
  exchangeCount: '兑换奖励',
  typeFallback: '活动奖励',
  gold: '金币',
  coupon: '点券',
  activityCurrency: '星砂',
  defaultHeluTitle: '心许千灯星垂野',
  decorationLabel: '装扮',
  subActivityUnavailable: '暂未读取到活动数据。',
  activityStatus: '活动状态',
}

const accountStore = useAccountStore()
const activityStore = useActivityStore()
const toast = useToastStore()
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const {
  heluActivity: activity,
  heluLoading,
  passportClaimLoading,
  solarClaimLoading,
  starRecordClaimLoading,
  heluError,
} = storeToRefs(activityStore)

const activeSection = ref<ActivitySectionKey>('records')
const sections = computed<ActivitySection[]>(() => [
  { key: 'records', label: '观星礼录', icon: 'i-carbon-star', count: activity.value?.starRecord?.claimableCount || 0 },
  { key: 'shop', label: '星砂兑换商店', icon: 'i-carbon-store', count: activity.value?.exchangeShop?.length || 0 },
  { key: 'journey', label: '千星游记', icon: 'i-carbon-map', count: activity.value?.passport?.claimableLevels || 0 },
  { key: 'notes', label: '节令小札', icon: 'i-carbon-notebook', count: activity.value?.solarTerms?.claimableCount || 0 },
])

async function refreshAll() {
  if (currentAccountId.value)
    await activityStore.fetchHeluActivity(currentAccountId.value)
}

async function claimRecords() {
  if (!currentAccountId.value)
    return
  const result = await activityStore.claimStarRecords(currentAccountId.value)
  if (result?.ok) {
    const count = result.recordIds?.length || 0
    toast.success(count ? `已点亮并领取 ${count} 个星宿奖励` : '观星礼录领取完成')
  }
  else {
    toast.error(result?.error || '观星礼录领取失败')
  }
}

async function claimPassport() {
  if (!currentAccountId.value)
    return
  const result = await activityStore.claimHeluPassport(currentAccountId.value)
  result?.ok ? toast.success('千星游记奖励领取完成') : toast.error(result?.error || '千星游记领取失败')
}

async function claimSolar(term: { id: number, title?: string }) {
  if (!currentAccountId.value)
    return
  const result = await activityStore.claimHeluSolar(currentAccountId.value, term.id)
  result?.ok
    ? toast.success(`节令小札领取完成：${term.title || term.id}`)
    : toast.error(result?.error || '节令小札领取失败')
}

watch(currentAccountId, () => {
  activityStore.clearActivityData()
  refreshAll()
})
onMounted(refreshAll)
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
      <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <div class="i-carbon-star-filled text-2xl text-amber-500" />
            <h1 class="text-xl text-gray-900 font-bold dark:text-gray-100">
              {{ activity?.title || L.heluTitle }}
            </h1>
          </div>
          <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            活动中心 · {{ L.currentAccount }} {{ currentAccount?.name || L.none }}
          </div>
        </div>
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <span class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            {{ L.heluBalance }} {{ Number(activity?.starSandBalance || 0).toLocaleString() }}
          </span>
          <div class="max-w-full overflow-x-auto">
            <div class="min-w-max inline-flex border border-gray-200 rounded-lg p-0.5 dark:border-gray-700">
              <button
                v-for="section in sections"
                :key="section.key"
                class="rounded-md px-3 py-1.5 text-sm transition"
                :class="activeSection === section.key ? 'text-white' : 'text-gray-600 dark:text-gray-300'"
                :style="activeSection === section.key ? { backgroundColor: 'var(--theme-primary)' } : {}"
                @click="activeSection = section.key"
              >
                {{ section.label }}
                <span v-if="section.count" class="ml-1 opacity-80">{{ section.count }}</span>
              </button>
            </div>
          </div>
          <BaseButton variant="primary" :loading="heluLoading" :disabled="!currentAccountId" @click="refreshAll">
            {{ L.refresh }}
          </BaseButton>
        </div>
      </div>
    </header>

    <div v-if="!currentAccountId" class="rounded-lg bg-white p-10 text-center text-sm text-gray-500 shadow dark:bg-gray-800">
      {{ L.needAccount }}
    </div>
    <template v-else>
      <div v-if="heluError" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-300">
        {{ heluError }}
      </div>
      <div v-if="activity?.warning" class="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
        {{ activity.warning }}
      </div>
      <div v-if="heluLoading && !activity" class="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:bg-sky-900/20 dark:text-sky-100">
        {{ L.loading }}
      </div>

      <StarRecordPanel
        v-if="activeSection === 'records'"
        :record="activity?.starRecord"
        :loading="starRecordClaimLoading"
        @claim="claimRecords"
      />
      <div v-else-if="activeSection === 'shop'" class="space-y-3">
        <div v-if="activity?.shopWarning" class="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
          {{ activity.shopWarning }}
        </div>
        <HeluExchangePanel
          :items="activity?.exchangeShop || []"
          :balance="activity?.starSandBalance || 0"
          :exchange-loading="false"
          :read-only="activity?.shopReadOnly"
          :labels="L"
        />
      </div>
      <HeluPassportPanel
        v-else-if="activeSection === 'journey'"
        :passport="activity?.passport"
        :loading="passportClaimLoading"
        :labels="L"
        @claim="claimPassport"
      />
      <HeluSolarTermsPanel
        v-else
        :solar-terms="activity?.solarTerms"
        :loading="solarClaimLoading"
        :labels="L"
        @claim="claimSolar"
      />
    </template>
  </section>
</template>
