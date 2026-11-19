import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import test from 'node:test'

const bookOverview = readFileSync(new URL('../src/components/illustrated/BookOverview.vue', import.meta.url), 'utf8')
const teaCss = readFileSync(new URL('../src/styles/milk-tea-workbench.css', import.meta.url), 'utf8')
const shopPanel = readFileSync(new URL('../src/components/activity/MilkTeaShopPanel.vue', import.meta.url), 'utf8')

/** 取某个样式规则块（到第一个右花括号为止）。 */
function rule(source, selector) {
  const start = source.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `样式块 ${selector} 不存在`)
  return source.slice(start, source.indexOf('}', start))
}

test('收藏图鉴「作物图鉴」与「已收藏 x / y」等高对齐，字号保持不变', () => {
  const heading = rule(bookOverview, '.book-overview__heading')
  assert.match(heading, /align-items:\s*center/, '改用垂直居中，避免大小字号按基线对齐显得一高一低')
  assert.doesNotMatch(heading, /align-items:\s*baseline/)
  assert.match(heading, /--book-heading-line:\s*20px/, '以计数行高作为统一高度基准')

  const title = rule(bookOverview, '.book-overview__heading h3')
  const caption = rule(bookOverview, '.book-overview__caption')
  assert.match(title, /line-height:\s*var\(--book-heading-line\)/, '标题与计数共用同一高度')
  assert.match(caption, /line-height:\s*var\(--book-heading-line\)/, '计数行高即基准')
  assert.match(title, /font-size:\s*15px/, '标题字号不变')
  assert.match(caption, /font-size:\s*12px/, '计数字号不变')
  assert.doesNotMatch(title, /line-height:\s*1\.3/, '不再用标题自身的 1.3 行高')
})

test('奶茶「普通奶茶 · 不限量供应 · 3 券 / 杯」与「账号设置 / 自动化状态」左边缘一致', () => {
  const basic = rule(teaCss, '.tea-stock-basic')
  assert.match(basic, /padding:\s*10px 0 0/, '去掉 10px 水平内距')
  assert.doesNotMatch(basic, /padding:\s*10px 10px 0/)
  assert.doesNotMatch(rule(teaCss, '.tea-actions'), /padding/, '账号设置行本身无内距，是左对齐基准')
  assert.match(rule(teaCss, '.tea-stock-grid'), /padding:\s*15px 0/, '库存栅格也没有额外左右缩进')

  const basicTag = shopPanel.match(/<div class="tea-stock-basic">([\s\S]*?)<\/div>/)?.[1] || ''
  assert.match(basicTag, /不限量供应/, '普通奶茶行仍在该容器内')
  const actionsTag = shopPanel.match(/<div class="tea-actions">([\s\S]*?)<\/div>/)?.[1] || ''
  assert.match(actionsTag, /账号设置 \/ 自动化状态/, '基准行仍在该容器内')
})
