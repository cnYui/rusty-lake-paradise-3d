// 第五灾的三个谜题场景，全是真正的 3D 摆设（不是平面题板）：
//   菜地：6×5 的垄土 + 木框 + 木牌上的红色刻痕（每列 / 每行要占几格）+ 会被举起、挪动的巨型蔬菜；
//   连线：立在地上的石灰板 + 铜钉（钉面上的小圆点数 = 要连几根线）+ 红绳；
// 牛皮斑点直接贴在 src/art/cow_model.js 的真实牛模型上。玩法真值由章节 flags 保存，这里只按传入状态显示。
import * as THREE from 'three';
import { toon, flat } from './materials.js';
import { animate, Ease } from '../core/tween.js';
import { PI, group, add, box, ball, cyl, ring, clear, rod } from './p5_kit.js';

const FINE = { outline: 0.003 };
const lerp = (a, b, k) => a + (b - a) * k;
const CELL_X = 0.72, CELL_Z = 0.62;
const at = (x, y) => [(x - 2.5) * CELL_X, 0.05, (y - 2) * CELL_Z];

// ---------- 菜地里的巨型蔬菜（尺寸按格子凑：南瓜 1×1，黄瓜 1×2，胡萝卜 1×3，土豆 2×1） ----------
function giant(type) {
  const g = group(`p5_${type}_giant`);
  if (type === 'pumpkin') {
    ball(g, 'giant_body', 0.29, '#e0a23a', [0, 0.22, 0], [1, 0.78, 1], FINE);
    for (let i = 0; i < 3; i++) { const rib = ball(g, 'giant_rib', 0.29, '#cf8d2b', [0, 0.22, 0], [0.16, 0.8, 1.01], { outline: false }); rib.rotation.y = i * PI / 3; }
    cyl(g, 'giant_stem', 0.03, 0.1, '#6d7b3d', [0, 0.46, 0], 8, FINE);
    const leaf = ball(g, 'giant_leaf', 0.1, '#6f9a4c', [0.1, 0.45, 0.04], [1.2, 0.2, 0.9], FINE); leaf.rotation.z = 0.3;
  } else if (type === 'cucumber') {
    const body = add(g, new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.62, 8, 16).rotateX(PI / 2), toon('#6f9c55', FINE)), 'giant_body', [0, 0.2, 0]);
    body.scale.set(1, 0.95, 1);
    for (const x of [-0.07, 0, 0.07]) box(g, 'giant_stripe', [0.012, 0.012, 0.72], '#a3c47c', [x, 0.2 + 0.19 * Math.sqrt(1 - (x / 0.2) ** 2) * 0.95, 0.0], null);
    ball(g, 'giant_flower', 0.05, '#e8d252', [0, 0.2, -0.53], [1, 1, 0.5], FINE);
  } else if (type === 'carrot') {
    const body = add(g, new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.72, 18).rotateX(PI / 2), toon('#d9822b', FINE)), 'giant_body', [0, 0.2, 0]);
    body.scale.y = 0.95;
    for (const z of [-0.3, 0.1, 0.5]) { const r = ring(g, 'giant_groove', 0.17 - (z + 0.9) * 0.05, 0.007, '#b9691f', [0, 0.2, z], { outline: false }); r.rotation.y = 0; }
    for (let i = 0; i < 3; i++) { const lf = add(g, new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 8).rotateX(-PI / 2), toon('#5f8f4a', FINE)), 'giant_leaf', [(i - 1) * 0.09, 0.3, -1.0]); lf.rotation.y = (i - 1) * 0.35; }
  } else {
    ball(g, 'giant_body', 1, '#b79c7e', [0, 0.2, 0], [0.64, 0.24, 0.27], FINE);
    for (const [x, z] of [[-0.3, 0.05], [-0.1, -0.1], [0.12, 0.08], [0.32, -0.04], [0.02, 0.0]]) ball(g, 'giant_eye', 0.018, '#6c5742', [x, 0.42, z], [1.3, 0.6, 1], { outline: false });
  }
  return g;
}

