# 233 乐园版：提示按钮（第一步）

## 背景

用户拿到 233 乐园的两个接入 Skill（`233-leyuan-iaa-ad` 激励视频广告、`233-leyuan-iap` 内购），决定先做广告：页面上加一个“提示”按钮，点了看广告，看完提示下一步该做什么；只上 233 乐园版。

Skill 要点（影响后面的实现）：

- `MetaH5Ad.showAd(adType, callback)` 没有时长参数，广告多长由平台决定；能设置的只有前端等回调的超时（`timeoutMs`，默认 120 s，建议不低于 90 s）。
- 一次广告会多次回调：`status` 0（展示）、3（点击）是过程态，只有 `status === 4` 才发奖励；1 关闭、2 跳过、-1 失败都不发奖励。要有一次性结算（`settled`）。
- 只有后端注入 `window.__PM_BUILD_PROFILE__ === 'fast'` 才是预览环境，才允许 mock；禁止 `alert/confirm/prompt`，要用应用内弹框。
- Skill 是 TypeScript（Vite 工程），本项目是原生 JS，后面要把 `RewardAdService.ts` 改写成 JS。

## 这一步做了什么（只有按钮，还没接广告）

- `src/core/leyuan.js`（新）：`isLeyuan()`，`window.__RLP_233 === true` 或 URL 带 `?leyuan=1` 才为真。233 乐园打包时在 `index.html` 里先写 `window.__RLP_233 = true`；开发时用 `?leyuan=1`。
- `src/core/ui.js`：在设置齿轮旁建灯泡按钮 `.hint-btn`（`bulbSVG()`），`ui.setHintButton(on)` 切 `#stage.hint-on`，`ui.init` 里按 `isLeyuan()` 设置。点击时锁定 / 浮层打开则忽略，否则 `emit('hint-request')`，后面由监听方接“看广告 → 给提示”。
- `styles.css`：`.hint-btn` 默认 `display: none`，`#stage.hint-on` 才显示；位置在齿轮左边（桌面 `left: 69.85em`，触屏 `left: 69.2em`，z-index 20 盖在展开的物品栏上）；`#stage:not(.inv-on)` 时和齿轮一样隐藏。

## 验证

- 浏览器预览（`?chapter=1&view=beach_mid&fresh=1`）：
  - 带 `&leyuan=1`：按钮显示在齿轮左边，`RLP.bootError` 为空，`__RLP_ERRORS` 为 0；连点两下 `hint-request` 发出 2 次；`ui.lock()` 期间点击不发事件；触屏样式下按钮（886–919 px）与齿轮（920–959 px）不重叠。
  - 不带 `leyuan=1`：按钮 `display: none`，`#stage` 没有 `hint-on`。
- 没跑 `RLP.autoplay()`：这次只加了界面按钮，没动章节逻辑。没在真机 233 乐园里验证。

## 下一步（待用户确认）

1. “提示内容”：每章每个阶段“下一步该做什么”的文案，数据放哪、按 state flags 怎么判断当前阶段。
2. 把 `RewardAdService.ts` 改写成 `src/core/` 下的 JS，点按钮 → 游戏内确认框（说明要看广告、有取消）→ `showRewardVideoAd()` → 只有 `status === 4` 才显示提示。
3. 233 乐园专用打包（`index.html` 注入 `__RLP_233` 和 `metah5ad_v1.min.js`），线上路径里不能出现 `/vendor/`。
