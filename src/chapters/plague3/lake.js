// 湖岸：脸上爬满蚊子的 Margaret（苍蝇拍给她，拿死蚊子）和她右手边的木桩（蜗牛、斧子，砍裂后有“第三个符号”）（docs/plague3_design.md 4.5）。
// 旗标：p3_margaret_swatted / p3_gnats_taken / p3_snail_taken / p3_axe_taken / p3_stump_hits（0..8）；sync() 双向恢复。
import { W, SPOTS, placeProp, character, closeup, giveItem, numberFlag, addCircle } from './world.js';

let S;

/** 砍木桩的次数 → 裂纹级别：第 3、6、8 下裂纹加深。 */
export const crackOf = (hits) => (hits >= 8 ? 3 : hits >= 6 ? 2 : hits >= 3 ? 1 : 0);

export async function setup(ctx) {
  const ext = W.zones.exterior;
  const margaret = character(ctx, 'margaret_gnats', SPOTS.margaret);
  const stump = placeProp(ext, 'p3_stump', SPOTS.stump.pos, { rotY: SPOTS.stump.rotY });
  // 拍死的一撮蚊子落在她腿上
  const dead = placeProp(margaret.root, 'p3_gnats', [0.0, 0.5, 0.36], { scale: 2.4 });
  dead.rotation.set(0.5, 0, 0); dead.visible = false;
  S = { margaret, stump, dead };
  Object.assign(W, S);
  addCircle(SPOTS.margaret.pos[0], SPOTS.margaret.pos[2], 0.42);
  addCircle(SPOTS.stump.pos[0], SPOTS.stump.pos[2], 0.32);

  closeup(ctx, 'p3_margaret', margaret.root, 'lake_shore', { target: [0, 0.82, 0.15], eye: [0.2, 1.0, 2.3], fov: 40 });
  closeup(ctx, 'p3_stump', stump, 'lake_shore', { target: [0, 0.3, 0], eye: [0.1, 0.5, 1.6], fov: 40 });

  // ---- Margaret：苍蝇拍给她，她拍死脸上的蚊子
  ctx.hotspots.define({
    id: 'p3_margaret', views: ['lake_shore', 'p3_margaret'], object: margaret.root, cursor: 'talk',
    onClick: async () => { if (ctx.state.view !== 'p3_margaret') await ctx.go('p3_margaret'); },
    onItem: {
      p3_swatter: () => ctx.cutscene(async () => {
        if (ctx.flag('p3_margaret_swatted')) return;
        ctx.take('p3_swatter'); ctx.state.select(null);
        ctx.setFlag('p3_margaret_swatted');
        if (ctx.state.view !== 'p3_margaret') await ctx.go('p3_margaret');
        await margaret.takeSwatter();
        ctx.sfx('wing');
        const swat = margaret.swat();
        await ctx.wait(500); ctx.sfx('click');
        await swat;
        dead.visible = !ctx.flag('p3_gnats_taken');
      }),
    },
  });
  ctx.hotspots.define({
    id: 'p3_gnats_item', views: ['lake_shore', 'p3_margaret'], object: dead, cursor: 'grab',
    when: () => !!ctx.flag('p3_margaret_swatted') && !ctx.flag('p3_gnats_taken'),
    onClick: async () => {
      if (!(await giveItem(ctx, 'p3_gnats', dead))) return;
      ctx.setFlag('p3_gnats_taken'); dead.visible = false;
    },
  });

  // ---- 木桩：蜗牛、斧子；斧子砍它（成就“第三个符号”）
  ctx.hotspots.define({ id: 'p3_stump_zoom', views: ['lake_shore'], object: stump, cursor: 'zoom', goto: 'p3_stump' });
  ctx.hotspots.define({
    id: 'p3_snail', views: ['p3_stump'], object: stump.getObjectByName('stump_snail_hit'), cursor: 'grab', when: () => !ctx.flag('p3_snail_taken'),
    onClick: async () => {
      if (!(await giveItem(ctx, 'p3_snail', stump.getObjectByName('stump_snail_hit')))) return;
      ctx.setFlag('p3_snail_taken'); await stump.takeSnail();
    },
  });
  ctx.hotspots.define({
    id: 'p3_axe', views: ['p3_stump'], object: stump.getObjectByName('stump_axe_hit'), cursor: 'grab', when: () => !ctx.flag('p3_axe_taken'),
    onClick: async () => {
      if (!(await giveItem(ctx, 'p3_axe', stump.getObjectByName('stump_axe_hit')))) return;
      ctx.setFlag('p3_axe_taken'); await stump.takeAxe();
    },
  });
  ctx.hotspots.define({
    id: 'p3_stump_hit', views: ['p3_stump'], object: stump.getObjectByName('stump_hit'), cursor: 'use',
    onItem: {
      p3_axe: () => ctx.cutscene(async () => {
        const hits = Math.min(8, numberFlag(ctx, 'p3_stump_hits') + 1);
        if (hits === numberFlag(ctx, 'p3_stump_hits')) return;
        ctx.setFlag('p3_stump_hits', hits); ctx.sfx('chop');
        await stump.hit();
        const crack = crackOf(hits);
        if (crack !== crackOf(hits - 1)) { ctx.sfx('creak'); await stump.setCrack(crack); }
      }),
    },
  });
  ctx.hotspots.define({
    id: 'p3_stump_symbol', views: ['p3_stump'], object: stump.getObjectByName('stump_symbol_hit'), cursor: 'pointer',
    when: () => crackOf(numberFlag(ctx, 'p3_stump_hits')) >= 3,
    onClick: async () => { ctx.sfx('achievement'); ctx.achieve('the_third_symbol', { anchor: stump }); },
  });
}

export function sync(ctx) {
  if (!S) return;
  const { margaret, stump, dead } = S;
  const swatted = !!ctx.flag('p3_margaret_swatted');
  margaret.setState({ gnats: !swatted, swatter: swatted, swatted });
  dead.visible = swatted && !ctx.flag('p3_gnats_taken');
  stump.setState({ axe: !ctx.flag('p3_axe_taken'), snail: !ctx.flag('p3_snail_taken'), crack: crackOf(numberFlag(ctx, 'p3_stump_hits')) });
}

/** 湖岸：苍蝇拍给 Margaret、拿蚊子；木桩拿蜗牛和斧子。 */
export const walkthrough = [
  { go: 'lake_shore' }, { click: 'p3_margaret' }, { expectView: 'p3_margaret' },
  { use: 'p3_swatter', on: 'p3_margaret' }, { expectFlag: 'p3_margaret_swatted' }, { click: 'p3_gnats_item' }, { expectItem: 'p3_gnats' }, { back: true },
  { click: 'p3_stump_zoom' }, { expectView: 'p3_stump' }, { click: 'p3_snail' }, { click: 'p3_axe' }, { expectItem: ['p3_snail', 'p3_axe'] },
  // 成就“第三个符号”：斧子砍木桩 8 下裂开，点里面的符号（可选；斧子不会用掉，之后照样去砍红叉树）
  { repeat: 8, step: { use: 'p3_axe', on: 'p3_stump_hit' } }, { click: 'p3_stump_symbol' }, { back: true },
];
