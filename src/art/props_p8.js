// 第八灾（蝗灾）专属道具工厂：id 一律 p8_ 前缀（设计见 docs/plague8_design.md）。
// 模型只呈现传入的状态（setState …），玩法真值在章节的 flags 和物品栏里。尺寸按米建；
// 蝗虫、蚱蜢、螳螂是原作里的“巨大”版本（蝗虫 0.3 m、蚱蜢 1.5 m、螳螂站起来约 5 m，网格螳螂见 mantis_model.js）。
import * as THREE from 'three';
import { toon, unlit, flat, canvasTexture } from './materials.js';
import { animate, Ease } from '../core/tween.js';
import { PI, group, add, box, ball, cyl, ring, rod } from './p5_kit.js';
import { plaguePainting } from './props_p6.js';
import { BOX_COLUMNS, SCORE, LOCUST_LEVELS } from '../chapters/plague8/rules.js';
import { getModel } from './rlpm.js';
import { buildMantisModel } from './mantis_model.js';

const FINE = { outline: 0.0022 };
const BRASS = '#c9a043', BARK = '#4f4740', BARK_DARK = '#3a332d';
const HIT = new THREE.MeshBasicMaterial({ visible: false }); HIT.userData.outlineParameters = { visible: false };
// 不可见的点击盒（热点射线只认带 proxy 标记的不可见网格）
function hitBox(parent, name, size, pos = [0, 0, 0]) { const m = new THREE.Mesh(new THREE.BoxGeometry(...size), HIT); m.name = name; m.userData.proxy = true; m.position.fromArray(pos); parent.add(m); return m; }
const tex = (w, h, draw) => canvasTexture(w, h, draw, { wrap: false });
const cone = (g, name, r, h, color, p, opts = FINE) => add(g, new THREE.Mesh(new THREE.ConeGeometry(r, h, 12), toon(color, opts)), name, p);
const limb = (g, name, a, b, r, color, opts = FINE) => { const o = rod(g, new THREE.Vector3(...a), new THREE.Vector3(...b), r, color, toon(color, opts)); o.name = name; return o; };
const glow = (color, opts = {}) => unlit(color, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...opts });

// ---------- 物品 ----------
function axe() {
  const r = group('p8_axe');
  cyl(r, 'axe_handle', 0.016, 0.62, '#9a7046', [0, 0.31, 0], 8, FINE);
  const head = group('axe_head'); head.position.set(0, 0.56, 0); r.add(head);
  box(head, 'axe_blade', [0.15, 0.09, 0.02], '#7d8085', [0.07, 0, 0], toon('#7d8085', FINE));
  box(head, 'axe_edge', [0.014, 0.13, 0.022], '#c9ccd0', [0.15, 0, 0], toon('#c9ccd0', FINE));
  box(head, 'axe_poll', [0.05, 0.06, 0.04], '#5d6064', [-0.015, 0, 0], toon('#5d6064', FINE));
  return r;
}
function shovel() {
  const r = group('p8_shovel');
  cyl(r, 'shovel_handle', 0.016, 0.95, '#9a7046', [0, 0.72, 0], 8, FINE);
  box(r, 'shovel_grip', [0.13, 0.026, 0.026], '#9a7046', [0, 1.2, 0], toon('#9a7046', FINE));
  cyl(r, 'shovel_neck', 0.022, 0.08, '#6b6e72', [0, 0.27, 0], 8, FINE);
  add(r, new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.28, 16, 1, true, -0.65, 1.3), toon('#7b7f84', { ...FINE, side: THREE.DoubleSide })), 'shovel_blade', [0, 0.11, -0.11]);
  return r;
}
function moth() {
  const r = group('p8_moth');
  ball(r, 'moth_body', 0.012, '#f3e7c4', [0, 0.02, 0], [0.8, 0.8, 2.2], { outline: false, emissive: '#8a7a40' });
  for (const s of [-1, 1]) {
    const w = add(r, new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), unlit('#fff6d8', { side: THREE.DoubleSide })), 'moth_wing', [s * 0.027, 0.024, -0.004]);
    w.rotation.x = -PI / 2; w.scale.set(1, 0.7, 1);
  }
  return r;
}
/** 眼球：白色球 + 琥珀色虹膜 + 山羊那样横着的瞳孔，正面朝 +Z。 */
function eyeball(g, name, rad, pos) {
  const e = group(name); e.position.fromArray(pos); g.add(e);
  ball(e, 'eye_white', rad, '#f2ecdc', [0, 0, 0], [1, 1, 1], FINE);
  add(e, new THREE.Mesh(new THREE.CircleGeometry(rad * 0.62, 18), unlit('#c98a26')), 'eye_iris', [0, 0, rad * 0.97]);
  add(e, new THREE.Mesh(new THREE.PlaneGeometry(rad * 0.9, rad * 0.22), unlit('#141210')), 'eye_pupil', [0, 0, rad * 0.98]);
  return e;
}
function goatEyes() {
  const r = group('p8_goat_eyes');
  for (const s of [-1, 1]) eyeball(r, 'goat_eye', 0.03, [s * 0.034, 0.03, 0]).rotation.x = -PI / 2 + 0.5;
  return r;
}
function firefly() {
  const r = group('p8_firefly');
  ball(r, 'ff_body', 0.01, '#3a2f22', [0, 0.02, 0.008], [0.9, 0.8, 1.5], FINE);
  ball(r, 'ff_head', 0.006, '#c4543a', [0, 0.022, 0.025], [1, 1, 1], FINE);
  add(r, new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), unlit('#e9ff8a')), 'ff_glow', [0, 0.018, -0.014]).scale.set(1, 0.9, 1.3);
  for (const s of [-1, 1]) { const w = add(r, new THREE.Mesh(new THREE.CircleGeometry(0.014, 10), unlit('#d8d2bc', { side: THREE.DoubleSide, transparent: true, opacity: 0.7 })), 'ff_wing', [s * 0.012, 0.03, 0.002]); w.rotation.x = -PI / 2; w.scale.set(0.6, 1.4, 1); }
  return r;
}
function key() {
  const r = group('p8_key');
  ring(r, 'key_bow', 0.024, 0.006, BRASS, [0, 0.125, 0], FINE);
  cyl(r, 'key_shaft', 0.0055, 0.1, BRASS, [0, 0.055, 0], 8, FINE);
  box(r, 'key_bit', [0.026, 0.012, 0.006], BRASS, [0.012, 0.01, 0], toon(BRASS, FINE));
  box(r, 'key_bit2', [0.018, 0.01, 0.006], BRASS, [0.009, 0.028, 0], toon(BRASS, FINE));
  return r;
}
function fogHorn() {
  const r = group('p8_fog_horn');
  const pts = [[0, 0, 0], [0.06, 0.05, 0], [0.17, 0.085, 0], [0.29, 0.07, 0]].map((p) => new THREE.Vector3(...p));
  add(r, new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.018, 8), toon('#e1d6bc', FINE)), 'horn_tube');
  const bell = add(r, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.02, 0.1, 18, 1, true), toon('#d8c9a6', { ...FINE, side: THREE.DoubleSide })), 'horn_bell', [0.34, 0.06, 0]);
  bell.rotation.z = -PI / 2 + 0.12;
  ring(r, 'horn_band', 0.021, 0.005, BRASS, [0.12, 0.08, 0], FINE).rotation.y = PI / 2;
  cyl(r, 'horn_mouth', 0.011, 0.04, BRASS, [-0.018, -0.006, 0], 10, FINE).rotation.z = PI / 2;
  return r;
}

