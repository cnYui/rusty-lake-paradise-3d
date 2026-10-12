r"""验证小工具包的声音：按小红书容器的 CSP 起静态服务，手机竖屏 / 横屏 + 真实触摸（CDP touchStart / touchEnd），在总线上接 AnalyserNode 量 RMS。

检查（每个场景都是全新的浏览器上下文）：
  A  默认线路（电脑 Chromium：直连）  竖屏 390×844：点之前 AudioContext 还没创建；touchStart 之后 touchEnd 之前 / 之后的状态；
        点屏幕后 running；标题的环境音 + 音乐在总线上有信号；静音后触发游戏里的音效（bell / door / splash）信号起来；RLP.audioTest() 全部音效不抛错；
        没有 CSP 违规 / 404 / 请求失败 / 页面报错；DOM 里没有 audio / video / source；debug 状态条存在（release 版不应该有）
  B  iPhone 线路（UA 伪装成 iPhone → 走媒体流）  同上，另外：touchStart 时 <audio>.play() 被拒（NotAllowedError，不是手势结束事件），
        touchEnd 后 <audio> 在播且 currentTime 在走，MediaStream 里（回环量）有信号；<audio> 没有任何 URL（src / currentSrc 为空，srcObject 是流）
  C  媒体流播放失败回退：伪造 play() 抛 NotSupportedError → 回退直连，仍有信号
  D  横屏 844×390（不转）：点屏幕后 running + 有信号
  E  完整流程 RLP.autoplay()（点过屏幕解锁后）：流程通过，期间总线出现过信号，触发过多种音效，没有页面报错
用法：python dev/minitool/audio_check.py [dist 目录，默认 dist-audio] [--release] [--quick（跳过 E）]
  --release：检查的是 --release 的包——不应有调试状态条，其余一样
"""
import functools, http.server, json, os, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
RELEASE = '--release' in sys.argv
QUICK = '--quick' in sys.argv
DIST = os.path.abspath(args[0] if args else os.path.join(HERE, 'dist-audio-release' if RELEASE else 'dist-audio'))
OUT = os.path.join(HERE, '_test_out_audio')
os.makedirs(OUT, exist_ok=True)

CSP = ("default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
       "font-src 'self'; media-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")
IPHONE_UA = ('Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1')


class H(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def end_headers(self):
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass


socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer.request_queue_size = 128
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(H, directory=DIST))
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}'

results = []


def check(name, ok, detail=None):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + json.dumps(detail, ensure_ascii=False) if detail is not None else ''), flush=True)


class Fingers:
    """CDP 真实触摸：down = touchStart，up = touchEnd（pointerdown 不算用户手势，touchend / pointerup 才算，和 iOS 一致）。"""
    def __init__(self, cdp):
        self.cdp, self.pts = cdp, {}

    def _send(self, kind):
        pts = [{'x': x, 'y': y, 'id': i, 'radiusX': 6, 'radiusY': 6, 'force': 1} for i, (x, y) in self.pts.items()]
        self.cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': pts})

    def down(self, i, x, y):
        self.pts[i] = (x, y); self._send('touchStart')

    def up(self, i):
        self.pts.pop(i, None); self._send('touchEnd')


def poll(page, expr, timeout=30.0, every=0.25):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(f'!!({expr})'):
            return True
        time.sleep(every)
    return False


def new_page(browser, w, h, ua=None, mobile=True, init=None):
    kw = dict(viewport={'width': w, 'height': h}, device_scale_factor=2 if w < 500 else 1, is_mobile=mobile, has_touch=mobile)
    if ua:
        kw['user_agent'] = ua
    ctx = browser.new_context(**kw)
    page = ctx.new_page()
    log = {'errors': [], 'failed': [], 'r404': []}
    page.add_init_script("document.addEventListener('securitypolicyviolation', e => (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI));")
    if init:
        page.add_init_script(init)
    page.on('console', lambda m: log['errors'].append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: log['errors'].append(f'[pageerror] {e}'))
    page.on('requestfailed', lambda r: log['failed'].append(f'{r.url} {r.failure}'))
    page.on('response', lambda r: log['r404'].append(f'{r.status} {r.url}') if r.status >= 400 else None)
    return ctx, page, log


