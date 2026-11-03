// 第十灾：黄昏的岛。神殿被一只巨大的木头猫头鹰包住（门开在两只爪子中间，门前一圈木栅栏）；
// 五个家人各在自己的地方，身边一根带翅膀的火炬柱：塔下猎人 Gerard、白桦树前的 David、塔门口敲鼓的 Nicholas，
// 空地上的 Ida，木屋里炉子边的奶奶。井下三间石室是独立区域 p10_under（原点 x = 800），结尾的红色幻象是 p10_vision（x = 860）。
// 模型显示始终由存档状态推导（sync）。
import * as THREE from 'three';
import { makeProp } from '../../art/props.js';
import { makePerson } from '../../art/cast_mock.js';
import { makeCharacter, makeMaskModel } from '../../art/characters.js';
import { P, SETS } from '../../art/layout.js';
import { BUILDING_DIMS } from '../../art/buildings.js';
import { groundHeight } from '../../art/island.js';
import { toon, unlit } from '../../art/materials.js';
import { CRYPT, WOOD_OWL, STRIPE_COLORS, NICHE_ANIMALS } from '../../art/props_p10.js';
import { hitBox } from '../../art/props_p9.js';
import { clearDoorBoulder, SPOT as P9 } from '../plague9/world.js';
import { FACE_START, HEX_START, LETTERS_START, BONES_START, PEOPLE as FAMILY, MASK_OF } from './rules.js';
import { T } from './text.js';

export const W = {};
const K = SETS.house_int.origin[0];
export const UX = 800, VX = 860;   // 井下、幻象两个区域的原点 x
const cam = (pos, target, fov = 48) => ({ pos, target, fov });
const wpos = (ctx, name) => ctx.world.anchor(name).getWorldPosition(new THREE.Vector3()).toArray();
const at = (x, z, dy = 0) => [x, groundHeight(x, z) + dy, z];
const face = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);
const v3 = new THREE.Vector3();

// 塔门（沿用第九灾的门和位置）：门的正前方 +n（朝东）
const DOOR_N = [Math.sin(P9.doorRotY), Math.cos(P9.doorRotY)];
const fromDoor = (d, side = 0) => [P9.door[0] + DOOR_N[0] * d + DOOR_N[1] * side, P9.door[1] + DOOR_N[1] * d - DOOR_N[0] * side];
// 各个东西的位置（世界 x, z）
export const SPOT = {
  stump: [0.3, 26.8],
  gerard: [-4.6, 18.4], david: [-8.2, 11.6], birch: [-8.41, 11.2],
  nicholas: fromDoor(0.62), drum: fromDoor(1.2),
  ida: [14.6, 5.2], hen: [18.2, 6.0], well: [21.0, 3.6],
  torch: { gerard: [-5.4, 18.8], david: [-9.0, 12.0], nicholas: fromDoor(1.05, 1.15), ida: [15.8, 6.2], margaret: [5.0, -10.6] },
};
// 木屋里（相对 house_int 原点；后墙 z = -1.6，前墙门洞 z = 3.0）
export const ROOM = { stove: [-1.72, -1.12], margaret: [-0.95, -0.82], table: [1.0, -0.62], maskPainting: [0.4, 1.58, -1.585], owlPainting: [1.5, 1.58, -1.585] };
// Ida 的眼睛（头骨骼局部坐标，第八灾按 ida.rlpm 量的）和脸上五道竖条的范围
const IDA_EYES = [[-0.0427, -0.034, 0.1356], [0.0421, -0.0326, 0.1342]];
export const FACE_AREA = { x: 0.068, top: 0.035, bottom: -0.118 };
// 戴上面具的五个人最后站到木头猫头鹰栅栏里面、门的左边（门右边紧挨着湖边的大石头，站不下人）。
// 猫头鹰局部坐标 [x, z]：正面朝 +z，门在 x = 0；身体半径 4.6 m，栅栏半径 6 m
const OWL_SPOTS = { ida: [-2.45, 4.85], margaret: [-3.0, 4.55], david: [-3.5, 4.1], gerard: [-4.0, 3.6], nicholas: [-4.45, 3.0] };
// 门前两根火炬柱：在栅门外面两边；右边那根贴着大石头脚
const GATE_TORCHES = [[-1.4, 6.75], [1.1, 6.7]];

function place(ctx, id, model, parent, pos, { scale = 1, rotY = 0, opts } = {}) {
  const object = typeof model === 'string' ? makeProp(model, opts) : model;
  object.position.fromArray(pos); object.rotation.y = rotY; object.scale.setScalar(scale);
  parent.add(object); W[id] = object;
  if (object.update) ctx.register('prop', `p10_${id}`, object);
  return object;
}

function person(ctx, key, mockId, parent, pos, rotY = 0) {
  const rig = makePerson(mockId);
  rig.root.position.fromArray(pos); rig.root.rotation.y = rotY; parent.add(rig.root);
  ctx.register('char', `p10_${key}`, rig);
  W.rigs[key] = rig;
  return rig;
}

function zone(ctx, id) {
  const g = new THREE.Group(); g.name = `zone_${id}`;
  ctx.world.root.add(g); ctx.views.registerZone(id, g);
  W.zones[id] = g;
  return g;
}

// 第一灾的道具（压水泵、图腾、奶奶的位置、水桶、小船、山羊）这一章都不在，去掉它们的碰撞体
function clearUnusedColliders(ctx) {
  const col = ctx.world.colliders;
  const near = (x, z, p) => Math.hypot(x - p.pos[0], z - p.pos[2]) < 0.08;
  col.circles = col.circles.filter(([x, z, r]) => ![[P.pump, 0.45], [P.owlTotem, 0.6], [P.margaret, 0.55], [P.bucket, 0.3]]
    .some(([p, radius]) => near(x, z, p) && Math.abs(r - radius) < 0.001));
  col.segments = col.segments.filter(([ax, az, bx, bz, r]) => !((near((ax + bx) / 2, (az + bz) / 2, P.rowboat) && Math.abs(r - 0.62) < 0.001)
    || (near((ax + bx) / 2, (az + bz) / 2, P.goat) && Math.abs(r - 0.3) < 0.001)));
}

