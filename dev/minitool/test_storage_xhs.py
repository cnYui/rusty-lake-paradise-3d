r"""验证小红书小工具存档层（dev/minitool/storage_xhs.js）和游戏里的存档集成。

先打包（或 MINITOOL_DIST 指定已打好的目录），再按容器 CSP 起静态服务，用模拟的 window.xhs.miniTool 跑：
  A. 隔离单元：只加载 storage_xhs.js 的空白页。版本边界、同步 / 异步取版本、没有 xhs、key 编码、data 格式、
     getStorage 挂起 / 迟到、setStorage 失败与恢复、例外键、枚举、未处理拒绝。
  B. 首次迁移：localStorage 旧存档与 xhs 数据合并（save 取 savedAt 新的、profile 取并集、其它以 xhs 为准）。
  C. 游戏集成：竖屏 390×844 触摸、URL 无参数进标题菜单；xhs 里的通关记录决定菜单状态、清空 localStorage
     重载后不变；没有 xhs 时照旧用 localStorage；setStorage 全失败时暂停面板的“保存进度”不说“已保存”。

用法：
  python dev/minitool/test_storage_xhs.py
  MINITOOL_DIST=<已打好的 dist> python dev/minitool/test_storage_xhs.py
"""
import functools, http.server, json, os, shutil, socketserver, subprocess, sys, tempfile, threading, time, uuid
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build.py')
TMP = None


def build_dist():
    global TMP
    env_dist = os.environ.get('MINITOOL_DIST')
    if env_dist:
        return os.path.abspath(env_dist)
    # 不用 tempfile.mkdtemp：它建出来的目录在 Windows 沙箱里会被保护起来，esbuild 子进程写不进去。
    TMP = os.path.join(tempfile.gettempdir(), 'rlp3d-storage-test-' + uuid.uuid4().hex)
    os.makedirs(TMP)
    dist = os.path.join(TMP, 'dist')
    zpath = os.path.join(TMP, 'x.zip')
    print(f'--- 打包到临时目录：{dist} ---', flush=True)
    subprocess.run([sys.executable, BUILD, '--release', '--out', dist, '--zip', zpath], check=True)
    return dist


DIST = build_dist()
CSP = ("default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
       "font-src 'self'; media-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")


class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass


socketserver.ThreadingTCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(H, directory=DIST))
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}'
STORE_JS = open(os.path.join(DIST, 'storage_xhs.js'), encoding='utf-8').read()

results = []


def check(name, ok, detail=None):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + json.dumps(detail, ensure_ascii=False) if detail is not None else ''), flush=True)


def poll(page, expr, timeout=30.0, every=0.2):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(f'!!({expr})'):
            return True
        time.sleep(every)
    return False


