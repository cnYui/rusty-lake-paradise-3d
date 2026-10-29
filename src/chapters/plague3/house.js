// 石屋室内（house_int，可走动）：桌边的铲子、Gerard 和 Ida 的理发、钟罩培育台、陶轮（docs/plague3_design.md 4.4）。
// 剪刀、发型阶段、耳朵、钟罩里的花、陶轮上的造型都存进 flags（p3_hair / p3_ear_cut / p3_jar_* / p3_wheel_*）；sync() 双向恢复。
import { W, SPOTS, placeProp, character, closeup, hint, giveItem, instant, numberFlag, addHouseObstacles } from './world.js';
import { potPoke, potMatch, potKey, potParse, POT_START, potRecipe } from './puzzles.js';
import { T } from './text.js';

let S;

const shapeOf = (ctx) => potParse(ctx.flag('p3_wheel_shape'));

export async function setup(ctx) {
  const room = W.zones.house_int;
  const h = SPOTS.house;
  const stool = placeProp(room, 'temple_stool', h.gerard.pos);
  const gerard = character(ctx, 'gerard_barber', h.gerard, 'house_int');
  const ida = character(ctx, 'ida_barber', h.gerard, 'house_int');
  ida.setPartner(gerard);                 // Ida 站在他正后方（IDA_BEHIND）
  const jarTable = placeProp(room, 'p3_jar_table', h.jarTable.pos);
  const bellJar = placeProp(jarTable, 'p3_bell_jar', [0, 0, 0]);
  const jarSpot = jarTable.getObjectByName('jar_spot');
  bellJar.position.copy(jarSpot.position);
  const shovel = placeProp(room, 'p3_shovel', h.shovel.pos);
  shovel.rotation.set(0, -0.2, 1.38);     // 斜靠在小桌右侧
  const wheel = placeProp(room, 'p3_pottery_wheel', h.wheel.pos);
  const drawing = placeProp(room, 'p3_vase_drawing', h.drawing.pos);
  const ear = placeProp(room, 'p3_ear', [h.gerard.pos[0] - 0.38, 0.03, h.gerard.pos[2] + 0.16]);
  ear.rotation.set(1.3, 0.4, 0.5); ear.scale.setScalar(1.7); ear.visible = false;

  S = { stool, gerard, ida, jarTable, bellJar, shovel, wheel, drawing, ear };
  Object.assign(W, S);

  // 家具碰撞：凳子 + Gerard / Ida、小桌、陶轮
  const gx = h.gerard.pos[0], gz = h.gerard.pos[2];
  addHouseObstacles({
    circles: [[gx, gz, 0.34], [gx, gz - 0.4, 0.3]],
    boxes: [
      [h.jarTable.pos[0] - 0.32, h.jarTable.pos[2] - 0.22, h.jarTable.pos[0] + 0.32, h.jarTable.pos[2] + 0.22],
      [h.wheel.pos[0] - 0.46, h.wheel.pos[2] - 0.36, h.wheel.pos[0] + 0.46, h.wheel.pos[2] + 0.36],
    ],
  });

  const room_ = ['house_int'];
  closeup(ctx, 'p3_barber', gerard.root, 'house_int', { zone: 'house_int', target: [0.05, 0.8, -0.25], eye: [-1.05, 1.15, 2.4], fov: 44 });
  closeup(ctx, 'p3_scalp', gerard.root, 'p3_barber', { zone: 'house_int', target: [0, 1.4, -0.02], eye: [0.0, 2.15, 0.2], fov: 40 });
  closeup(ctx, 'p3_bell_jar', bellJar, 'house_int', { zone: 'house_int', target: [0, 0.4, 0], eye: [0, 0.52, 1.75], fov: 44 });
  closeup(ctx, 'p3_wheel', wheel, 'house_int', {
    zone: 'house_int', target: [0, 0.9, 0], eye: [0, 1.25, 1.0], fov: 42,
    onEnter: (c) => { hint(c, 'wheel', 'hintWheel'); },
  });

  // ---- 铲子
  ctx.hotspots.define({
    id: 'p3_shovel', views: room_, object: shovel, cursor: 'grab', when: () => !ctx.flag('p3_shovel_taken'),
    onClick: async () => {
      if (!(await giveItem(ctx, 'p3_shovel', shovel))) return;
      ctx.setFlag('p3_shovel_taken'); shovel.visible = false;
    },
  });

  // ---- Ida 和 Gerard：从室内点进中景；剪刀给 Ida；点头发一刀一刀剪；寸头后再点就剪耳朵
  ctx.hotspots.define({ id: 'p3_ida_zoom', views: room_, object: ida.root, cursor: 'talk', goto: 'p3_barber' });
  ctx.hotspots.define({ id: 'p3_gerard_zoom', views: room_, object: gerard.root, cursor: 'zoom', goto: 'p3_barber' });
  const giveScissors = () => ctx.cutscene(async () => {
    if (ctx.flag('p3_scissors_given')) return;
    ctx.take('p3_scissors'); ctx.state.select(null);
    ctx.setFlag('p3_scissors_given'); ctx.sfx('pickup');
    await ida.holdScissors(true);
  });
  ctx.hotspots.define({
    id: 'p3_ida', views: ['p3_barber'], object: ida.root, cursor: 'talk',
    onClick: async () => {
      if (ctx.flag('p3_ida_talked')) return;
      ctx.setFlag('p3_ida_talked');
      ida.play('talk'); await ctx.say(T.ida); ida.play('idle');
    },
    onItem: { p3_scissors: giveScissors },
  });
  ctx.hotspots.define({ id: 'p3_gerard', views: ['p3_barber'], object: gerard.root, cursor: 'use', onItem: { p3_scissors: giveScissors } });
  const cutEar = () => ctx.cutscene(async () => {
    if (ctx.flag('p3_ear_cut')) return;
    ctx.setFlag('p3_ear_cut'); ctx.sfx('cut');
    await Promise.all([ida.cutEar(), gerard.cutEar()]);
    ear.visible = true;
  });
  ctx.hotspots.define({
    id: 'p3_gerard_hair', views: ['p3_barber'], object: gerard.hairObj, cursor: 'use',
    when: () => !!ctx.flag('p3_scissors_given'),
    onClick: async () => {
      const hair = numberFlag(ctx, 'p3_hair');
      if (hair < 3) {
        await ctx.cutscene(async () => {
          ctx.setFlag('p3_hair', hair + 1); ctx.sfx('cut');
          if (hair + 1 >= 3) gerard.showScalpMap(true);
          await Promise.all([ida.snip(), gerard.setHair(hair + 1)]);
        });
      } else if (!ctx.flag('p3_ear_cut')) await cutEar();
      else await ctx.go('p3_scalp');
    },
  });
  ctx.hotspots.define({
    id: 'p3_gerard_ear', views: ['p3_barber'], object: gerard.earObj, cursor: 'use',
    when: () => numberFlag(ctx, 'p3_hair') >= 3 && !ctx.flag('p3_ear_cut'), onClick: cutEar,
  });
  ctx.hotspots.define({
    id: 'p3_ear_item', views: ['house_int', 'p3_barber'], object: ear, cursor: 'grab',
    when: () => !!ctx.flag('p3_ear_cut') && !ctx.flag('p3_ear_taken'),
    onClick: async () => {
      if (!(await giveItem(ctx, 'p3_ear', ear))) return;
      ctx.setFlag('p3_ear_taken'); ear.visible = false; ctx.achieve('earcut');
    },
  });

  // ---- 钟罩培育台
  ctx.hotspots.define({ id: 'p3_jar_zoom', views: room_, object: jarTable, cursor: 'zoom', goto: 'p3_bell_jar' });
  const kindOf = (n) => (n === 0 ? 'orange' : 'rose');
  ctx.hotspots.define({
    id: 'p3_jar_dome', views: ['p3_bell_jar'], object: bellJar.getObjectByName('jar_dome_hit'), cursor: 'pointer',
    onClick: () => ctx.cutscene(async () => {
      const up = !!ctx.flag('p3_jar_dome_up');
      ctx.sfx('lid');
      if (!up) { ctx.setFlag('p3_jar_dome_up'); await bellJar.setDome(true); return; }
      ctx.setFlag('p3_jar_dome_up', false);
      await bellJar.setDome(false);
      // 有芽时落下钟罩：延时摄影，长成花
      if (ctx.flag('p3_jar_plant') === 'sprout') {
        ctx.setFlag('p3_jar_plant', 'flower'); ctx.sfx('holy');
        await bellJar.grow(ctx.flag('p3_jar_kind') || 'orange');
      }
    }),
  });
  ctx.hotspots.define({
    id: 'p3_jar_pot', views: ['p3_bell_jar'], object: bellJar.getObjectByName('jar_pot_hit'), cursor: 'use',
    when: () => !!ctx.flag('p3_jar_dome_up') && (ctx.flag('p3_jar_plant') || 'none') === 'none',
    onItem: {
      p3_bulb: () => ctx.cutscene(async () => {
        const n = numberFlag(ctx, 'p3_bulbs_planted');
        if (n >= 2 || (ctx.flag('p3_jar_plant') || 'none') !== 'none') return;
        ctx.take('p3_bulb'); ctx.state.select(null);
        ctx.setFlag('p3_bulbs_planted', n + 1); ctx.setFlag('p3_jar_plant', 'sprout'); ctx.setFlag('p3_jar_kind', kindOf(n));
        ctx.sfx('squish');
        await bellJar.plant();
      }),
    },
  });
  ctx.hotspots.define({
    id: 'p3_jar_flower', views: ['p3_bell_jar'], object: bellJar.getObjectByName('jar_flower_hit'), cursor: 'grab',
    when: () => !!ctx.flag('p3_jar_dome_up') && ctx.flag('p3_jar_plant') === 'flower',
    onClick: async () => {
      const kind = ctx.flag('p3_jar_kind') || 'orange';
      const item = kind === 'rose' ? 'p3_rose' : 'p3_flower_orange';
      if (!(await giveItem(ctx, item, bellJar.getObjectByName('jar_flower_hit')))) return;
      ctx.setFlag(kind === 'rose' ? 'p3_rose_taken' : 'p3_flower_orange_taken');
      ctx.setFlag('p3_jar_plant', 'none'); ctx.setFlag('p3_jar_kind', null);
      await bellJar.harvest();
    },
  });

  // ---- 陶轮
  ctx.hotspots.define({ id: 'p3_wheel_zoom', views: room_, object: wheel, cursor: 'zoom', goto: 'p3_wheel' });
  ctx.hotspots.define({
    id: 'p3_wheel_place', views: ['p3_wheel'], object: wheel.getObjectByName('wheel_hit'), cursor: 'use', when: () => !ctx.flag('p3_wheel_clay'),
    onItem: {
      p3_clay: () => ctx.cutscene(async () => {
        if (ctx.flag('p3_wheel_clay')) return;
        ctx.take('p3_clay'); ctx.state.select(null);
        ctx.setFlag('p3_wheel_clay'); ctx.setFlag('p3_wheel_shape', potKey(POT_START));
        ctx.sfx('squish');
        await wheel.setClay(true); wheel.spin(true);
      }),
    },
  });
  for (let seg = 0; seg < 3; seg++) {
    ctx.hotspots.define({
      id: `p3_pot_seg_${seg}`, views: ['p3_wheel'], object: wheel.getObjectByName(`pot_seg_${seg}_hit`), cursor: 'pointer',
      when: () => !!ctx.flag('p3_wheel_clay'),
      onClick: () => ctx.cutscene(async () => {
        const shape = potPoke(shapeOf(ctx), seg);
        ctx.setFlag('p3_wheel_shape', potKey(shape)); ctx.sfx('squish');
        wheel.poke(seg);
        await wheel.setShape(shape);
        const kind = potMatch(shape);
        if (!kind || ctx.flag(`p3_vase_${kind}_made`)) return;
        // 做出了墙上的某种器形：陶坯一闪，拿到花瓶
        ctx.setFlag(`p3_vase_${kind}_made`); ctx.setFlag('p3_wheel_clay', false); ctx.setFlag('p3_wheel_shape', potKey(POT_START));
        ctx.sfx('holy');
        await wheel.finish();
        wheel.spin(false);
        await wheel.setState({ clay: false, shape: POT_START });
        await giveItem(ctx, kind === 'slim' ? 'p3_vase_slim' : 'p3_vase_urn', wheel);
      }),
    });
  }
}

