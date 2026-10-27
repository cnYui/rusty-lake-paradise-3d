r"""验证口袋方舟（233 乐园）H5 包（python dev/minitool/build.py --ark 的产物）：原生横屏外壳、安全区、竖屏提示、章节解锁、真实触摸、第三灾启动、稳定性。

  1. 横屏矩阵（720×360 / 640×360 / 812×375 / 1280×720）：能启动、没有页面错误 / CSP 违规 / 请求失败、不出现滚动条、
     不旋转（__RLP_NOROT）、舞台在视口内、画布在舞台内、标题菜单的可点元素在视口内并报告尺寸
  2. 安全区：给 #rot 加刘海 padding 后，舞台完整落在 padding 之内
  3. 竖屏（375×812 / 390×844）：显示游戏自带的“请把手机横过来游玩”，不旋转，不滚动
  4. 章节菜单：第一灾开放，第二、三、四灾按解锁规则（空档锁着，通关前一章后开放），第五灾起“敬请期待”，?unlock=1 可跳过锁
  5. 真实触摸（720×360）：点“新游戏”、轻点天堂门进入漫游、摇杆向前走、右侧拖动转视角（没有旋转，点击落点必须和画面一致）
  6. 第三灾能启动（?chapter=3）
  7. 稳定性：监听器不随重开章节增长、切后台再回来渲染循环仍在跑、不联网
  8. --full：第一到第四灾各跑一遍 RLP.autoplay()

用法：MINITOOL_DIST=<dist 目录> python dev/minitool/test_ark.py [--full] [输出目录]
退出码：全部通过 0，有失败 1，没设置 MINITOOL_DIST 2。
"""
import functools, http.server, json, os, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
FULL = '--full' in sys.argv
if not os.environ.get('MINITOOL_DIST'):
    print('用法：MINITOOL_DIST=<ark 包的 dist 目录> python dev/minitool/test_ark.py [--full] [输出目录]')
    sys.exit(2)
DIST = os.path.abspath(os.environ['MINITOOL_DIST'])
OUT = args[0] if args else os.path.join(HERE, '_test_out_ark')
os.makedirs(OUT, exist_ok=True)

# 按最严格的容器 CSP（小红书同款）起服务：口袋方舟的 CSP 没公开，能在这里跑过，换到宽松的容器一定能跑
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
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + json.dumps(detail, ensure_ascii=False) if detail is not None else ''), flush=True)


def warn(name, detail=None):
    print('WARN ' + name + ('  ' + json.dumps(detail, ensure_ascii=False) if detail is not None else ''), flush=True)


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
        try:
            if page.evaluate(f'!!({expr})'):
                return True
        except Exception:      # 页面正在重载
            pass
        time.sleep(every)
    return False


def new_page(browser, w, h, mobile=True, dsf=1):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dsf, is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page()
    log = {'errors': [], 'failed': [], 'external': []}
    page.add_init_script("document.addEventListener('securitypolicyviolation', e => (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI));")
    page.on('console', lambda m: log['errors'].append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: log['errors'].append(f'[pageerror] {e}'))
    page.on('requestfailed', lambda r: log['failed'].append(f'{r.url} {r.failure}'))
    page.on('request', lambda r: log['external'].append(r.url) if not (r.url.startswith(BASE) or r.url.startswith('data:') or r.url.startswith('blob:')) else None)
    return ctx, page, log


def boot(page, url, timeout=150):
    page.goto(f'{BASE}/{url}')
    assert poll(page, 'window.RLP && RLP.ready === true', timeout), f'启动超时：{url}'
    assert page.evaluate('RLP.bootError') is None, page.evaluate('RLP.bootError')


def rect(page, sel):
    return page.evaluate("(s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; }", sel)


def inside(r, outer, eps=1.5):
    return r['x'] >= outer['x'] - eps and r['y'] >= outer['y'] - eps and r['r'] <= outer['r'] + eps and r['b'] <= outer['b'] + eps


