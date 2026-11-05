# 第七灾冰中青年改用代码制作（2026-11-05）

## 背景

用户 11-05 说：冰块里的男人自己用代码写，参考之前的视频，冰里的人可以复用已有模型，不用等 Tripo 生成。原来的冰中青年是 `makeMockPerson` 占位（几何体拼的白色人偶），冰块是一个几乎看不见的细长圆柱，所以第六、七灾一直标着 wip，说明里写的是“还缺冰中青年的模型”。参考视频只在用户电脑上，云端按 `docs/plague6_7_design.md` 里抄下的时间码描述做：原作 10:41–11:07 冰湖上一座大冰块，里面冻着一个只穿短裤的金发青年，10:47 双臂抱在胸前；18:15–18:52 凿开后他说“天堂岛真冷啊”，戴上毛帽。

## 改了什么

- `src/art/cast.js`：
  - `manBody` 新加 `bare` 选项：衬衫身 / 袖子换成肤色平涂（`cloth(..., { flat: true })`），不画领子、门襟和纽扣，袖口卷边线也用肤色；`soleColor` 可换鞋底颜色。
  - `trousers` 新加 `shorts` 选项（0–1，裤腿到大腿的几成处，下沿封口），有 `boots` 时在短裤下面接一条肤色的光腿（靴筒当光腿用）。
  - 新 `buildIceYouth` / `CAST.ice_youth`：David 的身材和头型（`DAVID_DIMS` / `DAVID_HEAD`，脸上去掉胡茬），光膀子、到大腿中间的浅色短裤、光脚、金发、不戴帽子，身高 1.78 m。程序化人物没有 `rlpm` 模型（`modelKeyFor('ice_youth')` 为空），所以不改 `rlpm.js`。
- `src/art/cast_mock.js`：`REAL.ice_youth = () => makeCharacter('ice_youth')`，`makePerson('ice_youth')` 不再回落占位人物（`MOCK_PEOPLE.ice_youth` 保留，只作兜底）。
- `src/art/props_p7.js`：`iceBlock` 重做。外形是歪斜的长方冰块（顶部收窄、边角被削、法线按面平铺），三层半透明：背面一层带厚度（人身后的冰）、正面一层蓝白、里层白霜贴图（划痕 / 气泡 / 云雾），再加亮色棱线和脚下一圈冰碴；裂纹改成从尖木头戳点向四周放射的细线，尖木头戳在冰块左上角（不再戳在人身上）；`setState('frozen' | 'cracked' | 'free')` 和碰撞盒不变。新 `p7_fur_cap`：松鼠毛毛帽（半球 + 毛边 + 几撮毛），单位大小，章节按头缩放。
- `src/chapters/plague7/world.js`：青年用 `youth.solve(POSES.stand, …)` 把两只手分别搭到对侧上臂前面（双臂交叉抱胸），不再直接改 `parts.armL.rotation`；毛帽 `W.youthHat` 挂在头骨骼上（原来是挂在 root 上、位置按占位人偶估的）。`sync()` 和 `puzzles.js` 不用改（`youth_warm` 仍控制 `W.youthHat.visible`，热点仍用 `W.youthRig.parts.body`）。
- 文档：AGENTS.md、CLAUDE.md、`docs/plague6_7_design.md` 的人物表。

## 验证

- 截图（`views3.py`，P7 `p7_iceblock` / `p7_lake` 视图）：冻住、凿出裂纹、解冻、戴毛帽四个状态，近景脸和手，湖边远景。对比旧图：人偶变成有脸有手的 David 身材青年，冰块有蓝白色冰面、亮棱和霜，能看到人在冰里。
- `node --test dev/plague6/test_plague6.mjs dev/plague7/test_plague7.mjs`：14 项通过。
- `python dev/plague7/test_plague7_browser.py` 全过：自动通关、真实鼠标 / 数字键完整通关 100 步、4 个中途读档点（ice / skate / snowman / temple）、门禁、菜单 wip、触屏。

## 没做

- 注册表仍是 `wip: true`：第六、七灾已经没有占位人物，是否放开（以及小红书 / 口袋方舟包里的 `load` 置空、审核敏感字）由用户决定。
- 参考视频没看（只在用户电脑上），脸和体型按设计文档的描述和 David 的模型做；要对着原作再调五官 / 发型，跟用户要抽帧。