// ---- 黄昏：天空和远山染成橙红、太阳光变暖、湖水偏暖 ----
export const DUSK = { sky: '#e0844a', tint: 0.5, fog: 0.42, near: 34, far: 250 };
function duskScene(ctx, ext) {
  const sky = ctx.world.sky;
  sky.fogState.tint = { color: new THREE.Color(DUSK.sky), sky: DUSK.tint, fog: DUSK.fog, near: DUSK.near, far: DUSK.far };
  sky.hemi.color.set('#f4b98a'); sky.hemi.groundColor.set('#4e3426'); sky.hemi.intensity = 0.8;
  sky.sun.color.set('#ffa25a'); sky.sun.intensity = 1.05;
  ctx.world.root.traverse((o) => { const u = o.material?.uniforms; if (u?.cLakeNear) { u.cLakeNear.value.set('#5a4440'); u.cLake.value.set('#6a4a40'); u.cSkyRefl.value.set('#d98a58'); if (u.cLakeFar) u.cLakeFar.value.set('#7a5446'); } });
  W.sky = makeProp('p9_sky', { stars: 120, moon: false, sun: { az: 132, el: 4 } }); ext.add(W.sky);
  ctx.register('prop', 'p10_dusk', { update() { W.sky.follow(ctx.engine.camera); } });
}

// ---- 神殿外面的木头猫头鹰：藏起神殿的穹顶、檐口、窗和顶上的石猫头鹰（墙和门留在猫头鹰肚子里）----
function woodOwl(ctx, ext) {
  const hide = new Set(['temple_owl', 'temple_cornice', 'temple_dome', 'temple_finial', 'temple_window']);
  ctx.world.root.traverse((o) => { if (hide.has(o.name)) o.visible = false; });
  const door = wpos(ctx, 'temple.door'), c = P.temple.pos;
  const rotY = Math.atan2(door[0] - c[0], door[2] - c[2]);
  W.owlCenter = [c[0], c[2]]; W.owlRot = rotY;
  place(ctx, 'owl', 'p10_wood_owl', ext, [c[0], groundHeight(c[0], c[2]) - 0.05, c[2]], { rotY });
  // 门前两根火炬柱（带灯）
  W.gateTorches = GATE_TORCHES.map(([lx, lz], i) => place(ctx, `gateTorch${i}`, makeProp('p10_torch', { light: true, height: 1.9 }), ext, at(...owlLocal(lx, lz)), { rotY }));
}
/** 木头猫头鹰正面偏 a 弧度、离中心 r 米的地面点（世界 x, z）。 */
export function owlPoint(a, r) {
  const t = W.owlRot + a;
  return [W.owlCenter[0] + Math.sin(t) * r, W.owlCenter[1] + Math.cos(t) * r];
}
/** 猫头鹰局部坐标（正面 +z，门在 x = 0）→ 世界 x, z。 */
export function owlLocal(lx, lz) {
  const t = W.owlRot;
  return [W.owlCenter[0] + lx * Math.cos(t) + lz * Math.sin(t), W.owlCenter[1] - lx * Math.sin(t) + lz * Math.cos(t)];
}

// ---- Ida 脸上的五道竖条：从脸前面往头骨骼方向打射线，贴着网格脸做五条小网格（挂在头骨骼上）----
function facePaint(rig) {
  const head = rig.joints.head, mesh = rig.tags.head?.[0];
  rig.root.updateMatrixWorld(true); rig.skeleton?.update?.();
  const inv = head.matrixWorld.clone().invert(), ray = new THREE.Raycaster();
  const hitAt = (x, y) => {
    const o = head.localToWorld(new THREE.Vector3(x, y, 0.45)), d = head.localToWorld(new THREE.Vector3(x, y, 0)).sub(o).normalize();
    ray.set(o, d);
    const h = mesh ? ray.intersectObject(mesh, false)[0] : null;
    const p = h ? h.point.applyMatrix4(inv) : new THREE.Vector3(x, y, 0.13 - x * x * 3);
    p.z += 0.005;
    return p;
  };
  const g = new THREE.Group(); g.name = 'ida_face_paint'; head.add(g);
  const { x: X, top, bottom } = FACE_AREA, N = 5, rows = 26, cols = 6, w = (2 * X) / N;
  const mats = [], hits = [];
  for (let i = 0; i < N; i++) {
    const pos = [], idx = [];
    for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) {
      const p = hitAt(-X + w * (i + c / (cols - 1)), top + (bottom - top) * (r / rows));
      pos.push(p.x, p.y, p.z);
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols - 1; c++) { const a = r * cols + c, b = a + cols; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const mat = unlit(STRIPE_COLORS.white, { transparent: true, opacity: 0.88, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new THREE.Mesh(geo, mat); m.name = `face_stripe_${i}`; m.renderOrder = 2; g.add(m);
    const mid = hitAt(-X + w * (i + 0.5), (top + bottom) / 2);
    const hit = hitBox(g, `stripe_hit_${i}`, [w * 0.96, top - bottom, 0.03], mid.toArray()); hit.userData.stripe = i;
    mats.push(mat); hits.push(hit);
  }
  // 白色的眼睛（同第八灾）
  for (const e of IDA_EYES) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.0125, 16), unlit('#f2f0ea')); d.position.set(e[0], e[1], e[2] + 0.004); d.name = 'ida_white_eye'; head.add(d); }
  g.userData.stripes = hits;
  g.setFace = (face = FACE_START) => mats.forEach((m, i) => m.color.set(STRIPE_COLORS[face[i]] || STRIPE_COLORS.white));
  g.setFace();
  return g;
}

