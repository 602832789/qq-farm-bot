const test = require('node:test');
const assert = require('node:assert/strict');

const store = require('../src/models/store');
const { _test } = store;

test('hidden activity automation is always disabled', () => {
  const automation = Object.fromEntries(
    [..._test.HIDDEN_ACTIVITY_AUTOMATION_KEYS].map(key => [key, true])
  );

  _test.disableHiddenActivityAutomation(automation);

  for (const key of _test.HIDDEN_ACTIVITY_AUTOMATION_KEYS) {
    assert.equal(automation[key], false, `${key} should be disabled`);
  }
});

test('hidden activity defaults stay disabled', () => {
  const automation = store.getDefaultAccountConfig().automation;

  for (const key of _test.HIDDEN_ACTIVITY_AUTOMATION_KEYS) {
    assert.equal(automation[key], false, `${key} should default to disabled`);
  }
});
