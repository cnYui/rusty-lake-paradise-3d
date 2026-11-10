// 第四灾的道具与机关；生物在 props_flies_creatures.js，书与窗在 props_flies_book.js。
// 所有贴图均由画布生成，不依赖参考视频素材。
import {
  THREE, toon, unlit, canvasTexture, ink, TAU, group, mesh, ball, bar, taperedTube, merged, placed, label, bake,
} from './props_flies_kit.js';
import { rng } from './materials.js';
import { makeBook, makeWindow, BOOK_SPREADS, WINDOW_GLYPHS } from './props_flies_book.js';
import {
  makeFlyMan, makeCocoon, makeCrab, makeUrchin, makeShell, makeGoal, makeRabbit, makeBird, spiralShell,
} from './props_flies_creatures.js';

export {
  label, makeBook, makeWindow, BOOK_SPREADS, WINDOW_GLYPHS,
  makeFlyMan, makeCocoon, makeCrab, makeUrchin, makeShell, makeGoal, makeRabbit, makeBird, spiralShell,
};

// ---------------------------------------------------------------------------
// 心脏：兔和鸟是红色的心；蟹是一段粉红的蟹肉。
function buildHeart(kind = 'rabbit') {
  const root = group(`p4_${kind}_heart`);
  if (kind === 'crab') {
    const meat = toon('#e49682'), seam = toon('#c4705f');
    for (let i = 0; i < 6; i++) {
      const u = i / 5, a = -0.9 + u * 1.8;
      ball(root, [Math.sin(a) * 0.09, 0.05 + 0.02 * Math.cos(a * 2), Math.cos(a) * 0.05 - 0.03], [0.05 - u * 0.012, 0.042, 0.04 - u * 0.008], i % 2 ? seam : meat);
    }
    bar(root, [0.09, 0.05, -0.04], [0.14, 0.07, -0.01], 0.012, toon('#e8b9a6'));
    return root;
  }
  const mat = toon(kind === 'bird' ? '#a32e2a' : '#8f3029'), vessel = toon('#c9564a');
  ball(root, [-0.05, 0.11, 0], [0.08, 0.09, 0.07], mat);
  ball(root, [0.055, 0.115, 0], [0.075, 0.085, 0.065], mat);
  const bottom = mesh(root, new THREE.ConeGeometry(0.1, 0.19, 18), mat, [0, 0.04, 0]); bottom.rotation.z = Math.PI;
  for (const [a, b] of [[[0.0, 0.17, 0], [0.02, 0.25, -0.01]], [[0.04, 0.18, 0.01], [0.09, 0.24, 0.02]], [[-0.04, 0.17, 0.01], [-0.08, 0.23, 0.0]]]) bar(root, a, b, 0.017, vessel, 0.012);
  ball(root, [-0.07, 0.14, 0.05], [0.025, 0.018, 0.01], toon('#d9776b'));
  return root;
}

// 绿色宝石：切面分明的菱形，嵌在猫头鹰胸口和石门上。
export function makeGem() {
  const root = group('p4_gem');
  const stone = mesh(root, new THREE.OctahedronGeometry(0.13, 0), toon('#9fcb86', { emissive: '#20431a' }), [0, 0.14, 0]);
  stone.scale.set(1, 1.3, 0.8);
  const ring = mesh(root, new THREE.TorusGeometry(0.115, 0.014, 8, 24), toon('#7a6c49'), [0, 0.14, -0.02]);
  root.update = (dt, t) => { stone.rotation.y = Math.sin(t * 0.8) * 0.35; }; return root;
}

// 蜡烛：黄铜小碟带环形把手，蜡身有一滴蜡泪，火苗轻轻晃。
export function makeCandle() {
  const root = group('p4_candle'), brass = toon('#a89358'), wax = toon('#e8dfba');
  const dish = mesh(root, new THREE.CylinderGeometry(0.115, 0.095, 0.03, 24), brass, [0, 0.015, 0]);
  const handle = mesh(root, new THREE.TorusGeometry(0.05, 0.012, 8, 16), brass, [0.17, 0.02, 0]); handle.rotation.x = Math.PI / 2;
  mesh(root, new THREE.CylinderGeometry(0.038, 0.042, 0.2, 18), wax, [0, 0.13, 0]);
  ball(root, [0.034, 0.17, 0.01], [0.012, 0.045, 0.012], wax);
  bar(root, [0, 0.23, 0], [0, 0.255, 0], 0.004, toon(ink));
  const flame = ball(root, [0, 0.29, 0], [0.024, 0.06, 0.02], unlit('#f0c27a'));
  const core = ball(root, [0, 0.282, 0.012], [0.012, 0.035, 0.008], unlit('#fff0c8'));
  root.update = (dt, t) => { flame.scale.y = 0.056 + Math.sin(t * 9) * 0.007; flame.scale.x = 0.022 + Math.sin(t * 7.3) * 0.003; core.scale.y = flame.scale.y * 0.6; };
  return root;
}

