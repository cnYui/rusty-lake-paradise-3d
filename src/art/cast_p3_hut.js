// 第三灾 · 森林石屋室内的理发戏（参考 01:10–01:38、03:50–04:46）：坐在小凳上的 Gerard 与站在他身后的 Ida。
// 身体全部复用 cast.js（gerardBody({ hat: false }) / buildIda()），这里只加：Gerard 的四级发型、碎发、头皮墨线地图、
// 可剪掉的右耳和血；Ida 搭肩的姿势、剪刀和剪的动作。接口见 docs/plague3_api.md §7.1。
// 坐标同 cast.js：脚底 y = 0、面朝 +Z、左手在 +X —— Gerard 的右耳在 −X（正面看在画面左侧），Ida 用右手（−X）拿剪刀。
import {
  THREE, V, TAU, clamp, lerp, smooth, place, sphere, hairCapGeo, faceSet, line, blob, eye, animate, Ease,
  getPropFactory, canvasTexture, cachedTex, rng, shade, mergeGeometries,
} from './charkit.js';
import { hairStrands, lifeIdle } from './human.js';
import { gerardBody, buildIda, seatedPose, mergePose, bags, brow, stubble, paintGerard, holdUpright, SKIN_GERARD } from './cast.js';
import { scalpMapTexture } from './props_p3_shared.js';

/** Gerard 坐的小凳座面高（米）。 */
export const BARBER_SEAT = 0.45;
/** Ida 相对 Gerard（root 原点、同一朝向）的摆放偏移：站在他正后方。 */
export const IDA_BEHIND = [0, 0, -0.4];
/** ida.snip() 里剪刀合上的时刻（秒）；gerard.setHair() 非 instant 时默认在这个时刻换发型、掉碎发。 */
export const HAIR_SNIP_AT = 0.14;
/** ida.cutEar() 里剪刀合上的时刻（秒）；gerard.cutEar() 默认在这个时刻剪断，两边同时调用正好对上。 */
export const EAR_SNIP_AT = 0.5;

const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const dir = (th, ph) => V(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
const PI = Math.PI;

// ===========================================================================
// 几何小工具
// ===========================================================================

/**
 * 扁平发束：沿 pts（头部局部坐标）的扁管，半宽 w 贴着头皮铺开、半厚 t 沿头皮法线，末端收尖。
 * 截面的“宽”始终以 center 为球心的外法线做参考（不像 lockGeo 那样随 Frenet 标架乱转）。
 * o: { tip 末端粗细比, base 起点粗细比, seg, radial, twist(k) 截面绕切线的额外转角, center }
 */
function strand(pts, w, t, { tip = 0.06, base = 0.75, seg: n = 20, radial = 8, twist = null, center = V(0, -0.02, 0) } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : V(p[0], p[1], p[2]))));
  const pos = [], uv = [], idx = [];
  const P = V(), T = V(), N = V(), B = V(), N2 = V();
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    curve.getPointAt(k, P); curve.getTangentAt(k, T);
    N.subVectors(P, center); N.addScaledVector(T, -N.dot(T));
    if (N.lengthSq() < 1e-10) N.set(0, 1, 0);
    N.normalize();
    B.crossVectors(T, N).normalize();
    if (twist) {
      const a = twist(k), c = Math.cos(a), s = Math.sin(a);
      N2.copy(N).multiplyScalar(c).addScaledVector(B, s);
      B.multiplyScalar(c).addScaledVector(N, -s); N.copy(N2);
    }
    const sc = k < 0.12 ? lerp(base, 1, k / 0.12) : lerp(1, tip, Math.pow((k - 0.12) / 0.88, 1.5));
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU, cx = Math.cos(a) * w * sc, cy = Math.sin(a) * t * sc;
      pos.push(P.x + B.x * cx + N.x * cy, P.y + B.y * cx + N.y * cy, P.z + B.z * cx + N.z * cy);
      uv.push(j / radial, k);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 发帽在单位方向 d 上的表面点（与 charkit 的 hairCapGeo 同一套径向映射），extra 为额外加厚（单位球倍数）。 */
function capPt(def, d, o, extra = 0) {
  const v = d.clone().multiplyScalar((o.scale ?? 1.08) + (o.top ?? 0.04) * Math.max(0, d.y) + extra);
  if (v.z > 0) v.y += (o.quiff ?? 0.06) * v.z * Math.max(0, v.y);
  def(v);
  return v;
}

/** 发际线在方位角 ph（0 = 正前方）处的极角上限（与 hairCapGeo 一致）。 */
function hairLimit(o, ph) {
  const k = Math.abs(ph) / PI;
  return k < 0.5 ? lerp(o.front, o.side, smooth(k * 2)) : lerp(o.side, o.back, smooth(k * 2 - 1));
}

/** 单位方向 a → b 的大圆插值（t 可以超出 0..1，用来把发梢甩出去）。 */
function slerpDir(a, b, t) {
  const om = Math.acos(clamp(a.dot(b), -1, 1));
  if (om < 1e-4) return a.clone();
  const s = Math.sin(om);
  return a.clone().multiplyScalar(Math.sin((1 - t) * om) / s).addScaledVector(b, Math.sin(t * om) / s).normalize();
}

/**
 * 发帽表面撒 n 根短刺（发茬），沿外法线带一点随机倾斜。原作寸头外轮廓上一根根竖起的黑色短毛。
 * 返回合并好的几何体（头部局部坐标）。
 */
