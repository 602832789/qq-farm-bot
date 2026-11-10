#!/bin/sh
# NAS 一键更新部署：回收旧缓存 → 拉代码 → 重建 → 回收旧镜像。
#
# 用法（在仓库根目录或任意目录都行，脚本会自己切到仓库根）：
#   bash scripts/nas-deploy.sh                # 常规更新，数据卷和日志卷都不动
#   bash scripts/nas-deploy.sh --prune-logs   # 额外截断应用日志卷里的日志
#   bash scripts/nas-deploy.sh --deep         # 空间告急：清空全部构建缓存
#   bash scripts/nas-deploy.sh --report       # 只读诊断：列出镜像/容器/卷全量
#   bash scripts/nas-deploy.sh --prune-orphans  # 清历史残留（已停止的旧容器 +
#                                             # 无人引用的旧镜像 + 遗留测试卷）
#
# 空间涨上去的三个真实来源，按占比从大到小：
#   1. 镜像被容器引用着 → 全都不算 dangling，image prune 一条都删不掉。
#      典型表现：Images 行 TOTAL=11、ACTIVE=11、可回收只有几 MB。
#      根因通常是历史上用不同 compose project 名跑过，留下多套容器各占一个镜像。
#   2. 容器可写层 → 容器长期运行、反复写盘，会稳定累积。
#   3. 构建缓存 → 注意 docker system df 的 Build Cache 行只统计默认 builder，
#      真实值要看 docker buildx du；多 builder 时还要 docker buildx ls。
#      这一块以前被当成主要矛盾，实测经常只占 100–200MB，不是大头。
#
# 设计原则：只删「没有任何东西在引用」的东西。
#   - docker image prune -f      只删 <none> 悬空镜像，正在跑的镜像不会被删
#   - docker builder prune -a    删未使用的构建缓存（带 -a 才会真删）
#   - --prune-orphans 只动名字属于本项目的残留，且绝不删除运行中的容器；
#     数据卷 qq-farm-data / qq-farm-logs 是硬编码白名单，任何模式都不碰。
#   - 本脚本绝不使用 down -v / --volumes / volume prune / rm -rf。
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
PRUNE_ORPHANS=0

for arg in "$@"; do
  case "$arg" in
    --prune-logs) PRUNE_LOGS=1 ;;
    --deep) DEEP=1 ;;
    --report) REPORT_ONLY=1 ;;
    --prune-orphans) PRUNE_ORPHANS=1 ;;
    -h|--help)
      sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "[提示] 未知参数 $arg，已忽略。可用：--prune-logs / --deep / --report / --prune-orphans" >&2
      ;;
  esac
done

# help 之后再检查 docker：这样在没装 Docker 的机器上也能正常看用法。
if ! command -v docker >/dev/null 2>&1; then
  echo "[错误] 没找到 docker 命令。这个脚本要在装了 Docker 的 NAS 上跑。" >&2
  exit 1
fi

show_space() {
  echo "==== $1 Docker 占用 ===="
  docker system df || true
  echo "---- 构建缓存明细（system df 的 Build Cache 行只算默认 builder）----"
  docker buildx du 2>/dev/null | tail -n 3 || echo "(当前引擎不支持 buildx du，跳过)"
  echo ""
}

# 只读诊断：把镜像、容器、卷全量列出来，不截断。
# 为什么要列容器：镜像只要还被任何一个容器引用，就不是 dangling，
# docker image prune -f 一条都删不掉 —— 这时 Images 行会显示
# 「可回收几乎为 0」。不看容器就无法解释这个现象。
show_report_detail() {
  echo "==== 镜像（可回收量取决于是否还被容器引用）===="
  docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedSince}}' 2>/dev/null || true
  echo ""
  echo "==== 容器（运行中的容器会一直占着它的镜像）===="
  docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Size}}' 2>/dev/null || true
  echo ""
  echo "==== 卷（脚本永不删卷，这里只做展示）===="
  docker system df -v 2>/dev/null \
    | awk '/^VOLUME NAME/{f=1} f && /^Build cache usage/{exit} f' || true
  echo ""
  echo "---- LINKS=0 的卷（没有任何容器在用，属于历史残留）----"
  docker system df -v 2>/dev/null \
    | awk '/^VOLUME NAME/{f=1;next} f && /^Build cache usage/{exit} f && $2=="0"{print "  " $1 "  " $3}' || true
  echo ""
}

