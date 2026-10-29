// 森林：白树空地 G 的捕蝇草和红叉树（树倒后露出白桦林入口），水泵空地 P 的土堆和蜂巢（docs/plague3_design.md 4.2、4.3）。
// 喂食进度 p3_trap_fed、砍树次数 p3_xtree_cuts、黏土 p3_clay_taken、蜂巢出蜂数 p3_hive_step 都存进 flags；sync() 双向恢复。
import { W, SPOTS, placeProp, closeup, hint, giveItem, numberFlag, addCircle, removeCircle, addBox } from './world.js';
import { TRAP_NEEDED, hivePress, hiveBees, HIVE_ORDER } from './puzzles.js';
import { makeProp } from '../../art/props.js';

let S, treeCollider = null;

const foodModel = (id) => makeProp(id);

export async function setup(ctx) {
  const ext = W.zones.exterior;
  const flytrap = placeProp(ext, 'p3_flytrap', SPOTS.flytrap.pos, { rotY: SPOTS.flytrap.rotY });
  const xTree = placeProp(ext, 'p3_x_tree', SPOTS.xTree.pos, { rotY: SPOTS.xTree.rotY });
  const portal = placeProp(ext, 'p3_grove_portal', SPOTS.portal.pos, { rotY: SPOTS.portal.rotY });
  const mound = placeProp(ext, 'p3_clay_mound', SPOTS.mound.pos, { rotY: SPOTS.mound.rotY });
  const hive = placeProp(ext, 'p3_beehive', SPOTS.hive.pos, { rotY: SPOTS.hive.rotY });
  S = { flytrap, xTree, portal, mound, hive };
  Object.assign(W, S);

  // 碰撞：捕蝇草、红叉树（倒下后拿掉）、树后的白桦（不能从旁边走进去，只能点缺口）、土堆
  addCircle(SPOTS.flytrap.pos[0], SPOTS.flytrap.pos[2], 0.4);
  treeCollider = addCircle(SPOTS.xTree.pos[0], SPOTS.xTree.pos[2], 0.75);
  addBox(SPOTS.portal.pos[0] - 1.8, SPOTS.portal.pos[2] - 0.8, SPOTS.portal.pos[0] + 1.8, SPOTS.portal.pos[2] + 0.5);
  addCircle(SPOTS.mound.pos[0], SPOTS.mound.pos[2], 0.45);

  closeup(ctx, 'p3_flytrap', flytrap, 'forest_clearing', { target: [0, 0.4, 0], eye: [0.05, 0.5, 1.7], fov: 44 });
  closeup(ctx, 'p3_x_tree', xTree, 'forest_clearing', { target: [0, 2.0, 0], eye: [0.2, 1.9, 4.2], fov: 44 });
  closeup(ctx, 'p3_mound', mound, 'pump_clearing', { target: [0.15, 0.05, 0], eye: [0.15, 1.5, 0.65], fov: 40 });
  closeup(ctx, 'p3_hive', hive, 'pump_clearing', { target: [0, -0.4, 0], eye: [0, -0.4, 1.7], fov: 42, onEnter: (c) => { hint(c, 'hive', 'hintHive'); } });

  // ---- 捕蝇草：从空地点进特写；四样食物各喂一只夹子，喂满后开花，点花拿走
  ctx.hotspots.define({ id: 'p3_flytrap_zoom', views: ['forest_clearing'], object: flytrap, cursor: 'zoom', goto: 'p3_flytrap' });
  const feed = (id) => () => ctx.cutscene(async () => {
    const fed = numberFlag(ctx, 'p3_trap_fed');
    if (fed >= TRAP_NEEDED || !ctx.state.has(id)) return;
    ctx.take(id); ctx.state.select(null);
    ctx.setFlag('p3_trap_fed', fed + 1);
    ctx.sfx('squish');
    await flytrap.feed(foodModel(id));
    if (fed + 1 >= TRAP_NEEDED && !ctx.flag('p3_flower_bloomed')) {
      ctx.setFlag('p3_flower_bloomed'); ctx.sfx('holy');
      await flytrap.bloom();
    }
  });
  ctx.hotspots.define({
    id: 'p3_flytrap', views: ['p3_flytrap'], object: flytrap.getObjectByName('flytrap_hit'), cursor: 'use',
    onItem: Object.fromEntries(['p3_gnats', 'p3_snail', 'p3_mussel', 'p3_ear'].map((id) => [id, feed(id)])),
  });
  ctx.hotspots.define({
    id: 'p3_flytrap_flower', views: ['p3_flytrap'], object: flytrap.getObjectByName('flytrap_flower_hit'), cursor: 'grab',
    when: () => !!ctx.flag('p3_flower_bloomed') && !ctx.flag('p3_flower_taken'),
    onClick: async () => {
      if (!(await giveItem(ctx, 'p3_flower_yellow', flytrap.getObjectByName('flytrap_flower')))) return;
      ctx.setFlag('p3_flower_taken'); await flytrap.takeFlower();
    },
  });

  // ---- 红叉树：斧子砍三下倒下，缺口里露出白桦林
  ctx.hotspots.define({ id: 'p3_xtree_zoom', views: ['forest_clearing'], object: xTree, cursor: 'zoom', when: () => !ctx.flag('p3_xtree_felled'), goto: 'p3_x_tree' });
  ctx.hotspots.define({
    id: 'p3_xtree_chop', views: ['p3_x_tree'], object: xTree.getObjectByName('x_tree_hit'), cursor: 'use', when: () => !ctx.flag('p3_xtree_felled'),
    onItem: {
      p3_axe: () => ctx.cutscene(async () => {
        const cuts = numberFlag(ctx, 'p3_xtree_cuts') + 1;
        if (cuts > 3) return;
        ctx.setFlag('p3_xtree_cuts', cuts); ctx.sfx('chop');
        if (cuts < 3) { await xTree.chop(); return; }
        await xTree.chop();
        ctx.setFlag('p3_xtree_felled'); ctx.state.select(null); ctx.sfx('creak');
        await xTree.fell();
        if (treeCollider) { removeCircle(treeCollider); treeCollider = null; }
        await ctx.go('forest_clearing');
      }),
    },
  });
  // 倒下后的缺口：点它进白桦林
  ctx.hotspots.define({
    id: 'p3_grove_entry', views: ['forest_clearing'], object: portal.getObjectByName('portal_hit'), cursor: 'zoom',
    when: () => !!ctx.flag('p3_xtree_felled'), goto: 'p3_grove',
  });

  // ---- 土堆：铲子挖开，里面两团黏土
  ctx.hotspots.define({ id: 'p3_mound_zoom', views: ['pump_clearing'], object: mound, cursor: 'zoom', goto: 'p3_mound' });
  ctx.hotspots.define({
    id: 'p3_mound_dig', views: ['p3_mound'], object: mound.getObjectByName('mound_hit'), cursor: 'use', when: () => !ctx.flag('p3_mound_dug'),
    onItem: {
      p3_shovel: () => ctx.cutscene(async () => {
        if (ctx.flag('p3_mound_dug')) return;
        ctx.setFlag('p3_mound_dug'); ctx.state.select(null); ctx.sfx('squish'); await mound.dig();
      }),
    },
  });
  for (const i of [0, 1]) {
    ctx.hotspots.define({
      id: `p3_clay_${i}`, views: ['p3_mound'], object: mound.getObjectByName(`clay_${i}_hit`), cursor: 'grab',
      when: () => !!ctx.flag('p3_mound_dug') && numberFlag(ctx, 'p3_clay_taken') <= i,
      onClick: () => ctx.cutscene(async () => {
        const n = numberFlag(ctx, 'p3_clay_taken');
        if (n > i) return;
        if (!(await giveItem(ctx, 'p3_clay', mound.getObjectByName(`clay_${n}`)))) return;
        ctx.setFlag('p3_clay_taken', n + 1); await mound.takeClay();
      }),
    });
  }

  // ---- 蜂巢：看清蜜蜂从哪个洞飞出来，再点那个洞；七只飞完，蜂巢流出蜂蜜
  ctx.hotspots.define({ id: 'p3_hive_zoom', views: ['pump_clearing'], object: hive.getObjectByName('hive_hit'), cursor: 'zoom', goto: 'p3_hive' });
  for (let i = 0; i < 7; i++) {
    ctx.hotspots.define({
      id: `p3_hive_hole_${i}`, views: ['p3_hive'], object: hive.getObjectByName(`hive_hole_${i}`), cursor: 'pointer',
      when: () => !ctx.flag('p3_honey_ready'),
      onClick: () => ctx.cutscene(async () => {
        const step = numberFlag(ctx, 'p3_hive_step');
        const r = hivePress(step, i);
        if (r.kind === 'ignored') return;
        if (r.kind === 'wrong') {
          ctx.sfx('wrong'); await hive.flashHole(i);
          ctx.setFlag('p3_hive_step', 0); await hive.recallBees();
          return;
        }
        ctx.setFlag('p3_hive_step', r.step); ctx.sfx('wing');
        await hive.flashHole(i);
        await hive.releaseBee(r.release);
        if (r.kind === 'done') {
          ctx.setFlag('p3_honey_ready'); ctx.sfx('squish');
          await hive.drip();
        }
      }),
    });
  }
  ctx.hotspots.define({
    id: 'p3_hive_honey', views: ['p3_hive'], object: hive.getObjectByName('hive_honey_hit'), cursor: 'grab',
    when: () => !!ctx.flag('p3_honey_ready') && !ctx.flag('p3_honey_taken'),
    onClick: async () => {
      if (!(await giveItem(ctx, 'p3_honey', hive.getObjectByName('hive_honey_hit')))) return;
      ctx.setFlag('p3_honey_taken'); await hive.takeHoney();
    },
  });
}

