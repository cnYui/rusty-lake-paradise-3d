# 2026-10-24 小红书包：第三灾球茎点击盒 + 第四灾鸟陷阱修复，合并成一个包

## 起因

用户让我把“点击范围变大一点”交给 dsh 工人去写、我来验收，并和另一个会话（“树枝支撑和虫子放置bug”，第四灾鸟陷阱）同步后一起提交小红书。

## 分工与同步

- 第三灾（本会话）：commit `4382901`、`da347bb`，文件 `props_p3_grove.js`、`plague3/grove.js`、`plague3/world.js` 和 `20261024-174000-plague3-larva-bulb-pick-fix.md`。
- 第四灾陷阱（另一会话，没 commit，等它的用户点头）：`props_flies.js`、`plague4/story.js`、`20261024-183000-plague4-trap-prop-worm-fix.md`。`plague4/world.js` 的 diff（`crab_board` 进出时藏 / 显苍蝇人）是第三个会话的，不属于任何一边。
- 约定：另一会话不自己提交小红书，它 17:52 打的 `rusty-lake-minitool-ch1234-trapfix-20261024-release.zip` 不含第三灾球茎改动，弃用；由本会话统一打包、统一提交。

## dsh 工人

- run `20261024-175538-acae`，1 个任务 `bulb-hit`，81 秒、5 次工具调用，只改 `props_p3_grove.js` 三行数字（球茎盒 0.64 × 0.5 × 0.64、嘴盒 0.34 × 0.46 × 0.46），`node --test dev/plague3/test_plague3.mjs` 15/15。工人把我写的“身体盒要罩住头”那半句注释顺手删了，我补回来了。浏览器验收工人跑不了，由主会话做。
- 先 commit 再派：worktree 只含已提交文件，所以先提交了第一轮改动。

## 验证

- 漫游 / 特写两种视图，手机横屏 844×390：球茎中心周围 ±60 px 探点全是球茎；真实触摸偏 30 px / 20 px 都拿到球茎（漫游里有一次超时是机器上别的浏览器在跑，重跑两次通过）。
- `python dev/plague3/test_plague3_browser.py`：35 项全过，最后的首页菜单测试第一次因同机别的 Playwright 在跑、`RLP.ready` 等了 30 秒超时；单独重跑 `test_menu`（超时放到 150 秒）4 项全过。
- 打包：`python dev/minitool/build.py --release --out dev/minitool/dist-ch1234-bulbfix-20261024-release --zip upload/xhs-minitool/rusty-lake-minitool-ch1234-bulbfix-20261024-release.zip`，es2017 语法 0 处，6 个文件，0.55 MB（572077 字节），SHA256 `e4fb0b2c5a60c260d7ac4872dfcbff26f93b7e1d98874864088d24eeb3f8e898`。包里 grep 到球茎盒 `[.64,.5,.64]`、嘴盒 `[.34,.46,.46]`、球茎热点 `views:["p3_david","p3_grove"]` 和陷阱代理 `makeProxy(.6,.32,.42,…)`，两边的修复都在。

- 测包：`MINITOOL_DIST=dev/minitool/dist-ch1234-bulbfix-20261024-release python -u dev/minitool/test_minitool.py`，第一次跑到 55 项通过后在截图步骤超时（同机别的 Playwright 在跑）；重跑 106/108，失败的两项都是第 5 节“真实触摸连点左上角 5 下打开排查面板 / 点面板关闭”。
  **这两项是时间敏感的抖动，不是新改动引起的**：只跑第 5 节（把 `test_minitool.py` 的头部 + 第 5 节拼成临时脚本）时，bulbfix 和上一版 trapfix 交替各跑几次，结果跟着机器忙闲翻来翻去——最后一轮 bulbfix 8/8 通过（5 下点击各 0.13–0.43 s），trapfix 反而失败（第一下点击等了 2.05 s，5 下超出 2 秒窗口，面板没打开）。两个包的 `rotate.js` / `style.css` / `compat.js` / `index.html` 逐字节相同，`game.js` 只差上面三个点击盒数字。
- 官方审计脚本没单独跑（`build.py` 自带的语法 / 接口扫描：语法问题 0 处）。

## 未完成

- 上传 / 发布：Claude in Chrome 插件一直显示 “not connected”（重试几次都一样），没有上传、没有点发布。插件连上后：创作者中心先看 V1.0.12 是否还在审核，再“更新版本 / 重新上传”传这个 zip，勾选规范、点“发布小工具”（用户这次明确说了要用插件提交）。
- 口袋方舟没动（用户没提）；另一个会话的第四灾文件和本包没有 git commit。
