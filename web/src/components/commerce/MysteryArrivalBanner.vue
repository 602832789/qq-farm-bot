<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useCommerceStore } from '@/stores/commerce'

/**
 * 神秘商人来访横幅（只在农场商城页面顶部出现）。
 * 运行逻辑沿用老版本的「本轮来访 + visitKey 去重」口径：
 * 有商人来访且本轮还没买就常驻显示，买过之后本轮不再提示，
 * 商人离开或新一轮来访（activeTime 变化）后重新判定；不写局内消息、不发外部推送。
 */
const emit = defineEmits<{ go: [] }>()
const commerceStore = useCommerceStore()
const { mystery, mysteryHistory } = storeToRefs(commerceStore)
const clock = ref(Date.now())
let timer: number | undefined

const purchasedThisVisit = computed(() => {
  const shop = mystery.value
  if (!shop?.active || !shop.npc)
    return false
  const npcId = shop.npc.id
  const since = Number(shop.activeTime) || 0
  // 服务器时间与本地时间可能略有偏差，留 1 分钟容差。
  return mysteryHistory.value.some(record => record.npcId === npcId && Number(record.purchasedAt) >= since - 60_000)
})

const visible = computed(() => {
  const shop = mystery.value
  if (!shop?.active || !shop.npc || purchasedThisVisit.value)
    return false
  return !shop.expireTime || shop.expireTime > clock.value
})

const goodsLabel = computed(() => {
  const npc = mystery.value?.npc
  return npc ? `${npc.reward.name} ×${npc.reward.count.toLocaleString()}` : ''
})

const remaining = computed(() => {
  const end = Number(mystery.value?.expireTime) || 0
  const diff = Math.max(0, end - clock.value)
  if (!end || diff === 0)
    return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(Math.floor(diff / 3600000))}:${pad(Math.floor(diff % 3600000 / 60000))}:${pad(Math.floor(diff % 60000 / 1000))}`
})

onMounted(() => {
  timer = window.setInterval(() => clock.value = Date.now(), 1000)
})
onBeforeUnmount(() => {
  if (timer)
    window.clearInterval(timer)
})
</script>

<template>
  <div v-if="visible" class="mystery-arrival-banner" role="status" aria-live="polite">
    <span class="mystery-arrival-banner__icon i-carbon-store" aria-hidden="true" />
    <div class="mystery-arrival-banner__copy">
      <strong>神秘商人来访中 · 本轮尚未购买</strong>
      <span>{{ goodsLabel }}<template v-if="remaining"> · {{ remaining }} 后离开</template></span>
    </div>
    <button type="button" class="mystery-arrival-banner__action" @click="emit('go')">
      去看看<span class="i-carbon-arrow-right" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
/* 样式参考老版本 CommerceShopBar 的 is-violet / is-warning 状态条与 shop-message 提示条。 */
.mystery-arrival-banner {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--ui-violet) 30%, var(--ui-border));
  border-left: 3px solid var(--ui-violet);
  border-radius: var(--ui-radius-control);
  background: linear-gradient(90deg, var(--ui-violet-soft), var(--ui-surface) 70%);
  box-shadow: var(--ui-shadow-sm);
  font-variant-numeric: tabular-nums;
}

.mystery-arrival-banner__icon {
  flex: none;
  font-size: 20px;
  color: var(--ui-violet);
}

.mystery-arrival-banner__copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.mystery-arrival-banner__copy strong {
  color: var(--ui-ink);
  font-size: 13px;
  font-weight: var(--fw-650);
}

.mystery-arrival-banner__copy span {
  overflow: hidden;
  color: var(--ui-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mystery-arrival-banner__action {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--ui-violet) 35%, var(--ui-border));
  border-radius: 999px;
  color: var(--ui-violet);
  background: var(--ui-surface);
  font-size: 12px;
  font-weight: var(--fw-600);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.mystery-arrival-banner__action:hover {
  background: var(--ui-violet-soft);
}

@media (max-width: 520px) {
  .mystery-arrival-banner {
    flex-wrap: wrap;
    gap: 8px 10px;
  }

  .mystery-arrival-banner__action {
    margin-left: auto;
  }
}
</style>
