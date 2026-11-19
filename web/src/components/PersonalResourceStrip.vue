<script setup lang="ts">
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useFarmAutoRefreshInterval } from '@/composables/useFarmAutoRefresh'
import { useAccountStore } from '@/stores/account'
import { useBagStore } from '@/stores/bag'
import { useFarmStore } from '@/stores/farm'
import { useIllustratedStore } from '@/stores/illustrated'
import { useStatusStore } from '@/stores/status'
import { formatCouponAmount, formatGoldAmount, formatGoldBeanAmount } from '@/utils/number-format'

/**
 * 我的农场页顶部的资产条（自老版 PersonalAccountOverview + AccountOverviewCards strip 模式移植）：
 * 等级与成长 / 金币 / 点券 / 普通化肥 / 有机化肥，下方「资产与成长详情」展开全部数据。
 */
const accountStore = useAccountStore()
const statusStore = useStatusStore()
const bagStore = useBagStore()
const illustratedStore = useIllustratedStore()
const farmStore = useFarmStore()
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { status, realtimeConnected, diamondBalance } = storeToRefs(statusStore)
const { dashboardItems } = storeToRefs(bagStore)

const visibility = useDocumentVisibility()
const localUptime = ref(0)

const hasStatus = computed(() => !!status.value?.status)
const connected = computed(() => !!status.value?.connection?.connected)
const gameStatus = computed(() => status.value?.status || {})

const displayName = computed(() => {
  const account = currentAccount.value
  const gameName = hasStatus.value ? gameStatus.value.name : ''
  if (gameName) {
    if (account?.name)
      return `${gameName} (${account.name})`
    return gameName
  }
  if (account) {
    if (account.name && account.nick)
      return `${account.nick} (${account.name})`
    return account.name || account.nick || '未命名'
  }
  return '未选择账号'
})

const expRate = computed(() => {
  const gain = status.value?.sessionExpGained || 0
  const uptime = status.value?.uptime || 0
  if (!uptime)
    return '0/小时'
  const rate = gain / (uptime / 3600)
  return `${Math.floor(rate)}/小时`
})

const timeToLevel = computed(() => {
  const gain = status.value?.sessionExpGained || 0
  const uptime = status.value?.uptime || 0
  const current = status.value?.levelProgress?.current || 0
  const needed = status.value?.levelProgress?.needed || 0
  if (!needed || !uptime || gain <= 0)
    return ''
  const ratePerHour = gain / (uptime / 3600)
  if (ratePerHour <= 0)
    return ''
  const expNeeded = Math.max(0, needed - current)
  const minsToLevel = expNeeded / (ratePerHour / 60)
  if (minsToLevel < 60)
    return `约 ${Math.ceil(minsToLevel)} 分钟后升级`
  return `约 ${(minsToLevel / 60).toFixed(1)} 小时后升级`
})

const fertilizerNormal = computed(() => dashboardItems.value.find((item: any) => Number(item.id) === 1011))
const fertilizerOrganic = computed(() => dashboardItems.value.find((item: any) => Number(item.id) === 1012))

function formatBucketTime(item: any) {
  if (!item)
    return '0.0h'
  if (item.hoursText)
    return item.hoursText.replace('小时', 'h')
  return `${(Number(item.count || 0) / 3600).toFixed(1)}h`
}

function formatDuration(seconds: number) {
  if (seconds <= 0)
    return '00:00:00'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainSeconds = Math.floor(seconds % 60)
  const pad = (value: number) => value.toString().padStart(2, '0')
  if (days > 0)
    return `${days}天 ${pad(hours)}:${pad(minutes)}:${pad(remainSeconds)}`
  return `${pad(hours)}:${pad(minutes)}:${pad(remainSeconds)}`
}

function getExpPercent(progress: any) {
  if (!progress || !progress.needed)
    return 0
  return Math.min(100, Math.max(0, (progress.current / progress.needed) * 100))
}

const illustratedLevels = computed(() => ({
  crop: Number(illustratedStore.data?.crop?.level) || 0,
  mutant: Number(illustratedStore.data?.mutant?.level) || 0,
}))

// ---- 数据刷新：状态走实时推送；背包只由显式事件与共享自动刷新开关驱动；图鉴 / 钻石 60s 节流。 ----
// 顶部资产条是页面级常驻组件：这里的 10s 轮询若拉背包，会让背包种子页每 10 秒整体重渲染。
let disposed = false
let lastIllustratedFetchAt = 0
let lastDiamondFetchAt = 0

async function refreshResources(accountId: string, force: boolean, includeBag: boolean) {
  if (disposed || visibility.value !== 'visible' || accountId !== currentAccountId.value)
    return
  const now = Date.now()
  const tasks: Promise<unknown>[] = []
  // 背包：切号 / 连接恢复 / 页面切回 / 操作完成等显式事件，或自动刷新开关按设定秒数触发时才拉取
  if (includeBag)
    tasks.push(bagStore.fetchBag(accountId))
  if (force || now - lastIllustratedFetchAt >= 60000) {
    lastIllustratedFetchAt = now
    tasks.push(illustratedStore.fetch(accountId))
  }
  if (force || now - lastDiamondFetchAt >= 60000) {
    lastDiamondFetchAt = now
    tasks.push(statusStore.fetchDiamond(accountId))
  }
  await Promise.allSettled(tasks)
}

