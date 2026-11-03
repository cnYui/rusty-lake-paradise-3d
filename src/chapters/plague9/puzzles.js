// 点击、物品使用和自动通关共用规则；任何进度都先存进 flags，再由 sync 刷新模型。
import { W, sync as refresh, stoneMarks } from './world.js';
import { POWDER_COLORS } from '../../art/props_p9.js';
import { T } from './text.js';
import {
  BARK_SPOT, peckDropsBark, GRIND, grindable, SHADOWS, signOf,
  DIAL_START, turnHand, dialSolved, dialClicks, ORRERY_START, stepOrrery, isEclipse, eclipseClicks,
  CANDLE_START, CANDLE_ANSWER, candleSolved,
} from './rules.js';

const define = (ctx, id, views, object, rest) => ctx.hotspots.define({ id, views, object, cursor: 'pointer', ...rest });

function pickup(ctx, id, views, object, item, flag, when = () => true, after = null) {
  define(ctx, id, views, object, { cursor: 'grab', when: () => when() && !ctx.flag(flag), onClick: async () => {
    if (await ctx.give(item, { from: object })) { ctx.setFlag(flag); refresh(ctx); after?.(); }
  } });
}

// 篝火边的人：每点一次说下一句（月食以后换一套）；只是对话，不进存档
const talkN = {};
function setupBonfire(ctx) {
  for (const [id, rig] of Object.entries(W.peopleRigs)) {
    define(ctx, `p9_person_${id}`, ['p9_bonfire', 'p9_fire'], rig.parts.body, {
      cursor: 'talk',
      onClick: () => {
        const lines = (ctx.flag('blood_moon') ? T.peopleAfter : T.people)[id];
        const n = talkN[id] = (talkN[id] || 0) + 1;
        return ctx.say(lines[(n - 1) % lines.length]);
      },
    });
  }
  // 篝火：撒一种粉末，火苗变成粉末的颜色、烟里浮出一个星座的黑影，石头圈上那个符号亮起来；骨粉浮出母亲
  const fireItems = {};
  for (const powder of Object.keys(SHADOWS)) fireItems[powder] = () => throwPowder(ctx, powder);
  // 火烧尽以后灰里的黑方块在火堆点击盒里面：方块拿走之前，火堆 / 石头圈的点击盒让位给它
  const cubeWaiting = () => !!ctx.flag('fire_out') && !ctx.flag('cube_taken');
  define(ctx, 'p9_fire', ['p9_fire'], W.fire.getObjectByName('fire_hit'), {
    cursor: 'use', when: () => !cubeWaiting(),
    onClick: () => ctx.say(ctx.flag('fire_out') ? T.fireOut : ctx.flag('shadow_aries') || ctx.flag('shadow_libra') || ctx.flag('shadow_gemini') ? T.fire : `${T.fire}${T.fireNeedPowder}`),
    onItem: fireItems,
    onWrongItem: () => { ctx.state.select(null); return ctx.say(ctx.flag('fire_out') ? T.fireOut : T.fireNotThis); },
  });
  define(ctx, 'p9_stones', ['p9_stones'], W.fire.getObjectByName('fire_hit'), { cursor: 'zoom', when: () => !cubeWaiting(), onClick: () => ctx.say(T.stones) });
  pickup(ctx, 'p9_fire_cube', ['p9_fire', 'p9_stones'], W.fire.userData.cube, 'black_cube', 'cube_taken', () => !!ctx.flag('fire_out'));
  define(ctx, 'p9_tower_door', ['p9_bonfire', 'p9_tower_path'], W.towerDoor.getObjectByName('door_arch'), { cursor: 'zoom', onClick: () => ctx.say(T.towerDoor) });

  // 塔门边的冰：月食后落下来的红月石冻在里面
  define(ctx, 'p9_ice', ['p9_ice'], W.ice.userData.ice, {
    cursor: 'use', when: () => !!ctx.flag('blood_moon') && !ctx.flag('ice_broken'),
    onClick: () => ctx.say(ctx.state.has('pickaxe') ? T.ice : T.iceNeedPick),
    onItem: { pickaxe: () => ctx.cutscene(async () => {
      ctx.take('pickaxe');
      for (let i = 0; i < 3; i++) { ctx.sfx('chop'); await ctx.wait(260); }
      ctx.sfx('ice_crack'); await W.ice.crack();
      ctx.setFlag('ice_broken'); refresh(ctx);
      await ctx.say(T.iceCrack);
    }) },
  });
  pickup(ctx, 'p9_moon_stone', ['p9_ice'], W.ice.userData.stone, 'moon_stone', 'moon_stone_taken', () => !!ctx.flag('ice_broken'));
}

