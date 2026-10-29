// 第五灾的食材、餐具和厨房：全部按真实大小建（米），原作画面（P05 的砧板 / 平底锅 / 盘子 / 汉堡）里
// 汉堡只有盘子的三分之一宽、双手能捧住，所以面包直径约 13 cm、整个汉堡约 15 cm 高。
// 描边比大件细一点（FINE），否则 4 cm 的番茄会被墨线盖住。
import * as THREE from 'three';
import { toon } from './materials.js';
import { animate, Ease } from '../core/tween.js';
import { PI, group, add, box, ball, cyl, ring, clear } from './p5_kit.js';

const FINE = { outline: 0.0022 };
const COOK = { meat: '#bb6f6b', cooked: '#6f4630', crumb: '#e1c48a', crust: '#c9a25f', crustTop: '#c08e4b' };

// 固定种子的伪随机：模型每次建出来都一样（读档 / 重复同步不会“抖”）
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ---------- 单件食材 ----------

export function lettuce() {           // 一整颗生菜（物品栏 / 盆栽），半径约 9 cm
  const r = group('p5_lettuce');
  ball(r, 'lettuce_core', 0.05, '#a3c373', [0, 0.055, 0], [1, 0.95, 1], FINE);
  for (let i = 0; i < 10; i++) {
    const a = i * 2 * PI / 10, leaf = ball(r, 'lettuce_leaf', 0.058, i % 2 ? '#81a65c' : '#6c9149', [Math.cos(a) * 0.058, 0.046 + (i % 3) * 0.012, Math.sin(a) * 0.058], [1, 0.32, 0.82], FINE);
    leaf.rotation.set(0, -a, 0.5);
  }
  return r;
}

function lettuceLeaf() {              // 汉堡里的一层生菜叶：边缘起伏的一圈叶片
  const r = group('p5_lettuce_layer');
  const rand = rng(11);
  for (let i = 0; i < 9; i++) {
    const a = i * 2 * PI / 9 + rand() * 0.2, d = 0.034 + rand() * 0.012;
    const leaf = ball(r, 'lettuce_leaf', 0.034, i % 2 ? '#87ac60' : '#6f9650', [Math.cos(a) * d, 0.008 + rand() * 0.004, Math.sin(a) * d], [1, 0.22, 0.85], FINE);
    leaf.rotation.set(0, -a, (rand() - 0.5) * 0.4);
  }
  ball(r, 'lettuce_mid', 0.05, '#7ea057', [0, 0.006, 0], [1, 0.18, 1], FINE);
  return r;
}

export function tomato() {            // 直径约 8.5 cm
  const r = group('p5_tomato');
  ball(r, 'tomato_body', 0.043, '#c04a36', [0, 0.036, 0], [1, 0.86, 1], FINE);
  for (let i = 0; i < 5; i++) { const a = i * 2 * PI / 5, s = ball(r, 'tomato_calyx', 0.013, '#5f7b3f', [Math.cos(a) * 0.012, 0.076, Math.sin(a) * 0.012], [1.6, 0.3, 0.6], FINE); s.rotation.y = -a; }
  cyl(r, 'tomato_stem', 0.004, 0.014, '#566e39', [0, 0.083, 0], 8, FINE);
  return r;
}

export function cucumber() {          // 长约 24 cm，粗约 4.4 cm，躺在桌上
  const r = group('p5_cucumber');
  const body = add(r, new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.19, 6, 14).rotateZ(PI / 2), toon('#5f8c46', FINE)), 'cucumber_body', [0, 0.022, 0]);
  body.scale.set(1, 1, 1);
  for (let i = 0; i < 4; i++) box(r, 'cucumber_stripe', [0.17, 0.003, 0.003], '#8fb26b', [0, 0.0425, (i - 1.5) * 0.006], null).rotation.z = 0.02 * (i - 1.5);
  ball(r, 'cucumber_tip', 0.006, '#c7c36f', [0.12, 0.022, 0], [1, 1, 1], FINE);
  return r;
}

// ---------- 切开的样子 ----------

