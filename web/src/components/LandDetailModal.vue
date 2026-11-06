<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'

/**
 * 土地等级 / 升级条件：从作物气泡点开的二级详情。
 * 视觉与 LandCropBubble.vue 的 .land-bubble 完全同源（260px / 12px 圆角 / 12px 内距 /
 * 白底浅边框 / 轻阴影 / 10-12px 字号），只是改为居中浮层，内容只讲土地本身。
 */
const props = defineProps<{ land: any, player: any, connected: boolean }>()
const emit = defineEmits<{ close: [] }>()
const info = computed(() => props.land?.landInfo)

/* ===== 土地等级 / 升级条件 ===== */
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

function onKeydown(event: KeyboardEvent) {
  if (props.land && event.key === 'Escape')
    emit('close')
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="land" class="land-detail-layer" @click.self="emit('close')">
      <div class="land-detail-bubble" role="dialog" aria-modal="true" aria-label="土地等级与升级条件">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[10px] text-gray-400">
              土地 #{{ land.id }}
            </div>
            <div class="truncate text-sm text-gray-900 font-bold dark:text-gray-100">
              土地等级 / 升级条件
            </div>
          </div>
          <button type="button" class="bubble-close" aria-label="关闭土地等级详情" @click="emit('close')">
            <span class="i-carbon-close" />
          </button>
        </div>

        <template v-if="info">
          <div class="land-detail-levels mt-2" :class="{ 'land-detail-levels--compare': info.next && info.current }">
            <div v-if="info.current" class="bubble-cell land-detail-soil">
              <img :src="info.current.image" :alt="info.current.name" width="44" height="36">
              <strong class="text-[10px] font-semibold">{{ info.current.name }}</strong>
            </div>
            <span v-if="info.next && info.current" class="i-carbon-chevron-right text-sm opacity-40" aria-hidden="true" />
            <div v-if="info.next" class="bubble-cell land-detail-soil">
              <img :src="info.next.image" :alt="info.next.name" width="44" height="36">
              <strong class="text-[10px] font-semibold">{{ info.next.name }}</strong>
            </div>
          </div>

          <div class="bubble-cell mt-2">
            <table class="land-detail-metrics">
              <thead>
                <tr class="text-[10px] text-gray-400">
                  <th>土地加成</th><th>{{ info.current ? '当前' : '解锁后' }}</th><th v-if="info.current && info.next">
                    升级后
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in metrics" :key="row.key" class="text-[11px]">
                  <th class="text-[10px] text-gray-500 font-medium dark:text-gray-400">
                    {{ row.label }}
                  </th>
                  <td class="tabular-nums font-semibold">
                    {{ metric(info.current || info.next, row.key, row.unit) }}
                  </td>
                  <td v-if="info.current && info.next" class="tabular-nums font-semibold" :class="{ 'land-detail-improved': info.next[row.key] > info.current[row.key] }">
                    {{ metric(info.next, row.key, row.unit) }}<span v-if="info.next[row.key] > info.current[row.key]" class="text-emerald-600" aria-label="提升"> ↑</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="info.mode === 'max'" class="mt-2 rounded-lg bg-emerald-50 px-2 py-1.5 text-center text-[10px] text-emerald-700 font-semibold dark:bg-emerald-950/30 dark:text-emerald-300">
            当前已满级
          </div>
          <section v-else class="bubble-cell land-detail-requirements mt-2">
            <h3 class="mb-1 text-[10px] text-gray-400 font-semibold">
              {{ info.mode === 'unlock' ? '解锁条件' : '升级条件' }}
            </h3>
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
              <span>当前地块为{{ info.current.name }}</span><strong class="land-detail-improved">已满足</strong>
            </div>
            <div v-for="cost in costs" :key="cost.id" class="land-detail-cost">
              <div class="min-w-0 flex items-center gap-1.5">
                <img v-if="cost.image" :src="cost.image" alt="" width="20" height="20" class="h-5 w-5 object-contain"><span class="truncate">{{ cost.name }}</span>
              </div>
              <div class="shrink-0 text-right tabular-nums">
                <strong class="text-[11px]">{{ format(cost.count) }}</strong><span class="ml-1 text-[10px]" :class="cost.missing === 0n ? 'land-detail-improved' : 'land-detail-missing'">{{ cost.missing === null ? '余额待同步' : cost.missing > 0n ? `还差 ${format(cost.missing)}` : '余额充足' }}</span>
              </div>
            </div>
            <p v-if="info.unknown" class="land-detail-missing mt-1.5 text-[10px]">
              部分条件暂未获取
            </p>
            <p v-else-if="info.serverAllowed && connected" class="land-detail-improved mt-1.5 text-[10px]">
              当前可{{ info.mode === 'unlock' ? '解锁' : '升级' }}
            </p>
          </section>
        </template>
        <p v-else class="mt-2 text-[11px] text-gray-400">
          土地详情暂未获取，请刷新农场。
        </p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 尺寸与设计 token 与 LandCropBubble.vue 的 .land-bubble 逐项对齐；
   二级只多一层用于点击外部关闭的居中浮层，卡片本身是同一套视觉。 */
.land-detail-layer {
  position: fixed;
  z-index: 1001;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgb(15 23 42 / 0.18);
}

.land-detail-bubble {
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

.bubble-cell {
  border-radius: 8px;
  background: rgb(249 250 251 / 1);
  padding: 8px;
}

.bubble-close {
  display: inline-flex;
  width: 20px;
  height: 20px;
  flex: none;
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

.land-detail-levels {
  display: grid;
  justify-content: center;
  align-items: center;
  gap: 6px;
}

.land-detail-levels--compare {
  grid-template-columns: 1fr auto 1fr;
}

.land-detail-soil {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  text-align: center;
}

.land-detail-soil img {
  object-fit: contain;
}

.land-detail-soil strong {
  line-height: 1.2;
}

.land-detail-metrics {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

.land-detail-metrics th,
.land-detail-metrics td {
  padding: 3px 2px;
  text-align: right;
  white-space: nowrap;
}

.land-detail-metrics th:first-child {
  text-align: left;
}

.land-detail-metrics thead th {
  padding-bottom: 5px;
  border-bottom: 1px solid rgb(226 232 240);
}

.land-detail-condition {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 5px;
  color: #64748b;
  font-size: 10px;
}

.land-detail-condition strong {
  flex: none;
  font-size: 10px;
}

.land-detail-cost {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed rgb(226 232 240);
  font-size: 11px;
}

.land-detail-improved {
  color: #059669;
}

.land-detail-missing {
  color: #c87138;
}

:global(.dark) .land-detail-layer {
  background: rgb(2 6 23 / 0.5);
}

:global(.dark) .land-detail-bubble {
  border-color: #475569;
  background: rgb(31 41 55 / 0.98);
  color: #e5e7eb;
}

:global(.dark) .bubble-cell {
  background: rgb(15 23 42 / 0.6);
}

:global(.dark) .bubble-close:hover {
  background: rgb(51 65 85 / 1);
  color: #e5e7eb;
}

:global(.dark) .land-detail-metrics thead th {
  border-bottom-color: #475569;
}

:global(.dark) .land-detail-condition {
  color: #94a3b8;
}

:global(.dark) .land-detail-cost {
  border-top-color: #475569;
}

:global(.dark) .land-detail-improved {
  color: #34d399;
}

:global(.dark) .land-detail-missing {
  color: #fb923c;
}

@media (max-width: 640px) {
  .land-detail-bubble {
    width: min(260px, calc(100vw - 24px));
  }
}

@media (max-width: 360px) {
  .land-detail-metrics th,
  .land-detail-metrics td {
    padding: 3px 1px;
  }
}
</style>
