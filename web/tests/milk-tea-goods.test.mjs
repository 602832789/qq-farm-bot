import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')

function loadTeaUtils() {
  const source = readFileSync(new URL('../src/utils/milk-tea.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  })
  const module = { exports: {} }
  new Function('exports', 'module', 'require', outputText)(module.exports, module, require)
  return module.exports
}

const tea = loadTeaUtils()
const phase = 'business'

function goods(overrides = {}) {
  return {
    id: '339',
    name: '森野甜莓种子',
    category_tag: 'seed',
    items: [],
    costs: [{ id: '1001', count: '10000' }],
    purchase_limit: 24,
    remaining: 23,
    unlocked: true,
    affordable: true,
    paid: false,
    maxPurchasable: 10,
    ...overrides,
  }
}

test('limited goods: purchase max is capped by remaining stock, balance and the 9999 protocol limit', () => {
  assert.equal(tea.teaPurchaseMax(goods()), 10)
  assert.equal(tea.teaPurchaseMax(goods({ maxPurchasable: 50, remaining: 23 })), 23)
  assert.equal(tea.teaPurchaseMax(goods({ maxPurchasable: 20000, remaining: 50000 })), 9999)
  assert.equal(tea.teaGoodsReason(goods({ remaining: 0, maxPurchasable: 0 }), phase), '限购已用完')
})

test('unlimited goods (remaining null) are not treated as sold out', () => {
  const unlimited = goods({ purchase_limit: 0, remaining: null, maxPurchasable: 120 })
  assert.equal(tea.teaGoodsReason(unlimited, phase), '')
  assert.equal(tea.teaPurchaseMax(unlimited), 120)
})

test('diamond costs, locked goods and settlement-phase seeds still block purchase', () => {
  assert.equal(tea.teaGoodsReason(goods({ paid: true, costs: [{ id: '1004', count: '6' }] }), phase), '不支持钻石购买')
  assert.equal(tea.teaGoodsReason(goods({ unlocked: false, cond_hints: [{ satisfied: false, cond_type: 'milk_tea_store_level', target: 3 }] }), phase), '店铺 3 级解锁')
  assert.equal(tea.teaGoodsReason(goods(), 'settling'), '结算期不可兑换种子')
})
