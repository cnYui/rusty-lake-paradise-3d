// 第三灾（蚊灾和虱灾）白桦林：独立布景 p3_grove_set（岩壁 + 白桦 + 深色森林树干），以及林中的道具
// p3_birch / p3_birch_tap / p3_berry_bush / p3_shrine / p3_grove_table / p3_larva / p3_grove_portal。接口见 docs/plague3_api.md §6。
// 约定同第一、二灾：1 单位 = 1 米；道具原点在地面，正面朝 +z；状态方法返回 Promise，最后一个参数支持 { instant: true }；
// 每个有状态的道具都有 setState / getState；动画只用 core/tween.js 的 animate（经 play()）。
// 外观对照参考视频（dev/common/ref/P03_*.mp4）：白桦林 05:06–05:16 / 06:14 / 09:26 / 12:50，神龛 05:14 / 09:28–09:34 / 12:52–13:18，
// 圆桌 05:42–06:04，幼虫 06:14–06:50，割汁 05:34–05:38。
import {
  THREE, TAU, Ease, animate, tmat, umat, group, mesh, lathe, rod, merge, hit, cached, lumpGeo, contactShadow, canvasTexture, rng, play, lerp, smooth, seg, clamp,
  decal, makeGnatSwarm, makeGnatCover, capsulePoints, mergeGeometries, INK, toon, unlit,
} from './props_p3_shared.js';
import { tex } from './materials.js';
import { FACTORIES as ITEMS } from './props_p3_items.js';
import { FACTORIES as INNER } from './props_inner.js';
import { FACTORIES as LAKE } from './props_lake.js';
import { makeStool } from './props_p2_temple.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------------------------
// 布局：林间空地是一个以 C 为圆心的圆形，北面（−z）半圈是岩壁（半径 RW），南面（+z）半圈是深色森林树干，入口在南面的缺口
// ---------------------------------------------------------------------------------------------
const C = { x: 0, z: 5.4 };
const RW = 6.5;                                         // 岩壁半径
const RING = 7.0;                                       // 南面深色树干所在半径
const WALL_FROM = THREE.MathUtils.degToRad(62);         // 岩壁覆盖的方位角范围（自 +z 起，朝 +x 为正）
const WALL_SPAN = THREE.MathUtils.degToRad(236);
const WALL_H = 8.2;
const wallZ = (x) => C.z - Math.sqrt(RW * RW - x * x);  // 岩壁在 x 处的 z（北面）
const faceCenter = (x, z) => Math.atan2(C.x - x, C.z - z); // 面朝圆心时的 rotation.y

/** 各锚点相对布景原点的位置与朝向（yaw = rotation.y）。章节把对应道具摆在这些点上；布景里也有同名 Object3D（grove_*）。 */
export const GROVE_LAYOUT = {
  entry: { pos: [0, 0, 6.4], yaw: 0 },                  // 进来时站的位置（面朝 −z，看得到圆桌、神龛）
  table: { pos: [-0.9, 0, 1.8], yaw: 0 },               // 圆桌中心（David 坐在桌后，座位见 p3_grove_table 的 table_seat）
  larva: { pos: [-0.4, 0, 2.55], yaw: 0 },              // 幼虫中心（长轴沿 x，嘴朝 −x），在圆桌前面
  shrine: { pos: [0.7, 0, wallZ(0.7)], yaw: faceCenter(0.7, wallZ(0.7)) },   // 神龛嵌在岩壁上，原点在壁面
  berries: { pos: [1.5, 0, 2.8], yaw: 0 },              // 浆果丛
  tapBirch: { pos: [-1.75, 0, 2.85], yaw: 0 },          // 可割汁的白桦（含地上的陶罐）
  plant: { pos: [3.0, 0, 2.2], yaw: 0 },                // 空锚点：右侧空地，章节想摆种植类小东西时用
  center: [C.x, 0, C.z], wallRadius: RW, ringRadius: RING, eye: 1.65,
};

/** 布景里的装饰白桦：[x, z, 高, 倾斜, 半径, 种子]。割汁白桦 / 浆果丛旁边的那棵（2.05, 3.3）另算。 */
const SET_BIRCHES = [
  [-3.3, 0.9, 7.2, -0.03, 0.115, 11], [-4.4, 2.5, 6.8, -0.05, 0.105, 12], [-5.0, 4.1, 7.0, -0.04, 0.11, 18],
  [1.4, 1.35, 7.4, 0.02, 0.12, 13], [2.35, 0.6, 6.9, 0.04, 0.11, 14], [3.1, 1.95, 7.0, 0.05, 0.11, 16], [3.75, 1.0, 7.1, 0.06, 0.1, 17],
  [2.1, 3.3, 7.6, 0.01, 0.125, 15], [4.7, 3.4, 7.3, 0.05, 0.11, 19], [-4.3, 5.9, 7.2, -0.04, 0.115, 20], [4.4, 5.8, 6.8, 0.04, 0.11, 21],
  [-3.2, 8.3, 7.0, -0.02, 0.11, 22], [3.3, 8.6, 7.2, 0.03, 0.11, 23],
];

/** 给 views.defineRoamArea 用的可走范围（相对布景原点；布景放在 [600,0,0] 时用 groveRoamAt 换成世界坐标）。 */
function buildRoam() {
  const circles = [];
  // 沿空地外圈排一圈挡圆，把玩家限制在半径约 6.0 以内（岩壁 6.5、深色树干 7.0 之外）
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    circles.push([C.x + Math.sin(a) * 7.1, C.z + Math.cos(a) * 7.1, 1.15]);
  }
  for (const [x, z, , , r] of SET_BIRCHES) circles.push([x, z, Math.max(0.3, r * 2.2)]);
  circles.push([2.1, 3.3, 0.32]);                       // 浆果丛旁的白桦
  circles.push([GROVE_LAYOUT.tapBirch.pos[0], GROVE_LAYOUT.tapBirch.pos[2], 0.32]);
  circles.push([GROVE_LAYOUT.berries.pos[0], GROVE_LAYOUT.berries.pos[2], 0.42]);
  circles.push([GROVE_LAYOUT.table.pos[0], GROVE_LAYOUT.table.pos[2], 0.64]);
  circles.push([GROVE_LAYOUT.table.pos[0], GROVE_LAYOUT.table.pos[2] - 0.62, 0.4]);   // 桌后凳子 + 坐着的 David
  const sx = GROVE_LAYOUT.shrine.pos[0], sz = GROVE_LAYOUT.shrine.pos[2];
  const lx = GROVE_LAYOUT.larva.pos[0], lz = GROVE_LAYOUT.larva.pos[2];
  return {
    bounds: [-7.2, -1.8, 7.2, 12.6],
    circles,
    boxes: [
      [sx - 0.95, sz - 0.2, sx + 0.95, sz + 0.55],      // 神龛（立柱和门框）
      [lx - 0.8, lz - 0.32, lx + 0.85, lz + 0.32],      // 幼虫（出现之前这块地也不能走，章节想放开可自己删）
    ],
    eye: 1.65,
  };
}
export const GROVE_ROAM = buildRoam();
/** 布景放在世界坐标 origin 时的可走范围（世界坐标，可直接交给 defineRoamArea）。 */
export function groveRoamAt(origin = [600, 0, 0]) {
  const [ox, oy, oz] = origin;
  return {
    bounds: [GROVE_ROAM.bounds[0] + ox, GROVE_ROAM.bounds[1] + oz, GROVE_ROAM.bounds[2] + ox, GROVE_ROAM.bounds[3] + oz],
    circles: GROVE_ROAM.circles.map(([x, z, r]) => [x + ox, z + oz, r]),
    boxes: GROVE_ROAM.boxes.map(([x0, z0, x1, z1]) => [x0 + ox, z0 + oz, x1 + ox, z1 + oz]),
    eye: GROVE_ROAM.eye, floor: oy,
  };
}

// ---------------------------------------------------------------------------------------------
// 小工具：变半径管、叶片
// ---------------------------------------------------------------------------------------------

/** 沿曲线的变半径管。UV：x 绕一圈 0..1（+uOff），y 沿长度（米 × vScale）。radius(t) 给出各处半径。 */
function tubeFromCurve(curve, radius, { radial = 8, seg: n = 16, vScale = 1, uOff = 0 } = {}) {
  const g = new THREE.TubeGeometry(curve, n, 1, radial, false);
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  const len = curve.getLength(), c = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const t = i / n, r = radius(t);
    curve.getPointAt(t, c);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      pos.setXYZ(k, c.x + nrm.getX(k) * r, c.y + nrm.getY(k) * r, c.z + nrm.getZ(k) * r);
      uv.setXY(k, j / radial + uOff, t * len * vScale);
    }
  }
  return g;
}
const tubeAlong = (pts, r0, r1 = r0, o = {}) => tubeFromCurve(new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : V(...p)))), (t) => lerp(r0, r1, t), o);

/** 薄实体叶片模板（单位长度，沿 +x，宽沿 y，厚沿 z）：挤出的薄片才有 toon 描边（单面片没有）。 */
const leafTemplate = () => cached('p3:grove:geo:leaf', () => {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.bezierCurveTo(0.35, 0.3, 0.7, 0.26, 1, 0); sh.bezierCurveTo(0.7, -0.26, 0.35, -0.3, 0, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.0235, bevelEnabled: false, curveSegments: 3 });
  g.translate(0, 0, -0.0118);
  return { pos: g.attributes.position.array, nrm: g.attributes.normal.array, n: g.attributes.position.count };
});
/**
 * 把一批叶子合成一个几何体（带顶点色）。list 的每项 = { pos, x, y, z（基向量，x 沿叶长）, len, color }。
 * 直接在类型数组里变换模板顶点（比逐片 clone / 变换快一个数量级）：长 len、厚约 4 mm，叶面沿 y 方向微微隆起。
 */
