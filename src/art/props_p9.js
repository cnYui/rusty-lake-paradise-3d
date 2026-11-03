// 第九灾（夜灾）专属道具工厂：id 一律 p9_ 前缀（设计见 docs/plague9_10_design.md）。
// 模型只呈现传入的状态（setState …），玩法真值在章节的 flags 和物品栏里。尺寸按米建。
// 这里还有第九、十灾共用的东西：十二星座符号 zodiacGlyph、篝火烟里的黑影剪影 drawShadowFigure、远处的星星和月亮 p9_sky。
// 塔里（一层白墙房间、阁楼、塔顶平台）的道具在 props_p9_tower.js。
import * as THREE from 'three';
import { toon, unlit, flat, canvasTexture } from './materials.js';
import { animate, Ease } from '../core/tween.js';
import { PI, group, add, box, ball, cyl, ring } from './p5_kit.js';
import { plaguePainting } from './props_p6.js';

export const FINE = { outline: 0.0022 };
const HIT = new THREE.MeshBasicMaterial({ visible: false }); HIT.userData.outlineParameters = { visible: false };
/** 多面体按平面法线着色（卡通材质没有 flatShading）。 */
const faceted = (geo) => { geo.computeVertexNormals(); return geo; };
/** 不可见的点击盒（热点射线只认带 proxy 标记的不可见网格）。 */
export function hitBox(parent, name, size, pos = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), HIT); m.name = name; m.userData.proxy = true; m.position.fromArray(pos); parent.add(m); return m;
}
export const tex = (w, h, draw) => canvasTexture(w, h, draw, { wrap: false });
export const glow = (color, opts = {}) => unlit(color, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...opts });
const k01 = (x) => Math.min(1, Math.max(0, x));

// 粉末的颜色（研磨机出料、篝火火苗、塔门符号都用这一份）
export const POWDER_COLORS = { powder_brown: '#8a5a32', powder_white: '#efece4', powder_blue: '#4f86c6', powder_red: '#c23a2e', powder_bone: '#d9d2bf' };

// ---------------------------------------------------------------------------
// 十二星座符号（0 白羊 1 金牛 2 双子 3 巨蟹 4 狮子 5 处女 6 天秤 7 天蝎 8 射手 9 摩羯 10 水瓶 11 双鱼）
export const ZODIAC = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
/** 在 (x, y) 画一个边长约 s 的星座符号（线宽 lw 像素），用调用方的 strokeStyle。 */
export function zodiacGlyph(g, i, x, y, s, lw = s * 0.09) {
  g.save(); g.translate(x, y); g.scale(s, s); g.lineWidth = lw / s; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  const M = (a, b) => g.moveTo(a, b), L = (a, b) => g.lineTo(a, b), Q = (a, b, c, d) => g.quadraticCurveTo(a, b, c, d);
  const C = (a, b, c, d, e, f) => g.bezierCurveTo(a, b, c, d, e, f), O = (cx, cy, r) => { g.moveTo(cx + r, cy); g.arc(cx, cy, r, 0, 2 * PI); };
  switch (((i % 12) + 12) % 12) {
    case 0: M(0, 0.42); L(0, -0.05); for (const s of [-1, 1]) { M(0, -0.05); Q(s * 0.05, -0.44, s * 0.25, -0.4); Q(s * 0.44, -0.34, s * 0.37, -0.12); } break;
    case 1: O(0, 0.14, 0.24); M(-0.4, -0.42); Q(-0.3, -0.1, 0, -0.1); Q(0.3, -0.1, 0.4, -0.42); break;
    case 2: M(-0.36, -0.38); Q(0, -0.27, 0.36, -0.38); M(-0.36, 0.38); Q(0, 0.27, 0.36, 0.38); M(-0.15, -0.32); L(-0.15, 0.32); M(0.15, -0.32); L(0.15, 0.32); break;
    case 3: O(-0.2, -0.13, 0.1); M(-0.2, -0.23); Q(0.18, -0.38, 0.4, -0.12); O(0.2, 0.13, 0.1); M(0.2, 0.23); Q(-0.18, 0.38, -0.4, 0.12); break;
    case 4: O(-0.2, 0.16, 0.12); M(-0.1, 0.09); C(-0.22, -0.48, 0.36, -0.48, 0.16, 0.0); Q(0.04, 0.3, 0.34, 0.38); break;
    case 5: M(-0.4, -0.25); L(-0.4, 0.36); M(-0.4, -0.12); Q(-0.28, -0.36, -0.15, -0.12); L(-0.15, 0.36); M(-0.15, -0.12); Q(-0.02, -0.36, 0.1, -0.12); L(0.1, 0.24);
      Q(0.12, 0.44, 0.34, 0.3); Q(0.42, 0.02, 0.1, 0.16); break;
    case 6: M(-0.42, 0.3); L(0.42, 0.3); M(-0.42, 0.08); L(-0.15, 0.08); C(-0.3, -0.4, 0.3, -0.4, 0.15, 0.08); L(0.42, 0.08); break;
    case 7: M(-0.4, -0.25); L(-0.4, 0.3); M(-0.4, -0.12); Q(-0.28, -0.36, -0.15, -0.12); L(-0.15, 0.3); M(-0.15, -0.12); Q(-0.02, -0.36, 0.1, -0.12); L(0.1, 0.24);
      Q(0.14, 0.36, 0.4, 0.3); M(0.27, 0.18); L(0.4, 0.3); L(0.3, 0.43); break;
    case 8: M(-0.36, 0.36); L(0.36, -0.36); M(0.06, -0.36); L(0.36, -0.36); L(0.36, -0.06); M(-0.3, -0.06); L(0.06, 0.3); break;
    case 9: M(-0.4, -0.32); L(-0.22, 0.2); L(-0.04, -0.32); L(0.04, 0.18); C(0.1, 0.44, 0.44, 0.32, 0.32, 0.1); Q(0.18, -0.06, 0.1, 0.28); Q(0.02, 0.46, -0.14, 0.4); break;
    case 10: for (const yy of [-0.08, 0.18]) { M(-0.42, yy); L(-0.21, yy - 0.13); L(0, yy); L(0.21, yy - 0.13); L(0.42, yy); } break;
    default: M(-0.32, -0.4); Q(-0.04, 0, -0.32, 0.4); M(0.32, -0.4); Q(0.04, 0, 0.32, 0.4); M(-0.28, 0); L(0.28, 0); break;
  }
  g.stroke(); g.restore();
}

