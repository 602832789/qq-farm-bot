#!/usr/bin/env node
/**
 * 一次性迁移：为 docs/CHANGELOG.md 的全部历史详细记录重新计算版本号与更新序号。
 *
 * 规则：
 *   - 解析「## 详细记录」下所有 `### YYYY-MM-DD · ...` 标题，剥掉已有版本标记得到纯摘要。
 *   - 按时间正序编号：日期升序，同一天内文档位置靠后的先编号（文档本身是最新在前）。
 *   - 以 `v3.0.0 · 第 1 次更新` 为起点（取自 version.mjs 的 BASELINE_META，单一真源），
 *     之后每条按摘要内容判定 minor / patch，复用 bumpVersion（含「跳过数字 4」规则）。
 *   - 旧的 v2.x / v2.9.x 版本号作废；近期记录的真实提交号按旧版本号映射保留。
 *   - 同步写回标题、版本总览表、更新流水图节点、version.json、三个 package.json、web/version.json。
 *
 * 用法：
 *   node scripts/rebuild-version-history.mjs --dry-run   # 只看结果，不落盘
 *   node scripts/rebuild-version-history.mjs             # 执行重算
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  BASELINE_META,
  bumpVersion,
  changelogTag,
  classifyUpdate,
  DEFAULT_ROOT,
  renderVersionSection,
  renderWebVersionMeta,
  upsertVersionSection,
  versionLabel,
} from './version.mjs'

const argv = process.argv.slice(2)
const rootIndex = argv.indexOf('--root')
const root = resolve(rootIndex >= 0 ? (argv[rootIndex + 1] || DEFAULT_ROOT) : DEFAULT_ROOT)
const dryRun = argv.includes('--dry-run')

const TITLE_RE = /^###\s+(\d{4}-\d{2}-\d{2})\s*·\s*(.*)$/
const TAGGED_PREFIX_RE = /^v\d+\.\d+\.\d+（#\d+）\s*·\s*/
const VERSION_PREFIX_RE = /^v\d+\.\d+\.\d+\s*·\s*/
const OLD_VERSION_RE = /^v(\d+\.\d+\.\d+)/

function parseTitle(line) {
  const matched = TITLE_RE.exec(line)
  if (!matched) return null
  let rest = matched[2].trim()
  const oldVersion = OLD_VERSION_RE.exec(rest)?.[1] || null
  rest = rest.replace(TAGGED_PREFIX_RE, '').replace(VERSION_PREFIX_RE, '')
  return { date: matched[1], summary: rest.trim(), oldVersion }
}

function writeJson(file, data) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

const changelogPath = join(root, 'docs/CHANGELOG.md')
const versionPath = join(root, 'version.json')
const lines = readFileSync(changelogPath, 'utf8').split('\n')
const oldMeta = JSON.parse(readFileSync(versionPath, 'utf8'))
const commitByOldVersion = new Map(
  (Array.isArray(oldMeta.history) ? oldMeta.history : [])
    .filter(item => item.version && item.commit)
    .map(item => [item.version, item.commit]),
)

const recordStart = lines.findIndex(line => /^##\s+详细记录\s*$/.test(line))
if (recordStart < 0) throw new Error('CHANGELOG 缺少「## 详细记录」段')

const records = []
for (let i = recordStart + 1; i < lines.length; i++) {
  const parsed = parseTitle(lines[i])
  if (parsed) records.push({ ...parsed, lineIndex: i })
}
if (!records.length) throw new Error('没有找到任何详细记录标题')

// 时间正序：日期升序；同一天按文档位置倒序（文档最新在前，靠后的记录更早）。
records.sort((a, b) => a.date.localeCompare(b.date) || b.lineIndex - a.lineIndex)

let previous = { ...BASELINE_META, build: 0 }
const numbered = records.map((record, index) => {
  let current
  if (index === 0) {
    current = { ...BASELINE_META, build: 1, type: 'baseline' }
  }
  else {
    const type = classifyUpdate(record.summary)
    current = { ...bumpVersion(previous, type), type }
  }
  previous = current
  return { ...record, ...current }
})

for (const record of numbered) {
  lines[record.lineIndex] = `### ${record.date} · ${changelogTag(record)} · ${record.summary}`
}

// 更新流水图节点里写死的旧版本号，替换成重算后的版本号。
const oldToNew = new Map(numbered.filter(item => item.oldVersion).map(item => [item.oldVersion, item.version]))
const flowStart = lines.findIndex(line => /^##\s+更新流水图\s*$/.test(line))
if (flowStart >= 0) {
  let flowEnd = lines.length
  for (let i = flowStart + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      flowEnd = i
      break
    }
  }
  for (let i = flowStart + 1; i < flowEnd; i++) {
    lines[i] = lines[i].replace(/v(\d+\.\d+\.\d+)/g, (full, old) => {
      const next = oldToNew.get(old)
      return next ? `v${next}` : full
    })
  }
}

// history 与总览表都是最新在最前。
const history = [...numbered].reverse().map(record => ({
  version: record.version,
  build: record.build,
  date: record.date,
  summary: record.summary,
  commit: commitByOldVersion.get(record.oldVersion) || '—',
  type: record.type,
}))

let markdown = upsertVersionSection(lines.join('\n'), renderVersionSection(history))
// 迁移本身是版本重置，不新增详细记录；在总览说明里写明口径即可（重复执行不重复追加）。
if (!/本次由 `scripts\/rebuild-version-history\.mjs`/.test(markdown)) {
  markdown = markdown.replace(
    /^(> \*\*全量重排\*\*：.*)$/m,
    `$1 本次由 \`scripts/rebuild-version-history.mjs\` 全量重算，共 ${numbered.length} 条记录。`,
  )
}

const latest = numbered[numbered.length - 1]
const meta = {
  major: latest.major,
  minor: latest.minor,
  patch: latest.patch,
  build: latest.build,
  version: latest.version,
  updatedAt: new Date().toISOString(),
  lastCommit: commitByOldVersion.get(latest.oldVersion) || '',
  history,
}

const first = numbered[0]
if (dryRun) {
  process.stdout.write([
    `[dry-run] 记录数 ${numbered.length}（重复记录全部保留、各自编号）`,
    `[dry-run] 首条：${first.date} · ${changelogTag(first)} · ${first.summary}`,
    `[dry-run] 末条：${latest.date} · ${changelogTag(latest)} · ${latest.summary}`,
    `[dry-run] 重算后当前版本：${versionLabel(meta)}`,
    `[dry-run] 含 4 的版本号 / 序号：${history.filter(item => /4/.test(item.version) || /4/.test(String(item.build))).length}`,
  ].join('\n') + '\n')
  process.exit(0)
}

writeFileSync(changelogPath, markdown, 'utf8')
writeJson(versionPath, meta)
for (const file of ['package.json', 'core/package.json', 'web/package.json']) {
  const path = join(root, file)
  if (!existsSync(path)) continue
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  pkg.version = latest.version
  writeJson(path, pkg)
}
const webDir = join(root, 'web')
if (existsSync(webDir)) {
  writeJson(join(webDir, 'version.json'), renderWebVersionMeta(meta))
}

process.stdout.write(`已重算 ${numbered.length} 条记录，当前版本 ${versionLabel(meta)}\n`)
