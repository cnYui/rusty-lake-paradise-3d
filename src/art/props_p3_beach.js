// 第三灾（蚊灾和虱灾）海滩 / 湖岸 / 神殿道具：天堂门前的符号石、贻贝、沙地上的 X、滑块盒、湖岸木桩、神殿窗台盘与鹦鹉。
// 接口见 docs/plague3_api.md §3。约定：1 单位 = 1 米，原点在地面（或挂点），正面朝 +z；状态方法返回 Promise，最后一个参数支持 { instant: true }；
// 每个有状态的道具都有 setState（瞬时、可往回设、没给的字段保持不变）和 getState。外观对照 dev/common/ref/P03_*.mp4 的时间点写在每个函数前。
import {
  THREE, mergeGeometries, TAU, clamp, seg, lerp, smooth, tmat, group, mesh, lathe, rod, merge, hit, cached, play, lumpGeo,
  contactShadow, symbolTexture, canvasTexture, toon, unlit, rng, INK,
} from './props_p3_shared.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { FACTORIES as ITEMS } from './props_p3_items.js';

// ---------------------------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------------------------

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const bc = (key, make) => cached(`p3:beach:${key}`, make);
/** 缓存的“带贴图 + 描边”材质（贴图材质不能走 tmat：它会把贴图序列化进缓存键）。 */
const texToon = (key, make, opts = {}) => bc(`texmat:${key}`, () => toon('#ffffff', { map: make(), ...opts }));
const noise3 = (x, y, z, a = 0, b = 0, c = 0) => Math.sin(x * 5.1 + a) * 0.5 + Math.sin(y * 7.3 + b + x * 2.1) * 0.35 + Math.sin(z * 9.7 + c - y * 4.2) * 0.3;

/** 手绘风的抖动线（canvas）。 */
function wobble(g, pts, width, color, R, jit = 0.25) {
  g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  pts.forEach(([x, y], i) => { const jx = (R() - 0.5) * width * jit, jy = (R() - 0.5) * width * jit; if (i) g.lineTo(x + jx, y + jy); else g.moveTo(x + jx, y + jy); });
  g.stroke();
}

/** 从 from 沿 dir 向 target 打射线，返回 { point, normal }（target 的局部坐标；target 及其祖先必须还没有被摆放）。 */
function surfaceHit(target, from, dir) {
  target.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(from.clone(), dir.clone().normalize());
  const h = rc.intersectObject(target, false)[0];
  if (!h) return null;
  const n = (h.normal || h.face.normal).clone().normalize();
  return { point: h.point.clone(), normal: n };
}

/**
 * 把贴图贴成一块“贴合曲面”的贴花：在 center 处沿 normal 方向展开一张 size × size 的网格，逐点向 target 打射线贴到表面上抬起 lift 米。
 * 网格有一角没打中的格子会被丢掉（贴花边缘超出石头轮廓时不会拉出怪面）。
 */
