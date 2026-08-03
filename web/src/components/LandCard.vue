<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  land: any
  showActions?: boolean
  farmGrid?: boolean
  farmGridRowOffset?: number
  isometric?: boolean
  selected?: boolean
  selectionActive?: boolean
}>(), {
  showActions: true,
  farmGrid: false,
  farmGridRowOffset: 0,
  isometric: false,
  selected: false,
  selectionActive: false,
})

const emit = defineEmits<{
  (e: 'fertilize', land: any): void
  (e: 'remove', land: any): void
  (e: 'select', land: any): void
}>()

const land = computed(() => props.land)
const now = ref(Date.now())
const cardElement = ref<HTMLElement | null>(null)
const bubbleElement = ref<HTMLElement | null>(null)
const cardHovered = ref(false)
const bubbleHovered = ref(false)
const floatingBubbleStyle = ref<Record<string, string>>({})
const floatingBubbleBelow = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null

const floatingBubbleVisible = computed(() =>
  props.selected
  || (!props.selectionActive && (cardHovered.value || bubbleHovered.value)),
)

async function updateFloatingBubblePosition() {
  if (!props.isometric || !floatingBubbleVisible.value)
    return
  await nextTick()
  const card = cardElement.value
  const bubble = bubbleElement.value
  if (!card || !bubble)
    return
  const cardRect = card.getBoundingClientRect()
  const width = bubble.offsetWidth
  const height = bubble.offsetHeight
  const gap = 10
  const margin = 8
  const spaceAbove = cardRect.top - margin - gap
  const spaceBelow = window.innerHeight - cardRect.bottom - margin - gap
  const below = spaceAbove < height && spaceBelow > spaceAbove
  const idealTop = below ? cardRect.bottom + gap : cardRect.top - height - gap
  const left = Math.min(window.innerWidth - width - margin, Math.max(margin, cardRect.left + cardRect.width / 2 - width / 2))
  const top = Math.min(window.innerHeight - height - margin, Math.max(margin, idealTop))
  floatingBubbleBelow.value = below
  floatingBubbleStyle.value = {
    '--bubble-arrow-left': `${Math.min(width - 18, Math.max(18, cardRect.left + cardRect.width / 2 - left))}px`,
    'left': `${left}px`,
    'top': `${top}px`,
  }
}

function keepBubbleOpen() {
  if (hoverCloseTimer)
    clearTimeout(hoverCloseTimer)
  bubbleHovered.value = true
}

function scheduleBubbleClose() {
  if (hoverCloseTimer)
    clearTimeout(hoverCloseTimer)
  hoverCloseTimer = setTimeout(() => {
    cardHovered.value = false
    bubbleHovered.value = false
  }, 80)
}

function handleBubbleAction(type: 'fertilize' | 'remove') {
  cardHovered.value = false
  bubbleHovered.value = false
  if (type === 'fertilize')
    emit('fertilize', land.value)
  else
    emit('remove', land.value)
}

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  window.addEventListener('resize', updateFloatingBubblePosition)
  window.addEventListener('scroll', updateFloatingBubblePosition, true)
})

onUnmounted(() => {
  if (timer)
    clearInterval(timer)
  if (hoverCloseTimer)
    clearTimeout(hoverCloseTimer)
  window.removeEventListener('resize', updateFloatingBubblePosition)
  window.removeEventListener('scroll', updateFloatingBubblePosition, true)
})

const isFertilizable = computed(() =>
  Number(land.value?.matureInSec) > 0
  && land.value?.status !== 'locked'
  && land.value?.status !== 'empty',
)

const isRemovable = computed(() =>
  land.value?.status !== 'locked'
  && land.value?.status !== 'empty'
  && Boolean(
    land.value?.plantName
    || land.value?.seedImage
    || Number(land.value?.matureInSec) > 0
    || ['dead', 'growing', 'harvestable', 'stealable'].includes(String(land.value?.status || '')),
  ),
)

const canFertilize = computed(() => props.showActions && isFertilizable.value)
const canRemove = computed(() => props.showActions && isRemovable.value)

const landTextureName = computed(() => {
  const targetLand = land.value || {}
  const level = Math.min(5, Math.max(1, Number(targetLand.level) || 1))
  const isSnow = Boolean(
    targetLand.isSnow
    || targetLand.snow
    || targetLand.snowy
    || String(targetLand.weather || '').toLowerCase() === 'snow',
  )

  if (targetLand.status === 'locked')
    return isSnow ? 'land_locked_snow' : 'land_locked'

  if (targetLand.needWater) {
    if (level === 1 && isSnow)
      return 'land_dry1_snow'
    return `land_dry${level}`
  }

  if (level === 1 && isSnow)
    return 'land_valid1_snow'
  return `land_valid${level}`
})

