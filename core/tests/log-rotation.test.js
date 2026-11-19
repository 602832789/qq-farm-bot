const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SRC = path.resolve(__dirname, '../src/services/logger.ts');
const loggerSrc = fs.readFileSync(SRC, 'utf8');
const { trimLogsIfOversize, parsePositiveInt } = require('../dist/services/logger');

function tempLogDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-logs-'));
    return dir;
}

test('不使用 winston 的 maxsize 轮转（实测会写出 0 字节空文件）', () => {
    // 实测 winston 3.19 + Node 20：maxsize / maxsize+maxFiles / maxsize+tailable
    // 三种组合落盘的文件都是 0 字节，启用等于静默丢日志。这条断言把它锁死，
    // 免得以后有人「顺手」加回 maxsize。
    assert.doesNotMatch(loggerSrc, /maxsize\s*:/, 'maxsize 会让日志写不进去');
    assert.doesNotMatch(loggerSrc, /tailable\s*:/, 'tailable 依赖 maxsize，一并禁用');
});

test('日志体积上限可配置，非法输入回落默认值', () => {
    assert.match(loggerSrc, /LOG_MAX_SIZE_MB/, '上限可用环境变量覆盖');
    assert.match(loggerSrc, /startLogSizeGuard\(logDir, maxSizeMb \* 1024 \* 1024\)/, '上限要真的传进守卫');
    // 环境变量是脏输入：NaN / 0 / 负数必须回落到默认值，否则守卫等于没开
    assert.equal(parsePositiveInt(undefined, 100), 100);
    assert.equal(parsePositiveInt('abc', 100), 100);
    assert.equal(parsePositiveInt('0', 100), 100);
    assert.equal(parsePositiveInt('-5', 100), 100);
    assert.equal(parsePositiveInt('64', 100), 64);
    assert.equal(parsePositiveInt('64.9', 100), 64);
});

test('定时器不阻塞进程退出', () => {
    assert.match(loggerSrc, /LOG_TRIM_INTERVAL_MS/, '要有检查间隔常量');
    assert.match(loggerSrc, /\.unref\(\)/, '定时器必须 unref，否则测试/CLI 退不出');
});

test('超限文件被截断，未超限的保持原样', () => {
    const dir = tempLogDir();
    const combined = path.join(dir, 'combined.log');
    const error = path.join(dir, 'error.log');
    fs.writeFileSync(combined, 'x'.repeat(500));
    fs.writeFileSync(error, 'y'.repeat(10));

    const trimmed = trimLogsIfOversize(dir, 100);
    assert.deepEqual(trimmed, ['combined.log'], '只截断超限的那个');
    assert.equal(fs.statSync(combined).size, 0, 'combined.log 被清空');
    assert.equal(fs.statSync(error).size, 10, 'error.log 原样保留');
});

test('文件不存在时不抛错（首次部署日志目录还是空的）', () => {
    const dir = tempLogDir();
    assert.deepEqual(trimLogsIfOversize(dir, 100), []);
});

test('恰好等于上限时不截断', () => {
    const dir = tempLogDir();
    const combined = path.join(dir, 'combined.log');
    fs.writeFileSync(combined, 'z'.repeat(100));
    assert.deepEqual(trimLogsIfOversize(dir, 100), []);
    assert.equal(fs.statSync(combined).size, 100);
});
