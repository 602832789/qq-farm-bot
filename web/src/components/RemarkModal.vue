<script setup lang="ts">
import { ref, watch } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'

const props = defineProps<{
  show: boolean
  account?: any
}>()

const emit = defineEmits(['close', 'saved'])

const name = ref('')
const loading = ref(false)
const errorMessage = ref('')

watch(() => props.show, (val) => {
  errorMessage.value = ''
  if (val && props.account) {
    name.value = props.account.name || ''
  }
})

async function save() {
  if (!props.account)
    return
  loading.value = true
  errorMessage.value = ''
  try {
    // 使用 name 字段存储备注，只发送 id 和 name 两个字段
    const payload = {
      id: props.account.id,
      name: name.value,
    }

    const res = await api.post('/api/accounts', payload)
    if (res.data.ok) {
      emit('saved')
      emit('close')
    }
    else {
      errorMessage.value = `保存失败: ${res.data.error}`
    }
  }
  catch (e: any) {
    errorMessage.value = `保存失败: ${e.response?.data?.error || e.message}`
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div class="max-w-sm w-full overflow-hidden rounded-2xl bg-white dark:bg-gray-800" style="box-shadow: var(--theme-shadow-lg, 0 8px 32px rgba(0,0,0,0.16))">
      <div class="flex items-center justify-between p-4" style="border-bottom: 1px solid color-mix(in srgb, var(--theme-text, #374151) 10%, transparent)">
        <h3 class="text-lg font-semibold" style="color: var(--theme-primary, #1f2937)">
          修改备注
        </h3>
        <BaseButton variant="ghost" class="!p-1" @click="$emit('close')">
          <div class="i-carbon-close text-xl" />
        </BaseButton>
      </div>

      <div class="p-4 space-y-4">
        <div v-if="errorMessage" class="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {{ errorMessage }}
        </div>
        <BaseInput
          v-model="name"
          label="备注名称"
          placeholder="请输入备注名称"
          class="farm-input"
          @keyup.enter="save"
        />

        <div class="flex justify-end gap-2">
          <BaseButton
            variant="outline"
            class="cartoon-btn"
            @click="$emit('close')"
          >
            取消
          </BaseButton>
          <BaseButton
            variant="primary"
            class="cartoon-btn"
            :loading="loading"
            @click="save"
          >
            保存
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>
