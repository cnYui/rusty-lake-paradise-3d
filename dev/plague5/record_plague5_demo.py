"""第五灾通关演示：像真人一样玩一遍（标题菜单点章节、WASD 走路、鼠标靠边转身、点击、数字键选物品），
同时录屏录音，输出 mp4。任何一步卡住、断言失败或页面报错都会停下并存现场（截图 + RLP.info）。

用法：
  python dev/plague5/record_plague5_demo.py                    # 录制，默认 1280x720，输出 dev/plague5/media/demo/
  python dev/plague5/record_plague5_demo.py --size 1920x1080
  python dev/plague5/record_plague5_demo.py --fast             # 只玩不录，停顿清零、过场加速（查 bug 用）
  python dev/plague5/record_plague5_demo.py --fast --from-step 60 --state dev/plague5/media/demo/fail-info.json   # 从失败的那一步接着查

玩法顺序直接取章节自己的 walkthrough（RLP.chapter.walkthrough，和自动通关是同一份），逐步换成真实输入：
  click / use：在特写视图里直接点；在开放视图（室外 / 室内漫游）里走到热点附近、转身、点击；
  use：先按数字键选物品（别的物品选着时先取消，再按另一个数字键会触发合成）；
  back：按 ↓；go：玩家自己走过去，不传送；expectFlag / expectItem：断言。
驱动（鼠标 / 键盘 / 走路 / 找路 / 录制）复用第三灾脚本里的 Demo 类；RLP 只用来读状态，从不直接触发热点或传送。
"""
import argparse
import importlib.util
import json
import sys
import time
import traceback
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'dev' / 'common'))
from shot import serve                      # noqa: E402
from demo_recorder import Recorder          # noqa: E402

_spec = importlib.util.spec_from_file_location('record_plague3_demo', ROOT / 'dev' / 'plague3' / 'record_plague3_demo.py')
base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(base)
Demo, Fail = base.Demo, base.Fail

OUT_DIR = ROOT / 'dev' / 'plague5' / 'media' / 'demo'
DEBUG = bool(__import__('os').environ.get('DEMO_DEBUG'))

# 走到热点多远处点击（米）：小东西要走近，大东西可以站远一点；没写的用默认 3.0
APPROACH = {
    'p5_lettuce': 1.8, 'p5_cow_zoom': 4.2, 'p5_bucket': 1.8, 'p5_field_entry': 3.4, 'p5_constellation_entry': 3.4,
    'p5_house_entry': 4.2, 'p5_knife': 1.6, 'p5_barrel_zoom': 3.0, 'p5_cutboard_zoom': 1.8, 'p5_pot_zoom': 1.8,
    'p5_dining_entry': 2.0, 'p5_dining_menu': 1.8, 'p5_buns': 1.8, 'p5_kitchen_exit': 2.0, 'p5_toilet_entry': 3.0,
    'p5_memory_disk': 1.6, 'p5_temple_entry': 3.8, 'p5_altar_entry': 3.0, 'p5_painting_entry': 3.0,
}


def view_is_closeup(g):
    return g.ev("(() => { const v = RLP.ctx.views.get(RLP.state.view); return !!(v && v.closeup); })()")


def hotspot_in_view(g, hid):
    return g.ev("id => { const h = RLP.ctx.hotspots.get(id); return !!(h && (h.views || []).includes(RLP.state.view)); }", hid)


def select_item(g, item):
    cur = g.ev('RLP.state.selected')
    if cur == item:
        return
    if cur:
        g.ev('RLP.state.select(null)')
        g.rest(0.3)
    g.select(item)


ZONE_OF_X = [(250, 'exterior'), (350, 'house_int'), (450, 'temple_int'), (1e9, 'memory')]


