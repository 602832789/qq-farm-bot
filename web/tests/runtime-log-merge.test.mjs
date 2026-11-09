import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const runtimeLog = read('../src/utils/runtime-log.ts')
const dashboard = read('../src/views/Dashboard.vue')

test('前端合并重复日志时剥掉后端追加的「同样状态重复 N 次」后缀', () => {
  assert.ok(runtimeLog.includes(String.raw`const MERGED_SUFFIX_RE = /（同样状态重复 \d+ 次，已合并）\s*$/`))
  assert.match(runtimeLog, /log\.msg\.replace\(MERGED_SUFFIX_RE, ''\)/)
  assert.match(runtimeLog, /function repeatSignature\(log: RuntimeLogEntry\)/)
})

test('前端日志面板仍启用 2 分钟窗口的连续重复合并', () => {
  assert.match(runtimeLog, /export function compactRuntimeLogs\(logs: RuntimeLogEntry\[\], windowMs = 2 \* 60 \* 1000\)/)
  assert.match(runtimeLog, /repeatCount = \(previous\.repeatCount \|\| 1\) \+ 1/)
  assert.match(dashboard, /compactRuntimeLogs\(filteredLogs\.value\)/)
})
