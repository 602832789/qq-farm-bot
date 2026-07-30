const assert = require('node:assert/strict');
const test = require('node:test');

const { buildGrowthTasks } = require('../src/services/task');

test('growth tasks prefer the dedicated growth_tasks field', () => {
  const dedicated = [{ id: 1, task_type: 1 }];
  const merged = [{ id: 2, task_type: 1 }];

  assert.deepEqual(buildGrowthTasks({
    growth_tasks: dedicated,
    tasks: merged,
  }), dedicated);
});

test('growth tasks fall back to type 1 entries in the merged tasks field', () => {
  const growth = { id: 11, task_type: 1 };
  const daily = { id: 12, task_type: 3 };
  const other = { id: 13, task_type: 2 };

  assert.deepEqual(buildGrowthTasks({
    growth_tasks: [],
    tasks: [daily, growth, other],
  }), [growth]);
});

test('growth tasks tolerate a missing task payload', () => {
  assert.deepEqual(buildGrowthTasks(null), []);
  assert.deepEqual(buildGrowthTasks({}), []);
});