// ---- 塔下：鼓手 Nicholas、猎人 Gerard（弓）、白桦树前的 David ----
function setupTower(ctx, ext) {
  const [dx, dz] = P9.door;
  place(ctx, 'towerDoor', 'p9_tower_door', ext, [dx, groundHeight(dx + 0.6, dz) - 0.05, dz], { rotY: P9.doorRotY });
  W.towerDoor.userData.leaf.userData.open(1);
  W.towerDoor.getObjectByName('door_lamp').visible = false;
  // 门洞上方伸出一根横木，挂着一串骨头（在 Nicholas 右手边）
  const string = place(ctx, 'boneString', 'p10_bone_string', W.towerDoor, [-0.62, 2.55, 0.72]);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.78), toon('#4a3424')); pole.position.set(-0.62, 2.55, 0.33); W.towerDoor.add(pole);
  string.userData.ground = [0.25, -2.52, 0.15];   // 掉下来滚到门洞前、鼓腿左边的地上（正下方是开着的门板，会被挡住）
  // 鼓的左右按玩家看过去的左右算（鼓面左半边 = Nicholas 的右手）
  place(ctx, 'drum', 'p10_drum', ext, at(...SPOT.drum), { rotY: P9.doorRotY });
  const nick = person(ctx, 'nicholas', 'nicholas_p10', ext, at(...SPOT.nicholas), P9.doorRotY);
  drumPose(nick, null);
  // Gerard 左手提着弓（弓挂在人物根节点上，摆到手的位置，手用 IK 去够它）
  const ger = person(ctx, 'gerard', 'gerard_p10', ext, at(...SPOT.gerard), face(SPOT.gerard, SPOT.david));
  const bow = makeProp('p10_bow'); bow.name = 'gerard_bow'; bow.rotation.y = -Math.PI / 2; ger.root.add(bow); W.bow = bow;
  bowPose(ger, 'rest');
  // David 背靠白桦树；苹果顶在他头上（挂在头骨骼上）
  place(ctx, 'birch', makeProp('p3_birch', { height: 7.2, seed: 13, leaves: false }), ext, at(...SPOT.birch));
  const dav = person(ctx, 'david', 'david_p10', ext, at(...SPOT.david), face(SPOT.david, SPOT.gerard));
  dav.root.updateMatrixWorld(true); dav.skeleton?.update?.();
  // 苹果顶在帽顶上（网格人物的帽子和头是一块网格，按它的包围盒最高点放；没有网格时按身高）
  const headMesh = dav.tags?.head?.[0], hw = dav.joints.head.getWorldPosition(new THREE.Vector3());
  const topY = headMesh ? new THREE.Box3().setFromObject(headMesh, true).max.y : dav.root.position.y + (dav.dims?.height || 1.78);
  const apple = makeProp('p10_apple'); apple.name = 'head_apple';
  apple.position.copy(dav.joints.head.worldToLocal(new THREE.Vector3(hw.x, topY - 0.008, hw.z)));
  apple.quaternion.copy(dav.joints.head.getWorldQuaternion(new THREE.Quaternion()).invert());
  dav.joints.head.add(apple); W.headApple = apple;
  // 射穿以后：苹果和骨箭钉在白桦树干上（朝 Gerard 那一面），虫子从苹果里探出头
  const b = W.birch.userData.birch, h = apple.getWorldPosition(v3).y + 0.04 - W.birch.position.y;   // 苹果中心的高度
  const dir = new THREE.Vector2(SPOT.gerard[0] - SPOT.birch[0], SPOT.gerard[1] - SPOT.birch[1]).normalize();
  const c = b ? b.at(h) : new THREE.Vector3(0, h, 0), r = b ? b.rAt(h) : 0.11;
  const base = new THREE.Vector3(...at(...SPOT.birch)).add(new THREE.Vector3(c.x, c.y, c.z));
  const surface = base.clone().add(new THREE.Vector3(dir.x * r, 0, dir.y * r));
  const pinned = new THREE.Group(); pinned.name = 'pinned_apple'; ext.add(pinned); W.pinned = pinned;
  const arrow = makeProp('p10_arrow', { feather: true, tip: true });
  const flyDir = new THREE.Vector3(-dir.x, 0, -dir.y);
  arrow.rotation.y = Math.atan2(-flyDir.z, flyDir.x);
  arrow.position.copy(surface).addScaledVector(flyDir, 0.03 - 0.395); pinned.add(arrow);
  const pa = makeProp('p10_apple'); pa.position.copy(surface).addScaledVector(flyDir, -0.06); pa.position.y -= 0.04; pinned.add(pa);
  const worm = makeProp('p10_worm'); worm.name = 'apple_worm'; worm.position.copy(pa.position).add(new THREE.Vector3(0, 0.07, 0)).addScaledVector(flyDir, -0.02); worm.rotation.y = arrow.rotation.y + 0.6; ext.add(worm); W.worm = worm;
  W.pinnedAt = { arrow: arrow.position.clone(), apple: pa.position.clone(), rotY: arrow.rotation.y, flyDir };
  W.flyArrow = arrow; W.flyApple = pa;
}

/** Nicholas 两手悬在鼓面上；hand = 'L' / 'R'（他自己的左右手）时那只手抬起来（敲一下 = 抬手、落下）。 */
export function drumPose(rig, hand = null) {
  const y = 1.0, z = 0.42;
  rig.setPose(rig.solve(rig.basePose, {
    L: { pos: [0.15, y + (hand === 'L' ? 0.16 : 0), z], pole: [1, -0.6, -0.4] },
    R: { pos: [-0.15, y + (hand === 'R' ? 0.16 : 0), z], pole: [-1, -0.6, -0.4] },
  }));
}

/** Gerard 拿弓：rest（垂在身侧）/ aim（举弓、右手拉弦到胸前）。 */
export function bowPose(rig, mode = 'rest') {
  const grip = mode === 'aim' ? [0.08, 1.42, 0.56] : [0.27, 0.86, 0.06];
  W.bow.position.set(grip[0], grip[1], grip[2] - 0.1);
  W.bow.rotation.set(0, -Math.PI / 2, mode === 'aim' ? 0 : 0.12);
  const target = { L: { pos: grip, pole: [1, -0.5, -0.5] } };
  if (mode === 'aim') target.R = { pos: [-0.04, 1.42, 0.18], pole: [-1, -0.3, -0.6] };
  rig.setPose(rig.solve(rig.basePose, target));
}

