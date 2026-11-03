/**
 * 今日统计分区（移植自老版本 utils/dashboard-operations.ts）：
 * 有记录（>0）的主动作按次数降序展示，无记录的收进折叠区。
 */
export function partitionOperations(operations: Record<string, number>) {
  const entries = Object.entries(operations || {})
  return {
    active: entries.filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]),
    inactive: entries.filter(([, value]) => !(value > 0)),
  }
}
