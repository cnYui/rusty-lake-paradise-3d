r"""进度与存档验收：成就历史、本机存档、一章通关后自动进入下一章、主菜单的章节门禁。

  A. 同一个浏览器里的完整一轮（真实点击 + 重载）：空档首页 → 第二灾上锁 → 成就写进历史 → 重载后“继续” →
     RLP.autoplay() 通关第一灾 → 结尾卡出现“进入第二灾” → 返回主菜单后第二灾解锁、启动直接装载第二灾 → 继续第二灾 → 重置进度
  B. 通关结尾上真实点“进入第二灾”（桌面鼠标）→ 页面重载并开始第二灾
  C. 倒数自动进入：不点任何东西，倒数完自己进入第二灾
  D. 倒数期间点“返回主菜单”：取消自动进入
  E. 旧版数据迁移、本地存储不可用、?unlock=1、测试页（?autotest=1）每次从空白开始
  F. 触屏：点锁着的章节卡、点结尾卡上的“进入第二灾”
  G. 第三灾的解锁顺序：没通关第一灾、只通关第一灾、只有第二灾的通关记录（不合常理的残档）都进不去；
     第一、二灾都通关后才开放；通关第二灾的结尾卡才出现“进入第三灾”并自动进入

用法：python dev/common/test_progress_browser.py
"""
import json, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from shot import serve

OUT = Path(__file__).resolve().parent / 'media' / 'progress'
OUT.mkdir(parents=True, exist_ok=True)
results = []


def check(name, ok, detail=None):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + json.dumps(detail, ensure_ascii=False) if detail is not None else ''), flush=True)


def poll(page, expr, timeout=60, interval=0.25):
    """反复求值直到为真；页面正在重载时求值会抛错，当作“还没好”。"""
    end = time.time() + timeout
    while time.time() < end:
        try:
            if page.evaluate(expr):
                return True
        except Exception:
            pass
        time.sleep(interval)
    return False


class Env:
    def __init__(self, p):
        self.httpd, port = serve()
        self.base = f'http://127.0.0.1:{port}/'
        self.browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
        self.errors = []

    def new_page(self, w=1280, h=720, touch=False, init=None):
        ctx = self.browser.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch)
        if init:
            ctx.add_init_script(init)
        page = ctx.new_page()
        page.set_default_timeout(300000)
        page.on('pageerror', lambda e: self.errors.append(f'[pageerror] {e}'))
        page.on('console', lambda m: self.errors.append(f'[console.error] {m.text}') if m.type == 'error' else None)
        return ctx, page

    def open(self, page, url='index.html?norender=1', menu=True):
        page.goto(self.base + url, wait_until='domcontentloaded')
        return self.wait_ready(page, menu)

    def wait_ready(self, page, menu=True):
        ok = poll(page, 'window.RLP && RLP.ready === true', 180)
        err = page.evaluate('RLP.bootError') if ok else 'RLP 没有出现'
        if ok and menu:
            ok = poll(page, "!!document.querySelector('.menu.show')", 30)
            time.sleep(0.9)   # .menu 的透明度过渡（0.7 s）结束后再点，坐标才稳定
        return ok and not err


def cards(page):
    return page.evaluate("[...document.querySelectorAll('.plague')].slice(0, 5).map(c => ({cls: c.className.replace('plague ', ''), zh: c.querySelector('.zh').textContent}))")


def status(page):
    return page.evaluate("document.querySelector('.menu-status') ? document.querySelector('.menu-status').textContent : null")


def profile(page):
    return page.evaluate("JSON.parse(localStorage.getItem('rlp3d.profile') || 'null')")


def save(page, chapter):
    return page.evaluate("id => JSON.parse(localStorage.getItem('rlp3d.save.' + id) || 'null')", chapter)


