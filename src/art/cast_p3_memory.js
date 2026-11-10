// 第三灾人物变体：回忆里的一家人（参考 13:20–13:36：白桦林岩壁前排成一排，像一张老照片；半透明淡入，玫瑰花瓣飘散后淡出）。
// 从左到右：gerard_young、margaret_baby（坐着抱婴儿）、ida_child、少年 Jakob（直接用 cast.js 的 jakob_child）、caroline_rose、nicholas_stand。
// 身体一律复用 cast.js（gerardBody / margaretBody / womanBody + Elizabeth 的小女孩参数 / buildCaroline / nicholasBody），
// 这里只换姿势、道具（婴儿、玫瑰）、发型和衣服颜色 / 部件。人物 scale = 1、真实身高。
// 淡入淡出用 rig.setOpacity(a)：这五个人物建好后都经过 ghostFade(rig)，整个人当成一个整体半透明（不会变成一团发黑的玻璃）；
// 少年 Jakob（cast.js 的 jakob_child）没有，章节里要和他们一起淡入淡出时对他也调用一次导出的 ghostFade(rig)。
// 挂到人物身上的道具（玫瑰）材质都复制成本 rig 私有的，setOpacity 不会把别处的同款道具一起变透明。
import {
  THREE, V, TAU, clamp, lerp, smooth, place, prep, sphere, lathe, orient, leafGeo, taperTube, line, blob, eye, FX, FY, faceSet, headSurface,
  canvasTexture, rng, mergeGeometries, ribbonGeo, getPropFactory, animate, Ease,
} from './charkit.js';
import { hands, finish, lifeIdle, lockGeo, hairStrands, hairCap, torsoSkin, limbSkin, cloth, fabric } from './human.js';
import {
  gerardBody, gerardPockets, margaretBody, STOOP, seatedPose, mergePose as P, womanBody, SKIN_IDA, SKIN_GERARD,
  buildCaroline, holdUpright, nicholasBody, armsDown, bags, brow,
} from './cast.js';

// ===========================================================================
// 小工具
// ===========================================================================

/** 同一材质的几块几何体合并成一个网格（少 draw call）。 */
function merged(geos, mat, name = '') {
  const m = new THREE.Mesh(geos.length === 1 ? prep(geos[0]) : mergeGeometries(geos.map(prep), false), mat);
  m.name = name;
  m.castShadow = !mat.transparent;
  return m;
}

/** 道具工厂的模型用的是全局缓存材质：挂到人物上之前复制一份（rig.setOpacity 改透明度时只影响这一份）。 */
function ownMaterials(obj) {
  const copies = new Map();
  const own = (m) => { if (!copies.has(m)) copies.set(m, m.clone()); return copies.get(m); };
  obj.traverse((o) => { if (o.material) o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material); });
  return obj;
}

/**
 * 整个人物当作“一个整体”半透明（回忆里的一家人要半透明淡入淡出）。
 * rig.setOpacity 自带的做法是把每块材质都变成透明、不写深度：衣服、身体、骨架外轮廓全部叠在一起，
 * 0.5 透明度下整个人变成一团发黑的玻璃，脸上还会透出后脑勺的描边。
 * 这里给每个不透明网格加一个只写深度的“替身”（作为它的子物体，所以显隐、蒙皮、位姿都跟着本体走），
 * 替身排在彩色网格之前画：每个像素只有最靠前的那一层衣服 / 皮肤带着 alpha 混到背景上，描边也只剩外轮廓。
 * 替身只在 setOpacity(a < 1) 时才开启，a = 1 时和不加完全一样；已经透明的贴片（脸贴花、婴儿脸）不加替身。
 * 要在人物全部建好（最后一次 bindSkins 之后）调用；可重复调用，返回 rig。
 */
export function ghostFade(rig) {
  if (rig.ghostTwins) return rig;
  const depthMats = {};
  const depthMat = (side) => {
    if (!depthMats[side]) {
      const m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true, opacity: 1, side, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      m.userData.outlineParameters = { visible: false };
      depthMats[side] = m;
    }
    return depthMats[side];
  };
  const twins = [], meshes = [];
  rig.root.traverse((o) => { if (o.isMesh && !o.userData.proxy) meshes.push(o); });
  for (const m of meshes) {
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    if (!mat || mat.transparent || mat.visible === false) continue;
    const t = m.isSkinnedMesh ? new THREE.SkinnedMesh(m.geometry, depthMat(mat.side)) : new THREE.Mesh(m.geometry, depthMat(mat.side));
    if (m.isSkinnedMesh) { t.bind(m.skeleton, m.bindMatrix); t.boundingSphere = m.boundingSphere; }
    t.name = `${m.name}:depth`; t.userData.ghostTwin = true; t.visible = false; t.renderOrder = -1;
    t.castShadow = false; t.receiveShadow = false; t.frustumCulled = m.frustumCulled;
    m.add(t); twins.push(t);
  }
  let on = false;
  rig.ghostTwins = twins;
  rig.setOpacity = (a = 1) => {
    const ghost = a < 0.999 && a > 0.001;
    for (const t of twins) t.visible = ghost;
    rig.root.traverse((o) => {
      if (!o.material || o.userData.ghostTwin) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        const u = m.userData;
        if (!u.ghostBase) u.ghostBase = { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
        m.opacity = u.ghostBase.opacity * a;
        m.transparent = a < 1 || u.ghostBase.transparent;
        m.depthWrite = ghost ? false : u.ghostBase.depthWrite;
        if (u.outlineParameters) u.outlineParameters.alpha = a;
        if (ghost !== on) m.needsUpdate = true;
      }
    });
    on = ghost;
  };
  return rig;
}

function prop(id, opts = {}) {
  const f = getPropFactory();
  try { const o = f ? f(id, opts) : null; return o ? ownMaterials(o) : null; } catch (e) { return null; }
}

/** 把 rig 里所有用 from 材质的网格换成 to（换衣服颜色；from 取 cast.js 里同参数的缓存材质，参数对不上时什么也不做）。 */
function swapMaterial(rig, from, to) {
  rig.root.traverse((o) => { if (o.material === from) o.material = to; });
}

// ===========================================================================
// 婴儿：buildCaroline 里 Caroline 抱的那个襁褓婴儿的做法（白布椭球身体 + 肉色圆头 + 平面手绘小脸 + 刺绣垂巾），
// 抽成小函数；回忆里坐在 Margaret 腿上的那个用 sit 版（白色小褂、锈棕色裤子往前伸、姜黄头发，13:28）。
// ===========================================================================

const BABY_SKIN = '#e9c9bd';

/** 婴儿小脸：sleep = Caroline 怀里那个（闭眼弧线 + 张开的小嘴）；calm = 回忆里那个（两个小黑点眼睛 + 淡眉 + 一字小嘴）。 */
function paintBaby(kind) {
  return (g) => {
    if (kind === 'calm') {
      for (const s of [-1, 1]) {
        g.fillStyle = '#2a201c'; g.beginPath(); g.arc(FX(s * 0.3), FY(0.05), 0.06 * 256, 0, TAU); g.fill();
        line(g, [[s * 0.14, 0.27], [s * 0.3, 0.31], [s * 0.46, 0.27]], 4, 'rgba(150,95,50,0.75)');
      }
      line(g, [[-0.03, -0.1], [0.03, -0.2]], 3.5, 'rgba(90,55,45,0.55)');
      line(g, [[-0.13, -0.44], [0, -0.47], [0.13, -0.44]], 5, '#6a3e33');
      return;
    }
    for (const s of [-1, 1]) line(g, [[s * 0.12, 0.08], [s * 0.32, 0.03], [s * 0.5, 0.08]], 6);
    line(g, [[-0.16, -0.32], [0.04, -0.42], [0.18, -0.33], [0.1, -0.62], [-0.12, -0.58], [-0.16, -0.32]], 1);
    const p = [[-0.16, -0.32], [0.04, -0.42], [0.18, -0.33], [0.1, -0.62], [-0.12, -0.58]].map(([x, y]) => [FX(x), FY(y)]);
    g.beginPath(); g.moveTo(...p[0]); for (const q of p.slice(1)) g.lineTo(...q); g.closePath(); g.fillStyle = '#5d3930'; g.fill();
  };
}

