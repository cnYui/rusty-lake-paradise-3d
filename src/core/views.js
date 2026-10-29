// Views = camera nodes ("screens" of the original 2D game) + navigation arrows + zone visibility.
//
// spec = { id, zone = 'exterior', cam: { pos, target, fov } | (world) => pose,
//          back, left, right, up: 'viewId' | null | (state, ctx) => id|null, upAt: [x,y,z] | null,
//          closeup = false, fixed = false, roam = false, look?: 固定镜头的环视幅度（弧度）,
//          ambience?: 'lake'|'forest'|..., music?: name,
//          onEnter: async (ctx) => {}, onExit: async (ctx) => {} }
//
// 两类视图：
// - 开放视图：不是 closeup / fixed，并且在室外（zone 'exterior'）或标了 roam: true（可走动的室内，
//   走动范围由 defineRoamArea() 定义）。玩家在其中自由漫游（WASD 走动、鼠标转身），
//   视图只作为逻辑位置、出生机位和脚本 / 测试的传送目标，不显示方向箭头。
// - 固定镜头：总览（fixed）、室内布景、谜题特写（closeup）。位置不动，鼠标只能小幅环视并自动回正，
//   ▼ 箭头或 S / ↓ 键返回。
//
// 鼠标视角不锁定指针：以左侧游戏画布的中心为中立点，指针在中心区域时视角不动，移向画布边缘时
// 朝那个方向转，越靠边越快。漫游时水平方向不设角度上限，可以连续 360° 转身。
// 触屏（touch.js）：画面左侧拖动是摇杆，其它位置拖动按手指位移转视角；固定镜头里拖动只小幅环视、松手回正。
//
// 镜头切换：开放视图之间（只有脚本和测试会这样切）沿直线滑行；进出特写或跨区域时黑场淡入淡出；
// 从特写 / 室内返回开放视图时回到进入前的漫游位置和朝向（漫游位置不写入存档）。
// The camera is "owned" by views while a view is shown; if anything else moves the camera
// (an intro cutscene animating engine.camera directly) views stops writing it until the next go().
import * as THREE from 'three';
import { animate, Ease } from './tween.js';
import { state } from './state.js';
import { ctx } from './context.js';
import { ui } from './ui.js';
import { audio } from './audio.js';
import { touch } from './touch.js';
import { ISLAND_OUTLINE, GROUND_Y, shoreDistance } from '../art/layout.js';

const specs = new Map();
const zones = new Map();
let engine = null;
let goToken = 0;

// 固定镜头的基准位姿（未加鼠标环视偏移）
const base = { pos: new THREE.Vector3(0, 2, 10), target: new THREE.Vector3(0, 1, 0), fov: 45 };
let owned = false;
// 上一次写进相机的位姿：用来发现过场动画直接改了相机
const lastPos = new THREE.Vector3();
const lastQuat = new THREE.Quaternion();
let lastFov = 0;
let wrote = false;
let camVersion = 0;

// ---------------------------------------------------------------- 鼠标视角参数
const LOOK = {
  deadX: 0.38,       // 中心死区：占画布半宽 / 半高的比例，指针在死区内视角不动
  deadY: 0.5,
  roamYaw: 2.4,      // 漫游时指针贴到画布边缘的最大水平角速度（rad/s）
  roamPitch: 1.1,    // 最大俯仰角速度（rad/s）
  pitchMin: -0.9,
  pitchMax: 0.45,
  arm: 18,           // 切换镜头后指针要先移动这么多像素才开始转，避免停在 ▼ 箭头上的指针立刻带着视角转
  touchTurn: 3.4,    // 触屏拖动：手指划过整个画面宽度转 3.4 rad（约 195°）
};
const pointer = { x: 0, y: 0, valid: false, armed: false, ax: 0, ay: 0 };
// nx/ny：指针相对画布中心的归一化偏移；vyaw/vpitch：漫游角速度；fx/fy：固定镜头的环视偏移；
// tx/ty：触屏在固定镜头里拖出来的环视目标（松手后回正）
const look = { nx: 0, ny: 0, vyaw: 0, vpitch: 0, fx: 0, fy: 0, tx: 0, ty: 0 };

// ---------------------------------------------------------------- 室外漫游
const ROAM_FOV = 50;
const EYE = 1.8;            // 视线离地高度
const R_PLAYER = 0.35;      // 玩家碰撞半径
const WALK = 5, RUN = 8;    // m/s（按住 Shift 奔跑）
const SHORE_MARGIN = 1.25;  // 允许走出岛屿轮廓的浅水宽度
const roam = {
  active: false,
  gliding: false,           // 脚本 / 测试驱动的滑行中，玩家输入暂停
  pos: new THREE.Vector3(),
  yaw: 0,                   // 0 = 朝 -z（北），向右为正
  pitch: -0.08,
  vel: new THREE.Vector3(),
  amb: null,
};
// 按区域记住的漫游位姿：离开漫游（进特写、换区域）时记下，回到该区域时恢复。
// 室外每次回来都恢复；室内只在从同一区域的特写返回时恢复，从外面进门总是站在门口（视图机位）。
let roamMemory = {};
const gates = [];           // 室外的章节门禁：fn(x, z, state) → true 表示该点现在不能进入
// 室内可漫游区域：zone → { bounds: [x0, z0, x1, z1], circles: [[x, z, r]], boxes: [[x0, z0, x1, z1]], eye, floor }
const areas = new Map();
const held = new Set();     // 按住的移动键：f b l r shift
const suppressed = new Set(); // 已被当成“返回”消费掉的按键，松开前不再驱动移动

