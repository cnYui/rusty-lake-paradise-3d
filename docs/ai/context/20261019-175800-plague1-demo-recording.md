# 第一灾完整游玩视频录制

时间：2026-10-19 17:58

## 目的

从无参数首页开始，点击第一灾菜单卡片，保留片头、章节动画、过场和游戏 WebAudio 声音，录制完整通关视频。

## 实现

- 新增 `dev/record_plague1_demo.py`，复用 `dev/demo_recorder.py` 的 CDP 画面采集和 WebAudio MediaRecorder 声音采集。
- 正式录制使用 1920×1080、H.264 + AAC；章节流程通过公开 `RLP.autoplay()` walkthrough 执行，`fast: false` 保留渲染与动画。
- `--fast` 模式设置 `RLP.timeScale = 1000`，用于快速流程回归，不作为成片。

## 验证

- 第一灾流程：91/91 步通过，`plague1_complete: true`，页面错误为空。
- 成就：`the_eilander_family`、`save_the_goat`。
- 成片：`dev/shots/plague1/demo/plague1-demo.mp4`，231.07 秒，1920×1080、30 fps，包含 H.264 视频和 48 kHz 双声道 AAC 音频，文件约 39.5 MiB。
- ffmpeg 对开头、中段、结尾抽帧及音频流解码检查通过。
- autoplay 仍报告 6 条既有机位可见性警告（fish、father_talk、holder），不影响流程完成和成片生成。

## 备注

录制收尾时 CDP 有一帧在帧目录清理后迟到，产生 Playwright 事件监听异常；成片已成功生成，ffprobe 显示音视频时长均约 231 秒，尾帧和音频流完整。
