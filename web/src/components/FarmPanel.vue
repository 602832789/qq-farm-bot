<script setup lang="ts">
import type { FriendInteractionItemDto, FriendInteractionResultDto } from '@/stores/friend'
import { useIntervalFn } from '@vueuse/core'
import { NButton } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import LandCard from '@/components/LandCard.vue'
import { useAccountStore } from '@/stores/account'
import { useFarmStore } from '@/stores/farm'
import { useToastStore } from '@/stores/toast'

const farmStore = useFarmStore()
const accountStore = useAccountStore()
const toast = useToastStore()
const {
  lands,
  summary,
  loading,
  loaded,
  error,
  interactionItems,
  interactionItemsLoading,
  interactionItemsError,
  interactionUsePending,
  interactionUseError,
  dogSkillGiftPendingCount,
  dogSkillGiftStatusLoading,
  dogSkillGiftClaiming,
  dogSkillGiftError,
} = storeToRefs(farmStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)

const operating = ref(false)
const manualRefreshing = ref(false)
const refreshIconClass = 'i-carbon-renew'
const confirmVisible = ref(false)
const confirmConfig = ref({
  title: '',
  message: '',
  opType: '',
})

const selectedInteractionItemId = ref('')
const selectedInteractionLandIds = ref<Record<string, string[]>>({})
const lastInteractionResults = ref<Record<string, FriendInteractionResultDto[]>>({})
const interactionConfirmVisible = ref(false)
const interactionConfirmMessage = ref('')

const selectedInteractionItem = computed<FriendInteractionItemDto | null>(() => (
  interactionItems.value.find(item => String(item.itemId) === selectedInteractionItemId.value) || null
))

async function executeOperate() {
  if (!currentAccountId.value || !confirmConfig.value.opType)
    return
  confirmVisible.value = false
  operating.value = true
  try {
    await farmStore.operate(currentAccountId.value, confirmConfig.value.opType)
  }
  finally {
    operating.value = false
  }
}

function handleOperate(opType: string) {
  if (!currentAccountId.value)
    return

  const confirmMap: Record<string, string> = {
    harvest: '确定要收获所有成熟作物吗？',
    clear: '确定要一键务农吗？(除草+除虫+浇水)',
    plant: '确定要一键种植吗？(根据策略配置)',
    upgrade: '确定要升级所有可升级的土地吗？(消耗金币)',
    all: '确定要一键全收吗？(包含收获、除草、种植等)',
  }

  confirmConfig.value = {
    title: '确认操作',
    message: confirmMap[opType] || '确定执行此操作吗？',
    opType,
  }
  confirmVisible.value = true
}

const operations = [
  { type: 'harvest', label: '收获', icon: 'i-carbon-wheat', buttonType: 'info' },
  { type: 'clear', label: '一键务农', icon: 'i-carbon-clean', buttonType: 'success' },
  { type: 'plant', label: '种植', icon: 'i-carbon-sprout', buttonType: 'primary' },
  { type: 'upgrade', label: '升级土地', icon: 'i-carbon-upgrade', buttonType: 'warning' },
  { type: 'all', label: '一键全收', icon: 'i-carbon-flash', buttonType: 'primary' },
] as const

function interactionSelectionKey(itemId: unknown = selectedInteractionItemId.value) {
  return String(itemId || '')
}

function selectedInteractionIds(itemId: unknown = selectedInteractionItemId.value) {
  return selectedInteractionLandIds.value[interactionSelectionKey(itemId)] || []
}

function usedInteractionIdSet(itemId: unknown = selectedInteractionItemId.value) {
  if (!currentAccountId.value || !itemId)
    return new Set<string>()
  return new Set(farmStore.getInteractionUsedLandIds(currentAccountId.value, itemId))
}

// 与好友页保持同一口径：只有仍在生长期的作物才允许提交道具使用。
function isInteractionLandCandidate(land: any) {
  return !!land?.unlocked
    && !land?.occupiedByMaster
    && !!String(land?.plantName || '').trim()
    && !['locked', 'empty', 'dead', 'harvestable', 'stealable', 'harvested'].includes(String(land?.status || ''))
}

function isInteractionLandSelected(land: any) {
  return selectedInteractionIds().includes(String(land?.id || ''))
}

function isInteractionLandDisabled(land: any) {
  const item = selectedInteractionItem.value
  return !item
    || item.count < 1
    || interactionUsePending.value
    || !isInteractionLandCandidate(land)
    || usedInteractionIdSet(item.itemId).has(String(land?.id || ''))
}

