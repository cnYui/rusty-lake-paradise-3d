// 第八灾：同一座岛，门外是薄雾，进门以后整座岛笼罩在浓雾里（fogController 每帧按相机位置调 world 的白雾）。
// 布局沿用第五到七灾；模型显示始终由存档状态推导。
import * as THREE from 'three';
import { makeProp } from '../../art/props.js';
import { makePerson } from '../../art/cast_mock.js';
import { makeAnimal } from '../../art/characters.js';
import { P, SETS, PALISADE, LAKE_Y } from '../../art/layout.js';
import { BUILDING_DIMS } from '../../art/buildings.js';
import { groundHeight } from '../../art/island.js';
import { flat } from '../../art/materials.js';
import { BOX_START } from './rules.js';
import { T } from './text.js';

export const W = {};
const K = SETS.house_int.origin[0];
const M = 700;   // 回忆舞台的原点 x（离岛和其它布景都很远，只在 p8_memory 区域里显示）
const cam = (pos, target, fov = 48) => ({ pos, target, fov });
const wpos = (ctx, name) => ctx.world.anchor(name).getWorldPosition(new THREE.Vector3()).toArray();
const at = (x, z, dy = 0) => [x, groundHeight(x, z) + dy, z];
const V = (a) => new THREE.Vector3(...a);

// 雾：门外是薄雾（world 白雾 0.6），进门以后是浓雾（白雾 1：近 1 m、远 18 m）；“看穿”时远处拉到 70 m
export const FOG = { outside: 0.6, near: 1.0, far: 18, sightFar: 70 };

// 各个东西的位置（世界 x, z）
export const SPOT = {
  musicians: [[1.7, 42.6], [2.65, 42.85], [3.6, 42.6]],
  box: [-0.9, 43.5], score: [0.5, 44.0],
  grasshopper: [0.8, 27.2], shadow: [-4.0, 28.4], chorus: [-5.2, 22.0], egg: [-5.1, 22.5], owlTree: [5.6, 21.4],
  goat: [15.0, 6.0], eyeTree2: [17.6, 4.4], dig: [16.4, 8.2],
  lantern: [5.6, -10.7], eyeTree1: [0.4, -8.4],
  boat: [22.0, -41.8],
};
// 螳螂：孵出来以后在雾里待的地方（按进度换），每段过场从 from 走到 strike 出手
export const MANTIS = {
  hatch: [-5.2, 17.0], idle2: [10.5, 14.5], idle3: [16.5, -31.5],
  goat: { from: [9.5, 0.5], strike: [13.2, 4.6] },
  owl: { from: [4.4, 13.0], strike: [4.6, 19.6] },
  boat: { from: [15.0, -43.5], strike: [20.0, -42.4], water: true },
};
export const mantisPos = ([x, z], water = false) => (water ? [x, LAKE_Y, z] : at(x, z));
const MUSICIANS_MOCK = ['musician_fat', 'musician_feather', 'musician_old'];   // I / II / III：Gerard、David、Nicholas（抱着曼陀林的网格模型）

// 屋里的布置（相对 house_int 原点；后墙 z = -1.6，前墙门洞 z = 3.0）
export const ROOM = { seer: [0.9, -0.75], wall: [-0.6, 1.55, -1.585], shovel: [-1.9, -1.42] };

function place(ctx, id, model, parent, pos, { scale = 1, rotY = 0 } = {}) {
  const object = typeof model === 'string' ? makeProp(model) : model;
  object.position.fromArray(pos); object.rotation.y = rotY; object.scale.setScalar(scale);
  parent.add(object); W[id] = object;
  if (object.update) ctx.register('prop', `p8_${id}`, object);
  return object;
}

function person(ctx, id, mockId, parent, pos, rotY = 0) {
  const rig = makePerson(mockId);
  rig.root.position.fromArray(pos); rig.root.rotation.y = rotY; parent.add(rig.root);
  ctx.register('char', `p8_${id}`, rig);
  W[id] = rig.root; W[`${id}Rig`] = rig;
  return rig;
}