function buildLeafGeometry(list) {
  const T = leafTemplate(), n = T.n, total = list.length * n;
  const P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3);
  const col = new THREE.Color();
  let o = 0;
  for (const it of list) {
    const { pos, x: bx, y: by, z: bz, len } = it; col.set(it.color);
    for (let i = 0; i < n; i++, o += 3) {
      const px = T.pos[i * 3], py = T.pos[i * 3 + 1], pz = T.pos[i * 3 + 2] * 0.17;
      const X = px * len, Y = py * len, Z = pz + (py / 0.3) ** 2 * 0.04 * len;
      P[o] = pos.x + X * bx.x + Y * by.x + Z * bz.x; P[o + 1] = pos.y + X * bx.y + Y * by.y + Z * bz.y; P[o + 2] = pos.z + X * bx.z + Y * by.z + Z * bz.z;
      const nx = T.nrm[i * 3], ny = T.nrm[i * 3 + 1], nz = T.nrm[i * 3 + 2];
      N[o] = nx * bx.x + ny * by.x + nz * bz.x; N[o + 1] = nx * bx.y + ny * by.y + nz * bz.y; N[o + 2] = nx * bx.z + ny * by.z + nz * bz.z;
      C[o] = col.r; C[o + 1] = col.g; C[o + 2] = col.b;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return g;
}
const _mx = new THREE.Matrix4(), _vx = new THREE.Vector3(), _vy = new THREE.Vector3(), _vz = new THREE.Vector3();
/** 把几何体放到 pos，x 轴指向 dir，roll 为绕 dir 的翻滚（返回同一个几何体）。 */
function placeAlong(g, pos, dir, roll = 0) {
  _vx.copy(dir).normalize();
  _vz.set(Math.abs(_vx.y) > 0.92 ? 1 : 0, Math.abs(_vx.y) > 0.92 ? 0 : 1, 0).cross(_vx).normalize();
  _vz.applyAxisAngle(_vx, roll);
  _vy.crossVectors(_vz, _vx);
  _mx.makeBasis(_vx, _vy, _vz).setPosition(pos);
  return g.applyMatrix4(_mx);
}
/** 叶子用的基向量（新建向量，供 buildLeafGeometry）。 */
function leafBasis(dir, roll) {
  const x = dir.clone().normalize();
  const z = V(Math.abs(x.y) > 0.92 ? 1 : 0, Math.abs(x.y) > 0.92 ? 0 : 1, 0).cross(x).normalize().applyAxisAngle(x, roll);
  const y = new THREE.Vector3().crossVectors(z, x);
  return { x, y, z };
}

// ---------------------------------------------------------------------------------------------
// 白桦：树皮贴图（白底 + 灰黑横斑）、树干 / 枝条 / 树叶的合并几何
// ---------------------------------------------------------------------------------------------

/** 白桦树皮贴图：256 宽绕一圈、512 高（≈1.6 m）；底部 12 像素留白（树根用）。 */
function birchBarkTexture() {
  return cached('p3:grove:tex:birch', () => canvasTexture(256, 512, (g, w, h) => {
    const r = rng(41);
    g.fillStyle = '#f8f6f0'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '120,120,115' : '255,255,250'},${0.04 + r() * 0.07})`; g.fillRect(r() * w, r() * h, 2 + r() * 5, 1 + r() * 3); }
    // 灰黑的横向斑（原作树干上的短横线），边缘一圈深墨线
    for (let i = 0; i < 34; i++) {
      const bw = 18 + r() * 40, bh = 6 + r() * 9, x = r() * w, y = 8 + r() * (h - 36);
      for (const dx of [0, -w]) {
        g.fillStyle = r() < 0.7 ? '#777b7d' : '#8c9092';
        g.strokeStyle = '#2a2c2d'; g.lineWidth = 1.6;
        g.beginPath(); g.roundRect(x + dx, y, bw, bh, bh * 0.4); g.fill(); g.stroke();
      }
    }
    g.fillStyle = '#f8f6f0'; g.fillRect(0, h - 14, w, 14);
  }));
}
const birchBarkMat = () => cached('p3:grove:mat:birch', () => toon('#ffffff', { map: birchBarkTexture(), outline: 0.0055 }));
const birchLeafMat = () => cached('p3:grove:mat:leaf', () => toon('#ffffff', { vertexColors: true, side: THREE.DoubleSide, outline: 0.004 }));

/**
 * 一棵白桦的几何：{ trunk（树干 + 枝条 + 树根，带 UV）, leaves（叶簇，带顶点色）, at(h) 树干在高度 h 处的中心, rAt(h) 半径 }。
 * 形态对照 05:08 / 06:14：细直的白色树干，约 2 m 处分出 V 形的大枝，枝上稀疏的黄绿色叶簇，脚下一圈尖尖的树根。
 */
function buildBirch({ height = 7, lean = 0, seed = 1, r0 = 0.12, leaves = true, density = 1, lf = 0.8 } = {}) {
  const R = rng(seed * 7919 + 17), rr = (a, b) => a + (b - a) * R();
  const ph1 = R() * TAU, ph2 = R() * TAU, k = r0 / 0.12;
  const ctrl = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    ctrl.push(V(lean * height * t * t + Math.sin(t * 4 + ph1) * 0.07 * t, t * height, Math.sin(t * 3 + ph2) * 0.07 * t));
  }
  const curve = new THREE.CatmullRomCurve3(ctrl);
  const rad = (t) => Math.max(0.024, r0 * (1 - 0.74 * Math.pow(t, 0.85)));
  const parts = [], leafParts = [];
  parts.push(tubeFromCurve(curve, rad, { radial: 12, seg: 30, vScale: 1 / 1.6, uOff: R() }));
  const at = (h) => curve.getPoint(clamp(h / height));
  const rAt = (h) => rad(clamp(h / height));
  // 树根：四五片尖尖的扁锥，从树干根部伸向四周
  const nRoots = 4 + ((R() * 2) | 0);
  for (let i = 0; i < nRoots; i++) {
    const a = (i / nRoots) * TAU + R() * 0.5, out = r0 * rr(2.6, 3.4);
    const g = rod([Math.cos(a) * out, 0.004, Math.sin(a) * out], [Math.cos(a) * r0 * 0.4, 0.34 * k + 0.05, Math.sin(a) * r0 * 0.4], 0.012, 5, r0 * 0.62);
    const uv = g.attributes.uv; for (let n = 0; n < uv.count; n++) uv.setXY(n, 0.5, 0.995);
    g.scale(1, 1, 1);
    parts.push(g);
  }
  const leafColors = ['#a9c75a', '#9cc04c', '#b6cf64', '#8fb844'];
  const cluster = (p, dir, n, spread = 0.9, size = 0.19) => {
    if (!leaves) return;
    n = Math.max(3, Math.round(n * lf));
    for (let i = 0; i < n; i++) {
      const d = dir.clone().multiplyScalar(rr(0.5, 1.3)).add(V(rr(-1, 1), rr(-0.7, 1), rr(-1, 1)).multiplyScalar(spread)).normalize();
      const pos = p.clone().addScaledVector(dir, -rr(0, 0.3)).add(V(rr(-0.04, 0.04), rr(-0.04, 0.04), rr(-0.04, 0.04)));
      const len = size * rr(0.78, 1.18);
      leafParts.push({ pos, ...leafBasis(d, R() * TAU), len, color: leafColors[(R() * 4) | 0] });
    }
  };
  // 枝：起点在树干上高度 h，朝方位 az、仰角 el（弧度，自水平线起），长 L，起端半径 rb
  const branch = (h, az, el, L, rb, { twigs = 2, clusters = 1, uOff = R() } = {}) => {
    const p0 = at(h), d = V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const p1 = p0.clone().addScaledVector(d, L * 0.34).add(V(0, L * 0.05, 0));
    const p2 = p0.clone().addScaledVector(d, L * 0.68).add(V(0, L * 0.2, 0));
    const p3 = p0.clone().addScaledVector(d, L).add(V(0, L * 0.4, 0));
    const c = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
    parts.push(tubeFromCurve(c, (t) => lerp(rb, 0.009, Math.pow(t, 0.8)), { radial: 6, seg: 12, vScale: 1 / 1.6, uOff }));
    const dTip = p3.clone().sub(p2).normalize();
    cluster(p3.clone(), dTip, 11 + ((R() * 5) | 0) * density);
    for (let i = 1; i < clusters; i++) { const tt = 1 - i * 0.28, q = c.getPoint(tt), tg = c.getTangent(tt); cluster(q, tg, 8 + ((R() * 4) | 0) * density, 1.1, 0.17); }
    for (let i = 0; i < twigs; i++) {
      const t = rr(0.4, 0.75), q0 = c.getPoint(t), tangent = c.getTangent(t);
      const side = V(rr(-1, 1), rr(0.1, 0.6), rr(-1, 1)).normalize();
      const dd = tangent.clone().multiplyScalar(0.6).add(side.multiplyScalar(0.7)).normalize(), Lt = L * rr(0.28, 0.42);
      const q1 = q0.clone().addScaledVector(dd, Lt * 0.55), q2 = q0.clone().addScaledVector(dd, Lt).add(V(0, Lt * 0.25, 0));
      parts.push(tubeFromCurve(new THREE.CatmullRomCurve3([q0, q1, q2]), (u) => lerp(rb * 0.45, 0.007, u), { radial: 5, seg: 6, vScale: 1 / 1.6, uOff: R() }));
      cluster(q2, q2.clone().sub(q1).normalize(), 8 + ((R() * 3) | 0));
    }
  };
  // 两根大枝（V 形，对着长）+ 往上依次错开的几根小枝
  const az0 = R() * TAU, h0 = rr(1.85, 2.3);
  branch(h0, az0, rr(0.95, 1.2), rr(2.4, 3.1), 0.058 * k, { twigs: 3, clusters: 3 });
  branch(h0 + 0.25, az0 + Math.PI * rr(0.8, 1.2), rr(1.0, 1.25), rr(2.2, 2.9), 0.052 * k, { twigs: 3, clusters: 3 });
  // 树干下段（1.5–2.4 m）上伸出的细小短枝，枝头一簇叶（原作 05:08 左边那棵白桦在这个高度有叶子）
  for (let i = 0; i < 2; i++) {
    const h = rr(1.45, 2.3), az = az0 + 1.6 + i * 3.1 + R(), p0 = at(h), d = V(Math.cos(az) * 0.8, 0.55, Math.sin(az) * 0.8).normalize(), L2 = rr(0.35, 0.6);
    const q1 = p0.clone().addScaledVector(d, L2 * 0.5), q2 = p0.clone().addScaledVector(d, L2).add(V(0, 0.08, 0));
    parts.push(tubeFromCurve(new THREE.CatmullRomCurve3([p0, q1, q2]), (u) => lerp(0.016 * k, 0.006, u), { radial: 5, seg: 6, vScale: 1 / 1.6, uOff: R() }));
    cluster(q2, q2.clone().sub(q1).normalize(), 10, 1.0, 0.18);
  }
  const upper = Math.round(5 * density);
  for (let i = 0; i < upper; i++) {
    const h = lerp(h0 + 0.8, height * 0.86, (i + 0.5) / upper);
    branch(h, az0 + 2.4 * (i + 1) + R(), rr(0.7, 1.15), lerp(2.0, 1.1, h / height) * rr(0.8, 1.1), 0.036 * k, { twigs: 2, clusters: 1 });
  }
  const trunk = mergeGeometries(parts.map((g) => (g.index ? g : g.toNonIndexed())));
  const leafGeoMerged = leafParts.length ? buildLeafGeometry(leafParts) : null;
  parts.forEach((g) => g.dispose());
  return { trunk, leaves: leafGeoMerged, at, rAt, curve };
}

/** 一棵白桦的 Group（树干 + 叶簇 + 脚下的阴影）。 */
function makeBirchObject(opts = {}, name = 'p3_birch') {
  const root = group(name);
  const b = buildBirch(opts);
  const trunk = mesh(root, b.trunk, birchBarkMat(), 'birch_trunk'); trunk.castShadow = false;
  if (b.leaves) { const lv = mesh(root, b.leaves, birchLeafMat(), 'birch_leaves'); lv.castShadow = false; }
  contactShadow(root, (opts.r0 || 0.12) * 4, (opts.r0 || 0.12) * 3.2, { opacity: 0.4 });
  root.userData.birch = b;
  return root;
}

// ---------------------------------------------------------------------------------------------
// 岩壁、地面、深色树干贴图（程序生成）
// ---------------------------------------------------------------------------------------------

/**
 * 灰蓝带斜纹的岩壁（参考 05:42：浅灰蓝底，“\”方向的深浅条纹和细长裂纹，局部泛紫，细颗粒）。w × h 与岩壁弧长 : 高度接近。
 * 为了启动快：大结构（条纹、裂纹、斑块）在 1/2 分辨率上算，放大后再逐像素加一层颗粒。
 */
function rockTexture(w = 1536, h = 384, seed = 3) {
  return cached(`p3:grove:tex:rock:${w}:${h}:${seed}`, () => canvasTexture(w, h, (g, W, H) => {
    const R = rng(seed), K = 2, LW = W / K, LH = H / K;
    const GN = 128, grid = new Float32Array(GN * GN);
    for (let i = 0; i < grid.length; i++) grid[i] = R();
    const vn = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const x0 = xi & (GN - 1), x1 = (xi + 1) & (GN - 1), y0 = (yi & (GN - 1)) * GN, y1 = ((yi + 1) & (GN - 1)) * GN;
      const a = grid[y0 + x0], b = grid[y0 + x1], c2 = grid[y1 + x0], e = grid[y1 + x1];
      return (a + (b - a) * sx) * (1 - sy) + (c2 + (e - c2) * sx) * sy;
    };
    const small = document.createElement('canvas'); small.width = LW; small.height = LH;
    const sg = small.getContext('2d'), img = sg.createImageData(LW, LH), d = img.data;
    const ca = Math.cos(-0.5), sa = Math.sin(-0.5);   // 岩壁圆柱的 u 方向与屏幕左右相反，所以取负角，成屏幕上的“\”向
    const dark = [90, 102, 101], mid = [143, 156, 153], light = [210, 219, 214], purple = [136, 138, 170];
    for (let ly = 0; ly < LH; ly++) {
      for (let lx = 0; lx < LW; lx++) {
        const x = lx * K, y = ly * K;
        const wx = x + 60 * (vn(x / 170 + 3, y / 130 + 5) - 0.5), wy = y + 36 * (vn(x / 190 + 8, y / 110 + 1) - 0.5);   // 域扭曲：让条纹和裂纹有点弯
        const a = wx * ca + wy * sa, b = -wx * sa + wy * ca;
        const n1 = vn(a / 320 + 3.1, b / 34 + 7.7), n2 = vn(a / 110 + 11, b / 9 + 2), n3 = vn(x / 210 + 5, y / 150 + 9), n4 = vn(a / 55 + 1, b / 4.5 + 6);
        let L = 0.5 + 0.7 * (n3 - 0.5) + 0.4 * (n1 - 0.5) + 0.1 * (n2 - 0.5) + 0.07 * (n4 - 0.5);
        const cr = 1 - Math.abs(2 * vn(a / 200 + 40, b / 7 + 13) - 1); L -= 0.4 * Math.pow(cr, 9) * (0.4 + 0.8 * vn(x / 300 + 2, y / 200 + 8));   // 细长的深色裂纹
        L -= 0.5 * Math.max(0, (0.3 - y / H) / 0.3) ** 1.4;                    // 贴图上沿（岩壁顶部）渐暗，融进黑色天幕
        L = Math.max(0, Math.min(1, L));
        const lo = L < 0.5, t = lo ? L / 0.5 : (L - 0.5) / 0.5, A = lo ? dark : mid, B = lo ? mid : light;
        let r = A[0] + (B[0] - A[0]) * t, gg = A[1] + (B[1] - A[1]) * t, bb = A[2] + (B[2] - A[2]) * t;
        const pv = vn(x / 260 + 20, y / 190 + 4); if (pv > 0.58 && L < 0.62) { const q = Math.min(1, (pv - 0.58) / 0.3) * 0.3; r += (purple[0] - r) * q; gg += (purple[1] - gg) * q; bb += (purple[2] - bb) * q; }
        const i4 = (ly * LW + lx) * 4; d[i4] = r; d[i4 + 1] = gg; d[i4 + 2] = bb; d[i4 + 3] = 255;
      }
    }
    sg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(small, 0, 0, W, H);
    // 颗粒：一块 256² 的随机噪点平铺，用 overlay 叠上去（比逐像素改数据快）
    const nc = document.createElement('canvas'); nc.width = nc.height = 256;
    const ng = nc.getContext('2d'), nimg = ng.createImageData(256, 256);
    for (let i = 0; i < nimg.data.length; i += 4) { const v = 128 + (R() - 0.5) * 190; nimg.data[i] = nimg.data[i + 1] = v; nimg.data[i + 2] = v * 1.03; nimg.data[i + 3] = 255; }
    ng.putImageData(nimg, 0, 0);
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.2; g.fillStyle = g.createPattern(nc, 'repeat'); g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }, { wrap: false, anisotropy: 4 }));
}
const rockMat = (tint = '#ffffff') => cached(`p3:grove:mat:rock:${tint}`, () => unlit(tint, { map: rockTexture(), side: THREE.DoubleSide }));

/** 林间空地的地面：灰绿底 + 颗粒 + 一条浅色小路（从入口缺口通到空地中间）+ 树脚下的软阴影。画布 ↔ 世界：x = (px/W − 0.5)·2RG + C.x，z = (py/H − 0.5)·2RG + C.z。 */
const RG = 7.6;
function groundTexture(shadows) {
  return cached('p3:grove:tex:ground', () => canvasTexture(1024, 1024, (g, W, H) => {
    const r = rng(77);
    g.fillStyle = '#a0a591'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 14000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '70,80,60' : '210,215,195'},${0.03 + r() * 0.06})`; g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 2); }
    const px = (x) => ((x - C.x) / (2 * RG) + 0.5) * W, pz = (z) => ((z - C.z) / (2 * RG) + 0.5) * H;
    // 小路：入口缺口 → 空地中间（原作 05:06 浅灰色的 S 形小路）
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [w, col] of [[0.95, 'rgba(188,191,176,0.55)'], [0.62, 'rgba(176,180,163,0.7)']]) {
      g.strokeStyle = col; g.lineWidth = (w / (2 * RG)) * W;
      g.beginPath(); g.moveTo(px(0), pz(12)); g.bezierCurveTo(px(-0.2), pz(9.5), px(0.5), pz(7.2), px(0.1), pz(5.4)); g.bezierCurveTo(px(-0.3), pz(4.2), px(0.4), pz(3.6), px(0.2), pz(3.1)); g.stroke();
    }
    // 树脚下的阴影
    for (const [x, z, , , rt] of shadows) {
      const gr = g.createRadialGradient(px(x), pz(z), 2, px(x), pz(z), (rt * 5.5 / (2 * RG)) * W);
      gr.addColorStop(0, 'rgba(40,45,35,0.42)'); gr.addColorStop(1, 'rgba(40,45,35,0)');
      const rad = (rt * 5.5 / (2 * RG)) * W; g.fillStyle = gr; g.fillRect(px(x) - rad, pz(z) - rad, rad * 2, rad * 2);
    }
    // 外圈渐暗，融进黑暗
    const edge = g.createRadialGradient(W / 2, H / 2, W * 0.36, W / 2, H / 2, W * 0.5);
    edge.addColorStop(0, 'rgba(20,24,20,0)'); edge.addColorStop(1, 'rgba(20,24,20,0.85)');
    g.fillStyle = edge; g.fillRect(0, 0, W, H);
  }, { wrap: false }));
}

