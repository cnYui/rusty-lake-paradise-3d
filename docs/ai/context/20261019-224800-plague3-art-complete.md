# 第三灾美术资产全部完成（Sonnet 子代理收尾）

## 用户要求
“继续做第三灾的图片资产”，子代理一律用 Sonnet 5.5（省额度）。上一条记录 `20261019-211800-plague3-art-pause-status.md` 里停掉的 5 个子代理从断点恢复，另开 1 个审查回忆人物的子代理。

## 结果
所有第三灾美术模块都已做完并各自验收，章节逻辑可以只按 `docs/plague3_api.md` 开发：

| 模块 | 文件 | 结论 |
|---|---|---|
| 小屋室内（钟罩小桌、钟罩培育台、陶轮、花瓶草图） | `props_p3_house.js` | 完成 |
| 海滩 / 湖岸 / 神殿（符号石、贻贝、挖点、滑块盒、木桩、窗台盘、鹦鹉） | `props_p3_beach.js` | 完成；滑块盒随机合法滑动 400 步布局始终正确，`solve → open → takeBulb` 全流程通过 |
| 森林（捕蝇草、红叉树、土堆、蜂巢） | `props_p3_forest.js` | 完成；对照参考帧的对比图 `dev/shots/p3/forest/final_*_vs_ref.png` |
| 白桦林（布景 + 7 个道具） | `props_p3_grove.js` | 完成；入口机位 52 个 draw call、约 11.4 万三角形 |
| 小屋理发 Gerard / Ida | `cast_p3_hut.js` | 完成；四档发型、头皮地图、剪耳（表情 sour → pain → grim）、Ida 举剪刀 |
| 湖岸 Margaret / 桌边 David | `cast_p3_family.js` | 完成；拍脸、蚊子、被蚊群盖住、消失 |
| 回忆里的一家人 | `cast_p3_memory.js` | 完成；逐个对照 13:28 高清帧重做服装 / 脸 / 发型，六人合影 `dev/shots/p3/memory/final_lineup.png` |

## 我验证过的
- 7 个新文件 `node --check` 通过；`index.html?autotest=1` 启动 `RLP.ready` 为真、`bootError` 为空；控制台只有旧模块的 `toNonIndexed` / `flatShading` 两条已知警告。
- 22 个道具 id、9 个人物 id 全部是正式工厂（没有占位），接口文档里的方法名和点击盒 / 挂点名全部存在。
- `node --test dev/test_plague2.mjs dev/test_plague4.mjs dev/test_plague5.mjs`：22 个测试全过（这几个是逻辑测试，和美术文件无关，只确认没有连带破坏）。
- 逐个看过各模块的最终截图：小屋合成图、陶轮、滑块盒透视、木桩第 3 级裂纹、捕蝇草 / 红叉树对比图、白桦林全景和桌边、Gerard + Ida 构图、头皮地图俯视、Margaret 拍脸、David 被蚊群盖住、六人合影。

## 没做的（交接时要知道）
- 章节逻辑和测试：按分工交给另一个 AI。
- 第一、二、四灾的浏览器回归（`python dev/test_plague2_browser.py` / `test_plague4_browser.py`）：这轮改了 `props.js`、`characters.js` 和公共画作 `plague_painting`，实现方回归时要一起跑。
- 所有模块都只在 `dev/viewer.html` 里验证过，没进游戏；viewer 灯光偏亮，颜色和描边粗细要在章节接入后用真实镜头再核一次。
- 图形上没法 100% 还原的：“第三个符号”（占位 ⊗）、鹦鹉（参考视频里没有对应画面）、岩壁贴图（程序生成的灰蓝斜纹）、Gerard 前臂疤痕和 Nicholas 口袋盖（没做）。
- `props_p3_items.js` 的颜色是否有 Neutral 色调映射造成的偏暗偏饱和（小屋模块用 `fromRef` 反推补偿）：没有逐个核对。

## 偏差和摆放提示
已汇总在 `docs/plague3_handoff.md` §2.1（圆桌与 David 的坐位、吃饱的捕蝇草保持闭合、红叉位置、画像 `gone`、`IDA_BEHIND` 0.4、`ghostFade`、`groveRoamAt`、`update()` 必须注册等）。AGENTS.md 的“第三灾”一节里“还没做好的道具由占位顶上”改成“已全部做完，占位只作兜底”。

## 协调过程中的决定
- 子代理只改各自的文件；圆桌凳子位置是湖岸人物代理发现的不一致，由我转告白桦林代理改到 `(0, 0.45, −0.62)`，两边对齐。
- 回忆人物代理发现 Ida 小女孩按参考帧应约 1.155 m（文档写的“约 1.3 m”不符），保留了 1.155；要改是 `IDA_CHILD_H`。
- 回忆人物的半透明淡入原来像一团发黑的玻璃，新增 `ghostFade(rig)`（只写深度的替身网格）解决；少年 Jakob 来自 cast.js，章节里要手动调用一次。
