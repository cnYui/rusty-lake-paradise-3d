// 所有谜题推进都经过公共热点和库存，模型状态由 sync 幂等恢复。
import { W, SPOTS, sync as syncWorld } from './world.js';
import { CRAB_LEVELS, initialShells, canPlaceShell, traceCrab, windowSolved } from './puzzles.js';
import { label } from '../../art/props_flies.js';
import { T, BOOK_PAGES } from './text.js';

const count = (ctx, key) => Number(ctx.flag(key)) || 0;
const refresh = (ctx) => { syncWorld(ctx); sync(ctx); };
const noItem = (ctx) => ctx.state.select(null);

export function sync(ctx) {
  const loaded = ctx.flag('p4_owl_loaded'), fed = count(ctx, 'p4_owl_count');
  W.owlHeart.visible = !!loaded; W.gem.visible = fed === 3 && !ctx.flag('p4_gem_taken');
  W.owl.setLevel(fed * 4 / 3, { instant: true });
  W.holder.position.fromArray(W.holder.userData.home);
  if (ctx.flag('p4_holder_lowered')) W.holder.position.y -= 1.15;
  const holderState = W.holder.userData.state;
  const inserted = !!ctx.flag('p4_holder_cube');
  holderState.cube = inserted; W.holder.getObjectByName('holder_cube').visible = inserted;
  if (ctx.flag('p4_holder_open') && !ctx.flag('p4_holder_closed')) W.holder.open({ instant: true });
  else W.holder.close({ instant: true });
  if (ctx.flag('p4_reflection_seen')) W.font.showReflection({ instant: true });
  else W.font.hideReflection({ instant: true });
  const rope = ctx.world.root.getObjectByName('temple_int_rope');
  if (rope) rope.setBottom(W.holder.position.y);
}

