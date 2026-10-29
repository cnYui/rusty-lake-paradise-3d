"""第三灾通关演示：像真人一样玩一遍（标题菜单点章节、WASD 走路、鼠标靠边转身、点击、数字键选物品），
同时录屏录音，输出 mp4。玩的过程中任何一步卡住、断言失败或页面报错都会停下并存现场（截图 + RLP.info）。

用法：
  python dev/plague3/record_plague3_demo.py                    # 录制，默认 1280x720，输出 dev/plague3/media/demo/
  python dev/plague3/record_plague3_demo.py --size 1920x1080
  python dev/plague3/record_plague3_demo.py --fast             # 只玩不录，停顿清零、过场加速（查 bug 用）

只用公开的玩家输入：鼠标移动 / 点击、键盘 WASD / Shift / 数字键。RLP 只用来读状态（位置、热点的屏幕坐标、是否空闲），
从不直接触发热点或传送。
"""
import argparse
import json
import math
import sys
import time
import traceback
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'common'))
from shot import serve                      # noqa: E402
from demo_recorder import Recorder          # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'dev' / 'plague3' / 'media' / 'demo'
DIGIT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=']

# 注入页面的只读辅助：热点的屏幕坐标、玩家位姿、A* 找路（只看碰撞，和玩家能不能走完全一致）
HELPERS_JS = r"""
window.__demo = (() => {
  const c = RLP.ctx, V = c.views, THREE = c.THREE;
  const pose = () => { const r = V.roamInfo(); return { free: V.freeMode, view: c.state.view, zone: V.zone, pos: r.pos, yaw: r.yaw, pitch: r.pitch, active: r.active }; };
  const rect = () => { const r = c.engine.canvas.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
  const objCenter = (id) => {
    c.world.root.updateMatrixWorld(true);
    const o = c.hotspots.get(id).object, b = new THREE.Box3().setFromObject(o), p = new THREE.Vector3();
    b.getCenter(p);
    return [p.x, p.y, p.z];
  };
  const target = (id) => {
    const spec = c.hotspots.get(id);
    if (!spec || !c.hotspots.enabled(id)) throw new Error('热点不可用：' + id);
    c.world.root.updateMatrixWorld(true); c.engine.camera.updateMatrixWorld(true);
    const rc = c.engine.canvas.getBoundingClientRect(), points = [];
    const sample = (o) => {
      const b = new THREE.Box3().setFromObject(o), p = new THREE.Vector3(); if (b.isEmpty()) return;
      for (const z of [.5, .2, .8]) for (const x of [.5, .25, .75, .1, .9]) for (const y of [.5, .25, .75, .1, .9]) {
        p.set(b.min.x + (b.max.x - b.min.x) * x, b.min.y + (b.max.y - b.min.y) * y, b.min.z + (b.max.z - b.min.z) * z); points.push(p.clone());
      }
      b.getCenter(p); points.unshift(p.clone());
    };
    sample(spec.object); spec.object.traverse((o) => { if (o.isMesh && o.visible) sample(o); });
    // 细小 / 镜头会微偏的物体：挑周围一圈也能点到的位置（像人会点在物体中间而不是边缘）
    const R = Math.max(5, rc.width / 200), ring = [];
    for (let a = 0; a < 8; a++) ring.push([Math.cos(a * Math.PI / 4) * R, Math.sin(a * Math.PI / 4) * R]);
    let best = null, bestScore = -1, tried = 0;
    for (const p of points) {
      if (tried >= 10) break;
      p.project(c.engine.camera);
      if (p.z > 1 || p.z < -1 || Math.abs(p.x) > .95 || Math.abs(p.y) > .92) continue;
      const x = rc.left + (p.x + 1) * rc.width / 2, y = rc.top + (1 - p.y) * rc.height / 2;
      if (c.hotspots.pickAt(x, y)?.spec.id !== id || document.elementFromPoint(x, y) !== c.engine.canvas) continue;
      tried++;
      let score = 0;
      for (const [dx, dy] of ring) if (c.hotspots.pickAt(x + dx, y + dy)?.spec.id === id) score++;
      if (score > bestScore) { best = { x, y }; bestScore = score; if (score >= ring.length - 1) break; }
    }
    if (best) return best;
    throw new Error('画面中找不到可点击的位置：' + id + '（视图 ' + c.state.view + '）');
  };
  const ok = (x, z) => V.canStand(x, z) && V.canStand(x + .22, z) && V.canStand(x - .22, z) && V.canStand(x, z + .22) && V.canStand(x, z - .22);
  const plan = (sx, sz, tx, tz) => {
    const inside = V.zone && V.zone !== 'exterior', m = inside ? 3 : 30, S = .5;
    const x0 = Math.min(sx, tx) - m, z0 = Math.min(sz, tz) - m;
    const nx = Math.ceil((Math.abs(sx - tx) + 2 * m) / S) + 1, nz = Math.ceil((Math.abs(sz - tz) + 2 * m) / S) + 1;
    const cell = new Int8Array(nx * nz);
    const free = (i, j) => { if (i < 0 || j < 0 || i >= nx || j >= nz) return false; const k = i * nz + j; if (!cell[k]) cell[k] = ok(x0 + i * S, z0 + j * S) ? 1 : 2; return cell[k] === 1; };
    const snap = (x, z) => {
      const bi = Math.round((x - x0) / S), bj = Math.round((z - z0) / S);
      if (free(bi, bj)) return [bi, bj];
      for (let r = 1; r < 14; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; if (free(bi + di, bj + dj)) return [bi + di, bj + dj]; }
      return null;
    };
    const s = snap(sx, sz), g = snap(tx, tz); if (!s || !g) return null;
    const gs = new Float32Array(nx * nz).fill(1e9), came = new Int32Array(nx * nz).fill(-1), heap = [];
    const hp = (a) => { heap.push(a); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const hq = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m2 = i; if (l < heap.length && heap[l][0] < heap[m2][0]) m2 = l; if (r < heap.length && heap[r][0] < heap[m2][0]) m2 = r; if (m2 === i) break; [heap[m2], heap[i]] = [heap[i], heap[m2]]; i = m2; } } return top; };
    const sk = s[0] * nz + s[1], gk = g[0] * nz + g[1];
    gs[sk] = 0; hp([0, sk]);
    const hh = (k) => Math.hypot(Math.floor(k / nz) - g[0], (k % nz) - g[1]);
    let found = false;
    while (heap.length) {
      const [, k] = hq();
      if (k === gk) { found = true; break; }
      const ki = Math.floor(k / nz), kj = k % nz;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const i = ki + di, j = kj + dj;
        if (!free(i, j)) continue;
        if (di && dj && !(free(ki + di, kj) && free(ki, kj + dj))) continue;
        const nk = i * nz + j, ng = gs[k] + (di && dj ? 1.414 : 1);
        if (ng < gs[nk]) { gs[nk] = ng; came[nk] = k; hp([ng + hh(nk), nk]); }
      }
    }
    if (!found) return null;
    const path = []; for (let k = gk; k !== -1; k = came[k]) path.push([x0 + Math.floor(k / nz) * S, z0 + (k % nz) * S]);
    path.reverse();
    const los = (a, b) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .3); for (let i = 1; i <= n; i++) { const t = i / n; if (!ok(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false; } return true; };
    const out = []; let a = [sx, sz], i = 0;
    while (i < path.length - 1) {
      let j = path.length - 1;
      while (j > i + 1 && !los(a, path[j])) j--;
      out.push(path[j]); a = path[j]; i = j;
    }
    if (!out.length) out.push(path[path.length - 1]);
    if (ok(tx, tz) && los(out.length > 1 ? out[out.length - 2] : [sx, sz], [tx, tz])) out[out.length - 1] = [tx, tz];
    return out;
  };
  // 绕着物体取一圈能站的位置（离玩家近的在前）
  const approach = (id, dist) => {
    const T = objCenter(id), p = pose().pos, base = Math.atan2(p[0] - T[0], p[2] - T[2]), cands = [];
    for (const d of [dist, dist + 1, dist - .7, dist + 2.5, dist + 4])
      for (const da of [0, .3, -.3, .6, -.6, .9, -.9, 1.3, -1.3, 1.8, -1.8, 2.4, -2.4, 3.14]) {
        const a = base + da, x = T[0] + Math.sin(a) * d, z = T[2] + Math.cos(a) * d;
        if (d > 1 && ok(x, z)) cands.push([x, z]);
      }
    return { T, cands: cands.slice(0, 14) };
  };
  return { pose, rect, objCenter, target, plan, approach, ok };
})();
null;
"""


