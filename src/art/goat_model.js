// 网格山羊（src/art/models/goat.rlpm）：关节名和动作接口与 characters.js 的程序化山羊完全一致
// （body / tail / legFL.. / neck / head / jaw / tongue / earL / earR；drink、tongueLeech、flinch、bleat），章节代码不用改。
// 绑定姿势就是模型本来的站姿，所以 STAND 由绑定姿势的转角直接算出；喝水姿势用两连杆 IK 求出脖子和头的角度，让嘴够到前方的木桶。
import * as THREE from 'three';
import { createRig, makeLeech, V, animate, wait, Ease, sphere, place } from './charkit.js';
import { noOutline } from './materials.js';
import { attachModel } from './rlpm.js';

const BUCKET = { z: 0.7, y: 0.47 };         // 木桶口（山羊局部坐标：桶在身前 0.7 m，桶沿高 0.42 m）
const SHIFT = 0.12;                          // 喝水时整个身体向前挪一点（模型脖子比程序化的短）

export function buildGoatModel(m) {
  const hdr = m.hdr, rig = createRig('goat'), M = rig.mats, J = rig.joints;
  hdr.joints.forEach((name, i) => {
    const parent = hdr.parents[i];
    rig.addJoint(name, parent ? J[parent] : rig.root, hdr.offsets[name], name === 'body' ? 'goat_body' : null);
  });
  attachModel(rig, m);
  rig.skins = [];
  rig.parts = { head: J.head, neck: J.neck, jaw: J.jaw, torso: J.body, body: J.body, tail: J.tail, legFL: J.legFL, legFR: J.legFR, legBL: J.legBL, legBR: J.legBR, legL: J.legFL, legR: J.legFR, armL: null, armR: null, handL: null, handR: null };
  const top = new THREE.Object3D(); top.name = 'goat_headTop'; top.position.fromArray(hdr.headTop); J.head.add(top);
  rig.headTop = top;

  // 站姿 = 绑定姿势：每个关节的局部转角 = 自己的世界转角 - 父的世界转角（只有俯仰）
  const pitch = (n) => hdr.bind[n].e[0];
  const STAND = {};
  hdr.joints.forEach((n, i) => { const p = hdr.parents[i]; STAND[n] = [pitch(n) - (p ? pitch(p) : 0), 0, 0]; });

  // ---- 喝水：脖子 + 头的平面两连杆 IK（y-z 平面，角度从 +z 朝上量）
  const B = hdr.bind;
  const base = [B.neck.p[1], B.neck.p[2]], headP = [B.head.p[1], B.head.p[2]], mouth = [B.tongue.p[1], B.tongue.p[2]];
  const a1b = Math.atan2(headP[0] - base[0], headP[1] - base[1]), L1 = Math.hypot(headP[0] - base[0], headP[1] - base[1]);
  const a2b = Math.atan2(mouth[0] - headP[0], mouth[1] - headP[1]), L2 = Math.hypot(mouth[0] - headP[0], mouth[1] - headP[1]);
  const by = base[0] - 0.01, bz = base[1] + SHIFT;
  const dy = BUCKET.y - by, dz = BUCKET.z - bz, d = Math.min(Math.hypot(dy, dz), L1 + L2 - 1e-3);
  const beta = Math.atan2(dy, dz), gamma = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const a1 = beta + gamma, jy = by + Math.sin(a1) * L1, jz = bz + Math.cos(a1) * L1;
  const a2 = Math.atan2(BUCKET.y - jy, BUCKET.z - jz);
  const d1 = a1b - a1, d2 = a2b - a2;
  const leanBack = SHIFT / (0.45 * 1.25);    // 身体前移后，把前后腿往回摆，蹄子基本留在原地
  const DRINK = {
    ...STAND, 'body.p': [0, -0.01, SHIFT],
    neck: [STAND.neck[0] + d1, 0, 0], head: [STAND.head[0] + (d2 - d1), 0, 0],
    legFL: [STAND.legFL[0] + leanBack, 0, 0], legFR: [STAND.legFR[0] + leanBack, 0, 0],
    legBL: [STAND.legBL[0] + leanBack * 0.8, 0, 0], legBR: [STAND.legBR[0] + leanBack * 0.8, 0, 0],
    kneeBL: [STAND.kneeBL[0] - leanBack * 0.3, 0, 0], kneeBR: [STAND.kneeBR[0] - leanBack * 0.3, 0, 0],
  };
  rig.POSES = { STAND, DRINK };
  rig.setPose({ ...STAND, 'body.p': [0, 0, 0] });

  // ---- 舌头和水蛭（喝完血后才露出来）：程序化部件挂在 tongue 关节上，朝嘴的方向（局部 +Z）伸出
  const pink = M.toon('#dfb0a6');
  const tongueJ = J.tongue;
  const tongue = new THREE.Mesh(place(sphere(0.022, 0.008, 0.05, 12, 8), [0, 0, 0.035], [0.5, 0, 0]), pink);
  tongue.name = 'goat_tongue'; tongueJ.add(tongue);
  tongueJ.visible = false;
  const leech = makeLeech(M, 0.075, 0.009, 0.4); leech.name = 'goat_leech'; leech.position.set(0, -0.006, 0.07); leech.rotation.set(0, 0, 0.05);
  tongueJ.add(leech); leech.visible = false;
  const leechProxy = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), noOutline(new THREE.MeshBasicMaterial({ visible: false })));
  leechProxy.position.y = -0.035; leechProxy.userData.proxy = true; leechProxy.name = 'goat_leech_hit'; leech.add(leechProxy);

  rig.face = null;
  rig.setMask = () => {};
  let chew = 1, lap = 0, bleatK = 0;
  rig._idleFn = (t, I) => {
    I.jaw[0] += (Math.max(0, Math.sin(t * 3.2)) * 0.14 * chew) + lap * Math.max(0, Math.sin(t * 9)) * 0.2 + bleatK * 0.35;
    I.jaw[1] += Math.sin(t * 3.2) * 0.04 * chew;
    I.head[0] += Math.sin(t * 0.6) * 0.03 - bleatK * 0.3;
    I.head[1] += Math.sin(t * 0.37) * 0.05;
    I.neck[0] += Math.sin(t * 0.45) * 0.02;
    I.tail[0] += Math.sin(t * 7) * 0.1 * (Math.sin(t * 0.7) > 0.6 ? 1 : 0);
    I.earL[2] += Math.sin(t * 0.9) * 0.05 + (Math.sin(t * 0.33) > 0.97 ? 0.3 : 0);
    I.earR[2] -= Math.sin(t * 0.8 + 1) * 0.05;
    I.body[0] += Math.sin(t * 1.4) * 0.005;
  };
  /** 低头把嘴伸进木桶（约 4 s），抬头，吐出带水蛭的舌头。约 5.5 s。 */
  rig.drink = async ({ instant = false } = {}) => {
    if (instant) { rig.setPose({ ...STAND, 'body.p': [0, 0, 0] }); tongueJ.visible = true; leech.visible = true; rig.pose.tongue = [STAND.tongue[0] + 0.25, 0, 0]; rig.apply(); return; }
    chew = 0;
    await rig.tweenPose(DRINK, 900, Ease.inOutSine);
    lap = 1;
    await wait(3600);
    lap = 0;
    await rig.tweenPose({ ...STAND, 'body.p': [0, 0, 0] }, 900, Ease.inOutSine);
    tongueJ.visible = true; leech.visible = true;
    rig.pose.tongue = [STAND.tongue[0] - 0.6, 0, 0];
    await rig.tweenPose({ tongue: [STAND.tongue[0] + 0.25, 0, 0], jaw: [STAND.jaw[0] + 0.25, 0, 0] }, 500, Ease.outBack);
    chew = 0;
  };
  rig.tongueLeech = async (v = true, { instant = false } = {}) => {
    leech.visible = v;
    if (v) { tongueJ.visible = true; chew = 0; await rig.tweenPose({ tongue: [STAND.tongue[0] + 0.25, 0, 0], jaw: [STAND.jaw[0] + 0.25, 0, 0] }, 400, Ease.outSine, instant); }
    else { await rig.tweenPose({ tongue: [STAND.tongue[0] - 0.6, 0, 0], jaw: [STAND.jaw[0], 0, 0] }, 300, Ease.inSine, instant); tongueJ.visible = false; chew = 1; }
  };
  rig.flinch = async ({ instant = false } = {}) => {
    if (instant) return;
    const p0 = { ...rig.pose, 'body.p': [0, 0, 0] };
    await rig.tweenPose({ 'body.p': [0, 0.02, -0.12], body: [-0.08, 0, 0], neck: [STAND.neck[0] - 0.2, 0, 0], head: [STAND.head[0] - 0.05, 0.25, 0], legBL: [STAND.legBL[0] + 0.1, 0, 0], legBR: [STAND.legBR[0] + 0.12, 0, 0] }, 180, Ease.outCubic);
    await wait(250);
    await rig.tweenPose({ 'body.p': [0, 0, 0], body: p0.body, neck: p0.neck, head: p0.head, legBL: p0.legBL, legBR: p0.legBR }, 600, Ease.inOutSine);
  };
  rig.bleat = async () => {
    await animate(250, (e) => { bleatK = e; });
    await wait(400);
    await animate(250, (e) => { bleatK = 1 - e; });
  };
  rig.handRotFor = () => [0, 0, 0];
  rig.play = (anim = 'idle') => { rig.anim = anim; if (anim === 'bleat') { rig.anim = 'idle'; rig.bleat(); } chew = anim === 'none' ? 0 : chew; };
  rig.play('idle');
  rig.apply();
  return rig;
}
