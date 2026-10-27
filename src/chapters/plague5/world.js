// 第五灾复用岛屿与室内布景，模型显示始终由存档状态推导。
import * as THREE from 'three';
import { makeProp } from '../../art/props.js';
import { makeCharacter } from '../../art/characters.js';
import { P, SETS } from '../../art/layout.js';
import { BUILDING_DIMS } from '../../art/buildings.js';
import { toon, unlit } from '../../art/materials.js';
import { label } from '../../art/props_p5.js';
import { FIELD_LEVELS, THREAD_LEVELS } from './rules.js';
import { T } from './text.js';

export const W = {};
const K = SETS.house_int.origin[0];
const cam = (pos, target, fov = 48) => ({ pos, target, fov });
const wpos = (ctx, name) => ctx.world.anchor(name).getWorldPosition(new THREE.Vector3()).toArray();

function place(ctx, id, model, parent, pos, { scale = 1, rotY = 0 } = {}) {
  const object = typeof model === 'string' ? makeProp(model) : model;
  object.position.fromArray(pos); object.rotation.y = rotY; object.scale.setScalar(scale);
  parent.add(object); W[id] = object;
  if (object.update) ctx.register('prop', `p5_${id}`, object);
  return object;
}

function person(ctx, id, rig, parent, pos, opts) {
  place(ctx, id, rig.root, parent, pos, opts);
  ctx.register('char', `p5_${id}`, rig); W[`${id}Rig`] = rig;
  return rig;
}

function zone(ctx, id) {
  const g = new THREE.Group(); g.name = `zone_${id}`;
  // 独立题面不在公共室内布景中，需要自己的灯光。
  g.add(new THREE.HemisphereLight('#f4f1e8', '#5c5850', 1.75));
  const key = new THREE.DirectionalLight('#fffdf5', 1.4); key.position.set(4, 8, 6);
  g.add(key, key.target); ctx.world.root.add(g); ctx.views.registerZone(id, g);
  W.zones[id] = g;
  return g;
}

function sign(text, width = 1.4) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(width, 0.65, 0.08), toon('#a8875e'));
  board.position.y = 1.3; g.add(board);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.3, 0.09), toon('#776249'));
  post.position.y = 0.65; g.add(post);
  const words = label(text, width * 0.9, 0.27); words.position.set(0, 1.3, 0.046); g.add(words);
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
  // 房间的绳子跟随吊架，模型自带长绳会扩大热点范围。
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

