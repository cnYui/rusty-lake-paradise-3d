// DOM overlay UI: vignette frame, top text band, hints, narration, chapter titles, thought
// bubbles, nav arrows, inventory strip, fades / flashes / film flicker, chalk achievement toasts,
// letter reader, item inspector, title menu, settings and ending card.
//
// 物品栏在电脑上只用键盘操作（鼠标留给点击场景和转动视角）：数字键 1–9、0 和 -、= 对应 12 个槽位（超过 6 件时展开第二列），
// 按一次选中、再按同一个键取消、快速连按两次查看；已选中一件时按另一个数字键 = 两件合成。
// 触屏上直接点槽位，规则相同（点一下选中、再点取消、点另一件合成、快速点两下查看）。
//
// Layout: #stage is a 16:9 box (80em × 45em, 1em = stage width / 80 = 16 px at 1280×720).
// The game viewport (canvas + .vp overlay) is 66.5625em × 45em; it sits at left 2.5em when the
// inventory strip is shown (class .inv-on on #stage) and is centred otherwise.
import * as THREE from 'three';
import { state, MAX_SLOTS, COLUMN_SLOTS, storage } from './state.js';
import { items } from './items.js';
import { audio } from './audio.js';
import { ctx } from './context.js';
import { views } from './views.js';
import { animate, Ease } from './tween.js';
import { chapterStatus, requiredChapter, resumeChapter, liveSave } from './progress.js';

let engine = null;
const el = {};
let lockCount = 0;
let modalCount = 0;
const ENDING_AUTO_SECONDS = 8;   // 结尾卡上“自动进入下一灾”的倒数秒数
let endingSeq = 0;           // 结尾卡的序号：关闭 / 重开 / 选了去向时加一，让上一张卡的自动倒计时作废
const listeners = new Map();

// ------------------------------------------------------------------------- small helpers
function h(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

function gameWait(ms, isCancelled) {
  return new Promise((resolve) => {
    if (!engine || ms <= 0) { resolve(); return; }
    let t = 0;
    const off = engine.onUpdate((dt) => {
      t += dt * 1000;
      if (t >= ms || (isCancelled && isCancelled())) { off(); resolve(); }
    });
  });
}

function emit(evt, data) {
  const set = listeners.get(evt);
  if (set) for (const fn of [...set]) { try { fn(data); } catch (e) { console.error(e); } }
}

function vpRect() { return el.vp.getBoundingClientRect(); }

function em() {
  const r = el.stage.getBoundingClientRect();
  return r.width / 80 || 16;
}

// deterministic jitter for hand-drawn strokes
function prng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// ------------------------------------------------------------------ hand-drawn title font
const PI = Math.PI;
function arc(cx, cy, rx, ry, a0, a1, n = 12) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}
const GLYPHS = {
  R: { w: 0.46, s: [[[0, 1], [0, 0.01]], [[0, 0.01], [0.2, 0], ...arc(0.2, 0.225, 0.22, 0.225, -PI / 2, PI / 2), [0, 0.45]], [[0.15, 0.45], [0.47, 1]]] },
  U: { w: 0.46, s: [[[0, 0], [0, 0.74], ...arc(0.23, 0.74, 0.23, 0.26, PI, 0), [0.46, 0]]] },
  S: { w: 0.44, s: [[...arc(0.22, 0.25, 0.21, 0.24, -0.45, -PI * 1.5, 14), ...arc(0.22, 0.745, 0.22, 0.255, -PI / 2, PI * 0.82, 14)]] },
  T: { w: 0.5, s: [[[0, 0], [0.5, 0]], [[0.25, 0], [0.25, 1]]] },
  Y: { w: 0.5, s: [[[0, 0], [0.25, 0.5]], [[0.5, 0], [0.25, 0.5], [0.25, 1]]] },
  L: { w: 0.4, s: [[[0, 0], [0, 1], [0.4, 1]]] },
  A: { w: 0.5, s: [[[0, 1], [0.25, 0], [0.5, 1]], [[0.1, 0.63], [0.4, 0.63]]] },
  K: { w: 0.46, s: [[[0, 0], [0, 1]], [[0.44, 0], [0.02, 0.56]], [[0.15, 0.42], [0.46, 1]]] },
  E: { w: 0.4, s: [[[0.4, 0], [0, 0], [0, 1], [0.4, 1]], [[0, 0.5], [0.32, 0.5]]] },
  P: { w: 0.44, s: [[[0, 1], [0, 0]], [[0, 0], [0.2, 0], ...arc(0.2, 0.23, 0.22, 0.23, -PI / 2, PI / 2), [0, 0.46]]] },
  D: { w: 0.46, s: [[[0, 0], [0, 1]], [[0, 0], [0.08, 0], ...arc(0.08, 0.5, 0.38, 0.5, -PI / 2, PI / 2, 18), [0, 1]]] },
  I: { w: 0.04, s: [[[0.02, 0], [0.02, 1]]] },
  ' ': { w: 0.32, s: [] },
};

/** Draw tall narrow hand-lettered lines (RUSTY LAKE style) centred on a canvas. */
function drawHandLines(canvas, lines, { color = '#111', lineGap = 0.32, xScale = 0.62, progress = 1, seed = 7 } = {}) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  const n = lines.length;
  const lh = H / (n + (n - 1) * lineGap);   // letter height in px
  const spacing = 0.17;
  const r = prng(seed);
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // collect all strokes first (for progressive drawing)
  const strokes = [];
  lines.forEach((line, li) => {
    const chars = [...line.toUpperCase()];
    const wUnits = chars.reduce((a, c) => a + ((GLYPHS[c] || GLYPHS[' ']).w + spacing) * xScale, 0) - spacing * xScale;
    let x = (W - wUnits * lh) / 2;
    const y0 = li * lh * (1 + lineGap);
    for (const c of chars) {
      const gl = GLYPHS[c] || GLYPHS[' '];
      for (const s of gl.s) {
        const pts = [];
        for (let i = 0; i < s.length; i++) {
          const [px, py] = s[i];
          // subdivide long straight segments a little for a hand wobble
          if (i > 0) {
            const [qx, qy] = s[i - 1];
            const seg = Math.hypot(px - qx, py - qy);
            const k = Math.max(1, Math.round(seg / 0.12));
            for (let j = 1; j < k; j++) {
              const t = j / k;
              pts.push([x + (qx + (px - qx) * t) * xScale * lh + (r() - 0.5) * lh * 0.012, y0 + (qy + (py - qy) * t) * lh + (r() - 0.5) * lh * 0.01]);
            }
          }
          pts.push([x + px * xScale * lh + (r() - 0.5) * lh * 0.01, y0 + py * lh + (r() - 0.5) * lh * 0.008]);
        }
        strokes.push({ pts, w: lh * (0.042 + r() * 0.01) });
      }
      x += (gl.w + spacing) * xScale * lh;
    }
  });
  let total = 0;
  for (const s of strokes) {
    s.len = 0;
    for (let i = 1; i < s.pts.length; i++) s.len += Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]);
    total += s.len;
  }
  let budget = total * Math.max(0, Math.min(1, progress));
  for (const s of strokes) {
    if (budget <= 0) break;
    g.lineWidth = s.w;
    g.beginPath();
    g.moveTo(s.pts[0][0], s.pts[0][1]);
    let used = 0;
    for (let i = 1; i < s.pts.length; i++) {
      const [ax, ay] = s.pts[i - 1], [bx, by] = s.pts[i];
      const d = Math.hypot(bx - ax, by - ay);
      if (used + d > budget) {
        const t = (budget - used) / d;
        g.lineTo(ax + (bx - ax) * t, ay + (by - ay) * t);
        used = budget;
        break;
      }
      g.lineTo(bx, by);
      used += d;
    }
    g.stroke();
    budget -= s.len;
  }
}

