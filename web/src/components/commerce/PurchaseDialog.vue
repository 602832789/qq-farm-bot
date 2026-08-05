<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CommerceItemImage from './CommerceItemImage.vue'
import type { MallGoodsDto } from '@/stores/commerce'

const props = defineProps<{
  open: boolean
  goods: MallGoodsDto | null
  pending?: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: [count: number]
}>()

const count = ref(1)
const maxCount = computed(() => Math.max(1, Math.min(9999, props.goods?.limit?.remaining ?? 9999)))
const totalCost = computed(() => (props.goods?.price.count || 0) * count.value)
const insufficient = computed(() => {
  const balance = props.goods?.price.balance
  return !props.goods?.isFree && balance !== null && balance !== undefined && totalCost.value > balance
})

watch(() => [props.open, props.goods?.id], () => count.value = 1)

function setCount(value: number) {
  count.value = Math.min(maxCount.value, Math.max(1, Math.floor(value) || 1))
}
</script>

<template>
  <div v-if="open && goods" class="purchase-mask" @click.self="!pending && emit('close')">
    <section class="purchase-dialog" role="dialog" aria-modal="true" :aria-label="`购买${goods.name}`">
      <header>
        <div>
          <p>确认购买</p>
          <h2>{{ goods.name }}</h2>
        </div>
        <button type="button" title="关闭" :disabled="pending" @click="emit('close')">
          <div class="i-carbon-close" />
        </button>
      </header>

      <div class="purchase-product">
        <CommerceItemImage :src="goods.rewards[0]?.image" :alt="goods.rewards[0]?.name" size="lg" />
        <div class="purchase-rewards">
          <span>每份获得</span>
          <div v-for="reward in goods.rewards" :key="reward.id" class="reward-row">
            <CommerceItemImage :src="reward.image" :alt="reward.name" size="sm" />
            <b>{{ reward.name }}</b>
            <strong>x{{ reward.count }}</strong>
          </div>
        </div>
      </div>

      <div class="purchase-controls">
        <span>购买数量</span>
        <div class="stepper">
          <button type="button" title="减少" :disabled="pending || count <= 1" @click="setCount(count - 1)"><div class="i-carbon-subtract" /></button>
          <input :value="count" inputmode="numeric" aria-label="购买数量" :disabled="pending" @input="setCount(Number(($event.target as HTMLInputElement).value))">
          <button type="button" title="增加" :disabled="pending || count >= maxCount" @click="setCount(count + 1)"><div class="i-carbon-add" /></button>
        </div>
      </div>

      <div class="purchase-total">
        <span>合计</span>
        <strong v-if="goods.isFree">免费</strong>
        <strong v-else><CommerceItemImage :src="goods.price.image" :alt="goods.price.name" size="sm" />{{ totalCost.toLocaleString() }}</strong>
      </div>
      <p v-if="insufficient" class="purchase-error">{{ goods.price.name }}余额不足</p>

      <footer>
        <button type="button" class="secondary" :disabled="pending" @click="emit('close')">取消</button>
        <button type="button" class="primary" :disabled="pending || insufficient" @click="emit('confirm', count)">
          <div v-if="pending" class="i-carbon-circle-dash animate-spin" />
          <div v-else class="i-carbon-shopping-cart-plus" />
          {{ pending ? '购买中' : '确认购买' }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.purchase-mask{position:fixed;z-index:80;inset:0;display:grid;place-items:center;padding:16px;background:rgba(28,24,20,.56);backdrop-filter:blur(5px)}.purchase-dialog{width:min(520px,100%);max-height:min(720px,calc(100dvh - 32px));overflow:auto;border:1px solid rgba(112,83,45,.28);border-radius:8px;background:#fffdfa;color:#342d26;box-shadow:0 20px 55px rgba(42,30,18,.3)}header{display:flex;align-items:flex-start;justify-content:space-between;padding:20px 22px 16px;border-bottom:1px solid #eee7dd}header p{margin:0 0 3px;color:#8c6b43;font-size:12px}header h2{margin:0;font-size:20px;letter-spacing:0}header button,.stepper button{display:grid;place-items:center;border:0;background:transparent;color:#6d6256;cursor:pointer}header button{width:36px;height:36px;border-radius:6px;font-size:20px}header button:hover,.stepper button:hover{background:#f2ede7}.purchase-product{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:center;padding:20px 22px}.purchase-rewards>span,.purchase-controls>span{color:#84776a;font-size:12px}.reward-row{display:grid;grid-template-columns:36px 1fr auto;gap:8px;align-items:center;margin-top:8px}.reward-row b{font-size:13px}.reward-row strong{color:#805919}.purchase-controls,.purchase-total{display:flex;align-items:center;justify-content:space-between;margin:0 22px;padding:14px 0;border-top:1px solid #eee7dd}.stepper{display:grid;grid-template-columns:36px 58px 36px;height:36px;overflow:hidden;border:1px solid #d8cfc4;border-radius:6px}.stepper button{width:36px}.stepper input{min-width:0;border:0;border-inline:1px solid #d8cfc4;outline:0;text-align:center;background:white}.purchase-total strong{display:flex;align-items:center;gap:8px;color:#9b6314;font-size:18px}.purchase-error{margin:0 22px;color:#b83b34;font-size:12px;text-align:right}footer{display:flex;justify-content:flex-end;gap:10px;padding:16px 22px 20px}footer button{display:flex;min-width:108px;height:40px;align-items:center;justify-content:center;gap:7px;border:1px solid transparent;border-radius:6px;font-weight:700;cursor:pointer}footer .secondary{border-color:#d8cfc4;background:white;color:#62574d}footer .primary{background:#2f7d4b;color:white}button:disabled{cursor:not-allowed;opacity:.5}@media(max-width:520px){.purchase-product{grid-template-columns:1fr;justify-items:center}.purchase-rewards{width:100%}}
</style>
