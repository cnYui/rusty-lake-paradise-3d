// 第二灾（蛙灾）的青蛙：场景里的青蛙和物品栏里的“青蛙”共用同一个模型。
//
//   makeFrog({ color = 'green' | 'orange' | 'lime' | 'teal' | 'yellow' | '#hex' }) → Group
//
// 约定：原点在青蛙肚子正下方的地面上，头朝 -x，身体侧面朝 +z（正面相机看到的就是物品栏图标里
// 那只侧身蹲着、头朝左的青蛙）。身体合并成一个网格（顶点色：背、肚皮、斑点），眼睛单独一个带
// 金色虹膜的网格，一只青蛙只占 2 个 draw call，岛上放十几只也不贵。
// 方法（都返回 Promise，最后一个参数可传 { instant: true }）：
//   setColor(name|hex)      换颜色（Ida 吹蛙笛时头顶的青蛙会变色）
//   hop(to, { height, ms }) 沿抛物线跳到 to（父坐标系里的 [x, y, z] 或 Vector3），落地压扁回弹
//   croak()                 鼓起喉囊叫一声
//   idle(on)                呼吸 + 偶尔眨眼（update(dt) 驱动，默认开）
// 命名子物体：frog_body、frog_eyes（热点和物品检视用）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, canvasTexture } from './materials.js';
import { animate, Ease } from '../core/tween.js';
import { FACTORIES as INNER } from './props_inner.js';

const PI = Math.PI;
const lerp = (a, b, k) => a + (b - a) * k;
const isInstant = (o) => !!(o && typeof o === 'object' && o.instant);

// 视频里出现过的青蛙颜色（主色、深色斑点 / 背线、肚皮）
export const FROG_COLORS = {
  green:  { base: '#6fae3a', dark: '#3d6a1d', belly: '#c3d27a' },
  orange: { base: '#f0711c', dark: '#a8410c', belly: '#f6b25a' },
  lime:   { base: '#b4e11e', dark: '#6c9612', belly: '#e4f08a' },
  teal:   { base: '#3dbb9b', dark: '#1f7a63', belly: '#a8e2cf' },
  yellow: { base: '#d6e02a', dark: '#8a9416', belly: '#eef29a' },
};

function palette(color) {
  if (FROG_COLORS[color]) return FROG_COLORS[color];
  const c = new THREE.Color(color || '#6fae3a');
  return { base: '#' + c.getHexString(), dark: '#' + c.clone().multiplyScalar(0.55).getHexString(), belly: '#' + c.clone().lerp(new THREE.Color('#fff7c8'), 0.55).getHexString() };
}

// ---------------------------------------------------------------------------------------- 几何
// 每个部件：一个变形球，部件类型决定顶点色怎么算。
const PARTS = [
  // name, center, radii, rot (z, y), kind
  ['body',   [0.012, 0.042, 0], [0.058, 0.036, 0.04], [-0.38, 0], 'body'],
  ['rump',   [0.048, 0.03, 0], [0.032, 0.03, 0.036], [0, 0], 'body'],
  ['head',   [-0.04, 0.06, 0], [0.036, 0.026, 0.034], [-0.12, 0], 'head'],
  ['snout',  [-0.068, 0.056, 0], [0.018, 0.016, 0.022], [-0.1, 0], 'head'],
  ['throat', [-0.046, 0.04, 0], [0.026, 0.018, 0.026], [0.2, 0], 'belly'],
  // 折起来的后腿：大腿 + 小腿 + 脚掌（左右各一）
  ['thighL', [0.04, 0.026, 0.034], [0.034, 0.02, 0.016], [0.5, 0.25], 'leg'],
  ['thighR', [0.04, 0.026, -0.034], [0.034, 0.02, 0.016], [0.5, -0.25], 'leg'],
  ['shinL',  [0.022, 0.012, 0.044], [0.03, 0.01, 0.011], [-0.25, 0.1], 'leg'],
  ['shinR',  [0.022, 0.012, -0.044], [0.03, 0.01, 0.011], [-0.25, -0.1], 'leg'],
  ['footL',  [0.0, 0.004, 0.05], [0.03, 0.005, 0.014], [0, 0.25], 'foot'],
  ['footR',  [0.0, 0.004, -0.05], [0.03, 0.005, 0.014], [0, -0.25], 'foot'],
  // 前腿：从胸口斜撑到地面
  ['armL',   [-0.046, 0.022, 0.022], [0.009, 0.022, 0.009], [-0.3, 0], 'leg'],
  ['armR',   [-0.046, 0.022, -0.022], [0.009, 0.022, 0.009], [-0.3, 0], 'leg'],
  ['handL',  [-0.056, 0.004, 0.026], [0.014, 0.004, 0.012], [0, 0.3], 'foot'],
  ['handR',  [-0.056, 0.004, -0.026], [0.014, 0.004, 0.012], [0, -0.3], 'foot'],
];