// --------------------------------------------------------------------- chalk icon strokes
// Unit-square polylines (0..1) for achievement icons, drawn like white chalk.
function circlePts(cx, cy, r, a0 = 0, a1 = PI * 2, n = 18) { return arc(cx, cy, r, r, a0, a1, n); }
const CHALK_ICONS = {
  welcome_to_paradise: [
    [[0.22, 0.12], [0.22, 0.9]], [[0.78, 0.12], [0.78, 0.9]], [[0.12, 0.24], [0.88, 0.24]],
    [[0.3, 0.38], [0.3, 0.9]], [[0.5, 0.38], [0.5, 0.9]], [[0.7, 0.38], [0.7, 0.9]], [[0.3, 0.38], [0.7, 0.38]],
  ],
  the_eilander_family: [
    circlePts(0.25, 0.32, 0.09), [[0.25, 0.41], [0.25, 0.75]], [[0.13, 0.55], [0.37, 0.55]], [[0.25, 0.75], [0.16, 0.9]], [[0.25, 0.75], [0.34, 0.9]],
    circlePts(0.5, 0.42, 0.075), [[0.5, 0.5], [0.5, 0.78]], [[0.4, 0.6], [0.6, 0.6]], [[0.5, 0.78], [0.43, 0.9]], [[0.5, 0.78], [0.57, 0.9]],
    circlePts(0.75, 0.3, 0.09), [[0.75, 0.39], [0.75, 0.75]], [[0.63, 0.53], [0.87, 0.53]], [[0.75, 0.75], [0.66, 0.9]], [[0.75, 0.75], [0.84, 0.9]],
  ],
  save_the_goat: [
    [[0.36, 0.3], [0.3, 0.12], [0.18, 0.08], [0.1, 0.16]], [[0.62, 0.3], [0.7, 0.12], [0.82, 0.08], [0.9, 0.16]],
    [[0.36, 0.3], [0.62, 0.3], [0.66, 0.5], [0.58, 0.72], [0.5, 0.8], [0.42, 0.72], [0.33, 0.5], [0.36, 0.3]],
    [[0.33, 0.36], [0.16, 0.42], [0.3, 0.46]], [[0.65, 0.36], [0.82, 0.42], [0.68, 0.46]],
    [[0.42, 0.45], [0.45, 0.45]], [[0.55, 0.45], [0.58, 0.45]], [[0.46, 0.8], [0.5, 0.95], [0.54, 0.8]],
  ],
  its_me: [
    circlePts(0.5, 0.36, 0.17, 0, PI * 2, 22),
    [[0.14, 0.92], ...arc(0.5, 0.92, 0.36, 0.3, PI, PI * 2, 14).slice(1)],
  ],
  the_first_symbol: [
    [[0.5, 0.2], [0.18, 0.78], [0.82, 0.78], [0.5, 0.2]], [[0.5, 0.06], [0.5, 0.94]],
  ],
  demo_done: [
    [[0.5, 0.12], [0.82, 0.42], [0.5, 0.9], [0.18, 0.42], [0.5, 0.12]], [[0.18, 0.42], [0.82, 0.42]], [[0.36, 0.42], [0.5, 0.9], [0.64, 0.42]],
  ],
  // 第二灾：青蛙（正面，鼓眼睛、宽嘴、前爪）
  the_first_frog: [
    circlePts(0.3, 0.3, 0.1), circlePts(0.7, 0.3, 0.1), circlePts(0.3, 0.3, 0.035, 0, PI * 2, 8), circlePts(0.7, 0.3, 0.035, 0, PI * 2, 8),
    [...arc(0.5, 0.6, 0.4, 0.27, 0, PI * 2, 30)],
    [[0.27, 0.64], [0.4, 0.73], [0.6, 0.73], [0.73, 0.64]],
    [[0.2, 0.78], [0.1, 0.92], [0.3, 0.92]], [[0.8, 0.78], [0.9, 0.92], [0.7, 0.92]],
  ],
  // 第二灾：鹿头（水中倒影）：脸、耳朵、两支分叉的鹿角和脚下的水纹
  reflection_in_the_water: [
    [[0.38, 0.48], [0.62, 0.48], [0.58, 0.74], [0.5, 0.84], [0.42, 0.74], [0.38, 0.48]],
    [[0.38, 0.5], [0.24, 0.5], [0.37, 0.6]], [[0.62, 0.5], [0.76, 0.5], [0.63, 0.6]],
    [[0.4, 0.48], [0.32, 0.34], [0.22, 0.2], [0.14, 0.06]], [[0.32, 0.34], [0.18, 0.32]], [[0.25, 0.25], [0.3, 0.1]],
    [[0.6, 0.48], [0.68, 0.34], [0.78, 0.2], [0.86, 0.06]], [[0.68, 0.34], [0.82, 0.32]], [[0.75, 0.25], [0.7, 0.1]],
    [[0.44, 0.56], [0.47, 0.56]], [[0.53, 0.56], [0.56, 0.56]],
    [[0.18, 0.93], [0.3, 0.9], [0.42, 0.93], [0.54, 0.9], [0.66, 0.93], [0.78, 0.9], [0.86, 0.93]],
  ],
  // 第二灾：钥匙（圆环柄朝上、竖杆、两个齿）
  a_rusty_key: [
    circlePts(0.5, 0.25, 0.17, 0, PI * 2, 22), circlePts(0.5, 0.25, 0.06, 0, PI * 2, 10),
    [[0.5, 0.42], [0.5, 0.94]], [[0.5, 0.7], [0.68, 0.7]], [[0.5, 0.84], [0.63, 0.84]],
  ],
  _default: [
    [[0.5, 0.1], [0.62, 0.38], [0.92, 0.4], [0.68, 0.6], [0.76, 0.9], [0.5, 0.73], [0.24, 0.9], [0.32, 0.6], [0.08, 0.4], [0.38, 0.38], [0.5, 0.1]],
  ],
};

function chalkStrokes(id, x, y, size) {
  const icon = CHALK_ICONS[id] || CHALK_ICONS._default;
  const out = [];
  // frame first (4 sides, slightly overshooting like quick chalk strokes)
  const f = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let i = 0; i < 4; i++) {
    const a = f[i], b = f[(i + 1) % 4];
    out.push([[x + a[0] * size, y + a[1] * size], [x + b[0] * size, y + b[1] * size]]);
  }
  const pad = size * 0.14, inner = size - pad * 2;
  for (const s of icon) out.push(s.map(([u, v]) => [x + pad + u * inner, y + pad + v * inner]));
  return out;
}

function drawChalk(g, strokes, progress, scale, seed = 3) {
  const r = prng(seed);
  let total = 0;
  const lens = strokes.map((s) => {
    let l = 0;
    for (let i = 1; i < s.length; i++) l += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    total += l;
    return l;
  });
  let budget = total * progress;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  strokes.forEach((s, si) => {
    if (budget <= 0) return;
    for (let pass = 0; pass < 2; pass++) {
      g.strokeStyle = pass === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)';
      g.lineWidth = (pass === 0 ? 0.2 : 0.36) * scale;
      g.beginPath();
      const jx = pass ? (r() - 0.5) * scale * 0.12 : 0, jy = pass ? (r() - 0.5) * scale * 0.12 : 0;
      g.moveTo(s[0][0] + jx, s[0][1] + jy);
      let used = 0;
      for (let i = 1; i < s.length; i++) {
        const [ax, ay] = s[i - 1], [bx, by] = s[i];
        const d = Math.hypot(bx - ax, by - ay);
        if (used + d > budget) {
          const t = (budget - used) / d;
          g.lineTo(ax + (bx - ax) * t + jx, ay + (by - ay) * t + jy);
          break;
        }
        g.lineTo(bx + jx, by + jy);
        used += d;
      }
      g.stroke();
    }
    budget -= lens[si];
  });
}

// ------------------------------------------------------------------------ grain texture
function grainDataURL() {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  const img = g.createImageData(160, 160);
  const r = prng(99);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (r() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

function paperDataURL() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#efdfae';
  g.fillRect(0, 0, 256, 256);
  const r = prng(5);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(120,90,40,0.06)' : 'rgba(255,250,230,0.08)';
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  return c.toDataURL('image/png');
}

// ----------------------------------------------------------------------------- dust motes
const dust = { motes: [], sprite: null };
function initDust() {
  const s = document.createElement('canvas');
  s.width = s.height = 32;
  const g = s.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  dust.sprite = s;
  const r = Math.random;
  for (let i = 0; i < 14; i++) dust.motes.push(newMote(r, true));
}
function newMote(r, anywhere) {
  return {
    x: r(), y: anywhere ? r() : 1.05, vx: (r() - 0.5) * 0.012, vy: -(0.004 + r() * 0.012),
    size: 4 + r() * 6, life: 0, max: 7 + r() * 9, phase: r() * 6.28, alpha: 0.45 + r() * 0.5,
  };
}
function updateDust(dt) {
  const c = el.dust;
  if (!c || !dust.sprite) return;
  const w = c.clientWidth, hgt = c.clientHeight;
  if (!w || !hgt) return;
  if (c.width !== w || c.height !== hgt) { c.width = w; c.height = hgt; }
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, hgt);
  const s = w / 1065;
  for (let i = 0; i < dust.motes.length; i++) {
    const m = dust.motes[i];
    m.life += dt;
    m.phase += dt * 0.7;
    m.x += (m.vx + Math.sin(m.phase) * 0.004) * dt;
    m.y += m.vy * dt;
    if (m.life > m.max || m.y < -0.05 || m.x < -0.05 || m.x > 1.05) { dust.motes[i] = newMote(Math.random, true); dust.motes[i].life = 0; continue; }
    const fade = Math.min(1, m.life / 1.5, (m.max - m.life) / 1.5);
    g.globalAlpha = Math.max(0, fade) * m.alpha;
    const sz = m.size * s;
    g.drawImage(dust.sprite, m.x * w - sz / 2, m.y * hgt - sz / 2, sz, sz);
  }
  g.globalAlpha = 1;
}

// ------------------------------------------------------------------------ text band (say)
const band = { queue: [], running: false, current: null, token: 0 };

function showBand(text, kind) {
  el.stage.classList.add('band-on');
  el.bandText.className = 'band-text show kind-' + kind;
  el.bandText.textContent = text;
  el.hint.classList.remove('show');
}
function hideBand() {
  el.stage.classList.remove('band-on');
  el.bandText.classList.remove('show');
}

/** Resolves once the band queue is empty (game time). */
function bandIdle() {
  return new Promise((resolve) => {
    if (!band.running || !engine) { resolve(); return; }
    const off = engine.onUpdate(() => { if (!band.running) { off(); resolve(); } });
  });
}

