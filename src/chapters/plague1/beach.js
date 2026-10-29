// 第一灾海滩：船上工具、鱼竿、血湖捕虾与天堂门。
import { makeProp } from '../../art/props.js';
import { P, PALISADE } from '../../art/layout.js';
import { T } from './text.js';

let S = null;
const cam = (pos, target, fov = 48) => ({ pos, target, fov });
const add = (parent, id, pos, scale = 1) => {
  const obj = makeProp(id);
  obj.position.set(...pos);
  obj.scale.setScalar(scale);
  parent.add(obj);
  return obj;
};
const view = (ctx, id, pose, rest = {}) => ctx.views.define({ id, zone: 'exterior', cam: pose, ...rest });
// 静默记一个成就（不弹提示）：只用在读档补发
const grantQuiet = (c, id) => { const d = c.achievementDefs[id]; if (d) c.state.achieve(id, { zh: d.zh, en: d.en, ch: c.state.chapter }); };
// 提示按当前操作方式选文字：触屏界面用触屏版
const hint = (c, key, name) => c.hintOnce(key, c.ui.touchMode ? T[`${name}Touch`] : T[name]);

export async function setup(ctx) {
  const ext = ctx.world.zones.exterior;
  const anchor = (id) => ctx.world.anchor(id).position.toArray();
  S = { ctx, props: {} };
  const put = (id, pos, scale) => { S.props[id] = add(ext, id, pos, scale); return S.props[id]; };
  S.props.boat = put('rowboat', anchor('rowboat'));
  S.props.box = put('bolt_box', [16.5, 1.0, 46.6], 0.8);
  S.props.cane = put('bamboo_cane', anchor('bambooCane'));
  S.props.fruit = put('spiky_fruit', anchor('fruit'));
  S.props.gate = put('paradise_gate', anchor('gate'));

  // 总览是固定的远景开场镜头；点天堂门后进入海滩，从此室外全程自由漫游。
  // 海滩 / 森林路口这些室外视图只作为漫游的出生机位和脚本、测试的传送目标，方向箭头不会显示。
  view(ctx, 'overview', cam(P.overviewCam.pos, P.overviewCam.target, P.overviewCam.fov), { fixed: true });
  view(ctx, 'beach_mid', cam([0, 2.4, 48], [0, 1.8, 39]), {
    back: 'overview', left: 'beach_left', right: 'beach_right',
    up: (state) => state.flag('gate_unlocked') ? 'forest_path' : null,
    onEnter: (c) => { hint(c, 'roam', 'hintRoam'); },
  });
  view(ctx, 'beach_left', cam([-12, 2.2, 47], [-8, 1.6, 41]), { right: 'beach_mid', back: 'overview' });
  view(ctx, 'beach_right', cam([11.5, 2.2, 44.5], [16.5, 0.8, 47.5]), { left: 'beach_mid', back: 'overview' });
  view(ctx, 'boat_close', cam([16.5, 2.1, 44.5], [16.5, 1, 47]), {
    back: 'beach_right', closeup: true,
    onEnter: (c) => { hint(c, 'back', 'hintBack'); },
  });
  view(ctx, 'forest_path', cam([0, 2.2, 38], [0, 2, 29]), { back: 'beach_mid', up: 'forest_clearing', upAt: [0, 1.2, 32] });

  // 天堂门打开前，漫游只能停在栅栏和门板前面（也不能从栅栏两端绕进森林）。
  ctx.views.addRoamGate((x, z) => !ctx.flag('gate_unlocked') && z < PALISADE.z + 0.6);

  // 总览镜头距离较远，门洞的可见像素会比模型投影更宽；代理覆盖整扇门，避免点中入口边缘时落空。
  // 它只挂在总览上，漫游时不生效，不会挡住海滩上对天堂门本身的点击。
  const overviewGate = ctx.hotspots.makeProxy(12, 8, 3, [0, 3.5, 40], ext);
  ctx.hotspots.define({
    id: 'overview_gate', views: ['overview'], object: overviewGate, cursor: 'zoom',
    // 总览镜头跨度很大，低端设备上的平滑移动反馈过慢；入口点击直接切到海滩开始漫游。
    onClick: async () => { await ctx.go('beach_mid', { instant: true }); },
  });
  ctx.hotspots.define({ id: 'boat', views: ['beach_right', 'beach_mid'], object: S.props.boat, cursor: 'zoom', goto: 'boat_close' });
  ctx.hotspots.define({
    id: 'box', views: ['boat_close'], object: S.props.box, cursor: 'pointer',
    onClick: async () => {
      if (!ctx.flag('box_top')) { await S.props.box.slideBolt('top'); ctx.setFlag('box_top'); }
      if (!ctx.flag('box_bottom')) { await S.props.box.slideBolt('bottom'); ctx.setFlag('box_bottom'); }
      // 东西只拿一次（线绑上竹竿之后再点箱子不会再给一卷线），拿走的线卷不再留在箱子里
      if (ctx.flag('box_open')) return;
      await S.props.box.openDoors();
      for (const id of ['machete', 'hook', 'line']) {
        if (id === 'line') await S.props.box.hideLine();
        if (!ctx.state.has(id)) await ctx.give(id, { from: S.props.box });
      }
      ctx.setFlag('box_open');
      hint(ctx, 'inventory', 'hintUseItem');
    },
  });
  ctx.hotspots.define({
    id: 'bamboo', views: ['beach_left'], object: S.props.cane, cursor: 'use', when: () => !ctx.flag('bamboo_cut'),
    onItem: { machete: async () => { await S.props.cane.cut(); ctx.setFlag('bamboo_cut'); if (!ctx.state.has('stick')) await ctx.give('stick', { from: S.props.cane }); } },
  });
  ctx.hotspots.define({
    id: 'fruit', views: ['beach_left'], object: S.props.fruit, cursor: 'use', when: () => (ctx.flag('fruit_chops') || 0) < 5,
    onItem: { machete: async () => {
      const n = Math.min(5, (ctx.flag('fruit_chops') || 0) + 1);
      await S.props.fruit.chop(n); ctx.setFlag('fruit_chops', n);
      // 虫子爬出来 → 飞进物品栏，果子上不再留着虫子
      if (n === 5 && !ctx.state.has('worm')) { await S.props.fruit.showWorm(true); await S.props.fruit.showWorm(false); await ctx.give('worm', { from: S.props.fruit }); }
    } },
  });
  // 钓虾：选中挂好鱼饵的鱼竿，点海滩外的湖面。隐形点击区盖住海滩前整片浅水（船和码头上的点击仍先命中它们自己）。
  const RODS = ['rod_line', 'rod_hook', 'rod'];
  ctx.hotspots.define({
    id: 'fish', views: ['beach_mid'], object: ctx.hotspots.makeProxy(36, 0.6, 7, [3, -0.1, 52], ext), cursor: 'use',
    when: () => !ctx.flag('shrimp_caught') && RODS.some((id) => ctx.state.has(id)),
    onItem: {
      rod: () => ctx.cutscene(async () => {
        const p = ctx.hitPoint || new ctx.THREE.Vector3(0, 0, 50);
        ctx.sfx('splash');
        ctx.world.lake.ripple?.(p.x, p.z, { strength: 0.8 });
        await ctx.wait(900);
        ctx.sfx('reel');
        ctx.world.lake.ripple?.(p.x, p.z, { strength: 0.5 });
        ctx.take('rod');
        ctx.setFlag('shrimp_caught');
        await ctx.give('shrimp', { from: [p.x, 0.3, p.z] });
        ctx.setFlag('shrimp_taken');
      }),
      rod_hook: async () => { ctx.state.select(null); await ctx.say(T.rodNoBait, { kind: 'thought' }); },
      rod_line: async () => { ctx.state.select(null); await ctx.say(T.rodNoHook, { kind: 'thought' }); },
    },
  });
  ctx.hotspots.define({
    id: 'gate_hand', views: ['beach_mid'], object: S.props.gate, cursor: 'pointer', when: () => !ctx.flag('hand_out'),
    onClick: async () => { await S.props.gate.openHatch('up'); ctx.setFlag('hatch_up'); await S.props.gate.openHatch('low'); ctx.setFlag('hatch_low'); await S.props.gate.extendHand(); ctx.setFlag('hand_out'); },
  });
  ctx.hotspots.define({
    id: 'gate_shrimp', views: ['beach_mid'], object: S.props.gate, cursor: 'use', when: () => ctx.flag('hand_out') && !ctx.flag('gate_unlocked'),
    onItem: { shrimp: async () => { ctx.take('shrimp'); await S.props.gate.handTake(makeProp('shrimp')); await S.props.gate.openDoors(); ctx.setFlag('gate_unlocked'); ctx.setFlag('gate_open'); ctx.achieve('welcome_to_paradise', { anchor: S.props.gate }); await ctx.go('forest_path'); } },
  });

  // 鱼竿：木棍 + 线 → 系着线的竹竿；+ 鱼钩 → 鱼竿；+ 虫子 → 挂好鱼饵的鱼竿。
  // 每一步都留在原来木棍的格子里换成新物品（图标跟着变），用掉的材料从物品栏拿走。
  const upgrade = (c, from, used, to, stage) => {
    c.take(used);
    c.replace(from, to);
    c.setFlag('rod', stage);
    c.say(c.items.name(to), { kind: 'item' });
  };
  ctx.items.recipe('stick', 'line', async (c) => { upgrade(c, 'stick', 'line', 'rod_line', 'line'); });
  ctx.items.recipe('rod_line', 'hook', async (c) => { upgrade(c, 'rod_line', 'hook', 'rod_hook', 'hook'); });
  ctx.items.recipe('rod_hook', 'worm', async (c) => { upgrade(c, 'rod_hook', 'worm', 'rod', 'worm'); c.say(T.rodReady, { kind: 'thought' }); });
}