// 简单的确定性 3D 噪声（斑点用）
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function spots(p) {
  // 把空间分成小格，每格里随机放一个斑点
  const cell = 0.016;
  const gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell), gz = Math.floor(p.z / cell);
  let best = 9;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const cx = gx + dx, cy = gy + dy, cz = gz + dz;
    if (hash3(cx, cy, cz) > 0.45) continue;
    const ox = (cx + hash3(cz, cx, cy)) * cell, oy = (cy + hash3(cy, cz, cx)) * cell, oz = (cz + hash3(cx + 3, cy, cz)) * cell;
    best = Math.min(best, Math.hypot(p.x - ox, p.y - oy, p.z - oz));
  }
  return best;
}

const geoCache = new Map();
function frogGeometry() {
  if (geoCache.has('body')) return geoCache.get('body');
  const geos = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const [, c, r, rot, kind] of PARTS) {
    const g = new THREE.SphereGeometry(1, 22, 14);
    m.compose(new THREE.Vector3(...c), q.setFromEuler(e.set(0, rot[1], rot[0])), new THREE.Vector3(...r));
    g.applyMatrix4(m);
    // kind 记在 uv.x 里，后面按它上色（0 背 1 头 2 肚 3 腿 4 脚）
    const k = { body: 0, head: 1, belly: 2, leg: 3, foot: 4 }[kind];
    const n = g.attributes.position.count;
    const kinds = new Float32Array(n).fill(k);
    g.setAttribute('kind', new THREE.BufferAttribute(kinds, 1));
    geos.push(g);
  }
  const geo = mergeGeometries(geos.map((g) => { g.deleteAttribute('uv'); return g; }));
  geo.computeVertexNormals();
  geoCache.set('body', geo);
  return geo;
}

function colorize(geo, pal) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, kind = geo.attributes.kind;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const base = new THREE.Color(pal.base), dark = new THREE.Color(pal.dark), belly = new THREE.Color(pal.belly);
  const c = new THREE.Color(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    const ny = nor.getY(i);
    const k = kind.getX(i);
    c.copy(base);
    if (k === 2) c.copy(belly);
    else if (k === 4) c.copy(base).lerp(dark, 0.25);
    else {
      // 下半身朝下的面是浅色肚皮
      const under = THREE.MathUtils.smoothstep(-ny, 0.15, 0.55) * (p.y < 0.05 ? 1 : 0.4);
      c.lerp(belly, k === 3 ? under * 0.4 : under * 0.9);
      // 背上和腿上的深色斑点（头上少一些）
      if (ny > -0.2) {
        const d = spots(p);
        const r = k === 1 ? 0.0035 : 0.0055;
        if (d < r) c.lerp(dark, 0.85);
      }
      // 嘴线：头部侧面一条细深线
      if (k === 1 && p.x < -0.045 && Math.abs(p.y - 0.051 + (p.x + 0.06) * 0.15) < 0.0022 && Math.abs(p.z) > 0.012) c.copy(dark).multiplyScalar(0.7);
    }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const out = geo.clone();
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

let eyeTex = null;
function eyeTexture() {
  if (eyeTex) return eyeTex;
  // 球面 uv：u 绕一圈，v 从下到上。虹膜在 u=0.5（朝外）附近
  eyeTex = canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#d4ad3c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8c85a'; g.beginPath(); g.ellipse(w * 0.5, h * 0.5, w * 0.16, h * 0.3, 0, 0, PI * 2); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.ellipse(w * 0.5, h * 0.52, w * 0.13, h * 0.1, 0, 0, PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(w * 0.46, h * 0.4, 5, 0, PI * 2); g.fill();
  }, { wrap: false });
  return eyeTex;
}