const landTextureUrl = computed(() => {
  if (Number(land.value?.plantSize) > 1)
    return `/game-config/land_images/land_valid${Math.min(5, Math.max(1, Number(land.value?.level) || 1))}_2x2.png`
  return `/game-config/land_images/${landTextureName.value}.png`
})

const mutantEffects = computed(() => {
  const effects = Array.isArray(land.value?.mutantEffects) ? land.value.mutantEffects : []
  return effects
    .map((effect: any) => {
      const icon = String(effect?.icon || '').trim()
      return {
        id: Number(effect?.id) || 0,
        name: String(effect?.name || effect?.effect_name || icon || '变异').trim(),
        icon,
        image: icon ? `/game-config/seed_images_named/mutant/${icon}.png` : '',
        tag: String(effect?.tag || '').trim(),
      }
    })
    .filter((effect: any) => effect.icon)
})

// seedImage 是背包物品图标，不能用于地块；plantImage 包含客户端通用种子贴图
// model/v4/zhongzi，以及各作物从 Crop_*_2 开始的生长阶段贴图。
const cropImageUrl = computed(() => {
  return String(land.value?.plantImage || '').trim()
})

function getLandStatusClass(targetLand: any) {
  const status = targetLand.status
  const level = Number(targetLand.level) || 0

  if (status === 'locked')
    return 'land-level-locked bg-slate-50/90 dark:bg-slate-900/80 border-slate-300 dark:border-slate-700 border-dashed'

  const baseClass = `land-level-${Math.min(5, Math.max(1, level || 1))} bg-stone-50/90 dark:bg-stone-950/80 border-stone-300 dark:border-stone-700`

  if (status === 'dead')
    return 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 grayscale'

  if (status === 'harvestable')
    return `${baseClass} ring-2 ring-yellow-500 ring-offset-1 dark:ring-offset-gray-900`

  if (status === 'stealable')
    return `${baseClass} ring-2 ring-purple-500 ring-offset-1 dark:ring-offset-gray-900`

  if (mutantEffects.value.length > 0)
    return `${baseClass} ring-1 ring-pink-300 dark:ring-pink-700`

  return baseClass
}

