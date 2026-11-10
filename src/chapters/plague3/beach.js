// 海滩（天堂门前）：左石的苍蝇拍、右石的贻贝、两石之间沙地上的 X、挖出来的滑块盒（docs/plague3_design.md 4.1）。
// 苍蝇拍 / 贻贝 / 盒里的球茎的“已取”旗标，和滑块盘面（p3_slider_discs / p3_slider_empty）都存进 flags，sync() 双向恢复。
import { W, SPOTS, placeProp, closeup, hint, giveItem, instant, numberFlag, addCircle } from './world.js';
import { SLIDER_START, sliderBoard, sliderPress, sliderSolved, sliderMovable, sliderSolve, SLIDER_N } from './puzzles.js';
import { T } from './text.js';

let S;

/** 存档里的滑块盘面（没有就是起始盘面）。 */
export function readBoard(ctx) {
  const raw = ctx.flag('p3_slider_discs');
  const discs = typeof raw === 'string' ? raw.split(',').map(Number) : null;
  if (!discs || discs.length !== 3 || discs.some((d) => !Number.isInteger(d))) return sliderBoard(SLIDER_START);
  return { discs, empty: numberFlag(ctx, 'p3_slider_empty', SLIDER_START.empty) };
}
const writeBoard = (ctx, b) => { ctx.setFlag('p3_slider_discs', b.discs.join(',')); ctx.setFlag('p3_slider_empty', b.empty); };

export async function setup(ctx) {
  const ext = W.zones.exterior;
  const rockLeft = placeProp(ext, 'p3_symbol_rock', SPOTS.rockLeft.pos, { rotY: SPOTS.rockLeft.rotY, props: { symbol: 'dot' } });
  const rockRight = placeProp(ext, 'p3_symbol_rock', SPOTS.rockRight.pos, { rotY: SPOTS.rockRight.rotY, props: { symbol: 'cross' } });
  const digX = placeProp(ext, 'p3_dig_x', SPOTS.digX.pos);

  // 苍蝇拍斜靠在左石的挂点上（挂点自带位置 / 朝向 / 缩放）
  const swatter = placeProp(rockLeft, 'p3_swatter', [0, 0, 0]);
  const swSpot = rockLeft.getObjectByName('swatter_spot');
  swatter.position.copy(swSpot.position); swatter.rotation.copy(swSpot.rotation); swatter.scale.setScalar(swSpot.userData.scale || 1);
  // 贻贝贴在右石上
  const mussel = placeProp(rockRight, 'p3_mussel_shell', [0, 0, 0]);
  const muSpot = rockRight.getObjectByName('mussel_spot');
  mussel.position.copy(muSpot.position); mussel.quaternion.copy(muSpot.quaternion); mussel.scale.setScalar(muSpot.userData.scale || 1);
  // 滑块盒挖出来以后放在坑边
  const box = placeProp(digX, 'p3_slider_box', [0, 0, 0]);
  const boxSpot = digX.getObjectByName('box_spot');
  box.position.copy(boxSpot.position); box.scale.setScalar(boxSpot.userData.scale || 1); box.visible = false;

  S = { rockLeft, rockRight, digX, swatter, mussel, box };
  Object.assign(W, S);
  addCircle(SPOTS.rockLeft.pos[0], SPOTS.rockLeft.pos[2], 0.5);
  addCircle(SPOTS.rockRight.pos[0], SPOTS.rockRight.pos[2], 0.5);

  closeup(ctx, 'p3_rock_left', rockLeft, 'beach_mid', { target: [-0.08, 0.28, 0.1], eye: [0.05, 0.62, 1.55], fov: 40 });
  closeup(ctx, 'p3_rock_right', rockRight, 'beach_mid', { target: [0.1, 0.22, 0.1], eye: [0.0, 0.55, 1.5], fov: 40 });
  closeup(ctx, 'p3_dig', digX, 'beach_mid', { target: [0.05, 0, 0], eye: [0.05, 1.75, 0.4], fov: 42 });
  closeup(ctx, 'p3_slider', box, 'p3_dig', {
    target: [0, 0.1, 0.02], eye: [0, 0.92, 0.17], fov: 42,
    onEnter: (c) => { hint(c, 'slider', 'hintSlider'); },
  });

  // ---- 两块石头：从海滩点进特写
  ctx.hotspots.define({ id: 'p3_rock_left_zoom', views: ['beach_mid'], object: rockLeft, cursor: 'zoom', goto: 'p3_rock_left' });
  ctx.hotspots.define({ id: 'p3_rock_right_zoom', views: ['beach_mid'], object: rockRight, cursor: 'zoom', goto: 'p3_rock_right' });
  // 左石特写：拿苍蝇拍
  ctx.hotspots.define({
    id: 'p3_swatter', views: ['p3_rock_left'], object: swatter, cursor: 'grab', when: () => !ctx.flag('p3_swatter_taken'),
    onClick: async () => {
      if (!(await giveItem(ctx, 'p3_swatter', swatter))) return;
      ctx.setFlag('p3_swatter_taken'); swatter.visible = false;
    },
  });
  // 右石特写：铲子撬开贻贝，再取贝肉
  ctx.hotspots.define({
    id: 'p3_mussel', views: ['p3_rock_right'], object: mussel, cursor: 'use', when: () => !ctx.flag('p3_mussel_taken'),
    onClick: async () => {
      if (!ctx.flag('p3_mussel_open')) return ctx.say(T.musselStuck);
      await ctx.cutscene(async () => {
        if (!(await giveItem(ctx, 'p3_mussel', mussel))) return;
        ctx.setFlag('p3_mussel_taken'); await mussel.take();
      });
    },
    onItem: {
      p3_shovel: () => ctx.cutscene(async () => {
        if (ctx.flag('p3_mussel_open')) return;
        ctx.setFlag('p3_mussel_open'); ctx.state.select(null); ctx.sfx('wing'); await mussel.open();
      }),
    },
  });

  // ---- X：从海滩点进特写；铲子挖开
  ctx.hotspots.define({ id: 'p3_dig_x', views: ['beach_mid'], object: digX, cursor: 'zoom', when: () => !ctx.flag('p3_x_dug'), goto: 'p3_dig' });
  ctx.hotspots.define({
    id: 'p3_dig_spot', views: ['p3_dig'], object: digX, cursor: 'use', when: () => !ctx.flag('p3_x_dug'),
    onItem: {
      p3_shovel: () => ctx.cutscene(async () => {
        if (ctx.flag('p3_x_dug')) return;
        ctx.setFlag('p3_x_dug'); ctx.state.select(null); ctx.sfx('squish');
        await digX.dig();
        box.visible = true; box.setBoard(sliderBoard(SLIDER_START));
      }),
    },
  });
  // 滑块盒：坑边的盒子点进俯视特写
  ctx.hotspots.define({
    id: 'p3_box', views: ['beach_mid', 'p3_dig'], object: box.getObjectByName('slider_box_hit'), cursor: 'zoom',
    when: () => !!ctx.flag('p3_x_dug') && !ctx.flag('p3_box_bulb_taken'), goto: 'p3_slider',
  });
  // 26 格：每格一个热点，和空格相邻、盒子还没解开时才可点
  for (let i = 0; i < SLIDER_N; i++) {
    ctx.hotspots.define({
      id: `p3_cell_${i}`, views: ['p3_slider'], object: box.getObjectByName(`slider_cell_${i}`), cursor: 'pointer',
      when: () => !ctx.flag('p3_slider_solved') && sliderMovable(readBoard(ctx)).includes(i),
      onClick: () => ctx.cutscene(async () => {
        const step = sliderPress(readBoard(ctx), i);
        if (!step) return;
        writeBoard(ctx, step.board);
        ctx.sfx('click');
        await box.slide(step.from, step.to);
        if (sliderSolved(step.board)) {
          ctx.setFlag('p3_slider_solved'); ctx.sfx('unlock');
          await box.solve();
        }
      }),
    });
  }
  // 解开后点门闩 / 盒盖 → 盒盖翻开；点球茎 → 拿走
  ctx.hotspots.define({
    id: 'p3_box_latch', views: ['p3_slider'], object: box.getObjectByName('slider_latch_hit'), cursor: 'use',
    when: () => !ctx.flag('p3_box_open'),
    onClick: async () => {
      if (!ctx.flag('p3_slider_solved')) return ctx.say(T.boxLocked);
      await ctx.cutscene(async () => { ctx.setFlag('p3_box_open'); ctx.sfx('lid'); await box.open(); });
    },
  });
  ctx.hotspots.define({
    id: 'p3_box_bulb', views: ['p3_slider'], object: box.getObjectByName('slider_bulb_hit'), cursor: 'grab',
    when: () => !!ctx.flag('p3_box_open') && !ctx.flag('p3_box_bulb_taken'),
    onClick: async () => {
      if (!(await giveItem(ctx, 'p3_bulb', box.getObjectByName('slider_bulb_hit')))) return;
      ctx.setFlag('p3_box_bulb_taken'); await box.takeBulb();
    },
  });
}

