<script setup lang="ts">
import { useDateFormat, useIntervalFn, useMediaQuery, useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'

import { isMenuActive, menuGroups, menuLink, visibleMenuRoutes } from '@/router/menu'
import { useAccountStore } from '@/stores/account'
import { useAppStore } from '@/stores/app'
import { useStatusStore } from '@/stores/status'

const accountStore = useAccountStore()
const statusStore = useStatusStore()
const appStore = useAppStore()
const route = useRoute()
const { currentAccount } = storeToRefs(accountStore)
const { status, realtimeConnected } = storeToRefs(statusStore)
const { sidebarOpen } = storeToRefs(appStore)

const brandTitle = 'QQ农场智能助手'
const brandTagline = '智慧农场 · 让生长有数'

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

onMounted(() => {
  accountStore.fetchAccounts()
  accountStore.fetchCodeHealth()
  checkConnection()
})

onBeforeUnmount(() => {
  statusStore.disconnectRealtime()
})

useIntervalFn(checkConnection, 30000)
useIntervalFn(() => {
  refreshStatusFallback()
  accountStore.fetchAccounts()
  accountStore.fetchCodeHealth()
}, 10000)

watch(() => currentAccount.value?.id || currentAccount.value?.uin || '', () => {
  const accountRef = currentAccount.value?.id || currentAccount.value?.uin
  statusStore.connectRealtime(String(accountRef || ''))
  refreshStatusFallback()
}, { immediate: true })

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
    color: 'bg-gray-400',
    pulse: false,
  }
})

const desktop = useMediaQuery('(min-width: 1024px)')
const sidebarElement = ref<HTMLElement | null>(null)
const navGroups = computed(() => menuGroups.map(group => ({
  ...group,
  items: visibleMenuRoutes().filter(item => item.group === group.key),
})).filter(group => group.items.length))

function onDrawerKeydown(event: KeyboardEvent) {
  if (desktop.value || !sidebarOpen.value || event.key !== 'Tab')
    return
  const focusable = sidebarElement.value?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
  if (!focusable?.length)
    return
  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  }
  else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(sidebarOpen, async (open) => {
  if (open && !desktop.value) {
    await nextTick()
    sidebarElement.value?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus()
  }
})
watch(desktop, () => appStore.closeSidebar())

const versionLabel = __APP_VERSION_LABEL__

watch(
  () => route.path,
  () => {
    if (window.innerWidth < 1024)
      appStore.closeSidebar()
  },
)
</script>

<template>
  <aside
    id="farm-sidebar"
    ref="sidebarElement"
    class="farm-sidebar"
    :class="{ 'is-open': sidebarOpen }"
    :inert="!desktop && !sidebarOpen"
    :aria-hidden="!desktop && !sidebarOpen ? true : undefined"
    :role="!desktop && sidebarOpen ? 'dialog' : undefined"
    :aria-modal="!desktop && sidebarOpen ? true : undefined"
    aria-label="庄园导航"
    @keydown="onDrawerKeydown"
    @keydown.esc="appStore.closeSidebar"
  >
    <div class="farm-brand">
      <div class="min-w-0 flex-1">
        <div class="farm-brand-title">
          {{ brandTitle }}
        </div>
        <div class="farm-brand-caption">
          {{ brandTagline }}
        </div>
      </div>
    </div>

    <nav class="farm-navigation" aria-label="主导航">
      <section v-for="group in navGroups" :key="group.key" :aria-labelledby="`nav-${group.key}`">
        <h2 :id="`nav-${group.key}`" class="farm-nav-label">
          {{ group.label }}
        </h2>
        <RouterLink
          v-for="item in group.items" :key="item.name" :to="menuLink(item)"
          class="farm-nav-item" :class="{ 'is-active': isMenuActive(item, route.path) }"
          :aria-current="isMenuActive(item, route.path) ? 'page' : undefined"
          @click="appStore.closeSidebar"
        >
          <span :class="item.icon" class="farm-nav-icon" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ item.navLabel || item.label }}</span>
        </RouterLink>
      </section>
    </nav>

    <div class="farm-sidebar-footer">
      <div class="flex items-center justify-between gap-2 text-xs">
        <span class="flex items-center gap-2"><span class="h-2 w-2 rounded-full" :class="connectionStatus.color" />{{ connectionStatus.text }}</span>
        <span class="text-xs text-[var(--muted-text)] tabular-nums">{{ uptime }}</span>
      </div>
      <div class="mt-3 flex items-center justify-between gap-1">
        <span class="text-[11px] text-[var(--muted-text)] tabular-nums">{{ formattedTime }}</span>
      </div>
      <div class="mt-2 flex items-center justify-between text-[11px] text-[var(--muted-text)]">
        <span>{{ versionLabel }}</span>
        <a href="https://github.com/602832789/qq-farm-bot" target="_blank" rel="noopener noreferrer" aria-label="打开 GitHub 项目主页">GitHub ↗</a>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.farm-sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  width: min(300px, 88vw);
  height: 100dvh;
  padding: 22px 16px 16px;
  border-right: 1px solid var(--surface-border);
  background: var(--farm-sidebar);
  transform: translateX(-100%);
  transition: transform 180ms ease;
}
.farm-sidebar.is-open {
  transform: translateX(0);
}
.farm-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  margin: 4px 4px 12px;
  padding: 7px 8px 18px;
  border-bottom: 1px solid var(--surface-border);
}
.farm-brand-title {
  color: var(--theme-primary);
  font-size: 19px;
  font-weight: 750;
  letter-spacing: 0;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.farm-brand-caption {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 7px;
  color: var(--muted-text);
  font-size: 12px;
  letter-spacing: 0;
}
.farm-navigation {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.farm-nav-label {
  padding: 16px 14px 9px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--muted-text);
}
.farm-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 46px;
  margin-bottom: 4px;
  padding: 10px 14px;
  border-radius: 8px;
  color: var(--muted-text);
  font-size: 14px;
  transition:
    background 150ms,
    color 150ms;
}
.farm-nav-item:hover {
  background: var(--surface-2);
  color: var(--theme-text);
}
.farm-nav-item.is-active {
  background: color-mix(in srgb, var(--theme-primary) 12%, var(--surface-1));
  color: var(--theme-primary);
  font-weight: 650;
}
.farm-nav-icon {
  flex-shrink: 0;
  font-size: 20px;
}
.farm-sidebar-footer {
  position: relative;
  margin-top: 14px;
  padding: 14px 10px 0;
  border-top: 1px solid var(--surface-border);
}
@media (min-width: 1024px) {
  .farm-sidebar {
    position: relative;
    z-index: 35;
    flex-shrink: 0;
    width: 232px;
    height: 100%;
    transform: none;
  }
}
</style>
