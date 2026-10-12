# 小红书小工具带声音版：iPhone 出声线路 + Chrome 61 兼容（修改与设计决策）

## 背景

- 用户把游戏发布成小红书「小工具」。银魂项目里已经把“小工具里出声音”做通并在 iPhone 真机上测过：
  容器里 WebAudio 能运行，但输出会被 iPhone 侧边静音拨片吃掉；实测有效的办法是 `navigator.audioSession.type = 'playback'`
  加「总线 → `createMediaStreamDestination()` → `new Audio()` + `.srcObject` + `.play()`」，且 `ctx.resume()` / `media.play()` 只在“手势结束”事件里才放行。
- 平台限制（真实上传实测 + 官方 Skill 1.7.0）：zip ≤ 10 MB、≤ 200 个文件、只允许 html css js png jpg jpeg gif webp svg woff woff2 json；
  容器 CSP 的 `media-src 'self'` 不许 `<audio>` 用 data: / blob: 地址；兼容基线 Android 8.1 的 Chrome / WebView 61（JS 编译到 ES2017），iOS ≥ 18.4。
- 要求：不上传 / 不发布 / 不部署（没有跑 `dev/deploy_mac.sh`），不 commit；原有 `dist/` 和 `rusty-lake-minitool.zip` 不动，输出写到新目录 / 新 zip。
- 上一版（V1.0.2）被驳回，原因只写了“内容未通过平台综合审核”，**没有证据，本次没有对原因下任何结论**。

## 当前包里声音原本是什么状态（读代码 + grep 旧 `dist/game.js` 得出）

- `src/core/audio.js`（约 1030 行）是**纯程序合成**：振荡器 / 滤波噪声 / 卷积混响，56 个名字（音效 + 5 种环境音 + 3 首音乐），**没有任何音频文件**。
  所以不需要 base64 音频包，也没有 data: / blob: 媒体地址的问题；`<audio>` / `new Audio` 在游戏里一处都没有。
- 旧包 `dist/game.js` 里这套音频代码**完整存在，没有被任何补丁关掉**（`createDynamicsCompressor`、`createConvolver` 各 1 处，`rlp3d.settings` 音量存档 2 处）。
- 解锁：`main.js` 在 window 捕获阶段监听 pointerdown / pointerup / touchend / keydown 调 `audio.unlock()`，此外各个按钮和热点里也会调。
  所以 AudioContext 能在手势里创建和 resume——这一部分本来就对。
- 输出线路：`master → comp(压缩器) → ac.destination` 直连。按银魂的真机结论，**这条直连路在 iPhone 上会被静音拨片吃掉**
  （这是依据银魂实测做的推断，锈湖自己没有在 iPhone 上测过）。Android / 电脑上直连是正常的。

## 发现的兼容问题（旧包，扫描 + 独立解析得出）

1. **JS 语法**：旧 `build.py` 的 esbuild 目标是 `es2019`，产物里留下 **23 处 `catch {}`（可选 catch 绑定，Chrome 66 才支持）**。
   用 acorn 8.16 按 ES2017 严格解析旧 `dist/game.js`：`Unexpected token (202:37269)`——在 Chrome 61 上整个 game.js 解析失败。新产物 acorn 解析通过。
2. **运行时接口**（Chrome 61 没有、游戏代码直接调用，没有能力检测）：`Array.prototype.flatMap`（`characters_p2.js` 模块顶层 + `props_beach.js` 造门）、
   `Array.prototype.flat`（`props_lake.js`）、`Promise.prototype.finally`（`ui.js` 合成物品）、
   **`CanvasRenderingContext2D.roundRect`（Chrome 99；`materials.js` / `props_inner.js` / `props_lake.js` 画贴图，建世界时就调用）**。
   `ResizeObserver`、`OffscreenCanvas` 已有 `typeof` 保护；`es2017_check` 报的 `.at(` 是游戏自己的 `head.at(...)` 方法，不是 Array.at。