function zone(ctx, id, origin, sky = '#d9dedc') {
  const g = new THREE.Group(); g.name = `zone_${id}`;
  g.add(new THREE.HemisphereLight('#f4f4f0', '#7a8288', 1.7));
  const key = new THREE.DirectionalLight('#ffffff', 1.2); key.position.set(origin[0] + 4, 8, origin[2] + 6); key.target.position.fromArray(origin);
  g.add(key, key.target);
  const back = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 8), new THREE.MeshBasicMaterial({ color: sky, side: THREE.BackSide }));
  back.material.userData.outlineParameters = { visible: false }; back.position.fromArray(origin); g.add(back);
  ctx.world.root.add(g); ctx.views.registerZone(id, g);
  W.zones[id] = g;
  return g;
}

function clearUnusedColliders(ctx) {
  const col = ctx.world.colliders;
  const near = (x, z, p) => Math.hypot(x - p.pos[0], z - p.pos[2]) < 0.08;
  col.circles = col.circles.filter(([x, z, r]) => ![[P.pump, 0.45], [P.owlTotem, 0.6], [P.margaret, 0.55], [P.bucket, 0.3]]
    .some(([p, radius]) => near(x, z, p) && Math.abs(r - radius) < 0.001));
  col.segments = col.segments.filter(([ax, az, bx, bz, r]) => !((near((ax + bx) / 2, (az + bz) / 2, P.rowboat) && Math.abs(r - 0.62) < 0.001)
    || (near((ax + bx) / 2, (az + bz) / 2, P.goat) && Math.abs(r - 0.3) < 0.001)));
}

function makeFont() {
  const font = makeProp('font'), water = font.getObjectByName('font_liquid').material.uniforms;
  for (const [key, color] of Object.entries({ uRedDark: '#4b5957', uRedMid: '#778783', uRedLight: '#a0b0a8', uGreyDark: '#4b5957', uGreyLight: '#a0b0a8' })) water[key].value.set(color);
  font.userData.state.ambient = false;
  for (let i = 0; i < 4; i++) font.getObjectByName(`font_drop_${i}`).material.color.set('#8b9e99');
  return font;
}

function makeHolder() {
  const holder = makeProp('winged_holder');
  holder.getObjectByName('holder_rope').removeFromParent();
  return holder;
}

function replaceTempleProp(ctx, id, model) {
  const old = W[id];
  if (id === 'font') W.painting.removeFromParent();
  place(ctx, id, model, old.parent, old.position.toArray(), { scale: old.scale.x });
  old.removeFromParent();
  old.traverse((o) => { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach((m) => m.dispose()); });
  for (const hs of ctx.hotspots.all()) if (hs.object === old) hs.object = W[id];
  if (id === 'font') W.font.getObjectByName('font_niche').add(W.painting);
}

// ---- 浓雾：在 world.update 之后每帧按相机位置设 world 的白雾（门外薄、门里浓）；sight 0..1 是“看穿”时把雾推远 ----
function fogController(ctx) {
  const fs = ctx.world.sky.fogState;
  // 第一灾林间小路缺口里的“黑暗卡片”不吃雾，浓雾里会变成一块黑幕；island.update 每帧按相机位置显示它，这里每帧再藏起来
  const gap = ctx.world.root.getObjectByName('forest_path_dark');
  fs.whiteNear = FOG.near; fs.whiteFar = FOG.far;
  let amount = null;
  const ctl = {
    sight: 0,
    get amount() { return amount; },
    update(dt) {
      const p = ctx.engine.camera?.position;
      if (!p) return;
      const k = Math.min(1, Math.max(0, (PALISADE.z + 2.5 - p.z) / 4));   // 0 门外 … 1 进门
      const inside = k * k * (3 - 2 * k), target = FOG.outside + (1 - FOG.outside) * inside;
      amount = amount === null || dt > 0.4 ? target : amount + (target - amount) * Math.min(1, dt * 3);
      fs.whiteFar = FOG.far + (FOG.sightFar - FOG.far) * ctl.sight;
      ctx.world.setFog(amount);
      if (gap) gap.visible = false;
    },
  };
  ctx.register('prop', 'p8_fog', ctl);
  return ctl;
}

