<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  dailyGifts: any
}>()

const GIFT_ICONS: Record<string, string> = {
  task_claim: '✅',
  email_rewards: '📧',
  mall_free_gifts: '🛍️',
  daily_share: '📤',
  vip_daily_gift: '⭐',
  month_card_gift: '📅',
}

function getGiftIcon(key: string) {
  return GIFT_ICONS[key] || '🎁'
}

const hasDailyData = computed(() => !!props.dailyGifts)
const gifts = computed(() => props.dailyGifts?.gifts || [])

function formatTime(timestamp: number) {
  if (!timestamp)
    return '未领取'
  const d = new Date(timestamp)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function getGiftStatusText(gift: any) {
  if (!gift)
    return '未知'
  if (gift.key === 'vip_daily_gift' && gift.hasGift === false)
    return '未开通'
  if (gift.key === 'month_card_gift' && gift.hasCard === false)
    return '未开通'
  if (gift.doneToday)
    return '今日已完成'
  if (gift.enabled)
    return '等待执行'
  return '未开启'
}

function formatGiftSubText(gift: any) {
  if (!gift)
    return ''
  if (gift.key === 'vip_daily_gift' && gift.hasGift === false)
    return '未开通QQ会员或无每日礼包'
  if (gift.key === 'month_card_gift' && gift.hasCard === false)
    return '未购买月卡或已过期'
  const ts = Number(gift.lastAt || 0)
  if (!ts)
    return ''
  if (gift.doneToday)
    return `完成时间 ${formatTime(ts)}`
  if (gift.enabled)
    return `上次执行 ${formatTime(ts)}`
  return `上次检测 ${formatTime(ts)}`
}

function formatGiftProgress(gift: any) {
  if (!gift)
    return ''
  const total = Number(gift.totalCount || 0)
  const current = Number(gift.completedCount || 0)
  if (!total)
    return ''
  return `进度：${current}/${total}`
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Daily Gifts Grid -->
    <div class="farm-card rounded-xl p-4">
      <h3 class="mb-3 flex items-center gap-2 font-medium" style="color: var(--theme-primary, #ec4899)">
        <span>🎁</span>
        <span>每日礼包 & 任务</span>
      </h3>

      <div
        v-if="!hasDailyData"
        class="rounded-xl p-6 text-center text-sm"
        style="background: color-mix(in srgb, var(--theme-bg, #fff) 90%, var(--theme-primary, #3b82f6)); color: var(--theme-text, #6b7280); opacity: 0.7"
      >
        请登录账号后查看
      </div>
      <div
        v-else-if="!gifts.length"
        class="rounded-xl p-6 text-center text-sm"
        style="background: color-mix(in srgb, var(--theme-bg, #fff) 90%, var(--theme-primary, #3b82f6)); color: var(--theme-text, #6b7280); opacity: 0.7"
      >
        暂无每日礼包与任务数据
      </div>
      <div v-else class="grid grid-cols-2 gap-3 2xl:grid-cols-3 sm:grid-cols-3 2xl:gap-4">
        <div
          v-for="gift in gifts"
          :key="gift.key"
          class="farm-card flex flex-col justify-between rounded-xl p-3 2xl:p-4"
        >
          <div class="mb-2 flex items-center gap-2">
            <div
              class="h-7 w-7 flex flex-shrink-0 items-center justify-center rounded-lg text-base 2xl:h-8 2xl:w-8 2xl:text-lg"
              :class="gift.doneToday ? 'bg-green-100 dark:bg-green-900/30' : (gift.enabled ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-700')"
            >
              <span>{{ getGiftIcon(gift.key) }}</span>
              />
            </div>
            <span class="text-sm font-medium leading-tight 2xl:text-base" style="color: var(--theme-text, #374151)">
              {{ gift.label }}
            </span>
          </div>

          <div class="flex items-end justify-between">
            <span
              class="text-xs 2xl:text-sm"
              :class="gift.doneToday ? 'text-green-500' : (gift.enabled ? 'text-blue-500' : 'text-gray-400')"
            >
              {{ getGiftStatusText(gift) }}
            </span>

            <div class="flex flex-col items-end">
              <span v-if="formatGiftProgress(gift)" class="text-xs font-bold 2xl:text-sm" style="color: var(--theme-secondary, #6b7280)">
                {{ formatGiftProgress(gift) }}
              </span>
              <span
                v-if="formatGiftSubText(gift)"
                class="mt-0.5 text-[10px] text-gray-400 2xl:text-xs"
              >
                {{ formatGiftSubText(gift) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