function tablet(g, name, p) {
  const t = group(name); t.position.fromArray(p); g.add(t);
  box(t, 'tablet_post', [0.04, 0.3, 0.04], '#6f5a3f', [0, 0.15, 0]);
  box(t, 'tablet_board', [0.42, 0.22, 0.035], '#d7c9a4', [0, 0.34, 0]).rotation.x = -0.2;
  const bars = group('tablet_bars'); bars.position.set(0, 0.34, 0.025); bars.rotation.x = -0.2; t.add(bars);
  t.userData.bars = bars; t.scale.setScalar(1.45);
  return t;
}
function setBars(t, n, ok) {
  const bars = t.userData.bars; clear(bars);
  if (!n) { ring(bars, 'tally_zero', 0.028, 0.008, ok ? '#4e7a3b' : '#b3382d', [0, 0, 0], { outline: false }); return; }
  for (let i = 0; i < n; i++) box(bars, 'tally', [0.024, 0.13, 0.014], ok ? '#4e7a3b' : '#b3382d', [(i - (n - 1) / 2) * 0.062, 0, 0], toon(ok ? '#4e7a3b' : '#b3382d', { outline: false }));
}

function makeField() {
  const root = group('p5_field');
  box(root, 'field_ground', [60, 0.1, 60], '#8b8973', [0, -0.28, 0], flat('#8b8973'));
  box(root, 'field_bed', [4.5, 0.2, 3.3], '#6f5738', [0, -0.05, 0.0]);
  for (const [w, d, x, z] of [[4.8, 0.14, 0, -1.7], [4.8, 0.14, 0, 1.7], [0.14, 3.54, -2.4, 0], [0.14, 3.54, 2.4, 0]]) box(root, 'field_frame', [w, 0.26, d], '#8d704a', [x, 0.02, z]);
  const cells = Array.from({ length: 30 }, (_, i) => {
    const [x, y, z] = at(i % 6, Math.floor(i / 6)), c = ball(root, `field_cell_${i}`, 1, '#a98652', [x, y, z], [0.35, 0.08, 0.3], { outline: false });
    ball(root, 'field_hole', 0.05, '#3d2e1c', [x, y + 0.075, z], [1, 0.16, 0.8], { outline: false });
    return c;
  });
  const colTablets = Array.from({ length: 6 }, (_, i) => tablet(root, 'field_col_tablet', [(i - 2.5) * CELL_X, 0, -2.0]));
  const rowTablets = Array.from({ length: 5 }, (_, i) => tablet(root, 'field_row_tablet', [-2.85, 0, (i - 2) * CELL_Z]));
  // 备用菜苗放在田前的小木盘里
  const restAt = (i) => [(i - 2.5) * 0.76, 0.05, 2.3];
  const trays = Array.from({ length: 6 }, (_, i) => {
    const p = restAt(i), t = box(root, `field_tray_${i}`, [0.68, 0.05, 0.64], '#d2bc92', [p[0], 0.025, p[2]]);
    for (const [w, d, x, z] of [[0.68, 0.04, 0, -0.32], [0.68, 0.04, 0, 0.32], [0.04, 0.64, -0.34, 0], [0.04, 0.64, 0.34, 0]]) box(t, 'tray_rim', [w, 0.07, d], '#a98d63', [x, 0.04, z]);
    return t;
  });
  const slots = Array.from({ length: 6 }, (_, i) => { const s = group(`field_plant_${i}`); s.position.fromArray(restAt(i)); s.scale.setScalar(0.45); root.add(s); return s; });
  const rake = group('field_rake'); rake.position.set(3.1, 0, 0.8); rake.rotation.y = -0.3; rake.scale.setScalar(1.4); root.add(rake);
  const handle = cyl(rake, 'rake_handle', 0.022, 1.5, '#8d704a', [0, 0.7, 0], 10); handle.rotation.z = 0.22;
  box(rake, 'rake_head', [0.06, 0.05, 0.62], '#6c6354', [-0.23, 0.05, 0]);
  for (let i = 0; i < 7; i++) box(rake, 'rake_tooth', [0.03, 0.12, 0.02], '#6c6354', [-0.23, -0.005, (i - 3) * 0.1]);
  root.userData = { cells, trays, slots, reset: rake, at, restAt };

  const st = { level: null };
  const glow = (slot, on) => slot.traverse((o) => { if (o.material?.emissive) o.material.emissive.set(on ? '#5b4a14' : '#000000'); });
  root.setState = (level, positions, selected, round, solved = false, { instant = false } = {}) => {
    const fresh = st.level !== level;
    if (fresh) {
      st.level = level;
      slots.forEach((s, i) => { clear(s); s.userData.token = (s.userData.token || 0) + 1; if (level.pieces[i]) s.add(giant(level.pieces[i].type)); });
    }
    const counts = { rows: Array(5).fill(0), cols: Array(6).fill(0) }, targets = { rows: Array(5).fill(0), cols: Array(6).fill(0) };
    cells.forEach((o) => { o.userData.piece = null; o.material.color.set('#a98652'); });
    level.pieces.forEach((piece, i) => {
      const [w, h] = piece.size, pos = positions[i], goal = level.solution[i], slot = slots[i], lift = selected === i ? 0.16 : 0;
      for (let y = goal[1]; y < goal[1] + h; y++) for (let x = goal[0]; x < goal[0] + w; x++) { targets.rows[y]++; targets.cols[x]++; }
      let target, scale;
      if (pos) {
        const [px, , pz] = at(pos[0] + (w - 1) / 2, pos[1] + (h - 1) / 2); target = [px, 0.08 + lift, pz]; scale = 1;
        for (let y = pos[1]; y < pos[1] + h; y++) for (let x = pos[0]; x < pos[0] + w; x++) { const cell = cells[y * 6 + x]; cell.userData.piece = i; cell.material.color.set(selected === i ? '#c9a766' : '#7f6a46'); counts.rows[y]++; counts.cols[x]++; }
      } else { const r = restAt(i); target = [r[0], 0.05 + lift, r[2]]; scale = 0.45; }
      glow(slot, selected === i);
      trays[i].material.color.set(selected === i ? '#d2b565' : '#d2bc92');
      const from = slot.position.toArray(), s0 = slot.scale.x;
      const moved = Math.hypot(from[0] - target[0], from[2] - target[2]) > 1e-3 || Math.abs(from[1] - target[1]) > 1e-3 || Math.abs(s0 - scale) > 1e-3;
      if (!moved) return;
      if (fresh || instant) { slot.position.fromArray(target); slot.scale.setScalar(scale); return; }
      const token = slot.userData.token = (slot.userData.token || 0) + 1, hop = Math.hypot(from[0] - target[0], from[2] - target[2]) > 1e-3 ? 0.35 : 0;
      animate(280, (k) => {
        if (slot.userData.token !== token) return;
        slot.position.set(lerp(from[0], target[0], k), lerp(from[1], target[1], k) + Math.sin(k * PI) * hop, lerp(from[2], target[2], k));
        slot.scale.setScalar(lerp(s0, scale, k));
      }, Ease.inOutSine).then(() => { if (slot.userData.token === token) { slot.position.fromArray(target); slot.scale.setScalar(scale); } });
    });
    trays.forEach((o, i) => { o.visible = i < level.pieces.length && !solved; });
    slots.forEach((s, i) => { s.visible = i < level.pieces.length; });
    rowTablets.forEach((t, i) => setBars(t, targets.rows[i], counts.rows[i] === targets.rows[i]));
    colTablets.forEach((t, i) => setBars(t, targets.cols[i], counts.cols[i] === targets.cols[i]));
    rake.visible = !solved;
  };
  return root;
}