function defineViews(ctx) {
  const view = (id, pose, rest = {}) => ctx.views.define({ id, zone: 'exterior', cam: pose, ...rest });
  const close = (id, pose, back, area = 'exterior', onEnter = null) => ctx.views.define({ id, zone: area, closeup: true, look: 0, cam: pose, back, ...(onEnter ? { onEnter } : {}) });
  view('p8_overview', cam(P.overviewCam.pos, P.overviewCam.target, P.overviewCam.fov), { fixed: true });
  view('p8_gate', cam([1.6, 2.1, 47.3], [1.4, 1.5, 40.5], 52), { back: 'p8_overview', up: () => (ctx.flag('gate_open') ? 'p8_forest' : null), onEnter: () => ctx.hintOnce('p8_roam', ctx.ui.touchMode ? T.roamTouch : T.roam) });
  view('p8_forest', cam([0.6, 2.0, 33.4], [-0.6, 1.4, 25]), { back: 'p8_gate', up: 'p8_grove' });
  view('p8_grove', cam([15.5, 2.0, 12.5], [16, 1.2, 5.5]), { back: 'p8_forest', up: 'p8_house' });
  view('p8_house', cam([4.5, 2.2, -3.0], [3, 1.5, -11]), { back: 'p8_grove', right: 'p8_shed' });
  view('p8_shed', cam([17.5, 2.2, -7], [17.5, 1.6, -13]), { left: 'p8_house', up: 'p8_lake' });
  view('p8_lake', cam([21.6, 2.1, -33.0], [22.0, 0.9, -41.5]), { back: 'p8_shed', right: 'p8_temple' });
  const door = wpos(ctx, 'temple.door');
  view('p8_temple', cam([24.6, 2.5, -27.7], [door[0], 1.9, door[2]], 52), { left: 'p8_lake', up: 'p8_temple_int' });

  const [bx, by, bz] = W.box.position.toArray();
  close('p8_box', cam([bx, by + 0.6, bz + 0.42], [bx, by + 0.08, bz + 0.01], 48), 'p8_gate', 'exterior', () => ctx.hintOnce('p8_box_hint', T.boxHint));
  close('p8_score', () => {
    const sheet = W.score.userData.sheet; sheet.updateWorldMatrix(true, false);
    const p = sheet.getWorldPosition(new THREE.Vector3()), n = new THREE.Vector3(0, 0, 1).transformDirection(sheet.matrixWorld);
    return cam(p.clone().addScaledVector(n, 0.72).toArray(), p.toArray(), 40);
  }, 'p8_gate');
  const [cx, cy, cz] = W.chorus.position.toArray();
  close('p8_locusts', cam([cx, cy + 1.85, cz + 4.6], [cx, cy + 1.7, cz], 50), 'p8_forest', 'exterior', () => ctx.hintOnce('p8_chorus_hint', T.chorusHint));
  close('p8_owl', () => {
    W.owlTree.updateWorldMatrix(true, false);
    return cam(W.owlTree.localToWorld(V([-0.95, 1.75, 5.6])).toArray(), W.owlTree.localToWorld(V([-1.1, 1.75, 0.4])).toArray(), 50);
  }, 'p8_forest');
  const [gx, gy, gz] = W.goat.position.toArray();
  close('p8_goat', cam([gx + 0.3, gy + 1.5, gz + 3.0], [gx, gy + 0.45, gz], 46), 'p8_grove');
  const [dx, dy, dz] = W.dig.position.toArray();
  close('p8_dig', cam([dx, dy + 1.7, dz + 0.9], [dx, dy + 0.05, dz], 46), 'p8_grove');
  const lamp = W.lantern.localToWorld(V([0.55, 1.7, 0]));
  close('p8_lantern', cam([lamp.x - 0.2, lamp.y + 0.1, lamp.z + 2.1], lamp.toArray(), 46), 'p8_house');
  const [ox, oy, oz] = W.boat.position.toArray();
  close('p8_boat', cam([ox, oy + 1.5, oz + 4.4], [ox, oy + 0.5, oz], 46), 'p8_lake');
  close('p8_memory', cam([M + 0.3, 1.55, 3.4], [M, 0.6, 0], 46), 'p8_boat', 'p8_memory');

  const hd = BUILDING_DIMS.house_int;
  ctx.views.defineRoamArea('house_int', {
    bounds: [K - hd.width / 2, hd.wallZ, K + hd.width / 2, hd.wallZ + hd.depth], eye: 1.65,
    circles: [[K + ROOM.seer[0], ROOM.seer[1], 0.38]],
  });
  ctx.views.define({ id: 'p8_room', zone: 'house_int', roam: true, cam: cam([K, 1.65, 2.4], [K, 1.3, -1], 52), back: 'p8_house' });
  close('p8_seer', cam([K + ROOM.seer[0] - 0.25, 1.5, ROOM.seer[1] + 1.45], [K + ROOM.seer[0], 1.4, ROOM.seer[1]], 44), 'p8_room', 'house_int');
  close('p8_temple_int', cam([400, 2.4, 4.2], [400, 1.5, -0.4], 54), 'p8_temple', 'temple_int');
  close('p8_altar', cam([400, 2.4, 3.5], [400, 1.5, -0.4], 46), 'p8_temple_int', 'temple_int');
  ctx.views.define({ id: 'p8_painting', zone: 'temple_int', closeup: true, look: 0, back: 'p8_altar', cam: () => {
    W.painting.updateWorldMatrix(true, false);
    const p = W.painting.getWorldPosition(new THREE.Vector3());
    return cam([p.x, p.y + 0.21, p.z + 0.82], [p.x, p.y + 0.21, p.z], 39);
  } });
}

