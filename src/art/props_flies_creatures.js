// 第四灾的生物：苍蝇人、蛹、寄居蟹、海胆、贝壳、兔、鸟。造型对照 dev/common/ref/P04 抽帧。
import {
  THREE, toon, unlit, canvasTexture, ink, TAU, group, mesh, ball, bar, taperedTube, merged, placed, label, bake,
} from './props_flies_kit.js';
import { rng } from './materials.js';

const lerp = (a, b, k) => a + (b - a) * k;

// ---------------------------------------------------------------------------
// 螺壳：车削出螺旋轴向的壳，斜纹贴图表现螺层；开口朝 -Y，尖端朝 +Y。
const shellTextures = new Map();
function shellTexture(color) {
  if (!shellTextures.has(color)) {
    shellTextures.set(color, canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(80,66,52,0.42)'; g.lineWidth = 6;
      for (let i = -2; i < 9; i++) { g.beginPath(); g.moveTo(0, i * h / 6); g.lineTo(w, i * h / 6 + h / 3); g.stroke(); }
      g.strokeStyle = 'rgba(255,252,240,0.35)'; g.lineWidth = 3;
      for (let i = -2; i < 9; i++) { g.beginPath(); g.moveTo(0, i * h / 6 + 14); g.lineTo(w, i * h / 6 + h / 3 + 14); g.stroke(); }
    }));
  }
  return shellTextures.get(color);
}

export function spiralShell({ length = 0.3, radius = 0.1, whorls = 3.5, color = '#d9cfb6', lip = '#efe6d0', name = 'p4_spiral' } = {}) {
  const g = group(name), pts = [], N = 36;
  for (let i = 0; i <= N; i++) {
    const t = i / N, open = Math.min(1, 0.72 + t * 6);
    pts.push(new THREE.Vector2(Math.max(radius * Math.pow(1 - t, 0.85) * (1 + 0.11 * Math.sin(t * whorls * TAU)) * open, 0.0001), t * length));
  }
  mesh(g, new THREE.LatheGeometry(pts, 28), toon('#ffffff', { map: shellTexture(color), side: THREE.DoubleSide }));
  const rim = mesh(g, new THREE.TorusGeometry(radius * 0.72, radius * 0.1, 8, 24), toon(lip)); rim.rotation.x = Math.PI / 2;
  const inside = mesh(g, new THREE.CircleGeometry(radius * 0.66, 20), unlit('#3a2f2c'), [0, 0.012, 0]); inside.rotation.x = Math.PI / 2;
  return g;
}

// ---------------------------------------------------------------------------
// 苍蝇人：防毒面具似的头、长喙、黑羽毛外套、苍白瘦手臂、靴子、翠黄半透明翅膀。
const featherGeo = new THREE.ConeGeometry(1, 2, 5).rotateX(Math.PI);   // 尖端朝下的羽片
const veinTexture = () => canvasTexture(256, 512, (g, w, h) => {
  g.fillStyle = '#e6e5b4'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a8c62'; g.lineWidth = 2;
  for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(w * 0.5, h); g.bezierCurveTo(w * (0.1 + i * 0.13), h * 0.65, w * (0.06 + i * 0.14), h * 0.28, w * (0.08 + i * 0.14), 0); g.stroke(); }
  for (let i = 1; i < 10; i++) { g.beginPath(); g.moveTo(0, i * h / 10); g.lineTo(w, (i + 0.4) * h / 10); g.stroke(); }
});

