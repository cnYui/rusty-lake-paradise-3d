// 网格人物 / 动物（.rlpm）：用户用 AI 生成的 3D 模型，在 Blender 里焊接、减面到 4 万面、重新展 UV 并烘贴图、
// 绑 14 关节骨架（自动权重）后导出的自定义二进制（见 docs/ai/context/20261023-*-glb-cast-replace.md）。
// 模型文件在 ./models/<key>.rlpm + <key>.jpg；加载失败（或没预加载）时 makeCharacter 自动回退到程序化人物。
//
// 骨架约定：关节名、层级和 charkit.js 的 skeleton() 完全一致，休息姿势是双臂下垂、双腿并拢。
// 原模型是 T 字 / A 字姿势，所以每个关节带一份“绑定姿势”（世界位置 + 绕前向轴的转角），
// 逆绑定矩阵直接由它算出：休息姿势下手臂自然垂下，之后 rig.pose / IK / 坐姿都照旧工作。
import * as THREE from 'three';
import { makeHuman, hairStrands } from './human.js';
import { headDeform } from './charkit.js';

const BASE = (() => { try { return new URL('./models/', import.meta.url).href; } catch (e) { return null; } })();
const cache = new Map();      // key → model | null（加载失败）
const pending = new Map();
const warned = new Set();

/** 角色 id → 模型 key（没有模型的角色返回 null，继续用程序化建模）。 */
const KEYS = [['jakob_child', 'jakob_child'], ['david', 'david'], ['gerard', 'gerard'], ['nicholas', 'nicholas'], ['margaret', 'margaret'], ['ida', 'ida']];
// 动物头人物：模型自带动物头和衣服，对应记忆里戴面具的四个人；不再戴程序化面具
const MASKED = { david_rabbit: 'rabbit', gerard_boar: 'boar', margaret_pigeon: 'pigeon', nicholas_deer: 'deer', ida_pheasant: 'pheasant', elizabeth_owl: 'elizabeth_owl' };   // pheasant：戴野鸡面具、棕色泡泡袖裙（第十灾的 Ida）；elizabeth_owl：第十灾鹰室里戴猫头鹰面具的 Elizabeth
// 其他单独成模的人物（2026-11-03 第二批）：第六灾瘟疫医生、第一 / 八 / 十灾的黑影（灵魂）
const OWN = { plague_doctor: 'doctor', soul: 'soul' };
// 这几个变体和成年模型对不上（换了衣服 / 年龄 / 去掉了帽子胡子，或者要从头部网格里拆耳朵 / 换发型），继续用程序化人物
// （第七灾要摘帽子的 gerard_p7 2026-11-05 起改用网格 Gerard：帽子按贴图颜色从头部网格里拆出来，见文件末尾的 removableHat）
const PROCEDURAL = new Set(['gerard_young', 'ida_child', 'nicholas_stand', 'gerard_barber']);
export function modelKeyFor(id) {
  if (MASKED[id]) return MASKED[id];
  if (OWN[id]) return OWN[id];
  if (PROCEDURAL.has(id)) return null;
  for (const [prefix, key] of KEYS) if (id === prefix || id.startsWith(prefix + '_')) return key;
  return null;
}
const MASKED_KEYS = new Set(Object.values(MASKED));

/** 每章要用到的模型（章节启动前预加载）。 */
export const CHAPTER_MODELS = {
  plague1: ['nicholas', 'margaret', 'goat', 'boar', 'rabbit', 'pigeon', 'deer', 'soul'],     // boar 到 deer：记忆里戴动物头的家人；soul：黑影
  plague2: ['david', 'gerard', 'nicholas', 'margaret', 'ida'],
  plague3: ['david', 'gerard', 'nicholas', 'margaret', 'ida', 'jakob_child'],
  plague4: ['nicholas', 'gerard', 'margaret', 'jakob_child', 'fly'],
  plague5: ['gerard', 'nicholas', 'margaret', 'cow'],
  plague6: ['gerard', 'margaret', 'jakob_child', 'deer', 'doctor'],   // doctor：天堂门里走出来的瘟疫医生
  plague7: ['gerard', 'ida', 'jakob_child', 'deer'],
  plague8: ['goat', 'musician_fat', 'musician_feather', 'musician_old', 'mantis', 'ida', 'margaret', 'jakob_child', 'soul'],   // 山羊 + 三个抱琴的乐手、巨型螳螂、红发女人 Ida、船上的奶奶、回忆里的少年 Jakob、雾里的黑影
  plague9: ['gerard', 'david', 'ida', 'margaret', 'nicholas'],   // 篝火边的五个人
  plague10: ['gerard', 'david', 'ida', 'margaret', 'nicholas', 'boar', 'rabbit', 'pigeon', 'deer', 'pheasant', 'soul', 'elizabeth_owl'],   // 五个家人 + 戴上面具以后的动物头模型 + 黑影、鹰室里的 Elizabeth
};

