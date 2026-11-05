// 第三灾（蚊灾和虱灾）道具的公共工具：几何小工具、红漆符号贴图、蚊子模型和蚊群。
// 约定同第二灾：1 单位 = 1 米；道具原点在地面（或挂点），正面朝 +z；物品原点在中心、长轴沿 +x。
// 状态方法返回 Promise，最后一个参数支持 { instant: true }；动画只用 core/tween.js（跟随 engine.timeScale）。
// 材质 / 贴图按键缓存（键名统一带 p3: 前缀），运行时不要改共享材质（物品图标也用同一份）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, unlit, canvasTexture, rng, shade } from './materials.js';
import { animate, Ease } from '../core/tween.js';
import { TAU, clamp, seg, mesh, lathe, rod, merge, hit, motion, woodMaterial } from './props_p2_shared.js';

export { THREE, mergeGeometries, toon, unlit, canvasTexture, rng, shade, animate, Ease, TAU, clamp, seg, mesh, lathe, rod, merge, hit, motion, woodMaterial };

export const INK = '#161514';
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (k) => { const x = clamp(k); return x * x * (3 - 2 * x); };

/** 命名空 Group。 */
export function group(name, parent = null, pos = null) {
  const g = new THREE.Group(); g.name = name || '';
  if (pos) g.position.fromArray(pos);
  if (parent) parent.add(g);
  return g;
}

const CACHE = new Map();
/** 按键缓存（材质、贴图、几何体）。键名请带 p3: 前缀。 */
export function cached(key, make) {
  if (!CACHE.has(key)) CACHE.set(key, make());
  return CACHE.get(key);
}
/** 缓存的描边卡通材质（同色同参数只建一次）。 */
export const tmat = (color, opts = {}) => cached(`p3:toon:${color}:${JSON.stringify(opts)}`, () => toon(color, opts));
/** 缓存的无光照材质。 */
export const umat = (color, opts = {}) => cached(`p3:unlit:${color}:${JSON.stringify(opts, (k, v) => (v && v.isTexture ? v.uuid : v))}`, () => unlit(color, opts));

/** 每个状态方法共用：instant 直接到终态，否则一个 animate 任务。 */
export function play(ms, pose, opts = {}, ease = Ease.inOutSine) {
  if (opts && opts.instant) { pose(1); return Promise.resolve(); }
  return animate(ms, pose, ease);
}

/** 不规则的“土豆形”块：球体按低频噪声起伏（石头、黏土、土堆、贝壳肉）。 */
export function lumpGeo(r = 1, { seed = 1, amp = 0.12, freq = 2.2, w = 28, h = 18, flatBottom = false, squash = [1, 1, 1] } = {}) {
  const g = new THREE.SphereGeometry(r, w, h);
  const p = g.attributes.position, v = new THREE.Vector3();
  const R = rng(seed), ph = [R() * 9, R() * 9, R() * 9, R() * 9, R() * 9, R() * 9];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = Math.sin(v.x * freq + ph[0]) * Math.cos(v.y * freq * 1.3 + ph[1]) + 0.5 * Math.sin(v.z * freq * 2.1 + ph[2] + v.x * 1.7)
      + 0.25 * Math.sin((v.x + v.y) * freq * 3.3 + ph[3]);
    const k = 1 + amp * n;
    let y = v.y * r * k * squash[1];
    if (flatBottom && y < 0) y *= 0.18;
    p.setXYZ(i, v.x * r * k * squash[0], y, v.z * r * k * squash[2]);
  }
  g.computeVertexNormals();
  return g;
}

/** 贴地的柔和阴影圆片（无光照、透明，不挡点击）。 */
export function contactShadow(parent, rx, rz = rx, { y = 0.004, opacity = 0.32, name = 'shadow' } = {}) {
  const tex = cached('p3:tex:shadow', () => canvasTexture(128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.6)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }, { wrap: false }));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2), unlit('#000000', { map: tex, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.name = name; m.renderOrder = 1; m.raycast = () => {};
  parent.add(m);
  return m;
}

/** 贴在表面上的手绘贴花（unlit + 透明）。返回平面网格，默认朝 +z。 */
export function decal(parent, tex, w, h, pos = [0, 0, 0], rot = [0, 0, 0], { name = 'decal', opacity = 1, depthTest = true } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), unlit('#ffffff', { map: tex, transparent: true, opacity, depthWrite: false, depthTest, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.position.fromArray(pos); m.rotation.fromArray(rot); m.name = name; m.raycast = () => {};
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------------------------------------
// 红漆符号（海滩两块石头、Gerard 头皮上的地图）
// ---------------------------------------------------------------------------------------------

/** 一笔手绘线（带一点抖动），canvas 坐标。 */
function wobblyStroke(g, pts, width, color, r) {
  g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  pts.forEach(([x, y], i) => { const jx = (r() - 0.5) * width * 0.25, jy = (r() - 0.5) * width * 0.25; if (i) g.lineTo(x + jx, y + jy); else g.moveTo(x + jx, y + jy); });
  g.stroke();
}
function circlePts(cx, cy, rad, n = 40, start = -0.2, span = TAU + 0.15) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = start + (i / n) * span; out.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 0.96]); }
  return out;
}

