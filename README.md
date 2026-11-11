<div align="center">

<img src="web/public/icon.png" width="72" alt="QQ Farm Bot 农场图标">

# QQ Farm Bot

**把日常农活交给小帮手，给每一次丰收留点期待。**

多账号管理 · 日常农活 · 作物图鉴 · Web 控制面板

<kbd>🌱 Node.js 20.19+</kbd> &nbsp; <kbd>📦 pnpm 10</kbd> &nbsp; <kbd>💚 Vue 3</kbd> &nbsp; <kbd>🐳 Docker Compose</kbd>

<br><br>
<img src="web/public/activity/star-festival/star-farm.png" width="320" alt="农场主题插画：绿植环绕的小屋与庭院">

[🌾 看看功能](#功能) · [🤖 AI 安装](#ai安装) · [🚜 源码部署](#源码部署) · [🐳 Docker 部署](#docker-部署) · [🔑 账号登录](#账号登录) · [📖 使用文档](#文档)

</div>

> [!WARNING]
> 本项目仅供学习和研究。自动化操作可能违反游戏服务条款，账号限制、数据丢失等风险由使用者自行承担。请勿用于商业运营、破坏游戏公平性或其他违法违规用途。

> [!IMPORTANT]
> 首次启动会创建默认管理员 `admin` / `admin`，Web 面板默认端口 `3007`。登录后请立即修改密码，不要把未加防护的管理端口直接暴露到公网。

基于 Node.js 的 QQ 农场自动化工具：TypeScript 后端直接对接游戏 WebSocket 与 Protobuf 协议，Vue 3 单页面板兼顾桌面与移动端。账号、策略、日志和数据都保存在本机，不依赖任何第三方托管服务。

<a name="功能"></a>

## 🌾 能做什么

<table>
<tr>
<td align="center" width="33%">
<img src="core/src/gameConfig/seed_images_named/10007_浇水_icon_watering.png" height="64" alt="浇水壶图标">
<br><br><b>🌱 打理日常农活</b>
<p>收获、种植、浇水、除草、除虫<br>自动施肥、批量操作与多种种植策略</p>
</td>
<td align="center" width="33%">
<img src="core/src/gameConfig/seed_images_named/42254.png" height="64" alt="作物图鉴图标">
<br><br><b>🌻 认识每株作物</b>
<p>作物图鉴、超变图鉴与土地状态<br>等级、进度、收藏与属性加成一目了然</p>
</td>
<td align="center" width="33%">
<img src="web/public/activity/star-festival/star-token.png" height="64" alt="活动道具图标">
<br><br><b>🎉 看看任务与活动</b>
<p>任务、商城、背包与已适配活动<br>奖励预览、领取和兑换都能操作</p>
</td>
</tr>
</table>

- 👨‍🌾 **照看多座农场**：账号独立运行、分别配置策略与间隔，支持启停、状态监控、实时日志和下线提醒。
- 🤝 **串门与帮忙**：自动拜访好友、帮忙与偷菜，支持好友黑名单、安静时段和互动经验上限。
- 🎒 **背包与交易**：查看和使用背包物品，浏览商城限购与折扣并执行购买。
- ⚙️ **Web 控制面板**：概览、个人、活动、好友、分析、商城与设置等页面，Socket.IO 实时状态，桌面与移动端均已适配。

活动支持随游戏更新而变化，部分活动仅提供只读展示；可用的领取与兑换操作以面板为准。

<a name="ai安装"></a>

## 🤖 让 AI 帮你安装

不想逐项配置？把下面这段话发给能操作本机终端的 AI 助手（Claude Code、Codex、Cursor、WorkBuddy 等），让它先读仓库里的说明，再完成安装和验证：

```text
请帮我在当前机器安装 GitHub 项目 602832789/qq-farm-bot。

先克隆仓库，阅读根目录 README.md 与 AGENTS.md，按「源码部署」章节执行：
1. 检查 Node.js >= 20.19、pnpm 10.x，缺失时用 corepack enable 启用；
2. 执行 pnpm install 与 pnpm build:web；
3. 后台常驻启动：Linux/macOS 用 bash ./start.sh，Windows 用 start.bat；
   确认 3007 端口已监听、日志无报错；
4. 告诉我访问地址、进程怎么停、运行数据存在哪个目录；
5. 提醒我首次登录用 admin / admin，并在面板里改掉默认密码。

注意：不要删除仓库根目录的 .npmrc（node-linker=hoisted），
否则 core 的 tsc 会因 TS2742 无法推断类型而构建失败。
```

助手会复用已有依赖和构建产物，只重建缺失或过期的部分；修改密码、微信扫码和账号登录仍由你在面板里完成。

<a name="源码部署"></a>

## 🚜 源码部署

需要 Node.js 20.19+、Git 和 pnpm 10（本项目锁定 `10.30.2`），推荐 Node.js 24 LTS 或 22 LTS。

```bash
git clone https://github.com/602832789/qq-farm-bot.git
cd qq-farm-bot

corepack enable
corepack prepare pnpm@10.30.2 --activate
pnpm install
pnpm build:web
pnpm dev:core
```

启动后访问 `http://localhost:3007`，用 `admin` / `admin` 登录。

| 场景 | 做法 |
| --- | --- |
| 后台常驻（Linux / macOS） | `bash ./start.sh`，日志 `tail -f app_dev.log`，停止 `bash ./stop.sh` |
| 后台常驻（Windows） | 双击 `start.bat`，用 `stop.bat` 停止 |
| 完整重建 | `bash ./start.sh --rebuild` |
| 开发模式 | 两个终端分别跑 `pnpm dev:web` 与 `pnpm dev:core` |
| 免装 Node.js | 从 [Releases](https://github.com/602832789/qq-farm-bot/releases) 下载二进制，或执行 `pnpm package:release` 自行构建 |

`pnpm dev:core` 只启动后端，需先构建一次前端；`pnpm dev` 会先构建前端再启动后端。更新时先停服务，`git pull --ff-only` 后重新执行 `pnpm install` 与 `pnpm build:web`。

> [!TIP]
> 根目录 `.npmrc` 的 `node-linker=hoisted` 让 `node_modules` 使用扁平布局。删除后 `tsc` 会因 TS2742 无法推断 Express 类型而中断 `core` 构建，请保留它。

<a name="docker-部署"></a>

## 🐳 Docker 部署

需要 Git 和 Docker Compose。

```bash
git clone https://github.com/602832789/qq-farm-bot.git
cd qq-farm-bot
docker compose up -d --build

# 查看状态与日志
docker compose ps
docker compose logs -f

# 停止并移除容器
docker compose down
```

| 用途 | 端口或位置 |
| --- | --- |
| 管理面板 | `3007`（根目录 `.env` 的 `PORT` 控制宿主机映射） |
| 持久化数据 | `qq-farm-data` 命名卷，容器内 `/app/core/data` |
| 运行日志 | `qq-farm-logs` 命名卷 |

`docker compose down` 不会删除命名卷，除非确认要清空数据，不要加 `-v`。更新时先 `git pull --ff-only`，再执行 `docker compose up -d --build`。

### 📦 NAS 反复部署时的空间维护

反复 `docker compose up -d --build` 确实会让占用上涨，但**大头不是构建缓存**。实测一台反复部署的 fnOS（跑着 10 个别的服务），`docker system df` 给出的是这组数字：

```
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          12        11        5.158GB   335.4MB (6%)
Containers      11        11        915.3MB   0B (0%)
Local Volumes   11        5         1.505GB   15.12MB (1%)
Build Cache     56        0         791.1MB   791.1MB
```

- **构建缓存不是大头**：`system df` 报 791MB、`docker buildx du` 报 1.177GB，但 `/vol1/docker/buildkit` 实测只有 **49MB**。前者是缓存记录的逻辑大小（含已失效记录），后者才是真占盘 —— 两个数字不能混着看。
- **镜像 5.158GB 里可回收只有 335MB**：其中 327MB 是重建后没清的 `<none>`（上一版），跑一次 `docker image prune -f` 就回来了；剩下 8.4MB 是零头。被容器引用的镜像不算 dangling，`prune` 删不掉。
- **11 个容器全在跑，但那是 10 个不同的服务 + 本项目 1 个**（贴吧签到、音乐三件套、mysql、青龙、xiaoya、lucky、qd），不同服务各占一份镜像是正常的。
- 判断冗余要看**同一个镜像被起了几个容器**，不是数容器总数。这台机器上没有一个镜像是重复的，所以并没有什么「重复实例」可清。
- 折算下来，这 8.4GB 里属于本项目的只有约 **330MB**（`qq-farm-bot:latest` 327MB + 两个命名卷约 2.5MB）。

**最关键的一条：`du` 必须带 `-x`。** `/vol1/docker` 下有 `overlay2/<id>/merged` 这些 overlay 挂载点，`du` 一旦跨进去，会把每个容器的完整根目录视图再算一遍（mysql 501MB + sq 音乐 1.57GB + xiaoya 800MB + 青龙 1.13GB…）。实测同一时刻：**不带 `-x` 报 15G，带 `-x` 是 9.3G，明细合计也是 9.3G** —— 差了 5.7G 纯属重复计算。`--report` 的汇总和明细现在统一带 `-x`。

所以「清了只掉 2G」的真因**不是清理命令写错了**：Docker 总共 9.3G，能清的只有几百 MB，其余是别的服务本来就在用的。该卷 80G 里已用 36G，扣掉 Docker 的 9.3G，**还有约 27G 不在 Docker 里**，那才是要查的地方（`--report` 末尾给了拆解命令）。

**以前踩过的坑**：`docker builder prune` 不带 `-a` 只删 dangling 缓存记录，每次重建产生的层都不算 dangling，等于几乎没删。现在脚本统一带 `-a` 并用 `--keep-storage` 设上限，但这一项只能回收 100–200MB 量级，别指望靠它解决大头。

另外应用自己往 `qq-farm-logs` 卷里写 `combined.log` / `error.log`，现在已加体积上限（默认 100MB，`LOG_MAX_SIZE_MB` 可调），容器控制台日志另有 `json-file` 的 `10m × 3` 上限。

**以后每次更新用一键脚本**（只删没人引用的东西，绝不碰数据卷）：

```bash
bash scripts/nas-deploy.sh                  # 回收构建缓存 → git pull → 重建 → 清悬空镜像
bash scripts/nas-deploy.sh --report         # 只读诊断：镜像/容器/卷全量 + 怎么读这张表
bash scripts/nas-deploy.sh --prune-orphans  # 清历史残留：已停止的旧容器 + 悬空镜像
bash scripts/nas-deploy.sh --prune-logs     # 额外截断应用日志卷里的日志
bash scripts/nas-deploy.sh --deep           # 空间告急：清空全部构建缓存 + 未使用镜像
```

- `--report` 会列出**所有**镜像、容器、卷（不截断），标出 `LINKS=0` 的残留卷，并额外做三件事：
  - **健康检查明细**：容器挂 `(unhealthy)` 时打印探针自己的退出码和输出。`docker ps` 只给结论，看不出是「服务没起来」还是「探针命令写错」。
  - **可回收的镜像**：单独列出 `<none>`（重建后上一版的镜像）和它的体积，并给出回收命令。
  - **磁盘对账**：用 `docker info` 取真实数据目录（NAS 常把 data-root 挪到数据盘，写死 `/var/lib/docker` 会 du 到空目录），给 `du -xsh` 实测占用、前 8 大子目录（同一口径）、所在文件系统的 `df`、文件系统类型；是 btrfs/zfs 就直接数快照数量；构建缓存单独量 `buildkit` 目录的实际落盘；最后给出「Docker 之外还剩多少、怎么拆」。
- 冗余判断只看**同一个镜像起了多个容器**；不同服务各一个容器不算，不会误报。
- `--prune-orphans` 只删**已停止**的本项目容器（名字以 `qq-farm` 开头、且不是 `qq-farm-bot`），删之前还会再确认一次没在运行。数据卷和残留卷只报告不删——里面可能装着早期账号数据，删错无法恢复。
- 构建缓存上限默认 2048MB，`BUILD_CACHE_KEEP_MB=4096 bash scripts/nas-deploy.sh` 可换更大预算。
- **回收在构建之前做**，所以盘快满时老缓存会先被削下去，构建不会因为 `no space left` 失败。

**已经涨上去的空间，按这个顺序清**：

```bash
# 1) 先看空间花在哪：先看 SIZE，再看每个容器用的是不是同一个镜像
docker system df
docker ps -a                            # 本项目应该只有 1 个 qq-farm-bot，别的服务不算冗余
docker ps -a --format '{{.Image}}' | sort | uniq -d   # 有输出才是真的重复实例
docker images                           # 哪些镜像被谁引用着
docker system df -v                     # 卷的 LINKS 列，0 = 没人引用
docker buildx du                        # 构建缓存真实值；有多个 builder 时用 docker buildx ls 看谁在占

# 2) 先备份账号数据到宿主机（内含账号凭据，别外传）
mkdir -p ~/qq-farm-backup
docker run --rm --entrypoint sh \
  -v qq-farm-data:/src -v ~/qq-farm-backup:/backup \
  qq-farm-bot:latest -c 'tar czf /backup/data-$(date +%F).tar.gz -C /src .'

# 3) 分级回收，随时可以停在某一步
docker image prune -f          # 只删 <none> 悬空镜像，最安全；但被容器引用的删不掉
docker builder prune -a -f     # 清空全部构建缓存：**-a 不能省**，省了就只删 dangling
docker builder prune -a -f --keep-storage 2147483648   # 或者只保留 2GB，按最久未用删

# 3.5) 容器太多时才需要这一步：镜像被旧容器钉住，只能先停容器再清镜像
docker ps -a                                   # 先逐个确认，别停掉正在用的
docker stop <多余的容器名> && docker rm <多余的容器名>
docker image prune -a -f --filter "until=1h"   # 这时旧镜像才真正变成可回收

# 4) 日志卷单独处理：只截断文件，不删卷、不重启容器
docker exec qq-farm-bot sh -c 'du -sh /app/core/data/logs'
docker exec qq-farm-bot sh -c 'for f in /app/core/data/logs/*.log; do : > "$f"; done'

# 5) 复核
docker system df
```

> 清完 `docker system df` 四块加起来仍明显小于涨出来的量时，`bash scripts/nas-deploy.sh --report` 末尾的「磁盘对账」会把差额直接算给你。还想手工核，按这个顺序看三处：
>
> ```bash
> docker info --format '{{.DockerRootDir}}'    # 真实的 Docker 目录，别假设是 /var/lib/docker
> du -xsh "$(docker info --format '{{.DockerRootDir}}')"/* | sort -rh | head   # 一定带 -x，否则 overlay 挂载点会重复计
> docker buildx ls                            # 还有别的 builder 吗？每个缓存独立
> stat -f -c %T /                              # 文件系统是 btrfs/zfs 吗
> btrfs subvolume list -s /                    # 有快照就说明删掉的文件还被引用着
> ```
>
> 快照 / NAS 回收站这部分**不属于 Docker，`prune` 永远清不到**，只能到 fnOS 控制面板去删快照或清回收站。

> **⚠️ 以下操作会不可逆地删掉账号数据，不要执行**：`docker compose down -v`、`docker system prune --volumes`、`docker system prune -a --volumes`、`docker volume prune -f`、`rm -rf /var/lib/docker`。它们会删除「当前没有被容器引用」的命名卷；容器一旦处于停止状态，`qq-farm-data` 里的账号、Code、refreshtoken 就会一起消失。

QQ 扫码登录所需的 NapCat 服务默认不随 Compose 启动，需要时用 `napcat/Dockerfile` 自行构建。其余环境变量、构建参数与镜像细节见 [详细参考](docs/detailed-reference.md#部署细节)。

<a name="账号登录"></a>

## 🔑 账号登录

1. 打开面板，用 `admin` / `admin` 登录，先到「设置 → 系统设置」修改管理员密码。
2. 在「添加账号」选择登录方式，配置种植、自动化与好友策略。
3. 启动账号，在概览页确认连接状态、农场数据和实时日志。

| 方式 | 说明 |
| --- | --- |
| 抓包 Code | 填入游戏 Code，或粘贴包含 Code 的 WebSocket 地址 |
| 微信扫码 | 面板内直接扫码授权，无需另行部署扫码服务 |
| QQ 扫码 | 需自建 [qq-miniapp-auth](https://github.com/liyangpengs/qq-miniapp-auth) 服务，并在登录设置里填写地址与接口签名 |

Code 有时效性，登录失败时先重新获取或重新扫码。QQ 扫码的 NapCat 容器与凭据存放说明见 [详细参考](docs/detailed-reference.md#账号登录细节)。

<a name="命令"></a>

## 🛠️ 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev:core` | 启动后端和已构建的面板 |
| `pnpm dev:web` | 启动前端开发服务器 |
| `pnpm build:web` | 构建前端 |
| `pnpm lint` | 检查并自动修复前后端代码 |
| `pnpm -C core test` | 编译并运行后端测试 |
| `pnpm typecheck:web` | 前端类型检查 |

完整的构建、打包、清理与抓包分析命令见 [详细参考](docs/detailed-reference.md#开发命令)。

<a name="数据"></a>

## 🧺 数据与备份

| 运行方式 | 数据位置 |
| --- | --- |
| 源码运行 | `core/data/` |
| 二进制运行 | 可执行文件同级的 `data/` |
| Docker | `qq-farm-data` 命名卷 |

升级或迁移前先停止服务，备份整个数据目录或命名卷；不要只复制单个 JSON 文件，也不要把数据目录、`.env`、日志或密钥提交到公开仓库。

<a name="文档"></a>

## 📖 继续逛逛

- [详细参考](docs/detailed-reference.md) —— 环境变量、策略与施肥模式、项目结构、全部开发命令、来源与许可
- [专题文档索引](docs/README.md) —— 协议研究、活动实现与工具说明
- [仓库约定与 AI 安装指南](AGENTS.md)
- [更新记录](docs/CHANGELOG.md)

本项目沿用 [PolyForm Noncommercial License 1.0.0](LICENSE)，仅限非商业用途；使用前请阅读 [免责声明](docs/detailed-reference.md#免责声明)。

---

<div align="center">

<img src="core/src/gameConfig/seed_images_named/1001_金币_golds.png" height="44" alt="金币图标"> &nbsp;
<img src="core/src/gameConfig/seed_images_named/10001_收获_icon_harvest.png" height="44" alt="收获图标"> &nbsp;
<img src="core/src/gameConfig/seed_images_named/41435.png" height="44" alt="作物果实图标">

**一块小田，一点期待。🌿**

感谢所有上游开源项目与参与反馈的使用者。如果觉得有用，欢迎点一个 Star。

</div>
