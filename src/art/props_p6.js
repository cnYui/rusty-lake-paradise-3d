// 第六灾（疹灾）专属道具工厂：id 一律 p6_ 前缀（设计见 docs/plague6_7_design.md）。
// 模型只呈现传入的状态（setState / setHands / setLayers …），玩法真值在章节的 flags 和物品栏里。
// 全部按真实尺寸建（米）：瓶子 12 cm、量瓶 26 cm、落地钟 2.05 m、病床 2 m。
import * as THREE from 'three';
import { toon, unlit, flat, canvasTexture } from './materials.js';
import { animate, Ease } from '../core/tween.js';
import { PI, group, add, box, ball, cyl, ring, label, rod, clear } from './p5_kit.js';
import { BOILS, BOIL_EDGES, BOIL_COLOR_HEX, HUMOR_COLOR, TOOTH_UPPER, TOOTH_MARKS, TRUNK_LETTERS } from '../chapters/plague6/rules.js';

const FINE = { outline: 0.0022 };
const GLASS = (opts = {}) => toon('#dfe9ea', { transparent: true, opacity: 0.38, depthWrite: false, outline: false, ...opts });
// 不可见的点击盒（热点射线只认带 proxy 标记的不可见网格）
const HIT = new THREE.MeshBasicMaterial({ visible: false }); HIT.userData.outlineParameters = { visible: false };
function hitBox(parent, name, size, pos = [0, 0, 0]) { const m = new THREE.Mesh(new THREE.BoxGeometry(...size), HIT); m.name = name; m.userData.proxy = true; m.position.fromArray(pos); parent.add(m); return m; }
const WOOD = '#8a6040', WOOD_DARK = '#5b3d28', GOLD = '#c9a043', SKIN = '#e2cdb6';

const tex = (w, h, draw) => canvasTexture(w, h, draw, { wrap: false });
const plane = (g, name, w, h, map, p, opts = {}) => add(g, new THREE.Mesh(new THREE.PlaneGeometry(w, h), unlit('#ffffff', { map, transparent: true, ...opts })), name, p);

// ---------- 牛头骨（天堂门前地上）：眼窝里能渗出血 ----------
function skull() {
  const r = group('p6_skull');
  ball(r, 'skull_cranium', 0.13, '#e7e0cf', [0, 0.11, -0.05], [1, 0.75, 1.1]);
  ball(r, 'skull_snout', 0.075, '#e2dac7', [0, 0.07, 0.17], [0.9, 0.7, 1.6]);
  for (const s of [-1, 1]) {
    ball(r, 'skull_eye', 0.03, '#3a3029', [s * 0.065, 0.14, 0.07], [1, 1.2, 0.6]);
    const pts = [new THREE.Vector3(s * 0.1, 0.16, -0.08), new THREE.Vector3(s * 0.3, 0.2, -0.12), new THREE.Vector3(s * 0.42, 0.34, -0.02)];
    add(r, new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.026, 8), toon('#d9d1bd')), 'skull_horn');
  }
  const drip = cyl(r, 'skull_blood', 0.008, 0.07, '#9b1f22', [0.065, 0.1, 0.09], 8);
  const pool = cyl(r, 'skull_blood_pool', 0.05, 0.004, '#8a1c1c', [0.07, 0.003, 0.14], 16);
  r.setBleeding = (on) => { drip.visible = pool.visible = !!on; };
  r.setBleeding(false);
  return r;
}

// ---------- 瓶子：空瓶 / 四体液 / 药 ----------
function vial({ humor = null, cork = true } = {}) {
  const r = group('p6_vial');
  cyl(r, 'vial_glass', 0.026, 0.09, '#dfe9ea', [0, 0.045, 0], 16).material = GLASS();
  cyl(r, 'vial_neck', 0.011, 0.03, '#dfe9ea', [0, 0.105, 0], 12).material = GLASS();
  if (cork) cyl(r, 'vial_cork', 0.012, 0.018, '#a87a4f', [0, 0.124, 0], 10, FINE);
  if (humor) cyl(r, 'vial_liquid', 0.022, 0.065, HUMOR_COLOR[humor], [0, 0.036, 0], 16, FINE);
  return r;
}
function bottles(n = 3) {
  const r = group('p6_bottles');
  for (let i = 0; i < n; i++) { const v = vial(); v.position.set((i - (n - 1) / 2) * 0.06, 0, (i % 2) * 0.02); r.add(v); }
  return r;
}

