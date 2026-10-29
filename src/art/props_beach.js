// Beach props + beach items for Plague I (contract: ARCHITECTURE.md §Props / props_beach.js,
// documented in docs/impl_props_beach.md). Everything procedural, cartoon toon() materials with
// black ink outlines, colours sampled from the reference frames (design doc §2.4 / §4 / §5).
//
// Conventions
//  - 1 unit = 1 m. Props: origin on the ground (y = 0), front faces +z.
//  - Items (machete, hook, line, stick, worm, shrimp): origin at the item's centre, long axis along
//    +x, their "picture" side faces +z (so a front camera sees the inventory-icon silhouette).
//  - Every state-changing method returns a Promise and accepts `{ instant: true }` as its last arg.
//    Animated calls on one object are serialised (queued); instant calls apply immediately.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, unlit, canvasTexture, rng, shade, tex } from './materials.js';
import { animate, Ease } from '../core/tween.js';

const PI = Math.PI;
const TAU = PI * 2;

// Colours sampled from the playthrough frames.
const C = {
  ink: '#151413',
  machHandle: '#daab5f', machBlade: '#dcdad4', rivet: '#3b2a17',
  hook: '#1e1e1e',
  spoolWood: '#cfae80', line: '#161515',
  cane: '#c4a87b', caneNode: '#4a3b28', leaf: '#9cbb55', leafVein: '#6f8b37',
  worm: '#bcb1c8', wormLine: '#6f6380',
  shrimp: '#ec5a2c', shrimpDark: '#b8361a', shrimpFeeler: '#6e2412',
  post: '#b8946a', door: '#997c5c', sign: '#4a3722',
  skin: '#d3cac1', brow: '#b56d36', bag: '#9b938a', hand: '#d6cabe', hole: '#2e302d',
  fruit: '#9a4222', fruitRidge: '#4b2618', flesh: '#8e2015', juice: '#a3282a', mouth: '#cfa77f',
  rock: '#8f918d', rockDark: '#5c5e5a',
  hull: '#8e887c', hullIn: '#7b776c', floor: '#a29b8e', thwart: '#b3ac98',
  box: '#b28c81', boxIn: '#4d3d39', bolt: '#beb2af', envelope: '#d6b86f',
};

// ---------------------------------------------------------------------------
// Small helpers

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = V3(0, 1, 0);

/** Bake a transform into a geometry. r = Euler [x,y,z], s = number | [x,y,z]. */
function xf(geo, p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  const sc = typeof s === 'number' ? [s, s, s] : s;
  const m = new THREE.Matrix4().compose(V3(...p), _q.clone().setFromEuler(_e.set(r[0], r[1], r[2])), V3(...sc));
  geo.applyMatrix4(m);
  return geo;
}

function prep(geo, withColor) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const keep = withColor ? ['position', 'normal', 'uv', 'color'] : ['position', 'normal', 'uv'];
  for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (withColor && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}
/** Merge geometries (indexed or not) into one non-indexed geometry. */
function merge(geos, withColor = false, useGroups = false) {
  return mergeGeometries(geos.map((g) => prep(g, withColor)), useGroups);
}
function tint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
function setUV(geo, u, v) {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { a[i * 2] = u; a[i * 2 + 1] = v; }
  geo.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  return geo;
}
function scaleUV(geo, su, sv, swap = false) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i), v = uv.getY(i);
    if (swap) [u, v] = [v, u];
    uv.setXY(i, u * su, v * sv);
  }
  return geo;
}
/** Planar UV projection over the geometry's bounds (axes 0=x 1=y 2=z). */
function planarUV(geo, ax = 0, ay = 1) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const mn = [b.min.x, b.min.y, b.min.z], sz = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
  const p = geo.attributes.position;
  const a = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const c = [p.getX(i), p.getY(i), p.getZ(i)];
    a[i * 2] = (c[ax] - mn[ax]) / (sz[ax] || 1);
    a[i * 2 + 1] = (c[ay] - mn[ay]) / (sz[ay] || 1);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  return geo;
}

/** Tube with a radius function r(u) and capped ends (closed solid → clean ink outlines). */
function tubeGeo(curve, { segments = 40, radial = 10, radius = () => 0.01, caps = true } = {}) {
  const frames = curve.computeFrenetFrames(segments, false);
  const pos = [], nor = [], uv = [], idx = [];
  const P = V3(), N = V3(), T = V3();
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    curve.getPointAt(u, P);
    const r = radius(u);
    const n = frames.normals[i], b = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * TAU;
      const s = Math.sin(v), c = -Math.cos(v);
      N.set(c * n.x + s * b.x, c * n.y + s * b.y, c * n.z + s * b.z).normalize();
      pos.push(P.x + r * N.x, P.y + r * N.y, P.z + r * N.z);
      nor.push(N.x, N.y, N.z);
      uv.push(u, j / radial);
    }
  }
  for (let i = 1; i <= segments; i++) {
    for (let j = 1; j <= radial; j++) {
      const a = (radial + 1) * (i - 1) + (j - 1), b = (radial + 1) * i + (j - 1);
      const c = (radial + 1) * i + j, d = (radial + 1) * (i - 1) + j;
      idx.push(a, b, d, b, c, d);
    }
  }
  if (caps) {
    for (const end of [0, 1]) {
      const i = end * segments;
      curve.getPointAt(end, P);
      curve.getTangentAt(end, T);
      if (end === 0) T.negate();
      const centre = pos.length / 3;
      pos.push(P.x, P.y, P.z); nor.push(T.x, T.y, T.z); uv.push(end, 0.5);
      const ring = pos.length / 3;
      for (let j = 0; j <= radial; j++) {
        const k = (radial + 1) * i + j;
        pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]); nor.push(T.x, T.y, T.z); uv.push(end, j / radial);
      }
      for (let j = 0; j < radial; j++) {
        if (end === 0) idx.push(centre, ring + j, ring + j + 1);
        else idx.push(centre, ring + j + 1, ring + j);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
const curve = (pts, tension = 0.5) => new THREE.CatmullRomCurve3(pts.map((p) => V3(...p)), false, 'catmullrom', tension);

function mesh(geo, material, name) {
  const m = new THREE.Mesh(geo, material);
  if (name) m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function group(name, ...children) {
  const g = new THREE.Group();
  if (name) g.name = name;
  for (const c of children) g.add(c);
  return g;
}
function anchor(name, p = [0, 0, 0]) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(...p);
  return o;
}

// Animation plumbing: `run` jumps to the end when instant, `pause` is skipped when instant,
// `stepper()` serialises animated calls on one object.
function run(inst, ms, fn, ease = Ease.inOutSine) {
  if (inst) { fn(1); return Promise.resolve(); }
  return animate(ms, fn, ease);
}
/**
 * Several animation phases driven by ONE animate() job, so a whole multi-step method registers its
 * timing synchronously (deterministic in dev/common/viewer `&call=` / VIEW.advance, cheap in game).
 * segs: [{ ms, fn(kEased), ease?, enter?() }] — enter runs once when the phase starts.
 */
function timeline(inst, segs) {
  const st = segs.map(() => 0);
  const enter = (i) => { if (!st[i]) { st[i] = 1; segs[i].enter?.(); } };
  if (inst) { segs.forEach((sg, i) => { enter(i); sg.fn?.(1); }); return Promise.resolve(); }
  const total = segs.reduce((a, sg) => a + sg.ms, 0);
  const apply = (t) => {
    let acc = 0;
    for (let i = 0; i < segs.length; i++) {
      const sg = segs[i];
      if (st[i] === 2) { acc += sg.ms; continue; }
      if (t < acc) return;
      enter(i);
      if (t >= acc + sg.ms) { sg.fn?.(1); st[i] = 2; acc += sg.ms; continue; }
      sg.fn?.((sg.ease || Ease.inOutSine)(clamp01((t - acc) / sg.ms)));
      return;
    }
  };
  return animate(total, (k) => apply(k * total), Ease.linear);
}
/** Serialises animated calls on one object; starts immediately (synchronously) when idle. */
function stepper() {
  let tail = Promise.resolve(), pending = 0;
  return (opts, fn) => {
    if (opts && opts.instant) return Promise.resolve(fn(true));
    const p = pending === 0 ? Promise.resolve(fn(false)) : tail.then(() => fn(false));
    pending++;
    const done = () => { pending--; };
    p.then(done, done);
    tail = p.catch(() => {});
    return p;
  };
}
const lastOpts = (args) => {
  const a = args[args.length - 1];
  return a && typeof a === 'object' && !a.isObject3D ? a : {};
};

// Shared materials / textures (created lazily, reused by every instance).
const _mats = new Map();
function M(key, make) {
  let m = _mats.get(key);
  if (!m) { m = make(); _mats.set(key, m); }
  return m;
}

// ---------------------------------------------------------------------------
// Canvas textures

function stripes(base, line, { w = 128, h = 32, n = 9, lw = 3, seed = 3, vertical = true, alpha = 0.85 } = {}) {
  return canvasTexture(w, h, (g) => {
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      g.globalAlpha = 0.12; g.fillStyle = r() < 0.5 ? shade(base, 0.06) : shade(base, -0.06);
      g.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4);
    }
    g.globalAlpha = alpha; g.fillStyle = line;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      if (vertical) g.fillRect(t * w - lw / 2, 0, lw, h);
      else g.fillRect(0, t * h - lw / 2, w, lw);
    }
    g.globalAlpha = 1;
  });
}

const texCane = () => M('tex:cane', () => canvasTexture(32, 128, (g, w, h) => {
  const r = rng(12);
  g.fillStyle = C.cane; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 10; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,240,210,0.18)' : 'rgba(90,70,40,0.14)';
    g.fillRect(r() * w, 0, 1 + r() * 3, h);
  }
  // node: dark ring at the bottom of every repeat, light lip above it
  g.fillStyle = '#e2cfa4'; g.fillRect(0, h - 9, w, 3);
  g.fillStyle = C.caneNode; g.fillRect(0, h - 6, w, 6);
}));

const texLeaf = () => M('tex:leaf', () => canvasTexture(64, 256, (g, w, h) => {
  // lanceolate leaf, base at the bottom, tip at the top; ink outline baked in.
  const pts = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const half = (w * 0.42) * Math.pow(Math.sin(PI * Math.pow(t, 0.75)), 0.9) * (0.25 + 0.75 * smooth(0, 0.18, t));
    pts.push([t, half]);
  }
  const X = (s, half) => w / 2 + s * half, Y = (t) => h - 6 - t * (h - 12);
  g.beginPath();
  g.moveTo(X(-1, pts[0][1]), Y(0));
  for (const [t, half] of pts) g.lineTo(X(-1, half), Y(t));
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(X(1, pts[i][1]), Y(pts[i][0]));
  g.closePath();
  g.fillStyle = C.leaf; g.fill();
  g.save(); g.clip();
  g.fillStyle = 'rgba(70,95,30,0.35)'; g.fillRect(w / 2, 0, w / 2, h);
  g.restore();
  g.strokeStyle = C.leafVein; g.lineWidth = 3;
  g.beginPath(); g.moveTo(w / 2, Y(0.02)); g.lineTo(w / 2, Y(0.9)); g.stroke();
  g.strokeStyle = '#141414'; g.lineWidth = 5; g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(X(-1, pts[0][1]), Y(0));
  for (const [t, half] of pts) g.lineTo(X(-1, half), Y(t));
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(X(1, pts[i][1]), Y(pts[i][0]));
  g.closePath(); g.stroke();
}, { wrap: false }));