/**
 * 婴儿。o: { name, scale, sit（坐姿）, wrap 白布色, skin, hair 头发色（null = 光头）, pants 坐姿时腿上的颜色, cloth（襁褓的刺绣垂巾，默认有）, face 'sleep' | 'calm' }
 * 原点在身体中心、面朝 +z；userData.head = 头部 Group（可单独转头）。襁褓版尺寸、位置与 buildCaroline 的完全一致。
 */
function makeBaby(M, o = {}) {
  const sit = !!o.sit;
  const root = new THREE.Group(); root.name = o.name || 'baby';
  const g = new THREE.Group(); g.scale.setScalar(o.scale ?? 1); root.add(g);
  const wrap = M.toon('#ffffff', { map: fabric(o.wrap || '#e3e4df', { folds: 5, ink: 0.25, blocks: 2 }) });
  const skin = M.toon(o.skin || BABY_SKIN);
  const wraps = [place(sphere(0.07, sit ? 0.092 : 0.15, 0.06, 28, 20), [0, sit ? 0.03 : -0.02, 0])];
  const skins = [];
  // 头：肉色圆头 + 平面小脸（+ 头发）
  const head = new THREE.Group(); head.name = `${root.name}_head`; head.position.set(0, sit ? 0.162 : 0.135, 0.02); g.add(head);
  head.add(merged([sphere(0.042, 0.048, 0.04, 24, 16)], skin, `${root.name}_skull`));
  const face = faceSet(paintBaby(o.face || (sit ? 'calm' : 'sleep')));
  const fm = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.08), M.unlit('#ffffff', { map: face('neutral'), transparent: true, depthWrite: false }));
  fm.name = `${root.name}_face`; fm.position.set(0, -0.005, 0.042); head.add(fm);
  if (o.hair) {
    // 头顶一片短发 + 额前一小撮翘起来的
    const cap = new THREE.SphereGeometry(1, 22, 10, 0, TAU, 0, Math.PI * 0.4);
    const tuft = orient(leafGeo(0.034, 0.02, { at: 0.35, depth: 0.004, baseW: 0.8 }), V(0.004, 0.044, 0.018), [0.35, -0.55, 1], [0, 0.4, 1]);
    head.add(merged([place(cap, [0, 0.003, -0.006], [-0.42, 0, 0], [0.046, 0.053, 0.045]), tuft], M.toon('#ffffff', { map: hairStrands(o.hair, '#7a4316', 17) }), `${root.name}_hair`));
  }
  if (sit) {
    // 坐着：屁股和两条腿裹在锈棕色裤子里往前伸，露出一点小脚；两只白袖子小胳膊垂在身侧
    const pants = M.toon('#ffffff', { map: fabric(o.pants || '#8a4f2c', { folds: 4, ink: 0.3, blocks: 2 }) });
    const pg = [place(sphere(0.074, 0.046, 0.072, 20, 12), [0, -0.045, 0.004])];
    for (const s of [-1, 1]) {
      pg.push(taperTube([V(s * 0.032, -0.05, 0.0), V(s * 0.036, -0.058, 0.07), V(s * 0.032, -0.062, 0.14)], 0.032, 0.025, 12, 10));
      skins.push(place(sphere(0.02, 0.022, 0.028, 12, 8), [s * 0.033, -0.06, 0.165]));
      wraps.push(taperTube([V(s * 0.058, 0.085, 0.0), V(s * 0.074, 0.035, 0.02), V(s * 0.062, -0.008, 0.05)], 0.02, 0.017, 10, 8));
      skins.push(place(sphere(0.016, 0.016, 0.017, 10, 8), [s * 0.058, -0.018, 0.064]));
    }
    g.add(merged(pg, pants, `${root.name}_pants`));
  } else if (o.cloth !== false) {
    // 垂下来的布巾（刺绣下摆），同 buildCaroline
    const tex = canvasTexture(128, 256, (c, w, h) => {
      c.fillStyle = '#ecece7'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(80,80,74,0.8)'; c.lineWidth = 3;
      c.beginPath(); for (let x = 0; x <= w; x += 12) c.lineTo(x, h - 30 + ((x / 12) % 2 ? 10 : 0)); c.stroke();
      c.beginPath(); for (let x = 0; x <= w; x += 12) c.lineTo(x, h - 50 + ((x / 12) % 2 ? 10 : 0)); c.stroke();
      c.strokeRect(4, 4, w - 8, h - 8);
    });
    const hang = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.22, 4, 8), M.toon('#ffffff', { map: tex, side: THREE.DoubleSide }));
    hang.position.set(-0.02, -0.17, 0.065); hang.rotation.z = 0.25; g.add(hang);
  }
  g.add(merged(wraps, wrap, `${root.name}_wrap`));
  if (skins.length) g.add(merged(skins, skin, `${root.name}_hands`));
  root.userData.head = head;
  return root;
}

// ===========================================================================
// 1. GERARD（年轻时）：不戴帽子、没留胡子（13:28 特写是光脸），蓬乱的姜棕发往右上梳、露耳朵，眉毛粗重、眼袋发青、嘴是下撇的平线（换了脸），
//    锈红敞开马甲、卷袖白衬衫、棕裤靴，双手插兜，身子朝右（一家人那边）侧过来约 15°，脸朝镜头。
// ===========================================================================

/**
 * 年轻 Gerard 的脸（13:28）：光脸没有胡茬；粗重的姜棕色眉毛内端压低、眉眼阴沉；眼袋是发青的灰影；
 * 嘴是紧抿的一条平线，右边嘴角（画面左）微微下撇，两道深深的法令纹。paintGerard 的嘴角是上弯的“微笑”，不用它。
 */
function paintGerardYoung(g, v) {
  const closed = v === 'blink';
  for (const s of [-1, 1]) {
    bags(g, s * 0.34, 0.03, 0.19, 0.1, s, { depth: 1.9, lines: 1, color: 'rgba(66,72,62,0.42)' });
    eye(g, s * 0.34, 0.04, 0.17, 0.08, s, { skin: SKIN_GERARD, lid: 0.56, pupil: 0.58, closed, droop: 0.06, lw: 6, crease: false, look: [0.08, 0] });
    brow(g, [[s * 0.1, 0.15], [s * 0.3, 0.235], [s * 0.6, 0.21]], 11, '#7a4a22');
    line(g, [[s * 0.3, -0.2], [s * 0.42, -0.4], [s * 0.38, -0.6]], 3.2, 'rgba(60,50,46,0.6)');
    line(g, [[s * 0.55, 0.0], [s * 0.62, -0.25], [s * 0.5, -0.55]], 2.6, 'rgba(60,50,46,0.28)');
  }
  line(g, [[-0.07, 0.04], [-0.1, -0.16], [-0.05, -0.25], [0.08, -0.26]], 4, 'rgba(20,20,20,0.7)');
  if (v === 'talk') blob(g, [[-0.18, -0.52], [0, -0.55], [0.2, -0.52], [0.1, -0.72], [-0.08, -0.72]], '#321e1a');
  else {
    line(g, [[-0.2, -0.55], [-0.08, -0.555], [0.1, -0.55], [0.22, -0.6]], 5.5);
    line(g, [[-0.1, -0.66], [0.04, -0.67], [0.12, -0.65]], 2.6, 'rgba(60,45,40,0.45)');
  }
}

