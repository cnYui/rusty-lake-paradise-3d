// 点击、物品使用和自动通关共用规则；任何进度都先存进 flags，再由 sync 刷新模型。
import * as THREE from 'three';
import { W, sync as refresh, drumPose, bowPose } from './world.js';
import { T } from './text.js';
import {
  RHYTHM, drumHit, drumDone, FACE_START, paintStripe, faceDone, faceClicks, hatches,
  BONES_START, turnBones, bonesRead, bonesClicks, LETTERS_START, turnLetter, lettersOpen, letterClicks,
  HEX_START, turnHex, hexDone, hexClicks, PEOPLE, MASKS, maskFits, allMasked,
} from './rules.js';

const define = (ctx, id, views, object, rest) => ctx.hotspots.define({ id, views, object, cursor: 'pointer', ...rest });

function pickup(ctx, id, views, object, item, flag, when = () => true, after = null) {
  define(ctx, id, views, object, { cursor: 'grab', when: () => when() && !ctx.flag(flag), onClick: async () => {
    if (await ctx.give(item, { from: object })) { ctx.setFlag(flag); refresh(ctx); await after?.(); }
  } });
}

// 人物：每点一次说下一句；只是对话，不进存档
const talkN = {};
const talk = (ctx, key, lines) => { const n = talkN[key] = (talkN[key] || 0) + 1; return ctx.say(lines[(n - 1) % lines.length]); };
const isMasked = (ctx, who) => (ctx.flag('masked') || []).includes(who);
const wrongItem = (ctx) => (c, item) => { ctx.state.select(null); return ctx.say(MASKS.includes(item) ? (ctx.flag('cube_taken') ? T.maskWrong : T.notYet) : T.notThis); };

// ---- 面具：拿到黑方块（“是时候了”）以后才接；给错了不接 ----
function masksFor(ctx, who) {
  const out = {};
  for (const item of MASKS) out[item] = () => giveMask(ctx, who, item);
  return out;
}
function giveMask(ctx, who, item) {
  if (!ctx.flag('cube_taken')) { ctx.state.select(null); return ctx.say(T.notYet); }
  if (!maskFits(who, item)) { ctx.state.select(null); return ctx.say(T.maskWrong); }
  return ctx.cutscene(async () => {
    ctx.take(item);
    await ctx.ui.fade(1, 320);
    const masked = [...(ctx.flag('masked') || []), who];
    ctx.setFlag('masked', masked); refresh(ctx);
    await ctx.ui.fade(0, 320);
    ctx.sfx('fire_light');
    await ctx.say(T.maskOn[who]);
    if (allMasked(masked)) await awaken(ctx);
  });
}
/** 五个都戴上：木头猫头鹰睁眼、门前火炬点着、栅门打开，戴面具的家人走到猫头鹰脚下。 */
async function awaken(ctx) {
  ctx.setFlag('all_masked'); ctx.achieve('p10_its_time');
  await ctx.say(T.allMasked);
  await ctx.go('p10_temple', { teleport: true });   // 最后一副面具可能在木屋里 / 特写里给：不回到记住的漫游位置，直接站到猫头鹰门前
  ctx.sfx('owl');
  await W.owl.lightEyes();
  ctx.sfx('fire_light');
  await Promise.all(W.gateTorches.map((t) => t.ignite()));
  ctx.sfx('gate');
  await W.owl.openGate();
  await ctx.ui.fade(1, 400);
  ctx.setFlag('owl_gate_open'); refresh(ctx);
  await ctx.ui.fade(0, 400);
  await ctx.say(T.owlAwake);
}

function personSpots(ctx, who, views, rest) {
  define(ctx, `p10_${who}`, views, W.rigs[who].parts.body, {
    cursor: 'talk', ...rest,
    onItem: { ...masksFor(ctx, who), ...(rest.onItem || {}) },
    onWrongItem: wrongItem(ctx),
  });
  const alt = W.masked[who];
  if (alt) define(ctx, `p10_${who}_masked`, [...views, 'p10_temple'], alt.parts.body, { cursor: 'talk', onClick: () => ctx.say(T.maskedTalk) });
}