export function makeFlyMan() {
  const root = group('p4_flyman'), body = group('fly_body'); root.add(body);
  const dark = toon('#1e211d'), plume = toon('#262925'), skin = toon('#ddd9c4'), shirt = toon('#e8e4d2'),
    trousers = toon('#4d4a3a'), boot = toon('#2f2921'), glass = toon('#d8d27a', { emissive: '#43410f' });
  const pelvis = group('fly_pelvis'); pelvis.position.y = 0.95; body.add(pelvis);
  ball(pelvis, [0, 0, 0], [0.17, 0.11, 0.12], trousers);
  const torso = group('fly_torso'); pelvis.add(torso);
  ball(torso, [0, 0.29, 0.03], [0.19, 0.33, 0.13], shirt);

  // 羽毛外套：背面和肩侧一层层叠下来，前胸留出白衬衫。
  const rand = rng(77), plumes = [];
  for (let row = 0; row < 9; row++) {
    const y = 0.64 - row * 0.075, f = Math.sqrt(Math.max(0.12, 1 - ((y - 0.29) / 0.36) ** 2));
    const count = 12 + (row < 3 ? 2 : 0);
    for (let i = 0; i < count; i++) {
      const phi = (70 + (i + 0.5 * (row % 2)) / count * 220 + (rand() - 0.5) * 8) * Math.PI / 180;
      const rx = 0.19 * f + 0.045, rz = 0.13 * f + 0.045, size = 0.8 + rand() * 0.4;
      plumes.push(placed(featherGeo, {
        pos: [Math.sin(phi) * rx, y, 0.03 + Math.cos(phi) * rz], rot: [-0.7 - rand() * 0.25 - row * 0.03, phi, 0], order: 'YXZ',
        scale: [0.052 * size, 0.1 * size, 0.034 * size],
      }));
    }
  }
  for (let i = 0; i < 9; i++) {   // 下摆几片更长的尾羽
    const phi = (100 + i * 20) * Math.PI / 180;
    plumes.push(placed(featherGeo, { pos: [Math.sin(phi) * 0.15, -0.02, 0.02 + Math.cos(phi) * 0.1], rot: [-0.5, phi, 0], order: 'YXZ', scale: [0.06, 0.15, 0.038] }));
  }
  torso.add(merged(plumes, plume));

  // 头：面具、两只大透镜、长喙、触角
  const head = group('fly_head'); head.position.set(0, 0.68, 0.04); torso.add(head);
  bar(head, [0, -0.1, -0.01], [0, 0.02, 0.02], 0.05, shirt);
  ball(head, [0, 0.14, 0.02], [0.14, 0.16, 0.15], dark, 'fly_skull');
  for (const s of [-1, 1]) {
    const lens = mesh(head, new THREE.CylinderGeometry(0.073, 0.073, 0.045, 22), glass, [s * 0.075, 0.15, 0.155]); lens.rotation.x = Math.PI / 2;
    const ring = mesh(head, new THREE.TorusGeometry(0.076, 0.016, 8, 22), dark, [s * 0.075, 0.15, 0.172]);
    const pupil = mesh(head, new THREE.CircleGeometry(0.03, 14), unlit('#2f2f1c'), [s * 0.075, 0.15, 0.1785]); pupil.name = 'fly_pupil';
    head.add(taperedTube([[s * 0.06, 0.26, 0.02], [s * 0.115, 0.4, 0.06], [s * 0.15, 0.5, 0.15]], 0.011, 0.006, dark, { radial: 5, segments: 8 }));
    ball(head, [s * 0.15, 0.5, 0.15], [0.018, 0.018, 0.018], dark);
    bar(head, [s * 0.14, 0.14, 0.02], [s * 0.1, 0.12, -0.14], 0.012, dark);   // 面具束带
  }
  head.add(taperedTube([[0, 0.05, 0.16], [0, 0.0, 0.3], [0, -0.17, 0.43], [0, -0.42, 0.5]], 0.036, 0.007, dark, { radial: 8, segments: 14 }));

  // 手臂：白袖子 + 苍白前臂和长手指
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const arm = group('fly_arm'); arm.position.set(s * 0.22, 0.54, 0.0); torso.add(arm);
    ball(arm, [0, 0.01, 0], [0.075, 0.075, 0.075], plume);
    bar(arm, [0, 0, 0], [s * 0.03, -0.3, 0.02], 0.052, shirt, 0.045);
    const fore = group('fly_fore'); fore.position.set(s * 0.03, -0.3, 0.02); arm.add(fore);
    bar(fore, [0, 0, 0], [0, -0.3, 0], 0.04, skin, 0.03);
    ball(fore, [0, -0.33, 0], [0.036, 0.055, 0.024], skin);
    for (let k = -1; k <= 1; k++) bar(fore, [k * 0.014, -0.36, 0], [k * 0.026, -0.46, 0.01], 0.008, skin, 0.005);
    arms.push([arm, fore]);
    // 腿：裤子 + 靴子
    const hip = group('fly_hip'); hip.position.set(s * 0.1, -0.02, 0); pelvis.add(hip);
    bar(hip, [0, 0, 0], [0, -0.45, 0], 0.075, trousers, 0.06);
    const knee = group('fly_knee'); knee.position.y = -0.45; hip.add(knee);
    ball(knee, [0, 0, 0], [0.062, 0.062, 0.062], trousers);
    bar(knee, [0, 0, 0], [0, -0.42, 0], 0.058, trousers, 0.048);
    ball(knee, [0, -0.46, 0.05], [0.062, 0.055, 0.12], boot);
    legs.push([hip, knee]);
  }

  // 翅膀
  const wings = [], veins = veinTexture();
  for (const s of [-1, 1]) {
    const pivot = group('fly_wing'); pivot.position.set(s * 0.1, 0.5, -0.14); torso.add(pivot);
    const wing = ball(pivot, [s * 0.3, 0.5, -0.1], [0.21, 0.68, 0.016],
      unlit('#ffffff', { map: veins, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    wing.rotation.z = -s * 0.42; wings.push([pivot, s]);
  }

  let kneel = 0;
  root.setKneel = (k) => {
    kneel = Math.min(1, Math.max(0, k));
    pelvis.position.y = lerp(0.95, 0.52, kneel);
    torso.rotation.x = lerp(0.28, 1.2, kneel);
    head.rotation.x = lerp(0.05, -0.62, kneel);
    for (const [arm, fore] of arms) { arm.rotation.x = lerp(-0.18, -1.28, kneel); fore.rotation.x = lerp(-0.55, -0.1, kneel); }
    for (const [hip, knee] of legs) { hip.rotation.x = lerp(0.22, 0, kneel); knee.rotation.x = lerp(0.4, 1.52, kneel); }
  };
  root.kneel = () => kneel;
  root.setKneel(0);
  root.update = (dt, t) => {
    const flap = 1 - 0.8 * kneel;
    for (const [p, s] of wings) p.rotation.y = s * (0.2 + Math.sin(t * 55) * 0.38 * flap);
    body.position.y = Math.sin(t * 3.7) * 0.045 * (1 - kneel);
  };
  return root;
}

// ---------------------------------------------------------------------------
// 蛹：十一节粉褐色环节，背上盖着深色甲片，孵化时背甲向两边裂开。
function buildCocoon() {
  const root = group('p4_cocoon');
  const ringTex = canvasTexture(128, 128, (g, w, h) => {
    const r = rng(9); g.fillStyle = '#c9ac9d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { g.fillStyle = r() > 0.5 ? 'rgba(120,80,66,0.3)' : 'rgba(245,222,208,0.35)'; g.fillRect(r() * w, r() * h, 2, 2); }
    g.fillStyle = 'rgba(105,66,52,0.45)'; for (let i = 0; i < 11; i++) g.fillRect(0, (i + 0.5) * h / 11 - 1.5, w, 3);
  });
  const skin = toon('#ffffff', { map: ringTex }), shell = toon('#3a3631');
  // 沿 x 轴的身体：车削轮廓上叠十一道环节凹槽
  const profile = (grow) => {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const u = i / 60, base = Math.pow(Math.sin(Math.PI * (0.05 + 0.9 * u)), 0.55) * 0.33 * (1.05 - 0.22 * u);
      pts.push(new THREE.Vector2(Math.max(0.0001, base * (1 - 0.085 * Math.pow(0.5 + 0.5 * Math.cos(u * 11 * TAU), 0.7)) + grow), -0.76 + u * 1.52));
    }
    return pts;
  };
  const axis = group('cocoon_axis'); axis.position.y = 0.2; root.add(axis);
  const bodyGeo = new THREE.LatheGeometry(profile(0), 36); bodyGeo.rotateZ(-Math.PI / 2);
  mesh(axis, bodyGeo, skin);
  const halves = [];
  for (const [from, to] of [[1.5 * Math.PI, 1.74 * Math.PI], [1.26 * Math.PI, 1.5 * Math.PI]]) {
    const h = group('cocoon_half'); axis.add(h);
    const g = new THREE.LatheGeometry(profile(0.012), 36, from, to - from); g.rotateZ(-Math.PI / 2);
    mesh(h, g, shell, [0, 0, 0]).material.side = THREE.DoubleSide;
    h.userData.side = from > 1.4 * Math.PI ? 1 : -1; halves.push(h);
  }
  const ground = mesh(root, new THREE.CircleGeometry(0.95, 28), unlit('#b9b79d'), [0, 0.006, 0]); ground.rotation.x = -Math.PI / 2; ground.scale.set(1, 0.5, 1);
  root.setOpen = (open) => halves.forEach((h) => { h.rotation.x = open ? h.userData.side * 0.4 : 0; h.position.z = open ? h.userData.side * 0.035 : 0; });
  root.setOpen(false);
  return root;
}

// ---------------------------------------------------------------------------
// 寄居蟹：粉橙身体、背着螺壳、三对细腿、两只钳子（朝向 +Z）。
export function makeCrab() {
  const root = group('p4_crab'), flesh = toon('#d08c76'), dim = toon('#a96651'), shellColor = '#e1d6bd';
  ball(root, [0, 0.07, 0.04], [0.082, 0.058, 0.1], flesh);
  const shell = spiralShell({ length: 0.2, radius: 0.07, whorls: 3, color: shellColor, name: 'crab_shell' });
  shell.position.set(0, 0.095, -0.03); shell.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.55, -0.83).normalize()); root.add(shell);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const z = 0.08 - i * 0.045;
      root.add(taperedTube([[s * 0.06, 0.07, z], [s * 0.125, 0.13, z + 0.01], [s * 0.17, 0.0, z + 0.03 - i * 0.012]], 0.011, 0.006, dim, { radial: 5, segments: 8 }));
    }
    root.add(taperedTube([[s * 0.05, 0.075, 0.1], [s * 0.09, 0.1, 0.16], [s * 0.1, 0.075, 0.21]], 0.014, 0.012, flesh, { radial: 6, segments: 8 }));
    ball(root, [s * 0.105, 0.075, 0.235], [0.04, 0.026, 0.045], dim);
    const pincer = mesh(root, new THREE.ConeGeometry(0.014, 0.06, 6), dim, [s * 0.098, 0.075, 0.285]); pincer.rotation.x = Math.PI / 2;
    bar(root, [s * 0.03, 0.1, 0.12], [s * 0.04, 0.15, 0.15], 0.006, flesh);
    ball(root, [s * 0.04, 0.158, 0.153], [0.014, 0.014, 0.014], toon(ink));
  }
  return root;
}