class Fail(Exception):
    pass


class Demo:
    def __init__(self, page, fast, out_dir):
        self.page = page
        self.fast = fast
        self.out_dir = out_dir
        self.t0 = time.time()
        self.mx = self.my = None
        self.rect = None
        self.errors = []
        self.log = []
        self.fail_n = 0

    # ------------------------------------------------------------ 基础
    def say(self, msg):
        line = f'[{time.time() - self.t0:6.1f}s] {msg}'
        self.log.append(line)
        print(line, flush=True)

    def rest(self, sec):
        if not self.fast and sec > 0:
            self.page.wait_for_timeout(int(sec * 1000))
        elif self.fast:
            self.page.wait_for_timeout(1)

    def ev(self, js, arg=None):
        return self.page.evaluate(js, arg) if arg is not None else self.page.evaluate(js)

    def install(self):
        self.page.wait_for_function('window.RLP && RLP.ready && RLP.ctx && RLP.state', timeout=120000)
        if self.ev('RLP.bootError'):
            raise Fail('启动报错：' + str(self.ev('String(RLP.bootError)')))
        self.ev(HELPERS_JS)
        self.ev('RLP.ctx.ui.autoAdvance = false')      # 第四灾已开放：结尾卡的倒数会自动重载进第四灾，录像 / 断言要停在第三灾结尾
        self.refresh_rect()
        if self.mx is None:
            self.mx = self.rect['left'] + self.rect['width'] / 2
            self.my = self.rect['top'] + self.rect['height'] / 2

    def refresh_rect(self):
        # 画布有 CSS 入场动画，动画没结束时尺寸 / 位置是变化的，不能当稳定坐标
        # 只等有限时长的动画（菜单里有无限循环的动画，finished 永远不会 resolve），并给个上限
        self.ev('''async () => {
          const fin = document.getAnimations().filter((a) => { const t = a.effect && a.effect.getComputedTiming(); return t && Number.isFinite(t.endTime); });
          await Promise.race([Promise.all(fin.map((a) => a.finished.catch(() => 0))), new Promise((r) => setTimeout(r, 4000))]);
        }''')
        self.rect = self.ev('__demo.rect()')

    def snapshot(self, tag):
        self.fail_n += 1
        base = self.out_dir / f'fail-{self.fail_n:02d}-{tag}'
        try:
            self.page.screenshot(path=str(base) + '.png')
            info = self.ev('({info: RLP.info(), pose: __demo.pose()})')
            Path(str(base) + '.json').write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding='utf-8')
        except Exception as e:  # noqa: BLE001
            print('保存现场失败：', e, flush=True)
        return base

    def check_errors(self):
        if self.errors:
            raise Fail('页面报错：' + ' | '.join(self.errors[:3]))

    # ------------------------------------------------------------ 鼠标
    def glide(self, x, y, ms=None):
        """鼠标平滑移到 (x, y)（逐帧 move，视频里看得见移动）。"""
        if self.mx is None:
            self.mx, self.my = x, y
        dist = math.hypot(x - self.mx, y - self.my)
        if self.fast or dist < 2:
            self.page.mouse.move(x, y)
            self.mx, self.my = x, y
            return
        ms = ms if ms is not None else min(900, 220 + dist * 0.9)
        n = max(3, int(ms / 16))
        x0, y0 = self.mx, self.my
        for i in range(1, n + 1):
            k = i / n
            k = k * k * (3 - 2 * k)
            self.page.mouse.move(x0 + (x - x0) * k, y0 + (y - y0) * k)
            self.page.wait_for_timeout(16)
        self.mx, self.my = x, y

    def press(self):
        self.page.mouse.down()
        self.page.wait_for_timeout(1 if self.fast else 45)
        self.page.mouse.up()

    def center(self):
        r = self.rect
        return r['left'] + r['width'] / 2, r['top'] + r['height'] / 2

    def recenter(self, ms=260):
        cx, cy = self.center()
        self.glide(cx, cy, ms)

    # ------------------------------------------------------------ 等待
    def settle(self, timeout=90000):
        if self.fast:
            self.ev('RLP.timeScale = 6')
        try:
            self.page.wait_for_function(
                'RLP.ctx.ui.docOpen || (!RLP.ctx.hotspots.busy && !RLP.ctx.views.transitioning && !RLP.ctx.ui.locked)', timeout=timeout)
        finally:
            if self.fast:
                self.ev('RLP.timeScale = 1')
        self.check_errors()

    def wait_flag(self, key, timeout=60000):
        self.page.wait_for_function('k => !!RLP.state.flag(k)', arg=key, timeout=timeout)

    # ------------------------------------------------------------ 点击 / 物品
    def stable_target(self, hid, tol=1.2, timeout=4.0):
        """等目标在屏幕上的位置停稳（镜头惯性、特写里的小幅偏转都会让它在动）。"""
        t_end = time.time() + timeout
        err = ''
        misses = 0
        while time.time() < t_end:
            try:
                a = self.ev('id => __demo.target(id)', hid)
                self.page.wait_for_timeout(90)
                b = self.ev('id => __demo.target(id)', hid)
            except Exception as e:  # noqa: BLE001
                err = str(e).splitlines()[0]
                misses += 1
                if misses >= 3:
                    break
                self.page.wait_for_timeout(120)
                continue
            if math.hypot(a['x'] - b['x'], a['y'] - b['y']) <= tol:
                return b
            err = '位置一直在动'
        raise Fail(f'点不到 {hid}：{err}')

    def click(self, hid, hover=0.28, after=0.7):
        """在当前画面里点热点：等它停稳，移到物体上，确认指针下确实是它再按下。"""
        last = ''
        for attempt in range(6):
            try:
                pt = self.stable_target(hid)
            except Fail as e:
                last = str(e)
                if attempt < 3 and self.ev('__demo.pose().free'):
                    self.face(*self.ev('id => __demo.objCenter(id)', hid))      # 目标不在画面里：转身找它
                continue
            self.glide(pt['x'], pt['y'], None if attempt == 0 else 140)
            self.page.wait_for_timeout(int(hover * 1000) if (attempt == 0 and not self.fast) else 70)
            on = self.ev('([id, x, y]) => { const h = RLP.ctx.hotspots.pickAt(x, y); return !!h && h.spec.id === id; }', [hid, self.mx, self.my])
            if on:
                break
            last = f'指针 ({self.mx:.0f},{self.my:.0f}) 下不是 {hid}'
        else:
            self.snapshot('click-' + hid)
            raise Fail(f'点不到 {hid}：{last}')
        self.press()
        self.settle()
        self.rest(after)

    def select(self, item):
        idx = self.ev('id => RLP.state.inventory.indexOf(id)', item)
        if idx < 0:
            self.snapshot('noitem-' + item)
            raise Fail(f'物品栏里没有 {item}：{self.ev("RLP.state.inventory")}')
        if self.ev('RLP.state.selected') == item:
            return                      # 同类物品用掉一个后仍是选中状态，再按一次数字键反而会取消
        self.page.keyboard.press(DIGIT_KEYS[idx])
        if self.ev('RLP.state.selected') != item:
            raise Fail(f'选中失败：想选 {item}，实际 {self.ev("RLP.state.selected")}')
        self.rest(0.55)

    def use(self, item, hid, **kw):
        self.select(item)
        self.click(hid, **kw)

    def back(self, after=0.8):
        """点画面下方的 ▼ 返回。"""
        loc = self.page.locator('.arrows > .arrow-down.show')
        if not loc.count():
            self.snapshot('noback')
            raise Fail('没有 ▼ 箭头可点（view=' + str(self.ev('RLP.state.view')) + '）')
        b = loc.first.bounding_box()
        self.glide(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2)
        self.rest(0.25)
        self.press()
        self.settle()
        self.rest(after)

    def view(self):
        return self.ev('RLP.state.view')

    # ------------------------------------------------------------ 视角 / 走路
    @staticmethod
    def _inv(rate, maxrate, dead):
        a = abs(rate) / maxrate
        if a < 0.004:
            return 0.0
        return math.copysign(dead + (0.98 - dead) * math.sqrt(min(a, 1.0)), rate)

    def _aim_mouse(self, ryaw, rpitch):
        r = self.rect
        nx = self._inv(ryaw, 2.4, 0.38)
        ny = -self._inv(rpitch, 1.1, 0.5)
        x = r['left'] + (nx + 1) / 2 * r['width']
        y = r['top'] + (ny + 1) / 2 * r['height']
        self.page.mouse.move(x, y)
        self.mx, self.my = x, y

    @staticmethod
    def _wrap(a):
        return math.atan2(math.sin(a), math.cos(a))

    def face(self, tx, ty, tz, timeout=9.0):
        """用鼠标靠边转身 / 抬头低头，直到正对世界点 (tx,ty,tz)。"""
        self.refresh_rect()
        t_end = time.time() + timeout
        stable = 0
        while time.time() < t_end:
            p = self.ev('__demo.pose()')
            dx, dz = tx - p['pos'][0], tz - p['pos'][2]
            yaw_t = math.atan2(dx, -dz)
            horiz = math.hypot(dx, dz)
            pitch_t = max(-0.85, min(0.4, math.atan2(ty - p['pos'][1], max(horiz, .5))))
            ey, ep = self._wrap(yaw_t - p['yaw']), pitch_t - p['pitch']
            if abs(ey) < 0.015 and abs(ep) < 0.03:
                stable += 1
                if stable >= 3:
                    break
            else:
                stable = 0
            ryaw = max(-2.2, min(2.2, 2.3 * ey))
            rpitch = max(-1.0, min(1.0, 2.6 * ep))
            self._aim_mouse(ryaw, rpitch)
            self.page.wait_for_timeout(30)
        self.recenter(200)
        self.page.wait_for_timeout(350)       # 鼠标回到中间后，转动还有惯性

    def level_view(self, pitch=-0.1):
        p = self.ev('__demo.pose()')
        if abs(p['pitch'] - pitch) < 0.08:
            return
        t_end = time.time() + 4
        while time.time() < t_end:
            p = self.ev('__demo.pose()')
            ep = pitch - p['pitch']
            if abs(ep) < 0.04:
                break
            self._aim_mouse(0, max(-1.0, min(1.0, 2.6 * ep)))
            self.page.wait_for_timeout(30)
        self.recenter(200)

    def walk_path(self, path, run=False, final_tol=0.45):
        self.refresh_rect()
        kb = self.page.keyboard
        if run:
            kb.down('Shift')
        w_down = False
        try:
            for wi, (wx, wz) in enumerate(path):
                last = wi == len(path) - 1
                tol = final_tol if last else 0.9
                stuck_t, stuck_d = time.time(), None
                while True:
                    p = self.ev('__demo.pose()')
                    dx, dz = wx - p['pos'][0], wz - p['pos'][2]
                    dist = math.hypot(dx, dz)
                    coast = (0.75 if run else 0.5) if last else 0
                    if dist < tol + coast:
                        break
                    yaw_t = math.atan2(dx, -dz)
                    ey = self._wrap(yaw_t - p['yaw'])
                    ep = -0.1 - p['pitch']
                    self._aim_mouse(max(-2.2, min(2.2, 2.3 * ey)), max(-1.0, min(1.0, 2.6 * ep)) if abs(ep) > .05 else 0)
                    want_w = abs(ey) < (0.6 if dist > 2 else 0.35)
                    if want_w and not w_down:
                        kb.down('w'); w_down = True
                    elif not want_w and w_down:
                        kb.up('w'); w_down = False
                    if stuck_d is None or dist < stuck_d - 0.35:
                        stuck_d, stuck_t = dist, time.time()
                    elif time.time() - stuck_t > 3.5:
                        raise Fail(f'走路被卡住：位置 {p["pos"]}，目标 ({wx:.1f},{wz:.1f})，剩 {dist:.1f} m')
                    self.page.wait_for_timeout(25)
        finally:
            if w_down:
                kb.up('w')
            if run:
                kb.up('Shift')
            self.recenter(180)
        self.page.wait_for_timeout(1 if self.fast else 350)

    def walk_to(self, x, z, run=None, final_tol=0.45):
        for attempt in range(3):
            p = self.ev('__demo.pose()')
            path = self.ev('([a,b,c,d]) => __demo.plan(a,b,c,d)', [p['pos'][0], p['pos'][2], x, z])
            if not path:
                raise Fail(f'找不到路：({p["pos"][0]:.1f},{p["pos"][2]:.1f}) → ({x:.1f},{z:.1f})')
            total = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip([[p['pos'][0], p['pos'][2]]] + path, path))
            try:
                self.walk_path(path, run=(total > 14) if run is None else run, final_tol=final_tol)
                return
            except Fail as e:
                if '卡住' not in str(e) or attempt == 2:
                    self.snapshot('walk')
                    raise
                self.say('  走路被卡，重新找路：' + str(e))

    def approach_click(self, hid, dist=3.0, hover=0.28, after=0.7, pre=None):
        """走到离热点 dist 米的位置，转身正对它，点击。"""
        info = self.ev('([id, d]) => __demo.approach(id, d)', [hid, dist])
        T = info['T']
        last_err = None
        for cand in info['cands']:
            try:
                p = self.ev('__demo.pose()')
                if math.hypot(cand[0] - p['pos'][0], cand[1] - p['pos'][2]) > 0.6:
                    self.walk_to(cand[0], cand[1])
                self.face(*T)
                if pre:
                    pre()
                self.click(hid, hover=hover, after=after)
                return
            except Fail as e:
                last_err = e
                if '点不到' in str(e) or '走路' in str(e) or '找不到路' in str(e):
                    self.say(f'  换个站位再试 {hid}：{str(e)[:60]}')
                    continue
                raise
        raise Fail(f'走近点击 {hid} 失败：{last_err}')

    def face_click(self, hid, hover=0.28, after=0.7):
        """原地转身正对热点后点击（室内出门等）。"""
        T = self.ev('id => __demo.objCenter(id)', hid)
        self.face(*T)
        self.click(hid, hover=hover, after=after)

    # ------------------------------------------------------------ 断言
    def need(self, cond_js, what, arg=None):
        ok = self.ev(cond_js, arg) if arg is not None else self.ev(cond_js)
        if not ok:
            self.snapshot('assert')
            raise Fail('断言失败：' + what + ' ' + json.dumps(self.ev('({inv: RLP.state.inventory, flags: RLP.state.flags})'), ensure_ascii=False))

    def has(self, item):
        self.need('id => RLP.state.has(id)', f'应持有 {item}', item)

    def flag(self, key):
        self.need('k => !!RLP.state.flag(k)', f'应有旗标 {key}', key)


