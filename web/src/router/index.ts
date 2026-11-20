import { useStorage } from '@vueuse/core'
import axios from 'axios'
import NProgress from 'nprogress'
import { createRouter, createWebHistory } from 'vue-router'
import { menuRoutes } from './menu'
import 'nprogress/nprogress.css'

NProgress.configure({ showSpinner: false })

const adminToken = useStorage('admin_token', '')
let validatedToken = ''
let validatingPromise: Promise<boolean> | null = null

async function ensureTokenValid() {
  const token = String(adminToken.value || '').trim()
  if (!token)
    return false

  if (validatedToken && validatedToken === token)
    return true

  if (validatingPromise)
    return validatingPromise

  validatingPromise = axios.get('/api/auth/validate', {
    headers: { 'x-admin-token': token },
    timeout: 6000,
  }).then((res) => {
    const ok = !!(res.data && res.data.ok)
    if (ok)
      validatedToken = token
    return ok
  }).catch(() => false).finally(() => {
    validatingPromise = null
  })

  return validatingPromise
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('@/layouts/DefaultLayout.vue'),
      children: [
        ...menuRoutes.map(route => ({
          path: route.path,
          name: route.name,
          component: route.component,
          meta: route.meta,
        })),
        // 牧场沿用 liyang 版的页面与分区：概览 / 个人 / 图鉴 / 活动 / 好友 / 策略 / 游戏商城 / 设置。
        { path: 'ranch/warehouse', redirect: '/ranch/personal?tab=bag' },
        { path: 'ranch/buildings', redirect: '/ranch/personal' },
        { path: 'ranch/orders', redirect: '/ranch/personal?tab=tasks' },
        {
          path: 'ranch',
          name: 'ranch-dashboard',
          meta: { gameSpace: 'ranch' },
          component: () => import('@/views/RanchOverview.vue'),
        },
        {
          path: 'ranch/personal',
          name: 'ranch-personal',
          meta: { gameSpace: 'ranch', ranchSection: 'personal' },
          component: () => import('@/views/Ranch.vue'),
        },
        {
          path: 'ranch/illustrated',
          name: 'ranch-illustrated',
          meta: { gameSpace: 'ranch', ranchSection: 'illustrated' },
          component: () => import('@/views/Ranch.vue'),
        },
        {
          path: 'ranch/activity',
          name: 'ranch-activity',
          meta: { gameSpace: 'ranch', ranchSection: 'activity' },
          component: () => import('@/views/Ranch.vue'),
        },
        {
          path: 'ranch/friends',
          name: 'ranch-friends',
          meta: { gameSpace: 'ranch', ranchSection: 'friends' },
          component: () => import('@/views/Ranch.vue'),
        },
        {
          path: 'ranch/game-mall',
          name: 'ranch-game-mall',
          meta: { gameSpace: 'ranch', ranchSection: 'mall' },
          component: () => import('@/views/Ranch.vue'),
        },
        {
          path: 'ranch/analytics',
          name: 'ranch-analytics',
          meta: { gameSpace: 'ranch' },
          component: () => import('@/views/RanchAnalytics.vue'),
        },
        // 自动化策略页不再出现在侧栏，但保留直达入口，设置页仍可跳转。
        {
          path: 'ranch/strategy',
          name: 'ranch-strategy',
          meta: { gameSpace: 'ranch' },
          component: () => import('@/views/RanchStrategy.vue'),
        },
        {
          path: 'ranch/settings',
          name: 'ranch-settings',
          meta: { gameSpace: 'ranch' },
          component: () => import('@/views/Settings.vue'),
        },
      ],
    },
    {
      path: '/mystery-shop',
      name: 'mystery-shop',
      redirect: to => ({ name: 'game-mall', query: { ...to.query, tab: 'mystery' }, hash: to.hash }),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
    },
  ],
})

router.beforeEach(async (to, _from) => {
  NProgress.start()

  if (to.name === 'login') {
    if (!adminToken.value) {
      validatedToken = ''
      return true
    }
    const valid = await ensureTokenValid()
    if (valid)
      return { name: 'dashboard' }
    adminToken.value = ''
    validatedToken = ''
    return true
  }

  if (!adminToken.value) {
    validatedToken = ''
    return { name: 'login' }
  }

  const valid = await ensureTokenValid()
  if (!valid) {
    adminToken.value = ''
    validatedToken = ''
    return { name: 'login' }
  }

  return true
})

router.afterEach(() => {
  NProgress.done()
})

export default router