/** 篝火烟里浮出的黑影（第九灾）：aries 公羊头、libra 天平、gemini 双生子、scorpio 蝎子、mother 母亲。黑色、边缘发虚、白眼睛。 */
export function drawShadowFigure(g, kind, w, h) {
  g.save();
  g.translate(w / 2, h / 2); const s = Math.min(w, h); g.scale(s, s);
  g.fillStyle = '#09080a'; g.strokeStyle = '#09080a'; g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = s * 0.035;
  const E = (x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, 2 * PI); g.fill(); };
  const eyes = (pts, r = 0.016) => { g.shadowBlur = 0; g.fillStyle = '#f3f0e6'; for (const [x, y] of pts) E(x, y, r, r * 1.15); g.fillStyle = '#09080a'; g.shadowBlur = s * 0.035; };
  if (kind === 'aries') {
    E(0, 0.1, 0.12, 0.24); E(0, 0.3, 0.075, 0.08);
    for (const sd of [-1, 1]) {
      E(sd * 0.19, -0.03, 0.09, 0.035, sd * 0.4);
      g.lineWidth = 0.075; g.beginPath(); g.moveTo(sd * 0.06, -0.1); g.bezierCurveTo(sd * 0.12, -0.36, sd * 0.42, -0.4, sd * 0.42, -0.12);
      g.bezierCurveTo(sd * 0.42, 0.06, sd * 0.22, 0.08, sd * 0.24, -0.08); g.stroke();
    }
    eyes([[-0.06, 0.04], [0.06, 0.04]]);
  } else if (kind === 'libra') {
    g.fillRect(-0.02, -0.26, 0.04, 0.6); E(0, 0.36, 0.18, 0.05); g.fillRect(-0.38, -0.27, 0.76, 0.035); E(0, -0.31, 0.045, 0.045);
    g.lineWidth = 0.012;
    for (const sd of [-1, 1]) {
      g.beginPath(); g.moveTo(sd * 0.35, -0.25); g.lineTo(sd * 0.45, 0.06); g.moveTo(sd * 0.35, -0.25); g.lineTo(sd * 0.25, 0.06); g.stroke();
      g.beginPath(); g.ellipse(sd * 0.35, 0.06, 0.13, 0.06, 0, 0, PI); g.fill();
    }
  } else if (kind === 'gemini') {
    for (const x of [-0.15, 0.15]) {
      E(x, -0.3, 0.075, 0.085);
      g.beginPath(); g.moveTo(x - 0.1, -0.18); g.lineTo(x + 0.1, -0.18); g.lineTo(x + 0.14, 0.44); g.lineTo(x - 0.14, 0.44); g.closePath(); g.fill();
      g.lineWidth = 0.05; g.beginPath(); g.moveTo(x - Math.sign(x) * 0.09, -0.15); g.lineTo(x - Math.sign(x) * 0.18, 0.05); g.stroke();
      g.beginPath(); g.moveTo(x + Math.sign(x) * 0.09, -0.15); g.lineTo(x + Math.sign(x) * 0.12, 0.12); g.stroke();
    }
    eyes([[-0.18, -0.31], [-0.12, -0.31], [0.12, -0.31], [0.18, -0.31]], 0.012);
  } else if (kind === 'scorpio') {
    E(0, 0.2, 0.1, 0.13);
    for (let k = 0; k < 4; k++) E(0, 0.03 - k * 0.07, 0.085 - k * 0.012, 0.045);
    g.lineWidth = 0.055; g.beginPath(); g.moveTo(0, -0.22); g.bezierCurveTo(0, -0.42, 0.3, -0.46, 0.26, -0.24); g.stroke();
    g.beginPath(); g.moveTo(0.2, -0.27); g.lineTo(0.34, -0.2); g.lineTo(0.24, -0.15); g.closePath(); g.fill();
    g.lineWidth = 0.03;
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(sd * 0.07, 0.08 + k * 0.06); g.lineTo(sd * 0.2, 0.02 + k * 0.08); g.lineTo(sd * 0.27, 0.12 + k * 0.08); g.stroke(); }
      g.lineWidth = 0.04; g.beginPath(); g.moveTo(sd * 0.06, 0.3); g.lineTo(sd * 0.18, 0.38); g.stroke();
      E(sd * 0.21, 0.42, 0.06, 0.04, sd * 0.6); g.lineWidth = 0.03;
    }
  } else if (kind === 'mother') {
    E(0, -0.33, 0.07, 0.085);
    g.beginPath(); g.moveTo(-0.08, -0.36); g.lineTo(0.08, -0.36); g.lineTo(0.12, -0.12); g.lineTo(-0.12, -0.12); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-0.1, -0.22); g.lineTo(0.1, -0.22); g.lineTo(0.26, 0.46); g.lineTo(-0.26, 0.46); g.closePath(); g.fill();
    g.lineWidth = 0.045; g.beginPath(); g.moveTo(-0.09, -0.18); g.lineTo(-0.2, 0.0); g.lineTo(-0.27, -0.16); g.moveTo(0.09, -0.18); g.lineTo(0.2, 0.0); g.lineTo(0.27, -0.16); g.stroke();
    eyes([[-0.026, -0.34], [0.026, -0.34]], 0.012);
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// 物品
function bark() {
  const r = group('p9_bark');
  const t = tex(256, 128, (g, w, h) => {
    g.fillStyle = '#ece8df'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b2622'; for (let i = 0; i < 9; i++) g.fillRect(14 + i * 27, 20 + (i % 3) * 30, 16 + (i % 2) * 10, 5);
    g.fillStyle = '#c9c2b4'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
  });
  const m = add(r, new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 18, 1, true, -0.9, 1.8), toon('#ffffff', { ...FINE, map: t, side: THREE.DoubleSide })), 'bark_piece', [0, 0.08, 0]);
  m.rotation.z = PI / 2;
  return r;
}
function shell() {
  const r = group('p9_shell');
  const s = add(r, new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 18, 1), toon('#e9dcc6', FINE)), 'shell_body', [0, 0.04, 0]);
  s.rotation.z = -PI / 2 + 0.35;
  for (let k = 0; k < 4; k++) { const t = ring(r, 'shell_ridge', 0.038 - k * 0.008, 0.004, '#c9b392', [-0.03 + k * 0.025, 0.045 + k * 0.006, 0], FINE); t.rotation.y = PI / 2; t.rotation.x = 0.35; }
  ball(r, 'shell_lip', 0.03, '#f4d8c8', [-0.045, 0.03, 0.012], [0.6, 1, 0.9], FINE);
  return r;
}
function blueStone() {
  const r = group('p9_blue_stone');
  const m = add(r, new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), toon('#5a7fa6', FINE)), 'stone', [0, 0.04, 0]);
  m.scale.set(1.25, 0.8, 1); m.rotation.set(0.3, 0.6, 0.1);
  return r;
}
function pickaxe() {
  const r = group('p9_pickaxe');
  cyl(r, 'pick_handle', 0.017, 0.8, '#94683f', [0, 0.4, 0], 8, FINE);
  const head = group('pick_head'); head.position.set(0, 0.78, 0); r.add(head);
  for (const s of [-1, 1]) {
    const tip = add(head, new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.24, 8), toon('#7d8085', FINE)), 'pick_tip', [s * 0.13, -0.01, 0]);
    tip.rotation.z = -s * (PI / 2 - 0.12);
  }
  box(head, 'pick_eye', [0.06, 0.05, 0.045], '#5d6064', [0, 0, 0], toon('#5d6064', FINE));
  return r;
}
function moonStone() {
  const r = group('p9_moon_stone');
  const m = add(r, new THREE.Mesh(new THREE.DodecahedronGeometry(0.045, 0), toon('#b4302a', { ...FINE, emissive: '#5a0e0a' })), 'moon_stone', [0, 0.045, 0]);
  m.scale.set(1.2, 0.9, 1);
  add(r, new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), glow('#ff5040', { opacity: 0.25 })), 'moon_stone_glow', [0, 0.045, 0]);
  return r;
}
/** 母亲的骨头：用旧布包着的一小包骨头（头骨露在外面）。 */
function bones() {
  const r = group('p9_bones');
  ball(r, 'bones_cloth', 0.08, '#9c8f78', [0, 0.05, 0], [1.2, 0.6, 0.9], FINE);
  const skull = ball(r, 'bones_skull', 0.045, '#ece4d2', [0.02, 0.1, 0.02], [1, 0.95, 1.05], FINE);
  for (const s of [-1, 1]) add(skull, new THREE.Mesh(new THREE.CircleGeometry(0.011, 10), unlit('#1d1a18')), 'skull_eye', [s * 0.016, 0.005, 0.044]);
  box(r, 'bones_jaw', [0.05, 0.02, 0.04], '#e2d8c4', [0.02, 0.066, 0.03], toon('#e2d8c4', FINE));
  for (const s of [-1, 1]) { const b = cyl(r, 'bones_long', 0.009, 0.17, '#e9e1cf', [-0.03, 0.08, 0], 8, FINE); b.rotation.set(0.3, 0, s * 1.1); }
  return r;
}
/** 一小袋粉末：纸包，口上露出一堆粉。opts.color */
function powder({ color = '#8a5a32' } = {}) {
  const r = group('p9_powder');
  add(r, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.08, 10, 1, true), toon('#d9cdb3', { ...FINE, side: THREE.DoubleSide })), 'powder_bag', [0, 0.04, 0]);
  const heap = add(r, new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.05, 14), toon(color, FINE)), 'powder_heap', [0, 0.095, 0]);
  heap.userData.color = color;
  return r;
}
function copperKey() {
  const r = group('p9_copper_key');
  const C = '#b8673a';
  ring(r, 'key_bow', 0.028, 0.007, C, [0, 0.14, 0], FINE);
  cyl(r, 'key_shaft', 0.006, 0.11, C, [0, 0.06, 0], 8, FINE);
  box(r, 'key_bit', [0.03, 0.014, 0.007], C, [0.014, 0.012, 0], toon(C, FINE));
  box(r, 'key_bit2', [0.02, 0.012, 0.007], C, [0.01, 0.032, 0], toon(C, FINE));
  return r;
}
/** 蜡烛：铜碟上的白蜡烛，火苗另外发光。 */
function candle({ lit = true } = {}) {
  const r = group('p9_candle');
  cyl(r, 'candle_dish', 0.05, 0.012, '#b08a3e', [0, 0.006, 0], 18, FINE);
  cyl(r, 'candle_wax', 0.018, 0.1, '#f1ece0', [0, 0.062, 0], 14, FINE);
  const f = add(r, new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), glow('#ffd27a')), 'candle_flame', [0, 0.124, 0]);
  f.scale.set(0.7, 1.6, 0.7); f.visible = lit;
  return r;
}