// ---------- 树林：劈开的树桩（刀 + 蘑菇）、洋葱、石井 ----------
function mushroom() {
  const r = group('p6_mushroom');
  cyl(r, 'mushroom_stem', 0.012, 0.05, '#efe6d2', [0, 0.025, 0], 10, FINE);
  ball(r, 'mushroom_cap', 0.032, '#9a5a35', [0, 0.05, 0], [1, 0.55, 1], FINE);
  return r;
}
function onion({ leaves = true } = {}) {
  const r = group('p6_onion');
  ball(r, 'onion_bulb', 0.04, '#d8b98d', [0, 0.04, 0], [1, 1.05, 1], FINE);
  add(r, new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 8), toon('#c9a676', FINE)), 'onion_tip', [0, 0.09, 0]);
  if (leaves) for (const a of [-0.25, 0.05, 0.3]) { const l = cyl(r, 'onion_leaf', 0.005, 0.22, '#7c9a4a', [Math.sin(a) * 0.05, 0.2, 0], 6, FINE); l.rotation.z = -a; }
  return r;
}
function stump() {
  const r = group('p6_stump');
  for (const s of [-1, 1]) {
    const half = add(r, new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.6, 18, 1, false, s > 0 ? 0 : PI, PI), toon('#8c6a48')), 'stump_half', [s * 0.035, 0.3, 0]);
    half.rotation.z = -s * 0.04;
  }
  box(r, 'stump_split', [0.06, 0.58, 0.6], '#4a3626', [0, 0.29, 0]);
  const knife = new THREE.Group(); knife.name = 'stump_knife'; knife.position.set(0.12, 0.6, 0.02); knife.rotation.set(0, 0.4, 2.6); r.add(knife);
  const m = mushroom(); m.name = 'stump_mushroom'; m.position.set(-0.28, 0.0, 0.2); m.scale.setScalar(1.3); r.add(m);
  r.userData.knifeSlot = knife; r.userData.mushroom = m;
  r.setState = ({ knife: k = true, mushroom: mu = true } = {}) => { knife.visible = !!k; m.visible = !!mu; };
  return r;
}
function well() {
  const r = group('p6_well');
  for (let i = 0; i < 14; i++) {
    const a = i * 2 * PI / 14;
    const s = box(r, 'well_stone', [0.36, 0.62, 0.18], i % 2 ? '#8e8b84' : '#a19d94', [Math.cos(a) * 0.62, 0.31, Math.sin(a) * 0.62]);
    s.rotation.y = -a + PI / 2;
  }
  ring(r, 'well_rim', 0.62, 0.07, '#b6b1a6', [0, 0.63, 0]).rotation.x = PI / 2;
  const water = cyl(r, 'well_water', 0.55, 0.02, '#2f3b3e', [0, 0.32, 0], 24); water.material = unlit('#2b3639');
  const key = new THREE.Group(); key.name = 'well_key'; key.position.set(0.12, 0.34, -0.05); r.add(key);
  r.userData.keySlot = key; r.userData.water = water;
  r.setKey = (on) => { key.visible = !!on; };
  return r;
}

// ---------- 白桦林的岩壁拱门（门里是向上的石阶） ----------
function cave() {
  const r = group('p6_cave');
  const rock = '#8d8d8c';
  for (const [x, y, w, h, d] of [[-2.4, 1.8, 3.2, 3.8, 1.2], [2.4, 1.9, 3.2, 4.0, 1.1], [0, 3.35, 2.2, 1.6, 1.15], [-4.6, 1.4, 2.0, 3.0, 1.0], [4.6, 1.5, 2.0, 3.2, 1.0]]) {
    const b = ball(r, 'cave_rock', 1, rock, [x, y, -0.4], [w / 2, h / 2, d / 2]);
    b.material = flat(rock);
  }
  // 拱形门洞：深色的门框 + 黑暗的里面 + 几级台阶
  const arch = new THREE.Shape(); arch.moveTo(-0.65, 0); arch.lineTo(-0.65, 1.7); arch.absarc(0, 1.7, 0.65, PI, 0, true); arch.lineTo(0.65, 0); arch.lineTo(-0.65, 0);
  add(r, new THREE.Mesh(new THREE.ShapeGeometry(arch, 16), unlit('#141413')), 'cave_dark', [0, 0, 0.25]);
  const frame = new THREE.Shape(); frame.moveTo(-0.85, 0); frame.lineTo(-0.85, 1.7); frame.absarc(0, 1.7, 0.85, PI, 0, true); frame.lineTo(0.85, 0); frame.lineTo(0.65, 0); frame.lineTo(0.65, 1.7); frame.absarc(0, 1.7, 0.65, 0, PI, false); frame.lineTo(-0.65, 0);
  add(r, new THREE.Mesh(new THREE.ExtrudeGeometry(frame, { depth: 0.2, bevelEnabled: false, curveSegments: 16 }), toon('#a6a39c')), 'cave_frame', [0, 0, 0.18]);
  for (let i = 0; i < 6; i++) box(r, 'cave_step', [1.2, 0.16, 0.3], i % 2 ? '#7d7b77' : '#8b8984', [0, 0.08 + i * 0.16, 0.05 - i * 0.28]).material = flat(i % 2 ? '#6c6a66' : '#7b7975');
  return r;
}

// ---------- 瘟疫法杖：长杖顶上一只张开的手 ----------
function staff() {
  const r = group('p6_staff');
  cyl(r, 'staff_rod', 0.014, 1.5, '#4a4642', [0, 0.75, 0], 8);
  ring(r, 'staff_band', 0.02, 0.006, GOLD, [0, 1.38, 0]).rotation.x = PI / 2;
  ball(r, 'staff_palm', 0.04, '#d8d2c6', [0, 1.55, 0], [1, 1.2, 0.45]);
  for (let i = 0; i < 4; i++) cyl(r, 'staff_finger', 0.009, 0.07, '#d8d2c6', [-0.03 + i * 0.02, 1.62, 0], 6).rotation.z = (i - 1.5) * 0.12;
  cyl(r, 'staff_thumb', 0.009, 0.05, '#d8d2c6', [0.05, 1.56, 0], 6).rotation.z = -0.9;
  return r;
}

