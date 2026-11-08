export interface MenuItem {
  path: string
  name: string
  label: string
  icon: string
  component: () => Promise<any>
  /** 侧栏分组：我的庄园 / 探索与成长 / 管理。 */
  group?: 'estate' | 'explore' | 'manage'
  /** 侧栏与页头使用的名称，未设置时回落到 label。 */
  navLabel?: string
  /** 手机底部导航使用的短名称，未设置则不出现在底部导航。 */
  mobileLabel?: string
  showInNav?: boolean
  /** 从导航菜单进入时附带的默认页签参数（如农场商城默认神秘商人），不影响菜单高亮用的纯路径。 */
  defaultTab?: string
  meta?: {
    fullBleed?: boolean
  }
}

export const menuRoutes: MenuItem[] = [
  {
    path: '',
    name: 'dashboard',
    group: 'estate',
    navLabel: '农场概览',
    mobileLabel: '概览',
    label: '概览',
    icon: 'i-carbon-chart-pie',
    component: () => import('@/views/Dashboard.vue'),
  },
  {
    path: 'personal',
    name: 'personal',
    group: 'estate',
    navLabel: '我的农场',
    mobileLabel: '农场',
    label: '个人',
    icon: 'i-carbon-user',
    component: () => import('@/views/Personal.vue'),
  },
  {
    path: 'friends',
    name: 'friends',
    group: 'estate',
    navLabel: '好友农场',
    label: '好友',
    icon: 'i-carbon-user-multiple',
    component: () => import('@/views/Friends.vue'),
  },
  {
    path: 'pet',
    name: 'pet',
    group: 'estate',
    navLabel: '宠物小屋',
    label: '宠物',
    icon: 'i-fas-paw',
    component: () => import('@/views/Pet.vue'),
  },
  {
    path: 'activity',
    name: 'activity-center',
    group: 'explore',
    navLabel: '活动中心',
    mobileLabel: '活动',
    label: '活动',
    icon: 'i-carbon-gift',
    component: () => import('@/views/ActivityCenter.vue'),
  },
  {
    path: 'game-mall',
    name: 'game-mall',
    group: 'explore',
    navLabel: '农场商城',
    label: '商城',
    icon: 'i-carbon-shopping-cart',
    defaultTab: 'mystery',
    component: () => import('@/views/GameMall.vue'),
  },
  {
    path: 'illustrated',
    name: 'illustrated',
    group: 'explore',
    navLabel: '收藏图鉴',
    mobileLabel: '图鉴',
    label: '图鉴',
    icon: 'i-carbon-book',
    component: () => import('@/views/Illustrated.vue'),
  },
  {
    path: 'analytics',
    name: 'analytics',
    group: 'explore',
    navLabel: '数据分析',
    label: '分析',
    icon: 'i-carbon-analytics',
    component: () => import('@/views/Analytics.vue'),
  },
  {
    path: 'settings',
    name: 'Settings',
    group: 'manage',
    navLabel: '设置',
    mobileLabel: '设置',
    label: '设置',
    icon: 'i-carbon-settings',
    component: () => import('@/views/Settings.vue'),
  },
]

export const menuGroups = [
  { key: 'estate', label: '我的庄园' },
  { key: 'explore', label: '探索与成长' },
  { key: 'manage', label: '管理' },
] as const

export function visibleMenuRoutes(_isAdmin = true) {
  return menuRoutes.filter(item => item.showInNav !== false)
}

export function menuPath(item: Pick<MenuItem, 'path'>) {
  return item.path ? `/${item.path}` : '/'
}

/** 导航菜单链接：带默认页签的页面用 query 打开；menuPath 仍返回纯路径供高亮 / 面包屑比对。 */
export function menuLink(item: Pick<MenuItem, 'path' | 'defaultTab'>) {
  return item.defaultTab
    ? { path: menuPath(item), query: { tab: item.defaultTab } }
    : menuPath(item)
}

/**
 * 静态目录与路由同名时（如 /activity），Web 服务器会把地址补成 /activity/，
 * 这里统一去掉尾部斜杠再比对，避免导航高亮和面包屑失配。
 */
function normalizePath(value: string) {
  const trimmed = value.replace(/\/+$/, '')
  return trimmed || '/'
}

export function matchMenu(path: string) {
  const target = normalizePath(path)
  return menuRoutes.find(item => normalizePath(menuPath(item)) === target)
}

export function isMenuActive(item: Pick<MenuItem, 'path'>, path: string) {
  return normalizePath(menuPath(item)) === normalizePath(path)
}
