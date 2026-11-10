# 第三灾 · 蚊灾和虱灾 —— 章节逻辑设计（实现契约）

> 本文是给**实现章节逻辑的 AI** 的设计契约：流程、谜题规则、旗标、视图、热点、物品、成就、文案、摆放坐标、自动通关步骤、测试要求。
> 美术模块接口（道具 / 人物的 id、方法、子物体名）见 `docs/plague3_api.md`；交接说明和工作边界见 `docs/plague3_handoff.md`。
> 依据：参考视频 `dev/common/ref/P03_第三灾-蚊子灾_BV1bo4y1y7fm.mp4`（863.9 秒，逐帧核对）、AppUnwrapper 第三灾攻略与成就攻略。
> 时间点 mm:ss 都指参考视频。原作标题是“第三灾 / 蚊灾和虱灾”（菜单 `CHAPTERS` 现在写的“虱灾 / Lice”要改，见 §10）。

## 0. 总体

- 地图沿用天堂岛（`src/art/layout.js`），写法照第二灾 `src/chapters/plague2/world.js`：湖水干净（`setBlood(0)`、`setPool(false)`），
  删掉第一灾道具的碰撞（`removePlague1Colliders`），天堂门摆上后隐藏门板（开着），小屋门摆上后隐藏门板 / 锁 / 门闩（开着），不注册这两个门禁。
- 室外开放视图自由漫游；人物和谜题用 closeup 特写。石屋室内复用 `house_int`（可走动）；神殿复用 `temple_int`。
- **新增独立区域 `p3_grove`（白桦林，原点 `[600, 0, 0]`）**：森林里的红叉树砍倒后，从缺口进去；里面可走动（`roam: true` + `defineRoamArea`）。
- 一页只装一章；状态只用 flags + inventory；`sync()` 只调用各道具 / 人物的 `setState`，必须支持新游戏、读档、重复调用（双向）。
- 第三灾不依赖其它章节进度。开局全岛可走（天堂门、小屋门都开着），只有白桦林要先砍倒红叉树。

## 1. 地点与摆放（世界坐标，单位米；+x 东、+z 南，模型正面朝 +z）

坐标是建议值，摆好后必须截图核对构图、用 `views.canStand` 核对碰撞，冲突时就近微调并在记录里写明。

| 地点 | 内容（参考） | 建议位置 |
|---|---|---|
| 海滩（天堂门 `P.gate` (0,0.5,40) 前） | 左石 ⊙ + 斜靠的苍蝇拍；右石 ⊕ + 贴着的贻贝；两石之间沙地上的 X（00:10、00:18、00:24、07:16） | 左石 `p3_symbol_rock{dot}` (−3.3, 地面, 44.4) rotY 0.25；右石 `{cross}` (3.4, 地面, 44.6) rotY −0.25；`p3_dig_x` (0.1, 地面, 44.5)；苍蝇拍挂在左石 `swatter_spot`，`p3_mussel_shell` 挂在右石 `mussel_spot` |
| 白树空地 G | 两棵白树之间的捕蝇草；左边深色树上的红叉（00:38–00:46） | `p3_flytrap` (5.0, 地面, 16.4) rotY 0；`p3_x_tree` 立在 G 北侧那排树干的缺口 (−2.9, 地面, 9.4) 面朝 +z；`p3_grove_portal` 在它身后 (−2.9, 地面, 7.6)（先查 `world.colliders.circles` 找没有随机树干的空位） |
| 水泵空地 P（水泵不摆） | 土堆（00:48–00:52）；灰白大树上的蜂巢（00:56） | `p3_clay_mound` (19.4, 地面, 4.6)；`p3_beehive` 挂在 `P.pumpTree` (12, 0.5, 1) 的枝杈上，约 (12.9, 3.3, 2.1)，按截图对齐枝条 |
| 石屋 H → `house_int` | 左：Ida 站在坐凳上的 Gerard 身后；中：放钟罩的小桌，桌边靠着铲子；右：陶轮，陶轮右边墙上两张花瓶草图（01:16、01:22） | 室内原点 [300,0,0]，后墙 z=−1.6：Gerard 凳子 `temple_stool` (298.6, 0, −0.9)、Gerard (298.6, 0, −0.9) 面朝 +z、Ida 在他身后（`IDA_BEHIND`）；`p3_jar_table` (300.0, 0, −1.25)，`p3_bell_jar` 放在 `jar_spot`；铲子 `p3_shovel` 斜靠在桌子右侧；`p3_pottery_wheel` (301.3, 0, −1.1)；`p3_vase_drawing` 贴后墙 (302.0, 1.0, −1.58) |
| 小屋门 → 灵魂小径 → 湖岸 | Margaret 坐在湖边凳子上，身后是湖和神殿；她右边一个木桩，斧子插在上面、蜗牛趴在侧面（01:52） | `margaret_gnats` (24.4, 地面, −30.6) rotY −0.35；`p3_stump` (25.9, 地面, −30.3)；两者加碰撞圆 |
| 神殿 `temple_int` | 吊架、圣水盆（画）、右边凳子上放着剪刀（02:12–02:16）；左窗台小盘（可选） | 复用第二灾神殿的摆法（`temple_int.holder` / `temple_int.font` 锚点）；`temple_stool` 放在 (401.9, 0, −1.45)，`p3_scissors` 平放在凳面；`p3_sill_plate` 放左窗台 |
| 白桦林 `p3_grove`（新 zone） | 前景白桦，中间圆桌 + 坐着的 David，桌前地上将来躺幼虫；右后方岩壁上的石拱神龛；右下浆果丛；左边可割汁的白桦和地上的陶罐（05:08） | `p3_grove_set` 放在 [600,0,0]，其余按它导出的 `GROVE_LAYOUT` 锚点摆：`p3_grove_table`、`david_table`、`p3_larva`（初始隐藏）、`p3_shrine`、`p3_berry_bush`、`p3_birch_tap` |

