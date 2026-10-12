// Hotspots: clickable 3D objects per view + all canvas pointer input (click at the cursor,
// hover cursor).
//
// spec = { id, views: ['viewId', ...], object: Object3D (all child meshes are raycast targets),
//          when: (state, ctx) => bool, cursor: 'pointer'|'zoom'|'grab'|'talk'|'use',
//          goto: 'viewId', onClick: async (ctx) => {}, onItem: { itemId: async (ctx, itemId) => {} },
//          onWrongItem: async (ctx, itemId) => {}, free?: false（漫游时不开放） }
//
// 室外漫游时，凡是挂在任一开放视图上的热点都可以点（不再按当前逻辑视图筛选），但仍要经过
// 射线命中、可见性、when 条件和最远交互距离；只属于总览或特写的热点在漫游时不生效。
import * as THREE from 'three';
import { state } from './state.js';
import { views } from './views.js';
import { ui } from './ui.js';
import { audio } from './audio.js';
import { ctx } from './context.js';
import { touch } from './touch.js';
import { noOutline } from '../art/materials.js';

const specs = new Map();
let engine = null;
const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 0.02;
raycaster.params.Points.threshold = 0.05;
const ndc = new THREE.Vector2();
const busy = new Set();
let running = 0;

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';

const ROAM_REACH = 24; // 漫游时能点到的最远距离（米），远处看得见的东西要走近再点

const proxyMaterial = noOutline(new THREE.MeshBasicMaterial({
  color: '#ff2bd6', transparent: true, opacity: 0.22, depthWrite: false, visible: DEBUG,
}));
const proxyGeo = new THREE.BoxGeometry(1, 1, 1);

const CURSORS = {
  pointer: 'pointer',
  use: 'pointer',
  zoom: 'zoom-in',
  grab: 'grab',
  talk: `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><path d="M4 4h20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H12l-6 5v-5H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="#fff" stroke="#111" stroke-width="2"/><circle cx="9" cy="11.5" r="1.6" fill="#111"/><circle cx="14" cy="11.5" r="1.6" fill="#111"/><circle cx="19" cy="11.5" r="1.6" fill="#111"/></svg>')}") 4 4, pointer`,
};

function visibleChain(obj) {
  for (let o = obj; o; o = o.parent) if (o.visible === false) return false;
  return true;
}

function currentViewId() {
  return views.current ? views.current.id : state.view;
}

function inView(spec, viewId = currentViewId()) {
  // 漫游时开放当前区域里所有开放视图的热点，仍由射线、可见性和距离决定是否真的能点中。
  if (views.freeMode) {
    return spec.free !== false && spec.views.some((id) => views.isOpen(id) && views.get(id).zone === views.zone);
  }
  return spec.views.includes(viewId);
}

function isEnabled(spec, viewId = currentViewId()) {
  if (!inView(spec, viewId)) return false;
  if (!spec.object) return false;
  if (spec.when) {
    try { return !!spec.when(state, ctx); } catch (err) { console.error(`[hotspots] ${spec.id}.when() failed`, err); return false; }
  }
  return true;
}

function enabledSpecs() {
  const out = [];
  for (const spec of specs.values()) if (isEnabled(spec)) out.push(spec);
  return out;
}

const _targets = [];
const _hits = [];
/** Raycast at client coordinates; returns { spec, point, object } of the nearest enabled hotspot. */
function pickAt(clientX, clientY) {
  if (!engine) return null;
  const rect = engine.canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  return pickNdc(ndc);
}

function pickNdc(p) {
  const list = enabledSpecs();
  if (!list.length) return null;
  const owner = new Map();
  _targets.length = 0;
  for (const spec of list) {
    if (!visibleChain(spec.object)) continue;
    _targets.push(spec.object);
    if (!owner.has(spec.object)) owner.set(spec.object, []);
    owner.get(spec.object).push(spec);
  }
  if (!_targets.length) return null;
  engine.camera.updateMatrixWorld();
  raycaster.setFromCamera(p, engine.camera);
  raycaster.far = views.freeMode ? ROAM_REACH : Infinity;
  _hits.length = 0;
  raycaster.intersectObjects(_targets, true, _hits);
  for (const hit of _hits) {
    const o = hit.object;
    if (!visibleChain(o)) continue;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (mat && mat.visible === false && !o.userData.proxy) continue;
    // the most specific hotspot object among the hit object's ancestors wins
    for (let a = o; a; a = a.parent) {
      const owners = owner.get(a);
      if (owners) return { spec: owners[owners.length - 1], point: hit.point, object: o, distance: hit.distance };
    }
  }
  return null;
}

