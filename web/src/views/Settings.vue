<script setup lang="ts">
import { NButton } from 'naive-ui/es/button'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api, { getApiErrorMessage } from '@/api'
import AccountFeatureSettings from '@/components/settings/AccountFeatureSettings.vue'
import AccountManagementPanel from '@/components/settings/AccountManagementPanel.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useAccountStore } from '@/stores/account'
import { useSettingStore } from '@/stores/setting'
import { useUserStore } from '@/stores/user'
import { parseHourOfDay } from '@/utils/hour-of-day'

const fertilizerLandTypeOptions = [
  { label: '蓝晶土地', value: 'blue-crystal' },
  { label: '紫金土地', value: 'purple-gold' },
  { label: '金土地', value: 'gold' },
  { label: '黑土地', value: 'black' },
  { label: '红土地', value: 'red' },
  { label: '普通土地', value: 'normal' },
]

const router = useRouter()
const route = useRoute()
const accountStore = useAccountStore()
const userStore = useUserStore()
const settingStore = useSettingStore()

type SettingsTab = 'account' | 'account-config' | 'notification' | 'system-settings' | 'system'
const settingsTabKeys: SettingsTab[] = ['account', 'account-config', 'notification', 'system-settings', 'system']
// 旧标签仍可能出现在收藏夹或外部链接里，统一折到新分类上。
const LEGACY_TAB_ALIAS: Record<string, SettingsTab> = {
  'strategy': 'account-config',
  'automation': 'account-config',
  'default-plan': 'account-config',
  'user': 'notification',
  'capture': 'system',
}
function normalizeTab(value: string): SettingsTab | null {
  if (LEGACY_TAB_ALIAS[value])
    return LEGACY_TAB_ALIAS[value]
  return settingsTabKeys.includes(value as SettingsTab) ? value as SettingsTab : null
}
const storedTab = localStorage.getItem('settings-active-tab') || ''
const queryTab = String(route.query.tab || '')
const initialTab = normalizeTab(queryTab) || normalizeTab(storedTab) || 'account'
const activeTab = ref<SettingsTab>(initialTab)
const tabsNav = ref<HTMLElement | null>(null)

watch(activeTab, (newTab) => {
  localStorage.setItem('settings-active-tab', newTab)
  if (String(route.query.tab || '') !== newTab) {
    router.replace({
      query: { ...route.query, tab: newTab },
    })
  }
  void scrollActiveTabIntoView()
})

watch(() => route.query.tab, (value) => {
  const nextTab = normalizeTab(String(value || ''))
  if (nextTab && nextTab !== activeTab.value)
    activeTab.value = nextTab
})

const tabs = [
  { key: 'account', label: '账号管理', icon: 'i-carbon-user-settings' },
  { key: 'account-config', label: '账号设置', icon: 'i-carbon-settings-adjust' },
  { key: 'notification', label: '通知设置', icon: 'i-carbon-notification' },
  { key: 'system-settings', label: '全局设置', icon: 'i-carbon-settings' },
  { key: 'system', label: '连接与设备', icon: 'i-carbon-settings-services' },
] as const

async function scrollActiveTabIntoView() {
  await nextTick()
  const button = tabsNav.value?.querySelector<HTMLElement>(`[data-settings-tab="${activeTab.value}"]`)
  button?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
}

const modalVisible = ref(false)
const modalConfig = ref({
  title: '',
  message: '',
  type: 'primary' as 'primary' | 'danger',
  isAlert: true,
})

function showAlert(message: string, type: 'primary' | 'danger' = 'primary') {
  modalConfig.value = {
    title: type === 'danger' ? '错误' : '提示',
    message,
    type,
    isAlert: true,
  }
  modalVisible.value = true
}

// ==================== 账号管理 ====================
const { accounts, currentAccountId } = storeToRefs(accountStore)

const currentAccountName = computed(() => {
  const acc = accounts.value.find((a: any) => a.id === currentAccountId.value)
  return acc ? (acc.name || acc.nick || acc.id) : null
})

function openAccountSettings(account: any) {
  if (account?.id)
    accountStore.selectAccount(String(account.id))
  activeTab.value = 'account-config'
}

onMounted(async () => {
  await accountStore.fetchAccounts()
  if (!currentAccountId.value && accounts.value.length > 0 && accounts.value[0]) {
    accountStore.selectAccount(String(accounts.value[0].id))
  }
  if (currentAccountId.value)
    await loadStrategyData(currentAccountId.value)
  await Promise.all([loadSystemConfig(), loadDevicePresets()])
  await scrollActiveTabIntoView()
})

// ==================== 账号设置（策略 + 功能模块） ====================
const { settings, loading: settingsLoading, loadedAccountId } = storeToRefs(settingStore)
const automationSaving = ref(false)

const localStrategySettings = ref({
  plantingStrategy: 'max_exp',
  preferredSeedId: 0,
  bagSeedPriority: [] as number[],
  bagSeedMultiLandReservationEnabled: false,
  bagSeedLandTypes: {} as Record<string, string[]>,
  bagSeedFallbackStrategy: 'level',
  prioritize2x2Crops: true,
  stealDelaySeconds: 0,
  plantOrderRandom: false,
  plantDelaySeconds: 0,
  intervals: { farmMin: 20, farmMax: 25, friendMin: 30, friendMax: 35 },
  friendQuietHours: { enabled: false, start: '23:00', end: '07:00', continueFarm: true },
})

const plantingStrategyOptions = [
  { label: '优先种植种子', value: 'preferred' },
  { label: '最高等级作物', value: 'level' },
  { label: '最大经验/时', value: 'max_exp' },
  { label: '最大普通肥经验/时', value: 'max_fert_exp' },
  { label: '最大净利润/时', value: 'max_profit' },
  { label: '最大普通肥净利润/时', value: 'max_fert_profit' },
  { label: '背包种子优先', value: 'bag_priority' },
]

const BAG_FALLBACK_STRATEGY_OPTIONS = [
  { label: '最高等级作物', value: 'level' },
  { label: '最大经验/时', value: 'max_exp' },
  { label: '最大普通肥经验/时', value: 'max_fert_exp' },
  { label: '最大净利润/时', value: 'max_profit' },
  { label: '最大普通肥净利润/时', value: 'max_fert_profit' },
  { label: '优先种植种子', value: 'preferred' },
]