// ---------- 门外：钉在天堂门上的木板、曼陀林、乐谱架、乐手木盒 ----------
function boards() {
  const r = group('p8_boards');
  const planks = [], base = [];
  [[2.2, 0.62, 4.7, '#7a5c3e'], [2.2, -0.62, 4.7, '#8a6a4a'], [1.05, 0.04, 4.4, '#846446'], [3.4, -0.03, 4.4, '#7a5c3e']].forEach(([y, a, w, color], i) => {
    const p = box(r, 'board', [w, 0.24, 0.05], color, [0, y, 0.12 + i * 0.03]);
    p.rotation.z = a;
    for (const s of [-1, 1]) cyl(p, 'nail', 0.012, 0.03, '#3c3a38', [s * (w / 2 - 0.15), 0, 0.03], 6).rotation.x = PI / 2;
    planks.push(p); base.push({ y, a, z: p.position.z });
  });
  hitBox(r, 'boards_hit', [4.4, 3.4, 0.3], [0, 2.2, 0.2]);
  r.userData.planks = planks;
  r.setState = (on = true) => {
    r.visible = !!on;
    planks.forEach((p, i) => { p.position.set(0, base[i].y, base[i].z); p.rotation.set(0, 0, base[i].a); });
  };
  // 斧子劈开：木板一块块掉下来（落到地上后整个隐藏）
  r.chop = () => animate(1100, (k) => planks.forEach((p, i) => {
    const t = Math.min(1, Math.max(0, k * 1.6 - i * 0.18));
    p.position.y = base[i].y * (1 - t * t) + 0.12 * t * t;
    p.position.z = base[i].z + t * (0.4 + i * 0.15);
    p.rotation.z = base[i].a + t * (i % 2 ? 0.9 : -0.9);
    p.rotation.x = t * 1.3;
  }), Ease.linear).then(() => { r.visible = false; });
  r.setState();
  return r;
}
function mandolin() {
  const r = group('p8_mandolin');
  ball(r, 'mandolin_body', 0.13, '#8a4a22', [0, 0, 0], [1, 1.25, 0.45], FINE);
  ring(r, 'mandolin_rim', 0.123, 0.004, '#d29b55', [0, 0, 0.022], FINE).scale.y = 1.25;
  add(r, new THREE.Mesh(new THREE.CircleGeometry(0.032, 16), unlit('#2a1a10')), 'mandolin_hole', [0, 0.04, 0.06]);
  box(r, 'mandolin_neck', [0.045, 0.3, 0.025], '#5b3a22', [0, 0.28, 0.03], toon('#5b3a22', FINE));
  box(r, 'mandolin_head', [0.06, 0.08, 0.02], '#3e2716', [0, 0.46, 0.03], toon('#3e2716', FINE));
  box(r, 'mandolin_bridge', [0.08, 0.014, 0.012], '#c39b62', [0, 0.02, 0.064], toon('#c39b62', FINE));
  box(r, 'mandolin_tailpiece', [0.06, 0.045, 0.012], '#4b301d', [0, -0.09, 0.064], toon('#4b301d', FINE));
  for (let i = 0; i < 4; i++) box(r, 'mandolin_string', [0.002, 0.5, 0.002], '#e8e2cc', [(i - 1.5) * 0.008, 0.2, 0.067], unlit('#e8e2cc'));
  for (let i = 0; i < 4; i++) box(r, 'mandolin_fret', [0.055, 0.006, 0.006], '#b58b52', [0, 0.13 + i * 0.055, 0.056], toon('#b58b52', FINE));
  for (const s of [-1, 1]) cyl(r, 'mandolin_tuner', 0.009, 0.035, '#c9a043', [s * 0.045, 0.49, 0.03], 8, FINE).rotation.z = PI / 2;
  return r;
}
// 乐谱：五线谱，最下面的线是第 1 档、最上面的线是第 5 档；左边画一只蝗虫当谱号
function scoreTexture() {
  return tex(512, 352, (g, w) => {
    g.fillStyle = '#efe7d2'; g.fillRect(0, 0, w, 352);
    const top = 110, gap = 46;
    g.strokeStyle = '#5a4f44'; g.lineWidth = 3;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(30, top + i * gap); g.lineTo(w - 24, top + i * gap); g.stroke(); }
    g.fillStyle = '#5f7a3a'; g.beginPath(); g.ellipse(62, top + 2 * gap, 26, 9, -0.9, 0, 2 * PI); g.fill();
    g.strokeStyle = '#5f7a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(58, top + 2 * gap + 4); g.lineTo(84, top + 3 * gap); g.lineTo(70, top + 4 * gap + 6); g.stroke();
    SCORE.forEach((lv, i) => {
      const x = 130 + i * 62, y = top + (5 - lv) * gap;
      g.fillStyle = '#1e1a16'; g.beginPath(); g.ellipse(x, y, 17, 12, -0.35, 0, 2 * PI); g.fill();
      g.strokeStyle = '#1e1a16'; g.lineWidth = 4; g.beginPath(); g.moveTo(x + 15, y - 3); g.lineTo(x + 15, y - 76); g.stroke();
    });
  });
}
function scoreStand() {
  const r = group('p8_score');
  for (let i = 0; i < 3; i++) { const a = i * 2 * PI / 3 + 0.5; limb(r, 'stand_leg', [0, 0.36, 0], [Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28], 0.008, '#2f2c2a'); }
  cyl(r, 'stand_pole', 0.01, 0.8, '#2f2c2a', [0, 0.75, 0], 8, FINE);
  const desk = group('stand_desk'); desk.position.set(0, 1.18, 0); desk.rotation.x = -0.35; r.add(desk);
  box(desk, 'stand_plate', [0.5, 0.34, 0.01], '#3a3633', [0, 0, -0.008], toon('#3a3633', FINE));
  r.userData.sheet = add(desk, new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.316), unlit('#ffffff', { map: scoreTexture() })), 'stand_sheet', [0, 0, 0.0]);
  hitBox(r, 'score_hit', [0.6, 0.5, 0.3], [0, 1.15, 0]);
  return r;
}

