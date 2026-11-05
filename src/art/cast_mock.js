// 第六到八灾的人物。章节一律调 makePerson(id)（文件末尾）：有正式模型的人物用网格 / 程序化人物，没有的用占位人物。
// 占位人物（mock）makeMockPerson(id)：简单几何体拼的人 → rig：root（脚底 y = 0、面朝 +Z，按真实身高建，scale 一律为 1）、
//   parts（命名部件）、setPose('stand' | 'sit' | 'lie'：躺时头朝 -Z、脸朝上)、setHeld(Object3D | null)（挂在右手）、bob(on)、
//   update(dt, t)、placeholder = true。不带骨骼动画：要“动作”就直接 tween parts 里的部件（例如 parts.armR.rotation）。
import * as THREE from 'three';
import { toon } from './materials.js';
import { makeCharacter } from './characters.js';
import { gerardBody, davidBody, nicholasBody, margaretBody, armsDown, seatedPose, mergePose, STOOP } from './cast.js';
import { lifeIdle } from './human.js';
import { getModel, removableHat } from './rlpm.js';
import { buildMusicianModel } from './musician_model.js';

const SKIN = '#e7d3bf';

/** 每个占位人物的外观：身高（头顶）、衣服 / 裤子 / 头发颜色、帽子、附件。 */
export const MOCK_PEOPLE = {
  plague_doctor: { height: 1.86, coat: '#26232a', legs: '#1d1b20', hair: null, hat: 'top', beak: true, robe: true },
  gerard_patient: { height: 1.84, coat: '#ddd5c8', legs: '#6a5f55', hair: '#6e4a2c', hat: 'cap', mustache: true, shirtless: true },
  gerard_p7: { height: 1.84, coat: '#efe9df', legs: '#5a4636', vest: '#8e3f22', hair: '#6e4a2c', hat: 'fedora', mustache: true },
  margaret: { height: 1.47, coat: '#6e5641', legs: '#6e5641', apron: '#e8ddc6', hair: '#e7e3dc', hat: 'kerchief', robe: true },
  caroline: { height: 1.66, coat: '#7a4a2e', legs: '#7a4a2e', apron: '#f0ece2', hair: '#9c3f22', robe: true },
  ice_youth: { height: 1.78, coat: SKIN, legs: '#e9e4da', hair: '#c9a24a', shirtless: true },
  jakob_child: { height: 1.31, coat: '#e9e4da', legs: '#8a7b68', hair: '#7a4b2a' },
  nicholas_deer: { height: 1.88, coat: '#ecebe4', legs: '#ecebe4', hair: null, robe: true, deer: true },
  ida_snow: { height: 1.58, coat: '#f4f4f2', legs: '#f4f4f2', hair: '#d9d6cf', hat: 'bonnet', robe: true },
  // 第八灾（docs/plague8_design.md §人物）：门外三个乐手、木屋里的红发女人、雾里的黑影、回忆里的母亲
  musician_fat: { height: 1.8, coat: '#3d3a52', legs: '#2c2a33', hair: '#4a3324', hat: 'top', mustache: true, fat: true },
  musician_feather: { height: 1.76, coat: '#5a6b3d', legs: '#3a3528', hair: '#8a5a2c', hat: 'fedora', feather: true },
  musician_old: { height: 1.84, coat: '#6b5a48', legs: '#3d342c', hair: '#ecebe6', thin: true },
  seer: { height: 1.64, coat: '#2f4a46', legs: '#2f4a46', hair: '#b4361f', robe: true, eyes: '#f4f4ef', longHair: true },
  shadow: { height: 1.9, coat: '#101012', legs: '#101012', skin: '#141416', eyes: '#f4f4ef', robe: true },
  mother: { height: 1.62, coat: '#3c4a66', legs: '#3c4a66', apron: '#e8e2d2', hair: '#6e4a2c', robe: true, longHair: true },
};

const mesh = (geo, color, name, opts) => { const m = new THREE.Mesh(geo, toon(color, opts)); m.name = name; m.castShadow = true; return m; };