# ---------------------------------------------------------------- 模拟的容器 SDK
# cfg：
#   buildVersion      客户端 buildVersion（9460000 = 9.46.0）
#   syncVersion       true：launchOptions.miniToolEnv.buildVersion 同步可读；false：走 getLaunchOptions
#   noXhs             不注入 window.xhs
#   lateMs            window.xhs 晚多少毫秒注入
#   noGetLaunchOptions 删掉 getLaunchOptions
#   seed              xhs 存储里已有的数据（编码后的键 -> data 字符串）
#   localSeed         页面首次加载时写进 localStorage 的旧数据（只写一次）
#   persist           true：模拟存储放在 sessionStorage 里，跨重载保留（游戏集成测试用）
#   failSet / failRemove / hangInfo / hangGet / lateGetMs / hangLaunch / throwAll
MOCK = r"""
(function () {
  var cfg = %s;
  var STORE_KEY = '__xhs_mock_store';
  var SEED_KEY = '__xhs_mock_local_seeded';
  var store = null;
  if (cfg.persist) {
    try { var saved = sessionStorage.getItem(STORE_KEY); if (saved !== null) store = JSON.parse(saved); } catch (e) {}
  }
  if (!store) { try { store = JSON.parse(JSON.stringify(cfg.seed || {})); } catch (e) { store = {}; } }
  function persist() { if (cfg.persist) { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {} } }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  persist();

  var calls = { setStorage: 0, getStorage: 0, getStorageInfo: 0, removeStorage: 0, getLaunchOptions: 0, badData: 0 };
  window.__MOCK_NATIVE__ = { store: store, calls: calls, cfg: cfg };
  window.__unhandled = 0;
  window.addEventListener('unhandledrejection', function () { window.__unhandled++; });
  document.addEventListener('securitypolicyviolation', function (e) { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI); });

  try {
    if (!sessionStorage.getItem(SEED_KEY)) {
      var local = cfg.localSeed || {};
      for (var lk in local) localStorage.setItem(lk, local[lk]);
      sessionStorage.setItem(SEED_KEY, '1');
    }
  } catch (e) {}

  if (cfg.noXhs) return;

  var env = { miniToolEnv: { buildVersion: cfg.buildVersion } };
  var lat = function (v) { return new Promise(function (res) { setTimeout(function () { res(v); }, cfg.latency == null ? 5 : cfg.latency); }); };
  var never = function () { return new Promise(function () {}); };
  var mt = {
    getLaunchOptions: function () {
      calls.getLaunchOptions++;
      if (cfg.hangLaunch) return never();
      return lat(env);
    },
    getStorageInfo: function () {
      calls.getStorageInfo++;
      if (cfg.hangInfo) return never();
      return lat({ errMsg: 'getStorageInfo:ok', keys: Object.keys(store) });
    },
    getStorage: function (o) {
      calls.getStorage++;
      if (cfg.hangGet) return never();
      var read = function () { return { errMsg: 'getStorage:ok', data: Object.prototype.hasOwnProperty.call(store, o.key) ? store[o.key] : null }; };
      if (cfg.lateGetMs) return new Promise(function (res) { setTimeout(function () { res(read()); }, cfg.lateGetMs); });
      return lat(read());
    },
    setStorage: function (o) {
      calls.setStorage++;
      if (window.__MOCK_NATIVE__.cfg.failSet) return Promise.reject({ errMsg: 'setStorage:fail mock' });
      if (typeof o.data !== 'string') { calls.badData++; return Promise.reject({ errMsg: 'setStorage:fail data 必须是 JSON 字符串' }); }
      try { JSON.parse(o.data); } catch (e) { calls.badData++; return Promise.reject({ errMsg: 'setStorage:fail data 不是合法 JSON' }); }
      store[o.key] = o.data;
      persist();
      return lat({ errMsg: 'setStorage:ok' });
    },
    removeStorage: function (o) {
      calls.removeStorage++;
      if (window.__MOCK_NATIVE__.cfg.failRemove) return Promise.reject({ errMsg: 'removeStorage:fail mock' });
      delete store[o.key];
      persist();
      return lat({ errMsg: 'removeStorage:ok' });
    }
  };
  if (cfg.throwAll) {
    Object.keys(mt).forEach(function (n) { mt[n] = function () { throw new Error('mock ' + n + ' 抛错'); }; });
  }
  if (cfg.noGetLaunchOptions) delete mt.getLaunchOptions;
  var X = { miniTool: mt };
  if (cfg.syncVersion) X.launchOptions = env;
  if (cfg.lateMs) setTimeout(function () { window.xhs = X; }, cfg.lateMs);
  else window.xhs = X;
})();
"""


def enc_key(k):
    """键名编码：不是 [A-Za-z0-9] 的字符 → '_' + 两位小写十六进制。"""
    out = ''
    for ch in k:
        if ch.isascii() and (ch.isalnum()):
            out += ch
        else:
            out += '_' + format(ord(ch), '02x')
    return out


def native_data(raw):
    """游戏写进 xhs 的原始字符串 → 原生里存的 data（JSON 字符串）。"""
    return json.dumps(raw)


def legacy_data(obj):
    """对象 → localStorage 里存的 JSON 文本。"""
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))


def snap(page):
    return page.evaluate("""() => ({
      mode: window.__RLP_STORE ? window.__RLP_STORE.mode() : '(no store)',
      stats: window.__RLP_STORE ? JSON.parse(JSON.stringify(window.__RLP_STORE.stats)) : null,
      ok: window.__RLP_STORE ? window.__RLP_STORE.ok() : null,
      native: window.__MOCK_NATIVE__ ? window.__MOCK_NATIVE__.store : null,
      calls: window.__MOCK_NATIVE__ ? window.__MOCK_NATIVE__.calls : null,
      unhandled: window.__unhandled || 0,
      csp: window.__csp || [],
      ls: (() => { try { const o = {}; for (const k of Object.keys(localStorage)) o[k] = localStorage.getItem(k); return o; } catch (e) { return { '(error)': String(e) }; } })(),
    })""")