// ---- 树林路口、空地、木屋 ----
function setupIsland(ctx, ext, house) {
  // 树林路口：树桩上的仓鸮
  place(ctx, 'stump', 'p10_owl_stump', ext, at(...SPOT.stump), { rotY: 0.4 });
  // 空地：Ida、母鸡和食盆、石井
  const ida = person(ctx, 'ida', 'ida', ext, at(...SPOT.ida), face(SPOT.ida, [11.5, 10.5]));
  ida.reach('L', [0.2, 1.12, 0.3], { pole: [1, -0.8, -0.2] });   // 举着一只手掌
  W.facePaint = facePaint(ida);
  const candle = makeProp('p9_candle'); candle.name = 'ida_candle'; candle.scale.setScalar(0.9);
  const palm = new THREE.Group(); palm.position.set(0.2, 1.14, 0.3); palm.add(candle); ida.root.add(palm); W.idaCandle = palm;
  place(ctx, 'hen', 'p10_hen', ext, at(...SPOT.hen), { rotY: face(SPOT.hen, [11.5, 10.5]) });
  place(ctx, 'well', 'p10_well', ext, at(...SPOT.well), { rotY: face(SPOT.well, SPOT.hen) });
  // 木屋里：柴火炉和平底锅、凳子上的奶奶、桌上三样东西、两幅画
  place(ctx, 'stove', 'p10_stove', house, [K + ROOM.stove[0], 0, ROOM.stove[1]], { rotY: 0.35 });
  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.45, 14), toon('#6a4a30')); stool.position.set(K + ROOM.margaret[0], 0.225, ROOM.margaret[1]); house.add(stool); W.stool = stool;
  const mar = person(ctx, 'margaret', 'margaret', house, [K + ROOM.margaret[0], 0, ROOM.margaret[1]], 0.25);
  mar.setPose('sit');
  place(ctx, 'table', 'p10_table', house, [K + ROOM.table[0], 0, ROOM.table[1]]);
  const top = W.table.userData.top;
  W.shaft = place(ctx, 'shaft', 'p10_arrow', W.table, [-0.12, top + 0.008, -0.14], { rotY: 0.15 });
  W.brush = place(ctx, 'brush', 'p10_brush', W.table, [0.3, top + 0.002, 0.12], { rotY: -0.5 });
  W.apple = place(ctx, 'apple', 'p10_apple', W.table, [-0.28, top, 0.16]);
  // 细长的东西点不准：各加一个看不见的点击盒
  hitBox(W.shaft, 'shaft_hit', [0.76, 0.06, 0.07]); hitBox(W.brush, 'brush_hit', [0.24, 0.05, 0.06], [-0.012, 0.008, 0]); hitBox(W.apple, 'apple_hit', [0.12, 0.12, 0.12], [0, 0.045, 0]);
  place(ctx, 'maskPainting', 'p10_mask_painting', house, [K + ROOM.maskPainting[0], ROOM.maskPainting[1], ROOM.maskPainting[2]]);
  place(ctx, 'owlPainting', 'p10_owl_painting', house, [K + ROOM.owlPainting[0], ROOM.owlPainting[1], ROOM.owlPainting[2]]);
}

// ---- 五根火炬柱、戴上面具以后的人 ----
function setupFamily(ctx, ext, house) {
  W.torches = {};
  for (const p of FAMILY) {
    const [x, z] = SPOT.torch[p];
    W.torches[p] = place(ctx, `torch_${p}`, makeProp('p10_torch'), ext, at(x, z));
  }
  W.masked = {};
  for (const [p, mock] of [['gerard', 'gerard_boar'], ['david', 'david_rabbit'], ['ida', 'ida_pheasant'], ['margaret', 'margaret_pigeon'], ['nicholas', 'nicholas_deer']]) {
    const plain = W.rigs[p];
    const rig = makePerson(mock);
    plain.root.parent.add(rig.root);
    rig.root.position.copy(plain.root.position); rig.root.rotation.y = plain.root.rotation.y;
    if (p === 'margaret') rig.setPose('sit');
    rig.root.visible = false;
    ctx.register('char', `p10_${p}_masked`, rig);
    W.masked[p] = rig;
  }
  W.home = Object.fromEntries(FAMILY.map((p) => [p, { parent: W.rigs[p].root.parent, pos: W.rigs[p].root.position.clone(), rotY: W.rigs[p].root.rotation.y }]));
}

// ---- 井下三间石室；五个拱龛里的面具；鹰室里的黑影和戴猫头鹰面具的 Elizabeth ----
function setupUnder(ctx) {
  const under = zone(ctx, 'p10_under');
  place(ctx, 'crypt', 'p10_crypt', under, [UX, 0, 0]);
  W.masks = {};
  W.crypt.userData.slots.forEach((slot, i) => {
    const kind = NICHE_ANIMALS[i], item = `mask_${kind}`;
    const m = makeMaskModel(kind); m.name = `niche_mask_${kind}`; m.position.y = 0.06; slot.add(m);
    W.masks[item] = m;
  });
  const sx = UX + CRYPT.sideX, z = CRYPT.backZ;
  const shadow = person(ctx, 'shadow', 'shadow', under, [sx + 0.1, 0, z - 1.05], -Math.PI / 2 + 0.45);
  const liz = makeCharacter('elizabeth_pheasant');
  liz.setMask(null);
  for (const t of liz.headTags || ['head', 'face', 'hair', 'hat']) liz.showTag(t, false);
  if (liz.face?.mesh) liz.face.mesh.visible = false;
  const owlMask = makeProp('p10_owl_mask'); owlMask.scale.setScalar((liz.dims?.headR?.[0] || 0.09) / 0.115); liz.parts.head.add(owlMask);
  liz.root.position.set(sx + 0.1, 0, z + 1.05); liz.root.rotation.y = -Math.PI / 2 - 0.45; under.add(liz.root);
  ctx.register('char', 'p10_elizabeth', liz);
  W.rigs.elizabeth = liz;
  shadow.root.visible = false; liz.root.visible = false;
}

