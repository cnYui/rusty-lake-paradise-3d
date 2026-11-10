"""第五灾逐视图截图（看新模型 / 谜题布景用）。每个视图一次 RLP.start，带超时，页面报错直接打印。

用法：
  python dev/plague5/shots_plague5.py                          # 默认几个新做的视图，输出 dev/plague5/media/verification/
  python dev/plague5/shots_plague5.py p5_skin p5_field         # 只拍指定视图
  python dev/plague5/shots_plague5.py p5_table --flags '{"burger_complete":true}' --js "RLP.ctx.p5.world.burger.setLayers([...])"
"""
import argparse
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'dev' / 'common'))
from shot import serve                      # noqa: E402

OUT = ROOT / 'dev' / 'plague5' / 'media' / 'verification'
BURGER = ['bun_bottom', 'lettuce', 'cooked_meat', 'cheese', 'tomato_slice', 'cucumber_slice', 'bun_top']
DEFAULTS = [
    ('p5_cow', {}, ''),
    ('p5_skin', {}, ''),
    ('p5_field', {}, ''),
    ('p5_constellation', {}, ''),
    ('p5_cutboard', {}, ''),
    ('p5_cutboard', {}, "const b = RLP.ctx.p5.world.cutboard; b.beginCut('tomato'); b.cut(2);"),
    ('p5_pot', {'pot_loaded': True, 'pot_cooked': True}, ''),
    ('p5_table', {'burger_layers': BURGER, 'burger_complete': True}, ''),
]


def shoot(page, name, view, flags, js, wait, chapter=5):
    opts = json.dumps({'fresh': True, 'skipIntro': True, 'view': view, 'flags': flags, 'give': []})
    page.evaluate(f"() => {{ window.__done = false; window.__err = null; RLP.start({chapter}, {opts}).then(() => {{ RLP.timeScale = 1; {js}; window.__done = true; }}).catch(e => {{ window.__err = String(e && e.stack || e); window.__done = true; }}); }}")
    page.wait_for_function('window.__done === true', timeout=120000)
    err = page.evaluate('window.__err || RLP.bootError || null')
    time.sleep(wait)
    path = OUT / f'{name}.png'
    page.screenshot(path=str(path))
    print(f'{name}: view={page.evaluate("RLP.state.view")} err={err}', flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('views', nargs='*')
    ap.add_argument('--flags', default='{}')
    ap.add_argument('--js', default='')
    ap.add_argument('--chapter', type=int, default=5)
    ap.add_argument('--wait', type=float, default=1.2)
    ap.add_argument('--size', default='1280x720')
    a = ap.parse_args()
    W, H = map(int, a.size.split('x'))
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = [(v, json.loads(a.flags), a.js) for v in a.views] if a.views else DEFAULTS
    server, port = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'])
        page = browser.new_page(viewport={'width': W, 'height': H})
        page.on('pageerror', lambda e: print('  [pageerror]', str(e)[:400], flush=True))
        page.on('console', lambda m: print('  [console]', m.text[:300], flush=True) if m.type in ('error', 'warning') else None)
        page.goto(f'http://127.0.0.1:{port}/index.html?autotest=1&chapter={a.chapter}', wait_until='domcontentloaded')
        page.wait_for_function('window.RLP && RLP.ready', timeout=120000)
        for i, (view, flags, js) in enumerate(jobs):
            shoot(page, f'{i:02d}_{view}', view, flags, js, a.wait, a.chapter)
        browser.close()
    server.shutdown()


if __name__ == '__main__':
    main()
