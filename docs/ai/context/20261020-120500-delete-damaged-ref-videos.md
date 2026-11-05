# 删除损坏的参考视频旧文件

时间：2026-10-20 12:05

用户要求：“损坏的参考视频旧文件 你删除”。

- 删除 `dev/common/ref/_damaged/`（原 `dev/ref/_damaged/`）里的三个文件，共 587 MB：`P06_第六灾-疹灾`、`P09_第九灾-夜灾`、`P10_第十灾-长子之死` 的 `*.damaged.mp4`。同时删掉空目录 `_damaged/` 和 `_redo/`。
- 删之前核对过：三个重下后的完好版本 `P06_*.mp4`（196 MB）、`P09_*.mp4`（284 MB）、`P10_*.mp4`（334 MB）都在 `dev/common/ref/` 里；被删文件在 `.gitignore` 忽略的目录里，没进过 git，所以没有提交可言。
- 这些旧文件的来历见 `20261008-201654-bilibili-reference-videos.md`（P06 音频、P09 视频、P10 音频在下载中被截断或写坏，重下后换进 `dev/ref/`）。该记录和 `20261020-113000-repo-restructure-and-cleanup.md` 里“`_damaged` 没处理”的说法以本记录为准。
- 删除后 `dev/common/ref/` 里只剩 P01–P10 十个完好视频，加上第二、三、四、五灾的分析笔记和抽帧目录（`p2`、`plague3`、`plague4`、`plague5`）。
