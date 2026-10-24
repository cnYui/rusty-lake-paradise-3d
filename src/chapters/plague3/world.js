// 第三灾布景（docs/plague3_design.md 第 0、1、2 节）：把第一灾留下的世界改成“蛙灾已经结束、湖水干净”的样子，
// 定义全部开放室外视图 / 总览 / 石屋（可走动）/ 神殿全景 / 白桦林（独立 zone，可走动），以及进出房子、神殿、白桦林的导航热点。
// 各区域的道具、人物和它们的热点由 beach / forest / house / lake / temple / grove 六个部分各自摆放，
// 这里只导出它们要用的锚点（SPOTS）、已摆好的布景对象和几个小工具（全部挂在 W 上，章节 setup 后也能用 RLP.ctx.p3.world 查看）。
//
// 布景改动：
//   - 湖水干净：lake.setBlood(0) + setPool(false)（湖默认带第一灾的血环和血池）。
//   - 天堂门只剩门框：摆 paradise_gate 后隐藏 gate_doors；小屋门只剩门框：摆 shed_door 后隐藏 shed_doors / padlock / shed_bolt。
//     两处门禁都不注册：开局全岛可走，只有白桦林要先砍倒红叉树。
//   - 第一灾的道具一个都不摆，并把写死在 world.colliders 里的隐形碰撞删掉（水泵、猫头鹰、Margaret、木桶 4 个圆，小船、山羊两条胶囊）。
import * as THREE from 'three';
import { makeProp } from '../../art/props.js';
import { makeCharacter } from '../../art/characters.js';
import { P, SETS } from '../../art/layout.js';
import { BUILDING_DIMS } from '../../art/buildings.js';
import { groveRoamAt, GROVE_LAYOUT } from '../../art/props_p3_grove.js';
import { MAX_SLOTS } from '../../core/state.js';
import { T } from './text.js';

// --------------------------------------------------------------------------------- 锚点
// 世界坐标，单位米。rotY：人物 / 道具的朝向（模型正面朝 +z，rotY 绕 y 轴转；+z = 南、+x = 东）。
// 室外 y 在 setup 里按地形高度填（见 snapToGround）。
const HOUSE = SETS.house_int.origin;   // [300, 0, 0]
const TEMPLE = SETS.temple_int.origin; // [400, 0, 0]
export const GROVE_ORIGIN = [600, 0, 0];
export const SPOTS = {
  // 海滩（天堂门前）：两块符号石、之间沙地上的 X
  rockLeft: { pos: [-3.1, 0.5, 44.4], rotY: 0.25 },
  rockRight: { pos: [3.1, 0.5, 44.6], rotY: -0.25 },
  digX: { pos: [0.1, 0.5, 44.5], rotY: 0 },
  // 白树空地 G：捕蝇草、红叉树（立在北侧树干的缺口里）、树后的白桦林入口
  flytrap: { pos: [5.0, 0.5, 16.4], rotY: 0 },
  xTree: { pos: [-2.9, 0.5, 9.4], rotY: 0 },
  portal: { pos: [-2.9, 0.5, 7.6], rotY: 0 },
  // 水泵空地 P：土堆、挂在灰白大树枝杈上的蜂巢
  mound: { pos: [19.4, 0.5, 4.6], rotY: 0 },
  hive: { pos: [12.9, 3.3, 2.1], rotY: 0 },
  // 湖岸：Margaret 坐在凳子上，右手边的木桩
  margaret: { pos: [24.4, 0.5, -30.6], rotY: -0.35 },
  stump: { pos: [25.9, 0.5, -30.3], rotY: 0 },
  // 石屋（house_int，原点 [300,0,0]，后墙 z = -1.6，门在 z = 3.0）
  house: {
    gerard: { pos: [HOUSE[0] - 1.4, 0, HOUSE[2] - 0.9], rotY: 0 },     // 理发凳 + Gerard；Ida 在他正后方
    jarTable: { pos: [HOUSE[0], 0, HOUSE[2] - 1.25], rotY: 0 },
    shovel: { pos: [HOUSE[0] + 0.42, 0.5, HOUSE[2] - 1.13], rotY: 0 },
    wheel: { pos: [HOUSE[0] + 1.3, 0, HOUSE[2] - 1.1], rotY: 0 },
    drawing: { pos: [HOUSE[0] + 2.0, 1.0, HOUSE[2] - 1.58], rotY: 0 },
  },
  // 神殿（temple_int，原点 [400,0,0]，后墙 z = -2.0）
  temple: {
    stool: { pos: [TEMPLE[0] + 1.9, 0, TEMPLE[2] - 1.45], rotY: -0.3 },  // 右凳子：剪刀
  },
};

