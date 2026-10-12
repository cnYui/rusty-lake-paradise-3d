// Characters for Plague I — stylised Rusty Lake cartoon people, the goat and the intro rowboat.
//
//   makeCharacter(id) → CharacterRig      ids: david margaret nicholas soul jakob
//                                              gerard_boar elizabeth_pheasant nicholas_deer david_rabbit margaret_pigeon
//                                              (+ 'rower', the small seated figure used by makeIntroBoat)
//   makeAnimal('goat') → CharacterRig
//   makeIntroBoat()    → { root, update(dt, t), row(bool) }
//
// Every rig: root Group (feet at y = 0, faces +Z), pivot Groups in `parts`, `headTop`, play(), update(),
// setMask(). Animations only use tween.js (animate / wait) so they follow engine.timeScale.
// Meshes are merged per rigid part & material to keep draw calls low (~15–30 per person).
// See docs/impl_characters.md for every method, named child and recommended camera pose.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { PALETTE, toon, unlit, canvasTexture, rng, shade, noOutline } from './materials.js';
import { animate, wait, Ease } from '../core/tween.js';

// Props are written in parallel; use them when they exist, otherwise fall back to our own models.
let makeProp = null;
try { ({ makeProp } = await import('./props.js')); } catch (e) { makeProp = null; }

const INK = '#141414';
const OUT = 0.0052;          // outline thickness for characters (screen-space, see OutlineEffect)
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);

// ===========================================================================
// Materials & textures
// ===========================================================================

/** Per-rig material cache (so per-rig opacity changes never leak into other rigs). */
function matSet() {
  const cache = new Map();
  const all = [];
  const get = (kind, color, opts = {}) => {
    const key = `${kind}|${color}|${opts.map ? opts.map.uuid : ''}|${opts.outline ?? ''}|${opts.side ?? ''}|${opts.transparent ? 1 : 0}|${opts.opacity ?? ''}|${opts.tag ?? ''}`;
    if (!cache.has(key)) {
      const { tag, ...o } = opts;
      const m = kind === 'toon' ? toon(color, { outline: OUT, ...o }) : unlit(color, o);
      cache.set(key, m); all.push(m);
    }
    return cache.get(key);
  };
  return { all, toon: (c, o) => get('toon', c, o), unlit: (c, o) => get('unlit', c, o) };
}

const texCache = new Map();
function cachedTex(key, make) {
  if (!texCache.has(key)) texCache.set(key, make());
  return texCache.get(key);
}

/** Cloth with hand-drawn folds: vertical ink creases + soft light/dark bands. */
function clothTex(base, { seed = 1, folds = 10, ink = 0.5, w = 256, h = 256, stripes = null, dots = null, plank = false } = {}) {
  return cachedTex(`cloth:${base}:${seed}:${folds}:${ink}:${stripes}:${dots}:${plank}`, () => canvasTexture(w, h, (g) => {
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // soft value bands
    for (let i = 0; i < folds; i++) {
      const x = r() * w, bw = 6 + r() * 22;
      g.fillStyle = r() < 0.5 ? shade(base, -0.05) : shade(base, 0.04);
      g.globalAlpha = 0.6;
      g.fillRect(x, 0, bw, h);
    }
    g.globalAlpha = 1;
    if (stripes) {
      g.fillStyle = stripes;
      for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 5, h);
    }
    if (plank) {
      for (let y = 0; y < h; y += h / 6) { g.fillStyle = 'rgba(30,25,20,0.55)'; g.fillRect(0, y, w, 2); }
    }
    // ink creases
    g.lineCap = 'round';
    for (let i = 0; i < folds; i++) {
      const x = r() * w, len = h * (0.25 + r() * 0.55), y0 = r() * (h - len);
      g.strokeStyle = `rgba(18,14,10,${ink * (0.45 + r() * 0.55)})`;
      g.lineWidth = 1.2 + r() * 1.8;
      g.beginPath(); g.moveTo(x, y0);
      g.bezierCurveTo(x + (r() - 0.5) * 18, y0 + len * 0.35, x + (r() - 0.5) * 18, y0 + len * 0.7, x + (r() - 0.5) * 14, y0 + len);
      g.stroke();
    }
    if (dots) {
      g.fillStyle = dots;
      for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(r() * w, r() * h, 1.5, 0, TAU); g.fill(); }
    }
  }));
}

/** Rings along u (used for leech segments and horn ridges). */
function ringTex(base, line, { n = 12, w = 256, h = 32, belly = null } = {}) {
  return cachedTex(`ring:${base}:${line}:${n}:${belly}`, () => canvasTexture(w, h, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    if (belly) { g.fillStyle = belly; g.fillRect(0, h * 0.6, w, h * 0.4); }
    g.fillStyle = line;
    for (let i = 0; i < n; i++) g.fillRect((i + 0.5) * (w / n), 0, Math.max(2, w / n * 0.18), h);
  }));
}

/** Strand texture for hair caps. */
function hairTex(base, line, seed = 3, part = null) {
  return cachedTex(`hair:${base}:${line}:${seed}:${part}`, () => canvasTexture(256, 256, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = r() * w;
      g.strokeStyle = r() < 0.5 ? line : shade(base, 0.12);
      g.globalAlpha = 0.5 + r() * 0.5; g.lineWidth = 1 + r() * 2;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 30, h * 0.3, x + (r() - 0.5) * 30, h * 0.7, x + (r() - 0.5) * 20, h); g.stroke();
    }
    g.globalAlpha = 1;
    if (part !== null) { g.strokeStyle = line; g.lineWidth = 3; g.beginPath(); g.moveTo(part * w, h * 0.35); g.lineTo(part * w, h); g.stroke(); }
  }));
}

// ===========================================================================
// Geometry helpers
// ===========================================================================

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Transform a geometry in place: position, Euler rotation, scale. Returns it. */
function place(geo, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  _m4.compose(_p.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s.set(scl[0], scl[1], scl[2]));
  return geo.applyMatrix4(_m4);
}

/** Make a geometry mergeable: position/normal/uv only, non-indexed. */
function prep(geo) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
  geo.morphAttributes = {};
  geo.clearGroups();
  return geo.index ? geo.toNonIndexed() : geo;
}

const sphere = (rx, ry = rx, rz = rx, ws = 18, hs = 12) => new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz);
const lathe = (pts, seg = 18, phiStart = 0, phiLen = TAU) =>
  new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg, phiStart, phiLen);

/** Tapered capsule hanging from y = 0 down to y = -len (rounded ends). */
function limbGeo(rTop, rBot, len, seg = 12) {
  const pts = [];
  const n = 4;
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * (Math.PI / 2); pts.push([Math.cos(a) * rBot, -len + Math.sin(a) * rBot]); }
  for (let i = 1; i <= n; i++) { const a = (i / n) * (Math.PI / 2); pts.push([Math.cos(a) * rTop, Math.sin(a) * rTop]); }
  return lathe(pts, seg);
}

/** Tube along points with radius tapering r0 → r1. */
function taperTube(points, r0, r1, seg = 24, radial = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : V(p[0], p[1], p[2]))));
  const geo = new THREE.TubeGeometry(curve, seg, 1, radial, closed);
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  const pt = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const k = i / seg;
    curve.getPointAt(k, pt);
    const r = lerp(r0, r1, k);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      pos.setXYZ(idx, pt.x + nrm.getX(idx) * r, pt.y + nrm.getY(idx) * r, pt.z + nrm.getZ(idx) * r);
    }
  }
  pos.needsUpdate = true;
  // cap the thick end with a small sphere so it reads as solid
  return geo;
}

/** Collects geometry per (joint, material, tag) and merges at the end. */
class PartSet {
  constructor() { this.map = new Map(); }
  add(joint, geo, mat, tag = 'main') {
    const key = joint.uuid + '|' + mat.uuid + '|' + tag;
    let e = this.map.get(key);
    if (!e) this.map.set(key, (e = { joint, mat, tag, geos: [] }));
    e.geos.push(prep(geo));
    return this;
  }
  build(rig) {
    for (const { joint, mat, tag, geos } of this.map.values()) {
      const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = !mat.transparent;
      mesh.name = `${rig.id}:${tag}`;
      joint.add(mesh);
      (rig.tags[tag] ||= []).push(mesh);
    }
    this.map.clear();
  }
}

// ===========================================================================
// Head: deformed sphere skull + face decal (canvas) + 3D nose and ears
// ===========================================================================

function headDeform({ rx, ry, rz, jaw = 0.25, chin = 0, crown = 0.1, flat = 0.15, cheek = 0 }) {
  return (v) => {
    let { x, y, z } = v;
    if (y < 0) {
      const k = Math.pow(-y, 1.5);
      x *= 1 - jaw * k + cheek * Math.sin(Math.PI * clamp(-y, 0, 1)) * 0.5;
      if (z < 0) z *= 1 - jaw * 0.8 * k;
    }
    if (z > 0) {
      z *= 1 - flat * (1 - y * y);
      if (y < -0.45) z += chin * (-y - 0.45) * z;
    } else z *= 1 + crown * Math.max(0, 1 - Math.abs(y + 0.1));
    v.set(x * rx, y * ry, z * rz);
  };
}

function skullGeo(def, ws = 36, hs = 28) {
  let g = new THREE.SphereGeometry(1, ws, hs);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const pos = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); def(v); pos.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  return g;
}

/** Front part of the deformed head with planar UVs covering [-rx,rx]×[-ry,ry]. */
function decalGeo(def, rx, ry, inflate = 1.008, phiHalf = 1.3) {
  const g = new THREE.SphereGeometry(inflate, 40, 34, Math.PI / 2 - phiHalf, phiHalf * 2, 0.06 * Math.PI, 0.93 * Math.PI);
  const pos = g.attributes.position, uv = g.attributes.uv, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i); def(v); pos.setXYZ(i, v.x, v.y, v.z);
    uv.setXY(i, v.x / (2 * rx) + 0.5, v.y / (2 * ry) + 0.5);
  }
  g.computeVertexNormals();
  return g;
}

/** Point on the (approximate) front surface of the deformed head for normalised face coords. */
function headSurface(def, fx, fy, out = new THREE.Vector3()) {
  const z = Math.sqrt(Math.max(0.0001, 1 - fx * fx - fy * fy));
  out.set(fx, fy, z); def(out); return out;
}

// --- face painting (canvas coords for normalised face coords fx, fy ∈ [-1, 1]) ----------
const FS = 512;
const FX = (fx) => (fx * 0.5 + 0.5) * FS;
const FY = (fy) => (0.5 - fy * 0.5) * FS;
function pen(g, w, color = INK) { g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; }
function path(g, pts) {
  const P = pts.map(([x, y]) => [FX(x), FY(y)]);
  g.beginPath(); g.moveTo(P[0][0], P[0][1]);
  if (P.length === 2) { g.lineTo(P[1][0], P[1][1]); return; }
  for (let i = 1; i < P.length - 1; i++) {
    const last = i === P.length - 2;
    const nx = last ? P[i + 1][0] : (P[i][0] + P[i + 1][0]) / 2, ny = last ? P[i + 1][1] : (P[i][1] + P[i + 1][1]) / 2;
    g.quadraticCurveTo(P[i][0], P[i][1], nx, ny);
  }
}
function line(g, pts, w = 5, color = INK) { pen(g, w, color); path(g, pts); g.stroke(); }
function blob(g, pts, color) { path(g, pts); g.closePath(); g.fillStyle = color; g.fill(); }

/**
 * Heavy-lidded cartoon eye. x,y centre; w,h half-size (face units); side = -1 viewer-left eye, +1 right.
 * o: { lid 0..1 (how much the upper lid covers), droop, pupil, look:[dx,dy], skin, lw, closed, squeeze,
 *      bag: { depth, color, lines }, crease }
 */
function eye(g, x, y, w, h, side, o = {}) {
  const lw = o.lw ?? 5;
  const droop = o.droop ?? 0.2;
  const inner = [x - side * w, y + h * 0.05], outer = [x + side * w, y - h * droop];
  if (o.closed || o.squeeze) {
    const sq = o.squeeze ? 0.35 : 0;
    line(g, [inner, [x, y - h * (0.35 + sq)], outer], lw * 1.3);
    if (o.squeeze) { line(g, [[x - side * w * 0.6, y + h * 0.9], [x + side * w * 0.6, y + h * 0.6]], lw * 0.6); line(g, [[outer[0], outer[1]], [outer[0] + side * w * 0.3, outer[1] + h * 0.6]], lw * 0.6); }
    else line(g, [[x - side * w * 0.5, y - h * 0.75], [x, y - h * 0.95], [x + side * w * 0.5, y - h * 0.8]], lw * 0.5, 'rgba(20,20,20,0.6)');
  } else {
    const top = y + h * 1.0, bot = y - h * 0.85;
    // white
    g.save();
    path(g, [inner, [x, top], outer]);
    const Q = [[x, bot], inner].map(([a, b]) => [FX(a), FY(b)]);
    g.quadraticCurveTo(Q[0][0], Q[0][1], Q[1][0], Q[1][1]);
    g.closePath();
    g.fillStyle = o.white || '#f1eee6'; g.fill();
    g.clip();
    // pupil
    const look = o.look || [0, 0];
    g.fillStyle = INK; g.beginPath();
    g.arc(FX(x + look[0] * w), FY(y - h * 0.15 + look[1] * h), (o.pupil ?? 0.55) * h * FS * 0.5, 0, TAU); g.fill();
    // upper lid (skin) covering the top part
    const lid = o.lid ?? 0.5;
    const ly = lerp(top, bot, lid);
    g.fillStyle = o.skin || '#ddd';
    path(g, [[inner[0] - side * w * 0.2, ly + h * 0.1], [x, ly + h * 0.2], [outer[0] + side * w * 0.2, ly - h * 0.05]]);
    g.lineTo(FX(outer[0] + side * w * 0.3), FY(top + h * 2)); g.lineTo(FX(inner[0] - side * w * 0.3), FY(top + h * 2)); g.closePath(); g.fill();
    g.restore();
    // heavy lid line
    line(g, [inner, [x, ly + h * 0.2], outer], lw * 1.35);
    // lower lid (thin)
    line(g, [[inner[0] + side * w * 0.15, inner[1] - h * 0.15], [x, bot], [outer[0], outer[1] - h * 0.1]], lw * 0.55, 'rgba(20,20,20,0.75)');
    // lid crease above
    if (o.crease !== false) line(g, [[x - side * w * 0.7, y + h * 1.35], [x, y + h * 1.65], [x + side * w * 0.85, y + h * 1.1]], lw * 0.5, 'rgba(20,20,20,0.7)');
  }
  // under-eye bags
  const bag = o.bag;
  if (bag) {
    const d = bag.depth ?? 1.4;
    if (bag.color) blob(g, [[x - side * w * 0.9, y - h * 0.6], [x, y - h * (0.6 + d * 1.6)], [x + side * w * 0.95, y - h * 0.7], [x, y - h * 1.0]], bag.color);
    for (let i = 0; i < (bag.lines ?? 1); i++) {
      const yy = y - h * (1.1 + i * 0.7) * d * 0.8;
      line(g, [[x - side * w * (0.6 - i * 0.1), yy + h * 0.2], [x, yy - h * 0.5], [x + side * w * (0.75 - i * 0.1), yy + h * 0.25]], lw * 0.55, 'rgba(25,20,25,0.75)');
    }
  }
}

/** Builds a face texture set lazily: painter(g, variant) draws on a transparent 512² canvas. */
function faceSet(painter, size = FS) {
  const cache = {};
  return (variant) => {
    if (!cache[variant]) cache[variant] = canvasTexture(size, size, (g) => {
      if (size !== FS) g.scale(size / FS, size / FS);
      painter(g, variant);
    }, { wrap: false });
    return cache[variant];
  };
}

// ===========================================================================
// Rig core: joints, pose dictionary, tweening, idle, masks, IK
// ===========================================================================

const _ikU = V(), _ikW = V(), _ikE = V(), _ikDU = V(), _ikDF = V(), _ikX = V(), _ikY = V(), _ikZ = V();
const _ikM = new THREE.Matrix4(), _ikEu = new THREE.Euler();

/** Analytic two-bone IK in the parent frame of the upper joint. Writes Euler arrays. */
function ikTwoBone(S, T, a, b, pole, outUpper, outLower) {
  _ikU.subVectors(T, S);
  const d = clamp(_ikU.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  _ikU.normalize();
  const alpha = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  _ikW.copy(pole).addScaledVector(_ikU, -pole.dot(_ikU));
  if (_ikW.lengthSq() < 1e-8) _ikW.set(0, 0, -1);
  _ikW.normalize();
  _ikDU.copy(_ikU).multiplyScalar(Math.cos(alpha)).addScaledVector(_ikW, Math.sin(alpha));
  _ikE.copy(S).addScaledVector(_ikDU, a);
  _ikDF.copy(S).addScaledVector(_ikU, d).sub(_ikE).normalize();
  _ikY.copy(_ikDU).negate();
  _ikZ.copy(_ikDF).addScaledVector(_ikDU, -_ikDF.dot(_ikDU));
  if (_ikZ.lengthSq() < 1e-8) _ikZ.copy(_ikW).negate();
  _ikZ.normalize();
  _ikX.crossVectors(_ikY, _ikZ);
  _ikM.makeBasis(_ikX, _ikY, _ikZ);
  _ikEu.setFromRotationMatrix(_ikM, 'XYZ');
  outUpper[0] = _ikEu.x; outUpper[1] = _ikEu.y; outUpper[2] = _ikEu.z;
  outLower[0] = -Math.acos(clamp(_ikDU.dot(_ikDF), -1, 1)); outLower[1] = 0; outLower[2] = 0;
}

const _rm = new THREE.Matrix4(), _rm2 = new THREE.Matrix4(), _rv = V(), _rv2 = V(), _rq = new THREE.Quaternion(), _rq2 = new THREE.Quaternion();
const _UP = V(0, 1, 0);

function createRig(id) {
  const root = new THREE.Group();
  root.name = id;
  const rig = {
    id, root, parts: {}, joints: {}, pose: {}, idle: {}, tags: {}, dims: {},
    mats: matSet(), anim: 'idle', headTop: null, face: null, masks: {}, mask: null,
    _after: [], _upd: [], _idleFn: null, _t: 0,
  };
  rig.ps = new PartSet();

  rig.addJoint = (name, parent, pos = [0, 0, 0], objName = null) => {
    const g = new THREE.Group();
    g.name = objName || `${id}_${name}`;
    g.position.set(pos[0], pos[1], pos[2]);
    g.userData.base = g.position.clone();
    (typeof parent === 'string' ? rig.joints[parent] : parent).add(g);
    rig.joints[name] = g;
    rig.pose[name] = [0, 0, 0];
    rig.idle[name] = [0, 0, 0];
    return g;
  };

  rig.apply = (noIdle = false, noHooks = false) => {
    for (const k in rig.joints) {
      const j = rig.joints[k], p = rig.pose[k], o = noIdle ? null : rig.idle[k], b = j.userData.base, pp = rig.pose[k + '.p'];
      j.rotation.set(p[0] + (o ? o[0] : 0), p[1] + (o ? o[1] : 0), p[2] + (o ? o[2] : 0));
      if (pp) j.position.set(b.x + pp[0], b.y + pp[1], b.z + pp[2]);
    }
    if (!noHooks) for (const fn of rig._after) fn();
  };

  rig.setPose = (p) => {
    for (const k in p) rig.pose[k] = p[k].slice();
    rig.apply();
  };

  /** Tween pose entries to target values. Returns a Promise. */
  rig.tweenPose = (target, ms = 800, ease = Ease.inOutSine, instant = false) => {
    const keys = Object.keys(target);
    for (const k of keys) if (!rig.pose[k]) rig.pose[k] = [0, 0, 0];
    if (instant || ms <= 0) { rig.setPose(target); return Promise.resolve(); }
    const from = keys.map((k) => rig.pose[k].slice());
    return animate(ms, (e) => {
      for (let i = 0; i < keys.length; i++) {
        const a = from[i], b = target[keys[i]], p = rig.pose[keys[i]];
        p[0] = a[0] + (b[0] - a[0]) * e; p[1] = a[1] + (b[1] - a[1]) * e; p[2] = a[2] + (b[2] - a[2]) * e;
      }
      rig.apply();
    }, ease);
  };

  /** Position of a joint's parent-space point helpers. */
  rig.rootToJointParent = (jointName, vRoot, out) => {
    const j = rig.joints[jointName];
    root.updateMatrixWorld(true);
    _rm.copy(j.parent.matrixWorld).invert().multiply(root.matrixWorld);
    return out.copy(vRoot).applyMatrix4(_rm);
  };
  rig.jointToRoot = (obj, vLocal, out) => {
    root.updateMatrixWorld(true);
    _rm.copy(root.matrixWorld).invert().multiply(obj.matrixWorld);
    return out.copy(vLocal).applyMatrix4(_rm);
  };

  /** IK an arm (side 'L'|'R') so the wrist reaches a root-space point; writes into `out` pose dict. */
  const _ikT = V(), _ikP = V();
  rig.ikArm = (side, target, pole, out = rig.pose) => {
    const arm = rig.joints['arm' + side];
    rig.rootToJointParent('arm' + side, target, _ikT);
    _ikP.set(pole[0], pole[1], pole[2]);
    out['arm' + side] ||= [0, 0, 0]; out['elbow' + side] ||= [0, 0, 0];
    ikTwoBone(arm.userData.base, _ikT, rig.dims.upper, rig.dims.fore, _ikP, out['arm' + side], out['elbow' + side]);
    return out;
  };

  /** Solve a static pose: apply `partial`, IK the given hands, restore, return the full target dict. */
  rig.solve = (partial = {}, hands = {}) => {
    const saved = {};
    for (const k in rig.pose) saved[k] = rig.pose[k].slice();
    for (const k in partial) rig.pose[k] = partial[k].slice();
    rig.apply(true, true);
    const out = {};
    for (const k in partial) out[k] = partial[k].slice();
    for (const side of Object.keys(hands)) {
      const h = hands[side];
      rig.ikArm(side, V(h.pos[0], h.pos[1], h.pos[2]), h.pole || [side === 'L' ? 1 : -1, -0.4, -1], out);
      if (h.hand) out['hand' + side] = h.hand.slice();
      if (h.aim) {
        // orient the hand in root space: fingers along aim.fingers, palm facing aim.palm
        rig.pose['arm' + side] = out['arm' + side].slice();
        rig.pose['elbow' + side] = out['elbow' + side].slice();
        rig.pose['hand' + side] = [0, 0, 0];
        rig.apply(true, true);
        out['hand' + side] = rig.handRotFor(side, h.aim.fingers, h.aim.palm);
      }
    }
    for (const k in saved) rig.pose[k] = saved[k];
    rig.apply(true, true);
    return out;
  };

  /** Local Euler for hand joint so that (in root space) fingers point along `fingers` and the palm faces `palm`. */
  rig.handRotFor = (side, fingers, palm) => {
    const s = side === 'L' ? 1 : -1;
    const yA = V(-fingers[0], -fingers[1], -fingers[2]).normalize();
    const xA = V(-s * palm[0], -s * palm[1], -s * palm[2]);
    xA.addScaledVector(yA, -xA.dot(yA)).normalize();
    const zA = V().crossVectors(xA, yA);
    const qWant = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, zA));
    root.updateMatrixWorld(true);
    const m = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(rig.joints['elbow' + side].matrixWorld);
    const qE = new THREE.Quaternion(); m.decompose(V(), qE, V());
    const qL = qE.invert().multiply(qWant);
    const e = new THREE.Euler().setFromQuaternion(qL, 'XYZ');
    return [e.x, e.y, e.z];
  };

  rig.play = (anim = 'idle') => { rig.anim = anim; if (anim !== 'talk' && rig.face) rig.face.mouth = false; };

  rig.showTag = (tag, visible) => { for (const m of rig.tags[tag] || []) m.visible = visible; };

  rig.update = (dt = 0, t = 0) => {
    rig._t = t;
    const f = rig.face;
    if (f) {
      // blinking
      f.timer -= dt;
      if (f.timer <= 0) {
        if (f.blink) { f.blink = false; f.timer = 2.2 + Math.random() * 3.5; }
        else { f.blink = true; f.timer = 0.13; }
      }
      // talking: flap the mouth
      if (rig.anim === 'talk') {
        f.talkT -= dt;
        if (f.talkT <= 0) { f.mouth = !f.mouth; f.talkT = f.mouth ? 0.09 + Math.random() * 0.12 : 0.06 + Math.random() * 0.1; }
      }
      rig.refreshFace();
    }
    for (const k in rig.idle) { const o = rig.idle[k]; o[0] = o[1] = o[2] = 0; }
    if (rig.anim !== 'none' && rig._idleFn) rig._idleFn(t, rig.idle, dt);
    for (const fn of rig._upd) fn(dt, t);
    rig.apply();
  };

  rig.refreshFace = () => {
    const f = rig.face;
    if (!f || !f.mesh) return;
    let key = f.expr;
    if (f.expr === 'neutral') {
      if (f.blink && rig.anim !== 'none') key = 'blink';
      else if (rig.anim === 'talk' && f.mouth) key = 'talk';
    }
    if (f.cur !== key) { f.cur = key; f.mesh.material.map = f.tex(key); f.mesh.material.needsUpdate = true; }
  };

  rig.setExpression = (expr = 'neutral') => { if (rig.face) { rig.face.expr = expr; rig.refreshFace(); } return Promise.resolve(); };

  rig.setMask = (maskId = null) => {
    if (rig.mask === maskId) return;
    if (rig.mask && rig.masks[rig.mask]) rig.masks[rig.mask].visible = false;
    rig.mask = maskId || null;
    const hidden = !!rig.mask;
    for (const t of rig.headTags || ['head', 'face', 'hair', 'hat']) rig.showTag(t, !hidden);
    if (rig.face?.mesh) rig.face.mesh.visible = !hidden;
    if (rig.mask) {
      if (!rig.masks[rig.mask]) {
        const m = buildMask(rig.mask, rig);
        rig.masks[rig.mask] = m;
        rig.parts.head.add(m);
      }
      rig.masks[rig.mask].visible = true;
    }
  };

  /** Fade every material (used for the font reflection). */
  rig.setOpacity = (a = 1) => {
    root.traverse((o) => {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.userData.baseOpacity === undefined) { m.userData.baseOpacity = m.opacity; m.userData.baseTransparent = m.transparent; }
        m.opacity = m.userData.baseOpacity * a;
        m.transparent = a < 1 || m.userData.baseTransparent;
        m.depthWrite = a >= 1;
        if (m.userData.outlineParameters) m.userData.outlineParameters.alpha = a;
        m.needsUpdate = true;
      }
    });
  };

  return rig;
}

/** Standard human skeleton. D: dims in metres (see buildHuman). */
function skeleton(rig, D) {
  const id = rig.id;
  rig.dims = D;
  const body = rig.addJoint('body', rig.root, [0, D.hipY, 0], `${id}_body`);
  const torso = rig.addJoint('torso', body, [0, D.waist, 0]);
  const neck = rig.addJoint('neck', torso, [0, D.neckY, D.neckZ || 0]);
  const head = rig.addJoint('head', neck, [0, D.headY, D.headZ ?? 0.01]);
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    const arm = rig.addJoint('arm' + side, torso, [s * D.shoulderX, D.shoulderY, D.shoulderZ || 0]);
    const elbow = rig.addJoint('elbow' + side, arm, [0, -D.upper, 0]);
    rig.addJoint('hand' + side, elbow, [0, -D.fore, 0]);
    const leg = rig.addJoint('leg' + side, body, [s * D.hipX, 0, 0]);
    const knee = rig.addJoint('knee' + side, leg, [0, -D.thigh, 0]);
    rig.addJoint('foot' + side, knee, [0, -D.shin, 0]);
  }
  const J = rig.joints;
  rig.parts = {
    head: J.head, torso: J.torso, armL: J.armL, armR: J.armR, handL: J.handL, handR: J.handR, legL: J.legL, legR: J.legR,
    body: J.body, neck: J.neck, elbowL: J.elbowL, elbowR: J.elbowR, kneeL: J.kneeL, kneeR: J.kneeR, footL: J.footL, footR: J.footR,
  };
  const top = new THREE.Object3D();
  top.name = `${id}_headTop`;
  top.position.set(0, D.headR[1] + (D.hatH || 0) + 0.12, 0);
  head.add(top);
  rig.headTop = top;
  return rig;
}

