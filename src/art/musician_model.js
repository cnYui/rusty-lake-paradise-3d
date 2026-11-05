// 第八灾门外弹曼陀林的三个乐手（src/art/models/musician_fat | musician_feather | musician_old.rlpm，2026-11-05 用户给的 Tripo 模型）：
// 模型自己抱着曼陀林，是一整块站姿网格，骨架只有 body（脚底）/ torso（腰）/ head（脖子）/ strum（拨弦那只手的肘）四个关节。
// 待机：身体跟着拍子轻轻左右晃、点头，拨弦的前臂上下拨。接口和 cast_mock 的 makePerson 人物一样
// （root、parts.body / head、setPose / setHeld / reach / bob），后面几个对抱着琴的乐手没有意义，什么都不做。
import * as THREE from 'three';
import { createRig } from './charkit.js';
import { attachModel, getModel } from './rlpm.js';

const PHASE = { musician_fat: 0, musician_feather: 2.1, musician_old: 4.0 };   // 三个人不同步，看着不像一个人复制了三份

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
