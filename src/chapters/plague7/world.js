// 第七灾：同一座岛换成雪景（地面发白、湖面结冰、飘雪），布局沿用第五、六灾；模型显示始终由存档状态推导。
import * as THREE from 'three';
import { makeProp } from '../../art/props.js';
import { makeMockPerson } from '../../art/cast_mock.js';
import { rinkPos } from '../../art/props_p7.js';
import { P, SETS } from '../../art/layout.js';
import { BUILDING_DIMS } from '../../art/buildings.js';
import { groundHeight } from '../../art/island.js';
import { flat } from '../../art/materials.js';
import { ICE_LEVELS, SKATE_LEVELS } from './rules.js';
import { T } from './text.js';

export const W = {};
const K = SETS.house_int.origin[0];
const cam = (pos, target, fov = 48) => ({ pos, target, fov });
const wpos = (ctx, name) => ctx.world.anchor(name).getWorldPosition(new THREE.Vector3()).toArray();
const at = (x, z, dy = 0) => [x, groundHeight(x, z) + dy, z];

// 屋里的布置（相对 house_int 原点；后墙 z = -1.6，前墙门洞 z = 3.0）
export const ROOM = { table: [0.2, -1.2], gerard: [-1.35, -0.2], machine: [1.7, -1.15], dome: [1.78, 0.9], picture: [-0.9, 1.75, -1.57] };
export const TEMPLE = { hammer: [1.45, -1.05], cage: [-1.15, -0.55], caroline: [-2.0, 0.25], deer: [1.9, -0.2], cube: [-0.5, 0.05] };

function place(ctx, id, model, parent, pos, { scale = 1, rotY = 0 } = {}) {
  const object = typeof model === 'string' ? makeProp(model) : model;
  object.position.fromArray(pos); object.rotation.y = rotY; object.scale.setScalar(scale);
  parent.add(object); W[id] = object;
  if (object.update) ctx.register('prop', `p7_${id}`, object);
  return object;
}

function person(ctx, id, mockId, parent, pos, rotY = 0) {
  const rig = makeMockPerson(mockId);
  rig.root.position.fromArray(pos); rig.root.rotation.y = rotY; parent.add(rig.root);
  ctx.register('char', `p7_${id}`, rig);
  W[id] = rig.root; W[`${id}Rig`] = rig;
  return rig;
}

function zone(ctx, id, sky = '#dfe7ea') {
  const g = new THREE.Group(); g.name = `zone_${id}`;
  g.add(new THREE.HemisphereLight('#f4f6f8', '#7a8288', 1.8));
  const key = new THREE.DirectionalLight('#ffffff', 1.3); key.position.set(4, 8, 6);
  g.add(key, key.target);
  const back = new THREE.Mesh(new THREE.SphereGeometry(40, 16, 8), new THREE.MeshBasicMaterial({ color: sky, side: THREE.BackSide }));
  back.material.userData.outlineParameters = { visible: false }; g.add(back);
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

// ---- 雪景：地面泛白、湖面一层冰、飘雪（只挂在室外区域里，进屋自动看不见）----
function snowScene(ctx, ext) {
  const terrain = ctx.world.root.getObjectByName('terrain');
  if (terrain) { terrain.material.color.set('#dfe6ea'); terrain.material.emissive?.set('#8f979b'); }
  const ice = new THREE.Mesh(new THREE.RingGeometry(20, 420, 64, 1), flat('#dbe7ec', { transparent: true, opacity: 0.86, depthWrite: false }));
  ice.rotation.x = -Math.PI / 2; ice.position.y = 0.04; ice.renderOrder = -5; ice.name = 'p7_lake_ice'; ext.add(ice);
  // 天堂门横梁和门柱顶上的积雪
  for (const [x, y, w] of [[0, 7.62, 6.6], [-2.45, 8.6, 0.6], [2.45, 8.6, 0.6]]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.4), flat('#f4f7f8')); cap.position.set(x, y + P.gate.pos[1], P.gate.pos[2]); ext.add(cap);
  }
  const N = 900, pos = new Float32Array(N * 3), speed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 40; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = (Math.random() - 0.5) * 40; speed[i] = 0.6 + Math.random() * 0.8; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const flakes = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.07, transparent: true, opacity: 0.85, depthWrite: false }));
  flakes.material.userData.outlineParameters = { visible: false };
  flakes.name = 'p7_snowfall'; flakes.frustumCulled = false; ext.add(flakes);
  flakes.update = (dt, t) => {
    const c = ctx.engine.camera.position, a = geo.attributes.position.array;
    flakes.position.set(c.x, c.y - 6, c.z);
    for (let i = 0; i < N; i++) {
      a[i * 3 + 1] -= speed[i] * dt; a[i * 3] += Math.sin(t * 0.7 + i) * 0.15 * dt;
      if (a[i * 3 + 1] < 0) a[i * 3 + 1] += 14;
    }
    geo.attributes.position.needsUpdate = true;
  };
  ctx.register('prop', 'p7_snowfall', flakes);
  W.snow = flakes;
}

