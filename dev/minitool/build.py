r"""把锈湖：天堂岛 3D 打成小红书小工具 zip。只读项目里的 src/ 和 styles.css，输出到 dev/minitool/ 下的新目录和新 zip（不覆盖旧产物）。

小工具容器的限制（见 gintama-pixel-game 的《小红书小工具上架复盘》、官方 minitool-zip-builder 规范、官方文档 §2.2 / §3）：
  - 脚本只能是包内的普通外链脚本：不能内联、不能 import map、不能 eval / new Function、不能 WebAssembly、没有 Worker
  - 只允许 html css js png jpg jpeg gif webp svg woff woff2 json；zip ≤ 10 MB（目标 ≤ 9 MB）、文件数 ≤ 200
  - 容器永远竖屏、不能全屏、不能锁方向；兼容基线 Android 8.1 出厂 Chrome / WebView 61（编译到 ES2017），iOS 最低 18.4
  - CSP：media-src 'self'（<audio> 不许 data: / blob: 地址），connect-src 'none'
这个游戏没有任何外部素材（贴图全是 canvas 画的，声音是 WebAudio 程序合成的），所以不用转图片、也不用把音频写成 base64，只要：
  1. esbuild 把 ES 模块 + three.js 打成一个压缩过的普通脚本 game.js（IIFE）
  2. 对副本里的源码打补丁（顶层 await；全屏；分段启动 + 异步编译着色器；音频输出线路）——项目里的原文件不动
  3. compat.js（老内核垫片）+ rotate.js（竖屏旋转 + 坐标换算）+ audio_out.js（iPhone 出声）+ style.css（原样式 + 容器壳）+ 一个只有外链脚本的 index.html

用法：
  zip 默认写到 upload/xhs-minitool/，dist 目录仍在 dev/minitool/ 下。
  python dev/minitool/build.py                  声音版（带屏幕上的声音调试状态条）→ dist-audio/ + rusty-lake-minitool-audio.zip
  python dev/minitool/build.py --release        声音版，去掉调试状态条         → dist-audio-release/ + rusty-lake-minitool-audio-release.zip
  python dev/minitool/build.py --legacy         旧版（没有声音线路补丁、编译到 ES2019、不转写 CSS）→ dist/ + rusty-lake-minitool.zip（会覆盖旧产物）
  --out 目录 / --zip 文件                       改输出位置
声音版有两道闸门，不过就不出 zip：es2017_check.js（[语法]问题 = 0，Chrome 61 解析不了的写法）和 css_compat.py 的 [布局] 扫描。
环境变量 ESBUILD 可指定 esbuild 可执行文件；node 要在 PATH 里（es2017_check.js 用全局安装的 typescript）。
"""
import argparse, glob, os, re, shutil, subprocess, sys, zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import css_compat

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
WORK = os.path.join(HERE, '_work')

ESBUILD_CANDIDATES = [os.environ.get('ESBUILD', '')] + sorted(glob.glob(r'D:\CodeWorkSpace\*\node_modules\@esbuild\win32-x64\esbuild.exe'))

INDEX_LEGACY = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>锈湖：天堂岛 3D</title>
<link rel="stylesheet" href="./style.css">
</head>
<body>
<div id="rot">
<div id="stage">
  <canvas id="game"></canvas>
  <div id="ui"></div>
  <div id="boot">载入中……</div>
