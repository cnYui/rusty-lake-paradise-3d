// 占位人物（mock）：第六、七灾的人物先用简单几何体代替，等正式网格模型做好再换（见 docs/plague6_7_design.md §人物）。
// makeMockPerson(id) → rig：root（脚底 y = 0、面朝 +Z，按真实身高建，scale 一律为 1）、parts（命名部件）、
//   setPose('stand' | 'sit' | 'lie')、setHeld(Object3D | null)（挂在右手）、bob(on)、update(dt, t)、placeholder = true。
// 不带骨骼动画：章节要“动作”就直接 tween parts 里的部件（例如 parts.armR.rotation）。
import * as THREE from 'three';
import { toon } from './materials.js';

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
  const H = spec.height, headR = H * 0.072;
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
  const torso = mesh(new THREE.CylinderGeometry(H * 0.085, H * 0.1, torsoH, 16), spec.coat, 'torso'); torso.position.y = legH + torsoH / 2; body.add(torso); parts.torso = torso;
  if (spec.vest) { const v = mesh(new THREE.CylinderGeometry(H * 0.088, H * 0.102, torsoH * 0.8, 16, 1, true), spec.vest, 'vest', { side: THREE.DoubleSide }); v.position.y = legH + torsoH * 0.45; body.add(v); }
  if (spec.apron) { const a = mesh(new THREE.BoxGeometry(H * 0.15, legH * 0.9, 0.01), spec.apron, 'apron'); a.position.set(0, legH * 0.55, H * 0.13); body.add(a); }
  // 手臂（肩部是枢轴，章节可以转 parts.armL / armR）
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.name = side < 0 ? 'armL' : 'armR';
    arm.position.set(side * H * 0.11, legH + torsoH * 0.92, 0);
    const sleeve = mesh(new THREE.CylinderGeometry(H * 0.026, H * 0.022, H * 0.3, 10), spec.shirtless ? SKIN : spec.coat, 'arm_mesh'); sleeve.position.y = -H * 0.15; arm.add(sleeve);
    const hand = mesh(new THREE.SphereGeometry(H * 0.024, 10, 8), spec.deer ? '#ecebe4' : SKIN, 'hand'); hand.position.y = -H * 0.31; arm.add(hand);
    arm.rotation.z = side * 0.08;
    body.add(arm); parts[arm.name] = arm;
  }
  const holder = new THREE.Group(); holder.name = 'held'; holder.position.y = -H * 0.32; parts.armR.add(holder); parts.held = holder;
  // 头
  const head = new THREE.Group(); head.name = 'head'; head.position.y = H - headR; body.add(head); parts.head = head;
  const skull = mesh(new THREE.SphereGeometry(headR, 20, 14), spec.deer ? '#a7855c' : SKIN, 'skull'); head.add(skull);
  const neck = mesh(new THREE.CylinderGeometry(headR * 0.4, headR * 0.45, H - headR * 1.6 - legH - torsoH, 10), SKIN, 'neck');
  neck.position.y = legH + torsoH + (H - headR * 1.6 - legH - torsoH) / 2; body.add(neck);
  for (const side of [-1, 1]) { const eye = mesh(new THREE.SphereGeometry(headR * 0.12, 8, 6), '#1c1a1c', 'eye'); eye.position.set(side * headR * 0.36, headR * 0.12, headR * 0.9); head.add(eye); }
  if (spec.hair) { const hair = mesh(new THREE.SphereGeometry(headR * 1.04, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), spec.hair, 'hair'); hair.rotation.x = -0.25; head.add(hair); }
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
        // 平躺：整个人绕脚底转 90°，头朝 -X
        body.rotation.z = Math.PI / 2; body.position.y = H * 0.1;
      } else if (parts.skirt) { parts.skirt.scale.y = 1; parts.skirt.position.y = legH / 2; }
    },
    setHeld(obj) { holder.clear(); if (obj) holder.add(obj); },
    bob(on) { rig.bobbing = on; },
    update(dt, t) { if (rig.bobbing && rig.pose !== 'lie') head.position.y = H - headR + Math.sin(t * 1.6 + H) * 0.006; },
  };
  root.userData.placeholder = true; root.userData.rig = rig;
  return rig;
}
