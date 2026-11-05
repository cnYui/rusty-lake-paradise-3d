// 第三灾（蚊灾和虱灾）小屋室内道具：钟罩小桌、玻璃钟罩培育台、陶轮、墙上的花瓶草图。接口见 docs/plague3_api.md §5。
// 外观对照参考视频：小桌 / 钟罩 01:16–01:20、10:12–10:28；陶轮 01:22、11:24–11:56、12:24–12:38；草图 01:22、11:24。
// 陶轮和草图的器形一律来自 props_p3_shared.js 的 POT / potSegment / potProfile / potOpen / drawPotOutline，
// 和物品 p3_vase_slim / p3_vase_urn 逐点一致；这里不另造轮廓。
// 约定：1 单位 = 1 米，原点在地面（桌子、陶轮）或底座底部中心（钟罩培育台），正面朝 +z；
// 状态方法返回 Promise，最后一个参数可以是 { instant: true }；有状态的道具都有 setState / getState（瞬时、可往回设）。
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  THREE, TAU, INK, group, mesh, lathe, rod, hit, cached, canvasTexture, rng, play, lerp, smooth, clamp, seg, Ease, animate,
  mergeGeometries, toon, unlit, contactShadow, POT, potSegment, potOpen, drawPotOutline,
} from './props_p3_shared.js';
import { FACTORIES as ITEM_FACTORIES } from './props_p3_items.js';

// ---------------------------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------------------------

const H = (key, make) => cached(`p3:house:${key}`, make);

/**
 * 参考帧里采样到的“亮面颜色”换算成材质基色。渲染器用 Neutral 色调映射（会把最小的颜色通道压掉一截），亮面又只吃到约 0.72 的光，
 * 所以直接填采样色会偏暗偏饱和（棕色里的蓝通道会被压到 0）；这里按同一条曲线反推，让渲染出来的颜色接近参考帧。
 */
function fromRef(hex, lit = 0.72) {
  const c = new THREE.Color(hex), t = [c.r, c.g, c.b], tm = Math.min(...t);
  const x = tm > 0.04 ? tm + 0.04 : Math.sqrt(tm / 6.25);   // 色调映射前的最小通道
  const off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  const o = new THREE.Color().setRGB(...t.map((v) => Math.min(1, (v + off) / lit)));
  return `#${o.getHexString()}`;
}
const V2 = (r, y) => new THREE.Vector2(r, y);

/** 手绘风木纹贴图：底色 + 细深色纹路 + 偶尔的节疤。dir = 'x' 纹路沿 u（横向，桌面 / 横板），'y' 沿 v（竖向，桌腿）。 */
function woodTex(base, { dir = 'x', seed = 1, lines = 18, dark = 0.2, light = 0.12, knots = 1 } = {}) {
  return H(`woodtex:${base}:${dir}:${seed}:${lines}:${dark}:${light}:${knots}`, () => {
    const horizontal = dir === 'x';
    return canvasTexture(horizontal ? 512 : 256, horizontal ? 256 : 512, (g, w, h) => {
      const r = rng(seed * 13 + 5);
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      g.lineCap = 'round';
      const along = horizontal ? w : h, across = horizontal ? h : w;
      const at = (a, b) => (horizontal ? [a, b] : [b, a]);
      for (let i = 0; i < lines; i++) {
        const b = r() * across, a0 = r() * along * 0.55, a1 = a0 + (0.3 + r() * 0.7) * along;
        g.strokeStyle = r() < 0.66 ? `rgba(55,36,20,${dark * (0.55 + r() * 0.45)})` : `rgba(255,236,200,${light * (0.55 + r() * 0.45)})`;
        g.lineWidth = 1 + r() * 2.2;
        g.beginPath();
        for (let a = a0, first = true; a <= a1; a += 22, first = false) {
          const off = Math.sin(a * 0.02 + i) * 2.2 + (r() - 0.5) * 1.2;
          const [x, y] = at(a, b + off);
          if (first) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
      g.strokeStyle = `rgba(45,28,14,${dark * 1.2})`; g.lineWidth = 2;
      for (let k = 0; k < knots; k++) {
        const [cx, cy] = at(r() * along, r() * across);
        for (let j = 0; j < 3; j++) { g.beginPath(); g.ellipse(cx, cy, (4 + j * 5) * (horizontal ? 1.6 : 0.8), (4 + j * 5) * (horizontal ? 0.8 : 1.6), 0, 0, TAU); g.stroke(); }
      }
    }, { wrap: true });
  });
}
const woodMat = (base, opts = {}, outline = 0.0045) => H(`woodmat:${base}:${JSON.stringify(opts)}:${outline}`, () => toon('#ffffff', { map: woodTex(base, opts), outline }));
const plain = (color, opts = {}) => H(`plain:${color}:${JSON.stringify(opts)}`, () => toon(color, opts));

/** 渐缩 / 外撇的方腿：顶面中心 (xt, zt)、底面中心 (xb, zb)，粗度 wt → wb（x）、dt → db（z），从 y0 到 y1。 */
function legGeo(xt, zt, xb, zb, y1, y0, wt, wb, dt = wt, db = wb) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) + 0.5;                                // 0 = 底，1 = 顶
    p.setXYZ(i, lerp(xb, xt, t) + p.getX(i) * lerp(wb, wt, t), y0 + t * (y1 - y0), lerp(zb, zt, t) + p.getZ(i) * lerp(db, dt, t));
  }
  g.computeVertexNormals();
  return g;
}
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const rbox = (w, h, d, r, x = 0, y = 0, z = 0) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)).translate(x, y, z);
/** 把一组几何体合并成一个网格（保留 uv，带贴图的材质需要）。 */
function mergeMesh(parent, geos, mat, name) {
  const clean = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const m = mesh(parent, mergeGeometries(clean), mat, name);
  return m;
}

