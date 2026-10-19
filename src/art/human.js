// 新人物身体工具（第二版）：按真实身高推出骨架比例，衣服、袖子、裤腿、裙子做成连续蒙皮网格，
// 头部用变形头骨 + 手绘脸部贴花 + 立体鼻子 / 耳朵，头发、帽子、鞋是挂在关节上的刚体部件。
// 所有角色（cast.js）都用这里的函数组合；尺寸单位是米，人物站立时脚底 y = 0、面朝 +Z、左手在 +X。
import {
  THREE, mergeGeometries, clamp, lerp, smooth, step01, V, TAU, INK,
  cachedTex, canvasTexture, rng, shade, place, prep, sphere, lathe, taperTube, ringLoft, spineLoft, leafGeo, orient,
  headDeform, skullGeo, decalGeo, headSurface, faceSet, FS, createRig, skeleton, addHands, skinMesh, chainWeights,
  hairCapGeo, Ease, animate,
} from './charkit.js';

// ---------------------------------------------------------------------------
// 比例
// ---------------------------------------------------------------------------

/**
 * 由身高（头骨顶，不含头发帽子）推出骨架尺寸。o 里的比例都是“占身高的比例”，可按角色覆盖：
 *   head 头骨半高、headW / headD 头宽深相对头高、shoulder 肩关节高、shoulderW 肩关节半宽、hip 髋关节高、
 *   hipW 髋关节半宽、knee 膝高、ankle 踝高、upper / fore 上臂 / 前臂长、neck 颈根高、waist 腰椎（torso 关节）高于髋
 */
export function bodyDims(H, o = {}) {
  const k = {
    head: 0.074, headW: 0.74, headD: 0.84, shoulder: 0.8, shoulderW: 0.1, hip: 0.515, hipW: 0.052, knee: 0.282, ankle: 0.043,
    upper: 0.168, fore: 0.148, neck: 0.832, waist: 0.075, shoulderZ: -0.004, headZ: 0.012, neckZ: 0, ...o,
  };
  const ry = k.head * H, rx = ry * k.headW, rz = ry * k.headD;
  const hipY = k.hip * H, kneeY = k.knee * H, ankleY = k.ankle * H;
  const torsoY = hipY + k.waist * H, neckBase = k.neck * H, headC = H - ry;
  return {
    height: H, k,
    hipY, hipX: k.hipW * H, thigh: hipY - kneeY, shin: kneeY - ankleY,
    waist: torsoY - hipY, neckY: neckBase - torsoY, neckZ: k.neckZ * H, headY: headC - neckBase, headZ: k.headZ * H,
    shoulderY: k.shoulder * H - torsoY, shoulderX: k.shoulderW * H, shoulderZ: k.shoulderZ * H,
    upper: k.upper * H, fore: k.fore * H, headR: [rx, ry, rz], hatH: 0,
  };
}

/** 绑定姿势下关节在 root 空间的位置（全部旋转为 0，只累加平移）。 */
export function restPos(rig, name) {
  const out = V();
  for (let j = rig.joints[name]; j && j !== rig.root; j = j.parent) out.add(j.userData.base || j.position);
  return out;
}

/** 常用高度地标（root 空间 y）。 */
function landmarks(rig) {
  const D = rig.dims, H = D.height;
  const Y = {
    ground: 0, ankle: restPos(rig, 'footL').y, knee: restPos(rig, 'kneeL').y, hip: D.hipY, torso: restPos(rig, 'torso').y,
    shoulder: restPos(rig, 'armL').y, neck: restPos(rig, 'neck').y, head: restPos(rig, 'head').y, crown: H,
  };
  Y.chin = Y.head - D.headR[1] * 0.98;
  Y.crotch = Y.hip - 0.045 * H;
  Y.belt = Y.hip + 0.05 * H;
  Y.waist = Y.hip + 0.09 * H;
  Y.chest = Y.shoulder - 0.075 * H;
  Y.armpit = Y.shoulder - 0.05 * H;
  return Y;
}