/**
 * 石头上的红漆符号贴图（透明底）。kind: 'dot' = 圆圈里一个点（左石 ⊙）；'cross' = 圆圈 + 十字准星（右石 ⊕，竖横线伸出圆外）。
 * drips: 符号下沿往下淌的漆痕数。颜色取自 00:18 / 08:52 的帧：#b8231d。
 */
export function symbolTexture(kind = 'dot', { color = '#b8231d', drips = 3, size = 256 } = {}) {
  return cached(`p3:sym:${kind}:${color}:${drips}:${size}`, () => canvasTexture(size, size, (g, w) => {
    const r = rng(kind === 'dot' ? 31 : 37), c = w / 2, rad = w * 0.27, lw = w * 0.045;
    g.clearRect(0, 0, w, w);
    wobblyStroke(g, circlePts(c, c, rad), lw, color, r);
    if (kind === 'dot') {
      g.fillStyle = color; g.beginPath(); g.arc(c + w * 0.01, c + w * 0.01, w * 0.045, 0, TAU); g.fill();
    } else {
      wobblyStroke(g, [[c, c - rad * 1.42], [c + w * 0.004, c + rad * 1.38]], lw, color, r);
      wobblyStroke(g, [[c - rad * 1.42, c - w * 0.004], [c + rad * 1.4, c + w * 0.006]], lw, color, r);
    }
    // 往下淌的漆痕
    for (let i = 0; i < drips; i++) {
      const x = c + (r() - 0.5) * rad * 1.5, y0 = c + rad * (0.55 + r() * 0.35), len = w * (0.05 + r() * 0.1);
      wobblyStroke(g, [[x, y0], [x + (r() - 0.5) * 2, y0 + len]], lw * (0.45 + r() * 0.25), color, r);
      g.fillStyle = color; g.beginPath(); g.arc(x, y0 + len, lw * 0.32, 0, TAU); g.fill();
    }
  }, { wrap: false }));
}

/**
 * Gerard 头皮上的“地图”（04:20）：左 ⊙、右 ⊕，中间一条横线，横线中点上方一个向下的箭头。
 * 深棕墨线，透明底，宽高比 2:1。
 */
export function scalpMapTexture({ color = '#3a2414' } = {}) {
  return cached(`p3:scalpmap:${color}`, () => canvasTexture(512, 256, (g, w, h) => {
    const r = rng(53), lw = 7, cy = h * 0.58;
    g.clearRect(0, 0, w, h);
    wobblyStroke(g, circlePts(w * 0.2, cy, 34), lw, color, r);
    g.fillStyle = color; g.beginPath(); g.arc(w * 0.2, cy, 6, 0, TAU); g.fill();
    wobblyStroke(g, circlePts(w * 0.8, cy, 34), lw, color, r);
    wobblyStroke(g, [[w * 0.8, cy - 48], [w * 0.8, cy + 48]], lw, color, r);
    wobblyStroke(g, [[w * 0.8 - 48, cy], [w * 0.8 + 48, cy]], lw, color, r);
    wobblyStroke(g, [[w * 0.2 + 40, cy + 2], [w * 0.5, cy + 4], [w * 0.8 - 52, cy]], lw * 0.8, color, r);
    wobblyStroke(g, [[w * 0.5, cy - 70], [w * 0.5, cy - 14]], lw * 0.8, color, r);
    wobblyStroke(g, [[w * 0.5 - 14, cy - 30], [w * 0.5, cy - 12], [w * 0.5 + 14, cy - 30]], lw * 0.8, color, r);
  }, { wrap: false }));
}

