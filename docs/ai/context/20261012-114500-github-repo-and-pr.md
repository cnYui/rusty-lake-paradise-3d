# 建 GitHub 仓库、把这几轮改动做成 PR、整理本地工作区

## 背景

- 用户要求：“把你做的东西全部通过 PR 提交，然后把本地工作区的修改内容整理一下。GitHub 那边远端应该建了仓库，可以提到 GitHub 那边。”
- 实际情况：项目目录**不是 git 仓库**（没有 `.git`），GitHub 上也**没有**这个项目的仓库——查了 cnYui 个人账号（155 个仓库）和 4 个组织（SoundScape-Universe、XTION-Hackthon、TechFlowRepo、NEXUS99991），没有叫 rusty-lake / 锈湖 / paradise 的，也没有创建时间对得上的新仓库。
- 用户的选择（三个问题）：① 在 cnYui 下**新建公开仓库**（我建议过先私有，用户选了公开）；② 基线 = “改动前状态当 main，我的改动做成 PR”；③ 不提交 `dev/ref`（2.5 GB 参考视频）、`dev/promo`（宣传片）、`dev/shots`（截图），其余（zip、`dist-*`、`_work`、`_scan`、`_test_out*`、`vendor/three`）**照常提交**。

## 做法

1. `git init -b main`；仓库内配置 `core.autocrlf=false`（`props_beach.js`、`props_inner.js`、`sky.js`、`styles.css`、`README` 等有的是 CRLF，不让 git 改换行）；
   提交身份用 `cnYui <132864240+cnYui@users.noreply.github.com>`（GitHub 的 noreply 地址，公开仓库不暴露本机 git 配置里的真实邮箱）。
2. **`.gitignore`**：`dev/ref/`、`dev/promo/`、`dev/shots/`（体积）；`dev/deploy_mac.sh` 和 `docs/ai/context/20261008-115228-public-deploy-aaccx.md`（含私有的 Tailscale 地址 `100.126…`、SSH 用户名、密钥文件名、MacBook 主机名，**公开仓库不该有**）；`__pycache__/`、`*.pyc`、`Thumbs.db`。
   同样的原因，README 里“经 Tailscale SSH 把文件传到 MacBook（主机名，密钥路径）”那句改成“经 SSH 传到部署用的 MacBook（私有信息只写在本地脚本里）”。这一处隐私清理放进了**基线**（main 公开前就不含私有信息），不是 PR 里的改动。
   扫描过其余文件：没有私钥 / token / 密码；`aaccx.pw` 是已公开的域名，没动。
3. **基线（main 的第一个提交）**：在临时目录里拼出“我动手之前”的样子，不动真实工作区——当前工作区里该提交的文件，去掉我这几轮新增的，并把我改过的还原：
   4 个文本文件（`src/chapters/index.js`、`plague1/index.js`、`plague1/text.js`、`plague1/items.js`）← 改色前备份；`icon.png` ← 原图标；
   `rusty-lake-minitool.zip` 和 `dist/` ← 我 10-11 重打包之前的 V1.0.1 包（`_old/` 里留的副本，`dist/` 就是这个 zip 的内容）。
   并行会话做的带声音 / Chrome 61 兼容版（`audio_out.js`、`compat.js`、`css_compat.py`、新版 `build.py`、`dist-audio*`、它们的两篇记录等）算基线。332 个文件、约 17 MB。
4. **PR 分支 `chore/xhs-review-color-x-experiment`**：当前工作区相对基线的全部差异，拆成几个意思清楚的提交（见 PR 描述）。
5. 清理我自己造成的残留：
   - 上一轮出包失败时，`build.py` 先清空了并行会话的 `dist-audio/`、只写回 3 个文件；已用它们 08:26 的 `rusty-lake-minitool-audio.zip`（没被动过）原样展开恢复，和它们的产物一致；
   - 临时文件 `_minitool.css.rebuilt` 已删除；我的脚本和备份都在会话草稿目录里，不在项目里。

## 没动 / 要注意

- 这是《锈湖：天堂岛》的同人重制，仓库是**公开**的（用户的选择）。名称、角色、场景都来自原作，知识产权风险见 `20261012-095000-purple-and-x.md` 里的说明；需要的话可以随时在 GitHub 上改成私有。
- 仓库里提交了 zip / `dist-*` / `_work` / `_scan` / `_test_out*` 这类构建产物（用户的选择），它们都能用 `build.py` 重新生成；以后觉得吵，可以加进 `.gitignore` 并 `git rm --cached`。
- `dev/deploy_mac.sh` 只在本地，仓库里是 `dev/deploy_mac.example.sh`（私有信息改成必须通过环境变量传入）。AGENTS.md 里“公网部署只用 `bash dev/deploy_mac.sh`”的规则不变，只是脚本不进仓库。
- 小红书那边：V1.0.3（紫色版）已通过并发布；V1.0.4（红色 + x 对照包）在“审核中”，结果要等后台。