const MOVE_CODES = {
  KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
  ShiftLeft: 'shift', ShiftRight: 'shift',
};
const MOVE_KEYS = {
  w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r', shift: 'shift',
};

const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _look = new THREE.Vector3();
const _move = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function toVec(v, out = new THREE.Vector3()) {
  if (!v) return out.set(0, 0, 0);
  if (v.isVector3) return out.copy(v);
  if (Array.isArray(v)) return out.set(v[0] || 0, v[1] || 0, v[2] || 0);
  if (v.isObject3D) return v.getWorldPosition(out);
  return out.set(v.x || 0, v.y || 0, v.z || 0);
}

function resolvePose(spec) {
  let cam = spec.cam;
  if (typeof cam === 'function') cam = cam(ctx.world, ctx);
  if (!cam) throw new Error(`view "${spec.id}" has no cam`);
  return {
    pos: toVec(cam.pos),
    target: toVec(cam.target),
    fov: cam.fov || spec.fov || 45,
  };
}

function resolveDir(spec, key) {
  if (!spec) return null;
  let v = spec[key];
  if (typeof v === 'function') {
    try { v = v(state, ctx); } catch (err) { console.error(`[views] ${spec.id}.${key}() failed`, err); v = null; }
  }
  if (!v) return null;
  if (!specs.has(v)) {
    console.warn(`[views] ${spec.id}.${key} → unknown view "${v}"`);
    return null;
  }
  return v;
}

/** 开放视图（自由漫游）：非特写、非固定镜头，并且在室外或标了 roam: true（可走动的室内）。 */
function isOpen(spec) {
  return !!spec && !spec.closeup && !spec.fixed && (spec.zone === 'exterior' || !!spec.roam);
}

function ambienceAt(z) {
  return z < 39.5 && z > -26 ? 'forest' : 'lake';
}

/** 漫游时的环境音：室外按脚下位置，室内按区域。 */
function roamAmbience(zone, z) {
  return zone === 'exterior' ? ambienceAt(z) : zoneAmbience({ zone }, null);
}

function zoneAmbience(spec, pose) {
  if (spec.ambience) return spec.ambience;
  switch (spec.zone) {
    case 'house_int': return 'interior';
    case 'temple_int': return 'temple';
    case 'memory': return 'memory';
    case 'p3_grove': return 'forest';      // 第三灾的白桦林（独立 zone）
    case 'exterior': return ambienceAt(pose.pos.z);
    default: return null;
  }
}

/** 固定镜头的环视幅度（弧度）；视图可用 spec.look 覆盖，0 表示完全不动。 */
function lookRange(spec) {
  if (!spec) return 0.12; // 标题画面
  if (typeof spec.look === 'number') return spec.look;
  return spec.closeup ? 0.12 : 0.14;
}

// ------------------------------------------------------------------ pointer → look
function onPointerMove(ev) {
  // 只有鼠标参与“靠边转向”；手指的拖动由 touch.js 换算成位移
  if (ev.pointerType && ev.pointerType !== 'mouse') return;
  pointer.x = ev.clientX;
  pointer.y = ev.clientY;
  pointer.valid = true;
  if (!pointer.armed && Math.hypot(ev.clientX - pointer.ax, ev.clientY - pointer.ay) > LOOK.arm) pointer.armed = true;
}

function disarmPointer() {
  pointer.armed = false;
  pointer.ax = pointer.x;
  pointer.ay = pointer.y;
}

/** 指针相对左侧游戏画布中心的偏移（-1..1）；指针在画布外（例如物品栏）或离开窗口时为 0。 */
function updatePointerLook() {
  look.nx = 0;
  look.ny = 0;
  if (!pointer.valid || !pointer.armed || !engine) return;
  const r = engine.canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const nx = ((pointer.x - r.left) / r.width) * 2 - 1;
  const ny = ((pointer.y - r.top) / r.height) * 2 - 1;
  if (Math.abs(nx) > 1 || Math.abs(ny) > 1) return;
  look.nx = nx;
  look.ny = ny;
}

/** 死区外的转向强度（带符号，0..1），越靠边越大。 */
function edge(n, dead) {
  const a = Math.abs(n);
  if (a <= dead) return 0;
  const t = Math.min(1, (a - dead) / (1 - dead));
  return Math.sign(n) * t * t;
}

function canLook() {
  return !ui.locked && !ui.modalOpen && !views.transitioning && !roam.gliding;
}

// ------------------------------------------------------------------ camera writing
function remember(cam) {
  if (!cam.position.equals(lastPos) || !cam.quaternion.equals(lastQuat)) camVersion++;
  lastPos.copy(cam.position);
  lastQuat.copy(cam.quaternion);
  lastFov = cam.fov;
  wrote = true;
}

