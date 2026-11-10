import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import test from 'node:test'

const repo = new URL('../../', import.meta.url)
const read = file => readFileSync(new URL(file, repo), 'utf8')

const defaults = read('core/src/models/store/shared-state.ts')
const config = read('core/src/types/config.ts')
const settingTypes = read('web/src/stores/setting.ts')
const modules = read('web/src/components/settings/AccountFeatureSettings.vue')
const panel = read('web/src/components/IllustratedPanel.vue')
const switches = read('web/src/components/illustrated/IllustratedAutomationSwitches.vue')
const service = read('core/src/services/illustrated-auto.ts')
const worker = read('core/src/core/worker.ts')

test('三个图鉴开关进入配置白名单与类型定义', () => {
  for (const key of ['illustrated_auto_claim_rewards', 'illustrated_auto_buy_missing_seeds', 'illustrated_buy_skip_bag']) {
    assert.match(defaults, new RegExp(`${key}:`), `${key} 在默认配置里`)
    assert.match(config, new RegExp(`${key}: boolean;`), `${key} 在后端类型里`)
    assert.match(settingTypes, new RegExp(`${key}\\?: boolean`), `${key} 在前端类型里`)
  }
  assert.match(defaults, /illustrated_buy_skip_bag: true,/, '一键购买默认跳过背包已有种子')
  assert.match(defaults, /illustrated_auto_buy_missing_seeds: false,/, '自动购买默认关闭，避免误花金币')
})

test('功能模块「日常与活动」提供三个开关与每日一次的说明', () => {
  assert.match(modules, /收藏图鉴/)
  assert.match(modules, /每天检查一次/)
  assert.match(modules, /v-model="automation\.automation\.illustrated_auto_claim_rewards" label="自动领取图鉴奖励"/)
  assert.match(modules, /v-model="automation\.automation\.illustrated_auto_buy_missing_seeds" label="自动购买未点亮种子"/)
  assert.match(modules, /v-model="automation\.automation\.illustrated_buy_skip_bag" label="一键购买跳过背包已有"/)
})

test('奖励详情弹窗内也能直接切换开关，且改完立即保存', () => {
  assert.match(panel, /<IllustratedAutomationSwitches \/>/)
  for (const key of ['illustrated_auto_claim_rewards', 'illustrated_auto_buy_missing_seeds', 'illustrated_buy_skip_bag'])
    assert.match(switches, new RegExp(`model\\('${key}'\\)`), `${key} 在奖励详情里可切换`)
  assert.match(switches, /saveSettings\(id, \{ automation: snapshot \}\)/)
  assert.match(switches, /loadedAccountId\.value/, '避免重复读取设置')
})

test('一键购买按背包过滤，读取失败时停止购买而不是重复下单', () => {
  assert.match(panel, /api\.get\('\/api\/bag\/seeds'/)
  assert.match(panel, /const bagSeedIds = ref<Set<number>>/)
  assert.match(panel, /skipBagExisting\.value && !bagSeedsReady\.value/)
  assert.match(panel, /!skipBagExisting\.value \|\| !bagSeedIds\.value\.has\(Number\(item\.seedId\)\)/)
  assert.match(panel, /已按背包跳过 <b>\{\{ bagSeedSkippedCount \}\}/)
  assert.match(panel, /背包读取失败，暂时不能一键购买/)
})

test('后台每天检查一次：自动领奖 + 自动补种，开关打开后可立即检查', () => {
  assert.match(service, /lastRunDate === today/, '同一天去重')
  assert.match(service, /purchaseSeed\(target\.goodsId, 1\)/, '每种只买 1 个')
  assert.match(service, /getClaimableBookTypes/, '作物与超变两本都领')
  assert.match(worker, /await runIllustratedDailyAutomation\(\)/, '挂在每日例行')
  assert.match(worker, /illustrated_auto_after_save/, '开关由关变开 2 秒后立即检查')
})
