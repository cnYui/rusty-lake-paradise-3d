// 第二灾布景（docs/plague2_design.md 第 1、2、7 节）：把第一灾留下的世界改成“血灾已经结束”的样子，
// 定义全部开放室外视图 / 总览 / 厨房（可走动）/ 神殿全景，以及进出房子、神殿的导航热点。
// 人物、谜题道具和它们的热点由 beach / forest / house / temple 四个部分各自摆放，这里只导出它们要用的
// 锚点（SPOTS）、已摆好的布景对象和几个小工具（全部挂在 W 上，章节 setup 后也能用 RLP.ctx.p2.world 查看）。
//
// 布景改动：
//   - 湖水干净：lake.setBlood(0) + setPool(false)（湖默认带第一灾的血环和血池）。
//   - 森林里多了横向白雾带：mist_p2.buildForestMist()，每帧按相机朝向更新。
//   - 天堂门只剩门框：摆 paradise_gate 后隐藏 gate_doors（两扇门板，连同小窗、Gerard 的眼睛和手）。
//   - 小屋门只剩门框：摆 shed_door 后隐藏 shed_doors（门板）、padlock、shed_bolt。
//   - 两处门禁都不注册：开局就能走遍全岛。
//   - 第一灾的道具（竹子、果子、小船、水泵、木桶、猫头鹰、Margaret、山羊、灵魂、棺材……）一个都不摆，
//     并把它们写死在 world.colliders 里的隐形碰撞删掉（水泵、猫头鹰、Margaret、木桶这 4 个圆，小船、山羊两条胶囊）。
//   - David 的石头（david_rock）在这里摆好：石头在浅水外侧，玩家走不到，不加碰撞。
import { makeProp } from '../../art/props.js';
import { buildForestMist } from '../../art/mist_p2.js';
import { P, SETS } from '../../art/layout.js';
import { BUILDING_DIMS } from '../../art/buildings.js';
import { T } from './text.js';

// --------------------------------------------------------------------------------- 锚点
// 世界坐标，单位米。rotY：人物 / 道具的朝向（模型正面朝 +z，rotY 绕 y 轴转；+z = 南、+x = 东）。
const KITCHEN = SETS.house_int.origin;   // [300, 0, 0]
const TEMPLE = SETS.temple_int.origin;   // [400, 0, 0]
export const SPOTS = {
  // 海滩左：David 站在石头上（石头由本文件摆好，顶面挂点 W.davidTop，y = 0.95）
  david: { pos: [...P.david.pos], rotY: Math.PI - .12 },
  davidRock: { pos: [...P.davidRock.pos] },
  // 海滩右的浅水：睡莲叶棋盘 lily_board 的原点 = (0,0) 格中心（左上格，靠岸）；列 +x、行 +z，格距 0.55
  lilyBoard: { pos: [5.3, 0.03, 49.5] },
  // 白树空地 G（第一灾 Margaret 的位置）：Gerard 面向东南
  gerard: { pos: [-5.6, 0.5, 17.2], rotY: 0.6 },
  // 水泵空地 P（水泵已移除）：Ida 面朝南（玩家来的方向），浅木盆在她右边（画面右侧 = 东）
  ida: { pos: [16.4, 0.5, 2.6], rotY: 0 },
  basin: { pos: [18.7, 0.5, 2.5], rotY: 0 },
  // 湖岸、神殿门外左前方地上的木柴堆（y 取地形高度，setup 时填）
  woodPile: { pos: [27.4, 0.5, -32.2], rotY: 0.4 },
  // 厨房（house_int 区域，原点 [300,0,0]，后墙 z = -1.6，门在 z = 3.0）：建议位置，house.js 可微调
  kitchen: {
    origin: [...KITCHEN],
    chest: { pos: [KITCHEN[0] - 1.6, 0, KITCHEN[2] - 1.25], rotY: 0 },        // 左：锁着的小木箱
    table: { pos: [KITCHEN[0] - 0.2, 0, KITCHEN[2] - 0.95], rotY: 0 },        // 中：三脚小桌（蜡烛、碗）
    cauldron: { pos: [KITCHEN[0] + 1.1, 0, KITCHEN[2] - 0.85], rotY: 0 },     // 右：火圈 + 大锅
    margaret: { pos: [KITCHEN[0] + 1.55, 0, KITCHEN[2] - 1.2], rotY: -0.35 }, // 锅后搅拌
    memoryFrame: { pos: [KITCHEN[0] - 0.9, 0.55, KITCHEN[2] - 1.58], rotY: 0 }, // 回忆黑框贴后墙（下边中点）
  },
  // 神殿（temple_int 区域，原点 [400,0,0]，后墙 z = -2.0）：吊架 / 圣水盆用世界锚点 temple_int.holder / temple_int.font
  temple: {
    origin: [...TEMPLE],
    stool: { pos: [TEMPLE[0] - 1.9, 0, TEMPLE[2] - 1.45], rotY: 0.3 },        // 左凳子（腰带）
    cabinet: { pos: [TEMPLE[0] + 1.9, 0, TEMPLE[2] - 1.6], rotY: -0.25 },     // 右转盘锁柜子（窗下）
    painting: { pos: [TEMPLE[0], 1.35, TEMPLE[2] - 1.68] },                   // 第一灾挂画的位置
  },
};

