# QQ 农场多账号挂机 + Web 面板

基于 Node.js 的 QQ 农场自动化工具，支持多账号管理、Web 控制面板、实时日志与数据分析。

> 📖 喜欢的点一个 star ⭐ 吧！
>
> 🔐 默认账号密码都是 `admin`，端口 `3007`，请部署登录后尽快修改密码！

---

## 功能截图

<div align="center">
  <img src="https://free.picui.cn/free/2026/05/09/69fefa26411d9.png" alt="功能截图" width="45%" />
  <img src="https://free.picui.cn/free/2026/05/09/69fefa25d5f5b.png" alt="功能截图" width="45%" />
  <img src="https://free.picui.cn/free/2026/05/09/69fefa269814f.png" alt="功能截图" width="45%" />
  <img src="https://free.picui.cn/free/2026/05/09/69fefa266be50.png" alt="功能截图" width="45%" />
  <img src="https://free.picui.cn/free/2026/05/09/69fefa2669c94.png" alt="功能截图" width="45%" />
  <img src="https://free.picui.cn/free/2026/05/09/69fefa3fab446.png" alt="功能截图" width="45%" />
</div>

---

## 功能特性

### 🌾 核心功能

- **多账号管理** — 同时挂机多个 QQ 农场账号，独立配置策略
- **Code 登录** — 通过抓包获取 code 登录游戏账号
- **自动化农场** — 自动种植、浇水、施肥、收获、偷菜
- **智能施肥** — 支持有机肥/普通肥/智能施肥模式，多季作物自动补肥
- **化肥自动购买** — 定时检测并自动购买化肥（有机肥/普通肥分别配置）
- **好友互动** — 自动访问好友农场、除草除虫、批量操作
- **数据分析** — 作物收益统计、种植策略推荐、黑名单管理

### 🎫 用户系统

- **卡密管理** — 支持时间卡密和额度卡密，批量创建与导出
- **卡密领取** — 用户注册时可免费领取时间卡密（管理员可开关）
- **用户认证** — 完整的登录注册系统，JWT 令牌认证

### 📡 通知与面板

- **推送通知** — 支持多种推送渠道（pushoo）：钉钉、企业微信、Telegram、Bark 等
- **Web 控制面板** — 实时日志、状态监控、远程管理
- **主题切换** — 农场风格主题，明暗模式切换
- **跨平台** — 源码运行或打包为 Windows / Linux / macOS 二进制

---

## 技术栈

**后端**

