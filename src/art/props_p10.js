// 第十灾专属道具工厂：id 一律 p10_ 前缀（设计见 docs/plague9_10_design.md「第十灾」）。
// 模型只呈现传入的状态（setState …），玩法真值在章节的 flags 和物品栏里。尺寸按米建。
// 本文件会被小红书包静态打进去：字符串里不放章节文案。
// 黄昏的天空、星星、仓鸮、黑影剪影复用 props_p9；面具模型在 characters.js 的 makeMaskModel（章节里用）。
import * as THREE from 'three';
import { toon, unlit, flat, canvasTexture } from './materials.js';
import { animate, Ease } from '../core/tween.js';
import { PI, group, add, box, ball, cyl } from './p5_kit.js';
import { FINE, hitBox, tex, glow, barnOwl, drawShadowFigure } from './props_p9.js';
import { roomShell } from './props_p9_tower.js';
import { LETTERS, HEX_START, FACE_START } from '../chapters/plague10/rules.js';

const rng = (seed) => { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
const V2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
/** 两点之间的一根小圆柱（骨头、绳子）。 */
function stick(parent, name, a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = new THREE.Vector3().subVectors(B, A);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), mat); m.name = name;
  m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  parent.add(m); return m;
}

/** 木板贴图：竖着的木板、缝、木纹、钉子。 */
function planks(base, seam, n, seed, { repeat = [1, 1] } = {}) {
  const t = canvasTexture(512, 512, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const x = (i / n) * w;
      g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,230,200'},${0.04 + r() * 0.09})`; g.fillRect(x, 0, w / n, h);
      g.fillStyle = seam; g.fillRect(x, 0, 3, h);
    }
    g.strokeStyle = 'rgba(50,30,18,0.22)'; g.lineWidth = 1.4;
    for (let i = 0; i < 70; i++) { const x = r() * w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 7, h * 0.3, x - 7, h * 0.65, x + 3, h); g.stroke(); }
    g.fillStyle = 'rgba(35,25,20,0.8)';
    for (let i = 0; i < n; i++) for (const y of [0.08, 0.92]) { g.beginPath(); g.arc((i + 0.5) / n * w, y * h, 3, 0, 2 * PI); g.fill(); }
  }, { repeat });
  return t;
}

// ---------------------------------------------------------------------------
// 神殿外面围起来的巨大木头猫头鹰：门 = 两腿之间的门洞（正面 +Z），门前一道半圆的木栅栏和栅门。
// 原点在神殿中心；setState({ eyes: 0..1, open })；lightEyes() / openGate() 是过场动画。
export const WOOD_OWL = { gateR: 6.0, bodyR: 4.6, gap: 0.8 };
function woodOwl() {
  const r = group('p10_wood_owl');
  const woodMat = toon('#ffffff', { map: planks('#8a5a36', '#3e2414', 14, 3, { repeat: [7, 2] }), side: THREE.DoubleSide, outline: 0.003 });
  const lightMat = toon('#ffffff', { map: planks('#c39467', '#6e4a2c', 10, 5, { repeat: [3, 1] }), side: THREE.DoubleSide, outline: 0.003 });
  const darkMat = toon('#3a2416', FINE);
  const G = WOOD_OWL.gap;
  // 身体：下半截在正面留门洞，上半截（头）整圈
  add(r, new THREE.Mesh(new THREE.LatheGeometry(V2([[4.1, -0.4], [4.3, 1.2], [4.45, 3.1]]), 44, G / 2, 2 * PI - G), woodMat), 'owl_body_lower');
  add(r, new THREE.Mesh(new THREE.LatheGeometry(V2([[4.45, 3.1], [4.55, 4.8], [4.4, 6.4], [3.95, 7.9], [3.2, 9.1], [2.1, 9.9], [0.9, 10.3], [0.02, 10.4]]), 44), woodMat), 'owl_body_upper');
  box(r, 'owl_lintel', [3.7, 0.32, 0.5], '#5a3a22', [0, 3.15, 4.2], darkMat);
  for (const s of [-1, 1]) box(r, 'owl_jamb', [0.3, 3.2, 0.5], '#5a3a22', [s * 1.72, 1.5, 3.95], darkMat);
  // 脸盘、眉、眼睛、嘴
  const face = add(r, new THREE.Mesh(new THREE.SphereGeometry(1, 36, 20), lightMat), 'owl_face', [0, 7.35, 3.75]);
  face.scale.set(2.75, 2.15, 0.85);
  const eyeOff = new THREE.Color('#2b1a10'), eyeOn = new THREE.Color('#ffae3a');
  const irisMats = [], glows = [];
  for (const s of [-1, 1]) {
    const eye = group('owl_eye'); eye.position.set(s * 1.12, 7.55, 4.55); eye.rotation.y = s * 0.2; r.add(eye);
    add(eye, new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.13, 10, 36), darkMat), 'owl_eye_rim');
    const irisMat = unlit('#2b1a10'); irisMats.push(irisMat);
    add(eye, new THREE.Mesh(new THREE.CircleGeometry(0.72, 36), irisMat), 'owl_iris', [0, 0, 0.02]);
    add(eye, new THREE.Mesh(new THREE.CircleGeometry(0.26, 24), unlit('#0c0806')), 'owl_pupil', [0, 0, 0.04]);
    const gl = add(eye, new THREE.Mesh(new THREE.CircleGeometry(1.35, 36), glow('#ff9a30', { opacity: 0 })), 'owl_eye_glow', [0, 0, 0.06]);
    glows.push(gl);
    const brow = box(r, 'owl_brow', [1.75, 0.2, 0.18], '#3a2416', [s * 0.95, 8.55, 4.42], darkMat); brow.rotation.z = -s * 0.32;
  }
  const beak = add(r, new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.15, 10), toon('#c9a043', FINE)), 'owl_beak', [0, 6.75, 4.6]);
  beak.rotation.x = PI + 0.25;
  // 耳羽、翅膀、胸口的 V 形羽毛、两只爪子
  for (const s of [-1, 1]) {
    const ear = add(r, new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.8, 10), woodMat), 'owl_ear', [s * 1.65, 10.0, 1.0]); ear.rotation.z = -s * 0.38;
    const wing = add(r, new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), woodMat), 'owl_wing', [s * 4.25, 5.4, -0.4]);
    wing.scale.set(0.85, 3.1, 2.4); wing.rotation.z = s * 0.1;
    const foot = group('owl_foot'); foot.position.set(s * 1.3, 0.45, 4.75); r.add(foot);
    box(foot, 'foot_block', [0.95, 0.5, 0.95], '#6e4a2c', [0, 0, 0], darkMat);
    for (const x of [-0.3, 0, 0.3]) { const t = add(foot, new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.6, 8), toon('#2c2018', FINE)), 'owl_talon', [x, -0.12, 0.6]); t.rotation.x = PI / 2; }
  }
  for (const y of [3.75, 4.6, 5.45]) for (const x of [-1.3, 0, 1.3]) for (const s of [-1, 1]) {
    const v = box(r, 'owl_chevron', [0.5, 0.09, 0.08], '#4a2c1a', [x + s * 0.2, y, 4.62 - Math.abs(x) * 0.12], darkMat); v.rotation.z = s * 0.55;
  }
  // 门前的半圆栅栏和栅门（铰链在门缝两边，往里开）
  const R = WOOD_OWL.gateR, GATE = 0.16, fenceMat = toon('#6b4a2e', FINE);
  for (let a = -0.95; a <= 0.95 + 1e-6; a += 0.075) {
    if (Math.abs(a) < GATE + 0.02) continue;
    const p = box(r, 'fence_picket', [0.1, 1.25, 0.06], '#6b4a2e', [Math.sin(a) * R, 0.62, Math.cos(a) * R], fenceMat); p.rotation.y = a;
  }
  for (const y of [0.35, 0.95]) for (const s of [-1, 1]) {
    const arc = add(r, new THREE.Mesh(new THREE.TorusGeometry(R, 0.03, 5, 40, 0.95 - GATE), fenceMat), 'fence_rail', [0, y, 0]);
    arc.rotation.x = PI / 2; arc.rotation.z = s > 0 ? PI / 2 - 0.95 : PI / 2 + GATE;
  }
  const half = Math.sin(GATE) * R, leaves = [];
  for (const s of [-1, 1]) {
    const leaf = group('gate_leaf'); leaf.position.set(s * half, 0, Math.cos(GATE) * R); r.add(leaf);
    for (let i = 0; i < 6; i++) box(leaf, 'gate_picket', [0.1, 1.3, 0.06], '#7a5634', [-s * (0.08 + i * 0.16), 0.65, 0], fenceMat);
    for (const y of [0.35, 0.95]) box(leaf, 'gate_rail', [half, 0.08, 0.05], '#5a3a22', [-s * half / 2, y, 0.04], darkMat);
    leaves.push(leaf);
  }
  hitBox(r, 'gate_hit', [half * 2 + 0.2, 1.4, 0.4], [0, 0.7, Math.cos(GATE) * R]);
  hitBox(r, 'door_hit', [2.6, 2.9, 0.6], [0, 1.45, 4.25]);
  hitBox(r, 'owl_hit', [6, 5, 1.5], [0, 7.2, 4.3]);
  const st = { eyes: 0, open: 0 };
  const apply = () => {
    irisMats.forEach((m) => m.color.copy(eyeOff).lerp(eyeOn, st.eyes));
    glows.forEach((g) => { g.material.opacity = 0.45 * st.eyes; g.visible = st.eyes > 0.01; });
    leaves[0].rotation.y = st.open * 1.75; leaves[1].rotation.y = -st.open * 1.75;
  };
  r.setState = ({ eyes = 0, open = false } = {}) => { st.eyes = eyes ? 1 : 0; st.open = open ? 1 : 0; apply(); };
  r.lightEyes = () => animate(1600, (k) => { st.eyes = k; apply(); }, Ease.inOutSine);
  r.openGate = () => animate(1400, (k) => { st.open = k; apply(); }, Ease.inOutSine);
  r.userData.gate = r.getObjectByName('gate_hit'); r.userData.door = r.getObjectByName('door_hit'); r.userData.owl = r.getObjectByName('owl_hit');
  r.userData.state = st;
  r.setState();
  return r;
}