# ====================================================================================== 剧情
# 玩法顺序见 docs/plague3_design.md 第 8 节；每一步都走真实的鼠标 / 键盘输入（approach_click = 走过去、转身、点击）。
def intro(g):
    g.say('打开标题菜单')
    g.page.wait_for_selector('.plague', timeout=60000)
    g.rest(3.0)
    tile = g.page.locator('.plague').nth(2)
    box = tile.bounding_box()
    g.glide(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, 1100)
    g.rest(1.0)
    g.say('点“第三灾”')
    g.press()
    g.page.wait_for_function('window.RLP && RLP.ready && RLP.chapter && RLP.chapter.number === 3 && RLP.state.view', timeout=120000)
    g.install()
    g.rest(5.5)                                   # 看标题“第三灾 / 蚊灾和虱灾”
    g.say('点岛进入海滩')
    g.click('overview_island', hover=0.5, after=0.5)
    g.settle()
    g.rest(1.5)
    if g.view() != 'beach_mid':
        raise Fail('点岛后应在 beach_mid，实际 ' + g.view())


def in_view(g, view):
    if g.view() != view:
        raise Fail(f'应进入 {view}，实际 {g.view()}')


def phase_swatter(g):
    g.say('海滩：左石上的苍蝇拍')
    g.approach_click('p3_rock_left_zoom', dist=3.4, after=1.0)
    in_view(g, 'p3_rock_left')
    g.click('p3_swatter', after=1.0)
    g.has('p3_swatter')
    g.back()


