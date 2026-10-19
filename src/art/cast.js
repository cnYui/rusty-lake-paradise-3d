// 天堂岛人物（第二版）：按原作游玩视频重做的全部角色。比例统一按真实身高（米），各章节直接用 scale = 1。
//
// 身高（头骨顶）：Nicholas 1.88 · Gerard 1.84 · David 1.78 · Jakob 1.76 · Caroline 1.66 · Ida 1.58 · Margaret 1.56（站直，平时驼背约 1.47）
//               Elizabeth 1.32 · 少年 Jakob 1.30 · 灵魂 1.98
// 衣物是连续蒙皮网格（human.js），头、手、鞋、帽子、头发是刚体部件；动作只用 tween（animate / wait）。
// 每个构建函数返回 CharacterRig（见 ARCHITECTURE.md），方法名与旧版保持一致，章节代码不用改调用方式。
import {
  THREE, mergeGeometries, clamp, lerp, smooth, V, TAU, line, blob, eye, pen, FX, FY, faceSet, place, prep, sphere, lathe,
  taperTube, ringLoft, spineLoft, ribbonGeo, leafGeo, orient, fitAlongY, fitSize, tryProp, makeLeech, fallbackGlass, blackCube,
  headSurface, animate, wait, Ease, rng, canvasTexture, cachedTex, shade, MeshSurfaceSampler, getPropFactory, hairTex,
  createRig, skeleton, torsoGeo, limbGeo, unlit,
} from './charkit.js';
import {
  makeHuman, head, hands, shoes, hairCap, lockGeo, hairStrands, feltHat, finish, lifeIdle, playKeys,
  torsoSkin, limbSkin, skirtSkin, cloth, fabric, restPos,
} from './human.js';

// ===========================================================================
// 公共：脸部笔触
// ===========================================================================

const SHADOW = 'rgba(60,52,58,0.32)';

/** 沉重的黑眼圈：在眼睛下方画一块灰影 + 1~2 条弧线。 */
function bags(g, x, y, w, h, side, { depth = 1.5, lines = 1, color = SHADOW } = {}) {
  blob(g, [[x - side * w * 0.95, y - h * 0.55], [x - side * w * 0.2, y - h * (0.9 + depth * 0.9)], [x + side * w * 0.9, y - h * 0.7], [x, y - h * 0.95]], color);
  for (let i = 0; i < lines; i++) {
    const yy = y - h * (1.15 + i * 0.75) * depth * 0.75;
    line(g, [[x - side * w * (0.7 - i * 0.1), yy + h * 0.25], [x, yy - h * 0.45], [x + side * w * (0.85 - i * 0.1), yy + h * 0.15]], 3.2, 'rgba(25,20,25,0.7)');
  }
}

/** 胡茬：下巴和两颊的细点。 */
function stubble(g, seed = 5, area = [[-0.45, -0.45], [0.45, -0.98]], alpha = 0.35) {
  const r = rng(seed);
  g.fillStyle = `rgba(70,62,60,${alpha})`;
  for (let i = 0; i < 260; i++) {
    const x = lerp(area[0][0], area[1][0], r()), y = lerp(area[0][1], area[1][1], r());
    if (x * x / 0.25 + Math.pow((y + 0.62) / 0.42, 2) > 1.05) continue;
    g.fillRect(FX(x), FY(y), 2.2, 2.2);
  }
}

/** 浓眉（若干短笔触叠成）。 */
function brow(g, pts, w, color) {
  line(g, pts, w, color);
  line(g, pts.map(([x, y]) => [x, y + 0.012]), w * 0.6, color);
}

// ===========================================================================
// 公共：服装部件
// ===========================================================================

/** 衬衫身：领口张开的 V 领、门襟和纽扣、两片翻领。keys 自下而上。 */
function shirtBody(rig, mat, keys, { collar = true, open = 0.34, buttons = 6, buttonColor = '#2b2520', collarMat = null, placket = true } = {}) {
  const J = rig.joints, M = rig.mats, Y = rig.Y;
  torsoSkin(rig, keys, mat, { tag: 'shirt' });
  const front = (y) => {
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1].y < y) i++;
    const a = keys[i], b = keys[i + 1], k = clamp((y - a.y) / (b.y - a.y), 0, 1);
    return lerp(a.d, b.d, k) + lerp(a.cz || 0, b.cz || 0, k);
  };
  rig.shirtFront = front;
  const neckY = Y.neck + 0.005;
  if (collar) {
    // 领子：立在脖子周围、前面敞开，两片领尖翻贴在胸口
    const cm = collarMat || M.toon('#ffffff', { map: mat.map, side: THREE.DoubleSide, outline: 0.004 });
    const nr = rig.dims.headR[0] * 0.66;
    torsoSkin(rig, [
      { y: neckY - 0.03, w: nr * 1.25, d: nr * 1.14, cz: -0.006, gap: open },
      { y: neckY - 0.002, w: nr * 1.1, d: nr * 1.02, cz: -0.01, gap: open * 1.05 },
      { y: neckY + 0.014, w: nr * 1.16, d: nr * 1.07, cz: -0.012, gap: open * 1.15 },
    ], cm, { tag: 'collar', radial: 32, steps: 2, armBlend: 0 });
    for (const s of [-1, 1]) {
      const b = V(s * nr * 0.5, neckY + 0.01, front(neckY) + 0.002);
      const t = V(s * (nr * 0.5 + 0.034), neckY - 0.058, front(neckY - 0.058) + 0.005);
      const geo = orient(leafGeo(b.distanceTo(t) * 1.05, 0.021, { at: 0.3, depth: 0.003, baseW: 0.9, tipW: 0.05 }), b, t.clone().sub(b).toArray(), [s * 0.12, 0.25, 1]);
      torsoSkinRigid(rig, geo, cm, 'collar');
    }
  }
  if (placket) {
    const pts = [];
    const top = neckY - (collar ? 0.075 : 0.02);
    for (let y = keys[0].y + 0.02; y <= top; y += 0.03) pts.push(V(0, y, front(y) + 0.002));
    if (pts.length > 2) torsoSkinRigid(rig, ribbonGeo(pts, 0.026, { seg: 24, lift: 0.0015, nrm: (p, o) => o.set(0, 0, 1) }), M.toon('#ffffff', { map: mat.map, side: THREE.DoubleSide, outline: 0.0022 }), 'placket');
    const bm = M.toon(buttonColor, { outline: false });
    for (let i = 0; i < buttons; i++) {
      const y = lerp(keys[0].y + 0.05, top - 0.01, i / Math.max(1, buttons - 1));
      torsoSkinRigid(rig, place(sphere(0.0062, 0.0062, 0.003, 10, 6), [0, y, front(y) + 0.0045]), bm, 'buttons');
    }
  }
}

/** 贴在躯干表面的小部件（领尖、门襟、纽扣、口袋）也做成蒙皮网格，弯腰时跟着衣服走。 */
function torsoSkinRigid(rig, geo, mat, tag) {
  return torsoSkin(rig, null, mat, { tag, geo });
}

/** 马甲 / 背心：前襟敞开（gap 自下而上变大 → V 领），袖窿外露衬衫袖子。 */
function vest(rig, mat, keys, { pockets = true, pocketColor = '#3a2216' } = {}) {
  torsoSkin(rig, keys, mat, { tag: 'vest', armBlend: 0.35 });
  if (!pockets) return;
  const k0 = keys[1];
  for (const s of [-1, 1]) {
    const px = k0.w * 0.62, th = Math.asin(clamp(px / k0.w, -1, 1));
    const z = Math.cos(th) * k0.d + (k0.cz || 0) + 0.003;
    torsoSkinRigid(rig, place(new THREE.BoxGeometry(0.06, 0.008, 0.004), [s * px, k0.y + 0.015, z], [0, s * th, -s * 0.08]), rig.mats.toon(pocketColor, { outline: false }), 'vest');
  }
}

/** 卷到手肘下方的衬衫袖子 + 裸露前臂（原作 David / Gerard 的样子）。 */
function rolledSleeves(rig, shirt, { r = 0.054, elbow = 0.046, roll = 0.06, fore = [0.037, 0.026], cuffLine = '#4b4036' } = {}) {
  const D = rig.dims, M = rig.mats;
  for (const side of ['L', 'R']) {
    limbSkin(rig, side, 'arm', [
      { s: -0.04, w: r * 0.62, d: r * 0.68, ox: -0.032 }, { s: -0.012, w: r * 0.9, d: r * 0.9, ox: -0.012 },
      { s: 0.05, w: r * 1.02, d: r * 0.98 }, { s: D.upper * 0.6, w: r * 0.95, d: r * 0.92, oz: 0.003 },
      { s: D.upper, w: elbow, d: elbow * 0.96, oz: 0.004 }, { s: D.upper + roll * 0.4, w: elbow * 1.08, d: elbow * 1.02 },
      { s: D.upper + roll, w: elbow * 1.12, d: elbow * 1.05 }, { s: D.upper + roll + 0.012, w: elbow * 0.85, d: elbow * 0.8 },
    ], shirt, { tag: 'sleeve', cap: 'top', pleat: (th, k) => 0.04 * Math.sin(th * 3 + k * 5) * (1 - k) });
    // 卷边上的一道深色折线
    limbSkin(rig, side, 'arm', [
      { s: D.upper + roll * 0.42, w: elbow * 1.1, d: elbow * 1.04 }, { s: D.upper + roll * 0.48, w: elbow * 1.1, d: elbow * 1.04 },
    ], M.toon(cuffLine, { outline: false, side: THREE.DoubleSide }), { tag: 'sleeve', radial: 24, steps: 1 });
    limbSkin(rig, side, 'arm', [
      { s: D.upper - 0.03, w: fore[0] * 0.95, d: fore[0] * 0.9 }, { s: D.upper + D.fore * 0.3, w: fore[0], d: fore[0] * 0.86, oz: 0.002 },
      { s: D.upper + D.fore * 0.75, w: lerp(fore[0], fore[1], 0.7), d: fore[1] * 0.85 }, { s: D.upper + D.fore + 0.01, w: fore[1], d: fore[1] * 0.78 },
      { s: D.upper + D.fore + 0.022, w: fore[1] * 0.6, d: fore[1] * 0.5 },
    ], rig.skinMat, { tag: 'forearm', cap: 'bottom' });
  }
}

/** 长袖（外套 / 女装）：一直到手腕，袖口可带翻边。 */
function longSleeves(rig, mat, { r = 0.052, elbow = 0.044, wrist = 0.036, cuff = null, cuffW = 0.03, bell = 0 } = {}) {
  const D = rig.dims;
  for (const side of ['L', 'R']) {
    limbSkin(rig, side, 'arm', [
      { s: -0.04, w: r * 0.62, d: r * 0.68, ox: -0.032 }, { s: -0.012, w: r * 0.9, d: r * 0.9, ox: -0.012 },
      { s: 0.05, w: r, d: r * 0.96 }, { s: D.upper * 0.6, w: r * 0.93, d: r * 0.9, oz: 0.003 },
      { s: D.upper, w: elbow, d: elbow * 0.96, oz: 0.004 }, { s: D.upper + D.fore * 0.6, w: lerp(elbow, wrist, 0.6) + bell * 0.5, d: lerp(elbow, wrist, 0.6) * 0.95 + bell * 0.5 },
      { s: D.upper + D.fore - 0.005, w: wrist + bell, d: wrist * 0.95 + bell }, { s: D.upper + D.fore + 0.008, w: (wrist + bell) * 0.8, d: (wrist + bell) * 0.75 },
    ], mat, { tag: 'sleeve', cap: 'top', pleat: (th, k) => 0.035 * Math.sin(th * 3 + k * 6) * (1 - k) });
    if (cuff) limbSkin(rig, side, 'arm', [
      { s: D.upper + D.fore - cuffW, w: wrist * 1.12 + bell, d: wrist * 1.08 + bell }, { s: D.upper + D.fore + 0.006, w: wrist * 1.14 + bell, d: wrist * 1.1 + bell },
    ], cuff, { tag: 'cuff', steps: 1 });
  }
}

/** 裤子：裤裆 + 两条裤腿。breeches = 膝下收口的马裤（塞进靴子）；boots = 靴筒颜色。 */
function trousers(rig, mat, { thigh = 0.082, knee = 0.06, ankle = 0.05, seat = [0.148, 0.115], breeches = false, boots = null, bootTop = 0.5, bootR = [0.054, 0.046], turnUp = false } = {}) {
  const D = rig.dims, Y = rig.Y;
  torsoSkin(rig, [
    { y: Y.crotch - 0.035, w: seat[0] * 0.92, d: seat[1] * 0.9 },
    { y: Y.hip - 0.02, w: seat[0], d: seat[1], cz: -0.004 },
    { y: Y.belt, w: seat[0] * 0.95, d: seat[1] * 0.93, cz: 0.002 },
    { y: Y.belt + 0.012, w: seat[0] * 0.9, d: seat[1] * 0.88 },
  ], mat, { tag: 'hips', legs: true, cap: 'bottom', armBlend: 0 });
  const T = D.thigh, S = D.shin;
  for (const side of ['L', 'R']) {
    const keys = [
      { s: -0.07, w: thigh * 0.9, d: thigh * 0.95, ox: -0.022 }, { s: 0.02, w: thigh * 1.04, d: thigh * 1.04, ox: -0.004 },
      { s: T * 0.45, w: thigh * 0.93, d: thigh * 0.95, oz: 0.004 }, { s: T * 0.92, w: knee * 1.02, d: knee, oz: 0.006 },
    ];
    if (breeches) {
      keys.push({ s: T + 0.04, w: knee * 1.12, d: knee * 1.1, oz: 0.004 }, { s: T + 0.085, w: knee * 1.06, d: knee * 1.04 }, { s: T + 0.11, w: bootR[0] * 0.98, d: bootR[0] * 0.96 });
    } else {
      keys.push({ s: T + S * 0.45, w: lerp(knee, ankle, 0.5), d: lerp(knee, ankle, 0.5) * 0.97 }, { s: T + S + 0.006, w: ankle * 1.04, d: ankle * 1.02, oz: 0.004 });
    }
    limbSkin(rig, side, 'leg', keys, mat, { tag: 'trousers', pleat: (th, k) => 0.03 * Math.sin(th * 4 + 1 + k * 3) });
    if (turnUp) limbSkin(rig, side, 'leg', [{ s: T + S - 0.035, w: ankle * 1.1, d: ankle * 1.07, oz: 0.004 }, { s: T + S + 0.008, w: ankle * 1.12, d: ankle * 1.09, oz: 0.004 }], mat, { tag: 'trousers', steps: 1 });
    if (boots) {
      const from = breeches ? T + 0.09 : T + S * (1 - bootTop);
      limbSkin(rig, side, 'leg', [
        { s: from, w: bootR[0] * 1.08, d: bootR[0] * 1.05 }, { s: from + 0.02, w: bootR[0], d: bootR[0] * 0.98 },
        { s: lerp(from, T + S, 0.6), w: lerp(bootR[0], bootR[1], 0.6), d: lerp(bootR[0], bootR[1], 0.6), oz: 0.003 },
        { s: T + S + 0.01, w: bootR[1], d: bootR[1] * 1.05, oz: 0.006 },
      ], boots, { tag: 'boots', pleat: (th, k) => 0.03 * Math.sin(th * 2 + k * 9) * (1 - k) });
    }
  }
}

/** 光脚踝（女装裙下的小腿和鞋）。 */
function stockings(rig, mat, { r = [0.045, 0.03] } = {}) {
  const D = rig.dims;
  for (const side of ['L', 'R']) limbSkin(rig, side, 'leg', [
    { s: -0.03, w: r[0] * 1.3, d: r[0] * 1.3 }, { s: D.thigh * 0.6, w: r[0] * 1.15, d: r[0] * 1.15 }, { s: D.thigh, w: r[0] * 0.95, d: r[0] * 0.95 },
    { s: D.thigh + D.shin * 0.35, w: r[0], d: r[0] * 1.02, oz: -0.004 }, { s: D.thigh + D.shin + 0.01, w: r[1], d: r[1] },
  ], mat, { tag: 'stockings' });
}

// ===========================================================================
// 公共：姿势工具
// ===========================================================================

/** 手插裤兜：手腕停在髋前侧的口袋里，手部网格隐藏。 */
function pocketTarget(rig, side) {
  const s = side === 'L' ? 1 : -1, Y = rig.Y;
  return { pos: [s * rig.dims.hipX * 1.5, Y.hip - 0.03, 0.072], pole: [s * 1, 0.1, -0.7] };
}

/** 双手自然下垂（手掌朝内、略弯肘）。 */
function armsDown(rig, { spread = 0.08, bend = 0.12 } = {}) {
  return { armL: [0.04, 0, spread], elbowL: [-bend, 0, 0], handL: [0, 0, 0.05], armR: [0.04, 0, -spread], elbowR: [-bend, 0, 0], handR: [0, 0, -0.05] };
}

/** 道具挂在手上并在 root 空间保持一个固定朝向（每帧在 _after 钩子里校正）。 */
function holdUpright(rig, joint, mount, getTiltQ = null) {
  const q = new THREE.Quaternion(), m = new THREE.Matrix4(), p = V(), s = V();
  rig._after.push(() => {
    rig.root.updateMatrixWorld(true);
    m.copy(rig.root.matrixWorld).invert().multiply(joint.matrixWorld).decompose(p, q, s);
    mount.quaternion.copy(q).invert();
    if (getTiltQ) mount.quaternion.multiply(getTiltQ());
  });
}

// ===========================================================================
// DAVID — 瘦高的弟弟：棕色软呢帽、卷袖白衬衫、敞开的锈红马甲、灰褐马裤、深棕高筒靴，右手插兜，坏笑
// ===========================================================================

const SKIN_DAVID = '#e4dbcf';

