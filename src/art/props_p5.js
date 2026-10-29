// 第五灾模型只呈现传入状态，玩法真值由章节的 flags 和 inventory 保存。
// 食材 / 餐具 / 厨房在 props_p5_food.js，菜地和连线在 props_p5_garden.js，牛斑点在 cow_model.js；这里放其余道具。
import * as THREE from 'three';
import { toon, flat, unlit, canvasTexture } from './materials.js';
import { animate, Ease } from '../core/tween.js';
import { getModel } from './rlpm.js';
import { makeCowModel, attachCowSpots } from './cow_model.js';
import { FOOD_FACTORIES, lettuce } from './props_p5_food.js';
import { GARDEN_FACTORIES } from './props_p5_garden.js';
import { PI, group, add, box, ball, cyl, ring, clear, label } from './p5_kit.js';

export { label };

// 没有网格牛时的程序化牛（接口和网格牛一样，斑点也贴在它的身上）
function makeCow() {
  const root = group('p5_cow');
  ball(root, 'cow_body', 1, '#e8e5d9', [0, 1.25, 0], [1.3, 0.72, 0.55]);
  ball(root, 'cow_neck', 0.5, '#e8e5d9', [1.05, 1.35, 0], [0.8, 1.3, 0.8]);
  ball(root, 'cow_head', 0.43, '#e8e5d9', [1.35, 1.9, 0.08], [0.65, 1.15, 0.75]);
  ball(root, 'cow_muzzle', 0.2, '#bda18c', [1.4, 1.66, 0.32], [1, 0.7, 0.7]);
  for (const x of [1.22, 1.53]) ball(root, 'cow_eye', 0.04, '#161713', [x, 1.98, 0.37]);
  for (const x of [1.17, 1.56]) {
    const horn = add(root, new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.38, 12), toon('#b7ac91')), 'cow_horn', [x, 2.3, 0]); horn.rotation.z = x < 1.3 ? 0.45 : -0.45;
    ball(root, 'cow_ear', 0.16, '#806345', [x < 1.3 ? 1 : 1.75, 2.05, 0], [1, 0.4, 0.6]);
  }
  for (const x of [-0.9, 0.85]) for (const z of [-0.34, 0.34]) { cyl(root, 'cow_leg', 0.09, 0.83, '#e8e5d9', [x, 0.47, z]); box(root, 'cow_hoof', [0.23, 0.12, 0.28], '#4c493e', [x, 0.07, z]); }
  ball(root, 'cow_udder', 0.22, '#cfac98', [-0.55, 0.64, 0], [1.4, 0.7, 1]);
  for (const x of [-0.7, -0.42]) cyl(root, 'cow_teat', 0.04, 0.15, '#cfac98', [x, 0.47, 0.12]);
  for (const p of [[-0.85, 1.48], [-0.45, 1.15], [0.1, 1.62], [0.58, 1.35], [-0.35, 1.8], [0.95, 1.4]]) ball(root, 'cow_patch', 0.26, '#704d2d', [p[0], p[1], 0.44], [0.8, 1, 0.08]);
  const tail = cyl(root, 'cow_tail', 0.035, 0.9, '#776854', [-1.28, 0.95, 0]); tail.rotation.z = -0.2;
  root.updateMatrixWorld(true);
  attachCowSpots(root, root.getObjectByName('cow_body'));
  return root;
}

function makeBucket(full = false) {
  const root = group('p5_bucket');
  add(root, new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.23, 0.4, 20, 1, true), toon('#aa8254', { side: THREE.DoubleSide })), 'bucket_body', [0, 0.2, 0]);
  for (const y of [0.05, 0.32]) { const r = ring(root, 'bucket_band', 0.26, 0.02, '#5c5144', [0, y, 0]); r.rotation.x = PI / 2; }
  const h = ring(root, 'bucket_handle', 0.25, 0.018, '#695a43', [0, 0.42, 0]); h.scale.y = 0.8;
  if (full) cyl(root, 'bucket_milk', 0.25, 0.02, '#eee9d5', [0, 0.34, 0]); return root;
}

function makeBarrel() {
  const root = group('p5_barrel'); cyl(root, 'barrel_body', 0.55, 0.7, '#a57f50', [0, 0.35, 0]);
  for (const y of [0.09, 0.38, 0.65]) { const r = ring(root, 'barrel_band', 0.56, 0.025, '#544c3e', [0, y, 0]); r.rotation.x = PI / 2; }
  const lid = cyl(root, 'barrel_lid', 0.5, 0.045, '#b79a6c', [-0.65, 0.35, 0]); lid.rotation.z = 1.2;
  const milk = cyl(root, 'barrel_milk', 0.51, 0.025, '#eee9d5', [0, 0.72, 0]); const cheese = box(root, 'barrel_cheese', [0.4, 0.1, 0.35], '#ddc270', [0, 0.78, 0]);
  root.setState = (filled, taken) => { milk.visible = filled; cheese.visible = filled && !taken; }; root.setState(false, false); return root;
}

