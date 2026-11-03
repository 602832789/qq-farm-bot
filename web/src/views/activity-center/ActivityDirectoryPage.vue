<script setup lang="ts">
import type { ActivityDirectoryItemDto } from '@/stores/activity-center'
import { NButton } from 'naive-ui/es/button'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { activityHasGameplay } from '@/components/activity/gameplays'
import FarmPageHeader from '@/components/ui/FarmPageHeader.vue'
import { useAccountStore } from '@/stores/account'
import { useActivityCenterStore } from '@/stores/activity-center'
import { useActivityClock } from './useActivityClock'

const emit = defineEmits<{
  back: []
  open: [activity: ActivityDirectoryItemDto]
}>()

const accountStore = useAccountStore()
const activityStore = useActivityCenterStore()
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { activities, season, shop, solarTerms, constellation, qixi, qingMei, charity, weather, loading, error, loadedAccountId } = storeToRefs(activityStore)
const { serverNow } = useActivityClock()

type ActivityStatus = 'active' | 'upcoming' | 'ended'
type StatusFilter = 'all' | ActivityStatus

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const statusFilter = ref<StatusFilter>('all')
const statusFilters: Array<{ key: StatusFilter, label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'upcoming', label: '未开始' },
  { key: 'ended', label: '已结束' },
]

const accountDataLoaded = computed(() => !!currentAccountId.value && loadedAccountId.value === String(currentAccountId.value))
const stellarDetailsAvailable = computed(() => !!(season.value || shop.value || constellation.value || solarTerms.value))
const displayActivities = computed<ActivityDirectoryItemDto[]>(() => {
  const entries: ActivityDirectoryItemDto[] = activities.value.length > 0
    ? [...activities.value]
    : stellarDetailsAvailable.value
      ? [{
        id: season.value?.pass?.activityId || season.value?.id || 'stellar',
        activityIds: [season.value?.pass?.activityId || season.value?.id || 'stellar'],
        name: season.value?.title || '千星游记',
        startTime: season.value?.startTime || null,
        endTime: season.value?.endTime || null,
        gameplayKey: 'stellar',
        gameplayTargets: ['travel', 'constellation', 'shop', 'solar'],
        detailTarget: season.value?.pass ? 'travel' : constellation.value ? 'constellation' : shop.value ? 'shop' : 'solar',
      } satisfies ActivityDirectoryItemDto]
      : []

  const appendDetailEntry = (entry: ActivityDirectoryItemDto) => {
    if (!entries.some(item => item.activityIds.some(id => entry.activityIds.includes(id))))
      entries.push(entry)
  }
  if (qixi.value) {
    appendDetailEntry({
      id: qixi.value.groupId || qixi.value.activityId,
      activityIds: [qixi.value.groupId, qixi.value.bridgeActivityId, qixi.value.giftActivityId].filter(Boolean),
      name: qixi.value.title,
      startTime: qixi.value.startTime,
      endTime: qixi.value.endTime,
      gameplayKey: 'qixi',
      gameplayTargets: ['qixi'],
      detailTarget: 'qixi',
    })
  }
  if (qingMei.value) {
    appendDetailEntry({
      id: qingMei.value.activityId,
      activityIds: [qingMei.value.dailyActivityId, qingMei.value.activityId].filter(Boolean),
      name: qingMei.value.title,
      startTime: qingMei.value.startTime,
      endTime: qingMei.value.endTime,
      gameplayKey: 'qingmei',
      gameplayTargets: ['qingmei'],
      detailTarget: 'qingmei',
    })
  }
  if (charity.value) {
    appendDetailEntry({
      id: charity.value.groupId || charity.value.activityId,
      activityIds: [charity.value.groupId, charity.value.activityId].filter(Boolean),
      name: charity.value.title,
      startTime: charity.value.startTime,
      endTime: charity.value.endTime,
      gameplayKey: 'charity',
      gameplayTargets: ['charity'],
      detailTarget: 'charity',
    })
  }
  if (weather.value) {
    appendDetailEntry({
      id: weather.value.groupId || weather.value.activityId,
      activityIds: [weather.value.groupId, weather.value.catalogActivityId, weather.value.taskActivityId, weather.value.researchActivityId].filter(Boolean),
      name: weather.value.title,
      startTime: weather.value.startTime,
      endTime: weather.value.endTime,
      gameplayKey: 'weather',
      gameplayTargets: ['weather'],
      detailTarget: 'weather',
    })
  }

  const statusRank: Record<ActivityStatus, number> = { active: 0, upcoming: 1, ended: 2 }
  return entries.sort((left, right) => {
    const leftStatus = activityStatus(left)
    const rightStatus = activityStatus(right)
    if (leftStatus !== rightStatus)
      return statusRank[leftStatus] - statusRank[rightStatus]
    if (leftStatus === 'ended')
      return (right.endTime || 0) - (left.endTime || 0)
    return (left.startTime || 0) - (right.startTime || 0)
  })
})
const hasActivities = computed(() => displayActivities.value.length > 0)

