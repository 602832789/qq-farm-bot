import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const mall = read('../src/views/GameMall.vue')
const banner = read('../src/components/commerce/MysteryArrivalBanner.vue')
const panel = read('../src/components/commerce/MysteryShopPanel.vue')
const layout = read('../src/layouts/DefaultLayout.vue')

test('农场商城默认打开神秘商人页签', () => {
  assert.match(mall, /const DEFAULT_TAB: MallTab = 'mystery'/)
  assert.match(mall, /\? route\.query\.tab : DEFAULT_TAB\)/)
  assert.match(mall, /tab === DEFAULT_TAB \? undefined : tab/)
})

test('来访未购买横幅只在农场商城页面顶部出现', () => {
  assert.match(mall, /<MysteryArrivalBanner @go="selectTab\('mystery'\)" \/>/)
  assert.doesNotMatch(layout, /MysteryArrivalBanner/, '横幅不进全局顶栏')
  assert.match(banner, /神秘商人来访中 · 本轮尚未购买/)
  assert.match(banner, /purchasedThisVisit/, '购买后本轮不再提示')
  assert.match(banner, /shop\.activeTime/, '按本轮来访时间判定')
  assert.match(banner, /record\.npcId === npcId/, '按本轮商人去重')
  assert.match(banner, /shop\.expireTime > clock\.value/, '商人离开后横幅消失')
  assert.doesNotMatch(banner, /appendPanelNotification|push_notify/, '不写局内消息、不发外部推送')
})

test('停在其它页签也会拉取来访状态与购买历史', () => {
  assert.match(mall, /function refreshMysteryBanner\(\)/)
  assert.match(mall, /commerceStore\.fetchMystery\(id\)/)
  assert.match(mall, /commerceStore\.fetchMysteryHistory\(id\)/)
  assert.match(mall, /watch\(currentAccountId, \(\) => refreshMysteryBanner\(\)\)/)
  assert.match(mall, /useIntervalFn\([\s\S]*?30000\)/)
})

test('PC 端购买历史与「神秘商人暂未来访」等宽，手机端不变', () => {
  assert.match(panel, /\.merchant-history \{\s*width: 100%;\s*max-width: 760px;/)
  assert.match(panel, /@media \(min-width: 761px\)/)
  assert.match(panel, /@media \(min-width: 761px\) \{[\s\S]*?\.merchant-history \{\s*max-width: none;/)
  assert.match(panel, /EmptyState v-else-if="!mystery\?\.active \|\| !mystery\.npc" title="神秘商人暂未来访"/)
})
