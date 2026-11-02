<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NCheckbox, NCheckboxGroup } from 'naive-ui/es/checkbox'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import type { AutomationSettingsFormModel } from './AutomationSettingsForm.vue'

type ModuleKey = 'planting' | 'fertilizer' | 'friends' | 'steal' | 'merchant' | 'activity'

const props = withDefaults(defineProps<{
  saving: boolean
  accountName?: string | null
  fertilizerLandTypeOptions: Array<{ label: string, value: string }>
  fertilizerOptions: Array<{ label: string, value: string }>
  strategyLabel?: string
  stealDelaySeconds?: number
  friendMin?: number
  friendMax?: number
}>(), {
  accountName: null,
  strategyLabel: '',
  stealDelaySeconds: 0,
  friendMin: 0,
  friendMax: 0,
})

const emit = defineEmits<{
  save: []
  'open-strategy': []
}>()

const settings = defineModel<AutomationSettingsFormModel>({ required: true })
const router = useRouter()

const moduleInfo: Record<ModuleKey, { title: string, description: string, image: string, tone: string }> = {
  planting: { title: '种植与收获', description: '选种、收获、出售和巡田节奏', image: '/game-config/module_icons/planting.png', tone: 'emerald' },
  fertilizer: { title: '土地与施肥', description: '土地升级、施肥和化肥补充', image: '/game-config/module_icons/fertilizer.png', tone: 'amber' },
  friends: { title: '好友', description: '帮助、捣乱和好友申请', image: '/game-config/module_icons/friends-friendship.png', tone: 'sky' },
  steal: { title: '偷菜', description: '巡查频率和操作延迟', image: '/game-config/module_icons/steal.png', tone: 'lime' },
  merchant: { title: '神秘商人', description: '商品购买和货币范围', image: '/game-config/module_icons/merchant.png', tone: 'orange' },
  activity: { title: '日常与活动', description: '日常任务、活动奖励和活动道具', image: '/game-config/module_icons/activity-task.png', tone: 'violet' },
}

const moduleKeys = Object.keys(moduleInfo) as ModuleKey[]
const activeModule = ref<ModuleKey | null>(null)
const activeInfo = computed(() => (activeModule.value ? moduleInfo[activeModule.value] : null))

const fertilizerLabel = computed(() => {
  const current = props.fertilizerOptions.find(item => item.value === settings.value.automation.fertilizer)
  return current?.label || '未设置'
})

const landTypeCount = computed(() => {
  const selected = settings.value.automation.fertilizer_land_types
  return Array.isArray(selected) ? selected.length : 0
})

function moduleEnabled(key: ModuleKey): boolean {
  const automation = settings.value.automation
  if (key === 'planting')
    return !!automation.farm
  if (key === 'fertilizer')
    return automation.fertilizer !== 'none' || !!automation.land_upgrade
  if (key === 'friends')
    return !!automation.friend
  if (key === 'steal')
    return !!automation.friend && !!automation.friend_steal
  if (key === 'merchant')
    return !!automation.mystery_shop_auto_buy
  return !!automation.task
}

function setModuleEnabled(key: ModuleKey, enabled: boolean) {
  const automation = settings.value.automation
  if (key === 'planting') {
    automation.farm = enabled
  }
  else if (key === 'fertilizer') {
    automation.fertilizer = enabled
      ? (automation.fertilizer === 'none' ? 'normal' : automation.fertilizer)
      : 'none'
    if (!enabled)
      automation.land_upgrade = false
  }
  else if (key === 'friends') {
    automation.friend = enabled
  }
  else if (key === 'steal') {
    automation.friend_steal = enabled
    if (enabled)
      automation.friend = true
  }
  else if (key === 'merchant') {
    automation.mystery_shop_auto_buy = enabled
    if (!enabled)
      automation.mystery_shop_purchase_notify = false
  }
  else {
    automation.task = enabled
  }
}

function moduleStateLabel(key: ModuleKey) {
  if (key === 'activity')
    return moduleEnabled(key) ? '已配置' : '未开启'
  return moduleEnabled(key) ? '已开启' : '已关闭'
}

