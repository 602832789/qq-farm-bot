<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, onMounted, ref, useId, useTemplateRef, watch } from 'vue'
import { useAccountStore } from '@/stores/account'
import { usePanelNotificationStore } from '@/stores/panel-notifications'

const accountStore = useAccountStore()
const store = usePanelNotificationStore()
const { items, unreadCount } = storeToRefs(store)

const open = ref(false)
const dropdownId = useId()
const triggerRef = useTemplateRef<HTMLElement>('trigger')
const pos = ref({ top: 0, left: 0, width: 320, maxHeight: 380 })
let timer: ReturnType<typeof setInterval> | undefined

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(Number(timestamp) || 0))
}

function updatePos() {
  const rect = triggerRef.value?.getBoundingClientRect()
  if (!rect)
    return
  const gap = 8
  const width = Math.min(320, window.innerWidth - gap * 2)
  const left = Math.min(Math.max(gap, rect.right - width), window.innerWidth - width - gap)
  const top = Math.min(rect.bottom + gap, Math.max(gap, window.innerHeight - 160))
  pos.value = { top, left, width, maxHeight: Math.max(0, window.innerHeight - top - gap) }
}

function toggle() {
  open.value = !open.value
  if (open.value) {
    updatePos()
    void store.fetch()
    store.markAllRead()
  }
}

function close() {
  open.value = false
}

onMounted(() => {
  void store.fetch()
  timer = setInterval(() => {
    void store.fetch()
  }, 30000)
  window.addEventListener('resize', updatePos)
})

onBeforeUnmount(() => {
  if (timer)
    clearInterval(timer)
  window.removeEventListener('resize', updatePos)
})

watch(() => accountStore.currentAccountId, () => {
  void store.fetch()
})
</script>

<template>
  <div class="relative">
    <button
      ref="trigger"
      type="button"
      class="farm-icon-button relative"
      :aria-expanded="open"
      :aria-controls="dropdownId"
      aria-label="消息通知"
      title="消息通知"
      @keydown.escape="close"
      @click="toggle"
    >
      <span class="i-carbon-notification" aria-hidden="true" />
      <span v-if="unreadCount > 0" class="panel-bell-badge" aria-hidden="true">
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </button>

    <Teleport to="body">
      <div v-if="open" class="fixed inset-0 z-[9998] bg-transparent" @click="close" />
      <div
        v-if="open"
        :id="dropdownId"
        role="region"
        aria-label="面板消息"
        class="fixed z-[9999] overflow-hidden border border-gray-200/70 rounded-xl bg-white/95 shadow-xl backdrop-blur-sm dark:border-gray-700/70 dark:bg-gray-900/95"
        :style="{ top: `${pos.top}px`, left: `${pos.left}px`, width: `${pos.width}px`, maxHeight: `${pos.maxHeight}px` }"
        @keydown.escape.stop.prevent="close"
      >
        <div class="flex items-center justify-between border-b border-gray-100 px-3 py-2 dark:border-gray-700">
          <span class="text-sm text-gray-800 font-medium dark:text-gray-100">消息</span>
          <span class="text-xs text-gray-400">共 {{ items.length }} 条</span>
        </div>
        <div class="panel-bell-scroll max-h-80 overflow-y-auto">
          <div
            v-for="item in items"
            :key="item.id"
            class="border-b border-gray-100 px-3 py-2.5 last:border-b-0 dark:border-gray-700/60"
          >
            <div class="flex items-center gap-2">
              <span class="i-carbon-store shrink-0 text-sm text-violet-500" aria-hidden="true" />
              <span class="truncate text-sm text-gray-800 font-medium dark:text-gray-100">{{ item.title }}</span>
              <span class="ml-auto shrink-0 text-xs text-gray-400">{{ formatTime(item.createdAt) }}</span>
            </div>
            <p class="mt-1 whitespace-pre-line text-xs text-gray-500 dark:text-gray-400">
              {{ item.content }}
            </p>
          </div>
          <div v-if="items.length === 0" class="px-3 py-6 text-center text-xs text-gray-400 leading-relaxed">
            暂无消息<br>
            神秘商人到货与自动购买消息会显示在这里
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.panel-bell-badge {
  position: absolute;
  top: 1px;
  right: 1px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 9999px;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}
.panel-bell-scroll::-webkit-scrollbar {
  width: 4px;
}
.panel-bell-scroll::-webkit-scrollbar-thumb {
  border-radius: 2px;
  background-color: rgba(156, 163, 175, 0.4);
}
</style>
