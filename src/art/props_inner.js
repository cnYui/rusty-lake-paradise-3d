// Forest / house props and their items for Plague I (see ARCHITECTURE.md §props_inner.js and
// docs/impl_props_inner.md). Every factory returns an Object3D (origin on the ground or at the
// hanging point) with its methods attached directly on the object. Every state-changing method
// returns a Promise and accepts { instant: true } as its last argument.
//
// Look: flat cartoon with thick black ink outlines (toon() + OutlineEffect), details painted on
// canvas textures, colour only in blood, wood, gold and the prawn.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, toon, noOutline, canvasTexture, rng, shade, tex } from './materials.js';
import { animate, wait, Ease } from '../core/tween.js';

// ===========================================================================================
// Helpers
// ===========================================================================================

const memo = new Map();
function once(key, make) {
  if (!memo.has(key)) memo.set(key, make());
  return memo.get(key);
}

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** Remap k from [a, b] to [0, 1] (clamped) — handy for staging several moves inside one animate(). */
const seg = (k, a, b) => clamp01((k - a) / (b - a));
const outCubic = (k) => 1 - Math.pow(1 - k, 3);
const inCubic = (k) => k * k * k;

/** Parse the trailing options argument (tolerates booleans / numbers from the dev viewer). */
function opt(o) { return o && typeof o === 'object' ? o : {}; }

/** animate() unless instant (then jump straight to the end state). */
function run(instant, ms, fn, ease = Ease.inOutSine) {
  if (instant || ms <= 0) { fn(1); return Promise.resolve(); }
  return animate(ms, fn, ease);
}

function place(o, { name, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s, parent, shadow = true } = {}) {
  if (name) o.name = name;
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  if (s !== undefined) { if (Array.isArray(s)) o.scale.set(s[0], s[1], s[2]); else o.scale.setScalar(s); }
  if (o.isMesh && shadow) o.castShadow = true;
  if (parent) parent.add(o);
  return o;
}
const mesh = (geo, mat, o = {}) => place(new THREE.Mesh(geo, mat), o);
const group = (o = {}) => place(new THREE.Group(), o);

/** Rounded box (smooth normals → clean outlines). */
const rbox = (w, h, d, r = 0.01, seg_ = 2) => new RoundedBoxGeometry(w, h, d, seg_, Math.min(r, w / 2, h / 2, d / 2));

/** Invisible but pickable proxy (bigger click targets for hotspots). */
const HIT_MAT = noOutline(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
function hitBox(w, h, d, x, y, z, name, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), HIT_MAT);
  m.name = name; m.position.set(x, y, z); m.userData.pickProxy = true; m.renderOrder = -10;
  if (parent) parent.add(m);
  return m;
}

/** Toon material with a canvas texture (cached by key). */
function toonTex(key, w, h, draw, { color = '#ffffff', outline, repeat, wrap = false, ...rest } = {}) {
  const map = once('tex:' + key, () => canvasTexture(w, h, draw, { wrap, repeat }));
  const o = { map, ...rest };
  if (outline !== undefined) o.outline = outline;
  return toon(color, o);
}

/** Merge every single-material mesh under `root` into one mesh per material (static geometry). */
function bake(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map();
  const victims = [];
  const m4 = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || o.userData.noBake || o.userData.pickProxy) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g);
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  const out = [];
  for (const [mat, geos] of buckets) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = true;
    root.add(m);
    out.push(m);
  }
  return out;
}

/**
 * Re-sort the triangles of a geometry into material groups: classify(centroid, normal, oldGroup)
 * → new material index. Lets one extruded / rounded mesh carry a painted front + plain sides.
 */
function regroup(geo, classify) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const pos = src.attributes.position, nor = src.attributes.normal;
  const tri = pos.count / 3;
  const old = new Int8Array(tri);
  for (const gr of src.groups) for (let t = gr.start / 3; t < (gr.start + gr.count) / 3; t++) old[t] = gr.materialIndex;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), t1 = new THREE.Vector3();
  const lists = [];
  for (let t = 0; t < tri; t++) {
    a.fromBufferAttribute(pos, t * 3); b.fromBufferAttribute(pos, t * 3 + 1); c.fromBufferAttribute(pos, t * 3 + 2);
    n.fromBufferAttribute(nor, t * 3).add(t1.fromBufferAttribute(nor, t * 3 + 1)).add(t1.fromBufferAttribute(nor, t * 3 + 2)).normalize();
    const cen = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const gi = classify(cen, n, old[t]);
    (lists[gi] || (lists[gi] = [])).push(t);
  }
  const out = new THREE.BufferGeometry();
  const names = Object.keys(src.attributes);
  const arrays = {};
  for (const k of names) arrays[k] = new Float32Array(src.attributes[k].array.length);
  let cur = 0;
  lists.forEach((list, gi) => {
    if (!list) return;
    const start = cur;
    for (const t of list) {
      for (let v = 0; v < 3; v++) {
        for (const k of names) {
          const at = src.attributes[k], s = at.itemSize;
          for (let i = 0; i < s; i++) arrays[k][cur * s + i] = at.array[(t * 3 + v) * s + i];
        }
        cur++;
      }
    }
    out.addGroup(start, cur - start, gi);
  });
  for (const k of names) out.setAttribute(k, new THREE.BufferAttribute(arrays[k], src.attributes[k].itemSize));
  return out;
}

/** Rounded box whose +z face uses material 0 and every other face material 1. */
function frontBox(w, h, d, r = 0.01) {
  return regroup(rbox(w, h, d, r), (cen, n) => (n.z > 0.7 && cen.z > d / 2 - r - 1e-4 ? 0 : 1));
}

/** UV generator for ExtrudeGeometry: lids map the shape's bounding box to 0..1. */
function boxUV(minX, minY, w, h) {
  return {
    generateTopUV(geometry, v, a, b, c) {
      const f = (i) => new THREE.Vector2((v[i * 3] - minX) / w, (v[i * 3 + 1] - minY) / h);
      return [f(a), f(b), f(c)];
    },
    generateSideWallUV(geometry, v, a, b, c, d) {
      const ax = v[a * 3], ay = v[a * 3 + 1], az = v[a * 3 + 2];
      const bx = v[b * 3], by = v[b * 3 + 1], bz = v[b * 3 + 2];
      const cx = v[c * 3], cy = v[c * 3 + 1], cz = v[c * 3 + 2];
      const dx = v[d * 3], dy = v[d * 3 + 1], dz = v[d * 3 + 2];
      if (Math.abs(ay - by) < Math.abs(ax - bx)) {
        return [new THREE.Vector2(ax, 1 - az), new THREE.Vector2(bx, 1 - bz), new THREE.Vector2(cx, 1 - cz), new THREE.Vector2(dx, 1 - dz)];
      }
      return [new THREE.Vector2(ay, 1 - az), new THREE.Vector2(by, 1 - bz), new THREE.Vector2(cy, 1 - cz), new THREE.Vector2(dy, 1 - dz)];
    },
  };
}

/**
 * Extrude a 2D shape (metres) centred on z = 0 with a painted front lid.
 * Returns geometry with groups: 0 = front lid, 1 = sides + back lid.
 */
function extrudeFront(shape, depth, bevel = 0.008, curveSegments = 24) {
  const pts = shape.getPoints(curveSegments);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments,
    UVGenerator: boxUV(minX, minY, maxX - minX, maxY - minY),
  });
  geo.translate(0, 0, -depth / 2);
  const front = depth / 2 + bevel;
  const out = regroup(geo, (cen, n, g) => (g === 0 && n.z > 0.5 && cen.z > front - 1e-4 ? 0 : 1));
  out.userData.bbox = { minX, minY, maxX, maxY };
  return out;
}

/** Draw helper: path from [[x,y],...] */
function poly(g, pts, close = true) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (close) g.closePath();
}
function inkStroke(g, w = 3, col = '#1d150d') { g.lineWidth = w; g.strokeStyle = col; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }

/** Wood grain lines on a canvas region. */
function grain(g, w, h, r, { n = 30, col = 'rgba(40,28,14,0.35)', vertical = true, wobble = 4, lw = [1, 2.4] } = {}) {
  g.save();
  g.strokeStyle = col; g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    g.lineWidth = lw[0] + r() * (lw[1] - lw[0]);
    g.beginPath();
    if (vertical) {
      let x = r() * w; g.moveTo(x, -5);
      for (let y = 0; y <= h + 20; y += 24) { x += (r() - 0.5) * wobble; g.lineTo(x, y); }
    } else {
      let y = r() * h; g.moveTo(-5, y);
      for (let x = 0; x <= w + 20; x += 24) { y += (r() - 0.5) * wobble; g.lineTo(x, y); }
    }
    g.stroke();
  }
  g.restore();
}

// ===========================================================================================
// Shared materials
// ===========================================================================================

const C = {
  owlWood: '#ab9063',
  blood: '#a3121a',
  bloodTop: '#bd2a2a',
  bloodDeep: '#8f1706',
  leech: '#5a1a14',
  iron: '#7d7d7b',
  spout: '#8a7a6e',
  stone: '#b3b2ab',
  stoneIn: '#62615c',
  bucket: '#c4a172',
  hoop: '#4f4036',
  cloth: '#f1efe9',
  prawn: '#e07a60',
  chair: '#7b5a42',
  uphol: '#5f3d33',
  cab: '#7a5c48',
  cabDark: '#2e2f2d',
  bolt: '#a5583f',
  gold: '#b8901f',
  goldLight: '#cfae4a',
  shed: '#aeaba3',
  copper: '#c47f6c',
  brass: '#d4a62a',
  staple: '#a7a8a4',
};

/**
 * Cartoon glass: transparent body, white rim towards the silhouette (fresnel with a hard step,
 * like the white inner stroke of the original's glassware), black ink outline from OutlineEffect.
 * Two materials: `front` (FrontSide, writes depth so the outline hull stays hidden behind it) and
 * `back` (BackSide inner wall, no outline) — use glassMeshes() to get both.
 */
function glassMat({ tint = '#ffffff', base = 0.05, lo = 0.42, hi = 0.78, back = false } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(tint) }, uBase: { value: base }, uLo: { value: lo }, uHi: { value: hi } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uBase; uniform float uLo; uniform float uHi;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float rim = smoothstep(uLo, uHi, f);
        float a = uBase + (0.92 - uBase) * rim;
        gl_FragColor = vec4(uColor * (0.86 + 0.14 * rim), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: true,
    side: back ? THREE.BackSide : THREE.FrontSide,
  });
  if (back) noOutline(m);
  else m.userData.outlineParameters = { thickness: 0.0045, color: [0.05, 0.05, 0.05], alpha: 1, visible: true };
  return m;
}
const GLASS = () => once('mat:glass', () => ({ front: glassMat(), back: glassMat({ back: true, base: 0.02, lo: 0.5 }) }));
/** Two meshes (inner wall first, then the depth-writing outer skin) sharing one geometry. */
function glassMeshes(geo, name, parent) {
  const { front, back } = GLASS();
  const b = mesh(geo, back, { name: name + '_in', parent, shadow: false });
  b.renderOrder = 1;
  const f = mesh(geo, front, { name, parent, shadow: false });
  f.renderOrder = 2;
  return f;
}

/**
 * Liquid material clipped above a (local-space) fill height: everything with position.y > uFill
 * is discarded. Used for blood in the jug / wine glass. No outline (the glass draws the ink).
 */
function fillMat(color, uniform) {
  const m = toon(color, { outline: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFill = uniform;
    sh.vertexShader = 'varying float vFillY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFillY = position.y;');
    sh.fragmentShader = 'uniform float uFill;\nvarying float vFillY;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (vFillY > uFill) discard;');
  };
  m.customProgramCacheKey = () => 'rlp-fill-clip';
  return m;
}

/** Piecewise-linear radius lookup on a lathe profile [[r, y], ...] (y ascending). */
function profileR(profile, y) {
  if (y <= profile[0][1]) return profile[0][0];
  for (let i = 1; i < profile.length; i++) {
    const [r1, y1] = profile[i];
    if (y <= y1) { const [r0, y0] = profile[i - 1]; return lerp(r0, r1, (y - y0) / Math.max(1e-6, y1 - y0)); }
  }
  return profile[profile.length - 1][0];
}
const lathe = (profile, segs = 32) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs);

/** Small pool of blood droplets for splashes (one InstancedMesh, hidden when idle). */
function makeDroplets(n, radius, color = C.blood) {
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, 8, 6), toon(color, { outline: false }), n);
  im.visible = false;
  im.frustumCulled = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  im.userData.set = (i, x, y, z, sc) => {
    p.set(x, y, z); s.setScalar(Math.max(1e-4, sc));
    im.setMatrixAt(i, m4.compose(p, q, s));
  };
  im.userData.commit = () => { im.instanceMatrix.needsUpdate = true; };
  return im;
}

// ===========================================================================================
// Items: leech, jug, jug_blood, key
// ===========================================================================================

