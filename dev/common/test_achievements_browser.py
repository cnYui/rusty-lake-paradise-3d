r"""成就验收：每一章成就表里的成就都能在正常流程里拿到、存进本机，重载后成就面板里仍然全部点亮。

  1. 同一个浏览器上下文（共用 localStorage）里按顺序自动通关第一、二、三灾：
     每章结束时，章节成就表里的每一个成就都在 state.achievements（章节存档）和玩家档案的成就历史里
  2. 重新打开首页（不带测试参数，不清档）：成就面板每章都是“满 / 满”，每一条都有解锁日期
  3. 第一灾的三个以前没有发放点的成就（欢迎来到天堂岛 / 这是我 / 第一个符号）：
     真实鼠标点出来；旧存档补发（旗标已立、成就缺）静默补上，不弹提示

用法：python dev/common/test_achievements_browser.py
"""
import json, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from shot import serve

results = []
errors = []


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


def new_page(ctx):
    page = ctx.new_page()
    page.set_default_timeout(300000)
    page.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
    page.on('console', lambda m: errors.append(f'[console.error] {m.text}') if m.type == 'error' else None)
    return page


def main():
    httpd, port = serve()
    base = f'http://127.0.0.1:{port}/'
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
        ctx = browser.new_context(viewport={'width': 1280, 'height': 720})
        want = {}

        # ---------------------------------------------------------------- 1. 三章依次自动通关
        for n in (1, 2, 3):
            page = new_page(ctx)
            # 开发跳转：?chapter=N&skipIntro=1 自己开始这一章（不清档，localStorage 在三章之间累积）；等它开始完再自动通关，不能再调一次 RLP.start（片头会抢视图）
            page.goto(base + f'index.html?chapter={n}&skipIntro=1&norender=1', wait_until='domcontentloaded')
            assert poll(page, f'window.RLP && RLP.ready === true && RLP.state.chapter === "plague{n}" && !!RLP.state.view', 180), f'第{n}灾没有启动'
            assert page.evaluate('RLP.bootError') is None, page.evaluate('RLP.bootError')
            page.evaluate('RLP.idle()')
            r = page.evaluate("""async (n) => {
              RLP.timeScale = 1000;
              RLP.ctx.ui.autoAdvance = false;
              const r = await RLP.autoplay({ stepDelay: 0, fast: true, stepTimeout: 30000 });
              await new Promise((res) => setTimeout(res, 900));       // 自动存档 500 ms 合并
              RLP.state.save();
              const ch = RLP.chapter.id;
              const prof = JSON.parse(localStorage.getItem('rlp3d.profile') || 'null') || { ach: {}, cleared: {} };
              const sv = JSON.parse(localStorage.getItem('rlp3d.save.' + ch) || 'null') || {};
              return { ok: r.ok, steps: r.steps, total: r.total, failed: r.failedStep, ch, got: [...RLP.state.achievements],
                       saved: sv.achievements || [], hist: Object.keys(prof.ach), cleared: Object.keys(prof.cleared) };
            }""", n)
            ids = page.evaluate("""async (n) => (await import('./src/chapters/index.js')).CHAPTERS.find((c) => c.number === n).achievements""", n)
            want[n] = sorted(ids.keys())
            check(f'第{n}灾 autoplay 通关（{r["steps"]}/{r["total"]}）', r['ok'] and r['steps'] == r['total'], r)
            check(f'第{n}灾：成就表 {len(want[n])} 个全部拿到', sorted(r['got']) == want[n], {'want': want[n], 'got': sorted(r['got'])})
            check(f'第{n}灾：章节存档里有全部成就', sorted(r['saved']) == want[n], r['saved'])
            check(f'第{n}灾：玩家档案的成就历史里有全部成就，通关记录写进去了',
                  set(want[n]) <= set(r['hist']) and r['ch'] in r['cleared'], {'hist': r['hist'], 'cleared': r['cleared']})
            page.close()

        # ---------------------------------------------------------------- 2. 重新打开首页：成就面板满格
        page = new_page(ctx)
        page.goto(base + 'index.html?norender=1', wait_until='domcontentloaded')
        assert poll(page, 'window.RLP && RLP.ready === true && !!document.querySelector(".menu.show")', 180)
        time.sleep(0.9)
        page.click('.menu-link:nth-child(2)')
        poll(page, "!!document.querySelector('.menu-panel h2')", 10)
        g = page.evaluate("""() => [...document.querySelectorAll('.ach-head')].map(h => {
          const list = h.nextElementSibling;
          return [h.children[0].textContent, h.children[1].textContent, list.querySelectorAll('.ach.got').length, list.querySelectorAll('.ach-date').length, list.querySelectorAll('.ach').length];
        })""")
        exp = [['第一灾 · x灾　已通关', '5 / 5', 5, 5, 5], ['第二灾 · 蛙灾　已通关', '3 / 3', 3, 3, 3], ['第三灾 · 蚊灾和虱灾　已通关', '5 / 5', 5, 5, 5]]
        check('重载后成就面板：第一灾 5/5、第二灾 3/3、第三灾 5/5，全部点亮且带解锁日期', g[:3] == exp, g)
        page.close()

        # ---------------------------------------------------------------- 3. 第一灾缺失发放点：真实鼠标 + 旧存档补发
        page = new_page(ctx)
        page.goto(base + 'index.html?autotest=1', wait_until='domcontentloaded')
        assert poll(page, 'window.RLP && RLP.ready === true', 180)
        flags = 'coffin_risen,' + ','.join(f'nail_{i}' for i in range(1, 7)) + ',lid_open,cube_taken'
        page.evaluate("async (f) => { await RLP.start(1, { fresh: true, skipIntro: true, view: 'coffin', flags: f, give: 'black_cube' }); await RLP.idle(); }", flags)
        time.sleep(1.5)
        pos = page.evaluate("""() => { const c = RLP.ctx, T = c.THREE; c.world.root.updateMatrixWorld(true);
          const v = new T.Vector3(); c.hotspots.get('coffin_symbol').object.getWorldPosition(v);
          const s = c.views.project([v.x, v.y, v.z]); const r = document.getElementById('game').getBoundingClientRect();
          return { x: r.left + s.x * r.width, y: r.top + s.y * r.height }; }""")
        page.mouse.click(pos['x'], pos['y'])
        time.sleep(1.2)
        check('第一个符号：真实鼠标点棺材里的符号，拿到成就并留在棺材特写（没有被当成点棺材跳进回忆）',
              page.evaluate("RLP.state.achievements.includes('the_first_symbol') && RLP.state.view === 'coffin' && RLP.state.flag('first_symbol_seen') === true"))
        check('第一个符号：点过之后热点关闭，再点棺材才进回忆', not page.evaluate("RLP.ctx.hotspots.enabled('coffin_symbol')"))

        # 旧存档补发：旗标已立（门开了、倒影看过），成就缺 → 读档时静默补上，不弹提示（成就提示画在画布上，数 ui.toast 的调用次数）
        page.evaluate("() => { window.__toasts = 0; const ui = RLP.ctx.ui, o = ui.toast.bind(ui); ui.toast = (...a) => { window.__toasts++; return o(...a); }; }")
        page.evaluate("""async () => { await RLP.start(1, { fresh: true, skipIntro: true, view: 'beach_mid', flags: 'gate_unlocked,reflection_seen' }); await RLP.idle(); }""")
        time.sleep(0.8)
        got = page.evaluate("[...RLP.state.achievements].sort()")
        check('旧存档补发：门开了 / 倒影看过的存档读档后补上“欢迎来到天堂岛”和“这是我”', got == ['its_me', 'welcome_to_paradise'], got)
        check('旧存档补发是静默的：没有成就提示弹出', page.evaluate('window.__toasts') == 0)
        page.close()
        browser.close()
    httpd.shutdown()

    bad = [e for e in errors if 'toNonIndexed' not in e and 'flatShading' not in e]
    check('全程没有页面错误 / 控制台错误', not bad, bad[:6])
    print(f'\n{sum(results)}/{len(results)} 通过')
    sys.exit(0 if all(results) else 1)


if __name__ == '__main__':
    main()