async function pumpBand() {
  if (band.running) return;
  band.running = true;
  while (band.queue.length) {
    const it = band.queue.shift();
    band.current = it;
    showBand(it.text, it.kind);
    await gameWait(it.ms, () => it.cancelled);
    it.resolve();
  }
  band.current = null;
  hideBand();
  band.running = false;
}

// --------------------------------------------------------------------------- bubbles
const bubbles = new Set();
const _anchorV = new THREE.Vector3();

function anchorScreen(anchor, offset) {
  if (!anchor) return null;
  let p;
  if (Array.isArray(anchor)) p = views.project([anchor[0] + offset[0], anchor[1] + offset[1], anchor[2] + offset[2]]);
  else if (anchor.isObject3D) {
    const v = anchor.getWorldPosition(_anchorV);
    v.x += offset[0]; v.y += offset[1]; v.z += offset[2];
    p = views.project(v);
  } else if (typeof anchor.x === 'number' && typeof anchor.y === 'number' && anchor.screen) {
    p = { x: anchor.x, y: anchor.y };
  } else return null;
  return p;
}

function layoutBubble(b) {
  const r = vpRect();
  const p = anchorScreen(b.anchor, b.offset);
  if (!p) { b.root.style.visibility = 'hidden'; return; }
  b.root.style.visibility = '';
  const E = em();
  let ax = p.x * r.width, ay = p.y * r.height;
  const bw = 11 * E, bh = 6.8 * E;
  let dir = b.side === 'left' ? -1 : 1;
  if (b.side !== 'left' && b.side !== 'right') dir = ax + 17 * E > r.width - E ? -1 : 1;
  let bx = dir > 0 ? ax + 5.6 * E : ax - 5.6 * E - bw;
  let by = ay - 2.6 * E - bh;
  if (by < 0.6 * E) {
    const shift = 0.6 * E - by;
    by += shift;
  }
  bx = Math.max(0.6 * E, Math.min(r.width - bw - 0.6 * E, bx));
  b.box.style.transform = `translate(${bx}px, ${by}px)`;
  // dots from the head towards the bubble's near-bottom corner
  const cx = dir > 0 ? bx + 0.4 * E : bx + bw - 0.4 * E, cy = by + bh - 0.2 * E;
  const sx = ax + dir * 1.9 * E, sy = ay - 0.2 * E;
  const sizes = [0.36, 0.5, 0.66];
  b.dots.forEach((d, i) => {
    const t = (i + 0.6) / 3.4;
    const x = sx + (cx - sx) * t, y = sy + (cy - sy) * t;
    const s = sizes[i] * E;
    d.style.width = d.style.height = `${s * 2}px`;
    d.style.transform = `translate(${x - s}px, ${y - s}px)`;
  });
}

function removeBubble(b) {
  if (!bubbles.has(b)) return;
  bubbles.delete(b);
  b.root.classList.add('out');
  setTimeout(() => b.root.remove(), 260); // purely visual removal (not game timing)
  b.resolve();
}

