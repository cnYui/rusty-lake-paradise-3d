# 网格人物 / 动物模型流水线（Blender → `.rlpm`）

用户用 AI（Tripo）生成的 GLB 每个约 200 万面、60 MB，不能直接进游戏。这里的脚本把它们变成游戏用的轻量模型，输出放在 `src/art/models/`（`<key>.rlpm` + `<key>.jpg`）。运行时加载见 `src/art/rlpm.js`，格式说明见该文件开头。

原始 GLB 不入库（每个 60 MB），放在 `RLP_GLB_DIR`（默认 `C:/Users/yui/Downloads`）。需要 Blender（本机是 5.2.2）。

2026-11-02 用户在 Downloads 重新下载了天堂岛的人物 GLB（Tripo 的低面版：每个约 1.8 万面、8 MB，三张贴图：底色 / 金属粗糙度 / 法线），并要求按「游戏名-角色名」改名，见下表“改名后”一列（`retopo_bake.py` 两种文件名都认）。现有 `.rlpm` 是 10-23 用 60 MB 的原版做的，新文件只在要重导出时才用得上。苍蝇人、Margaret、Ida、David 四个文件当时没改名（协调说法是归旅馆用，待确认）。

## 对应关系

| GLB 文件名 | 改名后（2026-11-02） | 游戏里的对象 | key | 脚本 |
| --- | --- | --- | --- | --- |
| historical+judge+character | 锈湖天堂岛-尼古拉斯.glb | Nicholas（1.88） | nicholas | rig_export.py |
| historical+character | 锈湖天堂岛-杰拉德.glb | Gerard（1.84） | gerard | rig_export.py |
| cowboy+character | （未改） | David（1.78） | david | rig_export.py |
| cartoon+grandmother | （未改） | Margaret（1.56） | margaret | rig_export.py（裙装） |
| historical+woman | （未改） | Ida（1.58） | ida | rig_export.py（裙装） |
| cartoon+man | 锈湖天堂岛-少年雅各布.glb | 少年 Jakob（1.30） | jakob_child | rig_export.py |
| rabbit+character | 锈湖天堂岛-兔头大卫.glb | `david_rabbit`（记忆里的兔头 David） | rabbit | rig_export.py |
| boar+man | 锈湖天堂岛-野猪头杰拉德.glb | `gerard_boar` | boar | rig_export.py |
| pigeon+humanoid | 锈湖天堂岛-鸽子头玛格丽特.glb | `margaret_pigeon`（裙装） | pigeon | rig_export.py |
| deer+humanoid | 锈湖天堂岛-鹿头尼古拉斯.glb | `nicholas_deer`（长袍，腿可见） | deer | rig_export.py |
| owl-headed character | 锈湖天堂岛-猫头鹰头伊丽莎白.glb | `ida_pheasant`（第十灾戴上野鸡面具的 Ida，1.58，棕色泡泡袖裙；2026-11-03 转好。名字里的“猫头鹰头”是误认，对照原作是野鸡面具） | pheasant | rig_export.py（裙装） |
| plague doctor | 锈湖天堂岛-瘟疫医生.glb | `plague_doctor`（第六灾，黑礼帽乌鸦嘴医生，帽子下头骨顶 1.84，连帽顶约 2.0 m；长袍当裙装） | doctor | rig_export.py（裙装） |
| tall silhouette | 锈湖天堂岛-黑影.glb | 黑影 / 灵魂 `soul`（第一、八、十灾，1.97；一整根锥形长袍，没有分开的腿；网格不封闭，自动权重失败，走距离反比权重） | soul | rig_export.py（裙装） |
| owl mask character | 锈湖天堂岛-猫头鹰面具伊丽莎白.glb | `elizabeth_owl`（第十灾鹰室里戴猫头鹰面具的 Elizabeth，1.31；黑长发、浅蓝袖、棕围裙裙） | elizabeth_owl | rig_export.py（裙装） |
| stone tower | 岛上的石塔（38 m） | tower | tower_export.py + tower_recolor.py |
| cartoon+goat | 山羊（第一灾；已删木盆） | goat | goat_export.py |
| cow | 牛（第五灾） | cow | cow_export.py |
| anthropomorphic+fly | 苍蝇人（第四灾） | fly | fly_export.py |