/** 深色森林树干 / 背景幕的竖纹贴图。 */
const darkBackdropTexture = () => cached('p3:grove:tex:backdrop', () => canvasTexture(512, 256, (g, w, h) => {
  const r = rng(15);
  g.fillStyle = '#2a2824'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '70,64,54' : '12,11,10'},${0.3 + r() * 0.4})`; g.fillRect(r() * w, 0, 3 + r() * 14, h); }
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, { repeat: [5, 1] }));
const darkTrunkMat = () => cached('p3:grove:mat:darktrunk', () => toon('#ffffff', { map: tex.bark({ light: '#8a8272', dark: '#2f2b25', seed: 21 }), outline: false }));

// ---------------------------------------------------------------------------------------------
// p3_grove_set：整片白桦林布景
// ---------------------------------------------------------------------------------------------
function makeGroveSet({ lights = false } = {}) {
  const root = group('p3_grove_set');
  const wallMat = rockMat();
  // 岩壁（北面 236°）+ 底边的黑线
  const wallGeo = new THREE.CylinderGeometry(RW, RW, WALL_H, 96, 1, true, WALL_FROM, WALL_SPAN);
  const wall = new THREE.Mesh(wallGeo, wallMat); wall.name = 'grove_wall'; wall.position.set(C.x, WALL_H / 2, C.z); wall.raycast = () => {};
  root.add(wall);
  const baseLine = new THREE.Mesh(new THREE.CylinderGeometry(RW - 0.03, RW - 0.03, 0.075, 96, 1, true, WALL_FROM, WALL_SPAN), umat(INK, { side: THREE.DoubleSide }));
  baseLine.name = 'grove_wall_base'; baseLine.position.set(C.x, 0.04, C.z); baseLine.raycast = () => {}; root.add(baseLine);
  // 背景幕：一圈深色，防止从缝里看见外面
  const backdrop = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 12, 48, 1, true), umat('#ffffff', { map: darkBackdropTexture(), side: THREE.BackSide }));
  backdrop.name = 'grove_backdrop'; backdrop.position.set(C.x, 6, C.z); backdrop.raycast = () => {}; root.add(backdrop);
  // 天幕：半球，近地平线一点灰、往上全黑
  const domeTex = cached('p3:grove:tex:dome', () => canvasTexture(8, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#3b413d'); gr.addColorStop(0.45, '#202421'); gr.addColorStop(1, '#101211');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { wrap: false }));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(18, 32, 14, 0, TAU, 0, Math.PI / 2), umat('#ffffff', { map: domeTex, side: THREE.BackSide }));
  dome.name = 'grove_dome'; dome.position.set(C.x, 0, C.z); dome.raycast = () => {}; root.add(dome);
  // 地面
  const ground = new THREE.Mesh(new THREE.CircleGeometry(RG, 72).rotateX(-Math.PI / 2), umat('#ffffff', { map: groundTexture(SET_BIRCHES) }));
  ground.name = 'grove_ground'; ground.position.set(C.x, 0, C.z); ground.receiveShadow = true; ground.raycast = () => {};
  root.add(ground);
  // 白桦：合并成一个树干网格 + 一个叶簇网格
  const trunks = [], leafs = [];
  for (const [x, z, h, lean, r0, seed] of SET_BIRCHES) {
    const b = buildBirch({ height: h, lean, seed, r0, lf: 0.6 });
    const m = new THREE.Matrix4().makeRotationY(seed * 1.3).setPosition(x, 0, z);
    b.trunk.applyMatrix4(m); trunks.push(b.trunk);
    if (b.leaves) { b.leaves.applyMatrix4(m); leafs.push(b.leaves); }
  }
  {   // 浆果丛旁的那棵（不单独做道具，也不在上面的列表里重复）
    const b = buildBirch({ height: 7.6, lean: 0.01, seed: 15, r0: 0.125, lf: 0.6 });
    const m = new THREE.Matrix4().setPosition(2.1, 0, 3.3); b.trunk.applyMatrix4(m); trunks.push(b.trunk); if (b.leaves) { b.leaves.applyMatrix4(m); leafs.push(b.leaves); }
  }
  mesh(root, mergeGeometries(trunks), birchBarkMat(), 'grove_birch_trunks').castShadow = false;
  mesh(root, mergeGeometries(leafs), birchLeafMat(), 'grove_birch_leaves').castShadow = false;
  // 南面的深色森林树干（入口缺口两侧）
  {
    const R = rng(29), geos = [];
    const tr = (phi, rad, rt, hgt = 13) => {
      const g = new THREE.CylinderGeometry(rt * 0.66, rt, hgt, 14, 1, true); g.translate(0, hgt / 2, 0);
      const fl = new THREE.CylinderGeometry(rt, rt * 1.35, 0.7, 14, 1, true); fl.translate(0, 0.35 - 0.0, 0);
      g.attributes.uv.array.forEach((v, i, a) => { if (i % 2 === 1) a[i] = v * 3; });
      fl.attributes.uv.array.forEach((v, i, a) => { if (i % 2 === 1) a[i] = v * 0.3; });
      const m = new THREE.Matrix4().makeRotationY(R() * TAU).setPosition(C.x + Math.sin(phi) * rad, 0, C.z + Math.cos(phi) * rad);
      g.applyMatrix4(m); fl.applyMatrix4(m); geos.push(g, fl);
    };
    for (let a = -62; a <= 62; a += 10) { if (Math.abs(a) < 9) continue; tr(THREE.MathUtils.degToRad(a + (R() - 0.5) * 5), 6.9 + R() * 0.45, 0.42 + R() * 0.4); }
    for (let a = -64; a <= 64; a += 17) { if (Math.abs(a) < 14) continue; tr(THREE.MathUtils.degToRad(a + 6), 7.25, 0.7 + R() * 0.3); }
    tr(THREE.MathUtils.degToRad(63), 6.7, 0.95); tr(THREE.MathUtils.degToRad(-63), 6.7, 0.95);          // 盖住岩壁与树干圈的接缝
    mesh(root, mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))), darkTrunkMat(), 'grove_dark_trunks').castShadow = false;
  }
  // 命名锚点
  const names = { entry: 'grove_entry', table: 'grove_table', larva: 'grove_larva', shrine: 'grove_shrine', berries: 'grove_berries', tapBirch: 'grove_tap_birch', plant: 'grove_plant' };
  for (const [key, name] of Object.entries(names)) {
    const o = new THREE.Object3D(); o.name = name; o.position.fromArray(GROVE_LAYOUT[key].pos); o.rotation.y = GROVE_LAYOUT[key].yaw; root.add(o);
  }
  // 灯光（章节把整片布景放进独立 zone 时用）
  if (lights) {
    const hemi = new THREE.HemisphereLight('#f3f4f1', '#868a7e', 2.25); hemi.name = 'grove_hemi';
    const sun = new THREE.DirectionalLight('#fffdf6', 1.5); sun.name = 'grove_sun'; sun.position.set(-3, 9, 8); sun.target.position.set(0, 0, 0);
    root.add(hemi, sun, sun.target);
  }
  // 飘着的小白点（原作里林间一直有几粒亮点慢慢飘）
  const motes = makeMotes();
  root.add(motes);
  root.update = (dt, t) => motes.userData.tick(t);
  root.userData.layout = GROVE_LAYOUT;
  return root;
}

function makeMotes() {
  const n = 22, R = rng(61), pos = new Float32Array(n * 3), seeds = [];
  for (let i = 0; i < n; i++) seeds.push([R() * TAU, R() * TAU, 0.3 + R() * 0.7, R()]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sprite = cached('p3:grove:tex:mote', () => canvasTexture(32, 32, (c) => { const gr = c.createRadialGradient(16, 16, 0, 16, 16, 15); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32); }, { wrap: false }));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.07, map: sprite, transparent: true, depthWrite: false, sizeAttenuation: true, color: '#ffffff' }));
  pts.name = 'grove_motes'; pts.frustumCulled = false; pts.raycast = () => {};
  pts.userData.tick = (t) => {
    for (let i = 0; i < n; i++) {
      const [a, b, s, k] = seeds[i];
      pos[i * 3] = C.x + Math.sin(a + t * 0.05 * s) * (1.5 + 4.5 * k); pos[i * 3 + 1] = 0.5 + 2.6 * ((k * 7 + t * 0.03 * s) % 1); pos[i * 3 + 2] = C.z - 2.2 + Math.cos(b + t * 0.04 * s) * (2 + 4 * (1 - k));
    }
    g.attributes.position.needsUpdate = true;
  };
  pts.userData.tick(0);
  return pts;
}

// ---------------------------------------------------------------------------------------------
// 动画令牌 / 通用小工具
// ---------------------------------------------------------------------------------------------

/** 按名字的动画令牌：新动画 / setState 作废同名旧动画，读档后迟到的旧动画不会把状态覆盖回去。 */
function makeTok() {
  const m = new Map();
  return {
    next: (key = '') => { const n = (m.get(key) || 0) + 1; m.set(key, n); return n; },
    ok: (key, n) => m.get(key) === n,
    cancelAll: () => { for (const k of [...m.keys()]) m.set(k, m.get(k) + 1); },
  };
}
/** 带令牌的 play：同一个 key 的新动画开始后，旧动画的 pose 不再生效。 */
function runTok(tok, key, ms, pose, opts, ease) {
  const n = tok.next(key);
  return play(ms, (k) => { if (tok.ok(key, n)) pose(k); }, opts, ease);
}
const wait0 = () => Promise.resolve();
const setHit = (h, on) => { if (h) h.visible = !!on; };

/** 贴在树干上的弧形贴花（圆柱面的一段）：中心高度 y、方位角 th（自 +z 起朝 +x 为正）、宽 w、高 h。 */
function trunkDecal(parent, tree, y, th, w, h, map, { name = 'decal' } = {}) {
  const c = tree.at(y), r = tree.rAt(y) * 0.99 + 0.001;
  const g = new THREE.CylinderGeometry(r, r, h, 12, 1, true, th - w / (2 * r), w / r);
  const m = new THREE.Mesh(g, unlit('#ffffff', { map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
  m.position.set(c.x, y, c.z); m.name = name; m.raycast = () => {}; m.renderOrder = 2;
  parent.add(m);
  return m;
}
/** 给 TubeGeometry（索引几何）按比例设置绘制范围：f = 0..1。 */
function tubeDraw(geo, f, seg, radial) { geo.setDrawRange(0, Math.round(clamp(f) * seg) * radial * 6); }

// ---------------------------------------------------------------------------------------------
// 蝴蝶（割汁白桦上的茧孵出来的，可选成就 The Butterfly）：橙色带黑边的四片翅膀，沿 +z 飞
// ---------------------------------------------------------------------------------------------
function wingTexture() {
  return cached('p3:grove:tex:wing', () => canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#e9812a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2a1608'; g.lineWidth = 4;
    for (const [x, y] of [[0.02, 0.1], [0.12, 0.3], [0.1, 0.58], [0.04, 0.85]]) { g.beginPath(); g.moveTo(0, 0.5 * h); g.quadraticCurveTo(x * w * 3, y * h, w * 0.98, (0.06 + y * 0.9) * h); g.stroke(); }
    g.fillStyle = '#f7c25a'; g.beginPath(); g.ellipse(w * 0.45, h * 0.5, w * 0.3, h * 0.22, 0.2, 0, TAU); g.fill();
    g.fillStyle = '#fdf3dc'; for (const [x, y] of [[0.8, 0.3], [0.86, 0.5], [0.8, 0.7], [0.7, 0.88]]) { g.beginPath(); g.arc(x * w, y * h, 4, 0, TAU); g.fill(); }
    g.strokeStyle = '#150a03'; g.lineWidth = 12; g.strokeRect(0, 0, w, h);
  }, { wrap: false }));
}
function makeButterfly() {
  const root = group('p3_butterfly');
  const wm = toon('#ffffff', { map: wingTexture(), side: THREE.DoubleSide, outline: 0.0025 });
  const fore = new THREE.Shape(); fore.moveTo(0, 0.3); fore.bezierCurveTo(0.1, 0.9, 0.7, 1.0, 1, 0.82); fore.bezierCurveTo(0.9, 0.5, 0.75, 0.2, 0.3, 0.08); fore.closePath();
  const hind = new THREE.Shape(); hind.moveTo(0, 0.5); hind.bezierCurveTo(0.2, 0.2, 0.55, -0.05, 0.75, 0.02); hind.bezierCurveTo(0.8, 0.3, 0.6, 0.55, 0.2, 0.62); hind.closePath();
  const wings = [];
  for (const side of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(side * 0.004, 0, 0);
    for (const [shape, z] of [[fore, 0.012], [hind, 0.0]]) {
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false, curveSegments: 6 });
      g.scale(0.075, 0.075, 0.1); g.translate(0, -0.03, z * 0.1);
      g.rotateZ(Math.PI / 2 * -1); g.rotateY(Math.PI / 2);     // 翅膀向 ±x 展开，前缘朝 +z
      const m = new THREE.Mesh(g, wm); m.castShadow = false;
      if (side < 0) m.scale.x = -1;
      w.add(m);
    }
    root.add(w); wings.push(w);
  }
  mesh(root, new THREE.CapsuleGeometry(0.0045, 0.03, 4, 8).rotateX(Math.PI / 2), tmat('#2a1a0e', { outline: 0.002 }), 'bf_body');
  for (const s of [-1, 1]) mesh(root, rod([0, 0.004, 0.026], [s * 0.016, 0.012, 0.05], 0.0007, 3), tmat('#2a1a0e', { outline: false }), 'bf_antenna');
  root.userData.flap = (t) => { const f = 0.15 + 0.6 * (0.5 + 0.5 * Math.sin(t * 24)); wings[0].rotation.z = -f * 1.1; wings[1].rotation.z = f * 1.1; };
  return root;
}

// ---------------------------------------------------------------------------------------------
// p3_birch_tap：可割汁的白桦（05:08 罐子、05:34–05:38 割汁）+ 地上的陶罐 + 割过之后挂出的茧
// ---------------------------------------------------------------------------------------------
const TAP = { h: 1.32, th: 0.6, jug: [0.52, 0.15], pipeN: 40, pipeR: 8 };
function makeBirchTap() {
  const root = group('p3_birch_tap');
  const tok = makeTok();
  const tree = buildBirch({ height: 7.4, lean: 0.015, seed: 31, r0: 0.12, lf: 1 });
  const treeG = group('birch_tree', root);
  mesh(treeG, tree.trunk, birchBarkMat(), 'birch_trunk').castShadow = false;
  if (tree.leaves) mesh(treeG, tree.leaves, birchLeafMat(), 'birch_leaves').castShadow = false;
  contactShadow(root, 0.62, 0.5, { opacity: 0.4 });
  // 树上原本就画着的红叉（05:08 左边那棵白桦上的小红叉）
  const xTex = cached('p3:grove:tex:xmark', () => canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = '#d4603c'; g.lineCap = 'round'; g.lineWidth = 13;
    g.beginPath(); g.moveTo(30, 18); g.lineTo(98, 104); g.moveTo(100, 14); g.lineTo(28, 108); g.stroke();
    g.lineWidth = 5; g.beginPath(); g.moveTo(62, 70); g.lineTo(64, 122); g.stroke();
  }, { wrap: false }));
  trunkDecal(treeG, tree, TAP.h + 0.05, 0.08, 0.13, 0.16, xTex, { name: 'tap_x_mark' });
  // 斧子砍出的 V 形缺口（黑色三角，尖朝树心）
  const notchTex = cached('p3:grove:tex:notch', () => canvasTexture(128, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#0d0d0d'; g.beginPath(); g.moveTo(6, h * 0.5); g.lineTo(w - 2, 4); g.lineTo(w - 2, h - 4); g.closePath(); g.fill();
  }, { wrap: false }));
  const notch = trunkDecal(treeG, tree, TAP.h - 0.005, TAP.th, 0.085, 0.07, notchTex, { name: 'tap_notch' });
  // 弯管：从缺口出来，先上拱再落进罐口（半透明的白灰管，里面能看到树汁）
  const c0 = tree.at(TAP.h), r0 = tree.rAt(TAP.h);
  const P0 = V(c0.x + Math.sin(TAP.th) * r0 * 0.94, TAP.h - 0.006, c0.z + Math.cos(TAP.th) * r0 * 0.94);
  const J = V(TAP.jug[0], 0, TAP.jug[1]);
  const pipeCurve = new THREE.CatmullRomCurve3([P0, V(P0.x + 0.1, P0.y + 0.07, P0.z + 0.04), V(P0.x + 0.27, P0.y + 0.06, J.z - 0.03), V(J.x - 0.03, 0.9, J.z), V(J.x, 0.55, J.z), V(J.x, 0.31, J.z)]);
  const pipeGeo = tubeFromCurve(pipeCurve, () => 0.019, { radial: TAP.pipeR, seg: TAP.pipeN });
  const pipe = mesh(root, pipeGeo, toon('#d4dad9', { transparent: true, opacity: 0.62, outline: 0.0035 }), 'tap_pipe'); pipe.castShadow = false;
  const sapGeo = tubeFromCurve(pipeCurve, () => 0.012, { radial: 6, seg: TAP.pipeN });
  const sapTube = mesh(root, sapGeo, tmat('#efe08c', { outline: false }), 'tap_sap'); sapTube.castShadow = false;
  const stream = mesh(root, new THREE.CylinderGeometry(0.0045, 0.0045, 1, 6).translate(0, -0.5, 0), tmat('#efe08c', { outline: false }), 'tap_stream', [J.x, 0.31, J.z]);
  stream.visible = false;
  // 陶罐（复用物品 p3_sap：空罐 fill:0，放大 2.4 倍；提手朝外）
  const jug = ITEMS.p3_sap({ fill: 0 }); jug.name = 'tap_jug'; jug.scale.setScalar(2.4); jug.position.set(J.x, 0.056 * 2.4, J.z); jug.rotation.y = Math.PI;
  root.add(jug);
  const jugShadow = contactShadow(root, 0.2, 0.17, { opacity: 0.4 }); jugShadow.position.set(J.x, 0.005, J.z);
  // 茧：挂在树干左前方 2.0 m 处，几根丝连着树干
  const cocoon = group('tap_cocoon', root);
  const CY = 2.0, CT = -0.95, cc = tree.at(CY), cr = tree.rAt(CY);
  const A = V(cc.x + Math.sin(CT) * cr * 0.97, CY, cc.z + Math.cos(CT) * cr * 0.97);
  cocoon.position.copy(A);
  const silk = tmat('#efeadb', { outline: 0.002 });
  mesh(cocoon, new THREE.SphereGeometry(0.03, 10, 8).scale(1, 0.7, 0.55), silk, 'cocoon_pad', [0, 0.0, 0.0]);
  mesh(cocoon, rod([0, -0.01, 0.01], [0.004, -0.085, 0.03], 0.0022, 4), silk, 'cocoon_thread');
  const cocoonBody = group('cocoon_body', cocoon, [0.004, -0.175, 0.03]);
  const cocoonTex = cached('p3:grove:tex:cocoon', () => canvasTexture(64, 128, (g, w, h) => {
    g.fillStyle = '#a69f68'; g.fillRect(0, 0, w, h);
    const R = rng(5); g.strokeStyle = 'rgba(70,64,32,0.55)'; g.lineWidth = 2;
    for (let i = 0; i < 16; i++) { const y = (i / 16) * h; g.beginPath(); g.moveTo(0, y + R() * 5); g.quadraticCurveTo(w / 2, y + 8, w, y + R() * 5); g.stroke(); }
    g.strokeStyle = 'rgba(235,230,200,0.5)'; for (let i = 0; i < 10; i++) { g.beginPath(); g.moveTo(R() * w, 0); g.lineTo(R() * w, h); g.stroke(); }
  }));
  mesh(cocoonBody, lathe([[0, -0.09], [0.017, -0.075], [0.03, -0.03], [0.034, 0.015], [0.026, 0.06], [0.011, 0.088], [0, 0.098]], 14), tmat('#ffffff', { map: cocoonTex, outline: 0.0035 }), 'cocoon_shell');
  const slit = mesh(cocoonBody, new THREE.SphereGeometry(0.02, 12, 8).scale(0.45, 1.5, 0.35), tmat('#1c140c', { outline: false }), 'cocoon_slit', [0, 0.035, 0.026]);
  const bf = makeButterfly(); bf.visible = false; root.add(bf);
  // 点击盒
  const tapHit = hit(root, 'tap_hit', [0.34, 2.7, 0.34], [c0.x, 1.5, c0.z]);
  const jugHit = hit(root, 'tap_jug_hit', [0.32, 0.36, 0.32], [J.x, 0.18, J.z]);
  const cocoonHit = hit(root, 'cocoon_hit', [0.2, 0.34, 0.2], [A.x, A.y - 0.15, A.z + 0.03]);
  // ------- 状态
  const S = { tapped: false, filled: false, jugTaken: false, cocoon: 'none' };
  let bfFly = false;
  const apply = () => {
    notch.visible = S.tapped;
    pipe.visible = S.tapped && !S.jugTaken; tubeDraw(pipeGeo, 1, TAP.pipeN, TAP.pipeR);
    sapTube.visible = S.filled && !S.jugTaken; tubeDraw(sapGeo, 1, TAP.pipeN, 6);
    stream.visible = false;
    jug.visible = !S.jugTaken; jugShadow.visible = !S.jugTaken; jug.scale.setScalar(2.4); jug.setFill(S.filled && !S.jugTaken ? 1 : 0);
    setHit(jugHit, !S.jugTaken);
    cocoon.visible = S.cocoon !== 'none'; cocoon.scale.setScalar(1);
    slit.scale.set(1, S.cocoon === 'hatched' ? 1 : 0.001, 1);
    cocoonBody.scale.set(S.cocoon === 'hatched' ? 0.92 : 1, S.cocoon === 'hatched' ? 0.92 : 1, 1);
    setHit(cocoonHit, S.cocoon === 'hanging');
    bf.visible = false; bfFly = false;
    treeG.rotation.set(0, 0, 0);
  };
  apply();
  root.tap = (opts = {}) => {
    S.tapped = true;
    return runTok(tok, 'tap', 1300, (k) => {
      notch.visible = true; notch.scale.set(Math.max(0.001, smooth(seg(k, 0.12, 0.4))), 1, 1);
      treeG.rotation.z = Math.sin(seg(k, 0, 0.35) * 22) * 0.004 * (1 - seg(k, 0, 0.35));
      const f = seg(k, 0.38, 1); pipe.visible = !S.jugTaken && f > 0; tubeDraw(pipeGeo, smooth(f), TAP.pipeN, TAP.pipeR);
      if (k >= 1) apply();
    }, opts, Ease.linear);
  };
  root.fill = (opts = {}) => {
    if (!S.tapped) root.tap({ instant: true });          // 没割过先瞬时割好（instant 同步生效）
    S.tapped = true; S.filled = true;
    return runTok(tok, 'fill', 2600, (k) => {
      sapTube.visible = true; tubeDraw(sapGeo, smooth(seg(k, 0, 0.45)), TAP.pipeN, 6);
      const lv = smooth(seg(k, 0.4, 1)); jug.setFill(lv);
      const fall = seg(k, 0.4, 0.97) > 0 && seg(k, 0.4, 0.97) < 1;
      stream.visible = fall; const top = 0.31, bottom = 0.056 * 2.4 - 0.05 * 2.4 + 0.1 * 2.4 * lv * 0.5 + 0.13; stream.scale.y = Math.max(0.001, top - bottom);
      if (k >= 1) apply();
    }, opts, Ease.linear);
  };
  root.takeJug = (opts = {}) => {
    S.jugTaken = true;
    return runTok(tok, 'jug', 600, (k) => {
      jug.scale.setScalar(Math.max(0.001, 2.4 * (1 - smooth(k))));
      tubeDraw(pipeGeo, 1 - smooth(k), TAP.pipeN, TAP.pipeR); tubeDraw(sapGeo, 1 - smooth(k), TAP.pipeN, 6);
      if (k >= 1) apply();
    }, opts, Ease.linear);
  };
  root.showCocoon = (on = true, opts = {}) => {
    S.cocoon = on ? 'hanging' : 'none';
    if (!on) { apply(); return Promise.resolve(); }
    return runTok(tok, 'cocoon', 900, (k) => { cocoon.visible = true; cocoon.scale.setScalar(Math.max(0.001, Ease.outBack(k))); if (k >= 1) apply(); }, opts, Ease.linear);
  };
  root.hatch = (opts = {}) => {
    S.cocoon = 'hatched';
    if (opts && opts.instant) { apply(); return Promise.resolve(); }
    const from = A.clone().add(V(0.004, -0.175 + 0.035, 0.05));
    const path = new THREE.CatmullRomCurve3([from, from.clone().add(V(0.05, 0.12, 0.1)), from.clone().add(V(0.35, 0.45, 0.4)), from.clone().add(V(0.5, 0.9, 0.9)), from.clone().add(V(0.2, 1.7, 1.6)), from.clone().add(V(-0.3, 2.6, 2.4))]);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    return runTok(tok, 'hatch', 4800, (k) => {
      cocoon.visible = true;
      slit.scale.set(1, Math.max(0.001, smooth(seg(k, 0, 0.18))), 1); cocoonBody.scale.set(lerp(1, 0.92, seg(k, 0.1, 0.3)), lerp(1, 0.92, seg(k, 0.1, 0.3)), 1);
      const f = seg(k, 0.2, 1); bf.visible = f > 0 && f < 1; bfFly = bf.visible;
      if (bf.visible) {
        const t = smooth(f); path.getPoint(t, a); path.getPoint(Math.min(1, t + 0.02), b);
        bf.position.copy(a); bf.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); bf.rotation.x = -Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)) * 0.8;
        bf.scale.setScalar(Math.max(0.2, 1 - seg(f, 0.8, 1) * 0.8) * (0.6 + 0.4 * seg(f, 0, 0.2)));
      }
      if (k >= 1) apply();
    }, opts, Ease.linear);
  };
  root.setState = (s = {}) => {
    tok.cancelAll();
    Object.assign(S, { tapped: false, filled: false, jugTaken: false, cocoon: 'none' }, s);
    if (S.filled) S.tapped = true;
    apply();
    return Promise.resolve();
  };
  root.getState = () => ({ ...S });
  root.update = (dt, t) => {
    if (bfFly) bf.userData.flap(t);
    if (cocoon.visible && S.cocoon === 'hanging') cocoonBody.rotation.z = Math.sin(t * 1.4) * 0.05;
  };
  root.userData.tree = tree;
  root.userData.jugWorld = () => jug.getWorldPosition(new THREE.Vector3());
  return root;
}

// ---------------------------------------------------------------------------------------------
// p3_berry_bush：浆果丛（05:08 右下、05:10–05:12 特写：一丛大圆叶 + 一串红色大浆果）。浆果复用物品 p3_berries 放大。
// ---------------------------------------------------------------------------------------------
function makeBerryBush() {
  const root = group('p3_berry_bush');
  const tok = makeTok();
  contactShadow(root, 0.42, 0.3, { opacity: 0.4 });
  const stem = tmat('#4c7a30', { outline: 0.004 });
  mesh(root, tubeAlong([V(0, 0, 0), V(0.01, 0.12, 0.01), V(-0.02, 0.24, 0.02), V(-0.05, 0.34, 0.03)], 0.02, 0.011, { radial: 8, seg: 14 }), stem, 'bush_stem');
  // 大圆叶：卵形，近地两片最大
  const leafShape = (len, w) => { const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(len * 0.12, w * 0.7, len * 0.78, w * 0.62, len, 0); s.bezierCurveTo(len * 0.78, -w * 0.62, len * 0.12, -w * 0.7, 0, 0); return s; };
  const bigLeaf = (len, w) => {
    const g = new THREE.ExtrudeGeometry(leafShape(len, w), { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 10 });
    g.translate(0, 0, -0.005);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + (p.getY(i) / (w * 0.6)) ** 2 * w * 0.12 + Math.sin((p.getX(i) / len) * Math.PI) * len * 0.05);
    g.computeVertexNormals();
    return g;
  };
  const leafA = tmat('#547f32'), leafB = tmat('#41702a');
  const leaves = [   // [起点, 方向, 长, 宽, 材质]
    [[0.0, 0.1, 0.01], [0.9, 0.35, 0.2], 0.27, 0.19, leafA], [[0.0, 0.16, 0.02], [0.55, -0.1, 0.8], 0.25, 0.17, leafB],
    [[-0.01, 0.22, 0.0], [-0.95, 0.25, 0.1], 0.22, 0.15, leafA], [[-0.03, 0.3, 0.03], [0.3, 0.9, 0.2], 0.2, 0.14, leafB], [[0.0, 0.07, 0.0], [-0.5, 0.05, 0.85], 0.2, 0.15, leafB],
  ];
  for (const [o, d, len, w, m] of leaves) mesh(root, placeAlong(bigLeaf(len, w), V(...o), V(...d), 0.35), m, 'bush_leaf');
  // 浆果串（复用物品 p3_berries，去掉它自带的两片小叶）
  const cluster = ITEMS.p3_berries(); cluster.name = 'bush_berries';
  cluster.traverse((o) => { if (o.name === 'berry_leaf') o.visible = false; });
  cluster.scale.setScalar(3.3); cluster.position.set(-0.07, 0.31, 0.06); cluster.rotation.z = 0.35;
  root.add(cluster);
  const berryHit = hit(root, 'berry_hit', [0.34, 0.3, 0.3], [-0.07, 0.38, 0.06]);
  const S = { picked: false };
  const apply = () => { cluster.visible = !S.picked; cluster.scale.setScalar(3.3); setHit(berryHit, !S.picked); };
  apply();
  root.pick = (opts = {}) => {
    S.picked = true;
    return runTok(tok, 'pick', 520, (k) => {
      cluster.visible = true;
      const s = k < 0.25 ? 1 + 0.12 * (k / 0.25) : 1.12 * (1 - smooth((k - 0.25) / 0.75));
      cluster.scale.setScalar(Math.max(0.001, 3.3 * s)); cluster.position.y = 0.31 + 0.05 * smooth(seg(k, 0.25, 1));
      if (k >= 1) { apply(); cluster.position.y = 0.31; }
    }, opts, Ease.linear);
  };
  root.setState = (s = {}) => { tok.cancelAll(); S.picked = !!s.picked; cluster.position.y = 0.31; apply(); return Promise.resolve(); };
  root.getState = () => ({ ...S });
  root.userData.berries = cluster;
  return root;
}

// ---------------------------------------------------------------------------------------------
// p3_grove_table：David 的圆桌（05:42–06:04）：圆木桌 + 桌后的凳子；桌上从左到右白碗、玻璃杯、盘子里两片面包
// ---------------------------------------------------------------------------------------------
function makeGroveTable() {
  const root = group('p3_grove_table');
  const tok = makeTok();
  const wood = cached('p3:grove:mat:tablewood', () => toon('#ffffff', { outline: 0.005, map: canvasTexture(256, 256, (g, w, h) => {
    const r = rng(9); g.fillStyle = '#c3a888'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 38; i++) { g.strokeStyle = `rgba(${r() < 0.5 ? '110,80,52' : '236,214,178'},${0.1 + r() * 0.12})`; g.lineWidth = 1 + r() * 2; const y = r() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 10, w * 0.7, y + (r() - 0.5) * 10, w, y + (r() - 0.5) * 6); g.stroke(); }
  }) }));
  const white = tmat('#fbfaf5', { outline: 0.004 });
  const TOP = 0.75;
  mesh(root, lathe([[0, 0.69], [0.455, 0.69], [0.47, 0.702], [0.47, 0.738], [0.455, TOP], [0, TOP]], 56), wood, 'table_top');
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push(rod([sx * 0.37, 0.0, sz * 0.37], [sx * 0.27, 0.69, sz * 0.27], 0.014, 8, 0.024));
  merge(root, legs, wood, 'table_legs');
  // 凳子在桌心后方 0.62 m（David 坐在凳子上，腰在桌沿外，双手落在桌沿；桌面高 0.75，座高 0.45）
  const stool = makeStool(); stool.name = 'table_stool'; stool.position.set(0, 0, -0.62); root.add(stool);
  const seat = new THREE.Object3D(); seat.name = 'table_seat'; seat.position.set(0, 0.45, -0.62); root.add(seat);
  const topA = new THREE.Object3D(); topA.name = 'table_top_anchor'; topA.position.set(0, TOP, 0); root.add(topA);
  contactShadow(root, 0.72, 0.6, { opacity: 0.38 });
  // 白碗 + 浆果堆
  const bowl = group('table_bowl', root, [-0.3, TOP, -0.07]);
  mesh(bowl, lathe([[0, 0], [0.03, 0], [0.05, 0.012], [0.075, 0.044], [0.086, 0.072]], 28), white, 'bowl_body');
  mesh(bowl, lathe([[0, 0.012], [0.04, 0.016], [0.066, 0.046], [0.079, 0.07]], 28), tmat('#d9d6cc', { side: THREE.BackSide, outline: false }), 'bowl_inner');
  mesh(bowl, new THREE.TorusGeometry(0.0825, 0.004, 6, 28).rotateX(Math.PI / 2), white, 'bowl_rim', [0, 0.071, 0]);
  const pile = group('bowl_berries', bowl);
  {
    const balls = [], shine = [];
    const add = (x, y, z) => { balls.push(new THREE.SphereGeometry(0.0195, 12, 9).translate(x, y, z)); shine.push(new THREE.SphereGeometry(0.0055, 6, 4).translate(x - 0.007, y + 0.009, z + 0.014)); };
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; add(Math.cos(a) * 0.042, 0.06, Math.sin(a) * 0.04); }
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; add(Math.cos(a) * 0.02, 0.08, Math.sin(a) * 0.02); }
    add(0.003, 0.098, 0.0); add(0.03, 0.09, 0.012);
    merge(pile, balls, tmat('#c61f2c'), 'berries'); merge(pile, shine, umat('#f6c0c0'), 'berry_shine');
  }
  // 玻璃杯 + 树汁
  const cup = group('table_cup', root, [-0.02, TOP, -0.12]);
  mesh(cup, lathe([[0, 0], [0.032, 0], [0.036, 0.004], [0.044, 0.14], [0.0, 0.14]], 24), tmat('#e8f1f2', { transparent: true, opacity: 0.38, side: THREE.DoubleSide, outline: 0.004 }), 'cup_glass');
  mesh(cup, new THREE.CylinderGeometry(0.0365, 0.0365, 0.014, 20).translate(0, 0.011, 0), tmat('#f3f8f8', { transparent: true, opacity: 0.6, outline: false }), 'cup_base');
  mesh(cup, new THREE.TorusGeometry(0.0442, 0.0022, 5, 24).rotateX(Math.PI / 2), tmat('#f2f7f7', { outline: false }), 'cup_rim', [0, 0.14, 0]);
  const sap = mesh(cup, new THREE.CylinderGeometry(0.0395, 0.0345, 1, 20).translate(0, 0.5, 0), tmat('#ecdf98', { outline: false }), 'cup_sap', [0, 0.018, 0]);
  const SAP_H = 0.1;
  // 盘子 + 两片面包 + 蜂蜜
  const plate = group('table_plate', root, [0.27, TOP, -0.04]);
  mesh(plate, lathe([[0, 0], [0.07, 0], [0.122, 0.011], [0.13, 0.017], [0.127, 0.019], [0.118, 0.014], [0, 0.012]], 40), white, 'plate_body');
  const bread = group('plate_bread', plate, [0, 0.016, 0]);
  const crust = tmat('#cdb084'), crumb = tmat('#dec8a0');
  for (const [i, dx, dz, ry] of [[0, 0, 0.01, 0.1], [1, 0.012, -0.004, -0.05]]) {
    const b = mesh(bread, new THREE.BoxGeometry(0.15, 0.022, 0.1), i ? crumb : crust, `bread_${i}`, [dx, 0.011 + i * 0.022, dz], [0, ry, 0]);
    b.geometry.translate(0, 0, 0);
  }
  const honey = group('plate_honey', bread, [0.005, 0.047, 0.004]);
  {
    const blobs = [];
    for (const [x, y, z, s] of [[0, 0, 0, 1], [0.03, 0.002, 0.012, 0.7], [-0.034, 0.001, -0.01, 0.75], [0.012, 0.004, -0.02, 0.5], [-0.01, 0.006, 0.016, 0.5]]) {
      const g = new THREE.SphereGeometry(0.028 * s, 14, 8); g.scale(1.25, 0.5, 1); g.translate(x, y, z); blobs.push(g);
    }
    merge(honey, blobs, tmat('#f4a612', { outline: 0.003 }), 'honey_blob');
    mesh(honey, new THREE.SphereGeometry(0.007, 6, 4).scale(1.4, 0.7, 1), umat('#fff2b0'), 'honey_shine', [-0.012, 0.012, 0.004]);
  }
  hit(root, 'table_hit', [0.98, 0.8, 0.98], [0, 0.4, 0]);
  hit(root, 'table_bowl_hit', [0.2, 0.17, 0.2], [-0.3, TOP + 0.08, -0.07]);
  hit(root, 'table_cup_hit', [0.13, 0.2, 0.13], [-0.02, TOP + 0.1, -0.12]);
  hit(root, 'table_plate_hit', [0.3, 0.1, 0.3], [0.27, TOP + 0.05, -0.04]);
  const S = { berries: false, sap: false, honey: false };
  const apply = () => {
    pile.visible = S.berries; pile.scale.setScalar(1);
    sap.visible = S.sap; sap.scale.set(1, SAP_H, 1);
    honey.visible = S.honey; honey.scale.set(1, 1, 1);
  };
  apply();
  root.setBerries = (on = true, opts = {}) => {
    S.berries = !!on;
    return runTok(tok, 'berries', 520, (k) => {
      pile.visible = on ? k > 0 : k < 1; const e = on ? Ease.outBack(k) : 1 - k;
      pile.scale.setScalar(Math.max(0.001, e)); if (k >= 1) apply();
    }, opts, Ease.linear);
  };
  root.setSap = (on = true, opts = {}) => {
    S.sap = !!on;
    return runTok(tok, 'sap', 1000, (k) => {
      sap.visible = on ? k > 0 : k < 1; sap.scale.set(1, Math.max(0.001, SAP_H * (on ? smooth(k) : 1 - smooth(k))), 1); if (k >= 1) apply();
    }, opts, Ease.linear);
  };
  root.setHoney = (on = true, opts = {}) => {
    S.honey = !!on;
    return runTok(tok, 'honey', 700, (k) => {
      honey.visible = on ? k > 0 : k < 1; const e = on ? smooth(k) : 1 - smooth(k);
      honey.scale.set(Math.max(0.001, 0.15 + 0.85 * e), Math.max(0.001, e), Math.max(0.001, 0.15 + 0.85 * e)); if (k >= 1) apply();
    }, opts, Ease.linear);
  };
  root.setState = (s = {}) => { tok.cancelAll(); Object.assign(S, { berries: false, sap: false, honey: false }, s); apply(); return Promise.resolve(); };
  root.getState = () => ({ ...S });
  root.userData.seat = seat;
  return root;
}

// ---------------------------------------------------------------------------------------------
// p3_larva：巨大的幼虫（06:14–06:50）：米色分节身体躺在地上，头端一个深色圆口（口里一道钩状纹），节缝深色，表面细点和短横纹，
// 背上长着几根细黑毛。长轴沿 x，头（嘴）朝 −x 并略朝 +z（转向镜头）。
// ---------------------------------------------------------------------------------------------
const LARVA_RINGS = (() => {
  const len = [0.27, 0.126, 0.126, 0.124, 0.122, 0.12, 0.118, 0.115, 0.11, 0.105, 0.098, 0.09];
  const r = [0.222, 0.226, 0.228, 0.226, 0.22, 0.211, 0.2, 0.186, 0.17, 0.15, 0.127, 0.095];
  const yaw = [0.95, 0.55, 0.3, 0.14, 0.06, 0, 0, 0, -0.02, -0.04, -0.06, -0.08];
  const out = []; let px = 0, pz = 0;
  for (let i = 0; i < len.length; i++) {
    out.push({ i, len: len[i], r: r[i], yaw: yaw[i], x: px, z: pz });
    px += Math.cos(yaw[i]) * len[i]; pz -= Math.sin(yaw[i]) * len[i];
  }
  const minX = Math.min(...out.map((o) => o.x)), maxX = px, cx = (minX + maxX) / 2;
  const mid = out[6];
  for (const o of out) { o.x -= cx; o.z -= mid.z; }
  return { rings: out, endX: px - cx, endZ: pz - mid.z };
})();
function larvaRingGeo(o) {
  const { len, r, i } = o, n = LARVA_RINGS.rings.length;
  const prof = i === 0 ? [[0, 0], [r * 0.82, 0], [r * 0.94, 0.022], [r * 0.99, 0.07], [r, len * 0.4], [r * 0.99, len * 0.8], [r * 0.9, len * 0.97], [r * 0.72, len]]
    : i === n - 1 ? [[r * 0.76, 0], [r * 0.95, len * 0.05], [r, len * 0.15], [r * 0.9, len * 0.5], [r * 0.62, len * 0.85], [r * 0.3, len * 0.99], [0, len]]
      : [[r * 0.7, 0], [r * 0.95, len * 0.07], [r, len * 0.2], [r, len * 0.8], [r * 0.95, len * 0.93], [r * 0.7, len]];
  const g = lathe(prof, 28);
  g.rotateZ(-Math.PI / 2);
  g.applyMatrix4(new THREE.Matrix4().set(1, -0.13, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));   // 节缝向头端歪（原作里每节像“\”）
  return g;
}
function larvaSkinMat() {
  return cached('p3:grove:mat:larva', () => toon('#ffffff', { outline: 0.0055, map: canvasTexture(256, 128, (g, w, h) => {
    const r = rng(23); g.fillStyle = '#c8b99b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${r() < 0.6 ? '120,104,82' : '236,222,194'},${0.18 + r() * 0.25})`; g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2); }
    g.strokeStyle = 'rgba(112,96,74,0.7)'; g.lineWidth = 2; g.lineCap = 'round';
    for (let i = 0; i < 38; i++) { const x = r() * w, y = r() * h, a = r() * 3.14, l = 2 + r() * 5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  }) }));
}
function larvaMouthTexture() {
  return cached('p3:grove:tex:larvamouth', () => canvasTexture(192, 288, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#3b3335'; g.strokeStyle = '#0d0b0b'; g.lineWidth = 12;
    g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.45, h * 0.46, 0, 0, TAU); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(120,108,106,0.55)'; g.lineWidth = 3; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.38, h * 0.4, 0, 0, TAU); g.stroke();
    g.fillStyle = '#5c5351'; for (const [x, y] of [[0.4, 0.27], [0.5, 0.24], [0.6, 0.27], [0.45, 0.33], [0.56, 0.33]]) { g.beginPath(); g.arc(x * w, y * h, 6, 0, TAU); g.fill(); }
    g.strokeStyle = '#968e8c'; g.lineWidth = 15; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(w * 0.36, h * 0.5); g.quadraticCurveTo(w * 0.3, h * 0.72, w * 0.4, h * 0.78); g.stroke();
    g.beginPath(); g.moveTo(w * 0.64, h * 0.5); g.quadraticCurveTo(w * 0.7, h * 0.72, w * 0.6, h * 0.78); g.stroke();
    g.lineWidth = 10; g.beginPath(); g.moveTo(w * 0.4, h * 0.62); g.lineTo(w * 0.6, h * 0.62); g.stroke();
    g.strokeStyle = '#0d0b0b'; g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.36, h * 0.5); g.quadraticCurveTo(w * 0.3, h * 0.72, w * 0.4, h * 0.78); g.moveTo(w * 0.64, h * 0.5); g.quadraticCurveTo(w * 0.7, h * 0.72, w * 0.6, h * 0.78); g.stroke();
  }, { wrap: false }));
}
function makeLarva() {
  const root = group('p3_larva');
  const tok = makeTok();
  const skin = larvaSkinMat();
  const rings = [], coverGeos = [], caps = [];
  const AX = new THREE.Vector3(1, 0, 0);
  for (const o of LARVA_RINGS.rings) {
    const m = mesh(root, larvaRingGeo(o), skin, `larva_ring_${o.i}`, [o.x, o.r * 0.97, o.z], [0, o.yaw, 0]);
    m.castShadow = false; m.userData.base = { y: o.r * 0.97 };
    rings.push(m);
    m.updateMatrix(); const cg = m.geometry.clone(); cg.applyMatrix4(m.matrix); cg.deleteAttribute('uv'); coverGeos.push(cg);
    const d = AX.clone().applyAxisAngle(V(0, 1, 0), o.yaw);
    caps.push([[o.x, o.r * 0.97, o.z], [o.x + d.x * o.len, o.r * 0.97, o.z + d.z * o.len], o.r * 0.92]);
  }
  contactShadow(root, 0.95, 0.4, { opacity: 0.4 });
  // 背上的细黑毛
  {
    const R = rng(33), hairs = [];
    for (const o of LARVA_RINGS.rings) for (let k = 0; k < 4; k++) {
      const a = lerp(0.2, 2.9, R()), at = V(o.x + Math.cos(o.yaw) * o.len * R(), o.r * 0.97 + Math.sin(a) * o.r * 0.97, o.z + Math.cos(a) * o.r * 0.9 * (R() < 0.6 ? 1 : -1) * 0.5);
      const dir = V((R() - 0.5) * 0.6, Math.sin(a) * 0.9 + 0.2, Math.cos(a) * 0.5).normalize();
      hairs.push(rod(at.toArray(), at.clone().addScaledVector(dir, 0.045 + R() * 0.03).toArray(), 0.0032, 3, 0.0008));
    }
    merge(root, hairs, tmat(INK, { outline: false }), 'larva_hairs');
  }
  // 嘴：头端平面上的一块贴画（深色椭圆，里面一对钩牙）
  const head = rings[0];
  const mouthG = group('larva_mouth', head);
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.32).rotateY(-Math.PI / 2), unlit('#ffffff', { map: larvaMouthTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  mouth.name = 'larva_mouth_plane'; mouth.position.set(-0.004, 0, 0); mouth.raycast = () => {}; mouthG.add(mouth);
  const mouthWorld = () => mouth.getWorldPosition(new THREE.Vector3());
  // 吐出来的球茎（复用物品 p3_bulb，放大 2 倍，躺在嘴前的地上）
  const bulb = ITEMS.p3_bulb(); bulb.name = 'larva_bulb'; bulb.scale.setScalar(2); root.add(bulb);
  const GROUND = V(LARVA_RINGS.rings[0].x - 0.34, 0.08, LARVA_RINGS.rings[0].z + 0.4);
  bulb.position.copy(GROUND); bulb.rotation.y = 0.9;
  // 蚊群覆盖：黑色毛茸壳（盖在整条幼虫上）+ 飞舞 / 趴着的蚊群
  const merged = mergeGeometries(coverGeos.map((g) => (g.index ? g.toNonIndexed() : g)));
  const cover = makeGnatCover(null, { geometry: merged, color: '#121212', seed: 9, inflate: 0.075, fuzz: 0.055, scale: 8 });
  cover.name = 'larva_gnat_cover'; root.add(cover);
  const points = capsulePoints(caps, 340, 17);
  const swarm = makeGnatSwarm({ count: 220, len: 0.05, seed: 5, speed: 1 });
  swarm.setCloud([0, 0.45, 0.05], [0.8, 0.4, 0.4]); swarm.setCover(points); root.add(swarm);
  // 点击盒
  // 身体盒要把弯向 +z 的头也罩进去（头在 z≈0.35 一带）；球茎只有 0.28 m 长，点击盒放大到 0.64 m 见方方便手指点，
  // 和身体盒在头的左前方有一小块重叠，射线取最近的，球茎还在地上时点那一带就是捡球茎。
  const bodyHit = hit(root, 'larva_body_hit', [1.72, 0.52, 0.9], [-0.04, 0.26, 0.15]);
  const mouthHit = hit(root, 'larva_mouth_hit', [0.34, 0.46, 0.46], [LARVA_RINGS.rings[0].x + 0.05, 0.22, LARVA_RINGS.rings[0].z + 0.08]);
  const bulbHit = hit(root, 'larva_bulb_hit', [0.64, 0.5, 0.64], [GROUND.x, 0.16, GROUND.z]);
  const S = { gnats: 0, spat: false, bulbTaken: false };
  let headPulse = 0;
  const showSwarm = (k) => { swarm.visible = k > 0.001; swarm.setCount(Math.round(220 * clamp(k * 1.6))); swarm.setMix(k); swarm.setAway(0); cover.setCover(k); };
  const apply = () => {
    showSwarm(S.gnats);
    mouth.scale.set(1, 1, 1); mouthG.scale.set(1, 1, 1);
    bulb.visible = S.spat && !S.bulbTaken; bulb.position.copy(GROUND); bulb.scale.setScalar(2);
    setHit(bulbHit, S.spat && !S.bulbTaken);
    setHit(mouthHit, !S.spat);
    headPulse = 0;
  };
  apply();
  root.setGnats = (k = 1, opts = {}) => {
    const from = S.gnats; S.gnats = clamp(k);
    return runTok(tok, 'gnats', 1800, (t) => { showSwarm(lerp(from, S.gnats, smooth(t))); }, opts, Ease.linear);
  };
  root.clearGnats = (opts = {}) => {
    const from = S.gnats; S.gnats = 0;
    return runTok(tok, 'gnats', 2600, (t) => {
      if (t >= 1) { showSwarm(0); return; }
      swarm.visible = true; swarm.setCount(220); swarm.setMix(from * (1 - smooth(seg(t, 0, 0.5)))); swarm.setAway(smooth(seg(t, 0.15, 1))); cover.setCover(from * (1 - smooth(seg(t, 0.05, 0.7))));
    }, opts, Ease.linear);
  };
  root.spit = (opts = {}) => {
    S.spat = true; S.bulbTaken = false;
    if (opts && opts.instant) { apply(); return Promise.resolve(); }
    const from = mouthWorld(); root.worldToLocal(from);
    return runTok(tok, 'spit', 2600, (t) => {
      const open = Math.sin(Math.PI * seg(t, 0, 0.6)) ; mouth.scale.set(1, 1 + 0.28 * open, 1 + 0.1 * open); mouthG.scale.setScalar(1);
      headPulse = open;
      const f = seg(t, 0.25, 0.7);
      bulb.visible = f > 0; if (f > 0) {
        bulb.position.lerpVectors(from, GROUND, f); bulb.position.y += Math.sin(f * Math.PI) * 0.45; bulb.scale.setScalar(2 * (0.3 + 0.7 * smooth(Math.min(1, f * 2)))); bulb.rotation.set(0, 0.9, f * 5 * (1 - f));
      }
      if (t >= 1) { headPulse = 0; apply(); }
    }, opts, Ease.linear);
  };
  root.takeBulb = (opts = {}) => {
    S.bulbTaken = true;
    return runTok(tok, 'bulb', 450, (t) => { bulb.scale.setScalar(Math.max(0.001, 2 * (1 - smooth(t)))); bulb.position.y = GROUND.y + 0.1 * smooth(t); if (t >= 1) apply(); }, opts, Ease.linear);
  };
  root.coverPoints = () => points.map((p) => p.clone());
  root.setState = (s = {}) => { tok.cancelAll(); Object.assign(S, { gnats: 0, spat: false, bulbTaken: false }, s); S.gnats = clamp(S.gnats); if (S.bulbTaken) S.spat = true; apply(); return Promise.resolve(); };
  root.getState = () => ({ ...S });
  root.update = (dt, t) => {
    if (swarm.visible) swarm.update(dt, t);
    // 慢慢蠕动：身体各节的粗细像波一样从尾传到头
    for (let i = 0; i < rings.length; i++) {
      const w = (1 + 0.022 * Math.sin(t * 1.3 - i * 0.7)) * (i === 0 ? 1 + 0.07 * headPulse : 1); rings[i].scale.set(1, w, w);
    }
  };
  root.userData.mouthWorld = mouthWorld;
  root.userData.length = 1.5;
  return root;
}

// ---------------------------------------------------------------------------------------------
// p3_shrine：岩壁上的石砌拱形神龛（05:14、09:28–09:34、12:52–13:18）
// 浅灰蓝石块砌的拱门（净宽 1.3、外宽 1.74、高 2.6，石块黑描边），龛内岩壁略暗；三根白色小石柱（0.72 高，间距 0.39），
// 左柱上原有一只长颈瓶；龛里挂着 Caroline 的画像（复用 portrait_caroline，缩放 0.8）。原点在壁面的地面处，正面朝 +z。
// ---------------------------------------------------------------------------------------------
export const SHRINE = {
  open: 1.3, jamb: 0.22, height: 2.6, depth: 0.3, spring: 1.73,           // 净宽、门框宽、总高、石块厚、起拱高度
  pillarX: [-0.39, 0, 0.39], pillarZ: 0.22, pillarH: 0.72,                 // 柱位、柱高（柱顶 = 摆花瓶的高度）
  portrait: { y: 2.34, z: 0.05, scale: 0.8 },                              // 画像钉子位置与缩放（画心约 y 1.87）
  frame: { y: 1.8, size: 0.4 },                                            // 黑方框（画像消失后）
};
function shrineStone() {
  const { open: OP, jamb: JW, depth: D, spring: SP } = SHRINE, OUT = OP / 2 + JW, IN = OP / 2;
  const R = rng(61), geos = [], gap = 0.014, bev = 0.016;
  const addBlock = (shape) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: D - 2 * bev - 0.01, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 1 });
    g.translate(0, 0, bev + 0.01);
    const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color().setHSL(0.52, 0.1, 0.78 + (R() - 0.5) * 0.07);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  };
  const ins = gap / 2 + bev;
  // 门柱：每侧 5 块
  const rows = 5, hh = SP / rows;
  for (const side of [-1, 1]) for (let i = 0; i < rows; i++) {
    const x0 = IN + ins, x1 = OUT - ins, y0 = i * hh + ins, y1 = (i + 1) * hh - ins;
    const sh = new THREE.Shape(); sh.moveTo(side * x0, y0); sh.lineTo(side * x1, y0); sh.lineTo(side * x1, y1); sh.lineTo(side * x0, y1); sh.closePath();
    addBlock(sh);
  }
  // 拱圈：11 块楔形
  const n = 11, da = Math.PI / n, ia = (ins / ((IN + OUT) / 2));
  const P = (rad, a) => [Math.cos(a) * rad, SP + Math.sin(a) * rad];
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI - i * da - ia, a1 = Math.PI - (i + 1) * da + ia, am = (a0 + a1) / 2, r0 = IN + ins, r1 = OUT - ins;
    const sh = new THREE.Shape(); sh.moveTo(...P(r0, a0)); sh.lineTo(...P(r1, a0)); sh.lineTo(...P(r1 + 0.004, am)); sh.lineTo(...P(r1, a1)); sh.lineTo(...P(r0, a1)); sh.lineTo(...P(r0 - 0.004, am)); sh.closePath();
    addBlock(sh);
  }
  return mergeGeometries(geos);
}
/** 灰蓝的石块材质（顶点色）。 */
const stoneMat = () => cached('p3:grove:mat:stone', () => toon('#ffffff', { vertexColors: true, outline: 0.0095 }));
function archOutline(radius, y0 = 0) {
  const { spring: SP } = SHRINE, s = new THREE.Shape();
  s.moveTo(-radius, y0); s.lineTo(-radius, SP); s.absarc(0, SP, radius, Math.PI, 0, true); s.lineTo(radius, y0); s.closePath();
  return s;
}
function pillarGeo() {
  const H = SHRINE.pillarH;
  return lathe([[0, 0], [0.105, 0], [0.105, 0.024], [0.088, 0.036], [0.06, 0.046], [0.05, 0.075], [0.047, 0.3], [0.043, 0.5], [0.045, H - 0.11], [0.058, H - 0.085], [0.07, H - 0.07], [0.112, H - 0.045], [0.116, H - 0.025], [0.108, H - 0.012], [0, H]], 28);
}
const eyeTexture = () => cached('p3:grove:tex:eyehole', () => canvasTexture(128, 80, (g, w, h) => {
  g.clearRect(0, 0, w, h); const r = rng(8);
  g.strokeStyle = '#060606'; g.lineCap = 'round';
  for (let i = 0; i < 70; i++) { const a = r() * TAU, r0 = w * 0.18, r1 = w * (0.3 + r() * 0.15); g.lineWidth = 2 + r() * 3; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * r0, h / 2 + Math.sin(a) * r0 * 0.62); g.lineTo(w / 2 + Math.cos(a) * r1, h / 2 + Math.sin(a) * r1 * 0.62); g.stroke(); }
  g.fillStyle = '#060606'; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.33, h * 0.33, 0, 0, TAU); g.fill();
}, { wrap: false }));

