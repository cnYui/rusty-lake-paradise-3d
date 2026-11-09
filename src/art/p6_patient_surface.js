// 第六灾病人的连续胸腹表面；人物皮肤和谜题共用米制坐标，避免贴片悬空。
import * as THREE from 'three';

export const PATIENT_CHEST_Y = 1.365;
// 胸背最厚处的后表面约为 -0.124 m，躺下后刚好贴住床垫。
export const PATIENT_BACK_Y = 0.124;
const PROFILE = [
  [0.985, 0.163, 0.115, 0.018], [1.025, 0.183, 0.145, 0.038],
  [1.10, 0.205, 0.169, 0.057], [1.18, 0.202, 0.162, 0.050],
  [1.25, 0.197, 0.139, 0.030], [1.32, 0.207, 0.133, 0.016],
  [1.39, 0.218, 0.125, 0.008], [1.455, 0.223, 0.110, 0],
  [1.49, 0.184, 0.095, -0.003], [1.525, 0.098, 0.075, 0],
  [1.55, 0.078, 0.070, 0],
];
function profile(y) {
  let i = 0;
  while (i < PROFILE.length - 2 && PROFILE[i + 1][0] < y) i++;
  const a = PROFILE[i], b = PROFILE[i + 1];
  const t = THREE.MathUtils.clamp((y - a[0]) / (b[0] - a[0]), 0, 1), span = b[0] - a[0];
  const prev = PROFILE[Math.max(0, i - 1)], next = PROFILE[Math.min(PROFILE.length - 1, i + 2)];
  return a.slice(1).map((v, j) => {
    const k = j + 1, ma = (b[k] - prev[k]) / (b[0] - prev[0]), mb = (next[k] - a[k]) / (next[0] - a[0]);
    return (2 * t ** 3 - 3 * t ** 2 + 1) * v + (t ** 3 - 2 * t ** 2 + t) * ma * span
      + (-2 * t ** 3 + 3 * t ** 2) * b[k] + (t ** 3 - t ** 2) * mb * span;
  });
}
function muscle(x, y) {
  const gauss = (a, b, sx, sy) => Math.exp(-(((x - a) / sx) ** 2) - ((y - b) / sy) ** 2);
  return 0.016 * (gauss(-0.104, 1.36, 0.073, 0.073) + gauss(0.104, 1.36, 0.073, 0.073))
    - 0.004 * gauss(0, 1.345, 0.017, 0.12);
}
export function patientFront(x, y) {
  const [w, d, cz] = profile(y);
  const front = Math.sqrt(Math.max(0, 1 - (x / w) ** 2));
  return cz + d * front + muscle(x, y) * front ** 8;
}
// 道具局部 +Y 朝皮肤外，+Z 朝脚；左胸在人物的 +X。
export function chestPoint(x, z, lift = 0.002) {
  return new THREE.Vector3(x, patientFront(x, PATIENT_CHEST_Y - z) + lift, z);
}
export function patientTorsoGeometry() {
  const radial = 96, rows = 112, p = [], uv = [], ix = [];
  for (let i = 0; i <= rows; i++) {
    const y = THREE.MathUtils.lerp(PROFILE[0][0], PROFILE.at(-1)[0], i / rows);
    const [w, d, cz] = profile(y);
    for (let j = 0; j <= radial; j++) {
      const th = j / radial * Math.PI * 2, x = w * Math.sin(th), front = Math.cos(th);
      p.push(x, y, cz + d * front + muscle(x, y) * Math.max(0, front) ** 8);
      uv.push(0.5 + x / 0.5, (y - 0.985) / 0.565);
      if (i < rows && j < radial) {
        const a = i * (radial + 1) + j, b = a + radial + 1;
        ix.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(ix); geo.computeVertexNormals();
  return geo;
}