function paintDavid(g, v, o = {}) {
  const sk = o.skin || SKIN_DAVID;
  if (!o.noStubble) stubble(g, 11, [[-0.5, -0.4], [0.5, -1.0]], 0.3);
  for (const s of [-1, 1]) {
    const wide = v === 'wide';
    bags(g, s * 0.35, 0.02, 0.17, 0.085, s, { depth: 1.7, lines: 1, color: 'rgba(70,62,72,0.36)' });
    eye(g, s * 0.35, 0.02, 0.165, wide ? 0.11 : 0.08, s, {
      skin: sk, lid: v === 'blink' ? 1 : wide ? 0.15 : 0.56, closed: v === 'blink', droop: 0.18, pupil: wide ? 0.42 : 0.6, look: [0.04 * -s, 0], lw: 6, crease: false,
    });
    brow(g, [[s * 0.14, 0.17], [s * 0.36, wide ? 0.25 : 0.215], [s * 0.6, 0.19]], 11, '#2c241e');
  }
  line(g, [[-0.09, 0.09], [-0.11, -0.12], [-0.125, -0.25]], 4, 'rgba(20,20,20,0.6)');
  line(g, [[-0.17, -0.3], [-0.06, -0.35], [0.06, -0.33]], 3, 'rgba(20,20,20,0.55)');
  if (v === 'talk' || v === 'gape') {
    blob(g, [[-0.22, -0.5], [0, -0.58], [0.24, -0.45], [0.05, -0.7], [-0.12, -0.66]], '#3a1a1a');
    line(g, [[-0.24, -0.5], [0, -0.53], [0.26, -0.44]], 5);
  } else if (v === 'sad') {
    line(g, [[-0.25, -0.58], [0, -0.5], [0.25, -0.58]], 6);
  } else {
    // 坏笑：嘴角一边上挑
    line(g, [[-0.26, -0.52], [-0.05, -0.57], [0.15, -0.53], [0.28, -0.42]], 6);
    line(g, [[0.28, -0.42], [0.32, -0.37]], 4);
    line(g, [[-0.26, -0.52], [-0.3, -0.48]], 4);
  }
  line(g, [[0.36, -0.28], [0.41, -0.41], [0.37, -0.53]], 3.5, 'rgba(20,20,20,0.5)');
  line(g, [[-0.33, -0.3], [-0.37, -0.44]], 3, 'rgba(20,20,20,0.4)');
  line(g, [[-0.07, -0.84], [0, -0.87], [0.07, -0.84]], 3.5, 'rgba(20,20,20,0.45)');
}

const DAVID_DIMS = { head: 0.0735, headW: 0.7, headD: 0.84, shoulderW: 0.098, hip: 0.528, hipW: 0.048, upper: 0.17, fore: 0.15 };
const DAVID_HEAD = {
  skin: SKIN_DAVID, jaw: 0.3, chin: 0.26, crown: 0.12, flat: 0.15, cheek: -0.04, ear: { y: -0.05, s: 0.95 },
  nose: { top: 0.14, y: -0.27, len: 0.03, w: 0.0112, tip: 0.85, wing: 0.5 }, paint: paintDavid,
};

/**
 * 成年男子（David / Jakob / Gerard）的通用身体：衬衫 + 可选马甲 + 裤子 + 靴 / 鞋 + 头发 + 可选帽子。
 * o: { height, dims, head, colors, build: { hip, waist, chest, shoulder, belly（肚腩前凸）, depth }, vest, hat, hatOpts,
 *      sleeves: 'rolled'|'long', breeches, bootTop, turnUp, hair: { color, line, cap }, handScale, collarOpen }
 */
function manBody(id, o = {}) {
  const H = o.height || 1.78;
  const rig = makeHuman(id, { height: H, dims: o.dims || {} });
  const Y = rig.Y, M = rig.mats, sc = H / 1.78;
  head(rig, o.head);
  const C = { shirt: '#e3dccb', vest: '#a34a2d', trousers: '#5d574d', boots: '#4a3626', ...(o.colors || {}) };
  const B = { hip: [0.128, 0.1], waist: [0.126, 0.098], chest: [0.15, 0.106], shoulder: 0.155, belly: 0, ...(o.build || {}) };
  const w = (x) => x * sc, bl = w(B.belly);
  const shirt = cloth(rig, C.shirt, { seed: o.seed || 11, folds: 9, ink: 0.4 });
  const keys = [
    { y: Y.hip - 0.02, w: w(B.hip[0]), d: w(B.hip[1]) + bl * 0.5, cz: bl * 0.4, n: 2.2 },
    { y: Y.belt, w: w(B.waist[0]) + bl * 0.4, d: w(B.waist[1]) + bl, cz: 0.004 + bl * 0.7, n: 2.2 },
    { y: Y.waist + 0.04, w: w(B.waist[0] * 1.06) + bl * 0.5, d: w(B.waist[1] * 1.04) + bl * 1.05, cz: 0.008 + bl * 0.85, n: 2.3 },
    { y: Y.chest, w: w(B.chest[0]), d: w(B.chest[1]) + bl * 0.4, cz: 0.01 + bl * 0.3, n: 2.3 },
    { y: Y.armpit, w: w(B.chest[0] * 1.04), d: w(B.chest[1] * 0.93), cz: 0.004, n: 2.4 },
    { y: Y.shoulder - 0.005, w: w(B.shoulder), d: w(B.chest[1] * 0.8), n: 2.4 },
    { y: Y.shoulder + 0.03, w: w(B.shoulder * 0.76), d: w(B.chest[1] * 0.7), cz: -0.004 },
    { y: Y.neck + 0.002, w: rig.dims.headR[0] * 0.62, d: rig.dims.headR[0] * 0.56, cz: -0.006 },
  ];
  shirtBody(rig, shirt, keys, { buttons: o.buttons ?? 6, open: o.collarOpen ?? 0.34, buttonColor: o.buttonColor });
  if (o.vest !== false) {
    const gaps = [0.42, 0.42, 0.5, 0.66, 0.86, 1.05, 1.25];
    vest(rig, cloth(rig, C.vest, { seed: (o.seed || 11) + 1, folds: 7, ink: 0.45 }), keys.slice(1).map((k, i) => ({
      ...k, y: i === 0 ? Y.belt - 0.012 : k.y - (i === keys.length - 2 ? 0.006 : 0), w: k.w * 1.06 + 0.004, d: k.d * 1.06 + 0.004, gap: (o.vestGaps || gaps)[i],
    })));
  }
  if ((o.sleeves || 'rolled') === 'rolled') rolledSleeves(rig, shirt, { r: w(0.052 + B.belly * 0.08), elbow: w(0.045), fore: [w(0.037), w(0.026)] });
  else longSleeves(rig, shirt, { r: w(0.052), elbow: w(0.044), wrist: w(0.036), cuff: shirt });
  const boots = o.boots === false ? null : cloth(rig, C.boots, { seed: 14, folds: 5, ink: 0.35, len: 0.6 });
  trousers(rig, cloth(rig, C.trousers, { seed: (o.seed || 11) + 2, folds: 9, ink: 0.4 }), {
    thigh: w(0.084 + B.belly * 0.12), knee: w(0.062), ankle: w(0.052), seat: [w(B.hip[0] * 1.09), w(B.hip[1] * 1.12) + bl * 0.4], breeches: o.breeches ?? true,
    boots, bootTop: o.bootTop ?? 0.5, bootR: [w(0.05), w(0.044)], turnUp: o.turnUp,
  });
  // 皮带
  torsoSkin(rig, [{ y: Y.belt - 0.005, w: w(B.waist[0] * 1.1) + bl * 0.42, d: w(B.waist[1] * 1.12) + bl * 1.02, cz: 0.004 + bl * 0.7, n: 2.2 }, { y: Y.belt + 0.022, w: w(B.waist[0] * 1.1) + bl * 0.42, d: w(B.waist[1] * 1.12) + bl * 1.02, cz: 0.004 + bl * 0.7, n: 2.2 }],
    M.toon(o.beltColor || '#4a4440', { side: THREE.DoubleSide }), { tag: 'belt', steps: 1, armBlend: 0 });
  shoes(rig, { w: w(0.047), l: w(0.17), z: w(0.035) }, M.toon(boots ? C.boots : (C.shoes || '#2c241e')), M.toon('#211811'));
  const hr = { color: '#3a2a1f', line: '#1d140e', ...(o.hair || {}) };
  if (hr.color) hairCap(rig, { front: 0.27 * Math.PI, side: 0.45 * Math.PI, back: 0.63 * Math.PI, scale: 1.035, top: 0.02, quiff: 0.02, ...(hr.cap || {}) }, M.toon('#ffffff', { map: hairStrands(hr.color, hr.line, hr.seed || 9) }));
  if (o.hat) feltHat(rig, { r: rig.dims.headR[0] * 1.12, h: rig.dims.headR[1] * 0.78, brim: rig.dims.headR[0] * 0.62, y: rig.dims.headR[1] * 0.42, ...o.hat });
  if (o.extra) o.extra(rig);
  hands(rig, 1.12 * (o.handScale || 1), ['relax', 'grip', 'fist', 'point', 'flat']);
  finish(rig);
  return rig;
}

const DAVID_COLORS = { shirt: '#e3dccb', vest: '#a34a2d', trousers: '#5d574d', boots: '#4a3626' };
const DAVID_HAT = { color: '#6c5134', band: '#3b2c1e', dent: 0.16, pinch: 0.12, up: 0.3, sideUp: 0.45, tilt: [-0.1, 0, 0.05] };
function davidBody(id, o = {}) {
  return manBody(id, { height: 1.78, dims: DAVID_DIMS, head: DAVID_HEAD, colors: DAVID_COLORS, hat: o.hat === false ? null : DAVID_HAT, ...o });
}

function buildDavid() {
  const rig = davidBody('david');
  lifeIdle(rig, { breath: 0.012, sway: 0.012, look: 0.1 });
  const pocket = pocketTarget(rig, 'R');
  const POCKETS = rig.solve({
    torso: [0.01, -0.04, 0.02], head: [-0.02, 0.08, -0.05], legL: [0, 0, 0.035], legR: [-0.02, 0, -0.06], kneeR: [0.06, 0, 0], footR: [0, 0.18, 0.03],
  }, {
    R: { pos: pocket.pos, pole: pocket.pole, hand: [0, 0, 0] },
    L: { pos: [rig.dims.shoulderX * 1.15, rig.Y.hip - 0.12, 0.04], pole: [1, 0, -1], hand: [0.15, -0.25, 0.08] },
  });
  rig.POSES = { POCKETS };
  rig.setPose(POCKETS);
  rig.hideHand('R', true);
  rig.setHand('L', 'relax');
  davidRod(rig);
  rig.play('idle'); rig.apply();
  return rig;
}

/** David 的鱼竿（第一灾原作：竖握竹竿 → 侧身举竿后仰 → 甩出去 → 等待 → 提起钓到的虾）。 */
function davidRod(rig) {
  const M = rig.mats, J = rig.joints, Y = rig.Y;
  const rodMount = new THREE.Group(); rodMount.name = 'david_rod';
  J.handR.add(rodMount);
  rodMount.position.set(0, -0.07, 0.01);
  const ROD = 2.4;
  let stickObj = null;
  const sp = tryProp('stick');
  if (sp) stickObj = fitAlongY(sp, ROD);
  if (!stickObj) { stickObj = new THREE.Group(); stickObj.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, ROD, 10).translate(0, ROD / 2, 0), M.toon('#d8c79c'))); }
  rodMount.add(stickObj);
  const rodTip = new THREE.Object3D(); rodMount.add(rodTip);
  rodMount.visible = false;
  const SEG = 18;
  const lineMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true), M.unlit('#151515'), SEG);
  lineMesh.name = 'david_line'; lineMesh.frustumCulled = false; lineMesh.visible = false;
  rig.root.add(lineMesh);
  const lineEnd = new THREE.Group(); lineEnd.name = 'david_line_end'; rig.root.add(lineEnd);
  const hookG = new THREE.Group(); hookG.name = 'david_hook'; lineEnd.add(hookG);
  const hp = tryProp('hook');
  const hookObj = (hp && fitSize(hp, 0.11)) || new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.003, 6, 12, Math.PI * 1.3), M.toon('#1a1a1a'));
  hookG.add(hookObj);
  const hookProxy = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.unlit('#ff00ff')); hookProxy.position.y = -0.05; hookProxy.visible = false; hookProxy.name = 'david_hook_proxy'; hookG.add(hookProxy);
  const wp = tryProp('worm');
  const wormObj = (wp && fitSize(wp, 0.12)) || new THREE.Mesh(sphere(0.01, 0.03, 0.01), M.toon('#8c7486'));
  wormObj.name = 'david_worm'; wormObj.position.set(0.03, -0.075, 0); hookG.add(wormObj);
  const shrimpG = new THREE.Group(); shrimpG.name = 'david_shrimp'; lineEnd.add(shrimpG);
  const shp = tryProp('shrimp');
  const shrimpObj = (shp && fitSize(shp, 0.22)) || new THREE.Mesh(sphere(0.03, 0.08, 0.03), M.toon('#e0603a'));
  shrimpObj.position.set(0, -0.12, 0); shrimpObj.rotation.set(0, 0, -1.3); shrimpG.add(shrimpObj);
  hookG.visible = false; wormObj.visible = false; shrimpG.visible = false;

  // 竿在 root 空间的状态：握点 g、方向 d、握在离竿尾 grip 处
  const R = rig.rod = { stage: 'none', g: V(-0.2, Y.shoulder - 0.12, 0.17), d: V(0, 1, 0.03), grip: 1.25, left: 0, lk: 0.34, castK: 0, len: 1.15, sway: 1, end: V(-6, -0.9, 3.5), sag: 1.4 };
  const _d = V(), _a = V(), _b = V(), _tip = V(), _end = V(), _ctrl = V(), _dir = V(), _q = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = V(), _p = V();
  const UP = V(0, 1, 0);
  const tmpL = { armL: [0, 0, 0], elbowL: [0, 0, 0] };
  function updateRod() {
    if (R.stage === 'none') return;
    _d.copy(R.d).normalize();
    rig.ikArm('R', R.g, [-0.6, -1, -0.2]);
    if (R.left > 0) {
      _a.copy(R.g).addScaledVector(_d, -R.lk);
      rig.ikArm('L', _a, [0.6, -1, -0.3], tmpL);
      const k = R.left;
      J.armL.rotation.set(lerp(rig.pose.armL[0], tmpL.armL[0], k), lerp(rig.pose.armL[1], tmpL.armL[1], k), lerp(rig.pose.armL[2], tmpL.armL[2], k));
      J.elbowL.rotation.set(lerp(rig.pose.elbowL[0], tmpL.elbowL[0], k), 0, 0);
    }
    J.armR.rotation.set(...rig.pose.armR); J.elbowR.rotation.set(...rig.pose.elbowR);
    stickObj.position.y = -R.grip;
    rodTip.position.y = ROD - R.grip;
    rig.root.updateMatrixWorld(true);
    _m.copy(rig.root.matrixWorld).invert().multiply(J.handR.matrixWorld).decompose(_p, _q, _s);
    _rq.setFromUnitVectors(UP, _d);
    rodMount.quaternion.copy(_q).invert().multiply(_rq);
    rodMount.updateMatrixWorld(true);
    if (!lineMesh.visible) return;
    rig.jointToRoot(rodTip, _a.set(0, 0, 0), _tip);
    const t = rig._t, sw = Math.sin(t * 1.3) * 0.04 * R.sway, sw2 = Math.cos(t * 1.1) * 0.03 * R.sway;
    _end.set(_tip.x + sw - 0.05, _tip.y - R.len, _tip.z + sw2 + 0.03);
    if (R.castK > 0) _end.lerp(R.end, R.castK);
    _ctrl.copy(_tip).lerp(_end, 0.5);
    if (R.castK > 0) _ctrl.y = lerp(_ctrl.y, Math.max(_tip.y, _end.y) + R.sag * (1 - R.castK * 0.6), R.castK);
    const mi = new THREE.Matrix4();
    for (let i = 0; i < SEG; i++) {
      bez(_tip, _ctrl, _end, i / SEG, _a); bez(_tip, _ctrl, _end, (i + 1) / SEG, _b);
      _dir.subVectors(_b, _a); const l = _dir.length();
      _q.setFromUnitVectors(UP, _dir.multiplyScalar(1 / Math.max(1e-5, l)));
      mi.compose(_p.addVectors(_a, _b).multiplyScalar(0.5), _q, _s.set(0.0055, l * 1.02, 0.0055));
      lineMesh.setMatrixAt(i, mi);
    }
    lineMesh.instanceMatrix.needsUpdate = true;
    lineEnd.position.copy(_end);
  }
  const bez = (a, c, b, k, out) => { const u = 1 - k; return out.set(u * u * a.x + 2 * u * k * c.x + k * k * b.x, u * u * a.y + 2 * u * k * c.y + k * k * b.y, u * u * a.z + 2 * u * k * c.z + k * k * b.z); };
  rig._after.push(updateRod);
  const visuals = (stage) => {
    const s = ['none', 'stick', 'line', 'hook', 'worm'].indexOf(stage);
    rodMount.visible = s >= 1; lineMesh.visible = s >= 2; hookG.visible = s >= 3; wormObj.visible = s >= 4; shrimpG.visible = false;
  };
  const HOLD = { g: V(-0.2, Y.shoulder - 0.12, 0.17), d: V(0.02, 1, 0.04), grip: 1.25, left: 0, castK: 0, len: 1.15, sway: 1 };
  rig.setRod = async (stage = 'none', { instant = false } = {}) => {
    Object.assign(R, { ...HOLD, g: HOLD.g.clone(), d: HOLD.d.clone() });
    if (stage === 'none') {
      R.stage = 'none'; visuals('none'); rig.hideHand('R', true);
      await rig.tweenPose(rig.POSES.POCKETS, 500, Ease.inOutSine, instant);
      return;
    }
    rig.hideHand('R', false); rig.setHand('R', 'grip'); visuals(stage);
    const target = rig.solve({ ...rig.POSES.POCKETS, torso: [0, 0.06, 0.02], head: [-0.02, 0.16, -0.03] }, { R: { pos: HOLD.g.toArray(), pole: [-0.6, -1, -0.2] } });
    if (R.stage === 'none' && !instant) await rig.tweenPose(target, 450, Ease.outSine); else rig.setPose(target);
    R.stage = stage; rig.apply();
  };
  rig.showShrimp = (v = true) => { shrimpG.visible = v; return Promise.resolve(); };
  /** 原作 03:39–03:51：侧身双手举竿过肩、后仰（约 2 s）→ 向前甩出 → 等鱼上钩 → 斜举鱼竿提起虾。 */
  rig.castAndCatch = async ({ instant = false } = {}) => {
    if (R.stage === 'none') await rig.setRod('worm', { instant: true });
    const P0 = rig.POSES.POCKETS;
    const side = { ...P0, body: [0, -0.9, 0], torso: [0.04, -0.1, 0.02], head: [0, 0.75, -0.02], legL: [-0.32, 0, 0.06], kneeL: [0.2, 0, 0], footL: [0.12, 0, 0], legR: [0.18, 0, -0.06], kneeR: [0.05, 0, 0] };
    const FINAL = { g: V(-0.05, Y.shoulder - 0.15, 0.32), d: V(-0.62, 0.74, 0.25), grip: 0.7, lk: 0.42, left: 1, castK: 0, len: 0.85, sway: 1 };
    const finalPose = { ...side, torso: [0.06, -0.12, 0.03], head: [0.04, 0.6, -0.02] };
    rig.setHand('L', 'grip'); rig.hideHand('L', false);
    if (instant) { Object.assign(R, FINAL); visuals('hook'); shrimpG.visible = true; rig.setPose(finalPose); return; }
    const tw = (to, ms, ease = Ease.inOutSine) => {
      const keys = Object.keys(to), from = keys.map((k) => (R[k]?.isVector3 ? R[k].clone() : R[k]));
      return animate(ms, (e) => { keys.forEach((k, i) => { if (to[k].isVector3) R[k].lerpVectors(from[i], to[k], e); else R[k] = from[i] + (to[k] - from[i]) * e; }); rig.apply(); }, ease);
    };
    await Promise.all([tw({ g: V(-0.16, Y.shoulder - 0.1, 0.22), d: V(0, 1, 0), left: 1, grip: 0.9 }, 450), rig.tweenPose(side, 450)]);
    await Promise.all([
      tw({ g: V(0.02, Y.shoulder + 0.32, -0.06), d: V(0.3, 0.68, -0.66), grip: 0.55 }, 1700, Ease.inOutSine),
      rig.tweenPose({ torso: [-0.24, -0.1, 0.1], head: [-0.22, 0.65, 0], legL: [-0.4, 0, 0.06], kneeL: [0.35, 0, 0], legR: [0.22, 0, -0.06] }, 1700),
    ]);
    R.castK = 0; R.end.set(-6.5, -0.95, 3.5); R.sag = 1.6;
    await Promise.all([
      tw({ g: V(-0.12, Y.shoulder - 0.08, 0.34), d: V(-0.75, 0.45, 0.48), castK: 1, sway: 0, grip: 0.5 }, 480, Ease.outCubic),
      rig.tweenPose({ torso: [0.2, -0.16, 0], head: [0.1, 0.6, -0.04], legL: [-0.2, 0, 0.06], kneeL: [0.1, 0, 0], legR: [0.2, 0, -0.06], kneeR: [0.2, 0, 0] }, 480, Ease.outCubic),
    ]);
    wormObj.visible = false;
    await animate(2800, (e) => { R.d.y = 0.45 + Math.sin(e * 14) * 0.012 * (e > 0.8 ? 3 : 1); R.sag = lerp(1.6, -0.6, smooth(clamp(e * 3, 0, 1))); rig.apply(); }, Ease.linear);
    shrimpG.visible = true;
    await Promise.all([tw({ ...FINAL, sway: 1 }, 900, Ease.inOutCubic), rig.tweenPose(finalPose, 900, Ease.inOutCubic)]);
  };
}

