// 第四灾复用全岛和室内布景；章节锚点、镜头与碰撞只在这里定义。
import { P, SETS } from '../../art/layout.js';
import { BUILDING_DIMS } from '../../art/buildings.js';
import { makeProp } from '../../art/props.js';
import { makeCharacter } from '../../art/characters.js';
import * as THREE from 'three';
import { toon, unlit } from '../../art/materials.js';
import * as art from '../../art/props_flies.js';
import { CRAB_LEVELS, initialShells } from './puzzles.js';
import { T } from './text.js';

export const SPOTS = {
  cocoon: [-5.5, 0.5, 17.2], trap: [-7.4, 0.5, 44.1], rabbit: [17, 0.5, 2.5],
  pit: [8.5, 0.5, -6.5], crab: [24, 0.5, -27], owl: [...P.owlTotem.pos],
  kitchen: SETS.house_int.origin[0], temple: SETS.temple_int.origin[0], memory: SETS.memory.origin[0],
};
export const W = {};

export function place(ctx, id, object, parent, pos, { scale = 1, rotY = 0 } = {}) {
  object.position.fromArray(pos); object.scale.setScalar(scale); object.rotation.y = rotY;
  object.userData.home = [...pos];
  parent.add(object); W[id] = object;
  if (object.update) ctx.register('prop', `p4_${id}`, object);
  return object;
}
const _inv = new THREE.Matrix4(), _mat = new THREE.Matrix4(), _box = new THREE.Box3(), _part = new THREE.Box3(), _sc = new THREE.Vector3();
/**
 * 放大小物件的点击范围：在物件下挂一个不可见的点击盒（每边至少 min 米，并比实体多出 pad 米），
 * 手机上和漫游走远了也点得到。include 里的物件（陷阱旁的鸟、洞口的兔子）一起算进盒子。
 * min / 盒子按物件自己的局部轴；只往上长高、底边贴着实体，不会陷进地里。同一物件只挂一个。
 */
export function fatten(ctx, object, { min = [0.5, 0.5, 0.5], pad = 0.1, include = [] } = {}) {
  if (!object || object.userData.fat) return null;
  object.updateWorldMatrix(true, true);
  _inv.copy(object.matrixWorld).invert();
  _box.makeEmpty();
  for (const root of [object, ...include]) {
    root.updateWorldMatrix(true, true);
    root.traverse((o) => {
      if (!o.isMesh || o.userData.proxy || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      _part.copy(o.geometry.boundingBox).applyMatrix4(_mat.multiplyMatrices(_inv, o.matrixWorld));
      _box.union(_part);
    });
  }
  if (_box.isEmpty()) return null;
  const s = object.getWorldScale(_sc).x || 1;   // 世界缩放（物件一律 1，只有猫头鹰上的宝石带父级缩放）
  const size = ['x', 'y', 'z'].map((a, i) => Math.max((_box.max[a] - _box.min[a]) * s + 2 * pad, min[i]) / s);
  const at = [(_box.min.x + _box.max.x) / 2, _box.min.y - 0.02 / s + size[1] / 2, (_box.min.z + _box.max.z) / 2];
  const proxy = ctx.hotspots.makeProxy(size[0], size[1], size[2], at, object);
  object.userData.fat = proxy;
  return proxy;
}
/** 回忆里父亲坐的木凳（座面高 0.49，与高背椅一致）。 */
function memoryStool() {
  const g = new THREE.Group(); g.name = 'p4_memory_stool';
  const wood = toon('#7a6046');
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.05, 24), wood); seat.position.y = 0.465; g.add(seat);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.46, 8), wood);
    leg.position.set(Math.sin(a) * 0.14, 0.22, Math.cos(a) * 0.14); leg.rotation.set(Math.cos(a) * 0.15, 0, -Math.sin(a) * 0.15); g.add(leg);
  }
  return g;
}
function person(ctx, id, model, parent, pos, opts = {}) {
  const rig = makeCharacter(model); place(ctx, id, rig.root, parent, pos, opts); ctx.register('char', `p4_${id}`, rig); W[`${id}Rig`] = rig; return rig;
}
const wpos = (ctx, name) => ctx.world.anchor(name).getWorldPosition(new ctx.THREE.Vector3()).toArray();
const cam = (pos, target, fov = 48) => ({ pos, target, fov });