/** 布景对象和工具：setup 之后填好。其它部分 `import { W } from './world.js'` 使用（或 ctx.p3.world）。 */
export const W = {
  ctx: null,
  zones: null,            // { exterior, house_int, temple_int, memory, p3_grove }
  gate: null,             // paradise_gate（门板已隐藏）
  shedDoor: null,         // shed_door（门板 / 锁 / 门闩已隐藏）
  grove: null,            // p3_grove_set
  groveArea: null,        // 白桦林的漫游区域
  houseArea: null,        // house_int 的漫游区域
  spots: SPOTS,
  removedColliders: null, // 删掉的第一灾碰撞（调试用）
};

export const instant = { instant: true };
export const numberFlag = (ctx, key, fallback = 0) => Number(ctx.flag(key) ?? fallback);

// --------------------------------------------------------------------------------- 小工具
const cam = (pos, target, fov = 48) => ({ pos, target, fov });
const view = (ctx, id, pose, rest = {}) => ctx.views.define({ id, zone: 'exterior', cam: pose, ...rest });

/** 提示按当前操作方式选文字：触屏界面用 `${name}Touch`。每份存档只提示一次。不要 return 它（onEnter 会被拖住）。 */
export function hint(ctx, key, name) {
  return ctx.hintOnce(key, ctx.ui.touchMode && T[`${name}Touch`] ? T[`${name}Touch`] : T[name]);
}

let propSeq = 0;
/** 摆一个道具：pos 为 [x,y,z]；opts: { rotY, scale, props（传给工厂的参数）, name }。有 update 的道具自动注册每帧更新。 */
export function placeProp(parent, id, pos, { rotY = 0, scale = 1, props = {}, name = null } = {}) {
  const o = makeProp(id, props);
  o.position.fromArray(pos);
  o.rotation.y = rotY;
  o.scale.setScalar(scale);
  if (name) o.name = name;
  parent.add(o);
  if (typeof o.update === 'function') W.ctx.register('prop', `p3_${id}_${propSeq++}`, o);
  return o;
}

/** 摆一个人物并注册每帧更新。 */
export function character(ctx, id, spot, zone = 'exterior') {
  const rig = makeCharacter(id);
  rig.root.position.fromArray(spot.pos);
  rig.root.rotation.y = spot.rotY || 0;
  W.zones[zone].add(rig.root);
  ctx.register('char', `p3_${id}`, rig);
  return rig;
}

/**
 * 以 object 的局部坐标定义一个谜题特写：target / eye 是 object 局部坐标里的点（object 在世界里怎么摆，镜头就怎么跟）。
 * 特写的 look 为 0（点击密集，镜头不晃）。target / eye / fov 也可以是函数，go() 时才取值（机位随旗标变）。
 */
export function closeup(ctx, id, object, back, { target = [0, 1, 0], eye = [0, 1.2, 2], fov = 40, zone = 'exterior', onEnter } = {}) {
  const val = (v) => (typeof v === 'function' ? v() : v);
  ctx.views.define({
    id, zone, closeup: true, back, look: 0, onEnter,
    // 函数形式的机位在 go() 时才解析，这样 object 之后被挪动 / 替换也不会过期
    cam: () => {
      object.updateWorldMatrix(true, false);
      const at = (p) => object.localToWorld(new THREE.Vector3(...val(p))).toArray();
      return { pos: at(eye), target: at(target), fov: val(fov) };
    },
  });
}