// ---------------------------------------------------------------------------
// 远处的一层天空：星星和月亮（第九灾，月食后月亮变暗红）/ 黄昏的大太阳（第十灾）。每帧由章节调 follow(camera) 跟着相机走。
function skyLayer({ stars = 700, moon = true, sun = false } = {}) {
  const r = group('p9_sky');
  const R = 1600;
  const dir = (az, el) => { const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el); return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)); };
  const deco = (m, order = -950) => { m.renderOrder = order; m.frustumCulled = false; for (const mm of [m.material].flat()) { mm.fog = false; mm.depthWrite = false; mm.toneMapped = false; } return m; };
  if (stars) {
    const pos = [], rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    for (let i = 0; i < stars; i++) {
      const el = 9 + Math.pow(rnd(), 0.8) * 80, az = rnd() * 360, d = dir(az, el).multiplyScalar(R);
      pos.push(d.x, d.y, d.z);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#f1f0e6', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.85 }));
    pts.material.userData.outlineParameters = { visible: false }; pts.name = 'sky_stars'; r.add(deco(pts));
  }
  r.userData.moonDir = dir(-72, 24);
  if (moon) {
    const moonTex = tex(256, 256, (g, w) => {
      const grd = g.createRadialGradient(w * 0.42, w * 0.4, w * 0.05, w / 2, w / 2, w / 2);
      grd.addColorStop(0, '#fbfaf2'); grd.addColorStop(1, '#d4d2c8'); g.fillStyle = grd; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 2, 0, 2 * PI); g.fill();
      g.fillStyle = 'rgba(120,118,112,0.28)';
      for (const [x, y, rr] of [[0.36, 0.34, 0.1], [0.6, 0.3, 0.07], [0.55, 0.58, 0.13], [0.3, 0.62, 0.06], [0.7, 0.66, 0.05], [0.45, 0.78, 0.05]]) { g.beginPath(); g.arc(x * w, y * w, rr * w, 0, 2 * PI); g.fill(); }
    });
    const disc = deco(new THREE.Mesh(new THREE.CircleGeometry(58, 40), unlit('#ffffff', { map: moonTex, transparent: true })));
    disc.name = 'sky_moon'; disc.position.copy(r.userData.moonDir).multiplyScalar(R); disc.lookAt(0, 0, 0); r.add(disc);
    const haloTex = tex(128, 128, (g, w) => { const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.18)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, w, w); });
    const halo = deco(new THREE.Mesh(new THREE.PlaneGeometry(420, 420), glow('#c9d6ff', { map: haloTex })), -951);
    halo.name = 'sky_moon_halo'; halo.position.copy(disc.position).multiplyScalar(1.01); halo.lookAt(0, 0, 0); r.add(halo);
    const white = new THREE.Color('#ffffff'), blood = new THREE.Color('#b0362a'), haloW = new THREE.Color('#c9d6ff'), haloB = new THREE.Color('#ff4a32');
    r.setBlood = (k) => { disc.material.color.copy(white).lerp(blood, k); halo.material.color.copy(haloW).lerp(haloB, k); r.userData.blood = k; };
    r.setBlood(0);
  }
  if (sun) {
    const sunTex = tex(256, 256, (g, w) => { const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); grd.addColorStop(0, 'rgba(255,236,190,1)'); grd.addColorStop(0.18, 'rgba(255,214,150,0.95)'); grd.addColorStop(0.3, 'rgba(255,170,90,0.35)'); grd.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = grd; g.fillRect(0, 0, w, w); });
    const s = deco(new THREE.Mesh(new THREE.PlaneGeometry(520, 520), glow('#ffffff', { map: sunTex })));
    s.name = 'sky_sun'; s.position.copy(dir(sun.az ?? -150, sun.el ?? 6)).multiplyScalar(R); s.lookAt(0, 0, 0); r.add(s);
  }
  r.follow = (camera) => { if (camera) r.position.copy(camera.position); };
  return r;
}

