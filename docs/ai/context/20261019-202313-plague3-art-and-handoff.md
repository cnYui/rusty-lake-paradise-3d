# 第三灾 · 蚊灾和虱灾：美术资产与逻辑交接（第一批交付）

## 用户要求
看 `docs/ai/context` 同步上下文，继续做下一章（第三灾，菜单里 `load: null`）；本会话只做“画素材、建模和写逻辑文档”，游戏逻辑和测试写进文档交给另一个 AI；人物复用已有模型；参考原作视频；中途补充：之前场景里好的模型拿来稍改后复用；之后要求先把能交付的交出去，让另一个 AI 并行开发。

## 上下文核对
- main 上第三灾没有任何实现；`refs/codex/snapshots/…`（b9b2b73，10-14 Codex 在旧基线上的第三灾尝试，未合入）只作流程参考，人物是旧做法、道具简陋，没有复用其代码。
- 逐张看了 `dev/ref/plague3/sheets/s_00..s_26`，并从原视频抽高清帧核对：滑块盒布局（26 格、圆片 2/10/20、空格 25、眼睛 12/14/22，已用 BFS 求出 23 步最短解）、蜂巢 7 孔位置、陶轮分段成形、捕蝇草、剪发与割耳、湖岸 Margaret、David 化成幼虫、神龛与回忆、神殿结尾（光束抹掉红斗篷女人、白框框住苍蝇）。
- 攻略（AppUnwrapper）：剪头发的是妹妹 Ida、被剪的是叔叔 Gerard；贻贝用铲子撬；剪刀给 Ida 后不再回到物品栏；五个成就的触发方式。
- 蜂巢出蜂顺序对孔位做了逐帧颜色采样，噪声太大无法确认，按攻略规则重建为固定链 `HIVE_ORDER`，文档注明是重建。

## 本次产出
- 文档：`docs/plague3_design.md`（逻辑契约）、`docs/plague3_api.md`（美术接口）、`docs/plague3_handoff.md`（交接）、`docs/plague3_agent_brief.md`（并行建模简报）；AGENTS.md 追加“第三灾”一节。
- 美术（已完成）：`props_p3_items.js` 19 件物品；`props_p3_shared.js`（红漆符号、头皮地图、蚊子、蚊群 `makeGnatSwarm`、按 3D 噪声长斑的蚊子覆盖层 `makeGnatCover`、陶轮造型数据 `POT`）；`props_lake.js` 画作追加 `insects` 选项、`banishWoman`、`frameFly`、`setState/getState`（默认不画虫子，第一、二灾外观不变；“没有女人”的底图把她的笔触画到丢弃画布上，随机数消耗不变）。
- 美术（第一版，待审）：`cast_p3_memory.js` 回忆一家人五个变体。
- 美术（建模中，子代理因用量限额中断后继续）：`props_p3_beach / forest / house / grove.js`、`cast_p3_hut.js`、`cast_p3_family.js`。
- 接线：`props.js` 注册五个第三灾模块 + 占位回退（CRLF 保持）；`characters.js` 并入 `CAST_P3`；`cast.js` 末尾只追加导出一批内部工具；`dev/viewer.js` 默认搜索新模块。
- 占位：`props_p3_placeholders.js`（缺的道具 id 顶上占位，带接口子物体名和空方法）、`cast_p3.js`（缺的人物回退到现有人物）。

## 验证
- `index.html?autotest=1`：`RLP.ready` 为真、`bootError` 为空、错误 0；接口里所有道具 id 都能 `makeProp`，所有人物 id 都能 `makeCharacter`。
- 物品、画作三种状态、蚊群 / 覆盖层都截图自查过（`dev/shots/p3/items/`，不进 git）。
- 未做：章节逻辑与测试（按分工交给另一个 AI）；第一、二、四灾回归（本轮改了 `props.js`、`characters.js`、画作，建议实现方回归时一并跑）。

## 遗留
- 6 个建模模块待完成，完成后统一审查截图、更新本记录和 `docs/plague3_api.md` 的偏差。
- “第三个符号”的图形查不到，木桩里先放可替换的刻痕贴图，待核对。
