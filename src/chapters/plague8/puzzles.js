// 点击、物品使用和自动通关共用规则；任何进度都先存进 flags，再由 sync 刷新模型。
import * as THREE from 'three';
import { makeProp } from '../../art/props.js';
import { W, sync as refresh, MANTIS, mantisPos, grandmaHorn } from './world.js';
import { T } from './text.js';
import { BOX_START, moveSlider, boxSolved, boxAnswer, SCORE, chorusPress, chorusDone, treeOfLevel } from './rules.js';

const define = (ctx, id, views, object, rest) => ctx.hotspots.define({ id, views, object, cursor: 'pointer', ...rest });
const ROAM = ['p8_gate', 'p8_forest', 'p8_grove', 'p8_house', 'p8_shed', 'p8_lake', 'p8_temple'];

function pickup(ctx, id, views, object, item, flag, when = () => true, after = null) {
  define(ctx, id, views, object, { cursor: 'grab', when: () => when() && !ctx.flag(flag), onClick: async () => {
    if (await ctx.give(item, { from: object })) { ctx.setFlag(flag); after?.(); refresh(ctx); }
  } });
}

const heldSlider = (ctx) => (Number.isInteger(ctx.flag('box_held')) ? ctx.flag('box_held') : null);

// 老奶奶的思考气泡：画一只号角
const hornBubble = (g, w, h) => {
  g.strokeStyle = '#fff'; g.lineWidth = Math.max(2, w * 0.05); g.fillStyle = '#e1d6bc';
  g.beginPath(); g.moveTo(w * 0.22, h * 0.62); g.quadraticCurveTo(w * 0.42, h * 0.3, w * 0.66, h * 0.34);
  g.lineTo(w * 0.8, h * 0.18); g.lineTo(w * 0.82, h * 0.56); g.lineTo(w * 0.68, h * 0.46);
  g.quadraticCurveTo(w * 0.48, h * 0.48, w * 0.3, h * 0.7); g.closePath(); g.fill(); g.stroke();
};

// 一只发光的小东西（蛾子 / 萤火虫）从镜头前飞到 target（世界坐标）
async function flyLight(ctx, model, target) {
  const o = makeProp(model); o.scale.setScalar(2.2);
  const camera = ctx.engine.camera; camera.updateMatrixWorld();
  const from = new THREE.Vector3(0.1, -0.25, -0.9).applyMatrix4(camera.matrixWorld);
  ctx.world.zones.exterior.add(o); o.position.copy(from);
  await ctx.animate(900, (k) => { o.position.lerpVectors(from, target, k); o.position.y += Math.sin(k * Math.PI) * 0.3; }, ctx.Ease.inOutSine);
  return o;
}

// 螳螂从雾里走到出手的位置，朝 target 一记捕捉足；leave 再退回雾里
async function mantisStrike(ctx, plan, target) {
  const m = W.mantis;
  m.visible = true; m.walking = false;
  m.position.fromArray(mantisPos(plan.from, plan.water)); m.face(target.x, target.z);
  ctx.sfx('mantis');
  await m.walkTo(mantisPos(plan.strike, plan.water));
  m.face(target.x, target.z);
  await ctx.wait(200);
  ctx.sfx('whoosh');
  await m.strike();
}
const mantisLeave = (plan) => W.mantis.walkTo(mantisPos(plan.from, plan.water));

