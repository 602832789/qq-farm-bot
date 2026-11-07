<script setup lang="ts">
import type { FertilizerTimeUnit } from '@/utils/fertilizer-time'
import { computed, ref } from 'vue'
import MilkTeaActivityPanel from '@/components/settings/MilkTeaActivityPanel.vue'
import StrategySettingsPanel from '@/components/settings/StrategySettingsPanel.vue'
import StrategyTimingPanel from '@/components/settings/StrategyTimingPanel.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { MILK_TEA_AUTOMATION_OPTIONS } from '@/constants/activity-windows'
import { FERTILIZER_TIME_UNITS, fertilizerTimeSeconds, fertilizerTimeValue } from '@/utils/fertilizer-time'

type ModuleKey = 'planting' | 'fertilizer' | 'friends' | 'steal' | 'merchant' | 'activity' | 'pet'

const props = defineProps<{
  currentAccountName: string | null
  currentAccountId: string | number | null | undefined
  loading: boolean
  saving: boolean
  plantingStrategyOptions: any[]
  bagFallbackStrategyOptions: any[]
  fertilizerLandTypeOptions: any[]
  fertilizerOptions: any[]
}>()

const emit = defineEmits<{
  save: [module: ModuleKey, quiet?: boolean]
}>()

const strategy = defineModel<any>('strategy', { required: true })
const automation = defineModel<any>('automation', { required: true })
const activeModule = ref<ModuleKey | null>(null)
const mutationTestActive = ref(false)
const editSnapshot = ref<{ strategy: any, automation: any } | null>(null)
// 活动按常显处理：用户可以提前把配置做好，真正执行仍由服务端在活动开启后才会成功。
const showMilkTeaActivity = computed(() => true)
const milkTeaSettings = computed(() => MILK_TEA_AUTOMATION_OPTIONS)
const fertilizerSmartUnit = ref<FertilizerTimeUnit>('seconds')
const fertilizerSmartValue = computed({
  get: () => fertilizerTimeValue(automation.value.automation.fertilizer_smart_seconds ?? 300, fertilizerSmartUnit.value),
  set: (value: number) => { automation.value.automation.fertilizer_smart_seconds = fertilizerTimeSeconds(value, fertilizerSmartUnit.value) },
})

const moduleInfo: Record<ModuleKey, { title: string, description: string, icon: string, image: string, tone: string }> = {
  planting: { title: '种植与收获', description: '选种、收获、出售和巡田节奏', icon: 'i-carbon-sprout', image: '/game-config/module_icons/planting.png', tone: 'emerald' },
  fertilizer: { title: '土地与施肥', description: '土地升级、施肥和化肥补充', icon: 'i-carbon-soil-moisture', image: '/game-config/module_icons/fertilizer.png', tone: 'amber' },
  friends: { title: '好友', description: '帮助、捣乱和好友申请', icon: 'i-carbon-user-multiple', image: '/game-config/module_icons/friends-friendship.png', tone: 'sky' },
  steal: { title: '偷菜', description: '巡查频率和操作延迟', icon: 'i-carbon-crop-health', image: '/game-config/module_icons/steal.png', tone: 'lime' },
  merchant: { title: '神秘商人', description: '商品购买和货币范围', icon: 'i-carbon-store', image: '/game-config/module_icons/merchant.png', tone: 'orange' },
  activity: { title: '日常与活动', description: '日常任务、活动奖励和活动道具', icon: 'i-carbon-events', image: '/game-config/module_icons/activity-task.png', tone: 'violet' },
  pet: { title: '宠物', description: '自动喂狗粮，保持上场宠物看护时长', icon: 'i-fas-paw', image: '', tone: 'rose' },
}

