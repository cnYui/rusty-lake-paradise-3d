// 点击、物品使用和自动流程共用规则，任何进度都先存入 flags 再同步模型。
import { makeProp } from '../../art/props.js';
import { W, sync as refresh } from './world.js';
import { T } from './text.js';
import { FIELD_LEVELS, FIELD_SIZE, fieldCells, moveFieldPiece, fieldSolved, THREAD_LEVELS, toggleThread, threadSolved, COW_PAIRS, BURGER_ORDER } from './rules.js';

const count = (ctx, key) => Number(ctx.flag(key)) || 0;
const define = (ctx, id, views, object, rest) => ctx.hotspots.define({ id, views, object, cursor: 'pointer', ...rest });

function pickup(ctx, id, views, object, item, flag, when = () => true) {
  define(ctx, id, views, object, { cursor: 'grab', when: () => when() && !ctx.flag(flag), onClick: async () => {
    if (await ctx.give(item, { from: object })) { ctx.setFlag(flag); refresh(ctx); }
  } });
}

function setupCow(ctx) {
  pickup(ctx, 'p5_lettuce', ['p5_gate'], W.plant, 'lettuce', 'lettuce_taken');
  pickup(ctx, 'p5_bucket', ['p5_forest'], W.bucket, 'empty_bucket', 'bucket_taken');
  pickup(ctx, 'p5_knife', ['p5_kitchen'], W.knife, 'knife', 'knife_taken');
  // 疫斑就长在真实的牛模型上：点牛身侧面推近镜头，再按颜色把斑点两两配对
  define(ctx, 'p5_cow_skin', ['p5_cow'], W.cow.getObjectByName('cow_body'), { cursor: 'zoom', when: () => !ctx.flag('cow_cured'), goto: 'p5_skin' });
  W.cow.userData.dots.forEach((dot, index) => define(ctx, `p5_skin_dot_${index}`, ['p5_skin'], dot, {
    when: () => !ctx.flag('cow_cured') && !(ctx.flag('cow_pairs') || []).includes(index),
    onClick: async () => {
      const selected = ctx.flag('cow_selected'), cleared = ctx.flag('cow_pairs') || [];
      if (!Number.isInteger(selected)) ctx.setFlag('cow_selected', index);
      else if (selected === index) ctx.setFlag('cow_selected', null);
      else {
        ctx.setFlag('cow_selected', null);
        if (COW_PAIRS[selected] === COW_PAIRS[index]) {
          const next = [...cleared, selected, index]; ctx.setFlag('cow_pairs', next); ctx.sfx('click');
          if (next.length === COW_PAIRS.length) { ctx.setFlag('cow_cured'); ctx.achieve('sickly_cow'); }
        } else { ctx.sfx('wrong'); ctx.say(T.cowPair); }
      }
      refresh(ctx);
    },
  }));
  define(ctx, 'p5_cow_resource', ['p5_cow'], W.cow, {
    cursor: 'use', onClick: () => ctx.say(ctx.flag('cow_cured') ? T.cowCured : T.cow),
    onItem: {
      knife: async () => {
        if (!ctx.flag('cow_cured')) { ctx.state.select(null); return ctx.say(T.cow); }
        if (ctx.flag('cow_meat_taken')) return ctx.say(T.meatTaken);
        if (await ctx.give('raw_meat', { from: W.cow })) { ctx.setFlag('cow_meat_taken'); ctx.state.select(null); refresh(ctx); }
      },
      empty_bucket: async () => {
        if (!ctx.flag('cow_cured')) { ctx.state.select(null); return ctx.say(T.cow); }
        if (ctx.flag('milk_taken')) return;
        ctx.replace('empty_bucket', 'milk_bucket'); ctx.setFlag('milk_taken'); ctx.sfx('pour'); refresh(ctx);
      },
    },
  });
  define(ctx, 'p5_barrel', ['p5_barrel'], W.barrel, {
    cursor: 'use', onClick: async () => {
      if (!ctx.flag('barrel_filled')) return ctx.say(T.barrel);
      if (!ctx.flag('cheese_taken') && await ctx.give('cheese', { from: W.barrel })) { ctx.setFlag('cheese_taken'); refresh(ctx); }
    }, onItem: { milk_bucket: () => {
      if (ctx.flag('barrel_filled')) return;
      ctx.take('milk_bucket'); ctx.setFlag('barrel_filled'); ctx.sfx('pour'); refresh(ctx); ctx.say(T.cheese);
    } },
  });
}

