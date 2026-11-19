import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 牧场是独立场景（game_scene_id=2）：侧栏整套换成 ranch-menu，页面拆成 7 个独立子页，
// 顶部不再单独放场景按钮，而是侧栏里的「农场 / 牧场」分段开关。
// 这里锁住信息架构本身；协议读取与两阶段提交仍由 ranch-scene-shell 之外的测试覆盖。
// 刻意不 import src/utils/ranch.ts：生产镜像是 Node 20，直接引 .ts 会失败。

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const page = read('../src/views/Ranch.vue')
const menu = read('../src/router/menu.ts')
const ranchMenu = read('../src/router/ranch-menu.ts')
const router = read('../src/router/index.ts')
const sidebar = read('../src/components/Sidebar.vue')
const layout = read('../src/layouts/DefaultLayout.vue')
const sceneStore = read('../src/stores/scene.ts')
const store = read('../src/stores/ranch.ts')
const host = read('../src/components/ranch/RanchSceneHost.vue')

const sections = [
  ['RanchOverview', 'RanchVisualScene', 'RanchAnimalsPanel', 'RanchResourceStrip'],
  ['RanchPersonal', 'RanchFacilitiesPanel', 'RanchBagPanel', 'RanchTasksPanel'],
  ['RanchFriends', 'RanchFriendsPanel'],
  ['RanchActivity', 'RanchActivitiesPanel'],
  ['RanchShop', 'RanchShopPanel', 'RanchMarketPanel', 'RanchCansPanel'],
  ['RanchIllustrated', 'RanchIllustratedPanel'],
  ['RanchAnalytics', 'formatQuantity'],
]

