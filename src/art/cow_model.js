// 网格牛（src/art/models/cow.rlpm）：静态网格，大小和程序化牛一致（高 2.3 m，世界里再 ×1.25），接口一样：
// 根节点 p5_cow、网格名 cow_body（热点点它进斑点谜题）、setState({ cured, meat })。
// 谜题用的彩色斑点和肉的伤口是叠在牛身上的小圆片（按牛身的真实表面位置放），治好后斑点消失、取肉时露出伤口。
import * as THREE from 'three';
import { toon } from './materials.js';

const COLORS = ['#7eacb4', '#d09cb9', '#d6b965', '#9273b6', '#9eae68'];
// 斑点在牛侧面（+z 一侧，朝向镜头）的位置 [x, y]；沿 -z 方向射线找到表面再贴上去
const LESIONS = [[-0.85, 1.5], [-0.45, 1.2], [-0.1, 1.68], [0.2, 1.38], [-0.62, 1.72], [0.42, 1.55]];
const WOUND = [-0.15, 1.28];

export function makeCowModel(m) {
  const root = new THREE.Group(); root.name = 'p5_cow';
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  g.computeBoundingSphere();
  const body = new THREE.Mesh(g, toon('#ffffff', { map: m.texture }));
  body.name = 'cow_body'; body.castShadow = true; root.add(body);
  root.updateMatrixWorld(true);

  const ray = new THREE.Raycaster(), n = new THREE.Vector3(), q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1);
  const stick = (x, y, mesh) => {
    ray.set(new THREE.Vector3(x, y, 3), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(body)[0];
    if (!hit) return false;
    n.copy(hit.face.normal).normalize();
    mesh.position.copy(hit.point).addScaledVector(n, 0.012);
    mesh.quaternion.copy(q.setFromUnitVectors(z, n));
    return true;
  };
  const lesions = LESIONS.map(([x, y], i) => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 12), toon(COLORS[i % 5]));
    d.name = 'cow_lesion'; d.scale.set(1, 1, 0.45);
    if (stick(x, y, d)) root.add(d); else d.visible = false;
    return d;
  });
  const wound = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 12), toon('#9e3a37'));
  wound.name = 'cow_wound'; wound.scale.set(0.9, 1.2, 0.2);
  if (stick(WOUND[0], WOUND[1], wound)) root.add(wound);

  root.setState = ({ cured = false, meat = false } = {}) => { lesions.forEach((o) => { o.visible = !cured; }); wound.visible = meat; };
  root.setState();
  return root;
}
