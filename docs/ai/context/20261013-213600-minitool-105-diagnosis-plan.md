# 小工具 1.0.5 功能缺陷：排查与修复计划

## 已确认事实

- 用户反馈 1.0.5 被驳回，1.0.4 曾通过。2026-10-13 在创作服务平台实时核对：1.0.5 未通过，原因是“小工具功能缺陷，可能是页面按钮无法点击，重点排查页面功能完整性”；历史版本显示 1.0.4 生效中。
- 官方能力文档 https://miniapp-sandbox.xiaohongshu.com/minitool/doc 当前更新时间为 2026-10-13。要求 Chrome 61 / ES2017；脚本必须包内外置，禁止全屏、网络请求等。1.0.4 已使用相同旋转壳、兼容垫片和音频输出线路，不能仅凭这些能力限制判定本次原因。
- 工作区已有他人未提交的第二灾修改：`src/core/ui.js`、`src/chapters/plague2/world.js`、`20261012-115725-plague2-resume-point.md`。本次保留这些修改。

## 确定存在的打包回归

`dev/minitool/build.py` 的全屏补丁从 `function fullscreenSupported()` 起，一直删除到“槽位对应的按键”注释之前。第二灾开发在这个区间加入了 `wipEnabled()` 和 `chapterOpen`，因此打包时这两个定义也被删除，菜单中的调用却保留。

在临时目录使用当前源码和原打包脚本生成 release 包，并通过 `dev/shot.py` 的浏览器运行逻辑打开普通首页（没有 autotest / chapter 参数），得到：

```json
{"ready":true,"bootError":"chapterOpen is not defined","menu":{"visible":true,"shown":false,"links":0,"play":true}}
```

浏览器控制台明确报 `ReferenceError: chapterOpen is not defined`，堆栈在 `ui.menu.show()`。程序在绑定开始按钮事件之前终止，“新游戏 / 成就 / 设置”还没有创建。语法和 CSS 闸门均通过，说明静态兼容扫描不能代替首页功能验证；`RLP.ready` 为 true 也不能排除 `RLP.bootError`。

局限：本地没有标明 1.0.5 的原始上传 ZIP，后台重新上传页面只显示空白待部署预览。因此这是当前源码确定可复现、与驳回表现一致的缺陷，尚不能声称已取得审核端堆栈或核实 1.0.5 原 ZIP 的字节。

## 修复与验证计划

1. 全屏补丁只替换三个明确命名的函数，保留中间或后面新增的章节逻辑；匹配失败时停止构建。
2. 补强现有浏览器测试：普通首页必须没有 bootError，菜单和所有入口都完整显示，触摸验证成就、设置及开始。
3. 独立生成新的 release ZIP，不覆盖 1.0.4 或其它历史产物。沿用普通脚本、兼容垫片及原音频线路。
4. 对新包执行容器 CSP 下真实触摸、正常菜单、漫游以及第一灾完整 `RLP.autoplay()`，记录实际结果和限制。
5. 在 AGENTS.md 记录构建补丁边界和正常首页验证规则。仅本地修复与打包，本次没有上传或提交审核指令。