function leechTexture() {
  return once('tex:leech', () => canvasTexture(128, 256, (g, w, h) => {
    const r = rng(41);
    // dark maroon back
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#3a0f0c'); grd.addColorStop(0.45, '#5a1a14'); grd.addColorStop(1, '#3a0f0c');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // lighter belly rings (u ≈ 0.22..0.68 is the lower / front side of the crescent)
    const rings = 17;
    for (let i = 1; i < rings; i++) {
      const y = (i / rings) * h;
      const taper = Math.sin((i / rings) * Math.PI);
      g.fillStyle = `rgba(176,64,56,${0.55 + 0.35 * taper})`;
      g.beginPath();
      g.ellipse(w * 0.45, y, w * 0.24 * (0.5 + 0.5 * taper), 3.2, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(20,4,4,0.85)';
      g.fillRect(w * 0.18, y + 4.5, w * 0.56, 2.2);
    }
    // faint back segments
    g.strokeStyle = 'rgba(15,3,3,0.5)'; g.lineWidth = 1.5;
    for (let i = 1; i < rings; i++) {
      const y = (i / rings) * h + 6;
      g.beginPath(); g.moveTo(w * 0.72, y); g.lineTo(w, y); g.moveTo(0, y); g.lineTo(w * 0.16, y); g.stroke();
    }
    for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.2})`; g.fillRect(r() * w, r() * h, 2, 2); }
  }, { wrap: false }));
}

function leechGeometry() {
  return once('geo:leech', () => {
    const L = 0.05, R = 0.062;
    const g = new THREE.SphereGeometry(1, 32, 18);
    g.rotateZ(-Math.PI / 2); // poles → ±x, v runs along the body
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) * L, y = p.getY(i) * 0.0105, z = p.getZ(i) * 0.0095;
      const head = smooth(0.1, 1.0, x / L) * 0.32;          // narrower head end
      y *= 1 - head; z *= 1 - head;
      y -= 0.0025 * Math.cos((x / L) * Math.PI * 0.5);       // flatter belly
      const th = x / R, rr = R - y;                          // bend into a "smile"
      p.setXYZ(i, rr * Math.sin(th), R - rr * Math.cos(th) + 0.0105, z);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Leech: dark maroon segmented crescent (≈10 cm), lying in the XY plane facing +z, origin under its belly. */
function makeLeech() {
  const root = group({ name: 'leech' });
  const mat = once('mat:leech', () => toon('#ffffff', { map: leechTexture() }));
  mesh(leechGeometry(), mat, { name: 'leech_body', parent: root });
  return root;
}

/** Wiggle helper for a leech group: k = phase (0..1 loops), amp = strength. */
function wriggle(leech, t, amp = 1) {
  const b = leech.children[0];
  if (!b) return;
  b.rotation.z = Math.sin(t * 9) * 0.12 * amp;
  b.scale.set(1 + Math.sin(t * 13) * 0.07 * amp, 1 - Math.sin(t * 13) * 0.05 * amp, 1);
}

// Jug (clear glass pitcher). Outer profile [r, y] (m) — 32 cm tall, belly Ø 20 cm.
const JUG_OUT = [[0.0, 0.02], [0.036, 0.02], [0.07, 0.03], [0.092, 0.062], [0.101, 0.112], [0.096, 0.158],
  [0.077, 0.198], [0.051, 0.232], [0.04, 0.256], [0.041, 0.278], [0.049, 0.298], [0.058, 0.315], [0.063, 0.322]];
const JUG_IN = JUG_OUT.slice(1, -1).map(([r, y]) => [Math.max(0.0, r - 0.006), y]);
JUG_IN.unshift([0, 0.025]);
const JUG_FILL_MIN = 0.026, JUG_FILL_MAX = 0.306;

function jugGlassGeometry() {
  return once('geo:jugGlass', () => {
    const g = lathe(JUG_OUT, 40);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 1e-5) continue;
      const w = smooth(0.268, 0.322, y);
      const s = Math.pow(Math.max(0, -x / r), 3);               // spout towards -x
      p.setXYZ(i, x - 0.032 * w * s, y + 0.012 * w * s, z * (1 - 0.25 * w * s));
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Glass pitcher; userData.setFill(k) fills it with blood (0..1, 1 = to the brim). */
function makeJug(fill = 0) {
  const root = group({ name: 'jug' });
  const white = once('mat:jugFoot', () => toon('#efeeea'));
  const foot = mesh(lathe([[0, 0], [0.056, 0], [0.059, 0.006], [0.055, 0.015], [0.04, 0.021], [0, 0.021]], 32), white, { name: 'jug_foot', parent: root });
  foot.castShadow = true;
  glassMeshes(jugGlassGeometry(), 'jug_glass', root);
  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.042, 0.29, 0), new THREE.Vector3(0.09, 0.298, 0), new THREE.Vector3(0.127, 0.262, 0),
    new THREE.Vector3(0.124, 0.2, 0), new THREE.Vector3(0.1, 0.152, 0), new THREE.Vector3(0.083, 0.13, 0),
  ]);
  glassMeshes(once('geo:jugHandle', () => new THREE.TubeGeometry(handleCurve, 28, 0.0095, 8)), 'jug_handle', root);
  // blood (clipped lathe + surface disc)
  const uFill = { value: 0 };
  const blood = mesh(once('geo:jugIn', () => lathe(JUG_IN, 32)), fillMat(C.blood, uFill), { name: 'jug_blood_body', parent: root, shadow: false });
  const top = mesh(once('geo:disc', () => new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2)), once('mat:bloodTop', () => toon(C.bloodTop, { outline: false })), { name: 'jug_blood_top', parent: root, shadow: false });
  root.userData.fill = 0;
  root.userData.setFill = (k) => {
    k = clamp01(k);
    root.userData.fill = k;
    const y = lerp(JUG_FILL_MIN, JUG_FILL_MAX, k);
    uFill.value = y;
    blood.visible = top.visible = k > 0.002;
    top.position.y = y;
    top.scale.setScalar(Math.max(0.001, profileR(JUG_IN, y) - 0.0005));
  };
  /** World-free helper: local y of the blood surface. */
  root.userData.surfaceY = () => lerp(JUG_FILL_MIN, JUG_FILL_MAX, root.userData.fill);
  root.userData.setFill(fill);
  return root;
}

/** Brass skeleton key (≈13 cm) lying along +x in the XY plane, bit pointing up, origin at its centre. */
function makeKey() {
  const root = group({ name: 'key' });
  const gold = once('mat:keyGold', () => toon('#d8ab2c'));
  const dark = once('mat:keyGoldDark', () => toon('#b88a1e'));
  mesh(new THREE.TorusGeometry(0.0165, 0.0058, 10, 28), gold, { name: 'key_bow', x: -0.046, s: [1, 1.18, 1.3], parent: root });
  mesh(new THREE.CylinderGeometry(0.0068, 0.0068, 0.012, 14).rotateZ(Math.PI / 2), dark, { x: -0.024, parent: root });
  mesh(new THREE.CylinderGeometry(0.0046, 0.0046, 0.1, 12).rotateZ(Math.PI / 2), gold, { x: 0.02, parent: root });
  mesh(new THREE.SphereGeometry(0.0055, 10, 8), gold, { x: 0.07, parent: root });
  // bit: two prongs with a bar → reads as the old key silhouette
  mesh(rbox(0.0075, 0.03, 0.006, 0.002), gold, { x: 0.063, y: 0.015, parent: root });
  mesh(rbox(0.0075, 0.022, 0.006, 0.002), gold, { x: 0.047, y: 0.011, parent: root });
  mesh(rbox(0.024, 0.0065, 0.006, 0.002), gold, { x: 0.055, y: 0.027, parent: root });
  return root;
}

// ===========================================================================================
// wine_glass
// ===========================================================================================

const WINE_OUT = [[0, 0], [0.036, 0], [0.037, 0.004], [0.012, 0.008], [0.0055, 0.016], [0.0048, 0.07],
  [0.009, 0.081], [0.022, 0.09], [0.035, 0.105], [0.042, 0.13], [0.042, 0.158], [0.038, 0.182], [0.034, 0.2]];
const WINE_IN = [[0, 0.086], [0.017, 0.09], [0.031, 0.105], [0.0385, 0.13], [0.0385, 0.158], [0.0345, 0.182], [0.031, 0.198]];
const WINE_MIN = 0.087, WINE_MAX = 0.195;

/** Clear stemmed wine glass (20 cm). Origin at the foot; stem centre at y ≈ 0.045. */
function makeWineGlass() {
  const root = group({ name: 'wine_glass' });
  glassMeshes(once('geo:wine', () => lathe(WINE_OUT, 36)), 'glass_body', root);
  const uFill = { value: 0 };
  const blood = mesh(once('geo:wineIn', () => lathe(WINE_IN, 32)), fillMat(C.blood, uFill), { name: 'glass_blood', parent: root, shadow: false });
  const top = mesh(once('geo:disc', () => new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2)), once('mat:bloodTop', () => toon(C.bloodTop, { outline: false })), { parent: root, shadow: false });
  const leech = makeLeech();
  place(leech, { name: 'glass_leech', x: 0, y: 0.091, z: 0.002, rz: 0.0, s: 0.36, parent: root });
  leech.visible = false;
  let fill = 0;
  const setFill = (k) => {
    fill = clamp01(k);
    const y = lerp(WINE_MIN, WINE_MAX, fill);
    uFill.value = y;
    blood.visible = top.visible = fill > 0.002;
    top.position.y = y;
    top.scale.setScalar(Math.max(0.001, profileR(WINE_IN, y) - 0.0004));
  };
  setFill(0);
  root.getFill = () => fill;
  /** setFill(k 0..1) — 2/3 ≈ what the father gets. Animated pour level. */
  root.setFill = (k, o) => {
    const from = fill, to = clamp01(Number(k) || 0);
    return run(opt(o).instant, 1100 * Math.abs(to - from) + 1, (e) => setFill(lerp(from, to, e)), Ease.inOutSine);
  };
  /** showLeech(bool): leech lying in the bottom of the bowl with a little blood residue. */
  root.showLeech = (on = true, o) => {
    const instant = opt(o).instant;
    if (!on) { leech.visible = false; return Promise.resolve(); }
    leech.visible = true;
    if (fill < 0.06) setFill(0.06);                // a little blood residue around it
    return run(instant, 500, (e) => { leech.scale.setScalar(0.36 * Math.max(0.01, Ease.outBack(e))); wriggle(leech, e * 3, 1 - e); });
  };
  return root;
}

// ===========================================================================================
// pump
// ===========================================================================================

const PUMP = {
  pivot: new THREE.Vector3(0.19, 1.085, 0),
  rodEnd: new THREE.Vector2(-0.19, -0.004),   // handle-local position of the rod knuckle
  raise: 0.56,                                // handle angle when lifted (rad)
  nozzle: new THREE.Vector3(-0.35, 0.47, 0),  // bottom of the nozzle
  dish: new THREE.Vector3(-0.35, 0, 0.0),
  dishFloor: 0.036,
};

/** Cast-iron hand pump with spout (−x), long curved handle (+x), stone dish under the spout. */
function makePump() {
  const root = group({ name: 'pump' });
  const iron = once('mat:iron', () => toon(C.iron));
  const ironDark = once('mat:ironDark', () => toon('#686866'));
  const spoutM = once('mat:spout', () => toon(C.spout));

  // static body (baked)
  const body = group({ name: 'pump_body', parent: root });
  mesh(new THREE.CylinderGeometry(0.15, 0.165, 0.028, 36), ironDark, { y: 0.014, parent: body });
  mesh(rbox(0.13, 0.5, 0.13, 0.012), iron, { y: 0.27, parent: body });
  mesh(rbox(0.17, 0.035, 0.17, 0.01), ironDark, { y: 0.52, parent: body });
  mesh(rbox(0.19, 0.36, 0.19, 0.016), iron, { y: 0.7, parent: body });
  mesh(rbox(0.235, 0.05, 0.22, 0.012), ironDark, { y: 0.9, parent: body });
  mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 20).rotateZ(Math.PI / 2), spoutM, { x: -0.1, y: 0.705, parent: body });
  const spoutCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.1, 0.705, 0), new THREE.Vector3(-0.2, 0.71, 0), new THREE.Vector3(-0.29, 0.697, 0),
    new THREE.Vector3(-0.338, 0.65, 0), new THREE.Vector3(-0.35, 0.56, 0), new THREE.Vector3(-0.35, 0.52, 0),
  ], false, 'catmullrom', 0.3);
  mesh(new THREE.TubeGeometry(spoutCurve, 40, 0.038, 14), spoutM, { parent: body });
  mesh(new THREE.CylinderGeometry(0.048, 0.05, 0.05, 18), spoutM, { x: -0.35, y: 0.495, parent: body });
  // fulcrum link from the cap to the handle pivot
  const lk = new THREE.Vector3(0.08, 0.925, 0), lt = PUMP.pivot;
  const len = lk.distanceTo(lt);
  mesh(rbox(0.032, len + 0.03, 0.03, 0.008), ironDark, { x: (lk.x + lt.x) / 2, y: (lk.y + lt.y) / 2, rz: -Math.atan2(lt.x - lk.x, lt.y - lk.y), parent: body });
  mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 12).rotateX(Math.PI / 2), ironDark, { x: lt.x, y: lt.y, parent: body });
  bake(body);

  // plunger rod (moves with the handle)
  const rod = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 12).translate(0, -0.13, 0), iron, { name: 'pump_rod', parent: root });

  // handle (rotates about the pivot)
  const handle = group({ name: 'pump_handle', x: PUMP.pivot.x, y: PUMP.pivot.y, parent: root });
  const hc = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.2, -0.004, 0), new THREE.Vector3(-0.1, 0.012, 0), new THREE.Vector3(0, 0.004, 0),
    new THREE.Vector3(0.06, -0.07, 0), new THREE.Vector3(0.085, -0.25, 0), new THREE.Vector3(0.115, -0.5, 0),
    new THREE.Vector3(0.16, -0.69, 0), new THREE.Vector3(0.19, -0.76, 0), new THREE.Vector3(0.176, -0.79, 0),
  ]);
  mesh(new THREE.TubeGeometry(hc, 64, 0.019, 10), iron, { name: 'pump_handle_bar', parent: handle });
  mesh(new THREE.SphereGeometry(0.024, 14, 10), iron, { x: 0.18, y: -0.785, parent: handle });
  mesh(rbox(0.06, 0.05, 0.05, 0.015), iron, { x: -0.2, y: -0.004, parent: handle });
  hitBox(0.22, 0.95, 0.14, 0.08, -0.38, 0, 'pump_handle_hit', handle);

  // dish
  const dish = group({ name: 'pump_dish', x: PUMP.dish.x, z: PUMP.dish.z, parent: root });
  mesh(lathe([[0, 0], [0.165, 0], [0.176, 0.016], [0.172, 0.052], [0.158, 0.064], [0.13, 0.06], [0.118, 0.036], [0, 0.036]], 40),
    once('mat:stone', () => toon(C.stone)), { name: 'pump_dish_stone', parent: dish });
  mesh(new THREE.CircleGeometry(0.117, 36).rotateX(-Math.PI / 2), once('mat:stoneIn', () => toon(C.stoneIn, { outline: false })), { y: PUMP.dishFloor + 0.0008, parent: dish, shadow: false });
  hitBox(0.38, 0.12, 0.38, 0, 0.06, 0, 'pump_dish_hit', dish);

  // jug on the dish
  const jug = makeJug(0);
  place(jug, { name: 'pump_jug', x: PUMP.dish.x, y: PUMP.dishFloor, z: PUMP.dish.z, ry: Math.PI, parent: root });
  jug.visible = false;
  hitBox(0.24, 0.34, 0.22, 0, 0.17, 0, 'pump_jug_hit', jug);

  // blood stream (top anchored at the nozzle)
  const streamMat = once('mat:stream', () => toon('#b3141c', { outline: 0.0028 }));
  const stream = mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 1, 10, 1, true).translate(0, -0.5, 0), streamMat, { name: 'pump_stream', x: PUMP.nozzle.x, y: PUMP.nozzle.y, z: PUMP.nozzle.z, parent: root, shadow: false });
  stream.visible = false;
  const drops = makeDroplets(7, 0.008, '#b3141c');
  drops.name = 'pump_splash';
  root.add(drops);

  let angle = 0;
  let jugState = null;
  const tmp = new THREE.Vector2();
  const ORIGIN2 = new THREE.Vector2();
  const setHandle = (a) => {
    angle = a;
    handle.rotation.z = a;
    tmp.copy(PUMP.rodEnd).rotateAround(ORIGIN2, a);
    rod.position.set(PUMP.pivot.x + tmp.x - 0.003, PUMP.pivot.y + tmp.y, 0);
  };
  setHandle(0);
  const setStream = (top, bottom) => {
    const L = top - bottom;
    stream.visible = L > 0.003;
    stream.position.y = top;
    stream.scale.y = Math.max(0.001, L);
  };
  const streamBottom = () => (jug.visible ? PUMP.dishFloor + jug.userData.surfaceY() : PUMP.dishFloor + 0.002);
  const splash = (t, on) => {
    drops.visible = on;
    if (!on) return;
    for (let i = 0; i < 7; i++) {
      const ph = (t * 2.6 + i / 7) % 1;
      const a = i * 2.1 + Math.floor(t * 2.6 + i / 7) * 1.3;
      const rr = 0.012 + ph * 0.06;
      drops.userData.set(i, PUMP.dish.x + Math.cos(a) * rr, PUMP.dishFloor + 0.004 + 0.06 * 4 * ph * (1 - ph), PUMP.dish.z + Math.sin(a) * rr, 1 - ph * 0.6);
    }
    drops.userData.commit();
  };

  root.getJug = () => jugState;
  root.getHandleAngle = () => angle;

  /** setJug(null | 'empty' | 'full') — put the (empty / full) jug on the dish or remove it. */
  root.setJug = (state = null, o) => {
    const instant = opt(o).instant;
    jugState = state === 'empty' || state === 'full' ? state : null;
    if (!jugState) { jug.visible = false; return Promise.resolve(); }
    jug.userData.setFill(jugState === 'full' ? 1 : 0);
    const wasVisible = jug.visible;
    jug.visible = true;
    if (wasVisible) return Promise.resolve();
    return run(instant, 260, (e) => { jug.position.y = PUMP.dishFloor + 0.06 * (1 - e); }, Ease.outCubic);
  };

  /**
   * pumpOnce({ filling }) — handle up, then slowly down while a thin red stream runs from the
   * nozzle. With a jug on the dish (filling defaults to true then) the jug fills to the brim;
   * without, the blood splashes in the dish and is lost.
   */
  root.pumpOnce = (o) => {
    o = typeof o === 'boolean' ? { filling: o } : opt(o);
    const filling = (o.filling ?? jugState === 'empty') && !!jugState;
    if (o.instant) {
      setHandle(0); setStream(0, 0); splash(0, false);
      if (filling) return root.setJug('full', { instant: true });
      return Promise.resolve();
    }
    const startFill = jug.userData.fill;
    const top = PUMP.nozzle.y;
    const T = 2400;
    // one timeline: lift (0–420 ms) → stream + slow stroke down (500–2400 ms) → stream falls off
    return animate(T, (k) => {
      const t = k * T;
      if (t < 420) { setHandle(PUMP.raise * outCubic(t / 420)); setStream(0, 0); splash(0, false); return; }
      const q = clamp01((t - 500) / (T - 500));
      setHandle(PUMP.raise * (1 - Ease.inOutSine(seg(q, 0.0, 0.97))));
      if (filling) jug.userData.setFill(lerp(startFill, 1, Ease.inOutSine(seg(q, 0.08, 0.9))));
      const reach = seg(q, 0, 0.08);             // stream front falling from the nozzle
      const bottom = streamBottom();
      const tail = seg(q, 0.9, 1.0);             // stream end detaches and falls
      setStream(lerp(top, bottom, Ease.inOutSine(tail)), Math.max(bottom, lerp(top, bottom, reach)));
      splash(q * 1.9, !jug.visible && reach >= 1 && tail < 1);
      if (k >= 1) { setStream(0, 0); splash(0, false); if (filling) jugState = 'full'; }
    }, Ease.linear);
  };
  return root;
}

// ===========================================================================================
// bucket
// ===========================================================================================

const BUCKET = { h: 0.42, rTop: 0.2, rBot: 0.168, wall: 0.016, floor: 0.026 };
const bucketR = (y) => lerp(BUCKET.rBot, BUCKET.rTop, y / BUCKET.h);

/** Light-brown wooden bucket (42 cm) with two iron hoops. setFill(0..1). */
function makeBucket() {
  const root = group({ name: 'bucket' });
  const bodyG = group({ name: 'bucket_body', parent: root });
  const staves = toonTex('bucketStaves', 512, 128, (g, w, h) => {
    const r = rng(77);
    const n = 15, sw = w / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = shade(C.bucket, (r() - 0.5) * 0.07);
      g.fillRect(i * sw, 0, sw, h);
      g.fillStyle = 'rgba(255,240,210,0.18)'; g.fillRect(i * sw + 3, 0, sw * 0.25, h);
      g.fillStyle = 'rgba(60,40,20,0.18)'; g.fillRect(i * sw + sw * 0.7, 0, sw * 0.3, h);
      g.strokeStyle = 'rgba(70,45,22,0.45)'; g.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        let x = i * sw + 5 + r() * (sw - 10); g.beginPath(); g.moveTo(x, 0);
        for (let y = 0; y <= h; y += 16) { x += (r() - 0.5) * 2; g.lineTo(x, y); }
        g.stroke();
      }
      g.fillStyle = 'rgba(25,15,8,0.95)'; g.fillRect(i * sw, 0, 2.5, h);
    }
  }, { wrap: true });
  staves.map.wrapS = THREE.RepeatWrapping;
  const { h, rTop, rBot, wall, floor } = BUCKET;
  mesh(new THREE.CylinderGeometry(rTop, rBot, h, 40, 1, true).translate(0, h / 2, 0), staves, { name: 'bucket_staves', parent: bodyG });
  const inside = once('mat:bucketIn', () => toon('#7d6244', { side: THREE.BackSide, outline: false }));
  mesh(new THREE.CylinderGeometry(rTop - wall, rBot - wall, h - floor, 40, 1, true).translate(0, floor + (h - floor) / 2, 0), inside, { parent: bodyG, shadow: false });
  mesh(new THREE.RingGeometry(rTop - wall, rTop, 40).rotateX(-Math.PI / 2), once('mat:bucketRim', () => toon('#b38d5d', { outline: false })), { y: h, parent: bodyG, shadow: false });
  mesh(new THREE.CircleGeometry(rBot - wall, 32).rotateX(-Math.PI / 2), once('mat:bucketFloor', () => toon('#5e4a35', { outline: false })), { y: floor, parent: bodyG, shadow: false });
  const hoopM = once('mat:hoop', () => toon(C.hoop));
  for (const [y, hh] of [[0.235, 0.042], [0.07, 0.026]]) {
    mesh(new THREE.CylinderGeometry(bucketR(y + hh / 2) + 0.006, bucketR(y - hh / 2) + 0.006, hh, 40, 1, true), hoopM, { y, parent: bodyG });
  }
  hitBox(rTop * 2.1, h * 1.05, rTop * 2.1, 0, h / 2, 0, 'bucket_hit', bodyG);
  const blood = mesh(once('geo:disc', () => new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2)), once('mat:bucketBlood', () => toon('#7d1416', { outline: false })), { name: 'bucket_blood', parent: root, shadow: false });
  let fill = 0;
  const setFill = (k) => {
    fill = clamp01(k);
    const y = lerp(floor + 0.004, h * 0.86, fill);
    blood.visible = fill > 0.002;
    blood.position.y = y;
    blood.scale.setScalar(bucketR(y) - wall - 0.001);
  };
  setFill(0);
  root.getFill = () => fill;
  /** setFill(k 0..1) — blood level in the bucket (animated pour). */
  root.setFill = (k, o) => {
    const from = fill, to = clamp01(Number(k) || 0);
    return run(opt(o).instant, 1300 * Math.abs(to - from) + 1, (e) => setFill(lerp(from, to, e)), Ease.inOutSine);
  };
  return root;
}

// ===========================================================================================
// owl_totem — the leech "juicer"
// ===========================================================================================

const OWL = {
  headY: 0.93, headZ: 0.035, headDepth: 0.33, bevel: 0.012,
  mouthTop: 0.28, mouthBot: 0.06,
  postW: 0.46, postH: 0.92, postD: 0.32, postY0: 0.27,
  tubeZ: 0.172, tubeR: 0.046, tubeBot: 0.515, tubeTop: 0.96, fillBot: 0.528, fillTop: 0.935,
  wingX: 0.17, wingDownY: 0.69, wingUpY: 1.235,
};
const OWL_FRONT = OWL.headDepth / 2 + OWL.bevel;  // head-local z of the face

function owlMouthPath(PathClass = THREE.Path, inset = 0) {
  const p = new PathClass();
  const w = 0.125 - inset, top = OWL.mouthTop - inset * 0.3, bot = OWL.mouthBot + inset;
  p.moveTo(-w, top);
  p.lineTo(w, top);
  p.bezierCurveTo(w + 0.008, 0.13, 0.1 - inset, 0.066 + inset * 0.5, 0, bot);
  p.bezierCurveTo(-0.1 + inset, 0.066 + inset * 0.5, -w - 0.008, 0.13, -w, top);
  return p;
}

function owlHeadShape(withHole = true) {
  const right = [[0.07, 0.062], [0.16, 0.1], [0.236, 0.132], [0.265, 0.2], [0.274, 0.32], [0.276, 0.46], [0.27, 0.57], [0.258, 0.625]];
  const top = [[0.235, 0.68], [0.15, 0.664], [0.06, 0.658]];
  const tuft = [0.29, 0.722];
  const V = (p, sx = 1) => new THREE.Vector2(p[0] * sx, p[1]);
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.splineThru(right.map((p) => V(p)));
  s.lineTo(tuft[0], tuft[1]);
  s.splineThru([...top.map((p) => V(p)), new THREE.Vector2(0, 0.668), ...top.slice().reverse().map((p) => V(p, -1))]);
  s.lineTo(-tuft[0], tuft[1]);
  s.splineThru([...right.slice().reverse().map((p) => V(p, -1)), new THREE.Vector2(0, 0)]);
  if (withHole) s.holes.push(owlMouthPath());
  return s;
}

function pointInPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function owlHeadGeometry() {
  return once('geo:owlHead', () => {
    const shape = owlHeadShape();
    const pts = shape.getPoints(24);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const { headDepth: depth, bevel } = OWL;
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 24,
      UVGenerator: boxUV(minX, minY, maxX - minX, maxY - minY),
    });
    geo.translate(0, 0, -depth / 2);
    // hole test: mouth polygon grown a little (bevel faces of the hole count as mouth walls)
    const hp = owlMouthPath().getPoints(24).map((p) => new THREE.Vector2(p.x * 1.1, 0.17 + (p.y - 0.17) * 1.12));
    const out = regroup(geo, (cen, n, g) => {
      if (g === 0 && n.z > 0.5 && cen.z > depth / 2 + bevel - 1e-4) return 0;  // painted face
      if (pointInPoly(hp, cen.x, cen.y) && Math.abs(n.z) < 0.9) return 2;      // mouth walls
      return 1;
    });
    out.userData.bbox = { minX, minY, maxX, maxY };
    return out;
  });
}

function pathOn(g, pts, X, Y) {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y))));
  g.closePath();
}

function paintOwlFace(g, W, H, bb) {
  const S = W / (bb.maxX - bb.minX);
  const X = (x) => (x - bb.minX) * S;
  const Y = (y) => (bb.maxY - y) * (H / (bb.maxY - bb.minY));
  const r = rng(91);
  g.fillStyle = '#ae9366'; g.fillRect(0, 0, W, H);
  grain(g, W, H, r, { n: 26, col: 'rgba(60,40,18,0.18)', wobble: 3 });
  // carved outer border (depth)
  g.save();
  g.strokeStyle = 'rgba(70,48,20,0.35)'; g.lineWidth = 16;
  pathOn(g, owlHeadShape(false).getPoints(30), X, Y); g.stroke();
  g.restore();
  for (const sx of [-1, 1]) {
    // facial disc (heart-shaped) outline
    g.beginPath();
    g.moveTo(X(sx * 0.03), Y(0.64));
    g.bezierCurveTo(X(sx * 0.25), Y(0.66), X(sx * 0.262), Y(0.42), X(sx * 0.235), Y(0.3));
    g.bezierCurveTo(X(sx * 0.215), Y(0.2), X(sx * 0.17), Y(0.13), X(sx * 0.09), Y(0.07));
    inkStroke(g, 4, 'rgba(30,20,10,0.8)');
    // cheek feathers: curved strokes between the disc edge and the mouth
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const x0 = sx * lerp(0.14, 0.235, t), y0 = lerp(0.39, 0.33, t);
      g.beginPath();
      g.moveTo(X(x0), Y(y0));
      g.quadraticCurveTo(X(x0 + sx * 0.01), Y(y0 - 0.12), X(x0 - sx * lerp(0.0, 0.04, t)), Y(lerp(0.2, 0.17, t) - 0.03 * t));
      inkStroke(g, 2.5, 'rgba(40,26,12,0.65)');
    }
    // eye rings (carved, concentric)
    const cx = X(sx * 0.105), cy = Y(0.49);
    const rings = [0.11, 0.09, 0.071, 0.053];
    const fills = ['#a3885c', '#b69c6e', '#a0855a', '#bba275'];
    rings.forEach((rr, i) => {
      g.beginPath(); g.arc(cx, cy, rr * S, 0, Math.PI * 2);
      g.fillStyle = fills[i]; g.fill();
      g.save(); g.clip();
      g.fillStyle = 'rgba(60,40,15,0.22)';
      g.beginPath(); g.arc(cx, cy - rr * S * 0.25, rr * S, Math.PI, 2 * Math.PI); g.fill();
      g.restore();
      g.beginPath(); g.arc(cx, cy, rr * S, 0, Math.PI * 2);
      inkStroke(g, i === 0 ? 4.5 : 3.2);
    });
    // brow (angry V) running into the ear tuft
    const brow = [[0.29, 0.722], [0.2, 0.668], [0.075, 0.625], [0.012, 0.56], [0.018, 0.527], [0.06, 0.535], [0.14, 0.574], [0.215, 0.6], [0.262, 0.622]];
    poly(g, brow.map(([x, y]) => [X(sx * x), Y(y)]));
    g.fillStyle = '#9d8257'; g.fill();
    inkStroke(g, 4);
    g.save();
    poly(g, brow.map(([x, y]) => [X(sx * x), Y(y)])); g.clip();
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      g.beginPath();
      g.moveTo(X(sx * lerp(0.03, 0.27, t)), Y(lerp(0.555, 0.68, t)));
      g.lineTo(X(sx * lerp(0.07, 0.25, t) + sx * 0.02), Y(lerp(0.585, 0.71, t)));
      inkStroke(g, 2, 'rgba(40,26,12,0.6)');
    }
    g.restore();
  }
  // centre ridge between the brows, down to the beak
  g.beginPath(); g.moveTo(X(0), Y(0.666)); g.lineTo(X(0), Y(0.43)); inkStroke(g, 3.5);
  // shadow under the beak
  g.fillStyle = 'rgba(50,32,12,0.35)';
  poly(g, [[X(-0.05), Y(0.42)], [X(0.05), Y(0.42)], [X(0.0), Y(0.29)]]); g.fill();
  // mouth rim ink
  pathOn(g, owlMouthPath().getPoints(30), X, Y); inkStroke(g, 6);
  // chin "V" below the mouth
  g.beginPath(); g.moveTo(X(-0.07), Y(0.07)); g.lineTo(X(0), Y(0.012)); g.lineTo(X(0.07), Y(0.07)); inkStroke(g, 3, 'rgba(30,20,10,0.7)');
}

function paintOwlVisor(g, W, H) {
  // closed beak / "feather beard": wood with dense vertical carved stripes
  const r = rng(12);
  g.fillStyle = '#a88d60'; g.fillRect(0, 0, W, H);
  for (let i = 0; i <= 22; i++) {
    const x = (i / 22) * W;
    const xb = W / 2 + (x - W / 2) * 0.55;
    g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + (r() - 0.5) * 6, H * 0.5, xb, H);
    inkStroke(g, 2.2 + r(), 'rgba(35,22,10,0.75)');
  }
  g.fillStyle = 'rgba(50,30,10,0.25)'; g.fillRect(0, 0, W, H * 0.12);
}

const OWL_WING_LOBES = [
  { xr: 0.545, xl: 0.43, yb: -0.145 },
  { xr: 0.43, xl: 0.31, yb: -0.205 },
  { xr: 0.31, xl: 0.18, yb: -0.262 },
  { xr: 0.18, xl: 0.0, yb: -0.318 },
];

function owlWingShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.585, 0);
  s.quadraticCurveTo(0.628, 0, 0.628, -0.0375);
  s.quadraticCurveTo(0.628, -0.075, 0.585, -0.075);
  s.lineTo(0.545, -0.075);
  for (const { xr, xl, yb } of OWL_WING_LOBES) {
    const xm = (xr + xl) / 2;
    s.bezierCurveTo(xr + 0.012, yb + 0.03, xr - 0.01, yb, xm, yb);
    s.bezierCurveTo(xl + 0.035, yb, xl + 0.005, yb + 0.02, xl, yb + 0.05);
  }
  s.lineTo(0, -0.3);
  s.lineTo(0, 0);
  return s;
}

function paintOwlWing(g, W, H, bb) {
  const X = (x) => (x - bb.minX) * (W / (bb.maxX - bb.minX));
  const Y = (y) => (bb.maxY - y) * (H / (bb.maxY - bb.minY));
  const r = rng(33);
  g.fillStyle = '#ab9063'; g.fillRect(0, 0, W, H);
  // plank (top band) with horizontal grain
  g.fillStyle = '#b89d6d'; g.fillRect(0, 0, W, Y(-0.075));
  g.save(); g.beginPath(); g.rect(0, 0, W, Y(-0.075)); g.clip();
  grain(g, W, H, r, { n: 10, col: 'rgba(60,40,18,0.3)', vertical: false, wobble: 2 });
  g.restore();
  g.beginPath(); g.moveTo(X(0), Y(-0.075)); g.lineTo(X(0.545), Y(-0.075)); inkStroke(g, 4);
  // feather tiers
  for (const { xr, xl, yb } of OWL_WING_LOBES) {
    g.beginPath();
    g.moveTo(X(xr), Y(-0.075));
    g.bezierCurveTo(X(xr + 0.01), Y(yb + 0.02), X(xr - 0.02), Y(yb - 0.005), X((xr + xl) / 2), Y(yb));
    inkStroke(g, 3, 'rgba(30,20,10,0.75)');
    for (let k = 0; k < 3; k++) {
      const x = lerp(xl, xr, 0.25 + k * 0.22);
      g.beginPath(); g.moveTo(X(x), Y(-0.09)); g.lineTo(X(x - 0.01), Y(yb + 0.025)); inkStroke(g, 1.6, 'rgba(40,26,12,0.4)');
    }
  }
  // carved ↑ arrow
  const ax = 0.12, ay0 = -0.29, ay1 = -0.12;
  g.beginPath(); g.moveTo(X(ax), Y(ay0)); g.lineTo(X(ax), Y(ay1)); inkStroke(g, 7, '#1d150d');
  g.beginPath(); g.moveTo(X(ax - 0.028), Y(ay1 - 0.035)); g.lineTo(X(ax), Y(ay1 + 0.002)); g.lineTo(X(ax + 0.028), Y(ay1 - 0.035)); inkStroke(g, 7, '#1d150d');
}

function paintOwlPost(g, W, H) {
  // post-local: x ∈ [-0.23, 0.23], world y ∈ [0.27, 1.19] (row 0 = top)
  const X = (x) => (x + OWL.postW / 2) * (W / OWL.postW);
  const Y = (y) => (OWL.postY0 + OWL.postH - y) * (H / OWL.postH);
  const r = rng(57);
  g.fillStyle = '#a98f62'; g.fillRect(0, 0, W, H);
  grain(g, W, H, r, { n: 34, col: 'rgba(60,40,18,0.22)', wobble: 3 });
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, 'rgba(60,40,15,0.18)'); grd.addColorStop(0.18, 'rgba(0,0,0,0)');
  grd.addColorStop(0.82, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(60,40,15,0.25)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // folded-wing / breast outlines
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.moveTo(X(sx * 0.2), Y(1.12));
    g.bezierCurveTo(X(sx * 0.215), Y(0.96), X(sx * 0.16), Y(0.84), X(sx * 0.175), Y(0.7));
    inkStroke(g, 3.5, 'rgba(30,20,10,0.8)');
    g.beginPath();
    g.moveTo(X(sx * 0.12), Y(0.96));
    g.bezierCurveTo(X(sx * 0.14), Y(0.86), X(sx * 0.1), Y(0.8), X(sx * 0.11), Y(0.71));
    inkStroke(g, 2.5, 'rgba(30,20,10,0.55)');
  }
  // groove the tube sits in
  g.fillStyle = '#b3a473';
  g.beginPath(); g.roundRect(X(-0.064), Y(0.975), X(0.064) - X(-0.064), Y(0.5) - Y(0.975), 14); g.fill();
  inkStroke(g, 4);
  g.fillStyle = 'rgba(40,28,12,0.3)'; g.fillRect(0, Y(0.33), W, H - Y(0.33));
}

function paintStump(g, W, H) {
  const r = rng(61);
  g.fillStyle = '#a3895d'; g.fillRect(0, 0, W, H);
  grain(g, W, H, r, { n: 40, col: 'rgba(50,32,14,0.45)', wobble: 3, lw: [1.5, 3] });
  g.fillStyle = 'rgba(40,26,10,0.35)'; g.fillRect(0, 0, W, H * 0.12);
}

/** 1.6 m carved owl totem (see design doc §5.13). */
function makeOwlTotem() {
  const root = group({ name: 'owl_totem' });
  const wood = once('mat:owlWood', () => toon('#ab9063'));
  const woodLight = once('mat:owlWoodLight', () => toon('#b89e70'));

  // ---- base stump + post (static)
  const body = group({ name: 'owl_body', parent: root });
  const stumpM = toonTex('owlStump', 512, 128, paintStump, { wrap: true });
  mesh(new THREE.CylinderGeometry(0.235, 0.275, OWL.postY0, 36), [stumpM, wood, wood], { name: 'owl_base', y: OWL.postY0 / 2, parent: body });
  const postFront = toonTex('owlPost', 460, 920, paintOwlPost);
  mesh(frontBox(OWL.postW, OWL.postH, OWL.postD, 0.02), [postFront, wood], { name: 'owl_post', y: OWL.postY0 + OWL.postH / 2, parent: body });
  const claws = group({ parent: body });
  const clawGeo = new THREE.CapsuleGeometry(0.022, 0.1, 6, 12).rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      mesh(clawGeo, woodLight, { x: sx * 0.118, y: 0.548 + i * 0.062, z: OWL.postD / 2 + 0.004, rz: sx * 0.08, parent: claws });
    }
  }
  bake(claws);

  // ---- tube with blood
  const tubeG = group({ name: 'owl_tube', parent: root });
  const tubeMat = once('mat:owlTube', () => toon('#ddd6aa', { transparent: true, opacity: 0.34 }));
  const tubeLen = OWL.tubeTop - OWL.tubeBot;
  const tube = mesh(new THREE.CylinderGeometry(OWL.tubeR, OWL.tubeR, tubeLen, 20), tubeMat, { name: 'owl_tube_glass', y: (OWL.tubeTop + OWL.tubeBot) / 2, z: OWL.tubeZ, parent: tubeG, shadow: false });
  tube.renderOrder = 2;
  mesh(new THREE.CylinderGeometry(OWL.tubeR + 0.004, OWL.tubeR + 0.004, 0.018, 20), woodLight, { y: OWL.tubeBot + 0.004, z: OWL.tubeZ, parent: tubeG });
  const bloodM = once('mat:owlBlood', () => toon('#930d07', { outline: false, emissive: '#300000' }));
  const column = mesh(new THREE.CylinderGeometry(OWL.tubeR - 0.008, OWL.tubeR - 0.008, 1, 18).translate(0, 0.5, 0), bloodM, { name: 'owl_blood', y: OWL.fillBot, z: OWL.tubeZ, parent: tubeG, shadow: false });
  const trickle = mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 1, 8).translate(0, -0.5, 0), once('mat:owlTrickle', () => toon('#b3151c', { outline: false })), { name: 'owl_trickle', y: OWL.fillTop, z: OWL.tubeZ + 0.004, parent: tubeG, shadow: false });
  trickle.visible = false;
  const tickM = once('mat:owlTick', () => toon('#6d6638', { outline: false }));
  for (let i = 1; i <= 3; i++) {
    mesh(new THREE.BoxGeometry(0.034, 0.005, 0.004), tickM, { y: OWL.fillBot + (OWL.fillTop - OWL.fillBot) * (i / 4), z: OWL.tubeZ + OWL.tubeR + 0.001, parent: tubeG, shadow: false });
  }
  hitBox(0.13, tubeLen, 0.08, 0, (OWL.tubeTop + OWL.tubeBot) / 2, OWL.tubeZ, 'owl_tube_hit', tubeG);

  // ---- head
  const head = group({ name: 'owl_head', y: OWL.headY, z: OWL.headZ, parent: root });
  const hg = owlHeadGeometry();
  const bb = hg.userData.bbox;
  const faceM = toonTex('owlFace', 576, 728, (g, w, h) => paintOwlFace(g, w, h, bb));
  const mouthM = once('mat:owlMouth', () => toon('#63605b'));
  mesh(hg, [faceM, wood, mouthM], { name: 'owl_head_wood', parent: head });
  // eyes: carved eyeballs with heavy angry lids
  const eyeM = once('mat:owlEye', () => toon('#e2d6b4'));
  const pupilM = once('mat:owlPupil', () => toon('#141210', { outline: false }));
  const glintM = once('mat:owlGlint', () => toon('#ffffff', { outline: false, emissive: '#ffffff' }));
  const lidM = once('mat:owlLid', () => toon('#a1865a'));
  for (const sx of [-1, 1]) {
    const eye = group({ x: sx * 0.105, y: 0.49, z: OWL_FRONT - 0.004, parent: head });
    mesh(new THREE.SphereGeometry(0.034, 24, 16), eyeM, { s: [1, 1, 0.5], parent: eye });
    mesh(new THREE.SphereGeometry(0.0165, 16, 12), pupilM, { x: -sx * 0.005, y: -0.004, z: 0.012, s: [1, 1, 0.5], parent: eye });
    mesh(new THREE.SphereGeometry(0.0048, 8, 6), glintM, { x: -sx * 0.001, y: 0.003, z: 0.0185, parent: eye });
    mesh(new THREE.SphereGeometry(0.0368, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.46), lidM, { rx: 0.55, rz: -sx * 0.42, s: [1, 1, 0.62], parent: eye });
  }
  // beak (four-sided cone, ridge to the front, tip forward-down)
  mesh(new THREE.ConeGeometry(0.058, 0.165, 4, 1).rotateX(Math.PI).rotateY(Math.PI / 4).scale(1, 1, 0.75),
    once('mat:owlBeak', () => toon('#b49a6a')), { name: 'owl_beak', y: 0.352, z: OWL_FRONT + 0.004, rx: -0.32, parent: head });
  // mouth: grey cavity plug, teeth, hinged visor (closed beak / feather beard)
  const mouth = group({ name: 'owl_mouth', parent: head });
  const plugFront = 0.136;   // head-local z of the cavity's back wall: must stay in front of the post (world z 0.16)
  const plugShape = new THREE.Shape(owlMouthPath().getPoints(24));
  mesh(new THREE.ExtrudeGeometry(plugShape, { depth: plugFront + OWL.headDepth / 2, bevelEnabled: false }).translate(0, 0, -OWL.headDepth / 2),
    once('mat:owlCavity', () => toon('#5d5a55', { outline: false })), { name: 'owl_mouth_cavity', parent: mouth, shadow: false });
  const teeth = new THREE.Shape();
  const n = 8, tw = 0.25 / n;
  teeth.moveTo(-0.128, 0.014);
  teeth.lineTo(0.128, 0.014);
  for (let i = n - 1; i >= 0; i--) {
    const xc = -0.125 + tw * (i + 0.5);
    const len = 0.03 + 0.03 * Math.sin(((i + 0.5) / n) * Math.PI);
    teeth.lineTo(-0.125 + tw * (i + 1), 0);
    teeth.lineTo(xc, -len);
    teeth.lineTo(-0.125 + tw * i, 0);
  }
  teeth.lineTo(-0.128, 0.014);
  mesh(new THREE.ExtrudeGeometry(teeth, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 }),
    once('mat:owlTeeth', () => toon('#c2aa7c')), { name: 'owl_teeth', y: OWL.mouthTop, z: plugFront + 0.004, parent: mouth });
  // visor hinged at the top of the mouth: rotation.x = 0 closed, PI/2 open (folded up inside the head)
  const visorHinge = group({ name: 'owl_beak_lower', y: OWL.mouthTop + 0.004, z: OWL_FRONT - 0.006, parent: mouth });
  const visorShape = new THREE.Shape(owlMouthPath(THREE.Path, 0.004).getPoints(24));
  const vg = extrudeFront(visorShape, 0.022, 0.002, 24);
  vg.translate(0, -(OWL.mouthTop + 0.004), -0.013);
  const visorM = toonTex('owlVisor', 260, 240, paintOwlVisor);
  mesh(vg, [visorM, wood], { name: 'owl_visor', parent: visorHinge });
  hitBox(0.28, 0.26, 0.1, 0, 0.17, OWL_FRONT, 'owl_mouth_hit', mouth);
  // leech lying on the lower jaw
  const leech = makeLeech();
  place(leech, { name: 'owl_leech', y: 0.074, z: OWL_FRONT - 0.033, s: 1.15, parent: mouth });
  leech.visible = false;
  // key held in the beak
  const keyG = group({ name: 'owl_key', y: 0.115, z: OWL_FRONT - 0.026, parent: head });
  place(makeKey(), { rz: 0.04, s: 1.15, parent: keyG });
  hitBox(0.17, 0.08, 0.06, 0, 0.0, 0.01, 'owl_key_hit', keyG);
  keyG.visible = false;
  const drops = makeDroplets(12, 0.009, C.blood);
  drops.name = 'owl_spurt';
  head.add(drops);

  // ---- wings
  const wingGeo = once('geo:owlWing', () => extrudeFront(owlWingShape(), 0.045, 0.006, 16));
  const wbb = wingGeo.userData.bbox;
  const wingM = toonTex('owlWing', 640, 340, (g, w, h) => paintOwlWing(g, w, h, wbb));
  const wings = {};
  for (const [side, sx] of [['l', -1], ['r', 1]]) {
    const wg = group({ name: 'owl_wing_' + side, x: sx * OWL.wingX, y: OWL.wingDownY, z: 0.02, parent: root });
    const inner = group({ parent: wg });
    inner.scale.x = sx;
    mesh(wingGeo, [wingM, wood], { name: 'owl_wing_' + side + '_wood', parent: inner });
    hitBox(0.66, 0.34, 0.1, sx * 0.33, -0.15, 0.02, 'owl_wing_' + side + '_hit', wg);
    wings[side] = wg;
  }

  // ---- state
  let level = 0, hasLeech = false;
  const setLevelNow = (lv) => {
    const h = (OWL.fillTop - OWL.fillBot) * clamp01(lv / 4);
    column.visible = h > 0.001;
    column.scale.y = Math.max(0.0001, h);
  };
  const setWings = (u, wob = 0) => {
    for (const [side, sx] of [['l', -1], ['r', 1]]) {
      wings[side].position.y = lerp(OWL.wingDownY, OWL.wingUpY, u);
      wings[side].rotation.z = sx * wob;
    }
  };
  const setVisor = (closed) => { visorHinge.rotation.x = (Math.PI / 2) * (1 - closed); };
  const setTrickle = (top, bottom) => {
    trickle.visible = top - bottom > 0.004;
    trickle.position.y = top;
    trickle.scale.y = Math.max(0.0001, top - bottom);
  };
  const spurt = (q) => {   // q 0..1 → droplets burst out of the mouth corners and fall
    drops.visible = q > 0 && q < 1;
    if (!drops.visible) return;
    for (let i = 0; i < 12; i++) {
      const sx = i % 2 ? 1 : -1;
      const a = 0.4 + (i / 12) * 0.9;
      const v = 0.32 + (i % 3) * 0.08;
      const x = sx * (0.1 + Math.cos(a) * v * q);
      const y = 0.16 + Math.sin(a) * v * q * 0.6 - 1.6 * q * q;
      drops.userData.set(i, x, y, OWL_FRONT + 0.02 + q * 0.05, 1 - q * 0.7);
    }
    drops.userData.commit();
  };
  setLevelNow(0); setWings(0); setVisor(0);

  // idle wriggle of a leech waiting in the mouth (cosmetic, render-driven)
  leech.children[0].onBeforeRender = () => { if (hasLeech) wriggle(leech, performance.now() / 1000 * 0.5, 0.35); };

  root.getLevel = () => level;
  root.hasLeech = () => hasLeech;

  /** setLeech(bool) — a leech lying on the lower jaw (drops in when shown). */
  root.setLeech = (on = true, o) => {
    hasLeech = !!on;
    if (!hasLeech) { leech.visible = false; return Promise.resolve(); }
    leech.visible = true;
    return run(opt(o).instant, 300, (e) => { leech.position.y = 0.074 + 0.07 * (1 - e); leech.scale.setScalar(1.15 * (0.6 + 0.4 * e)); }, Ease.outCubic);
  };

  /** setLevel(n 0..4) — blood level in the chest tube (animated rise). */
  root.setLevel = (n = 0, o) => {
    const from = level, to = Math.max(0, Math.min(4, Math.round(Number(n) || 0)));
    level = to;
    return run(opt(o).instant, 500 * Math.abs(to - from) + 1, (e) => setLevelNow(lerp(from, to, e)), Ease.inOutSine);
  };

  /** showKey(bool) — golden key appears in the open beak. */
  root.showKey = (on = true, o) => {
    if (!on) { keyG.visible = false; return Promise.resolve(); }
    keyG.visible = true;
    return run(opt(o).instant, 420, (e) => { keyG.scale.setScalar(Math.max(0.01, Ease.outBack(e))); keyG.position.y = 0.115 - 0.03 * (1 - e); }, Ease.linear);
  };

  /**
   * flap({ crush }) — both wings slide up beside the head and drop back. With crush: the beak slams
   * shut on the leech (blood spurts), a thin red trickle runs down the glass tube, the level rises
   * by one, then the wings come down and the beak re-opens (empty). ≈2.7 s (crush) / 1.3 s.
   */
  root.flap = (o) => {
    o = typeof o === 'boolean' ? { crush: o } : opt(o);
    const crush = !!o.crush;
    const from = level, to = crush ? Math.min(4, level + 1) : level;
    if (crush) level = to;
    if (o.instant) {
      setWings(0); setVisor(0); setTrickle(0, 0); spurt(0); head.position.y = OWL.headY; head.rotation.z = 0;
      if (crush) { hasLeech = false; leech.visible = false; setLevelNow(to); }
      return Promise.resolve();
    }
    const T = crush ? 2700 : 1300;
    const upEnd = 430, downStart = T - 640, downEnd = T - 140;
    const fillH = (lv) => OWL.fillBot + (OWL.fillTop - OWL.fillBot) * (lv / 4);
    return animate(T, (k) => {
      const t = k * T;
      // wings: quick lift with overshoot + flutter, hold, settle down
      let u, wob = 0;
      if (t < upEnd) { const q = t / upEnd; u = Ease.outBack(q); wob = Math.sin(q * Math.PI) * 0.16; }
      else if (t < downStart) { u = 1; wob = Math.sin((t - upEnd) / 90) * 0.012 * Math.exp(-(t - upEnd) / 260); }
      else { const q = clamp01((t - downStart) / (downEnd - downStart)); u = 1 - Ease.inOutSine(q); wob = -Math.sin(q * Math.PI) * 0.07; }
      setWings(u, wob);
      if (!crush) return;
      // beak slams shut (330–470 ms), stays closed, re-opens near the end
      const slam = seg(t, 330, 470), reopen = seg(t, T - 380, T - 120);
      setVisor(inCubic(slam) * (1 - Ease.inOutSine(reopen)));
      if (t >= 455 && leech.visible) { leech.visible = false; hasLeech = false; }
      if (t < 455 && leech.visible) leech.scale.set(1.15 * (1 + 0.25 * seg(t, 380, 455)), 1.15 * (1 - 0.6 * seg(t, 380, 455)), 1.15);
      // impact: head jolt + spurt
      const j = seg(t, 470, 640);
      head.position.y = OWL.headY - 0.014 * Math.sin(j * Math.PI) * (1 - j * 0.3);
      head.rotation.z = Math.sin(j * Math.PI * 3) * 0.012 * (1 - j);
      spurt(seg(t, 470, 980));
      // trickle runs down the tube to the current surface, the level rises, the trickle tail falls
      const surf = lerp(fillH(from), fillH(to), Ease.inOutSine(seg(t, 1000, 1700)));
      const front = lerp(OWL.fillTop, surf, inCubic(seg(t, 560, 1000)));
      const tail = lerp(OWL.fillTop, surf, inCubic(seg(t, 1550, 1900)));
      if (t < 560 || t > 1900) setTrickle(0, 0); else setTrickle(tail, Math.max(surf, front));
      setLevelNow(lerp(from, to, Ease.inOutSine(seg(t, 1000, 1700))));
    }, Ease.linear);
  };
  return root;
}

// ===========================================================================================
// dining_table
// ===========================================================================================

/** Round table (Ø 1.1 m, 0.76 m) under a white floor-length tablecloth with vertical folds. */
function makeDiningTable() {
  const root = group({ name: 'dining_table' });
  const R = 0.55, H = 0.76;
  const clothM = once('mat:cloth', () => toon(C.cloth, { emissive: '#2c2c2a' }));
  const body = group({ name: 'table_cloth', parent: root });
  mesh(new THREE.CylinderGeometry(R, R, 0.024, 72), clothM, { y: H - 0.012, parent: body });
  mesh(new THREE.TorusGeometry(R, 0.013, 8, 72).rotateX(Math.PI / 2), clothM, { y: H - 0.022, parent: body });
  const dropH = H - 0.055;
  const drape = new THREE.CylinderGeometry(R + 0.008, R + 0.045, dropH, 144, 10, true);
  const p = drape.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const t = clamp01((dropH / 2 - y) / dropH);            // 0 top → 1 hem
    const r = Math.hypot(x, z);
    const fold = (Math.sin(a * 21) * 0.017 + Math.sin(a * 8 + 1.3) * 0.006) * Math.pow(t, 1.2);
    const hem = t > 0.98 ? Math.sin(a * 21 + 0.6) * 0.012 : 0;
    p.setXYZ(i, (x / r) * (r + fold), y + hem, (z / r) * (r + fold));
  }
  drape.computeVertexNormals();
  const drapeM = toonTex('drape', 1024, 256, (g, w, h) => {
    g.fillStyle = C.cloth; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 21; k++) {            // fold valleys at u = (2k+1)/42
      const x = ((2 * k + 1) / 42) * w;
      const grd = g.createLinearGradient(0, h, 0, h * 0.15);
      grd.addColorStop(0, 'rgba(25,25,25,0.85)'); grd.addColorStop(1, 'rgba(25,25,25,0)');
      g.strokeStyle = grd; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(x, h); g.lineTo(x + 2, h * 0.15); g.stroke();
    }
  }, { emissive: '#2c2c2a' });
  mesh(drape, drapeM, { y: H - 0.03 - dropH / 2, parent: body });
  bake(body);
  const feetM = once('mat:tableFeet', () => toon('#3a2f28'));
  const feet = group({ parent: root });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.06, 10), feetM, { x: Math.cos(a) * 0.36, y: 0.03, z: Math.sin(a) * 0.36, parent: feet });
  }
  bake(feet);
  hitBox(R * 2.1, H, R * 2.1, 0, H / 2, 0, 'table_hit', root);
  return root;
}

// ===========================================================================================
// plate_prawn
// ===========================================================================================

/** Prawn halves (lateral profile in XY, head towards −x, visible side +z, neck at x = 0). */
function buildPrawn() {
  const shell = once('mat:prawn', () => toon(C.prawn));
  const shellLight = once('mat:prawnLight', () => toon('#ea8d73'));
  const legM = once('mat:prawnLeg', () => toon('#c85b42', { outline: 0.0025 }));
  const feelerM = once('mat:feeler', () => toon('#111111', { outline: false }));
  const eyeM = once('mat:prawnEye', () => toon('#0e0e0e', { outline: false }));
  const glintM = once('mat:glint', () => toon('#ffffff', { outline: false, emissive: '#ffffff' }));
  const head = group({ name: 'prawn_head' });
  const body = group({ name: 'prawn_body' });
  // --- head / carapace
  const hs = group({ parent: head });
  mesh(new THREE.SphereGeometry(1, 28, 18), shell, { x: -0.056, y: 0.002, s: [0.062, 0.02, 0.017], rz: 0.05, parent: hs });
  mesh(new THREE.SphereGeometry(1, 20, 12), shellLight, { x: -0.042, y: 0.011, z: 0.004, s: [0.03, 0.008, 0.012], parent: hs });
  mesh(new THREE.ConeGeometry(0.008, 0.045, 10).rotateZ(Math.PI / 2), shell, { x: -0.128, y: -0.003, rz: 0.12, parent: hs });
  for (let i = 0; i < 5; i++) {
    const x0 = -0.085 + i * 0.016;
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(x0, -0.012, 0.004), new THREE.Vector3(x0 + 0.004, -0.032, 0.002), new THREE.Vector3(x0 + 0.016, -0.05, 0)]);
    mesh(new THREE.TubeGeometry(c, 8, 0.0019, 5), legM, { parent: hs });
  }
  bake(hs);
  mesh(new THREE.SphereGeometry(0.0078, 14, 10), eyeM, { x: -0.093, y: 0.007, z: 0.013, parent: head });
  mesh(new THREE.SphereGeometry(0.0022, 8, 6), glintM, { x: -0.095, y: 0.0095, z: 0.02, parent: head });
  const feelers = group({ parent: head });
  const f1 = [[-0.1, -0.004], [-0.122, -0.03], [-0.132, -0.07], [-0.122, -0.105], [-0.098, -0.118], [-0.076, -0.108], [-0.082, -0.092], [-0.096, -0.098]];
  const f2 = [[-0.104, 0.0], [-0.13, -0.018], [-0.152, -0.055], [-0.155, -0.095], [-0.138, -0.124], [-0.112, -0.13], [-0.104, -0.118]];
  for (const pts of [f1, f2]) {
    const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, -0.012)));
    mesh(new THREE.TubeGeometry(c, 60, 0.0011, 4), feelerM, { parent: feelers, shadow: false });
  }
  bake(feelers);
  // --- curled tail body: overlapping shell segments along a spine
  const spine = [[0.003, 0.001], [0.026, -0.001], [0.049, -0.009], [0.068, -0.025], [0.08, -0.047], [0.083, -0.071], [0.075, -0.092]];
  const radii = [0.021, 0.0205, 0.019, 0.017, 0.014, 0.0115];
  const bs = group({ parent: body });
  for (let i = 0; i < radii.length; i++) {
    const [x0, y0] = spine[i], [x1, y1] = spine[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    mesh(new THREE.SphereGeometry(1, 22, 14), i % 2 ? shell : shell, {
      x: (x0 + x1) / 2, y: (y0 + y1) / 2, rz: Math.atan2(y1 - y0, x1 - x0),
      s: [len * 0.62, radii[i], radii[i] * 0.82], parent: bs,
    });
    // swimmerets
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;   // outward normal of the curl (towards the belly is −n)
    if (i < 5) {
      const bx = (x0 + x1) / 2 - nx * radii[i] * 0.8, by = (y0 + y1) / 2 - ny * radii[i] * 0.8;
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(bx, by, 0.004), new THREE.Vector3(bx - nx * 0.012 - 0.004, by - ny * 0.012, 0.002), new THREE.Vector3(bx - nx * 0.02 - 0.01, by - ny * 0.018, 0)]);
      mesh(new THREE.TubeGeometry(c, 6, 0.0016, 5), legM, { parent: bs });
    }
  }
  // tail fan
  const fan = new THREE.Shape();
  fan.moveTo(0, 0);
  fan.bezierCurveTo(0.012, -0.012, 0.012, -0.034, 0, -0.044);
  fan.bezierCurveTo(-0.012, -0.034, -0.012, -0.012, 0, 0);
  const fanGeo = new THREE.ExtrudeGeometry(fan, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 1 });
  for (const [a, sx] of [[-0.35, 1], [0.1, 1], [0.55, 1]]) {
    mesh(fanGeo, shellLight, { x: 0.074, y: -0.095, z: -0.002, rz: Math.PI * 0.18 + a, s: [sx, 1, 1], parent: bs });
  }
  bake(bs);
  return { head, body };
}

/** White plate (Ø 26 cm) with a whole orange-red prawn lying on its side. split() reveals a leech. */
function makePlatePrawn() {
  const root = group({ name: 'plate_prawn' });
  const plate = group({ name: 'plate', parent: root });
  mesh(lathe([[0, 0], [0.07, 0], [0.078, 0.004], [0.086, 0.009], [0.122, 0.018], [0.131, 0.022], [0.133, 0.0245], [0.128, 0.0252], [0.094, 0.0118], [0.088, 0.0115], [0, 0.0115]], 64),
    once('mat:plate', () => toon('#f6f5f2', { emissive: '#3c3c3a' })), { parent: plate });
  mesh(new THREE.CircleGeometry(0.089, 48).rotateX(-Math.PI / 2), once('mat:plateWell', () => toon('#d6d6d2', { outline: false, emissive: '#262624' })), { y: 0.0119, parent: plate, shadow: false });
  mesh(new THREE.RingGeometry(0.0875, 0.0895, 64).rotateX(-Math.PI / 2), once('mat:plateLine', () => toon('#2a2a2a', { outline: false })), { y: 0.0123, parent: plate, shadow: false });
  hitBox(0.27, 0.04, 0.27, 0, 0.02, 0, 'plate_hit', plate);

  const prawn = group({ name: 'prawn', y: 0.0115 + 0.0172, rx: -Math.PI / 2, parent: root });
  const { head, body } = buildPrawn();
  prawn.add(head, body);
  hitBox(0.24, 0.12, 0.05, -0.03, -0.04, 0.0, 'prawn_hit', prawn);

  const leech = makeLeech();
  place(leech, { name: 'plate_leech', y: 0.0118, z: 0.012, rx: -Math.PI / 2, s: 0.82, parent: root });
  leech.visible = false;
  hitBox(0.1, 0.05, 0.06, 0, 0.0, 0.02, 'plate_leech_hit', leech);
  leech.children[0].onBeforeRender = () => { if (leech.userData.idle) wriggle(leech, performance.now() / 1000 * 0.6, 0.6); };

  let isSplit = false;
  root.isSplit = () => isSplit;
  const pose = (e) => {
    head.position.set(-0.042 * e, 0.004 * e, 0);
    head.rotation.z = 0.08 * e;
    body.position.set(0.04 * e, -0.006 * e, 0);
    body.rotation.z = -0.06 * e;
  };

  /** split() — head and body come apart, a leech wriggles out of the neck onto the plate. */
  root.split = (o) => {
    const instant = opt(o).instant;
    isSplit = true;
    leech.visible = true;
    leech.userData.idle = false;
    return run(instant, 1500, (k) => {
      const t = k * 1500;
      // shiver, then pull apart
      const shiver = t < 300 ? Math.sin(t / 18) * 0.012 * (1 - t / 300) : 0;
      prawn.rotation.z = shiver;
      pose(outCubic(seg(t, 280, 760)));
      // leech squeezes out of the neck, then crawls to the middle of the plate
      const out = seg(t, 380, 900), crawl = seg(t, 900, 1500);
      leech.scale.setScalar(0.82 * Math.max(0.05, Ease.outBack(out)));
      leech.position.set(-0.004 + 0.004 * crawl, 0.0118 + 0.014 * (1 - Ease.inOutSine(crawl)), 0.012 - 0.006 * (1 - crawl));
      leech.rotation.set(-Math.PI / 2, 0, (1 - crawl) * 0.9 * (1 - out * 0.4));
      wriggle(leech, t / 1000, 1 - crawl * 0.6);
      if (k >= 1) leech.userData.idle = true;
    }, Ease.linear);
  };
  /** hideLeech() — the leech was picked up. */
  root.hideLeech = () => { leech.visible = false; leech.userData.idle = false; return Promise.resolve(); };
  return root;
}

// ===========================================================================================
// high_chair
// ===========================================================================================

/** Brown carved high-backed chair (1.2 m); the sitter faces +z. Seat top at y = 0.49. */
function makeHighChair() {
  const root = group({ name: 'high_chair' });
  const wood = toonTex('chairWood', 256, 512, (g, w, h) => {
    const r = rng(23);
    g.fillStyle = C.chair; g.fillRect(0, 0, w, h);
    grain(g, w, h, r, { n: 22, col: 'rgba(30,18,8,0.35)', wobble: 3 });
  }, { wrap: true });
  const uphol = toonTex('chairUphol', 256, 256, (g, w, h) => {
    const r = rng(5);
    g.fillStyle = C.uphol; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.12})`; g.fillRect(r() * w, r() * h, 2, 2); }
    g.strokeStyle = 'rgba(20,10,6,0.6)'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
  });
  const frame = group({ parent: root });
  const legGeo = lathe([[0, 0], [0.024, 0], [0.026, 0.03], [0.018, 0.06], [0.02, 0.16], [0.027, 0.2], [0.018, 0.24], [0.02, 0.38], [0.026, 0.4], [0.026, 0.46], [0, 0.46]], 12);
  for (const sx of [-1, 1]) {
    mesh(legGeo, wood, { x: sx * 0.205, z: 0.18, parent: frame });
    // rear posts (slightly raked) + finials
    mesh(rbox(0.048, 1.16, 0.05, 0.012), wood, { x: sx * 0.212, y: 0.58, z: -0.2, rx: -0.04, parent: frame });
    mesh(new THREE.SphereGeometry(0.032, 14, 10), wood, { x: sx * 0.212, y: 1.19, z: -0.225, s: [1, 1.25, 1], parent: frame });
    mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.02, 12), wood, { x: sx * 0.212, y: 1.155, z: -0.223, parent: frame });
    // side stretchers + seat rails
    mesh(rbox(0.028, 0.03, 0.37, 0.008), wood, { x: sx * 0.208, y: 0.13, z: -0.01, parent: frame });
    mesh(rbox(0.03, 0.06, 0.4, 0.008), wood, { x: sx * 0.208, y: 0.43, z: -0.01, parent: frame });
  }
  mesh(rbox(0.39, 0.028, 0.028, 0.008), wood, { y: 0.13, z: 0.18, parent: frame });
  mesh(rbox(0.39, 0.06, 0.03, 0.008), wood, { y: 0.43, z: 0.19, parent: frame });
  mesh(rbox(0.48, 0.05, 0.46, 0.012), wood, { y: 0.47, z: -0.005, parent: frame });
  // back: lower rail + carved crest rail
  mesh(rbox(0.39, 0.05, 0.032, 0.01), wood, { y: 0.6, z: -0.205, rx: -0.04, parent: frame });
  const crest = new THREE.Shape();
  crest.moveTo(-0.2, 0); crest.lineTo(0.2, 0); crest.lineTo(0.2, 0.06);
  crest.bezierCurveTo(0.14, 0.07, 0.09, 0.12, 0.04, 0.115);
  crest.quadraticCurveTo(0, 0.14, -0.04, 0.115);
  crest.bezierCurveTo(-0.09, 0.12, -0.14, 0.07, -0.2, 0.06);
  crest.lineTo(-0.2, 0);
  mesh(new THREE.ExtrudeGeometry(crest, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 }).translate(0, 0, -0.0175),
    wood, { y: 1.02, z: -0.225, rx: -0.04, parent: frame });
  bake(frame);
  mesh(rbox(0.37, 0.4, 0.024, 0.01), uphol, { name: 'chair_back_panel', y: 0.81, z: -0.212, rx: -0.04, parent: root });
  hitBox(0.5, 1.2, 0.5, 0, 0.6, 0, 'chair_hit', root);
  return root;
}

