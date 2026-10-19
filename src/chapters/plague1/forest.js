// 第一灾森林：家人、水泵、山羊和猫头鹰图腾；房子室内可以自由走动。
// 四条水蛭：玛格丽特的鼻子、盘子里的虾、山羊（喝木桶里的血）、父亲（喝杯子里的血）。
import { makeProp } from '../../art/props.js';
import { makeAnimal, makeCharacter } from '../../art/characters.js';
import { P, shedLineZ } from '../../art/layout.js';
import { BUILDING_DIMS } from '../../art/buildings.js';
import { T } from './text.js';

let S = null;
// Margaret 鼻子里的水蛭：点第 n 下对应的阶段
const NOSE_STAGES = [null, 'peek', 'peek', 'stay', 'pull1', 'pull2', 'out'];
const worldPos = (ctx, id) => ctx.world.anchor(id).getWorldPosition(new ctx.THREE.Vector3());
const add = (zone, id, pos, scale = 1) => {
  const o = makeProp(id);
  if (Array.isArray(pos)) o.position.fromArray(pos); else o.position.copy(pos);
  o.scale.setScalar(scale);
  zone.add(o);
  return o;
};
const local = (ctx, id, offset = [0, 0, 0]) => { const p = worldPos(ctx, id); p.x += offset[0]; p.y += offset[1]; p.z += offset[2]; return p; };
const view = (ctx, id, cam, rest = {}) => ctx.views.define({ id, zone: 'exterior', cam, ...rest });