def to_screen(page, xv, yv):
    return page.evaluate('([x, y]) => { const S = window.__RLP_ROT; return S.rot ? { x: S.fw - y, y: x } : { x, y }; }', [xv, yv])


SNAP = """() => {
  const S = window.__RLP_AUDIO || {}, c = S.ctx, m = S.media, a = window.RLP && RLP.ctx && RLP.ctx.audio;
  const bar = [...document.querySelectorAll('#rot div')].find(d => d.textContent.startsWith('♪'));
  return { ctx: c ? c.state : null, route: S.route, direct: S.direct, playState: S.playState, taps: S.taps, session: S.session,
           mediaPaused: m ? m.paused : null, mediaTime: m ? Math.round(m.currentTime * 100) / 100 : null,
           audioReady: a ? a.ready : null, amb: a && a.currentAmbience, music: a && a.currentMusic, bar: bar ? bar.textContent : null };
}"""

ATTACH = """() => {
  const S = window.__RLP_AUDIO, c = S.ctx;
  const an = c.createAnalyser(); an.fftSize = 2048; S.node.connect(an);
  window.__an = an; window.__buf = new Float32Array(2048);
  if (S.msd) {   // 回环：把 MediaStreamDestination 的流重新读回来量，证明总线真的进了流
    const src = c.createMediaStreamSource(S.msd.stream), an2 = c.createAnalyser(); an2.fftSize = 2048; src.connect(an2);
    window.__an2 = an2; window.__buf2 = new Float32Array(2048);
  }
}"""

PEAK = """async (ms) => {
  const t0 = performance.now(); let p1 = 0, p2 = 0;
  const rms = (an, buf) => { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length); };
  while (performance.now() - t0 < ms) {
    p1 = Math.max(p1, rms(window.__an, window.__buf));
    if (window.__an2) p2 = Math.max(p2, rms(window.__an2, window.__buf2));
    await new Promise(r => setTimeout(r, 25));
  }
  return { bus: p1, stream: window.__an2 ? p2 : null };
}"""


def peak(page, ms=1500):
    return page.evaluate(PEAK, ms)


def csp_and_errors(page, log, label):
    csp = page.evaluate('window.__csp || []')
    check(f'{label}：没有 CSP 违规', not csp, csp[:5])
    errs = [e for e in log['errors'] if 'toNonIndexed' not in e and 'flatShading' not in e]
    check(f'{label}：没有页面错误（console error / pageerror）', not errs, errs[:5])
    check(f'{label}：没有请求失败，也没有 4xx / 5xx', not log['failed'] and not log['r404'], (log['failed'] + log['r404'])[:5])


def unlock_tap(page, f, label, wait_media):
    """touchStart（此时游戏创建 AudioContext，但不是手势结束事件）→ 读状态 → touchEnd → 读状态。返回 (down 后状态, up 后状态)。"""
    p = to_screen(page, 30, 195)           # 舞台左边的黑边：只会触发解锁，不会点中游戏里的东西
    before = page.evaluate(SNAP)
    check(f'{label}：点之前 AudioContext 还没创建、没有声音', before['ctx'] is None and before['audioReady'] is False, before)
    f.down(0, p['x'], p['y'])
    time.sleep(0.35)
    mid = page.evaluate(SNAP)
    f.up(0)
    time.sleep(0.15)
    after = None
    for _ in range(40):
        after = page.evaluate(SNAP)
        if after['ctx'] == 'running' and (not wait_media or after['mediaPaused'] is False):
            break
        time.sleep(0.1)
    return mid, after