## 2. 视图

| id | 类型 | 说明 |
|---|---|---|
| `overview` | fixed | 开场远景，标题叠加；点岛 → `beach_mid` |
| `beach_mid` `forest_path` `forest_clearing` `pump_clearing` `house_clearing` `shed_clearing` `soul_path` `lake_shore` `temple_door` | 开放（exterior） | 同第一、二灾机位（照抄第二灾 world.js），`back/left/right/up` 写全供 autoplay BFS |
| `p3_rock_left` `p3_rock_right` `p3_dig` `p3_slider` | closeup | 左石（拿苍蝇拍）、右石（贻贝）、X / 坑、滑块盒（俯视，`look: 0`，pos 与 target 留一点水平偏移） |
| `p3_flytrap` `p3_x_tree` `p3_mound` `p3_hive` | closeup | 捕蝇草、红叉、土堆、蜂巢（`look: 0`） |
| `p3_margaret` `p3_stump` | closeup | 湖岸 Margaret、木桩 |
| `house_int` | roam（house_int） | 小屋，可走动（`defineRoamArea('house_int', …)`，墙内边界 + 家具碰撞） |
| `p3_barber` `p3_scalp` `p3_bell_jar` `p3_wheel` | closeup（house_int） | 剪头发中景、Gerard 头顶俯视、钟罩、陶轮 |
| `temple_int` | 固定（temple_int） | 神殿全景（同第二灾） |
| `holder` `painting` `p3_sill` | closeup（temple_int） | 吊架、画、窗台（可选） |
| `p3_grove` | roam（p3_grove） | 白桦林，可走动；`back` → `forest_clearing` |
| `p3_david` `p3_shrine` `p3_portrait` `p3_birch` `p3_berries` | closeup（p3_grove） | 圆桌（David / 幼虫）、神龛、画像特写、割汁白桦、浆果丛 |

- 新 zone：`const g = new THREE.Group(); ctx.world.root.add(g); ctx.views.registerZone('p3_grove', g)`，把 `p3_grove_set` 加进去（它自带灯光）。
  环境音：views.js 的 `zoneAmbience` 对未知 zone 返回 null（不切换），需要的话在 `zoneAmbience` 里追加 `case 'p3_grove': return 'forest'`（共享文件小改）。
- 进入白桦林：G 空地上红叉树倒下后，缺口处的热点 `p3_grove_entry`（挂在 `p3_grove_portal` 上，`when: p3_xtree_felled`，`goto: 'p3_grove'`）。
  不要用漫游门禁硬挡：白桦林是独立 zone，入口只有这个热点。

