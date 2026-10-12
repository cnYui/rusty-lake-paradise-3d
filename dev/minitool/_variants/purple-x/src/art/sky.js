// Exterior sky: painted sky dome, painted panorama backdrop ring (mountains / meadows / conifer
// shore / tiny pink houses), a few real low-poly hills at mid distance for parallax, scene fog
// (lake haze ⇄ dark forest fog ⇄ white intro fog) and the exterior lights (overcast hemisphere +
// soft sun with ONE 2048 shadow map that follows the camera focus).
//
// buildSky(scene) → { group, setFog(density01, { ms }) → Promise, update(dt, t, camera, forestK),
//                     fog, sun, hemi, fogState }
// Azimuth convention used everywhere in this file: θ in degrees, 0 = north (−z), 90 = east (+x).
import * as THREE from 'three';
import { rng, noOutline } from './materials.js';
import { animate, Ease } from '../core/tween.js';

// ---------------------------------------------------------------------------
// Small seeded noise helpers (shared with island.js / lake.js).
export function makeNoise2(seed = 1) {
  const r = rng(seed);
  const perm = new Uint16Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const h = (x, y) => vals[perm[(perm[x & 255] + y) & 511]];
  return function noise(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const tx = x - x0, ty = y - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}
export function fbm2(noise, x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
/**
 * Canvas whose 2D context is CPU-rasterised (willReadFrequently). Heavily painted canvases on a
 * GPU-accelerated context defer all their strokes to the first texture upload, which takes minutes
 * under SwiftShader (headless tests) — CPU raster is fast everywhere.
 */
export function cpuCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  return { canvas, g };
}
/** Same contract as materials.canvasTexture but on a CPU canvas. */
export function cpuTexture(w, h, draw, { repeat, srgb = true, wrap = true, anisotropy = 4 } = {}) {
  const { canvas, g } = cpuCanvas(w, h);
  draw(g, w, h);
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}
export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;

// ---------------------------------------------------------------------------
// Constants
export const RING_R = 1200;          // panorama ring radius (m)
const RING_Y0 = -12, RING_Y1 = 388;   // ring bottom / top (m)
const RING_SEGS = 6;                  // 6 canvases of 2048×1024, 60° each
const SEG_W = 2048, SEG_H = 1024;
const CIRC = 2 * Math.PI * RING_R;
const SX = SEG_W / (CIRC / RING_SEGS); // px per metre (horizontal)
const SY = SEG_H / (RING_Y1 - RING_Y0); // px per metre (vertical)

const HAZE = new THREE.Color('#dce3e4');
const FOREST = new THREE.Color('#1a1b19');
const WHITE = new THREE.Color('#e7eaea');
const FOG_OUT = { near: 110, far: 1700 };
const FOG_FOREST = { near: 9, far: 46 };
const FOG_WHITE = { near: 0, far: 42 };
const FOG_OFF = { near: 1e6, far: 2e6 };

// Sun disc in the painted sky (pale white dot north above the mountains, f_0019 / f_0341).
const SUN_AZ = -4, SUN_EL = 9.5;

// ---------------------------------------------------------------------------
export function buildSky(scene) {
  const group = new THREE.Group();
  group.name = 'sky';

  const shared = {
    uFog: { value: 0 },
    uFogColor: { value: WHITE.clone() },
  };

  group.add(makeDome(shared));
  const ring = makeRing(shared);
  group.add(ring);
  group.add(makeHills());

  // ---------------- lights ----------------
  const hemi = new THREE.HemisphereLight('#e8eef0', '#6d6a61', 1.75);
  hemi.name = 'exterior_hemi';
  hemi.position.set(0, 50, 0);
  const sun = new THREE.DirectionalLight('#fff3e2', 1.45);
  sun.name = 'exterior_sun';
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 5; sc.far = 320;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  sun.target.name = 'exterior_sun_target';
  group.add(hemi, sun, sun.target);
  const SUN_DIR = new THREE.Vector3(0.42, 0.78, 0.46).normalize(); // from south-east, high
  sun.position.copy(SUN_DIR).multiplyScalar(140);

  // ---------------- fog ----------------
  const fog = new THREE.Fog(HAZE.clone(), FOG_OUT.near, FOG_OUT.far);
  scene.fog = fog;
  // fogState is read by lake.js (the lake applies the outdoor fog itself, never the dark forest fog)
  const fogState = {
    amount: 0,           // white intro fog 0..1
    forestK: 0,          // 0 outside … 1 deep in the forest
    enabled: true,       // false while an interior zone is shown
    outColor: HAZE.clone(), outNear: FOG_OUT.near, outFar: FOG_OUT.far,
  };

  function applyFog() {
    const a = fogState.amount, k = fogState.forestK;
    // outdoor fog (no forest) – also used by the lake shader
    fogState.outColor.copy(HAZE).lerp(WHITE, Math.min(1, a * 1.15));
    fogState.outNear = lerp(FOG_OUT.near, FOG_WHITE.near, Math.pow(a, 0.35));
    fogState.outFar = lerp(FOG_OUT.far, FOG_WHITE.far, Math.pow(a, 0.35));
    if (!fogState.enabled) { fog.near = FOG_OFF.near; fog.far = FOG_OFF.far; return; }
    const kk = k * (1 - a);
    fog.color.copy(fogState.outColor).lerp(FOREST, kk);
    fog.near = lerp(fogState.outNear, FOG_FOREST.near, kk);
    fog.far = lerp(fogState.outFar, FOG_FOREST.far, kk);
    shared.uFog.value = Math.min(1, a * 1.02) * 0.97;
    shared.uFogColor.value.copy(WHITE);
  }
  applyFog();

  function setFog(density01, { ms = 0 } = {}) {
    const from = fogState.amount, to = Math.max(0, Math.min(1, density01));
    if (!ms) { fogState.amount = to; applyFog(); return Promise.resolve(); }
    return animate(ms, (k) => { fogState.amount = from + (to - from) * k; applyFog(); }, Ease.inOutSine);
  }

  // ---------------- per frame ----------------
  const fwd = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const texel = (sc.right - sc.left) / 2048;
  function update(dt, t, camera, forestK = 0) {
    fogState.forestK = forestK;
    applyFog();
    if (!camera) return;
    // shadow frustum follows the point the camera looks at (ray → ground), snapped to texels
    camera.getWorldDirection(fwd);
    let dist = 30;
    if (fwd.y < -0.004) dist = (camera.position.y - 0.5) / -fwd.y;
    dist = Math.min(115, Math.max(6, dist));
    focus.copy(camera.position).addScaledVector(fwd, dist);
    focus.x = Math.round(focus.x / texel) * texel;
    focus.z = Math.round(focus.z / texel) * texel;
    focus.y = 0.5;
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(SUN_DIR, 160);
  }

  return { group, setFog, update, fog, sun, hemi, fogState, ring };
}

// ---------------------------------------------------------------------------
// Sky dome: gradient + painted soft clouds + pale sun disc. Infinite-distance look (uses view dir).
function makeDome(shared) {
  const clouds = paintClouds();
  const sunDir = dirFromAzEl(SUN_AZ, SUN_EL);
  const mat = new THREE.ShaderMaterial({
    name: 'SkyDome',
    uniforms: {
      tClouds: { value: clouds },
      cTop: { value: new THREE.Color('#a6cde3') },
      cMid: { value: new THREE.Color('#c3e3f3') },
      cHor: { value: new THREE.Color('#dcecf0') },
      uSunDir: { value: sunDir },
      uFog: shared.uFog,
      uFogColor: shared.uFogColor,
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vDir = wp.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tClouds;
      uniform vec3 cTop, cMid, cHor, uSunDir, uFogColor;
      uniform float uFog;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float el = d.y;
        float az = atan(d.x, -d.z);
        vec3 col = mix(cHor, cMid, smoothstep(0.0, 0.16, el));
        col = mix(col, cTop, smoothstep(0.2, 0.85, el));
        vec2 cuv = vec2(az / 6.2831853 + 0.5, clamp(el / 0.62, 0.0, 1.0));
        vec4 cl = texture2D(tClouds, cuv);
        col = mix(col, cl.rgb, cl.a * smoothstep(0.0, 0.05, el));
        float s = max(dot(d, uSunDir), 0.0);
        col = mix(col, vec3(1.0, 0.99, 0.96), smoothstep(0.99985, 0.99995, s) * 0.85);
        col += vec3(0.07, 0.065, 0.06) * pow(s, 60.0);
        col = mix(col, cHor, smoothstep(0.0, -0.04, el));
        col = mix(col, uFogColor, uFog);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  noOutline(mat);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), mat);
  dome.name = 'sky_dome';
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  return dome;
}

function dirFromAzEl(az, el) {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

function paintClouds() {
  const W = 2048, H = 512;
  const { canvas, g } = cpuCanvas(W, H);
  const r = rng(77);
  // row 0 = elevation 0.62 rad, row H = horizon
  const blob = (x, y, rx, ry, a, col) => {
    for (const ox of [-W, 0, W]) {
      const cx = x + ox;
      if (cx + rx < 0 || cx - rx > W) continue;
      g.save();
      g.translate(cx, y); g.scale(rx / ry, 1);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, ry);
      grd.addColorStop(0, `rgba(${col},${a})`);
      grd.addColorStop(0.55, `rgba(${col},${a * 0.55})`);
      grd.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = grd;
      g.fillRect(-ry, -ry, ry * 2, ry * 2);
      g.restore();
    }
  };
  // long soft wisps, flatter towards the horizon (perspective)
  for (let i = 0; i < 70; i++) {
    const y = H * (0.18 + r() * 0.8);
    const flat = 0.35 + (y / H) * 0.9;
    const rx = 60 + r() * 220;
    const ry = (10 + r() * 26) / flat;
    blob(r() * W, y, rx, Math.max(6, ry * 0.6), 0.18 + r() * 0.25, '240,246,248');
  }
  // greyer cloud bands low on the sky (overcast look in f_0008 / f_0019)
  for (let i = 0; i < 40; i++) {
    const y = H * (0.62 + r() * 0.34);
    blob(r() * W, y, 90 + r() * 260, 6 + r() * 12, 0.12 + r() * 0.16, '196,210,218');
  }
  for (let i = 0; i < 26; i++) {
    const y = H * (0.25 + r() * 0.45);
    blob(r() * W, y, 70 + r() * 160, 12 + r() * 22, 0.1 + r() * 0.12, '170,192,206');
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------------------------------------------------------------------------
// Panorama ring: 6 open cylinder segments, each with its own painted 2048×1024 canvas.
function makeRing(shared) {
  const group = new THREE.Group();
  group.name = 'panorama';
  const pano = makePanoramaPainter();
  const cols = 24;
  for (let k = 0; k < RING_SEGS; k++) {
    const { canvas, g } = cpuCanvas(SEG_W, SEG_H);
    pano.paint(g, k);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    map.generateMipmaps = true;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;

    const pos = [], uv = [], idx = [];
    const th0 = (k * 360) / RING_SEGS, th1 = ((k + 1) * 360) / RING_SEGS;
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const th = THREE.MathUtils.degToRad(th0 + (th1 - th0) * u);
      const x = Math.sin(th) * RING_R, z = -Math.cos(th) * RING_R;
      pos.push(x, RING_Y0, z, x, RING_Y1, z);
      uv.push(u, 0, u, 1);
    }
    for (let i = 0; i < cols; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      name: 'PanoramaRing',
      uniforms: { map: { value: map }, uFog: shared.uFog, uFogColor: shared.uFogColor },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map; uniform float uFog; uniform vec3 uFogColor;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(map, vUv);
          if (c.a < 0.004) discard;
          gl_FragColor = vec4(mix(c.rgb, uFogColor, uFog), c.a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });
    noOutline(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `panorama_${k}`;
    mesh.renderOrder = -900;
    group.add(mesh);
  }
  return group;
}

// The painter works in world metres: X = arc length along the ring (0 … CIRC, θ = X/CIRC·360),
// Y = height above the lake (m). Each segment draws every feature that overlaps it, so the
// panorama is seamless (features are generated per index with their own seeded RNG).
function makePanoramaPainter() {
  const n1 = makeNoise2(11), n2 = makeNoise2(23), n3 = makeNoise2(37), n4 = makeNoise2(51);
  const TAU = Math.PI * 2;
  const thOf = (X) => (X / CIRC) * 360;
  const XofTh = (th) => (((th % 360) + 360) % 360) / 360 * CIRC;
  // periodic 1-D noise: sample 2-D noise on a circle
  const pn = (noise, X, cyc, oct = 4) => {
    const a = (X / CIRC) * TAU, rad = cyc / TAU;
    return fbm2(noise, 50 + Math.cos(a) * rad, 50 + Math.sin(a) * rad, oct);
  };
  const ridged = (noise, X, cyc) => {
    const a = (X / CIRC) * TAU;
    let s = 0, amp = 0.55, f = cyc / TAU, tot = 0;
    for (let o = 0; o < 5; o++) {
      const v = noise(80 + Math.cos(a) * f, 80 + Math.sin(a) * f);
      const rr = 1 - Math.abs(2 * v - 1);
      s += amp * rr * rr; tot += amp; amp *= 0.5; f *= 2.1;
    }
    return s / tot;
  };
  // angular distance in degrees (signed, −180…180)
  const dTh = (th, c) => ((th - c + 540) % 360) - 180;
  const bump = (th, c, w, steep = 1) => {
    const d = Math.abs(dTh(th, c)) / w;
    if (d >= 1) return 0;
    const k = 1 - d;
    return Math.pow(smooth(0, 1, k), steep);
  };

  // ---- profiles (heights in metres above the waterline) ----
  const hFar = (X) => 120 + 150 * ridged(n1, X, 34) + 40 * pn(n2, X, 9);
  const massif = (X) => {
    const th = thOf(X);
    const mW = bump(th, -55, 24, 0.55) * (250 + 40 * pn(n3, X, 60, 3));      // big grey massif W-NW
    const mSW = bump(th, 214, 17, 0.6) * (170 + 30 * pn(n3, X, 50, 3));      // second one SSW
    const mE = bump(th, 96, 13, 0.8) * 70;
    return Math.max(mW, mSW) + mE;
  };
  const hMain = (X) => {
    const th = thOf(X);
    const base = 55 + 115 * ridged(n2, X, 46) + 25 * pn(n4, X, 12);
    const jag = 12 * ridged(n4, X, 260);
    return base + massif(X) + jag - 30 * bump(th, 10, 18, 1.2); // lower range behind the island (north)
  };
  const hHills = (X) => 22 + 42 * pn(n3, X, 30, 4) + 18 * ridged(n1, X, 120);
  const hMeadow = (X) => 9 + 26 * pn(n4, X, 22, 4);
  const hForest = (X) => 5 + 4.5 * pn(n1, X, 70, 3);
  const tallSpruce = (X) => {
    const th = thOf(X);
    return Math.max(bump(th, 30, 22, 1), bump(th, 102, 14, 1), bump(th, -14, 10, 1) * 0.7,
      bump(th, 178, 18, 1) * 0.8, bump(th, 248, 16, 1));
  };

  const houses = [
    { th: 5, w: 16, h: 7.5, roof: 6.2, wall: '#cbb3ab', roofCol: '#ad87be' },
    { th: 51, w: 12, h: 6.5, roof: 5, wall: '#c8b1a8', roofCol: '#a57cb8' },
    { th: 157, w: 13, h: 6.5, roof: 5.4, wall: '#cdb4ab', roofCol: '#ab84bd' },
  ];

  function paint(g, seg) {
    const segLen = CIRC / RING_SEGS;
    const X0 = seg * segLen, X1 = X0 + segLen;
    const M = 40; // margin in metres
    g.clearRect(0, 0, SEG_W, SEG_H);
    g.setTransform(SX, 0, 0, -SY, -X0 * SX, RING_Y1 * SY);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // iterate features at X positions with wrap-around
    const each = (step, fn, seed) => {
      const i0 = Math.floor((X0 - M) / step), i1 = Math.ceil((X1 + M) / step);
      const nTot = Math.round(CIRC / step);
      for (let i = i0; i <= i1; i++) {
        const ii = ((i % nTot) + nTot) % nTot;
        const r = rng(seed * 7919 + ii * 104729 + 13);
        fn(i * step + r() * step * 0.8, r);
      }
    };
    const silhouette = (prof, yBottom = -12) => {
      g.beginPath();
      g.moveTo(X0 - M, yBottom);
      for (let X = X0 - M; X <= X1 + M; X += 1.5) g.lineTo(X, prof(X));
      g.lineTo(X1 + M, yBottom);
      g.closePath();
    };
    const vgrad = (y0, y1, stops) => {
      const grd = g.createLinearGradient(0, y0, 0, y1);
      for (const [k, c] of stops) grd.addColorStop(k, c);
      return grd;
    };
    const slopeAt = (prof, X) => (prof(X + 3) - prof(X - 3)) / 6;

    // ----- 1. far range: hazy blue-violet
    silhouette(hFar);
    g.fillStyle = vgrad(0, 280, [[0, '#c9d1d6'], [0.35, '#aeb3c0'], [0.7, '#a3a6b5'], [1, '#b4b6c2']]);
    g.fill();
    g.save(); silhouette(hFar); g.clip();
    each(5, (X, r) => {
      const top = hFar(X); const s = slopeAt(hFar, X);
      const len = top * (0.15 + r() * 0.35);
      const dir = s > 0 ? -1 : 1;
      g.strokeStyle = `rgba(120,122,140,${0.18 + r() * 0.2})`; g.lineWidth = 1.5 + r() * 2;
      g.beginPath(); g.moveTo(X, top); g.lineTo(X + dir * len * (0.25 + r() * 0.4), top - len); g.stroke();
      g.strokeStyle = `rgba(220,222,232,${0.15 + r() * 0.2})`; g.lineWidth = 2 + r() * 3;
      g.beginPath(); g.moveTo(X - 2, top - 1); g.lineTo(X - 2 + dir * len * 0.3, top - len * 0.7); g.stroke();
    }, 1);
    g.fillStyle = vgrad(0, 160, [[0, 'rgba(225,232,235,0.75)'], [1, 'rgba(225,232,235,0)']]);
    g.fillRect(X0 - M, -12, segLen + 2 * M, 172);
    g.restore();

    // ----- 2. main rocky range + massifs
    paintRock(hMain, 2, { base: ['#a8a2ab', '#928d98', '#857f8b'], light: '226,222,228', dark: '88,82,96', snow: true });

    // ----- 3. rocky foothills (greyer, greenish at the base)
    paintRock(hHills, 3, { base: ['#9ea097', '#8f9189', '#9a9a92'], light: '214,214,206', dark: '92,94,90', snow: false, small: true });
    // greenish patches on the hills
    g.save(); silhouette(hHills); g.clip();
    each(7, (X, r) => {
      const top = hHills(X);
      const y = top * (0.1 + r() * 0.6);
      g.fillStyle = r() < 0.5 ? `rgba(150,160,108,${0.25 + r() * 0.3})` : `rgba(118,130,96,${0.2 + r() * 0.3})`;
      g.beginPath(); g.ellipse(X, y, 6 + r() * 14, 2 + r() * 5, 0, 0, TAU); g.fill();
    }, 4);
    g.restore();
    // mist band between rock and meadows
    g.fillStyle = vgrad(4, 70, [[0, 'rgba(226,232,232,0.55)'], [0.5, 'rgba(226,232,232,0.28)'], [1, 'rgba(226,232,232,0)']]);
    g.fillRect(X0 - M, 4, segLen + 2 * M, 66);

    // ----- 4. meadows: yellow-green slopes
    silhouette(hMeadow);
    g.fillStyle = vgrad(0, 36, [[0, '#8f9670'], [0.5, '#a4a676'], [1, '#b2b27f']]);
    g.fill();
    g.save(); silhouette(hMeadow); g.clip();
    const meadowCols = ['182,182,126', '157,160,108', '194,192,138', '143,150,99', '168,171,115', '120,132,92'];
    each(1.6, (X, r) => {
      const top = hMeadow(X);
      const y = r() * top;
      g.strokeStyle = `rgba(${meadowCols[(r() * meadowCols.length) | 0]},${0.3 + r() * 0.35})`;
      g.lineWidth = 0.8 + r() * 1.6;
      const L = 4 + r() * 12;
      g.beginPath(); g.moveTo(X - L / 2, y); g.lineTo(X + L / 2, y + (r() - 0.5) * 2); g.stroke();
    }, 5);
    each(4, (X, r) => { // dark copses on the meadow
      const top = hMeadow(X);
      if (r() < 0.45) return;
      const y = top * (0.25 + r() * 0.6);
      g.fillStyle = `rgba(78,92,72,${0.45 + r() * 0.35})`;
      const n = 1 + ((r() * 4) | 0);
      for (let j = 0; j < n; j++) {
        const x = X + (r() - 0.5) * 8, h = 3 + r() * 5;
        g.beginPath(); g.moveTo(x - 1.2, y); g.lineTo(x, y + h); g.lineTo(x + 1.2, y); g.closePath(); g.fill();
      }
    }, 6);
    g.restore();

    // ----- 5. conifer forest band along the shore
    silhouette(hForest);
    g.fillStyle = vgrad(0, 10, [[0, '#56605a'], [1, '#4c5650']]);
    g.fill();
    each(1.7, (X, r) => {
      const base = hForest(X) - 2 - r() * 2;
      const tall = tallSpruce(X);
      const h = 4 + r() * 7 + tall * (6 + r() * 16);
      const w = 1.6 + r() * 1.6 + h * 0.08;
      const c = 60 + ((r() * 26) | 0);
      g.fillStyle = `rgb(${c - 6},${c + 8},${c})`;
      g.beginPath();
      g.moveTo(X - w, base); g.lineTo(X - w * 0.3, base + h * 0.55); g.lineTo(X, base + h);
      g.lineTo(X + w * 0.3, base + h * 0.55); g.lineTo(X + w, base); g.closePath(); g.fill();
      g.strokeStyle = `rgba(150,160,150,${0.15 + r() * 0.2})`; g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(X + w * 0.15, base + h * 0.9); g.lineTo(X + w * 0.75, base + h * 0.1); g.stroke();
    }, 7);
    // lighter haze over the forest foot + shore line
    g.fillStyle = vgrad(-2, 9, [[0, 'rgba(205,214,212,0.55)'], [1, 'rgba(205,214,212,0)']]);
    g.fillRect(X0 - M, -2, segLen + 2 * M, 11);

    // ----- 6. tiny pink-roofed houses on the shore
    for (const hs of houses) {
      for (const off of [-CIRC, 0, CIRC]) {
        const X = XofTh(hs.th) + off;
        if (X < X0 - M || X > X1 + M) continue;
        drawHouse(X, hs);
      }
    }

    // ----- 7. shoreline + water below the waterline (hidden by the lake, but avoids gaps)
    g.fillStyle = '#9ea69f';
    g.fillRect(X0 - M, -0.6, segLen + 2 * M, 1.2);
    g.fillStyle = '#c3c8ca';
    g.fillRect(X0 - M, -12, segLen + 2 * M, 11.4);

    // ---------- helpers ----------
    function paintRock(prof, seed, o) {
      silhouette(prof);
      g.fillStyle = vgrad(0, 300, [[0, o.base[2]], [0.3, o.base[1]], [1, o.base[0]]]);
      g.fill();
      g.save(); silhouette(prof); g.clip();
      // descending creases with a lit edge on the left (light from the west / front)
      each(o.small ? 4 : 3.2, (X, r) => {
        const top = prof(X);
        const s = slopeAt(prof, X);
        const len = top * (0.25 + r() * 0.6);
        const dir = s > 0.15 ? -1 : s < -0.15 ? 1 : (r() < 0.5 ? -1 : 1);
        const steps = 5;
        let x = X, y = top;
        const ptsX = [x], ptsY = [y];
        for (let k = 0; k < steps; k++) {
          x += dir * (len / steps) * (0.15 + r() * 0.5) + (r() - 0.5) * 2;
          y -= (len / steps) * (0.8 + r() * 0.4);
          ptsX.push(x); ptsY.push(y);
        }
        const line = (dx, w, col) => {
          g.lineWidth = w; g.strokeStyle = col; g.beginPath();
          g.moveTo(ptsX[0] + dx, ptsY[0]);
          for (let k = 1; k < ptsX.length; k++) g.lineTo(ptsX[k] + dx * (1 - k / ptsX.length * 0.5), ptsY[k]);
          g.stroke();
        };
        // shaded face on the down-slope side, lit face on the other
        line(dir * 2.6, 3 + r() * 5, `rgba(${o.dark},${0.12 + r() * 0.16})`);
        line(-dir * 2.2, 2 + r() * 4, `rgba(${o.light},${0.18 + r() * 0.22})`);
        line(0, 0.8 + r() * 1.2, `rgba(${o.dark},${0.35 + r() * 0.3})`);
      }, seed * 10 + 1);
      // small rock dabs (texture)
      each(o.small ? 1.6 : 1.1, (X, r) => {
        const top = prof(X);
        const y = top * Math.sqrt(r());
        const a = (r() - 0.5) * 1.1 + Math.PI / 2;
        const L = 2 + r() * 6;
        const lit = r() < 0.5;
        g.strokeStyle = lit ? `rgba(${o.light},${0.12 + r() * 0.2})` : `rgba(${o.dark},${0.1 + r() * 0.18})`;
        g.lineWidth = 0.8 + r() * 1.8;
        g.beginPath(); g.moveTo(X, y); g.lineTo(X + Math.cos(a) * L, y - Math.sin(a) * L); g.stroke();
      }, seed * 10 + 2);
      if (o.snow) {
        each(2.2, (X, r) => {
          const top = prof(X);
          if (top < 150) return;
          const n = 2 + ((r() * 3) | 0);
          for (let j = 0; j < n; j++) {
            const y = top - 3 - r() * Math.min(40, top * 0.18);
            g.strokeStyle = `rgba(240,242,244,${0.25 + r() * 0.35})`;
            g.lineWidth = 0.8 + r() * 1.6;
            const L = 2 + r() * 6;
            g.beginPath(); g.moveTo(X + (r() - 0.5) * 6, y); g.lineTo(X + (r() - 0.5) * 6, y - L); g.stroke();
          }
        }, seed * 10 + 3);
      }
      // atmospheric haze at the base
      g.fillStyle = vgrad(0, 120, [[0, 'rgba(222,229,231,0.7)'], [0.6, 'rgba(222,229,231,0.2)'], [1, 'rgba(222,229,231,0)']]);
      g.fillRect(X0 - M, -12, segLen + 2 * M, 132);
      g.restore();
    }

    function drawHouse(X, hs) {
      const y0 = 0.6;
      const w = hs.w, h = hs.h;
      g.fillStyle = hs.wall;
      g.fillRect(X - w / 2, y0, w, h);
      // gable end on the right (darker), roof
      g.fillStyle = '#b39d96';
      g.beginPath(); g.moveTo(X + w / 2, y0); g.lineTo(X + w / 2 + 5, y0); g.lineTo(X + w / 2 + 5, y0 + h); g.lineTo(X + w / 2 + 2.5, y0 + h + hs.roof * 0.7); g.lineTo(X + w / 2, y0 + h); g.closePath(); g.fill();
      g.fillStyle = hs.roofCol;
      g.beginPath(); g.moveTo(X - w / 2 - 0.8, y0 + h); g.lineTo(X - w / 2 + 1.5, y0 + h + hs.roof * 0.7); g.lineTo(X + w / 2 + 2.5, y0 + h + hs.roof * 0.7); g.lineTo(X + w / 2 + 0.6, y0 + h); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(80,60,60,0.5)'; g.lineWidth = 0.4;
      g.stroke();
      // windows + door
      g.fillStyle = 'rgba(70,62,62,0.8)';
      for (let i = 0; i < 3; i++) g.fillRect(X - w / 2 + 2 + i * (w - 4) / 3, y0 + h * 0.5, 1.4, 1.6);
      g.fillRect(X + w * 0.22, y0, 1.6, 2.6);
      // chimney
      g.fillStyle = '#9c8580';
      g.fillRect(X - w * 0.2, y0 + h + 2, 1.2, 3.2);
    }
  }

  return { paint, hMain, hFar, hMeadow, hForest };
}

// ---------------------------------------------------------------------------
// Real low-poly hills at mid distance (parallax). Vertex colours baked with haze.
function makeHills() {
  const group = new THREE.Group();
  group.name = 'mid_hills';
  const defs = [
    { th: 25, r: 430, w: 75, h: 22, d: 50, kind: 'forest', seed: 3 },
    { th: -44, r: 520, w: 150, h: 64, d: 110, kind: 'rock', seed: 5 },
    { th: 78, r: 500, w: 140, h: 40, d: 100, kind: 'meadow', seed: 7 },
    { th: 128, r: 440, w: 110, h: 34, d: 80, kind: 'rock', seed: 9 },
    { th: 196, r: 480, w: 170, h: 52, d: 110, kind: 'meadow', seed: 11 },
    { th: 252, r: 430, w: 120, h: 30, d: 80, kind: 'forest', seed: 13 },
    { th: -12, r: 640, w: 120, h: 30, d: 80, kind: 'meadow', seed: 15 },
  ];
  const haze = new THREE.Color('#d9e0e2');
  const cRock = [new THREE.Color('#8f8a95'), new THREE.Color('#b3adb5'), new THREE.Color('#6f6b78')];
  const cMeadow = [new THREE.Color('#a2a576'), new THREE.Color('#8d9767'), new THREE.Color('#b4b281')];
  const cForest = [new THREE.Color('#4d5850'), new THREE.Color('#5c665c'), new THREE.Color('#434d47')];
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  noOutline(mat);
  const coneGeo = new THREE.ConeGeometry(1, 1, 6, 1);
  coneGeo.translate(0, 0.5, 0);
  const coneMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  noOutline(coneMat);
  const conePlacements = [];
  const tmpC = new THREE.Color();

  for (const d of defs) {
    const noise = makeNoise2(d.seed * 31 + 7);
    const r = rng(d.seed * 17 + 1);
    const geo = new THREE.SphereGeometry(1, 26, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = fbm2(noise, v.x * 2.2 + 10, v.z * 2.2 + 10, 4);
      const rid = 1 - Math.abs(2 * fbm2(noise, v.x * 4 + 3, v.z * 4 + 3, 3) - 1);
      let hy = v.y;
      if (d.kind === 'rock') hy = Math.pow(v.y, 0.8) * (0.7 + 0.6 * rid) + (n - 0.5) * 0.25 * v.y;
      else hy = Math.pow(v.y, 1.2) * (0.8 + 0.4 * n);
      const px = v.x * d.w, pz = v.z * d.d, py = Math.max(0, hy) * d.h - 3;
      pos.setXYZ(i, px, py, pz);
      const hk = Math.max(0, hy);
      let c;
      if (d.kind === 'rock') {
        c = tmpC.copy(cRock[0]).lerp(cRock[rid > 0.6 ? 1 : 2], Math.abs(n - 0.5) * 1.6);
        if (hk < 0.25) c.lerp(cForest[0], 0.6 * (1 - hk / 0.25));
      } else if (d.kind === 'meadow') {
        c = tmpC.copy(cMeadow[0]).lerp(cMeadow[n > 0.5 ? 2 : 1], Math.abs(n - 0.5) * 1.8);
        if (hk > 0.75) c.lerp(cRock[0], (hk - 0.75) * 2.5);
        if (hk < 0.2) c.lerp(cForest[0], 0.7 * (1 - hk / 0.2));
      } else {
        c = tmpC.copy(cForest[0]).lerp(cForest[n > 0.5 ? 1 : 2], Math.abs(n - 0.5) * 1.6);
      }
      c.lerp(haze, 0.28);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      if (d.kind === 'forest' && hk > 0.05 && r() < 0.9) conePlacements.push({ d, px, py, pz, s: 0.6 + r() * 0.8 });
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    const th = THREE.MathUtils.degToRad(d.th);
    mesh.position.set(Math.sin(th) * d.r, 0, -Math.cos(th) * d.r);
    mesh.rotation.y = -th;
    mesh.name = `hill_${d.kind}_${d.th}`;
    mesh.receiveShadow = false;
    group.add(mesh);
    mesh.updateMatrix();
    for (const cp of conePlacements) if (cp.d === d) cp.m = mesh.matrix;
    // extra spruces scattered over forest hills
    if (d.kind === 'forest') {
      for (let i = 0; i < 70; i++) {
        const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.95;
        const lx = Math.cos(a) * rr, lz = Math.sin(a) * rr;
        const ly = Math.max(0, Math.sqrt(Math.max(0, 1 - rr * rr))) ;
        conePlacements.push({ d, px: lx * d.w, py: Math.pow(ly, 1.2) * d.h * 0.9 - 3, pz: lz * d.d, s: 0.7 + r() * 0.9, m: mesh.matrix });
      }
    }
  }
  // conifers along the shore of every hill + over forest hills
  const r2 = rng(991);
  for (const d of defs) {
    const th = THREE.MathUtils.degToRad(d.th);
    const m = new THREE.Matrix4().makeRotationY(-th).setPosition(Math.sin(th) * d.r, 0, -Math.cos(th) * d.r);
    for (let i = 0; i < 40; i++) {
      const a = r2() * Math.PI * 2;
      const rr = 0.9 + r2() * 0.12;
      conePlacements.push({ d, px: Math.cos(a) * rr * d.w, py: -1, pz: Math.sin(a) * rr * d.d, s: 0.5 + r2() * 0.7, m });
    }
  }
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, conePlacements.length);
  cones.name = 'mid_hill_conifers';
  const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const cc = new THREE.Color();
  conePlacements.forEach((cp, i) => {
    const hgt = 9 + cp.s * 11;
    sc.set(hgt * 0.17, hgt, hgt * 0.17);
    p.set(cp.px, cp.py, cp.pz).applyMatrix4(cp.m);
    mm.compose(p, q, sc);
    cones.setMatrixAt(i, mm);
    cc.copy(cForest[i % 3]).lerp(haze, 0.3);
    cones.setColorAt(i, cc);
  });
  cones.instanceMatrix.needsUpdate = true;
  if (cones.instanceColor) cones.instanceColor.needsUpdate = true;
  cones.computeBoundingSphere();
  group.add(cones);
  return group;
}