function formatTime(sec: number) {
  if (sec <= 0)
    return ''

  const wholeSeconds = Math.floor(sec)
  const h = Math.floor(wholeSeconds / 3600)
  const m = Math.floor((wholeSeconds % 3600) / 60)
  const s = wholeSeconds % 60
  return `${h > 0 ? `${h}:` : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const statusLabel = computed(() => {
  const status = String(land.value?.status || '')
  const phaseName = String(land.value?.phaseName || '').trim()

  // “生长中”只是地块的操作状态；详情里应展示当前作物阶段。
  // 否则种子、发芽、小叶、大叶和开花期都会被错误地显示成同一个状态。
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

const phaseProgress = computed(() => {
  const start = Number(land.value?.phaseStartTime) || 0
  const end = Number(land.value?.phaseEndTime) || 0
  if (end > start) {
    const duration = end - start
    const elapsed = Math.min(duration, Math.max(0, now.value / 1000 - start))
    return {
      percent: Math.round(elapsed / duration * 100),
      elapsed,
      duration,
    }
  }
  if (['harvestable', 'stealable', 'harvested', 'dead'].includes(String(land.value?.status || ''))) {
    return { percent: 100, elapsed: 0, duration: 0 }
  }
  return null
})

watch(floatingBubbleVisible, updateFloatingBubblePosition, { flush: 'post' })
watch(() => [phaseProgress.value?.percent, mutantEffects.value.length], updateFloatingBubblePosition, { flush: 'post' })

function getSafeImageUrl(url: string) {
  if (!url)
    return ''
  if (url.startsWith('http://'))
    return url.replace('http://', 'https://')
  return url
}

function getFarmGridStyle(targetLand: any) {
  if (!props.farmGrid)
    return undefined

  const occupiedIds = Array.isArray(targetLand?.occupiedLandIds)
    ? targetLand.occupiedLandIds.map(Number).filter((id: number) => id > 0)
    : []
  const anchorId = occupiedIds.length > 1
    ? Math.min(...occupiedIds)
    : Number(targetLand?.id)
  if (!anchorId)
    return undefined

  return {
    gridColumnStart: ((anchorId - 1) % 4) + 1,
    gridRowStart: Math.max(1, Math.floor((anchorId - 1) / 4) + 1 - props.farmGridRowOffset),
  }
}

function getFarmGridColumnClass(targetLand: any) {
  if (!props.farmGrid && !props.isometric)
    return ''
  const occupiedIds = Array.isArray(targetLand?.occupiedLandIds)
    ? targetLand.occupiedLandIds.map(Number).filter((id: number) => id > 0)
    : []
  const anchorId = occupiedIds.length > 1 ? Math.min(...occupiedIds) : Number(targetLand?.id)
  return anchorId ? `land-grid-column-${((anchorId - 1) % 4) + 1}` : ''
}

function getIsometricBubbleClass(targetLand: any) {
  if (!props.isometric)
    return ''
  const occupiedIds = Array.isArray(targetLand?.occupiedLandIds)
    ? targetLand.occupiedLandIds.map(Number).filter((id: number) => id > 0)
    : []
  const anchorId = occupiedIds.length > 1 ? Math.min(...occupiedIds) : Number(targetLand?.id)
  if (!anchorId)
    return ''
  const column = (anchorId - 1) % 4
  const row = Math.floor((anchorId - 1) / 4)
  return column + row <= 1 ? 'land-bubble-below' : ''
}
</script>

<template>
  <div
    ref="cardElement"
    class="land-card relative h-full min-h-0 flex flex-col cursor-pointer items-center rounded-lg px-2 pb-11 pt-2 transition"
    :class="[
      getLandStatusClass(land),
      getFarmGridColumnClass(land),
      getIsometricBubbleClass(land),
      {
        'col-span-2 row-span-2 justify-center px-4 pt-3': !isometric && Number(land.plantSize) > 1,
        'land-isometric': isometric,
        'land-isometric-size-2': isometric && Number(land.plantSize) > 1,
        'land-card-selected': selected,
      },
    ]"
    :style="getFarmGridStyle(land)"
    role="button"
    :aria-label="`土地 #${land.id} ${land.plantName || ''}`"
    :aria-pressed="selected"
    tabindex="0"
    @click="$emit('select', land)"
    @mouseenter="cardHovered = true"
    @mouseleave="scheduleBubbleClose"
    @keydown.enter.prevent="$emit('select', land)"
    @keydown.space.prevent="$emit('select', land)"
  >
    <div
      class="land-ground-layer pointer-events-none absolute inset-0"
      aria-hidden="true"
    >
      <img
        :src="landTextureUrl"
        alt=""
        :class="Number(land.plantSize) > 1 ? 'land-ground-merged' : 'land-ground-single'"
      >
    </div>

    <div class="land-card-id absolute left-1 top-1 text-[10px] text-gray-400 font-mono">
      #{{ land.id }}
    </div>

    <div
      v-if="mutantEffects.length > 0"
      class="land-mutant-effects absolute left-1 top-5 flex flex-col gap-1"
    >
      <img
        v-for="effect in mutantEffects"
        :key="`${land.id}-${effect.id}-${effect.icon}`"
        :src="effect.image"
        :alt="effect.name"
        :title="effect.tag && effect.tag !== '无' ? `${effect.name} · ${effect.tag}` : effect.name"
        class="h-4 w-4 rounded-sm object-contain drop-shadow-sm"
        loading="lazy"
      >
    </div>

    <div
      class="land-card-image mb-0.5 mt-3 flex shrink-0 items-center justify-center"
      :class="Number(land.plantSize) > 1 ? 'h-16 w-16' : 'h-9 w-9'"
    >
      <img
        v-if="cropImageUrl"
        :src="getSafeImageUrl(cropImageUrl)"
        class="max-h-full max-w-full object-contain"
        loading="lazy"
        referrerpolicy="no-referrer"
      >
      <div v-else-if="Number(land.phase) !== 1" class="i-carbon-sprout text-xl text-gray-300" />
    </div>

    <div
      class="land-card-name w-full shrink-0 truncate px-1 text-center text-gray-900 font-bold leading-5 dark:text-gray-100"
      :class="Number(land.plantSize) > 1 ? 'text-sm' : 'text-xs'"
      :title="land.plantName"
    >
      {{ land.plantName || '-' }}
    </div>

    <div class="land-card-meta mb-0.5 mt-0.5 w-full shrink-0 text-center text-[10px] text-gray-500">
      <span v-if="land.matureInSec > 0" class="text-orange-800 font-medium dark:text-orange-300">
        预计 {{ formatTime(land.matureInSec) }} 后成熟
      </span>
      <span v-else>
        {{ land.phaseName || (land.status === 'locked' ? '未解锁' : '未开垦') }}
      </span>
    </div>

    <div class="mb-0.5 mt-0.5 flex shrink-0 items-center justify-center gap-1.5">
      <span class="land-card-season whitespace-nowrap text-[10px] text-gray-800 font-medium dark:text-gray-200">
        季数 {{ land.totalSeason > 0 ? (`${land.currentSeason}/${land.totalSeason}`) : '-/-' }}
      </span>
    </div>

    <div class="land-card-flags min-h-4 flex shrink-0 origin-bottom scale-90 gap-0.5 text-[10px]">
      <span v-if="land.needWater" class="rounded bg-blue-100 px-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" title="需要浇水"><span v-if="isometric" class="i-carbon-rain-drop" /><template v-else>水</template></span>
      <span v-if="land.needWeed" class="rounded bg-green-100 px-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-400" title="需要除草"><span v-if="isometric" class="i-carbon-sprout" /><template v-else>草</template></span>
      <span v-if="land.needBug" class="rounded bg-red-100 px-0.5 text-red-700 dark:bg-red-900/30 dark:text-red-400" title="需要除虫"><span v-if="isometric" class="i-carbon-warning-alt" /><template v-else>虫</template></span>
      <span v-if="land.status === 'harvestable'" class="rounded bg-orange-100 px-0.5 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">可收</span>
      <span v-else-if="land.status === 'stealable'" class="rounded bg-purple-100 px-0.5 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">可偷</span>
    </div>

    <div
      v-if="canFertilize || canRemove"
      class="land-actions absolute bottom-2 left-2 right-2 grid grid-cols-2 h-7 gap-1"
    >
      <button
        v-if="canFertilize"
        type="button"
        class="land-action-button text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
        title="催熟"
        @click.stop="$emit('fertilize', land)"
      >
        <span class="i-carbon-growth text-sm" />
        <span>催熟</span>
      </button>
      <div v-else />

      <button
        v-if="canRemove"
        type="button"
        class="land-action-button text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/30"
        title="铲除作物"
        @click.stop="$emit('remove', land)"
      >
        <span class="i-carbon-trash-can text-sm" />
        <span>铲除</span>
      </button>
    </div>

    <Teleport v-if="farmGrid || isometric" to="body" :disabled="!isometric">
      <div
        v-show="!isometric || floatingBubbleVisible"
        ref="bubbleElement"
        class="land-bubble"
        :class="{
          'land-bubble-floating': isometric,
          'land-bubble-floating-below': isometric && floatingBubbleBelow,
        }"
        :style="isometric ? floatingBubbleStyle : undefined"
        role="dialog"
        :aria-label="`土地 #${land.id} 详情`"
        @click.stop
        @mouseenter="keepBubbleOpen"
        @mouseleave="scheduleBubbleClose"
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
          <span class="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700 font-medium dark:bg-green-900/30 dark:text-green-300">{{ statusLabel }}</span>
        </div>

        <div class="grid grid-cols-2 mt-2 gap-2 text-xs">
          <div class="rounded-lg bg-gray-50 p-2 dark:bg-gray-900/60">
            <div class="text-[10px] text-gray-400">
              成熟倒计时
            </div>
            <div class="mt-0.5 font-semibold tabular-nums">
              {{ land.matureInSec > 0 ? formatTime(land.matureInSec) : '—' }}
            </div>
          </div>
          <div class="rounded-lg bg-gray-50 p-2 dark:bg-gray-900/60">
            <div class="text-[10px] text-gray-400">
              生长季数
            </div>
            <div class="mt-0.5 font-semibold">
              {{ land.totalSeason > 0 ? `${land.currentSeason}/${land.totalSeason}` : '—' }}
            </div>
          </div>
        </div>

        <div v-if="phaseProgress" class="mt-2 rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/30">
          <div class="flex items-center justify-between gap-2 text-[11px]">
            <span class="truncate text-emerald-700 font-medium dark:text-emerald-300">
              {{ land.phaseName || '当前阶段' }}
            </span>
            <span class="shrink-0 text-emerald-600 font-semibold tabular-nums dark:text-emerald-300">
              {{ phaseProgress.percent }}%
            </span>
          </div>
          <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/60">
            <div
              class="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
              :style="{ width: `${phaseProgress.percent}%` }"
            />
          </div>
          <div v-if="phaseProgress.duration > 0" class="mt-1 flex justify-between text-[10px] text-gray-400 tabular-nums">
            <span>已进行 {{ formatTime(phaseProgress.elapsed) }}</span>
            <span>本阶段 {{ formatTime(phaseProgress.duration) }}</span>
          </div>
        </div>

        <div v-if="mutantEffects.length > 0" class="mt-2 rounded-lg bg-pink-50 p-2 dark:bg-pink-950/30">
          <div class="mb-1 text-[10px] text-pink-500 font-medium dark:text-pink-300">
            变异效果
          </div>
          <div class="flex flex-wrap gap-1.5">
            <div
              v-for="effect in mutantEffects"
              :key="`bubble-${land.id}-${effect.id}-${effect.icon}`"
              class="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] text-pink-700 shadow-sm dark:bg-gray-900 dark:text-pink-200"
              :title="effect.tag && effect.tag !== '无' ? `${effect.name} · ${effect.tag}` : effect.name"
            >
              <img :src="effect.image" :alt="effect.name" class="h-4 w-4 object-contain">
              <span class="font-medium">{{ effect.name }}</span>
              <span v-if="effect.tag && effect.tag !== '无'" class="text-[10px] text-pink-400">· {{ effect.tag }}</span>
            </div>
          </div>
        </div>

        <div v-if="land.needWater || land.needWeed || land.needBug" class="mt-2 flex flex-wrap gap-1 text-[10px]">
          <span v-if="land.needWater" class="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">需要浇水</span>
          <span v-if="land.needWeed" class="rounded-full bg-green-100 px-2 py-0.5 text-green-700">需要除草</span>
          <span v-if="land.needBug" class="rounded-full bg-red-100 px-2 py-0.5 text-red-700">需要除虫</span>
        </div>

        <div v-if="isFertilizable || isRemovable" class="grid grid-cols-2 mt-2 gap-2">
          <button type="button" class="bubble-action border-emerald-600 text-emerald-700 dark:text-emerald-300" :disabled="!isFertilizable" @click="handleBubbleAction('fertilize')">
            <span class="i-carbon-growth" />催熟
          </button>
          <button type="button" class="bubble-action border-red-500 text-red-600 dark:text-red-300" :disabled="!isRemovable" @click="handleBubbleAction('remove')">
            <span class="i-carbon-trash-can" />铲除
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.land-ground-layer {
  z-index: 0;
}