export function setup(ctx) {
  const hs = (id, views, object, rest) => ctx.hotspots.define({ id, views, object, cursor: 'pointer', ...rest });
  const pickup = (id, views, object, item, flag, when = () => true) => hs(id, views, object, {
    cursor: 'grab', when: () => when() && !ctx.flag(flag), onClick: async () => {
      if (await ctx.give(item, { from: object })) { ctx.setFlag(flag); refresh(ctx); }
    },
  });
  hs('cocoon_hatch', ['cocoon'], W.cocoon, { when: () => !ctx.flag('p4_fly_awake'), onClick: async () => {
    await ctx.cutscene(async () => {
      ctx.sfx('crack'); W.fly.visible = true; W.fly.position.set(-5.5, 0.8, 17.2);
      await ctx.animate(1500, (k) => { W.cocoon.setOpen(k > 0.25); W.fly.position.y = 0.8 + k * 2; });
      ctx.setFlag('p4_fly_awake'); refresh(ctx);
    });
    await ctx.say(T.cocoon);
  } });
  hs('grandmother', ['house_int'], W.grandmother, { cursor: 'talk', onClick: () => ctx.say(T.grandmother) });
  pickup('candle', ['house_int'], W.candle, 'candle', 'p4_candle_taken');
  hs('chest', ['house_int'], W.chest, { when: () => !ctx.flag('p4_chest_open'), onClick: () => {
    ctx.sfx('lid'); ctx.setFlag('p4_chest_open'); refresh(ctx);
  } });
  pickup('carrot', ['house_int'], W.carrot, 'carrot', 'p4_carrot_taken', () => !!ctx.flag('p4_chest_open'));
  W.branches.forEach((b, i) => pickup(`branch_${i}`, ['pit'], b, 'branch', `p4_branch_${i}`));
  hs('uncle', ['pit'], W.uncle, { cursor: 'talk', when: () => [0, 1, 2].every((i) => ctx.flag(`p4_branch_${i}`)), onClick: async () => {
    if (!ctx.flag('p4_worm_taken')) {
      await ctx.say(T.uncle);
      if (await ctx.give('worm', { from: W.uncle })) ctx.setFlag('p4_worm_taken');
    } else await ctx.say(T.uncleWaiting);
  }, onItem: { candle: async () => {
    noItem(ctx); ctx.setFlag('p4_card_seen'); ctx.achieve('p4_card');
    await ctx.ui.doc({ envelope: false, hint: '', pages: [{ lines: ['♥　♥　♥', T.card] }] });
  } } });

  hs('rabbit_bait', ['rabbit'], W.rabbitHole, {
    when: () => !ctx.flag('p4_rabbit_lured'), onClick: () => ctx.say(T.rabbit),
    onItem: { carrot: async () => { ctx.take('carrot'); ctx.setFlag('p4_rabbit_lured'); refresh(ctx); ctx.sfx('rustle'); } },
  });
  hs('bird_trap', ['trap'], W.trap, {
    when: () => !ctx.flag('p4_bird_eaten'), onClick: () => ctx.say(T.trap),
    onItem: {
      branch: async () => { if (ctx.flag('p4_trap_propped')) { noItem(ctx); return; } ctx.take('branch'); ctx.setFlag('p4_trap_propped'); refresh(ctx); },
      worm: async () => { if (ctx.flag('p4_trap_baited')) { noItem(ctx); return; } ctx.take('worm'); ctx.setFlag('p4_trap_baited'); refresh(ctx); },
    },
  });
  hs('crab_feast_zoom', ['lake_shore'], W.freeCrab, { cursor: 'zoom', goto: 'crab_feast', when: () => count(ctx, 'p4_crab_round') === 3 && !ctx.flag('p4_crab_eaten') });
  for (const id of ['crab', 'rabbit', 'bird']) {
    const view = { crab: 'crab_feast', rabbit: 'rabbit', bird: 'trap' }[id];
    const prey = { crab: W.freeCrab, rabbit: W.rabbit, bird: W.bird }[id];
    const ready = () => ctx.flag('p4_fly_awake') && !ctx.flag(`p4_${id}_eaten`) && (
      id === 'crab' ? count(ctx, 'p4_crab_round') === 3 : id === 'rabbit' ? ctx.flag('p4_crab_eaten') && ctx.flag('p4_rabbit_lured')
        : ctx.flag('p4_rabbit_eaten') && ctx.flag('p4_trap_propped') && ctx.flag('p4_trap_baited'));
    hs(`${id}_meal`, [view], prey, { when: ready, onClick: async () => {
      await ctx.cutscene(async () => {
        const start = W.fly.position.clone(), target = prey.position.clone(); target.y += 0.35;
        ctx.sfx('wing');
        await ctx.animate(1000, (k) => { W.fly.position.lerpVectors(start, target, k); });
        ctx.sfx('squish'); await ctx.wait(450);
        ctx.setFlag(`p4_${id}_eaten`); refresh(ctx);
      });
    } });
    pickup(`${id}_heart`, [view, id === 'crab' ? 'lake_shore' : id === 'rabbit' ? 'pump_clearing' : 'bird_clearing'], W[`${id}Heart`], `${id}_heart`, `p4_${id}_heart_taken`, () => !!ctx.flag(`p4_${id}_eaten`));
  }

  hs('owl_mouth', ['owl'], W.owl.getObjectByName('owl_mouth'), {
    onClick: () => ctx.say(ctx.flag('p4_owl_loaded') ? T.owlLoaded : T.owl),
    onItem: Object.fromEntries(['crab', 'rabbit', 'bird'].map((id) => [`${id}_heart`, async () => {
      if (ctx.flag('p4_owl_loaded') || count(ctx, 'p4_owl_count') >= 3) { noItem(ctx); return; }
      ctx.take(`${id}_heart`); ctx.setFlag('p4_owl_loaded', id); refresh(ctx); ctx.sfx('squish');
    }])),
  });
  for (const side of ['l', 'r']) hs(`owl_wing_${side}`, ['owl'], W.owl.getObjectByName(`owl_wing_${side}`), { onClick: async () => {
    if (count(ctx, 'p4_owl_count') >= 3) return;
    const loaded = ctx.flag('p4_owl_loaded');
    ctx.sfx('wing');
    await W.owl.flap({ crush: !!loaded });
    if (loaded) {
      ctx.setFlag('p4_owl_count', count(ctx, 'p4_owl_count') + 1); ctx.setFlag('p4_owl_loaded', null);
      if (count(ctx, 'p4_owl_count') === 3) { ctx.achieve('p4_hearts'); ctx.sfx('bell'); }
    }
    refresh(ctx);
  } });
  pickup('owl_gem', ['owl'], W.gem, 'gem', 'p4_gem_taken', () => count(ctx, 'p4_owl_count') === 3);

  hs('stone_door', ['temple_door'], W.stoneDoor, {
    when: () => !ctx.flag('p4_gate_open'), onClick: () => ctx.say(T.gate),
    onItem: { gem: async () => { ctx.take('gem'); ctx.sfx('door'); ctx.setFlag('p4_gate_open'); refresh(ctx); } },
  });
  const door = ctx.world.anchor('temple.door').getWorldPosition(new ctx.THREE.Vector3());
  hs('temple_entry', ['temple_door'], ctx.hotspots.makeProxy(1.6, 2.4, 0.35, [door.x, door.y + 1.2, door.z], ctx.world.zones.exterior), {
    cursor: 'zoom', when: () => !!ctx.flag('p4_gate_open'), goto: 'temple_int',
  });
  hs('father', ['temple_int'], W.father, { cursor: 'talk', when: () => !ctx.flag('p4_father_taken'), onClick: async () => {
    await ctx.say(ctx.flag('p4_father_spoken') ? T.fatherAgain : T.father); ctx.setFlag('p4_father_spoken');
  } });
  hs('book', ['temple_int'], W.book, { onClick: async () => {
    ctx.setFlag('p4_book_read');
    await ctx.ui.doc({ envelope: false, hint: '点左右箭头翻页，记下四个纹章的次序。', pages: BOOK_PAGES.map((p) => ({ lines: [p.title, ...p.lines, p.marks] })) });
  } });
  hs('window_zoom', ['temple_int'], W.window, { cursor: 'zoom', goto: 'window' });
  W.window.dials.forEach((o, i) => hs(`window_dial_${i}`, ['window'], o, { when: () => !ctx.flag('p4_window_open'), onClick: () => {
    const values = [...(ctx.flag('p4_window') || [1, 1, 1, 1])]; values[i] = values[i] % 12 + 1;
    ctx.setFlag('p4_window', values); W.window.setState(values, false); ctx.sfx('click');
  } }));
  const confirm = label('打开窗闩', 0.85, 0.22); confirm.name = 'window_confirm'; confirm.position.set(0, -0.76, 0.11); W.window.add(confirm);
  hs('window_confirm', ['window'], confirm, { when: () => !ctx.flag('p4_window_open'), onClick: async () => {
    if (!windowSolved(ctx.flag('p4_window') || [1, 1, 1, 1])) { ctx.sfx('wrong'); await ctx.say(T.windowWrong); return; }
    await ctx.cutscene(async () => {
      ctx.setFlag('p4_window_open'); refresh(ctx); ctx.sfx('door'); await ctx.go('temple_int');
      W.insideFly.visible = true; const start = W.insideFly.position.clone();
      ctx.sfx('wing');
      await ctx.animate(1700, (k) => { W.insideFly.position.lerpVectors(start, new ctx.THREE.Vector3(398.5, 1.4, -0.6), k); });
      await ctx.animate(1400, (k) => { W.father.position.y = k * 2.4; W.insideFly.position.set(398.5 + k * 2.2, 1.4 + k * 1.3, -0.6 - k * 0.7); });
      ctx.setFlag('p4_father_taken'); refresh(ctx);
    });
    await ctx.go('memory');
  } });
  hs('memory_revisit', ['temple_int'], W.chair, { cursor: 'zoom', when: () => !!ctx.flag('p4_father_taken'), goto: 'memory' });
  const memoryHit = ctx.hotspots.makeProxy(2.4, 2.2, 0.6, [500, 1.1, -0.4], ctx.world.zones.memory);
  hs('memory_scene', ['memory'], memoryHit, { onClick: async () => {
    ctx.setFlag('p4_memory_seen'); ctx.achieve('p4_memory'); await ctx.say(T.memory); refresh(ctx); await ctx.go('temple_int');
  } });
  pickup('black_cube', ['temple_int'], W.cube, 'black_cube', 'p4_cube_taken', () => !!ctx.flag('p4_memory_seen'));
  hs('altar_zoom', ['temple_int'], W.holder, { cursor: 'zoom', when: () => !!ctx.flag('p4_cube_taken'), goto: 'altar' });
  hs('holder', ['altar'], W.holder, { onClick: async () => {
    if (!ctx.flag('p4_holder_cube')) { await W.holder.open(); ctx.setFlag('p4_holder_open'); }
    else if (ctx.flag('p4_reflection_seen') && !ctx.flag('p4_holder_lowered')) {
      const y = W.holder.position.y; await ctx.animate(1100, (k) => { W.holder.position.y = y - 1.15 * k; }); ctx.setFlag('p4_holder_lowered');
    }
    refresh(ctx);
  }, onItem: { black_cube: async () => {
    await W.holder.open(); ctx.setFlag('p4_holder_open'); ctx.take('black_cube');
    await W.holder.insertCube(); ctx.setFlag('p4_holder_cube');
    await W.holder.close(); ctx.setFlag('p4_holder_closed'); refresh(ctx);
  } } });
  hs('font', ['altar'], W.font, { when: () => !!ctx.flag('p4_holder_closed') && !ctx.flag('p4_holder_lowered'), onClick: async () => {
    await W.font.showReflection(); ctx.setFlag('p4_reflection_seen'); await ctx.say(T.reflection);
  } });
  hs('next_plague', ['altar'], W.omen, { when: () => !!ctx.flag('p4_holder_lowered') && !ctx.flag('plague4_complete'), onClick: async () => {
    await ctx.ui.flash('#e7dec0', 500); ctx.setFlag('plague4_complete'); await ctx.ui.ending(T.ending);
  } });

  setupCrab(ctx, hs);
}