// ---------- 落地钟：两根针（× 和 ∶），钟面能像小门一样打开，里面是金色发条心 ----------
function clockHeart() {
  const r = group('p6_clock_heart');
  ball(r, 'cheart_body', 0.05, GOLD, [0, 0.05, 0], [1, 1.1, 0.8], FINE);
  ring(r, 'cheart_gear', 0.032, 0.006, '#e3c66c', [0.012, 0.06, 0.04], FINE);
  ring(r, 'cheart_gear', 0.018, 0.005, '#8f6f2a', [-0.022, 0.035, 0.038], FINE);
  cyl(r, 'cheart_key', 0.006, 0.05, '#e3c66c', [0, 0.11, 0], 6, FINE);
  return r;
}
function clockFaceTexture() {
  return tex(512, 512, (g, w) => {
    g.fillStyle = '#f2ece2'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 4, 0, 2 * PI); g.fill();
    g.strokeStyle = '#3d3029'; g.lineWidth = 8; g.stroke();
    for (const rr of [70, 100, 130]) { g.lineWidth = 3; g.strokeStyle = '#b9ab9b'; g.beginPath(); g.arc(w / 2, w / 2, rr, 0, 2 * PI); g.stroke(); }
    const R = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    g.fillStyle = '#4b3a2f'; g.font = 'bold 50px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    R.forEach((s, i) => { const a = i * PI / 6 - PI / 2; g.save(); g.translate(w / 2 + Math.cos(a) * 200, w / 2 + Math.sin(a) * 200); g.rotate(a + PI / 2); g.fillText(s, 0, 0); g.restore(); });
  });
}
function clockHand(name, len, mark) {
  const pivot = new THREE.Group(); pivot.name = name;
  box(pivot, `${name}_bar`, [0.012, len, 0.006], GOLD, [0, len / 2, 0], toon(GOLD, FINE));
  add(pivot, new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.035, 4), toon(GOLD, FINE)), `${name}_tip`, [0, len + 0.012, 0]);
  const t = tex(64, 64, (g) => { g.fillStyle = '#2a211b'; g.font = 'bold 54px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(mark, 32, 34); });
  plane(pivot, `${name}_mark`, 0.03, 0.03, t, [0, len * 0.6, 0.006]);
  // 不可见的点击盒：针细，靠它放大点击范围
  hitBox(pivot, `${name}_hit`, [0.05, len + 0.02, 0.02], [0, len / 2, 0.01]);
  return pivot;
}
function grandfatherClock() {
  const r = group('p6_clock');
  const body = '#e6d3c8';
  box(r, 'clock_base', [0.58, 0.28, 0.4], '#d8c3b5', [0, 0.14, 0]);
  box(r, 'clock_trunk', [0.42, 1.2, 0.32], body, [0, 0.88, 0]);
  box(r, 'clock_door', [0.26, 0.9, 0.02], '#f0e2d8', [0, 0.86, 0.17]);
  box(r, 'clock_hood', [0.56, 0.52, 0.38], body, [0, 1.74, 0]);
  box(r, 'clock_crown', [0.62, 0.08, 0.42], '#d8c3b5', [0, 2.04, 0]);
  const face = new THREE.Group(); face.name = 'clock_face_door'; face.position.set(-0.19, 1.74, 0.195); r.add(face);
  const disc = add(face, new THREE.Mesh(new THREE.CircleGeometry(0.19, 40), unlit('#ffffff', { map: clockFaceTexture() })), 'clock_face', [0.19, 0, 0.004]);
  disc.userData.face = true;
  const hands = new THREE.Group(); hands.name = 'clock_hands'; hands.position.set(0.19, 0, 0.012); face.add(hands);
  const handX = clockHand('hand_x', 0.12, '×'), handDots = clockHand('hand_dots', 0.15, '∶');
  // 短的 × 针在前面：两根针重叠时点中心附近是 × 针，点外圈是 ∶ 针
  handX.position.z = 0.012; hands.add(handX, handDots);
  ball(hands, 'clock_hub', 0.012, GOLD, [0, 0, 0.018], [1, 1, 0.5], FINE);
  // 钟面后面的小格子：放发条心
  box(r, 'clock_cavity', [0.3, 0.3, 0.04], '#3b2a20', [0, 1.74, 0.17]);
  const heart = clockHeart(); heart.position.set(0, 1.68, 0.17); r.add(heart);
  const st = { x: 12, dots: 3, open: 0 };
  const apply = () => {
    handX.rotation.z = -st.x * PI / 6; handDots.rotation.z = -st.dots * PI / 6;
    face.rotation.y = -st.open * 1.9;
  };
  r.setHands = (x, dots) => { st.x = x; st.dots = dots; apply(); };
  r.setHeart = (on) => { heart.visible = !!on; };
  r.setOpen = (on) => { st.open = on ? 1 : 0; apply(); };
  r.open = () => animate(900, (k) => { st.open = k; apply(); }, Ease.inOutSine);
  r.userData = { ...r.userData, handX, handDots, heart, face: disc, state: st };
  apply();
  return r;
}

// ---------- 墙上的玻璃小柜（钥匙孔，里面三只空瓶） ----------
function cabinet() {
  const r = group('p6_cabinet');
  box(r, 'cab_back', [0.56, 0.72, 0.03], WOOD_DARK, [0, 0.36, -0.1]);
  for (const x of [-0.27, 0.27]) box(r, 'cab_side', [0.03, 0.72, 0.22], '#b0612a', [x, 0.36, 0]);
  for (const y of [0.015, 0.36, 0.705]) box(r, 'cab_shelf', [0.56, 0.03, 0.22], '#b0612a', [0, y, 0]);
  const door = new THREE.Group(); door.name = 'cab_door'; door.position.set(-0.26, 0.36, 0.115); r.add(door);
  for (const [w, h, x, y] of [[0.52, 0.05, 0.26, 0.325], [0.52, 0.05, 0.26, -0.325], [0.04, 0.7, 0.02, 0], [0.04, 0.7, 0.5, 0]]) box(door, 'cab_frame', [w, h, 0.025], '#c06d30', [x, y, 0]);
  const glass = box(door, 'cab_glass', [0.44, 0.6, 0.006], '#dfe9ea', [0.26, 0, 0.014]); glass.material = GLASS({ opacity: 0.3 });
  ball(door, 'cab_keyhole', 0.012, '#2a1d14', [0.48, 0, 0.02], [1, 1.4, 0.4]);
  const inside = bottles(3); inside.position.set(0, 0.03, -0.02); r.add(inside);
  r.setState = ({ open = false, bottles: b = true } = {}) => { door.rotation.y = open ? -1.8 : 0; inside.visible = !!b; };
  r.userData.door = door; r.setState();
  return r;
}

// ---------- 书桌：两只盒子（左边装针线）+ 一只小碗胡椒 ----------
function needleThread() {
  const r = group('p6_needle_thread');
  cyl(r, 'spool_wood', 0.016, 0.05, '#c7a273', [0, 0.025, 0], 12, FINE);
  cyl(r, 'spool_thread', 0.019, 0.034, '#a8302c', [0, 0.025, 0], 12, FINE);
  const n = cyl(r, 'needle', 0.0018, 0.07, '#cfd3d6', [0.03, 0.03, 0], 6, FINE); n.rotation.z = 0.5;
  return r;
}
function pepperBowl() {
  const r = group('p6_pepper');
  const bowl = add(r, new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 8, 0, 2 * PI, PI / 2, PI / 2), toon('#e6e0d5', { side: THREE.DoubleSide, ...FINE })), 'pepper_bowl', [0, 0.045, 0]);
  bowl.scale.y = 0.6;
  for (let i = 0; i < 14; i++) { const a = i * 2.4, d = 0.012 + (i % 4) * 0.007; ball(r, 'pepper_corn', 0.006, '#2e2623', [Math.cos(a) * d, 0.03 + (i % 3) * 0.003, Math.sin(a) * d], [1, 1, 1], FINE); }
  return r;
}
function desk() {
  const r = group('p6_desk');
  box(r, 'desk_top', [1.1, 0.05, 0.55], WOOD, [0, 0.76, 0]);
  for (const x of [-0.5, 0.5]) for (const z of [-0.23, 0.23]) box(r, 'desk_leg', [0.05, 0.74, 0.05], WOOD_DARK, [x, 0.37, z]);
  box(r, 'desk_drawer', [1.0, 0.12, 0.5], '#7a5236', [0, 0.67, 0]);
  const lids = [];
  for (const [i, x] of [[0, -0.27], [1, 0.27]]) {
    box(r, 'desk_box', [0.42, 0.16, 0.3], '#6a4a35', [x, 0.865, -0.05]);
    box(r, 'desk_box_inner', [0.38, 0.01, 0.26], '#2d241d', [x, 0.94, -0.05]);
    const lid = new THREE.Group(); lid.name = `desk_lid_${i}`; lid.position.set(x, 0.945, -0.2); r.add(lid);
    box(lid, 'desk_lid', [0.43, 0.02, 0.31], '#57392a', [0, 0.01, 0.155]);
    lids.push(lid);
  }
  const needle = needleThread(); needle.position.set(-0.27, 0.945, -0.05); needle.rotation.z = PI / 2; r.add(needle);
  r.userData = { ...r.userData, lids, needle };
  r.setState = ({ open = false, needle: nd = true } = {}) => { lids[0].rotation.x = open ? -1.9 : 0; needle.visible = open && !!nd; };
  r.setState();
  return r;
}

