import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import test from 'node:test'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
// 注释里会列举「禁止使用的命令」做警示，检查危险命令时只看真正会执行的行。
function stripHash(text) {
  return text
    .split('\n')
    .filter(line => !line.trimStart().startsWith('#'))
    .join('\n')
}
const deploy = read('../../scripts/nas-deploy.sh')
const deployCode = stripHash(deploy)
const readme = read('../../README.md')
const compose = read('../../docker-compose.yml')
const dockerfile = read('../../core/Dockerfile')

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

test('--report 列全镜像/容器/卷并给出读法，不写死「构建缓存占大头」', () => {
  // 曾经的缺陷：report 结尾硬编码「Build cache 一行占大头」。实测 Build Cache
  // 只有 193MB（占 0%），真正占满的是被容器引用的镜像，文案把人指错了方向。
  assert.match(deploy, /show_report_detail/, '要输出镜像/容器/卷全量清单')
  assert.match(deploy, /docker images --format/, '列出镜像，看哪条被谁引用')
  assert.match(deploy, /docker ps -a --format/, '列出容器，解释镜像为何删不掉')
  assert.match(deploy, /LINKS=0 的卷/, '标出无人引用的残留卷')
  assert.doesNotMatch(deploy, /Build cache 一行占大头/, '不能再写死这个结论')
  assert.doesNotMatch(deploy, /head -n 6/, '卷列表不能截断，否则看不到残留卷')

  const report = deploy.slice(deploy.indexOf('show_read_guide'), deploy.indexOf('prune_build_cache'))
  assert.match(report, /RECLAIMABLE 很小/, '解释「可回收≈0」的真实含义')
  assert.match(report, /ACTIVE 数量多/, '容器数量要作为重点提示')
  // 同一个镜像起多个实例才算冗余。实测 NAS 上 11 个容器是 10 个不同服务 +
  // 本项目 1 个，按数量下「有 10 个重复实例」的结论是错的。
  assert.match(report, /uniq -d/, '按镜像分组找重复，而不是数容器个数')
  assert.doesNotMatch(report, /ACTIVE 数量 > 1/, '不能用「数量 > 1 就是冗余」的旧结论')
})

test('--report 做磁盘对账：用 docker info 的真实目录，不写死路径', () => {
  // system df 四行加起来经常小于磁盘涨上去的量。差额要么在 Docker 目录里但没被
  // 统计（容器 json 日志、别的 builder），要么根本不在 Docker 里（btrfs 快照 /
  // NAS 回收站），后者 prune 永远清不掉 —— 所以必须把真实数字打出来对账。
  assert.match(deploy, /show_disk_audit/, '要有磁盘对账这一节')
  assert.match(deploy, /DockerRootDir/, '数据目录从 docker info 取，NAS 常挪到数据盘')
  assert.match(deploy, /du -sxh "\$root"/, '列出 Docker 目录里前几大子目录')
  // 汇总和明细必须同一个口径。实测缺陷：汇总漏了 -x，du 跨进 overlay2/<id>/merged
  // 把每个容器的根目录视图又算一遍，15G vs 明细合计 9.3G，白找 5.7G。
  assert.match(deploy, /du -sxh "\$root" 2>\/dev\/null/, '汇总也必须带 -x')
  assert.doesNotMatch(deploy, /du -sh "\$root"/, '汇总不能退回不带 -x 的写法')
  assert.match(deploy, /\$root\/buildkit/, '构建缓存落盘目录单独量一次（system df 常显示 0B）')
  assert.match(deploy, /df -h "\$root"/, '给出所在文件系统的已用/总量')
  assert.match(deploy, /btrfs/, 'btrfs/zfs 上删文件不释放空间，要提示快照')
  assert.match(deploy, /subvolume list -s/, '能直接数出快照数量')
  assert.match(deploy, /json\.log/, '列出容器日志实际体积')

  // 对账必须在 --report 分支里被调用，否则等于没写
  const branch = deploy.slice(deploy.indexOf('if [ "$REPORT_ONLY" = "1" ]'), deploy.indexOf('show_space "部署前"'))
  assert.match(branch, /show_disk_audit/, '--report 分支要真的调用它')
})

