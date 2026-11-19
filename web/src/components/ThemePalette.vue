<script setup lang="ts">
import type { ThemePalette as PaletteKey } from '@/stores/app'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { THEME_PALETTES, useAppStore } from '@/stores/app'

/**
 * 主题配色入口（移植自桌面副本首页左下角的调色盘）。
 * 面板向上弹出并贴着侧栏底部，点选即生效，选择结果写入 localStorage。
 */
const appStore = useAppStore()
const { themePalette } = storeToRefs(appStore)
const open = ref(false)

function select(key: PaletteKey) {
  appStore.applyThemePalette(key)
  open.value = false
}
</script>

<template>
  <div class="palette-root">
    <button
      type="button"
      class="palette-trigger"
      title="主题设置"
      aria-label="主题设置"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="i-carbon-color-palette text-base" aria-hidden="true" />
    </button>

    <div v-if="open" class="palette-mask" @click="open = false" />
    <div v-if="open" class="palette-panel" role="dialog" aria-label="选择主题配色">
      <div class="palette-title">
        主题设置
      </div>
      <div class="palette-grid">
        <button
          v-for="theme in THEME_PALETTES"
          :key="theme.key"
          type="button"
          class="palette-item"
          :class="{ 'is-active': themePalette === theme.key }"
          :style="{ background: theme.gradient, '--swatch': theme.primary }"
          :title="theme.name"
          @click="select(theme.key)"
        >
          <span :class="theme.icon" class="text-sm text-white" aria-hidden="true" />
          <span class="palette-name">{{ theme.name }}</span>
          <span v-if="themePalette === theme.key" class="palette-check">
            <span class="i-carbon-checkmark" aria-hidden="true" />
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.palette-root {
  position: relative;
}

.palette-trigger {
  display: inline-grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 8px;
  color: var(--theme-primary);
  transition: background 150ms ease;
}

.palette-trigger:hover {
  background: var(--surface-2);
}

.palette-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
}

.palette-panel {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 61;
  width: 240px;
  padding: 10px;
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  background: var(--surface-1);
  box-shadow: var(--surface-shadow);
}

.palette-title {
  margin-bottom: 8px;
  color: var(--muted-text);
  font-size: 11px;
  font-weight: 600;
}

.palette-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.palette-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 54px;
  padding: 6px 4px;
  border-radius: 10px;
  color: #fff;
  transition: transform 150ms ease;
}

.palette-item:hover {
  transform: translateY(-1px);
}

.palette-item.is-active {
  box-shadow: 0 0 0 2px var(--surface-1), 0 0 0 4px var(--swatch);
}

.palette-name {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
}

.palette-check {
  position: absolute;
  top: 3px;
  right: 3px;
  display: grid;
  width: 14px;
  height: 14px;
  place-items: center;
  border-radius: 999px;
  color: var(--swatch);
  background: #fff;
  font-size: 10px;
}
</style>