// ---------------------------------------------------------------------------------------------
// 蚊子：单只模型（物品“蚊子”、特写）与蚊群（InstancedMesh）
// ---------------------------------------------------------------------------------------------

/**
 * 一只蚊子的合并几何体：细长身体 + 小头 + 尖嘴 + 两片翅膀 + 六条细腿。长度 len（米），朝 +x，背朝 +y。
 * detail=false 时只有身体和翅膀（蚊群用，顶点少）。
 */
export function mosquitoGeometry(len = 0.012, { detail = false } = {}) {
  const key = `p3:geo:mosq:${len}:${detail}`;
  return cached(key, () => {
    const s = len, parts = [];
    const body = new THREE.SphereGeometry(1, detail ? 10 : 6, detail ? 8 : 4); body.scale(s * 0.36, s * 0.07, s * 0.07); body.translate(-s * 0.08, 0, 0); parts.push(body);
    const thorax = new THREE.SphereGeometry(1, detail ? 10 : 6, detail ? 8 : 4); thorax.scale(s * 0.13, s * 0.1, s * 0.1); thorax.translate(s * 0.3, s * 0.01, 0); parts.push(thorax);
    const head = new THREE.SphereGeometry(1, detail ? 8 : 5, detail ? 6 : 4); head.scale(s * 0.065, s * 0.065, s * 0.065); head.translate(s * 0.45, 0, 0); parts.push(head);
    if (detail) parts.push(rod([s * 0.5, -s * 0.01, 0], [s * 0.78, -s * 0.06, 0], s * 0.012, 4, s * 0.004));
    for (const z of [-1, 1]) {
      const wing = new THREE.BufferGeometry();
      const v = [s * 0.32, s * 0.06, 0, s * 0.02, s * 0.13, z * s * 0.32, -s * 0.12, s * 0.09, z * s * 0.2];
      wing.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); wing.setIndex([0, 1, 2]); wing.computeVertexNormals();
      parts.push(wing);
      if (detail) for (let i = 0; i < 3; i++) {
        const x = s * (0.36 - i * 0.07);
        parts.push(rod([x, -s * 0.04, z * s * 0.03], [x - s * 0.18 + i * s * 0.1, -s * 0.4, z * s * 0.34], s * 0.008, 3, s * 0.004));
      }
    }
    const geo = mergeGeometries(parts.map((g) => { const c = g.index ? g.toNonIndexed() : g; c.deleteAttribute('uv'); return c; }));
    return geo;
  });
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/**
 * 蚊群（最多 count 只，InstancedMesh，一个 draw call）。所有坐标是蚊群根节点的局部坐标。
 *   setCloud(center, radii)        绕着 center 的椭球里乱飞（原作里围着人嗡嗡转的那一团）
 *   setCover(points)               落点数组（[x,y,z] 或 Vector3）：蚊子“趴”在这些点上抖动，看起来像黑色的毛团
 *   setMix(k)                      0 = 全在空中飞，1 = 全部落在 cover 点上（每只有自己的阈值，逐渐覆盖）
 *   setCount(n)                    显示几只
 *   setAway(k)                     0..1：按顺序一只只飞走（往外上方飞远、变小消失），k=1 全部飞走
 *   gather({ms, instant}) / flyAway({ms, instant, to}) → Promise   setMix / setAway 的动画版本
 *   update(dt, t)                  每帧调用（章节用 ctx.register('prop', id, swarm)）
 * opts: { count = 160, len = 0.012, color = '#151515', seed = 7, speed = 1 }
 */
