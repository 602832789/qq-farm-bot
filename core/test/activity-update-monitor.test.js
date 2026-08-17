const assert = require('node:assert/strict');
const test = require('node:test');
const { analyzeReport } = require('../src/services/activity-update-monitor');

test('活动更新自动分析会按日期归类候选活动', () => {
  const result = analyzeReport({
    source: { version: 'new' },
    unknownActivityIds: [2026081802, 2026081800, 2026081900],
  }, { source: { version: 'old' } });
  assert.equal(result.sourceChanged, true);
  assert.deepEqual(result.analysis.candidateGroups, [
    { date: '20260818', ids: [2026081802, 2026081800] },
    { date: '20260819', ids: [2026081900] },
  ]);
  assert.equal(result.analysis.requiresProtocolSample, true);
  assert.equal(result.analysis.safeToAutoApply, false);
});
