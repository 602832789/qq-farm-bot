<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import api, { getApiErrorMessage } from '@/api'
import AccountSettingsCard from '@/components/settings/AccountSettingsCard.vue'
import AccountSettingsDialog from '@/components/settings/AccountSettingsDialog.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'

interface AutoCodeRefreshConfig {
  enabled: boolean
  intervalMinutes: number
  offlineEnabled: boolean
  offlineDelaySeconds: number
}

const emit = defineEmits<{ notify: [message: string, type?: 'primary' | 'danger'] }>()

const DEFAULT_CONFIG: AutoCodeRefreshConfig = { enabled: false, intervalMinutes: 60, offlineEnabled: false, offlineDelaySeconds: 60 }

const config = ref<AutoCodeRefreshConfig>({ ...DEFAULT_CONFIG })
const draft = ref<AutoCodeRefreshConfig>({ ...DEFAULT_CONFIG })
// 服务启动后自动登录已保存的账号（系统级开关，默认开启）。
const autoStart = ref(true)
const loading = ref(true)
const saving = ref(false)
const open = ref(false)

const busy = computed(() => saving.value)
const disabled = computed(() => loading.value || busy.value)
const enabled = computed(() => config.value.enabled || config.value.offlineEnabled)
const status = computed(() => loading.value ? '加载中' : enabled.value ? '已开启' : '已关闭')
const tags = computed(() => [
  config.value.enabled ? `定时重登 ${config.value.intervalMinutes} 分钟` : '定时重登关闭',
  config.value.offlineEnabled ? `掉线后 ${config.value.offlineDelaySeconds} 秒重登` : '掉线重登关闭',
])

function normalize(input: any): AutoCodeRefreshConfig {
  const src = (input && typeof input === 'object') ? input : {}
  const interval = Number(src.intervalMinutes)
  const delay = Number(src.offlineDelaySeconds)
  return {
    enabled: src.enabled === true,
    intervalMinutes: Number.isFinite(interval) ? Math.max(1, Math.min(1440, Math.round(interval))) : DEFAULT_CONFIG.intervalMinutes,
    offlineEnabled: src.offlineEnabled === true,
    offlineDelaySeconds: Number.isFinite(delay) ? Math.max(1, Math.min(86400, Math.round(delay))) : DEFAULT_CONFIG.offlineDelaySeconds,
  }
}

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/api/settings/system-config')
    if (data?.ok) {
      const saved = data.data?.saved || data.data?.default
      config.value = normalize(saved?.autoCodeRefresh)
      autoStart.value = saved?.autoStartAccounts !== false
    }
  }
  catch (e) {
    console.error('加载账号保活配置失败:', e)
  }
  finally {
    loading.value = false
  }
}

async function save(next: AutoCodeRefreshConfig) {
  if (disabled.value)
    return false
  saving.value = true
  try {
    const payload = normalize(next)
    const { data } = await api.post('/api/settings/system-config', { autoCodeRefresh: payload })
    if (!data?.ok) {
      emit('notify', getApiErrorMessage(data, '保存账号保活配置失败'), 'danger')
      return false
    }
    config.value = normalize((data.data?.saved || payload)?.autoCodeRefresh)
    emit('notify', '账号保活配置已保存', 'primary')
    return true
  }
  catch (e: any) {
    emit('notify', `保存失败: ${getApiErrorMessage(e, '未知错误')}`, 'danger')
    return false
  }
  finally {
    saving.value = false
  }
}

async function submit() {
  const saved = await save(draft.value)
  if (saved)
    open.value = false
}

function configure() {
  draft.value = { ...config.value }
  open.value = true
}

function toggle(next: boolean) {
  // 总开关首次开启时默认走定时重登；关闭时两种模式一起关，避免残留掉线重登。
  void save({ ...config.value, enabled: next, offlineEnabled: next ? config.value.offlineEnabled : false })
}

async function saveAutoStart(next: boolean | undefined) {
  if (disabled.value)
    return
  const enabled = !!next
  saving.value = true
  try {
    const { data } = await api.post('/api/settings/system-config', { autoStartAccounts: enabled })
    if (!data?.ok) {
      emit('notify', getApiErrorMessage(data, '保存自动登录设置失败'), 'danger')
      return
    }
    autoStart.value = (data.data?.saved?.autoStartAccounts ?? enabled) !== false
    emit('notify', autoStart.value ? '已开启服务启动自动登录' : '已关闭服务启动自动登录', 'primary')
  }
  catch (e: any) {
    emit('notify', `保存失败: ${getApiErrorMessage(e, '未知错误')}`, 'danger')
  }
  finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h4 class="text-base text-gray-900 font-bold dark:text-gray-100">
          账号保活
        </h4>
        <p class="mt-0.5 text-xs text-gray-500">
          定时重登与掉线自动重登，只对具备微信授权凭据的账号生效
        </p>
      </div>
    </div>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <AccountSettingsCard
        title="账号保活"
        description="所有微信区账号共享 · 定时重登与掉线恢复"
        icon="i-carbon-renew"
        :enabled="enabled"
        :disabled="disabled"
        :status="status"
        :tags="tags"
        @toggle="toggle"
        @configure="configure"
      />
    </div>
    <div class="flex flex-wrap items-center justify-between gap-3 border border-gray-200 rounded-lg bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-900/30">
      <div class="min-w-0">
        <h4 class="text-sm text-gray-900 font-semibold dark:text-gray-100">
          服务启动自动登录
        </h4>
        <p class="mt-0.5 text-xs text-gray-500 leading-relaxed">
          重启服务后自动拉起已保存的账号；微信账号会自动续期 Code，QQ 账号 Code 失效时仍需重新扫码或填写新 Code
        </p>
      </div>
      <BaseSwitch
        :model-value="autoStart"
        label="自动登录"
        :disabled="disabled"
        @update:model-value="saveAutoStart"
      />
    </div>

    <AccountSettingsDialog
      v-if="open"
      title="账号保活"
      description="所有微信区账号共享 · 仅对具备微信登录凭据的账号生效"
      icon="i-carbon-renew"
      :saving="busy"
      :disabled="disabled"
      @cancel="!busy && (open = false)"
      @save="submit"
    >
      <div class="space-y-4">
        <div class="grid grid-cols-1 items-center gap-3 sm:grid-cols-2">
          <BaseSwitch v-model="draft.enabled" label="定时重登" :disabled="busy" />
          <BaseInput
            v-model.number="draft.intervalMinutes"
            label="重登间隔（分钟）"
            type="number"
            min="1"
            max="1440"
            :disabled="!draft.enabled || busy"
            placeholder="60"
          />
        </div>
        <div class="grid grid-cols-1 items-center gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2 dark:border-gray-700">
          <BaseSwitch v-model="draft.offlineEnabled" label="掉线重登" :disabled="busy" />
          <BaseInput
            v-model.number="draft.offlineDelaySeconds"
            label="掉线后等待（秒）"
            type="number"
            min="1"
            max="86400"
            placeholder="60"
            :disabled="!draft.offlineEnabled || busy"
          />
        </div>
        <p class="text-xs text-gray-500">
          定时重登会续期微信授权并重启账号，重启期间该账号会短暂停止收菜；掉线重登在账号断开或被踢下线后按等待时间自动续期重登。
        </p>
      </div>
    </AccountSettingsDialog>
  </div>
</template>
