# 小红书小工具加入第三灾：解锁顺序 + 成就核对（V1.0.10）

时间：2026-10-22 11:30

## 需求（用户）

“当前第三幕已经做完了，你发布小红书小组件，要注意用户玩的顺序：必须在第一幕、第二幕玩通关之后，才能进入第三幕。还有成就的问题，你也要看一下：这些成就是不是都能获得和保存？”

## 一、解锁顺序

- `src/chapters/index.js`：第三灾去掉 `wip`，`requires: ['plague1', 'plague2']`（数组：两章都通关才解锁）。`src/core/progress.js` 的 `requires` 支持字符串或数组，`requiredChapter()` 返回第一个没通关的前置章节，所以菜单提示按进度变：空档“通关第一灾后解锁”，只通关第一灾“通关第二灾后解锁”。
- `build.py`：不再有口袋方舟专用的第三灾注册表补丁（源码已经是这样），改成断言注册表里这条解锁条件还在；章节 setup 让出一帧的补丁三章都做；小红书包补一条把第三灾 David 台词“我今天血糖非常低.”改成“x糖”（审核对“血”字敏感，口袋方舟包保持原文）。第四、五灾仍把 `load` 置空。
- 通关结尾：通关第二灾后结尾卡出现“进入第三灾”并倒数自动进入；第二灾没通关（没立 `plague2_complete`）时结尾卡只有“返回主菜单”。`?unlock=1` / `?wip=1` 是开发入口，容器里没有 URL 参数，玩家绕不过。
- 验收：`python dev/common/test_progress_browser.py` 新增 G 段，74/74；`test_minitool.py` 新增“空档 / 只通关第一灾 / 两章都通关”的真实触摸验证。

## 二、成就：哪些拿不到、怎么修

对账方法：三章分别 `RLP.autoplay()` 通关，对比章节成就表和 `state.achievements`，再读 localStorage（`rlp3d.save.<章节>` 和 `rlp3d.profile`）。

| 章 | 成就表 | 修之前自动通关能拿到 | 问题 |
| --- | --- | --- | --- |
| 第一灾 | 5 个 | 2 个（艾兰德一家、拯救山羊） | **欢迎来到天堂岛 / 这是我 / 第一个符号 三个整个代码里没有任何 `achieve` 调用**，永远拿不到 |
| 第二灾 | 3 个 | 3 个 | 无 |
| 第三灾 | 5 个 | 3 个 | 哈维（窗台放花、再进神殿点鹦鹉）和第三个符号（斧子砍木桩 8 下后点符号）有发放点，但不在自动通关流程里，没人验证过 |

修法：
- 第一灾 `beach.js`：用虾打开天堂门 → `welcome_to_paradise`。`lake.js`：圣水盆倒影 → `its_me`（台词正好是“这是……我。”）；盖子滑开后点棺材里的符号 → `the_first_symbol`（新热点 `coffin_symbol`，点它不会进回忆，不影响主线）。旧存档读档时按旗标（`gate_unlocked` / `reflection_seen`）静默补发前两个（符号没有旗标，补不了）。
- **棺材符号原来看不见也点不到**：`props_lake.js` 把符号贴在衬里底（水面下 0.16 m），被血水盖住；改成画在水面上方，颜色改成发白的刮痕色（原来暗红在暗红衬里上看不见）。点击区要盖过水线阴影片 `coffin_shadow`，否则点击被它截走变成点棺材。
- 第三灾：`walkthrough` 加两段可选动作（`temple.harveyWalkthrough`、`lake.js` 里斧子砍木桩 + 点符号），自动通关就会覆盖到。斧子不会用掉，哈维那朵黄花拿回来后神龛还能用。
- 保存：`state.achieve` 同时写章节存档（`achievements` 数组）和玩家档案 `rlp3d.profile.ach`（带首次解锁时间、名字、章节）；“重新开始”只清章节存档，成就历史保留，“重置进度”才清全部。

新验收：`python dev/common/test_achievements_browser.py` 18/18：三章依次自动通关，每章成就表全部拿到，章节存档和玩家档案里都有，重载后成就面板第一灾 5/5、第二灾 3/3、第三灾 5/5 且都有日期；真实鼠标点出第一个符号；旧存档补发是静默的（`ui.toast` 一次都没调用）。

## 三、验证结果

- `node --test dev/plague2..5/test_plagueN.mjs`：45/45。
- `python dev/common/test_achievements_browser.py`：18/18；`python dev/common/test_progress_browser.py`：74/74。
- 打包：`python dev/minitool/build.py --release --out dev/minitool/dist-ch123-20261022-release --zip upload/xhs-minitool/rusty-lake-minitool-ch123-20261022-release.zip`，6 个文件，539184 字节（0.51 MB），es2017 闸门 [语法] 问题 0，官方审计（Skill 1.7.0 本地副本，`python -I`）PASS，0 警告。SHA256 `78fa1427…2ffc`。
- `MINITOOL_DIST=dev/minitool/dist-ch123-20261022-release python dev/minitool/test_minitool.py`：81/82，唯一一项是我写的断言有误（esbuild 把中文转成 `\uXXXX`，直接搜“血糖”搜不到）；改成搜 `血` 后单独对新包核对：整个 `game.js` 没有“血”字，David 台词是“x糖”。三章竖屏自动通关（93 / 160 / 294 步）、成就全拿到、没有 CSP 违规 / 页面错误 / 请求失败，CPU 降速 3× 仍能启动（让出主线程 95 次）。
- 包里 `Array.prototype.at (Chrome 92)` 的 14 条接口提示是误报（都是 `head.at(...)` / `tree.at(...)` 自己的方法）；第三灾新增的 `Object.fromEntries` 已被 `compat.js` 垫片覆盖。

## 遗留 / 待用户验证

- **仍是待用户验证**：平台模拟器完整验证和 Android / iOS 真机（第三灾场景比前两章更重，慢手机上的帧率和启动耗时没有真机数据）。
- 第三灾有成就叫“割耳”（Earcut，拿 Gerard 的耳朵）、剧情里有剪耳朵，审核是否敏感未知；V1.0.4 的结论只证明“血”字是问题，“死”字没单独验证。如果这次被驳回，先怀疑这几处。
- 线上 V1.0.9 玩家的第一灾存档里这三个成就以前就没发放，补发只覆盖“门开了 / 倒影看过”的存档，“第一个符号”要重新点一次。
