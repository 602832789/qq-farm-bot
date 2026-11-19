import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import test from 'node:test'

const store = readFileSync(new URL('../src/stores/account.ts', import.meta.url), 'utf8')
const sidebar = readFileSync(new URL('../src/components/Sidebar.vue', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/settings/AccountManagementPanel.vue', import.meta.url), 'utf8')
const routes = readFileSync(new URL('../../core/src/controllers/admin/account-routes.ts', import.meta.url), 'utf8')
const service = readFileSync(new URL('../../core/src/services/code-watch.ts', import.meta.url), 'utf8')
const keepAlive = readFileSync(new URL('../../core/src/services/wx-keepalive.ts', import.meta.url), 'utf8')

/**
 * 负向守卫：账号管理页的「Code 自动监听」已整条移除，不得重新引入。
 *
 * 移除原因：这套逻辑每 10 秒拉一次健康快照，一旦判定「即将过期 / 掉线」就
 * 自动换 Code 并 restartAccount 重启运行中的账号。而后端 wx-keepalive 的设计是
 * 「到期前 5 分钟只滚 token、不换 Code、不重启连接」，两者直接冲突 ——
 * 结果是每 2 小时就主动断一次线，并额外消耗一次性 refreshtoken，
 * 反而让 Code 失效来得更早。手动补 Code / 扫码登录能力完全保留。
 */

test('账号 store 不再有 Code 健康快照与自动补 Code 接口', () => {
  assert.doesNotMatch(store, /CodeHealthItem/)
  assert.doesNotMatch(store, /codeHealth/)
  assert.doesNotMatch(store, /fetchCodeHealth/)
  assert.doesNotMatch(store, /autoFixCode/)
  assert.doesNotMatch(store, /code-health/)
  assert.doesNotMatch(store, /auto-fix-code/)
})

test('侧栏轮询只刷新账号列表，不再拉取 Code 健康快照', () => {
  assert.doesNotMatch(sidebar, /fetchCodeHealth/)
  const pollBlock = sidebar.slice(sidebar.indexOf('useIntervalFn(() => {'))
  assert.match(pollBlock, /accountStore\.fetchAccounts\(\)/)
  assert.match(pollBlock, /\}\s*, 10000\)/)
})

test('账号管理页不再有「Code 自动监听」卡片、自动补码与异常告警', () => {
  assert.doesNotMatch(panel, /Code 自动监听/)
  assert.doesNotMatch(panel, /codeAlerts/)
  assert.doesNotMatch(panel, /tryAutoFix/)
  assert.doesNotMatch(panel, /openRefillCodeModal/)
  assert.doesNotMatch(panel, /AUTO_FIX_COOLDOWN_MS/)
})

test('后端不再注册 Code 健康快照与自动补 Code 路由', () => {
  assert.doesNotMatch(routes, /app\.get\('\/api\/accounts\/code-health'/)
  assert.doesNotMatch(routes, /app\.post\('\/api\/accounts\/:id\/auto-fix-code'/)
  assert.doesNotMatch(routes, /buildProviderCodeHealth/)
  assert.doesNotMatch(routes, /autoFixAccountCode/)
})

test('code-watch 只剩到期剩余毫秒计算，不再有等级判定与自动补码', () => {
  assert.match(service, /export function wxCredentialRemainingMs/)
  assert.doesNotMatch(service, /inspectAccountCodeHealth/)
  assert.doesNotMatch(service, /buildCodeHealthSnapshot/)
  assert.doesNotMatch(service, /autoFixAccountCode/)
  assert.doesNotMatch(service, /OFFLINE_LOG_ACTIONS/)
  // 但仍然必须给后端 keepalive 提供到期判定能力，否则预防性续期会失效。
  assert.match(keepAlive, /wxCredentialRemainingMs/)
})

test('手动通道保留：续期按钮、扫码登录与手动补码都还在', () => {
  assert.match(panel, /refreshWxCredentials/)
  assert.match(panel, /续期全部微信授权/)
  assert.match(panel, /openEditModal/)
  assert.match(routes, /app\.post\('\/api\/accounts\/refresh-wx-credentials'/)
  assert.match(routes, /app\.post\('\/api\/accounts\/:id\/refresh-wx-credential'/)
})

test('手动续期 / 重新登录成功会刷新「上次自动续期」账本，失败不记', () => {
  // 用户明确要求：点「续期全部微信授权」、重新扫码或重新登录，都应该算一次续期成功。
  assert.match(routes, /recordAutoRefreshSuccess/)
  const refreshBlock = routes.slice(
    routes.indexOf('async function refreshWxCredentials'),
    routes.indexOf('app.post(\'/api/accounts/refresh-wx-credentials\''),
  )
  assert.match(refreshBlock, /if \(result\.ok\)[\s\S]{0,160}recordAutoRefreshSuccess\(account\.id\)/)
  // 失败不记（用户确认）：这条路径只写成功，不得写失败。
  assert.doesNotMatch(refreshBlock, /recordAutoRefreshFailure/)
})
