// 角色入口：makeCharacter(id) / makeAnimal('goat') / makeIntroBoat()，以及给章节扩展用的 CHAR_KIT。
//
//   人物模型在 cast.js（按原作重做、真实身高、蒙皮衣物），公共工具在 charkit.js / human.js，
//   这里保留动物面具（记忆场景）、山羊和开场划船，并把道具 / 面具工厂注入工具层。
//   makeCharacter(id) → CharacterRig；每个 rig：root（脚底 y = 0、面朝 +Z）、parts / joints（Bone）、headTop、
//   play()、update()、setMask()，以及各角色自己的动作方法（见 cast.js）。
import { INK, OUT, TAU, clamp, lerp, smooth, step01, V, FS, FX, FY, matSet, cachedTex, clothTex, ringTex, hairTex, place, prep, sphere, lathe, limbGeo, taperTube, PartSet, headDeform, skullGeo, decalGeo, headSurface, pen, path, line, blob, eye, faceSet, ikTwoBone, createRig, skeleton, addHead, handGeo, addHands, addArms, addLegs, torsoGeo, addButtons, hairCapGeo, buildHuman, humanIdle, fitAlongY, fitSize, tryProp, leechGeo, makeLeech, fallbackStick, fallbackHook, fallbackWorm, fallbackShrimp, fallbackGlass, blackCube, crs, sePow, densify, ringsGeo, spineLoft, ringLoft, ribbonGeo, leafGeo, orient, furTex, softSpot, maskEye, paintPlain, skinMesh, boneIndexer, chainWeights, THREE, mergeGeometries, mergeVertices, RoundedBoxGeometry, MeshSurfaceSampler, PALETTE, toon, unlit, canvasTexture, rng, shade, noOutline, animate, wait, Ease, setPropFactory, setMaskFactory } from './charkit.js';
import * as HUMAN from './human.js';
import * as CASTMOD from './cast.js';
import { CAST_P3 } from './cast_p3.js';   // 第三灾人物变体
import { getModel } from './rlpm.js';
import { buildGoatModel } from './goat_model.js';
const { CAST } = CASTMOD;

// 道具在别的模块里；存在就用，否则人物用自己的简易模型。
let makeProp = null;
try { ({ makeProp } = await import('./props.js')); } catch (e) { makeProp = null; }
setPropFactory(makeProp);
const _UP = V(0, 1, 0);
const buildJakob = (o) => CASTMOD.buildJakob(o);
// ===========================================================================
// MASKS (memory vision) — buildMask(id, rig) builds the mask once; rig.setMask() shows / hides it
// ===========================================================================

/** Boar (Gerard): long bristly head, flat pink snout disc, upturned tusks, small mean eyes, mask string tied at the back. */
function maskBoar(add, M) {
  const fur = M.toon('#ffffff', { map: furTex('boar', '#8c5737', { seed: 201, dark: '#4c2a18', light: '#b47d55', n: 360, len: 12,
    paint: (g, w, h) => {
      // darker ridge along the top (u = 0.25) and lighter jowls underneath (u = 0.75)
      softSpot(g, w * 0.25, h * 0.55, w * 0.14, h * 0.6, '#6e4128', 0.8);
      softSpot(g, w * 0.75, h * 0.35, w * 0.16, h * 0.4, '#a87252', 0.7);
    } }) });
  const head = spineLoft([
    { y: 0.03, z: -0.158, w: 0.072, h: 0.078 },
    { y: 0.025, z: -0.118, w: 0.12, h: 0.128 },
    { y: 0.012, z: -0.045, w: 0.143, h: 0.153 },
    { y: -0.004, z: 0.035, w: 0.136, h: 0.144 },
    { y: -0.03, z: 0.11, w: 0.108, h: 0.113, n: 2.2 },
    { y: -0.048, z: 0.175, w: 0.084, h: 0.083, n: 2.4 },
    { y: -0.056, z: 0.232, w: 0.07, h: 0.064, n: 2.5 },
    { y: -0.058, z: 0.262, w: 0.067, h: 0.06, n: 2.5 },
  ], { radial: 40, steps: 6, cap: [1, 0.12] });
  add(head.geo, fur);
  maskNeck(add, fur, { top: -0.08, bottom: -0.2, r: 0.088, cz: -0.025 });
  // snout disc + nostrils
  add(place(new THREE.CylinderGeometry(1, 1, 0.016, 28), [0, -0.058, 0.266], [Math.PI / 2, 0, 0], [0.069, 1, 0.062]), M.toon('#c08a72'));
  for (const s of [-1, 1]) add(place(sphere(0.011, 0.016, 0.005, 12, 8), [s * 0.024, -0.06, 0.275], [0, 0, s * 0.25]), M.toon('#3a1e16', { outline: false }));
  const dark = M.toon('#2a1810', { outline: false });
  for (const s of [-1, 1]) {
    const th = s > 0 ? -0.62 : Math.PI + 0.62;
    // mouth line along the lower jaw
    add(taperTube([head.at(0.255, th, 0.003).p, head.at(0.2, th, 0.004).p, head.at(0.14, th - s * 0.05, 0.004).p, head.at(0.085, th - s * 0.08, 0.003).p], 0.0042, 0.0022, 16, 5), dark);
    // tusks: from the corner of the mouth, curving out, up and back
    const b = head.at(0.165, th + s * 0.05, -0.004).p;
    add(taperTube([b, b.clone().add(V(s * 0.026, 0.03, 0.014)), b.clone().add(V(s * 0.043, 0.072, 0.004)), b.clone().add(V(s * 0.037, 0.104, -0.022))], 0.0125, 0.0022, 14, 8), M.toon('#eee8d9'));
    // small mean eye under a heavy brow
    const e = head.at(0.072, s > 0 ? 0.42 : Math.PI - 0.42, 0.0015);
    maskEye(add, M, e.p, e.n, { rx: 0.0135, ry: 0.0105, tilt: -0.25, side: s, color: '#1d1512', lid: 0.42, lidColor: '#7a4a2e', rim: '#b9896a', rimK: 1.45 });
    add(taperTube([head.at(0.045, s > 0 ? 0.52 : Math.PI - 0.52, 0.004).p, head.at(0.075, s > 0 ? 0.6 : Math.PI - 0.6, 0.008).p, head.at(0.105, s > 0 ? 0.55 : Math.PI - 0.55, 0.004).p], 0.007, 0.004, 10, 6), M.toon('#4a2a1a'));
    // pointed ears with a pale inside, set high on the skull
    const ea = head.at(-0.075, s > 0 ? 1.05 : Math.PI - 1.05, -0.012);
    add(orient(leafGeo(0.118, 0.045, { at: 0.32, depth: 0.014, cup: 0.25, baseW: 0.8 }), ea.p, [s * 0.42, 0.86, -0.18], [s * 0.35, 0.05, 0.94]), fur);
    add(orient(place(leafGeo(0.082, 0.026, { at: 0.35, depth: 0.004, baseW: 0.8 }), [0, 0.012, 0.009]), ea.p, [s * 0.42, 0.86, -0.18], [s * 0.35, 0.05, 0.94]), M.toon('#c99a7c', { outline: false }));
  }
  // bristly mane along the crown and down the back of the head
  const mane = M.toon('#3f2416', { outline: 0.003 });
  for (let i = 0; i < 9; i++) {
    const z = 0.07 - i * 0.026, a = head.at(z, Math.PI / 2, -0.004);
    add(orient(place(new THREE.ConeGeometry(0.011, 0.05 - Math.abs(i - 4) * 0.003, 6), [0, 0.022, 0], [0, 0, 0], [1, 1, 0.45]), a.p, [0, 0.75, -0.66], [1, 0, 0]), mane);
  }
  // white mask string around the back of the head, tied in a bow
  const str = M.toon('#ece9e1', { outline: 0.0025 });
  const pts = [];
  for (let i = 0; i <= 14; i++) { const a = 0.25 + (i / 14) * (Math.PI - 0.5); pts.push(V(Math.cos(a) * 0.149, -0.012 + Math.sin(a) * 0.006, -0.045 - Math.sin(a) * 0.122)); }
  add(taperTube(pts, 0.0035, 0.0035, 40, 5), str);
  const knot = V(0, -0.006, -0.168);
  add(place(sphere(0.008, 0.007, 0.006, 10, 8), [knot.x, knot.y, knot.z]), str);
  for (const s of [-1, 1]) {
    add(place(new THREE.TorusGeometry(0.017, 0.0035, 6, 16), [knot.x + s * 0.018, knot.y + 0.006, knot.z - 0.004], [0.1, s * 0.2, s * 0.35], [1, 0.62, 1]), str);
    add(taperTube([knot, knot.clone().add(V(s * 0.012, -0.03, -0.004)), knot.clone().add(V(s * 0.02, -0.062, 0.004))], 0.0032, 0.0028, 10, 5), str);
  }
}