/** 新建人物骨架。spec: { id, height, dims: 比例覆盖 } → rig（带 rig.dims / rig.Y）。 */
export function makeHuman(id, { height = 1.75, dims = {} } = {}) {
  const rig = createRig(id);
  const D = bodyDims(height, dims);
  skeleton(rig, D);
  rig.Y = landmarks(rig);
  rig.headTop.position.y = D.headR[1] + 0.16;
  return rig;
}

// ---------------------------------------------------------------------------
// 布料贴图：平涂底色 + 稀疏的墨线褶皱 + 少量明暗块（原作是平涂 + 少量手绘褶线，不是满布竖条纹）
// ---------------------------------------------------------------------------

/**
 * o: { seed, folds 褶线数量, ink 墨线浓度, len 褶线长度（0..1）, shadeAmt 明暗块强度, stripes: [color, width, gap] 竖条纹,
 *      hem: 下摆描边（v=0 处）, top: 上缘描边, dots, hatch: 交叉排线 }
 */
export function fabric(base, o = {}) {
  const key = `fab:${base}:${JSON.stringify(o)}`;
  return cachedTex(key, () => canvasTexture(512, 512, (g, w, h) => {
    const r = rng(o.seed ?? 7);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const sh = o.shadeAmt ?? 0.05;
    for (let i = 0; i < (o.blocks ?? 7); i++) {
      const x = r() * w, bw = 20 + r() * 70;
      g.globalAlpha = 0.5; g.fillStyle = r() < 0.55 ? shade(base, -sh) : shade(base, sh * 0.7);
      g.beginPath(); g.moveTo(x, h); g.bezierCurveTo(x + bw * 0.2, h * 0.6, x + bw * 0.6, h * 0.3, x + bw * 0.4, 0); g.lineTo(x + bw, 0);
      g.bezierCurveTo(x + bw * 1.1, h * 0.4, x + bw * 0.8, h * 0.7, x + bw * 0.9, h); g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
    if (o.stripes) {
      const [c, sw, gap] = o.stripes;
      g.fillStyle = c;
      for (let x = 0; x < w; x += sw + gap) g.fillRect(x, 0, sw, h);
    }
    if (o.checks) {
      const [c, n] = o.checks;
      g.strokeStyle = c; g.lineWidth = 2;
      for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * w / n, 0); g.lineTo(i * w / n, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / n); g.lineTo(w, i * h / n); g.stroke(); }
    }
    g.lineCap = 'round';
    const ink = o.ink ?? 0.55;
    for (let i = 0; i < (o.folds ?? 8); i++) {
      const x = r() * w, len = h * (o.len ?? 0.35) * (0.5 + r()), y0 = (o.from === 'bottom' ? h - len - r() * h * 0.1 : r() * (h - len));
      g.strokeStyle = `rgba(20,16,12,${ink * (0.5 + r() * 0.5)})`;
      g.lineWidth = 1.6 + r() * 2.2;
      g.beginPath(); g.moveTo(x, y0);
      g.bezierCurveTo(x + (r() - 0.5) * 22, y0 + len * 0.35, x + (r() - 0.5) * 22, y0 + len * 0.7, x + (r() - 0.5) * 16, y0 + len);
      g.stroke();
    }
    if (o.dots) { g.fillStyle = o.dots; for (let i = 0; i < 120; i++) { g.beginPath(); g.arc(r() * w, r() * h, 2.2, 0, TAU); g.fill(); } }
    if (o.hem) { g.fillStyle = o.hem; g.fillRect(0, h - 10, w, 10); }
    if (o.top) { g.fillStyle = o.top; g.fillRect(0, 0, w, 8); }
  }));
}

/** 衣物材质（双面、带描边）。 */
export function cloth(rig, base, o = {}) {
  const { outline, side = THREE.DoubleSide, flat = false, ...tex } = o;
  return rig.mats.toon(flat ? base : '#ffffff', { map: flat ? null : fabric(base, tex), side, ...(outline !== undefined ? { outline } : {}) });
}

// ---------------------------------------------------------------------------
// 蒙皮衣物
// ---------------------------------------------------------------------------

/**
 * 躯干类衣物（衬衫身、马甲、外套身、连衣裙上身）：keys 自下而上 { y, w, d, cx, cz, n, gap }（root 空间）。
 * 权重：脖子 / 躯干 / 髋按高度过渡，肩部外侧带一部分上臂权重（抬手时肩膀跟着走）；legs: true 时下沿过渡到大腿。
 */