const matCache = new Map();
function bodyMat() {
  if (!matCache.has('body')) matCache.set('body', toon('#ffffff', { vertexColors: true, outline: 0.004 }));
  return matCache.get('body');
}
function eyeMat() {
  if (!matCache.has('eye')) matCache.set('eye', toon('#ffffff', { map: eyeTexture(), outline: 0.004 }));
  return matCache.get('eye');
}
const coloredGeo = new Map();
function bodyGeoFor(pal) {
  const key = pal.base + pal.dark + pal.belly;
  if (!coloredGeo.has(key)) coloredGeo.set(key, colorize(frogGeometry(), pal));
  return coloredGeo.get(key);
}

let eyeGeo = null;
function eyesGeometry() {
  if (eyeGeo) return eyeGeo;
  const parts = [];
  for (const side of [1, -1]) {
    const g = new THREE.SphereGeometry(0.0125, 18, 12);
    // 让虹膜（u=0.5 → -x 方向）朝外侧偏前
    g.rotateY(side > 0 ? -PI / 2 + 0.9 : -PI / 2 - 0.9);
    g.translate(0, 0, side * 0.019);
    parts.push(g);
  }
  eyeGeo = mergeGeometries(parts);
  return eyeGeo;
}

// ---------------------------------------------------------------------------------------- 工厂
export function makeFrog({ color = 'green', scale = 1 } = {}) {
  const root = new THREE.Group();
  root.name = 'frog';
  const pivot = new THREE.Group();     // 跳跃 / 压扁都作用在这里，root 的位置由调用方摆
  pivot.name = 'frog_pivot';
  root.add(pivot);
  let pal = palette(color);
  const body = new THREE.Mesh(bodyGeoFor(pal), bodyMat());
  body.name = 'frog_body';
  body.castShadow = true;
  pivot.add(body);
  const eyes = new THREE.Mesh(eyesGeometry(), eyeMat());
  eyes.name = 'frog_eyes';
  eyes.position.set(-0.05, 0.083, 0);   // 眨眼时绕眼睛中心压扁
  pivot.add(eyes);
  // 喉囊：叫的时候鼓起来
  const sac = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 10), toon(pal.belly, { outline: 0.004 }));
  sac.name = 'frog_sac';
  sac.position.set(-0.056, 0.036, 0);
  sac.scale.setScalar(0.01);
  sac.visible = false;
  pivot.add(sac);
  root.scale.setScalar(scale);

  const st = { t: Math.random() * 10, idle: true, blink: 2 + Math.random() * 3, color, busy: false };

  root.setColor = (c) => {
    pal = palette(c);
    st.color = c;
    body.geometry = bodyGeoFor(pal);
    sac.material.color.set(pal.belly);
    return Promise.resolve();
  };
  root.getColor = () => st.color;

  root.hop = (to, o = {}) => {
    const dest = to && to.isVector3 ? to.clone() : new THREE.Vector3(...to);
    if (isInstant(o)) { root.position.copy(dest); return Promise.resolve(); }
    const from = root.position.clone();
    const height = o.height ?? Math.max(0.12, from.distanceTo(dest) * 0.35);
    const ms = o.ms ?? 520;
    // 朝向落点（头朝 -x）
    const dx = dest.x - from.x, dz = dest.z - from.z;
    if (o.face !== false && Math.hypot(dx, dz) > 1e-3) root.rotation.y = Math.atan2(dz, -dx);
    st.busy = true;
    return animate(ms, (k) => {
      root.position.lerpVectors(from, dest, k);
      root.position.y += Math.sin(k * PI) * height;
      // 起跳拉长、落地压扁
      const s = k < 0.15 ? 1 - 0.18 * Math.sin((k / 0.15) * PI) : k > 0.85 ? 1 - 0.2 * Math.sin(((k - 0.85) / 0.15) * PI) : 1 + 0.1 * Math.sin(((k - 0.15) / 0.7) * PI);
      pivot.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
      pivot.rotation.z = -Math.sin(k * PI * 2) * 0.25;
    }, Ease.linear).then(() => { pivot.scale.set(1, 1, 1); pivot.rotation.z = 0; st.busy = false; });
  };

  root.croak = (o) => {
    if (isInstant(o)) return Promise.resolve();
    sac.visible = true;
    return animate(700, (k) => {
      const v = Math.sin(k * PI * 2) * 0.5 + 0.5;
      sac.scale.setScalar(0.3 + 0.9 * Math.sin(k * PI) * (0.6 + 0.4 * v));
    }, Ease.linear).then(() => { sac.scale.setScalar(0.01); sac.visible = false; });
  };

  root.idle = (on = true) => { st.idle = !!on; return Promise.resolve(); };

  root.update = (dt) => {
    st.t += dt;
    if (!st.idle || st.busy) return;
    // 呼吸：身体轻微起伏，喉咙一鼓一鼓
    const b = Math.sin(st.t * 3.1) * 0.012;
    pivot.scale.set(1 + b * 0.4, 1 + b, 1 + b * 0.4);
    st.blink -= dt;
    if (st.blink < 0) {
      eyes.scale.y = 0.15;
      if (st.blink < -0.12) { eyes.scale.y = 1; st.blink = 2.5 + Math.random() * 4; }
    }
  };
  root.userData.state = st;
  return root;
}