function parse(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, false) !== 0x524c504d) throw new Error('不是 RLPM 文件');   // 'RLPM'
  const hl = dv.getUint32(8, true);
  const hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, hl)));
  const base = 12 + hl, A = hdr.arrays;
  const at = (n) => base + A[n][0];
  const nv = hdr.vcount;
  const position = new Float32Array(buf, at('position'), nv * 3);
  const uv = new Float32Array(buf, at('uv'), nv * 2);
  const n8 = new Int8Array(buf, at('normal'), nv * 4), normal = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) { normal[i * 3] = n8[i * 4] / 127; normal[i * 3 + 1] = n8[i * 4 + 1] / 127; normal[i * 3 + 2] = n8[i * 4 + 2] / 127; }
  let skinIndex = null, skinWeight = null;     // 静态网格（牛）没有蒙皮数据
  if (A.skinIndex) {
    const si8 = new Uint8Array(buf, at('skinIndex'), nv * 4), sw8 = new Uint8Array(buf, at('skinWeight'), nv * 4);
    skinIndex = new Uint16Array(nv * 4); skinWeight = new Float32Array(nv * 4);
    for (let i = 0; i < nv * 4; i++) { skinIndex[i] = si8[i]; skinWeight[i] = sw8[i] / 255; }
  }
  const index = hdr.indexBytes === 4 ? new Uint32Array(buf, at('index'), hdr.icount) : new Uint16Array(buf, at('index'), hdr.icount);
  return { hdr, position, normal, uv, skinIndex, skinWeight, index };
}

/** 把三角形按“头 / 身体”拆成两组：头（含头发帽子）的权重超过一半的三角形归头，换动物头时可以整块隐藏。 */
function splitHead(m) {
  const hj = m.hdr.joints.indexOf(m.hdr.headJoint || 'head');
  const headW = new Float32Array(m.hdr.vcount);
  for (let i = 0; i < m.hdr.vcount; i++) for (let j = 0; j < 4; j++) if (m.skinIndex[i * 4 + j] === hj) headW[i] += m.skinWeight[i * 4 + j];
  const head = [], body = [];
  for (let t = 0; t < m.index.length; t += 3) {
    const a = m.index[t], b = m.index[t + 1], c = m.index[t + 2];
    (headW[a] + headW[b] + headW[c] > 1.5 ? head : body).push(a, b, c);
  }
  const ctor = m.index.constructor;
  m.headIndex = new ctor(head); m.bodyIndex = new ctor(body);
}

async function fetchModel(key) {
  if (!BASE) throw new Error('import.meta.url 不可用');
  const buf = await (await fetch(BASE + key + '.rlpm')).arrayBuffer();
  const m = parse(buf);
  m.hdr.id = key;
  if (m.hdr.kind === undefined && m.hdr.joints.includes('head') && m.hdr.bind) splitHead(m);
  const tex = await new THREE.TextureLoader().loadAsync(BASE + (m.hdr.texture || key + '.jpg'));
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  m.texture = tex;
  return m;
}

// ?models=0：强制全部使用程序化人物（对照 / 排查用）
const DISABLED = (() => { try { return new URLSearchParams(location.search).get('models') === '0'; } catch (e) { return false; } })();

export function loadModel(key) {
  if (DISABLED) return Promise.resolve(null);
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (!pending.has(key)) {
    pending.set(key, fetchModel(key).then((m) => { cache.set(key, m); return m; }, (e) => {
      console.warn(`[rlpm] 模型 ${key} 加载失败，使用程序化模型：`, e);
      cache.set(key, null); return null;
    }));
  }
  return pending.get(key);
}
export const preloadModels = (keys) => Promise.all([...new Set(keys)].map(loadModel));
export const getModel = (key) => cache.get(key) || null;

// ---------------------------------------------------------------------------
// 蒙皮
// ---------------------------------------------------------------------------

const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();