export function torsoSkin(rig, keys, mat, o = {}) {
  const { tag = 'torso', radial = 48, steps = 4, cap = null, pleat = null, drop = null, armBlend = 0.5, legs = false } = o;
  const geo = o.geo || ringLoft(keys, { radial, steps, cap, pleat, drop });
  return skinMesh(rig, geo, mat, torsoWeights(rig, { armBlend, legs }), tag);
}

export function torsoWeights(rig, { armBlend = 0.5, legs = false } = {}) {
  const D = rig.dims, Y = rig.Y, sx = D.shoulderX;
  const neckCut = Y.neck - 0.005, waistCut = Y.torso;
  return (v) => {
    const s = Y.neck + 0.05 - v.y;
    let w = chainWeights(['neck', 'torso', 'body'], [Y.neck + 0.05 - neckCut, Y.neck + 0.05 - waistCut], s, 0.05);
    const ax = Math.abs(v.x);
    const a = armBlend * step01(ax, sx * 0.55, sx * 1.08) * step01(v.y, Y.armpit - 0.06, Y.shoulder - 0.01);
    if (a > 0) { w = w.map(([n, x]) => [n, x * (1 - a)]); w.push([v.x >= 0 ? 'armL' : 'armR', a]); }
    if (legs) {
      const l = 0.85 * step01(Y.hip - v.y, -0.01, 0.07);
      if (l > 0) {
        const kL = step01(v.x, -0.03, 0.03);
        w = w.map(([n, x]) => [n, x * (1 - l)]);
        w.push(['legL', l * kL], ['legR', l * (1 - kL)]);
      }
    }
    return w;
  };
}

/**
 * 四肢（袖子 / 前臂 / 裤腿 / 小腿 / 靴筒）：沿骨链的管子。side 'L'|'R'，kind 'arm'|'leg'。
 * keys: { s 从肩 / 髋关节往下的距离（可为负 = 关节上方）, w 左右半宽, d 前后半厚, ox 向外偏移, oz 向前偏移, n 超椭圆指数 }。
 */
export function limbSkin(rig, side, kind, keys, mat, o = {}) {
  const { tag = kind, radial = 24, steps = 3, cap = null, pleat = null, drop = null } = o;
  const sgn = side === 'L' ? 1 : -1;
  const D = rig.dims;
  const top = restPos(rig, (kind === 'arm' ? 'arm' : 'leg') + side);
  const lk = keys.map((k) => ({ y: top.y - k.s, w: k.w, d: k.d ?? k.w, cx: top.x + sgn * (k.ox || 0), cz: top.z + (k.oz || 0), n: k.n ?? 2 }))
    .sort((a, b) => a.y - b.y);
  const geo = ringLoft(lk, { radial, steps, cap, pleat, drop });
  const names = kind === 'arm' ? ['torso', 'arm' + side, 'elbow' + side, 'hand' + side] : ['body', 'leg' + side, 'knee' + side, 'foot' + side];
  const L1 = kind === 'arm' ? D.upper : D.thigh, L2 = kind === 'arm' ? D.fore : D.shin;
  const blend = o.blend ?? (kind === 'arm' ? 0.045 : 0.06);
  const parentBlend = o.parentBlend ?? 0.035;
  const fn = (v) => {
    const s = top.y - v.y;
    const w1 = step01(s, -parentBlend, parentBlend);        // 0 = 父关节（躯干 / 髋），1 = 本肢体
    const rest = chainWeights(names.slice(1), [L1, L1 + L2], s, blend);
    return [[names[0], 1 - w1], ...rest.map(([n, x]) => [n, x * w1])];
  };
  return skinMesh(rig, geo, mat, o.weights || fn, tag);
}

/**
 * 裙子 / 长袍下摆：keys 自下而上（root 空间）。前片随大腿和小腿走（坐下时形成膝上的裙兜），后片留在髋上。
 */