/** Pheasant / owl-like bird mask (Elizabeth): round feathered head, white throat bib, heavy-lidded eyes, small hooked beak. */
function maskPheasant(add, M) {
  // sphere uv: front (+z) at u = 0.25, v = 0 bottom … 1 top (canvas y = (1 − v) · h)
  const tex = cachedTex('mask:pheasant', () => canvasTexture(512, 256, (g, w, h) => {
    const r = rng(207);
    g.fillStyle = '#b08752'; g.fillRect(0, 0, w, h);
    softSpot(g, w * 0.25, h * 0.08, w * 0.4, h * 0.14, '#94703f', 0.8);              // darker crown
    softSpot(g, w * 0.25, h * 0.42, w * 0.075, h * 0.12, '#c9ab7a', 0.9);             // paler face around the eyes
    g.lineCap = 'round';
    for (let i = 0; i < 520; i++) {                                                     // feather streaks
      const x = r() * w, y = r() * h * 0.92, l = 5 + r() * 9;
      g.strokeStyle = r() < 0.65 ? 'rgba(84,58,28,0.6)' : 'rgba(232,212,170,0.55)'; g.lineWidth = 1 + r() * 1.2;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (r() - 0.5) * 4, y + l * 0.5, x + (r() - 0.5) * 3, y + l); g.stroke();
    }
    // white throat bib from under the beak down to the collar
    g.fillStyle = '#ece9e2';
    g.beginPath(); g.moveTo(w * 0.1, h); g.bezierCurveTo(w * 0.12, h * 0.7, w * 0.19, h * 0.56, w * 0.25, h * 0.55);
    g.bezierCurveTo(w * 0.31, h * 0.56, w * 0.38, h * 0.7, w * 0.4, h); g.closePath(); g.fill();
    for (let i = 0; i < 40; i++) {
      const x = w * (0.18 + r() * 0.14), y = h * (0.66 + r() * 0.3);
      g.strokeStyle = 'rgba(150,140,128,0.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + 5); g.stroke();
    }
  }));
  const def = (d) => {
    const v = V(d.x * 0.11, d.y * 0.114, d.z * 0.106);
    if (d.y > 0) v.y += 0.016 * Math.pow(d.y, 10);                             // a faint peak on the crown
    if (d.z > 0) v.z *= 1 - 0.2 * (1 - d.y * d.y) * Math.pow(d.z, 0.8);        // flat face
    if (d.y < 0) { v.x *= 1 - 0.1 * d.y * d.y; v.z *= 1 + 0.04 * -d.y; }      // rounded jaw tapering into the neck
    v.y += 0.012;
    return v;
  };
  const geo = new THREE.SphereGeometry(1, 44, 32);
  const pos = geo.attributes.position, d = V();
  for (let i = 0; i < pos.count; i++) { d.fromBufferAttribute(pos, i); pos.setXYZ(i, ...def(d).toArray()); }
  geo.computeVertexNormals();
  add(geo, M.toon('#ffffff', { map: tex }));
  maskNeck(add, M.toon('#e9e5dd'), { top: -0.06, bottom: -0.16, r: 0.06, cz: 0.0 });
  const surf = (x, y, z, lift = 0) => {
    const dir = V(x, y, z).normalize(), p = def(dir);
    const e = 0.01, a = def(V(x + e, y, z).normalize()), b = def(V(x, y + e, z).normalize());
    const n = V().crossVectors(a.sub(p), b.sub(p)).normalize();
    if (n.dot(p) < 0) n.negate();
    return { p: p.addScaledVector(n, lift), n };
  };
  for (const s of [-1, 1]) {
    const e = surf(s * 0.44, 0.16, 0.88, 0.001);
    maskEye(add, M, e.p, e.n, { rx: 0.02, ry: 0.0135, tilt: -0.1, side: s, color: '#2a2320', lid: 0.4, lidColor: '#b9996a', rim: '#6d5230', rimK: 1.28 });
  }
  // small hooked beak between and below the eyes
  const b = surf(0, 0.02, 1, -0.003).p;
  const beak = M.toon('#e0cd8c');
  add(taperTube([b, b.clone().add(V(0, -0.004, 0.017)), b.clone().add(V(0, -0.019, 0.025)), b.clone().add(V(0, -0.034, 0.019))], 0.0135, 0.0018, 14, 8), beak);
  add(place(sphere(0.012, 0.009, 0.01, 12, 8), [b.x, b.y + 0.003, b.z + 0.004]), beak);
  add(taperTube([b.clone().add(V(0, -0.009, 0.022)), b.clone().add(V(0, -0.025, 0.024))], 0.0016, 0.0014, 6, 4), M.toon('#6b5a33', { outline: false }));
}

