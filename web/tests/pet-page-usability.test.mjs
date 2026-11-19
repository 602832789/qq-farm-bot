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

// 上游 PR #125 的 rarityTone：本地 v3.16.0 评估时因「会改视觉」暂缓，
// 现在等价落地到 views/Pet.vue。rarity / rarityLabel 后端与 store 本来就有，
// 这里只锁「本地 UI 真的把徽章渲染出来了」，不重新引入 PetPanel.vue。
test('稀有度徽章按 rarity 分四档，且在守护条与宠物卡片两处渲染', () => {
  const definition = pet.match(/function rarityTone\(rarity: number\): RarityTone \{[\s\S]*?\n\}/)
  assert.ok(definition, 'rarityTone 必须存在')
  const tone = new Function(`${definition[0].replace(/\(rarity: number\): RarityTone/, '(rarity)')}; return rarityTone`)()
  assert.equal(tone(0), 'plain')
  assert.equal(tone(1), 'plain')
  assert.equal(tone(2), 'green')
  assert.equal(tone(3), 'blue')
  assert.equal(tone(4), 'gold')
  assert.equal(tone(99), 'gold', '4 以上一律按最高档')
  assert.equal(tone(Number.NaN), 'plain', '脏数据落到灰档，不能抛错')

  const bindings = pet.match(/:class="`pet-rarity--\$\{rarityTone\([^`]+\)\}`"/g) || []
  assert.equal(bindings.length, 2, '当前守护条与名册卡片都要绑定徽章配色')
  assert.match(pet, /\{\{ deployed\.rarityLabel \}\}/)
  assert.match(pet, /\{\{ dog\.rarityLabel \}\}/)
  for (const toneClass of ['gold', 'blue', 'green', 'plain'])
    assert.match(pet, new RegExp(`\\.pet-rarity--${toneClass} \\{`))
  for (const token of ['--ui-warning', '--ui-blue', '--ui-primary', '--ui-muted'])
    assert.ok(pet.includes(`var(${token})`), '配色必须走本地 --ui-* 令牌，亮/暗自动切换')
  assert.doesNotMatch(pet, /NTag/, '不引入上游的 naive-ui 组件')
})

test('稀有度徽章不被手机端「隐藏 Lv」规则误伤', () => {
  assert.match(pet, /\.dog-card > :first-child > :last-child > div > span \{\s*display: none;/)
  const card = pet.slice(pet.indexOf('<article\n              v-for="dog in sortedDogs"'), pet.indexOf('</article>'))
  const innerDivAt = card.indexOf('class="min-w-0 flex items-center gap-1"')
  const rarityAt = card.indexOf('class="pet-rarity"')
  const levelAt = card.indexOf('Lv.')
  assert.ok(innerDivAt > 0 && rarityAt > innerDivAt, '徽章放在内层容器里，手机端不会当成外层直接子 span 隐藏')
  assert.ok(levelAt > rarityAt, '等级仍是名字行的直接子 span，继续按原有规则在手机端隐藏')
})
