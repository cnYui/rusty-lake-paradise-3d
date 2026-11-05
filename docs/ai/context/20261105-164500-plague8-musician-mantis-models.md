# 第八灾：三个乐手和巨型螳螂换成用户给的网格模型（2026-11-05）

## 起因

用户（11-05）把四个 Tripo 模型放进项目文件夹，要求“放到第八章里面”：

| 文件 | 是谁 | key |
| --- | --- | --- |
| cartoon musician 3d model.glb | 乐手 I：胖子、灰色礼帽、八字胡 + 山羊胡（Gerard） | `musician_fat` |
| mandolin 3d model.glb | 乐手 II：年轻人、棕帽插两根羽毛、没胡子（David） | `musician_feather` |
| mandolin playing man 3d model.glb | 乐手 III：白发、八字胡、不戴帽子，左手拨弦（Nicholas） | `musician_old` |
| praying mantis 3d model.glb | 雾里的巨型螳螂 | `mantis` |

三个乐手都穿背心短裤、自己抱着曼陀林，和原作 P08 门外的三个乐手一致；木盒的属性（帽子 / 胡子 / 白发 / 胖）和新模型对得上，谜题不用改。

## 做法

- 减面烘贴图照旧用 `retopo_bake.py`（4 万面、2048 贴图；四个 GLB 导入后都是侧着的，自动转正）。
- 新脚本 `dev/common/models/p8_export.py`：
  - 乐手：一整块站姿网格，只绑 body（脚底）/ torso（腰）/ head（脖子）/ strum（拨弦那只手的肘）四个关节，权重是到骨骼线段的距离反比（琴身、按弦的手臂算 torso）。头骨顶 = 身高（I 1.84、II 1.78、III 1.88），帽子在头骨顶之上。
  - 螳螂：body（胸）/ 四条步足（枢轴在股节根部，股节 + 胫节跟着腿走，基节算身体）/ upper（前胸根部，前胸 + 头 + 捕捉足）/ head / fore（一对捕捉足）。步足的地标是在低模上从脚尖沿网格边走最短路到头顶、看路径拐点量出来的。眼睛离地 4.55 m（和程序化螳螂一样高），连触角约 5 m。
- `src/art/musician_model.js`：`buildMusicianModel(key)`，待机时身体跟着拍子左右晃、点头，拨弦的前臂绕前向轴上下拨（0.06 rad）。接口照 `makePerson` 人物（`root`、`parts.body / head`、`setPose / setHeld / reach / bob` 空操作），`rig.adapted = true` 让 `makePerson` 跳过 `adapt`，`rig.holdsLute = true` 让章节不再挂程序化曼陀林。
- `src/art/mantis_model.js`：`buildMantisModel(m)`，接口和程序化螳螂一样（`update / walking / walkTo / face / strike / rest`，`userData.head / fore / legs / rig / upper`，另加 `userData.model` 方便截图时直接摆姿势）。走路时对角两条腿同相，绕竖直轴摆 0.2 rad、绕“脚尖方向 × 竖直”的水平轴抬 0.1 rad；出手时前胸连头往前下方扑 0.75 rad、捕捉足甩 0.95 rad。
- 接入：`cast_mock.js` 的 `musician_*` 先试网格乐手，没有模型回落原来的 Gerard / David / Nicholas；`props_p8.js` 的 `mantis()` 有 `mantis` 模型就用网格，没有就是原来的程序化螳螂；`plague8/world.js` 只给没抱琴的人挂 `holdMandolin`；`rlpm.js` 的 `CHAPTER_MODELS.plague8` 换成四个新模型（不再预加载 gerard / david / nicholas，只在乐手模型加载失败时回落用，那时走程序化人物）。

## 验证

- 门外特写、侧面截图：三个乐手比例和原作一致，抱琴姿势自然；把拨弦、点头、晃身体放大 5 倍截图看蒙皮，手和琴身交界处只有轻微拉伸，正常幅度看不出来。
- 雾林里螳螂站姿、侧面、出手、走路（腿摆放大 2 倍）截图：腿和身体接缝没有撕开。
- `node --test dev/plague8/test_plague8.mjs dev/plague10/test_plague10.mjs`：15 通过。
- `python dev/plague8/test_plague8_browser.py`：exit 0（自动通关、真实鼠标 / 数字键 69 步、中途读档 box / chorus / dig / temple、合唱点错重来、浓雾、门禁、菜单 wip、触屏）。
- `python dev/common/test_hints_browser.py 8`：23/23 通过。
- `?models=0`：乐手回落程序化人物 + 章节挂的曼陀林，螳螂回落程序化，启动无错误。

## 补：乐手没有脚（同日 17:10）

在显卡上预检录像时发现：三个乐手的 Tripo 模型小腿在地面处被截平，没有脚（原图的脚落在画框 / 地面雾里，生成时就丢了），看着像站在土里只露半截小腿。原作 P08 门外三个人是光着脚站在地上的（正面看脚掌朝镜头，只露一点）。

`musician_model.js` 的 `addFeet`：按网格最底下 2 cm 那圈顶点分左右两条腿，量出中心和粗细，各放一只朝前的半椭球脚掌（宽略大于小腿截面、包住截口，长至少 0.26 m，高 6–8.5 cm，脚跟对齐小腿后缘），挂在 body 关节上；颜色取脚踝往上 2–7 cm 皮肤的贴图中位色，压暗一点、偏暖（脚背朝上受光多，不压暗会比小腿白一截）。门外特写、侧面、默认机位截图核对过。
