import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import test from 'node:test'

const dashboard = readFileSync(new URL('../src/views/Dashboard.vue', import.meta.url), 'utf8')

test('今日金币是净值，不再被 Math.max(0) 夹成 0', () => {
  assert.match(dashboard, /const todayGoldGained = computed\(\(\) => Number\(status\.value\?\.sessionGoldGained\) \|\| 0\)/)
  assert.doesNotMatch(dashboard, /todayGoldGained = computed\(\(\) => Math\.max\(0,/)
  assert.match(dashboard, /const todayExpGained = computed\(\(\) => Math\.max\(0,/, '经验只增不减，保持非负')
})

test('金币为负时仍进入统计区，而不是落到「等待第一份收获」空态', () => {
  assert.match(dashboard, /!operationGroups\.active\.length && todayGoldGained === 0 && todayExpGained === 0/)
  assert.doesNotMatch(dashboard, /todayGoldGained <= 0 && todayExpGained <= 0/)
})

test('负数数字使用与资产「本次运行金币」同一个负向色 token', () => {
  assert.match(dashboard, /class="ov-today-gold text-sm font-bold 2xl:text-base" :class="\{ 'is-down': todayGoldGained < 0 \}"/)
  assert.match(dashboard, /\.ov-today-gold\.is-down \{\s*color: var\(--ui-danger\);\s*\}/)
  assert.match(dashboard, /\.ov-tile__delta\.is-down \{\s*color: var\(--ui-danger\);\s*\}/, '资产里的负数配色基准')
  assert.match(dashboard, /本次 \{\{ \(status\?\.runGoldGained \|\| 0\) > 0 \? '\+' : '' \}\}/, '资产负号由数值自带')
})
