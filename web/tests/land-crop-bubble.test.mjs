import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const read = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
const farmPanel = read('components/FarmPanel.vue')
const farmLandCard = read('components/FarmLandCard.vue')
const farmScene = read('components/FarmScene.vue')
const bubble = read('components/LandCropBubble.vue')

test('点击地块/作物统一走老版就地气泡，而不是直接弹居中弹窗', () => {
  assert.match(farmPanel, /@open="openLandBubble\(\$event\)"/)
  assert.equal((farmPanel.match(/openLandBubble\(\$event\)/g) || []).length, 2, '卡片视图与场景视图都要接到气泡')
  assert.match(farmPanel, /@open="selecting \? toggleLand\(\$event\) : openLandBubble\(\$event\)"/)
  assert.doesNotMatch(farmPanel, /@open="detailLandId/)
  assert.match(farmPanel, /<LandCropBubble/)
  assert.match(farmPanel, /:land="detailBubbleOpen \? detailLand : null"/)
})

test('居中土地详情弹窗只在气泡里的「土地等级 / 升级条件」入口打开', () => {
  assert.match(farmPanel, /:land="modalLand"/)
  assert.match(farmPanel, /const modalLand = computed\(\(\) => detailBubbleOpen\.value \? null : detailLand\.value\)/)
  assert.match(farmPanel, /@details="openLandDetailsFromBubble"/)
  assert.match(farmPanel, /function openLandDetailsFromBubble\(\)/)
  assert.match(bubble, /土地等级 \/ 升级条件/)
})

test('卡片与场景地块都带定位锚点，气泡才算得出位置', () => {
  assert.match(farmLandCard, /:data-land-id="land\.id"/)
  assert.match(farmScene, /:data-land-id="land\.id"/)
  assert.match(farmPanel, /document\.querySelector<HTMLElement>\(`\[data-land-id=/)
})

test('气泡完整移植老版字段与操作，并浮在 body 上', () => {
  for (const text of ['土地 #', '成熟倒计时', '生长季数', '变异效果', '需要浇水', '催熟', '铲除']) {
    assert.ok(bubble.includes(text), `缺少老版气泡字段：${text}`)
  }
  assert.match(bubble, /<Teleport to="body">/)
  assert.match(bubble, /position: fixed/)
  assert.match(bubble, /role="dialog"/)
  assert.match(bubble, /computeBubblePosition/)
  assert.match(bubble, /canRipenLand/)
  assert.match(bubble, /Escape/)
})

test('切号时气泡与弹窗一起关闭，避免显示上一个账号的地块', () => {
  assert.match(farmPanel, /watch\(currentAccountId, \(\) => \{\s*closeLandDetail\(\)/)
  assert.match(farmPanel, /function closeLandDetail\(\)[\s\S]*bubbleAnchor\.value = null/)
})
