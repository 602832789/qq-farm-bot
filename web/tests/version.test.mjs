// web 测试由 `node --test` 运行（见 package.json），此处刻意使用 node:test 而非 vitest。

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  BASELINE_META,
  bumpVersion,
  changelogTag,
  classifyUpdate,
  containsSkippedDigit,
  DEFAULT_ROOT,
  markLatestChangelogTitle,
  nextAllowedNumber,
  renderVersionSection,
  renderWebVersionMeta,
  SKIPPED_DIGIT,
  summarizeTitle,
  upsertVersionSection,
  VERSION_FILES,
  versionLabel,
} from '../../scripts/version.mjs'

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const read = rel => readFileSync(join(ROOT, rel), 'utf8')

test('按更新内容判定版本跨度', () => {
  assert.equal(classifyUpdate('feat(web): 新增版本号功能'), 'minor')
  assert.equal(classifyUpdate('新增神秘商人来访横幅'), 'minor')
  assert.equal(classifyUpdate('移植首页运行诊断模块'), 'minor')
  assert.equal(classifyUpdate('fix: 修复奶茶支撑时间'), 'patch')
  assert.equal(classifyUpdate('回滚快成熟随机化 + 去除红点通知'), 'patch')
  assert.equal(classifyUpdate('chore: 更新依赖'), 'patch')
  assert.equal(classifyUpdate('BREAKING: 重构配置存储'), 'major')
})

test('新增功能进 MINOR、修复进 PATCH，更新次数每次都 +1', () => {
  const base = { major: 2, minor: 8, patch: 0, build: 0 }
  const feature = bumpVersion(base, 'minor')
  assert.deepEqual(feature, { major: 2, minor: 9, patch: 0, build: 1, version: '2.9.0' })
  const fix = bumpVersion(feature, 'patch')
  assert.deepEqual(fix, { major: 2, minor: 9, patch: 1, build: 2, version: '2.9.1' })
  const breaking = bumpVersion(fix, 'major')
  assert.deepEqual(breaking, { major: 3, minor: 0, patch: 0, build: 3, version: '3.0.0' })
  assert.equal(bumpVersion(breaking, 'unknown').version, '3.0.1')
})

test('跳过数字 4：工具函数覆盖个位、十位、整段区间与边界', () => {
  assert.equal(SKIPPED_DIGIT, '4')
  for (const value of [4, 14, 40, 104, '2.9.4'])
    assert.equal(containsSkippedDigit(value), true, `${value} 含 4`)
  for (const value of [0, 3, 39, 399, '2.9.5'])
    assert.equal(containsSkippedDigit(value), false, `${value} 不含 4`)
  assert.equal(nextAllowedNumber(0), 0)
  assert.equal(nextAllowedNumber(3), 3)
  assert.equal(nextAllowedNumber(4), 5)
  assert.equal(nextAllowedNumber(14), 15)
  assert.equal(nextAllowedNumber(24), 25)
  assert.equal(nextAllowedNumber(39), 39)
  assert.equal(nextAllowedNumber(40), 50)
  assert.equal(nextAllowedNumber(49), 50)
  assert.equal(nextAllowedNumber(399), 399)
  assert.equal(nextAllowedNumber(400), 500)
  assert.equal(nextAllowedNumber(-1), 0)
})

test('版本号三段与更新序号递增时都跳过数字 4', () => {
  const cases = [
    [{ major: 2, minor: 9, patch: 3, build: 4 }, 'patch', '2.9.5', 5],
    [{ major: 2, minor: 9, patch: 3, build: 3 }, 'patch', '2.9.5', 5],
    [{ major: 2, minor: 9, patch: 13, build: 13 }, 'patch', '2.9.15', 15],
    [{ major: 2, minor: 13, patch: 9, build: 39 }, 'minor', '2.15.0', 50],
    [{ major: 2, minor: 39, patch: 9, build: 0 }, 'minor', '2.50.0', 1],
    [{ major: 3, minor: 9, patch: 9, build: 3 }, 'major', '5.0.0', 5],
    [{ major: 2, minor: 4, patch: 9, build: 0 }, 'patch', '2.5.10', 1],
  ]
  for (const [current, type, version, build] of cases) {
    const next = bumpVersion(current, type)
    assert.equal(next.version, version, `${type} 从 ${JSON.stringify(current)} 递增`)
    assert.equal(next.build, build)
    assert.equal(containsSkippedDigit(next.version), false)
    assert.equal(containsSkippedDigit(next.build), false)
    assert.equal(next.version, `${next.major}.${next.minor}.${next.patch}`)
  }
})