function setupGate(ctx) {
  // 三个乐手：每点一次唱下一句谜歌
  W.musicianRigs.forEach((rig, i) => define(ctx, `p8_musician_${i}`, ['p8_gate'], rig.parts.body, {
    cursor: 'talk',
    onClick: () => {
      const n = (Number(ctx.flag('song_line')) || 0) % T.song.length;
      ctx.setFlag('song_line', n + 1); ctx.sfx('mandolin');
      return ctx.say(T.song[n]);
    },
  }));
  define(ctx, 'p8_score', ['p8_score'], W.score, { cursor: 'zoom', onClick: () => ctx.say(T.score) });
  define(ctx, 'p8_boards', ['p8_gate'], W.boards, {
    cursor: 'use', when: () => !ctx.flag('gate_open'),
    onClick: () => ctx.say(ctx.state.has('axe') ? T.gateBoarded : T.gateNeedAxe),
    onItem: { axe: () => ctx.cutscene(async () => {
      ctx.take('axe'); ctx.sfx('chop');
      await W.boards.chop(); ctx.sfx('gate');
      await W.gate.openDoors(); ctx.setFlag('gate_open'); refresh(ctx);
      await ctx.say(T.gateOpen);
    }) },
  });
  // 木盒：点滑块拿起（再点一次放下），点一列把它挪过去；三个滑块都对上乐手就开盒
  W.box.userData.sliders.forEach((s) => define(ctx, `p8_slider_${s.userData.slider}`, ['p8_box'], s, {
    when: () => !ctx.flag('box_open'),
    onClick: () => { const i = s.userData.slider; ctx.setFlag('box_held', heldSlider(ctx) === i ? null : i); ctx.sfx('click'); refresh(ctx); },
  }));
  W.box.userData.columns.forEach((c) => define(ctx, `p8_col_${c.userData.col}`, ['p8_box'], c, {
    when: () => !ctx.flag('box_open'),
    onClick: async () => {
      const h = heldSlider(ctx);
      if (h === null) return ctx.say(T.box);
      const next = moveSlider(ctx.flag('box_slots') || BOX_START, h, c.userData.col);
      ctx.setFlag('box_held', null);
      if (next) { ctx.setFlag('box_slots', next); ctx.sfx('dial_click'); }
      refresh(ctx);
      if (next && boxSolved(next)) await ctx.cutscene(async () => {
        await ctx.wait(250); ctx.sfx('chest_open'); await W.box.open();
        ctx.setFlag('box_open'); refresh(ctx); ctx.achieve('p8_three_men');
        await ctx.say(T.boxOpen);
      });
    },
  }));
  pickup(ctx, 'p8_axe', ['p8_box'], W.box.userData.axe, 'axe', 'axe_taken', () => !!ctx.flag('box_open'));
}

// 蝗虫合唱完：蝗虫和蚱蜢飞走，卵鞘裂开，巨型螳螂从合唱树后面的雾里站起来
function hatch(ctx) {
  return ctx.cutscene(async () => {
    await ctx.wait(300);
    W.chorus.userData.locusts.forEach((_, i) => W.chorus.chirp(i));
    for (const n of [1, 3, 5]) ctx.sfx(`locust_${n}`);
    await ctx.say(T.chorusDone);
    ctx.sfx('whoosh'); W.grasshopper.flyAway();
    await W.chorus.flyAll();
    ctx.achieve('p8_chorus');
    ctx.sfx('hatch'); await W.egg.hatch();
    const m = W.mantis, base = mantisPos(MANTIS.hatch);
    m.visible = true; m.rotation.y = 0; m.position.set(base[0], base[1] - 5.6, base[2]);
    ctx.sfx('mantis');
    await ctx.animate(2000, (k) => { m.position.y = base[1] - 5.6 * (1 - k); }, ctx.Ease.outCubic);
    ctx.setFlag('mantis_awake'); refresh(ctx);
    await ctx.say(T.eggHatch);
  });
}