function youngGerardHair(rig) {
  const M = rig.mats, J = rig.joints, [rx, ry, rz] = rig.dims.headR;
  // 头发材质一律双面：单面的话从侧后方看，发帽背面被剔掉，露出里面描边外壳，脑后会出现一大块黑
  const hm = M.toon('#ffffff', { side: THREE.DoubleSide, map: hairStrands('#a4673a', '#563420', 64) });
  // 平时被帽子压着的短发帽外面再罩一层：头顶隆起，前额发际线较高
  hairCap(rig, { front: 0.26 * Math.PI, side: 0.47 * Math.PI, back: 0.74 * Math.PI, scale: 1.08, top: 0.14, quiff: 0.2 }, hm);
  const at = (x, y, z) => V(x * rx, y * ry, z * rz);
  const locks = [
    // 头顶往右前方梳过去的几大绺，末端在右额角翘起
    [[at(-0.45, 0.95, -0.35), at(-0.1, 1.2, 0.25), at(0.35, 1.16, 0.62), at(0.8, 0.92, 0.6), at(1.02, 0.78, 0.4)], 0.38, 0.13],
    [[at(-0.65, 0.85, 0.1), at(-0.3, 1.1, 0.62), at(0.15, 1.02, 0.86), at(0.55, 0.84, 0.86), at(0.78, 0.66, 0.78)], 0.3, 0.1],
    [[at(-0.1, 1.08, -0.55), at(0.3, 1.26, -0.05), at(0.66, 1.3, 0.24), at(0.92, 1.24, 0.3)], 0.28, 0.1],
    [[at(0.25, 1.08, -0.6), at(0.65, 1.14, -0.25), at(0.98, 1.06, 0.0), at(1.16, 0.94, 0.08)], 0.24, 0.09],
    // 两侧的短鬓角：只到耳朵上缘，露出耳朵（13:28 里右耳清清楚楚）
    [[at(-0.8, 0.5, 0.2), at(-1.03, 0.3, 0.05), at(-1.06, 0.1, -0.12)], 0.18, 0.08],
    [[at(0.8, 0.5, 0.2), at(1.03, 0.3, 0.05), at(1.06, 0.1, -0.12)], 0.18, 0.08],
  ];
  for (const [pts, w, t] of locks) rig.ps.add(J.head, lockGeo(pts, rx * w, rx * t, { tip: 0.22 }), hm, 'hair');
}

function buildGerardYoung() {
  const rig = gerardBody('gerard_young', { hat: false, beard: false });
  rig.showTag('hair', false);   // 拿掉 gerardBody 自带的那顶（盖到耳朵）发帽，换成露耳朵的发型
  youngGerardHair(rig);
  rig.face.tex = faceSet(paintGerardYoung);     // 换脸：光脸、阴沉、平嘴
  rig.face.cur = ''; rig.refreshFace();
  rig.ps.build(rig);          // gerardBody 已经 finish 过：新加的刚体部件再合并一次
  const yaw = 0.26;
  const stand = P(gerardPockets(rig), {
    body: [0, yaw, 0], torso: [-0.03, 0.02, 0.01], neck: [0.02, -0.04, 0], head: [0.05, -0.14, 0.03],
    legL: [-0.07, 0, 0.06], kneeL: [0.1, 0, 0], footL: [-0.03, 0.15, 0], legR: [0.01, 0, -0.04], footR: [0, -0.1, 0],
  });
  rig.POSES = { stand };
  rig.setPose(stand);
  rig.hideHand('L', true); rig.hideHand('R', true);
  lifeIdle(rig, { breath: 0.016, sway: 0.009, look: 0.05, lookEvery: 6 });
  rig.play('idle'); rig.apply();
  return ghostFade(rig);
}

// ===========================================================================
// 2. MARGARET 抱婴儿：坐在三脚凳上，没戴头巾（白发中分往后梳、脑后挽髻），灰褐长裙 + 米白围裙（胸前有围兜、肩上两条带子），腰间一条灰蓝系带，
//    婴儿坐在她左腿上（画面右侧），右手扶着婴儿胸口、左手托着婴儿的脚（13:28）。
// ===========================================================================

function margaretHair(rig) {
  const M = rig.mats, J = rig.joints, [rx, ry, rz] = rig.dims.headR;
  const hm = M.toon('#ffffff', { side: THREE.DoubleSide, map: hairStrands('#e4e2de', '#8d8b89', 27) });
  hairCap(rig, { front: 0.26 * Math.PI, side: 0.44 * Math.PI, back: 0.66 * Math.PI, scale: 1.08, top: 0.08, quiff: 0.05 }, hm);
  // 中分，白发从分线往后梳：几绺细长的发束贴着头骨绕过耳朵上方，收在脑后（不再是两个鼓鼓的发卷，原来像包头巾）
  const dir = (x, y, z, r = 1.1) => V(x * rx, y * ry, z * rz).normalize().multiply(V(rx, ry, rz)).multiplyScalar(r);
  for (const s of [-1, 1]) {
    for (const [k, w] of [[0, 0.2], [1, 0.19], [2, 0.18]]) {
      const pts = [dir(s * 0.1, 0.95 - k * 0.12, 0.45 + k * 0.1), dir(s * (0.6 + k * 0.1), 0.78 - k * 0.2, 0.5), dir(s * (1.0 + k * 0.02), 0.3 - k * 0.18, 0.12), dir(s * (0.85 - k * 0.04), -0.05 - k * 0.1, -0.6)];
      rig.ps.add(J.head, lockGeo(pts, rx * w, rx * 0.06, { tip: 0.45 }), hm, 'hair');
    }
  }
  // 脑后的小发髻
  rig.ps.add(J.head, place(sphere(rx * 0.42, ry * 0.3, rz * 0.3, 18, 12), [0, ry * 0.45, -rz * 1.02]), hm, 'hair');
}

/** 围裙的胸前部分：灰米色围兜从脖子根一直盖到腰带，肩上两条背带（13:28 里奶奶胸前是一大块灰米色，不是披肩中间露出棕色）。 */
function margaretBib(rig) {
  const Y = rig.Y;
  const apron = (rig.tags.apron || [])[0]?.material;
  if (!apron) return;
  const ks = [
    [Y.belt + 0.005, 0.146, 0.12, 0.006, 0.7], [Y.waist + 0.04, 0.15, 0.12, 0.01, 0.62], [Y.chest, 0.158, 0.118, 0.008, 0.52],
    [Y.armpit, 0.16, 0.112, -0.004, 0.46], [Y.shoulder - 0.005, 0.156, 0.1, -0.012, 0.42], [Y.shoulder + 0.03, 0.118, 0.084, -0.016, 0.5],
  ];
  torsoSkin(rig, ks.map(([y, w, d, cz, arc]) => ({ y, w: w * 1.06 + 0.005, d: d * 1.07 + 0.006, cz, arc })), apron, { tag: 'bib', armBlend: 0.4 });
  retag(rig, 'scarf', apron);   // 披肩（肩上的两条带子）也换成围裙色
}

