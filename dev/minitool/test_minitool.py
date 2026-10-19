r"""验证小工具包（dev/minitool/dist）：按小红书容器的 CSP 起静态服务，用手机竖屏模拟真实触摸。

  1. 容器 CSP 下加载：没有 CSP 违规、没有页面错误、没有请求失败
  2. 手机竖屏（390×844）：画面被转 90°，舞台是 16:9，按键和摇杆在屏幕上都看得见
  3. 转过来的画面里：真实触摸点标题菜单 → 开始游戏；轻点天堂门进入漫游；左侧拖动是摇杆（向前走）；右侧拖动转视角（方向对）
  4. 手机横屏（844×390）和电脑横向窗口不转；电脑上窄而高的窗口（小红书模拟器）照转
  5. 完整流程 RLP.autoplay() 在竖屏转过来的画面里跑完

用法：python dev/minitool/test_minitool.py [输出目录]
  环境变量 MINITOOL_DIST 指定要测的目录（默认 dev/minitool/dist，即旧版；声音版是 dev/minitool/dist-audio）
"""
import functools, http.server, json, math, os, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.abspath(os.environ.get('MINITOOL_DIST') or os.path.join(HERE, 'dist'))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '_test_out')
os.makedirs(OUT, exist_ok=True)

# 小红书容器的 CSP（zip-artifact-spec.md §3）
CSP = ("default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
       "font-src 'self'; media-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")


class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass


socketserver.ThreadingTCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(H, directory=DIST))
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}'

results = []


def check(name, ok, detail=None):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + json.dumps(detail, ensure_ascii=False) if detail is not None else ''))


class Fingers:
    """多指触摸（CDP 真实触摸事件）：每次事件都带上当前所有按着的手指。"""
    def __init__(self, cdp):
        self.cdp, self.pts = cdp, {}

    def _send(self, kind):
        pts = [{'x': x, 'y': y, 'id': i, 'radiusX': 6, 'radiusY': 6, 'force': 1} for i, (x, y) in self.pts.items()]
        self.cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': pts})

    def down(self, i, x, y):
        self.pts[i] = (x, y); self._send('touchStart')

    def move(self, i, x, y):
        self.pts[i] = (x, y); self._send('touchMove')

    def up(self, i):
        self.pts.pop(i, None); self._send('touchEnd')

    def tap(self, x, y, i=9):
        self.down(i, x, y); time.sleep(0.06); self.up(i)

    def drag(self, i, x0, y0, x1, y1, steps=10, dt=0.03):
        self.down(i, x0, y0)
        for k in range(1, steps + 1):
            self.move(i, x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps); time.sleep(dt)
        self.up(i)


def poll(page, expr, timeout=30.0, every=0.25):
    """轮询页面里的表达式直到为真（page.evaluate 不受页面 CSP 影响；wait_for_function 会在页面里 eval，触发 CSP 违规）。"""
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(f'!!({expr})'):
            return True
        time.sleep(every)
    return False


def new_page(browser, w, h, mobile=True, dsf=1):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dsf, is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page()
    log = {'errors': [], 'failed': []}
    page.add_init_script("document.addEventListener('securitypolicyviolation', e => (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI));")
    page.on('console', lambda m: log['errors'].append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: log['errors'].append(f'[pageerror] {e}'))
    page.on('requestfailed', lambda r: log['failed'].append(f'{r.url} {r.failure}'))
    return ctx, page, log


def to_screen(page, xv, yv):
    """游戏横屏坐标 → 屏幕坐标（竖屏转过来时 virtual(x, y) = frame (fw - y, x)；没转时原样）。"""
    return page.evaluate('([x, y]) => { const S = window.__RLP_ROT; return S.rot ? { x: S.fw - y, y: x } : { x, y }; }', [xv, yv])


def vrect(page, sel):
    return page.evaluate("(s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }", sel)


def tap_virtual(page, f, xv, yv):
    p = to_screen(page, xv, yv)
    f.tap(p['x'], p['y'])


def world_to_virtual(page, world):
    return page.evaluate("(p) => { const r = document.getElementById('game').getBoundingClientRect(); const s = RLP.ctx.views.project(p); return s ? { x: r.left + s.x * r.width, y: r.top + s.y * r.height } : null; }", world)


