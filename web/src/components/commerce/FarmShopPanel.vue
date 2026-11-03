<script setup lang="ts">
import type { FarmShopGoodsDto } from '@/stores/commerce'
/**
 * 农场商店（老版 Shop.vue 移植）：种子 / 宠物 / 装扮 三个品类共用面板。
 * 数据来自 GET /api/shop/{seed|pet|decoration}，购买走 POST /api/shop/buy。
 */
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAccountStore } from '@/stores/account'
import { useCommerceStore } from '@/stores/commerce'
import { useStatusStore } from '@/stores/status'
import { useToastStore } from '@/stores/toast'
import { formatGoldAmount, formatGoldBeanAmount } from '@/utils/number-format'

const props = defineProps<{
  category: 'seed' | 'pet' | 'decoration'
}>()

const accountStore = useAccountStore()
const commerceStore = useCommerceStore()
const statusStore = useStatusStore()
const toast = useToastStore()
const { currentAccountId } = storeToRefs(accountStore)
const { status } = storeToRefs(statusStore)
const { farmShopGoods, farmShopLoading, farmShopPurchasing, error, notice } = storeToRefs(commerceStore)

// —— 老版 useShopAvailability 移植：可用性判断与文案 ——
const L = {
  soldOutSeed: '该种子当前已售罄。',
  soldOutPet: '该宠物当前已售罄。',
  levelRequired: (level: number) => `达到 ${level} 级后可购买。`,
  goldInsufficient: '当前金币不足。',
  goldBeanInsufficient: '当前金豆豆不足。',
  canBuyHint: '条件满足，可直接购买。',
  decorationHint: '可立即购买并生效。',
  decorationOwnedHint: '该头像框已拥有，无需重复购买。',
  locked: '未解锁',
  soldOut: '已售罄',
  levelLow: '等级不足',
  goldLow: '金币不足',
  goldBeanLow: '金豆豆不足',
  canBuy: '可购买',
  notOpen: '暂未开放',
  owned: '已拥有',
  buy: '立即购买',
  noDesc: '暂无描述',
  gold: '金币',
  goldBean: '金豆豆',
}

const currentLevel = computed(() => status.value?.status?.level || 0)
const currentGold = computed(() => status.value?.status?.gold || 0)
const userGoldBean = computed(() => status.value?.status?.goldBean || 0)

function priceOf(item: FarmShopGoodsDto) {
  return Number(item?.price || 0)
}

function canAffordGoods(item: FarmShopGoodsDto) {
  if (item?.isGoldenBean)
    return userGoldBean.value >= priceOf(item)
  return currentGold.value >= priceOf(item)
}

function getHint(item: FarmShopGoodsDto) {
  if (props.category === 'decoration') {
    if (item.owned)
      return L.decorationOwnedHint
    if (!item.canBuy)
      return '当前不开放购买。'
    if (userGoldBean.value < priceOf(item))
      return L.goldBeanInsufficient
    return L.decorationHint
  }
  if (item.isSoldOut)
    return props.category === 'seed' ? L.soldOutSeed : L.soldOutPet
  if (currentLevel.value < item.requiredLevel)
    return L.levelRequired(item.requiredLevel)
  if (!canAffordGoods(item))
    return item.isGoldenBean ? L.goldBeanInsufficient : L.goldInsufficient
  return L.canBuyHint
}

function getStatusLabel(item: FarmShopGoodsDto) {
  if (props.category === 'decoration') {
    if (item.owned)
      return L.owned
    return item.canBuy ? L.canBuy : L.notOpen
  }
  if (!item.unlocked)
    return L.locked
  if (item.isSoldOut)
    return L.soldOut
  if (currentLevel.value < item.requiredLevel)
    return L.levelLow
  if (!canAffordGoods(item))
    return item.isGoldenBean ? L.goldBeanLow : L.goldLow
  return L.canBuy
}

// —— 购买确认 + 数量选择（老版 ConfirmModal/PurchaseQuantityModal 移植） ——
const confirmState = ref<{
  show: boolean
  item: FarmShopGoodsDto | null
  quantityMode: boolean
}>()
const quantity = ref(1)
const confirmMessage = ref('')

