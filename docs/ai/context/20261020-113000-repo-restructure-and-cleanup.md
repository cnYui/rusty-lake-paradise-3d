# 目录整理：公共 / 每章 / 发布包分开，清理第一至第三灾的抽帧和截图

时间：2026-10-20 11:30

## 用户要求

1. 找第二灾完整的游玩录像。
2. 清理第一、二、三灾开发时抽的帧和查看效果的截图。
3. 把目录整理成“公共部分（3D 素材、所有章节的参考视频）+ 每章独立的文件夹 + 最外层的 docs 和 CLAUDE.md（说明每个文件夹做什么）+ 单独的 upload 文件夹放各章压缩包”。

## 第二灾录像

`dev/plague2/media/demo/plague2-demo.mp4`（原来在 `dev/shots/plague2/demo/`）：1920×1080、30 fps、含声音，9 分 57 秒，143 MB；同目录有 960×540 的手机预览 `plague2-demo-preview.mp4`（14.5 MB）。出处是 `20261018-203500-plague2-demo-recording.md`。第二灾的 40 秒预告片在 `dev/plague2/media/trailer/plague2-trailer.mp4`。第一灾通关录像 `dev/plague1/media/demo/plague1-demo.mp4`（3 分 51 秒），第三灾 `dev/plague3/media/demo/plague3-demo.mp4`（12 分 55 秒）和预览 `dev/plague3/media/preview/plague3-preview.mp4`。

## 清理（都是 `.gitignore` 忽略的本地文件，共约 450 MB）

| 删掉的 | 大小 |
| --- | --- |
| `dev/shots/` 根目录 85 张第一灾时期的效果截图（除第五灾的 `p5_*.png`） | 约 70 MB |
| `dev/shots/buildings, characters, core, environment, props_beach, props_inner, props_lake, cast`（第一灾美术、人物重做时的看图） | 约 20 MB |
| `dev/shots/p2`（第二灾的看图、场景、验收截图）、`p2ref`（参考帧）、`p3`（第三灾逐视图截图、验收截图） | 约 150 MB |
| 第一、二、三灾 `demo/` 里的联系表、`qa`、`rec`、`baseline`、`tmpf`、`dbg_*.png`、`preview/sheets`、`preview/work`、`onsets.npy`、调试用的 `state_*.json` | 约 10 MB |
| `dev/ref/p1`（777 张）、`dev/ref/p2/frames` + `sheets`（870 张）、`dev/ref/plague3/` 的 891 张抽帧 | 约 200 MB |
| `dev/promo/frames` 和 `check*.jpg`、`s_*.jpg`、`sheet_*.jpg`、`_cmp.png`（第一灾宣传片的检查图） | 约 6 MB |

保留的：各章的通关录像、预告 / 预览 / 宣传片成片和 BGM、`report.json`、第四 / 五灾的截图和抽帧（用户只要求清第一至第三灾）、`dev/shots/progress`（存档功能的验收截图）、宣传片的发帖用图 `post_shots`、`dev/common/ref/p2/analysis/`（第二灾的视频分析笔记和转盘追踪脚本）、`dev/common/ref/plague3/code_core.md`。抽帧需要时用 ffmpeg 从参考视频重抽。

## 新目录（旧 → 新）

游戏本体 `index.html`、`styles.css`、`src/`、`vendor/` **没有动**：部署脚本、小红书打包、所有章节的 import 都依赖这个布局；`src/art`（3D 素材，全是程序化建模代码）和 `src/core`（引擎）就是“公共部分”，`src/chapters/plagueN/` 本来就是每章独立的逻辑文件夹。整理的是 `dev/` 里平铺的工具、测试、录像和各种产物。`docs/` 里文件的位置也没动（源码注释里有几十处指向 `docs/plague2_*.md`、`docs/plague3_*.md`，搬了就全断），只把里面的 dev 命令换成新路径。

| 旧路径 | 新路径 |
| --- | --- |
| `dev/ref/` | `dev/common/ref/` |
| `dev/shot.py`、`demo_recorder.py`、`viewer.html/js`、`cast.html/js`、`buildings_test.html/js`、`deploy_mac.sh`、`deploy_mac.example.sh`、`test_progress_browser.py` | `dev/common/` 同名 |
| `dev/test_plagueN.mjs`、`dev/test_plagueN_browser.py`（N = 2–5） | `dev/plagueN/` 同名 |
| `dev/record_plague{1,2,3}_demo.py`、`make_plague2_trailer.py`、`make_plague3_preview.py`、`shots_plague3.py` | `dev/plague1 / 2 / 3 / 3 / 3 /` 同名 |
| `dev/shots/plagueN/`（demo、trailer、preview） | `dev/plagueN/media/` |
| `dev/shots/p2/verification`、`p3/verification`、`p3/ch` | `dev/plague2/media/verification`、`dev/plague3/media/verification`、`dev/plague3/media/views`（脚本新输出目录；旧内容已删） |
| `dev/shots/p5_*.png` | `dev/plague5/media/` |
| `dev/shots/progress` | `dev/common/media/progress` |
| `dev/shots/purple, red-x, red2orange`（小工具图标实验） | `dev/minitool/media/` |
| `dev/promo/` | `dev/plague1/promo/` |
| `dev/minitool/*.zip`、`dev/minitool/_old/*.zip` | `upload/xhs-minitool/`、`upload/xhs-minitool/_old/` |
| `ark-upload.zip`（项目根）、`dev/minitool/rusty-lake-ark-20261014.zip` | `upload/ark/rusty-lake-ark-20261014.zip`（两份 MD5 相同，只留一份） |
| `dev/ark-upload/home-16x9.jpg` | `upload/ark/home-16x9.jpg`；详情截图 4 张复制到 `upload/ark/screenshots/` |
| `tests/`（空目录）、`dev/__pycache__` | 删除 |

