<script setup lang="ts">
import type { RanchResource, RanchState } from '@/utils/ranch'
import { computed } from 'vue'
import { formatQuantity } from '@/utils/ranch'

/**
 * 牧场页顶部的资产条。
 *
 * 刻意不复用农场那条 `PersonalResourceStrip`：它读的是农场状态（账号等级、金币、点券、
 * 化肥），还会顺带拉农场背包与图鉴。牧场有自己的资源体系（牧场等级与经验、牧场货币、
 * 牧草、普通/有机罐头桶），数据只认 `RanchState`，不混用农场字段。
 * 视觉沿用同一条资产条的规格：左侧成长卡 + 右侧资源卡 + 可展开明细。
 */
const props = defineProps<{ state: RanchState | null }>()

const level = computed(() => props.state?.level || 0)
const currentExp = computed(() => props.state?.currentExp || '0')
const neededExp = computed(() => props.state?.neededExp || '—')
const progressPercent = computed(() => {
  const value = Number(props.state?.progressPercent)
  if (!Number.isFinite(value))
    return 0
  return Math.min(100, Math.max(0, value))
})

const resources = computed<RanchResource[]>(() => props.state?.resources || [])

const animalCount = computed(() => (props.state?.facilities || [])
  .filter(facility => facility.isRanch)
  .reduce((sum, facility) => sum + (facility.ranch?.animals?.length || 0), 0))

const ranchCount = computed(() => (props.state?.facilities || []).filter(facility => facility.isRanch).length)

/** 罐头桶没有物品图，用图标区分；其余资源优先用后端下发的图。 */
function resourceIcon(resource: RanchResource) {
  if (resource.key.startsWith('bucket:'))
    return 'i-carbon-time'
  if (resource.key === 'grass')
    return 'i-carbon-crop-growth'
  return 'i-carbon-currency-dollar'
}

function lockedText(resource: RanchResource) {
  if (!resource.locked)
    return ''
  const value = resource.seconds ? resource.locked : formatQuantity(resource.locked)
  return `锁定 ${value}`
}
</script>

<template>
  <section class="ranch-strip" aria-label="牧场资产">
    <div v-if="!state" class="ranch-strip__empty">
      <span class="i-carbon-analytics" aria-hidden="true" />
      正在读取牧场数据…
    </div>
    <template v-else>
      <div class="ranch-strip__metrics">
        <div class="ranch-metric ranch-metric--level">
          <div class="ranch-metric__head">
            <span>牧场等级</span>
            <strong>Lv.{{ level }}</strong>
          </div>
          <div class="ranch-metric__exp">
            <small>{{ currentExp }} / {{ neededExp }}</small>
            <div
              class="ranch-progress" role="progressbar" aria-label="牧场成长进度"
              :aria-valuenow="Math.floor(progressPercent)" aria-valuemin="0" aria-valuemax="100"
            >
              <span :style="{ width: `${progressPercent}%` }" />
            </div>
          </div>
        </div>

        <div v-for="resource in resources" :key="resource.key" class="ranch-metric">
          <img v-if="resource.image" :src="resource.image" :alt="resource.label" class="ranch-metric__image">
          <span v-else class="ranch-metric__icon" :class="resourceIcon(resource)" aria-hidden="true" />
          <div class="min-w-0">
            <span>{{ resource.label }}</span>
            <strong>{{ resource.value }}{{ resource.unit }}</strong>
            <small v-if="resource.locked" class="ranch-metric__locked">{{ lockedText(resource) }}</small>
          </div>
        </div>

        <div v-if="!resources.length" class="ranch-metric ranch-metric--plain">
          <span class="i-carbon-warning-alt" aria-hidden="true" />
          <div>
            <span>资源</span>
            <strong>暂无数据</strong>
          </div>
        </div>
      </div>

      <details class="ranch-strip__details">
        <summary>
          <span class="ranch-strip__account">{{ ranchCount }} 座栏舍 · {{ animalCount }} 只动物</span>
          <span class="ranch-strip__expand">牧场资源明细 <span class="i-carbon-chevron-down" aria-hidden="true" /></span>
        </summary>
        <div class="ranch-strip__more">
          <div v-for="resource in resources" :key="`detail-${resource.key}`">
            <span>{{ resource.label }}</span>
            <strong>{{ resource.value }}{{ resource.unit }}</strong>
            <small v-if="resource.locked">{{ lockedText(resource) }}</small>
          </div>
          <div>
            <span>栏舍</span>
            <strong>{{ ranchCount }} 座</strong>
          </div>
          <div>
            <span>动物</span>
            <strong>{{ animalCount }} 只</strong>
          </div>
        </div>
      </details>
    </template>
  </section>
</template>

<style scoped>
.ranch-strip {
  flex-shrink: 0;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-surface);
}

.ranch-strip__empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  color: var(--ui-muted);
  font-size: 13px;
}

.ranch-strip__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 0;
  padding: 13px 8px;
}

.ranch-metric {
  display: flex;
  min-width: 0;
  flex: 1 1 118px;
  align-items: center;
  gap: 9px;
  padding: 2px 12px;
  border-left: 1px solid color-mix(in srgb, var(--ui-border) 70%, transparent);
}

.ranch-metric:first-child {
  border-left: 0;
}

.ranch-metric--level {
  flex: 1.5 1 190px;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}

.ranch-metric--plain {
  color: var(--ui-muted);
}

.ranch-metric__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}

.ranch-metric__head span,
.ranch-metric div > span {
  display: block;
  color: var(--ui-muted);
  font-size: 12px;
  line-height: 1.35;
}

.ranch-metric__head strong {
  color: var(--ui-ink);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.ranch-metric div > strong {
  display: block;
  overflow: hidden;
  color: var(--ui-ink);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranch-metric__image {
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: 4px;
  object-fit: contain;
}

.ranch-metric__icon {
  width: 26px;
  height: 26px;
  flex: none;
  color: var(--theme-primary);
  font-size: 22px;
}

.ranch-metric__locked {
  display: block;
  color: var(--ui-muted);
  font-size: 11px;
  line-height: 1.3;
}

.ranch-metric__exp small {
  color: var(--ui-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.ranch-progress {
  height: 5px;
  margin-top: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-ink) 10%, transparent);
}

.ranch-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--theme-primary);
  transition: width 300ms ease;
}

.ranch-strip__details {
  border-top: 1px solid color-mix(in srgb, var(--ui-border) 70%, transparent);
}

.ranch-strip__details summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  padding: 8px 16px;
  color: var(--ui-muted);
  font-size: 12px;
  cursor: pointer;
  list-style: none;
}

.ranch-strip__details summary::-webkit-details-marker {
  display: none;
}

.ranch-strip__account {
  color: var(--ui-ink);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.ranch-strip__expand {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}

.ranch-strip__more {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px 16px;
  padding: 4px 16px 14px;
}

.ranch-strip__more div {
  min-width: 0;
}

.ranch-strip__more span {
  display: block;
  color: var(--ui-muted);
  font-size: 12px;
}

.ranch-strip__more strong {
  display: block;
  overflow: hidden;
  color: var(--ui-ink);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranch-strip__more small {
  display: block;
  color: var(--ui-muted);
  font-size: 11px;
}

@media (max-width: 640px) {
  .ranch-metric {
    flex-basis: 50%;
    border-left: 0;
  }

  .ranch-metric--level {
    flex-basis: 100%;
  }
}
</style>