/** 逆绑定矩阵：绑定姿势下关节 j 的世界矩阵 = 平移(p) × 绕前向轴(z)转 r；取逆。 */
export function boneInverses(hdr) {
  return hdr.joints.map((name) => {
    const b = hdr.bind[name];
    const e = b.e || [0, 0, b.r || 0];     // 人物：r = 绕前向轴；e = 世界欧拉角（默认 XYZ；脚用 ZYX：先偏航再随腿倾斜）
    return new THREE.Matrix4().compose(_p.fromArray(b.p), _q.setFromEuler(_e.set(e[0], e[1], e[2], b.order || 'XYZ')), _s).invert();
  });
}

function geometryFor(m, index) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(m.skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(m.skinWeight, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}

/** 把模型的网格蒙皮到 rig 的关节上；头和身体分成两块（tag 'head' / 'body'）。返回创建的网格。 */
export function attachModel(rig, m, { outline } = {}) {
  const hdr = m.hdr;
  const bones = hdr.joints.map((n) => {
    if (!rig.joints[n]) throw new Error(`[rlpm] ${rig.id}: 骨架里没有关节 ${n}`);
    return rig.joints[n];
  });
  rig.root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones, boneInverses(hdr));
  const H = hdr.H;
  // 贴图上本来就有手绘墨线，描边比程序化人物细一点
  const mat = rig.mats.toon('#ffffff', { map: m.texture, outline: outline ?? 0.0034 });
  const make = (index, tag) => {
    if (!index.length) return null;
    const mesh = new THREE.SkinnedMesh(geometryFor(m, index), mat);
    mesh.name = `${rig.id}:${tag}`; mesh.castShadow = true; mesh.frustumCulled = false;
    rig.root.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H * 0.5, 0), H * 1.1);
    return mesh;
  };
  const meshes = [];
  const body = make(m.bodyIndex || m.index, 'body'); if (body) { meshes.push(body); (rig.tags.body ||= []).push(body); }
  const head = m.headIndex ? make(m.headIndex, 'head') : null;
  if (head) { meshes.push(head); for (const t of ['head', 'face', 'hair', 'hat', 'neck']) (rig.tags[t] ||= []).push(head); }
  rig.skeleton = skeleton; rig.skins = [];     // rig.apply 用 rig.skeleton 同步骨骼矩阵；网格自己不进 rig.skins（避免被 bindSkins 重新绑定）
  rig.modelMeshes = meshes;
  // 姿势变了，蒙皮包围盒要重算（Box3.setFromObject / 射线都用它）：下一次需要时按当前姿势惰性重算
  rig._after.push(() => { for (const mm of meshes) mm.boundingBox = null; });
  return meshes;
}

/** 人物：按模型的比例建骨架，再把网格蒙上去；没有模型返回 null。 */
export function modelHuman(id) {
  const key = modelKeyFor(id), m = key && getModel(key);
  if (!m) {
    if (key && !DISABLED && !cache.has(key) && !warned.has(key)) { warned.add(key); console.warn(`[rlpm] 模型 ${key} 没有预加载（${id}），先用程序化模型；把它加进 CHAPTER_MODELS`); }
    return null;
  }
  const rig = makeHuman(id, { height: m.hdr.H, dims: m.hdr.k });
  attachModel(rig, m);
  // 手是网格的一部分，不能换形状：保留接口，只记录
  rig.handPose = { L: 'relax', R: 'relax' }; rig.handMeshes = { L: {}, R: {} };
  rig.setHand = (side, pose) => { rig.handPose[side] = pose; };
  rig.hideHand = () => {};
  // 脸是网格贴图的一部分，没有表情贴花；给一个占位对象，让设置表情 / 眨眼的代码照常运行
  rig.face = { expr: 'neutral', tex: () => null, cur: null, blink: false, mouth: false, timer: 99, talkT: 0, mesh: null };
  rig.headTags = ['head', 'face', 'hair', 'hat', 'neck'];
  // 头部的近似椭球（后面挂帽子 / 面具 / 水蛭的代码用 headDef 取脸上的点），鼻尖位置直接从网格里找
  const [rx, ry, rz] = rig.dims.headR;
  rig.headDef = headDeform({ rx, ry, rz, jaw: 0.25, chin: 0.15, crown: 0.1, flat: 0.14, cheek: 0 });
  rig.noseTip = noseTipOf(m, rig);
  rig.shirtFront = () => 0.1;
  rig.skinMat = rig.mats.toon('#e0d3c4');
  rig.ps.build(rig);
  rig.isModel = true;
  if (MASKED_KEYS.has(key)) rig.setMask = () => {};     // 动物头是网格的一部分：builder 里的 setMask('boar') 等不再戴面具
  return rig;
}