export function makeGnatSwarm({ count = 160, len = 0.012, color = '#151515', seed = 7, speed = 1 } = {}) {
  const root = group('p3_gnats');
  const mat = tmat(color, { outline: false, side: THREE.DoubleSide });
  const inst = new THREE.InstancedMesh(mosquitoGeometry(len), mat, count);
  inst.name = 'gnats'; inst.frustumCulled = false; inst.castShadow = false; inst.raycast = () => {};
  root.add(inst);
  const R = rng(seed);
  const G = Array.from({ length: count }, (_, i) => ({
    ph: [R() * TAU, R() * TAU, R() * TAU], sp: (0.7 + R() * 0.9) * speed, thr: R(), away: R(), dir: new THREE.Vector3(R() - 0.5, 0.35 + R() * 0.6, R() - 0.5).normalize(),
    yaw: R() * TAU, cover: null, idx: i,
  }));
  const st = { center: new THREE.Vector3(0, 1, 0), radii: new THREE.Vector3(0.4, 0.4, 0.4), mix: 0, away: 0, n: count, t: 0 };
  let cover = [];
  root.setCloud = (center = [0, 1, 0], radii = [0.4, 0.4, 0.4]) => {
    st.center.fromArray(Array.isArray(center) ? center : center.toArray());
    st.radii.fromArray(Array.isArray(radii) ? radii : [radii, radii, radii]);
    return root;
  };
  root.setCover = (points = []) => {
    cover = points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3().fromArray(p)));
    G.forEach((g, i) => { g.cover = cover.length ? cover[(i * 7919) % cover.length] : null; });
    return root;
  };
  root.setMix = (k) => { st.mix = clamp(k); return root; };
  root.setAway = (k) => { st.away = clamp(k); return root; };
  root.setCount = (n) => { st.n = Math.max(0, Math.min(count, n | 0)); inst.count = st.n; return root; };
  root.gather = ({ ms = 3000, instant = false } = {}) => play(ms, (k) => { st.mix = k; }, { instant }, Ease.inOutSine);
  root.flyAway = ({ ms = 2200, instant = false, to = 1 } = {}) => {
    const from = st.away;
    return play(ms, (k) => { st.away = lerp(from, to, k); }, { instant }, Ease.linear);
  };
  root.getState = () => ({ mix: st.mix, away: st.away, n: st.n });
  const pose = () => {
    const t = st.t;
    for (let i = 0; i < st.n; i++) {
      const g = G[i];
      // 空中：椭球内的利萨如轨迹 + 高频抖动
      const a = t * g.sp * 1.7 + g.ph[0], b = t * g.sp * 1.3 + g.ph[1], c = t * g.sp * 2.1 + g.ph[2];
      _p.set(Math.sin(a) * Math.cos(b * 0.7), Math.sin(b) * 0.8 + Math.sin(c * 2.3) * 0.15, Math.cos(a * 0.9 + c * 0.2)).multiply(st.radii).add(st.center);
      // 落下：逐只按阈值过渡到 cover 点（在点上轻微爬动）
      const land = g.cover ? smooth((st.mix - g.thr * 0.85) / 0.15) : 0;
      if (land > 0) {
        const cx = g.cover.x + Math.sin(t * 3 + g.ph[0]) * len * 0.35, cy = g.cover.y + Math.sin(t * 2.6 + g.ph[1]) * len * 0.25, cz = g.cover.z + Math.cos(t * 3.4 + g.ph[2]) * len * 0.35;
        _p.set(lerp(_p.x, cx, land), lerp(_p.y, cy, land), lerp(_p.z, cz, land));
      }
      // 飞走：按 away 阈值依次离开
      const go = smooth((st.away - g.away * 0.8) / 0.2);
      let sc = 1;
      if (go > 0) { _p.addScaledVector(g.dir, go * 2.6); _p.y += go * go * 0.8; sc = 1 - go; }
      _e.set(Math.sin(t * 9 + g.ph[0]) * 0.4, g.yaw + (land > 0.5 ? 0 : t * g.sp), Math.sin(t * 7 + g.ph[1]) * 0.3);
      _q.setFromEuler(_e);
      _s.setScalar(Math.max(0.0001, sc));
      _m.compose(_p, _q, _s);
      inst.setMatrixAt(i, _m);
    }
    inst.instanceMatrix.needsUpdate = true;
  };
  root.update = (dt, t) => { st.t = t; pose(); };
  root.setCount(count);
  pose();
  return root;
}

// ---------------------------------------------------------------------------------------------
// 陶轮造型数据（小屋陶轮 p3_pottery_wheel、花瓶物品 p3_vase_slim / p3_vase_urn、墙上的花瓶草图共用）
// 参考 11:24–11:56（细颈花瓶）、12:24–12:38（宽口罐）：陶土分上中下三段，点一段就换成下一种形状（循环）。
// 每种变体是该段的外轮廓 [半径, 段内高度]（米，自下而上）；段与段之间允许有台阶，原作的接缝线也是这样。
// ---------------------------------------------------------------------------------------------

