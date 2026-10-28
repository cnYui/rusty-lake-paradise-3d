# 2026-10-28 锁卡提示与小红书包载入遮罩：补足点击反馈

## 起因
- 小红书玩家和审核反复反馈“点击没反应 / 点不了”。排查到两处反馈太弱的地方：
  1. 标题菜单里未解锁 / 敬请期待的章节卡，点击后只有错误音效、卡片抖一下和底部 `.menu-status` 一行小字。新号第二到第五灾都锁着，静音时几乎看不出发生了什么事。
  2. 小红书包的补丁 3c 让标题菜单提前出现；玩家选了章节后世界还要十几秒才搭好，这段时间只是把 `.menu` 设成 `pointer-events:none`、把状态行改成“正在载入，马上开始……”，画面几乎没有变化，看起来也像点了没反应。
- 另外 ▶ 开始按钮在 `resume` 为空时直接 `return`，也是“点了什么都不发生”的一种情况。

## 改了什么
- `src/core/ui.js`（`ui.menu.build()`）：
  - 点击锁着的章节卡时保留原来的错误音效、抖动和 `.menu-status` 文案（一字未改），再弹一个菜单面板：标题“未解锁”，正文“<章节label> · <标题> 要先通关<need.label.zh>才能玩。”（`need` 为空时写“这一章暂时还不能玩。”），`btn-row` 里一个“知道了”，点击后 `p.parentNode.remove()` 关掉面板。
  - 点击“敬请期待”的章节卡：标题“敬请期待”，正文“<章节label> 还在制作中，敬请期待。”，同样一个“知道了”。
  - 再点别的锁卡前先移除已有的 `.menu-panel`，避免提示叠两层。
  - ▶ 的点击在 `resume` 为空时退回 `first`（第一个开放章节 / `chapters[0]`），`first` 也为空才 `return`；“新游戏”按钮的 `first` 为空时直接 `return` 保持原样。
- `dev/minitool/build.py`（补丁 3c，被替换的原文元组第一项未动）：
  - 玩家选完章节、菜单让出点击后，给 `#stage` 加 `boot-queued` 类；`.menu-status` 的“正在载入，马上开始……”和 `.menu` 的 `pointer-events:none` 保留。
  - 世界搭好、`engine.start()` 之后，同一处同时移除 `boot-early` 和 `boot-queued`。
- `dev/minitool/minitool.css`：
  - 新增 `#stage.boot-early.boot-queued #boot:not(.error)`：`#boot` 从屏幕下方一行小字变成盖住整个画面框的半透明深色遮罩（`rgba(20,24,26,0.62)`），文字白色、居中、字号放大，转圈图标放大并改白色，`z-index: 50`（在 `.menu` 的 13 之上），`pointer-events: auto` 吃掉落点。
  - 选择器排除了 `.error`，`#boot.error` 仍走原来的报错样式；`inset` 是项目里已在用的兼容写法，没有引入 `:has()` 等新语法。
- 测试：
  - `dev/common/test_progress_browser.py`：真实点击 / 触屏 / 第三灾解锁顺序三处锁卡步骤，点完都断言弹出 `.menu-panel`、`h2` 为“未解锁”、正文包含“要先通关”，再点“知道了”并断言面板消失，然后继续原步骤。
  - `dev/minitool/test_minitool.py`：空档点击第二灾和第三灾锁卡处补同样的面板断言与关闭断言；提前点 ▶ 的分支断言 `#stage` 有 `boot-queued`，`RLP.ready` 之后没有。

## 怎么验收
- `node --test dev/plague2/test_plague2.mjs`：纯规则 / 语法回归。
- `node -e "import('./src/core/ui.js')"` 不适合直接跑（浏览器模块依赖 three 的裸导入），改用打包或浏览器测试覆盖。
- 浏览器验收入口：
  - `python dev/common/test_progress_browser.py`
  - `python dev/minitool/test_minitool.py`（需要已构建的小红书包；本次没有动 `dist` / `upload`）
- 手工看两处：空档首页点第二到第五灾，应出现“未解锁 / 敬请期待”面板且“知道了”能关；小红书包提前菜单里点 ▶ 或章节后，应看到深色遮罩、白色转圈和进度文字，世界搭好后遮罩自动消失。

## 改动范围
- `src/core/ui.js`
- `dev/minitool/build.py`
- `dev/minitool/minitool.css`
- `dev/common/test_progress_browser.py`
- `dev/minitool/test_minitool.py`
- 本记录文件

## 实际验收结果（Claude 在本机跑）
- `python dev/common/test_progress_browser.py`：84/84。
- `python dev/minitool/build.py --release --out <临时目录>` 后 `MINITOOL_DIST=<临时目录> python dev/minitool/test_minitool.py`：114/114（含新加的锁卡面板、boot-queued 遮罩断言）。这次的包只用于测试，没有放进 upload/、没有上传。