// ===========================================================================================
// cabinet
// ===========================================================================================

const CAB = { w: 0.72, d: 0.4, y0: 0.2, y1: 0.94, open: { x0: -0.205, x1: 0.205, y0: 0.25, y1: 0.86 }, boltX: { l: -0.118, r: 0.098 }, boltDrop: 0.105 };

/** Small dark-brown cabinet (1.0 m) with two bolted doors; the glass jug waits inside. */
function makeCabinet() {
  const root = group({ name: 'cabinet' });
  const woodM = toonTex('cabWood', 256, 512, (g, w, h) => {
    const r = rng(29);
    g.fillStyle = C.cab; g.fillRect(0, 0, w, h);
    grain(g, w, h, r, { n: 18, col: 'rgba(30,18,8,0.28)', wobble: 3 });
  }, { wrap: true });
  const darkM = once('mat:cabDark', () => toon('#3b3532'));
  const { w, d, y0, y1, open: O } = CAB;
  const fz = d / 2;
  const shell = group({ parent: root });
  // legs + apron
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(rbox(0.05, y0, 0.05, 0.008), woodM, { x: sx * (w / 2 - 0.04), y: y0 / 2, z: sz * (d / 2 - 0.04), parent: shell });
  mesh(rbox(w - 0.08, 0.026, 0.03, 0.006), woodM, { y: 0.07, z: fz - 0.04, parent: shell });
  // carcass: back, sides, bottom, top band
  mesh(rbox(w, y1 - y0, 0.03, 0.006), woodM, { y: (y0 + y1) / 2, z: -d / 2 + 0.015, parent: shell });
  for (const sx of [-1, 1]) mesh(rbox(0.03, y1 - y0, d, 0.006), woodM, { x: sx * (w / 2 - 0.015), y: (y0 + y1) / 2, parent: shell });
  mesh(rbox(w, 0.05, d, 0.006), woodM, { y: y0 + 0.025, parent: shell });
  // front frame around the door opening (stiles + rails)
  const fw = 0.035;
  mesh(rbox(w / 2 + O.x0, y1 - y0, fw, 0.006), woodM, { x: (-w / 2 + O.x0) / 2, y: (y0 + y1) / 2, z: fz - fw / 2, parent: shell });
  mesh(rbox(w / 2 - O.x1, y1 - y0, fw, 0.006), woodM, { x: (w / 2 + O.x1) / 2, y: (y0 + y1) / 2, z: fz - fw / 2, parent: shell });
  mesh(rbox(O.x1 - O.x0, y1 - O.y1, fw, 0.006), woodM, { y: (O.y1 + y1) / 2, z: fz - fw / 2, parent: shell });
  mesh(rbox(O.x1 - O.x0, O.y0 - y0, fw, 0.006), woodM, { y: (y0 + O.y0) / 2, z: fz - fw / 2, parent: shell });
  // inner stile lines (the original has a second vertical board each side)
  for (const sx of [-1, 1]) mesh(rbox(0.012, y1 - y0 - 0.02, 0.008, 0.003), darkM, { x: sx * (w / 2 - 0.075), y: (y0 + y1) / 2, z: fz + 0.002, parent: shell });
  // dark band + overhanging top
  mesh(rbox(w - 0.04, 0.035, d - 0.02, 0.006), darkM, { y: y1 + 0.0175, parent: shell });
  mesh(rbox(w + 0.08, 0.04, d + 0.06, 0.014), woodM, { y: y1 + 0.055, z: 0.015, parent: shell });
  // top catches above each bolt
  for (const s of ['l', 'r']) mesh(rbox(0.07, 0.034, 0.03, 0.006), once('mat:cabBolt', () => toon(C.bolt)), { x: CAB.boltX[s], y: O.y1 + 0.038, z: fz + 0.012, parent: shell });
  bake(shell);
  // interior (BackSide box) + shelf lip
  mesh(new THREE.BoxGeometry(O.x1 - O.x0 - 0.004, O.y1 - O.y0 - 0.004, d - 0.04), once('mat:cabIn', () => toon(C.cabDark, { side: THREE.BackSide, outline: false })),
    { name: 'cab_interior', y: (O.y0 + O.y1) / 2, z: 0.016, parent: root, shadow: false });
  mesh(rbox(O.x1 - O.x0, 0.03, 0.03, 0.005), once('mat:cabShelf', () => toon('#5e4636')), { y: O.y0 + 0.015, z: fz - 0.03, parent: root });

  // jug on the bottom shelf
  const jug = makeJug(0);
  place(jug, { name: 'cab_jug', y: O.y0 + 0.002, z: -0.02, ry: 0, parent: root });
  hitBox(0.25, 0.34, 0.2, 0.02, 0.17, 0, 'cab_jug_hit', jug);

  // doors (per instance materials: they fade out)
  const doors = group({ name: 'cab_doors', parent: root });
  const doorTex = once('tex:cabDoor', () => canvasTexture(200, 600, (g, W, H) => {
    const r = rng(31);
    g.fillStyle = C.cab; g.fillRect(0, 0, W, H);
    grain(g, W, H, r, { n: 10, col: 'rgba(30,18,8,0.25)', wobble: 2 });
    g.strokeStyle = 'rgba(15,10,6,0.9)'; g.lineWidth = 5; g.strokeRect(14, 14, W - 28, H - 28);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(14, 14, W - 28, 10);
  }, { wrap: false }));
  const doorM = toon('#ffffff', { map: doorTex });
  const boltM = toon(C.bolt);
  const stapleM = toon('#6f3b2e');
  const fadeMats = [doorM, boltM, stapleM];
  const dw = (O.x1 - O.x0) / 2 - 0.004, dh = O.y1 - O.y0 - 0.006;
  for (const [s, sx] of [['l', -1], ['r', 1]]) {
    mesh(frontBox(dw, dh, 0.022, 0.004), [doorM, doorM], { name: 'cab_door_' + s, x: sx * (dw / 2 + 0.002), y: (O.y0 + O.y1) / 2, z: fz - 0.012, parent: doors });
    const bx = CAB.boltX[s];
    for (const yy of [0.565, 0.67]) mesh(rbox(0.068, 0.03, 0.022, 0.005), stapleM, { x: bx, y: yy, z: fz + 0.011, parent: doors });
    const bolt = group({ name: 'cab_bolt_' + s, x: bx, z: fz + 0.012, parent: doors });
    mesh(rbox(0.036, 0.4, 0.018, 0.006), boltM, { y: O.y1 + 0.045 - 0.2, parent: bolt });
    mesh(rbox(0.035, 0.016, 0.018, 0.005), boltM, { x: 0.03, y: 0.62, parent: bolt });   // knob
    hitBox(0.09, 0.42, 0.06, 0, O.y1 + 0.045 - 0.2, 0.01, 'cab_bolt_' + s + '_hit', bolt);
  }
  hitBox(O.x1 - O.x0, O.y1 - O.y0, 0.05, 0, (O.y0 + O.y1) / 2, fz, 'cab_doors_hit', doors);

  const bolts = { l: doors.getObjectByName('cab_bolt_l'), r: doors.getObjectByName('cab_bolt_r') };
  const down = { l: false, r: false };
  let isOpen = false;
  root.isBoltDown = (s) => down[s];
  root.isOpen = () => isOpen;

  /** slideBolt('l' | 'r') — the bolt slides down out of its top catch. */
  root.slideBolt = (side = 'l', o) => {
    const s = side === 'r' ? 'r' : 'l';
    if (down[s]) return Promise.resolve();
    down[s] = true;
    return run(opt(o).instant, 380, (e) => { bolts[s].position.y = -CAB.boltDrop * e; }, Ease.outBack);
  };
  /** openDoors() — the doors (with their bolts) vanish, revealing the dark interior and the jug. */
  root.openDoors = (o) => {
    isOpen = true;
    const setA = (a) => {
      for (const m of fadeMats) {
        m.transparent = a < 1; m.opacity = a; m.depthWrite = a > 0.5;
        m.userData.outlineParameters.alpha = a;
      }
      doors.visible = a > 0.001;
    };
    return run(opt(o).instant, 300, (e) => setA(1 - e), Ease.inOutSine);
  };
  /** hideJug() — the jug was taken. */
  root.hideJug = () => { jug.visible = false; return Promise.resolve(); };
  return root;
}

