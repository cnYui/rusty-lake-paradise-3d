# 网格人物 / 动物模型流水线（Blender → `.rlpm`）

用户用 AI（Tripo）生成的 GLB 每个约 200 万面、60 MB，不能直接进游戏。这里的脚本把它们变成游戏用的轻量模型，输出放在 `src/art/models/`（`<key>.rlpm` + `<key>.jpg`）。运行时加载见 `src/art/rlpm.js`，格式说明见该文件开头。

原始 GLB 不入库（每个 60 MB），放在 `RLP_GLB_DIR`（默认 `C:/Users/yui/Downloads`）。需要 Blender（本机是 5.2.2）。

## 对应关系

| GLB 文件名 | 游戏里的对象 | key | 脚本 |
| --- | --- | --- | --- |
| historical+judge+character | Nicholas（1.88） | nicholas | rig_export.py |
| historical+character | Gerard（1.84） | gerard | rig_export.py |
| cowboy+character | David（1.78） | david | rig_export.py |
| cartoon+grandmother | Margaret（1.56） | margaret | rig_export.py（裙装） |
| historical+woman | Ida（1.58） | ida | rig_export.py（裙装） |
| cartoon+man | 少年 Jakob（1.30） | jakob_child | rig_export.py |
| rabbit+character | `david_rabbit`（记忆里的兔头 David） | rabbit | rig_export.py |
| boar+man | `gerard_boar` | boar | rig_export.py |
| pigeon+humanoid | `margaret_pigeon`（裙装） | pigeon | rig_export.py |
| deer+humanoid | `nicholas_deer`（长袍，腿可见） | deer | rig_export.py |
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

## 要点

- **绑定姿势**：原模型是 T 字 / A 字姿势。每个关节带一份绑定姿势（世界位置 + 转角），逆绑定矩阵由它直接算出，所以游戏里的休息姿势（手臂下垂、腿并拢）和 `rig.pose` / IK / 坐姿都照旧工作（`rlpm.js` 的 `boneInverses`）。
- **骨骼权重**：自动权重（热扩散）能用就用；失败（玛格丽特的网格不封闭）改用“到骨骼线段的距离反比”权重。裙装人物髋以下的顶点单独算：身体 + 前面随大腿 / 小腿摆动，最下面一圈是鞋，整个跟脚走；腿在绑定时就是竖直的（裙子里的腿看不见），鞋子靠脚关节整体平移到身体下面。
- **缩放**：模型都是大字型，必须“摆直了再量”：休息姿势（手臂下垂、腿并拢）下头骨顶 = 表里的身高（`src/art/scale.js` 的 `HUMAN`）；帽子、头发、耳朵、鹿角在头骨顶之上。腿并拢后身体会抬高 `delta0`，缩放 `s = H / (头骨顶 + delta0)` 已把它算进去；裙装 / 长袍的腿藏在里面，腿长按“髋 → 踝”的真实距离算（`dress=True`）。苍蝇人同理（`fly_export.py`）。
- **石塔贴图**：`python tower_recolor.py 烘焙图.png src/art/models/tower.jpg`，把写实贴图调成暖灰手绘色带（和岛上其他石头同一套颜色）。
- 改了地标或骨架后要同时重导出 `.rlpm`；人物的 `k`（骨架比例）写在文件头里，`modelHuman()` 直接用它建骨架。