// ---------------------------------------------------------------------------
// 带金色翅膀的火炬柱：木柱、两片金翅膀、顶上的铜盆；setState({ lit })，ignite() 点着
function torchPillar({ light = false, height = 1.55 } = {}) {
  const r = group('p10_torch');
  cyl(r, 'torch_base', 0.2, 0.16, '#6f6a62', [0, 0.08, 0], 12, FINE);
  cyl(r, 'torch_post', 0.075, height, '#6e4b30', [0, height / 2 + 0.1, 0], 10, FINE);
  const pts = [[0, 0], [0.12, 0.1], [0.26, 0.21], [0.4, 0.28], [0.5, 0.3], [0.45, 0.24], [0.48, 0.2], [0.38, 0.15], [0.42, 0.1], [0.3, 0.07], [0.31, 0.02], [0.18, 0.01], [0.16, -0.05], [0.06, -0.06]];
  const gold = toon('#d8a93c', { ...FINE, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const w = add(r, new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(V2(pts.map(([x, y]) => [x * s, y]))), { depth: 0.025, bevelEnabled: false }), gold), 'torch_wing', [s * 0.05, height - 0.18, -0.012]);
    w.rotation.y = s * 0.25;
  }
  const top = height + 0.1;
  add(r, new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.09, 0.16, 14, 1, true), toon('#b8862e', { ...FINE, side: THREE.DoubleSide })), 'torch_bowl', [0, top + 0.06, 0]);
  cyl(r, 'torch_coal', 0.17, 0.05, '#2a1e18', [0, top + 0.1, 0], 12, FINE);
  const flames = [];
  for (let i = 0; i < 3; i++) flames.push(add(r, new THREE.Mesh(new THREE.ConeGeometry(0.16 - i * 0.035, 0.55, 9, 1, true), glow(i ? '#ffb24a' : '#ff7a2a', { opacity: 0.7, side: THREE.DoubleSide })), 'torch_flame', [Math.cos(i * 2.1) * 0.03, top + 0.38, Math.sin(i * 2.1) * 0.03]));
  const pl = light ? new THREE.PointLight('#ff9a48', 0, 7, 1.6) : null;
  if (pl) { pl.position.set(0, top + 0.5, 0); r.add(pl); }
  hitBox(r, 'torch_hit', [0.5, top + 0.5, 0.5], [0, (top + 0.5) / 2, 0]);
  const st = { lit: 0 };
  const apply = () => { flames.forEach((f) => { f.visible = st.lit > 0.01; f.scale.setScalar(Math.max(0.01, st.lit)); }); if (pl) pl.intensity = st.lit * 2.2; };
  r.setState = ({ lit = false } = {}) => { st.lit = lit ? 1 : 0; apply(); };
  r.ignite = () => animate(700, (k) => { st.lit = k; apply(); }, Ease.outCubic);
  r.update = (dt, t) => {
    if (st.lit < 0.99) return;
    flames.forEach((f, i) => { const w = 0.9 + Math.sin(t * (8 + i * 1.7) + i) * 0.1; f.scale.set(w, 0.85 + Math.sin(t * 11 + i * 2.3) * 0.18, w); });
    if (pl) pl.intensity = 2.2 + Math.sin(t * 15) * 0.25;
  };
  r.userData.state = st;
  r.setState();
  return r;
}

// ---------------------------------------------------------------------------
// 树林路口的树桩：仓鸮站在上面，树桩边一根羽毛；喂了小鸡以后树桩上摊着一团食丸，里面四组骨头（字母 O W L S）
// setState({ feather, fed, rots })；userData.groups[i]（点一组转 90°）
const BONE_SHAPES = {
  O: (() => { const s = []; for (let i = 0; i < 8; i++) { const a = i / 8 * 2 * PI, b = (i + 1) / 8 * 2 * PI; s.push([[Math.cos(a) * 0.034, Math.sin(a) * 0.042], [Math.cos(b) * 0.034, Math.sin(b) * 0.042]]); } return s; })(),
  W: [[[-0.042, 0.045], [-0.02, -0.045]], [[-0.02, -0.045], [0, 0.022]], [[0, 0.022], [0.02, -0.045]], [[0.02, -0.045], [0.042, 0.045]]],
  L: [[[-0.024, 0.05], [-0.024, -0.05]], [[-0.024, -0.05], [0.032, -0.05]]],
  S: [[[0.03, 0.05], [-0.03, 0.05]], [[-0.03, 0.05], [-0.03, 0]], [[-0.03, 0], [0.03, 0]], [[0.03, 0], [0.03, -0.05]], [[0.03, -0.05], [-0.03, -0.05]]],
};
export const STUMP_TOP = 0.55;
function owlStump() {
  const r = group('p10_owl_stump');
  const bark = toon('#5b4636', FINE);
  add(r, new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, STUMP_TOP, 16), bark), 'stump', [0, STUMP_TOP / 2, 0]);
  const rings = tex(256, 256, (g, w) => { g.fillStyle = '#b58c62'; g.fillRect(0, 0, w, w); g.strokeStyle = 'rgba(90,60,35,0.6)'; g.lineWidth = 3; for (let i = 1; i < 9; i++) { g.beginPath(); g.arc(w / 2 + i, w / 2 - i, i * 14, 0, 2 * PI); g.stroke(); } });
  const top = add(r, new THREE.Mesh(new THREE.CircleGeometry(0.375, 24), toon('#ffffff', { ...FINE, map: rings })), 'stump_top', [0, STUMP_TOP + 0.003, 0]);
  top.rotation.x = -PI / 2;
  for (let i = 0; i < 5; i++) { const a = i * 1.3; const root = add(r, new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 6), bark), 'stump_root', [Math.cos(a) * 0.42, 0.06, Math.sin(a) * 0.42]); root.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25); }
  const owl = barnOwl('stump_owl'); owl.position.set(0.12, STUMP_TOP, -0.12); owl.scale.setScalar(1.2); r.add(owl);
  hitBox(owl, 'owl_hit', [0.32, 0.5, 0.3], [0, 0.25, 0]);
  // 羽毛（地上，树桩前）
  const feather = featherModel(); feather.name = 'stump_feather'; feather.position.set(-0.32, 0.015, 0.42); feather.rotation.set(0, 0.6, 0); r.add(feather);
  hitBox(feather, 'feather_hit', [0.25, 0.08, 0.12], [0, 0.02, 0]);
  // 食丸和骨头
  const pellet = group('pellet'); pellet.position.set(-0.05, STUMP_TOP + 0.005, 0.1); r.add(pellet);
  ball(pellet, 'pellet_fur', 0.07, '#7b746c', [0.2, 0.02, -0.12], [1.3, 0.45, 0.9], FINE);
  const boneMat = toon('#ece4d0', { outline: 0.0015 });
  const groups = ['O', 'W', 'L', 'S'].map((l, i) => {
    const g = group(`bones_${l}`); g.position.set(-0.165 + i * 0.11, 0.008, 0.02); pellet.add(g);
    for (const [[u0, v0], [u1, v1]] of BONE_SHAPES[l]) {
      stick(g, 'bone', [u0, 0, -v0], [u1, 0, -v1], 0.0055, boneMat);
      for (const [u, v] of [[u0, v0], [u1, v1]]) add(g, new THREE.Mesh(new THREE.SphereGeometry(0.0075, 8, 6), boneMat), 'bone_knob', [u, 0, -v]);
    }
    const hit = hitBox(g, `group_${i}`, [0.1, 0.04, 0.12], [0, 0.01, 0]); hit.userData.group = i;
    g.userData.hit = hit;
    return g;
  });
  ball(pellet, 'pellet_skull', 0.022, '#e6dfcc', [0.24, 0.02, -0.08], [1.3, 0.8, 1], { outline: 0.0015 });
  const st = { feather: true, fed: false, rots: [0, 0, 0, 0] };
  r.setState = ({ feather: f = true, fed = false, rots = [0, 0, 0, 0], owl: hasOwl = true } = {}) => {
    st.feather = f; st.fed = fed; st.rots = [...rots];
    feather.visible = f; pellet.visible = fed; owl.visible = hasOwl;
    groups.forEach((g, i) => { g.rotation.y = -(rots[i] || 0) * PI / 2; });
    owl.userData.head.rotation.set(0, 0, 0);
  };
  r.turn = (i, to) => { const g = groups[i], from = g.rotation.y, target = -to * PI / 2; const end = target > from ? target - 2 * PI : target; return animate(260, (k) => { g.rotation.y = from + (end - from) * k; }, Ease.outCubic).then(() => { g.rotation.y = target; }); };
  /** 仓鸮一口吞下小鸡，低头吐出一团食丸。 */
  r.gulp = () => animate(1600, (k) => { const h = owl.userData.head; h.rotation.x = Math.sin(k * PI * 3) * 0.35 * (1 - k); h.position.y = 0.36 + Math.sin(k * PI) * 0.03; }, Ease.linear)
    .then(() => { pellet.visible = true; pellet.scale.setScalar(0.01); return animate(500, (k) => pellet.scale.setScalar(Math.max(0.01, k)), Ease.outBack); });
  r.userData.owl = owl.getObjectByName('owl_hit'); r.userData.feather = feather.getObjectByName('feather_hit'); r.userData.groups = groups.map((g) => g.userData.hit);
  r.userData.pellet = pellet; r.userData.state = st;
  r.setState();
  return r;
}