[<img src="https://skillicons.dev/icons?i=nodejs" height="48" title="Node.js 20+" />](https://nodejs.org/)
[<img src="https://skillicons.dev/icons?i=express" height="48" title="Express 4" />](https://expressjs.com/)
[<img src="https://skillicons.dev/icons?i=socketio" height="48" title="Socket.io 4" />](https://socket.io/)
[<img src="https://skillicons.dev/icons?i=ts" height="48" title="TypeScript 5.9" />](https://www.typescriptlang.org/)

**前端**

[<img src="https://skillicons.dev/icons?i=vue" height="48" title="Vue 3.5" />](https://vuejs.org/)
[<img src="https://skillicons.dev/icons?i=vite" height="48" title="Vite 7" />](https://vitejs.dev/)
[<img src="https://cdn.simpleicons.org/pinia/FFD859" height="48" title="Pinia 3" />](https://pinia.vuejs.org/)
[<img src="https://skillicons.dev/icons?i=unocss" height="48" title="UnoCSS" />](https://unocss.dev/)

**部署**

[<img src="https://skillicons.dev/icons?i=pnpm" height="48" title="pnpm 10" />](https://pnpm.io/)
[<img src="https://skillicons.dev/icons?i=docker" height="48" title="Docker" />](https://www.docker.com/)
[<img src="https://skillicons.dev/icons?i=githubactions" height="48" title="GitHub Actions" />](https://github.com/features/actions)

---

## 项目结构

```
qq-farm-bot/
├── core/                          # 后端（Node.js 机器人引擎）
│   ├── src/
│   │   ├── config/                # 配置管理 & 游戏配置
│   │   ├── controllers/admin/     # HTTP API 路由（账号、农场、好友、认证）
│   │   ├── core/                  # Worker 进程管理
│   │   ├── gameConfig/            # 游戏静态数据（作物、道具、等级）
│   │   │   └── seed_images_named/ # 作物种子图片资源
│   │   ├── models/
│   │   │   ├── store/             # 全局配置与账号持久化
│   │   │   └── user-store/        # 用户认证与卡片数据
│   │   ├── proto/                 # Protobuf 协议定义（20+ .proto 文件）
│   │   ├── runtime/               # 运行时引擎、状态管理、Worker 调度
│   │   ├── services/              # 业务逻辑
│   │   │   ├── farm/              # 农场核心（种植、土地分析、调度）
│   │   │   └── friend/            # 好友系统（访问策略、GID 管理、调度）
│   │   ├── types/                 # TypeScript 类型定义
│   │   └── utils/                 # 工具函数（加密 WASM、网络、Proto 解析）
│   └── data/                      # 运行时数据（accounts.json、store.json）
├── web/                           # 前端（Vue 3 + Vite）
│   ├── src/
│   │   ├── api/                   # API 客户端 & Socket.io 连接
│   │   ├── components/            # 通用组件（LandCard、BagPanel、Modal 等）
│   │   │   └── ui/                # 基础 UI 组件（Button、Input、Select、Switch）
│   │   ├── layouts/               # 页面布局（DefaultLayout）
│   │   ├── router/                # 路由配置 & 菜单定义
│   │   ├── stores/                # Pinia 状态管理（account、farm、friend 等）
│   │   └── views/                 # 页面视图
│   │       ├── Dashboard.vue      # 概览 — 实时状态、日志、快捷操作
│   │       ├── Personal.vue       # 个人 — 仓库、背包、作物管理
│   │       ├── Friends.vue        # 好友 — 访问、互动、黑名单
│   │       ├── Analytics.vue      # 分析 — 收益统计、种植策略
│   │       ├── Settings.vue       # 设置 — 账号、策略、自动化、用户
│   │       ├── AdminPanel.vue     # 后台 — 系统管理（管理员）
│   │       └── Login.vue          # 登录页
│   └── dist/                      # 构建产物
├── docker-compose.yml             # Docker Compose 配置
├── pnpm-workspace.yaml            # pnpm 工作区
└── package.json                   # 根 package.json（统一脚本）
```

---

## 环境要求

| 运行方式 | 要求 |
|---------|------|
| 源码运行 | Node.js 20+，pnpm（推荐通过 `corepack enable` 启用） |
| 二进制版 | 无需安装 Node.js，直接运行 |
| Docker | Docker 20+，Docker Compose 2+ |

---

## 安装与启动

### 方式一：源码运行（Windows）

```powershell
# 1. 安装 Node.js 20+（https://nodejs.org/）并启用 pnpm
node -v
corepack enable
pnpm -v

# 2. 克隆仓库并安装依赖
git clone https://github.com/XyhTender/qq-farm-bot.git
cd qq-farm-bot
pnpm install
pnpm build:web

# 3. 启动
pnpm dev:core

# （可选）设置其他端口后启动
$env:ADMIN_PORT="你的新端口"
pnpm dev:core
```

### 方式一：源码运行（Linux）

建议使用宝塔面板部署最为便捷，在网站其他项目选项中按照如图所示配置即可：

<img src="https://free.picui.cn/free/2026/03/27/69c6398dd326c.png" alt="宝塔部署示例" width="600" />

```bash
# 或手动部署
git clone https://github.com/XyhTender/qq-farm-bot.git
cd qq-farm-bot
pnpm install
pnpm build:web
pnpm dev:core
```

启动后访问面板：
- 本机：`http://localhost:3007`
- 局域网：`http://<你的IP>:3007`

---

### 方式二：Docker 部署

```bash
# 拉取仓库
git clone https://github.com/XyhTender/qq-farm-bot.git
cd qq-farm-bot

# 构建并后台启动
docker compose up -d --build

# 查看日志
docker compose logs -f

# 停止并移除容器
docker compose down
```

浏览器访问 `http://你的IP:3007`

---

### 方式三：二进制发布版（无需 Node.js）

#### 构建

```bash
pnpm install
pnpm package:release
```

产物输出在 `dist/bin/` 目录，也可在 [Releases](https://github.com/XyhTender/qq-farm-bot/releases) 中直接下载。

| 平台 | 文件名 |
|------|--------|
| Windows x64 | `qq-farm-bot.exe` |
| Linux x64 | `qq-farm-bot` |
| macOS Intel | `qq-farm-bot-x64` |
| macOS Apple Silicon | `qq-farm-bot-arm64` |

#### 运行

```bash
# Windows：双击 exe 或在终端执行
.\qq-farm-bot.exe

# Linux / macOS
chmod +x ./qq-farm-bot && ./qq-farm-bot
```

程序会在可执行文件同级目录自动创建 `data/` 并写入 `store.json`、`accounts.json`。

---

## 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `ADMIN_PORT` | `3007` | Web 面板端口 |
| `ADMIN_USER` | `admin` | 管理员用户名 |
| `ADMIN_PASS` | `admin` | 管理员密码 |

### 种植策略

| 策略 | 说明 |
|------|------|
| `max_exp` | 最大经验值（默认） |
| `max_profit` | 最大利润 |
| `max_fert_exp` | 施肥最大经验 |
| `max_fert_profit` | 施肥最大利润 |
| `level` | 按等级种植 |
| `preferred` | 优先种植指定作物 |
| `bag_priority` | 背包种子优先 |

### 施肥模式

| 模式 | 说明 |
|------|------|
| `smart` | 智能施肥（默认） |
| `both` | 有机肥 + 普通肥 |
| `organic` | 仅有机肥 |
| `normal` | 仅普通肥 |
| `none` | 关闭施肥 |

---

## 登录与安全

- 面板首次访问需要登录
- 默认管理账号：`admin` / `admin`
- ⚠️ **建议部署后立即修改为强密码**
- 支持 JWT 令牌认证，Token 有效期可配置

---

## 常见问题

### Q: 登录失败怎么办？
A: 请确保抓包获取的 code 有效，code 有时效性，过期需重新获取。

### Q: 如何批量添加账号？
A: 在后台管理面板的「账号」标签页中，支持批量导入账号。

### Q: 化肥购买不生效？
A: 请检查设置中是否开启了「化肥自动购买」功能，并确认购买数量和阈值配置正确。

### Q: 多季作物不自动施肥？
A: 请在设置中开启「多季作物自动施肥」选项。

---

## 特别感谢

- 基于 [Penty-d/qq-farm-bot-ui](https://github.com/Penty-d/qq-farm-bot-ui) 二改
- 核心功能：[linguo2625469/qq-farm-bot](https://github.com/linguo2625469/qq-farm-bot)
- 部分功能：[QianChenJun/qq-farm-bot](https://github.com/QianChenJun/qq-farm-bot)
- 推送通知：[imaegoo/pushoo](https://github.com/imaegoo/pushoo)

---

## 免责声明

本项目仅供学习与研究用途。使用本工具可能违反游戏服务条款，由此产生的一切后果由使用者自行承担。

---

<div align="center">
  <p>如果觉得有用，请点个 ⭐ Star 支持一下！</p>
</div>
