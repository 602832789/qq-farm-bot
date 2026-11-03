<script setup lang="ts">
import { NCard } from 'naive-ui/es/card'
import { NModal } from 'naive-ui/es/modal'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{ land: any, player: any, connected: boolean }>()
const emit = defineEmits<{ close: [] }>()
const info = computed(() => props.land?.landInfo)

/* ===== 作物信息（老版地块气泡口径）===== */
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
watch(() => props.land, () => {
  now.value = Date.now()
})

const hasCrop = computed(() => Boolean(
  land.value?.plantName
  || Number(land.value?.matureInSec) > 0
  || ['growing', 'harvestable', 'stealable', 'harvested', 'dead'].includes(String(land.value?.status || '')),
))

const statusLabel = computed(() => {
  const status = String(land.value?.status || '')
  const phaseName = String(land.value?.phaseName || '').trim()
  // “生长中”只是地块的操作状态；详情里应展示当前作物阶段。
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
  const effects = Array.isArray(land.value?.mutantEffects) ? land.value.mutantEffects : []
  return effects.map((effect: any) => {
    const icon = String(effect?.icon || '').trim()
    return {
      id: Number(effect?.id) || 0,
      name: String(effect?.name || effect?.effect_name || icon || '变异').trim(),
      icon,
      image: icon === 'lightning'
        ? '/game-config/effect_images/rain-poem/lightning-sense.png?v=2'
        : (icon ? `/game-config/seed_images_named/mutant/${icon}.png` : ''),
      tag: String(effect?.tag || '').trim(),
      description: String(effect?.description || effect?.desc || effect?.tips || '').trim(),
    }
  }).filter((effect: any) => effect.icon || effect.name)
})

