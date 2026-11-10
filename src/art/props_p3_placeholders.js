// 第三灾道具占位：正式模型（props_p3_beach / forest / house / grove）还没写好的 id，props.js 用这里的占位顶上，
// 让章节逻辑可以先按 docs/plague3_api.md 开发、游戏不因缺模型报错。正式工厂一旦存在，占位自动不再使用。
// 占位 = 一个按大致尺寸的半透明盒子 + 接口里写到的子物体名（点击盒）+ 全部状态方法（no-op，返回 Promise），
// setState / getState 只记住传入的状态。
import { THREE, group, mesh, hit, umat } from './props_p3_shared.js';

const SPECS = {
  // 海滩 / 湖岸 / 神殿
  p3_symbol_rock: { size: [0.8, 0.42, 0.6], color: '#a3a6a5', hits: ['rock_hit'], anchors: { swatter_spot: [-0.32, 0.2, 0.18], mussel_spot: [0.22, 0.36, 0.05] } },
  p3_mussel_shell: { size: [0.12, 0.05, 0.07], color: '#4b3343', hits: ['mussel_hit'], methods: ['open', 'take'] },
  p3_dig_x: { size: [0.6, 0.02, 0.4], color: '#8f8060', hits: ['dig_hit'], anchors: { box_spot: [0.5, 0, 0] }, methods: ['dig'] },
  p3_slider_box: { size: [0.56, 0.14, 0.46], color: '#b97a62', hits: ['slider_box_hit', 'slider_latch_hit', 'slider_bulb_hit', ...Array.from({ length: 26 }, (_, i) => `slider_cell_${i}`)], methods: ['setBoard', 'slide', 'solve', 'open', 'takeBulb'], extra: { cellWorld: () => new THREE.Vector3() } },
  p3_stump: { size: [0.36, 0.55, 0.36], color: '#8b5a2b', hits: ['stump_hit', 'stump_axe_hit', 'stump_snail_hit', 'stump_symbol_hit'], methods: ['takeAxe', 'takeSnail', 'hit', 'setCrack'] },
  p3_sill_plate: { size: [0.18, 0.03, 0.18], color: '#eeeeea', hits: ['plate_hit'], methods: ['setFlowers'] },
  p3_parrot: { size: [0.14, 0.3, 0.14], color: '#8f9294', hits: ['parrot_hit'], methods: ['setVisible'] },
  // 森林
  p3_flytrap: { size: [0.6, 0.8, 0.5], color: '#93b553', hits: ['flytrap_hit', 'trap_0', 'trap_1', 'trap_2', 'trap_3', 'flytrap_flower_hit'], methods: ['feed', 'setFed', 'bloom', 'takeFlower'] },
  p3_x_tree: { size: [1.4, 9, 1.4], color: '#6d675d', hits: ['x_tree_hit', 'x_mark'], methods: ['chop', 'fell'] },
  p3_clay_mound: { size: [0.7, 0.25, 0.5], color: '#9a6440', hits: ['mound_hit', 'clay_0_hit', 'clay_1_hit'], methods: ['dig', 'takeClay'] },
  p3_beehive: { size: [0.5, 0.75, 0.45], color: '#d6b864', hits: ['hive_hit', 'hive_honey_hit', ...Array.from({ length: 7 }, (_, i) => `hive_hole_${i}`)], methods: ['releaseBee', 'recallBees', 'flashHole', 'drip', 'takeHoney'], hang: true },
  // 小屋
  p3_jar_table: { size: [0.55, 0.62, 0.38], color: '#6e4433', hits: ['jar_table_hit'], anchors: { jar_spot: [0, 0.62, 0] } },
  p3_bell_jar: { size: [0.32, 0.45, 0.24], color: '#d8e4e6', hits: ['jar_dome_hit', 'jar_pot_hit', 'jar_flower_hit'], methods: ['setDome', 'plant', 'grow', 'harvest'] },
  p3_pottery_wheel: { size: [0.8, 0.72, 0.6], color: '#b39a78', hits: ['wheel_hit', 'pot_seg_0_hit', 'pot_seg_1_hit', 'pot_seg_2_hit'], methods: ['setClay', 'setShape', 'poke', 'spin', 'finish'] },
  p3_vase_drawing: { size: [0.36, 0.8, 0.01], color: '#e6e1d6', hits: [] },
  // 白桦林
  p3_grove_set: { size: [16, 0.1, 14], color: '#a6a99a', hits: [], anchors: { grove_entry: [0, 0, 5], grove_table: [-1.6, 0, -3.2], grove_larva: [-1.3, 0, -2.4], grove_shrine: [1.5, 0, -6.2], grove_berries: [2.6, 0, -1.6], grove_tap_birch: [-3.2, 0, -1.2], grove_plant: [3.2, 0, -0.5] }, lights: true },
  p3_birch: { size: [0.3, 7, 0.3], color: '#eeeeea', hits: [] },
  p3_birch_tap: { size: [0.3, 3, 0.3], color: '#eeeeea', hits: ['tap_hit', 'tap_jug_hit', 'cocoon_hit'], methods: ['tap', 'fill', 'takeJug', 'showCocoon', 'hatch'] },
  p3_berry_bush: { size: [0.6, 0.4, 0.5], color: '#4e7a2e', hits: ['berry_hit'], methods: ['pick'] },
  p3_shrine: { size: [1.3, 2.6, 0.5], color: '#c9cdcc', hits: ['shrine_slot_0', 'shrine_slot_1', 'shrine_slot_2', 'shrine_portrait_hit', 'shrine_cube_hit'], methods: ['setVase', 'setFlower', 'setPortrait', 'gnatsToPortrait', 'drawFrame', 'showCube', 'takeCube'] },
  p3_grove_table: { size: [0.8, 0.75, 0.8], color: '#a0805e', hits: ['table_hit', 'table_bowl_hit', 'table_cup_hit', 'table_plate_hit'], methods: ['setBerries', 'setSap', 'setHoney'] },
  p3_larva: { size: [1.4, 0.45, 0.45], color: '#c9b99a', hits: ['larva_body_hit', 'larva_mouth_hit', 'larva_bulb_hit'], methods: ['setGnats', 'clearGnats', 'spit', 'takeBulb'], extra: { coverPoints: () => [] } },
  p3_grove_portal: { size: [3, 4, 0.5], color: '#e9ece6', hits: ['portal_hit'] },
};