def phase_shovel(g):
    g.say('石屋：桌边的铲子')
    g.approach_click('house_entry', dist=4.2, after=1.0)
    in_view(g, 'house_int')
    g.approach_click('p3_shovel', dist=1.7, after=1.0)
    g.has('p3_shovel')
    g.say('  出门')
    g.face_click('house_exit', after=1.0)


def phase_lake(g):
    g.say('湖岸：苍蝇拍给 Margaret，拿死蚊子；木桩上的蜗牛和斧子')
    g.approach_click('p3_margaret', dist=3.6, after=1.0)
    in_view(g, 'p3_margaret')
    g.use('p3_swatter', 'p3_margaret', after=0.5)
    g.page.wait_for_function('RLP.state.flag("p3_margaret_swatted") && !RLP.ctx.ui.locked', timeout=60000)
    g.rest(1.2)
    g.click('p3_gnats_item', after=1.0)
    g.has('p3_gnats')
    g.back()
    g.approach_click('p3_stump_zoom', dist=2.8, after=1.0)
    in_view(g, 'p3_stump')
    g.click('p3_snail', after=0.9)
    g.click('p3_axe', after=0.9)
    g.has('p3_snail')
    g.has('p3_axe')
    g.back()


def phase_scissors(g):
    g.say('神殿：凳子上的剪刀')
    g.approach_click('temple_entry', dist=4.5, after=1.0)
    in_view(g, 'temple_int')
    g.click('p3_scissors_item', after=1.0)
    g.has('p3_scissors')
    g.back(after=1.2)


