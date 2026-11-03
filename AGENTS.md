# 项目约束

- 默认使用中文；文档、说明、总结、计划、回复和代码注释都使用中文。
- 目录地图（公共 / 每章 / 发布包 / 文档各放哪）在根目录 `CLAUDE.md`：游戏本体 `index.html`、`styles.css`、`src/`、`vendor/three/` 路径不能动；开发工具和参考视频在 `dev/common/`，每章的验收、录像、成片在 `dev/plagueN/`，发布压缩包在 `upload/`。新脚本和产物按这个分法放，大文件输出到 `dev/<章节>/media/`（已 `.gitignore`）。
- 第一灾的章节逻辑集中在 `src/chapters/plague1/`，优先复用 `src/art/` 中已有的模型工厂和动画 API。
- 章节状态必须通过 `state` flags 和 inventory 表达；`sync()` 负责从存档状态恢复模型显示状态。
- 每次修改、验证和设计决策都在 `docs/ai/context/` 新增带时间戳的中文记录，不覆盖历史记录。
- 浏览器验证使用 `dev/common/shot.py` 和 `window.RLP`；完成章节修改后至少跑一次 `RLP.autoplay()`。
- 室外开放视图（非特写、非 `fixed`）进入后始终自由漫游，不显示方向箭头、不再回到室外固定机位；自由模式只修改临时相机位置，不写入存档，进入室内或谜题特写必须通过 `views.go()` 收回固定镜头控制，返回时恢复进入前的漫游位置。
- 可走动的室内（目前是第一灾的房子）：视图标 `roam: true`，走动范围用 `views.defineRoamArea(zone, { bounds, circles, boxes, eye })` 定义（墙内侧边界 + 家具碰撞）；从外面进门总是站在门口机位，从同一区域的特写返回时恢复原位，出门回到进门前的室外位置。室内漫游时只开放当前区域里开放视图的热点。
- 漫游移动必须尊重 `layout.js` 的岛屿边界、`world.colliders` 与章节用 `views.addRoamGate()` 注册的门禁（天堂门、小屋门），不能绕过章节门禁；热点在漫游模式对所有开放视图的热点放宽筛选，但仍必须经过射线、可见性、`when` 条件和最远交互距离。
- 电脑端鼠标只负责点击和视角：不使用 Pointer Lock、准星或拖拽切视图；视角以左侧游戏画布中心为中立点，靠边转向、漫游时水平可 360° 连续转。电脑端物品栏只用数字键操作（选中 / 再按取消 / 按另一个数字键合成 / 连按两次查看），槽位不接收鼠标。
- 公网部署（https://aaccx.pw/rusty-lake/）只用 `bash dev/common/deploy_mac.sh`；线上路径里不能出现 `/vendor/`（Cloudflare WAF 会拦截），入口页之外的资源必须放在带版本号的目录里。Mac 上的 `127.0.0.1:8080` 是 Sub2API 的 Docker 容器，不是 nginx；游戏走 cloudflared 规则 → nginx `127.0.0.1:8081`。重启隧道会中断同域名下所有服务的长连接，非必要不要重启。
- 触屏端（`src/core/touch.js`，`#stage.touch`）：漫游时画面左侧拖动是虚拟摇杆、其它位置拖动转视角，轻点互动，物品栏直接点（规则同数字键）。触屏逻辑只处理 `pointerType` 为 touch / pen 的指针，不能改变电脑端的鼠标和键盘行为；手机按横屏设计，竖屏显示旋转提示。
- 小红书打包补丁只替换明确命名的目标函数，不按相邻注释截掉整段源码，避免误删章节菜单逻辑。每个待上传包必须从无参数首页验证菜单和真实触摸；`RLP.ready` 为真时仍须检查 `RLP.bootError` 为空，不能只测绕过菜单的 `RLP.autoplay()`。
- 小红书小工具开放第一到第五灾（第三灾 2026-10-22 起、第四灾 2026-10-24 起、第五灾 2026-10-29 起，解锁顺序同网页版：每章要先通关前面所有章，通关第四灾的结尾卡会出现“进入第五灾”并倒数自动进入）；口袋方舟（233 乐园）包仍只有第一到第四灾：`build.py --ark` 在打包副本里把第五灾的 `load` 置空，网页版源码不动，要让 233 带上第五灾就改 `build.py` 里 `if a.ark:` 那一段并重打 `make_leyuan.py`；记录见 `docs/ai/context/20261029-100000-xhs-minitool-plague5.md`；第三灾 David 的台词“我今天血糖非常低.”在小红书包里改成“x糖”（审核对“血”字敏感，口袋方舟包保持原文）。启动期不能出现几秒不让出主线程的同步任务（评论反馈过“白屏和载入页快速交替闪”，推测是慢手机上启动被容器判为无响应而反复重载）：大块同步建模在 `build.py` 补丁里按子步骤 `await __stage()` 让出一帧，第一次渲染由 `rotate.js` 的 `__RLP_WARM` 分片预热着色器；新加补丁后先确认页面能启动（`RLP.bootError` 为空）再看耗时数字。启动被反复重载时 `rotate.js` 会自动进轻量模式（`window.__RLP_LITE`：关阴影、像素比 1、关水面倒影），只用同步的 `localStorage`，不要在启动路径上等任何外部东西。例外是小红书包的存档层 `dev/minitool/storage_xhs.js`（存档 / 档案走 `window.xhs.miniTool` 的 Storage API，客户端 ≥ 9.46.0 才启用，不支持就退回 localStorage）：`main.js` 读档案前等它 `ready`，它自己限时 1.5 s，超时就降级，不能把这个上限调大；`rlp3d.boot` 永远只走 localStorage。着色器预热是逐组 `renderer.compile` + `fenceSync` 非阻塞等 GPU，不要再加一次性的 `compileAsync` / 整体编译；大量绘制的 2D 画布要用 `willReadFrequently`（CPU 光栅化），否则 SwiftShader 下 GPU 进程会忙十几秒、点击送不进页面。测量用 `python dev/minitool/measure_longtasks.py <包目录> --cpu 3`，记录见 `docs/ai/context/20261027-103000-xhs-storage-and-boot-freeze.md`。`build.py --no-minify` 只用于采样排查，不能上传。记录见 `docs/ai/context/20261019-094500-xhs-minitool-ch12-flicker-fix.md`。
- 口袋方舟 H5 上传时，ZIP 的 `index.html` 放在根目录，发布地区不选 GPark；资料中如实标注《Rusty Lake Paradise》同人重制及原作来源，不宣称已获授权。

