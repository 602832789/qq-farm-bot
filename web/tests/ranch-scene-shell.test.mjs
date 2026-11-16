import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 牧场是独立场景（game_scene_id=2），读取要临时切场景再切回来。
// 这里锁住四件事：页面只做页签与面板挂载、协议全部收在场景壳里、
// 菜单只有一个入口、顶部场景开关与路由双向同步。
// 刻意不 import src/utils/ranch.ts：生产镜像是 Node 20，直接引 .ts 会失败。

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const page = read('../src/views/Ranch.vue')
const menu = read('../src/router/menu.ts')
const host = read('../src/components/ranch/RanchSceneHost.vue')
const store = read('../src/stores/ranch.ts')
const layout = read('../src/layouts/DefaultLayout.vue')
const sceneStore = read('../src/stores/scene.ts')
const sceneSwitch = read('../src/components/ui/SceneSwitch.vue')

/** 牧场 10 个分区各自的面板组件。少挂一个，对应页签就会只有空壳。 */
const PANELS = [
  'RanchAnimalsPanel',
  'RanchFacilitiesPanel',
  'RanchBagPanel',
  'RanchShopPanel',
  'RanchMarketPanel',
  'RanchCansPanel',
  'RanchTasksPanel',
  'RanchIllustratedPanel',
  'RanchFriendsPanel',
  'RanchActivitiesPanel',
]

test('牧场页覆盖全部分区，页签文案来自统一标签表', () => {
  assert.match(page, /from '@\/utils\/ranch'/)
  assert.match(page, /RANCH_VIEWS/)
  assert.match(page, /RANCH_VIEW_LABELS/)
  assert.match(page, /v-for="item in RANCH_VIEWS"/)
  assert.match(page, /RANCH_VIEW_LABELS\[item\]/)
  assert.match(page, /@click="switchView\(item\)"/)
})