def store_page(browser, cfg, wait=True):
    """只加载 storage_xhs.js 的空白页（store.test 不设 CSP，方便单独测存档层）。"""
    ctx = browser.new_context()
    page = ctx.new_page()
    page.route('http://store.test/**', lambda r: r.fulfill(status=200, content_type='text/html', body='<!doctype html><html><body></body></html>'))
    page.add_init_script(MOCK % json.dumps(cfg, ensure_ascii=False))
    page.add_init_script(STORE_JS)
    t0 = time.time()
    page.goto('http://store.test/')
    if wait:
        page.evaluate('window.__RLP_STORE && window.__RLP_STORE.ready')
    return ctx, page, round(time.time() - t0, 2)


# ------------------------------------------------------------------------------ A. 隔离单元
def run_store_tests(browser):
    for label, cfg, want in (
        ('9459999（客户端 9.45.9）→ localStorage', {'buildVersion': 9459999}, 'local'),
        ('9460000（客户端 9.46.0，边界）→ Storage API', {'buildVersion': 9460000}, 'xhs'),
        ('9462004（9.46.2）→ Storage API', {'buildVersion': 9462004}, 'xhs'),
        ('同步 launchOptions 取版本（不调 getLaunchOptions）', {'buildVersion': 9462004, 'syncVersion': True}, 'xhs'),
        ('异步 getLaunchOptions 取版本', {'buildVersion': 9462004}, 'xhs'),
        ('取不到版本号 → localStorage', {'buildVersion': 0, 'noGetLaunchOptions': True}, 'local'),
        ('没有 window.xhs → localStorage', {'noXhs': True}, 'local'),
        ('window.xhs 晚 200ms 注入 → 等到了，Storage API', {'buildVersion': 9462004, 'lateMs': 200}, 'xhs'),
    ):
        ctx, page, took = store_page(browser, cfg)
        s = snap(page)
        extra = True
        if want == 'local' and not cfg.get('noXhs'):
            extra = s['calls']['getStorageInfo'] == 0 and s['calls']['getStorage'] == 0 and s['calls']['setStorage'] == 0
        if cfg.get('syncVersion'):
            extra = extra and s['calls']['getLaunchOptions'] == 0
        if label.startswith('异步'):
            extra = extra and s['calls']['getLaunchOptions'] >= 1
        if cfg.get('noXhs'):
            extra = extra and took < 1.0
        check('版本：' + label, s['mode'] == want and extra, {'mode': s['mode'], 'reason': s['stats']['reason'], 'calls': s['calls'], 'ready 用时(s)': took})
        ctx.close()

    # 写入：编码后的 key、data 是 JSON 字符串（值本身又是字符串）、兜底 localStorage、例外键不走 xhs
    ctx, page, _ = store_page(browser, {'buildVersion': 9462004})
    page.evaluate("""() => {
      const S = window.__RLP_STORE;
      S.setItem('rlp3d.save.plague1', '{"v":2,"savedAt":10}');
      S.setItem('rlp3d.some_key', '下划线');
      S.setItem('rlp3d.boot', '{"n":1}');
      S.setItem('rlp3d.probe', 'probe');
      S.setItem('rlp3d.wip', '1');
      S.setItem('rlp3d.unlock', '1');
      S.setItem('other.key', 'plain');
    }""")
    page.evaluate('window.__RLP_STORE.flush()')
    s = snap(page)
    n = s['native']
    check('写入：key 编码可逆（点和下划线都编码成 _xx）',
          'rlp3d_2esave_2eplague1' in n and 'rlp3d_2esome_5fkey' in n, sorted(n))
    check('写入：data 是 JSON 字符串，解析一层就是游戏写入的原始字符串',
          json.loads(n.get('rlp3d_2esave_2eplague1', 'null')) == '{"v":2,"savedAt":10}'
          and json.loads(n.get('rlp3d_2esome_5fkey', 'null')) == '下划线' and s['calls']['badData'] == 0,
          {k: n[k] for k in n})
    check('写入：rlp3d.boot / probe / wip / unlock 和其它键永远直接走 localStorage，不进 xhs',
          not any(k in n for k in (enc_key('rlp3d.boot'), enc_key('rlp3d.probe'), enc_key('rlp3d.wip'), enc_key('rlp3d.unlock'), 'other.key'))
          and all(k in s['ls'] for k in ('rlp3d.boot', 'rlp3d.probe', 'rlp3d.wip', 'rlp3d.unlock', 'other.key')),
          sorted(n))
    check('写入：内存缓存里的 getItem 读得到；managed 键同时写了一份 localStorage 兜底',
          page.evaluate("window.__RLP_STORE.getItem('rlp3d.some_key')") == '下划线'
          and s['ls'].get('rlp3d.save.plague1') == '{"v":2,"savedAt":10}', {'ls': sorted(s['ls'])})
    got = page.evaluate("""() => { const S = window.__RLP_STORE; const a = []; for (let i = 0; i < S.length; i++) a.push(S.key(i)); return a.sort(); }""")
    want_keys = sorted(['rlp3d.save.plague1', 'rlp3d.some_key', 'rlp3d.boot', 'rlp3d.probe', 'rlp3d.wip', 'rlp3d.unlock', 'other.key'])
    check('枚举：length / key(i) = 缓存里的键 ∪ localStorage 里不归它管的键（managed 的 localStorage 副本不重复出现）',
          got == want_keys, got)
    page.evaluate("window.__RLP_STORE.removeItem('rlp3d.save.plague1')")
    page.evaluate('window.__RLP_STORE.flush()')
    s = snap(page)
    check('删除：缓存 / localStorage / xhs 三处都删掉，getItem 读到 null',
          'rlp3d_2esave_2eplague1' not in s['native'] and 'rlp3d.save.plague1' not in s['ls']
          and page.evaluate("window.__RLP_STORE.getItem('rlp3d.save.plague1')") is None
          and s['calls']['removeStorage'] == 1, {'calls': s['calls']})
    check('写入过程没有未处理的 Promise 拒绝', s['unhandled'] == 0, s['unhandled'])
    ctx.close()

    # 启动读取：xhs 里的编码键解码回业务键；例外键即使出现在 xhs 里也不采用
    raw = '{"v":2,"savedAt":99}'
    ctx, page, _ = store_page(browser, {'buildVersion': 9462004, 'seed': {
        enc_key('rlp3d.save.plague1'): native_data(raw),
        enc_key('rlp3d.boot'): native_data('{"n":9}'),
    }})
    s = snap(page)
    check('读取：xhs 里的编码键解码回 rlp3d.save.plague1，getItem 返回原始字符串',
          page.evaluate("window.__RLP_STORE.getItem('rlp3d.save.plague1')") == raw and s['stats']['reads'] == 1,
          {'reads': s['stats']['reads']})
    check('读取：例外键 rlp3d.boot 即使在 xhs 里也不采用（仍读 localStorage，这里是 null）',
          page.evaluate("window.__RLP_STORE.getItem('rlp3d.boot')") is None)
    ctx.close()

    # getStorage 永不返回 / 迟到：初始化总时长有上限，超时后降级，迟到的结果不采用
    ctx, page, took = store_page(browser, {'buildVersion': 9462004, 'hangGet': True,
                                           'seed': {enc_key('rlp3d.settings'): native_data('{}')}})
    s = snap(page)
    page.evaluate("window.__RLP_STORE.setItem('rlp3d.settings', '{\"volume\":0.7}')")
    s2 = snap(page)
    check('getStorage 永不返回：ready 约 1.2 秒内 resolve，mode 降级到 local', s['mode'] == 'local' and 0.9 <= took <= 2.5 and '超时' in s['stats']['reason'],
          {'ready 用时(s)': took, 'reason': s['stats']['reason']})
    check('getStorage 永不返回：降级后写入走 localStorage，没有未处理拒绝', 'rlp3d.settings' in s2['ls'] and s2['unhandled'] == 0, sorted(s2['ls']))
    ctx.close()

    ctx, page, took = store_page(browser, {'buildVersion': 9462004, 'lateGetMs': 1900,
                                           'seed': {enc_key('rlp3d.settings'): native_data('{"volume":0.2}')}})
    time.sleep(0.8)
    s = snap(page)
    check('getStorage 约 1.9 秒才返回（初始化先超时）：之后迟到的结果一律不采用，mode 仍是 local',
          s['mode'] == 'local' and page.evaluate("window.__RLP_STORE.getItem('rlp3d.settings')") is None
          and s['unhandled'] == 0, {'mode': s['mode'], 'reason': s['stats']['reason'], 'ready 用时(s)': took})
    ctx.close()

    # setStorage 失败：ok=false、localStorage 有兜底；恢复后再写一次 ok=true
    ctx, page, _ = store_page(browser, {'buildVersion': 9462004})
    page.evaluate("""() => {
      window.__MOCK_NATIVE__.cfg.failSet = true;
      window.__RLP_STORE.setItem('rlp3d.save.plague1', '{"v":2,"savedAt":1}');
    }""")
    page.evaluate('window.__RLP_STORE.flush()')
    s = snap(page)
    check('setStorage reject：ok() 变 false、failures 记一次，localStorage 里仍有兜底值',
          s['mode'] == 'xhs' and s['ok'] is False and s['stats']['failures'] == 1
          and s['ls'].get('rlp3d.save.plague1') == '{"v":2,"savedAt":1}'
          and page.evaluate("window.__RLP_STORE.getItem('rlp3d.save.plague1')") == '{"v":2,"savedAt":1}'
          and s['unhandled'] == 0, {'stats': s['stats'], 'ok': s['ok']})
    page.evaluate("""() => {
      window.__MOCK_NATIVE__.cfg.failSet = false;
      window.__RLP_STORE.setItem('rlp3d.save.plague1', '{"v":2,"savedAt":2}');
    }""")
    page.evaluate('window.__RLP_STORE.flush()')
    s = snap(page)
    check('setStorage 恢复正常后再写一次：补写进 xhs，ok() 回到 true',
          s['ok'] is True and s['stats']['failures'] == 1
          and json.loads(s['native'].get('rlp3d_2esave_2eplague1', 'null')) == '{"v":2,"savedAt":2}',
          {'stats': s['stats'], 'native': s['native']})
    ctx.close()