// ---------------------------------------------------------------------------
// 小物件（物品模型 = 场景里的样子）
function featherModel() {
  const r = group('p10_feather');
  const t = tex(128, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, '#d9c4a0'); grd.addColorStop(0.5, '#f4ead6'); grd.addColorStop(1, '#c9ad80');
    g.fillStyle = grd; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.42, h * 0.48, 0, 0, 2 * PI); g.fill();
    g.strokeStyle = 'rgba(120,90,60,0.5)'; g.lineWidth = 2; for (let i = 0; i < 14; i++) { const y = 20 + i * 15; g.beginPath(); g.moveTo(w / 2, y); g.lineTo(10, y + 18); g.moveTo(w / 2, y); g.lineTo(w - 10, y + 18); g.stroke(); }
    g.fillStyle = '#8a6a44'; for (const y of [60, 120, 180]) { g.beginPath(); g.ellipse(w * 0.35, y, 9, 5, 0.4, 0, 2 * PI); g.fill(); }
  });
  const vane = add(r, new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.16), toon('#ffffff', { ...FINE, map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })), 'feather_vane', [0, 0.004, 0]);
  vane.rotation.x = -PI / 2; vane.rotation.z = PI / 2;
  stick(r, 'feather_quill', [-0.1, 0.004, 0], [0.085, 0.004, 0], 0.0025, toon('#e9dfc8', { outline: false }));
  return r;
}
function arrowModel({ feather = false, tip = false } = {}) {
  const r = group('p10_arrow');
  const L = 0.72;
  stick(r, 'arrow_shaft', [-L / 2, 0, 0], [L / 2, 0, 0], 0.006, toon('#a07848', FINE));
  if (feather) for (let i = 0; i < 3; i++) {
    const f = add(r, new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.03), toon('#efe6d2', { ...FINE, side: THREE.DoubleSide })), 'arrow_fletch', [-L / 2 + 0.07, 0, 0]);
    f.rotation.x = i * PI / 3; f.position.y += Math.cos(i * 2 * PI / 3) * 0.012; f.position.z += Math.sin(i * 2 * PI / 3) * 0.012;
  }
  if (tip) { const c = add(r, new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.08, 8), toon('#ece4d0', FINE)), 'arrow_tip', [L / 2 + 0.035, 0, 0]); c.rotation.z = -PI / 2; }
  else box(r, 'arrow_nock', [0.012, 0.012, 0.012], '#6e5034', [L / 2, 0, 0], toon('#6e5034', FINE));
  return r;
}
function boneTip() {
  const r = group('p10_bone_tip');
  const m = toon('#ece4d0', FINE);
  const c = add(r, new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.1, 8), m), 'tip_point', [0.05, 0.012, 0]); c.rotation.z = -PI / 2;
  stick(r, 'tip_stem', [-0.04, 0.012, 0], [0.01, 0.012, 0], 0.01, m);
  ball(r, 'tip_knob', 0.016, '#e2d8c2', [-0.045, 0.014, 0], [1, 0.9, 1.1], FINE);
  return r;
}
function apple() {
  const r = group('p10_apple');
  ball(r, 'apple_body', 0.04, '#9cc25a', [0, 0.04, 0], [1, 0.92, 1], FINE);
  ball(r, 'apple_blush', 0.025, '#b8d470', [0.018, 0.05, 0.022], [1, 0.8, 0.6], { outline: false });
  cyl(r, 'apple_stem', 0.003, 0.025, '#5a4030', [0, 0.085, 0], 6, FINE);
  const calyx = toon('#547a2e', FINE);
  for (let i = 0; i < 5; i++) {
    const a = i * 2 * PI / 5;
    const leaf = add(r, new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.025, 5), calyx), 'apple_calyx', [Math.cos(a) * 0.009, 0.083, Math.sin(a) * 0.009]);
    leaf.rotation.z = Math.PI / 2;
    leaf.rotation.y = a;
  }
  const leaf = add(r, new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 6), toon('#5f8a3a', FINE)), 'apple_leaf', [0.012, 0.088, 0]); leaf.scale.set(1.4, 0.25, 0.7); leaf.rotation.z = -0.4;
  return r;
}
function worm() {
  const r = group('p10_worm');
  for (let i = 0; i < 7; i++) ball(r, 'worm_seg', 0.009 - Math.abs(i - 3) * 0.0008, i % 2 ? '#d98c8c' : '#e6a0a0', [-0.045 + i * 0.015, 0.009, Math.sin(i * 0.9) * 0.01], [1.15, 1, 1], { outline: 0.0015 });
  const head = ball(r, 'worm_head', 0.0105, '#cf777c', [0.052, 0.009, Math.sin(6 * 0.9) * 0.01], [1.05, 0.9, 1], FINE);
  for (const s of [-1, 1]) ball(head, 'worm_eye', 0.0013, '#24191a', [0.006, 0.005, s * 0.006], [1, 1, 0.7], { outline: false });
  const seam = toon('#b86369', { outline: false });
  for (let i = 1; i < 7; i++) {
    const radius = 0.009 - Math.abs(i - 3) * 0.0008;
    add(r, new THREE.Mesh(new THREE.TorusGeometry(radius * 0.98, 0.0004, 5, 16).rotateY(PI / 2), seam), 'worm_ring', [-0.045 + i * 0.015, 0.009, Math.sin(i * 0.9) * 0.01]);
  }
  return r;
}
function brush() {
  const r = group('p10_brush');
  stick(r, 'brush_handle', [-0.11, 0.008, 0], [0.04, 0.008, 0], 0.006, toon('#6e4b30', FINE));
  cyl(r, 'brush_ferrule', 0.008, 0.025, '#b8b2a8', [0.052, 0.008, 0], 10, FINE).rotation.z = PI / 2;
  cyl(r, 'brush_head', 0.008, 0.012, '#8e8980', [0.069, 0.008, 0], 10, FINE).rotation.z = PI / 2;
  for (let i = -2; i <= 2; i++) {
    stick(r, 'brush_bristle_row', [0.076, 0.008 + i * 0.0026, 0.003], [0.105 - Math.abs(i) * 0.002, 0.008 + i * 0.0006, 0.0007], 0.0005, toon(i % 2 ? '#80603e' : '#a07e50', { outline: false }));
  }
  const bristle = add(r, new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.04, 10), toon('#2a201a', FINE)), 'brush_bristle', [0.083, 0.008, 0]); bristle.rotation.z = -PI / 2;
  return r;
}
function egg() {
  const r = group('p10_egg');
  ball(r, 'egg_shell', 0.022, '#f1e8d6', [0, 0.028, 0], [1, 1.3, 1], FINE);
  for (const dir of [[-0.35, 0.5, 0.8], [0.35, 0.2, 0.9], [0.2, -0.25, -0.9]]) {
    const n = new THREE.Vector3(...dir).normalize();
    ball(r, 'egg_speck', 0.0014, '#c9b38f', [n.x * 0.022, 0.028 + n.y * 0.0286, n.z * 0.022], [1, 0.7, 1], { outline: false });
  }
  return r;
}
function chick() {
  const r = group('p10_chick');
  ball(r, 'chick_body', 0.032, '#f2cf4a', [0, 0.03, 0], [1, 0.9, 1.15], FINE);
  ball(r, 'chick_head', 0.021, '#f5d65a', [0, 0.066, 0.022], [1, 1, 1], FINE);
  const b = add(r, new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.014, 6), toon('#e08a2a', FINE)), 'chick_beak', [0, 0.064, 0.045]); b.rotation.x = PI / 2;
  for (const s of [-1, 1]) add(r, new THREE.Mesh(new THREE.SphereGeometry(0.0035, 6, 4), unlit('#1a1714')), 'chick_eye', [s * 0.01, 0.072, 0.039]);
  for (const s of [-1, 1]) ball(r, 'chick_wing', 0.014, '#e8bf3c', [s * 0.03, 0.032, -0.002], [0.4, 0.8, 1.1], FINE);
  for (const s of [-1, 1]) {
    cyl(r, 'chick_leg', 0.0025, 0.018, '#d58a2b', [s * 0.012, 0.006, 0.01], 6, FINE);
    for (const dx of [-0.006, 0, 0.006]) stick(r, 'chick_toe', [s * 0.012, 0.001, 0.012], [s * 0.012 + dx, 0.001, 0.028 - Math.abs(dx) * 0.5], 0.0012, toon('#d58a2b', { outline: false }));
  }
  for (const x of [-0.018, 0, 0.018]) { const t = add(r, new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.018, 6), toon('#e0b840', FINE)), 'chick_tail', [x, 0.038, -0.03]); t.rotation.x = -0.9; }
  return r;
}
function bow() {
  const r = group('p10_bow');
  const arc = add(r, new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.012, 6, 28, 1.6), toon('#5a3e26', FINE)), 'bow_limb', [-0.52, 0, 0]);
  arc.rotation.z = -0.8;
  const a = 0.8, ends = [[-0.52 + Math.cos(-a) * 0.62, Math.sin(-a) * 0.62], [-0.52 + Math.cos(a) * 0.62, Math.sin(a) * 0.62]];
  stick(r, 'bow_string', [ends[0][0], ends[0][1], 0], [ends[1][0], ends[1][1], 0], 0.0018, unlit('#e8e2d0'));
  cyl(r, 'bow_grip', 0.016, 0.1, '#3a2a1c', [0.1, 0, 0], 8, FINE);
  return r;
}

// ---------------------------------------------------------------------------
// 鼓（左右两半各一个点击盒）和挂在门洞上方的一串骨头（最下面一根是尖骨头，会掉下来）
function drum() {
  const r = group('p10_drum');
  const rope = tex(512, 128, (g, w, h) => { g.fillStyle = '#9a3a2a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e6d6b0'; g.lineWidth = 5; g.beginPath(); for (let i = 0; i <= 16; i++) { g.lineTo(i * w / 16, i % 2 ? h - 14 : 14); } g.stroke(); g.fillStyle = '#5a2418'; g.fillRect(0, 0, w, 12); g.fillRect(0, h - 12, w, 12); });
  for (let i = 0; i < 3; i++) { const a = i * 2 * PI / 3; const l = stick(r, 'drum_leg', [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], [Math.cos(a) * 0.12, 0.62, Math.sin(a) * 0.12], 0.016, toon('#4a3424', FINE)); l.castShadow = true; }
  const body = group('drum_body'); body.position.set(0, 0.78, 0); body.rotation.x = 0.22; r.add(body);
  add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.34, 24, 1, true), toon('#ffffff', { ...FINE, map: rope, side: THREE.DoubleSide })), 'drum_shell');
  const skin = add(body, new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), toon('#e9dcc0', FINE)), 'drum_skin', [0, 0.171, 0]); skin.rotation.x = -PI / 2;
  const flashes = ['L', 'R'].map((side) => {
    const m = add(body, new THREE.Mesh(new THREE.CircleGeometry(0.29, 24, side === 'L' ? PI / 2 : -PI / 2, PI), glow('#fff2c8', { opacity: 0 })), `drum_flash_${side}`, [0, 0.174, 0]);
    m.rotation.x = -PI / 2; return m;
  });
  const hits = ['L', 'R'].map((side, i) => { const h = hitBox(body, `drum_${side}`, [0.28, 0.12, 0.56], [i ? 0.145 : -0.145, 0.19, 0]); h.userData.side = side; return h; });
  r.beat = (side) => {
    const f = flashes[side === 'L' ? 0 : 1];
    return animate(260, (k) => { f.material.opacity = 0.65 * (1 - k); skin.scale.setScalar(1 - Math.sin(k * PI) * 0.02); }, Ease.outCubic).then(() => { f.material.opacity = 0; skin.scale.setScalar(1); });
  };
  r.userData.left = hits[0]; r.userData.right = hits[1]; r.userData.skinY = 0.78 + 0.17;
  return r;
}
function boneString() {
  const r = group('p10_bone_string');
  const m = toon('#ece4d0', FINE);
  box(r, 'string_beam', [0.5, 0.06, 0.06], '#4a3424', [0, 0, 0], toon('#4a3424', FINE));
  stick(r, 'string_cord', [0, 0, 0], [0, -0.78, 0], 0.004, unlit('#3a2e24'));
  for (let i = 0; i < 5; i++) {
    const y = -0.12 - i * 0.13, b = stick(r, 'string_bone', [-0.06, y, 0], [0.06, y + 0.012 * (i % 2 ? 1 : -1), 0], 0.009, m);
    b.rotation.z += (i % 2 ? 0.25 : -0.25);
    for (const s of [-1, 1]) ball(r, 'string_knob', 0.014, '#e2d8c2', [s * 0.062, y, 0], [1, 1, 1], FINE);
  }
  const tip = boneTip(); tip.name = 'string_tip'; r.add(tip);
  hitBox(tip, 'tip_hit', [0.16, 0.08, 0.1], [0, 0.012, 0]);
  hitBox(r, 'string_hit', [0.3, 0.85, 0.2], [0, -0.42, 0]);
  const hang = () => { tip.position.set(0, -0.86, 0); tip.rotation.set(0, 0, -PI / 2); };
  r.setState = ({ tip: where = 'hang', ground = [0, -1.6, 0.3] } = {}) => {
    tip.visible = where !== 'none';
    if (where === 'ground') { tip.position.fromArray(ground); tip.rotation.set(0, 0.7, 0); } else hang();
  };
  r.drop = (ground = [0, -1.6, 0.3]) => { const from = tip.position.clone(); return animate(700, (k) => { tip.position.set(from.x + (ground[0] - from.x) * k, from.y + (ground[1] - from.y) * k * k, from.z + (ground[2] - from.z) * k); tip.rotation.set(0, 0.7 * k, -PI / 2 * (1 - k)); }, Ease.linear); };
  r.userData.tip = tip.getObjectByName('tip_hit'); r.userData.string = r.getObjectByName('string_hit');
  r.setState();
  return r;
}