// ===========================================================================
// 公共：坐姿
// ===========================================================================

/**
 * 坐在高 seatY 的凳 / 椅面上：髋部降下来、大腿前伸、小腿自然垂到地面、脚掌放平。
 * 返回姿势字典（含 'body.p' 位移），可与其它关节合并后 rig.solve / setPose。
 */
function seatedPose(rig, seatY, { spread = 0.1, thigh = 1.5, back = -0.03, footOut = 0.04 } = {}) {
  const D = rig.dims, Y = rig.Y;
  const hip = seatY + 0.05 * D.height / 1.78;
  const dy = hip - D.hipY;
  const kneeY = hip - D.thigh * Math.cos(thigh);
  const phi = Math.acos(clamp((kneeY - Y.ankle) / D.shin, -1, 1)) + footOut;
  const k = thigh - phi;
  return {
    'body.p': [0, dy, back],
    legL: [-thigh, 0, spread], kneeL: [k, 0, 0], footL: [phi, 0, -spread * 0.5],
    legR: [-thigh, 0, -spread], kneeR: [k, 0, 0], footR: [phi, 0, spread * 0.5],
  };
}

/** 合并多个姿势字典（后者覆盖前者）。 */
const P = (...ps) => Object.assign({}, ...ps.map((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.slice()]))));

// ===========================================================================
// JAKOB — 主角（第一人称；只在倒影、开场划船和第四灾父子回忆里出现）：赤褐短发、敞领白衬衫
// ===========================================================================

const SKIN_JAKOB = '#e2d8cb';
function paintJakob(g, v) {
  for (const s of [-1, 1]) {
    bags(g, s * 0.35, 0.03, 0.16, 0.08, s, { depth: 1.3, lines: 1, color: 'rgba(80,70,78,0.28)' });
    eye(g, s * 0.35, 0.03, 0.16, 0.082, s, { skin: SKIN_JAKOB, lid: v === 'blink' ? 1 : 0.45, closed: v === 'blink', droop: 0.22, pupil: 0.58, lw: 5.5, crease: false });
    brow(g, [[s * 0.14, 0.2], [s * 0.36, 0.235], [s * 0.58, 0.195]], 9, '#5a3420');
  }
  line(g, [[-0.08, 0.08], [-0.1, -0.16], [-0.04, -0.24]], 3.5, 'rgba(20,20,20,0.55)');
  if (v === 'talk') blob(g, [[-0.15, -0.55], [0, -0.52], [0.15, -0.55], [0, -0.66]], '#3a1a1a');
  else line(g, [[-0.17, -0.57], [0, -0.555], [0.17, -0.58]], 5.5);
  line(g, [[-0.07, -0.82], [0, -0.84], [0.07, -0.82]], 3, 'rgba(20,20,20,0.45)');
}

function jakobBody(id, { child = false, hat = false, vestColor = null } = {}) {
  const H = child ? 1.3 : 1.76;
  return manBody(id, {
    height: H, seed: 41,
    dims: child ? { head: 0.088, headW: 0.8, headD: 0.86, shoulderW: 0.095, hip: 0.5, knee: 0.27, upper: 0.165, fore: 0.142, neck: 0.815 } : { head: 0.073, headW: 0.74, shoulderW: 0.1 },
    head: { skin: SKIN_JAKOB, jaw: child ? 0.15 : 0.28, chin: child ? 0.08 : 0.18, crown: 0.12, flat: 0.13, nose: child ? { top: 0.08, y: -0.24, len: 0.018, w: 0.011, tip: 1.05, wing: 0.6 } : { top: 0.08, y: -0.27, len: 0.026, w: 0.0122 }, paint: paintJakob },
    colors: { shirt: '#e7e1d4', vest: vestColor || '#9a3a2a', trousers: child ? '#6b665c' : '#5a4a3a', boots: '#3d2d22' },
    build: child ? { hip: [0.15, 0.11], waist: [0.145, 0.105], chest: [0.155, 0.11], shoulder: 0.165 } : { hip: [0.13, 0.1], waist: [0.128, 0.1], chest: [0.152, 0.108], shoulder: 0.16 },
    vest: !!vestColor, breeches: child, bootTop: 0.45, boots: child ? undefined : false, turnUp: !child,
    hair: { color: '#8a4a2a', line: '#4a2412', seed: 19, cap: { front: 0.29 * Math.PI, side: 0.44 * Math.PI, back: 0.64 * Math.PI, scale: 1.07, top: 0.07, quiff: 0.1 } },
    hat: hat ? { color: '#6a4a32', band: '#3c2a1c', dent: 0.1, up: 0.15, sideUp: 0.2 } : null,
    handScale: child ? 1.15 : 1,
  });
}

function buildJakob({ id = 'jakob', bust = true, seated = false, small = false, hat = false } = {}) {
  const rig = jakobBody(id, { hat, vestColor: small ? '#9a3a2a' : null });
  rig.setBust = (v = true) => { rig.showTag('trousers', !v); rig.showTag('hips', !v); rig.showTag('boots', !v); rig.showTag('shoe', !v); };
  const stand = P(armsDown(rig), { head: [0.05, 0, 0] });
  rig.setPose(seated ? P(stand, seatedPose(rig, 0.34)) : stand);
  if (bust && !seated) rig.setBust(true);
  lifeIdle(rig, { breath: 0.01, sway: 0.006, look: 0.06, seated });
  rig.play('idle'); rig.apply();
  return rig;
}

/** 少年 Jakob（第四灾父子回忆）：白衬衫、灰裤、靴子，站在坐着的父亲身边。 */
function buildJakobChild() {
  const rig = jakobBody('jakob_child', { child: true });
  rig.setPose(P(armsDown(rig, { spread: 0.06, bend: 0.1 }), { head: [0.06, -0.15, 0] }));
  lifeIdle(rig, { breath: 0.012, sway: 0.008, look: 0.05 });
  rig.play('idle'); rig.apply();
  return rig;
}

// ===========================================================================
// GERARD — 叔叔：壮实、啤酒肚，灰色窄檐软呢帽、姜色卷翘八字胡 + 尖山羊胡、大翻领衬衫卷袖、敞开的棕马甲，
// 双手插兜（第二灾 00:57）。吞钥匙：抬起左手把钥匙举过头顶晃一晃，仰头张嘴丢进去（01:01–01:07）。
// ===========================================================================

const SKIN_GERARD = '#d8cbbd';
const GINGER = '#8a5530';
function paintGerard(g, v) {
  const closed = v === 'blink' || v === 'squeeze', shock = v === 'shock', tired = v === 'tired';
  stubble(g, 23, [[-0.5, -0.45], [0.5, -1.0]], 0.18);
  for (const s of [-1, 1]) {
    bags(g, s * 0.34, 0.04, 0.18, 0.09, s, { depth: 1.6, lines: 1, color: 'rgba(75,63,65,0.3)' });
    eye(g, s * 0.34, 0.04, 0.175, shock ? 0.13 : 0.085, s, {
      skin: SKIN_GERARD, lid: shock ? 0.08 : tired ? 0.72 : 0.58, pupil: shock ? 0.32 : 0.52, closed, squeeze: v === 'squeeze', droop: 0.12, lw: 6, crease: false,
    });
    // 眉头下压：内端低、外端高
    brow(g, shock ? [[s * 0.12, 0.25], [s * 0.33, 0.3], [s * 0.58, 0.24]] : [[s * 0.11, 0.17], [s * 0.32, 0.25], [s * 0.6, 0.2]], 9, '#5a3a26');
    line(g, [[s * 0.3, -0.22], [s * 0.44, -0.42], [s * 0.4, -0.62]], 3, 'rgba(60,50,46,0.55)');
  }
  line(g, [[-0.07, 0.04], [-0.1, -0.16], [-0.05, -0.25], [0.08, -0.26]], 4, 'rgba(20,20,20,0.7)');
  if (v === 'talk' || v === 'squeeze' || v === 'gape') blob(g, [[-0.15, -0.49], [0, -0.56], [0.16, -0.49], [0.08, v === 'gape' ? -0.78 : -0.66], [-0.08, v === 'gape' ? -0.77 : -0.65]], '#321e1a');
  else line(g, [[-0.16, -0.53], [0, -0.57], [0.16, -0.53]], 5);
}

/** 3D 胡子：两撇向外上卷的八字胡 + 下巴的尖山羊胡。 */
function gerardBeard(rig) {
  const M = rig.mats, J = rig.joints, def = rig.headDef;
  const beard = M.toon('#ffffff', { map: hairStrands(GINGER, '#4e2d1c', 61), outline: 0.003 });
  const at = (fx, fy, lift = 0) => { const p = headSurface(def, fx, fy); return p.add(V(0, 0, lift)); };
  for (const s of [-1, 1]) {
    const a = at(s * 0.03, -0.39, 0.012), b = at(s * 0.22, -0.4, 0.014), c = at(s * 0.42, -0.42, 0.01), d = at(s * 0.56, -0.3, 0.004), e = at(s * 0.52, -0.2, 0.002);
    rig.ps.add(J.head, lockGeo([a, b, c, d, e], 0.012, 0.007, { tip: 0.18, seg: 30 }), beard, 'beard');
  }
  const top = at(0, -0.72, 0.006), mid = at(0, -0.9, 0.02), tip = at(0, -1.0, 0.04).add(V(0, -0.045, 0.01));
  rig.ps.add(J.head, lockGeo([top, mid, tip], 0.014, 0.008, { tip: 0.1, seg: 20 }), beard, 'beard');
}

function gerardBody(id, { hat = true, beard = true } = {}) {
  return manBody(id, {
    height: 1.84, seed: 61,
    dims: { head: 0.0745, headW: 0.8, headD: 0.86, shoulderW: 0.104, hip: 0.5, upper: 0.165, fore: 0.145, neck: 0.83 },
    head: { skin: SKIN_GERARD, jaw: 0.16, chin: 0.1, crown: 0.08, flat: 0.12, cheek: 0.1, nose: { top: 0.1, y: -0.27, len: 0.03, w: 0.0145, tip: 1.15, wing: 0.8 }, paint: paintGerard, neck: [0.052, 0.058] },
    colors: { shirt: '#e2dbd1', vest: '#804a2e', trousers: '#685642', boots: '#5e3f2a' },
    build: { hip: [0.145, 0.112], waist: [0.14, 0.108], chest: [0.166, 0.118], shoulder: 0.168, belly: 0.05 },
    breeches: false, bootTop: 0.42, turnUp: true, collarOpen: 0.42, buttons: 7,
    hair: { color: '#9a5a33', line: '#4e2d1c', seed: 63, cap: { front: 0.3 * Math.PI, side: 0.5 * Math.PI, back: 0.66 * Math.PI, scale: 1.04, top: 0.02 } },
    hat: hat ? { color: '#a7a094', band: '#76716a', r: 0.118, h: 0.125, brim: 0.05, dent: 0.18, pinch: 0.16, up: 0.18, sideUp: 0.3, y: 0.042, tilt: [-0.05, 0, -0.07], seed: 82 } : null,
    extra: beard ? gerardBeard : null, handScale: 1.12,
  });
}

function gerardPockets(rig) {
  const L = pocketTarget(rig, 'L'), R = pocketTarget(rig, 'R');
  return rig.solve({ torso: [-0.03, 0.04, 0], head: [0.03, 0.12, 0.02], legL: [0, 0, 0.05], legR: [0, 0, -0.05] }, {
    L: { pos: L.pos, pole: L.pole, hand: [0, 0, 0] }, R: { pos: R.pos, pole: R.pole, hand: [0, 0, 0] },
  });
}

