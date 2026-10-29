// Paradise island: terrain (beach / forest floor / paths / rocky shore / tower hill / NE lakeshore
// sand), the pointed-log palisade, wooden dock steps, the tall striped forest (merged static
// geometry, cartoon outlines), the pale leafy trees (shore tree, 3 white trees in clearing G, big
// pump tree, 4 huge trunks in clearing H, the curtain trunks of the soul path), bare trees, black
// thorn bushes, rocks (incl. the boulders of the tower hill), and makeSilhouette() for black
// foreground foliage.
//
// buildIsland() → { group, update(dt, t, camera), heightAt(x, z), named: {…}, trunks: [[x, z, r], …] }
// （trunks = 森林树干和阔叶树的根部圆，供室外漫游做碰撞）
// (The stone tower itself is built by buildings.js; this module builds the rocky hill under it.)
// export forestness(x, z) → 0 outside … 1 deep in the forest (drives the dark forest fog)
// export groundHeight(x, z)
// export makeSilhouette(kind = 'branch' | 'leaves' | 'thorns', opts) → Mesh (pure black flat card)
import * as THREE from 'three';
import { toon, flat, noOutline, canvasTexture, rng, tex } from './materials.js';
import { GROUND_Y, PALISADE, SHED_FENCE, P, onIsland, shoreDistance } from './layout.js';
import { makeNoise2, fbm2, smooth, cpuCanvas, cpuTexture } from './sky.js';

const lerp = (a, b, k) => a + (b - a) * k;
const TOWER = P.tower.pos;
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// ===========================================================================
// Ground height & forest field
const hNoise = makeNoise2(404);

export function groundHeight(x, z) {
  const sd = shoreDistance(x, z);
  const beachK = smooth(30, 37, z) * (1 - smooth(19, 25, Math.abs(x - 1)));
  const lakeshoreK = smooth(-22, -27, z) * smooth(10, 16, x);
  const bank = lerp(lerp(2.8, 1.15, beachK), 5.5, lakeshoreK);
  let h;
  if (sd <= -bank) h = GROUND_Y;
  else if (sd <= 0) {
    const k = (sd + bank) / bank;
    h = GROUND_Y - (GROUND_Y + 0.06) * Math.pow(k, lerp(1.25, 1.8, beachK));
  } else h = -0.06 - Math.min(1.7, sd * 0.42);
  // knobbly rocky shore (not on the beach / lakeshore sand)
  const rough = (1 - beachK) * (1 - lakeshoreK) * smooth(-4, -0.5, sd) * smooth(4, 1, sd);
  if (rough > 0) h += rough * (fbm2(hNoise, x * 0.35, z * 0.35, 3) - 0.38) * 0.9;
  // tower hill: a rocky plateau that bulges out into the lake on the west
  const dT = Math.hypot(x - TOWER[0], z - TOWER[2]);
  if (dT < 16) {   // 平台半径 7.5（石塔底面半径 6.8），向外 15 m 缓降入湖
    const hill = -1.2 + (TOWER[1] + 1.2) * smooth(15, 7.5, dT);
    const n = (fbm2(hNoise, x * 0.4 + 30, z * 0.4, 3) - 0.5) * 1.4 * smooth(7.5, 10, dT) * smooth(16, 13, dT);
    h = Math.max(h, hill + n);
  }
  return h;
}

/** 0 outside (beach, lake, lakeshore) … 1 deep in the forest. Used for the dark forest fog. */
export function forestness(x, z) {
  const sd = shoreDistance(x, z);
  return smooth(39.8, 37.6, z) * smooth(-25.5, -23.2, z) * smooth(1.5, -3, sd);
}

// ===========================================================================
// Geometry builder (positions / normals / uvs / colours / indices) for merged static meshes
class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  v(x, y, z, nx, ny, nz, u, w, c = 1, cg = c, cb = c) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, w); this.col.push(c, cg, cb);
    return this.count - 1;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const _d = new THREE.Vector3(), _s = new THREE.Vector3(), _u = new THREE.Vector3(), _o = new THREE.Vector3();
/** Tapered open tube p0 → p1 (radii r0 → r1). */
function addTube(b, p0, p1, r0, r1, { radial = 7, vScale = 3, v0 = 0, c0 = 1, c1 = 1, uRep = 1 } = {}) {
  _d.subVectors(p1, p0);
  const len = _d.length();
  _d.divideScalar(len);
  const up = Math.abs(_d.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  _s.crossVectors(_d, up).normalize();
  _u.crossVectors(_s, _d).normalize();
  const slope = (r0 - r1) / len;
  const base = b.count;
  for (let ring = 0; ring < 2; ring++) {
    const c = ring ? p1 : p0, rr = ring ? r1 : r0, cc = ring ? c1 : c0;
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      _o.copy(_s).multiplyScalar(Math.cos(a)).addScaledVector(_u, Math.sin(a));
      const nx = _o.x + _d.x * slope, ny = _o.y + _d.y * slope, nz = _o.z + _d.z * slope;
      const nl = Math.hypot(nx, ny, nz);
      b.v(c.x + _o.x * rr, c.y + _o.y * rr, c.z + _o.z * rr, nx / nl, ny / nl, nz / nl,
        (i / radial) * uRep, v0 + (ring ? len : 0) / vScale, cc);
    }
  }
  for (let i = 0; i < radial; i++) {
    const a = base + i, bb = a + 1, c = a + radial + 1, d = c + 1;
    b.idx.push(a, c, bb, bb, c, d);
  }
  return len;
}

// ===========================================================================
// Forest trunk: straight, tall, flared buttressed base, pointed top, a few dark branch stubs.
function addTrunk(b, { x, z, R, H, seed, shade = 1, lean = 0.012, buttress = 0.28, canopy = true, stubs = 4, pale = false }) {
  const r = rng(seed);
  const RAD = R > 1 ? 14 : 11;
  const phase = r() * 6.283, lobes = 3 + ((r() * 3) | 0);
  const leanX = (r() - 0.5) * 2 * lean, leanZ = (r() - 0.5) * 2 * lean;
  const y0 = groundHeightCached(x, z);
  const uRep = Math.max(1, Math.round(R * 2.2));
  const ys = [-0.8, 0, 0.18, 0.45, 0.85, 1.5, 2.6, 4.2, 6.5, 9.5, 13, 17, 21.5, 26, 30, 34].filter((y) => y < H * 0.7);
  ys.push(H * 0.7, H * 0.82, H * 0.92, H);
  const radius = (y, a) => {
    const yy = Math.max(0, y);
    let rr = R * (1 + 0.62 * Math.exp(-yy / 0.55));
    rr *= 1 + buttress * Math.exp(-yy / 0.75) * Math.pow(Math.max(0, Math.cos(lobes * a + phase)), 2);
    const t = y / H;
    rr *= t < 0.7 ? 1 - 0.28 * (t / 0.7) : 0.72 * Math.pow(Math.max(0, 1 - (t - 0.7) / 0.3), 0.85) + 0.012;
    return rr;
  };
  const shadeAt = (y) => {
    let s = shade;
    if (canopy) s *= lerp(1, pale ? 0.62 : 0.42, smooth(6, 12.5, y));
    s *= lerp(0.82, 1, smooth(-0.3, 0.6, y)); // contact darkening at the roots
    return s;
  };
  const base = b.count;
  for (let j = 0; j < ys.length; j++) {
    const y = ys[j];
    const c = shadeAt(y);
    for (let i = 0; i <= RAD; i++) {
      const a = (i / RAD) * Math.PI * 2;
      const rr = radius(y, a);
      const dr = (radius(y + 0.06, a) - radius(y - 0.06, a)) / 0.12;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nl = Math.hypot(1, dr);
      b.v(x + ca * rr + leanX * y, y0 + y, z + sa * rr + leanZ * y, ca / nl, -dr / nl, sa / nl, (i / RAD) * uRep, y / 9, c);
    }
  }
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < RAD; i++) {
      const a = base + j * (RAD + 1) + i, bb = a + 1, c = a + RAD + 1, d = c + 1;
      b.idx.push(a, c, bb, bb, c, d);
    }
  }
  // sparse high canopy: thin dark branch stubs near the top
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
  for (let k = 0; k < stubs; k++) {
    const yb = H * (0.5 + r() * 0.38);
    const az = r() * Math.PI * 2;
    const rr = radius(yb, az) * 0.8;
    p0.set(x + Math.cos(az) * rr + leanX * yb, y0 + yb, z + Math.sin(az) * rr + leanZ * yb);
    const L = 1.5 + r() * 3.5;
    p1.set(p0.x + Math.cos(az) * L * 0.75, p0.y + L * (0.55 + r() * 0.5), p0.z + Math.sin(az) * L * 0.75);
    addTube(b, p0, p1, Math.max(0.06, R * 0.16), 0.02, { radial: 5, c0: shade * 0.35, c1: shade * 0.3 });
  }
}

const hCache = new Map();
function groundHeightCached(x, z) {
  const k = `${x.toFixed(2)},${z.toFixed(2)}`;
  if (!hCache.has(k)) hCache.set(k, groundHeight(x, z));
  return hCache.get(k);
}