/** 布景对象和工具：setup 之后填好。其它部分 `import { W } from './world.js'` 使用（或 ctx.p2.world）。 */
export const W = {
  ctx: null,
  zones: null,            // { exterior, house_int, temple_int, memory }
  gate: null,             // paradise_gate（门板已隐藏）
  shedDoor: null,         // shed_door（门板 / 锁 / 门闩已隐藏）
  davidRock: null,        // david_rock
  davidTop: null,         // 石头顶面的挂点（Object3D，世界 y ≈ 0.95）
  mist: null,             // { group, mesh, update, setOpacity }
  kitchenArea: null,      // house_int 的漫游区域（bounds / circles / boxes / eye / floor）
  spots: SPOTS,
  removedColliders: null, // 删掉的第一灾碰撞（调试用）
};

// --------------------------------------------------------------------------------- 小工具
const cam = (pos, target, fov = 48) => ({ pos, target, fov });
const view = (ctx, id, pose, rest = {}) => ctx.views.define({ id, zone: 'exterior', cam: pose, ...rest });

/** 提示按当前操作方式选文字：触屏界面用 `${name}Touch`。每份存档只提示一次。不要 return 它（onEnter 会被拖住）。 */
export function hint(ctx, key, name) {
  return ctx.hintOnce(key, ctx.ui.touchMode && T[`${name}Touch`] ? T[`${name}Touch`] : T[name]);
}

/** 摆一个道具：pos 为 [x,y,z] / Vector3；opts: { rotY, scale, props（传给工厂的参数）, name }。 */
export function placeProp(parent, id, pos, { rotY = 0, scale = 1, props = {}, name = null } = {}) {
  const o = makeProp(id, props);
  if (Array.isArray(pos)) o.position.fromArray(pos); else if (pos) o.position.copy(pos);
  o.rotation.y = rotY;
  o.scale.setScalar(scale);
  if (name) o.name = name;
  parent.add(o);
  return o;
}

/** 室外漫游碰撞：加一个圆（人物、木盆、木柴堆……）。 */
export function addCircle(x, z, r) { W.ctx.world.colliders.circles.push([x, z, r]); }
/** 室外漫游碰撞：加一个轴对齐盒子 [x0, z0, x1, z1]。 */
export function addBox(x0, z0, x1, z1) { W.ctx.world.colliders.boxes.push([x0, z0, x1, z1]); }

/** 厨房家具的漫游碰撞（house.js 调用）：circles [[x,z,r]]、boxes [[x0,z0,x1,z1]]，世界坐标；可多次调用累加。 */
export function addKitchenObstacles({ circles = [], boxes = [] } = {}) {
  const a = W.kitchenArea;
  a.circles.push(...circles);
  a.boxes.push(...boxes);
  W.ctx.views.defineRoamArea('house_int', a);
}

