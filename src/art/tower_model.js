// 网格石塔（src/art/models/tower.rlpm）：八角形四层石塔，用户给的 AI 模型减面 + 烘贴图后的静态网格。
// 底面中心在原点、底面 y = 0，高 38 m（比岛上约 25 m 的森林树冠高出一截，从南面远景能看到塔顶）。
// 没加载成功时 buildings.js 回退到程序化三层石塔。
import * as THREE from 'three';
import { flat } from './materials.js';

export function makeTowerModel(m, pos) {
  const g = new THREE.Group();
  g.name = 'tower';
  g.position.set(pos[0], pos[1] - 0.4, pos[2]);     // 底面稍微埋进岩石平台
  g.rotation.y = 0.12;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
  geo.setIndex(new THREE.BufferAttribute(m.index, 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, flat('#ffffff', { map: m.texture }));
  mesh.name = 'tower_body'; mesh.castShadow = true; mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}
