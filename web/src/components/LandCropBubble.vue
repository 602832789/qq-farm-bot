<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { computeBubblePosition } from '@/utils/bubble-position'
import { canRipenLand } from '@/utils/ripen-land'

/**
 * 老版「地块气泡」：点击土地/作物就地浮出的作物详情，替代居中大弹窗。
 * 结构对齐 TS 重构前 LandCard.vue 的 .land-bubble（土地编号、状态徽章、
 * 倒计时/季数、阶段进度、变异效果+描述、缺水草虫、催熟/铲除），
 * 另保留当前版本的每季收益，并提供进入土地等级/升级条件的入口。
 */
const props = defineProps<{
  land: any
  anchor: HTMLElement | null
  pending?: boolean
}>()

const emit = defineEmits<{
  close: []
  fertilize: []
  remove: []
  details: []
}>()

const bubbleEl = ref<HTMLElement | null>(null)
const positioned = ref(false)
const position = ref({ top: 0, left: 0, placement: 'above' as 'above' | 'below', arrowLeft: 120 })
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

const hasCrop = computed(() => Boolean(
  props.land?.plantName
  || Number(props.land?.matureInSec) > 0
  || ['growing', 'harvestable', 'stealable', 'harvested', 'dead'].includes(String(props.land?.status || '')),
))

const statusLabel = computed(() => {
  const status = String(props.land?.status || '')
  const phaseName = String(props.land?.phaseName || '').trim()
  if (status === 'growing' && phaseName)
    return phaseName
  const labels: Record<string, string> = {
    harvestable: '可收获',
    stealable: '可采摘',
    harvested: '已成熟',
    growing: '生长中',
    dead: '已枯萎',
    empty: '空闲',
    locked: '未解锁',
  }
  return labels[status] || phaseName || '未知状态'
})

/** 变异效果：图标按 icon 名取官方运行时素材，闪电走雨落成诗专用图。 */
const mutantEffects = computed(() => {
  const effects = Array.isArray(props.land?.mutantEffects) ? props.land.mutantEffects : []
  return effects.map((effect: any) => {
    const icon = String(effect?.icon || '').trim()
    const name = String(effect?.name || effect?.effect_name || icon || '变异').trim()
    const collections = Array.isArray(effect?.collections) ? effect.collections : []
    const description = String(effect?.description || effect?.desc || effect?.tips || '').trim()
    const actions = String(effect?.actions || '').trim()
    const fruitName = String(effect?.fruit_name || '').trim()
    return {
      id: Number(effect?.id) || 0,
      name,
      icon,
      image: icon === 'lightning'
        ? '/game-config/effect_images/rain-poem/lightning-sense.png?v=2'
        : (icon ? `/game-config/seed_images_named/mutant/${icon}.png` : ''),
      tag: String(effect?.tag || '').trim(),
      description,
      detail: buildMutantDetail(name, actions, fruitName, description, collections),
    }
  }).filter((effect: any) => effect.icon || effect.name)
})

function mutantMultiplierText(actions: string, fruitName: string) {
  const [type, mult = 0] = actions.split(':').map(part => Number(part) || 0)
  if (type === 2 && mult > 0)
    return `数量*${mult}倍`
  if (type === 3 && mult > 0)
    return `售价*${mult}倍`
  if (type === 4)
    return fruitName ? `变身·${fruitName}` : '变身果实'
  return ''
}

function buildMutantDetail(name: string, actions: string, fruitName: string, description: string, collections: any[]) {
  const parts = [name, mutantMultiplierText(actions, fruitName)]
  const collectionNames = collections.map((item: any) => String(item?.name || '').trim()).filter(Boolean)
  if (collectionNames.length)
    parts.push(`涉及藏品：${[...new Set(collectionNames)].join('、')}`)
  if (description && description !== name)
    parts.push(description)
  return parts.filter(Boolean).join('·')
}

