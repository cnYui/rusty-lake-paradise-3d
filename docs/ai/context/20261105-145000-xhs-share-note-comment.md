# 小红书小工具：通关后发笔记 / 发评论（2026-11-05）

## 背景

用户想在通关后让玩家把结果发到小红书。小红书小工具开放能力里，发布笔记（`postNote`）和发布评论（`interactionOpenApi`，客户端 9.49+）是正式能力，不用申请；云存储、排行榜还是内测（要提交 UID 由平台开通，11-05 查过这个账号还没开通，上传表单里没有「高级能力」栏），这次不做。接口以开发者文档 https://miniapp-sandbox.xiaohongshu.com/minitool/doc 的 §3.3 / §3.5 / §3.9 为准。

## 做了什么

- `src/core/share.js`（新）：
  - 文案（纯函数，node 能测）：笔记标题“我通关了锈湖天堂岛第N灾”（≤ 20 字），正文写小工具名、章节名、成就 x / y、已通关 n / 5 灾、同人重制说明和话题（≤ 1000 字）；评论“我通关了第N灾 · 标题！成就 x/y，你们卡在哪一步了？”。打包副本里被打码的标题（含字母，如“x灾”“长子之S”）不写进文案，只写“第N灾”。
  - 通关卡：3:4（1080×1440）JPEG。上半是 `engine.capture()` 此刻的 3D 画面（cover 裁切 + 下沿渐隐 + 暗角），下半是“锈湖·天堂岛”、英文副标题、章节名、成就 / 通关数、日期和“小红书小工具「锈湖 天堂岛」”，画面右下角一个“通关”红色印章。画布字间距手动加（Chrome 61 没有 letterSpacing）。
  - 调用：`shareCaps()` 判断能发什么（有 `postNote` 才能发笔记；有 `interactionOpenApi` 且客户端 ≥ 9.49 才能发评论，取不到版本号按不支持）。发笔记：通关卡 → `writeTempFile` 换路径（5 秒超时，失败就直接传 data:）→ `postNote({ title, content, pageType: 'photo_publish', mediaInfo: { image_resources } })`。发评论：通关卡 → `writeTempFile`（失败就只发文字，评论不收 data:）→ 先跑 `beforeLeave` 存档 → `interactionOpenApi({ payload: { action: 'post_comment', content, media_bean, miniToolSnapshotInfo }, saveToAlbum: false })`。两个函数都不 reject，返回 `{ ok, msg }`。
- `src/core/ui.js` 结尾卡：新增 `ui.setEndingShare(fn)`；`ending()` 在两个去向按钮下面多一行 `.ending-share`（查到能分享才放“发笔记”“发评论”，按钮和其它按钮一起淡入）。点了分享就取消“自动进入下一灾”的倒数（新的局部 `auto` 标记，不动 `endingSeq`，所以“进入下一灾 / 返回主菜单”照常能点）；分享进行中两个分享按钮禁用，结果写在底部小字（“发布页已打开” / “没能打开发布页（已取消）”等）。
- `src/main.js`：`shareInfo()`（当前章、本章成就拿了几个、开放章节通关了几章）、`saveBeforeLeave()`（`state.save()` + 等小红书包存档层 `__RLP_STORE.flush()`，最多 1.5 秒；发评论时容器会先关掉小工具）、`ui.setEndingShare(...)`。没有改 `build.py` 补丁匹配的那几行（`bootDone(); RLP.ready = true;` 等）。
- `styles.css`：`.ending-share` 一行（空着时 `display: none`）和 `.ending-share-btn`。

网页版、口袋方舟包没有 `window.xhs`，结尾卡和原来一样。`build.py` 不用改：`share.js` 跟着 `main.js` 打进 `game.js`，敏感字检查照常（`share.js` 里没有“死 / 血”）。

## 验收

- `node --test dev/common/test_share.mjs`：6/6（开放的五章文案长度和敏感字、成就 / 通关数、打码标题、按字截断、附加状态 ≤ 2 KB、能力判断的版本边界和超时）。原有规则测试 `node --test dev/plague2..5/*.mjs dev/common/test_hints.mjs` 89/89。
- `python dev/minitool/test_share_xhs.py <包目录>`：29/29。A 网页版没有分享行、倒数照常；B/C 模拟容器（9.53）点“发笔记”取消自动进入、`postNote` 参数、通关卡 1080×1440，点“发评论”时 `interactionOpenApi` 参数正确、本章存档已经写好、去向按钮还能点；D 客户端 9.48 只有“发笔记”；E `writeTempFile` 失败时笔记带 data:、评论只发文字、仍然不自动进入；F 打包后的小工具（容器 CSP、390×844 竖屏真实触摸、模拟 Storage API）同样能发，发评论前存档已经交给原生。包用 `build.py --release --out/--zip` 打到临时目录，661 KB。
- 通关卡和结尾卡截图看过（输出在测试的 `--out` 目录，不入库）。

## 没做 / 要真机确认

- `writeTempFile` 返回的路径算不算评论要的“本地文件句柄”（文档示例只写了 `imageFilePath`）；如果真机评论区不带图，改成先 `saveFile` 到持久目录再传。
- `postNote` 唤起发布页时小工具会不会被关掉（文档没写；结尾卡状态不依赖它）。
- 从评论区重开小工具时读 `miniToolSnapshotInfo` 恢复状态：现在只写了章节 id，没做恢复逻辑。
- 没有打包上传、没有提审。上传前照惯例跑 `test_minitool.py`（无参数首页 + 真实触摸）。

## 补记：口袋方舟包（同日）

旅馆那边的 GPT 验收发现：`main.js` 的 `saveBeforeLeave` 里提到了 `window.__RLP_STORE`，而 `build.py --ark` 有断言要求口袋方舟包的 `game.js` 里没有 `__RLP_STORE`，所以这个提交原样会让 `--ark` 打包失败。已在 `build.py` 的 `if a.ark:` 分支里把副本中等存档层的那两行去掉（只留 `state.save()`），重打 `--ark`（644 KB）和 `--release`（661 KB，和改前同样大小）都过了全部断言。
