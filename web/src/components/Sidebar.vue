<script setup lang="ts">
import { useDateFormat, useIntervalFn, useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'

import { menuRoutes } from '@/router/menu'
import { useAccountStore } from '@/stores/account'
import { useAppStore } from '@/stores/app'
import { useShopStore } from '@/stores/shop'
import { useStatusStore } from '@/stores/status'
import { useToastStore } from '@/stores/toast'
import { useUserStore } from '@/stores/user'

const accountStore = useAccountStore()
const statusStore = useStatusStore()
const appStore = useAppStore()
const userStore = useUserStore()
const shopStore = useShopStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()
const { currentAccount, currentAccountId } = storeToRefs(accountStore)
const { status, realtimeConnected } = storeToRefs(statusStore)
const { mysteryOffer, mysteryOfferAccountId } = storeToRefs(shopStore)
const { loginPageConfig, sidebarOpen } = storeToRefs(appStore)

const wsErrorNotifiedAt = ref<Record<string, number>>({})
const hasUnadaptedActivities = ref(false)
const unadaptedActivityIds = ref<number[]>([])
const notifiedActivitySignature = ref('')

const systemConnected = ref(true)
const serverUptimeBase = ref(0)
const lastPingTime = ref(Date.now())
const now = useNow()
const formattedTime = useDateFormat(now, 'YYYY-MM-DD HH:mm:ss')

async function checkConnection() {
  try {
    const res = await api.get('/api/ping')
    systemConnected.value = true
    if (res.data.ok && res.data.data) {
      if (res.data.data.uptime) {
        serverUptimeBase.value = res.data.data.uptime
        lastPingTime.value = Date.now()
      }
    }
    const accountRef = currentAccount.value?.id || currentAccount.value?.uin
    if (accountRef) {
      statusStore.connectRealtime(String(accountRef))
    }
  }
  catch {
    systemConnected.value = false
  }
}

async function refreshStatusFallback() {
  if (realtimeConnected.value)
    return

  const accountRef = currentAccount.value?.id || currentAccount.value?.uin
  if (accountRef) {
    await statusStore.fetchStatus(String(accountRef))
  }
}

async function refreshActivityUpdateReminder() {
  if (!userStore.isAdmin) {
    hasUnadaptedActivities.value = false
    return
  }
  try {
    const { data } = await api.get('/api/activity/update/status')
    const ids = Array.isArray(data?.report?.unknownActivityIds)
      ? data.report.unknownActivityIds.map(Number).filter((id: number) => id > 0).sort((a: number, b: number) => a - b)
      : []
    unadaptedActivityIds.value = ids
    hasUnadaptedActivities.value = ids.length > 0
    const signature = ids.join(',')
    if (signature && signature !== notifiedActivitySignature.value) {
      notifiedActivitySignature.value = signature
      const groups = Array.isArray(data?.report?.online?.groups) ? data.report.online.groups : []
      const titles = [...new Set(groups.map((item: any) => String(item?.title || '').trim()).filter(Boolean))]
      toast.warning(`发现未适配活动：${titles.join('、') || `${ids.length} 个活动组`}`, 8000)
    }
  }
  catch {
    // 提醒查询失败不影响侧边栏及其他后台功能。
  }
}

onMounted(() => {
  appStore.fetchLoginPageConfig()
  accountStore.fetchAccounts()
  checkConnection()
  // 获取当前用户信息
  userStore.fetchUserInfo()
  refreshActivityUpdateReminder()
})

onBeforeUnmount(() => {
  statusStore.disconnectRealtime()
})

useIntervalFn(checkConnection, 30000)
useIntervalFn(refreshActivityUpdateReminder, 60000)
useIntervalFn(() => {
  refreshStatusFallback()
  accountStore.fetchAccounts()
}, 10000)

watch(() => currentAccount.value?.id || currentAccount.value?.uin || '', () => {
  const accountRef = currentAccount.value?.id || currentAccount.value?.uin
  statusStore.connectRealtime(String(accountRef || ''))
  refreshStatusFallback()
}, { immediate: true })

watch(() => status.value?.wsError, (wsError: any) => {
  if (!wsError || Number(wsError.code) !== 400 || !currentAccount.value)
    return

  const errAt = Number(wsError.at) || 0
  const accId = String(currentAccount.value.id || currentAccount.value.uin || '')
  const lastNotified = wsErrorNotifiedAt.value[accId] || 0
  if (errAt <= lastNotified)
    return

  wsErrorNotifiedAt.value[accId] = errAt
  router.push('/settings')
}, { deep: true })

const uptime = computed(() => {
  const diff = Math.floor(serverUptimeBase.value + (now.value.getTime() - lastPingTime.value) / 1000)
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  return `${h}h ${m}m ${s}s`
})

const connectionStatus = computed(() => {
  if (!systemConnected.value) {
    return {
      text: '系统离线',
      color: 'bg-red-500',
      pulse: false,
    }
  }

  if (!currentAccount.value?.id) {
    return {
      text: '请添加账号',
      color: 'bg-gray-400',
      pulse: false,
    }
  }

  const isConnected = status.value?.connection?.connected
  if (isConnected) {
    return {
      text: '运行中',
      color: 'bg-green-500',
      pulse: true,
    }
  }

  return {
    text: '未连接',
    color: 'bg-gray-400', // Or red? Old version uses gray/offline class which is gray usually
    pulse: false,
  }
})

// 根据用户角色过滤导航菜单
const navItems = computed(() => {
  const isAdmin = userStore.isAdmin
  return menuRoutes
    .filter(item => item.showInNav !== false && (!item.adminOnly || isAdmin))
    .map(item => ({
      path: item.path ? `/${item.path}` : '/',
      label: item.label,
      icon: item.icon,
    }))
})

const hasActiveMysteryOffer = computed(() => {
  const offer = mysteryOffer.value
  if (!currentAccountId.value || mysteryOfferAccountId.value !== String(currentAccountId.value))
    return false
  if (!offer?.active || offer.purchased)
    return false
  const endTime = Number(offer.endTime || 0)
  const endMs = endTime > 10_000_000_000 ? endTime : endTime * 1000
  return !endMs || endMs > Date.now()
})

const version = __APP_VERSION__

watch(
  () => route.path,
  () => {
    // Close sidebar on route change (mobile only)
    if (window.innerWidth < 1024)
      appStore.closeSidebar()
  },
)

const showThemeDropdown = ref(false)
</script>

<template>
  <aside
    class="fixed inset-y-0 left-0 z-50 h-full w-72 flex flex-col border-r border-gray-200/50 p-3 transition-transform duration-300 lg:static lg:translate-x-0 dark:border-gray-700/50"
    :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
    :style="{ background: 'color-mix(in srgb, var(--surface-1) 88%, transparent)', color: 'var(--theme-text)' }"
  >
    <!-- Brand -->
    <div class="h-14 flex items-center justify-between border-b border-gray-200/60 px-3 dark:border-gray-700/60">
      <div class="min-w-0 flex items-center gap-3">
        <div class="h-10 w-10 flex flex-none items-center justify-center overflow-hidden rounded-full shadow-sm ring-1 ring-gray-200 dark:ring-gray-700">
          <img
            src="/icon.png"
            :alt="`${loginPageConfig.title || 'QQ农场智能助手'}图标`"
            class="h-full w-full object-cover"
          >
        </div>
        <span class="min-w-0 truncate text-base text-gray-800 font-bold dark:text-gray-100">
          {{ loginPageConfig.title || 'QQ农场智能助手' }}
        </span>
      </div>
      <!-- Mobile Close Button -->
      <button
        class="h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 transition lg:hidden hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
        @click="appStore.closeSidebar"
      >
        <div class="i-carbon-close text-xl" />
      </button>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto px-1 py-4 space-y-2">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="group flex items-center gap-3.5 rounded-xl px-4 py-3 text-base transition-all duration-200 hover:translate-x-0.5 hover:bg-gray-100/70 dark:hover:bg-gray-700/50"
        :active-class="item.path === '/' ? '' : 'font-medium shadow-sm'"
        :style="{
          '--active-color': 'var(--theme-primary)',
          '--active-bg': 'var(--theme-primary)',
          '--active-bg-opacity': '0.1',
          'color': 'var(--theme-text)',
          'opacity': '0.8',
        }"
      >
        <div class="text-xl transition-transform duration-200 group-hover:scale-110" :class="[item.icon]" />
        <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
        <span
          v-if="item.path === '/shop' && hasActiveMysteryOffer"
          class="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.15)]"
          title="神秘商人已出现"
        />
        <span
          v-if="item.path === '/activity' && hasUnadaptedActivities"
          class="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.15)]"
          :title="`发现 ${unadaptedActivityIds.length} 个未适配活动`"
        />
      </router-link>
    </nav>

    <!-- Footer Status -->
    <div class="ui-subtle-panel relative mt-auto rounded-lg px-3 py-2.5">
      <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div class="flex items-center gap-1.5">
          <div
            class="h-2 w-2 rounded-full"
            :class="[connectionStatus.color, { 'animate-pulse': connectionStatus.pulse }]"
          />
          <span>{{ connectionStatus.text }}</span>
        </div>
        <span>{{ uptime }}</span>
      </div>
      <div class="flex flex-col text-xs text-gray-400 font-mono">
        <div class="flex items-center justify-between">
          <span>{{ formattedTime }}</span>
          <!-- 主题调色盘按钮 -->
          <button
            class="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-200/50 hover:text-gray-600 dark:hover:bg-gray-700/50 dark:hover:text-gray-300"
            title="主题设置"
            @click="showThemeDropdown = !showThemeDropdown"
          >
            <div class="i-carbon-color-palette text-sm" :style="{ color: 'var(--theme-primary)' }" />
          </button>
        </div>
        <div class="flex items-center justify-between opacity-60">
          <span>v{{ version }}</span>
          <span>xxxscarlxrd404</span>
        </div>
      </div>

      <!-- 主题选择弹出面板 -->
      <div
        v-show="showThemeDropdown"
        class="glass-panel absolute bottom-full left-0 right-0 z-50 grid grid-cols-4 mb-14 gap-1.5 rounded-lg p-2"
      >
        <button
          v-for="(t, theme) in appStore.themes"
          :key="theme"
          class="group relative flex flex-col items-center justify-center gap-1 rounded-lg p-2 transition-all hover:scale-105"
          :class="{
            'ring-2 ring-offset-1': appStore.currentTheme === theme,
          }"
          :style="{
            'background': t.gradient,
            '--tw-ring-color': t.primary,
            '--tw-ring-offset-color': 'var(--theme-bg)',
          }"
          :title="t.name"
          @click="appStore.applyTheme(theme as any); showThemeDropdown = false"
        >
          <div :class="t.icon" class="text-base text-white" />
          <span class="text-[10px] text-white font-medium leading-tight">{{ t.name }}</span>
          <div
            v-if="appStore.currentTheme === theme"
            class="absolute right-1 top-1 h-3 w-3 flex items-center justify-center rounded-full bg-white shadow"
          >
            <div class="i-carbon-checkmark text-xs" :style="{ color: t.primary }" />
          </div>
        </button>
      </div>
    </div>
  </aside>