# 读法说明：只讲怎么看这张表，不替用户下结论（结论要看实际数字）。
show_read_guide() {
  echo "==== 怎么读上面这张表 ===="
  echo "1) Images 行的 RECLAIMABLE 很小（比如只有几 MB）→ 镜像都被容器引用着，"
  echo "   image prune 删不掉任何一条，得先处理容器，不是继续清镜像。"
  echo "2) Containers 行的 ACTIVE 数量 > 1 → 大概率有历史遗留的重复实例在跑，"
  echo "   每个都占一份镜像和一层可写空间，这是「清不干净」最常见的原因。"
  echo "3) Build Cache 行很小 → 构建缓存不是大头，别在这上面找空间。"
  echo "4) 四块加起来明显小于涨出来的量 → 去查这个："
  echo "   du -sh /var/lib/docker        # 与 system df 对照，差额是未统计的层/日志"
  echo "   以及 fnOS 的回收站 / 快照（那部分不属于 Docker，prune 管不到）"
  echo ""
  mine=$(docker ps -a --format '{{.Names}}\t{{.Image}}' 2>/dev/null \
    | awk -F'\t' '$2 ~ /^qq-farm-bot/ || $1 ~ /^qq-farm/ {print "  " $1 "  (" $2 ")"}' || true)
  total=$(printf '%s\n' "$mine" | grep -c 'qq-farm' || true)
  if [ "${total:-0}" -gt 1 ]; then
    echo "⚠ 属于本项目的容器有 ${total} 个，正常只应该有 1 个（qq-farm-bot）："
    printf '%s\n' "$mine"
    echo ""
    echo "  多出来的通常是换过 compose project 名 / 换过目录后遗留的，它们一直"
    echo "  占着旧镜像不放，导致 image prune 只能回收几 MB。逐个确认后停掉即可："
    echo "    docker stop <容器名> && docker rm <容器名>"
    echo "  （脚本不会自动停，避免误停你正在用的那个实例）"
    echo ""
  fi
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

# 清理历史残留：旧的已停止容器、无人引用的旧镜像。
# 安全边界（三层）：
#   1. 只删「已停止」容器，运行中的一律跳过 —— 不会影响正在跑的服务。
#   2. 只处理名字属于本项目的对象，别的容器/镜像碰都不碰。
#   3. 体积残留卷只报告不删除：里面可能是旧账号数据，删错了无法恢复，
#      而这点体积（实测约 13MB）省下来也换不来多少空间。
prune_orphans() {
  echo "==== 清理历史残留 ===="

  echo "---- 已停止的本项目容器 ----"
  stopped=$(docker ps -a --filter 'status=exited' --filter 'status=created' \
    --format '{{.Names}}' 2>/dev/null | grep -E '^qq-farm' | grep -vx 'qq-farm-bot' || true)
  if [ -z "$stopped" ]; then
    echo "  没有需要清理的已停止容器。"
  else
    for name in $stopped; do
      # 双保险：再确认一次它确实没在运行
      if [ -z "$(docker ps -q --filter "name=^${name}$" 2>/dev/null)" ]; then
        docker rm "$name" >/dev/null 2>&1 && echo "  已删除容器 $name" || echo "  [跳过] 容器 $name 删除失败"
      else
        echo "  [跳过] 容器 $name 仍在运行"
      fi
    done
  fi

  echo "---- 悬空镜像 ----"
  before=$(docker images -q -f dangling=true 2>/dev/null | wc -l | tr -d ' ')
  docker image prune -f >/dev/null 2>&1 || true
  after=$(docker images -q -f dangling=true 2>/dev/null | wc -l | tr -d ' ')
  echo "  悬空镜像：清理前 ${before} 个 → 清理后 ${after} 个"

  echo "---- 体积残留卷（只报告，不删除）----"
  # LINKS=0 表示没有任何容器引用。名字像旧 project / 测试卷的列出来，
  # 让用户自己确认后再删 —— 里面可能装着早期账号数据。
  orphans=$(docker system df -v 2>/dev/null \
    | awk '/^VOLUME NAME/{f=1;next} f && /^Build cache usage/{exit} f && $2=="0"{print $1}' || true)
  reported=0
  for vol in $orphans; do
    case "$vol" in
      qq-farm-test-*|qq-farm-bot-go_*)
        echo "  残留卷 $vol（无容器引用）"
        reported=1
        ;;
    esac
  done
  if [ "$reported" = "1" ]; then
    echo "  → 确认不需要后手动执行：docker volume rm <上面列出的卷名>"
    echo "    （脚本不会自动删，避免误删早期账号数据）"
  else
    echo "  没有发现明显的残留卷。"
  fi
  echo ""
}

if [ "$REPORT_ONLY" = "1" ]; then
  show_space "当前"
  show_report_detail
  show_read_guide
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

if [ "$PRUNE_ORPHANS" = "1" ]; then
  prune_orphans
fi

if [ "$PRUNE_LOGS" = "1" ]; then
  prune_logs
fi

show_space "部署后"
echo "==== 容器状态 ===="
docker compose ps
echo "完成。数据卷 qq-farm-data / qq-farm-logs 未被删除或重建。"
show_read_guide