// ======================================================================================= 物品
// 物品约定同 props_beach：原点在物品中心，长轴沿 +x，“图标那一面”朝 +z。
const once = (() => { const m = new Map(); return (k, f) => (m.has(k) ? m.get(k) : (m.set(k, f()), m.get(k))); })();
function mesh(geo, mat, { name, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s, parent } = {}) {
  const o = new THREE.Mesh(geo, mat);
  if (name) o.name = name;
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  if (s !== undefined) { if (Array.isArray(s)) o.scale.set(...s); else o.scale.setScalar(s); }
  o.castShadow = true;
  if (parent) parent.add(o);
  return o;
}
const lathe = (pts, seg = 40) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

/** 陶碗：灰米色，外侧两道浅线。fill: null | 'soup' | 'soup_key'（剩一点汤，汤里躺着钥匙）。 */
export function makeBowl({ fill = null } = {}) {
  const root = new THREE.Group();
  root.name = fill ? `bowl_${fill}` : 'bowl';
  const clay = once('mat:bowl', () => toon('#ffffff', { map: canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#cfc6b3'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b4aa95'; g.fillRect(0, h * 0.18, w, 3); g.fillRect(0, h * 0.3, w, 2);
    g.fillStyle = '#e1d9c8'; g.fillRect(0, h * 0.6, w, 6);
  }) }));
  const inner = once('mat:bowlIn', () => toon('#a89e8a', { outline: false, side: THREE.BackSide }));
  // 外壁（lathe 的 v 从下到上）
  const outer = [[0, 0], [0.034, 0], [0.04, 0.004], [0.052, 0.02], [0.062, 0.042], [0.066, 0.056], [0.064, 0.06]];
  mesh(lathe(outer), clay, { name: 'bowl_body', parent: root, y: -0.03 });
  mesh(lathe([[0, 0.008], [0.03, 0.008], [0.05, 0.026], [0.059, 0.05], [0.0605, 0.058]]), inner, { parent: root, y: -0.03 });
  mesh(new THREE.TorusGeometry(0.0625, 0.0032, 8, 40).rotateX(PI / 2), clay, { parent: root, y: 0.0295 });
  if (fill) {
    const soupM = once('mat:soup', () => toon('#8cc63a', { outline: 0.003 }));
    const level = fill === 'soup' ? 0.022 : 0.004;
    const soup = mesh(new THREE.CircleGeometry(fill === 'soup' ? 0.058 : 0.046, 32).rotateX(-PI / 2), soupM, { name: 'bowl_soup', parent: root, y: level });
    if (fill === 'soup') {
      // 冒出碗沿的一堆起泡的汤
      const r = (i) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * PI * 2 + r(i), d = 0.012 + r(i + 4) * 0.03;
        mesh(new THREE.SphereGeometry(0.012 + r(i + 9) * 0.008, 12, 8), soupM, { parent: root, x: Math.cos(a) * d, y: level + 0.006, z: Math.sin(a) * d, s: [1, 0.6, 1] });
      }
    }
    soup.userData.noBake = true;
    if (fill === 'soup_key') {
      const key = makeProp_key();
      key.name = 'bowl_key_item';
      key.position.set(0, level + 0.004, 0.004);
      key.rotation.set(-PI / 2, 0, 0.3);
      key.scale.setScalar(0.62);
      root.add(key);
    }
  }
  return root;
}
// 钥匙：沿用第一灾的黄铜钥匙模型（props_inner 的 key）。
function makeProp_key() { return INNER.key(); }