# ------------------------------------------------------------------------------ B. 首次迁移
def run_migration_tests(browser):
    local_save = {'v': 2, 'chapter': 'plague1', 'flags': {'a': 1}, 'savedAt': 2000}
    old_save = {'v': 2, 'chapter': 'plague1', 'flags': {'a': 0}, 'savedAt': 1000}
    local_profile = {
        'v': 1,
        'ach': {
            'a': {'t': 50, 'zh': '本地 a', 'en': 'local a', 'ch': 'plague1'},
            'b': {'t': 200, 'zh': '本地 b', 'en': 'local b', 'ch': 'plague2'},
            'c': {'t': 300, 'zh': '本地 c', 'en': 'local c', 'ch': 'plague3'},
        },
        'cleared': {'plague1': {'t': 200}, 'plague3': {'t': 300}},
    }
    xhs_profile = {
        'v': 1,
        'ach': {
            'a': {'t': 100, 'zh': 'xhs a', 'en': 'xhs a', 'ch': 'plague1'},
            'b': {'t': 0, 'zh': 'xhs b', 'en': 'xhs b', 'ch': 'plague2'},
        },
        'cleared': {'plague1': {'t': 100}, 'plague2': {'t': 0}},
    }
    cfg = {
        'buildVersion': 9462004,
        'seed': {
            enc_key('rlp3d.save.plague1'): native_data(legacy_data(old_save)),
            enc_key('rlp3d.profile'): native_data(legacy_data(xhs_profile)),
        },
        'localSeed': {
            'rlp3d.save.plague1': legacy_data(local_save),
            'rlp3d.profile': legacy_data(local_profile),
            'rlp3d.last': 'plague1',
            'rlp3d.settings': '{"volume":0.55,"muted":false}',
            'rlp3d.achievements': '["old"]',
        },
    }
    ctx, page, took = store_page(browser, cfg)
    s = snap(page)
    n = s['native']
    save_now = json.loads(json.loads(n.get(enc_key('rlp3d.save.plague1'), 'null')))
    prof_now = json.loads(json.loads(n.get(enc_key('rlp3d.profile'), 'null')))
    check('迁移：xhs 为空 / 旧存档时导入 localStorage 的键，data 仍是 JSON 字符串',
          save_now == local_save and page.evaluate("window.__RLP_STORE.getItem('rlp3d.last')") == 'plague1'
          and page.evaluate("window.__RLP_STORE.getItem('rlp3d.settings')") == '{"volume":0.55,"muted":false}'
          and page.evaluate("window.__RLP_STORE.getItem('rlp3d.achievements')") == '["old"]', {'save': save_now})
    check('迁移：两边都有 rlp3d.save.* 时取 savedAt 更大的那份（本地 2000 > xhs 1000）',
          save_now.get('savedAt') == 2000 and save_now.get('flags') == {'a': 1})
    check('迁移：profile 取并集，同一个 id 保留 t 较小且非 0 的那条（a 取本地 50、b 取本地 200、cleared 取 xhs 100）',
          prof_now['ach']['a']['t'] == 50 and prof_now['ach']['b']['t'] == 200 and prof_now['ach']['c']['t'] == 300
          and prof_now['cleared']['plague1']['t'] == 100 and prof_now['cleared']['plague2']['t'] == 0
          and prof_now['cleared']['plague3']['t'] == 300,
          prof_now)
    check('迁移：localStorage 里的旧值保留不删（作兜底）',
          s['ls'].get('rlp3d.save.plague1') == legacy_data(local_save)
          and s['ls'].get('rlp3d.profile') == legacy_data(local_profile)
          and s['ls'].get('rlp3d.last') == 'plague1', sorted(s['ls']))
    check('迁移：stats.migrated 记下导入 / 合并的键数，mode 是 xhs',
          s['mode'] == 'xhs' and s['stats']['migrated'] == 5 and s['stats']['writes'] >= 5,
          {'migrated': s['stats']['migrated'], 'writes': s['stats']['writes'], 'ready 用时(s)': took})
    check('迁移：没有未处理的 Promise 拒绝', s['unhandled'] == 0, s['unhandled'])
    ctx.close()