def scenario_title(browser, label, ua, expect_media, extra_query='', init=None, size=(390, 844), mobile=True, expect_fallback=False, expect_gated=False):
    if ONLY and not label.startswith(ONLY):
        return None
    print(f'\n=== {label} ===', flush=True)
    ctx, page, log = new_page(browser, size[0], size[1], ua=ua, mobile=mobile, init=init)
    page.goto(f'{BASE}/index.html?norender=1{extra_query}')
    assert poll(page, 'window.RLP && RLP.ready === true && RLP.ctx.ui.menu.visible === true', 120), '标题没出来'
    time.sleep(0.5)
    S0 = page.evaluate('({ rot: window.__RLP_ROT.rot, audio: !!window.__RLP_AUDIO, wantMedia: __RLP_AUDIO.wantMedia, debug: __RLP_AUDIO.debug })')
    check(f'{label}：音频脚本已加载，线路选择符合预期（wantMedia={expect_media}）', S0['audio'] and S0['wantMedia'] == expect_media, S0)
    f = Fingers(ctx.new_cdp_session(page))
    mid, after = unlock_tap(page, f, label, expect_media and not expect_fallback)
    print('  touchStart 之后、touchEnd 之前：', json.dumps(mid, ensure_ascii=False))
    print('  touchEnd 之后：', json.dumps(after, ensure_ascii=False))
    check(f'{label}：点屏幕后 AudioContext 为 running', after['ctx'] == 'running', after)
    check(f'{label}：游戏侧 audio.ready，环境音 + 标题音乐已请求', after['audioReady'] is True and after['amb'] == 'lake' and after['music'] == 'intro', [after['amb'], after['music']])
    check(f'{label}：手势结束事件到达过（taps ≥ 1）', after['taps'] >= 1, after['taps'])
    if expect_gated:
        check(f'{label}：touchStart（非手势结束）时 play() 被拒（NotAllowedError）→ 不算失败：<audio> 暂停、状态“被拒”、没有回退直连', mid['mediaPaused'] is True and str(mid['playState']).startswith('被拒') and mid['direct'] is False and mid['route'] == '媒体流', mid)
        check(f'{label}：touchEnd（手势结束）后重试成功：<audio> 在播、仍是媒体流', after['mediaPaused'] is False and after['direct'] is False and after['route'] == '媒体流', after)
    if expect_media and not expect_fallback:
        print('  （参考）touchStart 时 <audio> 暂停 =', mid['mediaPaused'], '| play 状态 =', mid['playState'], '——iOS 上 pointerdown / touchstart 不算手势，这时 play() 会被拒，手势结束事件里再试')
        check(f'{label}：touchEnd 后 <audio> 在播、没有走回直连', after['mediaPaused'] is False and after['direct'] is False and after['route'] == '媒体流', after)
        check(f'{label}：audioSession 在支持的系统上设为 playback（Chromium 没有该接口时显示“无”）', after['session'] in ('playback', '无'), after['session'])
    elif expect_fallback:
        check(f'{label}：play() 失败后回退直连', after['direct'] is True and after['route'].startswith('直连'), after)
    else:
        check(f'{label}：线路 = 直连（和原来一样）', after['route'] == '直连' and after['direct'] is True, after['route'])
    page.evaluate(ATTACH)
    time.sleep(2.5)
    pk = peak(page, 1500)
    check(f'{label}：标题的环境音 + 音乐在总线上有信号（RMS > 0.002）', pk['bus'] > 0.002, pk)
    if pk['stream'] is not None and not expect_fallback:
        check(f'{label}：同一时刻 MediaStream 里也有信号（RMS > 0.002）', pk['stream'] > 0.002, pk)
        t1 = page.evaluate('window.__RLP_AUDIO.media.currentTime')
        time.sleep(1.0)
        t2 = page.evaluate('window.__RLP_AUDIO.media.currentTime')
        check(f'{label}：<audio>.currentTime 在走（真的在播放这条流）', t2 > t1 + 0.3, [t1, t2])
        mi = page.evaluate('(() => { const m = window.__RLP_AUDIO.media; return { src: m.getAttribute("src"), currentSrc: m.currentSrc, hasStream: !!m.srcObject, inDom: !!m.parentNode }; })()')
        check(f'{label}：<audio> 没有任何 URL（src / currentSrc 为空，srcObject 是流，不在 DOM 里）', not mi['src'] and not mi['currentSrc'] and mi['hasStream'] and not mi['inDom'], mi)
    check(f'{label}：DOM 里没有 audio / video / source 元素', page.evaluate('document.querySelectorAll("audio,video,source").length') == 0)
    # 静音后单独触发游戏里的音效
    page.evaluate("(() => { const a = RLP.ctx.audio; a.ambience('none'); a.music('none'); })()")
    time.sleep(6.0)       # 淡出 + 混响尾巴
    base = peak(page, 800)
    res = {}
    for name in ('bell', 'door', 'splash'):
        page.evaluate(f"RLP.ctx.audio.sfx('{name}')")
        res[name] = peak(page, 900)['bus']
        time.sleep(2.5)
    print(f'  静音底噪 RMS {base["bus"]:.5f}；音效峰值 RMS', {k: round(v, 4) for k, v in res.items()})
    check(f'{label}：触发游戏里的音效（bell / door / splash）后总线信号起来（比底噪高 0.003 以上）', all(v > base['bus'] + 0.003 for v in res.values()), [base, res])
    t = page.evaluate('RLP.audioTest()')
    check(f'{label}：RLP.audioTest()：全部 {len(page.evaluate("RLP.ctx.audio.sfxNames()"))} 个音效 / 环境音 / 音乐都不抛错', not t['errors'] and t['state'] == 'running', t)
    # 切后台 / 回前台（官方性能规范：页面不可见时停止媒体）
    page.evaluate("(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); })()")
    time.sleep(0.6)
    hid = page.evaluate(SNAP)
    check(f'{label}：切到后台：AudioContext 暂停、<audio> 暂停', hid['ctx'] == 'suspended' and hid['mediaPaused'] in (None, True), hid)
    page.evaluate("(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); })()")
    time.sleep(1.2)
    back = page.evaluate(SNAP)
    check(f'{label}：回前台：AudioContext 恢复 running，<audio> 恢复播放', back['ctx'] == 'running' and (back['mediaPaused'] in (None, False) or expect_fallback), back)
    final = page.evaluate(SNAP)
    if S0['debug']:
        check(f'{label}：调试版：左下角有声音状态条', bool(final['bar']), final['bar'])
    else:
        check(f'{label}：release 版：没有声音状态条', final['bar'] is None, final['bar'])
    page.screenshot(path=os.path.join(OUT, f'audio_{label.split()[0]}.png'))
    # 排查面板（连点左上角 5 下，release 版也有）里有一行“声音”
    q = to_screen(page, 30, 30)
    for _ in range(5):
        f.down(1, q['x'], q['y']); time.sleep(0.04); f.up(1); time.sleep(0.1)
    time.sleep(0.8)
    dtext = page.evaluate("(() => { const d = document.querySelector('.rlp-diag'); return d && d.classList.contains('show') ? d.textContent : null; })()")
    line = [ln for ln in (dtext or '').splitlines() if ln.startswith('声音')]
    check(f'{label}：排查面板里有“声音”一行（状态 / 线路 / 电平）', bool(line) and 'running' in line[0], line)
    csp_and_errors(page, log, label)
    ctx.close()
    return final