## 3. 物品

物品模型全在 `src/art/props_p3_items.js`（已完成），名字用它导出的 `ITEM_SPECS`。

| id | 中文 | 来源 | 去处 |
|---|---|---|---|
| `p3_swatter` | 苍蝇拍 | 海滩左石 | 给湖岸 Margaret（消耗） |
| `p3_gnats` | 蚊子 | Margaret 拍死后 | 喂捕蝇草 |
| `p3_snail` | 蜗牛 | 湖岸木桩 | 喂捕蝇草 |
| `p3_axe` | 斧子 | 湖岸木桩 | 砍红叉树、割白桦汁、砍木桩（成就）；不消耗 |
| `p3_shovel` | 铲子 | 小屋桌边 | 挖土堆、挖 X、撬贻贝；不消耗 |
| `p3_scissors` | 剪刀 | 神殿凳子 | 给 Ida（消耗，之后一直在她手里） |
| `p3_honey` | 蜂蜜 | 蜂巢谜题 | 抹在 David 的面包上 |
| `p3_ear` | 耳朵 | Gerard 被剪下的耳朵 | 喂捕蝇草 |
| `p3_mussel` | 贻贝 | 用铲子撬开右石上的贻贝 | 喂捕蝇草 |
| `p3_berries` | 浆果 | 白桦林浆果丛 | 放进 David 的碗 |
| `p3_sap` | 桦树汁 | 用斧子割白桦，罐子接满 | 倒进 David 的杯子 |
| `p3_bulb` | 球茎 | ① 滑块盒里 ② 幼虫吐出来（共两个，同一个 id，可同时持有两个） | 种进钟罩 |
| `p3_clay` | 黏土 | 土堆挖出两团（同一个 id） | 放上陶轮 |
| `p3_flower_yellow` | 花 | 捕蝇草吃饱后开花 | 插进神龛左边原有的长颈瓶 |
| `p3_flower_orange` | 花 | 钟罩第一次长出的花 | 插进神龛上的陶瓶 |
| `p3_rose` | 花 | 钟罩第二次长出的花 | 插进神龛上的陶瓶 |
| `p3_vase_slim` / `p3_vase_urn` | 花瓶 | 陶轮做出来（两种器形各一只） | 放到神龛中、右两根柱子上 |
| `black_cube` | 黑方块 | 回忆结束后神龛里 | 神殿吊架 |

- 物品栏最多 12 格。按原作顺序玩最多同时持有约 7 件；极端囤积路线可能到 12 件，**每次 give 前确认容量**，满了就提示“拿不下了”并保持场景状态不变（不写“已取”旗标）。
- 物品升级 / 消耗照第一、二灾写法：`ctx.take` / `ctx.give(id, { from })`；拿成功后才写旗标。

## 4. 谜题与流程（按区域；建议的主线顺序见 §8）

### 4.1 海滩
1. **苍蝇拍**：点左石 → 特写 `p3_rock_left`；点苍蝇拍 → 得到 `p3_swatter`（`p3_swatter_taken`）。石头上的红漆 ⊙ 只是线索。
2. **贻贝**：点右石 → 特写 `p3_rock_right`。空手点贻贝无反应（可 `say` 一句“粘得很牢”）；选中**铲子**点贻贝 → `open()`（`p3_mussel_open`）；
   再点贝肉 → `take()` + 得到 `p3_mussel`（`p3_mussel_taken`）。（08:52–08:56）
3. **X 与滑块盒**：点两石之间的 X → 特写 `p3_dig`；选中**铲子**点 X → `dig()`，坑边出现滑块盒（`p3_x_dug`）；点盒子 → 特写 `p3_slider`。
   - **滑块规则**（已逐帧核对 07:24–08:40）：26 格（第 0–2 行各 7 格，第 3 行列 1–5），25 块方块 + 1 个空格；点一块与空格**上下左右相邻**的方块，它滑进空格；
     不相邻的点击无效。3 块“圆片块”起始在 2、10、20，空格在 25；盒底眼睛在 12、14、22。**三块圆片块都停在眼睛格上 = 解开**（不要求空格位置）。
   - 解开 → `solve()`（`p3_slider_solved`）→ 点门闩或盒盖 → `open()`（`p3_box_open`）→ 点球茎 → 得到 `p3_bulb`（`p3_box_bulb_taken`）。
   - 盘面存档：`p3_slider_discs`（字符串，如 `"2,10,20"`）、`p3_slider_empty`（数字）。每滑一步写一次。
   - 参考最短解（点哪一格的方块，23 步）：`19 20 13 12 19 18 17 10 9 2 1 8 9 16 17 23 22 16 15 8 7 14 15`（自动通关用；玩家不提供自动解按钮）。
   - 每格一个热点 `p3_cell_<i>`（挂在 `slider_cell_<i>` 上），`when`：该格与空格相邻且盒子未解开。

