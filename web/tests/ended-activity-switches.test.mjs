import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 设置页「日常与活动」里，已结束活动的自动化开关必须隐藏：
// 留着一个怎么点都不会生效的开关，用户会以为打开了却什么都不发生。
// 这里锁住判定来源（活动窗口常量）与隐藏点，不依赖当前时间。

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const settings = read('../src/components/settings/AccountFeatureSettings.vue')
const windows = read('../src/constants/activity-windows.ts')

test('已结束活动按窗口结束时间隐藏，判定来自同一份常量', () => {
  assert.match(windows, /SHARE_REWARD_ACTIVITY_WINDOW/)
  assert.match(windows, /MILK_TEA_ACTIVITY_WINDOW/)
  assert.match(settings, /from '@\/constants\/activity-windows'/)
  assert.match(settings, /Date\.now\(\) > SHARE_REWARD_ACTIVITY_WINDOW\.endMs/)
  assert.match(settings, /Date\.now\(\) > MILK_TEA_ACTIVITY_WINDOW\.endMs/)
})

test('快乐不独享与奶茶的面板都挂上了隐藏条件', () => {
  assert.match(settings, /v-if="!shareRewardEnded"/)
  assert.match(settings, /<MilkTeaActivityPanel v-if="!milkTeaEnded"/)
})

test('「已开 N 项」只统计仍然可见的开关', () => {
  assert.match(settings, /const visibleActivityKeys = computed\(\(\) => activityKeys\.value\.filter\(activityKeyVisible\)\)/)
  assert.match(settings, /activityEnabledCount = computed\(\(\) => visibleActivityKeys\.value\.filter/)
})

test('永久活动（节令小札、收藏图鉴、日常任务）不会被隐藏', () => {
  assert.match(settings, /star_solar_claim/)
  assert.match(settings, /illustrated_auto_claim_rewards/)
  assert.match(settings, /automation\.automation\.task/)
})
