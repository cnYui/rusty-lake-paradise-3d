// 第七灾（雹灾）专属道具工厂：id 一律 p7_ 前缀（设计见 docs/plague6_7_design.md）。
// 模型只呈现传入的状态（setState / setParts …），玩法真值在章节的 flags 和物品栏里。全部按真实尺寸建（米）。
import * as THREE from 'three';
import { toon, unlit, flat, canvasTexture } from './materials.js';
import { PI, group, add, box, ball, cyl, ring, clear } from './p5_kit.js';
import { plaguePainting } from './props_p6.js';
import { SKATE_W, SKATE_H } from '../chapters/plague7/rules.js';

const FINE = { outline: 0.0022 };
const ICE = (opts = {}) => toon('#cfe6ee', { transparent: true, opacity: 0.72, outline: false, ...opts });
const SNOW = '#f3f5f6', GOLD = '#c9a043', WOOD = '#8a6040', WOOD_DARK = '#5b3d28';
const HIT = new THREE.MeshBasicMaterial({ visible: false }); HIT.userData.outlineParameters = { visible: false };
function hitBox(parent, name, size, pos = [0, 0, 0]) { const m = new THREE.Mesh(new THREE.BoxGeometry(...size), HIT); m.name = name; m.userData.proxy = true; m.position.fromArray(pos); parent.add(m); return m; }
const tex = (w, h, draw) => canvasTexture(w, h, draw, { wrap: false });
const cone = (g, name, r, h, color, p, opts = FINE) => add(g, new THREE.Mesh(new THREE.ConeGeometry(r, h, 12), toon(color, opts)), name, p);

// ---------- 小物件 ----------
function scarf() {
  const r = group('p7_scarf');
  const t = add(r, new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 8, 20), toon('#d9b23a', FINE)), 'scarf_loop', [0, 0.03, 0]); t.rotation.x = PI / 2;
  for (const [x, a] of [[0.05, 0.15], [0.09, -0.1]]) { const e = box(r, 'scarf_end', [0.06, 0.24, 0.02], '#cfa630', [x, -0.08, 0.08]); e.rotation.z = a; }
  return r;
}
function branches() {
  const r = group('p7_branches');
  for (const [z, a] of [[0, 0.2], [0.05, -0.3]]) {
    const b = cyl(r, 'branch', 0.012, 0.55, '#6b4b33', [0, 0, z], 6, FINE); b.rotation.z = PI / 2 + a;
    const twig = cyl(r, 'twig', 0.007, 0.16, '#6b4b33', [0.12, 0.05, z], 5, FINE); twig.rotation.z = PI / 2 - 0.9;
  }
  return r;
}
function hammer() {
  const r = group('p7_hammer');
  cyl(r, 'hammer_handle', 0.014, 0.32, '#9a7046', [0, 0.16, 0], 8, FINE);
  box(r, 'hammer_head', [0.12, 0.045, 0.045], '#6d6f73', [0, 0.33, 0], toon('#6d6f73', FINE));
  return r;
}
function stones() {
  const r = group('p7_stones');
  for (let i = 0; i < 7; i++) { const a = i * 2.3, d = 0.015 + (i % 3) * 0.012; ball(r, 'pebble', 0.011, i % 2 ? '#3a3633' : '#504a45', [Math.cos(a) * d, 0.009, Math.sin(a) * d], [1, 0.7, 1], FINE); }
  return r;
}
function pistachio() {
  const r = group('p7_pistachio');
  for (let i = 0; i < 4; i++) ball(r, 'nut', 0.011, '#d8c08e', [(i - 1.5) * 0.02, 0.01, (i % 2) * 0.015], [1, 0.75, 1.4], FINE);
  ball(r, 'nut_green', 0.006, '#8fae48', [0.02, 0.017, 0.0], [1, 1, 1.2], FINE);
  return r;
}
function fur() {
  const r = group('p7_fur');
  ball(r, 'fur', 0.05, '#c7952f', [0, 0.03, 0], [1.3, 0.6, 1], FINE);
  for (let i = 0; i < 5; i++) cone(r, 'fur_tuft', 0.012, 0.05, '#b58424', [(i - 2) * 0.022, 0.06, 0]);
  return r;
}
function horn() {
  const r = group('p7_horn');
  const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.06, 0.08, 0), new THREE.Vector3(0.05, 0.2, 0)];
  add(r, new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.022, 8), toon('#ddd3bd', FINE)), 'horn_tube');
  cone(r, 'horn_tip', 0.022, 0.05, '#c9bea4', [0.05, 0.22, 0]);
  return r;
}
function strawberry() {
  const r = group('p7_strawberry');
  for (const [x, z] of [[0, 0], [0.035, 0.015], [-0.03, 0.02]]) {
    const b = cone(r, 'berry', 0.018, 0.035, '#c33a3a', [x, 0.02, z]); b.rotation.x = PI;
    ball(r, 'berry_leaf', 0.012, '#5f8a3a', [x, 0.04, z], [1, 0.3, 1], FINE);
  }
  return r;
}
function iceCream(flavour) {
  const r = group(`p7_ice_cream_${flavour}`);
  const c = cone(r, 'cone', 0.032, 0.13, '#d5a865', [0, 0.065, 0]); c.rotation.x = PI;
  ball(r, 'scoop', 0.038, flavour === 'pistachio' ? '#9cc070' : '#efa8b4', [0, 0.14, 0], [1, 0.9, 1], FINE);
  return r;
}
function hat() {
  const r = group('p7_hat');
  cyl(r, 'hat_brim', 0.16, 0.012, '#6b4a2e', [0, 0.006, 0], 24, FINE);
  cyl(r, 'hat_crown', 0.095, 0.11, '#6b4a2e', [0, 0.06, 0], 20, FINE);
  ring(r, 'hat_band', 0.096, 0.008, '#3b2a1c', [0, 0.03, 0], FINE).rotation.x = PI / 2;
  return r;
}
function carrot() {
  const r = group('p7_carrot');
  const c = cone(r, 'carrot', 0.018, 0.14, '#e07a2b', [0, 0, 0]); c.rotation.z = -PI / 2;
  for (const a of [-0.3, 0, 0.3]) { const l = cyl(r, 'carrot_leaf', 0.004, 0.05, '#5f8a3a', [-0.085, 0.01, 0], 5, FINE); l.rotation.z = PI / 2 + a; }
  return r;
}
function stake() {
  const r = group('p7_stake');
  cyl(r, 'stake_body', 0.025, 0.36, '#8a6643', [0, 0.18, 0], 6, FINE);
  cone(r, 'stake_tip', 0.025, 0.08, '#a58059', [0, 0.4, 0]);
  return r;
}
function diamond() {
  const r = group('p7_diamond');
  add(r, new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), toon('#bfe8d8', { ...FINE, emissive: '#2a4a40' })), 'diamond', [0, 0.03, 0]).scale.set(1, 1.3, 1);
  return r;
}
function crystalBall({ glow = false } = {}) {
  const r = group('p7_crystal_ball');
  cyl(r, 'globe_base', 0.06, 0.04, GOLD, [0, 0.02, 0], 18, FINE);
  add(r, new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), toon('#e4f2f6', { transparent: true, opacity: 0.45, outline: false })), 'globe_glass', [0, 0.1, 0]);
  box(r, 'globe_house', [0.04, 0.035, 0.035], '#f0f0ea', [0, 0.065, 0]);
  cone(r, 'globe_roof', 0.03, 0.025, '#a0a8ae', [0, 0.095, 0]);
  if (glow) { const l = new THREE.PointLight('#dff6ff', 0.6, 1.2); l.position.y = 0.1; r.add(l); }
  return r;
}

