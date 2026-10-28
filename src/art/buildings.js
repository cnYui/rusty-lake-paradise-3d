// Buildings & interior stage sets for Plague I.
//   exterior: stone house with reed thatch (P.house), plank shed wall with doorway (P.shedWall),
//             domed lakeshore temple with owl statue (P.temple), three-storey west tower (P.tower).
//   sets:     house_int (dining-room box), temple_int (font room), memory (misty vision stage) —
//             each a Group at SETS.<zone>.origin with its own lights and a black void around it.
// buildBuildings() → { exterior, sets: { house_int, temple_int, memory }, anchors: Map, update(dt, t) }
// See docs/impl_buildings.md for anchors, named children and recommended camera poses.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, flat, unlit, canvasTexture, rng, shade, tex } from './materials.js';
import { P, SETS } from './layout.js';
import { getModel } from './rlpm.js';
import { makeTowerModel } from './tower_model.js';

const TAU = Math.PI * 2;
const INK = 0.006;          // outline thickness for building silhouettes
const INK_FINE = 0.004;     // thatch bundles, small details
// Interior lighting: modest, viewer-like intensities so toon props/characters read as in dev/common/viewer;
// the large plaster/floor surfaces get a colour gain instead so they stay as pale as the frames.
const ROOM_LIGHT = { sky: '#f3f2ee', ground: '#8e8d88', hemi: 1.7, sun: 1.9 };
const WALL_GAIN = 1.3, FLOOR_GAIN = 1.7;

// Dimensions that other modules may want to know (also documented in impl_buildings.md).
export const BUILDING_DIMS = {
  house: { width: 6, wallHeight: 3.2, depth: 5, door: { width: 1.24, height: 2.15 }, ridge: 5.41 },
  // 小屋：前墙是带锁的双扇门，后墙开门洞通向灵魂小径，四面封闭、带屋顶（门开之前看不到后面）
  shed: { width: 5, height: 3.1, depth: 3.0, doorway: { width: 1.9, height: 2.35 } },
  temple: { radius: 3.4, wallHeight: 5.6, door: { width: 1.45, height: 2.5 }, window: { width: 0.95, height: 1.45, bottom: 3.35 } },
  tower: { height: 14.6, width: 4.6 },
  // 可以走动的餐厅：后墙在 wallZ，前墙（带出口门洞）在 wallZ + depth
  house_int: { width: 4.6, depth: 4.6, wallZ: -1.6, wallHeight: 3.6, door: { width: 1.2, height: 2.25 } },
  temple_int: { width: 5.8, depth: 4.8, wallZ: -2.0, wallHeight: 5.4, ceiling: 5.4 },
  memory: { backdropZ: -7.2 },
};

// ---------------------------------------------------------------------------
// geometry helpers

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/** Apply translate / rotate (XYZ euler) / scale to a geometry in place. */
function xf(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  return g.applyMatrix4(_m);
}

/** Non-indexed geometry with only position / normal / uv (/ color). */
function prep(g, keepColor) {
  const geo = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(geo.attributes)) {
    if (name === 'position' || name === 'normal' || name === 'uv') continue;
    if (keepColor && name === 'color') continue;
    geo.deleteAttribute(name);
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  geo.clearGroups();
  return geo;
}

function merge(list, keepColor = false) {
  const g = mergeGeometries(list.map((x) => prep(x, keepColor)), false);
  if (!g) throw new Error('buildings: mergeGeometries failed');
  return g;
}

/** Planar UVs in metres (per face, chosen from the normal). Apply after positioning. */
function worldUV(g, tileU, tileV = tileU, offU = 0, offV = 0) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    let u, v;
    if (ay > ax && ay > az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = -p.getZ(i) * Math.sign(nx || 1); v = p.getY(i); }
    else { u = p.getX(i) * Math.sign(nz || 1); v = p.getY(i); }
    uv.setXY(i, u / tileU + offU, v / tileV + offV);
  }
  uv.needsUpdate = true;
  return g;
}

