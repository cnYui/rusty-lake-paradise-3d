// Game state: flags, inventory, selection, current view, achievements + localStorage saves.
// Events: 'inventory' 'flag' 'select' 'view' 'achievement' 'cleared' 'reset' 'load'.
//
// 本机存档（localStorage，只在 try/catch 里读写；读写失败时游戏照常玩，只是不保留进度）：
//   rlp3d.save.<chapterId>  每章一份存档（v: SAVE_VERSION，版本对不上就当没有）
//   rlp3d.profile           跨章节的“玩家档案”：成就历史 { id: { t: 首次解锁时间, zh, en, ch } } 和通关记录 { chapterId: { t } }
//   rlp3d.last              最近玩的章节（标题菜单“继续”和启动时选哪一章用）
// 档案不跟章节存档走：“重新开始”只清这一章的存档，成就历史和通关记录保留；只有设置里的“重置进度”才全部清掉。
// 旧版本留下的 rlp3d.achievements（成就 id 数组）和带 plagueN_complete 的旧存档，在第一次读档案时并进来。

// 物品栏 12 格：前 6 格是右侧第一列；超过 6 件时展开第二列（原作也是这样，第二、三灾会同时持有 7 件以上）。
export const MAX_SLOTS = 12;
export const COLUMN_SLOTS = 6;
const SAVE_PREFIX = 'rlp3d.save.';
const SAVE_VERSION = 2;                   // 2：开放世界版（2026-10-19 起存档跨启动保留；v1 是启动即清档时代的存档，不再读）
const PROFILE_KEY = 'rlp3d.profile';
const LAST_KEY = 'rlp3d.last';
const GLOBAL_ACH = 'rlp3d.achievements';  // 旧版的成就 id 数组，只用来迁移

function lsGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
let storageBroken = false;   // 最近一次写入失败：档案改用内存里的这一份（本次游戏内仍然有效，只是不保留）
let profileMem = null;
function lsSet(key, val) {
  try { window.localStorage.setItem(key, val); storageBroken = false; return true; } catch { storageBroken = true; return false; }
}
function lsDel(key) {
  try { window.localStorage.removeItem(key); } catch { /* ignore */ }
}

const listeners = new Map();