function setupForest(ctx) {
  W.chorus.userData.locusts.forEach((h, i) => define(ctx, `p8_locust_${i}`, ['p8_locusts'], h, {
    when: () => !ctx.flag('mantis_awake'),
    onClick: async () => {
      const level = h.userData.level, before = Number(ctx.flag('chorus_step')) || 0, step = chorusPress(before, level);
      ctx.sfx(`locust_${level}`); W.chorus.chirp(i);
      ctx.setFlag('chorus_step', step);
      if (chorusDone(step)) return hatch(ctx);
      if (before > 0 && level !== SCORE[before]) await ctx.say(T.chorusWrong);
    },
  }));
  define(ctx, 'p8_grasshopper', ['p8_forest'], W.grasshopper, { cursor: 'talk', when: () => !ctx.flag('mantis_awake'), onClick: () => ctx.say(T.grasshopper) });
  define(ctx, 'p8_egg', ['p8_forest', 'p8_locusts'], W.egg, { cursor: 'zoom', when: () => !ctx.flag('mantis_awake'), onClick: () => ctx.say(T.egg) });
  define(ctx, 'p8_shadow', ['p8_forest'], W.shadowRig.parts.body, { cursor: 'talk', onClick: () => ctx.say(T.shadow) });
  define(ctx, 'p8_mantis', ROAM, W.mantis, {
    cursor: 'talk', when: () => !!ctx.flag('mantis_awake') && !ctx.flag('horn_given'),
    onClick: () => { ctx.sfx('mantis'); return ctx.say(T.mantis); },
  });
  // 猫头鹰：萤火虫的光把螳螂引过来，树枝断了，窝掉在地上，钥匙在窝里
  const owl = W.owlTree.userData.owl;
  define(ctx, 'p8_owl', ['p8_owl'], owl, {
    cursor: 'use', when: () => !ctx.flag('owl_taken'),
    onClick: () => { ctx.sfx('owl'); return ctx.say(T.owl); },
    onItem: { firefly: () => ctx.cutscene(async () => {
      ctx.take('firefly');
      const target = owl.localToWorld(new THREE.Vector3(0.18, 0.32, 0.25));
      const light = await flyLight(ctx, 'p8_firefly', target);
      ctx.sfx('owl'); await ctx.say(T.owlMantis);
      await mantisStrike(ctx, MANTIS.owl, target);
      owl.visible = false; light.removeFromParent();
      ctx.sfx('chop'); await W.owlTree.breakBranch();
      await mantisLeave(MANTIS.owl);
      ctx.setFlag('owl_taken'); refresh(ctx);
      await ctx.say(T.owlGone);
    }) },
  });
  pickup(ctx, 'p8_key', ['p8_owl'], W.owlTree.userData.key, 'key', 'key_taken', () => !!ctx.flag('owl_taken'), () => ctx.achieve('p8_owls'));
}

// 刻着眼睛的树：拿到“看得清的眼睛”以后点它，雾短暂散开、露出藏着的东西
function eyeTree(ctx, id, view, tree, flag, text) {
  define(ctx, id, [view], tree, {
    cursor: 'zoom',
    onClick: () => {
      if (!ctx.flag('sight_on')) return ctx.say(T.eyeTree);
      if (ctx.flag(flag)) return ctx.say(T.eyeTreeDone);
      return ctx.cutscene(async () => {
        ctx.sfx('holy');
        await ctx.animate(900, (k) => { W.fog.sight = k; tree.setGlow(k); }, ctx.Ease.inOutSine);
        ctx.setFlag(flag); refresh(ctx);
        await ctx.say(text);
        await ctx.animate(1200, (k) => { W.fog.sight = 1 - k; tree.setGlow(1 - k); }, ctx.Ease.inOutSine);
      });
    },
  });
}

function setupHouse(ctx) {
  define(ctx, 'p8_moths', ['p8_lantern'], W.lantern.userData.swarm, {
    cursor: 'grab', when: () => !ctx.flag('moth_taken'),
    onClick: async () => { if (await ctx.give('glow_moth', { from: W.lantern.userData.swarm })) { ctx.setFlag('moth_taken'); refresh(ctx); ctx.say(T.mothTaken); } },
  });
  pickup(ctx, 'p8_firefly', ['p8_lantern'], W.lantern.userData.firefly, 'firefly', 'firefly_taken', () => !!ctx.flag('firefly_revealed'));
  eyeTree(ctx, 'p8_eye_tree_1', 'p8_house', W.eyeTree1, 'firefly_revealed', T.fireflySeen);
  define(ctx, 'p8_wall', ['p8_room'], W.wall, { cursor: 'zoom', onClick: () => ctx.say(T.wallText) });
  pickup(ctx, 'p8_shovel', ['p8_room'], W.shovel, 'shovel', 'shovel_taken');
  define(ctx, 'p8_seer', ['p8_seer'], W.seerRig.parts.body, {
    cursor: 'talk', onClick: () => ctx.say(ctx.flag('sight_on') ? T.seerAfter : T.seer),
    onItem: { goat_eyes: () => ctx.cutscene(async () => {
      if (ctx.flag('sight_on')) return;
      ctx.take('goat_eyes'); ctx.sfx('holy'); await ctx.ui.flash('#fff6d8', 400);
      ctx.setFlag('sight_on'); refresh(ctx);
      await ctx.say(T.seerSight);
    }) },
  });
}