/** Triangles from quads/tris of Vector3 (CCW seen from outside) → flat-shaded geometry. */
function polyGeo(faces) {
  const pos = [];
  for (const f of faces) {
    for (let i = 1; i < f.length - 1; i++) {
      for (const v of [f[0], f[i], f[i + 1]]) pos.push(v.x, v.y, v.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

function paint(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/**
 * Arch outline points (CCW, starting bottom-left), bottom edge on y = y0.
 * kind 'round' = semicircular head, 'pointed' = blunt gothic (two arcs, radius 0.62·w).
 */
function archPoints(w, h, kind = 'round', y0 = 0, seg = 14) {
  const pts = [];
  const hw = w / 2;
  if (kind === 'round') {
    const spring = y0 + h - hw;
    pts.push(new THREE.Vector2(-hw, y0), new THREE.Vector2(hw, y0), new THREE.Vector2(hw, spring));
    for (let i = 1; i < seg; i++) {
      const a = (i / seg) * Math.PI;
      pts.push(new THREE.Vector2(Math.cos(a) * hw, spring + Math.sin(a) * hw));
    }
    pts.push(new THREE.Vector2(-hw, spring));
  } else {
    const r = 0.62 * w;
    const rise = Math.sqrt(r * r - (r - hw) * (r - hw));
    const spring = y0 + h - rise;
    pts.push(new THREE.Vector2(-hw, y0), new THREE.Vector2(hw, y0), new THREE.Vector2(hw, spring));
    // right arc: centre (hw - r, spring), from angle 0 up to the apex
    const cxR = hw - r, aEnd = Math.atan2(rise, -cxR);
    for (let i = 1; i <= seg; i++) {
      const a = (i / seg) * aEnd;
      pts.push(new THREE.Vector2(cxR + Math.cos(a) * r, spring + Math.sin(a) * r));
    }
    // left arc mirrored, from the apex down to the left springing
    for (let i = seg - 1; i >= 1; i--) {
      const a = (i / seg) * aEnd;
      pts.push(new THREE.Vector2(-(cxR + Math.cos(a) * r), spring + Math.sin(a) * r));
    }
    pts.push(new THREE.Vector2(-hw, spring));
  }
  return pts;
}

/** Frame band around an arch: U-shaped polygon (no bottom) or ring with a hole (with sill). */
function archFrameShape(w, h, band, kind, closedBottom) {
  if (closedBottom) {
    const s = new THREE.Shape(archPoints(w + band * 2, h + band * 2, kind, -band));
    s.holes.push(new THREE.Path(archPoints(w, h, kind, 0)));
    return s;
  }
  const outer = archPoints(w + band * 2, h + band, kind, 0);
  const inner = archPoints(w, h, kind, 0);
  // outer: BL, BR, up the right, over the top, down to left spring. Build: outer BL → outer BR is
  // replaced by a U: start at outer BR, follow outer CCW to outer BL, then inner BL → inner CCW reversed.
  const pts = [];
  for (let i = 1; i < outer.length; i++) pts.push(outer[i]);      // BR → ... → left spring
  pts.push(outer[0]);                                             // outer BL
  pts.push(inner[0]);                                             // inner BL
  for (let i = inner.length - 1; i >= 2; i--) pts.push(inner[i]); // inner left spring → over the top → inner right spring
  pts.push(inner[1]);                                             // inner BR
  return new THREE.Shape(pts);
}

function extrude(shape, depth) {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 });
}

/** Normalise ShapeGeometry UVs to [0,1] over its bounding box. */
function fitUV(g) {
  g.computeBoundingBox();
  const b = g.boundingBox, p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    uv.setXY(i, (p.getX(i) - b.min.x) / (b.max.x - b.min.x), (p.getY(i) - b.min.y) / (b.max.y - b.min.y));
  }
  uv.needsUpdate = true;
  return g;
}

function mesh(geo, mat, name, { cast = false, receive = false } = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (name) m.name = name;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// ---------------------------------------------------------------------------
// procedural textures used only here

/** '#rrggbb' → [r, g, b] in 0..255 (sRGB, as stored on a canvas). */
function hexRGB(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Smooth value noise over a wrapping gw × gh grid; returns f(x, y) with x, y in grid cells. */
function valueNoise(r, gw, gh) {
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const tx = x - x0, ty = y - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const xa = ((x0 % gw) + gw) % gw, xb = (xa + 1) % gw, ya = ((y0 % gh) + gh) % gh, yb = (ya + 1) % gh;
    const a = grid[ya * gw + xa], b = grid[ya * gw + xb], c = grid[yb * gw + xa], d = grid[yb * gw + xb];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}

/**
 * Off-white plaster with scanned-looking grey grunge (fine vertical speckle inside soft patches).
 * density(u, v) ≈ 0..1 (v = 0 top) controls where the grunge collects; amount scales its darkness.
 */
function grungeTexture({ w = 1024, h = 1024, base = '#dcdacb', seed = 1, density = () => 0.5, amount = 1, drips = 30, floorShade = 0.14 }) {
  return canvasTexture(w, h, (g) => {
    const r = rng(seed);
    const low = valueNoise(r, 8, 8), mid = valueNoise(r, 32, 32), hi = valueNoise(r, 400, 90), hi2 = valueNoise(r, 160, 40);
    const [br, bgc, bb] = hexRGB(base);
    // 逐像素的噪声只在半分辨率上算，再平滑放大铺满整张画布：贴图尺寸不变（斑点在 1–2 像素的尺度上本来就是糊的），
    // 百万像素的双重循环省掉四分之三；房子 / 神殿内部的几张墙面贴图合计省约 0.3 秒，慢手机上按倍数放大。
    const sw = w >> 1, sh = h >> 1;
    const img = g.createImageData(sw, sh);
    const d = img.data;
    for (let y = 0; y < sh; y++) {
      const v = y / sh;
      for (let x = 0; x < sw; x++) {
        const u = x / sw;
        let m = density(u, v) * (0.3 + 1.0 * low(u * 8, v * 8)) * (0.55 + 0.7 * mid(u * 32, v * 32));
        m = m > 1 ? 1 : m;
        const n = 0.42 * hi(u * 400, v * 90) + 0.2 * hi2(u * 160, v * 40) + 0.38 * r();
        let k = (n - (0.86 - 0.36 * m)) / 0.07;
        k = k < 0 ? 0 : k > 1 ? 1 : k;
        const dark = (k * (0.2 + 0.25 * m) + m * 0.09) * amount + (r() - 0.5) * 0.03;
        const f = 1 - dark;
        const i = (y * sw + x) * 4;
        d[i] = br * f; d[i + 1] = bgc * f; d[i + 2] = bb * f; d[i + 3] = 255;
      }
    }
    const half = document.createElement('canvas');
    half.width = sw; half.height = sh;
    half.getContext('2d').putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(half, 0, 0, w, h);
    // large soft stains following the density
    for (let i = 0; i < 46; i++) {
      let x = r() * w, y = r() * h;
      for (let k = 0; k < 20 && r() > density(x / w, y / h); k++) { x = r() * w; y = r() * h; }
      const rad = 40 + r() * 180;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(90,88,82,${(0.03 + r() * 0.06) * amount})`);
      grd.addColorStop(1, 'rgba(90,88,82,0)');
      g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // faint drips
    for (let i = 0; i < drips; i++) {
      const x = r() * w, y0 = r() * h * 0.7, len = 40 + r() * 260;
      g.strokeStyle = `rgba(80,78,72,${(0.03 + r() * 0.07) * amount})`;
      g.lineWidth = 1 + r() * 3;
      g.beginPath(); g.moveTo(x, y0);
      let cx = x;
      for (let y = y0; y < y0 + len; y += 16) { cx += (r() - 0.5) * 1.6; g.lineTo(cx, y); }
      g.stroke();
    }
    // contact shade towards the floor
    const grd = g.createLinearGradient(0, h * 0.84, 0, h);
    grd.addColorStop(0, 'rgba(40,40,36,0)');
    grd.addColorStop(1, `rgba(40,40,36,${floorShade})`);
    g.fillStyle = grd; g.fillRect(0, h * 0.84, w, h * 0.16);
  }, { wrap: false });
}

/** tex.stone with lighter mortar and some mottling (the Rusty Lake walls have grey, not black, joints). */
function softStone({ base, seed, mortar = '#7f7d78', rows = 8, size = 512 }) {
  const src = tex.stone({ base, rows, seed });
  return canvasTexture(size, size, (g, w, h) => {
    const r = rng(seed + 1000);
    g.drawImage(src.image, 0, 0, w, h);
    g.globalCompositeOperation = 'lighten';
    g.fillStyle = mortar; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 160; i++) {
      const x = r() * w, y = r() * h, rad = 6 + r() * 34;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const c = r() < 0.55 ? '70,68,64' : '255,255,250';
      grd.addColorStop(0, `rgba(${c},${0.05 + r() * 0.08})`); grd.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  });
}

function floorTexture({ base = '#999b98', seed = 3, front = 0.12, back = 0.1 } = {}) {
  return canvasTexture(512, 512, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      g.globalAlpha = 0.04 + r() * 0.06;
      g.fillStyle = r() < 0.5 ? '#ffffff' : '#555550';
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    for (let i = 0; i < 30; i++) {
      const x = r() * w, y = r() * h, rad = 30 + r() * 120;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(60,60,58,0.06)'); grd.addColorStop(1, 'rgba(60,60,58,0)');
      g.globalAlpha = 1; g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.globalAlpha = 1;
    // v = 0 (canvas top) is the back edge at the wall; darker contact line there and at the front
    let grd = g.createLinearGradient(0, 0, 0, h * 0.12);
    grd.addColorStop(0, `rgba(30,30,28,${back})`); grd.addColorStop(1, 'rgba(30,30,28,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h * 0.12);
    grd = g.createLinearGradient(0, h * 0.7, 0, h);
    grd.addColorStop(0, 'rgba(20,20,18,0)'); grd.addColorStop(1, `rgba(20,20,18,${front})`);
    g.fillStyle = grd; g.fillRect(0, h * 0.7, w, h * 0.3);
  }, { wrap: false });
}

function domeTexture() {
  return canvasTexture(1024, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#eef0ed'); grd.addColorStop(0.55, '#e3e5e2'); grd.addColorStop(1, '#d2d5d2');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const r = rng(77);
    for (let i = 0; i < 2500; i++) {
      g.globalAlpha = 0.05 + r() * 0.07; g.fillStyle = r() < 0.5 ? '#ffffff' : '#8a8d8a';
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    g.globalAlpha = 1;
    g.strokeStyle = '#4e514f'; g.lineWidth = 3.2;
    for (let k = 0; k < 16; k++) {
      const x = ((k + 0.5) / 16) * w;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    }
  });
}

/**
 * Paint a rocky mountain mass under a ridge polyline (canvas px, left to right) down to y = bottom:
 * gradient body, lit left slopes / shaded right slopes, fine rock strokes, inked ridge line.
 */
function paintMountains(g, r, pts, bottom, { top = '#a7a3a9', bot = '#7b7880', light = '232,230,236', dark = '52,50,60', strokes = 400, size = 1, ink = 0.55 } = {}) {
  const minY = Math.min(...pts.map((p) => p[1]));
  g.save();
  g.beginPath(); g.moveTo(pts[0][0], bottom);
  for (const [x, y] of pts) g.lineTo(x, y);
  g.lineTo(pts[pts.length - 1][0], bottom); g.closePath();
  const grd = g.createLinearGradient(0, minY, 0, bottom);
  grd.addColorStop(0, top); grd.addColorStop(1, bot);
  g.fillStyle = grd; g.fill();
  g.clip();
  // slope shading: each ridge segment casts a band towards the valley below it
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const up = y1 < y0;
    const depth = (bottom - Math.min(y0, y1)) * (0.45 + r() * 0.35);
    g.fillStyle = up ? `rgba(${light},${0.14 + r() * 0.12})` : `rgba(${dark},${0.12 + r() * 0.12})`;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
    g.lineTo(x1 + (up ? -1 : 1) * depth * 0.25, y1 + depth); g.lineTo(x0 + (up ? -1 : 1) * depth * 0.25, y0 + depth);
    g.closePath(); g.fill();
  }
  // rock strokes: short steep lines, light and dark
  for (let i = 0; i < strokes; i++) {
    const x = pts[0][0] + r() * (pts[pts.length - 1][0] - pts[0][0]);
    const y = minY + Math.pow(r(), 0.8) * (bottom - minY);
    const len = (4 + r() * 12) * size;
    const ang = -Math.PI / 2 + (r() - 0.5) * 1.9;
    g.strokeStyle = r() < 0.5 ? `rgba(${light},${0.12 + r() * 0.16})` : `rgba(${dark},${0.12 + r() * 0.16})`;
    g.lineWidth = (0.7 + r() * 1.3) * size;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y - Math.sin(ang) * len); g.stroke();
  }
  g.restore();
  if (ink > 0) {
    g.strokeStyle = `rgba(${dark},${ink})`; g.lineWidth = 1.4 * size;
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  }
}

/** Jagged ridge polyline through key points (canvas px), with small rocky noise. */
function ridgeLine(r, keys, step, rough) {
  const pts = [];
  for (let k = 0; k < keys.length - 1; k++) {
    const [x0, y0] = keys[k], [x1, y1] = keys[k + 1];
    const n = Math.max(1, Math.round(Math.abs(x1 - x0) / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + (i ? (r() - 0.5) * rough : 0)]);
    }
  }
  pts.push(keys[keys.length - 1]);
  return pts;
}

/** Painted window view for the temple: pale sky with soft clouds and a grey rocky ridge. */
function windowViewTexture(seed = 5) {
  return canvasTexture(256, 400, (g, w, h) => {
    const r = rng(seed);
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#93c0e2'); grd.addColorStop(0.55, '#b9d8ee'); grd.addColorStop(1, '#d6e9f3');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) {
      const x = r() * w, y = h * (0.1 + r() * 0.5), rx = 20 + r() * 50, ry = 6 + r() * 12;
      g.fillStyle = `rgba(255,255,255,${0.06 + r() * 0.1})`;
      g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
    }
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(255,255,255,${r() * 0.08})`; g.fillRect(r() * w, r() * h, 2, 2);
    }
    // rocky ridge: lower-left peak, taller right peak
    const keys = [[0, 0.83], [0.12, 0.78], [0.22, 0.7], [0.3, 0.655], [0.36, 0.69], [0.44, 0.73],
      [0.52, 0.76], [0.6, 0.72], [0.7, 0.66], [0.76, 0.625], [0.82, 0.66], [0.9, 0.7], [1, 0.73]].map(([x, y]) => [x * w, y * h]);
    paintMountains(g, r, ridgeLine(r, keys, 6, 4), h, { top: '#aeaab0', bot: '#85828a', strokes: 520, size: 1, ink: 0.6 });
  }, { wrap: false });
}

/** Irregular coursed rubble masonry (tiles in x and y): pale blocks, grey joints, soft bevels. */
function masonryTexture({ base = '#c6c4be', mortar = '#8e8c87', seed = 1, size = 512, rows = 9 }) {
  return canvasTexture(size, size, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = mortar; g.fillRect(0, 0, w, h);
    let hs = [], tot = 0;
    for (let i = 0; i < rows; i++) { const v = 0.7 + r() * 0.6; hs.push(v); tot += v; }
    hs = hs.map((v) => (v / tot) * h);
    const block = (x, y, bw, rh, col) => {
      const j = 1.8, jit = () => (r() - 0.5) * 2.6;
      const p = [[x + j + jit(), y + j + jit()], [x + bw - j + jit(), y + j + jit()], [x + bw - j + jit(), y + rh - j + jit()], [x + j + jit(), y + rh - j + jit()]];
      for (const dx of [0, -w, w]) {
        g.beginPath(); p.forEach(([px, py], i) => (i ? g.lineTo(px + dx, py) : g.moveTo(px + dx, py))); g.closePath();
        g.fillStyle = col; g.fill();
        g.lineJoin = 'round'; g.lineWidth = 2.2; g.strokeStyle = col; g.stroke();
        // bevel: light top edge, dark bottom edge
        g.lineWidth = 1.4;
        g.strokeStyle = 'rgba(255,255,250,0.28)';
        g.beginPath(); g.moveTo(p[0][0] + dx, p[0][1] + 1); g.lineTo(p[1][0] + dx, p[1][1] + 1); g.stroke();
        g.strokeStyle = 'rgba(40,40,36,0.25)';
        g.beginPath(); g.moveTo(p[3][0] + dx, p[3][1] - 1); g.lineTo(p[2][0] + dx, p[2][1] - 1); g.stroke();
      }
    };
    let y = 0;
    for (const rh of hs) {
      let x = -r() * 50;
      const start = x;
      while (x < start + w) {
        const bw = Math.min(start + w - x, rh * (1.1 + r() * 2.0));
        block(x, y, bw, rh, shade(base, (r() - 0.5) * 0.12));
        x += bw;
      }
      y += rh;
    }
    // mottling + grain
    for (let i = 0; i < 220; i++) {
      const x = r() * w, yy = r() * h, rad = 5 + r() * 26;
      const grd = g.createRadialGradient(x, yy, 0, x, yy, rad);
      const c = r() < 0.55 ? '70,68,64' : '255,255,250';
      grd.addColorStop(0, `rgba(${c},${0.05 + r() * 0.08})`); grd.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = grd; g.fillRect(x - rad, yy - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '40,40,38'},${r() * 0.12})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
    }
  });
}

// ---------------------------------------------------------------------------
// EXTERIOR

function addAnchor(anchors, parent, name, x, y, z, rotY = 0) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  o.rotation.y = rotY;
  parent.add(o);
  anchors.set(name, o);
  return o;
}

function buildHouse(anchors) {
  const { pos, rotY = 0, size } = P.house;
  const [W, H, D] = size || [6, 3.2, 5];
  const g = new THREE.Group();
  g.name = 'house';
  g.position.fromArray(pos);
  g.rotation.y = rotY;
  const SINK = 0.6;

  // --- stone walls (solid block; interior is the separate house_int set)
  const wallMat = toon('#ffffff', { map: masonryTexture({ base: '#c9c7c1', mortar: '#8f8d88', seed: 41, rows: 9 }), outline: INK });
  const walls = worldUV(xf(new THREE.BoxGeometry(W, H + SINK, D), 0, (H - SINK) / 2, 0), 2.4, 1.75, 0.13, 0.4);
  g.add(mesh(walls, wallMat, 'house_walls', { cast: true, receive: true }));

  // --- doorway: pale stone jambs + lintel, deep black opening with a dim grey shape inside
  const dw = 1.24, dh = 2.15, jw = 0.23;
  const front = D / 2;
  const jambs = [
    xf(new THREE.BoxGeometry(jw, dh, 0.27), -(dw / 2 + jw / 2), dh / 2, front + 0.06),
    xf(new THREE.BoxGeometry(jw, dh, 0.27), dw / 2 + jw / 2, dh / 2, front + 0.06),
  ].map((b) => worldUV(b, 0.9, 2.4, 0.2, 0));
  const lintel = xf(new THREE.BoxGeometry(dw + jw * 2 + 0.55, 0.34, 0.32), 0, dh + 0.17, front + 0.08);
  // grain runs along the lintel: swap the UV axes
  const luv = lintel.attributes.uv, lp = lintel.attributes.position;
  for (let i = 0; i < luv.count; i++) luv.setXY(i, lp.getY(i) / 0.9 + 0.5, lp.getX(i) / 2.4);
  const frameGeo = merge([...jambs, lintel]);
  const door = new THREE.Group();
  door.name = 'house_door';
  door.add(mesh(frameGeo, toon('#ffffff', { map: tex.wood({ base: '#cfcdc6', seed: 43, lines: 9, ink: false }), outline: INK }), 'house_door_frame', { cast: true, receive: true }));
  const voidMat = unlit('#090909');
  door.add(mesh(xf(new THREE.BoxGeometry(dw + 0.02, dh, 0.3), 0, dh / 2, front - 0.1), voidMat, 'house_doorway'));
  const oval = xf(new THREE.CircleGeometry(0.5, 28), -0.13, 1.02, front + 0.052, 0, 0, 0, 0.56, 1.5, 1);
  door.add(mesh(oval, unlit('#1c1d1b'), 'house_doorway_shadow'));
  g.add(door);

  // --- hip roof of reed bundles (flattened slats laid down the slopes, each ink-outlined)
  const ovX = 0.2, ovZ = 0.4, yE = H - 0.14, rise = 2.36, hipRun = 0.5;
  const ex = W / 2 + ovX, ez = D / 2 + ovZ, rx = ex - hipRun, yR = yE + rise;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const E1 = V(-ex, yE, ez), E2 = V(ex, yE, ez), E3 = V(ex, yE, -ez), E4 = V(-ex, yE, -ez);
  const R1 = V(-rx, yR, 0), R2 = V(rx, yR, 0);
  const base = polyGeo([[E1, E2, R2, R1], [E3, E4, R1, R2], [E2, E3, R2], [E4, E1, R1], [E1, E4, E3, E2]]);
  g.add(mesh(base, toon('#4a3824', { outline: false }), 'house_roof_base', { cast: true, receive: true }));

  const r = rng(91);
  const cols = ['#9a7a57', '#a6865f', '#8c6e4f', '#ad8d66', '#82674a', '#957553', '#b09069'];
  const bundles = [];
  const spacing = 0.118;
  const X = new THREE.Vector3(), M4 = new THREE.Matrix4();
  const addBundle = (start, dir, n, len) => {
    const rw = 0.05 + r() * 0.012, rt = 0.04 + r() * 0.01;
    const geo = new THREE.CylinderGeometry(0.86 + r() * 0.12, 1, len, 8, 1, false, Math.PI / 8);
    geo.scale(rw, 1, rt);
    X.crossVectors(dir, n).normalize();
    M4.makeBasis(X, dir, n);
    const mid = start.clone().addScaledVector(dir, len / 2).addScaledVector(n, rt * 0.9);
    M4.setPosition(mid);
    geo.applyMatrix4(M4);
    bundles.push(paint(geo, cols[(r() * cols.length) | 0]));
  };
  // front & back slopes
  const slopeLen = Math.hypot(ez, rise);
  for (const sz of [1, -1]) {
    const dir = V(0, rise, -ez * sz).normalize();
    const n = V(0, ez, rise * sz).normalize();
    const count = Math.round((2 * ex) / spacing);
    for (let i = 0; i < count; i++) {
      const x = -ex + (i + 0.5) * (2 * ex / count) + (r() - 0.5) * 0.025;
      const vMax = Math.min(1, (ex - Math.abs(x)) / hipRun);
      const drop = 0.02 + Math.pow(r(), 1.5) * 0.34;
      const start = V(x, yE, ez * sz).addScaledVector(dir, -drop);
      const len = drop + slopeLen * vMax + (vMax >= 1 ? 0.02 + r() * 0.12 : 0);
      if (len > 0.2) addBundle(start, dir, n, len);
    }
  }
  // hip ends
  const hipLen = Math.hypot(hipRun, rise);
  for (const sx of [1, -1]) {
    const dir = V(-hipRun * sx, rise, 0).normalize();
    const n = V(rise * sx, hipRun, 0).normalize();
    const count = Math.round((2 * ez) / spacing);
    for (let i = 0; i < count; i++) {
      const z = -ez + (i + 0.5) * (2 * ez / count) + (r() - 0.5) * 0.025;
      const vMax = 1 - Math.abs(z) / ez;
      const drop = 0.04 + r() * 0.18;
      const start = V(ex * sx, yE, z).addScaledVector(dir, -drop);
      const len = drop + hipLen * vMax + r() * 0.06;
      if (len > 0.2) addBundle(start, dir, n, len);
    }
  }
  const thatch = mesh(merge(bundles, true), toon('#ffffff', { vertexColors: true, emissive: '#1d150c', outline: INK_FINE }), 'house_roof', { cast: true, receive: true });
  g.add(thatch);

  addAnchor(anchors, g, 'house.door', 0, 0, front + 0.05, 0);
  return g;
}

function buildShedWall(anchors) {
  const { pos, rotY = 0 } = P.shedWall;
  const g = new THREE.Group();
  g.name = 'shed_wall';
  g.position.fromArray(pos);
  g.rotation.y = rotY;
  const { width: W, height: H } = BUILDING_DIMS.shed;
  const { width: DW, height: DH } = BUILDING_DIMS.shed.doorway;
  const SINK = 0.45, T = 0.1, PW = 0.17, EP = 0.22;

  const plankMat = toon('#ffffff', { map: tex.wood({ base: '#bebbb4', seed: 65, lines: 16, ink: false }), outline: INK });
  const beamMat = toon('#ffffff', { map: tex.wood({ base: '#a5a29a', seed: 63, lines: 8, ink: false }), outline: INK });

  const inner = DW / 2 + PW;                  // outer edge of the door posts
  const sideW = W / 2 - EP - inner;
  const boards = [];
  for (const sgn of [-1, 1]) {
    const n = 2, bw = sideW / n;
    for (let i = 0; i < n; i++) {
      const cx = sgn * (inner + bw * (i + 0.5));
      const b = xf(new THREE.BoxGeometry(bw, H + SINK, T), cx, (H - SINK) / 2, (i % 2) * 0.014);
      boards.push(worldUV(b, 0.85, 3.4, 0.37 * i + (sgn > 0 ? 0.5 : 0), 0));
    }
  }
  // horizontal board above the doorway (grain runs sideways)
  const top = xf(new THREE.BoxGeometry(inner * 2, H - DH - 0.2, T), 0, (H + DH + 0.2) / 2, 0.007);
  const tuv = top.attributes.uv, tp = top.attributes.position;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tp.getY(i) / 0.85, tp.getX(i) / 3.4);
  boards.push(top);
  g.add(mesh(merge(boards), plankMat, 'shed_planks', { cast: true, receive: true }));

  const beams = [
    xf(new THREE.BoxGeometry(EP, H + SINK + 0.1, 0.2), -(W / 2 - EP / 2), (H - SINK) / 2 + 0.05, 0.02),
    xf(new THREE.BoxGeometry(EP, H + SINK + 0.1, 0.2), W / 2 - EP / 2, (H - SINK) / 2 + 0.05, 0.02),
    xf(new THREE.BoxGeometry(PW, DH + 0.2 + SINK, 0.18), -(DW / 2 + PW / 2), (DH + 0.2 - SINK) / 2, 0.03),
    xf(new THREE.BoxGeometry(PW, DH + 0.2 + SINK, 0.18), DW / 2 + PW / 2, (DH + 0.2 - SINK) / 2, 0.03),
    xf(new THREE.BoxGeometry(DW + PW * 2 + 0.36, 0.2, 0.2), 0, DH + 0.1, 0.04),
    xf(new THREE.BoxGeometry(W + 0.16, 0.17, 0.24), 0, H + 0.02, 0.02),
  ];

  // ---- 小屋其余部分：两侧墙、后墙（中间开门洞通向灵魂小径）、四角立柱和单坡屋顶。
  // 门开之前从哪个角度都看不到门后面；开门后透过前后两个门洞看到小径。
  const D = BUILDING_DIMS.shed.depth;
  const walls = [];
  for (const sgn of [-1, 1]) {
    const n = 3, bd = D / n;
    for (let i = 0; i < n; i++) {
      const b = xf(new THREE.BoxGeometry(T, H + SINK, bd), sgn * (W / 2 - EP / 2), (H - SINK) / 2, -bd * (i + 0.5) + (i % 2) * 0.01);
      walls.push(worldUV(b, 0.85, 3.4, 0.29 * i + (sgn > 0 ? 0.4 : 0), 0));
    }
  }
  for (const sgn of [-1, 1]) {
    const bw = W / 2 - DW / 2;
    const b = xf(new THREE.BoxGeometry(bw, H + SINK, T), sgn * (DW / 2 + bw / 2), (H - SINK) / 2, -D);
    walls.push(worldUV(b, 0.85, 3.4, sgn > 0 ? 0.6 : 0.15, 0));
  }
  const backTop = xf(new THREE.BoxGeometry(DW, H - DH, T), 0, (H + DH) / 2, -D);
  walls.push(worldUV(backTop, 0.85, 3.4, 0.33, 0));
  g.add(mesh(merge(walls), plankMat, 'shed_walls', { cast: true, receive: true }));
  beams.push(
    xf(new THREE.BoxGeometry(EP, H + SINK + 0.1, EP), -(W / 2 - EP / 2), (H - SINK) / 2 + 0.05, -D),
    xf(new THREE.BoxGeometry(EP, H + SINK + 0.1, EP), W / 2 - EP / 2, (H - SINK) / 2 + 0.05, -D),
    xf(new THREE.BoxGeometry(PW, DH + 0.2 + SINK, 0.18), -(DW / 2 + PW / 2), (DH + 0.2 - SINK) / 2, -D + 0.02),
    xf(new THREE.BoxGeometry(PW, DH + 0.2 + SINK, 0.18), DW / 2 + PW / 2, (DH + 0.2 - SINK) / 2, -D + 0.02),
    xf(new THREE.BoxGeometry(DW + PW * 2 + 0.36, 0.2, 0.2), 0, DH + 0.1, -D + 0.02),
    xf(new THREE.BoxGeometry(0.2, 0.17, D + 0.2), -(W / 2 - 0.1), H + 0.02, -D / 2),
    xf(new THREE.BoxGeometry(0.2, 0.17, D + 0.2), W / 2 - 0.1, H + 0.02, -D / 2),
    xf(new THREE.BoxGeometry(W + 0.16, 0.17, 0.24), 0, H + 0.02, -D),
  );
  for (const b of beams) worldUV(b, 0.5, 2.0);
  g.add(mesh(merge(beams), beamMat, 'shed_frame', { cast: true, receive: true }));
  // 单坡屋顶：前高后低，四面出檐
  const roofMat = toon('#ffffff', { map: tex.wood({ base: '#8d8a83', seed: 67, lines: 22, ink: false }), outline: INK });
  const roofLen = D + 0.8, tilt = Math.atan2(0.45, roofLen);
  const roof = worldUV(xf(new THREE.BoxGeometry(W + 0.6, 0.12, roofLen), 0, H + 0.33, -D / 2, -tilt, 0, 0), 0.6, 2.4);
  g.add(mesh(roof, roofMat, 'shed_roof', { cast: true, receive: true }));

  addAnchor(anchors, g, 'shed.doorway', 0, 0, T / 2, 0);
  addAnchor(anchors, g, 'shed.back', 0, 0, -D, 0);
  return g;
}