function changedExternally(cam) {
  return cam.position.distanceToSquared(lastPos) > 1e-10 || Math.abs(cam.fov - lastFov) > 1e-6
    || 1 - Math.abs(cam.quaternion.dot(lastQuat)) > 1e-9;
}

function applyCamera(realDt, detect = false) {
  const cam = engine.camera;
  // 有过场直接改了相机：暂停写入，直到下一次 go()
  if (detect && wrote && changedExternally(cam)) {
    if (roam.active) suspendRoam();
    owned = false;
    wrote = false;
  }
  updatePointerLook();
  const active = canLook();
  const drag = touch.takeLook();                                   // 触屏拖动的像素位移
  const perPx = LOOK.touchTurn / (engine.canvas.clientWidth || 1);
  if (roam.active) {
    // 漫游：鼠标偏移决定角速度（不是角度），所以可以一直转下去
    const k = 1 - Math.exp(-realDt * 9);
    const tyaw = active ? edge(look.nx, LOOK.deadX) * LOOK.roamYaw : 0;
    const tpitch = active ? -edge(look.ny, LOOK.deadY) * LOOK.roamPitch : 0;
    look.vyaw += (tyaw - look.vyaw) * k;
    look.vpitch += (tpitch - look.vpitch) * k;
    if (!roam.gliding) {
      roam.yaw = wrapAngle(roam.yaw + look.vyaw * realDt);
      roam.pitch = clamp(roam.pitch + look.vpitch * realDt, LOOK.pitchMin, LOOK.pitchMax);
      if (active && (drag.dx || drag.dy)) {
        // 触屏：手指向右拖向右转、向上拖抬头
        roam.yaw = wrapAngle(roam.yaw + drag.dx * perPx);
        roam.pitch = clamp(roam.pitch - drag.dy * perPx, LOOK.pitchMin, LOOK.pitchMax);
      }
    }
    writeRoamCamera();
    return;
  }
  if (!owned) return;
  // 固定镜头：鼠标靠边（或手指拖动）时朝该方向小幅偏转，回到中间 / 松手后自动回正
  const range = lookRange(views.current);
  let tx = 0, ty = 0;
  if (active && touch.active) {
    if (touch.looking) {
      look.tx = clamp(look.tx + drag.dx * perPx, -range, range);
      look.ty = clamp(look.ty + drag.dy * perPx, -range * 0.6, range * 0.6);
    } else look.tx = look.ty = 0;
    tx = look.tx;
    ty = look.ty;
  } else if (active) {
    tx = edge(look.nx, LOOK.deadX) * range;
    ty = edge(look.ny, LOOK.deadY) * range * 0.6;
  }
  const k = 1 - Math.exp(-realDt * (touch.looking ? 14 : 3.5));
  look.fx += (tx - look.fx) * k;
  look.fy += (ty - look.fy) * k;
  cam.position.copy(base.pos);
  _dir.subVectors(base.target, base.pos);
  const dist = _dir.length() || 1;
  _dir.divideScalar(dist);
  if (look.fx || look.fy) {
    _right.crossVectors(_dir, UP);
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    _right.normalize();
    // 指针在右边 → 镜头右转；指针在下边 → 镜头下看
    _q.setFromAxisAngle(UP, -look.fx);
    _dir.applyQuaternion(_q);
    _q.setFromAxisAngle(_right, -look.fy);
    _dir.applyQuaternion(_q);
  }
  _look.copy(cam.position).addScaledVector(_dir, dist);
  cam.up.set(0, 1, 0);
  cam.lookAt(_look);
  if (cam.fov !== base.fov) { cam.fov = base.fov; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
  remember(cam);
}

function writeRoamCamera() {
  const cam = engine.camera;
  const cp = Math.cos(roam.pitch);
  _dir.set(Math.sin(roam.yaw) * cp, Math.sin(roam.pitch), -Math.cos(roam.yaw) * cp);
  cam.position.copy(roam.pos);
  _look.copy(roam.pos).add(_dir);
  cam.up.set(0, 1, 0);
  cam.lookAt(_look);
  if (cam.fov !== ROAM_FOV) { cam.fov = ROAM_FOV; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
  remember(cam);
}

// ------------------------------------------------------------------ roam: walking & collision
function distToSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

/** 室内区域 (x, z) 能否站人：房间边界内，且不碰到家具。 */
function canStandIn(area, x, z) {
  const [bx0, bz0, bx1, bz1] = area.bounds;
  if (x < bx0 + R_PLAYER || x > bx1 - R_PLAYER || z < bz0 + R_PLAYER || z > bz1 - R_PLAYER) return false;
  for (const [cx, cz, r] of area.circles || []) {
    const rr = r + R_PLAYER;
    if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < rr * rr) return false;
  }
  for (const [x0, z0, x1, z1] of area.boxes || []) {
    if (x > x0 - R_PLAYER && x < x1 + R_PLAYER && z > z0 - R_PLAYER && z < z1 + R_PLAYER) return false;
  }
  return true;
}

/** 漫游时 (x, z) 能否站人。室外：岛屿边界、章节门禁、树干与建筑；室内：房间边界和家具。 */
function canStand(x, z, zone = views.zone) {
  if (zone && zone !== 'exterior') {
    const area = areas.get(zone);
    return area ? canStandIn(area, x, z) : true;
  }
  if (shoreDistance(x, z, ISLAND_OUTLINE) > SHORE_MARGIN) return false;
  for (const gate of gates) {
    try { if (gate(x, z, state)) return false; } catch (err) { console.error('[views] roam gate failed', err); }
  }
  const col = ctx.world && ctx.world.colliders;
  if (!col) return true;
  for (const [cx, cz, r] of col.circles) {
    const rr = r + R_PLAYER;
    if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < rr * rr) return false;
  }
  for (const [x0, z0, x1, z1] of col.boxes) {
    if (x > x0 - R_PLAYER && x < x1 + R_PLAYER && z > z0 - R_PLAYER && z < z1 + R_PLAYER) return false;
  }
  for (const [ax, az, bx, bz, w] of col.segments) {
    if (distToSegment(x, z, ax, az, bx, bz) < (w || 0) + R_PLAYER) return false;
  }
  return true;
}