function setupField(ctx) {
  const round = () => Math.min(count(ctx, 'field_round'), FIELD_LEVELS.length - 1);
  const positions = () => ctx.flag('field_positions') || FIELD_LEVELS[round()].pieces.map(() => null);
  const choose = (index) => () => { ctx.setFlag('field_selected', ctx.flag('field_selected') === index ? null : index); refresh(ctx); };
  const choosable = (index) => () => !ctx.flag('field_solved') && index < FIELD_LEVELS[round()].pieces.length;
  W.field.userData.trays.forEach((tray, index) => define(ctx, `p5_field_tray_${index}`, ['p5_field'], tray, { when: choosable(index), onClick: choose(index) }));
  // 田里的菜苗本身也是热点：点苗选中它，再点田格挪过去
  // 已经选着一株时关掉这个热点：点田格要落到田格上，不能被前排菜苗的影子挡住
  W.field.userData.slots.forEach((slot, index) => define(ctx, `p5_field_plant_${index}`, ['p5_field'], slot, { when: () => choosable(index)() && !Number.isInteger(ctx.flag('field_selected')), onClick: choose(index) }));
  W.field.userData.cells.forEach((cell, index) => define(ctx, `p5_field_cell_${index}`, ['p5_field'], cell, {
    when: () => !ctx.flag('field_solved'), onClick: async () => {
      const level = FIELD_LEVELS[round()], selected = ctx.flag('field_selected');
      if (!Number.isInteger(selected)) {
        ctx.setFlag('field_selected', fieldCells(level, positions())[index]); refresh(ctx); return;
      }
      const next = moveFieldPiece(level, positions(), selected, [index % FIELD_SIZE[0], Math.floor(index / FIELD_SIZE[0])]);
      if (!next) { ctx.sfx('wrong'); return ctx.say(T.fieldWrong); }
      ctx.setFlag('field_positions', next); ctx.setFlag('field_selected', null); ctx.sfx('click');
      if (fieldSolved(level, next)) {
        const nextRound = round() + 1; ctx.setFlag('field_round', nextRound);
        if (nextRound === FIELD_LEVELS.length) {
          ctx.setFlag('field_solved'); refresh(ctx);
          await ctx.give('tomato', { from: W.field }); await ctx.give('cucumber', { from: W.field });
          ctx.achieve('p5_harvest');
        } else { ctx.setFlag('field_positions', null); ctx.say(T.fieldNext); }
      }
      refresh(ctx);
    },
  }));
  define(ctx, 'p5_field_reset', ['p5_field'], W.field.userData.reset, {
    when: () => !ctx.flag('field_solved'), onClick: () => { ctx.setFlag('field_positions', null); ctx.setFlag('field_selected', null); refresh(ctx); },
  });
}

function setupThreads(ctx) {
  const stage = () => Math.min(count(ctx, 'constellation_stage'), THREAD_LEVELS.length - 1);
  W.constellation.userData.dots.forEach((dot, index) => define(ctx, `p5_thread_dot_${index}`, ['p5_constellation'], dot, {
    when: () => !ctx.flag('constellation_solved') && index < THREAD_LEVELS[stage()].dots.length,
    onClick: () => {
      const selected = ctx.flag('constellation_selected');
      if (!Number.isInteger(selected)) ctx.setFlag('constellation_selected', index);
      else {
        ctx.setFlag('constellation_selected', null);
        if (selected !== index) {
          const level = THREAD_LEVELS[stage()], next = toggleThread(level, ctx.flag('constellation_edges') || [], selected, index);
          if (!next) { ctx.sfx('wrong'); ctx.say(T.threadWrong); }
          else {
            ctx.setFlag('constellation_edges', next); ctx.sfx('click');
            if (threadSolved(level, next)) {
              const nextStage = stage() + 1; ctx.setFlag('constellation_stage', nextStage);
              if (nextStage === THREAD_LEVELS.length) { ctx.setFlag('constellation_solved'); ctx.achieve('perfect_constellation'); ctx.say(T.threadDone); }
              else { ctx.setFlag('constellation_edges', []); ctx.say(T.threadNext); }
            }
          }
        }
      }
      refresh(ctx);
    },
  }));
  define(ctx, 'p5_thread_reset', ['p5_constellation'], W.constellation.userData.reset, {
    when: () => !ctx.flag('constellation_solved'), onClick: () => { ctx.setFlag('constellation_edges', []); ctx.setFlag('constellation_selected', null); refresh(ctx); },
  });
}