3. **CSS**：`inset`（Chrome 87，24 处，含 `body` 和一大批覆盖层）、`min()`（Chrome 79，`#stage` 的宽高字号和 `minitool.css` 里舞台尺寸）、flex 容器里的 `gap`（Chrome 84，7 处规则）、grid `gap`（Chrome 66）、`accent-color`（Chrome 93，只是外观）。
   这些在 Chrome 61 上会被静默丢弃：舞台没有尺寸、覆盖层不铺满、按钮挤在一起。`styles.css` 里没有 `env()`，也没有 `aspect-ratio` / `clamp()` / `:is()` / `:has()`。

## 改动（游戏源码 `src/`、`styles.css`、`index.html` 一行没动；全部在 `dev/minitool/`）

新增：
- `audio_out.js`：输出线路。iOS（UA 含 iPhone / iPad / iPod，或 MacIntel + 触点 > 1，或有 `navigator.audioSession`）走媒体流：`audioSession.type='playback'` +
  `MediaStreamDestination` → `new Audio()` → `srcObject` → `play()`；其它平台直连，和原来一样（决策见下）。
  window 捕获阶段监听 pointerdown / pointerup / touchstart / touchend / click / keydown，每次都 `ctx.resume()` + `media.play()`（只有手势结束事件会成功，多调无害），
  第一个手势结束事件里点播一次 1 采样静音缓冲。`media.play()` 被拒且不是 NotAllowedError（也不是 AbortError）时回退直连。
  切后台 `ctx.suspend()` + `media.pause()`（官方性能规范：页面不可见时停媒体），回前台尝试恢复，不放行就等下一次点按。
  调试：`window.RLP_AUDIO_DEBUG` 为真时在 `#rot` 里（跟着游戏一起转）左下角显示一行状态：AudioContext 状态 | 线路 | `<audio>` 状态 | 会话 | 总线电平（AnalyserNode）| 手势结束次数 | 当前环境音/音乐 | 错误。
  连点左上角 5 下的排查面板里（`rotate.js`，release 版也有）新增一行“声音”。`?audioroute=media|direct` 强制线路（测试用）。`window.__RLP_AUDIO` 是状态对象。
- `compat.js`（最先加载）：补 `flat` / `flatMap` / `Promise.finally` / `CanvasRenderingContext2D.roundRect`（arcTo 实现，数字 / 1–4 个半径 / {x,y} / 半径过大缩放 / 宽高为负）；
  检测 flex gap（官方规范的写法：两个空 div + `row-gap:1px`，看 `scrollHeight===1`），不支持就给 `<html>` 加 `no-flexgap`；`?flexgap=0` 强制走兜底（测试用）。
- `css_compat.py`：CSS 扫描 + 转写。`inset: a b c d` → 四个物理属性；grid 的 `gap` 同时写 `grid-gap`；flex 的 `gap` 生成 `html.no-flexgap 选择器 > * + * { margin-left|top }` 兜底（纵向用 margin-top；`#boot::before` 在 `minitool.css` 里手写）；
  扫描有 [布局] 问题就不出包。
- `es2017_check.js`：从银魂复制（未改），在 `build.py` 里当闸门：[语法]问题 ≠ 0 就不出 zip。
- `audio_check.py`（声音验证）、`compat_check.py`（垫片验证）。

修改：
- `build.py`：加参数 `--legacy`（旧路径，输出 `dist/` + `rusty-lake-minitool.zip`，会覆盖）、`--release`、`--out`、`--zip`。
  **默认输出 `dist-audio/` + `rusty-lake-minitool-audio.zip`**（debug 带状态条），`--release` 输出 `dist-audio-release/` + `rusty-lake-minitool-audio-release.zip`，不碰旧产物。
  声音版额外做：补丁 4（对 `audio.js` 副本把 `comp.connect(ac.destination)` 换成 `window.__RLP_AUDIO_OUT(ac, comp)`，没有它就直连）、esbuild 目标 `es2017`、
  `styles.css` 里删掉 `#stage` 的三行 `min()`、CSS 转写 + 扫描闸门、`es2017_check` 闸门（压缩产物上查语法；另打一份不压缩副本查运行时接口，因为压缩后的长行里 `//` 会让这个工具漏报）、
  `data:audio` / `blob:` / `createObjectURL` / `new Audio(` 的自检（`<audio>` 只允许在 `audio_out.js` 里创建一次）、zip 大小按十进制 10 MB 判断。