// ---- 塔下：鼓、骨头串、射苹果 ----
async function beat(ctx, side, byNicholas = false) {
  ctx.sfx(side === 'L' ? 'drum_low' : 'drum_high');
  const rig = W.rigs.nicholas;
  if (byNicholas) drumPose(rig, side === 'L' ? 'R' : 'L');   // 鼓面左半边在 Nicholas 的右手下
  await W.drum.beat(side);
  if (byNicholas) drumPose(rig, null);
}

function setupTower(ctx) {
  personSpots(ctx, 'nicholas', ['p10_tower', 'p10_drum'], {
    when: () => !isMasked(ctx, 'nicholas'),
    onClick: () => {
      if (ctx.flag('bone_dropped')) return ctx.say(T.drumAfter);
      return ctx.cutscene(async () => {
        await talk(ctx, 'nicholas', T.nicholas);
        await ctx.wait(300);
        for (const side of RHYTHM) { await beat(ctx, side, true); await ctx.wait(260); }
        ctx.setFlag('drum_step', 0);
        await ctx.say(T.nicholasPlay);
      });
    },
  });
  for (const hit of [W.drum.userData.left, W.drum.userData.right]) {
    const side = hit.userData.side;
    define(ctx, `p10_drum_${side}`, ['p10_drum'], hit, {
      when: () => !ctx.flag('bone_dropped'),
      onClick: async () => {
        const step = ctx.flag('drum_step') || 0, next = drumHit(step, side);
        ctx.setFlag('drum_step', next);
        await beat(ctx, side);
        if (next !== step + 1) return ctx.say(T.drumWrong);
        if (!drumDone(next)) return;
        await ctx.cutscene(async () => {
          ctx.sfx('rustle');
          await W.boneString.drop(W.boneString.userData.ground);
          ctx.setFlag('bone_dropped'); refresh(ctx);
          await ctx.say(T.drumDone);
        });
      },
    });
  }
  define(ctx, 'p10_bone_string', ['p10_drum'], W.boneString.userData.string, { cursor: 'zoom', when: () => !ctx.flag('bone_dropped'), onClick: () => ctx.say(T.boneString) });
  pickup(ctx, 'p10_bone_tip', ['p10_drum', 'p10_tower'], W.boneString.userData.tip, 'bone_tip', 'bone_taken', () => !!ctx.flag('bone_dropped'));

  // 射苹果：苹果顶在 David 头上、骨箭交给 Gerard
  const notArrow = () => { ctx.state.select(null); return ctx.say(T.gerardNotArrow); };
  personSpots(ctx, 'gerard', ['p10_tower', 'p10_tell'], {
    when: () => !isMasked(ctx, 'gerard'),
    onClick: () => talk(ctx, 'gerard', T.gerard),
    onItem: { bone_arrow: () => shoot(ctx), arrow_shaft: notArrow, arrow_fletched: notArrow, arrow_tipped: notArrow, bone_tip: notArrow, feather: notArrow },
  });
  personSpots(ctx, 'david', ['p10_tower', 'p10_tell'], {
    when: () => !isMasked(ctx, 'david'),
    onClick: () => talk(ctx, 'david', ctx.flag('apple_shot') ? [T.davidAfter] : T.david),
    onItem: { apple: () => { ctx.take('apple'); ctx.setFlag('apple_on_head'); refresh(ctx); return ctx.say(T.davidApple); } },
  });
  const wormHit = ctx.hotspots.makeProxy(0.32, 0.32, 0.32, W.pinnedAt.apple.toArray(), W.pinned.parent);
  pickup(ctx, 'p10_worm', ['p10_tell', 'p10_tower'], wormHit, 'worm', 'worm_taken', () => !!ctx.flag('apple_shot'));
}

