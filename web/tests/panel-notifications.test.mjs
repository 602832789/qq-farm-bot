import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const layout = read('../src/layouts/DefaultLayout.vue')
const bell = read('../src/components/PanelNotificationBell.vue')
const store = read('../src/stores/panel-notifications.ts')

test('顶栏挂上全局消息铃铛，任何页面都能看到局内通知', () => {
  assert.match(layout, /import PanelNotificationBell from '@\/components\/PanelNotificationBell.vue'/)
  assert.match(layout, /<PanelNotificationBell \/>/)
  assert.match(layout.slice(layout.indexOf('farm-topbar-actions'), layout.indexOf('</header>')), /<PanelNotificationBell \/>/, '铃铛在顶栏操作区')
  assert.match(bell, /aria-label="消息通知"/)
  assert.match(bell, /i-carbon-notification/)
  assert.match(bell, /panel-bell-badge/, '未读红点')
  assert.match(bell, /unreadCount > 0/)
  assert.match(bell, /Teleport to="body"/, '下拉浮层不被顶栏裁切')
})

test('消息面板展示时间、内容与空态，打开即标记已读', () => {
  assert.match(bell, /aria-label="面板消息"/)
  assert.match(bell, /formatTime\(item\.createdAt\)/)
  assert.match(bell, /whitespace-pre-line/, '多行内容保留换行')
  assert.match(bell, /item\.title/)
  assert.match(bell, /item\.content/)
  assert.match(bell, /暂无消息/)
  assert.match(bell, /神秘商人到货与自动购买消息会显示在这里/)
  assert.match(bell, /store\.markAllRead\(\)/, '展开面板即已读')
  assert.match(bell, /setInterval\([\s\S]*?30000\)/, '30 秒轮询')
  assert.match(bell, /watch\(\(\) => accountStore\.currentAccountId/, '切账号后重新拉取')
  assert.match(bell, /clearInterval\(timer\)/, '卸载时清理定时器')
})

test('store 按账号读取消息，未读状态存本地不依赖外部渠道', () => {
  assert.match(store, /api\.get\('\/api\/panel-notifications'/)
  assert.match(store, /headers: \{ 'x-account-id': id \}/)
  assert.match(store, /skipErrorToast: true/, '通知读失败不弹全局错误')
  assert.match(store, /panel_notifications_read_at/)
  assert.match(store, /unreadCount = computed\(/, '未读数由本地已读时间算出')
  assert.match(store, /readAt\(id\)/)
  assert.match(store, /localStorage\.setItem\(`\$\{READ_KEY\}:\$\{id\}`/, '已读时间按账号隔离')
  assert.match(store, /currentAccountId\(\) !== id\)/, '切账号后的旧响应不覆盖')
  assert.match(store, /catch \{[\s\S]*?读失败时保留上一批/, '读失败时降级')
})
