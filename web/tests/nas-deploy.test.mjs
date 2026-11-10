import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import test from 'node:test'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const deploy = read('../../scripts/nas-deploy.sh')
// 注释里会列举「禁止使用的命令」做警示，检查危险命令时只看真正会执行的行。
const deployCode = deploy.split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n')
const readme = read('../../README.md')
const compose = read('../../docker-compose.yml')

test('NAS 部署脚本完成完整更新流程并报告空间变化', () => {
  assert.match(deploy, /^#!\/bin\/sh/m)
  assert.match(deploy, /git pull --ff-only/)
  assert.match(deploy, /docker compose up -d --build/)
  assert.match(deploy, /docker image prune -f/, '回收上一轮的悬空镜像')
  assert.match(deploy, /show_space "部署前"/, '部署前打印占用')
  assert.match(deploy, /show_space "部署后"/, '部署后打印占用')
  assert.match(deploy, /docker compose ps/)
})

test('构建缓存回收必须带 -a，否则只删 dangling 等于没清', () => {
  // 这是本脚本最容易回归的地方：docker builder prune 不带 -a 时只删
  // dangling 记录，而每次重建产生的层缓存都不算 dangling，空间根本降不下来。
  assert.match(deploy, /docker builder prune -a -f/, '回收构建缓存必须带 -a')
  assert.doesNotMatch(deployCode, /docker builder prune -f/, '不得再退回「不带 -a」的旧写法')
  assert.match(deploy, /--keep-storage "\$keep_bytes"/, '用容量上限兜住，避免清完又涨回来')
  assert.match(deploy, /BUILD_CACHE_KEEP_MB/, '上限可调，构建速度与占盘按需权衡')
  assert.match(deploy, /docker buildx du/, '打印构建缓存明细，便于定位 5G 花在哪')
})

test('提供只读诊断与深度清理两个显式开关', () => {
  assert.match(deploy, /--report/, '只读诊断不加参数不支持')
  assert.match(deployCode, /REPORT_ONLY/, '--report 要在改动前退出')
  assert.match(deploy, /--deep/, '空间告急时能一次性清空构建缓存')
  assert.match(deployCode, /docker image prune -a -f/, '--deep 才回收未使用镜像')
})

test('部署脚本绝不触碰命名卷，日志清理只截断不删文件', () => {
  const dangerous = [
    /compose down -v\b/,
    /--volumes/,
    /volume prune/,
    /rm -rf/,
    /docker system prune/,
    /docker rmi/,
  ]
  for (const pattern of dangerous)
    assert.doesNotMatch(deployCode, pattern, `脚本不得包含危险命令 ${pattern}`)
  assert.match(deploy, /--prune-logs/, '日志清理需显式传参，不在常规部署里偷偷清')
  assert.match(deployCode, /: > "\$f"/, 'winston 持有句柄，用截断而不是删除')
  assert.doesNotMatch(deployCode, /\brm\s+\/app\/core\/data\/logs/)
})

test('README 给出诊断、分级清理与危险操作警示', () => {
  assert.match(readme, /NAS 反复部署时的空间维护/)
  assert.match(readme, /bash scripts\/nas-deploy\.sh/)
  assert.match(readme, /docker system df -v/, '先诊断再清理')
  assert.match(readme, /docker builder prune -a/, '清理命令必须带 -a，不带等于没清')
  assert.match(readme, /qq-farm-data:\/src/, '清理前先备份账号数据')
  assert.match(readme, /⚠️/, '危险命令要有醒目警告')
  assert.match(readme, /qq-farm-logs/)
})

test('compose 仍保留两个命名卷与容器日志上限', () => {
  assert.match(compose, /qq-farm-data:\/app\/core\/data/)
  assert.match(compose, /qq-farm-logs:\/app\/core\/data\/logs/)
  assert.match(compose, /max-size: "10m"/)
  assert.match(compose, /max-file: "3"/)
})
