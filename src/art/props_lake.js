// Lake / temple props for Plague I (Blood): black cube item, coffin, floating cube, blood tendril,
// octagonal stone font, golden winged holder and the arched plague painting.
// Cartoon props: toon() materials with black OutlineEffect ink + ink lines painted into canvas
// textures for the creases. Every state-changing method returns a Promise, accepts { instant: true }
// as its last argument and animates through core/tween.js (engine clock). See docs/impl_props_lake.md.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, unlit, noOutline, canvasTexture, rng, shade, tex } from './materials.js';
import { animate, wait, Ease } from '../core/tween.js';

// ---------------------------------------------------------------------------------------------
// Small helpers

const INK = '#171513';
const done = () => Promise.resolve();
const isInstant = (o) => !!(o && typeof o === 'object' && o.instant === true);
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** Eased progress of a phase [t0, t0 + dur] at time t (ms). */
const phase = (t, t0, dur, ease = Ease.inOutSine) => ease(clamp01((t - t0) / dur));
/**
 * A multi-phase animation as ONE tween job: fn(elapsedMs) is called every frame. Unlike chained
 * awaits, this also completes inside a single synchronous tick loop (dev viewer &advance / callTime).
 */
function timeline(ms, fn) { return animate(ms, (k) => fn(k * ms), Ease.linear); }

/** Toon material with faceted lighting (normals are smoothed only for the outline hull). */
function inkToon(color, opts = {}) {
  const m = toon(color, opts);
  m.flatShading = true;
  return m;
}

/** Invisible but raycastable material for pick proxies. */
const HIDDEN = noOutline(new THREE.MeshBasicMaterial({ visible: false }));
// 看不见的点击区：材质不可见，userData.proxy 让热点射线仍然认它（否则会被当成隐藏物体跳过）
function proxy(geometry, name) {
  const m = new THREE.Mesh(geometry, HIDDEN);
  m.name = name;
  m.userData.proxy = true;
  return m;
}

/**
 * obj.update(dt, t) is the contract (chapters call it from engine.onUpdate). As a safety net, if
 * nobody calls it, `host`'s onBeforeRender drives `step` from the wall clock while it is on screen.
 */
function attachUpdate(obj, host, step) {
  let lastExternal = -1e9;
  let lastWall = 0;
  obj.update = (dt, t) => { lastExternal = performance.now(); step(dt, t); };
  host.onBeforeRender = () => {
    const now = performance.now();
    if (now - lastExternal < 250) { lastWall = now; return; }
    if (!lastWall) { lastWall = now; return; }
    const dt = (now - lastWall) / 1000;
    if (dt < 0.004) return; // already stepped this frame (outline pass)
    lastWall = now;
    step(Math.min(0.05, dt), now / 1000);
  };
}

const texCache = new Map();
function cachedTex(key, make) {
  if (!texCache.has(key)) texCache.set(key, make());
  return texCache.get(key);
}

function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

/** Offset a simple polygon (x,z) by d (d > 0 outward, d < 0 inward) with mitred corners. */
function offsetPoly(pts, d) {
  const n = pts.length;
  const s = signedArea(pts) > 0 ? 1 : -1;
  const out = [];
  const nrm = (a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    return [(s * dz) / l, (-s * dx) / l];
  };
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    const n1 = nrm(a, b), n2 = nrm(b, c);
    const p = [a[0] + n1[0] * d, a[1] + n1[1] * d], d1 = [b[0] - a[0], b[1] - a[1]];
    const q = [b[0] + n2[0] * d, b[1] + n2[1] * d], d2 = [c[0] - b[0], c[1] - b[1]];
    const cr = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(cr) < 1e-9) { out.push([b[0] + n1[0] * d, b[1] + n1[1] * d]); continue; }
    const t = ((q[0] - p[0]) * d2[1] - (q[1] - p[1]) * d2[0]) / cr;
    out.push([p[0] + d1[0] * t, p[1] + d1[1] * t]);
  }
  return out;
}

/** Per-position averaged normals (over the unique face normals meeting there) for ink hulls. */
function outlineNormals(pos, fn) {
  const map = new Map();
  const key = (i) => `${Math.round(pos[i] * 1e4)},${Math.round(pos[i + 1] * 1e4)},${Math.round(pos[i + 2] * 1e4)}`;
  for (let i = 0; i < pos.length; i += 3) {
    const k = key(i);
    let list = map.get(k);
    if (!list) map.set(k, (list = []));
    const nx = fn[i], ny = fn[i + 1], nz = fn[i + 2];
    if (!list.some((v) => v[0] * nx + v[1] * ny + v[2] * nz > 0.999)) list.push([nx, ny, nz]);
  }
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const list = map.get(key(i));
    let x = 0, y = 0, z = 0;
    for (const v of list) { x += v[0]; y += v[1]; z += v[2]; }
    const l = Math.hypot(x, y, z) || 1;
    out[i] = x / l; out[i + 1] = y / l; out[i + 2] = z / l;
  }
  return out;
}

/** Make any geometry non-indexed with outline-friendly normals (use with flat-shaded materials). */
function smoothForOutline(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position.array;
  const fn = new Float32Array(p.length);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 9) {
    a.set(p[i], p[i + 1], p[i + 2]); b.set(p[i + 3], p[i + 4], p[i + 5]); c.set(p[i + 6], p[i + 7], p[i + 8]);
    b.sub(a); c.sub(a); b.cross(c).normalize();
    for (let k = 0; k < 9; k += 3) { fn[i + k] = b.x; fn[i + k + 1] = b.y; fn[i + k + 2] = b.z; }
  }
  g.setAttribute('normal', new THREE.BufferAttribute(outlineNormals(p, fn), 3));
  return g;
}

/**
 * Vertical prisms from 2D outlines in the XZ plane, extruded along +Y from y0 by depth.
 * solids: [{ outline: [[x,z]...], holes?: [[[x,z]...]], corners?: [Set|null per contour] }]
 * Groups: 0 = top cap, 1 = side walls, 2 = bottom cap.
 * Cap UV: planar over `bounds` (u = x → right, v = -z → up; i.e. a canvas drawn as the top view).
 * Side UV: v = height fraction; u = metres since the last hard corner / uLen (or 0..1 per face if unitU).
 */
function prismGeometry(solids, depth, opts = {}) {
  const { y0 = 0, uLen = 4, unitU = false, top = true, sides = true, bottom = true } = opts;
  let { bounds } = opts;
  if (!bounds) {
    bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const s of solids) for (const [x, z] of s.outline) {
      bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
      bounds.minZ = Math.min(bounds.minZ, z); bounds.maxZ = Math.max(bounds.maxZ, z);
    }
  }
  const capUV = (x, z) => [(x - bounds.minX) / (bounds.maxX - bounds.minX), (bounds.maxZ - z) / (bounds.maxZ - bounds.minZ)];
  const y1 = y0 + depth;
  const T = { p: [], n: [], uv: [] }, S = { p: [], n: [], uv: [] }, B = { p: [], n: [], uv: [] };
  const tri = (buf, a, b, c, ua, ub, uc, n) => {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
    buf.p.push(...a, ...b, ...c); buf.n.push(...n, ...n, ...n); buf.uv.push(...ua, ...ub, ...uc);
  };
  for (const s of solids) {
    const holes = s.holes || [];
    if (top || bottom) {
      const c2 = s.outline.map(([x, z]) => new THREE.Vector2(x, z));
      const h2 = holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
      const flat = [...s.outline, ...holes.flat()];
      for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(c2, h2)) {
        const A = flat[i], Bp = flat[j], C = flat[k];
        if (top) tri(T, [A[0], y1, A[1]], [Bp[0], y1, Bp[1]], [C[0], y1, C[1]], capUV(...A), capUV(...Bp), capUV(...C), [0, 1, 0]);
        if (bottom) tri(B, [A[0], y0, A[1]], [Bp[0], y0, Bp[1]], [C[0], y0, C[1]], capUV(...A), capUV(...Bp), capUV(...C), [0, -1, 0]);
      }
    }
    if (!sides) continue;
    [s.outline, ...holes].forEach((pts, ci) => {
      const n = pts.length;
      const cs = s.corners ? s.corners[ci] : null;
      const isCorner = (i) => !cs || cs.has(i);
      let start = 0;
      if (cs) for (let i = 0; i < n; i++) if (isCorner(i)) { start = i; break; }
      let acc = 0;
      for (let k = 0; k < n; k++) {
        const i = (start + k) % n, j = (i + 1) % n;
        const [ax, az] = pts[i], [bx, bz] = pts[j];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1e-9) continue;
        let nx = (bz - az) / len, nz = -(bx - ax) / len;
        const mx = (ax + bx) / 2 + nx * 1e-4, mz = (az + bz) / 2 + nz * 1e-4;
        const insideSolid = ci === 0 ? pointInPoly(mx, mz, pts) : !pointInPoly(mx, mz, pts);
        if (insideSolid) { nx = -nx; nz = -nz; }
        const u0 = unitU ? 0 : acc / uLen, u1 = unitU ? 1 : (acc + len) / uLen;
        acc += len;
        if (isCorner(j)) acc = 0;
        const nn = [nx, 0, nz];
        tri(S, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [u0, 0], [u1, 0], [u1, 1], nn);
        tri(S, [ax, y0, az], [bx, y1, bz], [ax, y1, az], [u0, 0], [u1, 1], [u0, 1], nn);
      }
    });
  }
  const pos = new Float32Array([...T.p, ...S.p, ...B.p]);
  const fn = new Float32Array([...T.n, ...S.n, ...B.n]);
  const uv = new Float32Array([...T.uv, ...S.uv, ...B.uv]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(outlineNormals(pos, fn), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const nt = T.p.length / 3, ns = S.p.length / 3, nb = B.p.length / 3;
  geo.addGroup(0, nt, 0);
  geo.addGroup(nt, ns, 1);
  geo.addGroup(nt + ns, nb, 2);
  geo.computeBoundingSphere();
  return geo;
}

const rectPts = (w, d, cx = 0, cz = 0) => [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]];

/** Side-wall texture: flat base colour with ink lines along the top/bottom edges and the corners. */
function sideInkTex({ base, depth, uLen = 4, unitFace = 0, line = 0.006, speckle = 0, edges = 'tb', w = 1024, h = 128, seed = 3 }) {
  return cachedTex(`side:${base}:${depth}:${uLen}:${unitFace}:${line}:${speckle}:${edges}`, () => canvasTexture(w, h, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    if (speckle) {
      const r = rng(seed);
      for (let i = 0; i < (w * h) / 30; i++) {
        g.globalAlpha = speckle * r();
        g.fillStyle = r() < 0.5 ? shade(base, -0.12) : shade(base, 0.07);
        g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2);
      }
      g.globalAlpha = 1;
    }
    g.fillStyle = INK;
    const lv = Math.max(1.5, (line / depth) * h);
    if (edges.includes('t')) g.fillRect(0, 0, w, lv);
    if (edges.includes('b')) g.fillRect(0, h - lv, w, lv);
    if (unitFace) {
      const lu = Math.max(1.2, (line * 0.5 / unitFace) * w);
      g.fillRect(0, 0, lu, h); g.fillRect(w - lu, 0, lu, h);
    } else {
      g.fillRect(0, 0, Math.max(1.5, (line / uLen) * w), h);
    }
  }, { wrap: false }));
}

/** Soft radial sprite texture (glows, clouds, shadows). */
function radialTex(key, stops, size = 128) {
  return cachedTex(`radial:${key}`, () => canvasTexture(size, size, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    for (const [o, c] of stops) grd.addColorStop(o, c);
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, { wrap: false }));
}

function blackCubeMesh(size, name, radius = size * 0.13) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(size, size, size, 3, radius), toon('#3e3e3d'));
  m.name = name;
  m.castShadow = true;
  return m;
}

// =============================================================================================
// black_cube — inventory item: matte black rounded cube ~12 cm, origin at its bottom centre.

function makeBlackCube() {
  const root = new THREE.Group();
  root.name = 'black_cube';
  const cube = blackCubeMesh(0.12, 'black_cube_body', 0.016);
  cube.position.y = 0.06;
  root.add(cube);
  return root;
}

// =============================================================================================
// coffin — hexagonal coffin rising out of the blood pool. Origin = waterline centre (lake surface).
// Local frame: head at -X, foot at +X, length 2 m along X; top view camera from +Y with screen-up = -Z.

const COFFIN = {
  BOT: -0.17, BODY_H: 0.28, LID_H: 0.065, WALL: 0.045, FLOOR: 0.045, REST_TILT: -0.055,
  outer: [[-1, -0.23], [-0.4, -0.35], [1, -0.25], [1, 0.25], [-0.4, 0.35], [-1, 0.23]],
};

