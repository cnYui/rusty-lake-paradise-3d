# 第四灾美术接口与待办逻辑

美术（`src/art/props_flies*.js`、`src/art/scale.js`、`world.js` 的布景与视图）已按参考视频和现实尺寸重做完。本文是它给逻辑层的接口契约，以及要由逻辑 / 测试补上的部分。尺寸规则见 [art_scale.md](art_scale.md)。

## 谁改什么

- **美术（冻结，逻辑与测试不要改）**：`src/art/**`、`src/chapters/plague4/world.js`、`dev/plague4/art_shots.py`、`dev/plague4/measure_scale.py`、`docs/art_scale.md`、本文件。要新的模型方法或视图，在汇报里写明，由美术补。
- **逻辑**：`src/chapters/plague4/{story,puzzles,text,walkthrough,items,index}.js`。
- **测试**：`dev/plague4/test_plague4.mjs`、`dev/plague4/test_plague4_browser.py`。

## 美术接口（全部已实现，`ctx.p4.world` 即 `W`）

| 对象 | 接口 | 说明 |
| --- | --- | --- |
| `W.fly` / `W.insideFly` | `setKneel(k)`（0 悬停 … 1 跪地进食），`kneel()` 读当前值，`update` 已登记（翅膀自己扇） | 世界 scale = 1，身高 ≈ 1.9，跪姿喙尖接近地面；`sync` 必须把它复位到 `setKneel(0)` |
| `W.cocoon` | `setOpen(bool)` | `sync` 已调用 |
| `W.rabbit` / `W.bird` | `setDead(bool)` | **`world.sync` 已管**：兔 `p4_rabbit_lured` 时出现、`p4_rabbit_eaten` 时侧躺；鸟 `p4_trap_propped && p4_trap_baited` 时出现、`p4_bird_eaten` 时翻倒。吃完后尸体留在原地，不要再隐藏 |
| `W.trap` | `setState(propped, baited, caught)` | 同前 |
| `W.window` | `tabs[0..3]`（点击对象，顺序对应纹章 `S`、箭头 `↑`、`⊖`、`△`），`dials`（`tabs` 的旧名，别再用），`slotCount = 12`，`slotCenter(i)`（0 起，窗局部坐标 `[x,y,z]` 米），`slotSize = [w,h,d]`，`setState(numbers, open, selected = null)` | `numbers` 是四枚滑片各自所在的刻度（1–12，可重叠）；`selected` 是被选中的滑片下标（抬起 + 发光）。`world.sync` 已按 `p4_window`、`p4_window_open`、`p4_window_selected` 调用它。窗外壳的缩放已烘进 `slotCenter` / `slotSize`，点击盒直接用 `ctx.hotspots.makeProxy(w, h, d, slotCenter(i), W.window)` |
| `W.book` | `setOpen(bool)`、`setSpread(i)`、`flipTo(i, ms = 420) → Promise`、`spread()`、`isOpen()`、`spreadCount = 4` | `flipTo` 带翻页动画，靠 `update` 推进（已登记）；书在桌上合着，摊开后跨页宽 0.67 m。左 / 右页在书局部坐标约 `x = ∓0.16`，页面 `0.30 × 0.40` |
| `BOOK_SPREADS` | `[{ id, title }]` 共 4 项，从 `src/art/props_flies.js` 导出 | 标题就是参考视频里的字幕：「锈湖的光辉之日终将来临」「长生不老药」「平衡你前世中的物质」「我们的记忆属于锈湖」 |
| 视图 `book` | `closeup`、`zone: temple_int`、`back: temple_int`，俯视桌上的书 | 已在 `world.js` 里定义 |

世界里的位置和相机都已按现实尺寸调好；`world.sync` 里还有：地洞里的 Gerard 一直可见（木板缝里能看到他），三块木板（`branch0..2`，原"树枝"热点）盖在坑上，寄居蟹复位朝右，蟹被吃后留下空螺壳。

### 纹章与书里的线索（谜题答案不变）

窗锁解仍是 `WINDOW_SOLUTION = [1, 3, 8, 10]`，下标对应 `tabs`：

| 滑片 | 纹章 | 目标刻度 | 书里的线索 |
| --- | --- | --- | --- |
| `tabs[0]` | `S` 形 | Ⅰ | 第 1 跨页左上角 "S : Ⅰ" |
| `tabs[1]` | 带杆箭头 | Ⅲ | 第 2 跨页右页长生不老药配方图里火堆旁 "↑ : 3" |
| `tabs[2]` | `⊖` | Ⅷ | 第 3 跨页左页顶端 "8 ⬡ ⊖" |
| `tabs[3]` | `△` | Ⅹ | 第 4 跨页左页右上角 "△ = Ⅹ" |

## 要补的逻辑（按优先级）

### 1. 窗锁改成"选滑片 → 点刻度"（`story.js`、`puzzles.js`、`text.js`）

和贝壳一样，鼠标 / 触屏统一：先点滑片选中，再点轨道上的罗马数字移过去。