### 4.2 白树空地 G：捕蝇草与红叉树
1. **捕蝇草**：点它 → 特写 `p3_flytrap`。选中 `p3_gnats` / `p3_snail` / `p3_mussel` / `p3_ear` 任一点它 → 消耗该物品，`feed(物品模型)`，`p3_trap_fed` +1（0..4）。
   顺序不限。喂满 4 个 → `bloom()`（`p3_flower_bloomed`，暖光）→ 点花 → 得到 `p3_flower_yellow`（`p3_flower_taken`）。其它物品点它 → 默认 wrong。（03:30–03:36、09:02–09:16）
2. **红叉树**：点树 → 特写 `p3_x_tree`；选中**斧子**点红叉 → `chop()`，`p3_xtree_cuts` +1；第 3 下 → `fell()`（`p3_xtree_felled`），缺口里露出白桦林。（04:56–05:06）

### 4.3 水泵空地 P：土堆与蜂巢
1. **土堆**：点 → 特写 `p3_mound`；选中**铲子**点 → `dig()`（`p3_mound_dug`），坑里两团黏土；点一团 → 得到 `p3_clay`，`p3_clay_taken` +1（0..2）。（09:56–10:02、12:16–12:20）
2. **蜂巢**（00:58–03:26）：点 → 特写 `p3_hive`。
   - **规则（按攻略重建）**：7 个蜂孔 + 一条固定链 `HIVE_ORDER = [4, 1, 5, 0, 6, 2, 3]`（孔号见 `HIVE_HOLES`）。`p3_hive_step` = 已飞出的蜜蜂数（0..7）。
     - `step = 0` 时点**任意**孔 → 第 1 只蜜蜂从 `HIVE_ORDER[0]` 号孔爬出（`flashHole` + `releaseBee`），step = 1。
     - `step = k (1..6)` 时，玩家必须点**刚才那只蜜蜂飞出来的孔** `HIVE_ORDER[k-1]` → 下一只从 `HIVE_ORDER[k]` 飞出，step = k+1。
     - 点错孔 → 所有蜜蜂飞回蜂巢（`recallBees()`），step = 0。
     - 第 7 只飞出后（step = 7）→ 自动 `drip()`，出蜜孔流下蜂蜜（`p3_honey_ready`）；点蜂蜜 → 得到 `p3_honey`（`p3_honey_taken`）。
   - 原作出蜂的具体顺序从录屏无法精确确认，`HIVE_ORDER` 是本项目定的固定顺序，写在 `puzzles.js`，不要宣称和原作逐孔一致。
   - 每孔一个热点 `p3_hive_hole_<i>`；蜂蜜热点 `p3_hive_honey`（`when: p3_honey_ready && !p3_honey_taken`）。
   - 退出特写再进来：已飞出的蜜蜂按 step 恢复（`setState({ bees: HIVE_ORDER.slice(0, step) })`）。

### 4.4 小屋（`house_int`）
1. **铲子**：桌边的铲子 → 得到 `p3_shovel`（`p3_shovel_taken`）。
2. **Ida 和 Gerard**：点他们 → 特写 `p3_barber`。第一次点 Ida：她说“我们不想看到虱子.”（`p3_ida_talked`）。
3. **剪头发**：选中**剪刀**点 Ida（或 Gerard）→ 剪刀用掉，Ida 举起剪刀（`holdScissors(true)`，`p3_scissors_given`）。
   之后每点一次 Gerard 的头发（热点 `p3_gerard_hair`）→ Ida `snip()` + Gerard `snipHair()` + `setHair(stage+1)`，`p3_hair` 0→3（03:56–04:08）。
   `p3_hair = 3` 后再点一次 → Ida `cutEar()` + Gerard `cutEar()`（`p3_ear_cut`）：耳朵掉在他脚边（摆一个 `p3_ear` 道具）；点耳朵 → 得到 `p3_ear`（`p3_ear_taken`）+ 成就 `earcut`。（04:10–04:16）
   - 寸头之后（`p3_hair = 3`）点他头顶 → 特写 `p3_scalp`（俯视头顶，`showScalpMap(true)`）：⊙ — ↓ — ⊕，即“在两块符号石中间往下挖”。（04:20）
   - 原作里这一步是线索；X 在沙地上一直可见，挖 X **不依赖**看过头皮（不要做知识门禁）。
