<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import CommerceItemImage from '@/components/commerce/CommerceItemImage.vue'
import { useAccountStore } from '@/stores/account'
import { useCommerceStore } from '@/stores/commerce'

const accountStore = useAccountStore()
const commerceStore = useCommerceStore()
const { currentAccountId } = storeToRefs(accountStore)
const { mystery, mysteryLoading, error } = storeToRefs(commerceStore)
const clock = ref(Date.now())
let timer: number | undefined

const remaining = computed(() => {
  const end = mystery.value?.expireTime || 0
  const diff = Math.max(0, end - clock.value)
  if (!end || diff === 0) return '已离开'
  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  return `${hours}小时${minutes}分${seconds}秒`
})

const discountLabel = computed(() => {
  const percent = mystery.value?.npc?.discountPercent || 0
  return percent > 0 ? `${(percent / 10).toFixed(percent % 10 ? 1 : 0)}折` : ''
})

function load() {
  commerceStore.fetchMystery(String(currentAccountId.value || ''))
}

watch(currentAccountId, load)
onMounted(() => {
  load()
  timer = window.setInterval(() => clock.value = Date.now(), 1000)
})
onUnmounted(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <div class="mystery-page">
    <header class="mystery-header">
      <div>
        <p>限时来访</p>
        <h1>神秘商人</h1>
        <span v-if="mystery?.active">距离离开 {{ remaining }}</span>
      </div>
      <button type="button" title="刷新神秘商人" :disabled="mysteryLoading" @click="load">
        <div class="i-carbon-renew" :class="{ 'animate-spin': mysteryLoading }" />
      </button>
    </header>

    <div v-if="!currentAccountId" class="mystery-state">
      <div class="i-carbon-user-avatar" />
      <strong>请先选择账号</strong>
    </div>
    <div v-else-if="mysteryLoading && !mystery" class="mystery-state">
      <div class="i-carbon-circle-dash animate-spin" />
      <strong>正在寻找神秘商人</strong>
    </div>
    <div v-else-if="error && !mystery" class="mystery-state">
      <div class="i-carbon-warning-alt" />
      <strong>{{ error }}</strong>
      <button type="button" @click="load">重试</button>
    </div>
    <div v-else-if="!mystery?.active || !mystery.npc" class="mystery-state">
      <div class="i-carbon-store" />
      <strong>神秘商人暂未出现</strong>
    </div>

    <main v-else class="merchant-scene">
      <section class="merchant-identity">
        <div class="merchant-mark"><div class="i-carbon-store" /></div>
        <div>
          <span>商人编号 #{{ mystery.npc.id }}</span>
          <h2>今日神秘货品</h2>
          <p>{{ new Date(mystery.activeTime || 0).toLocaleString() }} 开始营业</p>
        </div>
      </section>

      <article class="mystery-offer">
        <div class="offer-visual">
          <CommerceItemImage :src="mystery.npc.reward.image" :alt="mystery.npc.reward.name" size="lg" />
          <span v-if="discountLabel">{{ discountLabel }}</span>
        </div>
        <div class="offer-content">
          <small>神秘商品 #{{ mystery.npc.reward.id }}</small>
          <h2>{{ mystery.npc.reward.name }}</h2>
          <p>每份 x{{ mystery.npc.reward.count }}</p>
          <dl>
            <div><dt>剩余库存</dt><dd>{{ mystery.npc.stock }}</dd></div>
            <div><dt>原价</dt><dd class="original">{{ mystery.npc.originalPrice.toLocaleString() }}</dd></div>
          </dl>
          <div class="offer-price">
            <CommerceItemImage :src="mystery.npc.price.image" :alt="mystery.npc.price.name" size="sm" />
            <strong>{{ mystery.npc.price.count.toLocaleString() }}</strong>
            <span>余额 {{ mystery.npc.price.balance === null ? '--' : mystery.npc.price.balance.toLocaleString() }}</span>
          </div>
        </div>
      </article>
    </main>
  </div>
</template>

<style scoped>
.mystery-page{min-height:100%;color:#302b26}.mystery-header{display:flex;align-items:center;justify-content:space-between;padding:8px 2px 20px;border-bottom:1px solid rgba(116,91,59,.18)}.mystery-header p{margin:0 0 3px;color:#8c623c;font-size:12px}.mystery-header h1{margin:0;font-size:28px;letter-spacing:0}.mystery-header span{display:block;margin-top:5px;color:#74685d;font-size:12px}.mystery-header button{display:grid;width:40px;height:40px;place-items:center;border:1px solid #d9d0c4;border-radius:6px;background:white;color:#51483f;font-size:18px;cursor:pointer}.merchant-scene{padding:26px 0}.merchant-identity{display:flex;align-items:center;gap:14px;margin-bottom:22px}.merchant-mark{display:grid;width:58px;height:58px;place-items:center;border-radius:50%;background:#392e25;color:#f0c56a;font-size:28px}.merchant-identity span{color:#8c7c6d;font-size:11px}.merchant-identity h2{margin:2px 0;font-size:18px;letter-spacing:0}.merchant-identity p{margin:0;color:#8c7c6d;font-size:12px}.mystery-offer{display:grid;grid-template-columns:minmax(240px,42%) 1fr;min-height:430px;overflow:hidden;border:1px solid rgba(101,75,49,.24);border-radius:8px;background:#fffdf8;box-shadow:0 8px 28px rgba(64,43,24,.1)}.offer-visual{position:relative;display:grid;place-items:center;background:linear-gradient(145deg,#2f2823,#534332)}.offer-visual:before{position:absolute;inset:12%;border:1px solid rgba(245,203,111,.2);border-radius:50%;content:''}.offer-visual>span{position:absolute;top:16px;right:16px;padding:5px 10px;border-radius:4px;background:#c75036;color:white;font-size:13px;font-weight:800}.offer-content{display:flex;flex-direction:column;justify-content:center;padding:clamp(26px,6vw,64px)}.offer-content small{color:#9a8979}.offer-content h2{margin:8px 0 4px;font-size:clamp(24px,4vw,38px);letter-spacing:0}.offer-content>p{margin:0;color:#6e6257}.offer-content dl{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:28px 0}.offer-content dl>div{padding:12px 0;border-block:1px solid #ece3d7}.offer-content dt{color:#8b7e71;font-size:11px}.offer-content dd{margin:5px 0 0;font-size:16px;font-weight:800}.offer-content dd.original{text-decoration:line-through;color:#9e9185}.offer-price{display:flex;align-items:center;gap:10px}.offer-price strong{color:#9a6217;font-size:28px}.offer-price span{margin-left:auto;color:#807366;font-size:12px}.mystery-state{display:flex;min-height:430px;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#80756a;text-align:center}.mystery-state>div{font-size:38px}.mystery-state button{height:36px;padding:0 16px;border:0;border-radius:6px;background:#3f342b;color:white;cursor:pointer}@media(max-width:720px){.mystery-offer{grid-template-columns:1fr}.offer-visual{min-height:260px}.offer-content{padding:26px}.mystery-header h1{font-size:24px}}
</style>
