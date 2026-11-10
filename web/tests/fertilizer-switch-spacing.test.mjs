import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import test from 'node:test'

const settings = readFileSync(new URL('../src/components/settings/AccountFeatureSettings.vue', import.meta.url), 'utf8')
const globalCss = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')

/** 取施肥参数区里 2x2催熟 / 多季补肥 这一组开关及其容器 class。 */
function switchGroup() {
  const match = settings.match(/<div class="([^"]+)">\s*(<BaseSwitch[^>]*label="2x2催熟"[^>]*\/>)\s*(<BaseSwitch[^>]*label="多季补肥"[^>]*\/>)\s*<\/div>/)
  assert.ok(match, '两个开关应包在同一个容器内，不能只靠模板换行的空白字符分隔')
  return { classes: match[1], ripen: match[2], multiSeason: match[3] }
}

test('「2x2催熟」文字后面与下一个开关空出固定间距', () => {
  const { classes } = switchGroup()
  assert.match(classes, /\bflex\b/, '开关组用 flex 容器显式控制间距')
  assert.match(classes, /gap-x-6/, '横向 24px 间距，文字不再紧贴后面的开关')
  assert.match(classes, /flex-wrap/, '窄屏放不下时自动换行')
  assert.match(classes, /gap-y-3/, '换行后保留 12px 行间距')
})

test('间距调整不改变两个开关的绑定，也不改全站开关内部间距', () => {
  const { ripen, multiSeason } = switchGroup()
  assert.match(ripen, /v-model="automation\.automation\.fertilizer_2x2_ripen"/, '2x2 催熟绑定不变')
  assert.match(ripen, /:disabled="mutationTestActive"/, '变异测试期间禁用不变')
  assert.match(multiSeason, /v-model="automation\.automation\.fertilizer_multi_season"/, '多季补肥绑定不变')

  const baseRule = globalCss.match(/\.base-switch \{([\s\S]*?)\}/)?.[1] || ''
  assert.match(baseRule, /gap:\s*8px/, '全站 .base-switch 的开关与文字间距保持 8px')
})