function shoot(ctx) {
  if (ctx.flag('apple_shot')) return null;
  if (!ctx.flag('apple_on_head')) { ctx.state.select(null); return ctx.say(T.gerardNoApple); }
  return ctx.cutscene(async () => {
    ctx.take('bone_arrow');
    if (ctx.state.view !== 'p10_tell') await ctx.go('p10_tell');
    const ger = W.rigs.gerard;
    bowPose(ger, 'aim');
    await ctx.wait(700);
    const from = W.bow.getWorldPosition(new THREE.Vector3()), hit = W.headApple.getWorldPosition(new THREE.Vector3());
    const { arrow: endArrow, apple: endApple, flyDir } = W.pinnedAt, back = 0.395;
    const tipEnd = endArrow.clone().addScaledVector(flyDir, back);
    W.pinned.visible = true; W.flyApple.visible = false;
    ctx.sfx('bow');
    await ctx.animate(320, (k) => { W.flyArrow.position.lerpVectors(from, hit, k).addScaledVector(flyDir, -back); }, ctx.Ease.linear);
    W.headApple.visible = false; W.flyApple.visible = true;
    await ctx.animate(140, (k) => {
      W.flyArrow.position.lerpVectors(hit, tipEnd, k).addScaledVector(flyDir, -back);
      W.flyApple.position.lerpVectors(hit, endApple, k);
    }, ctx.Ease.linear);
    ctx.setFlag('apple_shot'); ctx.achieve('p10_tell'); refresh(ctx);
    await ctx.wait(400);
    bowPose(ger, 'rest');
    await ctx.say(T.shoot);
    await ctx.say(T.worm);
  });
}

// ---- 空地：母鸡、Ida 的脸 ----
function setupClearing(ctx) {
  const feedHen = () => ctx.cutscene(async () => {
    ctx.take('worm');
    W.hen.setState({ worm: true });
    ctx.sfx('hen');
    await W.hen.peck();
    ctx.setFlag('hen_fed'); refresh(ctx);
    await ctx.say(T.henFed);
  });
  const henWrong = () => { ctx.state.select(null); return ctx.say(T.henNotThis); };
  // 空地上点母鸡推近到母鸡特写；拿着虫子直接在空地上点它也能喂（同一个物体上只能有一个热点，否则后定义的那个把点击抢走）
  define(ctx, 'p10_hen_zoom', ['p10_clearing'], W.hen.userData.hen, { cursor: 'zoom', goto: 'p10_hen', onItem: { worm: feedHen }, onWrongItem: henWrong });
  define(ctx, 'p10_hen', ['p10_hen'], W.hen.userData.hen, {
    cursor: 'talk', when: () => !ctx.flag('hen_fed') || ctx.flag('egg_taken'),
    onClick: () => { ctx.sfx('hen'); return ctx.say(ctx.flag('hen_fed') ? T.henAfter : T.hen); },
    onItem: { worm: feedHen }, onWrongItem: henWrong,
  });
  define(ctx, 'p10_bowl', ['p10_hen'], W.hen.userData.bowl, {
    when: () => !ctx.flag('hen_fed'), onClick: () => ctx.say(T.hen), onItem: { worm: feedHen }, onWrongItem: henWrong,
  });
  pickup(ctx, 'p10_egg', ['p10_hen', 'p10_clearing'], W.hen.userData.egg, 'egg', 'egg_taken', () => !!ctx.flag('hen_fed'));
  ctx.hotspots.define({ id: 'p10_well_look', views: ['p10_hen'], object: W.well.userData.hit, cursor: 'zoom', onClick: () => ctx.say(T.well) });

  // Ida：刷子交给她，脸上出现五道白色竖条；点竖条换颜色，照木屋里的面具画画好
  const startPaint = () => ctx.cutscene(async () => {
    ctx.take('brush'); ctx.setFlag('face', [...FACE_START]); refresh(ctx);
    if (ctx.state.view !== 'p10_ida') await ctx.go('p10_ida');
    await ctx.say(T.idaFace);
  });
  const ida = W.rigs.ida;
  define(ctx, 'p10_ida_zoom', ['p10_clearing'], ida.parts.body, {
    cursor: 'zoom', goto: 'p10_ida',
    onItem: { ...masksFor(ctx, 'ida'), brush: startPaint }, onWrongItem: wrongItem(ctx),
  });
  define(ctx, 'p10_ida', ['p10_ida'], ida.parts.body, {
    cursor: 'talk',
    onClick: () => (ctx.flag('face_done') ? ctx.say(T.idaAfter) : Array.isArray(ctx.flag('face')) ? ctx.say(T.faceHint) : talk(ctx, 'ida', [T.idaNeedBrush, ...T.ida])),
    onItem: { ...masksFor(ctx, 'ida'), brush: startPaint }, onWrongItem: wrongItem(ctx),
  });
  // 戴上面具以后：真身藏起来，换成戴野鸡面具的模型（同 personSpots 里的其他人）
  define(ctx, 'p10_ida_masked', ['p10_clearing', 'p10_ida', 'p10_temple'], W.masked.ida.parts.body, { cursor: 'talk', onClick: () => ctx.say(T.maskedTalk) });
  W.facePaint.userData.stripes.forEach((hit) => define(ctx, `p10_stripe_${hit.userData.stripe}`, ['p10_ida'], hit, {
    when: () => Array.isArray(ctx.flag('face')) && !ctx.flag('face_done'),
    onClick: async () => {
      const next = paintStripe(ctx.flag('face'), hit.userData.stripe);
      if (!next) return;
      ctx.setFlag('face', next); ctx.sfx('color_change'); refresh(ctx);
      if (!faceDone(next)) return;
      await ctx.cutscene(async () => {
        await ctx.wait(300);
        ctx.setFlag('face_done'); ctx.achieve('p10_true_colours'); refresh(ctx);
        ctx.sfx('holy');
        await ctx.say(T.faceDone);
        // 她把掌心里的蜡烛递过来（手掌在脸部特写的画面外，直接给）
        if (!ctx.flag('candle_taken') && await ctx.give('candle', { from: W.idaCandle })) { ctx.setFlag('candle_taken'); refresh(ctx); }
      });
    },
  }));
  // 万一给蜡烛时物品栏出了问题（旗标没立起来），空地上还能从她掌心里拿
  pickup(ctx, 'p10_candle', ['p10_clearing'], W.idaCandle, 'candle', 'candle_taken', () => !!ctx.flag('face_done'));
}

