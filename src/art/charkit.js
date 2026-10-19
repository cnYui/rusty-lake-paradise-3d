// 人物公共工具：材质缓存、手绘贴图、几何体、头部与脸部绘制、骨架（Bone）与 IK、蒙皮衣物、放样曲面。
// 角色构建（cast.js）、面具（characters.js）和后续章节的角色模块都从这里取工具；本文件不依赖 characters.js / props.js。
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { PALETTE, toon, unlit, canvasTexture, rng, shade, noOutline } from './materials.js';
import { animate, wait, Ease } from '../core/tween.js';

// 道具工厂由 characters.js 在加载 props.js 之后注入（避免循环引用）。
let makeProp = null;
export function setPropFactory(fn) { makeProp = fn; }
export function getPropFactory() { return makeProp; }
// 面具工厂同样由 characters.js 注入：rig.setMask(id) 第一次用到某个面具时调用。
let maskFactory = null;
export function setMaskFactory(fn) { maskFactory = fn; }
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
  boneIndexer(rig);

  // 关节是 THREE.Bone（也是普通 Object3D）：既能挂刚体部件 / 道具，也能驱动蒙皮衣物。
  rig.addJoint = (name, parent, pos = [0, 0, 0], objName = null) => {
    const g = new THREE.Bone();
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
    // 蒙皮网格的骨骼矩阵平时由渲染器每帧更新；这里同步一次，保证不渲染时（自动测试 norender、读档后立即点击）
    // 射线拾取和包围盒用的也是当前姿势
    if (rig.skeleton && !noHooks) {
      root.updateMatrixWorld(true);
      rig.skeleton.update();
      for (const m of rig.skins) m.boundingBox = null;
    }
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
        const m = maskFactory ? maskFactory(rig.mask, rig) : new THREE.Group();
        if (rig.maskScale) m.scale.multiplyScalar(rig.maskScale);
        if (rig.maskOffset) m.position.fromArray(rig.maskOffset);
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
  const mat = mats.toon('#ffffff', { map: ringTex('#5a1a14', '#2a0a08', { n: 14, belly: '#7a2a22' }) });
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
  const orange = mats.toon('#e0603a');
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
  g.add(new THREE.Mesh(mergeGeometries(thin), mats.toon('#c84a2a', { outline: false })));
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
  const liquidMat = mats.toon('#8a1414', { outline: false });
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

// ===========================================================================
// 蒙皮衣物：衣服、袖子、裤腿、裙子是连续的 SkinnedMesh，弯肘、屈膝、坐下时整体变形，不再是一节节硬管子。
// 几何体在“绑定姿势”（所有关节旋转为 0、root 在原点）下按 root 空间坐标建好，每个顶点由 weightFn 给出骨骼权重。
// ===========================================================================

const _wv = new THREE.Vector3();

/**
 * 把一块几何体做成蒙皮网格挂到 rig.root。weightFn(v: root 空间顶点) → [[jointName, weight], ...]（自动归一、取前 4）。
 * 网格先登记，rig.bindSkins() 时统一绑定骨架。
 */
function skinMesh(rig, geo, mat, weightFn, tag = 'skin') {
  geo = geo.index ? geo : geo;
  const pos = geo.attributes.position, n = pos.count;
  const idx = new Uint16Array(n * 4), wts = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    _wv.fromBufferAttribute(pos, i);
    const list = weightFn(_wv).filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sum = 0;
    for (const e of list) sum += e[1];
    if (!list.length || sum <= 0) { list.length = 0; list.push(['body', 1]); sum = 1; }
    list.forEach((e, k) => { idx[i * 4 + k] = rig.boneIndex(e[0]); wts[i * 4 + k] = e[1] / sum; });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.name = `${rig.id}:${tag}`;
  mesh.castShadow = !mat.transparent;
  rig.root.add(mesh);
  (rig.tags[tag] ||= []).push(mesh);
  (rig.skins ||= []).push(mesh);
  return mesh;
}

/** 关节名 → 骨骼序号（第一次调用时按 joints 的登记顺序编号）。 */
function boneIndexer(rig) {
  rig.boneIndex = (name) => {
    if (!rig._bones) rig._bones = Object.keys(rig.joints);
    let i = rig._bones.indexOf(name);
    if (i < 0) { rig._bones.push(name); i = rig._bones.length - 1; }
    if (!rig.joints[name]) throw new Error(`[charkit] ${rig.id}: 蒙皮权重引用了不存在的关节 ${name}`);
    return i;
  };
  /** 在绑定姿势下把所有蒙皮网格绑定到同一副骨架。之后再设置姿势。 */
  rig.bindSkins = () => {
    if (!rig.skins?.length) return;
    const saved = {};
    for (const k in rig.joints) { saved[k] = rig.joints[k].rotation.clone(); rig.joints[k].rotation.set(0, 0, 0); }
    const rp = rig.root.position.clone(), rq = rig.root.quaternion.clone(), rs = rig.root.scale.clone();
    rig.root.position.set(0, 0, 0); rig.root.quaternion.identity(); rig.root.scale.set(1, 1, 1);
    rig.root.updateMatrixWorld(true);
    const names = rig._bones || Object.keys(rig.joints);
    for (const k of Object.keys(rig.joints)) if (!names.includes(k)) names.push(k);
    rig._bones = names;
    const skeleton = new THREE.Skeleton(names.map((k) => rig.joints[k]));
    rig.skeleton = skeleton;
    const H = rig.dims?.height || 2;
    for (const m of rig.skins) {
      m.bind(skeleton, m.matrixWorld);
      // 包围球给足余量：姿势变化后不必每帧重算（视锥剔除和点击射线都用它）
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H * 0.5, 0), H * 1.05);
    }
    rig.root.position.copy(rp); rig.root.quaternion.copy(rq); rig.root.scale.copy(rs);
    for (const k in rig.joints) rig.joints[k].rotation.copy(saved[k]);
    rig.root.updateMatrixWorld(true);
  };
  return rig;
}

