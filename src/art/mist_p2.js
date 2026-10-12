// 第二灾的森林雾带：视频里森林各处（白树空地、Ida 的空地、石屋前）横着飘几条白色的雾，第一灾没有。
//
//   buildForestMist({ bands }) → { group, update(dt, t, camera), setOpacity(k, { ms }) }
//
// 做法：一个 InstancedMesh（1 个 draw call），每条雾是一张绕 y 轴转向相机的竖直面片，贴一张
// 两头淡出的横向雾纹；离相机太近的雾带缩小到看不见，避免脸贴着一张半透明片。
import * as THREE from 'three';
import { canvasTexture, rng, noOutline } from './materials.js';
import { animate, Ease } from '../core/tween.js';

// 雾带（x, y, z, 宽, 高, 漂移速度）——集中在森林里的几块空地和小路上方
export const DEFAULT_BANDS = [
  // 森林小路 / 白树空地（Gerard）
  [0, 2.2, 28, 14, 1.3, 0.25], [-3, 3.4, 22, 18, 1.0, -0.2], [4, 1.6, 18, 16, 1.1, 0.3], [-6, 2.8, 12, 20, 1.2, 0.18],
  [6, 4.2, 14, 16, 0.9, -0.22],
  // Ida 的空地（原水泵空地）
  [15, 2.0, 6, 16, 1.2, -0.25], [20, 3.3, 1, 18, 1.0, 0.2], [13, 4.4, 0, 14, 0.9, 0.3], [22, 1.5, -2, 12, 1.0, -0.18],
  // 石屋前 / 小木屋
  [2, 2.4, -7, 18, 1.2, 0.22], [9, 3.6, -9, 16, 1.0, -0.26], [16, 2.0, -9, 14, 1.1, 0.2], [-3, 4.0, -12, 14, 0.9, -0.2],
  // 灵魂小径
  [21, 2.6, -18, 12, 1.0, 0.24],
];

function mistTexture() {
  return canvasTexture(512, 64, (g, w, h) => {
    const r = rng(41);
    g.clearRect(0, 0, w, h);
    // 几条拉长的软椭圆叠出一条有疏密的雾带
    for (let i = 0; i < 26; i++) {
      const x = w * (0.12 + r() * 0.76), y = h * (0.35 + r() * 0.3);
      const rx = w * (0.08 + r() * 0.18), ry = h * (0.16 + r() * 0.2);
      const grd = g.createRadialGradient(x, y, 0, x, y, rx);
      grd.addColorStop(0, `rgba(255,255,255,${0.16 + r() * 0.16})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
      g.fillStyle = grd; g.fillRect(x - rx, y - rx, rx * 2, rx * 2);
      g.restore();
    }
    // 两端淡出
    const fade = g.createLinearGradient(0, 0, w, 0);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.18, 'rgba(0,0,0,0)');
    fade.addColorStop(0.82, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = fade; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  }, { wrap: false });
}

export function buildForestMist({ bands = DEFAULT_BANDS, opacity = 0.85 } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = noOutline(new THREE.MeshBasicMaterial({
    map: mistTexture(), color: '#f4f4f0', transparent: true, opacity, depthWrite: false, fog: false, side: THREE.DoubleSide,
  }));
  const mesh = new THREE.InstancedMesh(geo, mat, bands.length);
  mesh.name = 'forest_mist';
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  const group = new THREE.Group();
  group.name = 'forest_mist_group';
  group.add(mesh);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const base = bands.map(([x, y, z, w, h, v]) => ({ x, y, z, w, h, v }));
  function update(dt, t, camera) {
    if (!camera) return;
    const cx = camera.position.x, cz = camera.position.z;
    for (let i = 0; i < base.length; i++) {
      const b = base[i];
      // 雾带沿自身方向缓慢来回漂
      p.set(b.x + Math.sin(t * 0.07 * Math.sign(b.v || 1) + i) * 2.5, b.y + Math.sin(t * 0.21 + i * 1.7) * 0.12, b.z);
      const yaw = Math.atan2(cx - p.x, cz - p.z);
      q.setFromAxisAngle(up, yaw);
      const d = Math.hypot(cx - p.x, cz - p.z);
      const k = THREE.MathUtils.smoothstep(d, 3, 7);   // 离得太近就收起来
      s.set(b.w * k, b.h * k, 1);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  function setOpacity(k, { ms = 0 } = {}) {
    const from = mat.opacity, to = k * opacity;
    if (!ms) { mat.opacity = to; mesh.visible = to > 0.001; return Promise.resolve(); }
    mesh.visible = true;
    return animate(ms, (e) => { mat.opacity = from + (to - from) * e; }, Ease.inOutSine).then(() => { mesh.visible = to > 0.001; });
  }
  return { group, mesh, update, setOpacity };
}
