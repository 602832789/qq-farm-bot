import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// eslint-disable-next-line test/no-import-node-test
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
  for (const key of ['limited', 'mystery', 'svip', 'props'])
    assert.match(mall, new RegExp(`route\\.query\\.tab === '${key}'`), `${key} 仍在 activeTab 白名单里`)
  assert.match(mall, /<MysteryShopPanel v-if="activeTab === 'mystery'" \/>/)
  assert.match(mall, /<NTab v-for="tab in tabs" :key="tab\.key" :name="tab\.key"/, '页签仍按数组顺序渲染')
  assert.match(mall, /tab === 'mall' \? undefined : tab/, '默认页签仍是游戏商城且不写 query')
})
