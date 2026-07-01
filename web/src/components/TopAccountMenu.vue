<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import AccountModal from '@/components/AccountModal.vue'
import RemarkModal from '@/components/RemarkModal.vue'
import { getPlatformClass, getPlatformLabel, useAccountStore } from '@/stores/account'
import { useStatusStore } from '@/stores/status'

const accountStore = useAccountStore()
const statusStore = useStatusStore()
const { accounts, currentAccount } = storeToRefs(accountStore)
const { status } = storeToRefs(statusStore)

const showAccountDropdown = ref(false)
const showAccountModal = ref(false)
const showRemarkModal = ref(false)
const accountToEdit = ref<any>(null)

const platform = computed(() => getPlatformLabel(currentAccount.value?.platform))

const displayName = computed(() => {
  const acc = currentAccount.value
  if (!acc)
    return '选择账号'

  const liveName = status.value?.status?.name
  if (liveName && liveName !== '未登录') {
    if (acc.name)
      return `${liveName} (${acc.name})`
    return liveName
  }

  if (acc.name) {
    if (acc.nick)
      return `${acc.nick} (${acc.name})`
    return acc.name
  }

  if (acc.nick)
    return acc.nick

  return acc.uin || acc.id || '选择账号'
})

function selectAccount(acc: any) {
  accountStore.setCurrentAccount(acc)
  showAccountDropdown.value = false
}

function openAddAccount() {
  accountToEdit.value = null
  showAccountModal.value = true
  showAccountDropdown.value = false
}

function openRemarkModal(acc: any) {
  accountToEdit.value = acc
  showRemarkModal.value = true
  showAccountDropdown.value = false
}

async function handleAccountSaved() {
  await accountStore.fetchAccounts()
  showAccountModal.value = false
  showRemarkModal.value = false
  accountToEdit.value = null
}
</script>

<template>
  <div class="relative">
    <button
      class="max-w-[280px] flex items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-gray-100/70 dark:hover:bg-gray-700/50"
      @click="showAccountDropdown = !showAccountDropdown"
    >
      <div class="h-9 w-9 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 ring-1 ring-gray-200 dark:bg-gray-700 dark:ring-gray-600">
        <img
          v-if="currentAccount?.uin"
          :src="`https://q1.qlogo.cn/g?b=qq&nk=${currentAccount.uin}&s=100`"
          class="h-full w-full object-cover"
          @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
        >
        <div v-else class="i-carbon-user text-gray-400" />
      </div>
      <div class="hidden min-w-0 flex-col sm:flex">
        <span class="truncate text-sm text-gray-900 font-semibold dark:text-gray-100">
          {{ displayName }}
        </span>
        <span class="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
          <span
            v-if="platform"
            class="rounded px-1 py-0.2 text-[10px] font-medium leading-tight"
            :class="getPlatformClass(currentAccount?.platform)"
          >
            {{ platform }}
          </span>
          <span class="truncate">{{ currentAccount?.uin || currentAccount?.id || '未选择' }}</span>
        </span>
      </div>
      <div
        class="i-carbon-chevron-down shrink-0 text-gray-400 transition-transform duration-200"
        :class="{ 'rotate-180': showAccountDropdown }"
      />
    </button>

    <div
      v-if="showAccountDropdown"
      class="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden border border-gray-200/70 rounded-xl bg-white/95 py-1 shadow-xl backdrop-blur-sm dark:border-gray-700/70 dark:bg-gray-900/95"
    >
      <div class="custom-scrollbar max-h-72 overflow-y-auto">
        <template v-if="accounts.length > 0">
          <button
            v-for="acc in accounts"
            :key="acc.id || acc.uin"
            class="w-full flex items-center gap-3 px-4 py-2 transition-colors hover:bg-gray-100/60 dark:hover:bg-gray-700/50"
            :style="{ backgroundColor: currentAccount?.id === acc.id ? 'color-mix(in srgb, var(--theme-primary) 10%, transparent)' : undefined }"
            @click="selectAccount(acc)"
          >
            <div class="h-7 w-7 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600">
              <img
                v-if="acc.uin"
                :src="`https://q1.qlogo.cn/g?b=qq&nk=${acc.uin}&s=100`"
                class="h-full w-full object-cover"
                @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
              >
              <div v-else class="i-carbon-user text-gray-400" />
            </div>
            <div class="min-w-0 flex flex-1 flex-col items-start">
              <span class="w-full truncate text-left text-sm font-medium">
                {{ acc.nick && acc.name ? `${acc.nick} (${acc.name})` : acc.name || acc.nick || acc.uin }}
              </span>
              <div class="flex items-center gap-1.5">
                <span
                  v-if="getPlatformLabel(acc.platform)"
                  class="rounded px-1 py-0.2 text-[10px] font-medium leading-tight"
                  :class="getPlatformClass(acc.platform)"
                >
                  {{ getPlatformLabel(acc.platform) }}
                </span>
                <span class="text-xs text-gray-400">{{ acc.uin || acc.id }}</span>
              </div>
            </div>
            <button
              class="rounded-full p-1 text-gray-400 transition-colors hover:bg-blue-50/50 hover:text-blue-500 dark:hover:bg-blue-900/20"
              title="修改备注"
              @click.stop="openRemarkModal(acc)"
            >
              <div class="i-carbon-edit" />
            </button>
            <div v-if="currentAccount?.id === acc.id" class="i-carbon-checkmark shrink-0" :style="{ color: 'var(--theme-primary)' }" />
          </button>
        </template>
        <div v-else class="px-4 py-3 text-center text-sm text-gray-400">
          暂无账号
        </div>
      </div>
      <div class="mt-1 border-t border-gray-100 pt-1 dark:border-gray-700">
        <button
          class="w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-gray-100/50 dark:hover:bg-gray-700/50"
          :style="{ color: 'var(--theme-primary)' }"
          @click="openAddAccount"
        >
          <div class="i-carbon-add" />
          <span>添加账号</span>
        </button>
        <router-link
          to="/settings"
          class="w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-gray-100/50 dark:hover:bg-gray-700/50"
          :style="{ color: 'var(--theme-primary)' }"
          @click="showAccountDropdown = false"
        >
          <div class="i-carbon-add-alt" />
          <span>管理账号</span>
        </router-link>
      </div>
    </div>

    <div
      v-if="showAccountDropdown"
      class="fixed inset-0 z-40 bg-transparent"
      @click="showAccountDropdown = false"
    />

    <AccountModal
      :show="showAccountModal"
      :edit-data="accountToEdit"
      @close="showAccountModal = false; accountToEdit = null"
      @saved="handleAccountSaved"
    />

    <RemarkModal
      :show="showRemarkModal"
      :account="accountToEdit"
      @close="showRemarkModal = false"
      @saved="handleAccountSaved"
    />
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.3);
  border-radius: 2px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
}
</style>