function clearUnusedColliders(ctx) {
  const col = ctx.world.colliders;
  const near = (x, z, p) => Math.hypot(x - p.pos[0], z - p.pos[2]) < 0.08;
  col.circles = col.circles.filter(([x, z, r]) => ![[P.pump, 0.45], [P.owlTotem, 0.6], [P.margaret, 0.55], [P.bucket, 0.3]]
    .some(([p, radius]) => near(x, z, p) && Math.abs(r - radius) < 0.001));
  col.segments = col.segments.filter(([ax, az, bx, bz, r]) => !((near((ax + bx) / 2, (az + bz) / 2, P.rowboat) && Math.abs(r - 0.62) < 0.001)
    || (near((ax + bx) / 2, (az + bz) / 2, P.goat) && Math.abs(r - 0.3) < 0.001)));
}

function defineViews(ctx) {
  const view = (id, pose, rest = {}) => ctx.views.define({ id, zone: 'exterior', cam: pose, ...rest });
  view('overview', cam(P.overviewCam.pos, P.overviewCam.target, P.overviewCam.fov), { fixed: true });
  view('beach_mid', cam([0, 2.3, 47], [0, 1.7, 39]), { back: 'overview', left: 'bird_clearing', up: 'forest_path', onEnter: () => { ctx.hintOnce('p4_roam', ctx.ui.touchMode ? T.roamTouch : T.roam); } });
  view('bird_clearing', cam([-7.1, 1.7, 46.4], [-7.1, 0.55, 44.1]), { right: 'beach_mid' });
  view('forest_path', cam([0, 2.1, 35], [0, 1.7, 28]), { back: 'beach_mid', up: 'forest_clearing' });
  view('forest_clearing', cam([-3, 2.2, 22], [-5.5, 1, 17.2]), { back: 'forest_path', right: 'pump_clearing', up: 'house_clearing' });
  view('pump_clearing', cam([17, 1.8, 6.2], [17, 0.6, 2.5]), { left: 'forest_clearing', up: 'house_clearing' });
  view('house_clearing', cam([5, 2.4, -3], [3, 1.8, -10]), { back: 'forest_clearing', left: 'owl_clearing', right: 'shed_clearing', up: 'pit_clearing' });
  view('pit_clearing', cam([8.5, 2.1, -3.5], [8.5, 0.8, -6.5]), { left: 'house_clearing' });
  view('owl_clearing', cam([-2, 2.3, -3.5], [-2, 1.8, -8]), { right: 'house_clearing' });
  view('shed_clearing', cam([15, 2.1, -7], [17.5, 1.7, -13]), { left: 'house_clearing', up: 'soul_path' });
  view('soul_path', cam([21, 2.1, -17], [21, 1.5, -23]), { back: 'shed_clearing', up: 'lake_shore' });
  view('lake_shore', cam([22, 2.2, -24], [24, 0.8, -27]), { back: 'soul_path', right: 'temple_door' });
  const door = wpos(ctx, 'temple.door');
  view('temple_door', cam([24.6, 2.5, -27.7], [door[0], 1.9, door[2]], 52), { left: 'lake_shore', up: () => ctx.flag('p4_gate_open') ? 'temple_int' : null });
  const close = (id, pos, target, back, zone = 'exterior', fov = 45) => ctx.views.define({ id, zone, closeup: true, cam: cam(pos, target, fov), back });
  close('cocoon', [-5.5, 2.3, 20], [-5.5, 0.9, 17.2], 'forest_clearing');
  close('trap', [-7.1, 1.15, 45.3], [-7.1, 0.5, 44.1], 'bird_clearing');
  close('rabbit', [17.1, 1.1, 3.9], [17.1, 0.55, 2.5], 'pump_clearing');
  close('pit', [8.5, 2.3, -5.2], [8.5, 0.6, -6.5], 'house_clearing');
  close('owl', [-2, 2.3, -3.5], [-2, 1.7, -8], 'owl_clearing');
  ctx.views.define({ id: 'crab_board', zone: 'exterior', closeup: true, back: 'lake_shore', look: 0,
    cam: () => {
      const level = CRAB_LEVELS[Math.min(Number(ctx.flag('p4_crab_round')) || 0, 2)];
      const height = (level.size[1] * 0.36 + 0.95) / (2 * Math.tan(48 * Math.PI / 360));
      return cam([24, 0.56 + height, -26.999], [24, 0.56, -27], 48);
    },
  });
  close('crab_feast', [24, 1.5, -23.2], [24, 0.55, -24.9], 'lake_shore');
  const k = SPOTS.kitchen, hd = BUILDING_DIMS.house_int;
  ctx.views.defineRoamArea('house_int', {
    bounds: [k - hd.width / 2, hd.wallZ, k + hd.width / 2, hd.wallZ + hd.depth], eye: 1.65,
    circles: [[k - 1.4, -0.85, 0.52], [k + 1.3, -0.8, 0.68]], boxes: [[k - 0.42, -1.4, k + 0.42, -0.7]],
  });
  ctx.views.define({ id: 'house_int', zone: 'house_int', roam: true, cam: cam([k, 1.65, 2.3], [k, 1.1, -1.2], 52), back: 'house_clearing' });
  close('temple_int', [400, 2, 4.2], [400, 1.5, -0.85], 'temple_door', 'temple_int', 54);
  close('window', [400.65, 1.95, 0.9], [400.65, 1.92, -1.8], 'temple_int', 'temple_int', 43);
  close('altar', [400, 2.25, 3.5], [400, 1.6, -0.4], 'temple_int', 'temple_int', 44);
  close('book', [401.45, 1.62, -0.5], [401.45, 0.8, -0.85], 'temple_int', 'temple_int', 38);   // 俯视桌上的书
  close('memory', [500, 1.8, 3.4], [500, 1, -0.5], 'temple_int', 'memory', 44);
}