def phase_hive_and_clay(g):
    g.say('水泵空地：蜂巢的蜜蜂顺序，拿蜂蜜；土堆挖黏土')
    g.approach_click('p3_hive_zoom', dist=5.0, after=1.0)
    in_view(g, 'p3_hive')
    order = g.ev('RLP.ctx.p3.puzzles.HIVE_ORDER')
    g.click('p3_hive_hole_0', hover=0.4, after=1.6)          # 第一只蜜蜂从某个洞飞出来
    for h in order[:6]:
        g.click(f'p3_hive_hole_{h}', hover=0.3, after=1.2)   # 点蜜蜂飞出来的那个洞
    g.flag('p3_honey_ready')
    g.rest(1.5)
    g.click('p3_hive_honey', after=1.0)
    g.has('p3_honey')
    g.back()
    g.approach_click('p3_mound_zoom', dist=2.6, after=1.0)
    in_view(g, 'p3_mound')
    g.use('p3_shovel', 'p3_mound_dig', after=1.2)
    g.click('p3_clay_0', after=0.9)
    g.click('p3_clay_1', after=0.9)
    g.back()


def phase_flytrap_first(g):
    g.say('白树空地：捕蝇草吃蚊子和蜗牛')
    g.approach_click('p3_flytrap_zoom', dist=3.4, after=1.0)
    in_view(g, 'p3_flytrap')
    g.use('p3_gnats', 'p3_flytrap', after=1.0)
    g.use('p3_snail', 'p3_flytrap', after=1.0)
    g.back()


