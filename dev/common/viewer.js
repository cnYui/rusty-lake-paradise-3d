// Standalone viewer for art modules (no game core needed).
//   ?prop=owl_totem[&mod=props_inner]   ?char=david   ?animal=goat   ?world=1[&zone=exterior]
//   &cam=px,py,pz,tx,ty,tz  &fov=40  &bg=%23888888  &call=flap;setLevel:3  &advance=1.5  &hud=0
// window.VIEW = { scene, camera, renderer, obj, world, advance(sec), call(name, ...args), render() }
// window.VIEW_READY = true when loaded (window.VIEW_ERROR holds a message on failure).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { tick } from '../../src/core/tween.js';

const q = new URLSearchParams(location.search);
const info = document.getElementById('info');
if (q.get('hud') === '0') info.classList.add('hidden');
const log = (m) => { info.textContent += m + '\n'; };

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(q.get('bg') || '#8f969a');
const camera = new THREE.PerspectiveCamera(Number(q.get('fov') || 40), 1, 0.05, 5000);
const outline = new OutlineEffect(renderer, { defaultThickness: 0.0045, defaultColor: [0.05, 0.05, 0.05] });
const controls = new OrbitControls(camera, canvas);

const updaters = [];
const engineLike = {
  renderer, scene, camera, outline, timeScale: 1, elapsed: 0,
  onUpdate(fn) { updaters.push(fn); return () => updaters.splice(updaters.indexOf(fn), 1); },
};

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function step(dt) {
  engineLike.elapsed += dt;
  tick(dt);
  for (const fn of updaters) fn(dt, engineLike.elapsed);
  VIEW.obj?.update?.(dt, engineLike.elapsed);
  VIEW.world?.update?.(dt, engineLike.elapsed);
}

const VIEW = (window.VIEW = {
  THREE, scene, camera, renderer, controls, obj: null, world: null, engine: engineLike,
  render() { outline.render(scene, camera); },
  advance(sec) { const n = Math.ceil(sec * 60); for (let i = 0; i < n; i++) step(1 / 60); this.render(); },
  async call(name, ...args) {
    const target = this.obj;
    if (!target || typeof target[name] !== 'function') throw new Error(`no method ${name} on object`);
    const p = target[name](...args);
    return p;
  },
});

function defaultLights() {
  scene.add(new THREE.HemisphereLight('#e8eef2', '#6b665c', 1.6));
  const sun = new THREE.DirectionalLight('#fff6e8', 1.6);
  sun.position.set(6, 10, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);
}

function frameObject(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3()).length() || 1;
  const center = box.getCenter(new THREE.Vector3());
  camera.position.copy(center).add(new THREE.Vector3(0.55, 0.35, 1).normalize().multiplyScalar(size * 1.25));
  controls.target.copy(center);
  camera.near = size / 200; camera.far = size * 200; camera.updateProjectionMatrix();
}

async function loadProp(id) {
  const mods = q.get('mod') ? [q.get('mod')] : ['props_beach', 'props_inner', 'props_lake', 'props_frogs', 'props_p2_lake', 'props_p2_house', 'props_p2_temple', 'props_p5', 'props_p3_items', 'props_p3_beach', 'props_p3_forest', 'props_p3_house', 'props_p3_grove'];
  for (const m of mods) {
    try {
      const mod = await import(`../../src/art/${m}.js`);
      if (mod.FACTORIES?.[id]) return mod.FACTORIES[id]({});
    } catch (e) {
      if (q.get('mod')) throw e;
      log(`(${m}.js not loadable: ${e.message})`);
    }
  }
  throw new Error(`prop ${id} not found`);
}

async function main() {
  let obj = null;
  if (q.get('prop')) {
    defaultLights();
    obj = await loadProp(q.get('prop'));
  } else if (q.get('char')) {
    defaultLights();
    const mod = await import('../../src/art/characters.js');
    await import('../../src/art/characters_p2.js').catch((e) => log('characters_p2: ' + e.message));   // 第二灾角色（注册到 makeCharacter）
    const rig = mod.makeCharacter(q.get('char'));
    obj = rig.root; obj.rig = rig;
    VIEW.rig = rig;
    obj.update = (dt, t) => rig.update?.(dt, t);
    for (const k of Object.keys(rig)) if (typeof rig[k] === 'function' && !obj[k]) obj[k] = rig[k].bind(rig);
    if (q.get('anim')) rig.play?.(q.get('anim'));
    if (q.get('mask')) rig.setMask?.(q.get('mask'));
  } else if (q.get('animal')) {
    defaultLights();
    const mod = await import('../../src/art/characters.js');
    const rig = mod.makeAnimal(q.get('animal'));
    obj = rig.root; VIEW.rig = rig;
    obj.update = (dt, t) => rig.update?.(dt, t);
    for (const k of Object.keys(rig)) if (typeof rig[k] === 'function' && !obj[k]) obj[k] = rig[k].bind(rig);
  } else if (q.get('world')) {
    const mod = await import('../../src/art/world.js');
    const world = mod.buildWorld(engineLike);
    VIEW.world = world;
    const zone = q.get('zone') || 'exterior';
    for (const [id, g] of Object.entries(world.zones)) g.visible = id === zone;
    if (q.get('blood')) world.lake?.setBlood?.(Number(q.get('blood')));
  } else {
    log('usage: ?prop=id | ?char=id | ?animal=goat | ?world=1&zone=exterior  (&cam=px,py,pz,tx,ty,tz &call=a;b:arg &advance=sec)');
  }
  if (obj) {
    scene.add(obj);
    VIEW.obj = obj;
    frameObject(obj);
  }
  if (q.get('cam')) {
    const c = q.get('cam').split(',').map(Number);
    camera.position.set(c[0], c[1], c[2]);
    controls.target.set(c[3], c[4], c[5]);
  }
  controls.update();
  if (q.get('call')) {
    for (const part of q.get('call').split(';')) {
      const [name, argStr] = part.split(':');
      const args = argStr ? argStr.split(',').map((a) => (isNaN(Number(a)) ? (a === 'true' ? true : a === 'false' ? false : a) : Number(a))) : [];
      const p = VIEW.call(name, ...args);
      // let promise-returning animations play out deterministically
      if (p && typeof p.then === 'function') { VIEW.advance(Number(q.get('callTime') || 6)); await p; }
    }
  }
  if (q.get('advance')) VIEW.advance(Number(q.get('advance')));
  VIEW.render();
  window.VIEW_READY = true;
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (q.get('freeze') !== '1') step(dt);
    controls.update();
    VIEW.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main().catch((e) => {
  console.error(e);
  log('ERROR: ' + e.message + '\n' + (e.stack || ''));
  window.VIEW_ERROR = e.message;
  window.VIEW_READY = true;
});