/** 室外漫游碰撞：加一个圆（人物、树桩、木桩……）。返回这个圆（之后可用 removeCircle 删）。 */
export function addCircle(x, z, r) { const c = [x, z, r]; W.ctx.world.colliders.circles.push(c); return c; }
export function removeCircle(c) { const a = W.ctx.world.colliders.circles; const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); }
/** 室外漫游碰撞：加一个轴对齐盒子 [x0, z0, x1, z1]。 */
export function addBox(x0, z0, x1, z1) { const b = [x0, z0, x1, z1]; W.ctx.world.colliders.boxes.push(b); return b; }

/** 石屋家具的漫游碰撞：circles [[x,z,r]]、boxes [[x0,z0,x1,z1]]，世界坐标；可多次调用累加。 */
export function addHouseObstacles({ circles = [], boxes = [] } = {}) {
  const a = W.houseArea;
  a.circles.push(...circles);
  a.boxes.push(...boxes);
  W.ctx.views.defineRoamArea('house_int', a);
}

/** 拿一件物品：物品栏满了就说一句“拿不下了”并返回 false（调用方此时不能写“已取”旗标）。 */
export async function giveItem(ctx, id, from) {
  if (ctx.state.inventory.length >= MAX_SLOTS) {
    ctx.sfx('wrong');
    await ctx.say(T.inventoryFull);
    return false;
  }
  return ctx.give(id, { from });
}

// 第一灾写死在 world.colliders 里的道具碰撞（src/art/world.js buildColliders）
function removePlague1Colliders(col) {
  const near = (x, z, p, tol) => Math.hypot(x - p.pos[0], z - p.pos[2]) < tol;
  const PROPS = [[P.pump, 0.45], [P.owlTotem, 0.6], [P.margaret, 0.55], [P.bucket, 0.3]];
  const removed = { circles: [], segments: [] };
  col.circles = col.circles.filter((c) => {
    const [x, z, r] = c;
    const hit = PROPS.some(([p, pr]) => near(x, z, p, 0.05) && Math.abs(r - pr) < 1e-6);
    if (hit) removed.circles.push(c);
    return !hit;
  });
  // 小船（半宽 0.62）和山羊（半宽 0.3）的胶囊：按中点和半宽认
  col.segments = col.segments.filter((s) => {
    const [ax, az, bx, bz, w] = s;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const hit = (near(mx, mz, P.rowboat, 0.3) && Math.abs(w - 0.62) < 1e-6) || (near(mx, mz, P.goat, 0.3) && Math.abs(w - 0.3) < 1e-6);
    if (hit) removed.segments.push(s);
    return !hit;
  });
  return removed;
}

// 第三灾的固定布景状态（setup 和 sync 都调用，幂等）
function applyScenery(ctx) {
  ctx.world.lake.setBlood(0);
  ctx.world.lake.setPool(false);
  for (const n of ['gate_doors']) { const o = W.gate.getObjectByName(n); if (o) o.visible = false; }
  for (const n of ['shed_doors', 'padlock', 'shed_bolt']) { const o = W.shedDoor.getObjectByName(n); if (o) o.visible = false; }
}

/** 室外 y 按地形高度填（SPOTS 里写的 0.5 只是占位）。 */
function snapToGround(ctx) {
  const h = ctx.world.groundHeight;
  if (!h) return;
  for (const k of ['rockLeft', 'rockRight', 'digX', 'flytrap', 'xTree', 'portal', 'mound', 'margaret', 'stump']) {
    SPOTS[k].pos[1] = h(SPOTS[k].pos[0], SPOTS[k].pos[2]);
  }
}

