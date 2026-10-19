# 第三灾 · 蚊灾和虱灾 —— 美术模块接口契约

> 本文是第三灾**美术资产**（道具、物品、人物变体、白桦林布景）和**章节逻辑**之间的约定。
> 章节逻辑（流程、旗标、视图、热点、谜题规则、测试）见 `docs/plague3_design.md`，交接说明见 `docs/plague3_handoff.md`。
> 参考视频：`dev/ref/P03_第三灾-蚊子灾_BV1bo4y1y7fm.mp4`（1920×1080，863.9 秒），逐秒帧 `dev/ref/plague3/frames/f_NNNN.jpg`
> （f_NNNN = 第 NNNN 秒，960×540），拼图 `dev/ref/plague3/sheets/s_00..s_26.jpg`（4×4，每格隔 2 秒，左上角黄字时间）。
> 下文“参考 mm:ss”都指这个视频。原作游戏画面约占帧的 x 30–830，右侧是物品栏。

## 0. 通用约定（同第一、二灾）

- 1 单位 = 1 米；道具原点在地面（或挂点），正面朝 +z；**物品**原点在中心、长轴沿 +x、“图标面”朝 +z。
- 场景里摆的东西和物品栏图标用**同一个工厂**（`makeProp(id)`），所以图标 = 场景外观；小零件要做大、描边要清楚。
- 改变状态的方法都返回 Promise，最后一个参数可以是 `{ instant: true }`（直接到终态，幂等）。
- **每个有状态的道具都提供 `setState(state)`（瞬时、可往回设，支持新游戏 / 读档双向恢复）和 `getState()`。**
  章节的 `sync()` 只调用 `setState`，不连环调用动画方法。
- 动画只用 `src/core/tween.js` 的 `animate / wait`（跟随 `engine.timeScale`）；一个方法尽量只开一个 animate 任务（多段用 `seg(k, a, b)`）。
- 每帧更新挂 `obj.update(dt, t)`；章节用 `ctx.register('prop', id, obj)` 注册。
- 可点部件用透明点击盒（`props_p2_shared.js` 的 `hit()`：`material.visible = false` + `userData.proxy = true`），名字按本文写。
  点击盒不要放进物品模型（会撑大图标包围盒）。
- 颜色材质用 `toon()`（带描边）；贴图材质的基色用 `#ffffff`；缓存的共享材质运行时不能改颜色 / 透明度（要变就 clone 一份或换材质）。
- 静态网格合并，重复物体用 InstancedMesh；任一视图不超过约 400 draw call。注释用中文。
- 第三灾新道具 id 一律 `p3_` 前缀（`props.js` 合并时同名会静默覆盖）。

## 1. 文件与归属

| 文件 | 内容 |
|---|---|
| `src/art/props_p3_shared.js` | 公共工具：`group / tmat / umat / play / lumpGeo / contactShadow / decal / cached`、红漆符号贴图 `symbolTexture()`、头皮地图 `scalpMapTexture()`、蚊子 `mosquitoGeometry()`、**蚊群 `makeGnatSwarm()`**、**蚊子覆盖层 `makeGnatCover()`**（被蚊子盖住时一块块长出的黑色毛茸斑，`setCover(k)`）、`capsulePoints()`、**陶轮造型数据 `POT` / `potSegment / potProfile / potOpen / drawPotOutline`** |
| `src/art/props_p3_items.js` | 全部物品模型（§2） |
| `src/art/props_p3_beach.js` | 海滩、湖岸、神殿的场景道具（§3） |
| `src/art/props_p3_forest.js` | 森林的场景道具（§4） |
| `src/art/props_p3_house.js` | 小屋室内道具（§5） |
| `src/art/props_p3_grove.js` | 白桦林布景（独立 zone）与其中的道具（§6） |
| `src/art/cast_p3_hut.js` | 小屋里的 Gerard / Ida（§7.1） |
| `src/art/cast_p3_family.js` | 湖岸 Margaret、桌边 David（§7.2） |
| `src/art/cast_p3_memory.js` | 回忆里的一家人（§7.3） |
| `src/art/cast_p3.js` | 汇总，`characters.js` 已并入 `makeCharacter` |
| `src/art/props_lake.js` | 公共画作 `plague_painting` 追加第三灾结尾（§8） |
| `src/art/props_p3_placeholders.js` | 还没做好的道具 id 的占位（props.js 自动回退，正式工厂出现后不再使用） |

