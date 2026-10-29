// 点击、物品使用和自动通关共用规则；任何进度都先存进 flags，再由 sync 刷新模型。
import { makeProp } from '../../art/props.js';
import { W, sync as refresh, pointStaff } from './world.js';
import { T } from './text.js';
import {
  BOILS, BOIL_SOLUTION, popBoil, boilsSolved,
  CURE, HUMORS, HUMOR_DIR, HUMOR_NAMES, pourLayer, GRANDMA_GIVES,
  TOOTH_UPPER, TOOTH_LOWER_START, swapTeeth, teethSolved,
  CLOCK_START, CLOCK_ANSWER, advanceHand, clockSolved,
  TRUNK_START, TRUNK_ANSWER, TRUNK_LETTERS, turnDial, trunkSolved,
} from './rules.js';

const define = (ctx, id, views, object, rest) => ctx.hotspots.define({ id, views, object, cursor: 'pointer', ...rest });

function pickup(ctx, id, views, object, item, flag, when = () => true, after = null) {
  define(ctx, id, views, object, { cursor: 'grab', when: () => when() && !ctx.flag(flag), onClick: async () => {
    if (await ctx.give(item, { from: object })) { ctx.setFlag(flag); after?.(); refresh(ctx); }
  } });
}

// 四瓶体液都拿到过就发成就（血液来自医生还回来，或者开门前接的那一瓶都算）
function checkHumors(ctx) {
  if (ctx.flag('blood_returned') && ctx.flag('tears_made') && ctx.flag('snot_made') && ctx.flag('saliva_made')) ctx.achieve('p6_four_humors');
}

function setupGate(ctx) {
  pickup(ctx, 'p6_bottle', ['p6_gate'], W.bottle, 'empty_bottle', 'gate_bottle_taken');
  define(ctx, 'p6_skull', ['p6_gate'], W.skull, {
    cursor: 'use', onClick: () => ctx.say(ctx.flag('skull_bled') ? T.skullBled : T.skull),
    onItem: { empty_bottle: () => {
      ctx.replace('empty_bottle', 'blood'); ctx.setFlag('skull_bled'); ctx.sfx('pour'); refresh(ctx); ctx.say(T.skullBled);
    } },
  });
  define(ctx, 'p6_gate_knock', ['p6_gate'], W.gate, {
    when: () => !ctx.flag('hand_out') && !ctx.flag('gate_open'),
    onClick: () => ctx.cutscene(async () => {
      await W.gate.openHatch('up'); await W.gate.openHatch('low'); await W.gate.extendHand();
      ctx.setFlag('hand_out'); refresh(ctx); await ctx.say(T.doctorWantsBlood);
    }),
  });
  define(ctx, 'p6_gate_hand', ['p6_gate'], W.gate, {
    cursor: 'use', when: () => !!ctx.flag('hand_out') && !ctx.flag('gate_open'),
    onClick: () => ctx.say(T.doctorWantsBlood),
    onItem: { blood: () => ctx.cutscene(async () => {
      ctx.take('blood');
      await W.gate.handTake(makeProp('p6_blood'));
      await W.gate.openDoors(); ctx.setFlag('gate_open'); refresh(ctx);
      await ctx.say(T.gateOpened);
    }) },
  });
}

function setupForest(ctx) {
  pickup(ctx, 'p6_knife', ['p6_forest'], W.stumpKnife, 'knife', 'knife_taken');
  pickup(ctx, 'p6_mushroom', ['p6_forest'], W.stump.userData.mushroom, 'mushroom', 'mushroom_taken');
  pickup(ctx, 'p6_onion', ['p6_forest'], W.onion, 'onion', 'onion_taken');
  define(ctx, 'p6_well', ['p6_forest'], W.well, { cursor: 'grab', when: () => !ctx.flag('key_taken'), onClick: async () => {
    ctx.say(T.wellKey);
    if (await ctx.give('key', { from: W.wellKey })) { ctx.setFlag('key_taken'); refresh(ctx); }
  } });
}