// ===========================================================================================
// family_photo / portrait_caroline (painted canvases in gilded frames)
// ===========================================================================================

function paintFrameFront(g, W, H, border) {
  // gilded flat frame with stepped bevel lines; border = fraction of W
  g.fillStyle = '#bb931f'; g.fillRect(0, 0, W, H);
  const r = rng(7);
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,230,150' : '90,60,10'},${r() * 0.12})`; g.fillRect(r() * W, r() * H, 2, 2); }
  const b = border * W;
  const rect = (inset, lw, col) => { g.strokeStyle = col; g.lineWidth = lw; g.strokeRect(inset, inset, W - inset * 2, H - inset * 2); };
  rect(4, 6, '#1e160a');
  rect(b * 0.42, 3, 'rgba(60,40,8,0.85)');
  rect(b * 0.62, 3, 'rgba(60,40,8,0.85)');
  g.fillStyle = 'rgba(255,225,140,0.25)';
  g.fillRect(b * 0.62, b * 0.62, W - b * 1.24, (b * 0.38));
  rect(b * 0.8, 3, 'rgba(60,40,8,0.85)');
  rect(b - 3, 6, '#1e160a');
}

function oldPhoto(g, W, H, { seed = 3, desat = 0.55, sepia = 0.45, vignette = 0.5 } = {}) {
  const r = rng(seed);
  g.save();
  g.globalCompositeOperation = 'saturation';
  g.globalAlpha = desat; g.fillStyle = 'hsl(0,0%,50%)'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = sepia; g.fillStyle = '#ead9b8'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  for (let i = 0; i < W * H * 0.02; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,250,240' : '20,15,10'},${r() * 0.12})`; g.fillRect(r() * W, r() * H, 1.5, 1.5); }
  for (let i = 0; i < 9; i++) {
    g.strokeStyle = `rgba(240,235,225,${0.15 + r() * 0.2})`; g.lineWidth = 0.8 + r();
    const x = r() * W, y = r() * H;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 60, y + 40 + r() * 140); g.stroke();
  }
  const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.72);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, `rgba(40,30,20,${vignette})`);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.restore();
}

