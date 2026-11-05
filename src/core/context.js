// The shared context handed to every chapter handler: core services + helpers.
import * as THREE from 'three';
import { state } from './state.js';
import { views } from './views.js';
import { hotspots } from './hotspots.js';
import { items } from './items.js';
import { ui } from './ui.js';
import { audio } from './audio.js';
import { tween, animate, wait, Ease } from './tween.js';
import { ACHIEVEMENTS } from '../chapters/plague1/text.js';

export const ctx = {
  engine: null,
  world: null,
  // getters: these modules import ctx too (import cycle) — resolve lazily, never at load time
  get state() { return state; },
  get views() { return views; },
  get hotspots() { return hotspots; },
  get items() { return items; },
  get ui() { return ui; },
  get audio() { return audio; },
  THREE,
  tween, animate, wait, Ease,
  chars: {},    // character rigs registered by the chapter (by id) — core calls rig.update(dt, t)
  props: {},    // props registered by the chapter (by id) — core calls obj.update?.(dt, t)
  chapter: null,
  achievementDefs: { ...ACHIEVEMENTS },
  hitPoint: null, // 触发当前热点处理函数的那次点击在世界里的位置（Vector3），测试直接调用时为 null

  go: (viewId, opts) => views.go(viewId, opts),

  /** state.give + icon flies into its slot + pickup sfx + item name at the top.
   *  opts.from: Object3D / [x,y,z] the icon starts from. Resolves when the icon landed (~0.5 s). */
  async give(id, opts = {}) {
    const index = state.inventory.length;
    ui.markPending(index);
    if (!state.give(id)) { ui.renderInventory(); return false; }
    audio.sfx('pickup');
    ui.say(items.name(id), { kind: 'item' });
    await ui.flyToSlot(id, index, opts.from || null);
    return true;
  },
  take(id) { return state.take(id); },
  replace(oldId, newId) { return state.replace(oldId, newId); },
  flag(k) { return state.flag(k); },
  setFlag(k, v = true) { state.setFlag(k, v); },

  /** Unlock an achievement; shows the chalk toast if new. opts.anchor = Object3D to draw it next to. */
  achieve(id, opts = {}) {
    const def = ctx.achievementDefs[id] || { zh: id, en: id };
    // 名字和章节一起记进成就历史（state.js），标题菜单没装载这一章时也能显示
    const isNew = state.achieve(id, { zh: def.zh, en: def.en, ch: state.chapter });
    if (isNew) ui.toast({ id, zh: def.zh, en: def.en }, opts);
    return isNew;
  },
  /** Register extra achievement labels: { id: { zh, en } }. */
  defineAchievements(defs) { Object.assign(ctx.achievementDefs, defs); },

  /** Run a scripted sequence with input locked; always unlocks, refreshes arrows and saves. */
  async cutscene(fn) {
    ui.lock();
    try {
      return await fn(ctx);
    } finally {
      ui.unlock();
      views.refreshArrows();
      state.save();
    }
  },

  // ---- conveniences (not in the contract, safe to use) ----
  say: (text, opts) => ui.say(text, opts),
  sfx: (name) => audio.sfx(name),
  thought: (anchor, item, opts) => ui.thought(anchor, item, opts),
  /** Show a tutorial hint once per save (remembered in flag `_hint_<key>`). */
  hintOnce(key, text, opts) {
    const f = `_hint_${key}`;
    if (state.flag(f)) return Promise.resolve();
    state.setFlag(f, true);
    return ui.hint(text, opts);
  },
  /** Register a character rig / prop so the core updates it every frame. */
  register(kind, id, obj) {
    (kind === 'char' ? ctx.chars : ctx.props)[id] = obj;
    return obj;
  },
};

export function initContext({ engine, world }) {
  ctx.engine = engine;
  ctx.world = world;
  return ctx;
}
