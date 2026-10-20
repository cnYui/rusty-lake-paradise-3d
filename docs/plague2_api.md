# 第二灾 · 模块接口契约（道具 / 角色 / 章节之间）

通用约定（同第一灾）：
- 1 单位 = 1 米；道具原点在地面（或挂点），正面朝 +z；物品原点在中心、长轴沿 +x、“图标面”朝 +z。
- 改变状态的方法都返回 Promise，最后一个参数可以是 `{ instant: true }`（直接跳到终态，供 `sync()` 读档恢复）。
- 动画只用 `src/core/tween.js` 的 `animate / wait`（跟随 `engine.timeScale`），每个方法最好是**一个** animate 任务
  （多段用 `seg(k, a, b)` 分段），这样 viewer 的 `&call=` 不会死锁。
- 每帧更新用 `obj.update(dt, t)`；章节用 `ctx.register('prop', id, obj)` / `ctx.register('char', id, rig)` 注册后核心每帧调用。
- 可点部件用透明点击盒：`material.visible=false` 时必须加 `userData.proxy = true`，或者用 `colorWrite:false` 的不可见材质
  （热点会跳过 `visible=false` 的物体）。点击盒不要做进物品模型里（会影响图标包围盒）。
- 颜色材质用 `toon()`（带描边）；贴图材质的基色用 `#ffffff`（否则贴图会被基色相乘变暗）。

---

## A. 第二灾场景道具（三个文件，`props.js` 已注册，id 重复会在控制台警告）

- `src/art/props_p2_lake.js`：A1 `lily_board`、A2 `spawn_basin`
- `src/art/props_p2_house.js`：A3 `cauldron`、`side_table`、`chest`、`memory_frame`
- `src/art/props_p2_temple.js`：A4 `temple_stool`、`dial_cabinet`、`wood_pile`

### A1. `lily_board` —— 睡莲叶俯视棋盘（放在湖面上）
```
makeProp('lily_board', { cell = 0.55, cols = 6, rows = 5 })
```
- 原点 = 格子 (0,0) 的中心，x 向右是列增加，z 向 +z 是行增加（第 0 行在北/画面上方：章节相机从南边上空俯视，画面上方是 -z…
  **注意**：为了让俯视画面里第 0 行在上方，相机位于棋盘上方、`up` 方向朝 -z。棋盘本身：第 c 列第 r 行的中心 = `(c*cell, 0, r*cell)`）。
- 叶子：圆形带 V 形缺口的睡莲叶（普通 #79926c，可跳时变亮 #7bc65a，黑描边），直径约 0.85×cell，缺口朝向随机且缓慢自转。
  用一个 InstancedMesh（最多 12 片）。
- 石头：不规则灰色六边形 #979996（侧面 #8c8c86），表面刻细“+”（随机旋转），比叶子略高出水面。
- 木桩：圆形，中心浅木 #a47c50、外圈木板环 #8a6238，刻倾斜“+”。
- 青蛙：`makeFrog()`（props_frogs），俯视时就是从上往下看它；跳跃用 `frog.hop()`。
- 方法：
  - `setLevel(def, { instant })`：`def = { start:[c,r], goal:[c,r], goalKind:'stone'|'stump', pads:[[c,r],...] }`。
    新叶子和终点从小点放大长出来（依次，约 1 秒）；起点是一块石头，青蛙蹲在上面。
  - `setHighlight(cells /*[[c,r],...]*/)`：这些格子变亮（叶子变亮、石头发白），其余恢复。
  - `jumpTo([c,r], { instant })`：青蛙跳到该格（1 或 2 格），离开的那块（叶子或起点石）先变深灰 #43474a 再淡出下沉（约 0.75 秒）。
  - `fail({ instant })`：整块压暗约 0.5 秒（棋盘自己做一层暗化，或返回后由章节调 `ui.fade`），之后由章节调用 `setLevel` 重来。
  - `win({ instant })`：（第 5 关后）青蛙从木桩上消失（缩小淡出），棋盘只剩木桩。
  - `cellWorld([c,r]) → Vector3`：该格中心的世界坐标（章节用来放点击盒）。
  - `frog`：棋盘里的青蛙对象（漫游时远处可见的那只就是它）。
  - `update(dt, t)`：叶子缓慢自转、下沉动画。