const texGateDoor = () => M('tex:gateDoor', () => canvasTexture(256, 512, (g, w, h) => {
  const r = rng(41);
  g.fillStyle = C.door; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    g.globalAlpha = 0.08; g.fillStyle = r() < 0.5 ? '#6e5439' : '#b39472';
    g.fillRect(r() * w, r() * h, 2 + r() * 3, 8 + r() * 24);
  }
  g.globalAlpha = 1; g.lineCap = 'round';
  let x = 3;
  while (x < w) {
    g.strokeStyle = `rgba(62,44,26,${0.3 + r() * 0.3})`; g.lineWidth = 1.2 + r() * 1.6;
    g.beginPath();
    let cx = x; g.moveTo(cx, -4);
    for (let y = 0; y <= h + 8; y += 16) { cx += (r() - 0.5) * 3.4; g.lineTo(cx, y); }
    g.stroke();
    x += 8 + r() * 15;
  }
}));

const texSign = () => M('tex:sign', () => canvasTexture(1024, 84, (g, w, h) => {
  const r = rng(77);
  g.fillStyle = '#b7946a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 16; i++) {
    g.strokeStyle = `rgba(70,48,25,${0.2 + r() * 0.3})`; g.lineWidth = 1 + r() * 1.5;
    g.beginPath();
    let y = r() * h; g.moveTo(-5, y);
    for (let xx = 0; xx <= w + 40; xx += 40) { y += (r() - 0.5) * 2.5; g.lineTo(xx, y); }
    g.stroke();
  }
  const word = 'PARADISE';
  g.textBaseline = 'middle'; g.textAlign = 'center';
  g.font = '600 60px "Trebuchet MS", "Segoe UI", Verdana, sans-serif';
  const sp = 64, start = w / 2 - (sp * (word.length - 1)) / 2;
  for (let i = 0; i < word.length; i++) {
    g.save();
    g.translate(start + i * sp, h / 2 + 3);
    g.rotate((r() - 0.5) * 0.07);
    g.fillStyle = 'rgba(240,215,175,0.55)'; g.fillText(word[i], 1.6, 1.6);
    g.fillStyle = C.sign; g.fillText(word[i], 0, 0);
    g.restore();
  }
}, { wrap: false }));

/** Gerard's eyes behind the upper hatch. The 0.5×0.42 window shows the centre 76 %×75 %. */
function drawGerard(g, w, h, closed) {
  const ox = w * 0.12, oy = h * 0.125, ww = w * 0.76, wh = h * 0.75;
  const X = (u) => ox + u * ww, Y = (v) => oy + v * wh;
  g.fillStyle = C.skin; g.fillRect(0, 0, w, h);
  const sh = g.createLinearGradient(0, 0, w, 0);
  sh.addColorStop(0, 'rgba(60,55,50,0.45)'); sh.addColorStop(0.22, 'rgba(0,0,0,0)');
  sh.addColorStop(0.8, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(50,45,40,0.5)');
  g.fillStyle = sh; g.fillRect(0, 0, w, h);
  // dark hair band across the top and down the right side
  g.fillStyle = '#151311';
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(X(0.95), h);
  g.bezierCurveTo(X(0.95), Y(0.5), X(0.93), Y(0.12), X(0.7), Y(0.08));
  g.bezierCurveTo(X(0.45), Y(0.04), X(0.15), Y(0.1), 0, Y(0.17));
  g.closePath(); g.fill();
  // eye bags
  g.fillStyle = 'rgba(125,117,108,0.55)';
  for (const ex of [0.29, 0.77]) { g.beginPath(); g.ellipse(X(ex), Y(0.74), ww * 0.15, wh * 0.075, 0, 0, TAU); g.fill(); }
  // eyes (heavy upper lid line + iris), closed → just the lid line
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const ex of [0.29, 0.77]) {
    if (!closed) {
      g.fillStyle = '#e8e2da';
      g.beginPath(); g.ellipse(X(ex), Y(0.635), ww * 0.11, wh * 0.06, 0, 0, TAU); g.fill();
      g.fillStyle = '#0d0d0d';
      g.beginPath(); g.arc(X(ex + 0.01), Y(0.63), wh * 0.055, 0, TAU); g.fill();
      g.strokeStyle = '#0d0d0d'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(X(ex - 0.13), Y(0.62)); g.quadraticCurveTo(X(ex), Y(0.555), X(ex + 0.13), Y(0.615)); g.stroke();
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(X(ex - 0.09), Y(0.69)); g.quadraticCurveTo(X(ex), Y(0.705), X(ex + 0.09), Y(0.685)); g.stroke();
    } else {
      g.strokeStyle = '#0d0d0d'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(X(ex - 0.13), Y(0.64)); g.quadraticCurveTo(X(ex), Y(0.68), X(ex + 0.13), Y(0.64)); g.stroke();
    }
  }
  // heavy orange-brown brows pressed down towards the nose
  const brow = (pts) => {
    g.beginPath(); g.moveTo(X(pts[0][0]), Y(pts[0][1]));
    for (const p of pts.slice(1)) g.lineTo(X(p[0]), Y(p[1]));
    g.closePath();
    g.fillStyle = C.brow; g.fill();
    g.strokeStyle = '#0d0d0d'; g.lineWidth = 4; g.stroke();
  };
  brow([[0.06, 0.44], [0.2, 0.39], [0.36, 0.41], [0.47, 0.49], [0.44, 0.53], [0.3, 0.5], [0.16, 0.5], [0.07, 0.52]]);
  brow([[0.6, 0.5], [0.7, 0.42], [0.84, 0.39], [0.95, 0.41], [0.94, 0.49], [0.84, 0.48], [0.72, 0.51], [0.63, 0.55]]);
  // nose bridge line
  g.strokeStyle = '#121212'; g.lineWidth = 4.5;
  g.beginPath(); g.moveTo(X(0.54), Y(0.43)); g.quadraticCurveTo(X(0.6), Y(0.7), X(0.585), Y(1.05)); g.stroke();
  g.strokeStyle = 'rgba(80,72,64,0.35)'; g.lineWidth = 14;
  g.beginPath(); g.moveTo(X(0.57), Y(0.5)); g.quadraticCurveTo(X(0.63), Y(0.72), X(0.62), Y(1.05)); g.stroke();
}
const texGerard = (closed) => M('tex:gerard' + (closed ? 'C' : 'O'), () =>
  canvasTexture(512, 436, (g, w, h) => drawGerard(g, w, h, closed), { wrap: false }));

const texFruit = () => M('tex:fruit', () => canvasTexture(512, 128, (g, w, h) => {
  const r = rng(53);
  g.fillStyle = C.fruit; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(200,95,50,0.18)' : 'rgba(60,20,8,0.16)';
    g.beginPath(); g.ellipse(r() * w, r() * h, 10 + r() * 30, 6 + r() * 12, 0, 0, TAU); g.fill();
  }
  // longitudinal ridges (u = around, v = along the fruit)
  g.strokeStyle = C.fruitRidge; g.lineCap = 'round';
  const n = 14;
  for (let i = 0; i < n; i++) {
    g.lineWidth = 4 + r() * 2;
    let x = ((i + 0.5) / n) * w;
    g.beginPath(); g.moveTo(x, -2);
    for (let y = 0; y <= h + 4; y += 8) { x += (r() - 0.5) * 2; g.lineTo(x, y); }
    g.stroke();
  }
}));

const texFlesh = () => M('tex:flesh', () => canvasTexture(128, 128, (g, w, h) => {
  const r = rng(54);
  g.fillStyle = C.flesh; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = r() < 0.4 ? 'rgba(200,60,40,0.3)' : 'rgba(60,8,6,0.35)';
    g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 6, 0, TAU); g.fill();
  }
}));

const texHullOut = () => M('tex:hullOut', () => canvasTexture(256, 512, (g, w, h) => {
  const r = rng(61);
  g.fillStyle = C.hull; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    g.globalAlpha = 0.1; g.fillStyle = r() < 0.5 ? '#6f6a5f' : '#a8a296';
    g.fillRect(r() * w, r() * h, 6 + r() * 30, 1 + r() * 2);
  }
  g.globalAlpha = 1;
  const n = 14; // strakes across the whole section (port gunwale → keel → starboard gunwale)
  for (let i = 1; i < n; i++) {
    const y = (i / n) * h;
    g.fillStyle = 'rgba(205,200,188,0.55)'; g.fillRect(0, y + 2, w, 3);
    g.fillStyle = 'rgba(25,23,20,0.85)'; g.fillRect(0, y - 2, w, 4);
  }
}));
const texHullIn = () => M('tex:hullIn', () => canvasTexture(256, 512, (g, w, h) => {
  const r = rng(62);
  g.fillStyle = C.hullIn; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    g.globalAlpha = 0.1; g.fillStyle = r() < 0.5 ? '#5d5a51' : '#9a958a';
    g.fillRect(r() * w, r() * h, 6 + r() * 30, 1 + r() * 2);
  }
  g.globalAlpha = 1;
  const n = 14;
  for (let i = 1; i < n; i++) {
    const y = (i / n) * h;
    g.fillStyle = 'rgba(25,23,20,0.6)'; g.fillRect(0, y - 1.5, w, 3);
  }
}));
const texFloor = () => M('tex:floor', () => canvasTexture(256, 256, (g, w, h) => {
  const r = rng(63);
  g.fillStyle = C.floor; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 600; i++) {
    g.globalAlpha = 0.12; g.fillStyle = r() < 0.5 ? '#7c766b' : '#bcb6a9';
    g.fillRect(r() * w, r() * h, 10 + r() * 40, 1 + r() * 2);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 6; i++) {
    const y = (i / 6) * h;
    g.fillStyle = 'rgba(28,26,22,0.85)'; g.fillRect(0, y, w, 4);
  }
}));

const texBox = () => M('tex:box', () => canvasTexture(128, 128, (g, w, h) => {
  const r = rng(71);
  g.fillStyle = C.box; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 300; i++) {
    g.globalAlpha = 0.1; g.fillStyle = r() < 0.5 ? '#9a746a' : '#c4a095';
    g.fillRect(r() * w, r() * h, 2 + r() * 8, 1 + r() * 2);
  }
  g.globalAlpha = 1;
}));
const texBoxDoor = () => M('tex:boxDoor', () => canvasTexture(128, 256, (g, w, h) => {
  g.fillStyle = shade(C.box, -0.06); g.fillRect(0, 0, w, h);
  g.fillStyle = C.box; g.fillRect(10, 10, w - 20, h - 20);
  g.strokeStyle = '#141414'; g.lineWidth = 4; g.strokeRect(12, 12, w - 24, h - 24);
  g.fillStyle = 'rgba(80,45,40,0.18)'; g.fillRect(14, 14, w - 28, 10); g.fillRect(14, 14, 10, h - 28);
}, { wrap: false }));
const texEnvelope = () => M('tex:env', () => canvasTexture(256, 180, (g, w, h) => {
  g.fillStyle = C.envelope; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#141414'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(4, 6); g.lineTo(w / 2, h * 0.58); g.lineTo(w - 4, 6); g.stroke();
  g.fillStyle = 'rgba(120,90,30,0.25)';
  g.beginPath(); g.moveTo(4, 6); g.lineTo(w / 2, h * 0.58); g.lineTo(w - 4, 6); g.closePath(); g.fill();
}, { wrap: false }));

