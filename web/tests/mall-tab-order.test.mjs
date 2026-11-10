import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import test from 'node:test'

const mall = readFileSync(new URL('../src/views/GameMall.vue', import.meta.url), 'utf8')

const tabsBlock = mall.match(/const tabs: Array<\{ key: MallTab[^=]*= \[([\s\S]*?)\n\]/)?.[1] || ''
const tabKeys = [...tabsBlock.matchAll(/\{ key: '([a-z]+)'/g)].map(match => match[1])

test('农场商城：神秘商人按钮位于第四个', () => {
  assert.deepEqual(tabKeys, ['mall', 'limited', 'props', 'mystery', 'svip'])
  assert.equal(tabKeys.indexOf('mystery'), 3, '第 4 位（索引 3）')
  assert.equal(tabKeys.length, 5, '页签数量不变')
})

test('调整顺序后路由判定与面板绑定保持完整', () => {
  const keysBlock = mall.match(/const TAB_KEYS: MallTab\[\] = \[([^\]]+)\]/)?.[1] || ''
  const routeKeys = [...keysBlock.matchAll(/'([a-z]+)'/g)].map(match => match[1])
  assert.deepEqual(routeKeys, tabKeys, 'activeTab 白名单覆盖全部页签，游戏商城不会被弹回默认页')
  assert.match(mall, /<MysteryShopPanel v-if="activeTab === 'mystery'" \/>/)
  assert.match(mall, /<MallCatalogPanel v-else :slot-type=/)
  assert.match(mall, /<NTab v-for="tab in tabs" :key="tab\.key" :name="tab\.key"/, '页签仍按数组顺序渲染')
  assert.match(mall, /const DEFAULT_TAB: MallTab = 'mall'/, '直接打开商城时默认游戏商城')
  assert.match(mall, /tab === DEFAULT_TAB \? undefined : tab/, '默认页签不写 query')
  assert.match(mall, /\(TAB_KEYS as string\[\]\)\.includes\(tab\)/, '按完整白名单识别 query')
  assert.match(mall, /: DEFAULT_TAB/, '无有效 query 时回退到默认页签')
})
