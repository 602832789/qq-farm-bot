import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const store = readFileSync(new URL('../src/stores/account.ts', import.meta.url), 'utf8')
const sidebar = readFileSync(new URL('../src/components/Sidebar.vue', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/settings/AccountManagementPanel.vue', import.meta.url), 'utf8')
const routes = readFileSync(new URL('../../core/src/controllers/admin/account-routes.ts', import.meta.url), 'utf8')
const servicePath = new URL('../../core/src/services/code-watch.ts', import.meta.url)
const coreTestPath = new URL('../../core/tests/code-watch.test.js', import.meta.url)

const removedMarkers = [
  'Code 自动监听',
  'codeAlerts',
  'codeHealth',
  'CodeHealthItem',
  'fetchCodeHealth',
  'autoFixCode',
  'tryAutoFix',
  'openRefillCodeModal',
  'auto-fix-code',
  'code-health',
  'code-watch',
  'AUTO_FIX_COOLDOWN_MS',
  '立即补 Code',
  '已开启 · 每 10 秒检查',
]

test('Code 自动监听服务与对应 core 测试已删除', () => {
  assert.equal(existsSync(servicePath), false, 'core/src/services/code-watch.ts 不应存在')
  assert.equal(existsSync(coreTestPath), false, 'core/tests/code-watch.test.js 不应存在')
})

test('账号管理页不再有自动监听卡片、自动补码 watch 与监听文案', () => {
  for (const marker of removedMarkers)
    assert.equal(panel.includes(marker), false, `账号管理页仍残留 ${marker}`)
  assert.doesNotMatch(panel, /import\s*\{[^}]*\bwatch\b[^}]*\}\s*from\s*'vue'/)
  assert.doesNotMatch(panel, /role="region"[\s\S]{0,120}aria-label="Code/)
  assert.doesNotMatch(panel, /@click="tryAutoFix/)

  // 原有手动能力保持不变：编辑弹窗可补 Code、扫码添加、批量续期微信授权。
  assert.match(panel, /openEditModal\(acc\)/)
  assert.match(panel, /<AccountModal/)
  assert.match(panel, /添加账号/)
  assert.match(panel, /续期全部微信授权/)
  assert.match(panel, /refreshWxCredentials/)
})

test('账号 store 不再暴露 Code 健康快照与自动补码接口', () => {
  for (const marker of removedMarkers)
    assert.equal(store.includes(marker), false, `账号 store 仍残留 ${marker}`)
  assert.match(store, /async function refreshWxCodes\(\)/)
  assert.match(store, /async function updateAccount\(/)
  assert.match(store, /api\.get\('\/api\/accounts'\)/)
})

test('侧栏 10 秒轮询只刷新账号与状态，不再拉取 Code 健康快照', () => {
  for (const marker of removedMarkers)
    assert.equal(sidebar.includes(marker), false, `侧栏仍残留 ${marker}`)
  assert.match(sidebar, /onMounted\(\(\) => \{[\s\S]{0,200}?accountStore\.fetchAccounts\(\)/)
  const pollBlock = sidebar.slice(sidebar.indexOf('useIntervalFn(() => {'))
  assert.match(pollBlock, /accountStore\.fetchAccounts\(\)/)
  assert.match(pollBlock, /\}\s*, 10000\)/)
})

test('后端账号路由不再注册 Code 健康快照与自动补 Code 接口', () => {
  for (const marker of removedMarkers)
    assert.equal(routes.includes(marker), false, `后端账号路由仍残留 ${marker}`)
  assert.match(routes, /app\.get\('\/api\/accounts'/)
  assert.match(routes, /function mountAccountRoutes\(/)
})

test('core 源码不再写入自动补码专属日志动作', () => {
  const provider = readFileSync(new URL('../../core/src/runtime/data-provider.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(provider, /auto_code_fix(_failed)?/)
  // 启动前续期失败日志属于账号启动流程，不受本次移除影响。
  assert.match(provider, /auto_code_refresh_failed/)
})