/** Deer (Nicholas): long tan face sloping down to a black nose, side ears, heavy-lidded eyes, chin tuft, big branching antlers. */
function maskDeer(add, M) {
  const fur = M.toon('#ffffff', { map: furTex('deer', '#c39b63', { seed: 203, dark: '#7b5a33', light: '#e0c79d', n: 300, len: 11,
    paint: (g, w, h) => {
      softSpot(g, w * 0.25, h * 0.12, w * 0.16, h * 0.18, '#e8d8b8', 1);     // pale muzzle (front of the muzzle = top of the spine)
      softSpot(g, w * 0.05, h * 0.16, w * 0.1, h * 0.2, '#dcc59c', 0.8);
      softSpot(g, w * 0.45, h * 0.16, w * 0.1, h * 0.2, '#dcc59c', 0.8);
      softSpot(g, w * 0.75, h * 0.25, w * 0.16, h * 0.3, '#e2cfac', 0.8);     // pale throat
      softSpot(g, w * 0.25, h * 0.55, w * 0.07, h * 0.25, '#9d7443', 0.6);    // darker forehead
    } }) });
  const head = spineLoft([
    { y: 0.052, z: -0.082, w: 0.104, h: 0.106 },
    { y: 0.05, z: -0.045, w: 0.12, h: 0.121 },
    { y: 0.035, z: 0.01, w: 0.123, h: 0.122 },
    { y: 0.002, z: 0.055, w: 0.102, h: 0.098 },
    { y: -0.045, z: 0.085, w: 0.082, h: 0.074, n: 2.2 },
    { y: -0.092, z: 0.1, w: 0.069, h: 0.06, n: 2.4 },
    { y: -0.122, z: 0.106, w: 0.062, h: 0.052, n: 2.4 },
  ], { radial: 40, steps: 6, cap: [1, 0.55] });
  add(head.geo, fur);
  maskNeck(add, fur, { top: -0.05, bottom: -0.2, r: 0.068, cz: -0.03 });
  const ink = M.toon('#1d1714', { outline: false });
  // dark nose pad on the front of the muzzle tip + mouth line
  const np = head.at(0.104, Math.PI / 2, 0).p;
  add(place(sphere(0.036, 0.022, 0.018, 16, 10), [0, np.y - 0.01, np.z - 0.004], [-0.25, 0, 0]), M.toon('#3a3330'));
  for (const s of [-1, 1]) add(place(sphere(0.008, 0.0045, 0.004, 8, 6), [s * 0.015, np.y - 0.014, np.z + 0.012], [-0.2, 0, s * 0.5]), M.toon('#0d0b0a', { outline: false }));
  add(taperTube([V(0, np.y - 0.03, np.z + 0.006), V(0, np.y - 0.046, np.z - 0.002)], 0.0022, 0.0022, 4, 5), ink);
  add(taperTube([V(-0.024, np.y - 0.05, np.z - 0.014), V(0, np.y - 0.046, np.z - 0.002), V(0.024, np.y - 0.05, np.z - 0.014)], 0.0024, 0.0024, 10, 5), ink);
  for (const s of [-1, 1]) {
    const side = s > 0 ? 0 : Math.PI;
    // heavy-lidded eyes on the sides of the face
    const e = head.at(0.035, side + s * 0.42, 0.0015);
    maskEye(add, M, e.p, e.n, { rx: 0.025, ry: 0.0155, tilt: -0.16, side: s, color: '#201b18', lid: 0.42, lidColor: '#b48d58', rim: '#5c4528', rimK: 1.26 });
    // big ears up and out to the sides, pale inside
    const ea = head.at(-0.03, s > 0 ? 0.82 : Math.PI - 0.82, -0.01);
    const dir = [s * 0.86, 0.5, -0.12], face = [s * 0.05, 0.25, 1];
    add(orient(leafGeo(0.16, 0.058, { at: 0.45, depth: 0.012, cup: 0.35, baseW: 0.55 }), ea.p, dir, face), fur);
    add(orient(place(leafGeo(0.124, 0.038, { at: 0.45, depth: 0.004, baseW: 0.55 }), [0, 0.016, 0.009]), ea.p, dir, face), M.toon('#ecdec5', { outline: false }));
  }
  // chin tuft (goatee)
  const beard = M.toon('#6d5638', { outline: 0.0025 });
  const chin = head.at(0.1, -Math.PI / 2, -0.004).p;
  for (const [dx, len, bend] of [[-0.016, 0.06, -0.008], [-0.006, 0.075, -0.003], [0.006, 0.078, 0.004], [0.017, 0.062, 0.01]]) {
    const a = chin.clone().add(V(dx, 0, 0));
    add(taperTube([a, a.clone().add(V(bend * 0.4, -len * 0.5, 0.006)), a.clone().add(V(bend, -len, 0.0))], 0.0075, 0.0015, 10, 5), beard);
  }
  // antlers: a beam curving out and up with candelabra tines
  const bone = M.toon('#ece6d9');
  for (const s of [-1, 1]) {
    const base = head.at(-0.025, s > 0 ? 1.18 : Math.PI - 1.18, -0.008).p;
    const P = (x, y, z) => V(base.x + s * x, base.y + y, base.z + z);
    add(place(sphere(0.024, 0.016, 0.024, 12, 8), [base.x, base.y + 0.004, base.z]), M.toon('#d8cdb8'));   // burr
    const beam = [P(0, 0, 0), P(0.03, 0.07, -0.012), P(0.09, 0.17, -0.03), P(0.15, 0.29, -0.04), P(0.19, 0.42, -0.035), P(0.205, 0.56, -0.02)];
    add(taperTube(beam, 0.021, 0.0075, 26, 8), bone);
    const tines = [
      [P(0.025, 0.06, -0.01), P(0.035, 0.13, 0.035), P(0.022, 0.2, 0.058)],           // brow tine, forward
      [P(0.09, 0.17, -0.03), P(0.074, 0.27, -0.022), P(0.058, 0.37, -0.012)],          // bez tine, up
      [P(0.15, 0.29, -0.04), P(0.14, 0.39, -0.036), P(0.122, 0.5, -0.03)],            // trez tine, up
      [P(0.19, 0.42, -0.035), P(0.245, 0.49, -0.04), P(0.28, 0.57, -0.035)],          // outer crown point
      [P(0.198, 0.48, -0.03), P(0.17, 0.56, -0.025), P(0.15, 0.63, -0.02)],           // inner crown point
    ];
    for (const t of tines) add(taperTube(t, 0.0125, 0.0045, 12, 6), bone);
  }
}