function hat(kind, headR) {
  const g = new THREE.Group(); g.name = 'hat';
  if (kind === 'top') {
    g.add(mesh(new THREE.CylinderGeometry(headR * 1.75, headR * 1.75, 0.015, 24), '#151417', 'hat_brim'));
    const crown = mesh(new THREE.CylinderGeometry(headR * 0.95, headR * 1.0, 0.16, 20), '#151417', 'hat_crown'); crown.position.y = 0.08; g.add(crown);
    g.position.y = headR * 0.72;
  } else if (kind === 'fedora') {
    g.add(mesh(new THREE.CylinderGeometry(headR * 1.6, headR * 1.6, 0.012, 24), '#6b4a2e', 'hat_brim'));
    const crown = mesh(new THREE.CylinderGeometry(headR * 0.85, headR * 1.0, 0.11, 20), '#6b4a2e', 'hat_crown'); crown.position.y = 0.055; g.add(crown);
    g.position.y = headR * 0.7;
  } else if (kind === 'cap') {
    const crown = mesh(new THREE.SphereGeometry(headR * 1.04, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#b9b3a8', 'hat_crown'); g.add(crown);
    g.position.y = headR * 0.25;
  } else if (kind === 'kerchief' || kind === 'bonnet') {
    const color = kind === 'kerchief' ? '#d9cfae' : '#f6f4ef';
    const crown = mesh(new THREE.SphereGeometry(headR * 1.08, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), color, 'hat_crown'); g.add(crown);
    g.position.y = headR * 0.05;
  }
  return g;
}

export function makeMockPerson(id, overrides = {}) {
  const spec = { ...(MOCK_PEOPLE[id] || MOCK_PEOPLE.gerard_p7), ...overrides };
  const H = spec.height, headR = H * 0.072, skin = spec.skin || SKIN;
  const root = new THREE.Group(); root.name = `mock_${id}`;
  const body = new THREE.Group(); body.name = 'body'; root.add(body);
  const parts = { body };
  const legH = H * 0.46, torsoH = H * 0.33;
  // 腿（长袍人物用一条裙摆代替两条腿）
  if (spec.robe) {
    const skirt = mesh(new THREE.CylinderGeometry(H * 0.1, H * 0.15, legH, 18), spec.legs, 'skirt'); skirt.position.y = legH / 2; body.add(skirt); parts.skirt = skirt;
  } else {
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.name = side < 0 ? 'legL' : 'legR'; leg.position.set(side * H * 0.045, legH, 0);
      const shin = mesh(new THREE.CylinderGeometry(H * 0.032, H * 0.028, legH, 10), spec.legs, 'leg_mesh'); shin.position.y = -legH / 2; leg.add(shin);
      const foot = mesh(new THREE.BoxGeometry(H * 0.05, H * 0.03, H * 0.1), '#3b3029', 'foot'); foot.position.set(0, -legH + H * 0.015, H * 0.025); leg.add(foot);
      body.add(leg); parts[leg.name] = leg;
    }
  }
  // 躯干
  const girth = spec.fat ? 1.5 : spec.thin ? 0.8 : 1;
  const torso = mesh(new THREE.CylinderGeometry(H * 0.085 * girth, H * 0.1 * girth, torsoH, 16), spec.coat, 'torso'); torso.position.y = legH + torsoH / 2; body.add(torso); parts.torso = torso;
  if (spec.fat) { const belly = mesh(new THREE.SphereGeometry(H * 0.15, 16, 12), spec.coat, 'belly'); belly.position.set(0, legH + torsoH * 0.3, H * 0.06); body.add(belly); }
  if (spec.vest) { const v = mesh(new THREE.CylinderGeometry(H * 0.088, H * 0.102, torsoH * 0.8, 16, 1, true), spec.vest, 'vest', { side: THREE.DoubleSide }); v.position.y = legH + torsoH * 0.45; body.add(v); }
  if (spec.apron) { const a = mesh(new THREE.BoxGeometry(H * 0.15, legH * 0.9, 0.01), spec.apron, 'apron'); a.position.set(0, legH * 0.55, H * 0.13); body.add(a); }
  // 手臂（肩部是枢轴，章节可以转 parts.armL / armR）
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.name = side < 0 ? 'armL' : 'armR';
    arm.position.set(side * H * 0.11, legH + torsoH * 0.92, 0);
    const sleeve = mesh(new THREE.CylinderGeometry(H * 0.026, H * 0.022, H * 0.3, 10), spec.shirtless ? skin : spec.coat, 'arm_mesh'); sleeve.position.y = -H * 0.15; arm.add(sleeve);
    const hand = mesh(new THREE.SphereGeometry(H * 0.024, 10, 8), spec.deer ? '#ecebe4' : skin, 'hand'); hand.position.y = -H * 0.31; arm.add(hand);
    arm.rotation.z = side * 0.08;
    body.add(arm); parts[arm.name] = arm;
  }
  const holder = new THREE.Group(); holder.name = 'held'; holder.position.y = -H * 0.32; parts.armR.add(holder); parts.held = holder;
  // 头
  const head = new THREE.Group(); head.name = 'head'; head.position.y = H - headR; body.add(head); parts.head = head;
  const skull = mesh(new THREE.SphereGeometry(headR, 20, 14), spec.deer ? '#a7855c' : skin, 'skull'); head.add(skull);
  const neck = mesh(new THREE.CylinderGeometry(headR * 0.4, headR * 0.45, H - headR * 1.6 - legH - torsoH, 10), skin, 'neck');
  neck.position.y = legH + torsoH + (H - headR * 1.6 - legH - torsoH) / 2; body.add(neck);
  for (const side of [-1, 1]) { const eye = mesh(new THREE.SphereGeometry(headR * 0.12, 8, 6), spec.eyes || '#1c1a1c', 'eye'); eye.position.set(side * headR * 0.36, headR * 0.12, headR * 0.9); head.add(eye); }
  if (spec.hair) { const hair = mesh(new THREE.SphereGeometry(headR * 1.04, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), spec.hair, 'hair'); hair.rotation.x = -0.25; head.add(hair); }
  if (spec.longHair) { const lh = mesh(new THREE.CylinderGeometry(headR * 0.95, headR * 1.15, headR * 2.4, 16, 1, true, Math.PI * 0.35, Math.PI * 1.3), spec.hair, 'hair_long', { side: THREE.DoubleSide }); lh.position.set(0, -headR * 0.75, -headR * 0.15); head.add(lh); }
  if (spec.mustache) { const m = mesh(new THREE.BoxGeometry(headR * 0.9, headR * 0.12, headR * 0.12), spec.hair || '#5a3a22', 'mustache'); m.position.set(0, -headR * 0.3, headR * 0.92); head.add(m); }
  if (spec.beak) {
    const beak = mesh(new THREE.ConeGeometry(headR * 0.42, headR * 2.2, 14), '#efe8da', 'beak');
    beak.rotation.x = Math.PI / 2 + 0.35; beak.position.set(0, -headR * 0.35, headR * 1.6); head.add(beak);
    skull.material = toon('#efe8da');
  }
  if (spec.deer) {
    for (const side of [-1, 1]) {
      const antler = mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.34, 6), '#d8d0bf', 'antler');
      antler.position.set(side * headR * 0.6, headR * 1.2, 0); antler.rotation.z = -side * 0.5; head.add(antler);
    }
    const snout = mesh(new THREE.BoxGeometry(headR * 0.7, headR * 0.6, headR * 1.2), '#a7855c', 'snout'); snout.position.set(0, -headR * 0.35, headR * 0.9); head.add(snout);
  }
  if (spec.hat) head.add(hat(spec.hat, headR));
  if (spec.feather) {
    const f = mesh(new THREE.SphereGeometry(headR * 0.2, 10, 6), '#efe6cf', 'feather'); f.scale.set(0.45, 3.4, 0.2);
    f.position.set(headR * 0.85, headR * 0.45, -headR * 0.2); f.rotation.z = -0.55; head.getObjectByName('hat').add(f);
  }

  const rig = {
    id, root, parts, placeholder: true, pose: 'stand', bobbing: true,
    setPose(p) {
      rig.pose = p; body.rotation.set(0, 0, 0); body.position.set(0, 0, 0);
      for (const k of ['legL', 'legR']) if (parts[k]) parts[k].rotation.x = 0;
      if (p === 'sit') {
        // 坐在 0.45 m 高的凳面上：大腿水平向前，身体下移到坐面
        for (const k of ['legL', 'legR']) if (parts[k]) parts[k].rotation.x = -Math.PI / 2;
        body.position.y = 0.45 - legH;
        if (parts.skirt) { parts.skirt.scale.y = 0.55; parts.skirt.position.y = legH - legH * 0.275; }
      } else if (p === 'lie') {
        // 平躺（脸朝上）：整个人绕脚底的 X 轴转 90°，头朝 -Z，左右手仍在身体两侧
        body.rotation.x = -Math.PI / 2; body.position.y = H * 0.1;
      } else if (parts.skirt) { parts.skirt.scale.y = 1; parts.skirt.position.y = legH / 2; }
    },
    setHeld(obj) { holder.clear(); if (obj) holder.add(obj); },
    bob(on) { rig.bobbing = on; },
    update(dt, t) { if (rig.bobbing && rig.pose !== 'lie') head.position.y = H - headR + Math.sin(t * 1.6 + H) * 0.006; },
  };
  root.userData.placeholder = true; root.userData.rig = rig;
  return rig;
}