export function sync(ctx) {
  if (!S) return;
  const { swatter, mussel, digX, box } = S;
  swatter.visible = !ctx.flag('p3_swatter_taken');
  mussel.setState({ open: !!ctx.flag('p3_mussel_open'), taken: !!ctx.flag('p3_mussel_taken') });
  const dug = !!ctx.flag('p3_x_dug');
  digX.setState({ dug });
  box.visible = dug;
  const b = readBoard(ctx);
  box.setState({
    discs: b.discs, empty: b.empty, solved: !!ctx.flag('p3_slider_solved'),
    open: !!ctx.flag('p3_box_open'), bulbTaken: !!ctx.flag('p3_box_bulb_taken'),
  });
}

// 海滩：拿苍蝇拍；贻贝、X 和滑块盒要等铲子（小屋）——这里只列左石，其余在 farWalkthrough 里按主线顺序走。
export const walkthrough = [
  { go: 'beach_mid' }, { click: 'p3_rock_left_zoom' }, { expectView: 'p3_rock_left' }, { click: 'p3_swatter' }, { expectItem: 'p3_swatter' }, { back: true },
];

/** 铲子到手之后：撬贻贝、挖 X、滑块 23 步、开盒拿球茎。 */
export const shovelWalkthrough = [
  { go: 'beach_mid' }, { click: 'p3_rock_right_zoom' }, { expectView: 'p3_rock_right' },
  { click: 'p3_mussel' }, { use: 'p3_shovel', on: 'p3_mussel' }, { expectFlag: 'p3_mussel_open' }, { click: 'p3_mussel' }, { expectItem: 'p3_mussel' }, { back: true },
  { click: 'p3_dig_x' }, { expectView: 'p3_dig' }, { use: 'p3_shovel', on: 'p3_dig_spot' }, { expectFlag: 'p3_x_dug' },
  { click: 'p3_box' }, { expectView: 'p3_slider' },
  ...sliderSolve(SLIDER_START).map((i) => ({ click: `p3_cell_${i}` })),
  { expectFlag: 'p3_slider_solved' }, { click: 'p3_box_latch' }, { expectFlag: 'p3_box_open' }, { click: 'p3_box_bulb' }, { expectItem: 'p3_bulb' },
  { back: true }, { back: true },
];
