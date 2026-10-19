// 第五灾 · 疫灾。模块按 world（场景）→ puzzles（交互）组合，存档只保存 flags / inventory。
import { defineItems } from './items.js';
import { T, ACHIEVEMENTS } from './text.js';
import * as world from './world.js';
import * as puzzles from './puzzles.js';

export default {
  id: 'plague5',
  number: 5,
  title: { zh: '疫灾', en: 'Pestilence' },
  label: { zh: '第五灾', en: 'Plague V' },
  completeFlag: 'plague5_complete',

  async setup(ctx) {
    ctx.defineAchievements(ACHIEVEMENTS);
    ctx.p5 = { world: world.W, puzzles };
    defineItems(ctx);
    await world.setup(ctx);
    await puzzles.setup(ctx);
    world.sync(ctx);
  },

  async start(ctx, { skipIntro = false } = {}) {
    if (!ctx.state.view) await ctx.go('p5_overview', { instant: true });
    if (!skipIntro && !ctx.flag('intro_done')) await ctx.ui.title(T.chapter, 2200);
    ctx.setFlag('intro_done');
  },

  sync(ctx) {
    world.sync(ctx);
  },

  walkthrough: puzzles.walkthrough,
};