def ach_groups(page):
    """成就面板里每个分组：[标题, 计数, 已解锁数量, 带日期的条目数]"""
    return page.evaluate("""() => [...document.querySelectorAll('.ach-head')].map(h => {
      const list = h.nextElementSibling;
      return [h.children[0].textContent, h.children[1].textContent, list.querySelectorAll('.ach.got').length, list.querySelectorAll('.ach-date').length];
    })""")


def open_panel(page, n):
    page.click(f'.menu-link:nth-child({n})')
    poll(page, "!!document.querySelector('.menu-panel h2')", 10)


def close_panel(page):
    page.click('.menu-panel .panel-x')
    poll(page, "!document.querySelector('.menu-panel')", 10)


def start_ch1(page):
    """进入第一灾（跳过片头）；菜单页和已经装载第一灾的页面都行。"""
    page.evaluate("async () => { await RLP.start(1, { skipIntro: true }); }")
    poll(page, 'RLP.state.chapter === "plague1" && !RLP.ctx.ui.menu.visible', 30)


def wait_ending_buttons(page, timeout=60):
    return poll(page, "!!document.querySelector('.ending.show .ending-btn') && getComputedStyle(document.querySelector('.ending.show .ending-btn')).opacity === '1'", timeout)


def clear_ch1_and_ending(page, auto, time_scale=1):
    """第一灾通关旗标一立就该记进通关记录（走 main.js 的 watchClear）；再弹出真实的结尾卡。"""
    page.evaluate("""([auto, ts]) => {
      RLP.timeScale = ts;
      RLP.ctx.ui.autoAdvance = auto;
      RLP.ctx.setFlag('plague1_complete');
      window.__ending = RLP.ctx.ui.ending({ zh: '第一灾 · 完', en: 'Plague I — complete' });
    }""", [auto, time_scale])


def main():
    with sync_playwright() as p:
        env = Env(p)
        try:
            run(env)
        finally:
            env.browser.close()
    bad = [e for e in env.errors if 'toNonIndexed' not in e and 'flatShading' not in e]
    check('全程没有页面错误 / 控制台错误', not bad, bad[:6])
    print(f'\n{sum(results)}/{len(results)} 通过')
    sys.exit(0 if all(results) else 1)