// 木盒：面板在盒盖上（6 列 × 4 行刻痕，左边是每一行的小图标），靠近玩家的一侧是放滑块的滑轨
export const BOX = { W: 0.62, D: 0.42, H: 0.16, COL: 0.075, RAIL_Z: 0.14 };
export const boxColX = (c) => (c - (BOX_COLUMNS.length - 1) / 2) * BOX.COL + 0.045;
const ROW_Z = [-0.135, -0.075, -0.015, 0.045];
function panelTexture() {
  const px = (x) => (x + BOX.W / 2) * 1000, pz = (z) => (z + BOX.D / 2) * 1000;
  return tex(620, 420, (g) => {
    g.fillStyle = '#a77b4f'; g.fillRect(0, 0, 620, 420);
    g.strokeStyle = 'rgba(90,60,35,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) { g.beginPath(); for (let x = 0; x <= 620; x += 20) g.lineTo(x, 15 + i * 30 + Math.sin(x * 0.015 + i) * 4); g.stroke(); }
    g.strokeStyle = '#4a321e'; g.lineWidth = 4; g.strokeRect(14, 14, 592, 392);
    // 每一行的图标：帽子、胡子、白发、大肚子
    const ix = px(-0.255);
    ROW_Z.forEach((z, k) => {
      const y = pz(z);
      g.fillStyle = '#2b1d12'; g.strokeStyle = '#2b1d12'; g.lineWidth = 5;
      if (k === 0) { g.fillRect(ix - 14, y - 18, 28, 26); g.fillRect(ix - 24, y + 6, 48, 6); }
      if (k === 1) { g.beginPath(); g.arc(ix - 11, y, 11, 0, PI); g.stroke(); g.beginPath(); g.arc(ix + 11, y, 11, 0, PI); g.stroke(); }
      if (k === 2) {
        g.beginPath(); g.arc(ix, y + 4, 14, 0, 2 * PI); g.stroke();
        g.fillStyle = '#f2efe6'; for (let i = -2; i <= 2; i++) { g.beginPath(); g.arc(ix + i * 8, y - 10, 7, 0, 2 * PI); g.fill(); }
      }
      if (k === 3) { g.beginPath(); g.arc(ix, y + 2, 17, 0, 2 * PI); g.fill(); g.fillStyle = '#a77b4f'; g.beginPath(); g.arc(ix, y + 2, 4, 0, 2 * PI); g.fill(); }
    });
    // 刻痕：横杠 = 有，三个圆点 = 没有
    g.fillStyle = '#2b1d12';
    BOX_COLUMNS.forEach((col, c) => {
      const x = px(boxColX(c));
      g.fillStyle = 'rgba(60,40,24,0.25)'; g.fillRect(x - 1, 40, 2, 300);
      g.fillStyle = '#2b1d12';
      col.forEach((on, k) => {
        const y = pz(ROW_Z[k]);
        if (on) g.fillRect(x - 24, y - 4, 48, 9);
        else for (const d of [-16, 0, 16]) { g.beginPath(); g.arc(x + d, y, 5, 0, 2 * PI); g.fill(); }
      });
    });
    // 滑轨
    g.fillStyle = '#3a2614'; g.fillRect(px(boxColX(0)) - 36, pz(BOX.RAIL_Z) - 7, px(boxColX(5)) - px(boxColX(0)) + 72, 14);
  });
}
const NUMERALS = ['I', 'II', 'III'];
function sliderTop(n) {
  return tex(128, 96, (g, w, h) => {
    g.fillStyle = '#d8c39a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b1d12'; g.font = `bold ${n === 'III' ? 54 : 62}px Georgia, "Times New Roman", serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(n, w / 2, h / 2 + 3);
  });
}
function musicBox() {
  const r = group('p8_box');
  const { W, D, H } = BOX, T = 0.02;
  const wood = '#8a6040';
  box(r, 'box_floor', [W, T, D], wood, [0, T / 2, 0]);
  box(r, 'box_front', [W, H, T], wood, [0, H / 2, D / 2 - T / 2]);
  box(r, 'box_back', [W, H, T], wood, [0, H / 2, -D / 2 + T / 2]);
  for (const s of [-1, 1]) box(r, 'box_side', [T, H, D], wood, [s * (W / 2 - T / 2), H / 2, 0]);
  box(r, 'box_inside', [W - 2 * T, 0.004, D - 2 * T], '#3a2614', [0, T + 0.002, 0], toon('#3a2614', { outline: false }));
  // 盒里的斧子（盒盖打开后看得见）
  const axeHolder = group('box_axe'); axeHolder.position.set(0, T + 0.03, 0); axeHolder.rotation.y = 0.32; r.add(axeHolder);
  const a = axe(); a.rotation.set(PI / 2, 0, -PI / 2); a.position.x = -0.31; axeHolder.add(a);   // 平躺：斧柄沿 X，斧刃朝 -Z
  hitBox(axeHolder, 'axe_hit', [0.6, 0.08, 0.16], [0, 0.02, 0]);
  // 盒盖：铰链在后沿，面板 / 滑块 / 列的点击盒都挂在盒盖上
  const lid = group('box_lid'); lid.position.set(0, H, -D / 2); r.add(lid);
  const top = group('box_top'); top.position.z = D / 2; lid.add(top);
  box(top, 'lid_board', [W + 0.01, 0.022, D + 0.01], wood, [0, 0.011, 0]);
  add(top, new THREE.Mesh(new THREE.PlaneGeometry(W, D), unlit('#ffffff', { map: panelTexture() })), 'lid_panel', [0, 0.0225, 0]).rotation.x = -PI / 2;
  const columns = BOX_COLUMNS.map((_, c) => { const h = hitBox(top, `box_col_${c}`, [BOX.COL * 0.92, 0.03, 0.25], [boxColX(c), 0.035, -0.045]); h.userData.col = c; return h; });
  const sliders = NUMERALS.map((n, i) => {
    const s = group(`box_slider_${i}`); top.add(s);
    box(s, 'slider_block', [0.058, 0.026, 0.05], '#c9a873', [0, 0.013, 0], toon('#c9a873', FINE));
    add(s, new THREE.Mesh(new THREE.PlaneGeometry(0.052, 0.04), unlit('#ffffff', { map: sliderTop(n) })), 'slider_label', [0, 0.0265, 0]).rotation.x = -PI / 2;
    hitBox(s, 'slider_hit', [0.066, 0.05, 0.06], [0, 0.02, 0]);
    s.userData.slider = i;
    return s;
  });
  r.userData = { ...r.userData, columns, sliders, axe: axeHolder, lid };
  r.setState = ({ slots = [0, 1, 2], held = null, open = false, axe: hasAxe = true } = {}) => {
    sliders.forEach((s, i) => {
      s.position.set(boxColX(slots[i] ?? i), 0.022 + (held === i ? 0.03 : 0), BOX.RAIL_Z);
      s.getObjectByName('slider_block').material.color.set(held === i ? '#f3dc8e' : '#c9a873');
    });
    lid.rotation.x = open ? -1.95 : 0;
    axeHolder.visible = !!open && !!hasAxe;
  };
  r.open = () => animate(900, (k) => { lid.rotation.x = -1.95 * k; }, Ease.outCubic);
  r.setState();
  return r;
}

// ---------- 雾林：树干、蝗虫、蚱蜢、卵鞘、巨型螳螂、猫头鹰 ----------
function trunk(g, name, { r = 0.34, h = 7, color = BARK } = {}) {
  const t = group(name); g.add(t);
  const geo = new THREE.CylinderGeometry(r * 0.82, r, h, 12, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const k = 1 + Math.sin(i * 1.7) * 0.06; pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); }
  geo.computeVertexNormals();
  add(t, new THREE.Mesh(geo, toon(color)), 'trunk_bark', [0, h / 2, 0]);
  for (let i = 0; i < 4; i++) { const a = i * PI / 2 + 0.4; const root = cone(t, 'trunk_root', r * 0.35, r * 1.6, BARK_DARK, [Math.cos(a) * r * 0.95, r * 0.35, Math.sin(a) * r * 0.95], {}); root.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1); }
  return t;
}
/** 蝗虫 / 蚱蜢：身体沿 +Z（头朝前），腹面朝 -Y，脚踩在 y = 0 的面上（树干表面或地面）。 */
function insect(name, L, color, dark) {
  const r = group(name);
  const body = group('insect_body'); r.add(body);
  const y0 = L * 0.12;
  ball(body, 'abdomen', L * 0.09, color, [0, y0, -L * 0.2], [1, 0.95, 3.0], FINE);
  ball(body, 'thorax', L * 0.1, color, [0, y0 + L * 0.02, L * 0.1], [1, 1.1, 1.35], FINE);
  ball(body, 'head', L * 0.085, color, [0, y0 + L * 0.04, L * 0.3], [0.95, 1.15, 1.05], FINE);
  for (let i = 0; i < 4; i++) {
    const z = -L * 0.36 + i * L * 0.1, t = (z + L * 0.2) / (L * 0.27);
    ring(body, 'abdomen_ring', L * 0.09 * Math.sqrt(1 - t * t), L * 0.002, dark, [0, y0, z], { outline: false }).scale.y = 0.95;
  }
  for (const s of [-1, 1]) {
    ball(body, 'eye', L * 0.03, '#2b2418', [s * L * 0.065, y0 + L * 0.08, L * 0.33], [1, 1.2, 1], FINE);
    limb(body, 'antenna', [s * L * 0.03, y0 + L * 0.1, L * 0.36], [s * L * 0.12, y0 + L * 0.32, L * 0.62], L * 0.006, dark);
    ball(body, 'wing', L * 0.06, dark, [s * L * 0.035, y0 + L * 0.08, -L * 0.12], [0.6, 0.22, 4.2], FINE);
    limb(body, 'wing_vein', [s * L * 0.035, y0 + L * 0.092, -L * 0.3], [s * L * 0.035, y0 + L * 0.092, L * 0.06], L * 0.002, '#9b9a64', { outline: false });
  }
  const hind = [];
  for (const s of [-1, 1]) {
    const leg = group('hind_leg'); leg.position.set(s * L * 0.09, y0, L * 0.03); body.add(leg);
    limb(leg, 'femur', [0, 0, 0], [s * L * 0.05, L * 0.16, -L * 0.36], L * 0.024, color);
    limb(leg, 'tibia', [s * L * 0.05, L * 0.16, -L * 0.36], [s * L * 0.07, -y0, -L * 0.2], L * 0.011, dark);
    hind.push(leg);
  }
  for (const [z, s] of [[0.2, -1], [0.2, 1], [0.06, -1], [0.06, 1]]) limb(body, 'leg', [s * L * 0.06, y0 - L * 0.03, z * L], [s * L * 0.17, -0.0, (z + 0.06) * L], L * 0.009, dark);
  r.userData.hind = hind; r.userData.body = body;
  // 叫一声：后腿快速摩擦，身子跟着弹一下
  r.chirp = () => animate(480, (k) => {
    hind.forEach((h, i) => { h.rotation.x = Math.sin(k * PI * 8 + i) * 0.35 * (1 - k); });
    body.position.y = Math.sin(k * PI) * L * 0.05;
  }, Ease.linear);
  return r;
}
function locust() { return insect('p8_locust', 0.3, '#8a8a4a', '#5c5a30'); }
function grasshopper() {
  const r = insect('p8_grasshopper', 1.5, '#7f9a4a', '#4f5f2c');
  hitBox(r, 'grasshopper_hit', [0.8, 0.7, 1.5], [0, 0.35, 0]);
  r.flyAway = () => {
    const p0 = r.position.clone();
    return animate(1600, (k) => { r.position.set(p0.x + k * 1.5, p0.y + k * k * 7, p0.z - k * 3); r.rotation.x = -0.4 * k; }, Ease.inCubic).then(() => { r.visible = false; });
  };
  return r;
}
export const CHORUS = { SPACING: 1.4, height: (level) => 0.75 + level * 0.32 };
function locustTrees() {
  const r = group('p8_locust_trees');
  const locusts = [], trunks = [];
  LOCUST_LEVELS.forEach((level, i) => {
    const x = (i - (LOCUST_LEVELS.length - 1) / 2) * CHORUS.SPACING;
    const t = trunk(r, `chorus_trunk_${i}`, { r: 0.3 + (i % 2) * 0.05, h: 8 }); t.position.x = x; trunks.push(t);
    const holder = group(`chorus_locust_${i}`); holder.position.set(x + 0.02, CHORUS.height(level), 0.3 + (i % 2) * 0.05); r.add(holder);
    const l = locust(); l.rotation.set(-PI / 2, 0, PI); holder.add(l);
    hitBox(holder, 'locust_hit', [0.34, 0.42, 0.24], [0, 0, 0.07]);
    holder.userData.locust = l; holder.userData.level = level;
    locusts.push(holder);
  });
  r.userData = { ...r.userData, locusts, trunks };
  r.setState = ({ gone = false } = {}) => locusts.forEach((h) => { h.visible = !gone; h.position.y = CHORUS.height(h.userData.level); h.scale.setScalar(1); });
  r.chirp = (i) => locusts[i].userData.locust.chirp();
  // 合唱完：一只只飞起、消失在雾里
  r.flyAll = () => animate(1800, (k) => locusts.forEach((h, i) => {
    const t = Math.min(1, Math.max(0, k * 1.5 - i * 0.1));
    h.position.y = CHORUS.height(h.userData.level) + t * t * 6;
    h.scale.setScalar(1 - t * 0.6);
  }), Ease.linear).then(() => locusts.forEach((h) => { h.visible = false; }));
  r.setState();
  return r;
}
// 卵鞘：树干根部一团泡沫状的褐色卵块，孵化后裂开成空壳
function eggCase() {
  const r = group('p8_egg');
  const whole = group('egg_whole'); r.add(whole);
  ball(whole, 'egg_body', 0.16, '#a07a4e', [0, 0.16, 0], [1, 1.4, 0.75]);
  for (let i = 0; i < 6; i++) ring(whole, 'egg_band', 0.12 - Math.abs(i - 2.5) * 0.015, 0.012, '#8a6640', [0, 0.04 + i * 0.05, 0.02], {}).rotation.x = PI / 2;
  for (let i = 0; i < 9; i++) ball(whole, 'egg_spot', 0.012, i % 2 ? '#c59c63' : '#775738', [(i % 3 - 1) * 0.07, 0.08 + (i % 5) * 0.04, (i % 2 ? 1 : -1) * 0.08], [1, 0.7, 0.5], { outline: false });
  const husk = group('egg_husk'); r.add(husk);
  for (const s of [-1, 1]) { const h = ball(husk, 'egg_half', 0.16, '#8f6c45', [s * 0.07, 0.15, 0], [0.5, 1.3, 0.7]); h.rotation.z = s * 0.5; }
  hitBox(r, 'egg_hit', [0.4, 0.5, 0.3], [0, 0.2, 0]);
  r.setState = ({ hatched = false } = {}) => { whole.visible = !hatched; husk.visible = !!hatched; whole.scale.setScalar(1); };
  r.hatch = () => animate(700, (k) => { whole.scale.setScalar(1 + Math.sin(k * PI * 6) * 0.06 * (1 - k)); }, Ease.linear).then(() => r.setState({ hatched: true }));
  r.setState();
  return r;
}

// 巨型螳螂：2026-11-05 起有网格模型（mantis.rlpm，见 mantis_model.js）就用它；没有模型时是下面的程序化螳螂：
// 身体挂在 3 m 高处，四条细长的步足落到地面，一对捕捉足折在胸前；update 里做待机摆动和走路时的腿部摆动
function mantis() {
  const mm = getModel('mantis');
  if (mm) return buildMantisModel(mm);
  const r = group('p8_mantis');
  const C = '#6d7650', D = '#4b5236', P = '#b9bd8a';
  const rig = group('mantis_rig'); r.add(rig);
  ball(rig, 'mantis_abdomen', 0.36, C, [0, 3.1, -1.15], [1, 0.82, 3.2]).rotation.x = -0.12;
  ball(rig, 'mantis_wings', 0.3, D, [0, 3.36, -0.95], [0.95, 0.3, 3.1]).rotation.x = -0.1;
  ball(rig, 'mantis_thorax', 0.22, C, [0, 3.0, 0.12], [1, 0.9, 1.5]);
  // 上半身（前胸 + 头 + 捕捉足）绕胸部转：出击时整个往前下方扑
  const upper = group('mantis_upper'); upper.position.set(0, 3.05, 0.28); rig.add(upper);
  limb(upper, 'mantis_prothorax', [0, 0, 0], [0, 1.4, 0.77], 0.11, C);
  // 头：三角脸 + 两只大眼睛 + 触角（单独一组，待机时慢慢转头）
  const head = group('mantis_head'); head.position.set(0, 1.57, 0.84); upper.add(head);
  ball(head, 'mantis_face', 0.2, C, [0, 0, 0.04], [1.45, 1.05, 0.7]);
  cone(head, 'mantis_mouth', 0.09, 0.22, D, [0, -0.2, 0.08]).rotation.x = PI;
  for (const s of [-1, 1]) {
    ball(head, 'mantis_eye', 0.11, P, [s * 0.27, 0.07, 0.03], [0.9, 1.15, 0.9]);
    limb(head, 'mantis_antenna', [s * 0.06, 0.14, 0.1], [s * 0.55, 1.15, 0.55], 0.012, D);
  }
  // 捕捉足（祈祷姿势）：枢轴在前胸上，出击时整段向前下方甩
  const fore = [];
  for (const s of [-1, 1]) {
    const arm = group('mantis_foreleg'); arm.position.set(s * 0.13, 0.95, 0.57); upper.add(arm);
    limb(arm, 'mantis_coxa', [0, 0, 0], [s * 0.06, -0.55, 0.25], 0.07, C);
    limb(arm, 'mantis_femur', [s * 0.06, -0.55, 0.25], [s * 0.06, 0.02, 0.82], 0.075, C);
    for (let i = 0; i < 5; i++) cone(arm, 'mantis_spike', 0.02, 0.12, P, [s * 0.06, -0.48 + i * 0.11, 0.33 + i * 0.1]).rotation.x = -2.3;
    limb(arm, 'mantis_tibia', [s * 0.06, 0.02, 0.82], [s * 0.06, -0.36, 0.56], 0.05, C);
    fore.push(arm);
  }
  // 四条步足：每条一个枢轴（根部），走路时绕 Y 轴前后摆
  const legs = [];
  for (const [s, z, knee, foot, phase] of [[-1, 0.1, [-1.3, 3.95, 0.6], [-2.1, 0, 1.0], 0], [1, 0.1, [1.3, 3.95, 0.6], [2.1, 0, 1.0], PI],
    [-1, -0.25, [-1.45, 3.8, -1.2], [-2.3, 0, -2.1], PI], [1, -0.25, [1.45, 3.8, -1.2], [2.3, 0, -2.1], 0]]) {
    const root = [s * 0.15, 2.95, z];
    const leg = group('mantis_leg'); leg.position.fromArray(root); rig.add(leg);
    const k = knee.map((v, i) => v - root[i]), f = foot.map((v, i) => v - root[i]);
    limb(leg, 'mantis_leg_femur', [0, 0, 0], k, 0.045, C);
    limb(leg, 'mantis_leg_tibia', k, f, 0.03, D);
    legs.push({ leg, phase });
  }
  r.userData = { ...r.userData, head, fore, legs, rig, upper };
  r.walking = false;
  r.update = (dt, t) => {
    if (!r.visible) return;
    head.rotation.y = Math.sin(t * 0.45) * 0.35;
    head.rotation.z = Math.sin(t * 0.7) * 0.08;
    const w = r.walking ? 1 : 0;
    legs.forEach(({ leg, phase }) => { leg.rotation.y = Math.sin(t * 5 + phase) * 0.22 * w; leg.rotation.x = Math.max(0, Math.sin(t * 5 + phase)) * 0.08 * w; });
    rig.position.y = Math.sin(t * (r.walking ? 10 : 1.2)) * (r.walking ? 0.06 : 0.03);
  };
  /** 走到 [x, y, z]（世界坐标里父节点下的位置），一路转向前进方向。 */
  r.walkTo = (to, ms = null) => {
    const from = r.position.clone(), target = new THREE.Vector3(...to);
    const dist = from.distanceTo(target);
    if (dist < 0.01) return Promise.resolve();
    const yaw = Math.atan2(target.x - from.x, target.z - from.z), yaw0 = r.rotation.y;
    let dy = yaw - yaw0; while (dy > PI) dy -= 2 * PI; while (dy < -PI) dy += 2 * PI;
    r.walking = true;
    return animate(ms ?? Math.max(900, dist * 420), (k) => {
      r.position.lerpVectors(from, target, k);
      r.rotation.y = yaw0 + dy * Math.min(1, k * 4);
    }, Ease.inOutSine).then(() => { r.walking = false; });
  };
  r.face = (x, z) => { r.rotation.y = Math.atan2(x - r.position.x, z - r.position.z); };
  r.strike = () => animate(900, (k) => { const a = Math.sin(k * PI); upper.rotation.x = a * 0.75; fore.forEach((arm) => { arm.rotation.x = a * 0.95; }); }, Ease.linear);
  r.rest = () => { upper.rotation.x = 0; fore.forEach((arm) => { arm.rotation.x = 0; }); };
  return r;
}

function owlBird() {
  const o = group('p8_owl');
  ball(o, 'owl_body', 0.16, '#7b5a3a', [0, 0.2, 0], [1, 1.25, 0.95]);
  ball(o, 'owl_belly', 0.12, '#c9b08a', [0, 0.18, 0.07], [1, 1.2, 0.8]);
  ball(o, 'owl_head', 0.14, '#7b5a3a', [0, 0.44, 0.01], [1.15, 1, 1]);
  ball(o, 'owl_face', 0.12, '#d8c6a4', [0, 0.44, 0.07], [1.15, 1, 0.6]);
  for (const s of [-1, 1]) {
    ball(o, 'owl_eye', 0.045, '#e8962a', [s * 0.055, 0.46, 0.135], [1, 1, 0.5], FINE);
    ball(o, 'owl_pupil', 0.022, '#141210', [s * 0.055, 0.46, 0.157], [1, 1, 0.4], FINE);
    cone(o, 'owl_tuft', 0.03, 0.1, '#5e4329', [s * 0.1, 0.57, 0]).rotation.z = -s * 0.35;
    ball(o, 'owl_wing', 0.1, '#6a4c30', [s * 0.14, 0.2, -0.01], [0.45, 1.3, 0.9]);
  }
  cone(o, 'owl_beak', 0.018, 0.05, '#3c3226', [0, 0.41, 0.15]).rotation.x = PI;
  return o;
}
function nestModel() {
  const n = group('p8_nest');
  add(n, new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.08, 8, 18), toon('#7a6142')), 'nest_ring').rotation.x = PI / 2;
  add(n, new THREE.Mesh(new THREE.CircleGeometry(0.19, 16), toon('#4a3a28', { outline: false })), 'nest_bed', [0, -0.02, 0]).rotation.x = -PI / 2;
  for (let i = 0; i < 10; i++) { const a = i * 0.63; limb(n, 'nest_twig', [Math.cos(a) * 0.15, 0.03, Math.sin(a) * 0.15], [Math.cos(a + 1.2) * 0.3, 0.05, Math.sin(a + 1.2) * 0.3], 0.008, '#6b5338'); }
  return n;
}
// 猫头鹰树：树枝从树干伸向 -X，窝在枝头上；树枝断了以后窝掉在地上，钥匙在窝里
export const OWL_TREE = { branchY: 2.9, nestX: -1.15 };
function owlTree() {
  const r = group('p8_owl_tree');
  trunk(r, 'owl_trunk', { r: 0.3, h: 7.5, color: '#5a524a' });
  const branch = group('owl_branch'); branch.position.set(-0.2, OWL_TREE.branchY, 0.05); r.add(branch);
  limb(branch, 'owl_branch_wood', [0, 0, 0], [-1.6, 0.25, 0.05], 0.07, '#5a524a');
  limb(branch, 'owl_twig', [-1.1, 0.16, 0.04], [-1.5, 0.7, -0.2], 0.03, '#5a524a');
  const nest = nestModel(); nest.position.set(OWL_TREE.nestX + 0.2, 0.2, 0.05); branch.add(nest);
  const owl = owlBird(); owl.position.set(0, 0.02, 0); nest.add(owl);
  hitBox(owl, 'owl_hit', [0.4, 0.62, 0.36], [0, 0.3, 0]);
  const k = key(); k.position.set(0.03, -0.01, 0.02); k.rotation.set(-PI / 2, 0, 0.6); k.scale.setScalar(1.3); nest.add(k);
  hitBox(k, 'key_hit', [0.12, 0.2, 0.12], [0, 0.06, 0]);
  r.userData = { ...r.userData, branch, nest, owl, key: k };
  const NEST_ON = nest.position.clone();
  r.setState = ({ owl: hasOwl = true, fallen = false, key: hasKey = true } = {}) => {
    owl.visible = !!hasOwl;
    branch.rotation.z = fallen ? 0.85 : 0;
    if (fallen) { r.attach(nest); nest.position.set(OWL_TREE.nestX - 0.2, 0.06, 0.95); nest.rotation.set(0.15, 0.4, 0.1); }
    else { branch.attach(nest); nest.position.copy(NEST_ON); nest.rotation.set(0, 0, 0); }
    k.visible = !!fallen && !!hasKey;
  };
  // 树枝折断、窝掉到地上（树枝绕根部往下垂）
  r.breakBranch = async () => {
    await animate(450, (t) => { branch.rotation.z = 0.85 * t; }, Ease.inCubic);
    const start = new THREE.Vector3(); nest.getWorldPosition(start); r.worldToLocal(start); r.attach(nest);
    const end = new THREE.Vector3(OWL_TREE.nestX - 0.2, 0.06, 0.95);
    await animate(600, (t) => { nest.position.lerpVectors(start, end, t); nest.position.y = start.y + (end.y - start.y) * t * t; nest.rotation.set(0.15 * t, 0.4 * t, 0.1 * t); }, Ease.linear);
  };
  r.setState();
  return r;
}

// ---------- 木屋外：灯和蛾群（看穿后多出一只萤火虫）；刻着眼睛的树 ----------
export const LANTERN = { lamp: [0.55, 1.95, 0], firefly: [0.62, 1.3, 0.22] };
function lantern() {
  const r = group('p8_lantern');
  cyl(r, 'lantern_post', 0.06, 2.35, '#5d4a38', [0, 1.175, 0], 10);
  box(r, 'lantern_arm', [0.68, 0.06, 0.06], '#5d4a38', [0.3, 2.28, 0]);
  const lamp = group('lantern_lamp'); lamp.position.fromArray(LANTERN.lamp); r.add(lamp);
  limb(lamp, 'lantern_chain', [0, 0.33, 0], [0, 0.17, 0], 0.006, '#2a2826');
  box(lamp, 'lantern_glass', [0.18, 0.24, 0.18], '#ffe9a8', [0, 0, 0], unlit('#ffe9a8'));
  for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) box(lamp, 'lantern_frame', [0.02, 0.26, 0.02], '#2a2826', [x * 0.09, 0, z * 0.09], toon('#2a2826', FINE));
  cone(lamp, 'lantern_cap', 0.15, 0.1, '#2a2826', [0, 0.17, 0]);
  const light = new THREE.PointLight('#ffd27a', 2.2, 6, 1.6); light.position.copy(lamp.position); r.add(light);
  // 蛾群：十几只发光的蛾子绕着灯飞
  const moths = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.035), glow('#fff4d0', { side: THREE.DoubleSide, opacity: 0.95 }));
    m.name = 'swarm_moth'; m.userData.p = { rad: 0.18 + (i % 5) * 0.06, sp: 1.4 + (i % 4) * 0.45, ph: i * 1.7, h: (i % 7 - 3) * 0.05 };
    r.add(m); moths.push(m);
  }
  const swarm = hitBox(r, 'swarm_hit', [0.75, 0.7, 0.75], LANTERN.lamp);
  const ff = group('lantern_firefly'); ff.position.fromArray(LANTERN.firefly); r.add(ff);
  const fly = firefly(); fly.scale.setScalar(2.2); ff.add(fly);
  const halo = add(ff, new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), glow('#c9ff5a', { opacity: 0.35 })), 'firefly_halo', [0, 0.04, 0]);
  hitBox(ff, 'firefly_hit', [0.26, 0.26, 0.26], [0, 0.04, 0]);
  r.userData = { ...r.userData, swarm, firefly: ff, moths };
  r.setState = ({ firefly: shown = false } = {}) => { ff.visible = !!shown; };
  r.update = (dt, t) => {
    for (const m of moths) {
      const p = m.userData.p, a = t * p.sp + p.ph;
      m.position.set(LANTERN.lamp[0] + Math.cos(a) * p.rad, LANTERN.lamp[1] + p.h + Math.sin(a * 1.7) * 0.06, LANTERN.lamp[2] + Math.sin(a) * p.rad);
      m.rotation.set(Math.sin(a * 3) * 0.6, -a, 0);
    }
    if (ff.visible) { fly.position.y = Math.sin(t * 2.2) * 0.03; halo.material.opacity = 0.25 + Math.max(0, Math.sin(t * 3.1)) * 0.35; }
  };
  r.setState();
  return r;
}
function eyeCarving() {
  return tex(256, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#1f1914'; g.lineWidth = 10; g.lineCap = 'round';
    g.beginPath(); g.moveTo(14, h / 2); g.quadraticCurveTo(w / 2, -18, w - 14, h / 2); g.quadraticCurveTo(w / 2, h + 18, 14, h / 2); g.stroke();
    g.fillStyle = '#2a211a'; g.beginPath(); g.arc(w / 2, h / 2, 34, 0, 2 * PI); g.fill();
    g.fillStyle = '#d9c9a0'; g.beginPath(); g.arc(w / 2 + 8, h / 2 - 8, 8, 0, 2 * PI); g.fill();
  });
}
function eyeTree() {
  const r = group('p8_eye_tree');
  trunk(r, 'eye_trunk', { r: 0.4, h: 8, color: '#5b534a' });
  const carving = add(r, new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.29), unlit('#ffffff', { map: eyeCarving(), transparent: true })), 'eye_carving', [0, 1.6, 0.395]);
  const glowEye = add(r, new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), glow('#ffe7a0', { opacity: 0 })), 'eye_glow', [0, 1.6, 0.41]);
  hitBox(r, 'eye_tree_hit', [1.0, 2.6, 1.0], [0, 1.3, 0]);
  r.userData = { ...r.userData, carving, glowEye };
  r.setGlow = (k) => { glowEye.material.opacity = Math.max(0, Math.min(1, k)) * 0.9; };
  return r;
}

// ---------- 白桦林：羊骨头（两颗眼睛在中间）、地上的圈 / 挖出来的箱子 ----------
function bones() {
  const r = group('p8_bones');
  const B = '#e9e3d2';
  cyl(r, 'bone_spine', 0.035, 0.95, B, [0, 0.07, 0], 8).rotation.x = PI / 2;
  for (let i = 0; i < 6; i++) add(r, new THREE.Mesh(new THREE.TorusGeometry(0.17 - Math.abs(i - 2.5) * 0.012, 0.014, 6, 16, PI * 1.1), toon(B)), 'bone_rib', [0, 0.06, -0.25 + i * 0.09]).rotation.z = -0.05 * PI;
  const skull = group('bone_skull'); skull.position.set(0.06, 0.08, 0.62); skull.rotation.y = 0.5; r.add(skull);
  ball(skull, 'skull_cranium', 0.09, B, [0, 0.03, 0], [1, 0.9, 1.2]);
  box(skull, 'skull_snout', [0.08, 0.06, 0.16], B, [0, 0, 0.13]);
  for (const s of [-1, 1]) { const h = cone(skull, 'skull_horn', 0.025, 0.16, '#cfc5ad', [s * 0.05, 0.12, -0.04]); h.rotation.x = -0.9; }
  for (const [x, z, a] of [[0.32, 0.3, 0.4], [-0.3, 0.1, -0.7], [0.28, -0.4, 1.2], [-0.25, -0.45, 0.2]]) cyl(r, 'bone_leg', 0.02, 0.42, B, [x, 0.02, z], 6).rotation.set(PI / 2, 0, a);
  const eyes = goatEyes(); eyes.position.set(-0.34, 0.0, 0.12); eyes.rotation.y = -PI / 2; eyes.scale.setScalar(2.0); r.add(eyes);   // 骨架前面（转 90° 后朝向镜头那一侧）
  hitBox(eyes, 'eyes_hit', [0.22, 0.14, 0.16], [0, 0.04, 0]);
  r.userData = { ...r.userData, eyes };
  r.setState = ({ eyes: on = true } = {}) => { eyes.visible = !!on; };
  return r;
}
function chest() {
  const c = group('p8_chest');
  const W = 0.42, D = 0.3, H = 0.22;
  const T = 0.025;
  box(c, 'chest_floor', [W, T, D], '#7a5534', [0, T / 2, 0]);
  for (const s of [-1, 1]) { box(c, 'chest_wall', [W, H, T], '#7a5534', [0, H / 2, s * (D / 2 - T / 2)]); box(c, 'chest_wall', [T, H, D], '#7a5534', [s * (W / 2 - T / 2), H / 2, 0]); }
  box(c, 'chest_inside', [W - 2 * T, 0.004, D - 2 * T], '#2e2116', [0, T + 0.002, 0], toon('#2e2116', { outline: false }));
  for (const x of [-0.15, 0.15]) box(c, 'chest_band', [0.025, H + 0.005, D + 0.005], '#3c3a38', [x, H / 2, 0], toon('#3c3a38', FINE));
  const lid = group('chest_lid'); lid.position.set(0, H, -D / 2); c.add(lid);
  box(lid, 'chest_lid_board', [W + 0.01, 0.06, D + 0.01], '#83603c', [0, 0.03, D / 2]);
  box(lid, 'chest_lock', [0.06, 0.07, 0.02], BRASS, [0, -0.01, D + 0.012], toon(BRASS, FINE));
  const horn = fogHorn(); horn.position.set(-0.17, 0.06, 0.02); horn.rotation.y = 0.2; c.add(horn);
  hitBox(horn, 'horn_hit', [0.42, 0.18, 0.16], [0.17, 0.05, 0]);
  hitBox(c, 'chest_hit', [W + 0.06, H + 0.1, D + 0.06], [0, H / 2, 0]);
  c.userData = { ...c.userData, lid, horn };
  c.setState = ({ open = false, horn: hasHorn = true } = {}) => { lid.rotation.x = open ? -1.9 : 0; horn.visible = !!open && !!hasHorn; };
  c.open = () => animate(800, (k) => { lid.rotation.x = -1.9 * k; }, Ease.outCubic);
  c.setState();
  return c;
}
function digSpot() {
  const r = group('p8_dig');
  const circle = group('dig_circle'); r.add(circle);
  add(circle, new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), unlit('#3a2a1c', { side: THREE.DoubleSide })), 'dig_ring', [0, 0.025, 0]).rotation.x = -PI / 2;
  add(circle, new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), flat('#6b5640')), 'dig_dirt', [0, 0.02, 0]).rotation.x = -PI / 2;
  const circleHit = hitBox(r, 'dig_hit', [1.05, 0.12, 1.05], [0, 0.05, 0]);
  const hole = group('dig_hole'); r.add(hole);
  add(hole, new THREE.Mesh(new THREE.CircleGeometry(0.5, 28), flat('#2a1f16')), 'dig_pit', [0, 0.018, 0]).rotation.x = -PI / 2;
  ball(hole, 'dig_mound', 0.32, '#5c4630', [0.75, 0.0, -0.2], [1.3, 0.45, 1]);
  const box_ = chest(); box_.position.set(0, -0.08, 0); hole.add(box_);
  r.userData = { ...r.userData, circle: circleHit, chest: box_, horn: box_.userData.horn };
  r.setState = ({ revealed = false, dug = false, open = false, horn = true } = {}) => {
    circle.visible = !!revealed && !dug;
    hole.visible = !!dug;
    box_.setState({ open, horn });
  };
  r.setState();
  return r;
}

// ---------- 湖边：小船（老奶奶由章节放上去）；木屋里的白墙红字 ----------
function boat() {
  const r = group('p8_boat');
  const rig = group('boat_rig'); r.add(rig);
  const hull = add(rig, new THREE.Mesh(new THREE.SphereGeometry(1, 24, 10, 0, 2 * PI, PI / 2, PI / 2), toon('#6e4c30', { side: THREE.DoubleSide })), 'boat_hull');
  hull.scale.set(0.68, 0.38, 1.55);
  // 原作小船近景有明显的尖艏、龙骨和船舷颜色分层，补上这些轮廓件。
  const keel = cyl(rig, 'boat_keel', 0.035, 2.35, '#4b301f', [0, -0.28, 0], 8); keel.rotation.x = PI / 2;
  for (const z of [-1.25, 1.2]) {
    const prow = cone(rig, 'boat_prow', 0.16, 0.38, '#805733', [0, -0.03, z]);
    prow.rotation.x = z > 0 ? PI / 2 : -PI / 2;
  }
  add(rig, new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 32), toon('#5a3d26')), 'boat_rim').scale.set(0.68, 1.55, 1);
  rig.getObjectByName('boat_rim').rotation.x = PI / 2;
  for (const z of [-0.6, 0.55]) box(rig, 'boat_bench', [1.2, 0.04, 0.22], '#7d5a3a', [0, -0.1, z]);
  for (const s of [-1, 1]) { const o = cyl(rig, 'boat_oar', 0.02, 2.0, '#8a6a48', [s * 0.75, 0.0, 0.0], 6); o.rotation.set(PI / 2, 0, s * 0.35); }
  hitBox(rig, 'boat_hit', [1.5, 0.6, 3.1], [0, 0, 0]);
  r.userData = { ...r.userData, rig };
  r.update = (dt, t) => { rig.rotation.z = Math.sin(t * 0.9) * 0.03; rig.rotation.x = Math.sin(t * 0.7) * 0.015; rig.position.y = Math.sin(t * 1.1) * 0.02; };
  return r;
}
function wallText() {
  const r = group('p8_wall_text');
  const t = tex(1024, 560, (g, w, h) => {
    g.fillStyle = '#efece4'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(160,150,135,0.25)'; for (let i = 0; i < 40; i++) g.fillRect((i * 97) % w, (i * 53) % h, 60, 3);
    g.fillStyle = '#a3221c'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 150px "Microsoft YaHei", "PingFang SC", sans-serif';
    g.fillText('别信猫头鹰', w / 2, h / 2);
    for (const [x, len] of [[250, 70], [380, 120], [610, 90], [760, 60]]) g.fillRect(x, h / 2 + 60, 8, len);
  });
  add(r, new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.1), unlit('#ffffff', { map: t })), 'wall_text');
  hitBox(r, 'wall_hit', [2.0, 1.1, 0.05], [0, 0, 0.02]);
  return r;
}

// 第八灾的画：田野上空一大群蝗虫；下一灾（夜灾）是右边一小块黑夜和一弯月亮
const p8Painting = () => plaguePainting('p8_painting', {
  plague: (g, k) => {
    for (let i = 0; i < 90; i++) {
      const x = 40 + (i * 137) % 560, y = 40 + (i * 89) % 330;
      g.fillStyle = i % 3 ? `rgba(70,82,38,${0.85 * k})` : `rgba(110,92,48,${0.85 * k})`;
      g.beginPath(); g.ellipse(x, y, 9, 4, (i % 5) * 0.6, 0, 2 * PI); g.fill();
    }
  },
  next: (g) => {
    g.fillStyle = '#1d2233'; g.fillRect(432, 296, 60, 122);
    g.fillStyle = '#e8e2c4'; g.beginPath(); g.arc(462, 334, 12, 0, 2 * PI); g.fill();
    g.fillStyle = '#1d2233'; g.beginPath(); g.arc(468, 330, 11, 0, 2 * PI); g.fill();
    g.fillStyle = '#e8e2c4'; for (const [x, y] of [[442, 370], [480, 392], [452, 405], [484, 356]]) g.fillRect(x, y, 2, 2);
  },
});

export const FACTORIES = {
  p8_axe: axe, p8_shovel: shovel, p8_moth: moth, p8_goat_eyes: goatEyes, p8_firefly: firefly, p8_key: key, p8_fog_horn: fogHorn,
  p8_boards: boards, p8_mandolin: mandolin, p8_score: scoreStand, p8_box: musicBox,
  p8_locust: locust, p8_grasshopper: grasshopper, p8_locust_trees: locustTrees, p8_egg: eggCase, p8_mantis: mantis,
  p8_owl: owlBird, p8_owl_tree: owlTree, p8_lantern: lantern, p8_eye_tree: eyeTree,
  p8_bones: bones, p8_chest: chest, p8_dig: digSpot, p8_boat: boat, p8_wall_text: wallText, p8_painting: p8Painting,
};