### A2. `spawn_basin` —— 浅木盆 + 蛙卵
```
makeProp('spawn_basin')
```
- 宽浅椭圆木盆：外径约 1.5 m × 1.05 m，高约 0.18 m；三层同心木色盆沿（#b08840 → #795b32 → #5c4923），黑描边；
  盆里是灰褐浑水 #85817d，带焦散光斑和斑点。
- 12 堆蛙卵（浅灰青 #a2b6b5 的一团团小圆卵，每颗中间一个黑点，像一小撮气泡堆），位置（盆内归一化坐标 u,v ∈ [-1,1]，
  u 向右 = +x，v 向下 = +z，取自视频 S13）：
  ```
  1:(-0.14,-0.62) 草:左右   2:(0.18,-0.73) 无      3:(0.47,-0.62) 草:右
  4:(-0.26,-0.33) 无        5:(0.10,-0.42) 无      6:(0.59,-0.29) 无
  7:(-0.49,-0.02) 草:右     8:(0.33,-0.14) 无      9:(-0.03,0.09) 草:右
  10:(0.47,0.20) 无         11:(-0.24,0.32) 草:右  12:(0.18,0.47) 草:左右
  ```
  （u,v 分别乘以盆内半轴 0.62 m / 0.4 m 得到局部 x,z。）“草”是深绿 #42653d 尖叶直立的芦苇丛，长在蛙卵旁边。
- 方法：
  - `setClump(i /*1..12*/, on, { instant })`：蛙卵堆沉下去（先压扁、再沉到水下消失，约 0.6 秒）/ 浮上来（矮 → 回弹，约 0.6 秒）。
    旁边的芦苇跟着那一堆一起沉浮。
  - `press(i)`：被点时的小反馈（压扁回弹，0.3 秒）。
  - `clumpWorld(i) → Vector3`。
  - `showFrog(on, { instant })`：水下深色青蛙剪影往上游 → 头浮出水面（青蛙 `basin_frog` 是一只 `makeFrog()`，只露头）。
  - `hideFrog()`：拿走后消失。
  - `showVision(on, { instant })`：水面浮现半透明（约 40%）单色的年轻男子（短棕发、浅灰蓝衬衫、深色长裤、系腰带，双臂下垂）
    和他右后方的鹿头人（白色大鹿角、浅棕鹿脸、浅色宽袖长袍、双手交叠在腹前）——画在水面上的 canvas 贴图（unlit 透明），
    男子先显现、鹿头人后显现（约 1.5 秒）。
  - 子物体：`basin_water`（点水）、`basin_rim`、`clump_1..12`（每堆一个组，组里带透明点击盒）、`basin_frog`。

### A3. 厨房道具
- `cauldron`：参考 `dev/common/ref/p2/analysis/chars-props_reuse.md` 第 7A 节的骨架，外观按视频：
  灰紫陶锅 #a18f8d（阴影 #6c605e），上段外翻锅口 + 肩，中间一道折线，下段鼓腹；锅口里暗色液面 #524948；
  4 根细铁腿 #7c7a74 立在椭圆形砖砌火圈 #a08770（一块块土黄砖）上；锅高约 0.75 m，锅口直径约 0.6 m。
  方法：`setWood(bool)`、`setLit(bool)`（火苗橙黄 #d08f1d，焰心偏红，摇曳）、`setFrogs(n 0..4)`、
  `dropFrog(frogObj)`（青蛙先停在搅棍顶端再跳进锅）、`glow(on)`（锅口白色放射光线 + 沿搅棍的竖直光柱，约 5 秒后自己减弱）、
  `steam(on)`（点火后锅口冒细白汽）。子物体：`cauldron_pot_hit`、`cauldron_fire_hit`、`cauldron_stick_top`（搅棍顶端的挂点，章节放青蛙用；搅棍本身由 Margaret 拿着，见 B3）。
