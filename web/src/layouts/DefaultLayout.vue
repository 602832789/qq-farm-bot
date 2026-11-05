<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Sidebar from '@/components/Sidebar.vue'
import ThemeSwitcher from '@/components/ThemeSwitcher.vue'
import TopAccountMenu from '@/components/TopAccountMenu.vue'
import { useAccountSwitchScrollPreserve } from '@/composables/useAccountSwitchScroll'
import { isMenuActive, matchMenu, menuGroups, menuPath, visibleMenuRoutes } from '@/router/menu'
import { useAppStore } from '@/stores/app'
import { useToastStore } from '@/stores/toast'
import { useUserStore } from '@/stores/user'

const appStore = useAppStore()
const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
// 布局级常驻：切换账号后保持当前页面与滚动位置，所有页面统一生效
useAccountSwitchScrollPreserve()
const { sidebarOpen, activityDetailOpen } = storeToRefs(appStore)
const desktop = useMediaQuery('(min-width: 1024px)')
const loggingOut = ref(false)
let drawerTrigger: HTMLElement | null = null

const currentMenu = computed(() => matchMenu(route.path))
const currentGroup = computed(() => menuGroups.find(group => group.key === currentMenu.value?.group)?.label || '我的庄园')
const mobileItems = computed(() => visibleMenuRoutes().filter(item => item.mobileLabel))
const moreActive = computed(() => !mobileItems.value.some(item => isMenuActive(item, route.path)))
// 活动详情自带标题栏并要求撑满内容区，这时把滚动交给活动自己的外壳。
const activityDetail = computed(() => route.name === 'activity-center' && activityDetailOpen.value)

watch(sidebarOpen, async (open) => {
  if (open && !desktop.value) {
    drawerTrigger = document.activeElement as HTMLElement | null
  }
  else if (!open && !desktop.value) {
    await nextTick()
    drawerTrigger?.focus()
  }
})