// ===========================================================================
// Human body pieces
// ===========================================================================

/** Head with deformed skull, ears, 3D nose and painted face decal. */
function addHead(rig, spec) {
  const { rx, ry, rz } = spec;
  const def = headDeform(spec);
  rig.headDef = def;
  rig.headSpec = spec;
  const J = rig.joints;
  const skin = rig.mats.toon(spec.skin);
  rig.skinMat = skin;
  rig.ps.add(J.head, skullGeo(def), skin, 'head');
  // ears
  if (spec.ears !== false) {
    const ey = spec.earY ?? -0.05;
    for (const s of [-1, 1]) {
      const p = V(s * 0.97, ey, 0); def(p);
      rig.ps.add(J.head, place(sphere(0.016 * (spec.earS || 1), 0.034 * (spec.earS || 1), 0.026 * (spec.earS || 1), 12, 8), [p.x + s * 0.008, p.y, p.z - 0.005], [0, s * 0.35, s * 0.1]), skin, 'head');
    }
  }
  // nose
  const n = spec.nose || {};
  const base = headSurface(def, 0, n.top ?? 0.05);
  const tip = headSurface(def, 0, n.y ?? -0.28);
  const len = n.len ?? 0.035, w = n.w ?? 0.014;
  const tipPos = V(0, tip.y + (n.drop ?? 0), tip.z + len);
  rig.ps.add(J.head, taperTube([[0, base.y, base.z - 0.012], [0, lerp(base.y, tipPos.y, 0.55), lerp(base.z, tipPos.z, 0.6) + 0.004], [0, tipPos.y + w * 0.4, tipPos.z - w * 0.6]], w * 0.55, w * 0.9, 10, 8), skin, 'head');
  rig.ps.add(J.head, place(sphere(w * (n.tip ?? 1.15), w * (n.tip ?? 1.15) * 0.95, w * (n.tip ?? 1.15), 14, 10), [0, tipPos.y, tipPos.z - w * 0.5]), skin, 'head');
  if ((n.wing ?? 1) > 0) for (const s of [-1, 1]) rig.ps.add(J.head, place(sphere(w * 0.75 * (n.wing ?? 1), w * 0.6, w * 0.7, 10, 8), [s * w * 0.95 * (n.wing ?? 1), tipPos.y - w * 0.25, tipPos.z - w * 1.3]), skin, 'head');
  rig.noseTip = tipPos;
  // face decal
  const S = spec.faceSize || FS;
  const tex = faceSet((g, variant) => spec.paint(g, variant), S);
  const dmat = new THREE.MeshToonMaterial({
    map: tex('neutral'), transparent: true, gradientMap: skin.gradientMap, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  dmat.userData.outlineParameters = { visible: false };
  rig.mats.all.push(dmat);
  const decal = new THREE.Mesh(decalGeo(def, rx, ry), dmat);
  decal.name = `${rig.id}_face`;
  decal.renderOrder = 1;
  J.head.add(decal);
  rig.face = { mesh: decal, tex, expr: 'neutral', cur: 'neutral', blink: false, timer: 1.5 + Math.random() * 2, mouth: false, talkT: 0 };
  // neck
  rig.ps.add(J.neck, place(limbGeo(spec.neckR || 0.042, (spec.neckR || 0.042) * 1.1, J.head.position.y + 0.02, 12), [0, J.head.position.y, -0.005]), skin, 'neck');
  return def;
}

/** Cartoon hand. side +1 = left (+X), -1 = right. pose: relax | grip | point | flat | pinch | fist. */
function handGeo(side, pose = 'relax', sz = 1) {
  const s = side;
  const geos = [];
  const k = sz;
  const curls = {
    relax: [[0.35, 0.45], [0.45, 0.5], [0.5, 0.55], [0.55, 0.6]],
    grip: [[1.45, 1.5], [1.5, 1.55], [1.55, 1.55], [1.55, 1.5]],
    fist: [[1.6, 1.7], [1.6, 1.7], [1.6, 1.7], [1.6, 1.7]],
    point: [[0.05, 0.05], [1.5, 1.6], [1.55, 1.6], [1.55, 1.55]],
    flat: [[0.08, 0.05], [0.08, 0.05], [0.1, 0.06], [0.12, 0.08]],
    pinch: [[0.75, 0.55], [1.2, 1.2], [1.35, 1.3], [1.4, 1.3]],
    pray: [[0.05, 0.05], [0.05, 0.05], [0.07, 0.05], [0.1, 0.05]],
  }[pose] || [[0.35, 0.45], [0.45, 0.5], [0.5, 0.55], [0.55, 0.6]];
  // palm
  geos.push(place(sphere(0.017 * k, 0.044 * k, 0.037 * k, 14, 10), [0, -0.045 * k, 0]));
  const lens = [[0.03, 0.026], [0.033, 0.028], [0.031, 0.026], [0.025, 0.021]];
  for (let i = 0; i < 4; i++) {
    const z = (0.026 - i * 0.0168) * k;
    const [c1, c2] = curls[i];
    const [l1, l2] = lens[i];
    const r = 0.0082 * k * (i === 3 ? 0.88 : 1);
    const a1 = -s * c1, a2 = -s * (c1 + c2);
    const g1 = place(new THREE.CapsuleGeometry(r, l1 * k, 3, 8), [0, -l1 * k / 2, 0]);
    place(g1, [0, -0.08 * k, z], [0, 0, a1]);
    const ex = Math.sin(a1) * l1 * k * -1, ey = -Math.cos(a1) * l1 * k;
    const g2 = place(new THREE.CapsuleGeometry(r * 0.92, l2 * k, 3, 8), [0, -l2 * k / 2, 0]);
    place(g2, [ex, -0.08 * k + ey, z], [0, 0, a2]);
    geos.push(g1, g2);
  }
  // thumb
  const tc = pose === 'grip' || pose === 'fist' ? 0.9 : pose === 'pinch' ? 0.75 : pose === 'pray' || pose === 'flat' ? 0.15 : 0.35;
  const t1 = place(new THREE.CapsuleGeometry(0.0095 * k, 0.026 * k, 3, 8), [0, -0.013 * k, 0]);
  place(t1, [-s * 0.006 * k, -0.03 * k, 0.03 * k], [-0.75, 0, -s * tc]);
  const t2 = place(new THREE.CapsuleGeometry(0.0088 * k, 0.022 * k, 3, 8), [0, -0.011 * k, 0]);
  place(t2, [-s * (0.006 + 0.022 * Math.sin(tc)) * k, -0.05 * k, 0.047 * k], [-0.5, 0, -s * (tc + 0.4)]);
  geos.push(t1, t2);
  return mergeGeometries(geos.map(prep), false);
}

/** Adds hands (multiple pose variants, toggled with rig.setHand). */
function addHands(rig, skinMat, sz = 1, poses = ['relax']) {
  rig.handMeshes = { L: {}, R: {} };
  rig.handPose = { L: null, R: null };
  rig.setHand = (side, pose) => {
    const set = rig.handMeshes[side];
    if (!set[pose]) {
      const mesh = new THREE.Mesh(handGeo(side === 'L' ? 1 : -1, pose, sz), skinMat);
      mesh.castShadow = true;
      mesh.name = `${rig.id}_hand${side}_${pose}`;
      rig.joints['hand' + side].add(mesh);
      set[pose] = mesh;
    }
    for (const k in set) set[k].visible = k === pose;
    rig.handPose[side] = pose;
  };
  rig.hideHand = (side, hidden = true) => { for (const k in rig.handMeshes[side]) rig.handMeshes[side][k].visible = !hidden && k === rig.handPose[side]; };
  for (const p of poses) { rig.setHand('L', p); rig.setHand('R', p); }
  rig.setHand('L', poses[0]); rig.setHand('R', poses[0]);
}

/** Arms: upper sleeve, forearm (skin or sleeve), optional rolled cuff. */
function addArms(rig, o) {
  const J = rig.joints, D = rig.dims;
  for (const side of ['L', 'R']) {
    rig.ps.add(J['arm' + side], limbGeo(o.upper[0], o.upper[1], D.upper, 14), o.upperMat, 'arm');
    rig.ps.add(J['elbow' + side], limbGeo(o.fore[0], o.fore[1], D.fore - 0.01, 12), o.foreMat, 'arm');
    if (o.cuffMat) {
      rig.ps.add(J['elbow' + side], place(new THREE.TorusGeometry(o.fore[0] * 1.25, o.cuffR || 0.014, 8, 16), [0, o.cuffY ?? -0.01, 0], [Math.PI / 2, 0, 0]), o.cuffMat, 'arm');
    }
    if (o.wristMat) {
      rig.ps.add(J['elbow' + side], place(new THREE.CylinderGeometry(o.fore[1] * 1.25, o.fore[1] * 1.2, 0.05, 14), [0, -D.fore + 0.035, 0]), o.wristMat, 'arm');
    }
  }
}

/** Legs: thigh, shin (+ boot) and foot. */
function addLegs(rig, o) {
  const J = rig.joints, D = rig.dims;
  for (const side of ['L', 'R']) {
    rig.ps.add(J['leg' + side], limbGeo(o.thigh[0], o.thigh[1], D.thigh, 14), o.thighMat, 'leg');
    if (o.bootTop !== undefined) {
      // trouser part of the shin, then the boot
      const tl = D.shin * (1 - o.bootTop);
      rig.ps.add(J['knee' + side], limbGeo(o.shin[0], o.shin[0] * 0.95, tl, 14), o.shinMat, 'leg');
      rig.ps.add(J['knee' + side], place(limbGeo(o.boot[0], o.boot[1], D.shin - tl, 14), [0, -tl + 0.01, 0]), o.bootMat, 'leg');
    } else {
      rig.ps.add(J['knee' + side], limbGeo(o.shin[0], o.shin[1], D.shin, 14), o.shinMat, 'leg');
    }
    const f = o.foot || {};
    rig.ps.add(J['foot' + side], place(sphere(f.w ?? 0.045, f.h ?? 0.042, f.l ?? 0.115, 14, 10), [0, -(f.h ?? 0.042) * 0.55, f.z ?? 0.045]), o.footMat || o.bootMat, 'leg');
    rig.ps.add(J['foot' + side], place(new THREE.CylinderGeometry((f.w ?? 0.045) * 0.95, (f.w ?? 0.045), 0.02, 14), [0, -(f.h ?? 0.042) * 0.9 - 0.004, (f.z ?? 0.045)], [0, 0, 0], [1, 1, (f.l ?? 0.115) / (f.w ?? 0.045) * 0.95]), o.soleMat || o.footMat || o.bootMat, 'leg');
  }
}

/** Generic torso lathe (profile [[r, y], ...] bottom→top) with elliptical section. */
function torsoGeo(profile, depth = 0.62, seg = 22, phiStart = 0, phiLen = TAU, bulge = null) {
  const g = lathe(profile, seg, phiStart, phiLen);
  g.scale(1, 1, depth);
  if (bulge) {
    const pos = g.attributes.position, v = V();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); bulge(v); pos.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals();
  }
  return g;
}

/** Small spheres down the shirt front. */
function addButtons(rig, joint, ys, z, mat, r = 0.0065, x = 0) {
  for (const y of ys) rig.ps.add(joint, place(sphere(r, r, r * 0.6, 8, 6), [x, y, z]), mat, 'buttons');
}

/**
 * Hair cap following the deformed skull. The lower edge follows a hairline that is high at the front
 * (forehead), lower at the sides and lowest at the back. o: { front, side, back } polar limits (radians
 * from the top), scale, quiff (front lift), sweep (side sweep in x), part (x of the parting, -1..1).
 */
function hairCapGeo(rig, o = {}) {
  const front = o.front ?? 0.3 * Math.PI, side = o.side ?? 0.47 * Math.PI, back = o.back ?? 0.62 * Math.PI;
  const T = back;
  const g = new THREE.SphereGeometry(1, 34, 18, 0, TAU, 0, T);
  const pos = g.attributes.position, v = V();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const th = Math.acos(clamp(v.y, -1, 1));
    const ang = Math.abs(Math.atan2(v.x, v.z));           // 0 front … π back
    const k = ang / Math.PI;
    const lim = k < 0.5 ? lerp(front, side, smooth(k * 2)) : lerp(side, back, smooth(k * 2 - 1));
    const nt = (th / T) * lim;
    const r = Math.sin(nt);
    const ph = Math.atan2(v.x, v.z);
    v.set(Math.sin(ph) * r, Math.cos(nt), Math.cos(ph) * r);
    // volume: thicker on top, quiff at the front
    const sc = (o.scale ?? 1.08) + (o.top ?? 0.04) * Math.max(0, v.y);
    v.multiplyScalar(sc);
    if (v.z > 0) v.y += (o.quiff ?? 0.06) * v.z * Math.max(0, v.y);
    if (o.part !== undefined) v.y += 0.03 * Math.max(0, 1 - Math.abs(v.x - o.part) * 3) * Math.max(0, v.y) * 0;
    rig.headDef(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Builds a standard human skeleton + limbs from a config. Returns the rig (meshes not yet merged). */
function buildHuman(id, cfg) {
  const rig = createRig(id);
  skeleton(rig, cfg.dims);
  return rig;
}

// --- shared idle: breathing + weight shift + head drift ---------------------
function humanIdle(rig, { breath = 0.012, sway = 0.012, head = 0.03, speed = 1 } = {}) {
  const ph = Math.random() * 10;
  rig._idleFn = (t, I) => {
    const tt = t * speed + ph;
    I.torso[0] += Math.sin(tt * 1.7) * breath;
    I.body[2] += Math.sin(tt * 0.45) * sway * 0.5;
    I.torso[2] -= Math.sin(tt * 0.45) * sway * 0.6;
    I.head[1] += Math.sin(tt * 0.31) * head;
    I.head[0] += Math.sin(tt * 0.53 + 1) * head * 0.4;
    I.armL[0] += Math.sin(tt * 1.7 + 0.4) * breath * 0.5;
    I.armR[0] += Math.sin(tt * 1.7 + 0.4) * breath * 0.5;
  };
}

// ===========================================================================
// Small props owned by characters (fallbacks when props.js has none)
// ===========================================================================

/** Normalise an arbitrary prop so its longest axis is +Y with the given length, bottom at y = 0. */
function fitAlongY(obj, length) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(V());
  if (!(size.x + size.y + size.z > 0)) return null;
  const wrap = new THREE.Group();
  wrap.add(obj);
  if (size.x >= size.y && size.x >= size.z) obj.rotation.z = Math.PI / 2;
  else if (size.z >= size.y && size.z >= size.x) obj.rotation.x = -Math.PI / 2;
  obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj);
  const s = length / Math.max(1e-4, b2.getSize(V()).y);
  obj.scale.multiplyScalar(s);
  obj.updateMatrixWorld(true);
  const b3 = new THREE.Box3().setFromObject(obj);
  const c = b3.getCenter(V());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= b3.min.y;
  return wrap;
}

/** Normalise a prop to fit inside a sphere of the given size, centred. */
function fitSize(obj, size) {
  const box = new THREE.Box3().setFromObject(obj);
  const sz = box.getSize(V()).length();
  if (!(sz > 0)) return null;
  const wrap = new THREE.Group();
  wrap.add(obj);
  obj.scale.multiplyScalar(size / sz);
  obj.updateMatrixWorld(true);
  const c = new THREE.Box3().setFromObject(obj).getCenter(V());
  obj.position.sub(c);
  return wrap;
}

function tryProp(id) {
  if (!makeProp) return null;
  try { return makeProp(id); } catch (e) { return null; }
}

function leechGeo(len = 0.07, r = 0.0085, bend = 0.6, seg = 20) {
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const k = i / 6;
    pts.push(V(Math.sin(k * bend * Math.PI) * len * 0.12, -k * len, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, seg, 1, 8, false);
  const pos = geo.attributes.position, nrm = geo.attributes.normal, pt = V();
  for (let i = 0; i <= seg; i++) {
    const k = i / seg;
    curve.getPointAt(k, pt);
    const rr = r * (0.35 + 0.65 * Math.sin(Math.PI * clamp(k * 1.05, 0, 1)) ** 0.6);
    for (let j = 0; j <= 8; j++) {
      const idx = i * 9 + j;
      pos.setXYZ(idx, pt.x + nrm.getX(idx) * rr, pt.y + nrm.getY(idx) * rr, pt.z + nrm.getZ(idx) * rr);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function makeLeech(mats, len = 0.07, r = 0.0085, bend = 0.6) {
  const mat = mats.toon('#ffffff', { map: ringTex('#5d1c7a', '#2c0c3b', { n: 14, belly: '#772c99' }) });
  const m = new THREE.Mesh(leechGeo(len, r, bend), mat);
  m.castShadow = true;
  return m;
}

function fallbackStick(mats) {
  const len = 2.4;
  const geos = [prep(new THREE.CylinderGeometry(0.008, 0.014, len, 10).translate(0, len / 2, 0))];
  const nodes = [];
  for (const y of [0.35, 0.95, 1.55, 2.05]) nodes.push(prep(place(new THREE.TorusGeometry(0.0125 - y * 0.002, 0.0035, 6, 12), [0, y, 0], [Math.PI / 2, 0, 0])));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries(geos), mats.toon('#d8c79c')));
  g.add(new THREE.Mesh(mergeGeometries(nodes), mats.toon('#3a3024')));
  return g;
}

function fallbackHook(mats) {
  const pts = [[0, 0, 0], [0, -0.03, 0], [0, -0.055, 0], [0.004, -0.07, 0], [0.016, -0.075, 0], [0.026, -0.066, 0], [0.027, -0.05, 0]];
  const g = new THREE.Group();
  const m = mats.toon('#1a1a1a', { outline: 0.003 });
  g.add(new THREE.Mesh(taperTube(pts, 0.0028, 0.0022, 24, 6), m));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.002, 6, 12), m));
  g.add(new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.012, 6).translate(0, 0.006, 0).rotateZ(0.3).translate(0.027, -0.05, 0), m));
  return g;
}

function fallbackWorm(mats) {
  const pts = [];
  for (let i = 0; i <= 8; i++) { const k = i / 8; pts.push([Math.sin(k * Math.PI * 1.6) * 0.012, -k * 0.06, Math.cos(k * 3) * 0.004]); }
  return new THREE.Mesh(taperTube(pts, 0.0055, 0.0045, 28, 8), mats.toon('#ffffff', { map: ringTex('#8c7486', '#5c4458', { n: 10 }) }));
}

function fallbackShrimp(mats) {
  const g = new THREE.Group();
  const orange = mats.toon('#b345df');
  const dark = mats.toon('#1a1a1a', { outline: 0.002 });
  const geos = [];
  // curled body: ellipsoids along a C
  const N = 7;
  for (let i = 0; i < N; i++) {
    const a = -0.4 + (i / (N - 1)) * 2.5;
    const r = 0.03 - i * 0.0028;
    geos.push(prep(place(sphere(r * 0.75, r * 0.9, r * 0.95, 12, 8), [Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0], [0, 0, a])));
  }
  // tail fan
  geos.push(prep(place(new THREE.ConeGeometry(0.018, 0.03, 8), [-0.045 * Math.cos(2.1) + 0.0, 0.045 * Math.sin(2.1) - 0.02, 0], [0, 0, 2.9], [1, 1, 0.35])));
  // head
  geos.push(prep(place(sphere(0.022, 0.03, 0.022, 12, 8), [0.05, -0.03, 0], [0, 0, -0.5])));
  g.add(new THREE.Mesh(mergeGeometries(geos), orange));
  // legs and feelers
  const thin = [];
  for (let i = 0; i < 5; i++) thin.push(prep(taperTube([[0.03 - i * 0.012, -0.01 - i * 0.004, 0.01], [0.03 - i * 0.01, -0.03, 0.012], [0.026 - i * 0.01, -0.045, 0.01]], 0.0018, 0.0012, 6, 4)));
  thin.push(prep(taperTube([[0.06, -0.045, 0.005], [0.07, -0.09, 0.01], [0.04, -0.14, 0.02], [0.0, -0.16, 0.0]], 0.0015, 0.001, 16, 4)));
  thin.push(prep(taperTube([[0.06, -0.045, -0.005], [0.085, -0.08, -0.01], [0.075, -0.13, -0.02], [0.05, -0.17, -0.01]], 0.0015, 0.001, 16, 4)));
  g.add(new THREE.Mesh(mergeGeometries(thin), mats.toon('#ab45d6', { outline: false })));
  const eyeG = place(sphere(0.006), [0.062, -0.022, 0.012]);
  g.add(new THREE.Mesh(eyeG, dark));
  return g;
}

function fallbackGlass(mats) {
  const g = new THREE.Group();
  const prof = [[0.0, 0.0], [0.035, 0.0], [0.036, 0.004], [0.006, 0.012], [0.004, 0.07], [0.008, 0.085], [0.03, 0.11], [0.036, 0.15], [0.032, 0.2]];
  const glassMat = mats.toon('#e8eef0', { transparent: true, opacity: 0.32, side: THREE.DoubleSide });
  glassMat.depthWrite = false;
  const body = new THREE.Mesh(lathe(prof, 20), glassMat);
  body.renderOrder = 3;
  g.add(body);
  const liquidMat = mats.toon('#7b1cab', { outline: false });
  const liquid = new THREE.Mesh(lathe([[0.0, 0.0], [0.008, 0.0], [0.028, 0.025], [0.033, 0.06], [0.0001, 0.06]], 18), liquidMat);
  liquid.position.y = 0.088;
  liquid.scale.set(1, 0.001, 1);
  liquid.visible = false;
  liquid.name = 'glass_liquid';
  g.add(liquid);
  const leech = makeLeech(mats, 0.05, 0.007, 0.3);
  leech.rotation.z = Math.PI / 2;
  leech.position.set(0.025, 0.095, 0);
  leech.name = 'glass_leech';
  leech.visible = false;
  g.add(leech);
  g.setFill = (k = 0) => {
    k = clamp(k, 0, 1);
    liquid.visible = k > 0.01;
    liquid.scale.set(0.55 + 0.45 * Math.sqrt(k), Math.max(0.001, k * 1.6), 0.55 + 0.45 * Math.sqrt(k));
    return Promise.resolve();
  };
  g.showLeech = (v = true) => { leech.visible = v; return Promise.resolve(); };
  return g;
}

function blackCube(mats, size = 0.12) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(size, size, size, 3, size * 0.14), mats.toon('#161616'));
  m.castShadow = true;
  return m;
}

// ===========================================================================
// DAVID
// ===========================================================================

const SKIN_DAVID = '#e2d9cd';

function paintDavid(g, v, o = {}) {
  const skin = o.skin || SKIN_DAVID;
  const lw = 6;
  // stubble shading on the chin
  if (!o.noStubble) blob(g, [[-0.4, -0.55], [-0.3, -0.92], [0, -1.02], [0.3, -0.92], [0.42, -0.55], [0, -0.78]], 'rgba(90,85,85,0.22)');
  for (const s of [-1, 1]) {
    eye(g, s * 0.36, 0.0, 0.17, 0.085, s, {
      skin, lid: v === 'blink' ? 1 : 0.55, closed: v === 'blink', droop: 0.15, pupil: 0.55, look: [0.05 * -s, 0], lw,
      bag: { color: 'rgba(80,75,85,0.38)', depth: 1.5, lines: 1 },
    });
    // heavy straight brows (slightly lower at the inner end)
    line(g, [[s * 0.15, 0.19], [s * 0.36, 0.23], [s * 0.58, 0.2]], 12, '#2a221c');
  }
  // nose line (left side shadow)
  line(g, [[-0.08, 0.1], [-0.1, -0.12], [-0.12, -0.26]], 4, 'rgba(20,20,20,0.6)');
  // smirk
  if (v === 'talk') {
    blob(g, [[-0.2, -0.5], [0, -0.6], [0.22, -0.46], [0, -0.68]], '#3a1a1a');
    line(g, [[-0.22, -0.5], [0, -0.53], [0.24, -0.45]], 5);
  } else {
    line(g, [[-0.25, -0.5], [-0.05, -0.56], [0.15, -0.52], [0.27, -0.42]], 6);
    line(g, [[0.27, -0.42], [0.31, -0.37]], 4);
    line(g, [[-0.25, -0.5], [-0.29, -0.47]], 4);
  }
  // cheek / dimple creases and chin
  line(g, [[0.36, -0.3], [0.4, -0.42], [0.37, -0.52]], 3.5, 'rgba(20,20,20,0.55)');
  line(g, [[-0.32, -0.32], [-0.36, -0.44]], 3, 'rgba(20,20,20,0.45)');
  line(g, [[-0.08, -0.82], [0, -0.85], [0.08, -0.82]], 3.5, 'rgba(20,20,20,0.5)');
}

function buildDavidBody(rig, { hat = true, colors = {} } = {}) {
  const M = rig.mats, J = rig.joints, D = rig.dims;
  const C = { shirt: PALETTE.shirt, vest: '#8a3caa', trousers: '#615a4f', boots: PALETTE.boots, ...colors };
  const skin = rig.skinMat;
  const shirt = M.toon('#ffffff', { map: clothTex(C.shirt, { seed: 11, folds: 9, ink: 0.35 }) });
  const vest = M.toon('#ffffff', { map: clothTex(C.vest, { seed: 12, folds: 6, ink: 0.45 }), side: THREE.DoubleSide });
  const trousers = M.toon('#ffffff', { map: clothTex(C.trousers, { seed: 13, folds: 8, ink: 0.4 }) });
  const boots = M.toon(C.boots);
  const ink = M.toon('#1d1a18', { outline: false });
  // torso (shirt): waist → shoulders
  const prof = [[0.128, -0.06], [0.13, 0.05], [0.142, 0.2], [0.152, 0.33], [0.158, 0.43], [0.14, 0.49], [0.09, 0.525], [0.045, 0.54]];
  rig.ps.add(J.torso, torsoGeo(prof, 0.62), shirt, 'torso');
  // open collar flaps
  // collar band, open V with skin and two collar points
  rig.ps.add(J.torso, place(new THREE.CylinderGeometry(0.056, 0.064, 0.05, 18, 1, true), [0, 0.53, -0.004], [0, 0, 0], [1, 1, 0.92]), M.toon('#ffffff', { map: clothTex(C.shirt, { seed: 15, folds: 3, ink: 0.3 }), side: THREE.DoubleSide }), 'torso');
  rig.ps.add(J.torso, place(sphere(0.026, 0.055, 0.008, 10, 8), [0, 0.475, 0.088], [-0.32, 0, 0]), skin, 'torso');
  const collarM = M.toon(C.shirt, { outline: 0.0032 });
  for (const s of [-1, 1]) rig.ps.add(J.torso, place(new THREE.ConeGeometry(0.02, 0.05, 3), [s * 0.036, 0.492, 0.088], [-0.35, 0, s * 2.45], [1, 1, 0.2]), collarM, 'collar');
  // open vest (gap at the front)
  const vprof = [[0.142, 0.02], [0.145, 0.08], [0.155, 0.2], [0.166, 0.33], [0.172, 0.43], [0.155, 0.49], [0.1, 0.52]];
  rig.ps.add(J.torso, torsoGeo(vprof, 0.66, 22, 0.62, TAU - 1.24), vest, 'vest');
  addButtons(rig, J.torso, [0.09, 0.18, 0.27, 0.36, 0.44], 0.093, ink);
  // hips / trousers top + belt line
  rig.ps.add(J.body, torsoGeo([[0.1, -0.12], [0.14, -0.08], [0.15, -0.02], [0.138, 0.06], [0.132, 0.08]], 0.72), trousers, 'hips');
  rig.ps.add(J.body, place(new THREE.CylinderGeometry(0.137, 0.14, 0.03, 22), [0, 0.055, 0], [0, 0, 0], [1, 1, 0.72]), M.toon(shade(C.trousers, -0.06)), 'hips');
  // arms: baggy rolled sleeves, bare forearms
  addArms(rig, { upper: [0.052, 0.046], upperMat: shirt, fore: [0.036, 0.028], foreMat: skin, cuffMat: shirt, cuffR: 0.016, cuffY: -0.005 });
  // legs: baggy knee breeches into tall boots
  addLegs(rig, {
    thigh: [0.078, 0.068], thighMat: trousers, shin: [0.066, 0.05], shinMat: trousers, bootTop: 0.78,
    boot: [0.054, 0.047], bootMat: boots, foot: { w: 0.048, h: 0.045, l: 0.12, z: 0.04 }, footMat: boots, soleMat: M.toon('#1e1712'),
  });
  // hair at the back/sides (under the hat)
  const hairM = M.toon('#3b2b20');
  const hs = rig.headSpec;
  const hairG = new THREE.SphereGeometry(1.05, 24, 16, Math.PI / 2 + 1.35, TAU - 2.7, 0.0, Math.PI * 0.6);
  const pos = hairG.attributes.position, v = V();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); rig.headDef(v); pos.setXYZ(i, v.x, v.y, v.z); }
  hairG.computeVertexNormals();
  rig.ps.add(J.head, hairG, M.toon('#3b2b20', { side: THREE.DoubleSide }), 'hair');
  // sideburns
  for (const s of [-1, 1]) rig.ps.add(J.head, place(sphere(0.011, 0.026, 0.016, 8, 6), [s * hs.rx * 0.95, 0.02, 0.0]), hairM, 'hair');
  if (hat) {
    // felt hat: crown + light band + up-turned brim, tilted slightly back
    const hatJ = rig.addJoint('hat', J.head, [0, hs.ry * 0.36, -0.008]);
    rig.pose.hat = [-0.1, 0, 0.04];
    rig.parts.hat = hatJ;
    const felt = M.toon('#ffffff', { map: clothTex('#7a5638', { seed: 14, folds: 5, ink: 0.3 }) });
    const crown = lathe([[0.112, 0.0], [0.108, 0.05], [0.104, 0.1], [0.096, 0.13], [0.07, 0.142], [0.035, 0.136], [0.0001, 0.142]], 26).scale(1, 1, 0.9);
    rig.ps.add(hatJ, crown, felt, 'hat');
    rig.ps.add(hatJ, place(new THREE.CylinderGeometry(0.1105, 0.1145, 0.032, 26, 1, true), [0, 0.02, 0], [0, 0, 0], [1, 1, 0.9]).scale(1.02, 1, 1.02), M.toon('#b38f62', { side: THREE.DoubleSide }), 'hat');
    rig.ps.add(hatJ, lathe([[0.1, 0.002], [0.15, -0.002], [0.175, 0.008], [0.186, 0.03], [0.18, 0.032], [0.165, 0.014], [0.12, 0.01], [0.1, 0.012]], 30).scale(1, 1, 0.92), felt, 'hat');
  }
}

