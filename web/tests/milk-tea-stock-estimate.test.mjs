import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import test from 'node:test'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const utils = read('../src/utils/milk-tea.ts')
const panel = read('../src/components/activity/MilkTeaShopPanel.vue')

test('预计支撑时间按库存 ÷ 销售速度计算，不再截断到营业结算时间', () => {
  assert.match(utils, /const seconds = cups <= BigInt\(Number\.MAX_SAFE_INTEGER\)[\s\S]*?\/ speed \* 3600/)
  assert.doesNotMatch(utils, /Math\.min\(rawUntil, state\.settleTime\)/, '截断点会让两个库存不同的账号显示同一倒计时')
  assert.match(utils, /const until = seconds !== null/)
  assert.match(utils, /\? now \+ seconds/)
  assert.match(utils, /const capped = until !== null/)
  assert.match(utils, /until > state\.settleTime/)
})

test('面板直接展示可售秒数，库存撑过结算时给出说明', () => {
  assert.match(panel, /estimate\.value\.seconds !== null/)
  assert.doesNotMatch(panel, /estimate\.value\.until \?/)
  assert.match(panel, /超过本次营业截止/)
  assert.match(panel, /实际以活动结算时间为准/)
})
