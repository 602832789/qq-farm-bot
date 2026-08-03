const assert = require('node:assert/strict');
const test = require('node:test');

const { buildGrowthTasks, summarizeDailyTaskProgress } = require('../src/services/task');

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

test('an empty daily task list is not treated as completed', () => {
  assert.deepEqual(summarizeDailyTaskProgress([]), {
    doneToday: false,
    completedCount: 0,
    totalCount: 3,
  });
});

test('daily task progress uses the number of visible tasks up to three', () => {
  assert.deepEqual(summarizeDailyTaskProgress([
    { progress: 1, total_progress: 1 },
    { progress: 2, total_progress: 2 },
  ]), {
    doneToday: true,
    completedCount: 2,
    totalCount: 2,
  });
});

test('daily task progress stays incomplete while a visible task is unfinished', () => {
  assert.deepEqual(summarizeDailyTaskProgress([
    { progress: 1, total_progress: 1 },
    { progress: 0, total_progress: 2 },
    { progress: 3, total_progress: 3 },
  ]), {
    doneToday: false,
    completedCount: 2,
    totalCount: 3,
  });
});
