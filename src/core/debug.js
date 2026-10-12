// window.RLP — test / debug API. Everything goes through the same public paths a player uses
// (hotspot clicks, item selection, arrows, combine, inspector), so a passing autoplay proves the
// puzzle chain is completable.
import { state } from './state.js';
import { ctx } from './context.js';
import { views } from './views.js';
import { hotspots } from './hotspots.js';
import { items } from './items.js';
import { ui } from './ui.js';
import { audio } from './audio.js';
import { wait } from './tween.js';

// Errors are captured from the very first byte by an inline script in index.html
// (window.__RLP_ERRORS); fall back to our own capture if that script is missing.
export const errors = window.__RLP_ERRORS || (window.__RLP_ERRORS = []);
if (!window.__RLP_CAPTURE) {
  window.__RLP_CAPTURE = true;
  window.addEventListener('error', (e) => {
    errors.push({ type: 'error', message: String(e.message || (e.error && e.error.message) || e), stack: e.error && e.error.stack, source: e.filename, line: e.lineno });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    errors.push({ type: 'unhandledrejection', message: String((r && r.message) || r), stack: r && r.stack });
  });
}

let engine = null;

function nextFrame() {
  return new Promise((resolve) => {
    const off = engine.onFrame(() => { off(); resolve(); });
  });
}

function realSleep(ms) {
  // Real-time pause used only by the test harness (never by gameplay code).
  return new Promise((r) => setTimeout(r, ms));
}

function isIdle() {
  return !ui.locked && !views.transitioning && !hotspots.busy;
}

async function idle(timeoutMs = 90000) {
  const t0 = performance.now();
  let calm = 0;
  for (;;) {
    if (isIdle()) { if (++calm >= 2) return; } else calm = 0;
    if (performance.now() - t0 > timeoutMs) {
      throw new Error(`timed out waiting for idle (locked=${ui.locked}, transitioning=${views.transitioning}, busy=${hotspots.busy})`);
    }
    await nextFrame();
  }
}

function describe(step) {
  try { return JSON.parse(JSON.stringify(step)); } catch { return String(step); }
}

function flatten(steps) {
  const out = [];
  steps.forEach((s, src) => {
    if (s && typeof s.repeat === 'number' && s.step) {
      for (let k = 0; k < s.repeat; k++) out.push({ step: s.step, src, rep: k + 1 });
    } else out.push({ step: s, src });
  });
  return out;
}

/** BFS over arrows + goto hotspots (with the current state) — is `target` reachable from here? */
function reachable(target, from = state.view) {
  if (!from || from === target) return true;
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const v = queue.shift();
    const spec = views.get(v);
    if (!spec) continue;
    const n = views.neighbours(spec);
    const next = [n.left, n.right, n.up, n.back];
    for (const hs of hotspots.list(v)) {
      if (!hs.goto) continue;
      let ok = true;
      if (hs.when) { try { ok = !!hs.when(state, ctx); } catch { ok = false; } }
      if (ok) next.push(hs.goto);
    }
    for (const id of next) {
      if (!id || seen.has(id)) continue;
      if (id === target) return true;
      seen.add(id);
      queue.push(id);
    }
  }
  return false;
}

function checkFlag(spec) {
  let key, want, hasWant = false;
  if (Array.isArray(spec)) { key = spec[0]; want = spec[1]; hasWant = spec.length > 1; } else if (spec && typeof spec === 'object') { key = spec.key; want = spec.value; hasWant = 'value' in spec; } else key = spec;
  const got = state.flag(key);
  const ok = hasWant ? got === want : !!got;
  if (!ok) throw new Error(`expected flag ${key}${hasWant ? ` = ${JSON.stringify(want)}` : ' to be truthy'}, got ${JSON.stringify(got)}`);
}

