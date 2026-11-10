r"""量小工具包（默认 dev/minitool/dist-ch1234-save-20261026-release）在慢设备上的长任务和菜单响应。

背景：小红书容器（竖屏 390×844、触摸、SwiftShader 软件渲染）里，标题菜单约 1 秒出现，随后主线程出现两段 25 s / 23 s 的
长任务（three.js 编译链接着色器），期间点菜单“成就”要等几十秒才出现。这个脚本按容器的 CSP 起静态服务，用无头 Chromium +
CDP CPU 降速复现，记录：

  - 标题菜单（.menu 元素、加上 show 真正能点）出现的时间；
  - 所有长任务（PerformanceObserver 的 longtask，页面脚本之前就装上，buffered）；
  - 菜单出现 1 s 后用真实触摸点“成就”，从点击到成就面板出现（.menu-panel h2 === '成就'）的延迟；
  - RLP.ready 的时间、RLP.bootError、renderer.info.programs 数量。

用法：
  python dev/minitool/measure_longtasks.py [包目录] [--cpu 3]
包目录默认 dev/minitool/dist-ch1234-save-20261026-release（不存在就报错）；输出 JSON 和一行中文摘要。
"""
import argparse, functools, http.server, json, os, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DIST = os.path.join(HERE, 'dist-ch1234-save-20261026-release')

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


# 页面脚本之前执行：长任务和标题菜单出现时间都用页面自己的 performance.now（毫秒）。
# 菜单元素在 ui.init 里就创建了，真正“出现、能点”是 .menu 加上 show（ui.menu.build 里 requestAnimationFrame 加），所以看 .menu.show。
INIT_SCRIPT = r"""
(() => {
  window.__LT = [];
  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__LT.push({ startTime: e.startTime, duration: e.duration });
    });
    obs.observe({ type: 'longtask', buffered: true });
  } catch (e) { /* 没有 Long Tasks API 就只输出 0 条 */ }

  window.__menuAt = null;
  window.__menuElementAt = null;
  const check = () => {
    if (window.__menuElementAt == null && document.querySelector('.menu')) window.__menuElementAt = performance.now();
    if (window.__menuAt == null && document.querySelector('.menu.show')) window.__menuAt = performance.now();
  };
  if (window.MutationObserver) {
    // 直接观察 document：init script 执行时 documentElement 可能还没建好，等 DOMContentLoaded 会错过菜单
    check();
    new MutationObserver(check).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  } else {
    const timer = setInterval(() => { check(); if (window.__menuAt != null) clearInterval(timer); }, 20);
  }
})();
"""


def poll(page, expr, timeout, every=0.1):
    """轮询页面里的表达式直到为真（page.evaluate 不受页面 CSP 影响；wait_for_function 会在页面里 eval）。"""
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if page.evaluate(f'!!({expr})'):
                return True
        except Exception:      # 页面正在重载 / 执行上下文被销毁
            pass
        time.sleep(every)
    return False