- `puzzles.js` 新增纯函数并导出：`WINDOW_SLOTS = 12`，`moveTab(values, tab, slot)`（返回新数组，不改入参；`tab` 越界、`slot` 不在 1–12、`values` 不是长度 4 的整数数组时返回 `null`）。`windowSolved` 保持不变。
- `story.js`：删掉 `window_dial_*` 和 `window_confirm`（以及那块 `label('打开窗闩')`）。新增热点：`window_tab_0..3`（对象 `W.window.tabs[i]`）—— 点一下选中（`p4_window_selected = i`），再点同一枚取消；`window_slot_1..12`（用 `slotCenter` / `slotSize` 生成点击盒）—— 仅在有选中滑片时可用，点了就把该滑片移到这一刻度，写入 `p4_window`，清掉选中。每次改完调 `refresh(ctx)`，`sync` 会把状态画出来。
- **自动开窗**：每次移动后若 `windowSolved(p4_window)`，立刻走原来 `window_confirm` 里那段开窗过场（`p4_window_open`、苍蝇人飞进来带走父亲、`p4_father_taken`、进 `memory` 视图）。没解开时不做任何提示（原作如此）。`T.windowWrong` 不再用，`T.window` 改成 "点一枚纹章滑片，再点轨道上的罗马数字。它们的次序写在书里。"
- 存档兼容：旧档的 `p4_window` 数组照常能读；`p4_window_selected` 缺省视为 `null`。

### 2. 书：从弹窗改成"书"视图翻页（`story.js`、`text.js`、`walkthrough.js`）

- `book` 热点（视图 `temple_int`）改成 `goto: 'book'`（`cursor: 'zoom'`），不再调 `ctx.ui.doc`。
- 进入 `book` 视图时 `W.book.setOpen(true)`，页码取 `p4_book_spread`（缺省 0）；离开（回 `temple_int`）时 `W.book.setOpen(false)`。`sync` 必须幂等：书只在 `ctx.state.view === 'book'` 时摊开，且 `setSpread(p4_book_spread)`。
- 热点 `book_prev` / `book_next`：书局部坐标左页 / 右页上各一个点击盒（`ctx.hotspots.makeProxy(0.30, 0.06, 0.40, [∓0.16, 0.06, 0], W.book)`），点了 `await W.book.flipTo(i)`、写 `p4_book_spread`、`ctx.sfx('click')` 之类、并用 `ctx.say(BOOK_SPREADS[i].title)` 显示小字幕；第一页 `book_prev` 不可用，最后一页 `book_next` 不可用（`when`）。
- 第一次翻到任意页立 `p4_book_read`（沿用原标志）。看完最后一页不强制任何事。
- `text.js` 的 `BOOK_PAGES` 不再被 `story.js` 使用：删掉，标题改从 `BOOK_SPREADS`（`src/art/props_flies.js`）取。
- `walkthrough.js` 的书步骤改成：进 `temple_int` → 点 `book`（落到 `book` 视图）→ 连点 `book_next` 3 次 → `expectFlag p4_book_read` → 返回。别的步骤不变。

### 3. 苍蝇人进食时跪下（`story.js`）

在 `${id}_meal` 的过场里：飞到猎物上方后让苍蝇人面朝猎物（`W.fly.rotation.y = atan2(dx, dz)`），用 `ctx.animate(500, k => W.fly.setKneel(k))` 跪下，`ctx.sfx('squish')`、`await ctx.wait(450)`，设 `p4_${id}_eaten` 后再 `animate` 站起来（`setKneel(1 - k)`）。结束时 `W.fly.kneel()` 必须回到 0；`sync` 里无条件 `W.fly.setKneel(0)`（`story.js` 的 `sync` 或 `world.js` 之外的地方，不要改 `world.js`）。

## 测试要补的（`dev/plague4/`）

1. `test_plague4.mjs`（纯规则，`node --test dev/plague4/test_plague4.mjs`）：`moveTab` 的合法移动、重叠、越界 / 非法入参返回 `null`、入参不被修改；用 `moveTab` 从 `[1,1,1,1]` 走到解 `[1,3,8,10]` 后 `windowSolved` 为真；再补两条对 `src/art/scale.js` 的纯函数测试（`checkSize` 在范围内 / 外 / `exempt`，`seatedTop(1.88)` ≈ 1.43）。
2. `test_plague4_browser.py`：
   - 完整流程用新的热点 id（`walkthrough.js` 已随逻辑更新，脚本照 `RLP.chapter.walkthrough` 走，不要硬编码旧 id）。
   - 新增真实点击验收：窗锁 —— 点 `window_tab_2` 选中（`p4_window_selected === 2`，`W.window` 里该滑片抬起），点 `window_slot_5` 移动，再点错位置不会开窗，最后摆成 `[1,3,8,10]` 自动开窗；读档后选中 / 位置恢复。
   - 书 —— 真实点击 `book` → 视图变 `book`；点 `book_next` 三次，`p4_book_spread` 依次 1、2、3，`W.book.spread()` 同步，`book_next` 不可用；`book_prev` 回翻；回 `temple_int` 后书合上；读档回到 `book` 视图页码保持。
   - 进食 —— 给 `W.fly.setKneel` 套一层记录最大值，跑一遍兔 / 鸟 / 蟹进食，最大值 > 0.9 且结束时 `W.fly.kneel() === 0`；尸体仍可见（`W.rabbit` / `W.bird` 的 `visible` 为真，`W.crabRemains.visible` 为真）。
   - 尺寸验收：`python dev/plague4/measure_scale.py` 退出码 0（"布景模型超出容差：0 个"）。
3. 每次改完跑：`node --test dev/plague4/test_plague4.mjs` 和 `RLP.autoplay({stepDelay:0})`（参考现有 `test_plague4_browser.py` 的 `autoplay` 段，应 100% 通过且 `warnings` 为空）。

## 注意

- 世界里的模型一律 `scale = 1`；不要在逻辑里给模型设 `scale`。
- 新旗标只有 `p4_window_selected`（整数或 `null`）和 `p4_book_spread`（0–3），都要在 `sync()` 里支持新游戏 / 旧档 / 重复调用。
- 每次修改在 `docs/ai/context/` 新增带时间戳的中文记录，不覆盖旧的。