function setupGrove(ctx) {
  // 山羊：发光的蛾子落在它背上，螳螂循着光过来把它叼走，只剩骨头和两颗眼睛
  define(ctx, 'p8_goat', ['p8_goat'], W.goat, {
    cursor: 'talk', when: () => !ctx.flag('goat_taken'),
    onClick: () => { ctx.sfx('goat'); return ctx.say(T.goat); },
    onItem: { glow_moth: () => ctx.cutscene(async () => {
      if (!ctx.flag('mantis_awake')) { ctx.state.select(null); return ctx.say(T.goatNoMantis); }
      ctx.take('glow_moth');
      const target = W.goat.localToWorld(new THREE.Vector3(0, 0.85, 0));
      const light = await flyLight(ctx, 'p8_moth', target);
      await ctx.say(T.goatMantis);
      await mantisStrike(ctx, MANTIS.goat, target);
      ctx.sfx('goat'); await ctx.ui.flash('#ffffff', 300);
      W.goat.visible = false; light.removeFromParent(); W.bones.visible = true; W.bones.setState({ eyes: true });
      await mantisLeave(MANTIS.goat);
      ctx.setFlag('goat_taken'); refresh(ctx);
      await ctx.say(T.bones);
    }) },
  });
  pickup(ctx, 'p8_eyes', ['p8_goat'], W.bones.userData.eyes, 'goat_eyes', 'eyes_taken', () => !!ctx.flag('goat_taken'));
  eyeTree(ctx, 'p8_eye_tree_2', 'p8_grove', W.eyeTree2, 'dig_revealed', T.digSeen);
  define(ctx, 'p8_dig_circle', ['p8_dig'], W.dig.userData.circle, {
    cursor: 'use', when: () => !!ctx.flag('dig_revealed') && !ctx.flag('chest_dug'),
    onClick: () => ctx.say(ctx.state.has('shovel') ? T.digSpot : T.digNeedShovel),
    onItem: { shovel: () => ctx.cutscene(async () => {
      ctx.take('shovel');
      for (let i = 0; i < 3; i++) { ctx.sfx('squish'); await ctx.wait(300); }
      ctx.setFlag('chest_dug'); refresh(ctx);
      await ctx.say(T.chestLocked);
    }) },
  });
  const chest = W.dig.userData.chest;
  define(ctx, 'p8_chest', ['p8_dig'], chest, {
    cursor: 'use', when: () => !!ctx.flag('chest_dug') && !ctx.flag('chest_open'),
    onClick: () => ctx.say(T.chestLocked),
    onItem: { key: () => ctx.cutscene(async () => {
      ctx.take('key'); ctx.sfx('unlock'); await ctx.wait(250);
      ctx.sfx('chest_open'); await chest.open();
      ctx.setFlag('chest_open'); refresh(ctx);
      await ctx.say(T.chestOpen);
    }) },
  });
  pickup(ctx, 'p8_horn', ['p8_dig'], W.dig.userData.horn, 'fog_horn', 'horn_taken', () => !!ctx.flag('chest_open'));
}