/** 腰间系带：一圈灰蓝色布带压在围裙腰头上，结打在右胯（画面左），两条带尾垂下来。挂在 body 关节上（坐下时跟着髋走）。 */
function waistTie(rig) {
  const M = rig.mats, J = rig.joints, Y = rig.Y;
  const mat = M.toon('#ffffff', { map: fabric('#4f565b', { folds: 2, ink: 0.3, blocks: 2 }), side: THREE.DoubleSide });
  const y = Y.belt + 0.016 - rig.dims.hipY, w = 0.166, d = 0.141, cz = 0.008;
  rig.ps.add(J.body, lathe([[w, y - 0.015], [w, y + 0.015]], 40).scale(1, 1, d / w).translate(0, 0, cz), mat, 'sash');
  const a = -0.95, kx = Math.sin(a) * w * 1.02, kz = Math.cos(a) * d * 1.02 + cz;
  rig.ps.add(J.body, place(sphere(0.02, 0.017, 0.012, 14, 10), [kx, y, kz], [0, a, 0]), mat, 'sash');
  for (const [dx, len, tw] of [[-0.008, 0.13, 0.25], [0.012, 0.105, -0.2]]) {
    rig.ps.add(J.body, orient(leafGeo(len, 0.024, { at: 0.2, depth: 0.004, baseW: 0.75, tipW: 0.5 }), V(kx + dx, y - 0.008, kz + 0.006), [tw * 0.6, -1, 0.12], [Math.sin(a), 0, Math.cos(a)]), mat, 'sash');
  }
}

function buildMargaretBaby() {
  const rig = margaretBody('margaret_baby', { stool: true, seat: 0.4 });
  const M = rig.mats, J = rig.joints;
  // 拿掉头巾（头上的那块；披肩是同一种布、挂在躯干上，保留）
  rig.tags.scarf = (rig.tags.scarf || []).filter((m) => { if (m.parent === J.head) { m.removeFromParent(); return false; } return true; });
  margaretHair(rig);
  margaretBib(rig);
  waistTie(rig);
  rig.ps.build(rig);
  rig.bindSkins();             // 围兜是新加的蒙皮网格：重新绑定一次
  const seat = rig.stoolSeat || 0.4;
  const sit = P(seatedPose(rig, seat, { spread: 0.13, thigh: 1.45, back: -0.02 }), STOOP(0.55), { head: [-0.12, 0.05, 0.03] });
  // 婴儿坐在她左大腿上，身子朝右前方，脸转回来看镜头
  const baby = makeBaby(M, { name: 'margaret_baby_infant', sit: true, scale: 1.3, hair: '#c27a35', pants: '#8a4f2c', face: 'calm' });
  baby.position.set(0.095, 0.655, 0.15); baby.rotation.y = 0.55;
  baby.userData.head.rotation.set(0.05, -0.4, 0);
  rig.root.add(baby);
  rig.baby = baby;
  const pose = rig.solve(sit, {
    R: { pos: [0.07, 0.67, 0.27], pole: [-1, -0.6, -0.2], aim: { fingers: [1, 0.15, -0.25], palm: [0.25, 0, -1] } },
    L: { pos: [0.235, 0.56, 0.33], pole: [1, -0.4, -0.5], aim: { fingers: [-0.2, 0, 1], palm: [-0.3, 1, 0] } },
  });
  rig.POSES = { sit: pose };
  rig.setPose(pose);
  rig.setHand('R', 'flat'); rig.setHand('L', 'relax');
  lifeIdle(rig, { breath: 0.01, sway: 0.006, look: 0.04, seated: true, lookEvery: 7, arms: 0 });
  const bh = baby.userData.head;
  rig._upd.push((dt, t) => { bh.rotation.z = Math.sin(t * 1.1) * 0.06; bh.rotation.x = 0.05 + Math.sin(t * 0.7 + 1) * 0.04; });
  rig.play('idle'); rig.apply();
  return ghostFade(rig);
}

// ===========================================================================
// 3. IDA（小时候）：红色长直发 + 齐眉刘海，米白连衣裙（泡泡短袖、小圆领、腰带一道横线、长裙过小腿），深色长袜和鞋，
//    双手垂在身侧（13:28）。身体用 Elizabeth 的小女孩比例；她比少年 Jakob 矮一截（参考里约为 Jakob 的 0.86），身高取 1.13 m。
// ===========================================================================

const IDA_CHILD_H = 1.13;

/**
 * 小时候的脸（13:28 高清帧）：圆圆的淡紫灰脸、又大又圆的眼睛（眼白很大、只有一个很小的黑瞳孔）、细眉、很小的鼻子、
 * 一条短短的平嘴，嘴下一道小竖线。长大后的 paintIda 是下撇的苦脸，这里不用它。
 */
function paintIdaChild(g, v) {
  const closed = v === 'blink' || v === 'closed';
  for (const s of [-1, 1]) {
    bags(g, s * 0.36, 0.0, 0.17, 0.08, s, { depth: 0.9, lines: 0, color: 'rgba(100,90,110,0.18)' });
    eye(g, s * 0.36, 0.03, 0.23, 0.125, s, { skin: SKIN_IDA, white: '#ecece8', lid: closed ? 1 : 0.12, closed, droop: 0.02, pupil: 0, lw: 5, crease: false });
    if (!closed) { g.fillStyle = '#2a2322'; g.beginPath(); g.arc(FX(s * 0.36), FY(0.015), 0.04 * 256, 0, TAU); g.fill(); }
    line(g, [[s * 0.15, 0.25], [s * 0.38, 0.29], [s * 0.62, 0.24]], 3.5, '#6a3a25');
  }
  line(g, [[0.0, 0.08], [-0.04, -0.2], [0.07, -0.27]], 3.2);
  if (v === 'talk') blob(g, [[-0.13, -0.52], [0, -0.48], [0.13, -0.52], [0.02, -0.62]], '#392927');
  else line(g, [[-0.14, -0.55], [0, -0.545], [0.14, -0.56]], 4.5);
  line(g, [[0.0, -0.64], [0.0, -0.74]], 2.5, '#3a3030');
}

function idaChildHair(rig) {
  const M = rig.mats, J = rig.joints, def = rig.headDef, [rx, ry, rz] = rig.dims.headR;
  const hm = M.toon('#ffffff', { side: THREE.DoubleSide, map: hairStrands('#b4461f', '#64240a', 39) });
  hairCap(rig, { front: 0.3 * Math.PI, side: 0.56 * Math.PI, back: 0.72 * Math.PI, top: 0.06, scale: 1.06 }, hm);
  // 中分：额前只有几缕尖尖的碎发搭在额头上，两边的发帘沿着脸侧扫下去（原作里没有齐眉刘海）
  for (const s of [-1, 1]) {
    for (let j = 0; j < 3; j++) {
      const pts = [[s * 0.03, 0.97], [s * (0.1 + j * 0.12), 0.82 - j * 0.02], [s * (0.2 + j * 0.17), 0.64 - j * 0.07]].map(([x, y], k) => headSurface(def, x, y).multiplyScalar(1.05 + k * 0.004));
      rig.ps.add(J.head, lockGeo(pts, rx * 0.1, rx * 0.035, { tip: 0.25 }), hm, 'fringe');
    }
    for (const [dx, dy, wd] of [[0, 0, 0.2], [0.08, -0.06, 0.18]]) {
      const pts = [[s * (0.05 + dx), 0.98 + dy], [s * (0.5 + dx), 0.86 + dy], [s * (0.9 + dx * 0.3), 0.58 + dy], [s * 1.02, 0.1 + dy]].map(([x, y], k) => headSurface(def, x, y).multiplyScalar(1.05 + k * 0.01));
      rig.ps.add(J.head, lockGeo(pts, rx * wd, rx * 0.06, { tip: 0.5 }), hm, 'fringe');
    }
  }
  // 长直发：耳前两绺垂到锁骨前，其余披在背后，长过肩膀（排法同 buildIda，按小女孩缩短）
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const a = 1.1 + i * 0.32, x = s * Math.sin(a) * rx * 1.06, z = Math.cos(a) * rz * 1.04;
      const front = i < 2, end = -ry * (front ? 1.7 - (i % 2) * 0.1 : 1.3 + (i % 3) * 0.15);
      const zf = front ? rz * 0.3 : z;
      rig.ps.add(J.head, lockGeo([V(x * 0.92, ry * 0.5, z * 0.92), V(x * 1.06, -ry * 0.1, z * 1.02), V(x * (front ? 1.22 : 1.14), -ry * 0.8, front ? zf : z * 1.05), V(x * (front ? 1.32 : 1.2), end, front ? zf + 0.02 : z * 1.1)], rx * 0.24, rx * 0.06, { tip: 0.3 }), hm, 'long_hair');
    }
  }
}

