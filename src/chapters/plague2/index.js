// 第二灾 · 蛙灾。章节对象：组合 world（布景 / 视图 / 导航）和 beach、forest、house、temple 四个部分。
// 一个页面只装载一章（src/main.js）：从菜单选第二灾会把选择记进 sessionStorage 并重载页面；开发跳转用 ?chapter=2。
//
// 每个部分导出 setup(ctx) / sync(ctx) / walkthrough（约定见 world.js 顶部和 beach.js 的说明）。
import { defineItems } from './items.js';
import { T, ACHIEVEMENTS } from './text.js';
import * as puzzles from './puzzles.js';
import * as world from './world.js';
import * as beach from './beach.js';
import * as forest from './forest.js';
import * as house from './house.js';
import * as temple from './temple.js';

const PARTS = [world, beach, forest, house, temple];

const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const outCubic = (k) => 1 - Math.pow(1 - k, 3);
const outSine = (k) => Math.sin((k * Math.PI) / 2);

/**
 * 开场标题（原作 0:01–0:12，f_0002–f_0013）：总览远景上叠两行黑字。第一行淡入并略微上移，
 * 第二行从画面底边外滑上来；之后静止。任意点击 / 按键、离开总览或约 12 秒后淡出。
 * 用自己的 DOM（沿用 .title-text 的样式），不占用 ui.title；整段只用一个 animate 任务（跟随 timeScale）。
 */
function chapterTitle(ctx, lines, { holdMs = 9000 } = {}) {
  const IN = 2600, OUT = 800, OUT_SKIP = 350;
  const vp = ctx.ui.vp;
  vp.querySelectorAll('.p2-title').forEach((e) => e.remove());
  const box = document.createElement('div');
  box.className = 'title-text show p2-title';
  // 原作两行字中心分别在画面高度的 76% / 86%：45em 高的视口里约 34.3em / 38.5em
  box.style.top = '32.2em';
  const els = lines.map((t) => {
    const d = document.createElement('div');
    d.className = 'line';
    d.textContent = t;
    d.style.lineHeight = '1.72';
    d.style.willChange = 'transform, opacity';
    box.appendChild(d);
    return d;
  });
  vp.appendChild(box);

  let skip = false;
  const onInput = () => { skip = true; };
  const evOpts = { capture: true, passive: true };
  window.addEventListener('pointerdown', onInput, evOpts);
  window.addEventListener('keydown', onInput, evOpts);
  const offView = ctx.state.on('view', ({ id }) => { if (id !== 'overview') skip = true; });
  const offReset = ctx.state.on('reset', () => { skip = true; });

  // t：开场后的毫秒数
  const pose = (t) => {
    const [l1, l2] = els;
    if (l1) {
      l1.style.opacity = String(clamp01(t / 700));
      l1.style.transform = `translateY(${((1 - outSine(clamp01(t / 2000))) * 1.1).toFixed(3)}em)`;
    }
    if (l2) {
      const k = outCubic(clamp01((t - 1100) / 1400));
      l2.style.opacity = t >= 1100 ? '1' : '0';
      l2.style.transform = `translateY(${((1 - k) * 9).toFixed(3)}em)`;   // 从视口底边外（约 9em 以下）滑上来
    }
  };
  pose(0);

  return new Promise((resolve) => {
    let done = false, skipAt = null;
    const TOTAL = IN + holdMs + OUT;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('pointerdown', onInput, evOpts);
      window.removeEventListener('keydown', onInput, evOpts);
      offView(); offReset();
      box.remove();
      resolve();
    };
    ctx.animate(TOTAL, (k) => {
      if (done) return;
      const t = k * TOTAL;
      if (skip && skipAt === null) skipAt = t;
      const outStart = skipAt !== null ? skipAt : IN + holdMs;
      const outMs = skipAt !== null ? OUT_SKIP : OUT;
      pose(skipAt !== null ? Math.max(t, IN) : t);       // 跳过时直接摆到最终位置再淡出
      const fo = clamp01((t - outStart) / outMs);
      box.style.opacity = String(1 - fo);
      if (fo >= 1) finish();
    }, (k) => k).then(finish, finish);
  });
}

async function intro(ctx) {
  await ctx.go('overview', { instant: true });
  await chapterTitle(ctx, T.chapter);
}

export default {
  id: 'plague2',
  number: 2,
  title: { zh: '蛙灾', en: 'Frogs' },
  label: { zh: '第二灾', en: 'Plague II' },
  completeFlag: 'plague2_complete',

  async setup(ctx) {
    ctx.defineAchievements(ACHIEVEMENTS);
    // 部件之间共享的东西（调试时 RLP.ctx.p2.world / RLP.ctx.p2.puzzles.selfTest()）
    ctx.p2 = { world: world.W, spots: world.SPOTS, puzzles };
    defineItems(ctx);
    for (const part of PARTS) await part.setup(ctx);
  },

  // 开场：总览远景 + 标题“第二灾 / 蛙灾”（可跳过）。标题期间就能点岛进海滩（点击同时让标题淡出）。
  async start(ctx, { skipIntro = false } = {}) {
    if (!skipIntro && !ctx.flag('intro_done')) await intro(ctx);
    ctx.setFlag('intro_done');
    if (!ctx.state.view || ctx.state.view === 'none') await ctx.go('overview', { instant: true });
  },

  // 按存档的旗标把布景、道具和人物恢复到对应状态（不播动画，幂等）
  sync(ctx) {
    for (const part of PARTS) part.sync(ctx);
  },

  walkthrough: [
    ...world.walkthrough, ...house.walkthrough, ...temple.walkthrough, ...forest.walkthrough,
    { go: 'pump_clearing' }, { click: 'ida' }, { click: 'ida' }, { use: 'frog_flute', on: 'ida' },
    { repeat: 5, step: { click: 'ida_flute' } }, { click: 'ida_frog' },
    ...beach.walkthrough,
    { go: 'beach_left' }, { click: 'david' }, { click: 'david' }, { use: 'belt', on: 'david' }, { click: 'david_frog' },
    { go: 'house_clearing' }, { click: 'house_entry' }, { click: 'cauldron' },
    { repeat: 3, step: { use: 'frog', on: 'cauldron' } }, { use: 'frog_orange', on: 'cauldron' },
    { use: 'wood', on: 'cauldron_fire' }, { use: 'candle', on: 'cauldron_fire' }, { use: 'bowl', on: 'cauldron' },
    { expectItem: 'frog_soup' }, { back: true }, { back: true },
    { go: 'forest_clearing' }, { click: 'gerard' }, { click: 'gerard' },
    { use: 'frog_soup', on: 'gerard' }, { use: 'bowl', on: 'gerard' }, { click: 'gerard_bowl' }, { click: 'gerard_key' },
    { go: 'house_clearing' }, { click: 'house_entry' }, { use: 'key', on: 'chest' }, { click: 'chest_cube' },
    { expectFlag: 'memory_seen' }, { click: 'chest_cube' }, { expectItem: 'black_cube' }, { back: true },
    { go: 'temple_door' }, { click: 'temple_entry' }, { click: 'holder' }, { click: 'holder' },
    { use: 'black_cube', on: 'holder' }, { expectFlag: 'plague2_complete' },
  ],
};
