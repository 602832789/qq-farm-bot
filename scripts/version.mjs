#!/usr/bin/env node
/**
 * 版本号管理（单一真源：仓库根 version.json）
 *
 * 规则：
 *   - 版本号采用 MAJOR.MINOR.PATCH，并额外记录累计「更新次数」build。
 *   - 每次更新提交后自动递增：新增功能 -> MINOR+1、PATCH 归零；
 *     修复 / 优化 / 回滚 -> PATCH+1；重大不兼容变更 -> MAJOR+1（--type major）。
 *     无论哪种类型，build（更新次数）每次都 +1。
 *   - 全量重排起点：历史最早一条记录固定为 v3.0.0 · 第 1 次更新（见 BASELINE_META）。
 *   - 数字 4 规避：版本号的 MAJOR/MINOR/PATCH 三段与更新次数 build，
 *     十进制表示里任意位置出现 4 就自动跳到下一个不含 4 的整数
 *     （4→5、14→15、39→50、399→500），界面与日志里不再出现 4。
 *   - 同步写回根 / core / web 三个 package.json 的 version 字段。
 *   - 更新日志 docs/CHANGELOG.md：顶部「版本总览」表每次加一行，
 *     最新一条详细记录标题自动带上「vX.Y.Z（#N）」。
 *
 * 用法：
 *   node scripts/version.mjs show
 *   node scripts/version.mjs bump --message "新增版本号功能" [--type minor] [--dry-run]
 *   node scripts/version.mjs bump --from-commit --auto-commit   # 供 post-commit hook 使用
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const DEFAULT_ROOT = resolve(dirname(SCRIPT_PATH), '..');

export const VERSION_FILES = [
    'version.json',
    'package.json',
    'core/package.json',
    'web/package.json',
    'web/version.json',
    'docs/CHANGELOG.md',
];

export const VERSION_RULES_NOTE = [
    '> **版本号规则**：采用 `MAJOR.MINOR.PATCH`，每次更新提交后自动递增 —— 新增功能 → `MINOR` 进 1、`PATCH` 归零；修复 / 优化 / 回滚 → `PATCH` 进 1；重大不兼容变更 → `MAJOR` 进 1（手动 `--type major`）。',
    '> **跳过数字 4**：版本号三段与更新序号在递增时，只要十进制表示任意位置含 `4` 就继续跳到下一个不含 `4` 的整数（`4 → 5`、`14 → 15`、`39 → 50`）。',
    '> **全量重排**：全部历史记录已按时间正序重新编号，以 `v3.0.0 · 第 1 次更新` 为起点；此前 `v2.x` / `v2.9.x` 等旧版本序列的对应关系已作废，一律以本表为准。详细记录正文里提到的旧版本号属于当时的叙述，同样已作废。',
    '> **更新序号**：累计更新次数，每次提交无条件 +1（遇到含 `4` 的序号自动跳过）；所有详细记录都带版本号与更新序号。',
    '> 版本号由 `version.json` 统一维护，可用 `pnpm version:bump` 手动递增，安装 `pnpm hooks:install` 后每次提交自动递增；提交前手动递增的首条记录没有提交号（显示 `—`），由 hook 自动递增的记录会带上对应提交号。',
].join('\n');

/** 全量重排的初始版本：历史最早一条记录固定为 v3.0.0 · 第 1 次更新。 */
export const BASELINE_META = Object.freeze({
    major: 3,
    minor: 0,
    patch: 0,
    version: '3.0.0',
});

const DEFAULT_META = {
    ...BASELINE_META,
    build: 0,
    updatedAt: '2026-08-03',
    lastCommit: '',
    history: [],
};

/** 按更新内容判定递增类型：内容决定跨度，次数由 build 单独累计。 */
export function classifyUpdate(message = '') {
    const text = String(message || '').toLowerCase();
    if (/\bbreaking\b|重大变更|不兼容|架构重构/.test(text)) return 'major';
    if (/\bfeat\b|新增|新功能|新模块|首次|上线|接入|移植|实现|支持/.test(text)) return 'minor';
    return 'patch';
}

/** 需要规避的数字：十进制表示中任意位置出现 4 都要避开。 */
export const SKIPPED_DIGIT = '4';

export function containsSkippedDigit(value) {
    return String(value ?? '').includes(SKIPPED_DIGIT);
}

/** 返回 >= value 的最小不含 4 的整数：4→5、14→15、39→50、399→500。 */
export function nextAllowedNumber(value) {
    let n = Math.max(0, Math.trunc(Number(value) || 0));
    while (containsSkippedDigit(n)) n += 1;
    return n;
}