export function sync(ctx) {
  if (!S) return;
  const { gerard, ida, bellJar, shovel, wheel, ear } = S;
  shovel.visible = !ctx.flag('p3_shovel_taken');
  const hair = numberFlag(ctx, 'p3_hair'), earCut = !!ctx.flag('p3_ear_cut');
  gerard.setState({ hair, scalpMap: hair >= 3, ear: !earCut });
  ida.setState({ scissors: !!ctx.flag('p3_scissors_given') });
  ear.visible = earCut && !ctx.flag('p3_ear_taken');
  bellJar.setState({ dome: ctx.flag('p3_jar_dome_up') ? 'up' : 'down', plant: ctx.flag('p3_jar_plant') || 'none', kind: ctx.flag('p3_jar_kind') || 'orange' });
  const clay = !!ctx.flag('p3_wheel_clay');
  wheel.setState({ clay, shape: shapeOf(ctx) });
  wheel.spin(clay);
}

/** 小屋：拿铲子；Ida 和 Gerard（剪刀要等神殿）在 hairWalkthrough 里；钟罩种花要有球茎，在 jarWalkthrough 里。 */
export const walkthrough = [
  { go: 'house_clearing' }, { click: 'house_entry' }, { expectView: 'house_int' }, { click: 'p3_shovel' }, { expectItem: 'p3_shovel' }, { click: 'house_exit' },
];
export const hairWalkthrough = [
  { go: 'house_clearing' }, { click: 'house_entry' }, { click: 'p3_ida_zoom' }, { expectView: 'p3_barber' }, { click: 'p3_ida' },
  { use: 'p3_scissors', on: 'p3_ida' }, { expectFlag: 'p3_scissors_given' },
  { repeat: 3, step: { click: 'p3_gerard_hair' } }, { expectFlag: ['p3_hair', 3] },
  { click: 'p3_gerard_hair' }, { expectFlag: 'p3_ear_cut' }, { click: 'p3_ear_item' }, { expectItem: 'p3_ear' }, { expectFlag: 'p3_ear_taken' },
  { click: 'p3_gerard_hair' }, { expectView: 'p3_scalp' }, { back: true }, { back: true }, { click: 'house_exit' },
];
export const wheelWalkthrough = [
  { go: 'house_clearing' }, { click: 'house_entry' }, { click: 'p3_wheel_zoom' }, { expectView: 'p3_wheel' },
  ...['slim', 'urn'].flatMap((kind) => [
    { use: 'p3_clay', on: 'p3_wheel_place' },
    ...potRecipe(kind).map((s) => ({ click: `p3_pot_seg_${s}` })),
    { expectFlag: `p3_vase_${kind}_made` },
  ]),
  { expectItem: ['p3_vase_slim', 'p3_vase_urn'] }, { back: true }, { click: 'house_exit' },
];
/** 钟罩：先升起；然后（种球茎 → 落下长花 → 升起 → 摘花）做两遍。 */
export const jarWalkthrough = [
  { go: 'house_clearing' }, { click: 'house_entry' }, { click: 'p3_jar_zoom' }, { expectView: 'p3_bell_jar' }, { click: 'p3_jar_dome' },
  ...[0, 1].flatMap(() => [
    { use: 'p3_bulb', on: 'p3_jar_pot' }, { click: 'p3_jar_dome' }, { click: 'p3_jar_dome' }, { click: 'p3_jar_flower' },
  ]),
  { expectItem: ['p3_flower_orange', 'p3_rose'] }, { click: 'p3_jar_dome' }, { back: true }, { click: 'house_exit' },
];
