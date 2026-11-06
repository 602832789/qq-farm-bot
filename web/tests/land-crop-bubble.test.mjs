import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const read = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
const farmPanel = read('components/FarmPanel.vue')
const farmLandCard = read('components/FarmLandCard.vue')
const farmScene = read('components/FarmScene.vue')
const bubble = read('components/LandCropBubble.vue')
const landDetailModal = read('components/LandDetailModal.vue')

/** 取某个样式规则块（到第一个右花括号为止）。 */
function rule(source, selector) {
  const start = source.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `样式块 ${selector} 不存在`)
  return source.slice(start, source.indexOf('}', start))
}
/** 取规则块里某条声明的值，用于逐项比对两级弹窗的设计 token。 */
function decl(block, prop) {
  return block.match(new RegExp(`(?:^|\\s)${prop}:\\s*([^;]+);`))?.[1]?.trim() || ''
}

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

test('气泡收益取后端叠加值，并标注倍率与基础值', () => {
  assert.match(bubble, /harvestExpPerSeason/)
  assert.match(bubble, /harvestGoldPerSeason/)
  assert.match(bubble, /harvestBonus/)
  assert.match(bubble, /harvestExpMultiplier/)
  assert.match(bubble, /harvestGoldMultiplier/)
  assert.match(bubble, /变异叠加已计入收益/)
  assert.match(bubble, /基础 \{\{ formatNumber/)
})

test('土地升级详情只保留土地信息，不再重复作物区', () => {
  for (const cropText of ['land-crop-grid', 'land-crop-head', '每季金币', '每季经验', '变异效果', '催熟', '铲除']) {
    assert.ok(!landDetailModal.includes(cropText), `土地弹窗不应包含作物字段：${cropText}`)
  }
  assert.match(landDetailModal, /土地等级 \/ 升级条件/)
  assert.match(landDetailModal, /land-detail-metrics/)
  assert.match(landDetailModal, /土地加成/)
  assert.match(landDetailModal, /升级条件/)
  assert.doesNotMatch(landDetailModal, /NButton/)
  const modalTag = farmPanel.match(/<LandDetailModal[\s\S]*?\/>/)?.[0] || ''
  assert.doesNotMatch(modalTag, /@fertilize|@remove/)
  const bubbleTag = farmPanel.match(/<LandCropBubble[\s\S]*?\/>/)?.[0] || ''
  assert.match(bubbleTag, /@fertilize="handleDetailFertilize"/)
  assert.match(bubbleTag, /@remove="handleDetailRemove"/)
})

test('二级土地等级弹窗尺寸与设计风格与一级气泡一致', () => {
  const primary = rule(bubble, '.land-bubble')
  const secondary = rule(landDetailModal, '.land-detail-bubble')
  for (const prop of ['width', 'max-height', 'padding', 'border', 'border-radius', 'background', 'color', 'box-shadow', 'text-align']) {
    const expected = decl(primary, prop)
    assert.ok(expected, `一级气泡缺少 ${prop} 声明`)
    assert.equal(decl(secondary, prop), expected, `二级弹窗 ${prop} 必须与一级气泡完全一致`)
  }
  assert.match(rule(landDetailModal, '.land-detail-bubble'), /width:\s*min\(260px, calc\(100vw - 32px\)\)/, '宽度缩到与一级相同的 260px')
  assert.match(landDetailModal, /@media \(max-width: 640px\)/)
  assert.match(landDetailModal, /min\(260px, calc\(100vw - 24px\)\)/, '窄屏留白与一级相同')

  const darkPrimary = rule(bubble, ':global(.dark) .land-bubble')
  const darkSecondary = rule(landDetailModal, ':global(.dark) .land-detail-bubble')
  for (const prop of ['border-color', 'background', 'color'])
    assert.equal(decl(darkSecondary, prop), decl(darkPrimary, prop), `暗色 ${prop} 必须与一级气泡一致`)

  // 内部卡片与关闭按钮也沿用一级的小尺寸风格。
  assert.match(rule(landDetailModal, '.bubble-cell'), /border-radius:\s*8px/)
  assert.match(rule(landDetailModal, '.bubble-close'), /width:\s*20px/)
  assert.match(landDetailModal, /text-\[1[012]px\]/, '字号收敛到一级气泡的 10-12px 区间')
})

test('二级弹窗改为同款浮层，仍是完整的土地信息', () => {
  assert.doesNotMatch(landDetailModal, /NModal|NCard|480px|border-radius:\s*20px/, '旧的 480px naive-ui 大卡片已移除')
  assert.match(landDetailModal, /<Teleport to="body">/)
  assert.match(landDetailModal, /role="dialog"/)
  assert.match(landDetailModal, /aria-modal="true"/)
  assert.match(landDetailModal, /@click\.self="emit\('close'\)"/, '点击浮层外部仍可关闭')
  assert.match(landDetailModal, /Escape/, 'ESC 仍可关闭')
  for (const text of ['土地加成', '升级条件', '解锁条件', '当前已满级', '余额充足', '还差', '部分条件暂未获取', '土地详情暂未获取', '当前可']) {
    assert.ok(landDetailModal.includes(text), `二级弹窗缺少土地信息：${text}`)
  }
  assert.match(landDetailModal, /land-detail-metrics/)
  assert.match(landDetailModal, /info\.current\.image/, '等级图片对比仍在')
  assert.match(landDetailModal, /v-for="cost in costs"/, '消耗物品清单仍在')
})