`props.js` 已注册五个 `props_p3_*` 模块；`dev/viewer.js` 默认会搜索它们（`?prop=<id>`，或 `&mod=props_p3_grove` 指定）；
人物用 `dev/viewer.html?char=<id>` 或 `dev/cast.html?ids=<id>`。

**可复用的现有模型**（能改就改，不重造）：`david_rock`（石头）、`portrait_caroline`（金框画像 + 铭牌 + 吊绳，props_inner）、
`side_table` / `temple_stool` / `memory_frame` / `chest`（第二灾）、`bowl`（props_frogs）、`jug`（props_inner）、
`winged_holder` / `font` / `plague_painting` / `black_cube`（props_lake）、`paradise_gate` / `shed_door`（门板可隐藏）、
人物身体 `manBody / womanBody / margaretBody / gerardBody / nicholasBody / davidBody`、Caroline 抱的婴儿（`buildCaroline` 内）。

## 2. 物品（`props_p3_items.js`）

物品 id 也是道具 id。中文名是物品栏显示的名字（原作中文本地化）。

| id | 中文 | 外观（参考） | 大小（约） |
|---|---|---|---|
| `p3_swatter` | 苍蝇拍 | 木柄 + 缠绳 + 白色羽毛 / 纤维扇面的拂子（00:18、00:20 图标） | 长 0.42 |
| `p3_gnats` | 蚊子 | 一小撮死蚊子（7–9 只黑色蚊子堆在一起，翅膀透明）（02:00 图标） | 0.07 |
| `p3_snail` | 蜗牛 | 赭黄螺旋壳 + 深色螺纹，灰蓝身体和触角（01:48） | 0.08 |
| `p3_axe` | 斧子 | 浅木长柄，锈红斧头 + 钢刃（01:48、01:50 图标） | 长 0.56 |
| `p3_shovel` | 铲子 | 直木柄，灰钢尖铲头（01:16 靠桌、01:18 图标） | 长 0.95 |
| `p3_scissors` | 剪刀 | 银色长刃剪刀，黑色圈柄（03:54） | 长 0.19 |
| `p3_honey` | 蜂蜜 | 金黄色蜂蜜团（带一小块蜂巢）（03:26 图标） | 0.09 |
| `p3_ear` | 耳朵 | 人耳（肉色，内有耳廓纹），切口带一点血（04:14 图标） | 0.07 |
| `p3_mussel` | 贻贝 | 张开的深紫褐贝壳 + 橙色贝肉（08:54–08:56） | 0.09 |
| `p3_berries` | 浆果 | 一串红色浆果 + 两片绿叶（05:12 图标） | 0.08 |
| `p3_sap` | 桦树汁 | 陶土小罐（带把手）装满浅黄树汁（05:38 图标）。`opts.fill = 0` 得到空罐（白桦林地上那只） | 0.11 |
| `p3_bulb` | 球茎 | 紫灰洋葱形球茎，深色竖纹，底部须根，顶上两片绿芽（06:34 图标） | 0.09 |
| `p3_clay` | 黏土 | 一团圆鼓的陶土（10:00 图标） | 0.12 |
| `p3_flower_yellow` | 花 | 捕蝇草开出的黄橙色花簇（茎 + 叶）（09:12–09:16） | 高 0.3 |
| `p3_flower_orange` | 花 | 钟罩里长出的橙红色花簇（10:20–10:22） | 高 0.32 |
| `p3_rose` | 花 | 红玫瑰（10:26），回忆里 Caroline 手里也是它 | 高 0.32 |
| `p3_vase_slim` | 花瓶 | 陶轮做的细颈花瓶（`POT.targets.slim` 的轮廓）（11:56） | 高 0.34 |
| `p3_vase_urn` | 花瓶 | 陶轮做的宽口罐（`POT.targets.urn`）（12:38） | 高 0.34 |
| `p3_vase_bottle` | — | 神龛左边原有的细长颈瓶（不是物品，只在场景用）（05:14） | 高 0.36 |
| `black_cube` | 黑方块 | 现有（props_lake） | — |

