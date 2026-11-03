"""任意一章的通关演示：读这一章自己的 walkthrough（RLP.chapter.walkthrough），把每一步换成真人输入
（标题菜单点章节、WASD 走路、鼠标靠边转身、点击、数字键选物品），同时录屏录音，输出 mp4。
第六到十灾都用它录；第三灾有自己的脚本（dev/plague3/record_plague3_demo.py，按阶段手写），这里复用它的 Demo 类（走路、转身、点击、断言）。

用法（项目根目录）：
  python dev/common/record_walkthrough.py 6                    # 录第六灾，默认 1280x720，输出 dev/plague6/media/demo/plague6-demo.mp4
  python dev/common/record_walkthrough.py 6 7 8 9 10 --size 1920x1080
  python dev/common/record_walkthrough.py 9 --fast             # 只玩不录，停顿清零、过场加速（查流程用）
  python dev/common/record_walkthrough.py 9 --fast --norender  # 云端容器没有 GPU：页面不渲染，只验证“走过去、点得到”的流程

只用公开的玩家输入：鼠标移动 / 点击、键盘 WASD / Shift / 数字键。RLP 只用来读状态（位置、热点的屏幕坐标、是否空闲），不直接触发热点或传送；
唯一的例外是 --lenient（默认开）：某一步真人输入怎么也做不到时，记一条“退回接口”并用 RLP.click / RLP.goto 把这一步补上，视频不会半路停，
报告里会列出所有退回的步骤（要修的地方）。--strict 则一遇到就停下来存现场。

怎么从一步 walkthrough 变成真人动作：
  go 某个开放视图      同一区域里不用动（后面的点击会自己走过去）；要换区域（进出木屋、井下）就找路：走到门口点门；
  go 某个特写视图      在图里找路（点放大热点 / 方向箭头）；原作录像里没有入口的（例如第十灾的拱龛室三个角度，其实在井下漫游里直接点面具）当成“虚拟视图”，
                      后面的 back 跳过；
  click / use          不在能点的视图里就先找路过去；漫游中走到热点前面、转身正对、点击；特写里直接点；用物品先按数字键选中；
  back                 点画面下方的 ▼；combine 连按两个数字键。
"""
import argparse
import json
import math
import sys
import time
import traceback
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'dev' / 'common'))
sys.path.insert(0, str(ROOT / 'dev' / 'plague3'))
from shot import serve                                   # noqa: E402
from demo_recorder import Recorder                       # noqa: E402
from record_plague3_demo import Demo, Fail, HELPERS_JS, DIGIT_KEYS   # noqa: E402

