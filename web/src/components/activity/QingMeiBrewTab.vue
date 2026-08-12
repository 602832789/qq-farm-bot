<script setup lang="ts">
import type { QingMeiActivityDto } from '@/stores/activity-center'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  activity: QingMeiActivityDto | null
  pendingSeed: boolean
  pendingStart: boolean
  pendingContinue: boolean
  pendingSell: boolean
}>()

const emit = defineEmits<{
  claimSeed: []
  start: [count: number]
  continue: []
  settle: []
}>()

const count = ref(1)
const ingredientSelected = ref(false)
const maxCount = computed(() => Math.max(0, Number(props.activity?.balance || 0)))
const busy = computed(() => props.pendingSeed || props.pendingStart || props.pendingContinue || props.pendingSell)
const quotes = computed(() => (props.activity?.quoteTotals || []).map((total, index) => ({
  index: index + 1,
  unitPrice: props.activity?.quotePrices[index] || '0',
  total,
})))

watch(maxCount, (value) => {
  count.value = Math.max(1, Math.min(count.value, value || 1))
  if (value <= 0) ingredientSelected.value = false
})

function setCount(value: unknown) {
  count.value = Math.max(1, Math.min(Math.trunc(Number(value) || 1), maxCount.value || 1))
}
</script>

<template>
  <div class="qingmei-page">
    <header class="qingmei-hero">
      <span class="qingmei-kicker">限时酿造</span>
      <h1>{{ activity?.name || '青酿换万金' }}</h1>
      <p>投入青梅，逐轮查看报价，在合适的时机出售。</p>
    </header>

    <section v-if="activity" class="qingmei-panel balance-panel">
      <div class="ingredient">
        <img v-if="activity.ingredient.image" :src="activity.ingredient.image" alt="青梅">
        <div>
          <span>可用青梅</span>
          <strong>{{ activity.balanceKnown ? activity.balance : '--' }}</strong>
        </div>
      </div>
      <button
        type="button"
        class="seed-button"
        :disabled="busy || activity.dailySeed?.claimed"
        @click="emit('claimSeed')"
      >
        {{ activity.dailySeed?.claimed ? '今日已领取' : '领取今日青梅种子' }}
      </button>
    </section>

    <section v-if="activity" class="qingmei-panel brew-panel">
      <div class="section-heading">
        <div>
          <span>本轮酿造</span>
          <strong>{{ activity.currentRound ? `第 ${activity.currentRound}/${activity.maxRounds} 轮` : '尚未开始' }}</strong>
        </div>
        <span class="base-price">保底单价 {{ activity.guaranteedPrice || activity.basePrice || '0' }}</span>
      </div>

      <div v-if="!activity.started" class="brew-setup">
        <span class="setup-label">选择酿造原料</span>
        <button
          type="button"
          class="ingredient-choice"
          :class="{ selected: ingredientSelected }"
          :disabled="busy || maxCount <= 0"
          :aria-pressed="ingredientSelected"
          @click="ingredientSelected = !ingredientSelected"
        >
          <img v-if="activity.ingredient.image" :src="activity.ingredient.image" alt="">
          <span><strong>{{ activity.ingredient.name || '青梅果实' }}</strong><small>背包拥有 x{{ activity.balanceKnown ? activity.balance : '--' }}</small></span>
          <div class="selection-mark"><div v-if="ingredientSelected" class="i-carbon-checkmark" /></div>
        </button>
        <div class="start-controls">
          <label>
            <span>投入数量</span>
            <div class="count-control">
              <button type="button" aria-label="减少数量" :disabled="busy || count <= 1" @click="setCount(count - 1)"><div class="i-carbon-subtract" /></button>
              <input :value="count" type="number" inputmode="numeric" min="1" :max="maxCount || 1" @input="setCount(($event.target as HTMLInputElement).value)">
              <button type="button" aria-label="增加数量" :disabled="busy || count >= maxCount" @click="setCount(count + 1)"><div class="i-carbon-add" /></button>
              <button type="button" class="maximum-button" :disabled="busy || count >= maxCount" @click="setCount(maxCount)">全部</button>
            </div>
          </label>
          <button type="button" :disabled="busy || !ingredientSelected || !activity.actions.start.enabled || count < 1 || count > maxCount" @click="emit('start', count)">
          开始酿造
          </button>
        </div>
      </div>

      <template v-else>
        <div class="quote-grid">
          <div
            v-for="quote in quotes"
            :key="quote.index"
            class="quote"
          >
            <span>第 {{ quote.index }} 轮</span>
            <strong>{{ Number(quote.total).toLocaleString() }}</strong>
            <small>单价 {{ quote.unitPrice }}</small>
          </div>
          <div v-for="index in Math.max(0, activity.maxRounds - quotes.length)" :key="`pending-${index}`" class="quote pending">
            <span>第 {{ quotes.length + index }} 轮</span>
            <strong>待酿造</strong>
          </div>
        </div>
        <div class="brew-actions">
          <button type="button" class="continue-button" :disabled="busy || !activity.actions.continue.enabled" @click="emit('continue')">
            继续酿造
          </button>
          <button type="button" class="sell-button" :disabled="busy || !activity.actions.settle.enabled" @click="emit('settle')">
            <div class="i-carbon-share" />
            分享出售（1.5倍）
          </button>
        </div>
        <p v-if="quotes.length === 0" class="first-quote-hint">青梅已投入，点击继续酿造生成首轮报价。</p>
      </template>
    </section>

    <section v-if="activity?.rules.paragraphs.length" class="qingmei-rules">
      <h2>{{ activity.rules.title || '活动说明' }}</h2>
      <p v-for="line in activity.rules.paragraphs" :key="line">{{ line }}</p>
    </section>

    <div v-else-if="!activity" class="qingmei-empty">当前账号暂未发现青酿活动</div>
  </div>