def scenario_autoplay(browser):
    label = 'E 完整流程'
    print(f'\n=== {label} ===', flush=True)
    ctx, page, log = new_page(browser, 390, 844)
    page.goto(f'{BASE}/index.html?autotest=1')
    assert poll(page, 'window.RLP && RLP.ready === true', 180), '没启动'
    f = Fingers(ctx.new_cdp_session(page))
    p = to_screen(page, 30, 195)
    f.down(0, p['x'], p['y']); time.sleep(0.1); f.up(0)
    assert poll(page, 'window.__RLP_AUDIO.ctx && __RLP_AUDIO.ctx.state === "running"', 10), '点屏幕后没有 running'
    page.evaluate(ATTACH)
    page.evaluate("""() => {
      const a = RLP.ctx.audio, used = new Set(), orig = a.sfx.bind(a);
      a.sfx = (n) => { used.add(n); return orig(n); };
      window.__used = used; window.__peak = 0; window.__hits = 0;
      setInterval(() => { window.__an.getFloatTimeDomainData(window.__buf); let s = 0; for (const v of window.__buf) s += v * v; const r = Math.sqrt(s / window.__buf.length); if (r > window.__peak) window.__peak = r; if (r > 0.002) window.__hits++; }, 40);
    }""")
    t0 = time.time()
    res = page.evaluate("(async () => { RLP.timeScale = 3; const r = await RLP.autoplay({ stepDelay: 0 }); return { ok: r.ok, steps: r.steps, total: r.total, error: r.error, failedStep: r.failedStep }; })()")
    check(f'{label}：autoplay 跑完（{time.time() - t0:.0f}s）', res['ok'] and res['steps'] == res['total'], res)
    st = page.evaluate("({ used: [...window.__used], peak: window.__peak, hits: window.__hits, state: RLP.ctx.audio.context.state, amb: RLP.ctx.audio.currentAmbience, music: RLP.ctx.audio.currentMusic })")
    print('  音效：', st['used'], '| 峰值 RMS', round(st['peak'], 4), '| 有信号的采样', st['hits'], '| 结束时', st['state'], st['amb'], st['music'])
    check(f'{label}：流程里触发了多种音效（≥ 8 种）', len(st['used']) >= 8, len(st['used']))
    check(f'{label}：流程期间总线出现过信号（峰值 RMS > 0.01）', st['peak'] > 0.01, st['peak'])
    check(f'{label}：流程结束时 AudioContext 仍是 running', st['state'] == 'running', st['state'])
    csp_and_errors(page, log, label)
    ctx.close()