function setupDoctor(ctx) {
  pickup(ctx, 'p6_staff', ['p6_temple_int'], W.templeStaff, 'plague_staff', 'staff_taken');
  const show = (humor) => async () => {
    if (!ctx.flag('staff_given')) { ctx.state.select(null); return ctx.say(T.doctorStaff); }
    ctx.state.select(null);
    await ctx.cutscene(async () => {
      const from = -W.staffPivot.rotation.z * 6 / Math.PI, to = HUMOR_DIR[humor];
      await ctx.animate(700, (k) => pointStaff(from + (to - from) * k), ctx.Ease.inOutSine);
      ctx.setFlag('doctor_pointing', humor);
    });
    await ctx.say(T.doctorPoint[humor]);
  };
  define(ctx, 'p6_doctor', ['p6_doctor'], W.doctorRig.parts.body, {
    cursor: 'talk',
    onClick: () => ctx.say(ctx.flag('staff_given') ? T.doctorIdle : T.doctorStaff),
    onItem: {
      plague_staff: () => ctx.cutscene(async () => {
        ctx.take('plague_staff'); ctx.setFlag('staff_given'); refresh(ctx);
        await ctx.say(T.doctorThanks);
        if (await ctx.give('blood', { from: W.doctor })) { ctx.setFlag('blood_returned'); checkHumors(ctx); }
      }),
      blood: show('blood'), tears: show('tears'), snot: show('snot'), saliva: show('saliva'),
      sick_heart: () => { ctx.state.select(null); return ctx.say(T.doctorHeart); },
    },
  });
}

function setupRoom(ctx) {
  // 书桌：先打开左边盒子才能拿针线；胡椒碗在桌上
  define(ctx, 'p6_desk_box', ['p6_desk'], W.desk.userData.lids[0], { when: () => !ctx.flag('desk_open'), onClick: () => {
    ctx.setFlag('desk_open'); ctx.sfx('lid'); refresh(ctx); ctx.say(T.deskBox);
  } });
  pickup(ctx, 'p6_needle', ['p6_desk'], W.desk.userData.needle, 'needle_thread', 'needle_taken', () => !!ctx.flag('desk_open'));
  pickup(ctx, 'p6_pepper', ['p6_desk', 'p6_room'], W.pepper, 'pepper', 'pepper_taken');
  // 玻璃柜：钥匙打开，拿三只空瓶
  define(ctx, 'p6_cabinet', ['p6_cabinet'], W.cabinet, {
    cursor: 'use', when: () => !ctx.flag('cabinet_open'), onClick: () => ctx.say(T.cabinetLocked),
    onItem: { key: () => { ctx.take('key'); ctx.setFlag('cabinet_open'); ctx.sfx('unlock'); refresh(ctx); } },
  });
  pickup(ctx, 'p6_bottles', ['p6_cabinet'], W.cabinet.getObjectByName('p6_bottles'), 'bottles', 'bottles_taken',
    () => !!ctx.flag('cabinet_open'), () => ctx.setFlag('p6_bottles_left', 3));
  // 奶奶：洋葱 → 眼泪，胡椒 → 鼻涕，蘑菇 → 唾液；每次用掉一只空瓶
  const give = (ingredient) => async () => {
    const humor = GRANDMA_GIVES[ingredient], left = Number(ctx.flag('p6_bottles_left')) || 0;
    if (!ctx.state.has('bottles') || left <= 0) { ctx.state.select(null); return ctx.say(T.grandmaNeedBottle); }
    await ctx.cutscene(async () => {
      ctx.take(ingredient);
      ctx.setFlag('p6_bottles_left', left - 1);
      if (left - 1 <= 0) ctx.take('bottles');
      ctx.setFlag(`${humor}_made`); ctx.sfx('pour'); refresh(ctx);
      await ctx.say(T.grandmaGave[humor]);
      await ctx.give(humor, { from: W.grandma });
      checkHumors(ctx);
    });
  };
  define(ctx, 'p6_grandma', ['p6_grandma'], W.grandmaRig.parts.body, {
    cursor: 'talk', onClick: () => ctx.say(ctx.flag('chest_sewn') ? T.grandmaAfter : T.grandma),
    onItem: { onion: give('onion'), pepper: give('pepper'), mushroom: give('mushroom') },
  });
}

