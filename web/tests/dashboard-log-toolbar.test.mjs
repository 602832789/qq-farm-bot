import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import test from 'node:test'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const dashboard = read('../src/views/Dashboard.vue')
const mobile = dashboard.slice(dashboard.indexOf('@media (max-width: 639px)'))

test('手机端「所有事件」与「所有模块」同列同宽', () => {
  const moduleBlock = mobile.match(/\.dashboard-log-module \{([\s\S]*?)\}/)?.[1] || ''
  const eventBlock = mobile.match(/\.dashboard-log-event \{([\s\S]*?)\}/)?.[1] || ''
  assert.match(moduleBlock, /grid-row: 2;/)
  assert.match(moduleBlock, /grid-column: 1;/)
  assert.match(eventBlock, /grid-row: 3;/)
  assert.match(eventBlock, /grid-column: 1;/)
  assert.doesNotMatch(eventBlock, /grid-column: 1 \/ -1/, '不再独占整行，长度与模块下拉一致')
})

test('PC / 宽容器布局保持不变', () => {
  assert.match(dashboard, /@container runtime-log \(min-width: 640px\)/)
  assert.match(dashboard, /grid-template-columns: minmax\(160px, 1fr\) 120px 140px 32px;/)
  assert.match(dashboard, /\.dashboard-log-toolbar \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\) 32px;/)
})

test('首页不再挂载运行诊断模块', () => {
  assert.doesNotMatch(dashboard, /RuntimeDiagnosticsCard/)
  assert.doesNotMatch(dashboard, /运行诊断/)
})