/** 点着的蜡烛：奶白色、顶上有蜡泪，黄铜托盘。火苗 child 'candle_flame'，setLit(bool)。 */
export function makeCandle() {
  const root = new THREE.Group();
  root.name = 'candle';
  const wax = once('mat:wax', () => toon('#efe2cf'));
  const brass = once('mat:candleBrass', () => toon('#d9b23a'));
  mesh(lathe([[0, 0], [0.05, 0], [0.054, 0.004], [0.052, 0.008], [0.016, 0.009], [0, 0.009]]), brass, { parent: root, y: -0.05 });
  mesh(new THREE.CylinderGeometry(0.019, 0.02, 0.075, 20), wax, { name: 'candle_wax', parent: root, y: -0.004 });
  // 蜡泪
  for (const [a, l] of [[0.3, 0.02], [1.6, 0.032], [2.7, 0.015], [4.1, 0.026], [5.2, 0.018]]) {
    mesh(new THREE.CapsuleGeometry(0.0045, l, 4, 8), wax, { parent: root, x: Math.cos(a) * 0.0185, y: 0.033 - l / 2, z: Math.sin(a) * 0.0185 });
  }
  mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.012, 6), once('mat:wick', () => toon('#222')), { parent: root, y: 0.038 });
  const flameM = once('mat:flame', () => {
    const m = toon('#ffb02e', { outline: 0.003, emissive: '#ff8a1a' });
    return m;
  });
  const flame = new THREE.Group();
  flame.name = 'candle_flame';
  flame.position.y = 0.046;
  root.add(flame);
  mesh(new THREE.SphereGeometry(0.008, 12, 10).scale(1, 2.1, 1).translate(0, 0.012, 0), flameM, { parent: flame });
  mesh(new THREE.SphereGeometry(0.0045, 10, 8).scale(1, 1.8, 1).translate(0, 0.009, 0), once('mat:flameCore', () => toon('#fff3b0', { outline: false, emissive: '#fff0a0' })), { parent: flame });
  let t = Math.random() * 5;
  root.setLit = (on) => { flame.visible = !!on; return Promise.resolve(); };
  root.update = (dt) => {
    t += dt;
    flame.scale.set(1 + Math.sin(t * 17) * 0.06, 1 + Math.sin(t * 11.3) * 0.12, 1);
    flame.rotation.z = Math.sin(t * 7.7) * 0.08;
  };
  return root;
}

/** 木头：三块交叉的深棕木条（图标里斜放）。 */
export function makeWood() {
  const root = new THREE.Group();
  root.name = 'wood';
  const woodM = once('mat:woodPlank', () => toon('#ffffff', { map: canvasTexture(256, 32, (g, w, h) => {
    g.fillStyle = '#9a6238'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,20,8,0.45)'; g.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0, 5 + i * 7); g.bezierCurveTo(w * 0.3, 3 + i * 7, w * 0.6, 9 + i * 7, w, 5 + i * 7); g.stroke(); }
  }, { wrap: false }) }));
  const plank = (len, w, h) => new THREE.BoxGeometry(len, h * 1.5, w);
  mesh(plank(0.3, 0.035, 0.02), woodM, { parent: root, y: -0.02, rz: 0.04, ry: 0.15 });
  mesh(plank(0.26, 0.03, 0.02), woodM, { parent: root, y: 0.002, z: 0.01, rz: 0.32, ry: -0.2 });
  mesh(plank(0.24, 0.03, 0.018), woodM, { parent: root, y: 0.02, z: -0.012, rz: 0.12, ry: 0.35 });
  return root;
}