// ---- 木屋：桌上三样东西、两幅画、炉子和平底锅、奶奶 ----
function setupHouse(ctx) {
  pickup(ctx, 'p10_shaft', ['p10_table', 'p10_room'], W.shaft, 'arrow_shaft', 'shaft_taken');
  pickup(ctx, 'p10_brush', ['p10_table', 'p10_room'], W.brush, 'brush', 'brush_taken');
  pickup(ctx, 'p10_apple', ['p10_table', 'p10_room'], W.apple, 'apple', 'apple_taken');
  define(ctx, 'p10_table', ['p10_table'], W.table.getObjectByName('table_top'), { cursor: 'zoom', onClick: () => ctx.say(T.table) });
  define(ctx, 'p10_mask_painting', ['p10_paintings'], W.maskPainting, { cursor: 'zoom', onClick: () => ctx.say(T.maskPainting) });
  define(ctx, 'p10_owl_painting', ['p10_paintings'], W.owlPainting, { cursor: 'zoom', onClick: () => ctx.say(T.owlPainting) });
  const maybeHatch = async () => {
    if (!hatches(ctx.flag('egg_in_pan'), ctx.flag('stove_lit')) || ctx.flag('chick_hatched')) return;
    await ctx.wait(400);
    ctx.sfx('hatch');
    await W.stove.hatch();
    ctx.setFlag('chick_hatched'); refresh(ctx);
    ctx.sfx('chick');
    await ctx.say(T.hatch);
  };
  define(ctx, 'p10_stove_door', ['p10_stove'], W.stove.userData.door, {
    cursor: 'use',
    onClick: () => ctx.say(ctx.flag('stove_lit') ? T.stoveLit : `${T.stove}${T.stoveNeedFire}`),
    onItem: { candle: () => ctx.cutscene(async () => {
      ctx.take('candle'); ctx.sfx('fire_light');
      await W.stove.light();
      ctx.setFlag('stove_lit'); refresh(ctx);
      await ctx.say(T.stoveLit);
      await maybeHatch();
    }) },
  });
  define(ctx, 'p10_pan', ['p10_stove'], W.stove.userData.pan, {
    cursor: 'use', when: () => !ctx.flag('chick_hatched'),
    onClick: () => ctx.say(ctx.flag('egg_in_pan') ? T.stoveNeedFire : T.panEmpty),
    onItem: { egg: () => ctx.cutscene(async () => {
      ctx.take('egg'); ctx.sfx('pot_drop');
      ctx.setFlag('egg_in_pan'); refresh(ctx);
      await ctx.say(T.eggInPan);
      await maybeHatch();
    }) },
  });
  pickup(ctx, 'p10_chick', ['p10_stove'], W.stove.getObjectByName('pan_chick'), 'chick', 'chick_taken', () => !!ctx.flag('chick_hatched'));
  personSpots(ctx, 'margaret', ['p10_room', 'p10_stove'], { when: () => !isMasked(ctx, 'margaret'), onClick: () => talk(ctx, 'margaret', T.margaret) });
}

