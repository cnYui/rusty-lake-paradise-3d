// 白桦林（独立 zone p3_grove，可走动）：浆果丛、割汁白桦（和茧）、David 的圆桌、幼虫、神龛和回忆（docs/plague3_design.md 4.7）。
// 摆放用美术导出的 GROVE_LAYOUT 锚点（相对布景原点）。桌上三样、神龛上的花瓶和花、记忆的进度都存进 flags；sync() 双向恢复。
import { makeProp } from '../../art/props.js';
import { makeCharacter } from '../../art/characters.js';
import { GROVE_LAYOUT } from '../../art/props_p3_grove.js';
import { MEMORY_LINEUP, ghostFade } from '../../art/cast_p3_memory.js';
import { DAVID_TO_TABLE_CENTER } from '../../art/cast_p3_family.js';
import { W, GROVE_ORIGIN, placeProp, character, closeup, giveItem } from './world.js';
import { shrineUse, shrineComplete, VASE_KIND, FLOWER_KIND } from './puzzles.js';
import { T } from './text.js';

let S;
const L = GROVE_LAYOUT;
const at = ([x, y, z]) => [GROVE_ORIGIN[0] + x, GROVE_ORIGIN[1] + y, GROVE_ORIGIN[2] + z];

/** 神龛的当前摆放（来自旗标）。 */
const shrineStateOf = (ctx) => ({
  vases: [ctx.flag('p3_shrine_vase_1') || null, ctx.flag('p3_shrine_vase_2') || null],
  flowers: [0, 1, 2].map((i) => ctx.flag(`p3_shrine_flower_${i}`) || null),
});
const tableOf = (ctx) => ({ berries: !!ctx.flag('p3_table_berries'), sap: !!ctx.flag('p3_table_sap'), honey: !!ctx.flag('p3_table_honey') });

/** 回忆里的一家人（半透明淡入站成一排，推荐队形来自美术）。 */
function buildFamily(ctx, grove) {
  const center = at([L.shrine.pos[0], 0, L.shrine.pos[2] + 2.5]);
  const rigs = {};
  for (const id of ['gerard_young', 'margaret_baby', 'ida_child', 'jakob_child', 'caroline_rose', 'nicholas_stand']) {
    const rig = makeCharacter(id);
    const lay = MEMORY_LINEUP[id];
    if (id === 'jakob_child') ghostFade(rig);    // 少年 Jakob 来自 cast.js，半透明淡入要手动套一次
    rig.root.position.set(center[0] + lay.pos[0], 0, center[2] + lay.pos[2]);
    rig.root.rotation.y = lay.yaw;
    rig.root.visible = false;
    grove.add(rig.root);
    ctx.register('char', `p3_memory_${id}`, rig);
    rigs[id] = rig;
  }
  return { rigs, center };
}

