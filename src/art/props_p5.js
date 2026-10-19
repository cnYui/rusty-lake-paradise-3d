// 第五灾模型只呈现传入状态，玩法真值由章节的 flags 和 inventory 保存。
import * as THREE from 'three';
import { toon, flat, unlit, canvasTexture } from './materials.js';
import { animate, Ease } from '../core/tween.js';

const PI = Math.PI;
const COLORS = ['#7eacb4', '#d09cb9', '#d6b965', '#9273b6', '#9eae68'];
const VEG = { lettuce: '#6c9149', tomato: '#b84a36', cucumber: '#739458', carrot: '#cc873d', pumpkin: '#d3ac47', potato: '#bba283' };
const group = (name) => { const g = new THREE.Group(); g.name = name; return g; };
const add = (g, o, name, p = [0, 0, 0]) => { o.name = name; o.position.fromArray(p); g.add(o); return o; };
const box = (g, name, size, color, p = [0, 0, 0], mat = null) => add(g, new THREE.Mesh(new THREE.BoxGeometry(...size), mat || toon(color)), name, p);
const ball = (g, name, r, color, p, scale = [1, 1, 1]) => { const o = add(g, new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12), toon(color)), name, p); o.scale.fromArray(scale); return o; };
const cyl = (g, name, r, h, color, p, sides = 24) => add(g, new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, sides), toon(color)), name, p);
const ring = (g, name, r, tube, color, p) => add(g, new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 32), toon(color)), name, p);

function clear(g) {
  g.traverse((o) => { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach((m) => m.dispose()); });
  g.clear();
}

export function label(text, width = 2, height = 0.3, { color = '#352e29', background = null } = {}) {
  const texture = canvasTexture(1024, Math.max(64, Math.round(1024 * height / width)), () => {}, { wrap: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), unlit('#ffffff', { map: texture, transparent: true, side: THREE.DoubleSide }));
  mesh.setText = (value, tint = color) => {
    const c = texture.image, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    if (background) { g.fillStyle = background; g.fillRect(0, 0, c.width, c.height); }
    g.fillStyle = tint; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = Math.round(c.height * 0.68);
    g.font = `600 ${size}px "Microsoft YaHei", sans-serif`;
    while (g.measureText(String(value)).width > 990 && size > 22) { size -= 4; g.font = `600 ${size}px "Microsoft YaHei", sans-serif`; }
    g.fillText(String(value), c.width / 2, c.height / 2); texture.needsUpdate = true;
  };
  mesh.setText(text); return mesh;
}

function line(g, a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const o = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, d.length(), 8), unlit('#ae6561'));
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(o);
}

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
  const lesions = [[-0.85, 1.48, 0.44], [-0.45, 1.15, 0.52], [0.1, 1.62, 0.44], [0.58, 1.35, 0.5], [-0.35, 1.8, 0.25], [0.95, 1.4, 0.33]].map((p, i) => {
    ball(root, 'cow_patch', 0.26, '#704d2d', p, [0.8 + (i % 2) * 0.3, 1, 0.08]);
    return ball(root, 'cow_lesion', 0.065, COLORS[i % 5], [p[0], p[1], p[2] + 0.03]);
  });
  const wound = ball(root, 'cow_wound', 0.17, '#9e3a37', [0.1, 1.25, 0.55], [0.9, 1.2, 0.08]);
  const tail = cyl(root, 'cow_tail', 0.035, 0.9, '#776854', [-1.28, 0.95, 0]); tail.rotation.z = -0.2;
  root.setState = ({ cured = false, meat = false } = {}) => { lesions.forEach((o) => { o.visible = !cured; }); wound.visible = meat; };
  root.setState(); return root;
}

function makeSkin() {
  const root = group('p5_skin');
  box(root, 'skin_board', [6.3, 4.15, 0.1], '#e9e5dc', [0, 2.1, 0], unlit('#e9e5dc'));
  const positions = [[-2.3, 3.2], [-0.9, 3.65], [0.2, 3.3], [1.8, 3.5], [2.2, 2.2], [-1.8, 1.95], [-2.3, 0.9], [-0.6, 1.25], [0.9, 1.1], [1.8, 0.7]];
  const colors = [0, 1, 2, 3, 4, 2, 0, 4, 1, 3];
  const dots = positions.map(([x, y], i) => {
    ball(root, 'skin_patch', 0.44, '#704d2d', [x, y, 0.08], [0.9, 1.25, 0.06]);
    const d = ball(root, `skin_dot_${i}`, 0.18, COLORS[colors[i]], [x, y, 0.18]);
    const outline = ring(d, 'skin_selected', 0.24, 0.018, '#e3b95e', [0, 0, 0.03]); outline.visible = false; return d;
  });
  add(root, label('点出两颗同色斑点', 3.4, 0.27), 'skin_hint', [0, 0.22, 0.2]);
  root.userData.dots = dots;
  root.setState = (cleared = [], selected = null) => dots.forEach((d, i) => { d.visible = !cleared.includes(i); d.children[0].visible = selected === i; });
  return root;
}

