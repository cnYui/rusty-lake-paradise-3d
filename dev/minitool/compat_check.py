r"""验证兼容垫片（compat.js + 转写后的 CSS）。这里没有 Chrome 61，只能在现代 Chromium 里把“Chrome 61 没有的接口”删掉来模拟：

  1. 页面脚本运行之前删掉 Array.prototype.flat / flatMap、Promise.prototype.finally、CanvasRenderingContext2D.prototype.roundRect、ResizeObserver、OffscreenCanvas，
     再加载 dist：compat.js 要把前四个补上；游戏能启动（建世界时会调 roundRect / flat / flatMap）、没有页面错误、没有 CSP 违规
  2. 垫片和原生实现的输出逐项对比：flat / flatMap / finally 的结果，roundRect 在多种半径写法下画出来的像素
  3. flex gap 兜底：同一个页面用 ?flexgap=0（强制走 margin 兜底）和默认（原生 gap）各量一次标题关卡按钮、设置面板里 .vol-row / .btn-row 的位置，应该一致
  4. 删掉这些接口后跑完整流程 RLP.autoplay()（?flexgap=0，兜底样式也在用）

用法：python dev/minitool/compat_check.py [dist 目录，默认 dist-audio] [--quick（跳过 4）]
注意：这不等于在 Chrome 61 / Android 8.1 上验证过，只是证明垫片本身正确、游戏没有再依赖这些缺失的接口。
"""
import functools, http.server, json, os, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
QUICK = '--quick' in sys.argv
DIST = os.path.abspath(args[0] if args else os.path.join(HERE, 'dist-audio'))

CSP = ("default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
       "font-src 'self'; media-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")