// ---- 神殿：吊架、圣水盆；降下黑方块以后四周起火 ----
function setupTemple(ctx, temple) {
  const holder = makeProp('winged_holder'); holder.getObjectByName('holder_rope').removeFromParent();
  place(ctx, 'holder', holder, temple, wpos(ctx, 'temple_int.holder'), { scale: 1.4 });
  place(ctx, 'font', makeFont(), temple, wpos(ctx, 'temple_int.font'));
  // 窗外换成黄昏
  for (const side of ['L', 'R']) {
    const view = temple.getObjectByName(`temple_int_window${side}_view`);
    if (!view) continue;
    view.material = view.material.clone(); view.material.color.set('#ffb07a'); view.material.needsUpdate = true;
  }
  const fire = new THREE.Group(); fire.name = 'temple_fire'; temple.add(fire); W.templeFire = fire;
  const fp = wpos(ctx, 'temple_int.font');
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = 2.6 + (i % 3) * 0.25;
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.28 + (i % 2) * 0.1, 1.4 + (i % 4) * 0.35, 9, 1, true), unlit(i % 2 ? '#ffb24a' : '#ff6a2a', { transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
    f.position.set(fp[0] + Math.sin(a) * r, 0.7 + (i % 4) * 0.17, fp[2] + Math.cos(a) * r * 0.75 + 0.4); f.name = 'temple_flame'; fire.add(f);
  }
  const light = new THREE.PointLight('#ff7a3a', 0, 12, 1.4); light.position.set(fp[0], 2.2, fp[2] + 0.6); fire.add(light);
  fire.userData.light = light;
  ctx.register('prop', 'p10_temple_fire', { update(dt, t) {
    if (!fire.visible) return;
    fire.children.forEach((f, i) => { if (f.isMesh) f.scale.set(1, 0.85 + Math.sin(t * (7 + i) + i) * 0.15, 1); });
    light.intensity = 3 + Math.sin(t * 13) * 0.4;
  } });
}
function makeFont() {
  const font = makeProp('font');
  font.userData.state.ambient = false;
  return font;
}

