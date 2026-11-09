import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const modal = read('../src/components/AccountCareerModal.vue')
const dashboard = read('../src/views/Dashboard.vue')
const topMenu = read('../src/components/TopAccountMenu.vue')

test('移植的个人页弹窗保留老版本全部数据区与状态', () => {
  assert.match(modal, /历史累计收获/)
  assert.match(modal, /摘取好友作物/)
  assert.match(modal, /官方生涯统计/)
  assert.match(modal, /收获明细/)
  assert.match(modal, /暂无收获记录/)
  assert.match(modal, /topItems = computed\(\(\) => harvestedItems\.value\.slice\(0, 3\)\)/)
  assert.match(modal, /totalHarvestCount/)
  assert.match(modal, /totalStealCount/)
  assert.match(modal, /角色编号：/)
  assert.match(modal, /Lv\.\{\{ level \}\}/)
  assert.match(modal, /经验 \{\{ formatNumber\(exp\) \}\}/)
  assert.match(modal, /正在读取角色生涯\.\.\./)
  assert.match(modal, /重新加载/)
  assert.match(modal, /@click="emit\('refresh'\)"/)
  assert.match(modal, /useModalFocus\(\(\) => props\.show, modalSurface, \(\) => emit\('close'\)\)/)
  assert.match(modal, /src="\/game-config\/career\/harvest\.png"/)
  assert.match(modal, /src="\/game-config\/career\/steal\.png"/)
  assert.ok(existsSync(new URL('../public/game-config/career/harvest.png', import.meta.url)))
  assert.ok(existsSync(new URL('../public/game-config/career/steal.png', import.meta.url)))
})

test('入口只绑定首页头像，右上角账号菜单不再打开个人页', () => {
  assert.match(dashboard, /import AccountCareerModal from '@\/components\/AccountCareerModal\.vue'/)
  assert.match(dashboard, /<Teleport to="body">[\s\S]*?<AccountCareerModal/)
  assert.match(dashboard, /:show="showCareerModal"/)
  assert.match(dashboard, /:account="currentAccount"/)
  assert.match(dashboard, /:profile="careerProfile"/)
  assert.match(dashboard, /:items="careerItems"/)
  assert.match(dashboard, /@refresh="loadCareer"/)
  assert.match(dashboard, /api\.get\('\/api\/career'\)/)
  assert.match(dashboard, /watch\(currentAccountId, \(\) => \{[\s\S]*?loadCareer\(\)/)

  const avatarButton = /<button\s+type="button"\s+class="ov-avatar"[\s\S]*?@click="openCareer"[\s\S]*?<\/button>/.exec(dashboard)
  assert.ok(avatarButton, '首页头像应为可点击按钮')
  assert.match(avatarButton[0], /aria-label="查看角色生涯"/)
  assert.match(avatarButton[0], /:disabled="!currentAccountId"/)
  assert.match(avatarButton[0], /class="ov-avatar__dot"/, '在线状态小圆点保留')

  assert.doesNotMatch(topMenu, /AccountCareerModal/)
  assert.doesNotMatch(topMenu, /openCareer/)
  assert.doesNotMatch(topMenu, /\/api\/career/)
  assert.match(topMenu, /aria-label="选择和管理账号"/, '右上角仍只负责切换账号')
})

test('首页头像保持原有尺寸与布局，仅新增可点击反馈', () => {
  const style = /\.ov-avatar \{[\s\S]*?\}/.exec(dashboard)?.[0] || ''
  assert.match(style, /width: 52px/)
  assert.match(style, /height: 52px/)
  assert.match(style, /display: grid/)
  assert.match(style, /place-items: center/)
  assert.match(style, /appearance: none/)
  assert.match(style, /cursor: pointer/)
  assert.match(dashboard, /\.ov-avatar:hover:not\(:disabled\)/)
  assert.match(dashboard, /\.ov-avatar:focus-visible/)
  assert.match(dashboard, /\.ov-avatar:disabled/)
  assert.match(dashboard, /我的农场/, '原有「我的农场」入口不受影响')
})
