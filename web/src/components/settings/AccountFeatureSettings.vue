<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import api from '@/api'
import StrategySettingsTab from '@/components/settings/StrategySettingsTab.vue'
import StrategyTimingPanel from '@/components/settings/StrategyTimingPanel.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'

type ModuleKey = 'planting' | 'fertilizer' | 'friends' | 'steal' | 'activity' | 'merchant'

const props = defineProps<{
  currentAccountName: string | null
  currentAccountId: string | number | null | undefined
  loading: boolean
  saving: boolean
  defaultPlanSaving: boolean
  plantingStrategyOptions: any[]
  preferredSeedOptions: any[]
  bagFallbackStrategyOptions: any[]
  strategyPreviewLabel: string | null
  bagSeeds: any[]
  sortedBagSeeds: any[]
  bagSeedsLoading: boolean
  bagSeedsError: string | null
  fertilizerLandTypeOptions: any[]
  fertilizerOptions: any[]
}>()

const emit = defineEmits<{
  save: [module: ModuleKey, quiet?: boolean]
  saveDefault: []
  resetBagSeedPriority: []
  moveBagSeed: [seedId: number, direction: -1 | 1]
  removeBagSeed: [seedId: number]
  startBagSeedDrag: [seedId: number, event: DragEvent]
  dragOverBagSeed: [seedId: number, event: DragEvent]
  dropBagSeed: [seedId: number, event: DragEvent]
}>()

const strategy = defineModel<any>('strategy', { required: true })
const automation = defineModel<any>('automation', { required: true })
const activeModule = ref<ModuleKey | null>(null)
const editSnapshot = ref<{ strategy: any, automation: any } | null>(null)
const qixiFriends = ref<Array<{ gid: number, name: string }>>([])

const moduleInfo: Record<ModuleKey, { title: string, description: string, icon: string, image: string, tone: string }> = {
  planting: { title: '种植与收获', description: '选种、收获、出售和巡田节奏', icon: 'i-carbon-sprout', image: '/game-config/module_icons/planting.png', tone: 'emerald' },
  fertilizer: { title: '土地与施肥', description: '土地升级、施肥和化肥补充', icon: 'i-carbon-soil-moisture', image: '/game-config/module_icons/fertilizer.png', tone: 'amber' },
  friends: { title: '好友', description: '帮助、捣乱和好友申请', icon: 'i-carbon-user-multiple', image: '/game-config/module_icons/friends.png', tone: 'sky' },
  steal: { title: '偷菜', description: '巡查频率和操作延迟', icon: 'i-carbon-crop-health', image: '/game-config/module_icons/steal.png', tone: 'lime' },
  activity: { title: '日常与活动', description: '日常任务、活动奖励和活动道具', icon: 'i-carbon-events', image: '/game-config/module_icons/activity.png', tone: 'violet' },
  merchant: { title: '神秘商人', description: '商品购买和货币范围', icon: 'i-carbon-store', image: '/game-config/module_icons/merchant.png', tone: 'orange' },
}

const activeInfo = computed(() => activeModule.value ? moduleInfo[activeModule.value] : null)
const fertilizerName = computed(() => props.fertilizerOptions.find(item => item.value === automation.value.automation.fertilizer)?.label || '未设置')
const selectedLandNames = computed(() => props.fertilizerLandTypeOptions.filter(item => automation.value.automation.fertilizer_land_types?.includes(item.value)).map(item => item.label))
const activityEnabledCount = computed(() => ['star_passport_claim', 'star_record_claim', 'qixi_dew_use', 'qixi_bridge_build', 'qixi_sachet_gift'].filter(key => automation.value.automation[key]).length)

