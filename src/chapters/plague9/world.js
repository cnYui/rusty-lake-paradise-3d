// 第九灾：同一座岛，夜里，地上薄雪。篝火在第一灾奶奶坐的空地上，塔门开在西边石塔的东墙上，
// 塔里的一层和阁楼是两个独立区域（原点 x = 700 / 740）。模型显示始终由存档状态推导。
import * as THREE from 'three';
import { makeProp } from '../../art/props.js';
import { makePerson } from '../../art/cast_mock.js';
import { P, SETS, PALISADE, LAKE_Y } from '../../art/layout.js';
import { BUILDING_DIMS } from '../../art/buildings.js';
import { groundHeight } from '../../art/island.js';
import { flat, toon } from '../../art/materials.js';
import { POWDER_COLORS } from '../../art/props_p9.js';
import { TOWER_ROOM, ATTIC } from '../../art/props_p9_tower.js';
import { DIAL_START, ORRERY_START, CANDLE_START, SHADOWS, signOf, GRIND } from './rules.js';
import { T } from './text.js';

export const W = {};
const K = SETS.house_int.origin[0];
export const TW = 700, AT = 740;   // 塔里一层、阁楼两个区域的原点 x
const cam = (pos, target, fov = 48) => ({ pos, target, fov });
const wpos = (ctx, name) => ctx.world.anchor(name).getWorldPosition(new THREE.Vector3()).toArray();
const at = (x, z, dy = 0) => [x, groundHeight(x, z) + dy, z];

// 各个东西的位置（世界 x, z）
export const SPOT = {
  fire: [-3.0, 16.0],
  stump: [-1.68, 14.12],
  door: [-17.06, 14.99], doorRotY: Math.atan2(0.99, -0.12),   // 塔东墙（射线量的墙面点和法线）
  ice: [-15.4, 13.6],
  birch: [15.5, 5.0],
  crate: [25.2, -32.0], shell: [25.95, -31.45],
};
// 五个人围着篝火站在北边，面朝火（从南边来的玩家隔着火看见他们）
export const PEOPLE = [['gerard', 'gerard_p9', 200], ['david', 'david_p9', 235], ['ida', 'ida', 270], ['margaret', 'margaret', 305], ['nicholas', 'nicholas_p9', 340]];
const personSpot = (deg, r = 2.3) => [SPOT.fire[0] + Math.cos(deg * Math.PI / 180) * r, SPOT.fire[1] + Math.sin(deg * Math.PI / 180) * r];
// 屋里的布置（相对 house_int 原点；后墙 z = -1.6，前墙门洞 z = 3.0）
export const ROOM = { grinder: [-1.25, -1.28], drawings: [0.45, 0.95, -1.585], scroll: [-1.25, 1.36, -1.58], pickaxe: [2.08, 0.7] };

function place(ctx, id, model, parent, pos, { scale = 1, rotY = 0, opts } = {}) {
  const object = typeof model === 'string' ? makeProp(model, opts) : model;
  object.position.fromArray(pos); object.rotation.y = rotY; object.scale.setScalar(scale);
  parent.add(object); W[id] = object;
  if (object.update) ctx.register('prop', `p9_${id}`, object);
  return object;
}

function person(ctx, id, mockId, parent, pos, rotY = 0) {
  const rig = makePerson(mockId);
  rig.root.position.fromArray(pos); rig.root.rotation.y = rotY; parent.add(rig.root);
  ctx.register('char', `p9_${id}`, rig);
  W[id] = rig.root; W[`${id}Rig`] = rig;
  return rig;
}

