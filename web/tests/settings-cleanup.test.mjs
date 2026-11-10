import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import test from 'node:test'

const featureSettings = readFileSync(new URL('../src/components/settings/AccountFeatureSettings.vue', import.meta.url), 'utf8')
const milkPanel = readFileSync(new URL('../src/components/activity/MilkTeaActivityPanel.vue', import.meta.url), 'utf8')
const teaCss = readFileSync(new URL('../src/styles/milk-tea-workbench.css', import.meta.url), 'utf8')

test('功能模块「快乐不独享」去除旁边写死的活动日期', () => {
  const section = featureSettings.match(/<section class="border border-orange-100[\s\S]*?<\/section>/)?.[0] || ''
  assert.ok(section, '快乐不独享区块应存在')
  assert.match(section, /快乐不独享/, '标题保留')
  assert.match(section, /自动分享领取首次分享快乐值/, '说明文案保留')
  assert.doesNotMatch(section, /2026-09-24|2026-10-12/, '固定日期文本已移除')
  assert.doesNotMatch(section, /rounded-full bg-orange-100/, '日期徽标已移除')
  assert.match(section, /share_reward_share/, '自动分享开关保留')
  assert.match(section, /share_reward_daily/, '每日快乐值开关保留')
  assert.match(section, /share_reward_milestones/, '档位奖励开关保留')
})

test('奶茶活动页去除侧栏按钮，头部只留一个文案为「活动中心」的入口', () => {
  assert.doesNotMatch(milkPanel, /tea-workspace-back/, '侧栏按钮已移除')
  assert.doesNotMatch(teaCss, /\.tea-workspace-back/, '对应 CSS 死规则已清理')
  assert.equal((milkPanel.match(/活动中心/g) || []).length, 1, '全页只剩头部「活动中心」这一处')
  assert.doesNotMatch(milkPanel, /返回活动中心/, '按钮文案已简化为四个字')
  assert.match(milkPanel, /class="tea-link tea-header-back"[\s\S]*?活动中心/)
  assert.match(milkPanel, /<span class="i-carbon-arrow-left" aria-hidden="true" \/>活动中心/, '箭头后直接跟四个字')
  assert.match(milkPanel, /<aside class="tea-workspace-nav"[\s\S]*?<img class="tea-workspace-logo"/, '侧栏首个元素改为 logo')
})
