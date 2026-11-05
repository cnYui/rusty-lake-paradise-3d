# 瘟疫医生、黑影、鹰室 Elizabeth 换成网格模型，加第六到十灾的通用录像脚本（2026-11-03）

## 背景

用户 11-03 把 Tripo 生成的三个 GLB（瘟疫医生、猫头鹰面具人物、高个子黑影）传到资料库，要求“先上传资料库”，再接进游戏；又说“之前的第一灾中有黑影，你也一起替换了”。原来这三个都不是网格：医生是 `makeMockPerson` 占位（第六灾因此还标 wip），黑影和 Elizabeth 是程序化建模。

## 模型

- 原文件存进共享文件夹 `models-glb/`，按「锈湖天堂岛-角色名.glb」命名：瘟疫医生、黑影、猫头鹰面具伊丽莎白，外加一张三个模型的预览图。
- 云端用 `/home/claude/bpyenv` 的 bpy 跑 `retopo_bake.py`（`RENAMED` 加了三条映射）和 `rig_export.py`（`CFG` 加了三条地标，裙装处理）。三个模型导入后都是侧着的，脚本自动转 -90°（2026-11-03 上午给野鸡面具 Ida 加的那段）。
  - `doctor`：H 1.84（帽子下的头骨顶，连帽顶约 2.0 m），黑礼帽 + 乌鸦嘴面具 + 斗篷长袍，长袍当裙装。
  - `soul`：H 1.97，一整根锥形长袍、白眼睛、边缘毛茸茸；网格不封闭，自动权重全失败，走“到骨骼线段距离反比”的备用权重，腿没有分开，按裙装处理。
  - `elizabeth_owl`：H 1.31（和程序化 Elizabeth 一样的身高，不拿成年身材缩小凑数以外的比例），猫头鹰面具、黑长发、浅蓝袖、棕围裙裙都在网格上。
- `src/art/models/` 新增 `doctor / soul / elizabeth_owl` 各 `.rlpm` + `.jpg`（每个约 0.6 MB + 0.2–0.8 MB）。

## 代码

- `rlpm.js`：`MASKED` 加 `elizabeth_owl`（面具是网格的一部分，`setMask` 变空操作）；新 `OWN` 表（`plague_doctor → doctor`、`soul → soul`）；`CHAPTER_MODELS` 里第一灾和第八灾加 `soul`，第六灾加 `doctor`，第十灾加 `soul`、`elizabeth_owl`。
- `cast.js`：新 `buildPlagueDoctor`、`buildElizabethOwl`（没有模型时返回 null）、`buildSoulMesh`（黑影的网格版，保留程序化黑影的 `vanish()` / `appear()` / `face = null`，第一灾湖边的消失动画照用）；`buildSoul` 有模型就用网格，没有就走原来的程序化建模；`CAST` 加 `plague_doctor / elizabeth_owl`。
- `cast_mock.js`：`REAL.plague_doctor` 有模型就 `makeCharacter('plague_doctor')`，没有返回 null；`makePerson` 对 null 回落占位人物（以前只有 `REAL` 里没这个 id 才回落）。
- 第六灾 `world.js`：网格医生的手垂在身侧，建好以后用 `reach('L', …)` 抬起左手（画面右边那只）去握法杖，法杖枢轴位置不变。
- 第十灾 `world.js`：Elizabeth 有模型就直接 `makeCharacter('elizabeth_owl')`，没有才走原来“程序化小女孩 + 头骨骼上挂 `p10_owl_mask`”；`puzzles.js`：Elizabeth 的热点对象改成 `rig.root`（`makeCharacter` 直接建的网格人物 `parts.body` 是空关节，射线打不到，第十灾真实鼠标验收第一次就卡在这，改成 root 后通过）。
- 第一灾 `lake.js` 不用改：`makeCharacter('soul')` 现在返回网格黑影，`CHAPTER_MODELS.plague1` 预加载 `soul`；小红书 / 口袋方舟包不带模型文件，仍走程序化黑影。

## 录像脚本

- 新 `dev/common/record_walkthrough.py <章节…>`：读章节自己的 `RLP.chapter.walkthrough`，换成真人输入（菜单点章节、WASD 走路、鼠标靠边转身、点击、数字键、点 ▼），同时录屏录音出 mp4，输出 `dev/plagueN/media/demo/`。复用 `dev/plague3/record_plague3_demo.py` 的 `Demo` 类（A* 走路、转身、稳定点击），第三灾的脚本不动。
- 找路：把视图连成图（节点 = 一个特写 / 固定视图，或“某个区域里所有开放视图”；边 = 带 `goto` 的热点或方向箭头），`go` 开放视图（同区域）不动，换区域就走到门口点门；原作录像里没有入口的特写（第十灾拱龛室三个角度）当“虚拟视图”，后面的 `back` 跳过。
- 弹出文档 / 图片时念 2.8 秒再按 Esc 关；默认 `--lenient`：某一步真人输入怎么也做不到就退回 `RLP.click / RLP.goto` 补上并写进报告，`--strict` 则停下存现场。`--fast --norender` 可在没有 GPU 的云端只验证流程。
- 云端渲染只有约 0.65 帧/秒（4 核、SwiftShader），不能录，正式录制要在用户的电脑上跑（Windows 默认 `--use-angle=d3d11`）。

## 验证

- 截图核对：第六灾白桦林门前的医生（有 / 没有法杖两种）、第十灾鹰室的 Elizabeth 和黑影、第一灾湖边的黑影。
- `node --test`（第二到十灾 + 提示表）118 项全过。
- 浏览器验收：`dev/plague6`、`dev/plague7`、`dev/plague8`、`dev/plague9`、`dev/plague10` 全过（第十灾第一次因为 Elizabeth 热点卡住，改成 `rig.root` 后重跑通过：自动通关 170 步、真实鼠标 / 数字键 119 步、8 个中途读档点、门禁、菜单 wip、触屏）。第一灾黑影：并行跑 `test_achievements_browser.py` 时第一灾因机器忙超时，单独用 `RLP.autoplay()` 跑通 93 步、五个成就都拿到。
- 录像脚本 `--fast --norender` 在云端试跑第六到十灾全部走通，通关旗标都立起来，没有一步退回接口：第六灾 138 步、第七灾 128 步、第八灾 100 步、第九灾 160 步、第十灾 170 步。试跑中修掉的问题：`--fast` 时 `RLP.timeScale` 要一直开快（原来每次等待后重置成 1，机器忙时一个过场就超时）；退回接口补步时物品已用掉会再抛错，改成记录后继续；药瓶那段要连续选同一类物品，同一个数字键 350 ms 内连按两次是“查看物品”而不是取消，所以先取消上一件（间隔 400 ms）再选下一件，且数字键在界面锁定时会被吞掉，选之前先等界面空闲，选不上最多重按两次。

## 还没做

- 第七灾冰中青年还是占位，等用户在 Tripo 生成后照同样的流程转（`rig_export.py` 加地标、`CHAPTER_MODELS.plague7` 加模型、`cast_mock.js` 的 `REAL` 加 `ice_youth`），然后去掉第六、七灾的 wip。
- Caroline、光膀子 Gerard、不戴帽子 Gerard 仍是程序化 / 占位。
- 第六到十灾的完整带声音通关视频还没录（要在用户电脑上）。