/** 沿 x 轴排开的切片：n 片，每片厚 thick，间隔 gap；半径按球 / 圆柱截面。 */
function discs(n, thick, radiusAt, color, innerColor, gap = 0) {
  const g = group('slices'); g.userData = { n, thick };
  for (let i = 0; i < n; i++) {
    const x0 = (i + 0.5) * thick - (n * thick) / 2, rad = radiusAt(x0);
    // 每片转向镜头一点，像瓦片一样叠开：从正面能看到切面，而不是一排细条
    const w = group('slice'); w.userData.i = i; w.rotation.y = 0.95; g.add(w);
    const d = cyl(w, 'slice_disc', rad, thick * 0.96, color, [0, rad, 0], 20, FINE); d.rotation.z = PI / 2;
    const m = cyl(w, 'slice_inner', rad * 0.78, thick * 0.99, innerColor, [0, rad, 0], 20, { outline: false }); m.rotation.z = PI / 2;
  }
  setGap(g, gap);
  return g;
}

function setGap(g, gap) {
  const { n, thick } = g.userData, total = n * thick + (n - 1) * gap;
  g.children.forEach((o) => { o.position.x = -total / 2 + thick / 2 + o.userData.i * (thick + gap); });
}

// 平躺的成品切片（物品栏、汉堡里的一层）
function tomatoSlices() {
  const r = group('p5_tomato_slice');
  for (const [x, z, y] of [[-0.026, 0.004, 0], [0.026, -0.004, 0.002]]) {
    cyl(r, 'tomato_slice', 0.04, 0.008, '#c64c38', [x, y + 0.004, z], 22, FINE);
    cyl(r, 'tomato_flesh', 0.031, 0.0086, '#df7e5d', [x, y + 0.004, z], 22, { outline: false });
    for (let i = 0; i < 5; i++) { const a = i * 2 * PI / 5; ball(r, 'tomato_seed', 0.004, '#f0cf8a', [x + Math.cos(a) * 0.02, y + 0.0095, z + Math.sin(a) * 0.02], [1.4, 0.4, 0.8], { outline: false }); }
  }
  return r;
}

function cucumberSlices() {
  const r = group('p5_cucumber_slice');
  [[-0.033, 0.026], [0.033, 0.026], [-0.033, -0.026], [0.033, -0.026], [0, 0]].forEach(([x, z], i) => {
    cyl(r, 'cucumber_slice', 0.024, 0.007, '#4f7e3d', [x, 0.0035 + (i === 4 ? 0.0015 : 0), z], 20, FINE);
    cyl(r, 'cucumber_flesh', 0.0195, 0.0076, '#b9c98c', [x, 0.0035 + (i === 4 ? 0.0015 : 0), z], 20, { outline: false });
  });
  return r;
}

// ---------- 肉 ----------

function meatSlab() {                 // 生肉块：约 20×13×4 cm
  const r = group('p5_meat');
  ball(r, 'meat_body', 1, COOK.meat, [0, 0.021, 0], [0.1, 0.021, 0.064], FINE);
  ball(r, 'meat_body2', 1, '#b7686a', [0.03, 0.026, 0.01], [0.07, 0.017, 0.05], FINE);
  for (const z of [-0.022, 0.004, 0.026]) box(r, 'meat_fat', [0.11, 0.003, 0.006], '#e6c3b5', [0, 0.0405, z], null).rotation.y = z * 1.2;
  return r;
}

function meatStrips(gap) {
  const g = group('meat_strips');
  for (let i = -1; i <= 1; i++) box(g, 'meat_strip', [0.045, 0.026, 0.12], COOK.meat, [i * (0.045 + gap), 0.013, 0], toon(COOK.meat, FINE));
  return g;
}
function meatChunks(gap) {
  const g = group('meat_chunks');
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) box(g, 'meat_chunk', [0.04, 0.026, 0.038], COOK.meat, [i * (0.04 + gap), 0.013, j * (0.038 + gap)], toon(i + j & 1 ? '#b7686a' : COOK.meat, FINE));
  return g;
}