export function skirtSkin(rig, keys, mat, o = {}) {
  const { tag = 'skirt', radial = 64, steps = 4, pleat = null, drop = null, cap = null, follow = 1 } = o;
  const Y = rig.Y;
  const geo = ringLoft(keys, { radial, steps, pleat, drop, cap });
  const hipZ = 0;
  const fn = (v) => {
    const depth = Y.hip + 0.02 - v.y;
    if (depth <= 0) return [['body', 1]];
    const front = step01(v.z - hipZ, -0.08, 0.06);
    const leg = follow * step01(depth, 0.0, 0.16) * (0.3 + 0.7 * front);
    const shinK = step01(Y.knee + 0.04 - v.y, 0, 0.1) * front;
    const kL = step01(v.x, -0.05, 0.05);
    const out = [['body', 1 - leg]];
    for (const [s, f] of [['L', kL], ['R', 1 - kL]]) {
      out.push(['leg' + s, leg * f * (1 - shinK)]);
      out.push(['knee' + s, leg * f * shinK]);
    }
    return out;
  };
  return skinMesh(rig, geo, mat, fn, tag);
}

// ---------------------------------------------------------------------------
// 刚体部件：头、手、鞋、头发、帽子
// ---------------------------------------------------------------------------

/**
 * 头部：变形头骨 + 脸部贴花 + 立体鼻子 + C 形耳朵 + 脖子。
 * spec: { skin, jaw, chin, crown, flat, cheek, nose: { top, y, len, w, tip, wing, drop, hook }, ear: { y, s }, paint(g, variant), faceSize, neck: [rTop, rBot] }
 */