function accountId() {
  return String(currentAccountId.value || '')
}
function load(force = false) {
  return force ? activityStore.refresh(accountId()) : activityStore.lazyLoad(accountId())
}
function validActivityTime(value: unknown): number | null {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && Number.isFinite(new Date(timestamp).getTime()) ? timestamp : null
}
function activityStatus(activity: ActivityDirectoryItemDto): ActivityStatus {
  const startTime = validActivityTime(activity.startTime)
  const endTime = validActivityTime(activity.endTime)
  if (endTime !== null && serverNow.value >= endTime)
    return 'ended'
  if (startTime !== null && serverNow.value < startTime)
    return 'upcoming'
  return 'active'
}
function activityStatusLabel(activity: ActivityDirectoryItemDto) {
  return { active: '进行中', upcoming: '未开始', ended: '已结束' }[activityStatus(activity)]
}
function isNewbieActivity(activity: ActivityDirectoryItemDto) {
  return activity.activityIds.some(id => id === '2026092200' || id === '2026092201')
}
const LONG_TERM_MS = 365 * 24 * 60 * 60 * 1000
/**
 * 常驻条目：新手福利，或开放期超过一年且工具没有对应玩法的条目。
 * 目录里的日期只是全局开放期，不代表账号有资格，所以不和限时活动混排，也不显示“进行中”。
 */
function isStandingActivity(activity: ActivityDirectoryItemDto) {
  if (isNewbieActivity(activity))
    return true
  const startTime = validActivityTime(activity.startTime)
  const endTime = validActivityTime(activity.endTime)
  return !activityHasGameplay(activity) && startTime !== null && endTime !== null && endTime - startTime > LONG_TERM_MS
}
const timedActivities = computed(() => displayActivities.value.filter(activity => !isStandingActivity(activity)))
const standingActivities = computed(() => displayActivities.value.filter(isStandingActivity))
/** 进行中与即将开始的限时活动用大卡片；已结束的折叠到往期列表。 */
const currentActivities = computed(() => timedActivities.value.filter(activity => activityStatus(activity) !== 'ended'))
interface PastActivityRow { key: string, name: string, activity: ActivityDirectoryItemDto, ids: string[] }
/** 同名同时间的往期条目（同一活动的多个子 ID）合并成一行。顺序沿用目录排序：结束越晚越靠前。 */
const pastActivities = computed(() => {
  const rows = new Map<string, PastActivityRow>()
  for (const activity of timedActivities.value) {
    if (activityStatus(activity) !== 'ended')
      continue
    const name = activityDisplayName(activity)
    const key = `${name}|${activity.startTime ?? ''}|${activity.endTime ?? ''}`
    const row = rows.get(key)
    if (row)
      row.ids.push(activity.id)
    else
      rows.set(key, { key, name, activity, ids: [activity.id] })
  }
  return [...rows.values()]
})
const pastGroups = computed(() => {
  const groups: Array<{ key: string, label: string, rows: PastActivityRow[] }> = []
  for (const row of pastActivities.value) {
    const endTime = validActivityTime(row.activity.endTime)
    const date = endTime === null ? null : new Date(endTime)
    const key = date ? `${date.getFullYear()}-${date.getMonth()}` : 'unknown'
    let group = groups.find(entry => entry.key === key)
    if (!group) {
      group = { key, label: date ? `${date.getFullYear()} 年 ${date.getMonth() + 1} 月结束` : '结束时间未知', rows: [] }
      groups.push(group)
    }
    group.rows.push(row)
  }
  return groups
})
/**
 * 同名活动通常是同一玩法在不同时期复办。按“名称 + 起止时间”去重后统计期数，
 * 只统计当前目录里能看到的期次（包括进行中的那一期）。
 */