function zone(ctx, id, origin) {
  const g = new THREE.Group(); g.name = `zone_${id}`; g.position.set(0, 0, 0);
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
  for (const [key, color] of Object.entries({ uRedDark: '#3c4660', uRedMid: '#5b6788', uRedLight: '#8f9cbc', uGreyDark: '#3c4660', uGreyLight: '#8f9cbc' })) water[key].value.set(color);
  font.userData.state.ambient = false;
  for (let i = 0; i < 4; i++) font.getObjectByName(`font_drop_${i}`).material.color.set('#7f8aa8');
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

// ---- 夜：天空和远山染成深蓝、星星和月亮、冷色月光、湖水压暗、地上薄雪、零星飘雪 ----
export const NIGHT = { sky: '#0c1324', tint: 0.86, fog: 0.88, near: 28, far: 240 };
function nightScene(ctx, ext) {
  const sky = ctx.world.sky;
  sky.fogState.tint = { color: new THREE.Color(NIGHT.sky), sky: NIGHT.tint, fog: NIGHT.fog, near: NIGHT.near, far: NIGHT.far };
  sky.hemi.color.set('#7083ad'); sky.hemi.groundColor.set('#2b2d36'); sky.hemi.intensity = 0.7;
  sky.sun.color.set('#b4c4ee'); sky.sun.intensity = 0.55;
  ctx.world.root.traverse((o) => { const u = o.material?.uniforms; if (u?.cLakeNear) { u.cLakeNear.value.set('#1b2436'); u.cLake.value.set('#202a3e'); u.cSkyRefl.value.set('#2b3654'); if (u.cLakeFar) u.cLakeFar.value.set('#243049'); } });
  const terrain = ctx.world.root.getObjectByName('terrain');
  if (terrain) { terrain.material.color.set('#e4e9ee'); }
  // 天堂门横梁和门柱顶上的积雪（同第七灾）
  for (const [x, y, w] of [[0, 7.62, 6.6], [-2.45, 8.6, 0.6], [2.45, 8.6, 0.6]]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.4), flat('#f4f7f8')); cap.position.set(x, y + P.gate.pos[1], P.gate.pos[2]); ext.add(cap);
  }
  const N = 360, pos = new Float32Array(N * 3), speed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 40; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = (Math.random() - 0.5) * 40; speed[i] = 0.4 + Math.random() * 0.5; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const flakes = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#e8eef8', size: 0.06, transparent: true, opacity: 0.75, depthWrite: false }));
  flakes.material.userData.outlineParameters = { visible: false }; flakes.name = 'p9_snowfall'; flakes.frustumCulled = false; ext.add(flakes);
  W.sky = makeProp('p9_sky', { moon: true }); ext.add(W.sky);
  const ctl = {
    update(dt, t) {
      const c = ctx.engine.camera;
      if (!c) return;
      W.sky.follow(c);
      const a = geo.attributes.position.array;
      flakes.position.set(c.position.x, c.position.y - 6, c.position.z);
      for (let i = 0; i < N; i++) { a[i * 3 + 1] -= speed[i] * dt; a[i * 3] += Math.sin(t * 0.7 + i) * 0.12 * dt; if (a[i * 3 + 1] < 0) a[i * 3 + 1] += 14; }
      geo.attributes.position.needsUpdate = true;
    },
  };
  ctx.register('prop', 'p9_night', ctl);
}