// ---------------------------------------------------------------------------
// Shared materials

const matInk = () => M('m:ink', () => toon(C.ink));
const matBlack = () => M('m:hook', () => toon(C.hook));
const matCane = () => M('m:cane', () => toon('#ffffff', { map: texCane() }));
const matLeaf = () => M('m:leaf', () => unlit('#f0f0ea', { map: texLeaf(), alphaTest: 0.5, side: THREE.DoubleSide }));

// ===========================================================================
// ITEMS
// ===========================================================================

/** machete — ochre handle (2 rivets) + long pale blade, ≈ 0.63 m, along +x (blade towards +x). */
function makeMachete() {
  const root = group('machete');
  const blade = new THREE.Shape();
  blade.moveTo(-0.012, 0.0185);
  blade.lineTo(0.355, 0.026);
  blade.lineTo(0.423, 0.012);
  blade.quadraticCurveTo(0.418, -0.03, 0.37, -0.036);
  blade.quadraticCurveTo(0.2, -0.038, 0.04, -0.024);
  blade.lineTo(-0.012, -0.0185);
  blade.closePath();
  const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.005, bevelEnabled: false });
  bg.translate(0, 0, -0.0025);
  const bladeM = mesh(bg, M('m:blade', () => toon(C.machBlade)), 'machete_blade');
  // thin grey fuller line along the spine
  const fuller = new THREE.Shape();
  fuller.moveTo(0.0, 0.012); fuller.lineTo(0.33, 0.017); fuller.lineTo(0.33, 0.012); fuller.lineTo(0.0, 0.008); fuller.closePath();
  const fg = new THREE.ShapeGeometry(fuller);
  const fullerM = new THREE.Mesh(merge([fg.clone().translate(0, 0, 0.0027), fg.clone().rotateY(PI).translate(0.33, 0, -0.0027)]),
    M('m:fuller', () => toon('#a9a7a1', { outline: false })));
  const handle = new THREE.Shape();
  const hw = 0.2, hh = 0.021;
  handle.moveTo(-hw, -hh + 0.004);
  handle.quadraticCurveTo(-hw, -hh, -hw + 0.006, -hh);
  handle.lineTo(0, -hh); handle.lineTo(0, hh);
  handle.lineTo(-hw + 0.006, hh);
  handle.quadraticCurveTo(-hw, hh, -hw, hh - 0.004);
  handle.closePath();
  const hg = new THREE.ExtrudeGeometry(handle, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1 });
  hg.translate(0, 0, -0.008);
  const handleM = mesh(hg, M('m:machHandle', () => toon(C.machHandle)), 'machete_handle');
  const rv = [];
  for (const x of [-0.152, -0.05]) rv.push(xf(new THREE.CylinderGeometry(0.0062, 0.0062, 0.03, 10), [x, 0, 0], [PI / 2, 0, 0]));
  const rivets = mesh(merge(rv), M('m:rivet', () => toon(C.rivet)), 'machete_rivets');
  const body = group('machete_body', bladeM, fullerM, handleM, rivets);
  body.position.x = -0.11;
  root.add(body);
  return root;
}

/** hook — black hook lying on its side like the icon: eye at −x, bend + point curling up at +x. ≈ 0.09 m. */
function makeHook() {
  const root = group('hook');
  const c = curve([[-0.036, 0, 0], [-0.01, -0.002, 0], [0.018, -0.003, 0], [0.034, 0.002, 0], [0.041, 0.014, 0],
    [0.036, 0.026, 0], [0.024, 0.029, 0], [0.016, 0.022, 0]]);
  const shank = tubeGeo(c, { segments: 48, radial: 8, radius: (u) => 0.0032 * (u < 0.86 ? 1 : 1 - (u - 0.86) / 0.14 * 0.85) });
  const eye = xf(new THREE.TorusGeometry(0.0075, 0.0028, 8, 20), [-0.0425, 0.0005, 0]);
  const barb = xf(new THREE.ConeGeometry(0.0028, 0.011, 6), [0.0185, 0.0185, 0], [0, 0, -2.35]);
  root.add(mesh(merge([shank, eye, barb]), matBlack(), 'hook_body'));
  root.children[0].position.y = -0.012;
  return root;
}

/** Wooden spool wound with black line plus a curly loose end (used for `line` and the box's `box_line`). */
function buildSpool() {
  const g = group('spool');
  const fl = [];
  for (const x of [-0.031, 0.031]) fl.push(xf(new THREE.CylinderGeometry(0.03, 0.03, 0.009, 22), [x, 0, 0], [0, 0, PI / 2]));
  fl.push(xf(new THREE.CylinderGeometry(0.008, 0.008, 0.074, 10), [0, 0, 0], [0, 0, PI / 2]));
  g.add(mesh(merge(fl), M('m:spoolWood', () => toon(C.spoolWood)), 'spool_wood'));
  const lineTex = M('tex:wound', () => stripes('#1b1a19', '#6b6862', { w: 16, h: 64, n: 7, lw: 2, vertical: false, alpha: 0.9 }));
  const wound = xf(new THREE.CylinderGeometry(0.0225, 0.0225, 0.053, 22, 1, true), [0, 0, 0], [0, 0, PI / 2]);
  g.add(mesh(wound, M('m:wound', () => toon('#ffffff', { map: lineTex })), 'spool_line'));
  // loose end: leaves the windings at the top and curls into loops on the left
  const pts = [[0.004, 0.0225, 0.004], [-0.012, 0.03, 0.006], [-0.03, 0.036, 0.008]];
  for (let i = 0; i <= 40; i++) {
    const s = i / 40, a = -PI * 0.5 + s * PI * 3.2;
    const R = 0.011 + 0.004 * s;
    pts.push([-0.046 - 0.05 * s + R * Math.cos(a) * 0.9, 0.036 + R * Math.sin(a) - 0.01 * s, 0.008 + 0.01 * s]);
  }
  const loose = tubeGeo(new THREE.CatmullRomCurve3(pts.map((p) => V3(...p))), { segments: 120, radial: 6, radius: () => 0.0016 });
  g.add(mesh(loose, M('m:line', () => toon(C.line, { outline: 0.0025 })), 'spool_loose_end'));
  return g;
}
function makeLine() {
  const root = group('line');
  const s = buildSpool();
  s.position.set(0.035, -0.01, 0);
  root.add(s);
  return root;
}

/** Bamboo cane geometry along +y from y=0 (nodes every `spacing`, dark rings). */
function caneGeo(h, r0, r1, spacing = 0.75, phase = 0, radial = 10) {
  const g = new THREE.CylinderGeometry(r1, r0, h, radial, 1, false);
  g.translate(0, h / 2, 0);
  scaleUV(g, 1, h / spacing);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) + phase);
  const parts = [g];
  for (let y = spacing * (1 - (phase % 1)); y < h - 0.05; y += spacing) {
    const rr = lerp(r0, r1, y / h) + 0.004;
    parts.push(setUV(xf(new THREE.TorusGeometry(rr, Math.max(0.004, rr * 0.12), 4, radial), [0, y, 0], [PI / 2, 0, 0]), 0.5, 0.02));
  }
  return merge(parts);
}

/** stick — thin pale bamboo pole, 2.4 m along x, three dark nodes. */
function makeStick() {
  const root = group('stick');
  const g = caneGeo(2.4, 0.027, 0.021, 0.8, 0.5, 10);
  g.translate(0, -1.2, 0);
  g.rotateZ(-PI / 2);
  root.add(mesh(g, matCane(), 'stick_body'));
  return root;
}

/**
 * fishing rod（物品的三个阶段：rod_line / rod_hook / rod）— 竹竿斜放（竿尖在左上，避开物品栏右下角的键位
 * 标记），黑色鱼线在竿尖绕几圈后垂下来；hook = 线尾挂鱼钩，worm = 鱼钩上再挂虫子当鱼饵。鱼钩和虫子画成
 * 实物的 4 倍，图标里才看得清。原点在竹竿中点，正面朝 +z（和其它物品一样，正视图就是图标的样子）。
 */
function makeFishingRod({ hook = true, worm = true } = {}) {
  const root = group(worm ? 'rod' : hook ? 'rod_hook' : 'rod_line');
  const L = 2.4, ang = PI - 0.78;
  const dir = V3(Math.cos(ang), Math.sin(ang), 0);
  const g = caneGeo(L, 0.027, 0.021, 0.8, 0.5, 10);
  g.translate(0, -L / 2, 0);
  g.rotateZ(ang - PI / 2);
  root.add(mesh(g, matCane(), 'rod_stick'));
  const lineMat = M('m:line', () => toon(C.line, { outline: 0.0025 }));
  const tip = dir.clone().multiplyScalar(L / 2 - 0.04);
  // 竿尖绕着的几圈线
  const wrap = xf(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 12), [tip.x - dir.x * 0.05, tip.y - dir.y * 0.05, 0], [0, 0, ang - PI / 2]);
  root.add(mesh(wrap, lineMat, 'rod_wrap'));
  // 鱼线：从竿尖略向外垂下
  const drop = 0.8;
  const end = V3(tip.x - 0.04, tip.y - drop, 0);
  const lc = curve([[tip.x, tip.y, 0], [tip.x - 0.05, tip.y - drop * 0.35, 0], [tip.x - 0.05, tip.y - drop * 0.7, 0], [end.x, end.y, 0]]);
  root.add(mesh(tubeGeo(lc, { segments: 40, radial: 6, radius: () => 0.011 }), lineMat, 'rod_line'));
  if (!hook) {
    // 还没挂钩：线尾打个小圈
    const loop = xf(new THREE.TorusGeometry(0.05, 0.011, 6, 18), [end.x, end.y - 0.045, 0]);
    root.add(mesh(loop, lineMat, 'rod_line_loop'));
    return root;
  }
  // 鱼钩竖着挂（眼在上、弯钩在下），眼对准线尾
  const S = 4;
  const h = makeHook();
  h.name = 'rod_hook';
  h.scale.setScalar(S);
  h.rotation.z = -PI / 2;
  h.position.set(end.x + 0.0115 * S, end.y - 0.0425 * S, 0);
  root.add(h);
  if (worm) {
    // 虫子挂在弯钩上
    const w = buildWorm();
    w.name = 'rod_worm';
    w.scale.setScalar(5.5);
    w.rotation.z = 0.35;
    w.position.set(end.x + 0.05, end.y - 0.4, 0.02);
    root.add(w);
  }
  return root;
}

/** Segmented grey-purple worm, arched like an inch-worm (S-curve), ≈ 0.09 m, bottom at y = 0 of the group. */
function buildWorm() {
  const c = curve([[-0.046, 0.006, 0.003], [-0.03, 0.006, 0.006], [-0.016, 0.014, 0.002], [-0.006, 0.03, -0.003],
    [0.008, 0.031, -0.004], [0.017, 0.016, 0.0], [0.027, 0.006, 0.005], [0.041, 0.005, 0.004], [0.049, 0.009, 0.0]]);
  const geo = tubeGeo(c, { segments: 64, radial: 10, radius: (u) => 0.0078 * Math.max(0.12, Math.pow(Math.sin(PI * u), 0.32)) });
  const t = M('tex:worm', () => stripes(C.worm, C.wormLine, { w: 256, h: 16, n: 10, lw: 3, seed: 9 }));
  const m = mesh(geo, M('m:worm', () => toon('#ffffff', { map: t })), 'worm_body');
  m.position.y = 0.0;
  return group('worm_model', m);
}
function makeWorm() {
  const root = group('worm');
  const w = buildWorm();
  w.position.y = -0.018;
  root.add(w);
  return root;
}