export const state = {
  chapter: null,        // chapter id, e.g. 'plague1'
  flags: {},
  inventory: [],        // item ids, max 12 (MAX_SLOTS), used items are removed (later ones move up)
  selected: null,       // selected item id or null
  view: null,           // current view id
  achievements: [],     // achievement ids unlocked in this save
  saving: true,         // set false to suspend autosaves (e.g. while on the title menu)

  // ------------------------------------------------------------------ flags
  flag(key) { return this.flags[key]; },
  setFlag(key, value = true) {
    const old = this.flags[key];
    if (old === value) return;
    this.flags[key] = value;
    this.emit('flag', { key, value, old });
  },

  // -------------------------------------------------------------- inventory
  has(itemId) { return this.inventory.includes(itemId); },
  count(itemId) { return this.inventory.filter((i) => i === itemId).length; },
  give(itemId) {
    if (!itemId) return false;
    if (this.inventory.length >= MAX_SLOTS) {
      console.warn(`[state] inventory full (${MAX_SLOTS}); cannot add ${itemId}`);
      return false;
    }
    this.inventory.push(itemId);
    this.emit('inventory', { type: 'give', id: itemId, index: this.inventory.length - 1 });
    return true;
  },
  take(itemId) {
    // Removes the first occurrence (several leeches may be held); later items move up.
    const idx = this.inventory.indexOf(itemId);
    if (idx < 0) return false;
    this.inventory.splice(idx, 1);
    if (this.selected === itemId && !this.inventory.includes(itemId)) this._setSelected(null);
    this.emit('inventory', { type: 'take', id: itemId, index: idx });
    return true;
  },
  replace(oldId, newId) {
    const idx = this.inventory.indexOf(oldId);
    if (idx < 0) return this.give(newId);
    this.inventory[idx] = newId;
    if (this.selected === oldId) this._setSelected(null);
    this.emit('inventory', { type: 'replace', id: newId, old: oldId, index: idx });
    return true;
  },
  select(itemIdOrNull) {
    const id = itemIdOrNull && this.inventory.includes(itemIdOrNull) ? itemIdOrNull : null;
    if (id === this.selected) return;
    this._setSelected(id);
  },
  _setSelected(id) {
    this.selected = id;
    this.emit('select', id);
  },

  // ------------------------------------------------------------ achievements
  /** meta: { zh, en, ch }：解锁时的名字和所属章节，记进成就历史（这样没装载那一章时菜单里也能显示）。 */
  achieve(id, meta = {}) {
    if (!id || this.achievements.includes(id)) return false;
    this.achievements.push(id);
    const p = readProfile();
    const old = p.ach[id];
    p.ach[id] = {
      t: (old && old.t) || Date.now(),
      zh: meta.zh || (old && old.zh) || id, en: meta.en || (old && old.en) || '', ch: meta.ch || (old && old.ch) || null,
    };
    writeProfile(p);
    this.emit('achievement', id);
    return true;
  },
  /** 历史上解锁过的成就 id（任何一份存档里解锁过都算）。 */
  allAchievements() { return Object.keys(readProfile().ach); },
  /** 成就历史：{ id: { t, zh, en, ch } }（t 是首次解锁的毫秒时间，旧版迁移来的是 0）。 */
  achievementHistory() { return JSON.parse(JSON.stringify(readProfile().ach)); },

  // ------------------------------------------------------------ 通关记录
  /** 记一章通关（只记一次，保留第一次的时间）。新记录返回 true。 */
  markCleared(chapterId) {
    if (!chapterId) return false;
    const p = readProfile();
    if (p.cleared[chapterId]) return false;
    p.cleared[chapterId] = { t: Date.now() };
    writeProfile(p);
    this.emit('cleared', { chapter: chapterId });
    return true;
  },
  isCleared(chapterId) { return !!readProfile().cleared[chapterId]; },
  clearedAt(chapterId) { const c = readProfile().cleared[chapterId]; return c ? c.t || 0 : null; },
  /** 最近玩的章节 id（没有就 null）。 */
  lastChapter() { return lsGet(LAST_KEY) || null; },
  /** 这个环境能不能写本地存储（容器里可能被禁用）：试写一个键再删掉。 */
  storageOk() {
    try { window.localStorage.setItem('rlp3d.probe', '1'); window.localStorage.removeItem('rlp3d.probe'); return true; } catch { return false; }
  },

  // ------------------------------------------------------------------ view
  setView(id) {
    if (this.view === id) return;
    const old = this.view;
    this.view = id;
    this.emit('view', { id, old });
  },

  // ---------------------------------------------------------------- events
  on(evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt).add(fn);
    return () => listeners.get(evt)?.delete(fn);
  },
  emit(evt, data) {
    const set = listeners.get(evt);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(data); } catch (err) { console.error(`[state] listener for '${evt}' failed`, err); }
    }
  },

  // ----------------------------------------------------------------- saves
  save() {
    if (!this.chapter || !this.saving) return false;
    const data = {
      v: SAVE_VERSION, chapter: this.chapter, flags: this.flags, inventory: this.inventory,
      view: this.view, achievements: this.achievements, savedAt: Date.now(),
    };
    let json;
    try { json = JSON.stringify(data); } catch (err) { console.error('[state] save failed', err); return false; }
    lsSet(LAST_KEY, this.chapter);
    return lsSet(SAVE_PREFIX + this.chapter, json);
  },
  /** 读出某一章的存档内容（不改状态）；没有、坏了或版本对不上都返回 null。 */
  peekSave(chapterId) {
    const raw = chapterId ? lsGet(SAVE_PREFIX + chapterId) : null;
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      return data && typeof data === 'object' && data.v === SAVE_VERSION ? data : null;
    } catch { return null; }
  },
  load(chapterId = this.chapter) {
    if (!chapterId) return false;
    const data = this.peekSave(chapterId);
    if (!data) return false;
    this.chapter = chapterId;
    this.flags = data.flags && typeof data.flags === 'object' ? { ...data.flags } : {};
    this.inventory = Array.isArray(data.inventory) ? data.inventory.slice(0, MAX_SLOTS) : [];
    this.selected = null;
    this.view = typeof data.view === 'string' ? data.view : null;
    this.achievements = Array.isArray(data.achievements) ? [...data.achievements] : [];
    this.emit('load', { chapter: chapterId });
    this.emit('inventory', { type: 'load' });
    this.emit('select', null);
    return true;
  },
  hasSave(chapterId) { return !!this.peekSave(chapterId); },
  reset(chapterId = this.chapter) {
    if (chapterId) lsDel(SAVE_PREFIX + chapterId);
    this.chapter = chapterId || null;
    this.flags = {};
    this.inventory = [];
    this.selected = null;
    this.view = null;
    this.achievements = [];
    this.emit('reset', { chapter: chapterId });
    this.emit('inventory', { type: 'reset' });
    this.emit('select', null);
  },
  // Wipes every save + the profile (成就历史 / 通关记录) (menu → 重置进度).
  wipeAll() {
    try {
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && (k.startsWith(SAVE_PREFIX) || k === GLOBAL_ACH || k === PROFILE_KEY || k === LAST_KEY)) keys.push(k);
      }
      keys.forEach(lsDel);
    } catch { /* ignore */ }
    profileMem = null;
    this.reset(this.chapter);
  },
  snapshot() {
    return { chapter: this.chapter, flags: { ...this.flags }, inventory: [...this.inventory], selected: this.selected, view: this.view, achievements: [...this.achievements] };
  },
};