function summary(key: ModuleKey) {
  if (key === 'planting')
    return `${props.strategyPreviewLabel || '等待选种'} · ${automation.value.automation.sell ? '卖果实' : '不卖果实'} · 巡田 ${strategy.value.intervals.farmMin}～${strategy.value.intervals.farmMax} 秒`
  if (key === 'fertilizer')
    return `${fertilizerName.value} · ${selectedLandNames.value.join('、') || '未选择土地'}`
  if (key === 'friends')
    return `${automation.value.automation.friend_help ? '帮助' : '不帮助'} · 最低 ${automation.value.autoAcceptFriendMinLevel || 0} 级 · ${strategy.value.intervals.helpMin}～${strategy.value.intervals.helpMax} 秒`
  if (key === 'steal')
    return `${automation.value.automation.friend_steal ? '已开启' : '已关闭'} · ${strategy.value.intervals.stealMin}～${strategy.value.intervals.stealMax} 秒 · 延迟 ${strategy.value.stealDelaySeconds} 秒`
  if (key === 'merchant') {
    const currencies = [
      automation.value.automation.mystery_shop_allow_gold && '金币',
      automation.value.automation.mystery_shop_allow_coupon && '点券',
      automation.value.automation.mystery_shop_allow_gold_bean && '金豆豆',
    ].filter(Boolean)
    return `${automation.value.automation.mystery_shop_auto_buy ? '已开启购买' : '已关闭购买'} · ${currencies.join('、') || '未选择货币'}`
  }
  return `活动已开启 ${activityEnabledCount.value} 项 · ${automation.value.automation.task ? '做任务' : '不做任务'}`
}

function moduleEnabled(key: ModuleKey) {
  if (key === 'planting')
    return automation.value.automation.farm
  if (key === 'fertilizer')
    return automation.value.automation.fertilizer !== 'none' || automation.value.automation.land_upgrade
  if (key === 'friends')
    return automation.value.automation.friend
  if (key === 'steal')
    return automation.value.automation.friend && automation.value.automation.friend_steal
  if (key === 'merchant')
    return automation.value.automation.mystery_shop_auto_buy
  return activityEnabledCount.value > 0 || automation.value.automation.task
}

function setModuleEnabled(key: ModuleKey, enabled: boolean) {
  if (key === 'planting') {
    automation.value.automation.farm = enabled
  }
  else if (key === 'fertilizer') {
    automation.value.automation.fertilizer = enabled ? (automation.value.automation.fertilizer === 'none' ? 'normal' : automation.value.automation.fertilizer) : 'none'
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
  }
  else {
    automation.value.automation.task = enabled
  }
  emit('save', key, true)
}

