# Repository Agent Notes

## QQ 农场官方源码位置（macOS）

Mac QQ 会把 QQ 小游戏源码自动展开到：

```text
~/Library/Containers/com.tencent.qqexminiprogram/Data/Library/Application Support/QQEX/miniapp/temps/miniapp_src/
```

QQ 农场 AppID：

```text
1112386029
```

农场源码版本目录匹配：

```text
1112386029_3_*
```

每次 QQ 农场更新后目录尾部哈希都会变化。不要把某一个哈希目录永久视为最新版；
应按其中 `tsdk/tsdk.wasm` 的修改时间选择最新且完整的目录：

```bash
QQ_MINIAPP_SRC="$HOME/Library/Containers/com.tencent.qqexminiprogram/Data/Library/Application Support/QQEX/miniapp/temps/miniapp_src"

find "$QQ_MINIAPP_SRC" -path '*/1112386029_3_*/tsdk/tsdk.wasm' \
  -exec stat -f '%m %Sm %z %N' -t '%Y-%m-%d %H:%M:%S' {} \; | sort -nr
```

候选目录至少应包含：

```text
game.js
game.json
tsdk/tsdk.wasm
assets/
```

当前曾确认的 2026-07-29 展开目录为：

```text
~/Library/Containers/com.tencent.qqexminiprogram/Data/Library/Application Support/QQEX/miniapp/temps/miniapp_src/1112386029_3_67b898be9fed43f96df1108d3f31f25b/
```

该路径仅作为已知样例；开始分析前仍需执行上面的时间排序。

## QQ 农场远程资源缓存（macOS）

活动界面、种子/作物贴图、Prefab、Spine 和其他远程 bundle 通常不全部位于
`miniapp_src`，而是在各 QQ 账号的运行资源缓存中：

```text
~/Library/Containers/com.tencent.qqexminiprogram/Data/Library/Application Support/QQEX/miniapp/fs/*/1112386029/usr/gamecaches/
```

资源 URL 与本地缓存文件的映射记录在：

```text
~/Library/Containers/com.tencent.qqexminiprogram/Data/Library/Application Support/QQEX/miniapp/fs/*/1112386029/usr/gamecaches/cacheList.json
```

常见 bundle：

```text
mainscene/
extraRes/
plant/
delayRes/
audio/
petdog/
```

分析官方文件时只读源目录，先复制到临时目录再处理，不要直接修改 QQ 容器缓存。
WASM 更新的完整发现、快照、比较、验证和回退流程见：

```text
core/docs/tsdk-update-runbook.md
```