// --------------------------------------------------------------------------- toasts
const toasts = [];
function updateToasts() {
  const c = el.chalk;
  if (!c) return;
  const w = c.clientWidth, hgt = c.clientHeight;
  if (c.width !== w || c.height !== hgt) { c.width = w; c.height = hgt; }
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, hgt);
  if (!toasts.length) return;
  const E = w / 66.5625;
  for (const t of toasts) {
    const size = 5.2 * E;
    let cx = t.pos ? t.pos.x * w : w / 2, cy = t.pos ? t.pos.y * hgt : hgt * 0.42;
    cx = Math.max(size, Math.min(w - size, cx));
    cy = Math.max(size, Math.min(hgt - size * 1.4, cy));
    const strokes = chalkStrokes(t.id, cx - size / 2, cy - size / 2, size);
    g.globalAlpha = t.alpha;
    drawChalk(g, strokes, t.progress, E, 11);
    if (t.labelAlpha > 0) {
      g.globalAlpha = t.alpha * t.labelAlpha;
      g.font = `${1.15 * E}px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.shadowColor = 'rgba(0,0,0,0.85)';
      g.shadowBlur = 0.4 * E;
      g.fillStyle = '#fff';
      g.fillText(t.zh || '', cx, cy + size / 2 + 0.5 * E);
      if (t.en) {
        g.font = `italic ${0.8 * E}px Georgia, serif`;
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.fillText(t.en, cx, cy + size / 2 + 1.9 * E);
      }
      g.shadowBlur = 0;
    }
  }
  g.globalAlpha = 1;
}

// ----------------------------------------------------------------------- film flicker
const film = { active: false, k: 0 };
function drawFilm() {
  const c = el.film;
  const w = c.clientWidth, hgt = c.clientHeight;
  if (c.width !== w || c.height !== hgt) { c.width = w; c.height = hgt; }
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, hgt);
  if (!film.active) return;
  const r = Math.random;
  // brightness flicker
  g.fillStyle = `rgba(${r() < 0.5 ? '255,250,235' : '0,0,0'},${0.05 + r() * 0.16})`;
  g.fillRect(0, 0, w, hgt);
  // scratches
  g.lineCap = 'round';
  for (let i = 0; i < 3 + r() * 4; i++) {
    const x = r() * w;
    g.strokeStyle = r() < 0.6 ? `rgba(20,16,12,${0.3 + r() * 0.4})` : `rgba(255,255,245,${0.25 + r() * 0.35})`;
    g.lineWidth = 0.6 + r() * 1.6;
    g.beginPath();
    const y0 = r() * hgt * 0.4, y1 = hgt * (0.5 + r() * 0.5);
    g.moveTo(x, y0);
    g.quadraticCurveTo(x + (r() - 0.5) * 14, (y0 + y1) / 2, x + (r() - 0.5) * 8, y1);
    g.stroke();
  }
  // dust specks / hairs
  for (let i = 0; i < 14; i++) {
    g.fillStyle = r() < 0.7 ? 'rgba(15,12,10,0.55)' : 'rgba(255,255,250,0.5)';
    const s = 1 + r() * 3.5;
    g.beginPath();
    g.ellipse(r() * w, r() * hgt, s, s * (0.4 + r()), r() * 3, 0, PI * 2);
    g.fill();
  }
  if (r() < 0.3) {
    g.strokeStyle = 'rgba(10,8,6,0.5)';
    g.lineWidth = 1;
    g.beginPath();
    const x = r() * w, y = r() * hgt;
    g.moveTo(x, y);
    g.bezierCurveTo(x + 20, y - 10, x + 30, y + 25, x + 10 + r() * 30, y + 30);
    g.stroke();
  }
}

// ---------------------------------------------------------------------------- the ui
const doc = { open: false, resolve: null, pages: null, page: 0 };
const insp = { open: false, resolve: null, id: null, drag: null, busy: false };
const lb = { open: false, resolve: null, start: '' };   // 全屏放大查看（墙上的画等）
const _lbBox = new THREE.Box3();
const _lbV = new THREE.Vector3();
let arrowCb = null;
let selIndex = -1;
const pending = new Set();
let lastKey = { i: -1, t: 0 };   // 上一次按的物品栏数字键（判断连按两次）
let combining = false;
let fadeValue = 0;

// ------------------------------------------------------------------------ fullscreen
function fullscreenSupported() {
  return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
}

function enterFullscreen() {
  const d = document, e = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) return;
  const req = e.requestFullscreen || e.webkitRequestFullscreen;
  if (!req) return;
  try {
    Promise.resolve(req.call(e, { navigationUI: 'hide' }))
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => { /* 不支持锁定方向（例如电脑或 iOS）时保持现状 */ });
  } catch { /* ignore */ }
}

function toggleFullscreen() {
  const d = document;
  if (d.fullscreenElement || d.webkitFullscreenElement) {
    const exit = d.exitFullscreen || d.webkitExitFullscreen;
    try { Promise.resolve(exit && exit.call(d)).catch(() => {}); } catch { /* ignore */ }
  } else enterFullscreen();
}

// 章节在菜单里能不能选（有没有 load、开发中、前置章节有没有通关）由 progress.js 的 chapterStatus 判断。

// 槽位对应的按键：1–9、0 是前 10 格，- 和 = 是第 11、12 格（第二列）
const SLOT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
/** 数字键（主键盘或小键盘）、- 和 = → 槽位下标，其它键 → -1。 */
function slotKey(ev) {
  const code = ev.code || '';
  let i = -1;
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (m) i = m[1] === '0' ? 9 : Number(m[1]) - 1;
  else if (code === 'Minus' || code === 'NumpadSubtract') i = 10;
  else if (code === 'Equal' || code === 'NumpadAdd') i = 11;
  if (i < 0 && typeof ev.key === 'string' && ev.key.length === 1) i = SLOT_KEYS.indexOf(ev.key);
  return i >= 0 && i < MAX_SLOTS ? i : -1;
}

export const ui = {
  vp: null,
  stage: null,
  arrowState: { left: false, right: false, up: false, down: false },

  get locked() { return lockCount > 0; },
  get modalOpen() { return modalCount > 0 || doc.open || insp.open || lb.open || this.menu.visible; },
  get docOpen() { return doc.open; },
  get inspectOpen() { return insp.open; },
  get imageOpen() { return lb.open; },
  get saying() { return band.running; },
  /** 是否显示触屏界面（最近一次操作用的是手指；由 touch.js 切换 #stage.touch）。 */
  get touchMode() { return !!el.stage && el.stage.classList.contains('touch'); },

  on(evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt).add(fn);
    return () => listeners.get(evt).delete(fn);
  },
  emit,

  // ------------------------------------------------------------------------- init / DOM
  init(eng) {
    engine = eng;
    const stage = document.getElementById('stage') || document.body;
    const root = document.getElementById('ui') || h('div', '', stage);
    root.id = 'ui';
    el.stage = stage;
    el.root = root;
    this.stage = stage;

    const vp = h('div', 'vp', root);
    el.vp = vp;
    this.vp = vp;
    el.dust = h('canvas', 'dust', vp);
    el.grain = h('div', 'grain', vp);
    el.grain.style.backgroundImage = `url(${grainDataURL()})`;
    el.film = h('canvas', 'film', vp);
    el.bubbles = h('div', 'bubbles', vp);
    el.chalk = h('canvas', 'chalk', vp);
    el.titleText = h('div', 'title-text', vp);
    el.logo = h('canvas', 'logo', vp);
    el.narration = h('div', 'narration', vp);
    el.ripples = h('div', 'ripples', vp);
    el.doc = h('div', 'doc', vp);
    el.inspector = h('div', 'inspector', vp);
    el.lightbox = h('div', 'lightbox', vp);
    el.ending = h('div', 'ending', vp);
    el.menu = h('div', 'menu', vp);
    el.fade = h('div', 'fade', vp);
    el.flash = h('div', 'flash', vp);
    el.vignette = h('div', 'vignette', vp);
    el.bandText = h('div', 'band-text', vp);
    el.hint = h('div', 'hint', vp);
    el.arrows = h('div', 'arrows', vp);
    for (const dir of ['left', 'right', 'up', 'down']) {
      const a = h('button', `arrow arrow-${dir}`, el.arrows);
      a.type = 'button';
      a.setAttribute('aria-label', { left: '向左', right: '向右', up: '前进', down: '返回' }[dir]);
      h('i', '', a);
      a.addEventListener('click', (ev) => {
        ev.stopPropagation();
        audio.unlock();
        if (this.locked || this.modalOpen || !arrowCb) return;
        arrowCb(dir);
      });
      el['arrow_' + dir] = a;
    }

    // inventory strip
    const strip = h('div', 'strip', root);
    el.strip = strip;
    el.gear = h('button', 'gear', root);
    el.gear.type = 'button';
    el.gear.setAttribute('aria-label', '设置');
    el.gear.innerHTML = gearSVG();
    el.gear.addEventListener('click', () => { audio.unlock(); this.openSettings(); });
    el.slots = [];
    for (let i = 0; i < MAX_SLOTS; i++) {
      // 第二列（第 7–12 格）在第一列左边，物品超过 6 件时才展开
      const s = h('div', i < COLUMN_SLOTS ? 'slot' : 'slot col2', root);
      s.style.setProperty('--i', i % COLUMN_SLOTS);
      h('div', 'frame-o', s);
      h('div', 'frame-i', s);
      const img = h('img', 'icon', s);
      img.alt = '';
      img.draggable = false;
      h('div', 'key', s, SLOT_KEYS[i] || ''); // 对应的按键
      // 只响应手指 / 触控笔；电脑上鼠标不操作物品栏（槽位在非触屏界面下也不接收指针）
      s.addEventListener('pointerup', (ev) => { if (ev.pointerType !== 'mouse') this._slotPress(i); });
      el.slots.push(s);
    }
    // 全屏按钮（只在触屏界面、且浏览器支持全屏时显示）
    el.full = h('button', 'fullscreen', root);
    el.full.type = 'button';
    el.full.setAttribute('aria-label', '全屏');
    el.full.innerHTML = '<svg viewBox="0 0 28 28"><path d="M4 10V4h6M18 4h6v6M24 18v6h-6M10 24H4v-6" fill="none" stroke="#d8d2c4" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    el.full.addEventListener('click', () => { audio.unlock(); toggleFullscreen(); });
    el.stage.classList.toggle('can-full', fullscreenSupported());
    // 手机竖着拿时提示横过来（宽画面在竖屏里太小）
    el.rotate = h('div', 'rotate-hint', document.body);
    el.rotate.innerHTML = '<svg viewBox="0 0 64 64"><rect x="20" y="8" width="24" height="44" rx="4" fill="none" stroke="#e9e3d4" stroke-width="3"/><path d="M10 40a24 24 0 0 0 20 16" fill="none" stroke="#e9e3d4" stroke-width="3" stroke-linecap="round"/><path d="M24 54l6 2-2-6" fill="none" stroke="#e9e3d4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><div>请把手机横过来游玩</div>';
    el.selName = h('div', 'sel-name', root);
    el.fly = h('div', 'fly-layer', root);
    el.modal = h('div', 'modal', root);

    initDust();
    engine.onFrame((dt) => {
      updateDust(dt);
      for (const b of bubbles) layoutBubble(b);
      updateToasts();
      if (film.active) drawFilm();
    });

    window.addEventListener('keydown', (ev) => this._key(ev));
    state.on('inventory', () => this.renderInventory());
    state.on('select', () => this.renderInventory());
    state.on('view', () => this.clearThoughts());
    state.on('reset', () => { selIndex = -1; pending.clear(); });
    this.renderInventory();
    this.showInventory(false);
  },

  // 键盘：Esc 暂停 / 关闭浮层，数字键操作物品栏。走动和 S / ↓ 返回由 views 处理，
  // 这里处理过的按键会 preventDefault，views 看到后就不再重复处理。
  _key(ev) {
    if (ev.repeat) return;
    const k = ev.key;
    const plain = !ev.ctrlKey && !ev.metaKey && !ev.altKey; // 不拦截 Ctrl+1 切标签页之类的浏览器快捷键
    const closeKey = plain && (k === 'Escape' || k === 'ArrowDown' || ev.code === 'KeyS');
    if (doc.open) {
      if (closeKey) { ev.preventDefault(); this.closeDoc(); }
      return;
    }
    if (insp.open) {
      if (closeKey) { ev.preventDefault(); this.closeInspect(); }
      return;
    }
    if (lb.open) {
      if (closeKey) { ev.preventDefault(); this.closeImage(); }
      return;
    }
    if (el.modal.classList.contains('show')) {
      if (k === 'Escape') { ev.preventDefault(); el.modal.querySelector('.btn')?.click(); }
      return;
    }
    if (this.menu.visible || !plain) return;
    const slot = slotKey(ev);
    if (slot >= 0) {
      ev.preventDefault();
      this._slotPress(slot);
      return;
    }
    if (k === 'Escape' && !this.locked) {
      ev.preventDefault();
      this.openSettings();
    }
  },

  /** 操作第 i 个槽位（数字键或手指点槽位）：选中 / 取消 / 合成 / 连按两次查看。 */
  _slotPress(i) {
    audio.unlock();
    if (this.locked || this.modalOpen || combining) return;
    const id = state.inventory[i];
    const sel = state.selected;
    const now = performance.now();
    const quick = lastKey.i === i && now - lastKey.t < 350;
    lastKey = { i, t: now };
    // 空槽：只取消当前选择
    if (!id) { if (sel) state.select(null); return; }
    if (!sel) {
      selIndex = i;
      state.select(id);
      audio.sfx('click');
      return;
    }
    const selSlot = state.inventory[selIndex] === sel ? selIndex : state.inventory.indexOf(sel);
    if (selSlot === i) {
      // 再按同一个键：快速连按两次 = 查看物品，否则取消选择
      if (quick) { lastKey = { i: -1, t: 0 }; this.inspect(id); return; }
      state.select(null);
      return;
    }
    // 已选中另一件物品：把两件物品合成（配方不对时两个槽位一起抖动）
    combining = true;
    items.combine(sel, id)
      .then((ok) => { if (!ok) this.shakeSlot(i); })
      .finally(() => { combining = false; this.renderInventory(); });
  },

  showInventory(on = true) {
    el.stage.classList.toggle('inv-on', !!on);
  },

  /** 切换室外漫游样式；实际移动由 views 统一驱动。 */
  setRoam(on = true) {
    el.stage.classList.toggle('roam-on', !!on);
  },

  // ------------------------------------------------------------------------- lock
  lock() {
    lockCount++;
    el.stage.classList.add('locked');
    this.setArrows(null);
  },
  unlock() {
    lockCount = Math.max(0, lockCount - 1);
    if (!lockCount) {
      el.stage.classList.remove('locked');
      views.refreshArrows();
    }
  },
  resetLocks() { lockCount = 0; el.stage.classList.remove('locked'); },

  // ----------------------------------------------------------------------- text
  /** Top-centre text. kind: 'line' (dialogue) | 'item' | 'thought' (inner voice) | 'hint'. Queued. */
  say(text, { ms, kind = 'line', replace = false } = {}) {
    if (text == null || text === '') return Promise.resolve();
    if (kind === 'hint') return this.hint(text, { ms });
    const dur = ms ?? (kind === 'item' ? 1800 : 3200);
    return new Promise((resolve) => {
      if (replace) {
        for (const q of band.queue) q.resolve();
        band.queue.length = 0;
        if (band.current) band.current.cancelled = true;
      }
      band.queue.push({ text: String(text), kind, ms: dur, resolve, cancelled: false });
      pumpBand();
    });
  },

  /** Clears queued and current band text. */
  clearSay() {
    for (const q of band.queue) q.resolve();
    band.queue.length = 0;
    if (band.current) band.current.cancelled = true;
  },

  /** White hint text at the top (no band), e.g. tutorial hints. 顶部字幕条正在显示时先排队，等它结束再出现。 */
  hint(text, { ms = 3600 } = {}) {
    const tok = ++this._hintTok;
    el.hint.classList.remove('show');
    const show = () => {
      if (this._hintTok !== tok) return undefined;
      el.hint.textContent = text;
      el.hint.classList.add('show');
      return gameWait(ms).then(() => { if (this._hintTok === tok) el.hint.classList.remove('show'); });
    };
    return band.running ? bandIdle().then(show) : show();
  },
  _hintTok: 0,

  /** Big chapter title lines (black, lower centre), shown one after another, then faded out. */
  title(lines, ms = 3000) {
    const arr = Array.isArray(lines) ? lines : [lines];
    el.titleText.innerHTML = '';
    const spans = arr.map((t) => h('div', 'line', el.titleText, t));
    el.titleText.classList.add('show');
    const n = spans.length;
    return animate(ms, (k) => {
      spans.forEach((s, i) => {
        const t0 = (i / Math.max(1, n)) * 0.42;
        const a = Math.min(1, Math.max(0, (k - t0) / 0.12));
        const out = k > 0.82 ? Math.max(0, 1 - (k - 0.82) / 0.18) : 1;
        s.style.opacity = String(a * out);
      });
    }, Ease.linear).then(() => { el.titleText.classList.remove('show'); el.titleText.innerHTML = ''; });
  },

  /** Intro narration: lines at the top in dark ink, one after another. */
  async narrate(lines, { msPer = 3200 } = {}) {
    const arr = Array.isArray(lines) ? lines : [lines];
    el.narration.classList.add('show');
    for (const line of arr) {
      el.narration.textContent = line;
      await animate(msPer, (k) => {
        const a = Math.min(1, k / 0.12, (1 - k) / 0.12);
        el.narration.style.opacity = String(Math.max(0, a));
      }, Ease.linear);
    }
    el.narration.style.opacity = '0';
    el.narration.classList.remove('show');
  },

  /** Hand-lettered logo text (e.g. ['RUSTY'] → ['RUSTY LAKE'] with sub '出品' in the intro).
   *  lines = null hides it. Resolves after the fade (ms). */
  logo(lines, { sub = null, ms = 600, draw = 0 } = {}) {
    const c = el.logo;
    const from = parseFloat(c.style.opacity || '0');
    if (!lines) {
      return animate(ms, (k) => { c.style.opacity = String(from * (1 - k)); }, Ease.linear);
    }
    const arr = Array.isArray(lines) ? lines : [lines];
    const r = vpRect();
    const pr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(2, Math.round(r.width * pr));
    c.height = Math.max(2, Math.round(r.height * 0.4 * pr));
    const tmp = document.createElement('canvas');
    tmp.width = c.width;
    tmp.height = Math.round(c.height * (arr.length > 1 ? 0.62 : 0.42));
    const paint = (p) => {
      drawHandLines(tmp, arr, { progress: p, color: '#141414' });
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(tmp, 0, c.height * 0.14);
      if (sub) {
        g.fillStyle = '#1a1a1a';
        g.font = `${Math.round(c.height * 0.085)}px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'top';
        g.fillText(sub, c.width / 2, c.height * 0.14 + tmp.height + c.height * 0.04);
      }
    };
    if (draw > 0) {
      c.style.opacity = '1';
      return animate(draw, (k) => paint(k), Ease.linear);
    }
    paint(1);
    return animate(ms, (k) => { c.style.opacity = String(from + (1 - from) * k); }, Ease.linear);
  },

  // ------------------------------------------------------------------- thought bubble
  /** Black comic thought bubble with a white-line item icon (or custom draw) anchored to a 3D
   *  object. ms = 0 keeps it until clearThoughts() / the view changes. */
  thought(anchor, iconItemId = null, { ms = 2600, offset = [0, 0.35, 0], draw = null, side = null } = {}) {
    return new Promise((resolve) => {
      const root = h('div', 'thought', el.bubbles);
      const box = h('div', 'bubble', root);
      const cv = h('canvas', '', box);
      cv.width = 352; cv.height = 218;
      const g = cv.getContext('2d');
      if (draw) {
        try { draw(g, cv.width, cv.height); } catch (err) { console.error('[ui] thought draw failed', err); }
      } else if (iconItemId) {
        const line = items.lineIcon(iconItemId);
        if (line) {
          const s = Math.min(cv.width / line.width, cv.height / line.height) * 1.08;
          const w = line.width * s, hh = line.height * s;
          g.drawImage(line, (cv.width - w) / 2, (cv.height - hh) / 2, w, hh);
        }
      }
      const dots = [h('div', 'dot d1', root), h('div', 'dot d2', root), h('div', 'dot d3', root)];
      const b = { root, box, dots, anchor, offset, side, resolve };
      bubbles.add(b);
      layoutBubble(b);
      requestAnimationFrame(() => root.classList.add('in'));
      if (ms > 0 && Number.isFinite(ms)) gameWait(ms, () => !bubbles.has(b)).then(() => removeBubble(b));
    });
  },
  clearThoughts() { for (const b of [...bubbles]) removeBubble(b); },

  // -------------------------------------------------------------------- screen fx
  fade(opacity = 1, ms = 300) {
    const from = fadeValue;
    const to = Math.max(0, Math.min(1, opacity));
    if (ms <= 0) { fadeValue = to; el.fade.style.opacity = String(to); return Promise.resolve(); }
    return animate(ms, (k) => {
      fadeValue = from + (to - from) * k;
      el.fade.style.opacity = String(fadeValue);
    }, Ease.linear);
  },
  get fadeLevel() { return fadeValue; },

  flash(color = '#fff', ms = 400) {
    el.flash.style.background = color;
    return animate(ms, (k) => { el.flash.style.opacity = String(1 - k); }, Ease.outSine)
      .then(() => { el.flash.style.opacity = '0'; });
  },

  filmFlicker(ms = 900) {
    audio.sfx('flicker');
    film.active = true;
    el.stage.classList.add('film-on');
    const canvas = engine.canvas;
    return animate(ms, () => {
      const j = 3;
      canvas.style.transform = `translate(${(Math.random() - 0.5) * j}px, ${(Math.random() - 0.5) * j}px)`;
      el.grain.style.opacity = String(0.18 + Math.random() * 0.2);
    }, Ease.linear).then(() => {
      film.active = false;
      el.stage.classList.remove('film-on');
      canvas.style.transform = '';
      el.grain.style.opacity = '';
      drawFilm();
    });
  },

  /** Chalk-line achievement toast. opts.anchor: Object3D / [x,y,z] to draw it next to. */
  toast({ id, zh, en } = {}, { anchor = null, ms = 3600 } = {}) {
    audio.sfx('achievement');
    let pos = null;
    if (anchor) {
      const p = anchorScreen(anchor, [0, 0, 0]);
      if (p) pos = { x: p.x, y: p.y };
    }
    const t = { id, zh, en, pos, progress: 0, alpha: 1, labelAlpha: 0 };
    toasts.push(t);
    const total = ms;
    return animate(total, (k) => {
      const tt = k * total;
      t.progress = Math.min(1, tt / 1300);
      t.labelAlpha = Math.min(1, Math.max(0, (tt - 1000) / 400));
      t.alpha = tt > total - 700 ? Math.max(0, (total - tt) / 700) : 1;
    }, Ease.linear).then(() => { toasts.splice(toasts.indexOf(t), 1); });
  },

  ripple(clientX, clientY) {
    const r = vpRect();
    const d = h('div', 'ripple', el.ripples);
    d.style.left = `${clientX - r.left}px`;
    d.style.top = `${clientY - r.top}px`;
    d.addEventListener('animationend', () => d.remove());
  },

  // --------------------------------------------------------------------- arrows
  setArrows(cfg, onClick) {
    if (onClick) arrowCb = onClick;
    const st = cfg || { left: false, right: false, up: false, down: false };
    const hide = !cfg || this.locked;
    for (const dir of ['left', 'right', 'up', 'down']) {
      const on = !hide && !!st[dir];
      this.arrowState[dir] = on;
      el['arrow_' + dir].classList.toggle('show', on);
    }
    if (cfg) this.moveUpArrow(cfg.upScreen || null);
  },
  moveUpArrow(pos) {
    const a = el.arrow_up;
    if (pos) {
      a.style.left = `${Math.max(0.03, Math.min(0.97, pos.x)) * 100}%`;
      a.style.top = `${Math.max(0.05, Math.min(0.9, pos.y)) * 100}%`;
    } else {
      a.style.left = '50%';
      a.style.top = '84%';
    }
  },

  // ------------------------------------------------------------------ inventory
  renderInventory() {
    if (!el.slots) return;
    const inv = state.inventory;
    // 超过一列（6 件）时展开第二列；正在飞进第二列的物品也算
    let wide = inv.length > COLUMN_SLOTS;
    for (const p of pending) if (p >= COLUMN_SLOTS) wide = true;
    el.stage.classList.toggle('inv-wide', wide);
    let hi = -1;
    if (state.selected) {
      hi = inv[selIndex] === state.selected ? selIndex : inv.indexOf(state.selected);
    }
    el.slots.forEach((s, i) => {
      const id = inv[i];
      const img = s.querySelector('img');
      if (id && !pending.has(i)) {
        const url = items.icon(id);
        if (img.dataset.src !== url) { img.src = url; img.dataset.src = url; }
        img.style.visibility = 'visible';
        s.dataset.item = id;
      } else {
        img.style.visibility = 'hidden';
        s.dataset.item = id || '';
      }
      s.classList.toggle('filled', !!id);
      s.classList.toggle('sel', i === hi);
    });
    if (hi >= 0) {
      el.selName.innerHTML = '';
      h('span', '', el.selName, items.name(state.selected));
      el.selName.style.setProperty('--i', hi % COLUMN_SLOTS);
      el.selName.style.setProperty('--c', Math.floor(hi / COLUMN_SLOTS));
      el.selName.classList.add('show');
    } else {
      el.selName.classList.remove('show');
    }
  },

  /** Select the slot i (used by tests). */
  selectSlot(i) {
    const id = state.inventory[i];
    selIndex = id ? i : -1;
    state.select(id || null);
  },

  shakeSelected() {
    let i = state.selected ? state.inventory.indexOf(state.selected) : -1;
    if (state.selected && state.inventory[selIndex] === state.selected) i = selIndex;
    if (i < 0) i = lastKey.i;
    this.shakeSlot(i);
  },

  shakeSlot(i) {
    const s = el.slots && el.slots[i];
    if (!s) return;
    s.classList.remove('shake');
    void s.offsetWidth;
    s.classList.add('shake');
    s.addEventListener('animationend', () => s.classList.remove('shake'), { once: true });
  },

  markPending(index) { pending.add(index); if (index >= COLUMN_SLOTS) this.renderInventory(); },

  /** Animate an item icon flying into slot `index` from a 3D object / screen point / centre. */
  flyToSlot(id, index, from = null) {
    const slot = el.slots[index];
    if (!slot) { pending.delete(index); this.renderInventory(); return Promise.resolve(); }
    const sr = el.stage.getBoundingClientRect();
    const r = vpRect();
    let start = { x: r.left + r.width / 2 - sr.left, y: r.top + r.height * 0.45 - sr.top };
    const p = from ? anchorScreen(from, [0, 0, 0]) : null;
    if (p) start = { x: r.left + p.x * r.width - sr.left, y: r.top + p.y * r.height - sr.top };
    const tr = slot.getBoundingClientRect();
    const end = { x: tr.left + tr.width / 2 - sr.left, y: tr.top + tr.height / 2 - sr.top };
    const img = h('img', 'fly', el.fly);
    img.src = items.icon(id);
    const size = tr.width * 1.6;
    img.style.width = img.style.height = `${size}px`;
    return animate(520, (k) => {
      const x = start.x + (end.x - start.x) * k;
      const y = start.y + (end.y - start.y) * k - Math.sin(k * PI) * size * 0.6;
      const s = 1.5 - 0.5 * k;
      img.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px) scale(${s})`;
      img.style.opacity = String(Math.min(1, k * 4));
    }, Ease.inOutSine).then(() => {
      img.remove();
      pending.delete(index);
      this.renderInventory();
    });
  },

  // --------------------------------------------------------------------- letter reader
  /** Letter reader. pages: [{ html | lines: [...], translations?: [zh lines] }]. Click a line to
   *  see its translation in the band; ▼ closes. Resolves when closed. */
  doc({ pages = [], hint = '点击文字来翻译', envelope = true } = {}) {
    if (doc.open) this.closeDoc();
    return new Promise((resolve) => {
      doc.open = true;
      doc.resolve = resolve;
      doc.pages = pages.length ? pages : [{ lines: [''] }];
      doc.page = 0;
      el.stage.classList.add('doc-on');
      el.doc.innerHTML = '';
      el.doc.classList.toggle('no-envelope', !envelope);
      const wrap = h('div', 'doc-wrap', el.doc);
      if (envelope) h('div', 'envelope', wrap);
      const paper = h('div', 'paper', wrap);
      paper.style.backgroundImage = `url(${paperDataURL()})`;
      h('div', 'fold', paper);
      const body = h('div', 'paper-body', paper);
      const nav = h('div', 'doc-nav', el.doc);
      const prev = h('button', 'arrow arrow-left show', nav); h('i', '', prev);
      const next = h('button', 'arrow arrow-right show', nav); h('i', '', next);
      const close = h('button', 'arrow arrow-down show', nav); h('i', '', close);
      const render = () => {
        const pg = doc.pages[doc.page];
        body.innerHTML = '';
        if (pg.lines) for (const ln of pg.lines) h('div', 'line', body, ln);
        else body.innerHTML = pg.html || '';
        let targets = [...body.querySelectorAll('[data-tr], .line')];
        if (!targets.length) targets = [...body.children];
        targets.forEach((t, i) => {
          t.classList.add('tr');
          const tr = t.dataset.tr || (pg.translations && pg.translations[i]);
          if (!tr) return;
          t.addEventListener('click', (ev) => {
            ev.stopPropagation();
            audio.sfx('page');
            targets.forEach((o) => o.classList.remove('active'));
            t.classList.add('active');
            this.say(tr, { kind: 'line', replace: true, ms: 4000 });
          });
        });
        prev.style.display = doc.page > 0 ? '' : 'none';
        next.style.display = doc.page < doc.pages.length - 1 ? '' : 'none';
      };
      prev.addEventListener('click', () => { if (doc.page > 0) { doc.page--; audio.sfx('page'); render(); } });
      next.addEventListener('click', () => { if (doc.page < doc.pages.length - 1) { doc.page++; audio.sfx('page'); render(); } });
      close.addEventListener('click', () => this.closeDoc());
      render();
      audio.sfx('page');
      this.setArrows(null);
      requestAnimationFrame(() => el.doc.classList.add('show'));
      if (hint) this.hint(hint, { ms: 3200 });
    });
  },

  closeDoc() {
    if (!doc.open) return;
    doc.open = false;
    el.doc.classList.remove('show');
    el.stage.classList.remove('doc-on');
    el.doc.innerHTML = '';
    this.clearSay();
    const r = doc.resolve;
    doc.resolve = null;
    views.refreshArrows();
    if (r) r();
  },

  // ----------------------------------------------------------------------- inspector
  /** Item inspector: drag to rotate the 3D model, click a part → onInspectClick(ctx, part). */
  inspect(itemId) {
    if (insp.open) this.closeInspect();
    return new Promise((resolve) => {
      insp.open = true;
      insp.resolve = resolve;
      insp.id = itemId;
      el.inspector.innerHTML = '';
      const holder = h('div', 'insp-holder', el.inspector);
      h('div', 'insp-name', el.inspector, items.name(itemId));
      const nav = h('div', 'doc-nav', el.inspector);
      const close = h('button', 'arrow arrow-down show', nav); h('i', '', close);
      close.addEventListener('click', () => this.closeInspect());
      const ok = items.openInspector(itemId, holder);
      if (!ok) {
        const img = h('img', 'insp-fallback', holder);
        img.src = items.icon(itemId);
      }
      holder.addEventListener('pointerdown', (ev) => {
        insp.drag = { x: ev.clientX, y: ev.clientY, x0: ev.clientX, y0: ev.clientY };
        try { holder.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
      });
      holder.addEventListener('pointermove', (ev) => {
        if (!insp.drag) return;
        const r = holder.getBoundingClientRect();
        items.rotateInspector(((ev.clientX - insp.drag.x) / r.width) * 4, ((ev.clientY - insp.drag.y) / r.height) * 3);
        insp.drag.x = ev.clientX; insp.drag.y = ev.clientY;
      });
      holder.addEventListener('pointerup', async (ev) => {
        const d = insp.drag;
        insp.drag = null;
        if (!d || Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) > (ev.pointerType === 'mouse' ? 6 : 12)) return;
        const r = holder.getBoundingClientRect();
        const part = items.pickInspector((ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height);
        if (part == null) return;
        this.ripple(ev.clientX, ev.clientY);
        await this.inspectClick(itemId, part);
      });
      this.setArrows(null);
      el.stage.classList.add('insp-on');
      requestAnimationFrame(() => el.inspector.classList.add('show'));
    });
  },

  async inspectClick(itemId, part) {
    const def = items.get(itemId);
    if (!def || !def.onInspectClick || insp.busy) return false;
    insp.busy = true;
    try {
      await def.onInspectClick(ctx, part);
      state.save();
      return true;
    } finally {
      insp.busy = false;
    }
  },

  closeInspect() {
    if (!insp.open) return;
    insp.open = false;
    items.closeInspector();
    el.inspector.classList.remove('show');
    el.stage.classList.remove('insp-on');
    el.inspector.innerHTML = '';
    const r = insp.resolve;
    insp.resolve = null;
    views.refreshArrows();
    if (r) r();
  },

  // ---------------------------------------------------------------------- 全屏放大查看
  /**
   * 全屏放大查看一张图（墙上的画等）。src：canvas；opts.from：场景里的 Object3D，图片从它在屏幕上的
   * 位置放大到画面中央；opts.title：图下方的说明。点任意处、▼ 或 Esc / S / ↓ 关闭，关闭时 resolve。
   */
  viewImage(src, { title = '', from = null } = {}) {
    if (lb.open) this.closeImage();
    return new Promise((resolve) => {
      lb.open = true;
      lb.resolve = resolve;
      const box = el.lightbox;
      box.innerHTML = '';
      const r = vpRect();
      const ar = src.width / src.height;
      let w = r.width * 0.84, hh = w / ar;
      if (hh > r.height * 0.76) { hh = r.height * 0.76; w = hh * ar; }
      const x = (r.width - w) / 2, y = (r.height - hh) / 2 - r.height * 0.03;
      const frame = h('div', 'lb-frame', box);
      Object.assign(frame.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hh}px` });
      src.classList.add('lb-img');
      frame.appendChild(src);
      if (title) {
        const t = h('div', 'lb-title', box, title);
        t.style.top = `${y + hh + em() * 0.9}px`;
      }
      const nav = h('div', 'doc-nav', box);
      const close = h('button', 'arrow arrow-down show', nav); h('i', '', close);
      // 起点：画在屏幕上的范围（投影包围盒的 8 个角）
      lb.start = '';
      if (from && from.isObject3D) {
        _lbBox.setFromObject(from);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < 8; i++) {
          _lbV.set(i & 1 ? _lbBox.max.x : _lbBox.min.x, i & 2 ? _lbBox.max.y : _lbBox.min.y, i & 4 ? _lbBox.max.z : _lbBox.min.z);
          const p = views.project(_lbV);
          if (!p) continue;
          x0 = Math.min(x0, p.x * r.width); x1 = Math.max(x1, p.x * r.width);
          y0 = Math.min(y0, p.y * r.height); y1 = Math.max(y1, p.y * r.height);
        }
        if (x1 > x0 && y1 > y0) {
          lb.start = `translate(${(x0 + x1) / 2 - (x + w / 2)}px, ${(y0 + y1) / 2 - (y + hh / 2)}px) scale(${(x1 - x0) / w}, ${(y1 - y0) / hh})`;
        }
      }
      frame.style.transform = lb.start || 'scale(0.6)';
      frame.style.opacity = lb.start ? '1' : '0';
      box.onclick = () => this.closeImage();
      this.setArrows(null);
      audio.sfx('page');
      requestAnimationFrame(() => {
        box.classList.add('show');
        requestAnimationFrame(() => { frame.style.transform = 'none'; frame.style.opacity = '1'; });
      });
    });
  },

  closeImage() {
    if (!lb.open) return;
    lb.open = false;
    const box = el.lightbox;
    const frame = box.querySelector('.lb-frame');
    if (frame) {
      frame.style.transform = lb.start || 'scale(0.6)';
      if (!lb.start) frame.style.opacity = '0';
    }
    box.classList.remove('show');
    box.onclick = null;
    setTimeout(() => { if (!lb.open) box.innerHTML = ''; }, 380); // purely visual removal (not game timing)
    const r = lb.resolve;
    lb.resolve = null;
    views.refreshArrows();
    if (r) r();
  },

  // ------------------------------------------------------------------------- settings
  openSettings() {
    if (this.menu.visible || el.modal.classList.contains('show')) return;
    modalCount++;
    el.modal.innerHTML = '';
    const p = h('div', 'panel', el.modal);
    h('h2', '', p, '暂停');
    volumeRow(p);
    const row = h('div', 'btn-row', p);
    const resume = h('button', 'btn', row, '继续游戏');
    const toMenu = h('button', 'btn', row, '返回主菜单');
    const close = () => { el.modal.classList.remove('show'); el.modal.innerHTML = ''; modalCount = Math.max(0, modalCount - 1); views.refreshArrows(); };
    resume.addEventListener('click', close);
    toMenu.addEventListener('click', () => { close(); state.save(); emit('menu'); });
    el.modal.classList.add('show');
    this.setArrows(null);
  },

  // --------------------------------------------------------------------------- ending
  // main.js 注册：() => { number, label, title } | null。有下一灾（已解锁、可进入）时，结尾卡多一个“进入下一灾”按钮，
  // 并在按钮出现后倒数几秒自动进入（点“返回主菜单”或关掉结尾卡就取消）；点了 / 倒数完发 'next' 事件，由 main.js 换章。
  endingNext: null,
  autoAdvance: true,         // 测试页（?autotest=1）关掉，免得通关后页面自己跳走
  setEndingNext(fn) { this.endingNext = typeof fn === 'function' ? fn : null; },

  ending({ zh = '完', en = '' } = {}) {
    el.ending.innerHTML = '';
    const seq = ++endingSeq;
    const next = this.endingNext ? this.endingNext() : null;
    const box = h('div', 'ending-box', el.ending);
    const t = h('div', 'ending-zh', box, zh);
    const e = h('div', 'ending-en', box, en);
    const row = h('div', 'ending-row', box);
    const goBtn = next ? h('button', 'btn ending-btn ending-next', row, `进入${next.label.zh} · ${next.title.zh}`) : null;
    const btn = h('button', 'btn ending-btn', row, '返回主菜单');
    const note = h('div', 'ending-note', box);
    btn.addEventListener('click', () => {
      endingSeq++;
      el.ending.classList.remove('show');
      modalCount = Math.max(0, modalCount - 1);
      emit('menu');
    });
    if (goBtn) {
      goBtn.addEventListener('click', () => {
        if (seq !== endingSeq) return;
        endingSeq++;
        audio.sfx('click');
        note.textContent = `正在进入${next.label.zh} · ${next.title.zh}……`;
        emit('next', next);
      });
    }
    modalCount++;
    el.ending.classList.add('show');
    audio.music('ending');
    const shown = animate(3600, (k) => {
      const tt = k * 3600;
      el.ending.style.setProperty('--bg', String(Math.min(1, tt / 1200)));
      t.style.opacity = String(Math.min(1, Math.max(0, (tt - 900) / 900)));
      e.style.opacity = String(Math.min(1, Math.max(0, (tt - 1600) / 900)));
      const bo = String(Math.min(1, Math.max(0, (tt - 2600) / 800)));
      if (goBtn) goBtn.style.opacity = bo;
      btn.style.opacity = bo;
    }, Ease.linear);
    if (goBtn && this.autoAdvance) {
      // 倒数用游戏时间（和结尾动画一样跟随 timeScale）；页面在后台时不走，玩家没在看就不会被带走
      shown.then(async () => {
        for (let n = ENDING_AUTO_SECONDS; n > 0; n--) {
          if (seq !== endingSeq) return;
          note.textContent = `${n} 秒后自动进入${next.label.zh} · ${next.title.zh}`;
          await gameWait(1000, () => seq !== endingSeq);
        }
        if (seq === endingSeq) goBtn.click();
      });
    }
    return shown;
  },
  hideEnding() {
    endingSeq++;
    if (!el.ending.classList.contains('show')) return;
    el.ending.classList.remove('show');
    modalCount = Math.max(0, modalCount - 1);
  },

  // --------------------------------------------------------------------- reset helpers
  /** Remove transient overlays (bubbles, toasts, text, docs) — used when (re)starting a chapter. */
  resetOverlays() {
    this.clearThoughts();
    this.clearSay();
    toasts.length = 0;
    if (doc.open) this.closeDoc();
    if (insp.open) this.closeInspect();
    if (lb.open) this.closeImage();
    this.hideEnding();
    el.titleText.classList.remove('show');
    el.narration.classList.remove('show');
    el.narration.style.opacity = '0';
    el.logo.style.opacity = '0';
    el.hint.classList.remove('show');
    film.active = false;
    el.stage.classList.remove('film-on');
    pending.clear();
  },

  // ----------------------------------------------------------------------- the title menu
  menu: {
    visible: false,
    _resolve: null,

    /** Show the title screen. Resolves with { number, fresh } when the player starts a chapter. */
    show(chapters = []) {
      const done = new Promise((resolve) => { this._resolve = resolve; });
      this.build(chapters);
      return done;
    },

    /** 画一遍标题菜单。“重置进度”之后会再画一遍（传 statusText），让通关标记和锁跟着变。 */
    build(chapters, statusText = null) {
      this.visible = true;
      const m = el.menu;
      m.innerHTML = '';
      el.stage.classList.add('menu-on');
      ui.showInventory(false);
      ui.setArrows(null);
      h('div', 'menu-tint', m);
      const title = h('canvas', 'menu-title', m);
      const r = vpRect();
      const pr = Math.min(2, window.devicePixelRatio || 1);
      title.width = Math.round(r.width * 0.5 * pr);
      title.height = Math.round(r.height * 0.27 * pr);
      drawHandLines(title, ['RUSTY LAKE', 'PARADISE'], { color: '#121212' });
      const play = h('button', 'menu-play', m);
      play.type = 'button';
      play.setAttribute('aria-label', '开始');
      play.innerHTML = '<svg viewBox="0 0 100 100"><path d="M6 7 L93 5 L95 94 L5 95 Z" fill="none" stroke="#111" stroke-width="5" stroke-linejoin="round"/><path d="M37 29 L70 50 L37 72 Z" fill="#111"/></svg>';
      const links = h('div', 'menu-links', m);
      // ▶：最近玩的那一章（没打完）→ 第一个已开放、没通关的章节（通关第一灾后就是第二灾）→ 从头重玩
      const first = chapters.find((c) => chapterStatus(c, chapters) === 'open') || chapters[0];
      const resume = resumeChapter(chapters);
      const resumeSave = resume ? liveSave(resume) : null;
      let statusMsg = '';
      if (!state.storageOk()) statusMsg = '这里不能保存进度，关掉后会从头开始';
      else if (resumeSave) statusMsg = `继续：${resume.label.zh} · ${resume.title.zh}`;
      else if (resume && first && resume.id !== first.id) statusMsg = `下一章：${resume.label.zh} · ${resume.title.zh}`;
      const status = h('div', 'menu-status', m, statusText != null ? statusText : statusMsg);
      const newBtn = h('button', 'menu-link', links, '新游戏');
      const achBtn = h('button', 'menu-link', links, '成就');
      const setBtn = h('button', 'menu-link', links, '设置');
      const grid = h('div', 'plagues', m);
      chapters.forEach((c) => {
        const st = chapterStatus(c, chapters);
        const need = requiredChapter(c, chapters);
        const card = h('button', 'plague' + (st === 'open' ? ' open' : ' locked' + (st === 'locked' ? ' gated' : '')) + (state.isCleared(c.id) ? ' done' : ''), grid);
        card.type = 'button';
        h('div', 'num', card, roman(c.number));
        h('div', 'zh', card, st === 'open' ? c.title.zh : st === 'locked' ? '未解锁' : '敬请期待');
        h('div', 'lbl', card, c.label.zh);
        card.addEventListener('click', () => {
          audio.unlock();
          if (st !== 'open') {
            audio.sfx('wrong');
            card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
            status.textContent = st === 'locked' && need ? `${c.label.zh} · ${c.title.zh} —— 通关${need.label.zh}后解锁` : `${c.label.zh} · ${c.title.zh} —— 敬请期待`;
            return;
          }
          if (liveSave(c)) chooseContinue(c);
          else finish({ number: c.number, fresh: true });
        });
      });
      const finish = (choice) => {
        audio.unlock();
        audio.sfx('click');
        // 手机上开始游戏时顺便进入全屏并锁定横屏（浏览器支持时）
        if (ui.touchMode) enterFullscreen();
        const res = this._resolve;
        this._resolve = null;
        if (res) res(choice);
      };
      const chooseContinue = (c) => {
        const p = panel(m, `${c.label.zh} · ${c.title.zh}`);
        const row = h('div', 'btn-row', p);
        h('button', 'btn', row, '继续游戏').addEventListener('click', () => finish({ number: c.number, fresh: false }));
        h('button', 'btn', row, '重新开始').addEventListener('click', () => finish({ number: c.number, fresh: true }));
      };
      play.addEventListener('click', () => {
        if (!resume) return;
        finish({ number: resume.number, fresh: !resumeSave });
      });
      newBtn.addEventListener('click', () => {
        audio.unlock();
        if (!first) return;
        if (!state.hasSave(first.id)) { finish({ number: first.number, fresh: true }); return; }
        const p = panel(m, '重新开始？');
        h('p', '', p, '当前进度将被覆盖。');
        const row = h('div', 'btn-row', p);
        h('button', 'btn', row, '确定').addEventListener('click', () => finish({ number: first.number, fresh: true }));
        h('button', 'btn', row, '取消').addEventListener('click', () => p.parentNode.remove());
      });
      achBtn.addEventListener('click', () => { audio.unlock(); achievementsPanel(m, chapters); });
      setBtn.addEventListener('click', () => { audio.unlock(); settingsPanel(m, () => this.build(chapters, '进度已重置')); });
      requestAnimationFrame(() => m.classList.add('show'));
    },

    hide() {
      this.visible = false;
      el.menu.classList.remove('show');
      el.stage.classList.remove('menu-on');
      el.menu.innerHTML = '';
    },
  },
};

