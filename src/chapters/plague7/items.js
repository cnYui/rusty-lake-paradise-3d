// 第七灾物品。模型和物品栏图标共用 props_p7 工厂。
import { makeProp } from '../../art/props.js';

const ITEM_DEFS = [
  { id: 'scarf', zh: '围巾', en: 'Scarf', model: 'p7_scarf', icon: { rot: [0.4, 0.2, 0], scale: 1.0 } },
  { id: 'branches', zh: '树枝', en: 'Branches', model: 'p7_branches', icon: { rot: [0.2, 0, 0.5], scale: 1.0 } },
  { id: 'hammer', zh: '锤子', en: 'Hammer', model: 'p7_hammer', icon: { rot: [0.1, 0.3, 0.6], scale: 1.0 } },
  { id: 'stones', zh: '小石子', en: 'Pebbles', model: 'p7_stones', icon: { rot: [0.6, 0, 0], scale: 1.1 } },
  { id: 'pistachio', zh: '开心果', en: 'Pistachios', model: 'p7_pistachio', icon: { rot: [0.5, 0, 0], scale: 1.1 } },
  { id: 'squirrel_fur', zh: '松鼠毛', en: 'Squirrel fur', model: 'p7_fur', icon: { rot: [0.4, 0, 0], scale: 1.05 } },
  { id: 'horn', zh: '牛角', en: 'Horn', model: 'p7_horn', icon: { rot: [0.2, 0.3, 0.4], scale: 1.0 } },
  { id: 'strawberry', zh: '草莓', en: 'Strawberries', model: 'p7_strawberry', icon: { rot: [0.3, 0, 0], scale: 1.1 } },
  { id: 'ice_cream_strawberry', zh: '草莓冰淇淋', en: 'Strawberry ice cream', model: 'p7_ice_cream_strawberry', icon: { rot: [0.1, 0, 0.3], scale: 1.05 } },
  { id: 'ice_cream_pistachio', zh: '开心果冰淇淋', en: 'Pistachio ice cream', model: 'p7_ice_cream_pistachio', icon: { rot: [0.1, 0, 0.3], scale: 1.05 } },
  { id: 'hat', zh: '帽子', en: 'Hat', model: 'p7_hat', icon: { rot: [0.35, 0, 0], scale: 1.0 } },
  { id: 'carrot', zh: '胡萝卜', en: 'Carrot', model: 'p7_carrot', icon: { rot: [0.2, 0, 0.6], scale: 1.05 } },
  { id: 'stake', zh: '尖的木头', en: 'Sharp stake', model: 'p7_stake', icon: { rot: [0, 0, 0.7], scale: 1.0 } },
  { id: 'diamond_ice', zh: '钻石', en: 'Diamond', model: 'p7_diamond', icon: { rot: [0.3, 0.3, 0], scale: 1.1 } },
  { id: 'diamond_snow', zh: '钻石', en: 'Diamond', model: 'p7_diamond', icon: { rot: [0.3, 0.3, 0], scale: 1.1 } },
  { id: 'diamond_youth', zh: '钻石', en: 'Diamond', model: 'p7_diamond', icon: { rot: [0.3, 0.3, 0], scale: 1.1 } },
  { id: 'crystal_ball', zh: '最强的水晶球', en: 'Mighty crystal ball', model: 'p7_crystal_ball', icon: { rot: [0.15, 0.2, 0], scale: 1.0 } },
  { id: 'black_cube', zh: '黑方块', en: 'Black cube', model: 'black_cube', icon: { rot: [0.12, -0.12, 0], scale: 0.95 } },
];

export function defineItems(ctx) {
  for (const def of ITEM_DEFS) {
    ctx.items.define({ id: def.id, name: { zh: def.zh, en: def.en }, model: () => makeProp(def.model), icon: def.icon });
  }
}

export { ITEM_DEFS };