const activeInfo = computed(() => activeModule.value ? moduleInfo[activeModule.value] : null)
const fertilizerName = computed(() => props.fertilizerOptions.find(item => item.value === automation.value.automation.fertilizer)?.label || '未设置')
const selectedLandNames = computed(() => props.fertilizerLandTypeOptions.filter(item => automation.value.automation.fertilizer_land_types?.includes(item.value)).map(item => item.label))
const selectedLandTypeCount = computed(() => Array.isArray(automation.value.automation.fertilizer_land_types) ? automation.value.automation.fertilizer_land_types.length : 0)
function milkTeaOptionEffective(option: { requires?: string }) {
  return !option.requires || !!automation.value.automation[option.requires]
}
const activityKeys = computed(() => [
  'star_solar_claim',
  'star_solar_quiz_claim',
  ...(showMilkTeaActivity.value ? milkTeaSettings.value.filter(milkTeaOptionEffective).map(setting => setting.key) : []),
  'share_reward_share',
  'share_reward_daily',
  'share_reward_milestones',
])
const activityEnabledCount = computed(() => activityKeys.value.filter(key => automation.value.automation[key]).length)
const shareRewardActivityEnabled = computed(() => ['share_reward_share', 'share_reward_daily', 'share_reward_milestones'].some(key => automation.value.automation[key]))

function intervalTag(min: number, max: number) {
  if (!Number.isFinite(min) || !Number.isFinite(max))
    return '未设置'
  return `${min}-${max} 秒`
}

function moduleStateLabel(key: ModuleKey) {
  if (key === 'activity')
    return moduleEnabled(key) ? '已配置' : '未开启'
  return moduleEnabled(key) ? '已开启' : '已关闭'
}

function summaryTags(key: ModuleKey) {
  if (key === 'planting') {
    const primaryStrategy = strategy.value.plantingStrategy
    const hasFallback = primaryStrategy === 'bag_priority'
    const primaryLabel = props.plantingStrategyOptions.find(option => option.value === primaryStrategy)?.label
    const fallbackLabel = props.bagFallbackStrategyOptions.find(option => option.value === strategy.value.bagSeedFallbackStrategy)?.label
    return [
      primaryLabel || '未设置策略',
      ...(strategy.value.prioritize2x2Crops ? ['优先 2×2'] : []),
      ...(hasFallback ? [`第二策略：${fallbackLabel || '未设置'}`] : []),
      automation.value.automation.sell ? '卖果实' : '不卖果实',
      `巡田 ${intervalTag(strategy.value.intervals.farmMin, strategy.value.intervals.farmMax)}`,
    ]
  }
  if (key === 'fertilizer') {
    return [
      fertilizerName.value,
      ...(automation.value.automation.fertilizer_2x2_ripen ? ['2x2催熟'] : []),
      selectedLandNames.value.join('、') || '未选土地',
      automation.value.automation.land_upgrade ? '升级土地' : '不升级',
      automation.value.automation.fertilizer_buy_organic || automation.value.automation.fertilizer_buy_normal ? '自动补肥' : '不补肥',
    ]
  }
  if (key === 'friends') {
    return [
      automation.value.automation.friend_help ? '帮助好友' : '不帮助',
      automation.value.automation.friend_auto_accept ? `自动通过 ${automation.value.autoAcceptFriendMinLevel || 0} 级+` : '不自动通过',
      strategy.value.friendQuietHours?.enabled ? '静默时段' : '无静默',
      `帮助 ${intervalTag(strategy.value.intervals.helpMin, strategy.value.intervals.helpMax)}`,
    ]
  }
  if (key === 'steal') {
    return [
      automation.value.automation.friend_steal ? '偷菜开启' : '偷菜关闭',
      '巡查节奏自动跟随好友作物成熟时间',
    ]
  }
  if (key === 'merchant') {
    const currencies = [
      automation.value.automation.mystery_shop_allow_gold && '金币',
      automation.value.automation.mystery_shop_allow_coupon && '点券',
      automation.value.automation.mystery_shop_allow_gold_bean && '金豆豆',
      automation.value.automation.mystery_shop_allow_diamond && '钻石',
    ].filter(Boolean)
    const notify = [
      automation.value.automation.mystery_shop_arrival_notify && '到货提醒',
      automation.value.automation.mystery_shop_purchase_notify && '购买通知',
    ].filter(Boolean)
    return [
      automation.value.automation.mystery_shop_auto_buy ? '自动购买' : '未开启购买',
      currencies.join('、') || '未选货币',
      notify.join('、') || '未开启提醒',
    ]
  }
  if (key === 'pet') {
    return [
      automation.value.automation.pet_feed_dog_food ? '自动喂狗粮' : '不喂狗粮',
      automation.value.automation.pet_feed_dog_food_auto_buy ? '狗粮不足自动购礼包' : '不足不购买',
      '每小时检查 · 上线立即检查',
    ]
  }
  return [
    automation.value.automation.task ? '自动完成日常任务' : '不做日常',
    automation.value.automation.task_after_farm && '种植收获后巡查任务',
    (automation.value.automation.star_solar_claim || automation.value.automation.star_solar_quiz_claim) && '节令小札',
    showMilkTeaActivity.value && milkTeaSettings.value.some(setting => milkTeaOptionEffective(setting) && automation.value.automation[setting.key]) && '奶茶热销中',
    shareRewardActivityEnabled.value && '快乐不独享',
    activityEnabledCount.value === 0 && !automation.value.automation.task && '未开启活动',
  ].filter(Boolean)
}

