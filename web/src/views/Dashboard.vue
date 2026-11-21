<script setup lang="ts">
import type { RuntimeLogEntry } from '@/utils/runtime-log'
import { useIntervalFn } from '@vueuse/core'
import { NButton } from 'naive-ui/es/button'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import api, { getApiErrorMessage } from '@/api'
import AccountCareerModal from '@/components/AccountCareerModal.vue'
import LevelForecast from '@/components/LevelForecast.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { getPlatformLabel, useAccountStore } from '@/stores/account'
import { useBagStore } from '@/stores/bag'
import { useStatusStore } from '@/stores/status'
import { useToastStore } from '@/stores/toast'
import { partitionOperations } from '@/utils/dashboard-operations'
import { compactRuntimeLogs, matchesRuntimeLog, normalizeRuntimeLog } from '@/utils/runtime-log'

const statusStore = useStatusStore()
const accountStore = useAccountStore()
const bagStore = useBagStore()
const toastStore = useToastStore()
const {
  status,
  diamondBalance,
  logs: statusLogs,
  realtimeConnected,
} = storeToRefs(statusStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const isOnline = computed(() => !!currentAccount.value?.running && status.value?.connection?.connected === true)
const { dashboardItems } = storeToRefs(bagStore)
const logContainer = ref<HTMLElement | null>(null)
const autoScroll = ref(true)
const lastBagFetchAt = ref(0)
const clearingLogs = ref(false)
const refreshingLogs = ref(false)
// 首页「刷新」按钮的忙态：与牧场首页同款圆形刷新钮，避免连点重复拉取。
const refreshingOverview = ref(false)
const pendingLogCount = ref(0)

const allLogs = computed<RuntimeLogEntry[]>(() => {
  const merged = (statusLogs.value || []).map((log: any) => normalizeRuntimeLog(log))
  const unique = new Map<string, RuntimeLogEntry>()
  for (const log of merged)
    unique.set(log.id, log)
  return [...unique.values()].sort((a, b) => a.ts - b.ts)
})

const filter = reactive({
  module: '',
  event: '',
  keyword: '',
  level: '',
})

const logLevels = [
  { label: '所有级别', value: '' },
  { label: '常规', value: 'info' },
  { label: '警告', value: 'warn' },
  { label: '错误', value: 'error' },
]

const hasActiveLogFilter = computed(() =>
  !!(filter.module || filter.event || filter.keyword || filter.level),
)

const filteredLogs = computed(() => allLogs.value.filter(log => matchesRuntimeLog(log, filter)))

// 老版本日志面板：同类日志 2 分钟窗口内合并为一条（×N + 时间区间）。
const visibleLogs = computed(() => compactRuntimeLogs(filteredLogs.value))

/** 日志行展示：先按模块/事件/关键词过滤并合并重复，再按级别筛一层。 */
const displayLogs = computed(() => visibleLogs.value.filter(log => !filter.level || log.level === filter.level))

const logSummary = computed(() => {
  const counts = { info: 0, warn: 0, error: 0 }
  if (currentAccountId.value) {
    for (const log of filteredLogs.value)
      counts[log.level]++
  }
  return counts
})

const modules = [
  { label: '所有模块', value: '' },
  { label: '农场', value: 'farm' },
  { label: '好友', value: 'friend' },
  { label: '仓库', value: 'warehouse' },
  { label: '任务', value: 'task' },
  { label: '活动', value: 'activity' },
  { label: '牧场', value: 'ranch' },
  { label: '系统', value: 'system' },
]

const events = [
  { label: '所有事件', value: '' },
  { label: '农场巡查', value: 'farm_cycle' },
  { label: '收获作物', value: 'harvest_crop' },
  { label: '清理枯株', value: 'remove_plant' },
  { label: '种植种子', value: 'plant_seed' },
  { label: '施加化肥', value: 'fertilize' },
  { label: '土地推送', value: 'lands_notify' },
  { label: '选择种子', value: 'seed_pick' },
  { label: '购买种子', value: 'seed_buy' },
  { label: '购买化肥', value: 'fertilizer_buy' },
  { label: '开启礼包', value: 'fertilizer_gift_open' },
  { label: '获取任务', value: 'task_scan' },
  { label: '完成任务', value: 'task_claim' },
  { label: '免费礼包', value: 'mall_free_gifts' },
  { label: '分享奖励', value: 'daily_share' },
  { label: '会员礼包', value: 'vip_daily_gift' },
  { label: '月卡礼包', value: 'month_card_gift' },
  { label: '图鉴奖励', value: 'illustrated_rewards' },
  { label: '邮箱领取', value: 'email_rewards' },
  { label: '出售成功', value: 'sell_success' },
  { label: '活动自动化', value: 'activity_automation' },
  { label: '土地升级', value: 'upgrade_land' },
  { label: '土地解锁', value: 'unlock_land' },
  { label: '好友巡查', value: 'friend_cycle' },
  { label: '访问好友', value: 'visit_friend' },
]

const eventLabelMap: Record<string, string> = Object.fromEntries(
  events.filter(e => e.value).map(e => [e.value, e.label]),
)

function getEventLabel(event: string) {
  return eventLabelMap[event] || event
}

const displayName = computed(() => {
  const account = accountStore.currentAccount

  // Try to use nickname from status (game server)
  const gameName = status.value?.status?.name
  if (gameName) {
    // 如果有备注，显示为“昵称（备注）”
    if (account?.name && account.name !== gameName) {
      return `${gameName} (${account.name})`
    }
    return gameName
  }

  // Check login status
  if (!status.value?.connection?.connected) {
    if (account) {
      // 如果有备注和昵称，显示为“昵称（备注）”
      if (account.name && account.nick && account.name !== account.nick) {
        return `${account.nick} (${account.name})`
      }
      return account.name || account.nick || '未登录'
    }
    return '未登录'
  }

  // Fallback to account name (usually ID) or '未命名'
  if (account) {
    // 如果有备注和昵称，显示为“昵称（备注）”
    if (account.name && account.nick && account.name !== account.nick) {
      return `${account.nick} (${account.name})`
    }
    return account.name || account.nick || '未命名'
  }
  return '未命名'
})

// Exp Rate & Time to Level
const expRate = computed(() => {
  const gain = status.value?.sessionExpGained || 0
  const uptime = status.value?.sessionElapsedSeconds ?? status.value?.uptime ?? 0
  if (!uptime)
    return '0/时'
  const hours = uptime / 3600
  const rate = hours > 0 ? (gain / hours) : 0
  return `${Math.floor(rate)}/时`
})

// Fertilizer & Collection
const fertilizerNormal = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 1011))
const fertilizerOrganic = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 1012))
const collectionNormal = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 3001))
const collectionRare = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 3002))

function formatBucketTime(item: any) {
  if (!item)
    return '0.0h'
  if (item.hoursText)
    return item.hoursText.replace('小时', 'h')
  const count = Number(item.count || 0)
  return `${(count / 3600).toFixed(1)}h`
}

// Next Check Countdown —— 旧版四项：农场巡查 / 好友帮助 / 好友偷菜 / 奶茶自动化
const nextFarmCheck = ref('--:--:--')
const nextHelpCheck = ref('--:--:--')
const nextStealCheck = ref('--:--:--')
const countdownNow = ref(Date.now())
/**
 * 「已运行」时长。
 *
 * 旧实现是一个 ref：每秒 `localUptime++`，同时每 10s 被整包 status 的
 * `uptime`（其实还是后端进程的 process.uptime）覆盖回去。两个来源来回
 * 覆盖，数字会忽进忽退，长度一变整行就换行错位，看起来就是「位置跳来跳去」。
 *
 * 现在改成「服务端锚点 + 本地时间差」的 computed：
 * - 单调递增，不会被覆盖回退；
 * - 每秒只按本地时钟算，不依赖推送节奏；
 * - 服务端值只作为锚点，且只接受明显推进的锚点，避免取整造成 ±1 抖动。
 */