export async function setup(ctx) {
  W.ctx = ctx; W.zones = {};
  const { exterior: ext, house_int: house, temple_int: temple } = ctx.world.zones;
  clearUnusedColliders(ctx);
  W.fog = fogController(ctx);
  // 湖水压暗一点，雾里才分得清水面和天（湖面材质是共用的，一页只装载一章，不影响别的章）
  ctx.world.root.traverse((o) => { const u = o.material?.uniforms; if (u?.cLakeNear) { u.cLakeNear.value.set('#7f8b8f'); u.cLake.value.set('#8f999c'); u.cSkyRefl.value.set('#c9d2d4'); } });

  // ---- 门外：被木板钉死的天堂门、三个弹曼陀林的乐手、乐谱架、木盒 ----
  place(ctx, 'gate', 'paradise_gate', ext, P.gate.pos);
  place(ctx, 'boards', 'p8_boards', ext, P.gate.pos);
  ctx.views.addRoamGate((x, z) => !ctx.flag('gate_open') && z < PALISADE.z + 0.6);
  W.musicianRigs = MUSICIANS_MOCK.map((id, i) => {
    const rig = person(ctx, `musician${i}`, id, ext, at(...SPOT.musicians[i]), 0.12 - i * 0.12);
    if (!rig.holdsLute) holdMandolin(rig, i);   // 网格乐手自己抱着琴（musician_model.js），没有模型时才挂程序化的琴
    return rig;
  });
  place(ctx, 'score', 'p8_score', ext, at(...SPOT.score), { rotY: 0.15 });
  place(ctx, 'box', 'p8_box', ext, at(...SPOT.box));

  // ---- 雾林：蚱蜢、五棵趴着蝗虫的树、卵鞘、黑影、猫头鹰树、巨型螳螂 ----
  place(ctx, 'grasshopper', 'p8_grasshopper', ext, at(...SPOT.grasshopper));
  W.grasshopperHome = W.grasshopper.position.toArray();
  place(ctx, 'chorus', 'p8_locust_trees', ext, at(...SPOT.chorus));
  place(ctx, 'egg', 'p8_egg', ext, at(...SPOT.egg));
  person(ctx, 'shadow', 'shadow', ext, at(...SPOT.shadow), 0.5);
  place(ctx, 'owlTree', 'p8_owl_tree', ext, at(...SPOT.owlTree));
  place(ctx, 'mantis', 'p8_mantis', ext, mantisPos(MANTIS.hatch));

  // ---- 白桦林：山羊（之后是骨头）、刻着眼睛的树、地上的圈 ----
  for (const [x, z, seed] of [[12.6, 3.0, 3], [20.4, 7.8, 5], [13.2, 9.8, 7], [20.8, 2.6, 9], [11.4, 6.4, 11]]) {
    const b = makeProp('p3_birch', { height: 7.5, seed, leaves: false }); b.position.fromArray(at(x, z)); ext.add(b);
  }
  const goat = makeAnimal('goat'); goat.root.position.fromArray(at(...SPOT.goat)); goat.root.rotation.y = Math.PI / 2;
  ext.add(goat.root); ctx.register('char', 'p8_goat', goat); W.goat = goat.root; W.goatRig = goat;
  place(ctx, 'bones', 'p8_bones', ext, at(...SPOT.goat, 0.01), { rotY: Math.PI / 2 });
  place(ctx, 'dig', 'p8_dig', ext, at(...SPOT.dig));
  place(ctx, 'eyeTree2', 'p8_eye_tree', ext, at(...SPOT.eyeTree2), { rotY: -0.25 });

  // ---- 木屋外：灯和蛾群、刻着眼睛的树；木屋里：白墙红字、红发女人、铲子 ----
  place(ctx, 'lantern', 'p8_lantern', ext, at(...SPOT.lantern));
  place(ctx, 'eyeTree1', 'p8_eye_tree', ext, at(...SPOT.eyeTree1), { rotY: 0.65 });
  place(ctx, 'wall', 'p8_wall_text', house, [K + ROOM.wall[0], ROOM.wall[1], ROOM.wall[2]]);
  person(ctx, 'seer', 'seer', house, [K + ROOM.seer[0], 0, ROOM.seer[1]], -0.2);
  const sh = place(ctx, 'shovel', 'p8_shovel', house, [K + ROOM.shovel[0], 0, ROOM.shovel[1]], { rotY: 0.4 }); sh.rotation.x = -0.18;

  // ---- 湖边：小船上的老奶奶；她被带走后船上浮着黑方块 ----
  place(ctx, 'boat', 'p8_boat', ext, [SPOT.boat[0], LAKE_Y + 0.4, SPOT.boat[1]]);
  person(ctx, 'grandma', 'margaret', W.boat.userData.rig, [0, -0.53, -0.62]).setPose('sit');
  place(ctx, 'boatCube', 'black_cube', W.boat.userData.rig, [0, 1.15, 0], { scale: 1.6 });

  // ---- 回忆（独立区域）：小船上的少年 Jakob 和母亲 ----
  const mem = zone(ctx, 'p8_memory', [M, 0, 0]);
  const water = new THREE.Mesh(new THREE.CircleGeometry(28, 40), flat('#b7c4c6')); water.rotation.x = -Math.PI / 2; water.position.set(M, 0, 0); mem.add(water);
  place(ctx, 'memBoat', 'p8_boat', mem, [M, 0.3, 0], { rotY: Math.PI / 2 });
  person(ctx, 'memJakob', 'jakob_child', W.memBoat.userData.rig, [0, -0.53, 0.55], Math.PI).setPose('sit');
  person(ctx, 'memMother', 'mother', W.memBoat.userData.rig, [0, -0.53, -0.62]).setPose('sit');
  place(ctx, 'memCube', 'black_cube', mem, [M, 1.45, 0], { scale: 1.6 });

  // ---- 神殿：吊架 / 圣水盆 / 画 ----
  place(ctx, 'holder', makeHolder(), temple, wpos(ctx, 'temple_int.holder'), { scale: 1.4 });
  place(ctx, 'font', makeFont(), temple, wpos(ctx, 'temple_int.font'));
  place(ctx, 'painting', 'p8_painting', W.font.getObjectByName('font_niche'), [0, 0, 0.012], { scale: 0.82 });

  // ---- 小屋：门敞开（同第五灾）----
  place(ctx, 'shed', 'shed_door', ext, P.shedDoor.pos);
  for (const name of ['shed_doors', 'padlock', 'shed_bolt']) W.shed.getObjectByName(name).visible = false;

  defineViews(ctx);
  const chorusX = (i) => SPOT.chorus[0] + (i - 2) * 1.4;
  ctx.world.colliders.circles.push(
    ...SPOT.musicians.map(([x, z]) => [x, z, 0.32]), [...SPOT.box, 0.42], [...SPOT.score, 0.3],
    [SPOT.grasshopper[0], SPOT.grasshopper[1] - 0.1, 0.75], [...SPOT.shadow, 0.3], [...SPOT.owlTree, 0.38],
    ...[0, 1, 2, 3, 4].map((i) => [chorusX(i), SPOT.chorus[1], 0.36]),
    [...SPOT.goat, 0.6], [...SPOT.eyeTree2, 0.45], [...SPOT.eyeTree1, 0.45], [...SPOT.lantern, 0.15],
  );

  const hs = (id, views, object, rest = {}) => ctx.hotspots.define({ id, views, object, cursor: 'zoom', ...rest });
  const proxy = (size, pos, parent) => ctx.hotspots.makeProxy(...size, pos, parent);
  hs('p8_overview_island', ['p8_overview'], proxy([40, 9, 6], [0, 3.6, 43], ext), { goto: 'p8_gate' });
  hs('p8_box_zoom', ['p8_gate'], W.box, { goto: 'p8_box' });
  hs('p8_score_zoom', ['p8_gate'], W.score, { goto: 'p8_score' });
  hs('p8_locusts_zoom', ['p8_forest'], W.chorus, { when: () => !ctx.flag('mantis_awake'), goto: 'p8_locusts' });
  hs('p8_owl_zoom', ['p8_forest'], W.owlTree, { goto: 'p8_owl' });
  hs('p8_goat_zoom', ['p8_grove'], proxy([2.0, 1.4, 2.0], at(SPOT.goat[0], SPOT.goat[1], 0.7), ext), { goto: 'p8_goat' });
  hs('p8_dig_zoom', ['p8_grove'], proxy([1.3, 0.6, 1.3], at(SPOT.dig[0], SPOT.dig[1], 0.25), ext), { when: () => !!ctx.flag('dig_revealed'), goto: 'p8_dig' });
  hs('p8_lantern_zoom', ['p8_house'], W.lantern, { goto: 'p8_lantern' });
  hs('p8_house_entry', ['p8_house'], proxy([2.0, 2.3, 0.45], [3, 1.65, -11.35], ext), { goto: 'p8_room' });
  hs('p8_room_exit', ['p8_room'], proxy([1.2, 2.25, 0.3], [K, 1.15, 2.85], house), { goto: 'p8_house' });
  hs('p8_seer_zoom', ['p8_room'], W.seerRig.parts.body, { goto: 'p8_seer' });
  hs('p8_boat_zoom', ['p8_lake'], W.boat, { goto: 'p8_boat' });
  const door = wpos(ctx, 'temple.door');
  const entrance = proxy([1.65, 2.5, 0.4], [door[0], door[1] + 1.2, door[2]], ext); entrance.rotation.y = P.temple.rotY;
  hs('p8_temple_entry', ['p8_temple'], entrance, { goto: 'p8_temple_int' });
  hs('p8_altar_entry', ['p8_temple_int'], W.holder, { goto: 'p8_altar' });
  hs('p8_font_entry', ['p8_temple_int'], W.font, { goto: 'p8_altar' });
  hs('p8_painting_entry', ['p8_altar'], W.painting, { when: () => !!ctx.flag('font_lit'), goto: 'p8_painting' });
}