// --------------------------------------------------------------------------------- setup
export async function setup(ctx) {
  const ext = ctx.world.zones.exterior;
  const houseZone = ctx.world.zones.house_int;
  W.ctx = ctx;
  W.zones = { ...ctx.world.zones };
  const anchor = (id) => ctx.world.anchor(id);
  const wpos = (id) => anchor(id).getWorldPosition(new THREE.Vector3());
  snapToGround(ctx);

  // ---- 布景
  W.removedColliders = removePlague1Colliders(ctx.world.colliders);
  W.gate = placeProp(ext, 'paradise_gate', anchor('gate').position.toArray(), { rotY: anchor('gate').rotation.y });
  W.shedDoor = placeProp(ext, 'shed_door', anchor('shedDoor').position.toArray(), { rotY: anchor('shedDoor').rotation.y });
  applyScenery(ctx);

  // ---- 白桦林：独立 zone（自带灯光），原点 [600,0,0]
  const grove = new THREE.Group();
  grove.name = 'zone_p3_grove';
  ctx.world.root.add(grove);
  ctx.views.registerZone('p3_grove', grove);
  W.zones.p3_grove = grove;
  W.grove = placeProp(grove, 'p3_grove_set', GROVE_ORIGIN, { props: { lights: true } });
  W.groveArea = groveRoamAt(GROVE_ORIGIN);
  ctx.views.defineRoamArea('p3_grove', W.groveArea);

  // ---- 视图：总览（固定远景）+ 室外开放视图（漫游的出生机位、脚本和测试的传送目标，箭头不显示，
  //      但 back/left/right/up 写全，供 autoplay 的 reachable() 判断可达性）
  view(ctx, 'overview', cam(P.overviewCam.pos, P.overviewCam.target, P.overviewCam.fov), { fixed: true });
  view(ctx, 'beach_mid', cam([0, 2.4, 49.4], [0, 1.2, 41]), {
    back: 'overview', left: 'beach_left', right: 'beach_right', up: 'forest_path',
    onEnter: (c) => { hint(c, 'roam', 'hintRoam'); },
  });
  view(ctx, 'beach_left', cam([-12.5, 2.2, 47.4], [-19.5, 1.5, 43]), { right: 'beach_mid', back: 'overview' });
  view(ctx, 'beach_right', cam([2.6, 2.2, 46.4], [7.4, 0.6, 50.4]), { left: 'beach_mid', back: 'overview' });
  view(ctx, 'forest_path', cam([0, 2.2, 38], [0, 2, 29]), { back: 'beach_mid', up: 'forest_clearing', upAt: [0, 1.2, 32] });
  view(ctx, 'forest_clearing', cam([-1, 2.5, 24], [1, 1.5, 14]), { back: 'forest_path', right: 'pump_clearing', up: 'house_clearing', upAt: [3, 1, -3] });
  view(ctx, 'pump_clearing', cam([16.4, 2.4, 10], [16.2, 1.4, 2]), { left: 'forest_clearing', up: 'house_clearing', upAt: [10, 1, -1] });
  view(ctx, 'house_clearing', cam([7, 2.3, -4], [3, 1.5, -11]), { back: 'forest_clearing', right: 'shed_clearing' });
  view(ctx, 'shed_clearing', cam([15, 2.2, -7], [17, 1.5, -13]), { left: 'house_clearing', up: 'soul_path', upAt: [20, 1, -18] });
  view(ctx, 'soul_path', cam([21, 2.2, -16.8], [21, 1.5, -23]), { back: 'shed_clearing', right: 'lake_shore' });
  view(ctx, 'lake_shore', cam([22.6, 2.4, -27.6], [26.5, 1.2, -33]), { left: 'soul_path', right: 'temple_door' });
  view(ctx, 'temple_door', cam([24.6, 2.5, -28.0], [30.2, 3.4, -35.4], 52), { left: 'lake_shore', up: 'temple_int', upAt: [31, 1.4, -36] });

  // ---- 石屋：可走动的室内（进门总站在门口机位）。墙内侧边界在这里定义，家具碰撞由 house.js 用 addHouseObstacles() 加。
  const o = wpos('house_int.center');
  const HD = BUILDING_DIMS.house_int;
  W.houseArea = {
    bounds: [o.x - HD.width / 2, o.z + HD.wallZ, o.x + HD.width / 2, o.z + HD.wallZ + HD.depth],
    circles: [], boxes: [], eye: 1.65, floor: o.y,
  };
  ctx.views.defineRoamArea('house_int', W.houseArea);
  ctx.views.define({
    id: 'house_int', zone: 'house_int', roam: true, back: 'house_clearing',
    cam: { pos: [o.x, 1.65, o.z + 2.3], target: [o.x, 1.3, o.z - 1.5], fov: 50 },
    onEnter: (c) => { hint(c, 'house', 'hintHouse'); },
  });
  // ---- 神殿全景：只有后墙的布景，固定镜头（▼ 回到门外）
  ctx.views.define({
    id: 'temple_int', zone: 'temple_int', closeup: true, back: 'temple_door',
    cam: { pos: [TEMPLE[0], 2.2, TEMPLE[2] + 3.5], target: [TEMPLE[0], 1.45, TEMPLE[2] - 1.2], fov: 50 },
    onEnter: (c) => { W.templeEnter?.(c); },       // 窗台上放着花时，再进神殿鹦鹉会飞来（temple.js 设置）
  });
  // ---- 白桦林：可走动。进来时站在入口、面朝圆桌和神龛。返回走入口缺口的热点（没有 ▼）
  const L = GROVE_LAYOUT;
  ctx.views.define({
    id: 'p3_grove', zone: 'p3_grove', roam: true, back: 'forest_clearing',
    cam: {
      pos: [GROVE_ORIGIN[0] + L.entry.pos[0], 1.65, GROVE_ORIGIN[2] + L.entry.pos[2]],
      target: [GROVE_ORIGIN[0] - 0.1, 1.3, GROVE_ORIGIN[2] + 0.5], fov: 50,
    },
    onEnter: (c) => { hint(c, 'grove', 'hintGrove'); },
  });

  // ---- 导航热点
  // 总览：点岛（台阶、门、整座岛的正面）→ 海滩。代理盒只挂在总览上，漫游时不生效。
  const overviewIsland = ctx.hotspots.makeProxy(40, 9, 6, [0, 3.6, 43], ext);
  ctx.hotspots.define({
    id: 'overview_island', views: ['overview'], object: overviewIsland, cursor: 'zoom',
    onClick: async () => { await ctx.go('beach_mid', { fade: true }); },
  });
  const houseEntry = ctx.hotspots.makeProxy(2.8, 2.4, 1.5, [3, 1.1, -10.8], ext);
  ctx.hotspots.define({ id: 'house_entry', views: ['house_clearing'], object: houseEntry, cursor: 'zoom', goto: 'house_int' });
  const doorIn = wpos('house_int.door');
  const houseExit = ctx.hotspots.makeProxy(1.3, 2.3, 0.4, [doorIn.x, 1.15, doorIn.z - 0.15], houseZone);
  ctx.hotspots.define({ id: 'house_exit', views: ['house_int'], object: houseExit, cursor: 'zoom', goto: 'house_clearing' });
  const templeEntry = ctx.hotspots.makeProxy(3, 3, 2, [30.5, 1.4, -35.7], ext);
  ctx.hotspots.define({ id: 'temple_entry', views: ['temple_door'], object: templeEntry, cursor: 'zoom', goto: 'temple_int' });
  // 白桦林出口：入口缺口（南面）。站在林间空地里点那一片缺口，回到森林里进来前的位置
  const groveExit = ctx.hotspots.makeProxy(3.4, 2.8, 0.5, [GROVE_ORIGIN[0] + L.entry.pos[0], 1.4, GROVE_ORIGIN[2] + L.entry.pos[2] + 1.1], grove);
  ctx.hotspots.define({ id: 'p3_grove_exit', views: ['p3_grove'], object: groveExit, cursor: 'zoom', goto: 'forest_clearing' });
}

export function sync(ctx) {
  if (!W.ctx) return;
  applyScenery(ctx);
}

// 导航冒烟测试：只走公开路径（点热点 / 传送到视图），最后回到海滩，后面的部分从海滩接着走。
export const walkthrough = [
  { go: 'overview' }, { click: 'overview_island' }, { expectView: 'beach_mid' },
  { go: 'forest_path' }, { go: 'forest_clearing' }, { go: 'pump_clearing' }, { go: 'house_clearing' },
  { click: 'house_entry' }, { expectView: 'house_int' }, { click: 'house_exit' }, { expectView: 'house_clearing' },
  { go: 'shed_clearing' }, { go: 'soul_path' }, { go: 'lake_shore' }, { go: 'temple_door' },
  { click: 'temple_entry' }, { expectView: 'temple_int' }, { back: true }, { expectView: 'temple_door' },
  { go: 'beach_mid' },
];