// ---------------------------------------------------------------------------
// 塔下空地：篝火（石头圈上刻着十二个星座符号）、烟里的黑影
function bonfire() {
  const r = group('p9_bonfire');
  const st = { fire: 'low', heat: 0.35, tint: new THREE.Color('#ff8a3a'), stones: Array(12).fill(null), cube: false, ash: 0 };
  // 石头圈：每块石头顶上刻一个星座符号，撒过粉末的那个亮成粉末的颜色
  const stones = [];
  for (let i = 0; i < 12; i++) {
    const a = -PI / 2 + (i / 12) * 2 * PI, x = Math.cos(a) * 0.95, z = Math.sin(a) * 0.95;
    const s = add(r, new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), toon('#6f6c69', FINE)), 'fire_stone', [x, 0.08, z]);
    s.scale.set(1.2, 0.62, 1); s.rotation.y = -a;
    const glyph = tex(128, 128, () => {});
    const mark = add(r, new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), unlit('#ffffff', { map: glyph, transparent: true, depthWrite: false })), 'fire_glyph', [x, 0.19, z]);
    mark.rotation.set(-PI / 2, 0, -a - PI / 2); mark.renderOrder = 2;
    stones.push({ s, mark, glyph });
  }
  const drawGlyph = (i, color) => {
    const c = stones[i].glyph.image, g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = color || 'rgba(225,222,210,0.85)';
    if (color) { g.shadowColor = color; g.shadowBlur = 14; }
    zodiacGlyph(g, i, 64, 64, 92, color ? 11 : 8);
    stones[i].glyph.needsUpdate = true;
  };
  // 木柴（帐篷形）和余烬
  const logs = group('fire_logs'); r.add(logs);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * 2 * PI, l = cyl(logs, 'fire_log', 0.05, 0.95, i % 2 ? '#5b4130' : '#4b3526', [Math.cos(a) * 0.2, 0.32, Math.sin(a) * 0.2], 8, FINE);
    l.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
  }
  const embers = add(r, new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.08, 16), toon('#3a2a22', { ...FINE, emissive: '#7a2a10' })), 'fire_embers', [0, 0.04, 0]);
  const ash = add(r, new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.05, 16), toon('#8e8a84', FINE)), 'fire_ash', [0, 0.03, 0]);
  // 火苗：几根发光的锥（加色混合），每帧抖动
  const flames = [];
  for (let i = 0; i < 5; i++) {
    const f = add(r, new THREE.Mesh(new THREE.ConeGeometry(0.22 - i * 0.025, 0.9, 10, 1, true), glow('#ff8a3a', { opacity: 0.55, side: THREE.DoubleSide })), 'fire_flame', [Math.cos(i * 1.7) * 0.08, 0.5, Math.sin(i * 1.7) * 0.08]);
    flames.push(f);
  }
  const core = add(r, new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), glow('#ffd28a', { opacity: 0.5 })), 'fire_core', [0, 0.3, 0]);
  const light = new THREE.PointLight('#ff9248', 6, 16, 1.5); light.position.set(0, 1.0, 0); r.add(light);
  // 烟里的黑影：一块竖着的平面（只绕 y 轴朝向相机）
  const figTex = tex(512, 512, () => {});
  const fig = add(r, new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), unlit('#ffffff', { map: figTex, transparent: true, depthWrite: false, opacity: 0 })), 'fire_figure', [0, 2.6, 0]);
  fig.visible = false; fig.renderOrder = 3;
  const wp = new THREE.Vector3();
  fig.onBeforeRender = (renderer, scene, camera) => { fig.getWorldPosition(wp); const yaw = Math.atan2(camera.position.x - wp.x, camera.position.z - wp.z); fig.rotation.set(0, yaw - (fig.parent?.rotation.y || 0), 0); fig.updateMatrixWorld(); };
  // 灰里的黑方块
  const cube = box(r, 'fire_cube', [0.14, 0.14, 0.14], '#121212', [0, 0.12, 0], toon('#121212', FINE));
  cube.rotation.set(0.2, 0.6, 0.1);
  hitBox(r, 'fire_hit', [1.4, 1.3, 1.4], [0, 0.6, 0]);
  r.userData.cube = cube;

  const apply = () => {
    const out = st.fire === 'out';
    flames.forEach((f) => { f.visible = !out; f.material.color.copy(st.tint); });
    core.visible = !out; core.material.color.copy(st.tint).lerp(new THREE.Color('#fff0c0'), 0.4);
    embers.visible = !out; ash.visible = out; logs.visible = !out || st.ash < 1;
    light.color.copy(st.tint); light.intensity = out ? 0 : 3 + st.heat * 10;
    cube.visible = st.cube;
  };
  r.setState = ({ fire = 'low', stones: marks = [], cube: c = false } = {}) => {
    st.fire = fire; st.heat = fire === 'high' ? 1 : 0.35; st.tint.set('#ff8a3a'); st.cube = !!c; st.ash = fire === 'out' ? 1 : 0;
    for (let i = 0; i < 12; i++) { const col = marks[i] || null; if (st.stones[i] !== col || !stones[i].drawn) { st.stones[i] = col; drawGlyph(i, col); stones[i].drawn = true; } }
    fig.visible = false;
    apply();
  };
  /** 撒粉末：火苗一下子窜高、变成粉末的颜色，然后慢慢回落。 */
  r.flare = (color) => {
    const c = new THREE.Color(color), base = new THREE.Color('#ff8a3a');
    return animate(1800, (k) => { const up = Math.sin(Math.min(1, k * 1.6) * PI * 0.5) * (1 - k * k); st.heat = 0.35 + up * 1.4; st.tint.copy(base).lerp(c, Math.min(1, k * 3) * (1 - k * 0.6)); apply(); }, Ease.linear)
      .then(() => { st.heat = 0.35; st.tint.copy(base); apply(); });
  };
  /** 烟里浮出一个黑影：慢慢显出来、往上飘，再散掉（约 4 秒）。 */
  r.showShadow = (kind) => {
    const g = figTex.image.getContext('2d'); g.clearRect(0, 0, 512, 512);
    for (const [x, y, rr, a] of [[256, 300, 240, 0.34], [190, 230, 160, 0.22], [330, 190, 170, 0.2], [256, 110, 130, 0.16]]) {
      const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, `rgba(214,178,146,${a})`); gr.addColorStop(1, 'rgba(214,178,146,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    }
    drawShadowFigure(g, kind, 512, 512); figTex.needsUpdate = true;
    fig.visible = true; fig.position.y = 2.2;
    return animate(4200, (k) => { fig.material.opacity = k < 0.3 ? k / 0.3 : k > 0.75 ? (1 - k) / 0.25 : 1; fig.position.y = 2.2 + k * 0.9; fig.scale.setScalar(0.85 + k * 0.25); }, Ease.linear)
      .then(() => { fig.visible = false; fig.material.opacity = 0; });
  };
  /** 撒过粉末的那个符号亮起来。 */
  r.markStone = (i, color) => { st.stones[i] = color; drawGlyph(i, color); };
  /** 火烧尽：火苗缩下去，只剩一圈灰。 */
  r.burnOut = () => animate(2200, (k) => { st.heat = 0.35 * (1 - k); flames.forEach((f) => f.scale.setScalar(Math.max(0.01, 1 - k))); core.scale.setScalar(Math.max(0.01, 1 - k)); light.intensity = (3 + st.heat * 10) * (1 - k); }, Ease.inOutSine)
    .then(() => { flames.forEach((f) => f.scale.setScalar(1)); core.scale.setScalar(1); st.fire = 'out'; st.ash = 1; apply(); });
  r.update = (dt, t) => {
    if (st.fire === 'out') return;
    flames.forEach((f, i) => { const w = 0.85 + Math.sin(t * (7 + i * 1.3) + i) * 0.12 + Math.sin(t * 13.1 + i * 2) * 0.06; f.scale.set(w, (0.6 + st.heat * 0.9) * (0.9 + Math.sin(t * 9 + i * 2.2) * 0.15), w); f.position.y = 0.32 + f.scale.y * 0.42; });
    light.intensity = 3 + st.heat * 10 + Math.sin(t * 17) * 0.6;
  };
  r.userData.state = st;
  r.setState();
  return r;
}