/** 计算下一个版本号；type 支持 major / minor / patch，其余按 patch 处理。 */
export function bumpVersion(current, type = 'patch') {
    const major = Number(current?.major) || 0;
    const minor = Number(current?.minor) || 0;
    const patch = Number(current?.patch) || 0;
    const build = Number(current?.build) || 0;
    let nextMajor = major;
    let nextMinor = minor;
    let nextPatch = patch;
    if (type === 'major') {
        nextMajor += 1;
        nextMinor = 0;
        nextPatch = 0;
    }
    else if (type === 'minor') {
        nextMinor += 1;
        nextPatch = 0;
    }
    else {
        nextPatch += 1;
    }
    // 三段与更新序号统一跳过含 4 的数字：归零的段本身合法（0 不含 4），
    // 历史 / 手工写入的含 4 段也会在这里被修正，保证输出版本号与序号都不含 4。
    nextMajor = nextAllowedNumber(nextMajor);
    nextMinor = nextAllowedNumber(nextMinor);
    nextPatch = nextAllowedNumber(nextPatch);
    const nextBuild = nextAllowedNumber(build + 1);
    return {
        major: nextMajor,
        minor: nextMinor,
        patch: nextPatch,
        build: nextBuild,
        version: `${nextMajor}.${nextMinor}.${nextPatch}`,
    };
}

/** 界面显示用完整版本标签。 */
export function versionLabel(meta) {
    return `v${meta.version} · 第 ${meta.build} 次更新`;
}

/** 生成 web 目录内的版本镜像：Docker 只 COPY web/ 时也能读到版本号与更新次数。 */
export function renderWebVersionMeta(meta = {}) {
    const version = String(meta?.version || '0.0.0');
    const build = Number(meta?.build) || 0;
    return {
        version,
        build,
        label: versionLabel({ version, build }),
        updatedAt: meta?.updatedAt || null,
        source: 'version.json',
    };
}

/** 更新日志标题 / 表格里用的紧凑标记。 */
export function changelogTag(meta) {
    return `v${meta.version}（#${meta.build}）`;
}

