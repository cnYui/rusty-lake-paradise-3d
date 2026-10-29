// makeProp(id) dispatcher. Each props_*.js module exports FACTORIES = { id: (opts) => Object3D }.
import { FACTORIES as BEACH } from './props_beach.js';
import { FACTORIES as INNER } from './props_inner.js';
import { FACTORIES as LAKE } from './props_lake.js';
import { FACTORIES as FROGS } from './props_frogs.js';
import { FACTORIES as P2_LAKE } from './props_p2_lake.js';
import { FACTORIES as P2_HOUSE } from './props_p2_house.js';
import { FACTORIES as P2_TEMPLE } from './props_p2_temple.js';
import { FACTORIES as P5 } from './props_p5.js';
// 第三灾：物品、海滩 / 湖岸、森林、小屋、白桦林（接口见 docs/plague3_api.md）
import { FACTORIES as P3_ITEMS } from './props_p3_items.js';
import { FACTORIES as P3_BEACH } from './props_p3_beach.js';
import { FACTORIES as P3_FOREST } from './props_p3_forest.js';
import { FACTORIES as P3_HOUSE } from './props_p3_house.js';
import { FACTORIES as P3_GROVE } from './props_p3_grove.js';
import { PLACEHOLDERS as P3_PLACEHOLDERS } from './props_p3_placeholders.js';

const MODULES = { BEACH, INNER, LAKE, FROGS, P2_LAKE, P2_HOUSE, P2_TEMPLE, P5, P3_ITEMS, P3_BEACH, P3_FOREST, P3_HOUSE, P3_GROVE };
const FACTORIES = {};
for (const [name, m] of Object.entries(MODULES)) {
  for (const id of Object.keys(m)) {
    if (FACTORIES[id]) console.warn(`[props] 重复的道具 id "${id}"（${name} 覆盖了前面的模块）`);
    FACTORIES[id] = m[id];
  }
}
// 第三灾：还没建好的道具先用占位（正式工厂存在时不使用占位）
for (const [id, make] of Object.entries(P3_PLACEHOLDERS)) if (!FACTORIES[id]) FACTORIES[id] = make;

export function makeProp(id, opts = {}) {
  const make = FACTORIES[id];
  if (!make) throw new Error(`makeProp: unknown prop "${id}". Known: ${Object.keys(FACTORIES).join(', ')}`);
  const obj = make(opts);
  obj.userData.propId = id;
  return obj;
}

export const PROP_IDS = Object.keys(FACTORIES);
