# 第三灾 · 蚊灾和虱灾 —— 交接说明（给实现章节逻辑的 AI）

> 分工：**美术资产（模型、贴图、动画方法）由本会话负责并继续完善；章节逻辑（流程、热点、旗标、sync、walkthrough）和全部测试由你负责。**
> 你可以现在就开始：所有道具 id 和人物 id 都已经是正式模型（占位机制保留作兜底），接口以 `docs/plague3_api.md` 为准，偏差见 §2.1。

## 1. 先读

1. `AGENTS.md`（项目约束：漫游、门禁、触屏、存档、验证方式）。
2. **`docs/plague3_design.md`**：本章逻辑设计契约（流程、谜题规则、旗标、视图、物品、成就、文案、摆放坐标、主线顺序、测试要求）。
3. **`docs/plague3_api.md`**：美术模块接口（每个道具 / 人物的 id、方法、`setState` 字段、子物体名）。
4. 写法样板：`src/chapters/plague2/*`（最接近：布景切换、门、室内漫游、神殿结尾）、`src/chapters/plague4/*`、`src/chapters/plague5/*`（自建 zone、双向 sync）。
5. 引擎参考：`dev/ref/plague3/code_core.md`（10-08 写的核心 API 说明，行号可能过时，以函数名 grep 为准）。
6. 参考视频：`dev/ref/P03_第三灾-蚊子灾_BV1bo4y1y7fm.mp4`，逐秒帧 `dev/ref/plague3/frames/`，拼图 `dev/ref/plague3/sheets/`。

## 2. 现在的交付状态（2026-10-19）

| 内容 | 文件 | 状态 |
|---|---|---|
| 物品模型 19 件（苍蝇拍、蚊子、蜗牛、斧子、铲子、剪刀、蜂蜜、耳朵、贻贝、浆果、桦树汁罐、球茎、黏土、三种花、三种花瓶）+ 中文名 `ITEM_SPECS` | `src/art/props_p3_items.js` | **完成**（截图自查过，见 `dev/shots/p3/items/lineup.png`） |
| 公共工具：红漆符号 / 头皮地图贴图、蚊子、**蚊群 `makeGnatSwarm`**、**蚊子覆盖层 `makeGnatCover`**、陶轮造型数据 `POT` | `src/art/props_p3_shared.js` | **完成** |
| 公共画作第三灾结尾：`{ insects: true }`（天上的蚱蜢和苍蝇）、`banishWoman()`、`frameFly()`、`setState()/getState()` | `src/art/props_lake.js`（追加，第一、二灾默认外观不变） | **完成** |
| 回忆里的一家人 `caroline_rose / margaret_baby / ida_child / nicholas_stand / gerard_young` | `src/art/cast_p3_memory.js` | **完成**（逐个对照 13:28 参考帧打磨；新增 `ghostFade(rig)`，章节要对回忆里的 `jakob_child` 也调一次） |
| 海滩 / 湖岸 / 神殿道具（符号石、贻贝、X、滑块盒、木桩、窗台盘、鹦鹉） | `src/art/props_p3_beach.js` | **完成**（7 个道具；滑块盒随机 400 步和全流程验证过；偏差见下） |
| 森林道具（捕蝇草、红叉树、土堆、蜂巢） | `src/art/props_p3_forest.js` | **完成**（4 个道具；对照参考帧的对比图在 `dev/shots/p3/forest/final_*_vs_ref.png`） |
| 小屋道具（钟罩小桌、玻璃钟罩、陶轮、墙上花瓶草图） | `src/art/props_p3_house.js` | **完成**（4 个道具） |
| 白桦林布景与道具（布景、白桦、割汁白桦、浆果丛、神龛、圆桌、幼虫、森林缺口） | `src/art/props_p3_grove.js` | **完成**（8 个道具；入口机位 52 个 draw call） |
| 小屋人物 `gerard_barber / ida_barber` | `src/art/cast_p3_hut.js` | **完成**（四档发型、头皮地图、剪耳、Ida 举剪刀均验证过） |
| 湖岸 / 白桦林人物 `margaret_gnats / david_table` | `src/art/cast_p3_family.js` | **完成**（Margaret 拍脸、David 被蚊群盖住 / 消失） |