## 进度、存档与章节衔接

- 存档、成就历史和通关记录都在本机 localStorage（`src/core/state.js`，全部 try/catch）：`rlp3d.save.<章节id>`（`v: 2`，版本对不上就当没有；旧版 v1 是“启动即清档”时代的存档，不再读）、`rlp3d.profile`（`ach`：成就历史 `{ id: { t, zh, en, ch } }`，`cleared`：通关记录 `{ 章节id: { t } }`）、`rlp3d.last`（最近玩的章节）。“重新开始”只清这一章的存档，成就历史和通关记录保留；只有设置里的“重置进度”（`state.wipeAll()`）全部清掉。写入失败时档案留在内存里，本次游戏内通关和成就仍有效，菜单会提示“这里不能保存进度”。
- 启动不再清档；只有 `?autotest=1`、`?demo=1`、`?fresh=1` 每次从空白开始。测试页里要验证菜单、读档或解锁，先自己往 localStorage 垫 `rlp3d.profile`（见 `dev/plague2/test_plague2_browser.py` 的 `verify_menu_and_movement`）。标题菜单期间 `state.saving = false`（不写存档），`startChapter` 一开始才恢复；自动存档在 `main.js`（状态变化后 500 ms 合并，过场 `ui.locked` 期间等它结束再存，`pagehide` 立即存）。
- 章节解锁在 `src/chapters/index.js` 的 `requires`（前置章节 id）和 `src/core/progress.js`（`chapterStatus` / `nextChapter` / `resumeChapter` / `liveSave`）：没通关前置章节的章在菜单里是“未解锁”（点了提示“通关第一灾后解锁”）；`requires` 可以是一个章节 id，也可以是数组（全部通关才解锁）：第二灾 `requires: 'plague1'`，第三灾 `requires: ['plague1', 'plague2']`（三灾必须按顺序玩，菜单提示会指到第一个没通关的前置章节），第四灾 `requires: ['plague1', 'plague2', 'plague3']`，第五灾 `requires: ['plague1', 'plague2', 'plague3', 'plague4']`（前五灾必须严格按顺序一章一章解锁，不能单独玩后面的章）。开发跳转 `?chapter=N` 不经过菜单，不受锁影响；`?unlock=1`（或 `?wip=1`）让菜单跳过这把锁。章节的通关旗标（`completeFlag`，默认 `<id>_complete`）一立起来，`main.js` 的 `watchClear` 就记进通关记录。
- 通关结尾（`ui.ending`）：有下一章（编号 +1 且已解锁、有 `load`）就出现“进入下一灾 / 返回主菜单”，倒数 8 秒后自动进入；点“返回主菜单”或关掉结尾卡就取消。进入下一章 = `main.js` 的 `switchChapter`（记进 sessionStorage 再重载，一个页面只装载一章；下一章有没打完的存档就继续，否则新开）。`?autotest=1` / `?demo=1` 不自动倒数，测试里要走自动进入就把 `RLP.ctx.ui.autoAdvance` 设为 true。启动时 `bootChapterNumber` 先装载玩家多半要点 ▶ 的那一章（最近玩的没打完的章节，通关第一灾后是第二灾），省掉一次重载；第一灾通关后菜单 ▶ 指向第二灾。
- 新增章节要接上衔接：注册表里写好 `requires`、`load`，章节对象写 `completeFlag`，通关时 `await ctx.ui.ending(T.ending)`；成就表放在章节 `text.js` 的 `ACHIEVEMENTS`，想在菜单成就面板里按章节列出就在注册表写 `achievements`（没写的章节，解锁过的成就仍会出现在“其他章节”）。验收入口 `python dev/common/test_progress_browser.py`；小红书小工具的菜单测试（`dev/minitool/test_minitool.py`）已按解锁规则改过。记录见 `docs/ai/context/20261019-212200-progress-save-chapter-chain.md`。
- 成就必须每一个都有发放点并能在自动通关里拿到：每章 `ACHIEVEMENTS` 里的 id 都要有 `ctx.achieve(id)` 调用，新增成就同时把它放进该章 `walkthrough`（可选动作也放，自动通关才能覆盖），验收入口 `python dev/common/test_achievements_browser.py`（三章依次自动通关，成就在章节存档和玩家档案里都有，重载后成就面板满格）。第一灾的“欢迎来到天堂岛（用虾开天堂门）/ 这是我（圣水盆倒影）/ 第一个符号（盖子滑开后点棺材里的符号）”曾经没有发放点（2026-10-22 补上，旧存档读档时按旗标静默补发）；棺材里的符号要画在水面上方，画在衬里上会被血水盖住。