function vegetable(type) {
  const root = group(`p5_${type}`), c = VEG[type] || '#a98464';
  if (type === 'lettuce') for (let i = 0; i < 6; i++) { const a = i * PI / 3; ball(root, 'lettuce_leaf', 0.19, i % 2 ? '#81a65c' : c, [Math.cos(a) * 0.15, 0.1, Math.sin(a) * 0.15], [1, 0.35, 0.75]); }
  else if (type === 'cucumber' || type === 'carrot') {
    const o = type === 'carrot' ? add(root, new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.62, 16), toon(c)), 'vegetable', [0, 0.13, 0]) : cyl(root, 'vegetable', 0.12, 0.6, c, [0, 0.13, 0]);
    o.rotation.x = PI / 2;
    if (type === 'carrot') ball(root, 'carrot_leaf', 0.08, '#65804b', [0, 0.16, 0.32]);
  } else { ball(root, 'vegetable', type === 'pumpkin' ? 0.2 : 0.17, c, [0, 0.14, 0], type === 'potato' ? [1.5, 0.75, 1] : [1, 0.85, 1]); cyl(root, 'stem', 0.025, 0.08, '#61734b', [0, 0.33, 0]); }
  return root;
}

function makeField() {
  const root = group('p5_field');
  box(root, 'field_soil', [5.15, 0.12, 3.8], '#ab8c63', [0, -0.1, 0], flat('#ab8c63'));
  const at = (x, y) => [(x - 2.5) * 0.72, 0.02, (y - 2) * 0.62];
  const cells = Array.from({ length: 30 }, (_, i) => box(root, `field_cell_${i}`, [0.68, 0.035, 0.58], '#b99d73', at(i % 6, Math.floor(i / 6)), flat('#b99d73')));
  const text = (value, w, h, p) => { const o = add(root, label(value, w, h), 'field_label', p); o.rotation.x = -PI / 2; return o; };
  const rows = Array.from({ length: 5 }, (_, i) => text('', 0.36, 0.26, [-2.65, 0.06, (i - 2) * 0.62]));
  const cols = Array.from({ length: 6 }, (_, i) => text('', 0.36, 0.26, [(i - 2.5) * 0.72, 0.06, -1.88]));
  const title = text('', 4.7, 0.3, [0, 0.06, -2.38]);
  const hint = text('点菜苗，再点左上角田格；红数是占格数', 5.0, 0.27, [0, 0.08, 2.85]);
  const reset = text('重新摆放', 1.25, 0.25, [0, 0.08, 3.25]);
  const trays = Array.from({ length: 6 }, (_, i) => box(root, `field_tray_${i}`, [0.65, 0.05, 0.62], '#d2bc92', [(i - 2.5) * 0.82, 0.02, 2.05]));
  const sizes = trays.map((_, i) => text('', 0.6, 0.2, [(i - 2.5) * 0.82, 0.07, 2.5]));
  const plants = group('field_plants'); root.add(plants); root.userData = { cells, trays, reset, at };
  root.setState = (level, positions, selected, round, solved = false) => {
    clear(plants);
    const counts = { rows: Array(5).fill(0), cols: Array(6).fill(0) }, targets = { rows: Array(5).fill(0), cols: Array(6).fill(0) };
    cells.forEach((o) => { o.userData.piece = null; o.material.color.set('#b99d73'); });
    level.pieces.forEach((piece, i) => {
      const [w, h] = piece.size, pos = positions[i], goal = level.solution[i];
      for (let y = goal[1]; y < goal[1] + h; y++) for (let x = goal[0]; x < goal[0] + w; x++) { targets.rows[y]++; targets.cols[x]++; }
      const v = vegetable(piece.type); plants.add(v);
      if (pos) {
        v.position.fromArray(at(pos[0] + (w - 1) / 2, pos[1] + (h - 1) / 2)); v.scale.set(w, 1, h * 0.8);
        for (let y = pos[1]; y < pos[1] + h; y++) for (let x = pos[0]; x < pos[0] + w; x++) { const cell = cells[y * 6 + x]; cell.userData.piece = i; cell.material.color.set(selected === i ? '#d2ba73' : '#879767'); counts.rows[y]++; counts.cols[x]++; }
      } else { v.position.set((i - 2.5) * 0.82, 0.1, 2.05); v.scale.setScalar(0.8); }
      trays[i].material.color.set(selected === i ? '#d2b565' : '#d2bc92');
      sizes[i].setText(`${w} × ${h}`);
    });
    trays.forEach((o, i) => { o.visible = i < level.pieces.length && !solved; });
    sizes.forEach((o, i) => { o.visible = i < level.pieces.length && !solved; });
    rows.forEach((o, i) => o.setText(`${targets.rows[i]}`, counts.rows[i] === targets.rows[i] ? '#536a42' : '#a23f35'));
    cols.forEach((o, i) => o.setText(`${targets.cols[i]}`, counts.cols[i] === targets.cols[i] ? '#536a42' : '#a23f35'));
    title.setText(solved ? '菜地已收获' : `菜地 · ${round + 1} / 3`);
    hint.setText(solved ? '番茄和黄瓜已经收入物品栏' : '点菜苗，再点左上角田格；红数是占格数'); reset.visible = !solved;
  }; return root;
}