/** Ink helper for the naive painted figures: smooth closed shape through pts. */
function shapeFill(g, pts, fill, lw = 3, curve = true) {
  g.beginPath();
  if (curve && pts.length > 2) {
    g.moveTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
    for (let i = 1; i <= pts.length; i++) {
      const p = pts[i % pts.length], q = pts[(i + 1) % pts.length];
      g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
  } else {
    g.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
  }
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw) inkStroke(g, lw, '#231c17');
}
function line(g, pts, lw = 2.5, col = '#231c17') {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
  inkStroke(g, lw, col);
}
function curve(g, pts, lw = 2.5, col = '#231c17') {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  const l = pts[pts.length - 1]; g.lineTo(l[0], l[1]);
  inkStroke(g, lw, col);
}
/** Face outline (rounded skull, jaw, chin) filled with skin. */
function faceShape(g, cx, cy, rx, ry, skin, { jaw = 0.9, chin = 0.35, lw = 3 } = {}) {
  g.beginPath();
  g.moveTo(cx - rx, cy);
  g.ellipse(cx, cy, rx, ry * 0.95, 0, Math.PI, 2 * Math.PI);
  g.quadraticCurveTo(cx + rx * jaw * 1.02, cy + ry * 0.7, cx + rx * chin, cy + ry);
  g.quadraticCurveTo(cx, cy + ry * 1.08, cx - rx * chin, cy + ry);
  g.quadraticCurveTo(cx - rx * jaw * 1.02, cy + ry * 0.7, cx - rx, cy);
  g.closePath();
  g.fillStyle = skin; g.fill();
  inkStroke(g, lw);
}
/** Tired Rusty-Lake face features, scaled by rx (half face width). */
function features(g, cx, cy, rx, { brow = 1, mustache = null, frown = 0.3, bags = true, old = false, look = 0, lw = 1 } = {}) {
  const s = rx;
  for (const sx of [-1, 1]) {
    const ex = cx + sx * s * 0.4, ey = cy + s * 0.08;
    g.fillStyle = '#ece7de'; g.beginPath(); g.ellipse(ex, ey, s * 0.2, s * 0.1, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1d1712'; g.beginPath(); g.arc(ex + look * s * 0.05, ey + s * 0.015, s * 0.075, 0, Math.PI * 2); g.fill();
    curve(g, [[ex - s * 0.24, ey + s * 0.02], [ex, ey - s * 0.12], [ex + s * 0.24, ey + s * 0.02]], 2.2 * lw);
    if (bags) curve(g, [[ex - s * 0.18, ey + s * 0.14], [ex, ey + s * 0.2], [ex + s * 0.18, ey + s * 0.14]], 1.3 * lw, 'rgba(45,35,30,0.55)');
    line(g, [[ex - sx * s * 0.28, ey - s * (0.2 + 0.08 * brow)], [ex + sx * s * 0.2, ey - s * 0.22]], (2 + brow * 1.6) * lw);
  }
  line(g, [[cx + s * 0.02, cy + s * 0.05], [cx + s * 0.12, cy + s * 0.42], [cx - s * 0.06, cy + s * 0.47]], 2 * lw);
  if (mustache) {
    g.fillStyle = mustache;
    g.beginPath(); g.moveTo(cx - s * 0.36, cy + s * 0.66); g.quadraticCurveTo(cx - s * 0.1, cy + s * 0.48, cx, cy + s * 0.56);
    g.quadraticCurveTo(cx + s * 0.1, cy + s * 0.48, cx + s * 0.36, cy + s * 0.66); g.quadraticCurveTo(cx, cy + s * 0.6, cx - s * 0.36, cy + s * 0.66);
    g.fill(); inkStroke(g, 1.5 * lw);
  }
  curve(g, [[cx - s * 0.2, cy + s * (0.72 + frown * 0.06)], [cx, cy + s * 0.7], [cx + s * 0.2, cy + s * (0.72 + frown * 0.06)]], 2 * lw);
  if (old) for (const sx of [-1, 1]) curve(g, [[cx + sx * s * 0.3, cy + s * 0.4], [cx + sx * s * 0.36, cy + s * 0.62], [cx + sx * s * 0.3, cy + s * 0.8]], 1.3 * lw, 'rgba(40,30,25,0.55)');
}

const SKIN = '#d9d0c5';
function paintFamilyPhoto(g, W, H) {
  const r = rng(101);
  // backdrop: cool grey, mottled; slightly lighter floor; soft shadow
  g.fillStyle = '#a7aaa8'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const x = r() * W, y = r() * H, rad = 20 + r() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(${r() < 0.5 ? '80,82,82' : '210,212,210'},0.07)`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.fillStyle = 'rgba(215,215,210,0.3)'; g.fillRect(0, 630, W, H - 630);
  g.fillStyle = 'rgba(45,42,40,0.28)';
  g.beginPath(); g.ellipse(520, 702, 390, 24, 0, 0, Math.PI * 2); g.fill();

  // ---------------- Nicholas (tallest, long dark coat, grey hair, right; behind Caroline)
  {
    const x = 792;
    shapeFill(g, [[x - 30, 690], [x - 28, 545], [x + 28, 545], [x + 32, 690]], '#3f3b39');
    shapeFill(g, [[x - 44, 704], [x - 2, 704], [x - 4, 684], [x - 38, 682]], '#26211e', 2.5, false);
    shapeFill(g, [[x + 2, 704], [x + 46, 704], [x + 40, 682], [x + 4, 684]], '#26211e', 2.5, false);
    shapeFill(g, [[x - 66, 236], [x + 66, 236], [x + 86, 330], [x + 84, 600], [x + 30, 612], [x - 30, 612], [x - 84, 600], [x - 86, 330]], '#4b4644');
    line(g, [[x, 420], [x - 2, 610]], 2);
    shapeFill(g, [[x - 26, 222], [x + 26, 222], [x + 18, 320], [x, 352], [x - 18, 320]], '#ebe7df', 2.5);
    for (let i = -1; i <= 1; i++) line(g, [[x + i * 8, 236], [x + i * 6, 322]], 1.4, 'rgba(60,55,50,0.5)');
    line(g, [[x - 32, 236], [x - 10, 430]], 2.5); line(g, [[x + 32, 236], [x + 10, 430]], 2.5);
    shapeFill(g, [[x + 62, 246], [x + 96, 300], [x + 104, 480], [x + 80, 488], [x + 72, 330]], '#46413f');
    shapeFill(g, [[x - 62, 246], [x - 92, 300], [x - 96, 470], [x - 74, 474], [x - 70, 330]], '#46413f');
    shapeFill(g, [[x + 80, 484], [x + 104, 480], [x + 102, 506], [x + 86, 510]], SKIN, 2.5);
    shapeFill(g, [[x - 22, 180], [x + 22, 180], [x + 20, 226], [x - 20, 226]], SKIN, 2.5, false);
    faceShape(g, x, 152, 34, 46, SKIN, { jaw: 0.95, chin: 0.42 });
    shapeFill(g, [[x - 38, 158], [x - 40, 118], [x - 18, 96], [x + 14, 94], [x + 38, 108], [x + 42, 150], [x + 30, 124], [x + 4, 116], [x - 22, 124], [x - 30, 150]], '#8d8c8a');
    features(g, x, 150, 34, { brow: 1.4, mustache: '#3a3634', frown: 0.5 });
  }
  // ---------------- Caroline (striped bonnet, long brown dress, pale-blue sleeves)
  {
    const x = 668;
    shapeFill(g, [[x - 44, 256], [x + 44, 256], [x + 74, 520], [x + 86, 690], [x - 86, 690], [x - 74, 520]], '#7d5d4d');
    for (const dx of [-50, -20, 12, 44]) curve(g, [[x + dx * 0.4, 380], [x + dx * 0.8, 540], [x + dx, 684]], 1.6, 'rgba(40,25,18,0.5)');
    shapeFill(g, [[x - 38, 252], [x + 38, 252], [x + 34, 360], [x - 34, 360]], '#84614f', 2.5, false);
    shapeFill(g, [[x - 20, 252], [x + 20, 252], [x + 16, 280], [x - 16, 280]], '#e2dccf', 2, false);
    for (const sx of [-1, 1]) shapeFill(g, [[x + sx * 38, 254], [x + sx * 60, 270], [x + sx * 62, 410], [x + sx * 44, 414], [x + sx * 38, 320]], '#a9bcc2');
    shapeFill(g, [[x - 42, 402], [x + 42, 402], [x + 36, 424], [x - 36, 424]], SKIN, 2.5);
    shapeFill(g, [[x - 14, 222], [x + 14, 222], [x + 12, 254], [x - 12, 254]], SKIN, 2.5, false);
    faceShape(g, x, 192, 28, 38, SKIN, { jaw: 0.9, chin: 0.36 });
    g.save();
    g.beginPath(); g.ellipse(x + 2, 186, 37, 44, 0, Math.PI * 0.9, Math.PI * 2.1); g.closePath(); g.clip();
    const cols = ['#a9bec5', '#e6decb', '#c49378'];
    for (let i = -6; i <= 6; i++) { g.fillStyle = cols[(i + 9) % 3]; g.beginPath(); g.moveTo(x + 2, 214); g.lineTo(x + i * 13 - 7, 130); g.lineTo(x + i * 13 + 7, 130); g.closePath(); g.fill(); }
    g.restore();
    g.beginPath(); g.ellipse(x + 2, 186, 37, 44, 0, Math.PI * 0.9, Math.PI * 2.1); g.closePath(); inkStroke(g, 3);
    curve(g, [[x - 33, 196], [x, 170], [x + 35, 196]], 5, '#8c5a44');
    features(g, x, 196, 26, { brow: 0.6, frown: 0.6 });
  }
  // ---------------- Gerard (big man in a vest, hands in pockets, left)
  {
    const x = 228;
    shapeFill(g, [[x - 58, 452], [x + 58, 452], [x + 54, 668], [x + 10, 668], [x + 2, 520], [x - 6, 668], [x - 54, 668]], '#6f675f');
    shapeFill(g, [[x - 60, 704], [x - 6, 704], [x - 8, 664], [x - 54, 664]], '#3d2f26', 2.5, false);
    shapeFill(g, [[x + 6, 704], [x + 62, 704], [x + 54, 664], [x + 10, 664]], '#3d2f26', 2.5, false);
    // arms (sleeves) angled out, hands in the pockets
    for (const sx of [-1, 1]) shapeFill(g, [[x + sx * 66, 250], [x + sx * 98, 300], [x + sx * 92, 440], [x + sx * 62, 470], [x + sx * 52, 452], [x + sx * 70, 420], [x + sx * 70, 330]], '#e3dfd7');
    shapeFill(g, [[x - 70, 242], [x + 72, 242], [x + 74, 330], [x + 62, 462], [x - 60, 462], [x - 74, 330]], '#e6e2da');
    for (const sx of [-1, 1]) shapeFill(g, [[x + sx * 28, 238], [x + sx * 72, 248], [x + sx * 74, 330], [x + sx * 64, 476], [x + sx * 8, 484], [x + sx * 14, 330]], '#6b4f3f');
    for (const yy of [300, 350, 400, 448]) { g.fillStyle = '#2b211a'; g.beginPath(); g.arc(x - 16, yy, 4, 0, Math.PI * 2); g.fill(); }
    shapeFill(g, [[x - 26, 204], [x + 26, 204], [x + 28, 246], [x - 28, 246]], SKIN, 2.5, false);
    faceShape(g, x, 176, 37, 44, SKIN, { jaw: 1.0, chin: 0.5 });
    shapeFill(g, [[x - 40, 178], [x - 42, 140], [x - 24, 122], [x - 2, 116], [x + 22, 120], [x + 40, 134], [x + 42, 170], [x + 30, 148], [x + 18, 156], [x + 6, 142], [x - 8, 154], [x - 22, 146], [x - 32, 164]], '#7b5a45');
    features(g, x, 176, 37, { brow: 1.8, frown: 0.7 });
  }
  // ---------------- Margaret (seated on a stool, white hair in a bun, apron, holding baby David)
  {
    const x = 360;
    shapeFill(g, [[x - 84, 530], [x - 78, 690], [x - 70, 690], [x - 66, 540]], '#6c6660', 2.5, false);
    shapeFill(g, [[x - 98, 520], [x - 40, 520], [x - 42, 542], [x - 96, 542]], '#79726c', 2.5, false);
    shapeFill(g, [[x - 54, 372], [x + 50, 372], [x + 70, 470], [x + 96, 560], [x + 110, 690], [x - 72, 690], [x - 64, 520], [x - 72, 440]], '#5f5954');
    shapeFill(g, [[x - 30, 430], [x + 62, 446], [x + 92, 560], [x + 98, 682], [x - 22, 682], [x - 34, 520]], '#c4bfb5');
    // baby (bundle, auburn tuft) on her lap, arms around it
    shapeFill(g, [[x + 6, 434], [x + 54, 420], [x + 70, 478], [x + 14, 494]], '#ebe7df');
    faceShape(g, x + 34, 404, 17, 18, SKIN, { jaw: 0.95, chin: 0.6, lw: 2.5 });
    shapeFill(g, [[x + 18, 400], [x + 22, 386], [x + 36, 382], [x + 50, 390], [x + 50, 400], [x + 36, 392]], '#8a5d42', 2);
    g.fillStyle = '#231c17'; g.fillRect(x + 27, 406, 3, 3); g.fillRect(x + 39, 406, 3, 3);
    shapeFill(g, [[x - 50, 380], [x - 70, 450], [x - 22, 480], [x + 44, 470], [x + 36, 452], [x - 22, 454], [x - 32, 396]], '#5f5954');
    shapeFill(g, [[x + 30, 448], [x + 52, 452], [x + 50, 470], [x + 28, 468]], SKIN, 2);
    shapeFill(g, [[x - 14, 344], [x + 14, 344], [x + 14, 376], [x - 14, 376]], '#cfc7be', 2.5, false);
    faceShape(g, x - 4, 326, 25, 32, '#d0c8bf', { jaw: 0.9, chin: 0.4 });
    shapeFill(g, [[x - 30, 330], [x - 28, 302], [x - 12, 290], [x + 6, 290], [x + 22, 300], [x + 24, 330], [x + 12, 306], [x - 4, 300], [x - 18, 308]], '#e9e7e2');
    g.fillStyle = '#e9e7e2'; g.beginPath(); g.arc(x - 4, 288, 12, 0, Math.PI * 2); g.fill(); inkStroke(g, 2);
    features(g, x - 4, 326, 25, { brow: 0.5, old: true, frown: 1 });
  }
  // ---------------- Elizabeth (little red-haired girl, white dress)
  {
    const x = 470;
    shapeFill(g, [[x - 18, 694], [x - 2, 694], [x - 4, 664], [x - 18, 664]], '#2e2621', 2, false);
    shapeFill(g, [[x + 4, 694], [x + 20, 694], [x + 18, 664], [x + 4, 664]], '#2e2621', 2, false);
    shapeFill(g, [[x - 34, 446], [x - 30, 420], [x + 30, 420], [x + 34, 446], [x + 48, 560], [x + 54, 668], [x - 54, 668], [x - 48, 560]], '#e3ded4');
    for (const dx of [-28, -9, 10, 29]) line(g, [[x + dx * 0.6, 520], [x + dx, 664]], 1.3, 'rgba(60,55,50,0.45)');
    for (const sx of [-1, 1]) shapeFill(g, [[x + sx * 30, 424], [x + sx * 42, 446], [x + sx * 40, 520], [x + sx * 32, 522], [x + sx * 30, 470]], SKIN, 2.5);
    shapeFill(g, [[x - 30, 372], [x - 38, 420], [x - 32, 446], [x + 32, 446], [x + 38, 420], [x + 30, 372]], '#a65a3a');
    shapeFill(g, [[x - 10, 404], [x + 10, 404], [x + 10, 424], [x - 10, 424]], SKIN, 2.5, false);
    faceShape(g, x, 384, 22, 27, SKIN, { jaw: 0.9, chin: 0.4 });
    shapeFill(g, [[x - 26, 394], [x - 26, 366], [x - 10, 352], [x + 12, 352], [x + 26, 366], [x + 26, 394], [x + 16, 372], [x - 2, 364], [x - 16, 372]], '#ab5f3c');
    features(g, x, 384, 22, { brow: 0.4, bags: false, frown: 0.1 });
  }
  // ---------------- Jakob (boy, short auburn hair, white shirt) — the photo_jakob hotspot covers him
  {
    const x = 566;
    shapeFill(g, [[x - 30, 468], [x + 30, 468], [x + 28, 664], [x + 5, 664], [x, 540], [x - 5, 664], [x - 28, 664]], '#57534e');
    shapeFill(g, [[x - 32, 702], [x - 2, 702], [x - 4, 660], [x - 30, 660]], '#2e2621', 2.5, false);
    shapeFill(g, [[x + 2, 702], [x + 34, 702], [x + 30, 660], [x + 4, 660]], '#2e2621', 2.5, false);
    for (const sx of [-1, 1]) shapeFill(g, [[x + sx * 36, 372], [x + sx * 52, 398], [x + sx * 50, 484], [x + sx * 36, 488], [x + sx * 34, 420]], '#e6e2d9');
    for (const sx of [-1, 1]) shapeFill(g, [[x + sx * 37, 484], [x + sx * 50, 484], [x + sx * 49, 500], [x + sx * 38, 502]], SKIN, 2);
    shapeFill(g, [[x - 38, 368], [x + 38, 368], [x + 44, 470], [x + 40, 480], [x - 40, 480], [x - 44, 470]], '#ece8e0');
    line(g, [[x, 378], [x, 470]], 1.6, 'rgba(50,45,40,0.6)');
    shapeFill(g, [[x - 12, 348], [x + 12, 348], [x + 12, 372], [x - 12, 372]], SKIN, 2.5, false);
    shapeFill(g, [[x - 16, 366], [x, 382], [x + 16, 366]], '#ece8e0', 2.2, false);
    faceShape(g, x, 334, 24, 30, SKIN, { jaw: 0.92, chin: 0.42 });
    shapeFill(g, [[x - 26, 336], [x - 28, 312], [x - 12, 298], [x + 10, 298], [x + 26, 306], [x + 28, 334], [x + 18, 316], [x + 6, 322], [x - 6, 314], [x - 18, 322]], '#8f5e3e');
    features(g, x, 334, 24, { brow: 0.9, bags: false, frown: 0.4 });
  }
  oldPhoto(g, W, H, { seed: 17, desat: 0.42, sepia: 0.3, vignette: 0.32 });
}

function paintPortrait(g, W, H) {
  const r = rng(202);
  g.fillStyle = '#929593'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 220; i++) {
    const x = r() * W, y = r() * H, rad = 15 + r() * 70;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(${r() < 0.5 ? '60,62,62' : '205,207,205'},0.08)`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const cx = W * 0.47;
  // soft shadow behind the head (painted portrait)
  g.fillStyle = 'rgba(55,55,55,0.22)';
  g.beginPath(); g.ellipse(cx + 40, 300, 150, 190, 0, 0, Math.PI * 2); g.fill();
  // shoulders: pale-blue sleeves, ochre square-necked bodice, cream edging
  shapeFill(g, [[cx - 215, H + 10], [cx - 196, 600], [cx - 130, 548], [cx + 130, 548], [cx + 200, 600], [cx + 220, H + 10]], '#a6bcc3', 4, false);
  shapeFill(g, [[cx - 138, H + 10], [cx - 128, 552], [cx + 128, 552], [cx + 138, H + 10]], '#9a6248', 4, false);
  shapeFill(g, [[cx - 84, 552], [cx + 84, 552], [cx + 80, 640], [cx - 80, 640]], '#e3dccd', 4, false);
  shapeFill(g, [[cx - 66, 552], [cx + 66, 552], [cx + 62, 624], [cx - 62, 624]], '#d4cec5', 3, false);
  // neck
  shapeFill(g, [[cx - 40, 450], [cx + 40, 450], [cx + 46, 556], [cx - 46, 556]], '#cfcac4', 4, false);
  line(g, [[cx - 30, 520], [cx - 10, 536]], 1.5, 'rgba(40,30,25,0.4)');
  // face
  faceShape(g, cx, 352, 84, 116, '#d4d0ca', { jaw: 0.92, chin: 0.36, lw: 4 });
  // hair band peeking under the bonnet on the left
  shapeFill(g, [[cx - 92, 300], [cx - 110, 360], [cx - 98, 420], [cx - 80, 400], [cx - 82, 330]], '#8f553d', 3);
  // bonnet: radial stripes pale blue / cream / ochre
  const bon = () => { g.beginPath(); g.ellipse(cx + 10, 300, 122, 128, 0, Math.PI * 0.94, Math.PI * 2.06); g.closePath(); };
  g.save(); bon(); g.clip();
  const cols = ['#a7bfc7', '#e6dcc6', '#c99676'];
  for (let i = -8; i <= 8; i++) { g.fillStyle = cols[(i + 30) % 3]; g.beginPath(); g.moveTo(cx + 10, 340); g.lineTo(cx + i * 32 - 16, 150); g.lineTo(cx + i * 32 + 16, 150); g.closePath(); g.fill(); }
  for (let i = -8; i <= 8; i++) line(g, [[cx + 10 + i * 3, 330], [cx + i * 32 + 16, 150]], 1.8, 'rgba(40,30,25,0.45)');
  g.restore();
  bon(); inkStroke(g, 4);
  // brown band along the forehead edge
  g.lineWidth = 14; g.strokeStyle = '#94573f'; g.lineCap = 'round';
  g.beginPath(); g.ellipse(cx + 6, 336, 100, 62, 0, Math.PI * 1.04, Math.PI * 1.96); g.stroke();
  g.beginPath(); g.ellipse(cx + 6, 336, 108, 70, 0, Math.PI * 1.04, Math.PI * 1.96); inkStroke(g, 3);
  // round ear flap on the right
  shapeFill(g, [[cx + 100, 318], [cx + 132, 330], [cx + 138, 384], [cx + 118, 412], [cx + 96, 392]], '#a7bfc7', 4);
  curve(g, [[cx + 106, 334], [cx + 126, 360], [cx + 112, 398]], 2, 'rgba(40,30,25,0.5)');
  features(g, cx - 6, 362, 78, { brow: 0.4, frown: 0.7, lw: 1.5 });
  oldPhoto(g, W, H, { seed: 9, desat: 0.28, sepia: 0.24, vignette: 0.35 });
}

function plaqueTexture(key, text, { w = 512, h = 64, font } = {}) {
  return once('tex:plaque:' + key, () => canvasTexture(w, h, (g) => {
    g.fillStyle = '#cfb05a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2a1e0c'; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#3a2a10';
    g.font = font || `bold ${Math.round(h * 0.62)}px "Palatino Linotype", "Book Antiqua", Georgia, serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  }, { wrap: false }));
}

/**
 * Gilded frame hanging from a nail by a string. Origin = the nail; the frame faces +z.
 * spec: { name, W, H, border, nailDrop, attachX, photo: {key, w, h, paint}, plaque: {key, text, w, h} }
 */
function makeHangingFrame(spec) {
  const root = group({ name: spec.name });
  const { W, H, border, nailDrop } = spec;
  const cy = -nailDrop - H / 2;
  const depth = 0.03;
  // nail + string
  const nailM = once('mat:nail', () => toon('#2b2622'));
  mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 8).rotateX(Math.PI / 2), nailM, { z: 0.015, parent: root });
  mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 12).rotateX(Math.PI / 2), nailM, { z: 0.03, parent: root });
  const strM = once('mat:string', () => toon('#151515', { outline: 0.002 }));
  for (const sx of [-1, 1]) {
    const c = new THREE.LineCurve3(new THREE.Vector3(0, 0.004, 0.026), new THREE.Vector3(sx * spec.attachX, -nailDrop - 0.012, depth * 0.6));
    mesh(new THREE.TubeGeometry(c, 1, 0.0028, 5), strM, { parent: root, shadow: false });
  }
  // frame
  const outer = new THREE.Shape();
  outer.moveTo(-W / 2, -H / 2); outer.lineTo(W / 2, -H / 2); outer.lineTo(W / 2, H / 2); outer.lineTo(-W / 2, H / 2); outer.lineTo(-W / 2, -H / 2);
  const hole = new THREE.Path();
  const iw = W / 2 - border, ih = H / 2 - border;
  hole.moveTo(-iw, -ih); hole.lineTo(-iw, ih); hole.lineTo(iw, ih); hole.lineTo(iw, -ih); hole.lineTo(-iw, -ih);
  outer.holes.push(hole);
  const fg = extrudeFront(outer, depth, 0.006, 4);
  const frontM = toonTex('frame:' + spec.name, 512, Math.round(512 * H / W), (g, w, h) => paintFrameFront(g, w, h, border / W));
  const goldM = once('mat:gold', () => toon(C.gold));
  mesh(fg, [frontM, goldM], { name: spec.name + '_frame', y: cy, z: depth / 2 + 0.006, parent: root });
  // painted photo (recessed)
  const photoM = toonTex('photo:' + spec.photo.key, spec.photo.w, spec.photo.h, spec.photo.paint, { outline: false });
  const pw = W - border * 2 + 0.004, ph = H - border * 2 + 0.004;
  mesh(new THREE.PlaneGeometry(pw, ph), photoM, { name: spec.name + '_photo', y: cy, z: 0.012, parent: root, shadow: false });
  mesh(new THREE.PlaneGeometry(W - 0.01, H - 0.01), once('mat:frameBack', () => toon('#3a2f1c', { outline: false })), { y: cy, z: 0.004, parent: root, shadow: false });
  // plaque on the bottom border
  const pq = spec.plaque;
  const plaqueM = toon('#ffffff', { map: plaqueTexture(pq.key, pq.text, { w: 1024, h: Math.round(1024 * pq.h / pq.w) }) });
  mesh(frontBox(pq.w, pq.h, 0.006, 0.002), [plaqueM, goldM],
    { name: spec.name + '_plaque', y: cy - H / 2 + border * 0.5 + (pq.dy || 0), z: depth + 0.012 + 0.003, parent: root });
  hitBox(W, H, 0.05, 0, cy, 0.03, spec.name + '_hit', root);
  root.userData.frameCenter = new THREE.Vector3(0, cy, depth);

  /** 全屏放大查看用的平面图：画框正面、画面、铭牌按实际比例拼在一张画布上（第一次调用时生成）。 */
  root.snapshot = () => {
    if (root.userData.snapshot) return root.userData.snapshot;
    const ppm = 1400;                          // 每米像素
    const cw = Math.round(W * ppm), ch = Math.round(H * ppm), b = border * ppm;
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    g.drawImage(frontM.map.image, 0, 0, cw, ch);
    g.drawImage(photoM.map.image, b, b, cw - 2 * b, ch - 2 * b);
    // 画面四周一圈淡淡的内阴影，像嵌在框里
    const sh = g.createLinearGradient(0, b, 0, b + ppm * 0.03);
    sh.addColorStop(0, 'rgba(20,14,6,0.45)'); sh.addColorStop(1, 'rgba(20,14,6,0)');
    g.fillStyle = sh; g.fillRect(b, b, cw - 2 * b, ppm * 0.03);
    const pw = pq.w * ppm, ph = pq.h * ppm, py = ch - (border * 0.5 + (pq.dy || 0)) * ppm;
    g.drawImage(plaqueM.map.image, (cw - pw) / 2, py - ph / 2, pw, ph);
    g.strokeStyle = '#141210';
    g.lineWidth = Math.round(ppm * 0.005);
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, cw - g.lineWidth, ch - g.lineWidth);
    g.lineWidth = Math.round(ppm * 0.003);
    g.strokeRect(b, b, cw - 2 * b, ch - 2 * b);
    g.strokeRect((cw - pw) / 2, py - ph / 2, pw, ph);
    root.userData.snapshot = c;
    return c;
  };
  return root;
}

/** Family photo: wide gilded frame, sepia photo of the six Eilanders, plaque "the eilander family". */
function makeFamilyPhoto() {
  const W = 0.78, H = 0.64, border = 0.075;
  const root = makeHangingFrame({
    name: 'family_photo', W, H, border, nailDrop: 0.22, attachX: 0.27,
    photo: { key: 'family', w: 1024, h: 776, paint: paintFamilyPhoto },
    plaque: { key: 'family', text: 'the eilander family', w: 0.5, h: 0.056, dy: 0.004 },
  });
  // pickable region over the boy (Jakob) — canvas x ≈ 520..612 of 1024, y ≈ 286..700 of 776
  const pw = W - border * 2 + 0.004, ph = H - border * 2 + 0.004;
  const cy = -0.22 - H / 2;
  const u0 = 520 / 1024, u1 = 612 / 1024, v0 = 286 / 776, v1 = 700 / 776;
  const jx = -pw / 2 + pw * (u0 + u1) / 2, jy = cy + ph / 2 - ph * (v0 + v1) / 2;
  hitBox(pw * (u1 - u0), ph * (v1 - v0), 0.02, jx, jy, 0.02, 'photo_jakob', root).userData.pickProxy = true;
  return root;
}

/** Caroline's portrait: smaller gilded frame, painted bust in a striped bonnet, plaque "CAROLINE EILANDER". */
function makePortraitCaroline() {
  return makeHangingFrame({
    name: 'portrait_caroline', W: 0.6, H: 0.76, border: 0.065, nailDrop: 0.21, attachX: 0.2,
    photo: { key: 'caroline', w: 512, h: 680, paint: paintPortrait },
    plaque: { key: 'caroline', text: 'CAROLINE EILANDER', w: 0.38, h: 0.046, dy: 0.002 },
  });
}

// ===========================================================================================
// shed_door
// ===========================================================================================

const SHED = { leafW: 0.76, leafH: 2.0, t: 0.05, boltY: 1.0, slide: 0.19, openAngle: 1.0 };

function paintShedLeaf(g, W, H) {
  const r = rng(71);
  g.fillStyle = '#b4b1aa'; g.fillRect(0, 0, W, H);
  grain(g, W, H, r, { n: 26, col: 'rgba(70,68,62,0.35)', wobble: 4, lw: [1, 2] });
  const rail = (y0, y1) => {
    g.fillStyle = '#b9b6af'; g.fillRect(0, y0, W, y1 - y0);
    g.save(); g.beginPath(); g.rect(0, y0, W, y1 - y0); g.clip();
    grain(g, W, H, r, { n: 6, col: 'rgba(70,68,62,0.35)', vertical: false, wobble: 2 });
    g.restore();
    g.fillStyle = '#121212'; g.fillRect(0, y0 - 3, W, 6); g.fillRect(0, y1 - 3, W, 6);
  };
  rail(0, H * 0.075);
  rail(H * 0.865, H * 0.945);
  g.fillStyle = 'rgba(40,40,38,0.25)'; g.fillRect(0, 0, 10, H); g.fillRect(W - 14, 0, 14, H);
  g.fillStyle = '#121212'; g.fillRect(0, 0, 4, H); g.fillRect(W - 4, 0, 4, H);
}

function paintPadlockFace(g, W, H) {
  g.fillStyle = '#d6a92c'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,240,170,0.35)'; g.fillRect(0, 0, W * 0.25, H);
  // ornate escutcheon plate
  g.fillStyle = '#c8961f';
  g.beginPath();
  const cx = W / 2, cy = H / 2;
  g.moveTo(cx, cy - H * 0.36);
  g.quadraticCurveTo(cx + W * 0.16, cy - H * 0.36, cx + W * 0.18, cy - H * 0.22);
  g.quadraticCurveTo(cx + W * 0.3, cy - H * 0.2, cx + W * 0.28, cy);
  g.quadraticCurveTo(cx + W * 0.3, cy + H * 0.2, cx + W * 0.18, cy + H * 0.22);
  g.quadraticCurveTo(cx + W * 0.16, cy + H * 0.36, cx, cy + H * 0.36);
  g.quadraticCurveTo(cx - W * 0.16, cy + H * 0.36, cx - W * 0.18, cy + H * 0.22);
  g.quadraticCurveTo(cx - W * 0.3, cy + H * 0.2, cx - W * 0.28, cy);
  g.quadraticCurveTo(cx - W * 0.3, cy - H * 0.2, cx - W * 0.18, cy - H * 0.22);
  g.quadraticCurveTo(cx - W * 0.16, cy - H * 0.36, cx, cy - H * 0.36);
  g.fill(); inkStroke(g, 4, '#3b2a08');
  // keyhole
  g.fillStyle = '#120d05';
  g.beginPath(); g.arc(cx, cy - H * 0.06, W * 0.07, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(cx - W * 0.035, cy - H * 0.05); g.lineTo(cx + W * 0.035, cy - H * 0.05); g.lineTo(cx + W * 0.05, cy + H * 0.15); g.lineTo(cx - W * 0.05, cy + H * 0.15); g.closePath(); g.fill();
}

/** Pale grey plank double door with copper bolt, hasp and brass padlock. Origin = ground centre of the doorway, front +z. */
function makeShedDoor() {
  const root = group({ name: 'shed_door' });
  const { leafW: LW, leafH: LH, t: T, boltY: BY } = SHED;
  const leafFront = toonTex('shedLeaf', 384, 1010, paintShedLeaf);
  const plain = once('mat:shedSide', () => toon('#a8a59e'));
  const leafGeo = once('geo:shedLeaf', () => frontBox(LW - 0.006, LH, T, 0.008));
  // frame (jambs + header)
  const frame = group({ name: 'shed_frame', parent: root });
  const frameM = once('mat:shedFrame', () => toon('#ffffff', { map: tex.planks({ base: '#a9a69e', count: 2, seed: 8 }) }));
  for (const sx of [-1, 1]) mesh(rbox(0.12, LH + 0.12, 0.08, 0.01), frameM, { x: sx * (LW + 0.06), y: (LH + 0.12) / 2, z: 0.01, parent: frame });
  mesh(rbox(2 * LW + 0.24, 0.12, 0.08, 0.01), frameM, { y: LH + 0.06, z: 0.01, parent: frame });
  bake(frame);

  const doors = group({ name: 'shed_doors', parent: root });
  const leafL = group({ name: 'shed_door_l', x: -LW, parent: doors });
  const leafR = group({ name: 'shed_door_r', x: LW, parent: doors });
  mesh(leafGeo, [leafFront, plain], { x: LW / 2, y: LH / 2, z: T / 2, parent: leafL });
  mesh(leafGeo, [leafFront, plain], { x: -LW / 2, y: LH / 2, z: T / 2, parent: leafR });
  const copper = once('mat:copper', () => toon(C.copper));
  const steel = once('mat:staple', () => toon(C.staple));
  const zf = T + 0.012;
  // staples: one on the left leaf for the bolt + one for the padlock; two on the right leaf
  const stapleGeo = rbox(0.022, 0.05, 0.026, 0.004);
  mesh(stapleGeo, steel, { x: -0.127 + LW, y: BY, z: zf, parent: leafL });
  mesh(rbox(0.018, 0.045, 0.02, 0.004), steel, { name: 'padlock_staple', x: -0.088 + LW, y: BY - 0.045, z: T + 0.006, parent: leafL });
  for (const x of [0.082, 0.307]) mesh(stapleGeo, steel, { x: x - LW, y: BY, z: zf, parent: leafR });
  // bolt (slides +x, mounted on the right leaf)
  const bolt = group({ name: 'shed_bolt', parent: leafR });
  const boltX0 = (-0.168 + 0.4) / 2;
  mesh(rbox(0.568, 0.026, 0.018, 0.006), copper, { x: boltX0 - LW, y: BY, z: zf - 0.004, parent: bolt });
  mesh(rbox(0.016, 0.036, 0.016, 0.004), copper, { x: 0.11 - LW, y: BY - 0.022, z: zf, parent: bolt });   // knob
  const haspHinge = group({ name: 'shed_hasp', x: -0.09 - LW, y: BY - 0.004, z: zf + 0.008, parent: bolt });
  const hs = new THREE.Shape();
  hs.moveTo(-0.026, 0.0); hs.lineTo(0.026, 0.0); hs.lineTo(0.026, -0.05);
  hs.quadraticCurveTo(0.026, -0.078, 0, -0.078); hs.quadraticCurveTo(-0.026, -0.078, -0.026, -0.05); hs.lineTo(-0.026, 0);
  const slot = new THREE.Path();
  slot.moveTo(-0.007, -0.03); slot.lineTo(-0.007, -0.062); slot.lineTo(0.007, -0.062); slot.lineTo(0.007, -0.03); slot.lineTo(-0.007, -0.03);
  hs.holes.push(slot);
  mesh(new THREE.ExtrudeGeometry(hs, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 }), copper, { parent: haspHinge });
  hitBox(0.6, 0.09, 0.06, boltX0 - LW, BY, zf, 'shed_bolt_hit', bolt);
  // padlock (hangs from the staple through the hasp)
  const padlock = group({ name: 'padlock', x: -0.088 + LW, y: BY - 0.07, z: T + 0.03, parent: leafL });
  const shackle = mesh(new THREE.TorusGeometry(0.028, 0.0065, 8, 20, Math.PI), once('mat:shackle', () => toon('#9a9b98')), { name: 'padlock_shackle', y: -0.012, parent: padlock });
  const lockFace = toonTex('padlockFace', 128, 160, paintPadlockFace);
  mesh(frontBox(0.11, 0.135, 0.04, 0.012), [lockFace, once('mat:brass', () => toon('#c99c25'))], { name: 'padlock_body', y: -0.08, parent: padlock });
  hitBox(0.14, 0.2, 0.08, 0, -0.07, 0, 'padlock_hit', padlock);
  hitBox(2 * LW, LH, 0.08, 0, LH / 2, 0.04, 'shed_doors_hit', doors);

  let unlocked = false, slid = false, opened = false;
  root.isUnlocked = () => unlocked; root.isBoltSlid = () => slid; root.isOpen = () => opened;

  /** unlock() — shackle pops, the padlock drops away and vanishes, the hasp flips up. */
  root.unlock = (o) => {
    unlocked = true;
    const y0 = BY - 0.07;
    return run(opt(o).instant, 900, (k) => {
      const t = k * 900;
      shackle.position.y = -0.012 + 0.016 * outCubic(seg(t, 0, 140));
      const fall = seg(t, 160, 620);
      padlock.position.y = y0 - 0.45 * fall * fall;
      padlock.rotation.z = 0.7 * fall;
      padlock.position.z = T + 0.03 + 0.08 * fall;
      padlock.visible = t < 600;
      haspHinge.rotation.x = -Math.PI * Ease.inOutSine(seg(t, 420, 900));
    }, Ease.linear);
  };
  /** slideBolt() — the bolt slides right, out of the left leaf's staple. */
  root.slideBolt = (o) => {
    slid = true;
    return run(opt(o).instant, 520, (e) => { bolt.position.x = SHED.slide * e; }, Ease.inOutSine);
  };
  /** open() — both leaves swing outwards (towards +z). */
  root.open = (o) => {
    opened = true;
    return run(opt(o).instant, 1100, (e) => { leafL.rotation.y = -SHED.openAngle * e; leafR.rotation.y = SHED.openAngle * e; }, Ease.inOutSine);
  };
  return root;
}

// ===========================================================================================
// FACTORIES
// ===========================================================================================

export const FACTORIES = {
  leech: () => makeLeech(),
  jug: () => makeJug(0),
  jug_blood: () => { const j = makeJug(1); j.name = 'jug_blood'; return j; },
  key: () => makeKey(),
  wine_glass: () => makeWineGlass(),
  pump: () => makePump(),
  bucket: () => makeBucket(),
  owl_totem: () => makeOwlTotem(),
  dining_table: () => makeDiningTable(),
  plate_prawn: () => makePlatePrawn(),
  high_chair: () => makeHighChair(),
  cabinet: () => makeCabinet(),
  family_photo: () => makeFamilyPhoto(),
  portrait_caroline: () => makePortraitCaroline(),
  shed_door: () => makeShedDoor(),
};
