<script setup lang="ts">
import type { CodeHealthItem } from '@/stores/account'
import { useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import AccountModal from '@/components/AccountModal.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import AccountKeepAliveCard from '@/components/settings/AccountKeepAliveCard.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { getPlatformClass, getPlatformLabel, useAccountStore } from '@/stores/account'
import { useStatusStore } from '@/stores/status'
import { getAccountRuntimeStatus, isAccountActive } from '@/utils/account-runtime'
import { getCredentialStatus, getWxPreflightBadge, getWxPreflightSummary } from '@/utils/credential-status'

const emit = defineEmits<{ openSettings: [account: any] }>()

const accountStore = useAccountStore()
const statusStore = useStatusStore()
const { accounts, loading: accountsLoading, currentAccountId, codeHealth } = storeToRefs(accountStore)
const { status: runtimeStatus } = storeToRefs(statusStore)

const now = useNow({ interval: 1000 })

const showModal = ref(false)
const editingAccount = ref<any>(null)
const showDeleteConfirm = ref(false)
const deleteLoading = ref(false)
const accountToDelete = ref<any>(null)
const showClearStoppedConfirm = ref(false)
const clearStoppedLoading = ref(false)
const refreshWxCredentialsLoading = ref(false)
const accountAvatarErrors = ref<Set<string>>(new Set())

const alertVisible = ref(false)
const alertConfig = ref({ title: '', message: '', type: 'primary' as 'primary' | 'danger' })

function notify(message: string, type: 'primary' | 'danger' = 'primary') {
  alertConfig.value = { title: type === 'danger' ? '错误' : '提示', message, type }
  alertVisible.value = true
}

const stoppedAccounts = computed(() => accounts.value.filter((acc: any) => !isAccountActive(acc)))
const stoppedAccountsCount = computed(() => stoppedAccounts.value.length)
const wxAccountCount = computed(() => accounts.value.filter((acc: any) => acc.platform === 'wx').length)

function getAccountAvatar(account: any) {
  const accountId = String(account?.id || '')
  const liveAccountId = String(runtimeStatus.value?.accountId || '')
  const liveAvatar = accountId && accountId === liveAccountId
    ? String(runtimeStatus.value?.status?.avatarUrl || '').trim()
    : ''
  return liveAvatar || String(account?.avatar || '').trim()
}

function canShowAccountAvatar(account: any) {
  const accountId = String(account?.id || '')
  return !!getAccountAvatar(account) && !accountAvatarErrors.value.has(accountId)
}

function handleAccountAvatarError(account: any) {
  const accountId = String(account?.id || '')
  if (accountId)
    accountAvatarErrors.value.add(accountId)
}

function runtimeState(acc: any) {
  return getAccountRuntimeStatus(acc, now.value.getTime())
}

/** 访问凭证剩余时间；判定逻辑抽到纯函数里，便于回归测试。 */
function credentialStatus(acc: any) {
  return getCredentialStatus(acc, now.value.getTime())
}

/** 免扫码续期能力标记；QQ 账号返回 null 不渲染。 */
function wxPreflightBadge(acc: any) {
  return getWxPreflightBadge(acc)
}

/** 上次自动续期 / 今日失败次数；旧版服务字段缺失时返回 null 不渲染。 */
function wxPreflightSummary(acc: any) {
  return getWxPreflightSummary(acc, now.value.getTime())
}

function selectAccount(account: any) {
  if (!account?.id)
    return
  accountStore.selectAccount(String(account.id))
}

function openAddModal() {
  editingAccount.value = null
  showModal.value = true
}

function openEditModal(account: any) {
  editingAccount.value = { ...account }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingAccount.value = null
}

async function toggleAccount(account: any) {
  try {
    if (isAccountActive(account))
      await accountStore.stopAccount(String(account.id))
    else
      await accountStore.startAccount(String(account.id))
  }
  catch (e: any) {
    notify(`操作失败: ${e?.message || '未知错误'}`, 'danger')
  }
}

async function handleDelete(account: any) {
  accountToDelete.value = account
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (!accountToDelete.value)
    return
  deleteLoading.value = true
  try {
    await accountStore.deleteAccount(String(accountToDelete.value.id))
    accountToDelete.value = null
    showDeleteConfirm.value = false
  }
  catch (e: any) {
    notify(`删除失败: ${e?.message || '未知错误'}`, 'danger')
  }
  finally {
    deleteLoading.value = false
  }
}

function openClearStoppedConfirm() {
  if (stoppedAccountsCount.value === 0) {
    notify('没有已停止的账号需要清理', 'primary')
    return
  }
  showClearStoppedConfirm.value = true
}

async function confirmClearStopped() {
  clearStoppedLoading.value = true
  try {
    const stoppedIds = stoppedAccounts.value.map((acc: any) => String(acc.id))
    let deletedCount = 0
    for (const id of stoppedIds) {
      try {
        await accountStore.deleteAccount(id)
        deletedCount++
      }
      catch {
        // 单个账号删除失败不影响其它账号
      }
    }
    showClearStoppedConfirm.value = false
    notify(`成功清理 ${deletedCount} 个已停止的账号`, 'primary')
    await accountStore.fetchAccounts()
  }
  finally {
    clearStoppedLoading.value = false
  }
}

async function refreshWxCredentials() {
  if (refreshWxCredentialsLoading.value)
    return
  refreshWxCredentialsLoading.value = true
  try {
    const res = await accountStore.refreshWxCodes()
    const data = res?.data || {}
    const success = Number(data.success) || 0
    const failed = Number(data.failed) || 0
    const skipped = Number(data.skipped) || 0
    const failureDetail = (Array.isArray(data.results) ? data.results : [])
      .filter((item: any) => !item.ok)
      .map((item: any) => `${item.name}：${item.error || '续期失败'}`)
      .join('；')
    if (!res?.ok && success === 0) {
      notify([res?.error, failureDetail].filter(Boolean).join('\n') || '微信授权续期失败', 'danger')
      return
    }
    const summary = `续期完成：成功 ${success} 个${failed > 0 ? `，失败 ${failed} 个` : ''}${skipped > 0 ? `，跳过 ${skipped} 个（缺少长效凭证）` : ''}`
    notify(failureDetail ? `${summary}\n${failureDetail}` : summary, failed > 0 ? 'danger' : 'primary')
  }
  catch (e: any) {
    notify(`续期失败: ${e?.message || '未知错误'}`, 'danger')
  }
  finally {
    refreshWxCredentialsLoading.value = false
  }
}

/* ---------- Code 过期自动监听 ---------- */

/** 同一账号同一状态 10 分钟内只自动补一次，避免 10 秒轮询反复打续期接口。 */
const AUTO_FIX_COOLDOWN_MS = 10 * 60_000
const autoFixAttempts = new Map<string, number>()
const codeFixing = ref<Set<string>>(new Set())
const codeFixResults = ref<Record<string, { ok: boolean, message: string }>>({})
const manualAlerted = ref<Set<string>>(new Set())
const autoFixDisabled = ref<Set<string>>(new Set())

const codeAlerts = computed(() => (codeHealth.value || []).filter(
  (item: CodeHealthItem) => item.level !== 'ok' && item.level !== 'unknown',
))

function codeLevelLabel(level: CodeHealthItem['level']) {
  const labels: Record<string, string> = {
    expiring: '即将过期',
    expired: '已过期',
    refresh_failed: '续期失败',
    offline: '掉线待补码',
  }
  return labels[level] || level
}

/** 自动补 Code：优先走后端免扫码换码 / 重签；失败后转为「需手动补 Code」。 */
async function tryAutoFix(item: CodeHealthItem, force = false) {
  if (codeFixing.value.has(item.accountId))
    return
  if (!force && autoFixDisabled.value.has(item.accountId))
    return
  const key = `${item.accountId}:${item.level}`
  const last = autoFixAttempts.get(key) || 0
  if (!force && Date.now() - last < AUTO_FIX_COOLDOWN_MS)
    return
  autoFixAttempts.set(key, Date.now())
  codeFixing.value = new Set([...codeFixing.value, item.accountId])
  try {
    const res = await accountStore.autoFixCode(item.accountId)
    const ok = !!res?.ok
    const message = ok
      ? '已自动补 Code，账号已重新上线'
      : (res?.error || '自动补 Code 失败，请手动补 Code')
    codeFixResults.value = { ...codeFixResults.value, [item.accountId]: { ok, message } }
    const disabled = new Set(autoFixDisabled.value)
    if (ok) {
      disabled.delete(item.accountId)
      manualAlerted.value = new Set([...manualAlerted.value].filter(id => id !== item.accountId))
    }
    else {
      // 失败不再自动重试，等用户点「重试」或手动补 Code，避免每轮轮询都失败一次。
      disabled.add(item.accountId)
    }
    autoFixDisabled.value = disabled
  }
  catch (e: any) {
    codeFixResults.value = {
      ...codeFixResults.value,
      [item.accountId]: { ok: false, message: `自动补 Code 异常：${e?.message || '未知错误'}` },
    }
    autoFixDisabled.value = new Set([...autoFixDisabled.value, item.accountId])
  }
  finally {
    const next = new Set(codeFixing.value)
    next.delete(item.accountId)
    codeFixing.value = next
  }
}

/** 打开补 Code 弹窗：清空旧 Code，避免用户误把已失效的 Code 再保存一次。 */
function openRefillCodeModal(item: CodeHealthItem) {
  const acc: any = accounts.value.find((account: any) => String(account.id) === item.accountId)
  editingAccount.value = {
    ...(acc || { id: item.accountId, name: item.name, platform: item.platform }),
    code: '',
  }
  showModal.value = true
}

watch(codeAlerts, (list) => {
  for (const item of list) {
    if (item.autoFixable && !autoFixDisabled.value.has(item.accountId)) {
      void tryAutoFix(item)
      continue
    }
    if (item.needsManual && !manualAlerted.value.has(item.accountId)) {
      manualAlerted.value = new Set([...manualAlerted.value, item.accountId])
      notify(`账号 ${item.name} 需要补 Code：${item.reason}。请点击「立即补 Code」重新扫码或填写新 Code。`, 'danger')
    }
  }
  const alive = new Set(list.map(item => item.accountId))
  for (const id of [...manualAlerted.value]) {
    if (!alive.has(id))
      manualAlerted.value = new Set([...manualAlerted.value].filter(key => key !== id))
  }
}, { immediate: true })
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 class="text-lg text-gray-900 font-bold dark:text-gray-100">
          账号管理
        </h3>
        <p class="mt-1 text-xs text-gray-500">
          共 {{ accounts.length }} 个账号，其中微信 {{ wxAccountCount }} 个
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <BaseButton
          variant="primary"
          size="sm"
          :loading="refreshWxCredentialsLoading"
          :disabled="accountsLoading || accounts.length === 0"
          @click="refreshWxCredentials"
        >
          <span class="i-carbon-renew mr-2" />
          <span class="hidden sm:inline">续期全部微信授权</span>
          <span class="sm:hidden">授权续期</span>
        </BaseButton>
        <BaseButton
          variant="primary"
          size="sm"
          :disabled="stoppedAccountsCount === 0"
          @click="openClearStoppedConfirm"
        >
          <span class="i-carbon-trash-can mr-2" />
          <span class="hidden sm:inline">一键清理</span>
          <span class="sm:hidden">清理</span>
          ({{ stoppedAccountsCount }})
        </BaseButton>
        <BaseButton variant="primary" size="sm" @click="openAddModal">
          <span class="i-carbon-add mr-2" />
          添加账号
        </BaseButton>
      </div>
    </div>

    <!-- Code 过期自动监听：能自动换码的自动补，不能自动补的一键打开补 Code 弹窗 -->
    <div
      class="farm-content-card border border-transparent rounded-lg bg-white p-3 shadow dark:bg-gray-800 sm:p-4"
      :class="codeAlerts.length ? '!border-amber-200 dark:!border-amber-800' : ''"
      role="region"
      aria-label="Code 自动监听"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <span class="i-carbon-radar text-base text-amber-500" aria-hidden="true" />
          <strong class="text-sm text-gray-900 dark:text-gray-100">Code 自动监听</strong>
          <span class="rounded bg-green-50 px-1.5 py-0.5 text-[10px] text-green-600 dark:bg-green-900/30 dark:text-green-400">
            已开启 · 每 10 秒检查
          </span>
        </div>
        <span class="text-xs text-gray-500">
          {{ codeAlerts.length ? `${codeAlerts.length} 个账号需要补 Code` : '所有账号 Code 正常' }}
        </span>
      </div>
      <p class="mt-1.5 text-xs text-gray-500">
        微信凭证到期前自动换 Code；QQ 掉线时尽力自动重签。补 Code 后账号会自动重新上线，失败时会提示手动补码。
      </p>
      <div v-if="codeAlerts.length" class="mt-3 flex flex-col gap-2">
        <div
          v-for="item in codeAlerts"
          :key="item.accountId"
          class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-900/20"
        >
          <div class="min-w-0">
            <p class="flex flex-wrap items-center gap-1.5 text-xs text-gray-800 font-medium dark:text-gray-100">
              {{ item.name || item.accountId }}
              <span class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                {{ codeLevelLabel(item.level) }}
              </span>
              <span class="text-[10px] text-gray-400">{{ getPlatformLabel(item.platform) }}</span>
            </p>
            <p class="mt-0.5 break-words text-xs text-gray-500">
              {{ item.reason }}
              <span v-if="codeFixResults[item.accountId]" :class="codeFixResults[item.accountId]?.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                · {{ codeFixResults[item.accountId]?.message }}
              </span>
            </p>
          </div>
          <div class="flex shrink-0 gap-2">
            <BaseButton
              v-if="item.autoFixable"
              variant="secondary"
              size="sm"
              :loading="codeFixing.has(item.accountId)"
              @click="tryAutoFix(item, true)"
            >
              {{ autoFixDisabled.has(item.accountId) ? '重试自动补' : '自动补 Code' }}
            </BaseButton>
            <BaseButton variant="primary" size="sm" @click="openRefillCodeModal(item)">
              立即补 Code
            </BaseButton>
          </div>
        </div>
      </div>
    </div>

    <div v-if="accountsLoading && accounts.length === 0" class="py-8 text-center text-gray-500">
      <span class="i-carbon-circle-dash mb-2 inline-block animate-spin text-2xl" />
      <div>加载中...</div>
    </div>

    <div v-else-if="accounts.length === 0" class="farm-content-card rounded-lg bg-white py-12 text-center shadow dark:bg-gray-800">
      <span class="i-carbon-user-avatar mb-4 inline-block text-4xl text-gray-400" />
      <p class="mb-4 text-gray-500">
        暂无账号
      </p>
      <BaseButton variant="text" size="sm" @click="openAddModal">
        立即添加
      </BaseButton>
    </div>

    <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="acc in accounts"
        :key="acc.id"
        class="farm-content-card cursor-pointer border rounded-lg bg-white p-3 shadow transition-all duration-200 dark:bg-gray-800 sm:p-4"
        :class="String(currentAccountId) === String(acc.id) ? 'ring-2' : 'border-transparent'"
        :style="String(currentAccountId) === String(acc.id)
          ? { borderColor: 'var(--theme-primary)', backgroundColor: 'rgba(var(--theme-primary-rgb, 59, 130, 246), 0.1)' }
          : {}"
        @click="selectAccount(acc)"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div class="min-w-0 flex flex-1 items-center gap-3">
            <div class="h-10 w-10 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 sm:h-12 sm:w-12 dark:bg-gray-700">
              <img
                v-if="canShowAccountAvatar(acc)"
                :src="getAccountAvatar(acc)"
                class="h-full w-full object-cover"
                @error="handleAccountAvatarError(acc)"
              >
              <span v-else class="i-carbon-user text-xl text-gray-400 sm:text-2xl" />
            </div>
            <div class="min-w-0 flex-1">
              <h4 class="truncate text-base font-bold sm:text-lg">
                {{ acc.name || acc.nick || acc.id }}
              </h4>
              <div class="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span
                  v-if="acc.platform"
                  class="rounded px-1.5 py-0.5 text-[10px] leading-tight font-medium"
                  :class="getPlatformClass(acc.platform)"
                >
                  {{ getPlatformLabel(acc.platform) }}
                </span>
                <span class="truncate text-xs text-gray-500 sm:text-sm">
                  {{ acc.uin || '未绑定' }}
                </span>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-end gap-2 sm:flex-col sm:items-end">
            <BaseButton
              variant="secondary"
              size="sm"
              class="border rounded-full shadow-sm transition-all duration-500 ease-in-out sm:w-20 active:scale-95"
              :class="isAccountActive(acc) ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100 focus:ring-red-500 active:border-red-300 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 dark:focus:ring-red-500 dark:active:border-red-700' : 'border-green-200 bg-green-50 text-green-600 hover:bg-green-100 focus:ring-green-500 active:border-green-300 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 dark:focus:ring-green-500 dark:active:border-green-700'"
              :disabled="acc.runtimeState === 'stopping'"
              @click.stop="toggleAccount(acc)"
            >
              <span class="mr-1" :class="isAccountActive(acc) ? 'i-carbon-stop-filled' : 'i-carbon-play-filled'" />
              {{ isAccountActive(acc) ? '停止' : '启动' }}
            </BaseButton>
          </div>
        </div>

        <div class="mt-3 min-h-5 flex items-center gap-2 text-xs text-gray-600 tabular-nums dark:text-gray-300" role="status">
          <span v-if="runtimeState(acc).busy" class="i-carbon-circle-dash shrink-0 animate-spin" />
          <span v-else class="h-2 w-2 shrink-0 rounded-full" :class="runtimeState(acc).color" />
          <span class="min-w-0 break-words">{{ runtimeState(acc).text }}</span>
        </div>

        <p v-if="acc.platform === 'wx'" class="mt-3 break-words text-xs tabular-nums" :class="credentialStatus(acc).color">
          {{ credentialStatus(acc).text }}
        </p>

        <div v-if="wxPreflightBadge(acc)" class="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            class="rounded px-1.5 py-0.5 text-[10px] leading-tight font-medium"
            :class="wxPreflightBadge(acc)?.badgeClass"
            :title="wxPreflightBadge(acc)?.hint"
          >
            免扫码续期：{{ wxPreflightBadge(acc)?.text }}
          </span>
          <span class="hidden text-[10px] text-gray-400 sm:inline">{{ wxPreflightBadge(acc)?.hint }}</span>
        </div>

        <p
          v-if="wxPreflightSummary(acc)"
          class="mt-1.5 break-words text-xs tabular-nums"
          :class="wxPreflightSummary(acc)?.color"
          :title="wxPreflightSummary(acc)?.hint"
        >
          {{ wxPreflightSummary(acc)?.text }}
          <span class="hidden text-gray-400 sm:inline">· {{ wxPreflightSummary(acc)?.detail }}</span>
        </p>

        <div class="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 sm:mt-4 dark:border-gray-700 sm:pt-4">
          <div class="hidden items-center gap-2 text-xs text-gray-500 sm:flex">
            <span>{{ acc.name ? '点击卡片切换当前账号' : '' }}</span>
          </div>
          <div class="flex flex-1 justify-end gap-1 sm:flex-initial sm:gap-2">
            <BaseButton
              variant="ghost"
              class="group relative min-h-[36px] min-w-[36px] !p-2"
              title="设置"
              aria-label="设置"
              @click.stop="emit('openSettings', acc)"
            >
              <span class="i-carbon-settings" />
              <span class="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 -translate-x-1/2 dark:bg-gray-100 dark:text-gray-900 group-hover:opacity-100">设置</span>
            </BaseButton>
            <BaseButton
              variant="ghost"
              class="group relative min-h-[36px] min-w-[36px] !p-2"
              title="编辑"
              aria-label="编辑"
              @click.stop="openEditModal(acc)"
            >
              <span class="i-carbon-edit" />
              <span class="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 -translate-x-1/2 dark:bg-gray-100 dark:text-gray-900 group-hover:opacity-100">编辑</span>
            </BaseButton>
            <BaseButton
              variant="ghost"
              class="group relative min-h-[36px] min-w-[36px] text-red-500 !p-2 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300"
              title="删除"
              aria-label="删除"
              @click.stop="handleDelete(acc)"
            >
              <span class="i-carbon-trash-can" />
              <span class="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 -translate-x-1/2 dark:bg-gray-100 dark:text-gray-900 group-hover:opacity-100">删除</span>
            </BaseButton>
          </div>
        </div>
      </div>
    </div>

    <AccountKeepAliveCard @notify="notify" />

    <AccountModal
      :show="showModal"
      :edit-data="editingAccount"
      @close="closeModal"
      @saved="accountStore.fetchAccounts()"
    />

    <ConfirmModal
      :show="showDeleteConfirm"
      :loading="deleteLoading"
      title="删除账号"
      :message="accountToDelete ? `确定要删除账号 ${accountToDelete.name || accountToDelete.id} 吗?` : ''"
      confirm-text="删除"
      type="danger"
      @close="!deleteLoading && (showDeleteConfirm = false)"
      @cancel="!deleteLoading && (showDeleteConfirm = false)"
      @confirm="confirmDelete"
    />

    <ConfirmModal
      :show="showClearStoppedConfirm"
      :loading="clearStoppedLoading"
      title="一键清理已停止账号"
      :message="`确定要清理 ${stoppedAccountsCount} 个已停止的账号吗？此操作不可恢复！`"
      confirm-text="确认清理"
      type="danger"
      @close="!clearStoppedLoading && (showClearStoppedConfirm = false)"
      @cancel="!clearStoppedLoading && (showClearStoppedConfirm = false)"
      @confirm="confirmClearStopped"
    />

    <ConfirmModal
      :show="alertVisible"
      :title="alertConfig.title"
      :message="alertConfig.message"
      :type="alertConfig.type"
      is-alert
      confirm-text="知道了"
      @confirm="alertVisible = false"
      @cancel="alertVisible = false"
    />
  </div>
</template>