/** 头部局部坐标里的鼻尖：头部网格上、脸正中、高度在头中心附近的最靠前的点。 */
function noseTipOf(m, rig) {
  const hb = m.hdr.bind.head.p, hj = m.hdr.joints.indexOf('head'), ry = rig.dims.headR[1];
  let best = null;
  const P = m.position;
  for (let i = 0; i < m.hdr.vcount; i++) {
    let hw = 0;
    for (let j = 0; j < 4; j++) if (m.skinIndex[i * 4 + j] === hj) hw += m.skinWeight[i * 4 + j];
    if (hw < 0.5) continue;
    const x = P[i * 3], y = P[i * 3 + 1] - hb[1], z = P[i * 3 + 2];
    if (Math.abs(x) > 0.012 || y > ry * 0.15 || y < -ry * 0.55) continue;
    if (!best || z > best.z) best = new THREE.Vector3(0, y, z);
  }
  return best || new THREE.Vector3(0, -ry * 0.2, rig.dims.headR[2]);
}

// ---------------------------------------------------------------------------
// 摘帽子（第七灾 Gerard 把帽子送给玩家）：网格人物的帽子和头是同一块网格，没有单独的帽子部件。
// 按贴图颜色把帽子的三角形拆出来：从帽顶（头骨骼上方 seedY 以上，全是帽子）开始，沿相邻三角形往下“长”，
// 只经过灰色 / 墨线色的三角形，碰到棕色头发、浅色皮肤就停（帽檐、帽带都是灰的，头发和额头不会被带走）；
// 低于 minY 的不再长，防止从帽檐的墨线顺着脸上的墨线长下去。摘帽 = 头部网格换成不含这些三角形的索引，
// 再在原来帽子底下补一顶头发（椭球形发顶，按摘帽后剩下的头发 / 额头边缘拟合大小），把网格的空洞盖住。
// ---------------------------------------------------------------------------

/** 拆出帽子的三角形（每个模型算一次，缓存在模型上）。返回 { keep: 不含帽子的头部索引, fit: 发顶椭球 } 或 null。 */
function splitHat(m, { seedY = 0.16, minY = -0.02, plane = [0.047, 0.2] } = {}) {
  if (m.hatSplit !== undefined) return m.hatSplit;
  m.hatSplit = null;
  const img = m.texture && m.texture.image, H = m.headIndex;
  if (!img || !H || typeof document === 'undefined') return null;
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, S, S);
  const px = g.getImageData(0, 0, S, S).data;
  const P = m.position, UV = m.uv, hy = m.hdr.bind.head.p[1];
  // 顶点颜色分类：0 皮肤 / 白（浅、不饱和），1 头发 / 眉毛 / 胡子（棕、饱和），2 帽子灰，3 墨线（很暗）
  const cls = (v) => {
    const x = Math.min(S - 1, Math.max(0, (UV[v * 2] * S) | 0)), y = Math.min(S - 1, Math.max(0, ((1 - UV[v * 2 + 1]) * S) | 0));
    const i = (y * S + x) * 4, r = px[i] / 255, gg = px[i + 1] / 255, b = px[i + 2] / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx > 0 ? (mx - mn) / mx : 0;
    if (mx <= 0.18) return 3;
    if (sat > 0.28) return 1;
    return mx > 0.7 ? 0 : 2;
  };
  const nt = H.length / 3, ty = new Float32Array(nt), tz = new Float32Array(nt), grey = new Uint8Array(nt);
  const key = (v) => `${Math.round(P[v * 3] * 1e4)},${Math.round(P[v * 3 + 1] * 1e4)},${Math.round(P[v * 3 + 2] * 1e4)}`;
  const v2t = new Map();
  for (let t = 0; t < nt; t++) {
    const n = [0, 0, 0, 0];
    let y = 0;
    for (let k = 0; k < 3; k++) {
      const v = H[t * 3 + k];
      n[cls(v)]++; y += P[v * 3 + 1] - hy;
      const kk = key(v); let list = v2t.get(kk); if (!list) v2t.set(kk, (list = [])); list.push(t);
    }
    ty[t] = y / 3; tz[t] = (P[H[t * 3] * 3 + 2] + P[H[t * 3 + 1] * 3 + 2] + P[H[t * 3 + 2] * 3 + 2]) / 3;
    const major = n.indexOf(Math.max(...n));
    grey[t] = major === 2 || major === 3 ? 1 : 0;
  }
  const hat = new Uint8Array(nt), queue = [];
  for (let t = 0; t < nt; t++) if (ty[t] > seedY) { hat[t] = 1; queue.push(t); }
  if (!queue.length) return null;
  for (let qi = 0; qi < queue.length; qi++) {
    const t = queue[qi];
    for (let k = 0; k < 3; k++) for (const u of v2t.get(key(H[t * 3 + k]))) {
      if (hat[u] || !grey[u] || ty[u] <= minY) continue;
      hat[u] = 1; queue.push(u);
    }
  }
  // 帽子底下剩的头皮 / 额头边缘是锯齿状的：再用一个前高后低的斜面（发际线，y = plane[0] + plane[1]·z）把它切齐，
  // 斜面以上的三角形一律不画（那里会被补上的头发盖住）。剪口附近（斜面下 1.5 cm 内）剩下的顶点拟合发顶的椭圆。
  const [p0, k] = plane, keep = [];
  const box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (let t = 0; t < nt; t++) {
    if (hat[t] || ty[t] > p0 + k * tz[t]) continue;
    for (let j = 0; j < 3; j++) {
      const v = H[t * 3 + j], z = P[v * 3 + 2], d = P[v * 3 + 1] - hy - (p0 + k * z);
      keep.push(v);
      if (d < -0.015) continue;
      box.x0 = Math.min(box.x0, P[v * 3]); box.x1 = Math.max(box.x1, P[v * 3]);
      box.z0 = Math.min(box.z0, z); box.z1 = Math.max(box.z1, z);
    }
  }
  if (!Number.isFinite(box.x0)) return null;
  m.hatSplit = { keep: new H.constructor(keep), cut: nt - keep.length / 3, box, plane };
  return m.hatSplit;
}

