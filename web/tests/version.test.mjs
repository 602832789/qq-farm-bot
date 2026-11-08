import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_ROOT,
  bumpVersion,
  changelogTag,
  classifyUpdate,
  markLatestChangelogTitle,
  renderVersionSection,
  summarizeTitle,
  upsertVersionSection,
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
    major: 2, minor: 8, patch: 0, build: 0, version: '2.8.0', history: [],
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
  const log1 = readFileSync(join(tmp, 'docs/CHANGELOG.md'), 'utf8')
  assert.match(log1, /## 版本总览/)
  assert.match(log1, /\| v2\.9\.0 \| #1 \| 2026-11-09 \| 新增版本号功能 \| `abc1234` \|/)
  assert.match(log1, /^### 2026-11-09 · v2\.9\.0（#1） · 新增版本号功能$/m)

  run('--message', '修复一个开关', '--type', 'patch', '--date', '2026-11-10', '--commit', 'def5678')
  const meta2 = JSON.parse(readFileSync(join(tmp, 'version.json'), 'utf8'))
  assert.equal(meta2.version, '2.9.1')
  assert.equal(meta2.build, 2)
  assert.equal(meta2.history.length, 2)
  const log2 = readFileSync(join(tmp, 'docs/CHANGELOG.md'), 'utf8')
  assert.equal((log2.match(/## 版本总览/g) || []).length, 1)
  assert.match(log2, /\| v2\.9\.1 \| #2 \| 2026-11-10 \| 修复一个开关 \| `def5678` \|/)
  // 已打过版本号的旧记录不被覆盖
  assert.match(log2, /^### 2026-11-09 · v2\.9\.0（#1） · 新增版本号功能$/m)
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
  assert.match(changelog, /^### 2026-11-09 · v2\.9\.0（#1） · /m)
})

test('快成熟判定默认值已改为推荐的 60 秒', () => {
  assert.match(read('web/src/components/settings/AccountFeatureSettings.vue'), /fertilizer_smart_seconds \?\? 60/)
  assert.match(read('web/src/components/settings/AccountFeatureSettings.vue'), /默认 \/ 推荐 60 秒/)
  assert.match(read('web/src/views/Settings.vue'), /fertilizer_smart_seconds: 60,/)
})

test('DEFAULT_ROOT 指向仓库根且版本脚本存在', () => {
  assert.equal(DEFAULT_ROOT, ROOT)
  assert.ok(existsSync(join(ROOT, 'scripts/version.mjs')))
})
