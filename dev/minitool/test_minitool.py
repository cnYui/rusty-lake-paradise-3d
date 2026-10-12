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

    # ------------------------------------------------------------------ 5. 慢手机上的启动 + 排查面板 + 报错横幅
    # 审核打回的原因是“功能缺陷 / 按钮点不了”：启动原来是一条不让出主线程的长任务，慢设备上页面整段没响应、load 事件迟迟不来
    ctx, page, log = new_page(browser, 390, 844, dsf=2)
    cdp = ctx.new_cdp_session(page)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 3})
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
    browser.close()

srv.shutdown()
print(json.dumps({'passed': sum(results), 'total': len(results)}))