function refresh(force = false, includeBag = false) {
  const accountId = currentAccountId.value
  if (!accountId || disposed || visibility.value !== 'visible')
    return Promise.resolve()
  return (async () => {
    if (!realtimeConnected.value)
      await statusStore.fetchStatus(accountId)
    await refreshResources(accountId, force, includeBag)
  })().catch(() => {})
}

watch(currentAccountId, (accountId) => {
  localUptime.value = 0
  lastIllustratedFetchAt = 0
  lastDiamondFetchAt = 0
  illustratedStore.reset()
  if (accountId) {
    void refresh(true, true)
  }
  else {
    bagStore.clearBag()
  }
}, { immediate: true })

watch(() => status.value?.uptime, (uptime) => {
  localUptime.value = Math.max(0, Number(uptime) || 0)
}, { immediate: true })

watch(connected, (isConnected) => {
  if (isConnected)
    void refresh(true, true)
})

watch(() => farmStore.fertilizePending, (pending, previous) => {
  if (!pending && previous)
    void refresh(false, true)
})

watch(visibility, (visible) => {
  if (visible === 'visible')
    void refresh(true, true)
})

// 10s 兜底轮询：只补状态与资产条自身的低频数据，不拉背包，避免背包页每 10 秒整体重渲染
useIntervalFn(() => {
  void refresh()
}, 10000)

// 背包数据统一在页面级跟随共享开关：默认关闭，开启后按用户设定的秒数刷新
useFarmAutoRefreshInterval(() => {
  const accountId = String(currentAccountId.value || '')
  if (!accountId || disposed || visibility.value !== 'visible' || !connected.value)
    return
  void bagStore.fetchBag(accountId)
})

useIntervalFn(() => {
  if (visibility.value === 'visible' && connected.value)
    localUptime.value++
}, 1000)

onUnmounted(() => {
  disposed = true
})
</script>

<template>
  <section class="resource-strip" aria-label="账号与庄园资产">
    <div v-if="!currentAccountId" class="resource-strip__empty">
      <span class="i-carbon-user-follow" aria-hidden="true" />
      未选择账号，请在右上角切换账号后查看资产与成长。
    </div>
    <template v-else>
      <div class="resource-strip__metrics">
        <div class="resource-item resource-item--level">
          <div class="resource-item__head">
            <span>等级与成长</span>
            <strong>Lv.{{ gameStatus.level || 0 }}</strong>
          </div>
          <div class="resource-item__exp">
            <small>{{ status?.levelProgress?.current || 0 }} / {{ status?.levelProgress?.needed || '—' }}</small>
            <div
              class="resource-progress" role="progressbar" aria-label="账号成长进度"
              :aria-valuenow="Math.floor(getExpPercent(status?.levelProgress))" aria-valuemin="0" aria-valuemax="100"
            >
              <span :style="{ width: `${getExpPercent(status?.levelProgress)}%` }" />
            </div>
          </div>
        </div>
        <div class="resource-item">
          <img src="/game-config/resource-icons/gold.png" alt="">
          <div><span>金币</span><strong>{{ hasStatus ? formatGoldAmount(gameStatus.gold || 0) : '—' }}</strong></div>
        </div>
        <div class="resource-item">
          <img src="/game-config/resource-icons/coupon.png" alt="">
          <div><span>点券</span><strong>{{ hasStatus ? formatCouponAmount(gameStatus.coupon || 0) : '—' }}</strong></div>
        </div>
        <div class="resource-item">
          <img src="/game-config/resource-icons/fertilizer-normal.png" alt="">
          <div><span>普通化肥</span><strong>{{ hasStatus ? formatBucketTime(fertilizerNormal) : '—' }}</strong></div>
        </div>
        <div class="resource-item">
          <img src="/game-config/resource-icons/fertilizer-organic.png" alt="">
          <div><span>有机化肥</span><strong>{{ hasStatus ? formatBucketTime(fertilizerOrganic) : '—' }}</strong></div>
        </div>
      </div>
      <details class="resource-strip__details">
        <summary>
          <span class="resource-strip__account" :title="displayName">{{ displayName }}</span>
          <span class="resource-strip__connection">
            <span class="resource-strip__dot" :class="{ 'is-off': !connected }" />{{ connected ? '在线' : '离线' }} · {{ formatDuration(localUptime) }}
          </span>
          <span v-if="statusStore.error" class="resource-strip__error">{{ statusStore.error }}</span>
          <span class="resource-strip__expand">资产与成长详情 <span class="i-carbon-chevron-down" aria-hidden="true" /></span>
        </summary>
        <div class="resource-strip__more">
          <div>
            <span>经验效率</span>
            <strong>{{ hasStatus ? expRate : '—' }}</strong>
            <small>{{ hasStatus ? (timeToLevel || '持续成长中') : '' }}</small>
          </div>
          <div><span>钻石</span><strong>{{ formatCouponAmount(diamondBalance || 0) }}</strong></div>
          <div><span>金豆</span><strong>{{ hasStatus ? formatGoldBeanAmount(gameStatus.goldBean || 0) : '—' }}</strong></div>
          <div v-if="(status?.runGoldGained || 0) !== 0">
            <span>本次运行金币</span>
            <strong>{{ status!.runGoldGained! > 0 ? '+' : '' }}{{ formatGoldAmount(status!.runGoldGained) }}</strong>
          </div>
          <div v-if="(status?.runCouponGained || 0) !== 0">
            <span>本次运行点券</span>
            <strong>{{ status!.runCouponGained! > 0 ? '+' : '' }}{{ formatCouponAmount(status!.runCouponGained) }}</strong>
          </div>
          <div><span>作物图鉴</span><strong>Lv.{{ illustratedLevels.crop }}</strong></div>
          <div><span>超变图鉴</span><strong>Lv.{{ illustratedLevels.mutant }}</strong></div>
          <RouterLink to="/illustrated" class="resource-strip__collection">
            查看我的收藏 <span class="i-carbon-arrow-up-right" aria-hidden="true" />
          </RouterLink>
        </div>
      </details>
    </template>
  </section>