def ensure_zone(g, hid):
    """目标热点在室外而玩家还在屋里（漫游室内）：先走到门口出门；开放视图里 walkthrough 的 go 步骤就是这个意思。"""
    zone = g.ev('__demo.pose().zone') or 'exterior'
    x = g.ev('id => { const h = RLP.ctx.hotspots.get(id); if (!h) return 0; RLP.ctx.world.root.updateMatrixWorld(true); '
             'const p = new RLP.ctx.THREE.Vector3(); h.object.getWorldPosition(p); return p.x; }', hid)
    want = next(z for lim, z in ZONE_OF_X if x < lim)
    if zone == 'house_int' and want == 'exterior' and not view_is_closeup(g):
        g.say('  先出门')
        g.approach_click('p5_kitchen_exit', dist=2.0, after=1.0)
        g.settle()


def play_click(g, hid, item=None):
    """点 / 用物品点 hid：能直接点到就直接点（特写、或者就在眼前），否则走过去再点。"""
    ensure_zone(g, hid)
    if DEBUG:
        g.say(f'  [调试] 点 {hid} 前：view={g.view()} closeup={view_is_closeup(g)} zone={g.ev("__demo.pose().zone")}')
    if item is None and g.ev('RLP.state.selected'):
        g.ev('RLP.state.select(null)')
        g.rest(0.2)
    pre = (lambda: select_item(g, item)) if item else None
    if view_is_closeup(g) or g.ev('RLP.ctx.ui.modalOpen'):
        if item:
            select_item(g, item)
        g.click(hid, after=0.5)
        return
    # 开放视图：热点有最远交互距离，原地点远处的热点会被忽略——总是先走到附近再点（和第四灾的演示一样）
    if item:
        g.ev('RLP.state.select(null)')
    g.approach_click(hid, dist=APPROACH.get(hid, 3.0), after=0.6, pre=pre)


def play_steps(g, steps, start=0):
    for i, step in enumerate(steps):
        if i < start:
            continue
        g.step_index = i
        if 'click' in step:
            if i % 10 == 0:
                g.say(f'第 {i + 1}/{len(steps)} 步：{step["click"]}')
            play_click(g, step['click'])
        elif 'use' in step:
            g.say(f'第 {i + 1}/{len(steps)} 步：用 {step["use"]} → {step["on"]}')
            g.need('id => RLP.state.has(id)', f'应持有 {step["use"]}', step['use'])
            play_click(g, step['on'], item=step['use'])
        elif 'back' in step:
            g.back()
        elif 'go' in step:
            continue                        # 玩家自己走过去，下一步的点击会走到
        elif 'expectFlag' in step:
            g.flag(step['expectFlag'])
        elif 'expectItem' in step:
            for it in ([step['expectItem']] if isinstance(step['expectItem'], str) else step['expectItem']):
                g.has(it)
        else:
            raise Fail('不认识的 walkthrough 步骤：' + json.dumps(step, ensure_ascii=False))
        g.settle()
        if g.ev('RLP.ctx.ui.docOpen'):          # 弹出了文档（菜单 / 字条）：停一会儿读，再按 Esc 关掉
            g.rest(2.5)
            g.page.keyboard.press('Escape')
            g.rest(0.8)


