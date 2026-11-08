const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const planting = readFileSync(path.join(__dirname, '../src/services/farm/planting.ts'), 'utf8');
const land = readFileSync(path.join(__dirname, '../src/services/farm/land-analysis.ts'), 'utf8');
const settings = readFileSync(path.join(__dirname, '../../web/src/components/settings/AccountFeatureSettings.vue'), 'utf8');

test('快成熟判定恢复为固定配置秒数（默认 300）', () => {
    assert.match(planting, /const smartSeconds = toNum\(automation\.fertilizer_smart_seconds\) \|\| 300;/);
    assert.match(planting, /getFastMatureLands\(latest && latest\.lands, smartSeconds\)/);
    assert.doesNotMatch(planting, /pickSmartMatureThreshold/);
    assert.doesNotMatch(planting, /SMART_MATURE_RANDOM_CAP_SEC/);
});

test('land-analysis 不再导出随机阈值工具', () => {
    assert.doesNotMatch(land, /SMART_MATURE_RANDOM_CAP_SEC/);
    assert.doesNotMatch(land, /pickSmartMatureThreshold/);
    assert.match(land, /function getFastMatureLands\(lands: any\[\], thresholdSec: number = 300\)/);
});

test('功能模块说明改回固定秒数', () => {
    assert.match(settings, /快成熟判定填的是固定秒数/);
    assert.doesNotMatch(settings, /随机上限/);
    assert.doesNotMatch(settings, /1 秒 ~ 设定值/);
});