</template>

<style scoped>
.resource-strip {
  flex-shrink: 0;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-surface);
}
.resource-strip__empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  color: var(--ui-muted);
  font-size: 13px;
}
.resource-strip__metrics {
  display: grid;
  grid-template-columns: 1.3fr repeat(4, minmax(0, 1fr));
  padding: 15px 8px;
}
.resource-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-right: 1px solid var(--ui-border);
}
.resource-item:last-child {
  border: 0;
}
.resource-item img {
  flex-shrink: 0;
  width: 29px;
  height: 29px;
  object-fit: contain;
}
.resource-item > div {
  min-width: 0;
}
.resource-item span,
.resource-item small {
  display: block;
  color: var(--ui-subtle);
  font-size: 12px;
}
.resource-item strong {
  display: block;
  margin-top: 3px;
  overflow-wrap: anywhere;
  font-size: 18px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.resource-item--level {
  align-items: stretch;
  flex-direction: column;
  gap: 3px;
}
.resource-item--level .resource-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.resource-item--level strong {
  margin: 0;
  font-size: 16px;
}
.resource-item__exp .resource-progress {
  margin: 4px 0 0;
  height: 3px;
}
.resource-progress {
  height: 4px;
  overflow: hidden;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-ink) 10%, transparent);
}
.resource-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ui-primary);
  transition: width 250ms;
}
.resource-strip__details {
  padding: 0 20px;
  border-top: 1px solid var(--ui-border);
}
.resource-strip__details summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  padding: 9px 0;
  list-style: none;
  cursor: pointer;
  font-size: 12px;
}
.resource-strip__details summary::-webkit-details-marker {
  display: none;
}
.resource-strip__account {
  max-width: 35%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.resource-strip__connection {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--ui-subtle);
  font-variant-numeric: tabular-nums;
}
.resource-strip__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #16a34a;
}
.resource-strip__dot.is-off {
  background: var(--ui-subtle);
}
.resource-strip__error {
  overflow: hidden;
  color: #b45309;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.resource-strip__expand {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  color: var(--ui-primary);
}
.resource-strip__details[open] .resource-strip__expand > span {
  transform: rotate(180deg);
}
.resource-strip__more {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 16px;
  padding: 14px 0 18px;
  border-top: 1px solid var(--ui-border);
}
.resource-strip__more > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.resource-strip__more span,
.resource-strip__more small {
  color: var(--ui-subtle);
  font-size: 12px;
}
.resource-strip__more strong {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.resource-strip__collection {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ui-primary);
  font-size: 12px;
}
@media (max-width: 1100px) {
  .resource-item {
    gap: 6px;
    padding-inline: 10px;
  }
  .resource-item strong {
    font-size: 16px;
  }
  .resource-item img {
    width: 24px;
    height: 24px;
  }
}
@media (max-width: 639px) {
  .resource-strip__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 0 14px;
  }
  .resource-item {
    padding: 11px 4px;
    border: 0;
    border-top: 1px solid var(--ui-border);
  }
  .resource-item--level {
    flex-direction: row;
    grid-column: 1 / -1;
    align-items: center;
    justify-content: space-between;
    border-top: 0;
  }
  .resource-item--level .resource-item__head {
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
  }
  .resource-item__exp {
    width: 45%;
  }
  .resource-item:last-child {
    border-top: 1px solid var(--ui-border);
  }
  .resource-strip__details {
    padding-inline: 14px;
  }
  .resource-strip__account {
    max-width: 45%;
  }
  .resource-strip__connection {
    margin-left: auto;
  }
  .resource-strip__expand {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