// --------------------------------------------------------------------- menu helpers
function roman(n) {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n);
}

function panel(parent, title) {
  const wrap = h('div', 'menu-panel', parent);
  const p = h('div', 'panel', wrap);
  const x = h('button', 'panel-x', p, '×');
  x.addEventListener('click', () => wrap.remove());
  wrap.addEventListener('click', (ev) => { if (ev.target === wrap) wrap.remove(); });
  if (title) h('h2', '', p, title);
  return p;
}

function volumeRow(p) {
  const row = h('label', 'vol-row', p);
  h('span', '', row, '音量');
  const input = h('input', '', row);
  input.type = 'range'; input.min = '0'; input.max = '100';
  input.value = String(Math.round(audio.volume * 100));
  const val = h('span', 'vol-val', row, input.value);
  input.addEventListener('input', () => { audio.setVolume(Number(input.value) / 100); val.textContent = input.value; });
  const mrow = h('label', 'vol-row', p);
  const cb = h('input', '', mrow);
  cb.type = 'checkbox';
  cb.checked = audio.muted;
  h('span', '', mrow, '静音');
  cb.addEventListener('change', () => audio.mute(cb.checked));
}

function settingsPanel(parent, onWiped) {
  const p = panel(parent, '设置');
  volumeRow(p);
  h('p', 'set-note', p, '进度、通关记录和成就保存在这台设备的浏览器里，清除浏览器数据或换设备后不会带过去。');
  const row = h('div', 'btn-row', p);
  const reset = h('button', 'btn danger', row, '重置进度');
  reset.addEventListener('click', () => {
    const q = panel(parent, '重置全部进度？');
    h('p', '', q, '所有存档、通关记录与成就都将被清除。');
    const r2 = h('div', 'btn-row', q);
    h('button', 'btn danger', r2, '清除').addEventListener('click', () => {
      state.wipeAll();
      q.parentNode.remove();
      p.parentNode.remove();
      if (onWiped) onWiped();
      else { const st = parent.querySelector('.menu-status'); if (st) st.textContent = '进度已重置'; }
    });
    h('button', 'btn', r2, '取消').addEventListener('click', () => q.parentNode.remove());
  });
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const z = (n) => (n < 10 ? '0' : '') + n;
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
}

