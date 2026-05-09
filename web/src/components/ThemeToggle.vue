<script setup lang="ts">
import type { Theme } from '@/stores/app'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

function selectTheme(theme: Theme) {
  appStore.applyTheme(theme)
  appStore.toggleThemePanel()
}
</script>

<template>
  <div class="relative">
    <!-- 主题切换按钮 -->
    <button
      class="icon-btn mx-2 !outline-none"
      title="主题设置"
      @click="appStore.toggleThemePanel()"
    >
      <div i-carbon-color-palette />
    </button>

    <!-- 使用 Teleport 将面板渲染到 body，避免被父容器裁剪 -->
    <teleport to="body">
      <!-- 遮罩层 -->
      <div
        v-if="appStore.showThemePanel"
        class="fixed inset-0 z-[99] bg-black/30"
        @click="appStore.toggleThemePanel()"
      />

      <div
        v-if="appStore.showThemePanel"
        class="fixed z-[100] w-80 rounded-2xl bg-white p-5 dark:bg-gray-800"
        style="box-shadow: var(--theme-shadow-lg, 0 8px 32px rgba(0,0,0,0.16))"
        :style="{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }"
      >
        <h3 class="mb-4 text-base font-semibold" style="color: var(--theme-primary, #374151)">
          选择主题
        </h3>
        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="(t, theme) in appStore.themes"
            :key="theme"
            class="relative flex flex-col items-center justify-center gap-2 rounded-xl p-3 transition-all hover:scale-105"
            :class="{
              'ring-2 ring-offset-2': appStore.currentTheme === theme,
              'dark:ring-offset-gray-800': t.isDark,
              'cartoon-bounce': appStore.currentTheme === theme,
            }"
            :style="{
              'background': t.gradient,
              '--tw-ring-color': t.primary,
              '--tw-ring-offset-color': t.isDark ? '#1f2937' : '#ffffff',
            }"
            :title="t.name"
            @click="selectTheme(theme as Theme)"
          >
            <span v-if="theme === 'farm-light'" class="text-xl text-white">🌾</span>
            <span v-else-if="theme === 'farm-dark'" class="text-xl text-white">🌙🌱</span>
            <div v-else :class="t.icon" class="text-xl text-white" />
            <span class="text-sm text-white font-medium">{{ t.name }}</span>
            <div
              v-if="appStore.currentTheme === theme"
              class="i-carbon-checkmark absolute right-1 top-1 text-sm text-white"
            />
          </button>
        </div>

        <div class="mt-3 border-t border-gray-100 pt-3 text-center dark:border-gray-700">
          <button
            class="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            @click="appStore.toggleThemePanel()"
          >
            关闭
          </button>
        </div>
      </div>
    </teleport>
  </div>
</template>