.land-card-selected {
  z-index: 100 !important;
  box-shadow:
    0 0 0 3px rgb(59 130 246 / 0.88),
    0 8px 20px rgb(15 23 42 / 0.2);
}

.land-isometric.land-card-selected {
  box-shadow: none;
}

.land-isometric.land-card-selected .land-ground-single,
.land-isometric.land-card-selected .land-ground-merged {
  filter: saturate(1.15) brightness(1.05) drop-shadow(0 0 8px rgb(59 130 246 / 0.8));
}

.land-isometric {
  position: absolute;
  padding: 2px;
  transform: translateX(-50%);
  transform-origin: 50% 50%;
}

.land-bubble {
  position: absolute;
  z-index: 30 !important;
  left: 50%;
  top: calc(100% + 6px);
  width: min(240px, calc(100vw - 40px));
  display: none;
  padding: 12px;
  border: 1px solid rgb(226 232 240);
  border-radius: 12px;
  background: rgb(255 255 255 / 0.98);
  color: #334155;
  text-align: left;
  box-shadow: 0 14px 32px rgb(15 23 42 / 0.24);
  transform: translateX(-50%);
}

.land-bubble::before {
  position: absolute;
  left: 50%;
  top: -7px;
  width: 12px;
  height: 12px;
  content: '';
  border-left: 1px solid rgb(226 232 240);
  border-top: 1px solid rgb(226 232 240);
  background: inherit;
  transform: translateX(-50%) rotate(45deg);
}

