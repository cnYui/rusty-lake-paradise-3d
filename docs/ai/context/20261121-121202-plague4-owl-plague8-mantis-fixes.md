# 第四灾猫头鹰喂心、第八灾螳螂点击：小红书评论排查与最小修复（2026-11-21）

## 起因

小红书评论两条：

1. 第四灾猫头鹰木雕「心脏还没喂完就满了」，补充「先放心脏再放螺肉就好了」。
2. 第八灾「盒子一直解不开」与「大螳螂怎么没反应」。

按要求只在 `src/chapters/` 定位和修复，不改 `src/core/`、`dev/minitool/`、`vendor/`、打包脚本；不跑浏览器测试。

## 第四灾：猫头鹰喂心

### 原因

`src/chapters/plague4/story.js` 里两只翅膀是**两个独立热点**（`owl_wing_l` / `owl_wing_r`），公共 `hotspots` 的 `busy` 只按热点 id 去重。放好一颗心后先后点左、右翅膀，两段 `W.owl.flap()` 会同时播放；两个回调都在动画开始前读到同一个 `p4_owl_loaded`，动画结束后各加一次 `p4_owl_count`。结果一颗心计成两颗：

- 第一颗心后 `count` 可能已经是 2，液面按 `fed * 4 / 3` 被抬到第 3 格，看起来像快满了；
- 第二颗心后 `count` 到 3，第三颗心再放到嘴里时被 `count >= 3` 分支拒绝（`noItem`），玩家卡在“还有一颗心喂不进去”。

另外 `W.owl.setLevel()` 内部会四舍五入，`fed * 4 / 3` 在第二颗（2.67）时直接取整成 3；即使没有双击翅膀，液面也会提前跳到第 3 格。

### 修复

- `sync()` 的液面改为 `Math.min(4, Math.floor(fed * 4 / 3))`：三颗心对应 0 / 1 / 2 / 4，只有第三颗之后才到 4。
- 给左右翅膀加一把共享的 `owlWingBusy` 锁（`try/finally` 释放）：一次只结算一颗心，另一只翅膀在动画期间的点击直接忽略，不再重复计数。任意放入顺序（蟹肉 / 兔心 / 鸟心）仍然走同一套 `onItem`，不依赖顺序。

## 第八灾：木盒与螳螂

### 螳螂：确认的点击 bug，已修

合唱结束的过场停在 `p8_locusts` 特写里，螳螂就在这个镜头里从树后站起来；但 `p8_mantis` 热点只登记在漫游视图 `ROAM` 里，`p8_locusts` 不在其中。玩家刚看到孵出的螳螂直接点它时，当前视图没有这个热点，完全没反应（该特写里蝗虫、卵鞘的热点又都已随 `mantis_awake` 关闭）。

修复：`p8_mantis` 的 views 改为 `[...ROAM, 'p8_locusts']`；`when` 条件（`mantis_awake && !horn_given`）和状态旗标本身没有问题，不改。

### 木盒：未确认热点 bug，未改

逐项检查了 `src/art/props_p8.js` 的木盒和 `src/chapters/plague8/puzzles.js` / `world.js` 的注册：

- 三个滑块点击盒 0.066 × 0.05 × 0.06 m，三列点击盒 0.069 × 0.03 × 0.25 m；在 `p8_box` 特写里投影后仍远大于触屏 44 px，不算太小。
- 滑块在滑轨前缘（z≈0.14），列点击盒在后面（z≈-0.045），两者不重叠；从特写机位（前上方）到列的射线从滑块上方越过，不会被滑块挡住。
- `p8_slider_*` / `p8_col_*` 的 `when` 都是 `!box_open`，`box_held` 用 `Number.isInteger` 判断（0 也能正确识别），`box_slots` 初始为 `BOX_START`，开盒后置 `box_open`，旗标链路完整。
- `rules.js` 的六列与三个乐手属性一一对应，答案 `[2, 0, 1]` 可达；`moveSlider` 的 120 个状态从开局全部可达，没有死局。

因此「盒子一直解不开」不能确认是热点 / 规则 bug；更可能是玩家没看清（或错过只显示一次的）木盒刻痕说明、或不理解“点滑块拿起、再点一列放下 / 互换”的操作。没有确凿证据，按“不能确认的不要乱改”未改木盒。若后续能拿到玩家录屏，再决定是否把提示常驻或放大刻痕。

## 验收

- 修改文件：`src/chapters/plague4/story.js`、`src/chapters/plague8/puzzles.js`。
- `node --test --test-isolation=none dev/plague4/test_plague4.mjs dev/plague8/test_plague8.mjs dev/plague2/test_plague2.mjs dev/common/test_hints.mjs`：67 通过，0 失败。
- 说明：本机沙箱禁止 `node --test` 派生子进程（`spawn EPERM`），所以用等价的 `--test-isolation=none` 在同一进程跑同一组测试文件；没有跑浏览器测试。
