import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// eslint-disable-next-line test/no-import-node-test
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

/** 取指定媒体查询的完整内容，用花括号配对避免被内层规则截断。 */
function media(source, query, last = true) {
  const start = last ? source.lastIndexOf(query) : source.indexOf(query)
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

// Dashboard 有两个 639px 块，账号头布局在第一个；奶茶样式取最后追加的统一排版块。
const phoneDashboard = media(dashboard, '@media (max-width: 639px)', false)
const phoneTea = media(teaCss, '@media (max-width: 639px)')

test('首页「已运行 + 时长 + 微信/QQ」是固定三列栅格，位置与内容长短无关', () => {
  const presence = rule(dashboard, '.ov-presence')
  assert.match(presence, /display:\s*grid/)
  assert.match(presence, /grid-template-columns:\s*56px 152px 36px/, '三列宽度必须写死')
  assert.match(presence, /justify-content:\s*start/)
  assert.match(presence, /white-space:\s*nowrap/)
  assert.match(presence, /flex-wrap:\s*nowrap/)
})

test('平台标签常驻占位，数据未到或离线都不抽掉整列', () => {
  assert.doesNotMatch(dashboard, /v-if="platformLabel"/, 'v-if 会让「微信」出现/消失时整行重排')
  assert.match(dashboard, /ov-presence__platform" :class="\{ 'is-placeholder': !platformLabel \}/)
  assert.match(dashboard, /\.ov-presence__platform\.is-placeholder/)
  assert.match(rule(dashboard, '.ov-presence__digit'), /min-width:\s*8ch/)
})

test('手机端状态行独占第二行，不再被头像和「我的农场」按钮挤压裁剪', () => {
  const head = rule(phoneDashboard, '.ov-account__head')
  assert.match(head, /display:\s*grid/)
  assert.match(head, /grid-template-columns:\s*44px minmax\(0, 1fr\) auto/)
  assert.match(rule(phoneDashboard, '.ov-account__meta'), /display:\s*contents/, '名字留在第一行、状态行落到第二行')
  const presence = rule(phoneDashboard, '.ov-presence')
  assert.match(presence, /grid-column:\s*1 \/ -1/)
  assert.match(presence, /grid-row:\s*2/)
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

test('手机端奶茶头部两行固定：标题一行、剩余时间与工具按钮一行', () => {
  const heading = rule(phoneTea, '.tea-workbench-heading')
  assert.match(heading, /flex-wrap:\s*wrap/)
  assert.match(rule(phoneTea, '.tea-heading-main'), /flex:\s*1 1 100%/, '标题区占满第一行')
  assert.match(rule(phoneTea, '.tea-title-line'), /flex-wrap:\s*nowrap/, '图标/标题/徽章不能折行')
  const tools = rule(phoneTea, '.tea-header-tools')
  assert.match(tools, /flex:\s*1 1 100%/, '工具区独占第二行')
  assert.match(tools, /flex-wrap:\s*nowrap/, '剩余时间与按钮不能折行')
  const remaining = rule(phoneTea, '.tea-header-tools .tea-remaining')
  assert.match(remaining, /white-space:\s*nowrap/, '「剩余 10 天 10 小时」必须整段不换行')
  assert.match(remaining, /font-variant-numeric:\s*tabular-nums/)
  assert.match(milkPanel, /class="tea-remaining">剩余 \{\{ remaining \}\}/)
  assert.doesNotMatch(teaCss, /tea-header-tools > span:first-child\s*\{\s*display:\s*none/, '窄屏不能再隐藏剩余时间')
})

test('手机端「待领取收益 198 奶茶券」固定三列且不换行', () => {
  const claim = rule(phoneTea, '.tea-claim')
  assert.match(claim, /display:\s*grid/)
  assert.match(claim, /grid-template-columns:\s*28px minmax\(0, 1fr\) auto/)
  assert.match(claim, /flex-wrap:\s*nowrap/)
  const value = rule(phoneTea, '.tea-claim__value')
  assert.match(value, /flex-wrap:\s*nowrap/, '文案/数值/单位必须在同一排')
  assert.match(value, /white-space:\s*nowrap/)
  assert.match(rule(phoneTea, '.tea-claim__value strong'), /overflow-wrap:\s*normal/, '数值不能被 anywhere 拆断')
  assert.match(rule(phoneTea, '.tea-claim__extras'), /grid-row:\s*2/, '收银台提示与额外奖励放第二行，不挤压数值行')
  assert.match(shopPanel, /class="tea-claim__value"/)
  assert.match(shopPanel, /class="[^"]*tea-claim__action[^"]*"/)
  assert.match(shopPanel, /class="tea-claim__extras"/)
  assert.doesNotMatch(shopPanel, /class="tea-claim__value">[\s\S]*?tea-rewards/, '数值行里不能再塞奖励图标')
})
