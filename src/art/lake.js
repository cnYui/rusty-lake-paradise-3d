// The lake: one large mirror-like water disc (three/addons Reflector at reduced resolution) with a
// custom shader — washed-out reflection mixed with the grey-silver lake colour, slow ripples,
// painterly horizontal streaks, distance haze, and the plague-1 BLOOD MASK:
//   setBlood(0)   clean grey lake
//   setBlood(0.3) irregular pinkish blood stain hugging the island shore (strong on the beach side)
//   setBlood(1)   the whole lake deep blood red (the stain grows outwards with a noisy edge)
//   setPool(true) separate pool of blood at layout P.bloodPool (left of the temple)
// The shore distance field is baked once from layout.ISLAND_OUTLINE into a small DataTexture.
//
// buildLake() → { mesh, material, group, setBlood(a, {ms}) → Promise, setPool(v, {ms}) → Promise,
//                 ripple(x, z, {strength, ms}), update(dt, t, fogState), setSize(w, h), reflect, state }
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { P, LAKE_Y, shoreDistance } from './layout.js';
import { noOutline } from './materials.js';
import { animate, Ease } from '../core/tween.js';

const DIST_RECT = { x0: -119, z0: -116, size: 240, res: 256, dMin: -10, dRange: 100 };

function bakeDistanceTexture() {
  const { x0, z0, size, res, dMin, dRange } = DIST_RECT;
  const data = new Uint8Array(res * res * 4);
  for (let j = 0; j < res; j++) {
    const z = z0 + ((j + 0.5) / res) * size;
    for (let i = 0; i < res; i++) {
      const x = x0 + ((i + 0.5) / res) * size;
      const d = shoreDistance(x, z);
      const v = Math.max(0, Math.min(255, Math.round(((d - dMin) / dRange) * 255)));
      const o = (j * res + i) * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

const LakeShader = {
  name: 'LakeWater',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    tDist: { value: null },
    uDistRect: { value: new THREE.Vector4() },
    uTime: { value: 0 },
    uBlood: { value: 0 },
    uPool: { value: 0 },
    uReflect: { value: 1 },
    uPoolC: { value: new THREE.Vector3() },
    uRipple: { value: new THREE.Vector4(0, 0, -100, 0) },
    cLake: { value: new THREE.Color('#bcc0c4') },
    cLakeNear: { value: new THREE.Color('#b3b7bc') },
    cLakeFar: { value: new THREE.Color('#d2d7d8') },
    cSkyRefl: { value: new THREE.Color('#d5e4ea') },
    cRing1: { value: new THREE.Color('#a85a5a') },
    cRing2: { value: new THREE.Color('#9b7c73') },
    cShore: { value: new THREE.Color('#9a5354') },
    cDeep: { value: new THREE.Color('#7e2424') },
    cPool: { value: new THREE.Color('#a7676a') },
    uFogColor: { value: new THREE.Color('#dce3e4') },
    uFogNear: { value: 110 },
    uFogFar: { value: 1700 },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D tDist;
    uniform vec4 uDistRect;
    uniform float uTime, uBlood, uPool, uReflect, uFogNear, uFogFar;
    uniform vec3 uPoolC;
    uniform vec4 uRipple;
    uniform vec3 cLake, cLakeNear, cLakeFar, cSkyRefl, cRing1, cRing2, cShore, cDeep, cPool, uFogColor;
    varying vec4 vUv;
    varying vec3 vWorld;

    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float s = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
      return s / 0.9375;
    }
    float shoreDist(vec2 p) {
      vec2 uv = (p - uDistRect.xy) / uDistRect.zw;
      float dTex = texture2D(tDist, clamp(uv, 0.0, 1.0)).r * 100.0 - 10.0;
      float dFar = length(p - vec2(1.0, 4.0)) - 44.0;
      vec2 e = min(uv, 1.0 - uv);
      float w = clamp(min(e.x, e.y) * 8.0, 0.0, 1.0);
      return mix(dFar, dTex, w);
    }

    void main() {
      vec2 p = vWorld.xz;
      vec3 toCam = cameraPosition - vWorld;
      float dist = length(toCam);
      vec3 V = toCam / dist;
      float cosT = clamp(V.y, 0.0, 1.0);
      float fres = 0.32 + 0.68 * pow(1.0 - cosT, 3.0);
      float t = uTime;

      // expanding ripple rings (coffin rising etc.)
      float age = t - uRipple.z;
      float rr = length(p - uRipple.xy);
      float ringWave = 0.0;
      if (age > 0.0 && age < 6.0) {
        float front = age * 2.2;
        ringWave = sin((rr - front) * 3.2) * exp(-abs(rr - front) * 0.6) * exp(-age * 0.55) * uRipple.w;
      }

      // ripples → reflection distortion (weaker far away)
      float fade = 1.0 / (1.0 + dist * 0.012);
      vec2 rip = vec2(
        sin(p.x * 0.9 + t * 0.9 + sin(p.y * 0.6 + t * 0.5) * 1.3) + 0.6 * sin(p.y * 1.7 - t * 1.3 + p.x * 0.4),
        sin(p.y * 1.1 - t * 0.7 + sin(p.x * 0.5) * 1.8) + 0.5 * sin(p.x * 2.1 + t * 1.1));
      vec2 ruv = vUv.xy / vUv.w + rip * 0.0024 * fade + vec2(0.0, ringWave * 0.012);
      vec3 refl = texture2D(tDiffuse, ruv).rgb * 0.5;
      refl += texture2D(tDiffuse, ruv + vec2(0.0015, 0.004)).rgb * 0.25;
      refl += texture2D(tDiffuse, ruv - vec2(0.0015, 0.004)).rgb * 0.25;

      // base lake colour: darker close by, pale and misty towards the horizon
      vec3 lakeCol = mix(cLakeNear, cLake, smoothstep(4.0, 70.0, dist));
      lakeCol = mix(lakeCol, cLakeFar, smoothstep(160.0, 900.0, dist));
      float streak = vnoise(vec2(p.x * 0.011, p.y * 0.32 + t * 0.015));
      float streak2 = vnoise(vec2(p.x * 0.04, p.y * 0.9));
      lakeCol *= 0.965 + 0.05 * streak + 0.025 * streak2;

      vec3 reflC = mix(refl, lakeCol, 0.24);
      vec3 fallback = mix(lakeCol, cSkyRefl, 0.35 * fres);
      reflC = mix(fallback, reflC, uReflect);
      vec3 col = mix(lakeCol, reflC, clamp(fres * 0.86, 0.0, 0.9));
      col *= 1.0 - ringWave * 0.08;

      // ---------------- blood ----------------
      float a = uBlood;
      if (a > 0.001) {
        float d = shoreDist(p);
        float n = fbm(p * 0.05 + vec2(3.1, 7.7));
        float n2 = vnoise(p * 0.21 + vec2(t * 0.03, 0.0));
        float southK = smoothstep(-26.0, 44.0, p.y);
        float ringA = smoothstep(0.0, 0.3, a);
        float ringW = ringA * mix(0.6, 15.5, southK) * (0.3 + 1.35 * n);
        float grow = pow(max(a - 0.3, 0.0) / 0.7, 2.2) * 1500.0;
        float edge = ringW + grow - d + (n2 - 0.5) * 2.4;
        float blood = smoothstep(-0.4, 1.8, edge);
        float deepK = smoothstep(0.3, 1.0, a);
        vec3 bc = mix(cRing2, cRing1, smoothstep(0.0, 7.0, edge));
        float shoreK = smoothstep(4.5, 0.6, d) * southK * ringA;
        bc = mix(bc, cShore, shoreK);
        bc = mix(bc, cDeep, deepK);
        float op = mix(0.42 + 0.3 * smoothstep(0.0, 9.0, edge), 0.94, deepK);
        op = max(op, shoreK * 0.95);
        float lum = dot(reflC, vec3(0.3, 0.55, 0.15));
        vec3 bloodCol = bc * (0.8 + 0.35 * lum) * (0.97 + 0.06 * streak);
        col = mix(col, bloodCol, blood * op);
      }
      // separate pool of blood (lakeshore, left of the temple)
      if (uPool > 0.001) {
        vec2 pq = p - uPoolC.xy;
        float pr = length(pq * vec2(0.82, 1.22)) / uPoolC.z;
        float pn = vnoise(p * 0.55) * 0.28 + vnoise(p * 1.6) * 0.1;
        float pool = (1.0 - smoothstep(0.84, 0.95, pr + pn - 0.18)) * uPool;
        float pv = vnoise(p * 0.8 + vec2(t * 0.05, 0.0));
        col = mix(col, cPool * (0.93 + 0.12 * pv), pool);
      }

      // outdoor haze / intro fog (the lake never takes the dark forest fog)
      col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, dist));
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
};

export function buildLake() {
  const geo = new THREE.CircleGeometry(1190, 128);
  const mesh = new Reflector(geo, {
    shader: LakeShader,
    textureWidth: 640,
    textureHeight: 360,
    multisample: 0,
    clipBias: 0.002,
    color: 0xffffff,
  });
  mesh.name = 'lake';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = LAKE_Y;
  mesh.renderOrder = -10;
  const material = mesh.material;
  material.name = 'LakeWater';
  material.fog = false;
  material.toneMapped = false;
  noOutline(material);
  const U = material.uniforms;
  U.tDist.value = bakeDistanceTexture();
  U.uDistRect.value.set(DIST_RECT.x0, DIST_RECT.z0, DIST_RECT.size, DIST_RECT.size);
  U.uPoolC.value.set(P.bloodPool.pos[0], P.bloodPool.pos[2], P.bloodPool.radius);

  const group = new THREE.Group();
  group.name = 'lake_group';
  group.add(mesh);

  const state = { blood: 0, pool: 0, time: 0 };
  const api = {
    mesh, material, group, state,
    reflect: true,          // false → skip the reflection render (world.js turns it off deep in the forest)
    setBlood(amount01, { ms = 0 } = {}) {
      const from = U.uBlood.value, to = Math.max(0, Math.min(1, amount01));
      state.blood = to;
      if (!ms) { U.uBlood.value = to; return Promise.resolve(); }
      return animate(ms, (k) => { U.uBlood.value = from + (to - from) * k; }, Ease.inOutSine);
    },
    setPool(visible, { ms = 0 } = {}) {
      const from = U.uPool.value, to = visible ? 1 : 0;
      state.pool = to;
      if (!ms) { U.uPool.value = to; return Promise.resolve(); }
      return animate(ms, (k) => { U.uPool.value = from + (to - from) * k; }, Ease.inOutSine);
    },
    /** Expanding ripple rings centred at world (x, z), e.g. when the coffin bursts out of the pool. */
    ripple(x, z, { strength = 1 } = {}) {
      U.uRipple.value.set(x, z, state.time, strength);
    },
    setSize(w, h) {
      mesh.getRenderTarget().setSize(Math.max(64, Math.round(w)), Math.max(64, Math.round(h)));
    },
    update(dt, t, fogState) {
      state.time = t;
      U.uTime.value = t;
      if (fogState) {
        U.uFogColor.value.copy(fogState.outColor);
        U.uFogNear.value = fogState.outNear;
        U.uFogFar.value = fogState.outFar;
      }
      U.uReflect.value = api.reflect ? 1 : 0;
    },
  };

  // allow skipping the (expensive) mirror pass when the lake cannot be seen
  const renderReflection = mesh.onBeforeRender;
  mesh.onBeforeRender = function (renderer, scene, camera, ...rest) {
    if (!api.reflect) return;
    renderReflection.call(this, renderer, scene, camera, ...rest);
  };

  api.setBlood(0.3);
  api.setPool(true);
  return api;
}