function syncLocalStrategySettings() {
  if (settings.value) {
    localStrategySettings.value = JSON.parse(JSON.stringify({
      plantingStrategy: settings.value.plantingStrategy,
      preferredSeedId: settings.value.preferredSeedId,
      bagSeedPriority: settings.value.bagSeedPriority ?? [],
      bagSeedMultiLandReservationEnabled: !!settings.value.bagSeedMultiLandReservationEnabled,
      bagSeedLandTypes: settings.value.bagSeedLandTypes ?? {},
      bagSeedFallbackStrategy: settings.value.bagSeedFallbackStrategy ?? 'level',
      prioritize2x2Crops: !!settings.value.prioritize2x2Crops,
      stealDelaySeconds: settings.value.stealDelaySeconds ?? 0,
      plantOrderRandom: !!settings.value.plantOrderRandom,
      plantDelaySeconds: settings.value.plantDelaySeconds ?? 0,
      intervals: settings.value.intervals,
      friendQuietHours: {
        enabled: false,
        start: '23:00',
        end: '07:00',
        continueFarm: true,
        ...(settings.value.friendQuietHours || {}),
      },
    }))
  }
}

async function loadStrategyData(accountId = currentAccountId.value) {
  if (!accountId)
    return
  const loaded = await settingStore.fetchSettings(accountId)
  if (!loaded || accountId !== currentAccountId.value)
    return
  syncLocalStrategySettings()
  syncLocalAutomationSettings()
  syncLocalOfflineSettings()
}

watch(currentAccountId, (accountId) => {
  automationSaving.value = false
  if (accountId)
    loadStrategyData(accountId)
})

// ==================== 自动控制 ====================
const allFertilizerLandTypes = ['blue-crystal', 'purple-gold', 'gold', 'black', 'red', 'normal']
const defaultFertilizerLandTypes = allFertilizerLandTypes.filter(type => type !== 'blue-crystal')

function normalizeFertilizerLandTypes(input: unknown) {
  const source = Array.isArray(input) ? input : defaultFertilizerLandTypes
  const normalized: string[] = []
  for (const item of source) {
    const value = String(item || '').trim().toLowerCase()
    if (!allFertilizerLandTypes.includes(value))
      continue
    if (normalized.includes(value))
      continue
    normalized.push(value)
  }
  return normalized
}

const localAutomationSettings = ref({
  automation: {
    farm: false,
    farm_harvest_tiangong: true,
    task: false,
    sell: true,
    friend: false,
    friend_auto_accept: true,
    farm_push: false,
    land_upgrade: true,
    friend_steal: false,
    friend_help: false,
    friend_bad: true,
    friend_help_exp_limit: false,
    friend_help_protect_dog_ignore_exp_limit: true,
    fertilizer_gift: false,
    fertilizer_buy_organic: false,
    fertilizer_buy_normal: false,
    mystery_shop_auto_buy: false,
    mystery_shop_allow_gold: true,
    mystery_shop_allow_coupon: false,
    mystery_shop_allow_gold_bean: false,
    mystery_shop_allow_diamond: false,
    mystery_shop_arrival_notify: false,
    mystery_shop_purchase_notify: false,
    fertilizer: 'normal',
    skip_own_weed_bug: false,
    fertilizer_multi_season: false,
    fertilizer_land_types: [...defaultFertilizerLandTypes],
    fertilizer_smart_seconds: 300,
    show_manual_fertilizer: true,
    pet_feed_dog_food: true,
    pet_feed_dog_food_auto_buy: true,
  },
  fertilizerBuyOrganicCount: 10,
  fertilizerBuyOrganicThresholdHours: 10,
  fertilizerBuyNormalCount: 10,
  fertilizerBuyNormalThresholdHours: 10,
  fertilizerBuyCheckIntervalMinutes: 30,
  emailClaimHour: 10 as number | string,
  goldenBugKeepCount: 0,
  goldenBugRoundLimit: 24,
  autoAcceptFriendMinLevel: 0,
  autoAcceptRequireOwnLevel: false,
  autoAcceptHarvestStealEnabled: true,
  autoAcceptHarvestStealHarvest: 8,
  autoAcceptHarvestStealSteal: 1,
})

const fertilizerOptions = [
  { label: '普通 + 有机', value: 'both' },
  { label: '普通 + 快成熟有机', value: 'smart' },
  { label: '仅普通化肥', value: 'normal' },
  { label: '仅有机化肥', value: 'organic' },
  { label: '不施肥', value: 'none' },
]