// ===========================================================================
// 正式人物：第六到八灾的人物 id → 网格模型（src/art/models/*.rlpm，要列进 rlpm.js 的 CHAPTER_MODELS 预加载）
// 或游戏里原有的程序化人物（Caroline、灵魂），外面套一层和 makeMockPerson 相同的接口：
//   setPose('stand' | 'sit' | 'lie' | 'kneel' | 姿势字典)、setHeld(obj)（挂在右手）、parts.body（= root，射线点击走蒙皮网格）、
//   parts.head（头骨骼，挂气泡）、bob()（空操作）。另外给章节摆动作用：POSES、basePose（最近一次 setPose 的基础姿势）、
//   reach(side, pos, opts)（在基础姿势上把手腕 IK 到 root 空间的一点）。
// 骨架人物的关节每帧由 rig.apply() 按 rig.pose 重写：章节要摆手臂用 setPose / tweenPose / reach，不能直接改 parts.armR.rotation。
// 模型没加载时 cast.js 的 body 函数自动回退到程序化人物，接口一样；没有模型的人物（瘟疫医生、冰中青年）继续用占位人物。
// ===========================================================================
const SEAT = 0.45;   // 坐姿的凳面高度（第六灾 p6_stool；小船上的座位按占位人物的这个高度摆）