function moduleEnabled(key: ModuleKey) {
  if (key === 'planting')
    return automation.value.automation.farm
  if (key === 'fertilizer')
    return automation.value.automation.fertilizer !== 'none' || automation.value.automation.land_upgrade || !!automation.value.automation.fertilizer_2x2_ripen
  if (key === 'friends')
    return automation.value.automation.friend
  if (key === 'steal')
    return automation.value.automation.friend && automation.value.automation.friend_steal
  if (key === 'merchant')
    return automation.value.automation.mystery_shop_auto_buy || automation.value.automation.mystery_shop_arrival_notify
  if (key === 'pet')
    return automation.value.automation.pet_feed_dog_food
  return activityEnabledCount.value > 0 || automation.value.automation.task || automation.value.automation.task_after_farm
}

function setModuleEnabled(key: ModuleKey, enabled: boolean) {
  if (mutationTestActive.value && (key === 'planting' || key === 'fertilizer'))
    return
  if (key === 'planting') {
    automation.value.automation.farm = enabled
  }
  else if (key === 'fertilizer') {
    automation.value.automation.fertilizer = enabled ? (automation.value.automation.fertilizer === 'none' ? 'normal' : automation.value.automation.fertilizer) : 'none'
    if (!enabled) {
      automation.value.automation.land_upgrade = false
      automation.value.automation.fertilizer_2x2_ripen = false
    }
  }
  else if (key === 'friends') {
    automation.value.automation.friend = enabled
  }
  else if (key === 'steal') {
    automation.value.automation.friend_steal = enabled
    if (enabled)
      automation.value.automation.friend = true
  }
  else if (key === 'merchant') {
    automation.value.automation.mystery_shop_auto_buy = enabled
    if (!enabled) {
      automation.value.automation.mystery_shop_arrival_notify = false
      automation.value.automation.mystery_shop_purchase_notify = false
    }
  }
  else if (key === 'pet') {
    automation.value.automation.pet_feed_dog_food = enabled
  }
  else {
    automation.value.automation.task = enabled
    if (!enabled) {
      automation.value.automation.task_after_farm = false
      automation.value.automation.mall_coupon_gift_buy = false
      activityKeys.value.forEach((activityKey) => {
        automation.value.automation[activityKey] = false
      })
    }
  }
  emit('save', key, true)
}

function isFertilizerLandSelected(value: string | number) {
  return Array.isArray(automation.value.automation.fertilizer_land_types)
    && automation.value.automation.fertilizer_land_types.includes(value)
}