function defineViews(ctx) {
  const view = (id, pose, rest = {}) => ctx.views.define({ id, zone: 'exterior', cam: pose, ...rest });
  const close = (id, pose, back, area = 'exterior', onEnter = null, rest = {}) => ctx.views.define({ id, zone: area, closeup: true, look: 0, cam: pose, back, ...(onEnter ? { onEnter } : {}), ...rest });
  view('p10_overview', cam(P.overviewCam.pos, P.overviewCam.target, P.overviewCam.fov), { fixed: true });
  view('p10_gate', cam([1.6, 2.1, 47.3], [1.4, 1.5, 40.5], 52), { back: 'p10_overview', up: 'p10_forest', onEnter: () => ctx.hintOnce('p10_roam', ctx.ui.touchMode ? T.roamTouch : T.roam) });
  view('p10_forest', cam([0.1, 1.75, 30.0], [0.3, 0.9, 26.8], 50), { back: 'p10_gate', up: 'p10_tower', right: 'p10_clearing' });
  view('p10_tower', cam([-1.5, 2.0, 21.0], [-10.0, 1.4, 13.5], 52), { back: 'p10_forest', right: 'p10_clearing' });
  view('p10_clearing', cam([11.5, 1.9, 10.5], [17.5, 1.2, 4.5], 52), { back: 'p10_forest', left: 'p10_tower', up: 'p10_house' });
  view('p10_house', cam([4.5, 2.2, -3.0], [3, 1.5, -11]), { back: 'p10_clearing', right: 'p10_temple' });
  const [ox, oz] = owlPoint(-0.12, 14), [tx, tz] = owlPoint(0, 0);   // 稍微偏左，门右边的大石头只占画面右边
  view('p10_temple', cam([ox, 2.4, oz], [tx, 5.2, tz], 58), { back: 'p10_house' });   // 漫游镜头：只用来定位置和朝向（抬头看到猫头鹰的眼睛）

  const st = W.stump.position;
  close('p10_owl', cam([st.x + 0.6, st.y + 1.3, st.z + 1.9], [st.x, st.y + 0.45, st.z + 0.15], 48), 'p10_forest');   // 树桩底下的羽毛也在画面里
  close('p10_pellet', cam([st.x - 0.05, st.y + 1.2, st.z + 0.5], [st.x - 0.05, st.y + 0.56, st.z + 0.1], 40), 'p10_owl');
  // 鼓：对着门退后一点、看鼓和骨头串中间，Nicholas、门洞左边那串骨头和掉在地上的尖骨头都在画面里
  ctx.views.define({ id: 'p10_drum', zone: 'exterior', closeup: true, look: 0, back: 'p10_tower', onEnter: () => ctx.hintOnce('p10_drum_hint', T.drumHint), cam: () => {
    const s = W.boneString.getWorldPosition(new THREE.Vector3()), d = W.drum.position;
    const t = [(s.x + d.x) / 2, d.y + 1.15, (s.z + d.z) / 2];
    return cam([t[0] + DOOR_N[0] * 2.7, t[1] + 0.35, t[2] + DOOR_N[1] * 2.7], t, 54);
  } });
  const mid = [(SPOT.gerard[0] + SPOT.birch[0]) / 2, (SPOT.gerard[1] + SPOT.birch[1]) / 2];
  const gd = new THREE.Vector2(SPOT.birch[0] - SPOT.gerard[0], SPOT.birch[1] - SPOT.gerard[1]).normalize();
  const side = [-gd.y, gd.x];   // 垂直于射箭方向，朝东边空地那一侧（另一侧被大树挡住）
  const gy = W.rigs.david.root.position.y;
  close('p10_tell', cam([mid[0] + side[0] * 7.4, gy + 1.9, mid[1] + side[1] * 7.4], [mid[0], gy + 1.25, mid[1]], 50), 'p10_tower');
  const hn = W.hen.position;
  close('p10_hen', cam([hn.x - 0.5, hn.y + 1.05, hn.z + 1.25], [hn.x + 0.05, hn.y + 0.2, hn.z + 0.1], 46), 'p10_clearing');
  ctx.views.define({ id: 'p10_ida', zone: 'exterior', closeup: true, look: 0, back: 'p10_clearing', onEnter: () => ctx.hintOnce('p10_face_hint', T.idaFace), cam: () => {
    const head = W.rigs.ida.joints.head; head.updateWorldMatrix(true, false);
    const p = head.localToWorld(new THREE.Vector3(0, -0.04, 0)), f = head.localToWorld(new THREE.Vector3(0, -0.04, 0.62));
    return cam(f.toArray(), p.toArray(), 40);
  } });

  // 木屋里
  const hd = BUILDING_DIMS.house_int;
  ctx.views.defineRoamArea('house_int', {
    bounds: [K - hd.width / 2, hd.wallZ, K + hd.width / 2, hd.wallZ + hd.depth], eye: 1.65,
    circles: [[K + ROOM.stove[0], ROOM.stove[1], 0.45], [K + ROOM.margaret[0], ROOM.margaret[1], 0.35]],
    boxes: [[K + ROOM.table[0] - 0.55, ROOM.table[1] - 0.33, K + ROOM.table[0] + 0.55, ROOM.table[1] + 0.33]],
  });
  ctx.views.define({ id: 'p10_room', zone: 'house_int', roam: true, cam: cam([K + 0.2, 1.65, 2.4], [K - 0.2, 1.2, -1], 54), back: 'p10_house' });
  close('p10_stove', cam([K + ROOM.stove[0] + 0.55, 1.55, ROOM.stove[1] + 1.35], [K + ROOM.stove[0] + 0.1, 0.75, ROOM.stove[1]], 48), 'p10_room', 'house_int');
  close('p10_table', cam([K + ROOM.table[0], 1.55, ROOM.table[1] + 0.85], [K + ROOM.table[0], 0.75, ROOM.table[1] - 0.05], 46), 'p10_room', 'house_int');
  close('p10_paintings', cam([K + 0.95, 1.6, 0.35], [K + 0.95, 1.58, -1.6], 48), 'p10_room', 'house_int');

  // 井下
  const C = CRYPT, bz = C.backZ, sx = C.sideX, F = C.front, B = C.back, S = C.side;
  const nicheCircles = C.niches.map(([x, z]) => [UX + x, bz + z, 0.42]);
  const eg = [UX + sx + C.eagle[0], bz + C.eagle[1]];
  ctx.views.defineRoamArea('p10_under', {
    bounds: [UX - B.w / 2, bz - B.d / 2, UX + sx + S.w / 2, F.d / 2], eye: 1.6,
    circles: [[UX + C.ladder[0], C.ladder[1], 0.3], ...nicheCircles, [UX + sx + 0.1, bz - 1.05, 0.3], [UX + sx + 0.1, bz + 1.05, 0.25]],
    boxes: [
      [UX - B.w / 2 - 0.2, -F.d / 2 - C.gap, UX - F.w / 2, F.d / 2 + 0.2],
      [UX + F.w / 2, -F.d / 2 - C.gap, UX + sx + S.w / 2 + 0.2, F.d / 2 + 0.2],
      [UX - F.w / 2, -F.d / 2 - C.gap, UX - C.door.w / 2, -F.d / 2], [UX + C.door.w / 2, -F.d / 2 - C.gap, UX + F.w / 2, -F.d / 2],
      [UX + B.w / 2, bz - B.d / 2 - 0.2, UX + B.w / 2 + C.gap, bz - C.door.w / 2], [UX + B.w / 2, bz + C.door.w / 2, UX + B.w / 2 + C.gap, bz + B.d / 2],
      [UX + B.w / 2 + C.gap, bz - B.d / 2 - 0.2, UX + sx + S.w / 2 + 0.2, bz - S.d / 2], [UX + B.w / 2 + C.gap, bz + S.d / 2, UX + sx + S.w / 2 + 0.2, bz + B.d / 2],
      [eg[0] - 0.7, eg[1] - 0.46, eg[0] + 0.5, eg[1] + 0.46],
    ],
  });
  ctx.views.define({ id: 'p10_under', zone: 'p10_under', roam: true, ambience: 'interior', cam: cam([UX + 0.3, 1.6, 0.9], [UX, 1.45, -2.0], 56), back: 'p10_clearing' });
  close('p10_letters', cam([UX, 1.42, -F.d / 2 + 0.85], [UX, 1.36, -F.d / 2], 40), 'p10_under', 'p10_under', null, { ambience: 'interior' });
  close('p10_masks_l', cam([UX + 0.4, 1.55, bz], [UX - B.w / 2, 1.0, bz], 62), 'p10_under', 'p10_under', null, { ambience: 'interior' });
  close('p10_masks_r', cam([UX - 0.4, 1.55, bz], [UX + B.w / 2, 1.0, bz], 62), 'p10_under', 'p10_under', null, { ambience: 'interior' });
  close('p10_masks_b', cam([UX, 1.6, bz + 0.6], [UX, 1.0, bz - B.d / 2], 50), 'p10_under', 'p10_under', null, { ambience: 'interior' });
  close('p10_eagle', cam([UX + sx - 1.85, 1.65, bz + 0.1], [UX + sx + 1.2, 1.2, bz], 66), 'p10_under', 'p10_under', null, { ambience: 'interior' });
  ctx.views.define({ id: 'p10_hex', zone: 'p10_under', closeup: true, look: 0, back: 'p10_eagle', ambience: 'interior', onEnter: () => ctx.hintOnce('p10_hex_hint', T.hexHint), cam: () => {
    const hb = W.crypt.userData.hexBase; hb.updateWorldMatrix(true, false);
    return cam(hb.localToWorld(new THREE.Vector3(0, 0, 0.72)).toArray(), hb.localToWorld(new THREE.Vector3(0, 0, 0)).toArray(), 46);
  } });

  // 神殿和幻象
  close('p10_temple_int', cam([400, 2.4, 4.2], [400, 1.5, -0.4], 54), 'p10_temple', 'temple_int');
  close('p10_altar', cam([400, 2.4, 3.5], [400, 1.5, -0.4], 46), 'p10_temple_int', 'temple_int');
  ctx.views.define({ id: 'p10_vision', zone: 'p10_vision', closeup: true, fixed: true, look: 0, cam: cam([VX, 1.6, 0.6], [VX, 1.7, -5], 62) });
}

