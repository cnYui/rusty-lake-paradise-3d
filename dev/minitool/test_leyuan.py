r"""233 乐园版口袋方舟包验收（make_leyuan.py 的产物）：

  1. 包结构：根目录有 index.html，ark_cfg.js 写了 __RLP_233，index.html 带广告 SDK（async）
  2. 手机横屏（844×390，触屏）：启动没有错误；进入第一灾后灯泡按钮显示、够大（≥ 44 px）、不压齿轮；
     触摸点灯泡 → 确认框 → 观看广告 → 本机模拟广告选“完整观看” → 显示提示
  3. 真实 SDK 路径（页面里注入假的 MetaH5Ad，回调 0 → 3 → 4）：不弹模拟框，看完显示提示；
     回调 0 → 1（中途关闭）不给提示；SDK 不支持（isAdSupport 返回 0）只说当前环境不支持广告
  4. 没有 ?leyuan 也显示灯泡（包里写死了 __RLP_233）；全程没有页面错误
  5. 每关 3 次提示（2026-11-20 用户定，ark_cfg.js 的 __RLP_HINTS_PER_LEVEL = 3）：灯泡下面显示 3/3 并随使用递减；前 3 次直接给提示、不放广告、
     面板里带“本关提示还剩 N 次”；用完后先问观看广告（取消不扣不给，看完给一条且次数仍是 0）；重新载入后次数不恢复（localStorage 键 rlp3d.hintUsed.<章节 id>）；
     上面 2、3 两项的广告路径测试先把本关次数用完

用法：python dev/minitool/test_leyuan.py [dist 目录]（默认最新的 dist-ark-leyuan-*）
截图写到 dev/minitool/_test_out_leyuan/。
"""
import functools
import glob
import http.server
import json
import os
import sys
import threading
import time
import zipfile
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '_test_out_leyuan')
results, errors = [], []


def check(name, ok, detail=None):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + json.dumps(detail, ensure_ascii=False) if detail is not None else ''), flush=True)


def poll(page, expr, timeout=60, interval=0.25):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if page.evaluate(expr):
                return True
        except Exception:
            pass
        time.sleep(interval)
    return False


def serve(dist):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=dist))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


FAKE_SDK = """(mode) => {
  window.__ads = 0;
  window.MetaH5Ad = {
    isAdSupport: (t, cb) => cb({ adType: t, code: 0, message: 'success', data: mode === 'unsupported' ? 0 : 1 }),
    showAd: (t, cb) => {
      window.__ads++;
      const ev = (s) => ({ adType: 1, code: 0, message: 'success', data: { type: 1, status: s } });
      const seq = mode === 'closed' ? [0, 1] : [0, 3, 4];
      seq.forEach((s, i) => setTimeout(() => cb(ev(s)), 60 * (i + 1)));
    },
  };
}"""


# 元素实际能被点中的区域：从中心向四周用 elementFromPoint 探（含 ark.css 伪元素撑出来的部分）
HIT_JS = """(sel) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const hit = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === el || el.contains(e)); };
  const ext = (dx, dy) => { let n = 0; while (n < 80 && hit(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
  return { w: ext(-1, 0) + ext(1, 0) + 1, h: ext(0, -1) + ext(0, 1) + 1 }; }"""


def panel(page):
    return page.evaluate("""() => { const m = document.querySelector('.modal.show'); return m ? { text: [...m.querySelectorAll('p')].map(p => p.textContent), btns: [...m.querySelectorAll('.btn')].map(b => b.textContent) } : null; }""")


def tap_btn(page, label):
    page.evaluate("(l) => [...document.querySelectorAll('.modal.show .btn')].find(b => b.textContent === l).click()", label)
    time.sleep(0.2)


CH_ID = 'plague1'
USED_UP = {CH_ID: 3}      # 本关的 3 次先用完：广告路径（2、3 两项）才会出确认框