function defineViews(ctx) {
  const view = (id, pose, rest = {}) => ctx.views.define({ id, zone: 'exterior', cam: pose, ...rest });
  const close = (id, pose, back, area = 'exterior', onEnter = null, rest = {}) => ctx.views.define({ id, zone: area, closeup: true, look: 0, cam: pose, back, ...(onEnter ? { onEnter } : {}), ...rest });
  view('p9_overview', cam(P.overviewCam.pos, P.overviewCam.target, P.overviewCam.fov), { fixed: true });
  view('p9_gate', cam([1.6, 2.1, 47.3], [1.4, 1.5, 40.5], 52), { back: 'p9_overview', up: 'p9_bonfire', onEnter: () => ctx.hintOnce('p9_roam', ctx.ui.touchMode ? T.roamTouch : T.roam) });
  view('p9_bonfire', cam([-3.2, 1.75, 21.8], [-3.0, 1.2, 15.0]), { back: 'p9_gate', up: 'p9_tower_path' });
  view('p9_tower_path', cam([-11.8, 2.3, 15.7], [-17.0, 2.1, 15.0]), { back: 'p9_bonfire' });
  view('p9_grove', cam([15.8, 2.0, 11.5], [15.5, 1.6, 5.0]), { back: 'p9_bonfire', up: 'p9_house' });
  view('p9_house', cam([4.5, 2.2, -3.0], [3, 1.5, -11]), { back: 'p9_grove', right: 'p9_shed' });
  view('p9_shed', cam([17.5, 2.2, -7], [17.5, 1.6, -13]), { left: 'p9_house', up: 'p9_lake' });
  view('p9_lake', cam([22.8, 2.0, -26.6], [25.2, 0.6, -32.0]), { back: 'p9_shed', right: 'p9_temple' });
  const door = wpos(ctx, 'temple.door');
  view('p9_temple', cam([24.6, 2.5, -27.7], [door[0], 1.9, door[2]], 52), { left: 'p9_lake', up: 'p9_temple_int' });

  const [fx, fy, fz] = W.fire.position.toArray();
  close('p9_fire', cam([fx, fy + 2.0, fz + 5.2], [fx, fy + 2.0, fz - 0.5], 52), 'p9_bonfire');
  close('p9_stones', cam([fx, fy + 2.5, fz + 1.9], [fx, fy + 0.1, fz], 50), 'p9_fire');
  const [ix, iy, iz] = W.ice.position.toArray();
  close('p9_ice', cam([ix + 1.1, iy + 1.3, iz + 1.0], [ix, iy + 0.2, iz], 46), 'p9_tower_path');
  const [bx, by, bz] = W.birch.position.toArray();
  close('p9_woodpecker', cam([bx + 0.25, by + 1.8, bz + 2.5], [bx, by + 1.7, bz], 48), 'p9_grove', 'exterior', () => ctx.hintOnce('p9_peck_hint', T.peckHint));
  const [cx, cy, cz] = W.crate.position.toArray();
  close('p9_crate', cam([cx + 0.3, cy + 1.4, cz + 1.9], [cx, cy + 0.45, cz], 46), 'p9_lake');

  // 木屋里（第一灾的餐厅布景）
  const hd = BUILDING_DIMS.house_int;
  ctx.views.defineRoamArea('house_int', {
    bounds: [K - hd.width / 2, hd.wallZ, K + hd.width / 2, hd.wallZ + hd.depth], eye: 1.65,
    circles: [[K + ROOM.grinder[0], ROOM.grinder[1], 0.4]],
  });
  ctx.views.define({ id: 'p9_room', zone: 'house_int', roam: true, cam: cam([K, 1.65, 2.4], [K, 1.3, -1], 52), back: 'p9_house' });
  close('p9_grinder', cam([K + ROOM.grinder[0] + 0.15, 1.5, ROOM.grinder[1] + 1.25], [K + ROOM.grinder[0], 0.62, ROOM.grinder[1]], 46), 'p9_room', 'house_int', () => ctx.hintOnce('p9_grinder_hint', T.grinderHint));
  close('p9_scroll', cam([K + ROOM.scroll[0], ROOM.scroll[1] + 0.31, -0.85], [K + ROOM.scroll[0], ROOM.scroll[1] + 0.31, -1.6], 44), 'p9_room', 'house_int');

  // 塔里一层（白墙房间）
  const R = TOWER_ROOM;
  ctx.views.defineRoamArea('p9_tower', {
    bounds: [TW - R.w / 2 + 0.2, -R.d / 2 + 0.2, TW + R.w / 2 - 0.2, R.d / 2 - 0.2], eye: 1.65,
    circles: [[TW + 1.5, 0.4, 0.55], [TW - 1.0, -2.2, 0.55], [TW - 2.25, -0.6, 0.35], [TW + R.hatch[0], R.hatch[1] + 0.3, 0.35]],
  });
  ctx.views.define({ id: 'p9_tower', zone: 'p9_tower', roam: true, ambience: 'interior', cam: cam([TW + 0.9, 1.65, 1.9], [TW - 0.2, 1.35, -1.5], 54), back: 'p9_tower_path' });
  const dial = W.cabinet.getObjectByName('cab_dial'); dial.updateWorldMatrix(true, false);
  const dp = dial.getWorldPosition(new THREE.Vector3());
  close('p9_dial', cam([dp.x, dp.y, dp.z + 0.95], dp.toArray(), 46), 'p9_tower', 'p9_tower', () => ctx.hintOnce('p9_dial_hint', T.dialHint), { ambience: 'interior' });
  close('p9_orrery', cam([TW + 1.55, 1.48, 1.05], [TW + 1.5, 0.92, 0.4], 46), 'p9_tower', 'p9_tower', () => ctx.hintOnce('p9_orrery_hint', T.orreryHint), { ambience: 'interior' });
  close('p9_chain', cam([TW - 1.2, 1.45, -0.55], [TW - 2.4, 1.25, -0.6], 48), 'p9_tower', 'p9_tower', null, { ambience: 'interior' });
  close('p9_window', cam([TW + R.window.x, 1.75, -1.3], [TW + R.window.x, 1.9, -3.6], 50), 'p9_tower', 'p9_tower', null, { ambience: 'interior' });

  // 阁楼
  ctx.views.defineRoamArea('p9_attic', {
    bounds: [AT - ATTIC.w / 2 + 0.2, -ATTIC.d / 2 + 0.25, AT + ATTIC.w / 2 - 0.2, ATTIC.d / 2 - 0.2], eye: 1.6,
    circles: [[AT + ATTIC.hole[0], ATTIC.hole[1], 0.6], [AT - 1.95, -0.55, 0.4]],
  });
  ctx.views.define({ id: 'p9_attic', zone: 'p9_attic', roam: true, ambience: 'interior', cam: cam([AT - 0.9, 1.6, 1.7], [AT, 1.35, -1.5], 54), back: 'p9_tower' });
  close('p9_shadows', cam([AT, 1.45, 2.0], [AT, 1.1, -1.6], 62), 'p9_attic', 'p9_attic', () => ctx.hintOnce('p9_shadow_hint', T.shadowsHint), { ambience: 'interior' });
  close('p9_beacon', cam([AT + ATTIC.w / 2 - 0.4, 1.75, ATTIC.door.z + 0.3], [AT + ATTIC.w / 2 + 2.6, 1.1, ATTIC.door.z - 0.1], 56), 'p9_attic', 'p9_attic', null, { ambience: 'interior' });

  close('p9_temple_int', cam([400, 2.4, 4.2], [400, 1.5, -0.4], 54), 'p9_temple', 'temple_int');
  close('p9_altar', cam([400, 2.4, 3.5], [400, 1.5, -0.4], 46), 'p9_temple_int', 'temple_int');
  ctx.views.define({ id: 'p9_painting', zone: 'temple_int', closeup: true, look: 0, back: 'p9_altar', cam: () => {
    W.painting.updateWorldMatrix(true, false);
    const p = W.painting.getWorldPosition(new THREE.Vector3());
    return cam([p.x, p.y + 0.21, p.z + 0.82], [p.x, p.y + 0.21, p.z], 39);
  } });
}