function throwPowder(ctx, powder) {
  return ctx.cutscene(async () => {
    if (ctx.flag('fire_out')) { ctx.state.select(null); return ctx.say(T.fireOut); }
    const kind = SHADOWS[powder], color = POWDER_COLORS[powder];
    ctx.take(powder);
    ctx.sfx('fire_light');
    if (kind === 'mother') {
      await Promise.all([W.fire.flare(color), W.fire.showShadow('mother')]);
      ctx.setFlag('shadow_mother');
      await ctx.say(T.mother);
      ctx.sfx('fire_crackle');
      await W.fire.burnOut();
      ctx.setFlag('fire_out'); refresh(ctx);
      ctx.sfx('cube_float');
      await ctx.say(T.fireCube);
      return;
    }
    await Promise.all([W.fire.flare(color), W.fire.showShadow(kind), ctx.wait(900).then(() => W.fire.markStone(signOf(powder), color))]);
    ctx.setFlag(`shadow_${kind}`); refresh(ctx);
    await ctx.say(T.shadow[kind]);
    if (!ctx.flag('gerard_smelled')) { ctx.setFlag('gerard_smelled'); await ctx.say(T.gerardSmell); }
  });
}

function setupGrove(ctx) {
  // 啄木鸟：点树干上的一个疤，它飞过去啄三下；啄的是发白翘起的那块松树皮，树皮就掉下来
  W.birch.userData.knots.forEach((hit) => define(ctx, `p9_knot_${hit.userData.knot}`, ['p9_woodpecker'], hit, {
    when: () => !ctx.flag('bark_taken'),
    onClick: () => ctx.cutscene(async () => {
      const i = hit.userData.knot;
      await W.birch.peck(i, () => ctx.sfx('peck'));
      ctx.setFlag('pecks', i);
      if (!peckDropsBark(i)) return ctx.say(T.peck);
      ctx.sfx('rustle');
      await W.birch.dropBark();
      ctx.setFlag('bark_taken'); refresh(ctx);
      await ctx.give('bark', { from: W.birch.userData.bird });
      ctx.achieve('p9_woodpecker');
      await ctx.say(T.barkTaken);
    }),
  }));
  define(ctx, 'p9_woodpecker_bird', ['p9_woodpecker'], W.birch.userData.bird, {
    cursor: 'talk', onClick: () => ctx.say(ctx.flag('bark_taken') ? T.barkDone : T.birch),
  });
}

function setupLake(ctx) {
  define(ctx, 'p9_crate_owl', ['p9_crate'], W.crate.userData.owl, {
    cursor: 'talk', when: () => !ctx.flag('beacon_lit'),
    onClick: async () => { ctx.sfx('owl'); await ctx.say(T.crateOwl); },
    onWrongItem: () => { ctx.state.select(null); return ctx.say(T.owlHoot); },
  });
  define(ctx, 'p9_crate', ['p9_crate'], W.crate.getObjectByName('crate_hit'), {
    cursor: 'zoom', when: () => !!ctx.flag('bones_taken'), onClick: () => ctx.say(T.crateOpen),
  });
  pickup(ctx, 'p9_bones', ['p9_crate'], W.crate.userData.bones, 'bones', 'bones_taken', () => !!ctx.flag('beacon_lit'), () => ctx.say(T.crateBones));
  pickup(ctx, 'p9_shell', ['p9_lake', 'p9_crate'], W.shell, 'shell', 'shell_taken', () => true, () => ctx.say(T.shellTaken));
}