function coffinTextures() {
  return cachedTex('coffin:textures', () => {
    const { outer, WALL } = COFFIN;
    const inner = offsetPoly(outer, -WALL);
    const B = { minX: -1, maxX: 1, minZ: -0.35, maxZ: 0.35 };
    const W = 2048, H = 717;
    const toC = (x, z, b = B, w = W, h = H) => [((x - b.minX) / (b.maxX - b.minX)) * w, ((z - b.minZ) / (b.maxZ - b.minZ)) * h];
    const poly = (g, pts, b, w, h) => {
      g.beginPath();
      pts.forEach(([x, z], i) => { const [X, Y] = toC(x, z, b, w, h); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
      g.closePath();
    };
    const nails = nailPositions();
    // --- lid top: beige board, double inner border, cross, name, nail holes
    const lid = canvasTexture(W, H, (g) => {
      const r = rng(41);
      g.fillStyle = '#c6b89c'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 260; i++) { // faint long grain
        g.globalAlpha = 0.05 + r() * 0.06;
        g.strokeStyle = r() < 0.5 ? '#a8987a' : '#d8ccb2';
        g.lineWidth = 1 + r() * 3;
        const y = r() * H, x = r() * W;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 150 + r() * 400, y + (r() - 0.5) * 6); g.stroke();
      }
      g.globalAlpha = 1;
      g.lineJoin = 'round';
      // grey "pencil" shadow line + ink inner border
      g.strokeStyle = 'rgba(70,62,50,0.35)'; g.lineWidth = 6;
      poly(g, offsetPoly(outer, -0.052), B, W, H); g.stroke();
      g.strokeStyle = INK; g.lineWidth = 5;
      poly(g, offsetPoly(outer, -0.036), B, W, H); g.stroke();
      // cross (latin, top towards the head) with a soft grey shadow
      const cross = (dx, dy, col, wd) => {
        g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'butt';
        let [x1, y1] = toC(-0.69, -0.005); let [x2, y2] = toC(-0.43, -0.005);
        g.beginPath(); g.moveTo(x1 + dx, y1 + dy); g.lineTo(x2 + dx, y2 + dy); g.stroke();
        [x1, y1] = toC(-0.61, -0.075); [x2, y2] = toC(-0.61, 0.07);
        g.beginPath(); g.moveTo(x1 + dx, y1 + dy); g.lineTo(x2 + dx, y2 + dy); g.stroke();
      };
      g.filter = 'blur(6px)'; cross(4, 5, 'rgba(90,82,70,0.55)', 30); g.filter = 'none';
      cross(0, 0, '#1b1a18', 9);
      // name along the shoulder line, reading bottom → top
      const [tx, ty] = toC(-0.245, -0.01);
      g.save(); g.translate(tx, ty); g.rotate(-Math.PI / 2);
      g.font = 'italic 54px "Segoe Script", "Lucida Handwriting", "Snell Roundhand", "Apple Chancery", "Brush Script MT", cursive';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(80,72,60,0.45)'; g.fillText('Caroline Eilander', 4, 5);
      g.fillStyle = '#2a2724'; g.fillText('Caroline Eilander', 0, 0);
      g.restore();
      // nail holes (hidden under the heads until a nail is pulled)
      for (const [x, z] of nails) {
        const [X, Y] = toC(x, z);
        g.fillStyle = '#1d1511'; g.beginPath(); g.ellipse(X, Y, 9, 8, 0, 0, Math.PI * 2); g.fill();
      }
      // outer edge ink
      g.strokeStyle = INK; g.lineWidth = 9; poly(g, outer, B, W, H); g.stroke();
    }, { wrap: false });
    // --- body rim (top of the walls, seen when the lid is off)
    const rim = canvasTexture(W, H, (g) => {
      g.fillStyle = '#c9bc9f'; g.fillRect(0, 0, W, H);
      g.strokeStyle = INK; g.lineJoin = 'round';
      g.lineWidth = 9; poly(g, outer, B, W, H); g.stroke();
      g.lineWidth = 7; poly(g, inner, B, W, H); g.stroke();
    }, { wrap: false });
    // --- marbled red-ochre lining (mapped on the inner outline bounds)
    const IB = {
      minX: Math.min(...inner.map((p) => p[0])), maxX: Math.max(...inner.map((p) => p[0])),
      minZ: Math.min(...inner.map((p) => p[1])), maxZ: Math.max(...inner.map((p) => p[1])),
    };
    const LW = 2048, LH = Math.round(2048 * (IB.maxZ - IB.minZ) / (IB.maxX - IB.minX));
    const lining = canvasTexture(LW, LH, (g) => {
      const r = rng(77);
      g.fillStyle = '#b5573d'; g.fillRect(0, 0, LW, LH);
      for (let i = 0; i < 90; i++) { // blotches
        const x = r() * LW, y = r() * LH, rad = 40 + r() * 160;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        const c = r() < 0.5 ? '150,60,40' : '200,110,80';
        grd.addColorStop(0, `rgba(${c},${0.18 + r() * 0.2})`); grd.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      g.lineCap = 'round';
      for (let i = 0; i < 170; i++) { // marble veins
        g.strokeStyle = r() < 0.7 ? `rgba(226,150,118,${0.12 + r() * 0.22})` : `rgba(110,40,26,${0.1 + r() * 0.15})`;
        g.lineWidth = 1 + r() * 3;
        let x = r() * LW, y = r() * LH, a = r() * Math.PI * 2;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 14; k++) {
          a += (r() - 0.5) * 1.6;
          const nx = x + Math.cos(a) * (20 + r() * 40), ny = y + Math.sin(a) * (20 + r() * 40);
          g.quadraticCurveTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 40, nx, ny);
          x = nx; y = ny;
        }
        g.stroke();
      }
      for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(90,30,20,${0.2 + r() * 0.4})`; g.fillRect(r() * LW, r() * LH, 2 + r() * 3, 2 + r() * 3); }
      g.strokeStyle = INK; g.lineWidth = 10; poly(g, inner, IB, LW, LH); g.stroke();
    }, { wrap: false });
    // --- faint hand-drawn symbol: triangle with a vertical line through the apex past the base
    const symbol = canvasTexture(256, 256, (g) => {
      g.clearRect(0, 0, 256, 256);
      g.strokeStyle = 'rgba(70,28,18,0.55)'; g.lineWidth = 7; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath(); g.moveTo(128, 46); g.lineTo(210, 168); g.lineTo(44, 176); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(130, 28); g.lineTo(124, 228); g.stroke();
    }, { wrap: false });
    return { lid, rim, lining, symbol, inner, IB };
  });
}

function nailPositions() {
  const v = offsetPoly(COFFIN.outer, -0.068);
  // nail_1 head upper, nail_2 head lower, nail_3 shoulder upper, nail_4 shoulder lower (starts bent),
  // nail_5 foot upper, nail_6 foot lower  ("upper" = -Z = towards the top of the top-view screen)
  return [v[0], v[5], v[1], v[4], v[2], v[3]];
}

function makeCoffin() {
  const { BOT, BODY_H, LID_H, FLOOR, REST_TILT, outer } = COFFIN;
  const T = coffinTextures();
  const B = { minX: -1, maxX: 1, minZ: -0.35, maxZ: 0.35 };

  const root = new THREE.Group();
  root.name = 'coffin';
  const fl = new THREE.Group();
  fl.name = 'coffin_float';
  root.add(fl);

  const sideMat = inkToon('#ffffff', { map: sideInkTex({ base: '#c2b498', depth: BODY_H, uLen: 4 }) });
  const body = new THREE.Mesh(
    prismGeometry([{ outline: outer, holes: [T.inner] }], BODY_H, { y0: BOT, bounds: B }),
    [inkToon('#ffffff', { map: T.rim }), sideMat, sideMat],
  );
  body.name = 'coffin_body';
  body.castShadow = true;
  fl.add(body);

  const lining = new THREE.Mesh(
    prismGeometry([{ outline: T.inner }], FLOOR, { y0: BOT, sides: false, bottom: false, bounds: T.IB }),
    [inkToon('#ffffff', { map: T.lining, outline: false })],
  );
  lining.name = 'coffin_lining';
  fl.add(lining);
  const floorY = BOT + FLOOR;

  // lid + nails
  const lid = new THREE.Group();
  lid.name = 'coffin_lid';
  lid.position.y = BOT + BODY_H;
  fl.add(lid);
  const lidSide = inkToon('#ffffff', { map: sideInkTex({ base: '#b9ab8f', depth: LID_H, uLen: 4 }) });
  const lidMesh = new THREE.Mesh(prismGeometry([{ outline: outer }], LID_H, { y0: 0, bounds: B }),
    [inkToon('#ffffff', { map: T.lid }), lidSide, lidSide]);
  lidMesh.name = 'coffin_lid_board';
  lidMesh.castShadow = true;
  lid.add(lidMesh);

  const nailGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.0125, 0.0145, 0.008, 14).translate(0, 0.0045, 0).toNonIndexed(),
    new THREE.CylinderGeometry(0.0045, 0.0028, 0.085, 6).translate(0, -0.042, 0).toNonIndexed(),
  ]);
  const nailMat = toon('#6b5142');
  const nails = nailPositions().map(([x, z], i) => {
    const g = new THREE.Group();
    g.name = `nail_${i + 1}`;
    g.position.set(x, LID_H, z);
    const m = new THREE.Mesh(nailGeo, nailMat);
    m.name = `nail_${i + 1}_head`;
    g.add(m);
    // 钉头只有 1 cm 多，点击区放大到半径 10 cm（相邻钉子相距 35 cm 以上，不会重叠），手机上手指也点得中
    const hit = proxy(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12), `nail_${i + 1}_hit`);
    g.add(hit);
    g.userData = { mesh: m, state: 'in' };
    lid.add(g);
    return g;
  });
  const setBend = (n, k) => { // k 0 = flush, 1 = bent up towards the head
    n.userData.mesh.position.y = 0.036 * k;
    n.rotation.z = 0.75 * k;
    n.rotation.x = -0.15 * k;
  };
  setBend(nails[3], 1);
  nails[3].userData.state = 'bent';

  // the black cube on the lining + its soft shadow, and the faint symbol
  const cube = blackCubeMesh(0.14, 'coffin_cube', 0.018);
  cube.position.set(-0.1, floorY + 0.07, 0.03);
  fl.add(cube);
  const shadowTex = radialTex('shadow', [[0, 'rgba(40,10,5,0.55)'], [0.6, 'rgba(40,10,5,0.25)'], [1, 'rgba(40,10,5,0)']]);
  const cubeShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.2).rotateX(-Math.PI / 2),
    unlit('#ffffff', { map: shadowTex, transparent: true, depthWrite: false }));
  cubeShadow.name = 'coffin_cube_shadow';
  cubeShadow.position.set(-0.075, floorY + 0.002, 0.075);
  fl.add(cubeShadow);
  const symbol = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2).rotateX(-Math.PI / 2),
    unlit('#ffffff', { map: T.symbol, transparent: true, depthWrite: false }));
  symbol.name = 'coffin_symbol';
  symbol.position.set(0.43, floorY + 0.003, 0.0);
  fl.add(symbol);

  // waterline: dark shadow band + burst ripple (root frame, not tilting)
  const ringTex = radialTex('ring', [[0, 'rgba(50,8,8,0)'], [0.55, 'rgba(50,8,8,0)'], [0.78, 'rgba(50,8,8,0.6)'], [0.9, 'rgba(50,8,8,0.25)'], [1, 'rgba(50,8,8,0)']]);
  const ripple = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2),
    unlit('#ffffff', { map: ringTex, transparent: true, depthWrite: false, opacity: 0 }));
  ripple.name = 'coffin_ripple';
  ripple.position.y = 0.012;
  ripple.visible = false;
  root.add(ripple);
  const wl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.95).rotateX(-Math.PI / 2),
    unlit('#ffffff', { map: radialTex('waterline', [[0, 'rgba(45,12,12,0.6)'], [0.7, 'rgba(45,12,12,0.45)'], [1, 'rgba(45,12,12,0)']]), transparent: true, depthWrite: false, opacity: 0 }));
  wl.name = 'coffin_shadow';
  wl.position.y = 0.006;
  root.add(wl);

  const st = { risen: false, lidOpen: false, cubeTaken: false, bob: true, anim: false, t: 0 };
  fl.visible = false;
  fl.position.y = -1.4;

  const restPose = () => {
    fl.position.set(0, 0, 0);
    fl.rotation.set(0, 0, REST_TILT);
  };

  root.rise = (opts) => {
    if (st.risen) return done();
    st.risen = true;
    fl.visible = true;
    if (isInstant(opts)) { restPose(); wl.material.opacity = 1; return done(); }
    st.anim = true;
    ripple.visible = true;
    // 0–250 dark ripple spreads · 250–870 bursts head-first diagonally · 870–1190 hangs ·
    // 1190–2140 falls back · 2140–2740 settles and floats
    return timeline(2740, (t) => {
      const rk = Ease.outSine(clamp01(t / 1800));
      const s = 0.25 + rk * 1.1;
      ripple.scale.set(s, 1, s * 0.75);
      ripple.material.opacity = Math.sin(Math.min(1, rk * 1.4) * Math.PI) * 0.9;
      if (t < 870) {
        const k = phase(t, 250, 620, Ease.outCubic);
        fl.position.set(lerp(0.4, 0, k), lerp(-1.35, 0.42, k), 0);
        fl.rotation.set(lerp(0.2, 0.45, k), 0, lerp(-0.8, -0.6, k));
        wl.material.opacity = k * 0.7;
      } else if (t < 2140) {
        const k = phase(t, 1190, 950);
        fl.position.set(0, lerp(0.42, -0.05, k), 0);
        fl.rotation.set(lerp(0.45, 0, k), 0, lerp(-0.6, REST_TILT, k));
        wl.material.opacity = 0.7 + 0.3 * k;
      } else {
        fl.position.y = -0.05 * Math.cos(phase(t, 2140, 600, Ease.outSine) * Math.PI * 0.5);
      }
    }).then(() => { ripple.visible = false; restPose(); st.anim = false; });
  };

  root.pullNail = (i, opts) => {
    const n = nails[i - 1];
    if (!n || n.userData.state === 'out') return done();
    if (isInstant(opts)) { n.visible = false; n.userData.state = 'out'; return done(); }
    n.userData.state = 'pulling';
    const tb = n.rotation.z < 0.7 ? 300 : 0; // bend up first (0.3 s) unless already bent
    return timeline(tb + 380, (t) => {
      if (t < tb) { setBend(n, phase(t, 0, tb, Ease.outCubic)); return; }
      const k = phase(t, tb, 380, Ease.inCubic);
      n.userData.mesh.position.y = 0.036 + k * 0.18;
      n.rotation.z = 0.75 * (1 - k * 0.6);
      n.userData.mesh.scale.setScalar(1 - k * 0.6);
    }).then(() => { n.visible = false; n.userData.state = 'out'; });
  };
  root.nailsLeft = () => nails.filter((n) => n.userData.state !== 'out').length;

  root.slideLid = (opts) => {
    if (st.lidOpen) return done();
    st.lidOpen = true;
    for (const n of nails) { n.visible = false; n.userData.state = 'out'; }
    if (isInstant(opts)) { lid.visible = false; return done(); }
    return animate(900, (k) => {
      lid.position.z = -1.25 * k;
      lid.position.y = BOT + BODY_H + 0.03 * Math.sin(k * Math.PI);
    }, Ease.inOutSine).then(() => { lid.visible = false; });
  };

  root.takeCube = (opts) => {
    if (st.cubeTaken) return done();
    st.cubeTaken = true;
    if (isInstant(opts)) { cube.visible = false; cubeShadow.visible = false; return done(); }
    return animate(520, (k) => {
      cube.position.y = floorY + 0.07 + k * 0.3;
      cube.scale.setScalar(Math.max(0.001, 1 - k));
      cube.rotation.y = k * 1.2;
      cubeShadow.material.opacity = 1 - k;
    }, Ease.inCubic).then(() => { cube.visible = false; cubeShadow.visible = false; });
  };

  root.bob = (on = true) => { st.bob = !!on; if (!on && st.risen && !st.anim) restPose(); return done(); };

  attachUpdate(root, body, (dt) => {
    st.t += dt;
    if (!st.risen || st.anim || !st.bob) return;
    const t = st.t;
    fl.position.y = Math.sin(t * 1.25) * 0.012;
    fl.rotation.z = REST_TILT + Math.sin(t * 0.9 + 1.1) * 0.008;
    fl.rotation.x = Math.sin(t * 0.7) * 0.01;
  });
  root.userData.state = st;
  return root;
}

// =============================================================================================
// floating_cube — black cube hovering above the open coffin; origin = hover centre.

function makeFloatingCube(opts = {}) {
  const size = opts.size ?? 0.16;
  const root = new THREE.Group();
  root.name = 'floating_cube';
  const spin = new THREE.Group();
  root.add(spin);
  const cube = blackCubeMesh(size, 'floating_cube_body', size * 0.1);
  spin.add(cube);
  const st = { t: 0, shown: opts.visible ?? true, s: opts.visible === false ? 0 : 1, flat: 0 };
  spin.visible = st.shown;
  const apply = () => {
    const f = st.flat;
    spin.scale.set(st.s * (1 + f * 3.5), Math.max(0.001, st.s * (1 - f * 0.94)), st.s * (1 - f * 0.9));
  };
  apply();
  root.setVisible = (v = true, o) => {
    v = !!v;
    if (v === st.shown && !isInstant(o)) return done();
    st.shown = v;
    if (v) spin.visible = true;
    if (isInstant(o)) { st.s = v ? 1 : 0; spin.visible = v; apply(); return done(); }
    const from = st.s;
    return animate(320, (k) => { st.s = lerp(from, v ? 1 : 0, k); apply(); }, v ? Ease.outBack : Ease.inCubic)
      .then(() => { if (!v) spin.visible = false; });
  };
  // memory-vision helpers: squash into a thin black line and back
  root.collapse = (o) => {
    if (isInstant(o)) { st.flat = 1; apply(); return done(); }
    const from = st.flat;
    return animate(450, (k) => { st.flat = lerp(from, 1, k); apply(); }, Ease.inOutCubic);
  };
  root.expand = (o) => {
    if (isInstant(o)) { st.flat = 0; apply(); return done(); }
    const from = st.flat;
    return animate(450, (k) => { st.flat = lerp(from, 0, k); apply(); }, Ease.inOutCubic);
  };
  attachUpdate(root, cube, (dt) => {
    st.t += dt;
    const calm = 1 - st.flat;
    spin.rotation.y += dt * 0.55 * calm;
    spin.rotation.x = Math.sin(st.t * 0.6) * 0.18 * calm;
    spin.position.y = Math.sin(st.t * 1.7) * 0.035 * calm;
  });
  return root;
}

// =============================================================================================
// blood_tendril — thin red strand that rises out of the blood pool, writhes and sinks (loops).
// Origin on the pool surface. opts: { height = 2.3, radius = 0.035, period = 9, phase = 0 }

function makeBloodTendril(opts = {}) {
  const H = opts.height ?? 2.3, R = opts.radius ?? 0.035, period = opts.period ?? 9;
  const root = new THREE.Group();
  root.name = 'blood_tendril';
  const geo = new THREE.CylinderGeometry(R, R, H, 7, 72, true).translate(0, H / 2, 0);
  const uniforms = { uTime: { value: 0 }, uRise: { value: 0 }, uH: { value: H } };
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uRise, uH;\nvarying float vH; varying float vY;')
      .replace('#include <begin_vertex>', `
        float h = position.y;
        float f = h / uH;
        float y = h - (1.0 - uRise) * uH;
        float a = smoothstep(0.05, 0.75, f);
        float wx = sin(h * 2.4 - uTime * 2.1) * 0.20 + sin(h * 5.3 - uTime * 3.6 + 1.3) * 0.05;
        float wz = cos(h * 1.9 - uTime * 1.7) * 0.12;
        float curl = smoothstep(0.75, 1.0, f) * sin(uTime * 1.3) * 0.18;
        float taper = mix(0.55, 1.1, smoothstep(0.0, 0.5, f)) * mix(1.0, 0.35, smoothstep(0.8, 1.0, f));
        vec3 transformed = vec3(position.x * taper + (wx + curl) * a, y, position.z * taper + wz * a);
        vH = f; vY = y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH; varying float vY;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vY < 0.0) discard;
        diffuseColor.rgb = mix(vec3(0.62, 0.22, 0.22), vec3(0.50, 0.06, 0.07), smoothstep(0.08, 0.5, vH));`);
  };
  mat.customProgramCacheKey = () => 'rlp_blood_tendril';
  noOutline(mat);
  const strand = new THREE.Mesh(geo, mat);
  strand.name = 'blood_tendril_strand';
  strand.frustumCulled = false;
  root.add(strand);
  const rip = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    unlit('#ffffff', { map: radialTex('tendrilRing', [[0, 'rgba(90,10,10,0)'], [0.6, 'rgba(90,10,10,0)'], [0.8, 'rgba(90,10,10,0.55)'], [1, 'rgba(90,10,10,0)']]), transparent: true, depthWrite: false, opacity: 0 }));
  rip.name = 'blood_tendril_ripple';
  rip.position.y = 0.01;
  root.add(rip);
  const st = { t: (opts.phase ?? 0) * period, active: true, rise: 0 };
  root.setActive = (on = true, o) => {
    st.active = !!on;
    if (isInstant(o)) { if (!on) { st.rise = 0; uniforms.uRise.value = 0; } return done(); }
    return done();
  };
  attachUpdate(root, strand, (dt) => {
    st.t += dt;
    uniforms.uTime.value = st.t;
    const ph = st.t % period;
    let target;
    if (ph < 2.2) target = Ease.outSine(ph / 2.2);
    else if (ph < 5.6) target = 1;
    else if (ph < 7.4) target = 1 - Ease.inSine((ph - 5.6) / 1.8);
    else target = 0;
    if (!st.active) target = Math.max(0, st.rise - dt * 0.8);
    st.rise = target;
    uniforms.uRise.value = target;
    strand.visible = target > 0.002;
    const rk = ph < 2.6 ? ph / 2.6 : ph > 5.6 && ph < 7.8 ? (ph - 5.6) / 2.2 : -1;
    if (rk >= 0 && st.active) { const s = 0.15 + rk * 0.9; rip.scale.set(s, 1, s); rip.material.opacity = Math.sin(rk * Math.PI) * 0.8; }
    else rip.material.opacity = 0;
  });
  return root;
}

// =============================================================================================
// font — octagonal white stone font, rim of pale-brown stones, inner black ring, pulsing liquid.
// Origin on the floor at the centre; the arched niche (painting) faces +Z.

const FONT = { R_BODY: 0.66, R_BASE: 0.72, R_RIM: 0.735, R_RIM_IN: 0.585, R_LIQ: 0.485, Y_BASE: 0.1, Y_BODY: 0.925, Y_RIM: 1.04, Y_LIQ: 0.982 };

function octagon(r) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    pts.push([r * Math.sin(a), r * Math.cos(a)]);
  }
  return pts;
}

function drawJakobReflection(g, W, H) {
  g.clearRect(0, 0, W, H);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const ink = 'rgba(48,32,24,0.9)';
  const skin = '#ecd2bd', shirt = '#f1ebe0', hair = '#9a5634';
  const shape = (pts, fill, lw = 3) => {
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    g.fillStyle = fill; g.fill(); g.strokeStyle = ink; g.lineWidth = lw; g.stroke();
  };
  // forearms hanging below the rolled sleeves
  shape([[136, 400], [168, 400], [170, 478], [140, 480]], skin);
  shape([[344, 400], [376, 400], [372, 480], [342, 478]], skin);
  // torso / shirt with rolled sleeves
  g.beginPath();
  g.moveTo(170, 512); g.lineTo(166, 420); g.lineTo(134, 412); g.lineTo(140, 340);
  g.quadraticCurveTo(150, 302, 214, 292); g.lineTo(298, 292); g.quadraticCurveTo(362, 302, 372, 340);
  g.lineTo(378, 412); g.lineTo(346, 420); g.lineTo(342, 512); g.closePath();
  g.fillStyle = shirt; g.fill(); g.strokeStyle = ink; g.lineWidth = 3; g.stroke();
  g.lineWidth = 2.5;
  for (const [x1, y1, x2, y2] of [[134, 396, 168, 398], [134, 404, 168, 406], [344, 398, 378, 396], [344, 406, 378, 404], [166, 360, 166, 420], [346, 360, 346, 420]]) {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  // neck + open collar
  shape([[236, 262], [276, 262], [280, 300], [256, 336], [232, 300]], skin, 2.5);
  shape([[214, 292], [236, 286], [256, 336], [228, 318]], shirt, 2.5);
  shape([[298, 292], [276, 286], [256, 336], [284, 318]], shirt, 2.5);
  g.beginPath(); g.moveTo(256, 336); g.lineTo(256, 512); g.stroke();
  for (const y of [370, 410, 450, 490]) { g.beginPath(); g.arc(262, y, 3, 0, Math.PI * 2); g.stroke(); }
  // head
  g.beginPath(); g.ellipse(196, 222, 9, 16, 0, 0, Math.PI * 2); g.fillStyle = skin; g.fill(); g.stroke();
  g.beginPath(); g.ellipse(310, 222, 9, 16, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(253, 214, 56, 66, 0, 0, Math.PI * 2); g.fillStyle = skin; g.fill(); g.lineWidth = 3; g.stroke();
  // short auburn hair, swept
  g.beginPath();
  g.moveTo(198, 206); g.quadraticCurveTo(192, 150, 236, 140); g.quadraticCurveTo(270, 128, 296, 150);
  g.quadraticCurveTo(316, 168, 308, 210); g.quadraticCurveTo(300, 180, 282, 172); g.quadraticCurveTo(250, 182, 224, 170);
  g.quadraticCurveTo(206, 180, 198, 206); g.closePath();
  g.fillStyle = hair; g.fill(); g.stroke();
  g.lineWidth = 1.8;
  for (const [x1, y1, x2, y2] of [[230, 150, 214, 178], [256, 144, 240, 172], [280, 150, 268, 176]]) { g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(x1 - 4, y1 + 16, x2, y2); g.stroke(); }
  // heavy brows, tired heavy-lidded eyes with dark bags
  g.lineWidth = 5; g.strokeStyle = 'rgba(70,40,26,0.95)';
  g.beginPath(); g.moveTo(216, 200); g.quadraticCurveTo(230, 192, 244, 199); g.stroke();
  g.beginPath(); g.moveTo(262, 199); g.quadraticCurveTo(276, 192, 290, 200); g.stroke();
  g.strokeStyle = ink; g.lineWidth = 2.5;
  for (const cx of [231, 276]) {
    g.fillStyle = '#fbf6ef'; g.beginPath(); g.ellipse(cx, 216, 11, 5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a2a22'; g.beginPath(); g.arc(cx + 1, 217, 3.6, 0, Math.PI * 2); g.fill();
    g.lineWidth = 3.5; g.beginPath(); g.moveTo(cx - 12, 214); g.quadraticCurveTo(cx, 208, cx + 12, 214); g.stroke();
    g.lineWidth = 1.8; g.strokeStyle = 'rgba(90,60,50,0.8)';
    g.beginPath(); g.moveTo(cx - 9, 225); g.quadraticCurveTo(cx, 229, cx + 9, 225); g.stroke();
    g.beginPath(); g.moveTo(cx - 6, 231); g.quadraticCurveTo(cx, 233, cx + 6, 231); g.stroke();
    g.strokeStyle = ink;
  }
  g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(254, 220); g.lineTo(249, 246); g.quadraticCurveTo(254, 251, 261, 247); g.stroke();
  g.lineWidth = 2.8;
  g.beginPath(); g.moveTo(240, 263); g.quadraticCurveTo(254, 259, 268, 264); g.stroke();
}

function fontTextures() {
  return cachedTex('font:textures', () => {
    const { R_RIM, R_RIM_IN } = FONT;
    const S = 1024, toC = (x, z) => [((x + R_RIM) / (2 * R_RIM)) * S, ((z + R_RIM) / (2 * R_RIM)) * S];
    const rimTop = canvasTexture(S, S, (g) => {
      const r = rng(52);
      g.fillStyle = '#b39a7d'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 4000; i++) {
        g.globalAlpha = 0.08 + r() * 0.12; g.fillStyle = r() < 0.5 ? '#9a8165' : '#c7b093';
        g.fillRect(r() * S, r() * S, 2 + r() * 5, 2 + r() * 4);
      }
      g.globalAlpha = 1;
      // stone joints (7 stones, one centred at the front)
      g.strokeStyle = INK; g.lineWidth = 6;
      for (let k = 0; k < 7; k++) {
        const a = ((k + 0.5) * 2 * Math.PI) / 7;
        const [x1, y1] = toC(Math.sin(a) * (R_RIM_IN - 0.01), Math.cos(a) * (R_RIM_IN - 0.01));
        const [x2, y2] = toC(Math.sin(a) * (R_RIM + 0.01), Math.cos(a) * (R_RIM + 0.01));
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      }
      g.lineWidth = 7;
      g.beginPath(); g.arc(S / 2, S / 2, (R_RIM_IN / (2 * R_RIM)) * S + 2, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 10;
      g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); g.stroke();
    }, { wrap: false });
    const face = canvasTexture(512, 512, drawJakobReflection, { wrap: false });
    const ray = canvasTexture(64, 256, (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = 1 - y / h; // canvas bottom (v=0) = beam base
        const fx = Math.abs(x / (w - 1) - 0.5) * 2;
        const a = Math.pow(1 - fx, 2.2) * Math.pow(1 - v, 1.3) * (0.85 + 0.15 * Math.sin(v * 40));
        const i = (y * w + x) * 4;
        img.data[i] = 255; img.data[i + 1] = 248; img.data[i + 2] = 226; img.data[i + 3] = Math.round(255 * a);
      }
      g.putImageData(img, 0, 0);
    }, { wrap: false });
    const cloud = canvasTexture(256, 256, (g, w) => {
      const r = rng(9);
      for (let i = 0; i < 26; i++) {
        const x = w / 2 + (r() - 0.5) * w * 0.45, y = w / 2 + (r() - 0.5) * w * 0.3, rad = w * (0.12 + r() * 0.2);
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, 'rgba(255,255,250,0.32)'); grd.addColorStop(1, 'rgba(255,255,250,0)');
        g.fillStyle = grd; g.fillRect(0, 0, w, w);
      }
    }, { wrap: false });
    return { rimTop, face, ray, cloud };
  });
}

function makeFont() {
  const { R_BODY, R_BASE, R_RIM, R_RIM_IN, R_LIQ, Y_BASE, Y_BODY, Y_RIM, Y_LIQ } = FONT;
  const T = fontTextures();
  const root = new THREE.Group();
  root.name = 'font';

  const faceW = 2 * R_BODY * Math.sin(Math.PI / 8);
  const bodySide = inkToon('#ffffff', { map: sideInkTex({ base: '#d6d1c9', depth: Y_BODY - Y_BASE, unitFace: faceW, speckle: 0.25, line: 0.007 }) });
  const capMat = inkToon('#d9d4cc');
  const body = new THREE.Mesh(prismGeometry([{ outline: octagon(R_BODY) }], Y_BODY - Y_BASE, { y0: Y_BASE, unitU: true }), [capMat, bodySide, capMat]);
  body.name = 'font_body';
  body.castShadow = true; body.receiveShadow = true;
  root.add(body);

  const baseFace = 2 * R_BASE * Math.sin(Math.PI / 8);
  const baseSide = inkToon('#ffffff', { map: sideInkTex({ base: '#cfc9c0', depth: Y_BASE, unitFace: baseFace, speckle: 0.25, line: 0.007 }) });
  const capInk = inkToon('#ffffff', { map: cachedTex('font:baseTop', () => canvasTexture(256, 256, (g, w) => {
    g.fillStyle = '#d3cdc4'; g.fillRect(0, 0, w, w);
    g.strokeStyle = INK; g.lineWidth = 5;
    g.beginPath(); octagon(1).forEach(([x, z], i) => { const X = (x * 0.5 + 0.5) * w, Y = (z * 0.5 + 0.5) * w; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }); g.closePath(); g.stroke();
  }, { wrap: false })) });
  const base = new THREE.Mesh(prismGeometry([{ outline: octagon(R_BASE) }], Y_BASE, { y0: 0, unitU: true, bounds: { minX: -R_BASE, maxX: R_BASE, minZ: -R_BASE, maxZ: R_BASE } }), [capInk, baseSide, capInk]);
  base.name = 'font_base';
  base.castShadow = true; base.receiveShadow = true;
  root.add(base);

  // rim: 7 pale-brown stones (one centred at the front), slightly hand-wobbly
  const wob = rng(5);
  const stones = [];
  const SEG = 10;
  for (let k = 0; k < 7; k++) {
    const a0 = ((k - 0.5) * 2 * Math.PI) / 7, a1 = ((k + 0.5) * 2 * Math.PI) / 7;
    const ro = R_RIM * (0.99 + wob() * 0.012), ri = R_RIM_IN;
    const outer = [], inner = [];
    for (let i = 0; i <= SEG; i++) {
      const a = lerp(a0, a1, i / SEG);
      outer.push([ro * Math.sin(a), ro * Math.cos(a)]);
      inner.push([ri * Math.sin(a), ri * Math.cos(a)]);
    }
    const pts = [...outer, ...inner.reverse()];
    stones.push({ outline: pts, corners: [new Set([0, SEG, SEG + 1, 2 * SEG + 1])] });
  }
  const rimSide = inkToon('#ffffff', { map: sideInkTex({ base: '#a98f73', depth: Y_RIM - Y_BODY, uLen: 1, line: 0.006, speckle: 0.3 }) });
  const rim = new THREE.Mesh(prismGeometry(stones, Y_RIM - Y_BODY, { y0: Y_BODY, uLen: 1, bounds: { minX: -R_RIM, maxX: R_RIM, minZ: -R_RIM, maxZ: R_RIM } }),
    [inkToon('#ffffff', { map: T.rimTop }), rimSide, rimSide]);
  rim.name = 'font_rim';
  rim.castShadow = true;
  root.add(rim);

  // inner black ring (sloping lip down to the liquid)
  const ring = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(R_LIQ - 0.01, Y_LIQ - 0.05), new THREE.Vector2(R_LIQ, Y_LIQ - 0.004), new THREE.Vector2(R_RIM_IN + 0.004, Y_RIM - 0.002)], 64),
    toon('#363735', { outline: false, side: THREE.DoubleSide }));
  ring.name = 'font_ring';
  root.add(ring);

  // liquid
  const rip = Array.from({ length: 6 }, () => new THREE.Vector4(0.5, 0.5, -100, 0));
  const lu = {
    uTime: { value: 0 }, uGrey: { value: 0 }, uLight: { value: 0 }, uReflect: { value: 0 },
    uNoise: { value: tex.noise({ size: 256, scale: 8, seed: 29 }) }, uFace: { value: T.face }, uRip: { value: rip },
    uRedDark: { value: new THREE.Color('#561a13') }, uRedMid: { value: new THREE.Color('#78291d') }, uRedLight: { value: new THREE.Color('#c45a40') },
    uGreyDark: { value: new THREE.Color('#2b2a29') }, uGreyLight: { value: new THREE.Color('#454341') }, uClear: { value: new THREE.Color('#e9edeb') },
  };
  const liquidMat = noOutline(new THREE.ShaderMaterial({
    uniforms: lu,
    vertexShader: 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uTime, uGrey, uLight, uReflect;
      uniform sampler2D uNoise, uFace;
      uniform vec4 uRip[6];
      uniform vec3 uRedDark, uRedMid, uRedLight, uGreyDark, uGreyLight, uClear;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        float n = texture2D(uNoise, vUv * 1.1 + vec2(uTime * 0.003, uTime * 0.002)).r;
        float n2 = texture2D(uNoise, vUv * 2.6 + vec2(-uTime * 0.004, uTime * 0.003)).r;
        float vein = 1.0 - smoothstep(0.0, 0.03, abs(n2 - 0.5));
        float sq = pow(pow(abs(p.x) * 2.0, 4.0) + pow(abs(p.y) * 2.0, 4.0), 0.25);
        float blob = 1.0 - smoothstep(0.50, 0.58, sq + (n - 0.5) * 0.14);
        vec3 red = mix(uRedDark, uRedMid, smoothstep(0.25, 0.75, n));
        red = mix(red, uRedLight, blob * 0.88);
        red += vein * vec3(0.06, 0.03, 0.02);
        vec3 grey = mix(uGreyDark, uGreyLight, clamp(blob * 0.6 + (n - 0.5) * 0.4, 0.0, 1.0)) + vein * 0.025;
        vec3 col = mix(red, grey, uGrey);
        col *= 1.0 - smoothstep(0.8, 1.0, r) * 0.35;
        float ring = 0.0;
        for (int i = 0; i < 6; i++) {
          vec4 R = uRip[i];
          float age = uTime - R.z;
          if (R.w > 0.0 && age >= 0.0 && age < 2.2) {
            float rad = 0.012 + age * 0.045;
            float d = abs(length(vUv - R.xy) - rad);
            ring += R.w * (1.0 - smoothstep(0.004, 0.010, d)) * (1.0 - age / 2.2);
          }
        }
        col = mix(col, col * 0.45, clamp(ring, 0.0, 1.0) * 0.85);
        vec4 f = texture2D(uFace, vUv);
        col = mix(col, f.rgb, f.a * uReflect * 0.5);
        float pulse = 0.88 + 0.12 * sin(uTime * 2.3 - r * 7.0);
        col = mix(col, uClear * pulse * (1.06 - 0.22 * r), uLight);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const liquid = new THREE.Mesh(new THREE.CircleGeometry(R_LIQ + 0.004, 72).rotateX(-Math.PI / 2), liquidMat);
  liquid.name = 'font_liquid';
  liquid.position.y = Y_LIQ;
  root.add(liquid);

  // red drops that jump out of the surface and spread into ripples
  const dropMat = toon('#a42a20');
  const drops = Array.from({ length: 4 }, (_, i) => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 8), dropMat);
    d.name = `font_drop_${i}`;
    d.visible = false;
    d.userData = { t: 0, dur: 0.5, h: 0.06, u: 0.5, v: 0.5 };
    root.add(d);
    return d;
  });

  // niche anchor (bottom-centre of the arched niche on the front face) for plague_painting
  const niche = new THREE.Object3D();
  niche.name = 'font_niche';
  niche.position.set(0, 0.32, R_BODY * Math.cos(Math.PI / 8) + 0.002);
  root.add(niche);

  // soft contact shadow
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1).rotateX(-Math.PI / 2),
    unlit('#ffffff', { map: radialTex('fontShadow', [[0, 'rgba(20,20,20,0.5)'], [0.6, 'rgba(20,20,20,0.3)'], [1, 'rgba(20,20,20,0)']]), transparent: true, depthWrite: false }));
  blob.name = 'font_shadow';
  blob.position.y = 0.003;
  blob.renderOrder = -1;
  root.add(blob);

  // holy light (hidden until ignite): crossed additive rays + glowing cloud + warm point light
  const light = new THREE.Group();
  light.name = 'font_light';
  light.position.y = Y_LIQ;
  light.visible = false;
  root.add(light);
  const rr = rng(1796);
  const rayGeos = [];
  const rays = [[0, 0, 3.4, 0.2], [0.4, 0.42, 2.0, 0.07], [2.2, 0.55, 1.7, 0.06], [3.6, 0.35, 2.4, 0.09], [5.0, 0.6, 1.5, 0.05], [1.3, 0.22, 2.8, 0.1], [4.3, 0.18, 2.6, 0.08], [2.9, 0.3, 2.1, 0.06]];
  for (const [phi, tilt, len, w] of rays) {
    for (const cross of [0, Math.PI / 2]) {
      const pg = new THREE.PlaneGeometry(w, len).translate(0, len / 2, 0).rotateY(cross).rotateZ(tilt).rotateY(phi + rr() * 0.2);
      rayGeos.push(pg.toNonIndexed());
    }
  }
  const rayMat = unlit('#fff4d8', { map: T.ray, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0 });
  const rayMesh = new THREE.Mesh(mergeGeometries(rayGeos), rayMat);
  rayMesh.name = 'font_rays';
  light.add(rayMesh);
  const clouds = [[0, 0.12, 0, 1.3], [-0.25, 0.26, 0.1, 1.0], [0.28, 0.3, -0.05, 1.1]].map(([x, y, z, s], i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.cloud, color: '#ffffff', transparent: true, depthWrite: false, opacity: 0 }));
    sp.name = `font_cloud_${i}`;
    sp.position.set(x, y, z);
    sp.userData.s = s;
    sp.scale.setScalar(s);
    light.add(sp);
    return sp;
  });
  const glowLight = new THREE.PointLight('#fff1d2', 0, 7, 1.4);
  glowLight.name = 'font_glow_light';
  glowLight.position.set(0, Y_LIQ + 0.5, 0.3);
  root.add(glowLight);

  const rnd = rng(23);
  const st = { t: 0, nextDrop: 1.2, slot: 0, reflect: false, lit: false, light: 0, ambient: true };
  const addRipple = (u, v, strength = 1) => {
    rip[st.slot].set(u, v, st.t, strength);
    st.slot = (st.slot + 1) % rip.length;
  };
  const spawnDrop = (u, v, h = 0.05 + rnd() * 0.04) => {
    const d = drops.find((x) => !x.visible) || drops[0];
    Object.assign(d.userData, { t: 0, dur: 0.42 + h * 2.2, h, u, v });
    d.position.set((u - 0.5) * 2 * R_LIQ, Y_LIQ, -(v - 0.5) * 2 * R_LIQ);
    d.visible = true;
    addRipple(u, v, 0.6);
  };

  root.ripple = (u = 0.5, v = 0.5, o) => {
    if (u && typeof u === 'object') { o = u; u = 0.5; v = 0.5; }
    addRipple(u, v, 1);
    return isInstant(o) ? done() : wait(300);
  };
  root.showReflection = (o) => {
    if (st.reflect) return done();
    st.reflect = true;
    if (isInstant(o)) { lu.uReflect.value = 1; return done(); }
    // three red drops burst from the centre, then the reflection fades in
    const burst = [[0, 0.5, 0.52, 0.1], [160, 0.42, 0.6, 0.07], [320, 0.6, 0.44, 0.08]];
    let fired = 0;
    return timeline(2470, (t) => {
      while (fired < burst.length && t >= burst[fired][0]) { const [, u, v, h] = burst[fired++]; spawnDrop(u, v, h); }
      lu.uReflect.value = phase(t, 770, 1700);
    });
  };
  root.hideReflection = (o) => {
    if (!st.reflect) return done();
    st.reflect = false;
    if (isInstant(o)) { lu.uReflect.value = 0; return done(); }
    const from = lu.uReflect.value;
    return animate(700, (k) => { lu.uReflect.value = from * (1 - k); });
  };
  root.ignite = (o) => {
    if (st.lit) return done();
    st.lit = true;
    light.visible = true;
    if (isInstant(o)) { st.light = 1; lu.uLight.value = 1; lu.uReflect.value = 0; return done(); }
    return animate(1500, (k) => {
      st.light = k;
      lu.uLight.value = Ease.inOutSine(clamp01(k * 1.3));
      lu.uReflect.value *= 1 - k;
    }, Ease.outCubic);
  };

  attachUpdate(root, body, (dt) => {
    st.t += dt;
    const t = st.t;
    lu.uTime.value = t;
    // slow red ↔ dark-grey pulse (red for longer stretches)
    lu.uGrey.value = st.lit ? 0 : smooth(0.3, 0.7, 0.5 - 0.5 * Math.cos((t * 2 * Math.PI) / 14 + 0.6)) * 0.92;
    if (!st.lit && st.ambient) {
      st.nextDrop -= dt;
      if (st.nextDrop <= 0) {
        st.nextDrop = 2.2 + rnd() * 2.4;
        const a = rnd() * Math.PI * 2, rad = 0.12 + rnd() * 0.25;
        spawnDrop(0.5 + Math.cos(a) * rad, 0.5 + Math.sin(a) * rad);
      }
    }
    for (const d of drops) {
      if (!d.visible) continue;
      const u = d.userData;
      u.t += dt;
      const k = u.t / u.dur;
      if (k >= 1) { d.visible = false; addRipple(u.u, u.v, 1); continue; }
      d.position.y = Y_LIQ + 4 * u.h * k * (1 - k) - 0.01;
      d.scale.set(1 - 0.2 * Math.sin(k * Math.PI), 1 + 0.25 * Math.sin(k * Math.PI), 1 - 0.2 * Math.sin(k * Math.PI));
    }
    if (light.visible) {
      const L = st.light;
      const breathe = 0.82 + 0.18 * Math.sin(t * 2.1) + 0.06 * Math.sin(t * 5.3);
      rayMat.opacity = L * 0.85 * breathe;
      rayMesh.scale.set(1, 0.15 + 0.85 * L, 1);
      rayMesh.rotation.y = t * 0.06;
      clouds.forEach((c, i) => {
        c.material.opacity = L * (0.55 + 0.15 * Math.sin(t * 1.3 + i * 2));
        c.scale.setScalar(c.userData.s * (0.6 + 0.4 * L) * (1 + 0.05 * Math.sin(t * 0.9 + i)));
      });
      glowLight.intensity = L * 5 * breathe;
    }
  });
  root.userData.state = st;
  return root;
}

// =============================================================================================
// winged_holder — golden box with feathered wings hanging on a rope above the font.
// Origin = where the rope meets the chain (the box hangs below, the rope goes up `ropeLength`).

const HOLD = { W: 0.2, D: 0.15, HH: 0.104, SEAM: -0.322, OPEN: 0.097 };

function goldTextures() {
  return cachedTex('holder:textures', () => {
    const { W, D } = HOLD;
    const top = canvasTexture(256, 192, (g, w, h) => {
      g.fillStyle = '#f6c442'; g.fillRect(0, 0, w, h);
      g.strokeStyle = INK; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6);
    }, { wrap: false });
    const socketFace = canvasTexture(256, 272, (g, w, h) => {
      g.fillStyle = '#eebc3c'; g.fillRect(0, 0, w, h);
      g.strokeStyle = INK; g.lineWidth = 5; g.strokeRect(2, 2, w - 4, h - 4);
      const vent = (y) => {
        g.fillStyle = '#d4a432'; g.fillRect(52, y, w - 104, 14);
        g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(52, y, w - 104, 14);
        g.lineWidth = 2; for (let x = 62; x < w - 56; x += 11) { g.beginPath(); g.moveTo(x, y + 2); g.lineTo(x, y + 12); g.stroke(); }
      };
      vent(4); vent(h - 18);
      g.fillStyle = '#141311'; g.fillRect(18, 26, w - 36, h - 52);
    }, { wrap: false });
    const socket = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#4b442d'; g.fillRect(0, 0, w, h);
      const grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.55);
      grd.addColorStop(0, 'rgba(120,108,74,0.75)'); grd.addColorStop(0.7, 'rgba(100,90,60,0.3)'); grd.addColorStop(1, 'rgba(40,36,24,0.6)');
      g.fillStyle = grd; g.beginPath(); g.roundRect(14, 14, w - 28, h - 28, 30); g.fill();
    }, { wrap: false });
    const slats = canvasTexture(512, 64, (g, w, h) => {
      g.fillStyle = '#e8b83a'; g.fillRect(0, 0, w, h);
      g.fillStyle = INK; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
      for (let x = 0; x < w; x += 21) g.fillRect(x, 0, 5, h);
    }, { wrap: true });
    return { top, socketFace, socket, slats, W, D };
  });
}

function featherShape(L, w, pointed) {
  const s = new THREE.Shape();
  if (pointed) { // straight-ish upper edge, convex lower edge, sharp slightly upturned tip
    s.moveTo(0, w * 0.5);
    s.quadraticCurveTo(L * 0.6, w * 0.56, L, w * 0.42);
    s.quadraticCurveTo(L * 0.82, -w * 0.05, L * 0.55, -w * 0.38);
    s.quadraticCurveTo(L * 0.25, -w * 0.62, 0, -w * 0.5);
  } else {
    s.moveTo(0, w * 0.5);
    s.lineTo(L - w * 0.5, w * 0.5);
    s.absarc(L - w * 0.5, 0, w * 0.5, Math.PI / 2, -Math.PI / 2, true);
    s.lineTo(0, -w * 0.5);
  }
  s.closePath();
  return s;
}

function wingGeometry() {
  return cachedTex('holder:wingGeo', () => {
    // [rootX, rootY, angleDeg, length, width, pointed, z]
    // long primaries stacked top → bottom (upper ones in front), then a fan of short rounded
    // coverts at the root curling downwards (lower ones in front)
    const F = [
      [-0.01, 0.079, 0, 0.305, 0.048, true, 0.03],
      [-0.01, 0.051, -3, 0.272, 0.048, true, 0.018],
      [-0.01, 0.024, -5, 0.246, 0.046, true, 0.006],
      [-0.01, -0.002, -7, 0.196, 0.044, true, -0.006],
      [-0.012, -0.018, -24, 0.128, 0.042, false, 0.042],
      [-0.014, -0.032, -40, 0.112, 0.04, false, 0.054],
      [-0.016, -0.044, -57, 0.097, 0.038, false, 0.066],
      [-0.018, -0.052, -74, 0.082, 0.036, false, 0.078],
    ];
    const geos = F.map(([x, y, ang, L, w, pointed, z]) => {
      const g = new THREE.ExtrudeGeometry(featherShape(L, w, pointed), { depth: 0.006, bevelEnabled: false, curveSegments: 8 });
      const pa = g.attributes.position, col = new Float32Array(pa.count * 3);
      const hi = new THREE.Color('#f7c845'), lo = new THREE.Color('#b77e17'), c = new THREE.Color();
      for (let i = 0; i < pa.count; i++) {
        const f = smooth(-0.5, 0.15, pa.getY(i) / w); // lower edge → darker shade band
        c.copy(lo).lerp(hi, f);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.rotateZ((ang * Math.PI) / 180).translate(x, y, z - 0.03);
      g.clearGroups();
      const s = smoothForOutline(g);
      s.deleteAttribute('uv');
      return s;
    });
    return mergeGeometries(geos);
  });
}

function makeWingedHolder(opts = {}) {
  const ropeLen = opts.ropeLength ?? 4;
  const { W, D, HH, SEAM, OPEN } = HOLD;
  const T = goldTextures();
  const root = new THREE.Group();
  root.name = 'winged_holder';

  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 1, 10).translate(0, 0.5, 0), toon('#cdc2ad'));
  rope.name = 'holder_rope';
  rope.scale.y = ropeLen;
  root.add(rope);

  const body = new THREE.Group();
  body.name = 'holder_body';
  root.add(body);

  const gold = '#f4c03e';
  const goldPlain = toon(gold, { emissive: '#2a1d00' });
  const sideGold = inkToon('#ffffff', { map: sideInkTex({ base: '#f2be3e', depth: HH, uLen: 1, line: 0.003 }), emissive: '#2a1d00' });
  const capGold = inkToon('#ffffff', { map: T.top, emissive: '#2a1d00' });
  const boxGeo = prismGeometry([{ outline: rectPts(W, D) }], HH, { y0: 0, uLen: 1 });

  // chain: ferrule at the rope end, an upright oval link, and a bail seen edge-on
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.019, 0.03, 14).translate(0, -0.015, 0), goldPlain);
  ferrule.name = 'holder_ferrule';
  body.add(ferrule);
  const link = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.0075, 8, 22), goldPlain);
  link.name = 'holder_link';
  link.scale.set(1, 1.6, 1);
  link.position.y = -0.078;
  body.add(link);

  const topHalf = new THREE.Group();
  topHalf.name = 'holder_top';
  body.add(topHalf);
  const topMesh = new THREE.Mesh(boxGeo, [capGold, sideGold, capGold]);
  topMesh.name = 'holder_top_box';
  topMesh.position.y = SEAM;
  topHalf.add(topMesh);
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0075, 8, 22), goldPlain);
  bail.name = 'holder_bail';
  bail.scale.set(1, 1.55, 1);
  bail.rotation.y = Math.PI / 2;
  bail.position.y = SEAM + HH + 0.044;
  topHalf.add(bail);

  const bottomHalf = new THREE.Group();
  bottomHalf.name = 'holder_bottom';
  body.add(bottomHalf);
  const botMesh = new THREE.Mesh(boxGeo, [capGold, sideGold, capGold]);
  botMesh.name = 'holder_bottom_box';
  botMesh.position.y = SEAM - HH;
  bottomHalf.add(botMesh);
  const grille = new THREE.Mesh(prismGeometry([{ outline: rectPts(0.116, 0.08) }], 0.026, { y0: SEAM - HH - 0.026, uLen: 0.4 }),
    [capGold, inkToon('#ffffff', { map: T.slats, emissive: '#2a1d00' }), capGold]);
  grille.name = 'holder_grille';
  bottomHalf.add(grille);

  // socket unit (hidden inside the closed box; revealed when the halves slide apart)
  const SU_W = 0.186, SU_H = 0.198, SU_D = 0.13;
  const socketUnit = new THREE.Group();
  socketUnit.name = 'holder_socket_unit';
  body.add(socketUnit);
  const su = new THREE.Mesh(prismGeometry([{ outline: rectPts(SU_W, SU_D) }], SU_H, { y0: SEAM - SU_H / 2, uLen: 1 }),
    [goldPlain, inkToon('#ffffff', { map: sideInkTex({ base: '#eebb3c', depth: SU_H, uLen: 1, line: 0.003 }), emissive: '#2a1d00' }), goldPlain]);
  socketUnit.add(su);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(SU_W, SU_H), noOutline(new THREE.MeshToonMaterial({ map: T.socketFace, emissive: '#2a1d00' })));
  face.position.set(0, SEAM, SU_D / 2 + 0.0012);
  socketUnit.add(face);
  const socket = new THREE.Mesh(new THREE.PlaneGeometry(0.132, 0.13), noOutline(new THREE.MeshBasicMaterial({ map: T.socket, color: '#d8d8d8' })));
  socket.name = 'holder_socket';
  socket.position.set(0, SEAM, SU_D / 2 + 0.0024);
  socketUnit.add(socket);
  const tabGeo = prismGeometry([{ outline: rectPts(0.018, 0.07) }], 0.1, { y0: SEAM - 0.05, uLen: 1 });
  for (const sx of [-1, 1]) {
    const tab = new THREE.Mesh(tabGeo, [goldPlain, inkToon('#ffffff', { map: sideInkTex({ base: '#e6b53a', depth: 0.1, uLen: 1, line: 0.003 }), emissive: '#2a1d00' }), goldPlain]);
    tab.position.x = sx * (SU_W / 2 + 0.009);
    socketUnit.add(tab);
  }
  const cube = new THREE.Mesh(new RoundedBoxGeometry(0.124, 0.124, 0.03, 2, 0.008), toon('#5a5a56'));
  cube.name = 'holder_cube';
  cube.position.set(0, SEAM, SU_D / 2 + 0.006);
  cube.visible = false;
  socketUnit.add(cube);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTex('warmFlash', [[0, 'rgba(255,214,140,1)'], [0.35, 'rgba(255,180,90,0.55)'], [1, 'rgba(255,160,80,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
  }));
  flash.name = 'holder_flash';
  flash.position.set(0, SEAM, SU_D / 2 + 0.06);
  flash.visible = false;
  body.add(flash);

  // wings
  const wingGeo = wingGeometry();
  const wingMat = inkToon('#ffffff', { vertexColors: true, emissive: '#2a1d00' });
  const wings = [1, -1].map((sx) => {
    const w = new THREE.Mesh(wingGeo, wingMat);
    w.name = sx > 0 ? 'holder_wing_r' : 'holder_wing_l';
    w.position.set(sx * (W / 2 + 0.006), SEAM - 0.002, 0.0);
    w.scale.x = sx;
    w.castShadow = true;
    body.add(w);
    return w;
  });
  void wings;

  const st = { open: false, cube: false, closedAfterCube: false, lowered: 0, t: 0 };
  const setOpen = (k) => {
    topHalf.position.y = OPEN * k;
    bottomHalf.position.y = -OPEN * k;
    socketUnit.visible = k > 0.002;
    bail.scale.y = 1.55 * (1 - k * 0.85);
    bail.position.y = SEAM + HH + 0.044 - 0.03 * k;
    bail.visible = k < 0.95;
  };
  const setLower = (d) => {
    st.lowered = d;
    body.position.y = -d;
    rope.position.y = -d;
    rope.scale.y = ropeLen + d;
  };
  setOpen(0);
  root.open = (o) => {
    if (st.open) return done();
    st.open = true;
    if (isInstant(o)) { setOpen(1); return done(); }
    return animate(650, (k) => setOpen(k), Ease.inOutCubic);
  };
  root.close = (o) => {
    if (!st.open) return done();
    st.open = false;
    if (isInstant(o)) { setOpen(0); return done(); }
    return animate(650, (k) => setOpen(1 - k), Ease.inOutCubic);
  };
  root.insertCube = (o) => {
    if (st.cube) return done();
    st.cube = true;
    cube.visible = true;
    if (isInstant(o)) { cube.scale.setScalar(1); return done(); }
    flash.visible = true;
    return animate(900, (k) => {
      cube.scale.setScalar(lerp(0.55, 1, Ease.outBack(clamp01(k * 2))));
      flash.material.opacity = Math.sin(Math.min(1, k * 1.15) * Math.PI) * 0.95;
      flash.scale.setScalar(0.35 + k * 0.55);
    }, Ease.linear).then(() => { flash.visible = false; });
  };
  root.lower = (distance = 1, o) => {
    if (typeof distance === 'object') { o = distance; distance = 1; }
    const from = st.lowered, to = from + distance;
    if (isInstant(o)) { setLower(to); return done(); }
    return animate(Math.max(900, 1600 * Math.abs(distance)), (k) => setLower(lerp(from, to, k)), Ease.inOutSine);
  };
  attachUpdate(root, topMesh, (dt) => { st.t += dt; });
  root.userData.state = st;
  return root;
}

// =============================================================================================
// plague_painting — small arched oil painting in a white multi-arch frame, painted on a canvas.
// Origin = bottom-centre of the frame back; the picture faces +Z. glowCube / purify / frameFrogs
// redraw the canvas texture.

const PAINT = { OW: 0.4, OH: 0.353, ORY: 0.16, IW: 0.352, IH: 0.311, IRY: 0.143, IY0: 0.0207, DEPTH: 0.02, CW: 1024, CH: 905 };

function archPts(w, h, ry, y0 = 0, segs = 32) {
  const ys = y0 + h - ry;
  const pts = [[-w / 2, -y0], [w / 2, -y0]];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI;
    pts.push([(Math.cos(a) * w) / 2, -(ys + Math.sin(a) * ry)]);
  }
  return pts;
}

function archPath(g, x0, y0, w, h, ry) { // canvas coords (y down)
  const yS = y0 + ry;
  g.beginPath();
  g.moveTo(x0, y0 + h);
  g.lineTo(x0, yS);
  g.ellipse(x0 + w / 2, yS, w / 2, ry, 0, Math.PI, 2 * Math.PI);
  g.lineTo(x0 + w, y0 + h);
  g.closePath();
}

function frameTexture() {
  return cachedTex('painting:frame', () => {
    const { OW, OH, ORY } = PAINT;
    const W = 1024, H = Math.round((1024 * OH) / OW), ppm = W / OW;
    return canvasTexture(W, H, (g) => {
      g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, W, H);
      const inset = (d, col, lw) => {
        const p = d * ppm;
        archPath(g, p, p, W - 2 * p, H - p - Math.min(p, 0.0207 * ppm), ORY * ppm - p);
        g.strokeStyle = col; g.lineWidth = lw; g.stroke();
      };
      const r = rng(8);
      for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(150,145,135,${r() * 0.08})`; g.fillRect(r() * W, r() * H, 2 + r() * 4, 2); }
      inset(0.0072, '#9a9690', 3);
      inset(0.0128, '#a29e98', 3);
      inset(0.0182, '#8f8b85', 3);
      g.lineWidth = 12; g.strokeStyle = INK;
      archPath(g, 4, 4, W - 8, H - 8, ORY * ppm - 4); g.stroke();
      // inner edge ink + a grey inner bevel shadow
      const pi = 0.024 * ppm;
      archPath(g, pi, 0.0213 * ppm, W - 2 * pi, H - 0.0213 * ppm - 0.0207 * ppm, PAINT.IRY * ppm);
      g.strokeStyle = 'rgba(80,78,74,0.55)'; g.lineWidth = 14; g.stroke();
      g.strokeStyle = INK; g.lineWidth = 7; g.stroke();
    }, { wrap: false });
  });
}