const DAVID_DIMS = {
  hipY: 0.86, hipX: 0.082, thigh: 0.4, shin: 0.4, waist: 0.04, neckY: 0.52, headY: 0.19,
  shoulderY: 0.465, shoulderX: 0.165, upper: 0.29, fore: 0.25, headR: [0.103, 0.15, 0.112], hatH: 0.11,
};
const DAVID_HEAD = {
  rx: 0.103, ry: 0.15, rz: 0.112, jaw: 0.26, chin: 0.22, crown: 0.12, flat: 0.14, skin: SKIN_DAVID, neckR: 0.047,
  nose: { top: 0.12, y: -0.3, len: 0.03, w: 0.0122, tip: 0.95, wing: 0.55 }, earY: -0.03, earS: 0.85, paint: paintDavid,
};

function buildDavid() {
  const rig = createRig('david');
  skeleton(rig, DAVID_DIMS);
  addHead(rig, DAVID_HEAD);
  buildDavidBody(rig);
  addHands(rig, rig.skinMat, 1, ['relax', 'grip']);
  rig.ps.build(rig);
  humanIdle(rig, { breath: 0.012, sway: 0.015, head: 0.025 });

  // ---- rod, line, hook, worm, shrimp ------------------------------------------------
  const M = rig.mats;
  const rodMount = new THREE.Group(); rodMount.name = 'david_rod';
  rig.joints.handR.add(rodMount);
  rodMount.position.set(0, -0.075, 0.0);
  const ROD = 2.4, GRIP = 1.32;
  let stickObj = null;
  const sp = tryProp('stick');
  if (sp) stickObj = fitAlongY(sp, ROD);
  if (!stickObj) stickObj = fallbackStick(M);
  stickObj.position.y = -GRIP;
  rodMount.add(stickObj);
  const rodTip = new THREE.Object3D(); rodTip.position.y = ROD - GRIP; rodMount.add(rodTip);
  rodMount.visible = false;

  // line: instanced thin cylinders following a quadratic bezier from the tip
  const SEG = 18;
  const lineMat = M.unlit('#151515');
  const lineMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true), lineMat, SEG);
  lineMesh.name = 'david_line';
  lineMesh.frustumCulled = false;
  lineMesh.visible = false;
  rig.root.add(lineMesh);
  const lineEnd = new THREE.Group(); lineEnd.name = 'david_line_end';
  rig.root.add(lineEnd);
  const hookG = new THREE.Group(); hookG.name = 'david_hook';
  lineEnd.add(hookG);
  let hookObj = null;
  const hp = tryProp('hook');
  if (hp) hookObj = fitSize(hp, 0.1);
  if (!hookObj) hookObj = fallbackHook(M);
  hookG.add(hookObj);
  hookObj.scale.multiplyScalar(1.2);
  const hookProxy = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.unlit('#ff00ff'));
  hookProxy.position.y = -0.05; hookProxy.visible = false; hookProxy.name = 'david_hook_proxy';
  hookG.add(hookProxy);
  let wormObj = null;
  const wp = tryProp('worm');
  if (wp) wormObj = fitSize(wp, 0.1);
  if (!wormObj) wormObj = fallbackWorm(M);
  wormObj.name = 'david_worm';
  wormObj.position.set(0.03, -0.075, 0);
  wormObj.scale.multiplyScalar(1.3);
  hookG.add(wormObj);
  const shrimpG = new THREE.Group(); shrimpG.name = 'david_shrimp';
  lineEnd.add(shrimpG);
  let shrimpObj = null;
  const shp = tryProp('shrimp');
  if (shp) shrimpObj = fitSize(shp, 0.2);
  if (!shrimpObj) shrimpObj = fallbackShrimp(M);
  shrimpObj.position.set(0, -0.11, 0);
  shrimpObj.rotation.set(0, 0, -1.3);
  shrimpObj.scale.multiplyScalar(1.15);
  shrimpG.add(shrimpObj);
  const shrimpProxy = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M.unlit('#ff00ff'));
  shrimpProxy.position.y = -0.1; shrimpProxy.visible = false;
  shrimpG.add(shrimpProxy);
  hookG.visible = false; wormObj.visible = false; shrimpG.visible = false;

  // rod state in root space (tweened by castAndCatch)
  const R = rig.rod = {
    stage: 'none',
    gx: -0.43, gy: 1.3, gz: 0.1,            // right-hand grip point
    dx: 0.0, dy: 1.0, dz: 0.03,             // rod direction
    lk: 0.32, left: 0,                      // left hand: distance below the right hand along the rod & IK blend
    grip: 1.32,                             // distance from the rod butt to the right hand
    mode: 'hang', len: 1.0,                 // line: hang below the tip with length len
    ex: -4, ey: -0.9, ez: 2.5, sag: 1.2,    // cast end point & sag
    castK: 0,                               // 0 = hanging, 1 = cast
    sway: 1,
  };
  const _g = V(), _d = V(), _tip = V(), _end = V(), _ctrl = V(), _a = V(), _b = V(), _dir = V(), _hq = new THREE.Quaternion(), _rootQ = new THREE.Quaternion();
  const _mtx = new THREE.Matrix4(), _sc = V();
  const IKPOLE_R = [-0.5, -1, -0.15], IKPOLE_L = [0.6, -1, -0.3];
  const poleR = V(), poleL = V();

  function updateRod() {
    if (R.stage === 'none') return;
    _g.set(R.gx, R.gy, R.gz);
    _d.set(R.dx, R.dy, R.dz).normalize();
    // right hand to the grip
    poleR.set(IKPOLE_R[0], IKPOLE_R[1], IKPOLE_R[2]);
    rig.ikArm('R', _g, IKPOLE_R);
    stickObj.position.y = -R.grip;
    rodTip.position.y = ROD - R.grip;
    if (R.left > 0) {
      _a.copy(_g).addScaledVector(_d, -R.lk);
      // blend left arm target from its pose to the rod point (R.left = 1 → fully on rod)
      rig.ikArm('L', _a, IKPOLE_L, rig._leftIK);
      const pl = rig.pose.armL, el = rig.pose.elbowL, il = rig._leftIK.armL, ie = rig._leftIK.elbowL, k = R.left;
      rig.joints.armL.rotation.set(lerp(pl[0], il[0], k), lerp(pl[1], il[1], k), lerp(pl[2], il[2], k));
      rig.joints.elbowL.rotation.set(lerp(el[0], ie[0], k), 0, 0);
    }
    const ar = rig.pose.armR, er = rig.pose.elbowR;
    rig.joints.armR.rotation.set(ar[0], ar[1], ar[2]);
    rig.joints.elbowR.rotation.set(er[0], er[1], er[2]);
    // aim the rod: mount quaternion = inv(hand in root) * dir quaternion
    rig.root.updateMatrixWorld(true);
    _mtx.copy(rig.root.matrixWorld).invert().multiply(rig.joints.handR.matrixWorld);
    _mtx.decompose(_a, _hq, _sc);
    _rootQ.setFromUnitVectors(_UP, _d);
    rodMount.quaternion.copy(_hq).invert().multiply(_rootQ);
    rodMount.updateMatrixWorld(true);
    updateLine();
  }
  rig._leftIK = { armL: [0, 0, 0], elbowL: [0, 0, 0] };

  const _mi = new THREE.Matrix4(), _qi = new THREE.Quaternion(), _si = V(), _pi = V();
  function updateLine() {
    if (!lineMesh.visible) return;
    rig.jointToRoot(rodTip, _a.set(0, 0, 0), _tip);
    const t = rig._t;
    const hangLen = R.len;
    // hanging end (with a slight pendulum sway)
    const sw = Math.sin(t * 1.3) * 0.04 * R.sway, sw2 = Math.cos(t * 1.1) * 0.03 * R.sway;
    _end.set(_tip.x + sw - 0.09 * (1 - R.left), _tip.y - hangLen, _tip.z + sw2 + 0.03);
    _ctrl.copy(_tip).lerp(_end, 0.5);
    if (R.castK > 0) {
      _b.set(R.ex, R.ey, R.ez);
      _end.lerp(_b, R.castK);
      _ctrl.copy(_tip).lerp(_end, 0.5);
      _ctrl.y = lerp(_ctrl.y, Math.max(_tip.y, _end.y) + R.sag * (1 - R.castK * 0.6), R.castK);
    }
    // place segments along the quadratic bezier tip → ctrl → end
    for (let i = 0; i < SEG; i++) {
      const k0 = i / SEG, k1 = (i + 1) / SEG;
      bez(_tip, _ctrl, _end, k0, _a); bez(_tip, _ctrl, _end, k1, _b);
      _dir.subVectors(_b, _a);
      const l = _dir.length();
      _pi.addVectors(_a, _b).multiplyScalar(0.5);
      _qi.setFromUnitVectors(_UP, _dir.multiplyScalar(1 / Math.max(1e-5, l)));
      _si.set(0.0055, l * 1.02, 0.0055);
      _mi.compose(_pi, _qi, _si);
      lineMesh.setMatrixAt(i, _mi);
    }
    lineMesh.instanceMatrix.needsUpdate = true;
    lineEnd.position.copy(_end);
  }
  function bez(a, c, b, k, out) {
    const u = 1 - k;
    return out.set(u * u * a.x + 2 * u * k * c.x + k * k * b.x, u * u * a.y + 2 * u * k * c.y + k * k * b.y, u * u * a.z + 2 * u * k * c.z + k * k * b.z);
  }
  rig._after.push(updateRod);

  // ---- poses -----------------------------------------------------------------------
  const POCKETS = rig.solve({
    body: [0, 0, 0], torso: [0.02, 0, 0.0], neck: [0.04, 0, 0], head: [-0.03, 0.1, -0.07],
    legL: [0, 0, 0.03], kneeL: [0, 0, 0], footL: [0, 0, 0],
    legR: [-0.02, 0, -0.06], kneeR: [0.05, 0, 0], footR: [0, 0.2, 0.02],
  }, {
    R: { pos: [-0.15, 0.9, 0.075], pole: [-1, 0, -0.35], hand: [0, 0, 0] },
    L: { pos: [0.205, 0.88, 0.03], pole: [1, -0.3, -1], hand: [0.1, -0.3, 0] },
  });
  rig.POSES = { POCKETS };
  rig.setPose(POCKETS);
  rig.hideHand('R', true);
  rig.setHand('L', 'relax');

  function stageVisuals(stage) {
    const s = ['none', 'stick', 'line', 'hook', 'worm'].indexOf(stage);
    rodMount.visible = s >= 1;
    lineMesh.visible = s >= 2;
    hookG.visible = s >= 3;
    wormObj.visible = s >= 4;
    shrimpG.visible = false;
  }

  /** setRod('none'|'stick'|'line'|'hook'|'worm', { instant }) */
  rig.setRod = async (stage = 'none', { instant = false } = {}) => {
    const prev = R.stage;
    Object.assign(R, { gx: -0.43, gy: 1.3, gz: 0.1, dx: 0.0, dy: 1, dz: 0.03, left: 0, castK: 0, len: 1.22, sway: 1, grip: 1.32 });
    if (stage === 'none') {
      R.stage = 'none';
      stageVisuals('none');
      rig.setHand('R', 'grip'); rig.hideHand('R', true);
      await rig.tweenPose(POCKETS, 500, Ease.inOutSine, instant);
      return;
    }
    rig.setHand('R', 'grip');
    stageVisuals(stage);
    const target = rig.solve({ ...POCKETS, torso: [0.0, 0.05, 0.03], head: [-0.03, 0.18, -0.04] },
      { R: { pos: [R.gx, R.gy, R.gz], pole: IKPOLE_R, hand: [0, 0.4, 0] } });
    if (prev === 'none' && !instant) {
      R.stage = 'none';
      await rig.tweenPose(target, 450, Ease.outSine);
    } else rig.setPose(target);
    R.stage = stage;
    rig.apply();
  };

  rig.showShrimp = (v = true) => { shrimpG.visible = v; return Promise.resolve(); };

  /** Raise rod overhead & lean back (~2.3 s), cast, wait ~3 s, reel in with a shrimp (~6.6 s total). */
  rig.castAndCatch = async ({ instant = false } = {}) => {
    if (R.stage === 'none') await rig.setRod('worm', { instant: true });
    const FINAL_R = { gx: -0.13, gy: 1.3, gz: 0.3, dx: -0.6, dy: 0.76, dz: 0.16, lk: 0.42, left: 1, castK: 0, len: 0.85, sway: 1, grip: 0.68, sag: 0 };
    const finalPose = { ...rig.POSES.POCKETS, body: [0, 0, 0], torso: [0.06, -0.12, 0.04], head: [0.02, -0.2, -0.04], neck: [0.0, 0, 0], legR: [-0.1, 0, -0.08], kneeR: [0.15, 0, 0], legL: [0.08, 0, 0.06], kneeL: [0.05, 0, 0] };
    rig.setHand('L', 'grip');
    if (instant) {
      Object.assign(R, FINAL_R);
      stageVisuals('hook');
      shrimpG.visible = true;
      rig.setPose(finalPose);
      return;
    }
    const tw = (to, ms, ease = Ease.inOutSine) => {
      const keys = Object.keys(to), from = keys.map((k) => R[k]);
      return animate(ms, (e) => { for (let i = 0; i < keys.length; i++) R[keys[i]] = from[i] + (to[keys[i]] - from[i]) * e; rig.apply(); }, ease);
    };
    // 1. grab with both hands and raise overhead, leaning back
    await Promise.all([
      tw({ gx: -0.3, gy: 1.3, gz: 0.25, dx: 0.0, dy: 1, dz: 0.0, lk: 0.3, left: 1, grip: 0.9 }, 400),
      rig.tweenPose({ torso: [0.04, -0.1, 0.0] }, 400),
    ]);
    await Promise.all([
      tw({ gx: -0.08, gy: 1.85, gz: -0.02, dx: 0.35, dy: 0.65, dz: -0.68, lk: 0.32, grip: 0.55 }, 1900, Ease.inOutSine),
      rig.tweenPose({ torso: [-0.22, 0.15, 0.08], head: [-0.25, 0.1, 0], neck: [-0.05, 0, 0], legR: [0.15, 0, -0.08], kneeR: [0, 0, 0], legL: [-0.25, 0, 0.06], kneeL: [0.3, 0, 0] }, 1900),
    ]);
    // 2. cast: whip forward, line flies far out
    R.castK = 0; R.ex = -6.5; R.ey = -0.95; R.ez = 3.5; R.sag = 1.6;
    await Promise.all([
      tw({ gx: -0.2, gy: 1.25, gz: 0.32, dx: -0.75, dy: 0.45, dz: 0.5, castK: 1, sway: 0, grip: 0.5 }, 500, Ease.outCubic),
      rig.tweenPose({ torso: [0.18, -0.2, 0.0], head: [0.1, -0.3, -0.05], neck: [0.05, 0, 0], legR: [-0.15, 0, -0.08], kneeR: [0.25, 0, 0], legL: [0.15, 0, 0.06], kneeL: [0.0, 0, 0] }, 500, Ease.outCubic),
    ]);
    wormObj.visible = false;
    // 3. wait for a bite (line settles onto the water, rod bobbing a little)
    await animate(2900, (e) => {
      const b = Math.sin(e * 2900 / 1000 * 5) * 0.012 * (e > 0.8 ? 3 : 1);
      R.dy = 0.45 + b;
      R.sag = lerp(1.6, -0.6, smooth(clamp(e * 3, 0, 1)));
      rig.apply();
    }, Ease.linear);
    // 4. reel in: lift the rod diagonally, shrimp dangling on the hook
    shrimpG.visible = true;
    await Promise.all([
      tw({ ...FINAL_R, sway: 1 }, 900, Ease.inOutCubic),
      rig.tweenPose(finalPose, 900, Ease.inOutCubic),
    ]);
  };

  rig.play('idle');
  rig.apply();
  return rig;
}

// ===========================================================================
// MARGARET (grandmother) — seated on her 3-legged stool, with the nose leech
// ===========================================================================

const SKIN_OLD = '#bcb3b8';

function paintMargaret(g, v) {
  const skin = SKIN_OLD;
  const pain = v === 'pain';
  const lw = 5.5;
  // forehead wrinkles
  for (let i = 0; i < 3; i++) line(g, [[-0.3 + i * 0.05, 0.42 + i * 0.09], [0, 0.45 + i * 0.1], [0.3 - i * 0.05, 0.42 + i * 0.09]], 3, 'rgba(30,25,30,0.5)');
  // lower-face jowl outline (the "muzzle" seen in the frames)
  line(g, [[-0.34, -0.34], [-0.4, -0.62], [-0.3, -0.9], [0, -0.98], [0.3, -0.9], [0.4, -0.62], [0.34, -0.34]], 6);
  // fine chin wrinkles
  line(g, [[-0.22, -0.84], [-0.12, -0.92]], 2.5, 'rgba(30,25,30,0.5)');
  line(g, [[0.22, -0.84], [0.12, -0.92]], 2.5, 'rgba(30,25,30,0.5)');
  line(g, [[-0.07, -0.95], [0.07, -0.95]], 2.5, 'rgba(30,25,30,0.4)');
  for (const s of [-1, 1]) {
    eye(g, s * 0.36, 0.05, 0.15, 0.08, s, {
      skin, lid: v === 'blink' ? 1 : 0.5, closed: v === 'blink', squeeze: pain, droop: 0.45, pupil: 0.6, lw,
      bag: { color: 'rgba(80,70,85,0.3)', depth: 1.4, lines: 3 },
    });
    // bushy white-grey brows, drooping outward (knitted when in pain)
    const by = pain ? 0.18 : 0.24;
    const inner = pain ? 0.2 : 0.24;
    pen(g, 3, '#f0eeea');
    for (let i = 0; i < 9; i++) {
      const k = i / 8;
      const x = s * lerp(0.14, 0.58, k), y = by + (pain ? (1 - k) * -0.05 : 0) + Math.sin(k * Math.PI) * 0.05 - k * 0.07;
      g.beginPath(); g.moveTo(FX(x), FY(y - 0.025)); g.lineTo(FX(x + s * 0.06), FY(y + 0.03)); g.stroke();
    }
    line(g, [[s * 0.13, inner - 0.04], [s * 0.35, by + 0.03], [s * 0.6, by - 0.08]], 3, 'rgba(20,20,20,0.75)');
    // cheek wrinkles
    line(g, [[s * 0.52, -0.05], [s * 0.6, -0.2], [s * 0.56, -0.34]], 3, 'rgba(30,25,30,0.45)');
    line(g, [[s * 0.2, -0.28], [s * 0.3, -0.4]], 3, 'rgba(30,25,30,0.45)');
  }
  if (pain) line(g, [[-0.06, 0.24], [-0.02, 0.18]], 3), line(g, [[0.06, 0.24], [0.02, 0.18]], 3);
  // down-turned mouth
  if (v === 'talk') blob(g, [[-0.2, -0.58], [0, -0.52], [0.2, -0.58], [0, -0.7]], '#2a1616');
  line(g, [[-0.24, -0.66], [-0.15, -0.58], [0, -0.56], [0.15, -0.58], [0.24, -0.66]], pain ? 7 : 6);
}

