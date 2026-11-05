// 第三灾人物变体：湖岸的 Margaret（脸上爬着蚊子、拿苍蝇拍拍脸，参考 01:50–02:06）和白桦林圆桌边的 David（05:42–06:14）。
// 身体全部复用 cast.js（margaretBody({ stool, seat }) / davidBody），这里只加：脸上的蚊子和血点、苍蝇拍和拍脸的动作；
// David 的坐姿、说话、蚊群聚拢并盖住他（蚊群 + 黑色毛茸覆盖层）和消失。接口见 docs/plague3_api.md §7.2。
// 坐标同 cast.js：脚底 y = 0、面朝 +Z、左手在 +X（Margaret 的右手 = −X，拿苍蝇拍）。
import {
  THREE, V, TAU, clamp, lerp, smooth, headSurface, animate, Ease, getPropFactory, rng, leafGeo, prep, mergeGeometries, faceSet, blob,
} from './charkit.js';
import { lifeIdle } from './human.js';
import { margaretBody, davidBody, seatedPose, mergePose, STOOP, holdUpright, paintDavid, DAVID_HAT } from './cast.js';
import { mosquitoGeometry, makeGnatSwarm, makeGnatCover, capsulePoints } from './props_p3_shared.js';

/** Margaret 坐的三脚凳座面高（米，margaretBody 的 seat）。 */
export const MARGARET_SEAT = 0.4;
/**
 * David 坐的凳面高、桌面高（同 p3_grove_table 的 table_seat 0.45 / 桌面 0.75）、桌子靠他这一侧的边缘在他身前多远（root 的 +z 方向，米）、
 * 手腕放在桌面上的位置（离他 root 的 +z 距离）。圆桌半径 0.47，所以 David 的 root 应在桌心后方 DAVID_TO_TABLE_CENTER = 0.62 m。
 */
export const DAVID_SEAT = 0.45;
export const DAVID_TABLE_TOP = 0.75;
export const DAVID_TABLE_EDGE = 0.15;
export const DAVID_HAND_Z = 0.27;
export const DAVID_TO_TABLE_CENTER = 0.62;

const PI = Math.PI;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

/** 在两份姿势字典之间插值写入 rig.pose（只写 b 里有的关节）。 */
function blendPose(rig, a, b, k) {
  for (const n in b) {
    const pa = a[n] || b[n], pb = b[n], p = rig.pose[n] || (rig.pose[n] = [0, 0, 0]);
    p[0] = lerp(pa[0], pb[0], k); p[1] = lerp(pa[1], pb[1], k); p[2] = lerp(pa[2], pb[2], k);
  }
}

/** 道具工厂的模型用全局缓存材质：挂到人物上之前复制一份（rig.setOpacity 只影响这一份）。 */
function ownMaterials(obj) {
  const copies = new Map();
  const own = (m) => { if (!copies.has(m)) copies.set(m, m.clone()); return copies.get(m); };
  obj.traverse((o) => { if (o.material) o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material); });
  return obj;
}

function prop(id, opts = {}) {
  const f = getPropFactory();
  try { const o = f ? f(id, opts) : null; return o ? ownMaterials(o) : null; } catch (e) { return null; }
}

// ===========================================================================
// 脸部坐标：贴脸画的东西（蚊子、血点）用“脸坐标” (fx, fy) ∈ [-1, 1]，和 paintMargaret 画脸用的是同一套
// （贴花纹理按 x / (2 rx) 平面投影，所以下半脸要按变形后的 x 反解球面方向）。预先算一张网格，运行时双线性取值。
// ===========================================================================