// ---------- 病床、凳子、小圆桌 ----------
function bed() {
  const r = group('p6_bed');
  box(r, 'bed_frame', [0.85, 0.12, 2.05], '#a99f92', [0, 0.36, 0]);
  for (const x of [-0.38, 0.38]) for (const z of [-0.95, 0.95]) box(r, 'bed_leg', [0.07, 0.32, 0.07], '#8a8176', [x, 0.16, z]);
  box(r, 'bed_mattress', [0.8, 0.1, 1.98], '#d9d4ca', [0, 0.47, 0]);
  ball(r, 'bed_pillow', 0.2, '#ece7dd', [0, 0.56, -0.82], [1.6, 0.4, 0.8]);
  box(r, 'bed_blanket', [0.82, 0.04, 0.9], '#a33b2e', [0, 0.53, 0.52]);
  return r;
}
function stool() {
  const r = group('p6_stool');
  cyl(r, 'stool_seat', 0.17, 0.04, WOOD, [0, 0.43, 0], 16);
  for (let i = 0; i < 3; i++) { const a = i * 2 * PI / 3; const l = cyl(r, 'stool_leg', 0.018, 0.44, WOOD_DARK, [Math.cos(a) * 0.12, 0.21, Math.sin(a) * 0.12], 6); l.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12); }
  return r;
}
function roundTable() {
  const r = group('p6_round_table');
  cyl(r, 'table_top', 0.33, 0.04, WOOD, [0, 0.72, 0], 28);
  cyl(r, 'table_stem', 0.04, 0.68, WOOD_DARK, [0, 0.36, 0], 10);
  cyl(r, 'table_foot', 0.2, 0.04, WOOD_DARK, [0, 0.02, 0], 18);
  return r;
}

