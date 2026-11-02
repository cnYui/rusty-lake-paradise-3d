// 第九灾物品。模型和物品栏图标共用 props_p9 工厂。
import { makeProp } from '../../art/props.js';
import { POWDER_COLORS } from '../../art/props_p9.js';

const powder = (id, zh, en) => ({ id, zh, en, model: 'p9_powder', opts: { color: POWDER_COLORS[id] }, icon: { rot: [0.35, 0.4, 0], scale: 1.15 } });
const ITEM_DEFS = [
  { id: 'bark', zh: '树皮', en: 'Bark', model: 'p9_bark', icon: { rot: [0.3, 0.5, 0.2], scale: 1.05 } },
  { id: 'shell', zh: '贝壳', en: 'Shell', model: 'p9_shell', icon: { rot: [0.3, 0.6, 0], scale: 1.2 } },
  { id: 'blue_stone', zh: '青石', en: 'Blue stone', model: 'p9_blue_stone', icon: { rot: [0.3, 0.4, 0], scale: 1.3 } },
  { id: 'pickaxe', zh: '镐', en: 'Pickaxe', model: 'p9_pickaxe', icon: { rot: [0.1, 0.3, 0.6], scale: 0.95 } },
  { id: 'moon_stone', zh: '红月石', en: 'Moonstone', model: 'p9_moon_stone', icon: { rot: [0.3, 0.4, 0], scale: 1.3 } },
  { id: 'bones', zh: '母亲的骨头', en: "Mother's bones", model: 'p9_bones', icon: { rot: [0.25, -0.5, 0], scale: 1.05 } },
  powder('powder_brown', '棕色粉末', 'Brown powder'),
  powder('powder_white', '白色粉末', 'White powder'),
  powder('powder_blue', '蓝色粉末', 'Blue powder'),
  powder('powder_red', '红色粉末', 'Red powder'),
  powder('powder_bone', '骨粉', 'Bone powder'),
  { id: 'copper_key', zh: '铜钥匙', en: 'Copper key', model: 'p9_copper_key', icon: { rot: [0.3, 0, 0.5], scale: 1.0 } },
  { id: 'candle', zh: '蜡烛', en: 'Candle', model: 'p9_candle', icon: { rot: [0.3, 0.3, 0], scale: 1.1 } },
  { id: 'black_cube', zh: '黑方块', en: 'Black cube', model: 'black_cube', icon: { rot: [0.12, -0.12, 0], scale: 0.95 } },
];

export function defineItems(ctx) {
  for (const def of ITEM_DEFS) {
    ctx.items.define({ id: def.id, name: { zh: def.zh, en: def.en }, model: () => makeProp(def.model, def.opts || {}), icon: def.icon });
  }
}

export { ITEM_DEFS };