/** 柔和的发光圆片（Sprite，加色混合，不挡点击）；opacity 由调用方逐帧改，所以每次新建材质。 */
function glowSprite(name, color, size) {
  const tex = H('glowtex', () => canvasTexture(128, 128, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  }, { wrap: false }));
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  m.material.userData.outlineParameters = { visible: false };
  m.name = name; m.scale.set(size, size, 1); m.visible = false; m.raycast = () => {};
  return m;
}

// ---------------------------------------------------------------------------------------------
// p3_jar_table —— 放钟罩的小桌（01:16、01:18）
// 深棕色木桌：外悬的圆角厚桌面（桌面偏红棕），带抽屉的围板，四条细而微微渐缩的腿，围板下一道细横档。
// ---------------------------------------------------------------------------------------------
function makeJarTable() {
  const root = group('p3_jar_table');
  const OL = 0.0058;                                              // 大件家具的描边略粗（原作里桌子的黑线比小物件粗）
  const topM = woodMat(fromRef('#7a5e50'), { dir: 'x', seed: 3, lines: 10, dark: 0.12, light: 0.08, knots: 0 }, OL);
  const bodyH = woodMat(fromRef('#46392d'), { dir: 'x', seed: 4, lines: 12, dark: 0.2, light: 0.06, knots: 0 }, OL);
  const bodyV = woodMat(fromRef('#3f3328'), { dir: 'y', seed: 5, lines: 12, dark: 0.2, light: 0.05, knots: 0 }, OL);
  const drawerM = woodMat(fromRef('#54453a'), { dir: 'x', seed: 6, lines: 9, dark: 0.18, light: 0.08, knots: 0 }, OL);
  const knobM = plain(fromRef('#7a6448'));
  const Y_TOP = 0.62, TOP_T = 0.03;
  const AW = 0.46, AD = 0.3, AH = 0.16;                          // 围板（内缩）的宽 / 深 / 高；桌面 0.56 × 0.38 向外悬出约 0.05
  // 桌面：圆角厚板，四边外悬
  mesh(root, new RoundedBoxGeometry(0.56, TOP_T, 0.38, 4, 0.015), topM, 'jar_table_top', [0, Y_TOP - TOP_T / 2, 0]);
  // 围板 + 抽屉面板 + 圆把手
  const apY = Y_TOP - TOP_T - AH / 2;
  mesh(root, new THREE.BoxGeometry(AW, AH, AD), bodyH, 'jar_table_apron', [0, apY, 0]);
  mesh(root, new THREE.BoxGeometry(0.34, 0.11, 0.014), drawerM, 'jar_table_drawer', [0, apY, AD / 2 + 0.004]);
  const knob = mesh(root, new THREE.SphereGeometry(0.0115, 14, 10), knobM, 'jar_table_knob', [0, apY, AD / 2 + 0.02]);
  knob.scale.set(1, 1, 0.8);
  // 四条腿：顶端是围板角上的方柱，往下渐缩变细
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    legs.push(legGeo(sx * (AW / 2 + 0.002), sz * (AD / 2 - 0.004), sx * (AW / 2 - 0.004), sz * (AD / 2 - 0.012), Y_TOP - TOP_T, 0, 0.046, 0.03, 0.046, 0.03));
  }
  mergeMesh(root, legs, bodyV, 'jar_table_legs');
  // 围板下紧贴着的一道细横档（前后 + 两侧）
  const rails = [];
  const ry = Y_TOP - TOP_T - AH - 0.012, rx = AW / 2 - 0.012, rz = AD / 2 - 0.016;
  for (const sz of [-1, 1]) rails.push(box(rx * 2, 0.022, 0.014, 0, ry, sz * rz));
  for (const sx of [-1, 1]) rails.push(box(0.014, 0.022, rz * 2, sx * rx, ry, 0));
  mergeMesh(root, rails, drawerM, 'jar_table_rails');
  hit(root, 'jar_table_hit', [0.58, Y_TOP, 0.4], [0, Y_TOP / 2, 0]);
  const spot = new THREE.Object3D(); spot.name = 'jar_spot'; spot.position.set(0, Y_TOP, 0); root.add(spot);
  contactShadow(root, 0.38, 0.28, { opacity: 0.3 });
  return root;
}

// ---------------------------------------------------------------------------------------------
// p3_bell_jar —— 玻璃钟罩培育台（01:18、01:20、10:12–10:28）
// 木底座（浅木、两层）+ 灰紫陶花盆（带一圈宽沿，盆里深色土）+ 拱顶玻璃钟罩。
// 钟罩壁很厚：外轮廓一道黑线、里面一条白色玻璃壁、再一道黑线；右内侧有一条竖向的暗色反光。
// ---------------------------------------------------------------------------------------------
const BELL = { r: 0.12, h: 0.4, arch: 0.11, wall: 0.018, up: 0.45, baseH: 0.054, potH: 0.075, soilY: 0.066 };