/** 抱着曼陀林（原作 0:08）：琴身斜挂在肚子前、琴颈朝左上；左手按琴颈，右手在琴身上拨弦（每帧小幅摆动前臂）。 */
function holdMandolin(rig, i) {
  const m = makeProp('p8_mandolin'); m.name = 'p8_mandolin_held';
  m.position.set(-0.03, rig.Y.waist + 0.03, i === 0 ? 0.26 : 0.18); m.rotation.set(0.15, 0, -0.9);   // Gerard 有啤酒肚，琴离身体远一点
  rig.root.add(m); m.updateMatrix();
  const onLute = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(m.matrix).toArray();   // 琴的局部坐标 → 人物 root 坐标
  rig.setPose(rig.solve(rig.basePose, {
    R: { pos: onLute(-0.06, -0.05, 0.1), pole: [-1, -0.5, -0.4] },
    L: { pos: onLute(0.03, 0.28, -0.04), pole: [1, -0.6, -0.4] },
  }));
  rig._upd.push((dt, t) => { rig.idle.elbowR[0] += Math.sin(t * 11 + i * 1.3) * 0.08; });
}

/** 船上的奶奶吹号角：号角的吹嘴贴在嘴唇上、朝前方斜上（挂在头骨骼上，跟着头动），右手扶着号身。 */
export function grandmaHorn(on) {
  const rig = W.grandmaRig;
  let horn = rig.joints.head.getObjectByName('p8_fog_horn');
  if (on && !horn) {
    horn = makeProp('p8_fog_horn');
    const t = rig.noseTip || new THREE.Vector3(0, -0.02, rig.dims.headR[2]);
    // noseTip 在网格 Margaret 脸上找到的是眉眼一带，嘴在它下面约 11 cm（第八灾小船特写里核对过）
    horn.position.set(0, t.y - 0.11, t.z - 0.004); horn.rotation.set(-0.08, -Math.PI / 2 - 0.3, 0);   // 号角局部 +X 从吹嘴指向喇叭口
    rig.joints.head.add(horn);
  }
  if (horn) horn.visible = on;
  rig.setPose('sit');
  if (on) { horn.updateMatrixWorld(true); rig.reach('R', rig.jointToRoot(horn, new THREE.Vector3(0.15, 0.04, 0), new THREE.Vector3()).toArray(), { pole: [-1, -0.8, -0.2] }); }
}