export async function setup(ctx) {
  const grove = W.zones.p3_grove;
  const tablePos = at(L.table.pos);
  const table = placeProp(grove, 'p3_grove_table', tablePos, { rotY: L.table.yaw });
  // David 坐在圆桌后：root 在桌坐标 (0, 0, −DAVID_TO_TABLE_CENTER)
  const david = character(ctx, 'david_table', { pos: [tablePos[0], 0, tablePos[2] - DAVID_TO_TABLE_CENTER], rotY: L.table.yaw }, 'p3_grove');
  const larva = placeProp(grove, 'p3_larva', at(L.larva.pos), { rotY: L.larva.yaw });
  const shrine = placeProp(grove, 'p3_shrine', at(L.shrine.pos), { rotY: L.shrine.yaw });
  const bush = placeProp(grove, 'p3_berry_bush', at(L.berries.pos), { rotY: L.berries.yaw });
  const birch = placeProp(grove, 'p3_birch_tap', at(L.tapBirch.pos), { rotY: L.tapBirch.yaw });
  const frame = placeProp(grove, 'memory_frame', at([L.shrine.pos[0], 0.15, L.shrine.pos[2] + 0.5]), { props: { w: 3.8, h: 2.7 } });
  const family = buildFamily(ctx, grove);
  S = { table, david, larva, shrine, bush, birch, frame, family };
  Object.assign(W, S);

  // ---- 视图（特写都在 p3_grove 这个 zone 里；机位用物体局部坐标，跟着物体走）
  closeup(ctx, 'p3_berries', bush, 'p3_grove', { zone: 'p3_grove', target: [-0.07, 0.34, 0.06], eye: [-0.05, 0.62, 1.1], fov: 40 });
  closeup(ctx, 'p3_birch', birch, 'p3_grove', { zone: 'p3_grove', target: [0.05, 0.9, 0], eye: [0.1, 1.2, 2.5], fov: 44 });
  closeup(ctx, 'p3_david', table, 'p3_grove', { zone: 'p3_grove', target: [0.1, 0.55, 0.3], eye: [0.55, 1.5, 2.9], fov: 44 });
  closeup(ctx, 'p3_shrine', shrine, 'p3_grove', { zone: 'p3_grove', target: [0, 1.15, 0.2], eye: [0, 1.5, 3.3], fov: 44 });
  closeup(ctx, 'p3_portrait', shrine, 'p3_shrine', { zone: 'p3_grove', target: [0, 1.87, 0.05], eye: [0, 1.87, 1.25], fov: 40 });
  ctx.views.define({
    id: 'p3_memory', zone: 'p3_grove', closeup: true, look: 0, back: 'p3_shrine',
    cam: { pos: at([L.shrine.pos[0], 1.55, L.shrine.pos[2] + 6.4]), target: at([L.shrine.pos[0], 1.3, L.shrine.pos[2]]), fov: 48 },
  });

  // ---- 浆果丛
  ctx.hotspots.define({ id: 'p3_berry_zoom', views: ['p3_grove'], object: bush, cursor: 'zoom', goto: 'p3_berries' });
  ctx.hotspots.define({
    id: 'p3_berry_pick', views: ['p3_berries'], object: bush.getObjectByName('berry_hit'), cursor: 'grab', when: () => !ctx.flag('p3_berries_taken'),
    onClick: async () => {
      if (!(await giveItem(ctx, 'p3_berries', bush.getObjectByName('berry_hit')))) return;
      ctx.setFlag('p3_berries_taken'); ctx.sfx('rustle'); await bush.pick();
    },
  });

  // ---- 割汁白桦：斧子割，罐子接满；拿走后树上挂出一个茧（成就“蝴蝶”）
  ctx.hotspots.define({ id: 'p3_birch_zoom', views: ['p3_grove'], object: birch, cursor: 'zoom', goto: 'p3_birch' });
  ctx.hotspots.define({
    id: 'p3_birch_tap', views: ['p3_birch'], object: birch.getObjectByName('tap_hit'), cursor: 'use', when: () => !ctx.flag('p3_birch_tapped'),
    onItem: {
      p3_axe: () => ctx.cutscene(async () => {
        if (ctx.flag('p3_birch_tapped')) return;
        ctx.setFlag('p3_birch_tapped'); ctx.state.select(null); ctx.sfx('chop');
        await birch.tap(); ctx.sfx('pour');
        await birch.fill();
      }),
    },
  });
  ctx.hotspots.define({
    id: 'p3_jug', views: ['p3_birch'], object: birch.getObjectByName('tap_jug_hit'), cursor: 'grab',
    when: () => !!ctx.flag('p3_birch_tapped') && !ctx.flag('p3_sap_taken'),
    onClick: async () => {
      if (!(await giveItem(ctx, 'p3_sap', birch.getObjectByName('tap_jug_hit')))) return;
      ctx.setFlag('p3_sap_taken'); ctx.setFlag('p3_cocoon', 'hanging');
      await birch.takeJug(); await birch.showCocoon(true);
    },
  });
  ctx.hotspots.define({
    id: 'p3_cocoon', views: ['p3_birch'], object: birch.getObjectByName('cocoon_hit'), cursor: 'pointer', when: () => ctx.flag('p3_cocoon') === 'hanging',
    onClick: () => ctx.cutscene(async () => {
      ctx.setFlag('p3_cocoon', 'hatched'); ctx.sfx('hatch');
      const hatch = birch.hatch();
      await ctx.wait(1200); ctx.achieve('the_butterfly', { anchor: birch });
      await hatch;
    }),
  });

  // ---- David 的圆桌：浆果进碗、树汁进杯、蜂蜜抹面包；三样齐了蚊群盖住他，他消失，桌前剩一团被蚊子盖住的东西
  ctx.hotspots.define({ id: 'p3_david_zoom', views: ['p3_grove'], object: table.getObjectByName('table_hit'), cursor: 'zoom', goto: 'p3_david' });
  ctx.hotspots.define({ id: 'p3_david_zoom_man', views: ['p3_grove'], object: david.root, cursor: 'talk', when: () => !ctx.flag('p3_david_covered'), goto: 'p3_david' });
  ctx.hotspots.define({
    id: 'p3_david', views: ['p3_david'], object: david.root, cursor: 'talk', when: () => !ctx.flag('p3_david_covered'),
    onClick: async () => {
      ctx.setFlag('p3_david_talked');
      const talk = david.talk(); await ctx.say(T.david); await talk;
    },
  });
  const maybeFinishTable = async () => {
    const t = tableOf(ctx);
    if (!(t.berries && t.sap && t.honey) || ctx.flag('p3_david_covered')) return;
    ctx.setFlag('p3_david_covered');
    ctx.sfx('hum');
    await david.coverWithGnats();
    await david.vanish();
    larva.visible = true;
    await larva.setState({ gnats: 1 });
    ctx.sfx('stinger');
  };
  const serve = (part, item, flag, set) => ({
    [item]: () => ctx.cutscene(async () => {
      if (ctx.flag(flag)) return;
      ctx.take(item); ctx.state.select(null);
      ctx.setFlag(flag); ctx.sfx(part);
      await set();
      await maybeFinishTable();
    }),
  });
  ctx.hotspots.define({
    id: 'p3_table_bowl', views: ['p3_david'], object: table.getObjectByName('table_bowl_hit'), cursor: 'use', when: () => !ctx.flag('p3_david_covered'),
    onItem: serve('rustle', 'p3_berries', 'p3_table_berries', () => table.setBerries(true)),
  });
  ctx.hotspots.define({
    id: 'p3_table_cup', views: ['p3_david'], object: table.getObjectByName('table_cup_hit'), cursor: 'use', when: () => !ctx.flag('p3_david_covered'),
    onItem: serve('pour', 'p3_sap', 'p3_table_sap', () => table.setSap(true)),
  });
  ctx.hotspots.define({
    id: 'p3_table_plate', views: ['p3_david'], object: table.getObjectByName('table_plate_hit'), cursor: 'use', when: () => !ctx.flag('p3_david_covered'),
    onItem: serve('squish', 'p3_honey', 'p3_table_honey', () => table.setHoney(true)),
  });

  // ---- 幼虫：点黑团 → 蚊子飞散；点嘴 → 吐出球茎；点球茎拿走
  ctx.hotspots.define({
    id: 'p3_larva_zoom', views: ['p3_grove'], object: larva.getObjectByName('larva_body_hit'), cursor: 'zoom', when: () => !!ctx.flag('p3_david_covered'), goto: 'p3_david',
  });
  ctx.hotspots.define({
    id: 'p3_larva_body', views: ['p3_david'], object: larva.getObjectByName('larva_body_hit'), cursor: 'pointer',
    when: () => !!ctx.flag('p3_david_covered') && !ctx.flag('p3_larva_cleared'),
    onClick: () => ctx.cutscene(async () => {
      ctx.setFlag('p3_larva_cleared'); ctx.sfx('wing');
      await larva.clearGnats();
    }),
  });
  ctx.hotspots.define({
    id: 'p3_larva_mouth', views: ['p3_david'], object: larva.getObjectByName('larva_mouth_hit'), cursor: 'pointer',
    when: () => !!ctx.flag('p3_larva_cleared') && !ctx.flag('p3_larva_spat'),
    onClick: () => ctx.cutscene(async () => {
      ctx.setFlag('p3_larva_spat'); ctx.sfx('vomit');
      await larva.spit();
      ctx.achieve('spitting_larva', { anchor: larva });
    }),
  });
  ctx.hotspots.define({
    id: 'p3_larva_bulb', views: ['p3_david'], object: larva.getObjectByName('larva_bulb_hit'), cursor: 'grab',
    when: () => !!ctx.flag('p3_larva_spat') && !ctx.flag('p3_larva_bulb_taken'),
    onClick: async () => {
      if (!(await giveItem(ctx, 'p3_bulb', larva.getObjectByName('larva_bulb_hit')))) return;
      ctx.setFlag('p3_larva_bulb_taken'); await larva.takeBulb();
    },
  });

  // ---- 神龛：左柱长颈瓶插黄花，中右柱放自己做的花瓶再插橙花 / 玫瑰；三朵花齐了蚊群飞向画像，吃掉她的眼睛
  ctx.hotspots.define({ id: 'p3_shrine_zoom', views: ['p3_grove'], object: shrine.getObjectByName('shrine_hit'), cursor: 'zoom', goto: 'p3_shrine' });
  const shrineItems = [...Object.keys(VASE_KIND), ...Object.keys(FLOWER_KIND)];
  const placeOn = (slot) => (_, item) => ctx.cutscene(async () => {
    const r = shrineUse(shrineStateOf(ctx), slot, item);
    if (!r) { ctx.sfx('wrong'); ctx.state.select(null); return; }
    ctx.take(item); ctx.state.select(null);
    if (r.kind === 'vase') {
      ctx.setFlag(`p3_shrine_vase_${slot}`, r.value); ctx.sfx('click');
      await shrine.setVase(slot, r.value);
    } else {
      ctx.setFlag(`p3_shrine_flower_${slot}`, r.value); ctx.sfx('rustle');
      await shrine.setFlower(slot, r.value);
    }
    if (shrineComplete(shrineStateOf(ctx)) && !ctx.flag('p3_portrait_eyes')) {
      ctx.setFlag('p3_portrait_eyes'); ctx.sfx('hum');
      await shrine.gnatsToPortrait();
    }
  });
  for (let slot = 0; slot < 3; slot++) {
    ctx.hotspots.define({
      id: `p3_shrine_slot_${slot}`, views: ['p3_shrine'], object: shrine.getObjectByName(`shrine_slot_${slot}`), cursor: 'use',
      onItem: Object.fromEntries(shrineItems.map((id) => [id, placeOn(slot)])),
    });
  }
  // 画像：眼睛被吃掉之后点它 → 画像特写；再点 → 回忆
  ctx.hotspots.define({
    id: 'p3_portrait_zoom', views: ['p3_shrine'], object: shrine.getObjectByName('shrine_portrait_hit'), cursor: 'zoom',
    when: () => !!ctx.flag('p3_portrait_eyes') && !ctx.flag('p3_memory_seen'), goto: 'p3_portrait',
  });
  ctx.hotspots.define({
    id: 'p3_portrait', views: ['p3_portrait'], object: shrine.getObjectByName('shrine_portrait_hit'), cursor: 'pointer',
    when: () => !!ctx.flag('p3_portrait_eyes') && !ctx.flag('p3_memory_seen'),
    onClick: () => ctx.cutscene(() => playMemory(ctx)),
  });
  ctx.hotspots.define({
    id: 'p3_cube', views: ['p3_shrine'], object: shrine.getObjectByName('shrine_cube_hit'), cursor: 'grab',
    when: () => !!ctx.flag('p3_memory_seen') && !ctx.flag('p3_cube_taken'),
    onClick: async () => {
      if (!(await giveItem(ctx, 'black_cube', shrine.getObjectByName('shrine_cube_hit')))) return;
      ctx.setFlag('p3_cube_taken'); await shrine.takeCube();
    },
  });
}