/** 钟罩的外轮廓（自下而上，半径 r、总高 h、顶部半椭圆拱高 arch）。 */
function domeProfile(r, h, arch, n = 16) {
  const yc = h - arch, pts = [[r, 0], [r, yc]];
  for (let i = 1; i <= n; i++) { const a = (i / n) * Math.PI / 2; pts.push([Math.max(0.0005, r * Math.cos(a)), yc + arch * Math.sin(a)]); }
  return pts;
}

/** 钟罩玻璃：外壳（白色玻璃边，菲涅耳硬阶 = 玻璃壁厚度）。和 props_inner 的卡通玻璃同一套做法，壁厚参数化。 */
function glassMaterial() {
  return H('mat:domeglass', () => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uLo: { value: 0.44 }, uHi: { value: 0.52 }, uBase: { value: 0.07 } },
      vertexShader: /* glsl */`
        varying vec3 vN; varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uLo; uniform float uHi; uniform float uBase;
        varying vec3 vN; varying vec3 vV;
        void main() {
          float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float rim = smoothstep(uLo, uHi, f);
          gl_FragColor = vec4(vec3(0.97, 0.96, 0.94), uBase + (0.93 - uBase) * rim);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: true,
    });
    m.userData.outlineParameters = { thickness: 0.0075, color: [0.05, 0.05, 0.05], alpha: 1, visible: true };
    return m;
  });
}
/** 钟罩内壁：只在轮廓处（视线擦过的地方）画黑线，其余是很淡的白雾 —— 内壁那道黑线随视角自己跟着走。 */
function glassInnerMaterial() {
  return H('mat:domeinner', () => {
    const m = new THREE.ShaderMaterial({
      vertexShader: /* glsl */`
        varying vec3 vN; varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vN; varying vec3 vV;
        void main() {
          float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float ink = step(0.64, f);
          gl_FragColor = vec4(mix(vec3(0.99, 0.98, 0.96), vec3(0.086, 0.082, 0.078), ink), mix(0.22, 1.0, ink));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.BackSide,
    });
    m.userData.outlineParameters = { visible: false };
    return m;
  });
}