function defineViews(ctx) {
  const view = (id, pose, rest = {}) => ctx.views.define({ id, zone: 'exterior', cam: pose, ...rest });
  const close = (id, pos, target, back, area = 'exterior', fov = 48, onEnter = null) => ctx.views.define({ id, zone: area, closeup: true, look: 0, cam: cam(pos, target, fov), back, ...(onEnter ? { onEnter } : {}) });
  view('p7_overview', cam(P.overviewCam.pos, P.overviewCam.target, P.overviewCam.fov), { fixed: true });
  view('p7_gate', cam([0, 2.3, 48], [0, 1.7, 40]), { back: 'p7_overview', up: 'p7_forest', onEnter: () => ctx.hintOnce('p7_roam', ctx.ui.touchMode ? T.roamTouch : T.roam) });
  view('p7_forest', cam([-3, 2.2, 23], [-3, 1.1, 17]), { back: 'p7_gate', up: 'p7_grove' });
  view('p7_grove', cam([18, 2.0, 9.5], [18, 1.5, 1.5]), { back: 'p7_forest', up: 'p7_house' });
  view('p7_house', cam([5, 2.3, -3], [3, 1.5, -11]), { back: 'p7_grove', right: 'p7_shed' });
  view('p7_shed', cam([17.5, 2.2, -7], [17.5, 1.6, -13]), { left: 'p7_house', up: 'p7_lake' });
  view('p7_lake', cam([22, 2.2, -24], [24, 1.5, -29]), { back: 'p7_shed', right: 'p7_temple' });
  const door = wpos(ctx, 'temple.door');
  view('p7_temple', cam([24.6, 2.5, -27.7], [door[0], 1.9, door[2]], 52), { left: 'p7_lake', up: 'p7_temple_int' });
  close('p7_skate', [0, 9.2, 6.4], [0, 0, 0.4], 'p7_gate', 'p7_skate', 50, () => ctx.hintOnce('p7_skate_hint', T.skateHint));
  close('p7_icepool', [0, 2.9, 1.9], [0, 0, 0.15], 'p7_grove', 'p7_icepool', 46, () => ctx.hintOnce('p7_ice_hint', T.icepoolHint));
  const sm = W.snowman.position;
  close('p7_snowman', [sm.x + 0.4, sm.y + 1.6, sm.z + 4.2], [sm.x + 0.2, sm.y + 0.9, sm.z], 'p7_grove', 'exterior', 46);
  const sq = W.squirrel.position;
  close('p7_squirrel', [sq.x + 0.9, sq.y + 1.4, sq.z + 3.0], [sq.x + 0.6, sq.y + 1.0, sq.z], 'p7_forest', 'exterior', 50);
  const ib = W.iceblock.position;
  close('p7_iceblock', [ib.x + 0.6, ib.y + 1.6, ib.z + 3.6], [ib.x, ib.y + 1.25, ib.z], 'p7_lake', 'exterior', 46);

  const hd = BUILDING_DIMS.house_int, R = (k) => [K + ROOM[k][0], 0, ROOM[k][1]];
  ctx.views.defineRoamArea('house_int', {
    bounds: [K - hd.width / 2, hd.wallZ, K + hd.width / 2, hd.wallZ + hd.depth], eye: 1.65,
    circles: [[K + ROOM.gerard[0], ROOM.gerard[1], 0.38]],
    boxes: [[K - 0.5, -1.6, K + 0.9, -0.85], [K + 1.4, -1.6, K + 2.3, -0.85], [K + 1.5, 0.65, K + 2.3, 1.15]],
  });
  ctx.views.define({ id: 'p7_room', zone: 'house_int', roam: true, cam: cam([K, 1.65, 2.4], [K + 0.2, 1.2, -1], 52), back: 'p7_house' });
  const tb = R('table');
  close('p7_table', [tb[0], 1.75, 0.55], [tb[0], 1.35, -1.2], 'p7_room', 'house_int', 50);
  const gr = R('gerard');
  close('p7_gerard', [gr[0] + 1.25, 1.35, gr[2] + 0.55], [gr[0], 1.15, gr[2]], 'p7_room', 'house_int', 44);
  const mc = R('machine');
  close('p7_machine', [mc[0] - 0.15, 1.5, mc[2] + 1.75], [mc[0], 0.98, mc[2]], 'p7_room', 'house_int', 44);
  const dm = R('dome');
  close('p7_dome', [dm[0] - 0.9, 1.3, dm[2]], [dm[0], 0.9, dm[2]], 'p7_room', 'house_int', 40);
  close('p7_temple_int', [400, 2.4, 4.2], [400, 1.5, -0.4], 'p7_temple', 'temple_int', 54);
  close('p7_altar', [400, 2.4, 3.5], [400, 1.5, -0.4], 'p7_temple_int', 'temple_int', 46);
  ctx.views.define({ id: 'p7_painting', zone: 'temple_int', closeup: true, look: 0, back: 'p7_altar', cam: () => {
    W.painting.updateWorldMatrix(true, false);
    const p = W.painting.getWorldPosition(new THREE.Vector3());
    return cam([p.x, p.y + 0.21, p.z + 0.82], [p.x, p.y + 0.21, p.z], 39);
  } });
}

