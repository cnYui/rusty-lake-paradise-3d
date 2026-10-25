// Boot: Engine → buildWorld → initContext → load chapter → chapter.setup(ctx)
//       → (title menu | dev jump | autotest idle) → apply URL flags/give → chapter.sync(ctx)
//       → chapter.start(ctx, { skipIntro }) or views.go(view).
//
// URL flags: ?autotest=1 (no menu, RLP.ready after boot, nothing started) · ?debug=1 ·
//            ?chapter=1&skipIntro=1&view=beach_mid[&keep=1] · &flags=a,b=3,c=hook · &give=x,y ·
//            ?demo=1 (boot the core demo chapter instead of plague 1) · ?fresh=1 (启动时清空本机存档 / 成就历史 / 通关记录) ·
//            ?unlock=1 (菜单里不看“前置章节通关”的锁)
// 存档、成就历史和通关记录跨启动保留在本机（src/core/state.js）；?autotest=1 / ?demo=1 每次启动都从空白开始。
import { ctx, initContext } from './core/context.js';
import { Engine } from './core/engine.js';
import { state } from './core/state.js';
import { views } from './core/views.js';
import { hotspots } from './core/hotspots.js';
import { items } from './core/items.js';
import { ui } from './core/ui.js';
import { audio } from './core/audio.js';
import { touch } from './core/touch.js';
import { installDebug } from './core/debug.js';
import { CHAPTERS } from './chapters/index.js';
import { P } from './art/layout.js';
import { preloadModels, CHAPTER_MODELS } from './art/rlpm.js';
import { resumeChapter, nextChapter, liveSave, completeFlag } from './core/progress.js';
import { initHints } from './core/hintflow.js';
import { nextHint, isDone } from './core/hints.js';

const q = new URLSearchParams(location.search);
const AUTOTEST = q.get('autotest') === '1';
const DEMO = q.get('demo') === '1';

