<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  land: any
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
  if (timer) {
    clearInterval(timer)
  }
})

const growProgress = computed(() => {
  const matureInSec = land.value.matureInSec || 0
  const totalGrowTime = land.value.totalGrowTime || 0
  
  if (totalGrowTime <= 0 || matureInSec <= 0) {
    return 0
  }
  
  const progress = Math.min(100, Math.max(0, (matureInSec / totalGrowTime) * 100))
  return progress
})

function getLandStatusClass(land: any) {
  const status = land.status
  const level = Number(land.level) || 0

  if (status === 'locked')
    return 'land-locked opacity-60 border-dashed border-gray-300 dark:border-gray-600'

  let baseClass = 'soil-level-0'

  // 土地等级样式 — soil texture classes
  switch (level) {
    case 1: // 黄土地
      baseClass = 'soil-level-1'
      break
    case 2: // 红土地
      baseClass = 'soil-level-2'
      break
    case 3: // 黑土地
      baseClass = 'soil-level-3'
      break
    case 4: // 金土地
      baseClass = 'soil-level-4'
      break
    case 5: // 紫金土地
      baseClass = 'soil-level-5'
      break
  }

  // 状态叠加
  if (status === 'dead')
    return 'land-dead border-gray-400 dark:border-gray-600 grayscale'

  if (status === 'harvestable')
    return `${baseClass} land-harvestable`

  if (status === 'stealable')
    return `${baseClass} land-stealable`

  if (status === 'growing')
    return baseClass

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

function getLandTypeName(level: number) {
  const typeMap: Record<number, string> = {
    0: '普通',
    1: '黄土地',
    2: '红土地',
    3: '黑土地',
    4: '金土地',
    5: '紫金土地',
  }
  return typeMap[Number(level) || 0] || ''
}
function getPlantSizeText(land: any) {
  const size = Number(land?.plantSize) || 1
  if (size <= 1)
    return ''
  return `${size}x${size}`
}

function landTypeBadgeClass(level: number) {
  const lv = Number(level) || 0
  const map: Record<number, string> = {
    0: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    1: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    2: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    3: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    4: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    5: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  }
  return map[lv] || map[0]
}
</script>

<template>
  <div
    class="cartoon-card land-card relative min-h-[160px] flex flex-col items-center border-2 rounded-2xl p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
    :class="getLandStatusClass(land)"
  >
    <!-- Land ID badge -->
    <div class="absolute left-2 top-2 font-display text-[10px] font-mono opacity-50">
      #{{ land.id }}
    </div>

    <!-- Plant size badge (joint planting) -->
    <div
      v-if="land.plantSize > 1"
      class="absolute right-2 top-2 rounded-full bg-pink-100 px-1.5 py-0.5 text-[10px] font-bold text-pink-700 shadow-sm dark:bg-pink-900/30 dark:text-pink-300"
    >
      合种 {{ getPlantSizeText(land) }}
    </div>

    <!-- Plant image with growth animation -->
    <div
      class="plant-container mb-1 mt-5 h-12 w-12 flex items-center justify-center"
      :class="{ 'animate-plant-grow': land.matureInSec > 0 }"
    >
      <img
        v-if="land.seedImage"
        :src="getSafeImageUrl(land.seedImage)"
        class="max-h-full max-w-full object-contain drop-shadow-sm"
        loading="lazy"
        referrerpolicy="no-referrer"
      >
      <span v-else class="text-2xl opacity-30">🌱</span>
    </div>

    <!-- Plant name -->
    <div class="w-full truncate px-1 text-center text-xs font-bold" :title="land.plantName">
      {{ land.plantName || '-' }}
    </div>

    <!-- Time/status line -->
    <div class="mb-0.5 mt-0.5 w-full text-center text-[10px]">
      <span v-if="land.matureInSec > 0" class="font-bold text-orange-600 dark:text-orange-400">
        ⏱ {{ formatTime(land.matureInSec) }}
      </span>
      <span v-else class="text-gray-500">
        {{ land.phaseName || (land.status === 'locked' ? '🔒 未解锁' : '🌾 未开垦') }}
      </span>
    </div>

    <!-- Cartoon progress bar -->
    <div v-if="land.matureInSec > 0 && land.totalGrowTime > 0" class="w-full px-2">
      <div class="farm-progress">
        <div
          class="farm-progress-fill"
          :style="{ width: `${growProgress}%` }"
        />
      </div>
    </div>

    <!-- Land type and season info -->
    <div class="mt-0.5 flex items-center gap-1.5 text-[10px]">
      <span class="rounded-full px-1.5 py-0.5 font-display" :class="landTypeBadgeClass(land.level)">
        {{ getLandTypeName(land.level) }}
      </span>
      <span class="text-gray-400">
        季 {{ land.totalSeason > 0 ? (`${land.currentSeason}/${land.totalSeason}`) : '-/-' }}
      </span>
    </div>

    <!-- Status Badges (game-style) -->
    <div class="mt-auto flex items-center gap-1 pt-1">
      <span
        v-if="land.needWater"
        class="badge-water inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
      >
        💧
      </span>
      <span
        v-if="land.needWeed"
        class="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-900/40 dark:text-green-300"
      >
        🌿
      </span>
      <span
        v-if="land.needBug"
        class="badge-bug inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
      >
        🐛
      </span>
      <span
        v-if="land.status === 'harvestable'"
        class="badge-harvest inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
      >
        ✨ 收获
      </span>
      <span
        v-if="land.status === 'stealable'"
        class="inline-flex items-center gap-0.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
      >
        🤚 可偷
      </span>
    </div>
  </div>
</template>

<style scoped>
/* ===== Land Card Base — 3D卡通效果 ===== */
.land-card {
  box-shadow: 0 3px 0 rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.1);
  border-radius: 18px;
  border-width: 3px;
}