def phase_barber(g):
    g.say('石屋：Ida 和 Gerard 理发，剪刀、剪发、剪耳朵')
    g.approach_click('house_entry', dist=4.2, after=1.0)
    g.approach_click('p3_ida_zoom', dist=2.4, after=1.0)
    in_view(g, 'p3_barber')
    g.click('p3_ida', after=1.5)                              # 她说话
    g.use('p3_scissors', 'p3_ida', after=1.2)
    for i in range(3):
        g.say(f'  剪第 {i + 1} 刀')
        g.click('p3_gerard_hair', after=1.0)
    g.say('  再点一次：剪耳朵')
    g.click('p3_gerard_hair', after=1.5)
    g.flag('p3_ear_cut')
    g.click('p3_ear_item', after=1.0)
    g.has('p3_ear')
    g.say('  头顶的墨线地图')
    g.click('p3_gerard_hair', after=1.0)
    in_view(g, 'p3_scalp')
    g.rest(2.0)
    g.back()
    g.back(after=1.0)


def phase_wheel(g):
    g.say('石屋：陶轮做两只花瓶')
    g.approach_click('p3_wheel_zoom', dist=2.6, after=1.0)
    in_view(g, 'p3_wheel')
    for kind in ('slim', 'urn'):
        g.use('p3_clay', 'p3_wheel_place', after=1.0)
        for s in g.ev('k => RLP.ctx.p3.puzzles.potRecipe(k)', kind):
            g.click(f'p3_pot_seg_{s}', hover=0.2, after=0.7)
        g.flag(f'p3_vase_{kind}_made')
        g.rest(0.8)
    g.has('p3_vase_slim')
    g.has('p3_vase_urn')
    g.back()
    g.face_click('house_exit', after=1.0)


