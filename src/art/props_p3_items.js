// 第三灾物品模型：苍蝇拍、蚊子、蜗牛、斧子、铲子、剪刀、蜂蜜、耳朵、贻贝、浆果、桦树汁、球茎、黏土、三种花、三种花瓶。
// 约定：物品原点在中心、长轴沿 +x、“图标面”朝 +z；花和花瓶是立着的（原点在底部中心、沿 +y），方便插进花瓶 / 摆上神龛。
// 场景里摆的同一件东西也用这里的工厂（物品栏图标 = 场景外观）。外观对照参考视频 dev/ref/P03_*.mp4 的时间点写在每个函数前。
import {
  THREE, TAU, tmat, umat, group, mesh, lathe, rod, merge, cached, lumpGeo, canvasTexture, rng, mosquitoGeometry,
  POT, potProfile, potOpen, mergeGeometries, INK,
} from './props_p3_shared.js';

// ---------------------------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------------------------

/** 平面形状挤出成薄片（带一点倒角），居中在 z = 0。 */
function slab(shape, depth = 0.004, bevel = 0.0012, curve = 12) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: curve });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}
/** 叶片形（尖头、圆肚），长 len 沿 +x，宽 w。 */
function leafShape(len, w, { tip = 1, base = 0.35 } = {}) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(len * base, w * 0.62, len * 0.7, w * 0.55, len, 0);
  s.bezierCurveTo(len * 0.7, -w * 0.55 * tip, len * base, -w * 0.62, 0, 0);
  return s;
}
/** 立体叶片：薄片 + 沿长轴微微弯起（中脉下凹）。 */
function leafGeo(len, w, { depth = 0.0025, bend = 0.25 } = {}) {
  const g = slab(leafShape(len, w), depth, depth * 0.35, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, p.getZ(i) + (y / (w * 0.5)) ** 2 * w * 0.18 + Math.sin((x / len) * Math.PI) * len * bend * 0.12);
  }
  g.computeVertexNormals();
  return g;
}
/** 沿折线（Vector3 数组）的圆管，半径从 r0 渐变到 r1。 */
function tubeAlong(pts, r0, r1 = r0, { radial = 8, seg = 24 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const frames = curve.computeFrenetFrames(seg, false), c = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const r = r0 + (r1 - r0) * (i / seg);
    curve.getPointAt(i / seg, c);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      pos.setXYZ(k, c.x + nrm.getX(k) * r, c.y + nrm.getY(k) * r, c.z + nrm.getZ(k) * r);
    }
  }
  g.computeVertexNormals();
  return g;
}
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** 竖条纹 / 斑点之类的小贴图材质（缓存）。 */
function texMat(key, w, h, draw, opts = {}) {
  return cached(`p3:item:${key}`, () => tmat('#ffffff', { map: canvasTexture(w, h, draw, { wrap: true }), ...opts }));
}

// ---------------------------------------------------------------------------------------------
// 苍蝇拍（00:18 斜靠在左石上、00:20 图标）：木柄 + 缠绳 + 一把白色羽毛纤维扇面
// ---------------------------------------------------------------------------------------------
function makeSwatter() {
  const root = group('p3_swatter');
  const wood = tmat('#8d6a45'), cord = tmat('#5d4630', { outline: 0.003 }), plume = tmat('#efebe0', { side: THREE.DoubleSide });
  mesh(root, new THREE.CylinderGeometry(0.0105, 0.012, 0.25, 12).rotateZ(Math.PI / 2), wood, 'swatter_handle', [-0.085, 0, 0]);
  mesh(root, new THREE.SphereGeometry(0.0145, 12, 10), wood, 'swatter_knob', [-0.212, 0, 0]);
  const rings = [];
  for (let i = 0; i < 5; i++) rings.push(new THREE.TorusGeometry(0.0128, 0.0032, 6, 16).rotateY(Math.PI / 2).translate(0.02 + i * 0.0072, 0, 0));
  merge(root, rings, cord, 'swatter_cord');
  // 扇面：11 根尖尖的羽毛纤维从绳结处散开，中间长、两边短
  const feathers = [], vein = [];
  for (let i = 0; i < 17; i++) {
    const t = i / 16 - 0.5, a = t * 1.05, len = 0.2 - Math.abs(t) * 0.07, w = 0.034 - Math.abs(t) * 0.008;
    const g = leafGeo(len, w, { depth: 0.002, bend: 0.1 });
    g.rotateZ(a); g.translate(0.05, t * 0.014, (i % 3) * 0.003 - 0.003);
    feathers.push(g);
    vein.push(rod([0.052, t * 0.012, 0.004], [0.052 + Math.cos(a) * len * 0.8, t * 0.012 + Math.sin(a) * len * 0.8, 0.0045], 0.0011, 4));
  }
  merge(root, feathers, plume, 'swatter_plume');
  merge(root, vein, tmat('#c9c1ae', { outline: false }), 'swatter_veins');
  return root;
}