const phaseProgress = computed(() => {
  const start = Number(land.value?.phaseStartTime) || 0
  const end = Number(land.value?.phaseEndTime) || 0
  if (end > start) {
    const duration = end - start
    const elapsed = Math.min(duration, Math.max(0, now.value / 1000 - start))
    return { percent: Math.round(elapsed / duration * 100), elapsed, duration }
  }
  if (['harvestable', 'stealable', 'harvested', 'dead'].includes(String(land.value?.status || '')))
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

/* ===== 土地等级 / 升级条件（原土地详情保留） ===== */
const metrics = [
  { key: 'yieldBonus', label: '产量加成', unit: '%' },
  { key: 'growthReduction', label: '成长提速', unit: '%' },
  { key: 'expBonus', label: '经验加成', unit: '%' },
  { key: 'mutantMultiplier', label: '变异概率', unit: '倍' },
  { key: 'resonanceBonus', label: '共鸣加成', unit: '%' },
]
function metric(level: any, key: string, unit: string) {
  if (!level)
    return '—'
  const value = Number(level[key]) || 0
  return key === 'mutantMultiplier' && !value ? '无' : `${value}${unit}`
}
function integer(value: unknown): bigint | null {
  const text = String(value ?? '')
  return /^\d+$/.test(text) ? BigInt(text) : null
}
const balances = computed(() => ({ 1001: props.player?.gold, 1002: props.player?.coupon, 1005: props.player?.goldBean }))
const costs = computed(() => (info.value?.costs || []).map((cost: any) => {
  const balance = props.connected ? integer(balances.value[cost.id as keyof typeof balances.value]) : null
  const required = integer(cost.count) ?? 0n
  return { ...cost, available: balance, missing: balance === null ? null : required > balance ? required - balance : 0n }
}))
const levelMet = computed(() => props.connected && Number(props.player?.level) >= Number(info.value?.needLevel))
function format(value: unknown) {
  const parsed = integer(value)
  return parsed === null ? '—' : parsed.toLocaleString('zh-CN')
}
</script>

<template>
  <NModal :show="!!land" @update:show="!$event && emit('close')">
    <NCard class="land-detail-modal" :bordered="false" closable role="dialog" aria-modal="true" aria-label="土地详情" @close="emit('close')">
      <template #header>
        <span class="font-display">土地详情 <span class="text-sm opacity-50">#{{ land?.id }}</span></span>
      </template>

      <!-- 作物信息（老版地块气泡对齐 + 成熟后每季收获收益） -->
      <template v-if="hasCrop && land">
        <div class="land-crop-head">
          <img v-if="land.plantImage || land.seedImage" :src="land.plantImage || land.seedImage" alt="" class="land-crop-thumb">
          <span v-else class="land-crop-thumb-fallback i-carbon-sprout" aria-hidden="true" />
          <div class="land-crop-title">
            <strong>{{ land.plantName || '未种植' }}</strong>
            <span class="land-crop-status">{{ statusLabel }}</span>
          </div>
        </div>

        <div class="land-crop-grid">
          <div class="land-crop-cell">
            <small>成熟倒计时</small>
            <strong>{{ Number(land.matureInSec) > 0 ? formatTime(Number(land.matureInSec)) : '—' }}</strong>
          </div>
          <div class="land-crop-cell">
            <small>生长季数</small>
            <strong>{{ land.totalSeason > 0 ? `${land.currentSeason}/${land.totalSeason}` : '—' }}</strong>
          </div>
          <div class="land-crop-cell">
            <small>每季经验</small>
            <strong class="land-crop-exp">+{{ Number(land.harvestExpPerSeason) || 0 }}</strong>
          </div>
          <div class="land-crop-cell">
            <small>每季金币</small>
            <strong class="land-crop-gold">+{{ (Number(land.harvestGoldPerSeason) || 0).toLocaleString('zh-CN') }}</strong>
          </div>
        </div>

        <div v-if="phaseProgress" class="land-crop-phase">
          <div class="flex items-center justify-between gap-2 text-[11px]">
            <span class="truncate text-emerald-700 font-medium dark:text-emerald-300">
              {{ land.phaseName || '当前阶段' }}
            </span>
            <span class="shrink-0 text-emerald-600 tabular-nums font-semibold dark:text-emerald-300">
              {{ phaseProgress.percent }}%
            </span>
          </div>
          <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/60">
            <div class="land-crop-phase-fill" :style="{ width: `${phaseProgress.percent}%` }" />
          </div>
          <div v-if="phaseProgress.duration > 0" class="mt-1 flex justify-between text-[10px] text-gray-400 tabular-nums">
            <span>已进行 {{ formatTime(phaseProgress.elapsed) }}</span>
            <span>本阶段 {{ formatTime(phaseProgress.duration) }}</span>
          </div>
        </div>

        <div v-if="mutantEffects.length" class="land-crop-mutants">
          <div class="land-crop-mutants-title">
            变异效果
          </div>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="effect in mutantEffects" :key="`mut-${effect.id}-${effect.icon}`" class="land-mutant-chip">
              <img v-if="effect.image" :src="effect.image" alt="" class="h-4 w-4 object-contain">
              <span class="font-medium">{{ effect.name }}</span>
              <span v-if="effect.tag && effect.tag !== '无'" class="text-[10px] text-pink-400">· {{ effect.tag }}</span>
            </span>
          </div>
          <div v-if="mutantEffects.some(effect => effect.description)" class="land-mutant-desc">
            <div v-for="effect in mutantEffects" :key="`mut-desc-${effect.id}-${effect.icon}`">
              {{ effect.description || effect.name }}
            </div>
          </div>
        </div>

        <div v-if="land.needWater || land.needWeed || land.needBug" class="land-crop-flags">
          <span v-if="land.needWater" class="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">需要浇水</span>
          <span v-if="land.needWeed" class="rounded-full bg-green-100 px-2 py-0.5 text-green-700 dark:bg-green-900/40 dark:text-green-300">需要除草</span>
          <span v-if="land.needBug" class="rounded-full bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-900/40 dark:text-red-300">需要除虫</span>
        </div>
      </template>

      <template v-if="info">
        <div class="land-detail-levels" :class="{ 'land-detail-levels--compare': info.next && info.current }">
          <div v-if="info.current" class="land-detail-soil">
            <img :src="info.current.image" :alt="info.current.name" width="84" height="70">
            <strong>{{ info.current.name }}</strong>
          </div>
          <span v-if="info.next && info.current" class="i-carbon-chevron-right text-2xl opacity-40" aria-hidden="true" />
          <div v-if="info.next" class="land-detail-soil">
            <img :src="info.next.image" :alt="info.next.name" width="84" height="70">
            <strong>{{ info.next.name }}</strong>
          </div>
        </div>
        <table class="land-detail-metrics">
          <thead>
            <tr>
              <th>土地加成</th><th>{{ info.current ? '当前' : '解锁后' }}</th><th v-if="info.current && info.next">
                升级后
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in metrics" :key="row.key">
              <th>{{ row.label }}</th>
              <td>{{ metric(info.current || info.next, row.key, row.unit) }}</td>
              <td v-if="info.current && info.next" :class="{ 'land-detail-improved': info.next[row.key] > info.current[row.key] }">
                {{ metric(info.next, row.key, row.unit) }}<span v-if="info.next[row.key] > info.current[row.key]" aria-label="提升"> ↑</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="info.mode === 'max'" class="land-detail-max">
          当前已满级
        </div>
        <section v-else class="land-detail-requirements">
          <h3>{{ info.mode === 'unlock' ? '解锁条件' : '升级条件' }}</h3>
          <div v-if="info.needLevel !== null" class="land-detail-condition">
            <span>种植等级达到 {{ info.needLevel }} 级</span>
            <strong :class="levelMet ? 'land-detail-improved' : 'land-detail-missing'">{{ connected ? player?.level ?? '—' : '—' }} / {{ info.needLevel }}</strong>
          </div>
          <div v-if="info.prerequisite" class="land-detail-condition">
            <span>解锁第 {{ info.prerequisite.landId }} 块土地</span>
            <strong :class="info.prerequisite.met ? 'land-detail-improved' : 'land-detail-missing'">{{ info.prerequisite.met ? '已满足' : '未满足' }}</strong>
          </div>
          <div v-if="info.precedingLands" class="land-detail-condition">
            <span>{{ info.precedingLands.name }}及以上达到 {{ info.precedingLands.required }} 块</span>
            <strong :class="info.precedingLands.met === true ? 'land-detail-improved' : 'land-detail-missing'">{{ info.precedingLands.owned ?? '—' }} / {{ info.precedingLands.required }}</strong>
          </div>
          <div v-if="info.current && info.next" class="land-detail-condition">
            <span>当前地块为{{ info.current.name }}</span><span class="land-detail-improved">已满足</span>
          </div>
          <div v-for="cost in costs" :key="cost.id" class="land-detail-cost">
            <div class="land-detail-cost-name">
              <img v-if="cost.image" :src="cost.image" alt="" width="28" height="28"><span>{{ cost.name }}</span>
            </div>
            <div class="land-detail-cost-amount">
              <strong>{{ format(cost.count) }}</strong><span :class="cost.missing === 0n ? 'land-detail-improved' : 'land-detail-missing'">{{ cost.missing === null ? '余额待同步' : cost.missing > 0n ? `还差 ${format(cost.missing)}` : '余额充足' }}</span>
            </div>
          </div>
          <p v-if="info.unknown" class="land-detail-missing">
            部分条件暂未获取
          </p>
          <p v-else-if="info.serverAllowed && connected" class="land-detail-improved">
            当前可{{ info.mode === 'unlock' ? '解锁' : '升级' }}
          </p>
        </section>
      </template>
      <p v-else-if="!hasCrop">
        土地详情暂未获取，请刷新农场。
      </p>
    </NCard>
  </NModal>
</template>

<style scoped>
.land-detail-modal {
  width: min(480px, calc(100vw - 24px));
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  border-radius: 20px;
}

/* ===== 作物信息 ===== */
.land-crop-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 2px 0 12px;
}
.land-crop-thumb {
  width: 56px;
  height: 56px;
  object-fit: contain;
  border-radius: 12px;
  background: rgba(69, 155, 93, 0.08);
}
.land-crop-thumb-fallback {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: rgba(69, 155, 93, 0.08);
  font-size: 26px;
  color: #278452;
}
.land-crop-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.land-crop-status {
  align-self: flex-start;
  padding: 1px 10px;
  border-radius: 999px;
  background: rgba(69, 155, 93, 0.14);
  color: #278452;
  font-size: 12px;
  font-weight: var(--fw-600);
}
.land-crop-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}
.land-crop-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 6px;
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.07);
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.land-crop-cell small {
  font-size: 11px;
  opacity: 0.65;
}
.land-crop-exp {
  color: #2f7ed8;
}
.land-crop-gold {
  color: #c8871a;
}
.land-crop-phase {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(69, 155, 93, 0.08);
}
.land-crop-phase-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #459b5d, #6cc07f);
  transition: width 0.4s ease;
}
.land-crop-mutants {
  margin-top: 12px;
}
.land-crop-mutants-title {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: var(--fw-600);
  opacity: 0.7;
}
.land-mutant-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(192, 113, 56, 0.12);
  color: #a05a22;
  font-size: 12px;
}
.land-mutant-desc {
  margin-top: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.06);
  color: var(--ui-muted, #888);
  font-size: 12px;
  line-height: 1.7;
}
.land-crop-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.land-detail-levels {
  display: grid;
  justify-content: center;
  align-items: center;
  gap: 12px;
  padding: 16px 0 18px;
}
.land-detail-levels--compare {
  grid-template-columns: 1fr auto 1fr;
}
.land-detail-soil {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.land-detail-soil img {
  object-fit: contain;
}
.land-detail-metrics {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
.land-detail-metrics th,
.land-detail-metrics td {
  padding: 9px 4px;
  text-align: right;
}
.land-detail-metrics th:first-child {
  text-align: left;
  font-weight: var(--fw-500);
  opacity: 0.7;
}
.land-detail-metrics thead {
  font-size: 12px;
  border-bottom: 1px solid var(--n-border-color);
  opacity: 0.65;
}
.land-detail-requirements {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--n-border-color);
}
.land-detail-requirements h3 {
  margin: 0 0 12px;
  font-weight: var(--fw-700);
}
.land-detail-condition {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 8px 0;
}
.land-detail-cost {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}
.land-detail-cost-name {
  display: flex;
  align-items: center;
  gap: 10px;
}
.land-detail-cost-name img {
  object-fit: contain;
}
.land-detail-cost-amount {
  display: flex;
  flex-direction: column;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.land-detail-cost-amount span {
  font-size: 12px;
}
.land-detail-improved {
  color: var(--n-color-target, #278452);
}
.land-detail-missing {
  color: #c87138;
}
.land-detail-max {
  margin-top: 20px;
  padding: 10px;
  text-align: center;
  border-radius: 12px;
  background: rgba(69, 155, 93, 0.12);
  color: #278452;
  font-weight: var(--fw-600);
}
@media (max-width: 360px) {
  .land-detail-metrics th,
  .land-detail-metrics td {
    padding: 8px 2px;
  }
  .land-detail-modal {
    font-size: 13px;
  }
  .land-crop-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
