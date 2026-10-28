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
| `rusty-lake-minitool-ch123-20261022-release.zip` | 第一、二、三灾 | V1.0.10：第三灾（要先通关第一、二灾才解锁，台词“血糖”改“x糖”）、第一灾补上三个没有发放点的成就；2026-10-22 上传部署成功，创作者中心列表显示审核中（SHA256 `78fa1427…2ffc`）；V1.0.9 此前已发布（13 万人使用） |
| `rusty-lake-minitool-ch1234-20261024-release.zip` | 第一到第四灾 | V1.0.11：第四灾（要先通关第一到第三灾才解锁，第四灾书页“遇见死亡”改成 S）；第五灾重做成 3D 前不发布（包里不注册它的 load，菜单“敬请期待”）；官方审计 PASS、`test_minitool.py` 100/100；2026-10-24 上传部署成功并点了“发布小工具”，列表显示审核中（SHA256 `09ce26e5…`，0.54 MB）；V1.0.10（第一到三灾）此前被驳回“页面按钮无法点击”，V1.0.9 仍是生效版本 |
| `rusty-lake-minitool-ch1234-fast-20261024-release.zip` | 第一到第四灾 | V1.0.12：和 V1.0.11 同样内容，但启动变快——标题菜单提前出现（慢手机上约 1 秒就能点，原来要等建世界 + 编译着色器 20–35 秒）、启动让出主线程不再每次等整帧、建世界两处热点（墙面贴图半分辨率噪声、`shoreDistance` 缓存边数据）；原生速度 `RLP.ready` 约 7 秒 → 5.4 秒；官方审计 PASS、`test_minitool.py` 108/108；2026-10-24 上传部署成功并点了“发布小工具”（弹过 `saveVibeApp timeout` 提示，列表里已是审核中）；SHA256 `c723bd5f…`，0.55 MB；V1.0.11 被驳回“页面按钮无法点击” |
| `rusty-lake-minitool-ch1234-trapfix-20261024-release.zip` | 第一到第四灾 | 在 V1.0.12 基础上只多第四灾鸟陷阱修复（树枝顶到翘起的板底、放完树枝 / 虫子取消选中、板下点击范围放大，`game.js` 只多 264 字节）；官方审计 PASS、`test_minitool.py` 108/108（两次失败都在“连点左上角 5 下开排查面板”，机器上别的测试同时跑时会超时，单独重跑通过）；SHA256 `f0266644…`，0.55 MB；**未上传、未提交**，不含第三灾球茎点击盒的修复，统一打包时以新包为准 |
| `rusty-lake-minitool-ch1234-xhsstore-20261027-release.zip` | 第一到第四灾 | 针对 V1.0.14 被驳回“页面按钮无法点击”和“无法保存进度”：存档改走小红书 Storage API（`storage_xhs.js`，客户端 ≥ 9.46.0，初始化最多 1.5 s，老存档自动合并迁移，不支持时退回 localStorage）、启动不再一次性同步编译着色器（逐组编译 + fence 等 GPU）、大画布改 CPU 光栅化、全景环分段；CPU 3× + SwiftShader 下最长长任务 9.5~12.5 s → 1.3~1.5 s；从提交 `bb5eaa6` 的 `git archive` 构建，7 个文件，593,687 字节，SHA256 `5594b6ac…4b9b`；2026-10-27 15:50 用户自己在创作者中心提交，V1.0.15 **未通过**（10-28 查到，原因同前：“小工具功能缺陷，可能是页面按钮无法点击，重点排查页面功能完整性”）（V1.0.14 未通过、V1.0.13 仍生效；后台看不出传的是哪个 zip，按用户说法记为这个包）；记录见 `docs/ai/context/20261027-103000-xhs-storage-and-boot-freeze.md` |
| `rusty-lake-minitool-ch1234-savedialog-20261028-release.zip` | 第一到第四灾 | 在 xhsstore 包基础上，暂停面板“保存进度”点了改弹提示框（已保存 / 无法保存 / 过场中）；从 `8294722` 构建，593,748 字节，SHA256 `bd244563…f56f`；2026-10-28 用插件“重新上传”部署成功；**V1.0.16 提交时间 2026-10-28 09:49:13，审核通过，已发布、生效中**（10-28 10:23 查到，24.3 万人使用；V1.0.14 / V1.0.15 未通过）；记录见 `docs/ai/context/20261028-100000-xhs-save-dialog-v1016.md` |
| `rusty-lake-minitool-ch1234-grovefix-20261028-release.zip` | 第一到第四灾 | 在 10-26 的 save 包（V1.0.14）基础上加第三灾白桦林出口修复（南面缺口可点可走出去，见 `docs/ai/context/20261028-100000-plague3-grove-exit.md`）；和 10-26 一样从主目录工作区打包（含别的会话未提交的启动加速等）；`test_minitool.py` 108/108；584755 字节，SHA256 `6147424f…6a13c61`；**未上传、未提交审核** |

