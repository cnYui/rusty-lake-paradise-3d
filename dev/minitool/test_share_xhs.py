r"""通关分享（src/core/share.js）的浏览器验收：模拟小红书容器的 window.xhs.miniTool，走结尾卡的“发笔记 / 发评论”。

  A. 网页版（没有 window.xhs）：结尾卡没有分享那一行，自动进入下一灾的倒数照常
  B. 模拟容器（客户端 9.53）：结尾卡出现“发笔记”“发评论”；点“发笔记”取消自动进入，postNote 收到 ≤ 20 字的标题、
     ≤ 1000 字的正文和 writeTempFile 换来的路径；通关卡是 1080×1440 的 JPEG（存到输出目录 share_card_*.jpg）
  C. 同一张结尾卡点“发评论”：interactionOpenApi 收到 post_comment、图片路径、≤ 2 KB 的附加状态、saveToAlbum: false，
     调用时本章存档已经写好（带通关旗标）；两个去向按钮在分享之后照常能点
  D. 客户端 9.48：只有“发笔记”
  E. writeTempFile 失败：笔记直接带 data: 图片，评论只发文字
  F. （给了包目录时）打包后的小工具：容器 CSP、手机竖屏真实触摸点按钮；存档层用模拟的 Storage API，发评论前存档已经交给原生

用法：python dev/minitool/test_share_xhs.py [包目录] [--out 输出目录]
  不给包目录只测网页版源码（项目根目录）；包目录是 build.py 的输出（例如 dev/minitool/dist-audio-release）
"""
import argparse, base64, functools, http.server, json, os, socketserver, struct, sys, threading, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CSP = ("default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
       "font-src 'self'; media-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")
LAUNCH = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

results = []


def check(name, ok, detail=None):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + json.dumps(detail, ensure_ascii=False) if detail is not None else ''), flush=True)


def serve(directory, csp):
    class H(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            if csp:
                self.send_header('Content-Security-Policy', CSP)
            self.send_header('Cache-Control', 'no-store')
            super().end_headers()

        def log_message(self, *a):
            pass

    socketserver.ThreadingTCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(H, directory=directory))
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{srv.server_address[1]}'


def mock_script(build=9530000, temp_fail=False, storage=False):
    """在页面脚本之前注入的 window.xhs：记下每次调用（大图只记长度，原图放 window.__lastTemp）。"""
    return """
(() => {
  const BV = %d, TEMP_FAIL = %s, STORAGE = %s;
  window.__xhsCalls = [];
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
  const rec = (name, o) => window.__xhsCalls.push({ name, t: Date.now(), o });
  const store = new Map();
  window.__xhsStore = store;
  const savedPlague1 = () => {
    let raw = null;
    if (STORAGE) { for (const [k, v] of store) if (/plague1$/.test(k) && /save/.test(k)) raw = JSON.parse(v); }
    else raw = localStorage.getItem('rlp3d.save.plague1');
    try { const d = JSON.parse(raw); return { savedAt: d.savedAt, complete: !!(d.flags && d.flags.plague1_complete) }; } catch (e) { return null; }
  };
  const mt = {
    getLaunchOptions: async () => ({ miniToolEnv: { buildVersion: BV } }),
    writeTempFile: async (o) => {
      rec('writeTempFile', { len: String(o.data).length, head: String(o.data).slice(0, 23) });
      window.__lastTemp = o.data;
      if (TEMP_FAIL) throw { errMsg: 'writeTempFile:fail mock', errCode: 2999 };
      return { errMsg: 'writeTempFile:ok', filePath: 'xhsfile://tmp/card_' + window.__xhsCalls.length + '.jpg' };
    },
    postNote: async (o) => {
      const img = o.mediaInfo && o.mediaInfo.image_resources && o.mediaInfo.image_resources[0];
      rec('postNote', { title: o.title, content: o.content, pageType: o.pageType, url: img ? String(img.url).slice(0, 40) : null, keys: Object.keys(o) });
      return { errMsg: 'postNote:ok' };
    },
    interactionOpenApi: async (o) => {
      rec('interactionOpenApi', { payload: o.payload, saveToAlbum: o.saveToAlbum, keys: Object.keys(o), save: savedPlague1() });
      return { errMsg: 'interactionOpenApi:ok', routed: true, savedToAlbum: false };
    },
  };
  if (STORAGE) Object.assign(mt, {
    setStorage: async ({ key, data }) => { store.set(key, data); return { errMsg: 'setStorage:ok' }; },
    getStorage: async ({ key }) => ({ errMsg: 'getStorage:ok', data: store.has(key) ? store.get(key) : null }),
    getStorageInfo: async () => ({ errMsg: 'getStorageInfo:ok', keys: [...store.keys()], usedBytes: 0, limitBytes: 10485760 }),
    removeStorage: async ({ key }) => { store.delete(key); return { errMsg: 'removeStorage:ok' }; },
  });
  window.xhs = { launchOptions: { miniToolEnv: { buildVersion: BV } }, miniTool: mt };
})();
""" % (build, 'true' if temp_fail else 'false', 'true' if storage else 'false')


