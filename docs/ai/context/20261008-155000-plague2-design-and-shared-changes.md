# 第二灾：设计文档、共享改动与进度（第二次中断）

## 分析结果
- 逐帧分析与代码梳理存放在 `dev/ref/p2/analysis/`。已完成 10 份：
  - 视频段：0:00、3:31、5:17、7:03、8:49、10:35、12:21
  - 代码梳理：core_engine_guide、world-env_reuse、chars-props_reuse
- 还没完成两份：视频 1:45–3:38（蛙卵盆的规则）、联网攻略。
  - 用 `Workflow({scriptPath: <会话目录>/workflows/scripts/plague2-understand-wf_80a68112-2e5.js, resumeFromRunId: 'wf_80a68112-2e5'})` 继续，已完成的 10 份会直接复用缓存。

## 设计
- `docs/plague2_design.md`：全章流程、地点、谜题规则、旗标、视图、物品和成就。
  - 已写全的谜题：睡莲叶 5 关（布局和解法）、Ida 吹笛变色、厨房煮汤、Gerard 吐钥匙、箱子回忆、转盘锁。
- `docs/plague2_api.md`：道具（props_p2.js）、角色（characters_p2.js）、章节三者之间的接口约定。

## 本轮修改
- `src/main.js`：
  - `ensureChapter` 发现本页已装载别的章节时直接报错，不再叠加。
  - 菜单切换章节靠 sessionStorage 重载（上一份记录写的机制）。这一点仍未在浏览器里实际点过菜单验证，因为第二灾入口还没打开。
- `src/art/props_frogs.js`（新文件），已在 `props.js` 和 `dev/viewer.js` 注册：
  - 青蛙 `makeFrog({color})`，支持 setColor / hop / croak / idle，每只 2 个 draw call。
  - 物品：bowl、frog_soup、bowl_key、candle、wood、belt、frog_flute。截图在 `dev/shots/p2/`。
- `src/art/mist_p2.js`（新文件）：森林雾带，1 个 InstancedMesh 绕 y 轴面向相机。还没接进场景。
- `src/art/props_lake.js`：
  - 画新增 `cleanStream()`、`banishFrogs()`（光线抹掉青蛙）、`frameWoman()`（白框框住红斗篷女人）。
  - `paintPlagueBase` 增加 `{frogs}` 参数。
  - 截图：`dev/shots/p2/painting_end.png`。
- 物品栏扩到 12 格：
  - `src/core/state.js`：MAX_SLOTS=12，新增 COLUMN_SLOTS=6。
  - `src/core/ui.js`：第 7–12 格是第二列，超过 6 件时 `#stage.inv-wide` 自动展开；按键 1–9、0、-、=。
  - `styles.css`：展开后的第二列放在 z-index 19，压在暗角和方向箭头上面。
- 和其它会话的约定：
  - “游戏控制优化”会话：等物品栏改完再部署，我已通知他们改完了。
  - “第三灾”会话：只用 `_p3` 命名空间，物品栏接口已告知。

## 验证
- 第一灾 `RLP.autoplay()` 91/91 通过，`plague1_complete` 为真，无错误。
- 数字键 1/6/7/9/0/-/= 都能选中对应格；两键合成正常；物品满 12 件时再给会被拒绝。

## 下一步
1. 补全蛙卵规则（恢复 workflow）。
2. 按 `docs/plague2_api.md` 并行实现：
   - `props_p2.js`（棋盘、蛙卵盆、厨房、神殿家具、木柴）
   - `characters_p2.js`（先在 characters.js 末尾导出 CHAR_KIT）
   - `src/chapters/plague2/*`
   - 新音效
3. 接入：`chapters/index.js` 的第二灾 load、`context.js` 的成就、`ui.js` 的粉笔图标。
4. 截图对照参考帧；跑 `RLP.autoplay()`。