function cureDoc(ctx) {
  const arrow = (hour) => `<svg width="64" height="36" viewBox="0 0 64 36"><line x1="6" y1="30" x2="58" y2="30" stroke="#6b5a49" stroke-width="1"/>`
    + `<g transform="rotate(${hour * 30} 32 18)"><line x1="32" y1="30" x2="32" y2="6" stroke="#2c2420" stroke-width="3"/><polygon points="32,1 26,10 38,10" fill="#2c2420"/></g><circle cx="32" cy="18" r="3" fill="#2c2420"/></svg>`;
  const rows = [...CURE].reverse().map((h) => `<div style="margin:2px 0">${arrow(HUMOR_DIR[h])}</div>`).join('');
  const cure = `<div style="text-align:center;font-family:serif"><div style="font-size:30px;letter-spacing:4px">CURE</div><div style="display:inline-block;border:2px solid #4a3c30;border-radius:40px 40px 4px 4px;padding:10px 18px">${rows}</div></div>`;
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'].map((s) => `<span style="display:inline-block;min-width:26px;border-left:1px solid #4a3c30">${s}</span>`).join('');
  const time = `<div style="text-align:center;font-family:serif"><div style="font-size:30px;letter-spacing:4px">TIME</div><div style="margin-top:40px;border:2px solid #4a3c30;border-radius:20px;padding:10px;font-size:14px">${roman}</div></div>`;
  return ctx.ui.doc({ envelope: false, hint: T.cureDocHint, pages: [{ html: cure }, { html: time }] });
}

function setupFlask(ctx) {
  define(ctx, 'p6_book', ['p6_flask'], W.book, { cursor: 'zoom', onClick: () => cureDoc(ctx) });
  const pour = (humor) => async () => {
    if (ctx.flag('medicine_made')) return;
    const r = pourLayer(ctx.flag('flask_layers') || [], humor);
    ctx.setFlag('flask_layers', r.layers); ctx.sfx(r.ok ? 'pour' : 'wrong'); refresh(ctx);
    if (!r.ok) { ctx.state.select(null); return ctx.say(T.flaskWrong); }
    if (r.done) {
      ctx.setFlag('medicine_made');
      for (const h of HUMORS) ctx.take(h);
      refresh(ctx); ctx.say(T.flaskDone);
    }
  };
  define(ctx, 'p6_flask', ['p6_flask'], W.flask, {
    cursor: 'use',
    onClick: async () => {
      if (!ctx.flag('medicine_made')) return ctx.say((ctx.flag('flask_layers') || []).length ? T.flaskHint : T.flaskEmpty);
      if (ctx.flag('medicine_taken')) return;
      if (await ctx.give('medicine', { from: W.flask })) { ctx.setFlag('medicine_taken'); refresh(ctx); }
    },
    onItem: Object.fromEntries(HUMORS.map((h) => [h, pour(h)])),
  });
}