class H(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

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


# 在页面脚本之前：先把原生实现存起来，再删掉（模拟 Chrome 61）
STRIP = """
window.__native = {
  flat: Array.prototype.flat, flatMap: Array.prototype.flatMap, fin: Promise.prototype.finally,
  rr: CanvasRenderingContext2D.prototype.roundRect,
};
delete Array.prototype.flat; delete Array.prototype.flatMap; delete Promise.prototype.finally;
delete CanvasRenderingContext2D.prototype.roundRect;
delete window.ResizeObserver; delete window.OffscreenCanvas;
window.__stripped = [typeof [].flat, typeof [].flatMap, typeof Promise.prototype.finally, typeof CanvasRenderingContext2D.prototype.roundRect, typeof ResizeObserver, typeof OffscreenCanvas];
"""


def new_page(browser, w=390, h=844, strip=True):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    log = {'errors': [], 'failed': []}
    page.add_init_script("document.addEventListener('securitypolicyviolation', e => (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI));")
    if strip:
        page.add_init_script(STRIP)
    page.on('console', lambda m: log['errors'].append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: log['errors'].append(f'[pageerror] {e}'))
    page.on('requestfailed', lambda r: log['failed'].append(f'{r.url} {r.failure}'))
    return ctx, page, log


def poll(page, expr, timeout=30.0, every=0.25):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(f'!!({expr})'):
            return True
        time.sleep(every)
    return False


def errs_ok(page, log, label):
    csp = page.evaluate('window.__csp || []')
    errs = [e for e in log['errors'] if 'toNonIndexed' not in e and 'flatShading' not in e]
    check(f'{label}：没有 CSP 违规 / 页面错误 / 请求失败', not csp and not errs and not log['failed'], [csp[:3], errs[:3], log['failed'][:3]])


COMPARE = """async () => {
  const N = window.__native, out = {};
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // flat / flatMap
  const sample = [1, [2, [3, [4, [5]]]], , 6, [], [[7]]];
  const flatCases = [undefined, 0, 1, 2, Infinity].map(d => [d, same(sample.flat(d), N.flat.call(sample, d)), JSON.stringify(sample.flat(d))]);
  out.flat = flatCases.filter(c => !c[1]);
  const fm = [[x => [x, [x]]], [x => x], [x => (x % 2 ? [x, x] : [])]].map(([f]) => same([1, 2, 3].flatMap(f), N.flatMap.call([1, 2, 3], f)));
  out.flatMap = fm.every(Boolean);
  out.flatMapThisArg = same([1].flatMap(function () { return [this.v]; }, { v: 9 }), [9]);
  // finally：值透传 / 拒绝透传 / finally 里再抛错覆盖 / 回调返回 promise 会等待
  const run = async (P) => {
    const log = [];
    const a = await P.resolve(1).finally(() => log.push('a'));
    let b; try { await P.reject(new Error('x')).finally(() => log.push('b')); } catch (e) { b = e.message; }
    let c; try { await P.resolve(1).finally(() => { throw new Error('y'); }); } catch (e) { c = e.message; }
    const t0 = performance.now(); await P.resolve(2).finally(() => new Promise(r => setTimeout(r, 60))); const waited = performance.now() - t0 >= 50;
    const d = await P.resolve(3).finally();
    return { a, b, c, waited, d, log };
  };
  const mine = await run({ resolve: v => Promise.resolve(v), reject: v => Promise.reject(v) });
  out.finally = mine;
  // roundRect 像素对比
  const draw = (useNative, args) => {
    const cv = document.createElement('canvas'); cv.width = 260; cv.height = 140;
    const g = cv.getContext('2d'); g.fillStyle = '#000'; g.beginPath();
    (useNative ? N.rr : CanvasRenderingContext2D.prototype.roundRect).apply(g, args); g.fill();
    return g.getImageData(0, 0, 260, 140).data;
  };
  const cases = [[10, 10, 200, 100, 12], [10, 10, 200, 100, [30, 5]], [10, 10, 200, 100, [5, 10, 40]], [10, 10, 200, 100, [1, 20, 3, 40]],
                 [10, 10, 200, 100, 0], [10, 10, 200, 40, 60], [210, 110, -200, -100, [10, 30, 50, 70]], [10, 10, 200, 100, { x: 14, y: 14 }], [10, 10, 200, 100]];
  out.rr = cases.map((args) => {
    const a = draw(true, args), b = draw(false, args);
    let big = 0, max = 0;
    for (let i = 3; i < a.length; i += 4) { const d = Math.abs(a[i] - b[i]); if (d > max) max = d; if (d > 64) big++; }
    return { args: JSON.stringify(args), maxAlphaDiff: max, pixelsOver64: big };
  });
  return out;
}"""

MEASURE = """() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left * 10) / 10, Math.round(b.top * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10]; };
  const sel = (s) => [...document.querySelectorAll(s)].map(r);
  return { plague: sel('.plague'), volRow: sel('.vol-row > *'), btnRow: sel('.btn-row > *'), cls: document.documentElement.className };
}"""


def measure(browser, query, kill_native_gap=False):
    ctx, page, log = new_page(browser, strip=False)
    page.goto(f'{BASE}/index.html?norender=1{query}')
    assert poll(page, 'window.RLP && RLP.ready === true && RLP.ctx.ui.menu.visible === true', 120)
    if kill_native_gap:
        # ?flexgap=0 只是让 compat.js 以为不支持（给 <html> 加 no-flexgap）；现代 Chromium 的原生 gap 仍然生效，
        # 要模拟老内核就得把原生 gap 关掉，否则间距 = gap + margin 会翻倍
        page.add_style_tag(content='* { gap: 0 !important; row-gap: 0 !important; column-gap: 0 !important; }')
    time.sleep(0.4)
    m = page.evaluate(MEASURE)
    page.evaluate("[...document.querySelectorAll('.menu-link')].find(b => b.textContent === '设置').click()")
    time.sleep(0.8)
    m2 = page.evaluate(MEASURE)
    m['volRow'], m['btnRow'] = m2['volRow'], m2['btnRow']
    ctx.close()
    return m


with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])

    # ---- 1 + 2：删掉接口后启动；垫片对比原生
    print('\n=== 1/2 删掉 Chrome 61 没有的接口后启动，垫片对比原生 ===', flush=True)
    ctx, page, log = new_page(browser)
    page.goto(f'{BASE}/index.html?norender=1')
    removed = page.evaluate('window.__stripped')
    check('页面脚本运行前这些接口已被删掉（flat / flatMap / finally / roundRect / ResizeObserver / OffscreenCanvas 全是 undefined）', removed == ['undefined'] * 6, removed)
    ok = poll(page, 'window.RLP && RLP.ready === true', 180)
    check('删掉接口后游戏能启动（建世界会调用 roundRect / flat / flatMap），没有 bootError', ok and page.evaluate('!RLP.bootError'), page.evaluate('window.RLP && RLP.bootError'))
    check('compat.js 把 flat / flatMap / finally / roundRect 补上了', page.evaluate("[typeof [].flat, typeof [].flatMap, typeof Promise.prototype.finally, typeof CanvasRenderingContext2D.prototype.roundRect]") == ['function'] * 4)
    res = page.evaluate(COMPARE)
    check('flat（depth 缺省 / 0 / 1 / 2 / Infinity，含空位）与原生结果一致', res['flat'] == [], res['flat'])
    check('flatMap 与原生结果一致，thisArg 生效', res['flatMap'] is True and res['flatMapThisArg'] is True, [res['flatMap'], res['flatMapThisArg']])
    f = res['finally']
    check('Promise.finally：值透传、拒绝透传、finally 里抛错会覆盖、会等回调返回的 promise、不传回调也行',
          f['a'] == 1 and f['b'] == 'x' and f['c'] == 'y' and f['waited'] is True and f['d'] == 3 and f['log'] == ['a', 'b'], f)
    worst = max(r['maxAlphaDiff'] for r in res['rr']), max(r['pixelsOver64'] for r in res['rr'])
    print('  roundRect 各写法的像素差：', json.dumps(res['rr'], ensure_ascii=False))
    check('roundRect 垫片与原生画出的形状一致（9 种参数写法：数字 / 2·3·4 个半径 / 半径过大 / 宽高为负 / {x,y} / 省略）；允许抗锯齿边缘的细小差异：差 > 64 的像素 ≤ 20 个',
          worst[1] <= 20, worst)
    errs_ok(page, log, '删掉接口后的启动')
    ctx.close()

    # ---- 3：flex gap 兜底
    print('\n=== 3 flex gap：原生 gap vs margin 兜底（?flexgap=0）===', flush=True)
    a = measure(browser, '')
    b = measure(browser, '&flexgap=0', kill_native_gap=True)
    check('默认：支持 flex gap，<html> 上没有 no-flexgap；?flexgap=0：有 no-flexgap', 'no-flexgap' not in a['cls'] and 'no-flexgap' in b['cls'], [a['cls'], b['cls']])
    for key, name in (('plague', '标题的关卡按钮 .plagues'), ('volRow', '设置面板 .vol-row'), ('btnRow', '设置面板 .btn-row')):
        same = len(a[key]) == len(b[key]) and len(a[key]) > 0 and all(abs(x - y) < 1.01 for ra, rb in zip(a[key], b[key]) for x, y in zip(ra, rb))
        check(f'{name}：兜底（margin）与原生 gap 的位置一致（每个值差 ≤ 1px）', same, [a[key][:3], b[key][:3]])

    # ---- 4：删掉接口 + 兜底样式下跑完整流程
    if not QUICK:
        print('\n=== 4 删掉接口 + ?flexgap=0 下完整流程 ===', flush=True)
        ctx, page, log = new_page(browser)
        page.goto(f'{BASE}/index.html?autotest=1&flexgap=0')
        assert poll(page, 'window.RLP && RLP.ready === true', 180)
        t0 = time.time()
        res = page.evaluate("(async () => { RLP.timeScale = 3; const r = await RLP.autoplay({ stepDelay: 0 }); return { ok: r.ok, steps: r.steps, total: r.total, error: r.error, failedStep: r.failedStep }; })()")
        check(f'autoplay 跑完（{time.time() - t0:.0f}s；合成物品会用到 Promise.finally）', res['ok'] and res['steps'] == res['total'], res)
        errs_ok(page, log, '完整流程')
        ctx.close()
    browser.close()

srv.shutdown()
print(json.dumps({'passed': sum(results), 'total': len(results)}))
sys.exit(0 if all(results) else 1)