function setupBoard(ctx, ext) {
  const THREE = ctx.THREE, root = new THREE.Group(); root.name = 'p4_crab_board';
  place(ctx, 'board', root, ext, SPOTS.crab);
  W.boards = CRAB_LEVELS.map((level, round) => {
    const g = new THREE.Group(); root.add(g);
    const cell = 0.36, offset = [(level.size[0] - 1) / 2, (level.size[1] - 1) / 2];
    const at = ([x, y], h = 0.06) => [(x - offset[0]) * cell, h, (y - offset[1]) * cell];
    const board = new THREE.Mesh(new THREE.BoxGeometry(level.size[0] * cell + 0.25, 0.05, level.size[1] * cell + 0.25), toon('#a9a68c'));
    g.add(board);
    const cells = [];
    for (let y = 0; y < level.size[1]; y++) for (let x = 0; x < level.size[0]; x++) {
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(cell * 0.94, cell * 0.94), unlit((x + y) % 2 ? '#b3b096' : '#b9b59b'));
      tile.rotation.x = -Math.PI / 2; tile.position.fromArray(at([x, y], 0.028)); g.add(tile);
      cells.push({ object: tile, cell: [x, y] });
    }
    for (const p of level.hazards) { const u = art.makeUrchin(); u.position.fromArray(at(p)); g.add(u); }
    const goal = art.makeGoal(); goal.position.fromArray(at(level.goal)); g.add(goal);
    const shells = level.shells.map((s) => { const o = art.makeShell(s.dir); g.add(o); return o; });
    const crab = art.makeCrab(); crab.position.fromArray(at(level.start)); g.add(crab);
    const title = art.label(`寄居蟹 · ${round + 1} / 3`, 1.6, 0.22); title.rotation.x = -Math.PI / 2; title.position.set(0, 0.07, -(level.size[1] * cell / 2 + 0.23)); g.add(title);
    const reset = art.label('重摆贝壳', 0.85, 0.23); reset.rotation.x = -Math.PI / 2; reset.position.set(0, 0.07, level.size[1] * cell / 2 + 0.26); g.add(reset);
    return { group: g, at, cells, shells, crab, reset };
  });
}