// ---------------------------------------------------------------------------------------------
// 蚊子（02:00 图标：一小撮黑色死蚊子）
// ---------------------------------------------------------------------------------------------
function makeGnats() {
  const root = group('p3_gnats');
  const geo = mosquitoGeometry(0.034, { detail: true });
  const mat = tmat('#1a1a1a', { outline: 0.0025, side: THREE.DoubleSide });
  const R = rng(91), parts = [];
  const spots = [[-0.02, 0.006, 0], [0.012, 0.01, 0.004], [0.026, -0.008, -0.004], [-0.004, -0.012, 0.006], [-0.03, -0.01, -0.003], [0.004, 0.022, -0.006], [0.03, 0.016, 0.002], [-0.016, 0.024, 0.004]];
  for (const [x, y, z] of spots) {
    const g = geo.clone();
    g.rotateY(R() * TAU); g.rotateX((R() - 0.5) * 0.8); g.rotateZ((R() - 0.5) * 0.9);
    g.translate(x, y, z);
    parts.push(g);
  }
  mesh(root, mergeGeometries(parts), mat, 'gnats_heap');
  return root;
}

// ---------------------------------------------------------------------------------------------
// 蜗牛（01:48 趴在木桩侧面）：赭黄螺旋壳 + 深色螺纹，灰蓝身体和两根触角
// ---------------------------------------------------------------------------------------------
function makeSnail() {
  const root = group('p3_snail');
  const shellMat = texMat('snail', 128, 64, (g, w, h) => {
    g.fillStyle = '#c9a44c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e1c46e'; g.fillRect(0, h * 0.18, w, h * 0.16);
    g.strokeStyle = 'rgba(70,50,18,0.75)'; g.lineWidth = 3;
    for (let x = 6; x < w; x += 11) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 4, h); g.stroke(); }
    g.strokeStyle = '#4c3714'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, h * 0.92); g.lineTo(w, h * 0.92); g.stroke();
  });
  // 壳：沿对数螺线盘三圈的渐粗圆管（xy 平面里盘起来，侧面看就是一卷螺旋），外圈半径约 0.024
  const pts = [], n = 90, b = 0.1, turns = 3.1;
  for (let i = 0; i <= n; i++) {
    const t = i / n, th = t * turns * TAU, r = 0.0033 * Math.exp(b * th);
    pts.push(V(-0.004 + Math.cos(th) * r, 0.034 + Math.sin(th) * r, (1 - t) * 0.006));
  }
  const rmax = 0.0033 * Math.exp(b * turns * TAU);
  const shell = tubeAlong(pts, 0.0022, rmax * 0.43, { radial: 12, seg: 120 });
  mesh(root, shell, shellMat, 'snail_shell');
  // 身体：扁长的软体，头端抬起
  const body = new THREE.SphereGeometry(1, 20, 12); body.scale(0.05, 0.011, 0.016);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); if (x > 0.02) p.setY(i, p.getY(i) + (x - 0.02) * 0.45); }
  body.computeVertexNormals();
  const skin = tmat('#7a8592');
  mesh(root, body, skin, 'snail_body', [0.002, 0.011, 0]);
  for (const s of [-1, 1]) {
    mesh(root, rod([0.042, 0.022, s * 0.004], [0.058, 0.044, s * 0.009], 0.0019, 6, 0.0013), skin, 'snail_eye_stalk');
    mesh(root, new THREE.SphereGeometry(0.0028, 8, 6), tmat('#2a2d33', { outline: false }), 'snail_eye', [0.0585, 0.045, s * 0.0095]);
  }
  return root;
}

// ---------------------------------------------------------------------------------------------
// 斧子（01:48 插在木桩上、01:50 图标）：浅木长柄 + 锈红斧头 + 灰钢刃
// ---------------------------------------------------------------------------------------------
function makeAxe() {
  const root = group('p3_axe');
  const handle = tubeAlong([V(-0.25, -0.012, 0), V(-0.08, 0.004, 0), V(0.1, 0.006, 0), V(0.22, -0.004, 0)], 0.0145, 0.0125, { radial: 10, seg: 20 });
  mesh(root, handle, tmat('#b08a5c'), 'axe_handle');
  mesh(root, new THREE.SphereGeometry(0.016, 10, 8).scale(1.1, 1, 1), tmat('#a07c50'), 'axe_butt', [-0.252, -0.012, 0]);
  // 斧头：锈红楔形，刃朝 −y
  const head = new THREE.Shape();
  head.moveTo(-0.028, 0.026); head.lineTo(0.03, 0.026); head.lineTo(0.034, -0.03);
  head.quadraticCurveTo(0.06, -0.075, 0.072, -0.11); head.lineTo(-0.058, -0.11);
  head.quadraticCurveTo(-0.044, -0.07, -0.03, -0.03); head.lineTo(-0.028, 0.026);
  const hg = slab(head, 0.026, 0.002, 10);
  hg.scale(1.45, 1.35, 1.2); mesh(root, hg, tmat('#8c3d30'), 'axe_head', [0.19, 0.012, 0]);
  const edge = new THREE.Shape();
  edge.moveTo(-0.058, -0.11); edge.lineTo(0.072, -0.11); edge.lineTo(0.064, -0.088); edge.quadraticCurveTo(0.004, -0.083, -0.051, -0.088); edge.lineTo(-0.058, -0.11);
  mesh(root, slab(edge, 0.03, 0.0015, 8).scale(1.45, 1.35, 1.25), tmat('#cfcfc8'), 'axe_edge', [0.19, 0.012, 0]);
  return root;
}