function eyeHeight(x, z, zone = views.zone) {
  if (zone && zone !== 'exterior') {
    const area = areas.get(zone);
    return ((area && area.floor) || 0) + ((area && area.eye) || 1.65);
  }
  const g = ctx.world && ctx.world.groundHeight ? ctx.world.groundHeight(x, z) : GROUND_Y;
  return Math.max(g, -0.2) + EYE;
}

/** 机位落在障碍里时（例如紧贴神殿门洞的机位），沿视线反方向退到能站的地方。 */
function unstick(pos, yaw, zone = views.zone) {
  if (canStand(pos.x, pos.z, zone)) return;
  const bx = -Math.sin(yaw), bz = Math.cos(yaw);
  for (let d = 0.25; d <= 6; d += 0.25) {
    if (canStand(pos.x + bx * d, pos.z + bz * d, zone)) { pos.x += bx * d; pos.z += bz * d; return; }
  }
  for (let d = 0.5; d <= 6; d += 0.5) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const x = pos.x + Math.cos(a) * d, z = pos.z + Math.sin(a) * d;
      if (canStand(x, z, zone)) { pos.x = x; pos.z = z; return; }
    }
  }
}

/** 视图机位对应的漫游位姿：位置取机位的 x/z（视线高度跟地形 / 室内地板），朝向取机位看向目标的方向。 */
function roamPoseFrom(pose, zone = views.zone) {
  const d = new THREE.Vector3().subVectors(pose.target, pose.pos);
  const flat = Math.hypot(d.x, d.z);
  const yaw = flat > 1e-6 ? Math.atan2(d.x, -d.z) : 0;
  const pitch = clamp(Math.atan2(d.y, flat || 1), LOOK.pitchMin, LOOK.pitchMax);
  const pos = new THREE.Vector3(pose.pos.x, 0, pose.pos.z);
  unstick(pos, yaw, zone);
  pos.y = eyeHeight(pos.x, pos.z, zone);
  return { pos, yaw, pitch };
}

function setRoamFromPose(pose, zone = views.zone) {
  restoreRoam(roamPoseFrom(pose, zone));
}

/** 两点之间的直线能否走过去（中途没有墙、树、家具和门禁）。 */
function pathClear(a, b, zone = views.zone) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.4);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (!canStand(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, zone)) return false;
  }
  return true;
}

function captureRoam() {
  return { pos: roam.pos.clone(), yaw: roam.yaw, pitch: roam.pitch };
}

function restoreRoam(m) {
  roam.pos.copy(m.pos);
  roam.yaw = m.yaw;
  roam.pitch = m.pitch;
  roam.vel.set(0, 0, 0);
}

function startRoam() {
  if (roam.active) return;
  roam.active = true;
  roam.amb = null;
  owned = false;
  look.vyaw = look.vpitch = 0;
  ui.setRoam?.(true);
}

function stopRoam() {
  if (!roam.active) return;
  roam.active = false;
  roam.gliding = false;
  roam.vel.set(0, 0, 0);
  look.vyaw = look.vpitch = 0;
  ui.setRoam?.(false);
}

/** 暂停漫游并记住这个区域的位姿（过场接管相机、进入特写时），回到该区域的开放视图时恢复。 */
function suspendRoam() {
  if (!roam.active) return;
  roamMemory[views.zone] = captureRoam();
  stopRoam();
}

/** 漫游中由脚本 / 测试移动到另一个室外机位：沿直线滑行，期间暂停玩家输入。 */
async function glideRoam(pose, ms, token, to = roamPoseFrom(pose)) {
  const from = captureRoam();
  const dyaw = wrapAngle(to.yaw - from.yaw);
  roam.gliding = true;
  try {
    await animate(ms, (k) => {
      if (token !== goToken) return;
      roam.pos.lerpVectors(from.pos, to.pos, k);
      roam.yaw = wrapAngle(from.yaw + dyaw * k);
      roam.pitch = from.pitch + (to.pitch - from.pitch) * k;
    }, Ease.inOutSine);
  } finally {
    roam.gliding = false;
  }
  if (token === goToken) restoreRoam(to);
}

const keyDown = (k) => held.has(k) && !suppressed.has(k);