- 花和花瓶做成“立着”的物品：原点在底部中心，长轴沿 +y（图标会自动缩放，`items.define` 的 `icon.rot` 由章节调）。
- 花瓶的器形从 `potProfile(POT.targets.xxx)` 车削生成，**和陶轮上的造型、墙上的草图逐点一致**。

## 3. 海滩、湖岸、神殿（`props_p3_beach.js`）

### `p3_symbol_rock` — 天堂门前的两块石头（00:10、00:18、00:24、08:50）
```
makeProp('p3_symbol_rock', { symbol: 'dot' | 'cross' })
```
- 灰色圆鼓的大石头，约 0.8 宽 × 0.42 高 × 0.6 深；可直接用 `david_rock` 的做法缩放改形。
- 正面（+z，略朝上）用 `symbolTexture('dot' | 'cross')` 画红漆符号（带往下淌的漆痕）。左石 ⊙（圆圈里一个点），右石 ⊕（圆圈 + 十字准星）。
- 子物体：`rock_body`、`rock_symbol`；挂点 `swatter_spot`（左石：苍蝇拍斜靠的位置和朝向）、`mussel_spot`（右石：贻贝贴着的位置，右上方）；点击盒 `rock_hit`。

### `p3_mussel_shell` — 贴在右石上的贻贝（00:24 闭合、08:52 撬开、08:56 取走后）
- 深紫褐双壳，带同心生长纹，约 0.12 长；平时闭合紧贴石头。
- `open({instant})`：上壳绕铰链翻开约 70°，露出橙色贝肉（08:54）；`take({instant})`：贝肉消失，空壳留着（内侧深色）。
- `setState({ open, taken })`；子物体 `mussel_hit`、`mussel_meat`。

### `p3_dig_x` — 两石之间沙地上的 X（07:16–07:22、08:46）
- 两道交叉的浅沟（比沙地深一点的颜色），约 0.5 宽。
- `dig({instant})`：X 淡出，地上出现一个椭圆坑（深褐色内壁）和旁边一堆翻出的土（隆起），约 0.6 秒。
- `setState({ dug })`；挂点 `box_spot`（挖出的盒子放在坑边）；点击盒 `dig_hit`。

### `p3_slider_box` — 滑块盒（07:24 起始、08:36–08:40 解开、08:42 打开）
- 赭红色木盒（约 0.56 × 0.14 × 0.46），盒盖就是棋盘：26 格（第 0–2 行各 7 格，第 3 行只有第 1–5 列），卡其色方块 + 黑色格线；
  盘面下方是一条前挡板，中间一个圆形门闩（圆圈里一道竖线）。俯视特写从 +y 往下看，**第 0 行在远处（−z），第 3 行靠门闩（+z）**。
- 25 块方块填满除空格外的所有格子，其中 3 块是“圆片块”（浅灰方框里一个棕色圆片）；空格露出深褐色盒底。
- 盒底在 3 个目标格（12、14、22）画着眼睛：空格移到那里时能看见眼睛；圆片块停在目标格上时，圆片显示眼睛纹（同心圆 + 圆心点）。
- 导出常量：`SLIDER_CELLS`（下标 → [行, 列]）、`SLIDER_START = { discs: [2, 10, 20], empty: 25 }`、`SLIDER_EYES = [12, 14, 22]`。
  下标按行优先：第 0 行 0–6，第 1 行 7–13，第 2 行 14–20，第 3 行 21–25（列 1–5）。
- 方法：
  - `setBoard({ discs, empty })`：瞬时摆好整盘；`slide(from, to, {instant})`：把 `from` 格的方块滑进空格 `to`（相邻，约 0.18 秒）。
  - `solve({instant})`：圆片发暖光一闪，门闩转成横线；`open({instant})`：盒盖（棋盘）绕后边翻开，露出盒里的球茎（`p3_bulb`）；
    `takeBulb({instant})`。
  - `setState({ discs, empty, solved, open, bulbTaken })`；`cellWorld(i)` → 该格中心的世界坐标。
- 子物体：`slider_cell_0..25`（每格一个点击盒，贴在格子表面）、`slider_latch_hit`、`slider_bulb_hit`、`slider_box_hit`（整只盒子）。

