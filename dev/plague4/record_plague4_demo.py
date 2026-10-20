"""第四灾通关演示：像真人一样玩一遍（标题菜单点章节、WASD 走路、鼠标靠边转身、点击、数字键选物品），
同时录屏录音，输出 mp4。任何一步卡住、断言失败或页面报错都会停下并存现场（截图 + RLP.info）。

用法：
  python dev/plague4/record_plague4_demo.py                    # 录制，默认 1280x720，输出 dev/plague4/media/demo/
  python dev/plague4/record_plague4_demo.py --size 1920x1080
  python dev/plague4/record_plague4_demo.py --fast             # 只玩不录，停顿清零、过场加速（查 bug 用）

驱动（鼠标 / 键盘 / 走路 / 找路 / 录制）直接复用第三灾脚本里的 Demo 类；RLP 只用来读状态，从不直接触发热点或传送。
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

OUT_DIR = ROOT / 'dev' / 'plague4' / 'media' / 'demo'


def use(g, item, hid, **kw):
    """用物品：先取消当前选中的别的物品（再按另一个数字键会触发合成，不是换选）。"""
    cur = g.ev('RLP.state.selected')
    if cur and cur != item:
        g.ev('RLP.state.select(null)')
        g.rest(0.3)
    g.use(item, hid, **kw)


def in_view(g, view):
    if g.view() != view:
        raise Fail(f'应进入 {view}，实际 {g.view()}')


# ====================================================================================== 剧情（顺序同 walkthrough.js）
def intro(g):
    g.say('打开标题菜单')
    g.page.wait_for_selector('.plague', timeout=60000)
    g.rest(3.0)
    tile = g.page.locator('.plague').nth(3)
    box = tile.bounding_box()
    g.glide(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, 1100)
    g.rest(1.0)
    g.say('点“第四灾”')
    g.press()
    g.page.wait_for_function('window.RLP && RLP.ready && RLP.chapter && RLP.chapter.number === 4 && RLP.state.view', timeout=120000)
    g.install()
    g.rest(5.5)                                   # 看标题“第四灾 / 蝇灾”
    g.say('点岛进入海滩')
    g.click('overview_island', hover=0.5, after=0.5)
    g.settle()
    g.rest(1.5)
    in_view(g, 'beach_mid')


def phase_cocoon(g):
    g.say('森林空地：蛹孵化出苍蝇人')
    g.approach_click('cocoon_zoom', dist=3.6, after=1.0)
    in_view(g, 'cocoon')
    g.rest(1.0)
    g.click('cocoon_hatch', after=1.5)
    g.flag('p4_fly_awake')
    g.back()


def phase_house(g):
    g.say('小屋：奶奶、蜡烛、木箱和胡萝卜')
    g.approach_click('house_entry', dist=4.2, after=1.0)
    in_view(g, 'house_int')
    g.approach_click('grandmother', dist=2.2, after=1.2)
    g.approach_click('candle', dist=1.6, after=1.0)
    g.approach_click('chest', dist=1.8, after=1.0)
    g.approach_click('carrot', dist=1.5, after=1.0)
    g.has('candle')
    g.has('carrot')
    g.say('  出门')
    g.face_click('house_exit', after=1.0)


def phase_pit(g):
    g.say('地洞：挪开木板，拿虫子，用蜡烛照洞底')
    g.approach_click('pit_zoom', dist=3.2, after=1.0)
    in_view(g, 'pit')
    g.rest(1.0)
    for i in range(3):
        g.click(f'branch_{i}', after=0.8)
    g.click('uncle', after=1.0)
    g.has('worm')
    use(g, 'candle', 'uncle', after=0.5)
    g.flag('p4_card_seen')
    g.rest(2.5)                                    # 看纸牌
    if g.ev('RLP.ctx.ui.docOpen'):
        g.page.keyboard.press('Escape')
        g.rest(0.8)
    g.back()


def crab_round(g, round_, positions):
    for i, (x, y) in enumerate(positions):
        g.click(f'crab_shell_{round_}_{i}', hover=0.15, after=0.25)
        g.click(f'crab_cell_{round_}_{x}_{y}', hover=0.15, after=0.35)
    g.rest(0.6)
    g.click(f'crab_start_{round_}', after=1.0)


def phase_crab(g):
    g.say('湖边：三轮寄居蟹')
    g.approach_click('crab_zoom', dist=4.2, after=1.0)
    in_view(g, 'crab_board')
    g.rest(1.2)
    crab_round(g, 0, [[2, 2], [2, 0], [6, 0]])
    in_view(g, 'crab_board')
    crab_round(g, 1, [[2, 3], [2, 1], [6, 1], [6, 5], [8, 5]])
    in_view(g, 'crab_board')
    crab_round(g, 2, [[1, 4], [1, 1], [4, 1], [4, 7], [8, 7], [8, 2], [10, 2]])
    g.settle()
    g.rest(1.5)
    in_view(g, 'crab_feast')
    g.say('  苍蝇人吃掉寄居蟹，取蟹肉')
    g.click('crab_meal', after=1.2)
    g.click('crab_heart', after=1.0)
    g.has('crab_heart')
    g.back()


def phase_rabbit(g):
    g.say('水泵边：胡萝卜引兔，苍蝇人吃兔，取兔心')
    g.approach_click('rabbit_zoom', dist=3.0, after=1.0)
    in_view(g, 'rabbit')
    use(g, 'carrot', 'rabbit_bait', after=1.0)
    g.click('rabbit_meal', after=1.2)
    g.click('rabbit_heart', after=1.0)
    g.has('rabbit_heart')
    g.back()


def phase_bird(g):
    g.say('海滩：捕鸟盘，用木板支起、放虫子，苍蝇人吃鸟，取鸟心')
    g.approach_click('trap_zoom', dist=2.6, after=1.0)
    in_view(g, 'trap')
    use(g, 'branch', 'bird_trap', after=1.0)
    use(g, 'worm', 'bird_trap', after=1.2)
    g.click('bird_meal', after=1.2)
    g.click('bird_heart', after=1.0)
    g.has('bird_heart')
    g.back()


def phase_owl(g):
    g.say('猫头鹰图腾：三颗心，扳翅膀，取绿宝石')
    g.approach_click('owl_zoom', dist=3.6, after=1.0)
    in_view(g, 'owl')
    for item, wing in [('crab_heart', 'owl_wing_l'), ('rabbit_heart', 'owl_wing_r'), ('bird_heart', 'owl_wing_l')]:
        use(g, item, 'owl_mouth', after=0.8)
        g.click(wing, after=1.2)
    g.click('owl_gem', after=1.0)
    g.has('gem')
    g.back()


def phase_door(g):
    g.say('神殿：绿宝石打开石门，进神殿')
    g.approach_click('stone_door', dist=4.0, after=0.5, pre=lambda: g.select('gem'))
    g.flag('p4_gate_open')
    g.rest(1.0)
    g.approach_click('temple_entry', dist=3.6, after=1.2)
    in_view(g, 'temple_int')


def phase_book_window(g):
    g.say('神殿：和父亲说话，翻书，设窗锁')
    g.click('father', after=1.5)
    g.click('book', after=1.0)
    in_view(g, 'book')
    for _ in range(3):
        g.rest(2.2)                                # 看书页
        g.click('book_next', after=0.5)
    g.rest(2.2)
    g.flag('p4_book_read')
    g.back()
    g.click('window_zoom', after=1.0)
    in_view(g, 'window')
    g.rest(0.8)
    for tab, slot in [(0, 1), (1, 3), (2, 8), (3, 10)]:
        g.click(f'window_tab_{tab}', hover=0.2, after=0.4)
        g.click(f'window_slot_{slot}', hover=0.2, after=0.6)
    g.wait_flag('p4_father_taken', timeout=120000)
    g.settle()
    g.rest(1.0)
    in_view(g, 'memory')


def phase_ending(g):
    g.say('回忆，取黑方块，放进吊架')
    g.click('memory_scene', hover=0.4, after=1.5)
    g.click('black_cube', after=1.0)
    g.has('black_cube')
    g.click('altar_zoom', after=1.0)
    g.click('holder', after=1.2)
    use(g, 'black_cube', 'holder', hover=0.3, after=0.8)
    g.click('font', after=1.5)
    g.click('holder', after=1.5)
    g.flag('p4_holder_lowered')
    g.click('next_plague', after=0.5)
    g.wait_flag('plague4_complete', timeout=120000)
    g.say('通关！等结尾卡')
    g.rest(8.0)


PHASES = [intro, phase_cocoon, phase_house, phase_pit, phase_crab, phase_rabbit, phase_bird, phase_owl, phase_door,
          phase_book_window, phase_ending]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', default='1280x720')
    ap.add_argument('--fast', action='store_true', help='不录屏，停顿清零')
    ap.add_argument('--out', default=None)
    ap.add_argument('--resume-from', default=None, help='从某个阶段函数名开始（调试用，需配合 --state）')
    ap.add_argument('--state', default=None, help='失败现场 json（取其中的 flags 和 inventory 作为起点）')
    ap.add_argument('--start-view', default='beach_mid')
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
            phases = PHASES
            if a.resume_from:
                names = [f.__name__ for f in PHASES]
                phases = PHASES[names.index(a.resume_from):]
                st = json.loads(Path(a.state).read_text(encoding='utf-8'))['info'] if a.state else {'flags': {}, 'inventory': []}
                page.goto(url + 'index.html?autotest=1&chapter=4', wait_until='domcontentloaded')
                page.wait_for_function('window.RLP && RLP.ready', timeout=120000)
                page.evaluate('async o => { await RLP.start(4, o); }', {'fresh': True, 'skipIntro': True, 'view': a.start_view,
                                                                         'flags': st['flags'], 'give': st['inventory']})
                g.install()
                g.say(f'从 {a.resume_from} 开始（调试）')
            else:
                page.goto(url + 'index.html', wait_until='domcontentloaded')
                page.wait_for_function('window.RLP && RLP.ready', timeout=120000)
                g.install()
            for ph in phases:
                ph(g)
            report['ok'] = g.ev('!!RLP.state.flag("plague4_complete")')
            report['achievements'] = g.ev('RLP.state.achievements')
        except Exception as e:  # noqa: BLE001
            failed = e
            traceback.print_exc()
            report['error'] = str(e)
            try:
                g.snapshot('exception')
            except Exception:  # noqa: BLE001
                pass
        report['page_errors'] = g.errors
        report['elapsed'] = round(time.time() - g.t0, 1)
        if rec:
            out = Path(a.out) if a.out else OUT_DIR / ('plague4-demo.mp4' if not failed else 'plague4-demo-partial.mp4')
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