function conformalDecal(parent, target, tex, { center, normal, up = [0, 1, 0], size = 0.3, grid = 20, lift = 0.0025, name = 'decal', opacity = 1 }) {
  const n = V3().fromArray(normal).normalize(), c = V3().fromArray(center);
  const t1 = V3().crossVectors(V3().fromArray(up), n).normalize();      // 贴花的“右”
  const t2 = V3().crossVectors(n, t1).normalize();                       // 贴花的“上”
  const pos = [], uv = [], ok = [], idx = [];
  for (let j = 0; j <= grid; j++) {
    for (let i = 0; i <= grid; i++) {
      const u = i / grid, v = j / grid;
      const p = c.clone().addScaledVector(t1, (u - 0.5) * size).addScaledVector(t2, (v - 0.5) * size);
      const h = surfaceHit(target, p.clone().addScaledVector(n, 0.5), n.clone().negate());
      const q = h ? h.point.addScaledVector(h.normal, lift) : p;
      pos.push(q.x, q.y, q.z); uv.push(u, v); ok.push(!!h);
    }
  }
  const W = grid + 1;
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const a = j * W + i, b = a + 1, d = a + W, e = d + 1;
      if (ok[a] && ok[b] && ok[d] && ok[e]) idx.push(a, b, d, b, e, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, unlit('#ffffff', { map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
  m.name = name; m.raycast = () => {}; m.renderOrder = 2;
  parent.add(m);
  return m;
}

/** 由表面法线和“上”方向得到挂点的朝向：+z 朝外，+y 沿表面向上。 */
function frameFromNormal(normal, up = V3(0, 1, 0)) {
  const z = normal.clone().normalize();
  const x = V3().crossVectors(up, z).normalize();
  const y = V3().crossVectors(z, x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** 每个道具一个“动画代”：状态被 setState 覆盖后，旧的动画回调不再改画面。 */
function runner() {
  let id = 0;
  return { next: () => ++id, live: (n) => n === id };
}

// ---------------------------------------------------------------------------------------------
// 符号石（00:10、00:18、00:24、08:50）：灰色圆鼓的大石头，亮面是一块一块平涂的浅灰高光，粗黑描边；正面一枚红漆符号（带淌痕）
// 左石 ⊙（'dot'）斜靠一把苍蝇拍，右石 ⊕（'cross'）上贴着一只贻贝。
// ---------------------------------------------------------------------------------------------

const ROCK_SHAPE = {
  // rl / rr：左 / 右半边的半宽；rz：半进深；h：高；shift：顶部向右偏的距离（左缓右陡的楔形）
  dot: { rl: 0.43, rr: 0.34, rz: 0.29, h: 0.42, shift: 0.10, seed: 3, dent: [0.8, 0.42], sym: { at: [0.16, 0.2], size: 0.235 } },
  cross: { rl: 0.37, rr: 0.40, rz: 0.30, h: 0.40, shift: 0.15, seed: 8, dent: [0.7, 0.62], sym: { at: [-0.06, 0.15], size: 0.34 } },
  p3_slider_box: () => makeSliderBox(),
  p3_stump: (o) => makeStump(o || {}),
  p3_sill_plate: () => makeSillPlate(),
  p3_parrot: () => makeParrot(),
};

function rockGeometry(P) {
  let g = new THREE.SphereGeometry(1, 72, 54);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const R = rng(P.seed), ph = [R() * 9, R() * 9, R() * 9];
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i);
    // 右肩一道浅凹（原作石头右上方的台阶）
    const dent = P.dent ? -0.07 * Math.exp(-((dx - P.dent[0]) ** 2 + (dy - P.dent[1]) ** 2) / 0.035) : 0;
    const nz = 1 + 0.035 * noise3(dx, dy, dz, ph[0], ph[1], ph[2]) + dent;
    const up = Math.max(0, dy), sx = dx < 0 ? P.rl : P.rr;
    const x = (dx * sx + P.shift * Math.pow(up, 1.5)) * nz;
    const z = dz * P.rz * (1 + 0.12 * dx) * nz;
    const y = dy >= 0 ? P.h * Math.pow(dy, 0.82) * nz * (1 + 0.1 * dx) : dy * 0.07;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** 石头材质：灰底 + 两块手绘风的浅灰高光（按物体空间法线在片元里一刀切，边缘是干净的线，不是顶点色的锯齿）。 */
function rockMaterial() {
  return bc('rock:mat', () => {
    const m = toon('#96989a', { outline: 0.009 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vRockN;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vRockN = normal;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vRockN;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{ vec3 rn = normalize(vRockN);
  float a = smoothstep(0.852, 0.862, dot(rn, normalize(vec3(-0.3, 0.8, 0.52))));
  float b = smoothstep(0.93, 0.94, dot(rn, normalize(vec3(0.6, 0.72, 0.2))));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.81, 0.81), max(a, b * 0.9)); }`);
    };
    m.customProgramCacheKey = () => 'p3_rock_hl';
    return m;
  });
}

function makeSymbolRock({ symbol = 'dot' } = {}) {
  const kind = symbol === 'cross' ? 'cross' : 'dot';
  const P = ROCK_SHAPE[kind];
  const root = group('p3_symbol_rock');
  const body = mesh(root, rockGeometry(P), rockMaterial(), 'rock_body');
  contactShadow(root, 0.56, 0.44, { opacity: 0.3 });

  // 红漆符号：贴合石面的贴花（正面略朝上）
  const [sx, sy] = P.sym.at;
  const hs = surfaceHit(body, V3(sx, sy, 2), V3(0, 0, -1));
  const sym = conformalDecal(root, body, symbolTexture(kind), { center: hs.point.toArray(), normal: hs.normal.toArray(), size: P.sym.size, name: 'rock_symbol' });

  // 挂点：左石斜靠苍蝇拍（拍面朝下、柄朝右上靠在石头上）；右石的贻贝贴在右上方的肩部
  const sw = new THREE.Object3D(); sw.name = 'swatter_spot';
  sw.position.set(-0.36, 0.3, 0.14); sw.rotation.z = -2.1; sw.userData.scale = 1.25;
  root.add(sw);
  const ms = new THREE.Object3D(); ms.name = 'mussel_spot';
  const mh = surfaceHit(body, V3(0.55, 0.17, 1.2), V3(-0.25, 0.04, -1));
  if (mh) {
    // 贻贝的后壳鼓出约 0.02，整体抬出石面一点，并让上端略微翘离石头（像卡在石缝里探出来）
    ms.position.copy(mh.point).addScaledVector(mh.normal, 0.012);
    ms.quaternion.copy(frameFromNormal(mh.normal)).multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), 0.32));
  } else ms.position.set(0.3, 0.17, 0.18);
  ms.userData.scale = 1.3;
  root.add(ms);

  hit(root, 'rock_hit', [0.86, 0.46, 0.64], [0.02, 0.21, 0]);
  root.userData.kind = kind;
  return root;
}

// ---------------------------------------------------------------------------------------------
// 贻贝（00:24 闭合、08:52 撬开、08:56 取走后）：深紫褐的双壳，带同心生长纹；闭合时只看见前壳的外面，
// 撬开时前壳在壳面所在的平面里绕铰链（窄的那一头）转开约 70°，后壳里是一团橙色贝肉；取走后空壳留着。
// 本地坐标：原点在铰链，长轴 +y（0.13 长），壳口朝 +z（贴在石头上时 +z 朝外）。
// ---------------------------------------------------------------------------------------------

/** 一片贝壳的曲面（泪滴形外轮廓，窄头在原点）。bulge = +1 往 +z 鼓，−1 往 −z 鼓。 */
function valveGeometry(L, W, D, bulge = 1) {
  const nu = 30, nv = 14, pos = [], uv = [], idx = [];
  for (let j = 0; j <= nu; j++) {
    const u = j / nu, half = (W / 2) * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, 0.62))), 0.62);
    for (let i = 0; i <= nv; i++) {
      const v = (i / nv) * 2 - 1;
      const z = bulge * D * (1 - v * v) * Math.sin(Math.PI * Math.pow(u, 0.8));
      pos.push(v * half, u * L, z); uv.push(0.5 + v * 0.5, u);
    }
  }
  for (let j = 0; j < nu; j++) for (let i = 0; i < nv; i++) { const a = j * (nv + 1) + i, b = a + 1, c = a + nv + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function musselTexture() {
  return bc('tex:mussel', () => canvasTexture(128, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#613740'); grd.addColorStop(0.55, '#80524f'); grd.addColorStop(1, '#b0857f');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#26110f'; g.lineWidth = 4; g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      g.beginPath(); g.ellipse(w / 2, h + 24, 10 + i * 10.5, 40 + i * 34, 0, Math.PI * 1.02, Math.PI * 1.98); g.stroke();
    }
    g.fillStyle = 'rgba(255,225,215,0.18)'; g.beginPath(); g.ellipse(w * 0.74, h * 0.45, 9, h * 0.3, 0.08, 0, TAU); g.fill();
  }, { wrap: false }));
}

function makeMusselShell() {
  const root = group('p3_mussel_shell');
  const L = 0.13, W = 0.072, D = 0.017;
  const outer = texToon('mussel', musselTexture);
  const inner = bc('mussel:inner', () => toon('#3a2429', { side: THREE.BackSide, outline: false }));
  const innerBowl = bc('mussel:bowl', () => toon('#3e262b', { outline: false }));
  const geoF = valveGeometry(L, W, D, 1), geoB = valveGeometry(L * 0.97, W * 0.94, D, -1);
  // 后壳（固定在石头里，开口朝 +z）：里面是贝肉
  const back = group('mussel_back', root, [0, 0, -0.004]);
  mesh(back, geoB, innerBowl, 'mussel_valve_back');
  const meat = group('mussel_meat', back);
  mesh(meat, lumpGeo(0.03, { seed: 5, amp: 0.1, squash: [0.78, 1.55, 0.3] }), tmat('#e4a02c'), 'mussel_meat_body', [0, 0.062, -0.006]);
  mesh(meat, new THREE.SphereGeometry(0.0045, 8, 6).scale(1, 1.5, 0.4), bc('mussel:glint', () => unlit('#fff6dc')), 'mussel_meat_glint', [-0.007, 0.082, 0.0035]);
  mesh(meat, new THREE.SphereGeometry(0.0025, 8, 6), bc('mussel:glint', () => unlit('#fff6dc')), 'mussel_meat_glint2', [0.002, 0.072, 0.0035]);
  // 前壳（外面朝 +z，闭合时盖住后壳）
  const front = group('mussel_front', root, [0, 0, 0.003]);
  mesh(front, geoF, outer, 'mussel_valve_front');
  mesh(front, geoF, inner, 'mussel_valve_front_inside');
  hit(root, 'mussel_hit', [0.09, 0.14, 0.07], [0, 0.065, 0.015]);

  const st = { open: false, taken: false }, run = runner();
  const pose = (k) => { front.rotation.z = -1.22 * k; back.rotation.z = 0.1 * k; };
  const showMeat = () => { meat.visible = !st.taken; };
  root.open = (o = {}) => { st.open = true; const my = run.next(); return play(620, (k) => { if (run.live(my)) pose(k); }, o, (k) => 1 - Math.pow(1 - k, 3)); };
  root.take = (o = {}) => {
    st.open = true; st.taken = true; const my = run.next(); pose(1);
    return play(380, (k) => { if (!run.live(my)) return; meat.visible = k < 1; meat.scale.setScalar(1 - 0.6 * smooth(k)); if (k >= 1) meat.scale.setScalar(1); }, o);
  };
  root.setState = (s = {}) => {
    run.next();
    if (s.open !== undefined) st.open = !!s.open;
    if (s.taken !== undefined) st.taken = !!s.taken;
    if (st.taken) st.open = true;
    pose(st.open ? 1 : 0); meat.scale.setScalar(1); showMeat();
    return Promise.resolve();
  };
  root.getState = () => ({ open: st.open, taken: st.taken });
  root.setState({ open: false, taken: false });
  return root;
}

// ---------------------------------------------------------------------------------------------
// 沙地上的 X（07:16–07:22、08:46）：两道比沙地深一点的浅沟；dig() 以后 X 淡出，地上出现一个椭圆坑（深褐色内壁）和一堆翻出的土。
// 坑在原点（约 0.6 × 0.2），土堆在右边 +0.55，挖出的盒子放左边的 box_spot（−0.52）。
// ---------------------------------------------------------------------------------------------

function makeDigX() {
  const root = group('p3_dig_x');
  const R = rng(61);
  const xTex = canvasTexture(512, 512, (g, w) => {
    g.clearRect(0, 0, w, w);
    const arm = (ang, len) => {
      const c = Math.cos(ang), s = Math.sin(ang), ex = c * len, ey = s * len, nx = -s, ny = c;
      g.beginPath();
      g.moveTo(w / 2 - ex, w / 2 - ey);
      g.quadraticCurveTo(w / 2 - ex * 0.2 + nx * 34, w / 2 - ey * 0.2 + ny * 34, w / 2 + ex, w / 2 + ey);
      g.quadraticCurveTo(w / 2 + ex * 0.2 - nx * 22, w / 2 + ey * 0.2 - ny * 22, w / 2 - ex, w / 2 - ey);
      g.fill();
    };
    g.fillStyle = 'rgba(74,72,52,0.72)';
    arm(0.46 + (R() - 0.5) * 0.05, 218);
    arm(-0.5 + (R() - 0.5) * 0.05, 212);
  }, { wrap: false });
  // 材质是这个实例自己的（要淡出），不能用缓存
  const xMat = unlit('#ffffff', { map: xTex, transparent: true, opacity: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const xMark = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6).rotateX(-Math.PI / 2), xMat);
  xMark.name = 'dig_x_mark'; xMark.position.y = 0.004; xMark.raycast = () => {}; xMark.renderOrder = 1;
  root.add(xMark);

  // 坑：深色坑底 + 一圈隆起的棕色土沿（俯视 / 斜看都能看见内壁）
  const pit = group('dig_pit', root);
  const floorMat = bc('dig:floor', () => unlit('#3a3030'));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.86, 40).rotateX(-Math.PI / 2), floorMat);
  floor.name = 'pit_floor'; floor.position.y = 0.003; floor.raycast = () => {}; pit.add(floor);
  const rim = lathe([[1.18, 0.0], [1.1, 0.02], [1.0, 0.028], [0.9, 0.02], [0.82, 0.002]], 44);
  mesh(pit, rim, tmat('#6c5844', { outline: 0.008 }), 'pit_rim');
  pit.scale.set(0.3, 1, 0.105);
  pit.children.forEach((c) => { c.castShadow = false; });

  // 土堆：尖尖的碎土堆（顶点色：亮面浅棕、暗面深棕）
  const mound = group('dig_mound', root, [0.55, 0, 0.0]);
  const prof = [[0.23, 0.0], [0.2, 0.03], [0.16, 0.06], [0.11, 0.1], [0.07, 0.14], [0.04, 0.19], [0.02, 0.235], [0.0, 0.25]];
  let mg = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18, 0, TAU);
  mg.deleteAttribute('uv'); mg.deleteAttribute('normal'); mg = mergeVertices(mg);
  const mp = mg.attributes.position, R2 = rng(77);
  for (let i = 0; i < mp.count; i++) {
    const x = mp.getX(i), y = mp.getY(i), z = mp.getZ(i);
    const k = 1 + 0.16 * Math.sin(Math.atan2(z, x) * 3 + y * 17) + (R2() - 0.5) * 0.05;
    mp.setXYZ(i, x * k + y * 0.1, y * (1 + 0.06 * Math.sin(x * 40)), z * k * 0.78);
  }
  mg.computeVertexNormals();
  const mcol = new Float32Array(mp.count * 3), mn = mg.attributes.normal, ca = new THREE.Color('#5d4b3b'), cb = new THREE.Color('#8b7456'), tmp = new THREE.Color(), nv = V3();
  for (let i = 0; i < mp.count; i++) {
    nv.fromBufferAttribute(mn, i);
    tmp.copy(ca).lerp(cb, clamp(smooth((nv.x * 0.6 + nv.y * 0.7 - 0.1) * 1.4 + 0.2) * 0.9 + mp.getY(i) * 1.2));
    mcol[i * 3] = tmp.r; mcol[i * 3 + 1] = tmp.g; mcol[i * 3 + 2] = tmp.b;
  }
  mg.setAttribute('color', new THREE.BufferAttribute(mcol, 3));
  mesh(mound, mg, bc('dig:mound', () => toon('#ffffff', { vertexColors: true, outline: 0.008 })), 'mound_body');
  const moundShadow = contactShadow(mound, 0.3, 0.2, { opacity: 0.3 });

  const box = new THREE.Object3D(); box.name = 'box_spot'; box.position.set(-0.52, 0, 0.02); box.userData.scale = 0.55; root.add(box);
  const hitBox = hit(root, 'dig_hit', [0.62, 0.04, 0.42], [0, 0.02, 0]);

  let dug = false; const run = runner();
  const pose = (k) => {
    const fade = clamp(1 - k * 2.2), grow = clamp((k - 0.15) / 0.85), eg = 1 - Math.pow(1 - grow, 3);
    xMat.opacity = fade; xMark.visible = fade > 0.004;
    pit.visible = grow > 0.002; pit.scale.set(0.3 * Math.max(0.01, eg), 1, 0.105 * Math.max(0.01, eg));
    const mg2 = clamp((k - 0.25) / 0.75), me = 1 - Math.pow(1 - mg2, 3);
    mound.visible = mg2 > 0.002; mound.scale.set(Math.max(0.02, me), Math.max(0.02, me * (1 + 0.12 * Math.sin(mg2 * Math.PI))), Math.max(0.02, me));
    moundShadow.visible = mound.visible;
  };
  root.dig = (o = {}) => { dug = true; hitBox.visible = false; const my = run.next(); return play(600, (k) => { if (run.live(my)) pose(k); }, o, (k) => k); };
  root.setState = (s = {}) => { run.next(); if (s.dug !== undefined) dug = !!s.dug; pose(dug ? 1 : 0); hitBox.visible = !dug; return Promise.resolve(); };
  root.getState = () => ({ dug });
  root.setState({ dug: false });
  return root;
}

// ---------------------------------------------------------------------------------------------
// 滑块盒（07:24 起始、08:36–08:40 解开、08:42 打开）：赭红色木盒，盒盖就是滑块棋盘。
// 26 格（第 0–2 行各 7 格，第 3 行只有第 1–5 列）：25 块方块填满除空格外的所有格子，其中 3 块是“圆片块”（浅灰方框里一个棕色圆片）；
// 空格露出深玫瑰色盒底。盒底在 3 个目标格（12、14、22）画着眼睛：空格移到那里时能看见眼睛；圆片块停在目标格上时圆片显示眼睛纹（同心圆 + 圆心点）。
// 盘面下方是前挡板，正中一个圆形门闩（圆圈里一道竖线；解开后转成横线）。俯视特写从 +y 往下看：第 0 行在远处（−z），第 3 行靠门闩（+z）。
// 原点在盒底中心；盒盖绕后边（−z 侧、盒口上沿）翻开，露出盒里的球茎。
// ---------------------------------------------------------------------------------------------

/** 格子下标 → [行, 列]（行优先：第 0 行 0–6，第 1 行 7–13，第 2 行 14–20，第 3 行 21–25 对应列 1–5）。 */
export const SLIDER_CELLS = (() => {
  const out = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) out.push([r, c]);
  for (let c = 1; c <= 5; c++) out.push([3, c]);
  return out;
})();
/** 起始盘面：3 块圆片块所在格（按块的顺序）和空格。 */
export const SLIDER_START = { discs: [2, 10, 20], empty: 25 };
/** 画着眼睛的 3 个目标格。 */
export const SLIDER_EYES = [12, 14, 22];
const CELL_INDEX = new Map(SLIDER_CELLS.map(([r, c], i) => [r * 10 + c, i]));
/** [行, 列] → 格子下标，没有这一格返回 −1。 */
export const sliderCellIndex = (r, c) => (CELL_INDEX.has(r * 10 + c) ? CELL_INDEX.get(r * 10 + c) : -1);

const SB = { W: 0.54, D: 0.46, H: 0.12, LID: 0.02, CELL: 0.069, TILE: 0.01, FLOOR: 0.015 };
const SB_X0 = -3.5 * SB.CELL, SB_Z0 = -SB.D / 2 + 0.028;           // 盘面左上角（盒中心坐标）
const sbCellX = (c) => SB_X0 + (c + 0.5) * SB.CELL;
const sbCellZ = (r) => SB_Z0 + (r + 0.5) * SB.CELL;
const SB_LATCH_Z = 0.156;

/** 盒盖顶面贴图：赭红底 + L 形盘面（深玫瑰色格底、黑格线、目标格上的眼睛）+ 前挡板的接缝线。2000 像素 / 米。 */
function sliderLidTexture() {
  return bc('tex:slider_lid', () => canvasTexture(1080, 920, (g, w, h) => {
    const PPM = 2000, X = (x) => (x + SB.W / 2) * PPM, Z = (z) => (z + SB.D / 2) * PPM, R = rng(17), C = SB.CELL * PPM;
    g.fillStyle = '#b57b63'; g.fillRect(0, 0, w, h);
    // 手绘木板的几道浅深横纹
    for (let i = 0; i < 26; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,225,205,0.05)' : 'rgba(80,36,24,0.05)';
      g.fillRect(0, R() * h, w, 2 + R() * 7);
    }
    // 盘面：每格深玫瑰色底
    g.fillStyle = '#80655a';
    for (const [r, c] of SLIDER_CELLS) g.fillRect(X(sbCellX(c)) - C / 2, Z(sbCellZ(r)) - C / 2, C, C);
    // 眼睛（目标格的盒底）
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const i of SLIDER_EYES) {
      const [r, c] = SLIDER_CELLS[i], cx = X(sbCellX(c)), cy = Z(sbCellZ(r));
      g.strokeStyle = '#2b1c18'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(cx - 40, cy); g.quadraticCurveTo(cx, cy - 46, cx + 40, cy); g.quadraticCurveTo(cx, cy + 46, cx - 40, cy); g.closePath(); g.stroke();
      g.fillStyle = '#573e35'; g.beginPath(); g.arc(cx, cy, 17, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#2b1c18'; g.beginPath(); g.arc(cx, cy, 6, 0, TAU); g.fill();
    }
    // 格线
    g.strokeStyle = INK; g.lineWidth = 7;
    for (const [r, c] of SLIDER_CELLS) g.strokeRect(X(sbCellX(c)) - C / 2, Z(sbCellZ(r)) - C / 2, C, C);
    // L 形外框
    const x0 = X(SB_X0), z0 = Z(SB_Z0);
    g.lineWidth = 13; g.beginPath();
    g.moveTo(x0, z0); g.lineTo(x0 + 7 * C, z0); g.lineTo(x0 + 7 * C, z0 + 3 * C); g.lineTo(x0 + 6 * C, z0 + 3 * C); g.lineTo(x0 + 6 * C, z0 + 4 * C);
    g.lineTo(x0 + C, z0 + 4 * C); g.lineTo(x0 + C, z0 + 3 * C); g.lineTo(x0, z0 + 3 * C); g.closePath(); g.stroke();
    // 前挡板：接缝线、一条往下压深的横带（门闩骑在上面）
    const seamZ = Z(0.109), bandZ = Z(SB_LATCH_Z);
    g.strokeStyle = INK; g.lineWidth = 8; g.beginPath(); g.moveTo(0, seamZ); g.lineTo(w, seamZ + 2); g.stroke();
    g.fillStyle = 'rgba(112,66,50,0.62)'; g.beginPath(); g.moveTo(0, bandZ + 4);
    for (let x = 0; x <= w; x += 60) g.lineTo(x, bandZ + 4 + Math.sin(x * 0.011) * 2 + (x > w * 0.5 ? 6 : 0) * (x / w));
    for (let x = w; x >= 0; x -= 60) g.lineTo(x, bandZ + 24 + Math.sin(x * 0.009) * 3);
    g.closePath(); g.fill();
    wobble(g, Array.from({ length: 19 }, (_, i) => [i * (w / 18), bandZ + Math.sin(i * 0.7) * 2.5]), 5.5, INK, R, 0.15);
  }, { wrap: false }));
}

/** 方块顶面 / 圆片块的框 / 圆片（普通与眼睛纹两种）的贴图材质（共享，运行时只换不改）。 */
function sliderMaterials() {
  return bc('slider:mats', () => {
    const R = rng(23);
    const speckle = (g, w, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${a * R()})`; g.fillRect(R() * w, R() * w, 2, 2); } };
    const tileTop = canvasTexture(128, 128, (g, w) => { g.fillStyle = '#847f57'; g.fillRect(0, 0, w, w); g.fillStyle = '#98966e'; g.fillRect(9, 9, w - 18, w - 18); speckle(g, w, 90, 0.07); }, { wrap: false });
    const frameTop = canvasTexture(128, 128, (g, w) => { g.fillStyle = '#868884'; g.fillRect(0, 0, w, w); g.fillStyle = '#a3a5a2'; g.fillRect(9, 9, w - 18, w - 18); speckle(g, w, 60, 0.05); }, { wrap: false });
    const disc = (eye) => canvasTexture(128, 128, (g, w) => {
      const c = w / 2; g.fillStyle = '#805f52'; g.fillRect(0, 0, w, w);
      g.fillStyle = '#8d6e61'; g.beginPath(); g.arc(c - 4, c - 4, c * 0.62, 0, TAU); g.fill();
      if (eye) {
        g.strokeStyle = '#2a1a16'; g.lineWidth = 9; g.beginPath(); g.arc(c, c, c * 0.56, 0, TAU); g.stroke();
        g.fillStyle = '#2a1a16'; g.beginPath(); g.arc(c, c, c * 0.17, 0, TAU); g.fill();
      }
    }, { wrap: false });
    const side = (color) => toon(color, { outline: 0.003 });
    return {
      tileMat: [side('#6f6b4a'), side('#6f6b4a'), toon('#ffffff', { map: tileTop, outline: 0.003 }), side('#6f6b4a'), side('#6f6b4a'), side('#6f6b4a')],
      frameMat: [side('#74766f'), side('#74766f'), toon('#ffffff', { map: frameTop, outline: 0.003 }), side('#74766f'), side('#74766f'), side('#74766f')],
      discPlain: [side('#5f473d'), toon('#ffffff', { map: disc(false), outline: 0.003 }), side('#5f473d')],
      discEye: [side('#5f473d'), toon('#ffffff', { map: disc(true), outline: 0.003 }), side('#5f473d')],
    };
  });
}

/** 暖光斑（解开时圆片和盘面闪一下）：加色混合的放射渐变，贴在盘面上方。 */
function glowTexture() {
  return bc('tex:glow', () => canvasTexture(128, 128, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,200,120,1)'); grd.addColorStop(0.45, 'rgba(255,160,70,0.55)'); grd.addColorStop(1, 'rgba(255,140,50,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  }, { wrap: false }));
}

function makeSliderBox() {
  const root = group('p3_slider_box');
  const { W, D, H, LID, CELL, TILE, FLOOR } = SB;
  const clay = tmat('#b57b63', { outline: 0.006 });
  const mats = sliderMaterials();

  // 盒身：带方孔的框（孔里是深色内衬）+ 底板
  const holeX = 0.24, holeZ0 = -0.205, holeZ1 = 0.19;
  const outer = new THREE.Shape(); outer.moveTo(-W / 2, -D / 2); outer.lineTo(W / 2, -D / 2); outer.lineTo(W / 2, D / 2); outer.lineTo(-W / 2, D / 2); outer.closePath();
  const hole = new THREE.Path(); hole.moveTo(-holeX, -holeZ1); hole.lineTo(-holeX, -holeZ0); hole.lineTo(holeX, -holeZ0); hole.lineTo(holeX, -holeZ1); hole.closePath();   // 形状的 y = −z
  outer.holes.push(hole);
  const ring = new THREE.ExtrudeGeometry(outer, { depth: H - FLOOR, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, FLOOR, 0);
  const floorSlab = new THREE.BoxGeometry(W, FLOOR, D).translate(0, FLOOR / 2, 0);
  const bodyGeo = mergeGeometries([ring, floorSlab].map((g) => { const c = g.index ? g.toNonIndexed() : g; c.deleteAttribute('uv'); return c; }));
  mesh(root, bodyGeo, clay, 'box_body');
  // 内衬：背面朝内的盒子，只有从盒口往里看才看得见
  const liner = bc('slider:liner', () => toon('#6b6160', { side: THREE.BackSide, outline: false }));
  mesh(root, new THREE.BoxGeometry(holeX * 2 - 0.002, H - FLOOR - 0.0015, holeZ1 - holeZ0 - 0.002), liner, 'box_inside', [0, FLOOR + 0.0015 + (H - FLOOR - 0.0015) / 2, (holeZ0 + holeZ1) / 2]).castShadow = false;

  // 盒盖：绕后边翻开（枢轴在盒口上沿的后边）；盒盖局部坐标 z′ 从 0（后边）到 D（前边）
  const lid = group('slider_lid', root, [0, H, -D / 2]);
  mesh(lid, new THREE.BoxGeometry(W, LID, D), clay, 'lid_slab', [0, LID / 2, D / 2]);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), texToon('slider_lid', sliderLidTexture, { outline: false }));
  top.name = 'lid_top'; top.position.set(0, LID + 0.0006, D / 2); top.receiveShadow = true; top.raycast = () => {}; lid.add(top);

  // 方块：22 块普通 + 3 块圆片块，位置全部在盒盖局部坐标里
  const tileY = LID + 0.001 + TILE / 2;
  const cellPos = (i) => { const [r, c] = SLIDER_CELLS[i]; return V3(sbCellX(c), tileY, sbCellZ(r) + D / 2); };
  const tileGeo = new THREE.BoxGeometry(CELL - 0.008, TILE, CELL - 0.008);
  const discGeo = new THREE.CylinderGeometry(0.0215, 0.0215, 0.005, 30);
  const tiles = [], discTiles = [], plainTiles = [];
  const glowMat = () => unlit('#ffffff', { map: glowTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let k = 0; k < 25; k++) {
    const isDisc = k < 3;
    const t = group(isDisc ? `slider_disc_${k}` : `slider_tile_${k - 3}`, lid);
    const m = new THREE.Mesh(tileGeo, isDisc ? mats.frameMat : mats.tileMat); m.name = 'tile_box'; m.castShadow = true; m.receiveShadow = true; m.raycast = () => {}; t.add(m);
    t.userData = { disc: isDisc, cell: -1, anim: 0, eye: false };
    if (isDisc) {
      const d = new THREE.Mesh(discGeo, mats.discPlain); d.name = 'disc'; d.position.y = TILE / 2 + 0.0025; d.castShadow = true; d.raycast = () => {};
      t.add(d); t.userData.disc3d = d;
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17).rotateX(-Math.PI / 2), glowMat());
      glow.name = 'disc_glow'; glow.position.y = TILE / 2 + 0.008; glow.visible = false; glow.raycast = () => {}; glow.renderOrder = 5; t.add(glow);
      t.userData.glow = glow;
      discTiles.push(t);
    } else plainTiles.push(t);
    tiles.push(t);
  }
  // 整个盘面的暖光
  const boardGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46).rotateX(-Math.PI / 2), glowMat());
  boardGlow.name = 'board_glow'; boardGlow.position.set(0, LID + TILE + 0.01, D / 2 - 0.05); boardGlow.visible = false; boardGlow.raycast = () => {}; boardGlow.renderOrder = 4; lid.add(boardGlow);

  // 门闩：浅赭色圆盘（描边成黑圈）+ 一道黑线（竖线 = 锁着，解开后转成横线）
  const latch = group('slider_latch', lid, [0, LID, D / 2 + SB_LATCH_Z]);
  mesh(latch, new THREE.CylinderGeometry(0.027, 0.027, 0.009, 28).scale(1, 1, 1.06), tmat('#b8826a', { outline: 0.006 }), 'latch_disc', [0, 0.0045, 0]);
  mesh(latch, new THREE.BoxGeometry(0.0042, 0.002, 0.047), bc('slider:ink', () => unlit(INK)), 'latch_bar', [0, 0.0098, 0]).castShadow = false;

  // 盒里的球茎（盒盖盖着时看不见）
  const BULB_S = 1.25;
  const bulb = ITEMS.p3_bulb();
  bulb.name = 'slider_bulb'; bulb.scale.setScalar(BULB_S); bulb.position.set(0.012, FLOOR + 0.053, 0.02); bulb.rotation.set(-Math.PI / 2, 0, 0.3);   // 躺平：图标面朝上，芽朝右
  root.add(bulb);

  // 点击盒：整只盒子、每个格子（贴在方块表面，跟着盒盖）、门闩、球茎
  hit(root, 'slider_box_hit', [W, 0.17, D], [0, 0.075, 0]);
  const cellHits = SLIDER_CELLS.map((_, i) => { const p = cellPos(i); return hit(lid, `slider_cell_${i}`, [CELL, 0.024, CELL], [p.x, LID + TILE, p.z]); });
  const latchHit = hit(lid, 'slider_latch_hit', [0.075, 0.03, 0.075], [0, LID + 0.01, D / 2 + SB_LATCH_Z]);
  const bulbHit = hit(root, 'slider_bulb_hit', [0.14, 0.1, 0.1], [0.012, FLOOR + 0.05, 0.02]);

  // ---- 状态 ----
  const st = { empty: SLIDER_START.empty, solved: false, open: false, bulbTaken: false };
  const occ = new Array(26).fill(null);
  const run = runner();
  const adjacent = (a, b) => { const [ra, ca] = SLIDER_CELLS[a], [rb, cb] = SLIDER_CELLS[b]; return Math.abs(ra - rb) + Math.abs(ca - cb) === 1; };
  const refreshEyes = () => {
    for (const t of discTiles) {
      const on = SLIDER_EYES.includes(t.userData.cell);
      t.userData.eye = on; t.userData.disc3d.material = on ? mats.discEye : mats.discPlain;
    }
  };
  const place = (t, cell) => { t.userData.cell = cell; occ[cell] = t; t.position.copy(cellPos(cell)); };
  const validBoard = (discs, empty) => Array.isArray(discs) && discs.length === 3 && Number.isInteger(empty) && empty >= 0 && empty < 26
    && new Set(discs).size === 3 && discs.every((d) => Number.isInteger(d) && d >= 0 && d < 26 && d !== empty);

  function setBoard({ discs, empty } = {}) {
    const cur = { discs: discTiles.map((t) => t.userData.cell), empty: st.empty };
    let d = discs ?? cur.discs, e = empty ?? cur.empty;
    if (!validBoard(d, e)) { d = SLIDER_START.discs.slice(); e = SLIDER_START.empty; }
    tiles.forEach((t) => { t.userData.anim++; if (t.userData.glow) t.userData.glow.visible = false; });
    occ.fill(null); st.empty = e;
    discTiles.forEach((t, k) => place(t, d[k]));
    let n = 0;
    for (let i = 0; i < 26; i++) if (!occ[i] && i !== e) place(plainTiles[n++], i);
    refreshEyes();
    return Promise.resolve();
  }
  root.setBoard = (b) => { run.next(); return setBoard(b); };

  /** 把 from 格的方块滑进空格 to（必须相邻）；返回 Promise<boolean>（false = 这一步不合法，什么都没动）。 */
  root.slide = (from, to, o = {}) => {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 25 || to < 0 || to > 25) return Promise.resolve(false);
    const t = occ[from];
    if (!t || to !== st.empty || !adjacent(from, to)) return Promise.resolve(false);
    occ[to] = t; occ[from] = null; st.empty = from; t.userData.cell = to;
    const a = cellPos(from), b = cellPos(to), id = ++t.userData.anim;
    return play(180, (k) => { if (t.userData.anim !== id) return; t.position.lerpVectors(a, b, k); if (k >= 1) refreshEyes(); }, o, (k) => k * k * (3 - 2 * k)).then(() => true);
  };

  const poseLatch = (k) => { latch.rotation.y = (Math.PI / 2) * k; };
  const poseGlow = (g) => {
    for (const t of discTiles) { const m = t.userData.glow; m.visible = g > 0.003; m.material.opacity = g * 0.95; m.scale.setScalar(0.8 + g * 0.5); }
    boardGlow.visible = g > 0.003; boardGlow.material.opacity = g * 0.5;
  };
  root.solve = (o = {}) => {
    st.solved = true; const my = run.next();
    return play(1300, (k) => { if (!run.live(my)) return; poseLatch(smooth(seg(k, 0.3, 0.85))); poseGlow(k >= 1 ? 0 : Math.sin(Math.PI * Math.min(1, k / 0.85)) ** 1.4); }, o, (k) => k);
  };
  const poseLid = (k) => { lid.rotation.x = -1.95 * k; };
  const syncHits = () => {
    cellHits.forEach((h) => { h.visible = !st.open; });
    latchHit.visible = !st.open; bulbHit.visible = st.open && !st.bulbTaken;
  };
  root.open = (o = {}) => {
    st.open = true; const my = run.next(); syncHits(); poseGlow(0);
    return play(850, (k) => { if (run.live(my)) poseLid(k); }, o, (k) => 1 - Math.pow(1 - k, 3));
  };
  const bulbHome = bulb.position.clone();
  root.takeBulb = (o = {}) => {
    st.bulbTaken = true; const my = run.next(); bulbHit.visible = false;
    return play(380, (k) => { if (!run.live(my)) return; bulb.visible = k < 1; bulb.position.y = bulbHome.y + 0.06 * k; bulb.scale.setScalar(BULB_S * (1 - 0.35 * k)); if (k >= 1) { bulb.position.copy(bulbHome); bulb.scale.setScalar(BULB_S); } }, o);
  };
  root.setState = (s = {}) => {
    run.next();
    if (s.discs !== undefined || s.empty !== undefined) setBoard({ discs: s.discs, empty: s.empty });
    if (s.solved !== undefined) st.solved = !!s.solved;
    if (s.open !== undefined) st.open = !!s.open;
    if (s.bulbTaken !== undefined) st.bulbTaken = !!s.bulbTaken;
    poseLatch(st.solved ? 1 : 0); poseGlow(0); poseLid(st.open ? 1 : 0);
    bulb.visible = !st.bulbTaken; bulb.position.copy(bulbHome); bulb.scale.setScalar(BULB_S);
    syncHits();
    return Promise.resolve();
  };
  root.getState = () => ({ discs: discTiles.map((t) => t.userData.cell), empty: st.empty, solved: st.solved, open: st.open, bulbTaken: st.bulbTaken });
  /** 第 i 格方块表面中心的世界坐标（盒盖翻开前有效）。 */
  root.cellWorld = (i) => { root.updateWorldMatrix(true, true); const p = cellPos(i); p.y += TILE / 2; return lid.localToWorld(p); };
  root.userData.cell = CELL;

  root.setState({ discs: SLIDER_START.discs, empty: SLIDER_START.empty, solved: false, open: false, bulbTaken: false });
  return root;
}

