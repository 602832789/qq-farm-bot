# 雨落成诗活动协议与实现

## 活动与版本

本次活动时间为 `2026-08-26` 至 `2026-09-08`。结论来自已登录账号的实际操作、Helper 原始抓包以及以下客户端版本：

- QQ 农场小程序：`1.13.3.11_20260826`
- TSDK：`v3.9.0.1787640848`

当前仓库中的版本参数与这两个版本一致，无需额外修改。

活动协议组为 `2026070300`：

| 子活动 | 用途 |
| --- | --- |
| `2026070301` | 金豆豆兑换天气采集瓶、活动说明和基础变异概率 |
| `2026070302` | 雷雨中的闪电变异配置 |
| `2026070303` | 采雨操作与天气瓶奖励配置 |
| `2026070304` | 气象研究线路与节点状态 |
| `2026070305` | 雷电徽章气象任务 |

## 官方活动说明

服务端在 `2026070301.activity.extra` 中返回完整说明，核心规则如下：

- 活动期间农场会随机迎来雷雨天气。雷雨中成长中的作物有机会发生闪电变异，1 品和 2 品作物除外；变异果实售价为普通果实的 `4` 倍。
- 完成使用天气采集瓶、使用雷雨召唤瓶和收获闪电变异作物任务可获得雷电徽章；消耗徽章可依次推进气象研究并领取奖励。
- 天气采集瓶只能在处于雷雨天气的好友农场使用，成功采集必得雷雨召唤瓶 `×1`。
- 雷雨召唤瓶只能在自己的农场使用；已有特殊天气时不能重复召唤。
- 青蛙使坏瓶和乌云使坏瓶在好友农场使用，可触发互动并获得经验。
- 天气瓶是限时道具，活动结束后不能继续使用，可出售为金币；已经发生的闪电变异不会随活动结束消失。

最新版 `ItemInfo.json` 和实机天气倒计时均确认雷雨召唤持续 `2 小时`。旧配置曾写 20 分钟，现已失效。

## 活动读取

活动目录使用 `ActivityService.GetGroup`。`ActivityData` 中已确认的主要字段为：

| 字段 | 定义 |
| --- | --- |
| `102` | 兑换商店目录 |
| `105` | 天气采集瓶及产出配置 |
| `117` | 气象任务列表 |
| `118` | 气象研究线路、节点状态、消耗和奖励 |

自己的天气可通过 `WeatherService.GetWeatherStatus` 读取，天气变化通知为 `WeatherChangeNotify`。

好友列表摘要中的天气在当前版本不稳定，不能作为采雨依据。好友农场现场天气的权威来源是：

```text
VisitService.EnterReply.field 13 = WeatherStatus
```

`WeatherStatus` 当前使用的字段：

| 字段 | 含义/处理 |
| --- | --- |
| `weather_type` | `1` 为雷雨 |
| `status` | 与起止时间共同判断天气是否有效 |
| `begin_time` / `end_time` | 服务器秒级时间；实机召唤间隔为 `7200` 秒 |
| `source` | 服务端天气来源值，原样保留 |
| `field_8` | 独立保留，不能当作采雨状态标记 |
| `field_9` | 当前雷雨周期的好友活动标记；实测值 `4` 表示这轮雷雨已经采过 |

“落”的雷雨现场回包包含 `field_9=4`；“Felicia”现场曾只返回 `field_8=1`。因此实现分别保留两个字段，只用当前 `EnterReply.field 13` 的 `field_9` 判断这轮雷雨是否已采。同一好友进入下一轮雷雨后可以再次采集，不建立“每位好友每日一次”的本地记录。

## 采雨协议

天气采集瓶不是 `ItemService.Use`。真实请求为：

```text
service      = gamepb.activitypb.ActivityService
method       = Operate
activity_id  = 2026070303
operate_type = 9
field 107 {
  field 3 = 好友 GID
}
```

对应已验证请求 body：

```text
089fc28dc6071009da0606189fd487ea03
```

同一好友在当前这轮雷雨中重复采集的服务端回包：

```text
error_code    = 1034040
error_message = 已经采过雨了，去其他好友家看看吧
```

官方弹窗显示账号采雨的全局每日上限为 `10` 次。当前活动快照公开这个上限，但协议尚未返回稳定的“今日已用次数”，Web 不虚构该数值；该全局上限也不能推导成“同一好友每日一次”。

实现顺序为：进入好友农场、读取 `EnterReply.field 13`；当前雷雨有效且 `field_9` 未标记时发出 `ActivityService.Operate`；离开好友农场；成功后再次进入并缓存采后的本轮状态。每次重新检查都以服务端最新现场状态为准，因此下一轮雷雨的 `field_9` 复位后会重新开放采集。不能采时展示当前协议状态，无论操作成功或失败都会离开好友农场。

## 其他天气瓶

### 雷雨召唤瓶 `5002`

```text
ItemService.Use
item.id = 5002
target.host_gid = 自己的 GID
target.land_ids = []
target.use_config_id = 0
```

### 青蛙使坏瓶 `5005`