/** 回忆（13:16–13:38）：画像消失 → 岩壁上画出大黑框 → 一家人淡入站成一排 → Caroline 的玫瑰花瓣散落 → 淡出 → 擦掉大框 → 小方框里浮出黑方块。 */
async function playMemory(ctx) {
  const { shrine, frame, family } = S;
  await ctx.go('p3_memory');
  ctx.sfx('memory_whoosh');
  await shrine.setPortrait('gone');
  await shrine.drawFrame(1);
  await frame.draw();
  const rigs = Object.values(family.rigs);
  rigs.forEach((r) => { r.setOpacity(0); r.root.visible = true; });
  await ctx.animate(1500, (k) => rigs.forEach((r) => r.setOpacity(k)));
  await ctx.wait(1800);
  const petals = family.rigs.caroline_rose.dropPetals();
  await ctx.wait(1800);
  await petals;
  await ctx.animate(1300, (k) => rigs.forEach((r) => r.setOpacity(1 - k)));
  rigs.forEach((r) => { r.root.visible = false; r.setOpacity(1); });
  await frame.erase();
  ctx.setFlag('p3_memory_seen');
  await shrine.showCube(true);
  await ctx.go('p3_shrine');
}

export function sync(ctx) {
  if (!S) return;
  const { table, david, larva, shrine, bush, birch, frame, family } = S;
  bush.setState({ picked: !!ctx.flag('p3_berries_taken') });
  const tapped = !!ctx.flag('p3_birch_tapped'), taken = !!ctx.flag('p3_sap_taken');
  birch.setState({ tapped, filled: tapped, jugTaken: taken, cocoon: taken ? (ctx.flag('p3_cocoon') || 'hanging') : 'none' });
  table.setState(tableOf(ctx));
  const covered = !!ctx.flag('p3_david_covered');
  david.setState({ covered, gone: covered });
  larva.visible = covered;
  larva.setState({ gnats: ctx.flag('p3_larva_cleared') ? 0 : covered ? 1 : 0, spat: !!ctx.flag('p3_larva_spat'), bulbTaken: !!ctx.flag('p3_larva_bulb_taken') });
  const st = shrineStateOf(ctx), memory = !!ctx.flag('p3_memory_seen');
  shrine.setState({
    vases: st.vases, flowers: st.flowers,
    portrait: memory ? 'gone' : ctx.flag('p3_portrait_eyes') ? 'eyes' : 'normal',
    frame: memory ? 1 : 0, cube: ctx.flag('p3_cube_taken') ? 'taken' : memory ? 'shown' : 'none',
  });
  frame.setProgress(0);
  for (const r of Object.values(family.rigs)) { r.root.visible = false; r.setOpacity(1); r.setState?.({ petals: false }); }
}