export const POT = {
  segH: [0.11, 0.12, 0.11],                       // 下、中、上三段的高度（总高 0.34 m）
  names: { bottom: ['lump', 'taper', 'foot', 'wide'], mid: ['lump', 'waist', 'bulge', 'round'], top: ['dome', 'collar', 'neck', 'flare'] },
  variants: {
    bottom: [
      [[0.098, 0], [0.102, 0.05], [0.1, 0.11]],                                        // 0 lump：泥团的直筒底
      [[0.056, 0], [0.074, 0.05], [0.098, 0.11]],                                      // 1 taper：往下收窄
      [[0.062, 0], [0.064, 0.012], [0.05, 0.03], [0.06, 0.07], [0.088, 0.11]],         // 2 foot：小圈足 + 细腰往上张开（细颈瓶）
      [[0.082, 0], [0.1, 0.05], [0.118, 0.11]],                                        // 3 wide：宽底（罐）
    ],
    mid: [
      [[0.1, 0], [0.103, 0.06], [0.098, 0.12]],                                        // 0 lump
      [[0.095, 0], [0.068, 0.06], [0.09, 0.12]],                                       // 1 waist：内凹的腰
      [[0.088, 0], [0.118, 0.06], [0.09, 0.12]],                                       // 2 bulge：鼓起的肩（细颈瓶）
      [[0.118, 0], [0.13, 0.05], [0.112, 0.12]],                                       // 3 round：圆鼓的罐肚
    ],
    top: [
      [[0.098, 0], [0.092, 0.045], [0.066, 0.088], [0.03, 0.106], [0, 0.11]],          // 0 dome：圆顶泥团（封口）
      [[0.112, 0], [0.088, 0.05], [0.073, 0.08], [0.082, 0.094], [0.082, 0.11]],       // 1 collar：短而宽的口沿（罐）
      [[0.09, 0], [0.05, 0.05], [0.04, 0.09], [0.041, 0.11]],                          // 2 neck：细直颈
      [[0.09, 0], [0.045, 0.05], [0.036, 0.085], [0.062, 0.11]],                       // 3 flare：细颈 + 外翻喇叭口（细颈瓶）
    ],
  },
  start: [0, 0, 0],                                // 新放上去的泥团：[下, 中, 上] 变体
  targets: { slim: [2, 2, 3], urn: [3, 3, 1] },    // 墙上两张草图：上面的细颈花瓶、下面的宽口罐
  segs: ['bottom', 'mid', 'top'],
};

/** 某一段某变体的外轮廓（绝对高度，自下而上）。seg: 0 下 / 1 中 / 2 上。 */
export function potSegment(seg, variant) {
  const key = POT.segs[seg];
  const y0 = POT.segH.slice(0, seg).reduce((a, b) => a + b, 0);
  return POT.variants[key][((variant % 4) + 4) % 4].map(([r, y]) => [r, y0 + y]);
}

/** 整只器形的外轮廓（三段拼起来，接缝处上下两点都保留，会出现台阶）。shape = [下, 中, 上]。 */
export function potProfile(shape = POT.start) {
  return [0, 1, 2].flatMap((s) => potSegment(s, shape[s]));
}

/** 这个器形的口是否开着（上段不是圆顶）。 */
export const potOpen = (shape) => (shape?.[2] ?? 0) !== 0;

/** 器形的线稿（墙上的草图、调试用）：画在 canvas 上，中心线 x = cx，底部 y = by，ppm = 每米像素。 */
export function drawPotOutline(g, shape, cx, by, ppm, { color = 'rgba(60,58,54,0.85)', width = 3 } = {}) {
  const prof = potProfile(shape);
  g.strokeStyle = color; g.lineWidth = width; g.lineJoin = 'round'; g.lineCap = 'round';
  const pts = prof.map(([r, y]) => [r * ppm, by - y * ppm]);
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(cx - x, y) : g.moveTo(cx - x, y)));
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(cx + pts[i][0], pts[i][1]);
  if (!potOpen(shape)) g.closePath();
  g.lineTo(cx - pts[0][0], pts[0][1]);
  g.stroke();
  if (potOpen(shape)) { const [r, y] = pts[pts.length - 1]; g.beginPath(); g.ellipse(cx, y, r, r * 0.22, 0, 0, TAU); g.stroke(); }
}

/**
 * 被蚊子盖住的“黑色毛茸茸的斑块”（06:10–06:18 David 和幼虫身上那样）：贴着若干胶囊外面的一层黑壳，
 * 按覆盖度一块块长出来（3D 噪声，斑块边缘是毛刺状）。和飞舞的蚊群（makeGnatSwarm）叠在一起用。
 *   caps: [[a, b, r], …]（a、b 是局部坐标 [x,y,z]，r 半径），opts: { color, seed, fuzz 表面起伏, inflate 外扩, scale 斑块密度 }
 *   setCover(k 0..1)：0 = 看不见，1 = 全部盖满；getCover()
 * 也可以传 { geometry } 代替胶囊：沿法线外扩这份几何体做壳（幼虫这类非胶囊形体）。
 */