// ---------- 林间连线：石灰板上的铜钉 + 红绳 ----------
function makeThreads() {
  const root = group('p5_constellation');
  box(root, 'thread_backdrop', [40, 14, 0.2], '#8b8878', [0, 4, -1.4], flat('#8b8878'));
  box(root, 'thread_ground', [40, 0.1, 14], '#9a9784', [0, -0.9, 5], flat('#9a9784'));
  box(root, 'thread_board', [7.2, 5.6, 0.24], '#e8e2d2', [0, 2, -0.12]);
  for (const [w, h, x, y] of [[7.5, 0.22, 0, 4.9], [7.5, 0.22, 0, -0.9], [0.22, 5.8, -3.65, 2], [0.22, 5.8, 3.65, 2]]) box(root, 'thread_frame', [w, h, 0.36], '#8d704a', [x, y, -0.08]);
  for (const x of [-2.7, 2.7]) box(root, 'thread_foot', [0.5, 0.16, 1.0], '#6f5a3f', [x, -0.82, 0.25]);
  const dots = Array.from({ length: 9 }, (_, i) => {
    const d = group(`thread_dot_${i}`);
    const body = cyl(d, 'node_body', 0.3, 0.14, '#d0c5a2', [0, 0, 0.07]); body.rotation.x = PI / 2;
    const rim = ring(d, 'node_rim', 0.3, 0.03, '#8c7a45', [0, 0, 0.14]);
    const sel = ring(d, 'thread_selected', 0.4, 0.035, '#a3423a', [0, 0, 0.12]); sel.visible = false;
    const pips = group('node_pips'); d.add(pips);
    Object.assign(d.userData, { body, sel, pips }); return d;
  });
  dots.forEach((d) => root.add(d));
  const lines = group('thread_lines'); root.add(lines);
  const rag = group('thread_reset'); rag.position.set(3.15, 0.55, 0.12); root.add(rag);
  ball(rag, 'rag_nail', 0.04, '#6c6354', [0, 0.35, 0.02]);
  box(rag, 'rag_cloth', [0.5, 0.62, 0.03], '#d6d0bf', [0, 0.02, 0.04]);
  box(rag, 'rag_fold', [0.5, 0.05, 0.05], '#bfb9a6', [0, -0.12, 0.06]);
  root.userData = { dots, reset: rag, lines };
  const pipSpots = (n) => n === 1 ? [[0, 0]] : Array.from({ length: n }, (_, k) => {
    const a = k * 2 * PI / n - PI / 2 + (n === 2 ? PI / 2 : 0), rad = n === 2 ? 0.1 : n <= 4 ? 0.12 : 0.15;
    return [Math.cos(a) * rad, Math.sin(a) * rad];
  });
  root.setState = (level, edges, selected, round, solved = false) => {
    clear(lines);
    const counts = Array(level.dots.length).fill(0), target = Array(level.dots.length).fill(0);
    level.edges.forEach(([a, b]) => { target[a]++; target[b]++; }); edges.forEach(([a, b]) => { counts[a]++; counts[b]++; });
    dots.forEach((d, i) => {
      d.visible = i < level.dots.length; if (!d.visible) return;
      d.position.set(level.dots[i][0], 2.35 + level.dots[i][1], 0.0);
      d.userData.body.material.color.set(counts[i] === target[i] ? '#9db88e' : '#d0c5a2');
      d.userData.sel.visible = selected === i;
      clear(d.userData.pips);
      pipSpots(target[i]).forEach(([x, y]) => ball(d.userData.pips, 'node_pip', 0.04, '#3b3223', [x, y, 0.15], [1, 1, 0.5], { outline: false }));
    });
    edges.forEach(([a, b]) => {
      const e = group('thread_edge'), pa = dots[a].position.clone().setZ(0.2), pb = dots[b].position.clone().setZ(0.2);
      rod(e, pa, pb, 0.03, '#b24a43', toon('#b24a43', { outline: false }));
      for (const p of [pa, pb]) ball(e, 'thread_knot', 0.06, '#9d3f39', p.toArray(), [1, 1, 0.7], { outline: false });
      lines.add(e);
    });
    rag.visible = !solved;
  };
  return root;
}

export const GARDEN_FACTORIES = { p5_field: makeField, p5_constellation: makeThreads };