function makeShrine() {
  const { open: OP, depth: D, spring: SP, pillarX, pillarZ, pillarH } = SHRINE;
  const root = group('p3_shrine');
  const tok = makeTok();
  // 门框石块 + 灰缝（石块之间露出的黑色底）
  mesh(root, shrineStone(), stoneMat(), 'shrine_stone').castShadow = false;
  {
    const sh = archOutline(OP / 2 + SHRINE.jamb); sh.holes.push(new THREE.Path(archOutline(OP / 2).getPoints(24)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: D - 0.05, bevelEnabled: false, curveSegments: 24 });
    const m = new THREE.Mesh(g, umat(INK)); m.name = 'shrine_mortar'; m.position.z = 0.0; m.raycast = () => {}; root.add(m);
  }
  // 龛内背板：比岩壁略暗的石面
  {
    const g = new THREE.ShapeGeometry(archOutline(OP / 2 - 0.004), 24);
    const m = new THREE.Mesh(g, umat('#dcdcd4', { map: rockTexture(), side: THREE.DoubleSide })); m.name = 'shrine_back'; m.position.z = 0.045; m.raycast = () => {};
    // 贴图取岩壁的一小块（按世界尺寸映射，不拉伸）
    const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.52 + p.getX(i) * 0.05, 0.42 + p.getY(i) * 0.12);
    root.add(m);
  }
  // 龛底的门槛石板
  mesh(root, new THREE.BoxGeometry(OP + 0.04, 0.035, D - 0.04).translate(0, 0.0175, (D - 0.04) / 2 + 0.02), tmat('#b5bfc1'), 'shrine_sill').castShadow = false;
  // 三根小石柱（合并成一个网格）
  const pg = [];
  for (const x of pillarX) pg.push(pillarGeo().translate(x, 0.035, pillarZ));
  merge(root, pg, tmat('#c9d2d3', { outline: 0.005 }), 'shrine_pillars');
  const TOP = 0.035 + pillarH;                    // 柱顶高度（花瓶底的位置）
  // ---- 花瓶、花
  const slots = pillarX.map((x, i) => ({ x, i, vases: {}, flower: null, vaseKind: null, flowerKind: null, anchor: group(`shrine_slot_anchor_${i}`, root, [x, TOP, pillarZ]) }));
  const bottle = ITEMS.p3_vase_bottle(); bottle.name = 'shrine_bottle'; slots[0].anchor.add(bottle); slots[0].bottle = bottle; slots[0].vaseKind = 'bottle';
  const FLOWER_ID = { yellow: 'p3_flower_yellow', orange: 'p3_flower_orange', rose: 'p3_rose' };
  const vaseObj = (slot, kind) => {
    if (kind === 'bottle') return slot.bottle;
    if (!slot.vases[kind]) { const o = ITEMS[`p3_vase_${kind}`](); o.name = `shrine_vase_${kind}`; o.visible = false; slot.anchor.add(o); slot.vases[kind] = o; }
    return slot.vases[kind];
  };
  const flowerFor = (slot, kind) => {
    if (!slot.flowers) slot.flowers = {};
    if (!slot.flowers[kind]) { const o = ITEMS[FLOWER_ID[kind]](); o.name = `shrine_flower_${kind}`; o.visible = false; slot.anchor.add(o); slot.flowers[kind] = o; }
    return slot.flowers[kind];
  };
  const mouthY = (slot) => { const v = slot.vaseKind ? vaseObj(slot, slot.vaseKind) : null; return v ? v.userData.mouth.position.y + 0.02 : 0; };
  // ---- 画像、黑方框、方块、蚊群
  const holder = group('shrine_portrait_holder', root, [0, SHRINE.portrait.y, SHRINE.portrait.z]); holder.scale.setScalar(SHRINE.portrait.scale);
  const portrait = INNER.portrait_caroline(); holder.add(portrait);
  const cy = -0.21 - 0.38;                         // 画心（相对钉子）
  const eyeL = decal(portrait, eyeTexture(), 0.1, 0.062, [-0.0488, cy - 0.026, 0.0145], [0, 0, 0], { name: 'portrait_eye_l', opacity: 0 });
  const eyeR = decal(portrait, eyeTexture(), 0.1, 0.062, [0.0095, cy - 0.026, 0.0145], [0, 0, 0], { name: 'portrait_eye_r', opacity: 0 });
  const FR = SHRINE.frame, fw = 0.026;
  const frameG = group('shrine_frame', root, [0, FR.y, 0.06]);
  const inkM = tmat('#0f1010', { outline: false });
  const edges = [
    mesh(frameG, new THREE.BoxGeometry(FR.size, fw, 0.03), inkM, 'frame_bottom'), mesh(frameG, new THREE.BoxGeometry(fw, FR.size, 0.03), inkM, 'frame_right'),
    mesh(frameG, new THREE.BoxGeometry(FR.size, fw, 0.03), inkM, 'frame_top'), mesh(frameG, new THREE.BoxGeometry(fw, FR.size, 0.03), inkM, 'frame_left'),
  ];
  edges.forEach((e) => { e.castShadow = false; });
  const frameFill = new THREE.Mesh(new THREE.PlaneGeometry(FR.size - fw, FR.size - fw), unlit('#8c979a', { transparent: true, opacity: 0, depthWrite: false })); frameFill.position.z = -0.012; frameFill.name = 'frame_fill'; frameFill.raycast = () => {}; frameG.add(frameFill);
  const poseFrame = (k) => {
    const s = FR.size / 2;
    edges.forEach((e, i) => {
      const t = seg(k, i / 4, (i + 1) / 4); e.visible = t > 0; const horiz = i % 2 === 0; e.scale[horiz ? 'x' : 'y'] = Math.max(0.001, t);
      if (i === 0) e.position.set(-s + FR.size * t / 2, -s, 0); if (i === 1) e.position.set(s, -s + FR.size * t / 2, 0); if (i === 2) e.position.set(s - FR.size * t / 2, s, 0); if (i === 3) e.position.set(-s, s - FR.size * t / 2, 0);
    });
    frameFill.material.opacity = 0.9 * seg(k, 0.7, 1); frameG.visible = k > 0;
  };
  const cubeG = group('shrine_cube', root, [0, FR.y - 0.133, 0.1]);
  const cube = LAKE.black_cube(); cube.scale.setScalar(2.2); cube.rotation.set(0.5, 0.72, 0); cubeG.add(cube);
  const swarm = makeGnatSwarm({ count: 150, len: 0.045, seed: 3, speed: 1.1 }); swarm.name = 'shrine_gnats'; swarm.visible = false; root.add(swarm);
  // 蚊群的落点：两只眼睛上（画像局部 → 神龛局部）
  const eyePts = [];
  { const R = rng(4); const pc = V(0, SHRINE.portrait.y + cy * SHRINE.portrait.scale, SHRINE.portrait.z + 0.03), s = SHRINE.portrait.scale;
    for (const ex of [-0.0488, 0.0095]) for (let i = 0; i < 38; i++) { const a = R() * TAU, rd = Math.sqrt(R()) * 0.036; eyePts.push(V(pc.x + (ex + Math.cos(a) * rd) * s, pc.y + (-0.026 + Math.sin(a) * rd * 0.62) * s, pc.z)); } }
  // 点击盒
  const slotHits = pillarX.map((x, i) => hit(root, `shrine_slot_${i}`, [0.34, 1.15, 0.3], [x, 0.575, pillarZ]));
  const portraitHit = hit(root, 'shrine_portrait_hit', [0.5, 0.64, 0.1], [0, SHRINE.portrait.y - 0.49, SHRINE.portrait.z + 0.03]);
  const cubeHit = hit(root, 'shrine_cube_hit', [0.3, 0.3, 0.3], [0, FR.y, 0.12]);
  hit(root, 'shrine_hit', [OP + 0.5, SHRINE.height, 0.5], [0, SHRINE.height / 2, 0.2]);
  for (const nm of ['portrait_anchor', 'frame_anchor']) { const a = new THREE.Object3D(); a.name = `shrine_${nm}`; root.add(a); }
  root.getObjectByName('shrine_portrait_anchor').position.set(0, SHRINE.portrait.y - 0.49, SHRINE.portrait.z + 0.03);
  root.getObjectByName('shrine_frame_anchor').position.set(0, FR.y, 0.1);
  // ------- 状态
  const S = { vases: [null, null], flowers: [null, null, null], portrait: 'normal', frame: 0, cube: 'none' };
  let hang = 1;   // 画像挂着(1) → 掉在地上(0) 的过渡量
  const PORT_FALL = { y: 0.79, z: 0.075, rx: -0.12 };
  const posePortrait = (h) => {   // h = 1 挂在墙上；0 掉在地上靠着墙
    holder.position.set(0, lerp(PORT_FALL.y, SHRINE.portrait.y, h), lerp(PORT_FALL.z, SHRINE.portrait.z, h));
    holder.rotation.set(lerp(PORT_FALL.rx, 0, h), 0, 0);
  };
  const slotVaseKind = (i) => (i === 0 ? 'bottle' : S.vases[i - 1]);
  const applySlot = (i) => {
    const slot = slots[i], vk = slotVaseKind(i);
    for (const k of Object.keys(slot.vases)) { slot.vases[k].visible = k === vk; slot.vases[k].scale.setScalar(1); slot.vases[k].position.y = 0; }
    if (slot.bottle) { slot.bottle.visible = i === 0; slot.bottle.scale.setScalar(1); }
    slot.vaseKind = vk;
    if (vk) vaseObj(slot, vk).visible = true;
    for (const k of Object.keys(slot.flowers || {})) slot.flowers[k].visible = false;
    const fk = S.flowers[i];
    if (fk && vk) { const f = flowerFor(slot, fk); f.visible = true; f.scale.setScalar(1); f.position.set(0, mouthY(slot) - 0.12, 0); slot.flowerKind = fk; } else slot.flowerKind = null;
  };
  const applyAll = () => {
    [0, 1, 2].forEach(applySlot);
    const pk = S.portrait;
    hang = pk === 'gone' ? 0 : 1; posePortrait(hang);
    portrait.visible = true;
    const eyes = pk === 'eyes' || pk === 'gone'; eyeL.material.opacity = eyeR.material.opacity = eyes ? 1 : 0;
    setHit(portraitHit, pk !== 'gone');
    poseFrame(S.frame);
    const cs = S.cube; cubeG.visible = cs === 'shown'; cubeG.scale.setScalar(1); cubeG.position.y = FR.y - 0.133; setHit(cubeHit, cs === 'shown');
    swarm.visible = false;
  };
  applyAll();
  root.setVase = (slot, kind, opts = {}) => {
    if (slot !== 1 && slot !== 2) return Promise.resolve();
    S.vases[slot - 1] = kind || null; if (!kind) S.flowers[slot] = null;
    const sl = slots[slot];
    return runTok(tok, `vase${slot}`, 520, (k) => {
      applySlot(slot);
      if (kind) { const o = vaseObj(sl, kind); const e = Math.max(0.01, Ease.outBack(k)); o.scale.setScalar(e); o.position.y = (1 - Math.min(1, k)) * 0.12; }
      else { /* 拿走：瞬时 */ }
      if (k >= 1) applySlot(slot);
    }, opts, Ease.linear);
  };
  root.setFlower = (slot, kind, opts = {}) => {
    if (slot < 0 || slot > 2) return Promise.resolve();
    S.flowers[slot] = kind || null;
    const sl = slots[slot];
    return runTok(tok, `flower${slot}`, 650, (k) => {
      applySlot(slot);
      if (kind && sl.vaseKind) { const f = flowerFor(sl, kind); const e = Math.max(0.01, Ease.outBack(Math.min(1, k * 1.05))); f.scale.setScalar(e); }
      if (k >= 1) applySlot(slot);
    }, opts, Ease.linear);
  };
  root.setPortrait = (kind = 'normal', opts = {}) => {
    const prev = S.portrait; S.portrait = kind;
    if (opts && opts.instant) { applyAll(); return Promise.resolve(); }
    return runTok(tok, 'portrait', 900, (k) => {
      const eyes = kind === 'eyes' || kind === 'gone', wasEyes = prev === 'eyes' || prev === 'gone';
      const eo = eyes ? (wasEyes ? 1 : k) : (wasEyes ? 1 - k : 0); eyeL.material.opacity = eyeR.material.opacity = eo;
      if (kind === 'gone' && prev !== 'gone') posePortrait(1 - Ease.inCubic(Math.min(1, k * 1.15)));
      else if (kind !== 'gone' && prev === 'gone') posePortrait(smooth(k));
      if (k >= 1) applyAll();
    }, opts, Ease.linear);
  };
  root.gnatsToPortrait = (opts = {}) => {
    S.portrait = 'eyes';
    if (opts && opts.instant) { applyAll(); return Promise.resolve(); }
    const c0 = V(0, 1.1, 0.4), c1 = V(0, SHRINE.portrait.y - 0.49, 0.12);
    swarm.setCover(eyePts);
    return runTok(tok, 'portrait', 6200, (k) => {
      swarm.visible = k < 1;
      const fly = smooth(seg(k, 0, 0.4)), land = smooth(seg(k, 0.36, 0.62)), away = seg(k, 0.74, 1);
      const c = c0.clone().lerp(c1, fly); c.x += Math.sin(fly * 9) * 0.22 * (1 - fly);
      swarm.setCloud(c, [lerp(0.5, 0.16, fly), lerp(0.35, 0.12, fly), lerp(0.2, 0.08, fly)]);
      swarm.setMix(land); swarm.setAway(away);
      const eo = smooth(seg(k, 0.5, 0.72)); eyeL.material.opacity = eyeR.material.opacity = eo;
      if (k >= 1) applyAll();
    }, opts, Ease.linear);
  };
  root.drawFrame = (k = 1, opts = {}) => {
    const from = S.frame; S.frame = clamp(k);
    return runTok(tok, 'frame', 900 + 700 * Math.abs(S.frame - from), (t) => { poseFrame(lerp(from, S.frame, t)); }, opts, Ease.inOutSine);
  };
  root.showCube = (on = true, opts = {}) => {
    S.cube = on ? 'shown' : 'none';
    return runTok(tok, 'cube', 900, (k) => {
      cubeG.visible = on ? k > 0 : k < 1; const e = on ? Ease.outBack(k) : 1 - k;
      cubeG.scale.setScalar(Math.max(0.001, e)); cubeG.position.y = FR.y - 0.133 + (on ? (1 - k) * -0.06 : 0);
      if (k >= 1) applyAll();
    }, opts, Ease.linear);
  };
  root.takeCube = (opts = {}) => {
    S.cube = 'taken';
    return runTok(tok, 'cube', 500, (k) => { cubeG.visible = true; cubeG.scale.setScalar(Math.max(0.001, 1 - smooth(k))); cubeG.position.y = FR.y - 0.133 + 0.08 * smooth(k); if (k >= 1) applyAll(); }, opts, Ease.linear);
  };
  root.setState = (s = {}) => {
    tok.cancelAll();
    const v = s.vases || [null, null], f = s.flowers || [null, null, null];
    Object.assign(S, { vases: [v[0] || null, v[1] || null], flowers: [f[0] || null, f[1] || null, f[2] || null], portrait: s.portrait || 'normal', frame: clamp(s.frame || 0), cube: s.cube || 'none' });
    applyAll();
    return Promise.resolve();
  };
  root.getState = () => ({ vases: [...S.vases], flowers: [...S.flowers], portrait: S.portrait, frame: S.frame, cube: S.cube });
  root.update = (dt, t) => {
    if (swarm.visible) swarm.update(dt, t);
    if (cubeG.visible) { cube.rotation.y = 0.72 + Math.sin(t * 0.7) * 0.12; cube.position.y = Math.sin(t * 1.6) * 0.012; }
  };
  root.userData.slots = slots; root.userData.portrait = portrait;
  return root;
}