// ---------------------------------------------------------------------------
// 海胆：黑色球体上长出一圈圈细刺（合并成一个网格）。
const spineBase = new THREE.ConeGeometry(0.0085, 1, 5);
export function makeUrchin() {
  const root = group('p4_urchin'), mat = toon('#262c2b'), rand = rng(5);
  const geos = [placed(new THREE.SphereGeometry(1, 12, 9), { pos: [0, 0.075, 0], scale: [0.078, 0.065, 0.078] })];
  const n = 38, up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const y = 1 - 2 * (i + 0.5) / n, rad = Math.sqrt(1 - y * y), a = i * 2.39996;
    const d = new THREE.Vector3(Math.cos(a) * rad, y * 0.75, Math.sin(a) * rad).normalize();
    if (d.y < -0.2) continue;
    const L = 0.1 + rand() * 0.08 + (Math.abs(d.y) < 0.4 ? 0.04 : 0);
    const c = new THREE.Vector3(0, 0.075, 0).addScaledVector(d, 0.06 + L / 2);
    geos.push(placed(spineBase, { pos: c.toArray(), quat: new THREE.Quaternion().setFromUnitVectors(up, d), scale: [1, L, 1] }));
  }
  root.add(merged(geos, mat));
  return root;
}

// ---------------------------------------------------------------------------
// 沙钱：寄居蟹要爬到的终点（圆盘 + X 记号）。
export function makeGoal() {
  const root = group('p4_goal');
  const tex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#c3a894'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6f5a4a'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w * 0.3, h * 0.3); g.lineTo(w * 0.7, h * 0.7); g.moveTo(w * 0.7, h * 0.3); g.lineTo(w * 0.3, h * 0.7); g.stroke();
    g.strokeStyle = 'rgba(111,90,74,0.5)'; g.lineWidth = 4;
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; g.beginPath(); g.arc(w / 2, h / 2, w * 0.38, a - 0.28, a + 0.28); g.stroke(); }
  });
  const disc = mesh(root, new THREE.CylinderGeometry(0.15, 0.155, 0.03, 32), toon('#ffffff', { map: tex }), [0, 0.015, 0]);
  disc.userData.goal = true;
  return root;
}

