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

test('状态行排布退回 f5c7d25 之前：允许换行、无等宽固定列', () => {
  const presence = block('.ov-presence')
  assert.match(presence, /display:\s*flex/)
  assert.match(presence, /flex-wrap:\s*wrap/, '恢复原始的可换行排布')
  assert.doesNotMatch(presence, /overflow:\s*hidden/, '不再用裁剪兜底')
  assert.doesNotMatch(source, /ov-presence__digit/, '等宽固定宽度已移除')
  assert.doesNotMatch(source, /ov-presence__uptime/, '离线占位段已移除')
  assert.doesNotMatch(source, /ov-presence__platform/, '平台标签固定列已移除')
})

test('「已运行」与平台标签恢复按数据显隐', () => {
  assert.match(source, /v-if="isOnline" class="ov-presence__item"><span class="i-carbon-time" \/>已运行/)
  assert.match(source, /v-if="platformLabel" class="ov-presence__item">\{\{ platformLabel \}\}/)
})

test('PC 端已运行仍与在线图标同一行，只有手机端才换行', () => {
  assert.match(source, /class="ov-presence__meta"/, '运行信息需要收成一组')
  const base = block('.ov-presence__meta')
  assert.match(base, /display:\s*inline-flex/)
  assert.match(base, /flex-wrap:\s*nowrap/, '整组不能被拆散')
  assert.doesNotMatch(base, /flex:\s*0 0 100%/, '基础规则不能强制换行，PC 端保持原排布')
  const phone = source.slice(source.lastIndexOf('@media (max-width: 639px)'))
  assert.match(phone, /\.ov-presence__meta\s*\{[\s\S]*?flex:\s*0 0 100%/, '639px 以下整组独占第二行')
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