// 每一章都在 setup 里把自己的道具、视图和热点建在同一个世界上，一个页面只能装载一章。
// 在标题菜单选了另一章时，把选择记在 sessionStorage 里重载页面，启动时直接进入那一章。
const SWITCH_KEY = 'rlp3d.switch';
function takeSwitch() {
  try {
    const raw = sessionStorage.getItem(SWITCH_KEY);
    sessionStorage.removeItem(SWITCH_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && Number.isFinite(v.number) ? v : null;
  } catch { return null; }
}
const SWITCH = AUTOTEST || DEMO ? null : takeSwitch();

// 换章：把选择记进 sessionStorage 再重载页面（存档和通关记录在 localStorage，不受重载影响）。
// 标题菜单选了另一章、通关结尾“进入下一灾”都走这里。choice: { number, fresh }
function switchChapter(choice) {
  let stored = false;
  try { sessionStorage.setItem(SWITCH_KEY, JSON.stringify(choice)); stored = true; } catch { /* 隐私模式等 */ }
  state.save();
  if (stored) location.reload();
  else location.search = `?chapter=${choice.number}${choice.fresh === false ? '&keep=1' : ''}`;
}

// 启动时先装载哪一章：?chapter / 换章带来的选择优先；否则猜玩家多半会点 ▶ 的那一章（最近玩的没打完的章节，
// 通关第一灾后就是第二灾），回来继续第二灾的玩家就不用先装载第一灾、选了再重载一次（手机上装载一章要好几秒）。测试页固定第一章。
function bootChapterNumber() {
  if (DEMO) return 1;
  if (q.get('chapter')) return Number(q.get('chapter'));
  if (SWITCH) return SWITCH.number;
  if (AUTOTEST) return 1;
  try { const r = resumeChapter(CHAPTERS); return (r && r.number) || 1; } catch { return 1; }
}

// 自动存档：状态一变就排一次（500 ms 合并）；过场 / 谜题动画进行中（ui.locked）等它结束再存，免得存下半截状态。
let saveTimer = 0;
function scheduleSave() {
  if (saveTimer || !state.saving) return;
  const tick = () => {
    saveTimer = 0;
    if (ui.locked) { saveTimer = setTimeout(tick, 800); return; }
    state.save();
  };
  saveTimer = setTimeout(tick, 500);
}

// 章节的通关旗标一立起来就记进通关记录（解锁下一章靠它）
function watchClear(ch) {
  const flag = completeFlag(ch);
  state.on('flag', ({ key, value }) => { if (key === flag && value) state.markCleared(ch.id); });
}

let engine = null;
let world = null;
let chapter = null;
let chapterNumber = 0;
const setupDone = new Set();
let RLP = null;

function parseValue(v) {
  if (v === undefined) return true;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (v !== '' && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

/** 'gate_open,owl_level=3,rod=hook' → { gate_open: true, owl_level: 3, rod: 'hook' } */
export function parseFlags(str) {
  const out = {};
  if (!str) return out;
  for (const part of String(str).split(',')) {
    const s = part.trim();
    if (!s) continue;
    const eq = s.indexOf('=');
    if (eq < 0) out[s] = true;
    else out[s.slice(0, eq).trim()] = parseValue(s.slice(eq + 1).trim());
  }
  return out;
}

function applyDevState(flags, give) {
  const f = typeof flags === 'string' ? parseFlags(flags) : (flags || {});
  for (const [k, v] of Object.entries(f)) state.setFlag(k, v);
  const g = typeof give === 'string' ? give.split(',').map((s) => s.trim()).filter(Boolean) : (give || []);
  for (const id of g) state.give(id);
}

async function loadChapter(n) {
  if (DEMO) return (await import('./chapters/_demo.js')).default;
  const entry = CHAPTERS.find((c) => c.number === n);
  if (!entry) throw new Error(`unknown chapter ${n}`);
  if (!entry.load) throw new Error(`chapter ${n} (${entry.title.zh}) is not available yet`);
  const mod = await entry.load();
  return mod.default || mod;
}

let chapterPromise = null;
function ensureChapter(n) {
  if (chapterPromise && chapterNumber === n) return chapterPromise;
  if (chapterPromise) {
    // 一个页面只能装载一章：已经 setup 过别的章节时不再叠加（视图 / 热点 / 门禁 / 道具都会混在一起）
    return Promise.reject(new Error(`本页面已装载第 ${chapterNumber} 章，不能再装载第 ${n} 章；请用 ?chapter=${n}（测试用 ?autotest=1&chapter=${n}）重新打开页面`));
  }
  chapterNumber = n;
  chapterPromise = (async () => {
    chapter = await loadChapter(n);
    ctx.chapter = chapter;
    if (!DEMO) watchClear(chapter);
    if (!setupDone.has(chapter.id)) {
      setupDone.add(chapter.id);
      state.chapter = chapter.id;
      await preloadModels(CHAPTER_MODELS[chapter.id] || []);   // 网格人物 / 动物模型（失败时自动回退程序化模型）
      await chapter.setup(ctx);
    }
    return chapter;
  })();
  return chapterPromise;
}

// Minimal world used by the core demo (?demo=1) so core tests do not depend on the art modules.
function buildStubWorld(eng) {
  const THREE = ctx.THREE;
  const root = new THREE.Group();
  root.name = 'world_stub';
  const zones = {};
  for (const id of ['exterior', 'house_int', 'temple_int', 'memory']) { zones[id] = new THREE.Group(); root.add(zones[id]); }
  zones.exterior.add(new THREE.HemisphereLight('#ffffff', '#666666', 1.6));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#c5c9cc' }));
  water.material.userData.outlineParameters = { visible: false };
  zones.exterior.add(water);
  eng.scene.add(root);
  eng.scene.background = new THREE.Color('#aab4b8');
  const anchors = new Map();
  return {
    root, zones, anchors,
    anchor(name) { const a = anchors.get(name); if (!a) throw new Error(`unknown anchor ${name}`); return a; },
    lake: { setBlood: async () => {}, setPool() {}, mesh: water, material: water.material },
    setFog: async () => {},
    update() {},
  };
}

/** Start (or continue) a chapter. opts: { skipIntro, fresh = true, view, flags, give } */
async function startChapter(n = 1, opts = {}) {
  const { skipIntro = false, fresh = true, view = null } = opts;
  const ch = await ensureChapter(n);
  ui.menu.hide();
  ui.resetOverlays();
  state.saving = true;
  // 当前版本从初始进度启动，避免旧版固定视角/章节状态污染开放世界流程。
  if (fresh || !state.load(ch.id)) state.reset(ch.id);
  state.chapter = ch.id;
  const savedView = fresh ? null : state.view;
  // dev / test state: explicit options win over URL parameters
  const devFlags = opts.flags !== undefined ? opts.flags : q.get('flags');
  const devGive = opts.give !== undefined ? opts.give : q.get('give');
  if (devFlags || devGive) applyDevState(devFlags, devGive);
  if (state.flag(completeFlag(ch))) state.markCleared(ch.id);

  const introWillPlay = !skipIntro && !state.flag('intro_done') && !view;
  if (introWillPlay) {
    ui.showInventory(false);
    const offView = state.on('view', () => { ui.showInventory(true); offView(); offFlag(); });
    const offFlag = state.on('flag', ({ key }) => { if (key === 'intro_done') { ui.showInventory(true); offView(); offFlag(); } });
  } else {
    ui.showInventory(true);
  }
  ch.sync(ctx);
  audio.music(introWillPlay ? 'intro' : 'plague');
  if (ui.fadeLevel > 0) ui.fade(0, 600);
  await ch.start(ctx, { skipIntro: skipIntro || !!view });
  ui.showInventory(true);
  if (audio.currentMusic === 'intro') audio.music('plague');
  if (view) await views.go(view, { instant: true });
  else if (savedView && views.get(savedView) && (!views.current || views.current.id !== savedView)) {
    await views.go(savedView, { instant: true });
  }
  state.save();
  return state.view;
}

async function titleMenu() {
  views.setCamera(P.overviewCam);
  views.setZone('exterior');
  audio.ambience('lake');
  audio.music('intro');
  const choice = await ui.menu.show(CHAPTERS);
  audio.unlock();
  await ui.fade(1, 450);
  if (choice.number !== chapterNumber) {
    switchChapter(choice);
    return;
  }
  ui.menu.hide();
  await startChapter(choice.number, { fresh: choice.fresh });
}

function showBootError(err) {
  console.error(err);
  const box = document.getElementById('boot');
  if (box) {
    box.classList.add('error');
    box.textContent = `载入失败：${err && err.message ? err.message : err}`;
  }
  if (RLP) { RLP.bootError = String((err && err.message) || err); RLP.ready = true; }
}

const bootTimes = {};
const t0 = performance.now();
const mark = (k) => { bootTimes[k] = Math.round(performance.now() - t0); };
let bootDone;
const bootReady = new Promise((r) => { bootDone = r; });

async function boot() {
  const canvas = document.getElementById('game');
  engine = new Engine(canvas);
  if (q.get('norender') === '1') engine.renderEnabled = false;
  ui.init(engine);
  views.init(engine);
  hotspots.init(engine);
  items.init(engine);
  audio.bind(engine);
  // 触屏：漫游时画面左侧是摇杆；切到触屏操作时让鼠标的“靠边转向”失效
  touch.init(engine, { roaming: () => views.freeMode, onActivate: () => views.dropPointer() });
  RLP = installDebug({
    engine,
    // tests may call RLP.start() as soon as RLP exists: wait for the boot to finish first
    startChapter: async (n, opts) => { await bootReady; return startChapter(n, opts); },
    getChapter: () => chapter,
  });
  RLP.bootTimes = bootTimes;
  // 提示（233 乐园版）：测试用，next() = 此刻该提示哪一条，tasks() = 每条任务的完成情况
  RLP.hints = {
    next: () => { const h = nextHint(chapter, state); return { status: h.status, id: h.task ? h.task.id : null, text: h.text }; },
    tasks: () => ((chapter && chapter.hints) || []).map((t) => ({ id: t.id, after: t.after || [], done: isDone(t, state) })),
  };
  mark('core');

  // 存档、成就历史和通关记录跨启动保留在本机（localStorage，见 src/core/state.js）；测试页和 ?fresh=1 每次从空白开始。
  // 旧版（启动即清档的时代）留下的存档版本对不上，state.js 读不到它们，不会污染这一版。
  if (AUTOTEST || DEMO || q.get('fresh') === '1') state.wipeAll();
  // 标题菜单期间不写存档（空章节的存档会让菜单误以为有进度）；startChapter 一开始就恢复
  state.saving = false;
  for (const evt of ['flag', 'inventory', 'view', 'achievement']) state.on(evt, scheduleSave);
  window.addEventListener('pagehide', () => { if (state.saving && !ui.locked) state.save(); });

  // first user gesture unlocks WebAudio（手机浏览器只认抬起手指 / touchend 这类“激活”事件）
  const unlock = () => audio.unlock();
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) window.addEventListener(type, unlock, { capture: true });
  // 手机上：不弹长按菜单，不双指缩放页面（iOS 会忽略 user-scalable=no）
  document.addEventListener('contextmenu', (ev) => ev.preventDefault());
  document.addEventListener('gesturestart', (ev) => ev.preventDefault());

  if (DEMO && q.get('world') !== '1') {
    world = buildStubWorld(engine);
  } else {
    const { buildWorld } = await import('./art/world.js');
    mark('worldImport');
    await preloadModels(['tower']);   // 岛上的石塔是网格模型，世界建好之前先加载（失败回退程序化塔）
    world = buildWorld(engine);
  }
  mark('buildWorld');
  for (const [id, g] of Object.entries(world.zones || {})) views.registerZone(id, g);
  initContext({ engine, world });

  engine.onUpdate((dt, t) => {
    if (world.update) world.update(dt, t);
    for (const k in ctx.chars) { const r = ctx.chars[k]; if (r && r.update) r.update(dt, t); }
    for (const k in ctx.props) { const p = ctx.props[k]; if (p && p.update) p.update(dt, t); }
  });

  views.setCamera(P.overviewCam);
  views.setZone('exterior');

  await ensureChapter(bootChapterNumber());
  mark('chapterSetup');
  if (engine.renderEnabled) engine.render(); // compile shaders up front
  mark('firstRender');
  engine.start();
  document.getElementById('boot')?.remove();

  ui.on('menu', () => {
    // Returning to the title: the save is already on disk; a reload gives a pristine world.
    state.save();
    location.reload();
  });
  initHints({ ui, state, ctx });   // 灯泡按钮的流程（按钮本身只在 233 乐园版显示）
  // 通关结尾：有下一灾（编号 +1 且已解锁）就多一个“进入下一灾”并倒数自动进入，没有就只回主菜单。测试页不自动跳走。
  ui.autoAdvance = !AUTOTEST && !DEMO;
  ui.setEndingNext(DEMO ? null : () => {
    const cur = CHAPTERS.find((c) => chapter && c.id === chapter.id);
    const n = cur ? nextChapter(cur, CHAPTERS) : null;
    return n ? { number: n.number, label: n.label, title: n.title } : null;
  });
  ui.on('next', ({ number }) => {
    const n = CHAPTERS.find((c) => c.number === number);
    switchChapter({ number, fresh: !(n && liveSave(n)) });
  });

  bootDone();
  RLP.ready = true;
  if (AUTOTEST) return;
  if (SWITCH) {
    ui.fade(1, 0);
    await startChapter(SWITCH.number, { fresh: SWITCH.fresh !== false });
    return;
  }
  const devJump = q.has('view') || q.get('skipIntro') === '1' || q.has('chapter');
  if (devJump) {
    ui.fade(1, 0);
    await startChapter(Number(q.get('chapter') || 1), {
      skipIntro: q.get('skipIntro') === '1',
      fresh: q.get('keep') !== '1',
      view: q.get('view') || null,
    });
  } else {
    await titleMenu();
  }
}

boot().catch(showBootError);