function setupCrab(ctx, hs) {
  W.boards.forEach((board, round) => {
    const level = CRAB_LEVELS[round], active = () => count(ctx, 'p4_crab_round') === round;
    const shells = () => ctx.flag('p4_crab_shells') || initialShells(level);
    board.shells.forEach((o, i) => hs(`crab_shell_${round}_${i}`, ['crab_board'], o, { when: active, onClick: () => {
      ctx.setFlag('p4_crab_selected', ctx.flag('p4_crab_selected') === i ? null : i); refresh(ctx);
    } }));
    board.cells.forEach(({ object, cell }) => hs(`crab_cell_${round}_${cell[0]}_${cell[1]}`, ['crab_board'], object, {
      when: () => active() && Number.isInteger(ctx.flag('p4_crab_selected')), onClick: () => {
        const selected = ctx.flag('p4_crab_selected'), positions = shells();
        if (!canPlaceShell(level, positions, selected, cell)) { ctx.sfx('wrong'); return; }
        const next = positions.map((p, i) => i === selected ? [...cell] : [...p]);
        ctx.setFlag('p4_crab_shells', next); ctx.setFlag('p4_crab_selected', null); refresh(ctx); ctx.sfx('click');
      },
    }));
    hs(`crab_reset_${round}`, ['crab_board'], board.reset, { when: active, onClick: () => {
      ctx.setFlag('p4_crab_shells', initialShells(level)); ctx.setFlag('p4_crab_selected', null); refresh(ctx);
    } });
    hs(`crab_start_${round}`, ['crab_board'], board.crab, { when: active, onClick: async () => {
      ctx.setFlag('p4_crab_selected', null);
      const result = traceCrab(level, shells());
      await ctx.cutscene(async () => {
        for (let i = 1; i < result.path.length; i++) {
          const start = board.crab.position.clone(), end = new ctx.THREE.Vector3(...board.at(result.path[i].pos));
          board.crab.rotation.y = { up: Math.PI, right: Math.PI / 2, down: 0, left: -Math.PI / 2 }[result.path[i].dir];
          await ctx.animate(160, (k) => { board.crab.position.lerpVectors(start, end, k); });
        }
        if (result.ok) {
          ctx.sfx('pickup'); ctx.setFlag('p4_crab_round', round + 1); ctx.setFlag('p4_crab_shells', null);
          if (round === 2) ctx.achieve('p4_crab');
        } else ctx.sfx('wrong');
        refresh(ctx);
      });
      if (result.ok && round < 2) await ctx.go('crab_board', { instant: true, teleport: true });
      await ctx.say(result.ok ? round === 2 ? T.crabDone : T.crabRound(round + 2) : T.crabFail[result.reason]);
      if (result.ok && round === 2) await ctx.go('crab_feast');
    } });
  });
  const oldEnter = ctx.views.get('crab_board').onEnter;
  ctx.views.get('crab_board').onEnter = () => { if (oldEnter) oldEnter(ctx); ctx.hintOnce('p4_crab', T.board, { ms: 10000 }); };
}