// 成就面板：按章节分组，列出这一章所有成就（没解锁的变暗），已解锁的写明首次解锁时间（成就历史存在本机，见 state.js）。
// 没有成就表的章节（或没装载的章节）里解锁过的成就，用解锁时记下的名字放进“其他章节”。
function achievementsPanel(parent, chapters = []) {
  const p = panel(parent, '成就');
  const scroll = h('div', 'ach-scroll', p);
  const hist = state.achievementHistory();
  const shown = new Set();
  const group = (head, tail, rows) => {
    const hd = h('div', 'ach-head', scroll);
    h('span', '', hd, head);
    h('span', 'ach-count', hd, tail);
    const list = h('div', 'ach-list', scroll);
    for (const { id, zh, en } of rows) {
      shown.add(id);
      const got = !!hist[id];
      const row = h('div', 'ach' + (got ? ' got' : ''), list);
      const c = h('canvas', 'ach-icon', row);
      c.width = c.height = 96;
      const g = c.getContext('2d');
      g.fillStyle = '#1b1d1d';
      g.fillRect(0, 0, 96, 96);
      drawChalk(g, chalkStrokes(id, 12, 12, 72), 1, 3.2, 5);
      const txt = h('div', 'ach-txt', row);
      h('div', 'ach-zh', txt, zh || id);
      h('div', 'ach-en', txt, got ? (en || '') : '尚未解锁');
      if (got && hist[id].t) h('div', 'ach-date', txt, fmtTime(hist[id].t));
    }
  };
  for (const c of chapters) {
    if (!c.achievements) continue;
    const ids = Object.keys(c.achievements);
    if (!ids.length) continue;
    const have = ids.filter((id) => hist[id]).length;
    group(`${c.label.zh} · ${c.title.zh}${state.isCleared(c.id) ? '　已通关' : ''}`, `${have} / ${ids.length}`,
      ids.map((id) => ({ id, zh: c.achievements[id].zh, en: c.achievements[id].en })));
  }
  const rest = Object.keys(hist).filter((id) => !shown.has(id));
  if (rest.length) {
    const defs = ctx.achievementDefs || {};
    group('其他章节', `${rest.length}`, rest.map((id) => ({ id, zh: hist[id].zh || (defs[id] && defs[id].zh), en: hist[id].en || (defs[id] && defs[id].en) })));
  }
  if (!shown.size) h('p', '', p, '暂无成就。');
}

function gearSVG() {
  let d = '';
  const n = 8, R = 11, r = 8.2;
  for (let i = 0; i < n * 2; i++) {
    const a0 = (i / (n * 2)) * PI * 2, a1 = ((i + 1) / (n * 2)) * PI * 2;
    const rad = i % 2 === 0 ? R : r;
    d += `${i === 0 ? 'M' : 'L'}${(14 + Math.cos(a0) * rad).toFixed(2)} ${(14 + Math.sin(a0) * rad).toFixed(2)} L${(14 + Math.cos(a1) * rad).toFixed(2)} ${(14 + Math.sin(a1) * rad).toFixed(2)} `;
  }
  return `<svg viewBox="0 0 28 28"><path d="${d}Z" fill="#d8d2c4" stroke="#111" stroke-width="1.2"/><circle cx="14" cy="14" r="3.6" fill="#111"/></svg>`;
}

export { drawHandLines };
export const storageRef = storage;
