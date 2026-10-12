// World layout — the single source of truth for WHERE things are.
// 1 unit = 1 metre, +y up, -z = north, +x = east. Lake surface y = 0, island ground ≈ y 0.5.
// The player arrives from the south; the beach + PARADISE gate face south (+z).
// Every art module and chapter imports positions from here; do not hard-code duplicates.
//
//                       N (-z)
//          blood pool ●      ◯ temple (30,-36)
//              lakeshore L (24,-29)
//               soul path K (21,-21)
//   ══ plank wall (SHED_FENCE) from shore to shore, the shed door is the only way through ══
//   house clearing H: owl (-2,-8) · stone house (3,-14) · big trees · shed door (17,-12.5)
//          pump forest P: white tree (12,1) · pump (19,2) · thorns (25,3)
//   tower ▲ (-30,18)   grandmother clearing G: Margaret (-6,17) · goat (-3,17.5) · white trees
//                         forest path F (0,32)
//   David's rock · bamboo · fruit ═══ PARADISE gate (0,40) ═══ shore tree · rowboat
//                         beach + dock steps (0,46)
//                       S (+z)  → open lake, far shore with mountains

export const LAKE_Y = 0;
export const GROUND_Y = 0.5;

// Island outline (x, z), clockwise starting south-west. Used by the terrain builder, the lake
// blood mask and anything that needs "is this on land?".
export const ISLAND_OUTLINE = [
  [-19, 46.5], [-25, 42.5], [-32, 35], [-37.5, 22], [-38, 8], [-33, -7], [-25, -21], [-13, -30.5],
  [1, -34.5], [14, -37.5], [23, -38.5], [32, -40.5], [37.5, -35], [40, -22], [39, -6], [37, 10],
  [33, 26], [27, 38], [21, 46.5], [10, 48.2], [0, 48.6], [-9, 48.2],
];

// Palisade (pointed log fence) along the south of the forest, with the gate gap in the middle.
// 两端一直伸进湖里（西岸 x ≈ -27.3、东岸 x ≈ 25.6，漫游还能再往浅水里走 1.25 m），
// 整个岛只能从天堂门进去，不能沿着岸边从栅栏两头绕过去。
export const PALISADE = { z: 40, xMin: -30.5, xMax: 28.6, height: 4.2, logRadius: 0.17, gateGap: 4.4 };

// 小屋两侧的木板围墙（x/z 折线）：从小屋一直连到东西两岸并伸进湖里，小屋门是去灵魂小径和湖区的唯一通道。
// 折线顶点多数落在大树干中心（木板钉在树干上）；西边那段被石屋隔开，石屋本身就是墙的一部分。
export const SHED_FENCE = {
  height: 2.9,
  runs: [
    [[15, -13], [14.5, -13], [10.5, -13.5], [6, -13.3]],                                                   // 小屋西墙 → 石屋东墙
    [[0, -13.3], [-6.8, -11.8], [-11.5, -12.75], [-14.3, -13.23], [-19.58, -13.47], [-25.27, -13.85], [-32.5, -14]], // 石屋西墙 → 西岸
    [[20, -15.6], [24.32, -15.45], [28.46, -15.79], [30.98, -14.87], [34.15, -14.01], [36.97, -13.98], [42.5, -14]], // 小屋东墙 → 东岸（荆棘丛留在墙外）
  ],
};
// 整条分界线按 x 从西到东：西段 → 石屋 → 小屋西边那段 → 小屋前墙 → 东段
const SHED_LINE = [...SHED_FENCE.runs[1].slice().reverse(), ...SHED_FENCE.runs[0].slice().reverse(), [20, -13], ...SHED_FENCE.runs[2]];

/** 小屋围墙一线在 x 处的 z；比它更北（z 更小）就是围墙另一侧的灵魂小径和湖区。 */
export function shedLineZ(x) {
  const L = SHED_LINE;
  if (x <= L[0][0]) return L[0][1];
  for (let i = 1; i < L.length; i++) {
    const [x0, z0] = L[i - 1], [x1, z1] = L[i];
    if (x <= x1) return x1 === x0 ? Math.min(z0, z1) : z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
  }
  return L[L.length - 1][1];
}

