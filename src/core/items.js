// Item registry, recipes, inventory icons (rendered from the item's 3D model with an offscreen
// renderer: transparent background, black outlines) and the 3D part of the item inspector.
//
// items.define({ id, name: { zh, en }, model: () => Object3D,
//                icon?: { rot: [x,y,z], scale: 1, offset: [x,y,z] /* fraction of the icon frame */ },
//                onInspectClick?: async (ctx, partName) => {} })
import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { state } from './state.js';
import { ctx } from './context.js';
import { audio } from './audio.js';
import { ui } from './ui.js';

const defs = new Map();
const recipes = new Map();
const iconCache = new Map();
const lineCache = new Map();

const ICON = 192;              // icon bitmap size (px). The UI shows it at 1.6× the slot size.
const OUTLINE_BOOST = 5;       // outline thickness multiplier for the small icon renders

let renderer = null;
let outline = null;
let scene = null;
let ortho = null;
let persp = null;
let ready = false;

function recipeKey(a, b) { return [a, b].sort().join('+'); }

function placeholderIcon(label = '?') {
  const c = document.createElement('canvas');
  c.width = c.height = ICON;
  const g = c.getContext('2d');
  g.strokeStyle = '#141414'; g.lineWidth = 8; g.fillStyle = '#d9cfb4';
  g.beginPath(); g.arc(ICON / 2, ICON / 2, ICON * 0.2, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#141414'; g.font = `bold ${ICON * 0.22}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, ICON / 2, ICON / 2 + 2);
  return c.toDataURL('image/png');
}

function buildModel(def) {
  let model = null;
  try { model = def.model ? def.model() : null; } catch (err) {
    console.error(`[items] model() for "${def.id}" failed`, err);
    model = null;
  }
  return model && model.isObject3D ? model : null;
}

// Temporarily thicken toon outlines (thickness is in NDC, so small renders need more).
function boostOutlines(root, factor) {
  const touched = [];
  root.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      const p = m.userData && m.userData.outlineParameters;
      if (p && typeof p.thickness === 'number' && !touched.some((t) => t.m === m)) {
        touched.push({ m, t: p.thickness });
        p.thickness = p.thickness * factor;
      }
    }
  });
  return () => { for (const { m, t } of touched) m.userData.outlineParameters.thickness = t; };
}

// Centre + fit a model into a pivot so that it reads well at icon size.
function frameModel(model, def, { fill = 0.42 } = {}) {
  const ic = def.icon || {};
  const rot = ic.rot || [0.35, -0.55, 0.12];
  const pivot = new THREE.Group();
  const spin = new THREE.Group();
  spin.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  spin.add(model);
  pivot.add(spin);
  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(spin, true);
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  spin.position.sub(center);
  const big = Math.max(size.x, size.y, 1e-4);
  const small = Math.max(Math.min(size.x, size.y), big * 0.08);
  // metric between "fit the longest side" and "fit the area": long items overflow the slot like
  // the original (machete, stick) while compact ones stay inside it.
  const metric = Math.pow(big, 0.55) * Math.pow(small, 0.45);
  let s = (fill * (ic.scale || 1)) / metric;          // frame is 1 unit wide
  s = Math.min(s, 0.95 / big);
  pivot.scale.setScalar(s);
  const off = ic.offset || [0, 0, 0];
  pivot.position.set(off[0] || 0, off[1] || 0, off[2] || 0);
  return { pivot, depth: size.z * s };
}

function makeScene() {
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight('#ffffff', '#8a8378', 2.2));
  const key = new THREE.DirectionalLight('#fff8ec', 2.0);
  key.position.set(-2, 3, 4);
  sc.add(key);
  const fill = new THREE.DirectionalLight('#dfe8ff', 0.6);
  fill.position.set(3, -1, 2);
  sc.add(fill);
  return sc;
}

function renderIconCanvas(id) {
  const def = defs.get(id);
  if (!def || !ready) return null;
  const model = buildModel(def);
  if (!model) return null;
  const { pivot } = frameModel(model, def);
  scene.add(pivot);
  const restore = boostOutlines(pivot, OUTLINE_BOOST);
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(ICON, ICON, false);
    renderer.setClearColor(0x000000, 0);
    outline.render(scene, ortho);
    const c = document.createElement('canvas');
    c.width = c.height = ICON;
    c.getContext('2d').drawImage(renderer.domElement, 0, 0);
    return c;
  } finally {
    restore();
    scene.remove(pivot);
  }
}

// White-line version of an icon for thought bubbles: ink + silhouette edges → white.
function lineFromIcon(src) {
  const w = src.width, h = src.height;
  const g = src.getContext('2d');
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const og = out.getContext('2d');
  const o = og.createImageData(w, h);
  const od = o.data;
  const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d[(y * w + x) * 4 + 3];
  const mark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = d[i + 3];
      if (a < 100) continue;
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      const edge = A(x - 2, y) < 100 || A(x + 2, y) < 100 || A(x, y - 2) < 100 || A(x, y + 2) < 100;
      if (lum < 0.2 || edge) mark[y * w + x] = 1;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 1px dilation for legibility
      let m = mark[y * w + x];
      if (!m) m = (x > 0 && mark[y * w + x - 1]) || (y > 0 && mark[(y - 1) * w + x]) ? 1 : 0;
      if (m) {
        const i = (y * w + x) * 4;
        od[i] = od[i + 1] = od[i + 2] = 250; od[i + 3] = 255;
      }
    }
  }
  og.putImageData(o, 0, 0);
  return out;
}

// --------------------------------------------------------------------------- inspector (3D)
const insp = {
  open: false, id: null, pivot: null, model: null, yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0,
  width: 0, height: 0, raycaster: new THREE.Raycaster(),
};

