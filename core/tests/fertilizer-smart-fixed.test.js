const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

function read(rel) {
    return readFileSync(path.join(__dirname, rel), 'utf8');
}

const planting = read('../src/services/farm/planting.ts');
const land = read('../src/services/farm/land-analysis.ts');
const sharedState = read('../src/models/store/shared-state.ts');
const accountConfig = read('../src/models/store/account-config.ts');
const settings = read('../../web/src/components/settings/AccountFeatureSettings.vue');
const settingsView = read('../../web/src/views/Settings.vue');

test('快成熟判定使用固定配置秒数，默认值恢复为 300 秒', () => {
    assert.match(planting, /const smartSeconds = toNum\(automation\.fertilizer_smart_seconds\) \|\| 300;/);
    assert.match(planting, /getFastMatureLands\(latest && latest\.lands, smartSeconds\)/);
    assert.match(planting, /默认 300/);
    assert.doesNotMatch(planting, /fertilizer_smart_seconds\) \|\| 60/);
    assert.doesNotMatch(planting, /pickSmartMatureThreshold/);
    assert.doesNotMatch(planting, /SMART_MATURE_RANDOM_CAP_SEC/);
});

test('后端配置默认值与 clamp 回退值恢复为 300 秒', () => {
    assert.match(sharedState, /fertilizer_smart_seconds: 300,/);
    assert.match(sharedState, /Number\(v\) \|\| 300\)/);
    assert.match(accountConfig, /Number\(v\) \|\| 300\)/);
    assert.doesNotMatch(sharedState, /fertilizer_smart_seconds: 60,/);
    assert.doesNotMatch(accountConfig, /Number\(v\) \|\| 60\)/);
});

test('land-analysis 默认阈值与兜底均为 300 且不再导出随机阈值工具', () => {
    assert.doesNotMatch(land, /SMART_MATURE_RANDOM_CAP_SEC/);
    assert.doesNotMatch(land, /pickSmartMatureThreshold/);
    assert.match(land, /function getFastMatureLands\(lands: any\[\], thresholdSec: number = 300\)/);
    assert.match(land, /toNum\(thresholdSec\) \|\| 300/);
});

test('前端默认值与说明恢复为 300 秒', () => {
    assert.equal((settingsView.match(/fertilizer_smart_seconds: 300,/g) || []).length, 3);
    assert.match(settingsView, /fertilizer_smart_seconds = 300/);
    assert.match(settings, /fertilizer_smart_seconds \?\? 300/);
    assert.match(settings, /默认 300 秒/);
    assert.match(settings, /快成熟判定填的是固定秒数/);
    assert.match(settings, /模拟显示常规巡查负载下/);
    assert.match(settings, /旧账号若手动改过 60 秒，请改回 300 秒/);
    assert.doesNotMatch(settings, /默认 \/ 推荐 60 秒/);
    assert.doesNotMatch(settings, /默认 60 秒/);
    assert.doesNotMatch(settings, /随机上限/);
    assert.doesNotMatch(settings, /1 秒 ~ 设定值/);
});
