// 人物身高对照台：把多个角色并排放在带刻度的背板前，正交正视（或 3/4 透视）对比身高和比例。
//   dev/common/cast.html?ids=david,margaret,nicholas        逐个列出（默认是全部人物）
//   &ids=gerard@1.3,margaret_pigeon!nomask           @缩放（模拟章节里的 scale），!nomask 取下面具
//   &preset=current                                  目前各章节实际使用的人物和缩放
//   &view=front|34|side  &gap=0.75  &hud=0  &call=play:talk  &advance=1
// window.VIEW = { scene, camera, rigs, advance(sec), render() }；加载完成后 window.VIEW_READY = true。
import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { tick } from '../../src/core/tween.js';

const q = new URLSearchParams(location.search);
const info = document.getElementById('info');
if (q.get('hud') === '0') info.classList.add('hidden');
const log = (m) => { info.textContent += m + '\n'; };

// 当前（重做前）各章节里人物的实际缩放，用来对照“游戏里看到的身高”。
const PRESETS = {
  // 重做后的全部人物（各章节都按 scale = 1 使用）
  family: ['nicholas_deer!nomask~Nicholas', 'gerard~Gerard', 'david~David', 'jakob!full~Jakob', 'caroline~Caroline', 'ida~Ida', 'margaret_cook~Margaret', 'elizabeth_pheasant!nomask~Elizabeth', 'jakob_child~少年 Jakob', 'soul~灵魂'],
  masks: ['gerard_boar', 'elizabeth_pheasant', 'nicholas_deer', 'david_rabbit', 'margaret_pigeon'],
  seated: ['nicholas', 'margaret', 'margaret_pot', 'gerard!sit'],
  // 重做前各章节里人物的实际缩放（对照用；新模型下这些缩放已从章节代码里去掉）
  current: [
    'david', 'margaret', 'nicholas', 'jakob', 'soul', 'gerard_boar!nomask', 'elizabeth_pheasant!nomask', 'nicholas_deer!nomask', 'david_rabbit!nomask', 'margaret_pigeon!nomask',
    'gerard', 'ida', 'caroline', 'david_p2', 'margaret_cook',
    'gerard_boar@1.25!nomask~p4 Gerard', 'margaret@0.95~p4 Margaret', 'nicholas@1.45~p4 Nicholas', 'david@0.65~p4 记忆 David',
    'gerard_boar@1.3!nomask~p5 Gerard', 'nicholas@1.5~p5 Nicholas', 'margaret_cook@0.85~p5 Margaret',
  ],
};

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(q.get('bg') || '#9aa0a3');
const outline = new OutlineEffect(renderer, { defaultThickness: 0.0045, defaultColor: [0.05, 0.05, 0.05] });

scene.add(new THREE.HemisphereLight('#e8eef2', '#6b665c', 1.6));
const sun = new THREE.DirectionalLight('#fff6e8', 1.5);
sun.position.set(4, 9, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

function label(text, { size = 0.09, color = '#111', bg = 'rgba(255,255,255,0.75)' } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = '600 44px system-ui, sans-serif';
  const w = Math.ceil(g.measureText(text).width) + 24;
  c.width = w; c.height = 60;
  g.font = '600 44px system-ui, sans-serif';
  g.fillStyle = bg; g.fillRect(0, 0, w, 60);
  g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, 12, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size * w / 60, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  m.userData.outlineParameters = { visible: false };
  return m;
}

function ruler(width, height) {
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color: '#c9ccc8', toneMapped: false }));
  back.position.set(0, height / 2, -0.7);
  back.userData.outlineParameters = { visible: false };
  g.add(back);
  for (let y = 0; y <= height + 1e-6; y += 0.1) {
    const major = Math.abs(y * 2 - Math.round(y * 2)) < 1e-6;
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(width, major ? 0.008 : 0.003), new THREE.MeshBasicMaterial({ color: major ? '#5a5e60' : '#9a9e9f', toneMapped: false }));
    ln.position.set(0, y, -0.69);
    ln.userData.outlineParameters = { visible: false };
    g.add(ln);
    if (major) {
      const t = label(`${y.toFixed(1)} m`, { size: 0.07, bg: 'rgba(0,0,0,0)', color: '#333' });
      t.position.set(-width / 2 + 0.2, y + 0.045, -0.68);
      g.add(t);
    }
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, 2.2), new THREE.MeshLambertMaterial({ color: '#8d8a83' }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 0.4);
  floor.receiveShadow = true;
  floor.userData.outlineParameters = { visible: false };
  g.add(floor);
  return g;
}

/** 可见网格的包围盒（忽略点击代理、隐形网格和精灵）。 */
function visibleBox(obj) {
  const box = new THREE.Box3();
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.proxy) return;
    let v = true;
    for (let p = o; p; p = p.parent) if (!p.visible) { v = false; break; }
    if (!v || o.material?.visible === false) return;
    const name = (o.name || '').toLowerCase();
    if (name.includes('proxy') || name.includes('hit')) return;
    o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
  });
  return box;
}

const VIEW = (window.VIEW = { THREE, scene, renderer, rigs: [], camera: null, render() {} });