## 步骤

```bash
B="C:/Users/yui/AppData/Local/Programs/Blender/blender-5.2.2-windows-x64/blender.exe"
W=<临时目录>
# 1) 焊接 → 减到 4 万面 → 重新展 UV → 把原贴图烘到新 UV（每个约 40 秒；山羊的木盆在 filters.py 里按连通块删掉）
"$B" -b -P retopo_bake.py -- $W/lo 40000 2048 cowboy_character historical_character historical_judge_character cartoon_man cartoon_grandmother historical_woman cartoon_goat cow anthropomorphic_fly rabbit_character boar_man pigeon_humanoid deer_humanoid
# 2) 绑骨骼 + 导出（人物：14 关节，地标写在 rig_export.py 的 CFG 里）
"$B" -b -P rig_export.py -- $W/lo $W/out cowboy_character historical_character historical_judge_character cartoon_man cartoon_grandmother historical_woman rabbit_character boar_man pigeon_humanoid deer_humanoid
"$B" -b -P goat_export.py -- $W/lo $W/out
"$B" -b -P cow_export.py  -- $W/lo $W/out
"$B" -b -P fly_export.py  -- $W/lo $W/out
# 3) 贴图 PNG → JPEG（q86），和 .rlpm 一起复制到 src/art/models/（<key>.jpg 对应 <name>_bake.png）
```

2026-11-03 起，Tripo 低面版 GLB 导入后是侧着的（面朝 +x、两臂沿 y），`retopo_bake.py` 按包围盒自动绕 z 转 -90° 摆正（判断不准的在 `ROTZ` 里写死角度）；云端容器没有 Blender 程序，用 `/home/claude/bpyenv` 里装的 bpy 模块直接跑同样的脚本（还要 `pip install pillow`），`RLP_GLB_DIR` 指到放 GLB 的目录（资料库里上传的文件没有扩展名，先复制成 `锈湖天堂岛-角色名.glb`）。例：

```bash
RLP_GLB_DIR=$GLB /home/claude/bpyenv/bin/python dev/common/models/retopo_bake.py -- $W/lo 40000 2048 owl_headed_character
RLP_GLB_DIR=$GLB /home/claude/bpyenv/bin/python dev/common/models/rig_export.py -- $W/lo $W/out owl_headed_character
```

## 要点

- **绑定姿势**：原模型是 T 字 / A 字姿势。每个关节带一份绑定姿势（世界位置 + 转角），逆绑定矩阵由它直接算出，所以游戏里的休息姿势（手臂下垂、腿并拢）和 `rig.pose` / IK / 坐姿都照旧工作（`rlpm.js` 的 `boneInverses`）。
- **骨骼权重**：自动权重（热扩散）能用就用；失败（玛格丽特的网格不封闭）改用“到骨骼线段的距离反比”权重。裙装人物髋以下的顶点单独算：身体 + 前面随大腿 / 小腿摆动，最下面一圈是鞋，整个跟脚走；腿在绑定时就是竖直的（裙子里的腿看不见），鞋子靠脚关节整体平移到身体下面。
- **缩放**：模型都是大字型，必须“摆直了再量”：休息姿势（手臂下垂、腿并拢）下头骨顶 = 表里的身高（`src/art/scale.js` 的 `HUMAN`）；帽子、头发、耳朵、鹿角在头骨顶之上。腿并拢后身体会抬高 `delta0`，缩放 `s = H / (头骨顶 + delta0)` 已把它算进去；裙装 / 长袍的腿藏在里面，腿长按“髋 → 踝”的真实距离算（`dress=True`）。苍蝇人同理（`fly_export.py`）。
- **石塔贴图**：`python tower_recolor.py 烘焙图.png src/art/models/tower.jpg`，把写实贴图调成暖灰手绘色带（和岛上其他石头同一套颜色）。
- 改了地标或骨架后要同时重导出 `.rlpm`；人物的 `k`（骨架比例）写在文件头里，`modelHuman()` 直接用它建骨架。