/** 人形 Gerard（第二灾森林、第四灾地坑、第五灾餐桌 / 厕所都用这一个）。 */
function buildGerardHuman() {
  const rig = gerardBody('gerard');
  const M = rig.mats, Y = rig.Y;
  lifeIdle(rig, { breath: 0.016, sway: 0.01, look: 0.08 });
  const pockets = gerardPockets(rig);
  rig.POSES = { pockets };
  const prop = (id, s) => { const f = getPropFactory(); try { const o = f ? f(id) : null; if (o) o.scale.setScalar(s); return o; } catch (e) { return null; } };
  const holder = (o, name) => { const g = new THREE.Group(); g.name = name; if (o) g.add(o); g.visible = false; rig.root.add(g); return g; };
  const bowl = holder(prop('bowl_key', 1.5), 'gerard_bowl'); rig.bowlObj = bowl;
  bowl.position.set(0, Y.chest - 0.12, 0.33);   // 碗的特写镜头在定义时按这个位置取景
  const key = holder(prop('key', 0.75), 'gerard_key');
  const soup = holder(prop('frog_soup', 1.5), 'gerard_soup');
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.013, 0.32, 10), M.toon('#83b42b', { outline: false })); stream.visible = false; rig.root.add(stream);
  const mouth = () => rig.jointToRoot(rig.joints.head, V(0, -rig.dims.headR[1] * 0.55, rig.dims.headR[2] * 1.05), V());
  const hand = (s) => rig.jointToRoot(rig.joints['hand' + s], V(0, -0.07, 0.02), V());
  // 吞钥匙用左手（画面右侧那只），举到头顶偏外
  const raised = rig.solve(P(pockets, { head: [-0.34, 0.05, 0], neck: [-0.08, 0, 0], torso: [-0.06, 0.02, 0] }), { L: { pos: [0.2, Y.crown + 0.02, 0.1], pole: [1, -0.2, -0.3], hand: [0.3, 0, 0.4] } });
  const hold = rig.solve(P(pockets, { torso: [0.16, 0, 0], head: [0.12, 0, 0] }), {
    L: { pos: [0.12, Y.chest - 0.14, 0.32], pole: [1, -0.3, -0.7], hand: [0, 0, -1.4] }, R: { pos: [-0.12, Y.chest - 0.14, 0.32], pole: [-1, -0.3, -0.7], hand: [0, 0, 1.4] },
  });
  const drinkPose = rig.solve(P(pockets, { head: [-0.28, 0, 0], neck: [-0.06, 0, 0] }), { R: { pos: [-0.06, Y.chin - 0.02, 0.2], pole: [-1, -0.2, -0.5], hand: [0, 0, 0.6] } });
  let bowlHeld = false, action = false;
  const show = (s, v) => { rig.hideHand(s, !v); if (v) rig.setHand(s, 'grip'); };
  rig.reset = () => {
    bowlHeld = false; action = false;
    for (const o of [bowl, key, soup, stream]) o.visible = false;
    rig.setPose(pockets); show('L', false); show('R', false); rig.setExpression('neutral');
  };
  rig.swallowKey = ({ instant = false } = {}) => {
    if (instant) { key.visible = false; return Promise.resolve(); }
    action = true; key.visible = true; show('L', true); rig.setHand('L', 'pinch');
    return playKeys(rig, [[0.22, raised], [0.62, raised], [0.85, P(raised, { head: [-0.05, 0.08, 0] })], [1, pockets]], 5800, {
      onFrame: (k) => {
        // 钥匙先在指尖晃，然后掉进张开的嘴里
        const fall = smooth(clamp((k - 0.42) / 0.16, 0, 1));
        const h = rig.jointToRoot(rig.joints.handL, V(0, -0.11, 0.02), V()), m = mouth();
        key.position.lerpVectors(h.add(V(0, -0.07, 0)), m, fall);
        key.rotation.z = Math.sin(k * 40) * 0.25 * (1 - fall);
        key.visible = k < 0.585;
        rig.setExpression(k > 0.3 && k < 0.66 ? 'gape' : 'neutral');
        if (k >= 1) { action = false; show('L', false); }
      },
    });
  };
  rig.drinkSoup = ({ instant = false } = {}) => {
    if (instant) { rig.setExpression('shock'); return Promise.resolve(); }
    action = true; soup.visible = true; show('R', true);
    return playKeys(rig, [[0.25, drinkPose], [0.75, drinkPose], [1, pockets]], 3400, {
      onFrame: (k) => {
        soup.position.copy(hand('R')).add(V(0.02, 0.02, 0.04)); soup.rotation.x = -smooth(clamp((k - 0.22) / 0.3, 0, 1)) * 0.9;
        soup.visible = k < 0.9; stream.visible = k > 0.3 && k < 0.7; stream.position.copy(mouth()).add(V(0, 0.08, 0.03));
        rig.setExpression(k < 0.8 ? 'talk' : 'shock');
        if (k >= 1) { stream.visible = false; action = false; show('R', false); }
      },
    });
  };
  rig.holdBowl = (on, { instant = false } = {}) => {
    bowlHeld = on; bowl.visible = on;
    for (const s of ['L', 'R']) { rig.hideHand(s, !on); if (on) rig.setHand(s, 'relax'); }
    return rig.tweenPose(on ? hold : pockets, 650, Ease.inOutSine, instant);
  };
  rig.vomit = ({ instant = false } = {}) => {
    bowlHeld = true; bowl.visible = true;
    const end = () => { rig.setPose(hold); rig.setExpression('tired'); stream.visible = false; action = false; };
    if (instant) { end(); return Promise.resolve(); }
    action = true;
    return playKeys(rig, [[0.45, P(hold, { torso: [0.42, 0, 0], head: [0.36, 0, 0] })], [0.8, P(hold, { torso: [0.38, 0, 0], head: [0.4, 0, 0] })], [1, hold]], 3500, {
      onFrame: (k) => { stream.visible = k > 0.42 && k < 0.78; stream.position.copy(mouth()).add(V(0, -0.12, 0.05)); rig.setExpression(k > 0.35 && k < 0.85 ? 'squeeze' : 'shock'); if (k >= 1) end(); },
    });
  };
  rig._upd.push(() => { if (bowlHeld && !action) { const a = hand('L'), b = hand('R'); bowl.position.addVectors(a, b).multiplyScalar(0.5).add(V(0, 0.02, 0.02)); } });
  // ---- 第四灾：蜷缩在地坑里；第五灾：坐在餐桌前 / 厕所里，吃汉堡 ----
  rig.curlUp = ({ instant = true } = {}) => {
    show('L', true); show('R', true); rig.setHand('L', 'relax'); rig.setHand('R', 'relax');
    const curl = rig.solve({ 'body.p': [-0.32, -Y.hip + 0.18, 0], body: [0, 0, 1.5], torso: [0.85, 0, 0], neck: [0.3, 0, 0], head: [0.35, 0.25, 0], legL: [-2.0, 0, 0.12], kneeL: [2.3, 0, 0], legR: [-1.9, 0, -0.04], kneeR: [2.35, 0, 0], footL: [0.5, 0, 0], footR: [0.5, 0, 0] }, {
      L: { pos: [0.02, Y.hip + 0.2, 0.32], pole: [1, -0.5, 0], hand: [0, 0, -0.4] }, R: { pos: [-0.08, Y.hip + 0.26, 0.3], pole: [-1, -0.5, 0], hand: [0, 0, 0.4] },
    });
    return rig.tweenPose(curl, 800, Ease.inOutSine, instant);
  };
  rig.sit = (seatY = 0.47, { hands: hp = 'table', instant = true } = {}) => {
    const base = P(pockets, seatedPose(rig, seatY), { torso: [0.08, 0, 0], head: [0.06, 0.1, 0] });
    const targets = hp === 'knees' ? {
      L: { pos: [0.12, seatY + 0.13, 0.36], pole: [1, -0.2, -0.6], hand: [0.6, 0, 0] }, R: { pos: [-0.12, seatY + 0.13, 0.36], pole: [-1, -0.2, -0.6], hand: [0.6, 0, 0] },
    } : {
      L: { pos: [0.16, seatY + 0.32, 0.36], pole: [1, -0.6, -0.3], hand: [0.2, 0, -0.5] }, R: { pos: [-0.16, seatY + 0.32, 0.36], pole: [-1, -0.6, -0.3], hand: [0.2, 0, 0.5] },
    };
    for (const s of ['L', 'R']) { rig.hideHand(s, false); rig.setHand(s, 'relax'); }
    rig.POSES.sit = rig.solve(base, targets);
    lifeIdle(rig, { breath: 0.016, sway: 0.008, look: 0.08, seated: true });
    return rig.tweenPose(rig.POSES.sit, 600, Ease.inOutSine, instant);
  };
  /** 双手捧着汉堡送到嘴边咬几口（第五灾 17:36）。burger：要拿在手里的模型（可省略）。 */
  rig.eatBurger = async (burger = null, { instant = false } = {}) => {
    if (instant) { if (burger) burger.visible = false; return; }
    const base = rig.POSES.sit || pockets;
    const bite = rig.solve(P(base, { head: [0.05, 0, 0] }), { L: { pos: [0.05, Y.chin - 0.05 + (base['body.p']?.[1] || 0), 0.22], pole: [1, -0.6, -0.2], hand: [0, 0, -1.2] }, R: { pos: [-0.05, Y.chin - 0.05 + (base['body.p']?.[1] || 0), 0.22], pole: [-1, -0.6, -0.2], hand: [0, 0, 1.2] } });
    if (burger) { rig.root.add(burger); burger.visible = true; }
    for (const s of ['L', 'R']) { rig.hideHand(s, false); rig.setHand(s, 'grip'); }
    const nod = P(bite, { head: [0.14, 0, 0] });
    await playKeys(rig, [[0.18, bite], [0.3, nod], [0.42, bite], [0.54, nod], [0.66, bite], [0.78, nod], [1, base]], 4200, {
      onFrame: (k) => {
        if (burger) { burger.position.addVectors(hand('L'), hand('R')).multiplyScalar(0.5).add(V(0, 0.02, 0.03)); burger.scale.setScalar(Math.max(0.001, 1 - smooth(clamp((k - 0.2) / 0.7, 0, 1)))); burger.visible = k < 0.9; }
        rig.setExpression(k > 0.15 && k < 0.85 ? (Math.floor(k * 18) % 2 ? 'talk' : 'neutral') : 'neutral');
      },
    });
    if (burger) burger.removeFromParent();
    for (const s of ['L', 'R']) rig.setHand(s, 'relax');
  };
  rig.reset();
  rig.play('idle'); rig.apply();
  return rig;
}

/** 戴野猪面具的 Gerard（记忆场景）：同一副身体，不戴帽子和胡子，双手插兜，头转向鹿。 */
function buildGerardBoar() {
  const rig = gerardBody('gerard_boar', { hat: false, beard: false });
  rig.headTags = ['head', 'face', 'hair', 'hat', 'neck', 'beard'];
  rig.maskScale = rig.dims.headR[0] / 0.105;
  rig.setPose(P(gerardPockets(rig), { head: [0.04, 0.16, 0.03], neck: [0, 0.05, 0] }));
  rig.hideHand('L', true); rig.hideHand('R', true);
  rig.setMask('boar');
  lifeIdle(rig, { breath: 0.012, sway: 0.008, look: 0.04 });
  rig.play('idle'); rig.apply();
  return rig;
}

// ===========================================================================
// NICHOLAS — 父亲：瘦高、长脸高颧骨，灰发后梳有蓬度、细八字胡，黑色燕尾服、白色高领 + 竖褶领巾，坐在高背椅上举着酒杯
// ===========================================================================

const SKIN_NICK = '#dcd8d2';
function paintNicholas(g, v) {
  for (const s of [-1, 1]) {
    bags(g, s * 0.34, 0.06, 0.16, 0.08, s, { depth: 1.8, lines: 1, color: 'rgba(110,108,112,0.5)' });
    eye(g, s * 0.34, 0.06, 0.155, v === 'wide' ? 0.11 : 0.078, s, { skin: SKIN_NICK, lid: v === 'blink' ? 1 : v === 'wide' ? 0.1 : 0.44, closed: v === 'blink', droop: 0.05, pupil: v === 'wide' ? 0.4 : 0.6, lw: 5.5, crease: false });
    // 严厉的眉：灰色，内低外高
    blob(g, [[s * 0.12, 0.17], [s * 0.34, 0.27], [s * 0.6, 0.27], [s * 0.36, 0.215]], '#8b8b8b');
    line(g, [[s * 0.12, 0.165], [s * 0.36, 0.205], [s * 0.6, 0.25]], 4.5);
    line(g, [[s * 0.55, -0.12], [s * 0.6, -0.35], [s * 0.5, -0.62]], 3.5, 'rgba(20,20,20,0.55)');
    line(g, [[s * 0.18, -0.34], [s * 0.28, -0.5]], 3, 'rgba(20,20,20,0.45)');
  }
  line(g, [[-0.06, 0.08], [-0.08, -0.16], [-0.03, -0.25]], 3.5, 'rgba(20,20,20,0.6)');
  // 细八字胡（两端略翘）
  blob(g, [[0.0, -0.385], [-0.15, -0.4], [-0.3, -0.5], [-0.33, -0.46], [-0.17, -0.45], [0, -0.44], [0.17, -0.45], [0.33, -0.46], [0.3, -0.5], [0.15, -0.4]], '#2a2a2a');
  if (v === 'talk') blob(g, [[-0.13, -0.58], [0, -0.55], [0.13, -0.58], [0, -0.68]], '#2a1515');
  else line(g, [[-0.15, -0.6], [0, -0.585], [0.15, -0.605]], 5);
  line(g, [[0, -0.86], [0, -0.92]], 3, 'rgba(20,20,20,0.5)');
}

function nicholasBody(id, { robe = false } = {}) {
  const H = 1.88;
  const rig = makeHuman(id, { height: H, dims: { head: 0.0745, headW: 0.66, headD: 0.84, shoulderW: 0.097, hip: 0.52, upper: 0.17, fore: 0.15 } });
  const Y = rig.Y, M = rig.mats, J = rig.joints;
  head(rig, { skin: SKIN_NICK, jaw: 0.36, chin: 0.3, crown: 0.12, flat: 0.12, cheek: -0.06, ear: { y: -0.02, s: 0.95 }, nose: { top: 0.12, y: -0.26, len: 0.03, w: 0.012, tip: 0.95, wing: 0.55, drop: -0.004 }, paint: paintNicholas, neck: [0.042, 0.047] });
  // 灰发：后梳、头顶蓬起（发际线高，前额饱满），两侧鬓角压平
  const hairM = M.toon('#ffffff', { map: hairStrands('#858583', '#3c3c3c', 7) });
  hairCap(rig, { front: 0.27 * Math.PI, side: 0.47 * Math.PI, back: 0.66 * Math.PI, scale: 1.07, top: 0.17, quiff: 0.45 }, hairM);
  const [rx, ry, rz] = rig.dims.headR;
  // 侧分处一缕向后梳的发卷，增加轮廓起伏
  rig.ps.add(J.head, lockGeo([V(rx * 0.35, ry * 0.86, rz * 0.62), V(rx * 0.55, ry * 1.12, rz * 0.12), V(rx * 0.6, ry * 1.0, -rz * 0.55), V(rx * 0.52, ry * 0.6, -rz * 0.98)], rx * 0.3, rx * 0.12, { tip: 0.6 }), hairM, 'hair');
  for (const s of [-1, 1]) rig.ps.add(J.head, place(sphere(rx * 0.1, ry * 0.2, rz * 0.12, 10, 8), [s * rx * 0.97, -ry * 0.02, rz * 0.02]), hairM, 'hair');
  if (robe) return { rig, H };
  const black = cloth(rig, '#2a2a2e', { seed: 31, folds: 10, ink: 0.75 });
  const white = cloth(rig, '#efeee9', { seed: 33, folds: 4, ink: 0.25 });
  // 白衬衫胸前 + 黑燕尾服（前襟敞开）
  const chest = [
    { y: Y.hip - 0.03, w: 0.128, d: 0.098 }, { y: Y.belt, w: 0.124, d: 0.096, cz: 0.004 }, { y: Y.waist + 0.05, w: 0.13, d: 0.1, cz: 0.008 },
    { y: Y.chest, w: 0.148, d: 0.106, cz: 0.012 }, { y: Y.armpit, w: 0.158, d: 0.1, cz: 0.006 }, { y: Y.shoulder - 0.005, w: 0.158, d: 0.086 },
    { y: Y.shoulder + 0.03, w: 0.118, d: 0.074, cz: -0.004 }, { y: Y.neck + 0.002, w: 0.062, d: 0.056, cz: -0.006 },
  ];
  torsoSkin(rig, chest, white, { tag: 'shirt' });
  torsoSkin(rig, chest.map((k, i) => ({ ...k, w: k.w * 1.07 + 0.005, d: k.d * 1.08 + 0.005, gap: [0.42, 0.4, 0.42, 0.55, 0.72, 0.95, 1.15, 1.3][i] })), black, { tag: 'coat', armBlend: 0.4 });
  // 宽翻领
  for (const s of [-1, 1]) {
    const pts = [V(s * 0.05, Y.neck - 0.01, 0.075), V(s * 0.085, Y.chest + 0.02, 0.118), V(s * 0.07, Y.waist + 0.08, 0.118)];
    torsoSkin(rig, null, black, { tag: 'coat', geo: ribbonGeo(pts, 0.055, { seg: 20, lift: 0.004, nrm: (p, o) => o.set(p.x * 3, 0, 1).normalize(), widthFn: (k) => 1.1 - k * 0.6 }) });
  }
  // 燕尾：腰以下前面开口，后片垂到膝弯
  skirtSkin(rig, [
    { y: Y.knee + 0.04, w: 0.17, d: 0.13, cz: -0.03, gap: 1.75 }, { y: Y.hip - 0.12, w: 0.165, d: 0.13, cz: -0.012, gap: 1.35 },
    { y: Y.hip + 0.02, w: 0.152, d: 0.122, gap: 0.9 }, { y: Y.waist + 0.02, w: 0.148, d: 0.112, cz: 0.008, gap: 0.5 },
  ], black, { tag: 'coat', radial: 48, pleat: (th, k) => 0.02 * (1 - k) * Math.cos(th * 5), follow: 0.6 });
  // 高领 + 竖褶领巾
  torsoSkin(rig, [
    { y: Y.neck - 0.015, w: 0.06, d: 0.056, cz: -0.004 }, { y: Y.neck + 0.05, w: 0.054, d: 0.052, cz: -0.006 }, { y: Y.neck + 0.08, w: 0.056, d: 0.054, cz: -0.008, gap: 0.3 },
  ], M.toon('#f2f1ec', { side: THREE.DoubleSide }), { tag: 'collar', radial: 28, steps: 2, armBlend: 0 });
  const jabot = M.toon('#ffffff', { map: fabric('#f1f0eb', { folds: 0, blocks: 0, stripes: ['rgba(30,30,30,0.6)', 3, 14] }), side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const y = Y.neck - 0.035 - i * 0.045, w = 0.032 + i * 0.004;
    torsoSkin(rig, null, jabot, { tag: 'jabot', geo: place(lathe([[w, -0.035], [w * 0.82, 0.0], [w * 0.4, 0.03]], 16, -1.15, 2.3), [0, y, 0.098 - i * 0.002], [0.45, 0, 0], [1, 1, 0.5]) });
  }
  longSleeves(rig, black, { r: 0.054, elbow: 0.046, wrist: 0.04, cuff: M.toon('#f2f1ec', { side: THREE.DoubleSide }), cuffW: 0.022 });
  trousers(rig, cloth(rig, '#2c2b2d', { seed: 35, folds: 9, ink: 0.6 }), { thigh: 0.078, knee: 0.058, ankle: 0.048, seat: [0.142, 0.112], breeches: false });
  shoes(rig, { w: 0.045, l: 0.18, z: 0.04 }, M.toon('#151515'), M.toon('#0d0d0d'));
  hands(rig, 1.1, ['grip', 'relax', 'point', 'flat']);
  finish(rig);
  return { rig, H };
}

function buildNicholas() {
  const { rig } = nicholasBody('nicholas');
  const J = rig.joints, Y = rig.Y, M = rig.mats;
  const seatY = 0.49;   // high_chair 的座面高度
  const dy = seatY + 0.05 * rig.dims.height / 1.78 - Y.hip;
  const sit = P(seatedPose(rig, seatY, { spread: 0.08 }), { torso: [0.03, 0, 0], neck: [0.02, 0, 0] });
  // 酒杯：用道具 wine_glass（第一灾玩家往里倒血），右手捏着杯脚，杯子始终竖直
  const glassWrap = new THREE.Group(); glassWrap.name = 'nicholas_glass';
  let glass = null;
  const gp = tryProp('wine_glass');
  if (gp) { const h = new THREE.Box3().setFromObject(gp).getSize(V()).y; if (h > 0.05 && h < 0.6) { gp.scale.multiplyScalar(0.21 / h); glass = gp; } }
  if (!glass) glass = fallbackGlass(M);
  glassWrap.add(glass);
  glassWrap.setFill = (k, o) => (glass.setFill ? glass.setFill(k, o) : Promise.resolve());
  glassWrap.showLeech = (v, o) => (glass.showLeech ? glass.showLeech(v, o) : Promise.resolve());
  glassWrap.inner = glass;
  const mount = new THREE.Group();
  J.handL.add(mount);
  mount.position.set(0.0, -0.08, 0.02);
  mount.add(glassWrap); glassWrap.position.set(0, -0.055, 0);
  rig.glass = glassWrap;
  rig.glassTilt = 0;
  const tiltQ = new THREE.Quaternion(), ax = V(1, 0, 0);
  holdUpright(rig, J.handL, mount, () => tiltQ.setFromAxisAngle(ax, rig.glassTilt));
  const rightOnLap = { pos: [-0.14, seatY + 0.17, 0.3], pole: [-1, 0, -1], hand: [0.5, 0, 0] };
  const leftOnLap = { pos: [0.14, seatY + 0.17, 0.3], pole: [1, 0, -1], hand: [0.5, 0, 0] };
  const hold = rig.solve(sit, { L: { pos: [0.22, Y.chin + dy - 0.1, 0.28], pole: [1, -1.2, -0.1], hand: [0, 0, 0] }, R: rightOnLap });
  const raise = rig.solve(P(sit, { head: [-0.08, 0, 0] }), { L: { pos: [0.07, Y.chin + dy - 0.06, 0.3], pole: [1, -0.8, -0.2], hand: [0, 0, 0] }, R: rightOnLap });
  const sip = rig.solve(P(sit, { head: [-0.32, 0, 0], neck: [-0.1, 0, 0], torso: [-0.06, 0, 0] }), { L: { pos: [0.035, Y.chin + dy - 0.03, 0.25], pole: [1, -0.8, -0.2], hand: [0, 0, 0] }, R: rightOnLap });
  const point = rig.solve(P(sit, { torso: [0.1, 0, 0], head: [0.12, 0, 0] }), { L: { pos: [0.08, seatY + 0.42, 0.55], pole: [1, 0.2, -0.6], hand: [-0.5, 0, 0] }, R: rightOnLap });
  rig.POSES = { hold, sip, raise, point, sit };
  rig.setPose(hold);
  rig.setHand('L', 'grip'); rig.setHand('R', 'relax');
  rig.drink = async ({ instant = false } = {}) => {
    glassWrap.visible = true;
    if (instant) { rig.glassTilt = 0; rig.setPose(hold); await glassWrap.setFill(0); await glassWrap.showLeech(true); return; }
    await rig.tweenPose(raise, 1000, Ease.inOutSine);
    const t0 = rig.glassTilt;
    await Promise.all([rig.tweenPose(sip, 1000, Ease.inOutSine), animate(1000, (e) => { rig.glassTilt = lerp(t0, -1.0, e); })]);
    const fill0 = glass.getFill ? glass.getFill() : (glass.userData?.fill ?? 0.66);
    await animate(2600, (e) => { rig.glassTilt = lerp(-1.0, -1.5, e); glassWrap.setFill(fill0 * (1 - e)); rig.pose.head[0] = sip.head[0] - 0.12 * e; rig.apply(); }, Ease.inOutSine);
    await glassWrap.setFill(0);
    await Promise.all([rig.tweenPose(hold, 1100, Ease.inOutSine), animate(1100, (e) => { rig.glassTilt = lerp(-1.45, 0, e); })]);
    await glassWrap.showLeech(true);
  };
  rig.pointAtPlate = async ({ instant = false } = {}) => { glassWrap.visible = false; rig.setHand('L', 'point'); await rig.tweenPose(point, 800, Ease.inOutSine, instant); };
  const lapR = rig.solve(sit, { R: rightOnLap, L: leftOnLap });
  rig.hideGlass = (v = true) => {
    glassWrap.visible = !v;
    if (v) { rig.setPose(lapR); rig.setHand('L', 'relax'); }
    return Promise.resolve();
  };
  rig.holdGlass = async ({ instant = false } = {}) => { glassWrap.visible = true; rig.setHand('L', 'grip'); await rig.tweenPose(hold, 700, Ease.inOutSine, instant); };
  /** 第四灾：坐着双手捧着黑方块举在脸旁（18:30）。返回挂方块的节点（方块位于两手之间）。 */
  rig.holdCube = ({ instant = true } = {}) => {
    glassWrap.visible = false;
    const pose = rig.solve(P(sit, { torso: [0.12, 0.25, 0], head: [0.05, 0.25, 0.05] }), {
      R: { pos: [-0.12, Y.chin + dy - 0.03, 0.28], pole: [-1, -0.5, -0.2], hand: [0, 0, 1.3] },
      L: { pos: [0.0, Y.chin + dy - 0.05, 0.3], pole: [1, -0.5, -0.4], hand: [0, 0, -1.4] },
    });
    rig.setHand('R', 'flat'); rig.setHand('L', 'flat');
    if (!rig.cubeMount) {
      rig.cubeMount = new THREE.Group(); rig.cubeMount.name = 'nicholas_cube_mount'; rig.root.add(rig.cubeMount);
      const a = V(), b = V();
      rig._after.push(() => { rig.jointToRoot(J.handR, a.set(0, -0.08, 0.03), a); rig.jointToRoot(J.handL, b.set(0, -0.08, 0.03), b); rig.cubeMount.position.addVectors(a, b).multiplyScalar(0.5); });
    }
    const p = rig.tweenPose(pose, 700, Ease.inOutSine, instant);
    return p.then(() => rig.cubeMount);
  };
  /** 第五灾：整个头缠着绷带（setBandage(false) 拆掉）。 */
  rig.setBandage = (on = true) => {
    if (!rig.bandage) {
      const b = new THREE.Group(); b.name = 'nicholas_bandage';
      const s = new THREE.SphereGeometry(1.08, 40, 30), p = s.attributes.position, v = V();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); rig.headDef(v); p.setXYZ(i, v.x * 1.04, v.y * 1.02 + 0.004, v.z * 1.06); }
      s.computeVertexNormals();
      const tex = canvasTexture(256, 256, (g, w, h) => {
        g.fillStyle = '#e9e6dc'; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(110,106,96,0.75)'; g.lineWidth = 3;
        for (let y = -h; y < h * 2; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 60); g.stroke(); }
      });
      b.add(new THREE.Mesh(s, M.toon('#ffffff', { map: tex })));
      J.head.add(b);
      rig.bandage = b;
    }
    rig.bandage.visible = on;
    rig.showTag('hair', !on);
    if (rig.face?.mesh) rig.face.mesh.visible = !on;
    return Promise.resolve();
  };
  /** 第四灾回忆：坐在凳子上，右手搭在身旁孩子的肩上（at：root 空间里手的位置）。 */
  rig.restHandOn = (at, { side = 'L', instant = true } = {}) => {
    glassWrap.visible = false; rig.setHand(side, 'flat'); rig.setHand(side === 'L' ? 'R' : 'L', 'relax');
    const s = side === 'L' ? 1 : -1;
    const other = side === 'L' ? { R: { pos: [-0.14, seatY + 0.17, 0.3], pole: [-1, 0, -1], hand: [0.5, 0, 0] } } : { L: leftOnLap };
    const pose = rig.solve(P(sit, { head: [0.05, s * 0.3, 0], torso: [0.02, s * 0.12, 0] }), { [side]: { pos: at, pole: [s * 0.6, -0.5, -1], hand: [0, 0, -s * 0.4] }, ...other });
    return rig.tweenPose(pose, 600, Ease.inOutSine, instant);
  };
  lifeIdle(rig, { breath: 0.01, sway: 0.004, look: 0.06, seated: true, lookEvery: 6 });
  rig.play('idle'); rig.apply();
  return rig;
}

