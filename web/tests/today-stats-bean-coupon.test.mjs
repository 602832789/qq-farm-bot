import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const dashboard = read('../src/views/Dashboard.vue')
const stats = read('../../core/src/services/stats.ts')

// 今日统计这四张卡片所在的 grid，用来精确限定「只改今日模块」的检查范围。
// 从 grid 容器的 class 起切，才能把「沿用两列网格」也一起断言进去。
const gridStart = dashboard.indexOf('<div class="grid grid-cols-2 mb-2 gap-2 2xl:gap-3" role="region" aria-label="今日金币')
const gridEnd = dashboard.indexOf('<div v-if="!operationGroups.active.length"', gridStart)
const grid = dashboard.slice(gridStart, gridEnd)

// 把「金豆当日基线纯逻辑」区间编译出来，真正跑一遍数值，而不是只做文本断言。
const pureStart = dashboard.indexOf('// ---- 今日统计：金豆当日基线纯逻辑开始')
const pureEnd = dashboard.indexOf('// ---- 今日统计：金豆当日基线纯逻辑结束')
const pureSource = dashboard.slice(pureStart, pureEnd)
const { outputText } = ts.transpileModule(pureSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
})

function loadPureLogic() {
  const exports = {}
  new Function('exports', `${outputText}\nexports.resolveGoldBeanDelta = resolveGoldBeanDelta; exports.localDayKey = localDayKey`)(exports)
  return exports
}

function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  }
}

test('今日统计按 金币 → 经验 → 金豆 → 点券 排列，四张卡片同在一个 grid', () => {
  assert.ok(gridStart > 0 && gridEnd > gridStart, '要取到今日统计的四卡 grid')
  const gold = grid.indexOf('alt="金币"')
  // 经验卡没有 png 素材，用原有 carbon 图标定位；文字另外断言仍在。
  const exp = grid.indexOf('i-carbon-star-filled')
  const bean = grid.indexOf('alt="金豆"')
  const coupon = grid.indexOf('alt="点券"')
  assert.ok(gold > 0 && exp > 0 && bean > 0 && coupon > 0, '四个图标/文字都要在 grid 内')
  assert.match(grid, /经验/, '经验卡文字保持不变')
  assert.ok(bean > exp, '金豆在金币和经验之后')
  assert.ok(coupon > bean, '金豆在前、点券在后')
  assert.match(grid, /grid grid-cols-2/, '沿用原来的两列网格，尺寸不单独定制')
  assert.match(grid, /aria-label="今日金币、经验、金豆与点券增量"/, '无障碍标签同步补齐')
})

