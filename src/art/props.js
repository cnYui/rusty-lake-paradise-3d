// makeProp(id) dispatcher. Each props_*.js module exports FACTORIES = { id: (opts) => Object3D }.
import { FACTORIES as BEACH } from './props_beach.js';
import { FACTORIES as INNER } from './props_inner.js';
import { FACTORIES as LAKE } from './props_lake.js';
import { FACTORIES as FROGS } from './props_frogs.js';
import { FACTORIES as P2_LAKE } from './props_p2_lake.js';
import { FACTORIES as P2_HOUSE } from './props_p2_house.js';
import { FACTORIES as P2_TEMPLE } from './props_p2_temple.js';

const MODULES = { BEACH, INNER, LAKE, FROGS, P2_LAKE, P2_HOUSE, P2_TEMPLE };
const FACTORIES = {};
for (const [name, m] of Object.entries(MODULES)) {
  for (const id of Object.keys(m)) {
    if (FACTORIES[id]) console.warn(`[props] 重复的道具 id "${id}"（${name} 覆盖了前面的模块）`);
    FACTORIES[id] = m[id];
  }
}

export function makeProp(id, opts = {}) {
  const make = FACTORIES[id];
  if (!make) throw new Error(`makeProp: unknown prop "${id}". Known: ${Object.keys(FACTORIES).join(', ')}`);
  const obj = make(opts);
  obj.userData.propId = id;
  return obj;
}

export const PROP_IDS = Object.keys(FACTORIES);
