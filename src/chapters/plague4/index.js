// 第四灾只组合自己的布景和故事，不加载尚未完成的第二、三灾。
import { defineItems } from './items.js';
import { HINTS } from './hints.js';
import { T, ACHIEVEMENTS } from './text.js';
import * as world from './world.js';
import * as story from './story.js';
import * as puzzles from './puzzles.js';
import { walkthrough } from './walkthrough.js';

export default {
  id: 'plague4', number: 4,
  label: { zh: '第四灾', en: 'Plague IV' }, title: { zh: '蝇灾', en: 'Flies' },
  completeFlag: 'plague4_complete', walkthrough,
  hints: HINTS,   // 提示任务表（233 乐园版的提示按钮用，见 src/core/hints.js）
  async setup(ctx) {
    ctx.defineAchievements(ACHIEVEMENTS); defineItems(ctx);
    ctx.p4 = { world: world.W, spots: world.SPOTS, puzzles };
    await world.setup(ctx); story.setup(ctx); this.sync(ctx);
  },
  async start(ctx, { skipIntro = false } = {}) {
    if (!ctx.state.view) await ctx.go('overview', { instant: true });
    if (!skipIntro && !ctx.flag('intro_done')) await ctx.ui.title(T.chapter, 3000);
    ctx.setFlag('intro_done');
  },
  sync(ctx) { world.sync(ctx); story.sync(ctx); },
};
