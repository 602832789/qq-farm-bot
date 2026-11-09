#!/bin/sh
# NAS 一键更新部署：拉代码 → 重建 → 顺手回收上一轮留下的旧镜像与过期构建缓存。
#
# 用法（在仓库根目录或任意目录都行，脚本会自己切到仓库根）：
#   bash scripts/nas-deploy.sh                # 常规更新，数据卷和日志卷都不动
#   bash scripts/nas-deploy.sh --prune-logs   # 额外截断应用日志卷里的旧日志
#
# 设计原则：只删「没有任何东西在引用」的东西。
#   - docker image prune -f      只删 <none> 悬空镜像，正在跑的镜像不会被删
#   - docker builder prune      只删过期构建缓存，下次构建会慢一点但空间不累积
#   - 本脚本绝不使用 down -v / --volumes / volume prune / rm -rf，
#     qq-farm-data（账号与配置）和 qq-farm-logs 永远保留。
set -eu

cd "$(dirname "$0")/.."

if [ ! -f docker-compose.yml ]; then
  echo "[错误] 没找到 docker-compose.yml，请在仓库根目录执行。" >&2
  exit 1
fi

echo "==== 部署前 Docker 占用 ===="
docker system df

echo "==== 拉取最新代码 ===="
git pull --ff-only

echo "==== 重建并启动 ===="
docker compose up -d --build

echo "==== 回收上一轮留下的悬空镜像 ===="
docker image prune -f

echo "==== 回收 24 小时前的构建缓存（保留最近一次的可复用层）===="
docker builder prune -f --filter "until=24h" \
  || echo "[提示] 当前 Docker 不支持 until 过滤，本次跳过构建缓存清理。"

if [ "${1:-}" = "--prune-logs" ]; then
  echo "==== 截断应用日志卷里的旧日志 ===="
  # 应用自身写 combined.log / error.log 且没有轮转，日志卷会一直涨。
  # winston 持有文件句柄，所以只截断不删除（: > file），容器无需重启。
  docker exec qq-farm-bot sh -c 'du -sh /app/core/data/logs 2>/dev/null' || true
  docker exec qq-farm-bot sh -c '
    for f in /app/core/data/logs/combined.log /app/core/data/logs/error.log; do
      if [ -f "$f" ]; then : > "$f"; fi
    done
  ' || echo "[提示] 容器尚未就绪，日志截断跳过，下次带 --prune-logs 再执行。"
  docker exec qq-farm-bot sh -c 'du -sh /app/core/data/logs 2>/dev/null' || true
fi

echo "==== 部署后 Docker 占用 ===="
docker system df
echo "==== 容器状态 ===="
docker compose ps
echo "完成。数据卷 qq-farm-data / qq-farm-logs 未被删除或重建。"
