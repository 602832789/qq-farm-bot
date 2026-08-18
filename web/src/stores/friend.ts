import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

export interface BlacklistItem {
  gid: number
  name: string
  avatarUrl: string
}

export interface KnownFriendSettings {
  knownFriendGids: number[]
  knownFriendGidSyncCooldownSec: number
  friendsListCacheTtlSec: number
}

export interface FriendInteractionItemDto {
  id: string
  itemId: string
  name: string
  image: string
  count: number
  saleConditionSatisfiedCount: number
  interactionType: string
  protocol: 'item-use'
  description: string
  activityId: string
  sellCondition: string
  nearestExpireTime: number
  serverValidationRequired: boolean
}

export interface FriendInteractionResultDto {
  landId: string
  ok: boolean
  code: string
  message: string
}

export interface FriendInteractionBatchDto {
  hostGid: string
  ownerName: string
  itemId: string
  itemName: string
  requestedLandIds: string[]
  usedLandIds: string[]
  failedLandIds: string[]
  successCount: number
  failureCount: number
  results: FriendInteractionResultDto[]
  items: FriendInteractionItemDto[]
  message: string
}

export const useFriendStore = defineStore('friend', () => {
  const friends = ref<any[]>([])
  const loading = ref(false)
  const friendLands = ref<Record<string, any[]>>({})
  const friendLandsLoading = ref<Record<string, boolean>>({})
  const friendLandsError = ref<Record<string, string>>({})
  const blacklist = ref<BlacklistItem[]>([])
  const interactRecords = ref<any[]>([])
  const interactLoading = ref(false)
  const interactError = ref('')
  const interactionItems = ref<FriendInteractionItemDto[]>([])
  const interactionItemsLoading = ref(false)
  const interactionItemsError = ref('')
  const interactionUsePending = ref(false)
  const interactionUseError = ref('')
  const interactionItemsAccountId = ref('')
  const interactionUsedLandIds = ref<Record<string, string[]>>({})

  const knownFriendGids = ref<number[]>([])
  const knownFriendGidSyncCooldownSec = ref(600)
  const friendsListCacheTtlSec = ref(60)
  const knownFriendSettingsLoading = ref(false)
  const knownFriendSettingsSaving = ref(false)

  function buildPlantSummaryFromDetail(lands: any[], summary: any) {
    let stealNum = 0
    let dryNum = 0
    let weedNum = 0
    let insectNum = 0

    const detailLands = Array.isArray(lands) ? lands : []
    if (detailLands.length > 0) {
      for (const land of detailLands) {
        if (!land || !land.unlocked)
          continue
        if (land.status === 'stealable')
          stealNum++
        if (land.needWater)
          dryNum++
        if (land.needWeed)
          weedNum++
        if (land.needBug)
          insectNum++
      }
    }
    else {
      stealNum = Array.isArray(summary?.stealable) ? summary.stealable.length : 0
      dryNum = Array.isArray(summary?.needWater) ? summary.needWater.length : 0
      weedNum = Array.isArray(summary?.needWeed) ? summary.needWeed.length : 0
      insectNum = Array.isArray(summary?.needBug) ? summary.needBug.length : 0
    }

    return {
      stealNum: Number(stealNum) || 0,
      dryNum: Number(dryNum) || 0,
      weedNum: Number(weedNum) || 0,
      insectNum: Number(insectNum) || 0,
    }
  }

  function syncFriendPlantSummary(friendId: string, lands: any[], summary: any) {
    const key = String(friendId)
    const idx = friends.value.findIndex(f => String(f?.gid || '') === key)
    if (idx < 0)
      return

    const nextPlant = buildPlantSummaryFromDetail(lands, summary)
    friends.value[idx] = {
      ...friends.value[idx],
      plant: nextPlant,
    }
  }

  async function fetchFriends(accountId: string, forceSync = false) {
    if (!accountId)
      return
    loading.value = true
    try {
      const res = await api.get('/api/friends', {
        headers: { 'x-account-id': accountId },
        params: forceSync ? { forceSync: 'true' } : {},
      })
      if (res.data.ok) {
        friends.value = res.data.data || []
      }
    }
    finally {
      loading.value = false
    }
  }
  async function fetchInteractRecords(accountId: string) {
    if (!accountId)
      return
    interactLoading.value = true
    interactError.value = ''
    interactRecords.value = []

    try {
      const res = await api.get('/api/interact-records', {
        headers: { 'x-account-id': accountId },
      })
      if (res.data.ok) {
        interactRecords.value = Array.isArray(res.data.data) ? res.data.data : []
      }
      else {
        interactError.value = res.data.error || '加载访客记录失败'
      }
    }
    catch (error: any) {
      interactError.value = error?.response?.data?.error || error?.message || '加载访客记录失败'
    }
    finally {
      interactLoading.value = false
    }
  }

  async function fetchBlacklist(accountId: string) {
    if (!accountId)
      return
    try {
      const res = await api.get('/api/friend-blacklist', {
        headers: { 'x-account-id': accountId },
      })
      if (res.data.ok) {
        blacklist.value = res.data.data || []
      }
    }
    catch { /* ignore */ }
  }

  async function toggleBlacklist(accountId: string, gid: number) {
    if (!accountId || !gid)
      return
    const res = await api.post('/api/friend-blacklist/toggle', { gid }, {
      headers: { 'x-account-id': accountId },
    })
    if (res.data.ok) {
      blacklist.value = res.data.data || []
    }
  }

  async function fetchFriendLands(accountId: string, friendId: string) {
    if (!accountId || !friendId)
      return false
    friendLandsLoading.value[friendId] = true
    friendLandsError.value[friendId] = ''
    try {
      const res = await api.get(`/api/friend/${friendId}/lands`, {
        headers: { 'x-account-id': accountId },
        skipErrorToast: true,
      } as any)
      if (res.data.ok) {
        const lands = res.data.data.lands || []
        const summary = res.data.data.summary || null
        friendLands.value[friendId] = lands
        syncFriendPlantSummary(friendId, lands, summary)
        return true
      }
      friendLands.value[friendId] = []
      friendLandsError.value[friendId] = String(res.data?.error || '无法读取好友土地')
      return false
    }
    catch (error: any) {
      friendLands.value[friendId] = []
      const rawMessage = String(error?.response?.data?.error || error?.message || '')
      friendLandsError.value[friendId] = /gamepb\.|code=\d+|GatewayError/.test(rawMessage)
        ? '无法进入该好友农场，好友状态可能已变化，请刷新后重试'
        : (rawMessage || '无法读取好友土地，请稍后重试')
      return false
    }
    finally {
      friendLandsLoading.value[friendId] = false
    }
  }

  async function operate(accountId: string, friendId: string, opType: string) {
    if (!accountId || !friendId)
      return { ok: false, message: '参数无效' }
    try {
      const res = await api.post(`/api/friend/${friendId}/op`, { opType }, {
        headers: { 'x-account-id': accountId },
      })
      const result = res.data?.data || res.data || {}
      await fetchFriends(accountId)
      if (friendLands.value[friendId]) {
        await fetchFriendLands(accountId, friendId)
      }
      return result
    }
    catch (e: any) {
      return { ok: false, message: e?.response?.data?.error || e?.message || '操作失败' }
    }
  }

  function interactionUsageKey(accountId: string, itemId: unknown, friendId: unknown) {
    return `${String(accountId || '')}:${String(itemId || '')}:${String(friendId || '')}`
  }

  function getInteractionUsedLandIds(accountId: string, itemId: unknown, friendId: unknown) {
    return interactionUsedLandIds.value[interactionUsageKey(accountId, itemId, friendId)] || []
  }

  function recordInteractionUsage(accountId: string, result: FriendInteractionBatchDto) {
    const key = interactionUsageKey(accountId, result.itemId, result.hostGid)
    const used = new Set(interactionUsedLandIds.value[key] || [])
    for (const landId of result.usedLandIds || [])
      used.add(String(landId))
    interactionUsedLandIds.value = {
      ...interactionUsedLandIds.value,
      [key]: [...used].sort((left, right) => Number(left) - Number(right)),
    }
  }

  async function fetchInteractionItems(accountId: string) {
    const requestedAccountId = String(accountId || '').trim()
    if (!requestedAccountId)
      return false
    if (interactionItemsAccountId.value !== requestedAccountId) {
      interactionItems.value = []
      interactionItemsAccountId.value = requestedAccountId
    }
    interactionItemsLoading.value = true
    interactionItemsError.value = ''
    try {
      const res = await api.get('/api/friend-interaction-items', {
        headers: { 'x-account-id': requestedAccountId },
        skipErrorToast: true,
      } as any)
      if (!res.data?.ok) {
        interactionItems.value = []
        interactionItemsError.value = String(res.data?.error || '无法读取特殊互动道具')
        return false
      }
      interactionItems.value = Array.isArray(res.data?.data?.items) ? res.data.data.items : []
      return true
    }
    catch (error: any) {
      interactionItems.value = []
      interactionItemsError.value = String(error?.response?.data?.error || error?.message || '无法读取特殊互动道具')
      return false
    }
    finally {
      interactionItemsLoading.value = false
    }
  }

  async function useInteractionItemBatch(accountId: string, friendId: string, itemId: string, landIds: string[]) {
    if (!accountId || !friendId || !itemId || !Array.isArray(landIds) || landIds.length === 0)
      return false
    if (interactionUsePending.value)
      return false
    interactionUsePending.value = true
    interactionUseError.value = ''
    try {
      const res = await api.post(`/api/friend/${encodeURIComponent(friendId)}/interaction-items/use-batch`, {
        itemId,
        landIds,
      }, {
        headers: { 'x-account-id': accountId },
        skipErrorToast: true,
      } as any)
      if (!res.data?.ok) {
        interactionUseError.value = String(res.data?.error || '特殊互动道具使用失败')
        return false
      }
      const result = res.data.data as FriendInteractionBatchDto
      if (Array.isArray(result?.items))
        interactionItems.value = result.items
      recordInteractionUsage(accountId, result)
      return result
    }
    catch (error: any) {
      interactionUseError.value = String(error?.response?.data?.error || error?.message || '特殊互动道具使用失败')
      return false
    }
    finally {
      interactionUsePending.value = false
    }
  }

  function resetInteractionState() {
    interactionItems.value = []
    interactionItemsError.value = ''
    interactionUseError.value = ''
    interactionItemsAccountId.value = ''
    interactionUsedLandIds.value = {}
  }

  function applyKnownFriendSettings(data: KnownFriendSettings | null | undefined) {
    if (!data)
      return
    knownFriendGids.value = Array.isArray(data.knownFriendGids) ? data.knownFriendGids : []
    knownFriendGidSyncCooldownSec.value = Number.isFinite(data.knownFriendGidSyncCooldownSec)
      ? Math.max(30, Math.min(86400, data.knownFriendGidSyncCooldownSec))
      : 600
    friendsListCacheTtlSec.value = Number.isFinite(data.friendsListCacheTtlSec)
      ? Math.max(10, Math.min(86400, data.friendsListCacheTtlSec))
      : 60
  }

  async function fetchKnownFriendSettings(accountId: string) {
    if (!accountId)
      return
    knownFriendSettingsLoading.value = true
    try {
      const res = await api.get('/api/friend-known-gids', {
        headers: { 'x-account-id': accountId },
      })
      if (res.data.ok) {
        applyKnownFriendSettings(res.data.data)
      }
    }
    finally {
      knownFriendSettingsLoading.value = false
    }
  }

  async function saveKnownFriendSettings(accountId: string, payload: Partial<KnownFriendSettings>) {
    if (!accountId)
      return
    knownFriendSettingsSaving.value = true
    try {
      const res = await api.post('/api/friend-known-gids', payload, {
        headers: { 'x-account-id': accountId },
      })
      if (res.data.ok) {
        applyKnownFriendSettings(res.data.data)
      }
    }
    finally {
      knownFriendSettingsSaving.value = false
    }
  }

  async function removeKnownFriendGid(accountId: string, gid: number) {
    if (!accountId || !gid)
      return
    knownFriendSettingsSaving.value = true
    try {
      const res = await api.post('/api/friend-known-gids/remove', { gid }, {
        headers: { 'x-account-id': accountId },
      })
      if (res.data.ok) {
        applyKnownFriendSettings(res.data.data)
      }
    }
    finally {
      knownFriendSettingsSaving.value = false
    }
  }

  async function batchAddKnownFriendGids(accountId: string, gids: number[]) {
    if (!accountId || !gids || gids.length === 0)
      return { ok: false, addedCount: 0 }
    knownFriendSettingsSaving.value = true
    try {
      const res = await api.post('/api/friend-known-gids/batch-add', { gids }, {
        headers: { 'x-account-id': accountId },
      })
      if (res.data.ok) {
        applyKnownFriendSettings(res.data.data)
      }
      return { ok: res.data.ok, addedCount: res.data.addedCount || 0 }
    }
    finally {
      knownFriendSettingsSaving.value = false
    }
  }

  async function removeUnsyncedKnownFriendGids(accountId: string, gids: number[]) {
    if (!accountId || !gids || gids.length === 0)
      return { ok: false, removedCount: 0 }
    knownFriendSettingsSaving.value = true
    try {
      const res = await api.post('/api/friend-known-gids/batch-remove', { gids }, {
        headers: { 'x-account-id': accountId },
      })
      if (res.data.ok) {
        applyKnownFriendSettings(res.data.data)
      }
      return { ok: res.data.ok, removedCount: res.data.removedCount || 0 }
    }
    finally {
      knownFriendSettingsSaving.value = false
    }
  }

  return {
    friends,
    loading,
    friendLands,
    friendLandsLoading,
    friendLandsError,
    blacklist,
    interactRecords,
    interactLoading,
    interactError,
    interactionItems,
    interactionItemsLoading,
    interactionItemsError,
    interactionUsePending,
    interactionUseError,
    knownFriendGids,
    knownFriendGidSyncCooldownSec,
    friendsListCacheTtlSec,
    knownFriendSettingsLoading,
    knownFriendSettingsSaving,
    fetchFriends,
    fetchBlacklist,
    toggleBlacklist,
    fetchInteractRecords,
    fetchFriendLands,
    operate,
    fetchInteractionItems,
    useInteractionItemBatch,
    getInteractionUsedLandIds,
    resetInteractionState,
    fetchKnownFriendSettings,
    saveKnownFriendSettings,
    removeKnownFriendGid,
    batchAddKnownFriendGids,
    removeUnsyncedKnownFriendGids,
  }
})
