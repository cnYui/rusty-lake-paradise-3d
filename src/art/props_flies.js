// 第四灾的昆虫、贝壳与机关；所有贴图均由画布生成，不依赖参考视频素材。
import * as THREE from 'three';
import { toon, unlit, canvasTexture, rng } from './materials.js';

const ink = '#191b18', TAU = Math.PI * 2;
const group = (name) => { const g = new THREE.Group(); g.name = name; return g; };
const mesh = (parent, geo, mat, pos = [0, 0, 0], name = '') => {
  const m = new THREE.Mesh(geo, mat); m.position.fromArray(pos); m.name = name; parent.add(m); return m;
};
const ball = (parent, pos, size, mat, name) => {
  const m = mesh(parent, new THREE.SphereGeometry(1, 20, 14), mat, pos, name); m.scale.fromArray(size); return m;
};
const bar = (parent, a, b, radius, mat) => {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va);
  const m = mesh(parent, new THREE.CylinderGeometry(radius * 0.8, radius, d.length(), 10), mat);
  m.position.copy(va.add(vb).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
};

export function label(text, width = 1, height = 0.2, { color = ink, background = '#d1c4a0' } = {}) {
  const tex = canvasTexture(1024, Math.round(1024 * height / width), (g, w, h) => {
    g.fillStyle = background; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#64583e'; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${Math.min(h * 0.58, w / (text.length * 0.95))}px "Microsoft YaHei", sans-serif`;
    g.fillText(text, w / 2, h / 2);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), unlit('#ffffff', { map: tex, side: THREE.DoubleSide }));
}

export function makeFlyMan() {
  const root = group('p4_flyman'), body = group('fly_body'); root.add(body);
  const dark = toon('#242923'), skin = toon('#d9d6be'), cloth = toon('#6b6b52'), boot = toon('#322e23');
  ball(body, [0, 0.85, -0.12], [0.28, 0.44, 0.24], dark);
  for (let i = 0; i < 7; i++) ball(body, [0, 0.56 + i * 0.065, -0.25], [0.26 - i * 0.012, 0.08, 0.14], dark);
  ball(body, [0, 1.25, 0.1], [0.27, 0.25, 0.24], dark, 'fly_head');
  const eyes = toon('#cdcda0');
  for (const side of [-1, 1]) {
    ball(body, [side * 0.155, 1.3, 0.27], [0.105, 0.135, 0.055], eyes);
    ball(body, [side * 0.155, 1.3, 0.315], [0.06, 0.09, 0.017], toon('#abae84'));
    bar(body, [side * 0.12, 1.44, 0.09], [side * 0.21, 1.65, 0.14], 0.015, dark);
    bar(body, [side * 0.21, 1.65, 0.14], [side * 0.19, 1.75, 0.23], 0.012, dark);
    bar(body, [side * 0.22, 1.1, 0.02], [side * 0.4, 0.75, 0.22], 0.067, skin);
    bar(body, [side * 0.4, 0.75, 0.22], [side * 0.25, 0.43, 0.48], 0.045, skin);
    ball(body, [side * 0.24, 0.42, 0.49], [0.07, 0.035, 0.08], skin);
    bar(body, [side * 0.12, 0.55, -0.04], [side * 0.25, 0.23, 0.15], 0.085, cloth);
    bar(body, [side * 0.25, 0.23, 0.15], [side * 0.21, 0.08, -0.25], 0.067, cloth);
    ball(body, [side * 0.21, 0.08, -0.3], [0.08, 0.07, 0.17], boot);
  }
  bar(body, [0, 1.2, 0.27], [0, 0.86, 0.65], 0.029, toon('#8b8860'));
  const wings = [];
  const veinTex = canvasTexture(256, 512, (g, w, h) => {
    g.fillStyle = '#d8d7ae'; g.fillRect(0, 0, w, h); g.strokeStyle = '#656955'; g.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      g.beginPath(); g.moveTo(w * 0.5, h); g.bezierCurveTo(w * (0.1 + i * 0.13), h * 0.65, w * (0.06 + i * 0.14), h * 0.28, w * (0.08 + i * 0.14), 0); g.stroke();
    }
    for (let i = 1; i < 9; i++) { g.beginPath(); g.moveTo(0, i * h / 9); g.lineTo(w, (i + 0.4) * h / 9); g.stroke(); }
  });
  for (const s of [-1, 1]) {
    const pivot = group('fly_wing'); pivot.position.set(s * 0.12, 1.11, -0.18); body.add(pivot);
    const wing = ball(pivot, [s * 0.29, 0.5, -0.15], [0.21, 0.65, 0.018],
      toon('#ffffff', { map: veinTex, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    wing.rotation.z = -s * 0.48; wings.push([pivot, s]);
  }
  root.update = (dt, t) => { for (const [p, s] of wings) p.rotation.y = s * (0.2 + Math.sin(t * 55) * 0.38); body.position.y = Math.sin(t * 3.7) * 0.045; };
  return root;
}

export function makeCocoon() {
  const root = group('p4_cocoon'), halves = [], mat = toon('#ad8b77');
  for (const s of [-1, 1]) {
    const half = group('cocoon_half'); root.add(half); halves.push([half, s]);
    for (let i = 0; i < 8; i++) {
      const r = 0.33 * (1 - i / 10);
      const geo = new THREE.SphereGeometry(1, 18, 12, s < 0 ? Math.PI : 0, Math.PI);
      const m = mesh(half, geo, mat, [-0.62 + i * 0.18, r * 0.6, 0]); m.scale.set(0.15, r, r);
    }
  }
  root.setOpen = (open) => { for (const [h, s] of halves) { h.position.z = open ? s * 0.2 : 0; h.rotation.x = open ? s * 0.45 : 0; } };
  return root;
}

export function makeCrab() {
  const root = group('p4_crab'), mat = toon('#a77355'), shell = toon('#c5ba9c');
  ball(root, [0, 0.11, 0], [0.14, 0.1, 0.12], mat);
  ball(root, [0, 0.15, -0.09], [0.13, 0.13, 0.17], shell);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      bar(root, [side * 0.07, 0.11, -0.1 + i * 0.07], [side * 0.23, 0.015, -0.14 + i * 0.11], 0.012, mat);
    }
    bar(root, [side * 0.08, 0.13, 0.05], [side * 0.19, 0.1, 0.2], 0.02, mat);
    ball(root, [side * 0.2, 0.11, 0.22], [0.05, 0.03, 0.06], mat);
    ball(root, [side * 0.05, 0.2, 0.1], [0.017, 0.035, 0.017], toon(ink));
  }
  return root;
}