</template>

<style scoped>
.qingmei-page{min-height:100%;padding:126px 14px 100px;color:#193b2f;background:linear-gradient(180deg,#cbead2 0,#eef5dc 36%,#f7edcb 100%)}
.qingmei-hero{padding:0 5px 16px}.qingmei-kicker{display:block;color:#9b5d26;font-size:11px;font-weight:700}.qingmei-hero h1{margin:2px 0 5px;color:#174d39;font-size:30px;line-height:1.1;letter-spacing:0}.qingmei-hero p{margin:0;color:#557064;font-size:12px}
.qingmei-panel{margin-bottom:12px;padding:14px;border:1px solid rgba(34,91,62,.22);border-radius:8px;background:rgba(255,255,255,.86);box-shadow:0 4px 14px rgba(64,91,53,.1)}
.balance-panel{display:flex;align-items:center;justify-content:space-between;gap:12px}.ingredient{display:flex;align-items:center;gap:10px}.ingredient img{width:48px;height:48px;object-fit:contain}.ingredient div,.section-heading div{display:flex;flex-direction:column}.ingredient span,.section-heading span{color:#718276;font-size:11px}.ingredient strong{font-size:22px}.seed-button,.start-controls button,.brew-actions button{min-height:38px;padding:0 13px;border:0;border-radius:6px;color:#fff;background:#397b4b;font-weight:700;cursor:pointer}.seed-button:disabled,.start-controls button:disabled,.brew-actions button:disabled{opacity:.5;cursor:not-allowed}
.section-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:13px}.section-heading strong{margin-top:2px;font-size:18px}.base-price{padding:4px 7px;border-radius:4px;color:#795a28!important;background:#f8e8b9}
.brew-setup{display:grid;gap:11px}.setup-label{color:#64766b;font-size:11px}.ingredient-choice{width:100%;display:grid;grid-template-columns:48px minmax(0,1fr) 24px;align-items:center;gap:10px;padding:10px;border:1px solid #b8c9ba;border-radius:7px;color:#315244;background:#f6f8f1;text-align:left;cursor:pointer}.ingredient-choice.selected{border-color:#397b4b;box-shadow:inset 0 0 0 1px #397b4b;background:#edf6e9}.ingredient-choice:disabled{opacity:.55;cursor:not-allowed}.ingredient-choice img{width:46px;height:46px;object-fit:contain}.ingredient-choice>span{display:flex;min-width:0;flex-direction:column}.ingredient-choice strong{overflow:hidden;font-size:14px;text-overflow:ellipsis;white-space:nowrap}.ingredient-choice small{margin-top:3px;color:#708277;font-size:11px}.selection-mark{width:22px;height:22px;display:grid;place-items:center;border:1px solid #91aa99;border-radius:4px;color:white;background:white}.ingredient-choice.selected .selection-mark{border-color:#397b4b;background:#397b4b}.start-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end}.start-controls label{display:flex;min-width:0;flex-direction:column;gap:5px;color:#64766b;font-size:11px}.count-control{display:grid;grid-template-columns:38px minmax(52px,1fr) 38px 50px;gap:5px}.count-control button,.start-controls input{height:38px;border:1px solid #9eb5a7;border-radius:6px}.count-control button{display:grid;place-items:center;padding:0;color:#315244;background:#edf3e9}.count-control button:disabled{opacity:.45}.count-control .maximum-button{font-size:11px;font-weight:700}.start-controls input{width:100%;min-width:0;padding:0 6px;color:#173a2e;background:#fff;font-size:15px;text-align:center}
.quote-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.quote{height:88px;display:flex;min-width:0;flex-direction:column;align-items:center;justify-content:center;border:1px solid #b7c8b8;border-radius:6px;color:#436052;background:#f5f8ef;cursor:pointer}.quote.selected{border-color:#a46727;box-shadow:inset 0 0 0 1px #a46727;background:#fff2c9}.quote span,.quote small{font-size:10px}.quote strong{max-width:100%;overflow:hidden;color:#7c4d1f;font-size:16px;text-overflow:ellipsis}.quote.pending{opacity:.58;cursor:default}.quote.pending strong{color:#728079;font-size:12px}
.brew-actions{display:grid;grid-template-columns:1fr 1.35fr;gap:8px;margin-top:11px}.continue-button{background:#4d7c67!important}.sell-button{display:flex;align-items:center;justify-content:center;gap:6px;background:#a96624!important}
.first-quote-hint{margin:9px 0 0;color:#667b6f;font-size:11px;text-align:center}
.qingmei-rules{padding:14px 5px;color:#546b5e;font-size:11px;line-height:1.65}.qingmei-rules h2{margin:0 0 7px;color:#294e3c;font-size:14px}.qingmei-rules p{margin:4px 0}.qingmei-empty{padding:80px 20px;text-align:center;color:#5e7569}
@media (max-width:360px){.balance-panel{align-items:stretch;flex-direction:column}.seed-button{width:100%}.qingmei-hero h1{font-size:26px}}
</style>