test('连续 200 次递增，版本号与更新序号始终不出现 4', () => {
  let meta = { major: 2, minor: 9, patch: 3, build: 4 }
  for (let i = 0; i < 200; i++) {
    meta = bumpVersion(meta, i % 7 === 0 ? 'minor' : 'patch')
    assert.equal(containsSkippedDigit(meta.version), false, `第 ${i + 1} 轮版本号：${meta.version}`)
    assert.equal(containsSkippedDigit(meta.build), false, `第 ${i + 1} 轮序号：${meta.build}`)
  }
  assert.ok(meta.build > 200, '序号仍持续递增，不会卡住')
})

test('版本标签与日志标记', () => {
  assert.equal(versionLabel({ version: '2.9.0', build: 1 }), 'v2.9.0 · 第 1 次更新')
  assert.equal(changelogTag({ version: '2.9.0', build: 1 }), 'v2.9.0（#1）')
  assert.equal(summarizeTitle('### 2026-11-09 · v2.9.0（#1） · 新增版本号功能'), '新增版本号功能')
  assert.equal(summarizeTitle('### 2026-11-08 · 修复登录'), '修复登录')
})

test('版本总览表由 history 渲染，含竖线的内容会转义', () => {
  const section = renderVersionSection([
    { version: '2.9.0', build: 1, date: '2026-11-09', summary: '新增 A | B', commit: 'abc1234' },
    { version: '2.8.0', build: 0, date: '2026-10-15', summary: '历史基线', commit: '—' },
  ])
  assert.match(section, /## 版本总览/)
  assert.match(section, /\| v2\.9\.0 \| #1 \| 2026-11-09 \| 新增 A \\\| B \| `abc1234` \|/)
  assert.match(section, /\| v2\.8\.0 \| 历史 \|/)
  assert.match(section, /新增功能 → `MINOR`/)
})

test('插入 / 替换版本总览段是幂等的', () => {
  const md = '# 更新日志\n\n## 更新流水图\n\n```mermaid\nA --> B\n```\n\n## 详细记录\n### 2026-11-09 · 示例\n'
  const section = renderVersionSection([{ version: '2.9.0', build: 1, date: '2026-11-09', summary: '示例', commit: 'abc' }])
  const once = upsertVersionSection(md, section)
  assert.equal((once.match(/## 版本总览/g) || []).length, 1)
  assert.ok(once.indexOf('## 版本总览') < once.indexOf('## 更新流水图'))
  assert.match(once, /```mermaid/)
  assert.equal(upsertVersionSection(once, section), once)
})

test('最新详细记录标题打版本号，已标记的不重复打', () => {
  const md = '## 详细记录\n### 2026-11-09 · 新增版本号功能\n\n- 内容\n### 2026-11-08 · 上一条\n'
  const marked = markLatestChangelogTitle(md, 'v2.9.0（#1）')
  assert.match(marked, /^### 2026-11-09 · v2\.9\.0（#1） · 新增版本号功能$/m)
  assert.match(marked, /^### 2026-11-08 · 上一条$/m)
  assert.equal(markLatestChangelogTitle(marked, 'v2.9.1（#2）'), marked)
})

test('CLI 端到端：递增版本、同步三个 package.json、写入更新日志', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'farm-version-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  mkdirSync(join(tmp, 'core'), { recursive: true })
  mkdirSync(join(tmp, 'web'), { recursive: true })
  mkdirSync(join(tmp, 'docs'), { recursive: true })
  writeFileSync(join(tmp, 'version.json'), JSON.stringify({
    major: 2,
    minor: 8,
    patch: 0,
    build: 0,
    version: '2.8.0',
    history: [],
  }, null, 2))
  for (const file of ['package.json', 'core/package.json', 'web/package.json']) {
    writeFileSync(join(tmp, file), `${JSON.stringify({ name: file, version: '2.8.0' }, null, 2)}\n`)
  }
  writeFileSync(join(tmp, 'docs/CHANGELOG.md'), '# 更新日志\n\n## 更新流水图\n\n## 详细记录\n### 2026-11-09 · 新增版本号功能\n\n- 内容\n')

  const script = join(ROOT, 'scripts/version.mjs')
  const run = (...args) => execFileSync(process.execPath, [script, 'bump', '--root', tmp, ...args], { encoding: 'utf8' })

  run('--message', '新增版本号功能', '--date', '2026-11-09', '--commit', 'abc1234')
  const meta1 = JSON.parse(readFileSync(join(tmp, 'version.json'), 'utf8'))
  assert.equal(meta1.version, '2.9.0')
  assert.equal(meta1.build, 1)
  assert.equal(meta1.history[0].type, 'minor')
  assert.equal(meta1.history[0].summary, '新增版本号功能')
  for (const file of ['package.json', 'core/package.json', 'web/package.json']) {
    assert.equal(JSON.parse(readFileSync(join(tmp, file), 'utf8')).version, '2.9.0')
  }
  const mirror1 = JSON.parse(readFileSync(join(tmp, 'web/version.json'), 'utf8'))
  assert.equal(mirror1.version, '2.9.0')
  assert.equal(mirror1.build, 1)
  assert.equal(mirror1.label, 'v2.9.0 · 第 1 次更新')
  const log1 = readFileSync(join(tmp, 'docs/CHANGELOG.md'), 'utf8')
  assert.match(log1, /## 版本总览/)
  assert.match(log1, /\| v2\.9\.0 \| #1 \| 2026-11-09 \| 新增版本号功能 \| `abc1234` \|/)
  assert.match(log1, /^### 2026-11-09 · v2\.9\.0（#1） · 新增版本号功能$/m)

  run('--message', '修复一个开关', '--type', 'patch', '--date', '2026-11-10', '--commit', 'def5678')
  const meta2 = JSON.parse(readFileSync(join(tmp, 'version.json'), 'utf8'))
  assert.equal(meta2.version, '2.9.1')
  assert.equal(meta2.build, 2)
  assert.equal(meta2.history.length, 2)
  const mirror2 = JSON.parse(readFileSync(join(tmp, 'web/version.json'), 'utf8'))
  assert.equal(mirror2.version, '2.9.1')
  assert.equal(mirror2.build, 2)
  assert.equal(mirror2.label, 'v2.9.1 · 第 2 次更新')
  const log2 = readFileSync(join(tmp, 'docs/CHANGELOG.md'), 'utf8')
  assert.equal((log2.match(/## 版本总览/g) || []).length, 1)
  assert.match(log2, /\| v2\.9\.1 \| #2 \| 2026-11-10 \| 修复一个开关 \| `def5678` \|/)
  // 已打过版本号的旧记录不被覆盖
  assert.match(log2, /^### 2026-11-09 · v2\.9\.0（#1） · 新增版本号功能$/m)
})

test('CLI 端到端：从 2.9.3 #4 递增时版本号、序号、日志与镜像同时跳过 4', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'farm-version-skip4-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  for (const dir of ['core', 'web', 'docs']) mkdirSync(join(tmp, dir), { recursive: true })
  writeFileSync(join(tmp, 'version.json'), `${JSON.stringify({
    major: 2,
    minor: 9,
    patch: 3,
    build: 4,
    version: '2.9.3',
    history: [],
  }, null, 2)}\n`)
  for (const file of ['package.json', 'core/package.json', 'web/package.json'])
    writeFileSync(join(tmp, file), `${JSON.stringify({ name: file, version: '2.9.3' }, null, 2)}\n`)
  writeFileSync(join(tmp, 'docs/CHANGELOG.md'), '# 更新日志\n\n## 详细记录\n### 2026-11-09 · 版本号与更新次数自动跳过数字 4\n')

  const script = join(ROOT, 'scripts/version.mjs')
  const run = (...args) => execFileSync(process.execPath, [script, 'bump', '--root', tmp, ...args], { encoding: 'utf8' })

  run('--message', '修复版本递增', '--type', 'patch', '--date', '2026-11-09', '--commit', 'aaa1111')
  const meta = JSON.parse(readFileSync(join(tmp, 'version.json'), 'utf8'))
  assert.equal(meta.version, '2.9.5')
  assert.equal(meta.build, 5)
  for (const file of ['package.json', 'core/package.json', 'web/package.json'])
    assert.equal(JSON.parse(readFileSync(join(tmp, file), 'utf8')).version, '2.9.5')
  const mirror = JSON.parse(readFileSync(join(tmp, 'web/version.json'), 'utf8'))
  assert.equal(mirror.label, 'v2.9.5 · 第 5 次更新')
  assert.equal(containsSkippedDigit(mirror.label), false)
  const log = readFileSync(join(tmp, 'docs/CHANGELOG.md'), 'utf8')
  assert.match(log, /\| v2\.9\.5 \| #5 \| 2026-11-09 \| 修复版本递增 \| `aaa1111` \|/)
  assert.match(log, /^### 2026-11-09 · v2\.9\.5（#5） · /m)

  // 连续递增跨过 14 / 40 等区间，history 与真源都不允许出现 4
  for (let i = 0; i < 10; i++)
    run('--message', '修复问题', '--type', 'patch', '--date', '2026-11-09', '--commit', `bbb${i}`)
  const meta2 = JSON.parse(readFileSync(join(tmp, 'version.json'), 'utf8'))
  assert.equal(containsSkippedDigit(meta2.version), false)
  assert.equal(containsSkippedDigit(meta2.build), false)
  for (const item of meta2.history) {
    assert.equal(containsSkippedDigit(item.version), false, `history 版本号含 4：${item.version}`)
    assert.equal(containsSkippedDigit(item.build), false, `history 序号含 4：${item.build}`)
  }
})

test('递增链统一走跳过函数，更新日志规则说明写明跳过数字 4', () => {
  const script = read('scripts/version.mjs')
  assert.match(script, /export const SKIPPED_DIGIT = '4'/)
  assert.match(script, /export function nextAllowedNumber\(/)
  assert.match(script, /nextMajor = nextAllowedNumber\(nextMajor\)/)
  assert.match(script, /nextMinor = nextAllowedNumber\(nextMinor\)/)
  assert.match(script, /nextPatch = nextAllowedNumber\(nextPatch\)/)
  assert.match(script, /const nextBuild = nextAllowedNumber\(build \+ 1\)/)
  const section = renderVersionSection([])
  assert.match(section, /\*\*跳过数字 4\*\*/)
  assert.match(section, /`4 → 5`/)
  assert.match(section, /`39 → 50`/)
  assert.match(section, /\*\*全量重排\*\*/)
  assert.match(read('docs/CHANGELOG.md'), /\*\*跳过数字 4\*\*/)
  // hook 每次递增都会重渲染规则说明段，迁移脚本追加的一次性说明不持久化；校验脚本本身即可。
  assert.ok(existsSync(join(ROOT, 'scripts/rebuild-version-history.mjs')))
  assert.match(read('scripts/rebuild-version-history.mjs'), /BASELINE_META/)
})

test('全量重排起点为 3.0.0，脚本与规则说明共用单一常量', () => {
  assert.equal(BASELINE_META.version, '3.0.0')
  assert.equal(BASELINE_META.major, 3)
  assert.equal(BASELINE_META.minor, 0)
  assert.equal(BASELINE_META.patch, 0)
  assert.equal(containsSkippedDigit(BASELINE_META.version), false)
  const script = read('scripts/version.mjs')
  assert.match(script, /export const BASELINE_META = Object\.freeze\(/)
  assert.match(script, /version: '3\.0\.0'/)
  assert.match(script, /\.\.\.BASELINE_META/)
  const migration = read('scripts/rebuild-version-history.mjs')
  assert.match(migration, /BASELINE_META/)
  assert.match(migration, /current = \{ \.\.\.BASELINE_META, build: 1, type: 'baseline' \}/)
  assert.doesNotMatch(migration, /version: '2\.0\.0'/)
  assert.match(renderVersionSection([]), /以 `v3\.0\.0 · 第 1 次更新` 为起点/)
  assert.match(read('docs/CHANGELOG.md'), /以 `v3\.0\.0 · 第 1 次更新` 为起点/)
})

test('已发布记录都带版本号，提交前允许最新一条待打版本号', () => {
  const changelog = read('docs/CHANGELOG.md')
  const titles = changelog.split('\n').filter(line => /^###\s/.test(line))
  const rows = changelog.split('\n').filter(line => /^\| v\d/.test(line))
  const meta = JSON.parse(read('version.json'))
  const versionedTitle = /^###\s+\d{4}-\d{2}-\d{2}\s*·\s*v\d+\.\d+\.\d+（#\d+）\s*·\s*/
  // 写更新日志时最新一条还没提交，版本号与总览表行由 post-commit hook 补上。
  const pendingTitle = titles.length > 0 && !versionedTitle.test(titles[0])
  const publishedTitles = pendingTitle ? titles.slice(1) : titles
  assert.ok(titles.length >= 72, '全量重排后的历史记录全部保留')
  assert.ok(rows.length >= publishedTitles.length, '版本总览表覆盖全部已发布记录')
  assert.equal(meta.history.length, rows.length, 'history 与总览表行数一致')

  const versions = []
  const builds = []
  for (const title of publishedTitles) {
    const matched = /^###\s+\d{4}-\d{2}-\d{2}\s*·\s*v(\d+\.\d+\.\d+)（#(\d+)）\s*·\s*/.exec(title)
    assert.ok(matched, `标题缺版本号：${title}`)
    assert.equal(containsSkippedDigit(matched[1]), false, `版本号含 4：${title}`)
    assert.equal(containsSkippedDigit(matched[2]), false, `序号含 4：${title}`)
    versions.push(matched[1])
    builds.push(Number(matched[2]))
  }
  assert.equal(new Set(versions).size, versions.length, '版本号不重复')
  assert.equal(new Set(builds).size, builds.length, '更新序号不重复')
  const firstRow = /^\| v(\d+\.\d+\.\d+) \| #(\d+) \|/.exec(rows[0])
  assert.ok(firstRow, '版本总览表首行格式正确')
  assert.equal(firstRow[1], meta.version, '总览表首行就是当前版本')
  assert.equal(Number(firstRow[2]), meta.build)
  for (const version of versions)
    assert.ok(changelog.includes(`| v${version} |`), `总览表缺少 ${version} 对应行`)
  assert.equal(versions[versions.length - 1], BASELINE_META.version, '最早一条是重算起点 v3.0.0')
  assert.equal(builds[builds.length - 1], 1)
  for (const item of meta.history) {
    assert.equal(containsSkippedDigit(item.version), false)
    assert.equal(containsSkippedDigit(item.build), false)
  }
})

test('版本钩子只认标题开头的版本标记，描述里的旧版本号不误判', () => {
  const pending = [
    '## 详细记录',
    '### 2026-11-11 · 复核运行完整性：补修 v3.17.1 引入的回归',
    '',
    '正文',
    '### 2026-11-11 · v3.17.1（#121） · 上一条已发布',
  ].join('\n')
  const marked = markLatestChangelogTitle(pending, 'v3.17.2（#122）')
  assert.match(marked, /^### 2026-11-11 · v3\.17\.2（#122） · 复核运行完整性：补修 v3\.17\.1 引入的回归/m)
  assert.match(marked, /^### 2026-11-11 · v3\.17\.1（#121） · 上一条已发布/m, '已发布记录不被改动')

  const already = '## 详细记录\n### 2026-11-11 · v3.17.2（#122） · 已打标\n'
  assert.equal(markLatestChangelogTitle(already, 'v3.17.3（#123）'), already, '已带标记的标题不重复打标')
  const noDate = '## 详细记录\n### v3.17.2（#122） · 不带日期的旧格式\n'
  assert.equal(markLatestChangelogTitle(noDate, 'v3.17.3（#123）'), noDate, '旧格式标题也识别为已打标')
})

test('版本号真源、构建注入与界面显示接线完整', () => {
  const meta = JSON.parse(read('version.json'))
  assert.ok(/^\d+\.\d+\.\d+$/.test(meta.version))
  assert.equal(meta.version, `${meta.major}.${meta.minor}.${meta.patch}`)
  assert.ok(meta.build >= 1)
  assert.equal(meta.history[0].version, meta.version)
  for (const file of ['package.json', 'core/package.json', 'web/package.json']) {
    assert.equal(JSON.parse(read(file)).version, meta.version, `${file} 版本应与 version.json 一致`)
  }

  const pkg = JSON.parse(read('package.json'))
  assert.ok(pkg.scripts['version:show'])
  assert.ok(pkg.scripts['version:bump'])
  assert.ok(pkg.scripts['version:dry'])
  assert.ok(pkg.scripts['hooks:install'])

  const viteConfig = read('web/vite.config.ts')
  assert.match(viteConfig, /\.\.\/version\.json/)
  assert.match(viteConfig, /__APP_VERSION_LABEL__/)
  assert.match(viteConfig, /__APP_BUILD__/)
  assert.match(read('web/src/vite-env.d.ts'), /declare const __APP_VERSION_LABEL__: string/)
  assert.match(read('web/src/components/Sidebar.vue'), /\{\{ versionLabel \}\}/)
  assert.match(read('web/src/views/Login.vue'), /Web \{\{ appVersionLabel \}\}/)

  assert.ok(existsSync(join(ROOT, '.githooks/post-commit')))
  const hook = read('.githooks/post-commit')
  assert.match(hook, /chore\(version\)/)
  assert.match(hook, /version\.json/)
  assert.match(hook, /--auto-commit/)
  assert.match(hook, /FARM_VERSION_BUMP_RUNNING/)

  const changelog = read('docs/CHANGELOG.md')
  assert.match(changelog, /## 版本总览/)
  assert.match(changelog, new RegExp(`\\| v${meta.version.replace(/\./g, '\\.')} \\| #${meta.build} \\|`))
  assert.match(changelog, new RegExp(`^### \\d{4}-\\d{2}-\\d{2} · v${meta.version.replace(/\./g, '\\.')}（#${meta.build}） · `, 'm'))
})

test('web/version.json 镜像与真源一致，容器只 COPY web/ 也能显示更新次数', () => {
  const meta = JSON.parse(read('version.json'))
  const mirror = JSON.parse(read('web/version.json'))
  assert.equal(mirror.version, meta.version)
  assert.equal(mirror.build, meta.build)
  assert.equal(mirror.label, versionLabel(meta))
  assert.equal(mirror.source, 'version.json')
  assert.ok(mirror.build > 0)
  assert.deepEqual(renderWebVersionMeta(meta), mirror)
  assert.ok(VERSION_FILES.includes('web/version.json'))
})

test('vite 注入优先根版本文件、回退 web 镜像，读不到时不显示第 0 次更新', () => {
  const viteConfig = read('web/vite.config.ts')
  assert.match(viteConfig, /\.\.\/version\.json/)
  assert.match(viteConfig, /\.\/version\.json/)
  assert.match(viteConfig, /rootVersionMeta\?\.version \? rootVersionMeta : \(webVersionMeta/)
  assert.match(viteConfig, /hasBuild/)
  assert.match(viteConfig, /: `v\$\{appVersion\}`/)
  assert.doesNotMatch(viteConfig, /build \?\? 0/)
  assert.doesNotMatch(viteConfig, /第 0 次更新/)

  const dockerfile = read('core/Dockerfile')
  assert.match(dockerfile, /web-builder[\s\S]*?COPY version\.json \.\/version\.json[\s\S]*?COPY web \.\/web/)
})

test('Dockerfile 不声明外部 frontend，国内镜像站也能构建', () => {
  const dockerfile = read('core/Dockerfile')
  // syntax= 是 parser directive：BuildKit 会先去 docker.io 拉 docker/dockerfile:x.y
  // 当解析器，国内镜像加速站常对该 namespace 返回 401，构建第一步就失败。
  assert.doesNotMatch(dockerfile, /^#\s*syntax\s*=/m)
  assert.match(dockerfile, /^FROM \$\{NODE_IMAGE\} AS pnpm-base/m)
  assert.match(dockerfile, /RUN --mount=type=cache/)
})

test('基础镜像默认走全限定地址，失效 mirror 下无需改环境配置', () => {
  const dockerfile = read('core/Dockerfile')
  const compose = read('docker-compose.yml')
  const image = 'docker.m.daocloud.io/library/node:20.19.6-alpine3.21'
  // 短名 node:... 会被补成 docker.io/library/node，宿主机的 registry mirror
  // 一旦返回 401，metadata 阶段就构建失败；全限定域名不经过 docker.io mirror。
  assert.ok(dockerfile.includes(`ARG NODE_IMAGE=${image}`), 'Dockerfile 默认基础镜像必须是全限定名')
  assert.ok(compose.includes(`NODE_IMAGE: \${NODE_IMAGE:-${image}}`), 'compose 默认值需与 Dockerfile 一致')
  assert.doesNotMatch(dockerfile, /^ARG NODE_IMAGE=node:/m)
  assert.doesNotMatch(compose, /:-node:/)
})

test('快成熟判定默认值恢复为 300 秒', () => {
  assert.match(read('web/src/components/settings/AccountFeatureSettings.vue'), /fertilizer_smart_seconds \?\? 300/)
  assert.match(read('web/src/components/settings/AccountFeatureSettings.vue'), /默认 300 秒/)
  assert.match(read('web/src/views/Settings.vue'), /fertilizer_smart_seconds: 300,/)
})

test('DEFAULT_ROOT 指向仓库根且版本脚本存在', () => {
  assert.equal(DEFAULT_ROOT, ROOT)
  assert.ok(existsSync(join(ROOT, 'scripts/version.mjs')))
})