/** 小尖角翻领（Peter Pan）：两片贴在胸口的小尖叶，比 cast.js 的 roundCollar 大圆领小得多（13:28：领尖不过肩线）。 */
function idaCollar(rig, mat) {
  const Y = rig.Y, front = rig.shirtFront, top = Y.neck + 0.004, w = 0.058, h = 0.05;
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(s * 0.008, 0);
    shape.lineTo(s * w, -0.008);
    shape.quadraticCurveTo(s * (w + 0.004), -h * 0.62, s * w * 0.78, -h);
    shape.lineTo(s * 0.012, -h * 0.42);
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape, 12), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), yy = p.getY(i);
      p.setXYZ(i, x, top + yy, front(top + yy) + 0.012 - Math.pow(Math.abs(x) / (w * 1.05), 2) * 0.02);
    }
    g.computeVertexNormals();
    torsoSkin(rig, null, mat, { tag: 'collar', geo: g });
  }
}

function buildIdaChild() {
  const rig = womanBody('ida_child', {
    height: IDA_CHILD_H, seed: 73, dress: '#e3ddce', puff: true, puffBand: '#d3ccbb', skirtW: 0.27, hem: 0.15, pleats: 12, shoes: '#4a3626', legs: '#dad4cc',
    dims: { head: 0.092, headW: 0.82, headD: 0.88, shoulderW: 0.088, hip: 0.5, knee: 0.27, neck: 0.81 },
    head: { skin: SKIN_IDA, jaw: 0.22, chin: 0.08, crown: 0.1, flat: 0.08, nose: { top: 0.04, y: -0.24, len: 0.016, w: 0.0105, tip: 1.0, wing: 0.5 }, paint: paintIdaChild },
  });
  const M = rig.mats, Y = rig.Y, sc = rig.dims.height / 1.62;
  // 小圆领 + 领口一颗小扣子；腰上一道同色腰带（没有蝴蝶结）
  const collar = M.toon('#f0ebe1', { side: THREE.DoubleSide, outline: 0.0035 });
  idaCollar(rig, collar);
  torsoSkin(rig, null, M.toon('#efe9de', { outline: 0.002 }), { tag: 'buttons', geo: place(sphere(0.0065, 0.0065, 0.004, 10, 6), [0, Y.neck - 0.03, rig.shirtFront(Y.neck - 0.03) + 0.014]) });
  const yy = Y.belt + 0.03, fz = rig.shirtFront(yy);
  torsoSkin(rig, [{ y: yy - 0.016, w: 0.118 * sc, d: fz - 0.002, cz: 0.004 }, { y: yy + 0.02, w: 0.117 * sc, d: fz - 0.002, cz: 0.004 }], M.toon('#ffffff', { map: fabric('#ddd6c6', { folds: 2, ink: 0.25 }), side: THREE.DoubleSide }), { tag: 'sash', steps: 1, armBlend: 0 });
  // 袖子：原作里是很短的直筒短袖（到上臂中段，袖口一圈浅线），不是泡泡袖——藏掉 womanBody 的泡泡袖，换一对贴身的短袖
  rig.showTag('sleeve', false);
  const D = rig.dims, dressM = (rig.tags.skirt || [])[0]?.material;
  for (const side of ['L', 'R']) {
    limbSkin(rig, side, 'arm', [
      { s: -0.04, w: 0.024, d: 0.027, ox: -0.018 }, { s: -0.012, w: 0.039, d: 0.039, ox: -0.006 }, { s: 0.04, w: 0.041, d: 0.04 },
      { s: D.upper * 0.5, w: 0.04, d: 0.039 }, { s: D.upper * 0.62, w: 0.037, d: 0.036 },
    ], dressM, { tag: 'short_sleeve', cap: 'top' });
    limbSkin(rig, side, 'arm', [{ s: D.upper * 0.56, w: 0.0385, d: 0.0375 }, { s: D.upper * 0.63, w: 0.0385, d: 0.0375 }], M.toon('#c8c0ae', { side: THREE.DoubleSide, outline: 0.002 }), { tag: 'short_sleeve', steps: 1 });
  }
  idaChildHair(rig);
  hands(rig, 0.95, ['relax']);
  finish(rig);
  // 双手自然垂在身侧（手稍微靠前，手指半弯），原作里不是交握在身前
  const hang = P(armsDown(rig, { spread: 0.07, bend: 0.14 }), { head: [0.05, 0.04, 0.03], neck: [0.03, 0, 0], torso: [0.01, 0, 0] });
  rig.POSES = { hang };
  rig.setPose(hang);
  lifeIdle(rig, { breath: 0.01, sway: 0.006, look: 0.04, lookEvery: 7, arms: 0.4 });
  rig.headTop.position.y = rig.dims.headR[1] + 0.2;
  rig.play('idle'); rig.apply();
  return ghostFade(rig);
}

// ===========================================================================
// 4. CAROLINE 举玫瑰：右手（画面左）把一朵红玫瑰举到下巴上方（肘朝前下垂、前臂竖直），左手垂在身侧；不抱婴儿。
//    服装按 13:28 重做：灰褐方领连衣裙 + 米色领口滚边 + 腰带、浅灰蓝袖子白袖口、灰蓝 / 米色条纹护耳软帽、额前一圈深棕刘海。
//    dropPetals：花瓣一下子散开、一片片往上飘走（13:32.8–13:36），只剩光秃的花茎。setState({ petals })。
// ===========================================================================

/** 没有道具工厂时的简易玫瑰（茎 + 红色花头），结构同 p3_rose：userData.head 是花头。 */
function fallbackRose(M) {
  const root = new THREE.Group(); root.name = 'p3_rose';
  root.add(merged([new THREE.CylinderGeometry(0.003, 0.0035, 0.22, 6).translate(0, 0.11, 0)], M.toon('#4f7a30'), 'rose_stem'));
  const head = new THREE.Group(); head.name = 'rose_head'; head.position.set(0, 0.224, 0); root.add(head);
  head.add(merged([place(sphere(0.03, 0.026, 0.03, 14, 10), [0, 0.022, 0])], M.toon('#d0231d'), 'rose_petal'));
  root.userData.head = head;
  return root;
}