export function head(rig, spec) {
  const D = rig.dims, [rx, ry, rz] = D.headR;
  const s = { rx, ry, rz, jaw: 0.25, chin: 0.15, crown: 0.1, flat: 0.14, cheek: 0, ...spec };
  const def = headDeform(s);
  rig.headDef = def; rig.headSpec = s;
  const J = rig.joints, M = rig.mats;
  const skin = M.toon(s.skin);
  rig.skinMat = skin;
  rig.ps.add(J.head, skullGeo(def, 48, 36), skin, 'head');
  // 耳朵：竖着的扁椭球 + 内侧耳窝（略向后倾）
  if (s.ears !== false) {
    const e = { y: -0.06, s: 1, ...(s.ear || {}) };
    for (const sd of [-1, 1]) {
      const p = V(sd * 0.95, e.y, -0.06); def(p);
      const L = ry * 0.24 * e.s, W = ry * 0.13 * e.s;
      rig.ps.add(J.head, place(sphere(W * 0.32, L, W, 16, 12), [p.x + sd * W * 0.2, p.y, p.z], [-0.15, sd * -0.35, 0]), skin, 'head');
      rig.ps.add(J.head, place(sphere(W * 0.18, L * 0.6, W * 0.55, 12, 8), [p.x + sd * W * 0.38, p.y - L * 0.05, p.z + W * 0.05], [-0.15, sd * -0.35, 0]), M.toon(shade(s.skin, -0.12), { outline: false }), 'head');
    }
  }
  // 鼻子：鼻梁 → 鼻头 → 鼻翼
  const n = { top: 0.12, y: -0.3, len: 0.034, w: 0.014, tip: 1.1, wing: 0.8, drop: 0, hook: 0, ...(s.nose || {}) };
  const base = headSurface(def, 0, n.top), tipS = headSurface(def, 0, n.y);
  const tip = V(0, tipS.y + n.drop, tipS.z + n.len);
  const mid = V(0, lerp(base.y, tip.y, 0.55), lerp(base.z, tip.z, 0.62) + n.hook);
  rig.ps.add(J.head, taperTube([V(0, base.y + 0.004, base.z - 0.01), mid, V(0, tip.y + n.w * 0.5, tip.z - n.w * 0.55)], n.w * 0.42, n.w * 0.78, 16, 10), skin, 'head');
  rig.ps.add(J.head, place(sphere(n.w * n.tip, n.w * n.tip * 0.92, n.w * n.tip * 0.95, 18, 12), [0, tip.y, tip.z - n.w * 0.45]), skin, 'head');
  if (n.wing > 0) for (const sd of [-1, 1]) rig.ps.add(J.head, place(sphere(n.w * 0.72 * n.wing, n.w * 0.62, n.w * 0.68, 14, 10), [sd * n.w * 0.92 * n.wing, tip.y - n.w * 0.3, tip.z - n.w * 1.15]), skin, 'head');
  rig.noseTip = tip;
  // 脸部贴花
  const S = s.faceSize || FS;
  const tex = faceSet((g, variant) => s.paint(g, variant), S);
  const dmat = new THREE.MeshToonMaterial({
    map: tex('neutral'), transparent: true, gradientMap: skin.gradientMap, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  dmat.userData.outlineParameters = { visible: false };
  rig.mats.all.push(dmat);
  const decal = new THREE.Mesh(decalGeo(def, rx, ry, 1.006, 1.32), dmat);
  decal.name = `${rig.id}_face`;
  decal.renderOrder = 1;
  J.head.add(decal);
  rig.face = { mesh: decal, tex, expr: 'neutral', cur: 'neutral', blink: false, timer: 1.5 + Math.random() * 2, mouth: false, talkT: 0 };
  // 脖子：从领口里伸到下颌后方
  const [r0, r1] = s.neck || [rx * 0.46, rx * 0.5];
  const nh = J.head.position.y;
  rig.ps.add(J.neck, ringLoft([
    { y: -0.04, w: r1 * 1.05, d: r1 * 0.98, cz: -0.004 }, { y: nh * 0.45, w: r0, d: r0 * 0.96 }, { y: nh + 0.01, w: r0 * 0.98, d: r0 * 0.92, cz: -0.012 },
  ], { radial: 20, steps: 3 }), skin, 'neck');
  return def;
}

/** 手（多个姿势网格，rig.setHand 切换）。size 相对成年男性。 */
export function hands(rig, size = 1, poses = ['relax']) {
  addHands(rig, rig.skinMat, size * rig.dims.height / 1.78, poses);
}

/** 鞋 / 靴子的鞋头部分（挂在 foot 关节，原点在脚踝）。f: { w, h, l, z, sole, color, toe } */
export function shoes(rig, f, mat, soleMat) {
  const J = rig.joints;
  for (const side of ['L', 'R']) {
    const ah = rig.Y.ankle;
    rig.ps.add(J['foot' + side], spineLoft([
      { y: -ah * 0.2, z: -f.l * 0.3, w: f.w * 0.82, h: ah * 0.62 },
      { y: -ah * 0.35, z: f.l * 0.02, w: f.w * 0.95, h: ah * 0.62 },
      { y: -ah * 0.52, z: f.l * 0.38, w: f.w * 1.02, h: ah * 0.48 * (f.toe || 1) },
      { y: -ah * 0.62, z: f.l * 0.62, w: f.w * 0.8, h: ah * 0.34 * (f.toe || 1) },
    ], { radial: 22, steps: 3, cap: [0.9, 1] }).geo.translate(0, 0, f.z ?? 0.03), mat, 'shoe');
    rig.ps.add(J['foot' + side], place(new THREE.CylinderGeometry(1, 1, 0.014, 20), [0, -ah + 0.007, (f.z ?? 0.03) + f.l * 0.16], [0, 0, 0], [f.w * 1.04, 1, f.l * 0.55]), soleMat || mat, 'shoe');
  }
}

/** 头发帽（贴合头骨）。o 同 hairCapGeo。 */
export function hairCap(rig, o, mat, tag = 'hair') {
  rig.ps.add(rig.joints.head, hairCapGeo(rig, o), mat, tag);
}

/** 一绺头发：沿点的扁管，宽 w、厚 t，末端收尖。点在头部局部坐标。 */
export function lockGeo(points, w, t = w * 0.45, { tip = 0.08, seg = 28, radial = 10 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : V(p[0], p[1], p[2]))));
  const frames = curve.computeFrenetFrames(seg, false);
  const pos = [], uv = [], idx = [];
  const P = V();
  for (let i = 0; i <= seg; i++) {
    const k = i / seg;
    curve.getPointAt(k, P);
    const sc = k < 0.15 ? lerp(0.7, 1, k / 0.15) : lerp(1, tip, Math.pow((k - 0.15) / 0.85, 1.6));
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const cx = Math.cos(a) * w * sc, cy = Math.sin(a) * t * sc;
      pos.push(P.x + N.x * cy + B.x * cx, P.y + N.y * cy + B.y * cx, P.z + N.z * cy + B.z * cx);
      uv.push(j / radial, k);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
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

/** 发丝贴图（沿 v 方向的线）。 */
export function hairStrands(base, line, seed = 3) {
  return cachedTex(`strand:${base}:${line}:${seed}`, () => canvasTexture(256, 256, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const x = r() * w;
      g.strokeStyle = r() < 0.6 ? line : shade(base, 0.1);
      g.globalAlpha = 0.45 + r() * 0.45; g.lineWidth = 1.2 + r() * 2.2;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 20, h * 0.35, x + (r() - 0.5) * 20, h * 0.7, x + (r() - 0.5) * 14, h); g.stroke();
    }
    g.globalAlpha = 1;
  }));
}

