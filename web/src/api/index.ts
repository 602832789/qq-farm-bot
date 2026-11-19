import { useStorage } from '@vueuse/core'
import axios from 'axios'
import { useToastStore } from '@/stores/toast'

const tokenRef = useStorage('admin_token', '')
const accountIdRef = useStorage('current_account_id', '')

const api = axios.create({
  baseURL: '/',
  // 前台请求现在不会因为网关自动任务额度被拒，但仍可能排在一条自动请求后面。
  // 10s 对「我的农场」这类要串几个网关请求的接口偏紧，放宽到 15s。
  timeout: 15000,
})

export function normalizeApiErrorMessage(raw: unknown): string {
  const text = String(raw || '').trim()
  if (!text)
    return ''

  // 取 `code=123` 之后的内容作为可读错误：捕获组连同前导空白一起拿到，
  // 下面统一 trim。这里刻意不用 `\s*(.*)$`——空白类与 `.*` 可交换字符，
  // 会引出多项式回溯（regexp/no-super-linear-backtracking）。
  const codeMatch = text.match(/\bcode=\d+\b([\s\S]*)$/)
  const codeIndex = codeMatch?.index ?? -1
  if (codeMatch?.[1] && codeIndex >= 0 && text.slice(0, codeIndex).includes('.'))
    return codeMatch[1].trim()
  return text
}

export function getApiErrorMessage(error: unknown, fallback = '请求失败'): string {
  const candidate = error as any
  const data = candidate?.response?.data
    || (candidate && typeof candidate === 'object' ? candidate : null)
  const raw = data?.errorMessage
    || data?.error
    || data?.message
    || candidate?.message
    || (typeof error === 'string' ? error : '')
  return normalizeApiErrorMessage(raw) || fallback
}

api.interceptors.request.use((config) => {
  const token = tokenRef.value
  if (token) {
    config.headers['x-admin-token'] = token
  }
  const accountId = accountIdRef.value
  if (accountId && !config.headers.has('x-account-id')) {
    config.headers.set('x-account-id', accountId)
  }
  return config
}, (error) => {
  return Promise.reject(error)
})

api.interceptors.response.use((response) => {
  const responseData = response?.data
  const skipToast = (response?.config as any)?.skipErrorToast
  if (responseData && typeof responseData === 'object' && responseData.ok === false) {
    const message = getApiErrorMessage(responseData, '')
    if (message) {
      responseData.error = message
      if (!skipToast)
        useToastStore().error(message)
    }
  }
  return response
}, (error) => {
  // Aborting an in-flight request is expected when a modal closes or a QR flow restarts.
  if (axios.isCancel(error) || error?.code === 'ERR_CANCELED')
    return Promise.reject(error)

  const toast = useToastStore()
  const normalizedMessage = getApiErrorMessage(error, '')
  if (normalizedMessage) {
    error.message = normalizedMessage
    if (error.response?.data && typeof error.response.data === 'object')
      error.response.data.error = normalizedMessage
  }

  // 支持 skipErrorToast 配置，让调用方自行处理错误
  const skipToast = error.config?.skipErrorToast

  if (error.response) {
    if (error.response.status === 401) {
      // Avoid redirect loop or multiple redirects
      if (!window.location.pathname.includes('/login')) {
        tokenRef.value = ''
        window.location.href = '/login'
        toast.warning('登录已过期，请重新登录')
      }
    }
    else if (error.response.status >= 500) {
      const backendError = getApiErrorMessage(error, '')
      // 后端运行态可预期错误：不弹全局500，交给页面状态处理
      if (backendError === '账号未运行' || backendError === 'API Timeout') {
        return Promise.reject(error)
      }
      if (!skipToast) {
        toast.error(backendError || '请求失败，请稍后重试')
      }
    }
    else {
      if (!skipToast) {
        toast.error(getApiErrorMessage(error, `请求失败，请联系管理员！`))
      }
    }
  }
  else if (error.request) {
    if (!skipToast) {
      toast.error('网络错误，无法连接到服务器')
    }
  }
  else {
    if (!skipToast) {
      toast.error(`错误: ${getApiErrorMessage(error, '请求失败')}`)
    }
  }

  return Promise.reject(error)
})

export default api
