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
  assert.match(deploy, /docker builder prune -f --filter "until=24h"/, '回收过期构建缓存')
  assert.equal((deploy.match(/docker system df/g) || []).length, 2, '部署前后各打印一次占用')
  assert.match(deploy, /docker compose ps/)
})

test('部署脚本绝不触碰命名卷，日志清理只截断不删文件', () => {
  const dangerous = [
    /compose down -v\b/,
    /--volumes/,
    /volume prune/,
    /rm -rf/,
    /docker system prune -a/,
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