function defineViews(ctx) {
  const view = (id, pose, rest = {}) => ctx.views.define({ id, zone: 'exterior', cam: pose, ...rest });
  const close = (id, pos, target, back, area = 'exterior', fov = 48, onEnter = null) => ctx.views.define({ id, zone: area, closeup: true, look: 0, cam: cam(pos, target, fov), back, ...(onEnter ? { onEnter } : {}) });
  view('p5_overview', cam(P.overviewCam.pos, P.overviewCam.target, P.overviewCam.fov), { fixed: true });
  view('p5_gate', cam([0, 2.3, 48], [0, 1.7, 40]), { back: 'p5_overview', up: 'p5_forest', onEnter: () => ctx.hintOnce('p5_roam', ctx.ui.touchMode ? T.roamTouch : T.roam) });
  view('p5_forest', cam([-3, 2.2, 23], [-3, 1.1, 17]), { back: 'p5_gate', up: 'p5_house' });
  view('p5_house', cam([5, 2.3, -3], [3, 1.5, -11]), { back: 'p5_forest', right: 'p5_shed' });
  view('p5_shed', cam([17.5, 2.2, -7], [17.5, 1.6, -13]), { left: 'p5_house', up: 'p5_lake' });
  view('p5_lake', cam([22, 2.2, -24], [24, 1.5, -29]), { back: 'p5_shed', right: 'p5_temple' });
  const door = wpos(ctx, 'temple.door');
  view('p5_temple', cam([24.6, 2.5, -27.7], [door[0], 1.9, door[2]], 52), { left: 'p5_lake', up: () => ctx.flag('cube_taken') ? 'p5_temple_int' : null });
  close('p5_cow', [5.6, 2.4, 49], [5.3, 1.8, 43.5], 'p5_gate');
  // 牛皮斑点直接在牛身上点：镜头推到牛的侧面，整头牛占满画面（原作 0:30 的牛皮图案）
  close('p5_skin', [5.2, 2.3, 47.4], [5.2, 2.2, 43.6], 'p5_cow', 'exterior', 44);
  close('p5_field', [0, 4.9, 4.7], [0, 0, 0.55], 'p5_forest', 'p5_field', 46, () => ctx.hintOnce('p5_field_hint', T.fieldHint));
  close('p5_constellation', [3.0, 3.0, 8.0], [0, 1.9, 0], 'p5_forest', 'p5_constellation', 46, () => ctx.hintOnce('p5_thread_hint', T.threadHint));
  close('p5_barrel', [-5.2, 2.1, 20], [-5.2, 0.95, 17.2], 'p5_forest');
  const hd = BUILDING_DIMS.house_int;
  ctx.views.defineRoamArea('house_int', {
    bounds: [K - hd.width / 2, hd.wallZ, K + hd.width / 2, hd.wallZ + hd.depth], eye: 1.65,
    circles: [[K - 1.2, -0.65, 0.32], [K + 1.25, -0.7, 0.4], [K - 1.65, 0.8, 0.25]],
    boxes: [[K - 1.55, -1.55, K - 0.85, -0.85]],
  });
  ctx.views.define({ id: 'p5_kitchen', zone: 'house_int', roam: true, cam: cam([K, 1.65, 2.3], [K, 1.2, -1], 52), back: 'p5_house' });
  close('p5_cutboard', [K - 1.2, 1.5, 0.5], [K - 1.2, 0.95, -0.7], 'p5_kitchen', 'house_int', 44);
  close('p5_pot', [K + 1.25, 1.3, 0.1], [K + 1.25, 0.76, -0.7], 'p5_kitchen', 'house_int', 44);
  close('p5_menu', [K + 0.6, 1.8, 1.1], [K + 0.6, 1.8, -1.5], 'p5_kitchen', 'house_int', 44);
  // 人物按真实身高坐在桌后：镜头放低、拉近，让两人的上半身占画面（原作 02:15 的构图）
  close('p5_dining', [0, 1.62, 2.25], [0, 1.28, -1.2], 'p5_kitchen', 'p5_dining', 46);
  // 盘子和面包只有巴掌大（真实尺寸），点盘子把镜头推到桌面（原作 8:20 的盘子特写）
  close('p5_table', [-0.12, 1.2, 1.12], [-0.12, 0.98, 0.4], 'p5_dining', 'p5_dining', 40);
  close('p5_toilet', [0, 1.8, 4.2], [0, 1.2, -0.5], 'p5_house', 'p5_toilet', 48);
  close('p5_memory', [500, 1.85, 4.7], [500, 1.4, -0.5], 'p5_toilet', 'memory', 48);
  close('p5_temple_int', [400, 2.4, 4.2], [400, 1.5, -0.4], 'p5_temple', 'temple_int', 54);
  close('p5_altar', [400, 2.4, 3.5], [400, 1.5, -0.4], 'p5_temple_int', 'temple_int', 46);
  ctx.views.define({ id: 'p5_painting', zone: 'temple_int', closeup: true, look: 0, back: 'p5_altar', cam: () => {
    W.painting.updateWorldMatrix(true, false);
    const p = W.painting.getWorldPosition(new THREE.Vector3());
    return cam([p.x, p.y + 0.21, p.z + 0.82], [p.x, p.y + 0.21, p.z], 39);
  } });
}

