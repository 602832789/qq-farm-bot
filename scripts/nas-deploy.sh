#!/bin/sh
# NAS 一键更新部署：回收旧缓存 → 拉代码 → 重建 → 回收旧镜像。
#
# 用法（在仓库根目录或任意目录都行，脚本会自己切到仓库根）：
#   bash scripts/nas-deploy.sh                # 常规更新，数据卷和日志卷都不动
#   bash scripts/nas-deploy.sh --prune-logs   # 额外截断应用日志卷里的日志
#   bash scripts/nas-deploy.sh --deep         # 空间告急：清空全部构建缓存
#   bash scripts/nas-deploy.sh --report       # 只读诊断：列出镜像/容器/卷全量
#   bash scripts/nas-deploy.sh --report --scan-volume
#                                             # 再加一步：扫整块盘的目录占用，
#                                             # 回答「Docker 之外那 27G 是谁」
#   bash scripts/nas-deploy.sh --prune-orphans  # 清历史残留（已停止的旧容器 +
#                                             # 无人引用的旧镜像 + 遗留测试卷）
#
# 空间涨上去的来源，按实测占比从大到小：
#   1. 别人的服务。NAS 上通常还跑着一堆别的容器（网盘、音乐、青龙……），
#      docker system df 的 4.9GB 里可能只有 300MB 是本项目的。看到 Containers
#      ACTIVE=11 不等于有 10 个冗余实例 —— 先按镜像分组，同镜像多实例才算冗余。
#   2. 镜像被容器引用着 → 全都不算 dangling，image prune 一条都删不掉。
#      典型表现：Images 行 TOTAL=11、ACTIVE=11、可回收只有几 MB。
#   3. 容器可写层 + 容器 json 日志 → 容器长期运行会稳定累积。
#   4. 构建缓存 → docker system df 的 Build Cache 行只统计默认 builder，
#      真实值要看 docker buildx du；实测经常只占 100–200MB，不是大头。
#   5. system df 之外的部分 → 文件系统快照（btrfs/zfs）、NAS 回收站、大文件。
#      prune 管不到这些，这也是「清完只掉 2G」最常见的答案。对账看 --report。
#      实测另一个常见大头是 fnOS 自己的 @appmeta / @sysappmeta / @appdata：
#      应用每升级一次就在里面留一份旧版本，攒到十几 G 很常见，同样不属于
#      Docker。--scan-volume 会把这几层直接摊开给你看（只读，不删）。
#
# 设计原则：只删「没有任何东西在引用」的东西，且只碰本项目的对象。
#   - docker image prune -f      只删 <none> 悬空镜像，正在跑的镜像不会被删
#   - docker builder prune -a    删未使用的构建缓存（带 -a 才会真删）
#   - --prune-orphans 只动名字属于本项目的残留，且绝不删除运行中的容器；
#     数据卷 qq-farm-data / qq-farm-logs 是硬编码白名单，任何模式都不碰。
#   - 别人的容器、镜像、卷一律不动：脚本没有能力判断它们对你有没用。
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
SCAN_VOLUME=0

for arg in "$@"; do
  case "$arg" in
    --prune-logs) PRUNE_LOGS=1 ;;
    --deep) DEEP=1 ;;
    --report) REPORT_ONLY=1 ;;
    --scan-volume) SCAN_VOLUME=1; REPORT_ONLY=1 ;;
    --prune-orphans) PRUNE_ORPHANS=1 ;;
    -h|--help)
      # 打印文件头注释直到 set -eu；不写死行号，改注释不会让用法说明截断。
      awk 'NR>1 && /^set -eu/{exit} NR>1 && /^#/{sub(/^# ?/, ""); print}' "$0"
      exit 0
      ;;
    *)
      echo "[提示] 未知参数 $arg，已忽略。可用：--prune-logs / --deep / --report / --scan-volume / --prune-orphans" >&2
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
  show_health_detail
}