function setupChest(ctx) {
  W.chest.userData.boils.forEach((boil, i) => define(ctx, `p6_boil_${i}`, ['p6_chest'], boil, {
    when: () => !ctx.flag('boils_done') && !(ctx.flag('boils_popped') || []).includes(i),
    onClick: () => {
      const next = popBoil(ctx.flag('boils_popped') || [], i);
      if (!next) { ctx.setFlag('boils_popped', []); ctx.sfx('wrong'); refresh(ctx); return ctx.say(T.boilsWrong); }
      ctx.setFlag('boils_popped', next); ctx.sfx('squish');
      if (boilsSolved(next)) { ctx.setFlag('boils_done'); ctx.achieve('p6_lanced'); ctx.say(T.boilsDone); }
      refresh(ctx);
    },
  }));
  define(ctx, 'p6_cross', ['p6_chest'], W.chest.userData.cross, {
    cursor: 'use', when: () => !!ctx.flag('boils_done') && !ctx.flag('chest_cut'), onClick: () => ctx.say(T.crossKnife),
    onItem: { knife: () => { ctx.take('knife'); ctx.setFlag('chest_cut'); ctx.sfx('cut'); refresh(ctx); ctx.say(T.heartOut); } },
  });
  pickup(ctx, 'p6_heart', ['p6_chest'], W.chest.userData.heart, 'sick_heart', 'heart_taken', () => !!ctx.flag('chest_cut'));
  // 胸口本身：喝药、放发条心、缝合都用在这里
  define(ctx, 'p6_chest_body', ['p6_chest'], W.chest.getObjectByName('chest_skin'), {
    cursor: 'use',
    onClick: () => ctx.say(!ctx.flag('heart_taken') ? (ctx.flag('boils_done') ? T.crossKnife : T.boilsHint) : !ctx.flag('clock_heart_placed') ? T.chestEmpty : !ctx.flag('chest_sewn') ? T.heartPlaced : T.sewn),
    onItem: {
      medicine: () => {
        if (!ctx.flag('heart_taken')) { ctx.state.select(null); return ctx.say(T.needHeartOut); }
        ctx.take('medicine'); ctx.setFlag('medicine_given'); ctx.sfx('drink'); refresh(ctx); return ctx.say(T.medicineGiven);
      },
      clock_heart: () => {
        if (!ctx.flag('heart_taken')) { ctx.state.select(null); return ctx.say(T.needHeartOut); }
        ctx.take('clock_heart'); ctx.setFlag('clock_heart_placed'); ctx.sfx('screw'); refresh(ctx); return ctx.say(T.heartPlaced);
      },
      needle_thread: () => ctx.cutscene(async () => {
        if (!ctx.flag('clock_heart_placed')) { ctx.state.select(null); return ctx.say(T.chestEmpty); }
        ctx.take('needle_thread'); ctx.setFlag('chest_sewn'); ctx.sfx('nail'); refresh(ctx);
        ctx.achieve('p6_clockwork');
        await ctx.say(T.sewn); await ctx.say(T.boar); await ctx.say(T.boar); await ctx.say(T.grandmaAfter);
      }),
    },
  });
}

function setupMouth(ctx) {
  W.mouth.userData.lower.forEach((slot, i) => define(ctx, `p6_tooth_${i}`, ['p6_mouth'], slot, {
    when: () => !ctx.flag('teeth_done'),
    onClick: () => {
      const order = ctx.flag('teeth_order') || TOOTH_LOWER_START, sel = ctx.flag('teeth_selected');
      if (!Number.isInteger(sel)) { ctx.setFlag('teeth_selected', i); ctx.sfx('click'); return refresh(ctx); }
      ctx.setFlag('teeth_selected', null);
      if (sel !== i) {
        const next = swapTeeth(order, sel, i);
        ctx.setFlag('teeth_order', next); ctx.sfx('click');
        if (teethSolved(next)) { ctx.setFlag('teeth_done'); ctx.sfx('lid'); ctx.say(T.teethDone); }
      }
      refresh(ctx);
    },
  }));
}

function setupClock(ctx) {
  const turn = (key, start) => async () => {
    if (ctx.flag('clock_open')) return;
    ctx.setFlag(key, advanceHand(ctx.flag(key) ?? start)); ctx.sfx('click'); refresh(ctx);
    if (clockSolved(ctx.flag('clock_x') ?? CLOCK_START.x, ctx.flag('clock_dots') ?? CLOCK_START.dots)) {
      if (!ctx.flag('teeth_done')) return;
      await ctx.cutscene(async () => { ctx.sfx('bell'); await W.clock.open(); ctx.setFlag('clock_open'); refresh(ctx); });
      ctx.say(T.clockOpened);
    }
  };
  define(ctx, 'p6_hand_x', ['p6_clock'], W.clock.userData.handX, { when: () => !ctx.flag('clock_open'), onClick: turn('clock_x', CLOCK_START.x) });
  define(ctx, 'p6_hand_dots', ['p6_clock'], W.clock.userData.handDots, { when: () => !ctx.flag('clock_open'), onClick: turn('clock_dots', CLOCK_START.dots) });
  pickup(ctx, 'p6_clock_heart', ['p6_clock'], W.clock.userData.heart, 'clock_heart', 'clock_heart_taken', () => !!ctx.flag('clock_open'));
}