/** 腰带：棕色皮带卷成扁环，正面一个金色方扣和一排小孔。 */
export function makeBelt() {
  const root = new THREE.Group();
  root.name = 'belt';
  const leather = once('mat:belt', () => toon('#ffffff', { map: canvasTexture(512, 32, (g, w, h) => {
    g.fillStyle = '#9a5a2c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#6a3a18'; g.fillRect(0, 2, w, 2); g.fillRect(0, h - 4, w, 2);
    g.fillStyle = '#3a1e0c';
    for (let x = 30; x < w; x += 46) { g.beginPath(); g.arc(x, h / 2, 3.2, 0, PI * 2); g.fill(); }
  }) }));
  // 一圈扁带：椭圆路径上的薄管，压扁成带子
  const curve = new THREE.EllipseCurve(0, 0, 0.11, 0.045, 0, PI * 2, false, 0);
  const pts = curve.getPoints(64).map((p) => new THREE.Vector3(p.x, p.y, 0));
  const path = new THREE.CatmullRomCurve3(pts, true);
  const band = new THREE.TubeGeometry(path, 96, 0.012, 6, true);
  band.scale(1, 1, 1.6);
  mesh(band, leather, { name: 'belt_band', parent: root, rx: -0.42 });
  const gold = once('mat:buckle', () => toon('#d7aa2e'));
  const buckle = new THREE.Group();
  buckle.position.set(0, -0.018, 0.043);
  buckle.rotation.x = -0.42;
  buckle.scale.setScalar(1.35);
  root.add(buckle);
  mesh(new THREE.TorusGeometry(0.02, 0.0045, 6, 4, PI * 2).rotateZ(PI / 4).scale(1.25, 0.9, 1), gold, { name: 'belt_buckle', parent: buckle });
  mesh(new THREE.BoxGeometry(0.003, 0.03, 0.004), gold, { parent: buckle });
  return root;
}

/** 蛙笛：亮绿色的直笛，左边吹口，中段三个黑孔，右端喇叭口。 */
export function makeFlute() {
  const root = new THREE.Group();
  root.name = 'frog_flute';
  const green = once('mat:flute', () => toon('#ffffff', { map: canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#9ccc2c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#6f9a14'; g.fillRect(0, h * 0.72, w, h * 0.28);
    g.fillStyle = '#c8e868'; g.fillRect(0, h * 0.18, w, h * 0.12);
  }) }));
  const body = lathe([[0, 0], [0.012, 0], [0.012, 0.02], [0.0135, 0.03], [0.0135, 0.15], [0.016, 0.16], [0.02, 0.19], [0.026, 0.205], [0.024, 0.21], [0, 0.21]], 24);
  body.rotateZ(-PI / 2).translate(-0.105, 0, 0);
  mesh(body, green, { name: 'flute_body', parent: root });
  mesh(new THREE.BoxGeometry(0.03, 0.01, 0.022), green, { parent: root, x: -0.098, y: 0.004 });
  const holeM = once('mat:fluteHole', () => toon('#1d2410', { outline: false }));
  for (const x of [-0.03, -0.005, 0.02]) mesh(new THREE.CircleGeometry(0.0045, 12), holeM, { parent: root, x, y: 0, z: 0.0137 });
  mesh(new THREE.CircleGeometry(0.0035, 10), holeM, { parent: root, x: -0.07, y: 0.004, z: 0.0137 });
  return root;
}

export const FACTORIES = {
  frog: () => makeFrog({ color: 'green' }),
  frog_orange: () => { const f = makeFrog({ color: 'orange' }); f.name = 'frog_orange'; return f; },
  bowl: () => makeBowl(),
  frog_soup: () => makeBowl({ fill: 'soup' }),
  bowl_key: () => makeBowl({ fill: 'soup_key' }),
  candle: () => makeCandle(),
  wood: () => makeWood(),
  belt: () => makeBelt(),
  frog_flute: () => makeFlute(),
};