function interactionLandSelectionLabel(land: any) {
  const landId = String(land?.id || '')
  if (usedInteractionIdSet().has(landId))
    return '本次已用'
  if (['harvestable', 'stealable', 'harvested'].includes(String(land?.status || '')))
    return '成熟不可用'
  if (!isInteractionLandCandidate(land))
    return '不可用'
  return ''
}

function setSelectedInteractionIds(ids: string[], itemId: unknown = selectedInteractionItemId.value) {
  selectedInteractionLandIds.value = {
    ...selectedInteractionLandIds.value,
    [interactionSelectionKey(itemId)]: [...new Set(ids.map(String))].sort((left, right) => Number(left) - Number(right)),
  }
}

function toggleInteractionLand(land: any) {
  const item = selectedInteractionItem.value
  if (!item || isInteractionLandDisabled(land))
    return
  const landId = String(land?.id || '')
  const next = new Set(selectedInteractionIds(item.itemId))
  if (next.has(landId)) {
    next.delete(landId)
  }
  else {
    if (next.size >= item.count) {
      toast.info(`当前只有 ${item.count} 个${item.name}`)
      return
    }
    next.add(landId)
  }
  setSelectedInteractionIds([...next], item.itemId)
}

function selectAllInteractionLands() {
  const item = selectedInteractionItem.value
  if (!item)
    return
  const used = usedInteractionIdSet(item.itemId)
  const candidates = (lands.value || [])
    .filter(land => isInteractionLandCandidate(land) && !used.has(String(land.id)))
    .sort((left, right) => Number(left.id) - Number(right.id))
    .slice(0, item.count)
    .map(land => String(land.id))
  setSelectedInteractionIds(candidates, item.itemId)
}

function interactionFailures() {
  const results = lastInteractionResults.value[interactionSelectionKey()] || []
  return results.filter(result => !result.ok)
}

function requestUseInteractionItem() {
  const item = selectedInteractionItem.value
  if (!currentAccountId.value || !item || selectedInteractionIds(item.itemId).length === 0)
    return
  const count = selectedInteractionIds(item.itemId).length
  const saleConditionWarning = item.saleConditionSatisfiedCount > 0
    ? `该道具库存中有 ${item.saleConditionSatisfiedCount} 个已满足游戏配置的出售条件，可能已过活动或有效期，`
    : ''
  interactionConfirmMessage.value = `${saleConditionWarning}将在自己农场的 ${count} 块土地上按编号依次使用“${item.name}”。作物状态、地块限制及道具时效由服务端最终校验，部分地块可能失败；是否继续？`
  interactionConfirmVisible.value = true
}

async function executeUseInteractionItem() {
  const accountId = currentAccountId.value
  const item = selectedInteractionItem.value
  interactionConfirmVisible.value = false
  if (!accountId || !item)
    return
  const landIds = selectedInteractionIds(item.itemId)
  if (landIds.length === 0)
    return

  const result = await farmStore.useInteractionItemBatch(accountId, item.itemId, landIds)
  if (!result) {
    toast.error(interactionUseError.value || `${item.name}使用失败`)
    return
  }
  lastInteractionResults.value = {
    ...lastInteractionResults.value,
    [interactionSelectionKey(item.itemId)]: result.results || [],
  }
  const used = new Set(result.usedLandIds || [])
  setSelectedInteractionIds(landIds.filter(landId => !used.has(landId)), item.itemId)
  const successCount = Number(result.successCount || 0)
  const failureCount = Number(result.failureCount || 0)
  if (successCount > 0 && failureCount === 0)
    toast.success(result.message || `已按顺序使用 ${successCount} 个${item.name}`)
  else if (successCount > 0)
    toast.warning(result.message || `成功 ${successCount} 块，跳过 ${failureCount} 块`)
  else
    toast.warning(result.message || `所选地块当前均不可使用${item.name}`)
}

async function refreshFarmData() {
  const accountId = currentAccountId.value
  if (!accountId || !currentAccount.value?.running)
    return
  await Promise.all([
    farmStore.fetchLands(accountId),
    farmStore.fetchInteractionItems(accountId),
  ])
}

async function refreshWithDogGifts() {
  const accountId = currentAccountId.value
  if (!accountId || !currentAccount.value?.running)
    return

  manualRefreshing.value = true
  try {
    await Promise.all([
      farmStore.fetchLands(accountId),
      farmStore.fetchInteractionItems(accountId),
      farmStore.fetchDogSkillGiftStatus(accountId),
    ])
  }
  finally {
    if (currentAccountId.value === accountId)
      manualRefreshing.value = false
  }
}