// Catmull-Rom sampling of a canvas polyline
function sampleCurve(pts, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * (pts.length - 1);
    const k = Math.min(pts.length - 2, Math.floor(t)), f = t - k;
    const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)];
    const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
    out.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

const pw = (pts) => (x) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
};

const STREAM = [[454, 541], [470, 546], [495, 555], [535, 569], [587, 575], [644, 581], [679, 592], [702, 615], [736, 634], [782, 646], [828, 655], [863, 666], [892, 686]];
const CUBE_C = [489, 781];
const FROG_BOX = [814, 752, 962, 886];
const WOMAN_BOX = [276, 632, 388, 776];   // 红斗篷女人（第二灾结尾框住她，预示第三灾）
// 第三灾：天上的蚱蜢和苍蝇（原作画里一直有，这里用 insects 选项画出来），结尾白框框住苍蝇；
// 光线抹掉女人时，WOMAN_AREA 这一块换成“没有女人和虫柱”的底图。
const FLY_C = [566, 118], HOPPER_C = [392, 152];
const FLY_BOX = [526, 76, 610, 160];
const WOMAN_AREA = [258, 512, 448, 788];

/** 第三灾起画在天上的蚱蜢和苍蝇（原作画里一直都有）：固定坐标的笔触，不消耗随机数。 */
function paintSkyInsects(g) {
  const E = (x, y, rx, ry, rot, fill, a = 1, stroke = null, lw = 2) => {
    g.globalAlpha = a; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
  };
  const L = (pts, col, lw, a = 1) => { g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  // 苍蝇：透明翅膀向右上张开，黑身体，六条腿垂着
  const [fx, fy] = FLY_C;
  E(fx + 18, fy - 16, 24, 9, -0.95, '#cfd8dc', 0.62, '#59646d', 1.6);
  E(fx + 23, fy - 5, 21, 8, -0.45, '#c4cfd4', 0.55, '#59646d', 1.6);
  for (const [dx, ex, ey] of [[-5, -16, 30], [-1, -6, 33], [3, 6, 33], [6, 16, 29], [-3, -20, 22], [5, 20, 21]]) L([[fx + dx, fy + 6], [fx + dx * 1.6, fy + 15], [fx + ex, fy + ey]], '#151515', 1.8, 0.9);
  E(fx - 9, fy + 13, 9, 13, 0.55, '#202024');
  for (const k of [0, 1, 2]) L([[fx - 16 + k * 4, fy + 6 + k * 7], [fx - 4 + k * 4, fy + 2 + k * 7]], '#5d5f63', 1.4, 0.7);
  E(fx, fy, 10, 9, 0, '#1a1a1c');
  E(fx + 8, fy - 9, 7.5, 6.5, 0, '#141414');
  E(fx + 11, fy - 11, 3.4, 3.8, 0, '#6e2b1f');
  // 蚱蜢：绿色细长身体斜着（头朝右上），长后腿向左下伸，半透明翅膀，触角
  const [hx, hy] = HOPPER_C;
  E(hx - 2, hy - 4, 30, 8, -0.72, '#9a8f5a', 0.45, '#4e4a2c', 1.4);
  L([[hx - 6, hy + 4], [hx - 30, hy + 30], [hx - 16, hy + 40]], '#3f5a22', 4.2);
  L([[hx - 6, hy + 4], [hx - 30, hy + 30], [hx - 16, hy + 40]], '#6f8f3a', 2.4);
  L([[hx - 2, hy + 2], [hx - 12, hy + 28], [hx + 2, hy + 36]], '#3f5a22', 3.6);
  L([[hx - 2, hy + 2], [hx - 12, hy + 28], [hx + 2, hy + 36]], '#7c9a42', 2);
  E(hx, hy, 28, 7.5, -0.72, '#3f5a22');
  E(hx, hy, 26, 6, -0.72, '#6f8f3a');
  E(hx - 3, hy + 3, 18, 3, -0.72, '#a9bd66', 0.8);
  for (const [dx, dy] of [[8, -2], [14, -8]]) L([[hx + dx, hy + dy], [hx + dx + 2, hy + dy + 14], [hx + dx + 8, hy + dy + 18]], '#3f5a22', 1.6);
  E(hx + 20, hy - 18, 6.5, 5.5, -0.7, '#4f6e2c');
  E(hx + 22, hy - 19, 2, 2, 0, '#1a1a12');
  L([[hx + 24, hy - 22], [hx + 36, hy - 40], [hx + 50, hy - 46]], '#2f3a1c', 1.3);
  L([[hx + 25, hy - 20], [hx + 42, hy - 32], [hx + 56, hy - 34]], '#2f3a1c', 1.3);
  g.globalAlpha = 1;
}

/** The static oil painting (everything except the cube, the stream and the overlays). */
function paintPlagueBase(W, H, { frogs = true, woman = true, insects = false } = {}) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  let g = c.getContext('2d');   // 画女人时可能临时换成丢弃画布（见下）
  const r = rng(1796);
  const rr = (a, b) => a + (b - a) * r();
  const pick = (arr) => arr[(r() * arr.length) | 0];
  const dab = (x, y, rx, ry, rot, col, a = 1) => { g.globalAlpha = a; g.fillStyle = col; g.beginPath(); g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2); g.fill(); };
  const strk = (x, y, len, ang, wd, col, a = 1) => { g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke(); };
  const poly = (pts, fill, a = 1) => { g.globalAlpha = a; g.fillStyle = fill; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
  g.lineCap = 'round'; g.lineJoin = 'round';

  // --- sky
  let grd = g.createLinearGradient(0, 0, 0, 330);
  grd.addColorStop(0, '#8b94a3'); grd.addColorStop(0.45, '#b3bbc6'); grd.addColorStop(1, '#d2d6d9');
  g.fillStyle = grd; g.fillRect(0, 0, W, 340);
  for (let i = 0; i < 60; i++) {
    const x = rr(-60, W + 60), y = rr(0, 250), rad = rr(40, 130);
    const col = r() < 0.55 ? '112,119,134' : '230,232,234';
    const gg = g.createRadialGradient(x, y, 0, x, y, rad);
    gg.addColorStop(0, `rgba(${col},${rr(0.15, 0.4)})`); gg.addColorStop(1, `rgba(${col},0)`);
    g.globalAlpha = 1; g.fillStyle = gg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 1500; i++) strk(rr(0, W), rr(0, 280), rr(8, 28), rr(-0.25, 0.12), rr(2, 5), pick(['#a5adb9', '#c3c8cf', '#8f97a5', '#d9dcdf', '#aeb5bf']), rr(0.08, 0.22));
  // full moon (upper right)
  const [mx, my, mr] = [711, 142, 28];
  grd = g.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 2.6);
  grd.addColorStop(0, 'rgba(255,250,232,0.45)'); grd.addColorStop(1, 'rgba(255,250,232,0)');
  g.globalAlpha = 1; g.fillStyle = grd; g.fillRect(mx - 80, my - 80, 160, 160);
  dab(mx, my, mr, mr, 0, '#efe9cf');
  for (let i = 0; i < 9; i++) dab(mx + rr(-16, 16), my + rr(-16, 16), rr(2, 6), rr(2, 5), r(), '#bfb89e', 0.45);
  g.globalAlpha = 0.35; g.strokeStyle = '#8f8a78'; g.lineWidth = 3; g.beginPath(); g.arc(mx, my, mr - 1, 0.1, 1.9); g.stroke();

  // --- mountains (two purple-grey jagged ranges)
  const range = (ctrl, amp, baseY, fill, light, dark, snow) => {
    // jagged ridge by midpoint displacement over a few control peaks
    let pts = ctrl.map((p) => [...p]);
    for (let lvl = 0, a = amp; lvl < 6; lvl++, a *= 0.55) {
      const nx = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        nx.push([x1, y1], [(x1 + x2) / 2 + rr(-0.15, 0.15) * (x2 - x1), (y1 + y2) / 2 + rr(-a, a * 0.6)]);
      }
      nx.push(pts[pts.length - 1]);
      pts = nx;
    }
    poly([...pts, [W + 30, baseY], [-30, baseY]], fill);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const lit = y2 < y1;
      const n = 3 + Math.round(Math.abs(x2 - x1) / 4);
      for (let k = 0; k < n; k++) {
        const f = r(), x0 = lerp(x1, x2, f), y0 = lerp(y1, y2, f);
        strk(x0, y0 + 1.5, rr(6, 40), Math.PI / 2 + (lit ? 0.45 : -0.45) + rr(-0.3, 0.3), rr(1, 3), lit ? light : dark, rr(0.25, 0.65));
        if (snow && lit && r() < 0.18) strk(x0, y0 + 2, rr(4, 12), Math.PI / 2 + 0.5, 1.6, '#e3dde9', 0.7);
      }
    }
    return pts;
  };
  const peaks = (x0, x1, n, top, drop) => {
    const pts = [];
    for (let i = 0; i <= n * 2; i++) {
      const x = lerp(x0, x1, i / (n * 2)) + rr(-12, 12);
      pts.push([x, i % 2 ? top(x) + rr(drop * 0.5, drop) : top(x) + rr(-10, 8)]);
    }
    return pts;
  };
  const backTop = pw([[-30, 240], [150, 222], [330, 206], [480, 192], [560, 196], [700, 214], [860, 210], [1054, 226]]);
  const frontTop = pw([[-30, 282], [200, 266], [420, 258], [640, 270], [860, 262], [1054, 272]]);
  range(peaks(-30, 1054, 14, backTop, 46), 9, 352, '#9586a6', '#c5b8d3', '#6c5e84', true);
  range(peaks(-30, 1054, 11, frontTop, 26), 6, 356, '#7f7193', '#ab9ebe', '#574c6e', false);
  // foothills / distant meadows and forest
  poly([[0, 300], [W, 296], [W, 372], [0, 372]], '#7e7d58', 0.0);
  for (let i = 0; i < 1400; i++) {
    const x = rr(0, W), y = rr(298, 362);
    strk(x, y, rr(5, 16), rr(-0.15, 0.15), rr(2, 4), pick(['#8f8c5c', '#6e7448', '#a69e63', '#5a6140', '#7c7a52']), rr(0.35, 0.8));
  }
  for (let i = 0; i < 700; i++) dab(rr(0, W), rr(338, 364), rr(2, 5), rr(3, 7), 0, pick(['#3b4630', '#2f3a28', '#46523a']), rr(0.5, 0.9));
  // far shore: snowy dark tree line on the right + the red-roofed cottage
  for (let i = 0; i < 90; i++) {
    const x = rr(740, W), b = rr(362, 374), h = rr(8, 20);
    poly([[x, b - h], [x + h * 0.3, b], [x - h * 0.3, b]], pick(['#29342a', '#323e30']), 0.9);
    if (r() < 0.55) dab(x + rr(-2, 2), b - h * rr(0.3, 0.7), rr(1, 2.5), rr(1, 2), 0, '#f1f3f1', 0.9);
  }
  poly([[658, 349], [676, 349], [676, 359], [658, 359]], '#e9e4da');
  poly([[655, 350], [667, 340], [679, 350]], '#a5342b');
  dab(667, 355, 1.6, 2.5, 0, '#3a2a22');

  // --- lake
  grd = g.createLinearGradient(0, 360, 0, 520);
  grd.addColorStop(0, '#c4cacf'); grd.addColorStop(1, '#dfe3e4');
  g.globalAlpha = 1; g.fillStyle = grd; g.fillRect(0, 362, W, 180);
  for (let i = 0; i < 900; i++) strk(rr(-20, W), rr(364, 530), rr(20, 90), rr(-0.02, 0.02), rr(1.5, 4), pick(['#e9eced', '#b6bec3', '#d0d5d8', '#f5f7f7', '#a7a5b3']), rr(0.15, 0.4));
  for (let i = 0; i < 200; i++) strk(rr(0, W), rr(364, 382), rr(10, 40), 0, rr(2, 4), '#8f8a9c', rr(0.1, 0.25));
  grd = g.createRadialGradient(880, 430, 10, 880, 430, 200);
  grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.globalAlpha = 1; g.fillStyle = grd; g.fillRect(650, 360, 374, 200);
  for (let i = 0; i < 16; i++) { // white ice floes on the right
    const x = rr(760, 990), y = rr(374, 398), s = rr(6, 18);
    const pts = Array.from({ length: 6 }, (_, k) => { const a = (k / 6) * Math.PI * 2; return [x + Math.cos(a) * s * rr(0.6, 1.3), y + Math.sin(a) * s * 0.35 * rr(0.6, 1.3)]; });
    poly(pts.map(([px, py]) => [px, py + 2]), '#8f989d', 0.6);
    poly(pts, '#f7f8f8', 0.95);
  }

  // --- forest band around the oval meadow
  const forestTop = pw([[0, 398], [160, 404], [320, 410], [470, 404], [620, 412], [760, 430], [900, 446], [1024, 456]]);
  const meadowTop = pw([[0, 742], [70, 702], [150, 650], [250, 596], [350, 562], [450, 543], [550, 547], [650, 561], [750, 589], [850, 621], [940, 643], [1024, 656]]);
  const band = [];
  for (let x = 0; x <= W; x += 16) band.push([x, forestTop(x) + 26]);
  for (let x = W; x >= 0; x -= 16) band.push([x, meadowTop(x) + 4]);
  poly(band, '#25301e');
  const conifer = (x, b, h) => {
    const dark = pick(['#22301c', '#2a3a22', '#31432a', '#1c2818']);
    strk(x, b, h * 0.12, -Math.PI / 2, 2, '#2a2218', 0.9);
    for (let t = 0; t < 5; t++) {
      const tw = h * 0.25 * (1 - t * 0.16), ty = b - h * 0.08 - h * 0.17 * t;
      poly([[x + rr(-1, 1), ty - h * 0.3], [x + tw, ty], [x - tw, ty]], dark);
      strk(x - tw * 0.55, ty - 2, tw * 0.55, -0.45, 1.6, pick(['#566f3e', '#4b6236', '#6a7f45']), 0.6);
    }
    poly([[x, b - h * 1.02], [x + 2, b - h * 0.8], [x - 2, b - h * 0.8]], dark);
  };
  const decid = (x, b, h) => {
    strk(x, b, h * 0.3, -Math.PI / 2, 2, '#2c2416', 0.9);
    const cy = b - h * 0.55, rx = h * 0.24, ry = h * 0.34;
    for (let k = 0; k < 12; k++) dab(x + rr(-rx, rx) * 0.8, cy + rr(-ry, ry) * 0.8, rr(rx * 0.35, rx * 0.6), rr(ry * 0.3, ry * 0.5), r(), pick(['#8e7426', '#a8862c', '#76652a', '#6c6a2c', '#9a7a28', '#5f6430', '#b08e32']), 0.95);
    for (let k = 0; k < 5; k++) dab(x + rr(0, rx) * 0.7, cy + rr(0, ry) * 0.7, rr(3, rx * 0.4), rr(3, ry * 0.3), r(), '#3a3014', 0.4);
    for (let k = 0; k < 3; k++) dab(x - rr(0, rx) * 0.6, cy - rr(0, ry) * 0.6, rr(2, rx * 0.28), rr(2, ry * 0.22), r(), '#cfaa4a', 0.55);
  };
  for (let y = 392; y <= 760; y += 7) {
    const f = (y - 392) / 368;
    const h = lerp(20, 60, f);
    let x = rr(-20, 0);
    while (x < W + 20) {
      const top = forestTop(x), mt = meadowTop(x);
      const front = smooth(-70, 0, y - mt); // the rows nearest the meadow carry most autumn trees
      if (y >= top + h * 0.45 && y <= mt + 6) {
        if (r() < lerp(0.82, 0.5, front)) conifer(x + rr(-4, 4), y, h * rr(0.9, 1.25));
        else decid(x + rr(-4, 4), y, h * rr(0.8, 1.05));
      }
      x += h * rr(0.32, 0.5);
    }
  }

  // --- meadow
  const mPoly = [];
  for (let x = 0; x <= W; x += 16) mPoly.push([x, meadowTop(x)]);
  mPoly.push([W, H], [0, H]);
  grd = g.createLinearGradient(0, 540, 0, H);
  grd.addColorStop(0, '#a6a845'); grd.addColorStop(0.45, '#8aa03a'); grd.addColorStop(1, '#5d7a29');
  g.globalAlpha = 1; g.fillStyle = grd; g.beginPath(); mPoly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
  g.save(); g.clip();
  for (let i = 0; i < 7000; i++) {
    const x = rr(0, W), y = rr(536, H);
    const f = (y - 536) / (H - 536);
    strk(x, y, rr(3, 7) + f * 9, -Math.PI / 2 + rr(-0.7, 0.7), rr(1.2, 2.4) + f, pick(['#9fae3e', '#b9b950', '#7f9a34', '#6c8a2c', '#c8c463', '#5e7a28', '#a9a24a', '#8c9d3a']), rr(0.3, 0.7));
  }
  for (let i = 0; i < 50; i++) dab(rr(480, 900), rr(600, 740), rr(10, 30), rr(5, 12), rr(-0.3, 0.3), pick(['#9c5a2b', '#a8682f', '#8f5a26']), rr(0.06, 0.14));
  for (let i = 0; i < 900; i++) { // red-orange flower fields along the stream and the right half
    const x = rr(470, 1000), y = rr(590, 800);
    dab(x, y, rr(1, 2.2), rr(0.8, 1.6), 0, pick(['#b8322a', '#c8472c', '#d9772b', '#a8282a']), rr(0.45, 0.85));
  }
  for (let i = 0; i < 1900; i++) {
    const y = rr(630, H), f = (y - 630) / (H - 630);
    dab(rr(0, W), y, rr(1, 2) + f * 2, rr(1, 2) + f * 1.5, 0, pick(['#c0392b', '#c0392b', '#d9772b', '#f1efe2', '#e2c64a', '#d65b4a', '#b8322a', '#f4f0d8']), rr(0.55, 0.95));
  }
  grd = g.createLinearGradient(0, 850, 0, H);
  grd.addColorStop(0, 'rgba(30,40,15,0)'); grd.addColorStop(1, 'rgba(30,40,15,0.45)');
  g.globalAlpha = 1; g.fillStyle = grd; g.fillRect(0, 850, W, H - 850);
  // pale path on the left
  for (const [x, y] of sampleCurve([[0, 778], [50, 738], [110, 690], [170, 642], [232, 602], [292, 574], [346, 558]], 160)) {
    for (let k = 0; k < 2; k++) dab(x + rr(-5, 5), y + rr(-3, 3), rr(1.5, 3.5), rr(1.2, 2.5), 0, pick(['#cdb98a', '#dccb9c', '#b9a675']), rr(0.5, 0.85));
  }
  g.restore();

  // --- pond lower right (the stream runs into it)
  const pond = Array.from({ length: 18 }, (_, k) => { const a = (k / 18) * Math.PI * 2; return [935 + Math.cos(a) * 88 * rr(0.88, 1.08), 730 + Math.sin(a) * 62 * rr(0.85, 1.1)]; });
  poly(pond.map(([x, y]) => [x + 3, y + 3]), '#3c4d2c', 0.9);
  poly(pond, '#8d9ca1');
  g.save(); g.globalAlpha = 1; g.beginPath(); pond.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip();
  for (let i = 0; i < 160; i++) strk(rr(840, 1030), rr(665, 800), rr(10, 40), rr(-0.04, 0.04), rr(1.5, 3), pick(['#c3cdd0', '#6c7b7f', '#a9b6b9']), rr(0.25, 0.55));
  g.restore();
  for (let i = 0; i < 160; i++) { // grassy, reedy shore blending the pond into the meadow
    const k = (r() * pond.length) | 0, p = pond[k], q = pond[(k + 1) % pond.length], f = r();
    const x = lerp(p[0], q[0], f), y = lerp(p[1], q[1], f);
    strk(x + rr(-6, 6), y + rr(-3, 5), rr(5, 14), -Math.PI / 2 + rr(-0.4, 0.4), rr(1.4, 2.6), pick(['#2f4524', '#4b5f2c', '#6b6a30', '#7f9a34', '#8c9d3a']), rr(0.5, 0.9));
  }

  // --- dead cow (lower left), black-and-white, lying with stiff legs
  g.globalAlpha = 1;
  g.lineWidth = 2; g.strokeStyle = '#26241f';
  for (const [x1, y1, x2, y2] of [[132, 816, 172, 846], [148, 820, 196, 842], [170, 816, 214, 830], [186, 810, 224, 812]]) {
    g.globalAlpha = 1; g.strokeStyle = '#26241f'; g.lineWidth = 7; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = '#ecebe5'; g.lineWidth = 4; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    dab(x2, y2, 3.5, 2.5, 0.4, '#1d1b18');
  }
  dab(150, 832, 60, 9, 0, '#3a4a20', 0.35);
  dab(150, 806, 54, 21, -0.08, '#26241f');
  dab(150, 806, 51.5, 18.5, -0.08, '#efeee8');
  for (const [x, y, a, b] of [[128, 798, 14, 8], [160, 812, 12, 7], [178, 798, 9, 6], [146, 794, 7, 4]]) dab(x, y, a, b, r(), '#1c1b19');
  dab(95, 822, 18, 9.5, 0.55, '#26241f');
  dab(95, 822, 16, 7.5, 0.55, '#ecebe5');
  dab(86, 829, 7, 5, 0.55, '#3b3732');
  dab(101, 815, 5, 4, 0, '#1c1b19');
  strk(104, 812, 9, -2.2, 2.4, '#d8d2c0');
  strk(200, 798, 16, -0.4, 2, '#2a2722');
  // --- old man in a green robe kneeling (right of centre), facing left
  poly([[683, 768], [740, 768], [744, 742], [732, 710], [714, 694], [696, 694], [684, 714], [678, 744]], '#244d2b');
  poly([[686, 764], [738, 764], [740, 740], [728, 712], [712, 698], [698, 698], [688, 716], [682, 744]], '#3e7d45');
  for (let i = 0; i < 24; i++) strk(rr(690, 734), rr(706, 760), rr(8, 20), Math.PI / 2 + rr(-0.4, 0.4), 2, pick(['#2a5a30', '#5f9c5c', '#326a39']), 0.6);
  dab(744, 766, 8, 4, 0, '#4c3a28');
  dab(695, 700, 10, 10, 0, '#e3c7aa');
  dab(699, 694, 9, 7, 0.3, '#f1f0ea');
  dab(688, 712, 5, 9, 0.3, '#eeede6');
  strk(688, 724, 16, 2.4, 4, '#3e7d45');
  dab(674, 757, 5, 3.5, 0, '#e3c7aa');
  // --- woman in a red cloak running to the left, black smoke column of insects behind her
  // （第三灾结尾要抹掉她：woman=false 时笔触画在一张丢弃的画布上，随机数消耗不变，后面的笔触不受影响）
  const realG = g;
  if (!woman) { const scratch = document.createElement('canvas'); scratch.width = W; scratch.height = H; g = scratch.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round'; }
  const smoke = sampleCurve([[372, 712], [378, 680], [370, 644], [383, 606], [378, 566], [386, 540]], 60);
  smoke.forEach(([x, y], i) => {
    const f = i / smoke.length;
    for (let k = 0; k < 3; k++) dab(x + rr(-5, 5), y + rr(-4, 4), rr(4, 8) + f * 9, rr(5, 9) + f * 6, r(), pick(['#4a4a47', '#5a5a56', '#363634']), rr(0.1, 0.2));
    if (i % 3 === 0) strk(x - 6, y, rr(8, 16), rr(-0.6, 0.6), 1.6, '#1d1d1c', 0.35);
  });
  for (let i = 0; i < 80; i++) { const a = rr(0, Math.PI * 2), d = rr(8, 55); dab(378 + Math.cos(a) * d - 8, 596 + Math.sin(a) * d * 1.4, rr(0.9, 2), rr(0.7, 1.4), a, '#121212', rr(0.55, 0.95)); }
  dab(304, 754, 5, 3, 0, '#e6cbb0');
  dab(322, 757, 5, 3, 0, '#e6cbb0');
  strk(306, 742, 12, Math.PI / 2 + 0.2, 4, '#e2c4a6');
  strk(320, 742, 14, Math.PI / 2 - 0.2, 4, '#e2c4a6');
  poly([[300, 670], [318, 662], [338, 674], [356, 702], [372, 738], [362, 750], [336, 748], [312, 746], [296, 734], [298, 702]], '#7b1418');
  poly([[302, 671], [318, 665], [335, 676], [351, 703], [364, 734], [356, 744], [334, 743], [313, 741], [300, 730], [301, 702]], '#b3242a');
  for (let i = 0; i < 18; i++) strk(rr(306, 352), rr(684, 738), rr(10, 24), Math.PI / 2 + rr(-0.6, 0.2), 2, pick(['#7b1418', '#d24a44', '#91191e']), 0.6);
  strk(305, 680, 18, 2.45, 5, '#a51f24');
  dab(290, 693, 3.5, 3, 0, '#e2c4a6');
  dab(307, 660, 8.5, 9, 0, '#e8cdb0');
  dab(311, 656, 8.5, 8, 0.4, '#efe9df');
  dab(302, 662, 1.4, 1.4, 0, '#3a2a22');
  g = realG;
  // --- two green frogs (lower right)
  const frog = (x, y, s, flip) => { // sitting frog in profile, facing left (or right if flipped)
    const sx = flip ? -1 : 1;
    g.save(); g.translate(x, y); g.scale(sx * s, s);
    dab(0, 16, 26, 5, 0, '#2c3f14', 0.45); // shadow
    const body = [[-22, -2], [-16, -12], [-4, -16], [10, -14], [20, -6], [23, 6], [14, 14], [-6, 14], [-18, 8]];
    poly(body.map(([px, py]) => [px * 1.08, py * 1.1 + 0.5]), '#1d3510');
    poly(body, '#5a8a2a');
    poly([[-18, 6], [-6, 12], [12, 12], [4, 4], [-10, 2]], '#b9c45c', 0.85); // pale belly
    dab(14, 6, 12, 8, -0.4, '#1d3510'); dab(14, 6, 10.5, 6.8, -0.4, '#4d7c22'); // folded hind leg
    strk(4, 13, 20, 0.05, 4.5, '#1d3510'); strk(4, 13, 19, 0.05, 2.8, '#4d7c22'); // hind foot
    strk(-12, 4, 12, 1.75, 4.5, '#1d3510'); strk(-12, 4, 11, 1.75, 2.8, '#5a8a2a'); // front leg
    for (const [px, py, pr] of [[-2, -8, 3.2], [8, -8, 2.6], [14, 0, 2.6], [0, 0, 2.2]]) dab(px, py, pr, pr * 0.8, 0, '#294f15', 0.9);
    dab(-12, -14, 6.5, 6, 0, '#1d3510'); dab(-12, -14, 5.3, 4.8, 0, '#5a8a2a');
    dab(-12, -14, 3.2, 3.2, 0, '#d0ae3e'); dab(-12.5, -14, 1.4, 2.6, 0, '#0d0d0d');
    strk(-23, 1, 8, 0.2, 1.4, '#1d3510', 0.8); // mouth line
    g.restore();
  };
  // 第二灾结尾光线抹掉青蛙：没有青蛙的版本只是跳过这两笔（frog() 不消耗随机数，其余笔触完全一样）
  if (frogs) {
    frog(848, 832, 1.25, false);
    frog(918, 822, 1.1, false);
  }
  // 第三灾起：天上的蚱蜢（左）和苍蝇（中间偏右），固定笔触、不消耗随机数
  if (insects) paintSkyInsects(g);

  // --- varnish: warm multiply, speckle, darker edges
  g.globalAlpha = 0.18; g.globalCompositeOperation = 'multiply';
  g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 9000; i++) { g.globalAlpha = rr(0.03, 0.09); g.fillStyle = r() < 0.5 ? '#000' : '#fff'; g.fillRect(rr(0, W), rr(0, H), 2, 2); }
  grd = g.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, H * 0.85);
  grd.addColorStop(0, 'rgba(30,22,12,0)'); grd.addColorStop(1, 'rgba(30,22,12,0.4)');
  g.globalAlpha = 1; g.fillStyle = grd; g.fillRect(0, 0, W, H);
  return c;
}