const maxQuantity = computed(() => {
  const item = confirmState.value?.item
  if (!item)
    return 1
  const balance = item.isGoldenBean ? userGoldBean.value : currentGold.value
  const price = priceOf(item)
  const byBalance = price > 0 ? Math.floor(Number(balance || 0) / price) : 99
  const limitCount = Number(item?.limitCount || 0)
  const boughtNum = Number(item?.boughtNum || 0)
  const byLimit = limitCount > 0 ? Math.max(0, limitCount - boughtNum) : 99
  return Math.max(1, Math.min(99, byBalance, byLimit))
})

const normalizedQuantity = computed(() => {
  const value = Math.floor(Number(quantity.value) || 1)
  return Math.max(1, Math.min(maxQuantity.value, value))
})

function currencyLabelOf(item: FarmShopGoodsDto) {
  if (props.category === 'decoration')
    return L.goldBean
  return item.isGoldenBean ? L.goldBean : L.gold
}

function balanceOf(item: FarmShopGoodsDto) {
  return item.isGoldenBean || props.category === 'decoration' ? userGoldBean.value : currentGold.value
}

function askBuy(item: FarmShopGoodsDto) {
  quantity.value = 1
  confirmState.value = {
    show: true,
    item,
    // 种子与化肥类商品支持批量购买，其余单件确认（老版规则）。
    quantityMode: props.category === 'seed',
  }
  confirmMessage.value = props.category === 'decoration'
    ? `确定购买 ${item.name} 吗？价格：${formatGoldBeanAmount(item.price)} 金豆豆`
    : ''
}

function setQuantity(value: number) {
  quantity.value = Math.max(1, Math.min(maxQuantity.value, Math.floor(Number(value) || 1)))
}

function closeConfirm() {
  if (farmShopPurchasing.value)
    return
  confirmState.value = undefined
}

async function runBuy() {
  const item = confirmState.value?.item
  const id = String(currentAccountId.value || '')
  if (!item || !id)
    return
  const count = confirmState.value!.quantityMode ? normalizedQuantity.value : 1
  const ok = await commerceStore.purchaseFarmGoods(id, item.id, count, item.price)
  if (ok) {
    toast.success(`已购买 ${item.name} x${count}`)
    confirmState.value = undefined
    await commerceStore.fetchFarmShop(id, props.category)
  }
  else {
    toast.error(commerceStore.error || '购买失败')
  }
}

watch(
  () => [currentAccountId.value, props.category] as const,
  ([id, category]) => {
    confirmState.value = undefined
    if (id)
      commerceStore.fetchFarmShop(String(id), category)
    else
      farmShopGoods.value = []
  },
  { immediate: true },
)

watch(notice, (value) => {
  if (value)
    commerceStore.clearMessages()
})
</script>

