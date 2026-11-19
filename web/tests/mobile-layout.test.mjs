import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import test from 'node:test'

const dashboard = readFileSync(new URL('../src/views/Dashboard.vue', import.meta.url), 'utf8')
const teaCss = readFileSync(new URL('../src/styles/milk-tea-workbench.css', import.meta.url), 'utf8')
const milkPanel = readFileSync(new URL('../src/components/activity/MilkTeaActivityPanel.vue', import.meta.url), 'utf8')
const shopPanel = readFileSync(new URL('../src/components/activity/MilkTeaShopPanel.vue', import.meta.url), 'utf8')

/** 取某个样式规则块（到第一个右花括号为止）。 */
function rule(source, selector) {
  const start = source.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `样式块 ${selector} 不存在`)
  return source.slice(start, source.indexOf('}', start))
}

/** 取最后一个指定媒体查询的完整内容，用花括号配对避免被内层规则截断。 */
function media(source, query) {
  const start = source.lastIndexOf(query)
  assert.notEqual(start, -1, `媒体查询 ${query} 不存在`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{')
      depth++
    else if (source[i] === '}' && --depth === 0)
      return source.slice(open + 1, i)
  }
  assert.fail(`媒体查询 ${query} 未闭合`)
}

// 奶茶样式取最后追加的统一排版块；首页只有一个 639px 断点。
const phoneTea = media(teaCss, '@media (max-width: 639px)')
const phoneDashboard = media(dashboard, '@media (max-width: 639px)')

test('首页状态行再退一格：回到 f5c7d25 之前的原始排布', () => {
  const presence = rule(dashboard, '.ov-presence')
  assert.match(presence, /display:\s*flex/)
  assert.match(presence, /flex-wrap:\s*wrap/, '恢复原始的可换行排布')
  assert.doesNotMatch(presence, /display:\s*grid/, '固定三列栅格已撤销')
  assert.doesNotMatch(dashboard, /ov-presence__digit/, '等宽固定宽度已移除')
  assert.doesNotMatch(dashboard, /ov-presence__uptime/, '离线占位段已移除')
  assert.doesNotMatch(dashboard, /\.ov-account__meta/, '手机端账号头两行栅格已撤销')
})

test('手机端「已运行」落到在线图标下一行，PC 端保持同一行', () => {
  const baseMeta = rule(dashboard, '.ov-presence__meta')
  assert.match(baseMeta, /display:\s*inline-flex/, 'PC 端把运行信息收成一组')
  assert.match(baseMeta, /flex-wrap:\s*nowrap/, '组内不拆散')
  assert.doesNotMatch(baseMeta, /flex:\s*0 0 100%/, '基础规则不能强制换行')
  assert.match(rule(phoneDashboard, '.ov-presence__meta'), /flex:\s*0 0 100%/, '手机端整组独占第二行')
  assert.match(dashboard, /<span class="ov-presence__state"[\s\S]*?<span class="ov-presence__meta">/, '在线图标仍在第一行')
  assert.match(dashboard, /class="ov-presence__meta"[\s\S]*?v-if="isOnline"[\s\S]*?已运行/)
  // PC 端状态行仍是原来的可换行 flex 排布，没有改回固定栅格或 nowrap 单行。
  assert.match(rule(dashboard, '.ov-presence'), /flex-wrap:\s*wrap/)
})

test('奶茶头部：图标、活动名、状态徽章同处一行', () => {
  const titleLine = milkPanel.match(/<div class="tea-title-line">([\s\S]*?)<\/div>/)?.[1] || ''
  assert.match(titleLine, /class="tea-heading-icon"/, '图标必须在标题行内部才能与文字对齐')
  assert.match(titleLine, /<h2>/)
  assert.match(titleLine, /class="tea-badge"/)
  assert.match(rule(teaCss, '.tea-title-line'), /flex-wrap:\s*nowrap/)
  assert.doesNotMatch(teaCss, /\.tea-workbench-heading > img/, '旧选择器已失效，图标应改用 tea-heading-icon')
  assert.match(teaCss, /\.tea-heading-icon/)
})

test('手机端头部两行：标题一行，返回按钮在左、剩余时间与按钮靠右对齐成一行', () => {
  const heading = rule(phoneTea, '.tea-workbench-heading')
  assert.match(heading, /flex-wrap:\s*wrap/)
  assert.match(rule(phoneTea, '.tea-heading-main'), /flex:\s*1 1 100%/, '标题区占满第一行')
  assert.match(rule(phoneTea, '.tea-title-line'), /flex-wrap:\s*nowrap/, '图标/标题/徽章不能折行')
  const tools = rule(phoneTea, '.tea-header-tools')
  assert.match(tools, /flex:\s*1 1 100%/, '工具区独占第二行')
  assert.match(tools, /flex-wrap:\s*nowrap/, '返回按钮、剩余时间与其它按钮不能折行')
  assert.match(tools, /justify-content:\s*flex-end/, '整组靠右')
  const remaining = rule(phoneTea, '.tea-header-tools .tea-remaining')
  assert.match(remaining, /margin-left:\s*auto/, '剩余时间靠右')
  assert.match(remaining, /margin-right:\s*0/, '不能再被 auto 外边距推回左边')
  assert.match(remaining, /white-space:\s*nowrap/, '「剩余 10 天 9 小时」必须整段不换行')
  assert.match(remaining, /font-variant-numeric:\s*tabular-nums/)
  assert.match(milkPanel, /class="tea-remaining">剩余 \{\{ remaining \}\}/)
  assert.doesNotMatch(teaCss, /\.tea-header-tools > span\s*\{\s*margin-right:\s*auto/, '历史窄屏规则不能再把剩余推到左边')
  assert.doesNotMatch(teaCss, /tea-header-tools > span:first-child\s*\{\s*display:\s*none/, '窄屏不能再隐藏剩余时间')
})

test('白色方块返回按钮已移除，头部文字按钮文案为「活动中心」', () => {
  const tools = milkPanel.match(/<div class="tea-header-tools">([\s\S]*?)<\/div>/)?.[1] || ''
  assert.doesNotMatch(tools, /aria-label="[^"]*活动中心"/, '工具行不能再有旧的白色图标返回按钮')
  assert.match(tools, /class="tea-link tea-header-back"[\s\S]*?@click="emit\('back'\)"[\s\S]*?活动中心/)
  assert.doesNotMatch(tools, /返回活动中心/, '按钮文案改为四个字，不再带「返回」')
  assert.ok(tools.indexOf('tea-header-back') < tools.indexOf('tea-remaining'), '返回按钮必须占工具行第一位')
  // 空状态里不再重复放同一个入口，全页只保留头部这一个「活动中心」。
  const emptyState = milkPanel.match(/<div v-else-if="!state" class="tea-state"[\s\S]*?<\/div>/)?.[1] || ''
  assert.doesNotMatch(emptyState, /活动中心/)
  assert.equal((milkPanel.match(/活动中心/g) || []).length, 1)
  const back = rule(teaCss, '.tea-header-back')
  assert.match(back, /background:\s*transparent/, '新按钮不能是白色方块')
  assert.match(back, /white-space:\s*nowrap/, '返回文案不能折行')
})

test('领取收益：PC 与手机端共用同一套栅格，金币与数字一排', () => {
  const claim = rule(teaCss, '.tea-claim')
  assert.match(claim, /display:\s*grid/)
  assert.match(claim, /grid-template-columns:\s*auto minmax\(0, 1fr\) auto/)
  const value = rule(teaCss, '.tea-claim__value')
  assert.match(value, /display:\s*flex/)
  assert.match(value, /flex-wrap:\s*nowrap/, '文案/数值/单位必须在同一排')
  assert.match(value, /white-space:\s*nowrap/)
  assert.match(rule(teaCss, '.tea-claim__value > *'), /flex:\s*none/)
  assert.match(rule(teaCss, '.tea-claim strong'), /overflow-wrap:\s*normal/, '数值不能被 anywhere 拆断')
  assert.match(rule(teaCss, '.tea-claim__extras'), /grid-row:\s*2/, '收银台提示与额外奖励放第二行')
  assert.match(rule(teaCss, '.tea-claim__extras .tea-reward-name'), /display:\s*inline/, '金币名称与数量同排')
  assert.match(rule(teaCss, '.tea-claim__extras .tea-reward > span:last-child'), /white-space:\s*nowrap/)

  // 手机端只缩尺寸，不再另写一套 display/grid 布局，避免 PC 与手机端排布分裂。
  assert.doesNotMatch(rule(phoneTea, '.tea-claim'), /display:\s*(grid|flex)/)
  assert.doesNotMatch(rule(phoneTea, '.tea-claim'), /grid-template-columns/)
  assert.doesNotMatch(rule(phoneTea, '.tea-claim__value'), /display:\s*(grid|flex)/)
  assert.match(shopPanel, /class="tea-claim__value"/)
  assert.match(shopPanel, /class="[^"]*tea-claim__action[^"]*"/)
  assert.match(shopPanel, /class="tea-claim__extras"/)
  assert.doesNotMatch(shopPanel, /class="tea-claim__value">[\s\S]*?tea-rewards/, '数值行里不能再塞奖励图标')
})