// 胡萝卜：带环纹的橙色圆锥加一撮羽状绿叶。
function buildCarrot() {
  const root = group('p4_carrot');
  const tex = canvasTexture(64, 256, (g, w, h) => {
    const r = rng(3); g.fillStyle = '#d68a3c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(140,76,24,0.5)'; g.lineWidth = 3;
    for (let y = 18; y < h; y += 26 + r() * 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 4); g.stroke(); }
  });
  const body = mesh(root, new THREE.ConeGeometry(0.065, 0.42, 18), toon('#ffffff', { map: tex }), [0, 0.21, 0]); body.rotation.z = Math.PI;
  for (let i = 0; i < 5; i++) root.add(taperedTube([[0, 0.41, 0], [(i - 2) * 0.03, 0.5, 0.01 * (i % 2)], [(i - 2) * 0.055, 0.6, 0.02]], 0.012, 0.004, toon('#6f8a4e'), { radial: 5, segments: 6 }));
  return root;
}

// 坑口：土黄色的坑沿加一圈浅色边，里面是深色的洞。
function buildPit() {
  const root = group('p4_pit');
  mesh(root, new THREE.CylinderGeometry(0.7, 0.7, 0.02, 44), toon('#a79a78'), [0, 0.01, 0]);
  mesh(root, new THREE.CylinderGeometry(0.64, 0.64, 0.028, 44), toon('#6f5f43'), [0, 0.02, 0]);
  mesh(root, new THREE.CylinderGeometry(0.53, 0.53, 0.032, 44), unlit('#141b15'), [0, 0.03, 0]); return root;
}

// 盖在坑口的木板：1.4 × 0.2 m 的宽板、木纹和钉子，长轴沿 X。
export function makePlank() {
  const root = group('p4_plank');
  const tex = canvasTexture(256, 64, (g, w, h) => {
    const r = rng(41); g.fillStyle = '#a08c6c'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(70,56,38,0.5)'; g.lineWidth = 2;
    for (let y = 8; y < h; y += 11) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 6, w * 0.7, y + (r() - 0.5) * 6, w, y + (r() - 0.5) * 4); g.stroke(); }
    g.fillStyle = 'rgba(60,46,30,0.55)'; g.beginPath(); g.ellipse(w * 0.62, h * 0.4, 9, 5, 0, 0, TAU); g.fill();
    for (let i = 0; i < 80; i++) { g.fillStyle = 'rgba(50,38,26,0.18)'; g.fillRect(r() * w, r() * h, 3 + r() * 14, 1); }
  });
  mesh(root, new THREE.BoxGeometry(1.4, 0.04, 0.2), toon('#ffffff', { map: tex }), [0, 0, 0]);
  for (const x of [-0.58, 0.58]) mesh(root, new THREE.CylinderGeometry(0.014, 0.014, 0.012, 8), toon('#3a3730'), [x, 0.026, 0]);
  return root;
}

// 捕鸟盘：一块灰石板，一端用树枝支起来，板下放着虫子。
function buildTrap() {
  const root = group('p4_trap'), lid = group('trap_lid'), stone = toon('#9aa09c'); root.add(lid);
  lid.position.set(-0.42, 0.04, 0);
  const shape = new THREE.Shape();
  [[0, -0.28], [0.35, -0.31], [0.78, -0.24], [0.9, -0.05], [0.84, 0.2], [0.5, 0.3], [0.12, 0.27], [-0.02, 0.1]].forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  const slabGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 2 });
  slabGeo.rotateX(-Math.PI / 2); slabGeo.translate(0, 0.0, 0);
  mesh(lid, slabGeo, stone, [0, 0, 0], 'trap_slab');
  // 石板翘起 0.5 rad（setState），板头在 x≈0.37：树枝要正好顶在翘起的板底（x=0.27、高 0.40），不能立在板外
  const support = bar(root, [0.27, 0.0, 0.0], [0.27, 0.41, 0.0], 0.022, toon('#7c6343'), 0.016); support.name = 'trap_branch';
  const bait = group('trap_bait'); bait.position.set(0.1, 0.02, 0.0); root.add(bait);
  bait.add(taperedTube([[-0.07, 0, 0], [-0.02, 0.012, 0.025], [0.03, 0.01, -0.02], [0.08, 0.004, 0.01]], 0.013, 0.008, toon('#d6a39a'), { radial: 6, segments: 10 }));
  root.setState = (propped, baited, caught) => {
    const up = propped && !caught;
    lid.rotation.z = up ? 0.5 : 0; lid.position.y = 0.04;
    support.visible = up; bait.visible = baited && !caught;
  }; return root;
}