- `rotate.js`：舞台尺寸改在 JS 里算好写成 `--sw / --sh / --fs`（原来 CSS 里的 `min()`），排查面板加“声音”一行。`minitool.css`：`#rot #stage` 用这三个变量（带兜底默认值），加 `#boot::before` 的 no-flexgap 间距。旧路径也共用这两个文件（现代浏览器效果不变）。
- `test_minitool.py`：用环境变量 `MINITOOL_DIST` 指定要测的目录（默认仍是 `dist`）；第 5 节“连点 5 下排查面板”之前先暂停渲染——
  软件渲染占满主线程、机器上同时有别的任务时，5 下点击拖过 2 秒窗口，**旧 `dist` 也同样失败**（已验证），不是新改动引起的；断言本身没改。

## 设计决策

1. **只在 iOS 上走媒体流，其它平台直连**（银魂是所有平台都走媒体流）。理由：静音拨片问题只在 iPhone；安卓 WebView 61 上 MediaStream → `<audio>` 没人测过，直连是已知正常的路。
   `?audioroute=media` 可强制，常量 / 条件在 `audio_out.js` 顶部，要改成“全平台走媒体流”是一行的事。
2. **不改游戏的音频逻辑**，只在 `audio.js` 副本的一行输出上挂钩；`audio.unlock()` 的原有触发保持不变。
3. **没有音频文件，所以没有 manifest / base64 包**；zip 只有 7 个文件、0.38 MB，远低于 10 MB / 200 个文件的限制。
4. **兼容 CSS 用“原样式 + 局部转写”**：现代浏览器里效果不变（`inset` 展开等价；flex gap 兜底只在 `no-flexgap` 下生效），不维护两套样式表（符合官方 css-compatibility.md 的“基线 + 增强”思路；flex gap 用官方推荐的行为检测，没有用 `@supports (gap)`）。
5. **Chrome 61 编译工具**：esbuild `--target=es2017` 已经把所有 ES2018+ 语法降级，产物 acorn（ecmaVersion 2017，严格）解析通过，所以**没有复制** jojo 的 `compile_chrome61.js` / `polyfill.js` 进项目；
   只在临时副本上跑过 jojo 的 `compile_chrome61.js` 当交叉检查（ES2018 解析通过；它按名字报的 `.at()`、`ResizeObserver`、`OffscreenCanvas` 是误报 / 已有保护，`roundRect` 是真问题，已由 `compat.js` 补上）。
6. 官方 Skill 1.7.0 的 `audit_artifact.py` 对最终 zip 通过（见验证记录）。

## 没做 / 风险（没有证据的不下结论）

- 真机没测：iPhone 听不听得到、Android 8.1 Chrome 61 能不能跑，只有真机能验证；这里的 Chromium 里 `navigator.audioSession` 不存在，该分支只是代码里写了、没有被执行过。
- WebGL：游戏用 three.js r170（WebGL2）；官方性能规范建议每帧 draw call ≤ 100、三角形 ≤ 100k、先 WebGL1 兜底，本游戏排查面板在软件渲染下读到约 866 次绘制 / 984k 三角形，**远超官方保守预算**，也没有 WebGL1 兜底。没有改，只记录。
- 安全区：`styles.css` 没有用 `env()`（所以不会因 Chrome 61 不认 `env()` 出问题），但也没有处理 `--safe-area-inset-*`；游戏转了 90°，容器返回钮 / 刘海会盖住游戏的一边。没改。
- 物品栏槽位是 `div` + `pointerup`（且只响应非鼠标指针），没有 `role="button"` / `aria-label`；标题菜单、设置、箭头等是真 `<button>`。jojo 项目被驳回的原因之一是屏幕按钮缺少语义，但锈湖的驳回原因不明，**不断言**这与审核有关，没改。
- `accent-color`（设置里音量滑块 / 勾选框的颜色）在 Chrome 61 上不生效，只是外观。