/** 戴鹿头面具的 Nicholas（记忆场景）：白色交领长袍、喇叭袖，右手把黑方块举在头旁，左手按在胸口。 */
function buildNicholasDeer() {
  const { rig } = nicholasBody('nicholas_deer', { robe: true });
  const Y = rig.Y, M = rig.mats, J = rig.joints;
  rig.headTags = ['head', 'face', 'hair', 'neck'];
  rig.maskScale = rig.dims.headR[0] / 0.095;
  const robe = cloth(rig, '#ebe9e3', { seed: 81, folds: 18, ink: 0.42, len: 0.7 });
  const keys = [
    { y: Y.hip - 0.03, w: 0.17, d: 0.13 }, { y: Y.waist, w: 0.168, d: 0.128, cz: 0.004 }, { y: Y.chest, w: 0.176, d: 0.124, cz: 0.006 },
    { y: Y.armpit, w: 0.19, d: 0.115 }, { y: Y.shoulder, w: 0.19, d: 0.1 }, { y: Y.shoulder + 0.035, w: 0.14, d: 0.086, cz: -0.006 }, { y: Y.neck + 0.005, w: 0.06, d: 0.054 },
  ];
  torsoSkin(rig, keys, robe, { tag: 'robe' });
  skirtSkin(rig, [
    { y: 0.02, w: 0.29, d: 0.24, cz: 0.012 }, { y: Y.knee - 0.1, w: 0.25, d: 0.205, cz: 0.008 }, { y: Y.hip - 0.15, w: 0.205, d: 0.165, cz: 0.004 }, { y: Y.hip + 0.04, w: 0.172, d: 0.132 },
  ], robe, { tag: 'robe', pleat: (th, k) => (0.045 * (1 - k) + 0.006) * Math.cos(th * 11 + 0.6) + 0.02 * (1 - k) * Math.cos(th * 5 + 1.3) });
  const band = M.toon('#ffffff', { map: fabric('#f3f1ec', { folds: 2, ink: 0.2 }), side: THREE.DoubleSide, outline: 0.0035 });
  const nrm = (p, o) => o.set(p.x, Math.max(0, p.y - Y.chest) * 2.2, p.z).normalize();
  torsoSkin(rig, null, band, { tag: 'collar', geo: ribbonGeo([[-0.055, Y.neck + 0.01, -0.035], [-0.075, Y.neck - 0.01, 0.035], [-0.04, Y.chest + 0.05, 0.105], [0.03, Y.waist + 0.05, 0.128], [0.085, Y.hip + 0.0, 0.132]], 0.05, { nrm, lift: 0.005, seg: 34 }) });
  torsoSkin(rig, null, band, { tag: 'collar', geo: ribbonGeo([[0.055, Y.neck + 0.01, -0.035], [0.075, Y.neck - 0.01, 0.035], [0.04, Y.chest + 0.05, 0.105], [-0.03, Y.waist + 0.05, 0.13], [-0.088, Y.hip + 0.0, 0.134]], 0.05, { nrm, lift: 0.009, seg: 34 }) });
  longSleeves(rig, robe, { r: 0.07, elbow: 0.066, wrist: 0.07, bell: 0.06 });
  hands(rig, 1.08, ['grip', 'flat']);
  for (const side of ['L', 'R']) rig.ps.add(J['foot' + side], place(sphere(0.045, 0.03, 0.1), [0, -Y.ankle * 0.6, 0.05]), M.toon('#d9d3c6'), 'shoe');
  finish(rig);
  const cube = blackCube(M, 0.14); cube.name = 'memory_cube';
  const cubeMount = new THREE.Group(); J.handR.add(cubeMount); cubeMount.position.set(0, -0.12, 0.035); cubeMount.add(cube);
  const cubeQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0.6, 0.12));
  holdUpright(rig, J.handR, cubeMount, () => cubeQ);
  const PN = 70;
  const parts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.unlit('#0c0c0c'), PN);
  parts.frustumCulled = false; parts.visible = false; parts.name = 'memory_cube_particles'; rig.root.add(parts);
  const pr = rng(91);
  const PD = Array.from({ length: PN }, () => ({ v: V((pr() - 0.5) * 0.7, 0.9 + pr() * 1.6, (pr() - 0.5) * 0.5), s: 0.012 + pr() * 0.025, d: pr() * 0.25, rot: pr() * 6 }));
  let burstK = -1;
  const _o = V(), _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _be = new THREE.Euler(), _bs = V(), _bp = V();
  rig._upd.push(() => {
    if (burstK < 0) return;
    rig.jointToRoot(cube, _o.set(0, 0, 0), _bp);
    for (let i = 0; i < PN; i++) {
      const p = PD[i], k = clamp((burstK - p.d) / (1 - p.d), 0, 1);
      _o.copy(_bp).addScaledVector(p.v, k);
      _bq.setFromEuler(_be.set(p.rot * k, p.rot * 0.7 * k, 0));
      const sc = k <= 0 ? 0.0001 : p.s * (1 - k * 0.8);
      parts.setMatrixAt(i, _bm.compose(_o, _bq, _bs.set(sc, sc, sc)));
    }
    parts.instanceMatrix.needsUpdate = true;
  });
  const base = { torso: [0, 0.04, 0], neck: [0.02, 0, 0], head: [0.06, -0.06, 0.02] };
  const chest = { pos: [0.04, Y.chest + 0.02, 0.17], pole: [1, -0.55, -0.2], aim: { fingers: [-1, 0.28, 0.08], palm: [0, 0, -1] } };
  const hold = rig.solve(base, { R: { pos: [-0.36, Y.crown - 0.08, 0.06], pole: [-1, -0.9, 0.1], aim: { fingers: [0.1, 1, 0.12], palm: [0.25, 0, 1] } }, L: chest });
  const raised = rig.solve(base, { R: { pos: [-0.2, Y.crown + 0.14, 0.08], pole: [-1, -0.5, 0.1], aim: { fingers: [0.05, 1, 0.1], palm: [0.25, 0, 1] } }, L: chest });
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
  lifeIdle(rig, { breath: 0.01, sway: 0.006, look: 0.03 });
  rig.play('idle'); rig.apply();
  return rig;
}

// ===========================================================================
// DAVID 的章节变体：第二灾（吐青蛙塞进裤腰、系腰带后难过）与记忆场景（兔子面具）
// ===========================================================================

/** 第二灾 00:29–00:33：青蛙从嘴里钻出、挂在下巴上、顺着胸口滑下，他用左手拉开裤腰让青蛙钻进去。 */
function buildDavidFrogs() {
  const rig = buildDavid();
  rig.id = 'david_p2'; rig.root.name = 'david_p2';
  rig.setRod('none', { instant: true });
  const M = rig.mats, J = rig.joints, Y = rig.Y;
  const belt = new THREE.Group(); belt.name = 'david_belt'; J.body.add(belt);
  const leather = M.toon('#6a4426'), gold = M.toon('#bc9232');
  const bw = 0.148, bd = 0.118, by = Y.belt - Y.hip + 0.004;
  belt.add(new THREE.Mesh(lathe([[bw, by], [bw, by + 0.034]], 48).scale(1, 1, bd / bw), leather));
  const buckle = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.005, 6, 4), gold); buckle.position.set(0, by + 0.017, bd + 0.004); buckle.rotation.z = Math.PI / 4; buckle.scale.set(1.3, 0.8, 1); belt.add(buckle);
  for (let i = 0; i < 7; i++) { const a = (i - 3) * 0.2; const stud = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.004), gold); stud.position.set(Math.sin(a) * (bw + 0.002), by + 0.017, Math.cos(a) * (bd + 0.002)); stud.rotation.y = a; belt.add(stud); }
  belt.visible = false;
  const f = getPropFactory();
  let frog = null;
  try { frog = f ? f('frog') : null; } catch (e) { frog = null; }
  if (!frog) frog = new THREE.Mesh(sphere(0.03, 0.02, 0.04), M.toon('#73a336'));
  frog.scale.multiplyScalar(1.5); frog.visible = false; rig.root.add(frog);
  const pockets = rig.POSES.POCKETS;
  let belted = false;
  const normal = rig.face.tex, sad = faceSet((g, v) => paintDavid(g, v === 'blink' ? 'blink' : 'sad'));
  const wide = faceSet((g, v) => paintDavid(g, v === 'blink' ? 'blink' : 'wide'));
  rig.setBelt = (on) => { belted = !!on; belt.visible = belted; rig.face.tex = belted ? sad : normal; rig.face.cur = null; rig.setExpression('neutral'); return Promise.resolve(); };
  // 左手拉开裤腰（手停在皮带前方偏左），低头看
  const pull = rig.solve(P(pockets, { head: [0.35, 0.05, 0], neck: [0.12, 0, 0], torso: [0.08, 0, 0] }), {
    R: pocketTarget(rig, 'R'), L: { pos: [0.05, Y.belt + 0.01, 0.17], pole: [1, -0.2, -0.6], hand: [0.3, 0, -1.2] },
  });
  rig.eatFrog = ({ instant = false } = {}) => {
    if (belted || instant) { frog.visible = false; return Promise.resolve(); }
    const mouth = () => rig.jointToRoot(J.head, V(0, -rig.dims.headR[1] * 0.58, rig.dims.headR[2] * 1.02), V());
    const waist = V(0.02, Y.belt + 0.03, 0.15);
    rig.setHand('L', 'grip');
    const prevTex = rig.face.tex;
    return playKeys(rig, [[0.4, pockets], [0.62, pull], [0.85, pull], [1, pockets]], 2600, {
      ease: Ease.inOutSine,
      onFrame: (k) => {
        const out = smooth(clamp(k / 0.25, 0, 1)), slide = smooth(clamp((k - 0.3) / 0.35, 0, 1)), dive = smooth(clamp((k - 0.68) / 0.15, 0, 1));
        const m = mouth();
        const chest = V(0.0, Y.chest - 0.02, 0.17);
        frog.position.copy(m).add(V(0, -0.03 * out, 0.01 + 0.02 * out)).lerp(chest, slide).lerp(waist, dive);
        frog.rotation.set(0, 0, -Math.PI / 2);
        frog.visible = k > 0.03 && k < 0.83;
        rig.face.tex = k > 0.6 && k < 0.92 ? wide : prevTex; rig.face.cur = null;
        rig.setExpression(k < 0.28 ? 'talk' : 'neutral');
        if (k >= 1) { rig.face.tex = prevTex; rig.face.cur = null; rig.setExpression('neutral'); rig.setHand('L', 'relax'); }
      },
    });
  };
  return rig;
}

function buildDavidRabbit() {
  const rig = davidBody('david_rabbit', { hat: false, colors: { ...DAVID_COLORS, vest: '#8b5a3b' } });
  rig.headTags = ['head', 'face', 'hair', 'hat', 'neck'];
  rig.maskScale = rig.dims.headR[0] / 0.103;
  rig.setPose(P(armsDown(rig, { spread: 0.07, bend: 0.1 }), { head: [0.05, -0.12, 0], legL: [0, 0, 0.02], legR: [0, 0, -0.02] }));
  rig.setMask('rabbit');
  lifeIdle(rig, { breath: 0.012, sway: 0.01, look: 0.04 });
  rig.play('idle'); rig.apply();
  return rig;
}

// ===========================================================================
// MARGARET — 奶奶：矮、驼背，奶白头巾包住头在下巴下打结、披肩搭在肩上，深棕长裙 + 米白围裙，灰紫的老人肤色、
// 大蒜头鼻子、下垂的腮帮（下半脸一块“口套”轮廓）、嘴角下撇、白色浓眉（第一灾 04:16–04:46）。
// ===========================================================================

