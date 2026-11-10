#!/bin/sh
# NAS 一键更新部署：回收旧缓存 → 拉代码 → 重建 → 回收旧镜像。
#
# 用法（在仓库根目录或任意目录都行，脚本会自己切到仓库根）：
#   bash scripts/nas-deploy.sh                # 常规更新，数据卷和日志卷都不动
#   bash scripts/nas-deploy.sh --prune-logs   # 额外截断应用日志卷里的日志
#   bash scripts/nas-deploy.sh --deep         # 空间告急时用：清空全部构建缓存
#   bash scripts/nas-deploy.sh --report       # 只看空间明细，不动任何东西
#
# 为什么以前的清理「清了也不干净」：
#   docker builder prune 不带 -a 时只删 dangling 缓存记录，而每次重建产生的
#   层缓存都不算 dangling，所以旧写法 prune -f --filter until=1m 基本没删到
#   东西，空间照样一路上涨。这里统一带 -a，并用 --keep-storage 设上限，
#   超出部分按「最久未使用」顺序删除。
#
# 设计原则：只删「没有任何东西在引用」的东西。
#   - docker image prune -f      只删 <none> 悬空镜像，正在跑的镜像不会被删
#   - docker builder prune -a    删未使用的构建缓存（带 -a 才会真删）
#   - 本脚本绝不使用 down -v / --volumes / volume prune / rm -rf，
#     qq-farm-data（账号与配置）和 qq-farm-logs 永远保留。
set -eu

cd "$(dirname "$0")/.."

if [ ! -f docker-compose.yml ]; then
  echo "[错误] 没找到 docker-compose.yml，请在仓库根目录执行。" >&2
  exit 1
fi

# 构建缓存上限（MB）。缓存超过这个量就按最久未使用顺序删到上限以内。
# 调大＝构建更快、占盘更多；调小＝占盘更少、每次要多重建一些层。
BUILD_CACHE_KEEP_MB="${BUILD_CACHE_KEEP_MB:-2048}"

PRUNE_LOGS=0
DEEP=0
REPORT_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --prune-logs) PRUNE_LOGS=1 ;;
    --deep) DEEP=1 ;;
    --report) REPORT_ONLY=1 ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "[提示] 未知参数 $arg，已忽略。可用：--prune-logs / --deep / --report" >&2
      ;;
  esac
done

show_space() {
  echo "==== $1 Docker 占用 ===="
  docker system df || true
  echo "---- 构建缓存明细 ----"
  docker buildx du 2>/dev/null | tail -n 3 || echo "(当前引擎不支持 buildx du，跳过)"
  echo "---- 卷占用（脚本永不删卷，这里只做展示）----"
  docker system df -v 2>/dev/null | awk '/^VOLUME NAME/{f=1} f' | head -n 6 || true
  echo ""
}

prune_build_cache() {
  keep_bytes=$((BUILD_CACHE_KEEP_MB * 1024 * 1024))
  if [ "$DEEP" = "1" ]; then
    echo "==== 深度清理：清空全部构建缓存（下次构建会变慢）===="
    docker builder prune -a -f || docker buildx prune -a -f \
      || echo "[提示] 构建缓存清空失败，请手动执行：docker builder prune -a -f"
    return 0
  fi
  echo "==== 回收构建缓存（上限 ${BUILD_CACHE_KEEP_MB}MB，超出按最久未用删）===="
  # 关键在 -a：不带它只删 dangling，等于没清。--keep-storage 用来兜住上限，
  # 避免「清一次干净、下次又涨回来」；老引擎不认这些开关时逐级降级。
  docker builder prune -a -f --keep-storage "$keep_bytes" \
    || docker buildx prune -a -f --max-used-space "$keep_bytes" \
    || docker builder prune -a -f \
    || echo "[提示] 构建缓存回收失败，请手动执行：docker builder prune -a -f"
}

prune_logs() {
  echo "==== 截断应用日志卷里的日志 ===="
  # 应用自身写 combined.log / error.log，日志卷会一直涨。
  # winston 持有文件句柄，所以只截断不删除（: > file），容器无需重启。
  docker exec qq-farm-bot sh -c 'du -sh /app/core/data/logs 2>/dev/null' || true
  docker exec qq-farm-bot sh -c '
    for f in /app/core/data/logs/*.log; do
      if [ -f "$f" ]; then : > "$f"; fi
    done
  ' || echo "[提示] 容器尚未就绪，日志截断跳过，下次带 --prune-logs 再执行。"
  docker exec qq-farm-bot sh -c 'du -sh /app/core/data/logs 2>/dev/null' || true
}

if [ "$REPORT_ONLY" = "1" ]; then
  show_space "当前"
  echo "Build cache 一行占大头 → 直接跑 bash scripts/nas-deploy.sh（已带 -a 回收）。"
  echo "四块加起来仍明显小于涨出来的量 → 查 fnOS 的回收站 / 快照，那部分不属于 Docker。"
  exit 0
fi

show_space "部署前"

# 先回收再构建：老缓存这里就削到上限以内，构建不会因为盘满而失败。
prune_build_cache

echo "==== 拉取最新代码 ===="
git pull --ff-only

echo "==== 重建并启动 ===="
docker compose up -d --build

echo "==== 回收上一轮留下的悬空镜像 ===="
docker image prune -f

if [ "$DEEP" = "1" ]; then
  echo "==== 深度清理：回收所有未使用镜像（下次构建要重新拉基础镜像）===="
  docker image prune -a -f --filter "until=1h" \
    || echo "[提示] 未使用镜像回收失败，可手动执行：docker image prune -a -f"
fi

if [ "$PRUNE_LOGS" = "1" ]; then
  prune_logs
fi

show_space "部署后"
echo "==== 容器状态 ===="
docker compose ps
echo "完成。数据卷 qq-farm-data / qq-farm-logs 未被删除或重建。"