// ---------------------------------------------------------------------------------------------
// 木桩（01:48、01:50、12:06）：立着的短原木（0.36 直径 × 0.55 高），橙棕色树皮 + 粗黑竖向裂纹（正中一对裂纹鼓成“眼”形），右侧一个断枝；
// 顶面年轮；斧子斜插在顶上（刃口朝右下），蜗牛趴在左侧上部。takeAxe / takeSnail 拿走；hit() 被斧子砍一下（晃动 + 木屑）；
// setCrack(1..3)：裂纹逐级加深，第 3 级裂开，露出刻在里面的符号（“第三个符号”，图形待核对：默认画 ⊗，可用 setSymbolTexture 换）。
// ---------------------------------------------------------------------------------------------

const ST = { R: 0.18, H: 0.55 };
/** 树皮上的 14 条竖裂纹：u 是绕树干的位置（0.5 = 正面 +z），a / f / p 是摆动，w 是贴图里的线宽（像素）。第 6、7 条是正中那对“眼形”。 */
const STUMP_LINES = (() => {
  const R = rng(41), out = [];
  for (let k = 0; k < 14; k++) out.push({ u: (k + 0.5) / 14 + (R() - 0.5) * 0.016, a: 0.003 + R() * 0.006, f: 5 + R() * 5, p: R() * 6.3, w: 3.4 + R() * 3 });
  out[6].eye = -1; out[7].eye = 1;
  return out;
})();
/** 第 k 条裂纹在高度比例 v（0 底 … 1 顶）处的 u。 */
const stumpLineU = (L, v) => L.u + (L.eye ? L.eye * 0.036 * Math.sin(Math.PI * (0.1 + v * 0.8)) * 0.9 : L.a * Math.sin(v * L.f + L.p));
/** 树干在角度 θ（0 = +z 正面）、高度 y 处的半径（含裂纹处的凹槽）。 */
function stumpRadius(theta, y) {
  const v = clamp(y / ST.H), u = ((theta + Math.PI) / TAU) % 1;
  let r = ST.R * (1.035 - 0.07 * v) * (1 + 0.022 * Math.sin(3 * theta + 1.3) + 0.016 * Math.sin(5 * theta + 0.4 + y * 4));
  for (const L of STUMP_LINES) { const d = (u - stumpLineU(L, v) + 1.5) % 1 - 0.5; r -= 0.0105 * Math.exp(-((d / 0.011) ** 2)); }
  return r;
}
const stumpTopY = (theta) => ST.H + 0.007 * Math.sin(4 * theta + 0.7) + 0.004 * Math.sin(9 * theta);