function syncLocalAutomationSettings() {
  if (settings.value) {
    if (!settings.value.automation) {
      localAutomationSettings.value.automation = {
        farm: false,
        farm_harvest_tiangong: true,
        task: false,
        sell: false,
        friend: false,
        friend_auto_accept: true,
        farm_push: false,
        land_upgrade: false,
        friend_steal: false,
        friend_help: false,
        friend_bad: false,
        friend_help_exp_limit: false,
        friend_help_protect_dog_ignore_exp_limit: true,
        fertilizer_gift: false,
        fertilizer_buy_organic: false,
        fertilizer_buy_normal: false,
        mystery_shop_auto_buy: false,
        mystery_shop_allow_gold: true,
        mystery_shop_allow_coupon: false,
        mystery_shop_allow_gold_bean: false,
        mystery_shop_allow_diamond: false,
        mystery_shop_arrival_notify: false,
        mystery_shop_purchase_notify: false,
        fertilizer: 'none',
        skip_own_weed_bug: false,
        fertilizer_multi_season: false,
        fertilizer_land_types: [...allFertilizerLandTypes],
        fertilizer_smart_seconds: 300,
        show_manual_fertilizer: true,
        pet_feed_dog_food: true,
        pet_feed_dog_food_auto_buy: true,
      }
    }
    else {
      const defaults = {
        farm: false,
        farm_harvest_tiangong: true,
        task: false,
        sell: false,
        friend: false,
        friend_auto_accept: true,
        farm_push: false,
        land_upgrade: false,
        friend_steal: false,
        friend_help: false,
        friend_bad: false,
        friend_help_exp_limit: false,
        friend_help_protect_dog_ignore_exp_limit: true,
        fertilizer_gift: false,
        fertilizer_buy_organic: false,
        fertilizer_buy_normal: false,
        mystery_shop_auto_buy: false,
        mystery_shop_allow_gold: true,
        mystery_shop_allow_coupon: false,
        mystery_shop_allow_gold_bean: false,
        mystery_shop_allow_diamond: false,
        mystery_shop_arrival_notify: false,
        mystery_shop_purchase_notify: false,
        fertilizer: 'none',
        skip_own_weed_bug: false,
        fertilizer_multi_season: false,
        fertilizer_land_types: [...allFertilizerLandTypes],
        fertilizer_smart_seconds: 300,
        show_manual_fertilizer: true,
        pet_feed_dog_food: true,
        pet_feed_dog_food_auto_buy: true,
      }
      localAutomationSettings.value.automation = {
        ...defaults,
        ...settings.value.automation,
      }
    }
    localAutomationSettings.value.automation.fertilizer_land_types = normalizeFertilizerLandTypes(localAutomationSettings.value.automation.fertilizer_land_types)
    if (localAutomationSettings.value.automation.fertilizer_smart_seconds === undefined) {
      localAutomationSettings.value.automation.fertilizer_smart_seconds = 300
    }
    if (localAutomationSettings.value.automation.show_manual_fertilizer === undefined) {
      localAutomationSettings.value.automation.show_manual_fertilizer = true
    }
    localAutomationSettings.value.fertilizerBuyOrganicCount = settings.value.fertilizerBuyOrganicCount ?? 10
    localAutomationSettings.value.fertilizerBuyOrganicThresholdHours = settings.value.fertilizerBuyOrganicThresholdHours ?? 10
    localAutomationSettings.value.fertilizerBuyNormalCount = settings.value.fertilizerBuyNormalCount ?? 10
    localAutomationSettings.value.fertilizerBuyNormalThresholdHours = settings.value.fertilizerBuyNormalThresholdHours ?? 10
    localAutomationSettings.value.fertilizerBuyCheckIntervalMinutes = settings.value.fertilizerBuyCheckIntervalMinutes ?? 30
    localAutomationSettings.value.emailClaimHour = settings.value.emailClaimHour ?? 10
    localAutomationSettings.value.goldenBugKeepCount = settings.value.goldenBugKeepCount ?? 0
    localAutomationSettings.value.goldenBugRoundLimit = settings.value.goldenBugRoundLimit ?? 24
    localAutomationSettings.value.autoAcceptFriendMinLevel = settings.value.autoAcceptFriendMinLevel ?? 0
    localAutomationSettings.value.autoAcceptRequireOwnLevel = settings.value.autoAcceptRequireOwnLevel ?? false
    localAutomationSettings.value.autoAcceptHarvestStealEnabled = settings.value.autoAcceptHarvestStealEnabled ?? true
    localAutomationSettings.value.autoAcceptHarvestStealHarvest = settings.value.autoAcceptHarvestStealHarvest ?? 8
    localAutomationSettings.value.autoAcceptHarvestStealSteal = settings.value.autoAcceptHarvestStealSteal ?? 1
  }
}

// ==================== 功能模块（旧版六模块） ====================
// 功能模块里既改 automation，也改部分策略字段（策略、巡查间隔、静默时段），
// 所以保存时把两份模型合并成一次请求，避免用户切换标签后改动丢失。
async function handleFeatureModuleSave(_module?: string, quiet?: boolean): Promise<boolean> {
  const accountId = currentAccountId.value
  if (!accountId)
    return false
  // 邮箱时刻只收 0–23 的整点：输入框会保留非法草稿（清空后是空串），
  // 后端 assertEmailClaimHour 对这份快照是硬校验，抛错会让整批设置一起不生效，
  // 所以显式保存必须在本地拦住，别发出去。
  const emailClaimHour = parseHourOfDay(localAutomationSettings.value.emailClaimHour)
  if (emailClaimHour === null && !quiet) {
    showAlert('「自动邮箱领取」时间需填写 0–23 的整数（时），改好后请再点一次保存。', 'danger')
    return false
  }
  automationSaving.value = true
  try {
    const payload: any = {
      ...JSON.parse(JSON.stringify(localStrategySettings.value)),
      ...JSON.parse(JSON.stringify(localAutomationSettings.value)),
    }
    // 归一成数字再发；合法草稿可能是字符串 '10'。
    payload.emailClaimHour = emailClaimHour
    if (payload.automation?.fertilizer_land_types) {
      payload.automation.fertilizer_land_types = normalizeFertilizerLandTypes(payload.automation.fertilizer_land_types)
    }
    if (payload.plantingStrategy === 'bag_priority') {
      // 顺序由弹窗里的背包排序组件维护，这里只做去重与非法值收敛，不再重排。
      payload.bagSeedPriority = [...new Set<number>((payload.bagSeedPriority || [])
        .map(Number)
        .filter((id: number) => Number.isFinite(id) && id > 0))]
    }
    // quiet（拨卡片开关）时非法草稿不应把整批开关堵死：这里置成 null，
    // store 的兜底会就地剔除这一个字段，其余设置照常保存，成功后回填会顺手修正草稿。
    const res = await settingStore.saveSettings(accountId, payload)
    if (accountId !== currentAccountId.value)
      return false
    if (res.ok) {
      syncLocalStrategySettings()
      syncLocalAutomationSettings()
      // 卡片开关的 emit('save', key, true) 是静默保存，不该每次拨动都弹模态框。
      if (!quiet)
        showAlert('功能模块设置已保存', 'primary')

      if (payload.automation?.fertilizer_buy_organic || payload.automation?.fertilizer_buy_normal) {
        try {
          await api.post('/api/fertilizer/check-and-buy', {
            buyOrganic: payload.automation.fertilizer_buy_organic,
            buyNormal: payload.automation.fertilizer_buy_normal,
            organicCount: payload.fertilizerBuyOrganicCount,
            organicThresholdHours: payload.fertilizerBuyOrganicThresholdHours,
            normalCount: payload.fertilizerBuyNormalCount,
            normalThresholdHours: payload.fertilizerBuyNormalThresholdHours,
          }, {
            headers: { 'x-account-id': accountId },
          })
        }
        catch (e) {
          console.error('检测购买化肥失败', e)
        }
      }
      return true
    }
    else {
      const message = res.unconfirmed && res.saved
        ? `设置已保存，但运行进程尚未确认应用：${res.error || '请稍后重试或重启账号'}`
        : `保存失败: ${res.error}`
      showAlert(message, res.unconfirmed && res.saved ? 'primary' : 'danger')
      return false
    }
  }
  finally {
    if (accountId === currentAccountId.value)
      automationSaving.value = false
  }
}

