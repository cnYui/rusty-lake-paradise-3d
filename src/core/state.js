// Game state: flags, inventory, selection, current view, achievements + localStorage saves.
// Events: 'inventory' 'flag' 'select' 'view' 'achievement' 'reset' 'load'.
// Save key: rlp3d.save.<chapterId>. Achievements are also mirrored globally (rlp3d.achievements)
// so the title menu can list everything ever unlocked.

// 物品栏 12 格：前 6 格是右侧第一列；超过 6 件时展开第二列（原作也是这样，第二、三灾会同时持有 7 件以上）。
export const MAX_SLOTS = 12;
export const COLUMN_SLOTS = 6;
const SAVE_PREFIX = 'rlp3d.save.';
const GLOBAL_ACH = 'rlp3d.achievements';

function lsGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function lsSet(key, val) {
  try { window.localStorage.setItem(key, val); return true; } catch { return false; }
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
  achieve(id) {
    if (!id || this.achievements.includes(id)) return false;
    this.achievements.push(id);
    const all = globalAchievements();
    if (!all.includes(id)) { all.push(id); lsSet(GLOBAL_ACH, JSON.stringify(all)); }
    this.emit('achievement', id);
    return true;
  },
  allAchievements() { return globalAchievements(); },

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
      v: 1, chapter: this.chapter, flags: this.flags, inventory: this.inventory,
      view: this.view, achievements: this.achievements, savedAt: Date.now(),
    };
    let json;
    try { json = JSON.stringify(data); } catch (err) { console.error('[state] save failed', err); return false; }
    lsSet('rlp3d.last', this.chapter);
    return lsSet(SAVE_PREFIX + this.chapter, json);
  },
  load(chapterId = this.chapter) {
    if (!chapterId) return false;
    const raw = lsGet(SAVE_PREFIX + chapterId);
    if (!raw) return false;
    let data;
    try { data = JSON.parse(raw); } catch { return false; }
    if (!data || typeof data !== 'object') return false;
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
  hasSave(chapterId) { return !!lsGet(SAVE_PREFIX + chapterId); },
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
  // Wipes every save + global achievements (menu → 重置进度).
  wipeAll() {
    try {
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && (k.startsWith(SAVE_PREFIX) || k === GLOBAL_ACH || k === 'rlp3d.last')) keys.push(k);
      }
      keys.forEach(lsDel);
    } catch { /* ignore */ }
    this.reset(this.chapter);
  },
  snapshot() {
    return { chapter: this.chapter, flags: { ...this.flags }, inventory: [...this.inventory], selected: this.selected, view: this.view, achievements: [...this.achievements] };
  },
};

function globalAchievements() {
  const raw = lsGet(GLOBAL_ACH);
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

export const storage = { get: lsGet, set: lsSet, del: lsDel };
