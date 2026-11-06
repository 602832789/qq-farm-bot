import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const source = readFileSync(new URL('../src/views/Dashboard.vue', import.meta.url), 'utf8')

function block(selector) {
  const start = source.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `样式块 ${selector} 不存在`)
  const end = source.indexOf('}', start)
  return source.slice(start, end)
}

test('首页状态行不换行，避免时长进位/平台标签变化时跳到第二行', () => {
  const presence = block('.ov-presence')
  assert.match(presence, /flex-wrap:\s*nowrap/, '状态行必须 nowrap，否则宽度变化会触发换行')
  assert.doesNotMatch(presence, /flex-wrap:\s*wrap\b/, '不能再出现 flex-wrap: wrap')
})

test('在线状态与平台标签同时存在时，两者都不使用 v-if 抽掉整段', () => {
  // 已运行：离线保留占位（is-placeholder），平台标签才允许按数据缺失隐藏。
  assert.match(source, /ov-presence__uptime" :class="\{ 'is-placeholder': !isOnline \}"/)
  assert.doesNotMatch(source, /<span v-if="isOnline" class="ov-presence__item"><span class="i-carbon-time"/, '离线不应直接抽掉已运行整段')
})

test('时长数字使用等宽固定最小宽度', () => {
  const digit = block('.ov-presence__digit')
  assert.match(digit, /min-width:\s*8ch/)
  assert.match(digit, /font-variant-numeric:\s*tabular-nums/)
  assert.match(digit, /white-space:\s*nowrap/)
})

test('已运行时长单调递增：不再用每秒自增 + 整包覆盖的双写', () => {
  assert.doesNotMatch(source, /localUptime\.value\+\+/, '不能再用每秒 ++ 覆盖 computed')
  assert.match(source, /const localUptime = computed\(/, 'localUptime 应为 computed（锚点 + 本地时间差）')
  assert.match(source, /uptimeAnchorSec/, '需要有服务端锚点')
  assert.match(source, /uptimeAnchorAt/, '需要记录锚点接收时刻')
})

test('账号重启导致 uptime 归零时必须允许重新锚定', () => {
  assert.match(source, /rolledBack/, '需要区分抖动回退与重启归零')
  assert.match(source, /next \+ 60 < projected/, '大幅回退（重启）应重新锚定，而不是被单调保护挡住')
})

test('平台标签缓存：账号列表刷新失败的瞬间不闪掉', () => {
  assert.match(source, /const platformLabel = ref\(''\)/, '平台标签应缓存为 ref，而不是直接 computed')
  assert.doesNotMatch(source, /const platformLabel = computed\(/, '重复定义会与缓存版冲突')
})