/** Rabbit (David): white rounded head, big dark almond eyes, pink nose, split lip with buck teeth, tall ears. */
function maskRabbit(add, M) {
  const fur = M.toon('#ffffff', { map: furTex('rabbit', '#ece7dd', { seed: 205, dark: '#a59f97', light: '#ffffff', n: 220, len: 9,
    paint: (g, w, h) => { softSpot(g, w * 0.75, h * 0.3, w * 0.2, h * 0.35, '#e0d9cd', 0.8); } }) });
  const head = spineLoft([
    { y: 0.034, z: -0.085, w: 0.103, h: 0.112 },
    { y: 0.033, z: -0.048, w: 0.121, h: 0.131 },
    { y: 0.025, z: 0.0, w: 0.13, h: 0.138 },
    { y: -0.012, z: 0.05, w: 0.112, h: 0.108 },
    { y: -0.058, z: 0.084, w: 0.086, h: 0.076, n: 2.2 },
    { y: -0.096, z: 0.103, w: 0.062, h: 0.052, n: 2.2 },
    { y: -0.114, z: 0.11, w: 0.048, h: 0.04 },
  ], { radial: 40, steps: 6, cap: [1, 0.7] });
  add(head.geo, fur);
  maskNeck(add, fur, { top: -0.06, bottom: -0.17, r: 0.054, cz: -0.012 });
  const ink = M.toon('#1d1a19', { outline: false });
  // pink nose, Y-shaped split lip and two buck teeth on the front of the muzzle
  const n0 = head.at(0.082, Math.PI / 2, 0.001), mouth = head.at(0.1, Math.PI / 2, 0.001);
  add(orient(new THREE.CylinderGeometry(0.0165, 0.0155, 0.007, 3), n0.p, n0.n.toArray(), [0, -1, 0]), M.toon('#cf9890', { outline: 0.0025 }));
  const m = mouth.p, mn = mouth.n;
  add(taperTube([n0.p.clone().addScaledVector(mn, 0.002).add(V(0, -0.008, 0)), m.clone().addScaledVector(mn, 0.002)], 0.0022, 0.0022, 4, 5), ink);
  for (const s of [-1, 1]) add(taperTube([m.clone().addScaledVector(mn, 0.002), m.clone().add(V(s * 0.011, 0.004, -0.004)), m.clone().add(V(s * 0.022, 0.009, -0.012))], 0.0022, 0.0017, 8, 5), ink);
  for (const s of [-1, 1]) add(orient(new THREE.BoxGeometry(0.011, 0.018, 0.005), m.clone().add(V(s * 0.006, -0.011, -0.002)), [0, 1, 0], mn.toArray()), M.toon('#f8f6f0', { outline: 0.0022 }));
  for (const s of [-1, 1]) {
    const side = s > 0 ? 0 : Math.PI;
    // big dark almond eye holes, slanted
    const e = head.at(0.028, side + s * 0.8, 0.0015);
    maskEye(add, M, e.p, e.n, { rx: 0.032, ry: 0.0215, tilt: -0.26, side: s, color: '#3a3638', lid: 0.1, lidColor: '#ddd7cc', rim: '#5b5658', rimK: 1.15 });
    // tall ears, slightly splayed, pink inside
    const ea = head.at(-0.045, s > 0 ? 1.15 : Math.PI - 1.15, -0.01);
    const dir = [s * 0.2, 1, -0.16], face = [s * 0.12, 0.1, 1];
    add(orient(leafGeo(0.31, 0.054, { at: 0.48, depth: 0.014, cup: 0.4, baseW: 0.55 }), ea.p, dir, face), fur);
    add(orient(place(leafGeo(0.25, 0.033, { at: 0.5, depth: 0.004, baseW: 0.5 }), [0, 0.03, 0.01]), ea.p, dir, face), M.toon('#d8aba1', { outline: false }));
  }
}

/** Pigeon (Margaret): blue-grey round head, orange eyes on the sides, short yellow beak with a white cere. */
function maskPigeon(add, M) {
  const fur = M.toon('#ffffff', { map: furTex('pigeon', '#8e95a0', { seed: 209, dark: '#5f6670', light: '#b6bcc5', n: 200, len: 8,
    paint: (g, w, h) => {
      softSpot(g, w * 0.25, h * 0.55, w * 0.18, h * 0.6, '#727a86', 0.85);        // darker crown
      softSpot(g, w * 0.75, h * 0.95, w * 0.22, h * 0.18, '#6f8a7a', 0.7);        // iridescent throat (back / bottom)
      softSpot(g, w * 0.55, h * 0.92, w * 0.12, h * 0.12, '#8a7090', 0.5);
    } }) });
  const head = spineLoft([
    { y: 0.03, z: -0.1, w: 0.072, h: 0.077 },
    { y: 0.03, z: -0.055, w: 0.099, h: 0.106 },
    { y: 0.02, z: 0.005, w: 0.104, h: 0.11 },
    { y: 0.0, z: 0.055, w: 0.088, h: 0.088 },
    { y: -0.017, z: 0.091, w: 0.061, h: 0.056 },
    { y: -0.025, z: 0.112, w: 0.039, h: 0.034 },
  ], { radial: 40, steps: 6, cap: [1, 0.6] });
  add(head.geo, fur);
  maskNeck(add, fur, { top: -0.05, bottom: -0.17, r: 0.06, cz: -0.004 });
  // beak + white cere
  const b = V(0, -0.024, 0.112);
  add(taperTube([b, b.clone().add(V(0, -0.002, 0.03)), b.clone().add(V(0, -0.007, 0.056)), b.clone().add(V(0, -0.014, 0.066))], 0.0145, 0.0025, 14, 8), M.toon('#d6aa3c'));
  add(taperTube([b.clone().add(V(0, -0.008, 0.036)), b.clone().add(V(0, -0.011, 0.06))], 0.006, 0.002, 6, 5), M.toon('#7a5d22', { outline: false }));
  add(place(sphere(0.017, 0.011, 0.021, 14, 8), [0, b.y + 0.011, b.z + 0.008], [0.25, 0, 0]), M.toon('#ece8de'));
  for (const s of [-1, 1]) {
    const e = head.at(0.03, s > 0 ? 0.3 : Math.PI - 0.3, 0.001);
    maskEye(add, M, e.p, e.n, { rx: 0.0165, ry: 0.0165, side: s, color: '#262222', iris: '#de8c2a', pupil: '#121010', lid: 0.12, lidColor: '#7d8490', rim: '#b9bec6', rimK: 1.35 });
  }
}