export async function setup(ctx) {
  W.ctx = ctx; W.zones = {};
  const { exterior: ext, house_int: house, temple_int: temple } = ctx.world.zones;
  clearUnusedColliders(ctx);
  nightScene(ctx, ext);

  // ---- 门外：天堂门开着 ----
  place(ctx, 'gate', 'paradise_gate', ext, P.gate.pos);
  W.gate.openDoors({ instant: true });

  // ---- 空地：篝火、五个人；塔东墙上的门、月食后落下来的冰块 ----
  place(ctx, 'fire', 'p9_bonfire', ext, at(...SPOT.fire));
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.45, 12), toon('#5b4636')); stump.position.fromArray(at(...SPOT.stump, 0.225)); ext.add(stump);
  W.peopleRigs = {};
  for (const [id, mock, deg] of PEOPLE) {
    const [x, z] = id === 'margaret' ? SPOT.stump : personSpot(deg);
    const rig = person(ctx, id, mock, ext, at(x, z), Math.atan2(SPOT.fire[0] - x, SPOT.fire[1] - z));
    if (id === 'margaret') rig.setPose('sit');
    W.peopleRigs[id] = rig;
  }
  const [dx, dz] = SPOT.door;
  place(ctx, 'towerDoor', 'p9_tower_door', ext, [dx, groundHeight(dx + 0.6, dz) - 0.05, dz], { rotY: SPOT.doorRotY });
  place(ctx, 'ice', 'p9_ice', ext, at(...SPOT.ice));
  place(ctx, 'streak', 'p9_moon_streak', ext, [0, 0, 0]);

  // ---- 白桦林：啄木鸟的白桦树和四周几棵白桦 ----
  for (const [x, z, seed] of [[12.6, 3.0, 3], [20.4, 7.8, 5], [13.2, 9.8, 7], [20.8, 2.6, 9], [11.4, 6.4, 11]]) {
    const b = makeProp('p3_birch', { height: 7.5, seed, leaves: false }); b.position.fromArray(at(x, z)); ext.add(b);
  }
  place(ctx, 'birch', 'p9_birch', ext, at(...SPOT.birch));

  // ---- 湖边：木箱和猫头鹰、贝壳 ----
  place(ctx, 'crate', 'p9_crate', ext, at(...SPOT.crate), { rotY: -0.35 });
  place(ctx, 'shell', 'p9_shell', ext, at(...SPOT.shell, 0.01), { scale: 1.6 });

  // ---- 木屋里：研磨机、墙上的炭笔画和小画、墙边的镐 ----
  place(ctx, 'grinder', 'p9_grinder', house, [K + ROOM.grinder[0], 0, ROOM.grinder[1]]);
  place(ctx, 'drawings', 'p9_wall_drawings', house, [K + ROOM.drawings[0], ROOM.drawings[1], ROOM.drawings[2]]);
  place(ctx, 'scroll', 'p9_scroll', house, [K + ROOM.scroll[0], ROOM.scroll[1], ROOM.scroll[2]], { opts: { lines: T.scrollLines } });
  const pick = place(ctx, 'pickaxe', 'p9_pickaxe', house, [K + ROOM.pickaxe[0], 0, ROOM.pickaxe[1]], { rotY: -Math.PI / 2 }); pick.rotation.z = 0.22;

  // ---- 塔里一层：白墙房间、链条绞盘、梯子、星座盘木柜、月相仪 ----
  const tower = zone(ctx, 'p9_tower');
  place(ctx, 'room', 'p9_tower_room', tower, [TW, 0, 0]);
  place(ctx, 'chain', 'p9_chain', tower, [TW - TOWER_ROOM.w / 2, 0, -0.6], { rotY: Math.PI / 2 });
  place(ctx, 'ladder', 'p9_ladder', tower, [TW + TOWER_ROOM.hatch[0], 0, TOWER_ROOM.hatch[1]]);
  place(ctx, 'cabinet', 'p9_cabinet', tower, [TW - 1.0, 0, -TOWER_ROOM.d / 2 + 0.235]);
  place(ctx, 'orrery', 'p9_orrery', tower, [TW + 1.5, 0, 0.4]);
  W.cabinet.userData.key.add(makeProp('p9_copper_key'));

  // ---- 阁楼：挂件、影子墙、蜡烛、木门和塔顶平台的火盆 ----
  const attic = zone(ctx, 'p9_attic');
  place(ctx, 'attic', 'p9_attic', attic, [AT, 0, 0]);

  // ---- 神殿：圣水盆边的青石；吊架 / 圣水盆 / 画 ----
  place(ctx, 'holder', makeHolder(), temple, wpos(ctx, 'temple_int.holder'), { scale: 1.4 });
  place(ctx, 'font', makeFont(), temple, wpos(ctx, 'temple_int.font'));
  place(ctx, 'painting', 'p9_painting', W.font.getObjectByName('font_niche'), [0, 0, 0.012], { scale: 0.82 });
  const fp = wpos(ctx, 'temple_int.font');
  place(ctx, 'blueStone', 'p9_blue_stone', temple, [fp[0] + 0.85, 0.01, fp[2] + 0.75], { scale: 1.8 });

  // ---- 小屋：门敞开（同第五灾）----
  place(ctx, 'shed', 'shed_door', ext, P.shedDoor.pos);
  for (const name of ['shed_doors', 'padlock', 'shed_bolt']) W.shed.getObjectByName(name).visible = false;

  defineViews(ctx);
  ctx.world.colliders.circles.push(
    [...SPOT.fire, 1.1], [...SPOT.stump, 0.32], ...PEOPLE.filter(([id]) => id !== 'margaret').map(([, , deg]) => [...personSpot(deg), 0.3]),
    [...SPOT.birch, 0.4], [...SPOT.crate, 0.55],
  );

  const hs = (id, views, object, rest = {}) => ctx.hotspots.define({ id, views, object, cursor: 'zoom', ...rest });
  const proxy = (size, pos, parent) => ctx.hotspots.makeProxy(...size, pos, parent);
  hs('p9_overview_island', ['p9_overview'], proxy([40, 9, 6], [0, 3.6, 43], ext), { goto: 'p9_gate' });
  hs('p9_fire_zoom', ['p9_bonfire', 'p9_tower_path'], W.fire, { goto: 'p9_fire' });
  hs('p9_stones_zoom', ['p9_fire'], proxy([2.2, 0.3, 0.55], [SPOT.fire[0], W.fire.position.y + 0.12, SPOT.fire[1] + 0.95], ext), { goto: 'p9_stones' });
  hs('p9_tower_entry', ['p9_bonfire', 'p9_tower_path'], W.towerDoor.getObjectByName('door_hit'), { cursor: 'pointer', goto: 'p9_tower' });
  hs('p9_ice_zoom', ['p9_bonfire', 'p9_tower_path'], W.ice.getObjectByName('ice_hit'), { when: () => !!ctx.flag('blood_moon') && !ctx.flag('moon_stone_taken'), goto: 'p9_ice' });
  hs('p9_birch_zoom', ['p9_grove'], W.birch.getObjectByName('birch_trunk'), { goto: 'p9_woodpecker' });
  hs('p9_crate_zoom', ['p9_lake'], W.crate.getObjectByName('crate_hit'), { goto: 'p9_crate' });
  hs('p9_house_entry', ['p9_house'], proxy([2.0, 2.3, 0.45], [3, 1.65, -11.35], ext), { goto: 'p9_room' });
  hs('p9_room_exit', ['p9_room'], proxy([1.2, 2.25, 0.3], [K, 1.15, 2.85], house), { goto: 'p9_house' });
  hs('p9_grinder_zoom', ['p9_room'], W.grinder, { goto: 'p9_grinder' });
  hs('p9_scroll_zoom', ['p9_room'], W.scroll, { goto: 'p9_scroll' });
  hs('p9_tower_exit', ['p9_tower'], W.room.userData.exit, { cursor: 'pointer', goto: 'p9_tower_path' });
  hs('p9_dial_zoom', ['p9_tower'], W.cabinet, { goto: 'p9_dial' });
  hs('p9_orrery_zoom', ['p9_tower'], W.orrery, { goto: 'p9_orrery' });
  hs('p9_chain_zoom', ['p9_tower'], W.chain, { goto: 'p9_chain' });
  hs('p9_window_zoom', ['p9_tower'], W.room.userData.window, { goto: 'p9_window' });
  hs('p9_ladder_up', ['p9_tower'], W.ladder.userData.hit, { cursor: 'pointer', when: () => !!ctx.flag('ladder_down'), goto: 'p9_attic' });
  hs('p9_attic_down', ['p9_attic'], proxy([0.9, 0.3, 0.9], [AT + ATTIC.hole[0], 0.15, ATTIC.hole[1]], attic), { cursor: 'pointer', goto: 'p9_tower' });
  hs('p9_shadows_zoom', ['p9_attic'], W.attic.userData.wall, { goto: 'p9_shadows' });
  const tdoor = wpos(ctx, 'temple.door');
  const entrance = proxy([1.65, 2.5, 0.4], [tdoor[0], tdoor[1] + 1.2, tdoor[2]], ext); entrance.rotation.y = P.temple.rotY;
  hs('p9_temple_entry', ['p9_temple'], entrance, { goto: 'p9_temple_int' });
  hs('p9_altar_entry', ['p9_temple_int'], W.holder, { goto: 'p9_altar' });
  hs('p9_font_entry', ['p9_temple_int'], W.font, { goto: 'p9_altar' });
  hs('p9_painting_entry', ['p9_altar'], W.painting, { when: () => !!ctx.flag('font_lit'), goto: 'p9_painting' });
}

