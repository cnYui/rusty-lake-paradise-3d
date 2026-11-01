# 2026-11-01 第八灾（蝗灾）首次可玩实现（占位人物、浓雾岛）

## 来源

- 用户要求：接着第六、七灾做第八章，人物用模拟方块（`makeMockPerson`），对照原作视频了解玩法和剧情，沿用前几灾的结构，补测试，开草稿 PR；打包 / 上传 / 提审不做。中途用户说“你先停一下”（当时只写完设计文档），之后说“继续”。
- 参考视频：本地 `dev/common/ref/P08_第八灾-蝗灾_BV1bo4y1y7fm.mp4`（20:46），每 2 秒抽一帧拼成时间码缩略图逐张看完，关键段再抽原尺寸帧；抽帧放在会话临时目录，没有进仓库。结论写成 `docs/plague8_design.md`（原作时间码表只写台词和歌词的大意、重制版契约、与原作差异）。

## 分支与目录

- 另一个线程同时在本机主检出（`D:\CodeWorkSpace\rusty-lake-paradise-3d`）给第六、七灾换正式模型、来回切分支，所以第八灾在单独的克隆 `D:\CodeWorkSpace\rusty-lake-paradise-3d-p8` 里做，分支 `feat/plague8`（从 `origin/feat/plague6-7` 拉出）。

## 实现

- 章节逻辑 `src/chapters/plague8/`（`index / items / text / hints / rules / world / puzzles.js`），道具 `src/art/props_p8.js`（`p8_` 前缀），注册表 `wip: true`、`requires` 第一到第七灾；`build.py` 打包副本里第八灾 `load` 置空。
- 浓雾：`world.js` 的 `fogController` 注册成每帧更新的道具（`main.js` 里道具更新排在 `world.update` 之后），按相机位置调 `world.setFog`：门外 0.6（薄雾，远景还看得见岛），过天堂门渐变到 1。`sky.js` 新加可选项 `fogState.whiteNear / whiteFar`（白雾最浓时的近 / 远距离，不设就是原来的 0 / 42，别的章不受影响），这一章设成 1 m / 18 m，“看穿”时拉到 70 m；湖面 shader 用同一组数。
- 浓雾带出来的两个老布景问题：第一灾林间小路缺口里那块不吃雾的黑卡片 `forest_path_dark`（`island.update` 每帧按相机位置显示）在浓雾里变成一大块黑幕，雾控制器每帧把它藏起来；湖水原来很浅、又反射白天空，雾里和天连成一片，这一章把湖水颜色压暗一点。
- 巨型螳螂（约 5.6 m 高，四条细长步足 + 一对捕捉足）：孵化后在雾里待的位置由旗标推导（合唱树后面 → 白桦林和树林之间 → 湖岸西边）；每段过场从雾里走出来、上半身往前扑出手、再退回雾里。
- 占位人物在 `cast_mock.js` 加了 `musician_fat / musician_feather / musician_old / seer / shadow / mother`，以及几个可选外观（`skin / eyes / fat / thin / feather / longHair`），旧人物不受影响。山羊用现成网格模型（`rlpm.js` 的 `CHAPTER_MODELS.plague8 = ['goat']`）。
- 新音效（`audio.js` 合成）：`locust_1…5`（五声音阶，按蝗虫高度）、`mantis`、`fog_horn`、`owl`、`mandolin`。
- 文案：谜歌、黑影、红发女人、回忆里的台词都是重写的；白墙上的字用中文“别信猫头鹰”（原作是一句英文台词）。

## 验收

- `node --test` 第二到第八灾规则测试 + `dev/common/test_hints.mjs`：96/96 通过（第八灾 5 条：木盒答案唯一且按属性判定、滑块移动和交换、合唱点错从头来、诱饵对应、提示表结构）。
- `RLP.autoplay()`：102/102 步，`plague8_complete` 立起，三个成就 `p8_three_men / p8_chorus / p8_owls` 都拿到。autoplay 报了 11 条“热点不在画面里”（`p8_score`、`p8_seer_zoom / p8_seer / p8_room_exit`、`p8_eyes`、`p8_dig_circle / p8_chest / p8_horn`），都是镜头过渡还没走完就检查；同一批热点在真实鼠标通关里都是按屏幕坐标点中的，所以不算问题。
- `python dev/plague8/test_plague8_browser.py`：全部通过——自动通关；新游戏复位；浓雾（门外近 / 远约 19 / 293 m，雾林 1 / 18 m，木屋里不受雾）；合唱点错从头来；真实鼠标 / 数字键 71 步完整通关；中途读档 `box / chorus / dig / temple` 四个存档点；门禁（木板没劈开不能进门、螳螂出来前蛾子不会被用掉、木盒滑块交换）；菜单 wip 与解锁；触屏（木盒、合唱、物品栏）。第一次整套跑到触屏那一步时浏览器页面被关掉（`TargetClosedError`，机器同时在跑别的重活），单独重放触屏流程两次都过，第二次整套重跑全过。
- `python dev/common/test_hints_browser.py 8`：23/23（第八灾逐步自动通关每一步都有提示，22 条提示里自动通关途中提示过 21 条；没轮到的是 `moth`（捉蛾子），因为它和 `shovel` 并列、排在后面，自动通关先在门边捉了蛾子再进屋拿铲子，轮到它之前已经做完；通关后全部 done）。
- `python dev/common/test_progress_browser.py`：82/84，连跑两次都是同样两项失败：B2“进入第二灾后 30 s 内片头播完”和 D1“结尾卡 30 s 内开始倒数”（第一灾 → 第二灾的衔接，和第八灾无关）。把这两段单独拿出来、不设 30 s 上限，在本分支和改动前的基线 `caa922b` 上各跑一次：片头分别要 52 s / 49 s、倒数提示分别 40 s / 32 s 才出现，最后都成功，第一灾存档里的通关旗标也都在。所以是这台机器上无头浏览器太慢（游戏时钟每帧最多走 0.05 s，按结尾动画 3.6 s 游戏时间推算只有约 2 帧 / 秒），基线上原来就超时；这个公共测试没改，留给以后把等待时间放宽。

## 没做 / 后续

- 正式人物模型（三个乐手、红发女人、黑影、母亲等）；做好后换掉 `makeMockPerson` 并去掉 `wip`。
- 小红书 / 233 乐园打包、上传、提审都没做。