def poll(page, expr, timeout=30.0, every=0.25):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if page.evaluate(expr):
                return True
        except Exception:
            pass
        time.sleep(every)
    return False


def calls(page, name):
    return [c['o'] for c in page.evaluate('window.__xhsCalls || []') if c['name'] == name]


def jpeg_size(b):
    """JPEG 的宽高（读 SOF 段）；不是 JPEG 返回 None。"""
    if b[:2] != b'\xff\xd8':
        return None
    i = 2
    while i + 9 < len(b):
        if b[i] != 0xFF:
            i += 1
            continue
        m = b[i + 1]
        if m in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack('>HH', b[i + 5:i + 9])
            return w, h
        i += 2 + struct.unpack('>H', b[i + 2:i + 4])[0]
    return None


def save_card(page, out, name):
    url = page.evaluate('window.__lastTemp || ""')
    if not url.startswith('data:image/jpeg;base64,'):
        return None
    raw = base64.b64decode(url.split(',', 1)[1])
    with open(os.path.join(out, name), 'wb') as f:
        f.write(raw)
    return jpeg_size(raw)


def open_game(browser, base, init=None, mobile=False, norender=True):
    ctx = browser.new_context(**({'viewport': {'width': 390, 'height': 844}, 'is_mobile': True, 'has_touch': True, 'device_scale_factor': 2}
                                 if mobile else {'viewport': {'width': 1280, 'height': 720}}))
    if init:
        ctx.add_init_script(init)
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(f"{base}/index.html?autotest=1{'&norender=1' if norender else ''}")
    ok = poll(page, 'window.RLP && RLP.ready === true', 240)
    boot_err = page.evaluate('RLP.bootError') if ok else 'RLP 没有出现'
    return ctx, page, errs, (ok and not boot_err), boot_err


def show_ending(page):
    """第一灾通关（成就拿 1 个）后弹结尾卡；有下一灾（第二灾）所以会出现“进入第二灾”和倒数。"""
    page.evaluate("""async () => {
      await RLP.start(1, { skipIntro: true });
      RLP.state.achieve('welcome_to_paradise', { zh: '欢迎来到天堂岛' });
      RLP.state.setFlag('plague1_complete');
      RLP.ctx.ui.autoAdvance = true;
      window.__m = 1;   // 页面重载（换章）后这个标记就没了
      window.__e = RLP.ctx.ui.ending({ zh: '第一灾 · 完', en: 'Plague I — complete' });
    }""")
    return poll(page, '!!document.querySelector(".ending.show") && !!window.__e', 30)   # 别直接返回 __e：evaluate 会等这个 Promise