- `side_table`：三脚小圆木桌 #998066，桌面直径约 0.45 m，高约 0.55 m。挂点 `table_top`。
- `chest`：小木箱 #8e644c（边条更深），约 0.42×0.32×0.3 m，正面中间一块金色锁片 #d8a020 带黑色锁孔。
  方法：`open({instant})`：箱盖向后掀起到竖直。子物体：`chest_hit`、`chest_inside`（方块飘起的起点）。
- `memory_frame`：墙上的黑色手绘矩形框（四条粗黑线，像窗框），方法 `draw(k 0..1, {instant})` 按 底边 → 右边向上 → 顶边向左 → 左边 的顺序描出，
  `erase({instant})` 倒放。尺寸参数 `{ w = 1.3, h = 1.25 }`。原点在框的下边中点，贴墙放。

### A4. 神殿道具
- `temple_stool`：浅木三腿凳 #ad9476，凳面直径约 0.45 m、高 0.45 m。挂点 `stool_top`（放腰带）。
- `dial_cabinet`：深棕木柜 #6e5948，约 0.55 宽 × 1.0 高 × 0.4 深，短腿，顶板外伸；门板上部雕三圈同心圆（转盘锁）。
  - 方法：`setRing('mid'|'out', step, { instant })`（中圈每步 45°、外圈每步 30°，顺时针为正，动画 0.35 秒）、
    `solve({instant})`（锁中心变成实心灰圆盘 #4d4f4c）、`open({instant})`（门消失，露出深灰柜膛 #323431，里面躺着一支蛙笛）、
    `takeFlute()`（柜里的笛子消失）。
  - 转盘的图案（钟面方位，0° = 12 点，顺时针为正，下表是**解开时**的位置）：
    - 外框固定：9 点外侧“=”两条短横线；3 点外侧“—”一条短横线。
    - 外圈：3 点一条径向短线；9 点两条平行短线“//”；环上刻一个淡淡的双向弧形箭头。
    - 中圈：12、3、6 点各一个向外伸的销子（短线 + 外端黑圆点）；9 点一个底边贴内侧、尖朝外的三角；环上刻淡双向箭头。
    - 内圈（固定）：12、6 点向内的短刻线；9 点一个尖朝圆心的三角。
    - 中心孔：没解开时空心木色圆圈。
  - `step` 是从**解开位置**算起的步数：解开 = 中圈 0、外圈 0。章节的初始值：中圈 +3（顺时针多 135°），外圈 −4（逆时针 120°，即 8）。
  - 子物体：`dial_mid_hit`、`dial_out_hit`（环形点击区）、`cabinet_door_hit`、`cabinet_flute`。
- `wood_pile`：一堆交叉摆放的深棕木棍 #5c3f29（6–8 根），约 0.9×0.5 m。方法 `take({instant})` 消失。子物体 `wood_pile_hit`。

---

## B. 第二灾角色（`src/art/characters_p2.js` 汇总注册；`chars_p2_gerard.js`：gerard；`chars_p2_ida.js`：ida、caroline；`chars_p2_family.js`：margaret_cook、david_p2）

`characters.js` 末尾已导出 `CHAR_KIT`（全部构建工具 + 现有角色构建函数，见文件末尾）和 `registerCharacter(id, builder)`。
每个 `chars_p2_*.js` 导出 `BUILDERS = { id: () => rig }`；`characters_p2.js` 把它们注册进 `makeCharacter`。
章节只需 `import '../../art/characters_p2.js'`（副作用注册），之后 `makeCharacter('gerard' | 'ida' | 'caroline' | 'margaret_cook' | 'david_p2')`。
viewer 的 `?char=` 已自动加载 characters_p2.js。
每个 rig 同第一灾的 CharacterRig（root 脚在 y=0、面朝 +z；parts；headTop；play；update；setExpression…）。

