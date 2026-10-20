# 第四灾：窗锁改选滑片、书改视图翻页、进食跪下

- 日期：2026-10-21
- 任务：把第四灾章节逻辑接到已重做的 `props_flies` 美术接口上，不改 `src/art/**`、`world.js`、`index.js`、`items.js`、`src/core/**`、`dev/**`。
- 参考契约：`docs/plague4_art_api.md`（美术接口与要补的逻辑）。

## 改动文件

- `src/chapters/plague4/puzzles.js`
- `src/chapters/plague4/story.js`
- `src/chapters/plague4/text.js`
- `src/chapters/plague4/walkthrough.js`
- 本记录

## 实现

### 1. 窗锁（选滑片 → 点罗马数字）

- `puzzles.js` 新增并导出 `WINDOW_SLOTS = 12` 与纯函数 `moveTab(values, tab, slot)`：返回新数组、不修改入参；`tab` 不在 0–3、`slot` 不在 1–12、`values` 不是长度 4 的整数数组时返回 `null`。`windowSolved` 未改。
- `story.js` 删除 `window_dial_*`、`window_confirm` 和 `label('打开窗闩')`。
- 新增 `window_tab_0..3`：对象为 `W.window.tabs[i]`，点击写入 `p4_window_selected = i`，再点同一枚写 `null`，随后 `refresh(ctx)`。
- 新增 `window_slot_1..12`：用 `ctx.hotspots.makeProxy(slotSize[0], slotSize[1], slotSize[2], W.window.slotCenter(i - 1), W.window)` 生成点击盒；`when` 同时要求窗未开且有选中滑片。点击后用 `moveTab` 写 `p4_window`、清空选中、`refresh`，未解开时不弹提示。
- 移动后立即检查 `windowSolved(next)`；解开则执行原 `window_confirm` 的开窗过场：`p4_window_open` → 苍蝇人飞入带走父亲 → `p4_father_taken` → `memory` 视图。
- `text.js` 的 `T.window` 改为“点一枚纹章滑片，再点轨道上的罗马数字。它们的次序写在书里。”，删除 `T.windowWrong`。

### 2. 书（book 视图翻页）

- `book` 热点（`temple_int`）改为 `goto: 'book'`、`cursor: 'zoom'`，不再调用 `ctx.ui.doc`。
- 进入 `book` 视图的 `onEnter`：`W.book.setOpen(true)` + `setSpread(p4_book_spread || 0)`；`onExit`：`setOpen(false)`。包装时保留视图原有回调。
- `story.sync()` 幂等：`ctx.state.view === 'book'` 时摊开并按 `p4_book_spread`（越界夹到 0–3）设置页码，否则合上。
- 新增 `book_prev` / `book_next`，点击盒为 `makeProxy(0.30, 0.06, 0.40, [∓0.16, 0.06, 0], W.book)`。翻页：`await W.book.flipTo(i)` → 写 `p4_book_spread` 与 `p4_book_read` → `ctx.sfx('click')` → `ctx.say(BOOK_SPREADS[i].title)`。第一页 `book_prev` 不可用、最后一页 `book_next` 不可用（`when`）。
- `story.js` 改从 `../../art/props_flies.js` 导入 `BOOK_SPREADS`；删除 `text.js` 的 `BOOK_PAGES`。
- `walkthrough.js` 的书步骤改为：点 `book` → `expectView: 'book'` → 连点 `book_next` 三次 → `expectFlag p4_book_read` → 返回；窗锁步骤改为选滑片再点刻度，最终仍自动开窗进入 `memory`。

### 3. 苍蝇人进食跪下

- `${id}_meal` 过场中，飞到猎物上方后先按 `Math.atan2(target.x - start.x, target.z - start.z)` 面朝猎物，再 `ctx.animate(500, k => W.fly.setKneel(k))` 跪下；`squish` 音效与 `wait(450)` 后写 `p4_${id}_eaten`，再 `animate(500, k => W.fly.setKneel(1 - k))` 站起；最后 `refresh`。过场结束时 `W.fly.kneel() === 0`。
- `story.sync()` 开头无条件 `W.fly.setKneel(0)`，支持新游戏、旧档和重复调用。
- 逻辑里没有给任何模型设置 `scale`。

## 验证

1. 纯规则测试：沙箱禁止 Node 子进程管道，直接 `node --test dev/plague4/test_plague4.mjs` 报 `spawn EPERM`；设置 `NODE_OPTIONS=--test-isolation=none` 后运行同一条命令，得到 **11/11 通过、0 失败**。执行过一次 `danger-full-access` 升级尝试，但本会话没有审批通道。`node --check` 四个改动文件均通过。
2. 自动通关：`python dev/common/shot.py ... --js RLP.autoplay ...` 未能启动。Playwright 启动子进程时在 Windows 管道创建处报 `PermissionError: [WinError 5] 拒绝访问`；直接启动 Chrome / Edge 也因沙箱禁用命名管道（mojo `platform_channel.cc` FATAL）失败。按新 walkthrough 展平计算为 **133 步**（旧为 138），但本会话没有拿到 autoplay 的真实运行结果。
3. 浏览器验收：`python dev/plague4/test_plague4_browser.py` 同样在 `sync_playwright()` 启动阶段被管道权限拦下，未执行到页面逻辑；不是脚本自身失败。
4. 自定义 JS：同样无法用 `shot.py` 运行。作为替代，用 Node 的模块解析桩替换 `world.js` / `props_flies.js`，对 `story.setup()` 生成的热点做了无浏览器流程验证：
   - 点 `window_tab_2` 后 `p4_window_selected === 2`，再点取消为 `null`；点 `window_slot_5` 后 `p4_window === [1,1,5,1]` 且选中清空；依次摆成 `[1,3,8,10]` 后 `p4_window_open === true`、`p4_father_taken === true`，视图到 `memory`。
   - 进入 `book` 后书为开；`book_next` 三次后 `p4_book_spread === 3`、`p4_book_read === true`、`book_next` 不可用；退出后书合上；`sync` 在 `book` 视图重新摊开到第 3 页。
   - 蟹进食过场中 `setKneel` 最大值为 1，结束时 `kneel() === 0`，朝向为 `atan2(dx, dz)`。

## 待办 / 需要美术或 world.js 补的东西

- 本次不需要美术或 `world.js` 新增接口，现有 `tabs` / `slotCenter` / `slotSize` / `setState` / `setOpen` / `setSpread` / `flipTo` / `spread` / `isOpen` / `BOOK_SPREADS` / `setKneel` / `kneel` 已够用。
- 由于本机沙箱无法启动浏览器，仍建议在可运行 Playwright 的环境补跑 `shot.py` 自动通关、`test_plague4_browser.py` 以及真实 `W.book` / `W.window` 的浏览器验收；当前逻辑已按契约实现并通过上述桩验证，但不等同于真实浏览器结果。