function setupHouse(ctx) {
  const g = W.grinder.userData;
  const busy = () => {
    if (ctx.flag('grinder_out')) return T.grinderBusy;
    if (ctx.flag('grinder_in')) return T.grinderFull;
    return null;
  };
  const putIn = {};
  for (const item of Object.keys(GRIND)) {
    putIn[item] = async () => {
      const why = busy();
      if (why) { ctx.state.select(null); return ctx.say(why); }
      ctx.take(item); ctx.sfx('pot_drop');
      ctx.setFlag('grinder_in', item); refresh(ctx);
    };
  }
  define(ctx, 'p9_hopper', ['p9_grinder'], g.hopper, {
    cursor: 'use',
    onClick: () => ctx.say(busy() || T.grinderEmpty),
    onItem: putIn,
    onWrongItem: (c, item) => { ctx.state.select(null); return ctx.say(grindable(item) ? busy() || T.grinderNo : T.grinderNo); },
  });
  define(ctx, 'p9_crank', ['p9_grinder'], g.crank, {
    onClick: () => {
      const input = ctx.flag('grinder_in');
      if (ctx.flag('grinder_out')) return ctx.say(T.grinderBusy);
      if (!input) return ctx.say(T.grinderEmpty);
      return ctx.cutscene(async () => {
        const out = GRIND[input];
        ctx.sfx('grind');
        await W.grinder.crank(POWDER_COLORS[out]);
        ctx.setFlag('grinder_in', null); ctx.setFlag('grinder_out', out); refresh(ctx);
      });
    },
  });
  define(ctx, 'p9_tray', ['p9_grinder'], g.tray, {
    cursor: 'grab', when: () => !!ctx.flag('grinder_out'),
    onClick: async () => {
      const out = ctx.flag('grinder_out');
      if (await ctx.give(out, { from: g.tray })) { ctx.setFlag('grinder_out', null); refresh(ctx); }
    },
  });
  define(ctx, 'p9_grinder', ['p9_grinder'], W.grinder.getObjectByName('grinder_body'), { cursor: 'zoom', onClick: () => ctx.say(T.grinder) });
  define(ctx, 'p9_drawings', ['p9_room'], W.drawings.getObjectByName('drawings_hit'), { cursor: 'zoom', onClick: () => ctx.say(T.drawings) });
  define(ctx, 'p9_scroll', ['p9_scroll'], W.scroll, { cursor: 'zoom', onClick: () => ctx.say(T.scrollRead) });
  pickup(ctx, 'p9_pickaxe', ['p9_room'], W.pickaxe, 'pickaxe', 'pickaxe_taken');
}

// 月食：月相仪上的月亮变红，窗外的满月一点点变成暗红色，有东西从月亮上落进塔门外的雪地
function eclipse(ctx) {
  return ctx.cutscene(async () => {
    ctx.sfx('holy');
    await W.orrery.eclipse();
    ctx.setFlag('blood_moon'); ctx.achieve('p9_blood_moon');
    await ctx.say(T.eclipse);
    await ctx.go('p9_window');
    await ctx.animate(1800, (k) => { W.sky.setBlood(k); W.room.setBlood(k); }, ctx.Ease.inOutSine);
    refresh(ctx);
    ctx.sfx('whoosh');
    await ctx.say(T.meteor);
  });
}