# 找路：把视图连成图。节点 = 一个特写 / 固定视图，或“某个区域里所有开放视图”（open:区域，区域里随便走）；
# 边 = 当前节点里能点的、带 goto 的热点（when 满足），或者特写 / 固定视图的方向箭头。
PLAN_JS = r"""
window.__plan = (() => {
  const c = RLP.ctx, V = c.views, H = c.hotspots, S = c.state, THREE = c.THREE;
  const zoneOf = (id) => V.get(id).zone;
  const nodeOf = (id) => (V.isOpen(id) ? 'open:' + zoneOf(id) : id);
  const curNode = () => (V.freeMode ? 'open:' + V.zone : nodeOf(S.view));
  const whenOk = (h) => { if (!h.when) return true; try { return !!h.when(S, c); } catch { return false; } };
  const edgesFrom = (node) => {
    const out = [];
    if (node.startsWith('open:')) {
      const z = node.slice(5);
      for (const h of H.all()) {
        if (!h.goto || h.free === false || !whenOk(h)) continue;
        if (!h.views.some((v) => V.get(v) && V.isOpen(v) && zoneOf(v) === z)) continue;
        out.push({ to: nodeOf(h.goto), kind: 'hotspot', id: h.id, goto: h.goto });
      }
    } else {
      const sp = V.get(node); if (!sp) return out;
      const n = V.neighbours(sp);
      for (const [dir, to] of [['left', n.left], ['right', n.right], ['up', n.up], ['down', n.back]]) if (to) out.push({ to: nodeOf(to), kind: 'arrow', dir, goto: to });
      for (const h of H.all()) {
        if (!h.goto || !h.views.includes(node) || !whenOk(h)) continue;
        out.push({ to: nodeOf(h.goto), kind: 'hotspot', id: h.id, goto: h.goto });
      }
    }
    return out;
  };
  const route = (from, to) => {
    if (from === to) return [];
    const seen = new Map([[from, null]]), queue = [from];
    while (queue.length) {
      const n = queue.shift();
      for (const e of edgesFrom(n)) {
        if (seen.has(e.to)) continue;
        seen.set(e.to, { prev: n, edge: e });
        if (e.to === to) { const path = []; for (let k = to; seen.get(k); k = seen.get(k).prev) path.unshift(seen.get(k).edge); return path; }
        queue.push(e.to);
      }
    }
    return null;
  };
  // 这个热点现在在哪种场合下能点：roam = 漫游里走近点；direct = 当前特写里直接点；nav = 要先走到别的视图
  const status = (hid) => {
    const h = H.get(hid); if (!h) return { mode: 'unknown' };
    if (V.freeMode && h.free !== false && h.views.some((v) => V.get(v) && V.isOpen(v) && zoneOf(v) === V.zone)) return { mode: 'roam', enabled: H.enabled(hid), when: whenOk(h) };
    if (!V.freeMode && h.views.includes(S.view)) return { mode: 'direct', enabled: H.enabled(hid), when: whenOk(h) };
    return { mode: 'nav', views: h.views, when: whenOk(h) };
  };
  const info = (hid) => {
    c.world.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(H.get(hid).object), s = b.getSize(new THREE.Vector3()), p = b.getCenter(new THREE.Vector3());
    return { c: [p.x, p.y, p.z], r: Math.hypot(s.x, s.z) / 2, h: s.y };
  };
  return { zoneOf, nodeOf, curNode, route, status, info, whenOk };
})();
null;
"""


FAST_SCALE = 20


