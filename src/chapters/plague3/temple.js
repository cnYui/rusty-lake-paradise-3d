// 神殿：凳子上的剪刀、左窗台的小盘和鹦鹉（成就“哈维”）、黑方块仪式与结尾（docs/plague3_design.md 4.6）。
// 中途读档可继续结尾，吊架下降按差值恢复（不累加）。
import { makeProp } from '../../art/props.js';
import { W, SPOTS, placeProp, closeup, giveItem, instant } from './world.js';
import { FLOWER_KIND } from './puzzles.js';
import { T } from './text.js';

let S;
const HOLDER_OPTIONS = { ropeLength: 3.05 };
const FLOWER_ITEMS = Object.keys(FLOWER_KIND);

function cleanFont(font) {
  // 第一灾的圣水盆默认脉动血色；只调整本章实例，保留公共模型和其它章节的材质。
  const u = font.getObjectByName('font_liquid').material.uniforms;
  u.uRedDark.value.copy(u.uGreyDark.value); u.uRedMid.value.copy(u.uGreyLight.value); u.uRedLight.value.set('#565854');
  font.userData.state.ambient = false;
  return font;
}

/** 第三灾画作的状态（开局 = 溪流已净化、青蛙已消失、方块未点亮）。 */
const paintingState = (ctx) => ({
  lit: !!ctx.flag('p3_painting_lit'), purified: true, frogsGone: true,
  womanFramed: false, womanGone: !!ctx.flag('p3_woman_banished'), flyFramed: !!ctx.flag('p3_fly_framed'),
});
function newPainting(ctx) {
  const p = makeProp('plague_painting', { insects: true });
  p.setState(paintingState(ctx));
  ctx.register('prop', 'p3_plague_painting', p);
  return p;
}
function mountPainting(font, painting) {
  const niche = font.getObjectByName('font_niche');
  painting.position.copy(niche.position); painting.position.z += 0.01;
  font.add(painting);
}
/** 公共道具里不可逆的部分（插方块、点燃）要回退时，只重建这一个道具。 */
function replaceProp(ctx, current, id, options) {
  const next = makeProp(id, options);
  next.position.copy(current.position); next.rotation.copy(current.rotation); next.scale.copy(current.scale);
  current.parent.add(next); current.removeFromParent();
  ctx.register('prop', `p3_${id}`, next);
  return next;
}

async function finishRitual(ctx) {
  if (!ctx.flag('p3_cube_inserted') || ctx.flag('plague3_complete')) return;
  if (!ctx.flag('p3_holder_closed')) { await S.holder.close(); ctx.setFlag('p3_holder_closed'); }
  await ctx.go('temple_int');
  if (!ctx.flag('p3_holder_lowered')) { await S.holder.lower(1.2 - S.holder.userData.state.lowered); ctx.setFlag('p3_holder_lowered'); }
  ctx.sfx('holy'); await S.font.ignite(); await ctx.wait(700); await ctx.go('painting');
  if (!ctx.flag('p3_painting_lit')) { await S.painting.glowCube(); ctx.setFlag('p3_painting_lit'); }
  if (!ctx.flag('p3_woman_banished')) { await S.painting.banishWoman(); ctx.setFlag('p3_woman_banished'); }
  if (!ctx.flag('p3_fly_framed')) { await S.painting.frameFly(); ctx.setFlag('p3_fly_framed'); }
  ctx.setFlag('plague3_complete');
  await ctx.ui.ending(T.ending);
}

