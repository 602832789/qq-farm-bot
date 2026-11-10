import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

import test from 'node:test'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const pet = read('../src/views/Pet.vue')
const baseButton = read('../src/components/ui/BaseButton.vue')
const legacyPanel = new URL('../src/components/PetPanel.vue', import.meta.url)

// 上游 PR #125 重写的是 components/PetPanel.vue，本地在 4dacc149 里刻意删掉了它，
// 改用自研的 views/Pet.vue（带资本模式页签）。这里锁住这个决策，避免下次同步误把旧组件捡回来。
test('本地宠物页仍是 views/Pet.vue，不重新引入上游 PetPanel.vue', () => {
  assert.equal(existsSync(legacyPanel), false, 'PetPanel.vue 会覆盖本地资本模式与自研 UI，不应恢复')
  assert.match(pet, /title="宠物小屋"/)
  assert.match(pet, /'capital'/)
  assert.doesNotMatch(pet, /NButton/)
})

test('狗粮不足一天有低量判定，且同时作用于时长数字与进度条', () => {
  assert.match(pet, /const durationLow = computed\(\(\) => !!deployed\.value && remainSeconds\.value < 86400\)/)
  assert.match(pet, /:class="durationLow \? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'"/)
  assert.match(pet, /:class="durationLow \? 'bg-red-500 dark:bg-red-400' : 'bg-\[var\(--theme-primary\)\]'"/)
  assert.match(pet, /守护剩余不足 1 天，建议补充狗粮/)
  const hint = pet.indexOf('v-if="durationLow"')
  const meter = pet.indexOf('foodPercent')
  assert.ok(meter > 0 && hint > meter, '低量提示必须放在进度条之后')
})

test('喂食按钮禁用时给出具体原因，可用时说明份数', () => {
  assert.match(pet, /function feedTitle\(food: \{ id: number, count: number \}\)/)
  assert.match(pet, /狗盆中没有该狗粮/)
  assert.match(pet, /正在喂食中/)
  assert.match(pet, /喂食份数需为 1–库存之间的整数/)
  assert.match(pet, /立即喂食 \$\{getFeedCount\(food\.id\)\} 份/)
  assert.match(pet, /:title="feedTitle\(food\)"/)
})

test('BaseButton 显式声明并绑定 title，按钮灰着时提示才真的能显示', () => {
  assert.match(baseButton, /title\?: string/)
  const bindings = baseButton.match(/:title="title"/g) || []
  assert.equal(bindings.length, 2, '普通按钮与 RouterLink 两条分支都要绑定 title')
})
