const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const CORE = path.join(ROOT, 'src/utils/hour-of-day.ts');
const WEB = path.join(ROOT, '../web/src/utils/hour-of-day.ts');

function load(file) {
    const source = fs.readFileSync(file, 'utf8');
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const module = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function('exports', 'module', outputText)(module.exports, module);
    return { exports: module.exports, source };
}

// 后端校验与前端输入框各有一份 hour-of-day，改一边忘另一边就会出现
// 「前端标红拒绝、后端却收下」这类错位，这里把两份的行为钉在一起。
const core = load(CORE);
const web = load(WEB);

const INPUTS = [
    // 合法：0 点（午夜）不能被当成假值丢掉，23 是上界。
    0, 1, 9, 10, 22, 23,
    '0', '1', '9', '10', '22', '23',
    // 前导零：后端归一后仍是同一个整点。
    '00', '010', '023',
    // 越界与小数。
    -1, 24, 100, -0.5, 1.5, 10.5, '10.5', '24', '99',
    // 脏字符串：不 trim、不截断尾随字符、不接受科学计数与十六进制。
    '', ' ', '  10', '10 ', '10时', '10abc', 'abc', '1e1', '0x10', '+10',
    // 空值与错误类型。
    null, undefined, true, false, [], [10], {}, Number.NaN, Number.POSITIVE_INFINITY,
];

test('core 与 web 两份 parseHourOfDay 对同一批输入判定完全一致', () => {
    for (const input of INPUTS) {
        const label = `${typeof input} ${JSON.stringify(input) ?? String(input)}`;
        assert.equal(
            core.exports.parseHourOfDay(input),
            web.exports.parseHourOfDay(input),
            `core 与 web 对 ${label} 判定不同：改了其中一份就要同步另一份`,
        );
    }
});

test('parseHourOfDay 只放行 0–23 的整数，其余一律返回 null', () => {
    // 显式列出这批输入里应当被接受的条目，剩下的全部按拒绝处理。
    const accepted = new Map([
        [0, 0], ['0', 0], ['00', 0],
        [1, 1], ['1', 1],
        [9, 9], ['9', 9],
        [10, 10], ['10', 10], ['010', 10],
        [22, 22], ['22', 22],
        [23, 23], ['23', 23], ['023', 23],
    ]);
    for (const input of INPUTS) {
        const expected = accepted.has(input) ? accepted.get(input) : null;
        assert.equal(core.exports.parseHourOfDay(input), expected, `core 对 ${String(input)} 判定不对`);
        assert.equal(web.exports.parseHourOfDay(input), expected, `web 对 ${String(input)} 判定不对`);
    }
});

test('两份 parseHourOfDay 源码除排版外一致，防止各自长出新分支', () => {
    const pick = (source) => {
        const start = source.indexOf('function parseHourOfDay');
        assert.ok(start >= 0, '找不到 parseHourOfDay');
        const end = source.indexOf('\n}', start);
        assert.ok(end > start, 'parseHourOfDay 的函数体没有正常闭合');
        return source.slice(start, end + 2);
    };
    // core 用分号、web 不用，缩进也不同，只比较去掉空白与分号后的骨架。
    const normalize = (source) => pick(source).replace(/export\s+/g, '').replace(/[\s;]+/g, '');
    assert.equal(normalize(core.source), normalize(web.source));
});

test('只有 core 提供 assertEmailClaimHour，非法值抛 INVALID_CONFIG', () => {
    const { assertEmailClaimHour } = core.exports;
    assert.equal(typeof assertEmailClaimHour, 'function');
    assert.equal(web.exports.assertEmailClaimHour, undefined, 'web 侧不该有抛错版本，输入框只做标红');

    for (const hour of [0, 10, 23, '0', '10', '023'])
        assert.equal(assertEmailClaimHour(hour), Number(hour));

    for (const bad of ['', ' ', '24', '10.5', null, undefined, [], {}]) {
        assert.throws(
            () => assertEmailClaimHour(bad),
            (error) => {
                assert.equal(error.code, 'INVALID_CONFIG');
                assert.match(error.message, /0–23/);
                return true;
            },
            `应拒绝 ${String(bad)}`,
        );
    }
});
