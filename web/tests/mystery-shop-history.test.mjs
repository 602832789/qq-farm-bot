import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const solar = read('../src/views/SolarCalendar.vue')
const panel = read('../src/components/commerce/MysteryShopPanel.vue')
const store = read('../src/stores/commerce.ts')
const settings = read('../src/components/settings/AccountFeatureSettings.vue')

/** 取某个样式规则块（到第一个右花括号为止）。 */
function rule(source, selector) {
  const start = source.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `样式块 ${selector} 不存在`)
  return source.slice(start, source.indexOf('}', start))
}

test('节令日历自身提供滚动容器，活动详情外壳不再裁掉手机端内容', () => {
  const solarRule = rule(solar, '.solar')
  assert.match(solarRule, /overflow-y:\s*auto/, '页面自身滚动')
  assert.match(solarRule, /min-height:\s*0/, 'flex 子项允许收缩')
  assert.match(solarRule, /overscroll-behavior:\s*contain/, '滚动不外溢到外层')
})

test('神秘商人页面展示购买历史，含空态与手动/自动来源', () => {
  assert.match(panel, /aria-label="神秘商人购买历史"/)
  assert.match(panel, /暂无购买记录，手动和自动购买都会记录在这里。/)
  assert.match(panel, /record\.source === 'auto' \? '自动购买' : '手动购买'/)
  assert.match(panel, /共 \{\{ mysteryHistory\.length \}\} 次/)
  assert.match(panel, /保留最近 100 条/)
  assert.match(panel, /commerceStore\.fetchMysteryHistory\(id\)/, '进入页面 / 切账号时读取记录')
  assert.match(panel, /historySummary/, '按货币汇总累计花费')
})

test('store 暴露购买历史并在购买成功后自动刷新', () => {
  assert.match(store, /const mysteryHistory = ref<MysteryHistoryRecord\[\]>\(\[\]\)/)
  assert.match(store, /async function fetchMysteryHistory/)
  assert.match(store, /api\.get\('\/api\/mystery-shop\/history'/)
  assert.match(store, /void fetchMysteryHistory\(id\)/, '购买成功后刷新记录')
  assert.match(store, /mysteryHistory\.value = \[\]/, '重置时清空，避免串账号')
})

test('功能模块神秘商人补齐钻石货币开关', () => {
  assert.match(settings, /v-model="automation\.automation\.mystery_shop_allow_diamond" label="钻石"/)
  assert.match(settings, /mystery_shop_allow_diamond && '钻石'/)
  assert.match(settings, /grid gap-3 lg:grid-cols-4 sm:grid-cols-2/, '四种货币同组展示')
})