.land-card:hover {
  box-shadow: 0 4px 0 rgba(0,0,0,0.18), 0 6px 16px rgba(0,0,0,0.12);
  transform: translateY(-2px);
}

/* ===== Soil Texture Backgrounds by Level ===== */
.soil-level-0 {
  background: linear-gradient(180deg, #f5f0e8 0%, #e8dcc8 60%, #d4c4a0 100%);
  border-color: #c9b88a;
}
.soil-level-1 {
  /* 黄土地 — warm yellow-brown */
  background:
    radial-gradient(ellipse at 20% 80%, rgba(200,160,60,0.25) 0%, transparent 50%),
    radial-gradient(ellipse at 75% 30%, rgba(180,140,50,0.2) 0%, transparent 45%),
    linear-gradient(180deg, #f5e6b8 0%, #e0c878 45%, #c8a84a 100%);
  border-color: #b89838;
}
.soil-level-2 {
  /* 红土地 — reddish-brown */
  background:
    radial-gradient(ellipse at 30% 70%, rgba(180,80,40,0.2) 0%, transparent 50%),
    radial-gradient(ellipse at 70% 25%, rgba(160,60,30,0.15) 0%, transparent 45%),
    linear-gradient(180deg, #e8b09a 0%, #c87850 45%, #a85830 100%);
  border-color: #984828;
}
.soil-level-3 {
  /* 黑土地 — dark rich soil */
  background:
    radial-gradient(ellipse at 25% 75%, rgba(40,40,40,0.3) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 20%, rgba(60,50,40,0.2) 0%, transparent 45%),
    linear-gradient(180deg, #6b6058 0%, #4a3f35 45%, #2e2520 100%);
  border-color: #3a2f25;
  color: #e8e0d8;
}
.soil-level-4 {
  /* 金土地 — golden shimmer */
  background:
    radial-gradient(ellipse at 30% 60%, rgba(255,215,0,0.35) 0%, transparent 50%),
    radial-gradient(ellipse at 70% 30%, rgba(255,200,50,0.25) 0%, transparent 45%),
    linear-gradient(180deg, #fff0b0 0%, #f0d060 45%, #d4a820 100%);
  border-color: #c09818;
  animation: golden-shimmer 3s ease-in-out infinite;
}
.soil-level-5 {
  /* 紫金土地 — purple-gold shimmer */
  background:
    radial-gradient(ellipse at 25% 65%, rgba(168,85,247,0.3) 0%, transparent 50%),
    radial-gradient(ellipse at 70% 30%, rgba(255,215,0,0.3) 0%, transparent 45%),
    linear-gradient(180deg, #f0e0ff 0%, #d4a8f0 30%, #c084fc 60%, #a855f7 100%);
  border-color: #9333ea;
  animation: purple-gold-shimmer 3s ease-in-out infinite;
}

.land-locked {
  background: linear-gradient(180deg, #e8e8e8 0%, #d0d0d0 100%);
}
.land-dead {
  background: linear-gradient(180deg, #b0b0b0 0%, #888888 100%);
}

/* ===== Level-specific border accents ===== */
.soil-level-1 { border-color: #b89838; }
.soil-level-2 { border-color: #984828; }
.soil-level-3 { border-color: #5a4f45; }
.soil-level-4 { border-color: #c09818; }
.soil-level-5 { border-color: #9333ea; }

/* ===== Harvestable / Stealable highlights — 增强发光效果 ===== */
.land-harvestable {
  box-shadow:
    0 0 0 3px #f0c040,
    0 0 16px rgba(240,192,64,0.35),
    0 3px 0 rgba(0,0,0,0.15);
  animation: pulse-glow-gold 2s ease-in-out infinite;
}

@keyframes pulse-glow-gold {
  0%, 100% { box-shadow: 0 0 0 3px #f0c040, 0 0 12px rgba(240,192,64,0.3), 0 3px 0 rgba(0,0,0,0.15); }
  50% { box-shadow: 0 0 0 4px #f0c040, 0 0 24px rgba(240,192,64,0.5), 0 3px 0 rgba(0,0,0,0.15); }
}

.land-stealable {
  box-shadow:
    0 0 0 3px #a855f7,
    0 0 16px rgba(168,85,247,0.35),
    0 3px 0 rgba(0,0,0,0.15);
}

/* ===== Plant Growth Animation ===== */
.animate-plant-grow {
  animation: plant-grow 2s ease-in-out infinite;
}

@keyframes plant-grow {
  0%, 100% {
    transform: scale(1) translateY(0);
  }
  25% {
    transform: scale(1.05) translateY(-2px);
  }
  50% {
    transform: scale(1.1) translateY(-3px);
  }
  75% {
    transform: scale(1.05) translateY(-1px);
  }
}

/* ===== Golden shimmer for level 4 ===== */
@keyframes golden-shimmer {
  0%, 100% {
    box-shadow:
      0 0 8px rgba(255,215,0,0.2),
      var(--theme-shadow-sm, 0 2px 8px rgba(0,0,0,0.08));
  }
  50% {
    box-shadow:
      0 0 16px rgba(255,215,0,0.4),
      0 0 32px rgba(255,215,0,0.15),
      var(--theme-shadow-md, 0 4px 12px rgba(0,0,0,0.12));
  }
}

@keyframes purple-gold-shimmer {
  0%, 100% {
    box-shadow:
      0 0 8px rgba(168,85,247,0.2),
      0 0 4px rgba(255,215,0,0.15),
      var(--theme-shadow-sm, 0 2px 8px rgba(0,0,0,0.08));
  }
  50% {
    box-shadow:
      0 0 16px rgba(168,85,247,0.4),
      0 0 24px rgba(255,215,0,0.2),
      var(--theme-shadow-md, 0 4px 12px rgba(0,0,0,0.12));
  }
}

/* ===== Cartoon Progress Bar (farm-progress) ===== */
.farm-progress {
  width: 100%;
  height: 10px;
  background: linear-gradient(180deg, #d4c8a0 0%, #c0b080 100%);
  border-radius: var(--theme-radius-md, 8px);
  overflow: hidden;
  box-shadow:
    inset 0 2px 4px rgba(0,0,0,0.15),
    0 1px 2px rgba(255,255,255,0.3);
  position: relative;
  border: 1px solid rgba(0,0,0,0.08);
}

.farm-progress::before {
  content: '';
  position: absolute;
  top: 1px;
  left: 2px;
  right: 2px;
  height: 3px;
  background: linear-gradient(90deg, rgba(255,255,255,0.5), rgba(255,255,255,0.15));
  border-radius: 6px 6px 0 0;
  pointer-events: none;
  z-index: 1;
}

.farm-progress-fill {
  height: 100%;
  background: linear-gradient(
    180deg,
    #6dd400 0%,
    #44a800 40%,
    #2d8000 100%
  );
  border-radius: var(--theme-radius-md, 8px);
  transition: width 1s linear;
  position: relative;
  box-shadow:
    inset 0 1px 3px rgba(255,255,255,0.4),
    inset 0 -1px 2px rgba(0,0,0,0.15);
}

.farm-progress-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255,255,255,0.35) 50%,
    transparent 100%
  );
  animation: progress-shimmer 2.5s ease-in-out infinite;
  border-radius: var(--theme-radius-md, 8px);
}

@keyframes progress-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}

/* ===== Status Badge Animations ===== */

/* Water drop animation */
.badge-water {
  background: linear-gradient(135deg, #e0f2fe, #bae6fd);
  color: #0369a1;
  animation: water-drop 1.5s ease-in-out infinite;
}
.dark .badge-water {
  background: rgba(56,189,248,0.2);
  color: #7dd3fc;
}

@keyframes water-drop {
  0%, 100% {
    transform: translateY(0) scale(1);
  }
  30% {
    transform: translateY(-3px) scale(1.1);
  }
  50% {
    transform: translateY(1px) scale(0.95);
  }
  70% {
    transform: translateY(-1px) scale(1.02);
  }
}

/* Bug wiggle animation */
.badge-bug {
  background: linear-gradient(135deg, #fee2e2, #fecaca);
  color: #dc2626;
  animation: cartoon-wiggle 0.6s ease-in-out infinite;
}
.dark .badge-bug {
  background: rgba(239,68,68,0.2);
  color: #fca5a5;
}

@keyframes cartoon-wiggle {
  0%, 100% { transform: rotate(0deg); }
  20% { transform: rotate(-8deg); }
  40% { transform: rotate(8deg); }
  60% { transform: rotate(-5deg); }
  80% { transform: rotate(5deg); }
}

/* Harvest sparkle animation */
.badge-harvest {
  background: linear-gradient(135deg, #fef9c3, #fde68a);
  color: #b45309;
  animation: sparkle 1.2s ease-in-out infinite;
}
.dark .badge-harvest {
  background: rgba(245,158,11,0.2);
  color: #fcd34d;
}

@keyframes sparkle {
  0%, 100% {
    transform: scale(1);
    filter: brightness(1);
  }
  25% {
    transform: scale(1.15);
    filter: brightness(1.2);
  }
  50% {
    transform: scale(1);
    filter: brightness(1);
  }
  75% {
    transform: scale(1.1);
    filter: brightness(1.15);
  }
}

/* ===== Dark mode soil adjustments ===== */
@media (prefers-color-scheme: dark) {
  .soil-level-0 {
    background: linear-gradient(180deg, #3a3530 0%, #2e2820 100%);
    border-color: #555;
  }
  .soil-level-1 {
    background:
      radial-gradient(ellipse at 20% 80%, rgba(200,160,60,0.12) 0%, transparent 50%),
      linear-gradient(180deg, #5a4a20 0%, #4a3a18 100%);
    border-color: #7a6a30;
  }
  .soil-level-2 {
    background:
      radial-gradient(ellipse at 30% 70%, rgba(180,80,40,0.12) 0%, transparent 50%),
      linear-gradient(180deg, #5a2818 0%, #4a1810 100%);
    border-color: #7a3828;
  }
  .soil-level-3 {
    background:
      radial-gradient(ellipse at 25% 75%, rgba(40,40,40,0.3) 0%, transparent 50%),
      linear-gradient(180deg, #2a2018 0%, #1a1008 100%);
    border-color: #4a3f35;
    color: #d8d0c8;
  }
  .soil-level-4 {
    background:
      radial-gradient(ellipse at 30% 60%, rgba(255,215,0,0.15) 0%, transparent 50%),
      linear-gradient(180deg, #5a4810 0%, #4a3808 100%);
    border-color: #8a7820;
  }
  .soil-level-5 {
    background:
      radial-gradient(ellipse at 25% 65%, rgba(168,85,247,0.15) 0%, transparent 50%),
      radial-gradient(ellipse at 70% 30%, rgba(255,215,0,0.12) 0%, transparent 45%),
      linear-gradient(180deg, #3a1850 0%, #2a1040 100%);
    border-color: #7c3aed;
    color: #e0d0f0;
  }

  .land-locked {
    background: linear-gradient(180deg, #2a2a2a 0%, #222 100%);
  }
  .land-dead {
    background: linear-gradient(180deg, #3a3a3a 0%, #2a2a2a 100%);
  }

  .farm-progress {
    background: linear-gradient(180deg, #3a3530 0%, #2e2820 100%);
  }
}
</style>