// 正面顶住圆形障碍（树干、圆桌、山羊）时按轴拆分滑不动：把这一步转一个角度（由小到大、左右交替）
// 沿着障碍边缘绕过去，速度按转角的余弦减小。转到 75° 仍然走不了才停下。
const SLIDE_ANGLES = [0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.3, -1.3];
function slideAround(x, z, dx, dz) {
  for (const a of SLIDE_ANGLES) {
    const c = Math.cos(a), s = Math.sin(a);
    const mx = (dx * c - dz * s) * c, mz = (dx * s + dz * c) * c;
    if (canStand(x + mx, z + mz)) { roam.pos.x = x + mx; roam.pos.z = z + mz; return true; }
  }
  return false;
}

function updateRoam(realDt) {
  if (!roam.active || !realDt) return;
  const dt = Math.min(realDt, 0.05);
  const want = _move.set(0, 0, 0);
  if (!roam.gliding && !ui.locked && !ui.modalOpen && !views.transitioning) {
    const fx = Math.sin(roam.yaw), fz = -Math.cos(roam.yaw);
    if (keyDown('f')) { want.x += fx; want.z += fz; }
    if (keyDown('b')) { want.x -= fx; want.z -= fz; }
    if (keyDown('r')) { want.x -= fz; want.z += fx; }
    if (keyDown('l')) { want.x += fz; want.z -= fx; }
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(held.has('shift') ? RUN : WALK);
    const st = touch.stick;
    const m = Math.min(1, Math.hypot(st.x, st.y));
    if (!want.lengthSq() && m > 0.12) {
      // 触屏摇杆：y 向前、x 向右；推得越远走得越快，推到底奔跑
      const speed = m < 0.9 ? WALK * m / 0.9 : WALK + (RUN - WALK) * (m - 0.9) / 0.1;
      want.x = ((fx * st.y - fz * st.x) / m) * speed;
      want.z = ((fz * st.y + fx * st.x) / m) * speed;
    }
  }
  // 起步 / 停步略带惯性
  const k = 1 - Math.exp(-dt * 12);
  roam.vel.x += (want.x - roam.vel.x) * k;
  roam.vel.z += (want.z - roam.vel.z) * k;
  if (Math.abs(roam.vel.x) + Math.abs(roam.vel.z) > 1e-3) {
    const { x, z } = roam.pos;
    const nx = x + roam.vel.x * dt, nz = z + roam.vel.z * dt;
    // 当前位置已经卡在障碍里（脚本传送造成）时放行，让玩家能走出来
    if (!canStand(x, z) && shoreDistance(nx, nz, ISLAND_OUTLINE) <= SHORE_MARGIN) { roam.pos.x = nx; roam.pos.z = nz; }
    else if (canStand(nx, nz)) { roam.pos.x = nx; roam.pos.z = nz; }
    else {
      const dx = nx - x, dz = nz - z, len = Math.hypot(dx, dz);
      // 斜着撞墙时沿墙滑动（只取还剩一半以上步长的那个轴）
      if (Math.abs(dx) > len * 0.5 && canStand(nx, z)) { roam.pos.x = nx; roam.vel.z = 0; }
      else if (Math.abs(dz) > len * 0.5 && canStand(x, nz)) { roam.pos.z = nz; roam.vel.x = 0; }
      // 正面顶住圆形障碍时沿边缘绕过去；还不行再退回只走一个轴
      else if (slideAround(x, z, dx, dz)) { /* 已经绕着走了一步 */ }
      else if (Math.abs(dx) > 1e-6 && canStand(nx, z)) { roam.pos.x = nx; roam.vel.z = 0; }
      else if (Math.abs(dz) > 1e-6 && canStand(x, nz)) { roam.pos.z = nz; roam.vel.x = 0; }
      else roam.vel.set(0, 0, 0);
    }
  } else roam.vel.set(0, 0, 0);
  if (!roam.gliding) {
    const ty = eyeHeight(roam.pos.x, roam.pos.z);
    roam.pos.y += (ty - roam.pos.y) * (1 - Math.exp(-dt * 8));
  }
  // 环境音跟着脚下的位置走：森林里是林间声，海滩和湖岸是湖水声；室内按区域
  const amb = roamAmbience(views.zone, roam.pos.z);
  if (amb !== roam.amb) { roam.amb = amb; audio.ambience(amb); }
}

// ------------------------------------------------------------------ keyboard
function moveKey(ev) {
  return MOVE_CODES[ev.code] || MOVE_KEYS[String(ev.key || '').toLowerCase()] || null;
}

function onKeyDown(ev) {
  const k = moveKey(ev);
  if (!k) return;
  if (k !== 'shift' && (ev.ctrlKey || ev.metaKey || ev.altKey)) return; // 不拦截浏览器快捷键
  if (ev.defaultPrevented || ui.modalOpen) return;                      // 已被 ui 处理（关闭信件、检视器……）
  if (k !== 'shift') ev.preventDefault();                               // 方向键不滚动页面
  if (ev.repeat) return;
  held.add(k);
  // 固定镜头（特写 / 室内）里 S、↓ 等同于点 ▼ 返回；这次按键不再驱动返回后的漫游
  if (k === 'b' && !roam.active && !ui.locked && !views.transitioning && ui.arrowState.down) {
    suppressed.add(k);
    views.arrow('down').catch((err) => console.error(err));
  }
}