## 第四灾与参考资料

- 第三至第十灾的既定参考视频位于 `dev/common/ref/P03_*.mp4` 至 `dev/common/ref/P10_*.mp4`，源视频为 B 站 `BV1bo4y1y7fm`；定位和完整性记录见 `docs/ai/context/20261008-201654-bilibili-reference-videos.md`。视频与抽帧只作本地参考，不提交、不部署。
- 第四灾逻辑集中在 `src/chapters/plague4/`，专属程序化模型在 `src/art/props_flies.js`；游戏状态（flags / 物品）不依赖第二、三灾进度，但菜单里要先通关第一到第三灾才解锁（见“进度、存档与章节衔接”）。天堂门和木小屋开局开放，绿色宝石解锁神殿入口，以免湖边寄居蟹与宝石形成循环前置。
- 第四灾寄居蟹保留三轮真实导向模拟，用“点贝壳、点空格、点寄居蟹出发”统一鼠标和触屏；轮次、摆放与选中状态保存到 `p4_crab_*` flags。规则和窗锁校验在 `puzzles.js`，场景同步必须支持新游戏和读档的双向恢复。
- 第四灾的小物件（兔洞、鸟、心脏、胡萝卜等）靠 `world.js` 的 `fatten(ctx, object, { min })` 挂不可见点击盒放大点击范围；新加的小热点照这样做，点击盒重叠时用 `when` 让位（见 `docs/ai/context/20261026-093500-save-button-p4-click-areas.md`）。右上角暂停面板有“保存进度”按钮（自动存档照常，按钮是手动再存一次）。
- 第四灾验收入口为 `node --test dev/plague4/test_plague4.mjs` 和 `python dev/plague4/test_plague4_browser.py`。真实点击采样前等待画布的 CSS 入场动画结束；游戏加速不会加速 CSS 过渡，不能把变化中的画布坐标当成稳定落点。

## 第五灾

- 第五灾逻辑集中在 `src/chapters/plague5/`，专属模型工厂位于 `src/art/props_p5.js`（汇总）、`props_p5_food.js`（食材 / 盘子 / 汉堡 / 刀 / 炉灶 / 砧板）、`props_p5_garden.js`（菜地、连线）、`cow_model.js`（牛身疫斑），统一使用 `p5_` 前缀，已去掉 `wip`，要先通关第一到第四灾才解锁（`?unlock=1` / `?wip=1` 可跳过这把锁）。第五灾的游戏状态独立于其它章节，参考为 `dev/common/ref/P05_第五灾-疫灾_BV1bo4y1y7fm.mp4`。
- 菜地为三轮可移动菜苗的行列占格数谜题，连线为五轮节点度数与全图连通谜题；纯规则在 `rules.js`，接受所有满足约束的解，不能把自动流程的解写成玩家唯一答案。
- 牛治好后才能取肉和挤奶；蔬菜切片、肉馅煎熟、汉堡逐层消耗食材。Gerard 吃完才开放厕所，林间连线解完才开放圆盘回忆，黑方块从回忆取得后才开放神殿，不能跳过汉堡主线。
- 斑点、菜地、连线、汉堡中途进度均保存到 flags；`sync()` 必须支持新游戏、旧档与重复调用。公共吊架下降是累加接口，恢复时按差值；不可逆的插入/点燃显示需要回退时，只重建本章对象并更新热点和帧注册。
- 第五灾的谜题全是真 3D 摆设（2026-10-24 重做，不是平面题板）：牛皮斑点是贴在真实牛网格侧面的 10 颗彩色疫斑（点牛身侧面推近镜头 `p5_skin`，同色两两配对）；菜地是垄土 + 木框 + 木牌红色刻痕 + 巨型蔬菜（点苗或点盘子里的备用苗选中，再点田格；已选中一株时苗的热点关闭，避免前排苗挡住后排田格）；连线是石灰板上的铜钉（钉面小圆点数 = 要连几根线）和红绳。食材、盘子、汉堡、刀、炉灶、砧板按真实大小建（汉堡直径约 13 cm、盘子 26 cm），切菜是奶奶剁三刀、砧板上的食材每刀换一个样子；盘子和面包在 `p5_table` 桌面特写里。对照原作抽帧的结论见 `docs/ai/context/20261024-130000-plague5-3d-rework.md`。
- 第五灾验收入口为 `node --test dev/plague5/test_plague5.mjs` 和 `python dev/plague5/test_plague5_browser.py`，覆盖自动通关、真实鼠标/数字键、触屏、存档与漫游；首次可玩实现及验收见 `docs/ai/context/20261014-184500-plague5-implementation-verification.md`。