/**
 * 软呢帽：挂在 'hat' 关节（rig.pose.hat 可以让帽子微斜）。
 * o: { r 帽冠半径, h 冠高, brim 帽檐宽, up 檐上翘, dent 冠顶凹, pinch 前侧捏痕, band 帽带色, color, y, tilt:[x,y,z], depth 前后比例 }
 */
export function feltHat(rig, o) {
  const J = rig.joints, M = rig.mats;
  const [rx, ry] = rig.dims.headR;
  const hat = rig.addJoint('hat', J.head, [0, o.y ?? ry * 0.5, o.z ?? -0.004]);
  rig.parts.hat = hat;
  rig.pose.hat = (o.tilt || [-0.08, 0, 0.04]).slice();
  const r = o.r ?? rx * 1.06, h = o.h ?? ry * 0.82, brim = o.brim ?? r * 0.55, depth = o.depth ?? 0.9;
  const felt = M.toon('#ffffff', { map: fabric(o.color, { seed: o.seed ?? 31, folds: 3, ink: 0.3, len: 0.45, shadeAmt: 0.035, blocks: 3 }) });
  // 帽冠：侧面微收，顶部中央凹陷
  const prof = [[r, 0], [r * 0.99, h * 0.35], [r * 0.95, h * 0.72], [r * 0.86, h * 0.95], [r * 0.6, h * (1 - (o.dent ?? 0.12) * 0.4)], [r * 0.3, h * (1 - (o.dent ?? 0.12))], [0.0001, h * (1 - (o.dent ?? 0.12) * 1.1)]];
  const crown = lathe(prof, 40).scale(1, 1, depth);
  if (o.pinch) {
    const p = crown.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (z > 0 && y > h * 0.5) p.setX(i, x * (1 - o.pinch * Math.pow(z / (r * depth), 2) * (y / h)));
    }
    crown.computeVertexNormals();
  }
  rig.ps.add(hat, crown, felt, 'hat');
  rig.ps.add(hat, lathe([[r * 1.012, 0.002], [r * 1.012, h * 0.24]], 40).scale(1, 1, depth), M.toon(o.band || shade(o.color, -0.25), { side: THREE.DoubleSide }), 'hat');
  // 帽檐：外缘上翘（两侧更翘），前后略下压
  const up = o.up ?? 0.25;
  const brimG = lathe([[r * 0.98, 0.004], [r + brim * 0.5, -0.002], [r + brim, brim * up * 0.4], [r + brim * 1.02, brim * up * 0.55], [r + brim * 0.9, brim * up * 0.5], [r + brim * 0.4, 0.01], [r * 0.98, 0.012]], 48);
  const bp = brimG.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), z = bp.getZ(i), rr = Math.hypot(x, z) || 1, side = Math.abs(x) / rr;
    const out = clamp((rr - r) / brim, 0, 1);
    bp.setY(i, bp.getY(i) + out * brim * (o.sideUp ?? 0.35) * side * side - out * brim * 0.08 * (1 - side));
    bp.setZ(i, z * depth);
  }
  brimG.computeVertexNormals();
  rig.ps.add(hat, brimG, felt, 'hat');
  rig.dims.hatH = h;
  rig.headTop.position.y = ry + h + 0.1;
  return hat;
}

