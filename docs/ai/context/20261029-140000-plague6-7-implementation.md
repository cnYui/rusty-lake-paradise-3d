# 2026-10-29 第六灾（疹灾）、第七灾（雹灾）首次可玩实现（占位人物）

## 来源

- 用户要求：继续做第六、七章，人物先用 mock，逐帧看原作视频了解玩法和剧情，沿用前五灾的代码结构，补测试，开草稿 PR；打包 / 上传 / 提审先不做。
- 参考视频：本地 `dev/common/ref/P06_第六灾-疹灾_BV1bo4y1y7fm.mp4`（25:31）、`P07_第七灾-雹灾_BV1bo4y1y7fm.mp4`（27:21）。用 ffmpeg 抽每 4 秒一张的总览缩略图，再对关键段抽 0.25–3 秒一张的细节图，逐段看完；抽帧放在会话临时目录，没有进仓库。
- 结论写成 `docs/plague6_7_design.md`（原作时间码表 + 重制版契约 + 与原作差异）。

## 分支

- 本机主检出原先在 `feat/plague3-art`（落后 origin 16 个提交）且带一批未提交改动；逐个文件核对过这些改动都已经在 `origin/feat/plague3-art`（3d0d69f，含 PR #4 / #6 / #7 / #8）里，才从 `origin/feat/plague3-art` 切出 `feat/plague6-7`。

## 实现

- 第六灾 `src/chapters/plague6/`，道具 `src/art/props_p6.js`；第七灾 `src/chapters/plague7/`，道具 `src/art/props_p7.js`，雪景在 `plague7/world.js` 的 `snowScene`（地形材质调白、湖面盖半透明冰层、天堂门积雪、900 颗飘雪粒子跟着相机）。
- 共用占位人物 `src/art/cast_mock.js`（`makeMockPerson`）：几何体拼的人，按真实身高，`stand / sit / lie`，没有骨骼动画；章节里的“动作”直接转 `parts.armR` 等部件（医生的法杖指向、冰中青年抱臂、鹿头人举心）。
- 结尾的画（`plaguePainting`）在 `props_p6.js` 里写成两章共用的工厂，接口同第五灾的画（`glowCube / clearPlague / frameNext / setState`）。
- 注册表：两章 `wip: true`，`requires` 分别是前五灾、前六灾。`build.py` 在打包副本里把两章的 `load` 置空（小红书包实测：章节代码不进包，`props_p6/p7` 因 `props.js` 静态引入仍在，zip 619,019 字节，比 10-29 的 V1.0.18 包大约 13 KB；game.js 里转义写法的“死 / 血”只剩已知的第三灾那一处）。

## 规则与原作的差异（详见设计文档）

- 第六灾：疹子、牙齿的规则原作看不清，重做为“第一颗橙色、沿静脉、颜色橙绿灰轮换”和“交换下牙让上下咬合”；落地钟答案 ×→V、∶→VIII 和字母箱 BOAR 照原作；鼻涕的来源改成胡椒。
- 第七灾：冰块谜题、滑冰谜题重做为“立冰压相邻平冰”和“滑到撞上树桩 / 边缘才停”；滑冰奖励定为胡萝卜；锤子放在神殿、尖木头在柴堆；冰中青年给第三颗钻石；水晶球放在圣水盆上触发鸟笼过场。

## 验收（全部通过）

- `node --test`：第二到第七灾规则 + `dev/common/test_hints.mjs`（已加第六、七灾）共 88 项。
- `python dev/plague6/test_plague6_browser.py`：自动通关 138 步、3 个成就；真实鼠标 / 数字键完整通关 111 次点击（含一次故意倒错体液）；中途读档（疹子、量瓶、牙齿、通关后神殿）；门禁（门开前进不去门内、牙没对上钟不开）；菜单（正常“敬请期待”，`?wip=1` 能进）；触屏（错点疹子复原、物品栏轻点）。
- `python dev/plague7/test_plague7_browser.py`：自动通关 128 步、3 个成就；真实鼠标 / 数字键完整通关 100 次点击（含一次冰池死局后点石头重来）；中途读档（滑冰、冰池、雪人、通关后神殿）；门禁（Gerard 第一支只收草莓、不插尖木头敲不开冰）；菜单；触屏（滑冰、冰池、物品栏）。
- `python dev/common/test_hints_browser.py 6 7`：29/29（每一步都有提示，通关后全部 done）。
- `python dev/common/test_progress_browser.py`：84/84（第五灾结尾仍只有“返回主菜单”，因为第六灾是 wip）。

## 没做 / 后续

- 正式人物模型（瘟疫医生、躺着的 Gerard、Caroline、冰中青年、雪人老妇人脸等）；做好后换掉 `makeMockPerson` 并去掉 `wip`。
- 音效沿用现有合成音，没有新增。
- 小红书 / 233 乐园打包、上传、提审都没做。
