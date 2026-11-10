import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import test from 'node:test'

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8')
const featureSettings = read('../src/components/settings/AccountFeatureSettings.vue')
const settingsPage = read('../src/views/Settings.vue')
const settingStore = read('../src/stores/setting.ts')
const petPage = read('../src/views/Pet.vue')
const dataProvider = read('../../core/src/runtime/data-provider.ts')
const accountRoutes = read('../../core/src/controllers/admin/account-routes.ts')
const accountConfig = read('../../core/src/models/store/account-config.ts')
const sharedState = read('../../core/src/models/store/shared-state.ts')
const configTypes = read('../../core/src/types/config.ts')

// 回归：PR #122 手工合并时给 activity 加了一个只放「每日邮箱奖励」的 v-else-if，
// 把原本靠末尾 v-else 渲染的「日常任务 / 节令小札 / 快乐不独享 / 收藏图鉴 / 奶茶」
// 整块挤成永远不可达的死代码。
test('「日常与活动」配置面板必须同时包含邮箱时刻和全部活动开关', () => {
  assert.equal((featureSettings.match(/v-else-if="activeModule === 'activity'"/g) || []).length, 1)
  assert.doesNotMatch(featureSettings, /<div v-else class="space-y-4">/, '末尾兜底分支不能变成不可达死代码')
  const start = featureSettings.indexOf(`<div v-else-if="activeModule === 'activity'"`)
  const branch = featureSettings.slice(start)
  for (const marker of [
    '每日邮箱奖励',
    'automation.emailClaimHour',
    'automation.automation.task',
    'automation.automation.task_after_farm',
    'star_solar_claim',
    'share_reward_share',
    'illustrated_auto_claim_rewards',
    'MilkTeaActivityPanel',
  ]) {
    assert.ok(branch.includes(marker), `activity 分支缺少 ${marker}`)
  }
})

// 回归：黄金虫「保留数量 / 单轮上限」两个输入框此前只在 UI 上存在，
// 前后端白名单、默认值、GET 接口全都没有这两个键，填了刷新就回到默认。
test('黄金虫策略与邮箱时刻的设置链路前后端完整接线', () => {
  for (const [name, source] of [
    ['config types', configTypes],
    ['shared-state', sharedState],
    ['account-config', accountConfig],
    ['data-provider', dataProvider],
    ['account-routes', accountRoutes],
    ['setting store', settingStore],
    ['settings page', settingsPage],
    ['feature panel', featureSettings],
  ]) {
    assert.ok(source.includes('goldenBugKeepCount'), `${name} 缺少 goldenBugKeepCount`)
    assert.ok(source.includes('goldenBugRoundLimit'), `${name} 缺少 goldenBugRoundLimit`)
  }
  // 三个关键白名单/快照节点必须真的把字段写进去，而不只是出现在注释里
  assert.ok(settingStore.includes(`'goldenBugKeepCount',`))
  assert.ok(dataProvider.includes(`'goldenBugRoundLimit',`))
  assert.ok(accountConfig.includes('goldenBugKeepCount: Math.max'))
  assert.ok(sharedState.includes('goldenBugRoundLimit: 24'))
  // GET /api/settings 必须下发邮箱时刻，否则刷新页面输入框会退回默认 10 点
  assert.ok(accountRoutes.includes('emailClaimHour, goldenBugKeepCount, goldenBugRoundLimit } });'))
  assert.ok(settingStore.includes('goldenBugKeepCount: data.goldenBugKeepCount'))
  assert.ok(settingsPage.includes('localAutomationSettings.value.goldenBugRoundLimit'))
})

test('卡片开关的静默保存参数被父组件接住，不再每次拨动都弹窗', () => {
  assert.ok(featureSettings.includes('emit(\'save\', key, true)'))
  assert.ok(settingsPage.includes('async function handleFeatureModuleSave(_module?: string, quiet?: boolean): Promise<boolean>'))
  assert.ok(settingsPage.includes('if (!quiet)'))
})

// 回归：「保存并关闭」此前是 fire-and-forget emit 后无条件关弹窗、清 editSnapshot。
// 邮箱时刻留了非法草稿时校验会拦下请求，但弹窗已经关了，草稿残留会把之后
// 所有保存入口（含拨卡片开关的静默保存）一起堵死，用户也失去了「取消回滚」这条路。
test('保存并关闭必须等结果，校验失败时留在弹窗里', () => {
  assert.ok(featureSettings.includes('done?: (ok: boolean) => void'))
  const fromFinish = featureSettings.slice(featureSettings.indexOf('async function finish()'))
  const finish = fromFinish.slice(0, fromFinish.indexOf('\n}'))
  assert.ok(finish.includes('await new Promise<boolean>'))
  assert.ok(finish.includes('emit(\'save\', module, false, resolve)'), '显式保存不是静默保存')
  const guardAt = finish.indexOf('if (!ok)')
  const clearAt = finish.indexOf('editSnapshot.value = null')
  const closeAt = finish.indexOf('activeModule.value = null')
  assert.ok(guardAt > 0 && clearAt > guardAt, '失败时必须先返回，不能清掉编辑快照')
  assert.ok(closeAt > guardAt, '失败时不能关弹窗')

  assert.ok(settingsPage.includes('@save="onFeatureModuleSave"'))
  assert.ok(settingsPage.includes('.catch(() => done?.(false))'), '保存抛异常也必须回执，否则弹窗永久挂起')
  assert.ok(settingsPage.includes('if (emailClaimHour === null && !quiet)'), '静默保存不能被一个非法草稿整批拦住')
  assert.ok(settingsPage.includes('return true'))
  assert.ok(settingsPage.includes('return false'))
})

test('切页签不覆盖资本模式草稿，设置保存不冲掉下线提醒草稿', () => {
  assert.doesNotMatch(petPage, /watch\(\[currentAccountId, tab\], load\)/)
  assert.ok(petPage.includes('watch(currentAccountId, load)'))
  assert.ok(petPage.includes('watch(tab, (next) =>'))
  assert.doesNotMatch(settingsPage, /watch\(settings, \(\) =>/)
  assert.ok(settingsPage.includes('watch(() => settings.value?.offlineReminder'))
})