// ---------------------------------------------------------------------------
// 空地：母鸡和食盆（喂了虫子下一个蛋）、石井（往下有梯子）
function hen() {
  const r = group('p10_hen');
  const bird = group('hen_bird'); r.add(bird);
  ball(bird, 'hen_body', 0.16, '#b0703a', [0, 0.26, 0], [0.95, 0.85, 1.25], FINE);
  ball(bird, 'hen_breast', 0.11, '#c98a52', [0, 0.27, 0.12], [1, 1, 0.8], FINE);
  for (let i = 0; i < 4; i++) { const t = add(bird, new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), toon(i % 2 ? '#3a2a20' : '#6e4426', FINE)), 'hen_tail', [((i - 1.5) * 0.03), 0.38, -0.2]); t.rotation.x = -0.75 + i * 0.06; }
  for (const s of [-1, 1]) { const w = ball(bird, 'hen_wing', 0.1, '#8e5a2e', [s * 0.13, 0.27, -0.01], [0.35, 0.7, 1.15], FINE); w.rotation.x = 0.15; }
  const head = group('hen_head'); head.position.set(0, 0.43, 0.17); bird.add(head);
  ball(head, 'hen_skull', 0.06, '#c48a50', [0, 0, 0], [0.9, 1, 1], FINE);
  for (let i = 0; i < 3; i++) ball(head, 'hen_comb', 0.022, '#c42a24', [0, 0.055 + (i === 1 ? 0.012 : 0), -0.02 + i * 0.022], [0.45, 1, 1], FINE);
  ball(head, 'hen_wattle', 0.018, '#c42a24', [0, -0.05, 0.045], [0.6, 1.2, 0.6], FINE);
  const beak = add(head, new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.045, 6), toon('#e3b03a', FINE)), 'hen_beak', [0, -0.008, 0.07]); beak.rotation.x = PI / 2;
  for (const s of [-1, 1]) add(head, new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), unlit('#1a1714')), 'hen_eye', [s * 0.048, 0.01, 0.03]);
  for (const s of [-1, 1]) cyl(bird, 'hen_leg', 0.009, 0.14, '#e3b03a', [s * 0.05, 0.07, 0.02], 6, FINE);
  // 食盆
  const bowl = group('hen_bowl'); bowl.position.set(0.32, 0, 0.3); r.add(bowl);
  add(bowl, new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.07, 18, 1, true), toon('#8a6a48', { ...FINE, side: THREE.DoubleSide })), 'bowl_wall', [0, 0.035, 0]);
  cyl(bowl, 'bowl_floor', 0.09, 0.01, '#6e5034', [0, 0.005, 0], 18, FINE);
  const w = worm(); w.name = 'bowl_worm'; w.position.set(0, 0.012, 0); bowl.add(w);
  const e = egg(); e.name = 'hen_egg'; e.position.set(-0.22, 0, 0.12); r.add(e);
  hitBox(r, 'hen_hit', [0.36, 0.5, 0.5], [0, 0.26, 0.02]);
  hitBox(bowl, 'bowl_hit', [0.3, 0.12, 0.3], [0, 0.05, 0]);
  hitBox(e, 'egg_hit', [0.12, 0.1, 0.12], [0, 0.03, 0]);
  r.setState = ({ worm: hasWorm = false, egg: hasEgg = false } = {}) => { w.visible = hasWorm; e.visible = hasEgg; head.rotation.x = 0; bird.rotation.y = 0; };
  /** 母鸡低头啄食盆里的虫子，然后下一个蛋。 */
  r.peck = () => animate(1500, (k) => { bird.rotation.y = Math.sin(Math.min(1, k * 2) * PI / 2) * 0.55; head.rotation.x = Math.max(0, Math.sin(k * PI * 4)) * 0.6; if (k > 0.5) w.visible = false; }, Ease.linear)
    .then(() => { bird.rotation.y = 0; head.rotation.x = 0; e.visible = true; e.scale.setScalar(0.01); return animate(450, (k) => e.scale.setScalar(Math.max(0.01, k)), Ease.outBack); });
  r.userData.hen = r.getObjectByName('hen_hit'); r.userData.bowl = bowl.getObjectByName('bowl_hit'); r.userData.egg = e.getObjectByName('egg_hit');
  r.setState();
  return r;
}
function well() {
  const r = group('p10_well');
  const stone = tex(512, 128, (g, w, h) => { g.fillStyle = '#8e8a82'; g.fillRect(0, 0, w, h); g.strokeStyle = '#5e5a54'; g.lineWidth = 3; for (let row = 0; row < 3; row++) { g.beginPath(); g.moveTo(0, row * h / 3); g.lineTo(w, row * h / 3); g.stroke(); for (let i = 0; i < 10; i++) { const x = (i + (row % 2) * 0.5) * w / 10; g.beginPath(); g.moveTo(x, row * h / 3); g.lineTo(x, (row + 1) * h / 3); g.stroke(); } } });
  stone.wrapS = THREE.RepeatWrapping; stone.repeat.set(2, 1);
  const wallMat = toon('#ffffff', { ...FINE, map: stone, side: THREE.DoubleSide });
  add(r, new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.8, 0.8, 24, 1, true), wallMat), 'well_wall', [0, 0.4, 0]);
  add(r, new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.8, 24, 1, true), toon('#5e5a54', { ...FINE, side: THREE.BackSide })), 'well_inner', [0, 0.4, 0]);
  const rim = add(r, new THREE.Mesh(new THREE.RingGeometry(0.6, 0.82, 28), toon('#a39e95', { ...FINE, side: THREE.DoubleSide })), 'well_rim', [0, 0.805, 0]); rim.rotation.x = -PI / 2;
  const hole = add(r, new THREE.Mesh(new THREE.CircleGeometry(0.62, 28), unlit('#070606')), 'well_hole', [0, 0.3, 0]); hole.rotation.x = -PI / 2;
  // 梯子从井口伸出来
  const wood = toon('#6e4b30', FINE);
  for (const s of [-1, 1]) stick(r, 'ladder_rail', [s * 0.2, -0.4, -0.42], [s * 0.2, 1.25, -0.5], 0.022, wood);
  for (let i = 0; i < 5; i++) { const y = 0.35 + i * 0.22; stick(r, 'ladder_rung', [-0.2, y, -0.44 - i * 0.012], [0.2, y, -0.44 - i * 0.012], 0.014, wood); }
  hitBox(r, 'well_hit', [1.6, 1.1, 1.6], [0, 0.55, 0]);
  r.userData.hit = r.getObjectByName('well_hit');
  return r;
}

