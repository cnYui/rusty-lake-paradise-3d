// 第五灾模型的小工具：建模辅助函数，食物 / 菜园 / 道具文件共用。
import * as THREE from 'three';
import { toon, unlit, canvasTexture } from './materials.js';

export const PI = Math.PI;
export const COLORS = ['#7eacb4', '#d09cb9', '#d6b965', '#9273b6', '#9eae68'];

export const group = (name) => { const g = new THREE.Group(); g.name = name; return g; };
export const add = (g, o, name, p = [0, 0, 0]) => { o.name = name; o.position.fromArray(p); g.add(o); return o; };
export const box = (g, name, size, color, p = [0, 0, 0], mat = null) => add(g, new THREE.Mesh(new THREE.BoxGeometry(...size), mat || toon(color)), name, p);
export const ball = (g, name, r, color, p, scale = [1, 1, 1], opts = {}) => { const o = add(g, new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12), toon(color, opts)), name, p); o.scale.fromArray(scale); return o; };
export const cyl = (g, name, r, h, color, p, sides = 24, opts = {}) => add(g, new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, sides), toon(color, opts)), name, p);
export const ring = (g, name, r, tube, color, p, opts = {}) => add(g, new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 32), toon(color, opts)), name, p);

export function clear(g) {
  g.traverse((o) => { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach((m) => m.dispose()); });
  g.clear();
}

/** 世界里的文字牌（只给公告 / 菜单用；谜题本身不再用文字牌）。 */
export function label(text, width = 2, height = 0.3, { color = '#352e29', background = null } = {}) {
  const texture = canvasTexture(1024, Math.max(64, Math.round(1024 * height / width)), () => {}, { wrap: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), unlit('#ffffff', { map: texture, transparent: true, side: THREE.DoubleSide }));
  mesh.setText = (value, tint = color) => {
    const c = texture.image, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    if (background) { g.fillStyle = background; g.fillRect(0, 0, c.width, c.height); }
    g.fillStyle = tint; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = Math.round(c.height * 0.68);
    g.font = `600 ${size}px "Microsoft YaHei", sans-serif`;
    while (g.measureText(String(value)).width > 990 && size > 22) { size -= 4; g.font = `600 ${size}px "Microsoft YaHei", sans-serif`; }
    g.fillText(String(value), c.width / 2, c.height / 2); texture.needsUpdate = true;
  };
  mesh.setText(text); return mesh;
}

/** 两点之间的一根细圆柱（连线、绳子）。 */
export function rod(g, a, b, r, color, mat = null) {
  const d = new THREE.Vector3().subVectors(b, a);
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), mat || unlit(color));
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(o);
  return o;
}