function setupTower(ctx) {
  // 星座盘：点一根针它顺时针走一格；三根针停在火里那三种影子的星座上，抽屉弹出来
  const cab = W.cabinet.userData;
  cab.hands.forEach((hit) => define(ctx, `p9_hand_${hit.userData.hand}`, ['p9_dial'], hit, {
    when: () => !ctx.flag('drawer_open'),
    onClick: async () => {
      const i = hit.userData.hand, next = turnHand(ctx.flag('dial_hands') || DIAL_START, i);
      if (!next) return;
      ctx.setFlag('dial_hands', next); ctx.sfx('dial_click');
      await W.cabinet.turn(i, next[i]);
      if (dialSolved(next)) await ctx.cutscene(async () => {
        await ctx.wait(200); ctx.sfx('cabinet_open');
        await W.cabinet.openDrawer();
        ctx.setFlag('drawer_open'); refresh(ctx); ctx.achieve('p9_zodiac');
        await ctx.say(T.dialOpen);
      });
    },
  }));
  define(ctx, 'p9_dial', ['p9_dial'], W.cabinet.getObjectByName('dial_face'), { cursor: 'zoom', onClick: () => ctx.say(ctx.flag('drawer_open') ? T.dial : `${T.dial}${T.dialHint}`) });
  pickup(ctx, 'p9_copper_key', ['p9_dial'], cab.key, 'copper_key', 'copper_key_taken', () => !!ctx.flag('drawer_open'));

  // 链条：铜钥匙开挂锁，再摇绞盘把梯子放下来
  define(ctx, 'p9_padlock', ['p9_chain'], W.chain.userData.lock, {
    cursor: 'use', when: () => !ctx.flag('padlock_open'),
    onClick: () => ctx.say(T.chain),
    onItem: { copper_key: () => ctx.cutscene(async () => {
      ctx.take('copper_key'); ctx.sfx('unlock');
      await W.chain.unlock();
      ctx.setFlag('padlock_open'); refresh(ctx);
      await ctx.say(T.chainUnlock);
    }) },
  });
  define(ctx, 'p9_winch', ['p9_chain'], W.chain.userData.crank, {
    onClick: () => {
      if (!ctx.flag('padlock_open')) return ctx.say(T.chainLocked);
      if (ctx.flag('ladder_down')) return ctx.say(T.ladderDone);
      return ctx.cutscene(async () => {
        ctx.sfx('chain');
        await Promise.all([W.chain.wind(), ctx.wait(500).then(() => W.ladder.lower())]);
        ctx.setFlag('ladder_down'); refresh(ctx);
        await ctx.say(T.ladderDown);
      });
    },
  });

  // 月相仪：点地球 / 月亮各转一格；地球正好挡在太阳和月亮中间就是月食
  for (const which of ['earth', 'moon']) {
    define(ctx, `p9_${which}`, ['p9_orrery'], W.orrery.userData[which], {
      onClick: async () => {
        if (ctx.flag('blood_moon')) return ctx.say(T.orreryDone);
        const next = stepOrrery(ctx.flag('orrery') || ORRERY_START, which);
        ctx.setFlag('orrery', next); ctx.sfx('dial_click');
        await W.orrery.step(which, next[which]);
        if (isEclipse(next)) await eclipse(ctx);
      },
    });
  }
  define(ctx, 'p9_orrery', ['p9_orrery'], W.orrery.getObjectByName('table_top'), { cursor: 'zoom', onClick: () => ctx.say(ctx.flag('blood_moon') ? T.orreryDone : T.orrery) });
  define(ctx, 'p9_window', ['p9_window'], W.room.userData.window, { cursor: 'zoom', onClick: () => ctx.say(ctx.flag('blood_moon') ? T.windowBlood : T.windowMoon) });
}

function setupAttic(ctx) {
  const a = W.attic.userData;
  // 地上的星座符号：点一个，蜡烛挪过去，墙上的五个影子一路跟着动；放在天蝎上五个影子正好落进粉笔轮廓
  a.spots.forEach((hit) => define(ctx, `p9_spot_${hit.userData.spot}`, ['p9_shadows'], hit, {
    when: () => !ctx.flag('shadows_done'),
    onClick: async () => {
      const i = hit.userData.spot, from = Number.isInteger(ctx.flag('candle_at')) ? ctx.flag('candle_at') : CANDLE_START;
      if (i === from) return;
      await ctx.cutscene(async () => {
        ctx.setFlag('candle_at', i); ctx.sfx('flicker');
        await W.attic.moveCandle(i);
        if (!candleSolved(i)) return;
        ctx.sfx('holy');
        await W.attic.solve();
        ctx.setFlag('shadows_done'); ctx.achieve('p9_shadow_play');
        ctx.sfx('door'); await W.attic.openDoor();
        refresh(ctx);
        await ctx.say(T.shadowsDone);
      });
    },
  }));
  define(ctx, 'p9_ornaments', ['p9_shadows'], a.wall, { cursor: 'zoom', onClick: () => ctx.say(T.ornaments) });
  define(ctx, 'p9_candle', ['p9_shadows', 'p9_attic'], a.candle, {
    cursor: 'grab', when: () => !ctx.flag('candle_taken'),
    onClick: async () => {
      if (!ctx.flag('shadows_done')) return ctx.say(T.candleNotYet);
      if (await ctx.give('candle', { from: a.candle })) { ctx.setFlag('candle_taken'); refresh(ctx); }
    },
  });
  define(ctx, 'p9_attic_door', ['p9_attic', 'p9_shadows'], a.door, { cursor: 'zoom', when: () => !ctx.flag('shadows_done'), onClick: () => ctx.say(T.door) });
  // 塔顶平台的火盆：蜡烛点着它，火光照亮湖岸，木箱上怕光的猫头鹰飞走
  define(ctx, 'p9_beacon', ['p9_beacon'], a.beacon, {
    cursor: 'use',
    onClick: () => ctx.say(ctx.flag('beacon_lit') ? T.beaconDone : `${T.beacon}${T.beaconNeedFire}`),
    onItem: { candle: () => ctx.cutscene(async () => {
      if (ctx.flag('beacon_lit')) return;
      ctx.take('candle'); ctx.sfx('fire_light');
      await W.attic.light();
      ctx.setFlag('beacon_lit');
      await ctx.say(T.beaconLit);
      await ctx.go('p9_crate');
      ctx.sfx('owl'); await ctx.wait(400);
      ctx.sfx('wing');
      await Promise.all([W.crate.owlFlyAway(), ctx.wait(500).then(() => { ctx.sfx('lid'); return W.crate.openLid(); })]);
      refresh(ctx);
      await ctx.say(T.owlFlees);
    }) },
  });
}