// ---------- 量瓶：6 道刻度，一次倒一层；配好整瓶变绿 ----------
function flask() {
  const r = group('p6_flask');
  const H = 0.2, R = 0.055, LH = H * 0.8 / 6;
  cyl(r, 'flask_body', R, H, '#dfe9ea', [0, H / 2, 0], 24).material = GLASS();
  cyl(r, 'flask_neck', 0.022, 0.06, '#dfe9ea', [0, H + 0.03, 0], 16).material = GLASS();
  ring(r, 'flask_lip', 0.024, 0.005, '#cfd8d9', [0, H + 0.06, 0], FINE).rotation.x = PI / 2;
  for (let i = 1; i <= 6; i++) box(r, 'flask_mark', [0.028, 0.003, 0.002], '#b2433b', [-0.01, 0.008 + i * LH, R + 0.001]);
  const layers = [];
  for (let i = 0; i < 6; i++) { const l = cyl(r, 'flask_layer', R - 0.006, LH * 0.98, '#ffffff', [0, 0.008 + LH * (i + 0.5), 0], 24, FINE); l.visible = false; layers.push(l); }
  r.setLayers = (list = [], medicine = false) => {
    layers.forEach((l, i) => {
      l.visible = medicine || i < list.length;
      l.material.color.set(medicine ? HUMOR_COLOR.medicine : HUMOR_COLOR[list[i]] || '#ffffff');
    });
  };
  r.userData.layers = layers;
  return r;
}

// ---------- CURE 书（合着放在桌上；内容用 ui.doc 显示） ----------
function book() {
  const r = group('p6_book');
  box(r, 'book_cover', [0.2, 0.035, 0.26], '#6b3d2c', [0, 0.0175, 0]);
  box(r, 'book_pages', [0.19, 0.028, 0.25], '#efe6d2', [0.004, 0.0175, 0]);
  add(r, label('CURE', 0.14, 0.04, { color: '#e2c88a' }), 'book_title', [0, 0.036, 0]).rotation.x = -PI / 2;
  return r;
}

// ---------- 病人的胸口：疹子 + 静脉、×、切口、心、空洞、发条心、缝线 ----------
// 面板法线朝 +Y，头朝 -Z；章节把它挂到躺着的病人身上。
function chest() {
  const r = group('p6_chest');
  const skin = ball(r, 'chest_skin', 0.24, '#ddd5c8', [0, -0.02, 0.02], [1, 0.12, 1.15]);
  skin.material = toon('#e4d6c4');
  const at = (b) => [b.x, 0.012, -b.y + 0.04];
  const veins = new THREE.Group(); veins.name = 'chest_veins'; r.add(veins);
  for (const [a, b] of BOIL_EDGES) rod(veins, new THREE.Vector3(...at(BOILS[a])).setY(0.009), new THREE.Vector3(...at(BOILS[b])).setY(0.009), 0.0018, '#b65a55');
  const boils = BOILS.map((b, i) => {
    const g = new THREE.Group(); g.name = `chest_boil_${i}`; g.position.fromArray(at(b)); r.add(g);
    const bump = ball(g, 'boil_bump', 0.016, BOIL_COLOR_HEX[b.c], [0, 0.004, 0], [1, 0.6, 1], FINE);
    const burst = ring(g, 'boil_burst', 0.014, 0.004, '#a3282a', [0, 0.003, 0], FINE); burst.rotation.x = PI / 2;
    const hit = hitBox(g, 'boil_hit', [0.042, 0.03, 0.042]);
    g.userData = { bump, burst, hit };
    return g;
  });
  const mark = new THREE.Group(); mark.name = 'chest_cross'; mark.position.set(0.03, 0.012, 0.0); r.add(mark);
  for (const s of [-1, 1]) box(mark, 'cross_bar', [0.08, 0.002, 0.008], '#a3282a', [0, 0, 0]).rotation.y = s * PI / 4;
  const crossHit = hitBox(mark, 'cross_hit', [0.1, 0.02, 0.1]);
  const slit = box(r, 'chest_slit', [0.012, 0.004, 0.12], '#5e1414', [0.03, 0.012, 0]);
  const heart = ball(r, 'chest_heart', 0.038, '#9b2a2a', [0.03, 0.02, 0], [1, 0.8, 1.2], FINE);
  const hole = ball(r, 'chest_hole', 0.05, '#7a1214', [0.03, 0.006, 0], [0.8, 0.12, 1.3]);
  const cheart = clockHeart(); cheart.name = 'chest_clock_heart'; cheart.position.set(0.03, 0.0, 0.01); cheart.rotation.x = -PI / 2; cheart.scale.setScalar(0.8); r.add(cheart);
  const stitches = new THREE.Group(); stitches.name = 'chest_stitches'; r.add(stitches);
  for (let i = 0; i < 6; i++) box(stitches, 'stitch', [0.04, 0.003, 0.004], '#231c18', [0.03, 0.016, -0.06 + i * 0.024]).rotation.y = (i % 2 ? 0.5 : -0.5);
  box(stitches, 'stitch_line', [0.004, 0.003, 0.13], '#7a2a24', [0.03, 0.015, 0]);
  r.userData = { ...r.userData, boils, cross: mark, crossHit, heart, hole, slit, clockHeart: cheart };
  r.setState = ({ popped = [], done = false, cut = false, heartTaken = false, clock = false, sewn = false } = {}) => {
    const set = new Set(popped);
    boils.forEach((g, i) => {
      g.visible = !done;
      g.userData.bump.scale.set(1, set.has(i) ? 0.12 : 0.6, 1);
      g.userData.burst.visible = set.has(i);
    });
    veins.visible = !done;
    mark.visible = done && !cut;
    slit.visible = cut && !heartTaken;
    heart.visible = cut && !heartTaken;
    hole.visible = heartTaken && !clock;
    cheart.visible = clock;
    stitches.visible = sewn;
  };
  r.setState();
  return r;
}

