const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const SRC_DIR = path.resolve(__dirname, '../src');
const readSrc = file => fs.readFileSync(path.resolve(SRC_DIR, file), 'utf8');
const visitStrategy = readSrc('services/friend/visit-strategy.ts');
const scheduler = readSrc('services/friend/scheduler.ts');

/** 按顶格右花括号截出顶层函数体，避免把文件后面的代码算进来。 */
function topLevelBody(src, signature) {
    const start = src.indexOf(signature);
    assert.ok(start >= 0, `找不到 ${signature}`);
    const end = src.indexOf('\n}\n', start);
    assert.ok(end > start, `找不到 ${signature} 的函数结尾`);
    return src.slice(start, end + 2);
}

function walkTs(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walkTs(full);
        return entry.name.endsWith('.ts') ? [full] : [];
    });
}

// 回归：visitFriend 曾经在 options.allowXxx 之外又读一次 isAutomationOn 做 AND。
// 调用方 checkFriends 已经把全局开关与本地定向语义（onlyHelp/onlySteal/onlyBad，
// 语义是「忽略全局开关强制只做一件事」）算进 allowXxx；二次 AND 会把定向模式
// 静默掐回 false，直接返回 no_action —— 不发请求、不打日志，极难排查。
test('visitFriend 不再二次读分项开关，options 是唯一决策来源', () => {
    const body = topLevelBody(visitStrategy, 'export async function visitFriend(');
    assert.doesNotMatch(body, /isAutomationOn\('friend_steal'\)/);
    assert.doesNotMatch(body, /isAutomationOn\('friend_bad'\)/);
    assert.doesNotMatch(body, /isAutomationOn\('friend_help'\)/);

    // 经验上限与护主犬放行是调用方没算过的额外条件，必须继续留在被调方
    assert.match(body, /isAutomationOn\('friend_help_exp_limit'\)/);
    assert.match(body, /isAutomationOn\('friend_help_protect_dog_ignore_exp_limit'\)/);

    // 三个 allow 直接成为最终结论
    assert.match(body, /const stealEnabled: boolean = allowSteal;/);
    assert.match(body, /const badEnabled: boolean = allowBad;/);
    assert.match(body, /const helpEnabled: boolean = allowHelp && !helpBlockedByExpLimit;/);
    // 三件事都不做时连 Enter 都不发的省请求优化不能被改坏
    assert.match(body, /if \(!stealEnabled && !badEnabled && !helpEnabled\)/);
});

// 去掉内层判断后，visitFriend 的默认 options 是「三件事全做」。
// 新增调用点若不显式传 options，就等于绕过所有全局开关，因此用静态锁守住。
test('全仓所有 visitFriend 调用点都显式传齐三个 allowXxx', () => {
    const calls = [];
    for (const file of walkTs(SRC_DIR)) {
        const text = fs.readFileSync(file, 'utf8');
        let from = 0;
        let at = text.indexOf('visitFriend(', from);
        while (at !== -1) {
            from = at + 1;
            // 跳过函数声明本身
            if (!/function\s+$/.test(text.slice(Math.max(0, at - 30), at))) {
                calls.push({ file: path.relative(SRC_DIR, file), snippet: text.slice(at, at + 420) });
            }
            at = text.indexOf('visitFriend(', from);
        }
    }
    assert.ok(calls.length >= 2, `至少应有两个调用点，实得 ${calls.length}`);
    for (const call of calls) {
        for (const key of ['allowSteal', 'allowHelp', 'allowBad']) {
            assert.ok(call.snippet.includes(key), `${call.file} 的 visitFriend 调用缺少 ${key}`);
        }
    }
});

// 内层不再读开关后，「运行中关掉开关立即生效」必须由调度层承担，不能悄悄丢掉。
test('分项开关实时生效由调度层兜底', () => {
    const checkBody = topLevelBody(scheduler, 'export async function checkFriends(');
    assert.match(checkBody, /hasLiveFriendOp/);
    assert.match(checkBody, /isAutomationOn\('friend'\) && hasLiveFriendOp\(\)/);
    assert.match(checkBody, /onlyHelp \|\| onlySteal \|\| onlyBad/, '定向模式不能被全局开关掐掉');

    const stealBody = topLevelBody(scheduler, 'export async function runScheduledStealCheck(');
    const loopAt = stealBody.indexOf('for (const target of visitTargets)');
    const guardAt = stealBody.indexOf("!isAutomationOn('friend_steal')", loopAt);
    const callAt = stealBody.indexOf('visitFriend(', loopAt);
    assert.ok(loopAt > 0, '找不到偷菜访问循环');
    assert.ok(guardAt > loopAt, '循环内缺少实时开关复查');
    assert.ok(callAt > guardAt, '复查必须排在 visitFriend 之前');
});

// 抽真实源码片段执行，锁住定向语义本身（不是复制一份等价实现）。
test('定向语义：全局开关关着时 onlySteal 仍放行', () => {
    const start = scheduler.indexOf('    const effectiveHelpEnabled');
    assert.ok(start > 0, '找不到 effectiveXxx 计算块');
    const block = scheduler.slice(start, scheduler.indexOf('\n\n', start)).replace(/: boolean/g, '');
    // eslint-disable-next-line no-new-func
    const run = new Function(
        'onlyHelp', 'onlySteal', 'onlyBad', 'helpEnabled', 'stealEnabled', 'badEnabled',
        `${block}\nreturn { effectiveHelpEnabled, effectiveStealEnabled, effectiveBadEnabled };`,
    );

    const onlySteal = run(false, true, false, false, false, false);
    assert.equal(onlySteal.effectiveStealEnabled, true, 'onlySteal 必须忽略关闭的 friend_steal');
    assert.equal(onlySteal.effectiveHelpEnabled, false);
    assert.equal(onlySteal.effectiveBadEnabled, false);

    const onlyHelp = run(true, false, false, false, false, false);
    assert.equal(onlyHelp.effectiveHelpEnabled, true);
    assert.equal(onlyHelp.effectiveStealEnabled, false);
    assert.equal(onlyHelp.effectiveBadEnabled, false);

    const normal = run(false, false, false, true, false, true);
    assert.deepEqual(normal, {
        effectiveHelpEnabled: true,
        effectiveStealEnabled: false,
        effectiveBadEnabled: true,
    }, '非定向模式仍完全跟随全局开关');
});