### `p3_stump` — 湖岸 Margaret 身边的木桩（01:48、01:50、12:06）
- 立着的短原木（约 0.36 直径 × 0.55 高），棕色树皮 + 深色竖纹，右侧一个断枝；顶面年轮；斧子（`p3_axe`）斜插在顶上，左侧趴着一只蜗牛（`p3_snail`）。
- `takeAxe({instant})`、`takeSnail({instant})`；`hit({instant})`：被斧子砍一下（晃动 + 木屑）；
  `setCrack(n 0..3, {instant})`：裂纹逐级加深，第 3 级裂开，露出刻在里面的符号（“第三个符号”，图形待核对，先用可替换贴图）。
- `setState({ axe, snail, crack })`；子物体 `stump_hit`、`stump_axe_hit`、`stump_snail_hit`、`stump_symbol_hit`。

### `p3_sill_plate`、`p3_parrot` — 神殿窗台（可选成就“Harvey”）
- `p3_sill_plate`：窗台上的小白盘（02:12 左窗台）；`setFlowers(kind | null)` 盘里放花（任一种花物品）。
- `p3_parrot`：灰鹦鹉 Harvey（灰身、红尾、黑喙），蹲在盘边；`idle` 轻微歪头；`setVisible(on)`。

## 4. 森林（`props_p3_forest.js`）

### `p3_flytrap` — 捕蝇草（00:32 饿着、03:32 吃蚊子、03:34 吃完变绿、09:04–09:12 喂完开花、09:16 花被摘走）
- 约 0.8 高；底部一圈细长叶，四根弯茎各顶一个捕虫夹（外绿带深绿斑，内侧红色，夹缘一圈尖刺），中间一根直茎顶着披针形花苞。
- 夹子的状态：`hungry`（张开、内侧红）→ 喂食时合上嚼动 → `sated`（重新张开、内侧变浅绿）。
- `feed(prey = null, {instant})`：下一个饥饿的夹子（固定顺序 0→3）合上咬住 `prey`（传入的物品模型会被挂进夹子里再隐藏），嚼约 1.2 秒后张开变绿。
- `bloom({instant})`：花苞张开，长出 `p3_flower_yellow`（暖光一闪）；`takeFlower({instant})`。
- `setState({ fed: 0..4, bloomed, flowerTaken })`；子物体 `flytrap_hit`、`trap_0..3`、`flytrap_flower_hit`；`update()` 轻微摇摆。

### `p3_x_tree` — 画着红叉的大树（00:38、00:40、05:00、05:02）
- 和岛上森林树干同风格（粗、直、带竖条纹树皮），约 0.7 半径；正面离地 1.6–2.0 m 处一个红漆大 X（带淌痕）。
- `chop({instant})`：X 处砍出一个缺口（木屑），每次加深；`fell({instant})`：缺口以上的树干往后倒下并淡出，留一个矮树桩。
- `setState({ cuts: 0..3, felled })`；子物体 `x_tree_hit`、`x_mark`。章节在它身后摆 `p3_grove_portal`（§6），倒下后露出白桦林入口。

### `p3_clay_mound` — 土堆（00:48、00:52、09:58、10:00、12:18）
- 棕色松土堆，约 0.7 宽 × 0.25 高，带颗粒。
- `dig({instant})`：土堆变成一个坑 + 旁边翻出的土，坑里两团黏土（`p3_clay`）；`takeClay({instant})`：拿走一团。
- `setState({ dug, clay: 0..2 })`；子物体 `mound_hit`、`clay_0_hit`、`clay_1_hit`。

### `p3_beehive` — 树上的蜂巢（00:56、00:58、02:40–03:26）
- 挂在一根斜枝上的黄褐色蜂巢（约 0.5 宽 × 0.75 高），6 道叠起来的圆环 + 顶部圆顶，表面带浅色斑点；斜枝顶端一簇绿叶。
  原点是枝条顶端（挂点）。
- 7 个蜂孔（导出 `HIVE_HOLES`，按原作位置：左侧一列 + 顶部两个），右侧中部另有一个出蜜小孔。
- 蜜蜂（黄黑条纹、透明翅膀，约 0.035）：
  - `releaseBee(hole, {instant})`：一只蜜蜂从该孔爬出、飞到蜂巢前方盘旋；`recallBees({instant})`：所有飞出的蜜蜂飞回孔里；
  - `flashHole(hole, {instant})`：该孔闪一下暗红（约 0.5 秒）；
  - `drip({instant})`：出蜜孔流下一道金色蜂蜜（暖光）；`takeHoney({instant})`。