旧记录里写的旧路径不改（历史记录不覆盖），按上表对照。`.gitignore` 改为忽略 `dev/common/ref/`、`dev/*/media/`、`dev/plague1/promo/`、`dev/common/deploy_mac.sh`，另加 `.playwright-mcp/`。

## 改动的文件

- 新增：`CLAUDE.md`（目录地图，用 `@AGENTS.md` 引入项目约束）、`upload/README.md`（发布包索引）、本记录。
- 脚本路径：`shot.py` 的 `ROOT`（上两级 → 上三级）；`viewer / cast / buildings_test` 的 import map 和 `../src` → `../../`；各章 `test_*.mjs` 的 `../../src/chapters/`；`test_*_browser.py`、`shots_plague3.py` 先把 `dev/common` 加进 `sys.path` 再 `from shot import serve`，截图输出改到本章 `media/`；`record_*_demo.py`、`make_*` 的 `ROOT` 改 `parents[2]`、输出改 `dev/plagueN/media/`；`deploy_mac*.sh` 的 `cd` 多上一级；`dev/minitool/build.py` 的 zip 默认写到 `upload/xhs-minitool/`；`make_icon.py` 的场景图默认路径。
- 文字：`AGENTS.md`、`README.md`、`ARCHITECTURE.md`、`docs/plague2_*.md`、`docs/plague3_*.md` 里的命令和路径换成新的；`src/art/props_p3_*.js` 等 7 个文件注释里的 `dev/ref`、`dev/viewer` 路径。只改注释，没有改代码。
- 没有 `git mv`、没有提交（工作区里还有别的会话没提交的改动，混在一起不好拆）。提交时用 `git add -A` 加上新目录和删除的旧路径，git 会按内容识别为重命名。

## 验证（都在新位置上跑）

- `node --test` 第二至第五灾规则测试：37/37。
- 浏览器验收全部通过、页面零报错：`python dev/plague3/test_plague3_browser.py`、`dev/plague2/test_plague2_browser.py`（160 步自动通关 + 真实鼠标 / 触屏 + 读档）、`dev/plague4/test_plague4_browser.py`、`dev/plague5/test_plague5_browser.py`。
- `python dev/common/test_progress_browser.py`：第一次 52/53，失败的是“成就面板按章节分组只有第一、二灾两组”——第三灾注册进菜单（`achievements: ACH3`）后面板多了第三组，和目录整理无关；断言改成只检查前两组，重跑 53/53。
- `dev/common/shot.py` 截 `dev/common/cast.html?preset=family`、`viewer.html?prop=owl_totem`：import map 和 `../../src` 都能加载（人物身高对照图正常）。
- 所有 `dev/` 下的 Python 脚本 `py_compile` 通过；`record_plague{1,2,3}_demo.py`、`make_plague{2,3}_*.py` 的 `--help` 通过（模块级 import 了 `common/shot.py` 和 `demo_recorder.py`）；`bash -n dev/common/deploy_mac.example.sh` 通过，它的 `cd` 落在项目根；`make_plague3_preview.py` 用新路径重新剪了一遍预览，35.47 秒，和原来一致。
- 没有重跑：`record_*_demo.py` 的完整录制（路径已按 `parents[2]` 核对，第三灾的 `--fast` 在整理前跑过）、`dev/minitool/build.py` 的完整构建（`ROOT` 没变，只改了 zip 默认目录）、`test_minitool.py`、公网部署。
- 旧路径核查：`AGENTS.md`、`README.md`、`ARCHITECTURE.md`、`docs/plague*.md`、`src/`、`dev/` 里已没有 `dev/shots`、`dev/ref/`、`dev/promo`、`dev/shot.py` 之类的旧路径（`docs/ai/context/` 里的历史记录不改）。

## 没处理 / 备选

- `dev/common/ref/_damaged/`（3 个损坏分 P 的旧文件，587 MB）：`20261008-201654-bilibili-reference-videos.md` 里写过“可以整个文件夹删掉”，这次没有动；`dev/common/ref/_redo/` 是空目录。
- `dev/plague1/promo/_work/`（宣传片中间片段，59 MB）、`dev/minitool/dist*`、`_test_out*`、`_variants`（小工具历史构建目录，约 70 MB）：不是截图，没删。
- `dev/common/ref/plague4`、`plague5` 的抽帧（约 21 MB）和 `dev/plague4|5/media` 里的截图：属于第四、五灾，没动。
- 要不要把 `src/chapters/*` 和 `src/art` 挪到 `src/` 之外：不建议，部署包和小红书打包只认 `src/`，要挪就得同时改 `deploy_mac.sh`、`build.py`、全部 import 和测试。
