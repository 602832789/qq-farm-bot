import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const repo = new URL('../../', import.meta.url)
const read = file => readFileSync(new URL(file, repo), 'utf8')

const land = read('core/src/services/farm/land-analysis.ts')
const planting = read('core/src/services/farm/planting.ts')
const settings = read('web/src/components/settings/AccountFeatureSettings.vue')
const defaults = read('core/src/models/store/shared-state.ts')

test('快成熟判定阈值改为每轮随机，上限封顶 300 秒', () => {
  assert.match(land, /const SMART_MATURE_RANDOM_CAP_SEC = 300;/)
  assert.match(land, /function pickSmartMatureThreshold\(/)
  assert.match(land, /Math\.min\(SMART_MATURE_RANDOM_CAP_SEC, configured\)/)
  const exportsBlock = land.slice(land.lastIndexOf('module.exports'))
  assert.match(exportsBlock, /pickSmartMatureThreshold,/, '随机函数已导出')
  assert.match(exportsBlock, /SMART_MATURE_RANDOM_CAP_SEC,/, '上限常量已导出')
})

test('smart 施肥分支调用随机阈值，不再直接吃固定配置值', () => {
  assert.match(planting, /pickSmartMatureThreshold\(automation\.fertilizer_smart_seconds\)/)
  assert.match(planting, /getFastMatureLands\(latest && latest\.lands, smartSeconds\)/, '判定函数入参不变')
  assert.doesNotMatch(planting, /toNum\(automation\.fertilizer_smart_seconds\) \|\| 300/, '旧的固定阈值已移除')
})

test('设置页保留输入上限并说明随机行为，默认值仍是 300', () => {
  assert.match(settings, /label="快成熟判定"/)
  assert.match(settings, /随机上限/)
  assert.match(settings, /上限 300 秒/)
  assert.match(defaults, /fertilizer_smart_seconds: 300,/)
})