<template>
  <section class="farm-shop-panel page-stack" :aria-label="`${category} 商店`">
    <div v-if="!currentAccountId" class="farm-shop-empty">
      请先选择账号，再查看商城。
    </div>

    <div v-else-if="farmShopLoading && !farmShopGoods.length" class="farm-shop-empty">
      正在加载当前分区商品...
    </div>

    <div v-else-if="error && !farmShopGoods.length" class="farm-shop-error">
      {{ error }}
    </div>

    <div v-else-if="!farmShopGoods.length" class="farm-shop-empty">
      暂无{{ category === 'seed' ? '种子' : category === 'pet' ? '宠物' : '装扮' }}商品。
    </div>

    <div v-else class="farm-shop-grid">
      <article
        v-for="item in farmShopGoods"
        :key="`${item.id}-${item.itemId}`"
        class="farm-product"
      >
        <div class="farm-product__art">
          <span class="farm-product__badge farm-product__badge--id">#{{ item.itemId }}</span>
          <span
            class="farm-product__badge farm-product__badge--tag"
            :class="{ 'is-purple': category === 'decoration' }"
          >{{ category === 'seed' ? `Lv.${item.seedLevel}` : getStatusLabel(item) }}</span>
          <img v-if="item.image" :src="item.image" :alt="item.name" loading="lazy">
          <span v-else class="farm-product__fallback">{{ String(item.name || '?').slice(0, 1) }}</span>
        </div>

        <div class="farm-product__body">
          <div class="farm-product__name">
            {{ item.name }}
          </div>
          <div class="farm-product__price">
            {{ category === 'decoration' ? formatGoldBeanAmount(item.price) : formatGoldAmount(item.price) }} {{ currencyLabelOf(item) }}
          </div>
          <p v-if="category === 'seed'" class="farm-product__meta">
            需求等级 {{ item.requiredLevel }} · 季数 {{ item.seasons || 0 }} / 每季经验 {{ (item.expPerSeason || 0).toLocaleString() }}
          </p>
          <p v-else-if="category === 'pet'" class="farm-product__meta">
            {{ item.desc || L.noDesc }}
          </p>
          <p v-else class="farm-product__meta">
            {{ item.effectDesc || item.desc || L.noDesc }}
          </p>
          <p class="farm-product__hint">
            {{ getHint(item) }}
          </p>
          <BaseButton
            class="farm-product__buy"
            variant="primary"
            :disabled="category === 'decoration'
              ? !item.canBuy
              : (!item.unlocked || item.isSoldOut || currentLevel < item.requiredLevel || !canAffordGoods(item))"
            @click="askBuy(item)"
          >
            {{ getStatusLabel(item) === L.canBuy ? L.buy : getStatusLabel(item) }}
          </BaseButton>
        </div>
      </article>
    </div>

    <!-- 购买确认 / 数量选择弹窗 -->
    <Transition name="farm-buy-modal">
      <div v-if="confirmState?.show && confirmState.item" class="farm-buy-mask" @click.self="closeConfirm">
        <div class="farm-buy-modal" role="dialog" aria-modal="true">
          <div class="farm-buy-icon">
            <span class="i-carbon-shopping-cart" />
          </div>
          <h3>{{ confirmState.quantityMode ? '确认购买' : '确认购买' }}</h3>
          <div class="farm-buy-item-name">
            {{ confirmState.item.name }}
          </div>

          <div v-if="confirmState.quantityMode" class="farm-buy-quantity">
            <div class="farm-buy-row">
              <span>单价</span>
              <b>{{ formatGoldAmount(priceOf(confirmState.item)) }} {{ currencyLabelOf(confirmState.item) }}</b>
            </div>
            <div class="farm-buy-row farm-buy-row--stepper">
              <span>数量</span>
              <div class="farm-buy-stepper">
                <button type="button" :disabled="normalizedQuantity <= 1" @click="setQuantity(normalizedQuantity - 1)">
                  −
                </button>
                <input
                  :value="normalizedQuantity"
                  type="number"
                  min="1"
                  :max="maxQuantity"
                  @change="setQuantity(Number(($event.target as HTMLInputElement).value))"
                >
                <button type="button" :disabled="normalizedQuantity >= maxQuantity" @click="setQuantity(normalizedQuantity + 1)">
                  +
                </button>
              </div>
            </div>
            <div class="farm-buy-row">
              <span>合计</span>
              <b>{{ formatGoldAmount(priceOf(confirmState.item) * normalizedQuantity) }} {{ currencyLabelOf(confirmState.item) }}</b>
            </div>
            <div class="farm-buy-row">
              <span>余额</span>
              <b>{{ formatGoldAmount(balanceOf(confirmState.item)) }} {{ currencyLabelOf(confirmState.item) }}</b>
            </div>
          </div>
          <p v-else class="farm-buy-message">
            {{ confirmMessage }}
          </p>

          <div class="farm-buy-actions">
            <BaseButton variant="secondary" :disabled="farmShopPurchasing" @click="closeConfirm">
              取消
            </BaseButton>
            <BaseButton variant="primary" :loading="farmShopPurchasing" @click="runBuy">
              确定购买
            </BaseButton>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.farm-shop-panel {
  min-height: 100%;
  color: var(--ui-ink);
}
.farm-shop-empty,
.farm-shop-error {
  padding: 32px 16px;
  border-radius: 12px;
  background: var(--surface-2);
  color: var(--ui-muted);
  font-size: 13px;
  text-align: center;
}
.farm-shop-error {
  color: var(--ui-danger, #dc2626);
}
.farm-shop-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(205px, 1fr));
  gap: 14px;
  align-items: stretch;
}
.farm-product {
  display: flex;
  flex-direction: column;
  min-height: 216px;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--surface-border);
  border-radius: 10px;
  background: var(--surface-1);
  box-shadow: 0 4px 18px rgb(45 70 31 / 4%);
}
.farm-product__art {
  position: relative;
  display: grid;
  height: 96px;
  place-items: center;
  background: var(--surface-2);
}
.farm-product__art img {
  max-height: 56px;
  max-width: 56px;
  object-fit: contain;
}
.farm-product__badge {
  position: absolute;
  top: 0;
  padding: 2px 8px;
  border-radius: 0 0 6px 0;
  background: var(--surface-3);
  color: var(--ui-muted);
  font-size: 10px;
  font-weight: 600;
}
.farm-product__badge--id {
  left: 0;
  border-radius: 0 0 0 6px;
}
.farm-product__badge--tag {
  right: 0;
  background: #e7efdf;
  color: var(--theme-primary);
}
.farm-product__badge--tag.is-purple {
  background: #f3e8ff;
  color: #7e22ce;
}
.farm-product__fallback {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border-radius: 10px;
  background: var(--surface-1);
  color: var(--ui-muted);
  font-size: 14px;
  font-weight: 600;
}
.farm-product__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 120px;
  padding: 12px;
}
.farm-product__name {
  text-align: center;
  font-size: 14px;
  font-weight: 650;
}
.farm-product__price {
  margin-top: 4px;
  text-align: center;
  color: #d97706;
  font-size: 12px;
  font-weight: 650;
}
.farm-product__meta,
.farm-product__hint {
  margin-top: 4px;
  overflow: hidden;
  color: var(--ui-muted);
  font-size: 11px;
  line-height: 20px;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.farm-product__buy {
  width: 100%;
  margin-top: auto;
}
.farm-buy-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(15 23 42 / 46%);
  backdrop-filter: blur(3px);
}
.farm-buy-modal {
  width: 100%;
  max-width: 360px;
  padding: 26px 24px 22px;
  border: 1px solid var(--surface-border);
  border-radius: 16px;
  background: var(--surface-1);
  box-shadow: 0 18px 56px rgb(15 23 42 / 18%);
  text-align: center;
}
.farm-buy-icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  margin: 0 auto 12px;
  border-radius: 50%;
  background: #e7efdf;
  color: var(--theme-primary);
  font-size: 24px;
}
.farm-buy-modal h3 {
  font-size: 18px;
  font-weight: 700;
}
.farm-buy-item-name {
  margin-top: 6px;
  color: var(--ui-muted);
  font-size: 13px;
}
.farm-buy-message {
  margin: 16px 0 4px;
  font-size: 13px;
  line-height: 22px;
}
.farm-buy-quantity {
  margin: 16px 0 4px;
  text-align: left;
  font-size: 13px;
}
.farm-buy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--surface-2);
}
.farm-buy-row + .farm-buy-row {
  margin-top: 8px;
}
.farm-buy-stepper {
  display: flex;
  align-items: center;
  gap: 6px;
}
.farm-buy-stepper button {
  width: 26px;
  height: 26px;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  background: var(--surface-1);
  font-size: 14px;
  line-height: 1;
}
.farm-buy-stepper button:disabled {
  opacity: 0.45;
}
.farm-buy-stepper input {
  width: 56px;
  height: 26px;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  background: var(--surface-1);
  color: var(--ui-ink);
  text-align: center;
}
.farm-buy-actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}
.farm-buy-actions > * {
  flex: 1;
}
.farm-buy-modal-enter-active,
.farm-buy-modal-leave-active {
  transition: opacity 0.16s ease;
}
.farm-buy-modal-enter-from,
.farm-buy-modal-leave-to {
  opacity: 0;
}
@media (max-width: 639px) {
  .farm-shop-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
}
</style>