test('--report 在容器 unhealthy 时打印健康检查自己的输出', () => {
  // docker ps 里的 (unhealthy) 只是结论。探针的退出码和输出才是证据，
  // 否则分不清「服务没起来」和「探测命令写错」。
  assert.match(deploy, /show_health_detail/)
  assert.match(deploy, /State\.Health\.Log/, '要取健康检查的历史输出')
  assert.match(deploy, /\.State\.Health\.Status/, '先报当前状态')
})

test('--prune-orphans 只删已停止容器，绝不误删数据卷', () => {
  assert.match(deploy, /--prune-orphans/)
  assert.match(deployCode, /PRUNE_ORPHANS/)

  const fn = deploy.slice(deploy.indexOf('# 清理历史残留'), deploy.indexOf('if [ "$REPORT_ONLY"'))
  // 只留真正会执行的行：注释和 echo/printf 的提示文案里出现的命令不算执行。
  const fnCode = fn
    .split('\n')
    .filter(line => !line.trimStart().startsWith('#'))
    .filter(line => !/^\s*echo\b/.test(line))
    .join('\n')
  assert.match(fn, /status=exited/, '只筛已停止容器')
  // 删之前要再确认一次不在运行，避免竞态下停掉刚起来的容器
  assert.match(fnCode, /docker ps -q --filter "name=\^\$\{name\}\$"/, '删除前二次确认未运行')
  assert.match(fnCode, /grep -vx 'qq-farm-bot'/, '当前实例不进入删除候选')
  // 残留卷只报告不删：里面可能装着早期账号数据
  assert.doesNotMatch(fnCode, /docker volume rm/, '脚本不得自动删卷')
  assert.match(fn, /docker volume rm <上面列出的卷名>/, '只打印命令让用户自己确认')
})

test('--report 标出悬空镜像，并说明 buildx 记录与真实落盘不是一回事', () => {
  // 实测：重建后 <none> 会留着上一版镜像（327MB），不跑 image prune 就一直占着；
  // 同时 buildx du 报 1.177GB 而 buildkit 目录只有 49M，两个数字不能混着看。
  assert.match(deploy, /dangling=true/, '要列出悬空镜像')
  assert.match(deploy, /docker image prune -f/, '给出回收命令')
  assert.match(deploy, /缓存记录的逻辑大小/, '说清 buildx du 与 du 的口径差异')
  assert.match(deploy, /Docker 之外的部分/, '要对账到容器之外')
})

test('无 docker 时给出清晰错误，但 --help 仍可查看用法', () => {
  // 用法说明按「文件头注释到 set -eu」打印，改注释不会截断，也不写死行号
  const helpAt = deploy.indexOf('/^set -eu/{exit}')
  const dockerCheckAt = deploy.indexOf('command -v docker')
  assert.ok(helpAt > 0, '用法说明按文件头注释打印，不写死行号')
  assert.ok(dockerCheckAt > helpAt, 'help 必须在 docker 检查之前处理')
  assert.match(deploy, /没找到 docker 命令/)
})

test('健康检查不依赖 wget，也不走 localhost', () => {
  // 实测容器一直挂着 (unhealthy)：busybox wget 解析 localhost 时可能先试 ::1，
  // 而应用只监听 IPv4 的 0.0.0.0。探测失败被读成「服务挂了」，实际服务是好的。
  const health = stripHash(compose.slice(compose.indexOf('healthcheck:'), compose.indexOf('logging:')))
  assert.match(health, /127\.0\.0\.1:3007/, '探测指到 127.0.0.1')
  assert.doesNotMatch(health, /localhost/, '不再走 localhost')
  assert.doesNotMatch(health, /wget/, '不再用 busybox wget 探测')
  assert.match(health, /node", "-e"/, '用容器自带的 node 发请求')
  assert.match(health, /\/api\/game-version/, '探测免鉴权接口，否则 401 也会判失败')
  assert.match(health, /r\.ok\?0:1/, '200 才算健康，4xx/5xx 要判失败')

  const dockerHealth = stripHash(dockerfile.slice(dockerfile.indexOf('HEALTHCHECK')))
  assert.match(dockerHealth, /HEALTHCHECK/, '镜像级也要有健康检查')
  assert.match(dockerHealth, /127\.0\.0\.1:3007/, '两边保持一致')
  assert.match(dockerHealth, /r\.ok\?0:1/, '判定逻辑与 compose 一致')
  assert.doesNotMatch(dockerHealth, /wget -q --spider/, '不再用 wget 探测')
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