// ---------- 病人的嘴（特写台面，放大的牙齿模型）：上下各 8 颗 ----------
// 缺口形状 0–3 画成牙尖上的小三角：0 左、1 中、2 右、3 两个。上下形状相同才咬合。
function toothShape(g, type, up, w) {
  const xs = type === 0 ? [-w * 0.25] : type === 1 ? [0] : type === 2 ? [w * 0.25] : [-w * 0.22, w * 0.22];
  for (const x of xs) {
    const tip = add(g, new THREE.Mesh(new THREE.ConeGeometry(w * 0.2, w * 0.4, 3), toon(up ? '#d9cfba' : '#4a3029')), 'tooth_notch', [x, up ? -w * 0.62 : w * 0.46, w * 0.27]);
    tip.rotation.z = up ? PI : 0;
  }
}
function markTex(text) { return tex(128, 128, (g) => { g.fillStyle = '#1b1414'; g.font = 'bold 110px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 70); }); }
function mouth() {
  const r = group('p6_mouth');
  const W = 0.16, GAP = 0.18;
  ball(r, 'mouth_face', 1.2, '#cbbba6', [0, 0, -0.55], [1.2, 0.8, 0.4]).material = flat('#c9b9a4');
  ball(r, 'mouth_cavity', 0.82, '#3a2522', [0, 0, -0.2], [1, 0.38, 0.2]).material = unlit('#33211e');
  for (const [y, s] of [[0.36, 1], [-0.36, -1]]) ball(r, 'mouth_lip', 0.86, '#b88e7c', [0, y, -0.12], [1.02, 0.12, 0.18]);
  for (const s of [-1, 1]) { const m = ball(r, 'mouth_mustache', 0.5, '#6e4a2c', [s * 0.42, 0.56, -0.02], [1, 0.22, 0.25]); m.rotation.z = -s * 0.25; }
  const upper = [], lower = [];
  for (let i = 0; i < 8; i++) {
    const x = (i - 3.5) * GAP;
    const u = new THREE.Group(); u.name = `tooth_up_${i}`; u.position.set(x, 0.17, 0); r.add(u);
    box(u, 'tooth_body', [W, W * 1.3, W * 0.5], '#efe9dc', [0, 0, 0]);
    toothShape(u, TOOTH_UPPER[i], true, W);
    upper.push(u);
    const l = new THREE.Group(); l.name = `tooth_slot_${i}`; l.position.set(x, -0.17, 0); r.add(l);
    lower.push(l);
  }
  const marks = { x: plane(r, 'mark_x', 0.1, 0.1, markTex('×'), [0, 0, 0.13]), dots: plane(r, 'mark_dots', 0.1, 0.1, markTex('∶'), [0, 0, 0.13]) };
  const st = { order: null, selected: null, done: false };
  const build = () => {
    lower.forEach((slot, i) => {
      clear(slot);
      const shape = st.order[i];
      box(slot, 'tooth_body', [W, W * 1.3, W * 0.5], i === st.selected ? '#f7e7a8' : '#e2dccd', [0, 0, 0]);
      toothShape(slot, shape, false, W);
      hitBox(slot, 'tooth_hit', [GAP * 0.95, W * 1.6, W * 0.8]);
      slot.position.y = st.done ? -0.085 : i === st.selected ? -0.13 : -0.17;
    });
    upper.forEach((u) => { u.position.y = st.done ? 0.085 : 0.17; });
    marks.x.visible = marks.dots.visible = st.done;
    marks.x.position.set(lower[TOOTH_MARKS.x].position.x, lower[TOOTH_MARKS.x].position.y, W * 0.27);
    marks.dots.position.set(upper[TOOTH_MARKS.dots].position.x, upper[TOOTH_MARKS.dots].position.y, W * 0.27);
  };
  r.setState = (order, selected = null, done = false) => { st.order = [...order]; st.selected = selected; st.done = !!done; build(); };
  r.userData = { ...r.userData, upper, lower, state: st };
  r.setState([0, 2, 1, 3, 0, 1, 3, 2]);
  return r;
}

// ---------- 字母箱：4 个转盘 ----------
function dialTexture() {
  // 圆柱的 u 绕着转轴走：字母沿 u 排开，并顺时针转 90°，转到正面时才是正的
  return tex(1024, 128, (g, w, h) => {
    const N = TRUNK_LETTERS.length;
    g.fillStyle = '#efe4c8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3b2a20'; g.font = 'bold 96px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < N; i++) {
      g.save(); g.translate((i + 0.5) * w / N, h / 2); g.rotate(PI / 2); g.fillText(TRUNK_LETTERS[i], 0, 6); g.restore();
      g.fillRect((i + 1) * w / N - 2, 8, 3, h - 16);
    }
  });
}
function trunk() {
  const r = group('p6_trunk');
  box(r, 'trunk_body', [0.8, 0.42, 0.45], '#7b5236', [0, 0.21, 0]);
  const lid = new THREE.Group(); lid.name = 'trunk_lid'; lid.position.set(0, 0.42, -0.225); r.add(lid);
  box(lid, 'trunk_lid_top', [0.82, 0.08, 0.47], '#6a442c', [0, 0.04, 0.225]);
  box(r, 'trunk_panel', [0.56, 0.16, 0.02], '#5a3a26', [0, 0.25, 0.23]);
  const dials = [], N = TRUNK_LETTERS.length;
  for (let i = 0; i < 4; i++) {
    const d = new THREE.Group(); d.name = `trunk_dial_${i}`; d.position.set(-0.195 + i * 0.13, 0.25, 0.23); r.add(d);
    const map = dialTexture();
    const c = add(d, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, N * 4, 1, true), toon('#ffffff', { map, ...FINE })), 'dial_drum', [0, 0, 0]);
    c.rotation.z = PI / 2;
    hitBox(d, 'dial_hit', [0.11, 0.12, 0.1], [0, 0, 0.03]);
    d.userData.drum = c; dials.push(d);
  }
  r.setLetters = (letters) => letters.forEach((n, i) => { dials[i].userData.drum.rotation.x = (n - 0.5) * 2 * PI / N; });
  r.setOpen = (on) => { lid.rotation.x = on ? -1.6 : 0; };
  r.userData.dials = dials; r.setLetters([0, 0, 0, 0]);
  return r;
}