4. **钟罩培育**（10:12–10:28）：点钟罩 → 特写 `p3_bell_jar`。
   - 点钟罩：`setDome(up/down)` 切换（`p3_jar_dome_up`）。
   - 钟罩升起且盆空时，选中**球茎**点花盆 → 消耗一个球茎，`plant()`（`p3_jar_plant = 'sprout'`），种的是第几个球茎决定花：第 1 个 → `orange`，第 2 个 → `rose`（`p3_jar_kind`、`p3_bulbs_planted`）。
   - 有芽时落下钟罩 → 自动 `grow(kind)`（暖光延时摄影，`p3_jar_plant = 'flower'`）。
   - 升起钟罩后点花 → `harvest()`，得到 `p3_flower_orange` / `p3_rose`（`p3_flower_orange_taken` / `p3_rose_taken`），盆空，可以种下一个。
5. **陶轮**（11:24–11:56、12:24–12:38）：点陶轮 → 特写 `p3_wheel`。
   - 选中**黏土**点轮盘 → 消耗一团，`setClay(true)`，造型 `POT.start = [0,0,0]`（`p3_wheel_clay`、`p3_wheel_shape = "0,0,0"`）。
   - 点陶坯的下 / 中 / 上段（`p3_pot_seg_0..2`）→ 这一段换成下一种变体（4 种循环），`poke(seg)` + `setShape(shape)`。
   - 每次改形后判断：造型等于 `POT.targets.slim` 且还没做过细颈瓶 → `finish()`，得到 `p3_vase_slim`（`p3_vase_slim_made`）；
     等于 `POT.targets.urn` 且还没做过罐 → 得到 `p3_vase_urn`（`p3_vase_urn_made`）。已经做过的那种器形不触发。
   - 目标（墙上草图）：`slim = [2,2,3]`（小圈足、鼓肩、细颈喇叭口），`urn = [3,3,1]`（宽底、圆肚、短宽口）。从泥团出发：细颈瓶 = 下×2、中×2、上×3；罐 = 下×3、中×3、上×1。

### 4.5 湖岸
1. **Margaret**：点 → 特写 `p3_margaret`（脸上爬满蚊子，01:54）。选中**苍蝇拍**点她 → 拍子用掉，`takeSwatter()` + `swat()`（`p3_margaret_swatted`）；
   她腿上（或手边）出现一撮死蚊子（摆一个 `p3_gnats` 道具），点它 → 得到 `p3_gnats`（`p3_gnats_taken`）。之后她一直拿着拍子。（01:56–02:06）
2. **木桩**：点 → 特写 `p3_stump`；点蜗牛 → `p3_snail`（`p3_snail_taken`）；点斧子 → `p3_axe`（`p3_axe_taken`）。
   - 成就（可选）：拿到斧子后，选中斧子点木桩 → `hit()`，`p3_stump_hits` +1；第 3、6、8 下 `setCrack(1/2/3)`，裂开后点里面的符号 → 成就 `the_third_symbol`。

### 4.6 神殿
1. **剪刀**：凳子上的剪刀 → `p3_scissors`（`p3_scissors_taken`）。（02:12–02:16）
2. **Harvey（可选成就）**：选中任一种花点窗台小盘 → 花放在盘里（`p3_sill_flower`，记花的 id）；离开神殿再进来 → 鹦鹉出现在盘边；点它 → 成就 `harvey`（`p3_harvey_seen`）。
   点盘子可把花拿回来（不能让成就路线吞掉主线物品）。
