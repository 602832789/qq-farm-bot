export interface MenuItem {
  path: string
  name: string
  label: string
  icon: string
  component: () => Promise<any>
  adminOnly?: boolean
  meta?: {
    fullBleed?: boolean
  }
}

export const menuRoutes: MenuItem[] = [
  {
    path: '',
    name: 'dashboard',
    label: '概览',
    icon: '🏠',
    component: () => import('@/views/Dashboard.vue'),
  },
  {
    path: 'personal',
    name: 'personal',
    label: '个人',
    icon: '🌾',
    component: () => import('@/views/Personal.vue'),
  },
  {
    path: 'activity',
    name: 'activity-center',
    label: '活动',
    icon: '✨',
    component: () => import('@/views/ActivityCenter.vue'),
    meta: { fullBleed: true },
  },
  {
    path: 'friends',
    name: 'friends',
    label: '好友',
    icon: '👥',
    component: () => import('@/views/Friends.vue'),
  },
  {
    path: 'analytics',
    name: 'analytics',
    label: '分析',
    icon: '📊',
    component: () => import('@/views/Analytics.vue'),
  },
  {
    path: 'settings',
    name: 'Settings',
    label: '设置',
    icon: '⚙️',
    component: () => import('@/views/Settings.vue'),
  },
  {
    path: 'config',
    name: 'config',
    label: '游戏配置',
    icon: '📦',
    component: () => import('@/views/ConfigManage.vue'),
  },
  {
    path: 'admin',
    name: 'admin',
    label: '后台',
    icon: '🔧',
    component: () => import('@/views/AdminPanel.vue'),
    adminOnly: true,
  },
]
