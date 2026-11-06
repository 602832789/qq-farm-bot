<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { MILK_TEA_AUTOMATION_OPTIONS } from '@/constants/activity-windows'

const automation = defineModel<any>('automation', { required: true })
const advancedOpen = ref(false)

// 旧版把收益类开关和店铺经营类开关混排在三列里，这里保留同样的分组顺序。
const rewardOptions = computed(() => MILK_TEA_AUTOMATION_OPTIONS.filter(item => !item.businessOnly))
const businessOptions = computed(() => MILK_TEA_AUTOMATION_OPTIONS.filter(item => item.businessOnly))
const allKeys = computed(() => MILK_TEA_AUTOMATION_OPTIONS.map(item => item.key as string))
// 「同时购买金币果/经验蘑菇种子」是附加范围，默认不买，也不纳入推荐全自动。
const conditionalSeedKeys = new Set(['milk_tea_seed_buy_coin', 'milk_tea_seed_buy_exp'])

/** 带 requires 的开关只在主开关开启时可用，与后端门闸一致。 */
function isOptionDisabled(option: { requires?: string }) {
  return !!option.requires && !automation.value.automation[option.requires]
}

const interactionOptions = [
  { label: '宣传推广（推荐）', value: 1 },
  { label: '花式摇杯', value: 2 },
  { label: '招牌试饮', value: 3 },
  { label: '划水摸鱼（可能工资减半）', value: 4 },
  { label: '申请涨薪（可能工资减半）', value: 5 },
]
const durationOptions = [
  { label: '4 小时 · 40 券（推荐）', value: 1 },
  { label: '12 小时 · 130 券', value: 2 },
  { label: '24 小时 · 270 券', value: 3 },
]
const talentOptions = [
  { label: '随机雇佣', value: 0 },
  { label: '金牌销售', value: 9001 },
  { label: '金牌宣传', value: 9002 },
  { label: '金牌服务', value: 9003 },
  { label: '实习员工', value: 9004 },
]

function recommend() {
  for (const key of allKeys.value)
    automation.value.automation[key] = !conditionalSeedKeys.has(key)
  automation.value.automation.milk_tea_interaction_type = 1
  if (![1, 2, 3].includes(automation.value.automation.milk_tea_hire_duration))
    automation.value.automation.milk_tea_hire_duration = 1
}
</script>

<template>
  <section class="min-w-0 border border-orange-200 rounded-xl bg-orange-50/60 p-4 space-y-4 dark:border-orange-800 dark:bg-orange-900/10" aria-label="奶茶活动自动化">
    <div class="space-y-1">
      <h3 class="text-base text-gray-900 font-semibold dark:text-gray-100">
        奶茶热销中
      </h3>
      <p class="text-sm text-gray-600 dark:text-gray-300">
        独立开关默认关闭，保存后生效。每轮最多执行少量操作，让位于成熟收获与好友抢收。
      </p>
    </div>

    <BaseButton variant="primary" class="min-h-11" @click="recommend">
      推荐全自动（保留目标与额度）
    </BaseButton>
    <p class="text-sm text-gray-600 dark:text-gray-300">
      推荐配置只修改当前表单，保存后生效；开启收益领取、工资、分享、基金、升级、制作、雇佣、工作互动、购种与两种化肥自动购买。金币果与经验蘑菇种子默认不勾选。
    </p>

    <div class="grid grid-cols-1 gap-2 md:grid-cols-3">
      <BaseSwitch
        v-for="option in rewardOptions"
        :key="option.key"
        v-model="automation.automation[option.key]"
        class="min-h-11"
        :label="option.label"
      />
    </div>

    <div class="space-y-2">
      <div class="text-sm text-gray-900 font-semibold dark:text-gray-100">
        店铺经营
      </div>
      <div class="grid grid-cols-1 gap-2 md:grid-cols-3">
        <BaseSwitch
          v-for="option in businessOptions"
          :key="option.key"
          v-model="automation.automation[option.key]"
          class="min-h-11"
          :label="option.label"
          :disabled="isOptionDisabled(option)"
          :title="option.requires ? '需先开启「自动购买已解锁种子」' : undefined"
        />
      </div>
    </div>

    <p class="text-sm text-gray-600 dark:text-gray-300">
      「同时购买金币果种子」「同时购买经验蘑菇种子」默认关闭，仅在「自动购买已解锁种子」开启时生效；不勾选时只兑换活动奶茶种子（森野系列），额度或余额不足时依次往下让位。
    </p>
    <p class="text-sm text-gray-600 dark:text-gray-300">
      「自动购买普通化肥」「自动购买有机肥料」互相独立，也不受购种开关影响，开启后按兑换商店限购与余额自动补充。
    </p>

    <p class="text-sm text-gray-600 dark:text-gray-300">
      制作消耗整组果实库存，最多 100 组，实际杯数以游戏结果为准。不会购买喇叭或花钻石，喇叭只使用现有库存。
    </p>
    <p class="text-sm text-gray-600 dark:text-gray-300">
      免费开店仅在确认未开业时使用“奶茶小店”，保留已有店名；已解锁且达标的免费基金随自动领奖处理，不会购买基金。
    </p>

    <button
      type="button"
      class="min-h-11 rounded-lg px-2 text-sm text-orange-800 underline dark:text-orange-200 focus-visible:outline-2"
      :aria-expanded="advancedOpen"
      @click="advancedOpen = !advancedOpen"
    >
      {{ advancedOpen ? '收起高级预算' : '展开高级预算' }}
    </button>

    <div v-if="advancedOpen" class="grid grid-cols-1 min-w-0 gap-4 sm:grid-cols-2">
      <BaseSelect
        v-model="automation.automation.milk_tea_hire_duration"
        label="雇佣班次"
        :options="durationOptions"
        :disabled="!automation.automation.milk_tea_hire"
      />
      <BaseSelect
        v-model="automation.automation.milk_tea_hire_primary_talent"
        label="首选员工优先级"
        :options="talentOptions"
        :disabled="!automation.automation.milk_tea_hire"
      />
      <BaseSelect
        v-model="automation.automation.milk_tea_hire_backup_talent"
        label="备用员工优先级"
        :options="talentOptions"
        :disabled="!automation.automation.milk_tea_hire || automation.automation.milk_tea_hire_primary_talent === 0"
      />
      <BaseSelect
        v-model="automation.automation.milk_tea_interaction_type"
        label="互动方式"
        :options="interactionOptions"
        :disabled="!automation.automation.milk_tea_interact"
      />
    </div>
    <p class="text-xs text-gray-500 dark:text-gray-400">
      仅执行当前班次明确提供的所选互动；缺少选项时跳过。雇佣按班次扣券，未确认的费用不会重复消耗。
    </p>
  </section>
</template>
