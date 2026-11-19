<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

/**
 * 场景视图：等距农场画面。
 * 底图与土地贴图直接取 /game-config 素材，作物、状态气泡叠在对应地块上，
 * 点击地块打开新版土地详情弹窗。坐标沿用旧版 4 列等距布局。
 */
const props = withDefaults(defineProps<{
  lands?: any[]
}>(), {
  lands: () => [],
})

const emit = defineEmits<{
  open: [land: any]
}>()

const CANVAS_W = 1200
const CANVAS_H = 650
const LAND_W = 210
const LAND_H = 125
const STEP_X = 115
const STEP_Y = 59
const MERGED_W = LAND_W + STEP_X * 2
const MERGED_H = LAND_H + STEP_Y * 2

const imageCache = new Map<string, HTMLImageElement>()

const viewport = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const visible = ref(false)
const now = ref(Date.now())
/** 土地数据到达的时间戳，配合后端给的 matureInSec 做本地递减。 */
const snapshotAt = ref(Date.now())
let observer: IntersectionObserver | null = null

useIntervalFn(() => {
  now.value = Date.now()
}, 1000)

watch(() => props.lands, () => {
  snapshotAt.value = Date.now()
}, { immediate: true })

/** 合种副地不单独画，由主地一次性铺满 2×2。 */
const displayLands = computed(() => (Array.isArray(props.lands) ? props.lands : []).filter(land => !land?.occupiedByMaster))

const canvasSignature = computed(() => displayLands.value.map(land => [
  land?.id,
  land?.level,
  land?.needWater,
  land?.status,
  land?.plantSize,
  Array.isArray(land?.occupiedLandIds) ? land.occupiedLandIds.join(',') : '',
].join(':')).join('|'))

function anchorId(land: any) {
  const ids = Array.isArray(land?.occupiedLandIds)
    ? land.occupiedLandIds.map(Number).filter((id: number) => id > 0)
    : []
  return ids.length > 1 ? Math.min(...ids) : Number(land?.id) || 0
}

function position(land: any) {
  const occupied = Array.isArray(land?.occupiedLandIds)
    ? land.occupiedLandIds.map(Number).filter((id: number) => id > 0)
    : []
  const ids = occupied.length > 1 ? occupied : [anchorId(land)]
  const points = ids.map((id: number) => {
    const column = (id - 1) % 4
    const row = Math.floor((id - 1) / 4)
    return { x: 700 + column * STEP_X - row * STEP_X, y: 86 + (column + row) * STEP_Y }
  })
  return {
    x: points.reduce((sum: number, point: { x: number }) => sum + point.x, 0) / points.length,
    y: points.reduce((sum: number, point: { y: number }) => sum + point.y, 0) / points.length,
  }
}

function textureUrl(land: any) {
  const level = Math.min(5, Math.max(1, Number(land?.level) || 1))
  if (Number(land?.plantSize) > 1)
    return `/game-config/land_images/land_valid${level}_2x2.png`
  if (String(land?.status || '') === 'locked' || land?.unlocked === false)
    return '/game-config/land_images/land_locked.png'
  return `/game-config/land_images/${land?.needWater ? `land_dry${level}` : `land_valid${level}`}.png`
}

function loadImage(src: string) {
  const cached = imageCache.get(src)
  if (cached)
    return Promise.resolve(cached)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      imageCache.set(src, image)
      resolve(image)
    }
    image.onerror = reject
    image.src = src
  })
}