function toggleFertilizerLand(value: string | number) {
  const current = Array.isArray(automation.value.automation.fertilizer_land_types)
    ? automation.value.automation.fertilizer_land_types
    : []
  automation.value.automation.fertilizer_land_types = current.includes(value)
    ? current.filter((item: string | number) => item !== value)
    : [...current, value]
}

function finish() {
  if (!activeModule.value)
    return
  emit('save', activeModule.value, true)
  editSnapshot.value = null
  activeModule.value = null
}
function openModule(key: ModuleKey) {
  editSnapshot.value = {
    strategy: JSON.parse(JSON.stringify(strategy.value)),
    automation: JSON.parse(JSON.stringify(automation.value)),
  }
  activeModule.value = key
}
function cancel() {
  if (editSnapshot.value) {
    strategy.value = editSnapshot.value.strategy
    automation.value = editSnapshot.value.automation
  }
  editSnapshot.value = null
  activeModule.value = null
}
</script>

<template>
  <div class="space-y-5">
    <div v-if="loading && !saving" class="py-12 text-center text-gray-500">
      <span class="i-svg-spinners-ring-resize mb-2 inline-block text-2xl" /><div>加载中...</div>
    </div>
    <div v-else-if="!currentAccountId" class="py-12 text-center text-gray-500">
      请先选择账号
    </div>
    <template v-else>
      <div class="settings-overview-heading">
        <div>
          <h2 class="settings-overview-title">
            账号设置总览
          </h2>
          <p>{{ currentAccountName ? `当前账号：${currentAccountName}` : '请先在账号管理中选择账号' }}</p>
        </div>
        <span class="settings-overview-count">{{ Object.keys(moduleInfo).filter(key => moduleEnabled(key as ModuleKey)).length }} / {{ Object.keys(moduleInfo).length }} 项开启</span>
      </div>

      <div class="settings-module-grid">
        <article
          v-for="(info, key) in moduleInfo"
          :key="key"
          class="settings-module-card"
        >
          <div class="settings-module-heading">
            <div class="min-w-0 flex items-start gap-2.5">
              <img v-if="info.image" :src="info.image" alt="" class="settings-module-icon">
              <span v-else class="settings-module-icon" :class="info.icon" /><div class="min-w-0">
                <h4>
                  <button type="button" class="settings-module-title" @click="openModule(key as ModuleKey)">
                    {{ info.title }}
                  </button>
                </h4><p class="settings-module-description">
                  {{ info.description }}
                </p>
              </div>
            </div>
            <BaseSwitch
              :aria-label="`${info.title}自动化`"
              :model-value="moduleEnabled(key as ModuleKey)"
              :disabled="saving || (mutationTestActive && (key === 'planting' || key === 'fertilizer'))"
              @update:model-value="setModuleEnabled(key as ModuleKey, !!$event)"
            />
          </div>

          <ul class="settings-module-summary" aria-label="当前策略">
            <li
              v-for="tag in summaryTags(key as ModuleKey)"
              :key="tag"
            >
              {{ tag }}
            </li>
          </ul>

          <div class="settings-module-footer">
            <span class="settings-module-state" :class="{ 'is-enabled': moduleEnabled(key as ModuleKey) }">
              <span class="h-2 w-2 rounded-full" :class="moduleEnabled(key as ModuleKey) ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'" />
              {{ moduleStateLabel(key as ModuleKey) }}
            </span>
            <BaseButton variant="primary" size="sm" @click="openModule(key as ModuleKey)">
              配置 <span class="i-carbon-arrow-up-right ml-1" aria-hidden="true" />
            </BaseButton>
          </div>
        </article>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="activeModule && activeInfo" class="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-gray-950/45 p-3 backdrop-blur-[2px] sm:p-6" @click.self="cancel">
        <section class="max-h-[94vh] max-w-4xl w-full flex flex-col overflow-hidden border border-gray-200 rounded-lg bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          <header class="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-700 sm:px-6">
            <div class="min-w-0 flex items-start gap-3">
              <img v-if="activeInfo.image" :src="activeInfo.image" alt="" class="h-11 w-11 shrink-0 rounded-lg bg-gray-100 object-contain p-1.5 dark:bg-gray-700">
              <span v-else class="inline-grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gray-100 text-xl dark:bg-gray-700" :class="activeInfo.icon" />
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-lg text-gray-900 font-semibold dark:text-gray-100">
                    {{ activeInfo.title }}
                  </h3>
                  <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                    {{ moduleStateLabel(activeModule as ModuleKey) }}
                  </span>
                </div>
                <p class="mt-1 text-sm text-gray-500">
                  {{ activeInfo.description }}
                </p>
              </div>
            </div>
            <button class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" @click="cancel">
              <span class="i-carbon-close text-xl" />
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <div class="mb-5 flex flex-wrap gap-2">
              <span
                v-for="tag in summaryTags(activeModule as ModuleKey)"
                :key="tag"
                class="max-w-full truncate rounded-md bg-gray-50 px-2.5 py-1 text-xs text-gray-600 dark:bg-gray-900/40 dark:text-gray-300"
              >
                {{ tag }}
              </span>
            </div>

            <div v-if="activeModule === 'planting'" class="space-y-4">
              <section class="border border-gray-100 rounded-lg bg-gray-50/70 p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900/25">
                <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                  基础功能
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.sell" label="卖果实" />
                  <BaseSwitch v-model="automation.automation.golden_bug_clear" label="祛除黄金虫" />
                  <BaseSwitch v-model="automation.automation.farm_push" label="推送触发巡田" />
                  <BaseSwitch v-model="automation.automation.skip_own_weed_bug" label="保留自己农场的草虫" />
                  <BaseSwitch v-model="strategy.prioritize2x2Crops" label="优先种植 2×2 作物" />
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  优先种植 2×2 作物开启后，选种时占地 2×2 的四格作物拥有最高优先级，排在优先种子与单格作物前面；土地不够放 2×2 时自动回落到单格作物。
                </p>
              </section>

              <section class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                  选种策略与巡田频率
                </div>
                <StrategySettingsPanel
                  v-model:settings="strategy"
                  :current-account-id="currentAccountId"
                  :planting-strategy-options="plantingStrategyOptions"
                  :bag-fallback-strategy-options="bagFallbackStrategyOptions"
                  :land-type-options="fertilizerLandTypeOptions"
                />
              </section>
            </div>

            <div v-else-if="activeModule === 'fertilizer'" class="space-y-5">
              <section class="border border-gray-100 rounded-lg bg-gray-50/70 p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900/25">
                <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                  基础功能
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.land_upgrade" label="升级土地" />
                  <BaseSwitch v-model="automation.automation.fertilizer_gift" label="填充化肥" />
                  <BaseSwitch v-model="automation.automation.fertilizer_buy_organic" label="购买有机肥" />
                  <BaseSwitch v-model="automation.automation.fertilizer_buy_normal" label="购买无机肥" />
                </div>
              </section>

              <section class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div class="flex items-center justify-between gap-3">
                  <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                    施肥范围
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    已选 {{ selectedLandTypeCount }}/{{ fertilizerLandTypeOptions.length }}
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-2 lg:grid-cols-5">
                  <button
                    v-for="option in fertilizerLandTypeOptions"
                    :key="option.value"
                    type="button"
                    class="min-h-11 flex items-center justify-between gap-3 border rounded-lg px-3 py-2 text-left text-sm transition"
                    :class="isFertilizerLandSelected(option.value)
                      ? 'border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_10%,transparent)] text-gray-900 shadow-sm dark:text-gray-100'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-700/60'"
                    @click="toggleFertilizerLand(option.value)"
                  >
                    <span class="truncate font-medium">{{ option.label }}</span>
                    <span
                      class="grid h-5 w-5 shrink-0 place-items-center border rounded-full text-xs transition"
                      :class="isFertilizerLandSelected(option.value)
                        ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)] text-white'
                        : 'border-gray-300 text-transparent dark:border-gray-600'"
                    >
                      <span class="i-carbon-checkmark text-sm" />
                    </span>
                  </button>
                </div>
              </section>

              <section class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSelect v-model="automation.automation.fertilizer" label="施肥策略" :options="fertilizerOptions" />
                  <div v-if="['smart', 'smart_only', 'smart_normal'].includes(automation.automation.fertilizer)" class="flex items-end gap-2">
                    <BaseInput v-model.number="fertilizerSmartValue" label="快成熟判定" type="number" min="1" max="7200" step="0.5" class="flex-1" />
                    <BaseSelect v-model="fertilizerSmartUnit" label="单位" :options="FERTILIZER_TIME_UNITS" class="w-32" />
                  </div>
                </div>
                <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <BaseSwitch v-model="automation.automation.fertilizer_2x2_ripen" label="2x2催熟" :disabled="mutationTestActive" />
                  <BaseSwitch v-model="automation.automation.fertilizer_multi_season" label="多季补肥" />
                </div>
              </section>

              <section v-if="automation.automation.fertilizer_buy_organic || automation.automation.fertilizer_buy_normal" class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div class="text-sm font-medium">
                  自动补肥参数
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseInput v-if="automation.automation.fertilizer_buy_organic" v-model.number="automation.fertilizerBuyOrganicCount" label="有机肥购买数量" type="number" min="1" />
                  <BaseInput v-if="automation.automation.fertilizer_buy_organic" v-model.number="automation.fertilizerBuyOrganicThresholdHours" label="有机肥触发阈值（小时）" type="number" min="1" />
                  <BaseInput v-if="automation.automation.fertilizer_buy_normal" v-model.number="automation.fertilizerBuyNormalCount" label="无机肥购买数量" type="number" min="1" />
                  <BaseInput v-if="automation.automation.fertilizer_buy_normal" v-model.number="automation.fertilizerBuyNormalThresholdHours" label="无机肥触发阈值（小时）" type="number" min="1" />
                  <BaseInput v-model.number="automation.fertilizerBuyCheckIntervalMinutes" label="检测间隔（分钟）" type="number" min="1" />
                </div>
              </section>
            </div>

            <div v-else-if="activeModule === 'friends'" class="space-y-5">
              <section class="border border-gray-100 rounded-lg bg-gray-50/70 p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900/25">
                <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                  好友互动
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.friend_help" label="帮助好友" />
                  <BaseSwitch v-model="automation.automation.friend_bad" label="好友捣乱" />
                  <BaseSwitch v-model="automation.automation.friend_golden_bug" label="放黄金虫" />
                  <BaseSwitch v-model="automation.automation.friend_help_exp_limit" label="经验满只帮护主犬" />
                </div>
              </section>

              <section class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                  好友申请
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.friend_auto_accept" label="自动通过好友申请" />
                  <BaseInput v-if="automation.automation.friend_auto_accept" v-model.number="automation.autoAcceptFriendMinLevel" label="自动通过好友最低等级" type="number" min="0" max="200" />
                </div>
              </section>

              <section v-if="automation.automation.friend_golden_bug" class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                  黄金虫策略
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseInput v-model.number="automation.goldenBugKeepCount" label="黄金虫保留数量" type="number" min="0" />
                  <BaseInput v-model.number="automation.goldenBugRoundLimit" label="黄金虫单轮上限" type="number" min="1" />
                </div>
              </section>

              <section class="border border-gray-100 rounded-lg p-4 dark:border-gray-700">
                <StrategyTimingPanel v-model:settings="strategy" section="friends" />
              </section>
            </div>
            <div v-else-if="activeModule === 'steal'" class="space-y-5">
              <section class="border border-gray-100 rounded-lg bg-gray-50/70 p-4 space-y-2 dark:border-gray-700 dark:bg-gray-900/25">
                <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                  巡查节奏说明
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  偷菜巡查不再使用固定的巡查间隔或延迟设置。系统会根据已知好友农场的作物成熟时间动态计算下一次巡查的时机，成熟越近巡查越勤，避免固定间隔造成的空跑或错过窗口。开启右上角的开关即可自动运行。
                </p>
              </section>
            </div>

            <div v-else-if="activeModule === 'merchant'" class="space-y-4">
              <section class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div>
                  <div class="mb-2 text-sm text-gray-700 font-medium dark:text-gray-300">
                    允许使用的货币
                  </div>
                  <div class="grid gap-3 lg:grid-cols-4 sm:grid-cols-2">
                    <BaseSwitch v-model="automation.automation.mystery_shop_allow_gold" label="金币" />
                    <BaseSwitch v-model="automation.automation.mystery_shop_allow_coupon" label="点券" />
                    <BaseSwitch v-model="automation.automation.mystery_shop_allow_gold_bean" label="金豆豆" />
                    <BaseSwitch v-model="automation.automation.mystery_shop_allow_diamond" label="钻石" />
                  </div>
                </div>
              </section>
              <section class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div>
                  <div class="mb-2 text-sm text-gray-700 font-medium dark:text-gray-300">
                    消息与外部推送
                  </div>
                  <div class="grid gap-3 sm:grid-cols-2">
                    <BaseSwitch v-model="automation.automation.mystery_shop_arrival_notify" label="到货提醒" />
                    <BaseSwitch v-model="automation.automation.mystery_shop_purchase_notify" label="购买通知" />
                  </div>
                  <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    神秘商人到货、自动购买成功都会记入顶栏「消息」，无需配置任何推送渠道。下面两个开关控制是否额外推送到外部渠道（渠道在「设置 → 下线提醒」配置）：到货提醒单独开启也会启动每 10 分钟巡查；购买通知需配合自动购买，仅在买成功后推送。
                  </p>
                </div>
              </section>
            </div>

            <div v-else-if="activeModule === 'pet'" class="space-y-4">
              <section class="border border-gray-100 rounded-lg bg-gray-50/70 p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900/25">
                <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                  自动喂狗粮
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.pet_feed_dog_food" label="自动喂狗粮" />
                  <BaseSwitch v-model="automation.automation.pet_feed_dog_food_auto_buy" label="狗粮不足自动购买礼包" />
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  保持上场宠物的看护时长：不足一周时自动用背包狗粮补满；狗粮不足时自动从商城购买狗粮礼包（每次检查最多买 2 个）。每小时检查并喂食一次，上线时立即检查一次。
                </p>
              </section>
            </div>

            <div v-else class="space-y-4">
              <section class="border border-gray-100 rounded-lg bg-gray-50/70 p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900/25">
                <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                  日常任务
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.task" label="自动完成日常任务" />
                  <BaseSwitch v-model="automation.automation.task_after_farm" label="种植收获后巡查任务" />
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  每轮自动种植收获结束后巡查一次日常任务，任务奖励领取遵循日常任务开关。
                </p>
              </section>

              <section class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <h3 class="text-sm font-medium">
                  节令小札
                </h3>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.star_solar_claim" label="自动领取节令小礼" />
                  <BaseSwitch v-model="automation.automation.star_solar_quiz_claim" label="自动领取答题附加奖励" />
                </div>
              </section>

              <section class="border border-orange-100 rounded-lg p-4 space-y-3 dark:border-orange-900/40">
                <div>
                  <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                    快乐不独享
                  </div>
                  <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    自动分享领取首次分享快乐值，无需好友点击；自动领取每日快乐值和已达成的档位奖励。
                  </div>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.share_reward_share" label="自动分享" />
                  <BaseSwitch v-model="automation.automation.share_reward_daily" label="自动领取每日快乐值" />
                  <BaseSwitch v-model="automation.automation.share_reward_milestones" label="自动领取档位奖励" />
                </div>
              </section>

              <MilkTeaActivityPanel v-model:automation="automation" />
            </div>
          </div>
          <footer class="flex justify-end gap-2 border-t bg-gray-50/70 px-5 py-4 dark:border-gray-700 dark:bg-gray-900/20 sm:px-6">
            <BaseButton variant="secondary" size="sm" @click="cancel">
              取消
            </BaseButton>
            <BaseButton size="sm" :loading="saving" @click="finish">
              保存并关闭
            </BaseButton>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.settings-overview-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding: 0 0 12px;
  border-bottom: 1px solid var(--surface-border-strong);
  color: var(--muted-text);
  font-size: 12px;
}
.settings-overview-heading p {
  margin-top: 3px;
  overflow-wrap: anywhere;
}
.settings-overview-title {
  color: var(--theme-text);
  font-size: 16px;
  font-weight: 650;
}
/* 概览计数是个数字摘要，必须一眼能读：原来直接用品红/主题绿字贴在页面背景上，
   在浅色渐变与背景图区域几乎糊在一起。这里改成实底徽标：不透底、加描边、正文色。 */
