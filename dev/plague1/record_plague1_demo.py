"""从标题菜单开始录制第一灾完整游玩过程（画面 + 游戏 WebAudio 声音）。

用法：
  python dev/plague1/record_plague1_demo.py
  python dev/plague1/record_plague1_demo.py --size 1920x1080
  python dev/plague1/record_plague1_demo.py --fast   # 只验证流程，不录屏
"""
import argparse
import json
import sys
import time
import traceback
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'common'))
from demo_recorder import Recorder  # noqa: E402
from shot import serve  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'dev' / 'plague1' / 'media' / 'demo'


def wait_intro(page, timeout=120000):
    page.wait_for_function(
        "window.RLP && RLP.ready && RLP.chapter && RLP.chapter.number === 1 && RLP.state && RLP.state.view",
        timeout=timeout,
    )
    page.wait_for_function(
        "RLP.state.view === 'overview' && !RLP.ctx.ui.docOpen && !RLP.ctx.ui.locked",
        timeout=timeout,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', default='1280x720')
    ap.add_argument('--fast', action='store_true', help='只验证第一灾流程，不录屏')
    ap.add_argument('--out', default=None)
    a = ap.parse_args()
    width, height = map(int, a.size.split('x'))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    server, port = serve()
    base = f'http://127.0.0.1:{port}/'
    report = {'ok': False}
    t0 = time.time()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=[
            '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist',
            '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars',
        ])
        context = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=1)
        out_dir = OUT_DIR / 'rec'
        rec = None if a.fast else Recorder(context, out_dir, size=(width, height))
        page = context.new_page()
        if rec:
            rec.attach(page)
        page_errors = []
        page.on('pageerror', lambda e: page_errors.append('pageerror: ' + str(e)[:400]))
        page.on('console', lambda m: page_errors.append('console.error: ' + m.text[:400])
                if m.type == 'error' and 'favicon' not in m.text else None)
        page.on('requestfailed', lambda r: page_errors.append('requestfailed: ' + r.url)
                if 'favicon' not in r.url else None)
        try:
            # 从无参数首页进入，确保录制包含标题菜单和第一灾片头。
            page.goto(base + 'index.html', wait_until='domcontentloaded')
            page.wait_for_selector('.plague', timeout=60000)
            page.wait_for_timeout(2500)
            tile = page.locator('.plague').nth(0)
            box = tile.bounding_box()
            if not box:
                raise RuntimeError('找不到第一灾菜单卡片')
            page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
            page.wait_for_timeout(450)
            page.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
            wait_intro(page)
            # 片头结束后用章节公开 walkthrough 逐步完成所有玩家交互；fast=false 保留动画、音效和渲染。
            if a.fast:
                page.evaluate('RLP.timeScale = 1000')
            result = page.evaluate("""async (fast) => await RLP.autoplay({
                stepDelay: fast ? 0 : 280,
                fast,
                stepTimeout: 120000,
                stopOnError: true
            })""", a.fast)
            report['autoplay'] = {
                'ok': result.get('ok'), 'steps': result.get('steps'), 'total': result.get('total'),
                'failedStep': result.get('failedStep'), 'warnings': result.get('warnings', []),
            }
            report['ok'] = bool(result.get('ok') and result.get('steps') == result.get('total')
                                and result.get('flags', {}).get('plague1_complete'))
            report['flags'] = result.get('flags', {})
            report['achievements'] = result.get('achievements', [])
            page.wait_for_timeout(7000)
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            report['error'] = str(exc)
            try:
                (OUT_DIR / 'record-failure.png').parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(OUT_DIR / 'record-failure.png'))
                report['failure_info'] = page.evaluate('RLP.info ? RLP.info() : null')
            except Exception:
                pass
        report['page_errors'] = page_errors
        report['elapsed'] = round(time.time() - t0, 1)
        if rec:
            output = Path(a.out) if a.out else OUT_DIR / ('plague1-demo.mp4' if report['ok'] else 'plague1-demo-partial.mp4')
            try:
                report['video'] = rec.finish(output)
                report['video']['path'] = str(output)
            except Exception as exc:  # noqa: BLE001
                report['video_error'] = str(exc)
        browser.close()
    server.shutdown()
    (OUT_DIR / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    sys.exit(0 if report['ok'] and not report['page_errors'] else 1)


if __name__ == '__main__':
    main()
