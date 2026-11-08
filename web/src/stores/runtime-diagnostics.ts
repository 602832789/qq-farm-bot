import { defineStore } from 'pinia'
import { ref } from 'vue'
import api, { getApiErrorMessage } from '@/api'

export interface DiagnosticsStatus {
  key: string
  label: string
  tone: string
}

export interface DiagnosticsSnapshot {
  generatedAt: number
  updatedAt: string
  windowMs: number
  status: DiagnosticsStatus
  queue: {
    current: number
    capacity: number
    running: number
    peak10m: number
    completed10m: number
    failed10m: number
    timeout10m: number
  }
  cpu: {
    avgPct: number
    peakPct: number
    cores: number
    label: string
  }
  heap: {
    currentMb: number
    peakMb: number
    series: number[]
    unit: string
  }
  loop: {
    p99Ms: number
    peakMs: number
    thresholdMs: number
    series: number[]
  }
  more: Record<string, any>
}

export const useRuntimeDiagnosticsStore = defineStore('runtime-diagnostics', () => {
  const snapshot = ref<DiagnosticsSnapshot | null>(null)
  const loading = ref(false)
  const error = ref('')
  let sequence = 0

  async function fetchDiagnostics() {
    const current = ++sequence
    loading.value = true
    try {
      const res = await api.get('/api/runtime-diagnostics', { skipErrorToast: true } as any)
      if (current !== sequence)
        return
      if (res.data?.ok && res.data?.data) {
        snapshot.value = res.data.data as DiagnosticsSnapshot
        error.value = ''
      }
      else {
        error.value = res.data?.error || '运行诊断数据读取失败'
      }
    }
    catch (e) {
      if (current !== sequence)
        return
      error.value = getApiErrorMessage(e, '运行诊断数据读取失败')
    }
    finally {
      if (current === sequence)
        loading.value = false
    }
  }

  return { snapshot, loading, error, fetchDiagnostics }
})