// ---------------------------------------------------------------------------------------------
// 铲子（01:16 靠在桌边、01:18 图标）：直木柄 + 灰钢尖铲头
// ---------------------------------------------------------------------------------------------
function makeShovel() {
  const root = group('p3_shovel');
  mesh(root, new THREE.CylinderGeometry(0.014, 0.016, 0.66, 12).rotateZ(Math.PI / 2), tmat('#8a6a48'), 'shovel_handle', [-0.14, 0, 0]);
  mesh(root, new THREE.CylinderGeometry(0.019, 0.019, 0.026, 12).rotateZ(Math.PI / 2), tmat('#6e5238'), 'shovel_cap', [-0.475, 0, 0]);
  mesh(root, new THREE.CylinderGeometry(0.019, 0.024, 0.09, 12).rotateZ(Math.PI / 2), tmat('#7b7d7b'), 'shovel_socket', [0.225, 0, 0]);
  // 铲头：圆肩尖头的铁片，中间略凹
  const s = new THREE.Shape();
  s.moveTo(0, 0.085); s.quadraticCurveTo(0.03, 0.088, 0.12, 0.07); s.quadraticCurveTo(0.2, 0.035, 0.235, 0);
  s.quadraticCurveTo(0.2, -0.035, 0.12, -0.07); s.quadraticCurveTo(0.03, -0.088, 0, -0.085); s.lineTo(0, 0.085);
  const blade = slab(s, 0.006, 0.0015, 16);
  const p = blade.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) + (y / 0.085) ** 2 * 0.016); }
  blade.computeVertexNormals();
  const steel = texMat('shovel', 128, 64, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#b4b6b4'); grd.addColorStop(0.5, '#8e908e'); grd.addColorStop(1, '#b0b2b0');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,40,40,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  });
  blade.scale(1.12, 1.18, 1); mesh(root, blade, steel, 'shovel_blade', [0.262, 0, -0.004]);
  return root;
}

// ---------------------------------------------------------------------------------------------
// 剪刀（03:54 Ida 手里）：银色长刃 + 黑色圈柄，微微张开
// ---------------------------------------------------------------------------------------------
function makeScissors({ open = 0.2 } = {}) {
  const root = group('p3_scissors');
  const steel = tmat('#cfcfca'), black = tmat('#1f1f1f');
  for (const s of [-1, 1]) {
    const half = group(s > 0 ? 'scissors_upper' : 'scissors_lower', root);
    const b = new THREE.Shape();
    b.moveTo(-0.012, 0); b.quadraticCurveTo(0.03, s * 0.012, 0.115, s * 0.0015); b.lineTo(0.116, 0); b.quadraticCurveTo(0.04, -s * 0.0035, -0.012, -s * 0.006); b.lineTo(-0.012, 0);
    mesh(half, slab(b, 0.0035, 0.0008, 10), steel, 'scissors_blade', [0, 0, s * 0.0026]);
    mesh(half, rod([-0.012, -s * 0.002, s * 0.0026], [-0.05, -s * 0.015, s * 0.0026], 0.0042, 8), black, 'scissors_shank');
    mesh(half, new THREE.TorusGeometry(0.016, 0.0045, 8, 22).scale(1.2, 1, 1), black, 'scissors_ring', [-0.066, -s * 0.02, s * 0.0026]);
    half.rotation.z = s * open * 0.5;
  }
  mesh(root, new THREE.CylinderGeometry(0.0042, 0.0042, 0.012, 10).rotateX(Math.PI / 2), tmat('#8d8d88'), 'scissors_pivot');
  root.setOpen = (k) => { for (const c of root.children) if (c.name.startsWith('scissors_')) c.rotation.z = (c.name.endsWith('upper') ? 1 : -1) * k * 0.5; };
  return root;
}

// ---------------------------------------------------------------------------------------------
// 蜂蜜（03:26 图标）：一小块蜂巢 + 往下淌的金色蜂蜜团
// ---------------------------------------------------------------------------------------------
function makeHoney() {
  const root = group('p3_honey');
  const amber = tmat('#e3a52a'), dark = tmat('#a8661a', { outline: false }), light = umat('#fbe39a');
  // 一团软软的蜂蜜：底下一摊 + 上面堆起的圆团
  mesh(root, lumpGeo(0.042, { seed: 5, amp: 0.07, squash: [1.25, 0.34, 0.95], flatBottom: true }), amber, 'honey_puddle', [0, -0.02, 0]);
  mesh(root, lumpGeo(0.028, { seed: 9, amp: 0.08, squash: [1.05, 0.7, 0.95] }), amber, 'honey_mound', [-0.004, -0.004, 0.004]);
  mesh(root, new THREE.SphereGeometry(0.009, 10, 8).scale(1.4, 0.9, 1), amber, 'honey_drip_top', [0.004, 0.014, 0.006]);
  // 蜂蜜里嵌着的一小块蜂巢
  const cells = [], holes = [];
  for (const [x, y] of [[0, 0], [0.0165, 0], [0.00825, 0.0143]]) {
    cells.push(new THREE.CylinderGeometry(0.0092, 0.0092, 0.012, 6).rotateX(Math.PI / 2).rotateZ(Math.PI / 6).translate(x, y, 0));
    holes.push(new THREE.CircleGeometry(0.006, 6).rotateZ(Math.PI / 6).translate(x, y, 0.0062));
  }
  const comb = group('honey_comb_piece', root, [0.018, -0.006, 0.026]);
  merge(comb, cells, tmat('#d39a26'), 'honey_comb');
  merge(comb, holes, dark, 'honey_cells');
  comb.rotation.set(-0.5, 0.35, 0.2);
  for (const [x, y, z, sx] of [[-0.016, 0.004, 0.026, 2.2], [0.012, -0.016, 0.034, 1.6]]) {
    mesh(root, new THREE.SphereGeometry(0.004, 8, 6).scale(sx, 0.7, 0.5), light, 'honey_shine', [x, y, z]);
  }
  return root;
}