export function makeUrchin() {
  const root = group('p4_urchin'), mat = toon('#343e3d');
  ball(root, [0, 0.08, 0], [0.11, 0.08, 0.11], mat);
  for (let i = 0; i < 13; i++) {
    const a = i / 13 * TAU;
    bar(root, [0, 0.06, 0], [Math.cos(a) * 0.22, i % 3 === 0 ? 0.24 : 0.035, Math.sin(a) * 0.22], 0.011, mat);
  }
  return root;
}

export function makeShell(dir) {
  const root = group('p4_shell'), colors = { up: '#c6ceaf', right: '#e5d8b5', down: '#b8c1c7', left: '#cfafb5' };
  const mat = toon(colors[dir]);
  for (let i = 0; i < 5; i++) {
    const r = 0.12 * (1 - i / 6);
    ball(root, [0, 0.09, -0.12 + i * 0.05], [r, r * 0.8, 0.052], mat);
  }
  const arrow = label('↑', 0.22, 0.22, { background: colors[dir] }); arrow.rotation.x = -Math.PI / 2; arrow.position.set(0, 0.205, -0.015); root.add(arrow);
  root.rotation.y = { up: 0, right: -Math.PI / 2, down: Math.PI, left: Math.PI / 2 }[dir];
  root.setSelected = (selected) => { mat.emissive.set(selected ? '#857238' : '#000000'); root.scale.setScalar(selected ? 1.14 : 1); };
  return root;
}

export function makeHeart(kind = 'rabbit') {
  const root = group(`p4_${kind}_heart`), mat = toon('#873b32');
  ball(root, [-0.055, 0.11, 0], [0.08, 0.09, 0.065], mat);
  ball(root, [0.055, 0.11, 0], [0.08, 0.09, 0.065], mat);
  const bottom = mesh(root, new THREE.ConeGeometry(0.095, 0.18, 16), mat, [0, 0.035, 0]); bottom.rotation.z = Math.PI;
  bar(root, [0, 0.15, 0], [0.025, 0.23, -0.015], 0.025, mat);
  if (kind === 'crab') for (let i = 0; i < 3; i++) bar(root, [-0.06 + i * 0.06, 0.02, 0.058], [-0.08 + i * 0.06, 0.16, 0.055], 0.009, toon('#d0b39b'));
  return root;
}

export function makeGem() {
  const root = group('p4_gem');
  const stone = mesh(root, new THREE.IcosahedronGeometry(0.13, 0), toon('#afca8c', { emissive: '#1d3513' }), [0, 0.13, 0]);
  const ring = mesh(root, new THREE.TorusGeometry(0.13, 0.012, 8, 24), toon('#746746'), [0, 0.13, 0]); ring.rotation.x = Math.PI / 2;
  root.update = (dt, t) => { stone.rotation.y = t * 0.3; }; return root;
}

