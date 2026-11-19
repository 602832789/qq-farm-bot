import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import test from 'node:test'

const dashboard = readFileSync(new URL('../src/views/Dashboard.vue', import.meta.url), 'utf8')

/** 取某个样式规则块（到第一个右花括号为止）。 */
function rule(source, selector) {
  const start = source.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `样式块 ${selector} 不存在`)
  return source.slice(start, source.indexOf('}', start))
}

/** 取指定 at-rule 的完整内容，用花括号配对避免被内层规则截断。 */
function atRule(source, query) {
  const start = source.lastIndexOf(query)
  assert.notEqual(start, -1, `规则 ${query} 不存在`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{')
      depth++
    else if (source[i] === '}' && --depth === 0)
      return source.slice(open + 1, i)
  }
  assert.fail(`规则 ${query} 未闭合`)
}

// 运行日志面板按 liyang 版重做：标题 + 四列筛选 + 紧凑日志行。
const panel = dashboard.slice(
  dashboard.indexOf('<div class="flex flex-1 flex-col farm-card rounded-2xl bg-white p-5 shadow-md md:overflow-hidden dark:bg-gray-800">'),
  dashboard.indexOf('<!-- Right Column Stack -->'),
)

test('运行日志：三个下拉 + 关键词 + 搜索/清空按钮齐全', () => {
  assert.ok(panel, '日志面板模板块未找到')
  assert.match(panel, /class="log-filters"/)
  assert.match(panel, /v-model="filter\.module"[\s\S]{0,80}:options="modules"/)
  assert.match(panel, /v-model="filter\.event"[\s\S]{0,80}:options="events"/)
  assert.match(panel, /v-model="filter\.level"[\s\S]{0,80}:options="logLevels"/)
  assert.match(panel, /v-model="filter\.keyword"/)
  assert.match(panel, /title="搜索日志"/)
  assert.match(panel, /title="清空日志"/)
  // 筛选事件下拉仍绑定完整事件列表，「所有事件」是首项。
  assert.match(dashboard, /const events = \[\s*\{ label: '所有事件', value: '' \}/)
})

test('运行日志：行结构为 时间 / 标签 / 正文，重复次数带 ×N 徽标', () => {
  assert.match(panel, /class="log-list/)
  assert.match(panel, /v-for="log in displayLogs"/)
  assert.match(panel, /class="log-row__time"/)
  assert.match(panel, /class="log-row__tag"/)
  assert.match(panel, /class="log-row__body"/)
  assert.match(panel, /class="log-row__repeat"/)
  assert.match(panel, /:class="`log-row--\$\{log\.level === 'info' \? 'success' : log\.level\}`"/)
})

test('运行日志：筛选区窄屏两列、宽屏四列 + 按钮列', () => {
  const filters = rule(dashboard, '.log-filters')
  assert.match(filters, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/, '窄屏两列')

  const wide = atRule(dashboard, '@media (min-width: 640px)')
  assert.match(wide, /grid-template-columns:\s*repeat\(4, minmax\(0, 8\.5rem\)\) auto/, '宽屏四列筛选 + 按钮')
  assert.match(wide, /\.log-filters__buttons[\s\S]*?grid-column:\s*auto/)

  const buttons = rule(dashboard, '.log-filters__buttons')
  assert.match(buttons, /grid-column:\s*1 \/ -1/, '窄屏按钮独占一行')
})

test('运行日志：日志行窄屏折成两列，正文整行铺满', () => {
  const row = rule(dashboard, '.log-row')
  assert.match(row, /grid-template-columns:\s*auto auto minmax\(0, 1fr\)/)

  const phone = atRule(dashboard, '@media (max-width: 640px)')
  assert.match(phone, /\.log-row[\s\S]*?grid-template-columns:\s*auto minmax\(0, 1fr\)/)
  assert.match(phone, /\.log-row__body[\s\S]*?grid-column:\s*1 \/ -1/)
})

test('运行日志：级别筛选接入 displayLogs，且有独立的选项表', () => {
  assert.match(dashboard, /const logLevels = \[/)
  for (const value of ['所有级别', '常规', '警告', '错误'])
    assert.ok(dashboard.includes(`label: '${value}'`), `缺少级别选项 ${value}`)
  assert.match(dashboard, /const displayLogs = computed\(\(\) => visibleLogs\.value\.filter\(log => !filter\.level \|\| log\.level === filter\.level\)\)/)
  assert.match(dashboard, /filter\.module \|\| filter\.event \|\| filter\.keyword \|\| filter\.level/)
})