function faceMap(rig, { nx = 41, ny = 37, fxMax = 0.95, fyMin = -0.9, fyMax = 0.8 } = {}) {
  const def = rig.headDef, rx = rig.dims.headR[0];
  const P = [], N = [], T = [];
  const p = V();
  const solve = (fx, fy) => {
    const lim = Math.sqrt(Math.max(1e-4, 1 - fy * fy)) * 0.995;
    let s = clamp(fx, -lim, lim);
    for (let i = 0; i < 10; i++) {
      headSurface(def, s, fy, p);
      const r = p.x / rx;
      if (Math.abs(fx) < 1e-5 || Math.abs(r) < 1e-5) break;
      s = clamp(s * fx / r, -lim, lim);
    }
    return headSurface(def, s, fy, V());
  };
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) P.push(solve(lerp(-fxMax, fxMax, i / nx), lerp(fyMin, fyMax, j / ny)));
  const at = (i, j) => P[clamp(j, 0, ny) * (nx + 1) + clamp(i, 0, nx)];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const dx = at(i + 1, j).clone().sub(at(i - 1, j)), dy = at(i, j + 1).clone().sub(at(i, j - 1));
    const n = dx.clone().cross(dy).normalize();
    if (n.z < 0) n.negate();
    N.push(n); T.push(dx.normalize());
  }
  const _a = V(), _b = V();
  const sample = (arr, fx, fy, out) => {
    const u = clamp((fx + fxMax) / (2 * fxMax), 0, 1) * nx, v = clamp((fy - fyMin) / (fyMax - fyMin), 0, 1) * ny;
    const i0 = Math.min(nx - 1, Math.floor(u)), j0 = Math.min(ny - 1, Math.floor(v)), a = u - i0, b = v - j0;
    const g = (i, j) => arr[j * (nx + 1) + i];
    _a.copy(g(i0, j0)).lerp(g(i0 + 1, j0), a); _b.copy(g(i0, j0 + 1)).lerp(g(i0 + 1, j0 + 1), a);
    return out.copy(_a).lerp(_b, b);
  };
  return {
    pos: (fx, fy, out = V()) => sample(P, fx, fy, out),
    nrm: (fx, fy, out = V()) => sample(N, fx, fy, out).normalize(),
    tan: (fx, fy, out = V()) => sample(T, fx, fy, out).normalize(),
  };
}

/** 拿不到 p3_swatter 时的简易苍蝇拍（木柄 + 一把白色羽毛扇面；局部 +x 朝扇面方向，同物品模型）。 */
function fallbackSwatter(M) {
  const root = new THREE.Group(); root.name = 'p3_swatter';
  root.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.012, 0.25, 10).rotateZ(PI / 2).translate(-0.085, 0, 0), M.toon('#8d6a45')));
  const fs = [];
  for (let i = 0; i < 11; i++) {
    const t = i / 10 - 0.5, g = leafGeo(0.2 - Math.abs(t) * 0.07, 0.034 - Math.abs(t) * 0.008, { depth: 0.002 });
    g.rotateZ(t * 1.05 - PI / 2); g.translate(0.05, t * 0.014, (i % 3) * 0.003); fs.push(prep(g));
  }
  root.add(new THREE.Mesh(mergeGeometries(fs, false), M.toon('#efebe0', { side: THREE.DoubleSide })));
  return root;
}

// ===========================================================================
// MARGARET（湖岸，01:50–02:06）
// 坐在三脚凳上，双手在胸前；脸上爬着十几只蚊子（01:54），拿到苍蝇拍后右手竖握（01:56），拍脸（01:58）：
// 蚊子被拍扁成一个个红点（中间一点黑），随后擦干净，只在脸颊留一个小血点；之后一直竖握着拍子（02:00–02:06）。
// ===========================================================================

/** 蚊子在脸上的落点（脸坐标，按参考 01:54 的位置：额头、鼻梁两侧、两颊、下巴各处，避开 3D 鼻子）。 */
const GNAT_SPOTS = [
  [-0.22, 0.34], [-0.06, 0.28], [0.12, 0.2], [0.28, 0.4], [-0.42, 0.46], [0.02, 0.52], [0.44, 0.3],
  [0.5, -0.12], [0.54, -0.3], [-0.5, -0.2], [-0.45, -0.42], [-0.28, -0.5], [0.3, -0.62], [-0.04, -0.72],
];
/** 拍完之后脸上留下的那一个小血点（序号，对应 GNAT_SPOTS）。 */
const KEEP_SPOT = 8;
/** 苍蝇拍在她手里的缩放（物品模型长约 0.48 m；参考里她握着的拍子全长约 0.4 m）。 */
const SWATTER_SCALE = 0.84;

/** 鼻子（3D 的蒜头鼻）占的脸坐标范围：蚊子爬行时绕开。 */
const NOSE_BOX = [-0.4, 0.4, -0.5, 0.1];

