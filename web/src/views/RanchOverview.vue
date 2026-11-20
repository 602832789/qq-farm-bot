<script setup lang="ts">
import { NButton } from 'naive-ui/es/button'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import api from '@/api'
import { BUCKETS, formatCount, formatHours, sortFacilities, useRanchLoader, useRanchUnmountReset } from '@/components/ranch/ranch-shared'
import RanchGate from '@/components/ranch/RanchGate.vue'
import RunLogCard from '@/components/RunLogCard.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { getPlatformLabel, useAccountStore } from '@/stores/account'
import { useRanchStore } from '@/stores/ranch'
import { useStatusStore } from '@/stores/status'
import { formatCouponAmount, formatGoldAmount, formatGoldBeanAmount } from '@/utils/number-format'
import { ranchActionIcons, ranchActionLabels, ranchTodayOperations } from '@/utils/ranch-display'

const accountStore = useAccountStore()
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { status, currentAccountConnected: isOnline } = storeToRefs(useStatusStore())
const { state, loading } = storeToRefs(useRanchStore())
const { refresh } = useRanchLoader('animals')
useRanchUnmountReset()

const facilities = computed<any[]>(() => sortFacilities(state.value?.facilities || []))
const pens = computed(() => facilities.value.filter(f => f.ranch))
const animals = computed(() => pens.value.flatMap(f => (f.ranch.animals || []).map((animal: any) => ({ animal, pen: f.name }))))
const capacity = computed(() => pens.value.reduce((sum, f) => sum + (Number(f.ranch.capacity) || 0), 0))
const blocked = computed(() => animals.value.filter(({ animal }) => animal.grassBlocked).length)

const displayName = computed(() => {
  const account = currentAccount.value
  const live = String(status.value?.accountId || '') === String(account?.id || '') ? status.value?.status?.name : ''
  return live || account?.nick || account?.name || '我的牧场'
})
const avatar = computed(() => {
  const account = currentAccount.value
  const live = String(status.value?.accountId || '') === String(account?.id || '') ? String(status.value?.status?.avatarUrl || '').trim() : ''
  return live || String(account?.avatar || '').trim()
})
const failedAvatar = ref('')
watch(avatar, () => failedAvatar.value = '')
const platformLabel = computed(() => getPlatformLabel(currentAccount.value?.platform))

const expPercent = computed(() => {
  const needed = Number(state.value?.neededExp) || 0
  return needed > 0 ? Math.min(100, Math.max(0, Number(state.value.currentExp) / needed * 100)) : 100
})
const expHint = computed(() => {
  if (!state.value?.neededExp)
    return '牧场已满级'
  const remain = Number(state.value.neededExp) - Number(state.value.currentExp)
  return `距 Lv.${Number(state.value.level) + 1} 还差 ${formatCount(Math.max(0, remain))} 经验`
})

const currency = (id: number) => state.value?.currencies?.find((c: any) => Number(c.id) === id)
// 金券 / 点券 / 金豆豆 / 松果：单位与农场首页的金额口径保持一致（万、亿自动缩写）。
const ASSET_FORMATTERS: Record<number, (value: unknown) => string> = {
  1007: formatGoldAmount,
  1002: formatCouponAmount,
  1005: formatGoldBeanAmount,
  1008: formatGoldAmount,
}
const assetTiles = computed(() => [1007, 1002, 1005, 1008]
  .map(id => currency(id))
  .filter(Boolean)
  .map((item: any) => ({
    ...item,
    display: (ASSET_FORMATTERS[Number(item.id)] || formatCount)(item.count),
  })))
// 图鉴等级走独立请求：ranch store 的 load 会整体替换 state，不能在概览页重复加载。
const book = ref<any>(null)
async function loadBook() {
  if (!currentAccountId.value) {
    book.value = null
    return
  }
  try {
    const response = await api.get('/api/ranch', { params: { view: 'illustrated' }, headers: { 'x-account-id': String(currentAccountId.value) }, timeout: 45000, skipErrorToast: true } as any)
    book.value = response.data?.ok ? (response.data.data?.book || null) : null
  }
  catch {
    book.value = null
  }
}
watch(currentAccountId, () => void loadBook(), { immediate: true })