// ---- 树林路口：仓鸮、羽毛、食丸里的骨头字母 ----
function setupForest(ctx) {
  const st = W.stump.userData;
  define(ctx, 'p10_owl', ['p10_owl', 'p10_forest'], st.owl, {
    cursor: 'talk',
    onClick: () => { ctx.sfx('owl'); return ctx.say(ctx.flag('owl_fed') ? T.owlFull : T.owl); },
    onItem: { chick: () => ctx.cutscene(async () => {
      ctx.take('chick'); ctx.sfx('chick');
      await ctx.wait(300); ctx.sfx('gulp');
      await W.stump.gulp();
      ctx.setFlag('owl_fed'); refresh(ctx);
      await ctx.say(T.owlGulp);
    }) },
    onWrongItem: () => { ctx.state.select(null); return ctx.say(T.owlHungry); },
  });
  pickup(ctx, 'p10_feather', ['p10_owl', 'p10_forest'], st.feather, 'feather', 'feather_taken');
  define(ctx, 'p10_pellet', ['p10_pellet'], st.pellet, { cursor: 'zoom', when: () => !!ctx.flag('owl_fed'), onClick: () => ctx.say(ctx.flag('owls_read') ? T.pelletRead : `${T.pellet}${T.pelletHint}`) });
  st.groups.forEach((hit) => define(ctx, `p10_bones_${hit.userData.group}`, ['p10_pellet'], hit, {
    when: () => !!ctx.flag('owl_fed') && !ctx.flag('owls_read'),
    onClick: async () => {
      const i = hit.userData.group, next = turnBones(ctx.flag('bones_rot') || BONES_START, i);
      if (!next) return;
      ctx.setFlag('bones_rot', next); ctx.sfx('dial_click');
      await W.stump.turn(i, next[i]);
      if (!bonesRead(next)) return;
      ctx.setFlag('owls_read'); ctx.sfx('holy');
      await ctx.say(T.pelletRead);
    },
  }));
}