def run(env):
    # ================================================================== A
    ctx, page = env.new_page()
    check('A1 空档首页启动，没有启动错误', env.open(page))
    cs = cards(page)
    check('A1 第一灾开放、第二灾和第三灾都“未解锁”（锁住）', cs[0]['cls'] == 'open' and all(c['cls'] == 'locked gated' and c['zh'] == '未解锁' for c in cs[1:3]), cs[:3])
    check('A1 空档没有“继续 / 下一章”提示', status(page) == '', status(page))
    page.click('.plague:nth-child(2)')
    check('A1 真实点锁着的第二灾：留在菜单、提示“通关第一灾后解锁”',
          page.evaluate('RLP.ctx.ui.menu.visible') is True and status(page) == '第二灾 · 蛙灾 —— 通关第一灾后解锁', status(page))
    open_panel(page, 2)
    g = ach_groups(page)
    check('A2 成就面板按章节分组：第一灾 0 / 5，第二灾 0 / 3，第三灾 0 / 5', [x[:2] for x in g][:3] == [['第一灾 · x灾', '0 / 5'], ['第二灾 · 蛙灾', '0 / 3'], ['第三灾 · 蚊灾和虱灾', '0 / 5']], g)
    close_panel(page)

    start_ch1(page)
    page.evaluate("() => { RLP.ctx.achieve('welcome_to_paradise'); RLP.ctx.achieve('save_the_goat'); }")
    check('A3 解锁两个成就后，存档里有它们', poll(page, "(JSON.parse(localStorage.getItem('rlp3d.save.plague1') || 'null') || {}).achievements && JSON.parse(localStorage.getItem('rlp3d.save.plague1')).achievements.length === 2", 10))
    pf = profile(page)
    check('A3 玩家档案里有成就历史（首次解锁时间 + 名字 + 章节）',
          pf and set(pf['ach']) == {'welcome_to_paradise', 'save_the_goat'} and all(v['t'] > 0 and v['zh'] and v['ch'] == 'plague1' for v in pf['ach'].values()), pf)
    sv = save(page, 'plague1')
    check('A3 存档带版本号 2，最近玩的章节是第一灾', sv['v'] == 2 and page.evaluate("localStorage.getItem('rlp3d.last')") == 'plague1', {'v': sv['v']})

    # 状态一变就自动存档：改一个旗标，不等 500 ms 防抖，pagehide 立刻存
    page.evaluate("() => { RLP.ctx.setFlag('probe_flag'); window.dispatchEvent(new Event('pagehide')); }")
    check('A3 pagehide 立即存档（不等防抖）', save(page, 'plague1')['flags'].get('probe_flag') is True)
    time.sleep(0.7)

    page.reload(wait_until='domcontentloaded')
    check('A4 重载后首页启动', env.wait_ready(page))
    check('A4 菜单提示“继续：第一灾 · x灾”', status(page) == '继续：第一灾 · x灾', status(page))
    open_panel(page, 2)
    g = ach_groups(page)
    check('A4 成就历史跨启动保留：第一灾 2 / 5，两个都带解锁日期', g and g[0][1] == '2 / 5' and g[0][2] == 2 and g[0][3] == 2, g)
    page.screenshot(path=str(OUT / 'achievements.png'))
    close_panel(page)
    page.evaluate('window.__m = 1')
    page.click('.menu-play')
    check('A4 真实点 ▶：不重载页面，继续第一灾（旗标和成就从存档恢复）',
          poll(page, 'RLP.state.chapter === "plague1" && !RLP.ctx.ui.menu.visible && RLP.state.flag("probe_flag") === true && RLP.state.achievements.length === 2', 60)
          and page.evaluate('window.__m') == 1)

    # 通关第一灾：完整自动流程。autoAdvance 先关掉，免得结尾倒数完页面自己跳走、拿不到 autoplay 的结果
    r = page.evaluate("""async () => { RLP.ctx.ui.autoAdvance = false; RLP.timeScale = 25; const r = await RLP.autoplay();
      return { ok: r.ok, steps: r.steps, total: r.total, error: r.error }; }""")
    check('A5 RLP.autoplay() 通关第一灾', r['ok'] and r['steps'] == r['total'], r)
    pf = profile(page)
    check('A5 通关记录写进玩家档案', pf and 'plague1' in pf['cleared'] and pf['cleared']['plague1']['t'] > 0, pf and pf['cleared'])
    check('A5 结尾卡：出现“进入第二灾 · 蛙灾”和“返回主菜单”两个按钮',
          wait_ending_buttons(page) and page.evaluate("[...document.querySelectorAll('.ending .ending-btn')].map(b => b.textContent)") == ['进入第二灾 · 蛙灾', '返回主菜单'],
          page.evaluate("[...document.querySelectorAll('.ending .ending-btn')].map(b => b.textContent)"))
    page.screenshot(path=str(OUT / 'ending_next.png'))
    time.sleep(0.8)
    check('A5 通关存档带着通关旗标', save(page, 'plague1')['flags'].get('plague1_complete') is True)

    page.evaluate('window.__m = 1')
    page.click('.ending .ending-btn:last-child')
    check('A6 点“返回主菜单”：页面重载，回到首页', poll(page, "window.RLP && RLP.ready === true && !window.__m && !!document.querySelector('.menu.show')", 180))
    time.sleep(0.9)
    cs = cards(page)
    check('A6 第二灾已解锁（开放），第一灾打了通关勾', cs[1]['cls'] == 'open' and 'done' in cs[0]['cls'] and cs[1]['zh'] == '蛙灾', cs[:2])
    check('A6 菜单提示“下一章：第二灾 · 蛙灾”', status(page) == '下一章：第二灾 · 蛙灾', status(page))
    check('A6 启动直接装载第二灾（▶ 指向它，不用先装第一灾再重载）', page.evaluate('RLP.state.chapter') == 'plague2')
    open_panel(page, 2)
    g = ach_groups(page)
    # 通关途中又解锁了几个成就（autoplay 走完流程会多拿），所以只要求不少于重载前的 2 个
    check('A6 成就面板仍有第一灾的成就，且标题标明“已通关”', g and g[0][0] == '第一灾 · x灾　已通关' and int(g[0][1].split(' / ')[0]) >= 2 and g[0][2] == int(g[0][1].split(' / ')[0]), g)
    close_panel(page)
    page.screenshot(path=str(OUT / 'menu_unlocked.png'))
    page.evaluate('window.__m = 1')
    page.click('.menu-play')
    check('A7 真实点 ▶：不重载页面，直接开始第二灾', poll(page, 'RLP.state.chapter === "plague2" && !RLP.ctx.ui.menu.visible', 60) and page.evaluate('window.__m') == 1)
    page.evaluate("() => { RLP.ctx.achieve('the_first_frog'); }")
    poll(page, "!!(JSON.parse(localStorage.getItem('rlp3d.save.plague2') || 'null') || {}).achievements", 10)
    time.sleep(0.8)
    page.reload(wait_until='domcontentloaded')
    check('A8 第二灾中途重载：启动装载第二灾，菜单提示“继续：第二灾 · 蛙灾”', env.wait_ready(page) and page.evaluate('RLP.state.chapter') == 'plague2' and status(page) == '继续：第二灾 · 蛙灾', status(page))
    page.evaluate("async () => { RLP.ctx.ui.autoAdvance = true; await RLP.start(2, { fresh: false, skipIntro: true }); RLP.timeScale = 25; window.__e = RLP.ctx.ui.ending({ zh: '第二灾 · 完', en: '' }); await window.__e; }")
    check('A8 第二灾结尾卡：后面没有可进入的章节，只有“返回主菜单”', page.evaluate("[...document.querySelectorAll('.ending .ending-btn')].map(b => b.textContent)") == ['返回主菜单'])
    page.evaluate("RLP.ctx.ui.hideEnding()")

    # 重置进度
    page.reload(wait_until='domcontentloaded')
    check('A9 重载回到首页', env.wait_ready(page))
    open_panel(page, 3)
    page.click('.menu-panel .btn.danger')
    page.click('.menu-panel:last-child .btn.danger')
    check('A9 重置进度：菜单重画，第二灾重新上锁、第一灾没有通关勾、提示“进度已重置”',
          poll(page, "document.querySelectorAll('.plague')[1].className.indexOf('gated') >= 0", 10) and 'done' not in cards(page)[0]['cls'] and status(page) == '进度已重置', cards(page)[:2])
    check('A9 重置进度：存档、玩家档案和“最近玩的章节”都清空',
          page.evaluate("['rlp3d.save.plague1', 'rlp3d.save.plague2', 'rlp3d.profile', 'rlp3d.last'].every(k => localStorage.getItem(k) === null)"))
    ctx.close()

    # ================================================================== B 通关结尾上真实点“进入第二灾”
    ctx, page = env.new_page()
    env.open(page)
    start_ch1(page)
    clear_ch1_and_ending(page, auto=False, time_scale=25)
    check('B1 通关旗标一立就记进通关记录（不等结尾）', poll(page, "RLP.state.isCleared('plague1')", 10))
    check('B1 结尾卡出现两个按钮，没有倒数提示', wait_ending_buttons(page) and page.evaluate("document.querySelector('.ending-note').textContent") == '')
    page.evaluate('window.__m = 1')
    page.click('.ending .ending-next')
    check('B2 真实点“进入第二灾”：页面重载并直接开始第二灾（不经过标题菜单）',
          poll(page, "window.RLP && RLP.ready === true && !window.__m && RLP.state.chapter === 'plague2' && RLP.ctx.ui.menu.visible === false", 180))
    check('B2 没有启动错误；自动存档很快把“最近玩的章节”记成第二灾（片头还没播完就存了）',
          page.evaluate('RLP.bootError') is None and poll(page, "localStorage.getItem('rlp3d.last') === 'plague2' && !!localStorage.getItem('rlp3d.save.plague2')", 10))
    check('B2 第二灾是新档（第一灾的旗标没有带过来），第一灾的存档里仍有通关旗标',
          poll(page, "RLP.state.flag('plague1_complete') === undefined && RLP.state.flag('intro_done') !== undefined", 30) and save(page, 'plague1')['flags'].get('plague1_complete') is True)
    page.screenshot(path=str(OUT / 'plague2_after_advance.png'))
    ctx.close()

    # ================================================================== C 倒数自动进入
    ctx, page = env.new_page()
    env.open(page)
    start_ch1(page)
    clear_ch1_and_ending(page, auto=True, time_scale=6)
    check('C1 按钮出现后开始倒数（小字提示“N 秒后自动进入第二灾 · 蛙灾”）', poll(page, "/^\\d+ 秒后自动进入第二灾 · 蛙灾$/.test(document.querySelector('.ending-note').textContent)", 60), page.evaluate("document.querySelector('.ending-note').textContent"))
    page.evaluate('window.__m = 1')
    check('C2 倒数完什么都不点：自己进入第二灾', poll(page, "window.RLP && RLP.ready === true && !window.__m && RLP.state.chapter === 'plague2' && RLP.ctx.ui.menu.visible === false", 180))
    ctx.close()

    # ================================================================== D 倒数期间点“返回主菜单”取消自动进入
    ctx, page = env.new_page()
    env.open(page)
    start_ch1(page)
    clear_ch1_and_ending(page, auto=True, time_scale=1)
    check('D1 倒数开始', poll(page, "/自动进入/.test(document.querySelector('.ending-note').textContent)", 30))
    page.evaluate('window.__m = 1')
    page.click('.ending .ending-btn:last-child')
    check('D2 点“返回主菜单”：回到首页，不会进入第二灾', poll(page, "window.RLP && RLP.ready === true && !window.__m && !!document.querySelector('.menu.show')", 180) and page.evaluate('RLP.ctx.ui.menu.visible') is True)
    time.sleep(1.5)
    check('D2 回首页后没有被自动带走（还在菜单，第二灾已解锁）', page.evaluate('RLP.ctx.ui.menu.visible') is True and cards(page)[1]['cls'].startswith('open'))
    ctx.close()

    # ================================================================== E
    legacy = """if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1');
      localStorage.setItem('rlp3d.achievements', JSON.stringify(['its_me']));
      localStorage.setItem('rlp3d.save.plague1', JSON.stringify({ v: 1, chapter: 'plague1', flags: { plague1_complete: true }, inventory: [], view: 'overview', achievements: [], savedAt: 1760000000000 })); }"""
    ctx, page = env.new_page(init=legacy)
    check('E1 带着旧版数据启动', env.open(page))
    cs = cards(page)
    check('E1 旧版“带通关旗标的存档”算通关：第二灾解锁、第一灾打勾', cs[1]['cls'] == 'open' and 'done' in cs[0]['cls'], cs[:2])
    check('E1 旧版 v1 存档不再读（不污染这一版）：菜单不提示“继续”', status(page) in ('', '下一章：第二灾 · 蛙灾'), status(page))
    open_panel(page, 2)
    g = ach_groups(page)
    check('E1 旧版成就 id 数组并进历史：its_me 算已解锁（没有日期）', g and g[0][1] == '1 / 5' and g[0][2] == 1 and g[0][3] == 0, g)
    ctx.close()

    deny = "Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });"
    ctx, page = env.new_page(init=deny)
    check('E2 本地存储不可用：照常启动', env.open(page))
    check('E2 菜单明说不能保存进度', '不能保存进度' in (status(page) or ''), status(page))
    start_ch1(page)
    clear_ch1_and_ending(page, auto=False, time_scale=25)
    check('E2 存储写不了时，本次游戏内通关记录仍有效（内存里）：结尾仍出现“进入第二灾”',
          poll(page, "RLP.state.isCleared('plague1')", 10) and wait_ending_buttons(page) and page.evaluate("document.querySelectorAll('.ending .ending-btn').length") == 2)
    ctx.close()

    ctx, page = env.new_page()
    check('E3 ?unlock=1：菜单里第二灾直接开放', env.open(page, 'index.html?norender=1&unlock=1') and cards(page)[1]['cls'] == 'open')
    page.evaluate("() => { localStorage.setItem('rlp3d.profile', JSON.stringify({ v: 1, ach: { its_me: { t: 1, zh: 'x', en: '', ch: null } }, cleared: { plague1: { t: 1 } } })); }")
    env.open(page, 'index.html?autotest=1&norender=1', menu=False)
    check('E3 测试页 ?autotest=1：启动时清空本机档案（每次从空白开始）', poll(page, "RLP.ready === true", 120) and page.evaluate("localStorage.getItem('rlp3d.profile') === null && !RLP.state.isCleared('plague1')"))
    page.evaluate("() => { localStorage.setItem('rlp3d.profile', JSON.stringify({ v: 1, ach: {}, cleared: { plague1: { t: 1 } } })); }")
    env.open(page, 'index.html?norender=1&fresh=1')
    check('E3 ?fresh=1：同样清空，第二灾重新上锁', cards(page)[1]['cls'] == 'locked gated')
    ctx.close()

    # ================================================================== F 触屏
    ctx, page = env.new_page(w=844, h=390, touch=True)
    check('F1 触屏横屏启动首页', env.open(page))
    page.tap('.plague:nth-child(2)')
    check('F1 触屏轻点锁着的第二灾：提示“通关第一灾后解锁”，仍在菜单', status(page) == '第二灾 · 蛙灾 —— 通关第一灾后解锁' and page.evaluate('RLP.ctx.ui.menu.visible') is True, status(page))
    start_ch1(page)
    clear_ch1_and_ending(page, auto=False, time_scale=25)
    check('F2 触屏结尾卡出现两个按钮', wait_ending_buttons(page))
    page.evaluate('window.__m = 1')
    page.tap('.ending .ending-next')
    check('F2 触屏轻点“进入第二灾”：重载并开始第二灾', poll(page, "window.RLP && RLP.ready === true && !window.__m && RLP.state.chapter === 'plague2' && RLP.ctx.ui.menu.visible === false", 180))
    ctx.close()

    # ================================================================== G 第三灾的解锁顺序（必须先通关第一、二灾）
    def seed(cleared):
        return "if (!localStorage.getItem('rlp3d.profile')) localStorage.setItem('rlp3d.profile', JSON.stringify({ v: 1, ach: {}, cleared: %s }));" % json.dumps({c: {'t': 1760000000000} for c in cleared})

    for label, done, third_open, msg in [
        ('空档', [], False, '第三灾 · 蚊灾和虱灾 —— 通关第一灾后解锁'),
        ('只通关第一灾', ['plague1'], False, '第三灾 · 蚊灾和虱灾 —— 通关第二灾后解锁'),
        ('只有第二灾的通关记录（残档，第一灾没通关）', ['plague2'], False, '第三灾 · 蚊灾和虱灾 —— 通关第一灾后解锁'),
        ('第一、二灾都通关', ['plague1', 'plague2'], True, None),
    ]:
        ctx, page = env.new_page(init=seed(done))
        check(f'G1 {label}：首页启动', env.open(page))
        cs = cards(page)
        check(f'G1 {label}：第三灾' + ('开放' if third_open else '“未解锁”'),
              (cs[2]['cls'].startswith('open') and cs[2]['zh'] == '蚊灾和虱灾') if third_open else (cs[2]['cls'] == 'locked gated' and cs[2]['zh'] == '未解锁'), cs[:3])
        if not third_open:
            page.click('.plague:nth-child(3)')
            check(f'G1 {label}：点第三灾留在菜单，提示“{msg.split("—— ")[1]}”', page.evaluate('RLP.ctx.ui.menu.visible') is True and status(page) == msg, status(page))
            check(f'G1 {label}：▶ 不会指向第三灾', page.evaluate('RLP.chapter.number') != 3)
        else:
            check(f'G1 {label}：菜单提示“下一章：第三灾 · 蚊灾和虱灾”，启动直接装载第三灾', status(page) == '下一章：第三灾 · 蚊灾和虱灾' and page.evaluate('RLP.chapter.number') == 3, status(page))
            page.click('.menu-play')
            check('G1 真实点 ▶：开始第三灾（不重载页面）', poll(page, 'RLP.state.chapter === "plague3" && !RLP.ctx.ui.menu.visible', 120) and not page.evaluate('RLP.bootError'))
        ctx.close()

    # 通关第二灾 → 结尾卡出现“进入第三灾”并自动进入（先通关第一灾，再在第二灾里立通关旗标，和真实流程一样走 watchClear）
    ctx, page = env.new_page(init=seed(['plague1']))
    env.open(page)
    page.evaluate("async () => { await RLP.start(2, { skipIntro: true }); }")
    poll(page, 'RLP.state.chapter === "plague2" && !RLP.ctx.ui.menu.visible', 60)
    page.evaluate("""() => { RLP.timeScale = 6; RLP.ctx.ui.autoAdvance = true; RLP.ctx.setFlag('plague2_complete');
      window.__ending = RLP.ctx.ui.ending({ zh: '第二灾 · 完', en: 'Plague II — complete' }); }""")
    check('G2 通关第二灾：通关记录立刻写进去', poll(page, "RLP.state.isCleared('plague2')", 10))
    check('G2 结尾卡：出现“进入第三灾 · 蚊灾和虱灾”和“返回主菜单”', wait_ending_buttons(page) and page.evaluate("[...document.querySelectorAll('.ending .ending-btn')].map(b => b.textContent)") == ['进入第三灾 · 蚊灾和虱灾', '返回主菜单'],
          page.evaluate("[...document.querySelectorAll('.ending .ending-btn')].map(b => b.textContent)"))
    page.evaluate('window.__m = 1')
    check('G2 倒数完什么都不点：自己进入第三灾（重载后直接开始第三灾，没有启动错误）',
          poll(page, "window.RLP && RLP.ready === true && !window.__m && RLP.state.chapter === 'plague3' && RLP.ctx.ui.menu.visible === false", 180) and not page.evaluate('RLP.bootError'))
    ctx.close()

    # 只通关第一灾时，第二灾的结尾卡（没立通关旗标的假结尾）不会带玩家进第三灾；开发入口 ?unlock=1 才能绕过
    ctx, page = env.new_page(init=seed(['plague1']))
    env.open(page)
    page.evaluate("async () => { RLP.ctx.ui.autoAdvance = false; await RLP.start(2, { skipIntro: true }); RLP.timeScale = 25; window.__e = RLP.ctx.ui.ending({ zh: '第二灾 · 完', en: '' }); }")
    check('G3 第二灾还没通关：结尾卡只有“返回主菜单”（不会把玩家带进第三灾）', wait_ending_buttons(page) and page.evaluate("[...document.querySelectorAll('.ending .ending-btn')].map(b => b.textContent)") == ['返回主菜单'])
    ctx.close()
    ctx, page = env.new_page(init=seed(['plague1']))
    check('G3 ?unlock=1（开发入口）：第三灾直接开放', env.open(page, 'index.html?norender=1&unlock=1') and cards(page)[2]['cls'].startswith('open'))
    ctx.close()


if __name__ == '__main__':
    main()
