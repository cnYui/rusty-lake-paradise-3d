// 第六灾物品。模型和物品栏图标共用 props_p6 工厂；刀和钥匙复用已有模型。
import { makeProp } from '../../art/props.js';

const ITEM_DEFS = [
  { id: 'empty_bottle', zh: '空瓶子', en: 'Empty bottle', model: 'p6_empty_bottle', icon: { rot: [0.15, 0, 0.2], scale: 1.1 } },
  { id: 'blood', zh: '血液', en: 'Blood', model: 'p6_blood', icon: { rot: [0.15, 0, 0.2], scale: 1.1 } },
  { id: 'tears', zh: '眼泪', en: 'Tears', model: 'p6_tears', icon: { rot: [0.15, 0, 0.2], scale: 1.1 } },
  { id: 'snot', zh: '鼻涕', en: 'Phlegm', model: 'p6_snot', icon: { rot: [0.15, 0, 0.2], scale: 1.1 } },
  { id: 'saliva', zh: '唾液', en: 'Saliva', model: 'p6_saliva', icon: { rot: [0.15, 0, 0.2], scale: 1.1 } },
  { id: 'medicine', zh: '药', en: 'Medicine', model: 'p6_medicine', icon: { rot: [0.15, 0, 0.2], scale: 1.1 } },
  { id: 'bottles', zh: '空瓶子', en: 'Empty bottles', model: 'p6_bottles', icon: { rot: [0.25, -0.2, 0], scale: 1.05 } },
  { id: 'knife', zh: '刀', en: 'Knife', model: 'p5_knife', icon: { rot: [0.15, 0, -0.1], scale: 1.1 } },
  { id: 'mushroom', zh: '蘑菇', en: 'Mushroom', model: 'p6_mushroom', icon: { rot: [0.3, 0, 0], scale: 1.1 } },
  { id: 'onion', zh: '洋葱', en: 'Onion', model: 'p6_onion', icon: { rot: [0.2, 0, 0], scale: 1.05 } },
  { id: 'pepper', zh: '胡椒', en: 'Pepper', model: 'p6_pepper', icon: { rot: [0.5, 0, 0], scale: 1.1 } },
  { id: 'needle_thread', zh: '针线', en: 'Needle and thread', model: 'p6_needle_thread', icon: { rot: [0.3, 0.3, 0], scale: 1.1 } },
  { id: 'key', zh: '钥匙', en: 'Key', model: 'key', icon: { rot: [0.2, 0.2, 0.4], scale: 1.0 } },
  { id: 'plague_staff', zh: '瘟疫法杖', en: 'Plague staff', model: 'p6_staff', icon: { rot: [0, 0, 0.75], scale: 1.0 } },
  { id: 'sick_heart', zh: '心脏', en: 'Heart', model: 'p6_sick_heart', icon: { rot: [0.2, 0.3, 0], scale: 1.05 } },
  { id: 'clock_heart', zh: '发条心', en: 'Clockwork heart', model: 'p6_clock_heart', icon: { rot: [0.2, 0.3, 0], scale: 1.05 } },
  { id: 'black_cube', zh: '黑方块', en: 'Black cube', model: 'black_cube', icon: { rot: [0.12, -0.12, 0], scale: 0.95 } },
];

export function defineItems(ctx) {
  for (const def of ITEM_DEFS) {
    ctx.items.define({ id: def.id, name: { zh: def.zh, en: def.en }, model: () => makeProp(def.model), icon: def.icon });
  }
}

export { ITEM_DEFS };