function qixiPriority() {
  return Array.isArray(automation.value.automation.qixi_friend_priority) ? automation.value.automation.qixi_friend_priority : []
}
function toggleQixiFriend(gid: number) {
  const list = qixiPriority()
  automation.value.automation.qixi_friend_priority = list.includes(gid) ? list.filter((id: number) => id !== gid) : [...list, gid]
}
function moveQixiFriend(index: number, direction: number) {
  const list = [...qixiPriority()]
  const target = index + direction
  if (target < 0 || target >= list.length) {
    return
  }
  const currentValue = list[index]
  list[index] = list[target]
  list[target] = currentValue
  automation.value.automation.qixi_friend_priority = list
}
function friendName(gid: number) {
  return qixiFriends.value.find(item => item.gid === gid)?.name || `好友 ${gid}`
}
async function loadQixiFriends() {
  if (!props.currentAccountId)
    return
  try {
    const { data } = await api.get('/api/activity/qixi', { headers: { 'x-account-id': props.currentAccountId } })
    qixiFriends.value = data?.friends || []
  }
  catch { qixiFriends.value = [] }
}
function finish() {
  if (!activeModule.value)
    return
  emit('save', activeModule.value)
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
onMounted(loadQixiFriends)
watch(() => props.currentAccountId, loadQixiFriends)
</script>

<template>
  <div class="space-y-5">
    <div class="sticky top-0 z-10 flex flex-col gap-3 border border-gray-200 rounded-xl bg-white/95 p-4 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:border-gray-700 dark:bg-gray-800/95">
      <div>
        <h3 class="text-lg text-gray-900 font-bold dark:text-gray-100">
          账号设置
        </h3>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {{ currentAccountName ? `正在配置：${currentAccountName}` : '请先在账号管理中选择账号' }}
        </p>
      </div>
      <BaseButton variant="secondary" size="sm" :loading="defaultPlanSaving" :disabled="!currentAccountId || saving" @click="emit('saveDefault')">
        <span class="i-carbon-save mr-1.5" />保存默认方案
      </BaseButton>
    </div>

    <div v-if="loading" class="py-12 text-center text-gray-500">
      <span class="i-svg-spinners-ring-resize mb-2 inline-block text-2xl" /><div>加载中...</div>
    </div>
    <div v-else-if="!currentAccountId" class="py-12 text-center text-gray-500">
      请先选择账号
    </div>
    <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <article v-for="(info, key) in moduleInfo" :key="key" class="group border border-gray-200 rounded-2xl bg-white p-5 transition dark:border-gray-700 dark:bg-gray-800 hover:shadow-md hover:-translate-y-0.5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex items-center gap-3">
            <img v-if="info.image" :src="info.image" alt="" class="h-10 w-10 shrink-0 rounded-xl bg-gray-100 object-contain p-1.5 dark:bg-gray-700">
            <span v-else class="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-xl dark:bg-gray-700" :class="info.icon" /><div>
              <h4 class="text-gray-900 font-semibold dark:text-gray-100">
                {{ info.title }}
              </h4><p class="mt-0.5 text-xs text-gray-500">
                {{ info.description }}
              </p>
            </div>
          </div>
          <BaseSwitch v-if="key !== 'activity'" :model-value="moduleEnabled(key as ModuleKey)" :disabled="saving" @update:model-value="setModuleEnabled(key as ModuleKey, !!$event)" />
          <span v-else class="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">{{ moduleEnabled('activity') ? '已配置' : '未开启' }}</span>
        </div>
        <p class="mt-4 min-h-10 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600 leading-5 dark:bg-gray-900/40 dark:text-gray-300">
          {{ summary(key as ModuleKey) }}
        </p>
        <div class="mt-4 flex justify-end">
          <BaseButton variant="secondary" size="sm" @click="openModule(key as ModuleKey)">
            配置
          </BaseButton>
        </div>
      </article>
    </div>

    <Teleport to="body">
      <div v-if="activeModule && activeInfo" class="fixed inset-0 z-50 grid place-items-center bg-gray-950/45 p-4 backdrop-blur-[2px]" @click.self="cancel">
        <section class="max-h-[90vh] max-w-3xl w-full overflow-hidden border border-gray-200 rounded-2xl bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          <header class="flex items-start justify-between border-b border-gray-100 px-6 py-5 dark:border-gray-700">
            <div>
              <h3 class="text-lg text-gray-900 font-semibold dark:text-gray-100">
                {{ activeInfo.title }}
              </h3><p class="mt-1 text-sm text-gray-500">
                {{ activeInfo.description }}
              </p>
            </div><button class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" @click="cancel">
              <span class="i-carbon-close text-xl" />
            </button>
          </header>
          <div class="max-h-[calc(90vh-145px)] overflow-y-auto px-6 py-5">
            <div v-if="activeModule === 'planting'" class="space-y-4">
              <div>
                <div class="mb-2 text-sm text-gray-700 font-medium dark:text-gray-300">
                  基础功能
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="strategy.prioritize2x2Crops" label="优先种植 2×2 作物" />
                  <BaseSwitch v-model="automation.automation.sell" label="卖果实" />
                  <BaseSwitch v-model="automation.automation.golden_bug_clear" label="祛除黄金虫" />
                  <BaseSwitch v-model="automation.automation.farm_push" label="推送触发巡田" />
                  <BaseSwitch v-model="automation.automation.skip_own_weed_bug" label="保留自己农场的草虫" />
                </div>
              </div><StrategySettingsTab v-model:settings="strategy" :current-account-name="null" :current-account-id="currentAccountId" :loading="false" :saving="saving" :show-actions="false" timing-section="planting" title="种植配置" :planting-strategy-options="plantingStrategyOptions" :preferred-seed-options="preferredSeedOptions" :bag-fallback-strategy-options="bagFallbackStrategyOptions" :strategy-preview-label="strategyPreviewLabel" :bag-seeds="bagSeeds" :sorted-bag-seeds="sortedBagSeeds" :bag-seeds-loading="bagSeedsLoading" :bag-seeds-error="bagSeedsError" @reset-bag-seed-priority="emit('resetBagSeedPriority')" @move-bag-seed="(id, direction) => emit('moveBagSeed', id, direction)" @remove-bag-seed="id => emit('removeBagSeed', id)" @start-bag-seed-drag="(id, event) => emit('startBagSeedDrag', id, event)" @drag-over-bag-seed="(id, event) => emit('dragOverBagSeed', id, event)" @drop-bag-seed="(id, event) => emit('dropBagSeed', id, event)" />
            </div>

            <div v-else-if="activeModule === 'fertilizer'" class="space-y-5">
              <div class="grid gap-3 sm:grid-cols-2">
                <BaseSwitch v-model="automation.automation.land_upgrade" label="升级土地" /><BaseSwitch v-model="automation.automation.fertilizer_gift" label="填充化肥" /><BaseSwitch v-model="automation.automation.fertilizer_buy_organic" label="购买有机肥" /><BaseSwitch v-model="automation.automation.fertilizer_buy_normal" label="购买无机肥" />
              </div>
              <div>
                <div class="mb-2 text-sm font-medium">
                  施肥范围
                </div><div class="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <label v-for="option in fertilizerLandTypeOptions" :key="option.value" class="flex items-center gap-2 rounded-lg bg-gray-50 p-2 text-sm dark:bg-gray-900/40"><input v-model="automation.automation.fertilizer_land_types" :value="option.value" type="checkbox">{{ option.label }}</label>
                </div>
              </div>
              <BaseSelect v-model="automation.automation.fertilizer" label="施肥策略" :options="fertilizerOptions" /><BaseSwitch v-model="automation.automation.fertilizer_multi_season" label="多季补肥" />
              <BaseInput v-if="['smart', 'smart_only', 'smart_normal'].includes(automation.automation.fertilizer)" v-model.number="automation.automation.fertilizer_smart_seconds" label="快成熟判定秒数" type="number" min="30" max="3600" />
              <div v-if="automation.automation.fertilizer_buy_organic || automation.automation.fertilizer_buy_normal" class="grid gap-3 sm:grid-cols-2">
                <BaseInput v-if="automation.automation.fertilizer_buy_organic" v-model.number="automation.fertilizerBuyOrganicCount" label="有机肥购买数量" type="number" min="1" /><BaseInput v-if="automation.automation.fertilizer_buy_organic" v-model.number="automation.fertilizerBuyOrganicThresholdHours" label="有机肥触发阈值（小时）" type="number" min="1" /><BaseInput v-if="automation.automation.fertilizer_buy_normal" v-model.number="automation.fertilizerBuyNormalCount" label="无机肥购买数量" type="number" min="1" /><BaseInput v-if="automation.automation.fertilizer_buy_normal" v-model.number="automation.fertilizerBuyNormalThresholdHours" label="无机肥触发阈值（小时）" type="number" min="1" /><BaseInput v-model.number="automation.fertilizerBuyCheckIntervalMinutes" label="检测间隔（分钟）" type="number" min="1" />
              </div>
            </div>

            <div v-else-if="activeModule === 'friends'" class="space-y-5">
              <div class="grid gap-3 sm:grid-cols-2">
                <BaseSwitch v-model="automation.automation.friend_help" label="帮助好友" /><BaseSwitch v-model="automation.automation.friend_bad" label="好友捣乱" /><BaseSwitch v-model="automation.automation.friend_golden_bug" label="放黄金虫" /><BaseSwitch v-model="automation.automation.friend_help_exp_limit" label="经验满只帮护主犬" />
              </div><BaseInput v-model.number="automation.autoAcceptFriendMinLevel" label="通过好友最低等级" type="number" min="0" max="200" /><div v-if="automation.automation.friend_golden_bug" class="grid gap-3 sm:grid-cols-2">
                <BaseInput v-model.number="automation.goldenBugKeepCount" label="黄金虫保留数量" type="number" min="0" /><BaseInput v-model.number="automation.goldenBugRoundLimit" label="黄金虫单轮上限" type="number" min="1" />
              </div><StrategyTimingPanel v-model:settings="strategy" section="friends" />
            </div>
            <div v-else-if="activeModule === 'steal'" class="space-y-5">
              <StrategyTimingPanel v-model:settings="strategy" section="steal" />
            </div>

            <div v-else-if="activeModule === 'merchant'" class="space-y-4">
              <div class="space-y-3">
                <h3 class="flex items-center gap-2 text-lg text-gray-900 font-bold dark:text-gray-100">
                  <div class="i-carbon-store text-lg" />购物配置
                </h3>
                <div>
                  <div class="mb-2 text-sm text-gray-700 font-medium dark:text-gray-300">
                    允许使用的货币
                  </div>
                  <div class="grid gap-3 sm:grid-cols-3">
                    <BaseSwitch v-model="automation.automation.mystery_shop_allow_gold" label="金币" />
                    <BaseSwitch v-model="automation.automation.mystery_shop_allow_coupon" label="点券" />
                    <BaseSwitch v-model="automation.automation.mystery_shop_allow_gold_bean" label="金豆豆" />
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="space-y-4">
              <div>
                <div class="mb-2 text-sm text-gray-700 font-medium dark:text-gray-300">
                  日常任务
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.task" label="做任务" />
                </div>
              </div>
              <div>
                <div class="mb-2 text-sm text-gray-700 font-medium dark:text-gray-300">
                  活动任务
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.star_passport_claim" label="领取千星游记" />
                  <BaseSwitch v-model="automation.automation.star_record_claim" label="领取观星礼录" />
                  <BaseSwitch v-model="automation.automation.qixi_dew_use" label="使用鹊羽灵露" />
                  <BaseSwitch v-model="automation.automation.qixi_bridge_build" label="驻建鹊桥" />
                  <BaseSwitch v-model="automation.automation.qixi_sachet_gift" label="赠送鹊羽香囊" />
                </div>
              </div>
              <div v-if="automation.automation.qixi_sachet_gift" class="space-y-3">
                <div class="text-sm font-medium">
                  香囊好友优先级
                </div><div v-for="(gid, index) in qixiPriority()" :key="gid" class="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900/40">
                  <span class="w-6 text-gray-400">{{ Number(index) + 1 }}</span><span class="flex-1">{{ friendName(Number(gid)) }}</span><button :disabled="Number(index) === 0" @click="moveQixiFriend(Number(index), -1)">
                    ↑
                  </button><button :disabled="Number(index) === qixiPriority().length - 1" @click="moveQixiFriend(Number(index), 1)">
                    ↓
                  </button><button class="text-red-500" @click="toggleQixiFriend(Number(gid))">
                    ×
                  </button>
                </div><div class="flex flex-wrap gap-2">
                  <button v-for="friend in qixiFriends.filter(item => !qixiPriority().includes(item.gid))" :key="friend.gid" class="border rounded-full px-3 py-1.5 text-xs" @click="toggleQixiFriend(friend.gid)">
                    + {{ friend.name }}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <footer class="flex justify-end gap-2 border-t bg-gray-50/70 px-6 py-4 dark:border-gray-700 dark:bg-gray-900/20">
            <BaseButton variant="secondary" size="sm" @click="cancel">
              取消
            </BaseButton><BaseButton size="sm" :loading="saving" @click="finish">
              完成并保存
            </BaseButton>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>
