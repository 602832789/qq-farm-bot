import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'
import test from 'node:test'

// 牧场是独立场景（game_scene_id=2），读取要临时切场景再切回来。
// 这里锁住三件事：页面只做页签、协议全部收在场景壳里、菜单只有一个入口。
// 刻意不 import src/utils/ranch.ts：生产镜像是 Node 20，直接引 .ts 会失败。

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const page = read('../src/views/Ranch.vue')
const menu = read('../src/router/menu.ts')
const host = read('../src/components/ranch/RanchSceneHost.vue')
const store = read('../src/stores/ranch.ts')

test('牧场页覆盖全部分区，页签文案来自统一标签表', () => {
  assert.match(page, /from '@\/utils\/ranch'/)
  assert.match(page, /RANCH_VIEWS/)
  assert.match(page, /RANCH_VIEW_LABELS/)
  assert.match(page, /v-for="item in RANCH_VIEWS"/)
  assert.match(page, /RANCH_VIEW_LABELS\[item\]/)
  assert.match(page, /@click="view = item"/)
})

test('牧场页把协议全部收在场景壳里，页面自己不管读取与待核对账本', () => {
  assert.match(page, /<RanchSceneHost :view="view" title="牧场" \/>/)
  assert.doesNotMatch(page, /useRanchStore|api\.|fetch\(/)
  assert.match(host, /document\.addEventListener\('visibilitychange'/)
  assert.match(host, /ranchStore\.acknowledge\(/)
  // 挂载时按页面要求的分区读取，不能沿用上一页残留的 activeView。
  assert.match(host, /onMounted\(\(\) => \{[\s\S]{0,160}?refresh\(props\.view\)/)
  assert.match(host, /paramsKey = computed/)
})

test('牧场只有一个菜单入口，路由指向独立页面', () => {
  assert.equal([...menu.matchAll(/path:\s*'ranch'/g)].length, 1)
  assert.match(menu, /name:\s*'ranch'[\s\S]{0,200}views\/Ranch\.vue/)
  assert.match(menu, /icon:\s*'i-carbon-crop-growth'/)
  // 不能把牧场塞进农场页面里再各写一份场景状态。
  assert.doesNotMatch(menu, /views\/Ranch\.vue[\s\S]{0,80}scenes:/)
})

test('牧场 store 只走统一 api，并用请求守卫丢弃过期回包', () => {
  assert.match(store, /defineStore\('ranch'/)
  assert.match(store, /api\.get|api\.post/)
  assert.doesNotMatch(store, /\$fetch|axios|new WebSocket/)
  assert.match(store, /createRequestGuard\(\)/)
  assert.match(store, /fetchGuard\.isStale\(ticket\)/)
  // 切号 / 清空数据必须作废在途读取，否则旧账号回包会写进新面板。
  assert.match(store, /function clearRanchData\(\) \{\n {4}fetchGuard\.invalidate\(\)/)
})