function makeThreads() {
  const root = group('p5_constellation');
  box(root, 'thread_board', [7, 5.6, 0.1], '#e9e6dc', [0, 2, 0], unlit('#e9e6dc'));
  const dots = Array.from({ length: 9 }, (_, i) => {
    const d = ball(root, `thread_dot_${i}`, 0.24, '#c8c5a8', [0, 2, 0.15]);
    add(d, label('', 0.3, 0.28), 'degree_label', [0, 0, 0.25]);
    const r = ring(d, 'thread_selected', 0.31, 0.018, '#a3423a', [0, 0, 0.03]); r.visible = false; return d;
  });
  const lines = group('thread_lines'); root.add(lines);
  const title = add(root, label('', 4.5, 0.3), 'thread_title', [0, 4.45, 0.15]);
  const reset = add(root, label('重新连线', 1.5, 0.25), 'thread_reset', [0, -0.48, 0.15]);
  add(root, label('数字 = 连线数；连通所有点，重复连线可撤销', 6.2, 0.23), 'thread_hint', [0, -0.12, 0.15]);
  root.userData = { dots, reset, lines };
  root.setState = (level, edges, selected, round, solved = false) => {
    clear(lines);
    const counts = Array(level.dots.length).fill(0), target = Array(level.dots.length).fill(0);
    level.edges.forEach(([a, b]) => { target[a]++; target[b]++; }); edges.forEach(([a, b]) => { counts[a]++; counts[b]++; });
    dots.forEach((d, i) => { d.visible = i < level.dots.length; if (!d.visible) return; d.position.set(level.dots[i][0], 2.35 + level.dots[i][1], 0.16); d.material.color.set(counts[i] === target[i] ? '#87a27b' : '#d0c5a2'); d.children[0].setText(String(target[i])); d.children[1].visible = selected === i; });
    edges.forEach(([a, b]) => line(lines, dots[a].position.clone().setZ(0.11), dots[b].position.clone().setZ(0.11)));
    title.setText(solved ? '五组图案已解开' : `林间连线 · ${round + 1} / 5`); reset.visible = !solved;
  }; return root;
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

function makeKnife() { const r = group('p5_knife'); box(r, 'knife_blade', [0.6, 0.025, 0.16], '#c9ccc7', [0, 0.03, 0]); box(r, 'knife_handle', [0.28, 0.07, 0.14], '#774c2d', [0.43, 0.03, 0]); return r; }
function meat(cooked = false) {
  const root = group('p5_meat'); ball(root, 'meat_body', 0.3, cooked ? '#77503a' : '#ba7270', [0, 0.09, 0], [1.3, cooked ? 0.28 : 0.45, 1]);
  if (!cooked) for (const z of [-0.12, 0.03, 0.15]) box(root, 'meat_fat', [0.43, 0.015, 0.028], '#e2beb1', [0, 0.17, z]); return root;
}
function bun(top) {
  const r = group('p5_bun');
  if (top) { const b = add(r, new THREE.Mesh(new THREE.SphereGeometry(0.43, 24, 12, 0, 2 * PI, 0, PI / 2), toon('#cba160')), 'bun_top'); b.scale.y = 0.55; for (let i = 0; i < 9; i++) { const a = i * 2.4, d = 0.1 + (i % 3) * 0.09; ball(r, 'sesame', 0.025, '#ead6a2', [Math.cos(a) * d, 0.18, Math.sin(a) * d], [1, 0.3, 0.5]); } }
  else cyl(r, 'bun_bottom', 0.43, 0.11, '#cba160', [0, 0.055, 0]); return r;
}
function slice(type) {
  const r = group(`p5_${type}_slice`);
  if (type === 'tomato') { cyl(r, 'tomato_slice', 0.34, 0.045, '#b74232', [0, 0.025, 0]); for (let i = 0; i < 5; i++) { const a = i * 2 * PI / 5; ball(r, 'tomato_seed', 0.038, '#dda16d', [Math.cos(a) * 0.2, 0.052, Math.sin(a) * 0.2], [1, 0.2, 1]); } }
  else for (const x of [-0.15, 0.15]) { const d = cyl(r, 'cucumber_slice', 0.17, 0.035, '#477444', [x, 0.025, 0]); cyl(d, 'cucumber_middle', 0.13, 0.006, '#b4c185', [0, 0.021, 0]); } return r;
}
function burger({ layers = [] } = {}) {
  const r = group('p5_burger'); r.setLayers = (values) => {
    clear(r); values.forEach((type, i) => { let o; if (type.startsWith('bun_')) o = bun(type === 'bun_top'); else if (type === 'cooked_meat') o = meat(true); else if (type === 'cheese') { o = group('cheese'); box(o, 'cheese_slice', [0.72, 0.025, 0.62], '#dabb56'); } else if (type.endsWith('_slice')) o = slice(type.replace('_slice', '')); else o = vegetable(type); o.position.y = i * 0.1; r.add(o); }); r.userData.layers = [...values];
  }; r.setLayers(layers); return r;
}

function makePot() {
  const r = group('p5_pot'); cyl(r, 'stove', 0.58, 0.62, '#72726a', [0, 0.31, 0]);
  for (const x of [-0.28, 0, 0.28]) { const log = cyl(r, 'log', 0.07, 0.9, '#61503b', [x, 0.68, 0]); log.rotation.x = PI / 2; }
  for (const x of [-0.26, 0, 0.26]) add(r, new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 8), unlit('#dc702d')), 'flame', [x, 0.8, 0]);
  const pan = add(r, new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 0.1, 28), toon('#807a70')), 'pan', [0, 0.92, 0]); box(r, 'pan_handle', [0.65, 0.06, 0.12], '#6d6559', [0.7, 0.94, 0]);
  const food = meat(false); food.position.y = 0.99; r.add(food); r.userData.pan = pan;
  r.setState = (hasMeat, cooked, taken) => { food.visible = hasMeat && !taken; food.children[0].material.color.set(cooked ? '#77503a' : '#ba7270'); }; r.setState(false, false, false); return r;
}
function choppingBlock() { const r = group('p5_chopping_block'); cyl(r, 'chopping_top', 0.42, 0.4, '#9b7950', [0, 0.7, 0]); for (const [x, z] of [[-0.25, 0.15], [0.25, 0.15], [0, -0.25]]) cyl(r, 'block_leg', 0.045, 0.6, '#7c654b', [x, 0.3, z]); return r; }
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
  p5_cow: makeCow, p5_skin: makeSkin, p5_field: makeField, p5_constellation: makeThreads,
  p5_barrel: makeBarrel, p5_empty_bucket: () => makeBucket(false), p5_milk_bucket: () => makeBucket(true),
  p5_knife: makeKnife, p5_raw_meat: () => meat(false), p5_ground_meat: () => meat(false), p5_cooked_meat: () => meat(true),
  p5_cheese: () => { const r = group('p5_cheese'); box(r, 'cheese', [0.6, 0.04, 0.5], '#dabb56'); return r; },
  p5_lettuce: () => vegetable('lettuce'), p5_tomato: () => vegetable('tomato'), p5_cucumber: () => vegetable('cucumber'),
  p5_tomato_slice: () => slice('tomato'), p5_cucumber_slice: () => slice('cucumber'),
  p5_bun_bottom: () => bun(false), p5_bun_top: () => bun(true), p5_burger: burger,
  p5_pot: makePot, p5_chopping_block: choppingBlock, p5_dining_room: diningRoom, p5_menu: makeMenu,
  p5_plate: () => { const r = group('p5_plate'); cyl(r, 'plate', 0.62, 0.025, '#e7e3d6', [0, 0.015, 0]); const rim = ring(r, 'plate_rim', 0.58, 0.025, '#dad4c3', [0, 0.035, 0]); rim.rotation.x = PI / 2; return r; },
  p5_latrine: latrine, p5_memory_disk: memoryDisk, p5_memory: makeMemory, p5_painting: painting,
  p5_plant_pot: () => { const r = group('p5_plant_pot'); cyl(r, 'plant_pot', 0.22, 0.28, '#a98154', [0, 0.14, 0]); const v = vegetable('lettuce'); v.position.y = 0.3; r.add(v); return r; },
};