/** 结尾（temple.js 在白框框住红斗篷女人之后调用）：记通关旗标，弹出“第二灾 · 完”结尾卡。 */
export async function playEnding(ctx) {
  ctx.setFlag('plague2_complete');
  await ctx.ui.ending(T.ending);
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

// 第二灾的固定布景状态（setup 和 sync 都调用，幂等）
function applyScenery(ctx) {
  ctx.world.lake.setBlood(0);
  ctx.world.lake.setPool(false);
  for (const n of ['gate_doors']) { const o = W.gate.getObjectByName(n); if (o) o.visible = false; }
  for (const n of ['shed_doors', 'padlock', 'shed_bolt']) { const o = W.shedDoor.getObjectByName(n); if (o) o.visible = false; }
}

// --------------------------------------------------------------------------------- setup
export async function setup(ctx) {
  const ext = ctx.world.zones.exterior;
  const houseZone = ctx.world.zones.house_int;
  W.ctx = ctx;
  W.zones = ctx.world.zones;
  const anchor = (id) => ctx.world.anchor(id);
  const wpos = (id) => anchor(id).getWorldPosition(new ctx.THREE.Vector3());
  if (ctx.world.groundHeight) SPOTS.woodPile.pos[1] = ctx.world.groundHeight(SPOTS.woodPile.pos[0], SPOTS.woodPile.pos[2]);

  // ---- 布景
  W.removedColliders = removePlague1Colliders(ctx.world.colliders);
  W.gate = placeProp(ext, 'paradise_gate', anchor('gate').position, { rotY: anchor('gate').rotation.y });
  W.shedDoor = placeProp(ext, 'shed_door', anchor('shedDoor').position, { rotY: anchor('shedDoor').rotation.y });
  W.davidRock = placeProp(ext, 'david_rock', SPOTS.davidRock.pos);
  W.davidTop = W.davidRock.getObjectByName('rock_top') || W.davidRock;
  W.mist = buildForestMist();
  ext.add(W.mist.group);
  // 雾带每帧转向相机；室内时外景不可见，跳过
  ctx.register('prop', 'p2_mist', { update: (dt, t) => { if (ext.visible) W.mist.update(dt, t, ctx.engine.camera); } });
  applyScenery(ctx);

  // ---- 视图：总览（固定远景）+ 室外开放视图（漫游的出生机位、脚本和测试的传送目标，箭头不显示，
  //      但 back/left/right/up 写全，供 autoplay 的 reachable() 判断可达性）
  view(ctx, 'overview', cam(P.overviewCam.pos, P.overviewCam.target, P.overviewCam.fov), { fixed: true });
  view(ctx, 'beach_mid', cam([0, 2.4, 48], [0, 1.8, 39]), {
    back: 'overview', left: 'beach_left', right: 'beach_right', up: 'forest_path',
    onEnter: (c) => { hint(c, 'roam', 'hintRoam'); },
  });
  // 海滩左：看向西北的 David 和栅栏；海滩右：看向东南浅水里的睡莲叶
  view(ctx, 'beach_left', cam([-12.5, 2.2, 47.4], [-19.5, 1.5, 43]), { right: 'beach_mid', back: 'overview' });
  view(ctx, 'beach_right', cam([2.6, 2.2, 46.4], [7.4, 0.6, 50.4]), { left: 'beach_mid', back: 'overview' });
  view(ctx, 'forest_path', cam([0, 2.2, 38], [0, 2, 29]), { back: 'beach_mid', up: 'forest_clearing', upAt: [0, 1.2, 32] });
  view(ctx, 'forest_clearing', cam([-2, 2.5, 25], [-2.6, 1.5, 16]), { back: 'forest_path', right: 'pump_clearing', up: 'house_clearing', upAt: [3, 1, -3] });
  view(ctx, 'pump_clearing', cam([17, 2.4, 9], [17, 1.5, 2]), { left: 'forest_clearing', up: 'house_clearing', upAt: [10, 1, -1] });
  view(ctx, 'house_clearing', cam([7, 2.3, -4], [3, 1.5, -11]), { back: 'forest_clearing', right: 'shed_clearing' });
  view(ctx, 'shed_clearing', cam([15, 2.2, -7], [17, 1.5, -13]), { left: 'house_clearing', up: 'soul_path', upAt: [20, 1, -18] });
  view(ctx, 'soul_path', cam([21, 2.2, -16.8], [21, 1.5, -23]), { back: 'shed_clearing', right: 'lake_shore' });
  view(ctx, 'lake_shore', cam([25, 2.4, -31], [30, 1.5, -36]), { left: 'soul_path', right: 'temple_door' });
  // 第一灾这个机位（[29,2.3,-33]）落在神殿圆柱里面，看到的是一片黑；这里站在门前西南 8 m 的岸边，整座石塔和门洞都在画面里（原作 11:11）
  view(ctx, 'temple_door', cam([24.6, 2.5, -28.0], [30.2, 3.4, -35.4], 52), { left: 'lake_shore', up: 'temple_int', upAt: [31, 1.4, -36] });

  // ---- 厨房：可走动的室内（进门总站在门口机位）。墙内侧边界在这里定义，家具碰撞由 house.js 用 addKitchenObstacles() 加。
  const o = wpos('house_int.center');
  const HD = BUILDING_DIMS.house_int;
  W.kitchenArea = {
    bounds: [o.x - HD.width / 2, o.z + HD.wallZ, o.x + HD.width / 2, o.z + HD.wallZ + HD.depth],
    circles: [], boxes: [], eye: 1.65, floor: o.y,
  };
  ctx.views.defineRoamArea('house_int', W.kitchenArea);
  ctx.views.define({
    id: 'house_int', zone: 'house_int', roam: true, back: 'house_clearing',
    cam: { pos: [o.x, 1.65, o.z + 2.3], target: [o.x, 1.3, o.z - 1.5], fov: 50 },
    onEnter: (c) => { hint(c, 'house', 'hintHouse'); },
  });
  // ---- 神殿全景：只有后墙的布景，固定镜头（▼ 回到门外）
  ctx.views.define({
    id: 'temple_int', zone: 'temple_int', closeup: true, back: 'temple_door',
    cam: { pos: [TEMPLE[0], 2.2, TEMPLE[2] + 3.5], target: [TEMPLE[0], 1.45, TEMPLE[2] - 1.2], fov: 50 },
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