function setupTrunk(ctx) {
  W.trunk.userData.dials.forEach((dial, i) => define(ctx, `p6_dial_${i}`, ['p6_trunk'], dial, {
    when: () => !ctx.flag('trunk_open'),
    onClick: async () => {
      const next = turnDial(ctx.flag('trunk_letters') || TRUNK_START, i);
      ctx.setFlag('trunk_letters', next); ctx.sfx('click'); refresh(ctx);
      if (trunkSolved(next)) await ctx.cutscene(async () => {
        ctx.setFlag('trunk_open'); ctx.sfx('unlock'); refresh(ctx);
        await ctx.say(T.trunkOpen); ctx.setFlag('memory_seen');
        await ctx.go('p6_memory');
      });
    },
  }));
  define(ctx, 'p6_trunk_open', ['p6_trunk'], W.trunk, { cursor: 'zoom', when: () => !!ctx.flag('trunk_open'), onClick: () => ctx.go('p6_memory') });
  define(ctx, 'p6_deer', ['p6_memory'], W.deerRig.parts.body, {
    cursor: 'use', when: () => !ctx.flag('heart_given'), onClick: () => ctx.say(T.memoryHint),
    onItem: { sick_heart: () => ctx.cutscene(async () => {
      ctx.take('sick_heart'); ctx.setFlag('heart_given'); refresh(ctx); ctx.sfx('heartbeat');
      await ctx.say(T.memoryLine);
    }) },
  });
  pickup(ctx, 'p6_black_cube', ['p6_memory'], W.cube, 'black_cube', 'cube_taken', () => !!ctx.flag('heart_given'));
}

