<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import CommerceItemImage from '@/components/commerce/CommerceItemImage.vue'
import PurchaseDialog from '@/components/commerce/PurchaseDialog.vue'
import { useAccountStore } from '@/stores/account'
import { useCommerceStore, type MallGoodsDto } from '@/stores/commerce'
import { useToastStore } from '@/stores/toast'

type FilterKey = 'all' | 'free' | 'discount' | 'fertilizer' | 'pet'

const accountStore = useAccountStore()
const commerceStore = useCommerceStore()
const toast = useToastStore()
const { currentAccountId } = storeToRefs(accountStore)
const { mall, mallLoading, purchasingGoodsId, error, notice } = storeToRefs(commerceStore)
const selected = ref<MallGoodsDto | null>(null)
const filter = ref<FilterKey>('all')
const query = ref('')
const clock = ref(Date.now())
let timer: number | undefined

const filters: Array<{ key: FilterKey, label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'free', label: '免费' },
  { key: 'discount', label: '折扣' },
  { key: 'fertilizer', label: '化肥' },
  { key: 'pet', label: '狗粮' },
]

const filteredGoods = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return (mall.value?.goods || []).filter((goods) => {
    const names = [goods.name, ...goods.rewards.map(item => item.name)].join(' ').toLowerCase()
    if (keyword && !names.includes(keyword) && !String(goods.id).includes(keyword)) return false
    if (filter.value === 'free') return goods.isFree
    if (filter.value === 'discount') return goods.isDiscounted || !!goods.discountText
    if (filter.value === 'fertilizer') return names.includes('化肥')
    if (filter.value === 'pet') return names.includes('狗粮')
    return true
  })
})