function setupKitchen(ctx) {
  // 把食材放上砧板，奶奶举刀剁三下（原作 6:20），每剁一下砧板上的食材换一个样子，最后成品飞进物品栏
  const process = (input, output, flag) => async () => {
    if (!ctx.state.has('knife')) { ctx.state.select(null); return ctx.say(T.needKnife); }
    if (ctx.flag(flag)) return;
    await ctx.cutscene(async () => {
      ctx.take(input); W.cutboard.beginCut(input);
      for (let n = 1; n <= 3; n++) {
        const swing = W.grandmotherRig.chop?.() || ctx.wait(900);
        await ctx.wait(330); W.cutboard.cut(n); ctx.sfx('cut'); await swing;
      }
      ctx.setFlag(flag);
      await ctx.give(output, { from: W.cutboard.userData.stage });
      W.cutboard.clearStage(); refresh(ctx);
    });
  };
  const cutting = {
    raw_meat: process('raw_meat', 'ground_meat', 'meat_ground'),
    tomato: process('tomato', 'tomato_slice', 'tomato_cut'),
    cucumber: process('cucumber', 'cucumber_slice', 'cucumber_cut'),
  };
  define(ctx, 'p5_grandmother', ['p5_kitchen'], W.grandmother, { cursor: 'talk', onClick: () => ctx.say(T.grandmother), onItem: cutting });
  define(ctx, 'p5_cutboard', ['p5_cutboard'], W.cutboard, { cursor: 'use', onClick: () => ctx.say(T.cutboard), onItem: cutting });
  const menu = () => ctx.ui.doc({ envelope: false, hint: '按顺序由下往上叠放。', pages: [{ lines: T.menu }] });
  define(ctx, 'p5_menu', ['p5_menu'], W.menu, { cursor: 'zoom', onClick: menu });
  define(ctx, 'p5_dining_menu', ['p5_dining'], W.diningMenu, { cursor: 'zoom', onClick: menu });
  define(ctx, 'p5_pot', ['p5_pot'], W.pot, {
    cursor: 'use', onItem: { ground_meat: () => {
      if (ctx.flag('pot_loaded')) return;
      ctx.take('ground_meat'); ctx.setFlag('pot_loaded'); refresh(ctx); ctx.say(T.panLoaded);
    } }, onClick: async () => {
      if (!ctx.flag('pot_loaded')) return ctx.say(T.panEmpty);
      if (ctx.flag('patty_taken')) return ctx.say(T.panDone);
      await ctx.cutscene(async () => {
        if (!ctx.flag('pot_cooked')) { await ctx.wait(600); ctx.setFlag('pot_cooked'); refresh(ctx); }
        if (await ctx.give('cooked_meat', { from: W.pot })) ctx.setFlag('patty_taken');
        refresh(ctx);
      });
    },
  });
}

function setupDining(ctx) {
  define(ctx, 'p5_buns', ['p5_table'], W.bunTop, { cursor: 'grab', when: () => !ctx.flag('buns_taken'), onClick: async () => {
    await ctx.give('bun_bottom', { from: W.bunBottom }); await ctx.give('bun_top', { from: W.bunTop }); ctx.setFlag('buns_taken'); refresh(ctx);
  } });
  const onItem = Object.fromEntries(BURGER_ORDER.map((id) => [id, () => {
    const layers = ctx.flag('burger_layers') || [];
    if (id !== BURGER_ORDER[layers.length]) { ctx.sfx('wrong'); ctx.state.select(null); return ctx.say(T.burgerWrong); }
    ctx.take(id); const next = [...layers, id]; ctx.setFlag('burger_layers', next);
    if (next.length === BURGER_ORDER.length) ctx.setFlag('burger_complete');
    refresh(ctx); ctx.sfx('click');
  }]));
  define(ctx, 'p5_plate', ['p5_table'], W.plate, { cursor: 'use', when: () => !ctx.flag('burger_complete'), onClick: () => ctx.say(T.plate), onItem });
  pickup(ctx, 'p5_burger_pickup', ['p5_table'], W.burger, 'burger', 'burger_taken', () => !!ctx.flag('burger_complete'));
  define(ctx, 'p5_gerard', ['p5_dining'], W.gerard, {
    cursor: 'talk', when: () => !ctx.flag('gerard_fed'), onClick: () => ctx.say(T.gerard),
    onItem: { burger: () => ctx.cutscene(async () => {
      // 原作 17:36：Gerard 双手捧起汉堡大口吃完，然后去了厕所
      ctx.take('burger');
      const burger = makeProp('p5_burger'); burger.setLayers?.(BURGER_ORDER);
      await W.gerardRig.eatBurger(burger);
      ctx.setFlag('gerard_fed'); refresh(ctx); await ctx.say(T.gerardFed);
    }) },
  });
  define(ctx, 'p5_father', ['p5_dining'], W.father, { cursor: 'talk', onClick: () => ctx.say(T.father) });
  define(ctx, 'p5_memory_disk', ['p5_toilet'], W.disk, { cursor: 'zoom', onClick: async () => {
    if (!ctx.flag('gerard_fed')) return ctx.say(T.toiletLocked);
    if (!ctx.flag('constellation_solved')) return ctx.say(T.diskLocked);
    ctx.setFlag('memory_seen'); refresh(ctx); await ctx.go('p5_memory');
  } });
  pickup(ctx, 'p5_black_cube', ['p5_memory'], W.cube, 'black_cube', 'cube_taken', () => !!ctx.flag('memory_seen'));
}