function groundPile(color = '#a8484a') {   // 肉馅：一小堆碎肉
  const g = group('p5_ground_meat'), rand = rng(7);
  for (let i = 0; i < 26; i++) {
    const a = rand() * 2 * PI, d = Math.sqrt(rand()) * 0.052, h = 0.026 * (1 - d / 0.06);
    const c = box(g, 'mince', [0.016 + rand() * 0.012, 0.011 + rand() * 0.006, 0.016 + rand() * 0.012], color, [Math.cos(a) * d, 0.006 + h * rand() + (i % 3) * 0.002, Math.sin(a) * d], toon(i % 3 ? color : '#bd5d58', FINE));
    c.rotation.set(rand(), rand() * PI, rand());
  }
  return g;
}

function patty() {                    // 熟肉饼：直径约 11.6 cm，厚 2.2 cm
  const r = group('p5_cooked_meat');
  cyl(r, 'patty_body', 0.058, 0.02, COOK.cooked, [0, 0.01, 0], 28, FINE);
  ball(r, 'patty_cap', 1, '#7b4d35', [0, 0.02, 0], [0.056, 0.007, 0.056], { outline: false });
  const rim = ring(r, 'patty_rim', 0.055, 0.006, '#5d3a27', [0, 0.012, 0], { outline: false }); rim.rotation.x = PI / 2;
  for (const z of [-0.022, 0, 0.022]) box(r, 'patty_grill', [0.09, 0.0015, 0.005], '#3b261a', [0, 0.0268, z], null);
  return r;
}

// ---------- 面包、奶酪、盘子、汉堡 ----------

function bun(top) {
  const r = group('p5_bun');
  if (top) {
    const dome = add(r, new THREE.Mesh(new THREE.SphereGeometry(0.066, 28, 12, 0, 2 * PI, 0, PI / 2), toon(COOK.crustTop, FINE)), 'bun_top', [0, 0.006, 0]);
    dome.scale.y = 0.7;
    cyl(r, 'bun_crumb', 0.0655, 0.009, COOK.crumb, [0, 0.0045, 0], 28, FINE);
    const rand = rng(3);
    for (let i = 0; i < 24; i++) {
      const phi = 0.12 + rand() * 1.0, th = rand() * 2 * PI, x = 0.066 * Math.sin(phi) * Math.cos(th), z = 0.066 * Math.sin(phi) * Math.sin(th), y = 0.006 + 0.0462 * Math.cos(phi);
      const s = ball(r, 'sesame', 0.0042, '#f1e2b4', [x * 0.99, y, z * 0.99], [1.4, 0.55, 0.8], { outline: false }); s.rotation.y = -th;
    }
  } else {
    cyl(r, 'bun_bottom', 0.062, 0.03, COOK.crust, [0, 0.015, 0], 28, FINE);
    cyl(r, 'bun_crumb', 0.0615, 0.009, COOK.crumb, [0, 0.0265, 0], 28, { outline: false });
  }
  return r;
}

function cheeseSlice() {              // 汉堡里的奶酪片：方形，四角垂在面包外
  const r = group('p5_cheese_slice'), s = box(r, 'cheese_slice', [0.112, 0.004, 0.112], '#e9c34f', [0, 0.0025, 0], toon('#e9c34f', FINE));
  s.rotation.y = PI / 4; for (const [dx, dz] of [[1, 1], [-1, -1]]) { const c = box(r, 'cheese_corner', [0.026, 0.003, 0.026], '#dcb23f', [dx * 0.062, 0.0015, dz * 0.01], null); c.rotation.set(0, PI / 4, dx * 0.5); }
  return r;
}

function cheeseWedge() {              // 物品栏里的奶酪块：一块圆奶酪切下的楔形
  const r = group('p5_cheese');
  const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.absarc(0, 0, 0.07, 0, 2.2, false); shape.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false, curveSegments: 20 }).rotateX(-PI / 2).translate(-0.02, 0, 0.0);
  add(r, new THREE.Mesh(geo, toon('#e6c978', FINE)), 'cheese', [0, 0, 0]);
  for (const [x, z] of [[0.02, -0.02], [0.04, -0.035], [0.005, -0.045]]) ball(r, 'cheese_hole', 0.006, '#c9aa55', [x, 0.0402, z], [1, 0.2, 1], { outline: false });
  return r;
}

export const LAYER_H = { bun_bottom: 0.03, lettuce: 0.016, cooked_meat: 0.022, cheese: 0.005, tomato_slice: 0.011, cucumber_slice: 0.008, bun_top: 0.05 };