export async function setup(ctx) {
  const ext = ctx.world.zones.exterior;
  const houseZone = ctx.world.zones.house_int;
  const anchor = (id) => ctx.world.anchor(id).position.toArray();
  // 山羊侧身朝东，嘴下面是木桶
  const goat = makeAnimal('goat'); goat.root.position.set(...anchor('goat')); goat.root.rotation.y = ctx.world.anchor('goat').rotation.y;
  ext.add(goat.root); ctx.register('char', 'goat', goat);
  const margaret = makeCharacter('margaret'); margaret.root.position.set(...anchor('margaret')); ext.add(margaret.root); ctx.register('char', 'margaret', margaret);
  const father = makeCharacter('nicholas'); father.root.position.copy(local(ctx, 'house_int.chair', [0, 0.02, 0.15])); houseZone.add(father.root); ctx.register('char', 'father', father);
  father.glass.setFill(0, { instant: true }); // 父亲的杯子一开始是空的，要玩家倒血进去
  const plate = add(houseZone, 'plate_prawn', local(ctx, 'house_int.table', [0.15, 0.78, 0.02]));
  const cabinet = add(houseZone, 'cabinet', local(ctx, 'house_int.cabinet', [0, 0.02, 0]));
  const photo = add(houseZone, 'family_photo', local(ctx, 'house_int.photo', [0, 0, 0]));
  const portrait = add(houseZone, 'portrait_caroline', local(ctx, 'house_int.portrait', [0, 0, 0]));
  const table = add(houseZone, 'dining_table', local(ctx, 'house_int.table', [0, 0, 0]));
  const chair = add(houseZone, 'high_chair', local(ctx, 'house_int.chair', [0, 0, 0]));
  const pump = add(ext, 'pump', anchor('pump'));
  const bucket = add(ext, 'bucket', anchor('bucket'));
  const owl = add(ext, 'owl_totem', anchor('owlTotem'));
  const door = add(ext, 'shed_door', anchor('shedDoor'));
  const houseEntry = ctx.hotspots.makeProxy(2.8, 2.4, 1.5, [3, 1.1, -10.8], ext);
  const doorIn = worldPos(ctx, 'house_int.door');
  const houseExit = ctx.hotspots.makeProxy(1.3, 2.3, 0.4, [doorIn.x, 1.15, doorIn.z - 0.15], houseZone);
  S = { ctx, goat, margaret, father, plate, cabinet, photo, portrait, table, chair, pump, bucket, owl, door, houseEntry, houseExit, noses: 0 };

  view(ctx, 'forest_clearing', { pos: [-2, 2.5, 25], target: [-2, 1.5, 16] }, { back: 'forest_path', right: 'pump_clearing', up: 'house_clearing', upAt: [3, 1, -3] });
  view(ctx, 'pump_clearing', { pos: [17, 2.4, 9], target: [17, 1.5, 2] }, { left: 'forest_clearing', up: 'house_clearing', upAt: [10, 1, -1] });
  view(ctx, 'house_clearing', { pos: [7, 2.3, -4], target: [3, 1.5, -11] }, { back: 'forest_clearing', right: 'owl_clearing' });
  view(ctx, 'owl_clearing', { pos: [-2, 2.2, -4], target: [-2, 1.5, -9] }, { left: 'house_clearing', right: 'shed_clearing' });
  view(ctx, 'shed_clearing', { pos: [15, 2.2, -7], target: [17, 1.5, -13] }, { left: 'owl_clearing', up: (state) => state.flag('shed_open') ? 'soul_path' : null, upAt: [20, 1, -18] });

  // 房子室内：开放视图（进门站在门口，可以走动），走动范围是四面墙以内、绕开桌椅和柜子
  const o = worldPos(ctx, 'house_int.center');
  const HD = BUILDING_DIMS.house_int;
  const tableP = worldPos(ctx, 'house_int.table'), chairP = worldPos(ctx, 'house_int.chair'), cabP = worldPos(ctx, 'house_int.cabinet');
  ctx.views.defineRoamArea('house_int', {
    bounds: [o.x - HD.width / 2, o.z + HD.wallZ, o.x + HD.width / 2, o.z + HD.wallZ + HD.depth],
    circles: [[tableP.x, tableP.z, 0.62], [chairP.x, chairP.z + 0.12, 0.5]],
    boxes: [[cabP.x - 0.42, cabP.z - 0.25, cabP.x + 0.42, cabP.z + 0.25]],
    eye: 1.65, floor: o.y,
  });
  view(ctx, 'house_int', { pos: [o.x, 1.65, o.z + 2.3], target: [o.x, 1.3, o.z - 1.5], fov: 50 }, {
    zone: 'house_int', roam: true, back: 'house_clearing',
    onEnter: (c) => { c.hintOnce('house', c.ui.touchMode ? T.hintHouseTouch : T.hintHouse); },
  });
  // 盘子特写：从正上方往下看
  const pp = plate.position;
  view(ctx, 'plate', { pos: [pp.x, pp.y + 0.82, pp.z + 0.17], target: [pp.x, pp.y, pp.z + 0.01], fov: 36 }, { zone: 'house_int', back: 'house_int', closeup: true });
  const fp = father.root.position;
  view(ctx, 'father', { pos: [fp.x + 0.2, 1.42, fp.z + 1.15], target: [fp.x - 0.06, 1.28, fp.z + 0.05], fov: 40 }, { zone: 'house_int', back: 'house_int', closeup: true });
  view(ctx, 'cabinet', { pos: [cabP.x + 0.1, 1.35, cabP.z + 1.55], target: [cabP.x, 0.62, cabP.z + 0.1], fov: 45 }, { zone: 'house_int', back: 'house_int', closeup: true });

  // 小屋门打开前，漫游不能越过小屋和两侧木板围墙一线进入北面的灵魂小径和湖区。
  // 围墙本身是 world.colliders 里的实体；这里沿同一条线再挡一次，主要挡住小屋门洞。
  ctx.views.addRoamGate((x, z) => !ctx.flag('shed_open') && z < shedLineZ(x) - 0.2);

  ctx.hotspots.define({ id: 'margaret', views: ['forest_clearing'], object: margaret.root, cursor: 'talk', onClick: async () => {
    // 原作 04:24–04:40：每点一下水蛭从鼻孔探出一点，最后被她捏出来递给你
    if (S.noses < 6) {
      S.noses++; ctx.setFlag('nose', S.noses);
      await Promise.all([margaret.setNose?.(NOSE_STAGES[S.noses]), ctx.say(S.noses === 6 ? '她的鼻子里藏着一只水蛭。' : '玛格丽特眨了眨眼。')]);
    }
    if (S.noses === 6 && !ctx.flag('margaret_leech_taken')) {
      ctx.setFlag('margaret_leech_taken');
      await ctx.give('leech', { from: margaret.root });
      await margaret.holdLeech?.(false); margaret.setNose?.('none', { instant: true });
      ctx.achieve('the_eilander_family', { anchor: margaret.root });
    }
  } });

  // 水泵：放上空壶 → 压一下灌满血 → 壶从水泵上拿走（场景里不再留着壶）
  const fillJug = async () => {
    if (ctx.flag('jug_on_pump') !== 'full') { await pump.pumpOnce({ filling: true }); ctx.setFlag('jug_on_pump', 'full'); }
    await pump.setJug(null, { instant: true });
    ctx.setFlag('jug_on_pump', false);
    await ctx.give('jug_blood', { from: pump });
  };
  ctx.hotspots.define({ id: 'pump', views: ['pump_clearing'], object: pump, cursor: 'use',
    // 壶还在泵上（中途存档）就接着灌；空手压泵，血洒在石槽里流走
    onClick: async () => { if (ctx.flag('jug_on_pump')) await fillJug(); else await pump.pumpOnce(); },
    onItem: { jug: async () => { ctx.take('jug'); ctx.setFlag('jug_on_pump', 'empty'); await pump.setJug('empty'); await fillJug(); } } });

  // 木桶：把血倒进去，山羊低头去喝，抬头时舌头上粘着一条水蛭
  ctx.hotspots.define({ id: 'bucket', views: ['forest_clearing'], object: bucket, cursor: 'use', when: () => !ctx.flag('bucket_filled'), onItem: { jug_blood: () => ctx.cutscene(async () => {
    ctx.replace('jug_blood', 'jug');
    ctx.setFlag('bucket_filled');
    ctx.sfx('pour');
    await bucket.setFill(1);
    await ctx.say(T.bucketFilled);
    ctx.setFlag('goat_drank');
    ctx.sfx('goat');
    await Promise.all([goat.drink(), ctx.wait(1200).then(() => bucket.setFill(0.35))]);
  }) } });
  ctx.hotspots.define({ id: 'goat', views: ['forest_clearing'], object: goat.root, cursor: 'talk', onClick: async () => {
    if (ctx.flag('goat_drank') && !ctx.flag('goat_leech_taken')) {
      ctx.setFlag('goat_leech_taken');
      await goat.tongueLeech(false);
      await ctx.give('leech', { from: goat.headTop || goat.root });
      ctx.achieve('save_the_goat', { anchor: goat.headTop || goat.root });
      return;
    }
    ctx.sfx('goat');
    await goat.bleat();
  } });

  // ---- 房子
  ctx.hotspots.define({ id: 'house_entry', views: ['house_clearing'], object: houseEntry, cursor: 'zoom', goto: 'house_int' });
  ctx.hotspots.define({ id: 'house_exit', views: ['house_int'], object: houseExit, cursor: 'zoom', goto: 'house_clearing' });
  // 墙上的两幅画：点击后全屏放大查看
  ctx.hotspots.define({ id: 'photo', views: ['house_int'], object: photo, cursor: 'zoom', onClick: async () => {
    await ctx.ui.viewImage(photo.snapshot(), { title: T.photoTitle, from: photo.getObjectByName('family_photo_frame') || photo });
  } });
  ctx.hotspots.define({ id: 'portrait', views: ['house_int'], object: portrait, cursor: 'zoom', onClick: async () => {
    await ctx.ui.viewImage(portrait.snapshot(), { title: T.portraitTitle, from: portrait.getObjectByName('portrait_caroline_frame') || portrait });
    await ctx.say(T.portraitThought);
  } });
  // 盘子：俯视特写，点虾 → 虾裂开钻出水蛭 → 点水蛭拿走
  const prawn = plate.getObjectByName('prawn') || plate;
  const plateLeech = plate.getObjectByName('plate_leech') || plate;
  const splitPrawn = async () => {
    if (ctx.flag('prawn_split')) return;
    ctx.setFlag('prawn_split');
    ctx.sfx('squish');
    await plate.split();
    await ctx.say(T.prawnSplit);
  };
  ctx.hotspots.define({ id: 'plate', views: ['house_int'], object: plate, cursor: 'zoom', goto: 'plate' });
  ctx.hotspots.define({ id: 'plate_cut', views: ['plate'], object: prawn, cursor: 'use', when: () => !ctx.flag('prawn_split'), onClick: splitPrawn, onItem: { machete: splitPrawn } });
  ctx.hotspots.define({ id: 'plate_leech', views: ['plate'], object: plateLeech, cursor: 'grab', when: () => ctx.flag('prawn_split') && !ctx.flag('prawn_leech_taken'), onClick: async () => {
    ctx.setFlag('prawn_leech_taken');
    await plate.hideLeech();
    await ctx.give('leech', { from: plate });
  } });
  // 父亲：要喝的 → 把壶里的血倒进他的杯子 → 他喝完，杯底剩一条水蛭（空壶留在物品栏）
  const pourForFather = async () => {
    // 已经喝过：不再倒（否则杯底会再出现一条水蛭）
    if (ctx.flag('father_fed')) { ctx.state.select(null); await ctx.say(T.fatherFull); return; }
    await pourCutscene();
  };
  const pourCutscene = () => ctx.cutscene(async () => {
    if (ctx.views.current?.id !== 'father') await ctx.go('father');
    ctx.replace('jug_blood', 'jug');
    ctx.setFlag('father_fed');
    ctx.sfx('pour');
    await father.glass.setFill(0.66);
    ctx.sfx('drink');
    await father.drink();
    await ctx.say(T.fatherAfter[0]);
    await ctx.say(T.fatherAfter[1]);
  });
  ctx.hotspots.define({ id: 'father', views: ['house_int'], object: father.root, cursor: 'talk', goto: 'father', onItem: { jug_blood: pourForFather } });
  ctx.hotspots.define({ id: 'father_talk', views: ['father'], object: father.root, cursor: 'talk', onClick: async () => {
    if (ctx.flag('father_fed')) { await ctx.say(T.fatherAfter[1]); return; }
    ctx.setFlag('father_asked');
    await ctx.say(T.fatherAsk);
  }, onItem: { jug_blood: pourForFather } });
  ctx.hotspots.define({ id: 'father_glass', views: ['house_int', 'father'], object: father.glass, cursor: 'grab', when: () => ctx.flag('father_fed') && !ctx.flag('father_leech_taken'), onClick: async () => {
    ctx.setFlag('father_leech_taken');
    await father.glass.showLeech(false);
    await ctx.give('leech', { from: father.glass });
  } });
  ctx.hotspots.define({ id: 'cabinet', views: ['house_int'], object: cabinet, cursor: 'pointer', onClick: async () => {
    if (!ctx.flag('cab_bolt_l')) { await cabinet.slideBolt('l'); ctx.setFlag('cab_bolt_l'); return; }
    if (!ctx.flag('cab_bolt_r')) { await cabinet.slideBolt('r'); ctx.setFlag('cab_bolt_r'); return; }
    if (!ctx.flag('cabinet_open')) { await cabinet.openDoors(); ctx.setFlag('cabinet_open'); }
    if (!ctx.flag('jug_taken')) { cabinet.hideJug(); ctx.setFlag('jug_taken'); await ctx.give('jug', { from: cabinet }); }
  } });

  // ---- 猫头鹰图腾和小屋
  ctx.hotspots.define({ id: 'owl', views: ['owl_clearing'], object: owl, cursor: 'use', onItem: { leech: async () => {
    const n = Math.min(4, (ctx.flag('owl_level') || 0) + 1);
    ctx.take('leech'); await owl.setLeech(true); await owl.flap({ crush: true }); ctx.setFlag('owl_level', n); await owl.setLevel(n);
    if (n === 4 && !ctx.flag('key_taken')) {
      await owl.showKey(true);
      ctx.setFlag('key_taken');
      await owl.showKey(false, { instant: true });
      await ctx.give('key', { from: owl });
    }
  } } });
  ctx.hotspots.define({ id: 'shed', views: ['shed_clearing'], object: door, cursor: 'use', when: () => ctx.state.has('key') && !ctx.flag('shed_open'), onItem: { key: async () => {
    ctx.take('key'); await door.unlock(); ctx.setFlag('padlock_open'); await door.slideBolt(); ctx.setFlag('shed_bolt'); await door.open(); ctx.setFlag('shed_open'); await ctx.go('soul_path');
  } } });
}