// ---- 井下：字母门、面具、石鹰和六边形、黑影和 Elizabeth ----
function setupUnder(ctx) {
  const c = W.crypt.userData;
  define(ctx, 'p10_letter_door', ['p10_letters'], c.letterDoor, { cursor: 'zoom', when: () => !ctx.flag('letter_door_open'), onClick: () => ctx.say(T.letters) });
  c.wheels.forEach((hit) => define(ctx, `p10_wheel_${hit.userData.wheel}`, ['p10_letters'], hit, {
    when: () => !ctx.flag('letter_door_open'),
    onClick: async () => {
      const i = hit.userData.wheel, next = turnLetter(ctx.flag('letters') || LETTERS_START, i);
      if (!next) return;
      ctx.setFlag('letters', next); ctx.sfx('dial_click');
      await W.crypt.turnWheel(i, next[i]);
      if (!lettersOpen(next)) return;
      await ctx.cutscene(async () => {
        await ctx.wait(250); ctx.sfx('stone_door');
        await W.crypt.openDoor();
        ctx.setFlag('letter_door_open'); ctx.achieve('p10_owls'); refresh(ctx);
        await ctx.say(T.lettersOpen);
      });
    },
  }));
  for (const [item, m] of Object.entries(W.masks)) {
    define(ctx, `p10_${item}`, ['p10_under', 'p10_masks_l', 'p10_masks_r', 'p10_masks_b'], m, {
      cursor: 'grab', when: () => !!ctx.flag('letter_door_open') && !(ctx.flag('masks_taken') || []).includes(item),
      onClick: async () => {
        if (await ctx.give(item, { from: m })) { ctx.setFlag('masks_taken', [...(ctx.flag('masks_taken') || []), item]); refresh(ctx); }
      },
    });
  }
  define(ctx, 'p10_eagle', ['p10_eagle'], c.eagle, { cursor: 'zoom', onClick: () => ctx.say(ctx.flag('hex_done') ? T.hexDone : T.eagle) });
  c.tiles.forEach((hit) => define(ctx, `p10_hex_${hit.userData.hex}`, ['p10_hex'], hit, {
    when: () => !ctx.flag('hex_done'),
    onClick: async () => {
      const i = hit.userData.hex, next = turnHex(ctx.flag('hex') || HEX_START, i);
      if (!next) return;
      ctx.setFlag('hex', next); ctx.sfx('dial_click');
      await W.crypt.turnHex(i, next[i]);
      if (!hexDone(next)) return;
      await ctx.cutscene(async () => {
        ctx.sfx('holy');
        await W.crypt.solveHex();
        ctx.setFlag('hex_done');
        await ctx.say(T.hexDone);
        await ctx.ui.fade(1, 400);
        refresh(ctx);
        await ctx.go('p10_eagle', { instant: true });
        await ctx.ui.fade(0, 500);
        ctx.sfx('memory_whoosh');
        await ctx.say(T.shadow);
        await ctx.say(T.elizabeth);
        ctx.sfx('cube_float');
        await ctx.say(T.cube);
      });
    },
  }));
  pickup(ctx, 'p10_cube', ['p10_eagle', 'p10_hex', 'p10_under'], c.cube, 'black_cube', 'cube_taken', () => !!ctx.flag('hex_done'), () => ctx.say(T.itsTime));
  define(ctx, 'p10_shadow', ['p10_eagle', 'p10_under'], W.rigs.shadow.parts.body, { cursor: 'talk', when: () => !!ctx.flag('hex_done'), onClick: () => ctx.say(T.shadow) });
  define(ctx, 'p10_elizabeth', ['p10_eagle', 'p10_under'], W.rigs.elizabeth.root, { cursor: 'talk', when: () => !!ctx.flag('hex_done'), onClick: () => ctx.say(T.elizabeth) });
}

// ---- 木头猫头鹰、神殿和结尾 ----
function setupTemple(ctx) {
  define(ctx, 'p10_wood_owl', ['p10_temple'], W.owl.userData.owl, { cursor: 'zoom', onClick: () => ctx.say(T.owlLook) });
  define(ctx, 'p10_owl_gate', ['p10_temple'], W.owl.userData.gate, { cursor: 'zoom', when: () => !ctx.flag('owl_gate_open'), onClick: () => ctx.say(T.owlGate) });
  for (const t of [...Object.values(W.torches), ...W.gateTorches]) {
    define(ctx, `p10_${t.name}_${t.uuid.slice(0, 6)}`, ['p10_tower', 'p10_clearing', 'p10_house', 'p10_temple'], t.getObjectByName('torch_hit'), {
      cursor: 'zoom', onClick: () => ctx.say(t.userData.state.lit > 0.5 ? T.torchLit : T.torch),
    });
  }
  define(ctx, 'p10_font_hint', ['p10_altar'], W.font, { when: () => !ctx.flag('holder_closed'), onClick: () => ctx.say(T.templeHint) });
  define(ctx, 'p10_holder', ['p10_altar'], W.holder, {
    onClick: async () => {
      if (!ctx.flag('holder_cube')) {
        if (!ctx.state.has('black_cube')) return ctx.say(T.needCube);
        await W.holder.open(); ctx.setFlag('holder_open'); refresh(ctx); return;
      }
      if (!ctx.flag('reflection_seen')) return ctx.say(T.holderWait);
      if (!ctx.flag('holder_lowered')) await finale(ctx);
    }, onItem: { black_cube: async () => {
      if (ctx.flag('holder_cube')) return;
      await ctx.cutscene(async () => {
        await W.holder.open(); ctx.setFlag('holder_open'); ctx.take('black_cube');
        await W.holder.insertCube(); ctx.setFlag('holder_cube');
        await W.holder.close(); ctx.setFlag('holder_closed'); refresh(ctx);
      });
    } },
  });
  define(ctx, 'p10_font', ['p10_altar'], W.font, {
    when: () => !!ctx.flag('holder_closed') && !ctx.flag('holder_lowered'), onClick: async () => {
      await W.font.showReflection(); ctx.setFlag('reflection_seen'); ctx.say(T.reflection); refresh(ctx);
    },
  });
}