const stockTiles = computed(() => {
  // 桌面副本同款四项：普通/有机罐头剩余时长（秒 → 小时）与普通/巨大图鉴等级。
  const cans = BUCKETS.map(bucket => ({
    key: bucket.id,
    label: Number(bucket.id) === 7004 ? '有机罐头时长' : '普通罐头时长',
    image: Number(bucket.id) === 7004 ? '/game-config/ranch-icons/can-organic.png' : '/game-config/ranch-icons/can-normal.png',
    value: formatHours(state.value?.buckets?.find((b: any) => Number(b.id) === bucket.id)?.seconds ?? 0),
  }))
  const normalLevel = book.value?.normal?.level
  const giantLevel = book.value?.giant?.currentLevel
  return [
    ...cans,
    { key: 'book-normal', label: '普通图鉴', image: '/game-config/ranch-icons/illustrated-normal.png', value: normalLevel != null ? `Lv.${normalLevel}` : '—' },
    { key: 'book-giant', label: '巨大图鉴', image: '/game-config/ranch-icons/illustrated-giant.png', value: giantLevel ? `Lv.${giantLevel}` : '—' },
  ]
})

/* ── 下次检查倒计时 / 今日统计 ─────────────────────────────────────
   位置与农场首页右侧那两栏一致：先倒计时、再今日统计，
   倒计时三环（任务 / 分享 / 福利）来自牧场的每日例程。 */
const now = ref(Date.now())
const ticker = window.setInterval(() => { now.value = Date.now() }, 1000)
onBeforeUnmount(() => window.clearInterval(ticker))

// 与桌面副本一致：牧场 / 帮助 / 偷取
const RANCH_CHECKS = [
  { key: 'farm', label: '牧场', icon: 'i-fas-paw', color: '#22c55e' },
  { key: 'help', label: '帮助', icon: 'i-carbon-user-multiple', color: '#3b82f6' },
  { key: 'steal', label: '偷取', icon: 'i-carbon-run', color: '#f97316' },
]

