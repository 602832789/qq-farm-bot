<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps<{
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline' | 'text'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  block?: boolean
  to?: string
  href?: string
  type?: 'button' | 'submit' | 'reset'
}>()

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const componentTag = computed(() => {
  if (props.to)
    return RouterLink
  if (props.href)
    return 'a'
  return 'button'
})

const baseClasses = 'inline-flex items-center justify-center rounded-2xl font-bold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 border-3 border-black/10 active:translate-y-0.5'

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'text-white shadow-[0_4px_0_rgba(0,0,0,0.2)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_rgba(0,0,0,0.2)] active:shadow-[0_1px_0_rgba(0,0,0,0.2)] focus:ring-green-500'
    case 'secondary':
      return 'bg-gray-100 text-gray-700 hover:bg-gray-200 shadow-[0_3px_0_rgba(0,0,0,0.1)] hover:-translate-y-0.5 active:shadow-[0_1px_0_rgba(0,0,0,0.1)] focus:ring-gray-500 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
    case 'success':
      return 'bg-[#4a8c3f] text-white hover:bg-[#5a9c4f] shadow-[0_4px_0_#3a6b2e] hover:-translate-y-0.5 active:shadow-[0_1px_0_#3a6b2e] focus:ring-green-500 dark:bg-[#4a8c3f] dark:hover:bg-[#5a9c4f]'
    case 'danger':
      return 'bg-red-500 text-white hover:bg-red-600 shadow-[0_4px_0_#b91c1c] hover:-translate-y-0.5 active:shadow-[0_1px_0_#b91c1c] focus:ring-red-500 dark:bg-red-500 dark:hover:bg-red-600'
    case 'ghost':
      return 'text-gray-600 hover:bg-gray-100 border-transparent shadow-none dark:text-gray-400 dark:hover:bg-gray-800'
    case 'outline':
      return 'border-2 border-[#4a8c3f] bg-transparent text-[#4a8c3f] hover:bg-[#4a8c3f]/10 shadow-none focus:ring-green-500 dark:border-[#6dbf5b] dark:text-[#6dbf5b] dark:hover:bg-[#6dbf5b]/10'
    case 'text':
      return 'hover:underline p-0 bg-transparent shadow-none hover:bg-transparent border-transparent'
    default:
      return 'text-white shadow-[0_4px_0_rgba(0,0,0,0.2)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_rgba(0,0,0,0.2)] active:shadow-[0_1px_0_rgba(0,0,0,0.2)] focus:ring-green-500'
  }
})

const sizeClasses = computed(() => {
  if (props.variant === 'text')
    return ''

  switch (props.size) {
    case 'sm':
      return 'px-3 py-1.5 text-sm'
    case 'lg':
      return 'px-6 py-3 text-lg'
    default:
      return 'px-4 py-2 text-sm'
  }
})

const widthClasses = computed(() => props.block ? 'w-full' : '')

const buttonStyle = computed(() => {
  if (props.variant === 'primary' || (!props.variant && props.variant !== 'secondary' && props.variant !== 'danger' && props.variant !== 'success' && props.variant !== 'ghost' && props.variant !== 'outline' && props.variant !== 'text')) {
    return { backgroundColor: 'var(--theme-primary)' }
  }
  if (props.variant === 'text') {
    return { color: 'var(--theme-primary)' }
  }
  return {}
})
</script>

<template>
  <component
    :is="componentTag"
    :to="to"
    :href="href"
    :type="!to && !href ? (type || 'button') : undefined"
    :disabled="disabled || loading"
    :class="[baseClasses, variantClasses, sizeClasses, widthClasses]"
    :style="buttonStyle"
    v-bind="$attrs"
    @click="!disabled && !loading && emit('click', $event)"
  >
    <span v-if="loading" class="mr-2 animate-spin">⏳</span>
    <slot />
  </component>
</template>