// ----------------------------------------------------------------------- 玩家档案（成就历史 + 通关记录）
function readProfile() {
  let p = null;
  const raw = lsGet(PROFILE_KEY);
  if (raw) { try { p = JSON.parse(raw); } catch { p = null; } }
  if (!p || typeof p !== 'object') {
    p = (storageBroken && profileMem) || migrateLegacy();
    // 迁移到了东西才落盘；空档案只留在内存里（读一下菜单不该在存储里凭空多出一个键）
    if (Object.keys(p.ach).length || Object.keys(p.cleared).length) lsSet(PROFILE_KEY, JSON.stringify(p));
  }
  if (!p.ach || typeof p.ach !== 'object') p.ach = {};
  if (!p.cleared || typeof p.cleared !== 'object') p.cleared = {};
  profileMem = p;
  return p;
}

function writeProfile(p) { profileMem = p; return lsSet(PROFILE_KEY, JSON.stringify(p)); }

// 第一次读档案时把旧版的数据并进来：成就 id 数组（时间未知记 0）、带 plagueN_complete 的旧存档（算通关）
function migrateLegacy() {
  const p = { v: 1, ach: {}, cleared: {} };
  try {
    const old = JSON.parse(lsGet(GLOBAL_ACH) || '[]');
    if (Array.isArray(old)) for (const id of old) if (typeof id === 'string') p.ach[id] = { t: 0, zh: id, en: '', ch: null };
  } catch { /* 坏数据当没有 */ }
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(SAVE_PREFIX)) continue;
      const id = k.slice(SAVE_PREFIX.length);
      const data = JSON.parse(window.localStorage.getItem(k));
      if (data && data.flags && data.flags[`${id}_complete`]) p.cleared[id] = { t: data.savedAt || 0 };
    }
  } catch { /* 坏数据当没有 */ }
  return p;
}

export const storage = { get: lsGet, set: lsSet, del: lsDel };
