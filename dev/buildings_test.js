// Private test page for src/art/buildings.js (owned by the buildings module).
//   ?zone=exterior|house_int|temple_int|memory   &cam=px,py,pz,tx,ty,tz (set-local for interior sets)
//   &fov=45  &markers=1 (anchor spheres)  &props=1 (place real props/characters at anchors if available)
//   &bg=%23cfe8f2 (exterior sky colour)  &ground=%236b6a65
import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { buildBuildings } from '../src/art/buildings.js';
import { SETS } from '../src/art/layout.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(Number(q.get('fov') || 45), 1, 0.05, 4000);
const outline = new OutlineEffect(renderer, { defaultThickness: 0.0045, defaultColor: [0.05, 0.05, 0.05] });

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

async function main() {
  const t0 = performance.now();
  const B = buildBuildings();
  const buildMs = performance.now() - t0;
  const zone = q.get('zone') || 'exterior';
  let origin = new THREE.Vector3();
  if (zone === 'exterior') {
    scene.background = new THREE.Color(q.get('bg') || '#cfe8f2');
    scene.add(B.exterior);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: q.get('ground') || '#6b6a65' }));
    ground.position.y = 0.5; ground.receiveShadow = true;
    ground.material.userData.outlineParameters = { visible: false };
    scene.add(ground);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(800, 800).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#c5c9cc' }));
    water.material.userData.outlineParameters = { visible: false };
    if (q.get('water') === '1') { ground.visible = false; scene.add(water); }
    scene.add(new THREE.HemisphereLight('#e8eef2', '#6b665c', 1.6));
    const sun = new THREE.DirectionalLight('#fff6e8', 1.7);
    sun.position.set(30, 60, 50); sun.target.position.set(0, 0, 0);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 200 });
    scene.add(sun, sun.target);
  } else {
    scene.background = new THREE.Color('#000');
    const set = B.sets[zone];
    scene.add(set);
    origin = new THREE.Vector3().fromArray(SETS[zone].origin);
  }
  scene.updateMatrixWorld(true);

  if (q.get('markers') === '1') {
    for (const [name, a] of B.anchors) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff00ff' }));
      s.material.userData.outlineParameters = { visible: false };
      a.add(s);
      const ax = new THREE.AxesHelper(0.4); a.add(ax);
    }
  }

  if (q.get('props') === '1') {
    let makeProp = null, makeCharacter = null;
    try { ({ makeProp } = await import('../src/art/props.js')); } catch (e) { console.warn('props not loadable', e.message); }
    try { ({ makeCharacter } = await import('../src/art/characters.js')); } catch (e) { console.warn('chars not loadable', e.message); }
    const place = (anchorName, obj) => {
      const a = B.anchors.get(anchorName);
      if (!a || !obj) return;
      a.add(obj);
    };
    const tryProp = (id) => { try { return makeProp ? makeProp(id) : null; } catch { return null; } };
    const tryChar = (id) => { try { return makeCharacter ? makeCharacter(id).root : null; } catch { return null; } };
    if (zone === 'house_int') {
      place('house_int.photo', tryProp('family_photo'));
      place('house_int.portrait', tryProp('portrait_caroline'));
      place('house_int.cabinet', tryProp('cabinet'));
      place('house_int.table', tryProp('dining_table'));
      place('house_int.chair', tryProp('high_chair'));
      place('house_int.chair', tryChar('nicholas'));
    } else if (zone === 'temple_int') {
      place('temple_int.font', tryProp('font'));
      place('temple_int.holder', tryProp('winged_holder'));
    } else if (zone === 'memory') {
      place('memory.coffin', tryProp('coffin'));
      ['gerard_boar', 'elizabeth_pheasant', 'nicholas_deer', 'david_rabbit', 'margaret_pigeon'].forEach((id, i) => place(`memory.family${i}`, tryChar(id)));
    } else if (zone === 'exterior') {
      place('shed.doorway', tryProp('shed_door'));
    }
  }

  const c = (q.get('cam') || (zone === 'exterior' ? '3,2.1,-1,3,2.4,-14' : zone === 'house_int' ? '0,1.05,2.3,0,1.05,-1.6' : zone === 'temple_int' ? '0,1.5,3.0,0,1.5,-2' : '0,1.3,4.5,0,1.3,-2')).split(',').map(Number);
  camera.position.set(c[0], c[1], c[2]).add(origin);
  camera.lookAt(new THREE.Vector3(c[3], c[4], c[5]).add(origin));

  const adv = Number(q.get('advance') || 0);
  for (let i = 0; i < adv * 60; i++) B.update(1 / 60, i / 60);
  outline.render(scene, camera);
  window.B = B;
  window.STATS = { buildMs: Math.round(buildMs), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, anchors: [...B.anchors.keys()] };
  window.VIEW_READY = true;
}

main().catch((e) => {
  console.error(e);
  window.VIEW_ERROR = e.message;
  window.VIEW_READY = true;
});