/** 塔东面的门：石头拱门框、木门（推开就是往上的楼梯）、门边挂一盏灯。门面朝 +Z（章节按塔的墙面转过去）。 */
function towerDoor() {
  const r = group('p9_tower_door');
  const stone = toon('#8e8a82', FINE), dark = toon('#3e352c', FINE);
  for (const s of [-1, 1]) box(r, 'door_post', [0.32, 2.3, 0.4], '#8e8a82', [s * 0.86, 1.15, 0.1], stone);
  const arch = add(r, new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.18, 8, 18, PI), stone), 'door_arch', [0, 2.3, 0.1]);
  arch.scale.set(1, 0.75, 1.1);
  box(r, 'door_step', [2.1, 0.16, 0.7], '#7d7972', [0, 0.08, 0.35], toon('#7d7972', FINE));
  // 门洞里黑黑的楼梯（门是开着的）
  const stairs = tex(256, 420, (g, w, h) => {
    g.fillStyle = '#0d0c0b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) { const y = h - 18 - i * 34, x = 40 + i * 22; g.fillStyle = `rgba(150,140,128,${0.4 - i * 0.045})`; g.fillRect(x, y, w - x, 6); g.fillStyle = `rgba(90,84,76,${0.35 - i * 0.04})`; g.fillRect(x, y + 6, w - x, 28); }
  });
  add(r, new THREE.Mesh(new THREE.PlaneGeometry(1.36, 2.25), unlit('#ffffff', { map: stairs })), 'door_dark', [0, 1.125, 0.02]);
  const leaf = group('door_leaf'); leaf.position.set(-0.68, 0, 0.06); r.add(leaf);
  for (let i = 0; i < 6; i++) box(leaf, 'door_plank', [0.22, 2.25, 0.06], i % 2 ? '#6b4e36' : '#62472f', [0.12 + i * 0.228, 1.12, 0], toon(i % 2 ? '#6b4e36' : '#62472f', FINE));
  for (const y of [0.5, 1.8]) box(leaf, 'door_band', [1.36, 0.07, 0.075], '#2c2a28', [0.68, y, 0.01], toon('#2c2a28', FINE));
  ring(leaf, 'door_ring', 0.06, 0.012, '#2c2a28', [1.1, 1.1, 0.05], FINE);
  // 拱顶上的半圆补板（门板是方的）
  add(r, new THREE.Mesh(new THREE.CircleGeometry(0.68, 20, 0, PI), dark), 'door_tympanum', [0, 2.25, 0.05]).scale.set(1, 0.7, 1);
  // 门边的灯：夜里远远就看得见
  const lamp = group('door_lamp'); lamp.position.set(1.25, 2.05, 0.35); r.add(lamp);
  box(lamp, 'lamp_arm', [0.04, 0.04, 0.4], '#2c2a28', [0, 0.2, -0.18], toon('#2c2a28', FINE));
  box(lamp, 'lamp_cage', [0.16, 0.24, 0.16], '#2c2a28', [0, 0, 0], toon('#2c2a28', { ...FINE, transparent: true, opacity: 0.35 }));
  add(lamp, new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), glow('#ffcf7a')), 'lamp_flame', [0, 0, 0]);
  const l = new THREE.PointLight('#ffc070', 2.5, 7, 1.4); l.position.set(1.25, 2.0, 0.6); r.add(l);
  hitBox(r, 'door_hit', [1.5, 2.4, 0.4], [0, 1.2, 0.25]);
  leaf.userData.open = (k) => { leaf.rotation.y = -k * 1.4; };
  r.userData.leaf = leaf;
  return r;
}

/** 冻在冰里的红月石（月食后落在塔门边的雪地里）：镐凿开冰，石头留在原地等人捡。 */
function iceStone() {
  const r = group('p9_ice');
  const ice = add(r, new THREE.Mesh(faceted(new THREE.IcosahedronGeometry(0.32, 1)), toon('#cfe4ee', { ...FINE, transparent: true, opacity: 0.72 })), 'ice_block', [0, 0.16, 0]);
  ice.scale.set(1.3, 0.62, 1.1);
  const stone = moonStone(); stone.name = 'ice_moon_stone'; stone.scale.setScalar(1.6); stone.position.set(0, 0.08, 0); r.add(stone);
  const shards = [];
  for (let i = 0; i < 6; i++) { const s = add(r, new THREE.Mesh(new THREE.TetrahedronGeometry(0.08, 0), toon('#d9ecf3', { ...FINE, transparent: true, opacity: 0.8 })), 'ice_shard', [0, 0.16, 0]); s.visible = false; shards.push(s); }
  const light = new THREE.PointLight('#ff4a3a', 1.2, 4, 1.5); light.position.set(0, 0.5, 0); r.add(light);
  hitBox(r, 'ice_hit', [0.9, 0.6, 0.9], [0, 0.25, 0]);
  r.userData.stone = stone; r.userData.ice = ice;
  r.setState = ({ fallen = false, ice: hasIce = true, stone: hasStone = true } = {}) => {
    r.visible = !!fallen; ice.visible = hasIce; stone.visible = hasStone; light.intensity = hasStone ? 1.2 : 0;
    shards.forEach((s) => { s.visible = false; });
  };
  r.crack = () => {
    ice.visible = false;
    const dirs = shards.map((s, i) => { s.visible = true; s.position.set(0, 0.16, 0); const a = (i / shards.length) * 2 * PI; return [Math.cos(a), 0.6 + (i % 3) * 0.3, Math.sin(a)]; });
    return animate(700, (k) => shards.forEach((s, i) => { s.position.set(dirs[i][0] * k * 0.6, 0.16 + dirs[i][1] * k * 0.5 - k * k * 0.5, dirs[i][2] * k * 0.6); s.rotation.set(k * 4, k * 3, 0); s.material.opacity = 0.8 * (1 - k); }), Ease.outCubic)
      .then(() => shards.forEach((s) => { s.visible = false; s.material.opacity = 0.8; }));
  };
  r.setState();
  return r;
}

