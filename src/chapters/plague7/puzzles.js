// 点击、物品使用和自动通关共用规则；任何进度都先存进 flags，再由 sync 刷新模型。
import { W, sync as refresh, skateRound, iceRound } from './world.js';
import { rinkPos } from '../../art/props_p7.js';
import { T } from './text.js';
import {
  ICE_LEVELS, ICE_SOLUTIONS, pressIce, iceSolved, iceSolvable,
  SKATE_LEVELS, slide, directionTo, skateSolve, skateDone,
  SNOWMAN_PARTS, DIAMONDS,
} from './rules.js';

const define = (ctx, id, views, object, rest) => ctx.hotspots.define({ id, views, object, cursor: 'pointer', ...rest });

function pickup(ctx, id, views, object, item, flag, when = () => true, after = null) {
  define(ctx, id, views, object, { cursor: 'grab', when: () => when() && !ctx.flag(flag), onClick: async () => {
    if (await ctx.give(item, { from: object })) { ctx.setFlag(flag); after?.(); refresh(ctx); }
  } });
}

// Gerard 的思考气泡：画一支甜筒（第二次是绿色的）
const coneBubble = (green) => (g, w, h) => {
  g.strokeStyle = '#fff'; g.lineWidth = Math.max(2, w * 0.05); g.fillStyle = green ? '#9cc070' : '#efa8b4';
  g.beginPath(); g.arc(w / 2, h * 0.36, w * 0.17, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(w * 0.36, h * 0.44); g.lineTo(w / 2, h * 0.86); g.lineTo(w * 0.64, h * 0.44); g.closePath(); g.stroke();
};

function setupSkate(ctx) {
  W.rink.userData.cells.forEach((cell) => {
    const [x, y] = cell.userData.cell;
    define(ctx, `p7_rink_${x}_${y}`, ['p7_skate'], cell, {
      when: () => !ctx.flag('skate_done'),
      onClick: () => ctx.cutscene(async () => {
        const level = SKATE_LEVELS[skateRound(ctx)], pos = ctx.flag('skate_pos') || level.start;
        const dir = directionTo(pos, [x, y]);
        if (!dir) return ctx.say(T.skateWrongDir);
        const next = slide(level, pos, dir);
        const from = W.skater.position.clone(), to = rinkPos(next), steps = Math.abs(next[0] - pos[0]) + Math.abs(next[1] - pos[1]);
        if (steps) { ctx.sfx('whoosh'); await ctx.animate(140 * steps + 120, (k) => W.skater.position.set(from.x + (to[0] - from.x) * k, 0, from.z + (to[2] - from.z) * k), ctx.Ease.outSine); }
        ctx.setFlag('skate_pos', next);
        if (skateDone(level, next)) {
          const round = skateRound(ctx) + 1;
          if (round >= SKATE_LEVELS.length) { ctx.setFlag('skate_done'); ctx.sfx('stinger'); refresh(ctx); await ctx.say(T.skateDone); return; }
          ctx.setFlag('skate_round', round); ctx.setFlag('skate_pos', null); ctx.sfx('click'); refresh(ctx); await ctx.say(T.skateNext);
        }
      }),
    });
  });
  pickup(ctx, 'p7_rink_carrot', ['p7_skate'], W.rink.userData.carrot, 'carrot', 'carrot_taken', () => !!ctx.flag('skate_done'));
  define(ctx, 'p7_caroline_talk', ['p7_skate'], W.skaterRig.parts.body, { cursor: 'talk', when: () => false, onClick: () => ctx.say(T.caroline) });
}

function setupForest(ctx) {
  pickup(ctx, 'p7_scarf', ['p7_forest'], W.scarfBranch.userData.scarf, 'scarf', 'scarf_taken');
  pickup(ctx, 'p7_branches', ['p7_forest'], W.branches, 'branches', 'branches_taken');
  define(ctx, 'p7_vase', ['p7_forest'], W.vase, {
    cursor: 'use',
    when: () => !ctx.flag('stones_taken'),
    onClick: async () => {
      if (!ctx.flag('vase_broken')) return ctx.say(T.vase);
      if (await ctx.give('stones', { from: W.vase })) { ctx.setFlag('stones_taken'); refresh(ctx); }
    },
    onItem: { hammer: () => { if (ctx.flag('vase_broken')) return; ctx.setFlag('vase_broken'); ctx.sfx('chop'); refresh(ctx); ctx.say(T.vaseBroken); } },
  });
  define(ctx, 'p7_squirrel_tree', ['p7_squirrel'], W.squirrel.userData.trunk, {
    cursor: 'use', when: () => !ctx.flag('squirrel_dead'), onClick: () => ctx.say(T.squirrel),
    onItem: { hammer: () => ctx.cutscene(async () => {
      ctx.sfx('chop'); await ctx.wait(300);
      ctx.setFlag('squirrel_dead'); ctx.sfx('splash'); refresh(ctx); await ctx.say(T.squirrelHit);
    }) },
  });
  define(ctx, 'p7_squirrel', ['p7_squirrel'], W.squirrel.userData.squirrel, {
    cursor: 'grab', when: () => !ctx.flag('pistachio_taken'),
    onClick: async () => {
      if (!ctx.flag('squirrel_dead')) return ctx.say(T.squirrel);
      ctx.setFlag('pistachio_taken'); refresh(ctx);
      await ctx.give('pistachio', { from: W.squirrel.userData.squirrel });
      if (await ctx.give('squirrel_fur', { from: W.squirrel.userData.squirrel })) ctx.setFlag('fur_taken');
    },
  });
}

function setupIcePool(ctx) {
  const cells = () => ctx.flag('icepool_cells') || ICE_LEVELS[iceRound(ctx)];
  W.icepool.userData.cells.forEach((row, y) => row.forEach((cell, x) => define(ctx, `p7_ice_${x}_${y}`, ['p7_icepool'], cell, {
    when: () => !ctx.flag('icepool_done') && ((ICE_LEVELS[iceRound(ctx)][y] || '')[x] || '.') !== '.',
    onClick: async () => {
      const grid = cells(), c = (grid[y] || '')[x], sel = ctx.flag('icepool_selected');
      if (c === 'S') { ctx.setFlag('icepool_selected', Array.isArray(sel) && sel[0] === x && sel[1] === y ? null : [x, y]); ctx.sfx('click'); return refresh(ctx); }
      if (c !== 'L' || !Array.isArray(sel)) return;
      const next = pressIce(grid, sel, [x, y]);
      ctx.setFlag('icepool_selected', null);
      if (!next) { ctx.sfx('wrong'); refresh(ctx); return ctx.say(T.iceWrong); }
      ctx.setFlag('icepool_cells', next); ctx.sfx('squish');
      if (iceSolved(next)) {
        const round = iceRound(ctx) + 1;
        if (round >= ICE_LEVELS.length) { ctx.setFlag('icepool_done'); refresh(ctx); await ctx.say(T.iceDone); return; }
        ctx.setFlag('icepool_round', round); ctx.setFlag('icepool_cells', null); refresh(ctx); await ctx.say(T.iceNext); return;
      }
      refresh(ctx);
      if (!iceSolvable(next)) ctx.say(T.iceStuck);
    },
  })));
  define(ctx, 'p7_ice_reset', ['p7_icepool'], W.icepool.userData.reset, {
    when: () => !ctx.flag('icepool_done'), onClick: () => { ctx.setFlag('icepool_cells', null); ctx.setFlag('icepool_selected', null); ctx.sfx('click'); refresh(ctx); },
  });
  pickup(ctx, 'p7_ice_diamond', ['p7_icepool'], W.icepool.userData.gem, 'diamond_ice', 'diamond_ice_taken', () => !!ctx.flag('icepool_done'));
}

function setupSnowman(ctx) {
  const add = (part) => () => {
    const parts = ctx.flag('snowman_parts') || [];
    if (parts.includes(part) || ctx.flag('snowman_alive')) return;
    const next = [...parts, part];
    ctx.take(part); ctx.setFlag('snowman_parts', next); ctx.sfx('squish'); refresh(ctx);
    if (SNOWMAN_PARTS.every((p) => next.includes(p))) return ctx.cutscene(async () => {
      await ctx.wait(400); ctx.setFlag('snowman_alive'); ctx.sfx('stinger'); refresh(ctx);
      ctx.achieve('p7_snowman');
      await ctx.say(T.snowmanFace); await ctx.say(T.snowmanAlive);
    });
  };
  define(ctx, 'p7_snowman', ['p7_snowman'], W.snowman, {
    cursor: 'use', onClick: () => ctx.say(ctx.flag('snowman_alive') ? T.snowmanAlive : T.snowman),
    onItem: Object.fromEntries(SNOWMAN_PARTS.map((p) => [p, add(p)])),
  });
  pickup(ctx, 'p7_diamond_snow', ['p7_snowman', 'p7_grove'], W.snowDiamond, 'diamond_snow', 'diamond_snow_taken', () => !!ctx.flag('snowman_alive'));
}

function setupHouse(ctx) {
  pickup(ctx, 'p7_horn', ['p7_house'], W.skullPile.userData.horn, 'horn', 'horn_taken');
  pickup(ctx, 'p7_stake', ['p7_house'], W.woodpile.userData.stake, 'stake', 'stake_taken');
  pickup(ctx, 'p7_strawberry', ['p7_dome'], W.dome.userData.berries, 'strawberry', 'strawberry_taken');
  define(ctx, 'p7_picture', ['p7_room'], W.picture, { cursor: 'zoom', onClick: () => ctx.say(T.hintPicture) });
  // 桌子：牛角敲冰锥 → 碎冰落进木桶 → 点木桶倒扣成雪球 → 草莓 / 开心果用在雪球上
  define(ctx, 'p7_icicle', ['p7_table'], W.table.userData.icicles, {
    cursor: 'use', when: () => (Number(ctx.flag('icicles_used')) || 0) < 3, onClick: () => ctx.say(T.icicle),
    onItem: { horn: () => {
      if (ctx.flag('bucket_ice') || ctx.flag('snowball')) return ctx.say(ctx.flag('snowball') ? T.snowball : T.bucketIce);
      ctx.setFlag('icicles_used', (Number(ctx.flag('icicles_used')) || 0) + 1); ctx.setFlag('bucket_ice'); ctx.sfx('chop'); refresh(ctx); ctx.say(T.bucketIce);
    } },
  });
  define(ctx, 'p7_bucket', ['p7_table'], W.table.userData.bucket, {
    cursor: 'use', onClick: () => {
      if (!ctx.flag('bucket_ice')) return ctx.say(T.bucketEmpty);
      ctx.setFlag('bucket_ice', false); ctx.setFlag('snowball'); ctx.sfx('squish'); refresh(ctx); ctx.say(T.snowball);
    },
  });
  const flavour = (item, made, product) => async () => {
    if (ctx.flag(made)) return;
    ctx.take(item); ctx.setFlag('snowball', false); ctx.setFlag(made); refresh(ctx);
    await ctx.give(product, { from: W.table.userData.snowball }); ctx.say(T.iceCreamMade);
  };
  define(ctx, 'p7_snowball', ['p7_table'], W.table.userData.snowball, {
    cursor: 'use', when: () => !!ctx.flag('snowball'), onClick: () => ctx.say(T.snowball),
    onItem: { strawberry: flavour('strawberry', 'ice_cream_1_made', 'ice_cream_strawberry'), pistachio: flavour('pistachio', 'ice_cream_2_made', 'ice_cream_pistachio') },
  });
  // Gerard：先吃草莓，再吃开心果，然后把帽子给你
  const head = W.gerardRig.parts.head;
  define(ctx, 'p7_gerard', ['p7_gerard'], W.gerardRig.parts.body, {
    cursor: 'talk',
    onClick: async () => {
      if (ctx.flag('gerard_ate_2')) return ctx.say(T.gerardIdle);
      await ctx.ui.thought(head, null, { draw: coneBubble(!!ctx.flag('gerard_ate_1')) });
      ctx.say(ctx.flag('gerard_ate_1') ? T.gerardWantsGreen : T.gerard);
    },
    onItem: {
      ice_cream_strawberry: () => ctx.cutscene(async () => {
        if (ctx.flag('gerard_ate_1')) { ctx.state.select(null); return ctx.say(T.gerardWrong); }
        ctx.take('ice_cream_strawberry'); ctx.sfx('drink'); ctx.setFlag('gerard_ate_1'); refresh(ctx);
        await ctx.ui.thought(head, null, { draw: coneBubble(true) }); await ctx.say(T.gerardWantsGreen);
      }),
      ice_cream_pistachio: () => ctx.cutscene(async () => {
        if (!ctx.flag('gerard_ate_1') || ctx.flag('gerard_ate_2')) { ctx.state.select(null); return ctx.say(T.gerardWrong); }
        ctx.take('ice_cream_pistachio'); ctx.sfx('drink'); ctx.setFlag('gerard_ate_2'); ctx.achieve('p7_ice_cream');
        await ctx.say(T.gerardDone);
        if (await ctx.give('hat', { from: head })) ctx.setFlag('hat_taken');
        refresh(ctx);
      }),
    },
  });
  // 雪景球机器：三颗钻石任意顺序
  define(ctx, 'p7_machine', ['p7_machine'], W.machine, {
    cursor: 'use', when: () => (ctx.flag('machine_diamonds') || []).length < 3, onClick: () => ctx.say(T.machine),
    onItem: Object.fromEntries(DIAMONDS.map((d) => [d, () => {
      const list = ctx.flag('machine_diamonds') || [];
      if (list.includes(d)) return;
      const next = [...list, d]; ctx.take(d); ctx.setFlag('machine_diamonds', next); ctx.sfx('click'); refresh(ctx);
      if (next.length === 3) { ctx.achieve('p7_three_diamonds'); ctx.sfx('holy'); ctx.say(T.machineFull); }
    }])),
  });
  pickup(ctx, 'p7_ball', ['p7_machine'], W.machine.userData.ball, 'crystal_ball', 'ball_taken', () => (ctx.flag('machine_diamonds') || []).length >= 3);
}

function setupLake(ctx) {
  define(ctx, 'p7_iceblock', ['p7_iceblock'], W.iceblock, {
    cursor: 'use', when: () => !ctx.flag('youth_free'), onClick: () => ctx.say(ctx.flag('ice_cracked') ? T.iceCrack1 : T.iceBlock),
    onItem: {
      stake: () => { if (ctx.flag('ice_cracked')) return; ctx.take('stake'); ctx.setFlag('ice_cracked'); ctx.sfx('nail'); refresh(ctx); ctx.say(T.iceCrack1); },
      hammer: () => ctx.cutscene(async () => {
        if (!ctx.flag('ice_cracked')) { ctx.state.select(null); return ctx.say(T.iceNeedStake); }
        ctx.sfx('chop'); ctx.setFlag('youth_free'); refresh(ctx);
        await ctx.say(T.iceFree); await ctx.say(T.youthCold);
      }),
    },
  });
  define(ctx, 'p7_youth', ['p7_iceblock'], W.youthRig.parts.body, {
    cursor: 'talk', when: () => !!ctx.flag('youth_free') && !ctx.flag('diamond_youth_taken'), onClick: () => ctx.say(T.youthCold),
    onItem: { squirrel_fur: () => ctx.cutscene(async () => {
      ctx.take('squirrel_fur'); ctx.setFlag('youth_warm'); refresh(ctx); await ctx.say(T.youthWarm);
      if (await ctx.give('diamond_youth', { from: W.youth })) ctx.setFlag('diamond_youth_taken');
    }) },
  });
}

function setupTemple(ctx) {
  pickup(ctx, 'p7_hammer', ['p7_temple_int'], W.templeHammer, 'hammer', 'hammer_taken');
  define(ctx, 'p7_font_ball', ['p7_altar', 'p7_temple_int'], W.font, {
    cursor: 'use', when: () => !ctx.flag('ball_placed'), onClick: () => ctx.say(T.templeHint),
    onItem: { crystal_ball: () => ctx.cutscene(async () => {
      ctx.take('crystal_ball'); ctx.setFlag('ball_placed'); ctx.sfx('holy');
      await ctx.ui.flash('#ffffff', 500);
      W.cage.visible = true; W.cage.position.y = 4.2; W.kneeler.visible = W.deer.visible = true;
      await ctx.animate(1600, (k) => { W.cage.position.y = 4.2 - 3.6 * k; }, ctx.Ease.inOutSine);
      await ctx.say(T.cageDeer); await ctx.say(T.cageCaroline);
      await ctx.animate(1400, (k) => { W.cage.position.y = 0.6 + 3.6 * k; }, ctx.Ease.inOutSine);
      ctx.setFlag('cage_seen'); refresh(ctx); await ctx.say(T.cageCube);
    }) },
  });
  pickup(ctx, 'p7_cube', ['p7_altar', 'p7_temple_int'], W.cube, 'black_cube', 'cube_taken', () => !!ctx.flag('cage_seen'));
  define(ctx, 'p7_holder', ['p7_altar'], W.holder, {
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
  define(ctx, 'p7_font', ['p7_altar'], W.font, {
    when: () => !!ctx.flag('holder_closed') && !ctx.flag('holder_lowered'), onClick: async () => {
      await W.font.showReflection(); ctx.setFlag('reflection_seen'); ctx.say(T.reflection); refresh(ctx);
    },
  });
  define(ctx, 'p7_painting', ['p7_painting'], W.painting, {
    when: () => !!ctx.flag('font_lit') && !ctx.flag('plague7_complete'), onClick: () => ctx.cutscene(async () => {
      if (!ctx.flag('painting_lit')) { await W.painting.glowCube(); ctx.setFlag('painting_lit'); }
      else if (!ctx.flag('plague_cleared')) { await W.painting.clearPlague(); ctx.setFlag('plague_cleared'); }
      else { await W.painting.frameNext(); ctx.setFlag('next_framed'); ctx.setFlag('plague7_complete'); }
      refresh(ctx);
      if (ctx.flag('plague7_complete')) await ctx.ui.ending(T.ending);
    }),
  });
}

export function setup(ctx) {
  setupSkate(ctx); setupForest(ctx); setupIcePool(ctx); setupSnowman(ctx); setupHouse(ctx); setupLake(ctx); setupTemple(ctx);
}

// 自动通关：滑冰按 BFS 最短路线点“滑到的那一格”；冰池按示例解点“立冰、平冰”
function skateClicks() {
  const out = [];
  for (const level of SKATE_LEVELS) {
    let p = level.start;
    for (const dir of skateSolve(level)) { p = slide(level, p, dir); out.push({ click: `p7_rink_${p[0]}_${p[1]}` }); }
  }
  return out;
}
const iceClicks = () => ICE_SOLUTIONS.flatMap((sol) => sol.flatMap(([a, b]) => [{ click: `p7_ice_${a[0]}_${a[1]}` }, { click: `p7_ice_${b[0]}_${b[1]}` }]));

export const walkthrough = [
  { click: 'p7_overview_island' }, { click: 'p7_caroline' }, ...skateClicks(), { expectFlag: 'skate_done' }, { click: 'p7_rink_carrot' }, { back: true },
  { go: 'p7_forest' }, { click: 'p7_scarf' }, { click: 'p7_branches' },
  { go: 'p7_temple' }, { click: 'p7_temple_entry' }, { click: 'p7_hammer' }, { back: true },
  { go: 'p7_forest' }, { use: 'hammer', on: 'p7_vase' }, { click: 'p7_vase' },
  { click: 'p7_squirrel_zoom' }, { use: 'hammer', on: 'p7_squirrel_tree' }, { click: 'p7_squirrel' }, { expectItem: ['pistachio', 'squirrel_fur'] }, { back: true },
  { go: 'p7_grove' }, { click: 'p7_icepool_zoom' }, ...iceClicks(), { expectFlag: 'icepool_done' }, { click: 'p7_ice_diamond' }, { back: true },
  { go: 'p7_house' }, { click: 'p7_horn' }, { click: 'p7_stake' }, { click: 'p7_house_entry' },
  { click: 'p7_picture' }, { click: 'p7_dome_zoom' }, { click: 'p7_strawberry' }, { back: true },
  { click: 'p7_table_zoom' }, { use: 'horn', on: 'p7_icicle' }, { click: 'p7_bucket' }, { use: 'strawberry', on: 'p7_snowball' }, { back: true },
  { click: 'p7_gerard_zoom' }, { click: 'p7_gerard' }, { use: 'ice_cream_strawberry', on: 'p7_gerard' }, { back: true },
  { click: 'p7_table_zoom' }, { use: 'horn', on: 'p7_icicle' }, { click: 'p7_bucket' }, { use: 'pistachio', on: 'p7_snowball' }, { back: true },
  { click: 'p7_gerard_zoom' }, { use: 'ice_cream_pistachio', on: 'p7_gerard' }, { expectFlag: 'hat_taken' }, { back: true },
  { go: 'p7_grove' }, { click: 'p7_snowman_zoom' }, ...['scarf', 'hat', 'branches', 'stones', 'carrot'].map((p) => ({ use: p, on: 'p7_snowman' })),
  { expectFlag: 'snowman_alive' }, { click: 'p7_diamond_snow' }, { back: true },
  { go: 'p7_lake' }, { click: 'p7_iceblock_zoom' }, { use: 'stake', on: 'p7_iceblock' }, { use: 'hammer', on: 'p7_iceblock' },
  { use: 'squirrel_fur', on: 'p7_youth' }, { expectItem: 'diamond_youth' }, { back: true },
  { go: 'p7_house' }, { click: 'p7_house_entry' }, { click: 'p7_machine_zoom' },
  ...DIAMONDS.map((d) => ({ use: d, on: 'p7_machine' })), { click: 'p7_ball' }, { back: true },
  { go: 'p7_temple' }, { click: 'p7_temple_entry' }, { click: 'p7_altar_entry' }, { use: 'crystal_ball', on: 'p7_font_ball' }, { click: 'p7_cube' },
  { click: 'p7_holder' }, { use: 'black_cube', on: 'p7_holder' }, { click: 'p7_font' }, { click: 'p7_holder' },
  { click: 'p7_painting_entry' }, { click: 'p7_painting' }, { click: 'p7_painting' }, { click: 'p7_painting' },
  { expectFlag: 'plague7_complete' },
];