function owlStatue() {
  const parts = [];
  const body = xf(new THREE.SphereGeometry(0.22, 16, 12), 0, 0.3, 0, 0, 0, 0, 1, 1.25, 0.85);
  const head = xf(new THREE.SphereGeometry(0.17, 16, 12), 0, 0.62, 0.01, 0, 0, 0, 1.06, 0.95, 0.95);
  parts.push(body, head,
    xf(new THREE.ConeGeometry(0.055, 0.15, 6), 0.11, 0.77, 0, 0, 0, -0.45),
    xf(new THREE.ConeGeometry(0.055, 0.15, 6), -0.11, 0.77, 0, 0, 0, 0.45),
    xf(new THREE.ConeGeometry(0.035, 0.08, 6), 0, 0.58, 0.17, Math.PI / 2 + 0.3, 0, 0),
    xf(new THREE.CylinderGeometry(0.16, 0.2, 0.06, 12), 0, 0.02, 0));
  // spread wings in the frontal plane, raised in a "W"
  for (const s of [1, -1]) {
    const pts = [[0, 0], [0.2, 0.17], [0.42, 0.33], [0.62, 0.43], [0.8, 0.47], [0.74, 0.37], [0.79, 0.33],
      [0.66, 0.26], [0.7, 0.2], [0.55, 0.15], [0.57, 0.07], [0.42, 0.04], [0.42, -0.04], [0.28, -0.04],
      [0.26, -0.12], [0.12, -0.1], [0.04, -0.12]];
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * s, y)));
    parts.push(xf(extrude(shape, 0.05), 0.12 * s, 0.38, -0.03));
  }
  const g = new THREE.Group();
  g.name = 'temple_owl';
  g.add(mesh(merge(parts), toon('#959390', { outline: INK_FINE }), 'temple_owl_body', { cast: true }));
  const eyes = merge([
    xf(new THREE.CircleGeometry(0.04, 12), 0.066, 0.645, 0.168),
    xf(new THREE.CircleGeometry(0.04, 12), -0.066, 0.645, 0.168),
  ]);
  g.add(mesh(eyes, unlit('#d9d8d2'), 'temple_owl_eyes'));
  const pupils = merge([
    xf(new THREE.CircleGeometry(0.018, 10), 0.066, 0.645, 0.171),
    xf(new THREE.CircleGeometry(0.018, 10), -0.066, 0.645, 0.171),
  ]);
  g.add(mesh(pupils, unlit('#1a1a1a'), 'temple_owl_pupils'));
  return g;
}

