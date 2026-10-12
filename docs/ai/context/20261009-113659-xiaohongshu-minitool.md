# 小红书小工具打包与上传（锈湖：天堂岛 3D 第一灾）

## 用户要求

1. 参照银魂项目（`D:\CodeWorkSpace\gintama-pixel-game`）上传小红书小工具的做法，用浏览器插件把这个游戏传上去。
2. 补充：小红书那边没法旋转页面，所以统一把画面转 90° 按横版显示。

## 参考：银魂那边的做法（`docs/ai/context/20261008-小红书小工具上架复盘.md`）

- 入口：创作者中心 → Builder hub → 小工具（`https://creator.xiaohongshu.com/new/red-app`）→ 上传小工具。
- 表单：名称（≤14 字）、简介（≤14 字）、图标（png/jpg，≤5 MB，1:1，上传后有裁剪确认框）、zip、版本号、场景标签、权限，
  勾选《小工具发布安全规范》后才能点“发布小工具”；zip 部署成功后右侧出真机预览二维码。
- 平台硬限制（上传校验实测）：只允许 `jpg css gif svg png js jpeg json html woff2 webp woff`；zip ≤ 10 MB；文件数 ≤ 200。
  容器 CSP：脚本只能是包内外链普通脚本（不能内联、不能 eval / new Function、不能 WebAssembly、没有 Worker），不能联网，不能全屏、不能锁方向，容器永远竖屏。

## 做法

新增 `dev/minitool/`（不改游戏源码，打包时对副本打补丁）：

- `build.py`：用 esbuild（取别的项目 `node_modules` 里的 `esbuild.exe`，也可用环境变量 `ESBUILD` 指定）把 `src/main.js` + three.js 打成一个压缩过的 IIFE `game.js`；
  `--alias` 把 `three` / `three/addons` 指到 `vendor/three`，没有 import map。副本上两处补丁：
  1. `art/characters.js` 顶层 `await import('./props.js')` → 静态 `import`（普通脚本不支持顶层 await；两个模块没有循环引用）；
  2. `core/ui.js` 的全屏函数改成空操作、`fullscreenSupported()` 返回 false（全屏按钮自动隐藏，也不再出现 `requestFullscreen` / `screen.orientation.lock`）。
  输出 `dist/`（`index.html` + `game.js` + `rotate.js` + `style.css`，4 个文件）和 `rusty-lake-minitool.zip`（0.37 MB）。这个游戏没有任何外部素材（贴图全是 canvas 画的、声音是 WebAudio 合成的），所以不需要转图片、不需要把素材塞进 js。
- `rotate.js`：1) 把原来 `index.html` 里内联的报错收集挪出来；2) **只要窗口是竖的就把整个游戏（`#rot` 容器）顺时针转 90°**（玩家把手机逆时针横过来拿、刘海在左；`?rot=0` 可关掉）。
  游戏里所有读屏幕坐标的地方都不用改：这里把 `MouseEvent` / `Touch` 的 `clientX/clientY/pageX/pageY/x/y` 和 `Element.getBoundingClientRect()` 换算成游戏横屏坐标
  （screen(x, y) → virtual(y, fw − x)）。
- `minitool.css`：舞台（16:9）按 `#rot` 转过来之后的宽高缩放；隐藏“请把手机横过来”的提示。
- `icon.png`：512×512，上面是记忆场景截图，下面是标题。
- `test_minitool.py`：按小红书容器 CSP 起服务，手机竖屏模拟 + CDP 真实触摸。

## 验证

`python dev/minitool/test_minitool.py`：27/27。
- 容器 CSP 下加载、点标题菜单“新游戏”、轻点天堂门进入漫游、完整流程 `RLP.autoplay()` 91/91：没有 CSP 违规、页面错误、请求失败。
- 竖屏转 90° 后：舞台 693×390（16:9）；真实触摸点中菜单和天堂门；左侧拖动是摇杆，向游戏上方推 = 向前走；向游戏右边拖动 = 向右转。
- 手机横屏、电脑横向窗口不转；电脑上窄而高的窗口（小红书模拟器）照转；`?rot=0` 不转。
- 测试里不能用 Playwright 的 `wait_for_function`（它在页面里 eval，会在容器 CSP 下报“script-src eval”，和游戏无关），改成轮询 `page.evaluate`。

上传（浏览器插件，用户已登录）：名称“锈湖：天堂岛3D”，简介“锈湖第一灾 3D同人解谜”，图标，zip 平台校验 **部署成功**，版本 1.0.0，标签“休闲玩法”，权限“不需要权限”。
**还没勾选协议、没点“发布小工具”**：等用户确认。

## 已知限制 / 没验证的

- **真机没测**：旋转方向、容器顶部返回钮的遮挡、WebGL 在小红书 WebView 里的帧率都没在真机上看过。扫码预览（右侧二维码）才能看到。游戏最重的画面有 700+ 次绘制、近百万三角形，靠 `engine.autoQuality` 自动降分辨率，低端机可能仍然卡。
- `game.js` 里有 3 处 `fetch(`，来自 three.js 自带的 `FileLoader` / `ImageBitmapLoader`，游戏没有调用；容器 CSP 也禁了联网。
- 版权：这是《锈湖：天堂岛》的同人 3D 重制，公开发布前要自己判断授权问题。
- 更新版本：改游戏后重新跑 `python dev/minitool/build.py`，在小工具列表里点“更新版本”重新上传 zip。
