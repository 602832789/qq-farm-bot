import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 牧场沿用 liyang 版页面：概览 / 个人 / 好友 / 活动 / 商城 / 图鉴 / 分析 / 设置。
// 侧栏仍保留本地那套「农场 | 牧场」分段开关，切场景时整套菜单随路由切换。
// 特意不 import src/utils/*.ts：生产镜像是 Node 20，直接引 .ts 会失败。

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const router = read('../src/router/index.ts')
const ranchMenu = read('../src/router/ranch-menu.ts')
const sidebar = read('../src/components/Sidebar.vue')
const layout = read('../src/layouts/DefaultLayout.vue')
const sceneStore = read('../src/stores/scene.ts')
const store = read('../src/stores/ranch.ts')
const page = read('../src/views/Ranch.vue')
const overview = read('../src/views/RanchOverview.vue')

const SECTIONS = ['personal', 'illustrated', 'activity', 'friends', 'mall']
const PANELS = [
  'RanchAnimalsPanel',
  'RanchFacilitiesPanel',
  'RanchBagPanel',
  'RanchTaskPanel',
  'RanchBookPanel',
  'RanchMallPanel',
  'RanchFriendsPanel',
  'RanchActivityPanel',
]

test('路由注册了牧场的 8 个页面，分区页带 ranchSection', () => {
  for (const [path, name] of [
    ['ranch', 'ranch-dashboard'],
    ['ranch/personal', 'ranch-personal'],
    ['ranch/illustrated', 'ranch-illustrated'],
    ['ranch/activity', 'ranch-activity'],
    ['ranch/friends', 'ranch-friends'],
    ['ranch/game-mall', 'ranch-game-mall'],
    ['ranch/analytics', 'ranch-analytics'],
    ['ranch/settings', 'ranch-settings'],
  ]) {
    assert.match(router, new RegExp(`path: '${path.replace('/', '\\/')}'[\\s\\S]{0,80}name: '${name}'`), `缺少 ${path} 路由`)
  }
  for (const section of SECTIONS)
    assert.match(router, new RegExp(`ranchSection: '${section}'`), `缺少 ${section} 的 ranchSection`)
  // 旧地址仍能落到新页面
  assert.match(router, /ranch\/warehouse', redirect: '\/ranch\/personal\?tab=bag'/)
})

test('牧场页按 route.meta.ranchSection 选分区，8 个面板都挂上了', () => {
  assert.match(page, /route\.meta\.ranchSection/)
  for (const panel of PANELS) {
    assert.match(page, new RegExp(`${panel} = defineAsyncComponent`), `${panel} 没有异步引入`)
    assert.match(page, new RegExp(`panel: ${panel}`), `${panel} 没有挂进分区`)
    assert.ok(read(`../src/components/ranch/${panel}.vue`).length > 0, `${panel}.vue 不存在`)
  }
  assert.match(page, /provideRanchActions/)
  assert.match(page, /RanchQuoteModal/)
})

test('概览页用牧场场景壳，分析页直连 analytics 视图，策略页仍保留自动化表单', () => {
  assert.match(overview, /ranch-shared/)
  assert.match(overview, /RanchGate/)
  assert.match(overview, /RunLogCard/)
  const analytics = read('../src/views/RanchAnalytics.vue')
  assert.match(analytics, /view: 'analytics'/)
  assert.match(analytics, /api\.get\('\/api\/ranch'/)
  assert.match(read('../src/views/RanchStrategy.vue'), /AutomationSettingsForm/)
})

test('牧场菜单与路由一一对应', () => {
  const paths = [...ranchMenu.matchAll(/path:\s*'([^']+)'/g)].map(match => match[1])
  assert.deepEqual(paths, [
    '/ranch',
    '/ranch/personal',
    '/ranch/friends',
    '/ranch/activity',
    '/ranch/game-mall',
    '/ranch/illustrated',
    '/ranch/analytics',
    '/ranch/settings',
  ])
  // 概览是 /ranch 本身，不能被其它子页抢走高亮。
  assert.match(ranchMenu, /target === '\/ranch'/)
})

test('侧栏保留农场 / 牧场分段开关，导航随场景整套替换', () => {
  assert.match(sidebar, /SCENE_OPTIONS/)
  assert.match(sidebar, /key: 'farm', label: '农场'/)
  assert.match(sidebar, /key: 'ranch', label: '牧场'/)
  assert.match(sidebar, /sceneStore\.select\(option\)/)
  assert.match(sidebar, /router\.push\(option === 'ranch' \? '\/ranch' : '\/'\)/)
  assert.match(sidebar, /ranchMenu\.map/)
  assert.match(layout, /matchRanchMenu\(route\.path\)/)
  assert.match(layout, /path\.startsWith\('\/ranch'\) \? 'ranch' : 'farm'/)
})

test('场景偏好按账号保存，且不发请求', () => {
  assert.match(sceneStore, /useStorage<Record<string, GameScene>>\(SCENE_KEY, \{\}\)/)
  assert.match(sceneStore, /function select\(value: GameScene\)/)
  assert.match(sceneStore, /function setScene\(value: GameScene\)/)
  assert.doesNotMatch(sceneStore, /api\.|\$fetch|axios/)
})

test('牧场 store 走统一 api 与请求守卫，切号作废在途请求', () => {
  assert.match(store, /defineStore\('ranch'/)
  assert.match(store, /api\.get|api\.post/)
  assert.doesNotMatch(store, /\$fetch|axios|new WebSocket/)
  assert.match(store, /createRequestGuard\(\)/)
  assert.match(store, /guard\.isStale\(ticket\)/)
  assert.match(store, /guard\.invalidate\(\)/)
  assert.match(store, /\/api\/ranch\/\$\{action\}\/quote/)
})

test('图鉴面板会清理新收集标记，后端提供对应接口', () => {
  // 上游统一成牧场命名空间：/api/ranch/illustrated/clear-new（普通 + 巨大图鉴共用）。
  assert.match(read('../src/components/ranch/RanchBookPanel.vue'), /\/api\/ranch\/illustrated\/clear-new/)
  assert.match(read('../../core/src/controllers/admin/commerce-routes.ts'), /'\/api\/ranch\/illustrated\/clear-new'/)
})
