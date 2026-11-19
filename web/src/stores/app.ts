import { usePreferredDark, useStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ThemePalette = 'green' | 'blue' | 'pink' | 'orange' | 'purple' | 'teal'

/** 配色方案：与 style.css 里的 html[data-palette] 规则一一对应。 */
export const THEME_PALETTES: Array<{ key: ThemePalette, name: string, gradient: string, primary: string, icon: string }> = [
  { key: 'green', name: '清新绿', gradient: 'linear-gradient(135deg, #40975c, #238452)', primary: '#238452', icon: 'i-carbon-sprout' },
  { key: 'blue', name: '晴空蓝', gradient: 'linear-gradient(135deg, #60a5fa, #2563eb)', primary: '#2563eb', icon: 'i-carbon-sun' },
  { key: 'pink', name: '樱花粉', gradient: 'linear-gradient(135deg, #f472b6, #db2777)', primary: '#db2777', icon: 'i-carbon-favorite' },
  { key: 'orange', name: '落日橙', gradient: 'linear-gradient(135deg, #fb923c, #ea580c)', primary: '#ea580c', icon: 'i-carbon-sunset' },
  { key: 'purple', name: '暮光紫', gradient: 'linear-gradient(135deg, #a78bfa, #7c3aed)', primary: '#7c3aed', icon: 'i-carbon-moon' },
  { key: 'teal', name: '海盐青', gradient: 'linear-gradient(135deg, #2dd4bf, #0f766e)', primary: '#0f766e', icon: 'i-carbon-water' },
]

export const useAppStore = defineStore('app', () => {
  const sidebarOpen = ref(false)
  // 活动详情有自己的标题栏，打开时布局隐藏通用页头并让活动外壳撑满内容区。
  const activityDetailOpen = ref(false)
  const sidebarCollapsed = useStorage('sidebar_collapsed', false)
  // 默认跟随系统；index.html 中的内联脚本在首屏渲染前读取同一个键，避免闪烁。
  const themeMode = useStorage<ThemeMode>('theme_mode', 'system')
  // 主色配色（桌面副本的「主题设置」），与明暗模式互相独立。
  const themePalette = useStorage<ThemePalette>('theme_palette', 'green')
  const preferredDark = usePreferredDark()
  const isDark = computed(() => themeMode.value === 'dark' || (themeMode.value === 'system' && preferredDark.value))

  watch(isDark, (dark) => {
    const root = document.documentElement
    root.classList.toggle('dark', dark)
    root.style.colorScheme = dark ? 'dark' : 'light'
  }, { immediate: true })

  watch(themePalette, (palette) => {
    document.documentElement.dataset.palette = palette
  }, { immediate: true })

  function setThemeMode(mode: ThemeMode) {
    themeMode.value = mode
  }

  function applyThemePalette(palette: ThemePalette) {
    themePalette.value = palette
  }

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
  }

  function closeSidebar() {
    sidebarOpen.value = false
  }

  function openSidebar() {
    sidebarOpen.value = true
  }

  function toggleSidebarCollapsed() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  return {
    themeMode,
    themePalette,
    isDark,
    setThemeMode,
    applyThemePalette,
    sidebarOpen,
    sidebarCollapsed,
    activityDetailOpen,
    toggleSidebar,
    closeSidebar,
    openSidebar,
    toggleSidebarCollapsed,
  }
})