/** 月食时从天上落下来的一道红光（过场用）：发光的球 + 拖长的尾巴，fall(from, to) 从世界坐标 from 落到 to。 */
function moonStreak() {
  const r = group('p9_moon_streak');
  const head = add(r, new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), glow('#ff5a40')), 'streak_head');
  const tail = add(r, new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.3, 1, 10, 1, true), glow('#ff3a28', { opacity: 0.5, side: THREE.DoubleSide })), 'streak_tail');
  r.visible = false;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  r.fall = (from, to, ms = 1600) => {
    a.fromArray(from); b.fromArray(to); r.visible = true;
    return animate(ms, (k) => {
      head.position.lerpVectors(a, b, k);
      const len = Math.max(0.1, Math.min(18, a.distanceTo(b) * Math.min(k, 0.35)));
      d.subVectors(a, b).normalize();
      tail.scale.set(1, len, 1); tail.position.copy(head.position).addScaledVector(d, len / 2);
      tail.quaternion.setFromUnitVectors(up, d);
    }, Ease.inCubic).then(() => { r.visible = false; });
  };
  return r;
}

// ---------------------------------------------------------------------------
// 白桦林：啄木鸟和树干上的 5 个疤（第 BARK_SPOT 个是发白翘起的松树皮）
function woodpeckerBirch({ loose = 3 } = {}) {
  const r = group('p9_birch');
  const H = 9, R0 = 0.24;
  const t = tex(256, 1024, (g, w, h) => {
    g.fillStyle = '#ecebe5'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.fillStyle = i % 4 ? '#2e2b28' : '#5c5852'; const y = (i * 151) % h, x = (i * 97) % w; g.fillRect(x, y, 18 + (i % 5) * 10, 3 + (i % 3) * 2); }
    g.fillStyle = 'rgba(160,150,130,0.25)'; for (let i = 0; i < 30; i++) g.fillRect(0, (i * 337) % h, w, 2);
  });
  const trunk = add(r, new THREE.Mesh(new THREE.CylinderGeometry(R0 * 0.75, R0, H, 20), toon('#ffffff', { ...FINE, map: t })), 'birch_trunk', [0, H / 2, 0]);
  trunk.castShadow = true;
  for (const [y, a, len] of [[4.2, 0.6, 1.1], [5.1, -2.2, 0.9], [6.0, 2.0, 1.2], [6.8, -0.9, 0.8], [7.6, 2.8, 0.7], [3.4, -2.6, 0.6]]) {
    const b = cyl(r, 'birch_branch', 0.03, len, '#d9d6cc', [Math.cos(a) * (R0 + len * 0.35), y, Math.sin(a) * (R0 + len * 0.35)], 6, FINE);
    b.rotation.set(0, 0, 0); b.lookAt(Math.cos(a) * 3, y + 1.4, Math.sin(a) * 3); b.rotateX(PI / 2);
  }
  // 5 个疤：正面（+Z）从下往上，每个配一个点击盒
  const knots = [], heights = [0.9, 1.3, 1.7, 2.1, 2.5];
  heights.forEach((y, i) => {
    const k = add(r, new THREE.Mesh(new THREE.CircleGeometry(0.055, 14), unlit('#2b2724')), 'birch_knot', [0, y, R0 * (1 - y / H * 0.25) + 0.004]);
    k.scale.set(1.5, 0.8, 1);
    const hit = hitBox(r, `knot_${i}`, [0.3, 0.3, 0.25], [0, y, R0]); hit.userData.knot = i;
    knots.push({ y, k, hit });
  });
  // 松树皮：发白、翘起来的一块
  const lb = new THREE.Mesh(new THREE.CylinderGeometry(R0 + 0.025, R0 + 0.025, 0.24, 14, 1, true, -0.5, 1.0), toon('#f6f3ea', { ...FINE, side: THREE.DoubleSide }));
  const looseBark = group('birch_loose'); looseBark.add(lb); looseBark.position.set(0, heights[loose], 0); lb.rotation.y = 0; r.add(looseBark);
  lb.rotation.x = -0.12;
  // 啄木鸟：黑白相间、红头顶，趴在树干正面右侧
  const bird = group('woodpecker'); r.add(bird);
  const body = ball(bird, 'wp_body', 0.07, '#1f1e1f', [0, 0, 0], [0.8, 1.3, 0.75], FINE);
  ball(bird, 'wp_belly', 0.05, '#efece6', [0, -0.02, 0.035], [0.7, 1.1, 0.6], FINE);
  ball(bird, 'wp_wingdots', 0.045, '#f2efe8', [0.05, 0.02, -0.01], [0.3, 1.0, 0.8], FINE);
  const head = group('wp_head'); head.position.set(0, 0.1, 0.02); bird.add(head);
  ball(head, 'wp_skull', 0.04, '#1f1e1f', [0, 0, 0], [1, 1, 1], FINE);
  ball(head, 'wp_cap', 0.032, '#c42a24', [0, 0.02, -0.01], [1, 0.8, 1.1], FINE);
  ball(head, 'wp_cheek', 0.022, '#f0ede6', [0.02, -0.005, 0.02], [1, 0.8, 0.8], FINE);
  const beak = add(head, new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.07, 8), toon('#4a4642', FINE)), 'wp_beak', [0, -0.005, 0.055]); beak.rotation.x = PI / 2;
  const tail = box(bird, 'wp_tail', [0.04, 0.09, 0.015], '#1f1e1f', [0, -0.12, -0.02], toon('#1f1e1f', FINE)); tail.rotation.x = 0.4;
  ball(bird, 'wp_under', 0.03, '#c42a24', [0, -0.08, 0.03], [0.8, 0.7, 0.5], FINE);
  const surf = (y) => R0 * (1 - y / H * 0.25);
  // 趴在树干正面偏右（side 弧度）、嘴朝着树干
  const placeBird = (y, side = 0.55) => { bird.position.set(Math.sin(side) * (surf(y) + 0.05), y, Math.cos(side) * (surf(y) + 0.05)); bird.rotation.set(0, side + PI, 0); };
  const st = { at: 4, bark: true };
  r.userData.knots = knots.map((k) => k.hit); r.userData.bark = looseBark; r.userData.bird = bird; r.userData.loose = loose;
  r.setState = ({ at = 4, bark: hasBark = true } = {}) => { st.at = at; st.bark = hasBark; looseBark.visible = hasBark; lb.material.opacity = 1; placeBird(heights[Math.max(0, Math.min(4, at))] + 0.12); };
  /** 飞到第 i 个疤，啄三下（onPeck 每啄一下回调一次，章节在里面放音效）。 */
  r.peck = async (i, onPeck) => {
    const from = bird.position.y, to = heights[i] + 0.12;
    await animate(500, (k) => { placeBird(from + (to - from) * k); bird.position.z += Math.sin(k * PI) * 0.18; }, Ease.inOutSine);
    st.at = i;
    for (let n = 0; n < 3; n++) {
      await animate(130, (k) => { head.rotation.x = Math.sin(k * PI) * 0.7; head.position.z = 0.02 + Math.sin(k * PI) * 0.03; }, Ease.linear);
      onPeck?.(n);
    }
  };
  /** 松树皮掉下来。 */
  r.dropBark = () => animate(900, (k) => { looseBark.position.y = heights[loose] - k * k * heights[loose]; looseBark.rotation.x = k * 1.4; }, Ease.linear)
    .then(() => { looseBark.visible = false; looseBark.position.y = heights[loose]; looseBark.rotation.x = 0; });
  r.setState();
  return r;
}