function buildMargaretGnats() {
  const rig = margaretBody('margaret_gnats', { stool: true, seat: MARGARET_SEAT });
  const M = rig.mats, J = rig.joints, Y = rig.Y;
  const fm = faceMap(rig);

  // ---- 姿势：坐姿同第一灾（驼背前倾），双手在胸前合着；拿拍子时右手竖握在胸前偏右，左手松松放在腹前 ----
  const SIT = mergePose(seatedPose(rig, MARGARET_SEAT, { spread: 0.14, thigh: 1.45, back: -0.02 }), STOOP(1), { head: [-0.25, 0.15, 0.05] });
  const hy = Y.chest + SIT['body.p'][1] - 0.02;
  const TOGETHER = rig.solve(SIT, {
    L: { pos: [0.07, hy, 0.3], pole: [1, -1, -0.3], aim: { fingers: [0.1, 0.8, 0.6], palm: [-1, 0, 0.1] } },
    R: { pos: [-0.01, hy - 0.01, 0.3], pole: [-1, -1, -0.3], aim: { fingers: [0.1, 0.8, 0.6], palm: [1, 0, -0.1] } },
  });
  const GRIP = { fingers: [0.6, 0.2, 0.75], palm: [0.8, 0, -0.6] };
  const UP = rig.solve(SIT, {
    R: { pos: [-0.15, hy + 0.03, 0.3], pole: [-0.5, -1, -0.5], aim: GRIP },
    L: { pos: [0.12, hy - 0.16, 0.28], pole: [1, -1, -0.3], hand: [0.3, 0, -0.2] },
  });
  const HIT = rig.solve(SIT, {
    R: { pos: [0.0, hy + 0.02, 0.35], pole: [-0.5, -1, -0.5], aim: GRIP },
    L: { pos: [0.12, hy - 0.16, 0.28], pole: [1, -1, -0.3], hand: [0.3, 0, -0.2] },
  });
  rig.POSES = { sit: SIT, together: TOGETHER, up: UP, hit: HIT };

  // ---- 苍蝇拍：握在右手（−X）拳心，拍柄竖直（holdUpright 在 root 空间里固定朝向），扇面朝前 ----
  const sw = prop('p3_swatter') || fallbackSwatter(M);
  sw.traverse((o) => { o.raycast = () => {}; });
  const mount = new THREE.Group(); mount.name = 'margaret_swatter';
  mount.position.set(0.016, -0.085, 0);
  J.handR.add(mount);
  sw.scale.setScalar(SWATTER_SCALE);
  sw.position.set(0.085 * SWATTER_SCALE, 0, 0);   // 拳心握在拍柄中段（柄尾露出拳头约 12 cm，同参考 01:58）
  mount.add(sw);
  mount.visible = false;
  const Q_UP = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.3, PI / 2 + 0.3, 'YXZ'));
  const Q_HIT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.2, PI / 2 - 0.04, 'YXZ'));
  const qCur = Q_UP.clone();
  holdUpright(rig, J.handR, mount, () => qCur);
  rig.swatterObj = mount;
  rig.anchors = { swatter: mount };

  // ---- 脸上的蚊子（InstancedMesh：1 个 draw call）+ 血点（2 个 InstancedMesh：红斑、斑中心的黑点） ----
  const LEN = 0.014, LIFT = LEN * 0.09;
  const N = GNAT_SPOTS.length;
  const fx = new THREE.Group(); fx.name = 'margaret_gnats'; J.head.add(fx);
  // 挂点：脸正前方（章节让“蚊子”物品从她脸上飞出来、头顶气泡等可以用）
  const faceAnchor = new THREE.Object3D(); faceAnchor.name = 'margaret_face'; faceAnchor.position.set(0, -0.02, rig.dims.headR[2] * 1.05); J.head.add(faceAnchor);
  rig.anchors = { ...rig.anchors, face: faceAnchor };
  const gnatMat = M.toon('#151515', { outline: false, side: THREE.DoubleSide });
  const gnats = new THREE.InstancedMesh(mosquitoGeometry(LEN, { detail: true }), gnatMat, N);
  gnats.name = 'margaret_gnats_face'; gnats.frustumCulled = false; gnats.castShadow = false; gnats.raycast = () => {};
  fx.add(gnats);
  const splat = new THREE.SphereGeometry(1, 12, 6).scale(0.0058, 0.0058, 0.0018);
  const bloodMat = M.toon('#a3161a', { outline: false });
  const coreMat = M.toon('#2a0b0d', { outline: false });
  const blood = new THREE.InstancedMesh(splat, bloodMat, N);
  const core = new THREE.InstancedMesh(splat, coreMat, N);
  for (const m of [blood, core]) { m.frustumCulled = false; m.castShadow = false; m.raycast = () => {}; fx.add(m); }
  blood.name = 'margaret_blood'; core.name = 'margaret_blood_core';
  core.renderOrder = 1;

  const R = rng(37);
  const G = GNAT_SPOTS.map(([hx, hy2], i) => ({
    hx, hy: hy2, x: hx, y: hy2, h: R() * TAU, sp: 0.16 + R() * 0.12, mode: 'pause', t: R() * 1.5,
    from: [hx, hy2], to: [hx, hy2], hop: 0, ph: [R() * TAU, R() * TAU, R() * TAU], d: i / N, away: V(R() - 0.5, 0.3 + R() * 0.6, 0.4 + R()).normalize(),
    bx: hx, by: hy2, sz: 0.85 + R() * 0.3,
  }));
  let presence = 1;          // 0 = 一只都没有（飞走 / 拍死了），1 = 全部落在脸上
  let kill = 0;              // 0..1：被拍扁的进度（蚊子缩没）
  let bloodK = 0, bloodDot = 0;   // 血点：全部（拍的那一下）→ 擦掉，只剩一个小点
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qe = new THREE.Quaternion(), _eu = new THREE.Euler();
  const _s = V(), _p = V(), _n = V(), _t = V(), _x = V(), _y = V(), _z = V();
  const allowed = (x, y) => Math.abs(x) < 0.8 && y > -0.84 && y < 0.62 && !(x > NOSE_BOX[0] && x < NOSE_BOX[1] && y > NOSE_BOX[2] && y < NOSE_BOX[3]);

  /** 摆好所有蚊子 / 血点的矩阵（dt 为 0 时只重摆不推进行为）。 */
  const layout = (dt, t) => {
    dt = Math.min(dt, 0.1);            // 切后台回来 dt 很大时别让蚊子一步跳出脸
    const show = presence > 0.001 && kill < 1;
    gnats.visible = show;
    if (show) {
      for (let i = 0; i < N; i++) {
        const g = G[i];
        if (dt > 0) {
          g.t -= dt;
          if (g.mode === 'walk') {
            g.x += Math.cos(g.h) * g.sp * dt; g.y += Math.sin(g.h) * g.sp * dt;
            const dx = g.x - g.hx, dy = g.y - g.hy;
            if (dx * dx + dy * dy > 0.015 || !allowed(g.x, g.y)) {      // 走远了 / 要上鼻子：掉头往家走
              g.h = Math.atan2(g.hy - g.y, g.hx - g.x) + (R() - 0.5) * 0.8;
              if (!allowed(g.x, g.y)) { g.x = g.bx; g.y = g.by; }
            } else g.h += (R() - 0.5) * 3 * dt;
            if (g.t <= 0) { g.mode = 'pause'; g.t = 0.5 + R() * 2; }
          } else if (g.mode === 'pause') {
            g.h += Math.sin(t * 5 + g.ph[0]) * 0.02;
            if (g.t <= 0) {
              if (R() < 0.16) {
                g.mode = 'hop'; g.hop = 0; g.from = [g.x, g.y];
                let tx = g.hx + (R() - 0.5) * 0.24, ty = g.hy + (R() - 0.5) * 0.24, tries = 0;
                while (!allowed(tx, ty) && tries++ < 8) { tx = g.hx + (R() - 0.5) * 0.24; ty = g.hy + (R() - 0.5) * 0.24; }
                g.to = allowed(tx, ty) ? [tx, ty] : [g.hx, g.hy];
                g.h = Math.atan2(g.to[1] - g.y, g.to[0] - g.x);
              } else { g.mode = 'walk'; g.t = 0.35 + R() * 0.9; g.h += (R() - 0.5) * 2.4; }
            }
          } else if (g.mode === 'hop') {
            g.hop += dt / 0.5;
            const e = smooth(clamp(g.hop, 0, 1));
            g.x = lerp(g.from[0], g.to[0], e); g.y = lerp(g.from[1], g.to[1], e);
            if (g.hop >= 1) { g.mode = 'pause'; g.t = 0.5 + R() * 1.5; g.x = g.to[0]; g.y = g.to[1]; }
          }
        }
        // 到达 / 离开：按序号错开，飞着绕脸盘旋着落下（u 0 = 远处，1 = 落稳）
        const u = clamp((presence * (1 + 0.55) - g.d * 0.55) / 0.9, 0, 1);
        const air = 1 - smooth(u);
        fm.pos(g.x, g.y, _p); fm.nrm(g.x, g.y, _n); fm.tan(g.x, g.y, _t);
        _t.addScaledVector(_n, -_t.dot(_n)).normalize();
        _y.copy(_n).cross(_t);                                     // 脸平面内垂直于前进方向的那条轴
        const hopH = g.mode === 'hop' ? Math.sin(PI * clamp(g.hop, 0, 1)) * 0.022 : 0;
        _x.copy(_t).multiplyScalar(Math.cos(g.h)).addScaledVector(_y, Math.sin(g.h)).normalize();     // 朝向
        _z.copy(_x).cross(_n).normalize();
        _p.addScaledVector(_n, LIFT + hopH);
        if (air > 0.001) {
          const a = t * (2.4 + g.d) + g.ph[0], b = t * 1.7 + g.ph[1], c = t * 2.9 + g.ph[2];
          _p.addScaledVector(_n, air * 0.05 + Math.sin(c) * 0.012 * air)
            .addScaledVector(_t, Math.sin(a) * 0.05 * air).addScaledVector(_y, Math.cos(b) * 0.04 * air);
          _p.addScaledVector(g.away, (1 - u) * (1 - u) * 0.3);
        }
        const sc = g.sz * clamp(u * 3, 0, 1) * (1 - smooth(clamp(kill * 1.6 - g.d * 0.6, 0, 1)));
        _m.makeBasis(_x, _n, _z);
        _q.setFromRotationMatrix(_m);
        const jit = air > 0.001 || g.mode === 'hop' ? 0.3 : 0.05;           // 在空中 / 跳的时候翅膀嗡嗡抖得厉害，趴着时只是轻微抖
        _q.multiply(_qe.setFromEuler(_eu.set(Math.sin(t * 40 + g.ph[1]) * jit, 0, Math.sin(t * 33 + g.ph[2]) * jit)));
        _m.compose(_p, _q, _s.setScalar(Math.max(1e-4, sc)));
        gnats.setMatrixAt(i, _m);
        // 血点就记在蚊子“拍死”时的位置（kill 刚开始时 bx/by 更新）
        if (kill === 0) { g.bx = g.x; g.by = g.y; }
      }
      gnats.instanceMatrix.needsUpdate = true;
    }
    const showBlood = bloodK > 0.001 || bloodDot > 0.001;
    blood.visible = core.visible = showBlood;
    if (showBlood) {
      for (let i = 0; i < N; i++) {
        const g = G[i];
        const keep = i === KEEP_SPOT;
        const k = keep ? Math.max(bloodDot * 0.55, bloodK) : bloodK;
        fm.pos(g.bx, g.by, _p); fm.nrm(g.bx, g.by, _n); fm.tan(g.bx, g.by, _t);
        _t.addScaledVector(_n, -_t.dot(_n)).normalize();
        _y.copy(_n).cross(_t);
        _m.makeBasis(_t, _y, _n);
        _q.setFromRotationMatrix(_m);
        const sz = (0.7 + (i % 3) * 0.22) * smooth(clamp(k, 0, 1)) * (keep ? 0.85 : 1.15);
        _p.addScaledVector(_n, 0.0012);
        _m.compose(_p, _q, _s.setScalar(Math.max(1e-4, sz)));
        blood.setMatrixAt(i, _m);
        _p.addScaledVector(_n, 0.0008);
        _m.compose(_p, _q, _s.setScalar(Math.max(1e-4, sz * 0.38)));
        core.setMatrixAt(i, _m);
      }
      blood.instanceMatrix.needsUpdate = core.instanceMatrix.needsUpdate = true;
    }
  };
  rig._upd.push((dt, t) => layout(dt, t));

  // ---- 状态 ----
  let gnatsOn = true, swatter = false, swatted = false, gen = 0;
  const applyHands = () => {
    rig.setHand('L', swatter ? 'relax' : 'pray');
    rig.setHand('R', swatter ? 'grip' : 'pray');
    mount.visible = swatter;
  };
  const restPose = () => (swatter ? UP : TOGETHER);
  const applyStatic = () => {
    presence = gnatsOn ? 1 : 0; kill = swatted && !gnatsOn ? 1 : 0;
    bloodK = 0; bloodDot = swatted ? 1 : 0;
    qCur.copy(Q_UP);
    applyHands();
    rig.setPose(restPose());
    rig.setExpression('neutral');
    for (const g of G) { g.x = g.hx; g.y = g.hy; g.bx = g.hx; g.by = g.hy; g.mode = 'pause'; g.t = 0.3 + R(); }
    layout(0, rig._t);
    rig.apply();
  };

  /** 蚊子飞来落满脸 / 飞走（约 1 秒）。 */
  rig.setGnats = (on = true, { instant = false } = {}) => {
    const g = ++gen;
    gnatsOn = !!on;
    if (on) { kill = 0; }
    if (instant) { presence = on ? 1 : 0; layout(0, rig._t); return Promise.resolve(); }
    const from = presence, to = on ? 1 : 0;
    return animate(1100, (k) => { if (g !== gen) return; presence = lerp(from, to, k); }, Ease.inOutSine).then(() => { if (g === gen) presence = to; });
  };

  /** 接过苍蝇拍：右手抬到胸前，竖握（约 0.9 秒）。 */
  rig.takeSwatter = ({ instant = false } = {}) => {
    const g = ++gen;
    if (instant) { swatter = true; qCur.copy(Q_UP); applyHands(); rig.setPose(UP); return Promise.resolve(); }
    const from = {};
    for (const n in UP) from[n] = (rig.pose[n] || UP[n]).slice();
    let shown = false;
    return animate(900, (k) => {
      if (g !== gen) return;
      if (!shown && k > 0.45) { shown = true; swatter = true; qCur.copy(Q_UP); applyHands(); }
      blendPose(rig, from, UP, k);
      rig.apply();
    }, Ease.inOutSine).then(() => { if (g === gen) { swatter = true; applyHands(); rig.setPose(UP); } });
  };

  /**
   * 拍自己的脸（约 2.9 秒）：拍子举到脸前 → 蚊子全部拍扁，脸上冒出一个个红点 → 拍子放回胸前 → 血点渐渐擦净，只剩脸颊一个小点。
   * 还没拿拍子时先瞬间拿起。
   */
  rig.swat = ({ instant = false } = {}) => {
    const g = ++gen;
    if (swatted && !gnatsOn) { swatter = true; applyStatic(); return Promise.resolve(); }     // 已经拍过了：不重复拍
    if (!swatter) { swatter = true; qCur.copy(Q_UP); applyHands(); rig.setPose(UP); }       // 还没拿拍子：先瞬间拿起
    if (instant) { swatted = true; gnatsOn = false; applyStatic(); return Promise.resolve(); }
    const T = 2.9, TOUCH = 0.38;
    let hit = false;
    const base = SIT;
    return animate(T * 1000, (k) => {
      if (g !== gen) return;
      const t = k * T;
      const go = smooth(seg(t, 0, TOUCH)) * (1 - smooth(seg(t, 0.95, 1.6)));
      const press = Math.sin(PI * seg(t, TOUCH, 0.75)) * 0.5;              // 拍上去后往脸上压一下
      blendPose(rig, UP, HIT, go);
      rig.pose.handR = [rig.pose.handR[0] + press * 0.15, rig.pose.handR[1], rig.pose.handR[2]];
      qCur.slerpQuaternions(Q_UP, Q_HIT, go);
      if (!hit && t >= TOUCH) { hit = true; for (const q of G) { q.bx = q.x; q.by = q.y; } kill = 0.0001; }
      if (hit) {
        kill = smooth(seg(t, TOUCH, TOUCH + 0.25));
        bloodK = smooth(seg(t, TOUCH + 0.04, TOUCH + 0.2)) * (1 - smooth(seg(t, 1.9, 2.9)));
        bloodDot = smooth(seg(t, TOUCH + 0.04, TOUCH + 0.2));
      }
      const f = Math.sin(PI * seg(t, TOUCH - 0.04, 1.0));                  // 被拍到：头往后一缩
      rig.pose.head = [base.head[0] - 0.07 * f, base.head[1], base.head[2] + 0.04 * f];
      rig.pose.neck = [base.neck[0] - 0.03 * f, base.neck[1], base.neck[2]];
      rig.setExpression(t > TOUCH - 0.02 && t < 1.15 ? 'blink' : 'neutral');
    }, Ease.linear).then(() => {
      if (g !== gen) return;
      swatted = true; gnatsOn = false;
      kill = 1; bloodK = 0; bloodDot = 1; presence = 0;
      qCur.copy(Q_UP); rig.setPose(UP); rig.pose.head = base.head.slice(); rig.pose.neck = base.neck.slice();
      rig.setExpression('neutral'); rig.apply();
    });
  };

  /** 瞬时恢复（新游戏 / 读档）：{ gnats 脸上有蚊子, swatter 手里拿着苍蝇拍, swatted 已经拍过（脸颊留一个小血点） }，只改给出的字段。 */
  rig.setState = (s = {}) => {
    gen++;
    if (s.swatter !== undefined) swatter = !!s.swatter;
    if (s.swatted !== undefined) { swatted = !!s.swatted; if (swatted) { swatter = true; if (s.gnats === undefined) gnatsOn = false; } }
    if (s.gnats !== undefined) gnatsOn = !!s.gnats;
    applyStatic();
    return Promise.resolve();
  };
  rig.getState = () => ({ gnats: gnatsOn, swatter, swatted });

  lifeIdle(rig, { breath: 0.012, sway: 0.008, look: 0.05, seated: true, lookEvery: 7, arms: 0 });
  const base = rig._idleFn;
  rig._idleFn = (t, I, dt) => {
    base(t, I, dt);
    I.head[2] += Math.sin(t * 2.3) * 0.006;
    if (!swatter) { const r = Math.sin(t * 2.1); I.elbowL[0] += r * 0.05; I.elbowR[0] -= r * 0.05; I.handL[1] += r * 0.08; I.handR[1] += r * 0.08; }
  };
  rig.setState({ gnats: true, swatter: false, swatted: false });
  rig.play('idle'); rig.apply();
  return rig;
}