// 网格 Ida 脸上两只眼珠的位置（头骨骼局部坐标；2026-11-02 在 p8_seer 特写里用射线量的，比脸面略靠前 4 mm）
const IDA_EYES = [[-0.0427, -0.034, 0.1356], [0.0421, -0.0326, 0.1342]];

/** 红发女人 Ida 的眼睛（原作 4:20 全白、没有瞳孔）：网格贴图上的眼珠是灰的，盖两片白色圆片；拿到羊眼睛后变成金色。 */
function seerEyes(on) {
  const rig = W.seerRig, head = rig.parts.head;
  let g = head.getObjectByName('seer_eyes');
  if (!g) {
    g = new THREE.Group(); g.name = 'seer_eyes';
    const mat = new THREE.MeshBasicMaterial({ color: '#efeee9' }); mat.userData.outlineParameters = { visible: false };
    const z = rig.dims.headR[2] * 0.98;   // 程序化 Ida（模型没加载时）的脸面大约在这里
    const spots = rig.isModel ? IDA_EYES : [[-0.031, 0, z], [0.031, 0, z]];
    for (const p of spots) { const e = new THREE.Mesh(new THREE.CircleGeometry(0.0085, 16), mat); e.name = 'seer_eye'; e.position.fromArray(p); g.add(e); }
    g.userData.mat = mat; head.add(g);
  }
  g.userData.mat.color.set(on ? '#e0a83a' : '#efeee9');
}