export function makeCandle() {
  const root = group('p4_candle');
  mesh(root, new THREE.CylinderGeometry(0.12, 0.14, 0.025, 24), toon('#9b997e'), [0, 0.012, 0]);
  mesh(root, new THREE.CylinderGeometry(0.038, 0.045, 0.21, 18), toon('#ded4aa'), [0, 0.13, 0]);
  const flame = ball(root, [0, 0.29, 0], [0.022, 0.058, 0.018], unlit('#edbf72'));
  root.update = (dt, t) => { flame.scale.y = 0.053 + Math.sin(t * 9) * 0.007; }; return root;
}

export function makeCarrot() {
  const root = group('p4_carrot');
  const carrot = mesh(root, new THREE.ConeGeometry(0.06, 0.4, 16), toon('#c48336'), [0, 0.2, 0]); carrot.rotation.z = Math.PI;
  for (let i = 0; i < 4; i++) bar(root, [0, 0.4, 0], [(i - 1.5) * 0.04, 0.54, 0.015], 0.014, toon('#6f824e'));
  return root;
}

export function makePit() {
  const root = group('p4_pit');
  mesh(root, new THREE.CylinderGeometry(0.64, 0.64, 0.028, 40), toon('#695b43'), [0, 0.015, 0]);
  mesh(root, new THREE.CylinderGeometry(0.53, 0.53, 0.032, 40), unlit('#141b15'), [0, 0.03, 0]); return root;
}

export function makeTrap() {
  const root = group('p4_trap'), lid = group('trap_lid'), metal = toon('#a5aaa1'); root.add(lid);
  const disc = mesh(lid, new THREE.CylinderGeometry(0.44, 0.46, 0.045, 40), metal, [0, 0, 0]);
  disc.position.y = 0.045;
  const support = bar(root, [0.3, 0.03, 0], [0.3, 0.6, 0], 0.025, toon('#886d49')); support.name = 'trap_branch';
  const bait = ball(root, [0.03, 0.055, 0], [0.09, 0.025, 0.025], toon('#bc9f7e')); bait.name = 'trap_bait';
  root.setState = (propped, baited, caught) => {
    lid.rotation.z = propped && !caught ? -0.7 : 0; lid.position.y = propped && !caught ? 0.31 : 0;
    support.visible = propped && !caught; bait.visible = baited && !caught;
  }; return root;
}

export function makeRabbit() {
  const root = group('p4_rabbit'), mat = toon('#e2ded0');
  ball(root, [0, 0.2, 0], [0.22, 0.2, 0.3], mat); ball(root, [0, 0.38, 0.18], [0.14, 0.15, 0.14], mat);
  for (const s of [-1, 1]) {
    ball(root, [s * 0.07, 0.63, 0.15], [0.045, 0.22, 0.045], mat);
    ball(root, [s * 0.113, 0.4, 0.26], [0.018, 0.018, 0.012], toon(ink));
  }
  ball(root, [0, 0.15, -0.3], [0.08, 0.08, 0.08], mat); return root;
}

export function makeBird() {
  const root = group('p4_bird'), mat = toon('#c4bfa4');
  ball(root, [0, 0.19, 0], [0.13, 0.13, 0.22], mat); ball(root, [0, 0.31, 0.16], [0.085, 0.085, 0.085], mat);
  for (const s of [-1, 1]) {
    bar(root, [s * 0.05, 0.12, 0], [s * 0.05, 0.02, 0.03], 0.012, toon('#5b5342'));
    ball(root, [s * 0.07, 0.33, 0.2], [0.012, 0.012, 0.01], toon(ink));
  }
  bar(root, [0, 0.29, 0.21], [0, 0.29, 0.33], 0.028, toon('#8c7853')); return root;
}

export function makeChest() {
  const root = group('p4_chest'), wood = toon('#8c7150');
  mesh(root, new THREE.BoxGeometry(0.75, 0.52, 0.53), wood, [0, 0.26, 0]);
  const lid = group('chest_lid'); lid.position.set(0, 0.56, -0.265); root.add(lid);
  mesh(lid, new THREE.BoxGeometry(0.79, 0.07, 0.56), wood, [0, 0, 0.265]);
  for (const x of [-0.25, 0.25]) mesh(root, new THREE.BoxGeometry(0.038, 0.56, 0.56), toon('#524a36'), [x, 0.28, 0]);
  root.setOpen = (open) => { lid.rotation.x = open ? -1.05 : 0; }; return root;
}