export const P = {
  // ---------------- Beach (south shore, outside the palisade) ----------------
  gate:        { pos: [0, GROUND_Y, 40], rotY: 0 },          // gate front faces +z (south)
  dockSteps:   { pos: [0, GROUND_Y, 47.4], rotY: 0 },        // wooden steps down into the water
  davidRock:   { pos: [-23.5, 0, 46.5] },                     // grey boulder in the blood water
  david:       { pos: [-23.5, 0.95, 46.5], rotY: 0.35 },      // standing on the rock, facing roughly SSE
  bambooClump: { pos: [-12.5, GROUND_Y, 41.4] },
  bambooCane:  { pos: [-10.9, GROUND_Y, 41.6] },              // the single leafless tall cane (cuttable)
  fruit:       { pos: [-6, GROUND_Y, 43.6], rotY: 0.3 },      // spiky rust-red fruit on the sand
  shoreTree:   { pos: [9, GROUND_Y, 38.6] },
  rowboat:     { pos: [16.5, 0.08, 47.2], rotY: -0.5 },       // beached, bow towards the lake

  // ---------------- Landmarks ----------------
  tower:       { pos: [-30, 2.2, 18] },                       // three-storey stone tower on rocks (closed in P1)

  // ---------------- Forest (inside the palisade) ----------------
  forestPath:  { pos: [0, GROUND_Y, 33] },                    // narrow gap between huge trunks
  clearingG:   { pos: [0, GROUND_Y, 17] },
  margaret:    { pos: [-6, GROUND_Y, 17], rotY: 0.35 },       // seated on a 3-legged stool, facing ~south
  // 山羊侧身朝东（+x），木桶就在它低头喝水时嘴的正下方（嘴在身前约 0.65 m）
  goat:        { pos: [-3, GROUND_Y, 17.6], rotY: Math.PI / 2 },
  bucket:      { pos: [-2.3, GROUND_Y, 17.6] },
  whiteTreesG: [[3.5, GROUND_Y, 14.5], [6, GROUND_Y, 15.5], [8.5, GROUND_Y, 14.2]],
  pathGtoP:    { pos: [12, GROUND_Y, 13] },                   // ▲ in the gap on the right of G

  clearingP:   { pos: [17, GROUND_Y, 3] },
  pumpTree:    { pos: [12, GROUND_Y, 1] },                    // big pale tree on the left of P
  pump:        { pos: [19, GROUND_Y, 2], rotY: 0 },           // cast-iron hand pump, spout to the west (-x)
  thorns:      { pos: [25, GROUND_Y, 3] },
  pathPtoH:    { pos: [10, GROUND_Y, -1] },                   // ▲ left of the big tree

  clearingH:   { pos: [4, GROUND_Y, -9] },
  owlTotem:    { pos: [-2, GROUND_Y, -8], rotY: 0.25 },
  house:       { pos: [3, GROUND_Y, -14], rotY: 0, size: [6, 3.2, 5] }, // door on its south face
  bigTreesH:   [[8.5, GROUND_Y, -11], [10.5, GROUND_Y, -13.5], [12.5, GROUND_Y, -10.5], [14.5, GROUND_Y, -13]],
  shedWall:    { pos: [17.5, GROUND_Y, -13], rotY: 0 },        // plank wall with the locked double door, facing south
  shedDoor:    { pos: [17.5, GROUND_Y, -12.85], rotY: 0 },

  soulPath:    { pos: [21, GROUND_Y, -21] },                  // between curtain-like trunks, lake visible beyond
  soul:        { pos: [21, GROUND_Y, -22.5], rotY: 0 },

  // ---------------- North-east lakeshore ----------------
  lakeshore:   { pos: [24, GROUND_Y, -29] },
  temple:      { pos: [30.5, GROUND_Y, -35.5], rotY: -0.6, radius: 3.4, wallHeight: 4.2 },
  bloodPool:   { pos: [19.5, LAKE_Y, -42.5], radius: 4.5 },   // separate pool of blood in the lake (left of the temple)
  coffin:      { pos: [19.5, LAKE_Y, -42.5], rotY: 0.2 },     // rises out of the blood pool

  // ---------------- Camera reference points ----------------
  overviewCam: { pos: [2, 7.5, 150], target: [0, 6, 22], fov: 32 }, // island overview from the south
};

// Interior "stage sets" live far from the island, each in its own zone (only one zone visible).
export const SETS = {
  house_int:  { origin: [300, 0, 0] },   // dining room box
  temple_int: { origin: [400, 0, 0] },   // round temple room with font + winged holder
  memory:     { origin: [500, 0, 0] },   // memory vision stage (masked family behind the coffin)
};

export const v3 = (THREE, arr) => new THREE.Vector3(arr[0], arr[1], arr[2]);

/** Point-in-polygon on the island outline (x, z). */
export function onIsland(x, z, outline = ISLAND_OUTLINE) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, zi] = outline[i], [xj, zj] = outline[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from (x, z) to the island outline (positive outside, negative inside). */
export function shoreDistance(x, z, outline = ISLAND_OUTLINE) {
  let best = Infinity;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [ax, az] = outline[j], [bx, bz] = outline[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const px = ax + dx * t, pz = az + dz * t;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }
  return onIsland(x, z, outline) ? -best : best;
}