export async function setup(ctx) {
  W.ctx = ctx; W.zones = {}; W.rigs = {};
  const { exterior: ext, house_int: house, temple_int: temple } = ctx.world.zones;
  clearUnusedColliders(ctx);
  clearDoorBoulder(ctx);
  duskScene(ctx, ext);

  // 天堂门开着
  place(ctx, 'gate', 'paradise_gate', ext, P.gate.pos);
  W.gate.openDoors({ instant: true });
  woodOwl(ctx, ext);
  setupTower(ctx, ext);
  setupIsland(ctx, ext, house);
  setupFamily(ctx, ext, house);
  setupUnder(ctx);
  setupTemple(ctx, temple);
  // 小屋：门敞开（同第五灾）
  place(ctx, 'shed', 'shed_door', ext, P.shedDoor.pos);
  for (const name of ['shed_doors', 'padlock', 'shed_bolt']) W.shed.getObjectByName(name).visible = false;
  // 结尾的红色幻象
  const vision = zone(ctx, 'p10_vision');
  place(ctx, 'vision', 'p10_vision', vision, [VX, 0, 0]);

  defineViews(ctx);
  ctx.world.colliders.circles.push(
    [...SPOT.stump, 0.5], [...SPOT.gerard, 0.32], [...SPOT.david, 0.3], [...SPOT.birch, 0.2], [...SPOT.nicholas, 0.3], [...SPOT.drum, 0.42],
    [...SPOT.ida, 0.3], [...SPOT.hen, 0.4], [...SPOT.well, 0.85], ...FAMILY.map((p) => [...SPOT.torch[p], 0.25]),
    ...W.gateTorches.map((t) => [t.position.x, t.position.z, 0.25]),
  );
  // 木头猫头鹰：身体挡住；栅门关着时栅栏里面进不去，开了以后从门缝进
  ctx.views.addRoamGate((x, z) => {
    const dx = x - W.owlCenter[0], dz = z - W.owlCenter[1], d = Math.hypot(dx, dz);
    if (d > WOOD_OWL.gateR + 0.35) return false;
    if (d < WOOD_OWL.bodyR + 0.15) return true;
    // 栅门开了以后栅栏里站着戴面具的五个人
    if (ctx.flag('owl_gate_open') && Object.values(OWL_SPOTS).some(([lx, lz]) => { const [px, pz] = owlLocal(lx, lz); return Math.hypot(x - px, z - pz) < 0.35; })) return true;
    let a = Math.atan2(dx, dz) - W.owlRot; a = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(a) > 1.02) return false;
    if (!ctx.flag('owl_gate_open')) return true;
    return d > WOOD_OWL.gateR - 0.35 && Math.abs(a) > 0.1;
  });

  const hs = (id, views, object, rest = {}) => ctx.hotspots.define({ id, views, object, cursor: 'zoom', ...rest });
  const proxy = (size, pos, parent) => ctx.hotspots.makeProxy(...size, pos, parent);
  hs('p10_overview_island', ['p10_overview'], proxy([40, 9, 6], [0, 3.6, 43], ext), { goto: 'p10_gate' });
  hs('p10_owl_zoom', ['p10_forest'], W.stump.getObjectByName('stump'), { goto: 'p10_owl' });
  hs('p10_pellet_zoom', ['p10_owl'], proxy([0.5, 0.12, 0.4], [SPOT.stump[0], W.stump.position.y + 0.6, SPOT.stump[1] + 0.05], ext), { when: () => !!ctx.flag('owl_fed'), goto: 'p10_pellet' });
  hs('p10_drum_zoom', ['p10_tower'], W.drum, { goto: 'p10_drum' });
  hs('p10_tell_zoom', ['p10_tower'], W.birch, { goto: 'p10_tell' });
  hs('p10_well', ['p10_clearing'], W.well.userData.hit, { cursor: 'pointer', goto: 'p10_under' });
  hs('p10_house_entry', ['p10_house'], proxy([2.0, 2.3, 0.45], [3, 1.65, -11.35], ext), { goto: 'p10_room' });
  hs('p10_room_exit', ['p10_room'], proxy([1.2, 2.25, 0.3], [K, 1.15, 2.85], house), { goto: 'p10_house' });
  hs('p10_stove_zoom', ['p10_room'], W.stove, { goto: 'p10_stove' });
  hs('p10_table_zoom', ['p10_room'], W.table, { goto: 'p10_table' });
  hs('p10_paintings_zoom', ['p10_room'], W.maskPainting, { goto: 'p10_paintings' });
  hs('p10_paintings_zoom2', ['p10_room'], W.owlPainting, { goto: 'p10_paintings' });
  hs('p10_ladder', ['p10_under'], W.crypt.userData.ladder, { cursor: 'pointer', goto: 'p10_clearing' });
  hs('p10_letters_zoom', ['p10_under'], W.crypt.userData.letterDoor, { when: () => !ctx.flag('letter_door_open'), goto: 'p10_letters' });
  hs('p10_eagle_zoom', ['p10_under'], W.crypt.userData.eagle, { when: () => !!ctx.flag('letter_door_open'), goto: 'p10_eagle' });
  hs('p10_hex_zoom', ['p10_eagle'], W.crypt.userData.hexBase.getObjectByName('hex_slab'), { when: () => !ctx.flag('hex_done'), goto: 'p10_hex' });
  hs('p10_temple_entry', ['p10_temple'], W.owl.userData.door, { cursor: 'pointer', when: () => !!ctx.flag('owl_gate_open'), goto: 'p10_temple_int' });
  hs('p10_altar_entry', ['p10_temple_int'], W.holder, { goto: 'p10_altar' });
  hs('p10_font_entry', ['p10_temple_int'], W.font, { goto: 'p10_altar' });
}