const editionCounts = computed(() => {
  const periods = new Map<string, Set<string>>()
  for (const activity of timedActivities.value) {
    const name = activityDisplayName(activity)
    const set = periods.get(name) || new Set<string>()
    set.add(`${activity.startTime ?? ''}|${activity.endTime ?? ''}`)
    periods.set(name, set)
  }
  return new Map([...periods].map(([name, set]) => [name, set.size]))
})
const pastOpen = ref(false)

/** 卡片列表：进行中的限时活动按状态筛选，已结束的走往期折叠区。 */
const cardActivities = computed(() => {
  return currentActivities.value.filter((activity) => {
    if (statusFilter.value === 'all')
      return true
    return activityStatus(activity) === statusFilter.value
  })
})

const pickerSummary = computed(() => {
  if (!hasActivities.value)
    return '按当前账号读取活动'
  const parts = [`${currentActivities.value.length} 个进行中`]
  if (standingActivities.value.length)
    parts.push(`${standingActivities.value.length} 项常驻`)
  if (pastActivities.value.length)
    parts.push(`${pastActivities.value.length} 个往期`)
  return parts.join(' · ')
})
const closedCardCount = computed(() => currentActivities.value.filter(activity => !activityCanOpen(activity)).length)
const headerDescription = computed(() => {
  const registered = displayActivities.value.length
  const accountName = currentAccount.value?.name || currentAccount.value?.nick || ''
  const base = `${registered} 个已登记活动 · ${pickerSummary.value}`
  return accountName ? `${base} · 当前账号 ${accountName}` : base
})
function activityDisplayName(activity: ActivityDirectoryItemDto) {
  return activity.gameplayKey === 'pet' ? '萌宠日记' : activity.name
}
function activityIconSrc(activity: ActivityDirectoryItemDto) {
  if (activity.gameplayKey === 'pet')
    return '/activity-assets/pet-diary/S3Open_dog_1.png'
  if (activity.gameplayKey === 'milk')
    return '/activity-assets/milk-tea/logo.png'
  if (activity.gameplayKey === 'wish' || activity.gameplayKey === 'happy')
    return `/activity-assets/autumn/${activity.gameplayKey}.png`
  return ''
}
function activityIcon(activity: ActivityDirectoryItemDto) {
  if (activityIconSrc(activity))
    return ''
  const map: Record<string, string> = {
    stellar: 'i-carbon-star',
    qixi: 'i-carbon-favorite',
    qingmei: 'i-carbon-drink',
    charity: 'i-carbon-plant',
    weather: 'i-carbon-cloud-rain',
    milk: 'i-carbon-cafe',
    wish: 'i-carbon-idea',
    happy: 'i-carbon-gift',
    pet: 'i-carbon-dog-walker',
  }
  return map[activity.gameplayKey || ''] || 'i-carbon-calendar'
}
/** 无活动主图时按玩法给出渐变底，保持老版卡片的深色海报观感。 */
function activityBackgroundStyle(activity: ActivityDirectoryItemDto) {
  const palettes: Record<string, [string, string]> = {
    stellar: ['#0b2e61', '#071b43'],
    qixi: ['#7c2d55', '#3b1026'],
    qingmei: ['#1f5c3d', '#0c2a1b'],
    charity: ['#8a3b1f', '#3d1a0c'],
    weather: ['#1c4d63', '#08222d'],
    milk: ['#8a5a1a', '#3a2408'],
    wish: ['#5b3a8a', '#241338'],
    happy: ['#8a4a12', '#3d1f06'],
    pet: ['#2d5a3a', '#0f2a1a'],
  }
  const [from, to] = palettes[activity.gameplayKey || ''] || ['#2f4a3d', '#16241d']
  return { backgroundImage: `linear-gradient(150deg, ${from}, ${to})` }
}
function activityDescription(activity: ActivityDirectoryItemDto) {
  if (isNewbieActivity(activity))
    return '新手开园福利：签到、开园特权与引导奖励'
  return `${activity.gameplayKey ? '已接入玩法' : '按目录读取'} · 编号 ${activity.id}`
}