// ---------- 树林：挂围巾的树枝、陶罐、松鼠和冰锥树枝 ----------
function scarfBranch() {
  const r = group('p7_scarf_branch');
  const b = cyl(r, 'sbranch', 0.05, 1.4, '#5d4a3a', [0, 2.3, 0], 8); b.rotation.z = PI / 2 - 0.15;
  const sc = scarf(); sc.position.set(0.25, 2.2, 0); sc.scale.setScalar(1.4); sc.name = 'branch_scarf'; r.add(sc);
  r.userData.scarf = sc;
  r.setScarf = (on) => { sc.visible = !!on; };
  return r;
}
function vase() {
  const r = group('p7_vase');
  const whole = group('vase_whole'); r.add(whole);
  const pts = [[0, 0], [0.09, 0.01], [0.13, 0.12], [0.11, 0.26], [0.05, 0.32], [0.06, 0.38], [0.075, 0.4]].map(([x, y]) => new THREE.Vector2(x, y));
  add(whole, new THREE.Mesh(new THREE.LatheGeometry(pts, 20), toon('#c8a37a', { side: THREE.DoubleSide })), 'vase_body');
  const shards = group('vase_shards'); r.add(shards);
  for (let i = 0; i < 5; i++) { const s = box(shards, 'shard', [0.08, 0.02, 0.06], '#c29a6f', [Math.cos(i * 1.3) * 0.12, 0.01, Math.sin(i * 1.3) * 0.12]); s.rotation.set(0.3 * i, i, 0.2); }
  const pebbles = stones(); pebbles.name = 'vase_pebbles'; r.add(pebbles); r.userData.pebbles = pebbles;
  r.setState = ({ broken = false, stones: st = true } = {}) => { whole.visible = !broken; shards.visible = !!broken; pebbles.visible = !!broken && !!st; };
  r.setState();
  return r;
}
function squirrelTree() {
  const r = group('p7_squirrel');
  const trunk = cyl(r, 'sq_trunk', 0.22, 3.2, '#6f6458', [0, 1.6, -0.5], 10); trunk.name = 'sq_trunk';
  const br = cyl(r, 'sq_branch', 0.06, 1.6, '#6f6458', [0.55, 2.3, -0.2], 8); br.rotation.z = PI / 2 - 0.25;
  const icicles = group('sq_icicles'); r.add(icicles);
  for (let i = 0; i < 6; i++) { const c = cone(icicles, 'icicle', 0.03, 0.35 + (i % 3) * 0.08, '#d6ecf3', [0.2 + i * 0.18, 2.05 - (i % 3) * 0.04, -0.2], { outline: false }); c.rotation.x = PI; }
  const sq = group('squirrel'); sq.position.set(0.7, 0, 0.1); r.add(sq);
  ball(sq, 'sq_body', 0.08, '#c7952f', [0, 0.11, 0], [0.8, 1.2, 0.75], FINE);
  ball(sq, 'sq_head', 0.05, '#c7952f', [0, 0.25, 0.02], [1, 1, 1], FINE);
  for (const s of [-1, 1]) cone(sq, 'sq_ear', 0.015, 0.04, '#b58424', [s * 0.025, 0.3, 0.0]);
  for (const s of [-1, 1]) ball(sq, 'sq_eye', 0.008, '#1b1512', [s * 0.02, 0.26, 0.065], [1, 1, 0.5], FINE);
  const tail = ball(sq, 'sq_tail', 0.07, '#b58424', [0, 0.18, -0.1], [0.7, 1.4, 0.6], FINE); tail.rotation.x = -0.4;
  hitBox(sq, 'sq_hit', [0.3, 0.42, 0.3], [0, 0.18, 0]);
  const fallen = group('sq_fallen'); r.add(fallen);
  for (const [x, a] of [[0.62, 0.3], [0.78, -0.4]]) { const c = cone(fallen, 'fallen_icicle', 0.03, 0.4, '#d6ecf3', [x, 0.18, 0.1], { outline: false }); c.rotation.set(PI + a, 0, 0.2); }
  r.userData = { ...r.userData, squirrel: sq, icicles, trunk };
  r.setState = ({ dead = false, looted = false } = {}) => {
    icicles.visible = !dead; fallen.visible = !!dead;
    sq.rotation.z = dead ? PI / 2 : 0; sq.position.y = dead ? 0.08 : 0;
    sq.getObjectByName('sq_tail').material.color.set(looted ? '#8f6a24' : '#b58424');
  };
  r.setState();
  return r;
}