### 2.1 实现偏差与摆放提示（2026-10-19 收尾，逐项出处见 `docs/ai/context/20261019-224800-plague3-art-complete.md`）
- **圆桌与 David**：`p3_grove_table` 的凳子和 `table_seat` 在 `(0, 0.45, −0.62)`，`david_table` 的 root 放在桌坐标 `(0, 0, −0.62)`（桌面高 0.75，坐高 0.45）。
- **吃饱的捕蝇草夹子保持闭合**（浅绿壳），不是重新张开；红叉在树上的位置比 api.md 写的更高（中心约 2.2 m）。
- **`p3_stump` 的“第三个符号”是占位 ⊗**，用 `setSymbolTexture(tex)` 替换。
- **贻贝在右石上朝右前方**：右石按设计文档转 `rotY −0.25` 摆放。
- **画像 `gone`**：画像掉到柱子后面斜靠着，不是消失；`shrine_portrait_hit` 此时隐藏。
- **Ida 站位偏移 `IDA_BEHIND = [0,0,−0.4]`**（不是 0.32，否则裙子穿进凳子）；用 `ida.setPartner(gerard, { place, offset })` 摆放。镜头放在 Gerard 右前方约 25–35°，正前方会挡住 Ida。
- **Margaret** 拍脸后脸颊留一个小血点（按 api.md；参考 02:01 其实是干净的脸，要去掉改 `KEEP_SPOT`）；David 蚊群覆盖到 0.4，对应参考 06:12。
- **回忆人物淡入**：五个变体已自动套用 `ghostFade`，`jakob_child` 要章节里手动 `ghostFade(rig)`；Ida 小女孩身高 1.155 m（参考比例，不是文档的 1.3）。
- **白桦林漫游**：`views.defineRoamArea` 用 `groveRoamAt([600,0,0])`；环境音在 `views.js` 的 `zoneAmbience` 给 `p3_grove` 加 `'forest'`（我没动共享文件）。
- **`update()` 要注册**：幼虫蠕动、捕蝇草摇摆、蜂巢蜜蜂、钟罩 `grow`、陶轮 `spin`、Margaret 脸上的蚊子都靠 `ctx.register` 驱动。

**占位机制**（保证你现在就能开发）：
- 道具：`props.js` 在所有正式模块之后，用 `src/art/props_p3_placeholders.js` 给**还不存在**的第三灾 id 顶上占位（半透明盒子 + 接口里的全部子物体名 + 空操作方法 + 能记住状态的 `setState/getState`）。正式工厂一出现就不再用占位。可用 `obj.userData.placeholder` 判断。
- 人物：`src/art/cast_p3.js` 给还没做好的变体回退到最接近的现有人物（方法是返回 Promise 的空操作），`rig.placeholder === true`。
- 所以：**只按接口调用，不要依赖占位的外观、尺寸或内部结构**；镜头、碰撞、热点大小在正式模型落地后要再截图校一次。

## 3. 你要做的（文件归属）

- 新建 `src/chapters/plague3/`：`index.js`、`text.js`（纯数据：`T`、`ACHIEVEMENTS`）、`items.js`（用 `ITEM_SPECS` 定义物品，`model: () => makeProp(id)`）、
  `world.js`（布景、视图、碰撞、新 zone `p3_grove`）、`puzzles.js`（纯规则）、按区域拆的交互文件、`walkthrough.js`。
- 新建测试：`dev/test_plague3.mjs`、`dev/test_plague3_browser.py`。
- 共享文件只做小范围追加：`src/chapters/index.js`（第三灾那一条的 `title` / `load` / `wip`）、`src/core/views.js`（`zoneAmbience` 追加 `p3_grove`，可选）、
  `src/core/ui.js`（`CHALK_ICONS` 追加，可选）、`src/core/context.js`（成就面板，可选）。
- **不要改**：`src/art/props_p3_*.js`、`src/art/cast_p3*.js`、`src/art/props_lake.js`、`src/art/props.js`、`src/art/characters.js`、`src/art/cast.js`（美术正在并行修改）。
  需要美术改动（新方法、子物体、尺寸、颜色）时写进你的 `docs/ai/context/` 记录的“对美术的请求”一节，由美术方处理。
- 每次修改、验证、设计决策在 `docs/ai/context/` 新增带时间戳的中文记录。

## 4. 工作区注意

- 多个会话共用这个工作区（小红书小工具会话在改 `dev/minitool/*`）。不要整批还原文件、不要 `git checkout/reset/stash`，提交前只 add 自己的文件。
- `src/art/props.js` 在仓库里是 CRLF，改它时保持 CRLF。
- 截图放 `dev/shots/p3/<你的目录>/`（不进 git）。`python dev/shot.py` 的用法见 `dev/ref/plague3/code_core.md` §4。

## 5. 验收（你负责，详见设计文档 §9）

- `node --test dev/test_plague3.mjs`；`python dev/test_plague3_browser.py`（autoplay 全通、真实鼠标 + 数字键、触屏、存档双向恢复、白桦林入口、漫游碰撞、首页进入）。
- 至少一次 `RLP.autoplay()`；回归第一灾 91/91、第二灾、第四灾。
- 正式模型全部落地后，再跑一遍全套并逐个视图截图核对构图。