const shortDateFormatter = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' })
function formatShortPeriod(activity: ActivityDirectoryItemDto) {
  const startTime = validActivityTime(activity.startTime)
  const endTime = validActivityTime(activity.endTime)
  const start = startTime === null ? '?' : shortDateFormatter.format(startTime)
  const end = endTime === null ? '?' : shortDateFormatter.format(endTime)
  return `${start} – ${end}`
}
function standingDescription(activity: ActivityDirectoryItemDto) {
  return isNewbieActivity(activity) ? '新手开园福利：签到、开园特权与引导奖励' : '长期开放的常驻内容'
}
function standingPeriod(activity: ActivityDirectoryItemDto) {
  const endTime = validActivityTime(activity.endTime)
  if (activityStatus(activity) === 'active' && (endTime === null || endTime - serverNow.value > LONG_TERM_MS))
    return '长期开放'
  return formatActivityPeriod(activity)
}
function activityCanOpen(activity: ActivityDirectoryItemDto) {
  return activityHasGameplay(activity) && activityStatus(activity) === 'active'
}
function formatActivityPeriod(activity: ActivityDirectoryItemDto) {
  const startTime = validActivityTime(activity.startTime)
  const endTime = validActivityTime(activity.endTime)
  const start = startTime === null ? '' : dateFormatter.format(startTime)
  const end = endTime === null ? '' : dateFormatter.format(endTime)
  if (start && end)
    return `${start} - ${end}`
  if (start)
    return `${start} 开始`
  if (end)
    return `${end} 结束`
  return '活动时间待定'
}
function openActivity(activity: ActivityDirectoryItemDto) {
  if (activityCanOpen(activity))
    emit('open', activity)
}
</script>

