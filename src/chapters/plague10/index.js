// 第十灾 · 长子之死（最后一章）。模块按 world（黄昏布景与场景）→ puzzles（交互）组合，存档只保存 flags / inventory。
import { defineItems } from './items.js';
import { HINTS } from './hints.js';
import { T, ACHIEVEMENTS } from './text.js';
import * as world from './world.js';
import * as puzzles from './puzzles.js';

export default {
  id: 'plague10',
  number: 10,
  title: { zh: '长子之死', en: 'Death of the Firstborn' },
  label: { zh: '第十灾', en: 'Plague X' },
  completeFlag: 'plague10_complete',
  hints: HINTS,   // 提示任务表（233 乐园版的提示按钮用，见 src/core/hints.js）

  async setup(ctx) {
    ctx.defineAchievements(ACHIEVEMENTS);
    ctx.p10 = { world: world.W, puzzles };
    defineItems(ctx);
    await world.setup(ctx);
    puzzles.setup(ctx);
    world.sync(ctx);
  },

  async start(ctx, { skipIntro = false } = {}) {
    if (!ctx.state.view) await ctx.go('p10_overview', { instant: true });
    if (!skipIntro && !ctx.flag('intro_done')) {
      await ctx.ui.title(T.chapter, 2200);
      ctx.say(T.dusk, { kind: 'thought' });
    }
    ctx.setFlag('intro_done');
  },

  sync(ctx) {
    world.sync(ctx);
  },

  walkthrough: puzzles.walkthrough,
};