### B1. `gerard`
- `swallowKey({instant})`：右手从头顶举起金钥匙晃两下，仰头张嘴，钥匙落进嘴里，闭嘴咽下，回正，手放回兜里（约 6 秒）。instant = 直接回到待机（钥匙不可见）。
- `drinkSoup({instant})`：碗（`frog_soup` 模型）悬在他头顶右上方倾斜，一道细绿汤柱倒进张开的嘴里，他闭眼仰头；然后碗消失，他瞪圆眼睛（`setExpression('shock')`，瞳孔变小点）。
- `holdBowl(on, {instant})`：弯腰前倾，双手把碗（`bowl` 模型）捧在胸前，瞪眼。
- `vomit({instant})`：紧闭双眼皱眉，嘴里吐出一道亮绿液柱流进碗里（约 1 秒）；之后直起身，眼皮半垂，右手托碗在腰前（`setExpression('tired')`）。碗变成装着绿液的样子。
- `bowlObj`：他手里的碗（Object3D，章节在上面挂点击盒或直接当热点）。
- 姿势默认：双手插兜，身体微侧。表情：neutral（眼皮沉重）/ shock / squeeze / tired / blink。

### B2. `ida`
- 参考 `chars-props_reuse.md` 第 7B 节骨架。少女身高约 1.5 m。
- `frog`：头顶的青蛙（`makeFrog({color:'lime'})`，头朝左），`setFrogColor(name, {instant})`（跳一下换色）、`croak()`、`showFrog(on)`。
- `holdFlute(on, {instant})`：闭眼，双手竖握蛙笛在嘴边（吹奏姿势 A）；`playPhrase({instant})`：吹一个乐句（约 1.2 秒：
  姿势 B 头略低侧、笛子往左下偏、换指法，然后回 A），同时由章节发音符特效。
- `openEyes(on)`：吹奏中睁眼（灰白眼、小灰瞳、面无表情）。
- `stopPlaying({instant})`：放下笛子、双手下垂（笛子消失），睁眼。
- `talk(ms)`：张嘴说话一会儿（或用 `play('talk')`）。
- `headTop`：思考泡锚点（在青蛙上方）。

### B3. `margaret_cook`
- `buildMargaret({standing:true, id:'margaret_cook'})` + 一根长木搅棍 #c49a5a（双手竖握，下端插进锅里），`stir` 循环（棍子在锅里画小圈，身体轻微前后）。
- `stickTop`：搅棍顶端的 Object3D（青蛙先停在这里）。
- 表情一直愁苦（neutral）。

### B4. `caroline`
- 成年女性，身高约 1.6 m；条纹包头帽（蓝绿 #4f8f8a / 米 #e5dccb / 锈红 #9a4a30 相间）+ 红棕发箍；
  浅蓝长袖 #a1c3c4、棕色方领背心裙 #8b5e49、棕长裙 #6b4b3c（深色竖向褶线）；细长脸，平静严肃。
- 双臂抱着襁褓婴儿（白布 #e1e3e0，下缘锯齿刺绣边；粉白小脸，嘴张成 C 形像在哭）。
- `rock` 循环（轻轻摇晃婴儿）；`setOpacity(a)`（回忆淡入淡出，复用 rig.setOpacity）。

### B5. `david_p2`（在第一灾 David 的基础上扩展，`buildDavid()` 之后挂新东西）
- `eatFrog({instant})`：约 2.4 秒：嘴里鼓出绿色 → 一只青蛙头朝下从嘴里滑出挂在胸前（后腿还含在嘴里）→ 他（画面右侧那只手）拉开裤腰，青蛙钻进裤子 → 回到待机（双手插兜坏笑）。
- `setBelt(on, {instant})`：系上棕色皮腰带（带黄铜方扣），表情变愁苦（`setExpression('sad')`：眉毛微抬、睁大眼、嘴角下撇微张），之后待机不再坏笑。
- 鱼竿保持 `'none'`。

---

## C. 章节（`src/chapters/plague2/`）

- 旗标、视图 id、热点 id 见 `docs/plague2_design.md`。
- `puzzles.js` 导出纯逻辑：`LILY_LEVELS`、`lilyTargets(state, from)`、`DIAL`、`spawnRule…`，章节和测试共用。
- walkthrough 用公开路径打通全章，结尾断言 `plague2_complete`。