function bristles(def, headR, o, n, { seed = 5, len = [0.005, 0.01], r = 0.0011, tilt = 0.35, extra = 0 } = {}) {
  const R = rng(seed), geos = [];
  const [rx, ry, rz] = headR;
  const yMin = Math.cos(o.back);
  let tries = 0;
  const up = V(0, 1, 0), q = new THREE.Quaternion();
  while (geos.length < n && tries++ < n * 40) {
    const y = lerp(yMin, 1, R()), ph = (R() * 2 - 1) * PI, th = Math.acos(y);
    if (th > hairLimit(o, ph) * 0.95) continue;
    const d = dir(th, ph);
    const p = capPt(def, d, o, extra);
    const nrm = V(p.x / (rx * rx), p.y / (ry * ry), p.z / (rz * rz)).normalize();
    nrm.add(V(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(tilt)).normalize();
    const L = lerp(len[0], len[1], R());
    const c = new THREE.CylinderGeometry(0, r, L, 5, 1, true);
    c.translate(0, L / 2 - 0.0015, 0);
    c.applyQuaternion(q.setFromUnitVectors(up, nrm));
    c.translate(p.x, p.y, p.z);
    geos.push(c);
  }
  return mergeGeometries(geos.map((g) => g.toNonIndexed()), false);
}

/**
 * 把合并网格里互不相连的“壳”按条件拆出来（耳朵、山羊胡都是和头骨合并在一起的独立壳）。
 * pick(centroid, shell) → true 的壳移到新网格（同材质、同父节点、同名规则），原网格只留剩下的三角形。
 */
function splitShells(rig, mesh, pick, tag) {
  const g = mesh.geometry, pos = g.attributes.position, n = pos.count, tris = (n / 3) | 0;
  if (g.index) return null;
  const parent = new Int32Array(tris);
  for (let i = 0; i < tris; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const owner = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos.getX(i) * 2e4)},${Math.round(pos.getY(i) * 2e4)},${Math.round(pos.getZ(i) * 2e4)}`;
    const t = (i / 3) | 0, o = owner.get(key);
    if (o === undefined) owner.set(key, t);
    else { const a = find(o), b = find(t); if (a !== b) parent[a] = b; }
  }
  const shells = new Map();
  for (let t = 0; t < tris; t++) {
    const r = find(t);
    let s = shells.get(r);
    if (!s) shells.set(r, (s = { c: V(), tris: [] }));
    for (let j = 0; j < 3; j++) s.c.x += pos.getX(t * 3 + j), s.c.y += pos.getY(t * 3 + j), s.c.z += pos.getZ(t * 3 + j);
    s.tris.push(t);
  }
  const take = new Uint8Array(tris);
  let any = false;
  for (const s of shells.values()) {
    s.c.divideScalar(s.tris.length * 3);
    if (pick(s.c, s)) { any = true; for (const t of s.tris) take[t] = 1; }
  }
  if (!any) return null;
  const build = (want) => {
    const out = new THREE.BufferGeometry();
    for (const name of Object.keys(g.attributes)) {
      const a = g.attributes[name], sz = a.itemSize, arr = [];
      for (let t = 0; t < tris; t++) if (take[t] === want) for (let j = 0; j < 3; j++) for (let c = 0; c < sz; c++) arr.push(a.array[(t * 3 + j) * sz + c]);
      out.setAttribute(name, new THREE.Float32BufferAttribute(arr, sz));
    }
    out.computeBoundingSphere();
    return out;
  };
  const kept = build(0), taken = build(1);
  mesh.geometry = kept; g.dispose();
  const m = new THREE.Mesh(taken, mesh.material);
  m.castShadow = mesh.castShadow;
  m.name = `${rig.id}:${tag}`;
  mesh.parent.add(m);
  (rig.tags[tag] ||= []).push(m);
  return m;
}

/** 根空间朝向：物体局部 +x 指向 x，局部 +z 尽量朝 z。 */
function basisQ(x, z) {
  const X = V(x[0], x[1], x[2]).normalize();
  const Z = V(z[0], z[1], z[2]); Z.addScaledVector(X, -Z.dot(X)).normalize();
  const Y = V().crossVectors(Z, X);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}

/** 在两份姿势字典之间插值写入 rig.pose（只写两边都有的关节）。 */
function blendPose(rig, a, b, k) {
  for (const n in b) {
    const pa = a[n] || b[n], pb = b[n], p = rig.pose[n] || (rig.pose[n] = [0, 0, 0]);
    p[0] = lerp(pa[0], pb[0], k); p[1] = lerp(pa[1], pb[1], k); p[2] = lerp(pa[2], pb[2], k);
  }
}

// ===========================================================================
// GERARD（理发）：不戴帽子，坐在小凳上，双手放在膝上，一脸不耐烦。
// ===========================================================================

const HAIR = '#9a5a33', HAIR_LINE = '#4e2d1c';
/** 右耳放大倍数（原作里耳朵画得很大，正面 3/4 看才认得出来；剪掉时一起缩小）。 */
const EAR_S = 1.3;

/** 寸头的头皮贴图：橙棕底 + 深色发茬点（04:20 俯视特写）。 */
function scalpTexture() {
  return cachedTex('p3:barber_scalp', () => canvasTexture(256, 256, (g, w, h) => {
    const r = rng(77);
    g.fillStyle = '#9b602c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 10; i++) {
      g.globalAlpha = 0.25; g.fillStyle = r() < 0.5 ? '#8a5226' : '#a86a33';
      g.beginPath(); g.ellipse(r() * w, r() * h, 20 + r() * 30, 14 + r() * 20, r() * 3, 0, TAU); g.fill();
    }
    g.globalAlpha = 1; g.fillStyle = '#6a3f1b';
    for (let i = 0; i < 150; i++) {
      const s = 1.4 + r() * 2.2;
      g.beginPath(); g.ellipse(r() * w, r() * h, s, s * 0.75, r() * 3, 0, TAU); g.fill();
    }
  }, { repeat: [2, 1] }));
}

/**
 * Gerard 的额外表情：wince（被剪时闭眼皱眉）、pain（剪耳朵）；
 * sour / sour_*（理发全程的常态：眉头下压、嘴角下撇的不耐烦），grim / grim_*（少了耳朵之后：眉更低、嘴角更往下，一直保持）。
 */
function paintBarber(g, v) {
  const pain = v === 'pain', wince = v === 'wince', sour = v.startsWith('sour');
  stubble(g, 23, [[-0.5, -0.45], [0.5, -1.0]], 0.18);
  for (const s of [-1, 1]) {
    bags(g, s * 0.34, 0.04, 0.18, 0.09, s, { depth: 1.6, lines: 1, color: 'rgba(75,63,65,0.3)' });
    if (pain || wince) eye(g, s * 0.34, 0.035, 0.175, 0.085, s, { skin: SKIN_GERARD, squeeze: true, lw: 6 });
    else eye(g, s * 0.34, 0.04, 0.175, 0.085, s, { skin: SKIN_GERARD, lid: sour ? 0.6 : 0.66, pupil: 0.52, closed: v.endsWith('_blink'), droop: 0.12, lw: 6, crease: false });
    if (pain) brow(g, [[s * 0.09, 0.27], [s * 0.3, 0.24], [s * 0.6, 0.16]], 9, '#5a3a26');
    else if (wince) brow(g, [[s * 0.1, 0.15], [s * 0.32, 0.2], [s * 0.6, 0.15]], 9.5, '#5a3a26');
    else if (sour) brow(g, [[s * 0.1, 0.15], [s * 0.32, 0.23], [s * 0.6, 0.195]], 10, '#5a3a26');
    else brow(g, [[s * 0.1, 0.135], [s * 0.32, 0.225], [s * 0.6, 0.19]], 10, '#5a3a26');
    line(g, [[s * 0.3, -0.22], [s * 0.44, -0.42], [s * 0.4, -0.62]], 3, 'rgba(60,50,46,0.55)');
  }
  // 眉心竖纹
  line(g, [[-0.045, 0.21], [-0.055, 0.1]], 2.5, 'rgba(50,36,30,0.6)');
  line(g, [[0.045, 0.21], [0.055, 0.1]], 2.5, 'rgba(50,36,30,0.6)');
  line(g, [[-0.07, 0.04], [-0.1, -0.16], [-0.05, -0.25], [0.08, -0.26]], 4, 'rgba(20,20,20,0.7)');
  if (pain) {
    blob(g, [[-0.2, -0.5], [0, -0.52], [0.2, -0.5], [0.12, -0.67], [-0.12, -0.67]], '#321e1a');
    line(g, [[-0.15, -0.535], [0, -0.55], [0.15, -0.535]], 7, '#e6e0d2');
  } else if (v.endsWith('_talk')) {
    blob(g, [[-0.15, -0.5], [0, -0.55], [0.15, -0.5], [0.07, -0.63], [-0.07, -0.62]], '#321e1a');
  } else if (sour) {
    line(g, [[-0.17, -0.57], [-0.06, -0.545], [0.06, -0.545], [0.17, -0.57]], 5);
  } else {
    line(g, [[-0.17, -0.585], [-0.06, -0.545], [0.06, -0.545], [0.17, -0.585]], 5);
  }
}

function buildGerardBarber() {
  const rig = gerardBody('gerard_barber', { hat: false });
  const J = rig.joints, M = rig.mats;
  const [rx, ry, rz] = rig.dims.headR;
  const def = rig.headDef;

  // ---- 胡子：原作这场只有一大撇姜棕色八字胡，没有山羊胡 → 把山羊胡那一壳拆出来隐藏 ----
  const goatee = rig.tags.beard?.[0] ? splitShells(rig, rig.tags.beard[0], (c) => c.y < -ry * 0.62, 'goatee') : null;
  if (goatee) goatee.visible = false;

  // ---- 右耳（−X）：从头部合并网格里拆成单独的组，剪掉时整组隐藏 ----
  const earObj = new THREE.Group(); earObj.name = 'gerard_ear_r';
  J.head.add(earObj);
  const heads = rig.tags.head || [];
  const skinHead = heads.find((m) => m.material === rig.skinMat) || heads[0];
  const innerHead = heads.find((m) => m !== skinHead);
  const earOuter = skinHead ? splitShells(rig, skinHead, (c) => c.x < -rx * 0.7, 'ear_r') : null;
  const earInner = innerHead ? splitShells(rig, innerHead, (c) => c.x < 0, 'ear_r') : null;
  const earC = V(-rx * 0.97, -ry * 0.06, -rz * 0.07);
  if (earOuter) { earOuter.geometry.computeBoundingBox(); earOuter.geometry.boundingBox.getCenter(earC); }
  earObj.position.copy(earC);
  for (const m of [earOuter, earInner]) if (m) { m.geometry.translate(-earC.x, -earC.y, -earC.z); m.geometry.computeBoundingSphere(); earObj.add(m); }
  rig.earObj = earObj;

  // ---- 发型：四级，每级一组网格，统一放在 hairObj 下（章节在它上面挂热点） ----
  const hairObj = new THREE.Group(); hairObj.name = 'gerard_hair';
  J.head.add(hairObj);
  // 发帽边缘离头皮有一点空隙，从另一侧看过去会看到帽子内壁（被描边画成一块黑）→ 发帽材质用双面（克隆一份，不动共享材质）
  const dbl = (m) => { const c = m.clone(); c.side = THREE.DoubleSide; return c; };
  const baseCap = rig.tags.hair?.[0] || null;        // gerardBody 自带的贴头发帽（第 2 级“很短”直接用它）
  if (baseCap) { baseCap.material = dbl(baseCap.material); hairObj.add(baseCap); }
  const hairMat = dbl(M.toon('#ffffff', { map: hairStrands(HAIR, HAIR_LINE, 63) }));
  const lockMat = M.toon('#ffffff', { map: hairStrands('#a2643a', '#4a2a16', 64) });
  const R = rng(311);
  const jit = (a) => (R() * 2 - 1) * a;

  // 第 0 级（01:12）：乱蓬蓬的长发，从右侧分线越过头顶扫向左边，发梢一簇簇翘出来；前额垂下几绺，鬓角盖到耳朵上沿
  const O0 = { front: 0.28 * PI, side: 0.53 * PI, back: 0.68 * PI, scale: 1.05, top: 0.36, quiff: 0.16 };
  const O1 = { front: 0.29 * PI, side: 0.52 * PI, back: 0.67 * PI, scale: 1.04, top: 0.14, quiff: 0.08 };
  const O2 = { front: 0.3 * PI, side: 0.5 * PI, back: 0.66 * PI, scale: 1.04, top: 0.02, quiff: 0.02 };   // = gerardBody 的发帽
  const O3 = { front: 0.31 * PI, side: 0.52 * PI, back: 0.66 * PI, scale: 1.014, top: 0.006, quiff: 0 };
  const CENTER = V(0, -0.015, -0.005);
  /** 一绺越过头顶的发：a、b 为起止单位方向，ext 发梢甩出去的比例，flare 发梢翘起的高度，lift 离发帽的距离。 */
  const sweep = (o, a, b, { ext = 0.3, flare = 0.3, lift = 0.05, bulge = 0.06, w = 0.024, t = 0.006, n = 8, droop = 0 } = {}) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * (1 + ext);
      const d = slerpDir(a, b, s);
      const over = Math.max(0, s - 1) / Math.max(ext, 1e-3);
      if (over > 0 && droop) d.y -= droop * over * over;
      pts.push(capPt(def, d.normalize(), o, lift + bulge * Math.sin(PI * clamp(s, 0, 1)) + flare * over * over));
    }
    return strand(pts, w, t, { tip: 0.05, seg: 22, radial: 8, center: CENTER, twist: (k) => 0.35 * Math.sin(k * 3 + R() * 6) });
  };
  const addAll = (geos, mat, tag) => { for (const g of geos) rig.ps.add(J.head, g, mat, tag); };

  const g0 = [hairCapGeo(rig, O0)];
  for (let i = 0; i < 10; i++) {
    const s = i / 9;
    const a = dir((0.28 + 0.08 * s + jit(0.015)) * PI, -(0.22 + 0.6 * s) * PI + jit(0.03));
    const b = dir((0.36 + 0.08 * s + jit(0.02)) * PI, (0.3 + 0.5 * s) * PI + jit(0.05));
    g0.push(sweep(O0, a, b, { ext: 0.25 + R() * 0.25, flare: 0.18 + R() * 0.28, lift: 0.015 + R() * 0.025, bulge: 0.03 + R() * 0.04, w: 0.02 + R() * 0.012, droop: R() < 0.4 ? -0.25 : 0.1 }));
  }
  // 顶上叠起来的几块宽扁发片（原作是一片片木片似的翘起，发梢朝画面右上方）：越靠上、越宽、翘得越高
  for (const [s0, lf, bl, fl, w] of [[0.2, 0.05, 0.08, 0.5, 0.05], [0.4, 0.075, 0.1, 0.62, 0.052], [0.6, 0.1, 0.11, 0.7, 0.048], [0.8, 0.12, 0.1, 0.58, 0.04]]) {
    const a = dir((0.12 + 0.1 * s0) * PI, -(0.5 + 0.2 * s0) * PI + jit(0.04));
    const b = dir((0.2 + 0.12 * s0) * PI, (0.4 + 0.3 * s0) * PI + jit(0.04));
    g0.push(sweep(O0, a, b, { ext: 0.32, flare: fl, lift: lf, bulge: bl, w, t: 0.007, droop: -0.2 }));
  }
  // 额前翘出来的几绺：从头顶往前、往左扫，发梢略探出发际线
  for (const [ph0, ph1, fl] of [[-0.22, 0.05, 0.26], [-0.05, 0.22, 0.22], [0.08, 0.38, 0.3]]) {
    g0.push(sweep(O0, dir(0.12 * PI, ph0 * PI), dir(0.27 * PI, ph1 * PI), { ext: 0.35, flare: fl, lift: 0.025, bulge: 0.02, w: 0.022, droop: 0.12 }));
  }
  // 右鬓（−X）往下盖到耳朵上沿；左鬓（+X）一簇往外翘
  for (const ph of [-0.36, -0.45, -0.54, -0.63]) g0.push(sweep(O0, dir(0.3 * PI, ph * PI), dir(0.46 * PI, (ph - 0.02) * PI), { ext: 0.12, flare: 0.04, lift: 0.008, bulge: 0.015, w: 0.018 }));
  for (const [ph, fl] of [[0.4, 0.35], [0.5, 0.45], [0.6, 0.32]]) g0.push(sweep(O0, dir(0.3 * PI, ph * PI), dir(0.43 * PI, (ph + 0.04) * PI), { ext: 0.45, flare: fl, lift: 0.01, bulge: 0.02, w: 0.02, droop: -0.1 }));
  // 后脑往下垂的几绺
  for (const ph of [-0.82, -0.94, 0.9, 0.78]) g0.push(sweep(O0, dir(0.25 * PI, ph * PI), dir(0.6 * PI, ph * PI), { ext: 0.12, flare: 0.05, lift: 0.01, bulge: 0.03, w: 0.026 }));
  addAll(g0.slice(0, 1), hairMat, 'hair0'); addAll(g0.slice(1), lockMat, 'hair0');

  // 第 1 级（03:58）：剪短一截，顶上顺着往左梳的一层，发梢只稍微露出来
  const g1 = [hairCapGeo(rig, O1)];
  for (let i = 0; i < 7; i++) {
    const s = i / 6;
    const a = dir((0.3 + 0.06 * s) * PI, -(0.22 + 0.6 * s) * PI + jit(0.02));
    const b = dir((0.38 + 0.06 * s) * PI, (0.3 + 0.48 * s) * PI + jit(0.03));
    g1.push(sweep(O1, a, b, { ext: 0.1 + R() * 0.08, flare: 0.04 + R() * 0.06, lift: 0.015, bulge: 0.03, w: 0.024, t: 0.005 }));
  }
  for (const ph of [-0.4, -0.5, -0.6]) g1.push(sweep(O1, dir(0.3 * PI, ph * PI), dir(0.47 * PI, ph * PI), { ext: 0.1, flare: 0.02, lift: 0.005, bulge: 0.01, w: 0.018, t: 0.005 }));
  addAll(g1.slice(0, 1), hairMat, 'hair1'); addAll(g1.slice(1), lockMat, 'hair1');

  // 第 2 级（04:02–04:06）：贴头皮的短发（gerardBody 的发帽）+ 顶上一圈深色短发茬
  rig.ps.add(J.head, bristles(def, rig.dims.headR, O2, 110, { seed: 9, len: [0.004, 0.008] }), M.toon('#2e1d12', { outline: false }), 'hair2');
  // 第 3 级（04:08 起）：寸头 —— 贴头皮的橙棕发茬 + 外轮廓上一根根黑色短毛
  rig.ps.add(J.head, hairCapGeo(rig, O3), M.toon('#ffffff', { map: scalpTexture() }), 'hair3');
  rig.ps.add(J.head, bristles(def, rig.dims.headR, O3, 150, { seed: 13, len: [0.005, 0.011] }), M.toon('#171310', { outline: false }), 'hair3');
  rig.ps.build(rig);
  const layer = (tag, name) => {
    const g = new THREE.Group(); g.name = name; hairObj.add(g);
    for (const m of rig.tags[tag] || []) g.add(m);
    return g;
  };
  const H = [layer('hair0', 'gerard_hair_0'), layer('hair1', 'gerard_hair_1'), layer('hair2', 'gerard_hair_2'), layer('hair3', 'gerard_hair_3')];
  const base = baseCap || new THREE.Group();
  const LAYERS = [[H[0]], [H[1]], [base, H[2]], [H[3]]];
  const ALL = [base, ...H];

  // 头皮墨线地图（04:20）：贴在寸头头顶偏前，正面略俯视时左 ⊙、右 ⊕，中间横线，上方向下的箭头
  const mapMat = M.toon('#ffffff', { map: scalpMapTexture(), transparent: true, outline: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const mapMesh = new THREE.Mesh((() => {
    const thc = 0.22 * PI, w = 1.7, h = 0.85, nx = 24, ny = 12;
    const C = V(0, Math.cos(thc), Math.sin(thc)), X = V(1, 0, 0), Yb = V(0, Math.sin(thc), -Math.cos(thc));
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = j / ny;
      const d = C.clone().addScaledVector(X, (u - 0.5) * w).addScaledVector(Yb, (v - 0.5) * h).normalize();
      const p = capPt(def, d, O3, 0.012);
      pos.push(p.x, p.y, p.z); uv.push(u, v);
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  })(), mapMat);
  mapMesh.name = 'gerard_scalp_map'; mapMesh.renderOrder = 2; mapMesh.raycast = () => {};
  H[3].add(mapMesh);

  // 点头发用的透明点击壳（比头发大一圈；单面朝外，点脸不会穿过去点到后脑勺的内壁）
  const hit = new THREE.Mesh(hairCapGeo(rig, { front: 0.3 * PI, side: 0.55 * PI, back: 0.7 * PI, scale: 1.3, top: 0.42, quiff: 0.1 }),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.FrontSide }));
  hit.name = 'gerard_hair_hit'; hit.userData.proxy = true;
  hairObj.add(hit);
  rig.hairObj = hairObj;
  rig.headObj = J.head;

  // ---- 剪掉耳朵后的伤口和一道流到下颌的血（04:12–04:16） ----
  const blood = new THREE.Group(); blood.name = 'gerard_ear_blood'; blood.visible = false;
  J.head.add(blood);
  const wound = new THREE.Mesh(place(sphere(0.006, 0.03, 0.016, 16, 10), [earC.x + 0.004, earC.y, earC.z], [-0.15, 0.35, 0]), M.toon('#6e0b0f', { outline: false }));
  wound.name = 'gerard_ear_wound'; blood.add(wound);
  const surf = (x, y, z, r) => { const p = V(x, y, z).normalize().multiplyScalar(r); def(p); return p; };
  const streakPts = [surf(-0.99, -0.07, 0.0, 1.035), surf(-0.98, -0.22, 0.04, 1.03), surf(-0.95, -0.38, 0.07, 1.03), surf(-0.9, -0.52, 0.09, 1.03), surf(-0.84, -0.63, 0.1, 1.03)];
  const streakGeo = strand(streakPts, 0.0075, 0.0022, { tip: 0.7, base: 1, seg: 24, radial: 6, center: V(0, 0, 0) });
  const streak = new THREE.Mesh(streakGeo, M.toon('#b3141b', { outline: false }));
  streak.name = 'gerard_ear_streak'; blood.add(streak);
  const drop = new THREE.Mesh(place(sphere(0.0068, 0.0088, 0.004, 12, 8), streakPts[4].toArray()), streak.material);
  drop.name = 'gerard_ear_drop'; blood.add(drop);
  const STREAK_N = streakGeo.index.count;
  const setBleed = (k) => {
    blood.visible = k > 0;
    streakGeo.setDrawRange(0, Math.max(0, Math.floor(STREAK_N * k / 36) * 36));   // radial = 6 → 每段 36 个索引
    drop.visible = k >= 0.98;
    wound.scale.setScalar(lerp(0.4, 1, clamp(k * 4, 0, 1)));
  };

  // ---- 给 Ida 用的挂点：肩顶（她的手搭在这里）、剪头发的位置、右耳 ----
  const anchor = (name, joint, p) => { const o = new THREE.Object3D(); o.name = `gerard_${name}`; o.position.copy(p); joint.add(o); return o; };
  const shY = J.armL.userData.base.y;
  rig.anchors = {
    shoulderL: anchor('shoulder_l', J.torso, V(0.14, shY + 0.03, -0.02)),
    shoulderR: anchor('shoulder_r', J.torso, V(-0.14, shY + 0.03, -0.02)),
    snip: anchor('snip', J.head, V(-rx * 0.82, ry * 0.92, -0.01)),
    earR: anchor('ear_r', J.head, earC.clone()),
  };

  // ---- 坐姿：小凳（座高 0.45），双手放在膝上，背稍弓 ----
  const S = BARBER_SEAT;
  const SIT = rig.solve(mergePose(seatedPose(rig, S, { spread: 0.12 }), { torso: [0.05, 0, 0], neck: [0.02, 0, 0], head: [-0.05, 0, 0] }), {
    L: { pos: [0.15, S + 0.165, 0.29], pole: [1, -0.25, -0.5], hand: [0.55, 0, -0.1] },
    R: { pos: [-0.15, S + 0.165, 0.29], pole: [-1, -0.25, -0.5], hand: [0.55, 0, 0.1] },
  });
  rig.POSES = { sit: SIT };
  for (const s of ['L', 'R']) { rig.hideHand(s, false); rig.setHand(s, 'relax'); }
  rig.setPose(SIT);
  lifeIdle(rig, { breath: 0.01, sway: 0.006, look: 0.04, lookEvery: 6, seated: true, arms: 0.4 });

  // ---- 表情：理发全程 neutral 画 sour（不耐烦），剪掉耳朵后画 grim（更阴沉），都照常眨眼 / 说话；另有 wince / pain ----
  const baseTex = rig.face.tex, extraTex = faceSet(paintBarber);
  let mood = 'sour';
  rig.face.tex = (v) => {
    if (v === 'wince' || v === 'pain' || v === 'grim' || v === 'sour') return extraTex(v);
    if (v === 'neutral' || v === 'blink' || v === 'talk') return extraTex(`${mood}_${v}`);
    return baseTex(v);
  };
  const setMood = (m) => { mood = m; rig.face.cur = null; rig.refreshFace(); };
  rig.getMood = () => mood;                      // 'sour'（理发全程）/ 'grim'（耳朵被剪之后），验收和章节读状态用

  // ---- 碎发：一小撮从头上弹起再飘落（约 0.8 秒）。原作里是几片棕色的柳叶形发片，镜头里要认得出来，所以做得比真发大 ----
  const bitMats = [M.toon(HAIR, { outline: 0.004 }), M.toon('#74421f', { outline: 0.004 })];
  const bitGeo = mergeGeometries([
    place(sphere(0.012, 0.0028, 0.0052, 8, 5), [0, 0, 0], [0, 0, 0]).toNonIndexed(),
    place(sphere(0.007, 0.0024, 0.0044, 8, 5), [0.012, 0.002, 0], [0, 0, 0.45]).toNonIndexed(),
  ], false);
  const bits = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(bitGeo, bitMats[i % 2]); m.name = 'gerard_hair_bit'; m.visible = false; m.raycast = () => {};
    rig.root.add(m); bits.push(m);
  }
  let snipGen = 0;
  const STAGE_R = [1.32, 1.2, 1.08, 1.03];

  let hair = 0, scalpMap = false, ear = true, hairGen = 0, earGen = 0;
  const restoreHead = () => { rig.pose.head = SIT.head.slice(); rig.pose.neck = SIT.neck.slice(); };
  const applyHair = (n) => {
    for (const o of ALL) { o.visible = LAYERS[n].includes(o); o.scale.setScalar(1); }
    mapMesh.visible = scalpMap;
  };
  const applyEar = (on) => {
    earObj.visible = on; earObj.scale.setScalar(EAR_S); earObj.rotation.set(0, 0, 0);
    setBleed(on ? 0 : 1);
    setMood(on ? 'sour' : 'grim');
  };

  /** 一小撮碎发从剪刀处弹起、飘落（约 0.8 秒）。 */
  rig.snipHair = ({ instant = false } = {}) => {
    const g = ++snipGen;
    for (const b of bits) b.visible = false;
    if (instant) return Promise.resolve();
    const o = capPt(def, rig.anchors.snip.position.clone().normalize(), { scale: STAGE_R[Math.max(0, Math.min(3, hair))], top: 0 });
    const O = rig.jointToRoot(J.head, o, V());
    const out = rig.jointToRoot(J.head, V(-1, 0.4, 0.2), V()).sub(rig.jointToRoot(J.head, V(), V())).setY(0).normalize();
    const RR = rng(41 + g);
    const P0 = bits.map(() => O.clone().add(V((RR() - 0.5) * 0.04, (RR() - 0.5) * 0.02, (RR() - 0.5) * 0.04)));
    const VEL = bits.map(() => out.clone().multiplyScalar(0.12 + RR() * 0.25).add(V((RR() - 0.5) * 0.25, 0.25 + RR() * 0.35, (RR() - 0.5) * 0.25)));
    const SPIN = bits.map(() => [RR() * TAU, RR() * TAU, 6 + RR() * 8, RR() * 0.6 + 0.7]);
    return animate(800, (k) => {
      if (g !== snipGen) return;
      const t = k * 0.8;
      bits.forEach((b, i) => {
        b.visible = k < 1;
        b.position.copy(P0[i]).addScaledVector(VEL[i], t); b.position.y -= 1.15 * t * t;
        const [a0, a1, sp, sz] = SPIN[i];
        b.rotation.set(a0 + sp * t, a1 + sp * 0.6 * t, Math.sin(t * sp) * 0.8);
        b.scale.setScalar(sz * (1 - seg(t, 0.55, 0.8)) + 1e-4);
      });
    }, Ease.linear);
  };

  /**
   * 换发型 0..3。非 instant 且变短时：在 delay 秒（默认 = ida.snip() 合刀时刻）旧发型缩回头皮、掉一撮碎发，
   * 他闭眼皱一下眉、头往左躲一下（约 0.6 秒）。
   */
  rig.setHair = (stage, { instant = false, delay = HAIR_SNIP_AT } = {}) => {
    stage = clamp(Math.round(stage), 0, 3);
    const from = hair; hair = stage;
    const g = ++hairGen;
    if (instant || stage === from) { applyHair(stage); return Promise.resolve(); }
    const outgoing = LAYERS[from].filter((o) => !LAYERS[stage].includes(o));
    const incoming = LAYERS[stage].filter((o) => !LAYERS[from].includes(o));
    const total = delay + 0.55;
    let swapped = false;
    return animate(total * 1000, (k) => {
      if (g !== hairGen) return;
      const t = k * total;
      if (!swapped && t >= delay) {
        swapped = true;
        for (const o of incoming) { o.visible = true; o.scale.setScalar(1); }
        mapMesh.visible = scalpMap;
        if (stage > from) rig.snipHair();
      }
      const s = seg(t, delay, delay + 0.14);
      for (const o of outgoing) { o.scale.setScalar(1 - 0.14 * s); o.visible = s < 1; }
      const f = Math.sin(PI * seg(t, delay - 0.03, delay + 0.42));
      rig.pose.head = [SIT.head[0] + 0.04 * f, SIT.head[1] + 0.05 * f, SIT.head[2] - 0.07 * f];
      if (rig.face.expr !== 'pain') rig.setExpression(t > delay - 0.02 && t < delay + 0.38 ? 'wince' : 'neutral');
      if (k >= 1) { applyHair(stage); restoreHead(); rig.setExpression('neutral'); }
      rig.apply();
    }, Ease.linear);
  };

  /** 头顶的墨线地图（只在寸头时看得见）。 */
  rig.showScalpMap = (on = true) => { scalpMap = !!on; mapMesh.visible = scalpMap; return Promise.resolve(); };

  /**
   * 右耳（画面左侧）被剪掉：delay 秒（默认 = ida.cutEar() 合刀时刻）剪断 → 伤口冒血、一道血顺着下颌流下，
   * 耳朵抖一下随即消失（章节在这时把耳朵物品给玩家），表情 pain 约 1 秒后回到不高兴的 grim。之后一直保持。
   */
  rig.cutEar = ({ instant = false, delay = EAR_SNIP_AT } = {}) => {
    const g = ++earGen;
    ear = false;
    if (instant) { applyEar(false); rig.setExpression('neutral'); return Promise.resolve(); }
    const total = delay + 1.5;
    return animate(total * 1000, (k) => {
      if (g !== earGen) return;
      const c = k * total - delay;
      if (c < 0) return;
      setBleed(seg(c, 0.02, 0.7));
      const gone = seg(c, 0.45, 0.62);
      earObj.visible = gone < 1;
      earObj.scale.setScalar(EAR_S * (1 - gone * 0.9));
      earObj.rotation.set(0, 0, Math.sin(seg(c, 0, 0.3) * PI * 3) * 0.12 * (1 - seg(c, 0, 0.3)));
      const f = Math.sin(PI * seg(c, -0.02, 0.6));
      rig.pose.head = [SIT.head[0] + 0.05 * f, SIT.head[1] + 0.08 * f, SIT.head[2] - 0.12 * f];
      if (c < 1.0) rig.setExpression('pain');
      else if (rig.face.expr === 'pain') { setMood('grim'); rig.setExpression('neutral'); }
      if (k >= 1) { applyEar(false); restoreHead(); rig.setExpression('neutral'); }
      rig.apply();
    }, Ease.linear);
  };

  /** 瞬时恢复（新游戏 / 读档）：{ hair: 0..3, scalpMap, ear: true = 还在 / false = 已剪掉 }，只改给出的字段。 */
  rig.setState = (s = {}) => {
    hairGen++; earGen++; snipGen++;
    if (s.hair !== undefined) hair = clamp(Math.round(Number(s.hair) || 0), 0, 3);
    if (s.scalpMap !== undefined) scalpMap = !!s.scalpMap;
    if (s.ear !== undefined) ear = s.ear !== false;
    for (const b of bits) b.visible = false;
    applyHair(hair); applyEar(ear); restoreHead();
    rig.setExpression('neutral');
    rig.apply();
    return Promise.resolve();
  };
  rig.getState = () => ({ hair, scalpMap, ear });

  rig.setState({ hair: 0, scalpMap: false, ear: true });
  rig.headTop.position.y = ry + 0.2;
  rig.play('idle'); rig.apply();
  return rig;
}

// ===========================================================================
// IDA（理发）：站在 Gerard 身后，双手搭在他肩上（01:16）；拿剪刀（03:54）、剪头发、剪耳朵（04:10）。
// ===========================================================================

/**
 * 没有 setPartner() 时用的 Gerard 挂点（gerard_barber 坐姿、root 在原点时的 root 坐标，dev/common/viewer 实测）。
 * 换算到 Ida 的 root 坐标时减去 IDA_BEHIND。
 */
const GERARD_ANCHORS = {
  shoulderL: [0.14, 1.115, -0.06],
  shoulderR: [-0.14, 1.115, -0.06],
  snip: [-0.09, 1.413, -0.02],
  earR: [-0.106, 1.274, -0.02],
};
const OPEN = 0.32;                                   // 剪刀平时张开的程度（p3_scissors.setOpen）
const SC = 1.3;                                      // 手里的剪刀放大倍数（原作里的剪刀有半个头那么长，物品模型按图标尺寸做得偏小）
const PIV = 0.062 + 0.02;                            // 剪刀转轴离拳心的距离（刀刃沿 +x；放大后圈柄要仍然落在拳心）
const Q_UP = basisQ([0.45, 0.86, 0.1], [0.15, 0, 1]);   // 举在他头侧：刀刃朝上偏内，刀面朝前
const Q_EAR = basisQ([0.2, -0.12, 1], [-1, 0, 0.35]);   // 伸到右耳边：刀刃朝前，耳朵夹在两片刃之间

/** 拿不到 p3_scissors 时的简易剪刀（银色两片刃 + 黑色圈柄，局部 +x 为刀刃方向，支持 setOpen）。 */
function fallbackScissors(M) {
  const root = new THREE.Group(); root.name = 'p3_scissors';
  const steel = M.toon('#cfcfca'), ringMat = M.toon('#e8e5dd');
  for (const s of [-1, 1]) {
    const half = new THREE.Group(); half.name = s > 0 ? 'scissors_upper' : 'scissors_lower'; root.add(half);
    half.add(new THREE.Mesh(place(new THREE.BoxGeometry(0.12, 0.008, 0.003), [0.055, s * 0.003, s * 0.002]), steel));
    const ring = new THREE.Mesh(place(new THREE.TorusGeometry(0.016, 0.0045, 8, 18), [-0.06, -s * 0.02, s * 0.002]), ringMat); ring.name = 'scissors_ring';
    half.add(ring);
  }
  root.setOpen = (k) => { for (const c of root.children) c.rotation.z = (c.name.endsWith('upper') ? 1 : -1) * k * 0.5; };
  return root;
}

function buildIdaBarber() {
  const rig = buildIda();
  rig.id = 'ida_barber'; rig.root.name = 'ida_barber';
  const J = rig.joints, M = rig.mats;
  const ry = rig.dims.headR[1];
  // 这一场不戴青蛙、不拿笛子
  rig.showFrog?.(false);
  if (rig.frog) rig.frog.removeFromParent();
  if (rig.fluteObj) rig.fluteObj.visible = false;
  rig.headTop.position.y = ry + 0.14;
  rig.setExpression('neutral');

  // ---- 剪刀：右手握着圈柄，朝向在 root 空间里由 qCur 决定（每帧在 _after 钩子里校正） ----
  let sc = null;
  try { const f = getPropFactory(); sc = f ? f('p3_scissors') : null; } catch (e) { sc = null; }
  if (!sc) sc = fallbackScissors(M);
  // 物品模型的材质是全局共享的（物品栏图标也用），克隆一份免得 setOpacity 之类改到图标
  sc.traverse((o) => { if (o.material) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); });
  sc.traverse((o) => { o.raycast = () => {}; });
  // 原作里手握的剪刀是白色的（黑描边），物品图标里的黑圈柄在这里换成浅色
  sc.traverse((o) => { if (o.isMesh && /scissors_(ring|shank)$/.test(o.name)) { o.material.color.set('#e8e5dd'); } });
  const mount = new THREE.Group(); mount.name = 'ida_scissors';
  mount.position.set(0.012, -0.062, 0.004);          // 右手握拳处（hand 关节局部坐标）
  J.handR.add(mount);
  sc.scale.setScalar(SC);
  sc.position.set(PIV, 0, 0);                        // 圈柄落在拳心，刀刃沿 +x 伸出去
  mount.add(sc);
  mount.visible = false;
  const qCur = Q_UP.clone();
  holdUpright(rig, J.handR, mount, () => qCur);
  const setOpen = (k) => sc.setOpen?.(k);
  setOpen(OPEN);
  rig.scissorsObj = mount;

  // ---- 姿势：身体微微前倾，双手搭在他肩上；右手举剪刀；右手伸到他右耳边 ----
  const LEAN = { torso: [0.08, 0, 0], neck: [-0.02, 0, 0], head: [-0.03, 0, 0], 'body.p': [0, 0, -0.02] };
  let partner = null, behind = IDA_BEHIND;
  const _m = new THREE.Matrix4();
  const anchor = (name) => {
    const a = partner?.anchors?.[name];
    if (a) {
      const w = a.getWorldPosition(V());
      rig.root.updateMatrixWorld(true);
      return w.applyMatrix4(_m.copy(rig.root.matrixWorld).invert());
    }
    const p = GERARD_ANCHORS[name];
    return V(p[0] - behind[0], p[1] - behind[1], p[2] - behind[2]);
  };
  const onShoulder = (side) => {
    const s = side === 'L' ? 1 : -1, a = anchor('shoulder' + side);
    return { pos: a.add(V(s * 0.004, 0.03, -0.065)).toArray(), pole: [s, -0.75, -0.35], aim: { fingers: [s * 0.05, -0.62, 1], palm: [0, -1, 0.35] } };
  };
  /** 手腕位置：让剪刀刀刃中段（离拳心 dist 米）落在 target 上。 */
  const gripFor = (target, q, fingers, palm, dist, pole) => {
    const F = V(...fingers).normalize(), Pm = V(...palm).normalize();
    const grip = target.clone().sub(V(PIV + dist, 0, 0).applyQuaternion(q));
    const wrist = grip.addScaledVector(F, -0.062).addScaledVector(Pm, -0.012);
    return { pos: wrist.toArray(), pole, aim: { fingers: F.toArray(), palm: Pm.toArray() } };
  };
  const POSES = {};
  const computePoses = () => {
    const L = onShoulder('L');
    POSES.rest = rig.solve(LEAN, { L, R: onShoulder('R') });
    POSES.up = rig.solve(LEAN, { L, R: gripFor(anchor('snip'), Q_UP, [0.25, 1, 0.15], [0.9, 0, 0.35], 0.05, [-1, -0.7, -0.15]) });
    POSES.ear = rig.solve(LEAN, { L, R: gripFor(anchor('earR').add(V(-0.012, 0, 0)), Q_EAR, [0.25, 0.1, 1], [0.95, 0.1, -0.2], 0.045, [-1, -0.5, -0.5]) });
  };
  computePoses();
  rig.POSES = POSES;

  let scissors = false, gen = 0;
  const handPoses = () => { rig.setHand('L', 'relax'); rig.setHand('R', scissors ? 'grip' : 'relax'); };

  /**
   * 指定她扶着的 Gerard（gerard_barber 的 rig）。place = true（默认）时把 Ida 放到他身后 offset 处
   * （默认 IDA_BEHIND；同一父节点、同一朝向）；之后按他的实际肩膀 / 头 / 耳朵位置重算手的落点。
   * 章节自己摆放时传 { place: false, offset: 她相对 Gerard 的 root 偏移 }，手的落点照样按这个偏移算。
   */
  rig.setPartner = (g, { place: doPlace = true, offset = IDA_BEHIND } = {}) => {
    partner = g || null;
    behind = offset;
    if (partner && doPlace) {
      const gr = partner.root;
      if (gr.parent && rig.root.parent !== gr.parent) gr.parent.add(rig.root);
      rig.root.quaternion.copy(gr.quaternion);
      rig.root.position.copy(gr.position).add(V(...behind).applyQuaternion(gr.quaternion));
    }
    rig.root.updateMatrixWorld(true);
    partner?.root.updateMatrixWorld(true);
    computePoses();
    gen++;
    rig.setPose(scissors ? POSES.up : POSES.rest);
    qCur.copy(Q_UP); setOpen(OPEN);
    return rig;
  };

  /** 右手举起剪刀到他头侧（03:54）/ 放下剪刀、双手搭回肩上。 */
  rig.holdScissors = (on = true, { instant = false } = {}) => {
    const g = ++gen;
    const was = scissors;
    scissors = !!on;
    qCur.copy(Q_UP); setOpen(OPEN);
    const target = scissors ? POSES.up : POSES.rest;
    if (instant) { mount.visible = scissors; mount.scale.setScalar(1); handPoses(); rig.setPose(target); return Promise.resolve(); }
    // 剪刀在手里“长出来 / 收起来”（约 0.3 秒），免得凭空闪现
    const pop = (from, to, ms) => animate(ms, (k) => { if (g === gen) mount.scale.setScalar(lerp(from, to, smooth(k)) + 1e-4); }, Ease.linear);
    if (scissors && !was) { mount.visible = true; mount.scale.setScalar(0.02); handPoses(); pop(0.02, 1, 320); }
    else if (scissors) { mount.visible = true; handPoses(); }
    else if (was) pop(1, 0.02, 260);
    return rig.tweenPose(target, 700, Ease.inOutSine).then(() => {
      if (g !== gen) return;
      mount.visible = scissors; mount.scale.setScalar(1); handPoses();
    });
  };

  /** 剪刀在他头边开合一次（约 0.42 秒，合刀时刻 = HAIR_SNIP_AT），手腕往里压一下。 */
  rig.snip = ({ instant = false } = {}) => {
    if (!scissors || instant) return Promise.resolve();
    const g = ++gen;
    const up = POSES.up, q2 = Q_UP.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), 0.12));
    return animate(420, (k) => {
      if (g !== gen) return;
      const t = k * 0.42;
      const close = t < HAIR_SNIP_AT ? smooth(t / HAIR_SNIP_AT) : 1 - smooth((t - HAIR_SNIP_AT) / (0.42 - HAIR_SNIP_AT));
      setOpen(OPEN * (1 - close));
      qCur.copy(Q_UP).slerp(q2, close);
      rig.pose.handR = [up.handR[0] + 0.1 * close, up.handR[1], up.handR[2] - 0.12 * close];
      rig.pose.elbowR = [up.elbowR[0] - 0.05 * close, up.elbowR[1], up.elbowR[2]];
      if (k >= 1) { rig.setPose(up); qCur.copy(Q_UP); setOpen(OPEN); }
      rig.apply();
    }, Ease.linear);
  };

  /** 剪刀移到他右耳边“咔嚓”（合刀时刻 = EAR_SNIP_AT），再举回头侧（约 1.5 秒）。 */
  rig.cutEar = ({ instant = false } = {}) => {
    if (instant) return rig.setState({ scissors: true });
    if (!scissors) return rig.holdScissors(true).then(() => rig.cutEar());
    const g = ++gen;
    const up = POSES.up, ear = POSES.ear;
    return animate(1500, (k) => {
      if (g !== gen) return;
      const t = k * 1.5;
      const go = smooth(seg(t, 0, EAR_SNIP_AT - 0.1)) * (1 - smooth(seg(t, 0.85, 1.4)));
      blendPose(rig, up, ear, go);
      qCur.copy(Q_UP).slerp(Q_EAR, go);
      const close = smooth(seg(t, EAR_SNIP_AT - 0.1, EAR_SNIP_AT)) * (1 - smooth(seg(t, 0.75, 1.0)));
      setOpen(lerp(OPEN * 1.4, 0, close) * go + OPEN * (1 - go));
      if (k >= 1) { rig.setPose(up); qCur.copy(Q_UP); setOpen(OPEN); }
      rig.apply();
    }, Ease.linear);
  };

  /** 瞬时恢复：{ scissors: 是否拿着剪刀（举在他头侧） }。 */
  rig.setState = (s = {}) => {
    gen++;
    if (s.scissors !== undefined) scissors = !!s.scissors;
    mount.visible = scissors; mount.scale.setScalar(1); qCur.copy(Q_UP); setOpen(OPEN); handPoses();
    rig.setPose(scissors ? POSES.up : POSES.rest);
    return Promise.resolve();
  };
  rig.getState = () => ({ scissors });

  rig.setState({ scissors: false });
  rig.play('idle'); rig.apply();
  return rig;
}

export const CAST = {
  gerard_barber: buildGerardBarber,
  ida_barber: buildIdaBarber,
};