async function main() {
  const mod = await import('../../src/art/characters.js');
  for (const extra of ['characters_p2', 'cast']) await import(`../../src/art/${extra}.js`).catch((e) => log(`${extra}: ${e.message}`));
  // 网格人物模型（src/art/models）：先预加载；&models=0 强制用程序化人物做对照
  if (q.get('models') !== '0') {
    const rl = await import('../../src/art/rlpm.js');
    await rl.preloadModels(['david', 'gerard', 'nicholas', 'margaret', 'ida', 'jakob_child', 'rabbit', 'boar', 'pigeon', 'deer']);
  }
  const raw = q.get('preset') ? PRESETS[q.get('preset')] : (q.get('ids') ? q.get('ids').split(',') : mod.CHARACTER_IDS.filter((id) => id !== 'rower'));
  const gap = Number(q.get('gap') || 0.75);
  const specs = raw.map((s) => {
    const m = /^([^@!~]+)(?:@([\d.]+))?(?:!(nomask|full|sit))?(?:~(.+))?$/.exec(s.trim());
    return { id: m[1], scale: m[2] ? Number(m[2]) : 1, nomask: m[3] === 'nomask', full: m[3] === 'full', sit: m[3] === 'sit', label: m[4] || m[1] };
  });
  const width = specs.length * gap + 0.8;
  let maxH = 0;
  const rows = [];
  specs.forEach((s, i) => {
    let rig;
    try { rig = mod.makeCharacter(s.id); } catch (e) { log(`${s.id}: ${e.message}`); return; }
    if (s.nomask) rig.setMask?.(null);
    if (s.full) rig.setBust?.(false);
    if (s.sit) rig.sit?.(0.47, { hands: 'knees' });
    rig.root.scale.multiplyScalar(s.scale);
    rig.root.position.x = -width / 2 + 0.6 + i * gap;
    scene.add(rig.root);
    rig.update?.(0, 0);
    VIEW.rigs.push(rig);
    rows.push({ s, rig });
  });
  if (q.get('call')) {
    for (const part of q.get('call').split(';')) {
      const [name, argStr] = part.split(':');
      const args = argStr ? argStr.split(',').map((a) => (isNaN(Number(a)) ? (a === 'true' ? true : a === 'false' ? false : a) : Number(a))) : [];
      for (const { rig } of rows) if (typeof rig[name] === 'function') rig[name](...args);
    }
  }
  const step = (dt) => { tick(dt); for (const r of VIEW.rigs) r.update?.(dt, (VIEW.t = (VIEW.t || 0) + dt / VIEW.rigs.length)); };
  VIEW.advance = (sec) => { const n = Math.ceil(sec * 60); for (let i = 0; i < n; i++) step(1 / 60); VIEW.render(); };
  VIEW.advance(Number(q.get('advance') || 0.05));
  const heights = [];
  for (const { s, rig } of rows) {
    const b = visibleBox(rig.root);
    const h = b.max.y;
    maxH = Math.max(maxH, h);
    heights.push({ id: s.label, height: +h.toFixed(3), width: +(b.max.x - b.min.x).toFixed(3) });
    const t = label(`${s.label}`, { size: 0.065 });
    t.position.set(rig.root.position.x, -0.09, 0.3);
    scene.add(t);
    const t2 = label(`${h.toFixed(2)} m`, { size: 0.06, bg: 'rgba(255,255,255,0.0)' });
    t2.position.set(rig.root.position.x, h + 0.06, -0.2);
    scene.add(t2);
  }
  VIEW.heights = heights;
  const H = Math.max(2.0, Math.ceil((maxH + 0.25) * 10) / 10);
  scene.add(ruler(width, H));
  const view = q.get('view') || 'front';
  const aspect = innerWidth / innerHeight;
  let camera;
  if (view === 'front') {
    const viewH = Math.max(H + 0.35, (width + 0.1) / aspect);
    camera = new THREE.OrthographicCamera(-viewH * aspect / 2, viewH * aspect / 2, viewH / 2, -viewH / 2, 0.01, 50);
    camera.position.set(0, H / 2 - 0.12, 10);
    camera.lookAt(0, H / 2 - 0.12, 0);
  } else {
    camera = new THREE.PerspectiveCamera(Number(q.get('fov') || 30), aspect, 0.05, 100);
    const dist = Math.max(width, H * 1.6) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 0.62;
    const dir = view === 'side' ? new THREE.Vector3(1, 0.12, 0.02) : new THREE.Vector3(0.45, 0.16, 1);
    camera.position.copy(dir.normalize().multiplyScalar(dist)).add(new THREE.Vector3(0, H * 0.45, 0));
    camera.lookAt(0, H * 0.45, 0);
  }
  VIEW.camera = camera;
  VIEW.render = () => outline.render(scene, camera);
  const resize = () => { renderer.setSize(innerWidth, innerHeight, false); };
  addEventListener('resize', resize); resize();
  VIEW.render();
  log(heights.map((h) => `${h.id}: ${h.height} m`).join('\n'));
  window.VIEW_READY = true;
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (q.get('freeze') !== '1') step(dt);
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
