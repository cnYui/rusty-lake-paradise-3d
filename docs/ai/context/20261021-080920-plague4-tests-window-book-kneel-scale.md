# 第四灾：窗锁 / 书 / 进食跪下 / 现实尺寸的测试补齐

- 时间：2026-10-21 08:09:20
- 范围：只改测试，不动 `src/**`、其它 `dev/**`、其它 `docs`。
- 依据：`docs/plague4_art_api.md` 的“测试要补的”一节。

## 改动文件

1. `dev/plague4/test_plague4.mjs`（追加，保留原有 11 个测试）
   - `moveTab`：合法移动返回新数组、只改指定滑片、入参不变；两枚滑片可同刻度；`tab ∈ {-1,4,1.5,'1'}`、`slot ∈ {0,13,2.5,'3'}`、`values` 长度不是 4 / 含非整数 / 非数组时返回 `null`；`WINDOW_SLOTS === 12`。
   - 从 `[1,1,1,1]` 用 `moveTab` 摆到 `[1,3,8,10]`：对四步移动做全排列（24 种顺序），逐步核对 `windowSolved` 只在四枚全对时为真；`tab0` 本来就在 Ⅰ，`[0,1]` 是空操作，因此其余三枚先摆对时允许提前满足全对条件。
   - `scale.js` 纯函数：`checkSize` 范围内 / 范围外 / `exempt` / 数值项 + `tol` / 缺省项不检查；`seatedTop(1.88) ≈ 1.43`；`HUMAN` 七位人物身高与 `AGENTS.md` 一致；`REAL.p4` 每项有非空 `note`，且要么 `exempt: true`，要么至少一个 `w/h/d` 且数组范围 `lo < hi`、数值项为正。
2. `dev/plague4/test_plague4_browser.py`（在 `run()` 内追加，保留原有断言）
   - 进食：完整流程前给 `W.fly.setKneel` 套记录最大值的包装（`window.__kneelMax`）；流程后断言最大值 `> 0.9`、`W.fly.kneel() === 0`，并断言 `W.rabbit.visible`、`W.bird.visible`、`W.crabRemains.visible` 都为真。
   - 窗锁：新游戏 `RLP.goto('window',{instant:true})`；真实点击 `window_tab_2` 选中并核对抬升、再点取消；`window_slot_5` 移动；错位组合 `[2,4,9,11]` 不开窗；选中滑片存档，按“新游戏 → 写回 localStorage → `RLP.state.load('plague4')` → `RLP.chapter.sync` 两次”读档并恢复位置 / 选中；真实点击摆成 `[1,3,8,10]` 后自动开窗，核对 `p4_window_open`、`p4_father_taken` 和 `memory` 视图。
   - 书：真实点击 `book` 进视图；`book_next` 三次依次为 1/2/3，模型 `spread()` 同步，第 3 页 `book_next` 不可用；`book_prev` 回 2；`ArrowDown` 回 `temple_int` 后书合上；再 `RLP.goto('book',{instant:true})` 页码 2 且摊开。
   - 尺寸：`subprocess` 运行 `dev/plague4/measure_scale.py`，工作目录取仓库根（由 `__file__` 推算），退出码必须 0 且输出含“布景模型超出容差：0 个”。
3. 本记录。

## 源码接口核对

- `puzzles.js`：`WINDOW_SLOTS = 12`、`moveTab`、`windowSolved`。
- `story.js`：`window_tab_0..3`、`window_slot_1..12`、`p4_window` / `p4_window_selected` / `p4_window_open` / `p4_father_taken`；`book`、`book_prev`、`book_next`、`p4_book_spread` / `p4_book_read`；`W.fly.setKneel` / `kneel`。
- `world.js`：`W.window.tabs[i]`、`W.book`、`W.rabbit`、`W.bird`、`W.crabRemains`，以及 `world.sync` 对尸体 / 空壳的可见性恢复。
- `props_flies_book.js`：`setOpen` / `setSpread` / `spread` / `isOpen` / `flipTo`；滑片选中时 `position.y` 抬升 0.06（外层缩放进 `slotCenter` / `slotSize`）。

## 验证结果

1. `NODE_OPTIONS=--test-isolation=none node --test dev/plague4/test_plague4.mjs`：通过 19 个，失败 0 个（原有 11 + 新增 8）。
2. `python -m py_compile dev/plague4/test_plague4_browser.py`：通过。
3. `python dev/plague4/test_plague4_browser.py`：本沙箱禁止 Playwright 启动浏览器，在 `sync_playwright().__enter__` 创建子进程管道时即报 `PermissionError: [WinError 5] 拒绝访问`，页面尚未打开。
4. 单独运行 `python dev/plague4/measure_scale.py` 同样在上述 Playwright 启动处失败，退出码 1；因此浏览器验收与尺寸输出都需要由能启动浏览器的环境补跑。
5. 未发现被测代码的确定性 bug；上述浏览器行为均按源码接口静态核对，动态结果以上游补跑为准。