/** 变异收益叠加明细：后端按 actions 算出倍率，前端展示「基础 → 变异后」。 */
const harvestBonus = computed(() => {
  const bonus = props.land?.harvestBonus
  return bonus && typeof bonus === 'object' ? bonus : null
})
const harvestDetails = computed(() => {
  const details = harvestBonus.value?.details
  return Array.isArray(details) ? details : []
})
const harvestBoosted = computed(() => {
  const bonus = harvestBonus.value
  return !!bonus && (Number(bonus.countMultiplier) > 1 || Number(bonus.priceMultiplier) > 1)
})
const harvestExpMultiplier = computed(() => Number(harvestBonus.value?.countMultiplier) || 1)
const harvestGoldMultiplier = computed(() => (Number(harvestBonus.value?.countMultiplier) || 1) * (Number(harvestBonus.value?.priceMultiplier) || 1))
function formatNumber(value: unknown) {
  return (Number(value) || 0).toLocaleString('zh-CN')
}

const phaseProgress = computed(() => {
  const start = Number(props.land?.phaseStartTime) || 0
  const end = Number(props.land?.phaseEndTime) || 0
  if (end > start) {
    const duration = end - start
    const elapsed = Math.min(duration, Math.max(0, now.value / 1000 - start))
    return { percent: Math.round(elapsed / duration * 100), elapsed, duration }
  }
  if (['harvestable', 'stealable', 'harvested', 'dead'].includes(String(props.land?.status || '')))
    return { percent: 100, elapsed: 0, duration: 0 }
  return null
})