// ---------- 回忆：拱窗远山的小房间 ----------
function memoryRoom() {
  const r = group('p6_memory');
  box(r, 'mem_wall', [6, 3.4, 0.1], '#d9d2c4', [0, 1.7, -1.6]).material = flat('#d4ccbd');
  box(r, 'mem_floor', [6, 0.05, 4], '#8f8a80', [0, -0.025, 0]).material = flat('#8a857b');
  const sky = tex(512, 384, (g, w, h) => { g.fillStyle = '#b9cbd6'; g.fillRect(0, 0, w, h); g.fillStyle = '#8f98a3'; g.beginPath(); g.moveTo(0, h * 0.8); for (let x = 0; x <= w; x += 32) g.lineTo(x, h * (0.55 + 0.15 * Math.sin(x * 0.03))); g.lineTo(w, h); g.lineTo(0, h); g.fill(); });
  plane(r, 'mem_window', 1.2, 1.4, sky, [1.2, 1.9, -1.54], { transparent: false });
  box(r, 'mem_window_frame', [1.3, 0.08, 0.06], '#4a3a2c', [1.2, 1.2, -1.53]);
  box(r, 'mem_table', [0.7, 0.72, 0.5], '#8a6040', [-0.4, 0.36, -0.6]);
  const light = new THREE.PointLight('#fff3dd', 2.2, 7); light.position.set(0, 2.6, 1); r.add(light);
  return r;
}