export const items = {
  ICON_SIZE: ICON,

  init(engine) {
    this.engine = engine;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = ICON;
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.setClearColor(0x000000, 0);
      outline = new OutlineEffect(renderer, { defaultThickness: 0.02, defaultColor: [0.05, 0.05, 0.05], defaultKeepAlive: true });
      scene = makeScene();
      ortho = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 100);
      ortho.position.set(0, 0, 20);
      ortho.lookAt(0, 0, 0);
      persp = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
      persp.position.set(0, 0, 2.4);
      persp.lookAt(0, 0, 0);
      ready = true;
    } catch (err) {
      console.error('[items] icon renderer unavailable', err);
      ready = false;
    }
    engine.onFrame((dt) => this._renderInspector(dt));
  },

  define(def) {
    if (!def || !def.id) throw new Error('items.define: id required');
    const d = { name: { zh: def.id, en: def.id }, ...def };
    if (typeof d.name === 'string') d.name = { zh: d.name, en: d.name };
    defs.set(d.id, d);
    iconCache.delete(d.id);
    lineCache.delete(d.id);
    return d;
  },

  get(id) { return defs.get(id) || null; },
  all() { return [...defs.values()]; },
  name(id, lang = 'zh') {
    const d = defs.get(id);
    return d ? (d.name[lang] || d.name.zh || id) : id;
  },

  recipe(a, b, fn) {
    recipes.set(recipeKey(a, b), fn);
  },
  hasRecipe(a, b) { return recipes.has(recipeKey(a, b)); },

  /** Inventory icon as a PNG data URL (cached). */
  icon(id) {
    if (iconCache.has(id)) return iconCache.get(id).url;
    const c = renderIconCanvas(id);
    const entry = c ? { url: c.toDataURL('image/png'), canvas: c } : { url: placeholderIcon(defs.has(id) ? '·' : '?'), canvas: null };
    iconCache.set(id, entry);
    return entry.url;
  },

  /** White line-art version of the icon (for thought bubbles). Returns a canvas or null. */
  lineIcon(id) {
    if (lineCache.has(id)) return lineCache.get(id);
    this.icon(id);
    const entry = iconCache.get(id);
    const c = entry && entry.canvas ? lineFromIcon(entry.canvas) : null;
    lineCache.set(id, c);
    return c;
  },

  /** Combine two inventory items (order-agnostic). Wrong pairs shake + deselect. */
  async combine(a, b) {
    if (!a || !b || a === b && state.count(a) < 2) return false;
    const fn = recipes.get(recipeKey(a, b));
    if (!fn) {
      audio.sfx('wrong');
      ui.shakeSelected();
      state.select(null);
      return false;
    }
    audio.sfx('combine');
    state.select(null);
    await fn(ctx, a, b);
    state.save();
    return true;
  },

  // ------------------------------------------------------------------ inspector helpers
  /** Attach the 3D inspector to a DOM container; renders every frame until closeInspector(). */
  openInspector(id, container) {
    this.closeInspector();
    const def = defs.get(id);
    if (!def || !ready) return false;
    const model = buildModel(def);
    if (!model) return false;
    const { pivot } = frameModel(model, def, { fill: 0.62 });
    const holder = new THREE.Group();
    holder.add(pivot);
    scene.add(holder);
    insp.open = true; insp.id = id; insp.pivot = holder; insp.model = model;
    insp.yaw = insp.targetYaw = 0; insp.pitch = insp.targetPitch = 0;
    const el = renderer.domElement;
    el.className = 'inspector-canvas';
    container.appendChild(el);
    insp.container = container;
    return true;
  },

  rotateInspector(dx, dy) {
    insp.targetYaw += dx;
    insp.targetPitch = Math.max(-1.2, Math.min(1.2, insp.targetPitch + dy));
  },

  /** Name of the clicked part of the inspected model (nearest named ancestor), or null. */
  pickInspector(fx, fy) {
    if (!insp.open) return null;
    persp.updateMatrixWorld();
    insp.raycaster.setFromCamera(new THREE.Vector2(fx * 2 - 1, -(fy * 2 - 1)), persp);
    const hits = insp.raycaster.intersectObject(insp.pivot, true);
    for (const h of hits) {
      for (let o = h.object; o && o !== insp.pivot; o = o.parent) {
        if (o.name && o.name !== 'proxy') return o.name;
      }
    }
    return hits.length ? '' : null;
  },

  closeInspector() {
    if (!insp.open) return;
    scene.remove(insp.pivot);
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    insp.open = false; insp.id = null; insp.pivot = null; insp.model = null;
  },

  get inspecting() { return insp.open ? insp.id : null; },

  _renderInspector(dt) {
    if (!insp.open || !insp.container) return;
    const w = Math.max(1, insp.container.clientWidth), h = Math.max(1, insp.container.clientHeight);
    const pr = Math.min(2, window.devicePixelRatio || 1);
    if (renderer.getPixelRatio() !== pr) renderer.setPixelRatio(pr);
    const sz = renderer.getSize(new THREE.Vector2());
    if (sz.x !== w || sz.y !== h) renderer.setSize(w, h, false);
    persp.aspect = w / h;
    persp.position.set(0, 0, 1.55);
    persp.updateProjectionMatrix();
    const k = 1 - Math.exp(-dt * 10);
    insp.targetYaw += dt * 0.12; // gentle idle turn
    insp.yaw += (insp.targetYaw - insp.yaw) * k;
    insp.pitch += (insp.targetPitch - insp.pitch) * k;
    insp.pivot.rotation.set(insp.pitch, insp.yaw, 0);
    renderer.setClearColor(0x000000, 0);
    const restore = boostOutlines(insp.pivot, 1.6);
    try { outline.render(scene, persp); } finally { restore(); }
  },
};