export async function setup(ctx) {
  W.ctx = ctx; W.zones = {};
  const { exterior: ext, house_int: house, temple_int: temple } = ctx.world.zones;
  clearUnusedColliders(ctx);
  snowScene(ctx, ext);

  // ---- 天堂门（开着）和冰湖边的 Caroline ----
  place(ctx, 'gate', 'paradise_gate', ext, P.gate.pos);
  person(ctx, 'caroline', 'caroline', ext, at(1.7, 44.0), -0.4);

  // ---- 滑冰台面（独立区域）：冰面 + 树桩 + 小一号的 Caroline ----
  const skate = zone(ctx, 'p7_skate');
  place(ctx, 'rink', 'p7_rink', skate, [0, 0, 0]);
  person(ctx, 'skater', 'caroline', skate, [0, 0, 0]);

  // ---- 树林 ----
  place(ctx, 'scarfBranch', 'p7_scarf_branch', ext, at(-6.2, 17.8));
  place(ctx, 'branches', 'p7_branches', ext, at(-1.8, 19.6, 0.03), { scale: 1.4 });
  place(ctx, 'vase', 'p7_vase', ext, at(1.6, 18.8));
  place(ctx, 'squirrel', 'p7_squirrel', ext, at(-6.0, 14.4));

  // ---- 白桦林：岩壁拱门、雪人、冰池 ----
  place(ctx, 'cave', 'p6_cave', ext, at(18, 0.4));
  for (const [x, z, seed] of [[14.4, 3.0, 3], [21.8, 3.2, 5], [15.2, 5.8, 7], [22.6, 6.2, 9], [13.6, 1.4, 11]]) {
    const b = makeProp('p3_birch', { height: 7.5, seed, leaves: false }); b.position.fromArray(at(x, z)); ext.add(b);
  }
  place(ctx, 'snowman', 'p7_snowman', ext, at(15.6, 3.6));
  // 钻石落在雪人右前方的雪地上（离开雪人的点击盒，特写镜头里点得到）
  place(ctx, 'snowDiamond', 'p7_diamond', ext, at(16.5, 4.9, 0.02), { scale: 2 });
  ctx.hotspots.makeProxy(0.18, 0.15, 0.18, [0, 0.05, 0], W.snowDiamond);
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(1.0, 28), flat('#cfe2ea')); puddle.rotation.x = -Math.PI / 2;
  puddle.position.fromArray(at(20.6, 4.0, 0.03)); puddle.name = 'p7_puddle'; ext.add(puddle); W.puddle = puddle;
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, i % 2 ? 0.1 : 0.3, 0.3), flat('#b9d3dc')); b.position.set(puddle.position.x + Math.cos(i * 1.6) * 0.45, puddle.position.y + 0.08, puddle.position.z + Math.sin(i * 1.6) * 0.45); ext.add(b); }
  place(ctx, 'icepool', 'p7_icepool', zone(ctx, 'p7_icepool'), [0, 0, 0]);

  // ---- 木屋外：石堆牛头骨、柴堆 ----
  place(ctx, 'skullPile', 'p7_skull_pile', ext, at(7.6, -9.4), { rotY: -0.4 });
  place(ctx, 'woodpile', 'p7_woodpile', ext, at(-0.6, -10.4), { rotY: 0.3 });

  // ---- 木屋室内 ----
  const R = (k, y = 0) => [K + ROOM[k][0], y, ROOM[k][1]];
  place(ctx, 'table', 'p7_table', house, R('table'));
  place(ctx, 'stool', 'p6_stool', house, R('gerard'));
  person(ctx, 'gerard', 'gerard_p7', house, R('gerard'), Math.PI / 2).setPose('sit');
  place(ctx, 'machine', 'p7_machine', house, R('machine'));
  place(ctx, 'dome', 'p7_dome', house, R('dome'), { rotY: -Math.PI / 2 });
  place(ctx, 'picture', 'p7_hint_picture', house, [K + ROOM.picture[0], ROOM.picture[1], ROOM.picture[2]]);

  // ---- 湖岸：冰块里的年轻人 ----
  place(ctx, 'iceblock', 'p7_iceblock', ext, at(24.4, -31.4));
  const youth = person(ctx, 'youth', 'ice_youth', ext, at(24.4, -31.4), 0.5);
  // 双臂抱在胸前（原作 10:47 冰里的人）
  for (const [k, s] of [['armL', -1], ['armR', 1]]) { youth.parts[k].rotation.set(-1.25, 0, -s * 0.95); }
  W.youthHat = makeProp('p7_fur'); W.youthHat.scale.setScalar(2.2); W.youthHat.position.y = 1.72; youth.root.add(W.youthHat);

  // ---- 神殿：锤子冻在冰里；鸟笼、Caroline、鹿头人（放水晶球后出现）；吊架 / 圣水盆 / 画 ----
  const tp = (k, y = 0) => [400 + TEMPLE[k][0], y, TEMPLE[k][1]];
  const chunk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.4), flat('#cfe2ea', { transparent: true, opacity: 0.8 }));
  chunk.position.fromArray(tp('hammer', 0.125)); temple.add(chunk);
  place(ctx, 'templeHammer', 'p7_hammer', temple, tp('hammer', 0.22)).rotation.z = 1.3;
  place(ctx, 'cage', 'p7_cage', temple, tp('cage', 4.2));
  person(ctx, 'cageJakob', 'jakob_child', W.cage, [0, 0.04, 0]);
  person(ctx, 'kneeler', 'caroline', temple, tp('caroline'), Math.PI / 2).setPose('sit');
  person(ctx, 'deer', 'nicholas_deer', temple, tp('deer'), -Math.PI / 2);
  // 鸟笼升走后，黑方块留在圣水盆的石沿上（盆沿高 1.04 m）
  place(ctx, 'cube', 'black_cube', temple, tp('cube', 1.1), { scale: 1.6 });
  place(ctx, 'holder', makeHolder(), temple, wpos(ctx, 'temple_int.holder'), { scale: 1.4 });
  place(ctx, 'font', makeFont(), temple, wpos(ctx, 'temple_int.font'));
  place(ctx, 'painting', 'p7_painting', W.font.getObjectByName('font_niche'), [0, 0, 0.012], { scale: 0.82 });

  // ---- 小屋：门敞开（同第五灾）----
  place(ctx, 'shed', 'shed_door', ext, P.shedDoor.pos);
  for (const name of ['shed_doors', 'padlock', 'shed_bolt']) W.shed.getObjectByName(name).visible = false;

  defineViews(ctx);
  ctx.world.colliders.circles.push([15.6, 3.6, 0.6], [-6.0, 13.9, 0.35], [7.6, -9.4, 0.5], [24.4, -31.4, 0.8], [1.7, 44.0, 0.3]);
  ctx.world.colliders.boxes.push([13.2, -0.4, 22.8, 1.0], [-1.2, -10.8, 0.0, -10.0]);

  const hs = (id, views, object, rest = {}) => ctx.hotspots.define({ id, views, object, cursor: 'zoom', ...rest });
  const proxy = (size, pos, parent) => ctx.hotspots.makeProxy(...size, pos, parent);
  hs('p7_overview_island', ['p7_overview'], proxy([40, 9, 6], [0, 3.6, 43], ext), { goto: 'p7_gate' });
  hs('p7_caroline', ['p7_gate'], W.carolineRig.parts.body, { goto: 'p7_skate' });
  hs('p7_squirrel_zoom', ['p7_forest'], W.squirrel.userData.trunk, { goto: 'p7_squirrel' });
  hs('p7_icepool_zoom', ['p7_grove'], W.puddle, { goto: 'p7_icepool' });
  hs('p7_snowman_zoom', ['p7_grove'], W.snowman, { goto: 'p7_snowman' });
  hs('p7_house_entry', ['p7_house'], proxy([2.0, 2.3, 0.45], [3, 1.65, -11.35], ext), { goto: 'p7_room' });
  hs('p7_room_exit', ['p7_room'], proxy([1.2, 2.25, 0.3], [K, 1.15, 2.85], house), { goto: 'p7_house' });
  hs('p7_table_zoom', ['p7_room'], W.table, { goto: 'p7_table' });
  hs('p7_gerard_zoom', ['p7_room'], W.gerardRig.parts.body, { goto: 'p7_gerard' });
  hs('p7_machine_zoom', ['p7_room'], W.machine, { goto: 'p7_machine' });
  hs('p7_dome_zoom', ['p7_room'], W.dome, { goto: 'p7_dome' });
  hs('p7_iceblock_zoom', ['p7_lake'], W.iceblock, { goto: 'p7_iceblock' });
  const door = wpos(ctx, 'temple.door');
  const entrance = proxy([1.65, 2.5, 0.4], [door[0], door[1] + 1.2, door[2]], ext); entrance.rotation.y = P.temple.rotY;
  hs('p7_temple_entry', ['p7_temple'], entrance, { goto: 'p7_temple_int' });
  hs('p7_altar_entry', ['p7_temple_int'], W.holder, { goto: 'p7_altar' });
  hs('p7_font_entry', ['p7_temple_int'], W.font, { goto: 'p7_altar' });
  hs('p7_painting_entry', ['p7_altar'], W.painting, { when: () => !!ctx.flag('font_lit'), goto: 'p7_painting' });
}