// 木箱：竖向木板纹、铁箍和锁扣。
export function makeChest() {
  const root = group('p4_chest');
  const grain = canvasTexture(128, 128, (g, w, h) => {
    const r = rng(21); g.fillStyle = '#8f7452'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(70,50,30,0.5)'; g.lineWidth = 2;
    for (let x = 0; x < w; x += 22) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 3, h); g.stroke(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(60,40,24,0.25)'; g.fillRect(r() * w, r() * h, 1 + r() * 4, 1); }
  });
  const wood = toon('#ffffff', { map: grain }), iron = toon('#4a4636');
  mesh(root, new THREE.BoxGeometry(0.75, 0.52, 0.53), wood, [0, 0.26, 0]);
  const lid = group('chest_lid'); lid.position.set(0, 0.56, -0.265); root.add(lid);
  mesh(lid, new THREE.BoxGeometry(0.79, 0.07, 0.56), wood, [0, 0, 0.265]);
  mesh(lid, new THREE.BoxGeometry(0.06, 0.05, 0.03), iron, [0, -0.02, 0.55]);
  for (const x of [-0.25, 0.25]) { mesh(root, new THREE.BoxGeometry(0.04, 0.56, 0.56), iron, [x, 0.28, 0]); mesh(lid, new THREE.BoxGeometry(0.045, 0.085, 0.58), iron, [x, 0, 0.265]); }
  mesh(root, new THREE.BoxGeometry(0.1, 0.1, 0.03), toon('#a89358'), [0, 0.46, 0.275]);
  root.setOpen = (open) => { lid.rotation.x = open ? -1.05 : 0; }; return root;
}

// 大锅：铁锅、斜靠着的锅盖、下面一圈木柴和跳动的火苗。
export function makeCauldron() {
  const root = group('p4_cauldron'), metal = toon('#807770');
  const points = [[0.18, 0.2], [0.44, 0.35], [0.52, 0.7], [0.41, 0.9], [0.4, 1.02], [0.46, 1.05]];
  mesh(root, new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(...p)), 32), metal);
  mesh(root, new THREE.CylinderGeometry(0.39, 0.39, 0.025, 32), toon('#424a31'), [0, 0.92, 0]);
  const rim = mesh(root, new THREE.TorusGeometry(0.435, 0.025, 8, 32), toon('#615a54'), [0, 1.03, 0]); rim.rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) { const ear = mesh(root, new THREE.TorusGeometry(0.06, 0.016, 8, 14), toon('#615a54'), [s * 0.47, 0.98, 0]); ear.rotation.y = Math.PI / 2; }
  mesh(root, new THREE.CylinderGeometry(0.5, 0.5, 0.05, 28), toon('#6a5339'), [0, 0.03, 0]);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU;
    bar(root, [-Math.cos(a) * 0.5, 0.06, -Math.sin(a) * 0.5], [Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5], 0.045, toon('#6a4f35'));
  }
  const flames = [0, 1, 2].map((i) => { const f = ball(root, [(i - 1) * 0.16, 0.16, 0.0], [0.05, 0.12, 0.05], unlit(i === 1 ? '#f4a24a' : '#e57a34')); f.userData.phase = i * 2; return f; });
  const lid = mesh(root, new THREE.CylinderGeometry(0.42, 0.42, 0.04, 30), metal, [0.85, 0.42, 0.55]); lid.rotation.set(Math.PI / 2 - 0.2, 0, 0.5);
  const lidHandle = mesh(lid, new THREE.TorusGeometry(0.1, 0.017, 8, 16), toon('#615a54'), [0, 0.03, 0]); lidHandle.rotation.x = Math.PI / 2;
  root.update = (dt, t) => { for (const f of flames) f.scale.y = 0.11 + Math.sin(t * 8 + f.userData.phase) * 0.025; };
  return root;
}

