// 第七灾 · 雹灾。模块按 world（雪景与场景）→ puzzles（交互）组合，存档只保存 flags / inventory。
import { defineItems } from './items.js';
import { HINTS } from './hints.js';
import { T, ACHIEVEMENTS } from './text.js';
import * as world from './world.js';
import * as puzzles from './puzzles.js';

export default {
  id: 'plague7',
  number: 7,
  title: { zh: '雹灾', en: 'Hail' },
  label: { zh: '第七灾', en: 'Plague VII' },
  completeFlag: 'plague7_complete',
  hints: HINTS,   // 提示任务表（233 乐园版的提示按钮用，见 src/core/hints.js）

  async setup(ctx) {
    ctx.defineAchievements(ACHIEVEMENTS);
    ctx.p7 = { world: world.W, puzzles };
    defineItems(ctx);
    await world.setup(ctx);
    await puzzles.setup(ctx);
    world.sync(ctx);
  },

  async start(ctx, { skipIntro = false } = {}) {
    if (!ctx.state.view) await ctx.go('p7_overview', { instant: true });
    if (!skipIntro && !ctx.flag('intro_done')) await ctx.ui.title(T.chapter, 2200);
    ctx.setFlag('intro_done');
  },

  sync(ctx) {
    world.sync(ctx);
  },

  walkthrough: puzzles.walkthrough,
};
