// Core demo chapter (index.html?demo=1): a tiny self-contained stage that exercises every core
// system without depending on the art modules — 4 views (incl. two close-ups + a pan), item
// pickups, a wrong-item use, a combine recipe, a thought bubble, the letter reader, the inspector,
// cutscenes, an achievement toast, hints, film flicker and the ending card.
import * as THREE from 'three';
import { toon, flat, unlit, tex, canvasTexture, PALETTE } from '../art/materials.js';

const O = [-800, 0, 0]; // stage origin, far away from the island
const at = (x, y, z) => [O[0] + x, O[1] + y, O[2] + z];

const objs = {};

function shardGeometry(flip = false) {
  // half of an octahedron-ish gem, split vertically
  const g = new THREE.CylinderGeometry(0.0, 0.16, 0.22, 5, 1, false, 0, Math.PI);
  g.translate(0, 0.11, 0);
  const b = new THREE.CylinderGeometry(0.16, 0.0, 0.12, 5, 1, false, 0, Math.PI);
  b.translate(0, -0.06, 0);
  const grp = new THREE.Group();
  const mat = toon('#7fa3ae');
  const m1 = new THREE.Mesh(g, mat);
  const m2 = new THREE.Mesh(b, mat);
  grp.add(m1, m2);
  if (flip) grp.rotation.y = Math.PI;
  grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return grp;
}

function gemModel() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), toon(PALETTE.bloodFresh, { emissive: '#35094b' }));
  core.scale.set(1, 1.35, 1);
  core.name = 'gem_core';
  g.add(core);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 6, 20), toon(PALETTE.gold));
  band.rotation.x = Math.PI / 2;
  band.name = 'gem_band';
  g.add(band);
  return g;
}

function envelopeModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.22), toon('#c9a45c'));
  g.add(body);
  const flap = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.12, 3), toon('#b8924c'));
  flap.rotation.set(-Math.PI / 2, 0, Math.PI);
  flap.scale.set(1, 1, 0.08);
  flap.position.set(0, 0.012, -0.03);
  g.add(flap);
  return g;
}

function backdropTexture() {
  return canvasTexture(1024, 512, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#b9d6e2');
    sky.addColorStop(0.55, '#dfe6e4');
    sky.addColorStop(0.62, '#c9cfcf');
    sky.addColorStop(1, '#a9b0b1');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    // mountains
    const ridge = (y0, amp, color, seed) => {
      g.fillStyle = color;
      g.beginPath(); g.moveTo(0, h);
      let s = seed;
      for (let x = 0; x <= w; x += 8) {
        s = (s * 9301 + 49297) % 233280;
        const n = Math.sin(x * 0.011 + seed) * 0.5 + Math.sin(x * 0.031 + seed * 2) * 0.3 + (s / 233280) * 0.15;
        g.lineTo(x, y0 - n * amp);
      }
      g.lineTo(w, h); g.closePath(); g.fill();
    };
    ridge(h * 0.5, 90, '#9aa1ab', 1);
    ridge(h * 0.56, 50, '#7f8a83', 3);
    g.fillStyle = '#5d6460'; g.fillRect(0, h * 0.58, w, h * 0.03);
    g.fillStyle = 'rgba(220,224,224,0.35)'; g.fillRect(0, h * 0.6, w, h * 0.4);
  }, { wrap: false });
}