3. **结尾**：同第二灾：点吊架 → 特写 `holder` → 点它拉开（`p3_holder_open`）；选中**黑方块**点吊架 → 自动演出：
   方块放进 → 合拢 → 自动回到神殿全景 → 金盒沿绳降进圣水盆 → 盆口光束 → 自动拉近到画（`painting`）→ `glowCube()` → `banishWoman()` → `frameFly()` → `plague3_complete` → `ui.ending({ zh: '第三灾 · 完', en: 'Plague III — complete' })`。（13:56–14:22）
   - 画用 `makeProp('plague_painting', { insects: true })`；setup 后 `setState({ lit: false, purified: true, frogsGone: true, womanGone: false, flyFramed: false })`（第三灾开局：溪流已净化、青蛙已消失）。
   - 旗标：`p3_cube_inserted`、`p3_holder_lowered`、`p3_painting_lit`、`p3_woman_banished`、`p3_fly_framed`、`plague3_complete`。sync 用 `painting.setState` 恢复；吊架下降按差值恢复（参考第二灾 temple.js 的做法，不要累加）。

### 4.7 白桦林（`p3_grove`）
1. **浆果**：点浆果丛 → 特写 `p3_berries` → 点浆果 → `pick()` + `p3_berries`（`p3_berries_taken`）。（05:10–05:12）
2. **桦树汁**：点左边那棵白桦 → 特写 `p3_birch`；选中**斧子**点树干 → `tap()` + `fill()`（`p3_birch_tapped`）；点罐子 → `takeJug()` + `p3_sap`（`p3_sap_taken`）。（05:34–05:38）
   - 可选成就：拿走树汁后 `showCocoon(true)`（`p3_cocoon = 'hanging'`）；之后点茧 → `hatch()`，蝴蝶飞走 → 成就 `the_butterfly`（`p3_cocoon = 'hatched'`）。
3. **David**：点圆桌 → 特写 `p3_david`。点 David → 他说“我今天血糖非常低.”（`p3_david_talked`）。
   - 选中浆果点碗、树汁点杯子、蜂蜜点面包（顺序不限，各自消耗）：`setBerries` / `setSap` / `setHoney`（`p3_table_berries` / `p3_table_sap` / `p3_table_honey`）。
   - 三样都放好 → 自动演出（06:04–06:14）：蚊群从四周聚来盖住他（`coverWithGnats()`）→ 他倒下消失（`vanish()`）→ 桌前地上出现一整条被蚊子盖住的黑团（`p3_larva` 显示，`setGnats(1)`）（`p3_david_covered`）。
   - 点黑团 → 蚊子飞散（`clearGnats()`，`p3_larva_cleared`），露出巨大的幼虫。（06:18–06:24）
   - 点幼虫的嘴 → `spit()`，吐出一个球茎落在地上（`p3_larva_spat`）+ 成就 `spitting_larva`；点球茎 → `p3_bulb`（`p3_larva_bulb_taken`）。（06:32–06:34）
   - 原作“Spitting Larva”成就的触发方式是“蚊子还没盖满时退出再点他”，3D 里改成“幼虫吐出球茎时”给成就（在记录里注明）。
4. **神龛**（05:14、09:28–09:34、12:52–13:18）：点神龛 → 特写 `p3_shrine`。
   - 左柱原有长颈瓶。选中黄色花点左瓶 → `setFlower(0, 'yellow')`（`p3_shrine_flower_0 = 'yellow'`）。
   - 选中 `p3_vase_slim` / `p3_vase_urn` 点中 / 右柱顶 → `setVase(slot, kind)`（`p3_shrine_vase_1` / `_2`，任意顺序、任意柱）。
   - 选中 `p3_flower_orange` / `p3_rose` 点已放的陶瓶 → `setFlower(slot, kind)`（`p3_shrine_flower_1` / `_2`，任意组合；原作是中玫瑰、右橙花，不强制）。
   - 只允许黄色花插左瓶、橙花 / 玫瑰插陶瓶（其它组合 wrong），三只瓶都有花 → 自动演出：`gnatsToPortrait()`，蚊群飞向画像吃掉她的眼睛（`setPortrait('eyes')`，`p3_portrait_eyes`）。（12:58–13:12）
   - 点画像 → 特写 `p3_portrait`（13:12）；再点画像 → **回忆**（13:16–13:38）：
     画像消失 → 原处画出小黑方框（`drawFrame`），岩壁上画出一个大黑框（复用 `memory_frame`，w ≈ 3.6、h ≈ 2.2）→
     一家人半透明淡入站成一排（`gerard_young`、`margaret_baby`、`ida_child`、`jakob_child`、`caroline_rose`、`nicholas_stand`，按 `cast_p3_memory` 给的队形）→
     停约 3 秒 → Caroline `dropPetals()`（玫瑰花瓣散落）→ 一家人淡出 → 大黑框擦掉 → 小方框里浮现黑方块（`showCube(true)`）（`p3_memory_seen`）。
   - 点黑方块 → `takeCube()` + `black_cube`（`p3_cube_taken`）。（13:38–13:40）