- `setState({ bees: [孔号…], honey: 'none' | 'drip' | 'taken' })`；子物体 `hive_hit`、`hive_hole_0..6`、`hive_honey_hit`；`update()` 驱动蜜蜂飞行。

## 5. 小屋室内（`props_p3_house.js`）

### `p3_jar_table` — 放钟罩的小桌（01:16、01:18）
- 深棕色木桌（约 0.55 宽 × 0.62 高 × 0.38 深），正面一个抽屉 + 圆把手。挂点 `jar_spot`（桌面中心）。

### `p3_bell_jar` — 玻璃钟罩培育台（01:18、01:20、10:12–10:28）
- 木底座 + 灰陶花盆（盆里深色土）+ 透明玻璃钟罩（白色高光条、黑描边），钟罩约 0.24 直径 × 0.4 高。
- `setDome(up, {instant})`：钟罩升起约 0.45 m / 落下；`plant({instant})`：土里冒出一根小芽；
  `grow(kind 'orange' | 'rose', {instant})`：暖光延时摄影，小芽长成对应的花（`p3_flower_orange` / `p3_rose`）；`harvest({instant})`。
- `setState({ dome: 'up' | 'down', plant: 'none' | 'sprout' | 'flower', kind })`；子物体 `jar_dome_hit`、`jar_pot_hit`、`jar_flower_hit`。

### `p3_pottery_wheel` — 陶轮（01:22、11:24–11:56、12:24–12:38）
- 浅色木桌（约 0.8 宽 × 0.72 高 × 0.6 深，四条外撇的腿）+ 桌面上的灰色石轮盘 + 中轴 + 桌下的脚踏轮盘。
- 陶土按 `POT` 的三段造型生成（下、中、上三段各自车削，段间留接缝线）：
  `setClay(on, {instant})`、`setShape([下, 中, 上], {instant})`（换形时有约 0.25 秒的形变）、`poke(seg)`（点击反馈：轮盘转一下，这一段被捏一下）、
  `spin(on)`、`finish({instant})`（陶坯一闪后从轮盘上消失，交给章节给物品）。
- `setState({ clay, shape })`；子物体 `pot_seg_0_hit`、`pot_seg_1_hit`、`pot_seg_2_hit`（下、中、上）、`wheel_hit`。

### `p3_vase_drawing` — 墙上的两张花瓶草图（01:22、11:24）
- 透明底的铅笔线稿贴片，上面是 `POT.targets.slim`、下面是 `POT.targets.urn`（用 `drawPotOutline` 画），约 0.36 宽 × 0.8 高。

## 6. 白桦林（`props_p3_grove.js`，独立 zone）

白桦林是一个**独立布景**（像室内一样单独一个 zone，建议原点 `[600, 0, 0]`，不和 300 / 400 / 500 / −800 重叠），从红叉树倒下后的缺口进去。
原作画面（05:06–05:14、06:14、09:26、12:50）：前景几棵白桦，背后是一整面灰蓝色带斜纹的岩壁，岩壁上嵌一个石砌拱形神龛。

### `p3_grove_set` — 布景（`makeProp('p3_grove_set', { lights: true })`）
- 地面（灰绿，带一条浅色小路）、半圆形岩壁背景（高约 6 m，灰蓝底 + 斜向深浅条纹，略带紫灰）、10–16 棵白桦（白皮、黑色横斑、细枝、绿叶簇）、
  入口一侧（+z）几根深色森林树干做框；可选自带灯光（半球光 + 方向光）。
- 导出 `GROVE_LAYOUT`（各锚点相对布景原点的坐标与朝向）和 `GROVE_ROAM`（给 `views.defineRoamArea` 用的 `{ bounds, circles, boxes, eye }`）。
- 命名锚点（Object3D）：`grove_entry`（进来时站的位置）、`grove_table`、`grove_larva`、`grove_shrine`、`grove_berries`、`grove_tap_birch`、`grove_plant`。

### `p3_birch` — 单棵白桦（`{ height, lean, seed, leaves }`）