export function makeCauldron() {
  const root = group('p4_cauldron'), metal = toon('#80776e');
  const points = [[0.18, 0.2], [0.44, 0.35], [0.52, 0.7], [0.41, 0.9], [0.4, 1.02], [0.46, 1.05]];
  mesh(root, new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(...p)), 32), metal);
  mesh(root, new THREE.CylinderGeometry(0.39, 0.39, 0.025, 32), toon('#424a31'), [0, 0.92, 0]);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU;
    bar(root, [-Math.cos(a) * 0.5, 0.05, -Math.sin(a) * 0.5], [Math.cos(a) * 0.5, 0.18, Math.sin(a) * 0.5], 0.045, toon('#6a4f35'));
  }
  return root;
}

export function makeStoneDoor() {
  const root = group('p4_stone_door'), stone = toon('#777c74');
  const slab = mesh(root, new THREE.BoxGeometry(1.62, 2.45, 0.17), stone, [0, 1.22, 0], 'stone_slab');
  for (const s of [-1, 1]) mesh(root, new THREE.BoxGeometry(0.2, 2.65, 0.28), toon('#aaa897'), [s * 0.92, 1.32, 0]);
  mesh(root, new THREE.BoxGeometry(2.02, 0.2, 0.28), toon('#aaa897'), [0, 2.62, 0]);
  mesh(slab, new THREE.CylinderGeometry(0.13, 0.13, 0.035, 8).rotateX(Math.PI / 2), unlit('#26352a'), [0, 0.28, 0.105], 'gem_socket');
  root.setOpen = (open) => { slab.visible = !open; }; return root;
}

export function makeWindow() {
  const root = group('p4_window'), shutters = group('window_shutters'); root.add(shutters);
  const view = canvasTexture(512, 640, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#c5c4a2'); sky.addColorStop(1, '#d7d5b8');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let layer = 0; layer < 3; layer++) {
      g.fillStyle = ['#999d96', '#7d8a83', '#68756a'][layer]; g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) g.lineTo(x, h * (0.48 + layer * 0.065) - Math.abs(Math.sin(x * 0.013 + layer) * Math.cos(x * 0.025)) * 90);
      g.lineTo(w, h); g.fill();
    }
    g.fillStyle = '#a6b0a5'; g.fillRect(0, h * 0.7, w, h * 0.3);
    g.strokeStyle = '#d3d6ba'; g.lineWidth = 2;
    for (let i = 0; i < 11; i++) { g.beginPath(); g.moveTo(i * 43 - 30, h * 0.72 + i * 15); g.lineTo(i * 43 + 90, h * 0.72 + i * 15); g.stroke(); }
  });
  mesh(root, new THREE.PlaneGeometry(1.7, 1.9), unlit('#ffffff', { map: view }), [0, 0, -0.03]);
  for (const s of [-1, 1]) {
    const panel = mesh(shutters, new THREE.BoxGeometry(0.84, 1.9, 0.06), toon('#a6a99a'), [s * 0.43, 0, 0]);
    for (let i = 0; i < 3; i++) bar(panel, [-0.3 + i * 0.3, -0.9, 0.04], [-0.3 + i * 0.3, 0.9, 0.04], 0.008, toon('#6c7168'));
  }
  for (const s of [-1, 1]) mesh(root, new THREE.BoxGeometry(0.08, 2.1, 0.11), toon('#5b5c50'), [s * 0.94, 0, 0.02]);
  for (const y of [-1, 1]) mesh(root, new THREE.BoxGeometry(1.95, 0.1, 0.11), toon('#5b5c50'), [0, y, 0.02]);
  const crest = ['猫头鹰', '火焰', '方块', '湖'];
  const dials = crest.map((s, i) => { const g = group(`window_dial_${i}`); g.position.set(-0.66 + i * 0.44, -0.22, 0.1); shutters.add(g); return g; });
  const values = [];
  root.setState = (numbers, open) => {
    shutters.visible = !open;
    const confirm = root.getObjectByName('window_confirm'); if (confirm) confirm.visible = !open;
    numbers.forEach((n, i) => {
      if (values[i] === n) return;
      while (dials[i].children.length) { const c = dials[i].children[0]; c.geometry.dispose(); c.material.map.dispose(); c.material.dispose(); dials[i].remove(c); }
      dials[i].add(label(`${crest[i]} ${n}`, 0.4, 0.26)); values[i] = n;
    });
  };
  root.dials = dials; return root;
}

export function makeBook() {
  const root = group('p4_book');
  mesh(root, new THREE.BoxGeometry(0.43, 0.055, 0.55), toon('#70503b'), [0, 0.025, 0]);
  const cover = label('记忆属于湖', 0.38, 0.48, { background: '#c4a268' }); cover.rotation.x = -Math.PI / 2; cover.position.y = 0.057; root.add(cover); return root;
}

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

export const FLY_FACTORIES = {
  candle: makeCandle, carrot: makeCarrot, gem: makeGem,
  crab_heart: () => makeHeart('crab'), rabbit_heart: () => makeHeart('rabbit'), bird_heart: () => makeHeart('bird'),
};