test('每个分区都挂了面板：场景壳的面板区是插槽，不传就是空壳', () => {
  assert.match(page, /<template #default="\{ state, onRequest, activeView \}">/)
  for (const panel of PANELS) {
    assert.ok(page.includes(`<${panel}`), `${panel} 没有挂进牧场页`)
    assert.ok(page.includes(`from '@/components/ranch/${panel}.vue'`), `${panel} 没有 import`)
  }
  // 商店 / 罐头 / 好友要回传分区参数，否则切换子页签不会重新读取。
  assert.match(page, /@shop-id="shopId = \$event"/)
  assert.match(page, /@slot-type="cansSlot = \$event"/)
  assert.match(page, /@host-gid="hostGid = \$event"/)
})

test('牧场页把协议全部收在场景壳里，页面自己不管读取与待核对账本', () => {
  assert.match(page, /<RanchSceneHost[\s\S]{0,120}:params="params"/)
  // 页面只读 store 里的快照给顶部资产条用，读取与写入仍然全部留在场景壳。
  assert.doesNotMatch(page, /api\.|fetch\(|acknowledge\(/)
  assert.match(host, /document\.addEventListener\('visibilitychange'/)
  assert.match(host, /ranchStore\.acknowledge\(/)
  // 挂载时按页面要求的分区读取，不能沿用上一页残留的 activeView。
  assert.match(host, /onMounted\(\(\) => \{[\s\S]{0,160}?refresh\(props\.view\)/)
  assert.match(host, /paramsKey = computed/)
})

test('牧场只有一个菜单入口，路由指向独立页面', () => {
  assert.equal([...menu.matchAll(/path:\s*'ranch'/g)].length, 1)
  assert.match(menu, /name:\s*'ranch'[\s\S]{0,200}views\/Ranch\.vue/)
  assert.match(menu, /navLabel:\s*'我的牧场'/)
  assert.match(menu, /icon:\s*'i-carbon-tree'/)
  // 不能把牧场塞进农场页面里再各写一份场景状态。
  assert.doesNotMatch(menu, /views\/Ranch\.vue[\s\S]{0,80}scenes:/)
})

test('「我的牧场」紧跟在「我的农场」下面，中间不夹别的入口', () => {
  const paths = [...menu.matchAll(/path:\s*'([^']*)'/g)].map(match => match[1])
  const personal = paths.indexOf('personal')
  assert.ok(personal >= 0, '菜单里找不到 personal')
  assert.equal(paths[personal + 1], 'ranch', '我的牧场 必须排在 我的农场 的下一个')
})

test('牧场 store 只走统一 api，并用请求守卫丢弃过期回包', () => {
  assert.match(store, /defineStore\('ranch'/)
  assert.match(store, /api\.get|api\.post/)
  assert.doesNotMatch(store, /\$fetch|axios|new WebSocket/)
  assert.match(store, /createRequestGuard\(\)/)
  assert.match(store, /fetchGuard\.isStale\(ticket\)/)
  // 切号 / 清空数据必须作废在途读取，否则旧账号回包会写进新面板。
  assert.match(store, /function clearRanchData\(\) \{\n {4}fetchGuard\.invalidate\(\)/)
})

test('栏舍有场景视图：动物形象、状态与倒计时都来自真实数据', () => {
  const visual = read('../src/components/ranch/RanchVisualScene.vue')
  // 页面上能在「场景 / 列表」之间切换，默认场景。
  assert.match(page, /import RanchVisualScene from '@\/components\/ranch\/RanchVisualScene\.vue'/)
  assert.match(page, /animalMode = ref<'scene' \| 'list'>\('scene'\)/)
  assert.match(page, /<RanchVisualScene v-if="animalMode === 'scene'"/)

  // 精灵图按动物配置 ID 取，缺图时回落到后端给的产物图。
  assert.match(visual, /\/game-config\/seed_images_named\/seed_images\/\$\{animal\.animalId\}\.png/)
  assert.match(visual, /@error="onSpriteError\(animal\)"/)
  // 状态、倒计时、产物进度都必须渲染，不能只画图不说话。
  assert.match(visual, /animal\.stageName/)
  assert.match(visual, /countdownText\(animal\)/)
  assert.match(visual, /animal\.maxProduceCount/)
  // 点动物能就地展开动作，动作仍然走统一的 onRequest 两阶段提交。
  assert.match(visual, /v-for="action in selectedAnimal\.actions"/)
  assert.match(visual, /emit\('request'/)
})

test('牧场页顶部是牧场自己的资产条，不混用农场数据', () => {
  // 同款视觉、不同数据源：牧场等级 / 牧场货币 / 牧草 / 罐头桶。
  assert.match(page, /import RanchResourceStrip from '@\/components\/ranch\/RanchResourceStrip\.vue'/)
  assert.match(page, /<RanchResourceStrip :state="ranchState" \/>/)
  assert.doesNotMatch(page, /PersonalResourceStrip/, '不能再用农场那条资产条')
  // 场景壳内的紧凑资源条要关掉，否则同一批资源显示两遍。
  assert.match(page, /hide-resources/)

  const strip = read('../src/components/ranch/RanchResourceStrip.vue')
  assert.match(strip, /defineProps<\{ state: RanchState \| null \}>/)
  assert.match(strip, /props\.state\?\.level/)
  assert.match(strip, /props\.state\?\.resources/)
  // 不得引用农场的 store，避免又串回农场数据。
  assert.doesNotMatch(strip, /useStatusStore|useBagStore|useIllustratedStore|useFarmStore/)
})

test('顶部场景开关负责跳转，路由反向同步场景', () => {
  assert.match(sceneStore, /defineStore\('scene'/)
  assert.match(sceneStore, /function setScene\(value: GameScene\)/)
  assert.match(sceneStore, /localStorage\.setItem\(SCENE_KEY, value\)/)
  // 场景只是浏览偏好，不能发请求。
  assert.doesNotMatch(sceneStore, /api\.|\$fetch|axios/)

  assert.match(sceneSwitch, /useSceneStore\(\)/)
  assert.match(sceneSwitch, /sceneStore\.setScene\(target\.value\.value\)/)
  assert.match(sceneSwitch, /router\.push\(target\.value\.path\)/)
  assert.match(sceneSwitch, /path: '\/ranch'/)
  assert.match(sceneSwitch, /path: '\/personal'/)
  assert.doesNotMatch(sceneSwitch, /api\.|\$fetch|axios/)

  // 直接点菜单进牧场也要把开关切过去，否则「页面在牧场、开关还写着去牧场」。
  assert.match(layout, /<SceneSwitch \/>/)
  assert.match(layout, /path\.startsWith\('\/ranch'\) \? 'ranch' : 'farm'/)
})
