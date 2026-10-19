# 第二灾：断点记录（用量上限，子代理已全部停止）

## 本轮完成
- **核对工作区**（10-12）：我 10-08 加的共享改动都完好（12 格物品栏、`registerCharacter` / `CHAR_KIT`、`props.js` 模块合并、画的 `cleanStream` / `banishFrogs` / `frameWoman`）。第一灾 `RLP.autoplay()` 91/91 通过。
- **章节骨架已完成并验证**（`src/chapters/plague2/`）：`index.js`（开场标题、结尾卡）、`world.js`（布景、全部视图、导航热点、厨房漫游区域）、`items.js`、`text.js`、`puzzles.js`、四个待填充的部分（`beach/forest/house/temple.js` 是带详细 TODO 的空壳）。
  `index.html?autotest=1&chapter=2` 下 `RLP.autoplay()` 20/20 通过（导航冒烟；一条无害警告：house_int 里 house_exit 在屏幕外）。
- **接入**：
  - `src/chapters/index.js`：第二灾 `load` 已指向 `./plague2/index.js`，并带 `wip: true`。菜单仍显示“敬请期待”，只有 URL 带 `?wip=1`（或 localStorage `rlp3d.wip=1`）才可选；`?chapter=2` 开发跳转不受影响。**完工后删掉 `wip: true`**。
  - `src/core/ui.js`：菜单用 `chapterOpen(c)` 判断；`CHALK_ICONS` 新增 `the_first_frog`、`reflection_in_the_water`、`a_rusty_key` 三个成就粉笔图标（图标本身还没截图看过）。
  - `world.js`：`temple_door` 相机改到门前西南 8 m（第一灾那个机位在神殿圆柱里面，是黑的）。
- **子代理简报**：`docs/plague2_agent_brief.md`（规则、验证流程、从原视频用 ffmpeg 抽密帧的命令、报告格式）。
- 菜单已实测：默认第二灾“敬请期待”，`?wip=1` 变“蛙灾”可选。

## 没做 / 要继续
8 个后台子代理在刚开始读简报时被停掉，**没有写过任何文件**（六个模块文件仍是空壳，也没有新分析文件）。下面每项都按 `docs/plague2_agent_brief.md` + `docs/plague2_api.md` 重新派：

| 模块 | 负责文件（只改这个） | 要做什么（参考帧 f_NNNN = 第 NNNN−1 秒） |
|---|---|---|
| props-lake | `src/art/props_p2_lake.js` | `lily_board`（f_0046–54、f_0502–37、f_0555–99）、`spawn_basin`（f_0108–13、f_0350、f_0625） |
| props-house | `src/art/props_p2_house.js` | `cauldron`、`side_table`、`chest`、`memory_frame`（f_0634、f_0746、f_0797–821、f_0635–59、f_0747–57） |
| props-temple | `src/art/props_p2_temple.js` | `temple_stool`、`dial_cabinet`（转盘锁，看 `video_331-524.md` 约 4:00–4:50）、`wood_pile`；f_0673–82、f_0826–27、f_0674–75 |
| char-gerard | `src/art/chars_p2_gerard.js` | `gerard`（f_0058、f_0060–79、f_0610–19、f_0765–82、f_0791） |
| char-ida | `src/art/chars_p2_ida.js` | `ida`、`caroline`（f_0084、f_0086–106、f_0311–24、f_0442–45、f_0454、f_0803–16） |
| char-family | `src/art/chars_p2_family.js` | `margaret_cook`、`david_p2`（f_0020–34、f_0480–97、f_0724–37、f_0635–46、f_0747–54） |
| 分析 | `dev/ref/p2/analysis/video_145-338.md` | 视频 1:45–3:38：**蛙卵盆的完整规则**（设计文档 3.3.1 还是空的）、成功表现、水面幻象、成就 |
| 联网调研 | `dev/ref/p2/analysis/web_research.md` | 限时 25 次调用：蛙卵规则、Ida 变色机制、攻略、成就（上次这个代理 90 分钟没产出） |

之后：
1. 独立审查每个模块（对照参考帧 + `plague2_api.md` 契约），原作者修复。
2. 填四个章节部分（beach / forest / house / temple），按各文件顶部 TODO 和设计文档第 3 节；`puzzles.js` 里蛙卵规则（`SPAWN`）等分析回来后补。
3. 完整 `RLP.autoplay()`（结尾断言 `plague2_complete`）、第一灾回归 91/91、输入 / 触屏回归；音效已有 21 条（`20261008-200244-plague2-audio.md`），审查没做。
4. 完工：删 `wip: true`；要不要让第一灾页面的成就面板也列出第二灾成就（`context.js` 静态 import `plague2/text.js` 的 `ACHIEVEMENTS`）。

## 注意事项（踩过的坑）
- **工作区 `src/` 里第一灾的文字现在是“x灾 / 装有x的壶 / 流x”**：另一个会话（小红书审核实验，`20261012-113000-red-x-experiment.md`）直接改的共享目录。**此时部署 aaccx.pw 会把“x灾”发到线上**，部署前先确认。
- 那个会话会从备份“整批还原”`src/` 里 14 个文件（含 `src/chapters/index.js`、`characters.js`、`props_lake.js`、`styles.css`）。我改过 `chapters/index.js`，之后每次动手前先 `ls -la --time-style=full-iso` 看有没有被还原；子代理简报里已禁止它们改这些文件。
- 小红书小工具打包会带上 `src/chapters/plague2/`，其 es2017 语法闸门需要重新检查。
- 无头浏览器里动画和淡入只有约 1/3 速度：截图时等 7–15 秒，或在页面里调 `RLP.timeScale`，不要把“偏暗 / 标题少一行”当 bug（本轮就被这个骗过一次）。
- 没有 git；`shot.py` 每次起空闲端口，并发安全。