function setupTemple(ctx) {
  define(ctx, 'p5_holder', ['p5_altar'], W.holder, {
    onClick: async () => {
      if (!ctx.flag('holder_cube')) {
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
  define(ctx, 'p5_font', ['p5_altar'], W.font, {
    when: () => !!ctx.flag('holder_closed') && !ctx.flag('holder_lowered'), onClick: async () => {
      await W.font.showReflection(); ctx.setFlag('reflection_seen'); ctx.say(T.reflection); refresh(ctx);
    },
  });
  define(ctx, 'p5_painting', ['p5_painting'], W.painting, {
    when: () => !!ctx.flag('font_lit') && !ctx.flag('plague5_complete'), onClick: () => ctx.cutscene(async () => {
      if (!ctx.flag('painting_lit')) { await W.painting.glowCube(); ctx.setFlag('painting_lit'); }
      else if (!ctx.flag('plague_cleared')) { await W.painting.clearPlague(); ctx.setFlag('plague_cleared'); }
      else { await W.painting.frameBoils(); ctx.setFlag('boils_framed'); ctx.setFlag('plague5_complete'); }
      refresh(ctx);
      if (ctx.flag('plague5_complete')) await ctx.ui.ending(T.ending);
    }),
  });
}

export function setup(ctx) {
  setupCow(ctx); setupField(ctx); setupThreads(ctx); setupKitchen(ctx); setupDining(ctx); setupTemple(ctx);
}

export const walkthrough = [
  { click: 'p5_overview_island' }, { click: 'p5_lettuce' }, { click: 'p5_cow_zoom' }, { click: 'p5_cow_skin' },
  ...[0, 6, 1, 8, 2, 5, 3, 9, 4, 7].map((index) => ({ click: `p5_skin_dot_${index}` })),
  { expectFlag: 'cow_cured' }, { back: true }, { back: true },
  { go: 'p5_forest' }, { click: 'p5_bucket' }, { click: 'p5_field_entry' },
  ...FIELD_LEVELS.flatMap((level) => level.solution.flatMap(([x, y], index) => [{ click: `p5_field_tray_${index}` }, { click: `p5_field_cell_${y * FIELD_SIZE[0] + x}` }])),
  { expectFlag: 'field_solved' }, { back: true }, { click: 'p5_constellation_entry' },
  ...THREAD_LEVELS.flatMap((level) => level.edges.flatMap(([a, b]) => [{ click: `p5_thread_dot_${a}` }, { click: `p5_thread_dot_${b}` }])),
  { expectFlag: 'constellation_solved' }, { back: true }, { go: 'p5_house' }, { click: 'p5_house_entry' }, { click: 'p5_knife' },
  { go: 'p5_gate' }, { click: 'p5_cow_zoom' }, { use: 'knife', on: 'p5_cow_resource' }, { use: 'empty_bucket', on: 'p5_cow_resource' },
  { back: true }, { go: 'p5_forest' }, { click: 'p5_barrel_zoom' }, { use: 'milk_bucket', on: 'p5_barrel' }, { click: 'p5_barrel' },
  { back: true }, { go: 'p5_house' }, { click: 'p5_house_entry' }, { click: 'p5_cutboard_zoom' },
  { use: 'raw_meat', on: 'p5_cutboard' }, { use: 'tomato', on: 'p5_cutboard' }, { use: 'cucumber', on: 'p5_cutboard' },
  { back: true }, { click: 'p5_pot_zoom' }, { use: 'ground_meat', on: 'p5_pot' }, { click: 'p5_pot' },
  { back: true }, { click: 'p5_dining_entry' }, { click: 'p5_dining_menu' }, { click: 'p5_plate_zoom' }, { click: 'p5_buns' },
  ...BURGER_ORDER.map((id) => ({ use: id, on: 'p5_plate' })),
  { expectFlag: 'burger_complete' }, { click: 'p5_burger_pickup' }, { back: true }, { use: 'burger', on: 'p5_gerard' },
  { back: true }, { click: 'p5_kitchen_exit' }, { click: 'p5_toilet_entry' }, { click: 'p5_memory_disk' }, { click: 'p5_black_cube' },
  { expectFlag: 'cube_taken' }, { back: true }, { back: true }, { go: 'p5_temple' }, { click: 'p5_temple_entry' },
  { click: 'p5_altar_entry' }, { click: 'p5_holder' }, { use: 'black_cube', on: 'p5_holder' }, { click: 'p5_font' }, { click: 'p5_holder' },
  { click: 'p5_painting_entry' }, { click: 'p5_painting' }, { click: 'p5_painting' }, { click: 'p5_painting' }, { expectFlag: 'plague5_complete' },
];