function setupLake(ctx) {
  // 小船上的老奶奶：吹响号角，螳螂把她提走，船上留下黑方块；点黑方块进回忆
  const head = W.grandmaRig.parts.head;
  define(ctx, 'p8_grandma', ['p8_boat'], W.grandmaRig.parts.body, {
    cursor: 'talk', when: () => !ctx.flag('horn_given'),
    onClick: async () => { await ctx.ui.thought(head, null, { draw: hornBubble }); ctx.say(T.boat); },
    onItem: { fog_horn: () => ctx.cutscene(async () => {
      ctx.take('fog_horn');
      grandmaHorn(true);
      await ctx.say(T.boatHorn);
      ctx.sfx('fog_horn'); await ctx.wait(2400);
      const target = W.boat.localToWorld(new THREE.Vector3(0, 0.8, -0.62));
      await mantisStrike(ctx, MANTIS.boat, target);
      await ctx.say(T.boatMantis);
      ctx.sfx('mantis');
      await ctx.animate(1600, (k) => { W.grandma.position.y = -0.53 + k * k * 5; }, ctx.Ease.inCubic);
      W.grandma.visible = false;
      await mantisLeave(MANTIS.boat);
      ctx.setFlag('horn_given'); refresh(ctx);
      ctx.sfx('cube_float');
    }) },
  });
  define(ctx, 'p8_boat_cube', ['p8_boat'], W.boatCube, {
    cursor: 'zoom', when: () => !!ctx.flag('horn_given') && !ctx.flag('cube_taken'),
    onClick: () => ctx.cutscene(async () => {
      ctx.sfx('memory_whoosh'); ctx.setFlag('memory_seen');
      await ctx.go('p8_memory');
      await ctx.say(T.memoryTalk);
    }),
  });
  pickup(ctx, 'p8_memory_cube', ['p8_memory'], W.memCube, 'black_cube', 'cube_taken', () => true, () => ctx.say(T.memoryCube));
}

function setupTemple(ctx) {
  define(ctx, 'p8_font_hint', ['p8_altar'], W.font, { when: () => !ctx.flag('holder_closed'), onClick: () => ctx.say(T.templeHint) });
  define(ctx, 'p8_holder', ['p8_altar'], W.holder, {
    onClick: async () => {
      if (!ctx.flag('holder_cube')) {
        if (!ctx.state.has('black_cube')) return ctx.say(T.needCube);
        await W.holder.open(); ctx.setFlag('holder_open'); refresh(ctx); return;
      }
      if (!ctx.flag('reflection_seen')) return ctx.say(T.holderWait);
      if (!ctx.flag('holder_lowered')) await ctx.cutscene(async () => {
        await W.holder.lower(0.8); ctx.setFlag('holder_lowered');
        await W.font.ignite(); ctx.setFlag('font_lit'); refresh(ctx);
      });
    }, onItem: { black_cube: async () => {
      if (ctx.flag('holder_cube')) return;
      await ctx.cutscene(async () => {
        await W.holder.open(); ctx.setFlag('holder_open'); ctx.take('black_cube');
        await W.holder.insertCube(); ctx.setFlag('holder_cube');
        await W.holder.close(); ctx.setFlag('holder_closed'); refresh(ctx);
      });
    } },
  });
  define(ctx, 'p8_font', ['p8_altar'], W.font, {
    when: () => !!ctx.flag('holder_closed') && !ctx.flag('holder_lowered'), onClick: async () => {
      await W.font.showReflection(); ctx.setFlag('reflection_seen'); ctx.say(T.reflection); refresh(ctx);
    },
  });
  define(ctx, 'p8_painting', ['p8_painting'], W.painting, {
    when: () => !!ctx.flag('font_lit') && !ctx.flag('plague8_complete'), onClick: () => ctx.cutscene(async () => {
      if (!ctx.flag('painting_lit')) { await W.painting.glowCube(); ctx.setFlag('painting_lit'); }
      else if (!ctx.flag('plague_cleared')) { await W.painting.clearPlague(); ctx.setFlag('plague_cleared'); }
      else { await W.painting.frameNext(); ctx.setFlag('next_framed'); ctx.setFlag('plague8_complete'); }
      refresh(ctx);
      if (ctx.flag('plague8_complete')) await ctx.ui.ending(T.ending);
    }),
  });
}

export function setup(ctx) {
  setupGate(ctx); setupForest(ctx); setupHouse(ctx); setupGrove(ctx); setupLake(ctx); setupTemple(ctx);
}