// 「保存并关闭」要等结果：校验失败时留在弹窗里让用户就地改，别把编辑上下文销毁。
function onFeatureModuleSave(module?: string, quiet?: boolean, done?: (ok: boolean) => void): void {
  handleFeatureModuleSave(module, quiet)
    .then(ok => done?.(ok))
    .catch(() => done?.(false))
}

// ==================== 系统设置 ====================
const passwordSaving = ref(false)
const offlineSaving = ref(false)
const offlineTesting = ref(false)

const passwordForm = ref({
  old: '',
  new: '',
  confirm: '',
})

const localOffline = ref({
  channel: 'webhook',
  endpoint: '',
  token: '',
  secret: '',
  title: '',
  msg: '',
  offlineDeleteSec: 0,
})

const channelOptions = [
  { label: 'Webhook(自定义接口)', value: 'webhook' },
  { label: 'Qmsg 酱', value: 'qmsg' },
  { label: 'Server 酱', value: 'serverchan' },
  { label: 'Push Plus', value: 'pushplus' },
  { label: 'Push Plus Hxtrip', value: 'pushplushxtrip' },
  { label: '钉钉', value: 'dingtalk' },
  { label: '企业微信', value: 'wecom' },
  { label: 'Bark', value: 'bark' },
  { label: 'Go-cqhttp', value: 'gocqhttp' },
  { label: 'OneBot', value: 'onebot' },
  { label: 'Atri', value: 'atri' },
  { label: 'PushDeer', value: 'pushdeer' },
  { label: 'iGot', value: 'igot' },
  { label: 'Telegram', value: 'telegram' },
  { label: '飞书', value: 'feishu' },
  { label: 'IFTTT', value: 'ifttt' },
  { label: '企业微信群机器人', value: 'wecombot' },
  { label: 'Discord', value: 'discord' },
  { label: 'WxPusher', value: 'wxpusher' },
  { label: 'MeoW', value: 'meow' },
]

const CHANNEL_DOCS: Record<string, string> = {
  webhook: '',
  qmsg: 'https://qmsg.zendee.cn/',
  serverchan: 'https://sct.ftqq.com/',
  pushplus: 'https://www.pushplus.plus/',
  pushplushxtrip: 'https://pushplus.hxtrip.com/',
  dingtalk: 'https://open.dingtalk.com/document/orgapp/customize-robot-security-settings',
  wecom: 'https://guole.fun/posts/626/',
  wecombot: 'https://developer.work.weixin.qq.com/document/path/91770',
  bark: 'https://github.com/Finb/Bark',
  gocqhttp: 'https://docs.go-cqhttp.org/api/',
  onebot: 'https://docs.go-cqhttp.org/api/',
  atri: 'https://blog.tianli0.top/',
  pushdeer: 'https://www.pushdeer.com/',
  igot: 'https://push.hellyw.com/',
  telegram: 'https://core.telegram.org/bots',
  feishu: 'https://www.feishu.cn/hc/zh-CN/articles/360024984973',
  ifttt: 'https://ifttt.com/maker_webhooks',
  discord: 'https://discord.com/developers/docs/resources/webhook#execute-webhook',
  wxpusher: 'https://wxpusher.zjiecode.com/docs/#/',
  meow: 'https://www.chuckfang.com/MeoW/api_doc.html',
}

const offlineChannel = computed(() => String(localOffline.value.channel || '').trim().toLowerCase())
const isDingTalkChannel = computed(() => offlineChannel.value === 'dingtalk')
const isMeowChannel = computed(() => offlineChannel.value === 'meow')
const offlineChannelUsesEndpoint = computed(() => offlineChannel.value === 'webhook' || isDingTalkChannel.value)
const offlineEndpointLabel = computed(() => isDingTalkChannel.value ? 'Webhook 地址' : '接口地址')
const offlineEndpointPlaceholder = computed(() => isDingTalkChannel.value
  ? '从钉钉群机器人设置页复制完整 Webhook'
  : '接收消息的接口地址')
const offlineTokenLabel = computed(() => isMeowChannel.value ? '昵称' : 'Token')
const offlineTokenPlaceholder = computed(() => isMeowChannel.value
  ? 'MeoW 注册昵称'
  : '接收端 token')
const currentChannelDocUrl = computed(() => CHANNEL_DOCS[offlineChannel.value] || '')