function makePlaguePainting(opts = {}) {
  const insects = !!(opts && opts.insects);   // 第三灾起：天上画出蚱蜢和苍蝇
  const { OW, OH, ORY, IW, IH, IRY, IY0, DEPTH, CW, CH } = PAINT;
  const root = new THREE.Group();
  root.name = 'plague_painting';

  // frame: extruded white arch slab with the multi-arch lines painted on its front
  const outer = archPts(OW, OH, ORY), inner = archPts(IW, IH, IRY, IY0);
  const frameGeo = prismGeometry([{ outline: outer, holes: [inner], corners: [new Set([0, 1]), new Set([0, 1])] }], DEPTH,
    { y0: 0, uLen: 1, bounds: { minX: -OW / 2, maxX: OW / 2, minZ: -OH, maxZ: 0 } });
  frameGeo.rotateX(Math.PI / 2);
  const frameSide = inkToon('#ffffff', { map: sideInkTex({ base: '#e8e5de', depth: DEPTH, uLen: 1, line: 0.0025, edges: 't' }) });
  const frame = new THREE.Mesh(frameGeo, [inkToon('#ffffff', { map: frameTexture() }), frameSide, frameSide]);
  frame.name = 'painting_frame';
  root.add(frame);

  // the canvas
  const canvas = document.createElement('canvas');
  canvas.width = CW; canvas.height = CH;
  const g = canvas.getContext('2d');
  const base = paintPlagueBase(CW, CH, { insects });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const picGeo = prismGeometry([{ outline: inner }], 0.001, { y0: 0, sides: false, bottom: false, bounds: { minX: -IW / 2, maxX: IW / 2, minZ: -(IY0 + IH), maxZ: -IY0 } });
  picGeo.rotateX(Math.PI / 2);
  const picture = new THREE.Mesh(picGeo, unlit('#ececec', { map: texture }));
  picture.name = 'painting_canvas';
  picture.position.z = 0.006;
  root.add(picture);

  const toLocal = (cx, cy) => [(cx / CW - 0.5) * IW, IY0 + (1 - cy / CH) * IH];
  const [cubeX, cubeY] = toLocal(CUBE_C[0], CUBE_C[1] - 8);
  const cubeProxy = proxy(new THREE.PlaneGeometry(0.05, 0.05), 'painting_cube');
  cubeProxy.position.set(cubeX, cubeY, 0.012);
  root.add(cubeProxy);
  const [fx0, fy0] = toLocal(FROG_BOX[0], FROG_BOX[3]), [fx1, fy1] = toLocal(FROG_BOX[2], FROG_BOX[1]);
  const frogProxy = proxy(new THREE.PlaneGeometry(fx1 - fx0, fy1 - fy0), 'painting_frogs');
  frogProxy.position.set((fx0 + fx1) / 2, (fy0 + fy1) / 2, 0.012);
  root.add(frogProxy);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), unlit('#fffbe8', {
    map: radialTex('paintGlow', [[0, 'rgba(255,255,245,1)'], [0.25, 'rgba(255,252,230,0.6)'], [1, 'rgba(255,250,220,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
  }));
  glow.name = 'painting_glow';
  glow.position.set(cubeX, cubeY, 0.009);
  glow.visible = false;
  root.add(glow);

  const st = { glow: 0, stream: 0, beam: 0, puff: 0, flash: 0, frame: 0, t: 0, lit: false, purified: false, framed: false,
    frogsGone: 0, frogBeam: 0, banished: false, frameW: 0, womanFramed: false,
    womanGone: 0, womanBeam: 0, womanBanished: false, frameF: 0, flyFramed: false };
  let baseNoFrogs = null, baseNoWoman = null;
  const streamPts = sampleCurve(STREAM, 240);

  const drawStream = () => {
    const r = rng(404);
    const n = streamPts.length;
    const p = st.stream;
    const mixC = (a, b, k) => `rgb(${Math.round(lerp(a[0], b[0], k))},${Math.round(lerp(a[1], b[1], k))},${Math.round(lerp(a[2], b[2], k))})`;
    const RED = [[92, 22, 16], [160, 34, 26], [206, 70, 52]], CLEAN = [[92, 88, 72], [138, 131, 112], [182, 176, 158]];
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < n; i++) {
        const s = i / (n - 1);
        const k = smooth(p - 0.06, p + 0.02, s); // 0 = purified, 1 = still red
        const c = mixC(CLEAN[pass], RED[pass], p >= 1 ? 0 : p <= 0 ? 1 : k);
        const [x, y] = streamPts[i];
        const w = 2.4 + s * 3.2 + Math.sin(i * 0.9) * 0.7 + r() * 0.8;
        const rad = pass === 0 ? w + 1.6 : pass === 1 ? w : w * 0.32;
        g.globalAlpha = pass === 2 ? 0.5 : pass === 0 ? 0.6 : 0.9;
        g.fillStyle = c;
        g.beginPath();
        g.ellipse(x + (r() - 0.5) * 2.5, y + (pass === 2 ? -w * 0.3 : (r() - 0.5) * 2), rad * 1.3, rad * 0.7, 0.15, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  };

  const drawCube = () => {
    const k = st.glow;
    const [cx, cy] = CUBE_C;
    // glow behind (warm yellow before, big white after)
    const rad = lerp(95, 175, k);
    const grd = g.createRadialGradient(cx, cy + 6, 8, cx, cy + 6, rad);
    grd.addColorStop(0, `rgba(255,${Math.round(lerp(236, 252, k))},${Math.round(lerp(150, 235, k))},${lerp(0.55, 0.95, k)})`);
    grd.addColorStop(0.45, `rgba(255,${Math.round(lerp(226, 248, k))},${Math.round(lerp(120, 220, k))},${lerp(0.22, 0.55, k)})`);
    grd.addColorStop(1, 'rgba(255,240,200,0)');
    g.globalAlpha = 1; g.fillStyle = grd; g.fillRect(cx - rad, cy + 6 - rad, rad * 2, rad * 2);
    const top = [[cx - 52, cy - 28], [cx - 2, cy - 45], [cx + 52, cy - 30], [cx + 2, cy - 13]];
    const col = (a, b) => { const v = Math.round(lerp(a, b, k)); return `rgb(${v},${v},${Math.round(lerp(a, b * 0.97, k))})`; };
    const face = (pts, c) => { g.fillStyle = c; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
    face([top[0], top[3], [cx + 2, cy + 52], [cx - 50, cy + 36]], col(22, 244));
    face([top[3], top[2], [cx + 50, cy + 34], [cx + 2, cy + 52]], col(12, 228));
    face(top, col(46, 255));
    if (k < 0.5) {
      g.strokeStyle = `rgba(0,0,0,${0.5 * (1 - k * 2)})`; g.lineWidth = 2;
      g.beginPath(); g.moveTo(top[3][0], top[3][1]); g.lineTo(cx + 2, cy + 52); g.stroke();
    }
  };

  // 白色描线方框：顶边 → 右边 → 底边 → 左边，k = 0..1 画了多少
  const drawFrameBox = ([x0, y0, x1, y1], k) => {
    const per = 2 * (x1 - x0 + y1 - y0);
    let left = k * per;
    const segs = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
    g.globalAlpha = 1; g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.lineCap = 'square';
    g.beginPath(); g.moveTo(x0, y0);
    for (const [ax, ay, bx, by] of segs) {
      const L = Math.hypot(bx - ax, by - ay);
      if (left <= 0) break;
      const f = Math.min(1, left / L);
      g.lineTo(lerp(ax, bx, f), lerp(ay, by, f));
      left -= L;
    }
    g.stroke();
    g.lineCap = 'round';
  };

  const compose = () => {
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.drawImage(base, 0, 0);
    if (st.frogsGone > 0) {
      if (!baseNoFrogs) baseNoFrogs = paintPlagueBase(CW, CH, { frogs: false, insects });
      const [x0, y0, x1, y1] = FROG_BOX;
      g.globalAlpha = Math.min(1, st.frogsGone);
      g.drawImage(baseNoFrogs, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
      g.globalAlpha = 1;
    }
    if (st.womanGone > 0) {
      // 第三灾结尾：女人和她身后的虫柱从画里消失（换成没有她的底图，椭圆羽化区域）
      if (!baseNoWoman) baseNoWoman = paintPlagueBase(CW, CH, { woman: false, insects });
      const [x0, y0, x1, y1] = WOMAN_AREA;
      g.save();
      g.globalAlpha = Math.min(1, st.womanGone);
      g.beginPath(); g.ellipse((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, 0, 0, Math.PI * 2); g.clip();
      g.drawImage(baseNoWoman, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
      g.restore();
    }
    drawStream();
    drawCube();
    const src = STREAM[0];
    if (st.beam > 0) {
      const [x0, y0] = [CUBE_C[0] + 4, CUBE_C[1] - 42];
      const x1 = lerp(x0, src[0] + 4, Math.min(1, st.beam * 1.6)), y1 = lerp(y0, src[1] + 4, Math.min(1, st.beam * 1.6));
      const a = Math.min(1, st.beam * 2) * (st.beam > 0.85 ? (1 - st.beam) / 0.15 : 1);
      g.globalAlpha = a * 0.5; g.strokeStyle = '#fff6dc'; g.lineWidth = 16; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.globalAlpha = a; g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    if (st.puff > 0 && st.puff < 1) {
      const k = st.puff, rad = 18 + k * 40;
      const grd = g.createRadialGradient(src[0] + 4, src[1] - 6, 2, src[0] + 4, src[1] - 6, rad);
      const a = Math.sin(k * Math.PI);
      grd.addColorStop(0, `rgba(240,240,236,${0.95 * a})`); grd.addColorStop(0.6, `rgba(210,210,206,${0.6 * a})`); grd.addColorStop(1, 'rgba(200,200,196,0)');
      g.globalAlpha = 1; g.fillStyle = grd; g.fillRect(src[0] + 4 - rad, src[1] - 6 - rad, rad * 2, rad * 2);
    }
    if (st.frogBeam > 0) {
      // 发光方块射向右下角两只青蛙的光线
      const [x0, y0] = [CUBE_C[0] + 30, CUBE_C[1] - 20];
      const tx = (FROG_BOX[0] + FROG_BOX[2]) / 2, ty = (FROG_BOX[1] + FROG_BOX[3]) / 2 + 20;
      const reach = Math.min(1, st.frogBeam * 1.8);
      const a = Math.min(1, st.frogBeam * 3) * (st.frogBeam > 0.8 ? (1 - st.frogBeam) / 0.2 : 1);
      const x1 = lerp(x0, tx, reach), y1 = lerp(y0, ty, reach);
      g.globalAlpha = a * 0.5; g.strokeStyle = '#fff6dc'; g.lineWidth = 16; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.globalAlpha = a; g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    if (st.womanBeam > 0) {
      // 发光方块射向红斗篷女人的光线
      const [x0, y0] = [CUBE_C[0] - 30, CUBE_C[1] - 26];
      const tx = (WOMAN_BOX[0] + WOMAN_BOX[2]) / 2, ty = (WOMAN_BOX[1] + WOMAN_BOX[3]) / 2;
      const reach = Math.min(1, st.womanBeam * 1.8);
      const a = Math.min(1, st.womanBeam * 3) * (st.womanBeam > 0.8 ? (1 - st.womanBeam) / 0.2 : 1);
      const x1 = lerp(x0, tx, reach), y1 = lerp(y0, ty, reach);
      g.globalAlpha = a * 0.5; g.strokeStyle = '#fff6dc'; g.lineWidth = 16; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.globalAlpha = a; g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    if (st.flash > 0) { g.globalAlpha = st.flash; g.fillStyle = '#fff1d0'; g.fillRect(0, 0, CW, CH); }
    if (st.frame > 0) {
      const [x0, y0, x1, y1] = FROG_BOX;
      const per = 2 * (x1 - x0 + y1 - y0);
      let left = st.frame * per;
      const segs = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
      g.globalAlpha = 1; g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.lineCap = 'square';
      g.beginPath(); g.moveTo(x0, y0);
      for (const [ax, ay, bx, by] of segs) {
        const L = Math.hypot(bx - ax, by - ay);
        if (left <= 0) break;
        const f = Math.min(1, left / L);
        g.lineTo(lerp(ax, bx, f), lerp(ay, by, f));
        left -= L;
      }
      g.stroke();
      g.lineCap = 'round';
    }
    if (st.frameW > 0) drawFrameBox(WOMAN_BOX, st.frameW);
    if (st.frameF > 0) drawFrameBox(FLY_BOX, st.frameF);
    g.globalAlpha = 1;
    texture.needsUpdate = true;
  };
  compose();

  root.glowCube = (o) => {
    if (st.lit) return done();
    st.lit = true;
    glow.visible = true;
    if (isInstant(o)) { st.glow = 1; compose(); return done(); }
    return animate(1500, (k) => { st.glow = k; st.flash = Math.sin(Math.min(1, k * 3) * Math.PI) * 0.25; compose(); }, Ease.inOutSine)
      .then(() => { st.flash = 0; compose(); });
  };
  root.purify = (o) => {
    if (st.purified) return done();
    st.purified = true;
    if (!st.lit) { st.lit = true; st.glow = 1; glow.visible = true; }
    if (isInstant(o)) { st.stream = 1; st.beam = 0; st.puff = 0; st.flash = 0; compose(); return done(); }
    // 0–380 warm flash · 380–900 beam shoots to the stream source · 900–4200 white puff, the stream
    // fades upstream → downstream to grey-brown water, the beam dies out
    return timeline(4200, (t) => {
      st.flash = t < 380 ? Math.sin((t / 380) * Math.PI) * 0.45 : 0;
      if (t < 900) st.beam = phase(t, 380, 520, Ease.outCubic) * 0.62;
      else {
        const k = (t - 900) / 3300;
        st.beam = lerp(0.62, 1, smooth(0.55, 1, k));
        st.puff = clamp01(k * 2.8);
        st.stream = smooth(0.12, 0.95, k);
      }
      compose();
    }).then(() => { st.flash = 0; st.beam = 0; st.puff = 0; st.stream = 1; compose(); });
  };
  root.frameFrogs = (o) => {
    if (st.framed) return done();
    st.framed = true;
    if (isInstant(o)) { st.frame = 1; compose(); return done(); }
    return animate(900, (k) => { st.frame = k; compose(); }, Ease.inOutSine);
  };

  // 第二灾：开局时溪流已经是干净的（第一灾净化过），方块还是黑的
  root.cleanStream = () => { st.purified = true; st.stream = 1; compose(); return done(); };
  // 第二灾结尾：发光方块射出光线，右下角两只青蛙从画里消失，只剩草
  root.banishFrogs = (o) => {
    if (st.banished) return done();
    st.banished = true;
    if (!st.lit) { st.lit = true; st.glow = 1; glow.visible = true; }
    if (isInstant(o)) { st.frogsGone = 1; st.frogBeam = 0; st.flash = 0; compose(); return done(); }
    return timeline(3200, (t) => {
      st.flash = t < 300 ? Math.sin((t / 300) * Math.PI) * 0.35 : 0;
      st.frogBeam = clamp01((t - 200) / 2800);
      st.frogsGone = smooth(0.35, 0.8, t / 3200);
      compose();
    }).then(() => { st.flash = 0; st.frogBeam = 0; st.frogsGone = 1; compose(); });
  };
  // 第二灾结尾：白框框住红斗篷女人（下一灾的预告）
  root.frameWoman = (o) => {
    if (st.womanFramed) return done();
    st.womanFramed = true;
    if (isInstant(o)) { st.frameW = 1; compose(); return done(); }
    return animate(1000, (k) => { st.frameW = k; compose(); }, Ease.inOutSine);
  };

  // 第三灾结尾：发光方块射出光线，红斗篷女人和她身后的黑色虫柱从画里消失（14:14–14:18）
  root.banishWoman = (o) => {
    if (st.womanBanished) return done();
    st.womanBanished = true;
    if (!st.lit) { st.lit = true; st.glow = 1; glow.visible = true; }
    if (isInstant(o)) { st.womanGone = 1; st.womanBeam = 0; st.flash = 0; compose(); return done(); }
    return timeline(3200, (t) => {
      st.flash = t < 300 ? Math.sin((t / 300) * Math.PI) * 0.35 : 0;
      st.womanBeam = clamp01((t - 200) / 2800);
      st.womanGone = smooth(0.35, 0.8, t / 3200);
      compose();
    }).then(() => { st.flash = 0; st.womanBeam = 0; st.womanGone = 1; compose(); });
  };
  // 第三灾结尾：白框框住天上的苍蝇（下一灾的预告，14:20）。需要 insects: true 才看得到苍蝇
  root.frameFly = (o) => {
    if (st.flyFramed) return done();
    st.flyFramed = true;
    if (isInstant(o)) { st.frameF = 1; compose(); return done(); }
    return animate(1000, (k) => { st.frameF = k; compose(); }, Ease.inOutSine);
  };
  /**
   * 瞬时恢复到某个状态（可以往回设，供章节 sync() 双向恢复）：
   * { lit, purified, frogsFramed, frogsGone, womanFramed, womanGone, flyFramed }，没给的字段保持不变。
   * 第三灾开局 = { lit: false, purified: true, frogsGone: true, womanFramed: false, womanGone: false, flyFramed: false }。
   */
  root.setState = (s = {}) => {
    const b = (k) => s[k] !== undefined;
    if (b('lit')) { st.lit = !!s.lit; st.glow = s.lit ? 1 : 0; glow.visible = !!s.lit; }
    if (b('purified')) { st.purified = !!s.purified; st.stream = s.purified ? 1 : 0; }
    if (b('frogsFramed')) { st.framed = !!s.frogsFramed; st.frame = s.frogsFramed ? 1 : 0; }
    if (b('frogsGone')) { st.banished = !!s.frogsGone; st.frogsGone = s.frogsGone ? 1 : 0; }
    if (b('womanFramed')) { st.womanFramed = !!s.womanFramed; st.frameW = s.womanFramed ? 1 : 0; }
    if (b('womanGone')) { st.womanBanished = !!s.womanGone; st.womanGone = s.womanGone ? 1 : 0; }
    if (b('flyFramed')) { st.flyFramed = !!s.flyFramed; st.frameF = s.flyFramed ? 1 : 0; }
    st.beam = 0; st.puff = 0; st.flash = 0; st.frogBeam = 0; st.womanBeam = 0;
    compose();
    return root.getState();
  };
  root.getState = () => ({ lit: st.lit, purified: st.purified, frogsFramed: st.framed, frogsGone: st.banished, womanFramed: st.womanFramed, womanGone: st.womanBanished, flyFramed: st.flyFramed });

  attachUpdate(root, picture, (dt) => {
    st.t += dt;
    if (glow.visible) {
      glow.material.opacity = st.glow * (0.7 + 0.18 * Math.sin(st.t * 2.4) + 0.06 * Math.sin(st.t * 6.1));
      glow.scale.setScalar(1 + 0.06 * Math.sin(st.t * 1.7));
    }
  });
  root.userData.state = st;
  return root;
}

// =============================================================================================

export const FACTORIES = {
  black_cube: makeBlackCube,
  coffin: makeCoffin,
  floating_cube: makeFloatingCube,
  blood_tendril: makeBloodTendril,
  font: makeFont,
  winged_holder: makeWingedHolder,
  plague_painting: makePlaguePainting,
};
