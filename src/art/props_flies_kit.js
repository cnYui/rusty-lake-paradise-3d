// 第四灾模型共用的小工具：分组、球、杆、渐细管、合并几何和画布标签。
import * as THREE from 'three';
import { toon, unlit, canvasTexture } from './materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ink = '#191b18', TAU = Math.PI * 2;

export const group = (name) => { const g = new THREE.Group(); g.name = name; return g; };
export const mesh = (parent, geo, mat, pos = [0, 0, 0], name = '') => {
  const m = new THREE.Mesh(geo, mat); m.position.fromArray(pos); if (name) m.name = name; parent.add(m); return m;
};
export const ball = (parent, pos, size, mat, name) => {
  const m = mesh(parent, new THREE.SphereGeometry(1, 20, 14), mat, pos, name); m.scale.fromArray(size); return m;
};
export const bar = (parent, a, b, radius, mat, radiusEnd = radius * 0.8) => {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va);
  const m = mesh(parent, new THREE.CylinderGeometry(radiusEnd, radius, d.length(), 10), mat);
  m.position.copy(va.add(vb).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
};

/** 沿曲线渐细的管（触角、喙、鸟喙、腿）。points 为 [x,y,z] 列表，r0 起点半径，r1 终点半径。 */
export function taperedTube(points, r0, r1, mat, { radial = 8, segments = 18 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const frames = curve.computeFrenetFrames(segments, false);
  const pos = [], idx = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, c = curve.getPoint(u), r = r0 + (r1 - r0) * u;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU, n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).add(frames.binormals[i].clone().multiplyScalar(Math.sin(a)));
      pos.push(c.x + n.x * r, c.y + n.y * r, c.z + n.z * r);
    }
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + (j + 1) % radial, c = (i + 1) * radial + j, d = (i + 1) * radial + (j + 1) % radial;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/** 把一批几何体（同属性）合并成一个网格，减少 draw call。 */
export function merged(geos, mat) {
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of list) { for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key); }
  return new THREE.Mesh(mergeGeometries(list, false), mat);
}

/** 带位置、旋转、缩放的几何体副本。 */
export function placed(geo, { pos = [0, 0, 0], rot = [0, 0, 0], order = 'XYZ', quat = null, scale = [1, 1, 1] } = {}) {
  const g = geo.clone();
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), quat || new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], order)), new THREE.Vector3(...scale)));
  return g;
}

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

const baseKeys = new Set(Object.keys(new THREE.Group()));
/**
 * 把模型按系数 k 缩到真实大小：包一层外壳，内部缩放，世界里 scale 仍为 1。
 * 内部挂的方法（setOpen / setState / update …）原样搬到外壳上。
 */
export function bake(root, k, name = root.name) {
  const outer = group(name); root.name = `${name}_inner`; root.scale.setScalar(k); outer.add(root);
  for (const key of Object.keys(root)) if (!baseKeys.has(key)) outer[key] = root[key];
  outer.userData = root.userData;
  return outer;
}

export { THREE, toon, unlit, canvasTexture };
