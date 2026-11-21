const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

/**
 * worker.ts 里所有相对 require 必须能解析到真实模块。
 *
 * 现场故障：牧歌自动任务里写了 require('./automation-lock')，但 worker 在
 * core/ 目录下、automation-lock 在 services/ 下，运行到该分支才报
 * "Cannot find module './automation-lock'"。这类错误编译期不报、单测也覆盖不到，
 * 只有跑起来才炸，所以用静态扫描兜底。
 */
function requirePaths(source) {
    // 去掉行注释与块注释，避免把注释里的示例路径当成真实引用。
    const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map(line => line.replace(/\/\/.*$/, ''))
        .join('\n');
    return [...code.matchAll(/require\('(\.[^']+)'\)/g)].map(match => match[1]);
}

test('worker.ts 的相对 require 路径全部可解析', () => {
    const file = path.join(__dirname, '..', 'src', 'core', 'worker.ts');
    const source = fs.readFileSync(file, 'utf8');
    const base = path.dirname(file);
    const missing = [];
    for (const relative of requirePaths(source)) {
        const target = path.resolve(base, relative);
        const candidates = [target, `${target}.ts`, `${target}.js`, path.join(target, 'index.ts'), path.join(target, 'index.js')];
        if (!candidates.some(candidate => fs.existsSync(candidate)))
            missing.push(relative);
    }
    assert.deepEqual(missing, [], `worker.ts 引用了不存在的模块：${missing.join('、')}`);
});