// ---------------------------------------------------------------------------
// 贝壳：尖端指向寄居蟹被引导的方向（-Z 为"上"），脚下画一枚淡淡的箭头方便辨认。
const SHELL_COLORS = { up: '#c6ceaf', right: '#e5d8b5', down: '#b8c1c7', left: '#cfafb5' };
const chevronTexture = () => canvasTexture(128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(40,36,28,0.55)';
  g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w - 22, h * 0.52); g.lineTo(w / 2 + 14, h * 0.52); g.lineTo(w / 2 + 14, h - 8); g.lineTo(w / 2 - 14, h - 8); g.lineTo(w / 2 - 14, h * 0.52); g.lineTo(22, h * 0.52); g.closePath(); g.fill();
});
export function makeShell(dir) {
  const root = group('p4_shell'), color = SHELL_COLORS[dir];
  const spiral = spiralShell({ length: 0.27, radius: 0.085, whorls: 3.5, color, name: 'shell_body' });
  spiral.position.set(0, 0.075, 0.1); spiral.rotation.x = -Math.PI / 2 + 0.16;   // 尖端朝 -Z，开口朝 +Z
  root.add(spiral);
  const arrow = mesh(root, new THREE.PlaneGeometry(0.22, 0.22), unlit('#ffffff', { map: chevronTexture(), transparent: true, depthWrite: false }), [0, 0.006, -0.02]);
  arrow.rotation.x = -Math.PI / 2; arrow.name = 'shell_arrow';
  const halo = mesh(root, new THREE.RingGeometry(0.2, 0.235, 32), unlit('#e9d27a', { transparent: true, opacity: 0.85, depthWrite: false }), [0, 0.008, 0.02]);
  halo.rotation.x = -Math.PI / 2; halo.visible = false;
  root.rotation.y = { up: 0, right: -Math.PI / 2, down: Math.PI, left: Math.PI / 2 }[dir];
  root.setSelected = (selected) => { halo.visible = !!selected; root.scale.setScalar(selected ? 1.12 : 1); };
  return root;
}

