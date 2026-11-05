// 网格牛（src/art/models/cow.rlpm）：静态网格，大小和程序化牛一致（高 2.3 m，世界里再 ×1.25），接口一样：
// 根节点 p5_cow、网格名 cow_body、setState({ cured, meat, pairs, selected })、userData.dots。
// 谜题是直接点牛身上的 10 颗彩色疫斑：同色两颗配成一对，五对配完牛就治好了（原作 0:30 的牛皮斑点图）。
// 疫斑和取肉的伤口都是贴在牛身真实表面上的小凸起（沿 -z 方向射线找到表面再贴上去），玩家点的就是牛模型本身。
import * as THREE from 'three';
import { toon } from './materials.js';
import { group, ring, ball } from './p5_kit.js';

const COLORS = ['#7eacb4', '#d09cb9', '#d6b965', '#9273b6', '#9eae68'];
// 10 颗疫斑的颜色序号，和章节 rules.js 的 COW_PAIRS 一致（0:30 原作里蓝灰 / 粉 / 黄 / 紫 / 绿各一对）
const SPOT_COLORS = [0, 1, 2, 3, 4, 2, 0, 4, 1, 3];
// 斑点在牛侧面（+z 一侧，朝向镜头）的位置 [x, y]
const SPOTS = [[-0.95, 1.52], [-0.6, 1.78], [-0.18, 1.7], [0.18, 1.6], [0.62, 1.5], [-0.82, 1.2], [-0.45, 1.02], [-0.05, 1.28], [0.3, 1.06], [0.52, 1.26]];
const WOUND = [-0.15, 1.28];

/** 把疫斑和伤口贴到 body 的表面上，给 root 加 setState 和 userData.dots。 */
export function attachCowSpots(root, body) {
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), n = new THREE.Vector3(), q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1), local = new THREE.Vector3();
  const stick = (x, y, object, lift = 0.012) => {
    ray.set(new THREE.Vector3(x, y, 3), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(body)[0];
    if (!hit) return false;
    n.copy(hit.face.normal).normalize();
    local.copy(hit.point).addScaledVector(n, lift);
    object.position.copy(root.worldToLocal(local));
    object.quaternion.copy(q.setFromUnitVectors(z, n));
    return true;
  };
  const dots = SPOTS.map(([x, y], i) => {
    const d = group(`cow_spot_${i}`);
    const sore = ball(d, 'cow_lesion', 0.082, COLORS[SPOT_COLORS[i]], [0, 0, 0], [1, 1, 0.5]);
    ring(d, 'cow_sore_ring', 0.092, 0.012, '#5a2a22', [0, 0, -0.004], { outline: false });
    const sel = ring(d, 'cow_selected', 0.15, 0.016, '#f0c95e', [0, 0, 0.02], { outline: false, emissive: '#f0c95e' }); sel.visible = false;
    // 看不见的大一圈的点击区：疫斑本身只有 13 cm，从 5 米外点太费劲
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'cow_spot_hit'; hit.userData.proxy = true; d.add(hit);
    d.userData.sel = sel;
    d.userData.placed = stick(x, y, d);
    if (d.userData.placed) root.add(d);
    return d;
  });
  const woundGroup = group('cow_wound_group');
  ball(woundGroup, 'cow_wound', 0.19, '#9e3a37', [0, 0, 0], [0.9, 1.2, 0.2]);
  if (stick(WOUND[0], WOUND[1], woundGroup)) root.add(woundGroup);
  root.userData.dots = dots;
  root.setState = ({ cured = false, meat = false, pairs = [], selected = null } = {}) => {
    dots.forEach((d, i) => { d.visible = d.userData.placed && !cured && !pairs.includes(i); d.userData.sel.visible = selected === i; });
    woundGroup.visible = meat;
  };
  root.setState();
}

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
  attachCowSpots(root, body);
  return root;
}