const uptimeAnchorSec = ref(0)
const uptimeAnchorAt = ref(0)
const localUptime = computed(() => {
  if (!uptimeAnchorSec.value)
    return 0
  const drift = Math.max(0, (countdownNow.value - uptimeAnchorAt.value) / 1000)
  return Math.floor(uptimeAnchorSec.value + drift)
})
const farmCountdownTotal = ref(1)
const helpCountdownTotal = ref(1)
const stealCountdownTotal = ref(1)
let localNextFarmRemainSec = 0
let localNextHelpRemainSec = 0
let localNextStealRemainSec = 0
let farmQuiet = false
let friendQuiet = false
let helpEnabled = true
let stealEnabled = true

function syncCountdownTotal(total: typeof farmCountdownTotal, remain: number, previousRemain: number) {
  if (remain > previousRemain || total.value <= 1)
    total.value = Math.max(1, remain)
}

function getCountdownProgress(remain: number, total: number) {
  return Math.max(0, Math.min(100, (remain / Math.max(1, total)) * 100))
}

/** 环形进度：与桌面副本一致，用 conic-gradient 画圆环，外圈颜色按模块区分。 */
function getCountdownRingStyle(remain: number, total: number, color: string) {
  const progress = getCountdownProgress(remain, total)
  return {
    background: `conic-gradient(${color} ${progress}%, color-mix(in srgb, ${color} 14%, transparent) 0)`,
  }
}

function updateCountdowns() {
  countdownNow.value = Date.now()
  if (!status.value?.connection?.connected) {
    nextFarmCheck.value = '账号未登录'
    nextHelpCheck.value = '账号未登录'
    nextStealCheck.value = '账号未登录'
    return
  }

  // 「已运行」不再在这里自增：它由 localUptime computed 依据
  // countdownNow（本函数首行已更新）与服务端锚点算出，天然单调递增。
  if (farmQuiet) {
    nextFarmCheck.value = '静默中'
  }
  else if (localNextFarmRemainSec > 0) {
    localNextFarmRemainSec--
    nextFarmCheck.value = formatDuration(localNextFarmRemainSec)
  }
  else {
    nextFarmCheck.value = '检查中...'
  }

  if (!helpEnabled) {
    nextHelpCheck.value = '已关闭'
  }
  else if (friendQuiet) {
    nextHelpCheck.value = '静默中'
  }
  else if (localNextHelpRemainSec > 0) {
    localNextHelpRemainSec--
    nextHelpCheck.value = formatDuration(localNextHelpRemainSec)
  }
  else {
    nextHelpCheck.value = '检查中...'
  }

  if (!stealEnabled) {
    nextStealCheck.value = '已关闭'
  }
  else if (friendQuiet) {
    nextStealCheck.value = '静默中'
  }
  else if (localNextStealRemainSec > 0) {
    localNextStealRemainSec--
    nextStealCheck.value = formatDuration(localNextStealRemainSec)
  }
  else {
    nextStealCheck.value = '检查中...'
  }
}

watch(() => status.value?.nextChecks, (nextChecks) => {
  countdownNow.value = Date.now()
  if (nextChecks) {
    const farmRemainSec = Number(nextChecks.farmRemainSec) || 0
    const helpRemainSec = Number(nextChecks.helpRemainSec ?? nextChecks.friendRemainSec) || 0
    const stealRemainSec = Number(nextChecks.stealRemainSec ?? nextChecks.friendRemainSec) || 0
    syncCountdownTotal(farmCountdownTotal, farmRemainSec, localNextFarmRemainSec)
    syncCountdownTotal(helpCountdownTotal, helpRemainSec, localNextHelpRemainSec)
    syncCountdownTotal(stealCountdownTotal, stealRemainSec, localNextStealRemainSec)
    localNextFarmRemainSec = farmRemainSec
    localNextHelpRemainSec = helpRemainSec
    localNextStealRemainSec = stealRemainSec
    farmQuiet = !!nextChecks.farmQuiet
    friendQuiet = !!(nextChecks.friendQuiet ?? nextChecks.helpQuiet ?? nextChecks.stealQuiet)
    helpEnabled = nextChecks.helpEnabled !== false
    stealEnabled = nextChecks.stealEnabled !== false
    updateCountdowns()
  }
}, { immediate: true })

/**
 * 服务端只作为锚点：明显推进才接受，避免整包推送到来时间与每秒自增互相覆盖。
 *
 * 但账号重启（或掉线后换新 worker）时 uptime 会归零，那也必须跟着归零，
 * 否则「已运行」会一直卡着重启前的数字。用「回退幅度」区分两种情况：
 * 小幅回退（< 60s）是取整/网络延迟造成的抖动，忽略；大幅回退视为重启，重新锚定。
 */
watch(() => status.value?.uptime, (uptime) => {
  const next = Number(uptime)
  if (!Number.isFinite(next) || next <= 0)
    return
  const anchorAt = Date.now()
  const projected = uptimeAnchorSec.value
    ? uptimeAnchorSec.value + Math.max(0, (anchorAt - uptimeAnchorAt.value) / 1000)
    : 0
  const rolledBack = next + 60 < projected
  // 允许 0.5s 的浮点/取整误差；不属于重启的小幅回退直接忽略，保证数字单调。
  if (!rolledBack && next + 0.5 < projected)
    return
  uptimeAnchorSec.value = next
  uptimeAnchorAt.value = anchorAt
}, { immediate: true })

/** 切换账号时立刻清空，避免短暂显示上一个账号的运行时长。 */
watch(currentAccountId, () => {
  uptimeAnchorSec.value = 0
  uptimeAnchorAt.value = 0
})

/**
 * 平台标签缓存：账号列表刷新失败的瞬间 currentAccount 会变 undefined，
 * 直接绑 computed 会让「微信 / QQ」这两个字短暂消失，后面元素跟着左移。
 */
const platformLabel = ref('')
watch(() => accountStore.currentAccount?.platform, (platform) => {
  const label = getPlatformLabel(platform)
  if (label)
    platformLabel.value = label
}, { immediate: true })

/** 与旧版一致：状态就绪且连接在线时才展示真实倒计时。 */
const checksReady = computed(() => !!status.value && !statusStore.error && status.value?.connection?.connected === true)

const syncLabel = computed(() => {
  if (!currentAccountId.value)
    return '未选择账号'
  if (statusStore.error)
    return '同步失败'
  if (!status.value)
    return '正在同步'
  if (!status.value?.connection?.connected)
    return '账号未连接'
  return realtimeConnected.value ? '实时同步中' : '轮询同步中'
})

interface DashboardCheck {
  key: string
  label: string
  icon: string
  time: string
  progress: number
  description?: string
}

const countdowns = computed((): DashboardCheck[] => [
  {
    key: 'farm',
    label: '农场',
    icon: 'i-carbon-sprout',
    time: nextFarmCheck.value,
    progress: getCountdownProgress(localNextFarmRemainSec, farmCountdownTotal.value),
  },
  {
    key: 'help',
    label: '帮助',
    icon: 'i-carbon-user-multiple',
    time: nextHelpCheck.value,
    progress: helpEnabled ? getCountdownProgress(localNextHelpRemainSec, helpCountdownTotal.value) : 0,
    description: helpEnabled ? '与偷菜同轮好友巡查' : '好友帮助已关闭',
  },
  {
    key: 'steal',
    label: '偷菜',
    icon: 'i-carbon-run',
    time: nextStealCheck.value,
    progress: stealEnabled ? getCountdownProgress(localNextStealRemainSec, stealCountdownTotal.value) : 0,
    description: stealEnabled ? '与帮助同轮好友巡查' : '好友偷菜已关闭',
  },
])