/** Bright orange-red curled shrimp with long feelers, ≈ 0.12 m incl. feelers. C-curl in the XY plane. */
function buildShrimp() {
  const g = group('shrimp_model');
  // body arc: head upper right → round the left → tail lower right
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const s = i / 12, a = lerp(0.95, 5.2, s);
    const R = lerp(0.034, 0.024, s);
    pts.push([R * Math.cos(a), R * Math.sin(a), 0]);
  }
  const body = new THREE.CatmullRomCurve3(pts.map((p) => V3(...p)));
  const bodyGeo = tubeGeo(body, { segments: 60, radial: 12, radius: (u) => lerp(0.0165, 0.006, Math.pow(u, 0.9)) * (u < 0.04 ? 0.6 + 10 * u : 1) });
  const shellTex = M('tex:shrimp', () => stripes(C.shrimp, C.shrimpDark, { w: 256, h: 16, n: 8, lw: 6, seed: 5, alpha: 0.75 }));
  const shellMat = M('m:shrimp', () => toon('#ffffff', { map: shellTex }));
  g.add(mesh(bodyGeo, shellMat, 'shrimp_body'));
  // head / carapace
  const h0 = body.getPointAt(0), t0 = body.getTangentAt(0);
  const head = new THREE.SphereGeometry(1, 16, 12);
  head.scale(0.024, 0.017, 0.0175);
  head.rotateZ(Math.atan2(t0.y, t0.x));
  head.translate(h0.x - t0.x * 0.012, h0.y - t0.y * 0.012, 0);
  const rostrum = xf(new THREE.ConeGeometry(0.004, 0.022, 6), [h0.x - t0.x * 0.036, h0.y - t0.y * 0.036 + 0.004, 0], [0, 0, Math.atan2(-t0.y, -t0.x) - PI / 2]);
  g.add(mesh(merge([head, rostrum]), M('m:shrimpHead', () => toon(shade(C.shrimp, 0.03))), 'shrimp_head'));
  // eyes
  const eyes = [];
  for (const z of [0.012, -0.012]) eyes.push(xf(new THREE.SphereGeometry(0.0042, 8, 6), [h0.x - t0.x * 0.022, h0.y - t0.y * 0.022 + 0.006, z]));
  g.add(mesh(merge(eyes), matInk(), 'shrimp_eyes'));
  // tail fan
  const t1 = body.getPointAt(1), tt = body.getTangentAt(1);
  const fan = [];
  for (const k of [-0.5, 0, 0.5]) {
    const f = new THREE.SphereGeometry(1, 10, 6);
    f.scale(0.012, 0.004, 0.006);
    f.translate(0.011, 0, 0);
    f.rotateZ(Math.atan2(tt.y, tt.x) + k);
    f.translate(t1.x, t1.y, 0);
    fan.push(f);
  }
  g.add(mesh(merge(fan), shellMat, 'shrimp_tail'));
  // feelers (two long dark antennae sweeping forward then back) + legs on the inside of the curl
  const thin = [];
  const fx = h0.x - t0.x * 0.03, fy = h0.y - t0.y * 0.03;
  thin.push(tubeGeo(curve([[fx, fy, 0.005], [fx + 0.02, fy + 0.02, 0.008], [fx + 0.06, fy + 0.025, 0.01], [fx + 0.1, fy + 0.005, 0.012]]), { segments: 24, radial: 4, radius: () => 0.0012 }));
  thin.push(tubeGeo(curve([[fx, fy, -0.005], [fx + 0.025, fy + 0.012, -0.008], [fx + 0.065, fy + 0.008, -0.01], [fx + 0.095, fy - 0.02, -0.012]]), { segments: 24, radial: 4, radius: () => 0.0012 }));
  for (let i = 0; i < 6; i++) {
    const p = body.getPointAt(0.12 + i * 0.1);
    const dir = V3(-p.x, -p.y, 0).normalize();
    const a = p.clone().add(dir.clone().multiplyScalar(0.008));
    const b = a.clone().add(dir.clone().multiplyScalar(0.016)).add(V3(0.006, 0, 0));
    thin.push(tubeGeo(curve([[a.x, a.y, 0.003], [lerp(a.x, b.x, 0.5), lerp(a.y, b.y, 0.5) + 0.002, 0.004], [b.x, b.y, 0.004]]), { segments: 6, radial: 4, radius: () => 0.0011 }));
  }
  g.add(mesh(merge(thin), M('m:feeler', () => toon(C.shrimpFeeler, { outline: 0.002 })), 'shrimp_feelers'));
  return g;
}
function makeShrimp() {
  const root = group('shrimp');
  const s = buildShrimp();
  s.position.set(-0.012, 0.004, 0);
  root.add(s);
  return root;
}

// ===========================================================================
// PARADISE GATE
// ===========================================================================

// Dimensions (m). The opening equals layout PALISADE.gateGap; heights follow the reference frames
// (doors ≈ 1.45× the 4.2 m palisade, posts ≈ 2×).
const GATE = {
  gap: 4.4, postW: 0.5, postH: 8.1, tipH: 0.45,
  beamL: 6.7, beamH: 0.62, beamD: 0.14, beamY: 7.25,
  leafW: 2.19, leafH: 6.0, leafY: 0.08, leafT: 0.1,
  holeW: 0.5, holeH: 0.42, frame: 0.07,
  up: { x: 0.62, y: 3.76 }, low: { x: 1.57, y: 2.96 }, // hatch centres, left-leaf local (hinge at x=0, door bottom y=0)
  battens: [0.18, 2.32, 4.4, 5.82],
};

function makeGerardHand() {
  const hand = group('gerard_hand');
  const m = M('m:hand', () => toon(C.hand));
  const arm = merge([
    xf(new THREE.CapsuleGeometry(0.041, 0.46, 4, 12), [0, -0.004, -0.27], [PI / 2, 0, 0]),
    xf(new THREE.SphereGeometry(1, 16, 10), [0, -0.002, 0.04], [0, 0, 0], [0.057, 0.023, 0.064]),
  ]);
  hand.add(mesh(arm, m, 'gerard_arm'));
  const fGeo = (len, r) => xf(new THREE.CapsuleGeometry(r, len, 3, 8), [0, 0, len / 2 + r * 0.4], [PI / 2, 0, 0]);
  const fingers = [];
  for (const [x, len, r] of [[-0.036, 0.048, 0.0102], [-0.012, 0.058, 0.0108], [0.012, 0.056, 0.0106], [0.035, 0.044, 0.0094]]) {
    const pv = group('', mesh(fGeo(len, r), m));
    pv.position.set(x, 0.003, 0.092);
    pv.rotation.x = -0.25;
    hand.add(pv);
    fingers.push(pv);
  }
  const thumb = group('', mesh(fGeo(0.04, 0.0118), m));
  thumb.position.set(0.05, 0.006, 0.03);
  thumb.rotation.set(-0.35, 0.95, 0);
  hand.add(thumb);
  const socket = anchor('hand_socket', [0, 0.024, 0.03]);
  hand.add(socket);
  hand.userData.rig = { fingers, thumb, socket };
  return hand;
}

