<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import DecorationGoodsCard from '@/components/shop/DecorationGoodsCard.vue'
import MallGoodsCard from '@/components/shop/MallGoodsCard.vue'
import PetGoodsCard from '@/components/shop/PetGoodsCard.vue'
import SeedGoodsCard from '@/components/shop/SeedGoodsCard.vue'
import ShopAccountHeader from '@/components/shop/ShopAccountHeader.vue'
import ShopEmptyState from '@/components/shop/ShopEmptyState.vue'
import ShopTabToolbar from '@/components/shop/ShopTabToolbar.vue'
import { createShopAvailability } from '@/composables/shop/useShopAvailability'
import { useAccountStore } from '@/stores/account'
import { useShopStore } from '@/stores/shop'
import { useStatusStore } from '@/stores/status'
import { useToastStore } from '@/stores/toast'

const accountStore = useAccountStore()
const shopStore = useShopStore()
const statusStore = useStatusStore()
const toast = useToastStore()

const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { status } = storeToRefs(statusStore)
const {
  seeds,
  pets,
  decorations,
  mallGoods,
  loading,
  petLoading,
  decorationLoading,
  mallLoading,
  error,
  petError,
  decorationError,
  mallError,
  userGoldBean,
} = storeToRefs(shopStore)

const tab = ref<'seed' | 'pet' | 'decoration' | 'mall'>('seed')
const ascending = ref(true)

const showConfirm = ref(false)
const confirmTitle = ref('确认购买')
const confirmMessage = ref('')
const confirmLoading = ref(false)
const pendingAction = ref<null | (() => Promise<void>)>(null)

const currentLevel = computed(() => status.value?.status?.level || 0)
const currentGold = computed(() => status.value?.status?.gold || 0)
const currentCoupon = computed(() => status.value?.status?.coupon || 0)
const isAnyLoading = computed(() => loading.value || petLoading.value || decorationLoading.value || mallLoading.value)
const {
  canAffordGoods,
  canAffordDecoration,
  canAffordMall,
  getSeedHint,
  getPetHint,
  getDecorationHint,
  getMallHint,
  getSeedStatusLabel,
  getPetStatusLabel,
  getDecorationStatusLabel,
  getMallStatusLabel,
} = createShopAvailability({
  currentLevel: () => currentLevel.value,
  currentGold: () => currentGold.value,
  currentCoupon: () => currentCoupon.value,
  userGoldBean: () => userGoldBean.value,
})

const sortedSeeds = computed(() => {
  return [...seeds.value].sort((a, b) => ascending.value ? a.seedLevel - b.seedLevel : b.seedLevel - a.seedLevel)
})

const activeError = computed(() => {
  if (tab.value === 'seed')
    return error.value
  if (tab.value === 'pet')
    return petError.value
  if (tab.value === 'decoration')
    return decorationError.value
  return mallError.value
})
const activeIsEmpty = computed(() => {
  if (tab.value === 'seed')
    return sortedSeeds.value.length === 0
  if (tab.value === 'pet')
    return pets.value.length === 0
  if (tab.value === 'decoration')
    return decorations.value.length === 0
  return mallGoods.value.length === 0
})
const activeEmptyMessage = computed(() => {
  switch (tab.value) {
    case 'seed':
      return '暂无种子商品，先刷新商城数据。'
    case 'pet':
      return '暂无宠物商品。'
    case 'decoration':
      return '暂无装扮商品。'
    case 'mall':
      return '暂无道具商品。'
  }
  return '暂无商品。'
})

function openConfirm(title: string, message: string, action: () => Promise<void>) {
  confirmTitle.value = title
  confirmMessage.value = message
  pendingAction.value = action
  showConfirm.value = true
}

async function runConfirmedAction() {
  if (!pendingAction.value)
    return
  confirmLoading.value = true
  try {
    await pendingAction.value()
    showConfirm.value = false
  }
  finally {
    confirmLoading.value = false
    pendingAction.value = null
  }
}

function closeConfirm() {
  if (confirmLoading.value)
    return
  showConfirm.value = false
  pendingAction.value = null
}

async function refreshAll() {
  if (!currentAccountId.value)
    return
  await shopStore.refreshAll(currentAccountId.value)
}

async function buyGoods(item: any) {
  if (!currentAccountId.value)
    return
  const result = await shopStore.buyGoods(currentAccountId.value, item.id, 1, item.price)
  if (result?.ok) {
    toast.success(`已购买 ${item.name}`)
    await refreshAll()
  }
  else {
    toast.error(result?.error || '购买失败')
  }
}