function stumpBarkTexture() {
  return bc('tex:stump_bark', () => canvasTexture(512, 512, (g, w, h) => {
    const R = rng(5);
    g.fillStyle = '#b9742f'; g.fillRect(0, 0, w, h);
    const X = (L, v) => stumpLineU(L, v) * w, Y = (v) => (1 - v) * h;
    // 条带：相邻两条裂纹之间交替上色
    const cols = ['#bd7a34', '#9d6430', '#cc8b41', '#ab6c2f'];
    const lines = [...STUMP_LINES].sort((a, b) => a.u - b.u);
    for (let i = 0; i <= lines.length; i++) {
      const A = lines[i - 1], B = lines[i];
      g.fillStyle = cols[i % cols.length];
      g.beginPath();
      for (let s = 0; s <= 20; s++) { const v = s / 20; g.lineTo(A ? X(A, v) : -10, Y(v)); }
      for (let s = 20; s >= 0; s--) { const v = s / 20; g.lineTo(B ? X(B, v) : w + 10, Y(v)); }
      g.closePath(); g.fill();
    }
    // 条带里的浅色细纹
    g.lineCap = 'round';
    for (let i = 0; i < 60; i++) {
      const x = R() * w, y0 = R() * h, len = 40 + R() * 120;
      g.strokeStyle = R() > 0.5 ? 'rgba(255,214,150,0.16)' : 'rgba(60,30,10,0.16)'; g.lineWidth = 1 + R() * 2.5;
      g.beginPath(); g.moveTo(x, y0); g.quadraticCurveTo(x + (R() - 0.5) * 10, y0 + len / 2, x + (R() - 0.5) * 6, y0 + len); g.stroke();
    }
    // 黑色粗裂纹
    g.lineJoin = 'round';
    for (const L of STUMP_LINES) {            // 每条裂纹左侧一道深褐色的阴影带
      g.strokeStyle = 'rgba(58,30,10,0.32)'; g.lineWidth = L.w * 3.4;
      g.beginPath();
      for (let s = 0; s <= 40; s++) { const v = s / 40, x = X(L, v) - L.w * 1.2, y = Y(v); if (s) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
    g.strokeStyle = INK;
    for (const L of STUMP_LINES) {
      g.lineWidth = L.w;
      g.beginPath();
      for (let s = 0; s <= 40; s++) { const v = s / 40, x = X(L, v), y = Y(v); if (s) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
  }));
}

function stumpTopTexture() {
  return bc('tex:stump_top', () => canvasTexture(256, 256, (g, w) => {
    const R = rng(9), c = w / 2;
    g.fillStyle = '#d9b274'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = i % 2 ? '#b07e42' : '#c39455'; g.lineWidth = 3 + R() * 2;
      g.beginPath();
      for (let s = 0; s <= 40; s++) { const a = (s / 40) * TAU, r = (i + 1) * 13 + Math.sin(a * 3 + i) * 3 + R() * 1.5; const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r; if (s) g.lineTo(x, y); else g.moveTo(x, y); }
      g.closePath(); g.stroke();
    }
    g.fillStyle = '#8f6030'; g.beginPath(); g.arc(c + 3, c - 2, 7, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(60,34,12,0.5)'; g.lineWidth = 2;
    for (let i = 0; i < 4; i++) { const a = R() * TAU; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * 110, c + Math.sin(a) * 110); g.stroke(); }
  }, { wrap: false }));
}

function stumpTrunkGeometry() {
  const nr = 72, nh = 18, pos = [], uv = [], idx = [];
  for (let j = 0; j <= nh; j++) {
    for (let i = 0; i <= nr; i++) {
      const th = (i / nr) * TAU - Math.PI, top = stumpTopY(th);
      const y = j === nh ? top : (j / nh) * ST.H, r = stumpRadius(th, Math.min(y, ST.H));
      pos.push(Math.sin(th) * r, y, Math.cos(th) * r); uv.push(i / nr, y / ST.H);
    }
  }
  for (let j = 0; j < nh; j++) for (let i = 0; i < nr; i++) { const a = j * (nr + 1) + i, b = a + 1, c = a + nr + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function stumpTopGeometry() {
  const nr = 72, pos = [0, ST.H + 0.004, 0], uv = [0.5, 0.5], idx = [];
  for (let i = 0; i <= nr; i++) {
    const th = (i / nr) * TAU - Math.PI, y = stumpTopY(th), r = stumpRadius(th, ST.H) * 0.985;
    pos.push(Math.sin(th) * r, y + 0.0005, Math.cos(th) * r); uv.push(0.5 + Math.sin(th) * 0.5, 0.5 - Math.cos(th) * 0.5);
  }
  for (let i = 0; i < nr; i++) idx.push(0, i + 1, i + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** 贴在树干正面的一块曲面贴片（沿树干半径贴合，包括裂纹凹槽）；几何体的原点在贴片顶边（便于从上往下“长”出来）。 */
function stumpPatch(arc, y0, y1, tex, { lift = 0.0028, name = 'patch', fadeIn = false } = {}) {
  const nu = 18, nv = 24, pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, y = lerp(y0, y1, v);
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, th = (u - 0.5) * (arc / ST.R), r = stumpRadius(th, y) + lift;
      pos.push(Math.sin(th) * r, y - y1, Math.cos(th) * r); uv.push(u, v);
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, unlit('#ffffff', { map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide }));
  m.name = name; m.position.y = y1; m.raycast = () => {}; m.renderOrder = 2;
  return m;
}

/** 三级裂纹贴片的尺寸（弧宽、长度，米）；贴片顶边都在树干顶下 0.014。贴图按 0.7 毫米 / 像素画。 */
const STUMP_CRACK = [null, { arc: 0.09, len: 0.236 }, { arc: 0.12, len: 0.416 }, { arc: 0.16, len: 0.456 }];
const CRACK_PPM = 1 / 0.0007;

/** 三级裂纹贴图（透明底）：1 = 顶上一条细缝，2 = 又长又宽、带分叉，3 = 整条裂开（黑边 + 里面露出新鲜的浅色木头）。 */
function stumpCrackTexture(level) {
  const { arc, len } = STUMP_CRACK[level];
  return bc(`tex:stump_crack:${level}`, () => canvasTexture(Math.round(arc * CRACK_PPM), Math.round(len * CRACK_PPM), (g, w, h) => {
    const R = rng(70 + level), cx = w / 2, mm = CRACK_PPM / 1000;
    g.clearRect(0, 0, w, h); g.lineCap = 'round'; g.lineJoin = 'round';
    const zig = (x0, y0, y1, amp, n) => Array.from({ length: n + 1 }, (_, i) => [x0 + (i % 2 ? amp : -amp) * (0.4 + R() * 0.6) * (1 - i / (n + 3)), y0 + ((y1 - y0) * i) / n]);
    // 一道裂缝：黑边 + 里面露出的新鲜浅色木头
    const crack = (pts, wMm) => { wobble(g, pts, wMm * mm, INK, R, 0.1); wobble(g, pts, wMm * 0.42 * mm, '#e6bd7f', R, 0.1); };
    if (level === 1) {
      crack(zig(cx + 3 * mm, 0, h * 0.86, 6 * mm, 11), 11);
    } else if (level === 2) {
      crack(zig(cx + 2 * mm, 0, h * 0.9, 9 * mm, 17), 17);
      crack([[cx + 3 * mm, h * 0.3], [cx + 22 * mm, h * 0.34], [cx + 34 * mm, h * 0.42]], 10);
      crack([[cx, h * 0.52], [cx - 18 * mm, h * 0.57], [cx - 28 * mm, h * 0.66]], 10);
    } else {
      // 裂开的楔形：上宽下尖，边缘锯齿
      const L = [], Rr = [], n = 22;
      for (let i = 0; i <= n; i++) {
        const t = i / n, y = t * h * 0.97, half = (w * 0.36) * Math.pow(Math.sin(Math.PI * (0.2 + t * 0.8) * 0.9), 0.7) * (1 - t * 0.5) + 4;
        const j = i % 2 ? 5 : -4;
        L.push([cx - half + j * R(), y]); Rr.push([cx + half - j * R(), y]);
      }
      g.beginPath(); L.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); [...Rr].reverse().forEach(([x, y]) => g.lineTo(x, y)); g.closePath();
      const grd = g.createLinearGradient(cx - w * 0.36, 0, cx + w * 0.36, 0);
      grd.addColorStop(0, '#80542c'); grd.addColorStop(0.3, '#d8a766'); grd.addColorStop(1, '#ebc384');
      g.fillStyle = grd; g.fill();
      g.strokeStyle = INK; g.lineWidth = 9 * mm; g.stroke();
      g.strokeStyle = 'rgba(120,80,40,0.45)'; g.lineWidth = 2.5 * mm;
      for (let k = 0; k < 8; k++) { const y = (0.08 + k * 0.11) * h; g.beginPath(); g.moveTo(cx - 14 * mm, y); g.quadraticCurveTo(cx, y + 6 * mm, cx + 16 * mm, y - 2 * mm); g.stroke(); }
    }
  }, { wrap: false }));
}

/** 刻在木头里的“第三个符号”（占位图形 ⊗，红漆；真图形核对后用 setSymbolTexture 替换）。 */
function stumpSymbolTexture() {
  return bc('tex:stump_symbol', () => canvasTexture(128, 128, (g, w) => {
    const R = rng(88), c = w / 2, rad = w * 0.3;
    g.clearRect(0, 0, w, w);
    wobble(g, Array.from({ length: 33 }, (_, i) => { const a = (i / 32) * TAU + 0.3; return [c + Math.cos(a) * rad, c + Math.sin(a) * rad]; }), 8, '#a8201a', R, 0.2);
    wobble(g, [[c - rad * 0.72, c - rad * 0.72], [c + rad * 0.72, c + rad * 0.72]], 8, '#a8201a', R, 0.2);
    wobble(g, [[c + rad * 0.72, c - rad * 0.72], [c - rad * 0.72, c + rad * 0.72]], 8, '#a8201a', R, 0.2);
  }, { wrap: false }));
}

function makeStump(opts = {}) {
  const root = group('p3_stump');
  const { R, H } = ST;
  const bark = texToon('stump_bark', stumpBarkTexture, { outline: 0.011 });
  mesh(root, stumpTrunkGeometry(), bark, 'stump_trunk');
  mesh(root, stumpTopGeometry(), texToon('stump_top', stumpTopTexture, { outline: false }), 'stump_top');
  contactShadow(root, 0.34, 0.3, { opacity: 0.34 });
  // 断枝（右侧，朝右上；切口朝外）
  const stub = new THREE.CylinderGeometry(0.019, 0.027, 0.1, 10);
  const stubMesh = mesh(root, stub, [bc('stump:stub', () => toon('#9a5c2b', { outline: 0.006 })), bc('stump:cut', () => toon('#d3a362', { outline: 0.006 })), bc('stump:stub', () => toon('#9a5c2b', { outline: 0.006 }))], 'stump_branch');
  stubMesh.position.set(R * 0.97 + 0.03, 0.36, 0.01); stubMesh.rotation.z = -0.95;

  // 斧子：刃口朝右下插进顶面，柄朝右上
  const axeSlot = group('stump_axe', root, [-0.03, H + 0.236, 0.0]);
  const axePivot = group('axe_pivot', axeSlot); axePivot.rotation.z = 0.95; axePivot.scale.setScalar(1.15);
  const axe = ITEMS.p3_axe(); axe.rotation.y = Math.PI; axePivot.add(axe);
  for (const n of ['axe_handle', 'axe_butt']) { const h = axe.getObjectByName(n); if (h) h.scale.y *= 1.8; }   // 柄加粗（侧面看和原作一样粗壮；只改这个实例）
  const axeHit = hit(axePivot, 'stump_axe_hit', [0.56, 0.17, 0.09], [0.03, -0.02, 0]);

  // 蜗牛：趴在左侧上部，身体竖直（头朝上），壳向左鼓出
  const snailSlot = group('stump_snail', root, [-R * 0.985, 0.3, 0.03]);
  const snailScale = 2.3;
  const snailPivot = group('snail_pivot', snailSlot); snailPivot.rotation.z = Math.PI / 2; snailPivot.scale.setScalar(snailScale);
  const snail = ITEMS.p3_snail(); snailPivot.add(snail);
  const snailHit = hit(snailPivot, 'stump_snail_hit', [0.11, 0.075, 0.05], [0.015, 0.03, 0]);

  // 裂纹贴片（三级）+ 里面的符号
  const patches = [
    ...[1, 2, 3].map((n) => stumpPatch(STUMP_CRACK[n].arc, H - 0.014 - STUMP_CRACK[n].len, H - 0.014, stumpCrackTexture(n), { name: `stump_crack_${n}` })),
  ];
  patches.forEach((p) => root.add(p));
  const symbol = stumpPatch(0.07, H - 0.22, H - 0.15, opts.symbolTexture || stumpSymbolTexture(), { name: 'stump_symbol', lift: 0.0045 });
  const symbolMat = symbol.material; root.add(symbol);
  const symbolHit = hit(root, 'stump_symbol_hit', [0.09, 0.1, 0.06], [0, H - 0.185, R + 0.02]);
  hit(root, 'stump_hit', [0.4, 0.58, 0.4], [0, 0.29, 0]);

  // 木屑
  const chipMat = bc('stump:chip', () => toon('#e6b673', { outline: 0.004 }));
  const chipGeo = new THREE.BoxGeometry(0.035, 0.01, 0.02);
  const chips = Array.from({ length: 8 }, (_, i) => { const c = mesh(root, chipGeo, chipMat, `chip_${i}`); c.visible = false; c.castShadow = false; return c; });
  const chipV = chips.map((_, i) => ({ v: V3(Math.cos(i * 1.7) * 0.5, 0.9 + (i % 3) * 0.25, 0.9 + Math.sin(i * 2.3) * 0.4), spin: V3(i * 0.7, i * 1.3, i * 0.5) }));

  const st = { axe: true, snail: true, crack: 0 };
  const runShake = runner(), runCrack = runner(), runAxe = runner(), runSnail = runner();

  const showCrack = (n, grow = 1) => {
    patches.forEach((p, i) => { p.visible = n === i + 1; if (p.visible) p.scale.y = Math.max(0.04, grow); });
    symbol.visible = n >= 3 && grow >= 0.999; symbolHit.visible = symbol.visible;
  };
  root.setCrack = (n = 0, o = {}) => {
    n = Math.max(0, Math.min(3, Math.round(Number(n) || 0)));
    const prev = st.crack; st.crack = n; const my = runCrack.next();
    if (n === 0 || n === prev) { showCrack(n, 1); return Promise.resolve(); }
    return play(n === 3 ? 700 : 420, (k) => { if (runCrack.live(my)) showCrack(n, lerp(0.3, 1, smooth(k))); }, o);
  };
  /** 被斧子砍一下：整根木桩晃动，木屑从砍口飞出。 */
  root.hit = (o = {}) => {
    const my = runShake.next();
    return play(650, (k) => {
      if (!runShake.live(my)) return;
      root.rotation.z = k >= 1 ? 0 : 0.028 * Math.sin(k * Math.PI * 7) * (1 - k);
      chips.forEach((c, i) => {
        c.visible = k > 0 && k < 1;
        if (!c.visible) return;
        const t = k * 0.65, v = chipV[i].v;
        c.position.set((i - 3.5) * 0.012 + v.x * t * 0.8, H - 0.22 + v.y * t * 0.9 - 2.2 * t * t, R + 0.01 + v.z * t * 0.5);
        c.rotation.set(chipV[i].spin.x * t * 3, chipV[i].spin.y * t * 3, chipV[i].spin.z * t * 3);
        c.scale.setScalar(1 - Math.max(0, k - 0.7) / 0.3);
      });
    }, o, (k) => k);
  };

  const axeHome = axeSlot.position.clone();
  root.takeAxe = (o = {}) => {
    st.axe = false; const my = runAxe.next(); axeHit.visible = false;
    return play(380, (k) => {
      if (!runAxe.live(my)) return;
      axeSlot.position.set(axeHome.x + 0.1 * k, axeHome.y + 0.17 * k, axeHome.z);
      axeSlot.visible = k < 1;
      if (k >= 1) axeSlot.position.copy(axeHome);
    }, o);
  };
  const snailHome = snailSlot.position.clone();
  root.takeSnail = (o = {}) => {
    st.snail = false; const my = runSnail.next(); snailHit.visible = false;
    return play(380, (k) => {
      if (!runSnail.live(my)) return;
      snailSlot.position.set(snailHome.x - 0.05 * k, snailHome.y + 0.03 * k, snailHome.z + 0.05 * k);
      snailSlot.visible = k < 1;
      if (k >= 1) snailSlot.position.copy(snailHome);
    }, o);
  };
  /** 换掉“第三个符号”的贴图（透明底、宽高比 1:1）。 */
  root.setSymbolTexture = (tex) => { symbolMat.map = tex; symbolMat.needsUpdate = true; };

  root.setState = (s = {}) => {
    runShake.next(); runCrack.next(); runAxe.next(); runSnail.next();
    if (s.axe !== undefined) st.axe = !!s.axe;
    if (s.snail !== undefined) st.snail = !!s.snail;
    if (s.crack !== undefined) st.crack = Math.max(0, Math.min(3, Math.round(Number(s.crack) || 0)));
    axeSlot.position.copy(axeHome); axeSlot.visible = st.axe; axeHit.visible = st.axe;
    snailSlot.position.copy(snailHome); snailSlot.visible = st.snail; snailHit.visible = st.snail;
    root.rotation.z = 0; chips.forEach((c) => { c.visible = false; });
    showCrack(st.crack, 1);
    return Promise.resolve();
  };
  root.getState = () => ({ axe: st.axe, snail: st.snail, crack: st.crack });
  root.setState({ axe: true, snail: true, crack: 0 });
  return root;
}

// ---------------------------------------------------------------------------------------------
// 神殿窗台（02:12 左窗台上的小白盘；可选成就“Harvey”）
// 小白盘：浅碟（白瓷、厚圆沿、粗黑描边），约 0.18 直径 × 0.04 高；setFlowers(kind | null) 把花（任一种花物品）放进盘里。
// 灰鹦鹉 Harvey：灰身、红尾、黑喙，蹲在盘边（原点在脚底，面朝 +z，约 0.26 高）；idle 时轻微歪头、眨眼；setVisible(on)。
// ---------------------------------------------------------------------------------------------

const FLOWER_IDS = { yellow: 'p3_flower_yellow', orange: 'p3_flower_orange', rose: 'p3_rose' };

function makeSillPlate() {
  const root = group('p3_sill_plate');
  // 外壁自下而上、过圆沿、再沿内壁往下（法线朝外 / 朝上 / 朝里）
  const prof = [[0.0, 0.0], [0.04, 0.0], [0.052, 0.006], [0.074, 0.022], [0.088, 0.034], [0.093, 0.04], [0.09, 0.044], [0.083, 0.041], [0.07, 0.03], [0.045, 0.016], [0.0, 0.012]];
  mesh(root, lathe(prof, 48), tmat('#f0eee6', { outline: 0.01 }), 'plate_body');
  contactShadow(root, 0.11, 0.1, { opacity: 0.25 });
  const spot = new THREE.Object3D(); spot.name = 'parrot_spot'; spot.position.set(0.17, 0, 0.02); root.add(spot);   // 鹦鹉蹲在盘边
  hit(root, 'plate_hit', [0.2, 0.06, 0.2], [0, 0.03, 0]);

  const flowers = {}; let cur = null;
  const flowerOf = (kind) => {
    if (!flowers[kind]) {
      const f = ITEMS[FLOWER_IDS[kind]]();
      f.scale.setScalar(0.42); f.position.set(-0.06, 0.014, 0.01); f.rotation.set(0.1, 0.3, -1.25);   // 躺在盘里，花冠朝右
      f.visible = false; root.add(f); flowers[kind] = f;
    }
    return flowers[kind];
  };
  const show = (kind) => {
    for (const k of Object.keys(flowers)) flowers[k].visible = false;
    cur = FLOWER_IDS[kind] ? kind : null;
    if (cur) flowerOf(cur).visible = true;
  };
  root.setFlowers = (kind = null, o = {}) => {
    show(typeof kind === 'string' ? kind.replace(/^p3_(flower_)?/, '') : null);
    return Promise.resolve();
  };
  root.setState = (s = {}) => { if (s.flowers !== undefined) show(typeof s.flowers === 'string' ? s.flowers.replace(/^p3_(flower_)?/, '') : null); return Promise.resolve(); };
  root.getState = () => ({ flowers: cur });
  root.setState({ flowers: null });
  return root;
}

function makeParrot() {
  const root = group('p3_parrot');
  const grey = tmat('#8f9294', { outline: 0.005 }), wingM = tmat('#74777a', { outline: 0.004 }), belly = tmat('#a6a8a9', { outline: 0.004 });
  const red = tmat('#c0261d', { outline: 0.004 }), beakM = tmat('#1c1a19', { outline: 0.003 }), face = tmat('#c9cacb', { outline: 0.003 });
  const legM = tmat('#8d7f7a', { outline: 0.003 });
  const ell = (rx, ry, rz) => new THREE.SphereGeometry(1, 20, 14).scale(rx, ry, rz);

  // 脚：两条细腿 + 三个趾头（抓在窗台上）
  for (const s of [-1, 1]) {
    mesh(root, new THREE.CylinderGeometry(0.0055, 0.0065, 0.04, 8), legM, 'parrot_leg', [s * 0.021, 0.026, 0.0]);
    const toes = [];
    for (const a of [-0.35, 0, 0.35]) toes.push(rod([s * 0.021, 0.006, 0.0], [s * 0.021 + Math.sin(a) * 0.018, 0.004, 0.026 * Math.cos(a)], 0.0048, 6, 0.0035));
    toes.push(rod([s * 0.021, 0.006, 0.0], [s * 0.021, 0.004, -0.016], 0.0045, 6, 0.0033));
    merge(root, toes, legM, 'parrot_toes');
  }

  // 躯干：微微前倾的蛋形
  const torso = group('parrot_torso', root, [0, 0.105, -0.004]); torso.rotation.x = 0.2;
  mesh(torso, ell(0.05, 0.085, 0.046), grey, 'parrot_body');
  mesh(torso, ell(0.036, 0.062, 0.02), belly, 'parrot_belly', [0, -0.008, 0.03]);
  for (const s of [-1, 1]) {
    const w = mesh(torso, ell(0.012, 0.07, 0.036), wingM, 'parrot_wing', [s * 0.043, -0.012, -0.012]); w.rotation.set(-0.12, 0, s * 0.1);
  }
  // 红色尾羽：三片，往下往后
  const tail = group('parrot_tail', torso, [0, -0.06, -0.032]); tail.rotation.x = 0.6;   // 往后往下；尾尖会插进窗台面以下一点（窗台面会把它挡住）
  for (const [a, len] of [[-0.14, 0.092], [0, 0.104], [0.14, 0.092]]) {
    const f = mesh(tail, ell(0.017, len / 2, 0.004), red, 'parrot_tail_feather', [Math.sin(a) * len * 0.5, -len * 0.45, 0]); f.rotation.z = a * 0.9;
  }

  // 头：绕颈部转（歪头）
  const head = group('parrot_head', torso, [0, 0.074, 0.01]);
  mesh(head, new THREE.SphereGeometry(0.034, 20, 16), grey, 'parrot_skull', [0, 0.02, 0.004]);
  mesh(head, ell(0.027, 0.022, 0.014), face, 'parrot_face', [0, 0.017, 0.026]);
  const eyes = [];
  for (const s of [-1, 1]) {
    const ring = mesh(head, new THREE.SphereGeometry(0.0072, 10, 8), bc('parrot:eye', () => unlit('#e8c24a')), 'parrot_eye_ring', [s * 0.0205, 0.028, 0.026]);
    mesh(ring, new THREE.SphereGeometry(0.0036, 8, 6), bc('parrot:pupil', () => unlit('#111111')), 'parrot_pupil', [s * 0.0014, 0.0004, 0.0042]);
    eyes.push(ring);
  }
  const beak = group('parrot_beak', head, [0, 0.016, 0.036]);
  const upper = mesh(beak, new THREE.CylinderGeometry(0.0025, 0.0115, 0.028, 12), beakM, 'parrot_beak_upper', [0, -0.002, 0.009]); upper.rotation.x = Math.PI / 2 + 0.6;
  mesh(beak, new THREE.SphereGeometry(0.0058, 10, 8), beakM, 'parrot_beak_hook', [0, -0.016, 0.0205]);
  mesh(beak, ell(0.0075, 0.005, 0.011), beakM, 'parrot_beak_lower', [0, -0.012, 0.004]);

  hit(root, 'parrot_hit', [0.12, 0.27, 0.14], [0, 0.135, 0]);
  contactShadow(root, 0.06, 0.07, { opacity: 0.25 });

  const st = { visible: true }; let idle = true, tiltT = -1, time = 0;
  root.idle = (on = true) => { idle = !!on; if (!idle) { head.rotation.set(0, 0, 0); } return Promise.resolve(); };
  /** 点一下：歪头看过来（约 0.9 秒后回正）。 */
  root.tilt = (o = {}) => play(900, (k) => { tiltT = k >= 1 ? -1 : k; }, o, (k) => k);
  root.setVisible = (on = true) => { st.visible = !!on; root.visible = st.visible; return Promise.resolve(); };
  root.update = (dt, t) => {
    time = t;
    let rz = 0, ry = 0, rx = 0;
    if (idle) {
      rz = Math.sin(t * 0.8) * 0.14 + Math.sin(t * 2.3) * 0.03;
      ry = Math.sin(t * 0.37) * 0.32;
      rx = Math.sin(t * 1.1) * 0.03;
      const blink = ((t * 0.27) % 1) > 0.955 ? 0.12 : 1;
      eyes.forEach((e) => { e.scale.y = blink; });
      torso.position.y = 0.105 + Math.sin(t * 1.7) * 0.0012;
    }
    if (tiltT >= 0) { const k = Math.sin(Math.PI * tiltT); rz += 0.5 * k; ry += 0.3 * k; }
    head.rotation.set(rx, ry, rz);
  };
  root.setState = (s = {}) => { if (s.visible !== undefined) root.setVisible(s.visible); return Promise.resolve(); };
  root.getState = () => ({ visible: st.visible });
  root.update(0, 0);
  return root;
}

export const FACTORIES = {
  p3_symbol_rock: (o) => makeSymbolRock(o || {}),
  p3_mussel_shell: () => makeMusselShell(),
  p3_dig_x: () => makeDigX(),
  p3_slider_box: () => makeSliderBox(),
  p3_stump: (o) => makeStump(o || {}),
  p3_sill_plate: () => makeSillPlate(),
  p3_parrot: () => makeParrot(),
};