async function activate(spec, point = null) {
  if (busy.has(spec.id)) return false; // ignore re-entrant clicks while its handler runs
  busy.add(spec.id);
  running++;
  // 这次点击落在世界里的位置（处理函数可用来放涟漪等效果）；测试直接调用 click() 时为 null
  ctx.hitPoint = point ? point.clone() : null;
  const sel = state.selected;
  if (DEBUG) console.log(`[hotspot] ${spec.id}${sel ? ` with ${sel}` : ''} (view ${currentViewId()})`);
  try {
    const itemHandler = sel && spec.onItem ? spec.onItem[sel] : null;
    if (itemHandler) {
      await itemHandler(ctx, sel);
    } else if (sel && (spec.onWrongItem || !(spec.goto && !spec.onItem))) {
      if (spec.onWrongItem) await spec.onWrongItem(ctx, sel);
      else {
        audio.sfx('wrong');
        ui.shakeSelected();
        state.select(null);
      }
    } else {
      if (sel) state.select(null);
      if (spec.goto) await views.go(spec.goto);
      if (spec.onClick) await spec.onClick(ctx);
    }
    return true;
  } finally {
    busy.delete(spec.id);
    running--;
    views.refreshArrows();
    state.save();
  }
}

// --------------------------------------------------------------------------- input
// 鼠标 / 手指只负责点击（视角由 views 和 touch.js 处理）；按下后移动太远不算点击。
// 每个指针分开记录，手机上一根手指推摇杆时另一根手指照样可以点。
const downs = new Map();   // pointerId → { x0, y0, max, type }
const pointer = { x: 0, y: 0, inside: false };
let hoverDirty = false;
let lastCursor = '';
let lastCamVersion = -1;
let hoverFrame = 0;

function setCursor(c) {
  if (c === lastCursor || !engine) return;
  lastCursor = c;
  engine.canvas.style.cursor = c;
}

function canInteract() {
  return !ui.locked && !views.transitioning && !ui.modalOpen;
}

function onPointerDown(ev) {
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  downs.set(ev.pointerId, { x0: ev.clientX, y0: ev.clientY, max: 0, type: ev.pointerType });
  try { engine.canvas.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
  audio.unlock();
}

function onPointerMove(ev) {
  const d = downs.get(ev.pointerId);
  if (d) d.max = Math.max(d.max, Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0));
  if (ev.pointerType !== 'mouse') return; // 触屏没有悬停光标
  pointer.x = ev.clientX;
  pointer.y = ev.clientY;
  pointer.inside = true;
  hoverDirty = true;
}

function onPointerUp(ev) {
  const d = downs.get(ev.pointerId);
  if (!d) return;
  downs.delete(ev.pointerId);
  try { engine.canvas.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
  // 拖动过（转视角、推摇杆）就不算点击；手指的阈值比鼠标宽一些
  const slop = d.type === 'mouse' ? 10 : touch.SLOP;
  if (Math.max(d.max, Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0)) > slop) return;
  if (!canInteract()) return;
  ui.ripple(ev.clientX, ev.clientY);
  const hit = pickAt(ev.clientX, ev.clientY);
  if (!hit) {
    if (state.selected) state.select(null);
    return;
  }
  // Errors propagate as unhandled rejections (captured by RLP.errors).
  activate(hit.spec, hit.point);
}

function updateHover() {
  if (touch.active) return;
  // 漫游时相机一直在动，指针下的物体会变：相机动了就重新拾取（每 3 帧一次）
  if (views.camVersion !== lastCamVersion && ++hoverFrame % 3 === 0) {
    lastCamVersion = views.camVersion;
    hoverDirty = true;
  }
  if (!hoverDirty || !pointer.inside) return;
  hoverDirty = false;
  if (!canInteract()) { setCursor('default'); return; }
  const hit = pickAt(pointer.x, pointer.y);
  setCursor(hit ? (CURSORS[hit.spec.cursor] || CURSORS.pointer) : views.edgeCursor());
}

