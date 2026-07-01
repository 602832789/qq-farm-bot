<script setup lang="ts">
import type { QingmeiActivity } from '@/stores/activity'
import BaseButton from '@/components/ui/BaseButton.vue'

defineProps<{
  activity?: QingmeiActivity | null
  loading?: boolean
}>()

defineEmits<{
  claim: []
}>()

function formatTime(value?: number) {
  if (!value)
    return '-'
  return new Date(value * 1000).toLocaleString()
}
</script>

<template>
  <section class="overflow-hidden rounded-lg bg-white shadow-sm dark:bg-gray-800">
    <div class="from-emerald-500 to-lime-500 bg-gradient-to-r px-5 py-4 text-white">
      <div class="flex items-center gap-3">
        <div class="i-carbon-fruit-bowl text-3xl" />
        <div>
          <h2 class="text-lg font-bold">
            {{ activity?.title || '青梅酿万金' }}
          </h2>
          <p class="mt-0.5 text-sm text-white/85">
            每日领取青梅种子，种植青梅参与限时酿造活动
          </p>
        </div>
      </div>
    </div>

    <div class="p-5">
      <div v-if="activity?.warning" class="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
        {{ activity.warning }}
      </div>

      <div class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-4">
          <div class="grid h-24 w-24 shrink-0 place-items-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
            <img
              v-if="activity?.reward?.image"
              :src="activity.reward.image"
              alt="青梅种子"
              class="h-20 w-20 object-contain"
            >
            <div v-else class="i-carbon-sprout text-4xl text-emerald-500" />
          </div>
          <div>
            <div class="text-lg text-gray-900 font-semibold dark:text-gray-100">
              {{ activity?.reward?.itemName || '青梅种子' }}
            </div>
            <div class="mt-1 text-2xl text-emerald-600 font-bold dark:text-emerald-300">
              × {{ activity?.reward?.itemCount || 24 }}
            </div>
            <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {{ formatTime(activity?.startTime) }} — {{ formatTime(activity?.endTime) }}
            </div>
          </div>
        </div>

        <BaseButton
          class="min-w-32"
          variant="primary"
          :loading="loading"
          :disabled="loading || activity?.claimed"
          @click="$emit('claim')"
        >
          {{ activity?.claimed ? '今日已领取' : '领取 24 个' }}
        </BaseButton>
      </div>
    </div>
  </section>
</template>