// 自动通关：木盒按属性算出每个滑块该去的列；合唱按乐谱找对应高度的蝗虫
function boxClicks() {
  const out = [];
  let slots = [...BOX_START];
  boxAnswer().forEach((col, i) => {
    if (slots[i] === col) return;
    out.push({ click: `p8_slider_${i}` }, { click: `p8_col_${col}` });
    slots = moveSlider(slots, i, col);
  });
  return out;
}
const chorusClicks = () => SCORE.map((level) => ({ click: `p8_locust_${treeOfLevel(level)}` }));

export const walkthrough = [
  { click: 'p8_overview_island' }, { click: 'p8_musician_0' }, { click: 'p8_musician_1' }, { click: 'p8_musician_2' },
  { click: 'p8_score_zoom' }, { click: 'p8_score' }, { back: true }, { click: 'p8_boards' },
  { click: 'p8_box_zoom' }, ...boxClicks(), { expectFlag: 'box_open' }, { click: 'p8_axe' }, { back: true },
  { use: 'axe', on: 'p8_boards' }, { expectFlag: 'gate_open' },
  { go: 'p8_forest' }, { click: 'p8_shadow' }, { click: 'p8_grasshopper' }, { click: 'p8_egg' },
  { click: 'p8_locusts_zoom' }, ...chorusClicks(), { expectFlag: 'mantis_awake' }, { back: true }, { click: 'p8_mantis' },
  { go: 'p8_house' }, { click: 'p8_eye_tree_1' }, { click: 'p8_lantern_zoom' }, { click: 'p8_moths' }, { back: true },
  { click: 'p8_house_entry' }, { click: 'p8_wall' }, { click: 'p8_shovel' }, { click: 'p8_seer_zoom' }, { click: 'p8_seer' }, { back: true }, { click: 'p8_room_exit' },
  { go: 'p8_grove' }, { click: 'p8_goat_zoom' }, { click: 'p8_goat' }, { use: 'glow_moth', on: 'p8_goat' }, { expectFlag: 'goat_taken' }, { click: 'p8_eyes' }, { back: true },
  { go: 'p8_house' }, { click: 'p8_house_entry' }, { click: 'p8_seer_zoom' }, { use: 'goat_eyes', on: 'p8_seer' }, { expectFlag: 'sight_on' }, { back: true }, { click: 'p8_room_exit' },
  { click: 'p8_eye_tree_1' }, { expectFlag: 'firefly_revealed' }, { click: 'p8_lantern_zoom' }, { click: 'p8_firefly' }, { back: true },
  { go: 'p8_forest' }, { click: 'p8_owl_zoom' }, { click: 'p8_owl' }, { use: 'firefly', on: 'p8_owl' }, { expectFlag: 'owl_taken' }, { click: 'p8_key' }, { back: true },
  { go: 'p8_grove' }, { click: 'p8_eye_tree_2' }, { expectFlag: 'dig_revealed' }, { click: 'p8_dig_zoom' },
  { use: 'shovel', on: 'p8_dig_circle' }, { use: 'key', on: 'p8_chest' }, { click: 'p8_horn' }, { back: true },
  { go: 'p8_lake' }, { click: 'p8_boat_zoom' }, { click: 'p8_grandma' }, { use: 'fog_horn', on: 'p8_grandma' }, { expectFlag: 'horn_given' },
  { click: 'p8_boat_cube' }, { click: 'p8_memory_cube' }, { expectItem: 'black_cube' }, { back: true }, { back: true },
  { go: 'p8_temple' }, { click: 'p8_temple_entry' }, { click: 'p8_altar_entry' },
  { click: 'p8_holder' }, { use: 'black_cube', on: 'p8_holder' }, { click: 'p8_font' }, { click: 'p8_holder' },
  { click: 'p8_painting_entry' }, { click: 'p8_painting' }, { click: 'p8_painting' }, { click: 'p8_painting' },
  { expectFlag: 'plague8_complete' },
];
