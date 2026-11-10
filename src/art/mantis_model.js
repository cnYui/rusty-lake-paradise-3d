// 第八灾雾里的巨型螳螂（src/art/models/mantis.rlpm，2026-11-05 用户给的 Tripo 模型）：
// 骨架 body（胸）/ legFL legFR legBL legBR（四条步足，枢轴在股节根部）/ upper（前胸根部：前胸 + 头 + 捕捉足）/ head / fore（一对捕捉足）。
// 接口和 props_p8.js 的程序化螳螂一样（update / walking / walkTo / face / strike / rest，userData.head / fore / legs / rig / upper），
// 章节代码不用改。站起来眼睛离地约 4.55 m、连触角约 5 m，脚尖张开约 3.5 m × 2.8 m。
import * as THREE from 'three';
import { createRig } from './charkit.js';
import { attachModel } from './rlpm.js';
import { animate, Ease } from '../core/tween.js';

const PI = Math.PI;
const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();

export function buildMantisModel(m) {
  const hdr = m.hdr, rig = createRig('mantis'), J = rig.joints;
  hdr.joints.forEach((name, i) => { const p = hdr.parents[i]; rig.addJoint(name, p ? J[p] : rig.root, hdr.offsets[name]); });
  attachModel(rig, m);
  const r = new THREE.Group(); r.name = 'p8_mantis';
  r.add(rig.root);
  rig.root.name = 'mantis_rig';

  // 四条腿：走路时绕竖直轴前后摆，抬腿绕“脚尖方向 × 竖直”的水平轴；对角两条同相
  const legs = ['legFL', 'legBR', 'legFR', 'legBL'].map((name, i) => {
    const b = hdr.bind[name].p, f = hdr.feet[name];
    const out = new THREE.Vector3(f[0] - b[0], f[1] - b[1], f[2] - b[2]);
    const lift = new THREE.Vector3().crossVectors(out, UP).normalize();
    return { name, leg: J[name], lift, phase: i < 2 ? 0 : PI };
  });
  const head = J.head, upper = J.upper, fore = J.fore;
  r.userData = { ...r.userData, head, fore: [fore], legs, rig: rig.root, upper, model: rig };   // model：骨架（截图 / 排查时直接摆姿势）
  r.walking = false;

  let strikeK = 0;
  const pose = (t) => {
    const w = r.walking ? 1 : 0;
    for (const { name, lift, phase } of legs) {
      const s = Math.sin(t * 5 + phase);
      _q.setFromAxisAngle(UP, s * 0.2 * w);
      _q2.setFromAxisAngle(lift, Math.max(0, s) * 0.1 * w);
      _e.setFromQuaternion(_q.multiply(_q2), 'XYZ');
      rig.pose[name] = [_e.x, _e.y, _e.z];
    }
    rig.pose.head = [Math.sin(t * 0.6) * 0.06, Math.sin(t * 0.45) * 0.3 * (1 - strikeK), Math.sin(t * 0.7) * 0.08];
    rig.pose.upper = [strikeK * 0.75 + Math.sin(t * 0.8) * 0.02, 0, 0];
    rig.pose.fore = [strikeK * 0.95, 0, 0];
    rig.pose.body = [0, 0, Math.sin(t * (r.walking ? 5 : 0.9)) * (r.walking ? 0.015 : 0.006)];
    rig.root.position.y = Math.sin(t * (r.walking ? 10 : 1.2)) * (r.walking ? 0.06 : 0.03);
    rig.apply();
  };
  let last = 0;
  r.update = (dt, t) => { last = t; if (r.visible) pose(t); };

  /** 走到 [x, y, z]（父节点下的位置），一路转向前进方向。 */
  r.walkTo = (to, ms = null) => {
    const from = r.position.clone(), target = new THREE.Vector3(...to);
    const dist = from.distanceTo(target);
    if (dist < 0.01) return Promise.resolve();
    const yaw = Math.atan2(target.x - from.x, target.z - from.z), yaw0 = r.rotation.y;
    let dy = yaw - yaw0; while (dy > PI) dy -= 2 * PI; while (dy < -PI) dy += 2 * PI;
    r.walking = true;
    return animate(ms ?? Math.max(900, dist * 420), (k) => {
      r.position.lerpVectors(from, target, k);
      r.rotation.y = yaw0 + dy * Math.min(1, k * 4);
    }, Ease.inOutSine).then(() => { r.walking = false; });
  };
  r.face = (x, z) => { r.rotation.y = Math.atan2(x - r.position.x, z - r.position.z); };
  /** 出手：前胸连头往前下方扑、捕捉足甩出去再收回（0.9 s）。 */
  r.strike = () => animate(900, (k) => { strikeK = Math.sin(k * PI); pose(last); }, Ease.linear).then(() => { strikeK = 0; pose(last); });
  r.rest = () => { strikeK = 0; pose(last); };
  pose(0);
  return r;
}
