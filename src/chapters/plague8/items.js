// 第八灾物品。模型和物品栏图标共用 props_p8 工厂。
import { makeProp } from '../../art/props.js';

const ITEM_DEFS = [
  { id: 'axe', zh: '斧子', en: 'Axe', model: 'p8_axe', icon: { rot: [0.1, 0.3, 0.6], scale: 1.0 } },
  { id: 'shovel', zh: '铲子', en: 'Shovel', model: 'p8_shovel', icon: { rot: [0.1, 0.2, 0.7], scale: 0.9 } },
  { id: 'glow_moth', zh: '发光的蛾子', en: 'Glowing moth', model: 'p8_moth', icon: { rot: [0.5, 0, 0], scale: 1.1 } },
  { id: 'goat_eyes', zh: '羊眼睛', en: 'Goat eyes', model: 'p8_goat_eyes', icon: { rot: [0.25, 0, 0], scale: 1.1 } },
  { id: 'firefly', zh: '萤火虫', en: 'Firefly', model: 'p8_firefly', icon: { rot: [0.4, 0.3, 0], scale: 1.1 } },
  { id: 'key', zh: '钥匙', en: 'Key', model: 'p8_key', icon: { rot: [0.3, 0, 0.5], scale: 1.0 } },
  { id: 'fog_horn', zh: '雾之号角', en: 'Fog horn', model: 'p8_fog_horn', icon: { rot: [0.2, 0.4, 0.3], scale: 0.95 } },
  { id: 'black_cube', zh: '黑方块', en: 'Black cube', model: 'black_cube', icon: { rot: [0.12, -0.12, 0], scale: 0.95 } },
];

export function defineItems(ctx) {
  for (const def of ITEM_DEFS) {
    ctx.items.define({ id: def.id, name: { zh: def.zh, en: def.en }, model: () => makeProp(def.model), icon: def.icon });
  }
}

export { ITEM_DEFS };