const SKIN_OLD = '#bfb6bb';
function paintMargaret(g, v) {
  const pain = v === 'pain';
  for (let i = 0; i < 3; i++) line(g, [[-0.3 + i * 0.05, 0.4 + i * 0.085], [0, 0.43 + i * 0.09], [0.3 - i * 0.05, 0.4 + i * 0.085]], 2.6, 'rgba(40,32,40,0.45)');
  // 下半脸的“口套”：腮帮下垂形成的圆角方块
  line(g, [[-0.32, -0.42], [-0.36, -0.66], [-0.3, -0.86], [0, -0.92], [0.3, -0.86], [0.36, -0.66], [0.32, -0.42]], 6);
  blob(g, [[-0.34, -0.5], [-0.33, -0.8], [0, -0.9], [0.33, -0.8], [0.34, -0.5], [0, -0.6]], 'rgba(120,110,122,0.18)');
  for (const s of [-1, 1]) {
    bags(g, s * 0.36, 0.04, 0.15, 0.08, s, { depth: 1.5, lines: 3, color: 'rgba(80,70,85,0.3)' });
    eye(g, s * 0.36, 0.04, 0.15, 0.078, s, { skin: SKIN_OLD, lid: v === 'blink' ? 1 : 0.52, closed: v === 'blink', squeeze: pain, droop: 0.45, pupil: 0.62, lw: 5.5, crease: false });
    const by = pain ? 0.17 : 0.23;
    pen(g, 3.2, '#f2f0ec');
    for (let i = 0; i < 10; i++) {
      const k = i / 9, x = s * lerp(0.12, 0.6, k), y = by + (pain ? (1 - k) * -0.05 : 0) + Math.sin(k * Math.PI) * 0.05 - k * 0.07;
      g.beginPath(); g.moveTo(FX(x), FY(y - 0.025)); g.lineTo(FX(x + s * 0.06), FY(y + 0.03)); g.stroke();
    }
    line(g, [[s * 0.12, by - 0.06], [s * 0.35, by + 0.02], [s * 0.6, by - 0.09]], 3, 'rgba(20,20,20,0.7)');
    line(g, [[s * 0.52, -0.08], [s * 0.6, -0.24], [s * 0.55, -0.38]], 3, 'rgba(40,32,40,0.45)');
    line(g, [[s * 0.22, -0.3], [s * 0.3, -0.42]], 2.6, 'rgba(40,32,40,0.45)');
  }
  if (pain) { line(g, [[-0.06, 0.24], [-0.02, 0.18]], 3); line(g, [[0.06, 0.24], [0.02, 0.18]], 3); }
  if (v === 'talk') blob(g, [[-0.2, -0.56], [0, -0.5], [0.2, -0.56], [0, -0.66]], '#2a1616');
  line(g, [[-0.26, -0.6], [-0.16, -0.53], [0, -0.52], [0.16, -0.53], [0.26, -0.6]], pain ? 7 : 6);
}

/** Margaret 的身体：头巾、披肩、长裙、围裙。o: { standing } */
function margaretBody(id, { stool = false, seat = 0 } = {}) {
  const H = 1.56;
  const rig = makeHuman(id, { height: H, dims: { head: 0.083, headW: 0.82, headD: 0.9, shoulderW: 0.098, hip: 0.5, knee: 0.27, upper: 0.17, fore: 0.152, neck: 0.815, waist: 0.07 } });
  const Y = rig.Y, M = rig.mats, J = rig.joints;
  head(rig, {
    skin: SKIN_OLD, jaw: 0.04, chin: 0.06, crown: 0.05, flat: 0.1, cheek: 0.18, ear: { y: -0.05, s: 1.05 },
    nose: { top: 0.08, y: -0.3, len: 0.04, w: 0.021, tip: 1.32, wing: 0.9, drop: -0.012 }, paint: paintMargaret, neck: [0.046, 0.05],
  });
  rig.headTags = ['head', 'face', 'hair'];
  const dress = cloth(rig, '#62503f', { seed: 21, folds: 12, ink: 0.5, len: 0.6 });
  const apron = cloth(rig, '#cdc5b6', { seed: 22, folds: 9, ink: 0.42, len: 0.7 });
  const scarf = cloth(rig, '#d6cbac', { seed: 23, folds: 10, ink: 0.45, len: 0.5 });
  // 上身（驼背靠姿势完成；后背上缘稍鼓）
  const torso = [
    { y: Y.hip - 0.02, w: 0.15, d: 0.122 }, { y: Y.belt, w: 0.146, d: 0.12, cz: 0.006 }, { y: Y.waist + 0.04, w: 0.15, d: 0.12, cz: 0.01 },
    { y: Y.chest, w: 0.158, d: 0.118, cz: 0.008 }, { y: Y.armpit, w: 0.16, d: 0.112, cz: -0.004 }, { y: Y.shoulder - 0.005, w: 0.156, d: 0.1, cz: -0.012 },
    { y: Y.shoulder + 0.03, w: 0.118, d: 0.084, cz: -0.016 }, { y: Y.neck + 0.002, w: 0.062, d: 0.058, cz: -0.006 },
  ];
  torsoSkin(rig, torso, dress, { tag: 'dress' });
  // 长裙：站着是普通长裙；坐着（第一灾凳子上 / 第四灾锅里）直接按坐姿做成搭在膝上的裙兜，落到地面
  let skirt;
  if (seat) {
    const dy = seat + 0.05 * H / 1.78 - Y.hip;
    skirt = [
      { y: 0.012, w: 0.3, d: 0.29, cz: 0.17 }, { y: 0.2, w: 0.275, d: 0.285, cz: 0.17 }, { y: seat + 0.06, w: 0.25, d: 0.29, cz: 0.155 },
      { y: seat + 0.13, w: 0.2, d: 0.22, cz: 0.09 }, { y: Y.hip + 0.02 + dy, w: 0.17, d: 0.14, cz: 0.01 }, { y: Y.belt + 0.02 + dy, w: 0.152, d: 0.124, cz: 0.006 },
    ].map((k) => ({ ...k, y: k.y - dy }));
  } else {
    skirt = [
      { y: 0.015, w: 0.29, d: 0.25, cz: 0.012 }, { y: Y.knee - 0.08, w: 0.26, d: 0.22, cz: 0.01 }, { y: Y.hip - 0.12, w: 0.215, d: 0.18, cz: 0.006 },
      { y: Y.hip + 0.02, w: 0.168, d: 0.14 }, { y: Y.belt + 0.02, w: 0.152, d: 0.124, cz: 0.006 },
    ];
  }
  const follow = seat ? 0 : 1;
  skirtSkin(rig, skirt, dress, { tag: 'skirt', follow, pleat: (th, k) => (0.032 * (1 - k) + 0.005) * Math.cos(th * 10 + 0.3) });
  skirtSkin(rig, skirt.map((k, i) => ({ ...k, y: i === 0 ? k.y + 0.07 : k.y, w: k.w * 1.06 + 0.004, d: k.d * 1.07 + 0.005, arc: 0.9 - i * 0.04 })), apron, { tag: 'apron', radial: 30, follow, pleat: (th, k) => 0.03 * (1 - k) * Math.cos(th * 9 + 1.2) });
  torsoSkin(rig, [{ y: Y.belt + 0.005, w: 0.16, d: 0.133, cz: 0.008 }, { y: Y.belt + 0.03, w: 0.158, d: 0.131, cz: 0.008 }], apron, { tag: 'apron', steps: 1, armBlend: 0 });
  // 披肩：搭在肩上，前襟在胸口交叠，后面垂成一个尖
  torsoSkin(rig, [
    { y: Y.chest - 0.08, w: 0.19, d: 0.16, cz: -0.004, gap: 0.5 }, { y: Y.chest, w: 0.192, d: 0.152, cz: -0.004, gap: 0.36 }, { y: Y.armpit, w: 0.19, d: 0.142, cz: -0.008, gap: 0.3 },
    { y: Y.shoulder, w: 0.178, d: 0.126, cz: -0.014, gap: 0.26 }, { y: Y.shoulder + 0.03, w: 0.14, d: 0.106, cz: -0.016, gap: 0.24 }, { y: Y.neck + 0.01, w: 0.08, d: 0.078, cz: -0.008, gap: 0.22 },
  ], scarf, { tag: 'scarf', armBlend: 0.6, drop: (th, k) => -Math.pow(1 - k, 2) * 0.14 * Math.max(0, -Math.cos(th)), pleat: (th, k) => 0.03 * (1 - k) * Math.cos(th * 7) });
  longSleeves(rig, dress, { r: 0.054, elbow: 0.048, wrist: 0.042 });
  // 头巾：从额头包到后脑，下缘外扩压在披肩上，脸部留出开口
  const [rx, ry, rz] = rig.dims.headR;
  const hood = new THREE.SphereGeometry(1.12, 40, 26, Math.PI / 2 + 1.1, TAU - 2.2, 0.0, Math.PI * 0.8);
  const hp = hood.attributes.position, hv = V();
  for (let i = 0; i < hp.count; i++) {
    hv.fromBufferAttribute(hp, i);
    const low = Math.max(0, -hv.y - 0.25);
    hv.x *= 1 + low * 0.55; if (hv.z < 0) hv.z *= 1 + low * 0.45; hv.y -= low * 0.25;
    rig.headDef(hv); hp.setXYZ(i, hv.x, hv.y + 0.008, hv.z - 0.006);
  }
  hood.computeVertexNormals();
  rig.ps.add(J.head, hood, scarf, 'scarf');
  // 下巴下的结和两条垂下来的巾角
  rig.ps.add(J.head, place(sphere(0.024, 0.02, 0.022, 14, 10), [0.03, -ry * 1.02, rz * 0.4], [0.2, 0, 0.3]), scarf, 'scarf');
  rig.ps.add(J.head, place(sphere(0.026, 0.018, 0.012, 12, 8), [0.06, -ry * 1.0, rz * 0.42], [0.2, 0, 0.8]), scarf, 'scarf');
  for (const [x, a] of [[0.05, 0.55], [0.012, -0.3]]) rig.ps.add(J.head, orient(leafGeo(0.075, 0.022, { at: 0.5, depth: 0.006, baseW: 0.7 }), V(x, -ry * 1.04, rz * 0.46), [Math.sin(a) * 0.6, -1, 0.15], [0, 0.2, 1]), scarf, 'scarf');
  // 头巾边缘露出的白发，中分
  const hairG = new THREE.SphereGeometry(1.07, 28, 10, Math.PI / 2 - 0.95, 1.9, 0.02, Math.PI * 0.27);
  const hq = hairG.attributes.position;
  for (let i = 0; i < hq.count; i++) { hv.fromBufferAttribute(hq, i); rig.headDef(hv); hq.setXYZ(i, hv.x, hv.y, hv.z); }
  hairG.computeVertexNormals();
  rig.ps.add(J.head, hairG, M.toon('#ffffff', { map: hairTex('#ecebe8', '#9a999a', 5, 0.5) }), 'hair');
  for (const side of ['L', 'R']) rig.ps.add(J['foot' + side], spineLoft([
    { y: -Y.ankle * 0.3, z: -0.03, w: 0.036, h: 0.024 }, { y: -Y.ankle * 0.45, z: 0.04, w: 0.04, h: 0.026 }, { y: -Y.ankle * 0.65, z: 0.1, w: 0.032, h: 0.018 },
  ], { radial: 16, steps: 3 }).geo, M.toon('#2c241e'), 'shoe');
  if (stool) {
    const st = new THREE.Group(); st.name = 'margaret_stool';
    const wood = M.toon('#ffffff', { map: fabric('#8b8984', { seed: 24, folds: 6, ink: 0.45, blocks: 4 }) });
    const sg = [prep(new THREE.CylinderGeometry(0.17, 0.165, 0.04, 26).translate(0, seat - 0.02, 0))];
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; const leg = new THREE.CylinderGeometry(0.018, 0.022, seat * 1.06, 10); place(leg, [Math.sin(a) * 0.15, seat / 2 - 0.01, Math.cos(a) * 0.15], [Math.cos(a) * 0.22, 0, -Math.sin(a) * 0.22]); sg.push(prep(leg)); }
    const m = new THREE.Mesh(mergeGeometries(sg), wood); m.castShadow = true; st.add(m);
    rig.root.add(st);
    rig.stoolSeat = seat;
  }
  hands(rig, 1.2, ['pray', 'pinch', 'grip', 'relax', 'flat']);
  finish(rig);
  return rig;
}

/** 驼背：上身前倾、脖子前探、头抬起来看人。 */
const STOOP = (k = 1) => ({ torso: [0.3 * k, 0, 0], neck: [-0.02 * k, 0, 0], head: [-0.22 * k, 0, 0] });

/** 第一灾：坐在三脚凳上，双手举在胸前互相搓着；鼻孔里的水蛭（setNose / holdLeech）。 */
function buildMargaret({ stool = true, id = 'margaret' } = {}) {
  const rig = margaretBody(id, { stool, seat: 0.4 });
  const M = rig.mats, J = rig.joints, Y = rig.Y;
  const seat = rig.stoolSeat || 0.4;
  const sit = P(seatedPose(rig, seat, { spread: 0.14, thigh: 1.45, back: -0.02 }), STOOP(1), { head: [-0.25, -0.22, 0.05] });
  const dy = sit['body.p'][1];
  const hy = Y.chest + dy - 0.02;
  const together = rig.solve(sit, {
    L: { pos: [0.07, hy, 0.3], pole: [1, -1, -0.3], aim: { fingers: [0.1, 0.8, 0.6], palm: [-1, 0, 0.1] } },
    R: { pos: [-0.01, hy - 0.01, 0.3], pole: [-1, -1, -0.3], aim: { fingers: [0.1, 0.8, 0.6], palm: [1, 0, -0.1] } },
  });
  const holding = rig.solve(sit, {
    L: { pos: [0.2, hy + 0.12, 0.27], pole: [1, -1, -0.2], aim: { fingers: [-0.2, 1, 0.3], palm: [-0.6, 0, 0.8] } },
    R: { pos: [-0.01, hy - 0.01, 0.3], pole: [-1, -1, -0.3], aim: { fingers: [0.1, 0.8, 0.6], palm: [1, 0, -0.1] } },
  });
  rig.POSES = { together, holding, sit };
  rig.setPose(together);
  rig.setHand('L', 'pray'); rig.setHand('R', 'pray');
  // ---- 鼻孔里的水蛭 ----
  const noseG = new THREE.Group(); noseG.name = 'margaret_nose'; J.head.add(noseG);
  const tip = rig.noseTip;
  noseG.position.set(-0.014, tip.y - 0.02, tip.z - 0.022);
  const noseProxy = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), M.unlit('#ff00ff')); noseProxy.visible = false; noseProxy.name = 'margaret_nose_proxy'; noseProxy.position.set(0.012, 0.02, 0); noseG.add(noseProxy);
  const pivot = new THREE.Group(); pivot.rotation.set(0.3, 0, 0.1); pivot.position.set(0, 0.008, -0.004); noseG.add(pivot);
  const LL = 0.07;
  const noseLeech = makeLeech(M, LL, 0.0062, 0.25); noseLeech.name = 'margaret_nose_leech'; pivot.add(noseLeech);
  const NOSE = { none: 0, peek: 0.014, stay: 0.018, pull1: 0.038, pull2: 0.058, out: 0.0 };
  const setOut = (a) => { noseLeech.visible = a > 0.001; const k = clamp(a / LL, 0.001, 1.4); noseLeech.scale.set(0.75 + 0.25 * Math.min(1, k * 2), k, 0.75 + 0.25 * Math.min(1, k * 2)); };
  setOut(0);
  const blood = new THREE.Mesh(sphere(0.007, 0.022, 0.004, 10, 8), M.toon('#8a1414', { outline: false }));
  const bp = headSurface(rig.headDef, -0.1, -0.46); blood.position.set(bp.x, bp.y + 0.006, bp.z + 0.004); blood.rotation.x = -0.4; blood.visible = false; J.head.add(blood);
  rig.noseStage = 'none';
  let noseAmt = 0;
  rig._upd.push((dt, t) => {
    if (['stay', 'pull1', 'pull2'].includes(rig.noseStage)) { pivot.rotation.z = 0.12 + Math.sin(t * 9) * 0.12; pivot.rotation.x = 0.35 + Math.sin(t * 6.3) * 0.08; }
  });
  const moveTo = (amt, ms) => { const from = noseAmt; return animate(ms, (e) => { noseAmt = lerp(from, amt, e); setOut(noseAmt); }, Ease.inOutSine); };
  rig.setNose = async (stage = 'none', { instant = false } = {}) => {
    rig.noseStage = stage;
    if (instant) { noseAmt = NOSE[stage] ?? 0; setOut(noseAmt); blood.visible = stage === 'pull1' || stage === 'pull2'; if (stage === 'out') rig.holdLeech(true, { instant: true }); return; }
    if (stage === 'peek') { await moveTo(0.013, 260); await wait(380); await moveTo(0, 300); return; }
    if (stage === 'pull1' || stage === 'pull2') { rig.setExpression('pain'); blood.visible = true; await moveTo(NOSE[stage], 380); await wait(250); rig.setExpression('neutral'); return; }
    if (stage === 'out') { rig.setExpression('pain'); await moveTo(0.09, 450); noseAmt = 0; setOut(0); blood.visible = false; await rig.holdLeech(true); await wait(200); rig.setExpression('neutral'); return; }
    await moveTo(NOSE[stage] ?? 0, 300);
    blood.visible = false;
  };
  const held = makeLeech(M, 0.085, 0.0095, 0.35); held.name = 'margaret_leech';
  const heldWrap = new THREE.Group(); heldWrap.add(held); held.rotation.set(0, 0, 0.15);
  heldWrap.position.set(-0.01, -0.1, 0.03); J.handL.add(heldWrap); heldWrap.visible = false;
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.material.userData.outlineParameters = { visible: false };
  hit.position.y = 0.04; hit.userData.proxy = true; hit.name = 'margaret_leech_hit'; held.add(hit);
  rig.holdLeech = async (v = true, { instant = false } = {}) => {
    if (v) { rig.setHand('L', 'pinch'); heldWrap.visible = true; await rig.tweenPose(holding, 550, Ease.inOutSine, instant); }
    else { heldWrap.visible = false; await rig.tweenPose(together, 550, Ease.inOutSine, instant); rig.setHand('L', 'pray'); }
  };
  // 原作里她坐着时双手在胸前慢慢搓动
  lifeIdle(rig, { breath: 0.012, sway: 0.008, look: 0.05, seated: true, lookEvery: 7, arms: 0 });
  const base = rig._idleFn;
  rig._idleFn = (t, I, dt) => {
    base(t, I, dt);
    I.head[2] += Math.sin(t * 2.3) * 0.006;
    if (!heldWrap.visible) { const r = Math.sin(t * 2.1); I.elbowL[0] += r * 0.05; I.elbowR[0] -= r * 0.05; I.handL[1] += r * 0.08; I.handR[1] += r * 0.08; }
  };
  rig.play('idle'); rig.apply();
  return rig;
}