/** 花瓣粒子：12 片带描边的红色小瓢（两种红），放在 root 空间里飞。 */
function makePetals(M, n = 12) {
  const group = new THREE.Group(); group.name = 'caroline_rose_petals'; group.visible = false;
  const geo = new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI * 0.4).scale(0.019, 0.007, 0.024);
  geo.translate(0, -0.006, 0);
  const mats = [M.toon('#d0231d', { side: THREE.DoubleSide, outline: 0.003 }), M.toon('#a3161a', { side: THREE.DoubleSide, outline: 0.003 })];
  const r = rng(53);
  const list = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mats[i % 3 === 0 ? 1 : 0]);
    m.name = 'caroline_rose_petal'; m.castShadow = false; group.add(m);
    const a = (i / n) * TAU + r() * 0.5;
    list.push({
      m, a, delay: r() * 0.14,
      off: V(Math.cos(a) * 0.024, 0.006 + (r() - 0.4) * 0.03, Math.sin(a) * 0.02),
      // 3 秒里升高约 0.9–1.4 m，左右散开约 ±0.35 m，整体略往画面右边漂
      d: V(Math.cos(a) * (0.1 + r() * 0.26) + 0.08, 0.9 + r() * 0.5, Math.sin(a) * (0.06 + r() * 0.16) + 0.04),
      q0: new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * TAU, r() * TAU, r() * TAU)),
      axis: V(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), spin: (r() < 0.5 ? -1 : 1) * (2 + r() * 3), ph: r() * TAU,
    });
  }
  const _q = new THREE.Quaternion();
  /** k: 0..1 的飞行进度；origin: 花头在 root 空间的位置。 */
  group.userData.layout = (k, origin) => {
    for (const p of list) {
      const t = clamp((k - p.delay) / (1 - p.delay), 0, 1);
      const e = 0.35 * (1 - Math.pow(1 - t, 3)) + 0.65 * t * t * (1.2 - 0.2 * t);
      p.m.position.copy(origin).addScaledVector(p.off, 1 + t * 3).addScaledVector(p.d, e);
      p.m.position.x += Math.sin(t * 6 + p.ph) * 0.05 * t;
      p.m.position.z += Math.cos(t * 5 + p.ph) * 0.035 * t;
      p.m.quaternion.copy(p.q0).multiply(_q.setFromAxisAngle(p.axis, p.spin * t));
      const sc = t <= 0 ? 1 : 1 - smooth(clamp((t - 0.78) / 0.22, 0, 1));
      p.m.scale.setScalar(Math.max(0.001, sc));
      p.m.visible = sc > 0.01;
    }
  };
  return group;
}

/** 同一个标签（torsoSkin / limbSkin / PartSet 的 tag）下的所有网格换材质。 */
function retag(rig, tag, mat) { for (const m of rig.tags[tag] || []) m.material = mat; }

/**
 * 回忆里的 Caroline 服装（参考 13:28 高清帧）：不是第一灾的锈红背带裙，而是灰褐色的方领连衣裙——胸口方领里露出皮肤、
 * 米色滚边，袖子是浅灰蓝色（袖口一圈白布），裙子灰褐、褶线偏深；头上是灰蓝 / 米色条纹的护耳软帽，额前露出一圈深棕色刘海。
 */
function restyleCaroline(rig) {
  const M = rig.mats, J = rig.joints, Y = rig.Y, sc = rig.dims.height / 1.62, D = rig.dims;
  const w = (x) => x * sc;
  const brown = cloth(rig, '#7d675c', { seed: 99, folds: 5, ink: 0.3 });
  const blue = cloth(rig, '#a9bcc5', { seed: 103, folds: 6, ink: 0.25 });
  retag(rig, 'skirt', cloth(rig, '#786459', { seed: 98, folds: 14, ink: 0.42, len: 0.75 }));
  retag(rig, 'bodice', brown);
  retag(rig, 'sleeve', blue);
  retag(rig, 'blouse', rig.skinMat);           // 衬衣躯干只会从方领里露出来：用皮肤色
  // 方领连衣裙的上身：从胸口一直包到脖子根，前面只留一个方形领口（两侧竖直、底边水平）
  const hw = 0.066, y0 = Y.shoulder - 0.014;
  const gapAt = (ww) => Math.asin(clamp(hw / ww, 0, 0.97));
  const at = (y) => {
    // 取 womanBody 躯干关键截面之间的插值（和 blouse 同一套尺寸，外扩一点包住它）
    const ks = [
      [Y.chest, w(0.132), w(0.104), 0.018], [Y.armpit, w(0.136), w(0.094), 0.008], [Y.shoulder - 0.004, w(0.135), w(0.078), 0],
      [Y.shoulder + 0.026, w(0.1), w(0.068), -0.004], [Y.neck + 0.002, D.headR[0] * 0.55, D.headR[0] * 0.5, -0.006],
    ];
    let i = 0; while (i < ks.length - 2 && ks[i + 1][0] < y) i++;
    const a = ks[i], b = ks[i + 1], k = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
    return { y, w: lerp(a[1], b[1], k) * 1.05 + 0.003, d: lerp(a[2], b[2], k) * 1.07 + 0.004, cz: lerp(a[3], b[3], k) };
  };
  const ys = [Y.chest + 0.03, Y.armpit, y0 - 0.002, y0, Y.shoulder - 0.004, Y.shoulder + 0.026, Y.neck + 0.002];
  const keys = ys.map((y) => { const k = at(y); return { ...k, gap: y < y0 ? 0 : gapAt(k.w) }; });
  torsoSkin(rig, keys, brown, { tag: 'yoke', armBlend: 0.5 });
  // 领口的一圈米色滚边（沿领口的方形走：左边竖直 → 底边 → 右边竖直）
  const trim = [];
  const front = (y, x) => { const k = at(y); return k.cz + k.d * Math.sqrt(Math.max(0.0001, 1 - (x / k.w) ** 2)); };
  const top = y0 + 0.045;
  for (const [x, y] of [[-hw, top], [-hw, y0 + 0.02], [-hw, y0], [-hw * 0.5, y0], [0, y0], [hw * 0.5, y0], [hw, y0], [hw, y0 + 0.02], [hw, top]]) trim.push(V(x, y, front(y, x) + 0.002));
  torsoSkin(rig, null, M.toon('#bda98f', { side: THREE.DoubleSide, outline: 0.002 }), {
    tag: 'trim', armBlend: 0, geo: ribbonGeo(trim, 0.014, { seg: 40, lift: 0.002, nrm: (p, o) => o.set(p.x * 1.5, 0, 1).normalize() }),
  });
  // 腰上一条深色腰带（原作里上身和裙子之间有一道黑色横带）
  torsoSkin(rig, [
    { y: Y.belt + 0.012, w: w(0.113) * 1.09 + 0.006, d: w(0.09) * 1.09 + 0.006, cz: 0.006 }, { y: Y.belt + 0.042, w: w(0.115) * 1.09 + 0.006, d: w(0.092) * 1.09 + 0.006, cz: 0.008 },
  ], M.toon('#3b302c', { side: THREE.DoubleSide, outline: 0.002 }), { tag: 'trim', steps: 1, armBlend: 0 });
  // 袖口一圈白布
  const cuff = M.toon('#ecebe5', { side: THREE.DoubleSide, outline: 0.0025 });
  for (const side of ['L', 'R']) limbSkin(rig, side, 'arm', [
    { s: D.upper + D.fore - 0.036, w: w(0.037), d: w(0.035) }, { s: D.upper + D.fore + 0.004, w: w(0.04), d: w(0.038) },
  ], cuff, { tag: 'cuff', steps: 1 });
  // 软帽：灰蓝 / 米色条纹（原来的偏绿偏橙），滚边换成灰褐；两侧再加护耳的圆片
  const capTex = canvasTexture(256, 256, (g, ww, hh) => {
    const colors = ['#9fb0ba', '#c9bba5', '#d2d3d1', '#8599a6', '#b8a389', '#cfd1d0'];
    const n = 14;
    for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.fillRect(0, (i / n) * hh, ww, hh / n + 1); g.fillStyle = 'rgba(60,48,40,0.5)'; g.fillRect(0, (i / n) * hh, ww, 2); }
  });
  for (const m of rig.tags.hat || []) m.material = m.material.map ? M.toon('#ffffff', { map: capTex }) : M.toon('#7d7468');
  const [rx, ry, rz] = D.headR, flap = M.toon('#b3ab9c', { outline: 0.003 });
  for (const s of [-1, 1]) {
    const p = V(s * 0.95, -0.02, -0.06); rig.headDef(p);
    rig.ps.add(J.head, place(sphere(rx * 0.16, ry * 0.3, rz * 0.24, 14, 10), [p.x + s * rx * 0.1, p.y - ry * 0.02, p.z], [0, s * 0.25, 0]), flap, 'hat');
  }
  // 额前露出的深棕色头发：中分，贴着帽沿往两侧耳朵上方扫过去
  const hm = M.toon('#ffffff', { side: THREE.DoubleSide, map: hairStrands('#5a4234', '#2e2018', 41) });
  for (const s of [-1, 1]) {
    for (const [dy, wd] of [[0, 0.2], [-0.07, 0.17]]) {
      const pts = [[s * 0.03, 0.57 + dy], [s * 0.38, 0.52 + dy], [s * 0.72, 0.4 + dy], [s * 0.94, 0.2 + dy], [s * 1.0, -0.12 + dy]]
        .map(([x, y], k) => headSurface(rig.headDef, x, y).multiplyScalar(1.03 + k * 0.004));
      rig.ps.add(J.head, lockGeo(pts, rx * wd, rx * 0.05, { tip: 0.5 }), hm, 'hair');
    }
  }
  rig.ps.build(rig);
  rig.bindSkins();
}