`ch12-s…` 和 `ch12-save…` 两个包是别的会话生成的，对应的打包源码改动（`build.py` 的“死→S”补丁、进度存档功能等）还没提交，所以这两个 zip 暂时只在本机这个文件夹里，没进 git；那些改动提交后再把它们加进来。

图标和封面在 `dev/minitool/icon.png`、`dev/minitool/icon-title-only.png`（`make_icon.py` 生成），不放在这里。

## ark/ — 口袋方舟 H5

| 文件 | 说明 |
| --- | --- |
| `rusty-lake-ark-20261014.zip` | ZIP 根目录就是 `index.html`，6 个文件，423071 字节；发布地区只选 233 派对，不选 GPark |
| `rusty-lake-ark-ch123-20261021.zip` | 第一、二、三灾；`python dev/minitool/build.py --ark` 的产物（原生横屏外壳、安全区、触屏点击区域 ≥ 44px、Chrome 60 垫片），7 个根目录文件，539966 字节，SHA256 `d9f210f2…316c26f`；针对 v1.0.0 被“移动端适配有问题”拒绝而做，2026-10-21 本地验收通过（`dev/minitool/test_ark.py`），已传到口袋方舟：1.0.1（名称“锈湖天堂岛3D”）被拒；1.0.2（同一个包，改名“锈湖天堂岛3D（玩家自制）”）2026-10-21 19:02 提审，审核中，记录见 `docs/ai/context/20261021-160000-ark-ch123-mobile-adaptation.md` |
| `rusty-lake-ark-ch1234-20261024.zip` | 第一到第四灾；`python dev/minitool/build.py --ark` 的产物（同上外壳，`--ark` 不再去掉第四灾），7 个根目录文件，573119 字节，SHA256 `e31abd89…`；2026-10-24 本地验收 `test_ark.py --full` 93/93；传到口袋方舟：1.0.3（名称不变“锈湖天堂岛3D（玩家自制）”）2026-10-24 15:12 提审，审核中（线上仍是已发布的 1.0.2）；记录见 `docs/ai/context/20261024-153000-ark-ch1234-submit.md` |
| `rusty-lake-ark-ch1234-leyuan-20261025.zip` | 第一到第四灾 + 提示按钮；`python dev/minitool/make_leyuan.py` 的产物（`build.py --ark` + ark_cfg.js 写 `__RLP_233` + 233 广告 SDK `<script async>`），7 个根目录文件，586118 字节，SHA256 `dd4b8d64…801b`；`test_leyuan.py` 12/12，去掉 SDK 标签后 `test_ark.py --full` 93/93；传到口袋方舟：1.0.4（营收勾“广告”）2026-10-25 10:26 提审，审核中（线上仍是 1.0.3） |
| `home-16x9.jpg` | 首页 16:9 图 |
| `screenshots/` | 旧版（第一、四灾）详情页截图（1280×720，4 张） |
| `screenshots-ch123/` | 第一、二、三灾详情页截图（1280×720，5 张：ch1 总览 / 房子，ch2 湖边，ch3 林间空地 / 白桦林） |

图标用 `dev/minitool/icon.png`（512×512）。上传和提交记录见 `docs/ai/context/20261014-134500-ark-upload.md`、`20261014-135500-ark-submit-confirmed.md`。资料里要如实写明《Rusty Lake Paradise》同人重制及原作来源，不宣称已获授权。