// ---------------------------------------------------------------------------
// 木屋里：柴火炉和平底锅（蛋 / 小鸡）、桌子、两幅画
function stove() {
  const r = group('p10_stove');
  const iron = toon('#2b2a2a', FINE);
  box(r, 'stove_body', [0.62, 0.52, 0.48], '#2b2a2a', [0, 0.5, 0], iron);
  box(r, 'stove_top', [0.68, 0.05, 0.54], '#1e1d1d', [0, 0.785, 0], iron);
  for (const [x, z] of [[-0.26, -0.2], [0.26, -0.2], [-0.26, 0.2], [0.26, 0.2]]) cyl(r, 'stove_leg', 0.03, 0.24, '#1e1d1d', [x, 0.12, z], 8, FINE);
  cyl(r, 'stove_pipe', 0.07, 2.9, '#2b2a2a', [-0.16, 2.25, -0.14], 12, FINE);
  const door = box(r, 'stove_door', [0.3, 0.22, 0.03], '#353333', [0.04, 0.5, 0.25], iron);
  const glowMat = unlit('#3a1a10'); const win = add(r, new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.08), glowMat), 'stove_window', [0.04, 0.53, 0.268]);
  const fireLight = new THREE.PointLight('#ff8a3a', 0, 4, 1.6); fireLight.position.set(0.04, 0.55, 0.5); r.add(fireLight);
  for (let i = 0; i < 4; i++) { const l = cyl(r, 'stove_log', 0.045, 0.42, '#6e4b30', [0.48, 0.05 + (i > 1 ? 0.085 : 0), -0.12 + (i % 2) * 0.1], 8, FINE); l.rotation.x = PI / 2; }
  // 平底锅
  const pan = group('stove_pan'); pan.position.set(0.1, 0.81, 0.02); r.add(pan);
  add(pan, new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.045, 24, 1, true), toon('#3a3838', { ...FINE, side: THREE.DoubleSide })), 'pan_wall', [0, 0.0225, 0]);
  cyl(pan, 'pan_floor', 0.13, 0.01, '#2e2c2c', [0, 0.005, 0], 24, FINE);
  stick(pan, 'pan_handle', [0.14, 0.03, 0], [0.38, 0.05, 0], 0.012, toon('#2a2020', FINE));
  const e = egg(); e.name = 'pan_egg'; e.position.set(0, 0.01, 0); e.rotation.z = PI / 2.3; pan.add(e);
  const c = chick(); c.name = 'pan_chick'; c.position.set(0, 0.01, 0); pan.add(c);
  const shells = [];
  for (const s of [-1, 1]) { const sh = add(pan, new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8, 0, 2 * PI, 0, PI / 2), toon('#f1e8d6', { ...FINE, side: THREE.DoubleSide })), 'pan_shell', [s * 0.07, 0.012, s * 0.03]); sh.rotation.x = s > 0 ? PI : 0.3; shells.push(sh); }
  hitBox(r, 'door_hit', [0.36, 0.3, 0.12], [0.04, 0.5, 0.27]);
  hitBox(pan, 'pan_hit', [0.32, 0.12, 0.32], [0, 0.04, 0]);
  const st = { lit: 0 };
  const apply = () => { glowMat.color.set('#3a1a10').lerp(new THREE.Color('#ffa040'), st.lit); fireLight.intensity = st.lit * 1.6; };
  r.setState = ({ lit = false, egg: hasEgg = false, chick: hasChick = false, shell = false } = {}) => {
    st.lit = lit ? 1 : 0; apply(); e.visible = hasEgg; c.visible = hasChick; shells.forEach((sh) => { sh.visible = shell; }); e.rotation.set(0, 0, PI / 2.3); c.scale.setScalar(1);
  };
  r.light = () => animate(800, (k) => { st.lit = k; apply(); }, Ease.outCubic);
  /** 锅里的蛋晃几下、裂开，钻出一只小鸡。 */
  r.hatch = () => animate(1400, (k) => { e.rotation.set(Math.sin(k * PI * 8) * 0.25 * k, 0, PI / 2.3); }, Ease.linear)
    .then(() => { e.visible = false; shells.forEach((sh) => { sh.visible = true; }); c.visible = true; c.scale.setScalar(0.01); return animate(500, (k) => c.scale.setScalar(Math.max(0.01, k)), Ease.outBack); });
  r.update = (dt, t) => { if (st.lit > 0.99) fireLight.intensity = 1.6 + Math.sin(t * 13) * 0.2; };
  r.userData.door = r.getObjectByName('door_hit'); r.userData.pan = pan.getObjectByName('pan_hit'); r.userData.stoveDoor = door;
  r.userData.state = st;
  r.setState();
  return r;
}
function table() {
  const r = group('p10_table');
  const wood = toon('#7a5a3e', FINE);
  box(r, 'table_top', [1.1, 0.05, 0.66], '#7a5a3e', [0, 0.745, 0], wood);
  for (const [x, z] of [[-0.5, -0.28], [0.5, -0.28], [-0.5, 0.28], [0.5, 0.28]]) box(r, 'table_leg', [0.06, 0.72, 0.06], '#6a4a30', [x, 0.36, z], wood);
  r.userData.top = 0.77;
  return r;
}

// ---- 两幅画：竖条纹面具（Ida 的脸照这个画）和红猫头鹰（井下六边形拼图的样子）----
export const STRIPE_COLORS = { white: '#efece4', green: '#5f8f3e', red: '#b3352b' };
/** 红猫头鹰的脸（脸空间：米，原点在中心，y 向上；半径约 0.33）。 */
export function drawOwlFace(g) {
  g.fillStyle = '#7e2620'; g.beginPath();
  g.moveTo(0, -0.33); g.bezierCurveTo(0.3, -0.3, 0.36, 0.05, 0.3, 0.22); g.lineTo(0.2, 0.33); g.lineTo(0.08, 0.2); g.lineTo(-0.08, 0.2); g.lineTo(-0.2, 0.33); g.lineTo(-0.3, 0.22); g.bezierCurveTo(-0.36, 0.05, -0.3, -0.3, 0, -0.33); g.fill();
  g.fillStyle = '#b8382c'; g.beginPath(); g.ellipse(0, -0.02, 0.26, 0.24, 0, 0, 2 * PI); g.fill();
  g.strokeStyle = '#5a1712'; g.lineWidth = 0.012;
  for (let i = 0; i < 16; i++) { const a = i / 16 * 2 * PI; g.beginPath(); g.moveTo(Math.cos(a) * 0.17, -0.02 + Math.sin(a) * 0.16); g.lineTo(Math.cos(a) * 0.25, -0.02 + Math.sin(a) * 0.23); g.stroke(); }
  for (const s of [-1, 1]) {
    g.fillStyle = '#f0d9b8'; g.beginPath(); g.arc(s * 0.1, 0.03, 0.075, 0, 2 * PI); g.fill();
    g.fillStyle = '#e8a23a'; g.beginPath(); g.arc(s * 0.1, 0.03, 0.05, 0, 2 * PI); g.fill();
    g.fillStyle = '#140c0a'; g.beginPath(); g.arc(s * 0.1, 0.03, 0.028, 0, 2 * PI); g.fill();
    g.strokeStyle = '#2a0e0a'; g.lineWidth = 0.02; g.beginPath(); g.moveTo(s * 0.02, 0.1); g.lineTo(s * 0.19, 0.15); g.stroke();
  }
  g.fillStyle = '#d9a23a'; g.beginPath(); g.moveTo(-0.03, -0.03); g.lineTo(0.03, -0.03); g.lineTo(0, -0.12); g.fill();
  g.strokeStyle = 'rgba(110,20,14,0.85)'; g.lineWidth = 0.008;
  for (const x of [-0.2, -0.12, 0.05, 0.16, 0.23]) { g.beginPath(); g.moveTo(x, -0.2); g.lineTo(x + 0.004, -0.31); g.stroke(); }
}
function framed(name, w, h, draw) {
  const r = group(name);
  box(r, 'frame', [w + 0.08, h + 0.08, 0.035], '#5a3e26', [0, 0, 0], toon('#5a3e26', FINE));
  const t = tex(512, Math.round(512 * h / w), (g, W, H) => draw(g, W, H));
  add(r, new THREE.Mesh(new THREE.PlaneGeometry(w, h), flat('#ffffff', { map: t, fog: false })), 'canvas', [0, 0, 0.019]);
  hitBox(r, 'painting_hit', [w + 0.08, h + 0.08, 0.06], [0, 0, 0.02]);
  return r;
}
function maskPainting() {
  return framed('p10_mask_painting', 0.46, 0.6, (g, W, H) => {
    g.fillStyle = '#2a2622'; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H * 0.5);
    g.beginPath(); g.ellipse(0, 0, W * 0.3, H * 0.36, 0, 0, 2 * PI); g.clip();
    const cols = ['green', 'white', 'red', 'white', 'green'], sw = (W * 0.6) / 5;
    cols.forEach((c, i) => { g.fillStyle = STRIPE_COLORS[c]; g.fillRect(-W * 0.3 + i * sw, -H * 0.4, sw + 1, H * 0.8); });
    g.restore();
    g.strokeStyle = '#141210'; g.lineWidth = 5; g.beginPath(); g.ellipse(W / 2, H / 2, W * 0.3, H * 0.36, 0, 0, 2 * PI); g.stroke();
    g.fillStyle = '#141210'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(W / 2 + s * W * 0.1, H * 0.44, W * 0.05, H * 0.025, 0, 0, 2 * PI); g.fill(); }
    g.beginPath(); g.ellipse(W / 2, H * 0.66, W * 0.06, H * 0.015, 0, 0, 2 * PI); g.fill();
  });
}
function owlPainting() {
  return framed('p10_owl_painting', 0.5, 0.5, (g, W, H) => {
    g.fillStyle = '#e8dcc4'; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H / 2); g.scale(W * 1.35, -H * 1.35); drawOwlFace(g); g.restore();
    g.strokeStyle = 'rgba(126,38,32,0.7)'; g.lineWidth = 3; for (const x of [0.25, 0.4, 0.62, 0.75]) { g.beginPath(); g.moveTo(W * x, H * 0.8); g.lineTo(W * x + 2, H * 0.97); g.stroke(); }
  });
}