// ---------- 冰池（俯视台面）：5 × 3 个格子，立冰 / 平冰 / 压实冰 ----------
export const POOL = { COLS: 5, ROWS: 3, CELL: 0.5 };
function icePool() {
  const r = group('p7_icepool');
  const { COLS, ROWS, CELL } = POOL;
  box(r, 'pool_bed', [COLS * CELL + 0.5, 0.06, ROWS * CELL + 0.5], '#e8eef0', [0, -0.03, 0], flat('#e6ecee'));
  for (let i = 0; i < 22; i++) { const a = i * 2 * PI / 22; ball(r, 'pool_rim', 0.1, '#bfc4c6', [Math.cos(a) * (COLS * CELL / 2 + 0.2), 0.02, Math.sin(a) * (ROWS * CELL / 2 + 0.2)], [1.2, 0.45, 1]); }
  const reset = ball(r, 'pool_reset', 0.11, '#9a9a96', [-(COLS * CELL / 2) - 0.05, 0.05, -(ROWS * CELL / 2) - 0.05], [1.3, 0.6, 1]);
  const cells = [];
  for (let y = 0; y < ROWS; y++) {
    const row = [];
    for (let x = 0; x < COLS; x++) {
      const g = group(`ice_cell_${x}_${y}`); g.position.set((x - (COLS - 1) / 2) * CELL, 0, (y - (ROWS - 1) / 2) * CELL); r.add(g);
      const block = group('ice_block'); g.add(block);
      hitBox(g, 'ice_hit', [CELL * 0.95, 0.4, CELL * 0.95], [0, 0.2, 0]);
      row.push(g);
    }
    cells.push(row);
  }
  const gem = diamond(); gem.scale.setScalar(2.5); gem.position.set(0, 0.02, 0); gem.name = 'pool_diamond'; r.add(gem);
  hitBox(gem, 'gem_hit', [0.06, 0.08, 0.06], [0, 0.03, 0]);
  r.userData = { ...r.userData, cells, reset, gem };
  r.setState = (grid = [], selected = null, done = false, taken = false) => {
    // 每关的格子大小不同：按这一关的宽高居中摆，超出这一关的格子藏起来
    const w = Math.max(1, ...grid.map((row) => row.length)), h = Math.max(1, grid.length);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const cellGroup = cells[y][x];
      cellGroup.visible = x < w && y < h;
      cellGroup.position.set((x - (w - 1) / 2) * CELL, 0, (y - (h - 1) / 2) * CELL);
      const block = cellGroup.getObjectByName('ice_block'); clear(block);
      const c = (grid[y] && grid[y][x]) || '.';
      const sel = Array.isArray(selected) && selected[0] === x && selected[1] === y;
      if (c === 'S') { const b = box(block, 'ice_standing', [0.34, 0.34, 0.34], '#d9eef5', [0, sel ? 0.27 : 0.17, 0], ICE({ opacity: 0.85, color: sel ? '#fff2b8' : '#d9eef5' })); b.rotation.y = 0.05; }
      if (c === 'L') box(block, 'ice_lying', [0.4, 0.09, 0.4], '#8fa9b4', [0, 0.045, 0], toon('#8fa9b4', { outline: 0.003 }));
      if (c === 'F') { box(block, 'ice_pressed', [0.42, 0.11, 0.42], '#b9d3dc', [0, 0.055, 0], toon('#b9d3dc', { outline: 0.003 })); box(block, 'ice_pressed_top', [0.3, 0.012, 0.3], '#f4fbfd', [0, 0.115, 0], toon('#f4fbfd', { outline: false })); }
    }
    gem.visible = !!done && !taken;
  };
  r.setState();
  return r;
}