function formatDuration(seconds: number) {
  if (seconds <= 0)
    return '00:00:00'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  const pad = (n: number) => n.toString().padStart(2, '0')

  if (d > 0)
    return `${d}天 ${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function formatLogTime(timeStr: string, ts?: number) {
  // 优先用数字时间戳在浏览器本地时区格式化；服务端格式化的 time 字符串是服务器时区。
  if (ts && Number.isFinite(ts) && ts > 0) {
    const d = new Date(ts)
    const pad = (v: number) => String(v).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
  // 2024/5/20 12-34-56 -> 12-34-56
  if (!timeStr)
    return ''
  const parts = timeStr.split(' ')
  return parts.length > 1 ? parts[1] : timeStr
}

function formatLogTimeRange(log: RuntimeLogEntry) {
  const start = formatLogTime(log.time, log.ts)
  if (!log.lastTs || log.lastTs === log.ts)
    return start
  return `${start}–${new Date(log.lastTs).toLocaleTimeString('zh-CN', { hour12: false })}`
}

function getLogTagClass(tag: string) {
  if (tag === '错误')
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  if (tag === '系统')
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  if (tag === '活动')
    return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
  if (tag === '宠物')
    return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300'
  if (tag === '牧场')
    return 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
  if (tag === '警告')
    return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
}

function getLogRowClass(log: RuntimeLogEntry) {
  if (log.level === 'error')
    return 'border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/20'
  if (log.level === 'warn')
    return 'border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20'
  return 'border-transparent hover:bg-white/55 dark:hover:bg-gray-800/45'
}

function getLogMsgClass(tag: string) {
  if (tag === '错误')
    return 'text-red-600 dark:text-red-400'
  return 'text-gray-700 dark:text-gray-300'
}

// 动作统计元信息按老版本全量恢复（今日统计面板）。
const OP_META: Record<string, { label: string, icon: string, color: string }> = {
  harvest: { label: '收获', icon: 'i-carbon-crop-growth', color: 'text-green-500' },
  water: { label: '浇水', icon: 'i-carbon-rain-drop', color: 'text-blue-400' },
  weed: { label: '除草', icon: 'i-carbon-cut', color: 'text-yellow-500' },
  bug: { label: '除虫', icon: 'i-carbon-pest', color: 'text-red-400' },
  farming: { label: '一键务农', icon: 'i-carbon-clean', color: 'text-teal-500' },
  fertilize: { label: '施肥', icon: 'i-carbon-chemistry', color: 'text-emerald-500' },
  plant: { label: '种植', icon: 'i-carbon-tree', color: 'text-lime-500' },
  steal: { label: '偷菜', icon: 'i-carbon-run', color: 'text-orange-500' },
  helpWater: { label: '帮浇水', icon: 'i-carbon-rain-drop', color: 'text-blue-300' },
  goldenBugClear: { label: '清黄金虫', icon: 'i-carbon-clean', color: 'text-amber-500' },
  goldenBugPut: { label: '放黄金虫', icon: 'i-carbon-pest', color: 'text-yellow-500' },
  helpWeed: { label: '帮除草', icon: 'i-carbon-cut', color: 'text-yellow-400' },
  helpBug: { label: '帮除虫', icon: 'i-carbon-pest', color: 'text-red-300' },
  taskClaim: { label: '任务', icon: 'i-carbon-task-complete', color: 'text-indigo-500' },
  sell: { label: '出售', icon: 'i-carbon-shopping-cart', color: 'text-pink-500' },
  tongQiGift: { label: '同气礼包', icon: 'i-carbon-gift', color: 'text-rose-500' },
}

const filteredOperations = computed(() => {
  const ops = status.value?.operations || {}
  const result: Record<string, number> = {}
  for (const key of Object.keys(ops)) {
    if (key !== 'upgrade' && key !== 'levelUp') {
      result[key] = ops[key]
    }
  }
  return result
})

// 老版本今日统计：主动作按次数排序展示，无记录的收进折叠区。
const operationGroups = computed(() => partitionOperations(filteredOperations.value))

// 当日新增金币/经验/金豆/点券：四项都由后端按当日基线算好下发，跨重启与跨天均已处理。
// 金币、金豆、点券是净值（消费会扣减），消费高于收益时为负数，不能 clamp 到 0；
// 负数按资产「本次运行金币」的负向色展示。经验只增不减，仍保持非负。
const todayGoldGained = computed(() => Number(status.value?.sessionGoldGained) || 0)
const todayExpGained = computed(() => Math.max(0, Number(status.value?.sessionExpGained) || 0))
const todayGoldBeanGained = computed(() => Number(status.value?.sessionGoldBeanGained) || 0)
const todayCouponGained = computed(() => Number(status.value?.sessionCouponGained) || 0)

function getOpName(key: string | number) {
  return OP_META[String(key)]?.label || String(key)
}

function getOpIcon(key: string | number) {
  return OP_META[String(key)]?.icon || 'i-carbon-circle-dash'
}

function getOpColor(key: string | number) {
  return OP_META[String(key)]?.color || 'text-gray-400'
}

const accountAvatar = computed(() => {
  const account = accountStore.currentAccount
  if (!account)
    return ''
  const live = String(status.value?.accountId || '') === String(account.id || '')
    ? String(status.value?.status?.avatarUrl || '').trim()
    : ''
  return live || String(account.avatar || '').trim()
})
const failedAccountAvatar = ref('')

watch(accountAvatar, () => {
  failedAccountAvatar.value = ''
})

function handleAccountAvatarError(event: Event) {
  failedAccountAvatar.value = (event.currentTarget as HTMLImageElement | null)?.getAttribute('src') || ''
}

function formatPlainNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num.toLocaleString('zh-CN') : '0'
}

function getExpPercent(p: any) {
  if (!p || !p.needed)
    return 0
  return Math.min(100, Math.max(0, (p.current / p.needed) * 100))
}

function formatAssetAmount(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)).toLocaleString('zh-CN') : '0'
}

/** 大额资产紧凑显示：≥1万以万为单位，≥1亿以亿为单位（仅金币/金豆豆使用）。 */
function formatCompactAsset(value: unknown) {
  const amount = Number(value)
  if (!Number.isFinite(amount))
    return '0'
  const n = Math.max(0, Math.trunc(amount))
  const unitValue = (divisor: number) => {
    const v = n / divisor
    return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  }
  if (n >= 1e8)
    return `${unitValue(1e8)}亿`
  if (n >= 1e4)
    return `${unitValue(1e4)}万`
  return n.toLocaleString('zh-CN')
}

async function refreshBag(force = false) {
  if (!currentAccountId.value)
    return
  if (!currentAccount.value?.running)
    return
  if (!status.value?.connection?.connected)
    return

  const now = Date.now()
  if (!force && now - lastBagFetchAt.value < 2500)
    return
  lastBagFetchAt.value = now
  await bagStore.fetchBag(currentAccountId.value)
}

async function refreshDiamond() {
  if (!currentAccountId.value || !currentAccount.value?.running)
    return
  if (!status.value?.connection?.connected)
    return
  await statusStore.fetchDiamond(currentAccountId.value)
}

async function refresh(forceReloadLogs = false) {
  if (currentAccountId.value) {
    const acc = currentAccount.value
    if (!acc)
      return

    // 首次加载、断线兜底时走 HTTP；连接正常时优先走 WS 实时推送
    if (!realtimeConnected.value) {
      await statusStore.fetchStatus(currentAccountId.value)
    }

    if (forceReloadLogs || hasActiveLogFilter.value || !realtimeConnected.value) {
      await statusStore.fetchLogs(currentAccountId.value, {
        module: filter.module || undefined,
        event: filter.event || undefined,
        keyword: filter.keyword || undefined,
      })
    }

    // 仅在账号已运行且连接就绪后拉背包，避免启动阶段触发500
    await refreshBag()
  }
}

function onLogFilterChange() {
  pendingLogCount.value = 0
  refresh(true)
}

function onLogSearchTrigger() {
  pendingLogCount.value = 0
  refresh(true)
}

async function refreshFarmOverview() {
  if (refreshingOverview.value || !currentAccountId.value)
    return
  refreshingOverview.value = true
  try {
    await refresh()
  }
  finally {
    refreshingOverview.value = false
  }
}

async function refreshRuntimeLogs() {
  if (!currentAccountId.value || refreshingLogs.value)
    return
  refreshingLogs.value = true
  try {
    await statusStore.fetchLogs(currentAccountId.value, { limit: 300 })
    toastStore.success('日志已刷新')
  }
  finally {
    refreshingLogs.value = false
  }
}

watch(currentAccountId, async () => {
  diamondBalance.value = 0
  await refresh()
  await refreshDiamond()
  scrollToBottom()
})

watch(() => status.value?.connection?.connected, (connected) => {
  if (connected) {
    refreshBag(true)
    refreshDiamond()
  }
})

function operationsEqual(next: Record<string, unknown> | null | undefined, prev: Record<string, unknown> | null | undefined) {
  const nextOperations = next || {}
  const prevOperations = prev || {}
  const nextKeys = Object.keys(nextOperations)
  const prevKeys = Object.keys(prevOperations)
  return nextKeys.length === prevKeys.length && nextKeys.every(key => nextOperations[key] === prevOperations[key])
}

watch(() => status.value?.operations, (next, prev) => {
  if (!realtimeConnected.value || operationsEqual(next, prev))
    return
  refreshBag()
})

watch(hasActiveLogFilter, (enabled) => {
  statusStore.setRealtimeLogsEnabled(!enabled)
  refresh()
})

function onLogScroll(e: Event) {
  const el = e.target as HTMLElement
  if (!el)
    return
  const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
  autoScroll.value = isNearBottom
  if (autoScroll.value)
    pendingLogCount.value = 0
}

async function clearLogs() {
  if (!currentAccountId.value)
    return
  clearingLogs.value = true
  try {
    const { data } = await api.delete('/api/logs')
    if (data?.ok) {
      toastStore.success('日志已清空')
      await refresh(true)
    }
    else {
      toastStore.error(`清空失败: ${getApiErrorMessage(data, '未知错误')}`)
    }
  }
  catch (e: any) {
    const msg = getApiErrorMessage(e, '请求失败')
    toastStore.error(`清空失败: ${msg}`)
  }
  finally {
    clearingLogs.value = false
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (logContainer.value)
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    autoScroll.value = true
    pendingLogCount.value = 0
  })
}

watch(filteredLogs, (next, previous) => {
  nextTick(() => {
    if (logContainer.value && autoScroll.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
      pendingLogCount.value = 0
    }
    else if (next.length > (previous?.length || 0)) {
      pendingLogCount.value += next.length - (previous?.length || 0)
    }
  })
}, { deep: true })

// 个人页（角色生涯）：入口只在首页头像，右上角账号菜单保持切换账号用途。
const showCareerModal = ref(false)
const careerLoading = ref(false)
const careerError = ref('')
const careerProfile = ref<Record<string, any>>({})
const careerItems = ref<any[]>([])

async function loadCareer() {
  if (!currentAccountId.value)
    return
  careerLoading.value = true
  careerError.value = ''
  try {
    const { data } = await api.get('/api/career')
    if (!data?.ok)
      throw new Error(getApiErrorMessage(data, '生涯记录读取失败'))
    careerProfile.value = data.data || {}
    careerItems.value = data.data?.items || []
  }
  catch (e: any) {
    careerError.value = getApiErrorMessage(e, '生涯记录读取失败')
  }
  finally {
    careerLoading.value = false
  }
}

function openCareer() {
  if (!currentAccountId.value)
    return
  showCareerModal.value = true
  void loadCareer()
}

watch(currentAccountId, () => {
  if (showCareerModal.value)
    void loadCareer()
})

onMounted(async () => {
  statusStore.setRealtimeLogsEnabled(!hasActiveLogFilter.value)
  await refresh()
  await refreshDiamond()
  scrollToBottom()
})

// Auto refresh fallback every 10s (WS 断开或筛选条件启用时会回退 HTTP)
useIntervalFn(refresh, 10000)
// Countdown timer (every 1s)
useIntervalFn(updateCountdowns, 1000)
</script>

<template>
  <div class="page-stack flex flex-col gap-5">
    <!-- Overview -->
    <div class="overview-grid">
      <!-- 账号：身份、在线状态与等级进度 -->
      <section class="ov-card ov-account">
        <div class="ov-account__head">
          <button
            type="button"
            class="ov-avatar"
            :class="{ 'is-online': isOnline }"
            :disabled="!currentAccountId"
            aria-label="查看角色生涯"
            title="查看角色生涯"
            @click="openCareer"
          >
            <img v-if="accountAvatar && accountAvatar !== failedAccountAvatar" :key="accountAvatar" :src="accountAvatar" alt="" @error="handleAccountAvatarError">
            <span v-else class="i-carbon-user-avatar" />
            <i class="ov-avatar__dot" />
          </button>
          <div class="ov-account__info min-w-0 flex-1">
            <div class="ov-account__name-row">
              <strong class="ov-account__name" :title="displayName">{{ displayName }}</strong>
              <span class="ov-level">Lv.{{ status?.status?.level || 0 }}</span>
            </div>
            <div class="ov-presence">
              <span class="ov-presence__state" :class="isOnline ? 'is-online' : 'is-offline'">{{ isOnline ? '在线' : '离线' }}</span>
              <!-- 运行信息收成一组：PC 端与「在线」同行，手机端整组落到下一行，避免逐项各自换行走位。 -->
              <span class="ov-presence__meta">
                <span v-if="isOnline" class="ov-presence__item"><span class="i-carbon-time" />已运行 {{ formatDuration(localUptime) }}</span>
                <span v-if="platformLabel" class="ov-presence__item">{{ platformLabel }}</span>
              </span>
            </div>
          </div>
          <BaseButton to="/personal" variant="primary" size="sm" class="ov-farm-entry" aria-label="进入我的农场">
            我的农场 <span class="i-carbon-arrow-up-right ml-1" aria-hidden="true" />
          </BaseButton>
          <!-- 与牧场首页同序同款：进入按钮在左，圆形刷新钮在右。 -->
          <NButton circle quaternary :loading="refreshingOverview" :disabled="!currentAccountId" title="刷新农场" aria-label="刷新农场" @click="refreshFarmOverview">
            <template #icon>
              <span class="i-carbon-renew" />
            </template>
          </NButton>
        </div>

        <div class="ov-exp">
          <div class="ov-exp__labels">
            <span>经验</span>
            <span class="ov-exp__value">
              {{ formatPlainNumber(status?.levelProgress?.current) }} / {{ status?.levelProgress?.needed ? formatPlainNumber(status.levelProgress.needed) : '?' }}
              <b>{{ Math.floor(getExpPercent(status?.levelProgress)) }}%</b>
            </span>
          </div>
          <div class="ov-exp__track">
            <div class="ov-exp__bar" :style="{ width: `${getExpPercent(status?.levelProgress)}%` }" />
          </div>
        </div>

        <div class="ov-account__foot">
          <span>本次经验/时 <b>{{ expRate }}</b></span>
          <LevelForecast v-if="isOnline" class="ov-forecast" :forecast="status?.levelForecast" />
        </div>
      </section>

      <!-- 资产 -->
      <section class="ov-card">
        <h3 class="ov-card__title">
          资产
        </h3>
        <div class="ov-tiles">
          <div class="ov-tile">
            <span class="ov-tile__label"><span class="i-fas-coins text-yellow-500" />金币</span>
            <strong class="ov-tile__value">{{ formatCompactAsset(status?.status?.gold) }}</strong>
            <small v-if="(status?.runGoldGained || 0) !== 0" class="ov-tile__delta" :class="(status?.runGoldGained || 0) > 0 ? 'is-up' : 'is-down'">
              本次 {{ (status?.runGoldGained || 0) > 0 ? '+' : '' }}{{ formatPlainNumber(status?.runGoldGained) }}
            </small>
          </div>
          <div class="ov-tile">
            <span class="ov-tile__label"><span class="i-fas-ticket-alt text-emerald-500" />点券</span>
            <strong class="ov-tile__value">{{ formatAssetAmount(status?.status?.coupon) }}</strong>
            <small v-if="(status?.runCouponGained || 0) !== 0" class="ov-tile__delta" :class="(status?.runCouponGained || 0) > 0 ? 'is-up' : 'is-down'">
              本次 {{ (status?.runCouponGained || 0) > 0 ? '+' : '' }}{{ formatPlainNumber(status?.runCouponGained) }}
            </small>
          </div>
          <div class="ov-tile">
            <span class="ov-tile__label"><span class="i-fas-seedling text-amber-500" />金豆豆</span>
            <strong class="ov-tile__value">{{ formatCompactAsset(status?.status?.goldBean) }}</strong>
          </div>
          <div class="ov-tile">
            <span class="ov-tile__label"><span class="i-fas-gem text-cyan-500" />钻石</span>
            <strong class="ov-tile__value">{{ formatAssetAmount(diamondBalance) }}</strong>
          </div>
        </div>
      </section>

      <!-- 库存：化肥容器与收藏点 -->
      <section class="ov-card">
        <h3 class="ov-card__title">
          库存
        </h3>
        <div class="ov-tiles">
          <div class="ov-tile">
            <span class="ov-tile__label"><span class="i-fas-flask text-emerald-500" />普通化肥</span>
            <strong class="ov-tile__value">{{ formatBucketTime(fertilizerNormal) }}</strong>
          </div>
          <div class="ov-tile">
            <span class="ov-tile__label"><span class="i-fas-vial text-emerald-500" />有机化肥</span>
            <strong class="ov-tile__value">{{ formatBucketTime(fertilizerOrganic) }}</strong>
          </div>
          <div class="ov-tile">
            <span class="ov-tile__label"><span class="i-fas-bookmark text-violet-400" />普通收藏点</span>
            <strong class="ov-tile__value">{{ formatPlainNumber(collectionNormal?.count) }}</strong>
          </div>
          <div class="ov-tile">
            <span class="ov-tile__label"><span class="i-fas-gem text-violet-400" />典藏收藏点</span>
            <strong class="ov-tile__value">{{ formatPlainNumber(collectionRare?.count) }}</strong>
          </div>
        </div>
      </section>
    </div>

    <!-- Main Content Flex -->
    <div class="flex flex-1 flex-col items-stretch gap-6 md:flex-row">
      <!-- Logs (Left Column) -->
      <div class="flex flex-1 flex-col gap-6 md:w-3/4">
        <!-- 运行日志（liyang 版布局：标题 + 四列筛选 + 紧凑日志行） -->
        <div class="flex flex-1 flex-col farm-card rounded-2xl bg-white p-5 shadow-md md:overflow-hidden dark:bg-gray-800">
          <div class="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <h3 class="flex shrink-0 items-center gap-2 whitespace-nowrap text-lg font-bold">
              <span class="i-carbon-document" /> <span>运行日志</span>
              <span class="dashboard-sync" :class="{ 'is-online': checksReady }"><span class="dashboard-sync-dot" />{{ syncLabel }}</span>
            </h3>

            <div class="log-filters">
              <BaseSelect v-model="filter.module" :options="modules" @change="onLogFilterChange" />
              <BaseSelect v-model="filter.event" :options="events" @change="onLogFilterChange" />
              <BaseSelect v-model="filter.level" :options="logLevels" @change="onLogFilterChange" />
              <BaseInput
                v-model="filter.keyword"
                placeholder="关键词"
                clearable
                @keyup.enter="onLogSearchTrigger"
                @clear="onLogSearchTrigger"
              />

              <div class="log-filters__buttons">
                <BaseButton
                  variant="primary"
                  class="log-filters__icon"
                  title="搜索日志"
                  aria-label="搜索日志"
                  @click="onLogSearchTrigger"
                >
                  <span class="i-carbon-search" />
                </BaseButton>

                <BaseButton
                  variant="secondary"
                  class="log-filters__icon"
                  title="清空日志"
                  aria-label="清空日志"
                  :loading="clearingLogs"
                  @click="clearLogs"
                >
                  <template #icon>
                    <span class="i-carbon-trash-can" />
                  </template>
                </BaseButton>
              </div>
            </div>
          </div>

          <div ref="logContainer" class="log-list max-h-[50vh] min-h-0 flex-1 overflow-y-auto" @scroll="onLogScroll">
            <div v-if="!displayLogs.length" class="py-8 text-center text-gray-400">
              {{ !currentAccountId ? '尚未选择账号' : hasActiveLogFilter ? '没有符合条件的日志' : '暂无日志' }}
            </div>
            <div
              v-for="log in displayLogs"
              :key="log.id"
              class="log-row"
              :class="`log-row--${log.level === 'info' ? 'success' : log.level}`"
            >
              <span class="log-row__time">{{ formatLogTimeRange(log) }}</span>
              <span class="log-row__tag">{{ log.tag }}</span>
              <span class="log-row__body">
                <span v-if="log.event && log.source !== 'account'" class="log-row__event">{{ getEventLabel(log.event) }}</span>
                <span class="log-row__msg">{{ log.msg }}</span>
                <span v-if="(log.repeatCount || 1) > 1" class="log-row__repeat" :title="`连续重复 ${log.repeatCount} 次`">
                  ×{{ log.repeatCount }}
                </span>
              </span>
            </div>

            <button
              v-if="pendingLogCount"
              type="button"
              class="dashboard-log-new"
              @click="scrollToBottom"
            >
              <div class="i-carbon-arrow-down" />
              {{ pendingLogCount }} 条新日志
            </button>
          </div>
        </div>
      </div>

      <!-- Right Column Stack -->
      <div class="min-w-0 flex flex-col gap-6 md:w-1/4 md:self-start">
        <!-- 下次检查倒计时：桌面副本的三环布局（农场 / 帮助 / 偷菜） -->
        <section class="farm-card rounded-2xl bg-white p-5 shadow-md dark:bg-gray-800">
          <h3 class="mb-3 flex items-center justify-between gap-2 text-lg font-display font-medium">
            <span class="flex items-center gap-2"><span class="i-carbon-hourglass" /> <span>下次检查倒计时</span></span>
            <span class="dashboard-sync" :class="{ 'is-online': checksReady }">
              <span class="dashboard-sync-dot" />{{ syncLabel }}
            </span>
          </h3>
          <div class="grid grid-cols-3 gap-2">
            <div
              v-for="check in countdowns"
              :key="check.key"
              class="min-w-0 flex flex-col items-center text-center"
            >
              <div
                class="h-18 w-18 flex items-center justify-center rounded-full p-1"
                :style="getCountdownRingStyle(check.progress, 100, check.key === 'farm' ? '#22c55e' : check.key === 'help' ? '#3b82f6' : '#f97316')"
              >
                <div class="h-full w-full flex flex-col items-center justify-center rounded-full bg-white dark:bg-gray-800">
                  <span :class="check.icon" class="text-xl" :style="{ color: check.key === 'farm' ? '#22c55e' : check.key === 'help' ? '#3b82f6' : '#f97316' }" aria-hidden="true" />
                  <span class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ check.label }}</span>
                </div>
              </div>
              <div class="mt-1.5 w-full truncate text-sm font-bold font-mono 2xl:text-base" :title="checksReady ? check.time : syncLabel">
                {{ checksReady ? check.time : '—' }}
              </div>
            </div>
          </div>
        </section>

        <!-- Operations Grid -->
        <div class="farm-card rounded-2xl bg-white p-5 shadow-md dark:bg-gray-800">
          <h3 class="mb-3 flex items-center justify-between gap-2 text-lg font-display font-medium">
            <span class="flex items-center gap-2"><span class="i-carbon-chart-column" /> <span>今日统计</span></span>
            <span class="text-xs text-gray-400 font-normal">{{ operationGroups.active.length }} 项有记录</span>
          </h3>
          <EmptyState
            v-if="!status?.connection?.connected"
            bare
            title="账号未登录"
            description="启动账号后显示今日收获与互动统计"
            icon="i-carbon-connection-signal-off"
          />
          <div v-else-if="!operationGroups.active.length && todayGoldGained === 0 && todayExpGained === 0 && todayGoldBeanGained === 0 && todayCouponGained === 0" class="flex flex-col items-center justify-center gap-1 py-6 text-center">
            <span class="i-carbon-sprout text-3xl text-gray-300 dark:text-gray-600" />
            <strong class="text-sm text-gray-700 dark:text-gray-200">等待第一份收获</strong>
            <p class="text-xs text-gray-400">
              本轮巡查完成后，主动作统计会在这里更新。
            </p>
          </div>
          <template v-else>
            <div class="grid grid-cols-2 mb-2 gap-2 2xl:gap-3" role="region" aria-label="今日金币、经验、金豆与点券增量">
              <div class="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 transition-transform hover:scale-105 dark:bg-gray-700/30">
                <div class="flex items-center gap-2">
                  <img src="/game-config/resource-icons/gold.png" alt="金币" class="h-5 w-5 object-contain 2xl:h-6 2xl:w-6" aria-hidden="true">
                  <div class="text-xs text-gray-500 2xl:text-sm">
                    金币
                  </div>
                </div>
                <div class="ov-today-gold text-sm font-bold 2xl:text-base" :class="{ 'is-down': todayGoldGained < 0 }">
                  {{ todayGoldGained }}
                </div>
              </div>
              <div class="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 transition-transform hover:scale-105 dark:bg-gray-700/30">
                <div class="flex items-center gap-2">
                  <span class="i-carbon-star-filled text-base text-sky-500 2xl:text-lg" aria-hidden="true" />
                  <div class="text-xs text-gray-500 2xl:text-sm">
                    经验
                  </div>
                </div>
                <div class="text-sm font-bold 2xl:text-base">
                  {{ todayExpGained }}
                </div>
              </div>
              <div class="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 transition-transform hover:scale-105 dark:bg-gray-700/30">
                <div class="flex items-center gap-2">
                  <img src="/game-config/resource-icons/gold-bean.png" alt="金豆" class="h-5 w-5 object-contain 2xl:h-6 2xl:w-6" aria-hidden="true">
                  <div class="text-xs text-gray-500 2xl:text-sm">
                    金豆
                  </div>
                </div>
                <div class="ov-today-value text-sm font-bold 2xl:text-base" :class="{ 'is-down': todayGoldBeanGained < 0 }">
                  {{ todayGoldBeanGained }}
                </div>
              </div>
              <div class="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 transition-transform hover:scale-105 dark:bg-gray-700/30">
                <div class="flex items-center gap-2">
                  <img src="/game-config/resource-icons/coupon.png" alt="点券" class="h-5 w-5 object-contain 2xl:h-6 2xl:w-6" aria-hidden="true">
                  <div class="text-xs text-gray-500 2xl:text-sm">
                    点券
                  </div>
                </div>
                <div class="ov-today-value text-sm font-bold 2xl:text-base" :class="{ 'is-down': todayCouponGained < 0 }">
                  {{ todayCouponGained }}
                </div>
              </div>
            </div>
            <div v-if="!operationGroups.active.length" class="flex flex-col items-center justify-center gap-1 py-4 text-center">
              <span class="i-carbon-sprout text-2xl text-gray-300 dark:text-gray-600" />
              <p class="text-xs text-gray-400">
                本轮巡查完成后，主动作统计会在这里更新。
              </p>
            </div>
            <div v-else class="grid grid-cols-2 gap-2 2xl:gap-3" role="region" aria-label="今日动作统计，可滚动查看">
              <div
                v-for="[key, val] in operationGroups.active"
                :key="key"
                class="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 transition-transform hover:scale-105 dark:bg-gray-700/30"
              >
                <div class="flex items-center gap-2">
                  <span class="select-none text-base 2xl:text-lg" :class="[getOpIcon(key), getOpColor(key)]" />
                  <div class="text-xs text-gray-500 2xl:text-sm">
                    {{ getOpName(key) }}
                  </div>
                </div>
                <div class="text-sm font-bold 2xl:text-base">
                  {{ val }}
                </div>
              </div>
            </div>
            <details v-if="operationGroups.inactive.length" class="mt-3">
              <summary class="flex cursor-pointer list-none items-center justify-between text-xs text-gray-400">
                <span>其余 {{ operationGroups.inactive.length }} 项暂无记录</span>
                <span class="i-carbon-chevron-down" aria-hidden="true" />
              </summary>
              <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
                <span v-for="[key, val] in operationGroups.inactive" :key="key">{{ getOpName(key) }} <b>{{ val }}</b></span>
              </div>
            </details>
          </template>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <AccountCareerModal
        :show="showCareerModal"
        :account="currentAccount"
        :profile="careerProfile"
        :items="careerItems"
        :loading="careerLoading"
        :error="careerError"
        @close="showCareerModal = false"
        @refresh="loadCareer"
      />
    </Teleport>
  </div>
</template>

<style scoped>
/* 自动巡查：沿用旧版 dashboard-check 结构与间距 */
.dashboard-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.dashboard-panel-heading h2 {
  color: var(--ui-ink);
  font-size: 16px;
  font-weight: var(--fw-600);
}

.dashboard-sync {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 7px;
  border-radius: 4px;
  color: var(--ui-muted);
  background: var(--ui-surface-soft);
  font-size: 12px;
  line-height: 16px;
}

.dashboard-sync.is-online {
  color: var(--theme-primary);
  background: color-mix(in srgb, var(--theme-primary) 12%, transparent);
}

.dashboard-sync-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 999px;
  background: currentColor;
}

.dashboard-check {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 0;
  border-top: 1px solid var(--ui-border);
}

.dashboard-panel-heading + .dashboard-check {
  margin-top: 10px;
  border-top: 0;
}

.dashboard-check:last-child {
  padding-bottom: 0;
}

.dashboard-check-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  color: var(--theme-primary);
  background: color-mix(in srgb, var(--theme-primary) 14%, var(--ui-surface));
  font-size: 22px;
}

.dashboard-check--help .dashboard-check-icon {
  color: #3c8fb5;
  background: color-mix(in srgb, #3c8fb5 14%, var(--ui-surface));
}

.dashboard-check--steal .dashboard-check-icon {
  color: #b8862f;
  background: color-mix(in srgb, #b8862f 16%, var(--ui-surface));
}

.dashboard-check--milk-tea .dashboard-check-icon {
  color: #b06a3c;
  background: color-mix(in srgb, #b06a3c 16%, var(--ui-surface));
}

.dashboard-check-info {
  min-width: 0;
  flex: 1;
}

.dashboard-check-info h3 {
  color: var(--ui-ink);
  font-size: 13px;
  font-weight: var(--fw-600);
}

.dashboard-check-info p {
  margin-top: 4px;
  color: var(--ui-muted);
  font-size: 12px;
}

.dashboard-check-time {
  max-width: 47%;
  color: var(--ui-ink);
  text-align: right;
  font-size: 17px;
  font-weight: var(--fw-700);
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.dashboard-check-progress {
  width: 78px;
  height: 3px;
  margin: 8px 0 0 auto;
  overflow: hidden;
  border-radius: 10px;
  background: var(--ui-surface-soft);
}

.dashboard-check-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--theme-primary);
  transition: width 0.3s linear;
}

.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

@media (min-width: 768px) {
  .overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ov-account {
    grid-column: 1 / -1;
  }
}

@media (min-width: 1280px) {
  .overview-grid {
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr);
  }

  .ov-account {
    grid-column: auto;
  }
}

.ov-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-card);
  background: var(--ui-surface);
  box-shadow:
    inset 0 1px 0 var(--glass-highlight),
    var(--ui-shadow-sm);
}

.ov-card__title {
  margin: 0;
  color: var(--ui-muted);
  font-size: 13px;
  font-weight: var(--fw-600);
  line-height: 1.4;
}

/* 账号 */
.ov-account__head {
  display: flex;
  align-items: center;
  gap: 14px;
}

/* 与牧场首页一致：圆形刷新钮顶对齐，不与头像/文案垂直居中而错位。 */
.ov-account__head > :deep(.n-button) {
  align-self: flex-start;
  margin-top: 6px;
}

/* 入口按钮随刷新钮一起下移一点，视觉上更贴合头像文字区的中线。 */
.ov-account__head > .ov-farm-entry {
  align-self: flex-start;
  margin-top: 6px;
}

/* 老版首页入口：一键进入我的农场 */
.ov-farm-entry {
  flex-shrink: 0;
}

/* 与右上角账号菜单、个人页弹窗的头像统一：正圆 + 一圈细描边。 */
.ov-avatar {
  position: relative;
  width: 52px;
  height: 52px;
  display: grid;
  flex: none;
  place-items: center;
  appearance: none;
  padding: 0;
  border: 0;
  border-radius: 999px;
  color: var(--ui-subtle);
  background: var(--ui-surface-soft);
  font-size: 26px;
  cursor: pointer;
  box-shadow: 0 0 0 1px var(--ui-border);
  transition: box-shadow 0.16s ease;
}

.ov-avatar:hover:not(:disabled) {
  box-shadow:
    0 0 0 1px var(--ui-border),
    0 0 0 3px color-mix(in srgb, var(--theme-primary) 45%, transparent);
}

.ov-avatar:focus-visible {
  outline: 2px solid var(--theme-primary);
  outline-offset: 2px;
}

.ov-avatar:disabled {
  cursor: default;
}

.ov-avatar img {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}

/* 正圆头像没有方角，状态点贴到右下 45° 的圆周上。 */
.ov-avatar__dot {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  border: 3px solid var(--ui-surface-strong);
  border-radius: 999px;
  background: var(--ui-subtle);
}

.ov-avatar.is-online .ov-avatar__dot {
  background: #3fa765;
}

.ov-account__name-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.ov-account__name {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-ink);
  font-size: 18px;
  font-weight: var(--fw-700);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ov-level {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  color: var(--ui-blue);
  background: var(--ui-blue-soft);
  font-size: 12px;
  font-weight: var(--fw-700);
  line-height: 20px;
  font-variant-numeric: tabular-nums;
}

.ov-presence {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin-top: 5px;
  color: var(--ui-muted);
  font-size: 12px;
}

/* PC 端默认与「在线」同处一行，整组不拆散；换行只由窄屏媒体查询触发。 */
.ov-presence__meta {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 4px 10px;
  min-width: 0;
}

.ov-presence__state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 1px 9px 1px 7px;
  border-radius: 999px;
  font-weight: var(--fw-600);
  line-height: 20px;
}

.ov-presence__state::before {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  content: '';
}

.ov-presence__state.is-online {
  color: var(--ui-primary);
  background: var(--ui-primary-soft);
}

.ov-presence__state.is-offline {
  color: var(--ui-muted);
  background: var(--ui-surface-soft);
}

.ov-presence__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}

.ov-exp__labels {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
  color: var(--ui-muted);
  font-size: 12px;
}

.ov-exp__value {
  font-variant-numeric: tabular-nums;
}

.ov-exp__value b {
  margin-left: 6px;
  color: var(--ui-ink);
  font-weight: var(--fw-700);
}

.ov-exp__track {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--ui-surface-soft);
}

.ov-exp__bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #5c9fd0, #4b86c5);
  transition: width 0.5s ease;
}

.ov-account__foot {
  display: grid;
  gap: 4px;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px dashed var(--ui-border-strong);
  color: var(--ui-muted);
  font-size: 12px;
}

.ov-account__foot b {
  color: var(--ui-ink);
  font-weight: var(--fw-600);
  font-variant-numeric: tabular-nums;
}

.ov-forecast {
  margin-top: 0 !important;
}

/* 资产 / 库存数据格 */
.ov-tiles {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.ov-tile {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: flex-start;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--ui-surface-soft);
}

.ov-tile__label {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  color: var(--ui-muted);
  font-size: 12px;
  white-space: nowrap;
}

.ov-tile__label > span {
  flex: none;
  font-size: 13px;
}

.ov-tile__value {
  overflow: hidden;
  color: var(--ui-ink);
  font-size: 20px;
  font-weight: var(--fw-700);
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ov-tile__delta {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.ov-tile__delta.is-up {
  color: var(--ui-primary);
}

.ov-tile__delta.is-down {
  color: var(--ui-danger);
}

/* 今日统计金币净增为负时，与资产「本次运行金币」用同一个负向色。 */
.ov-today-gold.is-down {
  color: var(--ui-danger);
}

/* 金豆 / 点券净增为负时沿用同一个负向色，四张卡片配色保持一致。 */
.ov-today-value.is-down {
  color: var(--ui-danger);
}

@media (max-width: 520px) {
  .ov-card {
    padding: 16px;
  }

  .ov-tile {
    padding: 10px 12px;
  }

  .ov-tile__value {
    font-size: clamp(15px, 4.5vw, 18px);
  }
}

.dashboard-logs {
  container-name: runtime-log;
  container-type: inline-size;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}

.dashboard-log-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding: 10px 14px;
}

.dashboard-log-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.dashboard-log-heading > span:first-child {
  color: var(--theme-primary);
  font-size: 19px;
}

.dashboard-log-heading h3 {
  font-size: 15px;
  font-weight: 650;
}

.dashboard-log-sync {
  margin-left: 3px;
  color: var(--ui-muted);
  font-size: 12px;
}

.dashboard-log-tools {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.dashboard-log-tools :deep(button) {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 5px;
}

.dashboard-log-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 32px;
  align-items: center;
  gap: 6px;
  padding: 0 14px 10px;
}

.dashboard-log-search {
  grid-column: 1 / -1;
}

.dashboard-log-toolbar > * {
  min-width: 0;
}

.dashboard-log-toolbar :deep(.base-input),
.dashboard-log-toolbar :deep(.base-select-trigger) {
  border-radius: 5px;
  min-height: 36px;
  font-size: 13px;
}

.dashboard-log-toolbar > :deep(button) {
  padding: 0;
  width: 32px;
  height: 32px;
}

.dashboard-log-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding: 7px 14px;
  border-top: 1px solid var(--surface-border);
  background: var(--surface-2);
  font-size: 12px;
  color: var(--ui-muted);
  font-variant-numeric: tabular-nums;
}

.dashboard-log-summary strong {
  margin-left: 5px;
  color: var(--ui-ink);
  font-weight: 600;
}

.dashboard-log-levels {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.dashboard-log-levels > span,
.dashboard-log-follow {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.dashboard-log-levels b {
  font-weight: 500;
}

.dashboard-log-levels i,
.dashboard-log-follow i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #8d9a8a;
}

.dashboard-log-level--warn i {
  background: #c48a27;
}

.dashboard-log-level--error i {
  background: #cc6262;
}

.dashboard-log-columns,
.dashboard-log-row {
  display: grid;
  grid-template-columns: 78px minmax(75px, 100px) minmax(0, 1fr);
  gap: 8px;
}

.dashboard-log-columns {
  padding: 5px 14px 5px 17px;
  border-block: 1px solid var(--surface-border);
  font-size: 12px;
  color: var(--ui-muted);
}

.dashboard-log-scroll {
  position: relative;
  max-height: 420px;
  min-height: 160px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  background: var(--surface-1);
}

.dashboard-log-row {
  align-items: baseline;
  padding: 6px 14px;
  border-bottom: 1px solid #eaf0e4;
  border-left: 3px solid transparent;
  font-size: 13px;
}

.dark .dashboard-log-row {
  border-bottom-color: rgb(255 255 255 / 6%);
}

.dashboard-log-row:nth-child(even) {
  background: #f6f9f24d;
}

.dashboard-log-row:hover {
  background: #f0f6eb;
}

.dashboard-log-row[data-level='warn'] {
  border-left-color: #d4a349;
  background: #fff9ea;
}

.dashboard-log-row[data-level='error'] {
  border-left-color: #d67878;
  background: #fff2ef;
}

.dashboard-log-time {
  color: var(--ui-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
  line-height: 1.8;
}

.dashboard-log-meta {
  display: flex;
  min-width: 0;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 5px;
}

.dashboard-log-tag {
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.dashboard-log-event {
  color: var(--ui-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.dashboard-log-message {
  min-width: 0;
  margin: 0;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.dashboard-log-severity {
  display: inline-flex;
  vertical-align: -2px;
  color: #b68027;
  margin-right: 2px;
}

.dashboard-log-row[data-level='error'] .dashboard-log-severity {
  color: #c45d58;
}

.dashboard-log-repeat {
  display: inline-block;
  margin-left: 6px;
  padding: 0 5px;
  border: 1px solid var(--surface-border);
  border-radius: 3px;
  color: var(--ui-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.dashboard-log-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 160px;
  color: var(--ui-muted);
  font-size: 12px;
}

.dashboard-log-empty > span {
  font-size: 30px;
  opacity: 0.5;
}

.dashboard-log-new {
  position: sticky;
  bottom: 12px;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  width: max-content;
  max-width: calc(100% - 24px);
  margin: 8px auto;
  padding: 8px 14px;
  border-radius: 6px;
  background: var(--theme-primary);
  color: white;
  font-size: 12px;
  box-shadow: 0 3px 10px rgb(35 85 46 / 18%);
}

.dashboard-log-footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 14px;
  border-top: 1px solid var(--surface-border);
  color: var(--ui-muted);
  font-size: 12px;
}

.dashboard-log-follow.is-following i {
  background: var(--theme-primary);
}

.dashboard-log-footer button {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  color: var(--theme-primary);
}

.dashboard-log-footer button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dashboard-log-scroll:focus-visible {
  outline: 2px solid var(--theme-primary);
  outline-offset: -2px;
}

@container runtime-log (min-width: 640px) {
  .dashboard-log-toolbar {
    grid-template-columns: minmax(160px, 1fr) 120px 140px 32px;
  }

  .dashboard-log-search {
    grid-column: auto;
  }
}

@media (max-width: 639px) {
  /* 手机端文字是三行（名称 / 在线 / 已运行），实测高 71.8px；
     PC 端两行 51.3px 对应 52px 头像，PC 端保持原样。
     这里只在手机端把头像等比放大到 72px，与三行文字等高，仍是正圆。 */
  .ov-account__head {
    --ov-avatar-size: 72px;
    gap: 10px;
  }

  .ov-avatar {
    width: var(--ov-avatar-size);
    height: var(--ov-avatar-size);
    font-size: 34px;
  }

  /* 圆周变大，在线点同步内移，仍落在右下 45° 圆周上。 */
  .ov-avatar__dot {
    right: 3px;
    bottom: 3px;
  }

  .ov-account__info {
    min-height: var(--ov-avatar-size);
  }

  /* 头像变宽后文字区变窄：收紧间距、禁止「已运行」被挤成第四行，
     让文字块高度稳定在 72px，头像与文字始终等高。 */
  .ov-presence {
    column-gap: 6px;
  }

  .ov-presence__item {
    white-space: nowrap;
  }

  /* 手机端：「在线」占第一行，「已运行 + 平台标签」整组落到下面一行；
     PC 端不触发，仍与在线图标同处一行。字号略缩，保证跨天时长也能完整一行显示。 */
  .ov-presence__meta {
    flex: 0 0 100%;
    column-gap: 6px;
    overflow: hidden;
    font-size: 11px;
  }

  .dashboard-log-scroll {
    height: 430px;
    max-height: 430px;
  }

  .dashboard-log-header {
    padding: 12px;
  }

  /* 手机端筛选栏：搜索独占第一行，模块筛选与重置按钮同行，
     「筛选事件」下拉独占整行。原来两个下拉挤在 1fr/1fr/32px 三列里，
     「所有事件」等选项文字会被省略号截断，这里给它完整宽度。 */
  .dashboard-log-toolbar {
    grid-template-columns: minmax(0, 1fr) 32px;
    gap: 8px;
    padding: 0 12px 12px;
  }

  .dashboard-log-search {
    grid-row: 1;
    grid-column: 1 / -1;
  }

  .dashboard-log-module {
    grid-row: 2;
    grid-column: 1;
  }

  /* 手机端「所有事件」与上面的「所有模块」同列同宽；PC 端布局不受影响。 */
  .dashboard-log-event {
    grid-row: 3;
    grid-column: 1;
  }

  .dashboard-log-reset {
    grid-row: 2;
    grid-column: 2;
    justify-self: end;
  }

  .dashboard-log-summary {
    padding: 9px 12px;
  }

  .dashboard-log-columns {
    display: none;
  }

  .dashboard-log-row {
    grid-template-columns: 94px minmax(0, 1fr);
    gap: 6px 10px;
    padding: 12px;
  }

  .dashboard-log-message {
    grid-column: 1 / -1;
  }

  .dashboard-log-footer {
    padding: 8px 12px;
  }
}

/* ── 运行日志（liyang 版样式）──────────────────────────────────────── */
.log-filters {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.log-filters__buttons {
  display: flex;
  grid-column: 1 / -1;
  justify-content: flex-end;
  gap: 8px;
}

.log-filters__icon {
  width: 38px;
  min-width: 38px;
  height: 38px;
  padding: 0 !important;
}

@media (min-width: 640px) {
  .log-filters {
    grid-template-columns: repeat(4, minmax(0, 8.5rem)) auto;
    align-items: center;
  }

  .log-filters__buttons {
    grid-column: auto;
  }
}

.log-list {
  padding: 6px;
  border-radius: var(--ui-radius-control);
  background: var(--ui-surface-soft);
  font-size: 13px;
  line-height: 1.55;
}

.log-row {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: baseline;
  gap: 10px;
  padding: 5px 8px 5px 10px;
  border-left: 3px solid transparent;
  border-radius: 6px;
  content-visibility: auto;
  contain-intrinsic-size: auto 28px;
}

.log-row + .log-row {
  margin-top: 2px;
}

.log-row__time {
  color: var(--ui-subtle);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  white-space: nowrap;
  user-select: none;
}

.log-row__tag {
  min-width: 2.5em;
  color: var(--ui-muted);
  font-size: 12px;
  font-weight: var(--fw-600);
  white-space: nowrap;
}

.log-row__body {
  min-width: 0;
  color: var(--ui-ink);
  overflow-wrap: anywhere;
}

.log-row__event {
  margin-right: 6px;
  color: var(--ui-muted);
  font-size: 12px;
}

.log-row__event::after {
  margin-left: 6px;
  color: var(--ui-subtle);
  content: '·';
}

.log-row__repeat {
  display: inline-block;
  margin-left: 8px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--ui-surface-strong);
  color: var(--ui-muted);
  font-size: 11px;
  white-space: nowrap;
}

.log-row--success {
  border-left-color: var(--ui-primary);
}

.log-row--warn {
  border-left-color: var(--ui-warning);
  background: color-mix(in srgb, var(--ui-warning-soft) 70%, transparent);
}

.log-row--warn .log-row__tag {
  color: var(--ui-warning);
}

.log-row--error {
  border-left-color: var(--ui-danger);
  background: color-mix(in srgb, var(--ui-danger-soft) 80%, transparent);
}

.log-row--error .log-row__tag,
.log-row--error .log-row__msg {
  color: var(--ui-danger);
}

@media (max-width: 640px) {
  .log-row {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 2px 8px;
  }

  .log-row__body {
    grid-column: 1 / -1;
  }
}
</style>
