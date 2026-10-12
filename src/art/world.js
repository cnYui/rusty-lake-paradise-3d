// World assembler: sky + lake + island + buildings, zone groups, anchors, per-frame update.
//
// buildWorld(engine) → World = {
//   root, zones: { exterior, house_int, temple_int, memory }, anchors: Map, anchor(name),
//   lake: { setBlood(a, {ms}), setPool(v, {ms}), ripple(x, z, {strength}), mesh, material, … },
//   setFog(density01, { ms }) → Promise, update(dt, t),
//   sky, island, buildings, makeSilhouette (re-exported helper), groundHeight(x, z),
//   colliders: { circles: [[x, z, r]], boxes: [[x0, z0, x1, z1]], segments: [[ax, az, bx, bz, halfWidth]] }
// }
// See docs/impl_environment.md.
import * as THREE from 'three';
import { P, PALISADE, SHED_FENCE } from './layout.js';
import { buildSky } from './sky.js';
import { buildLake } from './lake.js';
import { buildIsland, forestness, groundHeight, makeSilhouette } from './island.js';
import { buildBuildings, BUILDING_DIMS } from './buildings.js';

const ZONE_IDS = ['exterior', 'house_int', 'temple_int', 'memory'];

// 室外漫游的静态碰撞体（x/z 平面）。章节门禁（天堂门、小屋门是否打开）不在这里，
// 由章节通过 views.addRoamGate() 注册，这里只描述永远走不过去的实体。
function buildColliders(island) {
  const at = (p) => [p.pos[0], p.pos[2]];
  const circles = (island.trunks || []).map(([x, z, r]) => [x, z, r * 1.08]);
  circles.push([...at(P.temple), P.temple.radius + 0.06]);
  circles.push([...at(P.tower), 3.0]);
  circles.push([...at(P.pump), 0.45], [...at(P.owlTotem), 0.6], [...at(P.margaret), 0.55], [...at(P.bucket), 0.3]);
  // 房屋是实心石墙（室内是另一个布景），按轴对齐盒子处理
  const [hw, , hd] = P.house.size;
  const boxes = [[P.house.pos[0] - hw / 2, P.house.pos[2] - hd / 2, P.house.pos[0] + hw / 2, P.house.pos[2] + hd / 2]];
  // 栅栏只在天堂门门洞处断开（两头伸进湖里）；小屋前后墙只在门洞处断开（小屋朝南，后墙在北面 depth 处）
  const { z: pz, xMin, xMax, gateGap, logRadius } = PALISADE;
  const sw = P.shedWall.pos, shedW = BUILDING_DIMS.shed.width, shedD = BUILDING_DIMS.shed.depth;
  const doorW = BUILDING_DIMS.shed.doorway.width;
  const sx0 = sw[0] - shedW / 2, sx1 = sw[0] + shedW / 2, sz0 = sw[2], sz1 = sw[2] - shedD;
  // 小船沿长轴（模型局部 x，长 3.6 m）做成胶囊；山羊沿身体朝向做成胶囊
  const [bx, , bz] = P.rowboat.pos, ba = P.rowboat.rotY || 0, bl = 1.6;
  const [gx, , gz] = P.goat.pos, ga = P.goat.rotY || 0;
  const segments = [
    [xMin, pz, -gateGap / 2, pz, logRadius + 0.05],
    [gateGap / 2, pz, xMax, pz, logRadius + 0.05],
    [sx0, sz0, sw[0] - doorW / 2, sz0, 0.12],
    [sw[0] + doorW / 2, sz0, sx1, sz0, 0.12],
    [sx0, sz0, sx0, sz1, 0.12],
    [sx1, sz0, sx1, sz1, 0.12],
    [sx0, sz1, sw[0] - doorW / 2, sz1, 0.12],
    [sw[0] + doorW / 2, sz1, sx1, sz1, 0.12],
    [bx - Math.cos(ba) * bl, bz + Math.sin(ba) * bl, bx + Math.cos(ba) * bl, bz - Math.sin(ba) * bl, 0.62],
    [gx - Math.sin(ga) * 0.55, gz - Math.cos(ga) * 0.55, gx + Math.sin(ga) * 0.45, gz + Math.cos(ga) * 0.45, 0.3],
  ];
  // 小屋两侧的木板围墙（从小屋连到东西两岸，伸进湖里）
  for (const run of SHED_FENCE.runs) {
    for (let i = 1; i < run.length; i++) segments.push([run[i - 1][0], run[i - 1][1], run[i][0], run[i][1], 0.14]);
  }
  return { circles, boxes, segments };
}