function buildCarolineRose() {
  const rig = buildCaroline();
  rig.id = 'caroline_rose'; rig.root.name = 'caroline_rose';
  const M = rig.mats, J = rig.joints, Y = rig.Y;
  restyleCaroline(rig);
  // 不抱婴儿：拿掉 buildCaroline 的襁褓婴儿，以及摇婴儿的那个每帧钩子（buildCaroline 只登记了这一个 _upd）
  const oldBaby = rig.root.getObjectByName('caroline_baby');
  if (oldBaby) { oldBaby.removeFromParent(); if (rig._upd.length === 1) rig._upd.length = 0; }
  // 玫瑰：拳头握在茎的下部，茎始终竖直（holdUpright 每帧校正），花头略往外歪
  const mount = new THREE.Group(); mount.name = 'caroline_rose_mount';
  J.handR.add(mount); mount.position.set(0.016, -0.085, 0.0);
  const rose = prop('p3_rose') || fallbackRose(M);
  rose.position.set(0, -0.07, 0);
  mount.add(rose);
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, 0.1));
  holdUpright(rig, J.handR, mount, () => tilt);
  const head = rose.userData.head || null;
  const petals = makePetals(M); rig.root.add(petals);
  rig.rose = rose;
  // 姿势（13:28）：右肘朝前下方垂着、前臂近乎竖直，拳头举到下巴上方、离脸约一个头宽（正面看上臂被透视压短）；左手自然垂在身侧
  const base = { head: [0.03, 0.03, -0.05], neck: [0.02, 0, 0], torso: [-0.01, -0.03, 0.02] };
  const raise = rig.solve(base, {
    R: { pos: [-0.24, Y.chin + 0.04, 0.12], pole: [-0.35, -1, 0.45], aim: { fingers: [0.15, 1, 0.1], palm: [0.5, 0, -0.8] } },
    L: { pos: [0.2, Y.hip - 0.03, 0.03], pole: [1, 0, -0.9], hand: [0.1, 0, 0.12] },
  });
  rig.POSES = { raise };
  rig.setPose(raise);
  rig.setHand('R', 'grip'); rig.setHand('L', 'relax');
  lifeIdle(rig, { breath: 0.01, sway: 0.006, look: 0.03, lookEvery: 7, arms: 0 });
  // ---- 花瓣 ----
  let hasPetals = true, run = 0;
  const _o = V();
  const show = (on) => { hasPetals = on; if (head) head.visible = on; petals.visible = false; };
  rig.dropPetals = async ({ instant = false } = {}) => {
    const my = ++run;
    if (!hasPetals || instant || !head) { show(false); return; }
    rig.jointToRoot(head, _o.set(0, 0.024, 0), _o);
    const origin = _o.clone();
    show(false);
    petals.visible = true;
    await animate(3200, (k) => { if (my === run) petals.userData.layout(k, origin); }, Ease.linear);
    if (my === run) petals.visible = false;
  };
  rig.setState = (s = {}) => { run++; if (s.petals !== undefined) show(!!s.petals); return Promise.resolve(); };
  rig.getState = () => ({ petals: hasPetals });
  rig.play('idle'); rig.apply();
  return ghostFade(rig);
}

// ===========================================================================
// 5. NICHOLAS 站着：灰发后梳、细八字胡、白底灰竖条纹长围巾（两条尾巴垂到腰带），回忆里穿灰褐色长外套、锈色马甲、灰裤子、棕色长靴（13:28）。
//    站在 Caroline 右后方；参考里他的左前臂横在腰前、手压在肚子正中的围巾尾巴下面（默认 POSES.waist），
//    另备 POSES.shoulder（左手搭在 Caroline 左肩上）和 restHandOn(at)。
// ===========================================================================

/** 推荐队形里 Caroline 相对 Nicholas 的位置（Nicholas 的 root 空间）：在他左前方 0.42 m、前方 0.22 m。 */
const CAROLINE_FROM_NICK = [-0.42, 0, 0.22];

function nickBoots(rig, mat, { top = 0.55, r = [0.058, 0.05] } = {}) {
  const D = rig.dims, T = D.thigh, S = D.shin, from = T + S * (1 - top);
  for (const side of ['L', 'R']) limbSkin(rig, side, 'leg', [
    { s: from, w: r[0] * 1.1, d: r[0] * 1.07 }, { s: from + 0.02, w: r[0], d: r[0] * 0.98 },
    { s: lerp(from, T + S, 0.6), w: lerp(r[0], r[1], 0.6), d: lerp(r[0], r[1], 0.6), oz: 0.003 },
    { s: T + S + 0.01, w: r[1], d: r[1] * 1.05, oz: 0.006 },
  ], mat, { tag: 'boots', pleat: (th, k) => 0.03 * Math.sin(th * 2 + k * 9) * (1 - k) });
}

/**
 * 长围巾（13:28）：脖子上松松绕一圈白底灰竖条的围巾，两条长尾巴垂在马甲前面，一直垂到腰带；
 * 取代 nicholasBody 里那一小簇领巾褶（tag 'jabot'）和白色高领（tag 'collar'）。
 */
function nickScarf(rig) {
  const M = rig.mats, Y = rig.Y;
  rig.showTag('jabot', false); rig.showTag('collar', false);
  const stripeAt = (sw, gap) => M.toon('#ffffff', { map: fabric('#f1f0ec', { seed: 5, folds: 2, ink: 0.2, blocks: 0, stripes: ['rgba(88,88,90,0.8)', sw, gap] }), side: THREE.DoubleSide, outline: 0.003 });
  // 脖子上的一圈（比领口粗一点，前面微微鼓起）
  torsoSkin(rig, [
    { y: Y.neck - 0.05, w: 0.07, d: 0.064, cz: 0.002 }, { y: Y.neck - 0.005, w: 0.077, d: 0.07, cz: 0.006 }, { y: Y.neck + 0.045, w: 0.07, d: 0.065, cz: 0.002 },
    { y: Y.neck + 0.08, w: 0.056, d: 0.054, cz: -0.006 },
  ], stripeAt(26, 52), { tag: 'scarf', radial: 32, steps: 2, armBlend: 0 });
  // 马甲 / 衬衫胸前的表面 z（和 nicholasBody 的 chest 截面一致），尾巴贴在它前面
  const K = [[Y.hip - 0.03, 0.098], [Y.belt, 0.1], [Y.waist + 0.05, 0.108], [Y.chest, 0.118], [Y.armpit, 0.106], [Y.shoulder - 0.005, 0.086], [Y.shoulder + 0.03, 0.07]];
  const front = (y) => { let i = 0; while (i < K.length - 2 && K[i + 1][0] < y) i++; const a = K[i], b = K[i + 1]; return lerp(a[1], b[1], clamp((y - a[0]) / (b[0] - a[0]), 0, 1)); };
  const tail = (x0, x1, top, bottom, width, sw) => {
    const pts = [];
    for (let i = 0; i <= 5; i++) { const k = i / 5, y = lerp(top, bottom, k); pts.push(V(lerp(x0, x1, k), y, front(y) + 0.014)); }
    torsoSkin(rig, null, stripeAt(sw, 70), {
      tag: 'scarf', armBlend: 0, geo: ribbonGeo(pts, width, { seg: 24, lift: 0.002, nrm: (p, o) => o.set(0, 0, 1), widthFn: (k) => 1 + k * 0.12 }),
    });
  };
  tail(-0.034, -0.05, Y.neck - 0.02, Y.belt + 0.06, 0.07, 34);
  tail(0.02, 0.03, Y.neck - 0.03, Y.waist + 0.0, 0.066, 34);
}