/** 滑冰台面当前一关（全部滑完后停在第三关）。 */
export const skateRound = (ctx) => Math.min(Number(ctx.flag('skate_round')) || 0, SKATE_LEVELS.length - 1);
export const iceRound = (ctx) => Math.min(Number(ctx.flag('icepool_round')) || 0, ICE_LEVELS.length - 1);

export function sync(ctx) {
  if (!W.ctx) return;
  const f = (k) => ctx.flag(k);
  ctx.world.lake.setBlood(0); ctx.world.lake.setPool(false);
  W.gate.reset(); W.gate.openDoors({ instant: true });
  // 滑冰
  const sr = skateRound(ctx), level = SKATE_LEVELS[sr];
  W.rink.setLevel(level, { done: !!f('skate_done'), carrot: !!f('skate_done') && !f('carrot_taken'), cracked: !!f('skate_done') });
  W.skater.position.fromArray(rinkPos(f('skate_pos') || level.start));
  // 树林
  W.scarfBranch.setScarf(!f('scarf_taken'));
  W.branches.visible = !f('branches_taken');
  W.vase.setState({ broken: !!f('vase_broken'), stones: !f('stones_taken') });
  W.squirrel.setState({ dead: !!f('squirrel_dead'), looted: !!f('pistachio_taken') });
  // 冰池
  const ir = iceRound(ctx);
  W.icepool.setState(f('icepool_cells') || ICE_LEVELS[ir], f('icepool_selected') ?? null, !!f('icepool_done'), !!f('diamond_ice_taken'));
  // 雪人
  W.snowman.setState(f('snowman_parts') || [], !!f('snowman_alive'));
  W.snowDiamond.visible = !!f('snowman_alive') && !f('diamond_snow_taken');
  // 屋外
  W.skullPile.setHorn(!f('horn_taken'));
  W.woodpile.setStake(!f('stake_taken'));
  // 木屋
  W.table.setState({ icicles: Number(f('icicles_used')) || 0, ice: !!f('bucket_ice'), snowball: !!f('snowball') });
  W.dome.setBerries(!f('strawberry_taken'));
  W.machine.setState({ diamonds: (f('machine_diamonds') || []).length, ball: !f('ball_taken') });
  W.gerardRig.parts.head.getObjectByName('hat').visible = !f('hat_taken');
  // 湖岸冰块
  W.iceblock.setState(f('youth_free') ? 'free' : f('ice_cracked') ? 'cracked' : 'frozen');
  W.youthHat.visible = !!f('youth_warm');
  // 神殿
  W.templeHammer.visible = !f('hammer_taken');
  W.cage.visible = !!f('ball_placed') && !f('cage_seen');
  W.cage.position.y = f('ball_placed') && !f('cage_seen') ? 0.6 : 4.2;
  W.kneeler.visible = W.deer.visible = !!f('ball_placed');
  W.cube.visible = !!f('cage_seen') && !f('cube_taken');
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

