# 第三灾章节逻辑实现 + 真人输入通关 + 录像

## 用户要求
“第三灾，你自己从头到尾玩一下，然后录一个游玩的视频，游玩的时候出现了问题你自己修复。”
仓库里只有第三灾的美术（`src/art/props_p3_*.js`、`cast_p3*.js`）和设计文档，`src/chapters/plague3/` 不存在（原计划交给另一个 AI），所以先把章节逻辑按 `docs/plague3_design.md` 实现出来，再玩。

## 实现
`src/chapters/plague3/`（全部 LF）：
- `index.js` 章节对象 + 主线 walkthrough；`text.js` 文案和 5 条成就；`items.js` 19 件物品（名字取 `ITEM_SPECS`）；`title.js` 开场标题（照第二灾）。
- `world.js` 布景 / 视图 / 导航 / 白桦林 zone `p3_grove`（原点 [600,0,0]，`groveRoamAt` 漫游区域）。
- `puzzles.js` 纯规则：滑块（BFS 最短解正好是设计文档的 23 步）、蜂巢（`HIVE_ORDER`）、陶轮、捕蝇草、神龛。
- 区域：`beach.js` `forest.js` `house.js` `lake.js` `temple.js` `grove.js`。每个 `sync()` 只调 `setState`，不可逆的公共道具（吊架插方块、圣水盆点燃）回退时只重建那一个道具。
- 共享文件小改：`src/chapters/index.js`（第三灾的 `title` / `achievements` / `load`，**仍带 `wip: true`**）、`src/core/views.js`（`zoneAmbience` 加 `p3_grove → forest`）。

## 验收入口（新增）
- `node --test dev/test_plague3.mjs`：15 项规则测试（滑块 400 步随机可解、蜂巢点错复位、陶轮两种器形、神龛合法性……）。
- `python dev/test_plague3_browser.py`：autoplay、美术常量核对（`ctx.p3.checkArt()`）、7 个中途检查点的存档 / 新游戏双向恢复、白桦林门禁与碰撞、从菜单进入。
- `python dev/record_plague3_demo.py [--fast]`：真人输入（WASD、鼠标靠边转身、点击、数字键）从标题菜单走完全程并录像；`--fast` 不录像只查流程。
- `python dev/shots_plague3.py [名字…]`：逐视图截图到 `dev/shots/p3/ch/`。

## 验证结果
- `node --test`（第二、三、四、五灾规则）37/37；`python dev/test_plague3_browser.py` 全部通过（autoplay 267/267，物品栏最多同时 9 件，7 个检查点存档 / 新游戏双向恢复，门禁与碰撞，从 `?wip=1` 菜单进入且 `bootError` 为空）。
- `python dev/record_plague3_demo.py --fast`：真人输入（WASD、鼠标靠边转身、点击、数字键）从标题菜单走到 `plague3_complete`，`ok: true`，页面无报错；成就拿到 earcut / the_butterfly / spitting_larva（harvey、the_third_symbol 是可选成就，主线没走）。
- 录像：`dev/shots/plague3/demo/plague3-demo.mp4`（1280×720，约 12.9 分钟，含声音，截到结尾卡；gitignored，不提交）。录制时结尾卡的自动倒数把页面带进第四灾，所以那次 report 的 `ok` 为 false；脚本已在 `install()` 里关掉 `ui.autoAdvance`，视频已按结尾卡裁掉后面的第四灾标题。

## 游玩中发现并修复的问题
- 湖岸 `p3_margaret` 特写只框到脸和手，腿上的死蚊子点不到：重新构图并把死蚊子放大。
- 理发特写里掉在地上的耳朵在画面外：改成能看到凳脚的中景，耳朵挪到凳子左前方放大。
- 铲子 / 斧子这类不消耗的工具用完仍保持选中，下一次点贝肉、土堆里的黏土会被当成“用错物品”（只拿到 1 团黏土，后面陶轮没有第二团）：一次性工具动作（撬贻贝、挖 X、挖土堆、割桦树汁、砍倒红叉树）做完取消选中；重复使用的（砍木桩）保持选中。
- 读档后 David 的状态 `covered` 和游玩时不一致：`sync` 里按旗标恢复成 `{ covered, gone: covered }`。
- 海滩两块石头往中间挪到 ±3.1、出生机位后退到 z 49.4，右石不再在画面外；水泵空地机位后移，蜂巢和土堆同屏；X 特写、红叉树点击区调整。
- Windows 上用 Python 文本模式改文件会把 LF 写成 CRLF（改过一次 `chapters/index.js` 和几个新文件，已还原）。

## 没做 / 已知
- 成就粉笔图标没加（`CHALK_ICONS` 在 `ui.js`，那个文件有别的会话的未提交改动），五个成就用默认星形。
- 第三灾仍是 `wip: true`：去掉之前要给 `dev/minitool/build.py` 加一条第三灾 `load` 置空的补丁，否则小红书小工具会多出第三灾；去掉后第二灾结尾会自动进入第三灾，第三灾结尾自动接第四灾。
- 触屏模拟和实体手机没测；第一、二、四灾的浏览器回归没跑（这轮没改它们用到的美术文件，只加了 `views.js` 一行 case）。
- 模型颜色在游戏真实灯光下的核对（`props_p3_items.js` 色调映射）只看了截图，没有逐件量色。
