/**
 * 牧场侧边栏菜单：与 liyang 版牧场页面一一对应。
 *
 * 牧场是独立场景（game_scene_id=2），进牧场后侧栏整套换成这一份，
 * 农场那套（土地 / 宠物 / 农场商城）不掺进来；两边靠侧栏顶部的
 * 「农场 | 牧场」分段开关互跳，同一个目的地只保留一个入口。
 */
export interface RanchMenuItem {
  path: string
  name: string
  label: string
  icon: string
  /** 手机底部导航使用的短名称，未设置则不出现在底部导航。 */
  mobileLabel?: string
}

export const ranchMenu: RanchMenuItem[] = [
  { path: '/ranch', name: 'ranch-dashboard', label: '概览', icon: 'i-carbon-dashboard', mobileLabel: '概览' },
  { path: '/ranch/personal', name: 'ranch-personal', label: '个人', icon: 'i-carbon-sprout', mobileLabel: '个人' },
  { path: '/ranch/illustrated', name: 'ranch-illustrated', label: '图鉴', icon: 'i-carbon-book' },
  { path: '/ranch/activity', name: 'ranch-activity', label: '活动', icon: 'i-carbon-gift', mobileLabel: '活动' },
  { path: '/ranch/friends', name: 'ranch-friends', label: '好友', icon: 'i-carbon-user-multiple' },
  { path: '/ranch/strategy', name: 'ranch-strategy', label: '策略', icon: 'i-carbon-settings-adjust' },
  { path: '/ranch/game-mall', name: 'ranch-game-mall', label: '商城', icon: 'i-carbon-shopping-cart', mobileLabel: '商城' },
  { path: '/ranch/settings', name: 'ranch-settings', label: '设置', icon: 'i-carbon-settings', mobileLabel: '设置' },
]

const normalize = (value: string) => value.replace(/\/+$/, '') || '/'

/** 概览是 `/ranch` 本身，其余按前缀匹配，`/ranch/personal?tab=bag` 也算命中。 */
export function isRanchMenuActive(item: Pick<RanchMenuItem, 'path'>, path: string) {
  const target = normalize(path)
  const base = normalize(item.path)
  if (base === '/ranch')
    return target === '/ranch'
  return target === base || target.startsWith(`${base}/`)
}

export function matchRanchMenu(path: string) {
  return ranchMenu.find(item => isRanchMenuActive(item, path))
}