export function buildWorld(engine) {
  const root = new THREE.Group();
  root.name = 'world';
  const zones = {};
  for (const id of ZONE_IDS) {
    const g = new THREE.Group();
    g.name = `zone_${id}`;
    zones[id] = g;
    root.add(g);
  }
  const ext = zones.exterior;

  // ---------------- environment ----------------
  const sky = buildSky(engine.scene);
  ext.add(sky.group);
  const lake = buildLake();
  ext.add(lake.group);
  const island = buildIsland();
  ext.add(island.group);

  // ---------------- buildings (exterior pieces + interior stage sets) ----------------
  const buildings = buildBuildings();
  if (buildings.exterior) ext.add(buildings.exterior);
  for (const id of ['house_int', 'temple_int', 'memory']) {
    const set = buildings.sets?.[id];
    if (set) zones[id].add(set);
  }

  // ---------------- anchors ----------------
  const anchors = new Map();
  const addAnchor = (name, pos, rotY = 0) => {
    const o = new THREE.Object3D();
    o.name = `anchor_${name}`;
    o.position.set(pos[0], pos[1], pos[2]);
    o.rotation.y = rotY || 0;
    ext.add(o);
    anchors.set(name, o);
    return o;
  };
  for (const [key, v] of Object.entries(P)) {
    if (Array.isArray(v)) {
      v.forEach((p, i) => addAnchor(`${key}${i}`, p, 0));
    } else if (v && v.pos) {
      const a = addAnchor(key, v.pos, v.rotY);
      if (v.target) a.lookAt(v.target[0], v.target[1], v.target[2]);
      for (const extra of ['radius', 'size', 'fov', 'target', 'wallHeight']) if (v[extra] !== undefined) a.userData[extra] = v[extra];
    }
  }
  // extra exterior anchors provided by the environment
  if (island.named.lake_gap) {
    const g = island.named.lake_gap;
    addAnchor('lakeGap', [g.position.x, g.position.y, g.position.z], 0);
  }
  // building + interior set anchors
  if (buildings.anchors) for (const [k, o] of buildings.anchors) anchors.set(k, o);

  engine.scene.add(root);
  root.updateMatrixWorld(true);

  // ---------------- per frame ----------------
  const size = new THREE.Vector2();
  let lastW = 0, lastH = 0;
  function update(dt, t) {
    const camera = engine.camera;
    const renderer = engine.renderer;
    const extVisible = ext.visible;
    sky.fogState.enabled = extVisible;
    let fk = 0;
    if (camera) {
      const p = camera.position;
      fk = forestness(p.x, p.z);
      // the mirror pass is skipped deep inside the forest, where the lake cannot be seen
      const deep = p.z < 37.5 && p.z > -16.5 && fk > 0.98;
      lake.reflect = extVisible && !deep;
    }
    sky.update(dt, t, camera, fk);
    lake.update(dt, t, sky.fogState);
    island.update(dt, t, camera);
    buildings.update?.(dt, t);
    if (renderer) {
      renderer.getDrawingBufferSize(size);
      if (size.x !== lastW || size.y !== lastH) {
        lastW = size.x; lastH = size.y;
        lake.setSize(size.x * 0.5, size.y * 0.5);
      }
    }
  }

  const world = {
    root,
    zones,
    anchors,
    anchor(name) {
      const a = anchors.get(name);
      if (!a) throw new Error(`world.anchor: unknown anchor "${name}". Known: ${[...anchors.keys()].join(', ')}`);
      return a;
    },
    lake,
    setFog: sky.setFog,
    update,
    sky,
    island,
    buildings,
    groundHeight,
    makeSilhouette,
    colliders: buildColliders(island),
  };
  update(0, 0);
  return world;
}

export { makeSilhouette, groundHeight };