<template>
  <section class="activity-page space-y-4">
    <FarmPageHeader scene title="活动中心" :description="headerDescription" icon="i-carbon-gift">
      <NButton :loading="loading" :disabled="!currentAccountId" @click="load(true)">
        <template #icon>
          <span class="i-carbon-renew" />
        </template>
        刷新
      </NButton>
    </FarmPageHeader>

    <div v-if="!currentAccountId" class="picker-state">
      <div class="i-carbon-user-avatar" />
      <strong>请先选择账号</strong>
      <span>选择账号后查看当前活动</span>
    </div>
    <div v-else-if="loading && !accountDataLoaded" class="picker-state">
      <div class="activity-spinner picker-spinner" />
      <strong>正在加载活动</strong>
    </div>
    <div v-else-if="error && !hasActivities" class="picker-state">
      <div class="i-carbon-warning-alt" />
      <strong>活动加载失败</strong>
      <span>{{ error }}</span>
      <button type="button" :disabled="loading" @click="load(true)">
        重新加载
      </button>
    </div>
    <div v-else-if="accountDataLoaded && !loading && !hasActivities" class="picker-state empty-activities">
      <div class="i-carbon-calendar" />
      <strong>当前无活动</strong>
      <span>服务器暂未返回活动配置</span>
      <button type="button" @click="load(true)">
        刷新活动
      </button>
    </div>

    <template v-else>
      <section class="space-y-4" aria-labelledby="all-activities-title">
        <header class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <h2 id="all-activities-title" class="text-base font-semibold">
              全部活动 <span class="text-xs text-gray-500 font-normal">{{ displayActivities.length }} 个已登记</span>
            </h2>
            <div class="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800" role="group" aria-label="活动状态筛选">
              <button
                v-for="filter in statusFilters"
                :key="filter.key"
                class="rounded-md px-2.5 py-1 text-xs transition"
                :class="statusFilter === filter.key ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'"
                :aria-pressed="statusFilter === filter.key"
                @click="statusFilter = filter.key"
              >
                {{ filter.label }}
              </button>
            </div>
          </div>
          <span v-if="closedCardCount" class="text-xs text-gray-500">{{ closedCardCount }} 项暂未接入玩法</span>
        </header>

        <div v-if="cardActivities.length" class="activity-card-grid">
          <button
            v-for="activity in cardActivities"
            :key="activity.id"
            type="button"
            class="activity-card group"
            :class="activityCanOpen(activity) ? 'is-openable' : 'is-locked'"
            :disabled="!activityCanOpen(activity)"
            @click="openActivity(activity)"
          >
            <span class="activity-card__art" :style="activityBackgroundStyle(activity)">
              <span class="activity-card__orb activity-card__orb--lg" />
              <span class="activity-card__orb activity-card__orb--sm" />
              <span class="activity-card__glyph" :class="activityIcon(activity)" aria-hidden="true" />
              <img v-if="activityIconSrc(activity)" :src="activityIconSrc(activity)" alt="" class="activity-card__image">
            </span>
            <span class="activity-card__shade" />
            <span class="activity-card__body">
              <span class="activity-card__topline">
                <span class="activity-card__status" :class="`is-${activityStatus(activity)}`">
                  <span
                    :class="activityStatus(activity) === 'active' ? activityIcon(activity) : activityStatus(activity) === 'upcoming' ? 'i-carbon-time' : 'i-carbon-checkmark'"
                    aria-hidden="true"
                  />
                  {{ activityStatusLabel(activity) }}
                </span>
                <span v-if="!activity.gameplayKey" class="activity-card__pending">待适配</span>
                <span v-else-if="activityCanOpen(activity)" class="activity-card__arrow i-carbon-arrow-up-right" aria-hidden="true" />
              </span>
              <span class="activity-card__bottom">
                <strong>{{ activityDisplayName(activity) }}</strong>
                <span class="activity-card__period">{{ formatActivityPeriod(activity) }}</span>
                <span class="activity-card__desc">
                  <span :class="activityIcon(activity)" class="shrink-0" aria-hidden="true" />
                  {{ activityDescription(activity) }}
                </span>
              </span>
            </span>
          </button>
        </div>
        <p v-else class="activity-empty">
          当前筛选条件下暂无活动
        </p>

        <!-- 常驻条目不是限时活动：用一条窄提示带挂在卡片下方，按内容宽度排列。 -->
        <div v-if="standingActivities.length" class="standing-strip" aria-label="常驻与福利">
          <span class="standing-strip__label">常驻</span>
          <component
            :is="activityCanOpen(activity) ? 'button' : 'span'"
            v-for="activity in standingActivities"
            :key="activity.id"
            :type="activityCanOpen(activity) ? 'button' : undefined"
            class="standing-chip"
            :class="{ 'standing-chip--supported': activityCanOpen(activity) }"
            @click="activityCanOpen(activity) && openActivity(activity)"
          >
            <span class="standing-chip__icon" :class="isNewbieActivity(activity) ? 'i-carbon-gift' : 'i-carbon-calendar'" aria-hidden="true" />
            <strong>{{ activity.name }}</strong>
            <span class="standing-chip__desc">{{ standingDescription(activity) }}</span>
            <span class="standing-chip__meta">{{ standingPeriod(activity) }}<template v-if="isNewbieActivity(activity) && !activityCanOpen(activity)"> · 资格以游戏内为准</template></span>
            <span v-if="activityCanOpen(activity)" class="i-carbon-arrow-right" aria-hidden="true" />
          </component>
        </div>
      </section>

      <section v-if="pastActivities.length" class="picker-section" aria-labelledby="past-activities-title">
        <button
          id="past-activities-title"
          type="button"
          class="picker-section__title picker-section__toggle"
          :aria-expanded="pastOpen"
          aria-controls="past-activities-list"
          @click="pastOpen = !pastOpen"
        >
          往期活动<small>{{ pastActivities.length }}</small>
          <span class="picker-section__chevron i-carbon-chevron-down" :class="{ 'is-open': pastOpen }" aria-hidden="true" />
        </button>
        <div v-if="pastOpen" id="past-activities-list" class="past-list">
          <div v-for="group in pastGroups" :key="group.key" class="past-group">
            <h4>{{ group.label }}</h4>
            <ul>
              <li v-for="row in group.rows" :key="row.key" class="past-row">
                <span class="past-row__icon"><img v-if="activityIconSrc(row.activity)" :src="activityIconSrc(row.activity)" alt=""><span v-else class="i-carbon-calendar" /></span>
                <span class="past-row__name">
                  <strong>{{ row.name }}</strong>
                  <span v-if="(editionCounts.get(row.name) || 0) > 1" class="past-row__edition" title="目录中同名活动的不同期次数">共 {{ editionCounts.get(row.name) }} 期</span>
                </span>
                <span class="past-row__period">{{ formatShortPeriod(row.activity) }}</span>
                <span class="past-row__ids" :title="row.ids.join('、')">{{ row.ids[0] }}<template v-if="row.ids.length > 1"> 等 {{ row.ids.length }} 个</template></span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.activity-page {
  width: 100%;
  min-width: 0;
  color: var(--ui-ink);
}