def settle(page, cond, timeout=30000):
    assert poll(page, cond, timeout / 1000), f'等待超时：{cond}'
    page.evaluate('RLP.idle()')
    time.sleep(0.3)


def info(page):
    return page.evaluate("(() => { const i = RLP.info(); return { view: i.view, freeMode: i.freeMode, roam: i.roam, flags: i.flags, touchMode: i.touchMode }; })()")


def csp_and_errors(page, log, label):
    csp = page.evaluate('window.__csp || []')
    check(f'{label}：没有 CSP 违规', not csp, csp[:5])
    errs = [e for e in log['errors'] if 'toNonIndexed' not in e and 'flatShading' not in e]
    check(f'{label}：没有页面错误', not errs, errs[:5])
    check(f'{label}：没有请求失败', not log['failed'], log['failed'][:5])


with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])

    # ------------------------------------------------------------------ 1. 手机竖屏：转画面 + 标题菜单 + 开始游戏
    ctx, page, log = new_page(browser, 390, 844, dsf=2)
    page.goto(f'{BASE}/index.html')
    assert poll(page, 'window.RLP && RLP.ready === true', 120)
    # ready 在失败路径也会置为 true，普通首页必须验证菜单完成，不能靠绕过菜单的 autoplay 代替。
    assert page.evaluate('RLP.bootError') is None, page.evaluate('RLP.bootError')
    assert poll(page, "document.querySelector('.menu.show') && document.querySelectorAll('.menu-link').length === 3", 10), '首页菜单未完整显示'
    time.sleep(1.5)
    S = page.evaluate('window.__RLP_ROT')
    check('手机竖屏：画面转了 90°', S['rot'] is True, S)
    stage = vrect(page, '#stage')
    check('舞台按转过来的画面缩放（16:9）', abs(stage['w'] / stage['h'] - 16 / 9) < 0.02 and abs(stage['h'] - 390) < 2, stage)
    check('竖屏不显示“请把手机横过来”', page.evaluate("getComputedStyle(document.querySelector('.rotate-hint')).display") == 'none')
    check('全屏按钮不出现', page.evaluate("!document.querySelector('#stage').classList.contains('can-full')"))
    page.evaluate('RLP.ctx.engine.renderEnabled = true')
    time.sleep(1.5)
    page.screenshot(path=os.path.join(OUT, 'p01_title.png'))
    f = Fingers(ctx.new_cdp_session(page))

    check('普通首页：没有启动错误，开始和三项菜单入口完整显示',
          page.evaluate("!RLP.bootError && !!document.querySelector('.menu.show .menu-play') && document.querySelectorAll('.menu-link').length === 3"))
    check('章节菜单：第一、二灾开放，第四灾和开发中章节保持关闭',
          page.evaluate("document.querySelectorAll('.plague').length === 10 && [...document.querySelectorAll('.plague.open .lbl')].map(e => e.textContent).join(',') === '第一灾,第二灾'"))
    for n, title in [(2, '成就'), (3, '设置')]:
        r = vrect(page, f'.menu-link:nth-child({n})')
        tap_virtual(page, f, r['x'] + r['w'] / 2, r['y'] + r['h'] / 2)
        check(f'真实触摸“{title}”：面板打开',
              poll(page, f"document.querySelector('.menu-panel h2') && document.querySelector('.menu-panel h2').textContent === '{title}'", 10))
        if title == '设置':
            muted = page.evaluate('RLP.ctx.audio.muted')
            r = vrect(page, '.menu-panel input[type="checkbox"]')
            tap_virtual(page, f, r['x'] + r['w'] / 2, r['y'] + r['h'] / 2)
            check('真实触摸静音：设置立即生效', poll(page, f'RLP.ctx.audio.muted === {json.dumps(not muted)}', 10))
            r = vrect(page, '.menu-panel .btn.danger')
            tap_virtual(page, f, r['x'] + r['w'] / 2, r['y'] + r['h'] / 2)
            check('重置进度：先打开确认面板', poll(page, "document.querySelectorAll('.menu-panel').length === 2", 10))
            r = vrect(page, '.menu-panel:last-child .btn-row .btn:last-child')
            tap_virtual(page, f, r['x'] + r['w'] / 2, r['y'] + r['h'] / 2)
            check('取消重置：返回设置面板', poll(page, "document.querySelectorAll('.menu-panel').length === 1", 10))
        r = vrect(page, '.menu-panel .panel-x')
        tap_virtual(page, f, r['x'] + r['w'] / 2, r['y'] + r['h'] / 2)
        check(f'真实触摸关闭“{title}”：返回首页', poll(page, "!document.querySelector('.menu-panel')", 10))

    # 标题菜单：先点一下让音频解锁，再点“新游戏”
    link = vrect(page, '.menu-link')
    names = page.evaluate("[...document.querySelectorAll('.menu-link')].map(e => e.textContent)")
    check('标题菜单显示在屏幕上', page.evaluate('RLP.ctx.ui.menu.visible') is True and names[:1] == ['新游戏'], names)
    tap_virtual(page, f, link['x'] + link['w'] / 2, link['y'] + link['h'] / 2)
    started = poll(page, 'RLP.ctx.ui.menu.visible === false', 40)
    check('竖屏里真实触摸点中“新游戏”，菜单关闭、游戏开始（转过来的画面里坐标对得上）', started)
    page.screenshot(path=os.path.join(OUT, 'p02_after_tap.png'))
    csp_and_errors(page, log, '竖屏标题')
    ctx.close()

    # ------------------------------------------------------------------ 1b. 从标题菜单选第二灾：真实触摸点“II”，页面会重载一次（一个页面只能装一章）
    # 小工具容器里这条路径之前没验证过：重载后要回到第二灾的片头，不能回到标题菜单，也不能反复重载。
    ctx, page, log = new_page(browser, 390, 844, dsf=2)
    page.add_init_script("window.__loads = (+sessionStorage.getItem('__loads') || 0) + 1; sessionStorage.setItem('__loads', String(window.__loads));")
    page.goto(f'{BASE}/index.html')
    assert poll(page, "window.RLP && RLP.ready === true && document.querySelector('.menu.show')", 120)
    time.sleep(1.5)
    f = Fingers(ctx.new_cdp_session(page))
    r = vrect(page, '.plague:nth-child(2)')
    tap_virtual(page, f, r['x'] + r['w'] / 2, r['y'] + r['h'] / 2)

    def chapter2_started():
        try:
            return page.evaluate("!!(window.RLP && RLP.ready === true && RLP.chapter && RLP.chapter.number === 2 && RLP.state.view)")
        except Exception:      # 页面正在重载，执行上下文被销毁
            return False
    t_end = time.time() + 150
    while time.time() < t_end and not chapter2_started():
        time.sleep(0.5)
    check('菜单里触摸“第二灾”：页面重载后进入第二灾', chapter2_started())
    time.sleep(2.0)
    check('只重载了一次（没有重载循环），没有启动错误',
          page.evaluate("[+sessionStorage.getItem('__loads'), !RLP.bootError]") == [2, True], page.evaluate("[sessionStorage.getItem('__loads'), String(RLP.bootError)]"))
    check('第二灾的片头：停在总览，菜单已关闭', page.evaluate("RLP.state.view === 'overview' && RLP.ctx.ui.menu.visible === false"))
    page.screenshot(path=os.path.join(OUT, 'p02b_chapter2.png'))
    csp_and_errors(page, log, '菜单进第二灾')
    ctx.close()

    # ------------------------------------------------------------------ 2. 竖屏漫游：点天堂门、摇杆、转视角
    ctx, page, log = new_page(browser, 390, 844, dsf=2)
    page.goto(f'{BASE}/index.html?chapter=1&skipIntro=1&give=stick,line,hook')
    assert poll(page, "window.RLP && RLP.ready === true && RLP.state.view === 'overview'", 120)
    page.evaluate('RLP.idle()')
    time.sleep(1.0)
    f = Fingers(ctx.new_cdp_session(page))
    check('竖屏：识别为触屏界面', info(page)['touchMode'])
    g = world_to_virtual(page, [0, 3, 40])
    check('天堂门投影在舞台里', g is not None and 0 < g['x'] < 1000 and 0 < g['y'] < 400, g)
    tap_virtual(page, f, g['x'], g['y'])
    settle(page, "RLP.state.view === 'beach_mid' && RLP.info().freeMode")
    check('竖屏轻点天堂门进入漫游', info(page)['freeMode'])
    check('漫游时显示虚拟摇杆', page.evaluate("getComputedStyle(document.querySelector('.stick')).display") == 'block')
    rect = vrect(page, '#game')
    page.evaluate('RLP.ctx.engine.renderEnabled = true')
    time.sleep(1.2)
    page.screenshot(path=os.path.join(OUT, 'p03_roam.png'))

    z0 = info(page)['roam']['pos'][2]
    s = to_screen(page, rect['x'] + rect['w'] * 0.18, rect['y'] + rect['h'] * 0.72)
    # 摇杆向“游戏上方”推：游戏上方在屏幕上是右边（竖屏转 90°），所以手指往屏幕右边滑
    f.down(1, s['x'], s['y'])
    for k in range(1, 6):
        up = to_screen(page, rect['x'] + rect['w'] * 0.18, rect['y'] + rect['h'] * 0.72 - 14 * k)
        f.move(1, up['x'], up['y']); time.sleep(0.03)
    stick = info(page)['roam']['touch']['stick']
    time.sleep(0.8)
    f.up(1)
    time.sleep(0.3)
    z1 = info(page)['roam']['pos'][2]
    check('左侧拖动出现摇杆，向游戏上方推 = 向前', stick['y'] > 0.9 and abs(stick['x']) < 0.3, stick)
    check('向前走（z 变小）', z0 - z1 > 2, [z0, z1])

    page.evaluate("RLP.goto('beach_mid')")
    settle(page, 'RLP.info().freeMode')
    y0 = info(page)['roam']['yaw']
    a = to_screen(page, rect['x'] + rect['w'] * 0.55, rect['y'] + rect['h'] * 0.5)
    b = to_screen(page, rect['x'] + rect['w'] * 0.95, rect['y'] + rect['h'] * 0.5)
    f.drag(2, a['x'], a['y'], b['x'], b['y'], steps=12)
    time.sleep(0.3)
    y1 = info(page)['roam']['yaw']
    check('向游戏右边拖动 = 向右转（yaw 变大）', y1 - y0 > 0.5, [y0, y1])
    csp_and_errors(page, log, '竖屏漫游')
    ctx.close()

    # ------------------------------------------------------------------ 3. 手机横屏、电脑窗口：不转
    ctx, page, log = new_page(browser, 844, 390)
    page.goto(f'{BASE}/index.html?autotest=1')
    assert poll(page, 'window.RLP && RLP.ready === true', 120)
    S = page.evaluate('window.__RLP_ROT')
    stage = vrect(page, '#stage')
    check('手机横屏：不转，舞台铺满高度', S['rot'] is False and abs(stage['h'] - 390) < 2 and abs(stage['w'] - 390 * 16 / 9) < 3, [S, stage])
    ctx.close()
    # 容器永远是竖屏：电脑上的小红书模拟器（窄而高的窗口）也要转；?rot=0 可以关掉
    ctx, page, log = new_page(browser, 600, 900, mobile=False)
    page.goto(f'{BASE}/index.html?autotest=1')
    assert poll(page, 'window.RLP && RLP.ready === true', 120)
    S = page.evaluate('window.__RLP_ROT')
    check('电脑上窄而高的窗口（模拟器）：也转', S['rot'] is True, S)
    ctx.close()
    ctx, page, log = new_page(browser, 600, 900, mobile=False)
    page.goto(f'{BASE}/index.html?autotest=1&rot=0')
    assert poll(page, 'window.RLP && RLP.ready === true', 120)
    check('?rot=0：不转', page.evaluate('window.__RLP_ROT.rot') is False)
    ctx.close()
    ctx, page, log = new_page(browser, 1280, 720, mobile=False)
    page.goto(f'{BASE}/index.html?autotest=1')
    assert poll(page, 'window.RLP && RLP.ready === true', 120)
    check('电脑横向窗口：不转', page.evaluate('window.__RLP_ROT.rot') is False)
    ctx.close()

    # ------------------------------------------------------------------ 4. 完整流程（竖屏转过来的画面里跑）
    ctx, page, log = new_page(browser, 390, 844, dsf=1)
    page.goto(f'{BASE}/index.html?autotest=1')
    assert poll(page, 'window.RLP && RLP.ready === true', 120)
    t0 = time.time()
    res = page.evaluate("(async () => { RLP.timeScale = 3; const r = await RLP.autoplay({ stepDelay: 0 }); return { ok: r.ok, steps: r.steps, total: r.total, error: r.error, failedStep: r.failedStep }; })()")
    check(f'完整流程 autoplay（{time.time() - t0:.0f}s）', res['ok'] and res['steps'] == res['total'], res)
    csp_and_errors(page, log, '完整流程')
    ctx.close()

    # 第二灾完整流程（同样在竖屏转过来的画面里、容器 CSP 下）
    ctx, page, log = new_page(browser, 390, 844, dsf=1)
    page.goto(f'{BASE}/index.html?autotest=1&chapter=2')
    assert poll(page, 'window.RLP && RLP.ready === true', 120)
    page.evaluate("RLP.start(2, { fresh: true, skipIntro: true })")
    assert poll(page, 'RLP.state.view', 60)
    t0 = time.time()
    res = page.evaluate("(async () => { RLP.timeScale = 3; const r = await RLP.autoplay({ stepDelay: 0 }); return { ok: r.ok, steps: r.steps, total: r.total, error: r.error, failedStep: r.failedStep }; })()")
    check(f'第二灾完整流程 autoplay（{time.time() - t0:.0f}s）', res['ok'] and res['steps'] == res['total'], res)
    csp_and_errors(page, log, '第二灾完整流程')
    ctx.close()

    # ------------------------------------------------------------------ 5. 慢手机上的启动 + 排查面板 + 报错横幅
    # 审核打回的原因是“功能缺陷 / 按钮点不了”：启动原来是一条不让出主线程的长任务，慢设备上页面整段没响应、load 事件迟迟不来
    ctx, page, log = new_page(browser, 390, 844, dsf=2)
    cdp = ctx.new_cdp_session(page)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 3})
    # 数一数启动期让出主线程（__RLP_STAGE）的次数：启动被拆成很多小段，评论里“白屏 / 载入页交替闪”就是启动里有几秒不让出主线程
    page.add_init_script("""window.__STAGE_CALLS = 0; var __sf = null;
      Object.defineProperty(window, '__RLP_STAGE', { configurable: true, get: function () { return __sf && function (t) { window.__STAGE_CALLS++; return __sf(t); }; }, set: function (v) { __sf = v; } });""")
    t0 = time.time()
    page.goto(f'{BASE}/index.html', timeout=90000)
    t_load = time.time() - t0
    check(f'CPU 降速 3×：load 事件 {t_load:.1f}s 内触发（启动不再拖住页面）', t_load < 8, round(t_load, 1))
    stages, t1 = [], time.time()
    while time.time() - t1 < 180:
        st = page.evaluate("(() => { const b = document.getElementById('boot'); return [!!(window.RLP && RLP.ready === true), b ? b.textContent : null]; })()")
        if st[1] and st[1] not in stages:
            stages.append(st[1])
        if st[0]:
            break
        time.sleep(0.1)
    check('载入页依次显示阶段文字（至少 4 个）', len(stages) >= 4, stages)
    check('慢设备上也能启动完成，没有启动错误', page.evaluate('!!(window.RLP && RLP.ready === true) && !RLP.bootError'), page.evaluate('window.RLP && RLP.bootError'))
    check('启动被拆成很多小段（让出主线程 ≥ 50 次，桌面实测约 90 次）', page.evaluate('window.__STAGE_CALLS') >= 50, page.evaluate('window.__STAGE_CALLS'))
    check('启动走完后记录为 done，正常模式（有阴影）',
          page.evaluate("JSON.parse(localStorage.getItem('rlp3d.boot')).done === true && window.__RLP_LITE === false && RLP.ctx.engine.renderer.shadowMap.enabled === true"))
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
    time.sleep(1.0)
    f = Fingers(cdp)
    # 连点要在 2 秒内完成；软件渲染（SwiftShader）占满主线程时每一下要等几秒（机器上同时有别的任务时尤其明显），
    # 这一段只关心排查面板，所以先暂停渲染（旧包同样会因此失败，不是新改动引起的）
    page.evaluate('RLP.ctx.engine.renderEnabled = false')
    time.sleep(0.5)
    for _ in range(5):
        tap_virtual(page, f, 30, 30)
        time.sleep(0.15)
    check('真实触摸连点画面左上角 5 下：排查面板打开，有 GL / 启动 / 帧率',
          page.evaluate("(() => { const d = document.querySelector('.rlp-diag'); return !!d && d.classList.contains('show') && /GL /.test(d.textContent) && /启动/.test(d.textContent) && /帧率/.test(d.textContent); })()"),
          page.evaluate("(document.querySelector('.rlp-diag') || {}).textContent"))
    tap_virtual(page, f, 60, 40)
    time.sleep(0.3)
    check('点排查面板：关闭', page.evaluate("!document.querySelector('.rlp-diag').classList.contains('show')"))
    page.evaluate("window.dispatchEvent(new ErrorEvent('error', { message: 'test boom' }))")
    check('没接住的报错会在画面顶上显示红色横幅',
          page.evaluate("(() => { const b = document.querySelector('.rlp-err'); return !!b && b.classList.contains('show') && /test boom/.test(b.textContent); })()"))
    ctx.close()

    # ------------------------------------------------------------------ 6. 反复重载保护：启动没走完就被重载两次，第三次进轻量模式
    # 线上评论：“一进去两三秒就一直闪（白色画面和加载画面快速交替）”——启动被容器 / 系统判为无响应而反复重载。
    ctx, page, log = new_page(browser, 390, 844, dsf=1)
    page.goto(f'{BASE}/index.html')
    assert poll(page, 'window.RLP && RLP.ready === true', 180)
    st = page.evaluate("({lite: window.__RLP_LITE, shadows: RLP.ctx.engine.renderer.shadowMap.enabled, boot: JSON.parse(localStorage.getItem('rlp3d.boot'))})")
    check('第一次进入：正常模式，启动走完后记录 done', st['lite'] is False and st['shadows'] is True and st['boot']['done'] is True, st)
    page.evaluate("localStorage.removeItem('rlp3d.boot')")
    for _ in range(2):                      # 启动到一半就被重载（模拟容器 / 系统反复重载）
        page.goto(f'{BASE}/index.html', wait_until='commit')
        time.sleep(0.6)
    page.goto(f'{BASE}/index.html', wait_until='commit')
    assert poll(page, 'window.RLP && RLP.ready === true', 180)
    st = page.evaluate("({lite: window.__RLP_LITE, shadows: RLP.ctx.engine.renderer.shadowMap.enabled, pr: RLP.ctx.engine.maxPixelRatio, boot: JSON.parse(localStorage.getItem('rlp3d.boot')), err: String(RLP.bootError)})")
    check('连续两次启动没走完：第三次进入轻量模式（关阴影、像素比 1），启动成功',
          st['lite'] is True and st['shadows'] is False and st['pr'] <= 1 and st['err'] == 'null' and st['boot']['done'] is True, st)
    page.goto(f'{BASE}/index.html')
    assert poll(page, 'window.RLP && RLP.ready === true', 180)
    check('再下一次进入：恢复正常模式', page.evaluate("window.__RLP_LITE === false && RLP.ctx.engine.renderer.shadowMap.enabled === true"))
    page.evaluate("localStorage.setItem('rlp3d.boot', JSON.stringify({t: Date.now() - 60000, n: 5, done: false}))")
    page.goto(f'{BASE}/index.html')
    assert poll(page, 'window.RLP && RLP.ready === true', 180)
    check('上一次启动记录是 60 秒前：不算反复重载', page.evaluate("window.__RLP_LITE === false"))
    ctx.close()
    ctx, page, log = new_page(browser, 390, 844, dsf=1)
    page.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });")
    page.goto(f'{BASE}/index.html')
    assert poll(page, 'window.RLP && RLP.ready === true', 180)
    check('localStorage 不可用：照常启动', page.evaluate("window.__RLP_LITE === false && !RLP.bootError"))
    ctx.close()
    browser.close()

srv.shutdown()
print(json.dumps({'passed': sum(results), 'total': len(results)}))
sys.exit(0 if all(results) else 1)
