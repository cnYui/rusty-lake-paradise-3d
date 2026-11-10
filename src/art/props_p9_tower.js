// 第九灾塔里的道具（设计见 docs/plague9_10_design.md）：一层白墙房间（链条和绞盘、梯子、星座盘木柜、月相仪、窗外的月亮），
// 阁楼（五个金色挂件、墙上的影子和粉笔轮廓、地上一圈星座符号和蜡烛、通往塔顶平台的木门）、塔顶平台的火盆。
// 坐标都是各自区域原点下的局部坐标（米）；玩法真值在章节 flags 里，这里只呈现状态。
import * as THREE from 'three';
import { toon, unlit, flat } from './materials.js';
import { animate, Ease } from '../core/tween.js';
import { PI, group, add, box, ball, cyl, ring } from './p5_kit.js';
import { FINE, hitBox, tex, glow, zodiacGlyph, POWDER_COLORS } from './props_p9.js';
import { CANDLE_ANSWER } from '../chapters/plague9/rules.js';

// ---------------------------------------------------------------------------
// 房间外壳：四面墙（可以开拱形的洞）、地板、天花板。holes: { back|front|left|right: [{ x, y, w, h, arch }] }，x 是沿墙面的中心
function grunge(base, spots, seed = 1) {
  const t = tex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    let s = seed * 9301 + 49297;
    const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(${spots},${0.03 + r() * 0.08})`; g.beginPath(); g.ellipse(r() * w, r() * h, 6 + r() * 60, 4 + r() * 30, r() * PI, 0, 2 * PI); g.fill(); }
    g.strokeStyle = `rgba(${spots},0.18)`; g.lineWidth = 1.2; for (let i = 0; i < 18; i++) { g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 80, y + r() * 60); g.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.5, 0.5);
  return t;
}
function wallShape(len, h, holes = []) {
  const s = new THREE.Shape([[-len / 2, 0], [len / 2, 0], [len / 2, h], [-len / 2, h]].map(([x, y]) => new THREE.Vector2(x, y)));
  for (const o of holes) {
    const p = new THREE.Path(), x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, y0 = o.y, top = o.y + o.h;
    p.moveTo(x0, y0); p.lineTo(x1, y0);
    if (o.arch) { p.lineTo(x1, top - o.w / 2); p.absarc(o.x, top - o.w / 2, o.w / 2, 0, PI, false); } else p.lineTo(x1, top);
    p.lineTo(x0, o.arch ? top - o.w / 2 : top); p.lineTo(x0, y0);
    s.holes.push(p);
  }
  return new THREE.ShapeGeometry(s, 12);
}
export function roomShell({ name, w, d, h, wall = '#e3ded2', spots = '90,84,76', floor = '#7c6a58', ceil = '#4a3f36', holes = {}, seed = 3 }) {
  const r = group(name);
  const wallMat = flat('#ffffff', { map: grunge(wall, spots, seed), fog: false, side: THREE.DoubleSide });
  const mk = (len, hs, pos, rotY, nm) => { const m = add(r, new THREE.Mesh(wallShape(len, h, hs), wallMat), nm, pos); m.rotation.y = rotY; m.receiveShadow = true; return m; };
  mk(w, holes.back || [], [0, 0, -d / 2], 0, 'wall_back');
  mk(w, holes.front || [], [0, 0, d / 2], PI, 'wall_front');
  mk(d, holes.left || [], [-w / 2, 0, 0], PI / 2, 'wall_left');
  mk(d, holes.right || [], [w / 2, 0, 0], -PI / 2, 'wall_right');
  const boards = tex(512, 512, (g, ww, hh) => { g.fillStyle = floor; g.fillRect(0, 0, ww, hh); g.strokeStyle = 'rgba(30,22,16,0.45)'; g.lineWidth = 3; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(ww, i * 64); g.stroke(); } g.fillStyle = 'rgba(30,22,16,0.12)'; for (let i = 0; i < 60; i++) g.fillRect((i * 97) % ww, (i * 57) % hh, 40, 2); });
  boards.wrapS = boards.wrapT = THREE.RepeatWrapping; boards.repeat.set(w / 2.5, d / 2.5);
  const fl = add(r, new THREE.Mesh(new THREE.PlaneGeometry(w, d), flat('#ffffff', { map: boards, fog: false })), 'floor'); fl.rotation.x = -PI / 2; fl.receiveShadow = true;
  const ce = add(r, new THREE.Mesh(new THREE.PlaneGeometry(w, d), flat(ceil, { fog: false })), 'ceiling', [0, h, 0]); ce.rotation.x = PI / 2;
  // 墙角和墙脚的墨线
  const ink = unlit('#141312', { fog: false });
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) add(r, new THREE.Mesh(new THREE.BoxGeometry(0.025, h, 0.025), ink), 'ink_corner', [x, h / 2, z]);
  for (const [x, z, ww, dd] of [[0, -d / 2, w, 0.02], [0, d / 2, w, 0.02], [-w / 2, 0, 0.02, d], [w / 2, 0, 0.02, d]]) add(r, new THREE.Mesh(new THREE.BoxGeometry(ww, 0.02, dd), ink), 'ink_floor', [x, 0.01, z]);
  return r;
}

/** 窗外 / 门外的夜景卡片：深蓝天空、远山、湖面、月亮（setBlood(k) 让月亮变成暗红）。 */
export function nightBackdrop(w, h, { moon = [0.68, 0.3, 0.07], lake = true } = {}) {
  const t = tex(1024, Math.round(1024 * h / w), () => {});
  const st = { blood: 0 };
  const draw = () => {
    const c = t.image, g = c.getContext('2d'), W = c.width, H = c.height;
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#0b1124'); sky.addColorStop(0.7, '#1d2a48'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(240,238,225,0.8)'; for (let i = 0; i < 90; i++) g.fillRect((i * 389) % W, (i * 211) % Math.round(H * 0.55), 2, 2);
    const mc = `rgb(${Math.round(240 - 70 * st.blood)},${Math.round(238 - 180 * st.blood)},${Math.round(225 - 185 * st.blood)})`;
    g.shadowColor = st.blood ? '#ff4030' : '#c9d6ff'; g.shadowBlur = 40; g.fillStyle = mc; g.beginPath(); g.arc(moon[0] * W, moon[1] * H, moon[2] * W, 0, 2 * PI); g.fill(); g.shadowBlur = 0;
    g.fillStyle = 'rgba(120,118,112,0.25)'; for (const [dx, dy, rr] of [[-0.3, -0.2, 0.25], [0.25, 0.1, 0.2], [-0.05, 0.35, 0.18]]) { g.beginPath(); g.arc((moon[0] + dx * moon[2]) * W, moon[1] * H + dy * moon[2] * W, rr * moon[2] * W, 0, 2 * PI); g.fill(); }
    g.fillStyle = '#141b2c'; g.beginPath(); g.moveTo(0, H * 0.66);
    for (let x = 0; x <= W; x += 32) g.lineTo(x, H * (0.58 + 0.07 * Math.sin(x * 0.011) + 0.04 * Math.sin(x * 0.037)));
    g.lineTo(W, H); g.lineTo(0, H); g.fill();
    if (lake) { g.fillStyle = '#18233a'; g.fillRect(0, H * 0.72, W, H * 0.28); g.fillStyle = st.blood ? 'rgba(200,60,40,0.35)' : 'rgba(220,226,240,0.25)'; for (let i = 0; i < 6; i++) g.fillRect(moon[0] * W - 40 + i * 4, H * (0.75 + i * 0.035), 80 - i * 8, 3); }
    t.needsUpdate = true;
  };
  draw();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), unlit('#ffffff', { map: t, fog: false }));
  m.name = 'night_backdrop';
  m.setBlood = (k) => { if (Math.abs(k - st.blood) < 0.01) return; st.blood = k; draw(); };
  return m;
}

// ---------------------------------------------------------------------------
// 一层：白墙房间。后墙开拱窗（窗外是夜景卡片），前墙开出口门洞，天花板前左角是通往阁楼的方洞。
export const TOWER_ROOM = { w: 5, d: 5, h: 3.6, window: { x: 0.7, y: 1.0, w: 1.1, h: 1.6 }, door: { x: 0.9, w: 1.1, h: 2.2 }, hatch: [-1.6, 1.25] };
function towerRoom() {
  const R = TOWER_ROOM;
  const r = roomShell({ name: 'p9_tower_room', w: R.w, d: R.d, h: R.h, holes: { back: [{ ...R.window, arch: true }], front: [{ x: -R.door.x, y: 0, w: R.door.w, h: R.door.h, arch: true }] }, seed: 5 });
  // 窗框、窗台
  box(r, 'window_sill', [R.window.w + 0.16, 0.06, 0.24], '#6b5a48', [R.window.x, R.window.y - 0.03, -R.d / 2 + 0.06], toon('#6b5a48', FINE));
  const back = nightBackdrop(4.6, 3.0, { moon: [0.5, 0.36, 0.07] }); back.position.set(R.window.x, 1.9, -R.d / 2 - 1.2); r.add(back);
  const outside = nightBackdrop(3, 3, { moon: [0.2, 0.15, 0.04] }); outside.position.set(R.door.x, 1.4, R.d / 2 + 1.0); outside.rotation.y = PI; r.add(outside);
  // 天花板上的方洞（通往阁楼）
  add(r, new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), unlit('#0c0b0a', { fog: false })), 'hatch_hole', [R.hatch[0], R.h - 0.004, R.hatch[1]]).rotation.x = PI / 2;
  for (const [dx, dz, ww, dd] of [[0, -0.5, 1.05, 0.08], [0, 0.5, 1.05, 0.08], [-0.5, 0, 0.08, 1.05], [0.5, 0, 0.08, 1.05]]) box(r, 'hatch_frame', [ww, 0.06, dd], '#4a3a2c', [R.hatch[0] + dx, R.h - 0.03, R.hatch[1] + dz], toon('#4a3a2c', FINE));
  // 天花板的两根横梁
  for (const z of [-1.2, 0.3]) box(r, 'ceiling_beam', [R.w, 0.16, 0.16], '#3d3027', [0, R.h - 0.08, z], toon('#3d3027', FINE));
  // 灯：屋里暗暗的暖光 + 窗外进来的冷光
  r.add(new THREE.HemisphereLight('#c9cfe0', '#4a4038', 1.1));
  const key = new THREE.DirectionalLight('#aebfe8', 0.7); key.position.set(R.window.x, 3, -R.d / 2 - 2); key.target.position.set(0, 0.5, 0.5); r.add(key, key.target);
  const lamp = new THREE.PointLight('#ffc98a', 3, 7, 1.4); lamp.position.set(0.3, 2.6, 0.6); r.add(lamp);
  hitBox(r, 'exit_hit', [R.door.w, R.door.h, 0.3], [R.door.x, R.door.h / 2, R.d / 2 - 0.05]);   // 前墙转了 180°，墙面局部 -x = 世界 +x
  hitBox(r, 'window_hit', [R.window.w, R.window.h, 0.2], [R.window.x, R.window.y + R.window.h / 2, -R.d / 2 + 0.05]);
  r.userData.exit = r.getObjectByName('exit_hit'); r.userData.window = r.getObjectByName('window_hit');
  r.setBlood = (k) => { back.setBlood(k); outside.setBlood(k); };
  return r;
}

/** 左墙上的链条绞盘：链条从天花板垂到绞盘，链上卡着一把挂锁；开锁以后摇绞盘把梯子放下来。原点在墙脚，面朝 +X（章节转过去）。 */
function chainLift() {
  const r = group('p9_chain');
  const links = group('chain_links'); r.add(links);
  for (let i = 0; i < 26; i++) { const l = ring(links, 'chain_link', 0.035, 0.009, '#5b5552', [0, 1.05 + i * 0.1, 0.08], FINE); l.rotation.y = i % 2 ? PI / 2 : 0; l.scale.set(1, 1.4, 1); }
  const drum = cyl(r, 'winch_drum', 0.11, 0.22, '#6e4b38', [0, 1.0, 0.12], 16, FINE); drum.rotation.x = PI / 2;
  box(r, 'winch_bracket', [0.08, 0.3, 0.06], '#3e3a37', [0, 1.0, 0.0], toon('#3e3a37', FINE));
  const crank = group('winch_crank'); crank.position.set(0, 1.0, 0.25); r.add(crank);
  box(crank, 'crank_arm', [0.04, 0.24, 0.03], '#3e3a37', [0, 0.1, 0], toon('#3e3a37', FINE));
  cyl(crank, 'crank_handle', 0.022, 0.12, '#cdb999', [0, 0.21, 0.06], 10, FINE).rotation.x = PI / 2;
  const clamp = cyl(r, 'chain_clamp', 0.06, 0.08, '#4a4440', [0, 1.5, 0.08], 12, FINE);
  const lock = group('padlock'); lock.position.set(0, 1.4, 0.15); r.add(lock);
  box(lock, 'padlock_body', [0.09, 0.08, 0.04], '#c9a043', [0, 0, 0], toon('#c9a043', FINE));
  add(lock, new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 12, PI), toon('#7d7f82', FINE)), 'padlock_shackle', [0, 0.04, 0]);
  add(lock, new THREE.Mesh(new THREE.CircleGeometry(0.01, 8), unlit('#2a2420')), 'padlock_hole', [0, -0.01, 0.021]);
  hitBox(r, 'lock_hit', [0.2, 0.22, 0.2], [0, 1.43, 0.15]);
  hitBox(r, 'crank_hit', [0.2, 0.4, 0.3], [0, 1.08, 0.25]);
  r.userData.lock = r.getObjectByName('lock_hit'); r.userData.crank = r.getObjectByName('crank_hit');
  r.setState = ({ locked = true } = {}) => { lock.visible = locked; clamp.visible = locked; lock.position.y = 1.4; lock.rotation.z = 0; links.position.y = 0; crank.rotation.z = 0; };
  r.unlock = () => animate(700, (k) => { lock.position.y = 1.4 - k * k * 1.35; lock.rotation.z = k * 1.2; }, Ease.linear).then(() => { lock.visible = false; clamp.visible = false; });
  r.wind = (ms = 2600) => animate(ms, (k) => { crank.rotation.z = -k * 8 * PI; links.position.y = -((k * 8) % 1) * 0.1; }, Ease.inOutSine).then(() => { links.position.y = 0; crank.rotation.z = 0; });
  r.setState();
  return r;
}

/** 通往阁楼的梯子：收起时缩在天花板洞口里、下半截露在外面（够不着），放下来以后滑到地上、斜靠着。原点在洞口正下方的地面。 */
function ladder() {
  const r = group('p9_ladder');
  const L = 3.62, pivot = group('ladder_pivot'); pivot.position.set(0, 3.55, -0.45); r.add(pivot);
  const body = group('ladder_body'); pivot.add(body);
  for (const s of [-1, 1]) box(body, 'ladder_rail', [0.05, L, 0.06], '#8a6a48', [s * 0.24, -L / 2, 0], toon('#8a6a48', FINE));
  for (let i = 0; i < 10; i++) box(body, 'ladder_rung', [0.48, 0.035, 0.04], '#9a7a56', [0, -0.25 - i * 0.34, 0], toon('#9a7a56', FINE));
  const hit = hitBox(r, 'ladder_hit', [0.7, 2.6, 0.5], [0, 1.4, 0.25]);
  r.userData.hit = hit;
  const RAISED = 1.6, TILT = -0.2;   // 收起：往上缩 1.6 m、竖直；放下：落到地上、底部往外斜
  r.setState = ({ down = false } = {}) => { body.position.y = down ? 0 : RAISED; pivot.rotation.x = down ? TILT : 0; hit.position.y = down ? 1.4 : -9; };
  r.lower = () => animate(1700, (k) => { const s = Math.min(1, k / 0.7), t = Math.max(0, (k - 0.7) / 0.3); body.position.y = RAISED * (1 - s * s); pivot.rotation.x = TILT * t; }, Ease.linear)
    .then(() => { body.position.y = 0; pivot.rotation.x = TILT; hit.position.y = 1.4; });
  r.setState();
  return r;
}

/** 星座盘木柜：正面一个圆盘（12 格，从顶上的白羊开始顺时针），三根针的针尖是棕 / 白 / 蓝；下面三个抽屉，中间那个能拉开（里面是铜钥匙）。 */
export const HAND_COLORS = [POWDER_COLORS.powder_brown, POWDER_COLORS.powder_white, POWDER_COLORS.powder_blue];
function dialCabinet() {
  const r = group('p9_cabinet');
  const W = 0.9, H = 1.4, D = 0.45, WOOD = '#6e4b34';
  box(r, 'cab_body', [W, H, D], WOOD, [0, H / 2, 0], toon(WOOD, FINE));
  box(r, 'cab_top', [W + 0.08, 0.05, D + 0.06], '#5a3c29', [0, H + 0.025, 0], toon('#5a3c29', FINE));
  const face = tex(512, 512, (g, w) => {
    g.fillStyle = '#c98f52'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 2, 0, 2 * PI); g.fill();
    g.strokeStyle = '#3d2a1c'; g.lineWidth = 4; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 6, 0, 2 * PI); g.stroke();
    g.beginPath(); g.arc(w / 2, w / 2, w * 0.2, 0, 2 * PI); g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = -PI / 2 + (i - 0.5) * PI / 6; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * w * 0.2, w / 2 + Math.sin(a) * w * 0.2); g.lineTo(w / 2 + Math.cos(a) * (w / 2 - 6), w / 2 + Math.sin(a) * (w / 2 - 6)); g.stroke();
      const c = -PI / 2 + i * PI / 6;
      g.strokeStyle = '#2c1e14'; zodiacGlyph(g, i, w / 2 + Math.cos(c) * w * 0.27, w / 2 + Math.sin(c) * w * 0.27, 44, 4);
      // 外圈画几颗连起来的星（星座图）
      g.fillStyle = 'rgba(255,240,200,0.9)'; g.strokeStyle = 'rgba(255,240,200,0.55)'; g.lineWidth = 1.5; g.beginPath();
      for (let k = 0; k < 4; k++) { const rr = w * (0.37 + ((i * 7 + k * 3) % 5) * 0.022), aa = c + (k - 1.5) * 0.09; const x = w / 2 + Math.cos(aa) * rr, y = w / 2 + Math.sin(aa) * rr; if (k) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke(); g.strokeStyle = '#3d2a1c'; g.lineWidth = 4;
    }
  });
  const dial = group('cab_dial'); dial.position.set(0, 1.0, D / 2 + 0.012); r.add(dial);
  add(dial, new THREE.Mesh(new THREE.CircleGeometry(0.32, 48), toon('#ffffff', { ...FINE, map: face })), 'dial_face');
  ring(dial, 'dial_rim', 0.325, 0.014, '#b08a3e', [0, 0, 0.004], FINE);
  const hands = [0.27, 0.22, 0.17].map((len, i) => {
    const hnd = group(`dial_hand_${i}`); hnd.position.z = 0.012 + i * 0.008; dial.add(hnd);
    box(hnd, 'hand_bar', [0.014, len, 0.006], '#c9a043', [0, len / 2, 0], toon('#c9a043', FINE));
    const tip = i === 0 ? new THREE.ConeGeometry(0.03, 0.06, 3) : i === 1 ? new THREE.SphereGeometry(0.028, 12, 8) : new THREE.OctahedronGeometry(0.03, 0);
    const t = add(hnd, new THREE.Mesh(tip, toon(HAND_COLORS[i], FINE)), 'hand_tip', [0, len, 0.004]);
    if (i === 1) t.scale.set(0.8, 1.3, 0.5); else t.scale.z = 0.4;
    const hit = hitBox(hnd, `hand_hit_${i}`, [0.09, 0.09, 0.05], [0, len - 0.01, 0.01]); hit.userData.hand = i;
    hnd.userData.hit = hit;
    return hnd;
  });
  ball(dial, 'dial_pin', 0.022, '#c9a043', [0, 0, 0.04], [1, 1, 0.6], FINE);
  // 抽屉
  const drawers = [];
  for (let i = 0; i < 3; i++) {
    const dr = group(`cab_drawer_${i}`); dr.position.set(-0.29 + i * 0.29, 0.38, D / 2); r.add(dr);
    box(dr, 'drawer_front', [0.26, 0.26, 0.03], '#7b5a40', [0, 0, 0.015], toon('#7b5a40', FINE));
    ball(dr, 'drawer_knob', 0.018, '#c9a043', [0, 0, 0.04], [1, 1, 0.8], FINE);
    if (i === 1) { box(dr, 'drawer_box', [0.24, 0.2, 0.36], '#5a3c29', [0, -0.02, -0.17], toon('#5a3c29', FINE)); }
    drawers.push(dr);
  }
  const keyObj = group('cab_key'); keyObj.position.set(0, 0.08, -0.12); drawers[1].add(keyObj);
  r.userData.hands = hands.map((h) => h.userData.hit); r.userData.drawer = drawers[1]; r.userData.key = keyObj;
  const angle = (i) => -i * PI / 6;
  r.setState = ({ hands: hs = [0, 0, 0], open = false, key: hasKey = true } = {}) => {
    hands.forEach((h, i) => { h.rotation.z = angle(hs[i] || 0); });
    drawers[1].position.z = D / 2 + (open ? 0.26 : 0); keyObj.visible = open && hasKey;
  };
  r.turn = (i, to) => { const from = hands[i].rotation.z, target = angle(to); const end = target > from ? target - 2 * PI : target; return animate(260, (k) => { hands[i].rotation.z = from + (end - from) * k; }, Ease.outCubic).then(() => { hands[i].rotation.z = target; }); };
  r.openDrawer = () => animate(600, (k) => { drawers[1].position.z = D / 2 + 0.26 * k; }, Ease.outCubic).then(() => { keyObj.visible = true; });
  r.setState();
  return r;
}

/** 小圆桌 + 桌上的月相仪：中间是发光的太阳，地球在长臂上（8 个位置），月亮在地球旁边的短臂上（8 个方向，绝对方向）。 */
function orrery() {
  const r = group('p9_orrery');
  cyl(r, 'table_top', 0.46, 0.04, '#6b4f39', [0, 0.74, 0], 28, FINE);
  cyl(r, 'table_leg', 0.05, 0.72, '#5a4230', [0, 0.36, 0], 10, FINE);
  cyl(r, 'table_foot', 0.22, 0.03, '#5a4230', [0, 0.015, 0], 18, FINE);
  const base = group('orrery'); base.position.y = 0.76; r.add(base);
  cyl(base, 'orrery_base', 0.24, 0.025, '#b08a3e', [0, 0.012, 0], 32, FINE);
  for (const rr of [0.11, 0.18]) ring(base, 'orrery_orbit', rr, 0.004, '#d8b65a', [0, 0.028, 0], FINE).rotation.x = PI / 2;
  // 底座上刻 8 个位置的小点
  for (let i = 0; i < 8; i++) ball(base, 'orrery_mark', 0.008, '#5a4320', [Math.sin(i * PI / 4) * 0.21, 0.027, Math.cos(i * PI / 4) * 0.21], [1, 0.5, 1], FINE);
  cyl(base, 'orrery_column', 0.012, 0.22, '#c9a043', [0, 0.12, 0], 8, FINE);
  ball(base, 'orrery_sun', 0.05, '#ffd56a', [0, 0.24, 0], [1, 1, 1], { outline: false, emissive: '#ffb030' });
  add(base, new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), glow('#ffcf70', { opacity: 0.35 })), 'orrery_sun_glow', [0, 0.24, 0]);
  const sunLight = new THREE.PointLight('#ffd28a', 0.8, 2.5, 1.5); sunLight.position.set(0, 0.24, 0); base.add(sunLight);
  const earthArm = group('earth_arm'); earthArm.position.y = 0.2; base.add(earthArm);
  box(earthArm, 'earth_rod', [0.008, 0.008, 0.2], '#c9a043', [0, 0, 0.1], toon('#c9a043', FINE));
  const earthTex = tex(128, 64, (g, w, h) => { g.fillStyle = '#3f6f9e'; g.fillRect(0, 0, w, h); g.fillStyle = '#5f8a4a'; for (const [x, y, rx, ry] of [[20, 24, 14, 10], [60, 30, 18, 14], [96, 20, 12, 9], [100, 44, 10, 8]]) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 2 * PI); g.fill(); } });
  const earth = add(earthArm, new THREE.Mesh(new THREE.SphereGeometry(0.032, 18, 12), toon('#ffffff', { ...FINE, map: earthTex })), 'orrery_earth', [0, 0.01, 0.2]);
  const moonArm = group('moon_arm'); moonArm.position.set(0, 0.01, 0.2); earthArm.add(moonArm);
  box(moonArm, 'moon_rod', [0.005, 0.005, 0.07], '#c9a043', [0, 0.012, 0.035], toon('#c9a043', FINE));
  const moonMat = toon('#d9d6cc', FINE);
  const moon = add(moonArm, new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 10), moonMat), 'orrery_moon', [0, 0.012, 0.075]);
  for (let i = 0; i < 3; i++) {
    const normal = new THREE.Vector3((i - 1) * 0.4, 0.2 + (i % 2) * 0.4, 1).normalize();
    const crater = add(moon, new THREE.Mesh(new THREE.CircleGeometry(0.0025 + i * 0.0004, 10), unlit('#aaa69c')), `moon_crater_${i}`, normal.clone().multiplyScalar(0.0158).toArray());
    crater.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  }
  const earthHit = hitBox(earthArm, 'earth_hit', [0.09, 0.09, 0.09], [0, 0.01, 0.2]);
  const moonHit = hitBox(moonArm, 'moon_hit', [0.06, 0.06, 0.06], [0, 0.012, 0.078]);
  r.userData.earth = earthHit; r.userData.moon = moonHit;
  const st = { e: 0, m: 0, eclipse: 0 };
  const white = new THREE.Color('#d9d6cc'), red = new THREE.Color('#a8322a');
  const pose = () => { earthArm.rotation.y = st.e * PI / 4; moonArm.rotation.y = (st.m - st.e) * PI / 4; moonMat.color.copy(white).lerp(red, st.eclipse); };
  r.setState = ({ earth: e = 2, moon: m = 6, eclipse = false } = {}) => { st.e = e; st.m = m; st.eclipse = eclipse ? 1 : 0; pose(); };
  // 转一格：地球臂转动时月亮保持绝对方向
  r.step = (which, to) => {
    const from = { e: st.e, m: st.m }, target = { ...from, [which]: to };
    if (target[which] < from[which]) target[which] += 8;
    return animate(320, (k) => { st.e = from.e + (target.e - from.e) * k; st.m = from.m + (target.m - from.m) * k; pose(); }, Ease.outCubic)
      .then(() => { st.e = ((target.e % 8) + 8) % 8; st.m = ((target.m % 8) + 8) % 8; pose(); });
  };
  r.eclipse = () => animate(1500, (k) => { st.eclipse = k; pose(); }, Ease.inOutSine);
  r.setState();
  return r;
}

// ---------------------------------------------------------------------------
// 阁楼：五个金色挂件（兔、雉、鹿、鸽、野猪）、后墙上的影子和粉笔轮廓、地上一圈星座符号和蜡烛、右墙通往塔顶平台的木门
export const ATTIC = {
  w: 5.2, d: 4.4, h: 3.2, wallZ: -2.2, hole: [-1.6, 1.25], flameY: 0.36,
  ornaments: [[-0.9, 1.3, -1.2], [-0.45, 1.08, -1.2], [0, 1.38, -1.2], [0.45, 1.12, -1.2], [0.9, 1.25, -1.2]],
  size: 0.3,
  door: { z: -0.4, w: 1.0, h: 2.05 },
};
/** 地上第 i 个星座符号的位置（蜡烛放上去的地方）：一段半圆，0 白羊在左、11 双鱼在右。 */
export const candleSpot = (i) => { const th = (i + 0.5) / 12 * PI; return [-0.95 * Math.cos(th), 0, -0.2 + 0.9 * Math.sin(th)]; };
/** 点光源（蜡烛火苗）→ 挂件中心 → 后墙：影子的中心和放大倍数。 */
export function shadowOf(candle, o) {
  const [cx, cz] = [candle[0], candle[2]], cy = ATTIC.flameY, t = (ATTIC.wallZ - cz) / (o[2] - cz);
  return { x: cx + (o[0] - cx) * t, y: cy + (o[1] - cy) * t, scale: t };
}
export const ORNAMENT_KINDS = ['rabbit', 'pheasant', 'deer', 'pigeon', 'boar'];
/** 五种动物的剪影路径（画在 [-0.5, 0.5] 的格子里，头朝右）。 */
function animalPath(g, kind) {
  const E = (x, y, rx, ry, rot = 0) => { g.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); g.ellipse(x, y, rx, ry, rot, 0, 2 * PI); };
  g.beginPath();
  if (kind === 'rabbit') { E(-0.08, 0.12, 0.26, 0.2); E(0.2, -0.05, 0.12, 0.11); E(0.16, -0.3, 0.04, 0.17, -0.25); E(0.26, -0.3, 0.04, 0.17, 0.2); E(-0.34, 0.08, 0.06, 0.06); }
  else if (kind === 'pheasant') { E(-0.02, 0.08, 0.24, 0.15); E(0.24, -0.14, 0.08, 0.08); g.moveTo(-0.2, 0.04); g.lineTo(-0.5, -0.14); g.lineTo(-0.46, -0.06); g.lineTo(-0.18, 0.14); g.moveTo(0.3, -0.16); g.lineTo(0.42, -0.12); g.lineTo(0.3, -0.1); E(0.05, 0.3, 0.025, 0.08); }
  else if (kind === 'deer') { E(-0.08, 0.1, 0.26, 0.13); E(0.24, -0.16, 0.08, 0.07); g.rect(0.14, -0.14, 0.08, 0.2); g.rect(-0.28, 0.18, 0.05, 0.3); g.rect(0.08, 0.18, 0.05, 0.3);
    g.moveTo(0.22, -0.22); g.lineTo(0.18, -0.46); g.lineTo(0.22, -0.46); g.lineTo(0.26, -0.3); g.lineTo(0.34, -0.42); g.lineTo(0.36, -0.38); g.lineTo(0.27, -0.22); }
  else if (kind === 'pigeon') { E(-0.04, 0.06, 0.25, 0.16, 0.15); E(0.22, -0.14, 0.09, 0.09); g.moveTo(0.3, -0.15); g.lineTo(0.42, -0.12); g.lineTo(0.3, -0.1); g.moveTo(-0.26, 0.04); g.lineTo(-0.48, 0.14); g.lineTo(-0.44, 0.22); g.lineTo(-0.2, 0.16); g.rect(0.0, 0.2, 0.03, 0.12); }
  else { E(-0.04, 0.06, 0.3, 0.19); E(0.3, 0.02, 0.1, 0.11); g.rect(0.36, -0.02, 0.1, 0.09); g.moveTo(0.24, -0.12); g.lineTo(0.3, -0.26); g.lineTo(0.34, -0.1); for (const x of [-0.24, -0.1, 0.12, 0.22]) g.rect(x, 0.2, 0.06, 0.2); }
}
function animalTexture(kind, mode) {
  return tex(256, 256, (g, w) => {
    g.save(); g.translate(w / 2, w / 2); g.scale(w * 0.9, w * 0.9);
    animalPath(g, kind);
    if (mode === 'gold') { g.fillStyle = '#d8a93c'; g.fill(); g.lineWidth = 0.018; g.strokeStyle = '#5a3d12'; g.stroke(); }
    else if (mode === 'shadow') { g.fillStyle = '#000000'; g.fill(); }
    else { g.lineWidth = 0.014; g.strokeStyle = mode === 'chalk_lit' ? '#ffd86a' : '#f2efe6'; g.setLineDash([0.03, 0.012]); g.stroke(); }
    g.restore();
  });
}
function attic() {
  const A = ATTIC;
  const r = roomShell({ name: 'p9_attic', w: A.w, d: A.d, h: A.h, wall: '#8d8a84', spots: '50,48,46', floor: '#6a5a48', ceil: '#3a322b', seed: 11,
    // 右墙转了 -90°（墙面局部 +x = 世界 +z），左墙转了 +90°（局部 +x = 世界 -z）
    holes: { right: [{ x: A.door.z, y: 0, w: A.door.w, h: A.door.h, arch: true }], left: [{ x: 0.6, y: 1.2, w: 0.7, h: 1.0, arch: true }] } });
  // 后墙中间一块抹灰（影子打在这块白墙上，看得清）
  add(r, new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.5), flat('#d6d2c6', { fog: false })), 'shadow_wall', [0, 1.45, A.wallZ + 0.004]);
  // 地上的洞口和露出来的梯子顶
  add(r, new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), unlit('#0c0b0a', { fog: false })), 'attic_hole', [A.hole[0], 0.004, A.hole[1]]).rotation.x = -PI / 2;
  for (const s of [-1, 1]) box(r, 'attic_ladder_top', [0.05, 0.7, 0.06], '#8a6a48', [A.hole[0] + s * 0.24, 0.2, A.hole[1] + 0.42], toon('#8a6a48', FINE)).rotation.x = -0.2;
  // 左墙小窗外的夜景 + 窗边的望远镜（布景）
  const win = nightBackdrop(2.4, 2.0, { moon: [0.55, 0.35, 0.08] }); win.position.set(-A.w / 2 - 1.0, 1.7, -0.6); win.rotation.y = PI / 2; r.add(win);
  const scope = group('telescope'); scope.position.set(-1.9, 0, -0.55); r.add(scope);
  for (let i = 0; i < 3; i++) { const a = i * 2 * PI / 3; const leg = cyl(scope, 'scope_leg', 0.015, 1.2, '#5a4230', [Math.cos(a) * 0.18, 0.58, Math.sin(a) * 0.18], 6, FINE); leg.rotation.set(Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28); }
  const tube = cyl(scope, 'scope_tube', 0.05, 0.9, '#c9a043', [-0.2, 1.3, 0], 14, FINE); tube.rotation.z = PI / 2 - 0.45;
  // 挂件、影子、粉笔轮廓
  const items = A.ornaments.map((o, i) => {
    const kind = ORNAMENT_KINDS[i];
    const gold = add(r, new THREE.Mesh(new THREE.PlaneGeometry(A.size, A.size), flat('#ffffff', { map: animalTexture(kind, 'gold'), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, fog: false })), `ornament_${kind}`, o);
    add(r, new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, A.h - o[1] - A.size / 2, 4), unlit('#2a2622', { fog: false })), 'ornament_string', [o[0], (A.h + o[1] + A.size / 2) / 2, o[2]]);
    const sh = add(r, new THREE.Mesh(new THREE.PlaneGeometry(A.size, A.size), unlit('#ffffff', { map: animalTexture(kind, 'shadow'), transparent: true, opacity: 0.55, depthWrite: false, fog: false })), `shadow_${kind}`, [0, 0, A.wallZ + 0.012]);
    sh.renderOrder = 2;
    const chalk = add(r, new THREE.Mesh(new THREE.PlaneGeometry(A.size, A.size), unlit('#ffffff', { map: animalTexture(kind, 'chalk'), transparent: true, depthWrite: false, fog: false })), `chalk_${kind}`, [0, 0, A.wallZ + 0.008]);
    chalk.renderOrder = 1;
    const lit = animalTexture(kind, 'chalk_lit');
    return { o, gold, sh, chalk, chalkTex: chalk.material.map, lit };
  });
  // 粉笔轮廓画在蜡烛放在天蝎（CANDLE_ANSWER）时的影子位置上
  const answer = candleSpot(CANDLE_ANSWER);
  items.forEach(({ o, chalk }) => { const s = shadowOf(answer, o); chalk.position.set(s.x, s.y, A.wallZ + 0.008); chalk.scale.setScalar(s.scale); });
  // 地上一圈星座符号（每个一个点击盒）
  const floorTex = tex(1024, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(240,236,224,0.85)';
    for (let i = 0; i < 12; i++) { const [x, , z] = candleSpot(i); zodiacGlyph(g, i, w / 2 + x / 1.25 * (w / 2), (z + 0.5) / 1.25 * h, 44, 4); }
  });
  const floorMark = add(r, new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.25), unlit('#ffffff', { map: floorTex, transparent: true, depthWrite: false, fog: false })), 'floor_glyphs', [0, 0.006, 0.125]);
  floorMark.rotation.x = -PI / 2;
  const spots = [];
  for (let i = 0; i < 12; i++) { const [x, , z] = candleSpot(i); const h = hitBox(r, `spot_${i}`, [0.2, 0.06, 0.2], [x, 0.03, z]); h.userData.spot = i; spots.push(h); }
  const candle = group('attic_candle'); r.add(candle);
  cyl(candle, 'candle_dish', 0.06, 0.012, '#b08a3e', [0, 0.006, 0], 18, FINE);
  cyl(candle, 'candle_wax', 0.022, 0.3, '#f1ece0', [0, 0.16, 0], 14, FINE);
  const flame = add(candle, new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), glow('#ffd27a')), 'candle_flame', [0, A.flameY - 0.01, 0]);
  flame.scale.set(0.7, 1.7, 0.7);
  const cLight = new THREE.PointLight('#ffcf8a', 2.4, 8, 1.3); cLight.position.set(0, A.flameY + 0.05, 0); candle.add(cLight);
  const candleHit = hitBox(candle, 'candle_hit', [0.16, 0.42, 0.16], [0, 0.2, 0]);
  r.add(new THREE.HemisphereLight('#8d93a8', '#2c2620', 0.55));
  // 右墙的木门（两个红色饰件），门后是塔顶平台
  const D = A.door, door = group('attic_door'); door.position.set(A.w / 2 - 0.02, 0, D.z + D.w / 2); r.add(door);
  for (let i = 0; i < 4; i++) box(door, 'door_plank', [0.05, D.h - 0.35, 0.25], '#c8b694', [0, (D.h - 0.35) / 2, -0.125 - i * 0.25], toon(i % 2 ? '#c8b694' : '#bfae8c', FINE));
  for (const y of [0.9, 1.3]) box(door, 'door_ornament', [0.04, 0.14, 0.08], '#a8442e', [-0.04, y, -0.72], toon('#a8442e', FINE));
  const doorHit = hitBox(r, 'door_hit', [0.3, D.h, D.w], [A.w / 2 - 0.1, D.h / 2, D.z]);
  // 塔顶平台：门外的石栏杆、火盆，远处是夜里的湖
  const deck = group('beacon_deck'); deck.position.set(A.w / 2, 0, D.z); r.add(deck);
  box(deck, 'deck_floor', [2.6, 0.1, 3.0], '#6f6c69', [1.3, -0.05, 0], toon('#6f6c69', FINE));
  box(deck, 'deck_parapet', [0.3, 0.9, 3.0], '#7d7a76', [2.5, 0.45, 0], toon('#7d7a76', FINE));
  for (const z of [-1.4, 1.4]) box(deck, 'deck_side', [2.6, 0.9, 0.3], '#7d7a76', [1.3, 0.45, z], toon('#7d7a76', FINE));
  const lakeView = nightBackdrop(14, 7, { moon: [0.3, 0.28, 0.05] }); lakeView.position.set(8, 1.5, 0); lakeView.rotation.y = -PI / 2; deck.add(lakeView);
  const brazier = group('beacon'); brazier.position.set(1.5, 0, 0); deck.add(brazier);
  for (let i = 0; i < 3; i++) { const a = i * 2 * PI / 3; const leg = cyl(brazier, 'beacon_leg', 0.025, 0.95, '#2c2a28', [Math.cos(a) * 0.22, 0.45, Math.sin(a) * 0.22], 6, FINE); leg.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2); }
  add(brazier, new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.22, 0.32, 14, 1, true), toon('#2c2a28', { ...FINE, side: THREE.DoubleSide })), 'beacon_bowl', [0, 1.05, 0]);
  for (let i = 0; i < 5; i++) { const l = cyl(brazier, 'beacon_log', 0.04, 0.6, '#4b3526', [Math.cos(i) * 0.1, 1.12, Math.sin(i) * 0.1], 8, FINE); l.rotation.set(Math.sin(i * 1.3) * 1.2, 0, Math.cos(i * 1.3) * 1.2); }
  const flames = [];
  for (let i = 0; i < 4; i++) flames.push(add(brazier, new THREE.Mesh(new THREE.ConeGeometry(0.3 - i * 0.05, 1.2, 10, 1, true), glow('#ff8a3a', { opacity: 0.6, side: THREE.DoubleSide })), 'beacon_flame', [Math.cos(i * 2) * 0.06, 1.7, Math.sin(i * 2) * 0.06]));
  const bLight = new THREE.PointLight('#ff9a50', 0, 14, 1.3); bLight.position.set(0, 1.8, 0); brazier.add(bLight);
  const beaconHit = hitBox(brazier, 'beacon_hit', [0.9, 1.0, 0.9], [0, 1.1, 0]);
  r.userData.spots = spots; r.userData.candle = candleHit; r.userData.door = doorHit; r.userData.beacon = beaconHit; r.userData.wall = r.getObjectByName('shadow_wall');
  r.userData.deck = deck; r.userData.brazier = brazier;
  const st = { at: 0, pos: candleSpot(0), solved: false, candle: true, open: false, lit: 0 };
  const place = () => {
    candle.position.set(st.pos[0], 0, st.pos[2]); candle.visible = st.candle;
    items.forEach(({ o, sh, chalk, chalkTex, lit }) => {
      const s = shadowOf(st.pos, o); sh.position.set(s.x, s.y, A.wallZ + 0.012); sh.scale.setScalar(s.scale); sh.visible = st.candle;
      const want = st.solved ? lit : chalkTex; if (chalk.material.map !== want) { chalk.material.map = want; chalk.material.needsUpdate = true; }
    });
    door.rotation.y = st.open ? -1.45 : 0; doorHit.visible = true;
    flames.forEach((f) => { f.visible = st.lit > 0; f.scale.setScalar(Math.max(0.01, st.lit)); }); bLight.intensity = st.lit * 9;
  };
  r.setState = ({ at = 0, solved = false, candle: hasCandle = true, open = false, lit = false } = {}) => {
    Object.assign(st, { at, pos: candleSpot(at), solved, candle: hasCandle, open, lit: lit ? 1 : 0 }); place();
  };
  /** 把蜡烛沿着地上的符号圈挪到第 i 个位置，影子一路跟着动。 */
  r.moveCandle = (i) => {
    const from = st.at, steps = Math.abs(i - from);
    return animate(Math.min(1400, 260 + steps * 110), (k) => { const f = from + (i - from) * k, th = (f + 0.5) / 12 * PI; st.pos = [-0.95 * Math.cos(th), 0, -0.2 + 0.9 * Math.sin(th)]; place(); }, Ease.inOutSine)
      .then(() => { st.at = i; st.pos = candleSpot(i); place(); });
  };
  r.solve = () => { st.solved = true; place(); return animate(900, (k) => { items.forEach(({ sh }) => { sh.material.opacity = 0.55 + 0.3 * Math.sin(k * PI); }); }, Ease.linear); };
  r.openDoor = () => animate(900, (k) => { door.rotation.y = -1.45 * k; }, Ease.outCubic).then(() => { st.open = true; });
  r.light = () => animate(1400, (k) => { st.lit = k; place(); }, Ease.outCubic).then(() => { st.lit = 1; place(); });
  r.update = (dt, t) => { if (st.candle) flame.scale.set(0.7, 1.7 + Math.sin(t * 13) * 0.2, 0.7); if (st.lit) flames.forEach((f, i) => { const w = 0.9 + Math.sin(t * (6 + i) + i) * 0.12; f.scale.set(w, 1 + Math.sin(t * 9 + i * 2) * 0.15, w); }); };
  r.setState();
  return r;
}

export const FACTORIES = { p9_tower_room: towerRoom, p9_chain: chainLift, p9_ladder: ladder, p9_cabinet: dialCabinet, p9_orrery: orrery, p9_attic: attic };