class Walk(Demo):
    """Demo（走路 / 转身 / 点击 / 选物品 / 断言）+ 按 walkthrough 步骤找路执行。"""

    def __init__(self, page, fast, out_dir, lenient=True):
        super().__init__(page, fast, out_dir)
        self.lenient = lenient
        self.virtual = None            # 走进了“没有入口的特写视图”：后面的 back 跳过
        self.fallbacks = []
        self.step_i = -1

    def install(self):
        super().install()
        self.ev(PLAN_JS)

    # ------------------------------------------------------------ 等待：文档 / 图片弹出来时念一会儿再关
    def settle_once(self, timeout):
        """等过场 / 动画结束。--fast 时把游戏时间一直开快（云端没有 GPU，帧率很低，不开快会超时）。"""
        if self.fast:
            self.ev(f'RLP.timeScale = {FAST_SCALE}')
        self.page.wait_for_function(
            'RLP.ctx.ui.docOpen || (!RLP.ctx.hotspots.busy && !RLP.ctx.views.transitioning && !RLP.ctx.ui.locked)', timeout=timeout)
        self.check_errors()

    def settle(self, timeout=90000):
        self.settle_once(timeout)
        for _ in range(4):
            kind = self.ev('RLP.ctx.ui.docOpen ? "doc" : RLP.ctx.ui.imageOpen ? "image" : RLP.ctx.ui.inspectOpen ? "inspect" : ""')
            if not kind:
                break
            self.rest(2.8)
            self.page.keyboard.press('Escape')
            self.page.wait_for_timeout(30 if self.fast else 450)
            self.settle_once(timeout)

    def select(self, item):
        """选物品前先取消上一件还选着的（同类物品用掉一个后仍是选中状态，直接按另一个数字键会变成“合成”并取消）。"""
        self.wait_ui_free()
        cur = self.ev('RLP.state.selected')
        if cur and cur != item:
            cidx = self.ev('id => RLP.state.inventory.indexOf(id)', cur)
            if cidx >= 0:
                self.page.wait_for_timeout(400)          # 同一个键 350 ms 内连按两次是“查看物品”，不是取消
                self.page.keyboard.press(DIGIT_KEYS[cidx])
                self.page.wait_for_timeout(30 if self.fast else 250)
                if self.ev('RLP.ctx.ui.inspectOpen'):
                    self.page.keyboard.press('Escape')
                    self.page.wait_for_timeout(60)
            if self.ev('RLP.state.selected'):
                self.ev('RLP.state.select(null)')
        for attempt in range(3):
            self.wait_ui_free()
            try:
                return super().select(item)
            except Fail as e:
                if '选中失败' not in str(e) or attempt == 2:
                    raise
                self.rest(0.6)                 # 数字键在界面锁定（旁白 / 动画）时会被忽略，等一下再按

    def wait_ui_free(self, timeout=20000):
        try:
            self.page.wait_for_function('!RLP.ctx.ui.locked && !RLP.ctx.ui.modalOpen', timeout=timeout)
        except Exception:  # noqa: BLE001
            pass

    # ------------------------------------------------------------ 找路 / 到位
    def node(self):
        return self.ev('__plan.curNode()')

    def press_arrow(self, direction):
        if direction == 'down':
            return self.back()
        loc = self.page.locator(f'.arrows > .arrow-{direction}.show')
        if not loc.count():
            self.snapshot('noarrow-' + direction)
            raise Fail(f'没有 {direction} 箭头可点（view={self.view()}）')
        b = loc.first.bounding_box()
        self.glide(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2)
        self.rest(0.25)
        self.press()
        self.settle()
        self.rest(0.8)

    def run_edge(self, e):
        self.say(f'  路径：{e["kind"]} {e.get("id") or e.get("dir")} → {e["goto"]}')
        if e['kind'] == 'arrow':
            self.press_arrow(e['dir'])
        else:
            self.click_in_context(e['id'])

    def navigate_to_node(self, target):
        path = self.ev('([a, b]) => __plan.route(a, b)', [self.node(), target])
        if path is None:
            return False
        for e in path:
            self.run_edge(e)
        return True

    def ensure_context(self, hid):
        """让 hid 能被点到：返回 'roam' / 'direct'。"""
        for _ in range(3):
            st = self.ev('id => __plan.status(id)', hid)
            if st['mode'] in ('roam', 'direct'):
                return st['mode']
            if st['mode'] == 'unknown':
                raise Fail(f'没有这个热点：{hid}')
            # nav：挑一条最短的路
            best = None
            for v in st['views']:
                tgt = self.ev('v => __plan.nodeOf(v)', v)
                path = self.ev('([a, b]) => __plan.route(a, b)', [self.node(), tgt])
                if path is not None and (best is None or len(path) < len(best)):
                    best = path
            if best is None:
                self.snapshot('noroute-' + hid)
                raise Fail(f'找不到去 {hid} 的路：它在 {st["views"]}，现在在 {self.view()}（{self.node()}）')
            for e in best:
                self.run_edge(e)
        raise Fail(f'走了几轮还是点不到 {hid}（view={self.view()}）')

    def roam_click(self, hid, after=0.7, hover=0.28):
        info = self.ev('id => __plan.info(id)', hid)
        p = self.ev('__demo.pose()')
        d_now = math.hypot(p['pos'][0] - info['c'][0], p['pos'][2] - info['c'][2])
        base = max(2.4, min(9.0, info['r'] * 1.1 + 2.0))
        if d_now <= base + 1.2:
            try:                         # 已经站在旁边：转身正对再点
                self.face(*info['c'])
                self.click(hid, hover=hover, after=after)
                return
            except Fail:
                pass
        last = None
        for dist in (base, base * 0.7, base * 1.4, 2.2, 4.0, 6.5):
            try:
                self.approach_click(hid, dist=dist, hover=hover, after=after)
                return
            except Fail as e:
                last = e
        raise Fail(f'走近点击 {hid} 失败：{last}')

    def click_in_context(self, hid, after=0.7, hover=0.28):
        mode = self.ensure_context(hid)
        if mode == 'roam':
            self.roam_click(hid, after=after, hover=hover)
        else:
            self.click(hid, hover=hover, after=after)

    # ------------------------------------------------------------ 步骤
    def do_go(self, view):
        tgt = self.ev('v => __plan.nodeOf(v)', view)
        if tgt == self.node():
            self.virtual = None
            return
        path = self.ev('([a, b]) => __plan.route(a, b)', [self.node(), tgt])
        if path is None:
            self.say(f'  {view} 没有入口（原作录像里的角度）：留在原地，后面的 back 跳过')
            self.virtual = view
            return
        for e in path:
            self.run_edge(e)
        self.virtual = None

    def do_click(self, hid):
        self.ev('RLP.state.select(null)')
        self.click_in_context(hid)

    def do_use(self, item, hid):
        mode = self.ensure_context(hid)       # 先走到位再选物品：路上点的门、箭头不带着选中的物品
        self.select(item)
        if mode == 'roam':
            self.roam_click(hid)
        else:
            self.click(hid, after=0.7)

    def do_combine(self, a, b):
        if self.ev('RLP.state.selected'):
            self.ev('RLP.state.select(null)')
        for item in (a, b):
            idx = self.ev('id => RLP.state.inventory.indexOf(id)', item)
            if idx < 0:
                self.snapshot('nocombine-' + item)
                raise Fail(f'物品栏里没有 {item}：{self.ev("RLP.state.inventory")}')
            self.page.keyboard.press(DIGIT_KEYS[idx])
            self.rest(0.5)
        self.settle()
        self.rest(1.0)

    def check_flag(self, spec):
        key = spec if isinstance(spec, str) else (spec[0] if isinstance(spec, list) else spec.get('key'))
        want = None
        if isinstance(spec, list) and len(spec) > 1:
            want = spec[1]
        elif isinstance(spec, dict) and 'value' in spec:
            want = spec['value']
        ok = self.ev('([k, w]) => w === null ? !!RLP.state.flag(k) : JSON.stringify(RLP.state.flag(k)) === JSON.stringify(w)', [key, want])
        if not ok:
            self.snapshot('flag-' + key)
            raise Fail(f'断言失败：旗标 {key} = {self.ev("k => RLP.state.flag(k)", key)}（想要 {want if want is not None else "为真"}）')

    def run_step(self, step):
        if 'go' in step:
            self.do_go(step['go'])
        elif 'click' in step:
            self.do_click(step['click'])
        elif 'use' in step:
            self.do_use(step['use'], step['on'])
        elif 'combine' in step:
            self.do_combine(*step['combine'])
        elif 'back' in step:
            if self.virtual:
                self.virtual = None
            else:
                self.back()
        elif 'arrow' in step:
            self.press_arrow(step['arrow'])
        elif 'wait' in step:
            self.rest(float(step['wait']) / 1000.0)
        elif 'select' in step:
            self.select(step['select'])
        elif 'expectFlag' in step:
            self.check_flag(step['expectFlag'])
        elif 'expectItem' in step:
            for item in [step['expectItem']] if isinstance(step['expectItem'], str) else step['expectItem']:
                self.has(item)
        elif 'expectNoItem' in step:
            for item in [step['expectNoItem']] if isinstance(step['expectNoItem'], str) else step['expectNoItem']:
                self.need('id => !RLP.state.has(id)', f'不该持有 {item}', item)
        elif 'expectView' in step:
            want = step['expectView']
            if self.ev('v => RLP.ctx.views.isOpen(v)', want):
                return                   # 开放视图里自由走动，逻辑视图只是“上次进入的视图”，不当断言
            if self.view() != want and not self.virtual:
                self.snapshot('view')
                raise Fail(f'应在 {want}，实际 {self.view()}')
        elif 'inspect' in step:
            self.say('  （检视物品：跳过）')
        else:
            raise Fail(f'不认识的步骤 {step}')

    # ------------------------------------------------------------ 真人输入做不到时退回接口补一步
    def fallback(self, step, err):
        self.say(f'  !! 退回接口：{step} —— {str(err)[:160]}')
        self.fallbacks.append({'step': self.step_i, 'what': step, 'error': str(err)[:300]})
        try:
            self.page.keyboard.up('w')
            self.page.keyboard.up('Shift')
        except Exception:  # noqa: BLE001
            pass
        self.ev('RLP.state.select(null)')
        try:
            self._api_step(step)
        except Exception as e:  # noqa: BLE001
            # 真人输入其实已经做成了、只是等待超时（物品已用掉再调接口会报错）：不要让整次录制中断
            if any(k in step for k in ('expectFlag', 'expectItem', 'expectNoItem', 'expectView')):
                raise
            self.say(f'  !! 接口补步也没成功，继续往下：{str(e)[:160]}')
            self.fallbacks[-1]['api_error'] = str(e)[:300]
        self.virtual = None
        self.settle()
        self.rest(0.8)

    def _api_step(self, step):
        self.page.evaluate('''async (step) => {
          const c = RLP.ctx;
          await RLP.idle();
          const need = async (hid) => {
            const h = c.hotspots.get(hid);
            if (!h) throw new Error('没有热点 ' + hid);
            if (!c.hotspots.enabled(hid)) { const v = h.views.find((x) => c.views.get(x)); await RLP.goto(v, { instant: true }); await RLP.idle(); }
          };
          if ('go' in step) { await RLP.goto(step.go, { instant: true }); }
          else if ('click' in step) { await need(step.click); await RLP.click(step.click); }
          else if ('use' in step) { await need(step.on); await RLP.use(step.use, step.on); }
          else if ('combine' in step) { await RLP.combine(step.combine[0], step.combine[1]); }
          else if ('back' in step) { await RLP.back(); }
          else if ('arrow' in step) { await RLP.arrow(step.arrow); }
        }''', step)


