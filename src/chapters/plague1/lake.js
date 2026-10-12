// 第一灾湖区：灵魂、棺材、记忆、神殿和净化结尾。
import { makeProp } from '../../art/props.js';
import { makeCharacter } from '../../art/characters.js';
import { T } from './text.js';

let S = null;
const worldPos = (ctx, id) => ctx.world.anchor(id).getWorldPosition(new ctx.THREE.Vector3());
const view = (ctx, id, zone, cam, rest = {}) => ctx.views.define({ id, zone, cam, ...rest });
const put = (zone, id, pos, scale = 1) => {
  const o = makeProp(id);
  if (Array.isArray(pos)) o.position.fromArray(pos); else o.position.copy(pos);
  o.scale.setScalar(scale);
  zone.add(o);
  return o;
};

export async function setup(ctx) {
  const ext = ctx.world.zones.exterior;
  const templeZone = ctx.world.zones.temple_int;
  const memoryZone = ctx.world.zones.memory;
  const coffin = put(ext, 'coffin', worldPos(ctx, 'coffin'));
  const soul = makeCharacter('soul'); soul.root.position.copy(worldPos(ctx, 'soul')); ext.add(soul.root); ctx.register('char', 'soul', soul);
  const tendril = put(ext, 'blood_tendril', [19.5, 0.03, -42.5]);
  const holder = put(templeZone, 'winged_holder', worldPos(ctx, 'temple_int.holder'));
  const font = put(templeZone, 'font', worldPos(ctx, 'temple_int.font'));
  const painting = put(templeZone, 'plague_painting', [400, 1.35, -1.68]);
  const family = [];
  for (const [id, anchor] of [['gerard_boar', 'memory.family0'], ['elizabeth_pheasant', 'memory.family1'], ['nicholas_deer', 'memory.family2'], ['david_rabbit', 'memory.family3'], ['margaret_pigeon', 'memory.family4']]) {
    const rig = makeCharacter(id); rig.root.position.copy(worldPos(ctx, anchor)); rig.root.rotation.y = ctx.world.anchor(anchor).rotation.y;
    memoryZone.add(rig.root); ctx.register('char', `memory_${id}`, rig); family.push(rig);
  }
  // 回忆里一家人站在血泊中的棺材后面（原作 11:40）：同一个棺材模型，浮在血泊里、盖着盖子
  const memoryCoffin = put(memoryZone, 'coffin', worldPos(ctx, 'memory.coffin'));
  memoryCoffin.rotation.y = ctx.world.anchor('memory.coffin').rotation.y;
  memoryCoffin.rise({ instant: true });
  const memoryHit = ctx.hotspots.makeProxy(4.5, 2.4, 1, [500, 1.2, -0.3], memoryZone);
  // 棺材升起前只有一条透明水线可点；漫游时视线低、斜看过去太窄，给血池中心铺一块隐形点击区。
  // 升起后把它压扁到血面以下（顶面 y = 0）：原来 0.17 高的盒子盖住了棺材尾部较低的两颗钉子（钉头 y ≈ 0.10），
  // 点钉子会被它截走；压扁后点棺材周围的血面仍然算点棺材
  const poolHit = ctx.hotspots.makeProxy(4.6, 0.3, 3.6, [0, 0.02, 0], coffin);
  S = { ctx, coffin, soul, tendril, holder, font, painting, family, memoryHit, poolHit, nails: 0 };
  // 灵魂只在小屋门打开之后出现：之前从小屋侧面或林子里绕过去也看不到门后的黑影（避免剧透）
  soul.root.visible = false;
  ctx.state.on('flag', ({ key }) => { if (key === 'shed_open' || key === 'soul_gone') showSoul(ctx); });

  // 机位在两棵帘幕树干南侧，透过缝隙看灵魂和后面的湖（原机位与灵魂站在同一点，相机会落进灵魂身体里）
  view(ctx, 'soul_path', 'exterior', { pos: [21, 2.2, -16.8], target: [21, 1.5, -23] }, { back: 'shed_clearing', right: 'lake_path' });
  view(ctx, 'lake_path', 'exterior', { pos: [22, 2.4, -24], target: [21, 1.5, -31] }, { back: 'soul_path', right: 'lake_shore' });
  view(ctx, 'lake_shore', 'exterior', { pos: [25, 2.4, -31], target: [30, 1.5, -36] }, { left: 'lake_path', right: 'blood_pool' });
  view(ctx, 'blood_pool', 'exterior', { pos: [20, 2.2, -39], target: [19, 0.8, -43] }, { left: 'lake_shore', right: 'temple_door' });
  view(ctx, 'coffin', 'exterior', { pos: [19.5, 2.3, -40.6], target: [19.5, 0.8, -42.5], fov: 44 }, { back: 'blood_pool', closeup: true });
  view(ctx, 'temple_door', 'exterior', { pos: [29, 2.3, -33], target: [31, 2, -36] }, { left: 'blood_pool', up: 'temple_int', upAt: [31, 1.4, -36] });
  view(ctx, 'memory', 'memory', { pos: [500, 2.2, 3.5], target: [500, 1.2, -1.8], fov: 48 }, { back: 'blood_pool', closeup: true });
  view(ctx, 'temple_int', 'temple_int', { pos: [400, 2.2, 3.5], target: [400, 1.45, -1.2], fov: 50 }, { back: 'temple_door', closeup: true });
  view(ctx, 'font', 'temple_int', { pos: [400, 1.8, 2.4], target: [400, 0.72, -0.4], fov: 46 }, { back: 'temple_int', closeup: true });
  view(ctx, 'holder', 'temple_int', { pos: [400, 2.7, 2.5], target: [400, 2.25, -0.4], fov: 44 }, { back: 'temple_int', closeup: true });
  view(ctx, 'painting', 'temple_int', { pos: [400, 1.8, 2.5], target: [400, 1.35, -1.65], fov: 42 }, { back: 'temple_int', closeup: true });

  ctx.hotspots.define({ id: 'soul', views: ['soul_path'], object: soul.root, cursor: 'talk', when: () => !ctx.flag('soul_gone'), onClick: async () => {
    const n = ctx.flag('soul_lines') || 0;
    if (n < 2) { await ctx.say(T.soul[n]); ctx.setFlag('soul_lines', n + 1); }
    if (n + 1 >= 2) { await soul.vanish(); ctx.setFlag('soul_gone'); }
  } });
  ctx.hotspots.define({ id: 'coffin', views: ['blood_pool', 'coffin'], object: coffin, cursor: 'pointer', onClick: async () => {
    if (!ctx.flag('coffin_risen')) { await coffin.rise(); ctx.setFlag('coffin_risen'); setPoolHit(ctx); return; }
    // 漫游时逻辑视图不一定是 blood_pool：只要还没在棺材近景里，就先进入近景拔钉子
    if (!ctx.flag('cube_taken') && ctx.state.view !== 'coffin') { await ctx.go('coffin'); return; }
    if (ctx.flag('cube_taken')) { ctx.setFlag('memory_seen', false); await ctx.go('memory'); }
  } });
  for (let i = 1; i <= 6; i++) {
    const nail = coffin.getObjectByName(`nail_${i}`) || coffin;
    ctx.hotspots.define({ id: `coffin_nail_${i}`, views: ['blood_pool', 'coffin'], object: nail, cursor: 'pointer', when: () => ctx.flag('coffin_risen') && !ctx.flag(`nail_${i}`), onClick: async () => { await coffin.pullNail(i); ctx.setFlag(`nail_${i}`); S.nails++; if (S.nails >= 6 || [1, 2, 3, 4, 5, 6].every((n) => ctx.flag(`nail_${n}`))) { await coffin.slideLid(); ctx.setFlag('lid_open'); await coffin.takeCube(); ctx.setFlag('cube_taken'); await ctx.give('black_cube', { from: coffin }); } } });
  }
  ctx.hotspots.define({ id: 'temple', views: ['temple_door'], object: ctx.hotspots.makeProxy(3, 3, 2, [30.5, 1.4, -35.7], ext), cursor: 'zoom', goto: 'temple_int' });
  ctx.hotspots.define({ id: 'memory_scene', views: ['memory'], object: memoryHit, cursor: 'pointer', onClick: async () => { await ctx.say(T.memory); ctx.setFlag('memory_seen', true); await ctx.go('blood_pool'); } });
  ctx.hotspots.define({ id: 'holder', views: ['temple_int', 'holder'], object: holder, cursor: 'pointer', onClick: async () => {
    if (!ctx.flag('holder_open')) { await holder.open(); ctx.setFlag('holder_open'); return; }
    if (ctx.state.has('black_cube') && !ctx.flag('holder_cube')) return;
    if (ctx.flag('holder_closed') && ctx.flag('reflection_seen') && !ctx.flag('holder_lowered')) { await holder.lower(1.2); ctx.setFlag('holder_lowered'); }
  }, onItem: { black_cube: async () => { if (!ctx.flag('holder_open')) { await holder.open(); ctx.setFlag('holder_open'); } ctx.take('black_cube'); await holder.insertCube(); ctx.setFlag('holder_cube'); await holder.close(); ctx.setFlag('holder_closed'); } } });
  ctx.hotspots.define({ id: 'font', views: ['temple_int', 'font'], object: font, cursor: 'pointer', when: () => ctx.flag('holder_closed'), onClick: async () => { await font.showReflection(); ctx.setFlag('reflection_seen'); await ctx.say(T.reflection); } });
  ctx.hotspots.define({ id: 'painting', views: ['temple_int', 'painting'], object: painting, cursor: 'pointer', when: () => ctx.flag('holder_lowered'), onClick: async () => { await painting.glowCube(); await painting.purify(); ctx.setFlag('painting_lit'); ctx.setFlag('stream_purified'); } });
  ctx.hotspots.define({ id: 'frogs', views: ['temple_int', 'painting'], object: painting, cursor: 'pointer', when: () => ctx.flag('painting_lit') && !ctx.flag('frogs_framed'), onClick: async () => { await painting.frameFrogs(); ctx.setFlag('frogs_framed'); ctx.setFlag('plague1_complete'); await ctx.ui.ending(T.ending); } });
}

