const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { setLogHook, log, logWarn } = require('../dist/utils/utils');

/**
 * 日志面板显示的小标签由 module 决定（resolveModuleTag），不是 tag 参数。
 * 之前映射表里没有 ranch / 牧场，牧场日志就全部回落成「系统」——
 * 这里同时钉住映射与调用方，避免以后又悄悄退化。
 */
test('牧场日志的展示标签是「牧场」，不再回落成「系统」', () => {
    const seen = [];
    setLogHook((tag, msg, isWarn) => seen.push({ tag, msg, isWarn }));
    log('牧场', '领取牧场任务奖励');
    logWarn('牧场', '牧场巡查失败');
    setLogHook(() => {});
    assert.deepEqual(seen.map(item => item.tag), ['牧场', '牧场']);
});

test('牧场任务日志挂在 ranch 模块下', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/services/ranch/daily.ts'), 'utf8');
    assert.match(source, /module: 'ranch'/, '牧场任务/分享日志必须用 ranch 模块');
    assert.doesNotMatch(source, /module: 'task'/, '写成 task 会让标签变成「任务」');
});

test('日志模块标签表里登记了 ranch', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/utils/utils.ts'), 'utf8');
    assert.match(source, /ranch: '牧场'/, 'resolveModuleTag 缺少 ranch → 牧场 的映射');
    assert.match(source, /牧场: 'ranch'/, 'inferModuleFromTag 缺少 牧场 → ranch 的映射');
});