/* 老版活动海报卡：深色渐变底 + 状态胶囊 + 大标题，整卡可点。 */
.activity-card-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr);
}

@media (min-width: 768px) {
  .activity-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1280px) {
  .activity-card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.activity-card {
  position: relative;
  min-height: 208px;
  display: block;
  overflow: hidden;
  border: 0;
  border-radius: 10px;
  color: #fff;
  text-align: left;
  box-shadow: 0 1px 3px rgb(16 34 24 / 12%);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    filter 180ms ease;
  appearance: none;
}

.activity-card.is-openable:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 26px rgb(16 34 24 / 20%);
}

.activity-card.is-locked {
  cursor: not-allowed;
  filter: grayscale(0.75) saturate(0.4);
}

.activity-card__art {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}

.activity-card__orb {
  position: absolute;
  border: 1px solid rgb(255 255 255 / 15%);
  border-radius: 999px;
}

.activity-card__orb--lg {
  top: -40px;
  right: -32px;
  width: 160px;
  height: 160px;
}

.activity-card__orb--sm {
  top: 48px;
  right: -8px;
  width: 96px;
  height: 96px;
  border-color: rgb(255 255 255 / 10%);
}

.activity-card__glyph {
  position: absolute;
  right: 20px;
  bottom: 8px;
  color: rgb(255 255 255 / 8%);
  font-size: 68px;
}

.activity-card__image {
  width: 96px;
  height: 96px;
  margin-bottom: 26px;
  object-fit: contain;
  filter: drop-shadow(0 6px 14px rgb(0 0 0 / 35%));
}

.activity-card__shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgb(7 22 33 / 90%), rgb(16 43 60 / 30%) 55%, transparent);
}

.activity-card__body {
  position: relative;
  min-height: 208px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 18px 20px;
}

.activity-card__topline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.activity-card__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  color: #164e63;
  background: rgb(207 250 254 / 92%);
  font-size: 12px;
  font-weight: 500;
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}

.activity-card__status.is-upcoming,
.activity-card__status.is-ended {
  color: #374151;
  background: rgb(243 244 246 / 88%);
}

.activity-card__pending {
  padding: 4px 10px;
  border-radius: 999px;
  color: #78350f;
  background: rgb(254 243 199 / 92%);
  font-size: 12px;
  font-weight: 500;
}

.activity-card__arrow {
  color: rgb(255 255 255 / 80%);
  font-size: 20px;
  transition: transform 160ms ease;
}

.activity-card.is-openable:hover .activity-card__arrow {
  transform: translate(2px, -2px);
}

.activity-card__bottom {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.activity-card__bottom strong {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.3;
}

.activity-card__period {
  color: rgb(207 250 254 / 80%);
  font-size: 13px;
}

.activity-card__desc {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  color: rgb(255 255 255 / 65%);
  font-size: 12px;
}

.activity-card__desc > span:first-child {
  color: #a5f3fc;
  font-size: 15px;
}

.activity-empty {
  padding: 32px;
  border: 1px dashed var(--surface-border);
  border-radius: 8px;
  color: var(--muted-text);
  font-size: 13px;
  text-align: center;
}

.standing-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.standing-strip__label {
  color: var(--ui-subtle);
  font-size: 12px;
}

.standing-chip {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 8px;
  border: 1px solid color-mix(in srgb, var(--ui-warning) 22%, var(--ui-border));
  border-radius: 999px;
  color: var(--ui-ink);
  background: var(--ui-warning-soft);
  font-size: 12px;
  line-height: 18px;
  text-align: left;
}

.standing-chip--supported {
  cursor: pointer;
}

.standing-chip--supported:hover {
  border-color: var(--ui-warning);
}

.standing-chip:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}