export function sync(ctx) {
  if (!S) return;
  if (ctx.flag('coffin_risen')) S.coffin.rise({ instant: true });
  setPoolHit(ctx);
  for (let i = 1; i <= 6; i++) if (ctx.flag(`nail_${i}`)) S.coffin.pullNail(i, { instant: true });
  if (ctx.flag('lid_open')) S.coffin.slideLid({ instant: true });
  if (ctx.flag('cube_taken')) S.coffin.takeCube({ instant: true });
  if (ctx.flag('holder_open')) S.holder.open({ instant: true });
  if (ctx.flag('holder_cube')) S.holder.insertCube({ instant: true });
  if (ctx.flag('holder_closed')) S.holder.close({ instant: true });
  if (ctx.flag('holder_lowered')) S.holder.lower(1.2, { instant: true });
  if (ctx.flag('reflection_seen')) S.font.showReflection({ instant: true });
  if (ctx.flag('painting_lit')) S.painting.glowCube({ instant: true });
  if (ctx.flag('stream_purified')) S.painting.purify({ instant: true });
  if (ctx.flag('frogs_framed')) S.painting.frameFrogs({ instant: true });
  showSoul(ctx);
}

function setPoolHit(ctx) {
  const h = S.poolHit, risen = !!ctx.flag('coffin_risen');
  h.scale.y = risen ? 0.1 : 0.3;
  h.position.y = risen ? -0.05 : 0.02;
}

function showSoul(ctx) {
  if (S) S.soul.root.visible = !!ctx.flag('shed_open') && !ctx.flag('soul_gone');
}

export const walkthrough = [
  { go: 'soul_path' }, { repeat: 2, step: { click: 'soul' } },
  { go: 'blood_pool' }, { click: 'coffin' }, { click: 'coffin' },
  { click: 'coffin_nail_1' }, { click: 'coffin_nail_2' }, { click: 'coffin_nail_3' },
  { click: 'coffin_nail_4' }, { click: 'coffin_nail_5' }, { click: 'coffin_nail_6' },
  { click: 'coffin' }, { go: 'memory' }, { click: 'memory_scene' }, { go: 'lake_shore' }, { go: 'temple_door' }, { click: 'temple' },
  { click: 'holder' }, { use: 'black_cube', on: 'holder' }, { click: 'font' }, { click: 'holder' }, { click: 'painting' }, { click: 'frogs' }, { expectFlag: 'plague1_complete' },
];
