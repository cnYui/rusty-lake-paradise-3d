"""第四灾美术截图：把章节摆到指定状态，逐视图截图，对照参考帧核对模型。

用法（项目根目录）：
  python dev/plague4/art_shots.py                 # 全部
  python dev/plague4/art_shots.py crab fly        # 只拍名字里含 crab / fly 的
截图写到 dev/plague4/media/art/（本地，不入库）。
"""
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'common'))
from shot import serve  # noqa: E402

OUT = Path(__file__).resolve().parent / 'media' / 'art'
OUT.mkdir(parents=True, exist_ok=True)

BRANCHES = {'p4_branch_0': True, 'p4_branch_1': True, 'p4_branch_2': True}
# (名字, 视图, 要设置的 flags, 额外 JS)
SHOTS = [
    ('cocoon_closed', 'cocoon', {}, ''),
    ('cocoon_open', 'cocoon', {'p4_fly_awake': True}, ''),
    ('fly_clearing', 'forest_clearing', {'p4_fly_awake': True}, ''),
    ('fly_hover', 'forest_clearing', {'p4_fly_awake': True, 'p4_crab_eaten': True}, "const w = RLP.ctx.p4.world; w.fly.position.set(-5.2, 0.8, 17.6); w.fly.rotation.y = -0.2; w.fly.setKneel(0);"),
    ('fly_kneel', 'forest_clearing', {'p4_fly_awake': True, 'p4_crab_eaten': True}, "const w = RLP.ctx.p4.world; w.fly.position.set(-5.2, 0.5, 17.6); w.fly.rotation.y = -0.2; w.fly.setKneel(1);"),
    ('crab_r0', 'crab_board', {'p4_crab_round': 0}, ''),
    ('crab_r1', 'crab_board', {'p4_crab_round': 1}, ''),
    ('crab_r2', 'crab_board', {'p4_crab_round': 2}, ''),
    ('crab_feast', 'crab_feast', {'p4_crab_round': 3, 'p4_fly_awake': True}, ''),
    ('crab_eaten', 'crab_feast', {'p4_crab_round': 3, 'p4_fly_awake': True, 'p4_crab_eaten': True}, ''),
    ('pit_planks', 'pit', {}, ''),
    ('pit_open', 'pit', BRANCHES, ''),
    ('rabbit_hole', 'rabbit', {'p4_rabbit_lured': True}, ''),
    ('rabbit_dead', 'rabbit', {'p4_rabbit_lured': True, 'p4_fly_awake': True, 'p4_crab_eaten': True, 'p4_rabbit_eaten': True}, ''),
    ('trap_bare', 'trap', {}, ''),
    ('trap_set', 'trap', {'p4_trap_propped': True, 'p4_trap_baited': True}, ''),
    ('trap_dead', 'trap', {'p4_trap_propped': True, 'p4_trap_baited': True, 'p4_fly_awake': True, 'p4_bird_eaten': True}, ''),
    ('owl', 'owl', {'p4_owl_count': 3}, ''),
    ('kitchen', 'house_int', {}, ''),
    ('stone_door', 'temple_door', {}, ''),
    ('temple', 'temple_int', {}, ''),
    ('window', 'window', {}, ''),
    ('window_set', 'window', {'p4_window': [1, 3, 8, 10]}, "const w = RLP.ctx.p4.world.window; w.setState([1, 3, 8, 10], false, 2);"),
    ('window_open', 'window', {'p4_window': [1, 3, 8, 10], 'p4_window_open': True}, ''),
    ('book_closed', 'book', {}, ''),
    ('book_0', 'book', {}, "const b = RLP.ctx.p4.world.book; b.setOpen(true); b.setSpread(0);"),
    ('book_1', 'book', {}, "const b = RLP.ctx.p4.world.book; b.setOpen(true); b.setSpread(1);"),
    ('book_2', 'book', {}, "const b = RLP.ctx.p4.world.book; b.setOpen(true); b.setSpread(2);"),
    ('book_flip', 'book', {}, "const b = RLP.ctx.p4.world.book; b.setOpen(true); b.setSpread(0); await b.flipTo(2); return b.spread()"),
    ('book_3', 'book', {}, "const b = RLP.ctx.p4.world.book; b.setOpen(true); b.setSpread(3);"),
    ('inventory', 'house_clearing', {}, "for (const id of ['candle','carrot','crab_heart','rabbit_heart','bird_heart','gem']) RLP.state.give(id);"),
    ('altar', 'altar', {'p4_cube_taken': True}, ''),
    ('memory', 'memory', {}, ''),
]


def main(filters):
    server, port = serve()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
            page = browser.new_page(viewport={'width': 1280, 'height': 720})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
            page.goto(f'http://127.0.0.1:{port}/index.html?autotest=1&chapter=4', wait_until='domcontentloaded', timeout=90000)
            page.wait_for_function('window.RLP && RLP.ready', timeout=90000)
            assert not page.evaluate('RLP.bootError'), page.evaluate('RLP.bootError')
            page.evaluate('async () => { RLP.timeScale = 25; await RLP.start(4, {skipIntro: true, fresh: true}); }')
            for name, view, flags, js in SHOTS:
                if filters and not any(f in name for f in filters):
                    continue
                try:
                    res = page.evaluate('''async ([view, flags, js]) => {
                      const c = RLP.ctx, s = RLP.state;
                      for (const k of Object.keys(s.flags)) if (k.startsWith('p4_')) s.flags[k] = undefined;
                      for (const [k, v] of Object.entries(flags)) c.setFlag(k, v);
                      RLP.chapter.sync(c);
                      if (!c.views.ids().includes(view)) throw new Error('没有视图 ' + view);
                      await RLP.goto(view, {instant: true});
                      let out = null; if (js) out = await new (Object.getPrototypeOf(async function () {}).constructor)('RLP', js)(RLP);
                      await c.ui.fade(0, 0); c.ui.clearSay(); c.engine.render();
                      return out;
                    }''', [view, flags, js])
                    if res is not None: print('  ->', res)
                    time.sleep(0.25)
                    page.evaluate('RLP.ctx.engine.render()')
                    page.screenshot(path=str(OUT / f'{name}.png'))
                    print('saved', name)
                except Exception as e:  # noqa: BLE001
                    print('FAILED', name, str(e)[:200])
            browser.close()
        if errors:
            print('页面错误：')
            for e in errors[:15]:
                print('  ', e[:300])
    finally:
        server.shutdown()


if __name__ == '__main__':
    main(sys.argv[1:])