function setupTemple(ctx) {
  pickup(ctx, 'p9_blue_stone', ['p9_temple_int', 'p9_altar'], W.blueStone, 'blue_stone', 'blue_stone_taken', () => true, () => ctx.say(T.blueStone));
  define(ctx, 'p9_font_hint', ['p9_altar'], W.font, { when: () => !ctx.flag('holder_closed'), onClick: () => ctx.say(T.templeHint) });
  define(ctx, 'p9_holder', ['p9_altar'], W.holder, {
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
  define(ctx, 'p9_font', ['p9_altar'], W.font, {
    when: () => !!ctx.flag('holder_closed') && !ctx.flag('holder_lowered'), onClick: async () => {
      await W.font.showReflection(); ctx.setFlag('reflection_seen'); ctx.say(T.reflection); refresh(ctx);
    },
  });
  define(ctx, 'p9_painting', ['p9_painting'], W.painting, {
    when: () => !!ctx.flag('font_lit') && !ctx.flag('plague9_complete'), onClick: () => ctx.cutscene(async () => {
      if (!ctx.flag('painting_lit')) { await W.painting.glowCube(); ctx.setFlag('painting_lit'); }
      else if (!ctx.flag('plague_cleared')) { await W.painting.clearPlague(); ctx.setFlag('plague_cleared'); }
      else { await W.painting.frameNext(); ctx.setFlag('next_framed'); ctx.setFlag('plague9_complete'); }
      refresh(ctx);
      if (ctx.flag('plague9_complete')) await ctx.ui.ending(T.ending);
    }),
  });
}

export function setup(ctx) {
  setupBonfire(ctx); setupGrove(ctx); setupLake(ctx); setupHouse(ctx); setupTower(ctx); setupAttic(ctx); setupTemple(ctx);
}

export { stoneMarks };

// ---- 自动通关 ----
const grind = (item) => [{ use: item, on: 'p9_hopper' }, { click: 'p9_crank' }, { click: 'p9_tray' }, { expectItem: GRIND[item] }];
const toGrinder = [{ go: 'p9_house' }, { click: 'p9_house_entry' }, { click: 'p9_grinder_zoom' }];
const leaveGrinder = [{ back: true }, { click: 'p9_room_exit' }];
const toFire = [{ go: 'p9_bonfire' }, { click: 'p9_fire_zoom' }];
const dialSteps = () => dialClicks(DIAL_START).flatMap((n, i) => Array.from({ length: n }, () => ({ click: `p9_hand_${i}` })));
const moonSteps = () => Array.from({ length: eclipseClicks(ORRERY_START) }, () => ({ click: 'p9_moon' }));

export const walkthrough = [
  { click: 'p9_overview_island' },
  { go: 'p9_bonfire' }, { click: 'p9_person_nicholas' }, { click: 'p9_person_margaret' }, { click: 'p9_person_gerard' },
  { click: 'p9_fire_zoom' }, { click: 'p9_fire' }, { click: 'p9_stones_zoom' }, { click: 'p9_stones' }, { back: true }, { back: true },
  // 白桦林：啄木鸟啄错一次，再啄松树皮
  { go: 'p9_grove' }, { click: 'p9_birch_zoom' }, { click: 'p9_woodpecker_bird' }, { click: 'p9_knot_1' }, { click: `p9_knot_${BARK_SPOT}` },
  { expectItem: 'bark' }, { back: true },
  // 木屋：墙上的画、小画、镐；磨树皮
  ...toGrinder.slice(0, 2), { click: 'p9_drawings' }, { click: 'p9_pickaxe' }, { click: 'p9_scroll_zoom' }, { click: 'p9_scroll' }, { back: true },
  { click: 'p9_grinder_zoom' }, { click: 'p9_crank' }, ...grind('bark'), ...leaveGrinder,
  // 湖边的贝壳、神殿里的青石
  { go: 'p9_lake' }, { click: 'p9_crate_zoom' }, { click: 'p9_crate_owl' }, { click: 'p9_shell' }, { back: true },
  { go: 'p9_temple' }, { click: 'p9_temple_entry' }, { click: 'p9_blue_stone' }, { back: true },
  ...toGrinder, ...grind('shell'), ...grind('blue_stone'), ...leaveGrinder,
  // 篝火：三种粉末，三个星座
  ...toFire, { use: 'powder_brown', on: 'p9_fire' }, { use: 'powder_white', on: 'p9_fire' }, { use: 'powder_blue', on: 'p9_fire' },
  { expectFlag: 'shadow_gemini' }, { back: true },
  // 塔里：星座盘 → 铜钥匙 → 挂锁 → 绞盘放梯子；月相仪 → 月食
  { click: 'p9_tower_entry' }, { click: 'p9_dial_zoom' }, { click: 'p9_dial' }, ...dialSteps(), { expectFlag: 'drawer_open' }, { click: 'p9_copper_key' }, { back: true },
  { click: 'p9_chain_zoom' }, { click: 'p9_winch' }, { use: 'copper_key', on: 'p9_padlock' }, { click: 'p9_winch' }, { expectFlag: 'ladder_down' }, { back: true },
  { click: 'p9_window_zoom' }, { click: 'p9_window' }, { back: true },
  { click: 'p9_orrery_zoom' }, { click: 'p9_orrery' }, ...moonSteps(), { expectFlag: 'blood_moon' }, { expectView: 'p9_window' }, { back: true },
  { click: 'p9_tower_exit' },
  // 塔门边的冰 → 红月石 → 红色粉末 → 天蝎
  { click: 'p9_ice_zoom' }, { click: 'p9_ice' }, { use: 'pickaxe', on: 'p9_ice' }, { click: 'p9_moon_stone' }, { back: true },
  ...toGrinder, ...grind('moon_stone'), ...leaveGrinder,
  ...toFire, { use: 'powder_red', on: 'p9_fire' }, { expectFlag: 'shadow_scorpio' }, { back: true },
  // 阁楼：影子 → 木门 → 塔顶火盆 → 猫头鹰飞走、木箱打开
  { click: 'p9_tower_entry' }, { click: 'p9_ladder_up' }, { click: 'p9_attic_door' }, { click: 'p9_shadows_zoom' }, { click: 'p9_ornaments' }, { click: 'p9_candle' },
  { click: `p9_spot_${CANDLE_ANSWER === 3 ? 4 : 3}` }, { click: `p9_spot_${CANDLE_ANSWER}` }, { expectFlag: 'shadows_done' }, { click: 'p9_candle' },
  { click: 'p9_beacon_zoom' }, { click: 'p9_beacon' }, { use: 'candle', on: 'p9_beacon' }, { expectFlag: 'beacon_lit' }, { expectView: 'p9_crate' },
  { click: 'p9_bones' }, { back: true },
  // 骨粉 → 母亲 → 黑方块
  ...toGrinder, ...grind('bones'), ...leaveGrinder,
  ...toFire, { use: 'powder_bone', on: 'p9_fire' }, { expectFlag: 'fire_out' }, { click: 'p9_fire_cube' }, { expectItem: 'black_cube' }, { back: true },
  // 神殿
  { go: 'p9_temple' }, { click: 'p9_temple_entry' }, { click: 'p9_altar_entry' },
  { click: 'p9_holder' }, { use: 'black_cube', on: 'p9_holder' }, { click: 'p9_font' }, { click: 'p9_holder' },
  { click: 'p9_painting_entry' }, { click: 'p9_painting' }, { click: 'p9_painting' }, { click: 'p9_painting' },
  { expectFlag: 'plague9_complete' },
];
