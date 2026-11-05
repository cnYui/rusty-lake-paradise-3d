// Plague I — Blood. Composes the three parts of the chapter.
import { defineItems } from './items.js';
import { HINTS } from './hints.js';
import * as beach from './beach.js';
import * as forest from './forest.js';
import * as lake from './lake.js';

const PARTS = [beach, forest, lake];

export default {
  id: 'plague1',
  number: 1,
  title: { zh: 'x灾', en: 'x' },
  label: { zh: '第一灾', en: 'Plague I' },
  completeFlag: 'plague1_complete',
  hints: HINTS,   // 提示任务表（233 乐园版的提示按钮用，见 src/core/hints.js）

  async setup(ctx) {
    defineItems(ctx);
    for (const part of PARTS) await part.setup(ctx);
  },

  // Intro cutscene lives in beach.js (exported as `intro`); it ends on the overview view.
  async start(ctx, { skipIntro = false } = {}) {
    if (!skipIntro && !ctx.flag('intro_done') && beach.intro) {
      await beach.intro(ctx);
    } else if (beach.skipIntro) {
      await beach.skipIntro(ctx);
    }
    ctx.setFlag('intro_done');
    if (!ctx.state.view || ctx.state.view === 'none') await ctx.go('overview', { instant: true });
  },

  // Put every prop / character into the state implied by the saved flags (no animation).
  sync(ctx) {
    for (const part of PARTS) part.sync(ctx);
  },

  walkthrough: [...beach.walkthrough, ...forest.walkthrough, ...lake.walkthrough],
};