```text
ItemService.Use
item.id = 5005
target.host_gid = 好友 GID
target.use_config_id = 0
```

`UseReply.field 6` 为 `UseSocialReward`，包含道具 ID 和奖励。实测奖励为经验 `1101 × 30`。官方弹窗显示每日上限 `100` 次。

### 乌云使坏瓶 `5006`

```text
ItemService.Use
item.id = 5006
target.host_gid = 好友 GID
target.land_ids = [目标土地 ID]
```

乌云请求不发送 `use_config_id`。`UseReply.field 4/5` 返回目标土地和奖励，实测同样为经验 `1101 × 30`。未指定土地时，后端会选择首个处于生长阶段、尚未有乌云互动记录的作物地块。

## 青蛙与乌云清理协议

两种使坏瓶的生效位置不同，清理时不能共用同一种状态判断。

### 青蛙：农场级事件

`AllLandsReply.field 3` 返回农场级社交事件：

```text
item_id     = 5005
visitor_gid = 施放者 GID
timestamp   = 生效时间
```

青蛙存在时，官方客户端的单点务农和一键务农都会在常规 `FarmingRequest` 后追加 packed 字段 5：

```text
field 5 = [5005]
```

实测单点第 9 块地请求体：

```text
0a0109109082b7e103180020002a028d27
```

实测一键务农第 3、6、12、14、17、22 块地请求体：

```text
0a0603060c0e1116109082b7e103180020002a028d27
```

`FarmingReply.field 4` 返回被清理的事件及奖励，本次为 `item_id=5005`、经验 `1101 × 30`。清理成功后的 `FarmSocialEventsNotify` 只保留 `host_gid`，事件列表为空。自动巡田同时监听该通知，青蛙到达后可触发检查。

### 乌云：地块级实时记录

乌云通过 `LandsNotify` 中的 `PlantInfo.interaction_targets`（field 38）标记：

```text
item_id  = 5006
host_gid = 施放者 GID
timestamp
land_id  = 目标土地 ID
```

清理乌云只需把对应土地放入普通 `FarmingRequest.land_ids`，不发送字段 5。实测第 2 块地请求体：

```text
0a0102109082b7e10318002000
```

清理回包会移除实时 `interaction_targets`，但仍保留 `PlantInfo.field_40={8,1}`。因此 `field_40` 只能视为历史记录，不能据此把已清除的乌云重新显示为生效状态。

Web 的一键务农与地块“务农”按钮复用以上请求构造：乌云按实时目标地块加入 `land_ids`，青蛙按农场级事件加入字段 5；只有青蛙且没有其他待务农地块时，选择首个有效作物地作为协议所需的落点。

## 气象研究

推进研究使用：

```text
ActivityService.Operate
activity_id = 2026070304
operate_type = 40
field 140.node_id = 研究节点 ID
```

每次操作前重新核对节点状态和雷电徽章余额，避免重复推进或余额不足。

## 变异编号

雨落成诗的活动变异是 `#12 闪电`，配置效果为售价 `×4`。`#14 晶辉` 是紫晶土地的通用变异，不属于本次活动；一块土地可能同时暴露不同来源的变异信息。

名称解析继续复用通用 `MutantEffect.json` 映射：

- `12` → 闪电
- `13` → 喜鹊
- `14` → 晶辉

不能因为土地回包中出现 `14`，就把活动配置或雷雨状态改写为晶辉。

## Web 与自动化行为

活动信息、好友列表、好友天气拆成三个互不耦合的接口，避免打开页面时一次性把网关请求队列打满：

1. `GET /api/activity-center/weather` 只返回活动快照（商店、气象研究、任务、背包、自己的天气），不再附带好友列表和好友天气。
2. `GET /api/activity-center/weather/friends` 只返回好友列表本身，不进入任何农场；只有仍命中 10 分钟天气缓存的好友才带天气，其余一律是“待检查”。
3. `POST /api/activity-center/weather/friends/scan` 专门按好友 ID 批量读取现场天气，单次最多 5 位好友，后端按官方顺序逐个 `Enter` → 读取 `field 13` → `Leave`，不再返回活动快照。缓存仍然有效的好友直接用缓存返回，不会重复进农场。

前端拿到好友列表后自行按每 5 个一批循环调用扫描接口，逐批就地更新对应行；扫描进行中冻结列表顺序避免行来回跳动，整轮结束后再按“可采雨 → 本轮已采 → 已失效 → 晴天 → 检查失败 → 待检查”重新排序。页面明确显示“可采雨、本轮已采、已失效、晴天、待检查、检查失败”。

节流是这条链路的关键，因为 `Enter`/`Leave` 走低优先级，网关只给低优先级留 1 个并发槽位，整轮扫描期间会一直占着它：

- 后端同一批内每两次进农场之间等 `FRIEND_WEATHER_SCAN_GAP_MS = 300` 毫秒，单批 5 位好友 10 个 RPC 约 2 秒。
- 前端两批之间再等 `WEATHER_SCAN_BATCH_GAP_MS = 1000` 毫秒，算上批次间隔整体约 3 RPC/s，58 位好友整轮 40 秒左右。
- 好友天气缓存 `FRIEND_WEATHER_CACHE_TTL_SEC = 600`（10 分钟）。扫描一律不强制刷新：前端只把“待检查”的好友放进批次，后端再按缓存二次过滤，所以反复打开面板或手点“重新扫描”都不会重复进农场。

