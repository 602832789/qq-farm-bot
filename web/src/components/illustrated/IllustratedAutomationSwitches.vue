<script setup lang="ts">
import type { AutomationConfig } from '@/stores/setting'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useAccountStore } from '@/stores/account'
import { useSettingStore } from '@/stores/setting'
import { useToastStore } from '@/stores/toast'

const accountStore = useAccountStore()
const settingStore = useSettingStore()
const toast = useToastStore()
const { currentAccountId } = storeToRefs(accountStore)
const { settings, loadedAccountId } = storeToRefs(settingStore)
const saving = ref(false)
let saveQueue: Promise<unknown> = Promise.resolve()

watch(currentAccountId, async (id) => {
  if (!id || String(id) === loadedAccountId.value)
    return
  try {
    await settingStore.fetchSettings(String(id))
  }
  catch {
    // 设置读取失败时保持当前值，不阻塞图鉴页面
  }
}, { immediate: true })

function automation(): AutomationConfig {
  return settings.value.automation || {}
}

/** 改开关即保存，与「功能模块 → 日常与活动 → 收藏图鉴」共用同一份配置。 */
function model(key: keyof AutomationConfig) {
  return computed<boolean>({
    get: () => !!automation()[key],
    set: (value: boolean) => {
      (automation() as Record<string, any>)[key as string] = value
      void persist()
    },
  })
}

const autoClaim = model('illustrated_auto_claim_rewards')
const autoBuy = model('illustrated_auto_buy_missing_seeds')
const skipBag = model('illustrated_buy_skip_bag')

function persist() {
  const id = String(currentAccountId.value || '')
  if (!id)
    return
  const snapshot = { ...automation() }
  saveQueue = saveQueue.then(async () => {
    saving.value = true
    try {
      const res = await settingStore.saveSettings(id, { automation: snapshot })
      if (!res.ok)
        toast.error(res.error || '图鉴自动化开关保存失败')
    }
    finally {
      saving.value = false
    }
  })
}
</script>

<template>
  <div class="illustrated-auto">
    <div class="illustrated-auto__title">
      每日自动托管
      <span v-if="saving" class="illustrated-auto__saving">保存中…</span>
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <BaseSwitch v-model="autoClaim" label="自动领取图鉴奖励" />
      <BaseSwitch v-model="autoBuy" label="自动购买未点亮种子" />
      <BaseSwitch v-model="skipBag" label="一键购买跳过背包已有" />
    </div>
    <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
      每天检查一次；自动购买只买未点亮、可下单且背包里没有的种子，会实际消耗金币。此处修改立即保存，也可以在「功能模块 → 日常与活动 → 收藏图鉴」里设置。
    </p>
  </div>
</template>

<style scoped>
.illustrated-auto {
  flex-shrink: 0;
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-surface);
}
.illustrated-auto__title {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-ink);
}
.illustrated-auto__saving {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 400;
  color: var(--ui-muted);
}
</style>