function moduleSummary(key: ModuleKey): string[] {
  const automation = settings.value.automation
  if (key === 'planting') {
    return [
      props.strategyLabel ? `策略：${props.strategyLabel}` : '策略未设置',
      automation.sell ? '自动出售' : '不自动出售',
      automation.farm_harvest_tiangong ? '收获天工' : '不收获天工',
    ]
  }
  if (key === 'fertilizer') {
    return [
      `施肥：${fertilizerLabel.value}`,
      landTypeCount.value > 0 ? `施肥范围 ${landTypeCount.value} 类土地` : '施肥范围未选',
      automation.fertilizer_buy_organic || automation.fertilizer_buy_normal ? '自动补肥' : '不自动补肥',
    ]
  }
  if (key === 'friends') {
    return [
      automation.friend_help ? '帮助好友' : '不帮助',
      automation.friend_bad ? '捣乱开启' : '不捣乱',
      automation.friend_auto_accept ? '自动通过申请' : '手动通过申请',
    ]
  }
  if (key === 'steal') {
    const range = props.friendMin && props.friendMax ? `${props.friendMin}-${props.friendMax} 秒` : '动态巡查'
    return [
      automation.friend_steal && automation.friend ? '偷菜开启' : '偷菜关闭',
      `巡查 ${range}`,
      `操作延迟 ${props.stealDelaySeconds || 0} 秒`,
    ]
  }
  if (key === 'merchant') {
    return [
      automation.mystery_shop_auto_buy ? '自动购买' : '不自动购买',
      automation.mystery_shop_arrival_notify ? '到货提醒' : '无到货提醒',
      automation.mystery_shop_purchase_notify ? '购买提醒' : '无购买提醒',
    ]
  }
  return [
    automation.task ? '自动做任务' : '不自动做任务',
    '活动奖励在活动中心领取',
  ]
}