function buildMargaret({ standing = false, id = 'margaret' } = {}) {
  const rig = createRig(id);
  const seat = 0.42;
  skeleton(rig, standing ? {
    hipY: 0.8, hipX: 0.08, thigh: 0.38, shin: 0.38, waist: 0.04, neckY: 0.46, neckZ: 0.02, headY: 0.17, headZ: 0.03,
    shoulderY: 0.42, shoulderX: 0.155, upper: 0.26, fore: 0.24, headR: [0.105, 0.128, 0.112],
  } : {
    hipY: seat + 0.07, hipX: 0.085, thigh: 0.38, shin: 0.36, waist: 0.04, neckY: 0.46, neckZ: 0.02, headY: 0.17, headZ: 0.03,
    shoulderY: 0.42, shoulderX: 0.155, upper: 0.26, fore: 0.24, headR: [0.105, 0.128, 0.112],
  });
  const M = rig.mats, J = rig.joints;
  addHead(rig, {
    rx: 0.105, ry: 0.128, rz: 0.112, jaw: 0.12, chin: 0.1, crown: 0.05, flat: 0.12, cheek: 0.12, skin: SKIN_OLD,
    nose: { top: 0.08, y: -0.28, len: 0.036, w: 0.0165, tip: 1.2, wing: 0.75, drop: -0.008 }, earY: -0.05, paint: paintMargaret,
  });
  rig.headTags = ['head', 'face', 'hair'];
  const dress = M.toon('#ffffff', { map: clothTex('#5a4b3e', { seed: 21, folds: 10, ink: 0.5 }) });
  const apron = M.toon('#ffffff', { map: clothTex('#c8c0b5', { seed: 22, folds: 9, ink: 0.4 }), side: THREE.DoubleSide });
  const scarf = M.toon('#ffffff', { map: clothTex('#cfc5a9', { seed: 23, folds: 10, ink: 0.4 }), side: THREE.DoubleSide });
  const skin = rig.skinMat;
  // torso (hunched dress top), shawl/bib
  rig.ps.add(J.torso, torsoGeo([[0.15, -0.06], [0.155, 0.08], [0.165, 0.22], [0.17, 0.33], [0.155, 0.41], [0.1, 0.45], [0.05, 0.47]], 0.72), dress, 'torso');
  rig.ps.add(J.torso, torsoGeo([[0.158, 0.06], [0.168, 0.2], [0.175, 0.3], [0.16, 0.38]], 0.75, 14, -0.55, 1.1), apron, 'torso');
  // skirt over the lap
  if (standing) {
    rig.ps.add(J.body, lathe([[0.31, -0.8], [0.27, -0.6], [0.21, -0.3], [0.17, -0.05], [0.155, 0.06]], 26).scale(1, 1, 0.85), dress, 'skirt');
    rig.ps.add(J.body, lathe([[0.315, -0.78], [0.275, -0.6], [0.215, -0.3], [0.175, -0.05], [0.162, 0.05]], 16, -0.75, 1.5).scale(1, 1, 0.86), apron, 'skirt');
  } else {
    // lap: the front of the skirt is pushed forward over the thighs, the back hem rises to show the stool
    const lap = (v, extra = 0) => {
      const r = Math.hypot(v.x, v.z) || 1, c = v.z / r, cz = Math.max(0, c);
      const ext = 0.3 * smooth(clamp((0.075 - v.y) / 0.06, 0, 1));
      v.z = v.z * 0.92 + Math.pow(cz, 1.6) * ext + extra;
      if (c < 0) v.y = lerp(v.y, Math.max(v.y, -0.2), Math.sqrt(-c));
    };
    const skirtG = lathe([[0.27, -seat - 0.06], [0.25, -0.3], [0.22, -0.08], [0.2, 0.0], [0.17, 0.05], [0.155, 0.1]], 30);
    const pos = skirtG.attributes.position, v = V();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); lap(v); pos.setXYZ(i, v.x, v.y, v.z); }
    skirtG.computeVertexNormals();
    rig.ps.add(J.body, skirtG, dress, 'skirt');
    const apG = lathe([[0.28, -seat - 0.04], [0.26, -0.3], [0.23, -0.08], [0.21, 0.0], [0.175, 0.055]], 14, -0.62, 1.24);
    const ap = apG.attributes.position;
    for (let i = 0; i < ap.count; i++) { v.fromBufferAttribute(ap, i); lap(v, 0.012); ap.setXYZ(i, v.x * 1.02, v.y, v.z); }
    apG.computeVertexNormals();
    rig.ps.add(J.body, apG, apron, 'skirt');
  }
  // shoes peeking out
  for (const side of ['L', 'R']) rig.ps.add(J['foot' + side], place(sphere(0.042, 0.035, 0.09, 12, 8), [0, -0.03, 0.05]), M.toon('#2c241e'), 'leg');
  // arms: brown sleeves, bony hands
  addArms(rig, { upper: [0.058, 0.05], upperMat: dress, fore: [0.048, 0.036], foreMat: dress });
  // headscarf: hood around the head + cape over the shoulders + knot under the chin
  const hs = rig.headSpec;
  const hood = new THREE.SphereGeometry(1.13, 30, 20, Math.PI / 2 + 1.05, TAU - 2.1, 0.0, Math.PI * 0.76);
  const hp = hood.attributes.position, hv = V();
  for (let i = 0; i < hp.count; i++) {
    hv.fromBufferAttribute(hp, i);
    if (hv.y < -0.3) { hv.x *= 1 + (-hv.y - 0.3) * 0.5; if (hv.z < 0) hv.z *= 1 + (-hv.y - 0.3) * 0.4; }
    rig.headDef(hv); hp.setXYZ(i, hv.x, hv.y + 0.01, hv.z - 0.004);
  }
  hood.computeVertexNormals();
  rig.ps.add(J.head, hood, scarf, 'scarf');
  // shawl over the shoulders (open at the front)
  rig.ps.add(J.torso, torsoGeo([[0.25, 0.17], [0.248, 0.27], [0.232, 0.35], [0.2, 0.41], [0.15, 0.46], [0.11, 0.51], [0.1, 0.56]], 0.86, 26, 0.5, TAU - 1.0), scarf, 'scarf');
  // knot under the chin with two hanging ends
  const hsy = rig.headSpec.ry, hsz = rig.headSpec.rz;
  rig.ps.add(J.head, place(sphere(0.024, 0.02, 0.022, 12, 8), [0.035, -hsy * 1.0, hsz * 0.42], [0.2, 0, 0.3]), scarf, 'scarf');
  rig.ps.add(J.head, place(sphere(0.022, 0.05, 0.009, 10, 8), [0.07, -hsy * 1.0 - 0.04, hsz * 0.48], [0.25, 0, 0.7]), scarf, 'scarf');
  rig.ps.add(J.head, place(sphere(0.02, 0.045, 0.009, 10, 8), [0.012, -hsy * 1.0 - 0.042, hsz * 0.5], [0.3, 0, -0.35]), scarf, 'scarf');
  // silver hair parted in the middle under the hood edge
  const hairG = new THREE.SphereGeometry(1.08, 24, 10, Math.PI / 2 - 0.95, 1.9, 0.02, Math.PI * 0.27);
  const hpp = hairG.attributes.position;
  for (let i = 0; i < hpp.count; i++) { hv.fromBufferAttribute(hpp, i); rig.headDef(hv); hpp.setXYZ(i, hv.x, hv.y, hv.z); }
  hairG.computeVertexNormals();
  rig.ps.add(J.head, hairG, M.toon('#ffffff', { map: hairTex('#e2e2e0', '#8f8f90', 5, 0.5) }), 'hair');
  // stool (seated version)
  if (!standing) {
    const stool = new THREE.Group(); stool.name = 'margaret_stool';
    const wood = M.toon('#ffffff', { map: clothTex('#8b8984', { seed: 24, folds: 5, ink: 0.5 }) });
    const sg = [prep(new THREE.CylinderGeometry(0.17, 0.165, 0.04, 22).translate(0, seat - 0.02, 0))];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      const leg = new THREE.CylinderGeometry(0.018, 0.022, seat * 1.06, 8);
      place(leg, [Math.sin(a) * 0.15, seat / 2 - 0.01, Math.cos(a) * 0.15], [Math.cos(a) * 0.22, 0, -Math.sin(a) * 0.22]);
      sg.push(prep(leg));
    }
    const stoolMesh = new THREE.Mesh(mergeGeometries(sg), wood);
    stoolMesh.castShadow = true;
    stool.add(stoolMesh);
    rig.root.add(stool);
  }
  addHands(rig, skin, 1.08, ['pray', 'pinch']);
  rig.ps.build(rig);

  // ---- nose leech ---------------------------------------------------------------------
  const head = J.head;
  const noseG = new THREE.Group(); noseG.name = 'margaret_nose';
  head.add(noseG);
  const tip = rig.noseTip;
  noseG.position.set(-0.012, tip.y - 0.018, tip.z - 0.02);
  const noseProxy = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), M.unlit('#ff00ff'));
  noseProxy.visible = false; noseProxy.name = 'margaret_nose_proxy';
  noseProxy.position.set(0.012, 0.02, 0.0);
  noseG.add(noseProxy);
  const noseLeechPivot = new THREE.Group();
  noseLeechPivot.rotation.set(0.3, 0, 0.1);
  noseLeechPivot.position.set(0, 0.008, -0.004);
  noseG.add(noseLeechPivot);
  const LL = 0.07;
  const noseLeech = makeLeech(M, LL, 0.0062, 0.25);
  noseLeech.name = 'margaret_nose_leech';
  noseLeechPivot.add(noseLeech);
  const NOSE = { none: 0, peek: 0.014, stay: 0.018, pull1: 0.038, pull2: 0.058, out: 0.0 };
  // the leech grows out of the nostril (scaled along its length, anchored at the nostril)
  const setOut = (amount) => {
    noseLeech.visible = amount > 0.001;
    const k = clamp(amount / LL, 0.001, 1.4);
    noseLeech.scale.set(0.75 + 0.25 * Math.min(1, k * 2), k, 0.75 + 0.25 * Math.min(1, k * 2));
  };
  setOut(0);
  const blood = new THREE.Mesh(sphere(0.007, 0.022, 0.004, 10, 8), M.toon('#7b1cab', { outline: false }));
  const bp = headSurface(rig.headDef, -0.1, -0.46);
  blood.position.set(bp.x, bp.y + 0.006, bp.z + 0.004);
  blood.rotation.x = -0.4;
  blood.visible = false;
  head.add(blood);
  rig.noseStage = 'none';
  let noseAmt = 0;
  rig._upd.push((dt, t) => {
    if (rig.noseStage === 'stay' || rig.noseStage === 'pull1' || rig.noseStage === 'pull2') {
      noseLeechPivot.rotation.z = 0.12 + Math.sin(t * 9) * 0.12;
      noseLeechPivot.rotation.x = 0.35 + Math.sin(t * 6.3) * 0.08;
    }
  });
  const moveTo = (amt, ms) => {
    const from = noseAmt;
    return animate(ms, (e) => { noseAmt = lerp(from, amt, e); setOut(noseAmt); }, Ease.inOutSine);
  };

  /** setNose('none'|'peek'|'stay'|'pull1'|'pull2'|'out', { instant }) */
  rig.setNose = async (stage = 'none', { instant = false } = {}) => {
    rig.noseStage = stage;
    if (instant) {
      noseAmt = NOSE[stage] ?? 0; setOut(noseAmt);
      blood.visible = stage === 'pull1' || stage === 'pull2';
      if (stage === 'out') rig.holdLeech(true, { instant: true });
      return;
    }
    if (stage === 'peek') {
      await moveTo(0.013, 260);
      await wait(380);
      await moveTo(0, 300);
      return;
    }
    if (stage === 'pull1' || stage === 'pull2') {
      rig.setExpression('pain');
      blood.visible = true;
      await moveTo(NOSE[stage], 380);
      await wait(250);
      rig.setExpression('neutral');
      return;
    }
    if (stage === 'out') {
      rig.setExpression('pain');
      await moveTo(0.09, 450);
      noseAmt = 0; setOut(0);
      blood.visible = false;
      await rig.holdLeech(true);
      await wait(200);
      rig.setExpression('neutral');
      return;
    }
    await moveTo(NOSE[stage] ?? 0, 300);
    blood.visible = false;
  };

  // ---- held leech in the left hand -----------------------------------------------------
  const heldLeech = makeLeech(M, 0.085, 0.0095, 0.35);
  heldLeech.name = 'margaret_leech';
  const heldWrap = new THREE.Group();
  heldWrap.add(heldLeech);
  heldLeech.rotation.set(0, 0, 0.15);
  heldLeech.position.set(0, 0, 0);
  heldWrap.position.set(-0.01, -0.095, 0.03);
  J.handL.add(heldWrap);
  heldWrap.visible = false;
  // 手里的水蛭很小：看不见的点击球（材质不可见、userData.proxy），只在水蛭显示时可点
  const leechProxy = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), noOutline(new THREE.MeshBasicMaterial({ visible: false })));
  leechProxy.position.y = 0.04; leechProxy.userData.proxy = true; leechProxy.name = 'margaret_leech_hit';
  heldLeech.add(leechProxy);

  // ---- poses ---------------------------------------------------------------------------
  const sitLegs = standing ? {
    legL: [0, 0, 0.02], kneeL: [0, 0, 0], legR: [0, 0, -0.02], kneeR: [0, 0, 0], footL: [0, 0, 0], footR: [0, 0, 0],
  } : {
    legL: [-1.48, 0, 0.1], kneeL: [1.45, 0, 0], footL: [0.05, 0, 0], legR: [-1.48, 0, -0.1], kneeR: [1.45, 0, 0], footR: [0.05, 0, 0],
  };
  const baseBody = { body: [0, 0, 0], torso: [0.32, 0.0, 0.0], neck: [-0.08, 0.0, 0.0], head: [-0.15, -0.25, 0.06], ...sitLegs };
  const hy = standing ? 1.2 : 0.9;
  const together = rig.solve(baseBody, {
    L: { pos: [0.09, hy, 0.29], pole: [1, -1, -0.3], aim: { fingers: [0.15, 1, 0.45], palm: [-1, 0, 0.1] } },
    R: { pos: [0.01, hy - 0.005, 0.29], pole: [-1, -1, -0.3], aim: { fingers: [0.15, 1, 0.45], palm: [1, 0, -0.1] } },
  });
  const holding = rig.solve(baseBody, {
    L: { pos: [0.2, hy + 0.1, 0.27], pole: [1, -1, -0.2], aim: { fingers: [-0.2, 1, 0.3], palm: [-0.6, 0, 0.8] } },
    R: { pos: [0.01, hy - 0.005, 0.29], pole: [-1, -1, -0.3], aim: { fingers: [0.15, 1, 0.45], palm: [1, 0, -0.1] } },
  });
  rig.POSES = { together, holding };
  rig.setPose(together);
  rig.setHand('L', 'pray'); rig.setHand('R', 'pray');

  /** holdLeech(true|false, { instant }) — leech pinched in her left fingers beside her face. */
  rig.holdLeech = async (v = true, { instant = false } = {}) => {
    if (v) {
      rig.setHand('L', 'pinch');
      heldWrap.visible = true;
      await rig.tweenPose(holding, 550, Ease.inOutSine, instant);
    } else {
      heldWrap.visible = false;
      await rig.tweenPose(together, 550, Ease.inOutSine, instant);
      rig.setHand('L', 'pray');
    }
  };

  humanIdle(rig, { breath: 0.01, sway: 0.008, head: 0.015, speed: 0.8 });
  const base = rig._idleFn;
  rig._idleFn = (t, I, dt) => { base(t, I, dt); I.head[2] += Math.sin(t * 2.3) * 0.006; };
  rig.play('idle');
  rig.apply();
  return rig;
}

// ===========================================================================
// NICHOLAS (father) — seated, tailcoat, jabot, wine glass
// ===========================================================================

const SKIN_NICK = '#d9d5cf';

function paintNicholas(g, v) {
  const skin = SKIN_NICK;
  const lw = 6;
  for (const s of [-1, 1]) {
    eye(g, s * 0.35, 0.06, 0.16, 0.08, s, {
      skin, lid: v === 'blink' ? 1 : 0.42, closed: v === 'blink', droop: 0.05, pupil: 0.62, lw,
      bag: { color: 'rgba(120,118,118,0.55)', depth: 1.7, lines: 1 },
    });
    // stern brows angled down to the centre, grey with ink edge
    blob(g, [[s * 0.12, 0.17], [s * 0.35, 0.27], [s * 0.6, 0.26], [s * 0.36, 0.21]], '#8a8a8a');
    line(g, [[s * 0.12, 0.165], [s * 0.36, 0.205], [s * 0.6, 0.25]], 4.5);
    // cheekbone / long-face creases
    line(g, [[s * 0.55, -0.12], [s * 0.6, -0.35], [s * 0.5, -0.6]], 3.5, 'rgba(20,20,20,0.6)');
    line(g, [[s * 0.2, -0.36], [s * 0.3, -0.5]], 3, 'rgba(20,20,20,0.5)');
  }
  // thin black moustache (handlebar)
  blob(g, [[0.0, -0.4], [-0.16, -0.42], [-0.32, -0.52], [-0.18, -0.48], [0, -0.46], [0.18, -0.48], [0.32, -0.52], [0.16, -0.42]], '#141414');
  // mouth
  if (v === 'talk') blob(g, [[-0.14, -0.6], [0, -0.57], [0.14, -0.6], [0, -0.7]], '#2a1515');
  else line(g, [[-0.16, -0.61], [0, -0.6], [0.16, -0.62]], 5);
  // chin cleft and jaw shadow
  line(g, [[0, -0.86], [0, -0.92]], 3, 'rgba(20,20,20,0.5)');
  blob(g, [[-0.45, -0.7], [-0.25, -0.95], [0, -1], [0.25, -0.95], [0.45, -0.7], [0, -0.85]], 'rgba(100,98,100,0.18)');
}

function buildNicholas() {
  const rig = createRig('nicholas');
  const seat = 0.47;
  skeleton(rig, {
    hipY: seat + 0.075, hipX: 0.09, thigh: 0.43, shin: 0.45, waist: 0.04, neckY: 0.55, headY: 0.2, headZ: 0.0,
    shoulderY: 0.5, shoulderX: 0.18, upper: 0.3, fore: 0.27, headR: [0.093, 0.148, 0.108],
  });
  const M = rig.mats, J = rig.joints;
  addHead(rig, {
    rx: 0.093, ry: 0.148, rz: 0.108, jaw: 0.38, chin: 0.3, crown: 0.1, flat: 0.1, skin: SKIN_NICK,
    nose: { top: 0.1, y: -0.27, len: 0.03, w: 0.0125, tip: 1.0, drop: -0.004 }, earY: -0.02, earS: 0.85, paint: paintNicholas,
  });
  const coat = M.toon('#ffffff', { map: clothTex('#26262a', { seed: 31, folds: 10, ink: 0.7 }) });
  const coatD = M.toon('#ffffff', { map: clothTex('#26262a', { seed: 32, folds: 8, ink: 0.7 }), side: THREE.DoubleSide });
  const white = M.toon('#ffffff', { map: clothTex('#efeee9', { seed: 33, folds: 6, ink: 0.3 }) });
  const jabotM = M.toon('#ffffff', { map: clothTex('#f2f1ec', { seed: 34, folds: 0, ink: 0, stripes: 'rgba(20,20,20,0.55)' }), side: THREE.DoubleSide });
  const trousers = M.toon('#ffffff', { map: clothTex('#2c2b2d', { seed: 35, folds: 10, ink: 0.6 }) });
  const shoe = M.toon('#161616');
  const skin = rig.skinMat;
  // shirt front + coat (open at the front)
  rig.ps.add(J.torso, torsoGeo([[0.13, -0.06], [0.135, 0.1], [0.15, 0.3], [0.16, 0.44], [0.12, 0.52], [0.05, 0.55]], 0.62), white, 'torso');
  rig.ps.add(J.torso, torsoGeo([[0.145, -0.08], [0.15, 0.08], [0.165, 0.28], [0.178, 0.42], [0.16, 0.5], [0.11, 0.545], [0.07, 0.56]], 0.66, 24, 0.42, TAU - 0.84), coatD, 'coat');
  // lapels
  for (const s of [-1, 1]) rig.ps.add(J.torso, place(sphere(0.05, 0.13, 0.012, 10, 8), [s * 0.065, 0.39, 0.098], [-0.1, s * 0.35, s * -0.25]), coat, 'coat');
  // high white collar + ruffled jabot cascade
  rig.ps.add(J.torso, place(new THREE.CylinderGeometry(0.052, 0.06, 0.1, 18, 1, true), [0, 0.6, 0.0]), M.toon('#f2f1ec', { side: THREE.DoubleSide }), 'collar');
  for (const s of [-1, 1]) rig.ps.add(J.torso, place(new THREE.ConeGeometry(0.022, 0.06, 3), [s * 0.03, 0.63, 0.052], [-0.15, 0, s * 0.35], [1, 1, 0.25]), white, 'collar');
  for (let i = 0; i < 5; i++) {
    const y = 0.53 - i * 0.065, w = 0.045 + i * 0.006;
    rig.ps.add(J.torso, place(lathe([[w, -0.03], [w * 0.8, 0.0], [w * 0.4, 0.03]], 16, -1.2, 2.4), [0, y, 0.07 - i * 0.004], [0.5, 0, 0], [1, 1, 0.5]), jabotM, 'jabot');
  }
  // coat tails draping beside the seat
  for (const s of [-1, 1]) {
    const tail = lathe([[0.03, -0.62], [0.07, -0.45], [0.09, -0.2], [0.09, 0.0], [0.08, 0.05]], 10, 0, Math.PI);
    place(tail, [s * 0.2, 0.02, -0.05], [0, s * Math.PI / 2, 0], [1, 1, 0.5]);
    rig.ps.add(J.body, tail, coatD, 'coat');
  }
  // hips
  rig.ps.add(J.body, torsoGeo([[0.12, -0.12], [0.148, -0.06], [0.152, 0.02], [0.14, 0.08]], 0.72), trousers, 'hips');
  // arms: black sleeves, white cuffs
  addArms(rig, { upper: [0.055, 0.048], upperMat: coat, fore: [0.046, 0.04], foreMat: coat, wristMat: M.toon('#f2f1ec') });
  // legs
  addLegs(rig, {
    thigh: [0.075, 0.062], thighMat: trousers, shin: [0.058, 0.045], shinMat: trousers,
    foot: { w: 0.045, h: 0.04, l: 0.125, z: 0.05 }, footMat: shoe, soleMat: shoe,
  });
  // hair: grey-white, slicked back, side part
  const hs = rig.headSpec;
  rig.ps.add(J.head, hairCapGeo(rig, { front: 0.33 * Math.PI, side: 0.5 * Math.PI, back: 0.66 * Math.PI, scale: 1.1, top: 0.16, quiff: 0.3 }),
    M.toon('#ffffff', { map: hairTex('#9c9c9a', '#4a4a4a', 7, 0.3) }), 'hair');
  void hs;
  addHands(rig, skin, 1.05, ['grip', 'relax']);
  rig.ps.build(rig);

  // ---- wine glass ------------------------------------------------------------------------
  const glassWrap = new THREE.Group(); glassWrap.name = 'nicholas_glass';
  let glass = null;
  const gp = tryProp('wine_glass');
  if (gp) {
    const box = new THREE.Box3().setFromObject(gp), h = box.getSize(V()).y;
    if (h > 0.05 && h < 0.6) { gp.scale.multiplyScalar(0.2 / h); glass = gp; }
  }
  if (!glass) glass = fallbackGlass(M);
  glassWrap.add(glass);
  glassWrap.setFill = (k, o) => (glass.setFill ? glass.setFill(k, o) : Promise.resolve());
  glassWrap.showLeech = (v, o) => (glass.showLeech ? glass.showLeech(v, o) : Promise.resolve());
  glassWrap.inner = glass;
  // hold the stem between the fingers: glass base slightly below the fist
  const glassMount = new THREE.Group();
  J.handR.add(glassMount);
  glassMount.position.set(0.0, -0.075, 0.015);
  glassMount.add(glassWrap);
  glassWrap.position.set(0, -0.06, 0);
  rig.glass = glassWrap;
  const _gq = new THREE.Quaternion(), _gq2 = new THREE.Quaternion(), _gm = new THREE.Matrix4(), _gs = V(), _gp = V();
  rig.glassTilt = 0;
  const _tiltAxis = V(1, 0, 0), _tiltQ = new THREE.Quaternion();
  // keep the glass upright in root space (plus a drinking tilt) whatever the hand does
  rig._after.push(() => {
    rig.root.updateMatrixWorld(true);
    _gm.copy(rig.root.matrixWorld).invert().multiply(J.handR.matrixWorld);
    _gm.decompose(_gp, _gq, _gs);
    _tiltQ.setFromAxisAngle(_tiltAxis.set(1, 0, 0), rig.glassTilt);
    glassMount.quaternion.copy(_gq).invert().multiply(_tiltQ);
    void _gq2;
  });

  // ---- poses -----------------------------------------------------------------------------
  const sit = {
    body: [-0.05, 0, 0], torso: [0.02, 0, 0], neck: [0.02, 0, 0], head: [0.0, 0.0, 0.0],
    legL: [-1.5, 0.0, 0.06], kneeL: [1.62, 0, 0], footL: [-0.08, 0, 0],
    legR: [-1.5, 0.0, -0.06], kneeR: [1.62, 0, 0], footR: [-0.08, 0, 0],
  };
  const GLASS_POS = [-0.17, 1.2, 0.33];
  const hold = rig.solve(sit, {
    R: { pos: GLASS_POS, pole: [-1, -1, -0.3], hand: [0, 0, 0] },
    L: { pos: [0.15, 0.62, 0.3], pole: [1, 0, -1], hand: [0.4, 0, 0] },
  });
  const sip = rig.solve({ ...sit, head: [-0.32, 0, 0], neck: [-0.1, 0, 0], torso: [-0.06, 0, 0] }, {
    R: { pos: [-0.035, 1.17, 0.29], pole: [-1, -0.8, -0.2], hand: [0, 0, 0] },
    L: { pos: [0.15, 0.62, 0.3], pole: [1, 0, -1], hand: [0.4, 0, 0] },
  });
  const raise = rig.solve({ ...sit, head: [-0.08, 0, 0] }, {
    R: { pos: [-0.07, 1.12, 0.34], pole: [-1, -0.8, -0.2], hand: [0, 0, 0] },
    L: { pos: [0.15, 0.62, 0.3], pole: [1, 0, -1], hand: [0.4, 0, 0] },
  });
  const point = rig.solve({ ...sit, torso: [0.1, 0, 0], head: [0.12, 0, 0] }, {
    R: { pos: [-0.08, 0.92, 0.55], pole: [-1, 0.2, -0.6], hand: [-0.5, 0, 0] },
    L: { pos: [0.15, 0.62, 0.3], pole: [1, 0, -1], hand: [0.4, 0, 0] },
  });
  rig.POSES = { hold, sip, raise, point };
  rig.setPose(hold);
  rig.setHand('R', 'grip'); rig.setHand('L', 'relax');

  /** Raise glass, tilt head back and drink slowly (~5.5 s), lower; the empty glass then shows the leech. */
  rig.drink = async ({ instant = false } = {}) => {
    glassWrap.visible = true;
    if (instant) { rig.glassTilt = 0; rig.setPose(hold); await glassWrap.setFill(0); await glassWrap.showLeech(true); return; }
    await rig.tweenPose(raise, 1000, Ease.inOutSine);
    const tilt0 = rig.glassTilt;
    await Promise.all([
      rig.tweenPose(sip, 1000, Ease.inOutSine),
      animate(1000, (e) => { rig.glassTilt = lerp(tilt0, -1.0, e); }),
    ]);
    // slow drink: fill drains while the head tips back further
    // 从杯子当前的液面开始喝（倒了多少喝多少）
    const fill0 = glass.getFill ? glass.getFill() : (glass.userData?.fill ?? 0.66);
    await animate(2600, (e) => {
      rig.glassTilt = lerp(-1.0, -1.5, e);
      glassWrap.setFill(fill0 * (1 - e));
      rig.pose.head[0] = sip.head[0] - 0.12 * e;
      rig.apply();
    }, Ease.inOutSine);
    await glassWrap.setFill(0);
    await Promise.all([
      rig.tweenPose(hold, 1100, Ease.inOutSine),
      animate(1100, (e) => { rig.glassTilt = lerp(-1.45, 0, e); }),
    ]);
    await glassWrap.showLeech(true);
  };

  /** Hand hovering over the plate, index finger out (glass is put away). */
  rig.pointAtPlate = async ({ instant = false } = {}) => {
    glassWrap.visible = false;
    rig.setHand('R', 'point');
    await rig.tweenPose(point, 800, Ease.inOutSine, instant);
  };
  rig.hideGlass = (v = true) => { glassWrap.visible = !v; return Promise.resolve(); };
  rig.holdGlass = async ({ instant = false } = {}) => {
    glassWrap.visible = true;
    rig.setHand('R', 'grip');
    await rig.tweenPose(hold, 700, Ease.inOutSine, instant);
  };

  humanIdle(rig, { breath: 0.008, sway: 0.004, head: 0.02, speed: 0.7 });
  rig.play('idle');
  rig.apply();
  return rig;
}

// ===========================================================================
// JAKOB (reflection) and the small rower of the intro
// ===========================================================================

const SKIN_JAKOB = '#e0d6ca';
function paintJakob(g, v) {
  const skin = SKIN_JAKOB;
  for (const s of [-1, 1]) {
    eye(g, s * 0.35, 0.03, 0.16, 0.08, s, {
      skin, lid: v === 'blink' ? 1 : 0.5, closed: v === 'blink', droop: 0.25, pupil: 0.55, lw: 6,
      bag: { color: 'rgba(90,80,85,0.35)', depth: 1.4, lines: 1 },
    });
    line(g, [[s * 0.14, 0.2], [s * 0.36, 0.23], [s * 0.58, 0.19]], 10, '#5a3420');
  }
  line(g, [[-0.08, 0.08], [-0.1, -0.16]], 3.5, 'rgba(20,20,20,0.55)');
  if (v === 'talk') blob(g, [[-0.15, -0.56], [0, -0.53], [0.15, -0.56], [0, -0.66]], '#3a1a1a');
  else line(g, [[-0.17, -0.57], [0, -0.555], [0.17, -0.58]], 5.5);
  line(g, [[-0.07, -0.82], [0, -0.84], [0.07, -0.82]], 3, 'rgba(20,20,20,0.45)');
}

function addShortHair(rig, color, line, seed = 9, part = 0.62) {
  const M = rig.mats, J = rig.joints;
  rig.ps.add(J.head, hairCapGeo(rig, { front: 0.29 * Math.PI, side: 0.44 * Math.PI, back: 0.64 * Math.PI, scale: 1.06, top: 0.06, quiff: 0.08 }),
    M.toon('#ffffff', { map: hairTex(color, line, seed, part) }), 'hair');
}

function buildJakob({ id = 'jakob', bust = true, seated = false, small = false, hat = false } = {}) {
  const rig = createRig(id);
  const seatH = 0.32;
  skeleton(rig, {
    hipY: seated ? seatH + 0.07 : 0.88, hipX: 0.085, thigh: 0.42, shin: 0.42, waist: 0.04, neckY: 0.54, headY: 0.19,
    shoulderY: 0.49, shoulderX: 0.172, upper: 0.29, fore: 0.26, headR: [0.095, 0.135, 0.105], hatH: hat ? 0.12 : 0,
  });
  const M = rig.mats, J = rig.joints;
  addHead(rig, {
    rx: 0.095, ry: 0.135, rz: 0.105, jaw: 0.3, chin: 0.18, crown: 0.12, flat: 0.12, skin: SKIN_JAKOB,
    nose: { top: 0.07, y: -0.27, len: 0.026, w: 0.0125 }, earY: -0.03, paint: paintJakob, faceSize: small ? 128 : FS,
  });
  const shirt = M.toon('#ffffff', { map: clothTex('#e6e0d3', { seed: 41, folds: 10, ink: 0.35 }) });
  const trousers = M.toon('#ffffff', { map: clothTex('#5a4a3a', { seed: 42, folds: 10, ink: 0.5 }) });
  const skin = rig.skinMat;
  rig.ps.add(J.torso, torsoGeo([[0.13, -0.06], [0.133, 0.08], [0.146, 0.22], [0.156, 0.35], [0.16, 0.43], [0.14, 0.49], [0.09, 0.525], [0.045, 0.54]], 0.62), shirt, 'torso');
  for (const s of [-1, 1]) rig.ps.add(J.torso, place(sphere(0.04, 0.025, 0.008, 10, 6), [s * 0.045, 0.5, 0.075], [0.6, s * 0.5, s * 0.6]), shirt, 'torso');
  rig.ps.add(J.torso, place(sphere(0.032, 0.06, 0.02, 10, 8), [0, 0.48, 0.074], [-0.3, 0, 0]), skin, 'torso');
  addButtons(rig, J.torso, [0.1, 0.2, 0.3, 0.39], 0.094, M.toon('#2a2622', { outline: false }));
  if (small) {
    // the rower wears a red vest
    rig.ps.add(J.torso, torsoGeo([[0.142, 0.02], [0.148, 0.1], [0.158, 0.22], [0.166, 0.35], [0.168, 0.43], [0.15, 0.49], [0.1, 0.52]], 0.66, 18, 0.55, TAU - 1.1), M.toon('#9034b9', { side: THREE.DoubleSide }), 'torso');
  }
  rig.ps.add(J.body, torsoGeo([[0.12, -0.16], [0.145, -0.1], [0.15, -0.02], [0.138, 0.06]], 0.72), trousers, 'hips');
  addArms(rig, { upper: [0.054, 0.047], upperMat: shirt, fore: [0.036, 0.029], foreMat: skin, cuffMat: shirt, cuffR: 0.016, cuffY: -0.005 });
  addLegs(rig, {
    thigh: [0.075, 0.063], thighMat: trousers, shin: [0.058, 0.047], shinMat: trousers,
    foot: { w: 0.045, h: 0.042, l: 0.115, z: 0.045 }, footMat: M.toon('#2e241c'),
  });
  addShortHair(rig, '#8a4a2a', '#4a2412', 9, 0.65);
  if (hat) {
    const hatJ = rig.addJoint('hat', J.head, [0, 0.06, -0.005]);
    rig.parts.hat = hatJ;
    rig.pose.hat = [-0.1, 0, 0];
    const felt = M.toon('#6a4a32');
    rig.ps.add(hatJ, lathe([[0.0001, 0.11], [0.07, 0.108], [0.095, 0.08], [0.1, 0.0]], 18), felt, 'hat');
    rig.ps.add(hatJ, lathe([[0.1, 0.0], [0.155, 0.0], [0.16, 0.015], [0.1, 0.012]], 20), felt, 'hat');
  }
  addHands(rig, skin, 1, ['relax', 'grip']);
  rig.ps.build(rig);

  rig.setBust = (v = true) => { rig.showTag('leg', !v); rig.showTag('hips', !v); };
  const stand = { armL: [0.05, 0, 0.1], elbowL: [-0.15, 0, 0], armR: [0.05, 0, -0.1], elbowR: [-0.15, 0, 0], head: [0.05, 0, 0] };
  rig.setPose(stand);
  if (bust && !seated) rig.setBust(true);
  humanIdle(rig, { breath: 0.01, sway: 0.006, head: 0.015, speed: 0.7 });
  rig.play('idle');
  rig.apply();
  return rig;
}