/** Furry neck under a mask, down into the collar (the human neck is hidden while a mask is on). */
function maskNeck(add, mat, { top = -0.06, bottom = -0.19, r = 0.06, cz = 0 }) {
  add(ringLoft([{ y: bottom, w: r * 1.08, d: r * 1.04, cz }, { y: (top + bottom) / 2, w: r, d: r * 0.97, cz }, { y: top, w: r * 0.96, d: r * 0.94, cz }], { radial: 24, steps: 2 }), mat);
}

const MASKS = { boar: maskBoar, pheasant: maskPheasant, deer: maskDeer, rabbit: maskRabbit, pigeon: maskPigeon };
const MASK_SCALE = { pheasant: 1.14 };   // 女孩的鸟头面具比她自己的头大一圈（原作里面具占身高约四分之一）

function buildMask(id, rig) {
  const g = new THREE.Group();
  g.name = `mask_${id}`;
  const ps = new PartSet();
  const make = MASKS[id];
  if (make) make((geo, mat) => ps.add(g, geo, mat, 'mask'), rig.mats);
  ps.build({ id: `${rig.id}_mask`, tags: {} });
  g.scale.setScalar(MASK_SCALE[id] || 1);
  return g;
}
setMaskFactory(buildMask);

// ===========================================================================
// GOAT
// ===========================================================================

