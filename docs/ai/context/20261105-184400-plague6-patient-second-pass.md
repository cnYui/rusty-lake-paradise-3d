# 第六灾 Gerard 病人建模第二轮与验收

## 总览（两轮合在一个提交里）

用户 2026-11-05 要求“第六灾光膀子的人物形象要真实，对照视频抽帧来做，写代码用本地的 GPT”。之前病人是穿衬衫马甲、戴毡帽的网格 Gerard，胸口是一块浮在衬衫上的米色椭圆板（`props_p6.js` 的 `chest_skin`）。这次由本机 Codex（GPT）分两轮写代码，Claude 在用户电脑上抽参考帧、写任务、审 diff 和截图：
- 第一轮（额度用完中断）：新 `src/art/p6_patient_surface.js`，按身高的胸腹截面 + 胸肌起伏给出连续曲面，人物皮肤和胸口谜题共用这套米制坐标；`cast.js` 新 `buildGerardPatient`（`makeHuman` 程序化骨架，不经过 `modelHuman`，所以不用进 `rlpm.js` 的 `PROCEDURAL`）、`CAST.gerard_patient`；`cast_mock.js` 的 `REAL.gerard_patient` 改用它并给躺姿单独的抬高和手臂；`props_p6.js` 的 `chest()` 去掉米色椭圆板（只留不可见的代理热点），疹子 / 静脉 / × / 切口 / 病心 / 空洞 / 发条心 / 缝线都贴在曲面上，切开时 `onWound` → `setChestOpen` 从身体网格挖掉切口三角形、缝合后还原；`setEyes` 喝药前闭眼、喝药后半睁，BOAR 两句台词期间 `play('talk')` 张嘴（`puzzles.js`）。
- 第二轮：就是下面记的这些外观和验收。
- 第一轮改过 `rlpm.js`（PROCEDURAL / CHAPTER_MODELS），因为云端同时在改它（第七灾 removableHat、第八灾乐手 / 螳螂），rebase 时整份撤回了，病人不依赖它。

本次在独立 worktree `p6-patient-2` 接续 `215a60b`（第一轮中断的程序化病人），先读 `CLAUDE.md`、`AGENTS.md`、当前提交完整 diff 和人物工具接口。没有提交、打包或部署；`rlpm.js`、`musician_model.js`、第七 / 八灾章节源码、人物入口和文档均未修改。`AGENTS.md` 仅整理第六灾病人说明，并按要求修正公共人物条目里的第七灾 Gerard 说明；设计文档只改第六灾病人这一行。

参考使用本机原作抽帧目录 `C:/Users/yui/AppData/Local/Temp/claude/D--CodeWorkSpace/731e2c2f-8f5c-42e0-8c6f-b60196270c72/scratchpad/p6ref/`：`full_160.jpg` 核对闭眼、黑眼圈、灰帽、粗颈宽肩、八字胡与山羊胡、胸口线稿和乳晕；`room_bed_1306.jpg` 核对平躺、红棕后脑发、圆腹和腰以下红布；`full_258.jpg`、`side_sheet.jpg` 核对左胸梭形切口、取心后的胸腔和缝合；`sheet_b.jpg`、`sheet_c.jpg` 核对喝药后黄眼白 / 小瞳孔和 BOAR 张嘴。第一轮对照为同一 scratchpad 下 `p6_wip1/sheet.jpg`。

`cast.js` 的 `buildGerardPatient` 全身皮肤基色统一为暖灰 `#cec3b6`：胸腹贴图、头骨、耳朵外侧、鼻子、脖子、手臂、手和脚使用同一基色。鼻子原本就与头骨共用 `skinMat`，不是单独白色材质，也没有镜面高光；原来的浅肤色、球形鼻尖和三档卡通明暗让鼻头看起来过亮。保留 Gerard 的鼻子参数，在本人物合并几何前把鼻头略收窄、拉长并压扁，皮肤和脸部贴花共用六级线性采样明暗渐变；不修改公共 `human.js` 或其他人物。

胸腹仍是 `p6_patient_surface.js` 的连续曲面。锁骨、胸肌下缘、胸骨中线、腋下与肩轮廓使用更粗的深棕墨线，叠加胸肌下、肋侧与腹部下缘的柔和阴影。三角肌、上臂、肘、前臂到腕部重新安排截面粗细，肩宽略增；颈部横向加粗并提高颈根，胸口曲面上缘同步加宽，形成粗短颈。手掌朝内，默认使用并拢手指、轻微弯曲的 flat 手型。原有病人不加载网格模型、默认闭眼、喝药后半睁、BOAR 期间说话和无身体 idle 的行为保留。