</div>
</div>
<script src="./rotate.js"></script>
<script src="./game.js"></script>
</body>
</html>
"""

# 声音版：compat.js 最先（补接口），rotate.js 建 #rot 相关逻辑，audio_cfg.js（只有调试版有）设调试开关，audio_out.js 定义输出线路，最后 game.js
INDEX_AUDIO = INDEX_LEGACY.replace(
    '<script src="./rotate.js"></script>\n',
    '<script src="./compat.js"></script>\n<script src="./rotate.js"></script>\n{cfg}<script src="./audio_out.js"></script>\n')

# 打包后不应再出现的写法（容器禁用的能力）。three.js 里有些加载器会提到 fetch / Worker，但游戏没有调用，只报告不拦截。
BANNED = ['eval(', 'new Function', 'WebAssembly', 'requestFullscreen', 'webkitRequestFullscreen', 'navigator.geolocation', 'navigator.clipboard',
          'DeviceOrientation', 'DeviceMotion', 'serviceWorker', 'window.open', 'XMLHttpRequest', 'new WebSocket', 'new Worker', 'fetch(', 'import(', 'import.meta']
# 声音版额外检查：任何 data: / blob: 媒体地址、<audio> 地址相关的写法（容器 CSP media-src 'self' 会拦）
MEDIA_URL = ['data:audio', 'data:video', 'data:application/ogg', 'new Audio(', 'createObjectURL', 'blob:']

# #stage 原来用 CSS min() 算大小（Chrome 79 才支持）；小工具里 #rot #stage（minitool.css + rotate.js）已经覆盖了这三行，打包时删掉
STAGE_MIN = [
    "  width: min(100vw, var(--vh) * 177.7778);\n",
    "  height: min(56.25vw, var(--vh) * 100);\n",
    "  font-size: calc(min(100vw, var(--vh) * 177.7778) / 80);\n",
]


def rd(p):
    return open(p, encoding='utf-8').read()


def wr(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)


def patch(rel, subs):
    p = os.path.join(WORK, rel)
    s = rd(p)
    for old, new in subs:
        assert s.count(old) == 1, f'{rel}: 找不到 / 次数不对：{old[:70]!r}（命中 {s.count(old)} 次）'
        s = s.replace(old, new)
    wr(p, s)


def run_es2017_gate(dist):
    node = shutil.which('node')
    assert node, '找不到 node（es2017_check.js 需要）'
    r = subprocess.run([node, os.path.join(HERE, 'es2017_check.js'), dist], capture_output=True, text=True, encoding='utf-8')
    out = (r.stdout + r.stderr).strip()
    print('--- es2017_check（Chrome 61 兼容闸门）---\n' + out)
    assert r.returncode == 0, 'es2017_check 有 [语法] 问题（或工具跑不起来），停止出包：Chrome 61 解析不了这些写法，整个脚本会 Unexpected token'


def main():
    ap = argparse.ArgumentParser(description='锈湖小红书小工具打包')
    ap.add_argument('--legacy', action='store_true', help='旧版（无声音线路补丁，ES2019，不转写 CSS），输出 dist/ + rusty-lake-minitool.zip')
    ap.add_argument('--release', action='store_true', help='声音版去掉屏幕上的声音调试状态条')
    ap.add_argument('--ark', action='store_true', help='口袋方舟（233 乐园）H5 包：第一到第四灾（2026-10-24 起；之前是第一到第三灾），原生横屏外壳（不旋转竖屏）+ 安全区，等同 --release；输出 dist-ark-ch1234/ + upload/ark/rusty-lake-ark-ch1234.zip')
    ap.add_argument('--no-minify', action='store_true', help='不压缩、保留函数名（只用来做 CPU 采样 / 排查，不要上传）')
    ap.add_argument('--out', help='输出目录（默认见上）')
    ap.add_argument('--zip', help='zip 路径（默认见上）')
    a = ap.parse_args()
    assert not (a.legacy and a.release), '--legacy 没有调试状态条，不需要 --release'
    assert not (a.ark and a.legacy), '--ark 走声音版（ES2017）路径，不能和 --legacy 一起用'
    audio = not a.legacy
    if a.ark:
        a.release = True   # 口袋方舟包没有声音调试状态条
    if a.legacy:
        name_dist, name_zip = 'dist', 'rusty-lake-minitool.zip'
    elif a.ark:
        name_dist, name_zip = 'dist-ark-ch1234', 'rusty-lake-ark-ch1234.zip'
    elif a.release:
        name_dist, name_zip = 'dist-audio-release', 'rusty-lake-minitool-audio-release.zip'
    else:
        name_dist, name_zip = 'dist-audio', 'rusty-lake-minitool-audio.zip'
    DIST = os.path.abspath(a.out) if a.out else os.path.join(HERE, name_dist)
    ZIP = os.path.abspath(a.zip) if a.zip else os.path.join(ROOT, 'upload', 'ark' if a.ark else 'xhs-minitool', name_zip)   # 发布包统一放 upload/

    esbuild = next((c for c in ESBUILD_CANDIDATES if c and os.path.exists(c)), None)
    assert esbuild, '找不到 esbuild.exe（装一个，或设置环境变量 ESBUILD）'

    for d in (WORK, DIST):
        if os.path.exists(d):
            shutil.rmtree(d)
    shutil.copytree(os.path.join(ROOT, 'src'), os.path.join(WORK, 'src'))

    # ---- 补丁 1：characters.js 顶层 await（普通脚本不支持）。props.js 不反向引用 characters.js，静态引用没有环
    patch('src/art/characters.js', [(
        "let makeProp = null;\ntry { ({ makeProp } = await import('./props.js')); } catch (e) { makeProp = null; }",
        "import { makeProp as __makeProp } from './props.js';\nlet makeProp = __makeProp;",
    )])

    # ---- 补丁 2：全屏。容器统一管理全屏，requestFullscreen 被禁用；全屏按钮在 fullscreenSupported() 为 false 时自动隐藏
    p = os.path.join(WORK, 'src/core/ui.js')
    s = rd(p)
    # 全屏与章节菜单的辅助函数相邻，按大段注释截断会误删 chapterOpen，导致首页在按钮绑定前抛错。
    for name, body in [('fullscreenSupported', '  return false;'), ('enterFullscreen', ''), ('toggleFullscreen', '')]:
        pattern = rf'^function {name}\(\) \{{\n.*?^\}}'
        replacement = f'function {name}() {{\n{body}\n}}'
        s, count = re.subn(pattern, lambda _: replacement, s, flags=re.MULTILINE | re.DOTALL)
        assert count == 1, f'src/core/ui.js: 全屏补丁必须只匹配一个 {name} 函数（命中 {count} 次）'
    wr(p, s)

    # ---- 补丁 2b：玩家可见文字里的“死”改成 S（V1.0.6 被“内容未通过平台综合审核”驳回，后台只给一句话；同 V1.0.3 / V1.0.4 的“血”→x）。
    #      只改打包副本，网页版源码不动；逐条精确匹配，文案改了会在这里停下来，不会悄悄漏掉。
    patch('src/chapters/index.js', [("title: { zh: '长子之死', en: 'Death of the Firstborn' }", "title: { zh: '长子之S', en: 'Death of the Firstborn' }")])
    patch('src/chapters/plague1/text.js', [("'自从收到母亲的死讯，'", "'自从收到母亲的S讯，'")])
    # 第三灾 David 的台词“我今天血糖非常低.”：小红书审核对“血”字敏感（V1.0.4 起第一灾一律写 x），打包副本里同样改成 x；口袋方舟包保持原文。
    if not a.ark:
        patch('src/chapters/plague3/text.js', [("david: '我今天血糖非常低.',", "david: '我今天x糖非常低.',")])
    # 第四灾的“生与死的炼金术”书名已随书改视图翻页（29336f3）从 text.js 里去掉。第四灾进小红书包（2026-10-24 起）：书页里画在画布上的
    # “将会有一个人遇见死亡”同样把“死”改成 S。
    patch('src/art/props_flies_book.js', [("text(g, '遇见死亡', PW / 2, 206, 44);", "text(g, '遇见S亡', PW / 2, 206, 44);")])

    # ---- 补丁 3：分段启动。原来的启动（建世界 + 第一次渲染编译着色器）是一条几十秒不让出主线程的长任务：慢手机上页面
    #      整段没响应、load 事件迟迟不触发，容器 / 审核看到的就是“点不了”。改成每一步之间让出一帧（rotate.js 的 __RLP_STAGE
    #      同时更新“载入中”页的文字），第一屏的着色器改用 compileAsync（支持并行编译的 WebView 里不卡主线程；不支持就和原来一样）。
    patch('src/main.js', [
        ("async function boot() {\n  const canvas = document.getElementById('game');\n",
         "const __stage = (t) => (window.__RLP_STAGE ? window.__RLP_STAGE(t) : Promise.resolve());\n"
         "let __earlyChoice = null;   // 提前出现的标题菜单的选择（下面 3c）\n"
         "async function boot() {\n  await __stage('初始化画面…');\n  const canvas = document.getElementById('game');\n"),
        # 3c 标题菜单提前出现：审核说“页面按钮无法点击”（V1.0.10 / V1.0.11 连续两次），模拟器里能点，但原来菜单要等建世界 + 编译着色器全部做完才出现
        #    （桌面 6 秒，慢手机十几二十秒，期间满屏“载入中”，点什么都没反应）。核心（界面 / 存档 / 音频）初始化完就把标题菜单画出来，
        #    世界在后台继续搭；提前点了开始 / 章节就排队，世界搭好再进（菜单上写“正在载入”）。载入提示缩成屏幕下方一行小字（minitool.css 的 .boot-early）。
        ("  if (DEMO && q.get('world') !== '1') {\n    world = buildStubWorld(engine);\n",
         "  if (!AUTOTEST && !DEMO && !SWITCH && !(q.has('view') || q.get('skipIntro') === '1' || q.has('chapter'))) {\n"
         "    document.getElementById('stage').classList.add('boot-early');\n"
         "    __earlyChoice = ui.menu.show(CHAPTERS);\n"
         "    __earlyChoice.then(() => {\n"
         "      const m = document.querySelector('.menu'), st = document.querySelector('.menu-status');\n"
         "      if (m) m.style.pointerEvents = 'none';\n"
         "      if (st) st.textContent = '正在载入，马上开始……';\n"
         "    });\n"
         "  }\n"
         "  if (DEMO && q.get('world') !== '1') {\n    world = buildStubWorld(engine);\n"),
        ("  const choice = await ui.menu.show(CHAPTERS);\n", "  const choice = await (__earlyChoice || ui.menu.show(CHAPTERS));\n"),
        ("  engine.start();\n  document.getElementById('boot')?.remove();\n",
         "  engine.start();\n  document.getElementById('boot')?.remove();\n  document.getElementById('stage').classList.remove('boot-early');\n"),
        ("    mark('worldImport');\n    await preloadModels(['tower']);   // 岛上的石塔是网格模型，世界建好之前先加载（失败回退程序化塔）\n    world = buildWorld(engine);\n",
         "    mark('worldImport');\n    await __stage('搭建小岛…');\n    world = await buildWorld(engine);\n"),
        ("  await ensureChapter(bootChapterNumber());\n"
         "  mark('chapterSetup');\n  if (engine.renderEnabled) engine.render(); // compile shaders up front\n",
         "  await __stage('布置场景…');\n"
         "  await ensureChapter(bootChapterNumber());\n"
         "  mark('chapterSetup');\n"
         "  await __stage('准备画面（第一次会慢一点）…');\n"
         "  if (engine.renderEnabled) {\n"
         "    try {\n"
         "      await Promise.race([\n"
         "        engine.renderer.compileAsync((world.zones && world.zones.exterior) || engine.scene, engine.camera, engine.scene),\n"
         "        new Promise((r) => setTimeout(r, 20000)),\n"
         "      ]);\n"
         "    } catch { /* 退回同步编译 */ }\n"
         "    // 第一次渲染要把几十个着色器程序全部链接完，是启动里最长的一次卡顿（手机 GPU 上要好几秒，期间页面合成不出来，\n"
         "    // 表现成白屏 ↔ 载入页闪烁）：先分片预热（每片只渲一部分物体，片间让出一帧），最后再整体渲一次\n"
         "    try { if (window.__RLP_WARM) await window.__RLP_WARM(engine, world); } catch { /* 退回一次性编译 */ }\n"
         "    engine.render(); // compile shaders up front\n"
         "  }\n"),
        ("boot().catch(showBootError);\n",
         "{\n"
         "  // 等页面 load 之后、先画一帧“载入中”再开始：load 事件不被启动拖住；容器万一迟迟不触发 load，1.5 秒后也照样开始\n"
         "  let started = false;\n"
         "  const go = () => { if (started) return; started = true; __stage('载入中……').then(() => boot()).catch(showBootError); };\n"
         "  if (document.readyState === 'complete') go(); else { window.addEventListener('load', go); setTimeout(go, 1500); }\n"
         "}\n"),
    ])
    patch('src/art/world.js', [
        ("export function buildWorld(engine) {\n",
         "export async function buildWorld(engine) {\n"
         "  const __stage = (t) => (window.__RLP_STAGE ? window.__RLP_STAGE(t) : Promise.resolve());\n"),
        ("  const sky = buildSky(engine.scene);\n", "  await __stage('搭建天空和湖面…');\n  const sky = await buildSky(engine.scene);\n"),
        ("  const lake = buildLake();\n", "  await __stage();\n  const lake = buildLake();\n"),
        ("  const island = buildIsland();\n", "  await __stage('种树铺地…');\n  const island = await buildIsland();\n"),
        ("  const buildings = buildBuildings();\n", "  await __stage('盖房子…');\n  const buildings = await buildBuildings();\n"),
    ])
    # 分段启动（细）：慢手机（按桌面的 4 倍慢算）上，buildIsland / buildBuildings / 章节 setup 每一块都是 1～3 秒不让出主线程的长任务，
    # 容器 / 系统看到页面长时间无响应会判定卡死并重载（白屏 ↔ 载入页反复交替）。这里在它们内部的子步骤之间让出一帧；只改打包副本。
    STAGE_DEF = "  const __stage = (t) => (window.__RLP_STAGE ? window.__RLP_STAGE(t) : Promise.resolve());\n"
    patch('src/art/sky.js', [
        ("export function cpuCanvas(w, h) {\n", STAGE_DEF.replace('  const', 'const', 1) + "export function cpuCanvas(w, h) {\n"),
        ("export function buildSky(scene) {\n  const group = new THREE.Group();\n",
         "export async function buildSky(scene) {\n" + STAGE_DEF + "  const group = new THREE.Group();\n"),
        ("  group.add(makeDome(shared));\n  const ring = makeRing(shared);\n  group.add(ring);\n  group.add(makeHills());\n",
         "  group.add(await makeDome(shared));\n  await __stage();\n  const ring = makeRing(shared);\n  group.add(ring);\n  await __stage();\n  group.add(makeHills());\n  await __stage();\n"),
        # 云：136 次带渐变的画布绘制，浏览器攒到任务结束才光栅化；按批次让出一帧，把这一大块拆开
        ("function makeDome(shared) {\n  const clouds = paintClouds();\n", "async function makeDome(shared) {\n  const clouds = await paintClouds();\n"),
        ("function paintClouds() {\n", "async function paintClouds() {\n"),
        ("  for (let i = 0; i < 70; i++) {\n    const y = H * (0.18 + r() * 0.8);\n", "  for (let i = 0; i < 70; i++) {\n    if (i % 18 === 17) await __stage();\n    const y = H * (0.18 + r() * 0.8);\n"),
        ("  for (let i = 0; i < 40; i++) {\n    const y = H * (0.62 + r() * 0.34);\n", "  for (let i = 0; i < 40; i++) {\n    if (i % 14 === 13) await __stage();\n    const y = H * (0.62 + r() * 0.34);\n"),
        ("  for (let i = 0; i < 26; i++) {\n    const y = H * (0.25 + r() * 0.45);\n", "  for (let i = 0; i < 26; i++) {\n    if (i % 13 === 12) await __stage();\n    const y = H * (0.25 + r() * 0.45);\n"),
    ])
    patch('src/art/island.js', [
        # 地形：每隔若干行让出一帧（buildTerrain / paintGround 在副本里变成 async）
        ("const TX0 = -44, TZ0 = -47, TW = 90, TD = 102;\n",
         "const TX0 = -44, TZ0 = -47, TW = 90, TD = 102;\n" + STAGE_DEF.replace('  const', 'const', 1)),
        ("  const terrain = buildTerrain();\n", "  const terrain = await buildTerrain();\n"),
        ("function buildTerrain() {\n", "async function buildTerrain() {\n"),
        ("  for (let j = 0; j < nz; j++) {\n    const z = TZ0 + j * step;\n",
         "  for (let j = 0; j < nz; j++) {\n    if (j % 20 === 19) await __stage();\n    const z = TZ0 + j * step;\n"),
        ("  geo.computeVertexNormals();\n  geo.computeBoundingSphere();\n  const map = paintGround();\n",
         "  await __stage();\n  geo.computeVertexNormals();\n  geo.computeBoundingSphere();\n  await __stage();\n  const map = await paintGround();\n"),
        ("function paintGround() {\n", "async function paintGround() {\n"),
        ("  for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {\n    const x = TX0 + (i / G) * TW, z = TZ0 + (j / G) * TD;\n",
         "  for (let j = 0; j <= G; j++) { if (j % 20 === 19) await __stage(); for (let i = 0; i <= G; i++) {\n    const x = TX0 + (i / G) * TW, z = TZ0 + (j / G) * TD;\n"),
        ("    nnG[j * (G + 1) + i] = fbm2(n, x * 0.18, z * 0.18, 4);\n  }\n  const F = 2 * G;\n",
         "    nnG[j * (G + 1) + i] = fbm2(n, x * 0.18, z * 0.18, 4);\n  } }\n  const F = 2 * G;\n"),
        ("  for (let j = 0; j <= F; j++) for (let i = 0; i <= F; i++) nfG[j * (F + 1) + i] = fbm2(n, (TX0 + (i / F) * TW) * 0.9 + 40, (TZ0 + (j / F) * TD) * 0.9, 2);\n",
         "  for (let j = 0; j <= F; j++) { if (j % 40 === 39) await __stage(); for (let i = 0; i <= F; i++) nfG[j * (F + 1) + i] = fbm2(n, (TX0 + (i / F) * TW) * 0.9 + 40, (TZ0 + (j / F) * TD) * 0.9, 2); }\n"),
        ("  for (let j = 0; j < LO; j++) {\n    const v = (j + 0.5) / LO, z = TZ0 + v * TD;\n",
         "  for (let j = 0; j < LO; j++) {\n    if (j % 64 === 63) await __stage();\n    const v = (j + 0.5) / LO, z = TZ0 + v * TD;\n"),
        ("  lg.putImageData(img, 0, 0);\n\n  return cpuTexture(SIZE, SIZE, (g) => {\n",
         "  lg.putImageData(img, 0, 0);\n  await __stage();\n\n  return cpuTexture(SIZE, SIZE, (g) => {\n"),
        ("export function buildIsland() {\n  const group = new THREE.Group();\n",
         "export async function buildIsland() {\n" + STAGE_DEF + "  const group = new THREE.Group();\n"),
        ("  lap('terrain');\n", "  lap('terrain');\n  await __stage();\n"),
        ("  lap('palisade+dock');\n", "  lap('palisade+dock');\n  await __stage();\n"),
        ("  lap('forest');\n", "  lap('forest');\n  await __stage();\n"),
        ("  lap('trees');\n", "  lap('trees');\n  await __stage();\n"),
        ("  lap('shed fence');\n", "  lap('shed fence');\n  await __stage();\n"),
        ("  lap('rocks+thorns');\n", "  lap('rocks+thorns');\n  await __stage();\n"),
    ])
    patch('src/art/buildings.js', [
        ("export function buildBuildings() {\n  const anchors = new Map();\n",
         "export async function buildBuildings() {\n" + STAGE_DEF + "  const anchors = new Map();\n"),
        ("  exterior.add(buildHouse(anchors), buildShedWall(anchors), buildTemple(anchors), buildTower());\n",
         "  exterior.add(buildHouse(anchors));\n  await __stage();\n  exterior.add(buildShedWall(anchors));\n  exterior.add(buildTemple(anchors));\n  await __stage();\n"
         "  exterior.add(buildTower());\n  await __stage();\n"),
        ("  const sets = {\n    house_int: buildHouseInt(anchors),\n    temple_int: buildTempleInt(anchors),\n    memory: buildMemory(anchors),\n  };\n",
         "  const sets = {};\n  sets.house_int = buildHouseInt(anchors);\n  await __stage();\n  sets.temple_int = buildTempleInt(anchors);\n  await __stage();\n"
         "  sets.memory = buildMemory(anchors);\n  await __stage();\n"),
    ])
    # 轻量模式（rotate.js 的 window.__RLP_LITE：启动被反复重载时自动打开）：关阴影、像素比降到 1、关水面倒影
    patch('src/core/engine.js', [
        ("    this.maxPixelRatio = Math.min(coarse ? 1.75 : 2, window.devicePixelRatio || 1);\n",
         "    this.maxPixelRatio = Math.min(coarse ? 1.75 : 2, window.devicePixelRatio || 1);\n    if (window.__RLP_LITE) this.maxPixelRatio = Math.min(this.maxPixelRatio, 1);\n"),
        ("    renderer.shadowMap.enabled = true;\n", "    renderer.shadowMap.enabled = !window.__RLP_LITE;\n"),
    ])
    patch('src/art/world.js', [
        ("      lake.reflect = extVisible && !deep;\n", "      lake.reflect = extVisible && !deep && !window.__RLP_LITE;\n"),
    ])
    patch('src/main.js', [
        ("  bootDone();\n  RLP.ready = true;\n", "  bootDone();\n  RLP.ready = true;\n  if (window.__RLP_BOOT_DONE) window.__RLP_BOOT_DONE();\n"),
    ])
    # 第四灾的 setup 是 world.setup + story.setup 两大块：中间让出一帧
    patch('src/chapters/plague4/index.js', [("await world.setup(ctx); story.setup(ctx); this.sync(ctx);",
                                             "await world.setup(ctx); if (window.__RLP_STAGE) await window.__RLP_STAGE(); story.setup(ctx); this.sync(ctx);")])
    # 章节 setup：每个部分之间让出一帧（第一、二、三灾都是 `for (const part of PARTS) await part.setup(ctx);`）
    for chap in ('plague1', 'plague2', 'plague3'):
        patch(f'src/chapters/{chap}/index.js', [(
            "for (const part of PARTS) await part.setup(ctx);",
            "for (const part of PARTS) { await part.setup(ctx); if (window.__RLP_STAGE) await window.__RLP_STAGE(); }",
        )])
    # 解锁顺序在源码注册表里：前五灾严格按顺序（第二灾 requires 第一灾，第三灾 requires 第一、二灾，第四灾 requires 第一到第三灾，第五灾 requires 第一到第四灾；没通关前置章节菜单里就是“未解锁”），这里不用再补。
    # 开放范围：口袋方舟包和小红书小工具都是第一到第四灾（2026-10-24 起；口袋方舟之前只有第一到第三灾）。第五灾的谜题正在重做成真 3D（牛身疫斑 / 菜地 / 连线 / 砧板），
    # 两种包里都不注册它的 load（菜单显示“敬请期待”，代码也不进包）。
    _reg = rd(os.path.join(WORK, 'src/chapters/index.js'))
    assert "requires: ['plague1', 'plague2', 'plague3'], load: () => import('./plague4/index.js') }" in _reg, '源码注册表里第四灾的解锁条件变了（要先通关第一到第三灾）：更新 build.py'
    assert "requires: ['plague1', 'plague2', 'plague3', 'plague4'], load: () => import('./plague5/index.js') }" in _reg, '源码注册表里第五灾的解锁条件变了（要先通关第一到第四灾，且不再是 wip）：更新 build.py'
    cut = [("load: () => import('./plague5/index.js') }", "load: null }")]
    patch('src/chapters/index.js', cut)
    assert "requires: ['plague1', 'plague2'], load: () => import('./plague3/index.js') }" in rd(os.path.join(WORK, 'src/chapters/index.js')), '源码注册表里第三灾的解锁条件变了（要先通关第一、二灾）：更新 build.py'

    # ---- 补丁 4（声音版）：音频输出线路。audio.js 是程序合成（振荡器 / 噪声 / 卷积混响），总线最后一级 comp 原来直连 ac.destination；
    #      换成交给 audio_out.js：iPhone 上走 audioSession + MediaStream → <audio srcObject>（绕开静音拨片），其它平台直连（和原来一样）。
    if audio:
        patch('src/core/audio.js', [(
            "master.connect(comp); comp.connect(ac.destination);",
            "master.connect(comp);\n"
            "    // [小红书小工具] 输出线路交给 audio_out.js（iPhone：audioSession + MediaStream → <audio>，绕开静音拨片）；没有它就直连\n"
            "    if (window.__RLP_AUDIO_OUT) window.__RLP_AUDIO_OUT(ac, comp); else comp.connect(ac.destination);",
        )])

    # ---- 打包。声音版编译到 ES2017（Chrome 61 / Android 8.1 WebView 的基线）：esbuild 会把 ?. ?? catch {} 类字段对象展开等降级；
    #      旧版是 ES2019，里面的 catch {}（Chrome 66+）在老安卓上会让整个 game.js 解析失败。
    vendor = os.path.join(ROOT, 'vendor', 'three').replace('\\', '/')
    target = 'es2019' if a.legacy else 'es2017'
    cmd = [esbuild, 'src/main.js', '--bundle', '--format=iife', '--minify', f'--target={target}', '--legal-comments=none', '--log-level=warning',
           f'--alias:three={vendor}/three.module.js', f'--alias:three/addons={vendor}/addons', f'--outfile={DIST}/game.js']
    if a.no_minify:
        cmd = [c for c in cmd if c != '--minify'] + ['--keep-names']
    r = subprocess.run(cmd, cwd=WORK, capture_output=True, text=True, encoding='utf-8')
    sys.stdout.write(r.stdout + r.stderr)
    assert r.returncode == 0, 'esbuild 失败'

    # ---- 声音版：再打一份不压缩的副本只用来扫运行时接口。压缩后的代码一行很长，es2017_check 会把行内 "//"（比如字符串里的 http://）后面的内容当注释丢掉，漏报
    scan_dir = os.path.join(HERE, '_scan')
    if audio:
        if os.path.exists(scan_dir):
            shutil.rmtree(scan_dir)
        r = subprocess.run([c for c in cmd if c != '--minify' and not c.startswith('--outfile=')] + [f'--outfile={scan_dir}/game.js'],
                           cwd=WORK, capture_output=True, text=True, encoding='utf-8')
        assert r.returncode == 0, 'esbuild（不压缩副本）失败'

    # ---- 其余文件
    if a.legacy:
        index = INDEX_LEGACY
    else:
        index = INDEX_AUDIO.replace('{cfg}', '' if a.release else '<script src="./audio_cfg.js"></script>\n')
        if a.ark:   # ark_cfg.js 要在 rotate.js 读它之前加载
            index = index.replace('<script src="./rotate.js"></script>\n', '<script src="./ark_cfg.js"></script>\n<script src="./rotate.js"></script>\n')
            assert index.count('./ark_cfg.js') == 1, 'index.html 里没找到 rotate.js 的位置'
    wr(os.path.join(DIST, 'index.html'), index)
    shutil.copy(os.path.join(HERE, 'rotate.js'), os.path.join(DIST, 'rotate.js'))
    css = rd(os.path.join(ROOT, 'styles.css'))
    if audio:
        for line in STAGE_MIN:
            assert css.count(line) == 1, f'styles.css 里找不到 #stage 的 min() 行：{line.strip()}（样式改过了？更新 build.py 的 STAGE_MIN）'
            css = css.replace(line, '')
        css = css.replace('#stage {\n  --vh: 1vh;', '#stage {\n  /* [小红书小工具] 舞台大小由 minitool.css 的 #rot #stage + rotate.js 提供（Chrome 61 不认 CSS 的 min()） */\n  --vh: 1vh;', 1)
        mini_css = rd(os.path.join(HERE, 'minitool.css'))
        if a.ark:
            # 口袋方舟是原生横屏 WebView：不再隐藏游戏自带的竖屏旋转提示（styles.css 里 portrait + 粗指针 + 窄屏时显示），再追加安全区等外壳样式
            hint_line = '.rotate-hint { display: none !important; }'
            assert mini_css.count(hint_line) == 1, 'minitool.css 里找不到 .rotate-hint 隐藏规则（改过了？更新 build.py）'
            mini_css = mini_css.replace(hint_line, '/* [口袋方舟] 竖屏旋转提示由游戏自己显示 */')
            mini_css += '\n' + rd(os.path.join(HERE, 'ark.css'))
        css += '\n' + mini_css
        css, notes = css_compat.transform(css)
        print('--- CSS 兼容转写 ---\n' + '\n'.join(notes))
        found = css_compat.scan(css)
        for lvl, ln, why in found:
            print(f'[{lvl}] style.css:{ln}  {why}')
        assert not [f for f in found if f[0] == '布局'], 'style.css 里还有 Chrome 61 会塌掉布局的写法，停止出包'
        shutil.copy(os.path.join(HERE, 'compat.js'), os.path.join(DIST, 'compat.js'))
        shutil.copy(os.path.join(HERE, 'audio_out.js'), os.path.join(DIST, 'audio_out.js'))
        if a.ark:
            wr(os.path.join(DIST, 'ark_cfg.js'), '// 口袋方舟版：rotate.js 读到它就不旋转竖屏、不改事件坐标和元素矩形读数（平台 WebView 本来就是横屏）。build.py --ark 生成。\nwindow.__RLP_NOROT = true;\n')
        if not a.release:
            wr(os.path.join(DIST, 'audio_cfg.js'), '// 调试版：左下角显示声音状态条（audio_out.js 读它）。build.py --release 不带这个文件。\nwindow.RLP_AUDIO_DEBUG = true;\n')
    else:
        css += rd(os.path.join(HERE, 'minitool.css'))
    wr(os.path.join(DIST, 'style.css'), css)
    shutil.rmtree(WORK)

    # ---- 自检
    game = rd(os.path.join(DIST, 'game.js'))
    print('game.js 里的禁用写法（只报告）：', {k: game.count(k) for k in BANNED if game.count(k)} or '无')
    own = rd(os.path.join(DIST, 'rotate.js')) + index
    assert not re.search(r'<script(?![^>]*\bsrc=)[^>]*>', index), 'index.html 里有内联脚本'
    assert not re.search(r'\bon[a-z]+\s*=\s*["\']', index), 'index.html 里有行内事件'
    assert 'eval(' not in own and 'new Function' not in own
    css = rd(os.path.join(DIST, 'style.css'))
    assert not re.search(r'https?://', css), 'style.css 里有外部地址'
    assert not re.search(r'@import', css)
    if audio:
        out_js = rd(os.path.join(DIST, 'audio_out.js'))
        assert '__RLP_AUDIO_OUT' in game, 'game.js 里没有音频输出线路的补丁'
        assert game.count('data:audio') == 0 and game.count('data:video') == 0, 'game.js 里有 data: 音视频地址（容器 CSP 的 media-src 会拦）'
        assert not any(k in out_js for k in ('blob:', 'createObjectURL', 'data:')), 'audio_out.js 里有 data: / blob: 地址'
        assert out_js.count('new Audio(') == 1 and game.count('new Audio(') == 0, '<audio> 元素只应该在 audio_out.js 里创建一次'
        print('game.js 里的媒体地址相关写法（three.js 的加载器可能提到，游戏没调用，只报告）：', {k: game.count(k) for k in MEDIA_URL if game.count(k)} or '无')
        run_es2017_gate(DIST)
        # 不压缩副本上的接口提示（只报告：每一条人工判断有没有保护 / 垫片）
        node = shutil.which('node')
        r = subprocess.run([node, os.path.join(HERE, 'es2017_check.js'), scan_dir], capture_output=True, text=True, encoding='utf-8')
        print('--- es2017_check（不压缩副本，运行时接口提示更完整；compat.js 已补 flat / flatMap / Promise.finally）---\n' + (r.stdout + r.stderr).strip())
        shutil.rmtree(scan_dir)

    # ---- zip：index.html 在根目录，只放 dist 里的文件，路径用正斜杠
    names = sorted(os.listdir(DIST), key=lambda n: (n != 'index.html', n))
    if os.path.dirname(ZIP):
        os.makedirs(os.path.dirname(ZIP), exist_ok=True)
    with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for n in names:
            z.write(os.path.join(DIST, n), n)
    size = os.path.getsize(ZIP)
    print(f'{ZIP}\n  {len(names)} 个文件，{size / 1024 / 1024:.2f} MB（{size} 字节，十进制 {size / 1e6:.2f} MB）：' +
          '，'.join(f'{n} {os.path.getsize(os.path.join(DIST, n)) // 1024} KB' for n in names))
    assert size < 10 * 1000 * 1000 and len(names) <= 200, 'zip 超过 10 MB（十进制）或文件数超过 200'


if __name__ == '__main__':
    main()