HITBOX_JS = """(sel) => [...document.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none' && parseFloat(cs.opacity) > 0; }).map(e => {
  const r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const hit = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t)); };
  let x0 = cx, x1 = cx, y0 = cy, y1 = cy;
  while (hit(x0 - 1, cy) && cx - x0 < 80) x0 -= 1;
  while (hit(x1 + 1, cy) && x1 - cx < 80) x1 += 1;
  while (hit(cx, y0 - 1) && cy - y0 < 80) y0 -= 1;
  while (hit(cx, y1 + 1) && y1 - cy < 80) y1 += 1;
  return { t: e.textContent.trim().slice(0, 8), w: Math.round(x1 - x0), h: Math.round(y1 - y0), inView: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
})"""


def hitboxes(page, sel):
    """元素实际能被点中的区域（用 elementFromPoint 从中心向四周探，包含 ark.css 伪元素撑出来的部分），返回每个元素的宽高。"""
    return page.evaluate(HITBOX_JS, sel)


def csp_and_errors(page, log, label):
    csp = page.evaluate('window.__csp || []')
    check(f'{label}：没有 CSP 违规', not csp, csp[:5])
    errs = [e for e in log['errors'] if 'toNonIndexed' not in e and 'flatShading' not in e]
    check(f'{label}：没有页面错误', not errs, errs[:5])
    check(f'{label}：没有请求失败', not log['failed'], log['failed'][:5])
    check(f'{label}：不联网（没有任何外部请求）', not log['external'], log['external'][:5])


def settle(page, cond, timeout=30000):
    assert poll(page, cond, timeout / 1000), f'等待超时：{cond}'
    page.evaluate('RLP.idle()')
    time.sleep(0.3)


def info(page):
    return page.evaluate("(() => { const i = RLP.info(); return { view: i.view, freeMode: i.freeMode, roam: i.roam, touchMode: i.touchMode }; })()")


def world_to_screen(page, world):
    return page.evaluate("(p) => { const r = document.getElementById('game').getBoundingClientRect(); const s = RLP.ctx.views.project(p); return s ? { x: r.left + s.x * r.width, y: r.top + s.y * r.height } : null; }", world)


def chapter_states(page):
    """每个章节按钮的状态：open / gated（未解锁）/ locked（敬请期待）/ done。"""
    return page.evaluate("[...document.querySelectorAll('.plague')].map(e => e.classList.contains('open') ? 'open' : e.classList.contains('gated') ? 'gated' : 'locked')")


def profile_script(cleared):
    prof = {'v': 1, 'ach': {}, 'cleared': {c: {'t': 1760000000000} for c in cleared}}
    return f"if (!localStorage.getItem('rlp3d.profile')) localStorage.setItem('rlp3d.profile', {json.dumps(json.dumps(prof))});"


