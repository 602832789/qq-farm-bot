import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

export interface Land {
  id: number
  plantName?: string
  phaseName?: string
  seedImage?: string
  status: string
  matureInSec: number
  needWater?: boolean
  needWeed?: boolean
  needBug?: boolean
  [key: string]: any
}

export const useFarmStore = defineStore('farm', () => {
  const lands = ref<Land[]>([])
  const seeds = ref<any[]>([])
  const summary = ref<any>({})
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')
  let landRequestSequence = 0

  async function fetchLands(accountId: string) {
    if (!accountId)
      return false
    const sequence = ++landRequestSequence
    loading.value = true
    loaded.value = false
    error.value = ''
    try {
      const { data } = await api.get('/api/lands', {
        headers: { 'x-account-id': accountId },
        skipErrorToast: true,
      } as any)
      if (sequence !== landRequestSequence)
        return false
      if (data && data.ok) {
        lands.value = data.data.lands || []
        summary.value = data.data.summary || {}
        return true
      }
      error.value = String(data?.error || '无法读取土地数据')
      return false
    }
    catch (cause: any) {
      if (sequence !== landRequestSequence)
        return false
      error.value = String(cause?.response?.data?.error || cause?.message || '无法读取土地数据，请稍后重试')
      return false
    }
    finally {
      if (sequence === landRequestSequence) {
        loaded.value = true
        loading.value = false
      }
    }
  }

  function resetLandState() {
    landRequestSequence++
    lands.value = []
    summary.value = {}
    loading.value = false
    loaded.value = false
    error.value = ''
  }

  async function fetchSeeds(accountId: string) {
    if (!accountId)
      return
    const { data } = await api.get('/api/seeds', {
      headers: { 'x-account-id': accountId },
    })
    if (data && data.ok)
      seeds.value = data.data || []
  }

  async function operate(accountId: string, opType: string) {
    if (!accountId)
      return
    await api.post('/api/farm/operate', { opType }, {
      headers: { 'x-account-id': accountId },
    })
    await fetchLands(accountId)
  }

  return { lands, summary, seeds, loading, loaded, error, fetchLands, resetLandState, fetchSeeds, operate }
})