// ---------------------------------------------------------------------------
// 兔：白兔，活着时从洞里探出头，死后四脚朝天躺着，眼睛是叉。
function buildRabbit() {
  const root = group('p4_rabbit'), fur = toon('#ece8dc'), pink = toon('#e3b7ad'), dark = toon(ink);
  const rig = group('rabbit_rig'); root.add(rig);
  ball(rig, [0, 0.18, -0.02], [0.17, 0.15, 0.21], fur);
  ball(rig, [0, 0.33, 0.15], [0.1, 0.1, 0.12], fur);
  ball(rig, [0, 0.31, 0.26], [0.03, 0.025, 0.02], pink);
  ball(rig, [0, 0.16, -0.24], [0.06, 0.06, 0.06], fur);
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = group('rabbit_ear'); ear.position.set(s * 0.05, 0.42, 0.13); rig.add(ear);
    ball(ear, [0, 0.14, 0], [0.034, 0.17, 0.02], fur); ball(ear, [0, 0.14, 0.012], [0.02, 0.14, 0.008], pink);
    ear.rotation.z = -s * 0.12; ears.push([ear, s]);
  }
  const eyes = group('rabbit_eyes'), crosses = group('rabbit_x'); rig.add(eyes, crosses);
  for (const s of [-1, 1]) {
    ball(eyes, [s * 0.062, 0.36, 0.215], [0.014, 0.018, 0.01], dark);
    bar(crosses, [s * 0.062 - 0.016, 0.376, 0.222], [s * 0.062 + 0.016, 0.344, 0.222], 0.005, dark);
    bar(crosses, [s * 0.062 - 0.016, 0.344, 0.222], [s * 0.062 + 0.016, 0.376, 0.222], 0.005, dark);
  }
  const limbs = group('rabbit_limbs'); rig.add(limbs);
  for (const s of [-1, 1]) {
    bar(limbs, [s * 0.1, 0.22, 0.1], [s * 0.1, 0.03, 0.2], 0.026, fur);     // 前腿
    ball(limbs, [s * 0.1, 0.03, 0.22], [0.03, 0.02, 0.05], fur);
    bar(limbs, [s * 0.11, 0.14, -0.12], [s * 0.1, 0.03, 0.0], 0.04, fur);   // 后腿（蜷着）
    ball(limbs, [s * 0.1, 0.03, 0.06], [0.04, 0.02, 0.09], fur);
  }
  root.setDead = (dead) => {
    // 死后侧躺在洞边：肚子朝镜头，头朝左，眼睛是叉，四肢伸出
    rig.rotation.set(0, dead ? -Math.PI / 2 : 0, dead ? Math.PI / 2 : 0);
    rig.position.set(dead ? 0.36 : 0, dead ? 0.16 : -0.12, dead ? 0.2 : 0);
    eyes.visible = !dead; crosses.visible = dead;
    limbs.rotation.x = dead ? -0.7 : 0;
    for (const [ear, s] of ears) ear.rotation.z = dead ? s * 0.9 : -s * 0.12;
  };
  root.setDead(false);
  return root;
}