# 本机的 Chromium 在 CDP 触摸 touchStart 时就放行了 <audio>.play()（没法靠真实策略测出手势门槛），所以用桩模拟 iOS：
# 手势结束事件（touchend / pointerup / click / keydown）到达之前，play() 一律拒绝 NotAllowedError，之后才放行
GATE_INIT = """(() => {
  window.__ended = false;
  ['touchend', 'pointerup', 'click', 'keydown'].forEach(t => addEventListener(t, () => { window.__ended = true; }, true));
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { return window.__ended ? orig.call(this) : Promise.reject(new DOMException('gate', 'NotAllowedError')); };
})();"""

ONLY = os.environ.get('ONLY')    # 例如 ONLY=B3：只跑标签以 B3 开头的场景（调试用）

with sync_playwright() as p:
    # 显式用 Chrome 默认的自动播放策略（要用户手势才放行）。Playwright 的 Chromium 默认是放开的：AudioContext 一创建就 running，
    # 测不出“手势结束事件才放行”的逻辑；不要加 --autoplay-policy=no-user-gesture-required
    browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
                                      '--autoplay-policy=document-user-activation-required'])

    scenario_title(browser, 'A 默认线路（直连）', None, False)
    scenario_title(browser, 'B iPhone 线路（媒体流）', IPHONE_UA, True)
    scenario_title(browser, 'B2 强制媒体流 ?audioroute=media（桌面 UA）', None, True, extra_query='&audioroute=media')
    scenario_title(browser, 'C 媒体流 play() 失败 → 回退直连', None, True, extra_query='&audioroute=media', expect_fallback=True,
                   init="HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException('fake', 'NotSupportedError')); };")
    scenario_title(browser, 'B3 模拟 iOS 手势门槛：手势结束事件之前 play() 一律 NotAllowedError', IPHONE_UA, True, expect_gated=True,
                   init=GATE_INIT)
    scenario_title(browser, 'D 横屏 844×390（不转）', None, False, size=(844, 390))
    if not QUICK and not ONLY:
        scenario_autoplay(browser)
    browser.close()

srv.shutdown()
print(json.dumps({'passed': sum(results), 'total': len(results)}))
sys.exit(0 if all(results) else 1)