test('金豆/点券卡片与金币/经验卡片完全同款：容器、图标尺寸、文字、数字、悬停、暗色', () => {
  const cardClass = 'flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 transition-transform hover:scale-105 dark:bg-gray-700/30'
  assert.equal((grid.match(new RegExp(cardClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 4, '四张卡片容器 class 必须一字不差')
  // 金币/金豆/点券都是项目内 png 素材，三者图标尺寸一字不差；经验沿用原有
  // carbon 图标（文字排版仍与其他三张一致），不为了「统一」去动已有卡片。
  const iconClass = 'h-5 w-5 object-contain 2xl:h-6 2xl:w-6'
  assert.equal((grid.match(new RegExp(iconClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 3, '三张货币卡片图标尺寸一致')
  for (const icon of ['gold.png', 'gold-bean.png', 'coupon.png'])
    assert.match(grid, new RegExp(`<img src="/game-config/resource-icons/${icon.replace('.', '\\.')}"[^>]*${iconClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `${icon} 的 img 结构与金币同款`)
  assert.match(grid, /i-carbon-star-filled text-base text-sky-500 2xl:text-lg/, '经验卡原有图标保持不变')
  assert.equal((grid.match(/text-xs text-gray-500 2xl:text-sm/g) || []).length, 4, '标签文字排版一致')
  assert.equal((grid.match(/text-sm font-bold 2xl:text-base/g) || []).length, 4, '数字排版一致')
  assert.equal((grid.match(/aria-hidden="true"/g) || []).length, 4, '图标都不重复读屏')
})

test('图标用项目内已有的资源素材，不新增外部文件', () => {
  for (const [name, icon] of [['金币', 'gold.png'], ['金豆', 'gold-bean.png'], ['点券', 'coupon.png']]) {
    const path = new URL(`../public/game-config/resource-icons/${icon}`, import.meta.url)
    assert.ok(existsSync(path), `${name} 图标必须来自项目内已有素材 ${icon}`)
    assert.match(grid, new RegExp(`src="/game-config/resource-icons/${icon.replace('.', '\\.')}"`), `${name} 要引用该素材`)
  }
  assert.match(grid, /alt="金豆"/)
  assert.match(grid, /alt="点券"/)
  assert.doesNotMatch(grid, /https?:\/\//, '不得引入外链图标')
})

test('点券与金币同源：直接读后端当日净值，可负、不 clamp、不用 Math.max', () => {
  assert.match(dashboard, /const todayCouponGained = computed\(\(\) => Number\(status\.value\?\.sessionCouponGained\) \|\| 0\)/)
  assert.match(dashboard, /const todayGoldGained = computed\(\(\) => Number\(status\.value\?\.sessionGoldGained\) \|\| 0\)/, '金币原逻辑保持不动')
  // 后端确实下发 sessionCouponGained，且是「当前 - 当日基线」的净值，可以为负。
  assert.match(stats, /sessionCouponGained: session\.couponGained/)
  assert.match(stats, /session\.couponGained = currentCoupon - \(initialState\.coupon as number\)/)
  assert.match(grid, /\{\{ todayCouponGained \}\}/)
  assert.doesNotMatch(dashboard, /todayCouponGained = computed\(\(\) => Math\.max\(0,/)
})

test('金豆/点券为负数时用与金币同一个负向色 token', () => {
  assert.match(grid, /:class="\{ 'is-down': todayGoldBeanGained < 0 \}"/)
  assert.match(grid, /:class="\{ 'is-down': todayCouponGained < 0 \}"/)
  assert.match(grid, /:class="\{ 'is-down': todayGoldGained < 0 \}"/, '金币原判定保持不动')
  assert.match(dashboard, /\.ov-today-value\.is-down \{\s*color: var\(--ui-danger\);\s*\}/)
  assert.match(dashboard, /\.ov-today-gold\.is-down \{\s*color: var\(--ui-danger\);\s*\}/, '金币负向色基准')
  assert.equal((grid.match(/ov-today-value/g) || []).length, 2, '金豆与点券共用一个负向色类')
})

test('空态判定把金豆/点券算进去，有净值时不会误显示「等待第一份收获」', () => {
  assert.match(dashboard, /!operationGroups\.active\.length && todayGoldGained === 0 && todayExpGained === 0 && todayGoldBeanGained === 0 && todayCouponGained === 0/)
})

test('金豆净值：首次记为 0，涨了为正，消费后可以为负', () => {
  const { resolveGoldBeanDelta } = loadPureLogic()
  const storage = makeStorage()
  const day = '2026-11-12'
  assert.equal(resolveGoldBeanDelta(1000, 'acc-1', true, day, storage), 0, '当天首次看到余额，净增为 0')
  assert.equal(resolveGoldBeanDelta(1120, 'acc-1', true, day, storage), 120, '卖出果实得金豆')
  assert.equal(resolveGoldBeanDelta(900, 'acc-1', true, day, storage), -100, '消费金豆后低于基线，必须是负数')
  assert.equal(resolveGoldBeanDelta(1000, 'acc-1', true, day, storage), 0, '回到基线')
})

test('金豆基线跨天、换账号各自重新起算，互不串数', () => {
  const { resolveGoldBeanDelta, localDayKey } = loadPureLogic()
  const storage = makeStorage()
  assert.equal(resolveGoldBeanDelta(500, 'acc-1', true, '2026-11-12', storage), 0)
  assert.equal(resolveGoldBeanDelta(650, 'acc-1', true, '2026-11-12', storage), 150)
  assert.equal(resolveGoldBeanDelta(200, 'acc-2', true, '2026-11-12', storage), 0, '另一个账号独立基线')
  assert.equal(resolveGoldBeanDelta(260, 'acc-2', true, '2026-11-12', storage), 60)
  assert.equal(resolveGoldBeanDelta(650, 'acc-1', true, '2026-11-13', storage), 0, '第二天从新基线起算')
  assert.equal(resolveGoldBeanDelta(700, 'acc-1', true, '2026-11-13', storage), 50, '新的一天继续按新基线累计')
  assert.equal(resolveGoldBeanDelta(260, 'acc-2', true, '2026-11-12', storage), 60, 'A 账号跨天不影响 B 账号')
  assert.match(localDayKey(new Date(2026, 10, 2)), /^2026-11-02$/, '日期键按本地日期，带前导零')
})

test('掉线 / 余额未下发 / 非法值时不记基线，也不显示虚高数字', () => {
  const { resolveGoldBeanDelta } = loadPureLogic()
  const storage = makeStorage()
  assert.equal(resolveGoldBeanDelta(undefined, 'acc-1', true, '2026-11-12', storage), 0)
  assert.equal(resolveGoldBeanDelta(null, 'acc-1', true, '2026-11-12', storage), 0)
  assert.equal(resolveGoldBeanDelta('abc', 'acc-1', true, '2026-11-12', storage), 0)
  assert.equal(resolveGoldBeanDelta(-5, 'acc-1', true, '2026-11-12', storage), 0)
  assert.equal(resolveGoldBeanDelta(1000, '', true, '2026-11-12', storage), 0, '没选账号')
  assert.equal(resolveGoldBeanDelta(1000, 'acc-1', false, '2026-11-12', storage), 0, '掉线')
  assert.equal(storage.data.size, 0, '以上情况一个基线都不该写')
  assert.equal(resolveGoldBeanDelta(1000, 'acc-1', true, '2026-11-12', storage), 0, '数据就绪后从 1000 起算，而不是 0')
  assert.equal(resolveGoldBeanDelta(1050, 'acc-1', true, '2026-11-12', storage), 50)
})

test('localStorage 不可用 / 内容损坏时退回内存基线，数值仍然正确', () => {
  // 两个场景各起一份纯逻辑：内存基线是模块级缓存，分开才不会互相污染。
  const brokenLogic = loadPureLogic().resolveGoldBeanDelta
  const broken = {
    getItem: () => { throw new Error('denied') },
    setItem: () => { throw new Error('denied') },
  }
  assert.equal(brokenLogic(800, 'acc-1', true, '2026-11-12', broken), 0)
  assert.equal(brokenLogic(700, 'acc-1', true, '2026-11-12', broken), -100, '写不进去也要能算出负数')

  const corruptLogic = loadPureLogic().resolveGoldBeanDelta
  const corrupt = makeStorage({ 'dashboard:todayGoldBeanBaseline:acc-1': '{not json' })
  assert.equal(corruptLogic(300, 'acc-1', true, '2026-11-12', corrupt), 0, '损坏内容不当基线')
  assert.equal(corruptLogic(280, 'acc-1', true, '2026-11-12', corrupt), -20)
})

test('只改今日统计模块：资产卡、后端统计、其他视图一律不动', () => {
  // 金豆没有后端当日净增字段，基线只在前端算，不得顺手给 core 加字段。
  assert.doesNotMatch(stats, /sessionGoldBeanGained|goldBeanGained/, '不得改动 core 统计结构')
  assert.match(dashboard, /const todayGoldBeanGained = ref\(0\)/, '金豆净值由今日统计模块内部维护')
  assert.match(dashboard, /resolveGoldBeanDelta\(\s*rawBean,/, 'watch 只负责把结果写进今日统计用的 ref')
  // 资产卡「本次运行」delta 仍只有原来两处，没有把今日数值塞进去。
  const assetStart = dashboard.indexOf('<!-- 资产 -->')
  const assetEnd = dashboard.indexOf('<!-- 库存', assetStart)
  const assetCards = dashboard.slice(assetStart, assetEnd)
  assert.equal((assetCards.match(/class="ov-tile__delta"/g) || []).length, 2)
  assert.doesNotMatch(assetCards, /todayGoldBeanGained|todayCouponGained/, '资产卡不引用今日统计的数值')
})