async function draw() {
  if (!visible.value)
    return
  await nextTick()
  const context = canvasEl.value?.getContext('2d')
  if (!context)
    return
  context.clearRect(0, 0, CANVAS_W, CANVAS_H)
  const field = await loadImage('/game-config/scene_images/farm-field-base.png').catch(() => null)
  if (field) {
    const scale = 1.16
    context.drawImage(field, (CANVAS_W - CANVAS_W * scale) / 2 + 10, (CANVAS_H - CANVAS_H * scale) / 2 + 8, CANVAS_W * scale, CANVAS_H * scale)
  }
  const lands = [...displayLands.value].sort((a, b) => position(a).y - position(b).y)
  const textures = await Promise.all(lands.map(land => loadImage(textureUrl(land)).catch(() => null)))
  lands.forEach((land, index) => {
    const texture = textures[index]
    if (!texture)
      return
    const { x, y } = position(land)
    const large = Number(land?.plantSize) > 1
    const drawWidth = large ? MERGED_W : LAND_W
    const drawHeight = large ? MERGED_H : LAND_H
    if (Number(land?.level) === 5 && !large) {
      context.save()
      context.translate(x, y)
      context.rotate(Math.PI)
      context.drawImage(texture, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
      context.restore()
    }
    else {
      context.drawImage(texture, x - drawWidth / 2, y - drawHeight / 2, drawWidth, drawHeight)
    }
  })
}

function landStyle(land: any) {
  const { x, y } = position(land)
  const large = Number(land?.plantSize) > 1
  const drawWidth = large ? MERGED_W : LAND_W
  const drawHeight = large ? MERGED_H : LAND_H
  return {
    left: `${(x - drawWidth / 2) / CANVAS_W * 100}%`,
    top: `${(y - drawHeight / 2) / CANVAS_H * 100}%`,
    width: `${drawWidth / CANVAS_W * 100}%`,
    height: `${drawHeight / CANVAS_H * 100}%`,
    zIndex: Math.round(y) + (large ? 2 : 1),
  }
}

const isLocked = (land: any) => String(land?.status || '') === 'locked' || land?.unlocked === false
const isEmpty = (land: any) => !isLocked(land) && (String(land?.status || '') === 'empty' || !String(land?.plantName || '').trim())

function formatTime(sec: number) {
  const value = Math.max(0, Math.floor(Number(sec) || 0))
  const h = Math.floor(value / 3600)
  const m = Math.floor((value % 3600) / 60)
  const s = value % 60
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** 后端给的是某一刻的剩余秒数，本地按秒扣减，父组件刷新后自动校正。 */
function remainSec(land: any) {
  const base = Number(land?.matureInSec) || 0
  if (base <= 0)
    return 0
  const elapsed = Math.floor((now.value - snapshotAt.value) / 1000)
  return Math.max(0, base - elapsed)
}

type BubbleTone = 'muted' | 'ripe' | 'steal' | 'dead' | 'growing'
interface LandBubble {
  text: string
  tone: BubbleTone
  /** 文本是否为成熟倒计时；窄屏下只有这种气泡值得保留。 */
  countdown: boolean
}

/** 气泡：优先展示可操作状态，其次倒计时，最后是作物阶段。 */
function bubble(land: any): LandBubble {
  if (isLocked(land))
    return { text: '未解锁', tone: 'muted', countdown: false }
  if (isEmpty(land))
    return { text: '空地', tone: 'muted', countdown: false }
  const status = String(land?.status || '')
  if (status === 'harvestable')
    return { text: '可收获', tone: 'ripe', countdown: false }
  if (status === 'stealable')
    return { text: '可偷', tone: 'steal', countdown: false }
  if (status === 'dead')
    return { text: '已枯萎', tone: 'dead', countdown: false }
  const remain = remainSec(land)
  if (remain > 0)
    return { text: formatTime(remain), tone: 'growing', countdown: true }
  return { text: String(land?.phaseName || '生长中'), tone: 'growing', countdown: false }
}

const failedMutantIcons = ref(new Set<string>())

function markMutantFailed(key: string) {
  failedMutantIcons.value = new Set(failedMutantIcons.value).add(key)
}

/** 气泡里倒计时前只保留变异效果小图标；缺水/草/虫等提示不再占倒计时前位置。 */
function mutantsOf(land: any) {
  if (isLocked(land) || isEmpty(land) || land?.occupiedByMaster)
    return []
  const effects = Array.isArray(land?.mutantEffects) && land.mutantEffects.length
    ? land.mutantEffects
    : (Array.isArray(land?.mutantConfigIds) ? land.mutantConfigIds.map((id: any) => ({ id, name: `变异 #${id}` })) : [])
  const list: Array<{ key: string, image: string, icon: string, label: string }> = []
  for (const effect of effects) {
    const id = Number(effect?.id) || 0
    const name = String(effect?.name || effect?.effect_name || '').trim()
    if (!name)
      continue
    const collections = id === 18 && Array.isArray(effect.collections) ? effect.collections : []
    for (const collection of collections) {
      const key = `m${id}:${collection.seriesId}:${collection.itemId}`
      list.push({
        key,
        image: failedMutantIcons.value.has(key) ? '' : safeImage(String(collection.image || '')),
        icon: 'i-carbon-trophy',
        label: `藏品变异 · ${collection.name}`,
      })
    }
    if (collections.length)
      continue
    const key = `m${id}${name}`
    list.push({
      key,
      image: id > 0 && id !== 18 && !failedMutantIcons.value.has(key) ? `/game-config/seed_images_named/mutant/${id}.png` : '',
      icon: id === 18 ? 'i-carbon-trophy' : 'i-carbon-star',
      label: `变异 · ${name}`,
    })
  }
  return list
}

function safeImage(url: string) {
  return url && url.startsWith('http://') ? url.replace('http://', 'https://') : url
}

function cropStyle(land: any) {
  const large = Number(land?.plantSize) > 1
  // 作物只占地块中间一小块，避免等距排列时挡住相邻地块。
  return large
    ? { width: '26%', height: '46%', bottom: '30%' }
    : { width: '32%', height: '56%', bottom: '24%' }
}

watch(canvasSignature, draw, { flush: 'post' })
watch(visible, (isVisible) => {
  if (isVisible)
    draw()
})

onMounted(() => {
  canvasEl.value!.width = CANVAS_W
  canvasEl.value!.height = CANVAS_H
  if (!viewport.value)
    return
  observer = new IntersectionObserver(([entry]) => {
    visible.value = Boolean(entry?.isIntersecting)
  }, { rootMargin: '160px 0px' })
  observer.observe(viewport.value)
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div ref="viewport" class="farm-scene">
    <div class="farm-scene__stage">
      <canvas ref="canvasEl" class="farm-scene__canvas" :width="CANVAS_W" :height="CANVAS_H" aria-hidden="true" />
      <button
        v-for="land in displayLands"
        :key="land.id"
        type="button"
        :data-land-id="land.id"
        class="scene-plot"
        :class="[`scene-plot--${bubble(land).tone}`, { 'is-large': Number(land.plantSize) > 1 }]"
        :style="landStyle(land)"
        :aria-label="`第 ${land.id} 块地，${isEmpty(land) ? '空地' : isLocked(land) ? '未解锁' : land.plantName}，${bubble(land).text}`"
        :title="`#${land.id} ${isEmpty(land) ? '空地' : isLocked(land) ? '未解锁' : land.plantName}`"
        @click="emit('open', land)"
      >
        <img v-if="!isLocked(land) && !isEmpty(land) && land.seedImage" class="scene-plot__crop" :src="safeImage(land.seedImage)" :style="cropStyle(land)" alt="" loading="lazy" referrerpolicy="no-referrer">
        <span class="scene-plot__stack">
          <span v-if="mutantsOf(land).length" class="scene-plot__badges">
            <span v-for="item in mutantsOf(land)" :key="item.key" class="scene-plot__mutant" :title="item.label"><img v-if="item.image" :src="item.image" alt="" @error="markMutantFailed(item.key)"><span v-else :class="item.icon" /></span>
          </span>
          <span class="scene-plot__bubble" :class="[`is-${bubble(land).tone}`, { 'is-countdown': bubble(land).countdown }]">
            {{ bubble(land).text }}
          </span>
        </span>
      </button>
    </div>
  </div>
  <p class="farm-scene__hint">
    场景视图按 4 列等距排布，点击任意地块查看详情；合种作物会占满 2×2 区域。
  </p>
</template>

<style scoped>
.farm-scene {
  container-type: inline-size;
  overflow: hidden;
  /* 旧版场景的最大宽度就是画布原始尺寸：超过 1200 就只是放大贴图，
     地块与气泡一起被拉大，在宽屏上会顶满整块内容区。 */
  width: 100%;
  max-width: 1200px;
  margin-inline: auto;
  border-radius: 16px;
  background: #a8d85d;
  box-shadow: inset 0 0 0 1px rgb(53 101 37 / 18%);
}

.farm-scene__stage {
  position: relative;
  isolation: isolate;
  width: 100%;
  aspect-ratio: 1200 / 650;
}

.farm-scene__canvas {
  position: absolute;
  z-index: 0;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.scene-plot {
  position: absolute;
  display: block;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  transition:
    filter 0.15s ease,
    transform 0.15s ease;
}

.scene-plot:hover {
  filter: brightness(1.05);
}

.scene-plot:focus-visible {
  outline: 2px solid rgb(255 255 255 / 85%);
  outline-offset: 2px;
  border-radius: 12px;
}

.scene-plot__crop {
  position: absolute;
  left: 50%;
  object-fit: contain;
  transform: translateX(-50%);
  filter: drop-shadow(0 3px 3px rgb(48 39 22 / 28%));
  pointer-events: none;
}

.scene-plot--dead .scene-plot__crop {
  filter: grayscale(0.85) drop-shadow(0 3px 3px rgb(48 39 22 / 25%));
}

/* 气泡与变异图标同处一层定位容器：图标独立于气泡显隐，
   窄屏收起气泡时仍能看到变异标记。 */
.scene-plot__stack {
  position: absolute;
  left: 50%;
  top: 4%;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.scene-plot__badges {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 1px;
}

.scene-plot__bubble {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 7px;
  border-radius: 999px;
  color: #3f4a39;
  background: rgb(255 255 255 / 92%);
  box-shadow: 0 1px 3px rgb(45 66 52 / 18%);
  font-size: clamp(9px, 1.05cqw, 13px);
  font-weight: 650;
  line-height: 1.45;
  white-space: nowrap;
}

.scene-plot__bubble.is-ripe {
  color: #fff;
  background: rgb(74 143 63 / 95%);
}

.scene-plot__bubble.is-steal {
  color: #fff;
  background: rgb(140 92 196 / 95%);
}

.scene-plot__bubble.is-dead {
  color: #fff;
  background: rgb(122 122 122 / 92%);
}

.scene-plot__bubble.is-muted {
  color: #6a7263;
  background: rgb(255 255 255 / 80%);
}

.scene-plot__need {
  display: inline-grid;
  flex: none;
  width: clamp(9px, 1cqw, 12px);
  height: clamp(9px, 1cqw, 12px);
  place-items: center;
  border-radius: 999px;
  color: #fff;
  font-size: clamp(7px, 0.75cqw, 10px);
  line-height: 0;
}

.scene-plot__need.is-water {
  background: #4b9fd5;
}

.scene-plot__need.is-weed {
  background: #5a9f4e;
}

.scene-plot__need.is-bug {
  background: #d9605c;
}

.scene-plot__mutant {
  display: inline-grid;
  flex: none;
  width: clamp(10px, 1.1cqw, 14px);
  height: clamp(10px, 1.1cqw, 14px);
  place-items: center;
  color: #c08a12;
  font-size: clamp(8px, 0.85cqw, 11px);
  line-height: 0;
}

.scene-plot__mutant img,
.scene-plot__mutant > span {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.farm-scene__hint {
  max-width: 1200px;
  margin: 8px auto 0;
  color: var(--ui-muted);
  font-size: 12px;
  text-align: center;
}

/* 窄屏：地块小、气泡容易叠在一起，收起「纯阶段名」与空地标签，
   但成熟倒计时必须保留（否则看不到还要等多久），只缩小字号。 */
@container (max-width: 560px) {
  .scene-plot__bubble {
    padding: 0 5px;
    font-size: 9px;
  }

  .scene-plot__bubble.is-countdown {
    padding: 0 4px;
    font-size: 8px;
  }

  .scene-plot__bubble.is-growing:not(.is-countdown),
  .scene-plot__bubble.is-muted {
    display: none;
  }

  .scene-plot__need {
    width: 8px;
    height: 8px;
    font-size: 6px;
  }

  .scene-plot__mutant {
    width: 9px;
    height: 9px;
    font-size: 7px;
  }
}

.dark .farm-scene {
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 8%);
}

@media (prefers-reduced-motion: reduce) {
  .scene-plot {
    transition: none;
  }
}
</style>