function makeBellJar() {
  const root = group('p3_bell_jar');
  const { r, h, arch, wall, up, baseH, soilY } = BELL;

  // —— 木底座：两层（上沿略亮），宽 0.29
  const baseLip = plain(fromRef('#9a7f63'), { outline: 0.006 }), baseBody = plain(fromRef('#8f7859'), { outline: 0.006 });
  mesh(root, new THREE.BoxGeometry(0.29, 0.034, 0.29), baseBody, 'jar_base_body', [0, 0.017, 0]);
  mesh(root, new THREE.BoxGeometry(0.295, 0.02, 0.295), baseLip, 'jar_base_lip', [0, 0.044, 0]);

  // —— 花盆：灰紫陶，下窄上宽，上沿一圈宽边；盆里深色土
  const potG = group('jar_pot', root, [0, baseH, 0]);
  const potProfile = [[0, 0], [0.05, 0], [0.0505, 0.003], [0.067, 0.047], [0.0775, 0.05], [0.0775, 0.075], [0.07, 0.075], [0.07, 0.066]];
  mesh(potG, lathe(potProfile, 40), H('pot', () => toon(fromRef('#968b8c'), { outline: 0.0055 })), 'jar_pot_body');
  mesh(potG, new THREE.CircleGeometry(0.0695, 32).rotateX(-Math.PI / 2), plain(fromRef('#33261c'), { outline: false }), 'jar_soil', [0, soilY, 0]);

  // —— 植物挂点：土面中心
  const plantG = group('jar_plant', potG, [0, soilY, 0]);
  // 小芽（10:14）：一根细黑茎 + 顶上一片尖尖的深灰绿叶苞
  const sprout = group('jar_sprout', plantG);
  mesh(sprout, rod([0, 0, 0], [0.0015, 0.05, 0], 0.0028, 6, 0.0021), plain('#3b4631', { outline: 0.003 }), 'jar_sprout_stem');
  const bud = mesh(sprout, lathe([[0, 0], [0.0075, 0.007], [0.0098, 0.02], [0.0062, 0.034], [0, 0.047]], 14), plain('#667a4c', { outline: 0.0035 }), 'jar_sprout_bud', [0.0015, 0.045, 0]);
  bud.scale.set(0.9, 0.9, 0.4);
  // 两种花：复用物品模型，缩小到钟罩里合适的大小（原作里花盆连花只占钟罩高的一半多一点）
  const FLOWER_SCALE = { orange: [1.1, 0.72, 1.1], rose: [1.2, 0.8, 1.2] };   // 物品花茎偏长、花头偏小；钟罩里的花要矮而大，所以 x/z 放大、y 压低
  const flowers = {};
  for (const [kind, id] of [['orange', 'p3_flower_orange'], ['rose', 'p3_rose']]) {
    const holder = group(`jar_flower_${kind}`, plantG);
    holder.add(ITEM_FACTORIES[id]({}));
    holder.visible = false; flowers[kind] = holder;
  }
  // 长出来时的暖光（加色混合的大光斑，跟着花）
  const glow = glowSprite('jar_glow', '#ff9f4c', 0.95);
  glow.position.set(0, 0.2, -0.06);
  // glow 只在发光时才挂进场景（Sprite 会撑大包围盒）

  // —— 钟罩：厚壁玻璃。外壳（白边 + 描边）+ 内壁（只画轮廓黑线）+ 底沿黑环 + 右内侧的暗反光
  const dome = group('jar_dome', root, [0, baseH, 0]);
  const outerPts = domeProfile(r, h, arch), innerPts = domeProfile(r - wall, h - wall, arch - wall);
  const inner = mesh(dome, new THREE.LatheGeometry(innerPts.map(([x, y]) => V2(x, y)), 40), glassInnerMaterial(), 'jar_dome_in');
  inner.renderOrder = 1; inner.castShadow = false; inner.receiveShadow = false;
  const outer = mesh(dome, new THREE.LatheGeometry(outerPts.map(([x, y]) => V2(x, y)), 40), glassMaterial(), 'jar_dome_glass');
  outer.renderOrder = 2; outer.castShadow = false; outer.receiveShadow = false;
  // 底沿：一圈黑色的厚玻璃断面
  const rim = mesh(dome, new THREE.RingGeometry(r - wall, r, 40).rotateX(-Math.PI / 2), unlit(INK), 'jar_dome_rim', [0, 0.0008, 0]);
  rim.castShadow = false; rim.receiveShadow = false;
  // 右内侧的暗条：内壁上一段扇形（远侧的内壁，被花盆挡住时就看不见）
  const stripPts = domeProfile(r - wall - 0.001, h - wall - 0.001, arch - wall);
  const strip = mesh(dome, new THREE.LatheGeometry(stripPts.map(([x, y]) => V2(x, y)), 12, Math.PI - 1.36, 0.7),
    H('mat:domestrip', () => unlit('#1a1814', { transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide })), 'jar_dome_strip');
  strip.renderOrder = 1; strip.castShadow = false; strip.receiveShadow = false;
  hit(dome, 'jar_dome_hit', [0.26, h + 0.01, 0.26], [0, h / 2, 0]);

  hit(root, 'jar_pot_hit', [0.17, 0.1, 0.17], [0, baseH + 0.04, 0]);
  const flowerHit = hit(plantG, 'jar_flower_hit', [0.13, 0.2, 0.13], [0, 0.1, 0]);
  flowerHit.visible = false;

  // —— 状态
  const st = { dome: 'down', plant: 'none', kind: null };
  let domeK = 0, domeTok = 0, plantTok = 0, glowK = 0, bloomK = 1;
  const setDomeK = (k) => { domeK = k; dome.position.y = baseH + up * k; };
  const putFlower = (kind, k) => { const [sx, sy, sz] = FLOWER_SCALE[kind], m = Math.max(0.001, k); flowers[kind].scale.set(sx * m, sy * m, sz * m); };
  const showPlant = () => {
    sprout.visible = st.plant === 'sprout';
    for (const [kind, hd] of Object.entries(flowers)) hd.visible = st.plant === 'flower' && st.kind === kind;
    flowerHit.visible = st.plant === 'flower';
    if (st.plant === 'flower') putFlower(st.kind, bloomK);
  };
  const setGlow = (a) => {
    glowK = a; glow.visible = a > 0.01; glow.material.opacity = a;
    if (glow.visible && !glow.parent) root.add(glow);
    else if (!glow.visible && glow.parent) root.remove(glow);
  };

  root.setDome = (on, opts = {}) => {
    const from = domeK, to = on ? 1 : 0, tk = ++domeTok;
    st.dome = on ? 'up' : 'down';
    return play(on ? 800 : 700, (k) => { if (tk === domeTok) setDomeK(lerp(from, to, k)); }, opts, Ease.inOutSine);
  };
  /** 球茎种下去：土里冒出一根小芽（约 0.9 秒，由矮变高）。 */
  root.plant = (opts = {}) => {
    if (st.plant !== 'none') return Promise.resolve();
    st.plant = 'sprout'; st.kind = null; bloomK = 1; showPlant();
    const tk = ++plantTok;
    return play(900, (k) => { if (tk === plantTok) sprout.scale.set(1, Math.max(0.001, Ease.outBack(k)), 1); }, opts, Ease.linear);
  };
  /** 延时摄影：暖光里小芽抽高、长成花（约 2.6 秒）。kind = 'orange' | 'rose'。 */
  root.grow = (kind = 'orange', opts = {}) => {
    if (!flowers[kind]) kind = 'orange';
    if (st.plant === 'none') { st.plant = 'sprout'; sprout.scale.set(1, 1, 1); }
    st.plant = 'flower'; st.kind = kind;
    const tk = ++plantTok;
    sprout.visible = true;
    showPlant();
    const pose = (k) => {
      if (tk !== plantTok) return;
      const bloom = Ease.outBack(seg(k, 0.22, 0.86));
      bloomK = bloom;
      sprout.visible = k < 0.26;
      sprout.scale.set(1, 1 + 1.6 * seg(k, 0, 0.26), 1);
      putFlower(kind, bloom);
      flowers[kind].visible = k > 0.2;
      flowers[kind].rotation.y = (1 - seg(k, 0.2, 0.9)) * 1.4;
      setGlow(0.5 * smooth(seg(k, 0, 0.3)) * (1 - smooth(seg(k, 0.66, 1))));
    };
    return play(2600, (k) => { pose(k); if (k >= 1) { bloomK = 1; showPlant(); flowers[kind].rotation.y = 0; sprout.scale.set(1, 1, 1); } }, opts, Ease.linear);
  };
  /** 摘花：花缩没，花盆回到空盆。 */
  root.harvest = (opts = {}) => {
    if (st.plant !== 'flower') return Promise.resolve();
    const kind = st.kind, tk = ++plantTok;
    st.plant = 'none'; st.kind = null;
    const done = () => { bloomK = 1; showPlant(); flowers[kind].rotation.y = 0; };
    return play(320, (k) => { if (tk !== plantTok) return; putFlower(kind, 1 - Ease.inCubic(k)); if (k >= 1) done(); }, opts, Ease.linear)
      .then(() => { if (tk === plantTok) done(); });
  };
  root.setState = (s = {}) => {
    domeTok++; plantTok++;
    const dome_ = s.dome === 'up' ? 'up' : 'down';
    st.dome = dome_; setDomeK(dome_ === 'up' ? 1 : 0);
    st.plant = ['sprout', 'flower'].includes(s.plant) ? s.plant : 'none';
    st.kind = st.plant === 'flower' ? (flowers[s.kind] ? s.kind : 'orange') : null;
    bloomK = 1; sprout.scale.set(1, 1, 1);
    for (const hd of Object.values(flowers)) hd.rotation.y = 0;
    setGlow(0); showPlant();
    return Promise.resolve();
  };
  root.getState = () => ({ dome: st.dome, plant: st.plant, kind: st.kind });
  root.update = (dt, t) => {
    if (st.plant === 'flower' && flowers[st.kind].visible) flowers[st.kind].rotation.z = Math.sin(t * 1.3) * 0.02;
  };
  root.setState({});
  return root;
}