## 5. 旗标总表（全部 p3_ 前缀，另有 `intro_done`、`plague3_complete`）

| 区域 | 旗标（类型） |
|---|---|
| 海滩 | `p3_swatter_taken` `p3_mussel_open` `p3_mussel_taken` `p3_x_dug` `p3_slider_discs`(str) `p3_slider_empty`(num) `p3_slider_solved` `p3_box_open` `p3_box_bulb_taken` |
| G 空地 | `p3_trap_fed`(0..4) `p3_flower_bloomed` `p3_flower_taken` `p3_xtree_cuts`(0..3) `p3_xtree_felled` |
| P 空地 | `p3_mound_dug` `p3_clay_taken`(0..2) `p3_hive_step`(0..7) `p3_honey_ready` `p3_honey_taken` |
| 小屋 | `p3_shovel_taken` `p3_ida_talked` `p3_scissors_given` `p3_hair`(0..3) `p3_ear_cut` `p3_ear_taken` `p3_jar_dome_up` `p3_jar_plant`('none'/'sprout'/'flower') `p3_jar_kind`('orange'/'rose') `p3_bulbs_planted`(0..2) `p3_flower_orange_taken` `p3_rose_taken` `p3_wheel_clay` `p3_wheel_shape`(str "b,m,t") `p3_vase_slim_made` `p3_vase_urn_made` |
| 湖岸 | `p3_margaret_swatted` `p3_gnats_taken` `p3_snail_taken` `p3_axe_taken` `p3_stump_hits`(num) |
| 神殿 | `p3_scissors_taken` `p3_sill_flower`(物品 id / null) `p3_harvey_seen` `p3_holder_open` `p3_cube_inserted` `p3_holder_lowered` `p3_painting_lit` `p3_woman_banished` `p3_fly_framed` |
| 白桦林 | `p3_berries_taken` `p3_birch_tapped` `p3_sap_taken` `p3_cocoon`('none'/'hanging'/'hatched') `p3_david_talked` `p3_table_berries` `p3_table_sap` `p3_table_honey` `p3_david_covered` `p3_larva_cleared` `p3_larva_spat` `p3_larva_bulb_taken` `p3_shrine_vase_1` `p3_shrine_vase_2`('slim'/'urn'/null) `p3_shrine_flower_0..2`('yellow'/'orange'/'rose'/null) `p3_portrait_eyes` `p3_memory_seen` `p3_cube_taken` |

`sync()` 规则：每个道具 / 人物都用一次 `setState(由旗标推出的完整状态)`，例如
`hive.setState({ bees: HIVE_ORDER.slice(0, step), honey: taken ? 'taken' : ready ? 'drip' : 'none' })`、
`gerard.setState({ hair, scalpMap: hair >= 3, ear: !earCut })`、`painting.setState({...})`。不要在 sync 里播放动画或累加位移。

## 6. 成就（`src/chapters/plague3/text.js` 的 ACHIEVEMENTS，id 全局唯一）

| id | 中文 | 英文 | 条件 |
|---|---|---|---|
| `spitting_larva` | 吐东西的幼虫 | Spitting Larva | 幼虫吐出球茎（§4.7） |
| `earcut` | 割耳 | Earcut | 拿到 Gerard 的耳朵 |
| `the_butterfly` | 蝴蝶 | The Butterfly | 白桦上的茧孵出蝴蝶 |
| `harvey` | 哈维 | Harvey | 神殿窗台的鹦鹉 |
| `the_third_symbol` | 第三个符号 | The Third Symbol | 斧子把湖岸木桩砍裂，点里面的符号 |