function makeGate() {
  const G = GATE;
  const root = group('paradise_gate');
  const postX = G.gap / 2 + G.postW / 2;

  // posts with pyramid tips
  const postGeos = [];
  for (const sx of [-1, 1]) {
    postGeos.push(scaleUV(xf(new THREE.BoxGeometry(G.postW, G.postH, G.postW), [sx * postX, G.postH / 2, 0]), 1, 3));
    postGeos.push(xf(new THREE.ConeGeometry(G.postW * 0.7071, G.tipH, 4, 1), [sx * postX, G.postH + G.tipH / 2, 0], [0, PI / 4, 0]));
  }
  const postMat = M('m:gatePost', () => toon('#ffffff', { map: tex.wood({ base: C.post, seed: 61, lines: 11 }) }));
  root.add(mesh(merge(postGeos), postMat, 'gate_posts'));

  // cross beam with arrow-cut ends and the carved PARADISE sign
  const L = G.beamL / 2, hh = G.beamH / 2, pt = 0.34;
  const bs = new THREE.Shape();
  bs.moveTo(-L, 0); bs.lineTo(-L + pt, hh); bs.lineTo(L - pt, hh); bs.lineTo(L, 0); bs.lineTo(L - pt, -hh); bs.lineTo(-L + pt, -hh); bs.closePath();
  const beamGeo = planarUV(new THREE.ExtrudeGeometry(bs, { depth: G.beamD, bevelEnabled: false }), 0, 1);
  beamGeo.translate(0, G.beamY, G.postW / 2);
  root.add(mesh(beamGeo, M('m:sign', () => toon('#ffffff', { map: texSign() })), 'gate_sign'));

  // ---- doors
  const doorMat = M('m:gateDoor', () => toon('#ffffff', { map: texGateDoor(), vertexColors: true }));
  const { leafW: W, leafH: H, leafT: T, holeW, holeH, frame: F } = G;
  const inkMat = M('m:inkFlat', () => unlit('#161412'));
  // thin black strips that ink the edges of battens / frames / leaves (like the hand-drawn original)
  const inkRect = (out, cx, cy, w, h, z, t = 0.018) => {
    out.push(xf(new THREE.BoxGeometry(w + t, t, 0.004), [cx, cy + h / 2, z]), xf(new THREE.BoxGeometry(w + t, t, 0.004), [cx, cy - h / 2, z]));
    out.push(xf(new THREE.BoxGeometry(t, h + t, 0.004), [cx - w / 2, cy, z]), xf(new THREE.BoxGeometry(t, h + t, 0.004), [cx + w / 2, cy, z]));
  };
  const leafGeo = (holes, x0) => {
    const s = new THREE.Shape();
    s.moveTo(x0, 0); s.lineTo(x0 + W, 0); s.lineTo(x0 + W, H); s.lineTo(x0, H); s.closePath();
    for (const h of holes) {
      const p = new THREE.Path();
      p.moveTo(h.x - holeW / 2, h.y - holeH / 2); p.lineTo(h.x + holeW / 2, h.y - holeH / 2);
      p.lineTo(h.x + holeW / 2, h.y + holeH / 2); p.lineTo(h.x - holeW / 2, h.y + holeH / 2); p.closePath();
      s.holes.push(p);
    }
    const g = planarUV(new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false }), 0, 1);
    g.translate(0, 0, -T / 2);
    const parts = [tint(g, '#ffffff')];
    const ink = [];
    inkRect(ink, x0 + W / 2, H / 2, W - 0.01, H - 0.01, T / 2 + 0.002, 0.022);
    for (const y of G.battens) {
      parts.push(tint(scaleUV(xf(new THREE.BoxGeometry(W - 0.03, 0.2, 0.05), [x0 + W / 2, y, T / 2 + 0.025]), 0.22, 1, true), '#f3ebe0'));
      inkRect(ink, x0 + W / 2, y, W - 0.03, 0.2, T / 2 + 0.052, 0.016);
    }
    for (const h of holes) {
      const fw = holeW + 2 * F, fh = holeH + 2 * F, z = T / 2 + 0.0175;
      const fr = (w, hgt, x, y) => tint(scaleUV(xf(new THREE.BoxGeometry(w, hgt, 0.035), [x, y, z]), 0.2, 0.15), '#efe4d6');
      parts.push(fr(fw, F, h.x, h.y + holeH / 2 + F / 2), fr(fw, F, h.x, h.y - holeH / 2 - F / 2));
      parts.push(fr(F, holeH, h.x - holeW / 2 - F / 2, h.y), fr(F, holeH, h.x + holeW / 2 + F / 2, h.y));
      inkRect(ink, h.x, h.y, fw, fh, T / 2 + 0.037, 0.02);
      inkRect(ink, h.x, h.y, holeW, holeH, T / 2 + 0.037, 0.016);
    }
    return { body: merge(parts, true), ink: merge(ink) };
  };
  const leafL = group('gate_leaf_l');
  leafL.position.set(-G.gap / 2, G.leafY, 0);
  const gl = leafGeo([G.up, G.low], 0);
  leafL.add(mesh(gl.body, doorMat, 'gate_leaf_l_body'), mesh(gl.ink, inkMat, 'gate_leaf_l_ink'));
  const leafR = group('gate_leaf_r');
  leafR.position.set(G.gap / 2, G.leafY, 0);
  const gr = leafGeo([], -W);
  leafR.add(mesh(gr.body, doorMat, 'gate_leaf_r_body'), mesh(gr.ink, inkMat, 'gate_leaf_r_ink'));
  const doors = group('gate_doors', leafL, leafR);
  root.add(doors);

  // hatches (sliding square panels with a little "(" pull)
  const hatch = {};
  for (const key of ['up', 'low']) {
    const h = G[key];
    const pg = tint(scaleUV(new THREE.BoxGeometry(holeW + 0.02, holeH + 0.02, 0.03), 0.25, 0.08), '#f4ebe0');
    const panel = mesh(pg, doorMat, 'hatch_' + key);
    panel.position.set(h.x, h.y, T / 2 - 0.035);
    const pull = mesh(xf(new THREE.TorusGeometry(0.05, 0.007, 6, 14, PI), [0, 0, 0], [0, 0, PI / 2]), matInk(), 'hatch_' + key + '_pull');
    pull.position.set(holeW / 2 - 0.08, 0, 0.015);
    panel.add(pull);
    const pInk = [];
    inkRect(pInk, 0, 0, holeW - 0.03, holeH - 0.03, 0.0165, 0.014);
    panel.add(new THREE.Mesh(merge(pInk), inkMat));
    leafL.add(panel);
    hatch[key] = { panel, x: h.x, open: false };
  }

  // behind the upper hatch: Gerard's eyes (face card); behind the lower hatch: a dark hole
  const faceMat = new THREE.MeshBasicMaterial({ map: texGerard(false), color: '#f2f2f2' });
  faceMat.userData.outlineParameters = { visible: false };
  const eyes = mesh(new THREE.PlaneGeometry(0.66, 0.56), faceMat, 'gerard_eyes');
  eyes.position.set(G.up.x, G.up.y, -T / 2 - 0.02);
  eyes.castShadow = false;
  leafL.add(eyes);
  const hole = mesh(new THREE.PlaneGeometry(0.64, 0.54), M('m:hole', () => unlit(C.hole)), 'hatch_low_hole');
  hole.position.set(G.low.x, G.low.y, -T / 2 - 0.03);
  hole.castShadow = false;
  leafL.add(hole);
  const eyesAnchor = anchor('eyes_anchor', [G.up.x + 0.3, G.up.y + 0.12, T / 2 + 0.12]);
  leafL.add(eyesAnchor);

  // Gerard's pale hand (palm up) that comes out of the lower hatch towards the viewer
  const hand = makeGerardHand();
  // the arm comes out diagonally (towards the viewer and to the right) so that from the front the
  // forearm reads horizontally from the left and the cupped hand sits on the right, as in the original
  const HAND_YAW = 0.85, HAND_SCALE = 2.6;
  const hdir = V3(Math.sin(HAND_YAW), 0, Math.cos(HAND_YAW));
  const HAND_OUT = V3(G.low.x - 0.03, G.low.y - 0.085, T / 2 + 0.05);
  const HAND_IN = HAND_OUT.clone().addScaledVector(hdir, -0.95);
  hand.scale.setScalar(HAND_SCALE);
  hand.rotation.y = HAND_YAW;
  hand.position.copy(HAND_IN);
  // keep whatever is put in the palm upright, facing the viewer, ~1.25× its item size
  hand.userData.rig.socket.rotation.y = -HAND_YAW;
  hand.userData.rig.socket.scale.setScalar(1.45 / HAND_SCALE);
    const handTo = (from, to, k) => hand.position.lerpVectors(from, to, k);
  hand.visible = false;
  leafL.add(hand);
  const rig = hand.userData.rig;
  const setFingers = (k) => {
    for (const f of rig.fingers) f.rotation.x = lerp(-1.05, -2.15, k);
    rig.thumb.rotation.x = lerp(-0.35, -0.9, k);
    rig.thumb.rotation.y = lerp(0.95, 0.35, k);
  };

  const step = stepper();
  const state = { doors: 0 };
  const slideDist = holeW + 0.09;

  root.openHatch = (which = 'up', opts = {}) => step(opts, async (inst) => {
    const h = hatch[which === 'low' ? 'low' : 'up'];
    if (h.open) return;
    h.panel.visible = true;
    const from = h.panel.position.x;
    await run(inst, 550, (k) => { h.panel.position.x = lerp(from, h.x - slideDist, k); }, Ease.inOutSine);
    h.panel.visible = false;
    h.open = true;
  });
  root.closeHatch = (which = 'up', opts = {}) => step(opts, async (inst) => {
    const h = hatch[which === 'low' ? 'low' : 'up'];
    if (!h.open) return;
    h.panel.visible = true;
    const from = h.panel.position.x;
    await run(inst, 450, (k) => { h.panel.position.x = lerp(from, h.x, k); }, Ease.inOutSine);
    h.open = false;
  });
  root.extendHand = (opts = {}) => step(opts, async (inst) => {
    hand.visible = true;
    setFingers(0);
    const from = hand.position.clone();
    await run(inst, 850, (k) => handTo(from, HAND_OUT, k), Ease.outCubic);
  });
  root.retractHand = (opts = {}) => step(opts, async (inst) => {
    const from = hand.position.clone();
    await run(inst, 700, (k) => handTo(from, HAND_IN, k), Ease.inSine);
    hand.visible = false;
  });
  root.handTake = (obj, ...rest) => step(lastOpts(rest), async (inst) => {
    if (!hand.visible) { hand.visible = true; hand.position.copy(HAND_OUT); setFingers(0); }
    if (obj && obj.isObject3D) {
      rig.socket.add(obj);
      obj.position.set(0, 0, 0);
      obj.rotation.set(0, 0, 0);
    }
    const from = HAND_OUT.clone();
    await timeline(inst, [
      { ms: 600 },
      { ms: 450, fn: (k) => setFingers(k), ease: Ease.inOutCubic },
      { ms: 250 },
      { ms: 800, enter: () => { from.copy(hand.position); }, fn: (k) => handTo(from, HAND_IN, k), ease: Ease.inSine },
      { ms: 0, fn: () => { hand.visible = false; } },
    ]);
  });
  const OPEN_L = 1.22, OPEN_R = -1.22;
  root.openDoors = (opts = {}) => step(opts, async (inst) => {
    eyes.visible = false; hole.visible = false; hand.visible = false;
    for (const h of Object.values(hatch)) { h.panel.visible = true; h.panel.position.x = h.x; h.open = false; }
    const a = state.doors;
    await run(inst, 1700, (k) => {
      const kk = lerp(a, 1, k);
      leafL.rotation.y = OPEN_L * kk;
      leafR.rotation.y = OPEN_R * Ease.inOutSine(clamp01(kk * 1.12 - 0.06));
    }, Ease.inOutSine);
    state.doors = 1;
  });
  root.closeDoors = (opts = {}) => step(opts, async (inst) => {
    const a = state.doors;
    await run(inst, 1400, (k) => {
      const kk = lerp(a, 0, k);
      leafL.rotation.y = OPEN_L * kk;
      leafR.rotation.y = OPEN_R * kk;
    }, Ease.inOutSine);
    state.doors = 0;
    eyes.visible = true; hole.visible = true;
  });
  root.reset = () => {
    for (const h of Object.values(hatch)) { h.panel.visible = true; h.panel.position.x = h.x; h.open = false; }
    hand.visible = false; hand.position.copy(HAND_IN); setFingers(0);
    leafL.rotation.y = 0; leafR.rotation.y = 0; state.doors = 0;
    eyes.visible = true; hole.visible = true;
    return Promise.resolve();
  };
  // idle: Gerard blinks every few seconds
  let blinkT = 2.2;
  root.update = (dt) => {
    blinkT -= dt;
    if (blinkT < 0) {
      faceMat.map = texGerard(true);
      if (blinkT < -0.13) { faceMat.map = texGerard(false); blinkT = 2.4 + Math.random() * 3.2; }
    }
  };
  return root;
}

// ===========================================================================
// BAMBOO
// ===========================================================================

function leafCluster(out, r, base, side, n, droop = 0) {
  for (let i = 0; i < n; i++) {
    const len = 0.66 + r() * 0.28, wid = len * 0.27;
    const g = new THREE.PlaneGeometry(wid, len);
    g.translate(0, len / 2 - 0.02, 0);
    const out0 = side * (0.32 + i * 0.3 + r() * 0.22 + droop);
    xf(g, [base.x + side * 0.03, base.y, base.z + 0.02], [(r() - 0.5) * 0.35, (r() - 0.5) * 0.9, -out0]);
    out.push(g);
  }
}

function makeBambooClump() {
  const root = group('bamboo_clump');
  const r = rng(91);
  const canes = [], leaves = [];
  // x, z, height, lean (rad, + = top leans right)
  const specs = [[-0.26, 0.02, 4.6, -0.075], [-0.12, -0.12, 5.3, -0.035], [0.0, 0.07, 4.95, -0.005], [0.12, -0.06, 5.5, 0.025], [0.24, 0.05, 4.4, 0.06], [-0.04, -0.2, 3.9, -0.02]];
  specs.forEach(([x, z, h, lean], ci) => {
    const tilt = [(r() - 0.5) * 0.06, 0, -lean];
    canes.push(xf(caneGeo(h, 0.062, 0.05, 0.72, r()), [x, 0, z], tilt));
    const q = _q.clone().setFromEuler(_e.set(...tilt));
    const dir = UP.clone().applyQuaternion(q);
    let side = ci % 2 ? 1 : -1;
    for (let y = h * 0.28 + r() * 0.4; y < h - 0.25; y += 0.62 + r() * 0.35) {
      const p = V3(x, 0, z).add(dir.clone().multiplyScalar(y));
      leafCluster(leaves, r, p, side, 2 + Math.floor(r() * 3), y < h * 0.5 ? 0.5 : 0);
      if (r() < 0.75) side = -side;
    }
    const top = V3(x, 0, z).add(dir.clone().multiplyScalar(h - 0.05));
    leafCluster(leaves, r, top, -1, 2);
    leafCluster(leaves, r, top, 1, 1);
  });
  root.add(mesh(merge(canes), matCane(), 'bamboo_canes'));
  const lm = mesh(merge(leaves), matLeaf(), 'bamboo_leaves');
  root.add(lm);
  root.update = (dt, t) => { lm.rotation.z = Math.sin(t * 0.9) * 0.006; };
  return root;
}