// ---------------------------------------------------------------------------------------------
// p3_pottery_wheel —— 陶轮（01:22、11:24–11:56、12:24–12:38）
// 浅木桌（厚桌面、四条外撇的腿、桌面下一圈围档）+ 桌面上的石轮盘（灰色圆盘叠在木鼓上）+ 中轴 + 桌下的脚踏轮盘。
// 陶土三段各自车削，段间一圈接缝线；点一段就把这一段换成下一种形状（POT.variants），换形约 0.25 秒。
// ---------------------------------------------------------------------------------------------
const WHEEL = { W: 0.88, D: 0.6, H: 0.74, slab: 0.09, drumR: 0.205, drumH: 0.07, discR: 0.23, discH: 0.026 };
const CLAY_Y = WHEEL.H + WHEEL.drumH + WHEEL.discH;      // 陶土底面的高度
const SEG_Y = [0, POT.segH[0], POT.segH[0] + POT.segH[1]];  // 三段的底面（相对陶土底面）

/** 某段某变体的外轮廓，换算成段内坐标（y 从 0 起）。 */
const segLocal = (i, v) => potSegment(i, v).map(([rr, y]) => [rr, y - SEG_Y[i]]);
/** 线性插值取 pts（按 y 升序）在高度 y 处的半径。 */
function radiusAt(pts, y) {
  if (y <= pts[0][1]) return pts[0][0];
  for (let j = 1; j < pts.length; j++) {
    if (y <= pts[j][1]) { const [r0, y0] = pts[j - 1], [r1, y1] = pts[j]; return y1 === y0 ? r1 : r0 + (r1 - r0) * (y - y0) / (y1 - y0); }
  }
  return pts[pts.length - 1][0];
}
/** 两条轮廓之间的形变：取两条轮廓所有拐点高度的并集，逐点插半径；k = 0 / 1 时和原轮廓一模一样。 */
function morphProfile(a, b) {
  const ys = [...new Set([...a, ...b].map((p) => Math.round(p[1] * 1e5) / 1e5))].sort((x, y) => x - y);
  const ra = ys.map((y) => radiusAt(a, y)), rb = ys.map((y) => radiusAt(b, y));
  return (k) => ys.map((y, i) => [lerp(ra[i], rb[i], k), y]);
}
/** 一段陶土的几何体：车削的外壁（平滑法线）+ 上下两个平盖（硬边），段内坐标 y 从 0 起。 */
function claySegGeo(pts) {
  const parts = [lathe(pts, 40)];
  const [r0, y0] = pts[0], [r1, y1] = pts[pts.length - 1];
  if (r0 > 0.002) parts.push(new THREE.CircleGeometry(r0, 40).rotateX(Math.PI / 2).translate(0, y0, 0));
  if (r1 > 0.002) parts.push(new THREE.CircleGeometry(r1, 40).rotateX(-Math.PI / 2).translate(0, y1, 0));
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  parts.forEach((p) => p.dispose());
  return g;
}