/** 第二灾：站在锅后，双手握着木棍慢慢搅汤（13:25）。 */
function buildMargaretCook() {
  const rig = margaretBody('margaret_cook');
  const M = rig.mats, Y = rig.Y;
  const stand = P(STOOP(0.9), { legL: [0.05, 0, 0.05], kneeL: [0.1, 0, 0], legR: [-0.05, 0, -0.05], kneeR: [0.08, 0, 0] });
  rig.setPose(stand);
  const stick = new THREE.Group(); stick.name = 'margaret_stick'; rig.root.add(stick);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.009, 1.25, 12), M.toon('#b3997b')); handle.position.y = 0.8; stick.add(handle);
  const top = new THREE.Object3D(); top.position.set(0, 1.425, 0); stick.add(top); rig.stickTop = top;
  for (const s of ['L', 'R']) rig.setHand(s, 'grip');
  const cx = -0.02, cz = 0.32;
  rig._upd.push((dt, t) => {
    const x = cx + Math.sin(t * 1.6) * 0.03, z = cz + Math.cos(t * 1.6) * 0.022;
    stick.position.set(x, 0, z); stick.rotation.z = Math.sin(t * 1.6) * 0.03;
    rig.pose.torso[0] = stand.torso[0] + Math.sin(t * 1.6 + 1) * 0.02;
    rig.apply(true, true);
    rig.ikArm('L', V(x + 0.012, Y.waist + 0.06, z), [1, -1, -0.15]);
    rig.ikArm('R', V(x - 0.02, Y.chest + 0.02, z), [-1, -1, -0.15]);
  });
  lifeIdle(rig, { breath: 0.01, sway: 0.004, look: 0.04, arms: 0 });
  rig.play('idle'); rig.update(0, 0);
  return rig;
}

/** 第五灾：站在砧板后，右手举着菜刀，左手按住砧板，隔一会儿剁一下（02:40）。 */
function buildMargaretChef() {
  const rig = margaretBody('margaret_chef');
  const M = rig.mats, Y = rig.Y, J = rig.joints;
  const stand = P(STOOP(0.85), { head: [-0.05, -0.15, 0], legL: [0.05, 0, 0.05], kneeL: [0.1, 0, 0], legR: [-0.05, 0, -0.05], kneeR: [0.08, 0, 0] });
  const up = rig.solve(stand, { R: { pos: [-0.2, Y.chest + 0.14, 0.26], pole: [-1, -0.5, -0.3], hand: [0.4, 0, 0.2] }, L: { pos: [0.05, Y.hip + 0.12, 0.42], pole: [1, -0.2, -0.6], hand: [1.3, 0, 0] } });
  const down = rig.solve(stand, { R: { pos: [-0.12, Y.hip + 0.16, 0.42], pole: [-1, -0.5, -0.3], hand: [1.0, 0, 0.2] }, L: { pos: [0.05, Y.hip + 0.12, 0.42], pole: [1, -0.2, -0.6], hand: [1.3, 0, 0] } });
  rig.POSES = { up, down };
  rig.setPose(up);
  rig.setHand('R', 'grip'); rig.setHand('L', 'flat');
  const knife = new THREE.Group(); knife.name = 'margaret_cleaver';
  knife.add(new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.07, 0.15).translate(0, 0.0, 0.11), M.toon('#cfd2d0')));
  knife.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.1, 10).rotateX(Math.PI / 2).translate(0, 0, -0.0), M.toon('#6b4a2c')));
  knife.position.set(0, -0.08, 0.02); knife.rotation.set(0.3, 0, 0);
  J.handR.add(knife);
  let tNext = 2;
  rig.chop = () => playKeys(rig, [[0.35, down], [1, up]], 900, { ease: Ease.inOutSine });
  rig._upd.push((dt) => { tNext -= dt; if (tNext <= 0) { tNext = 3 + Math.random() * 3; rig.chop(); } });
  lifeIdle(rig, { breath: 0.01, sway: 0.004, look: 0.04, arms: 0 });
  rig.play('idle'); rig.apply();
  return rig;
}

function buildMargaretPigeon() {
  const rig = margaretBody('margaret_pigeon');
  rig.maskScale = rig.dims.headR[0] / 0.105;
  const Y = rig.Y;
  const pose = P(STOOP(0.7), { head: [-0.02, -0.3, 0.05] });
  rig.setPose(rig.solve(pose, {
    L: { pos: [0.07, Y.chest + 0.02, 0.27], pole: [1, -1, -0.3], aim: { fingers: [0.15, 1, 0.35], palm: [-1, 0, 0.1] } },
    R: { pos: [-0.01, Y.chest + 0.015, 0.27], pole: [-1, -1, -0.3], aim: { fingers: [0.15, 1, 0.35], palm: [1, 0, -0.1] } },
  }));
  rig.setHand('L', 'pray'); rig.setHand('R', 'pray');
  rig.setMask('pigeon');
  lifeIdle(rig, { breath: 0.01, sway: 0.006, look: 0.03, arms: 0 });
  rig.play('idle'); rig.apply();
  return rig;
}

// ===========================================================================
// 女装：Caroline（母亲）、Ida（红发妹妹）、Elizabeth（记忆里戴雉鸡面具的女孩）
// ===========================================================================

/** 平展的翻领片（Ida / Elizabeth 的白色大圆领）：两片圆角叶形，贴在胸口和肩上。 */
function roundCollar(rig, mat, { w = 0.13, h = 0.1, y = null, z = 0.0 } = {}) {
  const Y = rig.Y, front = rig.shirtFront || (() => 0.1);
  const top = y ?? Y.neck;
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(s * 0.006, 0);
    shape.quadraticCurveTo(s * w * 0.55, 0.004, s * w, -h * 0.35);
    shape.quadraticCurveTo(s * w * 1.02, -h * 0.95, s * w * 0.55, -h);
    shape.quadraticCurveTo(s * w * 0.15, -h * 1.0, s * 0.006, -h * 0.55);
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape, 24);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), yy = p.getY(i);
      // 贴着胸口和肩膀弯过去
      const zz = front(top + yy) + 0.012 + z - Math.pow(Math.abs(x) / (w * 1.05), 2) * 0.025;
      p.setXYZ(i, x, top + yy, zz);
    }
    g.computeVertexNormals();
    torsoSkin(rig, null, mat, { tag: 'collar', geo: g });
  }
}

/**
 * 女性身体：上衣（衬衫或连衣裙上身）+ 长裙 + 袖子 + 鞋，返回 rig（未 finish）。
 * o: { height, dims, head, dress, blouse, puff 泡泡短袖, bodice 方领背心色, skirtW, hem }
 */
function womanBody(id, o) {
  const H = o.height;
  const rig = makeHuman(id, { height: H, dims: { head: 0.077, headW: 0.73, headD: 0.86, shoulderW: 0.088, hip: 0.53, hipW: 0.046, upper: 0.17, fore: 0.148, ...(o.dims || {}) } });
  const Y = rig.Y, M = rig.mats, sc = H / 1.62;
  const w = (x) => x * sc;
  head(rig, o.head);
  const dress = cloth(rig, o.dress, { seed: o.seed || 97, folds: 12, ink: 0.4, len: 0.7 });
  const blouse = o.blouse ? cloth(rig, o.blouse, { seed: (o.seed || 97) + 5, folds: 8, ink: 0.3 }) : dress;
  const keys = [
    { y: Y.hip - 0.02, w: w(0.13), d: w(0.1) }, { y: Y.belt + 0.02, w: w(0.112), d: w(0.088), cz: 0.004 }, { y: Y.waist + 0.04, w: w(0.118), d: w(0.094), cz: 0.012 },
    { y: Y.chest, w: w(0.132), d: w(0.104), cz: 0.018 }, { y: Y.armpit, w: w(0.136), d: w(0.094), cz: 0.008 }, { y: Y.shoulder - 0.004, w: w(0.135), d: w(0.078) },
    { y: Y.shoulder + 0.026, w: w(0.1), d: w(0.068), cz: -0.004 }, { y: Y.neck + 0.002, w: rig.dims.headR[0] * 0.55, d: rig.dims.headR[0] * 0.5, cz: -0.006 },
  ];
  rig.shirtFront = (y) => { let i = 0; while (i < keys.length - 2 && keys[i + 1].y < y) i++; const a = keys[i], b = keys[i + 1], k = clamp((y - a.y) / (b.y - a.y), 0, 1); return lerp(a.d, b.d, k) + lerp(a.cz || 0, b.cz || 0, k); };
  torsoSkin(rig, keys, blouse, { tag: 'blouse' });
  if (o.bodice) {
    // 方领背心：上缘水平（在胸口上方），两条肩带搭过肩膀
    const bod = cloth(rig, o.bodice, { seed: 99, folds: 6, ink: 0.35 });
    torsoSkin(rig, keys.slice(0, 5).map((k, i) => ({ ...k, y: i === 4 ? Y.chest + 0.05 : k.y, w: k.w * 1.05 + 0.003, d: k.d * 1.07 + 0.004 })), bod, { tag: 'bodice', armBlend: 0.2 });
    for (const s of [-1, 1]) torsoSkin(rig, null, bod, { tag: 'bodice', geo: ribbonGeo([V(s * w(0.075), Y.chest + 0.04, w(0.118)), V(s * w(0.085), Y.shoulder + 0.02, w(0.05)), V(s * w(0.085), Y.shoulder + 0.025, -w(0.03)), V(s * w(0.08), Y.chest + 0.04, -w(0.11))], w(0.04), { seg: 20, lift: 0.004, nrm: (p, out) => out.set(p.x * 0.3, Math.max(0, p.y - Y.chest) * 4, p.z).normalize() }) });
  }
  const hem = o.hem ?? 0.05;
  const sw = o.skirtW || 0.3;
  skirtSkin(rig, [
    { y: hem, w: w(sw), d: w(sw * 0.85), cz: 0.01 }, { y: lerp(hem, Y.hip, 0.45), w: w(sw * 0.86), d: w(sw * 0.74), cz: 0.008 }, { y: Y.hip - 0.06, w: w(sw * 0.62), d: w(sw * 0.52), cz: 0.006 },
    { y: Y.hip + 0.03, w: w(0.135), d: w(0.106) }, { y: Y.belt + 0.03, w: w(0.116), d: w(0.092), cz: 0.004 },
  ], dress, { tag: 'skirt', radial: 72, pleat: (th, k) => (0.035 * (1 - k) + 0.004) * Math.cos(th * (o.pleats || 14)) });
  if (o.puff) {
    for (const side of ['L', 'R']) limbSkin(rig, side, 'arm', [
      { s: -0.05, w: w(0.04), d: w(0.042), ox: -0.02 }, { s: -0.015, w: w(0.068), d: w(0.066) }, { s: 0.05, w: w(0.075), d: w(0.072) },
      { s: rig.dims.upper * 0.55, w: w(0.066), d: w(0.064) }, { s: rig.dims.upper * 0.68, w: w(0.04), d: w(0.039) },
    ], dress, { tag: 'sleeve', cap: 'top', pleat: (th) => 0.07 * Math.cos(th * 10) });
    for (const side of ['L', 'R']) limbSkin(rig, side, 'arm', [
      { s: rig.dims.upper * 0.5, w: w(0.034), d: w(0.033) }, { s: rig.dims.upper, w: w(0.03), d: w(0.029) }, { s: rig.dims.upper + rig.dims.fore * 0.5, w: w(0.028), d: w(0.025) },
      { s: rig.dims.upper + rig.dims.fore + 0.008, w: w(0.021), d: w(0.018) }, { s: rig.dims.upper + rig.dims.fore + 0.02, w: w(0.012), d: w(0.01) },
    ], rig.skinMat, { tag: 'forearm', cap: 'bottom' });
    if (o.puffBand) for (const side of ['L', 'R']) limbSkin(rig, side, 'arm', [{ s: rig.dims.upper * 0.62, w: w(0.05), d: w(0.049) }, { s: rig.dims.upper * 0.69, w: w(0.044), d: w(0.043) }], M.toon(o.puffBand, { side: THREE.DoubleSide }), { tag: 'sleeve', steps: 1 });
  } else {
    longSleeves(rig, blouse, { r: w(0.05), elbow: w(0.042), wrist: w(0.032), cuff: o.cuff ? M.toon(o.cuff, { side: THREE.DoubleSide }) : null });
  }
  stockings(rig, M.toon(o.legs || shade(o.head.skin, -0.05)), { r: [w(0.04), w(0.026)] });
  shoes(rig, { w: w(0.04), l: w(0.13), z: w(0.03), toe: 0.9 }, M.toon(o.shoes || '#242220'), M.toon('#121110'));
  return rig;
}

/** 腰带 + 前面的蝴蝶结（Ida / Elizabeth）。 */
function sashBow(rig, mat, { y = null } = {}) {
  const Y = rig.Y, sc = rig.dims.height / 1.62, yy = y ?? Y.belt + 0.03;
  const fz = rig.shirtFront(yy);
  torsoSkin(rig, [{ y: yy - 0.016, w: 0.118 * sc, d: fz - 0.004, cz: 0.004 }, { y: yy + 0.022, w: 0.117 * sc, d: fz - 0.004, cz: 0.004 }], mat, { tag: 'sash', steps: 1, armBlend: 0, legs: false });
  const z = fz + 0.008;
  for (const s of [-1, 1]) {
    torsoSkin(rig, null, mat, { tag: 'sash', geo: place(sphere(0.03 * sc, 0.015 * sc, 0.007, 16, 10), [s * 0.026 * sc, yy + 0.006, z], [0, 0, s * 0.35]) });
    torsoSkin(rig, null, mat, { tag: 'sash', geo: ribbonGeo([[s * 0.006, yy - 0.002, z], [s * 0.016 * sc, yy - 0.045 * sc, z + 0.004], [s * 0.026 * sc, yy - 0.09 * sc, z + 0.006]], 0.016 * sc, { seg: 10, nrm: (p, o) => o.set(0, 0, 1), lift: 0 }) });
  }
  torsoSkin(rig, null, mat, { tag: 'sash', geo: place(sphere(0.011 * sc, 0.013 * sc, 0.008, 12, 8), [0, yy + 0.006, z + 0.002]) });
}

// ---- Caroline ----
const SKIN_CAROLINE = '#e5dad2';
function paintCaroline(g, v) {
  for (const s of [-1, 1]) {
    bags(g, s * 0.35, 0.03, 0.16, 0.08, s, { depth: 1.2, lines: 1, color: 'rgba(90,80,86,0.22)' });
    eye(g, s * 0.35, 0.03, 0.165, 0.085, s, { skin: SKIN_CAROLINE, lid: v === 'blink' ? 1 : 0.42, closed: v === 'blink', droop: 0.12, pupil: 0.55, lw: 5, crease: false });
    line(g, [[s * 0.14, 0.2], [s * 0.37, 0.25], [s * 0.6, 0.19]], 5.5, '#4b3a31');
  }
  line(g, [[-0.06, 0.04], [-0.07, -0.2], [0.04, -0.27]], 3.2, 'rgba(20,20,20,0.6)');
  if (v === 'talk') blob(g, [[-0.14, -0.55], [0, -0.51], [0.14, -0.55], [0, -0.64]], '#3a2422');
  else line(g, [[-0.15, -0.57], [0, -0.55], [0.15, -0.58]], 4.5);
  line(g, [[-0.05, -0.82], [0.05, -0.82]], 2.5, 'rgba(80,70,64,0.7)');
}

/** 彩色条纹软帽（护耳款），条纹沿发际线一圈圈排列。 */
function stripedCap(rig) {
  const M = rig.mats, J = rig.joints;
  const tex = cachedTex('caroline_cap', () => canvasTexture(256, 256, (g, w, h) => {
    const colors = ['#5e928f', '#e6ddcb', '#a2543a', '#d9cfb4', '#5d7f95', '#e6ddcb'];
    const n = 14;
    for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.fillRect(0, (i / n) * h, w, h / n + 1); g.fillStyle = 'rgba(60,45,35,0.55)'; g.fillRect(0, (i / n) * h, w, 2); }
  }));
  const cap = hairCapGeoLocal(rig, { front: 0.3 * Math.PI, side: 0.62 * Math.PI, back: 0.66 * Math.PI, scale: 1.1, top: 0.05 });
  rig.ps.add(J.head, cap, M.toon('#ffffff', { map: tex }), 'hat');
  // 帽檐边：一圈深红棕的滚边
  rig.ps.add(J.head, hairCapEdge(rig, { front: 0.3 * Math.PI, side: 0.62 * Math.PI, back: 0.66 * Math.PI, scale: 1.11 }), M.toon('#7a3b2c'), 'hat');
}

/** 和 hairCapGeo 相同，但 UV 的 v 从发际线（0）到头顶（1），方便画一圈圈的条纹。 */
function hairCapGeoLocal(rig, o) {
  const g = CAPGEO(rig, o);
  return g;
}
function CAPGEO(rig, o) {
  const front = o.front, side = o.side, back = o.back, T = back;
  const g = new THREE.SphereGeometry(1, 40, 20, 0, TAU, 0, T);
  const pos = g.attributes.position, uv = g.attributes.uv, v = V();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const th = Math.acos(clamp(v.y, -1, 1)), ang = Math.abs(Math.atan2(v.x, v.z)), k = ang / Math.PI;
    const lim = k < 0.5 ? lerp(front, side, smooth(k * 2)) : lerp(side, back, smooth(k * 2 - 1));
    const nt = (th / T) * lim, r = Math.sin(nt), ph = Math.atan2(v.x, v.z);
    v.set(Math.sin(ph) * r, Math.cos(nt), Math.cos(ph) * r).multiplyScalar((o.scale ?? 1.08) + (o.top ?? 0.04) * Math.max(0, Math.cos(nt)));
    rig.headDef(v);
    pos.setXYZ(i, v.x, v.y, v.z);
    uv.setXY(i, uv.getX(i), th / T);
  }
  g.computeVertexNormals();
  return g;
}
function hairCapEdge(rig, o) {
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const ph = (i / 64) * TAU, k = Math.abs(Math.atan2(Math.sin(ph), Math.cos(ph))) / Math.PI;
    const lim = k < 0.5 ? lerp(o.front, o.side, smooth(k * 2)) : lerp(o.side, o.back, smooth(k * 2 - 1));
    const p = V(Math.sin(ph) * Math.sin(lim), Math.cos(lim), Math.cos(ph) * Math.sin(lim)).multiplyScalar(o.scale);
    rig.headDef(p); pts.push(p);
  }
  return taperTube(pts, 0.008, 0.008, 96, 8, true);
}