export async function setup(ctx) {
  const ext = ctx.world.zones.exterior, house = ctx.world.zones.house_int, temple = ctx.world.zones.temple_int, memory = ctx.world.zones.memory;
  W.ctx = ctx; clearUnusedColliders(ctx);
  place(ctx, 'gate', makeProp('paradise_gate'), ext, P.gate.pos);
  W.gate.getObjectByName('gate_doors').visible = false;
  place(ctx, 'shed', makeProp('shed_door'), ext, P.shedDoor.pos);
  for (const n of ['shed_doors', 'padlock', 'shed_bolt']) { const o = W.shed.getObjectByName(n); if (o) o.visible = false; }
  place(ctx, 'cocoon', art.makeCocoon(), ext, SPOTS.cocoon);
  place(ctx, 'fly', art.makeFlyMan(), ext, [-5.5, 2.1, 17.2]);
  place(ctx, 'trap', art.makeTrap(), ext, SPOTS.trap);
  place(ctx, 'bird', art.makeBird(), ext, [-6.82, 0.5, 44.2]);
  place(ctx, 'rabbitHole', art.makePit(0.3), ext, SPOTS.rabbit);
  place(ctx, 'rabbit', art.makeRabbit(), ext, SPOTS.rabbit);
  place(ctx, 'pit', art.makePit(0.8), ext, SPOTS.pit);   // 直径约 1.1 m，刚好容下蜷着的成年人
  // Gerard 蜷缩在坑里（原作 02:15 从木板缝里看到他侧躺着），身体一半沉在黑色坑口下面
  const uncle = person(ctx, 'uncle', 'gerard', ext, [8.5, 0.36, -6.5], { rotY: 0.35 }); uncle.curlUp({ instant: true });
  // 蜷起来的身体以头和髋的中点对准坑心
  W.uncle.updateMatrixWorld(true);
  const mid = uncle.joints.head.getWorldPosition(new THREE.Vector3()).add(uncle.joints.body.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
  W.uncle.position.x += SPOTS.pit[0] - mid.x; W.uncle.position.z += SPOTS.pit[2] - mid.z;
  W.branches = [0, 1, 2].map((n) => place(ctx, `branch${n}`, art.makePlank(), ext, [8.1 + n * 0.4, 0.66, -6.5], { rotY: Math.PI / 2 + (n - 1) * 0.09 }));
  const owl = place(ctx, 'owl', makeProp('owl_totem'), ext, SPOTS.owl, { scale: 1.4 });
  place(ctx, 'gem', art.makeGem(), owl, [0, 1.02, 0.23], { scale: 0.7 });
  place(ctx, 'owlHeart', art.makeHeart(), owl, [0, 1.03, 0.23], { scale: 0.4 });
  place(ctx, 'freeCrab', art.makeCrab(), ext, [24, 0.6, -24.9]);
  const remains = art.spiralShell({ length: 0.27, radius: 0.085, color: '#e1d6bd', name: 'p4_crab_remains' });
  remains.rotation.set(-Math.PI / 2 + 0.16, 0, 0); remains.position.set(0, 0.075, 0); remains.rotation.z = 0.5;
  const remainsRoot = new THREE.Group(); remainsRoot.add(remains); place(ctx, 'crabRemains', remainsRoot, ext, [24.1, 0.6, -24.9]);
  for (const [id, pos] of [['crab', [24, 0.58, -24.9]], ['rabbit', [17.22, 0.5, 2.78]], ['bird', [-6.82, 0.58, 44.2]]]) {
    place(ctx, `${id}Heart`, art.makeHeart(id), ext, pos);
  }
  const k = SPOTS.kitchen;
  place(ctx, 'table', makeProp('dining_table'), house, [k - 1.4, 0, -0.85]);
  place(ctx, 'candle', art.makeCandle(), house, [k - 1.4, 0.77, -0.85]);
  place(ctx, 'chest', art.makeChest(), house, [k, 0, -1.05]);
  place(ctx, 'carrot', art.makeCarrot(), house, [k, 0.57, -0.93]);
  place(ctx, 'cauldron', art.makeCauldron(), house, [k + 1.3, 0, -0.8]);
  // 奶奶坐在大锅里（原作 11:50），裙子藏在锅里不显示
  const granny = person(ctx, 'grandmother', 'margaret_pot', house, [k + 1.3, 0.22, -0.84]);
  for (const tag of ['skirt', 'apron', 'shoe']) granny.showTag(tag, false);
  const d = wpos(ctx, 'temple.door');
  place(ctx, 'stoneDoor', art.makeStoneDoor(), ext, d, { rotY: P.temple.rotY });
  place(ctx, 'doorGem', art.makeGem(), W.stoneDoor, [0, 1.5, 0.15]);
  // 父亲坐在高背椅上，双手捧着黑方块举在脸旁（原作 13:05 / 18:30）
  person(ctx, 'father', 'nicholas', temple, [398.5, 0, -0.87]); W.fatherRig.hideGlass(); W.fatherRig.holdCube({ instant: true });
  place(ctx, 'chair', makeProp('high_chair'), temple, [398.5, 0, -1.02]);
  place(ctx, 'fatherCube', makeProp('black_cube'), W.fatherRig.cubeMount, [0, 0, 0], { scale: 1.05 });
  place(ctx, 'bookTable', makeProp('dining_table'), temple, [401.45, 0, -0.85]);
  place(ctx, 'book', art.makeBook(), temple, [401.45, 0.77, -0.85]);
  place(ctx, 'window', art.makeWindow(), temple, [400.65, 1.95, -1.8]);
  place(ctx, 'insideFly', art.makeFlyMan(), temple, [400.65, 2, -1.1]);
  place(ctx, 'cube', makeProp('black_cube'), temple, [398.5, 0.68, -0.7], { scale: 1.25 });
  place(ctx, 'holder', makeProp('winged_holder'), temple, wpos(ctx, 'temple_int.holder'), { scale: 1.4 });
  // 房间已有随容器下降的绳子，移除模型自带的长绳，避免它扩大交互包围盒。
  W.holder.getObjectByName('holder_rope').removeFromParent();
  place(ctx, 'font', makeProp('font'), temple, wpos(ctx, 'temple_int.font'));
  const water = W.font.getObjectByName('font_liquid').material.uniforms;
  for (const [key, color] of Object.entries({ uRedDark: '#4b5957', uRedMid: '#778783', uRedLight: '#a0b0a8', uGreyDark: '#4b5957', uGreyLight: '#a0b0a8' })) water[key].value.set(color);
  W.font.userData.state.ambient = false;
  for (let i = 0; i < 4; i++) W.font.getObjectByName(`font_drop_${i}`).material.color.set('#8b9e99');
  place(ctx, 'omen', art.makeOmen(), temple, [400, 1.9, -1.75]);
  for (const n of ['temple_int_windowL', 'temple_int_windowR']) {
    const o = ctx.world.root.getObjectByName(n); if (o) o.visible = false;
  }
  // 回忆（原作 18:44）：父亲坐在凳子上，一只手搭在站在身旁的少年 Jakob 肩上
  place(ctx, 'memoryStool', memoryStool(), memory, [499.55, 0, -0.62]);
  person(ctx, 'memoryFather', 'nicholas', memory, [499.55, 0, -0.5]); W.memoryFatherRig.hideGlass();
  person(ctx, 'memorySon', 'jakob_child', memory, [500.05, 0, -0.36], { rotY: -0.15 });
  W.memoryFatherRig.restHandOn([0.38, 1.12, 0.12], { side: 'L' });
  setupBoard(ctx, ext); defineViews(ctx);
  for (const [x, , z] of [SPOTS.owl, SPOTS.cocoon]) ctx.world.colliders.circles.push([x, z, 0.75]);
  ctx.world.colliders.circles.push([SPOTS.pit[0], SPOTS.pit[2], 0.7]);
  ctx.world.colliders.boxes.push([21.9, -28.8, 26.1, -25.2]);
  // 小物件和小动物的点击盒放大（手机上、漫游离远了点不中）：数字是最小边长（米），按物件自己的轴
  fatten(ctx, W.trap, { min: [1.2, 0.7, 1.0] });                              // 翘起的石板和板下空地
  fatten(ctx, W.rabbitHole, { min: [1.1, 0.7, 1.1], include: [W.rabbit] });  // 浅浅的兔洞和洞口的兔子
  fatten(ctx, W.rabbit, { min: [0.55, 0.5, 0.55] });
  fatten(ctx, W.bird, { min: [0.6, 0.55, 0.6] });
  fatten(ctx, W.freeCrab, { min: [0.7, 0.4, 0.7] });
  for (const id of ['crab', 'rabbit', 'bird']) fatten(ctx, W[`${id}Heart`], { min: [0.42, 0.42, 0.42] });
  fatten(ctx, W.carrot, { min: [0.45, 0.5, 0.45] });
  fatten(ctx, W.candle, { min: [0.45, 0.5, 0.45] });
  fatten(ctx, W.cube, { min: [0.55, 0.55, 0.55] });
  fatten(ctx, W.gem, { min: [0.55, 0.6, 0.5] });
  fatten(ctx, W.omen, { min: [1.1, 1, 0.3] });
  const proxy = (id, ids, dims, pos, parent, rest = {}) => ctx.hotspots.define({ id, views: ids, object: ctx.hotspots.makeProxy(...dims, pos, parent), cursor: 'zoom', ...rest });
  proxy('overview_island', ['overview'], [40, 9, 6], [0, 3.6, 43], ext, { goto: 'beach_mid' });
  proxy('house_entry', ['house_clearing'], [2.5, 2.3, 0.6], [3, 1.5, -11.2], ext, { goto: 'house_int' });
  const heartReady = (id) => !!ctx.flag(`p4_${id}_eaten`) && !ctx.flag(`p4_${id}_heart_taken`);
  proxy('house_exit', ['house_int'], [1.2, 2.3, 0.3], wpos(ctx, 'house_int.door').map((n, i) => i === 1 ? 1.15 : n), house, { goto: 'house_clearing' });
  for (const [id, ids, object, target] of [
    ['cocoon_zoom', ['forest_clearing'], W.cocoon, 'cocoon'], ['trap_zoom', ['bird_clearing'], W.trap, 'trap'],
    ['rabbit_zoom', ['pump_clearing'], W.rabbitHole, 'rabbit'], ['pit_zoom', ['pit_clearing'], W.pit, 'pit'],
    ['owl_zoom', ['owl_clearing'], W.owl, 'owl'], ['crab_zoom', ['lake_shore'], W.board, 'crab_board'],
  ]) ctx.hotspots.define({
    id, views: ids, object, cursor: 'zoom', goto: target,
    // 猎物被吃掉、心脏摆在洞口 / 陷阱旁时，让出点击给心脏（心脏的点击盒比洞口 / 石板小，重叠处要先点中它）；
    // 蟹盘通关后蟹盘特写没有用了，让出点击给岸边的蟹
    when: () => id === 'crab_zoom' ? (Number(ctx.flag('p4_crab_round')) || 0) < 3
      : id === 'rabbit_zoom' ? !heartReady('rabbit') : id === 'trap_zoom' ? !heartReady('bird') : true,
  });
}

export function sync(ctx) {
  if (!W.ctx) return;
  ctx.world.lake.setBlood(0); ctx.world.lake.setPool(false);
  W.cocoon.setOpen(!!ctx.flag('p4_fly_awake'));
  W.stoneDoor.setOpen(!!ctx.flag('p4_gate_open')); W.doorGem.visible = !!ctx.flag('p4_gate_open');
  W.chest.setOpen(!!ctx.flag('p4_chest_open'));
  W.carrot.visible = !!ctx.flag('p4_chest_open') && !ctx.flag('p4_carrot_taken');
  W.candle.visible = !ctx.flag('p4_candle_taken');
  W.branches.forEach((b, i) => { b.visible = !ctx.flag(`p4_branch_${i}`); });
  W.uncle.visible = true;   // 木板缝里一直能看到他蜷在坑里
  W.trap.setState(!!ctx.flag('p4_trap_propped'), !!ctx.flag('p4_trap_baited'), !!ctx.flag('p4_bird_eaten'));
  W.bird.visible = !!ctx.flag('p4_trap_propped') && !!ctx.flag('p4_trap_baited'); W.bird.setDead(!!ctx.flag('p4_bird_eaten'));
  W.rabbit.visible = !!ctx.flag('p4_rabbit_lured'); W.rabbit.setDead(!!ctx.flag('p4_rabbit_eaten'));
  for (const id of ['crab', 'rabbit', 'bird']) W[`${id}Heart`].visible = !!ctx.flag(`p4_${id}_eaten`) && !ctx.flag(`p4_${id}_heart_taken`);
  W.fly.visible = !!ctx.flag('p4_fly_awake') && !ctx.flag('p4_father_taken');
  const flyPos = !ctx.flag('p4_crab_eaten') ? SPOTS.crab : !ctx.flag('p4_rabbit_eaten') ? SPOTS.rabbit : !ctx.flag('p4_bird_eaten') ? SPOTS.trap : wpos(ctx, 'temple.door');
  W.fly.position.set(flyPos[0], flyPos[1] + 2, flyPos[2] - 0.5);
  if ((ctx.flag('p4_crab_round') || 0) >= 3 && !ctx.flag('p4_crab_eaten')) W.fly.position.set(24, 2.5, -24.9);
  W.freeCrab.visible = (ctx.flag('p4_crab_round') || 0) >= 3 && !ctx.flag('p4_crab_eaten');
  W.crabRemains.visible = !!ctx.flag('p4_crab_eaten');
  W.father.position.fromArray(W.father.userData.home);
  W.father.visible = !ctx.flag('p4_father_taken'); W.insideFly.visible = false;
  W.insideFly.position.fromArray(W.insideFly.userData.home);
  const selectedTab = ctx.flag('p4_window_selected');
  W.window.setState(ctx.flag('p4_window') || [1, 1, 1, 1], !!ctx.flag('p4_window_open'), Number.isInteger(selectedTab) ? selectedTab : null);
  W.cube.visible = !!ctx.flag('p4_memory_seen') && !ctx.flag('p4_cube_taken');
  const altar = !!ctx.flag('p4_cube_taken'); W.holder.visible = altar; W.font.visible = altar; W.omen.visible = !!ctx.flag('p4_holder_lowered');
  const rope = ctx.world.root.getObjectByName('temple_int_rope'); if (rope) rope.visible = altar;
  const round = ctx.flag('p4_crab_round') || 0;
  W.boards.forEach((b, i) => {
    b.group.visible = i === Math.min(round, 2);
    const shells = i === round ? ctx.flag('p4_crab_shells') || initialShells(CRAB_LEVELS[i]) : initialShells(CRAB_LEVELS[i]);
    b.shells.forEach((s, j) => { s.position.fromArray(b.at(shells[j])); s.setSelected(i === round && ctx.flag('p4_crab_selected') === j); });
    b.crab.position.fromArray(b.at(CRAB_LEVELS[i].start)); b.crab.rotation.y = Math.PI / 2; b.crab.visible = round < 3;
  });
}