const withIdle = (rig, o = {}) => { lifeIdle(rig, { breath: 0.012, sway: 0.008, look: 0.06, ...o }); rig.play('idle'); rig.apply(); return rig; };

/** 鹿头 Nicholas：模型自带鹿头和长袍；他手里的黑方块（第一灾的回忆）藏起来，章节自己摆道具。 */
function deer() { const rig = makeCharacter('nicholas_deer'); rig.showCube(false); return rig; }
/** 红发、白眼的 Ida（第三灾理发那位）：第二灾头上的青蛙藏起来。 */
function ida() { const rig = makeCharacter('ida'); rig.showFrog(false); return rig; }
/** 母亲 Caroline：没有网格模型，用程序化人物，怀里的婴儿藏起来。 */
function caroline() { const rig = makeCharacter('caroline'); rig.root.getObjectByName('caroline_baby').visible = false; return rig; }

/** David（第八灾中间的乐手）：帽子上插两根羽毛（网格的帽子是头的一部分，羽毛挂在头骨骼上）。 */
function feathered(rig) {
  const [rx, ry, rz] = rig.dims.headR;
  const g = new THREE.Group(); g.name = 'hat_feathers';
  // 网格 David 的帽檐在头骨骼上方约 0.09 m、帽冠侧面离中线约 0.13 m（按 david.rlpm 的头部顶点量的）；程序化帽子按头的大小估
  if (rig.isModel) g.position.set(-0.132, 0.135, -0.03); else g.position.set(-rx * 1.25, ry * 1.0, -rz * 0.2);
  g.rotation.set(-0.5, 0, 0.35);
  [['#efe6cf', 0.15, 0], ['#8a5a2c', 0.12, 0.25]].forEach(([color, len, tilt]) => {
    const f = mesh(new THREE.SphereGeometry(0.5, 12, 8), color, 'feather');
    f.scale.set(0.024, len, 0.008); f.position.set(0, len * 0.45, 0); f.rotation.z = tilt; g.add(f);
  });
  rig.joints.head.add(g);
  return rig;
}

