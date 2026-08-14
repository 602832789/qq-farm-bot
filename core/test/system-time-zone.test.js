const assert = require('node:assert/strict');
const test = require('node:test');

const {
    DEFAULT_TIME_ZONE,
    CONFIG,
    getTimeZoneOptions,
    normalizeTimeZone,
    updateRuntimeConfig,
} = require('../dist/config/config');
const {
    formatDateKeyInTimeZone,
    formatSystemDateTime24,
    getSystemClockMinutes,
    getSystemDateKey,
} = require('../dist/utils/utils');

test.after(() => {
    updateRuntimeConfig({ timeZone: DEFAULT_TIME_ZONE });
});

test('defaults to the Beijing/Shanghai time zone and exposes it in the selector', () => {
    assert.equal(DEFAULT_TIME_ZONE, 'Asia/Shanghai');
    assert.equal(CONFIG.timeZone, 'Asia/Shanghai');
    assert.ok(getTimeZoneOptions().some(option => option.value === 'Asia/Shanghai'));
    assert.equal(normalizeTimeZone('invalid/time-zone'), 'Asia/Shanghai');
});

test('date keys cross at midnight in the configured IANA time zone', () => {
    const beforeBeijingMidnight = Date.parse('2026-08-14T15:59:59.999Z');
    const atBeijingMidnight = Date.parse('2026-08-14T16:00:00.000Z');

    assert.equal(formatDateKeyInTimeZone(beforeBeijingMidnight, 'Asia/Shanghai'), '2026-08-14');
    assert.equal(formatDateKeyInTimeZone(atBeijingMidnight, 'Asia/Shanghai'), '2026-08-15');
    assert.equal(formatDateKeyInTimeZone(atBeijingMidnight, 'UTC'), '2026-08-14');
});

test('daily keys, quiet-hour clock and log timestamps use the live system setting', () => {
    const instant = Date.parse('2026-08-14T16:05:06.000Z');

    updateRuntimeConfig({ timeZone: 'UTC' });
    assert.equal(getSystemDateKey(instant), '2026-08-14');
    assert.equal(getSystemClockMinutes(instant), 16 * 60 + 5);
    assert.equal(formatSystemDateTime24(instant), '2026-08-14 16:05:06');

    updateRuntimeConfig({ timeZone: 'Asia/Shanghai' });
    assert.equal(getSystemDateKey(instant), '2026-08-15');
    assert.equal(getSystemClockMinutes(instant), 5);
    assert.equal(formatSystemDateTime24(instant), '2026-08-15 00:05:06');
});