function formatTime(sec: number) {
  if (sec <= 0)
    return ''
  const wholeSeconds = Math.floor(sec)
  const h = Math.floor(wholeSeconds / 3600)
  const m = Math.floor((wholeSeconds % 3600) / 60)
  const s = wholeSeconds % 60
  return `${h > 0 ? `${h}:` : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const canRipen = computed(() => canRipenLand(props.land))
const canRemove = computed(() => hasCrop.value && !['locked', 'empty'].includes(String(props.land?.status || '')))

function updatePosition() {
  const anchor = props.anchor
  const bubble = bubbleEl.value
  if (!anchor || !bubble || !props.land)
    return
  const rect = anchor.getBoundingClientRect()
  position.value = computeBubblePosition(
    {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    },
    { width: window.innerWidth, height: window.innerHeight },
    { width: bubble.offsetWidth, height: bubble.offsetHeight },
  )
  positioned.value = true
}

const bubbleStyle = computed(() => ({
  'left': `${position.value.left}px`,
  'top': `${position.value.top}px`,
  '--bubble-arrow-left': `${position.value.arrowLeft}px`,
}))

// 切换地块/锚点时先隐藏，等 DOM 更新后重新定位，避免气泡从旧位置跳过去。
watch([() => props.land?.id, () => props.anchor], () => {
  positioned.value = false
}, { flush: 'sync' })

watch([
  () => props.land?.id,
  () => props.anchor,
  () => mutantEffects.value.length,
  () => phaseProgress.value?.percent,
], () => {
  void nextTick(updatePosition)
}, { immediate: true, flush: 'post' })

function onDocumentPointerDown(event: PointerEvent) {
  if (!props.land)
    return
  const target = event.target as Element | null
  if (!target || bubbleEl.value?.contains(target))
    return
  // 点到另一块地时由父组件切换气泡，不在这里关闭。
  if (target.closest('[data-land-id]'))
    return
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (props.land && event.key === 'Escape')
    emit('close')
}

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  document.addEventListener('keydown', onKeydown)
  void nextTick(updatePosition)
})

onUnmounted(() => {
  if (timer)
    clearInterval(timer)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="land"
      ref="bubbleEl"
      class="land-bubble"
      :class="{ 'land-bubble-below': position.placement === 'below', 'is-positioned': positioned }"
      :style="bubbleStyle"
      role="dialog"
      :aria-label="`土地 #${land.id} 详情`"
      @click.stop
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[10px] text-gray-400">
            土地 #{{ land.id }}
          </div>
          <div class="truncate text-sm text-gray-900 font-bold dark:text-gray-100">
            {{ land.plantName || '未种植' }}
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <span class="rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700 font-medium dark:bg-green-900/30 dark:text-green-300">{{ statusLabel }}</span>
          <button type="button" class="bubble-close" aria-label="关闭作物详情" @click="emit('close')">
            <span class="i-carbon-close" />
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 mt-2 gap-2 text-xs">
        <div class="bubble-cell">
          <div class="text-[10px] text-gray-400">
            成熟倒计时
          </div>
          <div class="mt-0.5 tabular-nums font-semibold">
            {{ Number(land.matureInSec) > 0 ? formatTime(Number(land.matureInSec)) : '—' }}
          </div>
        </div>
        <div class="bubble-cell">
          <div class="text-[10px] text-gray-400">
            生长季数
          </div>
          <div class="mt-0.5 font-semibold">
            {{ land.totalSeason > 0 ? `${land.currentSeason}/${land.totalSeason}` : '—' }}
          </div>
        </div>
        <div class="bubble-cell">
          <div class="text-[10px] text-gray-400">
            每季经验
          </div>
          <div class="mt-0.5 flex items-center gap-1 tabular-nums font-semibold">
            +{{ Number(land.harvestExpPerSeason) || 0 }}
            <span v-if="harvestExpMultiplier > 1" class="rounded bg-pink-100 px-1 text-[10px] text-pink-600 dark:bg-pink-900/40 dark:text-pink-300">×{{ harvestExpMultiplier }}</span>
          </div>
          <div v-if="harvestExpMultiplier > 1" class="mt-0.5 text-[10px] text-gray-400 tabular-nums">
            基础 {{ formatNumber(harvestBonus?.baseExp) }}
          </div>
        </div>
        <div class="bubble-cell">
          <div class="text-[10px] text-gray-400">
            每季金币
          </div>
          <div class="mt-0.5 flex items-center gap-1 tabular-nums font-semibold">
            +{{ (Number(land.harvestGoldPerSeason) || 0).toLocaleString('zh-CN') }}
            <span v-if="harvestGoldMultiplier > 1" class="rounded bg-pink-100 px-1 text-[10px] text-pink-600 dark:bg-pink-900/40 dark:text-pink-300">×{{ harvestGoldMultiplier }}</span>
          </div>
          <div v-if="harvestGoldMultiplier > 1" class="mt-0.5 text-[10px] text-gray-400 tabular-nums">
            基础 {{ formatNumber(harvestBonus?.baseGold) }}
          </div>
        </div>
      </div>

      <div v-if="harvestDetails.length" class="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] text-amber-700 leading-relaxed dark:bg-amber-950/30 dark:text-amber-300">
        <div class="font-medium">
          {{ harvestBoosted ? '变异叠加已计入收益' : '变异产出' }}
        </div>
        <div class="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
          <span v-for="(detail, index) in harvestDetails" :key="`bonus-${detail.id}-${index}`">
            {{ detail.name }} · {{ detail.label }}
          </span>
        </div>
        <div v-if="harvestBonus?.transformed" class="mt-0.5 opacity-80">
          变身果实按{{ harvestBonus.transformedPlantName || '活动' }}口径结算，不计入上方金币估值
        </div>
      </div>

      <div v-if="phaseProgress" class="mt-2 rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/30">
        <div class="flex items-center justify-between gap-2 text-[11px]">
          <span class="truncate text-emerald-700 font-medium dark:text-emerald-300">
            {{ land.phaseName || '当前阶段' }}
          </span>
          <span class="shrink-0 text-emerald-600 tabular-nums font-semibold dark:text-emerald-300">
            {{ phaseProgress.percent }}%
          </span>
        </div>
        <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/60">
          <div class="h-full rounded-full bg-emerald-500 transition-[width] duration-300" :style="{ width: `${phaseProgress.percent}%` }" />
        </div>
        <div v-if="phaseProgress.duration > 0" class="mt-1 flex justify-between text-[10px] text-gray-400 tabular-nums">
          <span>已进行 {{ formatTime(phaseProgress.elapsed) }}</span>
          <span>本阶段 {{ formatTime(phaseProgress.duration) }}</span>
        </div>
      </div>

      <div v-if="mutantEffects.length" class="mt-2 rounded-lg bg-pink-50 p-2 dark:bg-pink-950/30">
        <div class="mb-1 text-[10px] text-pink-500 font-medium dark:text-pink-300">
          变异效果
        </div>
        <div class="flex flex-wrap gap-1.5">
          <div
            v-for="effect in mutantEffects"
            :key="`bubble-${effect.id}-${effect.icon}`"
            class="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] text-pink-700 shadow-sm dark:bg-gray-900 dark:text-pink-200"
          >
            <img v-if="effect.image" :src="effect.image" :alt="effect.name" class="h-4 w-4 object-contain">
            <span class="font-medium">{{ effect.name }}</span>
            <span v-if="effect.tag && effect.tag !== '无'" class="text-[10px] text-pink-400">· {{ effect.tag }}</span>
          </div>
        </div>
        <div class="mt-2 rounded-md bg-white/85 px-2 py-1.5 text-[11px] text-pink-700 shadow-sm space-y-1 dark:bg-gray-900/85 dark:text-pink-200">
          <div v-for="effect in mutantEffects" :key="`desc-${effect.id}-${effect.icon}`">
            {{ effect.detail || effect.name }}
          </div>
        </div>
      </div>

      <div v-if="land.needWater || land.needWeed || land.needBug" class="mt-2 flex flex-wrap gap-1 text-[10px]">
        <span v-if="land.needWater" class="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">需要浇水</span>
        <span v-if="land.needWeed" class="rounded-full bg-green-100 px-2 py-0.5 text-green-700">需要除草</span>
        <span v-if="land.needBug" class="rounded-full bg-red-100 px-2 py-0.5 text-red-700">需要除虫</span>
      </div>

      <div class="grid grid-cols-2 mt-2 gap-2">
        <button
          type="button"
          class="bubble-action border-emerald-600 text-emerald-700 dark:text-emerald-300"
          :disabled="!canRipen || pending"
          title="仅催熟该地块：普通肥一次，再连续施有机肥至成熟或无法继续"
          @click="emit('fertilize')"
        >
          <span class="i-carbon-growth" />催熟
        </button>
        <button
          type="button"
          class="bubble-action border-red-500 text-red-600 dark:text-red-300"
          :disabled="!canRemove || pending"
          @click="emit('remove')"
        >
          <span class="i-carbon-trash-can" />铲除
        </button>
      </div>

      <button type="button" class="bubble-details" @click="emit('details')">
        <span class="i-carbon-soil-temperature" />土地等级 / 升级条件<span class="i-carbon-chevron-right ml-auto" />
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.land-bubble {
  position: fixed;
  z-index: 1000;
  visibility: hidden;
  width: min(260px, calc(100vw - 32px));
  max-height: calc(100dvh - 24px);
  overflow-y: auto;
  padding: 12px;
  border: 1px solid rgb(226 232 240);
  border-radius: 12px;
  background: rgb(255 255 255 / 0.98);
  color: #334155;
  text-align: left;
  box-shadow: 0 14px 32px rgb(15 23 42 / 0.24);
}

.land-bubble.is-positioned {
  visibility: visible;
}

.land-bubble::before {
  position: absolute;
  left: var(--bubble-arrow-left, 50%);
  bottom: -7px;
  width: 12px;
  height: 12px;
  content: '';
  border-right: 1px solid rgb(226 232 240);
  border-bottom: 1px solid rgb(226 232 240);
  background: inherit;
  transform: translateX(-50%) rotate(45deg);
}

.land-bubble.land-bubble-below::before {
  top: -7px;
  bottom: auto;
  border: 0;
  border-left: 1px solid rgb(226 232 240);
  border-top: 1px solid rgb(226 232 240);
}

.bubble-cell {
  border-radius: 8px;
  background: rgb(249 250 251 / 1);
  padding: 8px;
}

.bubble-action {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-width: 1px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}

.bubble-action:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.bubble-close {
  display: inline-flex;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: #94a3b8;
  font-size: 12px;
}

.bubble-close:hover {
  background: rgb(241 245 249 / 1);
  color: #334155;
}

.bubble-details {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 8px;
  border-top: 1px solid rgb(226 232 240);
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
  text-align: left;
}

.bubble-details:hover {
  color: #059669;
}

:global(.dark) .land-bubble {
  border-color: #475569;
  background: rgb(31 41 55 / 0.98);
  color: #e5e7eb;
}

:global(.dark) .bubble-cell {
  background: rgb(15 23 42 / 0.6);
}

:global(.dark) .bubble-details {
  border-top-color: #475569;
  color: #94a3b8;
}

:global(.dark) .bubble-close:hover {
  background: rgb(51 65 85 / 1);
  color: #e5e7eb;
}

@media (max-width: 640px) {
  .land-bubble {
    width: min(260px, calc(100vw - 24px));
  }
}
</style>