// ---------------------------------------------------------------------------
// 湖边：木箱和站在上面的仓鸮；烽火亮起以后猫头鹰飞走，箱盖开着，里面是用布包着的骨头
export function barnOwl(name = 'barn_owl') {
  const o = group(name);
  ball(o, 'owl_body', 0.13, '#c08a4c', [0, 0.17, 0], [0.9, 1.25, 0.85], FINE);
  ball(o, 'owl_chest', 0.1, '#f3eee4', [0, 0.15, 0.05], [0.8, 1.1, 0.6], FINE);
  for (const s of [-1, 1]) { const w = ball(o, 'owl_wing', 0.09, '#a8743c', [s * 0.1, 0.2, -0.02], [0.4, 1.3, 0.9], FINE); w.rotation.z = s * 0.12; }
  const head = group('owl_head'); head.position.set(0, 0.36, 0.01); o.add(head);
  ball(head, 'owl_skull', 0.1, '#c99a5c', [0, 0, -0.01], [1.05, 0.95, 0.9], FINE);
  const face = add(head, new THREE.Mesh(new THREE.CircleGeometry(0.085, 20), toon('#f6f2ea', FINE)), 'owl_face', [0, 0, 0.075]); face.scale.set(1, 1.15, 1);
  for (const s of [-1, 1]) add(head, new THREE.Mesh(new THREE.CircleGeometry(0.016, 12), unlit('#1a1714')), 'owl_eye', [s * 0.033, 0.01, 0.079]);
  add(head, new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.03, 6), toon('#d9c3a3', FINE)), 'owl_beak', [0, -0.02, 0.085]).rotation.x = PI;
  for (const s of [-1, 1]) cyl(o, 'owl_foot', 0.012, 0.05, '#b08a5a', [s * 0.04, 0.02, 0.03], 6, FINE);
  o.userData.head = head;
  return o;
}
function crate() {
  const r = group('p9_crate');
  const W = 0.8, H = 0.5, D = 0.55, wood = toon('#8d6e4e', FINE);
  for (const [sx, sz, w, d] of [[0, D / 2, W, 0.04], [0, -D / 2, W, 0.04], [W / 2, 0, 0.04, D], [-W / 2, 0, 0.04, D]]) box(r, 'crate_side', [w, H, d], '#8d6e4e', [sx, H / 2, sz], wood);
  box(r, 'crate_floor', [W, 0.03, D], '#7a5c40', [0, 0.02, 0], toon('#7a5c40', FINE));
  const lid = group('crate_lid'); lid.position.set(0, H, -D / 2); r.add(lid);
  box(lid, 'crate_lid_board', [W + 0.04, 0.04, D + 0.04], '#957452', [0, 0.02, D / 2], toon('#957452', FINE));
  const owl = barnOwl('crate_owl'); owl.position.set(0.05, 0.04, D / 2); lid.add(owl);
  const straw = box(r, 'crate_straw', [W - 0.08, 0.12, D - 0.08], '#b39a62', [0, 0.09, 0], toon('#b39a62', FINE));
  const bundle = bones(); bundle.name = 'crate_bones'; bundle.position.set(0, 0.15, -0.06); bundle.scale.setScalar(1.7); r.add(bundle);
  hitBox(r, 'crate_hit', [W + 0.1, H + 0.1, D + 0.1], [0, H / 2, 0]);
  r.userData.owl = owl; r.userData.lid = lid; r.userData.bones = bundle;
  r.setState = ({ owl: hasOwl = true, open = false, bones: hasBones = true } = {}) => {
    owl.visible = hasOwl; owl.position.set(0.05, 0.04, D / 2); owl.rotation.set(0, 0, 0);
    lid.rotation.x = open ? -1.9 : 0; bundle.visible = open && hasBones; straw.visible = open;
  };
  /** 猫头鹰怕光：张开翅膀飞进黑暗里。 */
  r.owlFlyAway = () => animate(1800, (k) => { owl.position.set(0.05 + k * 2.5, 0.04 + k * k * 6, D / 2 - k * 4); owl.rotation.x = -k * 0.6; owl.scale.setScalar(1 - k * 0.3); }, Ease.inQuad)
    .then(() => { owl.visible = false; owl.scale.setScalar(1); });
  r.openLid = () => { straw.visible = true; return animate(700, (k) => { lid.rotation.x = -1.9 * k; }, Ease.outCubic).then(() => { bundle.visible = true; }); };
  r.setState();
  return r;
}

