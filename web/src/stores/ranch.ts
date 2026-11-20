import { defineStore } from 'pinia'
import { ref } from 'vue'
import api, { getApiErrorMessage } from '@/api'
import { createRequestGuard } from '@/utils/request-guard'

export type RanchView = 'animals' | 'facilities' | 'shop' | 'market' | 'bag' | 'tasks' | 'illustrated' | 'friends' | 'activities' | 'cans'
export interface RanchItem { id: number, name: string, count: string, image: string }
export interface RanchOperationResult {
  status: 'confirmed' | 'skipped'
  snapshot?: any
  notice?: string
  completed?: number
  bucketRemainingSeconds?: string
  autoProduced?: number
  autoProductionNotice?: string
  refreshRequired?: boolean
  sceneRestored?: boolean
}

export interface RanchQuote {
  action: string
  label: string
  costs: Array<{ resourceKey: string, amount: string }>
  costItems: RanchItem[]
  rewards: RanchItem[]
  expected: { signature: string }
  skipped: boolean
  count: number
  message?: string
}

export const useRanchStore = defineStore('ranch', () => {
  const state = ref<any>(null)
  const loading = ref(false)
  const busy = ref(false)
  const error = ref('')
  const notice = ref('')
  const receivedAt = ref(0)
  const guard = createRequestGuard()
  let owner = ''
  // 记录最近一次读取的页面参数，操作确认后按原视图刷新。
  let lastQuery: { accountId: string, view: RanchView, shopId?: number, hostGid?: string } | null = null
  const current = (id: string, ticket: ReturnType<typeof guard.snapshot>) => id === owner && !guard.isStale(ticket)
    && String(localStorage.getItem('current_account_id') || '') === id

  function reset(accountId = '') {
    guard.invalidate()
    owner = accountId
    lastQuery = null
    state.value = null
    loading.value = false
    busy.value = false
    error.value = ''
    notice.value = ''
  }

  async function load(accountId: string, view: RanchView, shopId?: number, hostGid?: string) {
    if (owner !== accountId)
      reset(accountId)
    const ticket = guard.next(accountId)
    lastQuery = { accountId, view, shopId, hostGid }
    loading.value = true
    error.value = ''
    try {
      const response = await api.get('/api/ranch', { params: { view, shopId, hostGid }, headers: { 'x-account-id': accountId }, timeout: 45000, skipErrorToast: true } as any)
      if (!response.data?.ok)
        throw new Error(response.data?.error || '牧场数据读取失败')
      if (current(accountId, ticket)) {
        state.value = response.data.data
        receivedAt.value = Date.now()
      }
    }
    catch (cause) {
      if (current(accountId, ticket))
        error.value = getApiErrorMessage(cause, '牧场数据读取失败')
    }
    finally {
      if (current(accountId, ticket))
        loading.value = false
    }
  }

  async function reload(accountId: string) {
    const query = lastQuery
    if (query && query.accountId === accountId)
      await load(query.accountId, query.view, query.shopId, query.hostGid)
  }

  async function quote(accountId: string, action: string, input: Record<string, unknown>): Promise<RanchQuote | null> {
    if (busy.value || loading.value || owner !== accountId)
      return null
    const ticket = guard.snapshot(accountId)
    busy.value = true
    error.value = ''
    notice.value = ''
    try {
      const response = await api.post(`/api/ranch/${action}/quote`, input, { headers: { 'x-account-id': accountId }, timeout: 45000, skipErrorToast: true } as any)
      if (!response.data?.ok)
        throw new Error(response.data?.error || '操作条件读取失败')
      return current(accountId, ticket) ? response.data.data : null
    }
    catch (cause) {
      if (current(accountId, ticket))
        error.value = getApiErrorMessage(cause, '操作条件读取失败')
      return null
    }
    finally {
      if (current(accountId, ticket))
        busy.value = false
    }
  }

  /** quiet：后台上报类操作只确认结果，不弹出完成提示。 */
  async function submit(accountId: string, action: string, input: Record<string, unknown>, confirmation: { expected: RanchQuote['expected'] } | { direct: true }, options: { quiet?: boolean } = {}): Promise<RanchOperationResult | null> {
    if (busy.value || owner !== accountId)
      return null
    const ticket = guard.snapshot(accountId)
    busy.value = true
    error.value = ''
    notice.value = ''
    try {
      const response = await api.post(`/api/ranch/${action}`, { ...input, ...confirmation }, { headers: { 'x-account-id': accountId }, timeout: 45000, skipErrorToast: true } as any)
      if (!response.data?.ok)
        throw new Error(response.data?.error || '牧场操作未完成')
      if (!current(accountId, ticket))
        return null
      const result: RanchOperationResult = response.data.data
      if (result.snapshot) {
        state.value = { ...state.value, ...result.snapshot }
        receivedAt.value = Date.now()
      }
      if (!options.quiet)
        notice.value = result.notice || (result.status === 'skipped' ? '当前没有可操作项目' : '操作完成')
      return result
    }
    catch (cause) {
      if (current(accountId, ticket))
        error.value = getApiErrorMessage(cause, '牧场操作未完成，请刷新核对')
      return null
    }
    finally {
      if (current(accountId, ticket))
        busy.value = false
    }
  }

  /** 与上游 execute 同名的布尔包装：老页面只需 true/false。 */
  async function execute(accountId: string, action: string, input: Record<string, unknown>, expected: RanchQuote['expected'], options: { quiet?: boolean } = {}) {
    return !!(await submit(accountId, action, input, { expected }, options))
  }

  return { state, loading, busy, error, notice, receivedAt, load, reload, quote, execute, submit, reset }
})