// ---------------------------------------------------------------------------
// 鸟：白腹灰背的小滨鹬，细长的喙和腿；死后翻倒、脚朝天。
function buildBird() {
  const root = group('p4_bird'), back = toon('#a69b84'), belly = toon('#f0ede2'), dark = toon('#2b261f'), leg = toon('#6a5d49');
  const rig = group('bird_rig'); rig.position.y = 0.2; root.add(rig);
  ball(rig, [0, 0, 0], [0.085, 0.08, 0.17], belly);
  ball(rig, [0, 0.03, -0.02], [0.088, 0.065, 0.16], back);
  ball(rig, [0, 0.02, 0.1], [0.07, 0.07, 0.07], belly);
  ball(rig, [0, 0.125, 0.15], [0.058, 0.058, 0.062], belly);
  ball(rig, [0, 0.14, 0.145], [0.05, 0.035, 0.055], back);
  rig.add(taperedTube([[0, 0.12, 0.2], [0, 0.115, 0.28], [0, 0.1, 0.36]], 0.012, 0.005, dark, { radial: 6, segments: 8 }));
  const eyes = group('bird_eyes'), cross = group('bird_x'); rig.add(eyes, cross);
  for (const s of [-1, 1]) {
    ball(eyes, [s * 0.043, 0.14, 0.18], [0.009, 0.009, 0.009], dark);
    bar(cross, [s * 0.043 + 0.004, 0.152, 0.176], [s * 0.043 + 0.004, 0.128, 0.19], 0.004, dark);
    bar(cross, [s * 0.043 + 0.004, 0.128, 0.176], [s * 0.043 + 0.004, 0.152, 0.19], 0.004, dark);
    ball(rig, [s * 0.075, 0.0, -0.02], [0.028, 0.06, 0.15], back);   // 收起的翅膀
  }
  const tail = mesh(rig, new THREE.ConeGeometry(0.04, 0.14, 6), back, [0, 0.02, -0.25]); tail.rotation.x = -Math.PI / 2 - 0.2;
  const legs = group('bird_legs'); rig.add(legs);
  for (const s of [-1, 1]) {
    legs.add(taperedTube([[s * 0.035, -0.06, 0.02], [s * 0.035, -0.13, 0.03], [s * 0.035, -0.2, 0.02]], 0.007, 0.005, leg, { radial: 5, segments: 6 }));
    for (const k of [-0.025, 0, 0.03]) bar(legs, [s * 0.035, -0.198, 0.02], [s * 0.035 + k, -0.2, 0.065], 0.004, leg);
  }
  root.setDead = (dead) => {
    rig.rotation.set(0, dead ? 0.6 : 0, dead ? Math.PI : 0);
    rig.position.set(dead ? 0.0 : 0, dead ? 0.1 : 0.2, 0);
    eyes.visible = !dead; cross.visible = dead;
    legs.rotation.x = dead ? -0.5 : 0;
  };
  root.setDead(false);
  return root;
}

export { label };

/** 真实大小：Cocoon 按 1.35 倍缩放（见 src/art/scale.js）。 */
export const makeCocoon = () => bake(buildCocoon(), 1.35);

/** 真实大小：Rabbit 按 0.7 倍缩放（见 src/art/scale.js）。 */
export const makeRabbit = () => bake(buildRabbit(), 0.7);

/** 真实大小：Bird 按 0.36 倍缩放（见 src/art/scale.js）。 */
export const makeBird = () => bake(buildBird(), 0.36);