// ---------------------------------------------------------------------------
// 井下三间石室（坐标是区域原点下的局部坐标）：
//   前室（中心 0,0）：梯子从顶上的洞下来，后墙是字母门；
//   拱龛室（中心 0, backZ）：左右墙各两个、后墙一个拱龛，石头动物面前的托架上放着面具；
//   鹰室（中心 sideX, backZ，在拱龛室右边）：靠墙一尊展翅石鹰，底座斜面上七块六边形拼图，墙上画满红色涂鸦。
// 相邻两间的墙隔 gap 厚，门洞两侧用石头补上。
export const CRYPT = {
  front: { w: 4.2, d: 4.0, h: 3.2 }, back: { w: 6.4, d: 5.6, h: 3.8 }, side: { w: 4.0, d: 4.4, h: 3.4 }, gap: 0.14,
  door: { w: 1.3, h: 2.3 }, hole: [0, 1.3], ladder: [0, 1.45], hexTilt: 0.55,
};
CRYPT.backZ = -(CRYPT.front.d / 2 + CRYPT.gap + CRYPT.back.d / 2);
CRYPT.sideX = CRYPT.back.w / 2 + CRYPT.gap + CRYPT.side.w / 2;
// 拱龛：[x, z, rotY]（拱龛室局部坐标，龛口朝屋里）
CRYPT.niches = [[-CRYPT.back.w / 2 + 0.33, 1.6, PI / 2], [-CRYPT.back.w / 2 + 0.33, -1.6, PI / 2], [0, -CRYPT.back.d / 2 + 0.33, 0], [CRYPT.back.w / 2 - 0.33, -1.6, -PI / 2], [CRYPT.back.w / 2 - 0.33, 1.6, -PI / 2]];
CRYPT.eagle = [CRYPT.side.w / 2 - 0.62, 0];   // 鹰室局部坐标；石鹰面朝 -x（门洞）
export const NICHE_ANIMALS = ['rabbit', 'pheasant', 'deer', 'pigeon', 'boar'];
function crypt() {
  const r = group('p10_crypt');
  const C = CRYPT, F = C.front, B = C.back, S = C.side, D = C.door;
  const arch = { x: 0, y: 0, w: D.w, h: D.h, arch: true };
  r.add(roomShell({ name: 'crypt_front', w: F.w, d: F.d, h: F.h, wall: '#8d8a84', spots: '50,48,46', floor: '#5e5a54', ceil: '#2e2b28', seed: 21, holes: { back: [arch] } }));
  const back = roomShell({ name: 'crypt_back', w: B.w, d: B.d, h: B.h, wall: '#7f7b74', spots: '44,42,40', floor: '#55524c', ceil: '#2a2724', seed: 23, holes: { front: [arch], right: [arch] } });
  back.position.z = C.backZ; r.add(back);
  const side = roomShell({ name: 'crypt_side', w: S.w, d: S.d, h: S.h, wall: '#857a70', spots: '60,30,26', floor: '#4e4a45', ceil: '#2a2422', seed: 27, holes: { left: [arch] } });
  side.position.set(C.sideX, 0, C.backZ); r.add(side);
  r.userData.backCenter = C.backZ;
  const stone = toon('#8e8a82', FINE), dark = toon('#3a3734', FINE);
  // 两个门洞里的墙厚（侧面和顶）
  const jamb = (cx, cz, alongX) => {
    const g = C.gap + 0.02;
    for (const s of [-1, 1]) box(r, 'door_jamb', alongX ? [g, D.h, 0.2] : [0.2, D.h, g], '#77736c', alongX ? [cx, D.h / 2, cz + s * (D.w / 2 + 0.1)] : [cx + s * (D.w / 2 + 0.1), D.h / 2, cz], stone);
    box(r, 'door_lintel', alongX ? [g, 0.5, D.w + 0.4] : [D.w + 0.4, 0.5, g], '#77736c', [cx, D.h + 0.25, cz], stone);
  };
  jamb(0, -F.d / 2 - C.gap / 2, false);
  jamb(B.w / 2 + C.gap / 2, C.backZ, true);
  // 顶上的洞和梯子
  const hole = add(r, new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), unlit('#c9b48a', { fog: false })), 'crypt_hole', [C.hole[0], F.h - 0.004, C.hole[1]]); hole.rotation.x = PI / 2;
  const wood = toon('#6e4b30', FINE);
  for (const s of [-1, 1]) stick(r, 'ladder_rail', [s * 0.22, 0, C.ladder[1] + 0.3], [s * 0.22, F.h + 0.4, C.ladder[1] - 0.05], 0.025, wood);
  for (let i = 0; i < 11; i++) { const y = 0.25 + i * 0.28; const z = C.ladder[1] + 0.3 - (y / (F.h + 0.4)) * 0.35; stick(r, 'ladder_rung', [-0.22, y, z], [0.22, y, z], 0.016, wood); }
  hitBox(r, 'ladder_hit', [0.7, 2.4, 0.5], [0, 1.2, C.ladder[1] + 0.15]);
  // 前室墙上两个火把座；三间屋各一盏暖光（鹰室偏红）
  for (const s of [-1, 1]) {
    box(r, 'sconce', [0.08, 0.3, 0.12], '#3a3734', [s * (F.w / 2 - 0.06), 1.8, -0.4], dark);
    add(r, new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 8, 1, true), glow('#ffa040', { opacity: 0.8, side: THREE.DoubleSide })), 'sconce_flame', [s * (F.w / 2 - 0.1), 2.05, -0.4]);
  }
  for (const [x, y, z, color, power, dist] of [[0, 2.4, 0.2, '#ffb070', 3.2, 9], [0, 2.9, C.backZ + 0.6, '#ffb070', 3.4, 11], [C.sideX - 0.4, 2.6, C.backZ, '#ff7a50', 3.0, 8]]) {
    const l = new THREE.PointLight(color, power, dist, 1.4); l.position.set(x, y, z); r.add(l);
  }
  r.add(new THREE.HemisphereLight('#8d8778', '#2c2620', 0.7));
  // 字母门：石板上四个字母轮（每个是一个横放的六棱柱，前面窗口里露出一个字母）
  const door = group('letter_door'); door.position.set(0, 0, -F.d / 2); r.add(door);
  box(door, 'door_slab', [D.w + 0.06, D.h, 0.16], '#77736c', [0, D.h / 2, -0.04], toon('#77736c', FINE));
  box(door, 'door_panel', [0.86, 0.36, 0.05], '#4e4a45', [0, 1.35, 0.06], dark);
  const wheels = LETTERS.map((col, i) => {
    const w = group(`letter_wheel_${i}`); w.position.set(-0.3 + i * 0.2, 1.35, 0.1); door.add(w);
    const n = col.length, R = 0.085;
    col.forEach((ch, k) => {
      const t = tex(128, 128, (g, W, H) => { g.fillStyle = '#d9d2c2'; g.fillRect(0, 0, W, H); g.strokeStyle = '#6e685f'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6); g.fillStyle = '#231e1a'; g.font = 'bold 92px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, W / 2, H / 2 + 6); });
      const face = add(w, new THREE.Mesh(new THREE.PlaneGeometry(0.15, 2 * R * Math.tan(PI / n)), toon('#ffffff', { ...FINE, map: t })), 'letter_face', [0, 0, 0]);
      const a = -k * 2 * PI / n;   // 第 k 个字母朝前（+Z）时轮子转了 k 格
      face.position.set(0, Math.sin(-a) * R, Math.cos(-a) * R); face.rotation.x = a;
    });
    const hit = hitBox(w, `wheel_${i}`, [0.17, 0.2, 0.2], [0, 0, 0.05]); hit.userData.wheel = i;
    w.userData.hit = hit;
    return w;
  });
  // 门顶上刻一个带眼睛的立方体符号
  const sign = tex(256, 256, (g, W) => { g.strokeStyle = '#2a2622'; g.lineWidth = 9; g.lineJoin = 'round'; g.beginPath(); g.moveTo(W * 0.5, W * 0.12); g.lineTo(W * 0.86, W * 0.3); g.lineTo(W * 0.86, W * 0.7); g.lineTo(W * 0.5, W * 0.88); g.lineTo(W * 0.14, W * 0.7); g.lineTo(W * 0.14, W * 0.3); g.closePath(); g.moveTo(W * 0.14, W * 0.3); g.lineTo(W * 0.5, W * 0.48); g.lineTo(W * 0.86, W * 0.3); g.moveTo(W * 0.5, W * 0.48); g.lineTo(W * 0.5, W * 0.88); g.stroke(); g.fillStyle = '#2a2622'; g.beginPath(); g.ellipse(W * 0.5, W * 0.3, W * 0.1, W * 0.05, 0, 0, 2 * PI); g.fill(); g.fillStyle = '#d9d2c2'; g.beginPath(); g.arc(W * 0.5, W * 0.3, W * 0.025, 0, 2 * PI); g.fill(); });
  add(r, new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), toon('#ffffff', { ...FINE, map: sign, transparent: true })), 'door_sign', [0, D.h + 0.4, -F.d / 2 + 0.012]);
  const doorHit = hitBox(r, 'doorway_hit', [D.w, D.h, 0.3], [0, D.h / 2, -F.d / 2 - 0.2]);
  // 拱龛室：五个拱龛（拱框 + 石台 + 动物雕像，雕像前面的小托架上放面具）
  const nicheMat = toon('#6a6660', FINE);
  const slots = [];
  C.niches.forEach(([x, z, rotY], i) => {
    const n = group(`niche_${i}`); n.position.set(x, 0, C.backZ + z); n.rotation.y = rotY; r.add(n);
    const archPts = []; for (let k = 0; k <= 16; k++) { const a = PI * k / 16; archPts.push([Math.cos(a) * 0.55, 1.75 + Math.sin(a) * 0.55]); }
    const back = add(n, new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(V2([[-0.55, 0], [0.55, 0], ...archPts]))), unlit('#24211f', { fog: false })), 'niche_back', [0, 0, -0.31]);
    back.renderOrder = -1;
    for (const s of [-1, 1]) box(n, 'niche_pillar', [0.12, 1.75, 0.12], '#8e8a82', [s * 0.61, 0.875, -0.25], stone);
    add(n, new THREE.Mesh(new THREE.TorusGeometry(0.61, 0.06, 6, 16, PI), stone), 'niche_arch', [0, 1.75, -0.25]);
    box(n, 'niche_plinth', [0.7, 0.7, 0.55], '#8e8a82', [0, 0.35, -0.05], stone);
    statue(n, NICHE_ANIMALS[i]);
    const slot = group(`mask_slot_${i}`); slot.position.set(0, 0.86, 0.24); n.add(slot);
    box(n, 'mask_shelf', [0.36, 0.04, 0.2], '#6a6660', [0, 0.72, 0.2], nicheMat);
    slots.push(slot);
  });
  // 鹰室：墙上的红色涂鸦、石鹰和六边形拼图
  const graffiti = tex(1024, 640, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    const rr = rng(31);
    g.strokeStyle = 'rgba(150,30,22,0.85)'; g.fillStyle = 'rgba(150,30,22,0.85)'; g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {   // 猫头鹰脸
      const x = 60 + rr() * (W - 120), y = 60 + rr() * (H - 160), s = 30 + rr() * 40;
      g.lineWidth = 4; g.beginPath(); g.ellipse(x, y, s, s * 0.9, 0, 0, 2 * PI); g.stroke();
      for (const k of [-1, 1]) { g.beginPath(); g.arc(x + k * s * 0.38, y - s * 0.1, s * 0.25, 0, 2 * PI); g.stroke(); g.beginPath(); g.arc(x + k * s * 0.38, y - s * 0.1, s * 0.08, 0, 2 * PI); g.fill(); }
      g.beginPath(); g.moveTo(x - s * 0.08, y + s * 0.15); g.lineTo(x, y + s * 0.35); g.lineTo(x + s * 0.08, y + s * 0.15); g.stroke();
    }
    g.lineWidth = 3;
    for (let i = 0; i < 26; i++) {   // 眼睛、螺旋、计数刻痕
      const x = rr() * W, y = rr() * H * 0.9, s = 10 + rr() * 22, kind = i % 3;
      g.beginPath();
      if (kind === 0) { g.ellipse(x, y, s, s * 0.45, 0, 0, 2 * PI); g.stroke(); g.beginPath(); g.arc(x, y, s * 0.2, 0, 2 * PI); g.fill(); }
      else if (kind === 1) { for (let a = 0; a < 12; a += 0.3) g.lineTo(x + Math.cos(a) * a * s * 0.12, y + Math.sin(a) * a * s * 0.12); g.stroke(); }
      else { for (let k = 0; k < 5; k++) { g.moveTo(x + k * 7, y); g.lineTo(x + k * 7 + 2, y + s * 1.4); } g.moveTo(x - 4, y + s * 1.1); g.lineTo(x + 34, y + s * 0.3); g.stroke(); }
    }
    for (let i = 0; i < 14; i++) { const x = rr() * W; g.lineWidth = 2; g.beginPath(); g.moveTo(x, H * (0.55 + rr() * 0.3)); g.lineTo(x + 2, H); g.stroke(); }   // 往下淌的红痕
  });
  for (const [x, z, rotY, w] of [[C.sideX + S.w / 2 - 0.012, C.backZ, -PI / 2, S.d - 0.2], [C.sideX, C.backZ - S.d / 2 + 0.012, 0, S.w - 0.2], [C.sideX, C.backZ + S.d / 2 - 0.012, PI, S.w - 0.2]]) {
    const p = add(r, new THREE.Mesh(new THREE.PlaneGeometry(w, 2.6), unlit('#ffffff', { map: graffiti, transparent: true, fog: false })), 'crypt_graffiti', [x, 1.65, z]);
    p.rotation.y = rotY;
  }
  const eagle = group('eagle'); eagle.position.set(C.sideX + C.eagle[0], 0, C.backZ + C.eagle[1]); eagle.rotation.y = -PI / 2; r.add(eagle);
  box(eagle, 'eagle_pedestal', [0.9, 1.05, 0.7], '#8e8a82', [0, 0.525, -0.1], stone);
  ball(eagle, 'eagle_body', 0.28, '#9a968e', [0, 1.45, -0.15], [0.8, 1.15, 0.75], FINE);
  ball(eagle, 'eagle_head', 0.13, '#a39f97', [0, 1.88, -0.05], [0.9, 1, 1.05], FINE);
  const eb = add(eagle, new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 8), toon('#8a857c', FINE)), 'eagle_beak', [0, 1.85, 0.09]); eb.rotation.x = PI / 2 + 0.5;
  for (const s of [-1, 1]) {
    const wpts = [[0, 0], [0.25, 0.25], [0.55, 0.55], [0.85, 0.75], [0.95, 0.6], [0.8, 0.45], [0.9, 0.35], [0.7, 0.25], [0.75, 0.12], [0.5, 0.05], [0.45, -0.1], [0.2, -0.12]];
    const wing = add(eagle, new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(V2(wpts.map(([x, y]) => [x * s, y]))), { depth: 0.06, bevelEnabled: false }), toon('#9a968e', FINE)), 'eagle_wing', [s * 0.12, 1.4, -0.21]);
    wing.rotation.y = -s * 0.15;
  }
  // 底座正面接出一个斜面（像讲经台），斜面上的石板嵌着七块六边形（中间一块 + 周围六块）
  const wedge = add(eagle, new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(V2([[0.25, 0], [0.69, 0], [0.69, 0.36], [0.27, 1.05], [0.25, 1.05]])), { depth: 0.82, bevelEnabled: false }), stone), 'hex_wedge', [0.41, 0, 0]);
  wedge.rotation.y = -PI / 2;
  const hexBase = group('hex_base'); hexBase.position.set(0, 0.75, 0.52); hexBase.rotation.x = -C.hexTilt; eagle.add(hexBase);
  box(hexBase, 'hex_slab', [0.82, 0.78, 0.06], '#6e6a63', [0, 0, -0.035], toon('#6e6a63', FINE));
  const HR = 0.11, tiles = [];
  const centers = [[0, 0], ...Array.from({ length: 6 }, (_, k) => { const a = PI / 2 + k * PI / 3; return [Math.cos(a) * HR * Math.sqrt(3), Math.sin(a) * HR * Math.sqrt(3)]; })];
  const hexShape = new THREE.Shape(V2(Array.from({ length: 6 }, (_, k) => { const a = k * PI / 3; return [Math.cos(a) * HR * 0.97, Math.sin(a) * HR * 0.97]; })));
  const faceGeo = new THREE.ShapeGeometry(hexShape); const uv = faceGeo.attributes.uv, pos = faceGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / (2 * HR) + 0.5, pos.getY(i) / (2 * HR) + 0.5);
  const SC = 0.75;   // 拼图上的猫头鹰脸比画小一点（脸空间半径 0.33 → 约 0.25 m）
  centers.forEach(([cx, cy], i) => {
    const t = tex(256, 256, (g, W) => {
      g.fillStyle = '#d9cdb4'; g.fillRect(0, 0, W, W);
      g.save(); g.translate(W / 2, W / 2); g.scale(W / (2 * HR), -W / (2 * HR)); g.translate(-cx, -cy); g.scale(SC, SC); drawOwlFace(g); g.restore();
    });
    const tile = group(`hex_tile_${i}`); tile.position.set(cx, cy, 0.01); hexBase.add(tile);
    add(tile, new THREE.Mesh(new THREE.ExtrudeGeometry(hexShape, { depth: 0.03, bevelEnabled: false }), toon('#8e8a82', FINE)), 'hex_body', [0, 0, -0.025]);
    add(tile, new THREE.Mesh(faceGeo, toon('#ffffff', { ...FINE, map: t })), 'hex_face', [0, 0, 0.007]);
    const hit = hitBox(tile, `hex_${i}`, [HR * 1.7, HR * 1.7, 0.05], [0, 0, 0.01]); hit.userData.hex = i;
    tile.userData.hit = hit;
    tiles.push(tile);
  });
  const hexGlow = add(hexBase, new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), glow('#ff6a3a', { opacity: 0 })), 'hex_glow', [0, 0, 0.03]);
  hitBox(eagle, 'eagle_hit', [1.0, 1.0, 0.6], [0, 1.6, -0.15]);
  // 黑方块（Elizabeth 交出来以后放在石鹰底座顶上）
  const cube = box(eagle, 'crypt_cube', [0.14, 0.14, 0.14], '#121212', [0.3, 1.12, 0.12], toon('#121212', FINE));
  cube.rotation.y = 0.5;
  const st = { letters: [0, 0, 0, 0], open: 0, hex: [...HEX_START], solved: 0 };
  const turnTo = (w, k, n) => { w.rotation.x = k * 2 * PI / n; };
  const apply = () => {
    wheels.forEach((w, i) => turnTo(w, st.letters[i], LETTERS[i].length));
    door.position.y = -st.open * (D.h + 0.1); door.visible = st.open < 0.999;
    tiles.forEach((t, i) => { t.rotation.z = -st.hex[i] * PI / 3; });
    hexGlow.material.opacity = 0.35 * st.solved; hexGlow.visible = st.solved > 0.01;
  };
  r.setState = ({ letters = [0, 0, 0, 0], open = false, hex = HEX_START, solved = false, cube: hasCube = false } = {}) => {
    st.letters = [...letters]; st.open = open ? 1 : 0; st.hex = [...hex]; st.solved = solved ? 1 : 0; cube.visible = hasCube; apply();
  };
  r.turnWheel = (i, to) => { const w = wheels[i], n = LETTERS[i].length, from = w.rotation.x, target = to * 2 * PI / n, end = target < from ? target + 2 * PI : target; return animate(280, (k) => { w.rotation.x = from + (end - from) * k; }, Ease.outCubic).then(() => { w.rotation.x = target % (2 * PI); st.letters[i] = to; }); };
  r.openDoor = () => animate(1800, (k) => { st.open = k; apply(); }, Ease.inOutSine);
  r.turnHex = (i, to) => { const t = tiles[i], from = t.rotation.z, target = -to * PI / 3, end = target > from ? target - 2 * PI : target; return animate(240, (k) => { t.rotation.z = from + (end - from) * k; }, Ease.outCubic).then(() => { t.rotation.z = target; st.hex[i] = to; }); };
  r.solveHex = () => animate(1200, (k) => { st.solved = k; apply(); }, Ease.inOutSine);
  r.userData.wheels = wheels.map((w) => w.userData.hit); r.userData.tiles = tiles.map((t) => t.userData.hit); r.userData.door = doorHit;
  r.userData.ladder = r.getObjectByName('ladder_hit'); r.userData.eagle = eagle.getObjectByName('eagle_hit'); r.userData.slots = slots; r.userData.cube = cube;
  r.userData.letterDoor = door; r.userData.hexBase = hexBase; r.userData.eagleGroup = eagle; r.userData.state = st;
  r.setState();
  return r;
}
/** 拱龛里的石头动物（只做上半身和头，认得出是哪种动物就行）。 */
function statue(parent, kind) {
  const g = group(`statue_${kind}`); g.position.set(0, 0.7, -0.12); parent.add(g);
  const m = toon('#a8a49c', FINE), mDark = toon('#8e8a82', FINE);
  const B = (name, r, p, s) => { const o = add(g, new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), m), name, p); o.scale.fromArray(s); return o; };
  B('statue_body', 0.2, [0, 0.3, -0.05], [1, 1.25, 0.8]);
  const head = kind === 'pheasant' || kind === 'pigeon' ? B('statue_head', 0.11, [0, 0.68, 0.02], [1, 1, 1.1]) : B('statue_head', 0.13, [0, 0.68, 0.02], [0.95, 1, 1.15]);
  if (kind === 'rabbit') for (const s of [-1, 1]) { const e = B('statue_ear', 0.05, [s * 0.05, 0.92, -0.02], [0.6, 2.6, 0.4]); e.rotation.z = -s * 0.15; }
  if (kind === 'deer') for (const s of [-1, 1]) { stick(g, 'statue_antler', [s * 0.06, 0.78, 0], [s * 0.2, 1.0, -0.02], 0.016, mDark); stick(g, 'statue_antler', [s * 0.15, 0.93, -0.01], [s * 0.13, 1.06, 0.03], 0.012, mDark); stick(g, 'statue_antler', [s * 0.1, 0.86, 0], [s * 0.04, 0.98, 0.02], 0.012, mDark); }
  if (kind === 'boar') { const sn = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 12), mDark), 'statue_snout', [0, 0.64, 0.14]); sn.rotation.x = PI / 2; for (const s of [-1, 1]) { const tk = add(g, new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.07, 6), toon('#d8d2c4', FINE)), 'statue_tusk', [s * 0.06, 0.6, 0.17]); tk.rotation.z = s * 0.5; } }
  if (kind === 'pheasant' || kind === 'pigeon') { const bk = add(g, new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 8), mDark), 'statue_beak', [0, 0.67, 0.14]); bk.rotation.x = PI / 2; }
  if (kind === 'pheasant') { const crest = add(g, new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 6), mDark), 'statue_crest', [0, 0.8, -0.02]); crest.rotation.x = -0.4; }
  head.castShadow = true;
  return g;
}

