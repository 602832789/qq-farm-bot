# 网络并发模型：请求班次与优先级分层

Gateway 是一条 WebSocket 长连接，所有业务共用它。这份文档说明请求怎么排队、谁能插队、谁必须让路。

实现分三块：

- `core/src/utils/request-priority.ts` — 纯策略：班次定义、容量上限、调度选择函数。可单测，不碰任何运行时状态。
- `core/src/utils/request-context.ts` — `AsyncLocalStorage`：给「任务入口」打班次标记，任务内部发的请求自动继承。
- `core/src/utils/network.ts` — 排队与发送：`sendMsgAsync()` 解析班次、`takeDispatchableRequest()` 委托策略函数选下一个请求。

## 为什么要分层

以前只有 `low` / `normal` / `high` 三档，心跳和 ACE 是 `high`，其余全是 `normal`。问题是「其余」里既有用户在面板上点的操作，也有农场定时任务、好友巡查、宠物同步：

- 后台任务一开跑就把 `normal` 的 2 个并发槽占满，用户点一下要等好几秒；
- 好友巡查一轮几百个 `Enter`/`Leave` 全排在同一个队列里，队列和 `pending` 双双拉满；
- 服务端一旦变慢（请求挂十几秒不回包），队列只会越堆越长，最后连心跳都排不上，三次漏心跳直接下线。

## 五个班次

优先级从高到低：

| 班次 | 用途 | 在途上限 | 排队上限 |
| --- | --- | --- | --- |
| `critical` | 心跳、ACE AntiData | 2（两条通道各留 1 个专属槽位） | 8 |
| `foreground` | 用户在面板上的前台操作 | 3 | 60 |
| `farm` | 自己农场的后台定时任务 | 1 | 40 |
| `friend` | 好友农场的后台定时任务 | 1 | 30 |
| `background` | 宠物同步等补数据任务 | 1（且只在连接彻底空闲时） | 10 |

额外约束：

- 业务班次（`foreground` / `farm` / `friend`）总在途不超过 `MAX_BUSINESS_IN_FLIGHT = 3`；
- 其中非前台业务不超过 `MAX_NON_FOREGROUND_BUSINESS_IN_FLIGHT = 1`，后台定时任务最多占用一个业务槽位，前台操作至少保留两个可用槽位；
- 只要队列里还有前台请求，新的 `farm` / `friend` 请求就不会派发；已经在途的后台请求无法撤销，但它返回后的下一步会等待前台队列清空；
- `critical` 的两条通道各有一个专属槽位，ACE 挤不掉心跳，反之亦然；
- `background` 只在「没有任何在途请求、且队列里没有别的班次」时才发送——它是补数据，不是业务；
- 排队上限按班次独立计算：后台把自己的 10 个名额排满，也不影响心跳和前台的名额。

所以任何时刻最多 5 个业务/保命请求在飞（2 critical + 3 business），加上空闲时可能有的 1 个 background。

## 防饿死

严格按班次排序会让低优先班次在高优先班次不断到来时永远排不上。`selectDispatchIndex()` 的做法是：排队超过 `CLASS_STARVATION_MS = 4000` 的业务请求会被提升到队首（在同样满足容量约束的候选里挑等待最久的那个）。这个提升不会越过前台请求——只要队列里还有前台请求，新的后台业务请求就不会派发。

## 班次是怎么定下来的

`resolveRequestClass(options, ambientClass)` 的判定顺序：

1. `criticalLane`（`heartbeat` / `ace`）或 `priority: 'high'` → `critical`；
2. 显式 `requestClass` → 用它；
3. `priority: 'low'` → `background`（兼容旧调用）；
4. `AsyncLocalStorage` 里的环境班次 → 用它；
5. 都没有 → `foreground`。

**`priority: 'normal'` 被视为「调用方没表态」，走第 4 步。** 这一点很关键：项目里大量 API 封装（`friend/api.ts`、`friend/gid-manager.ts`、`services/interact.ts` 等）默认传 `'normal'`，如果把它当成明确的前台声明，后台定时任务发的请求就会全部伪装成前台流量，分层等于没做。

