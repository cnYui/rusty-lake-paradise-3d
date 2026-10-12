r"""量小工具包（dev/minitool/dist）在慢设备上的启动耗时：手机竖屏 + CPU 降速，按小红书容器的 CSP 起静态服务。

输出每档降速下：RLP.ready 用了多久、标题菜单多久出现、RLP.bootTimes（各阶段，毫秒）、标题画面 3 秒内的帧率（软件渲染，只看相对变化）。
CPU 降速只影响页面里的 JS（建世界、编译着色器的 CPU 部分），GPU 部分在这里是软件渲染，数字不等于真机，只能看“慢设备大概多慢”。

用法：python dev/minitool/measure_boot.py [降速倍数，逗号分隔，默认 1,4,6]      （环境变量 DIST 可指定别的目录）
"""
import functools, http.server, json, os, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.environ.get('DIST') or os.path.join(HERE, 'dist')
RATES = [float(x) for x in (sys.argv[1] if len(sys.argv) > 1 else '1,4,6').split(',')]

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


def poll(page, expr, timeout, every=0.25):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(f'!!({expr})'):
            return True
        time.sleep(every)
    return False


with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    for rate in RATES:
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(f'[pageerror] {e}'))
        page.on('console', lambda m: errs.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
        cdp = ctx.new_cdp_session(page)
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': rate})
        t0 = time.time()
        try:
            page.goto(f'{BASE}/index.html', timeout=240000)
            t_load = round(time.time() - t0, 1)   # load 事件触发用了多久（启动是长任务时，它会被拖到启动结束后）
        except Exception as e:
            t_load = f'超时：{type(e).__name__}'
        stages = []
        t1 = time.time()
        while time.time() - t1 < 240:
            st = page.evaluate("(() => { const b = document.getElementById('boot'); return [window.RLP && RLP.ready === true, b ? b.textContent : null]; })()")
            if st[1] and st[1] not in stages:
                stages.append(st[1])
            if st[0]:
                break
            time.sleep(0.1)
        ready = poll(page, 'window.RLP && RLP.ready === true', 240)
        t_ready = time.time() - t0
        menu = poll(page, 'window.RLP && RLP.ctx && RLP.ctx.ui.menu.visible === true', 120)
        t_menu = time.time() - t0
        boot = page.evaluate('window.RLP && RLP.bootTimes') if ready else None
        err = page.evaluate('window.RLP && RLP.bootError') if ready else None
        fps = page.evaluate("new Promise(r => { let n = 0; const t = performance.now(); (function f() { n++; if (performance.now() - t > 3000) r(n / 3); else requestAnimationFrame(f); })(); })") if ready else None
        print(json.dumps({'rate': rate, 'tLoad': t_load, 'stages': stages, 'ready': ready, 'tReady': round(t_ready, 1), 'menuVisible': menu, 'tMenu': round(t_menu, 1),
                          'bootTimes': boot, 'bootError': err, 'fps': fps and round(fps, 1), 'errors': errs[:4]}, ensure_ascii=False), flush=True)
        ctx.close()
    browser.close()