function buildGoat() {
  const rig = createRig('goat');
  const M = rig.mats;
  const fur = M.toon('#ffffff', { map: clothTex('#e5e7e4', { seed: 101, folds: 14, ink: 0.18 }) });
  const furPlain = M.toon('#e5e7e4');
  const pink = M.toon('#dfb0a6');
  const hoof = M.toon('#1a1a1a');
  const horn = M.toon('#ffffff', { map: ringTex('#c7a597', '#6e5a52', { n: 9 }) });
  const R = rig.root;
  const body = rig.addJoint('body', R, [0, 0.0, 0], 'goat_body');
  const J = rig.joints;
  // barrel
  const barrel = sphere(0.205, 0.215, 0.41, 26, 18);
  const bp = barrel.attributes.position, v = V();
  for (let i = 0; i < bp.count; i++) {
    v.fromBufferAttribute(bp, i);
    if (v.y < 0) v.y *= 1 + 0.15 * Math.max(0, 1 - Math.abs(v.z / 0.41) * 1.4);   // belly sag
    bp.setXYZ(i, v.x, v.y, v.z);
  }
  barrel.computeVertexNormals();
  rig.ps.add(body, place(barrel, [0, 0.66, -0.02]), fur, 'body');
  rig.ps.add(body, place(sphere(0.185, 0.2, 0.19, 18, 14), [0, 0.67, 0.27]), fur, 'body');
  rig.ps.add(body, place(sphere(0.18, 0.19, 0.2, 18, 14), [0, 0.68, -0.3]), fur, 'body');
  // chest fur tuft
  rig.ps.add(body, place(new THREE.ConeGeometry(0.06, 0.14, 8), [0, 0.55, 0.42], [Math.PI - 0.3, 0, 0], [1.4, 1, 0.6]), furPlain, 'body');
  // tail
  const tail = rig.addJoint('tail', body, [0, 0.8, -0.47]);
  rig.ps.add(tail, place(new THREE.ConeGeometry(0.04, 0.12, 10), [0, 0.04, -0.03], [-0.9, 0, 0]), furPlain, 'tail');
  // legs (front: knee forward, back: hock backward)
  const legDefs = [['FL', 0.1, 0.3], ['FR', -0.1, 0.3], ['BL', 0.1, -0.31], ['BR', -0.1, -0.31]];
  for (const [n, x, z] of legDefs) {
    const front = n[0] === 'F';
    const leg = rig.addJoint('leg' + n, body, [x, 0.56, z]);
    const knee = rig.addJoint('knee' + n, leg, [0, -0.25, front ? 0.0 : -0.01]);
    rig.ps.add(leg, limbGeo(front ? 0.06 : 0.075, 0.035, 0.25, 12), fur, 'leg');
    rig.ps.add(knee, limbGeo(0.033, 0.026, 0.27, 10), furPlain, 'leg');
    rig.ps.add(knee, place(sphere(0.034, 0.03, 0.034, 10, 8), [0, 0, 0]), furPlain, 'leg');
    rig.ps.add(knee, place(new THREE.CylinderGeometry(0.026, 0.032, 0.05, 10), [0, -0.29, 0.008]), hoof, 'leg');
  }
  // neck → head
  const neck = rig.addJoint('neck', body, [0, 0.76, 0.33]);
  rig.ps.add(neck, place(limbGeo(0.095, 0.075, 0.3, 14), [0, 0.0, 0], [Math.PI, 0, 0]), fur, 'neck');
  const head = rig.addJoint('head', neck, [0, 0.32, 0.0]);
  // skull + muzzle (head points +Z, slightly down)
  rig.ps.add(head, place(sphere(0.085, 0.095, 0.11, 18, 14), [0, 0.0, 0.02]), furPlain, 'head');
  rig.ps.add(head, place(sphere(0.062, 0.07, 0.115, 16, 12), [0, -0.05, 0.13], [0.35, 0, 0]), furPlain, 'head');
  rig.ps.add(head, place(sphere(0.03, 0.022, 0.02, 10, 8), [0, -0.055, 0.235], [0.4, 0, 0]), pink, 'head');
  for (const s of [-1, 1]) rig.ps.add(head, place(sphere(0.007, 0.004, 0.004), [s * 0.016, -0.06, 0.252]), M.toon('#3a2020', { outline: false }), 'head');
  // jaw (chewing) + beard
  const jaw = rig.addJoint('jaw', head, [0, -0.07, 0.07]);
  rig.ps.add(jaw, place(sphere(0.045, 0.024, 0.1, 12, 8), [0, -0.02, 0.085], [0.3, 0, 0]), furPlain, 'jaw');
  rig.ps.add(jaw, place(new THREE.ConeGeometry(0.035, 0.15, 10), [0, -0.1, 0.07], [Math.PI + 0.15, 0, 0], [1, 1, 0.7]), furPlain, 'jaw');
  rig.ps.add(jaw, place(new THREE.ConeGeometry(0.02, 0.06, 8), [0.018, -0.18, 0.075], [Math.PI + 0.1, 0, 0.2]), furPlain, 'jaw');
  rig.ps.add(jaw, place(new THREE.ConeGeometry(0.018, 0.05, 8), [-0.016, -0.175, 0.08], [Math.PI + 0.1, 0, -0.2]), furPlain, 'jaw');
  // tongue (hidden until after drinking)
  const tongueJ = rig.addJoint('tongue', jaw, [0, -0.01, 0.16]);
  const tongue = new THREE.Mesh(place(sphere(0.022, 0.008, 0.05, 12, 8), [0, 0, 0.035], [0.5, 0, 0]), pink);
  tongue.name = 'goat_tongue';
  tongueJ.add(tongue);
  tongueJ.visible = false;
  const leech = makeLeech(M, 0.075, 0.009, 0.4);
  leech.name = 'goat_leech';
  leech.position.set(0, -0.006, 0.07);
  leech.rotation.set(0.0, 0, 0.05);
  tongueJ.add(leech);
  leech.visible = false;
  // 舌头上的水蛭太小，挂一个看不见的点击球（材质不可见、userData.proxy：热点射线仍然认它）
  const leechProxy = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), noOutline(new THREE.MeshBasicMaterial({ visible: false })));
  leechProxy.position.y = -0.035; leechProxy.userData.proxy = true; leechProxy.name = 'goat_leech_hit';
  leech.add(leechProxy);
  // eyes (lateral, heavy-lidded), ears (horizontal, pink inside), horns
  for (const s of [-1, 1]) {
    rig.ps.add(head, place(sphere(0.021, 0.016, 0.02, 12, 8), [s * 0.072, 0.02, 0.07], [0, s * 0.5, 0]), M.toon('#f2f0e8'), 'eyes');
    rig.ps.add(head, place(sphere(0.009, 0.007, 0.008), [s * 0.088, 0.016, 0.078]), M.toon('#151515', { outline: false }), 'eyes');
    rig.ps.add(head, place(sphere(0.024, 0.011, 0.023, 12, 8), [s * 0.074, 0.03, 0.07], [0.15, s * 0.5, 0]), furPlain, 'head');
    const ear = rig.addJoint('ear' + (s > 0 ? 'L' : 'R'), head, [s * 0.075, 0.05, -0.02]);
    rig.ps.add(ear, place(sphere(0.03, 0.013, 0.075, 12, 8), [s * 0.05, 0, 0.0], [0, -s * 1.2, s * -0.3]), furPlain, 'ears');
    rig.ps.add(ear, place(sphere(0.02, 0.006, 0.055, 10, 8), [s * 0.052, 0.008, 0.0], [0, -s * 1.2, s * -0.3]), pink, 'ears');
    const hp = [];
    for (let i = 0; i <= 10; i++) {
      const k = i / 10, a = k * 2.3;
      hp.push(V(s * (0.035 + k * 0.05), 0.07 + Math.sin(a) * 0.17, 0.0 - (1 - Math.cos(a)) * 0.15 - k * 0.04));
    }
    rig.ps.add(head, taperTube(hp, 0.028, 0.006, 30, 10), horn, 'horns');
  }
  rig.ps.build(rig);
  rig.parts = { head, neck, jaw, torso: body, body, tail, legFL: J.legFL, legFR: J.legFR, legBL: J.legBL, legBR: J.legBR, legL: J.legFL, legR: J.legFR, armL: null, armR: null, handL: null, handR: null };
  const top = new THREE.Object3D(); top.name = 'goat_headTop'; top.position.set(0, 0.32, 0.0); head.add(top);
  rig.headTop = top;
  const STAND = {
    body: [0, 0, 0], neck: [0.55, 0, 0], head: [0.25, 0, 0], jaw: [0, 0, 0], tail: [0, 0, 0],
    legFL: [0.03, 0, 0], kneeFL: [-0.02, 0, 0], legFR: [-0.05, 0, 0], kneeFR: [0.02, 0, 0],
    legBL: [-0.08, 0, 0], kneeBL: [0.12, 0, 0], legBR: [0.02, 0, 0], kneeBR: [0.08, 0, 0], tongue: [0, 0, 0],
  };
  // 喝水：脖子朝前下方伸（水平线下约 36°），头再往下低，嘴朝下伸进身前约 0.65 m 处的木桶（桶沿高 0.42 m）
  const DRINK = { ...STAND, neck: [2.14, 0, 0], head: [-0.86, 0, 0], body: [0.06, 0, 0], legFL: [0.12, 0, 0], legFR: [0.1, 0, 0], kneeFL: [-0.12, 0, 0], kneeFR: [-0.1, 0, 0] };
  rig.POSES = { STAND, DRINK };
  rig.setPose(STAND);
  let chew = 1, lap = 0, bleatK = 0;
  rig._idleFn = (t, I) => {
    I.jaw[0] += (Math.max(0, Math.sin(t * 3.2)) * 0.14 * chew) + lap * Math.max(0, Math.sin(t * 9)) * 0.2 + bleatK * 0.35;
    I.jaw[1] += Math.sin(t * 3.2) * 0.04 * chew;
    I.head[0] += Math.sin(t * 0.6) * 0.03 - bleatK * 0.3;
    I.head[1] += Math.sin(t * 0.37) * 0.05;
    I.neck[0] += Math.sin(t * 0.45) * 0.02;
    I.tail[0] += Math.sin(t * 7) * 0.1 * (Math.sin(t * 0.7) > 0.6 ? 1 : 0);
    I.earL[2] += Math.sin(t * 0.9) * 0.05 + (Math.sin(t * 0.33) > 0.97 ? 0.3 : 0);
    I.earR[2] -= Math.sin(t * 0.8 + 1) * 0.05;
    I.body[0] += Math.sin(t * 1.4) * 0.005;
  };
  rig.face = null;
  rig.setMask = () => {};
  /** Head down into the bucket (~4 s), head up, tongue out with the leech. ~5.5 s. */
  rig.drink = async ({ instant = false } = {}) => {
    if (instant) { rig.setPose(STAND); tongueJ.visible = true; leech.visible = true; rig.pose.tongue = [0.25, 0, 0]; rig.apply(); return; }
    chew = 0;
    await rig.tweenPose(DRINK, 900, Ease.inOutSine);
    lap = 1;
    await wait(3600);
    lap = 0;
    await rig.tweenPose(STAND, 900, Ease.inOutSine);
    tongueJ.visible = true; leech.visible = true;
    rig.pose.tongue = [-0.6, 0, 0];
    await rig.tweenPose({ tongue: [0.25, 0, 0], jaw: [0.25, 0, 0] }, 500, Ease.outBack);
    chew = 0;
  };
  /** Show/hide the leech on the out-stretched tongue (false also pulls the tongue back in). */
  rig.tongueLeech = async (v = true, { instant = false } = {}) => {
    leech.visible = v;
    if (v) { tongueJ.visible = true; chew = 0; await rig.tweenPose({ tongue: [0.25, 0, 0], jaw: [0.25, 0, 0] }, 400, Ease.outSine, instant); }
    else { await rig.tweenPose({ tongue: [-0.6, 0, 0], jaw: [0, 0, 0] }, 300, Ease.inSine, instant); tongueJ.visible = false; chew = 1; }
  };
  /** Startled recoil (the machete does not hurt it). */
  rig.flinch = async ({ instant = false } = {}) => {
    if (instant) return;
    const p0 = { ...rig.pose, 'body.p': [0, 0, 0] };
    await rig.tweenPose({ 'body.p': [0, 0.02, -0.12], body: [-0.08, 0, 0], neck: [0.35, 0, 0], head: [-0.05, 0.25, 0], legBL: [0.1, 0, 0], legBR: [0.12, 0, 0] }, 180, Ease.outCubic);
    await wait(250);
    await rig.tweenPose({ 'body.p': [0, 0, 0], body: p0.body, neck: p0.neck, head: p0.head, legBL: p0.legBL, legBR: p0.legBR }, 600, Ease.inOutSine);
  };
  /** Bleat: mouth opens wide, head lifts (~0.9 s). */
  rig.bleat = async () => {
    await animate(250, (e) => { bleatK = e; });
    await wait(400);
    await animate(250, (e) => { bleatK = 1 - e; });
  };
  /** Local Euler for hand joint so that (in root space) fingers point along `fingers` and the palm faces `palm`. */
  rig.handRotFor = (side, fingers, palm) => {
    const s = side === 'L' ? 1 : -1;
    const yA = V(-fingers[0], -fingers[1], -fingers[2]).normalize();
    const xA = V(-s * palm[0], -s * palm[1], -s * palm[2]);
    xA.addScaledVector(yA, -xA.dot(yA)).normalize();
    const zA = V().crossVectors(xA, yA);
    const qWant = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, zA));
    root.updateMatrixWorld(true);
    const m = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(rig.joints['elbow' + side].matrixWorld);
    const qE = new THREE.Quaternion(); m.decompose(V(), qE, V());
    const qL = qE.invert().multiply(qWant);
    const e = new THREE.Euler().setFromQuaternion(qL, 'XYZ');
    return [e.x, e.y, e.z];
  };

  rig.play = (anim = 'idle') => { rig.anim = anim; if (anim === 'bleat') { rig.anim = 'idle'; rig.bleat(); } chew = anim === 'none' ? 0 : chew; };
  rig.play('idle');
  rig.apply();
  return rig;
}