/**
 * 给网格人物加 setHat(on)：on = false 时帽子三角形不画，换成一顶头发（hair: 颜色 / 墨线 / 发顶高出拟合边缘多少）。
 * 不是网格人物（没加载模型、?models=0）时什么都不做，调用方继续用 showTag('hat', …)。
 */
export function removableHat(rig, key, { color = '#8a5530', line = '#4e2d1c', crown = 0.085, seedY, minY, plane } = {}) {
  const m = rig.isModel && getModel(key);
  const head = m && (rig.tags.head || []).find((x) => x.isSkinnedMesh);
  if (!head) return rig;
  let hair = null, wearing = true;
  const build = () => {
    const split = splitHat(m, { seedY, minY, plane });
    if (!split) return null;
    const { box } = split, hb = m.hdr.bind.head.p, [p0, k] = split.plane;
    const cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2;
    const ax = (box.x1 - box.x0) / 2 + 0.006, az = ((box.z1 - box.z0) / 2) * Math.hypot(1, k) + 0.003;
    // 发顶：半个椭球，赤道贴着斜切的剪口（跟发际线一样前高后低），往上 crown 米是头顶；
    // 赤道下面多留一截向里收的裙边，塞进头部网格里堵住剪口的缝
    const geo = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.62);
    geo.scale(ax, crown, az);
    // 贴图从头顶往下平面投影：发丝从前额往后梳，侧面顺着往下，头顶不会出现球面贴图收成一点的“南瓜纹”
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / (ax * 2.2), 0.5 + pos.getZ(i) / (az * 2.2));
    geo.rotateX(-Math.atan(k));
    geo.translate(cx - hb[0], p0 + k * cz, cz - hb[2]);
    const mat = rig.mats.toon('#ffffff', { map: hairStrands(color, line, 71), outline: 0.003 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `${rig.id}:hair_under_hat`; mesh.castShadow = true;
    rig.joints.head.add(mesh);
    return { split, mesh };
  };
  rig.setHat = (on) => {
    on = !!on;
    if (on === wearing) return;
    if (!on && !hair) hair = build();
    if (!hair) return;      // 拆不出来（贴图没读到）就保持戴着
    wearing = on;
    head.geometry.setIndex(new THREE.BufferAttribute(on ? m.headIndex : hair.split.keep, 1));
    hair.mesh.visible = !on;
  };
  return rig;
}