/** 平滑阶跃：x 从 a 到 b 时 0 → 1。 */
const step01 = (x, a, b) => smooth(clamp((x - a) / (b - a), 0, 1));

/**
 * 链式权重：s 为沿链（自上而下）的距离，cuts[i] 是第 i 段与第 i+1 段的分界（米），blend 为过渡半宽。
 * names.length = cuts.length + 1。返回 [[name, w], ...]。
 */
function chainWeights(names, cuts, s, blend = 0.04) {
  const out = [];
  let prev = 1;
  for (let i = 0; i < cuts.length; i++) {
    const k = step01(s, cuts[i] - blend, cuts[i] + blend);
    out.push([names[i], prev * (1 - k)]);
    prev *= k;
  }
  out.push([names[names.length - 1], prev]);
  return out;
}

export {
  INK, OUT, TAU, clamp, lerp, smooth, step01, V, FS, FX, FY,
  matSet, cachedTex, clothTex, ringTex, hairTex, place, prep, sphere, lathe, limbGeo, taperTube, PartSet,
  headDeform, skullGeo, decalGeo, headSurface, pen, path, line, blob, eye, faceSet, ikTwoBone,
  createRig, skeleton, addHead, handGeo, addHands, addArms, addLegs, torsoGeo, addButtons, hairCapGeo, buildHuman, humanIdle,
  fitAlongY, fitSize, tryProp, leechGeo, makeLeech, fallbackStick, fallbackHook, fallbackWorm, fallbackShrimp, fallbackGlass, blackCube,
  crs, sePow, densify, ringsGeo, spineLoft, ringLoft, ribbonGeo, leafGeo, orient, furTex, softSpot, maskEye, paintPlain,
  skinMesh, boneIndexer, chainWeights,
  THREE, mergeGeometries, mergeVertices, RoundedBoxGeometry, MeshSurfaceSampler,
  PALETTE, toon, unlit, canvasTexture, rng, shade, noOutline, animate, wait, Ease,
};