export function sync(ctx) {
  if (!S) return;
  S.noses = ctx.flag('nose') || 0;
  // 鼻子里水蛭的位置随点击次数恢复；交出水蛭后手里不再拿着
  const stage = ctx.flag('margaret_leech_taken') ? 'none' : (S.noses >= 3 ? NOSE_STAGES[Math.min(S.noses, 6)] : 'none');
  S.margaret.holdLeech?.(stage === 'out', { instant: true });
  S.margaret.setNose?.(stage, { instant: true });
  if (ctx.flag('cab_bolt_l')) S.cabinet.slideBolt('l', { instant: true });
  if (ctx.flag('cab_bolt_r')) S.cabinet.slideBolt('r', { instant: true });
  if (ctx.flag('cabinet_open')) S.cabinet.openDoors({ instant: true });
  if (ctx.flag('jug_taken')) S.cabinet.hideJug();
  // 旧存档：拿到血之后壶还记在水泵上
  if (ctx.flag('jug_on_pump') && (ctx.state.has('jug_blood') || ctx.flag('bucket_filled'))) ctx.setFlag('jug_on_pump', false);
  S.pump.setJug(ctx.flag('jug_on_pump') || null, { instant: true });
  if (ctx.flag('bucket_filled')) S.bucket.setFill(ctx.flag('goat_drank') ? 0.35 : 1, { instant: true });
  if (ctx.flag('goat_drank') && !ctx.flag('goat_leech_taken')) S.goat.drink({ instant: true });
  if (ctx.flag('goat_leech_taken')) S.goat.tongueLeech(false, { instant: true });
  if (ctx.flag('prawn_split')) S.plate.split({ instant: true });
  if (ctx.flag('prawn_leech_taken')) S.plate.hideLeech();
  if (ctx.flag('father_fed')) {
    S.father.glass.setFill(0, { instant: true });
    S.father.glass.showLeech(!ctx.flag('father_leech_taken'), { instant: true });
  }
  if (ctx.flag('owl_level')) S.owl.setLevel(ctx.flag('owl_level'), { instant: true });
  if (ctx.flag('key_taken')) S.owl.showKey(false, { instant: true });
  if (ctx.flag('padlock_open')) S.door.unlock({ instant: true });
  if (ctx.flag('shed_bolt')) S.door.slideBolt({ instant: true });
  if (ctx.flag('shed_open')) S.door.open({ instant: true });
}