def phase_beach_box(g):
    g.say('海滩：撬贻贝、挖 X、滑块盒')
    g.approach_click('p3_rock_right_zoom', dist=3.4, after=1.0)
    in_view(g, 'p3_rock_right')
    g.click('p3_mussel', after=1.0)                           # 粘得很牢
    g.use('p3_shovel', 'p3_mussel', after=1.2)
    g.click('p3_mussel', after=1.2)
    g.has('p3_mussel')
    g.back()
    g.approach_click('p3_dig_x', dist=2.8, after=1.0)
    in_view(g, 'p3_dig')
    g.use('p3_shovel', 'p3_dig_spot', after=1.4)
    g.flag('p3_x_dug')
    g.click('p3_box', after=1.2)
    in_view(g, 'p3_slider')
    g.rest(1.5)
    for i in g.ev('RLP.ctx.p3.puzzles.sliderSolve()'):
        g.click(f'p3_cell_{i}', hover=0.15, after=0.4)
    g.flag('p3_slider_solved')
    g.rest(1.0)
    g.click('p3_box_latch', after=1.5)
    g.click('p3_box_bulb', after=1.0)
    g.has('p3_bulb')
    g.back()
    g.back(after=1.0)


def phase_flytrap_second(g):
    g.say('白树空地：贻贝和耳朵，捕蝇草开花')
    g.approach_click('p3_flytrap_zoom', dist=3.4, after=1.0)
    in_view(g, 'p3_flytrap')
    g.use('p3_mussel', 'p3_flytrap', after=1.0)
    g.use('p3_ear', 'p3_flytrap', after=1.0)
    g.flag('p3_flower_bloomed')
    g.rest(1.0)
    g.click('p3_flytrap_flower', after=1.0)
    g.has('p3_flower_yellow')
    g.back()


def phase_tree(g):
    g.say('白树空地：斧子砍红叉树，进白桦林')
    g.approach_click('p3_xtree_zoom', dist=4.2, after=1.0)
    in_view(g, 'p3_x_tree')
    for i in range(3):
        g.use('p3_axe', 'p3_xtree_chop', after=1.0)
    g.flag('p3_xtree_felled')
    g.rest(1.5)
    in_view(g, 'forest_clearing')
    g.approach_click('p3_grove_entry', dist=3.5, after=1.0)
    in_view(g, 'p3_grove')
    g.rest(1.5)


def phase_grove_first(g):
    g.say('白桦林：浆果、桦树汁、David 的桌子、幼虫、神龛')
    g.approach_click('p3_berry_zoom', dist=2.2, after=1.0)
    in_view(g, 'p3_berries')
    g.click('p3_berry_pick', after=1.0)
    g.has('p3_berries')
    g.back()
    g.approach_click('p3_birch_zoom', dist=2.6, after=1.0)
    in_view(g, 'p3_birch')
    g.use('p3_axe', 'p3_birch_tap', after=1.5)
    g.click('p3_jug', after=1.2)
    g.has('p3_sap')
    g.rest(0.8)
    g.click('p3_cocoon', after=1.5)                           # 茧里飞出蝴蝶
    g.back()
    g.approach_click('p3_david_zoom', dist=3.2, after=1.0)
    in_view(g, 'p3_david')
    g.click('p3_david', after=1.5)                            # “我今天血糖非常低.”
    g.use('p3_berries', 'p3_table_bowl', after=1.0)
    g.use('p3_sap', 'p3_table_cup', after=1.0)
    g.use('p3_honey', 'p3_table_plate', after=0.5)
    g.page.wait_for_function('RLP.state.flag("p3_david_covered") && !RLP.ctx.ui.locked', timeout=90000)
    g.rest(1.5)
    g.click('p3_larva_body', after=1.5)                       # 蚊子飞散
    g.click('p3_larva_mouth', after=2.0)                      # 吐出球茎
    g.click('p3_larva_bulb', after=1.0)
    g.has('p3_bulb')
    g.back()
    g.approach_click('p3_shrine_zoom', dist=3.6, after=1.0)
    in_view(g, 'p3_shrine')
    g.use('p3_flower_yellow', 'p3_shrine_slot_0', after=1.2)
    g.use('p3_vase_slim', 'p3_shrine_slot_1', after=1.2)
    g.use('p3_vase_urn', 'p3_shrine_slot_2', after=1.2)
    g.back()
    g.say('  出白桦林')
    g.face_click('p3_grove_exit', after=1.2)
    in_view(g, 'forest_clearing')