function burger() {
  const r = group('p5_burger');
  r.setLayers = (values) => {
    clear(r);
    let y = 0;
    values.forEach((type, i) => {
      const o = type === 'bun_bottom' ? bun(false) : type === 'bun_top' ? bun(true) : type === 'cooked_meat' ? patty() : type === 'cheese' ? cheeseSlice()
        : type === 'tomato_slice' ? tomatoSlices() : type === 'cucumber_slice' ? cucumberSlices() : lettuceLeaf();
      o.position.y = y; o.rotation.y = i * 0.9; r.add(o); y += LAYER_H[type] ?? 0.01;
    });
    r.userData.layers = [...values];
  };
  r.setLayers([]);
  return r;
}

function plate() {                    // 直径 26 cm 的瓷盘
  const r = group('p5_plate');
  const pts = [[0, 0.002], [0.088, 0.002], [0.112, 0.011], [0.13, 0.016], [0.13, 0.012], [0.118, 0.0075], [0.075, 0.0], [0, 0.0]].map(([x, y]) => new THREE.Vector2(x, y));
  add(r, new THREE.Mesh(new THREE.LatheGeometry(pts, 40), toon('#ece7d9', { ...FINE, side: THREE.DoubleSide })), 'plate', [0, 0, 0]);
  const rim = ring(r, 'plate_rim', 0.124, 0.0022, '#cdc7b4', [0, 0.0155, 0], { outline: false }); rim.rotation.x = PI / 2;
  return r;
}

// ---------- 刀、炉灶、砧板 ----------

function knife() {                    // 厨刀：刃长 20 cm，木柄 11 cm，平放时刀刃朝 +x
  const r = group('p5_knife');
  const shape = new THREE.Shape(); shape.moveTo(0, 0.02); shape.lineTo(0.145, 0.02); shape.lineTo(0.205, -0.004); shape.lineTo(0.192, -0.013); shape.lineTo(0, -0.02); shape.lineTo(0, 0.02);
  const blade = add(r, new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false }).rotateX(-PI / 2).translate(0, 0.002, 0.0), toon('#cfd3cf', FINE)), 'knife_blade', [0, 0, 0]);
  blade.position.x = -0.095;
  box(r, 'knife_handle', [0.11, 0.017, 0.024], '#774c2d', [-0.152, 0.009, 0], toon('#774c2d', FINE));
  box(r, 'knife_guard', [0.008, 0.02, 0.03], '#aeb0aa', [-0.097, 0.009, 0], null);
  for (const x of [-0.18, -0.15, -0.12]) ball(r, 'knife_rivet', 0.0035, '#c7c1b0', [x, 0.0185, 0], [1, 0.5, 1], { outline: false });
  return r;
}

function makePot() {                  // 石头炉灶 + 木柴 + 平底锅：炉台高约 52 cm，锅径 32 cm
  const r = group('p5_pot');
  cyl(r, 'stove', 0.27, 0.52, '#72726a', [0, 0.26, 0], 28);
  for (let i = 0; i < 6; i++) { const a = i * PI / 3; const log = cyl(r, 'log', 0.022, 0.34, '#61503b', [Math.cos(a) * 0.05, 0.545, Math.sin(a) * 0.05], 10, FINE); log.rotation.set(PI / 2, 0, a + 0.2); }
  for (const [x, z, s] of [[-0.09, 0.03, 1], [0.01, -0.07, 1.25], [0.09, 0.05, 0.9], [0, 0.08, 0.8], [-0.04, -0.02, 1.15]]) add(r, new THREE.Mesh(new THREE.ConeGeometry(0.026 * s, 0.11 * s, 8), toon('#dc702d', { outline: false, emissive: '#c85a1c' })), 'flame', [x, 0.62 + 0.04 * s, z]);
  const pan = add(r, new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.045, 30), toon('#807a70', FINE)), 'pan', [0, 0.69, 0]);
  const inside = cyl(r, 'pan_inside', 0.145, 0.002, '#4d4a44', [0, 0.7135, 0], 30, { outline: false }); inside.name = 'pan_inside';
  box(r, 'pan_handle', [0.3, 0.014, 0.03], '#6d6559', [0.29, 0.703, 0], toon('#6d6559', FINE));
  const mince = groundPile(); mince.position.y = 0.714; r.add(mince);
  const cooked = patty(); cooked.position.y = 0.714; cooked.scale.setScalar(0.9); r.add(cooked);
  r.userData.pan = pan;
  r.setState = (hasMeat, isCooked, taken) => { mince.visible = hasMeat && !isCooked && !taken; cooked.visible = hasMeat && isCooked && !taken; };
  r.setState(false, false, false);
  return r;
}