// ---------- 滑冰（俯视台面）：7 × 5 冰面、树桩、目标裂纹；Caroline 由章节放上去 ----------
export const RINK = { CELL: 1.2 };
export const rinkPos = ([x, y]) => [(x - (SKATE_W - 1) / 2) * RINK.CELL, 0, (y - (SKATE_H - 1) / 2) * RINK.CELL];
function rink() {
  const r = group('p7_rink');
  const W = SKATE_W * RINK.CELL, H = SKATE_H * RINK.CELL;
  const surface = tex(700, 500, (g, w, h) => {
    g.fillStyle = '#e7f0f3'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,150,165,0.35)'; g.lineWidth = 2;
    for (let i = 1; i < SKATE_W; i++) { g.beginPath(); g.moveTo(i * w / SKATE_W, 0); g.lineTo(i * w / SKATE_W, h); g.stroke(); }
    for (let j = 1; j < SKATE_H; j++) { g.beginPath(); g.moveTo(0, j * h / SKATE_H); g.lineTo(w, j * h / SKATE_H); g.stroke(); }
    g.strokeStyle = 'rgba(150,175,190,0.4)'; g.lineWidth = 3;
    for (let k = 0; k < 6; k++) { g.beginPath(); for (let x = 0; x <= w; x += 20) g.lineTo(x, 60 + k * 75 + Math.sin(x * 0.02 + k) * 12); g.stroke(); }
  });
  add(r, new THREE.Mesh(new THREE.PlaneGeometry(W + 1.2, H + 1.2), flat('#ffffff', { map: surface })), 'rink_ice').rotation.x = -PI / 2;
  box(r, 'rink_snow', [W + 6, 0.05, H + 6], SNOW, [0, -0.04, 0], flat('#eef2f3'));
  const stumps = group('rink_stumps'); r.add(stumps);
  const crack = group('rink_crack'); r.add(crack);
  for (let i = 0; i < 7; i++) { const a = i * 0.9; const c = box(crack, 'crack_line', [0.5 + (i % 3) * 0.15, 0.004, 0.025], '#5b7380', [Math.cos(a) * 0.15, 0.01, Math.sin(a) * 0.15], unlit('#5b7380')); c.rotation.y = a; }
  const frozen = carrot(); frozen.scale.setScalar(2.2); frozen.name = 'rink_carrot'; frozen.position.y = 0.04; r.add(frozen);
  hitBox(frozen, 'carrot_hit', [0.2, 0.08, 0.12], [0, 0, 0]);
  const cells = [];
  for (let y = 0; y < SKATE_H; y++) for (let x = 0; x < SKATE_W; x++) {
    const h = hitBox(r, `rink_cell_${x}_${y}`, [RINK.CELL * 0.96, 0.06, RINK.CELL * 0.96], rinkPos([x, y]));
    h.userData.cell = [x, y]; cells.push(h);
  }
  r.userData = { ...r.userData, cells, carrot: frozen, crack };
  r.setLevel = (level, { done = false, carrot: c = false, cracked = false } = {}) => {
    clear(stumps);
    for (const p of level.stumps) { const [x, , z] = rinkPos(p); cyl(stumps, 'rink_stump', 0.3, 0.45, '#7a5a3e', [x, 0.225, z], 14); cyl(stumps, 'rink_stump_top', 0.28, 0.02, '#c9a77c', [x, 0.46, z], 14); }
    const [tx, , tz] = rinkPos(level.target);
    crack.position.set(tx, 0, tz); crack.scale.setScalar(cracked ? 2.2 : 1);
    frozen.position.set(tx, 0.04, tz); frozen.visible = !!c;
    crack.visible = !done || !!cracked;
  };
  return r;
}

