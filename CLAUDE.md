# 锈湖：天堂岛 3D 同人重制 — 目录地图

开新对话先读本文件：它说明每个文件夹是做什么的。项目约束和各章的细则在 AGENTS.md（下面自动引入），引擎和接口契约在 ARCHITECTURE.md。

@AGENTS.md

## 一眼看懂

游戏本体只有 `index.html`、`styles.css`、`src/`、`vendor/three/`：公网部署（`dev/common/deploy_mac.sh`）和小红书打包（`dev/minitool/build.py`）只用这四样，**它们的路径不能动**。其余都是开发期材料，按“公共 / 每章 / 发布 / 文档”四类放：

```
CLAUDE.md  AGENTS.md  README.md  ARCHITECTURE.md   说明文档（本文件 = 目录地图）
index.html  styles.css  vendor/three/               网页入口、样式、three.js
src/                                                 游戏本体（会部署）
├─ core/        公共：引擎、状态与存档、视图、热点、物品栏、界面、音频、触屏、章节进度（progress.js）
├─ art/         公共：3D 素材。全是程序化建模代码（没有 .glb / 贴图文件）：世界、建筑、人物、道具
│                 世界与第一灾道具 island/lake/sky/buildings/props_beach|inner|lake/characters …
│                 人物 cast.js + charkit.js + human.js（各章复用）
│                 章节专属道具 props_p2_*（第二灾）、props_p3_* + cast_p3*（第三灾）、props_flies（第四灾）、props_p5（第五灾）
└─ chapters/    每章一个文件夹，只放这一章的逻辑
   ├─ index.js      章节注册表（标题、前置章节 requires、wip、achievements、load）
   └─ plague1 … plague5/   index.js（setup / start / sync / walkthrough）+ 各区域文件 + text.js + puzzles.js
docs/
├─ ai/context/  上下文文档仓库：每次修改、验证、设计决策都在这里新增带时间戳的中文记录，不覆盖旧的
└─ plagueN_design|api|agent_brief|handoff.md   第二、三灾的设计契约、美术接口、交接说明
dev/                                                 开发期材料（不部署）
├─ common/      公共：开发工具 + 全部章节的参考视频
│   ├─ ref/        参考视频 P01–P10（B 站实况，本地，2.5 GB）+ 各章分析笔记（p2/analysis、plague3/code_core.md）
│   ├─ shot.py     无头浏览器截图 + 本地静态服务（所有浏览器验收都用它的 serve()）
│   ├─ demo_recorder.py   录像器（CDP 录屏 + WebAudio 录声音），各章 record_*.py 共用
│   ├─ viewer.html|js  cast.html|js  buildings_test.html|js   模型 / 人物 / 建筑查看器
│   ├─ test_progress_browser.py   存档、解锁、章节衔接（跨章节）
│   ├─ deploy_mac.sh（私有，不入库）  deploy_mac.example.sh   公网部署
│   └─ media/      本地截图（不入库）
├─ plague1 … plague5/   每章自己的验收、录像、剪辑脚本 + 本地成片
│   ├─ test_plagueN.mjs          纯规则测试（node --test）
│   ├─ test_plagueN_browser.py   浏览器验收：自动通关、真实鼠标 / 键盘、触屏、读档
│   ├─ record_plagueN_demo.py    真人输入通关并录像（第一、二、三灾有）
│   ├─ make_plague2_trailer.py  make_plague3_preview.py   用录像剪预告 / 预览
│   ├─ promo/    （第一灾）30 秒宣传片的剪辑脚本、成片、封面、发帖用图
│   └─ media/    本地成片与截图（不入库）：demo/ 通关录像，trailer/ preview/ 剪辑成片，verification/ 验收截图
└─ minitool/    小红书小工具的打包工具（build.py、rotate.js、compat.js、测试、图标）；包写到 upload/
upload/                                              发布包（压缩包），索引见 upload/README.md
├─ xhs-minitool/   小红书小工具 zip（含历史版本）
└─ ark/            口袋方舟 H5 zip + 首页图 + 详情截图
```