.land-bubble-floating {
  position: fixed;
  z-index: 1000 !important;
  right: auto;
  display: block;
  transform: none;
}

.land-bubble-floating::before {
  left: var(--bubble-arrow-left, 50%);
  top: auto;
  bottom: -7px;
  border: 0;
  border-right: 1px solid rgb(226 232 240);
  border-bottom: 1px solid rgb(226 232 240);
}

.land-bubble-floating.land-bubble-floating-below::before {
  top: -7px;
  bottom: auto;
  border: 0;
  border-left: 1px solid rgb(226 232 240);
  border-top: 1px solid rgb(226 232 240);
}

.land-card-selected .land-bubble {
  display: block;
}

.land-grid-column-1 .land-bubble {
  left: 0;
  transform: none;
}

.land-grid-column-1 .land-bubble::before {
  left: 25%;
}

.land-grid-column-4 .land-bubble {
  right: 0;
  left: auto;
  transform: none;
}

.land-grid-column-4 .land-bubble::before {
  right: 25%;
  left: auto;
}

.land-isometric .land-card-id {
  display: none;
}

.land-isometric .land-bubble {
  top: 4px;
  transform: translate(-50%, calc(-100% - 8px));
}

.land-isometric .land-bubble::before {
  top: auto;
  bottom: -7px;
  border: 0;
  border-right: 1px solid rgb(226 232 240);
  border-bottom: 1px solid rgb(226 232 240);
}