# ------------------------------------------------------------------------------ C. 游戏集成
def errors_of(log):
    return [e for e in log['errors'] if 'toNonIndexed' not in e and 'flatShading' not in e]


def game_page(browser, cfg, path='index.html'):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    log = {'errors': [], 'failed': []}
    page.add_init_script("document.addEventListener('securitypolicyviolation', e => (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI));")
    page.add_init_script(MOCK % json.dumps(cfg, ensure_ascii=False))
    page.on('console', lambda m: log['errors'].append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: log['errors'].append(f'[pageerror] {e}'))
    page.on('requestfailed', lambda r: log['failed'].append(f'{r.url} {r.failure}'))
    page.goto(f'{BASE}/{path}')
    assert poll(page, 'window.RLP && RLP.ready === true', 240), '启动超时'
    return ctx, page, log


def game_menu_state(page):
    return page.evaluate("""() => ({
      mode: window.__RLP_STORE ? window.__RLP_STORE.mode() : '(no store)',
      bootError: RLP.bootError ? String(RLP.bootError) : null,
      menu: !!document.querySelector('.menu.show'),
      classes: [...document.querySelectorAll('.plague')].slice(0, 3).map(c => c.className),
      cleared: RLP.ctx.state.isCleared('plague1'),
      status: (document.querySelector('.menu-status') || {}).textContent || '',
    })""")