// 白桦林里的主线（顺序在 index.js 里排）
export const berryWalkthrough = [{ click: 'p3_berry_zoom' }, { expectView: 'p3_berries' }, { click: 'p3_berry_pick' }, { expectItem: 'p3_berries' }, { back: true }];
export const sapWalkthrough = [
  { click: 'p3_birch_zoom' }, { expectView: 'p3_birch' }, { use: 'p3_axe', on: 'p3_birch_tap' }, { click: 'p3_jug' }, { expectItem: 'p3_sap' }, { click: 'p3_cocoon' }, { back: true },
];
export const davidWalkthrough = [
  { click: 'p3_david_zoom' }, { expectView: 'p3_david' }, { click: 'p3_david' },
  { use: 'p3_berries', on: 'p3_table_bowl' }, { use: 'p3_sap', on: 'p3_table_cup' }, { use: 'p3_honey', on: 'p3_table_plate' },
  { expectFlag: 'p3_david_covered' }, { click: 'p3_larva_body' }, { click: 'p3_larva_mouth' }, { click: 'p3_larva_bulb' }, { expectItem: 'p3_bulb' }, { back: true },
];
export const shrineWalkthrough = (steps) => [{ click: 'p3_shrine_zoom' }, { expectView: 'p3_shrine' }, ...steps, { back: true }];
export const memoryWalkthrough = [
  { click: 'p3_shrine_zoom' }, { expectView: 'p3_shrine' }, { click: 'p3_portrait_zoom' }, { expectView: 'p3_portrait' }, { click: 'p3_portrait' },
  { expectFlag: 'p3_memory_seen' }, { click: 'p3_cube' }, { expectItem: 'black_cube' }, { back: true },
];