## 第六、七灾（2026-10-29 起，wip）

- 设计文档 `docs/plague6_7_design.md`：原作流程（参考 `dev/common/ref/P06_第六灾-疹灾_*`、`P07_第七灾-雹灾_*` 抽帧，带时间码）+ 重制版契约（视图、物品、谜题规则、旗标、成就、与原作的差异）。改谜题先改这份文档。
- 第六灾 `src/chapters/plague6/`（道具 `src/art/props_p6.js`，`p6_` 前缀）：天堂门接血开门 → 四体液（血 / 泪 / 涕 / 唾，奶奶给洋葱 / 胡椒 / 蘑菇用空瓶接）按 CURE 书配药 → 疹子（第一颗橙色、沿静脉、颜色橙绿灰轮换）→ 刀切 × 取病心 → 喂药 → 牙齿咬合（下排第 5 颗 ×、上排第 8 颗 ∶）→ 落地钟 ×V ∶VIII 取发条心 → 放入胸口、针线缝合 → 字母箱 BOAR → 回忆里把病心交给鹿头人 → 黑方块 → 神殿。第七灾 `src/chapters/plague7/`（道具 `props_p7.js`，`p7_` 前缀；雪景——地面泛白、湖面冰层、飘雪粒子——在章节 `world.js` 的 `snowScene`）：滑冰（滑到撞上树桩 / 边缘才停）、冰池（立冰压相邻平冰）、牛角敲冰锥做草莓 / 开心果冰淇淋换 Gerard 的帽子、雪人五件套、冰中青年、雪景球机器三颗钻石 → 圣水盆过场 → 黑方块 → 神殿。纯规则都在各章 `rules.js`，接受所有合法解。
- 人物（2026-11-02 起）：章节调 `src/art/cast_mock.js` 的 `makePerson(id)`，有模型的人物用网格模型或游戏原有的程序化人物（Caroline、第七灾要摘帽子的 Gerard），外面套和占位人物一样的接口（`setPose('stand'|'sit'|'lie'|'kneel'|姿势字典)`、`setHeld`、`parts.body/head`，另有 `POSES`、`reach(side, pos)`）。骨架人物的关节每帧按 `rig.pose` 重写，摆手臂只能用 `setPose` / `tweenPose` / `reach`，不能直接改 `parts.armR.rotation`。瘟疫医生 2026-11-03 起用网格模型 `doctor`（`makePerson('plague_doctor')`，没有模型时回落占位人物）；只剩冰中青年还没有模型，仍是 `makeMockPerson` 占位，所以两章仍标 `wip: true`（正常菜单“敬请期待”，`?wip=1` 才能选，wip 同时跳过解锁顺序）；`requires` 已写好（第六灾要通关前五灾，第七灾要通关前六灾）。对照原作改正了身份：第七灾滑冰的红发女人是 Ida，神殿里跪着的是母亲 Caroline。人物对照表在 `docs/plague6_7_design.md` §人物。
- 小红书 / 口袋方舟打包：`build.py` 在打包副本里把第六、七灾的 `load` 置空（章节代码不进包；`props_p6/p7` 因为 `props.js` 静态引入仍在包里，约 +13 KB，不含“死 / 血”字）。放开前要去掉那两行并过一遍审核敏感字（第六灾文案有“血液”“死亡”）。
- 验收入口：`node --test dev/plague6/test_plague6.mjs dev/plague7/test_plague7.mjs`、`python dev/plague6/test_plague6_browser.py`、`python dev/plague7/test_plague7_browser.py`（自动通关、真实鼠标 / 数字键完整通关、中途读档、门禁、菜单 wip、触屏），提示表 `python dev/common/test_hints_browser.py 6 7`。记录见 `docs/ai/context/20261029-140000-plague6-7-implementation.md`。

## 第八灾（2026-11-01 起，wip）