# 容器状态里的 (unhealthy) 只是结论，看不出原因。健康检查自己的输出才带
# 退出码和报错文本 —— 那是唯一能区分「服务没起来」和「探测命令用错」的证据。
show_health_detail() {
  echo "==== 本项目容器的健康检查 ===="
  status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    qq-farm-bot 2>/dev/null | tr -d '\r' || true)
  if [ -z "$status" ]; then
    echo "  未找到 qq-farm-bot 容器，跳过。"
    echo ""
    return 0
  fi
  echo "  当前状态：$status"
  if [ "$status" = "unhealthy" ]; then
    echo "  最近几次探测（退出码 + 输出）："
    docker inspect --format '{{range $i, $l := .State.Health.Log}}{{$l.ExitCode}} {{$l.Output}}{{end}}' \
      qq-farm-bot 2>/dev/null | tr -d '\r' | sed 's/^/    /' || true
    echo "  手动复现（把探针命令原样在容器里跑一遍）："
    echo "    docker inspect --format '{{json .Config.Healthcheck.Test}}' qq-farm-bot"
    echo "    docker exec qq-farm-bot sh -c 'wget -q --spider http://127.0.0.1:3007/api/game-version; echo exit=\$?'"
  fi
  echo ""
}

# 磁盘对账：把 Docker 的真实占用算出来，而不是只看 system df 那四行汇总。
# 为什么需要它：四行加起来经常明显小于磁盘涨上去的量。差额要么在 Docker 目录里
# 但没被统计（容器 json 日志、别的 builder 的缓存、构建临时目录），要么根本不在
# Docker 里（btrfs/zfs 快照、NAS 回收站、别的大文件）——后者 prune 永远清不掉。
# 这一节全部只读，不改任何东西。
show_disk_audit() {
  echo "==== 磁盘对账（Docker 真实占多大、涨在哪）===="
  # 数据目录从 docker info 取，不写死 /var/lib/docker：NAS 常把 data-root 挪到
  # 数据盘中，写死路径会 du 到空目录、得出「Docker 只占 0B」的错误结论。
  root=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null | tr -d '\r' || true)
  [ -n "$root" ] || root=/var/lib/docker
  echo "  Docker 数据目录：$root"
  if [ ! -d "$root" ]; then
    echo "  [跳过] 目录不存在或不可读（非 root 运行时常见），请用 root 再跑一次 --report"
    echo ""
    return 0
  fi

  # 汇总和明细必须同一个口径，一律带 -x：这个目录下 overlay2/<id>/merged 是
  # overlay 的挂载点，du 一旦跨进去，会把每个容器的完整根目录视图再算一遍
  # （mysql 501MB + sq 音乐 1.57GB + xiaoya 800MB + 青龙 1.13GB…），
  # 实测能把总量从 9.3G 虚报成 15G，白找 5.7G 不存在的东西。
  echo "  du 实测占用：$(du -sxh "$root" 2>/dev/null | awk '{print $1}' || echo '?')   （-x：不跨进 overlay 挂载点/别的文件系统）"
  echo "  前 8 大子目录（同一口径）："
  du -sxh "$root"/* 2>/dev/null | sort -rh | head -n 8 | sed 's/^/    /' || true
  # 构建缓存真实落盘在 buildkit 目录（含 --mount=type=cache 的 pnpm store）。
  # system df 的 Build Cache 行经常显示 0B（只算默认 builder 的可见部分）。
  if [ -d "$root/buildkit" ]; then
    echo "  构建缓存落盘（含 pnpm store 缓存卷）：$(du -sh "$root/buildkit" 2>/dev/null | awk '{print $1}')"
    echo "    注：buildx du 报的是缓存记录的逻辑大小（含已失效记录），常远大于实际落盘。"
  fi
  echo ""

  echo "---- 可回收的镜像 ----"
  dangling=$(docker images -f dangling=true --format '{{.ID}}  {{.Size}}  {{.CreatedSince}}' 2>/dev/null || true)
  if [ -z "$dangling" ]; then
    echo "  没有悬空镜像，镜像这块没什么可回收的。"
  else
    echo "  悬空镜像（<none>，重建后上一版留下的）："
    printf '%s\n' "$dangling" | sed 's/^/    /'
    echo "  → 回收：docker image prune -f"
  fi
  echo ""

  echo "---- 这个目录所在的文件系统 ----"
  df -h "$root" 2>/dev/null | sed 's/^/  /' || true
  fs_type=$(stat -f -c %T "$root" 2>/dev/null || echo unknown)
  echo "  文件系统类型：$fs_type"
  case "$fs_type" in
    btrfs|zfs)
      mnt=$(df -P "$root" 2>/dev/null | awk 'NR==2{print $6}')
      echo "  $fs_type 上「删掉的文件」只要还被快照引用，空间就不会释放，"
      echo "  这部分不属于 Docker，prune / docker system df 都不涉及。"
      if [ "$fs_type" = "btrfs" ] && command -v btrfs >/dev/null 2>&1; then
        snaps=$(btrfs subvolume list -s "${mnt:-/}" 2>/dev/null | wc -l | tr -d ' ' || true)
        echo "  本文件系统快照数量：${snaps:-0}    查看：btrfs subvolume list -s ${mnt:-/}"
      fi
      echo "  fnOS 还要另外看控制面板 → 快照 / 回收站。"
      ;;
  esac
  echo ""

  echo "---- 容器日志（json-file，compose 已限制单容器 10m×3）----"
  if [ -d "$root/containers" ]; then
    # 用 find 取路径再 du：某些 sh 下 *-json.log 的 glob 展开会被参数长度截断。
    find "$root/containers" -type f -name '*-json.log' 2>/dev/null | head -n 50 > /tmp/.farm_logs.$$ || true
    if [ -s /tmp/.farm_logs.$$ ]; then
      # shellcheck disable=SC2046
      du -h $(cat /tmp/.farm_logs.$$) 2>/dev/null | sort -rh | head -n 5 | sed 's/^/  /' || true
    else
      echo "  没有找到容器 json 日志文件。"
    fi
    rm -f /tmp/.farm_logs.$$
  else
    echo "  没有找到 containers 目录，跳过。"
  fi
  echo ""

  # 差额归谁：df 的 Used 减掉上面 du 的占用，就是该卷上非 Docker 的部分。
  # 这里不自动跑整卷扫描：数据盘上可能是几十万个文件，du 一遍要好几分钟，
  # 常规诊断不该被这个拖住。要扫就加 --scan-volume。
  volume=$(df -P "$root" 2>/dev/null | awk 'NR==2{print $6}')
  echo "---- Docker 之外的部分 ----"
  echo "  df 的 Used 减掉上面 du 的占用，就是该卷上不属于 Docker 的量。"
  echo "  这个量通常落在两处：fnOS 自己的 @appmeta / @sysappmeta / @appdata，"
  echo "  以及快照 / 回收站 / 别的大文件。都不是 prune 能处理的。"
  echo "  要摊开看（只读，可能几分钟）："
  echo "    bash scripts/nas-deploy.sh --report --scan-volume"
  echo "  或者手跑：du -xsh ${volume:-/}/* | sort -rh | head -n 15"
  echo ""
}

# 卷内占用扫描：把「Docker 之外那 27G 到底是谁」一次问清。
# 纯只读：只有 du 和打印，一个字节都不删 —— 尤其绝不碰 fnOS 的 @app* 目录，
# 那些是应用中心在管的，rm 掉会让对应应用变成「已安装但打不开」。
show_volume_scan() {
  root=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null | tr -d '\r' || true)
  [ -n "$root" ] || root=/var/lib/docker
  volume=$(df -P "$root" 2>/dev/null | awk 'NR==2{print $6}')
  [ -n "$volume" ] || volume=/
  top="/tmp/.farm_vol.$$"
  drill="/tmp/.farm_drill.$$"

  echo "==== 卷内占用扫描（$volume，只读，可能要几分钟）===="
  echo "  口径与上面一致：du -x，不跨文件系统、不进 overlay 挂载点，"
  echo "  所以这里的数字可以直接和「磁盘对账」里的 df 对得上。"
  echo ""
  # 顶层一次列全：以前让人手敲的那条命令，现在自己跑。
  du -xsh "$volume"/* "$volume"/.[!.]* 2>/dev/null | sort -rh | head -n 15 > "$top" || true
  echo "---- $volume 顶层 ----"
  if [ -s "$top" ]; then
    sed 's/^/  /' "$top"
  else
    echo "  （读不到内容。整个卷的扫描需要 root，请用 root 再跑一次）"
    rm -f "$top" "$drill"
    echo ""
    return 0
  fi
  echo ""

  # 只对最大的几个目录下钻一层：再往下就得人看着数据决定往哪走，盲扫没意义。
  # 判据用「目录 + 不是 0」，不用 G/M 后缀做单位判断 —— 单位随 du 变，写死会漏。
  # 排除 Docker 数据目录本身：上面已经量过它了。
  awk -v R="$root" '$1 != "0" && $2 != R && $2 !~ /^total$/ {print $2}' "$top" 2>/dev/null \
    | while IFS= read -r d; do [ -d "$d" ] && printf '%s\n' "$d"; done \
    | head -n 5 > "$drill" || true
  count=$(wc -l < "$drill" 2>/dev/null | tr -d ' ' || echo 0)
  echo "---- 下钻：最大的 ${count:-0} 个目录里装了什么 ----"
  if [ "${count:-0}" -eq 0 ]; then
    echo "  没有可下钻的目录（顶层为空或全是文件）。"
  else
    while IFS= read -r d; do
      [ -d "$d" ] || continue
      echo ""
      echo "  [$d]"
      du -xsh "$d"/* "$d"/.[!.]* 2>/dev/null | sort -rh | head -n 8 | sed 's/^/    /' || true
    done < "$drill"
  fi
  echo ""

  # 命中了 fnOS 的系统目录才讲这段，没命中就不啰嗦。
  if grep -q '/@app' "$top" 2>/dev/null; then
    echo "---- 这些 @app* 目录是什么，能不能删 ----"
    echo "  @appmeta / @sysappmeta / @appcenter → 应用中心自己管的元数据与安装包。"
    echo "    应用每升级/重装一次就可能留一份旧的，攒到十几 G 很常见。"
    echo "  @appdata → 应用的真实数据（影视库、相册索引、下载内容……），删了数据就没了。"
    echo "  @appshare → 应用之间共享的文件。"
    echo "  ⚠ 别手动删这些目录：应用中心会显示「已安装」但应用打不开，且无法自愈。"
    echo "  正确做法：应用中心里卸载/重装对应应用，或用 fnOS 控制面板的清理功能。"
    echo "  本脚本只展示大小，一个字节都不会删。"
    echo ""
  fi
  rm -f "$top" "$drill"
}

# 读法说明：只讲怎么看这些表，不替用户下结论（结论要看实际数字）。
show_read_guide() {
  echo "==== 怎么读上面这几张表 ===="
  echo "1) Images 行的 RECLAIMABLE 很小（几 MB 级）→ 镜像都还被容器引用着，"
  echo "   image prune 删不掉任何一条，得先看是谁在用，不是继续清镜像。"
  echo "2) Containers 的 ACTIVE 数量多，不等于有冗余：先看是不是「同一个镜像被"
  echo "   起了多个实例」。不同服务各占一个容器、各占一份镜像是正常的。"
  echo "3) Build Cache 行算的是缓存记录大小，要和「构建缓存落盘」的 du 一起看："
  echo "   记录 1GB+ 而落盘只有几十 MB 时，说明那是记录不是真占盘，别在这找空间。"
  echo "4) 「可回收的镜像」有 <none> 就一条命令能回收（重建后上一版的镜像）。"
  echo "5) 要对账的是「磁盘对账」：du 实测 vs df 已用。差额说明占空间的东西不在"
  echo "   Docker 里（快照 / 回收站 / 别的服务的数据），prune 管不到。"
  echo ""
  # 只有同一个镜像被起了多个容器才算冗余；不同服务各一个容器不算。
  dup=$(docker ps -a --format '{{.Image}}' 2>/dev/null | sort | uniq -d || true)
  if [ -n "$dup" ]; then
    echo "⚠ 以下镜像被多个容器同时使用，多出来的实例各占一份可写层："
    printf '%s\n' "$dup" | sed 's/^/  /'
    echo "  逐个确认哪些是废弃实例后再停：docker stop <容器名> && docker rm <容器名>"
    echo "  （脚本不会自动停，避免误停你正在用的那个）"
    echo ""
  fi
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
  show_disk_audit
  if [ "$SCAN_VOLUME" = "1" ]; then
    show_volume_scan
  fi
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
if [ "$DEEP" = "1" ]; then
  # 深度清理是「空间告急」场景，才值得多花一次 du 做对账；常规部署不做。
  show_disk_audit
fi
echo "==== 容器状态 ===="
docker compose ps
echo "完成。数据卷 qq-farm-data / qq-farm-logs 未被删除或重建。"
show_read_guide