export function sync(ctx) {
  if (!S) return;
  if (ctx.flag('box_top')) S.props.box.slideBolt('top', { instant: true });
  if (ctx.flag('box_bottom')) S.props.box.slideBolt('bottom', { instant: true });
  if (ctx.flag('box_open')) { S.props.box.openDoors({ instant: true }); S.props.box.hideLine(); }
  if (ctx.flag('bamboo_cut')) S.props.cane.cut({ instant: true });
  if (ctx.flag('fruit_chops')) S.props.fruit.chop(ctx.flag('fruit_chops'), { instant: true });
  if ((ctx.flag('fruit_chops') || 0) >= 5) S.props.fruit.showWorm(false, { instant: true });
  if (ctx.flag('gate_unlocked')) S.props.gate.openDoors({ instant: true });
  // 旧存档补发：这个成就以前没有发放点，门已经开了的存档静默补上（不弹提示）
  if (ctx.flag('gate_unlocked')) grantQuiet(ctx, 'welcome_to_paradise');
  if (ctx.flag('hand_out') && !ctx.flag('gate_unlocked')) { S.props.gate.openHatch('up', { instant: true }); S.props.gate.openHatch('low', { instant: true }); S.props.gate.extendHand({ instant: true }); }
}

export async function intro(ctx) { await ctx.ui.title(T.chapter, 1800); await ctx.ui.narrate(T.narration, { msPer: 1700 }); ctx.setFlag('intro_done'); await ctx.go('overview', { instant: true }); }
export async function skipIntro(ctx) { await ctx.go('overview', { instant: true }); }

export const walkthrough = [
  { go: 'overview' }, { click: 'overview_gate' }, { go: 'beach_right' }, { click: 'boat' }, { click: 'box' },
  { go: 'beach_left' }, { use: 'machete', on: 'bamboo' }, { repeat: 5, step: { use: 'machete', on: 'fruit' } },
  { combine: ['stick', 'line'] }, { combine: ['rod_line', 'hook'] }, { combine: ['rod_hook', 'worm'] }, { expectItem: 'rod' },
  { go: 'beach_mid' }, { use: 'rod', on: 'fish' }, { expectItem: 'shrimp' }, { expectNoItem: 'rod' },
  { click: 'gate_hand' }, { use: 'shrimp', on: 'gate_shrimp' }, { expectFlag: 'gate_unlocked' },
];
