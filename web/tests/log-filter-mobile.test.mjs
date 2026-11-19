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

const phone = atRule(dashboard, '@media (max-width: 639px)')
const wide = atRule(dashboard, '@container runtime-log (min-width: 640px)')

test('运行日志筛选：两个下拉各自有可定位的栅格容器', () => {
  const toolbar = dashboard.match(/<div class="dashboard-log-toolbar">([\s\S]*?)<\/div>\s*<div class="dashboard-log-summary">/)?.[1] || ''
  assert.ok(toolbar, '筛选栏模板块未找到')
  assert.match(toolbar, /<div class="dashboard-log-module">[\s\S]*?v-model="filter\.module"[\s\S]*?<\/div>/)
  assert.match(toolbar, /<div class="dashboard-log-event">[\s\S]*?v-model="filter\.event"[\s\S]*?<\/div>/)
  assert.match(toolbar, /class="dashboard-log-reset"[\s\S]*?title="重置筛选"/)
  // 筛选事件下拉仍绑定完整事件列表，「所有事件」是首项。
  assert.match(dashboard, /const events = \[\s*\{ label: '所有事件', value: '' \}/)
  assert.match(toolbar, /:options="events"/)
})

test('手机端「所有事件」与「所有模块」同列同宽，不再被 32px 重置按钮列挤压', () => {
  const toolbar = rule(phone, '.dashboard-log-toolbar')
  assert.match(toolbar, /grid-template-columns:\s*minmax\(0, 1fr\) 32px/, '手机端只留「内容 + 重置按钮」两列')
  assert.doesNotMatch(toolbar, /minmax\(0, 1fr\) minmax\(0, 1fr\) 32px/, '旧三列排布已撤销')

  const search = rule(phone, '.dashboard-log-search')
  assert.match(search, /grid-row:\s*1/, '搜索框在第一行')
  assert.match(search, /grid-column:\s*1 \/ -1/, '搜索框保持整行宽度')

  const moduleRule = rule(phone, '.dashboard-log-module')
  assert.match(moduleRule, /grid-row:\s*2/)
  assert.match(moduleRule, /grid-column:\s*1/)

  const eventRule = rule(phone, '.dashboard-log-event')
  assert.match(eventRule, /grid-row:\s*3/, '事件下拉独立一行')
  assert.match(eventRule, /grid-column:\s*1/, '事件下拉与模块下拉同列同宽')
  assert.doesNotMatch(eventRule, /grid-column:\s*1 \/ -1/, '不再独占整行，长度与「所有模块」一致')

  const reset = rule(phone, '.dashboard-log-reset')
  assert.match(reset, /grid-row:\s*2/, '重置按钮与模块筛选同行，不额外占一行')
  assert.match(reset, /grid-column:\s*2/)
  assert.match(reset, /justify-self:\s*end/)
})

test('PC 端筛选栏仍是原来一行四列的排布', () => {
  assert.match(rule(wide, '.dashboard-log-toolbar'), /grid-template-columns:\s*minmax\(160px, 1fr\) 120px 140px 32px/)
  assert.match(rule(wide, '.dashboard-log-search'), /grid-column:\s*auto/)
  assert.doesNotMatch(wide, /dashboard-log-event/, '宽屏不套用手机端的换行规则')
})