def label(step):
    return json.dumps(step, ensure_ascii=False)


def play(n, a, base):
    out_dir = ROOT / 'dev' / f'plague{n}' / 'media' / 'demo'
    out_dir.mkdir(parents=True, exist_ok=True)
    W, H = map(int, a.size.split('x'))
    angle = a.angle or ('d3d11' if sys.platform == 'win32' else 'swiftshader')
    report = {'chapter': n, 'ok': False, 'fallbacks': [], 'mode': 'fast' if a.fast else 'record'}
    with sync_playwright() as p:
        args = ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--ignore-gpu-blocklist']
        if angle == 'swiftshader':
            args += ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
        else:
            args += [f'--use-angle={angle}', '--enable-gpu']
        browser = p.chromium.launch(headless=True, args=args)
        ctx = browser.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1)
        rec = None if a.fast else Recorder(ctx, out_dir / 'rec', size=(W, H))
        page = ctx.new_page()
        page.set_default_timeout(120000)
        if rec:
            rec.attach(page)
        g = Walk(page, a.fast, out_dir, lenient=not a.strict)
        page.on('pageerror', lambda e: g.errors.append('pageerror: ' + str(e)[:300]))
        page.on('console', lambda m: g.errors.append('console.error: ' + m.text[:300]) if m.type == 'error' and 'favicon' not in m.text else None)
        page.on('requestfailed', lambda r: g.errors.append('requestfailed: ' + r.url) if 'favicon' not in r.url else None)
        failed = None
        try:
            url = base + 'index.html?wip=1' + ('&norender=1' if a.norender else '')
            page.goto(url, wait_until='domcontentloaded')
            page.wait_for_function('window.RLP && RLP.ready', timeout=120000)
            g.install()
            g.say(f'打开标题菜单，点第 {n} 灾')
            page.wait_for_selector('.plague', timeout=60000)
            g.rest(3.0)
            tile = page.locator('.plague').nth(n - 1)
            box = tile.bounding_box()
            g.glide(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, 1100)
            g.rest(1.0)
            g.press()
            page.wait_for_function(f'window.RLP && RLP.ready && RLP.chapter && RLP.chapter.number === {n} && RLP.state.view', timeout=180000)
            g.install()
            g.rest(5.5)                                   # 看章节标题
            steps = g.ev('RLP.chapter.walkthrough')
            report['steps'] = len(steps)
            start = a.start_step or 0
            if start:
                raise Fail('--start-step 还没有实现（要先把前面的存档状态垫好）')
            for i, step in enumerate(steps):
                g.step_i = i
                g.say(f'[{i + 1}/{len(steps)}] {label(step)}')
                try:
                    g.check_errors()
                    g.run_step(step)
                except Fail as e:
                    if not g.lenient or 'expect' in str(step):
                        raise
                    g.fallback(step, e)
                except Exception as e:  # noqa: BLE001  页面报错 / 超时
                    if not g.lenient or 'expect' in str(step):
                        raise
                    g.snapshot('exception')
                    g.fallback(step, e)
                    g.errors.clear()
            flag = g.ev('RLP.chapter.completeFlag || ("plague" + RLP.chapter.number + "_complete")')
            g.wait_flag(flag, timeout=120000)
            g.say('通关！等结尾卡')
            g.rest(8.0)
            report['ok'] = True
            report['achievements'] = g.ev('RLP.state.achievements')
        except Exception as e:  # noqa: BLE001
            failed = e
            traceback.print_exc()
            report['error'] = str(e)
            try:
                g.snapshot('exception')
            except Exception:  # noqa: BLE001
                pass
        report['fallbacks'] = g.fallbacks
        report['page_errors'] = g.errors
        report['elapsed'] = round(time.time() - g.t0, 1)
        if rec:
            out = out_dir / (f'plague{n}-demo.mp4' if not failed else f'plague{n}-demo-partial.mp4')
            try:
                report['video'] = rec.finish(out)
                report['video']['path'] = str(out)
            except Exception as e:  # noqa: BLE001
                report['video_error'] = str(e)
        browser.close()
    (out_dir / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'achievements'}, ensure_ascii=False, indent=2), flush=True)
    return report['ok'] and not report['page_errors']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('chapters', nargs='+', type=int, help='要录的章节编号，例如 6 7 8 9 10')
    ap.add_argument('--size', default='1280x720')
    ap.add_argument('--fast', action='store_true', help='不录屏，停顿清零，过场加速')
    ap.add_argument('--norender', action='store_true', help='页面不渲染（云端没有 GPU 时验证流程用）')
    ap.add_argument('--strict', action='store_true', help='真人输入做不到就停下来，不退回接口补一步')
    ap.add_argument('--angle', default=None, help='浏览器的图形后端：d3d11（Windows 默认）/ metal / swiftshader（其他系统默认，慢）')
    ap.add_argument('--start-step', type=int, default=0)
    a = ap.parse_args()
    server, port = serve()
    base = f'http://127.0.0.1:{port}/'
    ok = True
    try:
        for n in a.chapters:
            print(f'===== 第 {n} 灾 =====', flush=True)
            ok = play(n, a, base) and ok
    finally:
        server.shutdown()
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