// ===========================================================================
// INTRO BOAT — grey-white rowboat with the small rowing figure (Jakob)
// ===========================================================================

function hullGeo(L = 2.6, W = 0.56, D = 0.36) {
  const NU = 28, NV = 14;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    const x = (u - 0.5) * L;
    // stern (u=0) is a narrow transom, bow (u=1) is pointed
    const w = W * (u < 0.15 ? lerp(0.62, 1, smooth(u / 0.15)) : Math.pow(Math.sin(Math.PI * (0.5 + 0.5 * (u - 0.15) / 0.85)), 0.55)) * (u > 0.995 ? 0 : 1);
    const sheer = 0.08 * Math.pow(Math.abs(u - 0.45) * 2, 2) + (u > 0.85 ? (u - 0.85) * 0.5 : 0);
    const d = D * (u < 0.1 ? 0.85 : 1) * (1 - 0.35 * Math.pow(Math.max(0, u - 0.75) / 0.25, 1.5));
    for (let j = 0; j <= NV; j++) {
      const v = j / NV, th = v * Math.PI;
      const z = Math.cos(th) * w;
      const y = sheer - d * Math.pow(Math.sin(th), 0.6);
      pos.push(x, y, z); uv.push(u, v);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * (NV + 1) + j, b = a + NV + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildIntroBoat() {
  const root = new THREE.Group(); root.name = 'intro_boat';
  const M = matSet();
  const boat = new THREE.Group(); boat.name = 'intro_boat_hull';
  root.add(boat);
  const L = 2.6, W = 0.56;
  const planks = M.toon('#ffffff', { map: clothTex('#cfcac0', { seed: 111, folds: 4, ink: 0.3, plank: true }), side: THREE.DoubleSide });
  const hull = new THREE.Mesh(hullGeo(L, W, 0.36), planks);
  hull.castShadow = true;
  boat.add(hull);
  // gunwale rims
  const rimPts = (s) => {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const u = i / 20, x = (u - 0.5) * L;
      const w = W * (u < 0.15 ? lerp(0.62, 1, smooth(u / 0.15)) : Math.pow(Math.sin(Math.PI * (0.5 + 0.5 * (u - 0.15) / 0.85)), 0.55));
      const sheer = 0.08 * Math.pow(Math.abs(u - 0.45) * 2, 2) + (u > 0.85 ? (u - 0.85) * 0.5 : 0);
      pts.push(V(x, sheer + 0.01, s * w));
    }
    return pts;
  };
  const wood = M.toon('#8d8578');
  const rimGeos = [prep(taperTube(rimPts(1), 0.02, 0.016, 40, 6)), prep(taperTube(rimPts(-1), 0.02, 0.016, 40, 6))];
  // thwarts + transom board
  for (const x of [-0.75, 0.0, 0.62]) rimGeos.push(prep(place(new THREE.BoxGeometry(0.16, 0.03, W * 1.75), [x, -0.06, 0])));
  rimGeos.push(prep(place(new THREE.BoxGeometry(0.03, 0.3, W * 1.2), [-L / 2 + 0.01, -0.12, 0])));
  boat.add(new THREE.Mesh(mergeGeometries(rimGeos), wood));
  // water shadow / reflection under the boat
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: '#4e5356', transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.material.userData.outlineParameters = { visible: false };
  shadow.rotation.x = -Math.PI / 2; shadow.scale.set(L * 0.62, W * 1.6, 1); shadow.position.y = 0.012;
  root.add(shadow);
  // rower (faces the stern = -X), seated on the middle thwart
  const rower = buildJakob({ id: 'rower', bust: false, seated: true, small: true, hat: true });
  rower.root.rotation.y = -Math.PI / 2;
  rower.root.position.set(0.05, -0.36, 0);
  boat.add(rower.root);
  const sitPose = {
    legL: [-1.35, 0, 0.12], kneeL: [1.2, 0, 0], legR: [-1.35, 0, -0.12], kneeR: [1.2, 0, 0], footL: [0.1, 0, 0], footR: [0.1, 0, 0],
  };
  rower.setPose(sitPose);
  rower.setHand('L', 'grip'); rower.setHand('R', 'grip');
  // oars pivot on the gunwales slightly aft of the rower
  const oars = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.28, 0.06, s * W * 0.98);
    boat.add(pivot);
    const oar = new THREE.Group();
    pivot.add(oar);
    const shaft = place(new THREE.CylinderGeometry(0.016, 0.016, 2.2, 8), [0, 0, 0], [Math.PI / 2, 0, 0]);
    const blade = place(new THREE.BoxGeometry(0.012, 0.13, 0.45), [0, 0, 0.95 + 0.2]);
    const og = mergeGeometries([prep(shaft), prep(blade)]);
    og.translate(0, 0, s * 0.35 * 0); // handle end towards the rower
    const mesh = new THREE.Mesh(og, M.toon('#8a6e50'));
    mesh.position.z = s * 0.72;
    mesh.scale.z = s;
    oar.add(mesh);
    const handle = new THREE.Object3D(); handle.position.set(0, 0, s * (0.72 - 1.1 + 0.08)); mesh.position.z = s * 0.72; oar.add(handle);
    oars.push({ pivot, oar, handle, s });
  }
  let rowing = false, amp = 0, phase = 0;
  const _h = V(), _r = V();
  const poleL = [1, -0.3, -1], poleR = [-1, -0.3, -1];
  function step(dt, t) {
    amp = clamp(amp + (rowing ? 1 : -1) * dt * 1.5, 0, 1);
    phase += dt * 2 * Math.PI * 0.45 * (0.3 + 0.7 * amp);
    const c = Math.cos(phase), sn = Math.sin(phase);
    // oar sweep (yaw) and lift (blade in water during the pull)
    for (const o of oars) {
      o.oar.rotation.y = o.s * (0.45 * c * amp + 0.05);
      o.oar.rotation.x = o.s * (sn > 0 ? 0.05 : -0.18) * amp + o.s * 0.15;
    }
    // rower leans with the stroke
    rower.pose.torso[0] = 0.25 * c * amp + 0.05;
    rower.pose.head[0] = -0.15 * c * amp;
    rower.update(dt, t);
    root.updateMatrixWorld(true);
    // hands on the oar handles
    for (let i = 0; i < 2; i++) {
      const o = oars[i];
      _h.setFromMatrixPosition(o.handle.matrixWorld);
      rower.root.worldToLocal(_r.copy(_h));
      // oar s=+1 is on the boat's +Z side = rower's right when facing -X
      const side = o.s > 0 ? 'R' : 'L';
      rower.ikArm(side, _r, side === 'L' ? poleL : poleR);
    }
    rower.apply(false, true);
    // gentle bob
    boat.rotation.z = Math.sin(t * 1.1) * 0.012 + 0.015 * c * amp;
    boat.rotation.x = Math.sin(t * 0.8) * 0.01;
    boat.position.y = Math.sin(t * 1.3) * 0.008;
  }
  step(0, 0);
  return {
    root, rower, boat,
    update(dt = 0, t = 0) { step(dt, t); },
    row(v = true) { rowing = !!v; },
  };
}
// ===========================================================================
// Public API
// ===========================================================================