def open_game(browser, base, fake=None, used=None):
    ctx = browser.new_context(viewport={'width': 844, 'height': 390}, has_touch=True, is_mobile=True, device_scale_factor=2)
    page = ctx.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
    page.on('console', lambda m: errors.append(f'[console.error] {m.text}') if m.type == 'error' else None)
    # 包里的广告 SDK 指向外网 CDN，本机测试不放行外网：请求直接放掉，由 add_init_script 里的假 MetaH5Ad 代替
    page.route('https://cdn.233xyx.com/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body='/* test stub */'))
    if fake:
        page.add_init_script(f'({FAKE_SDK})("{fake}")')
    if used:
        page.add_init_script('((m) => { for (const k in m) localStorage.setItem("rlp3d.hintUsed." + k, String(m[k])); })(' + json.dumps(used) + ')')
    page.goto(base + 'index.html?chapter=1&view=beach_mid&fresh=1', wait_until='domcontentloaded')
    assert poll(page, 'window.RLP && RLP.ready === true && document.getElementById("stage").classList.contains("inv-on")', 240), '游戏没有启动'
    assert page.evaluate('RLP.bootError') is None, page.evaluate('RLP.bootError')
    time.sleep(1.5)
    page.evaluate('RLP.idle()')
    return ctx, page


def main():
    dist = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sorted(glob.glob(os.path.join(HERE, 'dist-ark-leyuan-*')))[-1]
    os.makedirs(OUT, exist_ok=True)
    print('测试目录', dist)

    # 1. 包结构
    cfg = open(os.path.join(dist, 'ark_cfg.js'), encoding='utf-8').read()
    html = open(os.path.join(dist, 'index.html'), encoding='utf-8').read()
    check('包结构：ark_cfg.js 写了 __RLP_233、每关 3 次提示（__RLP_HINTS_PER_LEVEL = 3），仍有原来的 __RLP_NOROT',
          'window.__RLP_233 = true;' in cfg and 'window.__RLP_HINTS_PER_LEVEL = 3;' in cfg and '__RLP_NOROT' in cfg)
    check('包结构：index.html 带广告 SDK 且是 async（不挡启动），在 ark_cfg.js 之后、game.js 之前',
          '<script async src="https://cdn.233xyx.com/h5ad/metah5ad_v1.min.js"></script>' in html
          and html.index('ark_cfg.js') < html.index('metah5ad_v1.min.js') < html.index('game.js'))
    zips = sorted(glob.glob(os.path.join(HERE, '..', '..', 'upload', 'ark', 'rusty-lake-paradise-full10-*.zip')))
    if zips:
        with zipfile.ZipFile(zips[-1]) as z:
            check('zip：根目录有 index.html，资源路径合法', 'index.html' in z.namelist() and all(not n.startswith('/') and '..' not in n.split('/') for n in z.namelist()), z.namelist())

    httpd, port = serve(dist)
    base = f'http://127.0.0.1:{port}/'
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])

        # 2. 手机横屏 + 本机模拟广告
        ctx, page = open_game(browser, base, used=USED_UP)
        r = page.evaluate("""() => { const b = document.querySelector('.hint-btn'), g = document.querySelector('.gear'), cs = getComputedStyle(b);
          const a = b.getBoundingClientRect(), c = g.getBoundingClientRect(); return { display: cs.display, w: a.width, h: a.height, overlap: !(a.right <= c.left || c.right <= a.left || a.bottom <= c.top || c.bottom <= a.top), touch: document.getElementById('stage').classList.contains('touch') }; }""")
        check('手机横屏：包里没带 ?leyuan 也显示灯泡', r['display'] != 'none', r)
        page.screenshot(path=os.path.join(OUT, 'bulb_phone.png'))
        hb = page.evaluate(HIT_JS, '.hint-btn')
        gb = page.evaluate(HIT_JS, '.gear')
        check('触屏：灯泡实际可点区域不小于 44px，且不盖住齿轮（齿轮可点区域仍不小于 40px）',
              hb['w'] >= 44 and hb['h'] >= 44 and gb['w'] >= 40 and gb['h'] >= 40, {'bulb': hb, 'gear': gb})
        # 触摸点灯泡
        box = page.evaluate("(() => { const a = document.querySelector('.hint-btn').getBoundingClientRect(); return { x: a.left + a.width / 2, y: a.top + a.height / 2 }; })()")
        page.touchscreen.tap(box['x'], box['y'])
        time.sleep(0.4)
        p1 = panel(page)
        check('触摸点灯泡：弹确认框（取消 / 观看广告）', p1 and p1['btns'] == ['取消', '观看广告'], p1)
        page.screenshot(path=os.path.join(OUT, 'confirm_phone.png'))
        tap_btn(page, '观看广告')
        p2 = panel(page)
        check('本机没有 SDK：出现模拟广告选项（只在 localhost 出现）', p2 and '完整观看' in p2['btns'], p2)
        tap_btn(page, '完整观看')
        p3 = panel(page)
        want = page.evaluate('RLP.hints.next().text')
        check('完整观看后显示当前提示', p3 and p3['text'] == [want] and p3['btns'] == ['知道了'], {'got': p3, 'want': want})
        page.screenshot(path=os.path.join(OUT, 'hint_phone.png'))
        tap_btn(page, '知道了')
        ctx.close()

        # 3. 真实 SDK 路径
        for mode, expect in (('rewarded', 'hint'), ('closed', 'none'), ('unsupported', 'unsupported')):
            ctx, page = open_game(browser, base, fake=mode, used=USED_UP)
            page.evaluate("document.querySelector('.hint-btn').click()")
            time.sleep(0.3)
            if mode == 'unsupported':
                p = panel(page)
                check('真实 SDK、isAdSupport 返回 0：直接说当前环境不支持广告，不弹确认框', p and '不支持广告' in ''.join(p['text']) and p['btns'] == ['知道了'], p)
            else:
                tap_btn(page, '观看广告')
                time.sleep(0.8)
                p = panel(page)
                ads = page.evaluate('window.__ads')
                want = page.evaluate('RLP.hints.next().text')
                if expect == 'hint':
                    check('真实 SDK、回调 0 → 3 → 4：不弹模拟框，放了 1 次广告，看完显示提示', ads == 1 and p and p['text'] == [want], {'ads': ads, 'panel': p})
                else:
                    check('真实 SDK、回调 0 → 1（中途关闭）：不给提示', ads == 1 and p and want not in ''.join(p['text']) and '没有获得提示' in ''.join(p['text']), {'ads': ads, 'panel': p})
            ctx.close()

        # 5. 每关 3 次提示：全新玩家 → 3/3 → 直接给 3 次 → 第 4 次问观看广告 → 取消 → 看完（次数仍是 0）→ 重新载入后不恢复
        count = lambda pg: pg.evaluate("(document.querySelector('.hint-btn .hint-count') || {}).textContent || null")
        ctx, page = open_game(browser, base)
        check('每关 3 次：全新玩家灯泡下面写 3/3，localStorage 里没有记录', count(page) == '3/3' and page.evaluate(f"localStorage.getItem('rlp3d.hintUsed.{CH_ID}')") is None, count(page))
        page.screenshot(path=os.path.join(OUT, 'count_3of3.png'))
        want = page.evaluate('RLP.hints.next().text')
        for i in (1, 2, 3):
            page.evaluate("document.querySelector('.hint-btn').click()")
            time.sleep(0.4)
            p = panel(page)
            tail = ('（本关提示还剩 %d 次）' % (3 - i)) if i < 3 else '（本关提示用完了，之后每条提示要观看一段广告。）'
            check(f'每关 3 次 · 第 {i} 次：直接显示提示 + “{tail}”，只有“知道了”、没放广告',
                  p and p['text'] == [want, tail] and p['btns'] == ['知道了'] and not page.evaluate('window.__ads'), p)
            if i == 1:
                page.screenshot(path=os.path.join(OUT, 'count_hint_1.png'))
            tap_btn(page, '知道了')
            time.sleep(0.2)
            check(f'每关 3 次 · 第 {i} 次以后：灯泡下面写 {3 - i}/3、localStorage 记 {i}',
                  count(page) == f'{3 - i}/3' and page.evaluate(f"localStorage.getItem('rlp3d.hintUsed.{CH_ID}')") == str(i), count(page))
        page.screenshot(path=os.path.join(OUT, 'count_0of3.png'))
        page.evaluate("document.querySelector('.hint-btn').click()")
        time.sleep(0.4)
        p = panel(page)
        check('每关 3 次 · 第 4 次：先问观看广告（话里说本关已用完）、不直接给提示', p and p['btns'] == ['取消', '观看广告'] and '已用完' in ''.join(p['text']) and want not in ''.join(p['text']), p)
        tap_btn(page, '取消')
        time.sleep(0.2)
        check('每关 3 次 · 取消：不扣不给，仍是 0/3', count(page) == '0/3' and panel(page) is None, count(page))
        page.evaluate("document.querySelector('.hint-btn').click()")
        time.sleep(0.3)
        tap_btn(page, '观看广告')
        time.sleep(0.3)
        tap_btn(page, '完整观看')
        time.sleep(0.3)
        p = panel(page)
        check('每关 3 次 · 用完后看完广告：给一条提示，灯泡下面仍是 0/3（看广告换的提示不扣次数）', p and p['text'] == [want] and count(page) == '0/3', {'panel': p, 'count': count(page)})
        tap_btn(page, '知道了')
        # 重新载入（同一个浏览器上下文 = 同一份 localStorage；?fresh=1 只清存档，不清提示次数）：退出重进不恢复
        page.goto(base + 'index.html?chapter=1&view=beach_mid&fresh=1', wait_until='domcontentloaded')
        assert poll(page, 'window.RLP && RLP.ready === true', 240), '重新载入后游戏没有启动'
        time.sleep(1.5)
        page.evaluate('RLP.idle()')
        check('每关 3 次 · 重新载入后：次数没有恢复，仍是 0/3', count(page) == '0/3' and page.evaluate(f"localStorage.getItem('rlp3d.hintUsed.{CH_ID}')") == '3', count(page))
        page.evaluate("document.querySelector('.hint-btn').click()")
        time.sleep(0.4)
        p = panel(page)
        check('每关 3 次 · 重新载入后点灯泡：仍先问观看广告', p and p['btns'] == ['取消', '观看广告'], p)
        ctx.close()
        browser.close()
    httpd.shutdown()

    bad = [e for e in errors if 'toNonIndexed' not in e and 'flatShading' not in e]
    check('全程没有页面错误 / 控制台错误', not bad, bad[:6])
    print(f'\n{sum(results)}/{len(results)} 通过')
    sys.exit(0 if all(results) else 1)


if __name__ == '__main__':
    main()