export const walkthrough = [
  { go: 'forest_clearing' }, { repeat: 6, step: { click: 'margaret' } },
  { go: 'house_clearing' }, { click: 'house_entry' }, { click: 'photo' }, { click: 'portrait' },
  { click: 'plate' }, { click: 'plate_cut' }, { click: 'plate_leech' },
  { go: 'house_int' }, { click: 'cabinet' }, { click: 'cabinet' }, { click: 'cabinet' }, { expectItem: 'jug' },
  { go: 'pump_clearing' }, { use: 'jug', on: 'pump' }, { expectItem: 'jug_blood' },
  { go: 'forest_clearing' }, { use: 'jug_blood', on: 'bucket' }, { expectItem: 'jug' }, { click: 'goat' },
  { go: 'pump_clearing' }, { use: 'jug', on: 'pump' },
  { go: 'house_clearing' }, { click: 'house_entry' }, { click: 'father' }, { click: 'father_talk' }, { use: 'jug_blood', on: 'father_talk' }, { click: 'father_glass' }, { expectItem: 'jug' },
  { go: 'owl_clearing' }, { repeat: 4, step: { use: 'leech', on: 'owl' } }, { go: 'shed_clearing' }, { use: 'key', on: 'shed' }, { expectFlag: 'shed_open' },
];