// ===========================================================================
// DAVID（白桦林圆桌边，05:42–06:14）
// 帽子、红马甲、卷袖白衬衫，坐在圆桌后，上身挺直，帽檐压着眼睛，脸微微低着、一脸坏笑看着镜头，双手放在桌沿。
// talk()：“我今天血糖非常低.”；coverWithGnats()：蚊群从四周聚来、盖住他的身体（黑色毛茸斑块一块块长出来）；vanish()：人消失。
// ===========================================================================

/** 这一场 David 的脸：在 paintDavid 上再加深眼袋（参考里两只眼睛下各一大片青灰色的月牙）。 */
function paintDavidTable(g, v) {
  paintDavid(g, v);
  for (const s of [-1, 1]) blob(g, [[s * 0.1, -0.035], [s * 0.3, -0.125], [s * 0.58, -0.05], [s * 0.52, -0.01], [s * 0.3, -0.07]], 'rgba(76,82,96,0.4)');
}

function buildDavidTable() {
  // 帽子照这一场的参考调整：帽檐更宽更平、帽带是浅驼色（第一灾的 David 是深色帽带）
  const rig = davidBody('david_table', { hat: { ...DAVID_HAT, color: '#755533', band: '#b59a72', brim: 0.072, up: 0.18, sideUp: 0.3, tilt: [-0.06, 0, 0.03] } });
  const J = rig.joints;
  rig.root.name = 'david_table';
  rig.face.tex = faceSet(paintDavidTable); rig.face.cur = null; rig.refreshFace();

  // ---- 坐姿：凳面 0.45，上身挺直，头略低；双手搭在桌沿（桌面 0.75，桌边在身前 0.15 m，手腕在身前 0.27 m） ----
  const SIT = mergePose(seatedPose(rig, DAVID_SEAT, { spread: 0.1, thigh: 1.5, back: -0.04 }), { torso: [0.07, 0, 0.01], neck: [0.05, 0, 0], head: [0.1, 0.0, 0.05] });
  const wristY = DAVID_TABLE_TOP + 0.015;
  const POSE = rig.solve(SIT, {
    L: { pos: [0.18, wristY, DAVID_HAND_Z], pole: [1, -0.5, -0.6], aim: { fingers: [0.05, -0.1, 1], palm: [0, -1, 0.1] } },
    R: { pos: [-0.18, wristY, DAVID_HAND_Z], pole: [-1, -0.5, -0.6], aim: { fingers: [-0.05, -0.1, 1], palm: [0, -1, 0.1] } },
  });
  rig.POSES = { sit: POSE };
  rig.setPose(POSE);
  rig.setHand('L', 'relax'); rig.setHand('R', 'relax');
  lifeIdle(rig, { breath: 0.01, sway: 0.006, look: 0.03, lookEvery: 6, seated: true, arms: 0 });

  // ---- 蚊群 + 黑色毛茸覆盖层 ----
  const COUNT = 220;
  const swarm = makeGnatSwarm({ count: COUNT, len: 0.02, seed: 12 });
  rig.root.add(swarm);
  swarm.setCloud([0, 1.05, 0.12], [0.62, 0.45, 0.45]);
  // 覆盖层的胶囊（关节局部坐标，略小于身体，外扩 inflate 后正好包住）：头、帽子、躯干、两条手臂
  const CAPS = {
    head: [[[0, -0.035, 0.005], [0, 0.04, 0.005], 0.085], [[-0.04, 0.115, 0.0], [0.04, 0.115, 0.0], 0.07], [[-0.1, 0.078, 0.02], [0.1, 0.078, 0.02], 0.04]],
    torso: [[[-0.07, 0.23, 0.0], [0.07, 0.23, 0.0], 0.095], [[-0.05, 0.02, 0.0], [0.05, 0.02, 0.0], 0.1], [[-0.14, 0.34, -0.01], [0.14, 0.34, -0.01], 0.05]],
    armL: [[[0, -0.01, 0], [0, -0.29, 0], 0.052]], armR: [[[0, -0.01, 0], [0, -0.29, 0], 0.052]],
    elbowL: [[[0, -0.01, 0], [0, -0.24, 0], 0.042]], elbowR: [[[0, -0.01, 0], [0, -0.24, 0], 0.042]],
  };
  const covers = [];
  let seed = 5;
  const NOISE = { head: 30, torso: 16, armL: 18, armR: 18, elbowL: 20, elbowR: 20 };   // 每米噪声格数：头小，斑块要密一点才不会整颗头一起黑
  for (const [joint, caps] of Object.entries(CAPS)) {
    const c = makeGnatCover(caps, { seed: seed++, fuzz: 0.012, inflate: 0.008, scale: NOISE[joint] });
    J[joint].add(c); covers.push(c);
  }
  const setCover = (k) => { for (const c of covers) c.setCover(k); };
  // 蚊子落点：各胶囊表面（换算到 root 空间）
  const landing = () => {
    const out = [];
    for (const [joint, caps] of Object.entries(CAPS)) {
      const rc = caps.map(([a, b, r]) => [rig.jointToRoot(J[joint], V(...a), V()).toArray(), rig.jointToRoot(J[joint], V(...b), V()).toArray(), r + 0.006]);
      out.push(...capsulePoints(rc, 90, 7 + out.length));
    }
    return out;
  };
  rig._upd.push((dt, t) => { if (swarm.visible) swarm.update(dt, t); });
  rig.swarm = swarm;
  rig.covers = covers;

  // ---- 状态 ----
  let covered = false, gone = false, gen = 0;
  const FULL_MIX = 0.82;
  const FULL_COVER = 0.4;            // 盖满的程度（参考 06:12：帽子、马甲、肩膀和半边脸被黑色毛茸斑块盖住约六成，脸还露着）
  const applyCover = (k, count, mix) => { swarm.setCount(count); swarm.setMix(mix); setCover(k); };
  const applyStatic = () => {
    rig.root.visible = !gone;
    if (covered) applyCover(FULL_COVER, COUNT, FULL_MIX); else applyCover(0, 0, 0);
    swarm.setAway(0);
    swarm.visible = covered;
    rig.setPose(POSE);
    rig.play('idle'); rig.setExpression('neutral');
    rig.apply();
  };

  /** 说话（约 2.4 秒）：嘴一张一合，头轻轻点着。章节同时显示字幕“我今天血糖非常低.”。 */
  rig.talk = ({ ms = 2400 } = {}) => {
    const g = ++gen;
    rig.play('talk');
    return animate(ms, (k) => {
      if (g !== gen) return;
      const f = Math.sin(PI * k);
      rig.pose.head = [POSE.head[0] + 0.03 * f * Math.sin(k * TAU * 3), POSE.head[1], POSE.head[2] + 0.025 * f * Math.sin(k * TAU * 2)];
      rig.apply();
    }, Ease.linear).then(() => { if (g === gen) { rig.play('idle'); rig.pose.head = POSE.head.slice(); rig.apply(); } });
  };

  /** 蚊群从四周聚拢，落满他的身体，黑色毛茸斑块一块块盖满（约 6 秒）。 */
  rig.coverWithGnats = ({ instant = false } = {}) => {
    const g = ++gen;
    covered = true;
    swarm.setCover(landing());
    if (instant) { applyStatic(); return Promise.resolve(); }
    swarm.visible = true; swarm.setAway(0);
    return animate(6000, (k) => {
      if (g !== gen) return;
      swarm.setCount(Math.round(COUNT * smooth(seg(k, 0, 0.2))));
      swarm.setMix(FULL_MIX * smooth(seg(k, 0.15, 0.9)));
      setCover(FULL_COVER * smooth(seg(k, 0.22, 1)));
    }, Ease.linear).then(() => { if (g === gen) applyCover(FULL_COVER, COUNT, FULL_MIX); });
  };

  /** 人消失：老电影式闪烁约 1 秒，最后整个隐藏（章节接着显示幼虫）。 */
  rig.vanish = ({ instant = false } = {}) => {
    const g = ++gen;
    gone = true;
    if (instant) { applyStatic(); return Promise.resolve(); }
    const r = rng(5);
    let next = 0;
    return animate(1000, (e) => {
      if (g !== gen) return;
      if (e >= next) {
        rig.root.visible = r() > e * 0.9;
        next = e + 0.04 + r() * 0.06;
      }
    }, Ease.linear).then(() => { if (g === gen) { rig.root.visible = false; } });
  };

  /** 瞬时恢复：{ covered: 已被蚊群盖住, gone: 已消失 }，只改给出的字段。 */
  rig.setState = (s = {}) => {
    gen++;
    if (s.covered !== undefined) covered = !!s.covered;
    if (s.gone !== undefined) gone = !!s.gone;
    if (covered) swarm.setCover(landing());
    applyStatic();
    return Promise.resolve();
  };
  rig.getState = () => ({ covered, gone });

  rig.headTop.position.y = rig.dims.headR[1] + 0.2;
  rig.setState({ covered: false, gone: false });
  rig.play('idle'); rig.apply();
  return rig;
}

export const CAST = {
  margaret_gnats: buildMargaretGnats,
  david_table: buildDavidTable,
};