const REAL = {
  // 第六灾：病人 Gerard、凳子上的奶奶、回忆里的鹿头人和少年 Jakob（第八灾小船上的奶奶、回忆里的少年 Jakob 同样用这几个）
  // 瘟疫医生：有网格模型（doctor.rlpm：黑礼帽、乌鸦嘴面具、斗篷长袍）就用它，没有就回落到占位人物（返回 null）
  plague_doctor: () => (getModel('doctor') ? makeCharacter('plague_doctor') : null),
  gerard_patient: () => withIdle(gerardBody('gerard_p6')),
  margaret: () => withIdle(margaretBody('margaret_seated', { seat: SEAT }), { seated: true }),
  nicholas_deer: deer,
  jakob_child: () => makeCharacter('jakob_child'),
  // 第七灾：滑冰的红发女人是 Ida，神殿里跪着求情的是母亲 Caroline
  ida, caroline,
  // 冰中青年：David 的身材、光膀子短裤的程序化人物（cast.js 的 buildIceYouth），不需要网格模型
  ice_youth: () => makeCharacter('ice_youth'),
  // 第七灾 Gerard 要把帽子送给玩家：网格 Gerard 的帽子和头是一块网格，removableHat 按贴图颜色把帽子拆出来，
  // setHat(false) 时不画帽子、补一顶头发；没有模型时是程序化 Gerard，章节照旧用 showTag('hat', …)
  gerard_p7: () => removableHat(withIdle(gerardBody('gerard_p7')), 'gerard'),
  // 第八灾：门外三个乐手 I / II / III 是 Gerard、David、Nicholas；木屋里的红发白眼女人是 Ida；雾里的黑影是“灵魂”
  // 乐手 2026-11-05 起用自己抱着曼陀林的网格模型（musician_model.js）；没有模型时回落到程序化 / 网格 Gerard、David、Nicholas，琴由章节的 holdMandolin 挂上
  musician_fat: () => buildMusicianModel('musician_fat') || withIdle(gerardBody('gerard_p8')),
  musician_feather: () => buildMusicianModel('musician_feather') || feathered(withIdle(davidBody('david_p8'))),
  musician_old: () => buildMusicianModel('musician_old') || withIdle(nicholasBody('nicholas_p8').rig),
  seer: ida,
  mother: caroline,
  shadow: () => makeCharacter('soul'),   // 网格黑影（soul.rlpm），没有模型时是程序化黑影
  // 第九灾：篝火边的五个人（Gerard、David、Ida、坐在树墩上的奶奶、Nicholas；Ida 和奶奶沿用上面的 ida / margaret）
  gerard_p9: () => withIdle(gerardBody('gerard_p9')),
  david_p9: () => withIdle(davidBody('david_p9')),
  nicholas_p9: () => withIdle(nicholasBody('nicholas_p9').rig),
  // 第十灾：猎人 Gerard、白桦树前的 David、敲鼓的 Nicholas（Ida、奶奶、黑影沿用上面的）；
  // 戴上面具以后换成记忆里的动物头模型（野猪 / 兔子 / 鸽子 / 鹿），Ida 换成戴野鸡面具的网格模型（pheasant）
  gerard_p10: () => withIdle(gerardBody('gerard_p10')),
  david_p10: () => withIdle(davidBody('david_p10')),
  nicholas_p10: () => withIdle(nicholasBody('nicholas_p10').rig),
  gerard_boar: () => makeCharacter('gerard_boar'),
  david_rabbit: () => makeCharacter('david_rabbit'),
  margaret_pigeon: () => makeCharacter('margaret_pigeon'),
  ida_pheasant: () => makeCharacter('ida_pheasant'),   // 网格模型自带野鸡面具；没有模型时是程序化 Ida 戴面具
};
const OWN_POSE = new Set(['shadow']);   // 保留构建函数自己的站姿（灵魂是驼着背的黑影）