// ---------------------------------------------------------------------------------------------
// 耳朵（04:14 图标）：肉色人耳，内有耳廓纹，切口带血
// ---------------------------------------------------------------------------------------------
function makeEar() {
  const root = group('p3_ear');
  const skin = tmat('#e7cfbf');
  const s = new THREE.Shape();
  s.moveTo(-0.012, -0.034);
  s.bezierCurveTo(-0.022, -0.012, -0.024, 0.016, -0.016, 0.03);
  s.bezierCurveTo(-0.004, 0.046, 0.024, 0.044, 0.03, 0.022);
  s.bezierCurveTo(0.036, 0.0, 0.02, -0.012, 0.016, -0.026);
  s.bezierCurveTo(0.014, -0.04, 0.006, -0.05, -0.004, -0.048);
  s.bezierCurveTo(-0.01, -0.046, -0.012, -0.04, -0.012, -0.034);
  const g = slab(s, 0.009, 0.0035, 20);
  mesh(root, g, skin, 'ear_body');
  // 耳甲腔（内凹的深色）与对耳轮
  const inner = new THREE.Shape();
  inner.moveTo(-0.004, -0.012); inner.bezierCurveTo(-0.008, 0.004, -0.002, 0.022, 0.012, 0.024);
  inner.bezierCurveTo(0.022, 0.018, 0.016, 0.004, 0.008, -0.004); inner.bezierCurveTo(0.004, -0.012, 0.0, -0.016, -0.004, -0.012);
  mesh(root, new THREE.ShapeGeometry(inner, 12), tmat('#c99f8c', { outline: false }), 'ear_concha', [0, 0, 0.0081]);
  mesh(root, tubeAlong([V(-0.012, -0.03, 0.0084), V(-0.016, 0.0, 0.0086), V(-0.008, 0.026, 0.0086), V(0.012, 0.036, 0.0086), V(0.024, 0.024, 0.0084)], 0.0016, 0.0012, { radial: 5, seg: 24 }), tmat('#b78978', { outline: false }), 'ear_fold');
  // 血：切口一侧的暗红
  const blood = tmat('#8f1612', { outline: false });
  mesh(root, new THREE.SphereGeometry(0.006, 10, 8).scale(1.4, 2.4, 0.6), blood, 'ear_blood', [-0.014, -0.008, 0.002]);
  mesh(root, new THREE.SphereGeometry(0.0035, 8, 6), blood, 'ear_blood_drop', [-0.013, -0.026, 0.004]);
  return root;
}