def share_buttons(page):
    return page.evaluate("[...document.querySelectorAll('.ending-share-btn')].map(b => b.dataset.share)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dist', nargs='?', help='打包后的小工具目录（不给就只测源码）')
    ap.add_argument('--out', default=os.path.join(HERE, '_test_out_share'))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    src = serve(ROOT, csp=False)

    with sync_playwright() as p:
        browser = p.chromium.launch(args=LAUNCH)

        # ---------------------------------------------------------------- A. 网页版
        ctx, page, errs, ok, err = open_game(browser, src)
        check('A0 网页版启动（RLP.ready、没有 bootError）', ok, err)
        if ok:
            shown = show_ending(page)
            time.sleep(1.0)
            check('A1 没有 window.xhs：结尾卡没有分享按钮', shown and share_buttons(page) == [] and page.evaluate("document.querySelector('.ending-share').children.length") == 0)
            check('A2 倒数照常（“秒后自动进入第二灾”）', poll(page, "/秒后自动进入第二灾/.test(document.querySelector('.ending-note').textContent)", 30))
            page.evaluate('RLP.ctx.ui.hideEnding()')
        check('A3 网页版没有页面错误', not errs, errs[:3])
        ctx.close()

        # ---------------------------------------------------------------- B / C. 模拟容器，真实渲染
        ctx, page, errs, ok, err = open_game(browser, src, init=mock_script(), norender=False)
        check('B0 模拟容器启动', ok, err)
        if ok:
            shown = show_ending(page)
            check('B1 结尾卡出现“发笔记”“发评论”', shown and poll(page, "document.querySelectorAll('.ending-share-btn').length === 2", 10), share_buttons(page))
            page.evaluate('window.__e')   # 等结尾动画放完（按钮淡入），再点
            page.evaluate("document.querySelector('.ending-share-btn[data-share=note]').click()")
            got = poll(page, "(window.__xhsCalls || []).some(c => c.name === 'postNote')", 60)
            notes = calls(page, 'postNote')
            n = notes[0] if notes else {}
            check('B2 postNote：photo_publish、标题 ≤ 20 字、正文 ≤ 1000 字、图片是 writeTempFile 的路径',
                  got and n.get('pageType') == 'photo_publish' and 0 < len(n.get('title', '')) <= 20 and 0 < len(n.get('content', '')) <= 1000
                  and str(n.get('url', '')).startswith('xhsfile://tmp/'), n)
            check('B3 文案：标题“我通关了锈湖天堂岛第一灾”，正文写了成就 1 / 5，不写打码的“x灾”',
                  n.get('title') == '我通关了锈湖天堂岛第一灾' and '成就 1 / 5' in n.get('content', '') and 'x灾' not in n.get('content', ''), n.get('content'))
            size = save_card(page, a.out, 'share_card_source.jpg')
            check('B4 通关卡是 1080×1440 的 JPEG', size == (1080, 1440), size)
            check('B5 按钮回到可点、提示“发布页已打开”', poll(page, "!document.querySelector('.ending-share-btn').disabled && document.querySelector('.ending-note').textContent === '发布页已打开'", 10),
                  page.evaluate("document.querySelector('.ending-note').textContent"))
            time.sleep(11)   # 倒数 8 秒（游戏时间）早该走完了：点了分享就不自动进入
            check('B6 点了分享就取消自动进入第二灾（页面没换章）', page.evaluate("window.__m === 1 && RLP.state.chapter === 'plague1' && !/秒后自动进入/.test(document.querySelector('.ending-note').textContent)"))

            t_click = page.evaluate('Date.now()')
            page.evaluate("document.querySelector('.ending-share-btn[data-share=comment]').click()")
            got = poll(page, "(window.__xhsCalls || []).some(c => c.name === 'interactionOpenApi')", 60)
            cs = calls(page, 'interactionOpenApi')
            c = cs[0] if cs else {}
            pl = c.get('payload') or {}
            snap = pl.get('miniToolSnapshotInfo') or ''
            check('C1 interactionOpenApi：post_comment、带图片路径、saveToAlbum false',
                  got and pl.get('action') == 'post_comment' and c.get('saveToAlbum') is False and sorted(c.get('keys', [])) == ['payload', 'saveToAlbum']
                  and isinstance(pl.get('media_bean'), list) and pl['media_bean'][0].get('media_type') == 'image'
                  and str(pl['media_bean'][0].get('cover_image_url', '')).startswith('xhsfile://tmp/'), c)
            check('C2 评论文字和附加状态（≤ 2 KB，章节 plague1）', '第一灾' in pl.get('content', '') and len(snap.encode()) <= 2048 and json.loads(snap or '{}').get('chapter') == 'plague1', pl.get('content'))
            sv = c.get('save') or {}
            check('C3 调用评论区时本章存档已经写好（带通关旗标、savedAt 在点按钮之后）', sv.get('complete') is True and (sv.get('savedAt') or 0) >= t_click - 50, sv)
            check('C4 分享之后“返回主菜单”“进入第二灾”还在、能点', page.evaluate("[...document.querySelectorAll('.ending-row .ending-btn')].filter(b => !b.classList.contains('ending-share-btn') && !b.disabled).length === 2"))
        check('B/C 没有页面错误', not errs, errs[:3])
        ctx.close()

        # ---------------------------------------------------------------- D. 客户端 9.48
        ctx, page, errs, ok, err = open_game(browser, src, init=mock_script(build=9480012))
        if ok and show_ending(page):
            time.sleep(0.8)
            check('D1 客户端 9.48：只有“发笔记”', share_buttons(page) == ['note'], share_buttons(page))
            page.evaluate('RLP.ctx.ui.hideEnding()')
        else:
            check('D0 启动', False, err)
        ctx.close()

        # ---------------------------------------------------------------- E. writeTempFile 失败
        ctx, page, errs, ok, err = open_game(browser, src, init=mock_script(temp_fail=True))
        if ok and show_ending(page):
            poll(page, "document.querySelectorAll('.ending-share-btn').length === 2", 10)
            page.evaluate("document.querySelector('.ending-share-btn[data-share=note]').click()")
            poll(page, "(window.__xhsCalls || []).some(c => c.name === 'postNote')", 60)
            notes = calls(page, 'postNote')
            check('E1 换不到临时文件：笔记直接带 data:image/jpeg', bool(notes) and str(notes[0].get('url', '')).startswith('data:image/jpeg'), notes[:1])
            poll(page, "!document.querySelector('.ending-share-btn').disabled", 10)
            page.evaluate("document.querySelector('.ending-share-btn[data-share=comment]').click()")
            poll(page, "(window.__xhsCalls || []).some(c => c.name === 'interactionOpenApi')", 60)
            cs = calls(page, 'interactionOpenApi')
            check('E2 换不到临时文件：评论只发文字（没有 media_bean）', bool(cs) and 'media_bean' not in cs[0]['payload'] and bool(cs[0]['payload'].get('content')), cs[:1])
            time.sleep(10)   # norender 下游戏时钟按真实时间走：8 秒倒数早该走完了
            check('E3 点了分享就不自动进入第二灾（游戏时钟正常走的页面）', page.evaluate("window.__m === 1 && RLP.state.chapter === 'plague1' && !!document.querySelector('.ending.show')"))
        else:
            check('E0 启动', False, err)
        check('D/E 没有页面错误', not errs, errs[:3])
        ctx.close()

        # ---------------------------------------------------------------- F. 打包后的小工具
        if a.dist:
            pkg = serve(os.path.abspath(a.dist), csp=True)
            ctx, page, errs, ok, err = open_game(browser, pkg, init=mock_script(storage=True), mobile=True, norender=False)
            check('F0 小工具包启动（容器 CSP、手机竖屏、RLP.bootError 为空）', ok, err)
            if ok:
                check('F1 存档层用上了模拟的 Storage API', page.evaluate("window.__RLP_STORE && window.__RLP_STORE.mode()") == 'xhs', page.evaluate("window.__RLP_STORE && window.__RLP_STORE.stats"))
                shown = show_ending(page)
                check('F2 结尾卡出现“发笔记”“发评论”', shown and poll(page, "document.querySelectorAll('.ending-share-btn').length === 2", 10), share_buttons(page))
                page.evaluate('window.__e')
                page.tap('.ending-share-btn[data-share=note]')
                got = poll(page, "(window.__xhsCalls || []).some(c => c.name === 'postNote')", 60)
                notes = calls(page, 'postNote')
                check('F3 真实触摸点“发笔记”：postNote 带着临时文件路径', got and str(notes[0].get('url', '')).startswith('xhsfile://tmp/'), notes[:1])
                size = save_card(page, a.out, 'share_card_package.jpg')
                check('F4 包里的通关卡也是 1080×1440 JPEG', size == (1080, 1440), size)
                poll(page, "!document.querySelector('.ending-share-btn').disabled", 10)
                t_click = page.evaluate('Date.now()')
                page.tap('.ending-share-btn[data-share=comment]')
                got = poll(page, "(window.__xhsCalls || []).some(c => c.name === 'interactionOpenApi')", 60)
                cs = calls(page, 'interactionOpenApi')
                sv = (cs[0].get('save') if cs else None) or {}
                check('F5 真实触摸点“发评论”：调用时存档已经交给原生 Storage（带通关旗标）', got and sv.get('complete') is True and (sv.get('savedAt') or 0) >= t_click - 50, sv)
                check('F6 没有 CSP 违规', page.evaluate('window.__csp') == [], page.evaluate('window.__csp'))
            check('F7 小工具包没有页面错误', not errs, errs[:3])
            ctx.close()
        browser.close()

    n_ok = sum(results)
    print(f'\n{n_ok}/{len(results)} 通过')
    sys.exit(0 if n_ok == len(results) else 1)


if __name__ == '__main__':
    main()