### `p3_birch_tap` — 可以割汁的白桦 + 地上的陶罐（05:08 罐子、05:34–05:38）
- `tap({instant})`：树干上砍出一个红褐色 X 形切口，插出一根弯管，树汁顺管流进罐子；`fill({instant})`；`takeJug({instant})`（罐子消失）。
- `showCocoon(on)` / `hatch({instant})`：割过汁以后树上挂一个茧，点它飞出一只蝴蝶（可选成就“The Butterfly”）。
- `setState({ tapped, filled, jugTaken, cocoon: 'none' | 'hanging' | 'hatched' })`；子物体 `tap_hit`、`tap_jug_hit`、`cocoon_hit`。

### `p3_berry_bush` — 浆果丛（05:08、05:12）
- `pick({instant})`：红浆果消失，只剩叶子；`setState({ picked })`；子物体 `berry_hit`。

### `p3_shrine` — 神龛（05:14、05:16、09:28–09:34、12:52–13:18）
- 浅灰石块砌的拱形壁龛（约 1.3 宽 × 2.6 高，石块黑描边），龛内略暗；三根白色小石柱（约 0.75 高）；左柱上原有一只 `p3_vase_bottle`；
  龛顶挂着 Caroline 的画像（复用 `portrait_caroline`）。
- `setVase(slot 1 | 2, kind 'slim' | 'urn' | null, {instant})`、`setFlower(slot 0..2, kind 'yellow' | 'orange' | 'rose' | null, {instant})`。
- 画像：`setPortrait('normal' | 'eyes' | 'gone', {instant})`（`eyes` = 两个眼睛变成黑洞，13:12）；
  `gnatsToPortrait({instant})`：蚊群从花瓶附近飞向画像、盖住她的眼睛（13:00–13:10），结束后是 `eyes` 状态；
  `drawFrame(k)`：画像消失处出现一个细黑方框（13:16–13:18）；`showCube(on, {instant})` / `takeCube({instant})`：方框里浮着黑方块（13:38）。
- `setState({ vases: [kind|null, kind|null], flowers: [k, k, k], portrait, frame: 0..1, cube: 'none' | 'shown' | 'taken' })`；
  子物体 `shrine_slot_0..2`（柱顶）、`shrine_portrait_hit`、`shrine_cube_hit`。

### `p3_grove_table` — David 的圆桌（05:42–06:04）
- 圆木桌 + 桌后的凳子；桌上从左到右：白碗、玻璃杯、盘子里两片面包。
- `setBerries(on)`（碗里堆满浆果）、`setSap(on)`（杯里倒满树汁）、`setHoney(on)`（面包上抹蜂蜜），都带 `{instant}`；
- `setState({ berries, sap, honey })`；子物体 `table_bowl_hit`、`table_cup_hit`、`table_plate_hit`、`table_hit`。

### `p3_larva` — 巨大的幼虫（06:14–06:50）
- 约 1.4 长 × 0.45 粗的米色分节幼虫，节缝深色，表面细点；头端一个深色圆口（口里一道钩状纹），尾部变细。
- `update()` 慢慢蠕动；`setGnats(k 0..1, {instant})`：被蚊群盖住的程度（1 = 整条黑乎乎的一团，06:18）；`clearGnats({instant})`：蚊子飞散；
- `spit({instant})`：口张开，吐出一个球茎（`p3_bulb`）落在地上；`takeBulb({instant})`。
- `setState({ gnats: 0..1, spat, bulbTaken })`；子物体 `larva_mouth_hit`、`larva_body_hit`、`larva_bulb_hit`；`coverPoints()` → 蚊群落点（局部坐标）。

### `p3_grove_portal` — 森林里通往白桦林的缺口（05:06）
- 3–5 棵白桦 + 后面一片淡淡的亮雾，约 3 m 宽，放在红叉树后面。树倒之前被红叉树挡住大半。

## 7. 人物变体（复用 `cast.js` 的身体，只加道具、发型和动作）

所有变体用 `makeCharacter(id)` 创建（`characters.js` 已并入 `CAST_P3`），返回标准 CharacterRig（root 脚底 y = 0、面朝 +z、`headTop`、`play()`、`update()`、`setOpacity()`…）。
人物一律 `scale = 1`（真实身高，见 AGENTS.md）。