环境班次由 `services/scheduler.ts` 注入：`createScheduler(namespace)` 创建的定时器，任务体整体跑在 `classForSchedulerNamespace(namespace)` 里。

| 调度器命名空间 | 班次 |
| --- | --- |
| `network` / `ace` / `worker_manager` | 不注入（这些请求自己声明 `criticalLane`） |
| `friend-pet-sync` | `background` |
| 其它 `friend*`（`friend`、`friend-pet-cache`） | `friend` |
| 其它（`worker`、`farm`、`task`） | `farm` |

`worker` 命名空间的统一 tick 同时驱动农场和好友两种任务，所以三个真正的入口各自再显式包一层：

- `core/src/core/worker.ts` 的 `runFarmTick()` → `runWithRequestClass('farm', ...)`
- `core/src/core/worker.ts` 的 `runFriendTick()` → `runWithRequestClass('friend', ...)`
- `core/src/services/friend/pet-sync.ts` 的 `runFriendPetSync()` → `runWithRequestClass('background', ...)`

面板 HTTP 请求和 Socket.IO 事件不经过调度器，没有环境班次，因此天然落到 `foreground`——那边确实有人在等结果。

## 后台任务的两道闸门

协议层的 `background` 槽位只保证「不抢先」，不保证「不叠加」。所以后台任务自己还要主动让路：

- `waitForGatewayIdle(maxWaitMs)`（`utils/network.ts`）——发请求之前先观察网关，等不到空闲就整轮让路。只观察不排队，等待期间一点压力都不加。判定口径在 `utils/low-priority-gate.ts` 的 `isGatewayIdleForLowPriority()`：队列里有非 `background` 请求、有业务请求在飞、已经有 `background` 在飞、心跳漏过一次、或有在途请求卡了 5 秒以上，都算「不空闲」。
- 队列等待上限——`background` 请求在队列里最多等 `LOW_PRIORITY_QUEUE_WAIT_MS = 8000`，之后抛 `GatewayBusyError`（`isGatewayYieldError()` 能识别），让调用方把剩下的活留给下一轮，而不是一路熬到请求超时刷一屏日志。

## 定时任务的健康度退避

服务端静默时的形态是：请求全部 `stage=pending` 挂十几秒、心跳开始漏拍，最后 3/3 心跳失败掉线。这种时候客户端再按 3~5s / 12~15s 的固定间隔发定时任务，只会把 pending 拉满、把心跳一起挤到超时。

所以 `runFarmTick()` / `runFriendTick()`（`core/src/core/worker.ts`）在入口检查 `isGatewayHealthyForBusiness()`：

- 判据只有两条——`heartbeatMisses > 0`，或有在途请求超过 `GATEWAY_STALL_PENDING_MS = 5000` 没回包。比后台闸门宽松得多，队列里有活、有业务请求在飞都不算不健康，定时任务本来就该和前台操作正常竞争槽位。
- 不健康就跳过本轮，并把 `nextFarmRunAt` / `nextFriendRunAt` 指数退避：首次 30 秒，之后翻倍封顶 60 秒（`nextBusinessBackoffMs()`）。farm 和 friend 各自记账，互不影响。
- 网关一恢复退避立即清零，回到正常间隔。日志只在进入退避（`网关无回包，农场定时任务退避 30s (...)`）和恢复（`网关已恢复，...回到正常间隔`）时各打一次，不刷屏。

退避期间连接上只剩心跳和 ACE 上报——它们有独立保留槽位，能安静地把连接救回来。

## 流量保险丝（只有自动任务受约束）

并发分层解决了「谁先发」，但没解决「一分钟内总共发多少」。2026-11 之前这里还有一道
「60s 内最多 80 个请求」的硬预算（`request-governor`），对所有非白名单请求一视同仁：
一个开着全自动的账号，60s 内光 ACE AntiData（12 次）、心跳（3 次）、农场/好友定时任务、
活动自动化就能把预算吃满。预算一满，用户在面板上点「我的农场」发起的 `AllLands`
也会被直接拒绝，前端只看到一句失败——表现为「页面打不开 / 点了没反应」。
实测日志里 `AllLands` 一天被拒 934 次。

