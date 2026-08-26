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
| `field_8` | 独立保留，不能再当作“今日已采”标记 |
| `field_9` | 好友活动标记；实测值 `4` 表示该好友今天已经采过 |

“落”的雷雨现场回包包含 `field_9=4`；“Felicia”现场曾只返回 `field_8=1`。因此实现分别保留两个字段，只用 `field_9` 判断是否已采。

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

同一好友当天重复采集的服务端回包：

```text
error_code    = 1034040
error_message = 已经采过雨了，去其他好友家看看吧
```

官方弹窗显示采雨每日上限为 `10` 次。当前活动快照公开这个上限，但协议尚未返回稳定的“今日已用次数”，Web 不虚构该数值。

实现顺序为：进入好友农场、读取 `EnterReply.field 13`、发出 `ActivityService.Operate`、离开好友农场，再次进入并缓存采后的 `field_9` 状态。无论操作成功或失败都会离开好友农场。

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

活动中心使用显式好友扫描：

1. 普通活动快照只返回好友目录和已有缓存，避免进入活动中心时批量发出大量 RPC。
2. 打开“雨落成诗”页面后调用 `/api/activity-center/weather/friends/scan`。
3. 后端按官方顺序逐个 `Enter`，读取 `field 13`，再 `Leave`。
4. 页面明确显示“可采雨、今日已采、已失效、晴天、待检查、检查失败”。

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

天气操作返回天气局部快照。Web Store 会直接归一化并替换当前天气活动，不再把局部快照误判成完整活动中心后额外全量刷新。

邮箱奖励发现不会因为当天已经检查过就永久短路。运行账号每 5 分钟重新检查两个邮箱类型的新附件；批量领取等待正式回包，失败时再降级为单封领取。

## 抓包定位

本次关键抓包位于：

```text
E:\program\qq-farm-code-helper\release\protocol-captures\session-1787723089210
```

关键序号：

| 序号 | 内容 |
| --- | --- |
| `002275/002276` | 乌云使坏瓶成功 |
| `002355/002357` | 青蛙使坏瓶成功 |
| `002458/002459` | “落”雷雨现场及 `field_9=4` |
| `002476/002477` | 重复采雨返回 `1034040` |
| `002718/002719` | “Felicia”雷雨现场及 `field_8=1` |

Helper 当前能持续记录心跳、好友同步和活动请求，没有修改 QQ 代理设置，也没有证据表明宽带链路影响抓包。