// ---------- 雪人：身体 + 头；围巾、帽子、树枝手、小石子、胡萝卜五个部件；活过来时换成老妇人的脸 ----------
function snowman() {
  const r = group('p7_snowman');
  ball(r, 'sm_base', 0.5, SNOW, [0, 0.42, 0], [1, 0.85, 1]);
  ball(r, 'sm_body', 0.36, SNOW, [0, 1.05, 0], [1, 0.95, 1]);
  const head = ball(r, 'sm_head', 0.24, SNOW, [0, 1.55, 0]);
  const face = group('sm_face'); face.position.set(0, 1.55, 0); r.add(face);
  ball(face, 'old_face', 0.19, '#e2d2c0', [0, 0, 0.08], [1, 1.1, 0.8]);
  ball(face, 'old_bonnet', 0.22, '#f6f4ef', [0, 0.06, 0.02], [1.05, 1, 0.9]).scale.z = 0.7;
  for (const s of [-1, 1]) ball(face, 'old_eye', 0.014, '#2a2420', [s * 0.06, 0.03, 0.22], [1, 0.6, 0.5], FINE);
  box(face, 'old_mouth', [0.06, 0.008, 0.01], '#7a4a40', [0, -0.07, 0.22]);
  const parts = {};
  parts.scarf = group('sm_scarf'); r.add(parts.scarf);
  add(parts.scarf, new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 24), toon('#d9b23a')), 'sm_scarf_loop', [0, 1.33, 0]).rotation.x = PI / 2;
  box(parts.scarf, 'sm_scarf_end', [0.1, 0.32, 0.04], '#cfa630', [0.14, 1.15, 0.27]).rotation.z = 0.2;
  parts.hat = hat(); parts.hat.scale.setScalar(1.6); parts.hat.position.set(0, 1.74, 0); parts.hat.rotation.z = 0.08; r.add(parts.hat);
  parts.branches = group('sm_arms'); r.add(parts.branches);
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = group('sm_arm'); arm.position.set(s * 0.32, 1.12, 0); parts.branches.add(arm);
    const b = cyl(arm, 'sm_branch', 0.018, 0.7, '#6b4b33', [s * 0.33, 0.12, 0], 6); b.rotation.z = -s * (PI / 2 - 0.35);
    const tw = cyl(arm, 'sm_twig', 0.01, 0.2, '#6b4b33', [s * 0.5, 0.32, 0], 5); tw.rotation.z = -s * 0.5;
    arms.push({ arm, s });
  }
  parts.stones = group('sm_stones'); r.add(parts.stones);
  for (const s of [-1, 1]) ball(parts.stones, 'sm_eye', 0.025, '#2b2724', [s * 0.08, 1.6, 0.21], [1, 1, 0.6]);
  for (let i = 0; i < 5; i++) ball(parts.stones, 'sm_button', 0.03, '#3a3633', [0, 1.28 - i * 0.14 - (i > 2 ? 0.08 : 0), 0.35 + (i > 2 ? 0.1 : 0) - i * 0.005], [1, 1, 0.6]);
  parts.carrot = carrot(); parts.carrot.scale.setScalar(1.3); parts.carrot.rotation.y = -PI / 2; parts.carrot.position.set(0, 1.55, 0.3); r.add(parts.carrot);
  hitBox(r, 'sm_hit', [1.0, 1.9, 1.0], [0, 0.95, 0]);
  r.userData = { ...r.userData, parts, head, face };
  r.setState = (list = [], alive = false) => {
    for (const [k, g] of Object.entries(parts)) g.visible = list.includes(k);
    head.visible = !alive; face.visible = !!alive;
    if (alive) { parts.stones.children.filter((o) => o.name === 'sm_eye').forEach((o) => { o.visible = false; }); parts.carrot.visible = false; }
    else parts.stones.children.forEach((o) => { o.visible = true; });
    for (const { arm, s } of arms) arm.rotation.z = alive ? s * 0.9 : 0;
  };
  r.setState();
  return r;
}

