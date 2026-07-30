<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = withDefaults(defineProps<{
  land: any
  showActions?: boolean
  farmGrid?: boolean
  farmGridRowOffset?: number
}>(), {
  showActions: true,
  farmGrid: false,
  farmGridRowOffset: 0,
})

defineEmits<{
  (e: 'fertilize', land: any): void
  (e: 'remove', land: any): void
}>()

const land = computed(() => props.land)
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (timer)
    clearInterval(timer)
})

const canFertilize = computed(() =>
  props.showActions
  && Number(land.value?.matureInSec) > 0
  && land.value?.status !== 'locked'
  && land.value?.status !== 'empty',
)

const canRemove = computed(() =>
  props.showActions
  && land.value?.status !== 'locked'
  && land.value?.status !== 'empty'
  && Boolean(
    land.value?.plantName
    || land.value?.seedImage
    || Number(land.value?.matureInSec) > 0
    || ['dead', 'growing', 'harvestable', 'stealable'].includes(String(land.value?.status || '')),
  ),
)

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

const landTextureUrl = computed(() =>
  `/game-config/land_images/${landTextureName.value}.png`,
)

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

  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${h > 0 ? `${h}:` : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function getSafeImageUrl(url: string) {
  if (!url)
    return ''
  if (url.startsWith('http://'))
    return url.replace('http://', 'https://')
  return url
}

function getPlantSizeText(targetLand: any) {
  const size = Number(targetLand?.plantSize) || 1
  if (size <= 1)
    return ''
  return `${size}x${size}`
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
</script>

<template>
  <div
    class="land-card relative h-full min-h-0 flex flex-col items-center overflow-hidden border-2 rounded-lg px-2 pb-11 pt-2 transition hover:shadow-md"
    :class="[
      getLandStatusClass(land),
      {
        'col-span-2 row-span-2 justify-center px-4 pt-3': Number(land.plantSize) > 1,
      },
    ]"
    :style="getFarmGridStyle(land)"
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
      v-if="land.plantSize > 1"
      class="absolute right-1 top-1 rounded bg-pink-100 px-1 py-0.5 text-[10px] text-pink-700 dark:bg-pink-900/30 dark:text-pink-300"
    >
      合种 {{ getPlantSizeText(land) }}
    </div>

    <div
      v-if="mutantEffects.length > 0"
      class="absolute left-1 top-5 flex flex-col gap-1"
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
        v-if="land.seedImage"
        :src="getSafeImageUrl(land.seedImage)"
        class="max-h-full max-w-full object-contain"
        loading="lazy"
        referrerpolicy="no-referrer"
      >
      <div v-else class="i-carbon-sprout text-xl text-gray-300" />
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
      <span v-if="land.needWater" class="rounded bg-blue-100 px-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">水</span>
      <span v-if="land.needWeed" class="rounded bg-green-100 px-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-400">草</span>
      <span v-if="land.needBug" class="rounded bg-red-100 px-0.5 text-red-700 dark:bg-red-900/30 dark:text-red-400">虫</span>
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
        @click="$emit('fertilize', land)"
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
        @click="$emit('remove', land)"
      >
        <span class="i-carbon-trash-can text-sm" />
        <span>铲除</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.land-ground-layer {
  z-index: 0;
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

.land-card.col-span-2 .land-ground-layer {
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
