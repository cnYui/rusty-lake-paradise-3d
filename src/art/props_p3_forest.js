// 第三灾（蚊灾和虱灾）森林道具：捕蝇草、红叉大树、土堆、蜂巢。接口见 docs/plague3_api.md §4。
// 约定同 §0：1 单位 = 1 米，原点在地面（蜂巢是枝条顶端挂点），正面朝 +z；状态方法返回 Promise 并支持 { instant }，
// 每个有状态的道具都有 setState / getState（瞬时、可往回设）；动画只用 core/tween.js；点击盒是透明代理盒（hit()）。
// 外观对照参考视频 dev/ref/P03_*.mp4 的时间点写在每个工厂前面：粗黑描边 + 平涂 + 少量手绘纹理。
import {
  THREE, TAU, clamp, seg, lerp, smooth, group, mesh, hit, tmat, umat, cached, canvasTexture, rng,
  lumpGeo, contactShadow, mergeGeometries, animate, Ease, toon, unlit, mosquitoGeometry,
} from './props_p3_shared.js';
import { FACTORIES as ITEMS } from './props_p3_items.js';

// ---------------------------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------------------------

const mosquitoGeometry30 = () => mosquitoGeometry(0.03, { detail: false });
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
/** 合并几何体（去 uv，非索引），不 dispose 输入（缓存几何体也能传）。 */
function mergeGeos(geos, { keepUv = false } = {}) {
  return mergeGeometries(geos.map((g) => {
    const c = g.index ? g.toNonIndexed() : g.clone();
    if (!keepUv) c.deleteAttribute('uv');
    return c;
  }));
}
/** 把 geometry 放到 a→b 这条线段上的圆锥 / 圆柱（半径 r0 在 a 端，r1 在 b 端）。 */
function cone(a, b, r0, r1, sides = 5) {
  const from = V(...a), to = V(...b), d = to.clone().sub(from);
  const g = new THREE.CylinderGeometry(r1, r0, d.length(), sides, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
  g.translate(...from.add(to).multiplyScalar(0.5).toArray());
  return g;
}
/** 沿折线的圆管（半径渐变）。 */
function tubeAlong(pts, r0, r1 = r0, { radial = 8, seg: n = 24 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : V(...p))));
  const g = new THREE.TubeGeometry(curve, n, 1, radial, false);
  const pos = g.attributes.position, nrm = g.attributes.normal, c = V();
  for (let i = 0; i <= n; i++) {
    const r = r0 + (r1 - r0) * (i / n);
    curve.getPointAt(i / n, c);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      pos.setXYZ(k, c.x + nrm.getX(k) * r, c.y + nrm.getY(k) * r, c.z + nrm.getZ(k) * r);
    }
  }
  g.computeVertexNormals();
  return g;
}
/** 叶片：长 len 沿 +x、宽 w，薄片带一点弯曲（中脉下凹）。 */
function leafGeo(len, w, { depth = 0.003, bend = 0.25, base = 0.35, curve = 7 } = {}) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(len * base, w * 0.62, len * 0.7, w * 0.55, len, 0);
  s.bezierCurveTo(len * 0.7, -w * 0.55, len * base, -w * 0.62, 0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.35, bevelSize: depth * 0.35, bevelSegments: 1, curveSegments: curve });
  g.translate(0, 0, -depth / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, p.getZ(i) + (y / (w * 0.5)) ** 2 * w * 0.18 + Math.sin((x / len) * Math.PI) * len * bend * 0.12);
  }
  g.computeVertexNormals();
  return g;
}
/** 暖色的柔光片（无光照、加法混合、不挡点击），花开 / 蜂蜜一闪用。 */
function glowPlane(parent, size, color = '#ffe39a', name = 'glow') {
  const tex = cached('p3:forest:glowtex', () => canvasTexture(128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }, { wrap: false }));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), unlit(color, { map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.name = name; m.visible = false; m.renderOrder = 5; m.raycast = () => {};
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------------------------------------
// 捕蝇草（参考 00:32 饿着、03:30–03:36 喂食、09:04–09:16 喂完开花、09:16 花被摘走）
// 约 0.8 高；底部一圈细长叶，四根弯茎各顶一个捕虫夹，中间一根直茎顶着披针形花苞。
// 夹子 = 两片半椭圆的叶瓣（铰链在直边上）：张开时 A 瓣朝向镜头（内侧红、带深色“梳齿”），B 瓣绕铰链竖起来（从正面看是一条绿边），
// 夹缘一圈尖刺；吃饱后 B 瓣合上，从正面看是一片浅绿色的椭圆叶，中间一个浅色圆斑（03:35 / 09:08）。
// ---------------------------------------------------------------------------------------------

const TRAP = { W: 0.14, H: 0.165, depth: 0.03, th: 0.01, open: 1.45 };
/** 四个夹子：茎尖位置、绕 z 的朝向 φ（叶瓣局部 +x 沿铰链、+y 指向夹口弧线一侧）、叶瓣中心沿局部 x 的偏移系数、茎的控制点。 */
const TRAP_CFG = [
  { tip: [0.141, 0.389, 0.03], phi: -0.49, ox: 1, path: [[0.045, 0.02, 0], [0.062, 0.214, 0.012], [0.079, 0.344, 0.022], [0.141, 0.389, 0.03]] },     // 0 右下（先吃）
  { tip: [0.107, 0.518, -0.015], phi: -1.95, ox: -1, path: [[0.028, 0.02, 0], [0.037, 0.237, -0.004], [0.062, 0.395, -0.01], [0.107, 0.518, -0.015]] }, // 1 右上
  { tip: [-0.085, 0.518, -0.02], phi: 1.86, ox: 1, path: [[-0.028, 0.02, 0], [-0.042, 0.214, -0.01], [-0.062, 0.361, -0.016], [-0.085, 0.518, -0.02]] }, // 2 左上
  { tip: [-0.163, 0.361, 0.04], phi: -0.04, ox: -1, path: [[-0.039, 0.02, 0], [-0.073, 0.18, 0.02], [-0.107, 0.293, 0.032], [-0.163, 0.361, 0.04]] },   // 3 左下
];
const BUD = { base: [0.006, 0.524, 0], len: 0.17 };
const FLOWER_Y = 0.31;   // 花（物品，放大 1.25 倍）原点：茎的中段，只有花簇露在茎顶之上

/** 叶瓣的几何：{ inner（内侧，贴红色梳齿贴图）, shell（外壳 + 边缘一圈厚度）, teeth（夹缘尖刺）}，flip = B 瓣（绕 y 转 180°）。 */
function lobeGeos(flip) {
  return cached(`p3:forest:lobe:${flip}`, () => {
    const { W, H, depth, th } = TRAP, nR = 7, nU = 24;
    const zIn = (x, y) => -depth * Math.max(0, 1 - (x / W) ** 2 - (y / H) ** 2) * smooth(y / (0.5 * H));
    const id = (ri, ui) => ri * (nU + 1) + ui;
    const inPos = [], outPos = [], uv = [];
    for (let ri = 0; ri <= nR; ri++) for (let ui = 0; ui <= nU; ui++) {
      const r = ri / nR, u = (ui / nU) * Math.PI;
      const x = W * r * Math.cos(u), y = H * r * Math.sin(u), z = zIn(x, y);
      inPos.push(x, y, z); outPos.push(x, y, z - th); uv.push(x / (2 * W) + 0.5, y / H);
    }
    const quadIdx = [], quadIdxFlip = [];
    for (let ri = 0; ri < nR; ri++) for (let ui = 0; ui < nU; ui++) {
      const a = id(ri, ui), b = id(ri + 1, ui), c = id(ri, ui + 1), d = id(ri + 1, ui + 1);
      quadIdx.push(a, b, c, c, b, d); quadIdxFlip.push(a, c, b, c, d, b);
    }
    const inner = new THREE.BufferGeometry();
    inner.setAttribute('position', new THREE.Float32BufferAttribute(inPos, 3));
    inner.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    inner.setIndex(quadIdx); inner.computeVertexNormals();
    // 外壳：外表面 + 沿边缘一圈把内外表面连起来
    const n = inPos.length / 3;
    const shell = new THREE.BufferGeometry();
    shell.setAttribute('position', new THREE.Float32BufferAttribute([...outPos, ...inPos], 3));
    shell.setAttribute('uv', new THREE.Float32BufferAttribute([...uv, ...uv], 2));
    const loop = [];
    for (let ui = 0; ui <= nU; ui++) loop.push(id(nR, ui));
    for (let ri = nR - 1; ri >= 0; ri--) loop.push(id(ri, nU));
    for (let ri = 1; ri < nR; ri++) loop.push(id(ri, 0));
    loop.push(id(nR, 0));
    const idx = [...quadIdxFlip];
    for (let i = 0; i < loop.length - 1; i++) {
      const a = loop[i], b = loop[i + 1];
      idx.push(a, b, b + n, a, b + n, a + n);
    }
    shell.setIndex(idx); shell.computeVertexNormals();
    // 夹缘尖刺：沿弧线均匀排布，朝外并向 +z 微倾（A、B 合上时错开咬合）
    const teeth = [], N = 19, R = rng(5);
    for (let i = 0; i < N; i++) {
      const u = Math.PI * (0.035 + 0.93 * (i / (N - 1)));
      const px = W * Math.cos(u), py = H * Math.sin(u);
      const dir = V(Math.cos(u) / W, Math.sin(u) / H, 0).normalize();
      dir.z = 0.55; dir.normalize();
      const len = 0.04 + R() * 0.02;
      const a = V(px, py, -th * 0.4).addScaledVector(dir, -0.004), b = a.clone().addScaledVector(dir, len);
      teeth.push(cone(a.toArray(), b.toArray(), 0.0078, 0.0006, 5));
    }
    const teethGeo = mergeGeos(teeth);
    const out = { inner, shell, teeth: teethGeo };
    if (flip) for (const g of Object.values(out)) { g.rotateY(Math.PI); g.computeVertexNormals(); }
    return out;
  });
}

/** 夹子内侧贴图：绿边 + 红色半椭圆 + 一圈深色梳齿线（对照 03:30 的特写）。 */
function trapInnerTexture() {
  return cached('p3:forest:trap_inner', () => canvasTexture(256, 256, (g, S) => {
    const cx = S / 2, cy = S * 0.985;
    g.fillStyle = '#7c8c3a'; g.fillRect(0, 0, S, S);
    const ell = (k, color) => { g.fillStyle = color; g.beginPath(); g.ellipse(cx, cy, S * 0.5 * k, S * 0.985 * k, 0, Math.PI, TAU); g.closePath(); g.fill(); };
    ell(0.91, '#aa6c5e'); ell(0.74, '#975c50'); ell(0.5, '#834c42');
    g.lineCap = 'round';
    const N = 13;
    for (let i = 0; i < N; i++) {
      const a = Math.PI * (0.1 + 0.8 * (i / (N - 1))), wob = Math.sin(i * 2.3) * 0.02;
      const p = (k) => [cx + Math.cos(a + wob * k) * S * 0.5 * k, cy - Math.sin(a + wob * k) * S * 0.985 * k];
      g.strokeStyle = '#2a0f0b'; g.lineWidth = S * (0.046 - 0.014 * Math.abs(i - N / 2) / (N / 2));
      g.beginPath(); g.moveTo(...p(0.88)); g.lineTo(...p(i % 2 ? 0.42 : 0.5)); g.stroke();
    }
  }, { wrap: false }));
}
/** 吃饱的夹子外壳贴图：浅绿 + 中间一圈浅色圆斑 + 偏心的橄榄色斑（03:35）。 */
function trapSatedTexture() {
  return cached('p3:forest:trap_sated', () => canvasTexture(256, 256, (g, S) => {
    g.fillStyle = '#93a458'; g.fillRect(0, 0, S, S);
    const grd = g.createLinearGradient(0, S, 0, 0);
    grd.addColorStop(0, 'rgba(70,86,28,0.5)'); grd.addColorStop(0.35, 'rgba(70,86,28,0)'); g.fillStyle = grd; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#a8b774'; g.lineWidth = S * 0.05; g.beginPath(); g.arc(S * 0.46, S * 0.6, S * 0.17, 0, TAU); g.stroke();
    g.fillStyle = '#869b34'; g.beginPath(); g.ellipse(S * 0.56, S * 0.6, S * 0.07, S * 0.1, 0.3, 0, TAU); g.fill();
  }, { wrap: false }));
}
const trapMats = () => cached('p3:forest:trap_mats', () => ({
  inner: tmat('#ffffff', { map: trapInnerTexture(), outline: 0.003 }),
  shell: tmat('#7a8c46', { side: THREE.DoubleSide, outline: 0.009 }),
  sated: tmat('#ffffff', { map: trapSatedTexture(), side: THREE.DoubleSide, outline: 0.009 }),
  teeth: tmat('#1b2311', { outline: false }),
  leaf: tmat('#778a47', { outline: 0.009 }),
  stalk: tmat('#7d9150', { outline: 0.009 }),
  sepal: tmat('#7c9048', { side: THREE.DoubleSide, outline: 0.008 }),
  prey: tmat('#191715', { outline: 0.003 }),
}));
/** 被夹住的一小团黑蚊子（没有传入 prey 时用）。 */
function preyBlobGeo() {
  return cached('p3:forest:preyblob', () => {
    const R = rng(17), parts = [lumpGeo(0.022, { seed: 3, amp: 0.1, squash: [1.4, 0.7, 1], w: 12, h: 8 })];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < 9; i++) {
      const g = mosquitoGeometry30().clone();
      e.set(R() * TAU, R() * TAU, R() * TAU); q.setFromEuler(e);
      m.compose(V((R() - 0.5) * 0.05, (R() - 0.5) * 0.03, (R() - 0.5) * 0.03), q, V(1, 1, 1));
      g.applyMatrix4(m); parts.push(g);
    }
    return mergeGeos(parts);
  });
}

function makeFlytrap() {
  const root = group('p3_flytrap');
  const plant = group('flytrap_plant', root);
  const M = trapMats();
  contactShadow(root, 0.3, 0.22, { opacity: 0.3 });
  // 底部叶丛：九片细长叶，从根部向四周斜着伸出
  const leaves = [], R = rng(23);
  for (let i = 0; i < 9; i++) {
    const g = leafGeo(0.17 + R() * 0.1, 0.05 + R() * 0.016, { depth: 0.005, bend: 0.5 });
    const yaw = (i / 9) * TAU + R() * 0.4, pitch = 0.5 + R() * 0.75;
    g.rotateZ(pitch); g.rotateY(yaw); g.translate(0, 0.008, 0);
    leaves.push(g);
  }
  mesh(plant, mergeGeos(leaves), M.leaf, 'flytrap_leaves');
  // 茎：四根弯茎 + 中间直茎
  const stalkGeos = TRAP_CFG.map((c, i) => tubeAlong(c.path.map((p) => V(...p)), 0.015, 0.0105, { radial: 7, seg: 22 }));
  stalkGeos.push(tubeAlong([V(0.003, 0.01, 0), V(0.004, 0.26, 0), V(BUD.base[0], BUD.base[1] + 0.01, 0)], 0.0125, 0.0095, { radial: 7, seg: 16 }));
  stalkGeos.push(new THREE.SphereGeometry(0.0098, 8, 6).translate(BUD.base[0], BUD.base[1] + 0.01, 0));   // 茎顶圆头（花苞 / 花拿走后露出来）
  mesh(plant, mergeGeos(stalkGeos), M.stalk, 'flytrap_stalks');
  // 花苞：四片披针形萼片围成一个杏仁形，开花时向外张开
  const bud = group('flytrap_bud', plant, BUD.base);
  const sepals = [];
  for (let i = 0; i < 4; i++) {
    const yawG = group(`sepal_${i}`, bud); yawG.rotation.y = (i / 4) * TAU;
    const hinge = group('hinge', yawG, [0.012, 0, 0]);
    const g = leafGeo(BUD.len, 0.07, { depth: 0.004, bend: 0.1, base: 0.36 }); g.rotateZ(Math.PI / 2); g.translate(-0.0, 0, 0);
    mesh(hinge, g, M.sepal, 'sepal_leaf');
    sepals.push(hinge);
  }
  // 花（捕蝇草开出的黄橙色花簇）
  const flower = ITEMS.p3_flower_yellow(); flower.name = 'flytrap_flower'; flower.position.set(BUD.base[0], FLOWER_Y, 0); flower.visible = false;
  flower.traverse((n) => { if (n.name === 'flower_leaf') n.visible = false; });
  plant.add(flower);
  const glow = glowPlane(plant, 0.55, '#ffd98a', 'flytrap_glow'); glow.position.set(BUD.base[0], BUD.base[1] + 0.13, 0.05);
  // 四个捕虫夹
  const A = lobeGeos(false), B = lobeGeos(true);
  const traps = TRAP_CFG.map((c, i) => {
    const t = group(`trap_${i}`, plant, c.tip); t.rotation.z = c.phi;
    const hinge = group('trap_hinge', t, [c.ox * TRAP.W, 0, 0]);
    const lobeA = group('lobe_a', hinge), lobeB = group('lobe_b', hinge);
    const parts = { A: {}, B: {} };
    for (const [key, lobe, geo] of [['A', lobeA, A], ['B', lobeB, B]]) {
      parts[key].inner = mesh(lobe, geo.inner, M.inner, 'lobe_inner');
      parts[key].shell = mesh(lobe, geo.shell, M.shell, 'lobe_shell');
      parts[key].teeth = mesh(lobe, geo.teeth, M.teeth, 'lobe_teeth');
    }
    const prey = group('trap_prey', hinge, [0, TRAP.H * 0.4, -0.012]);
    mesh(prey, preyBlobGeo(), M.prey, 'trap_prey_blob');
    prey.visible = false;
    return { g: t, hinge, lobeA, lobeB, parts, prey, phi: c.phi, ph: R() * TAU, held: null };
  });
  hit(root, 'flytrap_hit', [0.62, 0.78, 0.24], [0, 0.39, 0]);
  const flowerHit = hit(root, 'flytrap_flower_hit', [0.18, 0.18, 0.3], [BUD.base[0], BUD.base[1] + 0.1, 0.05]);    // 比 flytrap_hit 往前凸出，射线先打到花

  const S = { fed: 0, bloomed: false, flowerTaken: false };
  let sway = 1;
  // —— 姿势 ——
  const setSated = (tr, sated) => {
    for (const k of ['A', 'B']) tr.parts[k].shell.material = sated ? M.sated : M.shell;
  };
  const poseTrap = (tr, close, chew = 0) => { tr.lobeB.rotation.x = lerp(TRAP.open, 0, close) + chew; };
  const poseBud = (open, gone = 0) => {
    sepals.forEach((h) => { h.rotation.z = -lerp(-0.1, 0.8, open); h.parent.scale.setScalar(Math.max(0.001, 1 - gone)); h.parent.visible = gone < 0.999; });
    bud.visible = gone < 0.999;
  };
  const showFlower = (k, taken) => {
    flower.visible = k > 0.001 && !taken;
    const s = lerp(0.35, 1.25, smooth(k));
    flower.scale.setScalar(s);
    flower.position.y = FLOWER_Y - (1 - smooth(k)) * 0.05;
  };
  const apply = () => {
    traps.forEach((tr, i) => {
      const sated = i < S.fed;
      poseTrap(tr, sated ? 1 : 0); setSated(tr, sated); tr.prey.visible = false;
      const blob = tr.prey.getObjectByName('trap_prey_blob'); if (blob) blob.visible = !tr.held;
      if (tr.held) { tr.held.visible = false; if (!sated) { tr.held.removeFromParent(); tr.held = null; } }
    });
    poseBud(S.bloomed ? 1 : 0, S.bloomed ? 1 : 0);
    showFlower(S.bloomed ? 1 : 0, S.flowerTaken);
    flowerHit.visible = S.bloomed && !S.flowerTaken;
    glow.visible = false;
  };
  root.setState = (st = {}) => {
    S.fed = clamp((st.fed ?? 0) / 4) * 4 | 0; S.bloomed = !!st.bloomed; S.flowerTaken = !!st.flowerTaken;
    apply();
  };
  root.getState = () => ({ ...S });
  // —— 动画 ——
  /** 喂食：下一个饥饿的夹子（固定顺序 0→3）咬住 prey（传入的物品模型会挂进夹子里再隐藏），嚼约 1.2 秒后合拢变成浅绿色。 */
  root.feed = (prey = null, opts = {}) => {
    if (typeof prey === 'object' && prey && !prey.isObject3D) { opts = prey; prey = null; }
    const i = S.fed; if (i >= TRAP_CFG.length) return Promise.resolve();
    const tr = traps[i];
    S.fed = i + 1;
    if (tr.held) { tr.held.visible = false; tr.held = null; }
    let fit = 1;
    if (prey && prey.isObject3D) {
      prey.removeFromParent();
      prey.position.set(0, 0, 0); prey.rotation.set(0, 0, 0); prey.scale.setScalar(1); prey.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(prey).getSize(V()), mx = Math.max(size.x, size.y, size.z, 1e-4);
      fit = 0.12 / mx;
      tr.prey.children.forEach((c) => { c.visible = false; });
      tr.prey.add(prey); tr.held = prey; prey.visible = true; prey.position.set(0, 0, 0);
    } else tr.prey.children.forEach((c) => { c.visible = c !== tr.held; });
    if (opts.instant) { apply(); return Promise.resolve(); }
    const body = opts.ms ?? 2300;
    return animate(body, (k) => {
      const kIn = seg(k, 0, 0.16), kClose = seg(k, 0.16, 0.33), kChew = seg(k, 0.33, 0.86);
      tr.prey.visible = k < 0.62;
      const sc = lerp(0.2, 1, smooth(kIn)) * (tr.held ? fit : 1);
      (tr.held || tr.prey).scale.setScalar(tr.held ? sc : lerp(0.2, 1, smooth(kIn)));
      const chew = kChew > 0 && kChew < 1 ? Math.abs(Math.sin(kChew * TAU * 3)) * 0.2 * (1 - kChew * 0.5) : 0;
      poseTrap(tr, Ease.inCubic(kClose), chew);
      const squash = kChew > 0 && kChew < 1 ? 1 + Math.sin(kChew * TAU * 3) * 0.035 : 1;
      tr.hinge.scale.set(1, squash, 1);
      setSated(tr, k > 0.55);
      if (k > 0.62 && tr.held) tr.held.visible = false;
    }, Ease.linear).then(() => { tr.hinge.scale.set(1, 1, 1); apply(); });
  };
  /** 花苞张开，长出黄色的花（暖光一闪）。 */
  root.bloom = (opts = {}) => {
    S.bloomed = true;
    if (opts.instant) { apply(); return Promise.resolve(); }
    glow.visible = true; flowerHit.visible = false;
    return animate(1500, (k) => {
      poseBud(Ease.outCubic(seg(k, 0, 0.5)), smooth(seg(k, 0.5, 0.9)));
      showFlower(seg(k, 0.25, 0.95), S.flowerTaken);
      glow.material.opacity = Math.sin(clamp(k) * Math.PI) * 0.9; glow.scale.setScalar(1 + k * 0.4);
    }, Ease.linear).then(() => { glow.visible = false; glow.scale.setScalar(1); apply(); });
  };
  /** 摘走花：花缩小消失，花苞的萼片还张开着。 */
  root.takeFlower = (opts = {}) => {
    S.flowerTaken = true; flowerHit.visible = false;
    if (opts.instant) { apply(); return Promise.resolve(); }
    return animate(450, (k) => {
      flower.scale.setScalar(lerp(1, 0.2, Ease.inCubic(k)));
      flower.position.y = FLOWER_Y + k * 0.05;
    }, Ease.linear).then(apply);
  };
  /** 每帧：整株轻微摇摆，饥饿的夹子慢慢张合（呼吸）。 */
  root.update = (dt, t) => {
    plant.rotation.z = Math.sin(t * 0.8) * 0.011 * sway;
    plant.rotation.x = Math.sin(t * 0.6 + 1) * 0.007 * sway;
    traps.forEach((tr, i) => {
      tr.g.rotation.z = tr.phi + Math.sin(t * 0.9 + tr.ph) * 0.02 * sway;
      if (i >= S.fed && !tr.busy) tr.lobeB.rotation.x = TRAP.open + Math.sin(t * 0.7 + tr.ph * 2) * 0.05;
    });
  };
  root.setState({});
  return root;
}

// ---------------------------------------------------------------------------------------------
// 红叉大树（参考 00:38、00:40 红叉；05:00–05:02 砍倒）
// 和岛上森林树干同风格：粗、直、带竖条纹树皮、底部有板根；正面离地约 2.2 m 处一个红漆大 X（约 0.7 m 宽、带往下淌的漆痕，
// 原作特写里 X 在树干中上部，约占树干宽度的一半）。
// 砍树：在右前方 0.85 m 高处砍出缺口（三级，越砍越深，缺口里是浅色新木，下沿水平、上沿斜收）；倒下：缺口以上的树干向后（−z）倒、淡出，留一个矮树桩。
// 原点在树干中心的地面，正面 +z；高 9 m（镜头看不到顶）。
// ---------------------------------------------------------------------------------------------

const XT = { R: 0.7, H: 9, lobes: 4, phase: 0.6, buttress: 0.3, yc: 0.85, notchA: 1.15, notchHalf: 0.56, depths: [0, 0.2, 0.4, 0.62], N: 56 };
/** 树干在高度 y、方位 a（a = 0 为正面 +z，向 +x 转为正）的半径：板根 + 缓慢收细。 */
function trunkR(y, a) {
  const yy = Math.max(0, y);
  let r = XT.R * (1 + 0.62 * Math.exp(-yy / 0.55));
  r *= 1 + XT.buttress * Math.exp(-yy / 0.75) * Math.pow(Math.max(0, Math.cos(XT.lobes * a + XT.phase)), 2);
  return r * (1 - 0.28 * (y / XT.H));
}
const wrapAngle = (d) => Math.atan2(Math.sin(d), Math.cos(d));
/** 缺口处往里凹多少：下沿水平、上沿斜着收回树皮，左右两侧渐渐收窄。 */
function notchInset(y, a, depth) {
  if (depth <= 0) return 0;
  const dy = y - XT.yc, hW = depth * 1.25 + 0.02;
  if (dy < 0 || dy >= hW) return 0;
  const g = 1 - smooth((Math.abs(wrapAngle(a - XT.notchA)) - 0.2) / (XT.notchHalf - 0.2));
  return depth * g * (1 - dy / hW);
}

/** 树皮：浅灰褐底 + 细密的深色竖纹（参考 00:40 的树干），横向可无缝拼接。 */
function xBarkTexture() {
  return cached('p3:forest:xbark', () => canvasTexture(256, 512, (g, w, h) => {
    const r = rng(41);
    g.fillStyle = '#a39d90'; g.fillRect(0, 0, w, h);
    g.lineCap = 'round';
    const line = (x0, amp, n, ph, lw, color) => {
      for (const off of [-w, 0, w]) {
        g.strokeStyle = color; g.lineWidth = lw; g.beginPath();
        for (let y = -8; y <= h + 8; y += 16) {
          const x = x0 + off + amp * Math.sin((TAU * n * y) / h + ph);
          if (y < 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
    };
    for (let i = 0; i < 26; i++) line(r() * w, 0.4 + r() * 0.8, 1 + ((r() * 2) | 0), r() * 6, 4 + r() * 8, `rgba(196,190,176,${0.18 + r() * 0.25})`);   // 浅色宽条
    for (let i = 0; i < 96; i++) line(r() * w, 0.3 + r() * 1.0, 1 + ((r() * 3) | 0), r() * 6, 0.9 + r() * 1.5, `rgba(66,62,56,${0.32 + r() * 0.5})`);      // 深色细纹
    for (let i = 0; i < 9; i++) line(r() * w, 0.8, 2, r() * 6, 2 + r() * 2.5, 'rgba(48,43,36,0.5)');
  }));
}
/** 断面的年轮：浅色新木 + 一圈圈深色年轮（树桩顶面）。 */
function ringTexture() {
  return cached('p3:forest:rings', () => canvasTexture(256, 256, (g, S) => {
    g.fillStyle = '#dcc08a'; g.fillRect(0, 0, S, S);
    const r = rng(9);
    for (let i = 1; i < 14; i++) {
      g.strokeStyle = `rgba(150,112,60,${0.35 + r() * 0.3})`; g.lineWidth = 1.2 + r() * 1.5;
      g.beginPath(); g.ellipse(S / 2 + (r() - 0.5) * 4, S / 2 + (r() - 0.5) * 4, i * 8.4, i * 8.4 * (0.95 + r() * 0.08), 0, 0, TAU); g.stroke();
    }
    g.fillStyle = 'rgba(120,86,44,0.5)'; g.beginPath(); g.arc(S / 2, S / 2, 5, 0, TAU); g.fill();
  }, { wrap: false }));
}
/** 红漆大 X（带淌痕）：shared 里的 symbolTexture 只有 ⊙ / ⊕，这里用同样的手绘笔触和颜色 #b8231d 画 X。 */
function xMarkTexture() {
  return cached('p3:forest:xmark', () => canvasTexture(256, 384, (g, w, h) => {
    const r = rng(61), color = '#b8231d';
    g.clearRect(0, 0, w, h);
    const stroke = (pts, lw) => {
      g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
      pts.forEach(([x, y], i) => { const jx = (r() - 0.5) * lw * 0.3, jy = (r() - 0.5) * lw * 0.3; if (i) g.lineTo(x + jx, y + jy); else g.moveTo(x + jx, y + jy); });
      g.stroke();
    };
    stroke([[44, 40], [92, 100], [138, 160], [186, 222], [210, 258]], 24);
    stroke([[212, 28], [168, 92], [122, 160], [78, 226], [44, 270]], 22);
    for (const [x, y0, len] of [[50, 268, 74], [112, 188, 110], [204, 254, 52], [150, 212, 38]]) {
      stroke([[x, y0], [x + (r() - 0.5) * 3, y0 + len]], 7 + r() * 3);
      g.fillStyle = color; g.beginPath(); g.arc(x, y0 + len, 6.5, 0, TAU); g.fill();
    }
  }, { wrap: false }));
}

/** 树干网格的一圈圈顶点（y 自下而上），ys 给出每圈高度，inset(y, a) 给出往里凹的量。 */
function trunkRings(ys, inset = null) {
  const N = XT.N, pos = [], uv = [], idx = [];
  ys.forEach((y, i) => {
    for (let j = 0; j <= N; j++) {
      const a = (j / N) * TAU;
      const r = trunkR(y, a) - (inset ? inset(y, a) : 0);
      pos.push(Math.sin(a) * r, y, Math.cos(a) * r); uv.push((j / N) * 2.6, y / 4.2);
    }
    if (i) for (let j = 0; j < N; j++) {
      const a = (i - 1) * (N + 1) + j, b = a + 1, c = i * (N + 1) + j, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  fixSeam(g, ys.length, N);
  return g;
}
/** 接缝（第一列和最后一列）的法线取平均，避免出现一条竖线。 */
function fixSeam(g, rings, N) {
  const n = g.attributes.normal, v = V();
  for (let i = 0; i < rings; i++) {
    const a = i * (N + 1), b = a + N;
    v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
}
/** 圆形断面（朝上 / 朝下）：中心一点 + 一圈顶点，ringXZ = 树干那一圈顶点的 [x,z] 数组。 */
function capGeo(y, ringXZ, up) {
  const N = ringXZ.length, pos = [0, y, 0], uv = [0.5, 0.5], idx = [];
  ringXZ.forEach(([x, z]) => { pos.push(x, y, z); uv.push(x / 2.2 + 0.5, z / 2.2 + 0.5); });
  for (let j = 0; j < N - 1; j++) idx.push(...(up ? [0, 1 + j, 2 + j] : [0, 2 + j, 1 + j]));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** 贴着树干表面的一块曲面（红 X 用）：a0..a1 方位、y0..y1 高度，沿法线外扩 off。 */
function surfacePatch(y0, y1, a0, a1, nu = 14, nv = 18, off = 0.004) {
  const pos = [], uv = [], idx = [];
  for (let iv = 0; iv <= nv; iv++) for (let iu = 0; iu <= nu; iu++) {
    const y = lerp(y1, y0, iv / nv), a = lerp(a0, a1, iu / nu), r = trunkR(y, a) + off;
    pos.push(Math.sin(a) * r, y, Math.cos(a) * r); uv.push(iu / nu, 1 - iv / nv);
  }
  for (let iv = 0; iv < nv; iv++) for (let iu = 0; iu < nu; iu++) {
    const a = iv * (nu + 1) + iu, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function makeXTree() {
  const root = group('p3_x_tree');
  contactShadow(root, 1.5, 1.3, { opacity: 0.35 });
  const { yc } = XT;
  // 下半（树桩）：0 → yc，顶面是浅色断面
  const lowerYs = [0, 0.05, 0.11, 0.18, 0.26, 0.35, 0.45, 0.56, 0.67, 0.77, yc];
  const barkTex = xBarkTexture();
  const stumpMat = toon('#ffffff', { map: barkTex });
  const stump = new THREE.Mesh(trunkRings(lowerYs), stumpMat); stump.name = 'x_tree_stump'; stump.castShadow = stump.receiveShadow = true;
  root.add(stump);
  const ringXZ = (y) => Array.from({ length: XT.N + 1 }, (_, j) => { const a = (j / XT.N) * TAU, r = trunkR(y, a); return [Math.sin(a) * r, Math.cos(a) * r]; });
  const capMat = toon('#ffffff', { map: ringTexture(), outline: 0.003 });
  const stumpTop = new THREE.Mesh(capGeo(yc, ringXZ(yc), true), capMat); stumpTop.name = 'x_tree_stump_top'; root.add(stumpTop);
  // 上半：枢轴在缺口下沿的后侧，倒下时绕它向后转
  const pivot = group('x_tree_pivot', root, [0, yc, -0.45]);
  const upper = group('x_tree_upper', pivot, [0, -yc, 0.45]);
  const upYs = [yc]; for (let d = 0.04; d <= 0.84; d += 0.04) upYs.push(yc + d);
  upYs.push(1.9, 2.3, 2.7, 3.3, 4.2, 5.4, 6.8, 9);
  const uniforms = { uDepth: { value: 0 }, uYc: { value: yc }, uA0: { value: XT.notchA }, uHalf: { value: XT.notchHalf } };
  const upperMat = toon('#ffffff', { map: barkTex });
  upperMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vXPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvXPos = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vXPos; uniform float uDepth; uniform float uYc; uniform float uA0; uniform float uHalf;')
      .replace('#include <map_fragment>', `#include <map_fragment>
{ float aa = atan(vXPos.x, vXPos.z); float da = abs(aa - uA0); da = min(da, 6.2831853 - da);
  float g = 1.0 - smoothstep(0.2, uHalf, da);
  float dy = vXPos.y - uYc; float hW = uDepth * 1.25 + 0.02;
  float ins = (uDepth > 0.0 && dy > 0.0 && dy < hW) ? uDepth * g * (1.0 - dy / hW) : 0.0;
  if (ins > 0.004) { float st = 0.93 + 0.07 * sin(vXPos.y * 70.0 + aa * 9.0); diffuseColor.rgb = vec3(0.86, 0.72, 0.46) * st; } }`);
  };
  upperMat.customProgramCacheKey = () => 'p3_x_tree_bark';
  const upperGeo = trunkRings(upYs, null);
  const upperMesh = new THREE.Mesh(upperGeo, upperMat); upperMesh.name = 'x_tree_trunk'; upperMesh.castShadow = upperMesh.receiveShadow = true;
  upper.add(upperMesh);
  const upBottomMat = toon('#ffffff', { map: ringTexture(), outline: 0.003 });
  const upBottom = new THREE.Mesh(capGeo(yc, ringXZ(yc), false), upBottomMat); upBottom.name = 'x_tree_cut'; upper.add(upBottom);
  const upTopMat = toon('#ffffff', { map: barkTex });
  const upTop = new THREE.Mesh(capGeo(9, ringXZ(9), true), upTopMat); upper.add(upTop);
  // 红漆大 X：贴在树干表面（带淌痕）
  const markMat = unlit('#ffffff', { map: xMarkTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  const mark = new THREE.Mesh(surfacePatch(1.2, 2.78, -0.74, 0.74, 20, 24), markMat); mark.name = 'x_mark'; mark.raycast = () => {}; upper.add(mark);
  const treeHit = hit(root, 'x_tree_hit', [1.7, 2.6, 1.7], [0, 1.3, 0]);
  // 木屑
  const chipGeo = new THREE.BoxGeometry(0.06, 0.014, 0.034);
  const chips = new THREE.InstancedMesh(chipGeo, tmat('#d4b476', { outline: false }), 18);
  chips.name = 'x_chips'; chips.frustumCulled = false; chips.visible = false; chips.raycast = () => {}; root.add(chips);
  const R = rng(77), chipSeed = Array.from({ length: 18 }, () => ({ v: V((R() - 0.2) * 1.1, 0.5 + R() * 1.3, R() * 1.0 + 0.4), r: V(R() * 6, R() * 6, R() * 6), s: 0.6 + R() * 0.8 }));
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = V(), _s = V();

  const S = { cuts: 0, felled: false };
  const setDepth = (d) => {
    uniforms.uDepth.value = d;
    const p = upperGeo.attributes.position, N = XT.N;
    for (let i = 0; i < upYs.length && upYs[i] < yc + 0.9; i++) {
      for (let j = 0; j <= N; j++) {
        const a = (j / N) * TAU, r = trunkR(upYs[i], a) - notchInset(upYs[i], a, d), k = i * (N + 1) + j;
        p.setXYZ(k, Math.sin(a) * r, upYs[i], Math.cos(a) * r);
      }
    }
    p.needsUpdate = true; upperGeo.computeVertexNormals(); fixSeam(upperGeo, upYs.length, N);
    upperGeo.computeBoundingSphere(); upperGeo.computeBoundingBox();
    // 上半底面的断面跟着缺口收进去
    const cp = upBottom.geometry.attributes.position;
    for (let j = 0; j <= N; j++) cp.setXYZ(1 + j, p.getX(j), yc, p.getZ(j));
    cp.needsUpdate = true; upBottom.geometry.computeBoundingSphere();
  };
  const fadeMats = [upperMat, upBottomMat, upTopMat, markMat];
  const poseFall = (k) => {
    // 先稍稍后仰，再加速倒下；后半段淡出
    pivot.rotation.x = -Math.pow(k, 2.2) * 1.45;
    const a = 1 - smooth(seg(k, 0.5, 1));
    for (const m of fadeMats) {
      m.transparent = a < 0.999 || m === markMat; m.opacity = a;
      if (m.userData.outlineParameters) m.userData.outlineParameters.alpha = a;
    }
  };
  const apply = () => {
    setDepth(XT.depths[S.cuts]);
    chips.visible = false;
    pivot.rotation.set(0, 0, 0);
    poseFall(S.felled ? 1 : 0);
    if (!S.felled) pivot.rotation.x = 0;
    pivot.visible = !S.felled;
    treeHit.visible = !S.felled;
  };
  root.setState = (st = {}) => { S.cuts = clamp((st.cuts ?? 0) / 3) * 3 | 0; S.felled = !!st.felled; apply(); };
  root.getState = () => ({ ...S });
  /** 砍一下：缺口加深一级（0 → 3），飞出木屑，树干晃一晃。 */
  root.chop = (opts = {}) => {
    if (S.felled || S.cuts >= 3) return Promise.resolve();
    const from = XT.depths[S.cuts], to = XT.depths[++S.cuts];
    if (opts.instant) { apply(); return Promise.resolve(); }
    const base = V(Math.sin(XT.notchA) * 0.62, yc + 0.18, Math.cos(XT.notchA) * 0.62);
    chips.visible = true;
    return animate(650, (k) => {
      setDepth(lerp(from, to, smooth(seg(k, 0, 0.35))));
      pivot.rotation.x = Math.sin(k * 26) * 0.004 * (1 - k);
      chipSeed.forEach((c, i) => {
        const t = k * 0.9;
        _p.copy(base).addScaledVector(c.v, t * 0.8); _p.y -= 3.2 * t * t;
        _e.set(c.r.x * t, c.r.y * t, c.r.z * t); _q.setFromEuler(_e); _s.setScalar(Math.max(0.0001, c.s * (1 - Math.pow(k, 3))));
        _m.compose(_p, _q, _s); chips.setMatrixAt(i, _m);
      });
      chips.instanceMatrix.needsUpdate = true;
    }, Ease.linear).then(apply);
  };
  /** 倒下：缺口以上的树干向后（−z）倒下并淡出，只留矮树桩。 */
  root.fell = (opts = {}) => {
    if (S.felled) return Promise.resolve();
    S.felled = true; treeHit.visible = false;
    if (opts.instant) { apply(); return Promise.resolve(); }
    return animate(1700, (k) => poseFall(k), Ease.linear).then(apply);
  };
  root.setState({});
  return root;
}

// ---------------------------------------------------------------------------------------------
// 土堆（参考 00:48–00:52 土堆、09:56–10:02 挖开、12:18 只剩一团黏土）
// 棕色松土堆（约 0.7 宽 × 0.25 高，带颗粒，粗描边）。挖开后变成一个深褐色的扁椭圆坑（周围一圈翻出的土）+ 旁边的土堆，
// 坑里两团黏土（p3_clay）：先拿左边那团（clay_0），再拿右边那团（clay_1）。
// ---------------------------------------------------------------------------------------------

function soilTexture() {
  return cached('p3:forest:soil', () => canvasTexture(256, 256, (g, S) => {
    g.fillStyle = '#946a3f'; g.fillRect(0, 0, S, S);
    const r = rng(33);
    for (let i = 0; i < 120; i++) {
      const x = r() * S, y = r() * S, rad = 2 + r() * 4.5, dark = r() < 0.82;
      g.fillStyle = dark ? 'rgba(98,64,34,0.85)' : 'rgba(186,146,98,0.55)';
      for (const dx of [-S, 0, S]) { g.beginPath(); g.ellipse(x + dx, y, rad, rad * (0.7 + r() * 0.5), r() * 3, 0, TAU); g.fill(); }
    }
  }));
}
const soilMat = () => cached('p3:forest:soilmat', () => tmat('#ffffff', { map: soilTexture(), outline: 0.011 }));

function moundGeo() {
  return cached('p3:forest:moundgeo', () => {
    const parts = [], R = rng(8);
    const lump = (r, o, sq, seed) => { const g = lumpGeo(r, { seed, amp: 0.1, freq: 2.4, flatBottom: true, squash: sq, w: r > 0.15 ? 26 : 14, h: r > 0.15 ? 16 : 9 }); g.translate(...o); parts.push(g); };
    lump(0.3, [0, 0, 0], [1.2, 0.72, 0.95], 21);
    lump(0.2, [-0.17, 0, 0.02], [1, 0.95, 0.9], 22);
    lump(0.17, [0.2, 0, -0.02], [1, 0.6, 0.9], 23);
    lump(0.13, [-0.12, 0.15, 0.01], [1, 0.95, 0.95], 24); lump(0.1, [0.02, 0.17, 0], [1.1, 0.85, 0.9], 25); lump(0.085, [0.15, 0.1, 0.03], [1, 0.85, 0.9], 26); lump(0.07, [-0.27, 0.06, 0.05], [1, 0.85, 1], 27);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + R() * 0.4;
      lump(0.04 + R() * 0.02, [Math.cos(a) * 0.33, 0, Math.sin(a) * 0.2], [1, 0.6, 1], 30 + i);
    }
    return mergeGeos(parts, { keepUv: true });
  });
}
/** 挖出的坑口：一圈翻出的土（椭圆排布的小土块）。 */
function pitRimGeo() {
  return cached('p3:forest:pitrim', () => {
    const parts = [], R = rng(12);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, g = lumpGeo(0.03 + R() * 0.016, { seed: 50 + i, amp: 0.12, flatBottom: true, squash: [1.3, 0.5, 1], w: 12, h: 7 });
      g.translate(Math.cos(a) * 0.36, 0, Math.sin(a) * 0.205); parts.push(g);
    }
    return mergeGeos(parts, { keepUv: true });
  });
}
function sidePileGeo() {
  return cached('p3:forest:sidepile', () => {
    const parts = [];
    const lump = (r, o, sq, seed) => { const g = lumpGeo(r, { seed, amp: 0.1, flatBottom: true, squash: sq, w: 18, h: 11 }); g.translate(...o); parts.push(g); };
    lump(0.15, [0, 0, 0], [1.2, 0.75, 1], 61); lump(0.1, [-0.12, 0, 0.06], [1, 0.8, 1], 62); lump(0.08, [0.13, 0, -0.04], [1, 0.7, 1], 63);
    return mergeGeos(parts, { keepUv: true });
  });
}

const CLAY_S = V(1.45, 1.85, 1.45);   // 坑里的黏土：原作里是立着的圆顶（比物品模型更高）
function makeClayMound() {
  const root = group('p3_clay_mound');
  const SM = soilMat();
  contactShadow(root, 0.5, 0.34, { opacity: 0.28 });
  const mound = group('mound_body', root);
  mesh(mound, moundGeo(), SM, 'mound_lumps');
  // 挖开后：坑 + 翻出的土 + 两团黏土
  const pit = group('mound_pit', root);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.37, 40).rotateX(-Math.PI / 2).scale(1, 1, 0.56), umat('#3a2310'));
  hole.name = 'pit_floor'; hole.position.y = 0.006; hole.raycast = () => {}; pit.add(hole);
  mesh(pit, pitRimGeo(), SM, 'pit_rim');
  const pile = group('mound_pile', root, [0.55, 0, 0.05]);
  mesh(pile, sidePileGeo(), SM, 'pile_lumps');
  const clays = [-0.12, 0.12].map((x, i) => {
    const c = ITEMS.p3_clay(); c.name = `clay_${i}`; c.position.set(x, 0.03, 0); c.scale.copy(CLAY_S); c.rotation.y = i ? 0.6 : -0.3;
    root.add(c); return c;
  });
  const moundHit = hit(root, 'mound_hit', [0.8, 0.3, 0.55], [0, 0.14, 0]);
  const clayHits = [-0.12, 0.12].map((x, i) => hit(root, `clay_${i}_hit`, [0.2, 0.15, 0.2], [x, 0.075, 0]));
  // 挖土时飞出的土块
  const clodGeo = lumpGeo(0.028, { seed: 3, amp: 0.12, w: 10, h: 8 });
  const clods = new THREE.InstancedMesh(clodGeo, SM, 9); clods.name = 'mound_clods'; clods.frustumCulled = false; clods.visible = false; clods.raycast = () => {}; root.add(clods);
  const R = rng(19), clodSeed = Array.from({ length: 9 }, () => ({ x0: (R() - 0.5) * 0.3, t0: R() * 0.35, dur: 0.45 + R() * 0.3, h: 0.1 + R() * 0.12, z: (R() - 0.5) * 0.25 }));
  const _m = new THREE.Matrix4(), _p = V(), _q = new THREE.Quaternion(), _s = V();

  const S = { dug: false, clay: 2 };
  const poseDig = (k) => {                       // k 0 → 1：土堆塌下去、坑和旁边的土堆长出来
    const sink = smooth(seg(k, 0, 0.7));
    mound.visible = k < 0.999; mound.scale.set(1 + sink * 0.08, Math.max(0.001, 1 - sink), 1 + sink * 0.08);
    pit.visible = k > 0.15; const g = smooth(seg(k, 0.15, 0.8)); pit.scale.set(Math.max(0.001, g), 1, Math.max(0.001, g));
    pile.visible = k > 0.2; pile.scale.setScalar(Math.max(0.001, smooth(seg(k, 0.2, 0.9))));
    clays.forEach((c, i) => { c.visible = k > 0.6 && i >= 2 - S.clay; c.scale.copy(CLAY_S).multiplyScalar(smooth(seg(k, 0.6, 1))); });
    clods.visible = k > 0 && k < 1;
    clodSeed.forEach((c, i) => {
      const t = clamp((k - c.t0) / c.dur);
      _p.set(lerp(c.x0, 0.55, t), 0.05 + Math.sin(t * Math.PI) * c.h, c.z * (1 - t) + 0.05 * t); _s.setScalar(t > 0 && t < 1 ? 1 : 0.0001);
      _m.compose(_p, _q, _s); clods.setMatrixAt(i, _m);
    });
    clods.instanceMatrix.needsUpdate = true;
  };
  const apply = () => {
    poseDig(S.dug ? 1 : 0);
    mound.visible = !S.dug; pit.visible = S.dug; pile.visible = S.dug; clods.visible = false;
    clays.forEach((c, i) => { c.visible = S.dug && i >= 2 - S.clay; c.scale.copy(CLAY_S); c.position.y = 0.03; });
    clayHits.forEach((h, i) => { h.visible = S.dug && i >= 2 - S.clay; });
    moundHit.scale.y = S.dug ? 0.12 : 1; moundHit.position.y = S.dug ? 0.02 : 0.14;
  };
  root.setState = (st = {}) => { S.dug = !!st.dug; S.clay = clamp((st.clay ?? 2) / 2) * 2 | 0; apply(); };
  root.getState = () => ({ ...S });
  /** 挖开：土堆塌成一个坑，旁边翻出一堆土，坑里露出两团黏土。 */
  root.dig = (opts = {}) => {
    if (S.dug) return Promise.resolve();
    S.dug = true; S.clay = 2;
    if (opts.instant) { apply(); return Promise.resolve(); }
    moundHit.scale.y = 0.12; moundHit.position.y = 0.02;
    return animate(1000, poseDig, Ease.linear).then(apply);
  };
  /** 拿走一团黏土（先左后右）。 */
  root.takeClay = (opts = {}) => {
    if (!S.dug || S.clay <= 0) return Promise.resolve();
    const i = 2 - S.clay; S.clay--;
    clayHits[i].visible = false;
    if (opts.instant) { apply(); return Promise.resolve(); }
    const c = clays[i];
    return animate(450, (k) => { c.scale.copy(CLAY_S).multiplyScalar(1 - 0.8 * Ease.inCubic(k)); c.position.y = 0.03 + k * 0.18; }, Ease.linear).then(apply);
  };
  root.setState({});
  return root;
}

// ---------------------------------------------------------------------------------------------
// 蜂巢（参考 00:56、00:58 蜂巢特写；02:40–03:26 蜂孔闪红、蜜蜂爬出；03:22–03:26 流蜜）
// 挂在一根斜枝上的黄褐色蜂巢（约 0.5 宽 × 0.75 高）：顶部圆顶 + 6 道叠起来的圆环，环线往右下倾斜，环下一道深色阴影，表面浅色六边形斑点。
// 7 个蜂孔（深灰椭圆）：左侧一列 + 顶部两个；右侧中部另有一个出蜜小孔。原点是枝条顶端（一簇绿叶），蜂巢吊在它下面一点，
// 斜枝从原点往右下方伸出、挡在蜂巢右肩前面；另有一根细枝在蜂巢后面从左上方伸来。正面 +z。
// ---------------------------------------------------------------------------------------------

const HIVE = { off: [0.03, -0.06, 0], shear: -0.07 };
// 圆环：[高度, 圆环最宽处半径]；圆顶高 0.12，底部再收一个小圆底
const HIVE_RINGS = [[0.113, 0.24], [0.105, 0.248], [0.092, 0.255], [0.095, 0.258], [0.115, 0.252], [0.09, 0.215]];
/** 蜂巢轮廓（r, y 自上而下，y ≤ 0）及每道环线（groove）在轮廓上的下标 / 弧长。 */
function hiveProfile() {
  return cached('p3:forest:hiveprofile', () => {
    const pts = [], grooves = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([0.222 * Math.sqrt(1 - (1 - t) ** 2), -0.12 * t]); }   // 圆顶
    let y = -0.12, rPrev = 0.222;
    HIVE_RINGS.forEach(([h, rm], ri) => {
      const rTop = ri === 0 ? 0.215 : Math.min(rm, HIVE_RINGS[ri - 1][1]) - 0.022;
      const rBot = ri === HIVE_RINGS.length - 1 ? 0.13 : Math.min(rm, HIVE_RINGS[ri + 1][1]) - 0.022;
      grooves.push(pts.length);
      pts.push([rTop - 0.007, y]);                                      // 环线处往里一道缝
      for (let i = 1; i <= 8; i++) {
        const t = i / 8, base = lerp(rTop, rBot, t), bulge = Math.pow(Math.sin(Math.PI * t), 0.6) * (rm - (rTop + rBot) / 2) * 0.7;
        pts.push([base + bulge, y - h * t]);
      }
      y -= h; rPrev = rBot;
    });
    // 底部圆底
    for (let i = 1; i <= 5; i++) { const t = i / 5; pts.push([rPrev * Math.cos(t * Math.PI / 2), y - 0.03 * Math.sin(t * Math.PI / 2)]); }
    let acc = 0; const cum = [0];
    for (let i = 1; i < pts.length; i++) { acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(acc); }
    return { pts, grooves, cum, total: acc };
  });
}
/** 轮廓在高度 y（未倾斜）处的半径。 */
function hiveR(y) {
  const { pts } = hiveProfile();
  for (let i = 1; i < pts.length; i++) {
    if (y >= pts[i][1]) { const t = (y - pts[i - 1][1]) / (pts[i][1] - pts[i - 1][1] || -1e-6); return lerp(pts[i - 1][0], pts[i][0], clamp(t)); }
  }
  return 0.02;
}
/** 蜂巢表面上的一点：yS 是倾斜后的高度，theta 绕轴方位（0 = 正面，负 = 左），off 沿法线外推。返回 hive 局部坐标。 */
function hiveSurface(yS, theta, off = 0) {
  let y = yS;
  for (let i = 0; i < 3; i++) y = yS - HIVE.shear * hiveR(y) * Math.sin(theta);
  const r = hiveR(y), e = 0.004, dr = (hiveR(y - e) - hiveR(y + e)) / (2 * e) * -1;   // dr/dy
  const n = V(Math.sin(theta), -dr, Math.cos(theta)).normalize();
  const pos = V(Math.sin(theta) * r, y + HIVE.shear * Math.sin(theta) * r, Math.cos(theta) * r).addScaledVector(n, off);
  return { pos, n };
}
/** 7 个蜂孔（原作位置，对照 00:58 / 03:14）：yS = 倾斜后的高度，theta = 方位，size = 椭圆孔的宽 / 高，tilt = 椭圆倾角。
 *  pos / normal / hover 是相对整个道具原点（枝条顶端）的坐标：pos = 孔口中心，hover = 建议的蜜蜂盘旋点（蜂巢左前方）。 */
const HOLE_DEF = [
  { y: -0.04, th: -0.2, size: [0.034, 0.06], tilt: -0.25 },     // 0 顶部右
  { y: -0.081, th: -0.56, size: [0.034, 0.058], tilt: -0.2 },   // 1 顶部左
  { y: -0.178, th: -0.65, size: [0.034, 0.058], tilt: -0.18 },  // 2 左列由上往下
  { y: -0.269, th: -0.53, size: [0.034, 0.06], tilt: -0.12 },   // 3
  { y: -0.362, th: -0.32, size: [0.034, 0.06], tilt: -0.08 },   // 4
  { y: -0.447, th: -1.0, size: [0.034, 0.062], tilt: -0.1 },    // 5
  { y: -0.571, th: -0.96, size: [0.034, 0.06], tilt: -0.08 },   // 6
];
const HONEY_DEF = { y: -0.378, th: 0.74, size: [0.024, 0.026] };
const HIVE_OFF = V(...HIVE.off);
export const HIVE_HOLES = HOLE_DEF.map((h, i) => {
  const { pos, n } = hiveSurface(h.y, h.th, 0);
  const hover = pos.clone().addScaledVector(n, 0.3).add(V(-0.12, ((i % 3) - 1) * 0.05, 0.1)).add(HIVE_OFF);
  return { index: i, pos: pos.add(HIVE_OFF).toArray(), normal: n.toArray(), hover: hover.toArray(), size: h.size, tilt: h.tilt };
});

function hiveTexture() {
  return cached('p3:forest:hivetex', () => canvasTexture(512, 512, (g, S) => {
    const { cum, grooves } = hiveProfile(), ppm = S / 1.5;
    g.fillStyle = '#d8c27a'; g.fillRect(0, 0, S, S);
    // 六边形斑点（浅深相间，同色系）
    const R = rng(71);
    for (let i = 0; i < 360; i++) {
      const x = R() * S, y = R() * S, rad = 2.8 + R() * 2.4;
      g.fillStyle = R() < 0.7 ? 'rgba(168,140,62,0.4)' : 'rgba(232,212,140,0.4)';
      for (const dx of [-S, 0, S]) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(x + dx + Math.cos(a) * rad, y + Math.sin(a) * rad); } g.closePath(); g.fill(); }
    }
    // 每道环线下面一条深色阴影
    for (const gi of grooves) {
      const y0 = cum[gi] * ppm, h = 0.06 * ppm, grd = g.createLinearGradient(0, y0, 0, y0 + h);
      grd.addColorStop(0, 'rgba(130,106,40,0.6)'); grd.addColorStop(0.55, 'rgba(130,106,40,0.3)'); grd.addColorStop(1, 'rgba(130,106,40,0)');
      g.fillStyle = grd; g.fillRect(0, y0, S, h);
    }
  }));
}
function hiveBodyGeo() {
  return cached('p3:forest:hivebody', () => {
    const { pts, cum } = hiveProfile(), N = 56, pos = [], uv = [], idx = [];
    pts.forEach(([r0, y0], i) => {
      for (let j = 0; j <= N; j++) {
        const a = (j / N) * TAU, r = r0 * (1 + 0.022 * Math.sin(a * 3 + y0 * 18) + 0.012 * Math.sin(a * 5 - y0 * 25));
        const x = Math.sin(a) * r;
        pos.push(x, y0 + HIVE.shear * x, Math.cos(a) * r); uv.push(j / N, cum[i] / 1.5);
      }
      if (i) for (let j = 0; j < N; j++) { const a = (i - 1) * (N + 1) + j, b = a + 1, c = i * (N + 1) + j, d = c + 1; idx.push(a, c, b, b, c, d); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const n = g.attributes.normal, v = V();
    for (let i = 0; i < pts.length; i++) { const a = i * (N + 1), b = a + N; v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize(); n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z); }
    return g;
  });
}
/** 环线处的黑色描线（小圆环，倾斜和蜂巢一致）。 */
function grooveLinesGeo() {
  return cached('p3:forest:hivegrooves', () => {
    const { pts, grooves } = hiveProfile(), parts = [];
    for (const gi of grooves) {
      const [r, y] = pts[gi], g = new THREE.TorusGeometry(r + 0.003, 0.0045, 5, 48).rotateX(Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + y + HIVE.shear * p.getX(i));
      parts.push(g);
    }
    return mergeGeos(parts);
  });
}

/** 蜜蜂：黑头、毛茸茸的黑橙相间身体、半透明白翅（朝 +x，背朝 +y）。L = 体长。 */
function beeParts(L) {
  return cached(`p3:forest:bee:${L}`, () => {
    const col = (g, fn) => {
      const p = g.attributes.position, c = new Float32Array(p.count * 3), t = new THREE.Color();
      for (let i = 0; i < p.count; i++) { t.set(fn(p.getX(i) / L, p.getY(i) / L, p.getZ(i) / L)); c[i * 3] = t.r; c[i * 3 + 1] = t.g; c[i * 3 + 2] = t.b; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
    };
    const ell = (rx, ry, rz, x, y, z, fn) => { const g = new THREE.SphereGeometry(1, 12, 9); g.scale(rx * L, ry * L, rz * L); g.translate(x * L, y * L, z * L); return col(g, fn); };
    const parts = [];
    // 腹部：黑橙条纹（橙 / 黑交替）
    parts.push(ell(0.3, 0.23, 0.23, -0.2, -0.02, 0, (x) => { const k = Math.floor((x + 0.5) * 7.5); return k % 2 === 0 ? '#e2961f' : '#1c1713'; }));
    parts.push(ell(0.2, 0.2, 0.2, 0.14, 0.01, 0, (x, y) => (y > 0.08 ? '#d9a02e' : '#2a2018')));    // 胸：背上一片黄毛
    parts.push(ell(0.115, 0.115, 0.115, 0.36, -0.01, 0, () => '#17130f'));                          // 头
    for (const z of [-1, 1]) parts.push(ell(0.035, 0.05, 0.03, 0.42, 0.03, z * 0.07, () => '#d8d2c4'));    // 眼
    for (const z of [-1, 1]) {                                                                          // 触角
      const g = cone([0.4 * L, 0.04 * L, z * 0.03 * L], [0.56 * L, 0.14 * L, z * 0.09 * L], 0.012 * L, 0.006 * L, 4); parts.push(col(g, () => '#17130f'));
    }
    for (const [x, z] of [[0.18, 1], [0.1, 1], [0.02, 1], [0.18, -1], [0.1, -1], [0.02, -1]]) {                // 六条腿
      const g = cone([x * L, -0.14 * L, z * 0.1 * L], [(x - 0.1) * L, -0.27 * L, z * 0.17 * L], 0.016 * L, 0.011 * L, 4); parts.push(col(g, () => '#17130f'));
    }
    const body = mergeGeos(parts);
    // 翅膀：朝一侧（+z）伸出的叶形，根在胸背上；另一侧镜像
    const wing = leafGeo(0.62 * L, 0.26 * L, { depth: 0.0015, bend: 0, base: 0.4 }); wing.rotateX(-Math.PI / 2); wing.rotateY(-Math.PI / 2 - 0.45);   // 躺在 xz 平面、朝 +z 伸出并略向后掠
    return { body, wing };
  });
}
const beeMats = () => cached('p3:forest:beemats', () => ({
  body: tmat('#ffffff', { vertexColors: true, outline: 0.0035 }),
  wing: tmat('#eef3f6', { transparent: true, opacity: 0.72, side: THREE.DoubleSide, outline: 0.002 }),
}));
function makeBee(L) {
  const g = group('bee'), P = beeParts(L), M = beeMats();
  mesh(g, P.body, M.body, 'bee_body');
  const wings = [-1, 1].map((s) => {
    const h = group('bee_wing', g, [0.1 * L, 0.2 * L, s * 0.06 * L]);
    const w = mesh(h, P.wing, M.wing, 'bee_wing_mesh'); w.scale.z = s; w.castShadow = false;
    return h;
  });
  g.userData.wings = wings;
  return g;
}

function makeBeehive() {
  const root = group('p3_beehive');
  const hive = group('hive_body', root, HIVE.off);
  const bodyMat = tmat('#ffffff', { map: hiveTexture(), outline: 0.009 });
  mesh(hive, hiveBodyGeo(), bodyMat, 'hive_shell');
  mesh(hive, grooveLinesGeo(), tmat('#16140f', { outline: false }), 'hive_grooves');
  // 蜂孔：深灰椭圆（每个孔一份材质，闪红时单独变色）
  const holeShape = (w, h) => { const s = new THREE.Shape(); s.absellipse(0, 0, w / 2, h / 2, 0, TAU, false, 0); return s; };
  const holes = HOLE_DEF.map((h, i) => {
    const mat = toon('#1d1d20', { outline: 0.0045 });
    const { pos, n } = hiveSurface(h.y, h.th, -0.004);
    const g = new THREE.ExtrudeGeometry(holeShape(...h.size), { depth: 0.012, bevelEnabled: false, curveSegments: 16 });
    const m = new THREE.Mesh(g, mat); m.name = `hive_hole_mesh_${i}`; m.position.copy(pos); m.lookAt(pos.clone().add(n)); m.rotateZ(h.tilt);
    m.raycast = () => {}; hive.add(m);
    return { m, mat };
  });
  const honeyPt = hiveSurface(HONEY_DEF.y, HONEY_DEF.th, -0.003);
  const honeyHole = new THREE.Mesh(new THREE.ExtrudeGeometry(holeShape(...HONEY_DEF.size), { depth: 0.01, bevelEnabled: false, curveSegments: 12 }), toon('#17140f', { outline: 0.004 }));
  honeyHole.name = 'hive_honey_hole'; honeyHole.position.copy(honeyPt.pos); honeyHole.lookAt(honeyPt.pos.clone().add(honeyPt.n)); honeyHole.raycast = () => {}; hive.add(honeyHole);
  // 斜枝（从原点往右下方，挡在蜂巢右肩前）+ 蜂巢后面的细枝 + 叶子
  const branchMat = tmat('#a8a092', { outline: 0.008 }), leafMat = tmat('#b3d067', { side: THREE.DoubleSide, outline: 0.0055 }), leafDark = tmat('#8cae45', { side: THREE.DoubleSide, outline: 0.0055 });
  mesh(root, tubeAlong([V(0, 0.005, 0.15), V(0.1, -0.15, 0.2), V(0.26, -0.42, 0.16), V(0.55, -0.9, 0.04), V(0.78, -1.3, -0.2)], 0.028, 0.052, { radial: 8, seg: 30 }), branchMat, 'hive_branch');
  mesh(root, tubeAlong([V(-0.34, 0.34, -0.12), V(-0.18, 0.12, -0.06), V(-0.02, -0.03, -0.02), V(0.05, -0.08, 0)], 0.03, 0.024, { radial: 7, seg: 14 }), branchMat, 'hive_branch_back');
  const leafGeos = [], leafGeos2 = [], R = rng(91);
  // 枝头：一根往右上伸的小枝，上面两侧排满小叶（对照 00:58 枝头那一簇）
  mesh(root, tubeAlong([V(0, 0.005, 0.15), V(0.1, 0.05, 0.15), V(0.2, 0.075, 0.14)], 0.014, 0.006, { radial: 6, seg: 8 }), branchMat, 'hive_twig');
  for (let i = 0; i < 12; i++) {
    const t = i / 11, side = i % 2 ? 1 : -1;
    const g = leafGeo(0.085 + R() * 0.03, 0.036 + R() * 0.008, { depth: 0.004, bend: 0.3 });
    g.rotateZ(0.35 + side * (0.75 + R() * 0.4)); g.rotateY((R() - 0.5) * 0.6); g.translate(0.2 * t, 0.075 * t, 0.15 + (R() - 0.5) * 0.04);
    (i % 3 ? leafGeos : leafGeos2).push(g);
  }
  for (let i = 0; i < 3; i++) {
    const g = leafGeo(0.1 + R() * 0.03, 0.045, { depth: 0.004, bend: 0.3 });
    g.rotateZ(1.4 + i * 0.5 + R() * 0.2); g.translate(0, 0.004, 0.155); (i % 2 ? leafGeos : leafGeos2).push(g);
  }
  for (const [x, y, z, a, s] of [[0.27, -0.44, 0.17, 0.4, 1], [0.3, -0.46, 0.17, 1.5, 0.9], [-0.3, 0.3, -0.12, 1.4, 1], [-0.28, 0.28, -0.12, 0.3, 0.9]]) {   // 枝上的小叶对
    const g = leafGeo(0.13 * s, 0.056 * s, { depth: 0.004, bend: 0.3 }); g.rotateZ(a); g.translate(x, y, z); leafGeos.push(g);
  }
  mesh(root, mergeGeos(leafGeos), leafMat, 'hive_leaves'); mesh(root, mergeGeos(leafGeos2), leafDark, 'hive_leaves_dark');

  // 蜂蜜：右侧出蜜小孔流下一道金色蜂蜜（沿蜂巢表面）
  const honeyMat = tmat('#e2a523', { outline: 0.0045 });
  const DRIP_N = 40, dripEnd = -0.745;
  const dripPts = [], avgR = (y) => { let a = 0; for (let d = -3; d <= 3; d++) a += hiveR(y + d * 0.02); return a / 7; };   // 蜂蜜沿着环的平均半径流，不跟着每一道环起伏
  for (let i = 0; i <= 12; i++) {
    const yy = lerp(HONEY_DEF.y - 0.01, dripEnd, i / 12), th = HONEY_DEF.th + 0.05 * (i / 12), r = avgR(yy) + 0.014, x = Math.sin(th) * r;
    dripPts.push(V(x, yy + HIVE.shear * x, Math.cos(th) * r));
  }
  const dripGeo = tubeAlong(dripPts, 0.0095, 0.0075, { radial: 6, seg: DRIP_N });
  const drip = mesh(hive, dripGeo, honeyMat, 'hive_honey_drip'); drip.raycast = () => {}; drip.castShadow = false;
  const bulb = mesh(hive, new THREE.SphereGeometry(0.0165, 10, 8).scale(1, 1.25, 1), honeyMat, 'hive_honey_bulb'); bulb.raycast = () => {};
  const shine = mesh(hive, new THREE.SphereGeometry(0.004, 6, 5).scale(1, 2, 0.6), umat('#fbe39a'), 'hive_honey_shine'); shine.raycast = () => {};
  const stain = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8).scale(1.3, 1, 0.35), tmat('#c98a22', { outline: false })); stain.name = 'hive_honey_stain'; stain.raycast = () => {};
  stain.position.copy(honeyPt.pos).addScaledVector(honeyPt.n, 0.002); stain.lookAt(honeyPt.pos.clone().add(honeyPt.n)); hive.add(stain);
  const glow = glowPlane(hive, 0.34, '#ffcf6a', 'hive_honey_glow'); glow.position.copy(honeyPt.pos).addScaledVector(honeyPt.n, 0.04);
  const poseDrip = (k) => {                                                  // k 0..1：蜂蜜流到哪儿
    drip.visible = k > 0.01;
    dripGeo.setDrawRange(0, Math.floor(clamp(k) * DRIP_N) * 36);
    const i = clamp(k) * 12, i0 = Math.min(11, Math.floor(i)), pt = dripPts[i0].clone().lerp(dripPts[i0 + 1], i - i0);
    bulb.visible = shine.visible = k > 0.01; bulb.position.copy(pt); shine.position.copy(pt).add(V(-0.005, 0.004, 0.012));
  };
  // 点击盒（孔口盒要比 hive_hit 凸出，射线先打到孔）
  hit(root, 'hive_hit', [0.46, 0.74, 0.34], [HIVE.off[0], -0.43, 0]);
  const holeHits = HIVE_HOLES.map((h, i) => {
    const m = hit(root, `hive_hole_${i}`, [0.08, 0.09, 0.07], new THREE.Vector3(...h.pos).addScaledVector(V(...h.normal), 0.03).toArray());
    m.lookAt(V(...h.pos).add(V(...h.normal))); return m;
  });
  const honeyHit = hit(root, 'hive_honey_hit', [0.1, 0.12, 0.1], honeyPt.pos.clone().add(HIVE_OFF).addScaledVector(honeyPt.n, 0.02).toArray());

  // 蜜蜂：每个孔一只（用不用由状态决定）
  const L = 0.085, bees = HIVE_HOLES.map((h, i) => {
    const g = makeBee(L); g.name = `bee_${i}`; g.visible = false; root.add(g);
    const r = rng(100 + i);
    return { g, p: 0, ph: r() * TAU, pos0: V(...h.pos), n: V(...h.normal), hover: V(...h.hover), prev: V(), flap: 36 + r() * 8 };
  });
  const S = { bees: new Set(), honey: 'none' };
  const _p = V(), _dir = V();
  const placeBees = (t) => {
    for (const b of bees) {
      if (b.p <= 0.0001) { b.g.visible = false; b.g.scale.setScalar(1); continue; }
      b.g.visible = true;
      const e = smooth(b.p), hov = b.hover;
      const hx = hov.x + Math.sin(t * 1.3 + b.ph) * 0.07, hy = hov.y + Math.sin(t * 1.7 + b.ph * 1.3) * 0.05, hz = hov.z + Math.sin(t * 0.9 + b.ph * 2) * 0.05;
      _p.set(lerp(b.pos0.x - b.n.x * 0.015, hx, e), lerp(b.pos0.y - b.n.y * 0.015, hy, e), lerp(b.pos0.z - b.n.z * 0.015, hz, e));
      _p.addScaledVector(b.n, 0.1 * Math.sin(Math.PI * e));
      b.g.position.copy(_p);
      b.g.scale.setScalar(lerp(0.35, 1, smooth(Math.min(1, b.p * 3))));
      // 朝向：出发时朝外，盘旋时朝左前方并轻微摆动
      const yaw = Math.atan2(-b.n.z * (1 - e) - 0.5 * e, b.n.x * (1 - e) - 0.8 * e) + Math.sin(t * 0.8 + b.ph) * 0.4 * e;
      b.g.rotation.set(Math.sin(t * 1.5 + b.ph) * 0.12 * e, yaw, Math.sin(t * 2.1 + b.ph) * 0.15 * e + 0.2);
      const f = Math.sin(t * b.flap) * 0.7;
      b.g.userData.wings[0].rotation.x = 0.35 + f; b.g.userData.wings[1].rotation.x = -(0.35 + f);
    }
  };
  let clock = 0;
  const flashing = new Map();
  const apply = () => {
    bees.forEach((b, i) => { b.p = S.bees.has(i) ? 1 : 0; });
    placeBees(clock);
    holes.forEach((h) => h.mat.color.set('#1d1d20'));
    poseDrip(S.honey === 'drip' ? 1 : 0);
    stain.visible = S.honey !== 'none';
    glow.visible = false;
    honeyHit.visible = S.honey !== 'taken';
    if (S.honey === 'drip') { honeyHit.scale.set(1, 3.4, 1); honeyHit.position.y = honeyPt.pos.y + HIVE_OFF.y - 0.12; } else { honeyHit.scale.set(1, 1, 1); honeyHit.position.y = honeyPt.pos.y + HIVE_OFF.y; }
  };
  root.setState = (st = {}) => {
    S.bees = new Set((st.bees || []).filter((i) => i >= 0 && i < bees.length)); S.honey = ['none', 'drip', 'taken'].includes(st.honey) ? st.honey : 'none';
    apply();
  };
  root.getState = () => ({ bees: [...S.bees].sort((a, b) => a - b), honey: S.honey });
  /** 一只蜜蜂从该孔爬出、飞到蜂巢左前方盘旋。 */
  root.releaseBee = (hole, opts = {}) => {
    const i = typeof hole === 'number' ? hole : (hole?.index ?? 0), b = bees[i];
    if (!b || S.bees.has(i)) return Promise.resolve();
    S.bees.add(i);
    if (opts.instant) { b.p = 1; placeBees(clock); return Promise.resolve(); }
    return animate(1400, (k) => { b.p = k; }, Ease.linear).then(() => { b.p = 1; });
  };
  /** 所有飞出的蜜蜂飞回孔里。 */
  root.recallBees = (opts = {}) => {
    const out = bees.map((b, i) => (S.bees.has(i) ? b : null)).filter(Boolean);
    S.bees.clear();
    if (opts.instant || !out.length) { out.forEach((b) => { b.p = 0; }); placeBees(clock); return Promise.resolve(); }
    const from = out.map((b) => b.p);
    return animate(1200, (k) => { out.forEach((b, j) => { b.p = from[j] * (1 - clamp(seg(k, j * 0.05, 0.75 + j * 0.05))); }); }, Ease.linear).then(() => { out.forEach((b) => { b.p = 0; }); placeBees(clock); });
  };
  /** 该孔闪一下暗红（约 0.5 秒）。 */
  root.flashHole = (hole, opts = {}) => {
    const i = typeof hole === 'number' ? hole : (hole?.index ?? 0), h = holes[i];
    if (!h || opts.instant) return Promise.resolve();
    const dark = new THREE.Color('#1d1d20'), red = new THREE.Color('#8a2018');
    return animate(500, (k) => { h.mat.color.copy(dark).lerp(red, Math.sin(clamp(k) * Math.PI)); }, Ease.linear).then(() => h.mat.color.copy(dark));
  };
  /** 出蜜孔流下一道金色蜂蜜（暖光闪一下）。 */
  root.drip = (opts = {}) => {
    if (S.honey !== 'none') return Promise.resolve();
    S.honey = 'drip';
    if (opts.instant) { apply(); return Promise.resolve(); }
    stain.visible = true; glow.visible = true; honeyHit.visible = false;
    return animate(2200, (k) => {
      poseDrip(Ease.inSine(seg(k, 0.05, 1)));
      glow.material.opacity = Math.sin(clamp(seg(k, 0, 0.5)) * Math.PI) * 0.7;
    }, Ease.linear).then(() => { glow.visible = false; apply(); });
  };
  /** 取走蜂蜜：蜂蜜缩回蜂巢，只在孔口留一点蜜渍。 */
  root.takeHoney = (opts = {}) => {
    if (S.honey === 'taken') return Promise.resolve();
    const was = S.honey; S.honey = 'taken'; honeyHit.visible = false;
    if (opts.instant || was !== 'drip') { apply(); return Promise.resolve(); }
    return animate(500, (k) => poseDrip(1 - Ease.inCubic(k)), Ease.linear).then(apply);
  };
  root.update = (dt, t) => { clock = t; placeBees(t); };
  root.setState({});
  return root;
}

export const FACTORIES = {
  p3_flytrap: () => makeFlytrap(),
  p3_x_tree: () => makeXTree(),
  p3_clay_mound: () => makeClayMound(),
  p3_beehive: () => makeBeehive(),
};
