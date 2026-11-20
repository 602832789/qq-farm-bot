<script setup lang="ts">
import type { GameScene } from '@/stores/scene'
import { useDateFormat, useIntervalFn, useMediaQuery, useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'
import ThemeSwitcher from '@/components/ThemeSwitcher.vue'
import { isMenuActive, menuLink, visibleMenuRoutes } from '@/router/menu'
import { isRanchMenuActive, ranchMenu } from '@/router/ranch-menu'
import { useAccountStore } from '@/stores/account'
import { useAppStore } from '@/stores/app'
import { SCENE_BRAND, useSceneStore } from '@/stores/scene'
import { useStatusStore } from '@/stores/status'

const accountStore = useAccountStore()
const statusStore = useStatusStore()
const appStore = useAppStore()
const sceneStore = useSceneStore()
const route = useRoute()
const router = useRouter()
const { currentAccount } = storeToRefs(accountStore)
const { status, realtimeConnected } = storeToRefs(statusStore)
const { sidebarOpen } = storeToRefs(appStore)
const { scene } = storeToRefs(sceneStore)

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
  checkConnection()
})

onBeforeUnmount(() => {
  statusStore.disconnectRealtime()
})

useIntervalFn(checkConnection, 30000)
useIntervalFn(() => {
  refreshStatusFallback()
  accountStore.fetchAccounts()
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

/** 侧栏导航项：农场用 menuRoutes 的一份投影，牧场用 ranchMenu，两者结构对齐后共用同一份渲染。 */
interface NavItem {
  key: string
  to: ReturnType<typeof menuLink> | string
  label: string
  icon: string
  active: boolean
}

const farmItems = computed<NavItem[]>(() => visibleMenuRoutes().map(item => ({
  key: item.name,
  to: menuLink(item),
  label: item.label,
  icon: item.icon,
  active: isMenuActive(item, route.path),
})))

const ranchItems = computed<NavItem[]>(() => ranchMenu.map(item => ({
  key: item.name,
  to: item.path,
  label: item.label,
  icon: item.icon,
  active: isRanchMenuActive(item, route.path),
})))

const navItems = computed(() => (scene.value === 'ranch' ? ranchItems.value : farmItems.value))
const brand = computed(() => SCENE_BRAND[scene.value])

const SCENE_OPTIONS: Array<{ key: GameScene, label: string, icon: string }> = [
  { key: 'farm', label: '农场', icon: 'i-carbon-sprout' },
  { key: 'ranch', label: '牧场', icon: 'i-carbon-wheat' },
]

/**
 * 场景切换 = 换整套侧栏 + 跳到该场景的首页。
 * 只改 scene 不跳转会出现「侧栏已经是牧场菜单、页面还停在农场」的错位。
 */
function switchScene(option: GameScene) {
  if (scene.value === option)
    return
  sceneStore.select(option)
  void router.push(option === 'ranch' ? '/ranch' : '/')
}

const desktop = useMediaQuery('(min-width: 1024px)')
const sidebarElement = ref<HTMLElement | null>(null)

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
      <div class="farm-brand-logo">
        <img src="/icon.png" alt="" aria-hidden="true">
      </div>
      <div class="min-w-0 flex-1">
        <div class="farm-brand-title">
          {{ brand.title }}
        </div>
        <div class="farm-brand-caption">
          {{ brand.subtitle }}
        </div>
      </div>
      <button
        type="button"
        class="farm-brand-close lg:hidden"
        aria-label="关闭导航"
        @click="appStore.closeSidebar"
      >
        <span class="i-carbon-close" aria-hidden="true" />
      </button>
    </div>

    <div class="farm-brand-divider" aria-hidden="true" />

    <!-- 场景开关：农场 / 牧场各有一套侧栏与页面，这里切的是整个应用的浏览场景。 -->
    <div class="farm-scene-switch" role="group" aria-label="农牧场切换">
      <button
        v-for="option in SCENE_OPTIONS"
        :key="option.key"
        type="button"
        class="farm-scene-option"
        :class="{ 'is-active': scene === option.key }"
        :aria-pressed="scene === option.key"
        @click="switchScene(option.key)"
      >
        <span :class="option.icon" aria-hidden="true" />
        <span>{{ option.label }}</span>
      </button>
    </div>

    <nav class="farm-navigation" aria-label="主导航">
      <RouterLink
        v-for="item in navItems"
        :key="item.key"
        :to="item.to"
        class="farm-nav-item"
        :class="{ 'is-active': item.active }"
        :aria-current="item.active ? 'page' : undefined"
        @click="appStore.closeSidebar"
      >
        <span :class="item.icon" class="farm-nav-icon" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div class="farm-sidebar-footer">
      <div class="flex items-center justify-between gap-2 text-xs">
        <span class="flex items-center gap-2">
          <span class="h-2 w-2 rounded-full" :class="[connectionStatus.color, { 'animate-pulse': connectionStatus.pulse }]" />
          {{ connectionStatus.text }}
        </span>
        <span class="text-xs text-[var(--muted-text)] tabular-nums">{{ uptime }}</span>
      </div>
      <div class="mt-3 flex items-center justify-between gap-1">
        <span class="text-[11px] text-[var(--muted-text)] tabular-nums">{{ formattedTime }}</span>
        <ThemeSwitcher />
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
  padding: 18px 14px 14px;
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
  padding: 2px 4px 10px;
}
.farm-brand-logo {
  width: 42px;
  height: 42px;
  flex: none;
  overflow: hidden;
  border-radius: 999px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
  border: 1px solid var(--surface-border);
}
.farm-brand-logo img {
  width: 100%;
  height: 100%;
  transform: scale(1.25);
  object-fit: cover;
}
.farm-brand-title {
  color: var(--theme-text);
  font-size: 15px;
  font-weight: 750;
  letter-spacing: 0;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.farm-brand-caption {
  margin-top: 2px;
  color: var(--muted-text);
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0;
}
.farm-brand-close {
  display: inline-grid;
  width: 40px;
  height: 40px;
  flex: none;
  place-items: center;
  border-radius: 10px;
  color: var(--muted-text);
  font-size: 20px;
}
.farm-brand-close:hover {
  background: var(--surface-2);
}
.farm-brand-divider {
  height: 1px;
  flex: none;
  margin: 0 4px 8px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--theme-primary) 45%, transparent), transparent);
}
.farm-scene-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  margin: 0 4px 10px;
  padding: 4px;
  border-radius: 12px;
  background: var(--surface-2);
}
.farm-scene-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  border-radius: 9px;
  color: var(--muted-text);
  font-size: 13px;
  font-weight: 650;
  transition:
    background 150ms,
    color 150ms;
}
.farm-scene-option:hover {
  color: var(--theme-text);
}
.farm-scene-option.is-active {
  background: var(--theme-gradient);
  color: #fff;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--theme-primary) 24%, transparent);
}
.farm-navigation {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 2px 2px 4px;
}
.farm-nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  margin-bottom: 2px;
  padding: 6px 8px;
  border-radius: 12px;
  color: var(--theme-text);
  font-size: 14px;
  font-weight: 500;
  opacity: 1;
  transition:
    background 150ms ease,
    color 150ms ease;
}
.farm-nav-item:hover {
  background: var(--surface-2);
}
.farm-nav-icon {
  display: inline-grid;
  width: 36px;
  height: 36px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  color: color-mix(in srgb, var(--theme-text) 58%, transparent);
  font-size: 22px;
  transition:
    background 150ms ease,
    color 150ms ease;
}
.farm-nav-item:hover .farm-nav-icon {
  background: color-mix(in srgb, var(--theme-text) 7%, transparent);
  color: var(--theme-text);
}
.farm-nav-item.is-active {
  background: color-mix(in srgb, var(--theme-primary) 9%, transparent);
  color: var(--theme-primary);
  font-weight: 650;
  opacity: 1;
}
.farm-nav-item.is-active .farm-nav-icon {
  background: var(--theme-gradient);
  color: #fff;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--theme-primary) 28%, transparent);
}
.farm-nav-item.is-active::before {
  content: '';
  position: absolute;
  top: 50%;
  left: -4px;
  width: 3px;
  height: 56%;
  transform: translateY(-50%);
  border-radius: 0 4px 4px 0;
  background: var(--theme-gradient);
}
.farm-sidebar-footer {
  position: relative;
  flex: none;
  margin-top: 10px;
  padding: 12px 8px 0;
  border-top: 1px solid var(--surface-border);
}
@media (min-width: 1024px) {
  .farm-sidebar {
    position: relative;
    z-index: 35;
    flex-shrink: 0;
    width: 236px;
    height: 100%;
    transform: none;
  }
}
</style>