/** 戴上面具的人：真身藏起来、动物头模型出现在同一个地方；五个都戴上以后站到木头猫头鹰的栅栏里。 */
function syncFamily(ctx) {
  const masked = ctx.flag('masked') || [], gateOpen = !!ctx.flag('owl_gate_open'), ext = ctx.world.zones.exterior;
  for (const p of FAMILY) {
    const on = masked.includes(p), plain = W.rigs[p], alt = W.masked[p];
    W.torches[p].setState({ lit: on });
    const show = alt && on ? alt : plain;
    if (alt) { plain.root.visible = !on; alt.root.visible = on; }
    const home = W.home[p];
    if (gateOpen) {
      const [lx, lz] = OWL_SPOTS[p];
      if (show.root.parent !== ext) ext.add(show.root);
      show.root.position.fromArray(at(...owlLocal(lx, lz))); show.root.rotation.y = W.owlRot + Math.atan2(lx, lz) * 0.5;
      if (p === 'margaret') show.setPose('stand');
    } else {
      if (show.root.parent !== home.parent) home.parent.add(show.root);
      show.root.position.copy(home.pos); show.root.rotation.y = home.rotY;
      if (p === 'margaret') show.setPose('sit');
    }
  }
}

export function sync(ctx) {
  if (!W.ctx) return;
  const f = (k) => ctx.flag(k);
  ctx.world.lake.setBlood(0); ctx.world.lake.setPool(false);
  // 树林路口
  W.stump.setState({ feather: !f('feather_taken'), fed: !!f('owl_fed'), rots: f('bones_rot') || BONES_START, owl: true });
  // 塔下
  W.boneString.setState({ tip: f('bone_taken') ? 'none' : f('bone_dropped') ? 'ground' : 'hang', ground: W.boneString.userData.ground });
  W.headApple.visible = !!f('apple_on_head') && !f('apple_shot');
  W.pinned.visible = !!f('apple_shot');
  if (f('apple_shot')) {
    W.flyArrow.position.copy(W.pinnedAt.arrow); W.flyApple.position.copy(W.pinnedAt.apple);
  }
  W.worm.visible = !!f('apple_shot') && !f('worm_taken');
  // 空地
  W.facePaint.setFace(Array.isArray(f('face')) ? f('face') : FACE_START);
  W.facePaint.visible = Array.isArray(f('face'));
  W.idaCandle.visible = !!f('face_done') && !f('candle_taken');
  W.hen.setState({ worm: false, egg: !!f('hen_fed') && !f('egg_taken') });
  // 木屋
  W.shaft.visible = !f('shaft_taken'); W.brush.visible = !f('brush_taken'); W.apple.visible = !f('apple_taken');
  W.stove.setState({ lit: !!f('stove_lit'), egg: !!f('egg_in_pan') && !f('chick_hatched'), chick: !!f('chick_hatched') && !f('chick_taken'), shell: !!f('chick_hatched') });
  // 井下
  const taken = f('masks_taken') || [];
  for (const [item, m] of Object.entries(W.masks)) m.visible = !taken.includes(item);
  W.crypt.setState({ letters: f('letters') || LETTERS_START, open: !!f('letter_door_open'), hex: f('hex') || HEX_START, solved: !!f('hex_done'), cube: !!f('hex_done') && !f('cube_taken') });
  W.rigs.shadow.root.visible = !!f('hex_done'); W.rigs.elizabeth.root.visible = !!f('hex_done');
  // 家人、火炬、木头猫头鹰
  syncFamily(ctx);
  const awake = !!f('owl_gate_open');
  W.owl.setState({ eyes: awake, open: awake });
  W.gateTorches.forEach((t) => t.setState({ lit: awake }));
  // 神殿
  if (W.holder.userData.state.cube && !f('holder_cube')) replaceTempleProp(ctx, 'holder');
  if (W.font.userData.state.lit && !f('font_lit')) replaceTempleProp(ctx, 'font');
  if (f('holder_open') && !f('holder_closed')) W.holder.open({ instant: true });
  else W.holder.close({ instant: true });
  if (f('holder_cube')) W.holder.insertCube({ instant: true });
  const distance = (f('holder_lowered') ? 0.8 : 0) - W.holder.userData.state.lowered;
  if (Math.abs(distance) > 0.001) W.holder.lower(distance, { instant: true });
  if (f('reflection_seen') && !f('font_lit')) W.font.showReflection({ instant: true });
  else W.font.hideReflection({ instant: true });
  if (f('font_lit')) W.font.ignite({ instant: true });
  const rope = ctx.world.root.getObjectByName('temple_int_rope');
  rope?.setBottom(W.holder.position.y - W.holder.userData.state.lowered * W.holder.scale.y);
  W.templeFire.visible = !!f('font_lit');
  W.vision.setState({ shown: f('vision_seen') ? 8 : 0, owl: !!f('vision_seen') });
}

// 吊架 / 圣水盆的过场是不可逆的：读档回到更早的状态时重建一个新的
function replaceTempleProp(ctx, id) {
  const old = W[id];
  let model;
  if (id === 'holder') { model = makeProp('winged_holder'); model.getObjectByName('holder_rope').removeFromParent(); }
  else model = makeFont();
  place(ctx, id, model, old.parent, old.position.toArray(), { scale: old.scale.x });
  old.removeFromParent();
  old.traverse((o) => { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach((m) => m.dispose()); });
  for (const hs of ctx.hotspots.all()) if (hs.object === old) hs.object = W[id];
}

export { MASK_OF };
