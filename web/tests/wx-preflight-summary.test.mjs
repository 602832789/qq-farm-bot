import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const source = read('../src/utils/credential-status.ts')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
})
const module = { exports: {} }
// eslint-disable-next-line no-new-func
new Function('require', 'module', 'exports', outputText)(require, module, module.exports)
const { getWxPreflightSummary } = module.exports

const NOW = 1_800_000_000_000
const MINUTE = 60_000
const HOUR = 3600_000
const GREEN = 'text-green-600 dark:text-green-400'
const AMBER = 'text-amber-600 dark:text-amber-400'
const RED = 'text-red-600 dark:text-red-400'
const GRAY = 'text-gray-500'

function wx(stats, patch = {}) {
  return { platform: 'wx', wxPreflightSupported: true, wxPreflightStats: stats, ...patch }
}

function stats(patch = {}) {
  return {
    date: '2027-01-15',
    lastSuccessAt: NOW - 5 * MINUTE,
    lastFailureAt: 0,
    successesToday: 8,
    failuresToday: 0,
    ...patch,
  }
}

test('正常账号：显示上次自动续期相对时间与今日失败次数，绿色', () => {
  const result = getWxPreflightSummary(wx(stats()), NOW)
  assert.equal(result.text, '上次自动续期：5 分钟前 · 今日失败 0 次')
  assert.equal(result.color, GREEN)
  assert.equal(result.detail, '今日成功 8 次')
  assert.match(result.hint, /只统计后端自动发起/)
  assert.match(result.hint, /手动续期不计入/)
  assert.match(result.hint, /容器重启不丢失/)
})

test('相对时间覆盖刚刚 / 分钟 / 小时 / 天，未来时间戳按刚刚处理', () => {
  const textAt = diff => getWxPreflightSummary(wx(stats({ lastSuccessAt: NOW - diff })), NOW).text
  assert.match(textAt(10_000), /刚刚/)
  assert.match(textAt(90 * MINUTE), /1 小时前/)
  assert.match(textAt(26 * HOUR), /1 天前/)
  assert.match(textAt(-HOUR), /刚刚/)
})

test('今日有失败但后来成功：琥珀色；最近一次就是失败：红色', () => {
  const recovered = getWxPreflightSummary(wx(stats({ failuresToday: 2, lastFailureAt: NOW - 30 * MINUTE })), NOW)
  assert.equal(recovered.color, AMBER)
  assert.match(recovered.text, /今日失败 2 次/)

  const stillFailing = getWxPreflightSummary(wx(stats({ failuresToday: 2, lastFailureAt: NOW - MINUTE })), NOW)
  assert.equal(stillFailing.color, RED)
})

test('超过 3 小时没有成功记录时提示琥珀色（凭证约 2 小时到期）', () => {
  assert.equal(getWxPreflightSummary(wx(stats({ lastSuccessAt: NOW - 2 * HOUR })), NOW).color, GREEN)
  assert.equal(getWxPreflightSummary(wx(stats({ lastSuccessAt: NOW - 4 * HOUR })), NOW).color, AMBER)
})

test('从没成功过：显示「暂无记录」而不是编造时间；有失败则红色', () => {
  const empty = getWxPreflightSummary(wx(stats({ lastSuccessAt: 0, lastFailureAt: 0, successesToday: 0 })), NOW)
  assert.match(empty.text, /暂无记录/)
  assert.match(empty.text, /今日失败 0 次/)
  assert.equal(empty.color, GRAY)
  assert.equal(empty.detail, '今日成功 0 次')

  const failed = getWxPreflightSummary(wx(stats({ lastSuccessAt: 0, lastFailureAt: NOW, failuresToday: 1, successesToday: 0 })), NOW)
  assert.equal(failed.color, RED)
})

test('旧版服务 / QQ / 不支持的账号 / 脏数据一律不渲染，不误报「没在续期」', () => {
  assert.equal(getWxPreflightSummary({ platform: 'wx', wxPreflightSupported: true }, NOW), null)
  assert.equal(getWxPreflightSummary({ platform: 'qq', wxPreflightSupported: true, wxPreflightStats: stats() }, NOW), null)
  assert.equal(getWxPreflightSummary(wx(stats(), { wxPreflightSupported: false }), NOW), null)
  assert.equal(getWxPreflightSummary(wx(stats(), { wxPreflightSupported: undefined }), NOW), null)
  assert.equal(getWxPreflightSummary(null, NOW), null)
  const dirty = getWxPreflightSummary(wx({ lastSuccessAt: 'oops', successesToday: -9, failuresToday: Number.NaN }), NOW)
  assert.match(dirty.text, /暂无记录 · 今日失败 0 次/)
  assert.equal(dirty.detail, '今日成功 0 次')
})

test('秒级时间戳兼容（老数据可能由外部写成秒）', () => {
  const result = getWxPreflightSummary(wx(stats({ lastSuccessAt: (NOW - 2 * HOUR) / 1000 })), NOW)
  assert.match(result.text, /2 小时前/)
})

test('账号卡片确实渲染这行，且手机端简短、PC 端补充成功次数', () => {
  const panel = read('../src/components/settings/AccountManagementPanel.vue')
  assert.match(panel, /import \{ getCredentialStatus, getWxPreflightBadge, getWxPreflightSummary \}/)
  assert.match(panel, /function wxPreflightSummary\(acc: any\)/)
  assert.match(panel, /getWxPreflightSummary\(acc, now\.value\.getTime\(\)\)/)
  assert.match(panel, /v-if="wxPreflightSummary\(acc\)"/)
  assert.match(panel, /wxPreflightSummary\(acc\)\?\.text/)
  assert.match(panel, /wxPreflightSummary\(acc\)\?\.detail/)
  assert.match(panel, /:title="wxPreflightSummary\(acc\)\?\.hint"/)
  assert.match(panel, /:class="wxPreflightSummary\(acc\)\?\.color"/)
})

test('前端类型与后端投影接线：账本只有时间戳与计数', () => {
  const store = read('../src/stores/account.ts')
  assert.match(store, /wxPreflightStats\?:/)
  assert.match(store, /lastSuccessAt\?: number/)
  assert.match(store, /failuresToday\?: number/)
  assert.match(store, /无任何凭证内容/)

  const visibility = read('../../core/src/services/account-visibility.ts')
  assert.match(visibility, /safe\.wxPreflightStats/)
  assert.match(visibility, /emptyPublicStats/)
  assert.match(visibility, /QQ 账号不走微信续期机制/)

  const ledger = read('../../core/src/services/preflight-stats.ts')
  assert.match(ledger, /不写任何 token \/ code/)
  assert.match(ledger, /writeJsonFileAtomic|writeJson/)
  assert.match(ledger, /UTC\+8 自然日/)
})

test('前端不读取任何长效凭证明文', () => {
  const panel = read('../src/components/settings/AccountManagementPanel.vue')
  const util = read('../src/utils/credential-status.ts')
  for (const file of [panel, util]) {
    assert.doesNotMatch(file, /acc\.refreshtoken|acc\.loginBuffer|acc\.accesstoken/)
  }
})