function buildStage(ctx) {
  const root = new THREE.Group();
  root.name = 'demo_stage';
  root.position.set(O[0], O[1], O[2]);
  // lights (zone-local so they only affect the demo)
  root.add(new THREE.HemisphereLight('#e9eef0', '#5f5a50', 1.5));
  const sun = new THREE.DirectionalLight('#fff5e6', 1.7);
  sun.position.set(4, 8, 6);
  sun.target.position.set(1.5, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -8; sun.shadow.camera.right = 8; sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
  root.add(sun, sun.target);
  // floor + backdrop
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48), flat('#8d8a80', { map: tex.sand({ base: '#9b978a', seed: 4 }) }));
  floor.material.map.repeat.set(6, 6);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 12, 48, 1, true, Math.PI * 0.55, Math.PI * 0.9),
    unlit('#ffffff', { map: backdropTexture(), side: THREE.BackSide }));
  back.position.y = 5;
  root.add(back);

  // pedestal + shard A
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.9, 10), toon(PALETTE.stone, { map: tex.stone({ rows: 4 }) }));
  ped.position.set(-1.6, 0.45, 0.2);
  ped.castShadow = ped.receiveShadow = true;
  root.add(ped);
  const shardA = shardGeometry(false);
  shardA.position.set(-1.6, 1.02, 0.2);
  shardA.name = 'shard_a';
  root.add(shardA);

  // the stranger (simple cartoon figure)
  const fig = new THREE.Group();
  fig.name = 'stranger';
  fig.position.set(1.5, 0, 0);
  const coat = toon('#2f2a26');
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, 1.25, 12), coat);
  body.position.y = 0.72;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), toon(PALETTE.skinPale));
  head.position.y = 1.58;
  head.scale.set(0.92, 1.08, 0.95);
  const faceTex = canvasTexture(256, 256, (g) => {
    g.fillStyle = PALETTE.skinPale; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#141414'; g.lineWidth = 6; g.lineCap = 'round';
    for (const x of [96, 160]) {
      g.beginPath(); g.moveTo(x - 18, 112); g.lineTo(x + 18, 112); g.stroke();
      g.fillStyle = '#141414'; g.beginPath(); g.arc(x, 122, 7, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(60,50,60,0.5)'; g.lineWidth = 3; g.beginPath(); g.arc(x, 128, 16, 0.2, Math.PI - 0.2); g.stroke();
      g.strokeStyle = '#141414'; g.lineWidth = 6;
    }
    g.beginPath(); g.moveTo(104, 186); g.quadraticCurveTo(128, 180, 152, 186); g.stroke();
  }, { wrap: false });
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), toon('#ffffff', { map: faceTex, outline: false }));
  face.position.set(0, 1.58, 0.225);
  const hat = new THREE.Group();
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 20), toon(PALETTE.hat));
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.24, 18), toon(PALETTE.hat));
  crown.position.y = 0.13;
  hat.add(brim, crown);
  hat.position.y = 1.8;
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.6, 4, 8), coat);
  armL.position.set(-0.33, 0.95, 0); armL.rotation.z = 0.18;
  const armR = armL.clone(); armR.position.x = 0.33; armR.rotation.z = -0.18;
  fig.add(body, head, face, hat, armL, armR);
  fig.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const headTop = new THREE.Object3D();
  headTop.position.set(0.1, 1.85, 0);
  fig.add(headTop);
  fig.userData.headTop = headTop;
  root.add(fig);

  // crate with a hinged lid (side view / close-up)
  const crate = new THREE.Group();
  crate.name = 'crate';
  crate.position.set(4.6, 0, -1);
  const wood = toon(PALETTE.woodMid, { map: tex.planks({ base: PALETTE.woodMid, count: 4 }) });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.8), wood);
  box.position.y = 0.35;
  box.castShadow = box.receiveShadow = true;
  const inside = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.7), toon('#2a2622'));
  inside.position.y = 0.62;
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.71, -0.4);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.08, 0.84), wood);
  lid.position.set(0, 0.04, 0.42);
  lid.name = 'lid';
  lid.castShadow = true;
  hinge.add(lid);
  const shardB = shardGeometry(true);
  shardB.position.set(-0.22, 0.66, 0.05);
  shardB.rotation.z = Math.PI / 2;
  shardB.name = 'shard_b';
  const env = envelopeModel();
  env.position.set(0.22, 0.64, 0.02);
  env.rotation.y = 0.3;
  env.name = 'envelope';
  crate.add(box, inside, hinge, shardB, env);
  root.add(crate);

  objs.root = root;
  objs.shardA = shardA;
  objs.figure = fig;
  objs.crate = crate;
  objs.hinge = hinge;
  objs.lid = lid;
  objs.shardB = shardB;
  objs.envelope = env;
  objs.pedestal = ped;
  return root;
}

const LETTER = {
  en: ['October 7th, 1796', 'Dear traveller,', 'Two halves make one whole.', 'Bring the purple stone to the stranger.', 'A friend'],
  zh: ['1796年10月7日', '亲爱的旅人：', '两半合在一起，才是完整的。', '把紫色的宝石交给那位陌生人。', '一位朋友'],
};