// ---------------------------------------------------------------------------
// 木屋里：研磨机、墙上的星座动物炭笔画、写着预言的小画（文字由章节传进来：props 文件会被小红书包静态打进去，不放章节文案）
function grinder() {
  const r = group('p9_grinder');
  const PINK = '#c98f86', DARK = '#8a5a52';
  box(r, 'grinder_base', [0.52, 0.12, 0.42], DARK, [0, 0.06, 0], toon(DARK, FINE));
  box(r, 'grinder_body', [0.4, 0.62, 0.32], PINK, [0, 0.43, 0], toon(PINK, FINE));
  box(r, 'grinder_top', [0.5, 0.08, 0.4], DARK, [0, 0.78, 0], toon(DARK, FINE));
  const hopper = add(r, new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.08, 0.2, 18, 1, true), toon(PINK, { ...FINE, side: THREE.DoubleSide })), 'grinder_hopper', [0, 0.92, 0]);
  add(r, new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), unlit('#2a1d1a')), 'grinder_mouth', [0, 0.83, 0]).rotation.x = -PI / 2;
  // 正面玻璃窗里一排彩色粉末管
  box(r, 'grinder_window', [0.26, 0.2, 0.01], '#2a2422', [0, 0.52, 0.162], toon('#2a2422', FINE));
  ['#c23a2e', '#4f86c6', '#6e9c58', '#efece4', '#8a5a32'].forEach((c, i) => cyl(r, 'grinder_tube', 0.016, 0.16, c, [-0.096 + i * 0.048, 0.52, 0.168], 8, FINE));
  // 出料口和下面的小托盘（磨好的粉末堆在托盘里）
  box(r, 'grinder_spout', [0.12, 0.06, 0.1], DARK, [0, 0.25, 0.2], toon(DARK, FINE));
  const tray = add(r, new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.04, 18), toon('#b08a3e', FINE)), 'grinder_tray', [0, 0.14, 0.26]);
  const heap = add(r, new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.07, 18), toon('#8a5a32', FINE)), 'grinder_heap', [0, 0.195, 0.26]);
  // 侧面的摇柄
  const crank = group('grinder_crank'); crank.position.set(0.21, 0.55, 0); r.add(crank);
  cyl(crank, 'crank_axle', 0.02, 0.06, '#5d5250', [0.03, 0, 0], 8, FINE).rotation.z = PI / 2;
  box(crank, 'crank_arm', [0.03, 0.22, 0.03], '#5d5250', [0.06, 0.1, 0], toon('#5d5250', FINE));
  const knob = cyl(crank, 'crank_knob', 0.022, 0.08, '#e0d0b8', [0.1, 0.2, 0], 10, FINE); knob.rotation.z = PI / 2;
  // 放进去的东西露出一点（用一个小块表示）
  const inside = ball(r, 'grinder_inside', 0.05, '#a39a8c', [0, 0.88, 0], [1.2, 0.6, 1], FINE);
  hitBox(r, 'hopper_hit', [0.36, 0.22, 0.36], [0, 0.93, 0]);
  hitBox(r, 'crank_hit', [0.18, 0.4, 0.2], [0.29, 0.6, 0]);
  hitBox(r, 'tray_hit', [0.3, 0.14, 0.26], [0, 0.18, 0.27]);
  r.userData.hopper = r.getObjectByName('hopper_hit'); r.userData.crank = r.getObjectByName('crank_hit'); r.userData.tray = r.getObjectByName('tray_hit');
  r.setState = ({ input = null, output = null } = {}) => {
    inside.visible = !!input; if (input) inside.material.color.set(input);
    heap.visible = !!output; if (output) heap.material.color.set(output);
    crank.rotation.x = 0;
  };
  /** 摇三圈：放进去的东西不见了，托盘里堆起粉末。 */
  r.crank = (color) => animate(2100, (k) => { crank.rotation.x = -k * 6 * PI; inside.scale.setScalar(Math.max(0.01, 1 - k)); if (k > 0.6) { heap.visible = true; heap.material.color.set(color); heap.scale.setScalar((k - 0.6) / 0.4); } }, Ease.inOutSine)
    .then(() => { inside.visible = false; inside.scale.setScalar(1); heap.scale.setScalar(1); crank.rotation.x = 0; });
  r.setState();
  return r;
}
function wallDrawings() {
  const r = group('p9_wall_drawings');
  const t = tex(1024, 640, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(52,48,46,0.82)'; g.fillStyle = 'rgba(52,48,46,0.82)'; g.lineWidth = 5; g.lineCap = 'round';
    // 炭笔画的星座：用符号 + 简笔动物（蝎子、天平、双生子、羊、牛、鱼、狮子）
    const sketch = (kind, x, y, s) => { const c = document.createElement('canvas'); c.width = c.height = 256; drawShadowFigure(c.getContext('2d'), kind, 256, 256); g.globalAlpha = 0.55; g.drawImage(c, x - s / 2, y - s / 2, s, s); g.globalAlpha = 1; };
    sketch('scorpio', 790, 120, 220); sketch('libra', 250, 330, 230); sketch('gemini', 520, 320, 230); sketch('aries', 800, 430, 230);
    [[0, 140, 110], [1, 360, 120], [3, 600, 110], [4, 140, 520], [5, 360, 560], [8, 610, 560], [9, 950, 300], [10, 960, 580], [11, 90, 330]].forEach(([i, x, y]) => zodiacGlyph(g, i, x, y, 70, 6));
    g.lineWidth = 4; g.beginPath(); g.moveTo(40, 610); g.lineTo(990, 615); g.stroke();
  });
  add(r, new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), unlit('#ffffff', { map: t, transparent: true, depthWrite: false, fog: false })), 'drawings_plane', [0, 0.75, 0]);
  hitBox(r, 'drawings_hit', [2.4, 1.5, 0.05], [0, 0.75, 0.02]);
  return r;
}
/** 墙上的小画：上面一段字，下面是林间空地上一群穿长袍的人围着黑方块。 */
function scroll({ lines = [] } = {}) {
  const r = group('p9_scroll');
  box(r, 'scroll_frame', [0.5, 0.62, 0.03], '#b8913f', [0, 0.31, 0], toon('#b8913f', FINE));
  const t = tex(400, 512, (g, w, h) => {
    g.fillStyle = '#1e2a33'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8e2cf'; g.font = '600 25px "Microsoft YaHei", sans-serif'; g.textAlign = 'center';
    lines.forEach((line, i) => g.fillText(line, w / 2, 48 + i * 34));
    g.fillStyle = '#2f4a34'; g.fillRect(0, 210, w, h - 210);
    g.fillStyle = '#1d2b1f'; for (let i = 0; i < 14; i++) { const x = 14 + i * 28; g.beginPath(); g.moveTo(x, 260); g.lineTo(x - 14, 300); g.lineTo(x + 14, 300); g.fill(); }
    g.fillStyle = '#6f8a3e'; g.beginPath(); g.ellipse(w / 2, 400, 170, 80, 0, 0, 2 * PI); g.fill();
    g.fillStyle = '#111'; g.fillRect(w / 2 - 14, 386, 28, 28);
    ['#9c3b2e', '#c9a43f', '#3e5d8a', '#7a3e6e', '#d9d2c0', '#5f7a3e', '#a8562e', '#2e2e2e'].forEach((c, i) => {
      const a = (i / 8) * 2 * PI, x = w / 2 + Math.cos(a) * 110, y = 400 + Math.sin(a) * 46;
      g.fillStyle = c; g.fillRect(x - 7, y - 26, 14, 30); g.fillStyle = '#e6d4c0'; g.beginPath(); g.arc(x, y - 31, 6, 0, 2 * PI); g.fill();
    });
  });
  add(r, new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.56), unlit('#ffffff', { map: t, fog: false })), 'scroll_picture', [0, 0.31, 0.017]);
  return r;
}

// ---------------------------------------------------------------------------
// 第九灾的画：月亮变红的夜空、篝火边几个小人；下一灾（第十灾）是右边一只木头猫头鹰
const p9Painting = () => plaguePainting('p9_painting', {
  plague: (g, k) => {
    g.fillStyle = `rgba(14,18,40,${0.75 * k})`; g.fillRect(0, 0, 640, 200);
    g.fillStyle = `rgba(190,40,30,${k})`; g.beginPath(); g.arc(520, 70, 30, 0, 2 * PI); g.fill();
    g.fillStyle = `rgba(255,140,60,${k})`; g.beginPath(); g.moveTo(180, 430); g.lineTo(165, 470); g.lineTo(195, 470); g.fill();
  },
  next: (g) => {
    g.fillStyle = '#5a4128'; g.beginPath(); g.moveTo(462, 420); g.lineTo(445, 300); g.lineTo(462, 280); g.lineTo(492, 280); g.lineTo(509, 300); g.lineTo(492, 420); g.fill();
    g.fillStyle = '#f0a040'; g.beginPath(); g.arc(468, 305, 6, 0, 2 * PI); g.arc(486, 305, 6, 0, 2 * PI); g.fill();
  },
});

export const FACTORIES = {
  p9_bark: bark, p9_shell: shell, p9_blue_stone: blueStone, p9_pickaxe: pickaxe, p9_moon_stone: moonStone, p9_bones: bones,
  p9_powder: powder, p9_copper_key: copperKey, p9_candle: candle,
  p9_sky: skyLayer, p9_bonfire: bonfire, p9_tower_door: towerDoor, p9_ice: iceStone, p9_moon_streak: moonStreak,
  p9_birch: woodpeckerBirch, p9_crate: crate, p9_grinder: grinder, p9_wall_drawings: wallDrawings, p9_scroll: scroll,
  p9_painting: p9Painting,
};