test('牧场页只是分区切换器：7 个子页按路由参数挂载', () => {
  assert.match(page, /const SECTIONS = \{/)
  for (const [view] of sections) {
    assert.match(page, new RegExp(`${view},`), `${view} 没有登记进分区表`)
    assert.match(page, new RegExp(`import ${view} from './ranch/${view}\\.vue'`), `${view} 没有 import`)
  }
  assert.match(page, /route\.params\.section \|\| 'overview'/)
  assert.match(page, /<component :is="component" \/>/)
  // 页面本身不碰协议：读取、缓存、待核对账本都在场景壳里。
  assert.doesNotMatch(page, /api\.|fetch\(/)
})

test('每个子页都挂了自己的面板，场景壳的插槽不传就是空壳', () => {
  for (const [view, ...panels] of sections) {
    const source = read(`../src/views/ranch/${view}.vue`)
    for (const panel of panels) {
      const imported = panel.startsWith('Ranch') || panel === 'formatQuantity'
      assert.ok(source.includes(panel), `${view} 没有挂 ${panel}`)
      if (imported)
        assert.match(source, new RegExp(`import[\\s\\S]{0,80}${panel}`), `${view} 没有 import ${panel}`)
    }
    if (view !== 'RanchAnalytics')
      assert.match(source, /<template #default="\{ state/, `${view} 没有把面板放进场景壳插槽`)
  }
})

test('个人与商城把页签写进地址栏，切换时清空上一页的查询参数', () => {
  const personal = read('../src/views/ranch/RanchPersonal.vue')
  assert.match(personal, /route\.query\.view/)
  assert.match(personal, /key: 'buildings'[\s\S]{0,120}view: 'facilities'/)
  assert.match(personal, /key: 'warehouse'[\s\S]{0,120}view: 'bag'/)
  assert.match(personal, /key: 'tasks'[\s\S]{0,120}view: 'tasks'/)
  assert.match(personal, /router\.replace\(/)

  const shop = read('../src/views/ranch/RanchShop.vue')
  assert.match(shop, /const params = computed/)
  assert.match(shop, /@shop-id="shopId = \$event"/)
  assert.match(shop, /@slot-type="cansSlot = \$event"/)
  assert.match(shop, /shopId\.value = null/)
  assert.match(shop, /cansSlot\.value = null/)

  const friends = read('../src/views/ranch/RanchFriends.vue')
  assert.match(friends, /@host-gid="hostGid = \$event"/)
  assert.match(friends, /hostGid\.value \? \{ hostGid: hostGid\.value \} : \{\}/)
})

test('牧场菜单是独立一份：7 个分区 + 设置，概览排第一', () => {
  const paths = [...ranchMenu.matchAll(/path:\s*'([^']+)'/g)].map(match => match[1])
  assert.deepEqual(paths, [
    '/ranch',
    '/ranch/personal',
    '/ranch/friends',
    '/ranch/activity',
    '/ranch/shop',
    '/ranch/illustrated',
    '/ranch/analytics',
    '/settings',
  ])
  assert.match(ranchMenu, /function isRanchMenuActive/)
  // 概览是 /ranch 本身，不能被 /ranch/personal 抢走高亮。
  assert.match(ranchMenu, /target === '\/ranch'/)
})

test('农场菜单里不再出现牧场入口，两边靠侧栏开关互跳', () => {
  assert.equal([...menu.matchAll(/path:\s*'ranch'/g)].length, 0)
  assert.doesNotMatch(menu, /views\/Ranch\.vue/)
})

test('路由提供 7 个分区与旧地址重定向', () => {
  assert.match(router, /ranch\/:section\(overview\|personal\|friends\|activity\|shop\|illustrated\|analytics\)\?/)
  assert.match(router, /import\('@\/views\/Ranch\.vue'\)/)
  assert.match(router, /path: 'ranch\/buildings', redirect: '\/ranch\/personal'/)
  assert.match(router, /path: 'ranch\/warehouse', redirect: '\/ranch\/personal\?view=warehouse'/)
  assert.match(router, /path: 'ranch\/orders', redirect: '\/ranch\/personal\?view=tasks'/)
})

test('侧栏顶部是农场 / 牧场分段开关，导航随场景整套替换', () => {
  assert.match(sidebar, /SCENE_OPTIONS/)
  assert.match(sidebar, /key: 'farm', label: '农场'/)
  assert.match(sidebar, /key: 'ranch', label: '牧场'/)
  assert.match(sidebar, /sceneStore\.select\(option\)/)
  assert.match(sidebar, /router\.push\(option === 'ranch' \? '\/ranch' : '\/'\)/)
  assert.match(sidebar, /scene\.value === 'ranch' \? ranchItems\.value : farmItems\.value/)
  assert.match(sidebar, /ranchMenu\.map/)
  assert.match(sidebar, /SCENE_BRAND\[scene\.value\]/)
  // 开关只是浏览偏好，不能顺手发请求。
  assert.doesNotMatch(sidebar.slice(sidebar.indexOf('function switchScene'), sidebar.indexOf('function switchScene') + 220), /api\./)
})

test('场景偏好按账号保存，路由反向同步且不覆盖设置页', () => {
  assert.match(sceneStore, /useStorage<Record<string, GameScene>>\(SCENE_KEY, \{\}\)/)
  assert.match(sceneStore, /selectionKey = computed/)
  assert.match(sceneStore, /function select\(value: GameScene\)/)
  assert.match(sceneStore, /function setScene\(value: GameScene\)/)
  assert.doesNotMatch(sceneStore, /api\.|\$fetch|axios/)

  assert.match(layout, /path\.startsWith\('\/ranch'\) \? 'ranch' : 'farm'/)
  assert.match(layout, /if \(path === '\/settings'\)/)
  // 顶部不再放场景按钮，开关只在侧栏一处。
  assert.doesNotMatch(layout, /SceneSwitch/)
  assert.match(layout, /matchRanchMenu\(route\.path\)/)
})

test('牧场 store 只走统一 api，并用请求守卫丢弃过期回包', () => {
  assert.match(store, /defineStore\('ranch'/)
  assert.match(store, /api\.get|api\.post/)
  assert.doesNotMatch(store, /\$fetch|axios|new WebSocket/)
  assert.match(store, /createRequestGuard\(\)/)
  assert.match(store, /fetchGuard\.isStale\(ticket\)/)
  assert.match(store, /function clearRanchData\(\) \{\n {4}fetchGuard\.invalidate\(\)/)
})

test('栏舍场景视图仍在：精灵图按动物配置 ID 取，倒计时来自真实数据', () => {
  const source = read('../src/views/ranch/RanchOverview.vue')
  assert.match(source, /import RanchVisualScene from '@\/components\/ranch\/RanchVisualScene\.vue'/)
  assert.match(source, /const mode = ref<'scene' \| 'list'>\('scene'\)/)
  assert.match(source, /<RanchVisualScene v-if="mode === 'scene'"/)

  const visual = read('../src/components/ranch/RanchVisualScene.vue')
  assert.match(visual, /\/game-config\/seed_images_named\/seed_images\/\$\{animal\.animalId\}\.png/)
  assert.match(visual, /@error="onSpriteError\(animal\)"/)
  assert.match(visual, /animal\.stageName/)
  assert.match(visual, /countdownText\(animal\)/)
  assert.match(visual, /animal\.maxProduceCount/)
  assert.match(visual, /v-for="action in selectedAnimal\.actions"/)
  assert.match(visual, /emit\('request'/)
})

test('概览顶部是牧场自己的资产条，不混用农场数据', () => {
  const source = read('../src/views/ranch/RanchOverview.vue')
  assert.match(source, /import RanchResourceStrip from '@\/components\/ranch\/RanchResourceStrip\.vue'/)
  assert.match(source, /<RanchResourceStrip :state="state" \/>/)
  assert.doesNotMatch(source, /PersonalResourceStrip/, '不能再用农场那条资产条')
  assert.match(source, /hide-resources/)

  const strip = read('../src/components/ranch/RanchResourceStrip.vue')
  assert.match(strip, /defineProps<\{ state: RanchState \| null \}>/)
  assert.match(strip, /props\.state\?\.level/)
  assert.match(strip, /props\.state\?\.resources/)
  assert.doesNotMatch(strip, /useStatusStore|useBagStore|useIllustratedStore|useFarmStore/)
})

test('场景壳仍然负责读取、可见性刷新与待核对账本', () => {
  assert.match(host, /document\.addEventListener\('visibilitychange'/)
  assert.match(host, /ranchStore\.acknowledge\(/)
  assert.match(host, /onMounted\(\(\) => \{[\s\S]{0,160}?refresh\(props\.view\)/)
  assert.match(host, /paramsKey = computed/)
  assert.match(host, /watch\(\(\) => \[props\.view, paramsKey\.value\]/)
})