/** 黑方块降进圣水盆：光柱、四周起火 → 红色幻象 → 全剧终。 */
function finale(ctx) {
  return ctx.cutscene(async () => {
    await W.holder.lower(0.8); ctx.setFlag('holder_lowered');
    await W.font.ignite(); ctx.setFlag('font_lit'); refresh(ctx);
    ctx.sfx('fire_crackle');
    await ctx.say(T.fire);
    await ctx.wait(600);
    await ctx.ui.fade(1, 700);
    await ctx.go('p10_vision', { instant: true });
    await ctx.ui.fade(0, 900);
    ctx.sfx('memory_whoosh');
    await W.vision.play(() => ctx.sfx('whoosh'));
    ctx.setFlag('vision_seen');
    ctx.sfx('owl');
    await ctx.say(T.vision);
    ctx.setFlag('plague10_complete'); refresh(ctx);
    await ctx.ui.ending(T.ending);
  });
}

export function setup(ctx) {
  setupTower(ctx); setupClearing(ctx); setupHouse(ctx); setupForest(ctx); setupUnder(ctx); setupTemple(ctx);
}

// ---- 自动通关 ----
const clicks = (prefix, counts) => counts.flatMap((n, i) => Array.from({ length: n }, () => ({ click: `${prefix}${i}` })));
const toRoom = [{ go: 'p10_house' }, { click: 'p10_house_entry' }];