function makePotteryWheel() {
  const root = group('p3_pottery_wheel');
  const { W, D, H: TOP, slab } = WHEEL;
  const wood = woodMat(fromRef('#9d866c'), { dir: 'x', seed: 8, lines: 22, dark: 0.2, light: 0.1, knots: 0 }, 0.0065);
  const woodV = woodMat(fromRef('#9a8369'), { dir: 'y', seed: 9, lines: 14, dark: 0.2, light: 0.1, knots: 0 }, 0.0065);
  const woodApron = woodMat(fromRef('#8a7962'), { dir: 'x', seed: 10, lines: 10, dark: 0.18, light: 0.06, knots: 0 }, 0.0065);

  // —— 桌子：厚桌面 + 围档 + 四条外撇的腿
  mesh(root, new RoundedBoxGeometry(W, slab, D, 3, 0.008), wood, 'wheel_table_top', [0, TOP - slab / 2, 0]);
  mesh(root, new THREE.BoxGeometry(W - 0.2, 0.05, D - 0.16), woodApron, 'wheel_table_apron', [0, TOP - slab - 0.025, 0]);
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push(legGeo(sx * 0.3, sz * 0.2, sx * 0.37, sz * 0.26, TOP - slab, 0, 0.092, 0.064, 0.07, 0.05));
  mergeMesh(root, legs, woodV, 'wheel_table_legs');

  // —— 旋转部分：中轴 + 脚踏盘 + 轮盘（桌面上的鼓和石盘）。除了桌子，其余都跟着转
  const spin = group('wheel_spin', root, [0, 0, 0]);
  const axleM = plain(fromRef('#ab9480'), { outline: 0.0055 }), footM = plain(fromRef('#a89275'), { outline: 0.0055 });
  const axleY0 = 0.083, axleY1 = TOP - slab + 0.01;
  mesh(spin, new THREE.CylinderGeometry(0.026, 0.026, axleY1 - axleY0, 14), axleM, 'wheel_axle', [0, (axleY0 + axleY1) / 2, 0]);
  const footY = 0.27;
  mesh(spin, new THREE.CylinderGeometry(0.195, 0.195, 0.034, 36), footM, 'wheel_foot', [0, footY, 0]);
  mesh(spin, new THREE.CircleGeometry(0.075, 24).rotateX(-Math.PI / 2), plain(fromRef('#8a7860'), { outline: false }), 'wheel_foot_hub', [0, footY + 0.0175, 0]);
  // 脚踏盘上的几道浅痕：转起来才看得出在转
  const marks = [];
  for (let i = 0; i < 3; i++) {
    const a = i * TAU / 3 + 0.4;
    marks.push(new THREE.BoxGeometry(0.075, 0.001, 0.008).rotateY(-a).translate(Math.cos(a) * 0.14, footY + 0.018, Math.sin(a) * 0.14));
  }
  mergeMesh(spin, marks, plain(fromRef('#8a7860'), { outline: false }), 'wheel_foot_marks');
  for (const o of spin.children) o.receiveShadow = false;
  root.getObjectByName('wheel_table_apron').receiveShadow = false;
  const head = group('wheel_head', spin, [0, TOP, 0]);
  const drumTex = H('drumtex', () => canvasTexture(256, 64, (g, w, hh) => {
    g.fillStyle = fromRef('#9d866c'); g.fillRect(0, 0, w, hh);
    g.strokeStyle = 'rgba(60,40,22,0.35)'; g.lineWidth = 3;
    for (const x of [0.08, 0.37, 0.66, 0.85]) { g.beginPath(); g.moveTo(x * w, 0); g.lineTo(x * w + 3, hh); g.stroke(); }
    g.strokeStyle = 'rgba(255,236,200,0.22)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, hh * 0.5); g.lineTo(w, hh * 0.52); g.stroke();
  }, { wrap: true }));
  mesh(head, new THREE.CylinderGeometry(WHEEL.drumR, WHEEL.drumR * 0.97, WHEEL.drumH, 40), H('drum', () => toon('#ffffff', { map: drumTex, outline: 0.0055 })), 'wheel_drum', [0, WHEEL.drumH / 2, 0]);
  mesh(head, new THREE.CylinderGeometry(WHEEL.discR, WHEEL.discR, WHEEL.discH, 48), plain(fromRef('#989898'), { outline: 0.0055 }), 'wheel_disc', [0, WHEEL.drumH + WHEEL.discH / 2, 0]);
  const discTex = H('disctex', () => canvasTexture(256, 256, (g, w) => {
    g.fillStyle = fromRef('#8c8c8c'); g.fillRect(0, 0, w, w);
    const r = rng(41);
    for (let i = 0; i < 4; i++) {            // 几道手磨出来的弧形浅痕
      const a0 = r() * TAU, rad = w * (0.18 + r() * 0.26);
      g.strokeStyle = r() < 0.5 ? 'rgba(60,60,60,0.5)' : 'rgba(215,215,215,0.5)'; g.lineWidth = 3 + r() * 3; g.lineCap = 'round';
      g.beginPath(); g.arc(w / 2, w / 2, rad, a0, a0 + 0.7 + r() * 0.9); g.stroke();
    }
  }, { wrap: false }));
  mesh(head, new THREE.CircleGeometry(WHEEL.discR - 0.032, 40).rotateX(-Math.PI / 2), H('discface', () => toon('#ffffff', { map: discTex, outline: false })), 'wheel_disc_face', [0, WHEEL.drumH + WHEEL.discH + 0.0009, 0]);

  // —— 陶土：三段，各自一个网格（段间的黑线 = 接缝）。clay 组放在盘面上，跟轮盘一起转
  const clay = group('wheel_clay', head, [0, WHEEL.drumH + WHEEL.discH, 0]);
  const clayTex = H('claytex', () => canvasTexture(256, 128, (g, w, hh) => {
    g.fillStyle = fromRef('#99693a'); g.fillRect(0, 0, w, hh);
    const r = rng(77);
    for (let i = 0; i < 320; i++) { g.fillStyle = r() < 0.55 ? 'rgba(92,50,12,0.14)' : 'rgba(255,208,132,0.13)'; g.fillRect(r() * w, r() * hh, 1 + r() * 3, 1 + r() * 2); }
    for (let i = 0; i < 3; i++) {            // 几道很淡的手捏痕：转动时看得出
      const x = (i + 0.25 + r() * 0.5) * w / 3;
      g.strokeStyle = 'rgba(92,50,12,0.11)'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, hh * 0.3, x - 6, hh * 0.7, x + 2, hh); g.stroke();
    }
  }, { wrap: true }));
  const clayMat = toon('#ffffff', { map: clayTex });          // 每只陶轮自己一份（finish 的闪光要改自发光）
  const mouthMat = plain('#3a2312', { outline: false });
  const segs = [0, 1, 2].map((i) => {
    const m = mesh(clay, claySegGeo(segLocal(i, 0)), clayMat, `clay_seg_${i}`, [0, SEG_Y[i], 0]);
    return m;
  });
  // 段间接缝线（原作里每段之间一道黑线）：细圆环，半径跟着形状走
  const seamMat = H('seam', () => toon('#26150a', { outline: false, side: THREE.DoubleSide }));
  const seams = [1, 2].map((i) => {
    const m = mesh(clay, new THREE.CylinderGeometry(1, 1, 0.0042, 40, 1, true), seamMat, `clay_seam_${i}`, [0, SEG_Y[i], 0]);
    m.castShadow = false; m.receiveShadow = false;
    return m;
  });
  // 开口的陶坯：顶面一个深色口
  const mouth = mesh(segs[2], new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), mouthMat, 'clay_mouth');
  mouth.castShadow = false; mouth.visible = false;
  const flash = glowSprite('wheel_flash', '#ffe2a8', 0.7);
  flash.position.set(0, 0.17, 0.02);          // 只在闪光时才挂到 clay 上（Sprite 会撑大包围盒）

  // 点击盒（不跟着转，放在 root 上）
  for (let i = 0; i < 3; i++) hit(root, `pot_seg_${i}_hit`, [0.34, POT.segH[i], 0.34], [0, CLAY_Y + SEG_Y[i] + POT.segH[i] / 2, 0]);
  hit(root, 'wheel_hit', [0.5, 0.12, 0.5], [0, TOP + 0.04, 0]);
  const spot = new THREE.Object3D(); spot.name = 'wheel_spot'; spot.position.set(0, CLAY_Y, 0); root.add(spot);
  contactShadow(root, 0.56, 0.42, { opacity: 0.3 });

  // —— 状态
  const st = { clay: false, shape: [...POT.start] };
  let cur = [0, 1, 2].map((i) => segLocal(i, st.shape[i]));        // 现在显示的各段轮廓
  let spinAngle = 0, pokeAngle = 0, omega = 0, omegaTarget = 0, tok = 0, finishTok = 0, flashK = 0;
  const applyAngle = () => { spin.rotation.y = spinAngle + pokeAngle; };
  const hitVisible = () => { for (let i = 0; i < 3; i++) root.getObjectByName(`pot_seg_${i}_hit`).visible = st.clay; };
  const setSegProfile = (i, pts) => { const old = segs[i].geometry; segs[i].geometry = claySegGeo(pts); old.dispose(); cur[i] = pts; };
  const refreshMouth = (shape = st.shape) => {
    const open = potOpen(shape), pts = cur[2], [r1, y1] = pts[pts.length - 1];
    mouth.visible = open && r1 > 0.02;
    mouth.position.y = y1 + 0.0009; mouth.scale.set(Math.max(0.001, r1 - 0.009), 1, Math.max(0.001, r1 - 0.009));
  };
  const setFlash = (a, glowA) => {
    flashK = a; clayMat.emissive.setScalar(a); flash.visible = glowA > 0.01; flash.material.opacity = glowA;
    if (flash.visible && !flash.parent) clay.add(flash);
    else if (!flash.visible && flash.parent) clay.remove(flash);
  };
  const refreshSeams = () => {
    seams.forEach((m, j) => {
      const lower = cur[j], upper = cur[j + 1];
      const rr = Math.max(lower[lower.length - 1][0], upper[0][0]) + 0.0009;
      m.scale.set(rr, 1, rr);
    });
  };
  const applyExact = (shape) => { for (let i = 0; i < 3; i++) setSegProfile(i, segLocal(i, shape[i])); refreshMouth(shape); refreshSeams(); };
  const normShape = (s) => [0, 1, 2].map((i) => (((Array.isArray(s) ? s[i] : POT.start[i]) | 0) % 4 + 4) % 4);

  /** 把一团新陶土放上轮盘（形状回到 POT.start）；on = false 直接收走。 */
  root.setClay = (on, opts = {}) => {
    ++tok; ++finishTok;
    if (!on) { st.clay = false; clay.visible = false; hitVisible(); return Promise.resolve(); }
    const wasOn = st.clay;
    st.clay = true; clay.visible = true; setFlash(0, 0); hitVisible();
    if (!wasOn) { st.shape = [...POT.start]; applyExact(st.shape); }
    if (wasOn || (opts && opts.instant)) { clay.scale.set(1, 1, 1); return Promise.resolve(); }
    const my = tok;
    return animate(420, (k) => { if (my === tok) { const e = Ease.outBack(k); clay.scale.set(lerp(1.25, 1, k), Math.max(0.01, lerp(0.3, 1, e)), lerp(1.25, 1, k)); } }, Ease.linear)
      .then(() => { if (my === tok) clay.scale.set(1, 1, 1); });
  };
  /** 换形：shape = [下, 中, 上]（每段 0..3）。换掉的那几段在约 0.25 秒里从旧轮廓形变到新轮廓。 */
  root.setShape = (shape, opts = {}) => {
    const to = normShape(shape);
    st.shape = to;
    const my = ++tok;
    if (!st.clay || (opts && opts.instant)) { applyExact(to); return Promise.resolve(); }
    const morphs = [0, 1, 2].map((i) => morphProfile(cur[i], segLocal(i, to[i])));
    return animate(250, (k) => {
      if (my !== tok) return;
      for (let i = 0; i < 3; i++) setSegProfile(i, morphs[i](k));
      mouth.visible = false; refreshSeams();
      if (k >= 1) applyExact(to);
    }, Ease.outSine).then(() => { if (my === tok) applyExact(to); });
  };
  root.getShape = () => [...st.shape];
  /** 点击反馈：轮盘转一下，这一段被捏一下（约 0.4 秒）。 */
  root.poke = (segIndex = 1) => {
    const i = clamp((segIndex | 0) / 2) * 2, m = segs[Math.round(i)];
    const from = pokeAngle, spinTarget = 1.6;
    return animate(420, (k) => {
      pokeAngle = from + spinTarget * Ease.outCubic(k);
      applyAngle();
      if (!st.clay) return;
      const s = Math.sin(k * Math.PI);
      m.scale.set(1 + 0.07 * s, 1 - 0.05 * s, 1 + 0.07 * s);
      if (k >= 1) m.scale.set(1, 1, 1);
    }, Ease.linear).then(() => { m.scale.set(1, 1, 1); });
  };
  /** 轮盘持续转动 / 停下（逐渐加速、减速；需要章节注册 update）。 */
  root.spin = (on = true) => { omegaTarget = on ? 5.5 : 0; return Promise.resolve(); };
  /** 陶坯做好了：一闪（暖白光）后从轮盘上消失，章节接着给物品。 */
  root.finish = (opts = {}) => {
    if (!st.clay) return Promise.resolve();
    st.clay = false; hitVisible();
    const my = ++finishTok; ++tok;
    if (opts && opts.instant) { clay.visible = false; setFlash(0, 0); return Promise.resolve(); }
    return animate(800, (k) => {
      if (my !== finishTok) return;
      const up = smooth(seg(k, 0, 0.45)), down = 1 - smooth(seg(k, 0.5, 1));
      setFlash(up * 0.9, k < 0.5 ? up : down);
      if (k > 0.47) clay.visible = false;
    }, Ease.linear).then(() => { if (my === finishTok) { clay.visible = false; setFlash(0, 0); } });
  };
  root.setState = (s = {}) => {
    ++tok; ++finishTok;
    const shape = normShape(s.shape);
    st.shape = shape; st.clay = !!s.clay;
    clay.visible = st.clay; clay.scale.set(1, 1, 1);
    for (const m of segs) m.scale.set(1, 1, 1);
    applyExact(shape); setFlash(0, 0); hitVisible();
    return Promise.resolve();
  };
  root.getState = () => ({ clay: st.clay, shape: [...st.shape] });
  root.update = (dt) => {
    if (omega === omegaTarget && omega === 0) return;
    omega += (omegaTarget - omega) * Math.min(1, dt * 3);
    if (Math.abs(omega - omegaTarget) < 0.01) omega = omegaTarget;
    spinAngle = (spinAngle + omega * dt) % TAU;
    applyAngle();
  };
  root.setState({});
  return root;
}