def main():
    ap = argparse.ArgumentParser(description='量小工具包的长任务、菜单出现时间和点“成就”的延迟')
    ap.add_argument('dist', nargs='?', default=DEFAULT_DIST,
                    help=f'打好的包目录（默认 {os.path.relpath(DEFAULT_DIST, HERE)}）')
    ap.add_argument('--cpu', type=float, default=3, help='CDP Emulation.setCPUThrottlingRate 的降速倍数（默认 3）')
    a = ap.parse_args()

    dist = os.path.abspath(a.dist)
    if not os.path.isfile(os.path.join(dist, 'index.html')):
        sys.exit(f'错误：{dist} 不是一个打好的小工具包目录（找不到 index.html）')

    socketserver.ThreadingTCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(H, directory=dist))
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{srv.server_address[1]}'

    result = {'dist': dist, 'cpu': a.cpu, 'longTasks': []}
    errors = []
    exitCode = 0
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
            ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            page = ctx.new_page()
            page.set_default_timeout(240000)
            page.add_init_script(INIT_SCRIPT)
            page.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
            page.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
            cdp = ctx.new_cdp_session(page)
            cdp.send('Emulation.setCPUThrottlingRate', {'rate': a.cpu})

            t0 = time.time()
            page.goto(f'{base}/index.html', timeout=240000)

            # 1. 标题菜单出现（最多 120 s；正常情况下约 1 s，慢设备上世界在后台继续搭）
            menu = poll(page, "document.querySelector('.menu.show')", 120)
            result['menuSeconds'] = round(time.time() - t0, 2)
            result['menuElementAtMs'] = round(page.evaluate('window.__menuElementAt') or 0, 1) if menu else None
            result['menuAtMs'] = round(page.evaluate('window.__menuAt') or 0, 1) if menu else None
            time.sleep(1.0)   # 菜单出现后等 1 s，此时启动还在编译着色器

            # 2. 真实触摸点“成就”：元素矩形是 rotate.js 换算过的游戏横屏坐标，再换成屏幕坐标
            rect = page.evaluate("""() => {
              const b = [...document.querySelectorAll('.menu-link')].find(e => e.textContent.trim() === '成就');
              if (!b) return null;
              const r = b.getBoundingClientRect();
              return { x: r.left, y: r.top, w: r.width, h: r.height };
            }""")
            if rect:
                pt = page.evaluate("""(v) => {
                  const S = window.__RLP_ROT;
                  return S && S.rot ? { x: S.fw - v[1], y: v[0] } : { x: v[0], y: v[1] };
                }""", [rect['x'] + rect['w'] / 2, rect['y'] + rect['h'] / 2])
            else:
                pt = None
            if pt:
                t_click = time.time()
                page.touchscreen.tap(pt['x'], pt['y'])
                panel = poll(page, "document.querySelector('.menu-panel h2') && document.querySelector('.menu-panel h2').textContent === '成就'", 240, 0.05)
                result['tapToPanelMs'] = round((time.time() - t_click) * 1000, 1)
            else:
                panel = False
                result['tapToPanelMs'] = None
            result['panelOpened'] = bool(panel)

            # 3. 等启动完成并检查 bootError
            ready = poll(page, 'window.RLP && RLP.ready === true', 240, 0.1)
            result['ready'] = bool(ready)
            result['readySeconds'] = round(time.time() - t0, 2)
            result['bootError'] = page.evaluate('window.RLP ? RLP.bootError : "没有 RLP"')
            result['programs'] = page.evaluate("""() => {
              const e = window.RLP && RLP.ctx && RLP.ctx.engine;
              return e && e.renderer && e.renderer.info && e.renderer.info.programs ? e.renderer.info.programs.length : null;
            }""")
            result['menuVisible'] = page.evaluate("!!document.querySelector('.menu.show')")

            # 4. 收长任务（先等一下，让最后一次渲染的 PerformanceObserver 回调有机会执行）
            time.sleep(0.5)
            lts = page.evaluate('window.__LT || []')
            result['longTasks'] = [{'startTime': round(e['startTime'], 1), 'duration': round(e['duration'], 1)} for e in lts]
            result['errorLog'] = errors[:8]
            ctx.close()
            browser.close()
    except Exception as e:
        msg = f'{type(e).__name__}: {e}'
        # 受限沙箱 / 受限 Windows 令牌里 Playwright 启动驱动时建不了命名管道，Chromium 本身也起不来；
        # 在普通终端（不受限）里跑就没有这个问题。
        if 'PermissionError' in msg or 'WinError 5' in msg or 'EPERM' in msg:
            msg += '（当前环境不允许命名管道：Playwright / Chromium 必须在普通终端里运行）'
        result['fatal'] = msg
        exitCode = 1
    finally:
        srv.shutdown()

    lts = result.get('longTasks') or []
    over1s = [e for e in lts if e['duration'] > 1000]
    result['longTaskCount'] = len(lts)
    result['longestTaskMs'] = round(max((e['duration'] for e in lts), default=0), 1)
    result['over1sCount'] = len(over1s)
    result['over1sTotalMs'] = round(sum(e['duration'] for e in over1s), 1)

    print(json.dumps(result, ensure_ascii=False))
    err = result.get('bootError')
    measured = 'readySeconds' in result
    if not measured:
        summary = '摘要：测量没跑起来（' + str(result.get('fatal')) + '），没有菜单 / ready / 长任务数字。'
    else:
        summary = (
            f"摘要：菜单 {result.get('menuSeconds')} s 出现；RLP.ready {result.get('readySeconds')} s；"
            f"长任务 {result['longTaskCount']} 个，最长 {result['longestTaskMs'] / 1000:.2f} s，"
            f">1 s 的 {result['over1sCount']} 个共 {result['over1sTotalMs'] / 1000:.2f} s；"
            f"点“成就”到面板 {result.get('tapToPanelMs') if result.get('tapToPanelMs') is not None else '—'} ms"
            f"{'（没打开）' if not result.get('panelOpened') else ''}；"
            f"着色器程序 {result.get('programs')} 个；bootError：{'空' if not err else err}"
        )
    print(summary)
    if not measured or not result.get('ready') or err:
        exitCode = 1
    sys.exit(exitCode)


if __name__ == '__main__':
    main()