// ===========================================================================
// SOUL — Caroline's corrupted soul: black fuzzy silhouette with white eyes
// ===========================================================================

function buildSoul() {
  const rig = createRig('soul');
  const M = rig.mats;
  skeleton(rig, {
    hipY: 0.95, hipX: 0.07, thigh: 0.45, shin: 0.45, waist: 0.05, neckY: 0.64, headY: 0.19,
    shoulderY: 0.6, shoulderX: 0.15, upper: 0.32, fore: 0.3, headR: [0.12, 0.13, 0.12],
  });
  const J = rig.joints;
  const black = M.unlit('#060606');
  const geos = [];
  // robe: long dress flaring on the ground
  const robe = lathe([[0.3, -0.95], [0.26, -0.85], [0.2, -0.55], [0.15, -0.2], [0.12, 0.05], [0.125, 0.15]], 22).scale(1, 1, 0.8);
  rig.ps.add(J.body, robe, black, 'body');
  const torso = torsoGeo([[0.12, -0.05], [0.115, 0.15], [0.13, 0.4], [0.14, 0.56], [0.1, 0.63], [0.04, 0.68]], 0.7);
  rig.ps.add(J.torso, torso, black, 'body');
  rig.ps.add(J.neck, place(limbGeo(0.04, 0.045, 0.22, 10), [0, 0.2, 0]), black, 'body');
  const headG = sphere(0.125, 0.135, 0.12, 22, 16);
  rig.ps.add(J.head, headG, black, 'body');
  for (const side of ['L', 'R']) {
    rig.ps.add(J['arm' + side], limbGeo(0.04, 0.032, 0.32, 10), black, 'body');
    rig.ps.add(J['elbow' + side], limbGeo(0.03, 0.022, 0.3, 10), black, 'body');
    // pointed fingers
    for (let i = 0; i < 3; i++) rig.ps.add(J['hand' + side], place(new THREE.ConeGeometry(0.009, 0.08, 6), [0, -0.05, (i - 1) * 0.012], [0, 0, (side === 'L' ? -1 : 1) * 0.1 * (i - 1)]).rotateX(Math.PI), black, 'body');
    rig.ps.add(J['hand' + side], place(sphere(0.022, 0.035, 0.03), [0, -0.02, 0]), black, 'body');
  }
  rig.ps.build(rig);
  const bodyMeshes = rig.tags.body;
  // fuzz: spikes sampled over every surface
  const spikeGeo = new THREE.ConeGeometry(0.0035, 1, 4).translate(0, 0.5, 0);
  const COUNT = 900;
  const spikes = new THREE.InstancedMesh(spikeGeo, black, COUNT);
  spikes.name = 'soul_fuzz';
  rig.root.add(spikes);
  rig.apply(true, true);
  rig.root.updateMatrixWorld(true);
  const _pos = V(), _nrm = V(), _mm = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _sc = V();
  let n = 0;
  const weights = bodyMeshes.map((m) => (m.parent === J.head ? 4 : m.parent === J.body ? 1.2 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const rnd = rng(77);
  // spikes are attached per-mesh so they follow the limbs: use one InstancedMesh per joint group
  spikes.visible = false;
  const fuzzes = [];
  for (let mi = 0; mi < bodyMeshes.length; mi++) {
    const mesh = bodyMeshes[mi];
    const count = Math.round((COUNT * weights[mi]) / total);
    const sampler = new MeshSurfaceSampler(mesh).setRandomGenerator(rnd).build();
    const inst = new THREE.InstancedMesh(spikeGeo, black, count);
    inst.name = 'soul_fuzz';
    for (let i = 0; i < count; i++) {
      sampler.sample(_pos, _nrm);
      const head = mesh.parent === J.head;
      const len = head ? 0.03 + rnd() * 0.035 : 0.012 + rnd() * 0.022;
      _qq.setFromUnitVectors(_UP, _nrm.normalize());
      _mm.compose(_pos, _qq, _sc.set(1, len, 1));
      inst.setMatrixAt(i, _mm);
      n++;
    }
    mesh.parent.add(inst);
    fuzzes.push(inst);
  }
  void n;
  // eyes
  const eyeMat = M.unlit('#ffffff');
  const glowTex = cachedTex('soulglow', () => canvasTexture(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, { wrap: false }));
  const eyes = new THREE.Group(); eyes.name = 'soul_eyes';
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(sphere(0.021, 0.024, 0.01, 14, 10), eyeMat);
    e.position.set(s * 0.042, 0.015, 0.112);
    eyes.add(e);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
    glow.scale.set(0.11, 0.11, 0.11);
    glow.position.copy(e.position).add(V(0, 0, 0.01));
    eyes.add(glow);
  }
  J.head.add(eyes);
  // name the body group as required
  J.body.name = 'soul_body';
  const pose = {
    body: [0, 0, 0], torso: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
    armL: [0.02, 0, 0.13], elbowL: [-0.08, 0, 0], handL: [0, 0, 0],
    armR: [0.02, 0, -0.13], elbowR: [-0.08, 0, 0], handR: [0, 0, 0],
  };
  rig.setPose(pose);
  const ph = Math.random() * 10;
  rig._idleFn = (t, I) => {
    I.body[2] += Math.sin(t * 0.7 + ph) * 0.01;
    I.head[2] += Math.sin(t * 0.9 + ph) * 0.03;
    I.head[1] += Math.sin(t * 0.37 + ph) * 0.05;
    I.armL[2] += Math.sin(t * 0.8 + ph) * 0.02;
    I.armR[2] -= Math.sin(t * 0.8 + ph + 1) * 0.02;
  };
  let blinkT = 3;
  rig._upd.push((dt) => {
    blinkT -= dt;
    const closing = blinkT < 0.12;
    eyes.scale.y = closing ? 0.15 : 1;
    if (blinkT < 0) blinkT = 3 + Math.random() * 4;
  });
  rig.face = null;
  rig.headTags = ['body'];

  /** Old-film flicker out (~1 s); resolves hidden. */
  rig.vanish = async ({ instant = false } = {}) => {
    if (instant) { rig.root.visible = false; return; }
    const r = rng(5);
    let next = 0;
    await animate(1000, (e) => {
      if (e >= next) {
        rig.root.visible = r() > e * 0.9;
        rig.root.position.x = (r() - 0.5) * 0.04 * e;
        next = e + 0.04 + r() * 0.06;
      }
    }, Ease.linear);
    rig.root.visible = false;
    rig.root.position.x = 0;
  };
  rig.appear = ({ instant = true } = {}) => { rig.root.visible = true; return Promise.resolve(void instant); };
  rig.play('idle');
  rig.apply();
  return rig;
}

// ===========================================================================
// MEMORY VISION FAMILY — shape helpers
// 记忆场景里戴动物面具的一家人（参考原作 11:40 前后的画面）：面具和衣服都用“关键截面 + 样条放样”
// 做成连续光滑的曲面，再加手绘笔触贴图和墨线描边。
// ===========================================================================

const crs = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
};
/** Superellipse coordinate: n = 2 ellipse, n > 2 boxier. */
const sePow = (c, n) => Math.sign(c) * Math.pow(Math.abs(c), 2 / n);

/** Catmull-Rom densify of key objects (every key has the same numeric fields), `steps` samples per span. */
function densify(keys, steps) {
  const fields = Object.keys(keys[0]);
  const out = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps, o = {};
      for (const f of fields) o[f] = crs(k0[f], k1[f], k2[f], k3[f], t);
      out.push(o);
    }
  }
  out.push({ ...keys[keys.length - 1] });
  return out;
}

/**
 * Smooth indexed surface from rings ({ pts: Vector3[radial + 1], c: inside reference point, v }).
 * poles: [start, end] cap tips (or null). Every triangle is wound to face away from its ring's `c`.
 */
function ringsGeo(rings, { closed = true, poles = [null, null] } = {}) {
  const radial = rings[0].pts.length - 1, RS = radial + 1;
  const pos = [], uv = [], refs = [];
  for (const r of rings) for (let j = 0; j <= radial; j++) { const p = r.pts[j]; pos.push(p.x, p.y, p.z); uv.push(j / radial, r.v); refs.push(r.c); }
  const tris = [];
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * RS + j, b = a + 1, c = a + RS, d = c + 1;
    tris.push([a, c, b], [b, c, d]);
  }
  const addPole = (p, ri, inner, v) => {
    if (!p) return;
    const pi = pos.length / 3;
    pos.push(p.x, p.y, p.z); uv.push(0.5, v); refs.push(rings[inner].c);
    for (let j = 0; j < radial; j++) tris.push([pi, ri * RS + j, ri * RS + j + 1]);
  };
  addPole(poles[0], 0, Math.min(rings.length - 1, 2), 0);
  addPole(poles[1], rings.length - 1, Math.max(0, rings.length - 3), 1);
  const idx = [], A = V(), B = V(), C = V(), N = V(), Q = V();
  for (const [a, b, c] of tris) {
    A.fromArray(pos, a * 3); B.fromArray(pos, b * 3); C.fromArray(pos, c * 3);
    N.subVectors(B, A).cross(Q.subVectors(C, A));
    Q.copy(A).add(B).add(C).divideScalar(3).sub(refs[a]);
    if (N.dot(Q) < 0) idx.push(a, c, b); else idx.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (closed) {
    const n = g.attributes.normal;
    for (let i = 0; i < rings.length; i++) {
      const a = i * RS, b = a + radial;
      const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
      n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
    }
  }
  return g;
}

/**
 * Closed head / snout / beak along a spine in the YZ plane.
 * keys: [{ y, z, w, h, n = 2, x = 0 }] — w: half-width along X, h: half-size across the spine (up), n: superellipse.
 * cap = [start, end]: rounded cap length as a fraction of the end section's smaller half-size.
 * Returns { geo, at(z, th, lift) → { p, n } }  (th: 0 = +X side, π/2 = top, π = −X side, 3π/2 = bottom;
 * uv: u = th / 2π, v = 0 at the back cap … 1 at the front cap).
 */
function spineLoft(keys, { radial = 36, steps = 6, cap = [1, 1], capRings = 5 } = {}) {
  const S = densify(keys.map((k) => ({ x: 0, n: 2, ...k })), steps);
  const F = S.map((s, i) => {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
    const ty = b.y - a.y, tz = b.z - a.z, l = Math.hypot(ty, tz) || 1;
    return { ...s, ty: ty / l, tz: tz / l };
  });
  const pointOn = (f, th, scale = 1, shift = 0, out = V()) => {
    const sx = sePow(Math.cos(th), f.n) * f.w * scale, su = sePow(Math.sin(th), f.n) * f.h * scale;
    return out.set(f.x + sx, f.y + f.ty * shift + f.tz * su, f.z + f.tz * shift - f.ty * su);
  };
  const ring = (f, scale, shift) => ({
    pts: Array.from({ length: radial + 1 }, (_, j) => pointOn(f, (j / radial) * TAU, scale, shift)),
    c: V(f.x, f.y, f.z), sc: V(f.x, f.y + f.ty * shift, f.z + f.tz * shift),
  });
  const f0 = F[0], f1 = F[F.length - 1];
  const c0 = cap[0] * Math.min(f0.w, f0.h), c1 = cap[1] * Math.min(f1.w, f1.h);
  const rings = [];
  for (let k = capRings - 1; k >= 1; k--) { const ph = (k / capRings) * Math.PI / 2; rings.push(ring(f0, Math.cos(ph), -c0 * Math.sin(ph))); }
  for (const f of F) rings.push(ring(f, 1, 0));
  for (let k = 1; k < capRings; k++) { const ph = (k / capRings) * Math.PI / 2; rings.push(ring(f1, Math.cos(ph), c1 * Math.sin(ph))); }
  const p0 = V(f0.x, f0.y - f0.ty * c0, f0.z - f0.tz * c0), p1 = V(f1.x, f1.y + f1.ty * c1, f1.z + f1.tz * c1);
  // v = arc length along the (shifted) ring centres
  const chain = [p0, ...rings.map((r) => r.sc), p1];
  const acc = [0];
  for (let i = 1; i < chain.length; i++) acc.push(acc[i - 1] + chain[i].distanceTo(chain[i - 1]));
  const total = acc[acc.length - 1] || 1;
  rings.forEach((r, i) => { r.v = acc[i + 1] / total; });
  const geo = ringsGeo(rings, { poles: [p0, p1] });
  /** Surface point + outward normal at spine z (monotonic along the spine) and angle th. */
  const at = (z, th, lift = 0) => {
    let i = 0;
    while (i < F.length - 2 && F[i + 1].z < z) i++;
    const a = F[i], b = F[i + 1], k = clamp((z - a.z) / ((b.z - a.z) || 1), 0, 1);
    const f = {};
    for (const key of ['x', 'y', 'z', 'w', 'h', 'n', 'ty', 'tz']) f[key] = lerp(a[key], b[key], k);
    const p = pointOn(f, th);
    const nx = Math.cos(th) / f.w, nu = Math.sin(th) / f.h;
    const n = V(nx, f.tz * nu, -f.ty * nu).normalize();
    return { p: p.addScaledVector(n, lift), n };
  };
  return { geo, at };
}

/**
 * Clothing surface: rings in XZ planes stacked along y (keys bottom → top).
 * keys: [{ y, w, d, cx = 0, cz = 0, n = 2, gap = 0, arc = 0 }] — w/d: half-sizes along X/Z; θ = 0 is the front (+z).
 * gap: half-angle of a front opening; arc > 0 instead keeps only a front panel θ ∈ [−arc, arc].
 * pleat(th, k) → radius offset (folds), drop(th, k) → y offset (hem shapes); k = 0 bottom … 1 top.
 * cap: 'top' | 'bottom' | 'both' (closed rings only).
 */
function ringLoft(keys, { radial = 40, steps = 4, pleat = null, drop = null, cap = null } = {}) {
  const S = densify(keys.map((k) => ({ cx: 0, cz: 0, n: 2, gap: 0, arc: 0, ...k })), steps);
  const closed = S.every((s) => s.gap <= 0.001 && s.arc <= 0.001);
  let len = 0;
  const rings = S.map((s, i) => {
    if (i) len += Math.abs(s.y - S[i - 1].y);
    const k = i / (S.length - 1);
    const a0 = s.arc > 0.001 ? -s.arc : Math.max(0, s.gap), a1 = s.arc > 0.001 ? s.arc : TAU - Math.max(0, s.gap);
    const pts = [];
    for (let j = 0; j <= radial; j++) {
      const th = a0 + (j / radial) * (a1 - a0);
      const m = 1 + (pleat ? pleat(th, k) : 0);
      pts.push(V(s.cx + sePow(Math.sin(th), s.n) * s.w * m, s.y + (drop ? drop(th, k) : 0), s.cz + sePow(Math.cos(th), s.n) * s.d * m));
    }
    return { pts, c: V(s.cx, s.y, s.cz), v: len };
  });
  rings.forEach((r) => { r.v /= len || 1; });
  const poles = [null, null];
  if (closed && (cap === 'bottom' || cap === 'both')) poles[0] = rings[0].c.clone();
  if (closed && (cap === 'top' || cap === 'both')) poles[1] = rings[rings.length - 1].c.clone();
  return ringsGeo(rings, { closed, poles });
}

/** Thin ribbon along points (collar bands, sashes, wrap collars); nrm(p, out) = normal of the surface it lies on. */
function ribbonGeo(points, width, { seg = 28, nrm = null, lift = 0.004, widthFn = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : V(p[0], p[1], p[2]))));
  const pos = [], uv = [], idx = [], P = V(), T = V(), N = V(), Sd = V();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, P); curve.getTangentAt(t, T);
    if (nrm) nrm(P, N); else N.set(P.x, 0, P.z).normalize();
    Sd.crossVectors(T, N).normalize();
    const w = ((widthFn ? widthFn(t) : 1) * width) / 2;
    for (const s of [-1, 1]) { pos.push(P.x + N.x * lift + Sd.x * w * s, P.y + N.y * lift + Sd.y * w * s, P.z + N.z * lift + Sd.z * w * s); uv.push((s + 1) / 2, t); }
    if (i < seg) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Ear / leaf: pointed oval outline extruded thin; base at the origin, tip at +y (length L), faces ±z (cup > 0: +z face concave). */
function leafGeo(L, W, { at = 0.42, depth = 0.012, cup = 0, baseW = 0.55, tipW = 0.08 } = {}) {
  const s = new THREE.Shape();
  s.moveTo(-W * baseW, 0);
  s.bezierCurveTo(-W * 1.05, L * at * 0.6, -W * 1.0, L * at * 1.35, -W * tipW, L * 0.97);
  s.quadraticCurveTo(0, L * 1.02, W * tipW, L * 0.97);
  s.bezierCurveTo(W * 1.0, L * at * 1.35, W * 1.05, L * at * 0.6, W * baseW, 0);
  s.quadraticCurveTo(0, -W * 0.25, -W * baseW, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.35, bevelSize: depth * 0.45, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  if (cup) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) / W; p.setZ(i, p.getZ(i) - cup * x * x * W); }
    g.computeVertexNormals();
  }
  return g;
}

/** Place geo so its local +y points along `dir` and local +z faces `face`; origin moves to `at`. */
function orient(geo, at, dir, face) {
  const Y = V(dir[0], dir[1], dir[2]).normalize();
  const Z = V(face[0], face[1], face[2]); Z.addScaledVector(Y, -Z.dot(Y)).normalize();
  const X = V().crossVectors(Y, Z);
  return geo.applyMatrix4(new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(at.x, at.y, at.z));
}

/** Short hand-drawn fur / feather strokes running along v (snout → back on spine lofts). paint(g, w, h, r) pre-colours regions. */
function furTex(key, base, { seed = 1, dark = shade(base, -0.28), light = shade(base, 0.14), n = 280, len = 13, paint = null } = {}) {
  return cachedTex(`fur:${key}`, () => canvasTexture(256, 256, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    if (paint) paint(g, w, h, r);
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, l = len * (0.5 + r()), a = (r() - 0.5) * 0.6;
      g.strokeStyle = r() < 0.62 ? dark : light; g.globalAlpha = 0.28 + r() * 0.42; g.lineWidth = 0.8 + r() * 1.3;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.sin(a) * l * 0.5 + (r() - 0.5) * 3, y + l * 0.5, x + Math.sin(a) * l, y + l); g.stroke();
    }
    g.globalAlpha = 1;
  }));
}

/** Soft radial blob of colour on a canvas (texture regions). */
function softSpot(g, x, y, rx, ry, color, alpha = 1) {
  g.save(); g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, color); gr.addColorStop(0.6, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = alpha; g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill();
  g.restore(); g.globalAlpha = 1;
}

/**
 * Mask eye sitting on a surface point (p, outward normal n): dark almond (or coloured iris with a pupil),
 * optional rim, heavy upper lid (lid = fraction covered) with an ink lid line. side ±1 mirrors the tilt.
 */
function maskEye(add, M, p, n, o = {}) {
  const { rx = 0.016, ry = 0.011, tilt = 0, side = 1, color = '#231f1d', iris = null, pupil = '#111111', lid = 0, lidColor = '#888888', rim = null, rimK = 1.4, line = true } = o;
  const Z = n.clone().normalize(), X = V().crossVectors(V(0, 1, 0), Z).normalize(), Y = V().crossVectors(Z, X);
  const m = new THREE.Matrix4().makeBasis(X, Y, Z).multiply(new THREE.Matrix4().makeRotationZ(tilt * side)).setPosition(p.x, p.y, p.z);
  const put = (geo, mat) => add(geo.applyMatrix4(m), mat);
  if (rim) put(sphere(rx * rimK, ry * rimK, 0.004, 18, 10), M.toon(rim, { outline: false }));
  put(place(sphere(rx, ry, 0.005, 20, 10), [0, 0, 0.002]), M.toon(color, { outline: 0.003 }));
  if (iris) {
    put(place(sphere(ry * 0.92, ry * 0.92, 0.003, 18, 8), [0, -ry * 0.05, 0.0055]), M.toon(iris, { outline: false }));
    put(place(sphere(ry * 0.42, ry * 0.42, 0.003, 14, 8), [0, -ry * 0.05, 0.0075]), M.toon(pupil, { outline: false }));
    put(place(sphere(ry * 0.14, ry * 0.14, 0.002, 8, 6), [-ry * 0.22, ry * 0.2, 0.0095]), M.toon('#f4f1ea', { outline: false }));
  }
  if (lid > 0) {
    // upper lid: the top arc of the eye closed by a slightly sagging lid edge
    const h = ry * (1 - 2 * lid), s = new THREE.Shape();
    s.moveTo(-rx * 1.08, -ry * 0.05);
    s.absellipse(0, 0, rx * 1.08, ry * 1.12, Math.PI, 0, true);
    s.quadraticCurveTo(0, h - ry * 0.18, -rx * 1.08, -ry * 0.05);
    put(place(new THREE.ShapeGeometry(s, 16), [0, 0, 0.0105]), M.toon(lidColor, { outline: false, side: THREE.DoubleSide }));
    if (line) put(taperTube([[-rx * 1.1, -ry * 0.02, 0.011], [0, h - ry * 0.1, 0.012], [rx * 1.1, ry * 0.05, 0.011]], 0.0022, 0.0016, 12, 5), M.toon('#151515', { outline: false }));
  }
}

// ===========================================================================
// MASKS (memory vision) — buildMask(id, rig) builds the mask once; rig.setMask() shows / hides it
// ===========================================================================

/** Boar (Gerard): long bristly head, flat pink snout disc, upturned tusks, small mean eyes, mask string tied at the back. */
function maskBoar(add, M) {
  const fur = M.toon('#ffffff', { map: furTex('boar', '#8c5737', { seed: 201, dark: '#4c2a18', light: '#b47d55', n: 360, len: 12,
    paint: (g, w, h) => {
      // darker ridge along the top (u = 0.25) and lighter jowls underneath (u = 0.75)
      softSpot(g, w * 0.25, h * 0.55, w * 0.14, h * 0.6, '#6e4128', 0.8);
      softSpot(g, w * 0.75, h * 0.35, w * 0.16, h * 0.4, '#a87252', 0.7);
    } }) });
  const head = spineLoft([
    { y: 0.03, z: -0.158, w: 0.072, h: 0.078 },
    { y: 0.025, z: -0.118, w: 0.12, h: 0.128 },
    { y: 0.012, z: -0.045, w: 0.143, h: 0.153 },
    { y: -0.004, z: 0.035, w: 0.136, h: 0.144 },
    { y: -0.03, z: 0.11, w: 0.108, h: 0.113, n: 2.2 },
    { y: -0.048, z: 0.175, w: 0.084, h: 0.083, n: 2.4 },
    { y: -0.056, z: 0.232, w: 0.07, h: 0.064, n: 2.5 },
    { y: -0.058, z: 0.262, w: 0.067, h: 0.06, n: 2.5 },
  ], { radial: 40, steps: 6, cap: [1, 0.12] });
  add(head.geo, fur);
  maskNeck(add, fur, { top: -0.08, bottom: -0.2, r: 0.088, cz: -0.025 });
  // snout disc + nostrils
  add(place(new THREE.CylinderGeometry(1, 1, 0.016, 28), [0, -0.058, 0.266], [Math.PI / 2, 0, 0], [0.069, 1, 0.062]), M.toon('#c08a72'));
  for (const s of [-1, 1]) add(place(sphere(0.011, 0.016, 0.005, 12, 8), [s * 0.024, -0.06, 0.275], [0, 0, s * 0.25]), M.toon('#3a1e16', { outline: false }));
  const dark = M.toon('#2a1810', { outline: false });
  for (const s of [-1, 1]) {
    const th = s > 0 ? -0.62 : Math.PI + 0.62;
    // mouth line along the lower jaw
    add(taperTube([head.at(0.255, th, 0.003).p, head.at(0.2, th, 0.004).p, head.at(0.14, th - s * 0.05, 0.004).p, head.at(0.085, th - s * 0.08, 0.003).p], 0.0042, 0.0022, 16, 5), dark);
    // tusks: from the corner of the mouth, curving out, up and back
    const b = head.at(0.165, th + s * 0.05, -0.004).p;
    add(taperTube([b, b.clone().add(V(s * 0.026, 0.03, 0.014)), b.clone().add(V(s * 0.043, 0.072, 0.004)), b.clone().add(V(s * 0.037, 0.104, -0.022))], 0.0125, 0.0022, 14, 8), M.toon('#eee8d9'));
    // small mean eye under a heavy brow
    const e = head.at(0.072, s > 0 ? 0.42 : Math.PI - 0.42, 0.0015);
    maskEye(add, M, e.p, e.n, { rx: 0.0135, ry: 0.0105, tilt: -0.25, side: s, color: '#1d1512', lid: 0.42, lidColor: '#7a4a2e', rim: '#b9896a', rimK: 1.45 });
    add(taperTube([head.at(0.045, s > 0 ? 0.52 : Math.PI - 0.52, 0.004).p, head.at(0.075, s > 0 ? 0.6 : Math.PI - 0.6, 0.008).p, head.at(0.105, s > 0 ? 0.55 : Math.PI - 0.55, 0.004).p], 0.007, 0.004, 10, 6), M.toon('#4a2a1a'));
    // pointed ears with a pale inside, set high on the skull
    const ea = head.at(-0.075, s > 0 ? 1.05 : Math.PI - 1.05, -0.012);
    add(orient(leafGeo(0.118, 0.045, { at: 0.32, depth: 0.014, cup: 0.25, baseW: 0.8 }), ea.p, [s * 0.42, 0.86, -0.18], [s * 0.35, 0.05, 0.94]), fur);
    add(orient(place(leafGeo(0.082, 0.026, { at: 0.35, depth: 0.004, baseW: 0.8 }), [0, 0.012, 0.009]), ea.p, [s * 0.42, 0.86, -0.18], [s * 0.35, 0.05, 0.94]), M.toon('#c99a7c', { outline: false }));
  }
  // bristly mane along the crown and down the back of the head
  const mane = M.toon('#3f2416', { outline: 0.003 });
  for (let i = 0; i < 9; i++) {
    const z = 0.07 - i * 0.026, a = head.at(z, Math.PI / 2, -0.004);
    add(orient(place(new THREE.ConeGeometry(0.011, 0.05 - Math.abs(i - 4) * 0.003, 6), [0, 0.022, 0], [0, 0, 0], [1, 1, 0.45]), a.p, [0, 0.75, -0.66], [1, 0, 0]), mane);
  }
  // white mask string around the back of the head, tied in a bow
  const str = M.toon('#ece9e1', { outline: 0.0025 });
  const pts = [];
  for (let i = 0; i <= 14; i++) { const a = 0.25 + (i / 14) * (Math.PI - 0.5); pts.push(V(Math.cos(a) * 0.149, -0.012 + Math.sin(a) * 0.006, -0.045 - Math.sin(a) * 0.122)); }
  add(taperTube(pts, 0.0035, 0.0035, 40, 5), str);
  const knot = V(0, -0.006, -0.168);
  add(place(sphere(0.008, 0.007, 0.006, 10, 8), [knot.x, knot.y, knot.z]), str);
  for (const s of [-1, 1]) {
    add(place(new THREE.TorusGeometry(0.017, 0.0035, 6, 16), [knot.x + s * 0.018, knot.y + 0.006, knot.z - 0.004], [0.1, s * 0.2, s * 0.35], [1, 0.62, 1]), str);
    add(taperTube([knot, knot.clone().add(V(s * 0.012, -0.03, -0.004)), knot.clone().add(V(s * 0.02, -0.062, 0.004))], 0.0032, 0.0028, 10, 5), str);
  }
}