</template>
<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.3);
  border-radius: 2px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
}

/* Active router link styling */
.router-link-active {
  background-color: var(--active-bg) !important;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--theme-primary) 15%, transparent),
    color-mix(in srgb, var(--theme-primary) 6%, transparent)
  ) !important;
  color: var(--theme-primary) !important;
  box-shadow:
    inset 3px 0 0 var(--theme-primary),
    0 8px 18px color-mix(in srgb, var(--theme-primary) 12%, transparent),
    0 0 0 1px color-mix(in srgb, var(--theme-primary) 15%, transparent) !important;
}

.router-link-exact-active {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--theme-primary) 15%, transparent),
    color-mix(in srgb, var(--theme-primary) 6%, transparent)
  ) !important;
  color: var(--theme-primary) !important;
  box-shadow:
    inset 3px 0 0 var(--theme-primary),
    0 8px 18px color-mix(in srgb, var(--theme-primary) 12%, transparent),
    0 0 0 1px color-mix(in srgb, var(--theme-primary) 15%, transparent) !important;
}

/* Dropdown active item */
.bg-green-50 {
  background-color: color-mix(in srgb, var(--theme-primary) 10%, transparent) !important;
}

.dark\:bg-green-900\/10 {
  background-color: color-mix(in srgb, var(--theme-primary) 15%, transparent) !important;
}

</style>