export default {
  id: 'demo',
  number: 1,
  title: { zh: '核心演示', en: 'Core demo' },
  label: { zh: '演示', en: 'Demo' },
  completeFlag: 'demo_done',

  async setup(ctx) {
    const { views, hotspots, items, ui } = ctx;
    const root = buildStage(ctx);
    ctx.engine.scene.add(root);
    views.registerZone('demo', root);
    ctx.defineAchievements({ demo_done: { zh: '演示完成', en: 'Demo Complete' } });

    // ------------------------------------------------------------------ items
    items.define({ id: 'demo_shard_a', name: { zh: '碎片', en: 'Shard' }, model: () => shardGeometry(false), icon: { rot: [0.3, -0.5, 0.2] } });
    items.define({ id: 'demo_shard_b', name: { zh: '碎片', en: 'Shard' }, model: () => shardGeometry(true), icon: { rot: [0.3, 0.6, -0.2] } });
    items.define({
      id: 'demo_gem', name: { zh: '紫宝石', en: 'Purple gem' }, model: gemModel,
      onInspectClick: async (c, part) => {
        if (part === 'gem_core') { c.audio.sfx('hum'); await c.ui.say('宝石深处有一点微光。', { kind: 'thought', ms: 2200 }); }
        else await c.ui.say('一圈金色的箍。', { kind: 'thought', ms: 1800 });
      },
    });
    items.recipe('demo_shard_a', 'demo_shard_b', async (c) => {
      c.take('demo_shard_a');
      c.take('demo_shard_b');
      await c.give('demo_gem');
    });

    // ------------------------------------------------------------------ views
    views.define({ id: 'demo_main', zone: 'demo', cam: { pos: at(0, 1.75, 6.6), target: at(0.2, 1.0, 0), fov: 42 }, right: 'demo_side', ambience: 'forest',
      onEnter: (c) => c.hintOnce('drag', '点击两侧箭头来左右移动') });
    views.define({ id: 'demo_side', zone: 'demo', cam: { pos: at(3.4, 1.75, 5.2), target: at(4.6, 0.7, -1), fov: 42 }, left: 'demo_main', ambience: 'forest' });
    views.define({ id: 'demo_box', zone: 'demo', closeup: true, cam: { pos: at(4.6, 2.35, 0.55), target: at(4.6, 0.5, -1.0), fov: 40 }, back: 'demo_side', look: 0.015,
      onEnter: (c) => c.hintOnce('back', '点击向下的箭头返回') });
    views.define({ id: 'demo_figure', zone: 'demo', closeup: true, cam: { pos: at(1.5, 1.55, 2.5), target: at(1.5, 1.4, 0), fov: 40 }, back: 'demo_main', look: 0.015 });

    // ------------------------------------------------------------------ hotspots
    hotspots.define({
      id: 'demo_shard_a', views: ['demo_main'], object: objs.shardA, when: (s) => !s.flag('shard_a_taken'),
      onClick: async (c) => {
        c.setFlag('shard_a_taken');
        objs.shardA.visible = false;
        await c.give('demo_shard_a', { from: objs.shardA });
      },
    });
    hotspots.define({ id: 'demo_figure', views: ['demo_main'], object: objs.figure, goto: 'demo_figure', cursor: 'zoom' });
    hotspots.define({
      id: 'demo_figure_talk', views: ['demo_figure'], object: objs.figure, cursor: 'talk',
      onClick: async (c) => {
        if (c.flag('demo_done')) { await c.say('谢谢你，旅人。'); return; }
        c.audio.sfx('rustle');
        await c.thought(objs.figure.userData.headTop, 'demo_gem', { ms: 2600 });
      },
      onItem: {
        demo_gem: async (c) => c.cutscene(async () => {
          c.take('demo_gem');
          c.audio.sfx('stinger');
          const fig = objs.figure;
          await c.animate(900, (k) => { fig.rotation.y = k * Math.PI * 2; fig.position.y = Math.sin(k * Math.PI) * 0.35; });
          c.audio.sfx('holy');
          await c.ui.flash('#fff', 600);
          c.setFlag('demo_done');
          await c.ui.filmFlicker(700);
          await c.say('啊……光芒回来了。', { ms: 2400 });
          c.achieve('demo_done', { anchor: objs.figure.userData.headTop });
          await c.wait(1800);
          await c.ui.ending({ zh: '演示 · 完', en: 'Core demo — complete' });
        }),
      },
    });
    hotspots.define({ id: 'demo_crate', views: ['demo_side'], object: objs.crate, goto: 'demo_box', cursor: 'zoom' });
    hotspots.define({
      id: 'demo_lid', views: ['demo_box'], object: objs.lid, when: (s) => !s.flag('lid_open'), cursor: 'grab',
      onClick: async (c) => c.cutscene(async () => {
        c.audio.sfx('creak');
        await c.tween(objs.hinge.rotation, { x: -1.9 }, 900, c.Ease.outCubic);
        c.audio.sfx('lid');
        c.setFlag('lid_open');
      }),
    });
    hotspots.define({
      id: 'demo_shard_b', views: ['demo_box'], object: objs.shardB, when: (s) => s.flag('lid_open') && !s.flag('shard_b_taken'),
      onClick: async (c) => {
        c.setFlag('shard_b_taken');
        objs.shardB.visible = false;
        await c.give('demo_shard_b', { from: objs.shardB });
      },
    });
    hotspots.define({
      id: 'demo_envelope', views: ['demo_box'], object: objs.envelope, when: (s) => s.flag('lid_open'),
      onClick: async (c) => {
        await c.ui.doc({ pages: [{ lines: LETTER.en, translations: LETTER.zh }] });
        c.setFlag('letter_read');
      },
    });
  },

  async start(ctx, { skipIntro = false } = {}) {
    const { ui, views } = ctx;
    if (!skipIntro && !ctx.flag('intro_done')) {
      await ctx.cutscene(async () => {
        await ui.fade(1, 0);
        await views.go('demo_main', { instant: true });
        ui.logo(['RUSTY'], { ms: 500 });
        await ctx.wait(900);
        await ui.logo(['RUSTY LAKE'], { sub: '出品', ms: 300 });
        await ctx.wait(1200);
        await ui.logo(null, { ms: 600 });
        await ui.fade(0, 900);
        await ui.narrate(['这是核心系统的演示场景。', '找到两块碎片，把它们拼在一起。'], { msPer: 2600 });
        await ui.title(['演示', '核心测试'], 2800);
      });
      ctx.setFlag('intro_done');
    } else {
      ctx.setFlag('intro_done');
    }
    if (!ctx.state.view || !views.get(ctx.state.view)) await views.go('demo_main', { instant: true });
  },

  sync(ctx) {
    const f = (k) => ctx.flag(k);
    objs.shardA.visible = !f('shard_a_taken');
    objs.shardB.visible = !f('shard_b_taken');
    objs.hinge.rotation.x = f('lid_open') ? -1.9 : 0;
    objs.figure.rotation.y = 0;
    objs.figure.position.y = 0;
  },

  walkthrough: [
    { go: 'demo_main' },
    { click: 'demo_shard_a' },
    { expectItem: 'demo_shard_a' },
    { click: 'demo_figure' },
    { click: 'demo_figure_talk' },
    { back: true },
    { arrow: 'right' },
    { expectView: 'demo_side' },
    { click: 'demo_crate' },
    { use: 'demo_shard_a', on: 'demo_lid' },          // wrong item → shake + deselect
    { click: 'demo_lid' },
    { expectFlag: 'lid_open' },
    { click: 'demo_envelope' },
    { expectFlag: 'letter_read' },
    { click: 'demo_shard_b' },
    { combine: ['demo_shard_a', 'demo_shard_b'] },
    { expectItem: 'demo_gem' },
    { expectNoItem: ['demo_shard_a', 'demo_shard_b'] },
    { inspect: 'demo_gem', part: 'gem_core' },
    { back: true },
    { arrow: 'left' },
    { click: 'demo_figure' },
    { use: 'demo_gem', on: 'demo_figure_talk' },
    { expectFlag: 'demo_done' },
    { expectNoItem: 'demo_gem' },
  ],
};