function buildCaroline() {
  const rig = womanBody('caroline', {
    height: 1.66, seed: 98, dress: '#8b5a46', blouse: '#9fc0c4', bodice: '#8b5a46', skirtW: 0.3, pleats: 16, shoes: '#2a2522', legs: '#d9d0c6',
    head: { skin: SKIN_CAROLINE, jaw: 0.34, chin: 0.18, crown: 0.1, flat: 0.1, nose: { top: 0.06, y: -0.26, len: 0.022, w: 0.0105, tip: 0.95, wing: 0.55 }, paint: paintCaroline },
  });
  stripedCap(rig);
  hands(rig, 1.0, ['relax', 'grip', 'flat']);
  finish(rig);
  const M = rig.mats, Y = rig.Y;
  // 怀里裹着白布的婴儿（Jakob），布的一角垂下来，下缘有一圈锯齿刺绣
  const baby = new THREE.Group(); baby.name = 'caroline_baby';
  baby.position.set(0.0, Y.chest - 0.12, 0.2); baby.rotation.z = -0.25; rig.root.add(baby);
  const wrap = M.toon('#ffffff', { map: fabric('#e3e4df', { folds: 5, ink: 0.25, blocks: 2 }) });
  baby.add(new THREE.Mesh(place(sphere(0.07, 0.15, 0.06, 28, 20), [0, -0.02, 0]), wrap));
  const bh = new THREE.Mesh(sphere(0.042, 0.048, 0.04, 24, 16), M.toon('#e9c9bd')); bh.position.set(0.0, 0.135, 0.02); baby.add(bh);
  const bf = faceSet((g) => {
    for (const s of [-1, 1]) line(g, [[s * 0.12, 0.08], [s * 0.32, 0.03], [s * 0.5, 0.08]], 6);
    blob(g, [[-0.16, -0.32], [0.04, -0.42], [0.18, -0.33], [0.1, -0.62], [-0.12, -0.58]], '#5d3930');
  });
  const fm = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.08), M.unlit('#ffffff', { map: bf('neutral'), transparent: true, depthWrite: false }));
  fm.position.set(0.0, 0.13, 0.062); baby.add(fm);
  // 垂下来的布巾（刺绣下摆）
  const cloth2 = canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#ecece7'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(80,80,74,0.8)'; g.lineWidth = 3;
    g.beginPath(); for (let x = 0; x <= w; x += 12) g.lineTo(x, h - 30 + ((x / 12) % 2 ? 10 : 0)); g.stroke();
    g.beginPath(); for (let x = 0; x <= w; x += 12) g.lineTo(x, h - 50 + ((x / 12) % 2 ? 10 : 0)); g.stroke();
    g.strokeRect(4, 4, w - 8, h - 8);
  });
  const hang = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.22, 4, 8), M.toon('#ffffff', { map: cloth2, side: THREE.DoubleSide }));
  hang.position.set(-0.02, -0.17, 0.065); hang.rotation.z = 0.25; baby.add(hang);
  const arms = rig.solve({ head: [0.12, 0, 0.03], neck: [0.05, 0, 0] }, {
    L: { pos: [0.13, Y.chest - 0.13, 0.24], pole: [1, 0, -1], hand: [0, 0, -1.5] },
    R: { pos: [-0.1, Y.chest - 0.07, 0.25], pole: [-1, 0, -1], hand: [0, 0, 1.5] },
  });
  rig.setPose(arms);
  rig.setHand('L', 'flat'); rig.setHand('R', 'flat');
  lifeIdle(rig, { breath: 0.01, sway: 0.008, look: 0.04, arms: 0 });
  rig._upd.push((dt, t) => { baby.rotation.z = -0.25 + Math.sin(t * 1.4) * 0.05; baby.position.x = Math.sin(t * 1.4) * 0.012; rig.idle.torso[2] += Math.sin(t * 1.4) * 0.012; });
  rig.play('idle'); rig.apply();
  return rig;
}

// ---- Ida ----
const SKIN_IDA = '#e8dedb';
function paintIda(g, v) {
  const closed = v === 'blink' || v === 'closed';
  for (const s of [-1, 1]) {
    bags(g, s * 0.36, 0.02, 0.18, 0.09, s, { depth: 1.2, lines: 1, color: 'rgba(90,80,88,0.25)' });
    eye(g, s * 0.36, 0.02, 0.19, 0.09, s, { skin: SKIN_IDA, white: '#dcdcd6', lid: closed ? 1 : 0.22, closed, droop: 0.08, pupil: 0.0, lw: 5, crease: false });
    // 浅灰色、看不见瞳孔的眼珠
    if (!closed) { g.fillStyle = '#a9aaa6'; g.beginPath(); g.arc(FX(s * 0.36), FY(0.0), 0.05 * 256, 0, TAU); g.fill(); g.strokeStyle = 'rgba(40,40,40,0.6)'; g.lineWidth = 2; g.stroke(); }
    line(g, [[s * 0.15, 0.2], [s * 0.38, 0.25], [s * 0.62, 0.18]], 4.5, '#4b3a31');
  }
  line(g, [[0.0, 0.04], [-0.04, -0.21], [0.07, -0.28]], 3.5);
  line(g, [[-0.11, -0.29], [-0.035, -0.34], [0.075, -0.3]], 2);
  if (v === 'talk') blob(g, [[-0.16, -0.55], [0, -0.5], [0.16, -0.55], [0.03, -0.65], [-0.08, -0.64]], '#392927');
  else { line(g, [[-0.19, -0.6], [-0.08, -0.53], [0.08, -0.53], [0.19, -0.61]], 5); line(g, [[-0.08, -0.6], [0.08, -0.6]], 2.5, 'rgba(60,40,40,0.55)'); }
  line(g, [[0, -0.66], [0, -0.7]], 2.5, '#3a3030');
}

function buildIda() {
  const rig = womanBody('ida', {
    height: 1.58, seed: 97, dress: '#7d553e', puff: true, puffBand: '#3b2a20', skirtW: 0.29, pleats: 12, shoes: '#1f1d1b', legs: '#e3d9d6',
    head: { skin: SKIN_IDA, jaw: 0.34, chin: 0.16, crown: 0.1, flat: 0.08, nose: { top: 0.06, y: -0.25, len: 0.02, w: 0.0098, tip: 0.95, wing: 0.5 }, paint: paintIda },
  });
  const M = rig.mats, J = rig.joints, Y = rig.Y;
  // 黑色高立领 + 白色大圆领 + 白腰带蝴蝶结
  torsoSkin(rig, [{ y: Y.neck - 0.01, w: 0.046, d: 0.044, cz: -0.004 }, { y: Y.neck + 0.05, w: 0.044, d: 0.043, cz: -0.008 }], M.toon('#1b1d1b', { side: THREE.DoubleSide }), { tag: 'collar', steps: 1, armBlend: 0 });
  const white = M.toon('#ebe8e0', { side: THREE.DoubleSide, outline: 0.0035 });
  roundCollar(rig, white, { w: 0.13, h: 0.13, y: Y.neck + 0.004 });
  sashBow(rig, M.toon('#e2e0da', { side: THREE.DoubleSide }));
  // 长直发：中分，盖过肩膀，前后都垂下来
  const hairM = M.toon('#ffffff', { map: hairStrands('#b4461f', '#64240a', 39) });
  hairCap(rig, { front: 0.29 * Math.PI, side: 0.56 * Math.PI, back: 0.7 * Math.PI, top: 0.03, scale: 1.05 }, hairM);
  const [rx, ry, rz] = rig.dims.headR;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      // 从耳前（a≈1.1）一直排到后脑（a≈π），耳前两绺垂到胸前，其余披在背后
      const a = 1.1 + i * 0.32, x = s * Math.sin(a) * rx * 1.06, z = Math.cos(a) * rz * 1.04;
      const front = i < 2, end = -ry * (front ? 3.1 : 2.7 + (i % 2) * 0.25);
      const zf = front ? rz * 0.35 : z;
      rig.ps.add(J.head, lockGeo([V(x * 0.92, ry * 0.5, z * 0.92), V(x * 1.06, -ry * 0.15, z * 1.02), V(x * (front ? 1.2 : 1.12), -ry * 1.05, front ? zf : z * 1.05), V(x * (front ? 1.18 : 1.1), end, front ? zf + 0.02 : z * 1.1)], rx * 0.21, rx * 0.06, { tip: 0.25 }), hairM, 'long_hair');
    }
    rig.ps.add(J.head, lockGeo([V(s * 0.01, ry * 1.0, rz * 0.38), V(s * rx * 0.55, ry * 0.8, rz * 0.82), V(s * rx * 0.98, ry * 0.25, rz * 0.6), V(s * rx * 1.1, -ry * 0.55, rz * 0.45)], rx * 0.26, rx * 0.06, { tip: 0.45 }), hairM, 'fringe');
  }
  hands(rig, 0.98, ['relax', 'grip']);
  finish(rig);
  const f = getPropFactory();
  let frog = null; try { frog = f ? f('frog') : null; } catch (e) { frog = null; }
  if (!frog) frog = new THREE.Mesh(sphere(0.03, 0.02, 0.04), M.toon('#d0fb25'));
  frog.setColor?.('lime'); frog.scale.multiplyScalar(1.9); frog.position.set(0, ry * 1.08, 0.004); J.head.add(frog); rig.frog = frog;
  let flute = null; try { flute = f ? f('frog_flute') : null; } catch (e) { flute = null; }
  if (!flute) flute = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.28, 10), M.toon('#7a5a3a'));
  flute.rotation.z = Math.PI / 2; flute.visible = false; rig.root.add(flute); rig.fluteObj = flute;
  const notes = new THREE.Group(); notes.visible = false; rig.root.add(notes);
  const ntex = canvasTexture(128, 128, (g) => { g.fillStyle = '#222'; g.font = '100px serif'; g.fillText('♪', 15, 105); }, { wrap: false });
  for (let i = 0; i < 4; i++) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: ntex, transparent: true, depthWrite: false })); m.material.userData.outlineParameters = { visible: false }; m.scale.set(0.065, 0.085, 1); m.userData.phase = i / 4; notes.add(m); }
  const neutral = P(armsDown(rig, { spread: 0.05, bend: 0.06 }), { head: [0.04, 0, 0] });
  rig.setPose(neutral);
  // 笛子横在嘴前：两手一前一后
  const mouthY = Y.chin + 0.035;
  const hold = rig.solve({ head: [0.08, 0, 0] }, { L: { pos: [0.02, mouthY - 0.24, 0.2], pole: [1, -1, -0.15], hand: [0, 0, -1.3] }, R: { pos: [-0.02, mouthY - 0.13, 0.19], pole: [-1, -1, -0.15], hand: [0, 0, 1.3] } });
  rig._after.push(() => { if (!flute.visible) return; const a = rig.jointToRoot(J.handL, V(0, -0.07, 0.02), V()), b = rig.jointToRoot(J.handR, V(0, -0.07, 0.02), V()); flute.position.addVectors(a, b).multiplyScalar(0.5); });
  let playing = false;
  rig.setFrogColor = (c) => frog.setColor?.(c);
  rig.showFrog = (on) => { frog.visible = on; };
  rig.croak = () => frog.croak?.();
  rig.openEyes = (on) => rig.setExpression(on ? 'neutral' : 'closed');
  rig.holdFlute = (on, { instant = false } = {}) => {
    playing = on; flute.visible = on; notes.visible = on; rig.openEyes(!on);
    for (const s of ['L', 'R']) rig.setHand(s, on ? 'grip' : 'relax');
    return rig.tweenPose(on ? hold : neutral, 600, Ease.inOutSine, instant);
  };
  rig.playPhrase = ({ instant = false } = {}) => (instant ? Promise.resolve() : animate(1200, (k) => { rig.pose.head[2] = Math.sin(k * Math.PI) * 0.055; flute.rotation.z = Math.PI / 2 + Math.sin(k * Math.PI) * 0.06; rig.apply(); }, (k) => k));
  rig.stopPlaying = (o) => rig.holdFlute(false, o);
  rig._upd.push((dt, t) => {
    frog.update?.(dt, t);
    if (playing) for (const m of notes.children) { const k = (t * 0.35 + m.userData.phase) % 1; m.position.set((m.userData.phase < 0.5 ? -1 : 1) * (0.11 + k * 0.12), mouthY + 0.06 + k * 0.27, 0.16); m.material.opacity = Math.sin(k * Math.PI); }
  });
  lifeIdle(rig, { breath: 0.008, sway: 0.004, look: 0.03, lookEvery: 8, arms: 0.6 });
  rig.headTop.position.y = ry + 0.3;
  rig.play('idle'); rig.apply();
  return rig;
}

// ---- Elizabeth（记忆场景，戴雉鸡面具的小女孩）----
function buildElizabeth() {
  const skin = '#e3d7cc';
  const rig = womanBody('elizabeth_pheasant', {
    height: 1.32, seed: 71, dress: '#8c4d33', puff: true, puffBand: '#f1ece2', skirtW: 0.27, hem: 0.3, pleats: 14, shoes: '#211915', legs: '#ece8e0',
    dims: { head: 0.092, headW: 0.82, headD: 0.88, shoulderW: 0.088, hip: 0.5, knee: 0.27, neck: 0.81 },
    head: { skin, jaw: 0.18, chin: 0.08, crown: 0.1, flat: 0.1, nose: { top: 0.04, y: -0.24, len: 0.016, w: 0.01, tip: 1.0, wing: 0.5 }, paint: paintPlain(skin), faceSize: 128 },
  });
  const M = rig.mats, Y = rig.Y;
  roundCollar(rig, M.toon('#f1ece2', { side: THREE.DoubleSide, outline: 0.0035 }), { w: 0.11, h: 0.075, y: Y.neck + 0.004 });
  sashBow(rig, M.toon('#f1ece2', { side: THREE.DoubleSide }));
  hairCap(rig, { front: 0.3 * Math.PI, side: 0.55 * Math.PI, back: 0.68 * Math.PI, top: 0.04, scale: 1.07 }, M.toon('#ffffff', { map: hairStrands('#9a4a26', '#5a2410', 71) }));
  for (const side of ['L', 'R']) rig.ps.add(rig.joints['foot' + side], place(new THREE.TorusGeometry(0.028, 0.004, 5, 14), [0, -Y.ankle * 0.3, 0.03], [Math.PI / 2 - 0.25, 0, 0], [1, 1.25, 1]), M.toon('#211915', { outline: false }), 'shoe');
  hands(rig, 0.9, ['relax']);
  finish(rig);
  rig.headTags = ['head', 'face', 'hair', 'hat', 'neck'];
  rig.maskScale = rig.dims.headR[0] / 0.09;
  rig.setPose(P(armsDown(rig, { spread: 0.1, bend: 0.12 }), { head: [0.1, 0.06, 0], neck: [0.04, 0, 0] }));
  rig.setMask('pheasant');
  lifeIdle(rig, { breath: 0.012, sway: 0.008, look: 0.04 });
  rig.play('idle'); rig.apply();
  return rig;
}

function paintPlain(sk) {
  return (g, v) => {
    for (const s of [-1, 1]) {
      eye(g, s * 0.35, 0.03, 0.15, 0.08, s, { skin: sk, lid: v === 'blink' ? 1 : 0.5, closed: v === 'blink', lw: 6, bag: { lines: 1 } });
      line(g, [[s * 0.14, 0.2], [s * 0.36, 0.23], [s * 0.58, 0.19]], 9);
    }
    line(g, [[-0.15, -0.57], [0, -0.56], [0.15, -0.58]], 5);
  };
}

// ===========================================================================
// SOUL — Caroline's corrupted soul: black fuzzy silhouette with white eyes
// ===========================================================================

const _UP = V(0, 1, 0);
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

export const CAST = {
  david: buildDavid,
  david_p2: buildDavidFrogs,
  david_rabbit: buildDavidRabbit,
  jakob: () => buildJakob(),
  rower: () => buildJakob({ id: 'rower', bust: false, seated: true, small: true, hat: true }),
  jakob_child: buildJakobChild,
  gerard: buildGerardHuman,
  gerard_boar: buildGerardBoar,
  nicholas: buildNicholas,
  nicholas_deer: buildNicholasDeer,
  margaret: () => buildMargaret(),
  margaret_pot: () => buildMargaret({ stool: false, id: 'margaret_pot' }),
  margaret_cook: buildMargaretCook,
  margaret_chef: buildMargaretChef,
  margaret_pigeon: buildMargaretPigeon,
  caroline: buildCaroline,
  ida: buildIda,
  elizabeth_pheasant: buildElizabeth,
  soul: buildSoul,
};
export {
  buildJakob, manBody, womanBody, margaretBody, davidBody, gerardBody, nicholasBody, seatedPose, armsDown, pocketTarget,
  paintDavid, paintGerard, paintNicholas, paintMargaret, paintCaroline, paintIda, paintJakob, paintPlain,
  SKIN_DAVID, SKIN_GERARD, SKIN_NICK, SKIN_OLD, SKIN_CAROLINE, SKIN_IDA, SKIN_JAKOB,
};
// 第三灾人物变体（cast_p3*.js）复用的内部工具：只追加导出，不改实现。
export {
  P as mergePose, STOOP, bags, stubble, brow, roundCollar, sashBow, stripedCap, hairCapEdge, gerardBeard, gerardPockets, holdUpright,
  jakobBody, DAVID_DIMS, DAVID_HEAD, DAVID_COLORS, DAVID_HAT, GINGER,
  buildDavid, buildIda, buildCaroline, buildNicholas, buildMargaret, buildGerardHuman, buildElizabeth, buildJakobChild,
};