现在的 `core/src/utils/request-governor.ts` 只做一件事：给**自动任务**兜底限速。

- **前台（`foreground`）与保命流量（`critical`：心跳 / Login / ACE / 收菜偷菜）永不因配额被拒。**
  前台请求连额度都不消耗，只登记「用户最近在操作」的时间戳。
- 只有 `farm` / `friend` / `background` 会撞这道保险丝，撞上按「网关繁忙」让路，
  由调用方退避到下一轮，不写错误日志。
- 上限不是一个写死的数字，而是随网关健康度变化：

| 档位 | 判定 | 自动任务 60s 上限 | 单接口上限 |
| --- | --- | --- | --- |
| `healthy` | 无漏心跳、最老在途 < 2s | 180 | 60 |
| `cautious` | 最老在途 ≥ 2s，或有在途且入站 ≥ 8s | 90 | 60 |
| `stall` | 心跳漏拍 / 最老在途 ≥ 5s / 有在途且入站 ≥ 20s | 24 | 8 |

`stall` 档下自动任务基本停摆，连接上只剩心跳和 ACE——和「定时任务健康度退避」是同一套思路，
但这里卡在协议层，连已经排进队列的自动请求也一起收住。

可用环境变量调整：`FARM_AUTO_LIMIT_60S`、`FARM_AUTO_CAUTIOUS_LIMIT_60S`、
`FARM_AUTO_STALL_LIMIT_60S`、`FARM_AUTO_METHOD_LIMIT_60S`、`FARM_FOREGROUND_ACTIVE_MS`。

### 硬预算期留下的省请求改动已回滚（2026-11-05）

硬预算时代为了「把 60s 内的请求数压下来」，还做过一批以牺牲实时性换请求数的改动。
预算闸门本身被拆成只约束自动任务的保险丝之后，这些改动失去了存在理由，全部回滚：

| 位置 | 硬预算期的妥协 | 现在 |
| --- | --- | --- |
| `services/farm/api.ts` | `getAllLands` 1.2s TTL 快照 + 并发合并 | 每次都读服务端实时地块 |
| `services/farm/planting.ts` | 施肥复用巡田传入的 `knownLands` 快照 | 施肥前后各读一次最新地块 |
| `services/task.ts` | 任务扫描 30s 节流（`FARM_TASK_SCAN_INTERVAL_MS`） | 每个巡田 tick 正常扫描 |
| `services/warehouse.ts` | 化肥礼包检查 60s 冷却 | 跟巡田节奏检查 |
| `services/farm/scheduler.ts` | 遇「超预算」按 `retryAfter` 推迟下一轮巡田 | 不再按预算推迟，按正常间隔重试 |
| `core/worker.ts` | 偷菜到点前 60s 开「抢收紧急窗口」 | 移除；收菜偷菜本身就在保命白名单里 |
| `services/activity-automation.ts` | 首轮额度 ≥90% 时顺延 15s | 启动 10 秒后照常跑首轮 |

活动自动化的「一轮只读一次」缓存（`utils/activity-round.ts`）保留：它只在自动化轮次
作用域内生效，写操作后立即失效，面板与手动操作始终直连实时数据，不影响交互正确性。

### 前台让路

`checkRequest()` 遇到前台请求会刷新「用户正在操作」时间戳。`runFarmTick()` /
`runFriendTick()` 入口据此短顺延 2 秒（`FOREGROUND_YIELD_MS`）：用户点击时，
定时任务不会刚好发一个农场/好友请求把业务槽位占住。连续让路最多 5 次（约 10 秒），
之后照常执行，避免定时任务被无限期饿死。

### 心跳快速补发

心跳仍是 25s 一次、8s 超时，但**首次漏拍不再直接进入 miss 计数**：3 秒后补发一次
（`HEARTBEAT_RETRY_DELAY`）。抖动型的丢包补一次就恢复，避免一次网络抖动就让
「心跳漏拍」闸门压住所有自动任务，甚至累计到 3 次直接下线。补发仍失败才按原规则
（3 次 miss 且 30s 无入站）终止连接。

### 面板请求的超时

后端不再因额度拒绝前台请求，但一条前台请求仍可能排在一条已经在飞的自动请求后面。
前端 axios 超时从 10s 放宽到 15s，覆盖「我的农场」这类要串几个网关请求的接口。