// ---------------------------------------------------------------------------------------------
// 贻贝（08:54 撬开的贝 + 橙色贝肉）：深紫褐双壳张开，下壳里一团橙肉
// ---------------------------------------------------------------------------------------------
function valveGeo(len = 0.09, w = 0.044, depth = 0.016) {
  // 泪滴形外轮廓（−x 尖、+x 圆），在 xz 平面；壳面往 −y 鼓（凹面朝 +y）
  const g = new THREE.PlaneGeometry(1, 1, 24, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getY(i) * 2;   // u: 0 尖 → 1 圆，v: −1..1
    const half = Math.sin(Math.PI * Math.pow(u, 0.72)) * (u > 0.6 ? 1 : 0.55 + 0.45 * u / 0.6) * 0.5;
    const z = v * half * w, x = (u - 0.5) * len;
    const y = -depth * Math.max(0, 1 - v * v) * Math.sin(Math.PI * Math.min(1, u * 1.05));
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
function makeMussel() {
  const root = group('p3_mussel');
  const shellTex = texMat('mussel', 128, 64, (g, w, h) => {
    g.fillStyle = '#3f2b39'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(140,110,140,0.55)'; g.lineWidth = 2;
    for (let i = 1; i < 7; i++) { g.beginPath(); g.ellipse(0, h / 2, i * w / 7, i * h / 7 * 0.9, 0, -Math.PI / 2, Math.PI / 2); g.stroke(); }
  }, { side: THREE.DoubleSide });
  const inside = tmat('#b3a7b6', { side: THREE.BackSide, outline: false });
  const lower = group('mussel_lower', root);
  mesh(lower, valveGeo(), shellTex, 'mussel_valve');
  mesh(lower, valveGeo(0.084, 0.04, 0.013).translate(0.002, 0.0015, 0), inside, 'mussel_inner');
  mesh(lower, lumpGeo(0.03, { seed: 3, amp: 0.12, squash: [1.25, 0.32, 0.62] }), tmat('#e8962c'), 'mussel_meat', [0.006, -0.002, 0]);
  mesh(lower, new THREE.TorusGeometry(0.026, 0.0035, 6, 24).scale(1.3, 0.62, 1).rotateX(Math.PI / 2), tmat('#b86a1e', { outline: false }), 'mussel_meat_rim', [0.006, 0.004, 0]);
  const upper = group('mussel_upper', root, [-0.045, 0, 0]);
  const up = mesh(upper, valveGeo().rotateX(Math.PI).translate(0.045, 0, 0), shellTex, 'mussel_valve_top');
  up.position.y = 0.001;
  upper.rotation.z = 0.95;
  root.rotation.set(0.35, 0, -0.1);
  const wrap = group('p3_mussel_item'); wrap.add(root);
  return wrap;
}

// ---------------------------------------------------------------------------------------------
// 浆果（05:12 图标）：一串红色浆果 + 两片叶子
// ---------------------------------------------------------------------------------------------
function makeBerries() {
  const root = group('p3_berries');
  const red = tmat('#c71f2b'), stem = tmat('#4d3a24', { outline: 0.002 }), leaf = tmat('#5f8a35');
  const spots = [[-0.02, -0.006, 0.004], [0.0, -0.012, 0.01], [0.019, -0.005, 0.002], [-0.01, 0.012, 0.008], [0.011, 0.014, 0.006], [0.028, 0.012, -0.004], [-0.026, 0.016, -0.004], [0.0, 0.004, -0.012]];
  const balls = [], stems = [];
  for (const [x, y, z] of spots) {
    balls.push(new THREE.SphereGeometry(0.0118, 14, 10).translate(x, y, z));
    stems.push(rod([x * 0.4, 0.034, z * 0.3], [x, y + 0.01, z], 0.0011, 4));
  }
  merge(root, balls, red, 'berries');
  merge(root, stems, stem, 'berry_stems');
  mesh(root, rod([0, 0.034, 0], [-0.004, 0.05, 0], 0.0018, 5), stem, 'berry_twig');
  const shine = [];
  for (const [x, y, z] of spots) shine.push(new THREE.SphereGeometry(0.0032, 6, 4).translate(x - 0.004, y + 0.005, z + 0.009));
  merge(root, shine, umat('#f4b7b7'), 'berry_shine');
  for (const s of [-1, 1]) {
    const g = leafGeo(0.042, 0.022);
    g.rotateZ(Math.PI / 2 + s * 0.85); g.translate(0, 0.046, -0.004);
    mesh(root, g, leaf, 'berry_leaf');
  }
  return root;
}

// ---------------------------------------------------------------------------------------------
// 桦树汁（05:34 树下的小陶罐、05:38 图标）：带把手的陶土小罐，装满浅黄树汁；opts.fill = 0 为空罐
// ---------------------------------------------------------------------------------------------
const JUG = [[0.0, 0.0], [0.034, 0.0], [0.042, 0.008], [0.046, 0.035], [0.045, 0.068], [0.039, 0.092], [0.038, 0.102], [0.042, 0.112]];
function makeSap({ fill = 1 } = {}) {
  const root = group('p3_sap');
  const clay = texMat('jug', 128, 128, (g, w, h) => {
    g.fillStyle = '#b98b5b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#9b6e44'; g.fillRect(0, h * 0.2, w, 6); g.fillRect(0, h * 0.27, w, 3);
    const R = rng(4); for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(80,52,28,${R() * 0.25})`; g.fillRect(R() * w, R() * h, 2, 2); }
  });
  const body = lathe(JUG.map(([r, y]) => [r, y]), 32);
  mesh(root, body, clay, 'jug_body', [0, -0.056, 0]);
  const inner = lathe([[0.0, 0.006], [0.036, 0.006], [0.04, 0.035], [0.038, 0.07], [0.034, 0.096], [0.036, 0.11]], 32);
  mesh(root, inner, tmat('#5a3e26', { side: THREE.BackSide, outline: false }), 'jug_inner', [0, -0.056, 0]);
  mesh(root, new THREE.TorusGeometry(0.041, 0.0035, 6, 32).rotateX(Math.PI / 2), tmat('#a77a4c'), 'jug_rim', [0, 0.056, 0]);
  const handle = new THREE.TorusGeometry(0.026, 0.0062, 8, 20, Math.PI * 1.1);
  handle.rotateZ(-Math.PI * 0.55);
  mesh(root, handle, clay, 'jug_handle', [-0.054, 0.004, 0]);
  const sap = mesh(root, new THREE.CircleGeometry(0.0375, 28).rotateX(-Math.PI / 2), tmat('#e8d98c', { outline: false }), 'jug_sap', [0, 0.05, 0]);
  sap.visible = fill > 0;
  root.setFill = (k) => { sap.visible = k > 0.001; sap.position.y = -0.05 + 0.1 * Math.min(1, k); };
  root.setFill(fill);
  return root;
}

// ---------------------------------------------------------------------------------------------
// 球茎（06:34 图标）：紫灰洋葱形，深色竖纹，底部须根，顶上两片绿芽；横放（芽朝 +x）
// ---------------------------------------------------------------------------------------------
function makeBulb() {
  const root = group('p3_bulb');
  const skin = texMat('bulb', 256, 64, (g, w, h) => {
    g.fillStyle = '#958290'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) {
      const x = (i / 18) * w;
      g.strokeStyle = i % 2 ? 'rgba(60,40,58,0.55)' : 'rgba(220,205,215,0.35)'; g.lineWidth = i % 2 ? 3 : 2;
      g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + 4, h * 0.5, x, 0); g.stroke();
    }
  });
  const prof = [[0.0, 0.0], [0.02, 0.003], [0.034, 0.014], [0.039, 0.03], [0.034, 0.05], [0.02, 0.068], [0.009, 0.08], [0.004, 0.092]];
  const body = lathe(prof, 28);
  body.rotateZ(-Math.PI / 2); body.translate(-0.045, 0, 0);
  mesh(root, body, skin, 'bulb_body');
  const roots = [];
  const R = rng(8);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    roots.push(rod([-0.044, Math.cos(a) * 0.006, Math.sin(a) * 0.006], [-0.06 - R() * 0.01, Math.cos(a) * 0.02, Math.sin(a) * 0.02], 0.0012, 4));
  }
  merge(root, roots, tmat('#d8cdb6', { outline: 0.0015 }), 'bulb_roots');
  const sprout = tmat('#9dbb3a');
  for (const [a, len] of [[0.35, 0.05], [-0.25, 0.042]]) {
    const g = leafGeo(len, 0.012, { depth: 0.002 });
    g.rotateZ(a); g.translate(0.044, 0, 0.002);
    mesh(root, g, sprout, 'bulb_sprout');
  }
  return root;
}

// ---------------------------------------------------------------------------------------------
// 黏土（10:00 图标）：一团圆鼓的陶土
// ---------------------------------------------------------------------------------------------
function makeClay() {
  const root = group('p3_clay');
  mesh(root, lumpGeo(0.058, { seed: 12, amp: 0.08, freq: 1.8, squash: [1.15, 0.78, 0.95], flatBottom: true }), tmat('#b5713a'), 'clay_lump', [0, -0.012, 0]);
  return root;
}

// ---------------------------------------------------------------------------------------------
// 花（立着，原点在茎底，沿 +y）
// ---------------------------------------------------------------------------------------------
/** 一朵五瓣小花（朝 +z），petal 花瓣长。 */
function blossomGeo(petal = 0.02, n = 5, cup = 0.25) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const g = leafGeo(petal, petal * 0.78, { depth: 0.0018, bend: 0.1 });
    g.rotateY(-cup); g.rotateZ((i / n) * TAU);
    parts.push(g);
  }
  return mergeGeometries(parts.map((g) => { const c = g.index ? g.toNonIndexed() : g; c.deleteAttribute('uv'); return c; }));
}
function stemWithLeaves(root, h, { lean = 0.02, leaves = [[0.35, 1], [0.55, -1]], leafLen = 0.06, color = '#5f8a35', stem = '#6d9a3c' } = {}) {
  const top = V(lean, h, 0);
  mesh(root, tubeAlong([V(0, 0, 0), V(lean * 0.3, h * 0.5, 0.004), top], 0.0032, 0.0024, { radial: 6, seg: 12 }), tmat(stem, { outline: 0.0025 }), 'flower_stem');
  for (const [t, s] of leaves) {
    const g = leafGeo(leafLen, leafLen * 0.38);
    g.rotateZ(Math.PI / 2 - s * 1.0); g.translate(lean * t, h * t, 0.002);
    mesh(root, g, tmat(color), 'flower_leaf');
  }
  return top;
}
/** 黄色花（09:12–09:16 捕蝇草开出的花）：一簇黄橙小花。 */
function makeFlowerYellow() {
  const root = group('p3_flower_yellow');
  const top = stemWithLeaves(root, 0.21, { lean: 0.006, leafLen: 0.055 });
  const petals = [], centers = [];
  const spots = [[0, 0.03, 0.012], [-0.026, 0.012, 0.004], [0.026, 0.014, 0.002], [-0.014, 0.04, -0.006], [0.016, 0.042, -0.004], [0.0, 0.058, 0.0], [-0.03, 0.036, -0.012], [0.03, 0.034, -0.01]];
  for (const [x, y, z] of spots) {
    const g = blossomGeo(0.017); g.rotateX(-0.35 + y * 4); g.translate(top.x + x, top.y + y, z + 0.004);
    petals.push(g);
    centers.push(new THREE.SphereGeometry(0.0045, 8, 6).translate(top.x + x, top.y + y, z + 0.008));
    if (Math.abs(x) > 0.001) centers.push(rod([top.x, top.y - 0.004, 0], [top.x + x * 0.9, top.y + y * 0.9, z], 0.0013, 4));
  }
  merge(root, petals, tmat('#f4a91a', { side: THREE.DoubleSide }), 'flower_petals');
  merge(root, centers, tmat('#b86414', { outline: 0.002 }), 'flower_centers');
  return root;
}
/** 橙红花簇（10:20–10:22 钟罩里长出来的）：几朵大一点的橙红花。 */
function makeFlowerOrange() {
  const root = group('p3_flower_orange');
  const top = stemWithLeaves(root, 0.2, { lean: -0.008, leaves: [[0.3, 1], [0.5, -1], [0.7, 1]], leafLen: 0.05 });
  const petals = [], centers = [];
  const spots = [[0, 0.026, 0.012], [-0.03, 0.012, 0.0], [0.03, 0.01, 0.002], [-0.018, 0.05, -0.006], [0.02, 0.05, -0.004], [0.0, 0.07, -0.01]];
  for (const [x, y, z] of spots) {
    const g = blossomGeo(0.023, 6, 0.35); g.rotateX(-0.25); g.rotateZ(x * 8); g.translate(top.x + x, top.y + y, z + 0.006);
    petals.push(g);
    centers.push(new THREE.SphereGeometry(0.004, 8, 6).translate(top.x + x, top.y + y, z + 0.01));
  }
  merge(root, petals, tmat('#ee561a', { side: THREE.DoubleSide }), 'flower_petals');
  merge(root, centers, tmat('#8e2a0c', { outline: 0.002 }), 'flower_centers');
  return root;
}
/** 红玫瑰（10:26，回忆里 Caroline 举着的那朵）。 */
function makeRose() {
  const root = group('p3_rose');
  const top = stemWithLeaves(root, 0.22, { lean: 0.004, leaves: [[0.42, 1], [0.62, -1]], leafLen: 0.045, color: '#4e7a2e', stem: '#4f7a30' });
  // 刺
  const thorns = [];
  for (const t of [0.2, 0.5, 0.78]) thorns.push(new THREE.ConeGeometry(0.0022, 0.008, 5).rotateZ(t > 0.4 ? -1.2 : 1.2).translate(top.x * t + (t > 0.4 ? 0.004 : -0.004), top.y * t, 0));
  merge(root, thorns, tmat('#3d5f22', { outline: 0.0015 }), 'rose_thorns');
  // 花萼
  for (let i = 0; i < 5; i++) {
    const g = leafGeo(0.02, 0.006, { depth: 0.0015 }); g.rotateZ(-Math.PI / 2 + 0.6); g.rotateY((i / 5) * TAU); g.translate(top.x, top.y + 0.004, 0);
    mesh(root, g, tmat('#4e7a2e'), 'rose_sepal');
  }
  // 花头：中间内卷的花苞 + 两圈杯状花瓣（侧面看是经典的玫瑰杯形）
  const head = group('rose_head', root, [top.x, top.y + 0.004, 0]);
  const red = tmat('#d0231d', { side: THREE.DoubleSide }), deep = tmat('#9e1712', { side: THREE.DoubleSide });
  mesh(head, lathe([[0, 0.006], [0.011, 0.01], [0.017, 0.022], [0.016, 0.036], [0.01, 0.044], [0.003, 0.046], [0, 0.044]], 18), deep, 'rose_bud');
  mesh(head, tubeAlong([V(0.004, 0.045, 0.004), V(0.012, 0.04, 0.008), V(0.014, 0.034, -0.004), V(0.004, 0.036, -0.012), V(-0.008, 0.04, -0.006)], 0.0016, 0.0016, { radial: 5, seg: 16 }), tmat('#6e0e0b', { outline: false }), 'rose_swirl');
  [[0.026, 0.044, 5, 0.32, 0.0], [0.034, 0.05, 6, 0.55, 0.5]].forEach(([rad, h, n, open, off]) => {
    for (let i = 0; i < n; i++) {
      const g = new THREE.SphereGeometry(rad, 12, 10, -0.62, 1.24, Math.PI * 0.18, Math.PI * 0.5);
      g.scale(1, h / rad, 0.62); g.translate(0, -h * 0.14, -rad * 0.28); g.rotateX(open); g.translate(0, h * 0.42, rad * 0.32);
      g.rotateY((i / n) * TAU + off);
      mesh(head, g, red, 'rose_petal');
    }
  });
  root.userData.head = head;
  return root;
}

// ---------------------------------------------------------------------------------------------
// 花瓶（陶轮做的两只，器形 = POT.targets；神龛左边原有的长颈瓶）。立着，原点在瓶底中心。
// ---------------------------------------------------------------------------------------------
function vaseMaterial(base, key) {
  return texMat(`vase:${key}`, 256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const R = rng(key.length * 7 + 3);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '70,40,20' : '235,200,160'},${R() * 0.12})`; g.fillRect(R() * w, R() * h, 3, 2); }
    g.strokeStyle = 'rgba(70,40,20,0.18)'; g.lineWidth = 2;
    for (let y = 12; y < h; y += 17) { g.beginPath(); g.moveTo(0, y + R() * 3); g.lineTo(w, y + R() * 3); g.stroke(); }
  });
}
/** 由外轮廓车削出带厚度的器皿；open 时口部有内壁和深色内腔。返回 group，子物体 vase_mouth 在瓶口中心。 */
function vesselFromProfile(name, prof, { color, key, open = true, wall = 0.0075 } = {}) {
  const root = group(name);
  // 去掉同一高度上的重复点（段间台阶在成品花瓶上抹平）
  const pts = [];
  for (const [r, y] of prof) { const last = pts[pts.length - 1]; if (last && Math.abs(last[1] - y) < 1e-4) { last[0] = Math.max(last[0], r) * 0.5 + Math.min(last[0], r) * 0.5; continue; } pts.push([r, y]); }
  const outer = [[0, 0], ...pts.map(([r, y]) => [Math.max(r, 0.004), y])];
  mesh(root, lathe(outer, 40), vaseMaterial(color, key), `${name}_body`);
  const top = pts[pts.length - 1];
  if (open) {
    const inner = pts.filter(([, y]) => y > top[1] - 0.06).map(([r, y]) => [Math.max(0.003, r - wall), y]);
    mesh(root, lathe(inner, 40), tmat('#3b2618', { side: THREE.BackSide, outline: false }), `${name}_inner`);
    mesh(root, new THREE.CircleGeometry(Math.max(0.003, inner[0][0]), 24).rotateX(-Math.PI / 2), tmat('#24160d', { outline: false }), `${name}_dark`, [0, inner[0][1] + 0.002, 0]);
    mesh(root, new THREE.TorusGeometry(top[0] - wall * 0.5, wall * 0.5, 6, 40).rotateX(Math.PI / 2), vaseMaterial(color, key), `${name}_rim`, [0, top[1], 0]);
  }
  const mouth = new THREE.Object3D(); mouth.name = 'vase_mouth'; mouth.position.set(0, top[1] - 0.02, 0); root.add(mouth);
  root.userData.mouth = mouth;
  return root;
}
const makeVaseSlim = () => vesselFromProfile('p3_vase_slim', potProfile(POT.targets.slim), { color: '#bd8655', key: 'slim', open: potOpen(POT.targets.slim) });
const makeVaseUrn = () => vesselFromProfile('p3_vase_urn', potProfile(POT.targets.urn), { color: '#b07848', key: 'urn', open: potOpen(POT.targets.urn) });
/** 神龛左柱上原有的长颈瓶（05:14）：圆鼓的瓶肚 + 细长颈 + 小喇叭口。 */
const makeVaseBottle = () => vesselFromProfile('p3_vase_bottle', [[0.052, 0], [0.068, 0.022], [0.076, 0.06], [0.07, 0.1], [0.05, 0.135], [0.026, 0.162], [0.018, 0.2], [0.017, 0.29], [0.024, 0.335], [0.034, 0.36]],
  { color: '#a98b73', key: 'bottle', open: true, wall: 0.006 });

// ---------------------------------------------------------------------------------------------

/** 物品栏名字（中文为原作本地化）与外观尺寸说明，章节的 items.js 直接用。 */
export const ITEM_SPECS = {
  p3_swatter: { zh: '苍蝇拍', en: 'Fly swatter' },
  p3_gnats: { zh: '蚊子', en: 'Gnats' },
  p3_snail: { zh: '蜗牛', en: 'Snail' },
  p3_axe: { zh: '斧子', en: 'Axe' },
  p3_shovel: { zh: '铲子', en: 'Shovel' },
  p3_scissors: { zh: '剪刀', en: 'Scissors' },
  p3_honey: { zh: '蜂蜜', en: 'Honey' },
  p3_ear: { zh: '耳朵', en: 'Ear' },
  p3_mussel: { zh: '贻贝', en: 'Mussel' },
  p3_berries: { zh: '浆果', en: 'Berries' },
  p3_sap: { zh: '桦树汁', en: 'Birch sap' },
  p3_bulb: { zh: '球茎', en: 'Flower bulb' },
  p3_clay: { zh: '黏土', en: 'Clay' },
  p3_flower_yellow: { zh: '花', en: 'Flower' },
  p3_flower_orange: { zh: '花', en: 'Flower' },
  p3_rose: { zh: '花', en: 'Rose' },
  p3_vase_slim: { zh: '花瓶', en: 'Vase' },
  p3_vase_urn: { zh: '花瓶', en: 'Vase' },
};

export const FACTORIES = {
  p3_swatter: makeSwatter,
  p3_gnats: makeGnats,
  p3_snail: makeSnail,
  p3_axe: makeAxe,
  p3_shovel: makeShovel,
  p3_scissors: (o) => makeScissors(o || {}),
  p3_honey: makeHoney,
  p3_ear: makeEar,
  p3_mussel: makeMussel,
  p3_berries: makeBerries,
  p3_sap: (o) => makeSap(o || {}),
  p3_bulb: makeBulb,
  p3_clay: makeClay,
  p3_flower_yellow: makeFlowerYellow,
  p3_flower_orange: makeFlowerOrange,
  p3_rose: makeRose,
  p3_vase_slim: makeVaseSlim,
  p3_vase_urn: makeVaseUrn,
  p3_vase_bottle: makeVaseBottle,
};