function adapt(rig, id) {
  const D = rig.dims, Y = rig.Y;
  const base = rig.setPose;
  const zero = {}; for (const k in rig.pose) zero[k] = OWN_POSE.has(id) ? rig.pose[k].slice() : [0, 0, 0];
  zero.body = zero.body || [0, 0, 0]; zero['body.p'] = [0, 0, 0];
  const stand = OWN_POSE.has(id) ? zero : mergePose(zero, armsDown(rig, { spread: 0.07, bend: 0.12 }));
  rig.POSES = { ...(rig.POSES || {}), stand };
  if (Y && D.thigh) addPoses(rig, id, stand);   // 灵魂的骨架不是 makeHuman 建的（没有 rig.Y），只能站着
  return finishAdapt(rig, base);
}

function addPoses(rig, id, stand) {
  const D = rig.dims, Y = rig.Y;
  // 坐：大腿水平、手搭在大腿上
  const sitLegs = mergePose(stand, seatedPose(rig, SEAT, { spread: 0.1, thigh: 1.5, back: -0.02 }), { torso: [0.05, 0, 0] }, id === 'margaret' ? STOOP(0.7) : {});
  const lap = SEAT + 0.05 * D.height / 1.78 + 0.1;
  const sit = rig.solve(sitLegs, { L: { pos: [0.12, lap, 0.24], pole: [1, -0.4, -0.5] }, R: { pos: [-0.12, lap, 0.24], pole: [-1, -0.4, -0.5] } });
  // 躺（脸朝上、头朝 -Z）：整个人绕髋关节转 90°，脚底留在 root 原点，背贴着 root 的 y = 0（床面）
  const lie = mergePose(stand, { body: [-Math.PI / 2, 0, 0], 'body.p': [0, 0.13 - D.hipY, -D.hipY] });
  // 跪：大腿竖直、小腿平放在地上，双手在胸前合拢
  const kneelLegs = mergePose(stand, {
    'body.p': [0, D.thigh + 0.06 - D.hipY, -0.02], torso: [0.12, 0, 0], head: [0.1, 0, 0],
    legL: [0.05, 0, 0.06], kneeL: [1.5, 0, 0], footL: [1.1, 0, 0], legR: [0.05, 0, -0.06], kneeR: [1.5, 0, 0], footR: [1.1, 0, 0],
  });
  const ky = Y.chest + D.thigh + 0.06 - D.hipY - 0.06;
  const kneel = rig.solve(kneelLegs, { L: { pos: [0.03, ky, 0.27], pole: [1, -1, -0.2] }, R: { pos: [-0.03, ky, 0.27], pole: [-1, -1, -0.2] } });
  Object.assign(rig.POSES, { sit, lie, kneel });
}

function finishAdapt(rig, base) {
  const J = rig.joints, root = rig.root;
  // 射线点击走 SkinnedMesh（在 root 下）：parts.body 指向 root；头 / 手是骨骼，parts.head 留骨骼用来挂气泡
  const holder = new THREE.Group(); holder.name = 'held'; holder.position.set(0, -0.07, 0.03); J.handR.add(holder);
  rig.parts = { ...rig.parts, body: root, head: J.head, armL: J.armL, armR: J.armR, held: holder };
  rig.placeholder = false;
  rig.bob = () => {};
  rig.setHeld = (obj) => { holder.clear(); if (obj) holder.add(obj); };
  rig.setPose = (p) => {
    if (typeof p !== 'string') return base(p);
    rig.poseName = p; rig.basePose = rig.POSES[p] || rig.POSES.stand;
    base(rig.basePose);
    if (rig._idleFn) rig.play(p === 'lie' ? 'none' : 'idle');
  };
  rig.reach = (side, pos, { pole, aim, hand } = {}) => base(rig.solve(rig.basePose, {
    [side]: { pos, pole: pole || [side === 'L' ? 1 : -1, -0.6, -0.4], aim, hand },
  }));
  rig.setPose('stand');
  return rig;
}

/** 第六到八灾的人物：有正式模型的用模型（见 REAL），没有的回落到占位人物。 */
export function makePerson(id) {
  const make = REAL[id];
  const rig = make ? make() : null;
  if (!rig) return makeMockPerson(id);
  return rig.adapted ? rig : adapt(rig, id);   // 抱琴的乐手模型自带接口（见 musician_model.js）
}