function setupTemple(ctx) {
  define(ctx, 'p6_holder', ['p6_altar'], W.holder, {
    onClick: async () => {
      if (!ctx.flag('holder_cube')) {
        if (!ctx.state.has('black_cube')) return ctx.say(T.templeLocked);
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
  define(ctx, 'p6_font', ['p6_altar'], W.font, {
    when: () => !!ctx.flag('holder_closed') && !ctx.flag('holder_lowered'), onClick: async () => {
      await W.font.showReflection(); ctx.setFlag('reflection_seen'); ctx.say(T.reflection); refresh(ctx);
    },
  });
  define(ctx, 'p6_painting', ['p6_painting'], W.painting, {
    when: () => !!ctx.flag('font_lit') && !ctx.flag('plague6_complete'), onClick: () => ctx.cutscene(async () => {
      if (!ctx.flag('painting_lit')) { await W.painting.glowCube(); ctx.setFlag('painting_lit'); }
      else if (!ctx.flag('plague_cleared')) { await W.painting.clearPlague(); ctx.setFlag('plague_cleared'); }
      else { await W.painting.frameNext(); ctx.setFlag('next_framed'); ctx.setFlag('plague6_complete'); }
      refresh(ctx);
      if (ctx.flag('plague6_complete')) await ctx.ui.ending(T.ending);
    }),
  });
}

export function setup(ctx) {
  setupGate(ctx); setupForest(ctx); setupDoctor(ctx); setupRoom(ctx); setupFlask(ctx);
  setupChest(ctx); setupMouth(ctx); setupClock(ctx); setupTrunk(ctx); setupTemple(ctx);
}

// 自动通关：牙齿按“从左往右，把该在这一列的那颗换过来”的做法生成点击
function teethClicks() {
  const order = [...TOOTH_LOWER_START], steps = [];
  for (let i = 0; i < order.length; i++) {
    if (order[i] === TOOTH_UPPER[i]) continue;
    const j = order.findIndex((s, k) => k > i && s === TOOTH_UPPER[i] && s !== TOOTH_UPPER[k]);
    steps.push({ click: `p6_tooth_${i}` }, { click: `p6_tooth_${j}` });
    [order[i], order[j]] = [order[j], order[i]];
  }
  return steps;
}
function hourClicks(id, from, to) { const out = []; for (let h = from; h !== to; h = h % 12 + 1) out.push({ click: id }); return out; }
function dialClicks() {
  const out = [];
  TRUNK_START.forEach((n, i) => { for (let k = n; TRUNK_LETTERS[k] !== TRUNK_ANSWER[i]; k = (k + 1) % TRUNK_LETTERS.length) out.push({ click: `p6_dial_${i}` }); });
  return out;
}

export const walkthrough = [
  { click: 'p6_overview_island' }, { click: 'p6_bottle' }, { use: 'empty_bottle', on: 'p6_skull' },
  { click: 'p6_gate_knock' }, { use: 'blood', on: 'p6_gate_hand' }, { expectFlag: 'gate_open' },
  { go: 'p6_forest' }, { click: 'p6_knife' }, { click: 'p6_mushroom' }, { click: 'p6_onion' }, { click: 'p6_well' },
  { go: 'p6_temple' }, { click: 'p6_temple_entry' }, { click: 'p6_staff' }, { back: true },
  { go: 'p6_grove' }, { click: 'p6_doctor_zoom' }, { use: 'plague_staff', on: 'p6_doctor' }, { expectItem: 'blood' }, { back: true },
  { go: 'p6_house' }, { click: 'p6_house_entry' }, { click: 'p6_desk_zoom' }, { click: 'p6_desk_box' }, { click: 'p6_needle' }, { click: 'p6_pepper' }, { back: true },
  { click: 'p6_cabinet_zoom' }, { use: 'key', on: 'p6_cabinet' }, { click: 'p6_bottles' }, { back: true },
  { click: 'p6_patient' }, ...BOIL_SOLUTION.map((i) => ({ click: `p6_boil_${i}` })), { expectFlag: 'boils_done' },
  { use: 'knife', on: 'p6_cross' }, { click: 'p6_heart' }, { back: true },
  { click: 'p6_grandma_zoom' }, { use: 'onion', on: 'p6_grandma' }, { use: 'pepper', on: 'p6_grandma' }, { use: 'mushroom', on: 'p6_grandma' },
  { expectItem: ['tears', 'snot', 'saliva', 'blood'] }, { back: true },
  { click: 'p6_flask_zoom' }, { click: 'p6_book' }, ...CURE.map((h) => ({ use: h, on: 'p6_flask' })), { expectFlag: 'medicine_made' }, { click: 'p6_flask' }, { back: true },
  { click: 'p6_patient' }, { use: 'medicine', on: 'p6_chest_body' }, { click: 'p6_patient_face' }, ...teethClicks(), { expectFlag: 'teeth_done' }, { back: true },
  { click: 'p6_clock_zoom' }, ...hourClicks('p6_hand_x', CLOCK_START.x, CLOCK_ANSWER.x), ...hourClicks('p6_hand_dots', CLOCK_START.dots, CLOCK_ANSWER.dots),
  { expectFlag: 'clock_open' }, { click: 'p6_clock_heart' }, { back: true },
  { click: 'p6_patient' }, { use: 'clock_heart', on: 'p6_chest_body' }, { use: 'needle_thread', on: 'p6_chest_body' }, { expectFlag: 'chest_sewn' }, { back: true },
  { click: 'p6_trunk_zoom' }, ...dialClicks(), { expectFlag: 'trunk_open' },
  { use: 'sick_heart', on: 'p6_deer' }, { click: 'p6_black_cube' }, { expectFlag: 'cube_taken' }, { back: true },
  { go: 'p6_temple' }, { click: 'p6_temple_entry' }, { click: 'p6_altar_entry' }, { click: 'p6_holder' }, { use: 'black_cube', on: 'p6_holder' },
  { click: 'p6_font' }, { click: 'p6_holder' }, { click: 'p6_painting_entry' }, { click: 'p6_painting' }, { click: 'p6_painting' }, { click: 'p6_painting' },
  { expectFlag: 'plague6_complete' },
];