export function makeGnatCover(caps, { color = '#141414', seed = 5, fuzz = 0.014, inflate = 0.012, geometry = null, scale = 7 } = {}) {
  const root = group('p3_gnat_cover');
  // 覆盖图案在着色器里按局部坐标的 3D 分形噪声算（不依赖 UV，人和幼虫都能均匀长斑）：噪声 < 覆盖度的地方显示黑色毛壳，
  // 再叠一层高频抖动做毛刺边。uCover 由 setCover 设置；uScale 控制斑块大小（每米多少个噪声格，默认 7）。
  const mat = unlit(color, { side: THREE.DoubleSide });
  const uniforms = { uCover: { value: 0 }, uScale: { value: scale }, uSeed: { value: seed * 0.137 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vGnatPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vGnatPos = position;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vGnatPos; uniform float uCover; uniform float uScale; uniform float uSeed;
float gHash(vec3 p) { p = fract(p * 0.3183099 + uSeed); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i), gHash(i + vec3(1,0,0)), f.x), mix(gHash(i + vec3(0,1,0)), gHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0,0,1)), gHash(i + vec3(1,0,1)), f.x), mix(gHash(i + vec3(0,1,1)), gHash(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
{ vec3 q = vGnatPos * uScale; float n = gNoise(q) * 0.55 + gNoise(q * 2.03) * 0.3 + gNoise(q * 4.1) * 0.15;
  n = clamp((n - 0.5) * 1.9 + 0.5, 0.0, 1.0) + (gHash(floor(vGnatPos * 260.0)) - 0.5) * 0.12;
  if (n > uCover * 1.12 - 0.04) discard; }`);
  };
  mat.customProgramCacheKey = () => 'p3_gnat_cover';
  const R = rng(seed + 11);
  const bump = (g, push) => {
    const p = g.attributes.position, n = g.attributes.normal, ph = [R() * 9, R() * 9, R() * 9];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = push + fuzz * (0.5 + 0.5 * Math.sin(x * 37 + ph[0]) * Math.sin(y * 41 + ph[1]) * Math.sin(z * 43 + ph[2]));
      p.setXYZ(i, x + n.getX(i) * k, y + n.getY(i) * k, z + n.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  };
  const parts = [];
  if (geometry) {
    const g = geometry.clone(); if (!g.attributes.normal) g.computeVertexNormals();
    parts.push(bump(g, inflate));
  } else {
    for (const [a, b, r] of caps) {
      const A = new THREE.Vector3().fromArray(a), B = new THREE.Vector3().fromArray(b), d = B.clone().sub(A);
      const g = new THREE.CapsuleGeometry(r, Math.max(0.001, d.length()), 8, 18);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
      g.translate(...A.clone().add(B).multiplyScalar(0.5).toArray());
      parts.push(bump(g, inflate));
    }
  }
  const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  const m = new THREE.Mesh(geo, mat); m.name = 'gnat_cover'; m.castShadow = false; m.raycast = () => {};
  root.add(m);
  let k = 0;
  root.setCover = (v) => { k = clamp(v); uniforms.uCover.value = k; m.visible = k > 0.002; return root; };
  root.getCover = () => k;
  root.setCover(0);
  return root;
}

/** 在若干个“胶囊”（线段 + 半径）表面上均匀撒点：给蚊群当 cover 落点（人身上、幼虫身上）。 */
export function capsulePoints(caps, n = 300, seed = 11) {
  const R = rng(seed), out = [];
  const lens = caps.map(([a, b, r]) => new THREE.Vector3().fromArray(b).sub(new THREE.Vector3().fromArray(a)).length() + r * 2);
  const total = lens.reduce((x, y) => x + y, 0);
  for (let i = 0; i < n; i++) {
    let pick = R() * total, ci = 0;
    while (ci < caps.length - 1 && pick > lens[ci]) { pick -= lens[ci]; ci++; }
    const [a, b, r] = caps[ci];
    const A = new THREE.Vector3().fromArray(a), B = new THREE.Vector3().fromArray(b);
    const p = A.lerp(B, R());
    const d = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(r * (0.95 + R() * 0.15));
    out.push(p.add(d));
  }
  return out;
}