// ===========================================================================
// Textures
function paleBarkTex({ base = '#bdb9b0', line = '40,38,34', seed = 3, lines = 34, blotch = null } = {}) {
  return cpuTexture(256, 512, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    if (blotch) {
      for (let i = 0; i < 22; i++) {
        g.fillStyle = blotch;
        g.globalAlpha = 0.55 + r() * 0.4;
        const x = r() * w, y = r() * h, rw = 14 + r() * 40, rh = 20 + r() * 60;
        g.beginPath();
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2;
          const q = 0.65 + r() * 0.5;
          const px = x + Math.cos(a) * rw * q, py = y + Math.sin(a) * rh * q;
          if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath(); g.fill();
        // wrap horizontally
        g.save(); g.translate(x > w / 2 ? -w : w, 0); g.fill(); g.restore();
      }
      g.globalAlpha = 1;
    }
    g.lineCap = 'round';
    for (let i = 0; i < lines; i++) {
      const x = r() * w;
      g.strokeStyle = `rgba(${line},${0.18 + r() * 0.4})`;
      g.lineWidth = 0.8 + r() * 2.2;
      g.beginPath();
      let cx = x, y = -10;
      g.moveTo(cx, y);
      const len = h * (0.3 + r() * 0.9);
      const y1 = r() * h;
      g.moveTo(cx, y1);
      for (let yy = y1; yy < y1 + len; yy += 24) { cx += (r() - 0.5) * 4; g.lineTo(cx, yy); }
      g.stroke();
    }
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = `rgba(255,255,250,${0.12 + r() * 0.18})`;
      g.lineWidth = 2 + r() * 4;
      const x = r() * w, y1 = r() * h;
      g.beginPath(); g.moveTo(x, y1); g.lineTo(x + (r() - 0.5) * 6, y1 + 40 + r() * 160); g.stroke();
    }
  });
}

function leafTexture(kind) {
  return cpuTexture(128, 128, (g, w, h) => {
    g.translate(w / 2, h / 2);
    if (kind === 'maple') {
      // five-lobed maple leaf, stem down
      const pts = [];
      const lobes = [[-90, 1.0], [-30, 0.88], [30, 0.88], [-150, 0.62], [150, 0.62]];
      const R = 52;
      g.beginPath();
      const N = 60;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * 360 - 180;
        let rr = 0.38;
        for (const [la, lr] of lobes) {
          const d = Math.abs(((a - la + 540) % 360) - 180);
          rr = Math.max(rr, lr * Math.pow(Math.max(0, 1 - d / 34), 1.4));
        }
        rr += ((i % 4) === 0 ? 0.05 : 0);
        const rad = (a * Math.PI) / 180;
        pts.push([Math.cos(rad) * rr * R, Math.sin(rad) * rr * R + 6]);
      }
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fillStyle = '#86a546'; g.fill();
      g.save(); g.clip();
      g.fillStyle = '#62803a';
      g.beginPath(); g.moveTo(0, 8); g.lineTo(80, -80); g.lineTo(80, 80); g.lineTo(-80, 80); g.closePath(); g.fill();
      g.restore();
      g.lineWidth = 5; g.strokeStyle = '#141612'; g.stroke();
      g.lineWidth = 2.2; g.strokeStyle = 'rgba(30,40,20,0.8)';
      for (const [la, lr] of lobes) {
        const rad = (la * Math.PI) / 180;
        g.beginPath(); g.moveTo(0, 8); g.lineTo(Math.cos(rad) * lr * R * 0.8, Math.sin(rad) * lr * R * 0.8 + 6); g.stroke();
      }
      g.lineWidth = 4; g.strokeStyle = '#141612';
      g.beginPath(); g.moveTo(0, 8); g.lineTo(0, 60); g.stroke();
    } else {
      // small cluster of 3 oval leaves
      const leaf = (ang, len, wid, light) => {
        g.save(); g.rotate(ang);
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(wid, -len * 0.45, 0, -len);
        g.quadraticCurveTo(-wid, -len * 0.45, 0, 0);
        g.closePath();
        g.fillStyle = light; g.fill();
        g.save(); g.clip();
        g.fillStyle = 'rgba(70,100,35,0.55)'; g.fillRect(0, -len, wid, len);
        g.restore();
        g.lineWidth = 3.5; g.strokeStyle = '#141612'; g.stroke();
        g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -len * 0.85); g.stroke();
        g.restore();
      };
      g.translate(0, 40);
      leaf(-0.6, 62, 20, '#9fc45a');
      leaf(0.55, 58, 19, '#93b84f');
      leaf(0.0, 74, 22, '#a8cc62');
    }
  }, { wrap: false });
}

function thornTexture(seed = 5, w = 512, h = 384) {
  return cpuTexture(w, h, (g) => drawThorns(g, w, h, rng(seed)), { wrap: false });
}