/** 撒过粉末的星座：石头圈上第几块亮成什么颜色。 */
export function stoneMarks(ctx) {
  const marks = Array(12).fill(null);
  for (const [powder, kind] of Object.entries(SHADOWS)) if (kind !== 'mother' && ctx.flag(`shadow_${kind}`)) marks[signOf(powder)] = POWDER_COLORS[powder];
  return marks;
}

export function sync(ctx) {
  if (!W.ctx) return;
  const f = (k) => ctx.flag(k);
  ctx.world.lake.setBlood(0); ctx.world.lake.setPool(false);
  const blood = f('blood_moon') ? 1 : 0;
  W.sky.setBlood(blood); W.room.setBlood(blood);
  // 篝火和石头圈
  W.fire.setState({ fire: f('fire_out') ? 'out' : 'low', stones: stoneMarks(ctx), cube: !!f('fire_out') && !f('cube_taken') });
  W.ice.setState({ fallen: !!blood, ice: !f('ice_broken'), stone: !f('moon_stone_taken') });
  W.towerDoor.userData.leaf.userData.open(1);
  // 白桦林、湖边
  W.birch.setState({ at: Number.isInteger(f('pecks')) ? f('pecks') : 4, bark: !f('bark_taken') });
  W.crate.setState({ owl: !f('beacon_lit'), open: !!f('beacon_lit'), bones: !f('bones_taken') });
  W.shell.visible = !f('shell_taken');
  // 木屋
  const input = f('grinder_in');
  W.grinder.setState({ input: input ? POWDER_COLORS[GRIND[input]] : null, output: f('grinder_out') ? POWDER_COLORS[f('grinder_out')] : null });
  W.pickaxe.visible = !f('pickaxe_taken');
  // 塔里
  W.chain.setState({ locked: !f('padlock_open') });
  W.ladder.setState({ down: !!f('ladder_down') });
  W.cabinet.setState({ hands: f('dial_hands') || DIAL_START, open: !!f('drawer_open'), key: !f('copper_key_taken') });
  const o = f('orrery') || ORRERY_START;
  W.orrery.setState({ earth: o.earth, moon: o.moon, eclipse: !!blood });
  W.attic.setState({ at: Number.isInteger(f('candle_at')) ? f('candle_at') : CANDLE_START, solved: !!f('shadows_done'), candle: !f('candle_taken'), open: !!f('shadows_done'), lit: !!f('beacon_lit') });
  // 神殿
  W.blueStone.visible = !f('blue_stone_taken');
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

export { PALISADE, LAKE_Y };
