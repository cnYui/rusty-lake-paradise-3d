// 第二灾道具的几何组合工具；材质按对象缓存，避免读档恢复污染物品图标。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, unlit, canvasTexture } from './materials.js';
import { animate, Ease } from '../core/tween.js';
export { THREE, toon, unlit, canvasTexture, animate, Ease };
export const TAU = Math.PI * 2;
export const clamp = (x) => Math.max(0, Math.min(1, x));
export const seg = (k, a, b) => clamp((k - a) / (b - a));
export function mesh(parent, geo, mat, name, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat); m.name = name || ''; m.position.fromArray(pos); m.rotation.fromArray(rot);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
export const lathe = (p, n = 48) => new THREE.LatheGeometry(p.map(([r, y]) => new THREE.Vector2(r, y)), n);
export function rod(a, b, r = 0.01, sides = 8, r2 = r) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), d = to.clone().sub(from);
  const g = new THREE.CylinderGeometry(r2, r, d.length(), sides);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(...from.add(to).multiplyScalar(0.5).toArray()); return g;
}
export function merge(parent, geos, mat, name) {
  const clean = geos.map((g) => { const c = g.index ? g.toNonIndexed() : g.clone(); if(!mat.map)c.deleteAttribute('uv'); return c; });
  const combined = mergeGeometries(clean); clean.forEach((g) => g.dispose()); geos.forEach((g) => g.dispose());
  return mesh(parent, combined, mat, name);
}
export function hit(parent, name, size, pos = [0, 0, 0]) {
  const m = mesh(parent, new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ visible: false }), name, pos); m.userData.proxy = true; return m;
}
export function motion(ms, pose, { instant = false } = {}) {
  if (instant) { pose(1); return Promise.resolve(); } return animate(ms, pose, Ease.linear);
}
export function woodMaterial(color = '#8e644c', seed = 1) {
  const tex = canvasTexture(256, 512, (g) => {
    g.fillStyle = color; g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 65; i++) {
      const x = (i * 37 + seed * 17) % 256;
      g.strokeStyle = i % 3 ? 'rgba(38,22,12,.15)' : 'rgba(236,210,161,.17)'; g.lineWidth = i % 4 ? 1 : 2;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 8, 170, x - 6, 350, x + 4, 512); g.stroke();
    }
    g.strokeStyle = 'rgba(37,23,14,.28)'; g.lineWidth = 2;
    for (const [x, y] of [[72, 170], [185, 376]]) for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(x, y, 3 + i * 3, 7 + i * 9, 0, 0, TAU); g.stroke(); }
  });
  return toon('#ffffff', { map: tex });
}
