import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import test from 'node:test'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const panel = read('../src/components/settings/AccountManagementPanel.vue')

test('账号卡片是纵向 flex 容器，才能把剩余高度交给占位吃掉', () => {
  // 只挑 v-for 里那张可点击的账号卡片，页面里还有别的 farm-content-card 容器。
  const cards = [...panel.matchAll(/class="farm-content-card\s([^"]*)"/g)]
    .map(match => match[1])
    .filter(classes => classes.includes('cursor-pointer'))
  assert.equal(cards.length, 1, '找不到账号卡片根节点')
  assert.match(cards[0], /\bflex\b/)
  assert.match(cards[0], /\bflex-col\b/)
})

test('微信专属信息块之后有仅 PC 生效的弹性占位，手机端不渲染', () => {
  const spacer = panel.match(/<div class="hidden sm:block sm:flex-1" aria-hidden="true" \/>/)
  assert.ok(spacer, '缺少 PC 端弹性占位，QQ 卡片的横线会高于微信卡片')
})

test('占位位于续期统计之后、底部分隔线之前，顺序错了对齐不生效', () => {
  const summary = panel.indexOf('wxPreflightSummary(acc)?.text')
  const spacer = panel.indexOf('class="hidden sm:block sm:flex-1"')
  const footer = panel.indexOf('justify-between border-t border-gray-100')
  assert.ok(summary > 0 && spacer > 0 && footer > 0, '定位失败')
  assert.ok(summary < spacer, '占位必须放在微信专属信息之后')
  assert.ok(spacer < footer, '占位必须放在底部分隔线之前')
})

test('底部分隔线行对所有平台都渲染，且保留原有的上间距', () => {
  const footerLine = panel.slice(panel.indexOf('justify-between border-t border-gray-100') - 40)
  const footerTag = footerLine.slice(0, footerLine.indexOf('>') + 1)
  assert.doesNotMatch(footerTag, /v-if/, '底部行不能按平台隐藏，否则 QQ 卡片没有横线')
  assert.match(footerTag, /border-t/)
  assert.match(footerTag, /sm:mt-4/)
  assert.match(footerTag, /sm:pt-4/)
})
