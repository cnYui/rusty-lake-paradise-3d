// 第三灾 · 蚊灾和虱灾。章节对象：组合 world（布景 / 视图 / 导航）和 beach、forest、house、lake、temple、grove 六个部分。
// 一个页面只装载一章（src/main.js）：从菜单选第三灾会把选择记进 sessionStorage 并重载页面；开发跳转用 ?chapter=3。
// 设计契约 docs/plague3_design.md，美术接口 docs/plague3_api.md；纯规则（滑块、蜂巢、陶轮、神龛）在 puzzles.js，可用 node 单测。
//
// 每个部分导出 setup(ctx) / sync(ctx) / walkthrough（约定见 world.js 顶部）；sync 只调用道具 / 人物的 setState，幂等、双向。
import { defineItems } from './items.js';
import { T, ACHIEVEMENTS } from './text.js';
import * as puzzles from './puzzles.js';
import * as world from './world.js';
import * as beach from './beach.js';
import * as forest from './forest.js';
import * as house from './house.js';
import * as lake from './lake.js';
import * as temple from './temple.js';
import * as grove from './grove.js';
import { chapterTitle } from './title.js';
import { SLIDER_START as ART_SLIDER_START, SLIDER_EYES as ART_SLIDER_EYES, SLIDER_CELLS } from '../../art/props_p3_beach.js';
import { HIVE_HOLES } from '../../art/props_p3_forest.js';
import { POT } from '../../art/props_p3_shared.js';

const PARTS = [world, beach, forest, house, lake, temple, grove];

/** 美术里和 puzzles.js 重复的常量对一遍（滑块盒格子、蜂孔数量、陶轮目标器形），防止两边漂移。 */
function checkArt() {
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const checks = [
    ['滑块起始盘面', eq(ART_SLIDER_START, puzzles.SLIDER_START)],
    ['滑块目标格', eq(ART_SLIDER_EYES, puzzles.SLIDER_EYES)],
    ['滑块格子映射', SLIDER_CELLS.length === puzzles.SLIDER_N && SLIDER_CELLS.every((rc, i) => eq(rc, puzzles.sliderRC(i)))],
    ['蜂孔数量', HIVE_HOLES.length === puzzles.HIVE_HOLE_COUNT],
    ['陶轮目标器形', eq(POT.targets, puzzles.POT_TARGETS)],
    ['陶轮起始泥团', eq(POT.start, puzzles.POT_START)],
  ];
  return { ok: checks.every(([, ok]) => ok), checks: checks.map(([name, ok]) => ({ name, ok })) };
}

async function intro(ctx) {
  await ctx.go('overview', { instant: true });
  await chapterTitle(ctx, T.chapter);
}

export default {
  id: 'plague3',
  number: 3,
  title: { zh: '蚊灾和虱灾', en: 'Gnats & Lice' },
  label: { zh: '第三灾', en: 'Plague III' },
  completeFlag: 'plague3_complete',

  async setup(ctx) {
    ctx.defineAchievements(ACHIEVEMENTS);
    // 部件之间共享的东西（调试时 RLP.ctx.p3.world / RLP.ctx.p3.puzzles.selfTest() / RLP.ctx.p3.checkArt()）
    ctx.p3 = { world: world.W, spots: world.SPOTS, puzzles, checkArt };
    defineItems(ctx);
    for (const part of PARTS) await part.setup(ctx);
  },

  // 开场：总览远景 + 标题“第三灾 / 蚊灾和虱灾”（可跳过）。标题期间就能点岛进海滩（点击同时让标题淡出）。
  async start(ctx, { skipIntro = false } = {}) {
    if (!skipIntro && !ctx.flag('intro_done')) await intro(ctx);
    ctx.setFlag('intro_done');
    if (!ctx.state.view || ctx.state.view === 'none') await ctx.go('overview', { instant: true });
  },

  // 按存档的旗标把布景、道具和人物恢复到对应状态（不播动画，幂等）
  sync(ctx) {
    for (const part of PARTS) part.sync(ctx);
  },

  // 主线（design §8）：只走公开热点，不直接设旗标。
  walkthrough: [
    // 1–2 海滩拿苍蝇拍 → 小屋拿铲子 → 湖岸（拍子给 Margaret，拿蚊子 / 蜗牛 / 斧子）→ 神殿拿剪刀
    ...world.walkthrough, ...beach.walkthrough, ...house.walkthrough, ...lake.walkthrough, ...temple.walkthrough,
    // 3 水泵空地：蜂巢拿蜂蜜，土堆拿黏土
    ...forest.hiveWalkthrough, ...forest.moundWalkthrough,
    // 4 白树空地：捕蝇草先吃蚊子和蜗牛
    ...forest.feedWalkthrough(['p3_gnats', 'p3_snail']),
    // 5 小屋：剪头发、剪耳朵；陶轮做两只花瓶
    ...house.hairWalkthrough, ...house.wheelWalkthrough,
    // 6 海滩：撬贻贝，挖 X，滑块，开盒拿球茎
    ...beach.shovelWalkthrough,
    // 7 白树空地：捕蝇草吃贻贝和耳朵 → 开花拿黄花；斧子砍红叉树进白桦林
    ...forest.feedWalkthrough(['p3_mussel', 'p3_ear']), ...forest.flowerWalkthrough, ...temple.harveyWalkthrough, ...forest.chopWalkthrough,
    // 8 白桦林：浆果、桦树汁、David 的桌子、幼虫吐球茎；神龛放黄花和两只花瓶
    { click: 'p3_grove_entry' }, { expectView: 'p3_grove' },
    ...grove.berryWalkthrough, ...grove.sapWalkthrough, ...grove.davidWalkthrough,
    ...grove.shrineWalkthrough([
      { use: 'p3_flower_yellow', on: 'p3_shrine_slot_0' },
      { use: 'p3_vase_slim', on: 'p3_shrine_slot_1' }, { use: 'p3_vase_urn', on: 'p3_shrine_slot_2' },
    ]),
    { click: 'p3_grove_exit' }, { expectView: 'forest_clearing' },
    // 9 小屋：钟罩里种两个球茎，收橙花和玫瑰
    ...house.jarWalkthrough,
    // 10 白桦林：两只花瓶插花 → 画像 → 回忆 → 拿黑方块
    { go: 'forest_clearing' }, { click: 'p3_grove_entry' }, { expectView: 'p3_grove' },
    ...grove.shrineWalkthrough([
      { use: 'p3_flower_orange', on: 'p3_shrine_slot_1' }, { use: 'p3_rose', on: 'p3_shrine_slot_2' },
    ]),
    { expectFlag: 'p3_portrait_eyes' }, ...grove.memoryWalkthrough,
    { click: 'p3_grove_exit' },
    // 11 神殿：黑方块放进吊架，结尾
    ...temple.endingWalkthrough,
  ],
};