// ---------------------------------------------------------------------------------------------
// p3_grove_portal：森林里通往白桦林的缺口（05:06）：3–5 棵白桦 + 后面一片淡淡的亮雾，约 3 m 宽，放在红叉树后面
// ---------------------------------------------------------------------------------------------
function makeGrovePortal() {
  const root = group('p3_grove_portal');
  const mk = (x, z, h, lean, r0, seed) => { const b = buildBirch({ height: h, lean, seed, r0 }); const o = new THREE.Group(); o.position.set(x, 0, z); o.rotation.y = seed; mesh(o, b.trunk, birchBarkMat(), 'portal_trunk').castShadow = false; if (b.leaves) mesh(o, b.leaves, birchLeafMat(), 'portal_leaves').castShadow = false; root.add(o); return o; };
  mk(-1.15, 0.0, 6.4, -0.03, 0.12, 41); mk(-0.4, 0.35, 5.6, 0.04, 0.11, 42); mk(0.5, -0.05, 6.8, -0.02, 0.125, 43); mk(1.25, 0.25, 5.9, 0.05, 0.11, 44);
  // 亮雾：竖直的软边渐变面 + 地上一层淡淡的亮
  const fogTex = cached('p3:grove:tex:portalfog', () => canvasTexture(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.save(); g.translate(w / 2, h * 0.56); g.scale(1, 2);      // 椭圆形的软边亮雾，四边都淡到 0
    const gr = g.createRadialGradient(0, 0, 4, 0, 0, w * 0.49); gr.addColorStop(0, 'rgba(228,236,236,0.95)'); gr.addColorStop(0.5, 'rgba(214,224,226,0.55)'); gr.addColorStop(1, 'rgba(200,212,214,0)');
    g.fillStyle = gr; g.fillRect(-w / 2, -h, w, h * 2); g.restore();
  }, { wrap: false }));
  const fog = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 7), unlit('#ffffff', { map: fogTex, transparent: true, depthWrite: false }));
  fog.name = 'portal_fog'; fog.position.set(0, 3.2, -1.2); fog.raycast = () => {}; fog.renderOrder = 1; root.add(fog);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.8, 32).rotateX(-Math.PI / 2), unlit('#ffffff', { map: cached('p3:grove:tex:portalglow', () => canvasTexture(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(224,232,230,0.75)'); gr.addColorStop(1, 'rgba(224,232,230,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }, { wrap: false })), transparent: true, depthWrite: false }));
  glow.name = 'portal_glow'; glow.position.set(0, 0.02, 0.2); glow.scale.set(1, 1, 0.6); glow.raycast = () => {}; glow.renderOrder = 1; root.add(glow);
  hit(root, 'portal_hit', [3.0, 4.0, 0.8], [0, 2, 0.1]);
  root.setState = () => Promise.resolve(); root.getState = () => ({});
  return root;
}

export const FACTORIES = {
  p3_grove_set: (o) => makeGroveSet(o || {}),
  p3_birch: (o) => { const b = makeBirchObject(o || {}, 'p3_birch'); b.setState = () => Promise.resolve(); b.getState = () => ({}); return b; },
  p3_birch_tap: () => makeBirchTap(),
  p3_berry_bush: () => makeBerryBush(),
  p3_shrine: () => makeShrine(),
  p3_grove_table: () => makeGroveTable(),
  p3_larva: () => makeLarva(),
  p3_grove_portal: () => makeGrovePortal(),
};