export function sync(ctx) {
  if (!S) return;
  const { flytrap, xTree, mound, hive } = S;
  flytrap.setState({ fed: numberFlag(ctx, 'p3_trap_fed'), bloomed: !!ctx.flag('p3_flower_bloomed'), flowerTaken: !!ctx.flag('p3_flower_taken') });
  const felled = !!ctx.flag('p3_xtree_felled');
  xTree.setState({ cuts: numberFlag(ctx, 'p3_xtree_cuts'), felled });
  // 红叉树的碰撞：倒下后拿掉，读档回到没倒下时再装回来
  if (felled && treeCollider) { removeCircle(treeCollider); treeCollider = null; }
  if (!felled && !treeCollider) treeCollider = addCircle(SPOTS.xTree.pos[0], SPOTS.xTree.pos[2], 0.75);
  mound.setState({ dug: !!ctx.flag('p3_mound_dug'), clay: 2 - numberFlag(ctx, 'p3_clay_taken') });
  const step = numberFlag(ctx, 'p3_hive_step');
  hive.setState({ bees: hiveBees(step), honey: ctx.flag('p3_honey_taken') ? 'taken' : ctx.flag('p3_honey_ready') ? 'drip' : 'none' });
}

/** P 空地：蜂巢（任意孔 + 链上前 6 个孔）拿蜂蜜；土堆要铲子，在 shovelWalkthrough 里。 */
export const hiveWalkthrough = [
  { go: 'pump_clearing' }, { click: 'p3_hive_zoom' }, { expectView: 'p3_hive' },
  { click: 'p3_hive_hole_0' }, ...HIVE_ORDER.slice(0, 6).map((h) => ({ click: `p3_hive_hole_${h}` })),
  { expectFlag: 'p3_honey_ready' }, { click: 'p3_hive_honey' }, { expectItem: 'p3_honey' }, { back: true },
];
export const moundWalkthrough = [
  { go: 'pump_clearing' }, { click: 'p3_mound_zoom' }, { expectView: 'p3_mound' }, { use: 'p3_shovel', on: 'p3_mound_dig' }, { expectFlag: 'p3_mound_dug' },
  { click: 'p3_clay_0' }, { click: 'p3_clay_1' }, { back: true },
];
/** G 空地：喂食（物品没到手的先跳过，主线里分两次走）。 */
export const feedWalkthrough = (items) => [
  { go: 'forest_clearing' }, { click: 'p3_flytrap_zoom' }, { expectView: 'p3_flytrap' },
  ...items.map((id) => ({ use: id, on: 'p3_flytrap' })), { back: true },
];
export const flowerWalkthrough = [
  { go: 'forest_clearing' }, { click: 'p3_flytrap_zoom' }, { expectFlag: 'p3_flower_bloomed' }, { click: 'p3_flytrap_flower' }, { expectItem: 'p3_flower_yellow' }, { back: true },
];
export const chopWalkthrough = [
  { go: 'forest_clearing' }, { click: 'p3_xtree_zoom' }, { expectView: 'p3_x_tree' },
  { repeat: 3, step: { use: 'p3_axe', on: 'p3_xtree_chop' } }, { expectFlag: 'p3_xtree_felled' }, { expectView: 'forest_clearing' },
];