async function claimDogSkillGifts() {
  const accountId = currentAccountId.value
  if (!accountId)
    return

  const result = await farmStore.claimDogSkillGifts(accountId)
  if (!result) {
    toast.error(dogSkillGiftError.value || '拾取同气连枝礼包失败')
    return
  }

  const claimed = Math.max(0, Number(result.claimed || 0))
  if (claimed > 0)
    toast.success(`已拾取同气连枝礼包 x${claimed}`)
  else
    toast.warning('当前没有待拾取的同气连枝礼包')
}

watch(currentAccountId, () => {
  farmStore.resetLandState()
  selectedInteractionItemId.value = ''
  selectedInteractionLandIds.value = {}
  lastInteractionResults.value = {}
})

watch(interactionItems, (items) => {
  const first = items[0]
  if (!first) {
    selectedInteractionItemId.value = ''
    return
  }
  if (!items.some(item => String(item.itemId) === selectedInteractionItemId.value))
    selectedInteractionItemId.value = String(first.itemId)
})

watch([currentAccountId, () => currentAccount.value?.running], () => {
  if (!currentAccount.value?.running) {
    farmStore.resetLandState()
    return
  }
  farmStore.resetDogSkillGiftState()
  void refreshWithDogGifts()
}, { immediate: true })

const { pause, resume } = useIntervalFn(() => {
  for (const land of lands.value || []) {
    if (land.matureInSec > 0)
      land.matureInSec--
  }
}, 1000)

const { pause: pauseRefresh, resume: resumeRefresh } = useIntervalFn(refreshFarmData, 60000)

onMounted(() => {
  resume()
  resumeRefresh()
})

onUnmounted(() => {
  pause()
  pauseRefresh()
})
</script>