// ---------------------------------------------------------------------------
// 结尾的红色幻象：一圈剪影卡片（黑影、戴面具的一家人、全家合影、鸟笼里的人、小船上的母子、火刑柱、戴猫头鹰面具的女人、少年），
// 最后中间升起一张猫头鹰的大脸，眼睛亮起来。原点在观看位置，卡片在 -Z 方向围成半圈。
const VISION_CARDS = ['shadow', 'masks', 'family', 'cage', 'boat', 'stake', 'owlwoman', 'boy'];
function drawSilhouette(g, kind, W, H) {
  g.save(); g.translate(W / 2, H / 2); const s = Math.min(W, H); g.scale(s, s);
  g.fillStyle = '#0c0606'; g.strokeStyle = '#0c0606'; g.lineCap = 'round'; g.lineJoin = 'round';
  const E = (x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, 2 * PI); g.fill(); };
  const person = (x, y, h, { dress = false } = {}) => { E(x, y - h * 0.42, h * 0.07, h * 0.08); g.beginPath(); g.moveTo(x - h * (dress ? 0.16 : 0.1), y + h * 0.5); g.lineTo(x - h * 0.09, y - h * 0.3); g.lineTo(x + h * 0.09, y - h * 0.3); g.lineTo(x + h * (dress ? 0.16 : 0.1), y + h * 0.5); g.fill(); };
  if (kind === 'shadow') drawShadowFigure(g, 'mother', 1, 1);
  else if (kind === 'masks') {
    [-0.32, -0.16, 0, 0.16, 0.32].forEach((x, i) => {
      person(x, 0.12, 0.62, { dress: i === 2 || i === 3 });
      if (i === 0) { E(x - 0.03, -0.27, 0.015, 0.07, -0.2); E(x + 0.03, -0.27, 0.015, 0.07, 0.2); }
      if (i === 1) { g.lineWidth = 0.012; g.beginPath(); g.moveTo(x, -0.2); g.lineTo(x - 0.06, -0.32); g.moveTo(x, -0.2); g.lineTo(x + 0.06, -0.32); g.stroke(); }
      if (i === 2) E(x + 0.04, -0.15, 0.04, 0.012);
      if (i === 4) E(x, -0.14, 0.05, 0.03);
    });
  } else if (kind === 'family') { person(-0.22, 0.1, 0.7); person(-0.07, 0.12, 0.62, { dress: true }); person(0.08, 0.2, 0.42); person(0.22, 0.08, 0.72); }
  else if (kind === 'cage') {
    g.lineWidth = 0.012; for (let i = 0; i <= 8; i++) { const x = -0.22 + i * 0.055; g.beginPath(); g.moveTo(x, 0.38); g.lineTo(x, -0.18); g.stroke(); }
    g.beginPath(); g.arc(0, -0.18, 0.22, PI, 0); g.stroke(); g.fillRect(-0.26, 0.36, 0.52, 0.04); g.beginPath(); g.moveTo(0, -0.4); g.lineTo(0, -0.46); g.stroke();
    person(0, 0.14, 0.42);
  } else if (kind === 'boat') {
    g.beginPath(); g.moveTo(-0.4, 0.12); g.quadraticCurveTo(0, 0.32, 0.4, 0.12); g.lineTo(0.32, 0.1); g.lineTo(-0.32, 0.1); g.fill();
    person(-0.08, -0.08, 0.36, { dress: true }); person(0.1, 0, 0.2);
    g.lineWidth = 0.01; g.beginPath(); g.moveTo(-0.5, 0.26); for (let x = -0.5; x <= 0.5; x += 0.05) g.lineTo(x, 0.26 + Math.sin(x * 30) * 0.01); g.stroke();
  } else if (kind === 'stake') {
    g.fillRect(-0.02, -0.4, 0.04, 0.8); person(0, -0.02, 0.5);
    for (let i = 0; i < 7; i++) { const x = -0.3 + i * 0.1; g.beginPath(); g.moveTo(x - 0.06, 0.42); g.quadraticCurveTo(x, 0.1 - (i % 2) * 0.1, x + 0.06, 0.42); g.fill(); }
  } else if (kind === 'owlwoman') {
    person(0, 0.1, 0.78, { dress: true });
    E(0, -0.24, 0.1, 0.09); for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * 0.05, -0.31); g.lineTo(sd * 0.11, -0.4); g.lineTo(sd * 0.1, -0.28); g.fill(); }
    g.fillStyle = '#f1d9b0'; for (const sd of [-1, 1]) E(sd * 0.045, -0.24, 0.03, 0.03);
  } else if (kind === 'boy') person(0, 0.18, 0.52);
  g.restore();
}
function vision() {
  const r = group('p10_vision');
  const room = add(r, new THREE.Mesh(new THREE.SphereGeometry(14, 32, 16), unlit('#5a0c08', { side: THREE.BackSide, fog: false })), 'vision_room');
  room.renderOrder = -10;
  const glowTex = tex(256, 256, (g, w) => { const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); grd.addColorStop(0, 'rgba(255,120,60,0.8)'); grd.addColorStop(1, 'rgba(255,60,20,0)'); g.fillStyle = grd; g.fillRect(0, 0, w, w); });
  add(r, new THREE.Mesh(new THREE.PlaneGeometry(12, 12), glow('#ffffff', { map: glowTex, opacity: 0.6, fog: false })), 'vision_glow', [0, 1.6, -9]);
  const cards = VISION_CARDS.map((kind, i) => {
    const t = tex(512, 512, (g, W, H) => { g.clearRect(0, 0, W, H); g.shadowColor = 'rgba(255,90,40,0.9)'; g.shadowBlur = 18; drawSilhouette(g, kind, W, H); });
    const a = -1.15 + i * (2.3 / (VISION_CARDS.length - 1));
    const m = add(r, new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), unlit('#ffffff', { map: t, transparent: true, depthWrite: false, opacity: 0, fog: false })), `vision_${kind}`, [Math.sin(a) * 4.2, 1.5 + (i % 2) * 0.35, -Math.cos(a) * 4.2]);
    m.lookAt(0, 1.6, 0); m.renderOrder = 2; m.visible = false;
    return m;
  });
  const faceTex = tex(512, 512, (g, W) => { g.save(); g.translate(W / 2, W / 2); g.scale(W * 1.3, -W * 1.3); drawOwlFace(g); g.restore(); });
  const owl = add(r, new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5), unlit('#ffffff', { map: faceTex, transparent: true, depthWrite: false, opacity: 0, fog: false })), 'vision_owl', [0, 1.8, -6.5]);
  owl.visible = false; owl.renderOrder = 3;
  const eyes = [-1, 1].map((s) => { const e = add(owl, new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), glow('#ffd070', { opacity: 0, fog: false })), 'vision_owl_eye', [s * 0.55, 0.22, 0.02]); return e; });
  r.setState = ({ shown = 0, owl: owlOn = false } = {}) => {
    cards.forEach((c, i) => { c.visible = i < shown; c.material.opacity = i < shown ? 1 : 0; });
    owl.visible = owlOn; owl.material.opacity = owlOn ? 1 : 0; eyes.forEach((e) => { e.material.opacity = owlOn ? 0.9 : 0; });
  };
  /** 剪影一张接一张浮现，最后猫头鹰的脸升起来、眼睛亮。onCard(i) 每张卡片出现时回调（放音效）。 */
  r.play = async (onCard) => {
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i]; c.visible = true; onCard?.(i);
      await animate(650, (k) => { c.material.opacity = k; }, Ease.outCubic);
    }
    owl.visible = true; owl.position.y = 0.6;
    await animate(1800, (k) => { owl.material.opacity = k; owl.position.y = 0.6 + k * 1.2; cards.forEach((c) => { c.material.opacity = 1 - k * 0.6; }); }, Ease.inOutSine);
    await animate(900, (k) => eyes.forEach((e) => { e.material.opacity = 0.9 * k; }), Ease.outCubic);
  };
  r.setState();
  return r;
}