## 压力日志

```
网关请求压力：等待回包 3 个、排队 1 个；回包中：GetIllustratedListV2#513（12 毫秒）、AllLands#515（1.1 毫秒）；排队中：Bag（前台）
```

只在队列里有**非 `background`** 请求时才打（`utils/request-pressure.ts`）。队列里只剩后台补数据是正常运行，不算拥塞。

这行以前是 `Gateway 请求压力: pending=3, queued=1, active=AllLands#251:18136ms, queuedMethods=Bag`，在面板上读起来像抓包。现在统一由 `utils/net-diagnosis-text.ts` 出中文：耗时按「毫秒 / 秒 / 分 秒」显示（十秒以上取整，不再出现 `12.327675000065938ms` 这种尾巴），排队项后面直接跟中文班次——心跳、ACE 上报、前台、自己农场、好友农场、后台补数据。带 `!H:` / `!A:` / `#` / `&` / `~` 前缀的标记只留在 `describeRequestClassMarker()`，供抓包对照时使用。

同一套格式化也用在「请求超时」「请求等待队列已满」「网关繁忙，后台请求已让路」「心跳未响应」「网关无回包，××退避」上；超时的阶段说明改成 `尚未排到连接` / `已发往网关但未回包`，额度让路的原因与模式也翻成人话（`总量额度用尽`、`连接受限（降速）` 等）。

`isGatewayYieldError()` 已同步识别新文案（`尚未排到连接`），`stage=queued`、「请求等待队列已满」这些旧关键字继续保留，避免外部调用与旧日志失配。

## 登录后的启动序列

`core/src/core/worker.ts` 的 `runStartupSequence()`。以前是四个错峰定时器（农场 2s / 好友 8s / 每日领取 45s / 神秘商店 60s），每日礼包要等一分钟才领，而那时农场和好友循环已经在跑，几件事叠在一起反而把连接打满。

现在登录动作一结束先串行跑完 `await runDailyRoutines(true)`（邮件 / 每日分享 / 月卡 / 免费礼包 / VIP）→ `await checkAndClaimTasks()`，然后才挂上农场/好友主循环和后续周期性定时器。串行意味着登录启动期同一时刻只有一个业务请求在飞，既领得及时，也不会和心跳抢连接。神秘商人不再参与登录首查；只有“自动购买”或“到货提醒”开启时，才每 2 小时定时检查一次。

## 自动任务全局互斥

`core/src/services/automation-lock.ts` 提供进程内的自动任务互斥队列：

- 所有后台自动任务入口都通过 `runExclusiveAutomationTask()` 串行执行；
- 同一任务链内部的嵌套调用可重入，不会自锁；
- 心跳、ACE/AntiData、面板前台操作不进这个互斥队列，保留原有优先级和响应体验；
- 队列只约束“自动任务”，不约束用户手动操作；如果某个自动任务长时间不返回，后续自动任务会排队等待。

当前已接入互斥的自动入口包括：登录启动序列、每日例行、农场巡检、好友巡查、推送触发巡田、好友申请处理、宠物同步、任务领取、神秘商人、化肥购买与立即施肥、收获后出售、宠物礼包拾取。

## 相关文件

- `core/src/utils/request-priority.ts` — 班次、容量、调度选择（纯函数）
- `core/src/utils/request-context.ts` — 环境班次（`AsyncLocalStorage`）
- `core/src/utils/request-governor.ts` — 自动任务流量保险丝、健康度分档、前台活跃信号
- `core/src/utils/network.ts` — 排队、发送、心跳补发、`getGatewayLoad()`、`waitForGatewayIdle()`
- `core/src/utils/low-priority-gate.ts` — 后台任务的空闲判定、定时任务的健康度退避、让路错误分类
- `core/src/utils/request-pressure.ts` — 压力日志节流
- `core/src/services/automation-lock.ts` — 自动任务全局互斥
- `core/tests/request-priority.test.js` — 分层与容量的契约测试
- `core/tests/request-governor.test.js` — 前台豁免、自动任务限额、健康度分档的契约测试