缓存放到 10 分钟后，行上的状态可能比现场旧。采集瓶不依赖缓存：`useWeatherCollectorBottle` 自己进农场、用 `Enter` 回包的实时天气做前置校验，过期时报 `WEATHER_FRIEND_NOT_THUNDERSTORM` 或 `WEATHER_ALREADY_COLLECTED`，同时刷新该好友缓存并通过返回体的 `friend` 字段纠正列表。

好友任务优先于天气扫描。自动好友巡检（`core/src/services/friend/scheduler.ts` 的 `isCheckingFriends`，对外暴露为 `isFriendCheckRunning()`）同样要进出好友农场，所以扫描在进入每一位好友之前先给它让路：最多等 `FRIEND_TASK_WAIT_MAX_MS = 10000` 毫秒（每 `FRIEND_TASK_POLL_MS = 250` 毫秒轮询一次），等不到空闲就把本批剩下的好友放进返回体的 `deferredGids`。前端隔 `WEATHER_SCAN_BUSY_RETRY_MS = 5000` 毫秒补扫这些好友，整轮最多 `WEATHER_SCAN_MAX_PASSES = 3` 轮，仍然扫不完就提示稍后再检查，进度条在整轮期间保持运行。整批好友都被让路时前端立刻结束当轮、不再逐批硬碰，剩下的好友一起留给下一轮。命中缓存的好友不参与让路判断，因为它根本不进农场。门控是单向的：扫描让位好友任务，好友任务不会等扫描；面板上手动点单个好友的操作（`doFriendOperation`）以及采集/青蛙/乌云写操作都不在门控范围内。

好友看家宠物顺路一起返回。`EnterReply.brief_dog_info.dog_id`（`visitpb.proto` 的 field 3）每次进农场都会带回来，之前被天气扫描丢掉了；现在它写进好友天气缓存，并以 `pet: { id, name, image }` 出现在好友 DTO 上，名称与图标用本地物品配置查（`getItemById` / `getItemImageById`），没有宠物时是 `null`，零额外 RPC。狗粮剩余与宠物等级需要额外发 `GetDogInfo{host_gid}`（每位好友一次），会把扫描的 RPC 量翻倍，因此故意不取。

已接入的读接口：

```text
GET /api/activity-center/weather
GET /api/activity-center/weather/friends
```

已接入的写接口：

```text
POST /api/activity-center/weather/shop/exchange
POST /api/activity-center/weather/friends/scan
POST /api/activity-center/weather/collect
POST /api/activity-center/weather/summon
POST /api/activity-center/weather/mischief/frog
POST /api/activity-center/weather/mischief/cloud
POST /api/activity-center/weather/research/:nodeId/advance
```

扫描接口的请求体是 `{ "friendGids": ["10001", "10002"] }`（兼容 `friend_gids` / `gids`）；超过 5 个会返回 `WEATHER_SCAN_BATCH_TOO_LARGE`，空列表返回 `INVALID_WEATHER_FRIEND_GID`，成功时只返回本批好友的最新天气。采雨、青蛙、乌云三个写接口额外返回 `friend` 字段，供前端就地更新那一行而不必重新扫描。

天气操作返回天气局部快照。Web Store 会直接归一化并替换当前天气活动，不再把局部快照误判成完整活动中心后额外全量刷新。

邮箱奖励发现不会因为当天已经检查过就永久短路。运行账号每 5 分钟重新检查两个邮箱类型的新附件；批量领取等待正式回包，失败时再降级为单封领取。

## 抓包定位

本次关键抓包位于：

```text
E:\program\qq-farm-code-helper\release\protocol-captures\session-1787723089210
```

青蛙/乌云清理补充抓包位于：

```text
E:\program\qq-farm-code-helper\release\protocol-captures\session-1787757439971
```

关键序号：

| 序号 | 内容 |
| --- | --- |
| `002275/002276` | 乌云使坏瓶成功 |
| `002355/002357` | 青蛙使坏瓶成功 |
| `002458/002459` | “落”雷雨现场及 `field_9=4` |
| `002476/002477` | 重复采雨返回 `1034040` |
| `002718/002719` | “Felicia”雷雨现场及 `field_8=1` |
| `000102/000103`（补充会话） | 青蛙存在时单点务农，字段 5 为 `5005` |
| `000221/000222`（补充会话） | 青蛙存在时一键务农，字段 5 为 `5005` |
| `000227/000230`（补充会话） | 乌云到达第 1、2 块地的 `LandsNotify` |
| `000237/000238`（补充会话） | 第 2 块地清理乌云；请求不带字段 5 |

Helper 当前能持续记录心跳、好友同步和活动请求，没有修改 QQ 代理设置，也没有证据表明宽带链路影响抓包。