便帽改为稍不对称的放样布面，顶部较平、向后微垂，贴图只有两条淡布褶；底部窄卷边，底色 `#b9b5ac`。裤子压暗为 `#7d2f2b`。`props_p6.js` 的 `bed_blanket` 从腰口盖到脚外：中央随髋、腿和脚隆起，左右垂到床沿外，脚端下垂，布面有少量弯曲褶线，腹部和肚脐仍露出。第一轮截图发现膝 / 脚局部露出后，已抬高对应曲面并重新拍图。

`PATIENT_BACK_Y` 从 0.145 改为 0.124 m，`cast_mock.js` 的病人躺姿和章节原有胸口挂点共用这一常量。后脑增加 0.045 m 的向面部偏移，让低枕承托后脑；双臂后移 0.036 m 靠近床垫。读取实际变形后的包围盒：床垫顶面 y=0.520，胸背最低 y≈0.526、手臂最低 y≈0.527、臀部最低 y≈0.509（约 1 cm 的软垫压入），后脑最低 y≈0.585、枕面最高 y≈0.591。侧视图与这些尺寸一致，没有明显悬空或深陷。头 / 帽总包围盒完整落在 `p6_patient_face` 代理盒内，检查结果 `proxyContainsHead=true`，因此没有修改原热点尺寸或 id。

保留疹子 / 静脉 / × / 切口 / 病心 / 空洞 / 发条心 / 缝线与皮肤的共用坐标，疹子在锁骨与乳头之间，切口在病人左胸（俯视画面右侧）。切开仍删除人体胸部的对应三角形，缝合恢复；取心后空洞内壁略沉入皮肤。显卡图发现切口边缘少量浅色三角形锯齿，已让外圈切口唇边略高于表面、内壁再内凹，重拍确认边缘连续。所有谜题旗标、规则、热点和 `userData` 字段保持原接口。

缝合设计保留：皮肤合上、仅缝线可见、发条心藏在体内。`dev/plague6/test_plague6_browser.py` 只把 temple 读档点原有的“发条心可见”断言改为 `chest_stitches.visible` 为真且 `clockHeart.visible` 为假，其余测试逻辑不动。

显卡截图用 Claude 在本机写的 `shot_gpu.py`（scratchpad 里的临时脚本，不入库），Chromium 的 ANGLE D3D11。输出根目录为 `C:/Users/yui/AppData/Local/Temp/claude/D--CodeWorkSpace/731e2c2f-8f5c-42e0-8c6f-b60196270c72/scratchpad/p6_after2/`。`default/`、`medicine/`、`empty/`、`sewn/` 各四张（`room_side.png`、`face_top.png`、`chest_view.png`、`face_close.png`），对应默认、`medicine_given`、`{"done":true,"cut":true,"heartTaken":true}`、`{"done":true,"cut":true,"heartTaken":true,"clock":true,"sewn":true}`。`round1/` 保留第一次外观迭代，`contact/` 额外从低侧角度等待入场文字结束后拍摄。截图确认肤色与白床单明显分开、鼻子不再发白、胸口线条可辨、黄眼白小瞳孔与缝合外观符合状态，红布遮住裤腿和脚。

截图过程中第一次启动因新红布公式中 JavaScript 负号与指数运算的括号错误失败，已修正并用 `node --check` 检查。后续显卡截图 `RLP.bootError` 为空，没有页面错误；仍有两类 Three.js 提示（对已非索引几何调用 `toNonIndexed`、MeshToonMaterial 的 `flatShading` 参数），没有扩展到公共建模工具处理。

验证结果：`node --test dev/plague6/test_plague6.mjs` 为 8/8；`python dev/common/test_hints_browser.py 6` 为 23/23（第六灾提示 28 条，逐步流程无 stuck / none，广告模拟流程通过）；最后运行 `python dev/plague6/test_plague6_browser.py`，8/8 类检查全部通过，自动通关 138/138 步、真实鼠标 / 数字键 111/111 次操作、新游戏复位、倒错体液、boils / flask / teeth / temple 四处读档、门禁、普通 / wip 菜单和触屏疹子 / 物品栏均通过，没有页面错误或失败请求。详细结果在被忽略的 `dev/plague6/media/browser-results.json` 与 `autoplay.json`。自动通关仍输出 18 条热点离屏位置诊断，完整真实输入全部能找到可点击射线并通过；没有为消除诊断修改镜头或放宽验收。触屏是 Playwright 模拟，不是实体手机验收。

与原作仍有差异：这里保留实际身高和透视下的三维胸腹、鼻子与胡须体积，原作的鼻子、胡子和胸肌线条更平、更夸张；红布与便帽的褶皱是程序化概括，未逐笔复刻二维参考。房间布景和奶奶会影响侧面构图，额外侧视仅用于查看接触关系。没有调整玩法、发布解锁或第七 / 八灾内容。