with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])

    # ------------------------------------------------------------------ 1. 横屏矩阵
    for (w, h, mobile, dsf) in [(720, 360, True, 2), (640, 360, True, 2), (812, 375, True, 3), (1280, 720, False, 1)]:
        label = f'横屏 {w}×{h}'
        ctx, page, log = new_page(browser, w, h, mobile=mobile, dsf=dsf)
        boot(page, 'index.html')
        assert poll(page, "document.querySelector('.menu.show') && document.querySelectorAll('.menu-link').length === 3", 15), '首页菜单未完整显示'
        time.sleep(1.0)
        d = page.evaluate("({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight, rot: window.__RLP_ROT.rot, noRot: window.__RLP_NOROT === true, hint: getComputedStyle(document.querySelector('.rotate-hint')).display })")
        check(f'{label}：不出现滚动条', d['sw'] <= d['iw'] and d['sh'] <= d['ih'], d)
        check(f'{label}：原生横屏外壳（不旋转）', d['rot'] is False and d['noRot'] is True and d['hint'] == 'none', d)
        view = {'x': 0, 'y': 0, 'r': w, 'b': h}
        stage, canvas = rect(page, '#stage'), rect(page, '#game')
        check(f'{label}：舞台在视口内，16:9', inside(stage, view) and abs(stage['w'] / stage['h'] - 16 / 9) < 0.03, stage)
        check(f'{label}：画布完整落在舞台内', inside(canvas, stage, 2), [canvas, stage])
        bad, small = [], []
        need = 40 if mobile else 28      # 触屏界面：实际可点区域至少 40 CSS 像素（ark.css 撑到 44）；电脑只要求 28
        for sel in ['.menu-play', '.menu-link', '.plague']:
            for r in hitboxes(page, sel):
                if not r['inView']:
                    bad.append([sel, r['t'], 'out-of-view'])
                if min(r['w'], r['h']) < need:
                    bad.append([sel, r['t'], 'too-small', r['w'], r['h']])
                elif min(r['w'], r['h']) < 44:
                    small.append([sel, r['w'], r['h']])
        check(f'{label}：标题菜单的可点元素都在视口内，实际可点区域不小于 {need}px', not bad, bad[:6])
        if small:
            warn(f'{label}：可点区域小于 44px（最小 {min(min(s[1], s[2]) for s in small)}px）', small[:3])
        csp_and_errors(page, log, label)
        page.screenshot(path=os.path.join(OUT, f'm_{w}x{h}.png'))
        ctx.close()

    # ------------------------------------------------------------------ 2. 安全区（刘海：左右各 44px，底部 21px）
    ctx, page, log = new_page(browser, 812, 375, dsf=3)
    boot(page, 'index.html')
    page.evaluate("document.getElementById('rot').style.padding = '0 44px 21px 44px'; window.dispatchEvent(new Event('resize'))")
    time.sleep(0.6)
    safe = {'x': 44, 'y': 0, 'r': 812 - 44, 'b': 375 - 21}
    stage = rect(page, '#stage')
    check('安全区：舞台完整落在 padding 之内（不压到刘海 / Home 条）', inside(stage, safe), [stage, safe])
    check('安全区：画布跟着舞台缩放、仍在舞台内', inside(rect(page, '#game'), stage, 2), rect(page, '#game'))
    check('安全区：不出现滚动条', page.evaluate('document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight'))
    ctx.close()

    # ------------------------------------------------------------------ 3. 竖屏提示
    for (w, h) in [(375, 812), (390, 844)]:
        ctx, page, log = new_page(browser, w, h, dsf=2)
        page.goto(f'{BASE}/index.html')
        time.sleep(3.0)
        d = page.evaluate("({ hint: getComputedStyle(document.querySelector('.rotate-hint')).display, text: document.querySelector('.rotate-hint').textContent.trim(), rot: window.__RLP_ROT.rot, sw: document.documentElement.scrollWidth, iw: innerWidth })")
        check(f'竖屏 {w}×{h}：显示“请把手机横过来”，不旋转，不横向滚动', d['hint'] != 'none' and '横' in d['text'] and d['rot'] is False and d['sw'] <= d['iw'], d)
        ctx.close()

    # ------------------------------------------------------------------ 4. 章节菜单与解锁
    ctx, page, log = new_page(browser, 720, 360, dsf=2)
    boot(page, 'index.html')
    assert poll(page, "document.querySelector('.menu.show')", 15)
    st = chapter_states(page)
    check('章节菜单（空档）：第一灾开放，第二、三、四灾未解锁，第五灾起敬请期待', st == ['open', 'gated', 'gated', 'gated'] + ['locked'] * 6, st)
    ctx.close()
    ctx, page, log = new_page(browser, 720, 360, dsf=2)
    boot(page, 'index.html?unlock=1')
    assert poll(page, "document.querySelector('.menu.show')", 15)
    st = chapter_states(page)
    check('?unlock=1：第一到第四灾可点，第五灾起仍是敬请期待（第五灾没打进包）', st[:4] == ['open'] * 4 and st[4:] == ['locked'] * 6, st)
    ctx.close()
    for cleared, expect in [(['plague1'], ['open', 'open', 'gated', 'gated']), (['plague1', 'plague2'], ['open', 'open', 'open', 'gated']), (['plague1', 'plague2', 'plague3'], ['open'] * 4)]:
        ctx, page, log = new_page(browser, 720, 360, dsf=2)
        page.add_init_script(profile_script(cleared))
        boot(page, 'index.html')
        assert poll(page, "document.querySelector('.menu.show')", 15)
        st = chapter_states(page)
        check(f'通关 {"、".join(cleared)} 后：前四章状态 {expect}', st[:4] == expect and st[4:] == ['locked'] * 6, st)
        ctx.close()

    # ------------------------------------------------------------------ 5. 真实触摸（720×360，没有旋转，点击落点必须和画面一致）
    ctx, page, log = new_page(browser, 720, 360, dsf=2)
    boot(page, 'index.html')
    assert poll(page, "document.querySelector('.menu.show')", 15)
    time.sleep(1.0)
    f = Fingers(ctx.new_cdp_session(page))
    for n, title in [(2, '成就'), (3, '设置')]:
        r = rect(page, f'.menu-link:nth-child({n})')
        f.tap(r['x'] + r['w'] / 2, r['y'] + r['h'] / 2)
        check(f'真实触摸“{title}”：面板打开', poll(page, f"document.querySelector('.menu-panel h2') && document.querySelector('.menu-panel h2').textContent === '{title}'", 10))
        r = rect(page, '.menu-panel .panel-x')
        f.tap(r['x'] + r['w'] / 2, r['y'] + r['h'] / 2)
        check(f'真实触摸关闭“{title}”：返回首页', poll(page, "!document.querySelector('.menu-panel')", 10))
    r = rect(page, '.menu-link')
    f.tap(r['x'] + r['w'] / 2, r['y'] + r['h'] / 2)
    check('真实触摸“新游戏”：菜单关闭、游戏开始', poll(page, 'RLP.ctx.ui.menu.visible === false', 40))
    ctx.close()

    ctx, page, log = new_page(browser, 720, 360, dsf=2)
    boot(page, 'index.html?chapter=1&skipIntro=1&give=stick,line,hook')
    assert poll(page, "RLP.state.view === 'overview'", 120)
    page.evaluate('RLP.idle()')
    time.sleep(1.0)
    f = Fingers(ctx.new_cdp_session(page))
    check('触屏界面：识别为触屏', info(page)['touchMode'])
    g = world_to_screen(page, [0, 3, 40])
    check('天堂门投影在画面里', g is not None and 0 < g['x'] < 720 and 0 < g['y'] < 360, g)
    f.tap(g['x'], g['y'])
    settle(page, "RLP.state.view === 'beach_mid' && RLP.info().freeMode")
    check('轻点天堂门进入漫游（点击落点和画面一致，没有坐标偏移）', info(page)['freeMode'])
    ingame = [[sel, r['t'], r['w'], r['h']] for sel in ['.gear', '.slot'] for r in hitboxes(page, sel) if min(r['w'], r['h']) < 40 or not r['inView']]
    check('游戏内：齿轮和物品栏格子的实际可点区域不小于 40px 且在视口内', not ingame, ingame[:6])
    check('漫游时显示虚拟摇杆', page.evaluate("getComputedStyle(document.querySelector('.stick')).display") == 'block')
    page.evaluate('RLP.ctx.engine.renderEnabled = true')
    cv = rect(page, '#game')
    z0 = info(page)['roam']['pos'][2]
    sx, sy = cv['x'] + cv['w'] * 0.18, cv['y'] + cv['h'] * 0.72
    f.down(1, sx, sy)
    for k in range(1, 6):
        f.move(1, sx, sy - 14 * k); time.sleep(0.03)
    stick = info(page)['roam']['touch']['stick']
    time.sleep(0.8)
    f.up(1)
    time.sleep(0.3)
    z1 = info(page)['roam']['pos'][2]
    check('左侧拖动出现摇杆，向上推 = 向前走', stick['y'] > 0.9 and abs(stick['x']) < 0.3 and z0 - z1 > 2, [stick, z0, z1])
    page.evaluate("RLP.goto('beach_mid')")
    settle(page, 'RLP.info().freeMode')
    y0 = info(page)['roam']['yaw']
    f.drag(2, cv['x'] + cv['w'] * 0.55, cv['y'] + cv['h'] * 0.5, cv['x'] + cv['w'] * 0.95, cv['y'] + cv['h'] * 0.5, steps=12)
    time.sleep(0.3)
    y1 = info(page)['roam']['yaw']
    check('右侧向右拖动 = 向右转（yaw 变大）', y1 - y0 > 0.5, [y0, y1])
    page.screenshot(path=os.path.join(OUT, 'roam_720x360.png'))
    csp_and_errors(page, log, '触摸漫游')

    # ------------------------------------------------------------------ 7. 稳定性（沿用这个页面：重开章节后监听器不增长、切后台再回来仍在渲染）
    ctx.close()
    ctx, page, log = new_page(browser, 720, 360, dsf=2)
    page.add_init_script("""window.__listeners = {};
      (function () { var add = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, fn, opt) {
          var k = (this === window ? 'window' : this === document ? 'document' : 'other') + ':' + type;
          window.__listeners[k] = (window.__listeners[k] || 0) + 1;
          return add.call(this, type, fn, opt); }; })();""")
    boot(page, 'index.html?chapter=1&skipIntro=1')
    assert poll(page, "RLP.state.view === 'overview'", 120)
    page.evaluate('RLP.idle()')
    before = page.evaluate('({ ...window.__listeners })')
    for _ in range(2):
        page.evaluate("RLP.start(1, { fresh: true, skipIntro: true })")
        assert poll(page, "RLP.state.view === 'overview'", 120)
        page.evaluate('RLP.idle()')
    after = page.evaluate('({ ...window.__listeners })')
    grew = {k: [before.get(k, 0), v] for k, v in after.items() if v > before.get(k, 0) and k.split(':')[0] in ('window', 'document')}
    check('重开章节两次：window / document 上的监听器不增长', not grew, grew)
    f0 = page.evaluate('RLP.ctx.engine.frame')
    page.evaluate("""Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide'));""")
    time.sleep(0.8)
    page.evaluate("""Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow'));""")
    time.sleep(1.5)
    f1 = page.evaluate('RLP.ctx.engine.frame')
    check('切后台再回来：渲染循环仍在跑，没有启动错误', f1 - f0 > 5 and page.evaluate('!RLP.bootError'), [f0, f1])
    csp_and_errors(page, log, '稳定性')
    ctx.close()

    # ------------------------------------------------------------------ 6. 第三灾能启动
    ctx, page, log = new_page(browser, 720, 360, dsf=2)
    boot(page, 'index.html?chapter=3&fresh=1&skipIntro=1')
    assert poll(page, 'RLP.chapter && RLP.chapter.number === 3', 60)
    page.evaluate('RLP.idle()')
    time.sleep(2.0)
    f0, t0 = page.evaluate('RLP.ctx.engine.frame'), time.time()
    ok = poll(page, f'RLP.ctx.engine.frame - {f0} >= 5', 20)
    dt = time.time() - t0
    fps = (page.evaluate('RLP.ctx.engine.frame') - f0) / dt
    check('第三灾：能启动并持续渲染（软件渲染下 20 秒内推进 5 帧），没有启动错误', ok and page.evaluate('!RLP.bootError'), {'view': page.evaluate('RLP.state.view'), 'fps': round(fps, 1)})
    page.screenshot(path=os.path.join(OUT, 'ch3_720x360.png'))
    csp_and_errors(page, log, '第三灾启动')
    ctx.close()

    # ------------------------------------------------------------------ 8. 完整流程
    if FULL:
        for n in (1, 2, 3, 4):
            ctx, page, log = new_page(browser, 720, 360, dsf=1)
            boot(page, f'index.html?autotest=1&chapter={n}')
            if n != 1:
                page.evaluate(f"RLP.start({n}, {{ fresh: true, skipIntro: true }})")
                assert poll(page, 'RLP.state.view', 60)
            t0 = time.time()
            res = page.evaluate("(async () => { RLP.timeScale = 3; const r = await RLP.autoplay({ stepDelay: 0 }); return { ok: r.ok, steps: r.steps, total: r.total, error: r.error, failedStep: r.failedStep }; })()")
            check(f'第 {n} 灾完整流程 autoplay（{time.time() - t0:.0f}s）', res['ok'] and res['steps'] == res['total'], res)
            csp_and_errors(page, log, f'第 {n} 灾完整流程')
            ctx.close()

    browser.close()

print(f'\n{sum(results)}/{len(results)} 通过')
sys.exit(0 if all(results) else 1)