const enabledCount = computed(() => moduleKeys.filter(key => moduleEnabled(key)).length)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h3 class="text-lg text-gray-900 font-bold dark:text-gray-100">
          功能模块
          <span v-if="accountName" class="ml-2 text-sm text-gray-500 font-normal dark:text-gray-400">
            ({{ accountName }})
          </span>
        </h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          按模块开启自动化，点开卡片调整细节。修改后需要保存。
        </p>
      </div>
      <span class="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
        {{ enabledCount }} / {{ moduleKeys.length }} 个模块已开启
      </span>
    </div>

    <div class="feature-grid">
      <article v-for="(info, key) in moduleInfo" :key="key" class="farm-card rounded-2xl p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex items-start gap-3">
            <img :src="info.image" alt="" class="feature-icon" loading="lazy">
            <div class="min-w-0">
              <h4 class="text-base text-gray-900 font-bold dark:text-gray-100">
                {{ info.title }}
              </h4>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {{ info.description }}
              </p>
            </div>
          </div>
          <BaseSwitch
            :aria-label="`${info.title}自动化`"
            :model-value="moduleEnabled(key)"
            :disabled="saving"
            @update:model-value="setModuleEnabled(key, !!$event)"
          />
        </div>

        <ul class="feature-summary">
          <li v-for="tag in moduleSummary(key)" :key="tag">
            {{ tag }}
          </li>
        </ul>

        <div class="mt-3 flex items-center justify-between gap-2">
          <span class="inline-flex items-center gap-1.5 text-xs" :class="moduleEnabled(key) ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'">
            <span class="h-2 w-2 rounded-full" :class="moduleEnabled(key) ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'" />
            {{ moduleStateLabel(key) }}
          </span>
          <BaseButton variant="secondary" size="sm" @click="activeModule = key">
            配置
            <span class="i-carbon-arrow-up-right ml-1" aria-hidden="true" />
          </BaseButton>
        </div>
      </article>
    </div>

    <div class="flex justify-end gap-2 border-t pt-3 dark:border-gray-700">
      <BaseButton variant="primary" size="sm" :loading="saving" @click="emit('save')">
        保存功能模块
      </BaseButton>
    </div>

    <Teleport to="body">
      <div
        v-if="activeModule && activeInfo"
        class="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-gray-950/45 p-3 backdrop-blur-[2px] sm:p-6"
        @click.self="activeModule = null"
      >
        <section class="max-h-[94vh] max-w-3xl w-full flex flex-col overflow-hidden border border-gray-200 rounded-2xl bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          <header class="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-700 sm:px-6">
            <div class="min-w-0 flex items-start gap-3">
              <img :src="activeInfo.image" alt="" class="feature-icon">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-lg text-gray-900 font-semibold dark:text-gray-100">
                    {{ activeInfo.title }}
                  </h3>
                  <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                    {{ moduleStateLabel(activeModule) }}
                  </span>
                </div>
                <p class="mt-1 text-sm text-gray-500">
                  {{ activeInfo.description }}
                </p>
              </div>
            </div>
            <button type="button" class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" @click="activeModule = null">
              <span class="i-carbon-close text-xl" />
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <div class="mb-4 flex flex-wrap gap-2">
              <span
                v-for="tag in moduleSummary(activeModule)"
                :key="tag"
                class="max-w-full truncate rounded-md bg-gray-50 px-2.5 py-1 text-xs text-gray-600 dark:bg-gray-900/40 dark:text-gray-300"
              >
                {{ tag }}
              </span>
            </div>

            <!-- 种植与收获 -->
            <div v-if="activeModule === 'planting'" class="space-y-4">
              <section class="feature-section">
                <div class="feature-section-title">
                  基础功能
                </div>
                <div class="feature-switch-grid">
                  <BaseSwitch v-model="settings.automation.farm" label="自动种植收获" />
                  <BaseSwitch v-model="settings.automation.farm_harvest_tiangong" label="自动收获天工作物" />
                  <BaseSwitch v-model="settings.automation.sell" label="自动卖果实" />
                  <BaseSwitch v-model="settings.automation.farm_push" label="推送触发巡田" />
                  <BaseSwitch v-model="settings.automation.skip_own_weed_bug" label="巡田时跳过一键务农" />
                </div>
              </section>
              <section class="feature-section">
                <div class="feature-section-title">
                  选种与巡田节奏
                </div>
                <p class="text-sm text-gray-600 dark:text-gray-300">
                  当前策略：{{ strategyLabel || '未设置' }}
                </p>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  种植策略、作物黑名单、背包种子优先级和巡田间隔在「策略设置」里调整。
                </p>
                <BaseButton variant="secondary" size="sm" class="mt-3" @click="emit('open-strategy')">
                  去策略设置
                  <span class="i-carbon-arrow-right ml-1" />
                </BaseButton>
              </section>
            </div>

            <!-- 土地与施肥 -->
            <div v-else-if="activeModule === 'fertilizer'" class="space-y-4">
              <section class="feature-section">
                <div class="feature-section-title">
                  基础功能
                </div>
                <div class="feature-switch-grid">
                  <BaseSwitch v-model="settings.automation.land_upgrade" label="自动升级土地" />
                  <BaseSwitch v-model="settings.automation.fertilizer_gift" label="自动填充化肥" />
                  <BaseSwitch v-model="settings.automation.fertilizer_buy_organic" label="自动购买有机化肥" />
                  <BaseSwitch v-model="settings.automation.fertilizer_buy_normal" label="自动购买无机化肥" />
                  <BaseSwitch v-model="settings.automation.fertilizer_multi_season" label="多季补肥" />
                  <BaseSwitch v-model="settings.automation.show_manual_fertilizer" label="显示手动施肥按钮" />
                </div>
              </section>

              <section v-if="settings.automation.fertilizer_buy_organic || settings.automation.fertilizer_buy_normal" class="feature-section">
                <div class="feature-section-title">
                  化肥购买
                </div>
                <div v-if="settings.automation.fertilizer_buy_organic" class="space-y-2">
                  <div class="text-sm text-gray-700 dark:text-gray-300">
                    有机化肥
                  </div>
                  <div class="feature-input-grid">
                    <BaseInput v-model.number="settings.fertilizerBuyOrganicCount" label="购买数量" type="number" min="1" max="10000" />
                    <BaseInput v-model.number="settings.fertilizerBuyOrganicThresholdHours" label="触发阈值 (小时)" type="number" min="1" max="990" />
                  </div>
                </div>
                <div v-if="settings.automation.fertilizer_buy_normal" class="mt-3 space-y-2">
                  <div class="text-sm text-gray-700 dark:text-gray-300">
                    无机化肥
                  </div>
                  <div class="feature-input-grid">
                    <BaseInput v-model.number="settings.fertilizerBuyNormalCount" label="购买数量" type="number" min="1" max="10000" />
                    <BaseInput v-model.number="settings.fertilizerBuyNormalThresholdHours" label="触发阈值 (小时)" type="number" min="1" max="990" />
                  </div>
                </div>
                <BaseInput
                  v-model.number="settings.fertilizerBuyCheckIntervalMinutes"
                  label="检测间隔 (分钟)"
                  type="number"
                  min="1"
                  max="1440"
                  class="mt-3"
                />
                <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  按检测间隔检查余量，低于阈值时自动购买；两种化肥同时开启时优先购买有机化肥。
                </p>
              </section>

              <section class="feature-section">
                <div class="feature-section-title">
                  施肥范围
                </div>
                <NCheckboxGroup v-model:value="settings.automation.fertilizer_land_types">
                  <div class="grid grid-cols-2 gap-2 md:grid-cols-3">
                    <NCheckbox v-for="option in fertilizerLandTypeOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </NCheckbox>
                  </div>
                </NCheckboxGroup>
                <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  仅对选中土地类型的地块执行施肥策略。
                </p>
              </section>

              <section class="feature-section space-y-3">
                <div class="feature-section-title">
                  施肥策略
                </div>
                <BaseSelect v-model="settings.automation.fertilizer" label="施肥策略" :options="fertilizerOptions" />
                <div v-if="settings.automation.fertilizer === 'smart'" class="flex flex-wrap items-end gap-4">
                  <BaseInput
                    v-model.number="settings.automation.fertilizer_smart_seconds"
                    label="快成熟判定秒数"
                    type="number"
                    min="30"
                    max="3600"
                    class="w-44"
                  />
                  <span class="pb-2 text-xs text-gray-500 dark:text-gray-400">
                    距离成熟 ≤ 此秒数时施有机肥（默认 300 秒）
                  </span>
                </div>
              </section>
            </div>

            <!-- 好友 -->
            <div v-else-if="activeModule === 'friends'" class="space-y-4">
              <section class="feature-section">
                <div class="feature-section-title">
                  好友互动
                </div>
                <div class="feature-switch-grid">
                  <BaseSwitch v-model="settings.automation.friend" label="自动好友互动" />
                  <BaseSwitch v-model="settings.automation.friend_help" label="帮助好友" :disabled="!settings.automation.friend" />
                  <BaseSwitch v-model="settings.automation.friend_bad" label="好友捣乱" :disabled="!settings.automation.friend" />
                  <BaseSwitch v-model="settings.automation.friend_help_exp_limit" label="经验满不帮忙" :disabled="!settings.automation.friend" />
                  <BaseSwitch
                    v-model="settings.automation.friend_help_protect_dog_ignore_exp_limit"
                    label="护主犬经验满仍帮忙"
                    :disabled="!settings.automation.friend"
                  />
                </div>
              </section>

              <section class="feature-section space-y-3">
                <div class="feature-section-title">
                  好友申请
                </div>
                <BaseSwitch v-model="settings.automation.friend_auto_accept" label="自动通过好友申请" />
                <template v-if="settings.automation.friend_auto_accept">
                  <div class="feature-input-grid items-end">
                    <BaseInput v-model.number="settings.autoAcceptFriendMinLevel" label="最低等级" type="number" min="0" max="200" />
                    <BaseSwitch v-model="settings.autoAcceptRequireOwnLevel" label="不低于自己等级" />
                  </div>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    最低等级设为 0 表示不限制固定等级；开启等级条件时需同时满足所有条件。
                  </p>
                  <div class="flex flex-wrap items-end gap-3">
                    <BaseSwitch v-model="settings.autoAcceptHarvestStealEnabled" label="收偷比过滤" />
                    <BaseInput
                      v-model.number="settings.autoAcceptHarvestStealHarvest"
                      label="收获"
                      type="number"
                      min="0"
                      max="9999"
                      class="w-28"
                      :disabled="!settings.autoAcceptHarvestStealEnabled"
                    />
                    <span class="pb-2 text-xs text-gray-500 dark:text-gray-400">:</span>
                    <BaseInput
                      v-model.number="settings.autoAcceptHarvestStealSteal"
                      label="偷菜"
                      type="number"
                      min="1"
                      max="9999"
                      class="w-28"
                      :disabled="!settings.autoAcceptHarvestStealEnabled"
                    />
                  </div>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    默认按 8:1 比较收获/偷菜数量，不合格的申请会直接拒绝。
                  </p>
                </template>
              </section>
            </div>

            <!-- 偷菜 -->
            <div v-else-if="activeModule === 'steal'" class="space-y-4">
              <section class="feature-section">
                <div class="feature-section-title">
                  偷菜
                </div>
                <div class="feature-switch-grid">
                  <BaseSwitch v-model="settings.automation.friend_steal" label="自动偷菜" />
                </div>
                <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  偷菜需要同时开启「好友」模块的自动好友互动。
                </p>
              </section>
              <section class="feature-section space-y-2">
                <div class="feature-section-title">
                  巡查与延迟
                </div>
                <div class="grid grid-cols-1 gap-1 text-sm text-gray-600 dark:text-gray-300">
                  <div>好友巡查间隔：{{ friendMin && friendMax ? `${friendMin} - ${friendMax} 秒` : '动态计算' }}</div>
                  <div>偷菜操作延迟：{{ stealDelaySeconds || 0 }} 秒</div>
                </div>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  巡查间隔与延迟在「策略设置」里调整；好友农场作物接近成熟时系统会自行加密巡查。
                </p>
                <BaseButton variant="secondary" size="sm" class="mt-2" @click="emit('open-strategy')">
                  去策略设置
                  <span class="i-carbon-arrow-right ml-1" />
                </BaseButton>
              </section>
            </div>

            <!-- 神秘商人 -->
            <div v-else-if="activeModule === 'merchant'" class="space-y-4">
              <section class="feature-section">
                <div class="feature-section-title">
                  购买与提醒
                </div>
                <div class="feature-switch-grid">
                  <BaseSwitch v-model="settings.automation.mystery_shop_auto_buy" label="自动购买" />
                  <BaseSwitch v-model="settings.automation.mystery_shop_arrival_notify" label="到货提醒" />
                  <BaseSwitch
                    v-model="settings.automation.mystery_shop_purchase_notify"
                    label="购买提醒"
                    :disabled="!settings.automation.mystery_shop_auto_buy"
                  />
                </div>
              </section>

              <section v-if="settings.automation.mystery_shop_auto_buy" class="feature-section">
                <div class="feature-section-title">
                  允许使用的货币
                </div>
                <div class="feature-switch-grid">
                  <BaseSwitch v-model="settings.automation.mystery_shop_allow_gold" label="金币" />
                  <BaseSwitch v-model="settings.automation.mystery_shop_allow_coupon" label="点券" />
                  <BaseSwitch v-model="settings.automation.mystery_shop_allow_gold_bean" label="金豆豆" />
                  <BaseSwitch v-model="settings.automation.mystery_shop_allow_diamond" label="钻石" />
                </div>
                <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  自动购买会先按标价币种筛选，再检查余额是否足够；提醒使用「系统设置 → 下线提醒」的推送渠道。
                </p>
              </section>
              <p v-else class="text-xs text-gray-500 dark:text-gray-400">
                到货提醒可单独开启；购买提醒需先打开自动购买。
              </p>
            </div>

            <!-- 日常与活动 -->
            <div v-else class="space-y-4">
              <section class="feature-section">
                <div class="feature-section-title">
                  日常
                </div>
                <div class="feature-switch-grid">
                  <BaseSwitch v-model="settings.automation.task" label="自动做任务" />
                  <BaseSwitch v-model="settings.automation.sell" label="自动卖果实" />
                </div>
              </section>

              <section class="feature-section">
                <div class="feature-section-title">
                  活动中心
                </div>
                <p class="text-sm text-gray-600 dark:text-gray-300">
                  当前版本的活动奖励在「活动中心」手动领取：千星游记、观星礼录、星砂商店、节令活动、鹊桥寄情、雨落成诗、公益花等都在活动中心里操作。
                </p>
                <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  这一版没有活动自动领取开关；活动进度、奖励和道具需要在活动中心逐个页面处理。
                </p>
                <BaseButton variant="secondary" size="sm" class="mt-3" @click="router.push('/activity')">
                  打开活动中心
                  <span class="i-carbon-arrow-up-right ml-1" />
                </BaseButton>
              </section>
            </div>
          </div>

          <footer class="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 dark:border-gray-700 sm:px-6">
            <span class="text-xs text-gray-500 dark:text-gray-400">
              修改后需要保存才会生效
            </span>
            <div class="flex gap-2">
              <BaseButton variant="secondary" size="sm" @click="activeModule = null">
                关闭
              </BaseButton>
              <BaseButton variant="primary" size="sm" :loading="saving" @click="emit('save')">
                保存
              </BaseButton>
            </div>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.feature-grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 1rem;
}

@media (min-width: 768px) {
  .feature-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1280px) {
  .feature-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.feature-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--ui-surface-strong);
  object-fit: contain;
  padding: 4px;
}

.feature-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.feature-summary li {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-surface-strong) 70%, transparent);
  padding: 3px 9px;
  font-size: 11px;
  color: var(--ui-muted);
}

.feature-section {
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  padding: 14px 16px;
  background: color-mix(in srgb, var(--ui-surface-strong) 45%, transparent);
}

.feature-section-title {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-muted);
}

.feature-switch-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

@media (min-width: 640px) {
  .feature-switch-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.feature-switch-grid > * {
  min-height: 42px;
  display: flex;
  align-items: center;
  padding: 9px 11px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-control);
  background: color-mix(in srgb, var(--ui-surface-strong) 58%, transparent);
}

.feature-input-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 639px) {
  .feature-input-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