def intro(g):
    g.say('打开标题菜单')
    g.page.wait_for_selector('.plague', timeout=60000)
    g.rest(3.0)
    tile = g.page.locator('.plague').nth(4)
    box = tile.bounding_box()
    g.glide(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, 1100)
    g.rest(1.0)
    g.say('点“第五灾”')
    g.press()
    g.page.wait_for_function('window.RLP && RLP.ready && RLP.chapter && RLP.chapter.number === 5 && RLP.state.view', timeout=120000)
    g.install()
    g.rest(5.5)                                   # 看标题“第五灾 / 疫灾”


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', default='1280x720')
    ap.add_argument('--fast', action='store_true', help='不录屏，停顿清零')
    ap.add_argument('--out', default=None)
    ap.add_argument('--from-step', type=int, default=0, help='从 walkthrough 第几步开始（调试用，需配合 --state）')
    ap.add_argument('--state', default=None, help='失败现场 json（取其中的 flags 和 inventory 作为起点）')
    ap.add_argument('--start-view', default='p5_gate')
    a = ap.parse_args()
    W, H = map(int, a.size.split('x'))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    server, port = serve()
    url = f'http://127.0.0.1:{port}/'
    report = {'ok': False}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=[
            '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
            '--hide-scrollbars'])
        ctx = browser.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1)
        # 前五灾必须按顺序解锁：演示从“已经通关第一到第四灾”的档案开始（只在还没有档案时垫，不覆盖演示中拿到的成就）
        ctx.add_init_script("if (!localStorage.getItem('rlp3d.profile')) localStorage.setItem('rlp3d.profile', JSON.stringify({v: 1, ach: {}, cleared: {plague1: {t: 1}, plague2: {t: 1}, plague3: {t: 1}, plague4: {t: 1}}}))")
        rec = None if a.fast else Recorder(ctx, OUT_DIR / 'rec', size=(W, H))
        page = ctx.new_page()
        if rec:
            rec.attach(page)
        g = Demo(page, a.fast, OUT_DIR)
        page.on('pageerror', lambda e: g.errors.append('pageerror: ' + str(e)[:300]))
        page.on('console', lambda m: g.errors.append('console.error: ' + m.text[:300]) if m.type == 'error' and 'favicon' not in m.text else None)
        page.on('requestfailed', lambda r: g.errors.append('requestfailed: ' + r.url) if 'favicon' not in r.url else None)
        failed = None
        try:
            if a.from_step:
                st = json.loads(Path(a.state).read_text(encoding='utf-8'))['info'] if a.state else {'flags': {}, 'inventory': []}
                page.goto(url + 'index.html?autotest=1&chapter=5', wait_until='domcontentloaded')
                page.wait_for_function('window.RLP && RLP.ready', timeout=120000)
                page.evaluate('async o => { await RLP.start(5, o); }', {'fresh': True, 'skipIntro': True, 'view': a.start_view,
                                                                         'flags': st['flags'], 'give': st['inventory']})
                g.install()
                g.say(f'从第 {a.from_step} 步开始（调试）')
            else:
                page.goto(url + 'index.html', wait_until='domcontentloaded')
                page.wait_for_function('window.RLP && RLP.ready', timeout=120000)
                g.install()
                intro(g)
                g.say('点岛进入海滩')
                g.click('p5_overview_island', hover=0.5, after=0.5)
                g.settle()
                g.rest(1.5)
            steps = g.ev('RLP.chapter.walkthrough')
            steps = [s for s in steps if not ('click' in s and s['click'] == 'p5_overview_island')] if not a.from_step else steps
            play_steps(g, steps, a.from_step)
            g.say('通关！等结尾卡')
            g.wait_flag('plague5_complete', timeout=120000)
            g.rest(8.0)
            report['ok'] = g.ev('!!RLP.state.flag("plague5_complete")')
            report['achievements'] = g.ev('RLP.state.achievements')
        except Exception as e:  # noqa: BLE001
            failed = e
            traceback.print_exc()
            report['error'] = str(e)
            report['step'] = getattr(g, 'step_index', None)
            try:
                g.snapshot('exception')
            except Exception:  # noqa: BLE001
                pass
        report['page_errors'] = g.errors
        report['elapsed'] = round(time.time() - g.t0, 1)
        if rec:
            out = Path(a.out) if a.out else OUT_DIR / ('plague5-demo.mp4' if not failed else 'plague5-demo-partial.mp4')
            try:
                report['video'] = rec.finish(out)
                report['video']['path'] = str(out)
            except Exception as e:  # noqa: BLE001
                report['video_error'] = str(e)
        browser.close()
    server.shutdown()
    (OUT_DIR / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    sys.exit(0 if report['ok'] and not report['page_errors'] else 1)


if __name__ == '__main__':
    main()