.land-isometric.land-grid-column-1 .land-bubble,
.land-isometric.land-grid-column-4 .land-bubble {
  transform: translateY(calc(-100% - 8px));
}

.land-isometric.land-bubble-below .land-bubble {
  top: calc(100% - 8px);
  transform: translateX(-50%);
}

.land-isometric.land-bubble-below .land-bubble::before {
  top: -7px;
  bottom: auto;
  border: 0;
  border-left: 1px solid rgb(226 232 240);
  border-top: 1px solid rgb(226 232 240);
}

.land-isometric.land-bubble-below.land-grid-column-1 .land-bubble,
.land-isometric.land-bubble-below.land-grid-column-4 .land-bubble {
  transform: none;
}

@media (hover: hover) and (pointer: fine) {
  .land-card:hover .land-bubble,
  .land-card:focus-within .land-bubble {
    display: block;
  }

  .land-card:hover {
    z-index: 101 !important;
  }
}

.bubble-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 32px;
  border-width: 1px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}

.bubble-action:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

:global(.dark) .land-bubble {
  border-color: #475569;
  background: rgb(31 41 55 / 0.98);
  color: #e5e7eb;
}

.land-ground-single {
  position: absolute;
  left: 50%;
  top: 47%;
  width: 94%;
  height: auto;
  max-height: 68%;
  object-fit: contain;
  transform: translate(-50%, -50%);
  opacity: 0.82;
  filter: saturate(1.05) drop-shadow(0 3px 4px rgba(71, 53, 35, 0.16));
}

.land-card.col-span-2 .land-ground-layer,
.land-card.land-isometric-size-2 .land-ground-layer {
  left: 7%;
  right: 7%;
  top: 12%;
  bottom: 15%;
}

.land-ground-merged {
  position: absolute;
  left: 50%;
  top: 48%;
  width: 94%;
  height: auto;
  max-height: 74%;
  object-fit: contain;
  transform: translate(-50%, -50%);
  opacity: 0.82;
  filter: saturate(1.05) drop-shadow(0 3px 4px rgba(71, 53, 35, 0.14));
}

.land-card > :not(.land-ground-layer) {
  z-index: 1;
}

.land-card-name,
.land-card-meta,
.land-card-season {
  text-shadow:
    0 1px 2px rgba(255, 255, 255, 0.95),
    0 0 5px rgba(255, 255, 255, 0.88);
}

:global(.dark) .land-card-name,
:global(.dark) .land-card-meta,
:global(.dark) .land-card-season {
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.95),
    0 0 5px rgba(0, 0, 0, 0.8);
}

.land-action-button {
  height: 28px;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.78);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  box-shadow: inset 0 0 0 1px currentColor;
  transition:
    background-color 0.15s ease,
    transform 0.15s ease;
}

.land-action-button:hover {
  transform: translateY(-1px);
}

.land-level-black .land-card-id,
.land-level-black .land-card-meta,
.land-level-black .land-card-season {
  color: #475569;
}

:global(.dark) .land-level-black .land-card-id,
:global(.dark) .land-level-black .land-card-meta,
:global(.dark) .land-level-black .land-card-season {
  color: #cbd5e1;
}

.land-level-black .land-card-name {
  color: #111827;
  text-shadow: none;
}

:global(.dark) .land-level-black .land-card-name {
  color: #f8fafc;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.65);
}

.land-level-black .land-action-button {
  background: rgba(255, 255, 255, 0.78);
}

:global(.dark) .land-level-black .land-action-button {
  background: rgba(255, 255, 255, 0.9);
}
</style>