export async function setup(ctx) {
  W.ctx = ctx; W.zones = {};
  const { exterior: ext, house_int: house, temple_int: temple, memory } = ctx.world.zones;
  clearUnusedColliders(ctx);
  place(ctx, 'gate', 'paradise_gate', ext, P.gate.pos).getObjectByName('gate_doors').visible = false;
  place(ctx, 'shed', 'shed_door', ext, P.shedDoor.pos);
  for (const name of ['shed_doors', 'padlock', 'shed_bolt']) W.shed.getObjectByName(name).visible = false;
  place(ctx, 'cow', 'p5_cow', ext, [5.2, 0.5, 43.5], { scale: 1.25 });
  place(ctx, 'plant', 'p5_plant_pot', ext, [-2, 0.5, 43.5], { scale: 1.7 });
  place(ctx, 'barrel', 'p5_barrel', ext, [-5.2, 0.5, 17.2]);
  place(ctx, 'bucket', 'p5_empty_bucket', ext, [-3.2, 0.5, 18.2], { scale: 1.4 });
  place(ctx, 'fieldSign', 'p5_field', ext, [4, 0.52, 16], { scale: 0.6 });
  W.fieldSign.setState(FIELD_LEVELS[0], FIELD_LEVELS[0].solution, null, 0);
  place(ctx, 'threadSign', sign('林间连线'), ext, [1.3, 0.5, 19]);
  place(ctx, 'field', 'p5_field', zone(ctx, 'p5_field'), [0, 0, 0]);
  place(ctx, 'constellation', 'p5_constellation', zone(ctx, 'p5_constellation'), [0, 0, 0]);
  place(ctx, 'cutboard', 'p5_chopping_block', house, [K - 1.2, 0, -0.65]);
  place(ctx, 'pot', 'p5_pot', house, [K + 1.25, 0, -0.7]);
  place(ctx, 'knifeStand', 'p5_chopping_block', house, [K - 1.65, 0, 0.8], { scale: 0.75 });
  place(ctx, 'knife', 'p5_knife', house, [K - 1.65, 0.685, 0.8], { rotY: 0.5 });
  place(ctx, 'menu', 'p5_menu', house, [K + 0.65, 1.8, -1.5], { scale: 0.7 });
  // 奶奶站在砧板后面，右手举着菜刀（原作 02:40）
  person(ctx, 'grandmother', makeCharacter('margaret_chef'), house, [K - 1.2, 0, -1.12]);
  place(ctx, 'diningDoor', sign('餐室 →', 0.9), house, [K + 2.2, 0, 1.3], { rotY: -Math.PI / 2 });
  const dining = zone(ctx, 'p5_dining');
  place(ctx, 'dining', 'p5_dining_room', dining, [0, 0, 0]);
  place(ctx, 'plate', 'p5_plate', dining, [0, 0.925, 0.35]);
  place(ctx, 'burger', 'p5_burger', dining, [0, 0.929, 0.35]);
  // 面包放在盘子旁的小木板上（真实大小：直径 13 cm）
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.016, 0.5), toon('#a98154')); board.position.set(-0.4, 0.933, 0.4); dining.add(board);
  place(ctx, 'bunBottom', 'p5_bun_bottom', dining, [-0.4, 0.941, 0.28]);
  place(ctx, 'bunTop', 'p5_bun_top', dining, [-0.4, 0.941, 0.5]);
  W.breadBoard = board;
  place(ctx, 'diningMenu', 'p5_menu', dining, [2.2, 1.45, -1.84], { scale: 0.7 });
  // 餐桌后坐着 Gerard 和满头绷带的父亲（原作 02:15）；桌子较高，两人坐在高凳上，腿藏在桌布后
  const gerard = person(ctx, 'gerard', makeCharacter('gerard'), dining, [0.72, 0, -1.24]); gerard.sit(0.6, { hands: 'table' });
  const father = person(ctx, 'father', makeCharacter('nicholas'), dining, [-0.72, 0.12, -1.24]); father.hideGlass(); father.setBandage(true);
  place(ctx, 'latrine', 'p5_latrine', ext, [9, 0.5, -5.5]);
  const toilet = zone(ctx, 'p5_toilet');
  place(ctx, 'toilet', 'p5_latrine', toilet, [0, 0, 0]); W.toilet.setOpen(true);
  // 厕所里 Gerard 坐在木板座位上，双手搭在膝盖上（原作 18:00）
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.55), toon('#8a6c48')); seat.position.set(0, 0.225, -1.0); toilet.add(seat);
  person(ctx, 'toiletGerard', makeCharacter('gerard'), toilet, [0, 0, -0.74]).sit(0.45, { hands: 'knees' });
  // 回忆圆盘挂在厕所后墙、Gerard 头顶上方，不挡住坐着的人
  place(ctx, 'disk', 'p5_memory_disk', toilet, [0, 1.9, -1.18], { scale: 0.62 });
  place(ctx, 'memory', 'p5_memory', memory, [500, 0, 0]);
  ctx.world.root.getObjectByName('memory_frame').visible = false;
  place(ctx, 'cube', 'black_cube', memory, [498.6, 0.86, -0.55], { scale: 1.6 });
  place(ctx, 'holder', makeHolder(), temple, wpos(ctx, 'temple_int.holder'), { scale: 1.4 });
  place(ctx, 'font', makeFont(), temple, wpos(ctx, 'temple_int.font'));
  place(ctx, 'painting', 'p5_painting', W.font.getObjectByName('font_niche'), [0, 0, 0.012], { scale: 0.82 });
  defineViews(ctx);
  ctx.world.colliders.circles.push([5.2, 43.5, 1.1], [-5.2, 17.2, 0.65], [1.3, 19, 0.3]);
  ctx.world.colliders.boxes.push([2.4, 14.8, 5.6, 17.2], [8.1, -7, 9.9, -5.4]);
  const hs = (id, views, object, rest = {}) => ctx.hotspots.define({ id, views, object, cursor: 'zoom', ...rest });
  const proxy = (size, pos, parent) => ctx.hotspots.makeProxy(...size, pos, parent);
  hs('p5_overview_island', ['p5_overview'], proxy([40, 9, 6], [0, 3.6, 43], ext), { goto: 'p5_gate' });
  hs('p5_cow_zoom', ['p5_gate'], W.cow, { goto: 'p5_cow' });
  hs('p5_field_entry', ['p5_forest'], W.fieldSign, { goto: 'p5_field' });
  hs('p5_constellation_entry', ['p5_forest'], W.threadSign, { goto: 'p5_constellation' });
  hs('p5_barrel_zoom', ['p5_forest'], W.barrel, { goto: 'p5_barrel' });
  hs('p5_house_entry', ['p5_house'], proxy([2.0, 2.3, 0.45], [3, 1.65, -11.35], ext), { goto: 'p5_kitchen' });
  hs('p5_kitchen_exit', ['p5_kitchen'], proxy([1.2, 2.25, 0.3], [K, 1.15, 2.85], house), { goto: 'p5_house' });
  hs('p5_dining_entry', ['p5_kitchen'], W.diningDoor, { goto: 'p5_dining' });
  hs('p5_plate_zoom', ['p5_dining'], W.plate, { goto: 'p5_table' });
  hs('p5_cutboard_zoom', ['p5_kitchen'], W.cutboard, { goto: 'p5_cutboard' });
  hs('p5_pot_zoom', ['p5_kitchen'], W.pot, { goto: 'p5_pot' });
  hs('p5_menu_zoom', ['p5_kitchen'], W.menu, { goto: 'p5_menu' });
  hs('p5_toilet_locked', ['p5_house'], W.latrine, { when: () => !ctx.flag('gerard_fed'), onClick: () => ctx.say(T.toiletLocked) });
  hs('p5_toilet_entry', ['p5_house'], W.latrine, { when: () => !!ctx.flag('gerard_fed'), goto: 'p5_toilet' });
  const door = wpos(ctx, 'temple.door');
  const entrance = proxy([1.65, 2.5, 0.4], [door[0], door[1] + 1.2, door[2]], ext); entrance.rotation.y = P.temple.rotY;
  hs('p5_temple_locked', ['p5_temple'], entrance, { when: () => !ctx.flag('cube_taken'), onClick: () => ctx.say(T.templeLocked) });
  hs('p5_temple_entry', ['p5_temple'], entrance, { when: () => !!ctx.flag('cube_taken'), goto: 'p5_temple_int' });
  hs('p5_altar_entry', ['p5_temple_int'], W.holder, { goto: 'p5_altar' });
  hs('p5_font_entry', ['p5_temple_int'], W.font, { goto: 'p5_altar' });
  hs('p5_painting_entry', ['p5_altar'], W.painting, { when: () => !!ctx.flag('font_lit'), goto: 'p5_painting' });
}

