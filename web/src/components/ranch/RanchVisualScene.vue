<script setup lang="ts">
import type { RanchAnimal, RanchFacility, RanchRequest, RanchState } from '@/utils/ranch'
import { useIntervalFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { formatQuantity, formatSeconds } from '@/utils/ranch'

/**
 * 牧场场景视图：按栏舍铺开动物形象，和农场的土地场景对应。
 *
 * 视觉只用 DOM + 配置里的精灵图：牧场没有等距底图素材，硬套 canvas 会得到一堆
 * 对不齐的贴图。每只动物显示形象、阶段与下一次状态变化的倒计时，点一下就地展开
 * 可执行动作（收获 / 催产 / 喂食 / 抚摸 / 放生），避免为了一个操作跳去列表页。
 */
const props = defineProps<{ state: RanchState | null }>()

const emit = defineEmits<{ request: [payload: RanchRequest] }>()

const now = ref(Date.now())
useIntervalFn(() => {
  now.value = Date.now()
}, 1000)

const ranches = computed(() => (props.state?.facilities || []).filter((facility: RanchFacility) => facility.isRanch))

const summary = computed(() => {
  const animals = ranches.value.flatMap(ranch => ranch.ranch?.animals || [])
  return {
    harvest: animals.filter(animal => animal.stageName === '可收获').length,
    produce: animals.filter(animal => animal.stageName === '可生产').length,
    hungry: animals.filter(animal => animal.grassBlocked).length,
    hazards: ranches.value.reduce((sum, ranch) => sum + (ranch.ranch?.hazards?.length || 0), 0),
    total: animals.length,
  }
})

/** 精灵图按动物配置 ID 取；个别动物没有图时回落到后端给的产物图。 */
const brokenSprites = ref<Set<number>>(new Set())
function sprite(animal: RanchAnimal) {
  if (brokenSprites.value.has(animal.animalId))
    return animal.image
  return `/game-config/seed_images_named/seed_images/${animal.animalId}.png`
}
function onSpriteError(animal: RanchAnimal) {
  const next = new Set(brokenSprites.value)
  next.add(animal.animalId)
  brokenSprites.value = next
}

function remainingSeconds(animal: RanchAnimal) {
  if (animal.nextAtMs && animal.nextAtMs > 0)
    return Math.max(0, Math.ceil((animal.nextAtMs - now.value) / 1000))
  return animal.countdown === null ? null : Math.max(0, Math.ceil(animal.countdown - (now.value % 1000) / 1000))
}

function countdownText(animal: RanchAnimal) {
  const remaining = remainingSeconds(animal)
  if (remaining === null)
    return ''
  if (remaining <= 0)
    return '即将变化'
  return `${formatSeconds(remaining)} 后变化`
}

function stageTone(animal: RanchAnimal) {
  if (animal.stageName === '可收获')
    return 'is-harvest'
  if (animal.stageName === '可生产')
    return 'is-produce'
  if (animal.grassBlocked || animal.stageName === '缺少牧草')
    return 'is-hungry'
  return 'is-growing'
}

const selected = ref<{ ranchId: string, animalId: number } | null>(null)
const selectedAnimal = computed(() => {
  const key = selected.value
  if (!key)
    return null
  for (const ranch of ranches.value) {
    const found = ranch.ranch?.animals?.find(animal => animal.ranchId === key.ranchId && animal.id === key.animalId)
    if (found)
      return found
  }
  return null
})

function toggleAnimal(animal: RanchAnimal) {
  const same = selected.value && selected.value.ranchId === animal.ranchId && selected.value.animalId === animal.id
  selected.value = same ? null : { ranchId: animal.ranchId, animalId: animal.id }
}

watch(ranches, () => {
  if (selected.value && !selectedAnimal.value)
    selected.value = null
})

function act(animal: RanchAnimal, action: RanchAnimal['actions'][number]) {
  emit('request', {
    action: action.action,
    input: action.input,
    title: `${action.label}：${animal.name}`,
    danger: action.danger,
    note: action.action === 'release' ? '放生后动物离开栏舍，已产出的产物保留；服务端会再次核对状态。' : undefined,
  })
}

function animalCount(ranch: RanchFacility) {
  return `${ranch.ranch?.count ?? 0} / ${ranch.ranch?.capacity ?? ranch.capacity}`
}
</script>

<template>
  <div class="ranch-scene">
    <div v-if="!ranches.length" class="ranch-scene__empty">
      <span class="i-carbon-home" aria-hidden="true" />
      <div>
        <strong>还没有栏舍</strong>
        <p>到「设施」分区建造窝或棚后，动物会在这里显示。</p>
      </div>
    </div>

    <template v-else>
      <div class="ranch-scene__summary">
        <span class="ranch-chip"><b>{{ summary.total }}</b> 只动物</span>
        <span class="ranch-chip is-harvest"><b>{{ summary.harvest }}</b> 可收获</span>
        <span class="ranch-chip is-produce"><b>{{ summary.produce }}</b> 可生产</span>
        <span class="ranch-chip" :class="{ 'is-hungry': summary.hungry > 0 }"><b>{{ summary.hungry }}</b> 缺牧草</span>
        <span class="ranch-chip" :class="{ 'is-hungry': summary.hazards > 0 }"><b>{{ summary.hazards }}</b> 危险物</span>
        <span class="ranch-scene__hint">点击动物查看可执行操作</span>
      </div>

      <div class="ranch-scene__grid">
        <section v-for="ranch in ranches" :key="ranch.id" class="ranch-pen">
          <header class="ranch-pen__head">
            <div class="min-w-0">
              <h3>{{ ranch.name }}</h3>
              <p>Lv.{{ ranch.level }} · {{ animalCount(ranch) }}</p>
            </div>
            <div class="ranch-pen__badges">
              <span v-if="ranch.ranch?.hazards?.length" class="ranch-badge is-danger">
                <span class="i-carbon-warning-alt" aria-hidden="true" />{{ ranch.ranch.hazards.length }}
              </span>
              <span v-if="ranch.feed" class="ranch-badge">
                <span class="i-carbon-crop-growth" aria-hidden="true" />{{ formatSeconds(Number(ranch.feed.remainingSec) || 0) }}
              </span>
            </div>
          </header>

          <div class="ranch-pen__yard">
            <button
              v-for="animal in ranch.ranch?.animals || []"
              :key="animal.id"
              type="button"
              class="ranch-animal"
              :class="[stageTone(animal), { 'is-selected': selected && selected.animalId === animal.id && selected.ranchId === animal.ranchId }]"
              @click="toggleAnimal(animal)"
            >
              <span class="ranch-animal__sprite">
                <img :src="sprite(animal)" :alt="animal.name" loading="lazy" @error="onSpriteError(animal)">
                <span v-if="animal.mutation" class="ranch-animal__mutation" title="变异动物">变异</span>
              </span>
              <span class="ranch-animal__name">{{ animal.name }}</span>
              <span class="ranch-animal__stage">{{ animal.stageName }}</span>
              <span v-if="countdownText(animal)" class="ranch-animal__countdown">{{ countdownText(animal) }}</span>
              <span v-else class="ranch-animal__countdown is-idle">状态稳定</span>
              <span v-if="animal.maxProduceCount" class="ranch-animal__produce">产物 {{ formatQuantity(animal.produceCount) }}/{{ animal.maxProduceCount }}</span>
            </button>

            <div
              v-for="slot in Math.max(0, (ranch.ranch?.capacity || 0) - (ranch.ranch?.animals?.length || 0))"
              :key="`empty-${slot}`"
              class="ranch-animal is-empty"
            >
              <span class="i-carbon-add" aria-hidden="true" />
              <span>空栏位</span>
            </div>
          </div>

          <div v-if="selectedAnimal && selectedAnimal.ranchId === ranch.id" class="ranch-pen__actions">
            <div class="ranch-pen__actions-head">
              <strong>{{ selectedAnimal.name }}</strong>
              <span>{{ selectedAnimal.stageName }}<template v-if="countdownText(selectedAnimal)"> · {{ countdownText(selectedAnimal) }}</template></span>
            </div>
            <div class="flex flex-wrap gap-2">
              <BaseButton
                v-for="action in selectedAnimal.actions"
                :key="`${action.action}-${action.label}`"
                size="sm"
                :variant="action.danger ? 'danger' : 'secondary'"
                :disabled="!action.enabled"
                :title="action.reason || action.label"
                @click="act(selectedAnimal, action)"
              >
                {{ action.label }}
              </BaseButton>
              <span v-if="!selectedAnimal.actions.length" class="text-xs text-gray-500">当前没有可执行操作</span>
            </div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ranch-scene {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ranch-scene__empty {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 28px 20px;
  border: 1px dashed var(--ui-border);
  border-radius: 12px;
  color: var(--ui-muted);
  font-size: 13px;
}

.ranch-scene__empty strong {
  color: var(--ui-ink);
  font-size: 14px;
}

.ranch-scene__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.ranch-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: var(--ui-surface);
  color: var(--ui-muted);
  font-size: 12px;
}

.ranch-chip b {
  color: var(--ui-ink);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.ranch-chip.is-harvest {
  border-color: color-mix(in srgb, #d97706 40%, var(--ui-border));
  background: color-mix(in srgb, #f59e0b 12%, var(--ui-surface));
}

.ranch-chip.is-produce {
  border-color: color-mix(in srgb, #0ea5e9 40%, var(--ui-border));
  background: color-mix(in srgb, #0ea5e9 10%, var(--ui-surface));
}

.ranch-chip.is-hungry {
  border-color: color-mix(in srgb, #dc2626 40%, var(--ui-border));
  background: color-mix(in srgb, #ef4444 10%, var(--ui-surface));
}

.ranch-scene__hint {
  margin-left: auto;
  color: var(--ui-muted);
  font-size: 12px;
}

.ranch-scene__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.ranch-pen {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background:
    radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, #86efac 18%, transparent), transparent 70%),
    var(--ui-surface);
}

.ranch-pen__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.ranch-pen__head h3 {
  color: var(--ui-ink);
  font-size: 14px;
  font-weight: 650;
}

.ranch-pen__head p {
  margin-top: 2px;
  color: var(--ui-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.ranch-pen__badges {
  display: flex;
  flex: none;
  gap: 6px;
}

.ranch-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, #16a34a 12%, var(--ui-surface));
  color: #15803d;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.ranch-badge.is-danger {
  background: color-mix(in srgb, #ef4444 14%, var(--ui-surface));
  color: #b91c1c;
}

.ranch-pen__yard {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(82px, 1fr));
  gap: 8px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, #16a34a 18%, var(--ui-border));
  border-radius: 10px;
  background:
    repeating-linear-gradient(135deg, color-mix(in srgb, #22c55e 8%, transparent) 0 10px, transparent 10px 20px),
    color-mix(in srgb, #dcfce7 30%, var(--ui-surface));
}

.ranch-animal {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px 6px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: color-mix(in srgb, var(--ui-surface) 82%, transparent);
  color: var(--ui-ink);
  text-align: center;
  transition:
    border-color 150ms ease,
    transform 150ms ease,
    box-shadow 150ms ease;
}

.ranch-animal:hover {
  border-color: color-mix(in srgb, var(--theme-primary) 45%, var(--ui-border));
  box-shadow: 0 4px 12px rgb(0 0 0 / 8%);
  transform: translateY(-1px);
}

.ranch-animal.is-selected {
  border-color: var(--theme-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-primary) 28%, transparent);
}

.ranch-animal.is-empty {
  justify-content: center;
  min-height: 118px;
  border: 1px dashed color-mix(in srgb, #16a34a 30%, var(--ui-border));
  background: transparent;
  color: var(--ui-muted);
  font-size: 11px;
}

.ranch-animal__sprite {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
}

.ranch-animal__sprite img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: auto;
}

.ranch-animal__mutation {
  position: absolute;
  top: -2px;
  right: -6px;
  padding: 0 4px;
  border-radius: 999px;
  background: color-mix(in srgb, #a855f7 88%, transparent);
  color: #fff;
  font-size: 9px;
  line-height: 14px;
}

.ranch-animal__name {
  overflow: hidden;
  max-width: 100%;
  color: var(--ui-ink);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranch-animal__stage {
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-ink) 8%, transparent);
  color: var(--ui-muted);
  font-size: 10px;
  line-height: 16px;
}

.ranch-animal.is-harvest .ranch-animal__stage {
  background: color-mix(in srgb, #f59e0b 22%, transparent);
  color: #b45309;
}

.ranch-animal.is-produce .ranch-animal__stage {
  background: color-mix(in srgb, #0ea5e9 20%, transparent);
  color: #0369a1;
}

.ranch-animal.is-hungry .ranch-animal__stage {
  background: color-mix(in srgb, #ef4444 20%, transparent);
  color: #b91c1c;
}

.ranch-animal__countdown {
  color: var(--ui-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  line-height: 14px;
}

.ranch-animal__countdown.is-idle {
  opacity: 0.6;
}

.ranch-animal__produce {
  color: var(--ui-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.ranch-pen__actions {
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--theme-primary) 30%, var(--ui-border));
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-primary) 6%, var(--ui-surface));
}

.ranch-pen__actions-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--ui-muted);
}

.ranch-pen__actions-head strong {
  color: var(--ui-ink);
  font-size: 13px;
}

@media (max-width: 640px) {
  .ranch-scene__hint {
    display: none;
  }

  .ranch-scene__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