/** 灰发（13:28）：从额头往后梳、顶上蓬起一点，两侧压住耳朵上缘；比 nicholasBody 的发型额前低一些（原来的前缘在额头上留一条黑边）。 */
function nickHair(rig) {
  const M = rig.mats, J = rig.joints, [rx, ry, rz] = rig.dims.headR;
  rig.showTag('hair', false);
  const hm = M.toon('#ffffff', { side: THREE.DoubleSide, map: hairStrands('#8d8c8a', '#3c3c3c', 7) });
  hairCap(rig, { front: 0.29 * Math.PI, side: 0.5 * Math.PI, back: 0.76 * Math.PI, scale: 1.07, top: 0.1, quiff: 0.14 }, hm);
  const at = (x, y, z) => V(x * rx, y * ry, z * rz);
  const locks = [
    // 头顶往后梳的两绺波浪（左绺在头顶偏画面左，一直披到耳后）
    [[at(0.1, 0.86, 0.66), at(0.3, 1.02, 0.2), at(0.55, 1.0, -0.4), at(0.64, 0.66, -0.9)], 0.28, 0.09],
    [[at(-0.3, 0.82, 0.6), at(-0.5, 0.9, 0.05), at(-0.74, 0.78, -0.55), at(-0.74, 0.4, -0.92)], 0.26, 0.09],
    // 鬓发：压住耳朵上缘，垂到耳朵中部
    [[at(-0.78, 0.7, 0.35), at(-1.06, 0.3, 0.2), at(-1.1, -0.1, 0.05)], 0.22, 0.08],
    [[at(0.78, 0.7, 0.35), at(1.06, 0.3, 0.2), at(1.1, -0.1, 0.05)], 0.22, 0.08],
  ];
  for (const [pts, w, t] of locks) rig.ps.add(J.head, lockGeo(pts, rx * w, rx * t, { tip: 0.35 }), hm, 'hair');
}

function buildNicholasStand() {
  const { rig } = nicholasBody('nicholas_stand');
  const M = rig.mats, Y = rig.Y;
  // 换衣服颜色：黑燕尾服 → 灰褐长外套（袖子同料），白衬衫胸前 → 锈色马甲，黑裤 → 灰裤，黑鞋 → 棕靴
  // （原作里外套是中灰褐色、只有几条细褶线；原来 ink 0.75 的竖条纹太重）
  swapMaterial(rig, cloth(rig, '#2a2a2e', { seed: 31, folds: 10, ink: 0.75 }), cloth(rig, '#6c655b', { seed: 31, folds: 5, ink: 0.3, len: 0.5 }));
  swapMaterial(rig, cloth(rig, '#efeee9', { seed: 33, folds: 4, ink: 0.25 }), cloth(rig, '#80502f', { seed: 34, folds: 4, ink: 0.3 }));
  swapMaterial(rig, cloth(rig, '#2c2b2d', { seed: 35, folds: 9, ink: 0.6 }), cloth(rig, '#6a645c', { seed: 35, folds: 4, ink: 0.3, len: 0.5 }));
  swapMaterial(rig, M.toon('#151515'), M.toon('#5a4232'));
  nickBoots(rig, cloth(rig, '#7a5e48', { seed: 36, folds: 4, ink: 0.3, len: 0.6 }));
  nickScarf(rig);
  nickHair(rig);
  rig.ps.build(rig);
  rig.bindSkins();            // 新加的靴筒、围巾是蒙皮网格：在绑定姿势下重新绑定一次（还没设过姿势）
  const base = { body: [0, -0.16, 0], torso: [0, -0.02, 0.01], neck: [0.03, 0, 0], head: [0.06, 0.02, 0.05], legL: [0.02, 0, 0.04], legR: [-0.03, 0, -0.04], kneeR: [0.04, 0, 0] };
  const downR = { pos: [-0.18, Y.hip - 0.06, -0.01], pole: [-1, 0.3, -0.6], hand: [0, 0, 0.1] };
  const cx = CAROLINE_FROM_NICK[0], cz = CAROLINE_FROM_NICK[2];
  rig.HAND_AT = {
    waist: [-0.03, Y.belt - 0.005, 0.15],                  // 左前臂横在腰前，手停在肚子正中（参考 13:28 高清帧：手压在围巾尾巴下面）
    shoulder: [cx + 0.12, 1.37, cz - 0.03],              // Caroline 的左肩顶
  };
  const handOn = (at, side = 'L') => rig.solve(base, side === 'L'
    ? { L: { pos: at, pole: [1, -0.3, -0.6], aim: { fingers: [-1, -0.25, 0.1], palm: [0, -0.3, -1] } }, R: downR }
    : { R: { pos: at, pole: [-1, -0.4, -0.5], aim: { fingers: [0.3, -1, 0.2], palm: [0.4, -0.2, -1] } }, L: { pos: [0.21, Y.hip - 0.03, 0.03], pole: [1, 0.3, -0.6] } });
  rig.POSES = { waist: handOn(rig.HAND_AT.waist), shoulder: handOn(rig.HAND_AT.shoulder) };
  rig.setPose(rig.POSES.waist);
  rig.setHand('L', 'flat'); rig.setHand('R', 'relax');
  /** 把一只手搭到 root 空间的 at 处（例如章节里 Caroline 的肩膀换算到 Nicholas 的 root 空间）。 */
  rig.restHandOn = (at, { side = 'L', instant = true } = {}) => {
    rig.setHand(side, 'flat'); rig.setHand(side === 'L' ? 'R' : 'L', 'relax');
    return rig.tweenPose(handOn(at, side), 600, Ease.inOutSine, instant);
  };
  lifeIdle(rig, { breath: 0.01, sway: 0.004, look: 0.03, lookEvery: 7, arms: 0 });
  rig.play('idle'); rig.apply();
  return ghostFade(rig);
}

// ===========================================================================
// 推荐队形（13:20 那一排）：相对队形中心（米），全部面朝 +z；yaw 是额外的 root.rotation.y（姿势里已带身体侧转，通常不用再转）。
// 横向位置按参考帧量出（以 Caroline 的身高换算比例尺），前后错开避免裙子和手臂互相穿插。
// ===========================================================================

export const MEMORY_LINEUP = {
  gerard_young: { pos: [-0.96, 0, -0.28], yaw: 0 },
  margaret_baby: { pos: [-0.58, 0, 0.0], yaw: 0 },
  ida_child: { pos: [-0.12, 0, 0.16], yaw: 0 },
  jakob_child: { pos: [0.18, 0, 0.12], yaw: 0 },
  caroline_rose: { pos: [0.54, 0, 0.0], yaw: 0 },
  nicholas_stand: { pos: [0.96, 0, -0.22], yaw: 0 },
};

export const CAST = {
  caroline_rose: buildCarolineRose,
  margaret_baby: buildMargaretBaby,
  ida_child: buildIdaChild,
  nicholas_stand: buildNicholasStand,
  gerard_young: buildGerardYoung,
};