### 7.1 小屋（`cast_p3_hut.js`）
- **`gerard_barber`**：不戴帽子的 Gerard，坐在凳子上（座高 0.45），双手放在膝上，脸色不耐烦（01:12、01:16）。
  - 头发 `setHair(stage 0..3, {instant})`：0 = 乱蓬蓬的长发（头顶翘起的发束）→ 1 = 剪短一截 → 2 = 很短 → 3 = 寸头（露出头皮和发茬）。
    每剪一刀有碎发飘落（`snipHair()`，04:00–04:08）。
  - `showScalpMap(on)`：寸头后头顶的墨线地图（`scalpMapTexture()`，04:20 俯视特写看得清）。
  - `cutEar({instant})`：他右耳（画面左侧）被剪掉、流血（04:10–04:16），表情 `pain` 一下再回到 `grim`；`earless` 状态之后一直保持。
  - `setState({ hair, scalpMap, ear: true | false })`。
- **`ida_barber`**：站在 Gerard 身后（不戴青蛙），双手搭在他肩上（01:16）；`holdScissors(on, {instant})`：右手举着剪刀（03:54）；
  `snip({instant})`：剪刀在他头边开合一次；`cutEar({instant})`：剪刀移到他耳边“咔嚓”；说话 `play('talk')`（“我们不想看到虱子.”）。
  - `setState({ scissors })`。章节把两人摆成 Ida 在 Gerard 正后方约 0.32 m（`IDA_BEHIND` 导出偏移）。

### 7.2 湖岸、白桦林（`cast_p3_family.js`）
- **`margaret_gnats`**：湖岸坐在凳子上的 Margaret（复用第一灾坐姿，双手在胸前），脸上爬着十几只蚊子（01:54）。
  `setGnats(on)`；`takeSwatter()` 后右手拿着苍蝇拍；`swat({instant})`：拍自己的脸（01:58，脸颊留一个小血点），蚊子死掉；之后一直竖握着拍子（02:06）。
  `setState({ gnats, swatter, swatted })`。
- **`david_table`**：坐在圆桌后的 David（帽子、红马甲，坏笑），双手放在桌沿（05:42）；`talk()`（“我今天血糖非常低.”）；
  `coverWithGnats({instant})`：蚊群从四周聚过来把他整个盖住（06:06–06:12）；`vanish({instant})`：人消失（章节接着显示幼虫）。
  `setState({ covered, gone })`。
### 7.3 回忆里的一家人（`cast_p3_memory.js`）

13:20–13:36：岩壁前站成一排（从左到右 Gerard、坐着抱婴儿的 Margaret、红发女孩、少年 Jakob、举玫瑰的 Caroline、Nicholas），半透明淡入，结束时淡出（`rig.setOpacity`）。

  - **`caroline_rose`**：Caroline 右手举着一朵红玫瑰（`p3_rose`），左手垂下；`dropPetals({instant})`：玫瑰花瓣散落飘走（13:32–13:34）。
  - **`margaret_baby`**：坐在凳子上抱着襁褓婴儿的 Margaret（复用 Caroline 的婴儿模型）。
  - **`ida_child`**：红发小女孩（约 1.3 m），白色连衣裙。
  - **`nicholas_stand`**：站着的 Nicholas（长外套、白领巾），一只手搭在 Caroline 肩上。
  - **`gerard_young`**：不戴帽子、双手插兜的 Gerard。
  - 少年 Jakob 直接用现有的 `jakob_child`。

## 8. 公共画作（`props_lake.js` 的 `plague_painting`，追加，不改第一、二灾默认外观）

- `makeProp('plague_painting', { insects: true })`：天上画出原作里的蚱蜢和苍蝇（第三灾起使用；默认不画，第一、二灾不变）。
- `banishWoman({instant})`：发光方块射出光线，红斗篷女人和她身后的黑色虫柱从画里消失（14:14–14:18）。
- `frameFly({instant})`：白色方框框住天上的苍蝇（14:20，下一灾的预告）。
- `setState({ lit, purified, frogsGone, womanGone, flyFramed })`：瞬时恢复（第三灾开局 = 溪流已净化、青蛙已消失、方块未点亮）。
