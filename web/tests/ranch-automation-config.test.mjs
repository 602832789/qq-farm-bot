import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'
import test from 'node:test'

// 牧场自动化开关的真值来源是后端 core/src/config/ranch-automation.ts 与
// core/src/services/ranch/automation.ts。这里只做静态源码比对，不启动后端、不连真实服务端。
// 刻意不 import src/utils/ranch.ts：生产镜像是 Node 20，直接引 .ts 会失败。

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const configSource = read('../../core/src/config/ranch-automation.ts')
const serviceSource = read('../../core/src/services/ranch/automation.ts')
const webSource = read('../src/utils/ranch.ts')
const settingsSource = read('../src/components/settings/AccountFeatureSettings.vue')

function parseDefaults(source) {
  const block = source.match(/RANCH_AUTOMATION_DEFAULTS\s*=\s*\{([\s\S]*?)\n\}/)?.[1]
  assert.ok(block, '默认值结构变化，请同步 web/src/utils/ranch.ts 与 core/src/config/ranch-automation.ts')
  const result = {}
  for (const line of block.split('\n')) {
    // 逐行切分而不是用带回溯的整行正则：默认值行是 `key: value,`。
    const trimmed = line.trim()
    if (!trimmed.endsWith(','))
      continue
    const colon = trimmed.indexOf(':')
    if (colon <= 0)
      continue
    const key = trimmed.slice(0, colon).trim()
    if (!/^\w+$/.test(key))
      continue
    const raw = trimmed.slice(colon + 1, -1).trim().split(/\s+as\s/)[0].trim()
    if (raw === 'true' || raw === 'false')
      result[key] = raw === 'true'
    else if (/^-?\d+(?:\.\d+)?$/.test(raw))
      result[key] = Number(raw)
    else
      result[key] = raw.replace(/^'|'$/g, '')
  }
  return result
}

/** `{ key: 'ranch_x', label: '...', desc: '...', group: 'own' }` 单行条目。 */
function parseSwitches(source) {
  const block = source.match(/RANCH_AUTOMATION_SWITCHES[^=]*=\s*\[([\s\S]*?)\n\]/)?.[1]
  assert.ok(block, '前端开关清单结构变化')
  return [...block.matchAll(/\{\s*key:\s*'([^']+)'[^}]*?group:\s*'([^']+)'/g)]
    .map(match => ({ key: match[1], group: match[2] }))
}

const backendDefaults = parseDefaults(configSource)
const webDefaults = parseDefaults(webSource)
const backendSwitchKeys = Object.keys(backendDefaults).filter(key => typeof backendDefaults[key] === 'boolean')
const webSwitches = parseSwitches(webSource)

test('牧场开关清单与后端、前端两份默认值逐 key、逐值一致', () => {
  assert.deepEqual(webDefaults, backendDefaults, '前端默认值必须与后端逐 key、逐值一致')
  assert.deepEqual(webSwitches.map(item => item.key).sort(), [...backendSwitchKeys].sort())
})

test('卡片总开关只恢复后端默认里本就为 true 的动作', () => {
  const defaultOn = Object.keys(backendDefaults).filter(key => backendDefaults[key] === true)
  assert.deepEqual(defaultOn.sort(), ['ranch_share', 'ranch_task'])
  // 设置页据此判定：关闭时清空全部动作，开启时只恢复默认开启的两项。
  assert.match(settingsSource, /isRanchSwitchDefaultOn\(item\.key\)/)
  assert.match(settingsSource, /for \(const item of RANCH_AUTOMATION_SWITCHES\)/)
})

test('分组覆盖全部开关且不重复，好友组与后端 FRIEND_CONTROLS 同一批开关', () => {
  assert.deepEqual([...new Set(webSwitches.map(item => item.group))].sort(), ['friend', 'own', 'reward'])
  assert.equal(new Set(webSwitches.map(item => item.key)).size, webSwitches.length)
  for (const key of webSwitches.map(item => item.key))
    assert.ok(serviceSource.includes(`'${key}'`), `${key} 在后端巡查流程里没有被使用`)

  const controls = serviceSource.match(/const FRIEND_CONTROLS[^=]*=\s*\{([^}]*)\}/)?.[1]
  assert.ok(controls, '后端好友互动开关表结构变化，请同步设置页分组')
  const friendKeys = [...controls.matchAll(/:\s*'([^']+)'/g)].map(match => match[1]).sort()
  const friendGroup = webSwitches.filter(item => item.group === 'friend').map(item => item.key).sort()
  assert.deepEqual(friendGroup, friendKeys)
})

test('策略选项与巡查区间边界取自后端校验规则', () => {
  const allowed = configSource.match(/key === 'ranch_strategy'\s*\?\s*\[([^\]]*)\]\s*:\s*\[([^\]]*)\]/)
  assert.ok(allowed, '后端策略白名单结构变化，请同步设置页选项')
  const backendStrategy = [...allowed[1].matchAll(/'([^']+)'/g)].map(match => match[1])
  const backendFallback = [...allowed[2].matchAll(/'([^']+)'/g)].map(match => match[1])

  const strategyOptions = webSource.match(/export const RANCH_STRATEGY_OPTIONS[\s\S]*?\n\]/)?.[0]
  const fallbackOptions = webSource.match(/export const RANCH_BAG_FALLBACK_OPTIONS[\s\S]*?\n\]/)?.[0]
  assert.ok(strategyOptions && fallbackOptions, '前端策略选项结构变化')
  assert.deepEqual([...strategyOptions.matchAll(/value:\s*'([^']+)'/g)].map(match => match[1]), backendStrategy)
  assert.deepEqual([...fallbackOptions.matchAll(/value:\s*'([^']+)'/g)].map(match => match[1]), backendFallback)

  const range = configSource.match(/number\s*<\s*(\d+)\s*\|\|\s*number\s*>\s*(\d+)/)
  assert.ok(range, '后端巡查间隔校验结构变化，请同步设置页边界')
  assert.match(webSource, new RegExp(`checkMinutes:\\s*\\{\\s*min:\\s*${range[1]},\\s*max:\\s*${range[2]}\\s*\\}`))
})

test('窝与棚的指定动物按后端 kind 判定', () => {
  const kinds = configSource.match(/key === 'ranch_coop_animal'\s*\?\s*'([^']+)'\s*:\s*'([^']+)'/)
  assert.ok(kinds, '后端窝/棚类型判定结构变化，请同步设置页选项过滤')
  const animals = JSON.parse(read('../../core/src/gameConfig/ranch/MCAnimalConfig.json'))
  const animalKinds = [...new Set(animals.map(animal => animal.husbandry_type))].sort()
  assert.deepEqual(animalKinds, [kinds[2], kinds[1]].sort())
  assert.match(webSource, /function ranchUsesPreferredAnimal/)
  assert.match(webSource, /strategy === 'preferred' \|\| \(strategy === 'bag_priority' && bagFallback === 'preferred'\)/)
})

test('设置页与开关清单来自同一份常量，避免新增开关漏挂卡片', () => {
  assert.match(settingsSource, /RANCH_AUTOMATION_SWITCHES/)
  assert.match(settingsSource, /RANCH_AUTOMATION_GROUPS/)
  assert.match(settingsSource, /activeModule === 'ranch'/)
})
