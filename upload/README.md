# upload/ — 发布包

只放要上传到平台的压缩包，按平台分文件夹。新包由 `dev/minitool/build.py` 默认写到 `xhs-minitool/`；每次打新包都在下面的表里加一行（版本、包含的章节、状态），状态的出处写在 `docs/ai/context/` 的记录里。

小工具的审核历史和平台限制见 `docs/ai/context/*xiaohongshu-minitool*.md`、`*xhs-minitool*.md`。打包要在干净的提交上做（`git archive HEAD` 导出后构建），别在有未提交改动的工作区里直接打；打出的包要在“从无参数首页进入”的模式下测过（`dev/minitool/test_minitool.py`）。

## xhs-minitool/ — 小红书小工具

| 文件 | 包含章节 | 对应版本 / 状态 |
| --- | --- | --- |
| `_old/rusty-lake-minitool-v1.0.0-rejected.zip` | 第一灾 | V1.0.0，驳回（按钮点不了） |
| `_old/rusty-lake-minitool-v1.0.1-uploaded-before-red2orange.zip` | 第一灾 | V1.0.1，红色改橘黄之前上传，驳回（综合审核） |
| `rusty-lake-minitool.zip` | 第一灾 | 构建脚本 `--legacy` 的旧版产物 |
| `rusty-lake-minitool-audio.zip`、`rusty-lake-minitool-audio-release.zip` | 第一灾 | `build.py` 默认的带声音构建（带 / 不带屏幕上的声音调试状态条），早期版本的产物 |
| `rusty-lake-minitool-purple-release.zip` | 第一灾 | V1.0.3，紫色版，通过并发布 |
| `rusty-lake-minitool-red-x-release.zip` | 第一灾 | V1.0.4，红色 + 台词里的“血”改 x，通过并发布（长期在线的版本） |
| `rusty-lake-minitool-105-fixed-release.zip` | 第一灾 | V1.0.5 被驳回后的修复包（全屏补丁误删 `chapterOpen`），没有单独上线 |
| `rusty-lake-minitool-ch12-20261019-release.zip` | 第一、二灾 | 2026-10-19 首次带第二灾的包（V1.0.6 提交审核） |
| `rusty-lake-minitool-ch12-s-20261019-release.zip` | 第一、二灾 | 台词“死”改 S；V1.0.7，同一个包改名称 / 简介 / 图标后重传为 V1.0.8，V1.0.8 已发布 |
| `rusty-lake-minitool-ch12-save-20261019-release.zip` | 第一、二灾 | V1.0.9：存档跨启动保留、第二灾需先通关第一灾、通关自动进下一章、成就历史；2026-10-19 提交审核 |

`ch12-s…` 和 `ch12-save…` 两个包是别的会话生成的，对应的打包源码改动（`build.py` 的“死→S”补丁、进度存档功能等）还没提交，所以这两个 zip 暂时只在本机这个文件夹里，没进 git；那些改动提交后再把它们加进来。

图标和封面在 `dev/minitool/icon.png`、`dev/minitool/icon-title-only.png`（`make_icon.py` 生成），不放在这里。

## ark/ — 口袋方舟 H5

| 文件 | 说明 |
| --- | --- |
| `rusty-lake-ark-20261014.zip` | ZIP 根目录就是 `index.html`，6 个文件，423071 字节；发布地区只选 233 派对，不选 GPark |
| `home-16x9.jpg` | 首页 16:9 图 |
| `screenshots/` | 详情页截图（1280×720，4 张） |

图标用 `dev/minitool/icon.png`（512×512）。上传和提交记录见 `docs/ai/context/20261014-134500-ark-upload.md`、`20261014-135500-ark-submit-confirmed.md`。资料里要如实写明《Rusty Lake Paradise》同人重制及原作来源，不宣称已获授权。