def clean(page, log, label):
    csp = page.evaluate('window.__csp || []')
    errs = errors_of(log)
    failed = log['failed']
    boot = page.evaluate('RLP.bootError')
    unh = page.evaluate('window.__unhandled || 0')
    check(f'{label}：没有 CSP 违规 / 页面错误 / 请求失败 / 未处理拒绝，RLP.bootError 为空',
          not csp and not errs and not failed and boot is None and unh == 0,
          {'csp': csp[:3], 'errors': errs[:3], 'failed': failed[:3], 'bootError': boot, 'unhandled': unh})


def run_game_tests(browser):
    profile = {'v': 1, 'ach': {}, 'cleared': {'plague1': {'t': 1760000000000}}}
    cfg = {
        'buildVersion': 9462004,
        'persist': True,
        'seed': {enc_key('rlp3d.profile'): native_data(legacy_data(profile))},
    }
    ctx, page, log = game_page(browser, cfg)
    assert poll(page, "document.querySelector('.menu.show')", 30), '标题菜单未显示'
    time.sleep(1.0)
    st = game_menu_state(page)
    check('集成：URL 无参数进标题菜单；xhs 里通关第一灾 → 菜单第二灾可玩、第一灾标记通关',
          st['menu'] and st['mode'] == 'xhs' and st['cleared']
          and 'open' in st['classes'][1].split() and 'gated' not in st['classes'][1].split()
          and 'done' in st['classes'][0].split(), st)
    check('集成：xhs 里的 profile 读进游戏（成就 / 通关记录来自 Storage API）', page.evaluate("RLP.ctx.state.clearedAt('plague1')") == 1760000000000)

    # 清空 localStorage，只留模拟 xhs 数据重载：菜单状态不变
    page.evaluate('localStorage.clear()')
    page.reload()
    assert poll(page, 'window.RLP && RLP.ready === true', 240), '重载启动超时'
    assert poll(page, "document.querySelector('.menu.show')", 30), '重载后标题菜单未显示'
    time.sleep(1.0)
    st2 = game_menu_state(page)
    check('集成：清空 localStorage 只保留模拟 xhs 数据重载，菜单状态不变（证明读的是 xhs）',
          st2['mode'] == 'xhs' and st2['cleared']
          and 'open' in st2['classes'][1].split() and 'gated' not in st2['classes'][1].split()
          and 'done' in st2['classes'][0].split()
          and page.evaluate("localStorage.getItem('rlp3d.profile')") is None,
          {'state': st2, 'local profile': page.evaluate("localStorage.getItem('rlp3d.profile')")})
    clean(page, log, '集成（xhs 读档重载）')
    ctx.close()

    # 没有 window.xhs：行为和原来一样（localStorage）
    ctx, page, log = game_page(browser, {'noXhs': True, 'localSeed': {'rlp3d.profile': legacy_data(profile)}})
    assert poll(page, "document.querySelector('.menu.show')", 30), '标题菜单未显示'
    time.sleep(1.0)
    st = game_menu_state(page)
    check('集成：没有 window.xhs 时 mode 是 local，菜单照旧从 localStorage 读通关记录',
          st['mode'] == 'local' and st['cleared'] and 'open' in st['classes'][1].split()
          and 'gated' not in st['classes'][1].split(), st)
    check('集成：没有 window.xhs 时没有启动错误', st['bootError'] is None)
    clean(page, log, '集成（无 xhs）')
    ctx.close()

    # setStorage 全部失败：暂停面板“保存进度”不能说“已保存”
    ctx, page, log = game_page(browser, {'buildVersion': 9462004, 'persist': True, 'failSet': True},
                               'index.html?chapter=1&skipIntro=1&norender=1')
    assert poll(page, "RLP.state.chapter === 'plague1' && RLP.state.saving === true", 120), '第一灾没开始'
    page.evaluate("() => { RLP.ctx.state.setFlag('storage_fail_test', 1); RLP.ctx.state.save(); }")
    page.evaluate('window.__RLP_STORE.flush()')
    s = snap(page)
    check('集成：setStorage 全部失败时 ok() 是 false，存档落在 localStorage 兜底',
          s['mode'] == 'xhs' and s['ok'] is False and s['stats']['failures'] >= 1
          and page.evaluate("localStorage.getItem('rlp3d.save.plague1')") is not None, {'stats': s['stats'], 'ok': s['ok']})
    page.evaluate('RLP.ctx.ui.openSettings()')
    assert poll(page, "!!document.querySelector('.panel')", 10), '暂停面板没打开'
    page.evaluate("""() => {
      const b = [...document.querySelectorAll('.panel .btn')].find(e => e.textContent === '保存进度');
      if (b) b.click();
    }""")
    time.sleep(0.3)
    note = page.evaluate("(document.querySelector('.panel .set-note') || {}).textContent || ''")
    check('集成：setStorage 全部失败时，暂停面板“保存进度”提示不说“已保存”，而是不能保存',
          '已保存' not in note and '不能保存' in note, note)
    check('集成：失败路径没有启动错误', page.evaluate('RLP.bootError') is None)
    clean(page, log, '集成（setStorage 全失败）')
    ctx.close()


# ------------------------------------------------------------------------------ 主流程
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
                                          '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding',
                                          '--disable-background-timer-throttling'])
        for fn in (run_store_tests, run_migration_tests, run_game_tests):
            print(f'--- {fn.__name__} ---', flush=True)
            try:
                fn(browser)
            except Exception as e:      # 一个部分崩了不要拖累后面的
                import traceback
                traceback.print_exc()
                check(f'{fn.__name__} 没有异常', False, str(e)[:300])
        browser.close()
finally:
    srv.shutdown()
    if TMP:
        shutil.rmtree(TMP, ignore_errors=True)

print(f'{sum(results)}/{len(results)} 通过')
sys.exit(0 if all(results) else 1)