export function sync(ctx) {
  if (!W.ctx) return;
  const f = (k) => ctx.flag(k);
  ctx.world.lake.setBlood(0); ctx.world.lake.setPool(false);
  // 门外
  W.gate.reset();
  if (f('gate_open')) W.gate.openDoors({ instant: true });
  W.boards.setState(!f('gate_open'));
  W.box.setState({ slots: f('box_slots') || BOX_START, held: Number.isInteger(f('box_held')) ? f('box_held') : null, open: !!f('box_open'), axe: !f('axe_taken') });
  // 树林
  W.chorus.setState({ gone: !!f('mantis_awake') });
  W.grasshopper.visible = !f('mantis_awake'); W.grasshopper.position.fromArray(W.grasshopperHome); W.grasshopper.rotation.x = 0;
  W.egg.setState({ hatched: !!f('mantis_awake') });
  W.owlTree.setState({ owl: !f('owl_taken'), fallen: !!f('owl_taken'), key: !f('key_taken') });
  // 螳螂：在雾里待的位置跟着进度换
  const m = W.mantis, lurk = f('owl_taken') ? MANTIS.idle3 : f('goat_taken') ? MANTIS.idle2 : MANTIS.hatch;
  m.visible = !!f('mantis_awake') && !f('horn_given'); m.walking = false;
  m.position.fromArray(mantisPos(lurk)); m.rest();
  m.rotation.y = f('owl_taken') ? Math.PI * 0.75 : f('goat_taken') ? -Math.PI * 0.6 : 0;
  // 白桦林
  W.goat.visible = !f('goat_taken');
  W.bones.visible = !!f('goat_taken'); W.bones.setState({ eyes: !f('eyes_taken') });
  W.dig.setState({ revealed: !!f('dig_revealed'), dug: !!f('chest_dug'), open: !!f('chest_open'), horn: !f('horn_taken') });
  // 木屋
  W.lantern.setState({ firefly: !!f('firefly_revealed') && !f('firefly_taken') });
  W.shovel.visible = !f('shovel_taken');
  seerEyes(!!f('sight_on'));
  // 湖边和回忆
  W.grandma.visible = !f('horn_given'); W.grandma.position.y = -0.53; grandmaHorn(false);
  W.boatCube.visible = !!f('horn_given') && !f('cube_taken');
  W.memCube.visible = !f('cube_taken');
  // 神殿
  if (W.holder.userData.state.cube && !f('holder_cube')) replaceTempleProp(ctx, 'holder', makeHolder());
  if (W.font.userData.state.lit && !f('font_lit')) replaceTempleProp(ctx, 'font', makeFont());
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
  W.painting.setState({ lit: !!f('painting_lit'), cleared: !!f('plague_cleared'), framed: !!f('next_framed') });
}