function buildTemple(anchors) {
  const { pos, rotY = 0, radius: R = 3.4 } = P.temple;
  const H = BUILDING_DIMS.temple.wallHeight, SINK = 0.5;
  const rTop = R - 0.14;
  const rAt = (y) => R + (rTop - R) * (y / H);
  const g = new THREE.Group();
  g.name = 'temple';
  g.position.fromArray(pos);
  g.rotation.y = rotY;

  // round stone wall (seam at the back)
  const wall = new THREE.CylinderGeometry(rTop, rAt(-SINK), H + SINK, 56, 1, true, Math.PI, TAU);
  xf(wall, 0, (H - SINK) / 2, 0);
  const uv = wall.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i) * ((H + SINK) / 1.4));
  const wallMat = toon('#ffffff', { map: softStone({ base: '#c4c2bc', seed: 47, mortar: '#8a8883' }), outline: INK });
  g.add(mesh(wall, wallMat, 'temple_wall', { cast: true, receive: true }));

  // cornice rings + dome + finial
  const corn = merge([
    xf(new THREE.CylinderGeometry(rTop + 0.1, rTop + 0.1, 0.16, 56), 0, H + 0.08, 0),
    xf(new THREE.CylinderGeometry(rTop + 0.2, rTop + 0.2, 0.13, 56), 0, H + 0.225, 0),
  ]);
  g.add(mesh(corn, toon('#d9d9d5', { outline: INK }), 'temple_cornice', { cast: true, receive: true }));
  const domeR = rTop + 0.04, domeY = H + 0.29, domeS = 0.78;
  const dome = xf(new THREE.SphereGeometry(domeR, 56, 18, 0, TAU, 0, Math.PI / 2), 0, domeY, 0, 0, 0, 0, 1, domeS, 1);
  g.add(mesh(dome, toon('#ffffff', { map: domeTexture(), outline: INK }), 'temple_dome', { cast: true, receive: true }));
  const domeTop = domeY + domeR * domeS;
  const fin = merge([
    xf(new THREE.CylinderGeometry(0.25, 0.29, 0.42, 18), 0, domeTop + 0.13, 0),
    xf(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 18), 0, domeTop + 0.36, 0),
  ]);
  g.add(mesh(fin, toon('#d4d4d0', { outline: INK }), 'temple_finial', { cast: true }));
  const owl = owlStatue();
  owl.position.set(0, domeTop + 0.4, 0);
  g.add(owl);

  // arched window + door: white frame bands, black voids
  const frameMat = toon('#e6e6e2', { outline: INK });
  const voidMat = unlit('#0a0a0a');
  const { width: ww, height: wh, bottom: wb } = BUILDING_DIMS.temple.window;
  const { width: dw, height: dh } = BUILDING_DIMS.temple.door;
  const zW = rAt(wb - 0.1), zD = rAt(-SINK);           // widest wall radius over each opening
  const frames = merge([
    xf(extrude(archFrameShape(ww, wh, 0.085, 'round', true), 0.36), 0, wb, zW - 0.26),
    xf(extrude(archFrameShape(dw, dh, 0.11, 'round', false), 0.42), 0, 0, zD - 0.32),
  ]);
  const win = new THREE.Group(); win.name = 'temple_window';
  const door = new THREE.Group(); door.name = 'temple_door';
  g.add(mesh(frames, frameMat, 'temple_frames', { cast: true, receive: true }));
  win.add(mesh(xf(extrude(new THREE.Shape(archPoints(ww, wh, 'round')), 0.5), 0, wb, zW - 0.47), voidMat, 'temple_window_void'));
  door.add(mesh(xf(extrude(new THREE.Shape(archPoints(dw, dh + SINK, 'round', -SINK)), 0.55), 0, 0, zD - 0.52), voidMat, 'temple_doorway'));
  g.add(win, door);

  addAnchor(anchors, g, 'temple.door', 0, 0, rAt(0) + 0.12, 0);
  addAnchor(anchors, g, 'temple.window', 0, wb + wh / 2, zW + 0.1, 0);
  return g;
}