- 设计文档 `docs/plague8_design.md`：原作流程（参考 `dev/common/ref/P08_第八灾-蝗灾_*` 抽帧，带时间码，台词和歌词只写大意）+ 重制版契约。改谜题先改这份文档。章节逻辑 `src/chapters/plague8/`，道具 `src/art/props_p8.js`（`p8_` 前缀），音效在 `src/core/audio.js`（`locust_1…5`、`mantis`、`fog_horn`、`owl`、`mandolin`）。
- 流程：门外三个乐手唱谜歌 → 木盒三个滑块按属性对上三人（帽子 / 胡子 / 白发 / 大肚子，横杠有、圆点没有）→ 斧子劈开钉死天堂门的木板 → 雾林里照门外乐谱的高低点五只蝗虫 → 卵鞘孵出巨型螳螂 → 发光的蛾子引螳螂吃掉山羊得羊眼睛 → 交给木屋里的红发女人（能看穿雾）→ 点刻眼睛的树让雾散开：屋前多出萤火虫、羊骨旁露出地上的圈 → 萤火虫引螳螂叼走猫头鹰得钥匙 → 铲子挖出箱子、钥匙开箱得雾之号角 → 号角给船上的老奶奶，螳螂把她提走 → 点空船上的黑方块进回忆、拿黑方块 → 神殿。纯规则在 `rules.js`，接受所有合法解（木盒按属性判定、摆的顺序随意；合唱点错从头来）。
- 浓雾：章节 `world.js` 的 `fogController` 注册成每帧更新的道具（`main.js` 里排在 `world.update` 之后），按相机位置调 `world.setFog`（门外 0.6 薄雾，进门 1）；白雾最浓时的近 / 远距离用 `sky.js` 新加的可选项 `fogState.whiteNear / whiteFar`（不设就是原来的 0 / 42，别的章不受影响）。第一灾林间小路缺口里不吃雾的黑卡片 `forest_path_dark` 这一章藏起来，湖水颜色压暗一点。螳螂在雾里待的位置由旗标推导（`sync` 里按进度换），过场从雾里走出来出手再退回去。
- 人物（2026-11-02 起）用正式模型（`makePerson`，见第六、七灾那条）：三个乐手是网格 Gerard / David（帽子挂羽毛）/ Nicholas 抱曼陀林，红发白眼女人是网格 Ida（眼珠上盖白色圆片，`sight_on` 后变金色，位置是 `world.js` 的 `IDA_EYES`），黑影是网格“灵魂”（`soul`，2026-11-03 起，第一、八、十灾共用，接口仍是 `vanish()` / `appear()`；没有模型时回落程序化黑影），船上奶奶是网格 Margaret（号角挂在头骨骼上贴着嘴，`grandmaHorn`），回忆里少年 Jakob 是网格、母亲是程序化 Caroline；山羊也是网格（模型都列在 `rlpm.js` 的 `CHAPTER_MODELS.plague8`）。Nicholas 的模型有八字胡，木盒 III 的属性改成 `[0,1,1,0]`（答案第 2 列），谜歌第三句加了胡子。注册表仍 `wip: true`（跟第六、七灾一起放开）、`requires` 第一到第七灾；`build.py` 打包副本里把第八灾 `load` 置空。
- 验收入口：`node --test dev/plague8/test_plague8.mjs`、`python dev/plague8/test_plague8_browser.py`（自动通关、真实鼠标 / 数字键完整通关、中途读档、合唱点错重来、浓雾、门禁、菜单 wip、触屏），提示表 `python dev/common/test_hints_browser.py 8`。记录见 `docs/ai/context/20261101-150000-plague8-implementation.md`。

## 第九、十灾（2026-11-02 起，wip）