/** Pheasant / owl-like bird mask (Elizabeth): round feathered head, white throat bib, heavy-lidded eyes, small hooked beak. */
function maskPheasant(add, M) {
  // sphere uv: front (+z) at u = 0.25, v = 0 bottom … 1 top (canvas y = (1 − v) · h)
  const tex = cachedTex('mask:pheasant', () => canvasTexture(512, 256, (g, w, h) => {
    const r = rng(207);
    g.fillStyle = '#b08752'; g.fillRect(0, 0, w, h);
    softSpot(g, w * 0.25, h * 0.08, w * 0.4, h * 0.14, '#94703f', 0.8);              // darker crown
    softSpot(g, w * 0.25, h * 0.42, w * 0.075, h * 0.12, '#c9ab7a', 0.9);             // paler face around the eyes
    g.lineCap = 'round';
    for (let i = 0; i < 520; i++) {                                                     // feather streaks
      const x = r() * w, y = r() * h * 0.92, l = 5 + r() * 9;
      g.strokeStyle = r() < 0.65 ? 'rgba(84,58,28,0.6)' : 'rgba(232,212,170,0.55)'; g.lineWidth = 1 + r() * 1.2;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (r() - 0.5) * 4, y + l * 0.5, x + (r() - 0.5) * 3, y + l); g.stroke();
    }
    // white throat bib from under the beak down to the collar
    g.fillStyle = '#ece9e2';
    g.beginPath(); g.moveTo(w * 0.1, h); g.bezierCurveTo(w * 0.12, h * 0.7, w * 0.19, h * 0.56, w * 0.25, h * 0.55);
    g.bezierCurveTo(w * 0.31, h * 0.56, w * 0.38, h * 0.7, w * 0.4, h); g.closePath(); g.fill();
    for (let i = 0; i < 40; i++) {
      const x = w * (0.18 + r() * 0.14), y = h * (0.66 + r() * 0.3);
      g.strokeStyle = 'rgba(150,140,128,0.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + 5); g.stroke();
    }
  }));
  const def = (d) => {
    const v = V(d.x * 0.11, d.y * 0.114, d.z * 0.106);
    if (d.y > 0) v.y += 0.016 * Math.pow(d.y, 10);                             // a faint peak on the crown
    if (d.z > 0) v.z *= 1 - 0.2 * (1 - d.y * d.y) * Math.pow(d.z, 0.8);        // flat face
    if (d.y < 0) { v.x *= 1 - 0.1 * d.y * d.y; v.z *= 1 + 0.04 * -d.y; }      // rounded jaw tapering into the neck
    v.y += 0.012;
    return v;
  };
  const geo = new THREE.SphereGeometry(1, 44, 32);
  const pos = geo.attributes.position, d = V();
  for (let i = 0; i < pos.count; i++) { d.fromBufferAttribute(pos, i); pos.setXYZ(i, ...def(d).toArray()); }
  geo.computeVertexNormals();
  add(geo, M.toon('#ffffff', { map: tex }));
  maskNeck(add, M.toon('#e9e5dd'), { top: -0.06, bottom: -0.16, r: 0.06, cz: 0.0 });
  const surf = (x, y, z, lift = 0) => {
    const dir = V(x, y, z).normalize(), p = def(dir);
    const e = 0.01, a = def(V(x + e, y, z).normalize()), b = def(V(x, y + e, z).normalize());
    const n = V().crossVectors(a.sub(p), b.sub(p)).normalize();
    if (n.dot(p) < 0) n.negate();
    return { p: p.addScaledVector(n, lift), n };
  };
  for (const s of [-1, 1]) {
    const e = surf(s * 0.44, 0.16, 0.88, 0.001);
    maskEye(add, M, e.p, e.n, { rx: 0.02, ry: 0.0135, tilt: -0.1, side: s, color: '#2a2320', lid: 0.4, lidColor: '#b9996a', rim: '#6d5230', rimK: 1.28 });
  }
  // small hooked beak between and below the eyes
  const b = surf(0, 0.02, 1, -0.003).p;
  const beak = M.toon('#e0cd8c');
  add(taperTube([b, b.clone().add(V(0, -0.004, 0.017)), b.clone().add(V(0, -0.019, 0.025)), b.clone().add(V(0, -0.034, 0.019))], 0.0135, 0.0018, 14, 8), beak);
  add(place(sphere(0.012, 0.009, 0.01, 12, 8), [b.x, b.y + 0.003, b.z + 0.004]), beak);
  add(taperTube([b.clone().add(V(0, -0.009, 0.022)), b.clone().add(V(0, -0.025, 0.024))], 0.0016, 0.0014, 6, 4), M.toon('#6b5a33', { outline: false }));
}

/** Deer (Nicholas): long tan face sloping down to a black nose, side ears, heavy-lidded eyes, chin tuft, big branching antlers. */
function maskDeer(add, M) {
  const fur = M.toon('#ffffff', { map: furTex('deer', '#c39b63', { seed: 203, dark: '#7b5a33', light: '#e0c79d', n: 300, len: 11,
    paint: (g, w, h) => {
      softSpot(g, w * 0.25, h * 0.12, w * 0.16, h * 0.18, '#e8d8b8', 1);     // pale muzzle (front of the muzzle = top of the spine)
      softSpot(g, w * 0.05, h * 0.16, w * 0.1, h * 0.2, '#dcc59c', 0.8);
      softSpot(g, w * 0.45, h * 0.16, w * 0.1, h * 0.2, '#dcc59c', 0.8);
      softSpot(g, w * 0.75, h * 0.25, w * 0.16, h * 0.3, '#e2cfac', 0.8);     // pale throat
      softSpot(g, w * 0.25, h * 0.55, w * 0.07, h * 0.25, '#9d7443', 0.6);    // darker forehead
    } }) });
  const head = spineLoft([
    { y: 0.052, z: -0.082, w: 0.104, h: 0.106 },
    { y: 0.05, z: -0.045, w: 0.12, h: 0.121 },
    { y: 0.035, z: 0.01, w: 0.123, h: 0.122 },
    { y: 0.002, z: 0.055, w: 0.102, h: 0.098 },
    { y: -0.045, z: 0.085, w: 0.082, h: 0.074, n: 2.2 },
    { y: -0.092, z: 0.1, w: 0.069, h: 0.06, n: 2.4 },
    { y: -0.122, z: 0.106, w: 0.062, h: 0.052, n: 2.4 },
  ], { radial: 40, steps: 6, cap: [1, 0.55] });
  add(head.geo, fur);
  maskNeck(add, fur, { top: -0.05, bottom: -0.2, r: 0.068, cz: -0.03 });
  const ink = M.toon('#1d1714', { outline: false });
  // dark nose pad on the front of the muzzle tip + mouth line
  const np = head.at(0.104, Math.PI / 2, 0).p;
  add(place(sphere(0.036, 0.022, 0.018, 16, 10), [0, np.y - 0.01, np.z - 0.004], [-0.25, 0, 0]), M.toon('#3a3330'));
  for (const s of [-1, 1]) add(place(sphere(0.008, 0.0045, 0.004, 8, 6), [s * 0.015, np.y - 0.014, np.z + 0.012], [-0.2, 0, s * 0.5]), M.toon('#0d0b0a', { outline: false }));
  add(taperTube([V(0, np.y - 0.03, np.z + 0.006), V(0, np.y - 0.046, np.z - 0.002)], 0.0022, 0.0022, 4, 5), ink);
  add(taperTube([V(-0.024, np.y - 0.05, np.z - 0.014), V(0, np.y - 0.046, np.z - 0.002), V(0.024, np.y - 0.05, np.z - 0.014)], 0.0024, 0.0024, 10, 5), ink);
  for (const s of [-1, 1]) {
    const side = s > 0 ? 0 : Math.PI;
    // heavy-lidded eyes on the sides of the face
    const e = head.at(0.035, side + s * 0.42, 0.0015);
    maskEye(add, M, e.p, e.n, { rx: 0.025, ry: 0.0155, tilt: -0.16, side: s, color: '#201b18', lid: 0.42, lidColor: '#b48d58', rim: '#5c4528', rimK: 1.26 });
    // big ears up and out to the sides, pale inside
    const ea = head.at(-0.03, s > 0 ? 0.82 : Math.PI - 0.82, -0.01);
    const dir = [s * 0.86, 0.5, -0.12], face = [s * 0.05, 0.25, 1];
    add(orient(leafGeo(0.16, 0.058, { at: 0.45, depth: 0.012, cup: 0.35, baseW: 0.55 }), ea.p, dir, face), fur);
    add(orient(place(leafGeo(0.124, 0.038, { at: 0.45, depth: 0.004, baseW: 0.55 }), [0, 0.016, 0.009]), ea.p, dir, face), M.toon('#ecdec5', { outline: false }));
  }
  // chin tuft (goatee)
  const beard = M.toon('#6d5638', { outline: 0.0025 });
  const chin = head.at(0.1, -Math.PI / 2, -0.004).p;
  for (const [dx, len, bend] of [[-0.016, 0.06, -0.008], [-0.006, 0.075, -0.003], [0.006, 0.078, 0.004], [0.017, 0.062, 0.01]]) {
    const a = chin.clone().add(V(dx, 0, 0));
    add(taperTube([a, a.clone().add(V(bend * 0.4, -len * 0.5, 0.006)), a.clone().add(V(bend, -len, 0.0))], 0.0075, 0.0015, 10, 5), beard);
  }
  // antlers: a beam curving out and up with candelabra tines
  const bone = M.toon('#ece6d9');
  for (const s of [-1, 1]) {
    const base = head.at(-0.025, s > 0 ? 1.18 : Math.PI - 1.18, -0.008).p;
    const P = (x, y, z) => V(base.x + s * x, base.y + y, base.z + z);
    add(place(sphere(0.024, 0.016, 0.024, 12, 8), [base.x, base.y + 0.004, base.z]), M.toon('#d8cdb8'));   // burr
    const beam = [P(0, 0, 0), P(0.03, 0.07, -0.012), P(0.09, 0.17, -0.03), P(0.15, 0.29, -0.04), P(0.19, 0.42, -0.035), P(0.205, 0.56, -0.02)];
    add(taperTube(beam, 0.021, 0.0075, 26, 8), bone);
    const tines = [
      [P(0.025, 0.06, -0.01), P(0.035, 0.13, 0.035), P(0.022, 0.2, 0.058)],           // brow tine, forward
      [P(0.09, 0.17, -0.03), P(0.074, 0.27, -0.022), P(0.058, 0.37, -0.012)],          // bez tine, up
      [P(0.15, 0.29, -0.04), P(0.14, 0.39, -0.036), P(0.122, 0.5, -0.03)],            // trez tine, up
      [P(0.19, 0.42, -0.035), P(0.245, 0.49, -0.04), P(0.28, 0.57, -0.035)],          // outer crown point
      [P(0.198, 0.48, -0.03), P(0.17, 0.56, -0.025), P(0.15, 0.63, -0.02)],           // inner crown point
    ];
    for (const t of tines) add(taperTube(t, 0.0125, 0.0045, 12, 6), bone);
  }
}

/** Rabbit (David): white rounded head, big dark almond eyes, pink nose, split lip with buck teeth, tall ears. */
function maskRabbit(add, M) {
  const fur = M.toon('#ffffff', { map: furTex('rabbit', '#ece7dd', { seed: 205, dark: '#a59f97', light: '#ffffff', n: 220, len: 9,
    paint: (g, w, h) => { softSpot(g, w * 0.75, h * 0.3, w * 0.2, h * 0.35, '#e0d9cd', 0.8); } }) });
  const head = spineLoft([
    { y: 0.034, z: -0.085, w: 0.103, h: 0.112 },
    { y: 0.033, z: -0.048, w: 0.121, h: 0.131 },
    { y: 0.025, z: 0.0, w: 0.13, h: 0.138 },
    { y: -0.012, z: 0.05, w: 0.112, h: 0.108 },
    { y: -0.058, z: 0.084, w: 0.086, h: 0.076, n: 2.2 },
    { y: -0.096, z: 0.103, w: 0.062, h: 0.052, n: 2.2 },
    { y: -0.114, z: 0.11, w: 0.048, h: 0.04 },
  ], { radial: 40, steps: 6, cap: [1, 0.7] });
  add(head.geo, fur);
  maskNeck(add, fur, { top: -0.06, bottom: -0.17, r: 0.054, cz: -0.012 });
  const ink = M.toon('#1d1a19', { outline: false });
  // pink nose, Y-shaped split lip and two buck teeth on the front of the muzzle
  const n0 = head.at(0.082, Math.PI / 2, 0.001), mouth = head.at(0.1, Math.PI / 2, 0.001);
  add(orient(new THREE.CylinderGeometry(0.0165, 0.0155, 0.007, 3), n0.p, n0.n.toArray(), [0, -1, 0]), M.toon('#cf9890', { outline: 0.0025 }));
  const m = mouth.p, mn = mouth.n;
  add(taperTube([n0.p.clone().addScaledVector(mn, 0.002).add(V(0, -0.008, 0)), m.clone().addScaledVector(mn, 0.002)], 0.0022, 0.0022, 4, 5), ink);
  for (const s of [-1, 1]) add(taperTube([m.clone().addScaledVector(mn, 0.002), m.clone().add(V(s * 0.011, 0.004, -0.004)), m.clone().add(V(s * 0.022, 0.009, -0.012))], 0.0022, 0.0017, 8, 5), ink);
  for (const s of [-1, 1]) add(orient(new THREE.BoxGeometry(0.011, 0.018, 0.005), m.clone().add(V(s * 0.006, -0.011, -0.002)), [0, 1, 0], mn.toArray()), M.toon('#f8f6f0', { outline: 0.0022 }));
  for (const s of [-1, 1]) {
    const side = s > 0 ? 0 : Math.PI;
    // big dark almond eye holes, slanted
    const e = head.at(0.028, side + s * 0.8, 0.0015);
    maskEye(add, M, e.p, e.n, { rx: 0.032, ry: 0.0215, tilt: -0.26, side: s, color: '#3a3638', lid: 0.1, lidColor: '#ddd7cc', rim: '#5b5658', rimK: 1.15 });
    // tall ears, slightly splayed, pink inside
    const ea = head.at(-0.045, s > 0 ? 1.15 : Math.PI - 1.15, -0.01);
    const dir = [s * 0.2, 1, -0.16], face = [s * 0.12, 0.1, 1];
    add(orient(leafGeo(0.31, 0.054, { at: 0.48, depth: 0.014, cup: 0.4, baseW: 0.55 }), ea.p, dir, face), fur);
    add(orient(place(leafGeo(0.25, 0.033, { at: 0.5, depth: 0.004, baseW: 0.5 }), [0, 0.03, 0.01]), ea.p, dir, face), M.toon('#d8aba1', { outline: false }));
  }
}

/** Pigeon (Margaret): blue-grey round head, orange eyes on the sides, short yellow beak with a white cere. */
function maskPigeon(add, M) {
  const fur = M.toon('#ffffff', { map: furTex('pigeon', '#8e95a0', { seed: 209, dark: '#5f6670', light: '#b6bcc5', n: 200, len: 8,
    paint: (g, w, h) => {
      softSpot(g, w * 0.25, h * 0.55, w * 0.18, h * 0.6, '#727a86', 0.85);        // darker crown
      softSpot(g, w * 0.75, h * 0.95, w * 0.22, h * 0.18, '#6f8a7a', 0.7);        // iridescent throat (back / bottom)
      softSpot(g, w * 0.55, h * 0.92, w * 0.12, h * 0.12, '#8a7090', 0.5);
    } }) });
  const head = spineLoft([
    { y: 0.03, z: -0.1, w: 0.072, h: 0.077 },
    { y: 0.03, z: -0.055, w: 0.099, h: 0.106 },
    { y: 0.02, z: 0.005, w: 0.104, h: 0.11 },
    { y: 0.0, z: 0.055, w: 0.088, h: 0.088 },
    { y: -0.017, z: 0.091, w: 0.061, h: 0.056 },
    { y: -0.025, z: 0.112, w: 0.039, h: 0.034 },
  ], { radial: 40, steps: 6, cap: [1, 0.6] });
  add(head.geo, fur);
  maskNeck(add, fur, { top: -0.05, bottom: -0.17, r: 0.06, cz: -0.004 });
  // beak + white cere
  const b = V(0, -0.024, 0.112);
  add(taperTube([b, b.clone().add(V(0, -0.002, 0.03)), b.clone().add(V(0, -0.007, 0.056)), b.clone().add(V(0, -0.014, 0.066))], 0.0145, 0.0025, 14, 8), M.toon('#d6aa3c'));
  add(taperTube([b.clone().add(V(0, -0.008, 0.036)), b.clone().add(V(0, -0.011, 0.06))], 0.006, 0.002, 6, 5), M.toon('#7a5d22', { outline: false }));
  add(place(sphere(0.017, 0.011, 0.021, 14, 8), [0, b.y + 0.011, b.z + 0.008], [0.25, 0, 0]), M.toon('#ece8de'));
  for (const s of [-1, 1]) {
    const e = head.at(0.03, s > 0 ? 0.3 : Math.PI - 0.3, 0.001);
    maskEye(add, M, e.p, e.n, { rx: 0.0165, ry: 0.0165, side: s, color: '#262222', iris: '#de8c2a', pupil: '#121010', lid: 0.12, lidColor: '#7d8490', rim: '#b9bec6', rimK: 1.35 });
  }
}

/** Furry neck under a mask, down into the collar (the human neck is hidden while a mask is on). */
function maskNeck(add, mat, { top = -0.06, bottom = -0.19, r = 0.06, cz = 0 }) {
  add(ringLoft([{ y: bottom, w: r * 1.08, d: r * 1.04, cz }, { y: (top + bottom) / 2, w: r, d: r * 0.97, cz }, { y: top, w: r * 0.96, d: r * 0.94, cz }], { radial: 24, steps: 2 }), mat);
}

const MASKS = { boar: maskBoar, pheasant: maskPheasant, deer: maskDeer, rabbit: maskRabbit, pigeon: maskPigeon };
const MASK_SCALE = { pheasant: 1.14 };   // 女孩的鸟头面具比她自己的头大一圈（原作里面具占身高约四分之一）

function buildMask(id, rig) {
  const g = new THREE.Group();
  g.name = `mask_${id}`;
  const ps = new PartSet();
  const make = MASKS[id];
  if (make) make((geo, mat) => ps.add(g, geo, mat, 'mask'), rig.mats);
  ps.build({ id: `${rig.id}_mask`, tags: {} });
  g.scale.setScalar(MASK_SCALE[id] || 1);
  return g;
}

// ===========================================================================
// Memory vision family (masked) — bodies
// ===========================================================================

function paintPlain(skin) {
  return (g, v) => {
    for (const s of [-1, 1]) {
      eye(g, s * 0.35, 0.03, 0.15, 0.08, s, { skin, lid: v === 'blink' ? 1 : 0.5, closed: v === 'blink', lw: 6, bag: { lines: 1 } });
      line(g, [[s * 0.14, 0.2], [s * 0.36, 0.23], [s * 0.58, 0.19]], 9);
    }
    line(g, [[-0.15, -0.57], [0, -0.56], [0.15, -0.58]], 5);
  };
}

/** Shirt sleeves rolled up above the elbow: baggy sleeve, thick rolled cuff with folds, bare forearm. */
function rolledArms(rig, { shirt, skin, upper = [0.064, 0.056], fore = [0.044, 0.035] }) {
  const J = rig.joints, D = rig.dims;
  for (const side of ['L', 'R']) {
    rig.ps.add(J['arm' + side], ringLoft([
      { y: -D.upper * 0.84, w: upper[1] * 1.04, d: upper[1] },
      { y: -D.upper * 0.5, w: upper[0] * 1.04, d: upper[0] * 0.98 },
      { y: -D.upper * 0.12, w: upper[0] * 1.02, d: upper[0] },
      { y: upper[0] * 0.55, w: upper[0] * 0.78, d: upper[0] * 0.8 },
      { y: upper[0] * 0.95, w: upper[0] * 0.3, d: upper[0] * 0.32 },
    ], { radial: 18, steps: 3, cap: 'top', pleat: (th, k) => 0.035 * Math.sin(th * 5 + k * 4) * (1 - k) }), shirt, 'arm');
    // rolled cuff: a thick roll with two folds
    rig.ps.add(J['arm' + side], ringLoft([
      { y: -D.upper * 0.98, w: upper[1] * 1.08, d: upper[1] * 1.05 },
      { y: -D.upper * 0.93, w: upper[1] * 1.2, d: upper[1] * 1.16 },
      { y: -D.upper * 0.86, w: upper[1] * 1.16, d: upper[1] * 1.13 },
      { y: -D.upper * 0.8, w: upper[1] * 1.12, d: upper[1] * 1.08 },
    ], { radial: 18, steps: 3, pleat: (th) => 0.05 * Math.sin(th * 3 + 0.7) }), shirt, 'arm');
    rig.ps.add(J['arm' + side], place(new THREE.TorusGeometry(upper[1] * 1.17, 0.0045, 6, 20), [0, -D.upper * 0.895, 0], [Math.PI / 2, 0, 0]), rig.mats.toon('#2a2622', { outline: false }), 'arm');
    // bare forearm with a hint of muscle
    rig.ps.add(J['elbow' + side], ringLoft([
      { y: -D.fore + 0.012, w: fore[1] * 0.92, d: fore[1] * 0.78 },
      { y: -D.fore * 0.55, w: fore[0] * 0.95, d: fore[0] * 0.8 },
      { y: -D.fore * 0.25, w: fore[0] * 1.06, d: fore[0] * 0.92 },
      { y: -0.01, w: fore[0] * 0.95, d: fore[0] * 0.9 },
      { y: fore[0] * 0.6, w: fore[0] * 0.5, d: fore[0] * 0.5 },
    ], { radial: 16, steps: 3, cap: 'both' }), skin, 'arm');
  }
}

/** Straight trousers with turn-ups over shoes (or into boots). */
function trouserLegs(rig, { mat, thigh, shin, shoe, sole, foot, boot = null }) {
  const J = rig.joints, D = rig.dims;
  for (const side of ['L', 'R']) {
    rig.ps.add(J['leg' + side], ringLoft([
      { y: -D.thigh - 0.02, w: thigh[1] * 0.98, d: thigh[1] * 0.92 },
      { y: -D.thigh * 0.5, w: thigh[0] * 0.97, d: thigh[0] * 0.92, cz: 0.004 },
      { y: -0.02, w: thigh[0] * 1.02, d: thigh[0] * 0.98, cz: 0.006 },
      { y: thigh[0] * 0.55, w: thigh[0] * 0.75, d: thigh[0] * 0.75 },
    ], { radial: 18, steps: 3, cap: 'top', pleat: (th, k) => 0.03 * Math.sin(th * 4 + 1 + k * 3) }), mat, 'leg');
    if (boot) {
      const tl = D.shin * (1 - boot.top);
      rig.ps.add(J['knee' + side], ringLoft([
        { y: -tl - 0.03, w: shin[0] * 0.9, d: shin[0] * 0.86 },
        { y: -tl * 0.5, w: shin[0] * 1.0, d: shin[0] * 0.96 },
        { y: 0.02, w: thigh[1] * 1.0, d: thigh[1] * 0.94 },
      ], { radial: 16, steps: 3 }), mat, 'leg');
      rig.ps.add(J['knee' + side], ringLoft([
        { y: -D.shin + 0.03, w: boot.r[1], d: boot.r[1] * 0.98, cz: 0.004 },
        { y: -D.shin * 0.7, w: boot.r[1] * 1.02, d: boot.r[1] },
        { y: -tl + 0.005, w: boot.r[0] * 1.06, d: boot.r[0] * 1.03 },
        { y: -tl + 0.035, w: boot.r[0] * 1.12, d: boot.r[0] * 1.08 },
      ], { radial: 16, steps: 3, cap: 'top' }), shoe, 'leg');
    } else {
      rig.ps.add(J['knee' + side], ringLoft([
        { y: -D.shin + 0.035, w: shin[1] * 1.0, d: shin[1] * 0.95, cz: 0.006 },
        { y: -D.shin * 0.5, w: shin[0] * 0.98, d: shin[0] * 0.94 },
        { y: 0.02, w: thigh[1] * 1.0, d: thigh[1] * 0.94 },
      ], { radial: 16, steps: 3, pleat: (th, k) => 0.035 * Math.sin(th * 3 + 2 + k * 5) * (1 - k) }), mat, 'leg');
      // turn-up
      rig.ps.add(J['knee' + side], place(new THREE.CylinderGeometry(shin[1] * 1.06, shin[1] * 1.08, 0.038, 18), [0, -D.shin + 0.05, 0.006], [0, 0, 0], [1, 1, 0.96]), mat, 'leg');
    }
    // shoe: rounded toe box, heel and a flat sole
    const f = foot;
    rig.ps.add(J['foot' + side], spineLoft([
      { y: -f.h * 0.42, z: -f.l * 0.32, w: f.w * 0.8, h: f.h * 0.5 },
      { y: -f.h * 0.38, z: f.l * 0.05, w: f.w * 0.95, h: f.h * 0.58 },
      { y: -f.h * 0.5, z: f.l * 0.42, w: f.w * 1.02, h: f.h * 0.45 },
      { y: -f.h * 0.62, z: f.l * 0.66, w: f.w * 0.82, h: f.h * 0.3 },
    ], { radial: 20, steps: 3, cap: [0.8, 1] }).geo.translate(0, 0, f.z), shoe, 'leg');
    rig.ps.add(J['foot' + side], place(new THREE.CylinderGeometry(1, 1, 0.016, 18), [0, -f.h * 0.98 - 0.002, f.z + f.l * 0.16], [0, 0, 0], [f.w * 1.02, 1, f.l * 0.56]), sole, 'leg');
  }
}

/** Shirt torso: body loft, open collar with two points, button placket. */
function shirtTorso(rig, { keys, shirt, neck, collarY, button = '#2a2622', buttons }) {
  const J = rig.joints, M = rig.mats;
  rig.ps.add(J.torso, ringLoft(keys, { radial: 40, steps: 4, cap: 'top' }), shirt, 'torso');
  // collar band around the neck (open at the front) + two collar points lying on the chest
  const top = keys[keys.length - 1];
  rig.ps.add(J.torso, ringLoft([
    { y: collarY - 0.012, w: neck[0], d: neck[1], cz: top.cz || 0, gap: 0.42 },
    { y: collarY + 0.032, w: neck[0] * 0.92, d: neck[1] * 0.93, cz: top.cz || 0, gap: 0.38 },
  ], { radial: 24, steps: 2 }), M.toon('#ffffff', { map: shirt.map, side: THREE.DoubleSide }), 'collar');
  // chest surface z at the centre line (linear between keys is close enough for trims)
  const front = (y) => {
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1].y < y) i++;
    const a = keys[i], b = keys[i + 1], k = clamp((y - a.y) / (b.y - a.y), 0, 1);
    return lerp(a.d, b.d, k) + lerp(a.cz || 0, b.cz || 0, k);
  };
  for (const s of [-1, 1]) {
    const b = V(s * neck[0] * 0.42, collarY + 0.018, front(collarY + 0.018) + 0.004);
    const t = V(s * (neck[0] * 0.42 + 0.042), collarY - 0.045, front(collarY - 0.045) + 0.006);
    const dir = t.clone().sub(b);
    rig.ps.add(J.torso, orient(leafGeo(dir.length() * 1.05, 0.024, { at: 0.25, depth: 0.005, baseW: 0.95, tipW: 0.02 }), b, dir.toArray(), [s * 0.2, 0.5, 0.85]), M.toon('#ffffff', { map: shirt.map, outline: 0.0035 }), 'collar');
  }
  // placket + buttons down the front
  const pts = [];
  for (let y = keys[0].y + 0.02; y <= collarY - 0.03; y += 0.04) pts.push(V(0, y, front(y)));
  rig.ps.add(J.torso, ribbonGeo(pts, 0.026, { seg: 20, lift: 0.002, nrm: (p, o) => o.set(0, 0, 1) }), M.toon('#ffffff', { map: shirt.map, side: THREE.DoubleSide, outline: 0.0025 }), 'torso');
  for (const y of buttons) rig.ps.add(J.torso, place(sphere(0.0068, 0.0068, 0.0035, 10, 6), [0, y, front(y) + 0.0045]), M.toon(button, { outline: false }), 'buttons');
}