// ---------- 木屋：桌子（木桶 / 甜筒架 / 雪球）、冰锥架、雪景球机器、玻璃罩草莓、提示画 ----------
function kitchenTable() {
  const r = group('p7_table');
  box(r, 'table_top', [1.3, 0.05, 0.6], WOOD, [0, 0.8, 0]);
  for (const x of [-0.6, 0.6]) for (const z of [-0.25, 0.25]) box(r, 'table_leg', [0.05, 0.78, 0.05], WOOD_DARK, [x, 0.39, z]);
  // 桌子上方的木架，冰锥挂在架子底下
  box(r, 'shelf', [1.3, 0.05, 0.25], WOOD_DARK, [0, 2.25, -0.18]);
  for (const x of [-0.62, 0.62]) box(r, 'shelf_post', [0.05, 1.45, 0.05], WOOD_DARK, [x, 1.55, -0.28]);
  const icicles = group('table_icicles'); icicles.position.set(-0.3, 2.22, -0.08); r.add(icicles);
  for (let i = 0; i < 3; i++) { const c = cone(icicles, 'table_icicle', 0.035, 0.42 - i * 0.06, '#d6ecf3', [i * 0.07, -0.2 + i * 0.03, 0], { outline: 0.002 }); c.rotation.x = PI; }
  hitBox(icicles, 'icicle_hit', [0.3, 0.5, 0.2], [0.07, -0.2, 0]);
  const bucket = group('table_bucket'); bucket.position.set(-0.23, 0.825, 0); r.add(bucket);
  const pail = add(bucket, new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.2, 18, 1, true), toon('#a77b4f', { side: THREE.DoubleSide })), 'bucket_body', [0, 0.1, 0]);
  cyl(bucket, 'bucket_bottom', 0.1, 0.01, '#8a6040', [0, 0.005, 0], 18);
  const ice = cyl(bucket, 'bucket_ice', 0.12, 0.03, '#e9f5f8', [0, 0.17, 0], 18);
  hitBox(bucket, 'bucket_hit', [0.28, 0.24, 0.28], [0, 0.12, 0]);
  const snowball = ball(r, 'table_snowball', 0.07, SNOW, [0.05, 0.895, 0.05]);
  const stand = group('cone_stand'); stand.position.set(0.4, 0.825, 0.0); r.add(stand);
  cyl(stand, 'stand_base', 0.06, 0.02, '#c9c3b6', [0, 0.01, 0], 14);
  cyl(stand, 'stand_rod', 0.008, 0.12, '#c9c3b6', [0, 0.07, 0], 6);
  ring(stand, 'stand_ring', 0.035, 0.006, '#c9c3b6', [0, 0.13, 0], FINE).rotation.x = PI / 2;
  const coneSpare = cone(stand, 'stand_cone', 0.032, 0.13, '#d5a865', [0, 0.14, 0]); coneSpare.rotation.x = PI;
  r.userData = { ...r.userData, bucket, icicles, snowball };
  r.setState = ({ icicles: used = 0, ice: hasIce = false, snowball: sb = false } = {}) => {
    icicles.children.filter((o) => o.name === 'table_icicle').forEach((c, i) => { c.visible = i >= used; });
    ice.visible = !!hasIce; pail.rotation.x = 0; snowball.visible = !!sb;
  };
  r.setState();
  return r;
}
function machine() {
  const r = group('p7_machine');
  box(r, 'mach_base', [0.5, 0.15, 0.5], GOLD, [0, 0.075, 0], toon('#b8902f'));
  box(r, 'mach_body', [0.42, 0.9, 0.42], GOLD, [0, 0.6, 0]);
  box(r, 'mach_top', [0.48, 0.08, 0.48], '#b8902f', [0, 1.09, 0]);
  const slots = [];
  for (const [i, x, y] of [[0, -0.1, 0.72], [1, 0.1, 0.72], [2, 0, 0.53]]) {
    const s = group(`mach_slot_${i}`); s.position.set(x, y, 0.215); r.add(s);
    ring(s, 'slot_ring', 0.06, 0.012, '#8f6f2a', [0, 0, 0.005], FINE);
    cyl(s, 'slot_hole', 0.055, 0.01, '#3b2f1a', [0, 0, 0], 16).rotation.x = PI / 2;
    const gem = diamond(); gem.scale.setScalar(1.6); gem.position.set(0, -0.05, 0.015); gem.name = 'slot_gem'; s.add(gem);
    slots.push(s);
  }
  hitBox(r, 'mach_hit', [0.44, 0.5, 0.1], [0, 0.65, 0.22]);
  const globe = crystalBall({ glow: true }); globe.scale.setScalar(2); globe.position.set(0, 1.13, 0); globe.name = 'mach_ball'; r.add(globe);
  hitBox(globe, 'globe_hit', [0.16, 0.18, 0.16], [0, 0.08, 0]);
  const light = globe.children.find((o) => o.isLight);
  r.userData = { ...r.userData, slots, ball: globe };
  r.setState = ({ diamonds = 0, ball: b = true } = {}) => {
    slots.forEach((s, i) => { s.getObjectByName('slot_gem').visible = i < diamonds; });
    globe.visible = !!b; if (light) light.intensity = diamonds >= 3 ? 1.2 : 0;
  };
  r.setState();
  return r;
}
function dome() {
  const r = group('p7_dome');
  box(r, 'dome_table', [0.5, 0.75, 0.4], WOOD, [0, 0.375, 0]);
  cyl(r, 'dome_pot', 0.08, 0.1, '#a5704a', [0, 0.8, 0], 14);
  const plant = group('dome_plant'); plant.position.set(0, 0.85, 0); r.add(plant);
  for (let i = 0; i < 5; i++) { const l = ball(plant, 'dome_leaf', 0.04, '#5f8a3a', [Math.cos(i * 1.3) * 0.04, 0.04, Math.sin(i * 1.3) * 0.04], [1, 0.4, 0.7]); l.rotation.y = i; }
  const berries = strawberry(); berries.position.set(0, 0.04, 0.02); berries.name = 'dome_berries'; plant.add(berries);
  hitBox(berries, 'berry_hit', [0.14, 0.08, 0.12], [0, 0.02, 0]);
  add(r, new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 12, 0, 2 * PI, 0, PI / 2), toon('#e6f2f5', { transparent: true, opacity: 0.35, outline: false })), 'dome_glass', [0, 0.78, 0]).scale.y = 1.4;
  r.userData = { ...r.userData, berries };
  r.setBerries = (on) => { berries.visible = !!on; };
  return r;
}
function hintPicture() {
  const r = group('p7_hint_picture');
  box(r, 'pic_frame', [0.7, 0.55, 0.04], '#c69a2e', [0, 0, 0], toon('#c69a2e'));
  const t = tex(512, 400, (g, w, h) => {
    g.fillStyle = '#d9d6cc'; g.fillRect(0, 0, w, h); g.strokeStyle = '#4a4440'; g.lineWidth = 5; g.fillStyle = '#4a4440';
    // 雪景球 + 3 颗钻石
    g.beginPath(); g.arc(90, 80, 34, 0, 2 * PI); g.stroke(); g.strokeRect(60, 110, 60, 22);
    g.font = 'bold 34px serif'; g.fillText('3', 140, 95); g.beginPath(); g.arc(186, 84, 16, 0, 2 * PI); g.stroke();
    // 箭头 → 冰屋 → 方块
    g.beginPath(); g.moveTo(90, 145); g.lineTo(90, 210); g.stroke(); g.beginPath(); g.moveTo(80, 198); g.lineTo(90, 214); g.lineTo(100, 198); g.stroke();
    g.beginPath(); g.moveTo(40, 330); g.lineTo(40, 270); g.arc(90, 270, 50, PI, 0); g.lineTo(140, 330); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(160, 290); g.lineTo(220, 290); g.stroke(); g.beginPath(); g.moveTo(208, 280); g.lineTo(222, 290); g.lineTo(208, 300); g.stroke();
    g.strokeRect(240, 268, 44, 44); g.beginPath(); g.moveTo(240, 268); g.lineTo(256, 252); g.lineTo(300, 252); g.lineTo(284, 268); g.stroke();
    // 雪人
    g.beginPath(); g.arc(400, 120, 34, 0, 2 * PI); g.stroke(); g.beginPath(); g.arc(400, 210, 56, 0, 2 * PI); g.stroke();
    g.fillRect(372, 70, 56, 10); g.fillRect(384, 44, 32, 28); g.beginPath(); g.moveTo(400, 122); g.lineTo(436, 128); g.lineTo(400, 132); g.fill();
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(400, 175 + i * 22, 5, 0, 2 * PI); g.fill(); }
    g.beginPath(); g.moveTo(345, 190); g.lineTo(300, 160); g.moveTo(455, 190); g.lineTo(500, 160); g.stroke();
  });
  add(r, new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.47), unlit('#ffffff', { map: t })), 'pic_canvas', [0, 0, 0.022]);
  return r;
}