- 设计文档 `docs/plague9_10_design.md`：原作流程（参考 `dev/common/ref/P09_*`、`P10_*` 抽帧，带时间码）+ 重制版契约 + 与原作的差异，改谜题先改这份文档。第九灾逻辑 `src/chapters/plague9/`、道具 `src/art/props_p9.js`（`p9_` 前缀；夜空 / 黄昏天空和星月也在这里，第十灾复用）；第十灾逻辑 `src/chapters/plague10/`、道具 `src/art/props_p10.js`（`p10_` 前缀）。新音效：第九灾 `peck / grind / chain / ice_crack`，第十灾 `drum_low / drum_high / bow / hen / chick / stone_door`。
- 第九灾（夜灾）：夜、满月、薄雪。篝火里撒粉末（树皮 / 贝壳 / 青石 / 红月石磨成棕 / 白 / 蓝 / 红）浮出星座黑影 → 塔里星座盘按影子拨针开抽屉得铜钥匙 → 挂锁、绞盘放下梯子 → 阁楼月相仪（地球挡在太阳和月亮中间）月食，红光落进塔外雪地，镐凿出红月石 → 阁楼影子戏（蜡烛挪到天蝎上，五个影子落进轮廓）→ 塔顶烽火吓走湖边猫头鹰 → 木箱里母亲的骨头磨成骨粉撒进篝火 → 灰里的黑方块 → 神殿。塔门正前方那块大石头这两章都压进地里（`plague9/world.js` 的 `clearDoorBoulder`）。
- 第十灾（长子之死，最后一章）：黄昏，神殿外面套一只巨大的木头猫头鹰（栅栏、栅门、门前两根火炬柱）。敲鼓（照 Nicholas 的左右手节奏；左右按玩家看过去算）掉下尖骨头 → 箭杆 + 羽毛 + 尖骨头合成骨箭 → 苹果顶在 David 帽子上、骨箭给 Gerard → 虫子喂母鸡得蛋 → 刷子画 Ida 的脸（照木屋的竖条纹面具画）她递来蜡烛 → 蛋进平底锅、蜡烛点炉子孵出小鸡 → 小鸡喂仓鸮 → 食丸四组骨头转成 OWLS → 井下三间石室：字母门、拱龛室五副面具、右手边鹰室六边形拼红猫头鹰得黑方块 → 面具交给对的人（给错不接），戴上就换成自带动物头的网格模型、身边火炬点着 → 五个都戴上栅门打开 → 猫头鹰肚子里的神殿 → 红色幻象，全剧终。湖边大石头紧贴猫头鹰门的右边：门前火炬在栅门外两边，戴面具的人站在栅栏里门的左边（`world.js` 的 `GATE_TORCHES` / `OWL_SPOTS`，猫头鹰局部坐标）。
- 纯规则在各章 `rules.js`（不 import three），接受所有合法解；中途进度（鼓的拍数、脸的颜色、骨头转角、字母门、六边形、拿走 / 戴上的面具等）都在旗标里，`sync()` 支持新游戏、读档和重复调用。
- 人物都用 `makePerson`：`gerard_p9 / david_p9 / nicholas_p9`、`gerard_p10 / david_p10 / nicholas_p10`，第十灾戴上面具后 `gerard_boar / david_rabbit / ida_pheasant / margaret_pigeon / nicholas_deer`（`ida_pheasant` 是戴野鸡面具、棕色泡泡袖裙的网格模型 `pheasant`，2026-11-03 接入；没有模型时回退成程序化 Ida 戴面具）；`rlpm.js` 的 `CHAPTER_MODELS` 已加 `plague9 / plague10`。戴猫头鹰面具的 Elizabeth 2026-11-03 起用网格模型 `elizabeth_owl`（面具、黑长发、围裙裙都在网格上），没有模型时回落程序化身体 + `p10_owl_mask`；黑影用网格 `soul`。
- 注册表两章都 `wip: true`，`requires` 前面所有章；`build.py` 打包副本里两章 `load` 置空，第十灾标题在包里改成“长子之S”（注册表里 `title: { zh: '长子之死', en: 'Death of the Firstborn' }` 这段字面量别改，补丁按它匹配）。`props_p9/p10` 因为 `props.js` 静态引入仍在包里，里面不能出现“死 / 血”字（`test_plague10.mjs` 查 `props_p10.js`）。放开前去掉 wip 和 `build.py` 那两行，并过一遍审核敏感字（第九灾成就“血月”）。
- 验收入口：`node --test dev/plague9/test_plague9.mjs dev/plague10/test_plague10.mjs`、`python dev/plague9/test_plague9_browser.py`、`python dev/plague10/test_plague10_browser.py`（自动通关、真实鼠标 / 数字键完整通关、中途读档、门禁、错误用法、菜单 wip、触屏），提示表 `python dev/common/test_hints_browser.py 9 10`。记录见 `docs/ai/context/20261102-164500-plague9-10-implementation.md`。

## 第二灾与人物复用

- 第二灾逻辑集中在 `src/chapters/plague2/`，专属道具在 `src/art/props_p2_*.js`（人物统一在 `src/art/cast.js`），参考为 `dev/common/ref/P02_第二灾-蛙灾_BV1bo4y1y7fm.mp4`。参考视频及抽帧仅本地保存。
- 人物模型（第二版）全部在 `src/art/cast.js`：工具层 `charkit.js`（骨架 Bone、IK、蒙皮权重）与 `human.js`（按身高推比例、蒙皮衣物、头部、帽子），`characters.js` 只保留面具、山羊、开场小船和 `makeCharacter` 入口。新章节复用 `makeCharacter(id)` 或 `manBody` / `womanBody` / `margaretBody`，只加章节道具、衣物变化和动作，不复制身体建模。
- 蛙卵的六对为 7/9、1/12、4/10、3/11、2/8、5/6，任意顺序可解；错配全部复位。睡莲共五关，接受所有合法路线。首选蛙卵、配对掩码、睡莲关内进度、转盘角度、乐句与锅内食材均保存到 flags，`sync()` 双向恢复。
- David 系腰带后进入石头特写拾蛙；四蛙、木柴与火齐全后才能盛汤。Gerard 喝汤后接碗吐钥匙，箱子回忆后才可拿黑方块。吊架热点只包含主体，结尾中断读档可点击吊架或画面继续，下降按状态差值恢复。
- 第二灾验收入口为 `node --test dev/plague2/test_plague2.mjs` 与 `python dev/plague2/test_plague2_browser.py`，覆盖完整自动通关、真实鼠标和数字键、完整触屏、失败重试、读档复位及室内漫游。截图必须显式等待章节启动、交互空闲与画布 CSS 动画，避免入场淡出污染视觉判断。
- 第二灾已开放正常菜单；最终模型、160 步自动通关、鼠标与触屏模拟通关以及首页走动验收见 `docs/ai/context/20261014-203308-plague2-completion-verification.md`。触屏模拟与实体手机验收需区分。

