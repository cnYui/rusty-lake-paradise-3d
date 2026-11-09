# 第十灾：戴野鸡面具的 Ida 换成网格模型（2026-11-03）

## 背景

用户 11-02 往资料库传了 15 个 Tripo 低面版 GLB（8 个天堂岛 + 7 个旅馆客人）。天堂岛那 8 个里，只有文件名叫“锈湖天堂岛-猫头鹰头伊丽莎白”的还没进游戏。按渲染出的正面 / 侧面图对照原作第十灾 37:24–38:24 的抽帧：棕色泡泡袖长裙、白领子、深色长袜，头上是棕红色带白斑的鸟头，和原作“Ida 戴野鸡面具”一致，不是猫头鹰，也不是第一灾回忆里那个 1.3 m 的 Elizabeth（身材是成年女性）。所以把它做成第十灾戴上面具以后的 Ida。

## 改了什么

- `dev/common/models/retopo_bake.py`：这批低面版导入后是侧着的（面朝 +x、两臂沿 y），后面绑骨骼要“面朝 -y、两臂沿 x”。按包围盒自动判断（y 向宽度 > 1.25 × x 向就绕 z 转 -90°），判断不了的在 `ROTZ` 里写死。glTF 导入的物体是四元数旋转模式，要先 `rotation_mode = 'XYZ'`，否则 `rotation_euler` 不起作用（第一次转了个空）。
- `dev/common/models/rig_export.py`（CRLF）：`CFG` 加 `owl_headed_character`（key `pheasant`，H 1.58，裙装 `dress=True`，露出的长袜 + 鞋整块跟脚走 `foot=(0.12, 0.12)`；头骨顶取面具里的估计 0.97 T，面具顶在 0.995 T）。
- 新文件 `src/art/models/pheasant.rlpm`（约 600 KB）+ `pheasant.jpg`（2048²，q86，约 840 KB）。云端用 `/home/claude/bpyenv` 的 bpy 跑同样两个脚本生成。
- `src/art/rlpm.js`：`MASKED` 加 `ida_pheasant: 'pheasant'`，`CHAPTER_MODELS.plague10` 加 `pheasant`。
- `src/art/cast.js`：新 `buildIdaPheasant()`（`CAST.ida_pheasant`），有模型就直接用网格人物（不再往上挂程序化的头巾、青蛙），没有模型时回退成程序化 Ida 戴 `setMask('pheasant')`。
- `src/art/cast_mock.js`：`REAL` 加 `ida_pheasant`。
- `src/chapters/plague10/world.js`：`setupFamily` 里 Ida 和其他四人一样建一个 `W.masked.ida`（`ida_pheasant`），`syncFamily` 去掉原来给真身 Ida 套面具的那一行，改成真身 / 戴面具版本二选一显示。
- `src/chapters/plague10/puzzles.js`：给 `W.masked.ida` 补热点 `p10_ida_masked`（和其他戴面具的人一样，点了说 `T.maskedTalk`）。
- 文档：`dev/common/models/README.md` 对照表和云端跑法、`AGENTS.md`（第九十灾、网格模型两节）、`docs/plague9_10_design.md`（戴面具一节和人物表）。

## 验证

- 截图核对：林间空地、Ida 特写、侧面、神殿栅栏前五个人全戴上面具（`dev/common/shot.py` + scratchpad 里的 `views3.py`），身高和其他人对得上，面具顶不穿帮，裙摆跟腿走、鞋在脚下。
- `node --test` 第二到十灾 + `dev/common/test_hints.mjs`：118 项全过。
- `python dev/plague10/test_plague10_browser.py`：自动通关 170 步、真实鼠标 / 数字键完整通关 119 步、8 个中途读档点（arrow / bones / face / hex / letters / masks / stove / temple）、门禁和拿错东西、菜单 wip、触屏，全过，无页面错误、无请求失败。

## 还没做的

- 第六灾瘟疫医生、第七灾冰中青年还是 `makeMockPerson` 占位，用户要自己去 Tripo 生成（需求清单和原作截图在共享文件夹 `rusty-lake-paradise-3d/models-todo/`），拿到后照这次的流程转。
- 第一灾回忆里戴鸟面具的 Elizabeth（1.30 m）、第十灾戴猫头鹰面具的 Elizabeth 仍是程序化；`pheasant` 是成年女性身材，不拿来缩小凑数（模型一律 `scale = 1`）。
- 小红书 / 口袋方舟包不带模型文件（见 AGENTS.md「网格人物与动物模型」），第十灾在包里本来也是置空的。