function formatCountdown(seconds: number) {
  if (seconds <= 0)
    return '00:00:00'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor(seconds % 86400 / 3600)
  const m = Math.floor(seconds % 3600 / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return d > 0 ? `${d}天 ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`
}

const checks = computed(() => RANCH_CHECKS.map((item) => {
  const queue = state.value?.nextChecks?.[item.key]
  const remain = Math.max(0, Math.ceil(((Number(queue?.nextAt) || 0) - now.value) / 1000))
  const ready = !!queue?.done && !remain
  const value = !queue
    ? '读取中'
    : !queue.enabled
      ? '未开启'
      : queue.done && !queue.nextAt
        ? '已完成'
        : remain > 0 ? formatCountdown(remain) : '检查中…'
  // 进度环：没有下一次检查时间就按「本轮已完成」画满。
  const progress = queue && queue.enabled ? (queue.nextAt ? Math.min(100, Math.max(0, 100 - remain / Math.max(1, Math.round((Number(queue.nextAt) - Number(queue.lastAt || 0)) / 1000)) * 100)) : 100) : 0
  return { ...item, value, progress: ready ? 100 : progress }
}))

const todayKey = computed(() => {
  const d = new Date(now.value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})

const todayOperations = computed(() => ranchTodayOperations(state.value?.operations, state.value?.operationsDate, todayKey.value))
const operationEntries = computed(() => Object.entries(todayOperations.value).filter(([, count]) => Number(count) > 0))
</script>

<template>
  <div class="page-stack flex flex-col gap-5">
    <EmptyState v-if="!currentAccountId" title="请先选择账号" description="在左侧选择账号后查看牧场" icon="i-carbon-user-avatar" />
    <RanchGate v-else @retry="refresh">
      <div class="overview-grid">
        <!-- 账号：身份、在线状态与牧场等级 -->
        <section class="ov-card ov-account">
          <div class="ov-account__head">
            <div class="ov-avatar" :class="{ 'is-online': isOnline }">
              <img v-if="avatar && avatar !== failedAvatar" :key="avatar" :src="avatar" alt="" @error="failedAvatar = avatar">
              <span v-else class="i-carbon-user-avatar" />
              <i class="ov-avatar__dot" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="ov-account__name-row">
                <strong class="ov-account__name" :title="displayName">{{ displayName }}</strong>
                <span class="ov-level">牧场 Lv.{{ state.level }}</span>
              </div>
              <div class="ov-presence">
                <span class="ov-presence__state" :class="isOnline ? 'is-online' : 'is-offline'">{{ isOnline ? '在线' : '离线' }}</span>
                <span class="ov-presence__item"><span class="i-carbon-pet-image-o" />饲养 {{ animals.length }} / {{ capacity }}</span>
                <span v-if="platformLabel" class="ov-presence__item">{{ platformLabel }}</span>
              </div>
            </div>
            <BaseButton to="/ranch/personal" variant="primary" size="sm" class="ov-farm-entry" aria-label="进入我的牧场">
              我的牧场 <span class="i-carbon-arrow-up-right ml-1" aria-hidden="true" />
            </BaseButton>
            <NButton circle quaternary :loading="loading" title="刷新牧场" aria-label="刷新牧场" @click="refresh">
              <template #icon>
                <span class="i-carbon-renew" />
              </template>
            </NButton>
          </div>

          <div class="ov-exp">
            <div class="ov-exp__labels">
              <span>牧场经验</span>
              <span class="ov-exp__value">
                {{ formatCount(state.currentExp) }} / {{ state.neededExp ? formatCount(state.neededExp) : '—' }}
                <b>{{ Math.floor(expPercent) }}%</b>
              </span>
            </div>
            <div class="ov-exp__track">
              <div class="ov-exp__bar" :style="{ width: `${expPercent}%` }" />
            </div>
          </div>

          <div class="ov-account__foot">
            <span>{{ expHint }}</span>
          </div>
        </section>

        <!-- 资产 -->
        <section class="ov-card">
          <h3 class="ov-card__title">
            资产
          </h3>
          <div class="ov-tiles">
            <div v-for="item in assetTiles" :key="item.id" class="ov-tile">
              <span class="ov-tile__label"><img class="ov-tile__img" :src="item.image" alt="">{{ item.name }}</span>
              <strong class="ov-tile__value" :title="item.display">{{ item.display }}</strong>
            </div>
          </div>
        </section>

        <!-- 库存：普通/有机罐头时长与普通/巨大图鉴等级（桌面副本同款四项） -->
        <section class="ov-card">
          <h3 class="ov-card__title">
            库存
          </h3>
          <div class="ov-tiles">
            <div v-for="item in stockTiles" :key="item.key" class="ov-tile">
              <span class="ov-tile__label"><img class="ov-tile__img" :src="item.image" alt="">{{ item.label }}</span>
              <strong class="ov-tile__value">{{ item.value }}</strong>
            </div>
          </div>
        </section>
      </div>

      <div v-if="blocked" class="ranch-alert" role="status">
        <span class="i-carbon-warning-alt" aria-hidden="true" />
        <span>牧草不足，{{ blocked }} 只动物已暂停成长。</span>
        <BaseButton variant="text" size="sm" to="/ranch/personal?tab=facilities">
          去补充牧草
        </BaseButton>
      </div>

      <div class="flex flex-1 flex-col items-stretch gap-6 md:flex-row">
        <!-- 运行日志按账号记录，与农场概览共用 -->
        <RunLogCard />

        <div class="min-w-0 flex flex-col gap-6 md:w-1/4">
          <!-- 下次检查倒计时：与农场首页同位置、同三环布局 -->
          <section class="farm-card rounded-2xl p-5">
            <h3 class="mb-3 flex items-center gap-2 text-lg font-display font-medium">
              <span class="i-carbon-hourglass" /> <span>下次检查倒计时</span>
            </h3>
            <div class="grid grid-cols-3 gap-2">
              <div
                v-for="check in checks"
                :key="check.key"
                class="min-w-0 flex flex-col items-center text-center"
              >
                <div
                  class="h-18 w-18 flex items-center justify-center rounded-full p-1"
                  :style="{ background: `conic-gradient(${check.color} ${check.progress}%, color-mix(in srgb, ${check.color} 14%, transparent) 0)` }"
                >
                  <div class="h-full w-full flex flex-col items-center justify-center rounded-full bg-white dark:bg-gray-800">
                    <span :class="check.icon" class="text-xl" :style="{ color: check.color }" aria-hidden="true" />
                    <span class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ check.label }}</span>
                  </div>
                </div>
                <div class="mt-1.5 w-full truncate text-sm font-bold font-mono 2xl:text-base" :title="check.value">
                  {{ check.value }}
                </div>
              </div>
            </div>
          </section>

          <!-- 今日统计：牧场动作计数，位置与农场首页一致 -->
          <section class="farm-card rounded-2xl p-5">
            <h3 class="mb-3 flex items-center justify-between gap-2 text-lg font-display font-medium">
              <span class="flex items-center gap-2"><span class="i-carbon-chart-column" /> <span>今日统计</span></span>
              <span class="text-xs text-gray-400 font-normal">{{ operationEntries.length }} 项有记录</span>
            </h3>
            <EmptyState
              v-if="!isOnline"
              bare
              title="账号未登录"
              description="启动账号后显示牧场操作统计"
              icon="i-carbon-connection-signal-off"
            />
            <div v-else-if="!operationEntries.length" class="flex flex-col items-center justify-center gap-1 py-6 text-center">
              <span class="i-fas-paw text-3xl text-gray-300 dark:text-gray-600" />
              <strong class="text-sm text-gray-700 dark:text-gray-200">今天还没有牧场操作</strong>
              <p class="text-xs text-gray-400">
                收获、喂养、清理等动作完成后会在这里累计。
              </p>
            </div>
            <div v-else class="grid grid-cols-2 gap-2 2xl:gap-3" role="region" aria-label="今日牧场动作统计">
              <div
                v-for="[key, val] in operationEntries"
                :key="key"
                class="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-700/30"
              >
                <div class="min-w-0 flex items-center gap-2">
                  <span class="select-none text-base text-teal-600 2xl:text-lg" :class="ranchActionIcons[key] || 'i-carbon-chart-column'" />
                  <div class="truncate text-xs text-gray-500 2xl:text-sm" :title="ranchActionLabels[key] || key">
                    {{ ranchActionLabels[key] || key }}
                  </div>
                </div>
                <div class="text-sm font-bold 2xl:text-base">
                  {{ val }}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </RanchGate>
  </div>