const BUILDERS = { ...CAST, ...CAST_P3 };

/** Build a character rig by id (see list above). */
export function makeCharacter(id) {
  const b = BUILDERS[id];
  if (!b) throw new Error(`makeCharacter: unknown id "${id}". Known: ${Object.keys(BUILDERS).join(', ')}`);
  const rig = b();
  rig.root.userData.rig = rig;
  return rig;
}

/** Build an animal rig. Only 'goat' exists. */
export function makeAnimal(kind = 'goat') {
  if (kind !== 'goat') throw new Error(`makeAnimal: unknown kind "${kind}" (known: goat)`);
  const gm = getModel('goat');   // 有网格山羊就用网格（src/art/models/goat.rlpm），否则程序化山羊
  const rig = gm ? buildGoatModel(gm) : buildGoat();
  rig.root.userData.rig = rig;
  return rig;
}

/** Small rowboat with the rowing figure for the intro. Bow points +X; call row(true) to start rowing. */
export function makeIntroBoat() {
  return buildIntroBoat();
}

export const CHARACTER_IDS = Object.keys(BUILDERS);

/** 注册新角色构建函数；注册后 makeCharacter(id) 就能用。重复注册会覆盖并给出警告。 */
export function registerCharacter(id, builder) {
  if (BUILDERS[id]) console.warn(`[characters] registerCharacter: "${id}" 已存在，被覆盖`);
  BUILDERS[id] = builder;
}

export const CHAR_KIT = {
  THREE, mergeGeometries, mergeVertices, RoundedBoxGeometry, MeshSurfaceSampler,
  PALETTE, toon, unlit, canvasTexture, rng, shade, noOutline, animate, wait, Ease,
  INK, OUT, TAU, clamp, lerp, smooth, V,
  matSet, cachedTex, clothTex, ringTex, hairTex, place, prep, sphere, lathe, limbGeo, taperTube,
  headDeform, skullGeo, decalGeo, headSurface, FS, FX, FY, pen, path, line, blob, eye, faceSet, ikTwoBone,
  createRig, skeleton, addHead, handGeo, addHands, addArms, addLegs, torsoGeo, addButtons, hairCapGeo,
  buildHuman, humanIdle, fitAlongY, fitSize, tryProp, makeLeech, blackCube, paintPlain, buildMask,
  spineLoft, ringLoft, ribbonGeo, leafGeo, orient, furTex, softSpot, maskEye, maskNeck,
  HUMAN, CAST: CASTMOD,
  // 旧接口名：直接指向新角色构建
  buildDavid: CAST.david, buildMargaret: ({ standing = false, id } = {}) => (standing ? CAST.margaret_chef() : CAST.margaret()), buildJakob: CASTMOD.buildJakob, buildGerard: CAST.gerard_boar, buildElizabeth: CAST.elizabeth_pheasant,
  get makeProp() { return makeProp; },
};
