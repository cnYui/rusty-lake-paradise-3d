// 网格苍蝇人（src/art/models/fly.rlpm）：接口和 props_flies_creatures.js 的 makeFlyMan 完全一致——
// 根节点 p4_flyman、setKneel(k) / kneel() / update(dt, t)（悬停时翅膀高速扇动，跪下进食时收翅）。
// 骨架：pelvis / torso / head / 双臂 + 前臂 / 双腿 + 小腿 / 双翅；绑定姿势是模型本来的 T 字手臂 + 八字腿，休息姿势是手臂和腿竖直向下。
import * as THREE from 'three';
import { toon } from './materials.js';
import { boneInverses } from './rlpm.js';

const lerp = (a, b, k) => a + (b - a) * k;

export function makeFlyModel(m) {
  const hdr = m.hdr;
  const root = new THREE.Group(); root.name = 'p4_flyman';
  const body = new THREE.Group(); body.name = 'fly_body'; root.add(body);
  const J = {};
  hdr.joints.forEach((name, i) => {
    const b = new THREE.Bone(); b.name = 'fly_' + name; b.position.fromArray(hdr.offsets[name]);
    (hdr.parents[i] ? J[hdr.parents[i]] : body).add(b); J[name] = b;
  });
  const skeleton = new THREE.Skeleton(hdr.joints.map((n) => J[n]), boneInverses(hdr));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(m.skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(m.skinWeight, 4));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 2.4);
  const mesh = new THREE.SkinnedMesh(g, toon('#ffffff', { map: m.texture, outline: 0.0034 }));
  mesh.name = 'fly_mesh'; mesh.castShadow = true; mesh.frustumCulled = false;
  body.add(mesh);
  mesh.bind(skeleton, new THREE.Matrix4());

  const baseY = hdr.offsets.pelvis[1];
  // 跪下：大腿竖直、膝盖落在地面附近（骨盆高度 = 大腿长），所以下降量由腿长算出，不是固定值
  const drop = Math.max(0.2, baseY - Math.abs(hdr.offsets.kneeL[1]) * 1.02);
  let kneel = 0;
  root.setKneel = (k) => {
    kneel = Math.min(1, Math.max(0, k));
    J.pelvis.position.y = baseY - drop * kneel;
    J.torso.rotation.x = lerp(0.28, 1.2, kneel);
    J.head.rotation.x = lerp(0.05, -0.62, kneel);
    for (const s of ['L', 'R']) {
      J['arm' + s].rotation.x = lerp(-0.18, -1.28, kneel); J['fore' + s].rotation.x = lerp(-0.55, -0.1, kneel);
      J['hip' + s].rotation.x = lerp(0.22, 0, kneel); J['knee' + s].rotation.x = lerp(0.4, 1.52, kneel);
    }
  };
  root.kneel = () => kneel;
  root.setKneel(0);
  root.update = (dt, t) => {
    const flap = 1 - 0.8 * kneel;
    J.wingL.rotation.y = 0.2 + Math.sin(t * 55) * 0.38 * flap;
    J.wingR.rotation.y = -(0.2 + Math.sin(t * 55) * 0.38 * flap);
    body.position.y = Math.sin(t * 3.7) * 0.045 * (1 - kneel);
  };
  return root;
}
