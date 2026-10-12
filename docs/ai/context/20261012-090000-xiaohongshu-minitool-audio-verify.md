# 小红书小工具带声音版：本地验证记录

配套修改与设计决策见 `20261012-083000-xiaohongshu-minitool-audio-build.md`。以下都是本地 Playwright Chromium（SwiftShader 软件渲染）里的结果，**不是真机**。

## 产物

| 文件 | 说明 | 大小 | 文件数 |
|---|---|---|---|
| `dev/minitool/rusty-lake-minitool-audio.zip`（目录 `dist-audio/`） | 声音版，带屏幕上的声音调试状态条 | 395,097 字节（0.38 MiB） | 7 |
| `dev/minitool/rusty-lake-minitool-audio-release.zip`（目录 `dist-audio-release/`） | 声音版，`--release`，没有状态条（少一个 `audio_cfg.js`） | 394,843 字节 | 6 |

旧 `dist/` 和 `rusty-lake-minitool.zip`（sha256 `c634cf46…`，2026-10-11 18:42）没有被改动；`build.py --legacy --out <临时目录> --zip <临时目录>` 实测旧构建路径仍能跑通（4 个文件）。
没有上传 / 发布 / 部署，没有 commit。

## 验证结果

- **`test_minitool.py`（`MINITOOL_DIST=dev/minitool/dist-audio`）：33/33 通过**（竖屏转 90°、标题菜单触摸、漫游摇杆、横屏 / 模拟器窗口、完整流程 autoplay 91 步、CPU 降速 3× 的分段启动、排查面板、报错横幅）。
  注：第 5 节“连点 5 下”原来在机器负载高时会失败，旧 `dist` 同样失败，已改成点击前暂停渲染（见修改记录）。
- **`audio_check.py`（小红书同款 CSP，真实触摸 CDP touchStart / touchEnd）调试版：100/100 通过**；release 版 `--quick`：93/93 通过（release 版确认没有状态条）；后来补的 B3 场景（模拟 iOS 手势门槛）单独跑：23/23 通过。
  - 竖屏 390×844：点之前 AudioContext 还没创建；点后 `running`；标题的环境音 + 音乐在总线上 RMS ≈ 0.03–0.05。
  - 静音后触发游戏音效，总线 RMS：`bell` ≈ 0.062、`door` ≈ 0.092、`splash` ≈ 0.027（底噪 0.00000）——都 > 0。
  - iPhone UA → 媒体流：`<audio>` 播放中、`currentTime` 在走、MediaStream 回环里的 RMS ≈ 总线 RMS；`<audio>` 没有 URL（`src` / `currentSrc` 为空，`srcObject` 是流，不在 DOM 里）；DOM 里没有 audio / video / source。
  - `play()` 抛 NotSupportedError → 回退直连，总线仍有信号，没有页面报错；B3：手势结束事件之前 `play()` 一律 NotAllowedError → 状态“被拒”、**不回退直连**，touchEnd 后重试成功。
  - `RLP.audioTest()`：56 个音效 / 环境音 / 音乐都不抛错；切后台 → AudioContext suspended、`<audio>` 暂停，回前台恢复。
  - 横屏 844×390：同样 `running` + 有信号；完整流程 `RLP.autoplay()` 91 步通过，期间触发 10 种音效，峰值 RMS ≈ 0.055，结束时仍 `running`。
  - 每个场景：0 个 CSP 违规、0 个 4xx/5xx / 请求失败、0 个页面错误；排查面板里有“声音”一行。
- **局限（必须说清）**：本机 Chromium 在 CDP 触摸 `touchStart` 时就放行了 `AudioContext` 和 `<audio>.play()`（加了 `--autoplay-policy=document-user-activation-required` 也一样），
  所以“iOS 只认手势结束事件”这条真实门槛没法靠真实策略测出，只能用桩（B3）验证重试逻辑；`navigator.audioSession` 在 Chromium 里不存在，那一行只写了没执行；
  回环量的是“流里有数据”，不等于扬声器真的出了声。**iPhone 听不听得到，只能用户的 iPhone 验证。**
- **`compat_check.py`**（页面脚本运行前删掉 `flat` / `flatMap` / `Promise.finally` / `roundRect` / `ResizeObserver` / `OffscreenCanvas`，模拟 Chrome 61 缺失的接口）：
  游戏仍能启动，垫片补上 4 个接口；`flat` / `flatMap` / `finally` 与预期一致；`roundRect` 垫片与原生在 9 种参数写法下像素差为 0；
  flex gap 兜底（`?flexgap=0` + 关掉原生 gap）与原生 gap 的位置一致（标题关卡按钮、设置面板 `.vol-row` / `.btn-row`，差 ≤ 1px）；删掉接口 + 兜底样式下完整 `RLP.autoplay()` 91 步通过、0 个页面错误。
  （第一次完整跑 11/14：失败的 3 项是测试自己的问题——强制兜底时原生 gap 还在生效导致间距翻倍、设置面板没打开；改测试后 `--quick` 12/12，完整流程那一项第一次就通过。）
- **`es2017_check.js`**：[语法]问题 0 处（旧 `dist/game.js` 是 23 处 `catch {}`）；[接口]提示都已逐条判断：`Array.flat` / `flatMap` / `Promise.finally` / `roundRect` 已由 `compat.js` 补，
  `ResizeObserver`、`OffscreenCanvas` 有 `typeof` 保护，`fetch` 在 three.js 的 FileLoader 里游戏没调用，`navigator.audioSession` 在 `audio_out.js` 里有 try / 存在性判断，`.at(` 是游戏自己的方法。
  另用 acorn 8.16（`ecmaVersion: 2017`，严格）解析 `dist-audio` 和 `dist-audio-release` 的全部 js：通过；同样的解析对旧 `dist/game.js` 失败。
  jojo 的 `compile_chrome61.js` 只在临时副本上跑过一次作交叉检查（没有复制进项目，也没有改 jojo 那边）。
- **`css_compat.py`**：转写后 [布局]问题 0 处；[外观]只剩 `accent-color` 2 处（音量滑块 / 勾选框颜色，Chrome 61 上不生效）。
- **官方审计** `python audit_artifact.py <zip>`（Skill 1.7.0，`minitool-zip-builder/scripts/`）：
  `rusty-lake-minitool-audio.zip` → `PASS: 7 file(s), 0 warning(s)`；`rusty-lake-minitool-audio-release.zip` → `PASS: 6 file(s), 0 warning(s)`。
- 体积：zip 0.38 MiB（远低于官方建议 2 MiB 和上限 10 MiB），7 个文件（上限 200），最大单文件 `game.js` 1.17 MiB（< 2 MiB 提示线）。

## 没验证 / 待用户

- iPhone 真机是否听得到、安卓 8.1（Chrome 61）能否启动和出声：**未实测**。
- 创服平台模拟器、Android 真机扫码、iOS 真机扫码：待用户验证（官方 Skill 要求）。
- 审核是否会通过：不知道，V1.0.2 的驳回原因不明。
