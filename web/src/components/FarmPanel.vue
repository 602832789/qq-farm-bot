<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import LandCard from '@/components/LandCard.vue'
import { useAccountStore } from '@/stores/account'
import { useFarmStore } from '@/stores/farm'
import { useStatusStore } from '@/stores/status'

const farmStore = useFarmStore()
const accountStore = useAccountStore()
const statusStore = useStatusStore()
const { lands, summary, loading } = storeToRefs(farmStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { status, loading: statusLoading, realtimeConnected } = storeToRefs(statusStore)

const operating = ref(false)
const confirmVisible = ref(false)
const confirmConfig = ref({
  title: '',
  message: '',
  opType: '',
})

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
    clear: '确定要一键除草/除虫吗？',
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
  { type: 'harvest', label: '收获', icon: '🌾', color: 'bg-[#5bb8f5] hover:bg-[#4aa8e5]' },
  { type: 'clear', label: '除草/虫', icon: '🌿', color: 'bg-[#4a8c3f] hover:bg-[#3a7c2f]' },
  { type: 'plant', label: '种植', icon: '🌱', color: 'bg-[#6dbf5b] hover:bg-[#5daf4b]' },
  { type: 'upgrade', label: '升级土地', icon: '⬆️', color: 'bg-[#a855f7] hover:bg-[#9333ea]' },
  { type: 'all', label: '一键全收', icon: '⚡', color: 'bg-[#f0c040] hover:bg-[#e0b030] text-[#3d2b1f]' },
]

async function refresh() {
  if (currentAccountId.value) {
    const acc = currentAccount.value
    if (!acc)
      return

    if (!realtimeConnected.value) {
      await statusStore.fetchStatus(currentAccountId.value)
    }

    if (acc.running && status.value?.connection?.connected) {
      farmStore.fetchLands(currentAccountId.value)
    }
  }
}

watch(currentAccountId, () => {
  refresh()
})

const { pause, resume } = useIntervalFn(() => {
  if (lands.value) {
    lands.value = lands.value.map((l: any) =>
      l.matureInSec > 0 ? { ...l, matureInSec: l.matureInSec - 1 } : l,
    )
  }
}, 1000)

const { pause: pauseRefresh, resume: resumeRefresh } = useIntervalFn(refresh, 60000)

onMounted(() => {
  refresh()
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
        <h3 class="font-display flex items-center gap-2 text-xl font-bold">
          🌾 土地详情
        </h3>
        <div class="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
          <button
            v-for="op in operations"
            :key="op.type"
            class="cartoon-btn flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            :class="op.color"
            :disabled="operating"
            @click="handleOperate(op.type)"
          >
            <span>{{ op.icon }}</span>
            {{ op.label }}
          </button>
        </div>
      </div>

      <!-- Summary -->
      <div class="flex flex-wrap gap-4 border-b border-gray-100 bg-gradient-to-r from-green-50 to-yellow-50 p-5 text-sm dark:border-gray-700 dark:bg-gray-900/50">
        <div class="farm-card flex items-center gap-2 rounded-full bg-orange-100 px-4 py-1.5 text-orange-700 shadow-sm dark:bg-orange-900/30 dark:text-orange-400">
          <span>🌾</span>
          <div class="i-carbon-clean" />
          <span class="font-body font-semibold">可收: {{ summary?.harvestable || 0 }}</span>
        </div>
        <div class="farm-card flex items-center gap-2 rounded-full bg-green-100 px-4 py-1.5 text-green-700 shadow-sm dark:bg-green-900/30 dark:text-green-400">
          <span>🌿</span>
          <div class="i-carbon-sprout" />
          <span class="font-body font-semibold">生长: {{ summary?.growing || 0 }}</span>
        </div>
        <div class="farm-card flex items-center gap-2 rounded-full bg-gray-100 px-4 py-1.5 text-gray-700 shadow-sm dark:bg-gray-800 dark:text-gray-400">
          <span>🟫</span>
          <div class="i-carbon-checkbox" />
          <span class="font-body font-semibold">空闲: {{ summary?.empty || 0 }}</span>
        </div>
        <div class="farm-card flex items-center gap-2 rounded-full bg-red-100 px-4 py-1.5 text-red-700 shadow-sm dark:bg-red-900/30 dark:text-red-400">
          <span>🥀</span>
          <div class="i-carbon-warning" />
          <span class="font-body font-semibold">枯萎: {{ summary?.dead || 0 }}</span>
        </div>
      </div>

      <!-- Grid -->
      <div class="p-5">
        <div v-if="loading || statusLoading" class="flex justify-center py-12">
          <div class="i-svg-spinners-90-ring-with-bg text-4xl text-green-500" />
        </div>

        <div v-else-if="!currentAccountId" class="farm-card flex flex-col items-center justify-center gap-4 rounded-2xl bg-white p-12 text-center text-gray-500 shadow-md dark:bg-gray-800">
          <div class="text-5xl">🧑‍🌾</div>
          <div>
            <div class="font-display text-lg text-gray-700 font-medium dark:text-gray-300">
              未登录账号
            </div>
            <div class="font-body mt-1 text-sm text-gray-400">
              请先添加农场账号开始种田吧!
            </div>
          </div>
        </div>

        <div v-else-if="!status?.connection?.connected" class="farm-card flex flex-col items-center justify-center gap-4 rounded-2xl bg-white p-12 text-center text-gray-500 shadow-md dark:bg-gray-800">
          <div class="text-5xl">📡</div>
          <div>
            <div class="font-display text-lg text-gray-700 font-medium dark:text-gray-300">
              账号未登录
            </div>
            <div class="font-body mt-1 text-sm text-gray-400">
              请先运行账号或检查网络连接 🔄
            </div>
          </div>
        </div>

        <div v-else-if="!lands || lands.length === 0" class="flex flex-col items-center justify-center gap-4 py-16">
          <div class="text-6xl">🌱🏡🌻</div>
          <div class="font-display text-lg text-gray-500">
            还没有种下作物哦~
          </div>
          <div class="font-body text-sm text-gray-400">
            快去种下第一棵种子吧! 🧑‍🌾✨
          </div>
        </div>

        <div v-else class="grid grid-cols-2 gap-4 lg:grid-cols-6 md:grid-cols-4 sm:grid-cols-3">
          <LandCard
            v-for="land in lands"
            :key="land.id"
            :land="land"
          />
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
  </div>
</template>
