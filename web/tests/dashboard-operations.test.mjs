import assert from 'node:assert/strict'
import test from 'node:test'
import { partitionOperations } from '../src/utils/dashboard-operations.ts'

test('partitionOperations: 主动作按次数降序，无记录收进 inactive', () => {
  const groups = partitionOperations({
    steal: 3,
    harvest: 0,
    water: 5,
    weed: 0,
  })
  assert.deepEqual(groups.active, [['water', 5], ['steal', 3]])
  assert.deepEqual(groups.inactive, [['harvest', 0], ['weed', 0]])
})

test('partitionOperations: 空输入返回两个空数组', () => {
  const groups = partitionOperations({})
  assert.deepEqual(groups.active, [])
  assert.deepEqual(groups.inactive, [])
})

test('partitionOperations: 非 number / 负值按无记录处理', () => {
  const groups = partitionOperations({ a: -1, b: 2 })
  assert.deepEqual(groups.active, [['b', 2]])
  assert.deepEqual(groups.inactive, [['a', -1]])
})