function buildTower() {
  const { pos } = P.tower;
  const tm = getModel('tower');   // 有网格石塔（src/art/models/tower.rlpm）就用网格，否则程序化三层石塔
  if (tm) return makeTowerModel(tm, pos);
  const g = new THREE.Group();
  g.name = 'tower';
  g.position.fromArray(pos);
  g.rotation.y = 0.12;

  const stone = [], trim = [], holes = [];
  const storeys = [
    { h: 4.9, w: 4.6 },          // lower: one arched window per face
    { h: 4.3, w: 4.4 },          // middle: one tall arched window with a pale surround
    { h: 3.3, w: 4.25 },         // top: open arcade (3 arches per face)
  ];
  let y = -1.2;                  // a little below the rock top
  const faceWin = (wFace, yy, depth, make) => {
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      for (const geo of make()) {
        xf(geo, 0, yy, depth / 2 + 0.015, 0, 0, 0);
        geo.applyMatrix4(_m.makeRotationY(a));
        holes.push(geo);
      }
    }
  };
  storeys.forEach((s, i) => {
    const h = i === 0 ? s.h + 1.2 : s.h;
    stone.push(xf(new THREE.BoxGeometry(s.w, h, s.w), 0, y + h / 2, 0));
    const yBase = y + (i === 0 ? 1.2 : 0);
    if (i === 0) faceWin(s.w, yBase + 1.6, s.w, () => [new THREE.ShapeGeometry(new THREE.Shape(archPoints(1.05, 2.0, 'round')))]);
    if (i === 1) {
      faceWin(s.w, yBase + 0.9, s.w, () => [new THREE.ShapeGeometry(new THREE.Shape(archPoints(1.25, 2.6, 'round')))]);
      for (let k = 0; k < 4; k++) {
        const ring = xf(new THREE.ShapeGeometry(archFrameShape(1.25, 2.6, 0.22, 'round', false)), 0, yBase + 0.9, s.w / 2 + 0.01);
        ring.applyMatrix4(_m.makeRotationY((k * Math.PI) / 2));
        trim.push(ring);
      }
    }
    if (i === 2) {
      faceWin(s.w, yBase + 0.55, s.w, () => [
        xf(new THREE.ShapeGeometry(new THREE.Shape(archPoints(1.3, 2.15, 'round'))), 0, 0, 0),
        xf(new THREE.ShapeGeometry(new THREE.Shape(archPoints(0.62, 1.75, 'round'))), -1.3, 0.1, 0),
        xf(new THREE.ShapeGeometry(new THREE.Shape(archPoints(0.62, 1.75, 'round'))), 1.3, 0.1, 0),
      ]);
    }
    y += h;
    // string course / cornice
    const lw = s.w + (i === 2 ? 0.55 : 0.3), lh = i === 2 ? 0.34 : 0.24;
    trim.push(xf(new THREE.BoxGeometry(lw, lh, lw), 0, y + lh / 2 - 0.02, 0));
    y += lh - 0.02;
  });
  // cap: slab + low pyramid
  trim.push(xf(new THREE.BoxGeometry(4.5, 0.32, 4.5), 0, y + 0.16, 0));
  trim.push(xf(new THREE.ConeGeometry(3.25, 0.85, 4, 1), 0, y + 0.32 + 0.42, 0, 0, Math.PI / 4, 0));
  for (const s of stone) worldUV(s, 3.2, 1.8);
  g.add(mesh(merge(stone), flat('#ffffff', { map: softStone({ base: '#aaa69e', seed: 57, mortar: '#77746e' }) }), 'tower_body', { cast: true, receive: true }));
  g.add(mesh(merge(trim), flat('#b8b3aa'), 'tower_trim', { cast: true, receive: true }));
  g.add(mesh(merge(holes), unlit('#2b2724'), 'tower_windows'));

  // rocky plinth the tower stands on (merges visually with island rocks)
  const rock = new THREE.IcosahedronGeometry(1, 2);
  const rp = rock.attributes.position, rr = rng(5);
  const seen = new Map();
  for (let i = 0; i < rp.count; i++) {
    const key = `${rp.getX(i).toFixed(3)},${rp.getY(i).toFixed(3)},${rp.getZ(i).toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, 0.82 + rr() * 0.36);
    const k = seen.get(key);
    rp.setXYZ(i, rp.getX(i) * k, rp.getY(i) * k, rp.getZ(i) * k);
  }
  xf(rock, 0.3, -2.8, 0.2, 0, 0.4, 0, 4.4, 3.2, 4.0);
  rock.computeVertexNormals();
  g.add(mesh(rock, flat('#75736d', { flatShading: true }), 'tower_rock', { cast: true, receive: true }));
  return g;
}

// ---------------------------------------------------------------------------
// INTERIOR SETS

/** Unlit material showing exactly its painted colours (no tone mapping, no fog). */
function painted(color, opts = {}) {
  return unlit(color, { fog: false, toneMapped: false, ...opts });
}

function voidBox(name) {
  const m = mesh(new THREE.BoxGeometry(80, 40, 80), unlit('#000000', { side: THREE.BackSide, fog: false }), name);
  m.position.y = 10;
  m.renderOrder = -10;
  return m;
}

function inkBar(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}

function setLights(set, { sky, ground, hemi, sun, sunPos, target = [0, 0.8, -0.8], shadow = 0, shadowBox = 4 }) {
  const h = new THREE.HemisphereLight(sky, ground, hemi);
  h.name = `${set.name}_hemi`;
  // HemisphereLight takes its "up" from its normalised WORLD position; the sets sit hundreds of metres
  // from the origin, so put it very high above the set to keep the sky direction vertical.
  h.position.set(0, 1e5, 0);
  set.add(h);
  const d = new THREE.DirectionalLight('#ffffff', sun);
  d.name = `${set.name}_key`;
  d.position.fromArray(sunPos);
  d.target.position.fromArray(target);
  set.add(d, d.target);
  if (shadow) {
    d.castShadow = true;
    d.shadow.mapSize.set(shadow, shadow);
    d.shadow.camera.left = -shadowBox; d.shadow.camera.right = shadowBox;
    d.shadow.camera.top = shadowBox; d.shadow.camera.bottom = -shadowBox;
    d.shadow.camera.near = 0.5; d.shadow.camera.far = 20;
    d.shadow.bias = -0.0006; d.shadow.normalBias = 0.02;
    d.shadow.radius = 4;
  }
  return { hemi: h, key: d };
}

function buildHouseInt(anchors) {
  const set = new THREE.Group();
  set.name = 'house_int';
  set.position.fromArray(SETS.house_int.origin);
  const { width: W, depth: Dp, wallZ: WZ, wallHeight: WH } = BUILDING_DIMS.house_int;
  const zFront = WZ + Dp;

  set.add(voidBox('house_int_void'));
  // back wall: grey grunge heavier bottom-right and in the upper-left corner
  const wallTex = grungeTexture({
    w: 1024, h: Math.round((1024 * WH) / W), base: '#dedbcd', seed: 211, amount: 0.95,
    density: (u, v) => 0.12 + 0.95 * Math.pow(u, 1.5) * Math.pow(v, 0.7) + 0.55 * Math.exp(-((u - 0.1) ** 2 + (v - 0.12) ** 2) / 0.035) + 0.25 * Math.exp(-((u - 0.62) ** 2) / 0.01) * v,
  });
  const wallMat = flat('#ffffff', { map: wallTex, fog: false });
  wallMat.color.multiplyScalar(WALL_GAIN);
  set.add(mesh(xf(new THREE.PlaneGeometry(W, WH), 0, WH / 2, WZ), wallMat, 'house_int_wall', { receive: true }));
  // 玩家可以在屋里走动，所以四面都要有墙：两侧整面灰泥墙（比后墙暗一点），前墙中间是出口门洞
  const sideTex = grungeTexture({
    w: 1024, h: Math.round((1024 * WH) / Dp), base: '#d8d5c7', seed: 213, amount: 0.9,
    density: (u, v) => 0.16 + 0.55 * Math.pow(v, 0.9) * (0.55 + 0.45 * Math.sin(u * 7.3 + 1.1)) + 0.3 * Math.exp(-((u - 0.85) ** 2 + (v - 0.2) ** 2) / 0.02),
  });
  const sideMat = flat('#ffffff', { map: sideTex, fog: false });
  sideMat.color.multiplyScalar(WALL_GAIN * 0.86);
  set.add(mesh(xf(new THREE.PlaneGeometry(Dp, WH), -W / 2, WH / 2, WZ + Dp / 2, 0, Math.PI / 2, 0), sideMat, 'house_int_side_l', { receive: true }));
  set.add(mesh(xf(new THREE.PlaneGeometry(Dp, WH), W / 2, WH / 2, WZ + Dp / 2, 0, -Math.PI / 2, 0), sideMat, 'house_int_side_r', { receive: true }));
  // 前墙：围着门洞的 U 形多边形，朝屋里（-z）
  const { width: DWd, height: DHd } = BUILDING_DIMS.house_int.door;
  const frontShape = new THREE.Shape([[-W / 2, 0], [-DWd / 2, 0], [-DWd / 2, DHd], [DWd / 2, DHd], [DWd / 2, 0], [W / 2, 0], [W / 2, WH], [-W / 2, WH]]
    .map(([x, y]) => new THREE.Vector2(x, y)));
  const frontGeo = new THREE.ShapeGeometry(frontShape);
  const fp = frontGeo.attributes.position, fuv = frontGeo.attributes.uv;
  for (let i = 0; i < fp.count; i++) fuv.setXY(i, (fp.getX(i) + W / 2) / W, fp.getY(i) / WH);
  xf(frontGeo, 0, 0, zFront, 0, Math.PI, 0);
  const frontMat = flat('#ffffff', { map: grungeTexture({ w: 1024, h: Math.round((1024 * WH) / W), base: '#d4d1c3', seed: 217, amount: 0.85, density: (u, v) => 0.2 + 0.5 * Math.pow(v, 1.2) }), fog: false });
  frontMat.color.multiplyScalar(WALL_GAIN * 0.78);
  set.add(mesh(frontGeo, frontMat, 'house_int_front', { receive: true }));
  // 门框（深色木头）+ 门外的亮光（看得出那是出口）
  const fr = 0.1;
  set.add(mesh(merge([
    xf(new THREE.BoxGeometry(fr, DHd + fr, 0.14), -DWd / 2 - fr / 2, (DHd + fr) / 2, zFront - 0.05),
    xf(new THREE.BoxGeometry(fr, DHd + fr, 0.14), DWd / 2 + fr / 2, (DHd + fr) / 2, zFront - 0.05),
    xf(new THREE.BoxGeometry(DWd + fr * 2, fr, 0.14), 0, DHd + fr / 2, zFront - 0.05),
  ]), toon('#4b3829', { outline: INK }), 'house_int_doorframe', { receive: true }));
  set.add(mesh(xf(new THREE.PlaneGeometry(DWd + 0.6, DHd + 0.5), 0, (DHd + 0.5) / 2, zFront + 0.35, 0, Math.PI, 0),
    unlit('#d6dad6', { fog: false }), 'house_int_outside'));
  // 门槛 + 门外一小块亮地面（不然门洞底下会露出布景外的黑色）
  set.add(mesh(xf(new THREE.BoxGeometry(DWd, 0.03, 0.18), 0, 0.015, zFront - 0.03), toon('#4b3829', { outline: INK }), 'house_int_sill', { receive: true }));
  set.add(mesh(xf(new THREE.PlaneGeometry(DWd + 0.6, 0.4), 0, 0.002, zFront + 0.18, -Math.PI / 2, 0, 0), unlit('#c3c6c1', { fog: false }), 'house_int_outside_ground'));
  // 天花板 + 三根横梁
  set.add(mesh(xf(new THREE.PlaneGeometry(W, Dp), 0, WH, WZ + Dp / 2, Math.PI / 2, 0, 0), flat('#4a433b', { fog: false }), 'house_int_ceiling', { receive: true }));
  const beams = [];
  for (let k = 0; k < 3; k++) beams.push(xf(new THREE.BoxGeometry(W, 0.17, 0.15), 0, WH - 0.085, WZ + (Dp * (k + 0.5)) / 3));
  set.add(mesh(merge(beams), toon('#3d3027', { outline: INK }), 'house_int_beams', { receive: true }));
  // floor
  const floorMat = flat('#ffffff', { map: floorTexture({ base: '#9a9c99', seed: 215 }), fog: false });
  floorMat.color.multiplyScalar(FLOOR_GAIN);
  set.add(mesh(xf(new THREE.PlaneGeometry(W + 0.3, Dp), 0, 0, WZ + Dp / 2, -Math.PI / 2, 0, 0), floorMat, 'house_int_floor', { receive: true }));
  // ink lines: wall/floor junctions and the room's vertical corners
  const ink = unlit('#151515', { fog: false });
  set.add(mesh(merge([
    xf(inkBar(W, 0.022, 0.02), 0, 0.011, WZ + 0.01),
    xf(inkBar(W, 0.022, 0.02), 0, 0.011, zFront - 0.01),
    xf(inkBar(0.02, 0.022, Dp), -W / 2 + 0.01, 0.011, WZ + Dp / 2),
    xf(inkBar(0.02, 0.022, Dp), W / 2 - 0.01, 0.011, WZ + Dp / 2),
    xf(inkBar(0.02, WH, 0.02), -W / 2 + 0.005, WH / 2, WZ + 0.01),
    xf(inkBar(0.02, WH, 0.02), W / 2 - 0.005, WH / 2, WZ + 0.01),
    xf(inkBar(0.02, WH, 0.02), -W / 2 + 0.005, WH / 2, zFront - 0.01),
    xf(inkBar(0.02, WH, 0.02), W / 2 - 0.005, WH / 2, zFront - 0.01),
  ]), ink, 'house_int_ink'));

  setLights(set, { ...ROOM_LIGHT, sunPos: [-1.4, 3.6, 5.2], target: [0, 0.6, WZ], shadow: 1024, shadowBox: 3.2 });

  const A = (n, x, y, z, ry = 0) => addAnchor(anchors, set, `house_int.${n}`, x, y, z, ry);
  A('center', 0, 0, 0);
  A('chair', -1.3, 0, WZ + 0.72, 1.15);           // father's high chair, facing right towards the table
  A('table', -0.32, 0, WZ + 0.78);                // round table, centre-left
  A('photo', 0.02, 2.24, WZ + 0.03);              // nail / hanging point of the family photo
  A('portrait', 0.98, 2.08, WZ + 0.03);           // nail of Caroline's portrait (right, slightly lower)
  A('cabinet', 1.2, 0, WZ + 0.26);                // cabinet against the wall (front faces +z)
  A('door', 0, 0, zFront);                        // 前墙出口门洞（地面中点）
  return set;
}

function gothicWindow(name, viewTex, w, h) {
  const g = new THREE.Group();
  g.name = name;
  const glass = fitUV(new THREE.ShapeGeometry(new THREE.Shape(archPoints(w, h, 'pointed', 0, 16))));
  g.add(mesh(xf(glass, 0, 0, 0.004), painted('#ffffff', { map: viewTex }), `${name}_view`));
  const outer = extrude(archFrameShape(w + 0.1, h + 0.06, 0.1, 'pointed', true), 0.06);
  const innerF = extrude(archFrameShape(w, h, 0.05, 'pointed', true), 0.035);
  // archFrameShape(closed) puts the inner opening bottom at y = 0 → shift so both share the glass
  g.add(mesh(xf(outer, 0, -0.03, 0), toon('#a7a7a4', { outline: INK }), `${name}_frame`, { cast: true, receive: true }));
  g.add(mesh(innerF, toon('#d3d3cf', { outline: INK_FINE }), `${name}_frame_inner`, { receive: true }));
  return g;
}

function buildTempleInt(anchors) {
  const set = new THREE.Group();
  set.name = 'temple_int';
  set.position.fromArray(SETS.temple_int.origin);
  const { width: W, depth: Dp, wallZ: WZ, wallHeight: WH, ceiling } = BUILDING_DIMS.temple_int;

  set.add(voidBox('temple_int_void'));
  const wallTex = grungeTexture({
    w: 1024, h: Math.round((1024 * WH) / W), base: '#d6d4c7', seed: 311, amount: 1.1, drips: 50,
    density: (u, v) => 0.32 + 0.45 * Math.abs(Math.sin(u * 6.1 + 0.8)) * (0.5 + v) + 0.3 * Math.pow(v, 1.4),
  });
  const wallMat = flat('#ffffff', { map: wallTex, fog: false });
  wallMat.color.multiplyScalar(WALL_GAIN);
  set.add(mesh(xf(new THREE.PlaneGeometry(W, WH), 0, WH / 2, WZ), wallMat, 'temple_int_wall', { receive: true }));
  const sideMat = flat('#262624', { fog: false });
  set.add(mesh(xf(new THREE.PlaneGeometry(0.5, WH), -W / 2, WH / 2, WZ + 0.25, 0, Math.PI / 2, 0), sideMat, 'temple_int_side_l', { receive: true }));
  set.add(mesh(xf(new THREE.PlaneGeometry(0.5, WH), W / 2, WH / 2, WZ + 0.25, 0, -Math.PI / 2, 0), sideMat, 'temple_int_side_r', { receive: true }));
  const floorMat = flat('#ffffff', { map: floorTexture({ base: '#979996', seed: 315 }), fog: false });
  floorMat.color.multiplyScalar(FLOOR_GAIN);
  set.add(mesh(xf(new THREE.PlaneGeometry(W + 0.3, Dp), 0, 0, WZ + Dp / 2, -Math.PI / 2, 0, 0), floorMat, 'temple_int_floor', { receive: true }));
  const ink = unlit('#151515', { fog: false });
  set.add(mesh(merge([
    xf(inkBar(W, 0.024, 0.02), 0, 0.012, WZ + 0.01),
    xf(inkBar(0.02, WH, 0.02), -W / 2 + 0.005, WH / 2, WZ + 0.01),
    xf(inkBar(0.02, WH, 0.02), W / 2 - 0.005, WH / 2, WZ + 0.01),
  ]), ink, 'temple_int_ink'));

  // two gothic windows with a painted mountain view
  const view = windowViewTexture(7);
  const ww = 1.1, wh = 1.72, wy = 1.74, wx = 1.75;
  const wl = gothicWindow('temple_int_windowL', view, ww, wh);
  wl.position.set(-wx, wy, WZ + 0.005);
  const wr = gothicWindow('temple_int_windowR', view, ww, wh);
  wr.position.set(wx, wy, WZ + 0.005);
  set.add(wl, wr);

  // rope from the ceiling down to the winged holder (pivot at the ceiling)
  const fontZ = WZ + 1.6, holderY = 2.35;
  const ropeLen = ceiling - holderY;
  const ropeGeo = xf(new THREE.CylinderGeometry(0.017, 0.017, 1, 8, 1, true), 0, -0.5, 0);
  const rope = mesh(ropeGeo, toon('#9a8f7c', { outline: 0.003 }), 'temple_int_rope', { cast: true });
  rope.position.set(0, ceiling, fontZ);
  rope.scale.y = ropeLen;
  /** Move the rope's lower end to local height y (e.g. follow the holder while it lowers). */
  rope.setBottom = (yLocal) => { rope.scale.y = Math.max(0.01, ceiling - yLocal); };
  set.add(rope);

  setLights(set, { ...ROOM_LIGHT, sunPos: [0.8, 4.4, 6.0], target: [0, 1.0, WZ + 1.0], shadow: 1024, shadowBox: 3.8 });

  const A = (n, x, y, z, ry = 0) => addAnchor(anchors, set, `temple_int.${n}`, x, y, z, ry);
  A('center', 0, 0, 0);
  A('font', 0, 0, fontZ);
  A('holder', 0, holderY, fontZ);
  A('windowL', -wx, wy + wh / 2, WZ + 0.06);
  A('windowR', wx, wy + wh / 2, WZ + 0.06);
  return set;
}

// --- memory stage ---------------------------------------------------------

function memoryBackdropTexture() {
  return canvasTexture(2048, 768, (g, w, h) => {
    const r = rng(501);
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#a7babf'); sky.addColorStop(0.55, '#b9c9cc'); sky.addColorStop(1, '#adbbbc');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    const Y = (m) => h - (m / 9) * h;         // metres above the shore -> canvas y (backdrop is 9 m tall)
    const X = (m) => ((m + 13) / 26) * w;     // metres from centre -> canvas x (26 m wide)
    const fillPoly = (pts) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
      g.closePath();
    };
    // distant rocky range
    const range = [[-13, 0]];
    for (let x = -13; x <= 13.01; x += 0.3) {
      const n = Math.sin(x * 1.7) * 0.22 + Math.sin(x * 0.63 + 1) * 0.32 + Math.sin(x * 3.9) * 0.1 + (r() - 0.5) * 0.16;
      range.push([x, 1.85 + n + (x > 0 && x < 3 ? 0.35 * Math.sin((x / 3) * Math.PI) : 0)]);
    }
    range.push([13, 0]);
    paintMountains(g, r, range.slice(1, -1).map(([x, y]) => [X(x), Y(y)]), h,
      { top: '#a19fa8', bot: '#86868e', strokes: 2600, size: 1.1, ink: 0.35, light: '226,224,232', dark: '62,60,72' });
    // big grey rock mass on the left
    const cliff = [[-13, 0], [-13, 3.2], [-11.2, 3.35], [-10.2, 3.7], [-9.2, 4.05], [-8.5, 3.75], [-7.8, 3.2], [-7.1, 2.6], [-6.4, 1.8], [-5.7, 1.0], [-5.0, 0.35], [-4.6, 0]];
    const cliffRidge = ridgeLine(r, cliff.slice(1, -1).map(([x, y]) => [X(x), Y(y)]), 10, 8);
    paintMountains(g, r, [[0, Y(0)], ...cliffRidge, [X(-4.6), Y(0)]], h,
      { top: '#8b8990', bot: '#6c6b72', strokes: 2600, size: 1.4, ink: 0.5, light: '214,212,220', dark: '40,40,50' });
    // meadow band rising from the shore + conifer strip along the water
    const meadowTop = (x) => 1.0 + Math.sin(x * 0.9) * 0.18 + Math.sin(x * 2.3) * 0.07 - Math.max(0, -4 - x) * 0.4;
    const meadow = [[-5.6, 0]];
    for (let x = -5.6; x <= 13; x += 0.2) meadow.push([x, meadowTop(x)]);
    meadow.push([13, 0]);
    fillPoly(meadow);
    const mg = g.createLinearGradient(0, Y(1.2), 0, Y(0));
    mg.addColorStop(0, '#aaa775'); mg.addColorStop(0.6, '#93986a'); mg.addColorStop(1, '#6f7c5a');
    g.fillStyle = mg; g.fill();
    g.save(); g.clip();
    for (let i = 0; i < 1400; i++) {
      const x = X(-5.6 + r() * 18.6), y = Y(r() * 1.2);
      g.fillStyle = r() < 0.5 ? 'rgba(200,196,140,0.18)' : 'rgba(70,84,60,0.2)';
      g.fillRect(x, y, 3 + r() * 10, 1 + r() * 2);
    }
    g.restore();
    for (let i = 0; i < 700; i++) {
      const x = -5.4 + r() * 18.4, hh = 0.12 + r() * 0.36;
      g.fillStyle = r() < 0.6 ? 'rgba(62,74,62,0.8)' : 'rgba(88,100,74,0.75)';
      g.beginPath(); g.moveTo(X(x), Y(hh + 0.02)); g.lineTo(X(x + 0.06), Y(0.02)); g.lineTo(X(x - 0.06), Y(0.02)); g.closePath(); g.fill();
    }
    // small red-roofed cottage on the right shore
    g.fillStyle = '#d4cbc0'; g.fillRect(X(7.6), Y(0.6), X(8.4) - X(7.6), Y(0.16) - Y(0.6));
    g.fillStyle = '#9a4033';
    g.beginPath(); g.moveTo(X(7.48), Y(0.6)); g.lineTo(X(8.0), Y(0.9)); g.lineTo(X(8.52), Y(0.6)); g.closePath(); g.fill();
    g.fillStyle = '#4a3c36'; g.fillRect(X(7.92), Y(0.4), X(8.04) - X(7.92), Y(0.16) - Y(0.4));
    // haze (stronger high up) + watercolour grain
    const hz = g.createLinearGradient(0, 0, 0, h);
    hz.addColorStop(0, 'rgba(182,198,202,0.6)'); hz.addColorStop(0.45, 'rgba(182,198,202,0.25)'); hz.addColorStop(1, 'rgba(182,198,202,0.1)');
    g.fillStyle = hz; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 20000; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '40,46,52'},${r() * 0.05})`;
      g.fillRect(r() * w, r() * h, 2, 2);
    }
  }, { wrap: false });
}

function memoryLakeTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    const r = rng(503);
    const grd = g.createLinearGradient(0, 0, 0, h);   // top = far shore
    grd.addColorStop(0, '#8c9599'); grd.addColorStop(0.35, '#848d91'); grd.addColorStop(1, '#7b8185');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // reflections of the far shore just under the waterline, horizontal light streaks
    const rf = g.createLinearGradient(0, 0, 0, h * 0.2);
    rf.addColorStop(0, 'rgba(90,100,84,0.35)'); rf.addColorStop(1, 'rgba(90,100,84,0)');
    g.fillStyle = rf; g.fillRect(0, 0, w, h * 0.2);
    for (let i = 0; i < 220; i++) {
      const y = Math.pow(r(), 1.4) * h * 0.8, x = r() * w;
      g.fillStyle = r() < 0.45 ? 'rgba(70,80,76,0.10)' : 'rgba(205,214,218,0.16)';
      g.fillRect(x, y, 20 + r() * 140, 1 + r() * 2.5);
    }
  }, { wrap: false });
}

function memoryGroundTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    const r = rng(505);
    const grd = g.createLinearGradient(0, 0, 0, h);   // top = far edge (meets the lake)
    grd.addColorStop(0, '#7b8084'); grd.addColorStop(0.3, '#7d7e83'); grd.addColorStop(1, '#6a6b70');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 12000; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '30,30,34'},${r() * 0.06})`;
      g.fillRect(r() * w, r() * h, 2, 1 + r() * 2);
    }
  }, { wrap: false });
}

/** Greyscale alpha map (opaque canvas, so no premultiplied banding): white = dense mist. */
function mistAlpha(seed, top, bottom) {
  return canvasTexture(256, 512, (g, w, h) => {
    const r = rng(seed);
    const img = g.createImageData(w, h);
    const low = valueNoise(r, 6, 6);
    for (let y = 0; y < h; y++) {
      const v = y / h;
      const base = top + (bottom - top) * Math.pow(v, 0.8);
      for (let x = 0; x < w; x++) {
        const a = base * (0.75 + 0.5 * low((x / w) * 6, v * 6)) + (r() - 0.5) * 0.03;
        const c = Math.max(0, Math.min(255, a * 255));
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = c; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }, { wrap: true, srgb: false });
}

/** Alpha map for a foggy trunk: opaque top, soft edges, fading out towards the ground. */
function trunkAlpha() {
  return canvasTexture(64, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const v = y / h;
      const fade = v < 0.45 ? 1 : Math.max(0, 1 - (v - 0.45) / 0.55);
      for (let x = 0; x < w; x++) {
        const u = x / (w - 1);
        const edge = Math.min(1, Math.min(u, 1 - u) / 0.22);
        const stripe = 0.85 + 0.15 * Math.sin(u * 19 + 1.3);
        const c = Math.round(255 * fade * edge * stripe);
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = c; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }, { wrap: false, srgb: false });
}

function puddleShape(rx, rz, seed, wobble) {
  const r = rng(seed);
  const pts = [];
  const N = 80;
  const ph = [r() * TAU, r() * TAU, r() * TAU, r() * TAU];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const k = 1 + wobble * (0.5 * Math.sin(a * 3 + ph[0]) + 0.3 * Math.sin(a * 5 + ph[1]) + 0.25 * Math.sin(a * 9 + ph[2]) + 0.15 * Math.sin(a * 14 + ph[3]));
    pts.push(new THREE.Vector2(Math.cos(a) * rx * k, Math.sin(a) * rz * k));
  }
  return new THREE.Shape(pts);
}

function buildMemory(anchors) {
  const set = new THREE.Group();
  set.name = 'memory';
  set.position.fromArray(SETS.memory.origin);
  const BZ = BUILDING_DIMS.memory.backdropZ;
  const SHORE = -1.4;                                   // ground meets the lake here

  const surround = mesh(new THREE.BoxGeometry(80, 40, 80), painted('#2c3134', { side: THREE.BackSide }), 'memory_void');
  surround.position.y = 10; surround.renderOrder = -10;
  set.add(surround);

  // painted lake & mountain backdrop + lake surface + misty ground (all unlit: painted look)
  set.add(mesh(xf(new THREE.PlaneGeometry(26, 9), 0, 4.5 - 0.05, BZ), painted('#ffffff', { map: memoryBackdropTexture() }), 'memory_backdrop'));
  const lakeLen = SHORE - BZ;
  set.add(mesh(xf(new THREE.PlaneGeometry(26, lakeLen), 0, -0.01, BZ + lakeLen / 2, -Math.PI / 2, 0, 0), painted('#ffffff', { map: memoryLakeTexture() }), 'memory_lake'));
  set.add(mesh(xf(new THREE.PlaneGeometry(26, 10), 0, 0, SHORE + 5, -Math.PI / 2, 0, 0), painted('#ffffff', { map: memoryGroundTexture() }), 'memory_ground'));

  // blood puddle around the coffin: pinkish-brown rim, dark maroon body, a few glossy streaks
  const puddle = new THREE.Group();
  puddle.name = 'memory_puddle';
  puddle.position.set(0, 0, -0.25);
  const pm = (c, o) => painted(c, { polygonOffset: true, polygonOffsetFactor: o, polygonOffsetUnits: o });
  const layer = (shape, color, o, y, name) => {
    const m = mesh(xf(new THREE.ShapeGeometry(shape), 0, 0, 0, -Math.PI / 2, 0, 0), pm(color, o), name);
    m.position.y = y;
    puddle.add(m);
    return m;
  };
  layer(puddleShape(3.3, 0.72, 11, 0.12), '#7e605c', -1, 0.004, 'memory_puddle_rim');
  layer(puddleShape(2.95, 0.55, 13, 0.13), '#553e3d', -2, 0.008, 'memory_puddle_blood');
  layer(puddleShape(1.9, 0.3, 17, 0.2), '#4a3433', -3, 0.012, 'memory_puddle_core');
  const gloss = mesh(merge([
    xf(new THREE.PlaneGeometry(1.1, 0.03), -1.3, 0, 0.32, -Math.PI / 2, 0, 0.04),
    xf(new THREE.PlaneGeometry(0.7, 0.025), 1.7, 0, 0.36, -Math.PI / 2, 0, -0.03),
    xf(new THREE.PlaneGeometry(0.45, 0.02), 0.5, 0, -0.42, -Math.PI / 2, 0, 0.02),
  ]), pm('#8a6865', -4), 'memory_puddle_gloss');
  gloss.position.y = 0.016;
  puddle.add(gloss);
  set.add(puddle);

  // faint tree trunks in the fog (one instanced draw, unlit, alpha-mapped)
  const trunkMat = painted('#5a6870', { alphaMap: trunkAlpha(), transparent: true, opacity: 0.5, depthWrite: false });
  const trunkGeo = xf(new THREE.PlaneGeometry(1, 1), 0, 0.5, 0);
  const tr = rng(507);
  const N = 18;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
  trunks.name = 'memory_trunks';
  const tm = new THREE.Matrix4(), tc = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const x = -10.5 + (i + 0.5) * (21 / N) + (tr() - 0.5) * 0.9;
    const z = -2.7 - tr() * 4.1;
    const wdt = 0.3 + tr() * 0.75;
    tm.compose(_p.set(x, 0.6 + tr() * 0.8, z), _q.identity(), _s.set(wdt, 10 + tr() * 3, 1));
    trunks.setMatrixAt(i, tm);
    const l = tr();
    tc.setRGB(0.75 + l * 0.6, 0.75 + l * 0.6, 0.75 + l * 0.6);
    trunks.setColorAt(i, tc);
  }
  trunks.renderOrder = 1;
  set.add(trunks);

  // layered mist planes (alpha maps drift slowly via update)
  const mists = [];
  const addMist = (z, top, bottom, seed, w, hgt, y0, order) => {
    const t = mistAlpha(seed, top, bottom);
    const m = mesh(xf(new THREE.PlaneGeometry(w, hgt), 0, y0 + hgt / 2, z), painted('#b6c5c9', { alphaMap: t, transparent: true, depthWrite: false }), `memory_mist_${mists.length}`);
    m.renderOrder = order;
    set.add(m);
    mists.push({ tex: t, speed: 0.004 + mists.length * 0.0025 });
  };
  addMist(-6.4, 0.42, 0.08, 521, 30, 9, -0.1, 2);
  addMist(-4.4, 0.36, 0.06, 523, 30, 9, -0.1, 3);
  addMist(-2.3, 0.3, 0.03, 525, 30, 9, -0.1, 4);
  addMist(2.6, 0.14, 0.0, 527, 14, 6, -0.2, 5);   // faint veil in front of the family

  // huge thin black line rectangle hanging behind the family
  const frame = new THREE.Group();
  frame.name = 'memory_frame';
  const fw = 2.3, fh = 2.25, ft = 0.026;
  const lineMat = unlit('#161616', { fog: false });
  const bars = [
    ['memory_frame_top', fw + ft, ft, 0, fh / 2],
    ['memory_frame_bottom', fw + ft, ft, 0, -fh / 2],
    ['memory_frame_left', ft, fh, -fw / 2, 0],
    ['memory_frame_right', ft, fh, fw / 2, 0],
  ];
  for (const [n, bw, bh, x, y] of bars) {
    const b = mesh(new THREE.BoxGeometry(bw, bh, 0.01), lineMat, n);
    b.position.set(x, y, 0);
    frame.add(b);
  }
  frame.position.set(-0.05, 1.95, -1.7);
  set.add(frame);

  // cool, slightly sepia-grey light for the masked family and the coffin
  setLights(set, { sky: '#dfe5e6', ground: '#5f5352', hemi: 1.8, sun: 1.6, sunPos: [-2.4, 4.5, 6], target: [0, 1, -0.6], shadow: 0 });

  const A = (n, x, y, z, ry = 0) => addAnchor(anchors, set, `memory.${n}`, x, y, z, ry);
  A('center', 0, 0, 0);
  A('coffin', 0.05, 0, -0.2, 0);                // coffin lengthwise along local x, lid up, in the puddle
  A('family0', -1.8, 0, -0.55, 0.35);           // boar (Gerard), turned slightly towards the centre
  A('family1', -0.9, 0, -0.85, 0.12);           // pheasant (Elizabeth)
  A('family2', 0.0, 0, -1.0, 0);                // deer (Nicholas), tallest, centre
  A('family3', 0.88, 0, -0.85, -0.05);          // rabbit (David)
  A('family4', 1.68, 0, -0.55, -0.45);          // pigeon (Margaret), turned towards the centre
  const fa = A('frame', frame.position.x, frame.position.y, frame.position.z, 0);
  fa.userData.size = [fw, fh];

  set.userData.update = (dt) => {
    for (const m of mists) m.tex.offset.x = (m.tex.offset.x + dt * m.speed) % 1;
  };
  return set;
}

// ---------------------------------------------------------------------------

export function buildBuildings() {
  const anchors = new Map();
  const exterior = new THREE.Group();
  exterior.name = 'buildings_exterior';
  exterior.add(buildHouse(anchors), buildShedWall(anchors), buildTemple(anchors), buildTower());

  const sets = {
    house_int: buildHouseInt(anchors),
    temple_int: buildTempleInt(anchors),
    memory: buildMemory(anchors),
  };

  exterior.updateMatrixWorld(true);
  for (const s of Object.values(sets)) s.updateMatrixWorld(true);

  return {
    exterior,
    sets,
    anchors,
    /** Optional per-frame hook (memory mist drift). Safe to skip. */
    update(dt, t) {
      sets.memory.userData.update?.(dt, t);
    },
  };
}