## 人物模型

- 人物按真实身高建模，各章节一律 `scale = 1`，不要再用缩放凑镜头；镜头、座位和摆放去适配人物。身高（头骨顶）：Nicholas 1.88、Gerard 1.84、David 1.78、Jakob 1.76、Caroline 1.66、Ida 1.58、Margaret 1.56（驼背约 1.47）、Elizabeth 与少年 Jakob 1.30–1.32、灵魂约 1.97。
- 衣服、袖子、裤腿、裙子是连续蒙皮网格（`torsoSkin` / `limbSkin` / `skirtSkin`），弯肘、坐下时一起变形；头、手、鞋、帽子、头发是挂在关节上的刚体。坐姿用 `seatedPose(rig, seatY)`（含 `body.p` 位移），长裙人物一直坐着时直接按坐姿建裙子（见 `margaretBody({ seat })`）。
- 外观和动作以 `dev/common/ref/P0x_*.mp4` 为准；改人物后用 `dev/common/cast.html?preset=family`（身高对照，`preset=masks` / `seated` / `current`）检查比例，并在各章节实际镜头里截图核对。人物重做的参考帧、比例与验收见 `docs/ai/context/20261014-232000-cast-remodel.md`。

## 第三灾

- 原作标题“第三灾 / 蚊灾和虱灾”（Gnats & Lice），参考 `dev/common/ref/P03_第三灾-蚊子灾_BV1bo4y1y7fm.mp4`。设计契约 `docs/plague3_design.md`，美术接口 `docs/plague3_api.md`，交接说明 `docs/plague3_handoff.md`。
- 美术与逻辑分开做：道具在 `src/art/props_p3_*.js`（id 一律 `p3_` 前缀，物品模型在 `props_p3_items.js`），人物变体在 `src/art/cast_p3*.js`（复用 cast.js 的身体）；章节逻辑在 `src/chapters/plague3/`。逻辑只按接口调用，不改美术文件。
- 第三灾美术已全部做完（正式模型）；`props_p3_placeholders.js` 和 `cast_p3.js` 的回退只作兜底（`userData.placeholder` / `rig.placeholder`），新增 id 没做好时才会用到。实现偏差见 `docs/plague3_handoff.md` §2.1。
- 有状态的道具 / 人物都提供 `setState`，`sync()` 只调用它做双向恢复。白桦林是独立 zone `p3_grove`（原点 [600,0,0]），从 G 空地红叉树倒下后的缺口进入。公共画作第三灾用 `{ insects: true }` + `banishWoman / frameFly / setState`。
- 第三灾章节逻辑已实现（`src/chapters/plague3/`：`world.js` 布景与视图、`puzzles.js` 纯规则、`beach / forest / house / lake / temple / grove.js` 各区域），注册表里 2026-10-22 起已去掉 `wip`、写了 `requires: ['plague1', 'plague2']`，网页版、小红书小工具和口袋方舟包都开放第三灾（`build.py` 断言注册表里这条解锁条件还在）。验收入口：`node --test dev/plague3/test_plague3.mjs`、`python dev/plague3/test_plague3_browser.py`、`python dev/plague3/record_plague3_demo.py [--fast]`（真人输入走完全程并录像）、`python dev/plague3/shots_plague3.py`（逐视图截图）。写章节文件时注意 Windows 上 Python 文本模式写文件会把 LF 改成 CRLF，用 `newline=''` 或 Edit 工具。

## 网格人物与动物模型（2026-10-23 起）