/** Open waistcoat over the shirt: front edges apart, V neckline, two welt pockets. */
function openVest(rig, { keys, vest, pocketY, pocketX }) {
  const J = rig.joints, M = rig.mats;
  rig.ps.add(J.torso, ringLoft(keys, { radial: 40, steps: 4 }), vest, 'vest');
  const k0 = keys[1];
  for (const s of [-1, 1]) {
    const th = Math.asin(clamp(pocketX / k0.w, -1, 1));
    const z = Math.cos(th) * k0.d + (k0.cz || 0) + 0.004;
    rig.ps.add(J.torso, place(new THREE.BoxGeometry(0.06, 0.009, 0.004), [s * pocketX, pocketY, z], [0, s * th, -s * 0.06]), M.toon('#3a2216', { outline: false }), 'vest');
  }
}

/** Hide the human neck under masks that sit on the collar. */
function maskedRig(rig) {
  rig.headTags = ['head', 'face', 'hair', 'hat', 'neck'];
  return rig;
}

function buildGerard() {
  const rig = maskedRig(createRig('gerard_boar'));
  skeleton(rig, {
    hipY: 0.9, hipX: 0.1, thigh: 0.42, shin: 0.42, waist: 0.04, neckY: 0.58, headY: 0.17,
    shoulderY: 0.5, shoulderX: 0.2, upper: 0.31, fore: 0.27, headR: [0.105, 0.135, 0.115],
  });
  const M = rig.mats, J = rig.joints;
  addHead(rig, { rx: 0.105, ry: 0.135, rz: 0.115, jaw: 0.15, chin: 0.1, skin: '#d6c8bc', paint: paintPlain('#d6c8bc'), faceSize: 128 });
  const shirt = M.toon('#ffffff', { map: clothTex('#e7e2d7', { seed: 61, folds: 12, ink: 0.4 }) });
  const vest = M.toon('#ffffff', { map: clothTex('#8f5232', { seed: 62, folds: 8, ink: 0.5 }), side: THREE.DoubleSide });
  const trousers = M.toon('#ffffff', { map: clothTex('#77685a', { seed: 63, folds: 7, ink: 0.3 }) });
  const skin = M.toon('#dac9b9');
  shirtTorso(rig, {
    shirt, neck: [0.074, 0.066], collarY: 0.58, buttons: [0.06, 0.15, 0.24, 0.33, 0.42, 0.5],
    keys: [
      { y: -0.08, w: 0.168, d: 0.13 }, { y: 0.04, w: 0.18, d: 0.152, cz: 0.02 }, { y: 0.16, w: 0.188, d: 0.156, cz: 0.026 },
      { y: 0.3, w: 0.194, d: 0.14, cz: 0.012 }, { y: 0.42, w: 0.206, d: 0.124 }, { y: 0.49, w: 0.21, d: 0.112, cz: -0.006 },
      { y: 0.545, w: 0.17, d: 0.096, cz: -0.008 }, { y: 0.585, w: 0.086, d: 0.07, cz: -0.004 },
    ],
  });
  openVest(rig, {
    vest, pocketY: 0.08, pocketX: 0.105,
    keys: [
      { y: -0.045, w: 0.181, d: 0.157, cz: 0.022, gap: 0.4 }, { y: 0.1, w: 0.192, d: 0.167, cz: 0.028, gap: 0.38 },
      { y: 0.26, w: 0.2, d: 0.152, cz: 0.016, gap: 0.4 }, { y: 0.4, w: 0.214, d: 0.136, cz: 0.002, gap: 0.5 },
      { y: 0.49, w: 0.222, d: 0.123, cz: -0.006, gap: 0.64 }, { y: 0.545, w: 0.178, d: 0.104, cz: -0.008, gap: 0.86 },
      { y: 0.578, w: 0.108, d: 0.081, cz: -0.006, gap: 1.1 },
    ],
  });
  // trousers seat + belt line
  rig.ps.add(J.body, ringLoft([
    { y: -0.17, w: 0.15, d: 0.12 }, { y: -0.08, w: 0.178, d: 0.142, cz: 0.008 }, { y: 0.0, w: 0.184, d: 0.152, cz: 0.016 }, { y: 0.075, w: 0.178, d: 0.15, cz: 0.02 },
  ], { radial: 36, steps: 3, cap: 'both' }), trousers, 'hips');
  for (const s of [-1, 1]) rig.ps.add(J.body, taperTube([V(s * 0.12, 0.03, 0.12), V(s * 0.155, -0.02, 0.1), V(s * 0.172, -0.08, 0.075)], 0.004, 0.003, 8, 5), M.toon('#3c3128', { outline: false }), 'hips');
  rolledArms(rig, { shirt, skin, upper: [0.068, 0.06], fore: [0.048, 0.037] });
  trouserLegs(rig, {
    mat: trousers, thigh: [0.1, 0.086], shin: [0.086, 0.079], shoe: M.toon('#3b2a1f'), sole: M.toon('#1f1610'),
    foot: { w: 0.052, h: 0.05, l: 0.15, z: 0.04 },
  });
  addHands(rig, skin, 1.15, ['relax']);
  rig.ps.build(rig);
  // hands in the trouser pockets, boar head turned towards the deer
  rig.setPose(rig.solve({ head: [0.04, 0.16, 0.03], neck: [0, 0.05, 0], torso: [0, 0.03, 0], legL: [0, 0, 0.04], legR: [0, 0, -0.04] }, {
    L: { pos: [0.17, 0.87, 0.07], pole: [1, -0.2, -0.9] },
    R: { pos: [-0.17, 0.87, 0.07], pole: [-1, -0.2, -0.9] },
  }));
  rig.hideHand('L', true); rig.hideHand('R', true);
  rig.setMask('boar');
  humanIdle(rig, { breath: 0.01, sway: 0.008, head: 0.02 });
  rig.play('idle'); rig.apply();
  return rig;
}

function buildElizabeth() {
  const rig = maskedRig(createRig('elizabeth_pheasant'));
  skeleton(rig, {
    hipY: 0.6, hipX: 0.06, thigh: 0.28, shin: 0.28, waist: 0.03, neckY: 0.37, headY: 0.12,
    shoulderY: 0.32, shoulderX: 0.118, upper: 0.2, fore: 0.19, headR: [0.09, 0.115, 0.095],
  });
  const M = rig.mats, J = rig.joints;
  addHead(rig, { rx: 0.09, ry: 0.115, rz: 0.095, jaw: 0.2, chin: 0.1, skin: '#e2d6cc', paint: paintPlain('#e2d6cc'), faceSize: 128 });
  const dress = M.toon('#ffffff', { map: clothTex('#8c4d33', { seed: 71, folds: 14, ink: 0.5 }), side: THREE.DoubleSide });
  const white = M.toon('#ffffff', { map: clothTex('#f1ece2', { seed: 72, folds: 5, ink: 0.25 }), side: THREE.DoubleSide });
  const skin = M.toon('#e3d7cc');
  // bodice
  rig.ps.add(J.torso, ringLoft([
    { y: -0.04, w: 0.092, d: 0.072 }, { y: 0.08, w: 0.098, d: 0.078, cz: 0.004 }, { y: 0.2, w: 0.108, d: 0.084, cz: 0.006 },
    { y: 0.29, w: 0.118, d: 0.078 }, { y: 0.335, w: 0.1, d: 0.068 }, { y: 0.37, w: 0.05, d: 0.044 },
  ], { radial: 36, steps: 4, cap: 'top' }), dress, 'torso');
  // full pleated skirt to the shins
  rig.ps.add(J.body, ringLoft([
    { y: -0.43, w: 0.25, d: 0.216, cz: 0.012 }, { y: -0.3, w: 0.214, d: 0.186, cz: 0.008 }, { y: -0.14, w: 0.16, d: 0.136, cz: 0.004 },
    { y: -0.02, w: 0.112, d: 0.09 }, { y: 0.06, w: 0.096, d: 0.077 },
  ], { radial: 56, steps: 4, pleat: (th, k) => 0.075 * Math.pow(1 - k, 1.4) * Math.cos(th * 14), drop: (th, k) => (1 - k) * 0.012 * Math.cos(th * 14 + 1.6) }), dress, 'skirt');
  // big round white collar
  rig.ps.add(J.torso, ringLoft([
    { y: 0.296, w: 0.138, d: 0.108, gap: 0.16 }, { y: 0.33, w: 0.112, d: 0.09, gap: 0.12 }, { y: 0.358, w: 0.07, d: 0.058, gap: 0.08 }, { y: 0.374, w: 0.052, d: 0.046, gap: 0.06 },
  ], { radial: 40, steps: 3, drop: (th, k) => -(1 - k) * 0.03 * Math.pow(Math.cos(th), 8) }), white, 'collar');
  // white sash with a bow at the front
  rig.ps.add(J.torso, ringLoft([{ y: -0.035, w: 0.1, d: 0.08, cz: 0.002 }, { y: 0.015, w: 0.1, d: 0.081, cz: 0.004 }], { radial: 36, steps: 2 }), white, 'collar');
  const bz = 0.088;
  for (const s of [-1, 1]) {
    rig.ps.add(J.torso, place(new THREE.TorusGeometry(0.021, 0.0065, 8, 18), [s * 0.022, -0.006, bz], [0, s * 0.35, s * 0.25], [1, 0.62, 0.5]), white, 'collar');
    rig.ps.add(J.torso, ribbonGeo([[s * 0.006, -0.012, bz + 0.004], [s * 0.016, -0.05, bz + 0.012], [s * 0.026, -0.095, bz + 0.016]], 0.016, { seg: 10, nrm: (p, o) => o.set(0, 0, 1), lift: 0 }), white, 'collar');
  }
  rig.ps.add(J.torso, place(sphere(0.011, 0.01, 0.008, 10, 8), [0, -0.007, bz + 0.004]), white, 'collar');
  // puffed short sleeves with a white band, bare arms
  for (const side of ['L', 'R']) {
    rig.ps.add(J['arm' + side], ringLoft([
      { y: -0.085, w: 0.04, d: 0.039 }, { y: -0.062, w: 0.058, d: 0.056 }, { y: -0.025, w: 0.061, d: 0.059 }, { y: 0.008, w: 0.048, d: 0.047 }, { y: 0.03, w: 0.022, d: 0.022 },
    ], { radial: 28, steps: 3, cap: 'top', pleat: (th) => 0.07 * Math.cos(th * 12) }), dress, 'arm');
    rig.ps.add(J['arm' + side], place(new THREE.TorusGeometry(0.039, 0.007, 6, 20), [0, -0.085, 0], [Math.PI / 2, 0, 0]), white, 'arm');
  }
  addArms(rig, { upper: [0.029, 0.025], upperMat: skin, fore: [0.025, 0.02], foreMat: skin });
  addLegs(rig, {
    thigh: [0.04, 0.035], thighMat: M.toon('#e9e5dd'), shin: [0.034, 0.027], shinMat: M.toon('#e9e5dd'),
    foot: { w: 0.034, h: 0.032, l: 0.085, z: 0.03 }, footMat: M.toon('#211915'), soleMat: M.toon('#120d0b'),
  });
  // Mary-Jane straps
  for (const side of ['L', 'R']) rig.ps.add(J['foot' + side], place(new THREE.TorusGeometry(0.03, 0.004, 5, 14), [0, -0.014, 0.034], [Math.PI / 2 - 0.25, 0, 0], [1, 1.25, 1]), M.toon('#211915', { outline: false }), 'leg');
  addHands(rig, skin, 0.72, ['relax']);
  rig.ps.build(rig);
  rig.setPose({ armL: [0.04, 0, 0.13], elbowL: [-0.14, 0, 0], armR: [0.04, 0, -0.13], elbowR: [-0.14, 0, 0], head: [0.1, 0.06, 0], neck: [0.04, 0, 0] });
  rig.setMask('pheasant');
  humanIdle(rig, { breath: 0.012, sway: 0.008, head: 0.02 });
  rig.play('idle'); rig.apply();
  return rig;
}

/** Wide bell sleeve hanging straight down (root space) from a point on an arm joint; kept vertical every frame. */
function hangingSleeve(rig, joint, at, { len = 0.3, r0 = 0.07, r1 = 0.13, mat, tag = 'arm' }) {
  const mount = new THREE.Group();
  mount.position.set(at[0], at[1], at[2]);
  joint.add(mount);
  const geo = ringLoft([
    { y: -len, w: r1, d: r1 * 0.8, cz: r1 * 0.12 }, { y: -len * 0.62, w: lerp(r0, r1, 0.72), d: lerp(r0, r1, 0.72) * 0.84, cz: r1 * 0.06 },
    { y: -len * 0.25, w: lerp(r0, r1, 0.3), d: lerp(r0, r1, 0.3) * 0.9 }, { y: 0.02, w: r0, d: r0 },
  ], { radial: 30, steps: 4, pleat: (th, k) => 0.07 * (1 - k) * Math.cos(th * 6 + 0.8), drop: (th, k) => (1 - k) * -0.05 * Math.max(0, Math.cos(th)) });
  const mesh = new THREE.Mesh(prep(geo), mat);
  mesh.castShadow = true;
  mesh.name = `${rig.id}_sleeve_${joint.name}`;
  mount.add(mesh);
  (rig.tags[tag] ||= []).push(mesh);
  const q = new THREE.Quaternion(), m = new THREE.Matrix4(), p = V(), s = V();
  rig._after.push(() => {
    rig.root.updateMatrixWorld(true);
    m.copy(rig.root.matrixWorld).invert().multiply(joint.matrixWorld).decompose(p, q, s);
    mount.quaternion.copy(q).invert();
  });
  return mount;
}

function buildNicholasDeer() {
  const rig = maskedRig(createRig('nicholas_deer'));
  skeleton(rig, {
    hipY: 0.96, hipX: 0.09, thigh: 0.45, shin: 0.45, waist: 0.04, neckY: 0.58, headY: 0.19,
    shoulderY: 0.51, shoulderX: 0.185, upper: 0.31, fore: 0.28, headR: [0.095, 0.145, 0.108],
  });
  const M = rig.mats, J = rig.joints;
  addHead(rig, { rx: 0.095, ry: 0.145, rz: 0.108, jaw: 0.38, chin: 0.3, skin: SKIN_NICK, paint: paintNicholas, faceSize: 256 });
  const robe = M.toon('#ffffff', { map: clothTex('#ebe9e3', { seed: 81, folds: 20, ink: 0.42 }), side: THREE.DoubleSide });
  const band = M.toon('#ffffff', { map: clothTex('#f3f1ec', { seed: 82, folds: 4, ink: 0.2 }), side: THREE.DoubleSide, outline: 0.0035 });
  const skin = rig.skinMat;
  rig.ps.add(J.torso, ringLoft([
    { y: -0.06, w: 0.172, d: 0.13 }, { y: 0.1, w: 0.17, d: 0.128, cz: 0.004 }, { y: 0.28, w: 0.178, d: 0.124, cz: 0.004 },
    { y: 0.43, w: 0.195, d: 0.115 }, { y: 0.505, w: 0.2, d: 0.105, cz: -0.004 }, { y: 0.555, w: 0.14, d: 0.086, cz: -0.006 }, { y: 0.6, w: 0.062, d: 0.052 },
  ], { radial: 40, steps: 4, cap: 'top' }), robe, 'torso');
  // long robe to the ground with soft folds
  rig.ps.add(J.body, ringLoft([
    { y: -0.955, w: 0.3, d: 0.25, cz: 0.012 }, { y: -0.7, w: 0.262, d: 0.215, cz: 0.008 }, { y: -0.38, w: 0.218, d: 0.175, cz: 0.004 },
    { y: -0.1, w: 0.182, d: 0.142 }, { y: 0.08, w: 0.172, d: 0.132 },
  ], { radial: 56, steps: 5, pleat: (th, k) => (0.045 * (1 - k) + 0.006) * Math.cos(th * 11 + 0.6) + 0.02 * (1 - k) * Math.cos(th * 5 + 1.3) }), robe, 'robe');
  // wrap collar: the left front crosses over the right
  const nrm = (p, o) => o.set(p.x, Math.max(0, p.y - 0.5) * 2.2, p.z).normalize();
  rig.ps.add(J.torso, ribbonGeo([[-0.06, 0.6, -0.035], [-0.078, 0.585, 0.035], [-0.04, 0.47, 0.105], [0.03, 0.3, 0.13], [0.085, 0.1, 0.136]], 0.05, { nrm, lift: 0.005, seg: 34 }), band, 'collar');
  rig.ps.add(J.torso, ribbonGeo([[0.06, 0.6, -0.035], [0.078, 0.585, 0.035], [0.04, 0.47, 0.105], [-0.03, 0.3, 0.131], [-0.088, 0.1, 0.137]], 0.05, { nrm, lift: 0.009, seg: 34 }), band, 'collar');
  // sleeves: robe over the whole arm, the wide bell openings hang down from the forearms
  addArms(rig, { upper: [0.07, 0.066], upperMat: robe, fore: [0.06, 0.054], foreMat: robe });
  addHands(rig, skin, 1.05, ['grip', 'flat']);
  rig.ps.build(rig);
  hangingSleeve(rig, J.elbowR, [0, -0.02, 0], { len: 0.3, r0: 0.075, r1: 0.14, mat: robe });
  hangingSleeve(rig, J.elbowL, [0, -0.17, 0], { len: 0.36, r0: 0.07, r1: 0.15, mat: robe });
  // cube
  const cube = blackCube(M, 0.13);
  cube.name = 'memory_cube';
  const cubeMount = new THREE.Group();
  J.handR.add(cubeMount);
  cubeMount.position.set(0, -0.11, 0.035);
  cubeMount.add(cube);
  const _cq = new THREE.Quaternion(), _cm = new THREE.Matrix4(), _cp = V(), _cs = V();
  rig._after.push(() => {
    rig.root.updateMatrixWorld(true);
    _cm.copy(rig.root.matrixWorld).invert().multiply(J.handR.matrixWorld);
    _cm.decompose(_cp, _cq, _cs);
    cubeMount.quaternion.copy(_cq).invert();
    cube.rotation.set(0.25, 0.6, 0.12);
  });
  // particles for burstCube
  const PN = 70;
  const parts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.unlit('#0c0c0c'), PN);
  parts.frustumCulled = false; parts.visible = false; parts.name = 'memory_cube_particles';
  rig.root.add(parts);
  const pr = rng(91);
  const P = Array.from({ length: PN }, () => ({ v: V((pr() - 0.5) * 0.7, 0.9 + pr() * 1.6, (pr() - 0.5) * 0.5), s: 0.012 + pr() * 0.025, d: pr() * 0.25, rot: pr() * 6 }));
  let burstK = -1;
  const _o = V(), _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _be = new THREE.Euler(), _bs = V(), _bp = V();
  rig._upd.push(() => {
    if (burstK < 0) return;
    rig.jointToRoot(cube, _o.set(0, 0, 0), _bp);
    for (let i = 0; i < PN; i++) {
      const p = P[i];
      const k = clamp((burstK - p.d) / (1 - p.d), 0, 1);
      _o.copy(_bp).addScaledVector(p.v, k);
      _bq.setFromEuler(_be.set(p.rot * k, p.rot * 0.7 * k, 0));
      const sc = k <= 0 ? 0.0001 : p.s * (1 - k * 0.8);
      _bm.compose(_o, _bq, _bs.set(sc, sc, sc));
      parts.setMatrixAt(i, _bm);
    }
    parts.instanceMatrix.needsUpdate = true;
  });

  // poses: cube raised beside the head (as in the vision), other hand flat on the chest
  const base = { torso: [0, 0.04, 0], neck: [0.02, 0, 0], head: [0.06, -0.06, 0.02] };
  const chest = { pos: [0.04, 1.36, 0.165], pole: [1, -0.55, -0.2], aim: { fingers: [-1, 0.28, 0.08], palm: [0, 0, -1] } };
  const hold = rig.solve(base, {
    R: { pos: [-0.36, 1.78, 0.06], pole: [-1, -0.9, 0.1], aim: { fingers: [0.1, 1, 0.12], palm: [0.25, 0, 1] } },
    L: chest,
  });
  const raised = rig.solve(base, {
    R: { pos: [-0.2, 1.98, 0.08], pole: [-1, -0.5, 0.1], aim: { fingers: [0.05, 1, 0.1], palm: [0.25, 0, 1] } },
    L: chest,
  });
  rig.POSES = { hold, raised };
  rig.setPose(hold);
  rig.setHand('R', 'grip'); rig.setHand('L', 'flat');
  rig.raiseCube = async ({ instant = false } = {}) => { cube.visible = true; await rig.tweenPose(raised, 1200, Ease.inOutSine, instant); };
  rig.lowerCube = async ({ instant = false } = {}) => { await rig.tweenPose(hold, 900, Ease.inOutSine, instant); };
  rig.burstCube = async ({ instant = false } = {}) => {
    if (instant) { burstK = -1; parts.visible = false; return; }
    parts.visible = true;
    await animate(1700, (e) => { burstK = e; }, Ease.outCubic);
    burstK = -1; parts.visible = false;
  };
  rig.showCube = (v = true) => { cube.visible = v; return Promise.resolve(); };
  rig.setMask('deer');
  humanIdle(rig, { breath: 0.01, sway: 0.006, head: 0.015 });
  rig.play('idle'); rig.apply();
  return rig;
}

function buildDavidRabbit() {
  const rig = maskedRig(createRig('david_rabbit'));
  skeleton(rig, { ...DAVID_DIMS, hatH: 0, headY: 0.14, shoulderY: 0.455 });
  addHead(rig, { ...DAVID_HEAD, faceSize: 256 });
  const M = rig.mats, J = rig.joints;
  const shirt = M.toon('#ffffff', { map: clothTex('#e9e5dc', { seed: 111, folds: 11, ink: 0.4 }) });
  const vest = M.toon('#ffffff', { map: clothTex('#8b5a3b', { seed: 112, folds: 7, ink: 0.5 }), side: THREE.DoubleSide });
  const trousers = M.toon('#ffffff', { map: clothTex('#5f574c', { seed: 113, folds: 6, ink: 0.3 }) });
  const skin = rig.skinMat;
  shirtTorso(rig, {
    shirt, neck: [0.06, 0.054], collarY: 0.515, buttons: [0.05, 0.13, 0.21, 0.29, 0.37, 0.44],
    keys: [
      { y: -0.08, w: 0.13, d: 0.098 }, { y: 0.06, w: 0.132, d: 0.1, cz: 0.004 }, { y: 0.2, w: 0.143, d: 0.104, cz: 0.006 },
      { y: 0.33, w: 0.153, d: 0.1, cz: 0.002 }, { y: 0.43, w: 0.165, d: 0.092 }, { y: 0.483, w: 0.132, d: 0.08, cz: -0.004 }, { y: 0.522, w: 0.064, d: 0.054 },
    ],
  });
  openVest(rig, {
    vest, pocketY: 0.07, pocketX: 0.075,
    keys: [
      { y: -0.05, w: 0.142, d: 0.112, cz: 0.004, gap: 0.46 }, { y: 0.08, w: 0.143, d: 0.112, cz: 0.006, gap: 0.43 },
      { y: 0.22, w: 0.154, d: 0.115, cz: 0.007, gap: 0.45 }, { y: 0.34, w: 0.164, d: 0.108, cz: 0.002, gap: 0.55 },
      { y: 0.435, w: 0.176, d: 0.1, gap: 0.7 }, { y: 0.486, w: 0.142, d: 0.088, cz: -0.004, gap: 0.92 }, { y: 0.512, w: 0.084, d: 0.064, gap: 1.15 },
    ],
  });
  rig.ps.add(J.body, ringLoft([
    { y: -0.15, w: 0.112, d: 0.09 }, { y: -0.07, w: 0.142, d: 0.106, cz: 0.004 }, { y: 0.0, w: 0.146, d: 0.108, cz: 0.006 }, { y: 0.07, w: 0.138, d: 0.104, cz: 0.006 },
  ], { radial: 32, steps: 3, cap: 'both' }), trousers, 'hips');
  rolledArms(rig, { shirt, skin, upper: [0.054, 0.047], fore: [0.038, 0.03] });
  trouserLegs(rig, {
    mat: trousers, thigh: [0.076, 0.065], shin: [0.064, 0.056], shoe: M.toon('#3a2b21'), sole: M.toon('#1e1611'),
    foot: { w: 0.048, h: 0.047, l: 0.135, z: 0.038 }, boot: { top: 0.66, r: [0.058, 0.05] },
  });
  addHands(rig, skin, 1, ['relax']);
  rig.ps.build(rig);
  rig.setPose({ armL: [0.02, 0, 0.09], elbowL: [-0.1, 0, 0], armR: [0.02, 0, -0.09], elbowR: [-0.1, 0, 0], head: [0.05, -0.12, 0], legL: [0, 0, 0.02], legR: [0, 0, -0.02] });
  rig.setMask('rabbit');
  humanIdle(rig, { breath: 0.012, sway: 0.01, head: 0.02 });
  rig.play('idle'); rig.apply();
  return rig;
}

