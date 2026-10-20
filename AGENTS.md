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
- 小红书小工具只开放第一灾和第二灾：`build.py` 在打包副本里把第四、五灾的 `load` 置空，网页版源码不动。启动期不能出现几秒不让出主线程的同步任务（评论反馈过“白屏和载入页快速交替闪”，推测是慢手机上启动被容器判为无响应而反复重载）：大块同步建模在 `build.py` 补丁里按子步骤 `await __stage()` 让出一帧，第一次渲染由 `rotate.js` 的 `__RLP_WARM` 分片预热着色器；新加补丁后先确认页面能启动（`RLP.bootError` 为空）再看耗时数字。启动被反复重载时 `rotate.js` 会自动进轻量模式（`window.__RLP_LITE`：关阴影、像素比 1、关水面倒影），只用同步的 `localStorage`，不要在启动路径上等任何外部东西。`build.py --no-minify` 只用于采样排查，不能上传。记录见 `docs/ai/context/20261019-094500-xhs-minitool-ch12-flicker-fix.md`。
- 口袋方舟 H5 上传时，ZIP 的 `index.html` 放在根目录，发布地区不选 GPark；资料中如实标注《Rusty Lake Paradise》同人重制及原作来源，不宣称已获授权。

## 第四灾与参考资料

- 第三至第十灾的既定参考视频位于 `dev/common/ref/P03_*.mp4` 至 `dev/common/ref/P10_*.mp4`，源视频为 B 站 `BV1bo4y1y7fm`；定位和完整性记录见 `docs/ai/context/20261008-201654-bilibili-reference-videos.md`。视频与抽帧只作本地参考，不提交、不部署。
- 第四灾逻辑集中在 `src/chapters/plague4/`，专属程序化模型在 `src/art/props_flies.js`；不依赖第二、三灾进度。天堂门和木小屋开局开放，绿色宝石解锁神殿入口，以免湖边寄居蟹与宝石形成循环前置。
- 第四灾寄居蟹保留三轮真实导向模拟，用“点贝壳、点空格、点寄居蟹出发”统一鼠标和触屏；轮次、摆放与选中状态保存到 `p4_crab_*` flags。规则和窗锁校验在 `puzzles.js`，场景同步必须支持新游戏和读档的双向恢复。
- 第四灾验收入口为 `node --test dev/plague4/test_plague4.mjs` 和 `python dev/plague4/test_plague4_browser.py`。真实点击采样前等待画布的 CSS 入场动画结束；游戏加速不会加速 CSS 过渡，不能把变化中的画布坐标当成稳定落点。

## 第五灾

- 第五灾逻辑集中在 `src/chapters/plague5/`，专属模型工厂位于 `src/art/props_p5.js` 并统一使用 `p5_` 前缀，入口暂保留 `wip: true`。第五灾独立于其它章节，参考为 `dev/common/ref/P05_第五灾-疫灾_BV1bo4y1y7fm.mp4`。
- 菜地为三轮可移动菜苗的行列占格数谜题，连线为五轮节点度数与全图连通谜题；纯规则在 `rules.js`，接受所有满足约束的解，不能把自动流程的解写成玩家唯一答案。
- 牛治好后才能取肉和挤奶；蔬菜切片、肉馅煎熟、汉堡逐层消耗食材。Gerard 吃完才开放厕所，林间连线解完才开放圆盘回忆，黑方块从回忆取得后才开放神殿，不能跳过汉堡主线。
- 斑点、菜地、连线、汉堡中途进度均保存到 flags；`sync()` 必须支持新游戏、旧档与重复调用。公共吊架下降是累加接口，恢复时按差值；不可逆的插入/点燃显示需要回退时，只重建本章对象并更新热点和帧注册。
- 第五灾验收入口为 `node --test dev/plague5/test_plague5.mjs` 和 `python dev/plague5/test_plague5_browser.py`，覆盖自动通关、真实鼠标/数字键、触屏、存档与漫游；首次可玩实现及验收见 `docs/ai/context/20261014-184500-plague5-implementation-verification.md`。

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
- 第三灾章节逻辑已实现（`src/chapters/plague3/`：`world.js` 布景与视图、`puzzles.js` 纯规则、`beach / forest / house / lake / temple / grove.js` 各区域），注册表里仍带 `wip: true`（菜单要 `?wip=1`）；去掉 `wip` 前要给 `dev/minitool/build.py` 加一条把第三灾 `load` 置空的补丁，否则小红书小工具会多出第三灾。验收入口：`node --test dev/plague3/test_plague3.mjs`、`python dev/plague3/test_plague3_browser.py`、`python dev/plague3/record_plague3_demo.py [--fast]`（真人输入走完全程并录像）、`python dev/plague3/shots_plague3.py`（逐视图截图）。写章节文件时注意 Windows 上 Python 文本模式写文件会把 LF 改成 CRLF，用 `newline=''` 或 Edit 工具。