// ---------------------------------------------------------------------------
// 收尾与动作
// ---------------------------------------------------------------------------

/** 合并刚体部件并绑定蒙皮。所有衣物、头、手加完后调用一次，再设置姿势。 */
export function finish(rig) {
  rig.ps.build(rig);
  rig.bindSkins();
  return rig;
}

/**
 * 自然待机：呼吸（胸口起伏、肩膀微动）、重心左右缓慢转移、头部隔几秒换一个注视方向（缓入缓出后停住）、偶尔低头。
 * o: { breath, sway, look 头部转动幅度（弧度）, lookEvery 秒, tilt, speed, seated }
 */
export function lifeIdle(rig, o = {}) {
  const { breath = 0.014, sway = 0.01, look = 0.12, lookEvery = 4.5, tilt = 0.04, speed = 1, seated = false, arms = 1 } = o;
  const ph = Math.random() * 10;
  const L = { from: [0, 0], to: [0, 0], k: 1, wait: 1 + Math.random() * 2 };
  rig._idleFn = (t, I, dt = 0) => {
    const tt = t * speed + ph;
    // 呼吸：约 4 秒一次，吸气快呼气慢
    const b = Math.pow(Math.sin(tt * 1.55) * 0.5 + 0.5, 1.4);
    I.torso[0] -= b * breath;
    I.neck[0] += b * breath * 0.5;
    if (I.armL) { I.armL[2] += b * breath * 0.25 * arms; I.armR[2] -= b * breath * 0.25 * arms; }
    // 重心转移
    if (!seated) {
      const s = Math.sin(tt * 0.37) * 0.6 + Math.sin(tt * 0.23 + 1.3) * 0.4;
      I.body[2] += s * sway * 0.5;
      I.torso[2] -= s * sway * 0.7;
      if (I.legL) { I.legL[2] -= s * sway * 0.5; I.legR[2] -= s * sway * 0.5; }
    } else {
      I.torso[2] += Math.sin(tt * 0.3) * sway * 0.4;
    }
    // 注视：随机挑一个方向缓缓转过去，停一会儿
    L.wait -= dt;
    if (L.wait <= 0 && L.k >= 1) {
      L.from = L.to.slice();
      L.to = [(Math.random() - 0.5) * 2 * look, (Math.random() - 0.35) * look * 0.5];
      L.k = 0; L.wait = lookEvery * (0.6 + Math.random() * 0.9);
    }
    if (L.k < 1) L.k = Math.min(1, L.k + dt / 0.9);
    const e = smooth(L.k);
    I.head[1] += lerp(L.from[0], L.to[0], e);
    I.head[0] += lerp(L.from[1], L.to[1], e) + Math.sin(tt * 0.53) * tilt * 0.3;
    I.head[2] += Math.sin(tt * 0.29 + 2) * tilt * 0.4;
  };
}

/** 在两个姿势之间按曲线播放：keys = [[时间 0..1, pose], ...]，ms 总时长。返回 Promise。 */
export function playKeys(rig, keys, ms, { ease = Ease.inOutSine, onFrame = null } = {}) {
  const names = new Set();
  for (const [, p] of keys) for (const n in p) names.add(n);
  const start = {};
  for (const n of names) start[n] = (rig.pose[n] || [0, 0, 0]).slice();
  const ks = keys[0][0] > 0 ? [[0, start], ...keys] : keys;
  return animate(ms, (k) => {
    let i = 0;
    while (i < ks.length - 2 && ks[i + 1][0] < k) i++;
    const [t0, a] = ks[i], [t1, b] = ks[i + 1];
    const e = ease(clamp((k - t0) / ((t1 - t0) || 1), 0, 1));
    for (const n of names) {
      const pa = a[n] || start[n], pb = b[n] || pa;
      const p = rig.pose[n] || (rig.pose[n] = [0, 0, 0]);
      p[0] = lerp(pa[0], pb[0], e); p[1] = lerp(pa[1], pb[1], e); p[2] = lerp(pa[2], pb[2], e);
    }
    if (onFrame) onFrame(k);
    rig.apply();
  }, (k) => k);
}

export { INK, V, lerp, clamp, smooth, step01, TAU };