.standing-chip__icon {
  flex: none;
  color: var(--ui-warning);
  font-size: 15px;
}

.standing-chip strong {
  flex: none;
  font-size: 13px;
  font-weight: var(--fw-650);
}

.standing-chip__desc {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.standing-chip__meta {
  flex: none;
  color: var(--ui-subtle);
  font-size: 11px;
  white-space: nowrap;
}

.picker-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.picker-section__title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  color: var(--ui-ink);
  font-size: 14px;
  font-weight: var(--fw-650);
}

.picker-section__title small {
  color: var(--ui-subtle);
  font-size: 12px;
  font-weight: var(--fw-400);
  font-variant-numeric: tabular-nums;
}

.picker-section__toggle {
  align-self: flex-start;
  align-items: center;
  padding: 4px 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.picker-section__toggle:hover {
  color: var(--ui-primary);
}

.picker-section__toggle:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
  border-radius: 4px;
}

.picker-section__chevron {
  color: var(--ui-subtle);
  font-size: 14px;
  transition: transform 160ms ease;
}

.picker-section__chevron.is-open {
  transform: rotate(180deg);
}

/* 往期活动：按结束月份分组的紧凑列表，一条一行，信息按列对齐。 */
.past-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.past-group h4 {
  margin: 0 0 6px;
  color: var(--ui-subtle);
  font-size: 12px;
  font-weight: var(--fw-500);
}

.past-group ul {
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--ui-surface) 70%, transparent);
  list-style: none;
}

.past-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 120px 150px;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  color: var(--ui-muted);
  font-size: 12px;
}

.past-row + .past-row {
  border-top: 1px solid var(--ui-border);
}

.past-row__icon {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 6px;
  color: var(--ui-subtle);
  background: var(--ui-bg-soft);
  font-size: 13px;
}

.past-row__icon img {
  width: 22px;
  height: 22px;
  object-fit: contain;
  filter: saturate(0.6);
}

.past-row__name {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.past-row__edition {
  flex: none;
  padding: 0 6px;
  border-radius: 5px;
  color: var(--ui-blue);
  background: var(--ui-blue-soft);
  font-size: 10px;
  line-height: 16px;
}

.past-row strong {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-ink);
  font-size: 13px;
  font-weight: var(--fw-500);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.past-row__period,
.past-row__ids {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.past-row__ids {
  overflow: hidden;
  color: var(--ui-subtle);
  font-size: 11px;
  text-align: right;
  text-overflow: ellipsis;
}

.picker-state {
  width: 100%;
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0 auto;
  padding: 30px;
  color: var(--ui-muted);
  text-align: center;
}

.picker-state > div {
  font-size: 38px;
}

.picker-state strong {
  color: var(--ui-ink);
  font-size: 18px;
}

.picker-state span {
  max-width: 420px;
  color: var(--ui-muted);
  font-size: 12px;
}

.picker-state button {
  min-height: 36px;
  margin-top: 8px;
  padding: 0 15px;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  color: var(--ui-primary);
  background: var(--ui-surface);
  font-weight: var(--fw-700);
  cursor: pointer;
}

.picker-state button:disabled {
  opacity: 0.55;
  cursor: wait;
}

.picker-state .picker-spinner {
  width: 42px;
  height: 42px;
  font-size: 0;
}

.activity-spinner {
  border: 3px solid rgba(67, 141, 99, 0.18);
  border-top-color: var(--ui-primary);
  border-radius: 50%;
  animation: spin 0.85s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 620px) {
  .past-row {
    grid-template-columns: 24px minmax(0, 1fr) auto;
    gap: 2px 10px;
  }

  .past-row__ids {
    display: none;
  }

  .standing-chip {
    flex-wrap: wrap;
    border-radius: 12px;
  }

  .standing-chip__desc {
    flex-basis: 100%;
    white-space: normal;
  }

  .activity-card {
    min-height: 188px;
  }

  .activity-card__body {
    min-height: 188px;
  }

  .activity-card__bottom strong {
    font-size: 20px;
  }
}
</style>