function makeBambooCane() {
  const root = group('bamboo_cane');
  const STUMP = 0.3, HEIGHT = 6.1, LEAN = -0.022;
  const stumpGeo = merge([
    caneGeo(STUMP, 0.072, 0.07, 0.72, 0.6),
    setUV(xf(new THREE.CircleGeometry(0.062, 12), [0, STUMP + 0.001, 0], [-PI / 2, 0, 0]), 0.5, 0.07),
  ]);
  const stump = mesh(stumpGeo, matCane(), 'stump');
  root.add(stump);
  const cane = group('cane');
  cane.position.y = STUMP;
  cane.rotation.z = LEAN;
  cane.add(mesh(caneGeo(HEIGHT - STUMP, 0.07, 0.056, 0.72, 0.6 + STUMP / 0.72), matCane(), 'cane_body'));
  root.add(cane);

  const step = stepper();
  let isCut = false;
  root.wobble = (opts = {}) => step(opts, async (inst) => {
    if (isCut) return;
    await run(inst, 1300, (k) => {
      cane.rotation.z = LEAN - (inst ? 0 : 0.17 * Math.sin(k * PI * 3) * Math.pow(1 - k, 1.4));
    }, Ease.linear);
    cane.rotation.z = LEAN;
  });
  root.cut = (opts = {}) => step(opts, async (inst) => {
    if (isCut) return;
    isCut = true;
    const from = cane.rotation.z;
    await timeline(inst, [
      { ms: 750, fn: (k) => { cane.rotation.z = lerp(from, -1.3, k); cane.position.x = 0.05 * k; }, ease: Ease.inCubic },
      { ms: 160, fn: (k) => { cane.rotation.z = -1.3 + 0.06 * Math.sin(k * PI); }, ease: Ease.linear },
      { ms: 280 },
      { ms: 0, fn: () => { cane.visible = false; } },
    ]);
  });
  root.reset = () => {
    isCut = false; cane.visible = true; cane.rotation.z = LEAN; cane.position.x = 0;
    return Promise.resolve();
  };
  return root;
}

// ===========================================================================
// SPIKY FRUIT
// ===========================================================================

const FRUIT = { x0: -0.45, x1: 0.45, tilt: 0.17, lift: 0.226 };
function fruitR(X) {
  const t = (X - FRUIT.x0) / (FRUIT.x1 - FRUIT.x0);
  const base = lerp(0.165, 0.272, smooth(0.32, 0.74, t)) - 0.012 * Math.exp(-(((t - 0.36) / 0.07) ** 2));
  const capL = Math.sqrt(clamp01(t / 0.035));
  const k = Math.max(0, t - 0.6) / 0.4;
  const capR = Math.sqrt(Math.max(0, 1 - k * k));
  return Math.max(0.0005, base * capL * capR);
}
function fruitPieceGeos(Xa, Xb, phiA, phiL, seed, spikeDensity = 95) {
  const nx = Math.max(4, Math.round((Xb - Xa) / 0.015));
  const pts = [];
  for (let i = 0; i <= nx; i++) { const X = lerp(Xa, Xb, i / nx); pts.push(new THREE.Vector2(fruitR(X), X)); }
  const segs = Math.max(6, Math.round((phiL / TAU) * 48));
  const lat = new THREE.LatheGeometry(pts, segs, phiA, phiL);
  const uv = lat.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (phiA + uv.getX(i) * phiL) / TAU, (lerp(Xa, Xb, uv.getY(i)) - FRUIT.x0) / (FRUIT.x1 - FRUIT.x0));
  }
  lat.rotateZ(-PI / 2); // lathe axis y → +x ; φ=0 → +z (front), φ=π/2 → −y, φ=3π/2 → +y
  const inner = lat.clone();
  inner.scale(1, 0.955, 0.955);
  const r = rng(seed);
  const spikes = [];
  const cone = new THREE.ConeGeometry(0.0055, 0.046, 4, 1);
  cone.translate(0, 0.023 - 0.006, 0);
  let meanR = 0;
  for (const p of pts) meanR += p.x / pts.length;
  const count = Math.round((Xb - Xa) * meanR * phiL * spikeDensity);
  const q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const X = lerp(Xa + 0.012, Xb - 0.012, r()), ph = phiA + (0.04 + r() * 0.92) * phiL;
    const rr = fruitR(X);
    if (rr < 0.06) continue;
    const d = (fruitR(X + 0.004) - fruitR(X - 0.004)) / 0.008;
    const n = V3(-d, -Math.sin(ph), Math.cos(ph)).normalize();
    const g = cone.clone();
    g.applyQuaternion(q.setFromUnitVectors(UP, n));
    g.translate(X, -rr * Math.sin(ph), rr * Math.cos(ph));
    spikes.push(tint(g, '#0f0e0d'));
  }
  tint(lat, '#ffffff');
  return { outer: merge([lat, ...spikes], true), inner };
}

function makeFruit() {
  const root = group('spiky_fruit');
  const body = group('fruit_body');
  body.position.y = FRUIT.lift;
  body.rotation.z = FRUIT.tilt;
  root.add(body);
  const outerMat = M('m:fruit', () => toon('#ffffff', { map: texFruit(), vertexColors: true }));
  const innerMat = M('m:flesh', () => toon('#ffffff', { map: texFlesh(), side: THREE.BackSide, outline: false }));
  const Q = PI / 2;
  const defs = [
    ['neck', -0.45, -0.1, 0, TAU],
    ['a_tf', -0.1, 0.18, 3 * Q, Q], ['a_tb', -0.1, 0.18, 2 * Q, Q], ['a_bf', -0.1, 0.18, 0, Q], ['a_bb', -0.1, 0.18, Q, Q],
    ['b_tf', 0.18, 0.45, 3 * Q, Q], ['b_tb', 0.18, 0.45, 2 * Q, Q], ['b_bf', 0.18, 0.45, 0, Q], ['b_bb', 0.18, 0.45, Q, Q],
  ];
  const pieces = {};
  defs.forEach(([id, Xa, Xb, pa, pl], i) => {
    const { outer, inner } = fruitPieceGeos(Xa, Xb, pa, pl, 100 + i);
    const Xm = (Xa + Xb) / 2, pm = pa + pl / 2, rm = pl >= TAU ? 0 : fruitR(Xm) * 0.55;
    const c = V3(Xm, -rm * Math.sin(pm), rm * Math.cos(pm));
    outer.translate(-c.x, -c.y, -c.z);
    inner.translate(-c.x, -c.y, -c.z);
    const g = group('fruit_' + id, mesh(outer, outerMat), mesh(inner, innerMat));
    g.position.copy(c);
    g.userData.rest = c.clone();
    body.add(g);
    pieces[id] = g;
  });
  // the little mouth ring on the left end of the neck
  const ring = group('fruit_mouth',
    mesh(xf(new THREE.TorusGeometry(0.036, 0.011, 8, 22), [0, 0, 0], [0, PI / 2, 0]), M('m:mouth', () => toon(C.mouth))),
    mesh(xf(new THREE.CircleGeometry(0.028, 16), [-0.002, 0, 0], [0, -PI / 2, 0]), matInk()));
  ring.position.set(-0.175 - 0.004, 0, 0);
  pieces.neck.add(ring);

  // juice puddles (appear progressively)
  const juiceMat = M('m:juice', () => toon(C.juice, { outline: false }));
  const puddles = [];
  const pr = rng(5);
  const blob = (rad) => {
    const s = new THREE.Shape();
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, rr = rad * (0.75 + pr() * 0.45) * (1 + 0.6 * Math.cos(a) ** 2);
      if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.6); else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.6);
    }
    return new THREE.ShapeGeometry(s).rotateX(-PI / 2);
  };
  for (const [x, z, rad, stage, ry] of [[-0.12, 0.2, 0.05, 1, 0.3], [-0.33, 0.28, 0.07, 2, -0.4], [0.06, 0.36, 0.045, 2, 0.1],
    [0.42, 0.2, 0.08, 3, 0.5], [0.3, 0.33, 0.04, 4, -0.2], [-0.5, 0.18, 0.06, 4, 0.9], [0.15, 0.24, 0.07, 5, 0.0]]) {
    const m = mesh(blob(rad), juiceMat, 'fruit_juice');
    m.position.set(x, 0.004 + puddles.length * 0.0004, z);
    m.rotation.y = ry;
    m.scale.setScalar(0.0001);
    m.visible = false;
    m.castShadow = false;
    m.userData.stage = stage;
    root.add(m);
    puddles.push(m);
  }

  // worm hidden inside, crawls out to the lower left at stage 5
  const worm = group('fruit_worm', buildWorm());
  const WORM_IN = V3(0.05, 0.03, 0.0), WORM_OUT = V3(-0.66, 0, 0.27);
  worm.position.copy(WORM_IN);
  worm.rotation.y = -0.35;
  worm.scale.setScalar(1.25);
  worm.visible = false;
  root.add(worm);

  // cumulative stage poses: [dx,dy,dz, rx,ry,rz] relative to the rest pose (body frame)
  const POSE = {
    neck: [null, [-0.04, 0.005, 0, 0, 0, 0.05], null, [-0.33, 0.05, 0.07, 0, 0, -1.72], null, [-0.35, 0.05, 0.09, 0.08, 0, -1.74]],
    a_tf: [null, [0.0, 0.0, 0.01, 0.05, 0, 0], [0.0, -0.17, 0.25, 1.05, 0.2, 0.28], null, null, [0.02, -0.18, 0.28, 1.1, 0.25, 0.32]],
    a_tb: [null, null, [-0.02, 0.0, -0.03, -0.28, 0, 0.1], [-0.05, 0.04, -0.03, -0.3, 0, 0.55], null, [-0.06, 0.05, -0.04, -0.32, 0, 0.62]],
    a_bf: [null, null, null, null, [0.0, 0.0, 0.05, 0.12, 0, 0], [0.0, -0.005, 0.06, 0.14, 0, 0]],
    a_bb: [null, null, null, null, [0.0, 0.0, -0.03, -0.1, 0, 0], null],
    b_tf: [null, null, null, [0.05, -0.16, 0.27, 0.95, -0.3, -0.22], null, [0.06, -0.17, 0.3, 1.0, -0.35, -0.26]],
    b_tb: [null, null, null, [0.02, 0.0, -0.03, -0.22, 0, -0.08], [0.09, -0.01, -0.05, -0.3, 0, -0.5], [0.11, -0.02, -0.06, -0.34, 0, -0.58]],
    b_bf: [null, null, null, null, [0.04, 0.0, 0.06, 0.15, 0, -0.04], [0.05, -0.005, 0.07, 0.18, 0, -0.05]],
    b_bb: [null, null, null, null, null, [0.06, 0.0, -0.04, -0.15, 0, -0.1]],
  };
  const poseAt = (id, n) => {
    let p = [0, 0, 0, 0, 0, 0];
    for (let s = 1; s <= n; s++) if (POSE[id][s]) p = POSE[id][s];
    return p;
  };
  const applyPose = (id, p) => {
    const g = pieces[id], rest = g.userData.rest;
    g.position.set(rest.x + p[0], rest.y + p[1], rest.z + p[2]);
    g.rotation.set(p[3], p[4], p[5]);
  };
  let stage = 0;
  let wormState = 0; // 0 hidden, 1 out
  const step = stepper();

  const setPuddles = (n, k = 1) => {
    for (const m of puddles) {
      const on = m.userData.stage <= n;
      if (on) { m.visible = true; m.scale.setScalar(Math.max(0.0001, m.userData.stage === n ? k : 1)); } else { m.visible = false; }
    }
  };
  root.chop = (n = stage + 1, ...rest) => step(lastOpts(rest), async (inst) => {
    n = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    if (n <= stage && !inst) return;
    const from = {};
    for (const id of Object.keys(pieces)) {
      const g = pieces[id], rest0 = g.userData.rest;
      from[id] = [g.position.x - rest0.x, g.position.y - rest0.y, g.position.z - rest0.z, g.rotation.x, g.rotation.y, g.rotation.z];
    }
    const to = {};
    for (const id of Object.keys(pieces)) to[id] = poseAt(id, n);
    const segs = [
      // quick shake of the whole fruit (the hit)
      { ms: 140, fn: (k) => { body.position.x = Math.sin(k * PI * 4) * 0.012 * (1 - k); }, ease: Ease.linear },
      { ms: 520, fn: (k) => {
        for (const id of Object.keys(pieces)) {
          const a = from[id], b = to[id];
          applyPose(id, a.map((v, i) => lerp(v, b[i], k)));
        }
        setPuddles(n, k);
      }, ease: Ease.outCubic },
      { ms: 0, fn: () => { setPuddles(n, 1); stage = n; } },
    ];
    if (n >= 5 && wormState === 0) segs.push(...crawlSegs());
    await timeline(inst, segs);
  });
  const crawlSegs = () => [
    { ms: 1700, enter: () => { worm.visible = true; wormState = 1; }, fn: (k) => {
      worm.position.lerpVectors(WORM_IN, WORM_OUT, k);
      worm.position.y = WORM_IN.y * (1 - k) + Math.sin(k * PI) * 0.03;
      worm.rotation.y = lerp(-0.35, 0.45, k);
      const w = Math.sin(k * PI * 6) * (k < 1 ? 1 : 0);
      worm.scale.set(1.25 * (1 + 0.12 * w), 1.25 * (1 - 0.1 * w), 1.25);
    } },
  ];
  root.showWorm = (show = true, ...rest) => step(lastOpts(rest), async (inst) => {
    if (show === false || show === 'false') {
      worm.visible = false;
      wormState = 2;
      return;
    }
    if (wormState === 1) return;
    await timeline(inst, crawlSegs());
  });
  root.reset = () => {
    stage = 0; wormState = 0;
    for (const id of Object.keys(pieces)) applyPose(id, [0, 0, 0, 0, 0, 0]);
    setPuddles(0);
    worm.visible = false; worm.position.copy(WORM_IN);
    return Promise.resolve();
  };
  root.update = (dt, t) => {
    if (worm.visible && wormState === 1) worm.children[0].rotation.y = Math.sin(t * 2.2) * 0.12;
  };
  Object.defineProperty(root, 'chops', { get: () => stage });
  return root;
}

