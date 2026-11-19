import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const source = readFileSync(new URL('../src/utils/bubble-position.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
})
const module = { exports: {} }

new Function('require', 'module', 'exports', outputText)(require, module, module.exports)
const { computeBubblePosition } = module.exports

function anchor(left, top, width = 100, height = 100) {
  return { left, top, right: left + width, bottom: top + height, width, height }
}
const bubble = { width: 260, height: 220 }
const viewport = { width: 1000, height: 800 }

test('上方空间足够时贴在地块上方（老版默认位置）', () => {
  const result = computeBubblePosition(anchor(400, 500), viewport, bubble)
  assert.equal(result.placement, 'above')
  assert.equal(result.top, 500 - bubble.height - 10)
  assert.equal(result.left, 400 + 50 - bubble.width / 2)
})

test('上方放不下且下方更宽裕时翻到地块下方', () => {
  const result = computeBubblePosition(anchor(400, 30), viewport, bubble)
  assert.equal(result.placement, 'below')
  assert.equal(result.top, 130 + 10)
})

test('靠近左/右边缘时气泡不会溢出视口', () => {
  const leftEdge = computeBubblePosition(anchor(2, 500), viewport, bubble)
  assert.equal(leftEdge.left, 8)
  const rightEdge = computeBubblePosition(anchor(950, 500), viewport, bubble)
  assert.equal(rightEdge.left, viewport.width - bubble.width - 8)
})

test('小箭头始终指向地块中心，且不会跑出气泡边缘', () => {
  const center = computeBubblePosition(anchor(400, 500), viewport, bubble)
  assert.equal(center.arrowLeft, bubble.width / 2)
  const edge = computeBubblePosition(anchor(950, 500), viewport, bubble)
  assert.equal(edge.arrowLeft, bubble.width - 18)
})

test('视口比气泡还小时位置仍被钳制在可见范围内', () => {
  const result = computeBubblePosition(anchor(10, 10), { width: 320, height: 240 }, bubble)
  assert.equal(result.left, 8)
  assert.ok(result.top >= 8)
  assert.ok(result.top <= 240 - bubble.height - 8 + 8)
})