export async function setup(ctx) {
  const position = (id) => ctx.world.anchor(id).getWorldPosition(new ctx.THREE.Vector3()).toArray();
  const room = W.zones.temple_int;
  const holder = placeProp(room, 'winged_holder', position('temple_int.holder'), { props: HOLDER_OPTIONS });
  const font = cleanFont(placeProp(room, 'font', position('temple_int.font')));
  ctx.world.buildings.sets.temple_int.getObjectByName('temple_int_rope').visible = false;
  const painting = newPainting(ctx);
  mountPainting(font, painting);
  const stool = placeProp(room, 'temple_stool', SPOTS.temple.stool.pos, { rotY: SPOTS.temple.stool.rotY });
  const scissors = placeProp(stool, 'p3_scissors', [0, 0.47, 0], { scale: 1.5 });
  scissors.rotation.set(0, 0.5, 0);
  // 左窗台：小白盘 + 鹦鹉 Harvey
  const winL = position('temple_int.windowL');
  const plate = placeProp(room, 'p3_sill_plate', [winL[0], 1.74, winL[2] - 0.02]);
  const parrot = placeProp(room, 'p3_parrot', [winL[0] + 0.28, 1.74, winL[2] - 0.02]);
  parrot.setVisible(false);
  S = { holder, font, painting, stool, scissors, plate, parrot };
  Object.assign(W, S);

  closeup(ctx, 'holder', holder, 'temple_int', { zone: 'temple_int', target: [0, -0.24, 0], eye: [0, -0.18, 1.5], fov: 36 });
  closeup(ctx, 'painting', painting, 'temple_int', { zone: 'temple_int', target: [0, 0.177, 0], eye: [0, 0.18, 0.7], fov: 41 });
  closeup(ctx, 'p3_sill', plate, 'temple_int', { zone: 'temple_int', target: [0.12, 0.05, 0], eye: [0.12, 0.3, 0.85], fov: 40 });

  // ---- 剪刀
  const beltHit = ctx.hotspots.makeProxy(0.36, 0.22, 0.22, [0, 0.52, 0], stool);
  ctx.hotspots.define({
    id: 'p3_scissors_item', views: ['temple_int'], object: beltHit, cursor: 'grab', when: () => !ctx.flag('p3_scissors_taken'),
    onClick: async () => {
      if (!(await giveItem(ctx, 'p3_scissors', stool))) return;
      ctx.setFlag('p3_scissors_taken'); scissors.visible = false;
    },
  });

  // ---- 窗台小盘：放一朵花；离开再回来，鹦鹉落在盘边；点它得成就。点盘子能把花拿回来
  ctx.hotspots.define({ id: 'p3_sill_zoom', views: ['temple_int'], object: plate, cursor: 'zoom', goto: 'p3_sill' });
  ctx.hotspots.define({
    id: 'p3_sill_plate', views: ['p3_sill'], object: plate.getObjectByName('plate_hit'), cursor: 'use',
    onClick: async () => {
      const item = ctx.flag('p3_sill_flower');
      if (!item) return;
      if (!(await giveItem(ctx, item, plate))) return;
      ctx.setFlag('p3_sill_flower', null); ctx.setFlag('p3_parrot', false);
      parrot.setVisible(false); await plate.setFlowers(null);
    },
    onItem: Object.fromEntries(FLOWER_ITEMS.map((id) => [id, () => ctx.cutscene(async () => {
      if (ctx.flag('p3_sill_flower')) return;
      ctx.take(id); ctx.state.select(null);
      ctx.setFlag('p3_sill_flower', id); ctx.sfx('pickup');
      await plate.setFlowers(id);
    })])),
  });
  ctx.hotspots.define({
    id: 'p3_parrot', views: ['temple_int', 'p3_sill'], object: parrot.getObjectByName('parrot_hit'), cursor: 'talk',
    when: () => !!ctx.flag('p3_parrot') && !ctx.flag('p3_harvey_seen'),
    onClick: async () => { ctx.setFlag('p3_harvey_seen'); parrot.tilt?.(); ctx.sfx('wing'); ctx.achieve('harvey', { anchor: parrot }); },
  });
  // 进神殿时：盘里放着花就让鹦鹉飞来（第一次进来之后）
  W.templeEnter = () => {
    if (ctx.flag('p3_sill_flower') && !ctx.flag('p3_parrot')) { ctx.setFlag('p3_parrot'); parrot.setVisible(true); ctx.sfx('wing'); }
  };

  // ---- 吊架：点它打开；选中黑方块放进去，自动演出结尾
  ctx.hotspots.define({
    id: 'holder', views: ['temple_int', 'holder'], object: holder.getObjectByName('holder_body'), cursor: 'use', when: () => !ctx.flag('plague3_complete'),
    onClick: async () => {
      if (ctx.flag('p3_cube_inserted')) return ctx.cutscene(() => finishRitual(ctx));
      if (ctx.state.view !== 'holder') return ctx.go('holder');
      if (!ctx.flag('p3_holder_open')) { await S.holder.open(); ctx.setFlag('p3_holder_open'); }
    },
    onItem: {
      black_cube: () => ctx.cutscene(async () => {
        if (!ctx.flag('p3_cube_taken')) return;
        if (ctx.state.view !== 'holder') await ctx.go('holder');
        if (!ctx.flag('p3_holder_open')) { await S.holder.open(); ctx.setFlag('p3_holder_open'); }
        if (!ctx.flag('p3_cube_inserted')) { ctx.take('black_cube'); ctx.state.select(null); await S.holder.insertCube(); ctx.setFlag('p3_cube_inserted'); }
        await finishRitual(ctx);
      }),
    },
  });
  ctx.hotspots.define({
    id: 'painting', views: ['painting'], object: painting, cursor: 'pointer',
    when: () => !!ctx.flag('p3_cube_inserted') && !ctx.flag('plague3_complete'), onClick: () => ctx.cutscene(() => finishRitual(ctx)),
  });
}

