# 第四灾捕鸟陷阱：猎物等待反馈

## 起因

小红书评论反馈两件事，都发生在第四灾海滩左侧的捕鸟陷阱（室外视图 `bird_clearing` → 特写 `trap`）：

- “这个盘沿怎么支不起来？退出去重进也不行。”
- “为什么点了小鸟没有反应。”

## 原因

`src/chapters/plague4/story.js` 原来的实现里：

1. 陷阱热点 `bird_trap` 的 `onClick` 永远只说 `T.trap`（“盘沿可以支起来。鸟喜欢虫子。”）。即使已经用树枝支起石板、放好虫子，玩家点石板或板下空地仍然听到同一句话，于是以为没支起来，反复退出重进也没变化。
2. 支好石板并放好虫子后鸟就出现了（`world.js` 的 `sync`），但特写里吃鸟的热点 `bird_meal` 的 `when` 是 `ready()`：要求苍蝇人已孵化（`p4_fly_awake`）且已经吃掉兔子（`p4_rabbit_eaten`）。条件不满足时点鸟，射线要么落到陷阱的大点击盒上重复 `T.trap`，要么落到鸟自己的点击盒（`world.js` 的 `fatten`）上，而鸟在 `trap` 视图里没有任何启用的热点，所以看起来“点了没反应”。
3. 兔子（视图 `rabbit`，`W.rabbit`）和寄居蟹（视图 `crab_feast`，`W.freeCrab`）走同一个 `for` 循环，有同样的问题：猎物出现但还不能吃时没有热点接收点击。

## 改法

只改 `src/chapters/plague4/story.js` 和 `src/chapters/plague4/text.js`：

- `text.js` 新增 `trapPropped`（支好石板、还没放虫）与 `trapBaited`（放好虫、还没支石板）两句；新增提示文本函数 `preyWait(id, flyAwake)`：苍蝇人没孵化时说“它还活着。得有个饥饿的东西来吃掉它。”，孵化后兔子提示先吃寄居蟹、鸟提示先吃兔子。
- `bird_trap` 的 `onClick` 按旗标组合分支：都没做说原来的 `T.trap`；支了没放虫、放了虫没支分别说新文案；都做好（鸟还没被吃）复用 `T.preyWait('bird', ...)`，与第 2 条的等待提示保持一致。
- 三个猎物的 `for` 循环里，在同一 `prey` 对象上、`${id}_meal` 之前注册 `${id}_wait` 热点。`when` 为“猎物已出现、还没被吃、且 `!ready()`”：鸟看 `p4_trap_propped && p4_trap_baited`，兔子看 `p4_rabbit_lured`，寄居蟹看 `p4_crab_round === 3`。`onClick` 用 `ctx.say(T.preyWait(...))`。`${id}_meal` 的 `when` 和进食逻辑没有改。
- `hotspots.js` 同一对象多个启用热点时取最后注册的，所以 `ready()` 时 `_wait` 关闭、`_meal` 接手；正常顺序下自动通关路线（`walkthrough.js`）点击的仍然是原来的 `_meal`，不受影响。

## 验收

- `node --test dev/plague2/test_plague2.mjs dev/plague3/test_plague3.mjs dev/plague4/test_plague4.mjs dev/plague5/test_plague5.mjs`：45/45（Claude 在本机补跑）。
- `python dev/plague4/test_plague4_browser.py`（Claude 在本机补跑）：全部通过，自动通关 133/133、真实鼠标 / 数字键 91 次交互，新增“捕鸟陷阱等待提示与吃完兔子后进食通过”，点鸟提示“苍蝇人还在别处进食。先让它吃掉兔子。”。新增的用例：
  - 用 `RLP.start(..., {view: 'trap'})` 直接进陷阱特写，旗标设为 `p4_fly_awake`、`p4_crab_eaten`、`p4_trap_propped`、`p4_trap_baited` 为真，`p4_rabbit_eaten` 为假；
  - 真实鼠标点鸟，`pickAt` 在鸟上取到 `bird_wait`，`p4_bird_eaten` 保持为假，顶部字幕条 `.band-text` 出现且包含“先让它吃掉兔子”；
  - 把 `p4_rabbit_eaten` 设为真后再点鸟，热点切换为 `bird_meal`，`p4_bird_eaten` 变真。
