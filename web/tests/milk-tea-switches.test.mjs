import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const read = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')

function loadActivityWindows() {
  const source = read('constants/activity-windows.ts')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  })
  const module = { exports: {} }
  new Function('exports', 'module', 'require', outputText)(module.exports, module, require)
  return module.exports
}

const { MILK_TEA_AUTOMATION_OPTIONS: options } = loadActivityWindows()
const featureSettings = read('components/settings/AccountFeatureSettings.vue')
const milkTeaPanel = read('components/settings/MilkTeaActivityPanel.vue')

test('四个新开关都登记在奶茶自动化选项表', () => {
  const expected = new Map([
    ['milk_tea_seed_buy_coin', '同时购买金币果种子'],
    ['milk_tea_seed_buy_exp', '同时购买经验蘑菇种子'],
    ['milk_tea_fertilizer_buy_normal', '自动购买普通化肥'],
    ['milk_tea_fertilizer_buy_organic', '自动购买有机肥料'],
  ])
  for (const [key, label] of expected) {
    const option = options.find(item => item.key === key)
    assert.ok(option, `缺少开关 ${key}`)
    assert.equal(option.label, label)
    assert.equal(option.businessOnly, true, `${key} 应归在店铺经营组`)
  }
})

test('两个种子附加开关依赖主开关，两个化肥开关完全独立', () => {
  assert.equal(options.find(item => item.key === 'milk_tea_seed_buy_coin').requires, 'milk_tea_seed_buy')
  assert.equal(options.find(item => item.key === 'milk_tea_seed_buy_exp').requires, 'milk_tea_seed_buy')
  assert.equal(options.find(item => item.key === 'milk_tea_fertilizer_buy_normal').requires, undefined)
  assert.equal(options.find(item => item.key === 'milk_tea_fertilizer_buy_organic').requires, undefined)
})

test('设置面板随主开关禁用附加开关，推荐全自动也不默认勾选', () => {
  assert.match(milkTeaPanel, /:disabled="isOptionDisabled\(option\)"/)
  assert.match(milkTeaPanel, /!!option\.requires && !automation\.value\.automation\[option\.requires\]/)
  assert.match(milkTeaPanel, /conditionalSeedKeys/)
  assert.match(milkTeaPanel, /automation\.value\.automation\[key\] = !conditionalSeedKeys\.has\(key\)/)
  assert.match(milkTeaPanel, /默认关闭，仅在/)
  assert.match(milkTeaPanel, /互相独立，也不受购种开关影响/)
})

test('新开关落在「功能模块 → 日常与活动 → 奶茶活动」分类下', () => {
  assert.match(featureSettings, /activity: \{ title: '日常与活动'/)
  assert.match(featureSettings, /<MilkTeaActivityPanel/)
  assert.match(featureSettings, /MILK_TEA_AUTOMATION_OPTIONS/)
  assert.match(milkTeaPanel, /aria-label="奶茶活动自动化"/)
  assert.match(milkTeaPanel, /v-for="option in businessOptions"/)
})

test('主开关未开启时，附加开关不计入活动已开启数', () => {
  assert.match(featureSettings, /milkTeaOptionEffective/)
  assert.match(featureSettings, /milkTeaSettings\.value\.filter\(milkTeaOptionEffective\)/)
})