// ---------- 结尾的画（第六、七灾共用写法）：画中瘟疫退去，框出下一灾 ----------
export function plaguePainting(name, { plague, next }) {
  const r = group(name), st = { lit: 0, cleared: 0, framed: 0 }, texture = canvasTexture(640, 560, () => {}, { wrap: false });
  box(r, 'painting_frame', [0.48, 0.42, 0.025], '#e2dfd1', [0, 0.21, 0]);
  add(r, new THREE.Mesh(new THREE.PlaneGeometry(0.43, 0.37), unlit('#ffffff', { map: texture })), 'painting_picture', [0, 0.21, 0.016]);
  const draw = () => {
    const g = texture.image.getContext('2d');
    g.fillStyle = '#c9d6d2'; g.fillRect(0, 0, 640, 560);
    g.fillStyle = '#a6a580'; g.beginPath(); g.moveTo(0, 190); g.lineTo(110, 50); g.lineTo(230, 180); g.lineTo(375, 80); g.lineTo(640, 190); g.fill();
    g.fillStyle = '#c7cfc7'; g.fillRect(0, 190, 640, 160);
    g.fillStyle = '#9f9d6c'; g.beginPath(); g.ellipse(325, 380, 300, 170, 0, 0, 2 * PI); g.fill();
    for (let i = 0; i < 24; i++) { const a = i * PI / 12; g.fillStyle = i % 2 ? '#424c32' : '#5b6040'; const x = 320 + Math.cos(a) * 245, y = 340 + Math.sin(a) * 105; g.beginPath(); g.moveTo(x, y - 65); g.lineTo(x - 17, y + 6); g.lineTo(x + 17, y + 6); g.fill(); }
    plague(g, 1 - st.cleared);
    const glow = g.createRadialGradient(345, 422, 10, 345, 422, 125); glow.addColorStop(0, `rgba(255,255,222,${st.lit})`); glow.addColorStop(1, 'rgba(255,255,222,0)');
    g.fillStyle = glow; g.fillRect(210, 290, 260, 260); g.fillStyle = st.lit ? '#fffde7' : '#171713'; g.fillRect(326, 401, 38, 38);
    next(g);
    if (st.framed) { g.strokeStyle = '#fffbe8'; g.lineWidth = 6; g.strokeRect(427, 290, 70, 134 * st.framed); }
    texture.needsUpdate = true;
  };
  r.setState = ({ lit = false, cleared = false, framed = false } = {}) => { st.lit = +lit; st.cleared = +cleared; st.framed = +framed; draw(); };
  r.glowCube = () => animate(1200, (k) => { st.lit = k; draw(); }, Ease.inOutSine);
  r.clearPlague = () => animate(1600, (k) => { st.cleared = k; draw(); });
  r.frameNext = () => animate(900, (k) => { st.framed = k; draw(); });
  r.userData.state = st; r.setState();
  return r;
}
// 第六灾的画：草地上一个满身红疹的人；下一灾（雹灾）是右边的一朵带冰雹的云
const p6Painting = () => plaguePainting('p6_painting', {
  plague: (g, k) => {
    g.fillStyle = '#e2ddc9'; g.fillRect(185, 360, 30, 70); g.beginPath(); g.arc(200, 345, 18, 0, 2 * PI); g.fill();
    g.fillStyle = `rgba(160,40,40,${k})`; for (const [x, y] of [[193, 372], [207, 390], [196, 410], [204, 352]]) { g.beginPath(); g.arc(x, y, 5, 0, 2 * PI); g.fill(); }
  },
  next: (g) => {
    g.fillStyle = '#8f949c'; for (const [x, y, rr] of [[450, 320, 20], [472, 312, 24], [492, 322, 18]]) { g.beginPath(); g.arc(x, y, rr, 0, 2 * PI); g.fill(); }
    g.fillStyle = '#f4f7fa'; for (const [x, y] of [[452, 360], [470, 380], [488, 356], [462, 404], [482, 398]]) { g.beginPath(); g.arc(x, y, 5, 0, 2 * PI); g.fill(); }
  },
});

// 门里瘟疫医生的脸卡（盖在天堂门上窗后面）：白色鸟嘴面具 + 圆眼镜
export function doctorFaceTexture() {
  return tex(256, 218, (g, w, h) => {
    g.fillStyle = '#1d1b1f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ece5d6'; g.beginPath(); g.ellipse(w * 0.42, h * 0.5, 70, 80, 0, 0, 2 * PI); g.fill();
    g.beginPath(); g.moveTo(w * 0.55, h * 0.45); g.lineTo(w * 0.98, h * 0.78); g.lineTo(w * 0.52, h * 0.7); g.closePath(); g.fill();
    g.strokeStyle = '#2a2523'; g.lineWidth = 5; g.stroke();
    for (const x of [0.32, 0.5]) { g.fillStyle = '#2b2a2c'; g.beginPath(); g.arc(w * x, h * 0.42, 16, 0, 2 * PI); g.fill(); g.fillStyle = '#9fb4b8'; g.beginPath(); g.arc(w * x - 4, h * 0.4, 5, 0, 2 * PI); g.fill(); }
    g.fillStyle = '#111'; g.fillRect(0, 0, w, h * 0.18);
  });
}

export const FACTORIES = {
  p6_skull: skull,
  p6_empty_bottle: () => vial(),
  p6_bottles: () => bottles(3),
  p6_blood: () => vial({ humor: 'blood' }),
  p6_tears: () => vial({ humor: 'tears' }),
  p6_snot: () => vial({ humor: 'snot' }),
  p6_saliva: () => vial({ humor: 'saliva' }),
  p6_medicine: () => vial({ humor: 'medicine' }),
  p6_mushroom: mushroom,
  p6_onion: () => onion({ leaves: false }),
  p6_onion_plant: () => onion({ leaves: true }),
  p6_pepper: pepperBowl,
  p6_needle_thread: needleThread,
  p6_stump: stump,
  p6_well: well,
  p6_cave: cave,
  p6_staff: staff,
  p6_clock: grandfatherClock,
  p6_clock_heart: clockHeart,
  p6_sick_heart: () => { const r = group('p6_sick_heart'); ball(r, 'sick_heart', 0.05, '#8f2a2a', [0, 0.05, 0], [1, 1.15, 0.85], FINE); for (const [x, y] of [[0.02, 0.07], [-0.025, 0.04], [0.01, 0.02]]) ball(r, 'sick_spot', 0.009, '#d79a5c', [x, y, 0.04], [1, 1, 0.4], FINE); return r; },
  p6_cabinet: cabinet,
  p6_desk: desk,
  p6_bed: bed,
  p6_stool: stool,
  p6_round_table: roundTable,
  p6_flask: flask,
  p6_book: book,
  p6_chest: chest,
  p6_mouth: mouth,
  p6_trunk: trunk,
  p6_memory: memoryRoom,
  p6_painting: p6Painting,
};