// ------------------------------------------------------------------------ debug overlay
let dbgCanvas = null;
const _box = new THREE.Box3();
const _c = new THREE.Vector3();
function drawDebug() {
  if (!dbgCanvas) {
    if (!ui.vp) return;
    dbgCanvas = document.createElement('canvas');
    dbgCanvas.className = 'debug-layer';
    ui.vp.appendChild(dbgCanvas);
  }
  const w = dbgCanvas.clientWidth, h = dbgCanvas.clientHeight;
  if (dbgCanvas.width !== w || dbgCanvas.height !== h) { dbgCanvas.width = w; dbgCanvas.height = h; }
  const g = dbgCanvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.font = '12px monospace';
  g.textAlign = 'center';
  for (const spec of specs.values()) {
    if (!inView(spec) || !spec.object || !visibleChain(spec.object)) continue;
    _box.setFromObject(spec.object);
    if (_box.isEmpty()) continue;
    _box.getCenter(_c).project(engine.camera);
    if (_c.z > 1) continue;
    const x = (_c.x + 1) / 2 * w, y = (1 - _c.y) / 2 * h;
    const on = isEnabled(spec);
    g.fillStyle = on ? 'rgba(255,43,214,0.9)' : 'rgba(140,140,140,0.8)';
    g.fillRect(x - 3, y - 3, 6, 6);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    const tw = g.measureText(spec.id).width + 8;
    g.fillRect(x - tw / 2, y + 5, tw, 15);
    g.fillStyle = on ? '#ffd9f6' : '#bbb';
    g.fillText(spec.id, x, y + 16);
  }
}

export const hotspots = {
  debug: DEBUG,
  get busy() { return running > 0; },

  init(e) {
    engine = e;
    const c = engine.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', onPointerDown);
    c.addEventListener('pointermove', onPointerMove);
    c.addEventListener('pointerup', onPointerUp);
    c.addEventListener('pointercancel', (ev) => { downs.delete(ev.pointerId); });
    c.addEventListener('pointerleave', (ev) => {
      if (ev.pointerType !== 'mouse') return;
      pointer.inside = false;
      if (!downs.has(ev.pointerId)) setCursor('default');
    });
    engine.onFrame(() => {
      updateHover();
      if (DEBUG) drawDebug();
    });
    // locking / view changes must refresh the cursor
    state.on('view', () => { hoverDirty = true; });
  },

  define(spec) {
    if (!spec || !spec.id) throw new Error('hotspots.define: spec.id required');
    if (specs.has(spec.id)) console.warn(`[hotspots] redefining hotspot "${spec.id}"`);
    const views_ = Array.isArray(spec.views) ? spec.views : (spec.views ? [spec.views] : (spec.view ? [spec.view] : []));
    if (!views_.length) console.warn(`[hotspots] "${spec.id}" has no views`);
    if (!spec.object) console.warn(`[hotspots] "${spec.id}" has no object`);
    const s = { cursor: 'pointer', ...spec, views: views_ };
    specs.set(s.id, s);
    if (s.object) (s.object.userData.hotspots ||= []).push(s.id);
    hoverDirty = true;
    return s;
  },

  get(id) { return specs.get(id) || null; },
  remove(id) { specs.delete(id); },
  all() { return [...specs.values()]; },

  /** Hotspots that belong to a view (default: the current one). */
  list(viewId = currentViewId()) {
    return [...specs.values()].filter((s) => inView(s, viewId));
  },
  enabled(id) { const s = specs.get(id); return !!s && isEnabled(s); },

  /** Invisible pickable box (shown in ?debug=1). Origin = box centre at `pos`. */
  makeProxy(w = 1, h = 1, d = 1, pos = [0, 0, 0], parent = null) {
    const m = new THREE.Mesh(proxyGeo, proxyMaterial);
    m.scale.set(w, h, d);
    m.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
    m.name = 'proxy';
    m.userData.proxy = true;
    m.castShadow = false;
    m.receiveShadow = false;
    m.renderOrder = 999;
    if (parent) parent.add(m);
    return m;
  },

  /** Simulate a mouse click on a hotspot (honours state.selected). Throws if it is not clickable. */
  async click(id) {
    const spec = specs.get(id);
    if (!spec) throw new Error(`hotspots.click: unknown hotspot "${id}"`);
    if (ui.locked) throw new Error(`hotspots.click(${id}): the UI is locked (cutscene running)`);
    const v = currentViewId();
    if (!inView(spec, v)) throw new Error(`hotspots.click(${id}): not in the current view "${v}" (its views: ${spec.views.join(', ')})`);
    if (!isEnabled(spec, v)) throw new Error(`hotspots.click(${id}): disabled in the current state (view "${v}")`);
    if (!visibleChain(spec.object)) throw new Error(`hotspots.click(${id}): its object is hidden`);
    return activate(spec);
  },

  /** Is the hotspot's object on screen in the current camera? (for test diagnostics) */
  onScreen(id) {
    const spec = specs.get(id);
    if (!spec || !spec.object || !engine) return false;
    _box.setFromObject(spec.object);
    if (_box.isEmpty()) return false;
    engine.camera.updateMatrixWorld();
    _box.getCenter(_c).project(engine.camera);
    return _c.z <= 1 && Math.abs(_c.x) <= 1.05 && Math.abs(_c.y) <= 1.05;
  },

  pickAt,
  pickNdc(x, y) { return pickNdc(new THREE.Vector2(x, y)); },
};
