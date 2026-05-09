import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import api from '@/api'

const THEME_KEY = 'ui_theme'

export type Theme = 'light-blue' | 'light-green' | 'light-pink' | 'dark-blue' | 'dark-purple' | 'dark-teal' | 'dark-orange' | 'dark-red' | 'farm-light' | 'farm-dark'

export const useAppStore = defineStore('app', () => {
  const sidebarOpen = ref(false)
  const currentTheme = ref<Theme>((localStorage.getItem(THEME_KEY) as Theme) || 'farm-light')
  const showThemePanel = ref(false)

  const themes: Record<Theme, {
    name: string
    isDark: boolean
    bg: string
    text: string
    primary: string
    secondary: string
    gradient: string
    icon: string
  }> = {
    // 原始白色主题
    'light-blue': {
      name: '白色',
      isDark: false,
      bg: '#f9fafb',
      text: '#1f2937',
      primary: '#3b82f6',
      secondary: '#2563eb',
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
      icon: 'i-carbon-sun',
    },
    // 原始黑色主题
    'dark-blue': {
      name: '深色',
      isDark: true,
      bg: '#111827',
      text: '#f3f4f6',
      primary: '#3b82f6',
      secondary: '#2563eb',
      gradient: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
      icon: 'i-carbon-moon',
    },
    // 樱花粉主题
    'light-pink': {
      name: '樱花粉',
      isDark: false,
      bg: '#fff0f5',
      text: '#831843',
      primary: '#ec4899',
      secondary: '#be185d',
      gradient: 'linear-gradient(135deg, #f472b6 0%, #ec4899 100%)',
      icon: 'i-carbon-favorite',
    },
    // 清新绿主题
    'light-green': {
      name: '清新绿',
      isDark: false,
      bg: '#f0fdf4',
      text: '#14532d',
      primary: '#22c55e',
      secondary: '#16a34a',
      gradient: 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)',
      icon: 'i-carbon-leaf',
    },
    // 紫罗兰主题
    'dark-purple': {
      name: '紫罗兰',
      isDark: true,
      bg: '#1e1b4b',
      text: '#e9d5ff',
      primary: '#a855f7',
      secondary: '#9333ea',
      gradient: 'linear-gradient(135deg, #c084fc 0%, #a855f7 100%)',
      icon: 'i-carbon-crown',
    },
    // 橙色暖阳主题
    'dark-orange': {
      name: '暖阳橙',
      isDark: true,
      bg: '#292524',
      text: '#fef3c7',
      primary: '#f59e0b',
      secondary: '#d97706',
      gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
      icon: 'i-carbon-sun',
    },
    // 青色主题
    'dark-teal': {
      name: '青空夜',
      isDark: true,
      bg: '#134e4a',
      text: '#ccfbf1',
      primary: '#06b6d4',
      secondary: '#0891b2',
      gradient: 'linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%)',
      icon: 'i-carbon-tree',
    },
    // 绯红主题
    'dark-red': {
      name: '绯红夜',
      isDark: true,
      bg: '#18181b',
      text: '#fda4af',
      primary: '#f43f5e',
      secondary: '#e11d48',
      gradient: 'linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)',
      icon: 'i-carbon-close-filled',
    },
    // 田园暖光主题
    'farm-light': {
      name: '田园暖光',
      isDark: false,
      bg: '#fef9ef',
      text: '#3d2b1f',
      primary: '#4a8c3f',
      secondary: '#8b6914',
      gradient: 'linear-gradient(135deg, #6dbf5b 0%, #4a8c3f 100%)',
      icon: 'i-carbon-leaf',
    },
    // 星空农场主题
    'farm-dark': {
      name: '星空农场',
      isDark: true,
      bg: '#1a2e1a',
      text: '#d4e8d4',
      primary: '#6dbf5b',
      secondary: '#f0c040',
      gradient: 'linear-gradient(135deg, #86efac 0%, #4a8c3f 100%)',
      icon: 'i-carbon-tree',
    },
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

  async function fetchTheme() {
    // 从服务器获取主题设置（可选）
    try {
      const res = await api.get('/api/settings')
      if (res.data.ok && res.data.data.ui?.theme) {
        // 如果服务器有主题设置，可以选择使用
        // 但优先使用本地存储的主题
      }
    }
    catch {
      // 未登录时静默失败，使用本地缓存值
    }
  }

  function applyTheme(theme: Theme) {
    // Validate theme
    if (!themes[theme]) {
      theme = 'light-pink'
    }

    const t = themes[theme]
    currentTheme.value = theme
    localStorage.setItem(THEME_KEY, theme)

    // Apply theme colors to CSS variables
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.style.setProperty('--theme-bg', t.bg)
      document.documentElement.style.setProperty('--theme-text', t.text)
      document.documentElement.style.setProperty('--theme-primary', t.primary)
      document.documentElement.style.setProperty('--theme-secondary', t.secondary)
      document.documentElement.style.setProperty('--theme-gradient', t.gradient)

      // Farm cartoon style variables — QQ经典农场风格
      document.documentElement.style.setProperty('--theme-radius-sm', '10px')
      document.documentElement.style.setProperty('--theme-radius-md', '14px')
      document.documentElement.style.setProperty('--theme-radius-lg', '18px')
      document.documentElement.style.setProperty('--theme-radius-xl', '28px')
      document.documentElement.style.setProperty('--theme-border', '3px solid')
      document.documentElement.style.setProperty('--theme-shadow-sm', '0 3px 0 rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)')
      document.documentElement.style.setProperty('--theme-shadow-md', '0 4px 0 rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.12)')
      document.documentElement.style.setProperty('--theme-shadow-lg', '0 6px 0 rgba(0,0,0,0.2), 0 8px 32px rgba(0,0,0,0.16)')
      document.documentElement.style.setProperty('--theme-shadow-3d', '0 4px 0 #3a6b2e, 0 6px 12px rgba(0,0,0,0.2)')
      document.documentElement.style.setProperty('--theme-soil', '#8b6914')
      document.documentElement.style.setProperty('--theme-soil-dark', '#6b4f0e')
      document.documentElement.style.setProperty('--theme-grass', '#4a8c3f')
      document.documentElement.style.setProperty('--theme-grass-light', '#6dbf5b')
      document.documentElement.style.setProperty('--theme-sky', '#87ceeb')
      document.documentElement.style.setProperty('--theme-sky-light', '#b8e4f7')
      document.documentElement.style.setProperty('--theme-wood', '#a16207')
      document.documentElement.style.setProperty('--theme-wood-dark', '#7a4a05')
      document.documentElement.style.setProperty('--theme-leaf', '#4a8c3f')
      document.documentElement.style.setProperty('--theme-flower', '#f472b6')
      document.documentElement.style.setProperty('--theme-water', '#5bb8f5')
      document.documentElement.style.setProperty('--theme-sun', '#f0c040')
      document.documentElement.style.setProperty('--theme-gold', '#f0c040')
      document.documentElement.style.setProperty('--theme-wheat', '#deb887')

      // Toggle dark class
      if (t.isDark) {
        document.documentElement.classList.add('dark')
      }
      else {
        document.documentElement.classList.remove('dark')
      }
    }
  }

  function toggleThemePanel() {
    showThemePanel.value = !showThemePanel.value
  }

  // Legacy toggleDark for backward compatibility
  function toggleDark() {
    const current = currentTheme.value
    if (themes[current]?.isDark) {
      applyTheme('light-green')
    }
    else {
      applyTheme('light-pink')
    }
  }

  // Computed isDark based on currentTheme
  const isDark = computed(() => themes[currentTheme.value]?.isDark ?? false)

  // Watch theme changes and apply
  watch(currentTheme, (val) => {
    applyTheme(val)
  })

  // Initialize theme immediately (not in onMounted)
  applyTheme(currentTheme.value)

  return {
    sidebarOpen,
    isDark,
    currentTheme,
    showThemePanel,
    themes,
    applyTheme,
    toggleThemePanel,
    toggleDark,
    toggleSidebar,
    closeSidebar,
    openSidebar,
    fetchTheme,
  }
})