function openChannelDocs() {
  const url = currentChannelDocUrl.value
  if (!url)
    return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function syncLocalOfflineSettings() {
  if (settings.value?.offlineReminder) {
    const saved = JSON.parse(JSON.stringify(settings.value.offlineReminder))
    const next = {
      channel: 'webhook',
      endpoint: '',
      token: '',
      secret: '',
      title: '',
      msg: '',
      offlineDeleteSec: 0,
      ...saved,
    }

    if (String(next.channel || '').trim().toLowerCase() === 'dingtalk') {
      const legacyToken = String(next.token || '').trim()
      if (!String(next.endpoint || '').trim() && legacyToken) {
        next.endpoint = /^https?:\/\//i.test(legacyToken)
          ? legacyToken
          : `https://oapi.dingtalk.com/robot/send?access_token=${encodeURIComponent(legacyToken)}`
      }
      next.token = ''
    }

    localOffline.value = next
  }
}

function validateDingTalkWebhook(): string {
  if (!isDingTalkChannel.value)
    return ''

  const endpoint = String(localOffline.value.endpoint || '').trim()
  if (!endpoint)
    return '请填写钉钉机器人设置页提供的完整 Webhook 地址'

  try {
    const url = new URL(endpoint)
    const isOfficialWebhook = url.protocol === 'https:'
      && url.hostname.toLowerCase() === 'oapi.dingtalk.com'
      && url.pathname === '/robot/send'
      && !!url.searchParams.get('access_token')
    if (!isOfficialWebhook)
      return '钉钉 Webhook 地址格式不正确，请从群机器人设置页重新复制'
  }
  catch {
    return '钉钉 Webhook 地址格式不正确，请从群机器人设置页重新复制'
  }

  return ''
}

// 只监听下线提醒本身：保存功能模块设置会整体更新 settings，
// 若对整个 store 做 deep watch，会把通知设置页还没保存的草稿冲掉。
watch(() => settings.value?.offlineReminder, () => {
  syncLocalOfflineSettings()
}, { deep: true })

async function handleChangePassword() {
  if (!passwordForm.value.old || !passwordForm.value.new) {
    showAlert('请填写完整', 'danger')
    return
  }
  if (passwordForm.value.new !== passwordForm.value.confirm) {
    showAlert('两次密码输入不一致', 'danger')
    return
  }
  if (passwordForm.value.new.length < 6) {
    showAlert('密码长度至少6位', 'danger')
    return
  }

  passwordSaving.value = true
  try {
    const res = await userStore.changePassword(passwordForm.value.old, passwordForm.value.new)

    if (res.ok) {
      showAlert('密码修改成功，请重新登录', 'primary')
      passwordForm.value = { old: '', new: '', confirm: '' }
      setTimeout(() => {
        userStore.logout()
        window.location.href = '/login'
      }, 1500)
    }
    else {
      showAlert(`修改失败: ${res.error || '未知错误'}`, 'danger')
    }
  }
  finally {
    passwordSaving.value = false
  }
}

async function handleSaveOffline() {
  const validationError = validateDingTalkWebhook()
  if (validationError) {
    showAlert(validationError, 'danger')
    return
  }

  offlineSaving.value = true
  try {
    const res = await settingStore.saveOfflineConfig(localOffline.value)

    if (res.ok) {
      showAlert('下线提醒设置已保存', 'primary')
    }
    else {
      showAlert(`保存失败: ${res.error || '未知错误'}`, 'danger')
    }
  }
  finally {
    offlineSaving.value = false
  }
}

async function handleTestOffline() {
  const validationError = validateDingTalkWebhook()
  if (validationError) {
    showAlert(validationError, 'danger')
    return
  }

  offlineTesting.value = true
  try {
    const { data } = await api.post('/api/settings/offline-reminder/test', localOffline.value)
    if (data?.ok) {
      showAlert('测试消息发送成功', 'primary')
    }
    else {
      showAlert(`测试失败: ${getApiErrorMessage(data, '未知错误')}`, 'danger')
    }
  }
  catch (e: any) {
    const msg = getApiErrorMessage(e, '请求失败')
    showAlert(`测试失败: ${msg}`, 'danger')
  }
  finally {
    offlineTesting.value = false
  }
}

const systemConfigSaving = ref(false)
const systemConfigLoading = ref(false)
const loginSettingsSaving = ref(false)

const defaultDeviceInfo = {
  os: 'Windows',
  clientVersion: '',
  sysSoftware: 'Windows 10',
  network: 'wifi',
  memory: '16384',
  deviceId: 'DESKTOP-PC<WPC>',
  userAgent: '',
}

const localSystemConfig = ref({
  serverUrl: '',
  clientVersion: '',
  wxClientVersion: '',
  platform: 'qq',
  os: 'Windows',
  timeZone: 'Asia/Shanghai',
  autoStartAccounts: true,
  deviceInfo: { ...defaultDeviceInfo },
})
const defaultSystemConfig = ref({
  serverUrl: '',
  clientVersion: '',
  wxClientVersion: '',
  platform: 'qq',
  os: 'Windows',
  timeZone: 'Asia/Shanghai',
  autoStartAccounts: true,
  deviceInfo: { ...defaultDeviceInfo },
})
const localLoginSettings = ref({
  wechatQrLogin: true,
  qqQrLogin: false,
  napCatEndpoint: '',
  napCatSignature: '',
})
const devicePresets = ref<any[]>([])
const selectedPresetId = ref('')
const timeZoneOptions = ref([
  { label: '北京时间 / 上海（UTC+8）', value: 'Asia/Shanghai' },
])
const platformOptions = [
  { label: 'QQ', value: 'qq' },
  { label: '微信', value: 'wx' },
]
const osOptions = [
  { label: 'Windows', value: 'Windows' },
  { label: 'iOS', value: 'iOS' },
  { label: 'Android', value: 'Android' },
]

function normalizeSystemConfig(source: any, fallback: any) {
  return {
    serverUrl: source?.serverUrl || '',
    clientVersion: source?.clientVersion || '',
    wxClientVersion: source?.wxClientVersion || fallback.wxClientVersion || '',
    platform: source?.platform || 'qq',
    os: source?.os || 'Windows',
    timeZone: source?.timeZone || fallback.timeZone || 'Asia/Shanghai',
    autoStartAccounts: source?.autoStartAccounts !== false,
    deviceInfo: source?.deviceInfo ? { ...fallback.deviceInfo, ...source.deviceInfo } : { ...fallback.deviceInfo },
  }
}

function normalizeLoginSettings(source: any) {
  return {
    wechatQrLogin: typeof source?.wechatQrLogin === 'boolean' ? source.wechatQrLogin : true,
    qqQrLogin: typeof source?.qqQrLogin === 'boolean' ? source.qqQrLogin : false,
    napCatEndpoint: typeof source?.napCatEndpoint === 'string' ? source.napCatEndpoint.trim() : '',
    napCatSignature: typeof source?.napCatSignature === 'string' ? source.napCatSignature.trim() : '',
  }
}

async function loadDevicePresets() {
  try {
    const { data } = await api.get('/api/settings/device-presets')
    if (data?.ok && Array.isArray(data.data))
      devicePresets.value = data.data
  }
  catch (e) {
    console.error('加载设备预设失败:', e)
  }
}

function applyDevicePreset(presetId: string) {
  const preset = devicePresets.value.find(item => item.id === presetId)
  if (!preset)
    return
  const deviceInfo = { ...defaultDeviceInfo, ...(preset.deviceInfo || {}) }
  localSystemConfig.value = {
    ...localSystemConfig.value,
    os: deviceInfo.os || 'Windows',
    clientVersion: deviceInfo.clientVersion || '',
    deviceInfo,
  }
  selectedPresetId.value = presetId
}

async function loadSystemConfig() {
  systemConfigLoading.value = true
  try {
    const { data } = await api.get('/api/settings/system-config')
    if (data?.ok) {
      if (Array.isArray(data.data.timeZones) && data.data.timeZones.length) {
        timeZoneOptions.value = data.data.timeZones.map((option: any) => ({
          label: String(option.label || option.value || ''),
          value: String(option.value || 'Asia/Shanghai'),
        }))
      }
      defaultSystemConfig.value = normalizeSystemConfig(data.data.default, defaultSystemConfig.value)
      localSystemConfig.value = normalizeSystemConfig(data.data.saved || data.data.default, defaultSystemConfig.value)
      localLoginSettings.value = normalizeLoginSettings(data.data.loginSettings)
    }
  }
  catch (e) {
    console.error('加载系统配置失败:', e)
  }
  finally {
    systemConfigLoading.value = false
  }
}

async function handleSaveLoginSettings() {
  if (localLoginSettings.value.qqQrLogin
    && (!localLoginSettings.value.napCatEndpoint.trim() || !localLoginSettings.value.napCatSignature.trim())) {
    showAlert('开启 QQ 扫码登录前，请配置 NapCat 接口地址和接口签名', 'danger')
    return
  }
  loginSettingsSaving.value = true
  try {
    const { data } = await api.post('/api/settings/login-config', localLoginSettings.value)
    if (data?.ok) {
      localLoginSettings.value = normalizeLoginSettings(data.data)
    }
    showAlert(data?.ok ? '登录设置已保存' : getApiErrorMessage(data, '保存失败'), data?.ok ? 'primary' : 'danger')
  }
  catch (e: any) {
    showAlert(`保存失败: ${getApiErrorMessage(e, '未知错误')}`, 'danger')
  }
  finally {
    loginSettingsSaving.value = false
  }
}

async function handleSaveSystemConfig() {
  systemConfigSaving.value = true
  try {
    localSystemConfig.value.clientVersion = localSystemConfig.value.deviceInfo.clientVersion
    localSystemConfig.value.os = localSystemConfig.value.deviceInfo.os
    const { data } = await api.post('/api/settings/system-config', localSystemConfig.value)
    showAlert(data?.ok ? '系统配置已保存，连接参数在下次登录时生效' : getApiErrorMessage(data, '保存失败'), data?.ok ? 'primary' : 'danger')
  }
  catch (e: any) {
    showAlert(`保存失败: ${getApiErrorMessage(e, '未知错误')}`, 'danger')
  }
  finally {
    systemConfigSaving.value = false
  }
}

async function handleResetSystemConfig() {
  systemConfigSaving.value = true
  try {
    const { data } = await api.post('/api/settings/system-config/reset')
    if (data?.ok) {
      localSystemConfig.value = normalizeSystemConfig(data.data.saved, defaultSystemConfig.value)
      selectedPresetId.value = ''
      showAlert('系统配置已重置，连接参数在下次登录时生效', 'primary')
    }
    else {
      showAlert(getApiErrorMessage(data, '重置失败'), 'danger')
    }
  }
  catch (e: any) {
    showAlert(`重置失败: ${getApiErrorMessage(e, '未知错误')}`, 'danger')
  }
  finally {
    systemConfigSaving.value = false
  }
}
</script>

<template>
  <div class="settings-page page-stack">
    <div class="settings-workspace">
      <aside class="settings-navigation">
        <div class="settings-navigation-label">
          账号与偏好
        </div>
        <nav ref="tabsNav" class="settings-categories" aria-label="设置分类">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            :data-settings-tab="tab.key"
            class="settings-category"
            :aria-pressed="activeTab === tab.key"
            @click="activeTab = tab.key"
          >
            <div :class="tab.icon" />
            {{ tab.label }}
          </button>
        </nav>
      </aside>

      <div class="settings-body">
        <!-- 账号管理 -->
        <AccountManagementPanel v-if="activeTab === 'account'" @open-settings="openAccountSettings" />

        <!-- 账号设置（六个功能模块） -->
        <div v-else-if="activeTab === 'account-config'" class="space-y-4">
          <div v-if="settingsLoading" class="py-4 text-center text-gray-500">
            <span class="i-carbon-circle-dash mx-auto mb-2 inline-block animate-spin text-2xl" />
            <p>加载中...</p>
          </div>

          <div v-else-if="!currentAccountId || loadedAccountId !== currentAccountId" class="py-8 text-center text-gray-500">
            <div class="i-carbon-settings mx-auto mb-2 text-3xl text-gray-400" />
            <p>{{ currentAccountId ? '账号设置加载失败，请切换账号或刷新页面重试' : '请先选择账号' }}</p>
          </div>

          <AccountFeatureSettings
            v-else
            v-model:strategy="localStrategySettings"
            v-model:automation="localAutomationSettings"
            :current-account-name="currentAccountName"
            :current-account-id="currentAccountId"
            :loading="settingsLoading"
            :saving="automationSaving"
            :planting-strategy-options="plantingStrategyOptions"
            :bag-fallback-strategy-options="BAG_FALLBACK_STRATEGY_OPTIONS"
            :fertilizer-land-type-options="fertilizerLandTypeOptions"
            :fertilizer-options="fertilizerOptions"
            @save="onFeatureModuleSave"
          />
        </div>

        <!-- 通知设置 -->
        <div v-else-if="activeTab === 'notification'" class="space-y-4">
          <h3 class="text-lg text-gray-900 font-bold dark:text-gray-100">
            通知设置
          </h3>
          <p class="text-xs text-gray-500 -mt-2 dark:text-gray-400">
            账号离线后的推送渠道与清理策略
          </p>
          <section class="farm-card rounded-lg p-4">
            <div class="mb-4 flex items-start gap-3">
              <div class="h-9 w-9 flex shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600 dark:bg-green-900/25 dark:text-green-400">
                <span class="i-carbon-notification text-xl" />
              </div>
              <div>
                <h4 class="text-base text-gray-900 font-bold dark:text-gray-100">
                  下线提醒
                </h4>
                <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  配置账号离线后的通知与清理
                </p>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div class="min-w-0 flex flex-col gap-1.5">
                <div class="min-h-6 flex items-center justify-between gap-2">
                  <span class="text-sm text-gray-700 font-medium dark:text-gray-300">推送渠道</span>
                  <BaseButton
                    variant="text"
                    size="sm"
                    :disabled="!currentChannelDocUrl"
                    @click="openChannelDocs"
                  >
                    官方文档
                  </BaseButton>
                </div>
                <BaseSelect
                  v-model="localOffline.channel"
                  :options="channelOptions"
                />
              </div>

              <BaseInput
                v-if="offlineChannelUsesEndpoint"
                v-model="localOffline.endpoint"
                :label="offlineEndpointLabel"
                type="text"
                :placeholder="offlineEndpointPlaceholder"
              />

              <BaseInput
                v-if="!isDingTalkChannel"
                v-model="localOffline.token"
                :label="offlineTokenLabel"
                type="text"
                :placeholder="offlineTokenPlaceholder"
              />

              <template v-else>
                <BaseInput
                  v-model="localOffline.secret"
                  label="加签密钥（可选）"
                  type="password"
                  placeholder="仅在机器人开启加签时填写 SEC..."
                />
                <p class="text-xs text-gray-500 leading-relaxed sm:col-span-2 dark:text-gray-400">
                  从群机器人的设置页复制完整 Webhook；只有开启“加签”时才需要填写加签密钥。
                </p>
              </template>

              <BaseInput
                v-model="localOffline.title"
                label="标题"
                type="text"
                placeholder="提醒标题"
              />
              <BaseInput
                v-model.number="localOffline.offlineDeleteSec"
                label="离线删除账号 (秒)"
                type="number"
                min="0"
                placeholder="0 表示不删除"
              />
              <BaseInput
                v-model="localOffline.msg"
                label="内容"
                type="text"
                placeholder="提醒内容"
                class="sm:col-span-2"
              />
            </div>

            <div class="mt-3 flex justify-end gap-2 border-t pt-3 dark:border-gray-700">
              <BaseButton
                variant="primary"
                size="sm"
                :loading="offlineTesting"
                :disabled="offlineSaving"
                @click="handleTestOffline"
              >
                测试通知
              </BaseButton>
              <BaseButton
                variant="primary"
                size="sm"
                :loading="offlineSaving"
                :disabled="offlineTesting"
                @click="handleSaveOffline"
              >
                保存下线提醒设置
              </BaseButton>
            </div>
          </section>
        </div>

        <!-- 全局设置 -->
        <div v-else-if="activeTab === 'system-settings'" class="space-y-4">
          <h3 class="text-lg text-gray-900 font-bold dark:text-gray-100">
            全局设置
          </h3>
          <p class="text-xs text-gray-500 -mt-2 dark:text-gray-400">
            服务器连接、时区与客户端设备参数，保存后下次登录生效
          </p>

          <section class="farm-card rounded-lg p-4">
            <div class="mb-4 flex items-start gap-3">
              <div class="h-9 w-9 flex shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/25 dark:text-blue-400">
                <span class="i-carbon-settings-adjust text-xl" />
              </div>
              <div>
                <h4 class="text-base text-gray-900 font-bold dark:text-gray-100">
                  运行环境
                </h4>
                <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  服务器连接、时区与客户端设备参数
                </p>
              </div>
            </div>

            <div v-if="systemConfigLoading" class="py-8 text-center text-gray-500">
              <span class="i-svg-spinners-90-ring-with-bg inline-block text-2xl" />
            </div>
            <div v-else class="space-y-3">
              <div v-if="devicePresets.length" class="border border-gray-200 rounded-lg bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-900/30">
                <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">设备预设</label>
                <div class="flex flex-wrap gap-2">
                  <NButton
                    v-for="preset in devicePresets"
                    :key="preset.id"
                    size="small"
                    :type="selectedPresetId === preset.id ? 'primary' : 'default'"
                    :secondary="selectedPresetId !== preset.id"
                    :title="preset.description"
                    @click="applyDevicePreset(preset.id)"
                  >
                    {{ preset.name }}
                  </NButton>
                </div>
              </div>

              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <BaseInput
                  v-model="localSystemConfig.serverUrl"
                  label="服务器地址"
                  type="text"
                  placeholder="wss://..."
                />
                <div>
                  <BaseSelect
                    v-model="localSystemConfig.timeZone"
                    label="系统时区"
                    :options="timeZoneOptions"
                  />
                  <p class="mt-1 text-xs text-gray-500 leading-relaxed dark:text-gray-400">
                    礼包、任务、安静时段和日志均以此时区为准。
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div class="border border-gray-200 rounded-lg bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-900/30">
                  <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">平台</label>
                  <div class="flex flex-wrap gap-2">
                    <NButton
                      v-for="option in platformOptions"
                      :key="option.value"
                      size="small"
                      :type="localSystemConfig.platform === option.value ? 'primary' : 'default'"
                      :secondary="localSystemConfig.platform !== option.value"
                      @click="localSystemConfig.platform = option.value"
                    >
                      {{ option.label }}
                    </NButton>
                  </div>
                </div>
                <div class="border border-gray-200 rounded-lg bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-900/30">
                  <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">系统</label>
                  <div class="flex flex-wrap gap-2">
                    <NButton
                      v-for="option in osOptions"
                      :key="option.value"
                      size="small"
                      :type="localSystemConfig.deviceInfo.os === option.value ? 'primary' : 'default'"
                      :secondary="localSystemConfig.deviceInfo.os !== option.value"
                      @click="localSystemConfig.deviceInfo.os = option.value; localSystemConfig.os = option.value"
                    >
                      {{ option.label }}
                    </NButton>
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <BaseInput
                  v-model="localSystemConfig.deviceInfo.clientVersion"
                  label="QQ 客户端版本"
                  type="text"
                  :placeholder="defaultSystemConfig.deviceInfo.clientVersion || '从服务器加载中...'"
                />
                <BaseInput
                  v-model="localSystemConfig.wxClientVersion"
                  label="微信客户端版本"
                  type="text"
                  :placeholder="defaultSystemConfig.wxClientVersion || '从服务器加载中...'"
                />
                <BaseInput
                  v-model="localSystemConfig.deviceInfo.sysSoftware"
                  label="系统版本"
                  type="text"
                  placeholder="Windows 10"
                />
                <BaseInput
                  v-model="localSystemConfig.deviceInfo.deviceId"
                  label="设备标识"
                  type="text"
                  placeholder="DESKTOP-PC<WPC>"
                />
                <BaseInput
                  v-model="localSystemConfig.deviceInfo.memory"
                  label="内存 (MB)"
                  type="text"
                  placeholder="16384"
                />
                <BaseInput
                  v-model="localSystemConfig.deviceInfo.network"
                  label="网络"
                  type="text"
                  placeholder="wifi"
                />
                <BaseInput
                  v-model="localSystemConfig.deviceInfo.userAgent"
                  label="User-Agent"
                  type="text"
                  placeholder="Mozilla/5.0 ..."
                />
              </div>

              <div class="flex justify-end gap-2 border-t pt-3 dark:border-gray-700">
                <BaseButton variant="primary" size="sm" :loading="systemConfigSaving" @click="handleResetSystemConfig">
                  重置
                </BaseButton>
                <BaseButton variant="primary" size="sm" :loading="systemConfigSaving" @click="handleSaveSystemConfig">
                  保存运行环境
                </BaseButton>
              </div>
            </div>
          </section>

          <section class="farm-card rounded-lg p-4">
            <div class="mb-4 flex items-start gap-3">
              <div class="h-9 w-9 flex shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-900/25 dark:text-amber-400">
                <span class="i-carbon-password text-xl" />
              </div>
              <div>
                <h4 class="text-base text-gray-900 font-bold dark:text-gray-100">
                  修改管理员密码
                </h4>
                <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  更新后台管理登录凭据
                </p>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <BaseInput
                v-model="passwordForm.old"
                label="当前密码"
                type="password"
                placeholder="当前管理员密码"
              />
              <BaseInput
                v-model="passwordForm.new"
                label="新密码"
                type="password"
                placeholder="至少 6 位"
              />
              <BaseInput
                v-model="passwordForm.confirm"
                label="确认新密码"
                type="password"
                placeholder="再次输入新密码"
              />
            </div>

            <div class="mt-3 flex items-center justify-end border-t pt-3 dark:border-gray-700">
              <BaseButton
                variant="primary"
                size="sm"
                :loading="passwordSaving"
                @click="handleChangePassword"
              >
                修改管理员密码
              </BaseButton>
            </div>
          </section>
        </div>

        <!-- 连接与设备 -->
        <div v-else-if="activeTab === 'system'" class="space-y-4">
          <h3 class="text-lg text-gray-900 font-bold dark:text-gray-100">
            连接与设备
          </h3>
          <p class="text-xs text-gray-500 -mt-2 dark:text-gray-400">
            添加账号时可用的扫码登录方式与 NapCat 接口参数
          </p>

          <section class="farm-card rounded-lg p-4">
            <div class="mb-4 flex items-start gap-3">
              <div class="h-9 w-9 flex shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-900/25 dark:text-violet-400">
                <span class="i-carbon-login text-xl" />
              </div>
              <div>
                <h4 class="text-base text-gray-900 font-bold dark:text-gray-100">
                  登录设置
                </h4>
                <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  控制添加账号时可用的扫码登录方式
                </p>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div class="border border-gray-200 rounded-lg bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-900/30">
                <BaseSwitch v-model="localLoginSettings.wechatQrLogin" label="微信扫码登录" />
              </div>
              <div class="border border-gray-200 rounded-lg bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-900/30">
                <BaseSwitch v-model="localLoginSettings.qqQrLogin" label="QQ扫码登录" />
              </div>
            </div>

            <div
              v-if="localLoginSettings.qqQrLogin"
              class="grid grid-cols-1 mt-4 gap-3 border border-gray-200 rounded-lg bg-gray-50/70 p-4 sm:grid-cols-2 dark:border-gray-700 dark:bg-gray-900/30"
            >
              <BaseInput
                v-model="localLoginSettings.napCatEndpoint"
                label="NapCat接口地址"
                type="text"
                placeholder="http://127.0.0.1:6099"
              />
              <BaseInput
                v-model="localLoginSettings.napCatSignature"
                label="NapCat接口签名"
                type="password"
                placeholder="请输入 NapCat 接口签名"
              />
            </div>

            <div class="mt-3 flex justify-end border-t pt-3 dark:border-gray-700">
              <BaseButton
                variant="primary"
                size="sm"
                :loading="loginSettingsSaving"
                @click="handleSaveLoginSettings"
              >
                保存登录设置
              </BaseButton>
            </div>
          </section>
        </div>
      </div>
    </div>

    <ConfirmModal
      :show="modalVisible"
      :title="modalConfig.title"
      :message="modalConfig.message"
      :type="modalConfig.type"
      :is-alert="modalConfig.isAlert"
      confirm-text="知道了"
      @confirm="modalVisible = false"
      @cancel="modalVisible = false"
    />
  </div>
</template>

<style scoped>
.settings-workspace {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.settings-navigation {
  position: sticky;
  top: 12px;
  padding: 12px 8px;
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  background: var(--surface-1);
}
.settings-navigation-label {
  padding: 3px 12px 10px;
  color: var(--muted-text);
  font-size: 12px;
  letter-spacing: 0;
}
.settings-categories {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.settings-category {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  text-align: left;
  color: var(--muted-text);
  font-size: 13px;
  transition:
    background 150ms,
    color 150ms,
    border-color 150ms;
}
.settings-category > div {
  flex-shrink: 0;
  font-size: 18px;
}
.settings-category:hover {
  background: var(--surface-2);
  color: var(--theme-primary);
}
.settings-category[aria-pressed='true'] {
  border-color: #e0e9d4;
  background: #edf3e4;
  color: var(--theme-primary);
  font-weight: 650;
}
.settings-body {
  min-width: 0;
}
.settings-body :deep(.rounded-lg.bg-white),
.settings-body :deep(.rounded-xl.bg-white) {
  border-color: var(--surface-border);
  border-radius: 8px;
  background: var(--surface-1);
  box-shadow: var(--surface-shadow-soft);
}
@media (max-width: 1100px) {
  .settings-workspace {
    grid-template-columns: 160px minmax(0, 1fr);
    gap: 16px;
  }
}
@media (max-width: 767px) {
  .settings-workspace {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }
  .settings-navigation {
    position: static;
    padding: 7px;
  }
  .settings-navigation-label {
    display: none;
  }
  .settings-categories {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 4px;
    overflow-x: auto;
  }
  .settings-category {
    flex: 1 0 auto;
    flex-shrink: 0;
    justify-content: center;
    gap: 6px;
    min-height: 40px;
    padding: 8px 10px;
    white-space: nowrap;
  }
}
</style>
