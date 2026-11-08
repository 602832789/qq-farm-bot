import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const dashboard = readFileSync(new URL('../src/views/Dashboard.vue', import.meta.url), 'utf8')

test('今日统计模块的数值后面不再带单位「次」', () => {
  assert.doesNotMatch(dashboard, />次<\/small>/, '金币/经验/动作项后面的「次」单位已全部移除')
  assert.doesNotMatch(dashboard, /todayGoldGained \}\}<small[^>]*>次</)
  assert.doesNotMatch(dashboard, /todayExpGained \}\}<small[^>]*>次</)
  assert.doesNotMatch(dashboard, /\{\{ val \}\}<small[^>]*>次</)
})

test('移除单位后仍保留数字、负数配色与动作统计列表', () => {
  assert.match(dashboard, /\{\{ todayGoldGained \}\}/)
  assert.match(dashboard, /\{\{ todayExpGained \}\}/)
  assert.match(dashboard, /\{\{ val \}\}/)
  assert.match(dashboard, /class="ov-today-gold text-sm font-bold 2xl:text-base" :class="\{ 'is-down': todayGoldGained < 0 \}"/)
  assert.match(dashboard, /v-for="\[key, val\] in operationGroups.active"/)
})

test('运行日志里的「连续重复 N 次」文案不受影响', () => {
  assert.match(dashboard, /连续重复 \$\{log\.repeatCount\} 次/)
})