export function sync(ctx) {
  if (!W.ctx) return;
  ctx.world.lake.setBlood(0); ctx.world.lake.setPool(false);
  W.cow.setState({ cured: !!ctx.flag('cow_cured'), meat: !!ctx.flag('cow_meat_taken'), pairs: ctx.flag('cow_pairs') || [], selected: ctx.flag('cow_selected') ?? null });
  W.plant.visible = !ctx.flag('lettuce_taken'); W.bucket.visible = !ctx.flag('bucket_taken'); W.knife.visible = !ctx.flag('knife_taken');
  W.barrel.setState(!!ctx.flag('barrel_filled'), !!ctx.flag('cheese_taken'));
  const round = Math.min(ctx.flag('field_round') || 0, FIELD_LEVELS.length - 1), level = FIELD_LEVELS[round];
  W.field.setState(level, ctx.flag('field_positions') || level.pieces.map(() => null), ctx.flag('field_selected') ?? null, round, !!ctx.flag('field_solved'));
  const stage = Math.min(ctx.flag('constellation_stage') || 0, THREAD_LEVELS.length - 1);
  W.constellation.setState(THREAD_LEVELS[stage], ctx.flag('constellation_edges') || [], ctx.flag('constellation_selected') ?? null, stage, !!ctx.flag('constellation_solved'));
  W.pot.setState(!!ctx.flag('pot_loaded'), !!ctx.flag('pot_cooked'), !!ctx.flag('patty_taken'));
  W.bunBottom.visible = W.bunTop.visible = !ctx.flag('buns_taken'); W.breadBoard.visible = !ctx.flag('buns_taken');
  W.burger.setLayers(ctx.flag('burger_layers') || []); W.burger.visible = !ctx.flag('burger_taken');
  W.gerard.visible = !ctx.flag('gerard_fed'); W.latrine.setOpen(!!ctx.flag('gerard_fed'));
  W.cube.visible = !!ctx.flag('memory_seen') && !ctx.flag('cube_taken');
  // 公共动画接口只有插入和点燃；读旧档或新游戏时重建这两种不可逆显示。
  if (W.holder.userData.state.cube && !ctx.flag('holder_cube')) replaceTempleProp(ctx, 'holder', makeHolder());
  if (W.font.userData.state.lit && !ctx.flag('font_lit')) replaceTempleProp(ctx, 'font', makeFont());
  if (ctx.flag('holder_open') && !ctx.flag('holder_closed')) W.holder.open({ instant: true });
  else W.holder.close({ instant: true });
  if (ctx.flag('holder_cube')) W.holder.insertCube({ instant: true });
  const distance = (ctx.flag('holder_lowered') ? 0.8 : 0) - W.holder.userData.state.lowered;
  if (Math.abs(distance) > 0.001) W.holder.lower(distance, { instant: true });
  if (ctx.flag('reflection_seen') && !ctx.flag('font_lit')) W.font.showReflection({ instant: true });
  else W.font.hideReflection({ instant: true });
  if (ctx.flag('font_lit')) W.font.ignite({ instant: true });
  const rope = ctx.world.root.getObjectByName('temple_int_rope');
  rope?.setBottom(W.holder.position.y - W.holder.userData.state.lowered * W.holder.scale.y);
  W.painting.setState({ lit: !!ctx.flag('painting_lit'), cleared: !!ctx.flag('plague_cleared'), framed: !!ctx.flag('boils_framed') });
}
