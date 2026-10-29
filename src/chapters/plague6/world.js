// 第六灾复用岛屿与室内布景（布局沿用第五灾），模型显示始终由存档状态推导。
import * as THREE from 'three';
import { makeProp } from '../../art/props.js';
import { makeMockPerson } from '../../art/cast_mock.js';
import { doctorFaceTexture } from '../../art/props_p6.js';
import { P, SETS, PALISADE } from '../../art/layout.js';
import { BUILDING_DIMS } from '../../art/buildings.js';
import { groundHeight } from '../../art/island.js';
import { TOOTH_LOWER_START, CLOCK_START, TRUNK_START } from './rules.js';
import { T } from './text.js';

export const W = {};
const K = SETS.house_int.origin[0];
const cam = (pos, target, fov = 48) => ({ pos, target, fov });
const wpos = (ctx, name) => ctx.world.anchor(name).getWorldPosition(new THREE.Vector3()).toArray();
const gy = (x, z) => groundHeight(x, z);
const at = (x, z, dy = 0) => [x, gy(x, z) + dy, z];

// 屋里的布置（相对 house_int 原点；后墙 z = -1.6，前墙门洞 z = 3.0）
export const ROOM = {
  clock: [-1.85, -1.32], cabinet: [-0.95, 1.3, -1.47], desk: [0.05, -1.26], pepper: [0.32, -1.1],
  bed: [1.75, 0.25], grandma: [0.98, 0.05], table: [1.0, 1.85], trunk: [-1.92, 1.0],
};

function place(ctx, id, model, parent, pos, { scale = 1, rotY = 0 } = {}) {
  const object = typeof model === 'string' ? makeProp(model) : model;
  object.position.fromArray(pos); object.rotation.y = rotY; object.scale.setScalar(scale);
  parent.add(object); W[id] = object;
  if (object.update) ctx.register('prop', `p6_${id}`, object);
  return object;
}

function person(ctx, id, mockId, parent, pos, rotY = 0) {
  const rig = makeMockPerson(mockId);
  rig.root.position.fromArray(pos); rig.root.rotation.y = rotY; parent.add(rig.root);
  ctx.register('char', `p6_${id}`, rig);
  W[id] = rig.root; W[`${id}Rig`] = rig;
  return rig;
}