// ===========================================================================
// DAVID'S ROCK
// ===========================================================================

function makeRock() {
  const root = group('david_rock');
  let g = new THREE.SphereGeometry(1, 40, 24);
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const light = new THREE.Color(C.rock), dark = new THREE.Color(C.rockDark), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.05 * Math.sin(x * 5.1 + z * 3.3) + 0.035 * Math.sin(y * 7.3 + x * 2.1) + 0.03 * Math.sin(z * 9.7 - y * 4.2);
    x *= 1.05 * n; z *= 0.85 * n; y = y * 0.78 * n + 0.2;
    if (y > 0.86) y = 0.86 + (y - 0.86) * 0.35; // flattish top where David stands
    p.setXYZ(i, x, y, z);
    tmp.copy(dark).lerp(light, smooth(-0.3, 0.75, y));
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  root.add(mesh(g, M('m:rock', () => toon('#ffffff', { vertexColors: true })), 'rock_body'));
  root.add(anchor('rock_top', [0, 0.95, 0]));
  return root;
}

// ===========================================================================
// ROWBOAT
// ===========================================================================

const BOAT = { L: 3.6, T: 0.045, floorY: 0.13 };
const bu = (x) => (x + BOAT.L / 2) / BOAT.L;
const beamAt = (x) => 0.66 * Math.pow(Math.max(0, Math.sin(PI * (0.13 + 0.87 * bu(x)))), 0.62);
const sheerAt = (x) => { const u = bu(x); return 0.56 + 0.2 * u ** 4 + 0.06 * (1 - u) ** 3; };
const keelAt = (x) => { const u = bu(x); return 0.16 * Math.abs(2 * u - 1) ** 4 * (u > 0.5 ? 1.4 : 0.6); };
const SEC_P = 0.6;
const section = (B, K, H, a) => [B * Math.sin(a), K + (H - K) * (1 - Math.pow(Math.cos(a), SEC_P))];
const innerB = (x) => Math.max(beamAt(x) - BOAT.T, 0.012);
const innerK = (x) => keelAt(x) + 0.05;
/** Inner half-width of the hull at height y (0 if below the inner keel). */
function innerHalfWidth(x, y) {
  const K = innerK(x), H = sheerAt(x);
  if (y <= K) return 0;
  const c = 1 - (y - K) / (H - K);
  if (c <= 0) return innerB(x);
  return innerB(x) * Math.sin(Math.acos(Math.pow(c, 1 / SEC_P)));
}

function gridGeo(nu, na, fn, flip) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= na; j++) {
    const [x, y, z, u, v] = fn(i / nu, j / na);
    pos.push(x, y, z); uv.push(u, v);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < na; j++) {
    const a = i * (na + 1) + j, b = (i + 1) * (na + 1) + j, c = b + 1, d = a + 1;
    if (!flip) idx.push(a, b, d, b, c, d); else idx.push(a, d, b, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function fanGeo(ring, centre, normal) {
  const pos = [], nor = [], uv = [];
  for (let i = 0; i < ring.length - 1; i++) {
    for (const p of [centre, ring[i], ring[i + 1]]) { pos.push(p.x, p.y, p.z); nor.push(normal.x, normal.y, normal.z); uv.push(p.z, p.y); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // make sure the winding agrees with the normal
  const a = V3(pos[0], pos[1], pos[2]), b = V3(pos[3], pos[4], pos[5]), c = V3(pos[6], pos[7], pos[8]);
  const fn = b.sub(a).cross(c.sub(a));
  if (fn.dot(normal) < 0) {
    for (let i = 0; i < pos.length; i += 9) for (let k = 0; k < 3; k++) [pos[i + 3 + k], pos[i + 6 + k]] = [pos[i + 6 + k], pos[i + 3 + k]];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  }
  return g;
}

function makeRowboat() {
  const root = group('rowboat');
  const { L, T } = BOAT;
  const x0 = -L / 2, x1 = L / 2;
  let xi1 = x1;
  while (beamAt(xi1) - T < 0.03 && xi1 > 0) xi1 -= 0.005;
  const xi0 = x0 + T;
  const NU = 44, NA = 22;
  const outer = gridGeo(NU, NA, (u, v) => {
    const x = lerp(x0, x1, u), a = -PI / 2 + v * PI;
    const [z, y] = section(beamAt(x), keelAt(x), sheerAt(x), a);
    return [x, y, z, x / 1.4, v];
  }, false);
  const inner = gridGeo(NU, NA, (u, v) => {
    const x = lerp(xi0, xi1, u), a = -PI / 2 + v * PI;
    const [z, y] = section(innerB(x), innerK(x), sheerAt(x), a);
    return [x, y, z, x / 1.4, v];
  }, true);
  // gunwale rim strips (outer top edge ↔ inner top edge)
  const rim = gridGeo(NU, 1, (u, v) => {
    const xo = lerp(x0, x1, u), xin = lerp(xi0, xi1, u);
    return v === 0 ? [xo, sheerAt(xo), -beamAt(xo), u * 3, 0] : [xin, sheerAt(xin), -innerB(xin), u * 3, 0.05];
  }, true);
  const rim2 = gridGeo(NU, 1, (u, v) => {
    const xo = lerp(x0, x1, u), xin = lerp(xi0, xi1, u);
    return v === 0 ? [xo, sheerAt(xo), beamAt(xo), u * 3, 0] : [xin, sheerAt(xin), innerB(xin), u * 3, 0.05];
  }, false);
  const ring = (x, B, K, H) => {
    const pts = [];
    for (let j = 0; j <= NA; j++) { const [z, y] = section(B, K, H, -PI / 2 + (j / NA) * PI); pts.push(V3(x, y, z)); }
    pts.push(pts[0].clone());
    return pts;
  };
  const sternOut = fanGeo(ring(x0, beamAt(x0), keelAt(x0), sheerAt(x0)), V3(x0, sheerAt(x0) * 0.7, 0), V3(-1, 0, 0));
  const sternIn = fanGeo(ring(xi0, innerB(xi0), innerK(xi0), sheerAt(xi0)), V3(xi0, sheerAt(xi0) * 0.75, 0), V3(1, 0, 0));
  const sternBand = gridGeo(NA, 1, (u, v) => {
    const a = -PI / 2 + u * PI;
    const [zo, yo] = section(beamAt(x0), keelAt(x0), sheerAt(x0), a);
    const [zi, yi] = section(innerB(xi0), innerK(xi0), sheerAt(xi0), a);
    return v === 0 ? [x0, yo, zo, u, 0] : [x0 + 0.0005, yi, zi, u, 0.04];
  }, false);
  const bowIn = fanGeo(ring(xi1, innerB(xi1), innerK(xi1), sheerAt(xi1)), V3(xi1, sheerAt(xi1) * 0.8, 0), V3(-1, 0, 0));
  // gunwale rails
  const rails = [];
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const x = lerp(x0 + 0.01, x1 - 0.02, i / 24); pts.push(V3(x, sheerAt(x) - 0.012, s * (beamAt(x) + 0.006))); }
    rails.push(tubeGeo(new THREE.CatmullRomCurve3(pts), { segments: 60, radial: 6, radius: () => 0.024 }));
  }
  const stem = scaleUV(xf(new THREE.BoxGeometry(0.09, 0.66, 0.085), [x1 - 0.03, sheerAt(x1) + 0.12, 0], [0, 0, -0.22]), 0.2, 1);
  const sternCap = scaleUV(xf(new THREE.BoxGeometry(0.1, 0.07, beamAt(x0) * 2 + 0.06), [x0 + 0.02, sheerAt(x0), 0]), 0.2, 0.3);
  const outGeo = merge([outer, sternOut, sternBand, ...rails, stem, sternCap]);
  const inGeo = merge([inner, rim, rim2, sternIn, bowIn]);
  const hullGeo = mergeGeometries([outGeo, inGeo], true);
  const hull = mesh(hullGeo, [
    M('m:hullOut', () => toon('#ffffff', { map: texHullOut() })),
    M('m:hullIn', () => toon('#ffffff', { map: texHullIn() })),
  ], 'boat_hull');
  root.add(hull);

  // plank floor
  const fy = BOAT.floorY;
  const fs = new THREE.Shape();
  const fpts = [];
  for (let i = 0; i <= 40; i++) {
    const x = lerp(xi0 + 0.01, xi1 - 0.05, i / 40);
    const w = innerHalfWidth(x, fy) - 0.005;
    if (w > 0.02) fpts.push([x, w]);
  }
  fs.moveTo(fpts[0][0], fpts[0][1]);
  for (const [x, w] of fpts) fs.lineTo(x, w);
  for (let i = fpts.length - 1; i >= 0; i--) fs.lineTo(fpts[i][0], -fpts[i][1]);
  fs.closePath();
  const floorGeo = new THREE.ShapeGeometry(fs).rotateX(-PI / 2).translate(0, fy, 0);
  root.add(mesh(floorGeo, M('m:floor', () => toon('#ffffff', { map: texFloor(), outline: false })), 'boat_floor'));

  // three thwarts
  const thwartMat = M('m:thwart', () => toon('#ffffff', { map: tex.wood({ base: C.thwart, seed: 72, lines: 8 }) }));
  const thwarts = [];
  const TW = [[-1.02, 'boat_thwart_rear'], [-0.06, 'boat_thwart_mid'], [0.8, 'boat_thwart_front']];
  const thwartTop = {};
  for (const [x, name] of TW) {
    const y = sheerAt(x) - 0.1;
    const w = 2 * innerHalfWidth(x, y) + 0.03;
    thwarts.push(xf(new THREE.BoxGeometry(0.3, 0.05, w), [x, y, 0]));
    thwartTop[name] = y + 0.025;
  }
  root.add(mesh(merge(thwarts), thwartMat, 'boat_thwarts'));

  // slots: items lie flat (their +z picture side up)
  const flat = (o, along) => {
    const X = along.clone().normalize(), Z = V3(0, 1, 0), Y = Z.clone().cross(X);
    o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  };
  const slotMachete = anchor('slot_machete', [-1.02, thwartTop.boat_thwart_rear + 0.01, 0.02]);
  flat(slotMachete, V3(-0.3, 0, 1));
  const slotHook = anchor('slot_hook', [-0.07, thwartTop.boat_thwart_mid + 0.0035, 0.3]);
  flat(slotHook, V3(0.15, 0, -1));
  // bolt box lies on its back (doors up, box top towards the bow)
  const boxBasis = (o) => o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, 0, 1), V3(1, 0, 0), V3(0, 1, 0)));
  const slotBox = anchor('slot_box', [-0.3, fy + BOX.D / 2 + 0.002, 0.04]);
  boxBasis(slotBox);
  const slotBoxFloor = anchor('slot_box_floor', [-0.76, fy + BOX.D / 2 + 0.002, 0.02]);
  boxBasis(slotBoxFloor);
  slotBoxFloor.rotateZ(-0.12);
  root.add(slotMachete, slotHook, slotBox, slotBoxFloor);

  const step = stepper();
  /** Slide `box` (a bolt_box, normally a child of slot_box) out onto the floor boards. */
  root.slideBox = (box, ...rest) => step(lastOpts(rest), async (inst) => {
    if (!box || !box.isObject3D) return;
    slotBoxFloor.attach(box);
    const p0 = box.position.clone(), q0 = box.quaternion.clone(), qi = new THREE.Quaternion();
    await run(inst, 650, (k) => {
      box.position.lerpVectors(p0, V3(0, 0, 0), k);
      box.position.z += Math.sin(k * PI) * 0.01;
      box.quaternion.slerpQuaternions(q0, qi, k);
    }, Ease.outCubic);
  });
  return root;
}