/** 三条腿的小砧板桌：桌面直径 46 cm，台面高 0.9 m（奶奶站在后面剁，原作 02:40）。
 *  剁的演示：beginCut(种类) → cut(1..3)（每剁一刀换一个样子）→ clearStage()；种类 raw_meat / tomato / cucumber。 */
function choppingBlock() {
  const r = group('p5_chopping_block');
  cyl(r, 'chopping_top', 0.23, 0.13, '#b38e5e', [0, 0.835, 0], 30);
  for (const rad of [0.07, 0.12, 0.17, 0.205]) { const g = ring(r, 'block_grain', rad, 0.0016, '#8d6c43', [0, 0.9006, 0], { outline: false }); g.rotation.x = PI / 2; }
  for (let i = 0; i < 3; i++) {
    const a = PI / 2 + i * 2 * PI / 3, leg = cyl(r, 'block_leg', 0.026, 0.78, '#7c654b', [Math.cos(a) * 0.205, 0.39, Math.sin(a) * 0.205], 12);
    leg.rotation.set(Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1);
  }
  const stage = group('cut_stage'); stage.position.set(-0.05, 0.9, 0); r.add(stage);
  let cur = null;
  const pop = (o) => animate(140, (k) => o.scale.setScalar(0.92 + 0.08 * k), Ease.outBack);
  const kinds = {
    tomato: () => {
      const whole = tomato(); const d = discs(6, 0.0145, (x) => Math.sqrt(Math.max(1e-6, 0.043 * 0.043 - x * x)) * 0.98, '#c64c38', '#df7e5d');
      return { whole, pieces: d, show: (n) => { whole.visible = n === 0; d.visible = n > 0; if (n > 0) setGap(d, 0.002 + 0.0045 * n); } };
    },
    cucumber: () => {
      const whole = cucumber(); const d = discs(8, 0.0285, () => 0.022, '#4f7e3d', '#b9c98c');
      return { whole, pieces: d, show: (n) => { whole.visible = n === 0; d.visible = n > 0; if (n > 0) setGap(d, 0.0015 + 0.0035 * n); } };
    },
    raw_meat: () => {
      const whole = meatSlab(), strips = meatStrips(0.005), chunks = meatChunks(0.006), mince = groundPile();
      const g = group('meat_steps'); g.add(whole, strips, chunks, mince);
      return { whole: g, pieces: null, show: (n) => { whole.visible = n === 0; strips.visible = n === 1; chunks.visible = n === 2; mince.visible = n >= 3; } };
    },
  };
  r.beginCut = (kind) => {
    clear(stage); const c = kinds[kind](); cur = c;
    stage.add(c.whole); if (c.pieces) stage.add(c.pieces); c.show(0);
    return stage;
  };
  r.cut = (n) => { if (!cur) return; cur.show(n); pop(stage); };
  r.clearStage = () => { clear(stage); cur = null; };
  r.userData.stage = stage;
  return r;
}

export const FOOD_FACTORIES = {
  p5_knife: knife,
  p5_raw_meat: meatSlab, p5_ground_meat: () => groundPile(), p5_cooked_meat: patty,
  p5_cheese: cheeseWedge,
  p5_lettuce: lettuce, p5_tomato: tomato, p5_cucumber: cucumber,
  p5_tomato_slice: tomatoSlices, p5_cucumber_slice: cucumberSlices,
  p5_bun_bottom: () => bun(false), p5_bun_top: () => bun(true), p5_burger: burger,
  p5_plate: plate, p5_pot: makePot, p5_chopping_block: choppingBlock,
};