function onKeyUp(ev) {
  const k = moveKey(ev);
  if (!k) return;
  held.delete(k);
  suppressed.delete(k);
}

function releaseInput() {
  held.clear();
  suppressed.clear();
  pointer.valid = false;
}

// ------------------------------------------------------------------ arrows & cursors
function updateUpArrow() {
  const spec = views.current;
  if (!spec || !spec.upAt || views.transitioning || ui.locked || !ui.arrowState?.up) return;
  const cam = engine.camera;
  cam.updateMatrixWorld();
  toVec(spec.upAt, _proj).project(cam);
  if (_proj.z > 1 || _proj.z < -1) { ui.moveUpArrow(null); return; }
  ui.moveUpArrow({ x: (_proj.x + 1) / 2, y: (1 - _proj.y) / 2 });
}

function chevronCursor(deg) {
  const p = 'M12 7 L21 16 L12 25';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="rotate(${deg} 16 16)" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${p}" stroke="#111" stroke-width="7"/><path d="${p}" stroke="#f4efe2" stroke-width="3.2"/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, default`;
}
const TURN_CURSORS = { right: chevronCursor(0), down: chevronCursor(90), left: chevronCursor(180), up: chevronCursor(270) };

export const views = {
  current: null,          // the current view SPEC (use state.view for the id)
  zone: null,             // current zone id
  transitioning: false,
  get owned() { return owned; },
  /** 相机位姿变化计数（热点悬停用它判断是否需要重新拾取）。 */
  get camVersion() { return camVersion; },

  init(e) {
    engine = e;
    engine.onFrame((realDt) => { updateRoam(realDt); applyCamera(realDt, true); updateUpArrow(); });
    // 指针在整个窗口内跟踪，是否在画布上由 updatePointerLook() 判断
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerMove, { passive: true });
    document.addEventListener('mouseout', (ev) => { if (!ev.relatedTarget) pointer.valid = false; });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseInput);
    state.on('reset', () => { this.current = null; stopRoam(); roamMemory = {}; });
  },

  registerZone(zoneId, group) {
    zones.set(zoneId, group);
    if (group) group.visible = this.zone ? zoneId === this.zone : zoneId === 'exterior';
  },

  setZone(zoneId) {
    if (!zones.has(zoneId)) console.warn(`[views] zone "${zoneId}" is not registered`);
    this.zone = zoneId;
    for (const [id, g] of zones) if (g) g.visible = id === zoneId;
  },

  define(spec) {
    if (!spec || !spec.id) throw new Error('views.define: spec.id required');
    if (!spec.cam) throw new Error(`views.define(${spec.id}): spec.cam required`);
    if (specs.has(spec.id)) console.warn(`[views] redefining view "${spec.id}"`);
    const s = { zone: 'exterior', closeup: false, fixed: false, back: null, left: null, right: null, up: null, upAt: null, ...spec };
    specs.set(s.id, s);
    return s;
  },

  get(id) { return specs.get(id) || null; },
  all() { return [...specs.values()]; },
  ids() { return [...specs.keys()]; },
  /** 视图是否为开放视图（室外自由漫游）。 */
  isOpen(idOrSpec) { return isOpen(typeof idOrSpec === 'string' ? specs.get(idOrSpec) : idOrSpec); },

  /**
   * Navigate to a view. Resolves after the camera arrived and onEnter finished.
   * opts.teleport：进入开放视图时忽略记住的漫游位置，直接使用该视图的机位（测试 / 开发跳转用）。
   */
  async go(id, { instant = false, duration, fade, teleport = false } = {}) {
    const spec = specs.get(id);
    if (!spec) throw new Error(`views.go: unknown view "${id}". Known: ${[...specs.keys()].join(', ')}`);
    if (!engine) throw new Error('views.go before views.init');
    const from = this.current;
    const toOpen = isOpen(spec);
    if (from === spec && !this.transitioning && !instant && !teleport && (toOpen ? roam.active : owned)) {
      this.refreshArrows();
      return;
    }
    const token = ++goToken;
    this.transitioning = true;
    ui.setArrows(null);
    try {
      if (from && from !== spec && from.onExit) await from.onExit(ctx);
      if (token !== goToken) return;
      const pose = resolvePose(spec);
      const zoneChange = this.zone !== spec.zone;
      let fadeIn = null;
      if (toOpen && roam.active && !zoneChange) {
        // 在同一区域里漫游时切到另一个地点（只有脚本和测试会这样做）：直线畅通就走过去，
        // 中间隔着墙或树就黑场切过去；测试对当前视图再 go 一次（teleport）= 回到该视图的机位
        const dest = roamPoseFrom(pose, spec.zone);
        if (instant || from === spec) restoreRoam(dest);
        else if (pathClear(roam.pos, dest.pos, spec.zone)) await glideRoam(pose, duration ?? 900, token, dest);
        else {
          await ui.fade(1, 250);
          if (token !== goToken) return;
          restoreRoam(dest);
          fadeIn = ui.fade(0, 300);
        }
        if (token !== goToken) return;
      } else if (toOpen) {
        // 进入开放视图（从总览 / 特写，或从另一个区域的漫游，例如进出房子）。
        // 室外回到离开时的位置；室内只在从同一区域的特写返回时回到原位，从外面进门总是站在门口（视图机位）。
        const fromZone = this.zone;
        if (roam.active) { roamMemory[fromZone] = captureRoam(); stopRoam(); }
        const mem = roamMemory[spec.zone];
        const resume = !!mem && !teleport && (spec.zone === 'exterior' || fromZone === spec.zone);
        const useFade = !instant && (fade ?? (!!from && (zoneChange || !!from.closeup)));
        if (useFade) {
          await ui.fade(1, 250);
          if (token !== goToken) return;
        } else if (!instant && from && !resume && !zoneChange) {
          // 同区域的固定镜头（例如总览）先平滑拉近到机位，再交给漫游
          await this._glide(pose, duration ?? 900, token);
          if (token !== goToken) return;
        }
        if (zoneChange || !from) this.setZone(spec.zone);
        if (resume) restoreRoam(mem);
        else setRoamFromPose(pose, spec.zone);
        delete roamMemory[spec.zone];
        startRoam();
        writeRoamCamera();
        if (useFade) fadeIn = ui.fade(0, 300);
      } else {
        // 固定镜头：总览、室内布景、谜题特写
        if (roam.active) { roamMemory[this.zone] = captureRoam(); stopRoam(); }
        const useFade = fade ?? (!!from && (zoneChange || !!spec.closeup || !!from.closeup));
        if (instant || !from) {
          this._snap(pose);
          if (zoneChange || !from) this.setZone(spec.zone);
        } else if (useFade) {
          await ui.fade(1, 250);
          if (token !== goToken) return;
          this._snap(pose);
          if (zoneChange) this.setZone(spec.zone);
          fadeIn = ui.fade(0, 300);
        } else {
          await this._glide(pose, duration ?? 900, token);
          if (token !== goToken) return;
        }
      }
      this.current = spec;
      look.fx = look.fy = look.tx = look.ty = 0;
      disarmPointer();
      state.setView(id);
      const amb = toOpen ? roamAmbience(spec.zone, roam.pos.z) : zoneAmbience(spec, pose);
      roam.amb = toOpen ? amb : null;
      if (amb) audio.ambience(amb);
      if (spec.music) audio.music(spec.music);
      this.transitioning = false;
      this.refreshArrows();
      if (spec.onEnter) await spec.onEnter(ctx);
      if (fadeIn) await fadeIn;
    } finally {
      if (token === goToken) {
        this.transitioning = false;
        this.refreshArrows();
      }
    }
  },

  back() {
    const b = resolveDir(this.current, 'back');
    return b ? this.go(b) : Promise.resolve();
  },

  /** Follow an arrow: 'left' | 'right' | 'up' | 'down' (down = back). */
  arrow(dir) {
    if (this.transitioning || ui.locked) return Promise.resolve(false);
    const key = dir === 'down' ? 'back' : dir;
    const target = resolveDir(this.current, key);
    if (!target) return Promise.resolve(false);
    return this.go(target).then(() => true);
  },

  /** Resolved neighbour ids of the current (or given) view. */
  neighbours(spec = this.current) {
    return {
      left: resolveDir(spec, 'left'), right: resolveDir(spec, 'right'),
      up: resolveDir(spec, 'up'), back: resolveDir(spec, 'back'),
    };
  },

  refreshArrows() {
    const spec = this.current;
    // 开放视图里自由走动，不显示任何方向箭头
    if (!spec || roam.active || isOpen(spec) || this.transitioning || ui.locked) { ui.setArrows(null); return; }
    const n = this.neighbours(spec);
    let upScreen = null;
    if (n.up && spec.upAt) {
      engine.camera.updateMatrixWorld();
      toVec(spec.upAt, _proj).project(engine.camera);
      if (_proj.z <= 1 && _proj.z >= -1) upScreen = { x: (_proj.x + 1) / 2, y: (1 - _proj.y) / 2 };
    }
    ui.setArrows({ left: !!n.left, right: !!n.right, up: !!n.up, down: !!n.back, upScreen }, (dir) => {
      this.arrow(dir).catch((err) => { console.error(err); throw err; });
    });
  },

  // ------------------------------------------------------------------ 室外漫游
  /** 是否正在室外自由漫游。 */
  get freeMode() { return roam.active; },
  /**
   * 注册漫游门禁：fn(x, z, state) 返回 true 时玩家不能走到该点（例如天堂门打开之前的森林）。
   * 返回取消注册的函数。
   */
  addRoamGate(fn) {
    gates.push(fn);
    return () => { const i = gates.indexOf(fn); if (i >= 0) gates.splice(i, 1); };
  },
  /**
   * 定义室内区域的可走范围（配合视图的 roam: true 使用）：
   * { bounds: [x0, z0, x1, z1]（墙内侧）, circles: [[x, z, r]], boxes: [[x0, z0, x1, z1]]（家具）, eye, floor }。
   */
  defineRoamArea(zone, area) { areas.set(zone, { circles: [], boxes: [], ...area }); },
  /** 让鼠标的“靠边转向”失效，直到鼠标再次移动（切换到触屏操作时调用）。 */
  dropPointer() { pointer.valid = false; },
  /** 漫游时 (x, z) 能否站人（测试 / 调试用）。 */
  canStand(x, z) { return canStand(x, z); },
  /** 测试 / 调试：把正在漫游的玩家放到 pos 并看向 target（落在障碍里时会自动退出来）。 */
  placeRoam(pos, target) {
    if (!roam.active) return false;
    setRoamFromPose({ pos: toVec(pos), target: toVec(target) });
    return true;
  },
  /** 当前漫游位姿与鼠标视角状态（调试用）。 */
  roamInfo() {
    return {
      active: roam.active, gliding: roam.gliding,
      pos: roam.pos.toArray().map((v) => Math.round(v * 100) / 100),
      yaw: Math.round(roam.yaw * 1000) / 1000, pitch: Math.round(roam.pitch * 1000) / 1000,
      look: { nx: Math.round(look.nx * 100) / 100, ny: Math.round(look.ny * 100) / 100, armed: pointer.armed, valid: pointer.valid },
      memory: Object.keys(roamMemory),
      touch: { active: touch.active, stick: touch.stick, looking: touch.looking },
    };
  },
  /** 漫游中指针处于转向区时的光标（左右 / 上下箭头），否则为默认光标。 */
  edgeCursor() {
    if (!roam.active || !canLook()) return 'default';
    const ex = edge(look.nx, LOOK.deadX), ey = edge(look.ny, LOOK.deadY);
    if (ex) return ex > 0 ? TURN_CURSORS.right : TURN_CURSORS.left;
    if (ey) return ey > 0 ? TURN_CURSORS.down : TURN_CURSORS.up;
    return 'default';
  },

  // ------------------------------------------------------------- camera helpers (extras)
  /** Snap the camera to a pose and take ownership (used by the title menu and cutscenes). */
  setCamera(pose) { this._snap({ pos: toVec(pose.pos), target: toVec(pose.target), fov: pose.fov || 45 }); },
  /** Glide the camera to a temporary pose inside the current view (cutscene helper). */
  moveCamera(pose, ms = 900, ease = Ease.inOutSine) {
    return this._glide({ pos: toVec(pose.pos), target: toVec(pose.target), fov: pose.fov || base.fov }, ms, goToken, ease);
  },
  /** Glide back to the current view's own pose (漫游中则滑回该视图的出生机位). */
  resetCamera(ms = 600) {
    if (!this.current) return Promise.resolve();
    if (roam.active) return glideRoam(resolvePose(this.current), ms, goToken);
    return this._glide(resolvePose(this.current), ms, goToken);
  },
  /** Stop writing the camera (a cutscene wants full control). views.go() takes it back. */
  release() { suspendRoam(); owned = false; },
  /** Current base pose (copy). */
  pose() { return { pos: base.pos.clone(), target: base.target.clone(), fov: base.fov }; },
  /** Show a view's camera + zone instantly WITHOUT entering it (no onEnter/onExit, state untouched). */
  peek(id) {
    const spec = specs.get(id);
    if (!spec) throw new Error(`views.peek: unknown view "${id}"`);
    this.setZone(spec.zone);
    this._snap(resolvePose(spec));
  },
  /** The resolved camera pose of a view (does not move the camera). */
  poseOf(id) {
    const spec = specs.get(id);
    return spec ? resolvePose(spec) : null;
  },

  _snap(pose) {
    suspendRoam();
    base.pos.copy(pose.pos);
    base.target.copy(pose.target);
    base.fov = pose.fov;
    owned = true;
    look.fx = look.fy = look.tx = look.ty = 0;
    applyCamera(0);
  },

  _glide(pose, ms, token, ease = Ease.inOutSine) {
    suspendRoam();
    const cam = engine.camera;
    // start from wherever the camera really is (it may have been moved by a cutscene)
    const fromPos = cam.position.clone();
    let fromTarget;
    if (owned) fromTarget = base.target.clone();
    else {
      cam.getWorldDirection(_dir);
      fromTarget = fromPos.clone().addScaledVector(_dir, Math.max(1, pose.pos.distanceTo(pose.target)));
    }
    const fromFov = owned ? base.fov : cam.fov;
    base.pos.copy(fromPos); base.target.copy(fromTarget); base.fov = fromFov;
    owned = true;
    applyCamera(0);
    return animate(ms, (k) => {
      if (token !== goToken) return;
      base.pos.lerpVectors(fromPos, pose.pos, k);
      base.target.lerpVectors(fromTarget, pose.target, k);
      base.fov = fromFov + (pose.fov - fromFov) * k;
      if (!owned) { owned = true; }
      applyCamera(0);
    }, ease);
  },

  /** Screen-space (0..1, y down) position of a world point/Object3D, or null if behind the camera. */
  project(target) {
    const cam = engine.camera;
    cam.updateMatrixWorld();
    toVec(target, _proj).project(cam);
    if (_proj.z > 1) return null;
    return { x: (_proj.x + 1) / 2, y: (1 - _proj.y) / 2, z: _proj.z };
  },
};