“3D 素材”在这个项目里就是 `src/art/`（程序化模型代码）：它被所有章节共用，所以和引擎一起留在 `src/`，不能挪到 `src` 之外，否则部署包会缺文件。

## 每章在哪

| 章 | 逻辑 | 专属美术 | 验收 / 录像 | 文档 |
| --- | --- | --- | --- | --- |
| 第一灾 | `src/chapters/plague1/` | 世界和道具是公共的（`props_beach/inner/lake`、`buildings`） | `RLP.autoplay()`；`dev/plague1/record_plague1_demo.py`、`dev/plague1/promo/` | docs/ai/context |
| 第二灾 | `src/chapters/plague2/` | `props_p2_*`、`props_frogs`、`characters_p2`、`mist_p2` | `dev/plague2/test_plague2*`、`record_plague2_demo.py`、`make_plague2_trailer.py` | `docs/plague2_*.md`，参考分析 `dev/common/ref/p2/analysis/` |
| 第三灾 | `src/chapters/plague3/`（仍 `wip`） | `props_p3_*`、`cast_p3*` | `dev/plague3/test_plague3*`、`record_plague3_demo.py`、`shots_plague3.py`、`make_plague3_preview.py` | `docs/plague3_*.md` |
| 第四灾 | `src/chapters/plague4/` | `props_flies` | `dev/plague4/test_plague4*` | AGENTS.md「第四灾」 |
| 第五灾 | `src/chapters/plague5/`（`wip`） | `props_p5` | `dev/plague5/test_plague5*` | AGENTS.md「第五灾」 |

第六至第十灾还没做，参考视频在 `dev/common/ref/P06_*` … `P10_*`。

## 常用命令（在项目根目录）

```bash
node --test dev/plague2/test_plague2.mjs dev/plague3/test_plague3.mjs dev/plague4/test_plague4.mjs dev/plague5/test_plague5.mjs
python dev/plague3/test_plague3_browser.py          # 其他章同理：dev/plagueN/test_plagueN_browser.py
python dev/common/test_progress_browser.py          # 存档 / 解锁 / 章节衔接
python dev/common/shot.py "index.html?chapter=3&view=beach_mid" out.png     # 截图
python dev/plague3/record_plague3_demo.py [--fast]  # 真人输入通关并录像（--fast 只验证流程）
python dev/minitool/build.py --release              # 小红书小工具打包，zip 写到 upload/xhs-minitool/
bash dev/common/deploy_mac.sh                       # 公网部署（私有脚本，仅本机有）
```

## 约定

- 大文件只放本地：`dev/common/ref/`、`dev/*/media/`、`dev/plague1/promo/` 都被 `.gitignore` 忽略。验收和录像脚本的输出默认写到各自章节的 `media/`。
- 参考视频的抽帧和验收截图用完就删，需要时用 ffmpeg 从 `dev/common/ref/P0x_*.mp4` 重抽；`ref` 里只留分析笔记。
- 发布包只放 `upload/`：`dev/minitool/build.py` 默认把 zip 写到 `upload/xhs-minitool/`；每个包对应哪个平台版本、什么状态，写在 `upload/README.md`。
- 模型按真实世界的大小建，世界里 `scale` 一律为 1：人物身高、桌椅、道具的参考尺寸在 `src/art/scale.js` 和 `docs/art_scale.md`；要缩放就在工厂里 `bake`；用 `python dev/plague4/measure_scale.py` 量尺寸（新章节仿照它加 `REAL.pN`）。
- 新增章节：逻辑放 `src/chapters/plagueN/`，专属美术放 `src/art/` 并用章节前缀，验收脚本放 `dev/plagueN/`，设计文档放 `docs/`，每次变更在 `docs/ai/context/` 加记录。
- 并行会话：同一个仓库可能有别的会话在改文件，提交前用 `git status` 确认，只带自己的文件。
- 旧路径对照（目录整理前的 `dev/ref`、`dev/shots`、`dev/test_*.py` 等）见 `docs/ai/context/20261020-113000-repo-restructure-and-cleanup.md`。