def phase_jar(g):
    g.say('石屋：钟罩里种两个球茎，长出橙花和玫瑰')
    g.approach_click('house_entry', dist=4.2, after=1.0)
    g.approach_click('p3_jar_zoom', dist=2.0, after=1.0)
    in_view(g, 'p3_bell_jar')
    g.click('p3_jar_dome', after=1.2)                         # 升起钟罩
    for n in range(2):
        g.use('p3_bulb', 'p3_jar_pot', after=1.2)             # 种球茎
        g.click('p3_jar_dome', after=4.5)                     # 落下钟罩：延时摄影长成花
        g.click('p3_jar_dome', after=1.2)                     # 升起
        g.click('p3_jar_flower', after=1.2)                   # 摘花
    g.has('p3_flower_orange')
    g.has('p3_rose')
    g.click('p3_jar_dome', after=1.0)
    g.back()
    g.face_click('house_exit', after=1.0)


def phase_grove_second(g):
    g.say('白桦林：两只花瓶插花，画像，回忆，黑方块')
    g.approach_click('p3_grove_entry', dist=3.5, after=1.0)
    in_view(g, 'p3_grove')
    g.approach_click('p3_shrine_zoom', dist=3.6, after=1.0)
    in_view(g, 'p3_shrine')
    g.use('p3_flower_orange', 'p3_shrine_slot_1', after=1.2)
    g.use('p3_rose', 'p3_shrine_slot_2', after=0.5)
    g.page.wait_for_function('RLP.state.flag("p3_portrait_eyes") && !RLP.ctx.ui.locked', timeout=90000)
    g.rest(1.5)
    g.click('p3_portrait_zoom', after=1.2)
    in_view(g, 'p3_portrait')
    g.click('p3_portrait', after=0.5)                         # 回忆
    g.page.wait_for_function('RLP.state.flag("p3_memory_seen") && !RLP.ctx.ui.locked', timeout=120000)
    g.rest(1.2)
    g.click('p3_cube', after=1.2)
    g.has('black_cube')
    g.back()
    g.face_click('p3_grove_exit', after=1.2)


def phase_ending(g):
    g.say('神殿：把黑方块放进吊架')
    g.approach_click('temple_entry', dist=4.5, after=1.0)
    in_view(g, 'temple_int')
    g.click('holder', after=1.2)
    g.click('holder', after=1.2)
    g.use('black_cube', 'holder', hover=0.3, after=0.5)
    g.wait_flag('plague3_complete', timeout=120000)
    g.say('通关！等结尾卡')
    g.rest(8.0)


PHASES = [intro, phase_swatter, phase_shovel, phase_lake, phase_scissors, phase_hive_and_clay, phase_flytrap_first,
          phase_barber, phase_wheel, phase_beach_box, phase_flytrap_second, phase_tree, phase_grove_first,
          phase_jar, phase_grove_second, phase_ending]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', default='1280x720')
    ap.add_argument('--fast', action='store_true', help='不录屏，停顿清零')
    ap.add_argument('--out', default=None)
    ap.add_argument('--no-wip', action='store_true', help='菜单里不带 ?wip=1（第三灾去掉 wip 之后用）')
    ap.add_argument('--resume-from', default=None, help='从某个阶段函数名开始（调试用，需配合 --state）')
    ap.add_argument('--state', default=None, help='失败现场 json（取其中的 flags 和 inventory 作为起点）')
    ap.add_argument('--start-view', default='beach_mid')
    a = ap.parse_args()
    W, H = map(int, a.size.split('x'))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    server, port = serve()
    base = f'http://127.0.0.1:{port}/'
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
                page.goto(base + 'index.html?autotest=1&chapter=3', wait_until='domcontentloaded')
                page.wait_for_function('window.RLP && RLP.ready', timeout=120000)
                page.evaluate('async o => { await RLP.start(3, o); }', {'fresh': True, 'skipIntro': True, 'view': a.start_view,
                                                                         'flags': st['flags'], 'give': st['inventory']})
                g.install()
                g.say(f'从 {a.resume_from} 开始（调试）')
            else:
                page.goto(base + 'index.html' + ('' if a.no_wip else '?wip=1'), wait_until='domcontentloaded')
                page.wait_for_function('window.RLP && RLP.ready', timeout=120000)
                g.install()
            for ph in phases:
                ph(g)
            report['ok'] = g.ev('!!RLP.state.flag("plague3_complete")')
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
            out = Path(a.out) if a.out else OUT_DIR / ('plague3-demo.mp4' if not failed else 'plague3-demo-partial.mp4')
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