<template>
  <div class="space-y-5">
    <div class="cartoon-card farm-card rounded-2xl bg-white shadow-lg dark:bg-gray-800">
      <!-- Header with Title and Actions -->
      <div class="flex flex-col items-center justify-between gap-4 border-b border-gray-100 p-5 sm:flex-row dark:border-gray-700">
        <div class="w-full flex items-center justify-between gap-3 sm:w-auto">
          <h3 class="flex items-center gap-2 text-xl font-bold font-display">
            <span class="i-carbon-sprout text-green-600" /> 土地详情
          </h3>
          <NButton
            circle
            quaternary
            title="刷新土地和待拾取礼包"
            :loading="manualRefreshing || dogSkillGiftStatusLoading"
            :disabled="!currentAccountId || !currentAccount?.running"
            @click="refreshWithDogGifts"
          >
            <span :class="refreshIconClass" />
          </NButton>
        </div>
        <div class="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
          <NButton
            v-for="op in operations"
            :key="op.type"
            :type="op.buttonType"
            :disabled="operating || !currentAccount?.running"
            @click="handleOperate(op.type)"
          >
            <span :class="op.icon" />
            {{ op.label }}
          </NButton>
        </div>
      </div>

      <div
        v-if="dogSkillGiftPendingCount > 0"
        class="flex flex-col gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 sm:flex-row sm:items-center dark:border-amber-800 dark:bg-amber-950/30"
      >
        <span class="i-carbon-gift shrink-0 text-2xl text-amber-600 dark:text-amber-300" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-baseline gap-2 text-amber-950 dark:text-amber-100">
            <strong>待拾取同气连枝礼包</strong>
            <span>x{{ dogSkillGiftPendingCount }}</span>
          </div>
          <div class="text-xs text-amber-700 dark:text-amber-300">
            护主犬技能掉落，等待主人拾取
          </div>
        </div>
        <NButton type="warning" size="small" :loading="dogSkillGiftClaiming" @click="claimDogSkillGifts">
          <span class="i-carbon-download mr-1" />
          拾取
        </NButton>
      </div>

      <div
        v-if="dogSkillGiftError"
        class="flex flex-col gap-3 border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 sm:flex-row sm:items-center dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
      >
        <span class="i-carbon-warning-alt shrink-0 text-lg" />
        <span class="min-w-0 flex-1">{{ dogSkillGiftError }}</span>
        <NButton
          size="small"
          secondary
          type="error"
          :loading="dogSkillGiftStatusLoading"
          :disabled="!currentAccountId || !currentAccount?.running"
          @click="refreshWithDogGifts"
        >
          重新查询
        </NButton>
      </div>

      <!-- Summary -->
      <div class="flex flex-wrap gap-x-5 gap-y-2 border-b border-gray-100 px-5 py-3 text-sm dark:border-gray-700">
        <div class="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
          <div class="i-carbon-clean" />
          <span class="font-body font-semibold">可收: {{ loaded && !error ? (summary?.harvestable || 0) : '--' }}</span>
        </div>
        <div class="flex items-center gap-1.5 text-green-700 dark:text-green-300">
          <div class="i-carbon-sprout" />
          <span class="font-body font-semibold">生长: {{ loaded && !error ? (summary?.growing || 0) : '--' }}</span>
        </div>
        <div class="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
          <div class="i-carbon-checkbox" />
          <span class="font-body font-semibold">空闲: {{ loaded && !error ? (summary?.empty || 0) : '--' }}</span>
        </div>
        <div class="flex items-center gap-1.5 text-red-700 dark:text-red-300">
          <div class="i-carbon-warning" />
          <span class="font-body font-semibold">枯萎: {{ loaded && !error ? (summary?.dead || 0) : '--' }}</span>
        </div>
      </div>

      <!-- Grid -->
      <div class="p-5">
        <div v-if="loading" class="flex justify-center py-12">
          <div class="i-svg-spinners-90-ring-with-bg text-4xl text-green-500" />
        </div>

        <div v-else-if="!currentAccountId" class="flex flex-col items-center justify-center gap-4 farm-card rounded-2xl bg-white p-12 text-center text-gray-500 shadow-md dark:bg-gray-800">
          <div class="i-carbon-user-avatar text-5xl" />
          <div>
            <div class="text-lg text-gray-700 font-medium font-display dark:text-gray-300">
              未登录账号
            </div>
            <div class="font-body mt-1 text-sm text-gray-400">
              请先添加农场账号开始种田吧!
            </div>
          </div>
        </div>

        <div v-else-if="!currentAccount?.running" class="flex flex-col items-center justify-center gap-4 farm-card rounded-2xl bg-white p-12 text-center text-gray-500 shadow-md dark:bg-gray-800">
          <div class="i-carbon-network-4 text-5xl" />
          <div>
            <div class="text-lg text-gray-700 font-medium font-display dark:text-gray-300">
              账号未运行
            </div>
            <div class="font-body mt-1 text-sm text-gray-400">
              请先启动账号；启动后会立即读取土地
            </div>
          </div>
        </div>

        <div v-else-if="error" class="flex flex-col items-center justify-center gap-3 py-16 text-center text-red-600 dark:text-red-300">
          <div class="i-carbon-warning-alt text-5xl" />
          <div class="max-w-xl text-sm">
            {{ error }}
          </div>
          <NButton secondary type="error" @click="refreshWithDogGifts">
            重新读取
          </NButton>
        </div>

        <div v-else-if="!loaded" class="flex flex-col items-center justify-center gap-3 py-16 text-center text-gray-500">
          <div class="i-carbon-data-view-alt text-5xl" />
          <div class="text-lg font-display">
            尚未读取土地详情
          </div>
          <NButton secondary @click="refreshWithDogGifts">
            立即读取
          </NButton>
        </div>

        <div v-else-if="!lands || lands.length === 0" class="flex flex-col items-center justify-center gap-3 py-16 text-center text-gray-500">
          <div class="i-carbon-sprout text-5xl text-green-500" />
          <div class="text-lg font-display">
            当前没有可展示的土地
          </div>
          <div class="font-body text-sm text-gray-400">
            这不是“尚未种植”的判断，可重新读取确认协议数据
          </div>
          <NButton secondary @click="refreshWithDogGifts">
            重新读取
          </NButton>
        </div>

        <div v-else>
          <div v-if="interactionItemsLoading || interactionItemsError || interactionItems.length > 0" class="mb-4 border border-amber-200 rounded-xl bg-amber-50/80 p-3 dark:border-amber-800 dark:bg-amber-950/25">
            <div v-if="interactionItemsLoading" class="flex items-center justify-center gap-2 py-2 text-sm text-amber-700 dark:text-amber-300">
              <span class="i-svg-spinners-90-ring-with-bg" />
              正在读取可用的互动道具
            </div>
            <div v-else-if="interactionItemsError" class="flex flex-wrap items-center justify-between gap-2 text-sm text-red-600 dark:text-red-300">
              <span>{{ interactionItemsError }}</span>
              <NButton size="small" secondary type="error" @click="currentAccountId && farmStore.fetchInteractionItems(currentAccountId)">
                重新读取
              </NButton>
            </div>
            <template v-else>
              <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div class="min-w-0 flex-1">
                  <div class="mb-2 flex items-center gap-2 text-sm text-amber-950 font-bold dark:text-amber-100">
                    <span class="i-carbon-game-console" />
                    可对自己农场使用的道具
                    <span class="text-xs text-amber-700 font-normal dark:text-amber-300">种草、黄金虫、足球等只能在好友页使用</span>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="item in interactionItems"
                      :key="item.itemId"
                      type="button"
                      class="flex items-center gap-2 border rounded-lg bg-white px-2.5 py-2 text-left transition dark:bg-gray-900"
                      :class="selectedInteractionItemId === item.itemId
                        ? 'border-amber-500 ring-2 ring-amber-200 dark:ring-amber-800'
                        : 'border-amber-200 hover:border-amber-400 dark:border-amber-800'"
                      :aria-pressed="selectedInteractionItemId === item.itemId"
                      @click="selectedInteractionItemId = item.itemId"
                    >
                      <img :src="item.image" alt="" class="h-8 w-8 object-contain">
                      <span>
                        <span class="block text-sm text-gray-800 font-semibold dark:text-gray-100">{{ item.name }}</span>
                        <span class="block text-xs text-amber-700 dark:text-amber-300">库存 {{ item.count }}</span>
                      </span>
                    </button>
                  </div>
                  <div v-if="selectedInteractionItem" class="mt-2 text-xs text-amber-800 dark:text-amber-200">
                    {{ selectedInteractionItem.description || '选择土地后按编号依次使用。' }}
                    <span class="font-medium">是否可用以服务端回包为准。</span>
                    <div v-if="selectedInteractionItem.saleConditionSatisfiedCount > 0" class="mt-1 text-red-700 font-medium dark:text-red-300">
                      其中 {{ selectedInteractionItem.saleConditionSatisfiedCount }} 个已满足游戏配置中的出售条件，可能已过活动或有效期；仍会保留供提交，是否可用由服务端判断。
                    </div>
                    <div class="mt-1 text-gray-600 dark:text-gray-300">
                      仅可选择仍在生长期的作物；成熟作物点击后只会进入收获流程。
                    </div>
                  </div>
                </div>
                <div class="flex shrink-0 flex-wrap gap-2 xl:max-w-72 xl:justify-end">
                  <NButton size="small" secondary :disabled="!selectedInteractionItem || interactionUsePending" @click="selectAllInteractionLands()">
                    全选可用
                  </NButton>
                  <NButton size="small" secondary :disabled="selectedInteractionIds().length === 0 || interactionUsePending" @click="setSelectedInteractionIds([])">
                    清空
                  </NButton>
                  <NButton type="warning" size="small" :loading="interactionUsePending" :disabled="!selectedInteractionItem || selectedInteractionIds().length === 0" @click="requestUseInteractionItem()">
                    按顺序使用 {{ selectedInteractionIds().length || '' }} 个
                  </NButton>
                </div>
              </div>
              <div v-if="interactionFailures().length > 0" class="mt-3 rounded-lg bg-white/75 px-3 py-2 text-xs text-red-700 dark:bg-gray-900/60 dark:text-red-300">
                <div class="mb-1 font-semibold">
                  未成功的地块
                </div>
                <div v-for="result in interactionFailures()" :key="`${result.landId}:${result.message}`">
                  第 {{ result.landId }} 块：{{ result.message }}
                </div>
              </div>
            </template>
          </div>

          <div class="grid grid-cols-2 gap-4 lg:grid-cols-6 md:grid-cols-4 sm:grid-cols-3">
            <LandCard
              v-for="land in lands"
              :key="land.id"
              :land="land"
              :selectable="!!selectedInteractionItem"
              :selected="isInteractionLandSelected(land)"
              :selection-disabled="isInteractionLandDisabled(land)"
              :selection-label="interactionLandSelectionLabel(land)"
              @select="toggleInteractionLand(land)"
            />
          </div>
        </div>
      </div>
    </div>

    <ConfirmModal
      :show="confirmVisible"
      :title="confirmConfig.title"
      :message="confirmConfig.message"
      @confirm="executeOperate"
      @cancel="confirmVisible = false"
    />

    <ConfirmModal
      :show="interactionConfirmVisible"
      title="确认使用互动道具"
      :message="interactionConfirmMessage"
      :loading="interactionUsePending"
      @confirm="executeUseInteractionItem"
      @cancel="interactionConfirmVisible = false"
    />
  </div>
</template>