export function formatDate(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function escapeCell(text) {
    return String(text ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

/** 由 history 渲染完整的「版本总览」段（最新在最前）。 */
export function renderVersionSection(history = []) {
    const rows = history.map((item) => {
        const build = item.build ? `#${item.build}` : '历史';
        const commit = item.commit && item.commit !== '—' ? `\`${escapeCell(item.commit)}\`` : '—';
        return `| v${escapeCell(item.version)} | ${build} | ${escapeCell(item.date)} | ${escapeCell(item.summary)} | ${commit} |`;
    });
    return [
        '## 版本总览',
        '',
        VERSION_RULES_NOTE,
        '',
        '| 版本 | 更新序号 | 日期 | 更新内容 | 提交 |',
        '| --- | --- | --- | --- | --- |',
        ...rows,
        '',
    ].join('\n');
}

/** 替换（或新建）CHANGELOG 顶部的「版本总览」段，重复执行结果一致。 */
export function upsertVersionSection(markdown, section) {
    const lines = String(markdown).split('\n');
    const start = lines.findIndex(line => /^##\s+版本总览\s*$/.test(line));
    const block = section.replace(/\n+$/, '').split('\n');
    if (start >= 0) {
        let end = lines.length;
        for (let i = start + 1; i < lines.length; i++) {
            if (/^##\s+/.test(lines[i])) {
                end = i;
                break;
            }
        }
        lines.splice(start, end - start, ...block, '');
    }
    else {
        const insertAt = lines.findIndex(line => /^##\s+/.test(line));
        lines.splice(insertAt < 0 ? lines.length : insertAt, 0, ...block, '');
    }
    return lines.join('\n');
}

/** 去掉标题里的日期与版本标记，得到纯摘要。 */
export function summarizeTitle(title) {
    return String(title || '')
        .replace(/^#+\s*/, '')
        .replace(/^\d{4}-\d{2}-\d{2}\s*·\s*/, '')
        .replace(/v\d+\.\d+\.\d+（#\d+）\s*·\s*/, '')
        .replace(/v\d+\.\d+\.\d+\s*·\s*/, '')
        .trim();
}

/** 给「详细记录」里最新一条未带版本号的标题打上本次版本标记。 */
export function markLatestChangelogTitle(markdown, tag) {
    const lines = String(markdown).split('\n');
    const recordIdx = lines.findIndex(line => /^##\s+详细记录/.test(line));
    const start = recordIdx >= 0 ? recordIdx + 1 : 0;
    for (let i = start; i < lines.length; i++) {
        if (!/^###\s/.test(lines[i])) continue;
        // 只认「标题开头的版本标记」。标题描述里提到旧版本号（例如
        // 「补修 v3.17.1 引入的回归」）不能算已打标，否则 hook 会跳过本次标记，
        // 让这条记录永远缺 vX.Y.Z（#N），web 的版本接线断言随之失败。
        if (/^###\s+(?:\d{4}-\d{2}-\d{2}\s*·\s*)?v\d+\.\d+\.\d+/.test(lines[i])) return lines.join('\n');
        if (/^###\s+\d{4}-\d{2}-\d{2}\s*·\s*/.test(lines[i])) {
            lines[i] = lines[i].replace(/^(###\s+\d{4}-\d{2}-\d{2}\s*·\s*)/, `$1${tag} · `);
        }
        else {
            lines[i] = lines[i].replace(/^(###\s+)/, `$1${tag} · `);
        }
        return lines.join('\n');
    }
    return lines.join('\n');
}

function readJson(file, fallback = null) {
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    }
    catch {
        return fallback;
    }
}

function writeJson(file, data) {
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function git(root, args) {
    try {
        return execFileSync('git', args, {
            cwd: root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    }
    catch {
        return '';
    }
}

/** 收集本次更新摘要：显式 message > 最新提交 > CHANGELOG 最新未标记标题。 */
export function collectSummary(root, opts = {}) {
    if (opts.message) return String(opts.message).trim();
    const changelogPath = join(root, 'docs/CHANGELOG.md');
    const changelog = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : '';
    if (opts.fromCommit) {
        const subject = git(root, ['log', '-1', '--pretty=%s']);
        if (subject) return subject;
    }
    const lines = changelog.split('\n');
    const recordIdx = lines.findIndex(line => /^##\s+详细记录/.test(line));
    const start = recordIdx >= 0 ? recordIdx + 1 : 0;
    for (let i = start; i < lines.length; i++) {
        if (!/^###\s/.test(lines[i])) continue;
        if (/v\d+\.\d+\.\d+/.test(lines[i])) break;
        return summarizeTitle(lines[i]);
    }
    return '常规更新';
}

/** 执行一次版本递增；dryRun 时只计算、不落盘。 */
export function bump(root = DEFAULT_ROOT, opts = {}) {
    const versionPath = join(root, 'version.json');
    const current = readJson(versionPath, DEFAULT_META) || DEFAULT_META;
    const summary = collectSummary(root, opts);
    const type = opts.type || classifyUpdate(summary);
    const next = bumpVersion(current, type);
    const date = opts.date || formatDate();
    const commit = opts.commit || git(root, ['rev-parse', '--short', 'HEAD']) || '—';
    const entry = {
        version: next.version,
        build: next.build,
        date,
        summary,
        commit,
        type,
    };
    const history = [
        entry,
        ...(Array.isArray(current.history) ? current.history : []).filter(
            item => !(item.version === next.version && item.build === next.build),
        ),
    ];
    const meta = {
        ...next,
        updatedAt: new Date().toISOString(),
        lastCommit: commit,
        history,
    };

    const changelogPath = join(root, 'docs/CHANGELOG.md');
    const originalChangelog = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : '# 更新日志\n';
    const changelog = upsertVersionSection(
        markLatestChangelogTitle(originalChangelog, changelogTag(meta)),
        renderVersionSection(history),
    );

    const result = {
        meta,
        summary,
        type,
        label: versionLabel(meta),
        tag: changelogTag(meta),
        files: VERSION_FILES,
        dryRun: !!opts.dryRun,
    };
    if (opts.dryRun) return result;

    writeJson(versionPath, meta);
    for (const file of ['package.json', 'core/package.json', 'web/package.json']) {
        const path = join(root, file);
        const pkg = readJson(path);
        if (!pkg) continue;
        pkg.version = next.version;
        writeJson(path, pkg);
    }
    writeFileSync(changelogPath, changelog, 'utf8');
    // web/ 目录内保留一份镜像：容器构建只 COPY web/ 时也不会丢掉更新次数。
    const webDir = join(root, 'web');
    if (existsSync(webDir)) {
        writeJson(join(webDir, 'version.json'), renderWebVersionMeta(meta));
    }

    if (opts.autoCommit) {
        const changed = VERSION_FILES.filter(file => existsSync(join(root, file)));
        git(root, ['add', '--', ...changed]);
        git(root, ['commit', '-m', `chore(version): ${versionLabel(meta)}`]);
    }
    return result;
}

function parseArgs(argv) {
    const opts = {};
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--message' || arg === '--type' || arg === '--root' || arg === '--date' || arg === '--commit') {
            opts[arg.slice(2)] = argv[++i] ?? '';
        }
        else if (arg === '--dry-run') opts.dryRun = true;
        else if (arg === '--auto-commit') opts.autoCommit = true;
        else if (arg === '--from-commit') opts.fromCommit = true;
        else positional.push(arg);
    }
    return { command: positional[0] || 'show', opts };
}

function main() {
    const { command, opts } = parseArgs(process.argv.slice(2));
    const root = resolve(opts.root || DEFAULT_ROOT);
    if (command === 'show') {
        const meta = readJson(join(root, 'version.json'), DEFAULT_META);
        process.stdout.write(`${versionLabel(meta)}\n`);
        return;
    }
    if (command !== 'bump') {
        process.stderr.write(`未知命令：${command}\n`);
        process.exitCode = 1;
        return;
    }
    const result = bump(root, opts);
    process.stdout.write(`${result.dryRun ? '[dry-run] ' : ''}${result.label} · ${result.type} · ${result.summary}\n`);
    if (result.dryRun) {
        process.stdout.write(`${JSON.stringify({ version: result.meta.version, build: result.meta.build, tag: result.tag }, null, 2)}\n`);
    }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === resolve(SCRIPT_PATH)) main();