const refreshRemaining = computed(() => {
  if (!mall.value) return ''
  const refreshAt = mall.value.serverTime + mall.value.refreshCountdown * 1000
  const seconds = Math.max(0, Math.floor((refreshAt - clock.value) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}小时${minutes}分钟后刷新`
})

function load() {
  commerceStore.fetchMall(String(currentAccountId.value || ''))
}

function choose(goods: MallGoodsDto) {
  if (goods.purchasable) selected.value = goods
}

async function purchase(count: number) {
  if (!selected.value) return
  const goods = selected.value
  const succeeded = await commerceStore.purchaseMall(String(currentAccountId.value || ''), goods, count)
  if (succeeded) {
    toast.success(`购买成功：${goods.name} x${count}`)
    selected.value = null
  }
  else {
    toast.error(error.value || `购买失败：${goods.name}`)
  }
}

watch(currentAccountId, () => {
  selected.value = null
  load()
})
watch(mall, () => {
  if (selected.value)
    selected.value = mall.value?.goods.find(goods => goods.id === selected.value?.id) || null
})
onMounted(() => {
  load()
  timer = window.setInterval(() => clock.value = Date.now(), 1000)
})
onUnmounted(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <div class="mall-page">
    <header class="mall-header">
      <div>
        <p>QQ 农场</p>
        <h1>游戏商城</h1>
        <span v-if="mall">{{ refreshRemaining }}</span>
      </div>
      <div class="mall-header__actions">
        <div v-for="currency in mall?.currencies || []" :key="currency.id" class="currency-balance">
          <CommerceItemImage :src="currency.image" :alt="currency.name" size="sm" />
          <span>{{ currency.name }}</span>
          <strong>{{ currency.balanceKnown ? currency.count.toLocaleString() : '--' }}</strong>
        </div>
        <button type="button" title="刷新商城" :disabled="mallLoading" @click="load">
          <div class="i-carbon-renew" :class="{ 'animate-spin': mallLoading }" />
        </button>
      </div>
    </header>

    <div v-if="error || notice" class="mall-message" :class="{ success: !!notice && !error }">
      <span>{{ error || notice }}</span>
      <button type="button" title="关闭消息" @click="commerceStore.clearMessages"><div class="i-carbon-close" /></button>
    </div>

    <section class="mall-toolbar" aria-label="商品筛选">
      <div class="filter-tabs">
        <button v-for="entry in filters" :key="entry.key" type="button" :class="{ active: filter === entry.key }" @click="filter = entry.key">{{ entry.label }}</button>
      </div>
      <label class="mall-search">
        <div class="i-carbon-search" />
        <input v-model="query" type="search" placeholder="搜索商品">
      </label>
    </section>

    <div v-if="!currentAccountId" class="mall-state">
      <div class="i-carbon-user-avatar" />
      <strong>请先选择账号</strong>
    </div>
    <div v-else-if="mallLoading && !mall" class="mall-state">
      <div class="i-carbon-circle-dash animate-spin" />
      <strong>正在加载商城</strong>
    </div>
    <div v-else-if="!mall && error" class="mall-state">
      <div class="i-carbon-warning-alt" />
      <strong>{{ error }}</strong>
      <button type="button" @click="load">重试</button>
    </div>
    <div v-else-if="filteredGoods.length === 0" class="mall-state">
      <div class="i-carbon-search-locate" />
      <strong>没有匹配的商品</strong>
    </div>

    <section v-else class="goods-grid" aria-live="polite">
      <article v-for="goods in filteredGoods" :key="goods.id" class="goods-card" :class="{ unavailable: !goods.purchasable }">
        <div class="goods-visual">
          <CommerceItemImage :src="goods.rewards[0]?.image" :alt="goods.rewards[0]?.name || goods.name" size="lg" />
          <span v-if="goods.isFree" class="goods-badge free">免费</span>
          <span v-else-if="goods.discountText" class="goods-badge discount">{{ goods.discountText }}</span>
        </div>
        <div class="goods-main">
          <div class="goods-title">
            <h2>{{ goods.name }}</h2>
            <small>#{{ goods.id }}</small>
          </div>
          <div class="reward-list">
            <span v-for="reward in goods.rewards" :key="reward.id">
              <CommerceItemImage :src="reward.image" :alt="reward.name" size="sm" />
              {{ reward.name }} x{{ reward.count }}
            </span>
          </div>
          <div v-if="goods.limit" class="limit-row">
            <span>限购 {{ goods.limit.bought }}/{{ goods.limit.max }}</span>
            <div><i :style="{ width: `${Math.min(100, goods.limit.max ? goods.limit.bought / goods.limit.max * 100 : 0)}%` }" /></div>
          </div>
        </div>
        <footer>
          <div class="goods-price">
            <strong v-if="goods.isFree">免费</strong>
            <template v-else>
              <CommerceItemImage :src="goods.price.image" :alt="goods.price.name" size="sm" />
              <strong>{{ goods.price.count.toLocaleString() }}</strong>
            </template>
          </div>
          <button type="button" :disabled="!goods.purchasable || purchasingGoodsId !== null" @click="choose(goods)">
            <div class="i-carbon-shopping-cart-plus" />
            {{ goods.purchasable ? '购买' : '已售罄' }}
          </button>
        </footer>
      </article>
    </section>

    <PurchaseDialog
      :open="!!selected"
      :goods="selected"
      :pending="purchasingGoodsId === selected?.id"
      @close="selected = null"
      @confirm="purchase"
    />
  </div>
</template>

<style scoped>
.mall-page{min-height:100%;color:#302b26}.mall-header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:8px 2px 20px;border-bottom:1px solid rgba(116,91,59,.18)}.mall-header p{margin:0 0 3px;color:#856c4f;font-size:12px}.mall-header h1{margin:0;font-size:28px;letter-spacing:0}.mall-header>div>span{display:block;margin-top:5px;color:#7c7166;font-size:12px}.mall-header__actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}.mall-header__actions>button{display:grid;width:40px;height:40px;place-items:center;border:1px solid #d9d0c4;border-radius:6px;background:white;color:#51483f;font-size:18px;cursor:pointer}.currency-balance{display:grid;grid-template-columns:36px auto auto;gap:7px;align-items:center;padding:3px 10px 3px 3px;border:1px solid #e1d8cc;border-radius:8px;background:rgba(255,255,255,.72)}.currency-balance span{font-size:11px;color:#7c7166}.currency-balance strong{font-size:14px}.mall-message{display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding:10px 12px;border-left:3px solid #b24b42;background:#fff1ef;color:#8f2f28;font-size:13px}.mall-message.success{border-color:#3e8d5a;background:#edf8f0;color:#246a3c}.mall-message button{border:0;background:transparent;color:inherit;cursor:pointer}.mall-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 0}.filter-tabs{display:flex;gap:4px;overflow-x:auto;padding-bottom:2px}.filter-tabs button{height:36px;padding:0 14px;border:1px solid transparent;border-radius:6px;background:transparent;color:#665d54;white-space:nowrap;cursor:pointer}.filter-tabs button.active{border-color:#b5cdbc;background:#e7f2e9;color:#246a3c;font-weight:700}.mall-search{display:flex;width:min(260px,38vw);height:38px;align-items:center;gap:8px;padding:0 11px;border:1px solid #d9d0c4;border-radius:6px;background:white;color:#81776d}.mall-search input{min-width:0;flex:1;border:0;outline:0;background:transparent}.goods-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;padding-bottom:24px}.goods-card{display:flex;min-height:390px;flex-direction:column;overflow:hidden;border:1px solid rgba(111,90,64,.18);border-radius:8px;background:rgba(255,255,255,.82);box-shadow:0 3px 12px rgba(77,59,36,.06)}.goods-card.unavailable{opacity:.65}.goods-visual{position:relative;display:grid;min-height:178px;place-items:center;background:linear-gradient(180deg,#f5f8f1,#eef2e9)}.goods-badge{position:absolute;top:10px;right:10px;padding:3px 8px;border-radius:4px;color:white;font-size:11px;font-weight:800}.goods-badge.free{background:#348857}.goods-badge.discount{background:#c65336}.goods-main{display:flex;flex:1;flex-direction:column;padding:14px}.goods-title{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.goods-title h2{margin:0;font-size:16px;letter-spacing:0}.goods-title small{color:#a1968b}.reward-list{display:flex;flex-direction:column;gap:5px;margin-top:12px}.reward-list>span{display:flex;align-items:center;gap:7px;color:#635a51;font-size:12px}.limit-row{margin-top:auto;padding-top:12px;color:#82776c;font-size:11px}.limit-row>div{height:4px;margin-top:5px;overflow:hidden;border-radius:2px;background:#e8e1d8}.limit-row i{display:block;height:100%;background:#c48935}.goods-card footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-top:1px solid #eee8e0}.goods-price{display:flex;align-items:center;gap:7px;color:#8c5d14}.goods-card footer>button{display:flex;height:38px;align-items:center;gap:6px;padding:0 14px;border:0;border-radius:6px;background:#2f7d4b;color:white;font-weight:700;cursor:pointer}.goods-card footer>button:disabled{cursor:not-allowed;background:#9a958d}.mall-state{display:flex;min-height:360px;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#80756a;text-align:center}.mall-state>div{font-size:34px}.mall-state button{height:36px;padding:0 16px;border:0;border-radius:6px;background:#2f7d4b;color:white;cursor:pointer}@media(max-width:720px){.mall-header{align-items:flex-start;flex-direction:column}.mall-header__actions{width:100%;justify-content:flex-start}.mall-toolbar{align-items:stretch;flex-direction:column}.mall-search{width:100%}.goods-grid{grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}}@media(max-width:480px){.goods-grid{grid-template-columns:1fr}.mall-header h1{font-size:24px}}
/* Compact product density: keep the catalog scannable without changing the card content. */
.goods-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}.goods-card{min-height:240px}.goods-visual{min-height:90px}.goods-visual :deep(.item-image--lg){width:64px;height:64px}.goods-main{padding:7px 8px}.goods-title{gap:4px}.goods-title h2{font-size:13px}.goods-title small{font-size:10px}.reward-list{gap:2px;margin-top:5px}.reward-list>span{gap:4px;font-size:10px;line-height:1.15}.reward-list>span :deep(.item-image--sm){width:22px;height:22px}.limit-row{padding-top:5px;font-size:9px}.limit-row>div{height:3px;margin-top:3px}.goods-card footer{gap:5px;padding:6px 8px}.goods-price{gap:4px;font-size:11px}.goods-price :deep(.item-image--sm){width:22px;height:22px}.goods-card footer>button{height:28px;gap:3px;padding:0 7px;font-size:11px}
@media(max-width:720px){.goods-grid{grid-template-columns:repeat(auto-fill,minmax(155px,1fr))}}@media(max-width:480px){.goods-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}}
</style>