function placeholder(id, spec) {
  const root = group(id);
  const [w, h, d] = spec.size;
  const body = mesh(root, new THREE.BoxGeometry(w, h, d), umat(spec.color, { transparent: true, opacity: 0.55 }), `${id}_placeholder`, [0, spec.hang ? -h / 2 : h / 2, 0]);
  body.raycast = () => {};
  for (const name of spec.hits || []) hit(root, name, [w, h, d], [0, spec.hang ? -h / 2 : h / 2, 0]);
  for (const [name, pos] of Object.entries(spec.anchors || {})) { const o = new THREE.Object3D(); o.name = name; o.position.fromArray(pos); root.add(o); }
  if (spec.lights) { root.add(new THREE.HemisphereLight('#f4f1e8', '#5c5850', 1.75)); const key = new THREE.DirectionalLight('#fffdf5', 1.4); key.position.set(4, 8, 6); root.add(key, key.target); }
  let state = {};
  for (const m of spec.methods || []) root[m] = () => Promise.resolve();
  Object.assign(root, spec.extra || {});
  root.setState = (s = {}) => { state = { ...state, ...s }; return Promise.resolve(); };
  root.getState = () => ({ ...state });
  root.update = () => {};
  root.userData.placeholder = true;
  return root;
}

export const PLACEHOLDERS = Object.fromEntries(Object.entries(SPECS).map(([id, spec]) => [id, () => placeholder(id, spec)]));