// ---------------------------------------------------------------------------------------------
// p3_vase_drawing —— 墙上的两张花瓶草图（01:22、11:24）
// 透明底的铅笔线稿：上面是 POT.targets.slim、下面是 POT.targets.urn，用 drawPotOutline 画（和物品、陶轮逐点一致）。
// 和原作一样画得有点歪（上面那张约 8°、下面那张约 3°，顺时针）。原点在贴片中心，朝 +z。
// ---------------------------------------------------------------------------------------------
function makeVaseDrawing() {
  const root = group('p3_vase_drawing');
  const W = 0.36, HH = 0.8, PPM = 1100;
  const tex = H('vasedrawing', () => canvasTexture(Math.round(W * PPM), Math.round(HH * PPM), (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const sketch = (shape, cx, baseFromBottom, tilt) => {
      const by = h - baseFromBottom * PPM, midY = by - 0.17 * PPM;
      g.save(); g.translate(cx, midY); g.rotate(tilt); g.translate(-cx, -midY);
      drawPotOutline(g, shape, cx, by, PPM, { color: 'rgba(104,102,98,0.88)', width: 5 });                 // 主线
      g.save(); g.translate(1.2, 0.8);
      drawPotOutline(g, shape, cx, by, PPM, { color: 'rgba(80,78,74,0.32)', width: 2 });                   // 铅笔的第二遍浅线
      g.restore();
      g.restore();
    };
    sketch(POT.targets.slim, w * 0.46, 0.435, 0.14);
    sketch(POT.targets.urn, w * 0.53, 0.03, 0.05);
  }, { wrap: false }));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, HH), H('mat:vasedrawing', () => unlit('#ffffff', { map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
  m.name = 'vase_drawing_sheet'; root.add(m);
  return root;
}

export const FACTORIES = {
  p3_jar_table: () => makeJarTable(),
  p3_bell_jar: () => makeBellJar(),
  p3_pottery_wheel: () => makePotteryWheel(),
  p3_vase_drawing: () => makeVaseDrawing(),
};