.settings-overview-count {
  display: inline-flex;
  align-items: center;
  flex: none;
  padding: 4px 12px;
  border: 1px solid color-mix(in srgb, var(--ui-primary) 45%, var(--ui-border));
  border-radius: 999px;
  background: var(--ui-primary-soft);
  box-shadow: var(--ui-shadow-sm);
  color: var(--ui-primary);
  font-size: 12px;
  font-weight: var(--fw-500);
  letter-spacing: 0.02em;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  font-synthesis: none;
}
.settings-module-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.settings-module-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  background: var(--surface-1);
  transition: border-color 150ms;
}
.settings-module-card:hover {
  border-color: #a9c294;
}
.settings-module-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 10px;
}
.settings-module-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 3px;
  object-fit: contain;
  font-size: 22px;
}
.settings-module-description {
  margin-top: 3px;
  color: var(--muted-text);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.settings-module-title {
  text-align: left;
  color: var(--theme-text);
  font-size: 14px;
  font-weight: 650;
}
.settings-module-title:hover {
  color: var(--theme-primary);
}
.settings-module-card :deep(.base-switch) {
  flex-shrink: 0;
}
.settings-module-summary {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 4px 12px;
  margin: 10px 0;
  padding: 0;
  list-style: none;
  line-height: 1.7;
}
.settings-module-summary li {
  max-width: 100%;
  color: var(--muted-text);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.settings-module-summary li:first-child {
  width: 100%;
  color: var(--theme-text);
  font-weight: 550;
}
.settings-module-summary li:nth-child(n + 3)::before {
  content: '';
  display: inline-block;
  width: 3px;
  height: 3px;
  margin-right: 7px;
  border-radius: 50%;
  background: var(--surface-border-strong);
  vertical-align: middle;
}
.settings-module-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--surface-border);
}
.settings-module-state {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted-text);
  font-size: 12px;
}
.settings-module-state.is-enabled {
  color: var(--theme-primary);
}
.settings-module-card button:focus-visible {
  outline: 2px solid var(--theme-primary);
  outline-offset: 3px;
}
.settings-tools-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 5px;
}
.settings-tools-heading h3 {
  font-size: 14px;
  font-weight: 650;
}
.settings-tools-heading span {
  color: var(--muted-text);
  font-size: 12px;
}
.settings-tools-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: start;
}
@media (min-width: 1280px) {
  .settings-module-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 1023px) {
  .settings-tools-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 639px) {
  .settings-module-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  .settings-module-card {
    padding: 12px;
  }
  .settings-module-summary {
    margin-top: 8px;
  }
}
</style>