// ---------------------------------------------------------------------------
// 戴猫头鹰面具的女人（Elizabeth）的面具：挂在她头骨骼上（章节里藏起她自己的头）
function owlMask() {
  const r = group('p10_owl_mask');
  const fur = toon('#a9814f', FINE), pale = toon('#efe2c8', FINE);
  ball(r, 'owlmask_head', 0.13, '#a9814f', [0, 0.06, 0], [1, 1.05, 0.95], FINE);
  const disc = ball(r, 'owlmask_face', 0.11, '#efe2c8', [0, 0.05, 0.07], [1.05, 1, 0.45], FINE);
  disc.material = pale;
  for (const s of [-1, 1]) {
    add(r, new THREE.Mesh(new THREE.CircleGeometry(0.034, 18), unlit('#f0a832')), 'owlmask_eye', [s * 0.045, 0.07, 0.122]);
    add(r, new THREE.Mesh(new THREE.CircleGeometry(0.015, 12), unlit('#140c0a')), 'owlmask_pupil', [s * 0.045, 0.07, 0.125]);
    const ear = add(r, new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.11, 6), fur), 'owlmask_ear', [s * 0.08, 0.2, 0.0]); ear.rotation.z = -s * 0.35;
  }
  const beak = add(r, new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 6), toon('#c9a043', FINE)), 'owlmask_beak', [0, 0.02, 0.13]); beak.rotation.x = PI + 0.4;
  return r;
}

export const FACTORIES = {
  p10_wood_owl: woodOwl, p10_torch: torchPillar, p10_owl_stump: owlStump,
  p10_feather: featherModel, p10_arrow: arrowModel, p10_bone_tip: boneTip, p10_apple: apple, p10_worm: worm, p10_brush: brush,
  p10_egg: egg, p10_chick: chick, p10_bow: bow, p10_drum: drum, p10_bone_string: boneString,
  p10_hen: hen, p10_well: well, p10_stove: stove, p10_table: table, p10_mask_painting: maskPainting, p10_owl_painting: owlPainting,
  p10_crypt: crypt, p10_vision: vision, p10_owl_mask: owlMask,
};
export { FACE_START };