// ---------- 屋外：石堆牛头骨、柴堆；湖岸冰块；神殿鸟笼 ----------
function skullPile() {
  const r = group('p7_skull_pile');
  for (let i = 0; i < 7; i++) { const s = ball(r, 'pile_stone', 0.22 - (i % 3) * 0.03, i % 2 ? '#8d8a84' : '#a3a09a', [Math.cos(i * 1.7) * 0.25 * (i < 5 ? 1 : 0.4), 0.12 + (i > 4 ? 0.22 : 0), Math.sin(i * 1.7) * 0.2 * (i < 5 ? 1 : 0.4)], [1.2, 0.6, 1]); s.rotation.y = i; }
  ball(r, 'pile_skull', 0.12, '#e7e0cf', [0, 0.5, 0.05], [1, 0.8, 1.2]);
  ball(r, 'pile_snout', 0.07, '#e2dac7', [0, 0.47, 0.2], [0.9, 0.7, 1.5]);
  const hornL = horn(); hornL.position.set(-0.1, 0.55, 0.0); hornL.rotation.z = 0.9; r.add(hornL);
  const hornR = horn(); hornR.position.set(0.1, 0.55, 0.0); hornR.rotation.z = -0.9; hornR.scale.x = -1; hornR.name = 'pile_horn'; r.add(hornR);
  hitBox(hornR, 'horn_hit', [0.12, 0.25, 0.12], [0.04, 0.1, 0]);
  r.userData.horn = hornR;
  r.setHorn = (on) => { hornR.visible = !!on; };
  return r;
}
function woodpile() {
  const r = group('p7_woodpile');
  for (let i = 0; i < 6; i++) { const l = cyl(r, 'log', 0.09, 0.9, i % 2 ? '#8a6643' : '#7a5838', [0, 0.09 + Math.floor(i / 3) * 0.16, (i % 3 - 1) * 0.19 + (i > 2 ? 0.09 : 0)], 10); l.rotation.z = PI / 2; }
  box(r, 'pile_snow', [0.95, 0.04, 0.55], SNOW, [0, 0.36, 0.04]);
  const st = stake(); st.position.set(0.55, 0.0, 0.25); st.rotation.z = -0.5; st.name = 'pile_stake'; r.add(st);
  hitBox(st, 'stake_hit', [0.15, 0.5, 0.15], [0, 0.22, 0]);
  r.userData.stake = st;
  r.setStake = (on) => { st.visible = !!on; };
  return r;
}
function iceBlock() {
  const r = group('p7_iceblock');
  const shell = group('ice_shell'); r.add(shell);
  const geo = new THREE.CylinderGeometry(0.55, 0.75, 2.4, 7, 3);
  const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setX(i, pos.getX(i) * (1 + Math.sin(i * 2.1) * 0.08)); if (y > 1.1) pos.setY(i, y + Math.sin(i * 3.7) * 0.25); }
  geo.computeVertexNormals();
  add(shell, new THREE.Mesh(geo, ICE({ opacity: 0.45 })), 'ice_body', [0, 1.2, 0]);
  const cracks = group('ice_cracks'); r.add(cracks);
  for (let i = 0; i < 5; i++) { const c = box(cracks, 'ice_crack', [0.02, 0.5, 0.01], '#6d8a97', [-0.1 + i * 0.07, 1.0 + (i % 2) * 0.4, 0.72], unlit('#6d8a97')); c.rotation.z = (i % 2 ? 0.6 : -0.5); }
  const st = stake(); st.position.set(0.05, 0.9, 0.7); st.rotation.x = -PI / 2.4; st.name = 'ice_stake'; r.add(st);
  const chunks = group('ice_chunks'); r.add(chunks);
  for (let i = 0; i < 6; i++) { const c = box(chunks, 'ice_chunk', [0.3, 0.2, 0.25], '#cfe6ee', [Math.cos(i) * 0.9, 0.1, Math.sin(i) * 0.7 + 0.2], ICE({ opacity: 0.7 })); c.rotation.set(i * 0.4, i, 0.2); }
  hitBox(r, 'ice_hit', [1.3, 2.4, 1.3], [0, 1.2, 0]);
  r.setState = (s = 'frozen') => { shell.visible = s !== 'free'; cracks.visible = s === 'cracked'; st.visible = s === 'cracked'; chunks.visible = s === 'free'; };
  r.setState();
  return r;
}
function cage() {
  const r = group('p7_cage');
  cyl(r, 'cage_floor', 0.42, 0.04, GOLD, [0, 0.02, 0], 24);
  for (let i = 0; i < 16; i++) { const a = i * 2 * PI / 16; cyl(r, 'cage_bar', 0.008, 1.4, GOLD, [Math.cos(a) * 0.4, 0.72, Math.sin(a) * 0.4], 5); }
  ring(r, 'cage_ring', 0.4, 0.012, GOLD, [0, 1.42, 0]).rotation.x = PI / 2;
  add(r, new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 8, 0, 2 * PI, 0, PI / 2), toon(GOLD, { wireframe: false, transparent: true, opacity: 0.25, outline: false })), 'cage_dome', [0, 1.42, 0]);
  cyl(r, 'cage_chain', 0.01, 6, '#8f6f2a', [0, 4.6, 0], 5);
  return r;
}
const p7Painting = () => plaguePainting('p7_painting', {
  plague: (g, k) => {
    g.fillStyle = `rgba(120,128,140,${0.9 * k})`; for (const [x, y, rr] of [[180, 120, 40], [230, 105, 48], [285, 122, 38]]) { g.beginPath(); g.arc(x, y, rr, 0, 2 * PI); g.fill(); }
    g.fillStyle = `rgba(245,248,252,${k})`; for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(160 + (i * 37) % 160, 175 + (i * 53) % 190, 6, 0, 2 * PI); g.fill(); }
  },
  next: (g) => {
    g.fillStyle = '#5c6b3a'; for (const [x, y] of [[450, 335], [475, 360], [458, 392], [486, 405]]) { g.beginPath(); g.ellipse(x, y, 13, 5, 0.5, 0, 2 * PI); g.fill(); }
  },
});

export const FACTORIES = {
  p7_scarf: scarf, p7_branches: branches, p7_hammer: hammer, p7_stones: stones, p7_pistachio: pistachio, p7_fur: fur,
  p7_horn: horn, p7_strawberry: strawberry, p7_ice_cream_strawberry: () => iceCream('strawberry'), p7_ice_cream_pistachio: () => iceCream('pistachio'),
  p7_hat: hat, p7_carrot: carrot, p7_stake: stake, p7_diamond: diamond, p7_crystal_ball: () => crystalBall(),
  p7_scarf_branch: scarfBranch, p7_vase: vase, p7_squirrel: squirrelTree, p7_icepool: icePool, p7_rink: rink, p7_snowman: snowman,
  p7_table: kitchenTable, p7_machine: machine, p7_dome: dome, p7_hint_picture: hintPicture,
  p7_skull_pile: skullPile, p7_woodpile: woodpile, p7_iceblock: iceBlock, p7_cage: cage, p7_painting: p7Painting,
};

