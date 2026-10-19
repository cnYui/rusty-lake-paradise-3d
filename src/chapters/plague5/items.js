// 第五灾物品。模型和物品栏图标共用 props_p5 工厂，黑方块复用湖区现有模型。
import { makeProp } from '../../art/props.js';
import { BURGER_ORDER } from './rules.js';

const ITEM_DEFS = [
  { id: 'knife', zh: '刀', en: 'Knife', icon: { rot: [0.15, 0, -0.1], scale: 1.1 } },
  { id: 'empty_bucket', zh: '空桶', en: 'Empty bucket', icon: { rot: [0.2, -0.2, 0], scale: 1.05 } },
  { id: 'milk_bucket', zh: '牛奶桶', en: 'Bucket of milk', icon: { rot: [0.2, -0.2, 0], scale: 1.05 } },
  { id: 'raw_meat', zh: '生肉', en: 'Raw meat', model: 'p5_raw_meat', icon: { rot: [0.2, -0.2, 0], scale: 1.1 } },
  { id: 'lettuce', zh: '生菜', en: 'Lettuce', icon: { rot: [0.18, -0.1, 0], scale: 1.05 } },
  { id: 'tomato', zh: '番茄', en: 'Tomato', icon: { rot: [0.16, -0.12, 0], scale: 1.05 } },
  { id: 'cucumber', zh: '黄瓜', en: 'Cucumber', icon: { rot: [0.16, -0.15, 0.18], scale: 1.0 } },
  { id: 'tomato_slice', zh: '番茄片', en: 'Tomato slices', icon: { rot: [0.5, 0, 0], scale: 1.05 } },
  { id: 'cucumber_slice', zh: '黄瓜片', en: 'Cucumber slices', icon: { rot: [0.5, 0, 0], scale: 1.05 } },
  { id: 'cheese', zh: '奶酪', en: 'Cheese', model: 'p5_cheese', icon: { rot: [0.2, -0.1, 0], scale: 1.05 } },
  { id: 'ground_meat', zh: '肉馅', en: 'Ground meat', model: 'p5_ground_meat', icon: { rot: [0.2, -0.1, 0], scale: 1.05 } },
  { id: 'cooked_meat', zh: '熟肉饼', en: 'Cooked patty', model: 'p5_cooked_meat', icon: { rot: [0.2, -0.1, 0], scale: 1.05 } },
  { id: 'bun_bottom', zh: '汉堡底', en: 'Burger bun', model: 'p5_bun_bottom', icon: { rot: [0.25, 0, 0], scale: 1.05 } },
  { id: 'bun_top', zh: '汉堡顶', en: 'Burger bun', model: 'p5_bun_top', icon: { rot: [0.25, 0, 0], scale: 1.05 } },
  { id: 'burger', zh: 'Rusty Lake 汉堡', en: 'Rusty Lake Burger', model: 'p5_burger', icon: { rot: [0.22, -0.18, 0], scale: 1.15 } },
  { id: 'black_cube', zh: '黑方块', en: 'Black cube', model: 'black_cube', icon: { rot: [0.12, -0.12, 0], scale: 0.95 } },
];

export function defineItems(ctx) {
  for (const def of ITEM_DEFS) {
    ctx.items.define({
      id: def.id,
      name: { zh: def.zh, en: def.en },
      model: () => makeProp(def.model || `p5_${def.id}`, def.id === 'burger' ? { layers: BURGER_ORDER } : {}),
      icon: def.icon,
    });
  }
}

export { ITEM_DEFS };