- 用户用 AI 生成的 3D 模型已替换程序化建模：Nicholas、Gerard、David、Margaret、Ida、少年 Jakob、五个动物头人物（`david_rabbit` / `gerard_boar` / `margaret_pigeon` / `nicholas_deer` / `ida_pheasant`，模型自带动物头，不再戴面具）、山羊（第一灾，已删木盆）、牛（第五灾）、苍蝇人（第四灾）、岛上的石塔（38 m，`P.tower`，`tower_model.js`，贴图用 `dev/common/models/tower_recolor.py` 调成暖灰手绘色）。模型都是“大字型”，**一律绑骨骼、把腿和手臂摆直之后再量身高**（休息姿势下头骨顶 = `scale.js` 的 `HUMAN`），不要按原模型的叉腿姿势直接量。文件在 `src/art/models/<key>.rlpm` + `<key>.jpg`（自定义二进制 + 烘焙贴图，每个约 1 MB + 0.7 MB），加载器 `src/art/rlpm.js`，山羊 / 牛 / 苍蝇人各有 `goat_model.js` / `cow_model.js` / `fly_model.js`；生成流程和地标在 `dev/common/models/`（Blender 脚本 + README），原始 GLB（每个 60 MB）不入库。2026-11-02 用户在 Downloads 重新下载了一批 Tripo 低面版 GLB（约 1.8 万面、8 MB），按用户要求改名为「游戏名-角色名」（如 `锈湖天堂岛-杰拉德.glb`，对照表在 `dev/common/models/README.md`）；其中文件名叫“猫头鹰头伊丽莎白”的那个，对照原作其实是戴野鸡面具的 Ida，2026-11-03 在云端转成 `pheasant.rlpm`（`ida_pheasant`）；这批低面版导入后是侧着的，`retopo_bake.py` 会自动转正（见 README）。
- 接口不变：人物仍是 14 关节骨架，`makeCharacter(id)` 的各种方法、`rig.pose` / IK / `seatedPose` 照旧；`cast.js` 的 `manBody / nicholasBody / margaretBody / womanBody` 开头调 `modelHuman(id)`，有模型就返回网格人物，没有（或模型没加载）就走原来的程序化建模。`?models=0` 强制全部用程序化人物做对照；`rlpm.js` 的 `PROCEDURAL` 列出继续程序化的变体（`gerard_young`、`ida_child`、`nicholas_stand`、`gerard_barber`、`gerard_p7`（第七灾帽子要被拿走）：年龄 / 衣服颜色和模型对不上，或者构建代码要改头部网格，套模型会没脸）；新加变体前先在 `dev/common/cast.html` 里看一眼。
- 模型要在章节 `setup` 前预加载：`main.js` 按 `rlpm.js` 的 `CHAPTER_MODELS[章节 id]` 先 `preloadModels`；新增用到模型的章节要往表里加。加载失败自动回退程序化模型（控制台一条警告），不会白屏。
- 限制：手是网格的一部分，`setHand` 只记录不换形状；脸没有表情 / 眨眼 / 说话贴花（`rig.face` 是占位对象）；网格人物的头（含头发、帽子）单独一块，`headTags` / `showTag('head')` 照旧能整块隐藏（换动物头）；射线点击走 SkinnedMesh 逐三角形，没有单独的碰撞代理。没有模型的角色（Caroline、第一灾回忆里戴野鸡面具的 Elizabeth / `elizabeth_pheasant`、Jakob 成年）继续程序化；瘟疫医生（`doctor`）、黑影（`soul`）、第十灾鹰室的 Elizabeth（`elizabeth_owl`）是 2026-11-03 加的网格模型。
- 小红书 / 口袋方舟打包（`dev/minitool/build.py`）还没处理模型文件：esbuild 打成单个 iife 后 `import.meta.url` 不可用，加载器会回退到程序化模型，所以现有打包流程不会出错，但包里仍是旧造型；要带上新模型需要给 build.py 加资源拷贝和预加载路径（体积见 `upload/README.md`，网格人物每章约 3–6 MB）。

## 233 乐园版：提示按钮（2026-10-25 起）

- 右上角灯泡按钮只在 233 乐园版显示：`index.html` 里写 `window.__RLP_233 = true`，或开发时 URL 加 `?leyuan=1`（`src/core/leyuan.js`）；网页版、小红书包、口袋方舟包都不显示。点灯泡 → 确认“观看一段广告” → 激励视频广告（`src/core/rewardad.js`，官方封装的 JS 版，参考副本在 `dev/common/leyuan-ref/`）→ 只有广告回调 `status === 4` 才显示一条提示；广告可以一直看，看一次显示一条。流程在 `src/core/hintflow.js`。
- 提示内容：每章 `src/chapters/plagueN/hints.js` 导出 `HINTS`（`id / after 前置 / done(s) / text`，纯数据，只读 `s.flag()` 和 `s.has()`），章节对象的 `hints` 字段指向它；`src/core/hints.js` 的 `nextHint` 只取“没做完且前置都做完”的第一条，通关后不放广告。文案只说去哪、做什么，不给谜题答案。新增 / 改章节谜题时同步改 `hints.js`，物品用掉会从物品栏消失，“做完没有”要用旗标判断。
- 广告模拟：没有 `window.MetaH5Ad` 且（本机 localhost / 127.0.0.1，或乐园预览注入 `__PM_BUILD_PROFILE__ === 'fast'`）时用模拟广告（弹窗里选完整观看 / 中途关闭 / 跳过 / 失败）；真机乐园和线上发布永不模拟。`window.alert / confirm / prompt` 不能用，用 `ui.dialog()`。
- 验收：`node --test dev/common/test_hints.mjs`（引擎、广告回调、每章表的结构和旗标）、`python dev/common/test_hints_browser.py`（五章逐步自动通关，每一步都有提示、通关后全部完成，以及灯泡流程）。设计与记录见 `docs/ai/context/20261025-133000-leyuan-hint-design.md`。233 乐园的专用打包还没做（要注入 `__RLP_233` 和 `metah5ad_v1.min.js`，线上路径里不能出现 `/vendor/`）。
