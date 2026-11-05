// 第八灾门外弹曼陀林的三个乐手（src/art/models/musician_fat | musician_feather | musician_old.rlpm，2026-11-05 用户给的 Tripo 模型）：
// 模型自己抱着曼陀林，是一整块站姿网格，骨架只有 body（脚底）/ torso（腰）/ head（脖子）/ strum（拨弦那只手的肘）四个关节。
// 待机：身体跟着拍子轻轻左右晃、点头，拨弦的前臂上下拨。接口和 cast_mock 的 makePerson 人物一样
// （root、parts.body / head、setPose / setHeld / reach / bob），后面几个对抱着琴的乐手没有意义，什么都不做。
import * as THREE from 'three';
import { createRig } from './charkit.js';
import { attachModel, getModel } from './rlpm.js';

const PHASE = { musician_fat: 0, musician_feather: 2.1, musician_old: 4.0 };   // 三个人不同步，看着不像一个人复制了三份

/** 贴图在 UV 处的颜色（中位数）；读不到贴图时返回 null。 */
function sampleColor(m, verts) {
  const img = m.texture && m.texture.image;
  if (!img || !verts.length || typeof document === 'undefined') return null;
  try {
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, N, N);
    const px = g.getImageData(0, 0, N, N).data, ch = [[], [], []];
    for (const i of verts) {
      const u = Math.min(N - 1, Math.max(0, Math.floor(m.uv[i * 2] * N))), v = Math.min(N - 1, Math.max(0, Math.floor((1 - m.uv[i * 2 + 1]) * N)));
      for (let k = 0; k < 3; k++) ch[k].push(px[(v * N + u) * 4 + k]);
    }
    const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
    return new THREE.Color(med(ch[0]) / 255, med(ch[1]) / 255, med(ch[2]) / 255);
  } catch (e) { return null; }
}

/**
 * 补一双光脚：Tripo 模型的小腿在地面处被截平、没有脚（原图的脚在画框 / 地面雾里看不清），原作里三个乐手是光着脚站在地上的。
 * 按网格最底下一圈顶点量出两条腿的位置和粗细，各放一只朝前的半椭球脚掌（包住小腿的截面），颜色取小腿皮肤的贴图颜色。
 */
function addFeet(rig, m) {
  const P = m.position, n = m.hdr.vcount, legs = { L: [], R: [] }, skin = [];
  for (let i = 0; i < n; i++) {
    const y = P[i * 3 + 1];
    if (y < 0.02) legs[P[i * 3] > 0 ? 'L' : 'R'].push(i);
    else if (y < 0.07) skin.push(i);
  }
  // 脚背朝上、比竖着的小腿亮，颜色压暗一点、偏暖，看着才和小腿是一个颜色
  const col = (sampleColor(m, skin) || new THREE.Color('#e8cdb6')).multiplyScalar(0.76).lerp(new THREE.Color('#c39a7c'), 0.3);
  const mat = rig.mats.toon(`#${col.getHexString()}`);
  for (const side of ['L', 'R']) {
    const ids = legs[side];
    if (ids.length < 8) continue;
    let cx = 0, cz = 0;
    for (const i of ids) { cx += P[i * 3]; cz += P[i * 3 + 2]; }
    cx /= ids.length; cz /= ids.length;
    let r = 0;
    for (const i of ids) r = Math.max(r, Math.hypot(P[i * 3] - cx, P[i * 3 + 2] - cz) * 0.92);
    const rx = Math.max(0.055, r * 1.08), rz = Math.max(0.13, r * 1.3), h = Math.min(0.085, Math.max(0.06, r * 0.45));
    const geo = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    geo.scale(rx, h, rz);
    const foot = new THREE.Mesh(geo, mat);
    foot.name = `${rig.id}_foot${side}`; foot.castShadow = true;
    foot.position.set(cx, -0.004, cz + rz - r * 0.95);
    rig.joints.body.add(foot);
  }
}

/** 有模型就返回抱琴的乐手（rig），没有返回 null（调用方回落到程序化人物 + holdMandolin）。 */
export function buildMusicianModel(key, id = key) {
  const m = getModel(key);
  if (!m) return null;
  const hdr = m.hdr, rig = createRig(id), J = rig.joints;
  hdr.joints.forEach((name, i) => { const p = hdr.parents[i]; rig.addJoint(name, p ? J[p] : rig.root, hdr.offsets[name]); });
  attachModel(rig, m);
  const top = new THREE.Object3D(); top.name = `${id}_headTop`; top.position.fromArray(hdr.headTop); J.head.add(top);
  Object.assign(rig, { isModel: true, holdsLute: true, adapted: true, placeholder: false, headTop: top });
  rig.dims = { height: hdr.H, headR: [0.1, 0.12, 0.11] };
  rig.parts = { body: rig.root, head: J.head, torso: J.torso, strum: J.strum, held: null };
  const ph = PHASE[key] || 0;
  // 拨弦的前臂绕前向轴（局部 z）摆：手在琴面上上下拨
  rig._idleFn = (t, I) => {
    const beat = t * 2.4 + ph;
    I.torso[2] += Math.sin(beat) * 0.022;
    I.torso[0] += Math.sin(beat * 2) * 0.008;
    I.head[0] += Math.max(0, Math.sin(beat * 2)) * 0.05 - 0.015;
    I.head[1] += Math.sin(t * 0.37 + ph) * 0.09;
    I.head[2] -= Math.sin(beat) * 0.02;
    I.strum[2] += Math.sin(t * 11 + ph) * 0.06;
  };
  addFeet(rig, m);
  rig.POSES = { stand: {} };
  rig.poseName = 'stand';
  rig.setPose = () => {};
  rig.setHeld = () => {};
  rig.reach = () => {};
  rig.bob = () => {};
  rig.play('idle');
  rig.apply();
  return rig;
}