export const walkthrough = [
  { click: 'p10_overview_island' },
  // 树林路口：仓鸮、羽毛
  { go: 'p10_forest' }, { click: 'p10_owl_zoom' }, { click: 'p10_owl' }, { click: 'p10_feather' }, { expectItem: 'feather' }, { back: true },
  // 木屋：桌上的箭杆、刷子、苹果；两幅画；炉子和奶奶
  ...toRoom, { click: 'p10_table_zoom' }, { click: 'p10_table' }, { click: 'p10_shaft' }, { click: 'p10_brush' }, { click: 'p10_apple' }, { back: true },
  { click: 'p10_paintings_zoom' }, { click: 'p10_mask_painting' }, { click: 'p10_owl_painting' }, { back: true },
  { click: 'p10_stove_zoom' }, { click: 'p10_stove_door' }, { click: 'p10_pan' }, { click: 'p10_margaret' }, { back: true }, { click: 'p10_room_exit' },
  { combine: ['arrow_shaft', 'feather'] }, { expectItem: 'arrow_fletched' },
  // 塔下：看 Nicholas 敲一遍，照着敲（先敲错一下）→ 尖骨头
  { go: 'p10_tower' }, { click: 'p10_gerard' }, { click: 'p10_david' }, { click: 'p10_drum_zoom' }, { click: 'p10_bone_string' }, { click: 'p10_nicholas' },
  { click: `p10_drum_${RHYTHM[0] === 'L' ? 'R' : 'L'}` }, ...RHYTHM.map((s) => ({ click: `p10_drum_${s}` })), { expectFlag: 'bone_dropped' },
  { click: 'p10_bone_tip' }, { expectItem: 'bone_tip' }, { back: true },
  { combine: ['arrow_fletched', 'bone_tip'] }, { expectItem: 'bone_arrow' },
  // 射苹果（没顶苹果他不射）→ 虫子
  { click: 'p10_tell_zoom' }, { use: 'bone_arrow', on: 'p10_gerard' }, { use: 'apple', on: 'p10_david' }, { use: 'bone_arrow', on: 'p10_gerard' },
  { expectFlag: 'apple_shot' }, { click: 'p10_worm' }, { expectItem: 'worm' }, { back: true },
  // 空地：母鸡下蛋；给 Ida 画脸 → 蜡烛
  { go: 'p10_clearing' }, { click: 'p10_hen_zoom' }, { click: 'p10_hen' }, { use: 'worm', on: 'p10_hen' }, { click: 'p10_egg' }, { expectItem: 'egg' }, { back: true },
  { click: 'p10_ida_zoom' }, { click: 'p10_ida' }, { use: 'brush', on: 'p10_ida' }, ...clicks('p10_stripe_', faceClicks(FACE_START)), { expectFlag: 'face_done' },
  { expectItem: 'candle' }, { back: true },
  // 木屋：蛋放进平底锅、蜡烛点着炉子 → 小鸡
  ...toRoom, { click: 'p10_stove_zoom' }, { use: 'egg', on: 'p10_pan' }, { use: 'candle', on: 'p10_stove_door' }, { expectFlag: 'chick_hatched' },
  { click: 'p10_chick' }, { expectItem: 'chick' }, { back: true }, { click: 'p10_room_exit' },
  // 树林路口：小鸡喂仓鸮 → 食丸里的骨头摆成 OWLS
  { go: 'p10_forest' }, { click: 'p10_owl_zoom' }, { use: 'chick', on: 'p10_owl' }, { expectFlag: 'owl_fed' },
  { click: 'p10_pellet_zoom' }, { click: 'p10_pellet' }, ...clicks('p10_bones_', bonesClicks(BONES_START)), { expectFlag: 'owls_read' }, { back: true }, { back: true },
  // 井下：字母门 → 五个面具 → 六边形 → 黑影和 Elizabeth → 黑方块
  { go: 'p10_clearing' }, { click: 'p10_well' }, { click: 'p10_letters_zoom' }, { click: 'p10_letter_door' },
  ...clicks('p10_wheel_', letterClicks(LETTERS_START)), { expectFlag: 'letter_door_open' }, { back: true },
  { go: 'p10_masks_l' }, { click: 'p10_mask_rabbit' }, { click: 'p10_mask_pheasant' }, { back: true },
  { go: 'p10_masks_b' }, { click: 'p10_mask_deer' }, { back: true },
  { go: 'p10_masks_r' }, { click: 'p10_mask_pigeon' }, { click: 'p10_mask_boar' }, { back: true },
  { click: 'p10_eagle_zoom' }, { click: 'p10_eagle' }, { click: 'p10_hex_zoom' }, ...clicks('p10_hex_', hexClicks(HEX_START)), { expectFlag: 'hex_done' },
  { expectView: 'p10_eagle' }, { click: 'p10_elizabeth' }, { click: 'p10_cube' }, { expectItem: 'black_cube' }, { back: true }, { click: 'p10_ladder' },
  // 是时候了：五个面具交给对的人（先给错一次）
  { use: 'mask_boar', on: 'p10_ida_zoom' }, { use: 'mask_pheasant', on: 'p10_ida_zoom' },
  { go: 'p10_tower' }, { use: 'mask_boar', on: 'p10_gerard' }, { use: 'mask_rabbit', on: 'p10_david' }, { use: 'mask_deer', on: 'p10_nicholas' },
  ...toRoom, { use: 'mask_pigeon', on: 'p10_margaret' }, { expectFlag: 'owl_gate_open' }, { expectView: 'p10_temple' },
  // 木头猫头鹰肚子里的神殿：吊架 / 倒影 / 降下 → 起火 → 红色幻象
  { click: 'p10_wood_owl' }, { click: 'p10_temple_entry' }, { click: 'p10_altar_entry' },
  { click: 'p10_holder' }, { use: 'black_cube', on: 'p10_holder' }, { click: 'p10_font' }, { click: 'p10_holder' },
  { expectFlag: 'plague10_complete' },
];

export { PEOPLE };