function diningRoom() {
  const r = group('p5_dining_room'); box(r, 'dining_wall', [7, 4.4, 0.1], '#d2cfc0', [0, 2.2, -2], flat('#d2cfc0')); box(r, 'dining_floor', [8, 0.08, 7], '#87857a', [0, -0.08, 0], flat('#87857a'));
  const cloth = cyl(r, 'tablecloth', 1.72, 0.87, '#dedbd0', [0, 0.44, 0]); cloth.scale.z = 0.66; const top = cyl(r, 'table_top', 1.75, 0.05, '#eeece3', [0, 0.9, 0]); top.scale.z = 0.67; return r;
}
function makeMenu() {
  const r = group('p5_menu'); box(r, 'menu_board', [1.6, 2.0, 0.06], '#ae8b5f'); box(r, 'menu_paper', [1.46, 1.86, 0.01], '#ece3ca', [0, 0, 0.04], unlit('#ece3ca')); add(r, label('锈湖汉堡', 1.1, 0.18), 'menu_title', [0, 0.73, 0.06]);
  ['上层面包', '黄瓜片', '番茄片', '奶酪', '熟肉饼', '生菜', '下层面包'].forEach((name, i) => add(r, label(name, 1.1, 0.13), 'menu_layer', [0, 0.44 - i * 0.19, 0.06])); add(r, label('由下往上叠放 ↑', 1.2, 0.12), 'menu_hint', [0, -0.82, 0.06]); return r;
}
function latrine() {
  const r = group('p5_latrine'); box(r, 'latrine_back', [1.6, 2.4, 0.12], '#75624a', [0, 1.2, -1.3]); for (const x of [-0.8, 0.8]) box(r, 'latrine_side', [0.12, 2.4, 1.4], '#937651', [x, 1.2, -0.65]);
  for (const x of [-0.5, 0.5]) { const roof = box(r, 'latrine_roof', [1.1, 0.12, 1.65], '#765c41', [x, 2.55, -0.65]); roof.rotation.z = x > 0 ? -0.35 : 0.35; }
  const door = group('latrine_door'); door.position.set(-0.75, 0, 0.05); r.add(door); box(door, 'latrine_leaf', [1.5, 2.3, 0.1], '#a3845a', [0.75, 1.15, 0]); add(door, label('♥', 0.2, 0.2), 'latrine_heart', [0.75, 1.6, 0.07]); r.setOpen = (on) => { door.rotation.y = on ? -1.5 : 0; }; return r;
}
function memoryDisk() {
  const r = group('p5_memory_disk'); const disk = cyl(r, 'memory_disk', 0.48, 0.08, '#b39955', [0, 0, 0]); disk.rotation.x = PI / 2;
  for (let i = 0; i < 9; i++) { const a = i * 2 * PI / 9; ball(r, 'disk_hole', 0.035, '#383225', [Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0.07], [1, 1, 0.3]); } box(r, 'disk_cube_socket', [0.16, 0.16, 0.02], '#28271f', [0, 0, 0.06]); return r;
}
function makeMemory() {
  const r = group('p5_memory'); box(r, 'memory_wall', [6, 3.6, 0.1], '#584b35', [0, 1.8, -1.8], flat('#584b35'));
  ['牛 · 蛙 · 鸟 · 蛇', '生命来自湖，记忆留在湖', 'Ⅰ Ⅱ Ⅲ Ⅳ Ⅴ'].forEach((s, i) => add(r, label(s, 3.6, 0.22, { color: '#d2c6a2' }), 'memory_chalk', [0.4, 2.85 - i * 0.47, -1.72]));
  box(r, 'memory_altar', [0.9, 0.8, 0.65], '#8d8776', [-1.4, 0.4, -0.55]);
  add(r, new THREE.Mesh(new THREE.ConeGeometry(0.43, 1.4, 24), toon('#87573d')), 'memory_skirt', [0.8, 0.7, -0.6]);
  ball(r, 'memory_torso', 0.22, '#87573d', [0.8, 1.26, -0.6], [0.9, 1.1, 0.65]);
  ball(r, 'memory_hair', 0.2, '#3e3930', [0.8, 1.67, -0.64], [1.05, 1.13, 0.8]);
  ball(r, 'memory_head', 0.18, '#afc5bf', [0.8, 1.66, -0.55], [0.85, 1.05, 0.8]);
  for (const x of [0.745, 0.855]) ball(r, 'memory_eye', 0.018, '#353b32', [x, 1.69, -0.408]);
  ball(r, 'memory_nose', 0.025, '#9eafa3', [0.8, 1.64, -0.398], [0.6, 1.5, 0.6]);
  box(r, 'memory_mouth', [0.06, 0.008, 0.006], '#696454', [0.8, 1.585, -0.418]);
  for (const s of [-1, 1]) {
    const a = new THREE.Vector3(0.8 + s * 0.18, 1.4, -0.6), b = new THREE.Vector3(0.8 + s * 0.46, 1.62, -0.6), c = new THREE.Vector3(0.8 + s * 0.64, 1.98, -0.6);
    for (const [from, to] of [[a, b], [b, c]]) {
      const arm = cyl(r, 'memory_arm', 0.045, from.distanceTo(to), '#a9c0b9', from.clone().add(to).multiplyScalar(0.5).toArray());
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    }
    ball(r, 'memory_hand', 0.055, '#a9c0b9', c.toArray());
    cyl(r, 'memory_torch', 0.025, 0.38, '#cbb56e', [c.x, 1.98, -0.6]);
    add(r, new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 12), unlit('#e2b354')), 'memory_flame', [c.x, 2.25, -0.6]);
  }
  const light = new THREE.PointLight('#edc788', 3.5, 6); light.position.set(0.8, 2.5, 0.2); r.add(light); return r;
}
function painting() {
  const r = group('p5_painting'), st = { lit: 0, cleared: 0, framed: 0 }, texture = canvasTexture(640, 560, () => {}, { wrap: false });
  box(r, 'painting_frame', [0.48, 0.42, 0.025], '#e2dfd1', [0, 0.21, 0]); add(r, new THREE.Mesh(new THREE.PlaneGeometry(0.43, 0.37), unlit('#ffffff', { map: texture })), 'painting_picture', [0, 0.21, 0.016]);
  const draw = () => {
    const g = texture.image.getContext('2d'); g.fillStyle = '#c9d6d2'; g.fillRect(0, 0, 640, 560);
    g.fillStyle = '#a6a580'; g.beginPath(); g.moveTo(0, 190); g.lineTo(110, 50); g.lineTo(230, 180); g.lineTo(375, 80); g.lineTo(640, 190); g.fill(); g.fillStyle = '#c7cfc7'; g.fillRect(0, 190, 640, 160);
    g.fillStyle = '#9f9d6c'; g.beginPath(); g.ellipse(325, 380, 300, 170, 0, 0, 2 * PI); g.fill();
    for (let i = 0; i < 24; i++) { const a = i * PI / 12; g.fillStyle = i % 2 ? '#424c32' : '#5b6040'; const x = 320 + Math.cos(a) * 245, y = 340 + Math.sin(a) * 105; g.beginPath(); g.moveTo(x, y - 65); g.lineTo(x - 17, y + 6); g.lineTo(x + 17, y + 6); g.fill(); }
    g.fillStyle = '#e2ddc9'; g.beginPath(); g.ellipse(200, 410, 47, 24, 0, 0, 2 * PI); g.fill(); g.fillRect(225, 385, 20, 25); g.fillRect(170, 427, 7, 27); g.fillRect(218, 427, 7, 27);
    g.fillStyle = `rgba(145,47,43,${1 - st.cleared})`; for (const [x, y] of [[180, 400], [203, 419], [220, 403]]) { g.beginPath(); g.arc(x, y, 6, 0, 2 * PI); g.fill(); }
    const glow = g.createRadialGradient(345, 422, 10, 345, 422, 125); glow.addColorStop(0, `rgba(255,255,222,${st.lit})`); glow.addColorStop(1, 'rgba(255,255,222,0)'); g.fillStyle = glow; g.fillRect(210, 290, 260, 260); g.fillStyle = st.lit ? '#fffde7' : '#171713'; g.fillRect(326, 401, 38, 38);
    g.fillStyle = '#363429'; g.fillRect(445, 345, 21, 65); g.beginPath(); g.arc(456, 330, 14, 0, 2 * PI); g.fill(); g.fillStyle = '#a34c43'; for (const [x, y] of [[452, 360], [461, 378], [456, 398]]) { g.beginPath(); g.arc(x, y, 4, 0, 2 * PI); g.fill(); }
    if (st.framed) { g.strokeStyle = '#fffbe8'; g.lineWidth = 6; g.strokeRect(427, 303, 58, 121 * st.framed); } texture.needsUpdate = true;
  };
  r.setState = ({ lit = false, cleared = false, framed = false } = {}) => { st.lit = +lit; st.cleared = +cleared; st.framed = +framed; draw(); };
  r.glowCube = () => animate(1200, (k) => { st.lit = k; draw(); }, Ease.inOutSine); r.clearPlague = () => animate(1600, (k) => { st.cleared = k; draw(); }); r.frameBoils = () => animate(900, (k) => { st.framed = k; draw(); }); r.userData.state = st; r.setState(); return r;
}

export const FACTORIES = {
  p5_cow: () => { const m = getModel('cow'); return m ? makeCowModel(m) : makeCow(); },   // 有网格牛就用网格，否则程序化牛
  ...GARDEN_FACTORIES, ...FOOD_FACTORIES,
  p5_barrel: makeBarrel, p5_empty_bucket: () => makeBucket(false), p5_milk_bucket: () => makeBucket(true),
  p5_dining_room: diningRoom, p5_menu: makeMenu,
  p5_latrine: latrine, p5_memory_disk: memoryDisk, p5_memory: makeMemory, p5_painting: painting,
  p5_plant_pot: () => { const r = group('p5_plant_pot'); cyl(r, 'plant_pot', 0.13, 0.18, '#a98154', [0, 0.09, 0]); const v = lettuce(); v.position.y = 0.17; r.add(v); return r; },
};
