import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import test from 'node:test'

const dashboard = readFileSync(new URL('../src/views/Dashboard.vue', import.meta.url), 'utf8')

/** 手机端断点是文件里最后一个 @media，取到 </style> 即为整段手机端规则。 */
function mobileBlock() {
  const start = dashboard.indexOf('@media (max-width: 639px) {')
  assert.ok(start >= 0, '应存在手机端断点')
  return dashboard.slice(start)
}

function baseAvatarStyle() {
  return /\.ov-avatar \{[\s\S]*?\}/.exec(dashboard)?.[0] || ''
}

test('PC 端头像保持 52×52 正圆，不随手机端改动', () => {
  const style = baseAvatarStyle()
  assert.match(style, /width: 52px/)
  assert.match(style, /height: 52px/)
  assert.match(style, /border-radius: 999px/)

  // 基础规则之外的 PC 断点（>=768px / >=1280px）不应出现头像尺寸覆盖
  const pcBlocks = [...dashboard.matchAll(/@media \(min-width: (?:768|1280)px\) \{[\s\S]*?\n\}/g)].map(m => m[0]).join('\n')
  assert.doesNotMatch(pcBlocks, /\.ov-avatar/)
  assert.doesNotMatch(pcBlocks, /--ov-avatar-size/)
})

test('手机端头像放大到 72px，与三行文字块等高且仍是正圆', () => {
  const mobile = mobileBlock()
  assert.match(mobile, /--ov-avatar-size: 72px/, '实测 PC 两行文字 51.3px / 手机三行 71.8px')

  const style = /\.ov-avatar \{[\s\S]*?\}/.exec(mobile)?.[0] || ''
  assert.match(style, /width: var\(--ov-avatar-size\)/)
  assert.match(style, /height: var\(--ov-avatar-size\)/, '宽高同值，保持正圆')
  assert.match(style, /font-size: 34px/, '占位图标随头像等比放大')
  assert.doesNotMatch(style, /border-radius/, '手机端不重复定义圆角，沿用正圆')

  assert.match(mobile, /\.ov-account__info \{[\s\S]*?min-height: var\(--ov-avatar-size\)[\s\S]*?\}/, '文字块与头像共用同一尺寸变量')
  assert.match(dashboard, /class="ov-account__info min-w-0 flex-1"/, '文字块需要有语义类名才能锁高度')
})

test('手机端在线点贴合放大后的圆周', () => {
  const mobile = mobileBlock()
  const dot = /\.ov-avatar__dot \{[\s\S]*?\}/.exec(mobile)?.[0] || ''
  assert.match(dot, /right: 3px/)
  assert.match(dot, /bottom: 3px/, '72px 圆周下状态点同步内移，避免悬在圆外')
})

test('手机端收紧间距并防止「已运行」被挤成第四行', () => {
  const mobile = mobileBlock()
  assert.match(mobile, /\.ov-account__head \{[\s\S]*?gap: 10px[\s\S]*?\}/)
  assert.match(mobile, /\.ov-presence \{[\s\S]*?column-gap: 6px[\s\S]*?\}/)
  assert.match(mobile, /\.ov-presence__item \{[\s\S]*?white-space: nowrap[\s\S]*?\}/, '禁止时长折行，否则文字块会变成 88px')
  assert.match(mobile, /\.ov-presence__meta \{[\s\S]*?column-gap: 6px[\s\S]*?overflow: hidden[\s\S]*?font-size: 11px[\s\S]*?\}/, '窄屏超出部分裁切，不挤到按钮上')
})