// ===========================================================================
// Black silhouette drawings (also used for the 3D thorn bushes)
function drawBranchSil(g, w, h, r, { leaves = false } = {}) {
  g.fillStyle = '#000'; g.strokeStyle = '#000'; g.lineCap = 'round'; g.lineJoin = 'round';
  const leafAt = (x, y, s, a) => {
    g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s);
    g.beginPath();
    const N = 30;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2;
      let rr = 0.42;
      for (const [la, lr] of [[-Math.PI / 2, 1], [-Math.PI / 2 - 1.05, 0.85], [-Math.PI / 2 + 1.05, 0.85], [Math.PI / 2 - 0.5, 0.55], [Math.PI / 2 + 0.5, 0.55]]) {
        const d = Math.abs(((t - la + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        rr = Math.max(rr, lr * Math.pow(Math.max(0, 1 - d / 0.62), 1.3));
      }
      const px = Math.cos(t) * rr, py = Math.sin(t) * rr;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.fill();
    g.lineWidth = 0.08; g.beginPath(); g.moveTo(0, 0.2); g.lineTo(0, 0.75); g.stroke();
    g.restore();
  };
  const grow = (x, y, ang, len, wid, depth) => {
    const segs = 4;
    let cx = x, cy = y, a = ang;
    g.lineWidth = wid;
    for (let i = 0; i < segs; i++) {
      a += (r() - 0.5) * 0.35;
      const nx = cx + Math.cos(a) * len / segs, ny = cy + Math.sin(a) * len / segs;
      g.lineWidth = wid * (1 - (i / segs) * 0.45);
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(nx, ny); g.stroke();
      cx = nx; cy = ny;
      if (depth > 0 && r() < 0.55) grow(cx, cy, a + (r() < 0.5 ? -1 : 1) * (0.45 + r() * 0.6), len * (0.45 + r() * 0.25), wid * 0.55, depth - 1);
    }
    if (depth > 0) {
      grow(cx, cy, a - 0.35 - r() * 0.4, len * 0.62, wid * 0.62, depth - 1);
      grow(cx, cy, a + 0.3 + r() * 0.4, len * 0.6, wid * 0.6, depth - 1);
    } else if (leaves) {
      leafAt(cx, cy, w * (0.045 + r() * 0.03), a + Math.PI / 2 + (r() - 0.5) * 0.8);
    }
    if (leaves && depth <= 1 && r() < 0.6) leafAt(cx, cy, w * (0.04 + r() * 0.03), a + (r() - 0.5) * 2);
  };
  const n = 2 + ((r() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const x0 = w * (0.02 + r() * 0.12), y0 = h * (0.98 - r() * 0.05);
    grow(x0, y0, -Math.PI / 2 + 0.25 + r() * 0.55, h * (0.45 + r() * 0.2), w * (0.035 + r() * 0.02), leaves ? 3 : 4);
  }
}

function drawThorns(g, w, h, r) {
  g.fillStyle = '#000'; g.strokeStyle = '#000'; g.lineCap = 'round'; g.lineJoin = 'round';
  const stem = (x, y, ang, len, wid, depth) => {
    let cx = x, cy = y, a = ang;
    const segs = 7;
    for (let i = 0; i < segs; i++) {
      a += (r() - 0.5) * 0.5;
      const nx = cx + Math.cos(a) * len / segs, ny = cy + Math.sin(a) * len / segs;
      g.lineWidth = Math.max(1.2, wid * (1 - i / segs * 0.7));
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(nx, ny); g.stroke();
      // thorns
      const nt = 1 + ((r() * 2) | 0);
      for (let k = 0; k < nt; k++) {
        const t = r();
        const tx = cx + (nx - cx) * t, ty = cy + (ny - cy) * t;
        const side = r() < 0.5 ? -1 : 1;
        const ta = a + side * (0.9 + r() * 0.5);
        const tl = 5 + r() * 9;
        const bw = 2.2;
        g.beginPath();
        g.moveTo(tx + Math.cos(a) * bw, ty + Math.sin(a) * bw);
        g.lineTo(tx + Math.cos(ta) * tl, ty + Math.sin(ta) * tl);
        g.lineTo(tx - Math.cos(a) * bw, ty - Math.sin(a) * bw);
        g.closePath(); g.fill();
      }
      cx = nx; cy = ny;
      if (depth > 0 && r() < 0.35) stem(cx, cy, a + (r() - 0.5) * 1.8, len * 0.5, wid * 0.6, depth - 1);
    }
    // curl at the tip
    g.lineWidth = Math.max(1, wid * 0.25);
    g.beginPath(); g.arc(cx + 6, cy, 6, Math.PI, Math.PI * (2.2 + r()), r() < 0.5); g.stroke();
  };
  const n = 9 + ((r() * 5) | 0);
  for (let i = 0; i < n; i++) {
    const x0 = w * (0.3 + r() * 0.4), y0 = h * 0.99;
    const ang = -Math.PI / 2 + (r() - 0.5) * 2.4;
    stem(x0, y0, ang, h * (0.45 + r() * 0.5), 7 + r() * 5, 2);
  }
}

/**
 * Pure-black flat foreground silhouette foliage for placing near cameras (f_0127, f_0171, f_0317).
 * kind: 'branch' (bare twigs) | 'leaves' (twigs with maple-like leaves) | 'thorns' (bramble)
 * opts: { width = 2, height = 2.6, seed = 1, mirror = false, fog = false }
 * Returns a Mesh: a vertical plane facing +Z, origin at its bottom-centre; branches/leaves grow
 * from the bottom-LEFT corner towards the upper right (mirror → from the bottom-right).
 */
export function makeSilhouette(kind = 'branch', opts = {}) {
  const { width = 2, height = 2.6, seed = 1, mirror = false, fog = false } = opts;
  const pxW = 512, pxH = Math.max(128, Math.min(1024, Math.round((512 * height) / width / 32) * 32));
  const r = rng(seed * 131 + 7);
  const map = cpuTexture(pxW, pxH, (g, w, h) => {
    if (mirror) { g.translate(w, 0); g.scale(-1, 1); }
    if (kind === 'thorns') drawThorns(g, w, h, r);
    else drawBranchSil(g, w, h, r, { leaves: kind === 'leaves' });
  }, { wrap: false });
  const mat = new THREE.MeshBasicMaterial({ color: 0x050505, map, alphaTest: 0.5, side: THREE.DoubleSide, fog });
  noOutline(mat);
  const geo = new THREE.PlaneGeometry(width, height);
  geo.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `silhouette_${kind}`;
  mesh.userData.silhouette = { kind, width, height };
  return mesh;
}

// ===========================================================================
// Branching (leafy / bare) trees: merged tube geometry + leaf placements
function growTree(b, spec, leaves) {
  const r = rng(spec.seed);
  const base = new THREE.Vector3(spec.pos[0], groundHeightCached(spec.pos[0], spec.pos[2]), spec.pos[2]);
  const { height: H, radius: R } = spec;
  const forkY = H * spec.forkAt;
  // root flare + trunk (slightly curved)
  const lean = new THREE.Vector3((r() - 0.5) * 0.12 + (spec.leanX || 0), 1, (r() - 0.5) * 0.1 + (spec.leanZ || 0)).normalize();
  const pA = base.clone().add(new THREE.Vector3(0, -0.4, 0));
  const pB = base.clone().addScaledVector(lean, 0.9);
  addTube(b, pA, pB, R * 1.75, R * 1.05, { radial: 10, vScale: 3, c0: 0.8 });
  const pC = pB.clone().addScaledVector(lean, forkY * 0.55).add(new THREE.Vector3((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3));
  let v = addTube(b, pB, pC, R * 1.05, R * 0.93, { radial: 10, vScale: 3 }) / 3;
  const pD = new THREE.Vector3(base.x + lean.x * forkY, base.y + forkY, base.z + lean.z * forkY);
  addTube(b, pC, pD, R * 0.93, R * 0.8, { radial: 10, vScale: 3, v0: v });

  const tmp = new THREE.Vector3(), q = new THREE.Quaternion(), axis = new THREE.Vector3();
  const branch = (p0, dir, len, rad, depth) => {
    const p1 = p0.clone().addScaledVector(dir, len);
    // slight bend mid-way
    const mid = p0.clone().lerp(p1, 0.5).add(tmp.set((r() - 0.5) * len * 0.12, (r() - 0.2) * len * 0.08, (r() - 0.5) * len * 0.12));
    const rEnd = rad * 0.62;
    addTube(b, p0.clone().addScaledVector(dir, -rad * 0.6), mid, rad, rad * 0.8, { radial: rad > 0.12 ? 7 : 5, vScale: 2.5 });
    addTube(b, mid, p1, rad * 0.8, rEnd, { radial: rad > 0.12 ? 7 : 5, vScale: 2.5 });
    if (depth <= 0 || rEnd < 0.022) {
      if (spec.leafy > 0 && leaves) {
        const n = Math.round(spec.leafy * (5 + r() * 6));
        for (let i = 0; i < n; i++) {
          const lp = p1.clone().add(tmp.set((r() - 0.5) * 1.3, (r() - 0.3) * 0.9, (r() - 0.5) * 1.3).multiplyScalar(spec.leafSpread || 1));
          leaves.push({ p: lp, s: spec.leafSize * (0.75 + r() * 0.5), yaw: (r() - 0.5) * 1.6, roll: (r() - 0.5) * 1.2, tilt: (r() - 0.5) * 0.7, c: 0.85 + r() * 0.3 });
        }
      }
      return;
    }
    const kids = depth >= 3 ? 2 + (r() < 0.5 ? 1 : 0) : 2 + (r() < 0.3 ? 1 : 0);
    const az0 = r() * Math.PI * 2;
    for (let k = 0; k < kids; k++) {
      const az = az0 + (k / kids) * Math.PI * 2 + (r() - 0.5) * 0.8;
      axis.set(Math.cos(az), 0, Math.sin(az)).cross(dir).normalize();
      if (axis.lengthSq() < 0.01) axis.set(1, 0, 0);
      const ang = spec.branchAngle * (0.7 + r() * 0.6);
      q.setFromAxisAngle(axis, ang);
      const nd = dir.clone().applyQuaternion(q);
      nd.y += spec.upBias; nd.normalize();
      branch(p1, nd, len * (0.62 + r() * 0.16), rEnd * (0.85 + r() * 0.2), depth - 1);
    }
    // occasional side twig
    if (depth >= 2 && r() < spec.sideTwigs) {
      const az = r() * Math.PI * 2;
      const nd = new THREE.Vector3(Math.cos(az), 0.4 + r() * 0.5, Math.sin(az)).normalize();
      branch(mid, nd, len * 0.45, rad * 0.45, depth - 2);
    }
  };
  // main limbs from the fork
  const az0 = r() * Math.PI * 2;
  for (let k = 0; k < spec.limbs; k++) {
    const az = az0 + (k / spec.limbs) * Math.PI * 2 + (r() - 0.5) * 0.5;
    const out = spec.limbSpread * (0.75 + r() * 0.5);
    const dir = new THREE.Vector3(Math.cos(az) * Math.sin(out), Math.cos(out), Math.sin(az) * Math.sin(out));
    if (spec.limbBias) { dir.x += spec.limbBias[0]; dir.z += spec.limbBias[1]; dir.normalize(); }
    branch(pD, dir, (H - forkY) * (0.42 + r() * 0.16), R * 0.62, spec.depth);
  }
}

// ===========================================================================
export function buildIsland() {
  const group = new THREE.Group();
  group.name = 'island';
  const named = {};
  const uTime = { value: 0 };
  const timings = (group.userData.timings = {});
  let tMark = performance.now();
  const lap = (k) => { const n = performance.now(); timings[k] = Math.round(n - tMark); tMark = n; };

  // ---------------------------------------------------------------- terrain
  const terrain = buildTerrain();
  lap('terrain');
  group.add(terrain);
  named.terrain = terrain;

  // ---------------------------------------------------------------- palisade + dock
  const palisade = buildPalisade();
  group.add(palisade);
  named.palisade = palisade;
  const dock = buildDock();
  group.add(dock);
  named.dock_steps = dock;
  lap('palisade+dock');

  // ---------------------------------------------------------------- forest
  const forest = buildForest();
  group.add(forest.group);
  Object.assign(named, forest.named);
  lap('forest');

  // ---------------------------------------------------------------- leafy & bare trees
  const trees = buildBranchyTrees(uTime);
  group.add(trees.group);
  Object.assign(named, trees.named);
  lap('trees');
  const trunks = [...forest.trunks, ...trees.trunks];

  // ---------------------------------------------------------------- 小屋两侧的木板围墙
  const shedFence = buildShedFence(trunks);
  group.add(shedFence);
  named.shed_fence = shedFence;
  lap('shed fence');

  // ---------------------------------------------------------------- rocks, tower, thorns
  const rocks = buildRocks();
  group.add(rocks.group);
  Object.assign(named, rocks.named);
  const thorns = buildThornBushes();
  group.add(thorns.group);
  Object.assign(named, thorns.named);
  lap('rocks+thorns');

  // ---------------------------------------------------------------- darkness card in the forest-path gap
  const gapCard = makeDarkCard(3.8, 20);
  gapCard.position.set(0.1, GROUND_Y - 0.2, 28.6);
  gapCard.name = 'forest_path_dark';
  group.add(gapCard);
  named.forest_path_dark = gapCard;

  // ---------------------------------------------------------------- lake-gap marker (soul path)
  const lakeGap = new THREE.Object3D();
  lakeGap.name = 'lake_gap';
  lakeGap.position.set(21.1, 1.6, -21.6);
  group.add(lakeGap);
  named.lake_gap = lakeGap;

  function update(dt, t, camera) {
    uTime.value = t;
    if (camera) {
      const cz = camera.position.z;
      const k = smooth(29.6, 33.5, cz);
      gapCard.material.opacity = k;
      gapCard.visible = k > 0.002;
    }
  }

  return { group, update, heightAt: groundHeight, named, trunks };
}

// ===========================================================================
// Terrain mesh + painted ground texture
const TX0 = -44, TZ0 = -47, TW = 90, TD = 102;

function buildTerrain() {
  const step = 0.5;
  const nx = Math.round(TW / step) + 1, nz = Math.round(TD / step) + 1;
  const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) {
    const z = TZ0 + j * step;
    for (let i = 0; i < nx; i++) {
      const x = TX0 + i * step;
      const o = j * nx + i;
      pos[o * 3] = x; pos[o * 3 + 1] = groundHeight(x, z); pos[o * 3 + 2] = z;
      uv[o * 2] = (x - TX0) / TW; uv[o * 2 + 1] = 1 - (z - TZ0) / TD;
    }
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    // skip quads that are entirely deep under water
    if (pos[a * 3 + 1] < -1.5 && pos[b * 3 + 1] < -1.5 && pos[c * 3 + 1] < -1.5 && pos[d * 3 + 1] < -1.5) continue;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const map = paintGround();
  const mat = flat('#ffffff', { map });
  mat.name = 'IslandGround';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  return mesh;
}

// Paths between the scenes (world x, z). Pale forest paths; dark lakeshore path.
const PATHS = [
  { w: 1.5, pts: [[0, 41], [0.3, 37.5], [-0.5, 34.5], [0.2, 31.5], [-0.4, 28.5], [0.2, 25], [0.9, 22], [0.6, 19.5]] },
  { w: 1.4, pts: [[0.6, 19.5], [3.5, 19], [7, 17.6], [10.4, 15.2], [12.2, 12.6], [13.8, 9.5], [15.2, 6.6], [16.6, 4.6]] },
  { w: 1.4, pts: [[16.6, 4.6], [14.2, 3.4], [11.6, 2.6], [9.6, 0.4], [8.6, -2.6], [6.8, -5.8], [4.8, -8.6], [3.4, -11.2]] },
  { w: 1.3, pts: [[4.8, -8.6], [8.4, -8.2], [12, -8.4], [15.2, -10.2], [17.4, -12.4]] },
  { w: 1.2, pts: [[17.6, -13.4], [18.8, -15.8], [20.4, -18.4], [21.1, -21.2], [21.4, -23.6]] },
];
const DARK_PATH = { w: 1.05, pts: [[21.4, -23.6], [22.6, -26.2], [24.8, -28.6], [27, -30.8], [28.6, -32.6]] };

function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

function paintGround() {
  const SIZE = 2048, LO = 1024, G = 160;
  // ---- coarse fields (shore distance, low-frequency noise), bilinearly sampled per pixel
  const n = makeNoise2(909);
  const sdG = new Float32Array((G + 1) * (G + 1)), nnG = new Float32Array((G + 1) * (G + 1));
  for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
    const x = TX0 + (i / G) * TW, z = TZ0 + (j / G) * TD;
    sdG[j * (G + 1) + i] = shoreDistance(x, z);
    nnG[j * (G + 1) + i] = fbm2(n, x * 0.18, z * 0.18, 4);
  }
  const F = 2 * G;
  const nfG = new Float32Array((F + 1) * (F + 1));
  for (let j = 0; j <= F; j++) for (let i = 0; i <= F; i++) nfG[j * (F + 1) + i] = fbm2(n, (TX0 + (i / F) * TW) * 0.9 + 40, (TZ0 + (j / F) * TD) * 0.9, 2);
  const bil = (arr, N, u, v) => {
    const fx = u * N, fy = v * N;
    const x0 = Math.min(N - 1, Math.floor(fx)), y0 = Math.min(N - 1, Math.floor(fy));
    const tx = fx - x0, ty = fy - y0, W = N + 1;
    const a = arr[y0 * W + x0], b = arr[y0 * W + x0 + 1], c = arr[(y0 + 1) * W + x0], d = arr[(y0 + 1) * W + x0 + 1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
  const { canvas: low, g: lg } = cpuCanvas(LO, LO);
  const img = lg.createImageData(LO, LO);
  const parse = (hex) => { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  const cForest = parse('#8f8e88'), cForestDark = parse('#7c7b75'), cSand = parse('#b0a784'), cWet = parse('#8e8670');
  const cRock = parse('#86888a'), cHill = parse('#7d7877'), cLsand = parse('#cbc5ae'), cUnder = parse('#6c6d6a');
  const c = [0, 0, 0];
  const mixIn = (b, k) => { c[0] += (b[0] - c[0]) * k; c[1] += (b[1] - c[1]) * k; c[2] += (b[2] - c[2]) * k; };
  const tmp = [0, 0, 0];
  const r0 = rng(31337);
  for (let j = 0; j < LO; j++) {
    const v = (j + 0.5) / LO, z = TZ0 + v * TD;
    const beachK = smooth(39.2, 39.9, z);
    for (let i = 0; i < LO; i++) {
      const u = (i + 0.5) / LO, x = TX0 + u * TW;
      const sd = bil(sdG, G, u, v), nn = bil(nnG, G, u, v), nf = bil(nfG, F, u, v);
      c[0] = cForest[0]; c[1] = cForest[1]; c[2] = cForest[2];
      mixIn(cForestDark, smooth(0.45, 0.75, nn));
      if (beachK > 0) {
        const kw = smooth(-1.6, -0.2, sd);
        tmp[0] = cSand[0] + (cWet[0] - cSand[0]) * kw; tmp[1] = cSand[1] + (cWet[1] - cSand[1]) * kw; tmp[2] = cSand[2] + (cWet[2] - cSand[2]) * kw;
        mixIn(tmp, beachK);
      }
      const lakeshoreK = smooth(-22.5, -25.5, z) * smooth(11, 14, x);
      const rockK = (1 - beachK) * smooth(-3.2, -1.2, sd) * (1 - lakeshoreK);
      if (rockK > 0) mixIn(cRock, rockK * (0.6 + 0.4 * nf));
      if (lakeshoreK > 0) {
        const kw = smooth(-1.4, 0.2, sd) * 0.6;
        tmp[0] = cLsand[0] + (cWet[0] - cLsand[0]) * kw; tmp[1] = cLsand[1] + (cWet[1] - cLsand[1]) * kw; tmp[2] = cLsand[2] + (cWet[2] - cLsand[2]) * kw;
        mixIn(tmp, lakeshoreK);
      }
      const dT = Math.hypot(x - TOWER[0], z - TOWER[2]);
      if (dT < 11) mixIn(cHill, smooth(11, 6, dT) * (0.7 + 0.3 * nf));
      if (sd > 0.2) mixIn(cUnder, smooth(0.2, 1.5, sd));
      // grain / litter speckle
      const gr = r0();
      let vv = 0.94 + nf * 0.12 + (gr - 0.5) * 0.07;
      if (gr > 0.985) vv *= beachK > 0.5 ? 0.86 : 0.7;
      else if (gr < 0.012) vv *= 1.16;
      const o = (j * LO + i) * 4;
      img.data[o] = c[0] * vv; img.data[o + 1] = c[1] * vv; img.data[o + 2] = c[2] * vv; img.data[o + 3] = 255;
    }
  }
  lg.putImageData(img, 0, 0);

  return cpuTexture(SIZE, SIZE, (g) => {
    g.imageSmoothingEnabled = true;
    g.drawImage(low, 0, 0, SIZE, SIZE);
    const r = rng(4242);
    const sx = SIZE / TW, sz = SIZE / TD;
    g.setTransform(sx, 0, 0, sz, -TX0 * sx, -TZ0 * sz);
    g.lineCap = 'round'; g.lineJoin = 'round';
    // clearings: lighter ground pools
    const pool = (x, z, rad, a) => {
      const grd = g.createRadialGradient(x, z, 0, x, z, rad);
      grd.addColorStop(0, `rgba(176,175,168,${a})`); grd.addColorStop(1, 'rgba(176,175,168,0)');
      g.fillStyle = grd; g.fillRect(x - rad, z - rad, rad * 2, rad * 2);
    };
    pool(1, 19, 10, 0.45); pool(16, 5, 9, 0.4); pool(6, -7, 11, 0.4); pool(21, -18, 4, 0.3);
    // pale paths
    for (const p of PATHS) {
      const stroke = (w, col) => {
        g.strokeStyle = col; g.lineWidth = w; g.beginPath();
        p.pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
        g.stroke();
      };
      stroke(p.w * 1.9, 'rgba(160,158,150,0.25)');
      stroke(p.w * 1.3, 'rgba(170,168,160,0.45)');
      stroke(p.w, 'rgba(178,176,168,0.75)');
      // pebbles along the path
      for (let i = 0; i < 260; i++) {
        const k = r() * (p.pts.length - 1);
        const a = p.pts[Math.floor(k)], b = p.pts[Math.min(p.pts.length - 1, Math.floor(k) + 1)];
        const t = k - Math.floor(k);
        const x = a[0] + (b[0] - a[0]) * t + (r() - 0.5) * p.w, z = a[1] + (b[1] - a[1]) * t + (r() - 0.5) * p.w;
        g.fillStyle = r() < 0.5 ? 'rgba(120,118,112,0.35)' : 'rgba(205,204,198,0.4)';
        g.fillRect(x, z, 0.07, 0.05);
      }
    }
    // dark lakeshore path to the temple
    g.strokeStyle = 'rgba(78,77,72,0.55)'; g.lineWidth = DARK_PATH.w * 1.4;
    g.beginPath(); DARK_PATH.pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.stroke();
    g.strokeStyle = 'rgba(82,81,76,0.95)'; g.lineWidth = DARK_PATH.w;
    g.beginPath(); DARK_PATH.pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.stroke();
    // lakeshore sand stripes (horizontal painterly bands, f_0318)
    for (let i = 0; i < 70; i++) {
      const z = -37 + r() * 13, x = 14 + r() * 24;
      g.strokeStyle = `rgba(${r() < 0.5 ? '150,146,130' : '226,222,206'},${0.15 + r() * 0.2})`;
      g.lineWidth = 0.15 + r() * 0.25;
      g.beginPath(); g.moveTo(x, z); g.lineTo(x + 3 + r() * 6, z + (r() - 0.5) * 0.4); g.stroke();
    }
    // beach bank: dark ink edge where the sand meets the water
    g.strokeStyle = 'rgba(40,36,30,0.55)';
    g.lineWidth = 0.12;
    g.beginPath();
    for (let x = -21; x <= 23; x += 0.5) {
      // find z where shoreDistance ≈ -0.25 by marching south
      let z = 44;
      while (z < 52 && shoreDistance(x, z) < -0.25) z += 0.05;
      if (x === -21) g.moveTo(x, z); else g.lineTo(x, z);
    }
    g.stroke();
    // shadows under the palisade line (soft dark band behind/below the logs)
    const grd = g.createLinearGradient(0, 39.2, 0, 41.2);
    grd.addColorStop(0, 'rgba(50,45,38,0)'); grd.addColorStop(0.45, 'rgba(50,45,38,0.28)'); grd.addColorStop(1, 'rgba(50,45,38,0)');
    g.fillStyle = grd;
    g.fillRect(PALISADE.xMin - 0.5, 39.2, PALISADE.xMax - PALISADE.xMin + 1, 2);
  }, { anisotropy: 8 });
}

// ===========================================================================
// Palisade of pointed vertical logs (merged into one mesh, toon + ink outline)
function buildPalisade() {
  const { z, xMin, xMax, height, logRadius: R, gateGap } = PALISADE;
  const r = rng(321);
  const b = new GeoBuilder();
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  let i = 0;
  for (let x = xMin + R; x <= xMax - R + 1e-6; x += R * 2 + 0.012, i++) {
    if (Math.abs(x) < gateGap / 2 + R * 0.6) continue;
    // 两头伸进湖里的那几根插在湖底，顶端仍和岸上的一样高（按岸边地面算）
    const gy = groundHeight(x, z), y0 = gy - 0.35, top = Math.max(gy, GROUND_Y - 0.05);
    const h = height * (i % 2 ? 0.965 : 1.0) * (0.97 + r() * 0.05);
    const lx = (r() - 0.5) * 0.05, lz = (r() - 0.5) * 0.04;
    const rr = R * (0.94 + r() * 0.1);
    p0.set(x, y0, z); p1.set(x + lx, top + h - 0.42, z + lz); p2.set(x + lx * 1.1, top + h, z + lz * 1.1);
    const v = addTube(b, p0, p1, rr, rr * 0.97, { radial: 7, vScale: 4.2, uRep: 0.5 }) / 4.2;
    // pointed top
    addTube(b, p1, p2, rr * 0.97, 0.012, { radial: 7, vScale: 4.2, v0: v, uRep: 0.5 });
  }
  // two horizontal rails on the inside (north) face
  for (const side of [-1, 1]) {
    const xa = side < 0 ? xMin + 0.1 : gateGap / 2 + 0.1, xb = side < 0 ? -gateGap / 2 - 0.1 : xMax - 0.1;
    for (const y of [1.3, 3.1]) {
      p0.set(xa, GROUND_Y + y, z - R - 0.07); p1.set(xb, GROUND_Y + y, z - R - 0.07);
      addTube(b, p0, p1, 0.085, 0.085, { radial: 6, vScale: 3, c0: 0.8, c1: 0.8 });
    }
  }
  const map = tex.wood({ base: '#c49766', seed: 41, lines: 9 });
  const mat = toon('#ffffff', { map, vertexColors: true });
  mat.name = 'Palisade';
  const mesh = new THREE.Mesh(b.build(), mat);
  mesh.name = 'palisade';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ===========================================================================
// 小屋两侧的木板围墙（layout.js 的 SHED_FENCE）：和小屋前墙一样的灰木板，钉在北面（湖区一侧）的
// 两道横档上，每隔约 2.6 m 一根方立柱。树干里面的木板省掉，树干就当立柱；伸进湖里的那段插在湖底，
// 顶端和岸上一样高。
const _fx = new THREE.Vector3(), _fy = new THREE.Vector3(), _fz = new THREE.Vector3(), _fm = new THREE.Matrix4();
function buildShedFence(trunks) {
  const { height, runs } = SHED_FENCE;
  const r = rng(733);
  const boards = [], frame = [];
  const inTrunk = (x, z, pad = 0) => trunks.some(([tx, tz, tr]) => (x - tx) ** 2 + (z - tz) ** 2 < Math.max(0, tr - pad) ** 2);
  const topY = (x, z) => Math.max(groundHeight(x, z), GROUND_Y - 0.05);
  /** Box whose local x runs from p0 to p1, local z = horizontal wall normal n; uv: u across, v up. */
  const beam = (p0, p1, n, h, d, uv) => {
    _fx.subVectors(p1, p0); const len = _fx.length(); _fx.divideScalar(len);
    _fz.set(n[0], 0, n[1]); _fy.crossVectors(_fz, _fx).normalize(); _fz.crossVectors(_fx, _fy);
    const g = new THREE.BoxGeometry(len, h, d);
    if (uv) { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * uv[1], a.getY(i) * uv[2]); }
    g.applyMatrix4(_fm.makeBasis(_fx, _fy, _fz).setPosition((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2));
    return g;
  };
  const a3 = new THREE.Vector3(), b3 = new THREE.Vector3();
  for (const run of runs) {
    for (let s = 1; s < run.length; s++) {
      const [ax, az] = run[s - 1], [bx, bz] = run[s];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      // 北面（湖区一侧）的法线
      let nx = dz / L, nz = -dx / L;
      if (nz > 0) { nx = -nx; nz = -nz; }
      const n = [nx, nz];
      // 竖木板：宽 ~0.27 m，高度和前后位置略有参差
      const count = Math.max(1, Math.round(L / 0.27)), bw = L / count;
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count, x = ax + dx * t, z = az + dz * t;
        if (inTrunk(x, z, 0.1)) continue;
        const bot = groundHeight(x, z) - 0.3;
        const top = topY(x, z) + height * (0.975 + r() * 0.04) - (i % 3 === 1 ? 0.06 : 0);
        const off = (r() - 0.5) * 0.025, hw = (bw - 0.014) / 2;
        a3.set(x - (dx / L) * hw + nx * off, (top + bot) / 2, z - (dz / L) * hw + nz * off);
        b3.set(x + (dx / L) * hw + nx * off, (top + bot) / 2, z + (dz / L) * hw + nz * off);
        boards.push(beam(a3, b3, n, top - bot, 0.055, [r(), 0.16, (top - bot) / 3.4]));
      }
      // 两道横档（北面）：两端各按地面高度走，穿进树干的部分被树干挡住
      for (const hy of [0.55, 2.2]) {
        a3.set(ax + nx * 0.07, topY(ax, az) + hy, az + nz * 0.07);
        b3.set(bx + nx * 0.07, topY(bx, bz) + hy, bz + nz * 0.07);
        frame.push(beam(a3, b3, n, 0.13, 0.07, [r(), 0.5, 0.3]));
      }
      // 方立柱：线段起点和中间每隔 ~2.6 m 一根（落在树干里的省掉）
      const posts = Math.max(1, Math.round(L / 2.6));
      for (let k = 0; k < posts; k++) {
        const t = k / posts, x = ax + dx * t, z = az + dz * t;
        if (inTrunk(x, z, -0.1)) continue;
        const bot = groundHeight(x, z) - 0.3, top = topY(x, z) + height + 0.16;
        a3.set(x - (dx / L) * 0.085 + nx * 0.05, (top + bot) / 2, z - (dz / L) * 0.085 + nz * 0.05);
        b3.set(x + (dx / L) * 0.085 + nx * 0.05, (top + bot) / 2, z + (dz / L) * 0.085 + nz * 0.05);
        frame.push(beam(a3, b3, n, top - bot, 0.17, [r(), 0.12, (top - bot) / 3]));
      }
    }
    // 伸进湖里的那一头也立一根柱子收尾
    const [ex, ez] = run[run.length - 1], [px, pz] = run[run.length - 2];
    if (!inTrunk(ex, ez, -0.1)) {
      const L = Math.hypot(ex - px, ez - pz), ux = (ex - px) / L, uz = (ez - pz) / L;
      const bot = groundHeight(ex, ez) - 0.3, top = topY(ex, ez) + height + 0.16;
      a3.set(ex - ux * 0.17, (top + bot) / 2, ez - uz * 0.17); b3.set(ex, (top + bot) / 2, ez);
      frame.push(beam(a3, b3, [uz > 0 ? -uz : uz, uz > 0 ? ux : -ux], top - bot, 0.17, [0.3, 0.12, (top - bot) / 3]));
    }
  }
  const g = new THREE.Group();
  g.name = 'shed_fence';
  const plankMat = toon('#ffffff', { map: tex.wood({ base: '#bebbb4', seed: 65, lines: 16, ink: false }), outline: 0.006 });
  plankMat.name = 'ShedFencePlanks';
  const frameMat = toon('#ffffff', { map: tex.wood({ base: '#a5a29a', seed: 63, lines: 8, ink: false }), outline: 0.006 });
  frameMat.name = 'ShedFenceFrame';
  for (const [name, geos, mat] of [['shed_fence_boards', boards, plankMat], ['shed_fence_frame', frame, frameMat]]) {
    const mesh = new THREE.Mesh(mergeSimple(geos), mat);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

// Wooden dock steps going down into the water at P.dockSteps (toon, outlined)
function buildDock() {
  const g = new THREE.Group();
  g.name = 'dock_steps';
  const [px, py, pz] = P.dockSteps.pos;
  g.position.set(px, 0, pz);
  g.rotation.y = P.dockSteps.rotY || 0;
  const map = tex.planks({ base: '#8f8a80', count: 2, seed: 61 });
  const mat = toon('#ffffff', { map });
  mat.name = 'DockSteps';
  const geos = [];
  const W = 2.7, D = 0.58, STEP = 0.19;
  for (let i = 0; i < 4; i++) {
    const top = py - 0.02 - i * STEP;
    const bottom = -0.95;
    const hgt = top - bottom;
    const box = new THREE.BoxGeometry(W - i * 0.04, hgt, D);
    // rotate uv so the plank seams run along x
    const uvA = box.attributes.uv;
    for (let k = 0; k < uvA.count; k++) uvA.setXY(k, uvA.getY(k) * 0.5, uvA.getX(k) * 1.5);
    box.translate(0, bottom + hgt / 2, -0.05 + i * D + D / 2);
    geos.push(box);
    // rounded front log on each step
    const log = new THREE.CylinderGeometry(0.1, 0.1, W - i * 0.04 - 0.05, 8, 1);
    log.rotateZ(Math.PI / 2);
    log.translate(0, top - 0.06, -0.05 + i * D + D - 0.06);
    geos.push(log);
  }
  // two short mooring posts on the top step
  for (const sx of [-1, 1]) {
    const post = new THREE.CylinderGeometry(0.13, 0.14, 0.45, 9);
    post.translate(sx * 1.15, py + 0.18, 0.18);
    geos.push(post);
  }
  const merged = mergeSimple(geos);
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = 'dock_steps_mesh';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

function mergeSimple(geos) {
  const b = new GeoBuilder();
  for (const geo of geos) {
    const g2 = geo.index ? geo.toNonIndexed() : geo;
    const p = g2.attributes.position, nn = g2.attributes.normal, uv = g2.attributes.uv;
    const base = b.count;
    for (let i = 0; i < p.count; i++) {
      b.v(p.getX(i), p.getY(i), p.getZ(i), nn.getX(i), nn.getY(i), nn.getZ(i), uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, 1);
      b.idx.push(base + i);
    }
  }
  return b.build();
}

// ===========================================================================
// The forest
function buildForest() {
  const group = new THREE.Group();
  group.name = 'forest';
  const named = {};
  const r = rng(2024);

  // ---- explicit "hero" trunks that frame each scene
  const heroes = [
    // forest path F: two big trunks flanking the narrow path, then more behind
    { x: -2.85, z: 33.6, R: 1.3, H: 27 }, { x: 3.0, z: 33.2, R: 1.4, H: 28 },
    { x: -6.3, z: 34.9, R: 1.15, H: 25 }, { x: 6.6, z: 34.6, R: 1.2, H: 26 },
    { x: -9.9, z: 36.2, R: 1.0, H: 24 }, { x: 13.6, z: 36.1, R: 0.95, H: 23 },
    { x: -1.8, z: 30.4, R: 0.9, H: 24, shade: 0.4 }, { x: 2.2, z: 29.8, R: 0.95, H: 24, shade: 0.4 },
    // clearing G: background row behind Margaret / goat / white trees, and the sides
    { x: -14.2, z: 12.6, R: 1.05, H: 26 }, { x: -10.8, z: 10.4, R: 0.95, H: 25 }, { x: -7.6, z: 9.2, R: 1.0, H: 27 },
    { x: -4.4, z: 8.7, R: 0.85, H: 24 }, { x: -1.4, z: 9.6, R: 0.95, H: 26 }, { x: 1.7, z: 8.4, R: 0.9, H: 25 },
    { x: 4.6, z: 9.0, R: 0.8, H: 23 }, { x: 7.6, z: 8.2, R: 0.95, H: 26 }, { x: 10.6, z: 9.0, R: 0.85, H: 24 },
    { x: -15.0, z: 17.5, R: 1.1, H: 27 }, { x: -14.4, z: 22.6, R: 1.2, H: 26 }, { x: -11.4, z: 27.4, R: 1.0, H: 25 },
    { x: 15.9, z: 19.2, R: 1.05, H: 26 }, { x: 16.4, z: 24.6, R: 1.1, H: 25 }, { x: 13.4, z: 28.6, R: 1.0, H: 24 },
    // clearing P: background row behind the pump, left & right edges
    { x: 13.8, z: -1.4, R: 0.9, H: 25 }, { x: 17.0, z: -1.9, R: 1.0, H: 27 }, { x: 20.1, z: -1.2, R: 0.85, H: 24 },
    { x: 23.0, z: -2.0, R: 1.0, H: 26 }, { x: 26.2, z: -1.0, R: 0.9, H: 25 }, { x: 29.2, z: -0.4, R: 1.0, H: 24 },
    { x: 28.6, z: 5.8, R: 1.1, H: 25 }, { x: 27.9, z: 10.6, R: 1.0, H: 24 }, { x: 6.2, z: 4.4, R: 0.9, H: 24 },
    { x: 3.6, z: 1.0, R: 0.85, H: 23 },
    // clearing H: trunks behind the house and to the left of the owl
    { x: -8.6, z: -6.4, R: 1.1, H: 27 }, { x: -6.8, z: -11.8, R: 1.0, H: 26 }, { x: -4.4, z: -16.4, R: 0.95, H: 25 },
    { x: -1.0, z: -19.0, R: 1.0, H: 27 }, { x: 2.6, z: -19.8, R: 0.9, H: 25 }, { x: 6.0, z: -19.0, R: 1.0, H: 26 },
    { x: 8.4, z: -17.0, R: 0.85, H: 24 }, { x: -11.2, z: -1.8, R: 0.95, H: 24 },
  ];
  // pale huge trunks: bigTreesH, soul path curtains + outer K trunks
  const paleHeroes = [
    ...P.bigTreesH.map((p, i) => ({ x: p[0], z: p[2], R: [1.25, 1.1, 1.35, 1.15][i], H: 32, name: `big_tree_h_${i}` })),
    { x: 19.35, z: -21.5, R: 0.95, H: 31, name: 'soul_curtain_l', buttress: 0.12 },
    { x: 22.85, z: -21.5, R: 0.95, H: 31, name: 'soul_curtain_r', buttress: 0.12 },
    { x: 16.2, z: -19.4, R: 1.25, H: 30, name: 'soul_outer_l', shade: 1.15 },
    { x: 26.0, z: -19.6, R: 1.25, H: 30, name: 'soul_outer_r', shade: 1.15 },
  ];

  // ---- exclusion field for the random fill
  const ell = (x, z, cx, cz, rx, rz) => ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 < 1;
  const capsule = (x, z, ax, az, bx, bz, rad) => distToPolyline(x, z, [[ax, az], [bx, bz]]) < rad;
  const blocked = (x, z, R) => {
    if (!onIsland(x, z)) return true;
    if (shoreDistance(x, z) > -1.6 - R) return true;
    if (z > 38.6 - R) return true;                                   // palisade / beach
    if (Math.hypot(x - TOWER[0], z - TOWER[2]) < 12.5 + R) return true; // tower hill
    if (Math.abs(x) < 2.6 + R && z > 25) return true;                // F corridor
    if (Math.hypot(x - P.shoreTree.pos[0], z - P.shoreTree.pos[2]) < 2.6 + R) return true;
    if (ell(x, z, 1.5, 19.5, 12.8 + R, 9.2 + R)) return true;          // clearing G
    if (capsule(x, z, 5, 23, 16.5, 9, 3.6 + R)) return true;           // G → P
    if (ell(x, z, 16.5, 7, 11 + R, 6.6 + R)) return true;              // clearing P
    if (capsule(x, z, 12, 6, 4, -3, 3.2 + R)) return true;             // P → H
    if (capsule(x, z, 3.5, -2.5, 17, -5, 3.0 + R)) return true;        // H camera pan
    if (ell(x, z, 6, -8, 13.5 + R, 6.4 + R)) return true;              // clearing H
    if (x > -1.5 - R && x < 7.5 + R && z > -17.5 - R && z < -10.5) return true; // house
    if (x > 13.5 - R && x < 23 + R && z > -16 - R && z < -9 - R * 0) return true; // shed
    if (capsule(x, z, 17.5, -13, 21.2, -26, 2.2 + R)) return true;     // soul path
    if (x > 11.5 && z < -23) return true;                              // lakeshore (open)
    for (const p of PATHS) if (distToPolyline(x, z, p.pts) < 1.4 + R) return true;
    return false;
  };
  const placed = [];
  const tooClose = (x, z, R) => placed.some((t) => Math.hypot(t.x - x, t.z - z) < t.R + R + 1.15);
  for (const h of heroes) placed.push(h);
  for (const h of paleHeroes) placed.push(h);
  placed.push({ x: P.pumpTree.pos[0], z: P.pumpTree.pos[2], R: 1.6 });
  for (const p of P.whiteTreesG) placed.push({ x: p[0], z: p[2], R: 1.2 });
  placed.push({ x: P.shoreTree.pos[0], z: P.shoreTree.pos[2], R: 1.2 });
  const random = [];
  for (let tries = 0; tries < 9000 && random.length < 330; tries++) {
    const x = -38 + r() * 78, z = -40 + r() * 79;
    const R = 0.55 + Math.pow(r(), 1.6) * 0.65;
    if (blocked(x, z, R) || tooClose(x, z, R)) continue;
    const t = { x, z, R, H: 18 + r() * 10 };
    placed.push(t); random.push(t);
  }

  // ---- build merged chunks (dark-ish striped bark)
  const bark = tex.bark({ light: '#b6ae9e', dark: '#4b473f', seed: 71 });
  const barkMat = forestMaterial(toon('#ffffff', { map: bark, vertexColors: true }), { near: 9, far: 30, amount: 0.78 });
  barkMat.name = 'ForestBark';
  const chunks = new Map();
  const all = [...heroes.map((h) => ({ ...h, hero: true })), ...random];
  for (const t of all) {
    const key = `${Math.floor((t.x + 40) / 26)}_${Math.floor((t.z + 42) / 28)}`;
    if (!chunks.has(key)) chunks.set(key, new GeoBuilder());
    addTrunk(chunks.get(key), {
      x: t.x, z: t.z, R: t.R, H: t.H, seed: Math.round(t.x * 131 + t.z * 977),
      shade: (t.shade ?? (0.78 + r() * 0.22)),
    });
  }
  for (const [key, b] of chunks) {
    const mesh = new THREE.Mesh(b.build(), barkMat);
    mesh.name = `forest_trunks_${key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ---- pale hero trunks (separate lighter bark), each also exposed as a named proxy group
  const paleBark = paleBarkTex({ base: '#c4beb1', line: '60,56,48', seed: 13, lines: 40 });
  const paleMat = forestMaterial(toon('#ffffff', { map: paleBark, vertexColors: true }), { near: 12, far: 40, amount: 0.6 });
  paleMat.name = 'PaleBark';
  const pb = new GeoBuilder();
  for (const t of paleHeroes) {
    addTrunk(pb, { x: t.x, z: t.z, R: t.R, H: t.H, seed: Math.round(t.x * 31 + t.z * 7), shade: t.shade ?? 1, buttress: t.buttress ?? 0.3, pale: true, stubs: 3 });
    const marker = new THREE.Object3D();
    marker.name = t.name;
    marker.position.set(t.x, GROUND_Y, t.z);
    marker.userData.radius = t.R;
    group.add(marker);
    named[t.name] = marker;
  }
  const paleMesh = new THREE.Mesh(pb.build(), paleMat);
  paleMesh.name = 'pale_trunks';
  paleMesh.castShadow = true;
  paleMesh.receiveShadow = true;
  group.add(paleMesh);
  named.pale_trunks = paleMesh;
  group.userData.trunkCount = all.length + paleHeroes.length;
  const trunks = [...all, ...paleHeroes].map((t) => [t.x, t.z, t.R]);
  return { group, named, trunks };
}

/**
 * Darkens a material with distance from the camera (dense forest seen from outside reads as a
 * dark mass, as in f_0019 / f_0022). Works for toon/lambert/basic materials.
 */
function forestMaterial(mat, { near = 9, far = 30, amount = 0.75, color = '#24231f' } = {}) {
  const uniforms = { uDarkNear: { value: near }, uDarkFar: { value: far }, uDarkAmt: { value: amount }, uDarkCol: { value: new THREE.Color(color) } };
  mat.userData.forestUniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFWorld;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 fw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fw = instanceMatrix * fw;
        #endif
        vFWorld = (modelMatrix * fw).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFWorld;\nuniform float uDarkNear, uDarkFar, uDarkAmt;\nuniform vec3 uDarkCol;')
      .replace('#include <fog_fragment>', `
        float fdk = smoothstep(uDarkNear, uDarkFar, length(vFWorld - cameraPosition)) * uDarkAmt;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uDarkCol, fdk);
        #include <fog_fragment>`);
  };
  mat.customProgramCacheKey = () => 'forestDark';
  return mat;
}

// ===========================================================================
// Leafy / bare branching trees
function buildBranchyTrees(uTime) {
  const group = new THREE.Group();
  group.name = 'leafy_trees';
  const named = {};
  const leavesMaple = [], leavesOval = [];

  const shoreBark = paleBarkTex({ base: '#bebbb3', line: '50,48,44', seed: 21, lines: 46 });
  const whiteBark = paleBarkTex({ base: '#d3d4ce', line: '70,72,68', seed: 33, lines: 10, blotch: '#a2a59e' });
  const pumpBark = paleBarkTex({ base: '#b7b2a6', line: '55,52,46', seed: 45, lines: 50 });
  const bareBark = paleBarkTex({ base: '#9d9b95', line: '45,44,40', seed: 57, lines: 40 });

  const defs = [
    {
      name: 'shore_tree', pos: P.shoreTree.pos, seed: 11, height: 12.5, radius: 0.55, forkAt: 0.36, limbs: 4,
      limbSpread: 0.62, depth: 3, branchAngle: 0.5, upBias: 0.12, sideTwigs: 0.5, leafy: 1.1, leafSize: 0.42,
      tex: shoreBark, leafKind: 'oval', limbBias: [0.12, 0.25],
    },
    ...P.whiteTreesG.map((p, i) => ({
      name: `white_tree_${i}`, pos: p, seed: 101 + i * 17, height: 11 + i * 0.8, radius: 0.42 + (i === 1 ? 0.08 : 0),
      forkAt: 0.42, limbs: 3, limbSpread: 0.55, depth: 3, branchAngle: 0.55, upBias: 0.15, sideTwigs: 0.6,
      leafy: i === 2 ? 0.8 : 1.15, leafSize: 0.62, tex: whiteBark, leafKind: 'maple', limbBias: [0, 0.18],
    })),
    {
      name: 'pump_tree', pos: P.pumpTree.pos, seed: 303, height: 15, radius: 0.72, forkAt: 0.4, limbs: 4,
      limbSpread: 0.58, depth: 3, branchAngle: 0.5, upBias: 0.12, sideTwigs: 0.5, leafy: 0.35, leafSize: 0.36,
      tex: pumpBark, leafKind: 'oval', limbBias: [0.05, 0.2],
    },
    {
      name: 'bare_tree_0', pos: [-6.5, GROUND_Y, 36.6], seed: 404, height: 13, radius: 0.5, forkAt: 0.3, limbs: 4,
      limbSpread: 0.6, depth: 3, branchAngle: 0.5, upBias: 0.1, sideTwigs: 0.7, leafy: 0, leafSize: 0,
      tex: bareBark, limbBias: [0, 0.25],
    },
    {
      name: 'bare_tree_1', pos: [-15.5, GROUND_Y, 36.8], seed: 505, height: 11, radius: 0.42, forkAt: 0.34, limbs: 3,
      limbSpread: 0.55, depth: 3, branchAngle: 0.55, upBias: 0.1, sideTwigs: 0.7, leafy: 0, leafSize: 0,
      tex: bareBark, limbBias: [0, 0.2],
    },
  ];
  const mats = new Map();
  for (const d of defs) {
    const b = new GeoBuilder();
    growTree(b, d, d.leafKind === 'maple' ? leavesMaple : leavesOval);
    if (!mats.has(d.tex)) mats.set(d.tex, toon('#ffffff', { map: d.tex }));
    const mesh = new THREE.Mesh(b.build(), mats.get(d.tex));
    mesh.geometry.deleteAttribute('color');
    mesh.name = d.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    named[d.name] = mesh;
  }
  for (const [list, kind] of [[leavesMaple, 'maple'], [leavesOval, 'oval']]) {
    if (!list.length) continue;
    const mat = new THREE.MeshBasicMaterial({ map: leafTexture(kind), alphaTest: 0.5, side: THREE.DoubleSide });
    noOutline(mat);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 0.9 + instanceMatrix[3].y * 0.6;
          #else
            float ph = 0.0;
          #endif
          float sw = sin(uTime * 1.5 + ph) * 0.06 + sin(uTime * 2.7 + ph * 1.3) * 0.03;
          transformed.x += sw * (position.y + 0.5);
          transformed.z += cos(uTime * 1.2 + ph) * 0.04 * (position.y + 0.5);`);
    };
    mat.customProgramCacheKey = () => 'leafSway';
    const geo = new THREE.PlaneGeometry(1, 1);
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    inst.name = `leaves_${kind}`;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
    const base = new THREE.Color(kind === 'maple' ? '#ffffff' : '#ffffff');
    const c = new THREE.Color();
    list.forEach((L, i) => {
      e.set(L.tilt, L.yaw, L.roll);
      q.setFromEuler(e);
      s.setScalar(L.s);
      m.compose(L.p, q, s);
      inst.setMatrixAt(i, m);
      c.copy(base).multiplyScalar(L.c);
      inst.setColorAt(i, c);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
    named[`leaves_${kind}`] = inst;
  }
  const trunks = defs.map((d) => [d.pos[0], d.pos[2], d.radius]);
  return { group, named, trunks };
}

// ===========================================================================
// Rocks (merged, faceted toon with outlines)
function buildRocks() {
  const group = new THREE.Group();
  group.name = 'rocks';
  const named = {};
  const r = rng(777);
  const rn = makeNoise2(778);
  const b = new GeoBuilder();
  const ico = new THREE.IcosahedronGeometry(1, 2).toNonIndexed();
  const ip = ico.attributes.position;
  const addRock = (x, y, z, sx, sy, sz, rotY, col, seed, flatBottom = true) => {
    const cosR = Math.cos(rotY), sinR = Math.sin(rotY);
    const base = b.count;
    const tmpV = new THREE.Vector3();
    const verts = [];
    for (let i = 0; i < ip.count; i++) {
      tmpV.fromBufferAttribute(ip, i);
      const n = fbm2(rn, tmpV.x * 1.3 + seed, tmpV.y * 1.3 + tmpV.z * 0.7, 3);
      const k = 0.72 + n * 0.55;
      let lx = tmpV.x * k * sx, ly = tmpV.y * k * sy, lz = tmpV.z * k * sz;
      if (flatBottom && ly < -0.2 * sy) ly = -0.2 * sy + (ly + 0.2 * sy) * 0.15;
      verts.push([x + lx * cosR - lz * sinR, y + ly, z + lx * sinR + lz * cosR]);
    }
    for (let i = 0; i < verts.length; i += 3) {
      const [a, bb, c] = [verts[i], verts[i + 1], verts[i + 2]];
      const ux = bb[0] - a[0], uy = bb[1] - a[1], uz = bb[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const v = 0.9 + r() * 0.2;
      for (const p of [a, bb, c]) b.v(p[0], p[1], p[2], nx, ny, nz, p[0] * 0.3, p[1] * 0.3, col[0] * v, col[1] * v, col[2] * v);
    }
    for (let i = 0; i < verts.length; i++) b.idx.push(base + i);
  };
  const grey = [0.56, 0.56, 0.55], greyD = [0.42, 0.41, 0.41], blue = [0.6, 0.66, 0.67], slab = [0.32, 0.32, 0.3];
  // tower hill: big boulders forming the rocky base under the tower
  const [tx, , tz] = TOWER;
  const hillRocks = [
    [-4.2, 0.6, 2.8, 3.2, 2.6, 2.6], [3.6, 0.4, 3.4, 3.0, 2.2, 2.4], [-3.0, 0.2, -4.0, 2.8, 2.4, 2.6],
    [4.4, 0.3, -3.0, 2.6, 2.0, 2.2], [-6.8, -0.4, 0.4, 3.0, 2.4, 3.2], [0.4, 0.2, 5.4, 2.4, 1.8, 2.0],
    [6.6, -0.6, 1.2, 2.2, 1.6, 2.0], [-1.0, -0.6, -6.6, 2.6, 1.8, 2.2], [-8.6, -0.9, -3.6, 2.2, 1.6, 2.2],
    [-8.0, -1.0, 5.2, 2.4, 1.6, 2.4],
  ];
  hillRocks.forEach(([dx, dy, dz, sx, sy, sz], i) => {
    const x = tx + dx * 1.35, z = tz + dz * 1.35;   // 石塔变大了：岩石环也跟着放大一圈
    addRock(x, groundHeight(x, z) + dy + sy * 0.25, z, sx * 1.2, sy * 1.2, sz * 1.2, r() * 6, i % 2 ? grey : greyD, i * 3.1);
  });
  // low rocks along the non-beach shore
  for (let k = 0; k < 220 && k >= 0; k++) {
    const x = -40 + r() * 82, z = -42 + r() * 80;
    const sd = shoreDistance(x, z);
    if (sd < -1.2 || sd > 1.6) continue;
    if (z > 36 && Math.abs(x) < 22) continue;            // beach
    if (x > 11 && z < -24 && x < 36) continue;            // lakeshore sand stays clean
    const s = 0.5 + r() * 1.2;
    addRock(x, groundHeight(x, z) - 0.1, z, s * (1 + r() * 0.6), s * (0.45 + r() * 0.4), s, r() * 6, r() < 0.5 ? grey : greyD, k * 1.7);
  }
  // dark flat rock shelves at both ends of the beach (f_0023 / f_0045)
  addRock(-21.4, -0.05, 43.6, 3.4, 0.5, 1.8, 0.6, slab, 91);
  addRock(-19.6, 0.05, 41.8, 2.4, 0.45, 1.6, 0.3, slab, 92);
  addRock(22.6, -0.05, 43.6, 3.6, 0.5, 2.0, -0.7, slab, 93);
  addRock(24.8, -0.1, 41.2, 2.6, 0.45, 1.8, -0.4, slab, 94);
  // lakeshore rock walls (left and right of the lakeshore view, bluish grey #a1aeb0)
  addRock(16.6, 0.0, -33.4, 2.6, 7.8, 2.8, 0.4, blue, 51, false);
  addRock(15.2, 0.0, -30.4, 2.4, 5.6, 2.6, 1.2, blue, 52, false);
  addRock(29.3, 0.0, -27.8, 2.4, 7.2, 2.6, -0.3, blue, 53, false);
  addRock(31.4, 0.0, -25.6, 2.6, 5.4, 2.6, 0.9, blue, 54, false);
  const mat = toon('#ffffff', { vertexColors: true, flatShading: true });
  mat.name = 'Rocks';
  const mesh = new THREE.Mesh(b.build(), mat);
  mesh.name = 'rocks';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  named.rocks = mesh;
  for (const [n, x, z] of [['lakeshore_rock_l', 16.6, -33.4], ['lakeshore_rock_r', 29.3, -27.8]]) {
    const o = new THREE.Object3D(); o.name = n; o.position.set(x, 0, z); group.add(o); named[n] = o;
  }
  return { group, named };
}

// ===========================================================================
// Black thorn bushes (crossed silhouette planes)
function buildThornBushes() {
  const group = new THREE.Group();
  group.name = 'thorn_bushes';
  const named = {};
  const make = (name, x, z, w, h, seed, rot = 0) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, groundHeight(x, z) - 0.05, z);
    g.rotation.y = rot;
    const map = thornTexture(seed);
    const mat = new THREE.MeshBasicMaterial({ color: 0x050505, map, alphaTest: 0.5, side: THREE.DoubleSide });
    noOutline(mat);
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.PlaneGeometry(w * (1 - i * 0.12), h * (1 - i * 0.1));
      geo.translate(0, h * (1 - i * 0.1) / 2, 0);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.y = (i * Math.PI) / 3 + 0.2;
      g.add(m);
    }
    group.add(g);
    named[name] = g;
  };
  make('thorns_p', P.thorns.pos[0], P.thorns.pos[2], 4.2, 2.8, 5, 0);
  make('thorns_p2', P.thorns.pos[0] + 2.6, P.thorns.pos[2] - 1.8, 3.2, 2.4, 6, 0.6);
  make('thorns_shed', P.shedWall.pos[0] + 4.2, P.shedWall.pos[2] - 0.4, 3.4, 2.5, 7, 0.1);
  make('thorns_shed2', P.shedWall.pos[0] + 6.4, P.shedWall.pos[2] - 1.4, 3.0, 2.2, 8, 0.9);
  return { group, named };
}

// ===========================================================================
// Soft-edged black card that hides what is beyond a dark gap (forest path)
function makeDarkCard(w, h) {
  const map = cpuTexture(64, 256, (g, cw, ch) => {
    const grd = g.createLinearGradient(0, 0, cw, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.22, 'rgba(255,255,255,1)');
    grd.addColorStop(0.78, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, cw, ch);
  }, { wrap: false });
  const mat = new THREE.MeshBasicMaterial({ color: '#151614', alphaMap: map, transparent: true, depthWrite: false, fog: false });
  noOutline(mat);
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(0, h / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  return m;
}

export { V3 };
