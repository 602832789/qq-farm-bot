import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import test from 'node:test'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const settings = read('../src/components/settings/AccountFeatureSettings.vue')
const settingStore = read('../src/stores/setting.ts')

/** 截取 merchant 模块模板块，避免断言命中其它模块。 */
function merchantTemplate() {
  const start = settings.indexOf(`activeModule === 'merchant'`)
  assert.notEqual(start, -1, 'merchant 模块模板不存在')
  return settings.slice(start, settings.indexOf(`activeModule === 'pet'`, start))
}

test('功能模块提供「到货提醒」「购买通知」两个开关', () => {
  const block = merchantTemplate()
  assert.match(block, /消息与外部推送/)
  assert.match(block, /v-model="automation\.automation\.mystery_shop_arrival_notify" label="到货提醒"/)
  assert.match(block, /v-model="automation\.automation\.mystery_shop_purchase_notify" label="购买通知"/)
  assert.match(block, /grid gap-3 sm:grid-cols-2/, '两个提醒开关同组展示')
  assert.match(block, /顶栏「消息」/, '说明局内消息的位置')
  assert.match(block, /无需配置任何推送渠道/, '局内消息不依赖外部渠道')
  assert.match(block, /设置 → 下线提醒/, '说明外部推送渠道的配置位置')
  assert.match(block, /到货提醒单独开启也会启动每 10 分钟巡查/, '说明到货提醒会启动巡查')
  assert.match(block, /购买通知需配合自动购买，仅在买成功后推送/, '说明购买通知是附属开关')
})

test('模块摘要与总开关状态同步提醒配置', () => {
  assert.match(settings, /mystery_shop_arrival_notify && '到货提醒'/)
  assert.match(settings, /mystery_shop_purchase_notify && '购买通知'/)
  assert.match(settings, /notify\.join\('、'\) \|\| '未开启提醒'/)
  assert.match(settings, /mystery_shop_auto_buy \|\| automation\.value\.automation\.mystery_shop_arrival_notify/, '只开到货提醒时模块也显示为启用')
  assert.match(settings, /automation\.value\.automation\.mystery_shop_arrival_notify = false/, '关闭模块时清掉到货提醒')
  assert.match(settings, /automation\.value\.automation\.mystery_shop_purchase_notify = false/, '关闭模块时清掉购买通知')
})

test('开关在配置类型中有对应字段', () => {
  assert.match(settingStore, /mystery_shop_arrival_notify\?: boolean/)
  assert.match(settingStore, /mystery_shop_purchase_notify\?: boolean/)
})
