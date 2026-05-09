<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useToastStore } from '@/stores/toast'

const toastStore = useToastStore()
const { toasts } = storeToRefs(toastStore)

function getIcon(type: string) {
  switch (type) {
    case 'success': return '✅'
    case 'error': return '❌'
    case 'warning': return '⚠️'
    case 'info': return '💡'
    default: return '💡'
  }
}

function getBgColor(type: string) {
  switch (type) {
    case 'success': return 'bg-[#f0fdf4] dark:bg-green-900/30 border-l-4'
    case 'error': return 'bg-[#fef2f2] dark:bg-red-900/30 border-l-4'
    case 'warning': return 'bg-[#fefce8] dark:bg-yellow-900/30 border-l-4'
    case 'info': return 'bg-[#eff6ff] dark:bg-blue-900/30 border-l-4'
    default: return 'bg-[#fef9ef] dark:bg-gray-800 border-l-4'
  }
}

function getBorderColor(type: string) {
  switch (type) {
    case 'success': return 'border-[#4a8c3f]'
    case 'error': return 'border-red-500'
    case 'warning': return 'border-[#f0c040]'
    case 'info': return 'border-[#5bb8f5]'
    default: return 'border-[#8b6914]'
  }
}
</script>

<template>
  <div class="fixed right-4 top-4 z-[9999] flex flex-col gap-2">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="w-80 flex items-start gap-3 rounded-2xl p-4 transition-all duration-300 border-3"
        :class="[getBgColor(toast.type), getBorderColor(toast.type)]"
        style="box-shadow: 0 3px 0 rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.08)"
      >
        <div :class="getIcon(toast.type)" class="mt-0.5 shrink-0 text-xl" />
        <div class="flex-1 break-words text-sm text-gray-700 dark:text-gray-200">
          {{ toast.message }}
        </div>
        <button
          class="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          @click="toastStore.remove(toast.id)"
        >
          <div class="i-carbon-close text-lg" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toast-leave-active {
  transition: all 0.25s ease-in;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(40px) scale(0.9);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(30px) scale(0.9);
}
</style>