// ===========================================================================
// BOLT BOX
// ===========================================================================

const BOX = { W: 0.36, H: 0.34, D: 0.16, base: 0.1 };

function makeBoltBox() {
  const root = group('bolt_box');
  const { W, H, D, base } = BOX;
  const wall = 0.016, ledgeH = 0.012;
  const doorY0 = base + ledgeH, doorH = H - doorY0;
  const boxMat = M('m:box', () => toon('#ffffff', { map: texBox(), vertexColors: true }));
  const shell = [
    tint(xf(new THREE.BoxGeometry(W, H, wall), [0, H / 2, -D / 2 + wall / 2]), '#ffffff'),
    tint(xf(new THREE.BoxGeometry(wall, H, D), [-W / 2 + wall / 2, H / 2, 0]), '#ffffff'),
    tint(xf(new THREE.BoxGeometry(wall, H, D), [W / 2 - wall / 2, H / 2, 0]), '#ffffff'),
    tint(xf(new THREE.BoxGeometry(W, wall, D), [0, H - wall / 2, 0]), '#ffffff'),
    tint(xf(new THREE.BoxGeometry(W, base, D + 0.016), [0, base / 2, 0.008]), '#ffffff'),
    tint(xf(new THREE.BoxGeometry(W + 0.01, ledgeH, D + 0.03), [0, base + ledgeH / 2, 0.012]), '#e9dcd6'),
  ];
  root.add(mesh(merge(shell, true), boxMat, 'box_body'));
  const back = mesh(new THREE.PlaneGeometry(W - 2 * wall, doorH - wall), M('m:boxIn', () => toon(C.boxIn, { outline: false })), 'box_inside');
  back.position.set(0, doorY0 + (doorH - wall) / 2, -D / 2 + wall + 0.001);
  root.add(back);

  // contents: envelope (leaning) + the line spool
  const env = mesh(new THREE.BoxGeometry(0.15, 0.105, 0.004), [
    M('m:envEdge', () => toon(C.envelope)), M('m:envEdge', () => toon(C.envelope)), M('m:envEdge', () => toon(C.envelope)),
    M('m:envEdge', () => toon(C.envelope)), M('m:envFace', () => toon('#ffffff', { map: texEnvelope() })), M('m:envEdge', () => toon(C.envelope)),
  ], 'box_envelope');
  env.position.set(0.035, doorY0 + 0.115, -0.03);
  env.rotation.set(-0.12, 0.1, -0.38);
  root.add(env);
  const line = group('box_line', buildSpool());
  line.scale.setScalar(0.62);
  line.position.set(-0.09, doorY0 + 0.03, -0.01);
  line.rotation.y = 0.15;
  root.add(line);

  // doors (hinged at the outer edges)
  const doorMat = M('m:boxDoor', () => toon('#ffffff', { map: texBoxDoor() }));
  const dw = W / 2 - 0.003, dt = 0.016;
  const mkDoor = (side) => {
    const pv = group('box_door_' + (side < 0 ? 'l' : 'r'));
    pv.position.set(side * W / 2, doorY0, D / 2);
    const g = new THREE.BoxGeometry(dw, doorH, dt);
    g.translate(-side * dw / 2, doorH / 2, dt / 2);
    const plain = M('m:boxPlain', () => toon(C.box));
    pv.add(mesh(g, [plain, plain, plain, plain, doorMat, plain], 'box_door_' + (side < 0 ? 'l' : 'r') + '_body'));
    return pv;
  };
  const doorL = mkDoor(-1), doorR = mkDoor(1);
  const doors = group('box_doors', doorL, doorR);
  root.add(doors);

  // staples + bolts. World (box) x coordinates from the reference: staples at −0.041, +0.035, +0.137;
  // bar spans −0.063 … +0.144 (slides +0.063 to the right); upright pin at +0.053.
  const stapleMat = M('m:staple', () => toon(shade(C.box, -0.04)));
  const boltMat = M('m:bolt', () => toon(C.bolt));
  const yTop = 0.253 - doorY0, yBot = 0.186 - doorY0;
  const stapleGeo = (x, y) => xf(new THREE.BoxGeometry(0.024, 0.036, 0.02), [x, y, dt + 0.01]);
  doorL.add(mesh(merge([stapleGeo(-0.041 + W / 2, yTop), stapleGeo(-0.041 + W / 2, yBot)]), stapleMat, 'box_staples_l'));
  doorR.add(mesh(merge([0.035, 0.137].flatMap((x) => [stapleGeo(x - W / 2, yTop), stapleGeo(x - W / 2, yBot)])), stapleMat, 'box_staples_r'));
  const bolts = {};
  for (const [key, y] of [['top', yTop], ['bottom', yBot]]) {
    const parts = [
      xf(new THREE.BoxGeometry(0.207, 0.014, 0.01), [0, 0, 0]),
      xf(new THREE.BoxGeometry(0.012, 0.02, 0.013), [-0.1, 0, 0]),
      xf(new THREE.CylinderGeometry(0.0045, 0.0045, 0.03, 8), [0.013, 0.012, 0.009], [-0.65, 0, 0]),
    ];
    const bar = mesh(merge(parts), boltMat, 'bolt_' + key);
    const x = 0.0405 - W / 2;
    bar.position.set(x, y, dt + 0.01);
    bar.userData.x0 = x;
    doorR.add(bar);
    bolts[key] = { bar, open: false };
  }

  const step = stepper();
  let doorsOpen = 0;
  const SLIDE = 0.063;
  root.slideBolt = (which = 'top', opts = {}) => step(opts, async (inst) => {
    const b = bolts[which === 'bottom' || which === 'low' ? 'bottom' : 'top'];
    if (b.open) return;
    const from = b.bar.position.x;
    await run(inst, 420, (k) => { b.bar.position.x = lerp(from, b.bar.userData.x0 + SLIDE, k); }, Ease.outCubic);
    b.open = true;
  });
  root.openDoors = (opts = {}) => step(opts, async (inst) => {
    const a = doorsOpen;
    await run(inst, 900, (k) => {
      const kk = lerp(a, 1, k);
      doorL.rotation.y = -1.2 * kk;
      doorR.rotation.y = 1.2 * kk;
    }, Ease.outCubic);
    doorsOpen = 1;
  });
  root.hideLine = (opts = {}) => { line.visible = false; return Promise.resolve(); };
  root.reset = () => {
    for (const b of Object.values(bolts)) { b.open = false; b.bar.position.x = b.bar.userData.x0; }
    doorL.rotation.y = 0; doorR.rotation.y = 0; doorsOpen = 0; line.visible = true;
    return Promise.resolve();
  };
  return root;
}

// ===========================================================================

export const FACTORIES = {
  machete: () => makeMachete(),
  hook: () => makeHook(),
  line: () => makeLine(),
  stick: () => makeStick(),
  rod_line: () => makeFishingRod({ hook: false, worm: false }),
  rod_hook: () => makeFishingRod({ hook: true, worm: false }),
  rod: () => makeFishingRod({ hook: true, worm: true }),
  worm: () => makeWorm(),
  shrimp: () => makeShrimp(),
  paradise_gate: () => makeGate(),
  bamboo_clump: () => makeBambooClump(),
  bamboo_cane: () => makeBambooCane(),
  spiky_fruit: () => makeFruit(),
  david_rock: () => makeRock(),
  rowboat: () => makeRowboat(),
  bolt_box: () => makeBoltBox(),
};

/** Dimensions other modules may want (camera framing, placement). */
export const BEACH_DIMS = { GATE, BOX, BOAT: { ...BOAT, sheerMid: sheerAt(0) }, FRUIT };