</template>

<style scoped src="@/styles/overview.css"></style>

<style scoped>
.ov-account__head > :deep(.n-button) {
  align-self: flex-start;
}

/* 老版首页入口：一键进入我的牧场（与农场首页「我的农场」按钮同款同位） */
.ov-farm-entry {
  flex-shrink: 0;
}

.ov-tile__img {
  width: 16px;
  height: 16px;
  flex: none;
  object-fit: contain;
}

.ranch-alert {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--ui-warning) 30%, transparent);
  border-radius: var(--ui-radius-control);
  color: var(--ui-warning);
  background: var(--ui-warning-soft);
  font-size: 13px;
}

.ranch-alert > :last-child {
  margin-left: auto;
}

.ranch-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.ranch-todo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--ui-surface-soft);
  font-variant-numeric: tabular-nums;
}

.ranch-todo b {
  font-size: 15px;
}

.ranch-todo.is-zero {
  opacity: 0.6;
}

.ranch-facilities {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ranch-facility__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
}

.ranch-facility__name {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  color: var(--ui-ink);
  font-weight: var(--fw-600);
}

.ranch-facility__name small {
  color: var(--ui-subtle);
  font-size: 11px;
  font-weight: var(--fw-500);
}

.ranch-facility__value {
  color: var(--ui-muted);
  font-size: 12px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.ranch-facility__track {
  height: 6px;
  margin-top: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--ui-surface-soft);
}

.ranch-facility__track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #9fd17d, var(--ui-primary));
  transition: width 0.4s ease;
}

.ranch-facility.is-pending {
  opacity: 0.6;
}
</style>
