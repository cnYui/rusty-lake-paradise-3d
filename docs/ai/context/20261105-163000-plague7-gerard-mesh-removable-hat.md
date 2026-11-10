# 第七灾 Gerard 换成网格模型，帽子能从网格上摘下来（2026-11-05）

## 起因

用户（11-05）：第七灾不戴帽子的 Gerard 如果帽子不影响，就用戴帽子的（网格 Gerard）。
帽子是有影响的：第二支冰淇淋给完，Gerard 把帽子送给玩家（`hat_taken`），之后他头上不能还有帽子。
以前因为网格 Gerard 的帽子和头是同一块网格、摘不下来，`gerard_p7` 列在 `rlpm.js` 的 `PROCEDURAL` 里，一直用程序化 Gerard。

## 做法

`src/art/rlpm.js` 新加 `removableHat(rig, key, opts)`，给网格人物加 `rig.setHat(on)`：

1. 拆帽子（`splitHat`，每个模型只算一次，缓存在模型上）：把模型贴图缩到 512² 读像素，
   顶点按颜色分四类（浅色皮肤 / 棕色头发眉毛胡子 / 帽子灰 / 很暗的墨线）。从头骨骼上方 0.16 m 以上的三角形（全是帽冠）开始，
   沿共用顶点（按位置焊接）的相邻三角形往下“长”，只经过灰色和墨线色的三角形，碰到头发、皮肤就停，低于头骨骼 −0.02 m 不再长。
   这样帽冠、帽带、整圈帽檐（后面压得低的那一截也算）都能拆干净，额头、眉毛、两侧和脑后的头发留着。
   Gerard 的头部网格 10164 个三角形，拆出约 3300 个。
2. 帽子底下原本没有头皮（网格是空壳），剩下的额头边缘是锯齿状的：再用一个前高后低的发际线斜面
   `y = 0.047 + 0.2·z`（头骨骼局部坐标）把斜面以上的三角形也拿掉，剪口变成一圈齐的斜椭圆。
3. 补头发：半个椭球（再往下多 0.12π 的向里收的裙边，塞进头部网格里堵缝），按剪口下 1.5 cm 内剩下的顶点拟合中心和半径，
   跟发际线一样前高后低，冠高 0.085 m；贴图用 `hairStrands('#8a5530', '#4e2d1c')`，UV 从头顶平面投影（发丝从前往后梳，
   头顶不会出现球面贴图收成一点的纹）。挂在头骨骼上，随头一起动。
4. `setHat(false)`：头部蒙皮网格的索引换成不含帽子 / 斜面以上三角形的那份，头发显示；`setHat(true)` 换回完整索引、藏头发。
   贴图没读到、拆不出来时保持戴着。没有模型（`?models=0`、小红书包）时不加 `setHat`。

接入：

- `rlpm.js`：`PROCEDURAL` 去掉 `gerard_p7`，第七灾的 Gerard 走网格 `gerard`。
- `cast_mock.js`：`gerard_p7: () => removableHat(withIdle(gerardBody('gerard_p7')), 'gerard')`。
- `plague7/world.js` 的 `sync`：有 `setHat` 就 `setHat(!hat_taken)`，否则照旧 `showTag('hat', …)`。
  网格人物不能调 `showTag('hat')`：网格人物的 `tags.hat` 就是整颗头，会把头藏掉。
- `p7_gerard` 特写镜头往后、往上挪（`[gr+1.5, 1.42, +0.62]` 看 `[gr, 1.2, gr]`），网格 Gerard 坐着帽顶约 1.6 m，原来的镜头切掉了帽子。
- `props_p7.js` 的 `p7_hat`（送出的帽子、物品栏、雪人头上）从棕色软呢帽改成和他头上一样的灰色圆顶礼帽（圆冠、卷边帽檐、深灰帽带），
  不然头上灰色、拿到手变棕色。原作第七灾的帽子是棕色，但这个重制版里 Gerard 各章戴的都是这顶灰色礼帽。

对照原作（`P07` 13:15–14:30）：送出帽子后 Gerard 露出姜棕色、往后梳的头发，补上的头发颜色和形状照这个做。

## 验证

- 正面 / 侧面 / 背面 / 俯视在 `dev/common/cast.html?ids=gerard` 里看过：帽子拆干净，没有锯齿和空洞，额头、眉毛、耳朵、脑后头发都在。
- 第七灾 `p7_gerard`（戴帽 / 摘帽）、`p7_room`、侧面、雪人截图核对。
- `node --test dev/plague6/test_plague6.mjs dev/plague7/test_plague7.mjs`：14 通过。
- `python dev/plague7/test_plague7_browser.py`：exit 0（自动通关 128 步、真实鼠标 / 数字键完整通关、中途读档 skate / ice / snowman、门禁、菜单 wip、触屏）。
- `python dev/common/test_hints_browser.py 7`：23/23 通过。