async function buyMallGoods(item: any) {
  if (!currentAccountId.value)
    return
  const result = await shopStore.buyMallGoods(currentAccountId.value, item.goodsId, 1)
  if (result?.ok) {
    toast.success(`已购买 ${item.name}`)
    await refreshAll()
  }
  else {
    toast.error(result?.error || '购买失败')
  }
}

function confirmBuyGoods(item: any, currencyLabel: string) {
  openConfirm(
    '确认购买',
    `确定购买 ${item.name} 吗？\n价格：${Number(item.price || 0).toLocaleString()} ${currencyLabel}`,
    () => buyGoods(item),
  )
}

function confirmBuyMallGoods(item: any) {
  const priceText = item.isFree ? '免费' : `${Number(item.price || 0).toLocaleString()} 点券`
  openConfirm(
    '确认购买',
    `确定购买 ${item.name} 吗？\n价格：${priceText}`,
    () => buyMallGoods(item),
  )
}

watch(currentAccountId, () => {
  shopStore.clearShopData()
  refreshAll()
})

onMounted(() => {
  refreshAll()
})
</script>

<template>
  <section class="space-y-4">
    <div class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
      <div class="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <ShopAccountHeader
          :account-name="currentAccount?.name"
          :level="currentLevel"
          :gold="currentGold"
          :coupon="currentCoupon"
          :gold-bean="userGoldBean"
        />

        <ShopTabToolbar
          v-model:tab="tab"
          :ascending="ascending"
          :loading="isAnyLoading"
          :disabled="!currentAccountId"
          @toggle-ascending="ascending = !ascending"
          @refresh="refreshAll"
        />
      </div>

      <div v-if="!currentAccountId" class="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
        请先选择账号，再查看商城。
      </div>

      <div v-else-if="isAnyLoading && activeIsEmpty" class="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
        正在加载当前分区商品...
      </div>

      <div v-else-if="activeError && activeIsEmpty" class="rounded-lg bg-red-50 p-8 text-center text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
        {{ activeError }}
      </div>

      <div v-else-if="tab === 'seed'" class="space-y-4">
        <div v-if="error" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {{ error }}
        </div>
        <ShopEmptyState v-if="!sortedSeeds.length" :message="activeEmptyMessage" />
        <div class="grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-3">
          <SeedGoodsCard
            v-for="item in sortedSeeds"
            :key="item.id"
            :item="item"
            :current-level="currentLevel"
            :can-afford="canAffordGoods(item)"
            :status-label="getSeedStatusLabel(item)"
            :hint="getSeedHint(item)"
            @buy="confirmBuyGoods($event, '金币')"
          />
        </div>
      </div>

      <div v-else-if="tab === 'pet'" class="space-y-4">
        <div v-if="petError" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {{ petError }}
        </div>
        <ShopEmptyState v-if="!pets.length" :message="activeEmptyMessage" />
        <div class="grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-3">
          <PetGoodsCard
            v-for="item in pets"
            :key="item.id"
            :item="item"
            :current-level="currentLevel"
            :can-afford="canAffordGoods(item)"
            :status-label="getPetStatusLabel(item)"
            :hint="getPetHint(item)"
            @buy="confirmBuyGoods"
          />
        </div>
      </div>

      <div v-else-if="tab === 'decoration'" class="space-y-4">
        <div v-if="decorationError" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {{ decorationError }}
        </div>
        <ShopEmptyState v-if="!decorations.length" :message="activeEmptyMessage" />
        <div class="grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-3">
          <DecorationGoodsCard
            v-for="item in decorations"
            :key="item.id"
            :item="item"
            :can-afford="canAffordDecoration(item)"
            :status-label="getDecorationStatusLabel(item)"
            :hint="getDecorationHint(item)"
            @buy="confirmBuyGoods($event, '金豆豆')"
          />
        </div>
      </div>

      <div v-else class="space-y-4">
        <div v-if="mallError" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {{ mallError }}
        </div>
        <ShopEmptyState v-if="!mallGoods.length" :message="activeEmptyMessage" />
        <div class="grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-3">
          <MallGoodsCard
            v-for="item in mallGoods"
            :key="item.goodsId"
            :item="item"
            :can-afford="canAffordMall(item)"
            :status-label="getMallStatusLabel(item)"
            :hint="getMallHint(item)"
            @buy="confirmBuyMallGoods"
          />
        </div>
      </div>
    </div>

    <ConfirmModal
      :show="showConfirm"
      :title="confirmTitle"
      :message="confirmMessage"
      :loading="confirmLoading"
      @confirm="runConfirmedAction"
      @close="closeConfirm"
      @cancel="closeConfirm"
    />
  </section>
</template>
