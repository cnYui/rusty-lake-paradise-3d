"""第三灾验收：自动通关、美术常量核对、中途存档 / 读档双向恢复、白桦林入口门禁、漫游碰撞、从标题菜单进入。
真实鼠标 / 数字键走完整个流程用 dev/plague3/record_plague3_demo.py --fast（同一套输入，另外还能录像）。

用法：python dev/plague3/test_plague3_browser.py
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'common'))
from shot import serve  # noqa: E402

OUT = Path(__file__).resolve().parent / 'media' / 'verification'
OUT.mkdir(parents=True, exist_ok=True)
FAILS = []


def check(name, ok, info=''):
    print(('通过 ' if ok else '失败 ') + name + (f'：{info}' if info and not ok else ''), flush=True)
    if not ok:
        FAILS.append(name)


def boot(page, base, url='index.html?autotest=1&chapter=3&norender=1'):
    page.set_default_timeout(120000)
    page.goto(base + url, wait_until='domcontentloaded')
    page.wait_for_function('window.RLP && RLP.ready')
    err = page.evaluate('RLP.bootError')
    assert not err, err


def settle(page):
    page.wait_for_function('!RLP.ctx.hotspots.busy && !RLP.ctx.views.transitioning && !RLP.ctx.ui.locked')
    page.evaluate('async () => { RLP.ctx.views.dropPointer(); await RLP.idle(); }')


def run_steps(page, steps):
    return page.evaluate("""async steps => {
      RLP.timeScale = 1000;
      const r = await RLP.autoplay({ steps, stepDelay: 0, fast: true, stepTimeout: 30000 });
      return { ok: r.ok, steps: r.steps, total: r.total, failed: r.failedStep, error: r.error };
    }""", steps)


def test_autoplay(page):
    page.evaluate('async () => { await RLP.start(3, { fresh: true, skipIntro: true }); RLP.timeScale = 1000; }')
    r = page.evaluate("""async () => {
      const r = await RLP.autoplay({ stepDelay: 0, fast: true, stepTimeout: 30000 });
      return { ok: r.ok, steps: r.steps, total: r.total, failed: r.failedStep, error: r.error, flags: r.flags, ach: r.achievements, maxInv: Math.max(...r.log.map((e) => e.inv.length)) };
    }""")
    check('autoplay 全部步骤通过', r['ok'] and r['steps'] == r['total'], json.dumps(r, ensure_ascii=False)[:300])
    check('通关旗标 plague3_complete', bool(r['flags'].get('plague3_complete')))
    check('物品栏最多同时持有不超过 12 件', r['maxInv'] <= 12, str(r['maxInv']))
    print('  最多同时持有', r['maxInv'], '件；成就', r['ach'], flush=True)
    check('控制台没有报错', not page.evaluate('RLP.errors').__len__(), str(page.evaluate('RLP.errors')))
    return r


def test_art_constants(page):
    r = page.evaluate('({ art: RLP.ctx.p3.checkArt(), rules: RLP.ctx.p3.puzzles.selfTest() })')
    check('美术常量和 puzzles.js 一致（滑块 / 蜂孔 / 陶轮）', r['art']['ok'], json.dumps(r['art'], ensure_ascii=False))
    check('puzzles.selfTest', r['rules']['ok'])


def test_checkpoints(page):
    """在主线中途存档，新游戏后读档，连续 sync 两次：旗标、物品栏和各道具 / 人物的状态必须原样回来；再回到起点（新游戏）也要恢复干净。"""
    full = page.evaluate('RLP.chapter.walkthrough')
    for cp in checkpoints_by_clicks(full):
        run_checkpoint(page, full, cp)


def checkpoints_by_clicks(full):
    """按设计文档的几处中途状态选步骤：蜂巢 3 个孔、滑块 10 步、剪两刀、陶轮造型一半、桌上两样、神龛一朵花。"""
    def at(pred, extra=0):
        return next(i for i, s in enumerate(full) if pred(s)) + 1 + extra
    return [
        ('蜂巢走到一半', at(lambda s: s.get('click') == 'p3_hive_hole_0', 2)),
        ('滑块走到一半', at(lambda s: s.get('click') == 'p3_cell_19', 9)),
        ('只剪了两刀', at(lambda s: s.get('click') == 'p3_gerard_hair', 1)),
        ('陶轮造型做到一半', at(lambda s: s.get('click', '').startswith('p3_pot_seg_'), 3)),
        ('桌上放了浆果和树汁', at(lambda s: s.get('on') == 'p3_table_cup')),
        ('神龛插了黄花', at(lambda s: s.get('on') == 'p3_shrine_slot_0')),
        ('黑方块放进吊架之后', at(lambda s: s.get('use') == 'black_cube') - 1),
    ]


def snapshot_state(page):
    return page.evaluate("""() => {
      const w = RLP.ctx.p3.world;
      const s = (o) => (o && o.getState ? o.getState() : null);
      return { flags: RLP.state.flags, inv: RLP.state.inventory,
        states: { mussel: s(w.mussel), dig: s(w.digX), box: s(w.box), flytrap: s(w.flytrap), tree: s(w.xTree), mound: s(w.mound), hive: s(w.hive),
          gerard: s(w.gerard), ida: s(w.ida), jar: s(w.bellJar), wheel: s(w.wheel), margaret: s(w.margaret), stump: s(w.stump),
          table: s(w.table), david: s(w.david), larva: s(w.larva), shrine: s(w.shrine), birch: s(w.birch), bush: s(w.bush), painting: s(w.painting) } };
    }""")


def run_checkpoint(page, full, cp):
    name, n = cp
    page.evaluate('async () => { await RLP.start(3, { fresh: true, skipIntro: true }); RLP.timeScale = 1000; }')
    r = run_steps(page, full[:n])
    if not r['ok']:
        check(f'检查点「{name}」能走到', False, json.dumps(r, ensure_ascii=False))
        return
    settle(page)
    page.evaluate('RLP.state.save()')
    before = snapshot_state(page)
    raw = page.evaluate('localStorage.getItem("rlp3d.save.plague3")')
    page.evaluate('async () => await RLP.start(3, { fresh: true, skipIntro: true })')
    fresh = snapshot_state(page)
    page.evaluate("""async raw => {
      localStorage.setItem('rlp3d.save.plague3', raw);
      await RLP.start(3, { fresh: false, skipIntro: true });
      RLP.chapter.sync(RLP.ctx); RLP.chapter.sync(RLP.ctx);
    }""", raw)
    after = snapshot_state(page)
    check(f'读档「{name}」：旗标、物品栏一致', after['flags'] == before['flags'] and after['inv'] == before['inv'])
    diff = {k: (before['states'][k], after['states'][k]) for k in before['states'] if before['states'][k] != after['states'][k]}
    check(f'读档「{name}」：道具 / 人物状态一致', not diff, json.dumps(diff, ensure_ascii=False)[:400])
    # 回到新游戏（读档的反方向）：状态要回到起点
    page.evaluate("""async () => { await RLP.start(3, { fresh: true, skipIntro: true }); RLP.chapter.sync(RLP.ctx); }""")
    again = snapshot_state(page)
    diff2 = {k: (fresh['states'][k], again['states'][k]) for k in fresh['states'] if fresh['states'][k] != again['states'][k]}
    check(f'新游戏「{name}」之后：状态回到起点', not diff2, json.dumps(diff2, ensure_ascii=False)[:400])


def test_grove_gate_and_roam(page):
    page.evaluate('async () => { await RLP.start(3, { fresh: true, skipIntro: true, view: "forest_clearing" }); }')
    settle(page)
    check('树没倒：白桦林入口热点不可点', not page.evaluate('RLP.ctx.hotspots.enabled("p3_grove_entry")'))
    check('树没倒：红叉树有碰撞，走不过去', not page.evaluate('RLP.ctx.views.canStand(...RLP.ctx.p3.spots.xTree.pos.filter((_, i) => i !== 1))'))
    page.evaluate('async () => { await RLP.start(3, { fresh: true, skipIntro: true, view: "forest_clearing", flags: "p3_xtree_felled" }); }')
    settle(page)
    check('树倒了：入口热点可点', page.evaluate('RLP.ctx.hotspots.enabled("p3_grove_entry")'))
    check('树倒了：树桩的碰撞拿掉', page.evaluate('RLP.ctx.views.canStand(...RLP.ctx.p3.spots.xTree.pos.filter((_, i) => i !== 1))'))
    # 白桦林：出生点能站，圆桌 / 神龛 / 岩壁外站不了
    page.evaluate('async () => { await RLP.start(3, { fresh: true, skipIntro: true, view: "p3_grove" }); }')
    settle(page)
    r = page.evaluate("""() => {
      const v = RLP.ctx.views, o = [600, 0, 0], at = (x, z) => v.canStand(o[0] + x, o[2] + z);
      return { entry: at(0, 6.4), table: at(-0.9, 1.8), shrine: at(0.7, -1.0), wall: at(0, -4), free: v.freeMode };
    }""")
    check('白桦林：入口可站、圆桌 / 神龛 / 岩壁外不可站', r['entry'] and not r['table'] and not r['shrine'] and not r['wall'], json.dumps(r))
    check('白桦林是漫游视图', r['free'])
    # 石屋：门口可站，Gerard 的凳子、小桌、陶轮不能穿
    page.evaluate('async () => { await RLP.start(3, { fresh: true, skipIntro: true, view: "house_int" }); }')
    settle(page)
    r = page.evaluate("""() => {
      const v = RLP.ctx.views, at = (x, z) => v.canStand(x, z);
      return { door: at(300, 2.3), gerard: at(298.6, -0.9), table: at(300, -1.25), wheel: at(301.3, -1.1), free: v.freeMode };
    }""")
    check('石屋：门口可站、家具不可穿', r['door'] and not r['gerard'] and not r['table'] and not r['wheel'], json.dumps(r))
    check('石屋是漫游视图', r['free'])


def test_menu(page, base):
    """从无参数首页进入（?wip=1 才会开放开发中的第三灾）：菜单里能点第三灾，启动后 RLP.bootError 为空。"""
    page.goto(base + 'index.html?wip=1', wait_until='domcontentloaded')
    page.wait_for_function('window.RLP && RLP.ready')
    check('首页启动没有 bootError', not page.evaluate('RLP.bootError'))
    page.wait_for_selector('.plague')
    names = page.evaluate("[...document.querySelectorAll('.plague')].map((e) => ({ cls: e.className, text: e.textContent.replace(/\\s+/g, ' ').trim() }))")
    third = names[2]
    check('菜单第三张卡是蚊灾和虱灾且可点', '蚊灾和虱灾' in third['text'] and 'open' in third['cls'], json.dumps(third, ensure_ascii=False))
    page.locator('.plague').nth(2).click()
    page.wait_for_function('window.RLP && RLP.ready && RLP.chapter && RLP.chapter.number === 3 && RLP.state.view', timeout=120000)
    check('点第三灾后装载的是第三灾，bootError 为空', page.evaluate('RLP.chapter.id') == 'plague3' and not page.evaluate('RLP.bootError'))


def main():
    httpd, port = serve()
    base = f'http://127.0.0.1:{port}/'
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        page = browser.new_page(viewport={'width': 1280, 'height': 720})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        boot(page, base)
        test_art_constants(page)
        test_autoplay(page)
        test_grove_gate_and_roam(page)
        test_checkpoints(page)
        page2 = browser.new_page(viewport={'width': 1280, 'height': 720})
        page2.on('pageerror', lambda e: errors.append(str(e)))
        test_menu(page2, base)
        check('页面没有未捕获的错误', not errors, '; '.join(errors[:3]))
        browser.close()
    httpd.shutdown()
    print('\n失败 %d 项：%s' % (len(FAILS), FAILS) if FAILS else '\n全部通过', flush=True)
    sys.exit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
