r"""提示（233 乐园版）浏览器验收：

  1. 第一到第五灾各自动通关一遍，每走完一步取一次 RLP.hints.next()：
     没通关前必须有“可做的任务”（不能出现 stuck / none），通关后所有任务 done、状态是 complete
  2. 灯泡按钮：不带 ?leyuan=1 不显示；带了显示
  3. 灯泡流程（用本机测试的模拟广告）：点灯泡 → 确认框 → 观看 → 选“完整观看” → 面板显示此刻那一条提示；
     关闭 / 跳过 / 失败都不给提示；取消不放广告；通关后点灯泡不放广告；广告可以一直看（再点一次又显示一条）

用法：python dev/common/test_hints_browser.py [章节号 ...]（默认五章全跑）
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


STEPWISE = """async () => {
  RLP.timeScale = 1000;
  RLP.ctx.ui.autoAdvance = false;
  const steps = RLP.chapter.walkthrough;
  const empty = [], seen = [];
  const first = RLP.hints.next();
  for (let i = 0; i < steps.length; i++) {
    const r = await RLP.autoplay({ stepDelay: 0, fast: true, stepTimeout: 30000, steps: [steps[i]] });
    if (!r.ok) return { ok: false, failedAt: i, step: JSON.stringify(steps[i]) };
    const h = RLP.hints.next();
    if (h.status === 'task') { if (!seen.includes(h.id)) seen.push(h.id); }
    else if (h.status !== 'complete') empty.push({ i, step: JSON.stringify(steps[i]), status: h.status });
  }
  const tasks = RLP.hints.tasks();
  return { ok: true, total: steps.length, first, last: RLP.hints.next(), empty, seen,
           open: tasks.filter((t) => !t.done).map((t) => t.id), count: tasks.length };
}"""


def run_chapter(ctx, base, n):
    page = new_page(ctx)
    page.goto(base + f'index.html?chapter={n}&skipIntro=1&norender=1&fresh=1', wait_until='domcontentloaded')
    assert poll(page, f'window.RLP && RLP.ready === true && RLP.state.chapter === "plague{n}" && !!RLP.state.view', 180), f'第{n}灾没有启动'
    assert page.evaluate('RLP.bootError') is None, page.evaluate('RLP.bootError')
    page.evaluate('RLP.idle()')
    r = page.evaluate(STEPWISE)
    check(f'第{n}灾：逐步自动通关，每一步都跑通', r.get('ok'), None if r.get('ok') else r)
    if r.get('ok'):
        check(f'第{n}灾：提示表 {r["count"]} 条，开局第一条是 task', r['first']['status'] == 'task', r['first'])
        check(f'第{n}灾：没通关前每一步都有可做的提示（没有 stuck / none）', not r['empty'], r['empty'][:5])
        check(f'第{n}灾：通关后状态是 complete', r['last']['status'] == 'complete', r['last'])
        check(f'第{n}灾：通关后所有任务都 done（旗标没拼错、没有永远做不完的任务）', not r['open'], r['open'])
        check(f'第{n}灾：自动通关过程中被提示过的任务 {len(r["seen"])} 条', len(r['seen']) >= 3, r['seen'])
    page.close()


def run_ui(ctx, base):
    # 不带 ?leyuan=1：灯泡不显示
    page = new_page(ctx)
    page.goto(base + 'index.html?chapter=1&view=beach_mid&fresh=1&norender=1', wait_until='domcontentloaded')
    assert poll(page, 'window.RLP && RLP.ready === true && document.getElementById("stage").classList.contains("inv-on")', 180)
    check('网页版（没有 ?leyuan=1）：灯泡按钮不显示', page.evaluate('getComputedStyle(document.querySelector(".hint-btn")).display') == 'none')
    page.close()

    page = new_page(ctx)
    page.goto(base + 'index.html?chapter=1&view=beach_mid&fresh=1&norender=1&leyuan=1', wait_until='domcontentloaded')
    assert poll(page, 'window.RLP && RLP.ready === true && document.getElementById("stage").classList.contains("inv-on")', 180)
    time.sleep(1.2)
    page.evaluate('RLP.idle()')
    check('233 乐园版（?leyuan=1）：灯泡按钮显示', page.evaluate('getComputedStyle(document.querySelector(".hint-btn")).display') != 'none')

    def panel():
        return page.evaluate("""() => { const m = document.querySelector('.modal.show'); return m ? { title: (m.querySelector('h2')||{}).textContent, text: [...m.querySelectorAll('p')].map(p => p.textContent), btns: [...m.querySelectorAll('.btn')].map(b => b.textContent) } : null; }""")

    def click_btn(label):
        page.evaluate("(l) => [...document.querySelectorAll('.modal.show .btn')].find(b => b.textContent === l).click()", label)
        time.sleep(0.15)

    want = page.evaluate('RLP.hints.next()')
    # 取消：不放广告
    page.click('.hint-btn')
    time.sleep(0.2)
    p = panel()
    check('点灯泡：先弹确认框，说明要看广告，有“取消”和“观看广告”', p and p['btns'] == ['取消', '观看广告'] and '广告' in ''.join(p['text']), p)
    click_btn('取消')
    check('取消：对话框关闭，没有放广告', panel() is None)

    # 模拟广告：中途关闭 / 跳过 / 失败 都不给提示
    for pick, key in (('中途关闭', 'closed'), ('跳过广告', 'skipped'), ('播放失败', 'failed')):
        page.click('.hint-btn'); time.sleep(0.2)
        click_btn('观看广告'); time.sleep(0.3)
        p = panel()
        check(f'模拟广告选项出现（{pick}）', p and pick in p['btns'], p)
        click_btn(pick); time.sleep(0.3)
        p = panel()
        check(f'广告“{key}”：不给提示，只说没有获得提示 / 暂时不可用', p and want['text'] not in ''.join(p['text']) and p['btns'] == ['知道了'], p)
        click_btn('知道了')

    # 完整观看：显示此刻那一条提示；广告可以一直看
    for k in range(2):
        page.click('.hint-btn'); time.sleep(0.2)
        click_btn('观看广告'); time.sleep(0.3)
        click_btn('完整观看'); time.sleep(0.3)
        p = panel()
        check(f'完整观看（第 {k + 1} 次）：面板显示当前提示', p and p['text'] == [want['text']], {'got': p, 'want': want['text']})
        click_btn('知道了')
        check('关闭后可以继续玩（没有残留浮层）', panel() is None and not page.evaluate('RLP.ctx.ui.modalOpen'))

    # Esc 在确认框 = 取消
    page.click('.hint-btn'); time.sleep(0.2)
    page.keyboard.press('Escape'); time.sleep(0.2)
    check('确认框里按 Esc = 取消', panel() is None)

    # 通关后：不放广告，直接说已通关
    page.evaluate("RLP.state.setFlag('plague1_complete')")
    page.click('.hint-btn'); time.sleep(0.3)
    p = panel()
    check('通关后点灯泡：不放广告，直接说已通关', p and p['text'] == ['这一章已经通关了。'] and p['btns'] == ['知道了'], p)
    click_btn('知道了')
    page.close()


def main():
    want = [int(a) for a in sys.argv[1:]] or [1, 2, 3, 4, 5, 6, 7]
    httpd, port = serve()
    base = f'http://127.0.0.1:{port}/'
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
        ctx = browser.new_context(viewport={'width': 1280, 'height': 720})
        run_ui(ctx, base)
        for n in want:
            run_chapter(ctx, base, n)
        browser.close()
    httpd.shutdown()
    bad = [e for e in errors if 'toNonIndexed' not in e and 'flatShading' not in e]
    check('全程没有页面错误 / 控制台错误', not bad, bad[:6])
    print(f'\n{sum(results)}/{len(results)} 通过')
    sys.exit(0 if all(results) else 1)


if __name__ == '__main__':
    main()