// 石门：刻着拱形凹纹的石板，中间嵌宝石的凹槽。
export function makeStoneDoor() {
  const root = group('p4_stone_door'), stone = toon('#7f847c');
  const tex = canvasTexture(256, 384, (g, w, h) => {
    const r = rng(15); g.fillStyle = '#808578'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { g.fillStyle = r() > 0.5 ? 'rgba(40,46,40,0.18)' : 'rgba(210,214,200,0.16)'; g.fillRect(r() * w, r() * h, 2 + r() * 8, 1 + r() * 2); }
    g.strokeStyle = 'rgba(30,34,30,0.7)'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(24, h - 10); g.lineTo(24, 150); g.arc(w / 2, 150, w / 2 - 24, Math.PI, 0); g.lineTo(w - 24, h - 10); g.stroke();
    g.strokeStyle = 'rgba(230,232,218,0.3)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(34, h - 10); g.lineTo(34, 150); g.arc(w / 2, 150, w / 2 - 34, Math.PI, 0); g.lineTo(w - 34, h - 10); g.stroke();
    g.strokeStyle = 'rgba(30,34,30,0.45)'; g.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 70, y + r() * 60); g.stroke(); }
  });
  const slab = mesh(root, new THREE.BoxGeometry(1.62, 2.45, 0.17), toon('#ffffff', { map: tex }), [0, 1.22, 0], 'stone_slab');
  for (const s of [-1, 1]) mesh(root, new THREE.BoxGeometry(0.2, 2.65, 0.28), toon('#aaa897'), [s * 0.92, 1.32, 0]);
  mesh(root, new THREE.BoxGeometry(2.02, 0.2, 0.28), toon('#aaa897'), [0, 2.62, 0]);
  const socket = mesh(slab, new THREE.CylinderGeometry(0.15, 0.15, 0.035, 12).rotateX(Math.PI / 2), unlit('#26352a'), [0, 0.28, 0.105], 'gem_socket');
  const socketRim = mesh(slab, new THREE.TorusGeometry(0.16, 0.022, 8, 20), toon('#5e6258'), [0, 0.28, 0.105]);
  root.setOpen = (open) => { slab.visible = !open; }; return root;
}

// 神殿后的预兆画：沉进湖里的记忆，窗外的风景。
export function makeOmen() {
  const root = group('p4_omen'), tex = canvasTexture(640, 540, (g, w, h) => {
    const r = rng(44); g.fillStyle = '#babca1'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#a0acaa'; g.fillRect(0, h * 0.42, w, h * 0.21);
    g.fillStyle = '#6a7763';
    for (let i = 0; i < 70; i++) { const x = r() * w; const y = h * (0.35 + r() * 0.1); g.beginPath(); g.moveTo(x, y - 40); g.lineTo(x + 18, y + 25); g.lineTo(x - 18, y + 25); g.fill(); }
    g.fillStyle = '#eee9d3'; g.beginPath(); g.arc(w * 0.78, h * 0.17, 25, 0, TAU); g.fill();
    for (const x of [0.2, 0.65]) {
      g.fillStyle = '#d6d2b9'; g.fillRect(w * x, h * 0.73, 110, 44);
      for (const dx of [10, 85]) g.fillRect(w * x + dx, h * 0.79, 12, 50);
      g.fillStyle = '#444a3c'; g.fillRect(w * x + 96, h * 0.69, 32, 35);
    }
    g.strokeStyle = '#e4c5ae'; g.lineWidth = 5; g.strokeRect(w * 0.17, h * 0.67, w * 0.68, h * 0.25);
  });
  mesh(root, new THREE.BoxGeometry(1.08, 0.94, 0.04), toon('#b9b5a5'));
  mesh(root, new THREE.PlaneGeometry(0.98, 0.84), unlit('#ffffff', { map: tex }), [0, 0, 0.025]); return root;
}


/** 可拾取的小物件：按 0.45 倍放到约 0.14 m（真实心脏更小，但至少 0.1 m 才好点）。 */
export const makeHeart = (kind = 'rabbit') => bake(buildHeart(kind), 0.45);

export const makeCarrot = () => bake(buildCarrot(), 0.6);   // 约 0.36 m，含叶子

/** 坑口，k = 缩放系数（兔洞 0.3、地洞 0.8），世界里 scale 仍为 1。 */
export const makePit = (k = 1) => bake(buildPit(), k);

export const makeTrap = () => bake(buildTrap(), 0.55);   // 石板约 0.5 m，和 0.2 m 的鸟相称

export const FLY_FACTORIES = {
  candle: makeCandle, carrot: makeCarrot, gem: makeGem,
  crab_heart: () => makeHeart('crab'), rabbit_heart: () => makeHeart('rabbit'), bird_heart: () => makeHeart('bird'),
};