export function installDebug({ engine: eng, startChapter, getChapter }) {
  engine = eng;

  async function runWithAutoClose(promise, entry, timeoutMs) {
    let done = false, result, error = null;
    promise.then((r) => { done = true; result = r; }, (e) => { done = true; error = e; });
    const t0 = performance.now();
    let docFrames = 0, inspFrames = 0, lbFrames = 0;
    while (!done) {
      await nextFrame();
      if (ui.docOpen) {
        if (++docFrames > 3) { entry.closedDoc = (entry.closedDoc || 0) + 1; ui.closeDoc(); docFrames = 0; }
      } else docFrames = 0;
      if (ui.imageOpen) {
        if (++lbFrames > 3) { entry.closedImage = (entry.closedImage || 0) + 1; ui.closeImage(); lbFrames = 0; }
      } else lbFrames = 0;
      if (ui.inspectOpen && !entry.inspect) {
        if (++inspFrames > 3) { ui.closeInspect(); inspFrames = 0; }
      } else inspFrames = 0;
      if (performance.now() - t0 > timeoutMs) throw new Error(`step timed out after ${Math.round(timeoutMs / 1000)} s (locked=${ui.locked}, transitioning=${views.transitioning}, busy=${hotspots.busy})`);
    }
    if (error) throw error;
    return result;
  }

  function requireItem(id) {
    if (!state.has(id)) throw new Error(`item "${id}" is not in the inventory [${state.inventory.join(', ')}]`);
  }

  const RLP = {
    ready: false,
    bootError: null,
    state, ctx, errors,
    get timeScale() { return engine.timeScale; },
    set timeScale(v) { engine.timeScale = Math.max(0.01, Number(v) || 1); },
    get chapter() { return getChapter(); },

    start(chapterNumber = 1, opts = {}) { return startChapter(chapterNumber, opts); },

    // 测试 / 开发跳转：开放视图直接用该视图的机位，不恢复记住的漫游位置
    async goto(viewId, opts) { await idle(); await views.go(viewId, { teleport: true, ...opts }); return state.view; },
    /** 漫游中把玩家放到 pos（[x, y, z]）并看向 target。 */
    roamTo(pos, target) { return views.placeRoam(pos, target); },
    async click(hotspotId) { await idle(); return hotspots.click(hotspotId); },
    select(itemId) {
      if (itemId == null) { state.select(null); return null; }
      requireItem(itemId);
      ui.selectSlot(state.inventory.indexOf(itemId));
      return state.selected;
    },
    async use(itemId, hotspotId) {
      await idle();
      requireItem(itemId);
      RLP.select(itemId);
      return hotspots.click(hotspotId);
    },
    async combine(a, b) {
      await idle();
      requireItem(a); requireItem(b);
      if (a === b && state.count(a) < 2) throw new Error(`need two "${a}" to combine`);
      return items.combine(a, b);
    },
    async inspectClick(itemId, part) {
      await idle();
      requireItem(itemId);
      const closed = ui.inspect(itemId);
      try {
        const def = items.get(itemId);
        if (!def || !def.onInspectClick) throw new Error(`item "${itemId}" has no onInspectClick`);
        return await ui.inspectClick(itemId, part);
      } finally {
        ui.closeInspect();
        await closed;
      }
    },
    async back() { await idle(); return views.back(); },
    async arrow(dir) {
      await idle();
      if (!ui.arrowState[dir]) throw new Error(`no ${dir} arrow in view "${state.view}"`);
      return views.arrow(dir);
    },

    hotspots() {
      return hotspots.list().map((s) => ({ id: s.id, enabled: hotspots.enabled(s.id), onScreen: hotspots.onScreen(s.id) }));
    },
    views() { return views.ids(); },
    drawCalls() { return engine.lastDrawCalls; },
    info() {
      return {
        view: state.view, zone: views.zone, inventory: [...state.inventory], selected: state.selected,
        flags: { ...state.flags }, achievements: [...state.achievements], locked: ui.locked,
        freeMode: views.freeMode, roam: views.roamInfo(), touchMode: ui.touchMode, pixelRatio: engine.pixelRatio,
        drawCalls: engine.lastDrawCalls, triangles: engine.lastTriangles, timeScale: engine.timeScale,
        arrows: { ...ui.arrowState },
      };
    },
    /**
     * 模拟一次按键（keydown，hold 毫秒后 keyup），和玩家走同一条键盘路径。
     * key: '1'..'6'、'w'、'KeyW'、'ArrowDown'、'Escape'、'Shift'…
     */
    async key(key, { hold = 0 } = {}) {
      const s = String(key);
      let code = s;
      if (/^[0-9]$/.test(s)) code = `Digit${s}`;
      else if (/^[a-z]$/i.test(s)) code = `Key${s.toUpperCase()}`;
      else if (s === 'Shift') code = 'ShiftLeft';
      const k = /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : /^Digit\d$/.test(code) ? code.slice(5) : code.startsWith('Shift') ? 'Shift' : s;
      const opts = { key: k, code, bubbles: true, cancelable: true };
      window.dispatchEvent(new KeyboardEvent('keydown', opts));
      if (hold) await realSleep(hold);
      window.dispatchEvent(new KeyboardEvent('keyup', opts));
    },
    idle,
    reachable,
    /** Snap the camera to a view without running onEnter/onExit (for screenshots). */
    peek(viewId) { views.peek(viewId); engine.render(); return viewId; },
    /** Data URL of the current frame. */
    shot(opts) { return engine.capture(opts); },
    /** Advance game time without rendering (synchronous; promise continuations run afterwards). */
    advance(sec, step = 1 / 30) { for (let t = 0; t < sec; t += step) engine.step(step); },
    nextFrame,
    realSleep,

    /** Smoke-test every synthesized sound (needs an AudioContext). Returns errors. */
    audioTest() {
      const errs = [];
      audio.init();
      for (const n of audio.sfxNames()) { try { audio.sfx(n); } catch (e) { errs.push(`${n}: ${e.message}`); } }
      for (const a of ['lake', 'forest', 'interior', 'temple', 'memory', 'none']) { try { audio.ambience(a); } catch (e) { errs.push(`amb ${a}: ${e.message}`); } }
      for (const m of ['intro', 'plague', 'ending', 'none']) { try { audio.music(m); } catch (e) { errs.push(`music ${m}: ${e.message}`); } }
      return { ready: audio.ready, state: audio.context && audio.context.state, errors: errs };
    },

    /**
     * Run walkthrough steps through the public click/use/go paths.
     * steps: { go } | { click } | { use, on } | { combine: [a,b] } | { inspect, part } | { wait } |
     *        { expectFlag } | { expectItem } | { expectNoItem } | { expectView } | { back: true } |
     *        { arrow: 'left'|'right'|'up'|'down' } | { select } | { repeat: n, step: {...} }
     */
    async autoplay({ stepDelay = 30, steps, shots = false, fast = true, stepTimeout = 120000, stopOnError = true } = {}) {
      const chapter = getChapter();
      const list = flatten(steps || (chapter && chapter.walkthrough) || []);
      const log = [];
      const t0 = performance.now();
      const prevRender = engine.renderEnabled;
      if (fast && !shots) engine.renderEnabled = false;
      let failed = null;
      try {
        for (let i = 0; i < list.length; i++) {
          const { step, src, rep } = list[i];
          const entry = { i, src, step: describe(step) };
          if (rep) entry.rep = rep;
          const ts = performance.now();
          const errCount = errors.length;
          try {
            await idle();
            entry.from = state.view;
            await runWithAutoClose(runStep(step, entry), entry, stepTimeout);
            await idle();
            if (stepDelay) await wait(stepDelay);
            if (errors.length > errCount) {
              const e = errors[errors.length - 1];
              throw new Error(`uncaught error during step: ${e.message}`);
            }
            entry.ok = true;
          } catch (err) {
            entry.ok = false;
            entry.error = String((err && err.message) || err);
            if (err && err.stack) entry.stack = String(err.stack).split('\n').slice(0, 6).join('\n');
          }
          entry.ms = Math.round(performance.now() - ts);
          entry.view = state.view;
          entry.inv = [...state.inventory];
          if (shots) { try { entry.shot = engine.capture({ width: 480, quality: 0.7 }); } catch { /* ignore */ } }
          log.push(entry);
          if (!entry.ok) {
            failed = failed || { index: i, src, step: entry.step, error: entry.error };
            if (stopOnError) break;
          }
        }
      } finally {
        engine.renderEnabled = prevRender;
        if (prevRender) engine.render();
      }
      return {
        ok: !failed,
        steps: failed ? failed.index : list.length,
        total: list.length,
        failedStep: failed,
        error: failed ? failed.error : null,
        log,
        ms: Math.round(performance.now() - t0),
        view: state.view,
        inventory: [...state.inventory],
        flags: { ...state.flags },
        achievements: [...state.achievements],
        warnings: log.filter((e) => e.warn).map((e) => `#${e.i}: ${e.warn}`),
      };
    },
  };

  async function runStep(step, entry) {
    if (!step || typeof step !== 'object') throw new Error(`bad step ${JSON.stringify(step)}`);
    if ('go' in step) {
      const ok = reachable(step.go);
      entry.reachable = ok;
      if (!ok) entry.warn = `view "${step.go}" is not reachable from "${state.view}" via arrows / goto hotspots`;
      await views.go(step.go, { teleport: true });
      if (state.view !== step.go && !entry.warn) entry.warn = `ended in "${state.view}" instead of "${step.go}"`;
      return;
    }
    if ('click' in step) {
      entry.onScreen = hotspots.onScreen(step.click);
      if (!entry.onScreen) entry.warn = `hotspot "${step.click}" is off screen in "${state.view}"`;
      if (state.selected) state.select(null);
      await hotspots.click(step.click);
      return;
    }
    if ('use' in step) {
      requireItem(step.use);
      entry.onScreen = hotspots.onScreen(step.on);
      if (!entry.onScreen) entry.warn = `hotspot "${step.on}" is off screen in "${state.view}"`;
      RLP.select(step.use);
      await hotspots.click(step.on);
      return;
    }
    if ('combine' in step) {
      const [a, b] = step.combine;
      requireItem(a); requireItem(b);
      const ok = await items.combine(a, b);
      if (!ok) throw new Error(`no recipe for ${a} + ${b}`);
      return;
    }
    if ('inspect' in step) {
      entry.inspect = true;
      await RLP.inspectClick(step.inspect, step.part);
      return;
    }
    if ('wait' in step) { await wait(Number(step.wait) || 0); return; }
    if ('expectFlag' in step) { checkFlag(step.expectFlag); return; }
    if ('expectItem' in step) {
      for (const id of [].concat(step.expectItem)) if (!state.has(id)) throw new Error(`expected item "${id}" in the inventory [${state.inventory.join(', ')}]`);
      return;
    }
    if ('expectNoItem' in step) {
      for (const id of [].concat(step.expectNoItem)) if (state.has(id)) throw new Error(`expected no "${id}" in the inventory`);
      return;
    }
    if ('expectView' in step) {
      if (state.view !== step.expectView) throw new Error(`expected view "${step.expectView}", in "${state.view}"`);
      return;
    }
    if ('back' in step) {
      const n = views.neighbours();
      if (!n.back) throw new Error(`no ▼ arrow in view "${state.view}"`);
      await views.back();
      return;
    }
    if ('arrow' in step) {
      const n = views.neighbours();
      const key = step.arrow === 'down' ? 'back' : step.arrow;
      if (!n[key]) throw new Error(`no ${step.arrow} arrow in view "${state.view}"`);
      await views.arrow(step.arrow);
      return;
    }
    if ('select' in step) { RLP.select(step.select); return; }
    throw new Error(`unknown step type ${JSON.stringify(step)}`);
  }

  window.RLP = RLP;
  if (hotspots.debug) installHud();
  return RLP;
}

function installHud() {
  const d = document.createElement('div');
  d.className = 'debug-hud';
  (document.getElementById('stage') || document.body).appendChild(d);
  let acc = 0, frames = 0, fps = 0;
  engine.onFrame((dt) => {
    acc += dt; frames++;
    if (acc >= 0.5) { fps = Math.round(frames / acc); acc = 0; frames = 0; }
    d.textContent = `${state.view || '-'} · ${views.zone || '-'} · ${fps} fps · ${engine.lastDrawCalls} calls · ${(engine.lastTriangles / 1000).toFixed(0)}k tris${ui.locked ? ' · LOCKED' : ''}`;
  });
}