粉笔图标可选追加到 `src/core/ui.js` 的 `CHALK_ICONS`（共享文件，只追加）。

## 7. 屏幕文字（原作中文本地化，`text.js` 只放纯数据）

- 章节标题：`第三灾` / `蚊灾和虱灾`（英文 `Plague III` / `Gnats & Lice`）。
- Ida：`我们不想看到虱子.`；David：`我今天血糖非常低.`
- 物品名见 §3（`ITEM_SPECS`）。结尾：`第三灾 · 完` / `Plague III — complete`。
- 提示文字（鼠标 / 触屏两套，`hintOnce`）自拟，例：滑块“点和空格相邻的方块”、陶轮“点陶坯的上、中、下段改变形状”、蜂巢“看清蜜蜂从哪个洞飞出来”。

## 8. 主线顺序（autoplay 用；只走公开热点，不直接设旗标）

1. `overview` → 海滩：左石拿苍蝇拍。
2. 森林 → 小屋拿铲子 → 湖岸：苍蝇拍给 Margaret、拿蚊子、拿蜗牛和斧子 → 神殿拿剪刀。
3. P 空地：蜂巢（任意孔 + `HIVE_ORDER[0..5]`）拿蜂蜜；土堆用铲子、拿两团黏土。
4. G 空地：捕蝇草喂蚊子、蜗牛。
5. 小屋：剪刀给 Ida，点头发 3 次 + 1 次剪耳，拿耳朵；看头皮；陶轮做两只花瓶（用 §4.4 的点击次数）。
6. 海滩：铲子撬贻贝拿贻贝；铲子挖 X；滑块按参考解 23 步；开盒拿球茎。
7. G 空地：捕蝇草喂贻贝、耳朵 → 开花拿黄色花；斧子砍红叉树 3 下 → 进白桦林。
8. 白桦林：拿浆果；斧子割树汁拿罐子；David：浆果、树汁、蜂蜜 → 点黑团 → 点嘴 → 拿球茎；神龛插黄色花、放两只陶瓶。
9. 小屋：钟罩种两个球茎、收橙花和玫瑰。
10. 白桦林：两只陶瓶插花 → 点画像两次（回忆）→ 拿黑方块。
11. 神殿：拉开吊架、放黑方块 → 结尾 → `expectFlag: plague3_complete`。

## 9. 规则代码与测试（实现方负责）

- 纯规则放 `src/chapters/plague3/puzzles.js`（不依赖 Three.js）：滑块（相邻判断、滑动、解开判断、BFS 求解仅供开发 walkthrough）、
  蜂巢（`HIVE_ORDER`、点击结果：next / wrong / done）、陶轮（循环、匹配 `POT.targets`，从 `props_p3_shared.js` 读数据）、捕蝇草计数、神龛摆放合法性。
- `node --test dev/plague3/test_plague3.mjs`：规则单测（含：滑块不相邻点击无效、参考解能解开、中途盘面可解、蜂巢点错复位、陶轮两种目标、重复器形不再触发）。
- `python dev/plague3/test_plague3_browser.py`：完整 `RLP.autoplay()`、真实鼠标 + 数字键、触屏（844×390 横屏模拟）、中途存档 / 读档 / 新游戏双向恢复、
  白桦林入口门禁（树没倒不能进）、小屋与白桦林漫游碰撞、特写返回恢复原位。截图前等待章节启动、交互空闲和画布 CSS 动画结束。
- 每次章节修改后至少跑一次 `RLP.autoplay()`（AGENTS.md）；回归第一灾 91/91、第二灾、第四灾（本轮改了 `props.js`、`characters.js`、`plague_painting`）。
- 从无参数首页验证菜单能进第三灾、`RLP.bootError` 为空。

## 10. 接入入口

- `src/chapters/index.js` 第三灾那一条：`title: { zh: '蚊灾和虱灾', en: 'Gnats & Lice' }`，`load: () => import('./plague3/index.js')`，开发期间加 `wip: true`。
- 章节对象形状照 `plague2/index.js`：`{ id: 'plague3', number: 3, title, label, completeFlag: 'plague3_complete', setup, start, sync, walkthrough }`；
  `start` 结束时必须 `ctx.go(...)` 到某个视图并设 `intro_done`。