export function sync(ctx) {
  if (!S) return;
  const cube = !!ctx.flag('p3_cube_inserted'), closed = !!ctx.flag('p3_holder_closed'), lit = !!ctx.flag('p3_holder_lowered');
  // 吊架：方块插进去后不能拔出来，读档回到没插方块时重建
  if (S.holder.userData.state.cube && !cube) {
    S.holder = replaceProp(ctx, S.holder, 'winged_holder', HOLDER_OPTIONS);
    ctx.hotspots.get('holder').object = S.holder.getObjectByName('holder_body');
  }
  if (ctx.flag('p3_holder_open') && !closed) S.holder.open(instant); else S.holder.close(instant);
  if (cube) S.holder.insertCube(instant);
  S.holder.lower((lit ? 1.2 : 0) - S.holder.userData.state.lowered, instant);
  // 圣水盆：点燃后不能熄灭，同理重建（画作要重新挂回去）
  if (S.font.userData.state.lit && !lit) {
    S.painting.removeFromParent();
    S.font = cleanFont(replaceProp(ctx, S.font, 'font'));
    S.painting = newPainting(ctx);
    mountPainting(S.font, S.painting);
    ctx.hotspots.get('painting').object = S.painting;
  }
  if (lit) S.font.ignite(instant);
  S.painting.setState(paintingState(ctx));
  S.scissors.visible = !ctx.flag('p3_scissors_taken');
  const flower = ctx.flag('p3_sill_flower');
  S.plate.setFlowers(flower || null, instant);
  S.parrot.setVisible(!!ctx.flag('p3_parrot') && !!flower);
  Object.assign(W, { holder: S.holder, font: S.font, painting: S.painting });
}

/** 神殿：拿剪刀。 */
export const walkthrough = [
  { go: 'temple_door' }, { click: 'temple_entry' }, { expectView: 'temple_int' }, { click: 'p3_scissors_item' }, { expectItem: 'p3_scissors' }, { back: true },
];
/** 结尾：黑方块放进吊架，一路演出到 plague3_complete。 */
export const endingWalkthrough = [
  { go: 'temple_door' }, { click: 'temple_entry' }, { click: 'holder' }, { click: 'holder' },
  { use: 'black_cube', on: 'holder' }, { expectFlag: 'plague3_complete' },
];