function zone(ctx, id) {
  const g = new THREE.Group(); g.name = `zone_${id}`;
  // 独立特写区域不在公共布景里，需要自己的灯光
  g.add(new THREE.HemisphereLight('#f4f1e8', '#5c5850', 1.75));
  const key = new THREE.DirectionalLight('#fffdf5', 1.4); key.position.set(4, 8, 6);
  g.add(key, key.target); ctx.world.root.add(g); ctx.views.registerZone(id, g);
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

/** 医生的法杖：挂在他右手边的一个枢轴上，转枢轴让杖头指向钟面方向（12 点朝上、3 点朝画面右边）。 */
export function pointStaff(hour) { if (W.staffPivot) W.staffPivot.rotation.z = -hour * Math.PI / 6; }

function defineViews(ctx) {
  const view = (id, pose, rest = {}) => ctx.views.define({ id, zone: 'exterior', cam: pose, ...rest });
  const close = (id, pos, target, back, area = 'exterior', fov = 48, onEnter = null) => ctx.views.define({ id, zone: area, closeup: true, look: 0, cam: cam(pos, target, fov), back, ...(onEnter ? { onEnter } : {}) });
  view('p6_overview', cam(P.overviewCam.pos, P.overviewCam.target, P.overviewCam.fov), { fixed: true });
  view('p6_gate', cam([0, 2.3, 48], [0, 1.7, 40]), { back: 'p6_overview', up: () => ctx.flag('gate_open') ? 'p6_forest' : null, onEnter: () => ctx.hintOnce('p6_roam', ctx.ui.touchMode ? T.roamTouch : T.roam) });
  view('p6_forest', cam([-3, 2.2, 23], [-3, 1.1, 17]), { back: 'p6_gate', up: 'p6_grove' });
  view('p6_grove', cam([18, 2.0, 9.5], [18, 1.5, 1.5]), { back: 'p6_forest', up: 'p6_house' });
  view('p6_house', cam([5, 2.3, -3], [3, 1.5, -11]), { back: 'p6_grove', right: 'p6_shed' });
  view('p6_shed', cam([17.5, 2.2, -7], [17.5, 1.6, -13]), { left: 'p6_house', up: 'p6_lake' });
  view('p6_lake', cam([22, 2.2, -24], [24, 1.5, -29]), { back: 'p6_shed', right: 'p6_temple' });
  const door = wpos(ctx, 'temple.door');
  view('p6_temple', cam([24.6, 2.5, -27.7], [door[0], 1.9, door[2]], 52), { left: 'p6_lake', up: 'p6_temple_int' });
  close('p6_doctor', [18, 1.72, 5.0], [18, 1.5, 2.2], 'p6_grove', 'exterior', 46);

  const hd = BUILDING_DIMS.house_int;
  const r = (k, dy = 0) => [K + ROOM[k][0], dy, ROOM[k][1]];
  ctx.views.defineRoamArea('house_int', {
    bounds: [K - hd.width / 2, hd.wallZ, K + hd.width / 2, hd.wallZ + hd.depth], eye: 1.65,
    circles: [[K + ROOM.grandma[0], ROOM.grandma[1], 0.32], [K + ROOM.table[0], ROOM.table[1], 0.38], [K + ROOM.clock[0], ROOM.clock[1], 0.35]],
    boxes: [[K + 1.3, -0.8, K + 2.3, 1.3], [K - 0.55, -1.6, K + 0.65, -0.95], [K - 2.3, 0.6, K - 1.65, 1.4]],
  });
  ctx.views.define({ id: 'p6_room', zone: 'house_int', roam: true, cam: cam([K, 1.65, 2.4], [K + 0.6, 1.2, -1], 52), back: 'p6_house' });
  const clk = r('clock');
  close('p6_clock', [clk[0], 1.74, -0.62], [clk[0], 1.74, -1.12], 'p6_room', 'house_int', 40, () => ctx.hintOnce('p6_clock_hint', T.clockHint));
  close('p6_cabinet', [K + ROOM.cabinet[0], 1.7, -0.32], [K + ROOM.cabinet[0], 1.64, -1.45], 'p6_room', 'house_int', 44);
  const dsk = r('desk');
  close('p6_desk', [dsk[0], 1.45, -0.32], [dsk[0], 0.82, -1.22], 'p6_room', 'house_int', 46);
  const gm = r('grandma');
  close('p6_grandma', [gm[0] + 0.85, 1.12, gm[2] + 0.55], [gm[0], 1.0, gm[2]], 'p6_room', 'house_int', 42);
  const tb = r('table');
  close('p6_flask', [tb[0] - 0.05, 1.22, tb[2] + 0.62], [tb[0], 0.82, tb[2]], 'p6_room', 'house_int', 42, () => ctx.hintOnce('p6_flask_hint', T.flaskHint));
  const tr = r('trunk');
  close('p6_trunk', [tr[0] + 0.85, 0.95, tr[2]], [tr[0], 0.3, tr[2]], 'p6_room', 'house_int', 44);
  // 胸口特写：镜头从病人上方往下看，跟着胸口模型走
  ctx.views.define({ id: 'p6_chest', zone: 'house_int', closeup: true, look: 0, back: 'p6_room', onEnter: () => { if (!ctx.flag('boils_done')) ctx.hintOnce('p6_boils_hint', T.boilsHint); }, cam: () => {
    W.chest.updateWorldMatrix(true, false);
    const p = W.chest.getWorldPosition(new THREE.Vector3());
    return cam([p.x - 0.42, p.y + 0.5, p.z + 0.02], [p.x, p.y, p.z], 44);
  } });
  close('p6_mouth', [0, 1.45, 1.95], [0, 1.45, 0], 'p6_room', 'p6_mouth', 44, () => ctx.hintOnce('p6_teeth_hint', T.teethHint));
  close('p6_memory', [500, 1.55, 3.3], [500, 1.15, -0.6], 'p6_room', 'memory', 48, () => ctx.hintOnce('p6_memory_hint', T.memoryHint));
  close('p6_temple_int', [400, 2.4, 4.2], [400, 1.5, -0.4], 'p6_temple', 'temple_int', 54);
  close('p6_altar', [400, 2.4, 3.5], [400, 1.5, -0.4], 'p6_temple_int', 'temple_int', 46);
  ctx.views.define({ id: 'p6_painting', zone: 'temple_int', closeup: true, look: 0, back: 'p6_altar', cam: () => {
    W.painting.updateWorldMatrix(true, false);
    const p = W.painting.getWorldPosition(new THREE.Vector3());
    return cam([p.x, p.y + 0.21, p.z + 0.82], [p.x, p.y + 0.21, p.z], 39);
  } });
}

export async function setup(ctx) {
  W.ctx = ctx; W.zones = {};
  const { exterior: ext, house_int: house, temple_int: temple, memory } = ctx.world.zones;
  clearUnusedColliders(ctx);

  // ---- 天堂门：门关着，上窗后面是瘟疫医生的鸟嘴面具 ----
  place(ctx, 'gate', 'paradise_gate', ext, P.gate.pos);
  const eyes = W.gate.getObjectByName('gerard_eyes');
  eyes.material = new THREE.MeshBasicMaterial({ map: doctorFaceTexture(), color: '#f2f2f2' });
  eyes.material.userData.outlineParameters = { visible: false };
  place(ctx, 'bottle', 'p6_empty_bottle', ext, at(-1.4, 43.2), { scale: 1.6 });
  place(ctx, 'skull', 'p6_skull', ext, at(1.9, 43.6), { rotY: -0.5 });
  ctx.views.addRoamGate((x, z) => !ctx.flag('gate_open') && z < PALISADE.z + 0.6);

  // ---- 树林：树桩、洋葱、石井 ----
  place(ctx, 'stump', 'p6_stump', ext, at(-5.2, 17.6));
  W.stumpKnife = makeProp('p5_knife'); W.stump.userData.knifeSlot.add(W.stumpKnife);
  place(ctx, 'onion', 'p6_onion_plant', ext, at(-0.6, 18.8), { scale: 1.6 });
  place(ctx, 'well', 'p6_well', ext, at(-1.2, 13.6));
  W.wellKey = makeProp('key'); W.wellKey.scale.setScalar(1.4); W.well.userData.keySlot.add(W.wellKey);

  // ---- 白桦林：岩壁拱门 + 瘟疫医生 ----
  place(ctx, 'cave', 'p6_cave', ext, at(18, 0.4));
  for (const [x, z, seed] of [[14.4, 3.0, 3], [21.8, 3.2, 5], [15.2, 5.8, 7], [22.6, 6.2, 9], [13.6, 1.4, 11]]) {
    const b = makeProp('p3_birch', { height: 7.5, seed }); b.position.fromArray(at(x, z)); ext.add(b);
  }
  const doc = person(ctx, 'doctor', 'plague_doctor', ext, at(18, 2.2));
  const pivot = new THREE.Group(); pivot.name = 'doctor_staff_pivot'; pivot.position.set(0.27, 1.12, 0.14); doc.root.add(pivot);
  const heldStaff = makeProp('p6_staff'); heldStaff.position.y = -0.8; pivot.add(heldStaff);
  W.staffPivot = pivot; pointStaff(0.6);

  // ---- 木屋室内 ----
  const r = (k, y = 0) => [K + ROOM[k][0], y, ROOM[k][1]];
  place(ctx, 'clock', 'p6_clock', house, r('clock'));
  place(ctx, 'cabinet', 'p6_cabinet', house, [K + ROOM.cabinet[0], ROOM.cabinet[1], ROOM.cabinet[2]]);
  place(ctx, 'desk', 'p6_desk', house, r('desk'));
  place(ctx, 'pepper', 'p6_pepper', house, [K + ROOM.pepper[0], 0.785, ROOM.pepper[1]]);
  place(ctx, 'bed', 'p6_bed', house, r('bed'));
  // 病人：头朝后墙（-Z）躺在床上，脚底在床尾；胸口模型挂在他身上（躯干中心离脚底 1.15 m）
  const patient = person(ctx, 'patient', 'gerard_patient', house, [K + ROOM.bed[0], 0.52, ROOM.bed[1] + 0.95]);
  patient.setPose('lie');
  W.chest = makeProp('p6_chest'); W.chest.position.set(0, 0.352, -1.15); patient.root.add(W.chest);
  place(ctx, 'stool', 'p6_stool', house, r('grandma'));
  person(ctx, 'grandma', 'margaret', house, r('grandma'), Math.PI / 2).setPose('sit');
  place(ctx, 'table', 'p6_round_table', house, r('table'));
  place(ctx, 'flask', 'p6_flask', house, [K + ROOM.table[0] + 0.08, 0.74, ROOM.table[1]]);
  place(ctx, 'book', 'p6_book', house, [K + ROOM.table[0] - 0.16, 0.74, ROOM.table[1] + 0.06], { rotY: 0.3 });
  place(ctx, 'trunk', 'p6_trunk', house, r('trunk'), { rotY: Math.PI / 2 });

  // ---- 病人的嘴（独立特写台面）----
  place(ctx, 'mouth', 'p6_mouth', zone(ctx, 'p6_mouth'), [0, 1.45, 0]);

  // ---- 回忆：鹿头人举着心站在少年 Jakob 身边 ----
  ctx.world.root.getObjectByName('memory_frame').visible = false;
  place(ctx, 'memoryRoom', 'p6_memory', memory, [500, 0, 0]);
  person(ctx, 'deer', 'nicholas_deer', memory, [500.45, 0, -0.55]);
  person(ctx, 'jakob', 'jakob_child', memory, [499.75, 0, -0.35], 0.3);
  W.deerHeart = makeProp('p6_sick_heart'); W.deerRig.setHeld(W.deerHeart);
  place(ctx, 'cube', 'black_cube', memory, [499.6, 0.76, -0.6], { scale: 1.6 });

  // ---- 神殿：法杖靠在墙边；吊架 / 圣水盆 / 画同第五灾 ----
  place(ctx, 'templeStaff', 'p6_staff', temple, [400 - 1.7, 0, -1.25]).rotation.z = 0.16;
  place(ctx, 'holder', makeHolder(), temple, wpos(ctx, 'temple_int.holder'), { scale: 1.4 });
  place(ctx, 'font', makeFont(), temple, wpos(ctx, 'temple_int.font'));
  place(ctx, 'painting', 'p6_painting', W.font.getObjectByName('font_niche'), [0, 0, 0.012], { scale: 0.82 });

  // ---- 小屋：门敞开（同第五灾）----
  place(ctx, 'shed', 'shed_door', ext, P.shedDoor.pos);
  for (const name of ['shed_doors', 'padlock', 'shed_bolt']) W.shed.getObjectByName(name).visible = false;

  defineViews(ctx);
  ctx.world.colliders.circles.push([-5.2, 17.6, 0.45], [-1.2, 13.6, 0.75], [18, 2.2, 0.4], [1.9, 43.6, 0.35]);
  ctx.world.colliders.boxes.push([13.2, -0.4, 22.8, 1.0]);

  const hs = (id, views, object, rest = {}) => ctx.hotspots.define({ id, views, object, cursor: 'zoom', ...rest });
  const proxy = (size, pos, parent) => ctx.hotspots.makeProxy(...size, pos, parent);
  hs('p6_overview_island', ['p6_overview'], proxy([40, 9, 6], [0, 3.6, 43], ext), { goto: 'p6_gate' });
  hs('p6_doctor_zoom', ['p6_grove'], W.doctor, { when: () => !!ctx.flag('gate_open'), goto: 'p6_doctor' });
  hs('p6_house_entry', ['p6_house'], proxy([2.0, 2.3, 0.45], [3, 1.65, -11.35], ext), { goto: 'p6_room' });
  hs('p6_room_exit', ['p6_room'], proxy([1.2, 2.25, 0.3], [K, 1.15, 2.85], house), { goto: 'p6_house' });
  hs('p6_clock_zoom', ['p6_room'], W.clock, { goto: 'p6_clock' });
  hs('p6_cabinet_zoom', ['p6_room'], W.cabinet, { goto: 'p6_cabinet' });
  hs('p6_desk_zoom', ['p6_room'], W.desk, { goto: 'p6_desk' });
  hs('p6_grandma_zoom', ['p6_room'], W.grandma, { goto: 'p6_grandma' });
  hs('p6_flask_zoom', ['p6_room'], W.table, { goto: 'p6_flask' });
  hs('p6_trunk_zoom', ['p6_room'], W.trunk, { goto: 'p6_trunk' });
  hs('p6_patient', ['p6_room'], W.patientRig.parts.body, { goto: 'p6_chest' });
  hs('p6_patient_face', ['p6_room', 'p6_chest'], W.patientRig.parts.head, {
    when: () => !!ctx.flag('medicine_given'), goto: 'p6_mouth',
  });
  const door = wpos(ctx, 'temple.door');
  const entrance = proxy([1.65, 2.5, 0.4], [door[0], door[1] + 1.2, door[2]], ext); entrance.rotation.y = P.temple.rotY;
  hs('p6_temple_entry', ['p6_temple'], entrance, { goto: 'p6_temple_int' });
  hs('p6_altar_entry', ['p6_temple_int'], W.holder, { goto: 'p6_altar' });
  hs('p6_font_entry', ['p6_temple_int'], W.font, { goto: 'p6_altar' });
  hs('p6_painting_entry', ['p6_altar'], W.painting, { when: () => !!ctx.flag('font_lit'), goto: 'p6_painting' });
}

export function sync(ctx) {
  if (!W.ctx) return;
  const f = (k) => ctx.flag(k);
  ctx.world.lake.setBlood(0); ctx.world.lake.setPool(false);
  W.gate.reset();
  if (f('gate_open')) W.gate.openDoors({ instant: true });
  else if (f('hand_out')) { W.gate.openHatch('up', { instant: true }); W.gate.openHatch('low', { instant: true }); W.gate.extendHand({ instant: true }); }
  W.bottle.visible = !f('gate_bottle_taken');
  W.skull.setBleeding(!!f('skull_bled'));
  W.stump.setState({ knife: !f('knife_taken'), mushroom: !f('mushroom_taken') });
  W.onion.visible = !f('onion_taken');
  W.well.setKey(!f('key_taken'));
  W.doctor.visible = !!f('gate_open');
  W.staffPivot.visible = !!f('staff_given');
  if (!f('doctor_pointing')) pointStaff(0.6);
  W.templeStaff.visible = !f('staff_taken');
  W.desk.setState({ open: !!f('desk_open'), needle: !f('needle_taken') });
  W.pepper.visible = !f('pepper_taken');
  W.cabinet.setState({ open: !!f('cabinet_open'), bottles: !f('bottles_taken') });
  W.chest.setState({ popped: f('boils_popped') || [], done: !!f('boils_done'), cut: !!f('chest_cut'), heartTaken: !!f('heart_taken'), clock: !!f('clock_heart_placed'), sewn: !!f('chest_sewn') });
  W.mouth.setState(f('teeth_order') || TOOTH_LOWER_START, f('teeth_selected') ?? null, !!f('teeth_done'));
  W.clock.setHands(f('clock_x') ?? CLOCK_START.x, f('clock_dots') ?? CLOCK_START.dots);
  W.clock.setOpen(!!f('clock_open')); W.clock.setHeart(!!f('clock_open') && !f('clock_heart_taken'));
  W.flask.setLayers(f('medicine_taken') ? [] : f('flask_layers') || [], !!f('medicine_made') && !f('medicine_taken'));
  W.trunk.setLetters(f('trunk_letters') || TRUNK_START); W.trunk.setOpen(!!f('trunk_open'));
  W.deerHeart.visible = !!f('heart_given');
  W.deerRig.parts.armR.rotation.z = f('heart_given') ? 2.5 : 0.08;
  W.cube.visible = !!f('heart_given') && !f('cube_taken');
  // 公共动画接口只有插入和点燃；读旧档或新游戏时重建这两种不可逆显示（同第五灾）
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