async function logout() {
  if (loggingOut.value)
    return
  loggingOut.value = true
  try {
    await userStore.logout()
    await router.push('/login')
  }
  catch {
    useToastStore().error('退出失败，请重试')
  }
  finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <div class="farm-shell">
    <a href="#farm-page-content" class="farm-skip-link">跳到页面内容</a>
    <button v-if="sidebarOpen && !desktop" type="button" class="farm-drawer-overlay" tabindex="-1" aria-label="关闭导航" @click="appStore.closeSidebar" />
    <Sidebar />
    <div class="farm-workspace" :inert="sidebarOpen && !desktop">
      <header class="farm-topbar">
        <div class="min-w-0 flex items-center gap-2">
          <button type="button" aria-label="打开导航" :aria-expanded="sidebarOpen" aria-controls="farm-sidebar" class="farm-icon-button lg:hidden" @click="appStore.openSidebar">
            <span class="i-carbon-menu" aria-hidden="true" />
          </button>
          <div class="farm-breadcrumb">
            <span class="hidden sm:inline">{{ currentGroup }}</span><span class="hidden opacity-40 sm:inline" aria-hidden="true">/</span>
            <strong>{{ currentMenu?.navLabel || currentMenu?.label || '农场' }}</strong>
          </div>
        </div>
        <div class="farm-topbar-actions">
          <ThemeSwitcher />
          <TopAccountMenu />
          <button class="farm-icon-button" type="button" title="退出验证" aria-label="退出验证" :disabled="loggingOut" @click="logout">
            <span :class="loggingOut ? 'i-svg-spinners-ring-resize' : 'i-carbon-logout'" aria-hidden="true" />
          </button>
        </div>
      </header>
      <main id="farm-page-content" class="farm-page-content" :class="{ 'is-activity-detail': activityDetail }" tabindex="-1">
        <RouterView v-slot="{ Component, route: pageRoute }">
          <component :is="Component" :key="pageRoute.path" class="farm-page" />
        </RouterView>
      </main>
      <nav class="farm-mobile-nav" aria-label="快捷导航">
        <RouterLink v-for="item in mobileItems" :key="item.name" :to="menuPath(item)" :class="{ 'is-active': isMenuActive(item, route.path) }" :aria-current="isMenuActive(item, route.path) ? 'page' : undefined">
          <span :class="item.icon" aria-hidden="true" /><span>{{ item.mobileLabel }}</span>
        </RouterLink>
        <button type="button" :class="{ 'is-active': moreActive }" :aria-expanded="sidebarOpen" aria-controls="farm-sidebar" @click="appStore.openSidebar">
          <span class="i-carbon-overflow-menu-horizontal" aria-hidden="true" /><span>更多</span>
        </button>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.farm-shell {
  display: flex;
  width: 100%;
  height: 100dvh;
  overflow: hidden;
}
.farm-workspace {
  display: flex;
  flex: 1;
  min-width: 0;
  height: 100%;
  flex-direction: column;
}
.farm-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 76px;
  padding: 12px 30px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--surface-border);
  background: var(--farm-header);
  position: relative;
  z-index: 30;
}
.farm-breadcrumb {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  font-size: 12px;
  color: var(--muted-text);
}
.farm-breadcrumb strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--theme-text);
  font-size: 14px;
  font-weight: 650;
}
.farm-topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.farm-icon-button {
  display: inline-grid;
  width: 38px;
  height: 38px;
  flex: none;
  place-items: center;
  border: 1px solid var(--surface-border);
  border-radius: 10px;
  color: var(--muted-text);
  background: var(--surface-1);
  font-size: 19px;
  transition:
    color 150ms,
    border-color 150ms;
}
.farm-icon-button:hover {
  border-color: var(--surface-border-strong);
  color: var(--theme-primary);
}
.farm-icon-button:disabled {
  opacity: 0.55;
}
.farm-page-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px 30px 30px;
  scroll-padding-top: 16px;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.farm-page-content:focus {
  outline: none;
}
.farm-page-content.is-activity-detail {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 16px;
}
.farm-page-content.is-activity-detail > :deep(*) {
  flex: 1;
  min-height: 0;
}
.farm-mobile-nav {
  display: none;
}
.farm-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgb(14 29 20 / 48%);
}
.farm-skip-link {
  position: fixed;
  top: -100px;
  left: 16px;
  z-index: 80;
  padding: 12px 18px;
  border-radius: 10px;
  background: var(--surface-1);
  color: var(--theme-primary);
}
.farm-skip-link:focus {
  top: 10px;
}
@media (min-width: 1800px) {
  .farm-page-content {
    padding-inline: max(30px, calc((100vw - 1850px) / 2));
  }
}
@media (max-width: 1023px) {
  .farm-topbar {
    min-height: 66px;
    padding: 8px 16px;
    gap: 4px;
  }
  .farm-page-content {
    padding: 18px 18px 24px;
  }
  .farm-mobile-nav {
    display: flex;
    flex-shrink: 0;
    justify-content: space-around;
    gap: 4px;
    padding: 7px 8px calc(7px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--surface-border);
    background: var(--farm-sidebar);
  }
  .farm-mobile-nav a,
  .farm-mobile-nav button {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 0;
    min-height: 48px;
    padding: 4px;
    border-radius: 8px;
    font-size: 12px;
    color: var(--muted-text);
  }
  .farm-mobile-nav a > span:first-child,
  .farm-mobile-nav button > span:first-child {
    font-size: 21px;
  }
  .farm-mobile-nav .is-active {
    color: var(--theme-primary);
    background: color-mix(in srgb, var(--theme-primary) 9%, var(--surface-1));
    font-weight: 650;
  }
}
@media (max-width: 639px) {
  .farm-topbar {
    padding-inline: 10px;
  }
  .farm-topbar-actions {
    gap: 2px;
  }
  .farm-topbar-actions .farm-icon-button {
    width: 34px;
    height: 34px;
    font-size: 17px;
  }
  .farm-breadcrumb strong {
    max-width: 84px;
    font-size: 13px;
  }
  .farm-page-content {
    padding: 14px 12px 20px;
  }
}
</style>