function buildMargaretPigeon() {
  const rig = maskedRig(createRig('margaret_pigeon'));
  skeleton(rig, {
    hipY: 0.8, hipX: 0.08, thigh: 0.38, shin: 0.38, waist: 0.04, neckY: 0.46, neckZ: 0.02, headY: 0.16, headZ: 0.03,
    shoulderY: 0.415, shoulderX: 0.152, upper: 0.26, fore: 0.24, headR: [0.105, 0.128, 0.112],
  });
  const M = rig.mats, J = rig.joints;
  addHead(rig, { rx: 0.105, ry: 0.128, rz: 0.112, jaw: 0.12, chin: 0.1, skin: SKIN_OLD, paint: paintMargaret });
  const dress = M.toon('#ffffff', { map: clothTex('#6a5040', { seed: 121, folds: 14, ink: 0.55 }), side: THREE.DoubleSide });
  const apron = M.toon('#ffffff', { map: clothTex('#d6cfc1', { seed: 122, folds: 12, ink: 0.4 }), side: THREE.DoubleSide });
  const scarf = M.toon('#ffffff', { map: clothTex('#d4c8ab', { seed: 123, folds: 12, ink: 0.45 }), side: THREE.DoubleSide });
  const skin = rig.skinMat;
  rig.ps.add(J.torso, ringLoft([
    { y: -0.06, w: 0.152, d: 0.118 }, { y: 0.1, w: 0.158, d: 0.122, cz: 0.006 }, { y: 0.24, w: 0.166, d: 0.12, cz: 0.008 },
    { y: 0.34, w: 0.17, d: 0.112 }, { y: 0.405, w: 0.155, d: 0.098, cz: -0.006 }, { y: 0.45, w: 0.1, d: 0.075, cz: -0.004 }, { y: 0.475, w: 0.05, d: 0.045, cz: 0.01 },
  ], { radial: 36, steps: 4, cap: 'top' }), dress, 'torso');
  // long skirt + apron panel at the front
  const skirtKeys = [
    { y: -0.795, w: 0.3, d: 0.26, cz: 0.015 }, { y: -0.55, w: 0.266, d: 0.226, cz: 0.012 }, { y: -0.25, w: 0.216, d: 0.181, cz: 0.007 },
    { y: -0.02, w: 0.171, d: 0.141 }, { y: 0.07, w: 0.156, d: 0.125 },
  ];
  rig.ps.add(J.body, ringLoft(skirtKeys, { radial: 52, steps: 4, pleat: (th, k) => (0.03 * (1 - k) + 0.005) * Math.cos(th * 10 + 0.3) }), dress, 'skirt');
  rig.ps.add(J.body, ringLoft(skirtKeys.map((k, i) => ({ ...k, y: i === 0 ? -0.74 : k.y, w: k.w * 1.075 + 0.003, d: k.d * 1.075 + 0.004, arc: 0.95 - i * 0.04 })), {
    radial: 30, steps: 4, pleat: (th, k) => 0.03 * (1 - k) * Math.cos(th * 9 + 1.2),
  }), apron, 'skirt');
  rig.ps.add(J.body, ringLoft([{ y: 0.045, w: 0.162, d: 0.131, cz: 0.001 }, { y: 0.075, w: 0.16, d: 0.129, cz: 0.001 }], { radial: 36, steps: 2 }), apron, 'skirt');
  // shawl over the shoulders, its point hanging down the back
  rig.ps.add(J.torso, ringLoft([
    { y: 0.12, w: 0.2, d: 0.165, gap: 0.6 }, { y: 0.26, w: 0.206, d: 0.16, gap: 0.46 }, { y: 0.37, w: 0.198, d: 0.142, cz: -0.004, gap: 0.36 },
    { y: 0.44, w: 0.166, d: 0.122, cz: -0.006, gap: 0.28 }, { y: 0.49, w: 0.102, d: 0.09, gap: 0.24 },
  ], { radial: 44, steps: 4, drop: (th, k) => -Math.pow(1 - k, 2) * 0.16 * Math.max(0, -Math.cos(th)), pleat: (th, k) => 0.03 * (1 - k) * Math.cos(th * 7) }), scarf, 'scarf');
  // headscarf hood around the pigeon head (open at the face), knot under the beak
  const hood = new THREE.SphereGeometry(1, 34, 24, Math.PI / 2 + 1.55, TAU - 3.1, 0, Math.PI * 0.95);
  const hp = hood.attributes.position, hv = V();
  for (let i = 0; i < hp.count; i++) {
    hv.fromBufferAttribute(hp, i);
    const low = Math.max(0, -hv.y - 0.2);
    hp.setXYZ(i, hv.x * (0.116 + low * 0.07), hv.y * 0.126 + 0.03 - low * 0.08, hv.z * (0.12 + low * 0.035) - 0.012);
  }
  hood.rotateX(0.42);
  hood.computeVertexNormals();
  rig.ps.add(J.head, hood, scarf, 'scarf');
  rig.ps.add(J.head, place(sphere(0.026, 0.021, 0.022, 12, 8), [0.03, -0.112, 0.062], [0.2, 0, 0.3]), scarf, 'scarf');
  for (const [x, ang] of [[0.045, 0.55], [0.018, -0.3]]) rig.ps.add(J.head, orient(leafGeo(0.07, 0.02, { at: 0.5, depth: 0.006, baseW: 0.7 }), V(x, -0.118, 0.066), [Math.sin(ang) * 0.6, -1, 0.15], [0, 0.2, 1]), scarf, 'scarf');
  // brown sleeves, bony hands clasped at the chest
  addArms(rig, { upper: [0.058, 0.05], upperMat: dress, fore: [0.048, 0.037], foreMat: dress });
  for (const side of ['L', 'R']) {
    rig.ps.add(J['foot' + side], spineLoft([
      { y: -0.02, z: -0.03, w: 0.036, h: 0.024 }, { y: -0.024, z: 0.04, w: 0.04, h: 0.026 }, { y: -0.03, z: 0.1, w: 0.032, h: 0.018 },
    ], { radial: 16, steps: 3 }).geo, M.toon('#2c241e'), 'leg');
  }
  addHands(rig, skin, 1.08, ['pray']);
  rig.ps.build(rig);
  const pose = { torso: [0.2, 0.0, 0.0], neck: [-0.04, 0.0, 0.0], head: [-0.02, -0.3, 0.05] };
  rig.setPose(rig.solve(pose, {
    L: { pos: [0.08, 1.06, 0.24], pole: [1, -1, -0.3], aim: { fingers: [0.15, 1, 0.35], palm: [-1, 0, 0.1] } },
    R: { pos: [0.0, 1.055, 0.24], pole: [-1, -1, -0.3], aim: { fingers: [0.15, 1, 0.35], palm: [1, 0, -0.1] } },
  }));
  rig.setHand('L', 'pray'); rig.setHand('R', 'pray');
  rig.setMask('pigeon');
  humanIdle(rig, { breath: 0.01, sway: 0.008, head: 0.015, speed: 0.8 });
  rig.play('idle'); rig.apply();
  return rig;
}

// ===========================================================================
// GOAT
// ===========================================================================

function buildGoat() {
  const rig = createRig('goat');
  const M = rig.mats;
  const fur = M.toon('#ffffff', { map: clothTex('#e5e7e4', { seed: 101, folds: 14, ink: 0.18 }) });
  const furPlain = M.toon('#e5e7e4');
  const pink = M.toon('#dfb0a6');
  const hoof = M.toon('#1a1a1a');
  const horn = M.toon('#ffffff', { map: ringTex('#c7a597', '#6e5a52', { n: 9 }) });
  const R = rig.root;
  const body = rig.addJoint('body', R, [0, 0.0, 0], 'goat_body');
  const J = rig.joints;
  // barrel
  const barrel = sphere(0.205, 0.215, 0.41, 26, 18);
  const bp = barrel.attributes.position, v = V();
  for (let i = 0; i < bp.count; i++) {
    v.fromBufferAttribute(bp, i);
    if (v.y < 0) v.y *= 1 + 0.15 * Math.max(0, 1 - Math.abs(v.z / 0.41) * 1.4);   // belly sag
    bp.setXYZ(i, v.x, v.y, v.z);
  }
  barrel.computeVertexNormals();
  rig.ps.add(body, place(barrel, [0, 0.66, -0.02]), fur, 'body');
  rig.ps.add(body, place(sphere(0.185, 0.2, 0.19, 18, 14), [0, 0.67, 0.27]), fur, 'body');
  rig.ps.add(body, place(sphere(0.18, 0.19, 0.2, 18, 14), [0, 0.68, -0.3]), fur, 'body');
  // chest fur tuft
  rig.ps.add(body, place(new THREE.ConeGeometry(0.06, 0.14, 8), [0, 0.55, 0.42], [Math.PI - 0.3, 0, 0], [1.4, 1, 0.6]), furPlain, 'body');
  // tail
  const tail = rig.addJoint('tail', body, [0, 0.8, -0.47]);
  rig.ps.add(tail, place(new THREE.ConeGeometry(0.04, 0.12, 10), [0, 0.04, -0.03], [-0.9, 0, 0]), furPlain, 'tail');
  // legs (front: knee forward, back: hock backward)
  const legDefs = [['FL', 0.1, 0.3], ['FR', -0.1, 0.3], ['BL', 0.1, -0.31], ['BR', -0.1, -0.31]];
  for (const [n, x, z] of legDefs) {
    const front = n[0] === 'F';
    const leg = rig.addJoint('leg' + n, body, [x, 0.56, z]);
    const knee = rig.addJoint('knee' + n, leg, [0, -0.25, front ? 0.0 : -0.01]);
    rig.ps.add(leg, limbGeo(front ? 0.06 : 0.075, 0.035, 0.25, 12), fur, 'leg');
    rig.ps.add(knee, limbGeo(0.033, 0.026, 0.27, 10), furPlain, 'leg');
    rig.ps.add(knee, place(sphere(0.034, 0.03, 0.034, 10, 8), [0, 0, 0]), furPlain, 'leg');
    rig.ps.add(knee, place(new THREE.CylinderGeometry(0.026, 0.032, 0.05, 10), [0, -0.29, 0.008]), hoof, 'leg');
  }
  // neck → head
  const neck = rig.addJoint('neck', body, [0, 0.76, 0.33]);
  rig.ps.add(neck, place(limbGeo(0.095, 0.075, 0.3, 14), [0, 0.0, 0], [Math.PI, 0, 0]), fur, 'neck');
  const head = rig.addJoint('head', neck, [0, 0.32, 0.0]);
  // skull + muzzle (head points +Z, slightly down)
  rig.ps.add(head, place(sphere(0.085, 0.095, 0.11, 18, 14), [0, 0.0, 0.02]), furPlain, 'head');
  rig.ps.add(head, place(sphere(0.062, 0.07, 0.115, 16, 12), [0, -0.05, 0.13], [0.35, 0, 0]), furPlain, 'head');
  rig.ps.add(head, place(sphere(0.03, 0.022, 0.02, 10, 8), [0, -0.055, 0.235], [0.4, 0, 0]), pink, 'head');
  for (const s of [-1, 1]) rig.ps.add(head, place(sphere(0.007, 0.004, 0.004), [s * 0.016, -0.06, 0.252]), M.toon('#3a2020', { outline: false }), 'head');
  // jaw (chewing) + beard
  const jaw = rig.addJoint('jaw', head, [0, -0.07, 0.07]);
  rig.ps.add(jaw, place(sphere(0.045, 0.024, 0.1, 12, 8), [0, -0.02, 0.085], [0.3, 0, 0]), furPlain, 'jaw');
  rig.ps.add(jaw, place(new THREE.ConeGeometry(0.035, 0.15, 10), [0, -0.1, 0.07], [Math.PI + 0.15, 0, 0], [1, 1, 0.7]), furPlain, 'jaw');
  rig.ps.add(jaw, place(new THREE.ConeGeometry(0.02, 0.06, 8), [0.018, -0.18, 0.075], [Math.PI + 0.1, 0, 0.2]), furPlain, 'jaw');
  rig.ps.add(jaw, place(new THREE.ConeGeometry(0.018, 0.05, 8), [-0.016, -0.175, 0.08], [Math.PI + 0.1, 0, -0.2]), furPlain, 'jaw');
  // tongue (hidden until after drinking)
  const tongueJ = rig.addJoint('tongue', jaw, [0, -0.01, 0.16]);
  const tongue = new THREE.Mesh(place(sphere(0.022, 0.008, 0.05, 12, 8), [0, 0, 0.035], [0.5, 0, 0]), pink);
  tongue.name = 'goat_tongue';
  tongueJ.add(tongue);
  tongueJ.visible = false;
  const leech = makeLeech(M, 0.075, 0.009, 0.4);
  leech.name = 'goat_leech';
  leech.position.set(0, -0.006, 0.07);
  leech.rotation.set(0.0, 0, 0.05);
  tongueJ.add(leech);
  leech.visible = false;
  // 舌头上的水蛭太小，挂一个看不见的点击球（材质不可见、userData.proxy：热点射线仍然认它）
  const leechProxy = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), noOutline(new THREE.MeshBasicMaterial({ visible: false })));
  leechProxy.position.y = -0.035; leechProxy.userData.proxy = true; leechProxy.name = 'goat_leech_hit';
  leech.add(leechProxy);
  // eyes (lateral, heavy-lidded), ears (horizontal, pink inside), horns
  for (const s of [-1, 1]) {
    rig.ps.add(head, place(sphere(0.021, 0.016, 0.02, 12, 8), [s * 0.072, 0.02, 0.07], [0, s * 0.5, 0]), M.toon('#f2f0e8'), 'eyes');
    rig.ps.add(head, place(sphere(0.009, 0.007, 0.008), [s * 0.088, 0.016, 0.078]), M.toon('#151515', { outline: false }), 'eyes');
    rig.ps.add(head, place(sphere(0.024, 0.011, 0.023, 12, 8), [s * 0.074, 0.03, 0.07], [0.15, s * 0.5, 0]), furPlain, 'head');
    const ear = rig.addJoint('ear' + (s > 0 ? 'L' : 'R'), head, [s * 0.075, 0.05, -0.02]);
    rig.ps.add(ear, place(sphere(0.03, 0.013, 0.075, 12, 8), [s * 0.05, 0, 0.0], [0, -s * 1.2, s * -0.3]), furPlain, 'ears');
    rig.ps.add(ear, place(sphere(0.02, 0.006, 0.055, 10, 8), [s * 0.052, 0.008, 0.0], [0, -s * 1.2, s * -0.3]), pink, 'ears');
    const hp = [];
    for (let i = 0; i <= 10; i++) {
      const k = i / 10, a = k * 2.3;
      hp.push(V(s * (0.035 + k * 0.05), 0.07 + Math.sin(a) * 0.17, 0.0 - (1 - Math.cos(a)) * 0.15 - k * 0.04));
    }
    rig.ps.add(head, taperTube(hp, 0.028, 0.006, 30, 10), horn, 'horns');
  }
  rig.ps.build(rig);
  rig.parts = { head, neck, jaw, torso: body, body, tail, legFL: J.legFL, legFR: J.legFR, legBL: J.legBL, legBR: J.legBR, legL: J.legFL, legR: J.legFR, armL: null, armR: null, handL: null, handR: null };
  const top = new THREE.Object3D(); top.name = 'goat_headTop'; top.position.set(0, 0.32, 0.0); head.add(top);
  rig.headTop = top;
  const STAND = {
    body: [0, 0, 0], neck: [0.55, 0, 0], head: [0.25, 0, 0], jaw: [0, 0, 0], tail: [0, 0, 0],
    legFL: [0.03, 0, 0], kneeFL: [-0.02, 0, 0], legFR: [-0.05, 0, 0], kneeFR: [0.02, 0, 0],
    legBL: [-0.08, 0, 0], kneeBL: [0.12, 0, 0], legBR: [0.02, 0, 0], kneeBR: [0.08, 0, 0], tongue: [0, 0, 0],
  };
  // 喝水：脖子朝前下方伸（水平线下约 36°），头再往下低，嘴朝下伸进身前约 0.65 m 处的木桶（桶沿高 0.42 m）
  const DRINK = { ...STAND, neck: [2.14, 0, 0], head: [-0.86, 0, 0], body: [0.06, 0, 0], legFL: [0.12, 0, 0], legFR: [0.1, 0, 0], kneeFL: [-0.12, 0, 0], kneeFR: [-0.1, 0, 0] };
  rig.POSES = { STAND, DRINK };
  rig.setPose(STAND);
  let chew = 1, lap = 0, bleatK = 0;
  rig._idleFn = (t, I) => {
    I.jaw[0] += (Math.max(0, Math.sin(t * 3.2)) * 0.14 * chew) + lap * Math.max(0, Math.sin(t * 9)) * 0.2 + bleatK * 0.35;
    I.jaw[1] += Math.sin(t * 3.2) * 0.04 * chew;
    I.head[0] += Math.sin(t * 0.6) * 0.03 - bleatK * 0.3;
    I.head[1] += Math.sin(t * 0.37) * 0.05;
    I.neck[0] += Math.sin(t * 0.45) * 0.02;
    I.tail[0] += Math.sin(t * 7) * 0.1 * (Math.sin(t * 0.7) > 0.6 ? 1 : 0);
    I.earL[2] += Math.sin(t * 0.9) * 0.05 + (Math.sin(t * 0.33) > 0.97 ? 0.3 : 0);
    I.earR[2] -= Math.sin(t * 0.8 + 1) * 0.05;
    I.body[0] += Math.sin(t * 1.4) * 0.005;
  };
  rig.face = null;
  rig.setMask = () => {};
  /** Head down into the bucket (~4 s), head up, tongue out with the leech. ~5.5 s. */
  rig.drink = async ({ instant = false } = {}) => {
    if (instant) { rig.setPose(STAND); tongueJ.visible = true; leech.visible = true; rig.pose.tongue = [0.25, 0, 0]; rig.apply(); return; }
    chew = 0;
    await rig.tweenPose(DRINK, 900, Ease.inOutSine);
    lap = 1;
    await wait(3600);
    lap = 0;
    await rig.tweenPose(STAND, 900, Ease.inOutSine);
    tongueJ.visible = true; leech.visible = true;
    rig.pose.tongue = [-0.6, 0, 0];
    await rig.tweenPose({ tongue: [0.25, 0, 0], jaw: [0.25, 0, 0] }, 500, Ease.outBack);
    chew = 0;
  };
  /** Show/hide the leech on the out-stretched tongue (false also pulls the tongue back in). */
  rig.tongueLeech = async (v = true, { instant = false } = {}) => {
    leech.visible = v;
    if (v) { tongueJ.visible = true; chew = 0; await rig.tweenPose({ tongue: [0.25, 0, 0], jaw: [0.25, 0, 0] }, 400, Ease.outSine, instant); }
    else { await rig.tweenPose({ tongue: [-0.6, 0, 0], jaw: [0, 0, 0] }, 300, Ease.inSine, instant); tongueJ.visible = false; chew = 1; }
  };
  /** Startled recoil (the machete does not hurt it). */
  rig.flinch = async ({ instant = false } = {}) => {
    if (instant) return;
    const p0 = { ...rig.pose, 'body.p': [0, 0, 0] };
    await rig.tweenPose({ 'body.p': [0, 0.02, -0.12], body: [-0.08, 0, 0], neck: [0.35, 0, 0], head: [-0.05, 0.25, 0], legBL: [0.1, 0, 0], legBR: [0.12, 0, 0] }, 180, Ease.outCubic);
    await wait(250);
    await rig.tweenPose({ 'body.p': [0, 0, 0], body: p0.body, neck: p0.neck, head: p0.head, legBL: p0.legBL, legBR: p0.legBR }, 600, Ease.inOutSine);
  };
  /** Bleat: mouth opens wide, head lifts (~0.9 s). */
  rig.bleat = async () => {
    await animate(250, (e) => { bleatK = e; });
    await wait(400);
    await animate(250, (e) => { bleatK = 1 - e; });
  };
  /** Local Euler for hand joint so that (in root space) fingers point along `fingers` and the palm faces `palm`. */
  rig.handRotFor = (side, fingers, palm) => {
    const s = side === 'L' ? 1 : -1;
    const yA = V(-fingers[0], -fingers[1], -fingers[2]).normalize();
    const xA = V(-s * palm[0], -s * palm[1], -s * palm[2]);
    xA.addScaledVector(yA, -xA.dot(yA)).normalize();
    const zA = V().crossVectors(xA, yA);
    const qWant = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, zA));
    root.updateMatrixWorld(true);
    const m = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(rig.joints['elbow' + side].matrixWorld);
    const qE = new THREE.Quaternion(); m.decompose(V(), qE, V());
    const qL = qE.invert().multiply(qWant);
    const e = new THREE.Euler().setFromQuaternion(qL, 'XYZ');
    return [e.x, e.y, e.z];
  };

  rig.play = (anim = 'idle') => { rig.anim = anim; if (anim === 'bleat') { rig.anim = 'idle'; rig.bleat(); } chew = anim === 'none' ? 0 : chew; };
  rig.play('idle');
  rig.apply();
  return rig;
}

// ===========================================================================
// INTRO BOAT — grey-white rowboat with the small rowing figure (Jakob)
// ===========================================================================

function hullGeo(L = 2.6, W = 0.56, D = 0.36) {
  const NU = 28, NV = 14;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    const x = (u - 0.5) * L;
    // stern (u=0) is a narrow transom, bow (u=1) is pointed
    const w = W * (u < 0.15 ? lerp(0.62, 1, smooth(u / 0.15)) : Math.pow(Math.sin(Math.PI * (0.5 + 0.5 * (u - 0.15) / 0.85)), 0.55)) * (u > 0.995 ? 0 : 1);
    const sheer = 0.08 * Math.pow(Math.abs(u - 0.45) * 2, 2) + (u > 0.85 ? (u - 0.85) * 0.5 : 0);
    const d = D * (u < 0.1 ? 0.85 : 1) * (1 - 0.35 * Math.pow(Math.max(0, u - 0.75) / 0.25, 1.5));
    for (let j = 0; j <= NV; j++) {
      const v = j / NV, th = v * Math.PI;
      const z = Math.cos(th) * w;
      const y = sheer - d * Math.pow(Math.sin(th), 0.6);
      pos.push(x, y, z); uv.push(u, v);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * (NV + 1) + j, b = a + NV + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildIntroBoat() {
  const root = new THREE.Group(); root.name = 'intro_boat';
  const M = matSet();
  const boat = new THREE.Group(); boat.name = 'intro_boat_hull';
  root.add(boat);
  const L = 2.6, W = 0.56;
  const planks = M.toon('#ffffff', { map: clothTex('#cfcac0', { seed: 111, folds: 4, ink: 0.3, plank: true }), side: THREE.DoubleSide });
  const hull = new THREE.Mesh(hullGeo(L, W, 0.36), planks);
  hull.castShadow = true;
  boat.add(hull);
  // gunwale rims
  const rimPts = (s) => {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const u = i / 20, x = (u - 0.5) * L;
      const w = W * (u < 0.15 ? lerp(0.62, 1, smooth(u / 0.15)) : Math.pow(Math.sin(Math.PI * (0.5 + 0.5 * (u - 0.15) / 0.85)), 0.55));
      const sheer = 0.08 * Math.pow(Math.abs(u - 0.45) * 2, 2) + (u > 0.85 ? (u - 0.85) * 0.5 : 0);
      pts.push(V(x, sheer + 0.01, s * w));
    }
    return pts;
  };
  const wood = M.toon('#8d8578');
  const rimGeos = [prep(taperTube(rimPts(1), 0.02, 0.016, 40, 6)), prep(taperTube(rimPts(-1), 0.02, 0.016, 40, 6))];
  // thwarts + transom board
  for (const x of [-0.75, 0.0, 0.62]) rimGeos.push(prep(place(new THREE.BoxGeometry(0.16, 0.03, W * 1.75), [x, -0.06, 0])));
  rimGeos.push(prep(place(new THREE.BoxGeometry(0.03, 0.3, W * 1.2), [-L / 2 + 0.01, -0.12, 0])));
  boat.add(new THREE.Mesh(mergeGeometries(rimGeos), wood));
  // water shadow / reflection under the boat
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: '#4e5356', transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.material.userData.outlineParameters = { visible: false };
  shadow.rotation.x = -Math.PI / 2; shadow.scale.set(L * 0.62, W * 1.6, 1); shadow.position.y = 0.012;
  root.add(shadow);
  // rower (faces the stern = -X), seated on the middle thwart
  const rower = buildJakob({ id: 'rower', bust: false, seated: true, small: true, hat: true });
  rower.root.rotation.y = -Math.PI / 2;
  rower.root.position.set(0.05, -0.36, 0);
  boat.add(rower.root);
  const sitPose = {
    legL: [-1.35, 0, 0.12], kneeL: [1.2, 0, 0], legR: [-1.35, 0, -0.12], kneeR: [1.2, 0, 0], footL: [0.1, 0, 0], footR: [0.1, 0, 0],
  };
  rower.setPose(sitPose);
  rower.setHand('L', 'grip'); rower.setHand('R', 'grip');
  // oars pivot on the gunwales slightly aft of the rower
  const oars = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.28, 0.06, s * W * 0.98);
    boat.add(pivot);
    const oar = new THREE.Group();
    pivot.add(oar);
    const shaft = place(new THREE.CylinderGeometry(0.016, 0.016, 2.2, 8), [0, 0, 0], [Math.PI / 2, 0, 0]);
    const blade = place(new THREE.BoxGeometry(0.012, 0.13, 0.45), [0, 0, 0.95 + 0.2]);
    const og = mergeGeometries([prep(shaft), prep(blade)]);
    og.translate(0, 0, s * 0.35 * 0); // handle end towards the rower
    const mesh = new THREE.Mesh(og, M.toon('#8a6e50'));
    mesh.position.z = s * 0.72;
    mesh.scale.z = s;
    oar.add(mesh);
    const handle = new THREE.Object3D(); handle.position.set(0, 0, s * (0.72 - 1.1 + 0.08)); mesh.position.z = s * 0.72; oar.add(handle);
    oars.push({ pivot, oar, handle, s });
  }
  let rowing = false, amp = 0, phase = 0;
  const _h = V(), _r = V();
  const poleL = [1, -0.3, -1], poleR = [-1, -0.3, -1];
  function step(dt, t) {
    amp = clamp(amp + (rowing ? 1 : -1) * dt * 1.5, 0, 1);
    phase += dt * 2 * Math.PI * 0.45 * (0.3 + 0.7 * amp);
    const c = Math.cos(phase), sn = Math.sin(phase);
    // oar sweep (yaw) and lift (blade in water during the pull)
    for (const o of oars) {
      o.oar.rotation.y = o.s * (0.45 * c * amp + 0.05);
      o.oar.rotation.x = o.s * (sn > 0 ? 0.05 : -0.18) * amp + o.s * 0.15;
    }
    // rower leans with the stroke
    rower.pose.torso[0] = 0.25 * c * amp + 0.05;
    rower.pose.head[0] = -0.15 * c * amp;
    rower.update(dt, t);
    root.updateMatrixWorld(true);
    // hands on the oar handles
    for (let i = 0; i < 2; i++) {
      const o = oars[i];
      _h.setFromMatrixPosition(o.handle.matrixWorld);
      rower.root.worldToLocal(_r.copy(_h));
      // oar s=+1 is on the boat's +Z side = rower's right when facing -X
      const side = o.s > 0 ? 'R' : 'L';
      rower.ikArm(side, _r, side === 'L' ? poleL : poleR);
    }
    rower.apply(false, true);
    // gentle bob
    boat.rotation.z = Math.sin(t * 1.1) * 0.012 + 0.015 * c * amp;
    boat.rotation.x = Math.sin(t * 0.8) * 0.01;
    boat.position.y = Math.sin(t * 1.3) * 0.008;
  }
  step(0, 0);
  return {
    root, rower, boat,
    update(dt = 0, t = 0) { step(dt, t); },
    row(v = true) { rowing = !!v; },
  };
}

// ===========================================================================
// Public API
// ===========================================================================

const BUILDERS = {
  david: buildDavid,
  margaret: () => buildMargaret(),
  nicholas: buildNicholas,
  soul: buildSoul,
  jakob: () => buildJakob(),
  rower: () => buildJakob({ id: 'rower', bust: false, seated: true, small: true, hat: true }),
  gerard_boar: buildGerard,
  elizabeth_pheasant: buildElizabeth,
  nicholas_deer: buildNicholasDeer,
  david_rabbit: buildDavidRabbit,
  margaret_pigeon: buildMargaretPigeon,
};

/** Build a character rig by id (see list above). */
export function makeCharacter(id) {
  const b = BUILDERS[id];
  if (!b) throw new Error(`makeCharacter: unknown id "${id}". Known: ${Object.keys(BUILDERS).join(', ')}`);
  const rig = b();
  rig.root.userData.rig = rig;
  return rig;
}

/** Build an animal rig. Only 'goat' exists in Plague I. */
export function makeAnimal(kind = 'goat') {
  if (kind !== 'goat') throw new Error(`makeAnimal: unknown kind "${kind}" (known: goat)`);
  const rig = buildGoat();
  rig.root.userData.rig = rig;
  return rig;
}

/** Small rowboat with the rowing figure for the intro. Bow points +X; call row(true) to start rowing. */
export function makeIntroBoat() {
  return buildIntroBoat();
}

export const CHARACTER_IDS = Object.keys(BUILDERS);

// ===========================================================================
// 给后续章节的角色模块用（第二灾 characters_p2.js 等）：构建工具 + 注册新角色。
// 新模块只能单向 import 这里，不能被这里 import（这里顶层 await 了 props.js，反向引用会形成环）。
// ===========================================================================

/** 注册新角色构建函数；注册后 makeCharacter(id) 就能用。重复注册会覆盖并给出警告。 */
export function registerCharacter(id, builder) {
  if (BUILDERS[id]) console.warn(`[characters] registerCharacter: "${id}" 已存在，被覆盖`);
  BUILDERS[id] = builder;
}

export const CHAR_KIT = {
  THREE, mergeGeometries, mergeVertices, RoundedBoxGeometry, MeshSurfaceSampler,
  PALETTE, toon, unlit, canvasTexture, rng, shade, noOutline, animate, wait, Ease,
  INK, OUT, TAU, clamp, lerp, smooth, V,
  matSet, cachedTex, clothTex, ringTex, hairTex, place, prep, sphere, lathe, limbGeo, taperTube,
  headDeform, skullGeo, decalGeo, headSurface, FS, FX, FY, pen, path, line, blob, eye, faceSet, ikTwoBone,
  createRig, skeleton, addHead, handGeo, addHands, addArms, addLegs, torsoGeo, addButtons, hairCapGeo,
  buildHuman, humanIdle, fitAlongY, fitSize, tryProp, makeLeech, blackCube,
  // 现有角色（可在其基础上扩展）
  SKIN_DAVID, paintDavid, buildDavidBody, DAVID_DIMS, DAVID_HEAD, buildDavid,
  SKIN_OLD, paintMargaret, buildMargaret, buildJakob, addShortHair, buildGerard, buildElizabeth, paintPlain, buildMask,
  // 记忆场景一家人用的放样工具（面具、衣服）：光滑头部 / 衣身曲面、飘带、耳朵、毛发贴图、面具眼睛、成套衣物
  spineLoft, ringLoft, ribbonGeo, leafGeo, orient, furTex, softSpot, maskEye, maskNeck, rolledArms, trouserLegs, shirtTorso, openVest, hangingSleeve,
  get makeProp() { return makeProp; },
};
