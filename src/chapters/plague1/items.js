// Item definitions for Plague I. Models come from the prop factories, so the inventory icon,
// the inspector and the in-world object always look the same.
import { makeProp } from '../../art/props.js';

export const ITEM_DEFS = [
  { id: 'machete', zh: '弯刀', en: 'Machete', icon: { rot: [0.2, 0.3, 0.75] } },
  { id: 'hook', zh: '鱼钩', en: 'Hook' },
  { id: 'line', zh: '线', en: 'Line' },
  { id: 'stick', zh: '木棍', en: 'Stick', icon: { rot: [0.2, 0.3, 0.8] } },
  // 鱼竿的三个阶段：木棍 + 线 → + 鱼钩 → + 虫子（鱼饵）
  { id: 'rod_line', zh: '系着线的竹竿', en: 'Stick with line', icon: { rot: [0.06, -0.25, 0], scale: 1.3 } },
  { id: 'rod_hook', zh: '鱼竿', en: 'Fishing rod', icon: { rot: [0.06, -0.25, 0], scale: 1.3 } },
  { id: 'rod', zh: '挂好鱼饵的鱼竿', en: 'Baited fishing rod', icon: { rot: [0.06, -0.25, 0], scale: 1.3 } },
  { id: 'worm', zh: '虫子', en: 'Worm' },
  { id: 'shrimp', zh: '虾', en: 'Shrimp' },
  { id: 'leech', zh: '水蛭', en: 'Leech' },
  { id: 'jug', zh: '壶', en: 'Jug' },
  { id: 'jug_blood', zh: '装有血的壶', en: 'Jug of blood' },
  { id: 'key', zh: '钥匙', en: 'Key' },
  { id: 'black_cube', zh: '黑方块', en: 'Black cube' },
];

export function defineItems(ctx) {
  for (const def of ITEM_DEFS) {
    ctx.items.define({
      id: def.id,
      name: { zh: def.zh, en: def.en },
      model: () => makeProp(def.id),
      icon: def.icon,
    });
  }
}
