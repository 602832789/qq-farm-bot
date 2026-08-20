import { useStorage } from '@vueuse/core'
import axios from 'axios'
import NProgress from 'nprogress'
import { createRouter, createWebHistory } from 'vue-router'
import { menuRoutes } from './menu'
import 'nprogress/nprogress.css'

NProgress.configure({ showSpinner: false })

const adminToken = useStorage('admin_token', '')
const userInfo = useStorage('user_info', '')
let bootstrapPromise: Promise<boolean> | null = null

async function ensureAdminSession() {
  if (adminToken.value) {
    try {
      const { data } = await axios.get('/api/auth/validate', {
        headers: { 'x-admin-token': adminToken.value },
        timeout: 6000,
      })
      if (data?.ok)
        return true
    }
    catch {}
  }

  if (!bootstrapPromise) {
    bootstrapPromise = axios.post('/api/auto-login', {}, { timeout: 6000 })
      .then(({ data }) => {
        if (!data?.ok)
          return false
        adminToken.value = data.data.token
        userInfo.value = JSON.stringify({
          username: 'admin',
          role: 'admin',
          card: null,
          accountLimit: data.data.accountLimit,
          mustChangePassword: false,
        })
        return true
      })
      .catch(() => false)
      .finally(() => { bootstrapPromise = null })
  }
  return bootstrapPromise
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('@/layouts/DefaultLayout.vue'),
      children: menuRoutes.map(route => ({
        path: route.path,
        name: route.name,
        component: route.component,
      })),
    },
    { path: '/admin', redirect: '/settings?tab=system' },
    { path: '/login', redirect: '/' },
    { path: '/renewal', redirect: '/' },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async () => {
  NProgress.start()
  return await ensureAdminSession() ? true : false
})

router.afterEach(() => NProgress.done())

export default router
