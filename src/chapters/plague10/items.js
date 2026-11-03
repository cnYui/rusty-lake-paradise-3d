// 第十灾物品。模型和物品栏图标共用 props_p10 工厂；面具用 characters.js 的 makeMaskModel（和人物戴的是同一套建模）。
import { makeProp } from '../../art/props.js';
import { makeMaskModel } from '../../art/characters.js';
import { ARROW_RECIPES } from './rules.js';
import { T } from './text.js';

const mask = (id, kind, zh, en) => ({ id, zh, en, make: () => makeMaskModel(kind), icon: { rot: [0.1, -0.5, 0], scale: 1.05 } });
const ITEM_DEFS = [
  { id: 'feather', zh: '羽毛', en: 'Feather', model: 'p10_feather', icon: { rot: [0.9, 0.3, 0.5], scale: 1.1 } },
  { id: 'arrow_shaft', zh: '箭杆', en: 'Arrow shaft', model: 'p10_arrow', icon: { rot: [0.3, 0.2, 0.7], scale: 1.0 } },
  { id: 'bone_tip', zh: '尖骨头', en: 'Sharp bone', model: 'p10_bone_tip', icon: { rot: [0.4, 0.3, 0.4], scale: 1.1 } },
  { id: 'arrow_fletched', zh: '带羽毛的箭杆', en: 'Fletched shaft', model: 'p10_arrow', opts: { feather: true }, icon: { rot: [0.3, 0.2, 0.7], scale: 1.0 } },
  { id: 'arrow_tipped', zh: '装了尖骨头的箭杆', en: 'Tipped shaft', model: 'p10_arrow', opts: { tip: true }, icon: { rot: [0.3, 0.2, 0.7], scale: 1.0 } },
  { id: 'bone_arrow', zh: '骨箭', en: 'Bone arrow', model: 'p10_arrow', opts: { feather: true, tip: true }, icon: { rot: [0.3, 0.2, 0.7], scale: 1.0 } },
  { id: 'apple', zh: '苹果', en: 'Apple', model: 'p10_apple', icon: { rot: [0.3, 0.4, 0], scale: 1.1 } },
  { id: 'brush', zh: '刷子', en: 'Brush', model: 'p10_brush', icon: { rot: [0.5, 0.3, 0.6], scale: 1.0 } },
  { id: 'worm', zh: '虫子', en: 'Worm', model: 'p10_worm', icon: { rot: [0.6, 0.3, 0], scale: 1.1 } },
  { id: 'egg', zh: '蛋', en: 'Egg', model: 'p10_egg', icon: { rot: [0.2, 0.3, 0.2], scale: 1.1 } },
  { id: 'candle', zh: '蜡烛', en: 'Candle', model: 'p9_candle', icon: { rot: [0.3, 0.3, 0], scale: 1.1 } },
  { id: 'chick', zh: '小鸡', en: 'Chick', model: 'p10_chick', icon: { rot: [0.2, -0.5, 0], scale: 1.1 } },
  mask('mask_boar', 'boar', '野猪面具', 'Boar mask'),
  mask('mask_rabbit', 'rabbit', '兔子面具', 'Rabbit mask'),
  mask('mask_pheasant', 'pheasant', '野鸡面具', 'Pheasant mask'),
  mask('mask_pigeon', 'pigeon', '鸽子面具', 'Pigeon mask'),
  mask('mask_deer', 'deer', '鹿面具', 'Deer mask'),
  { id: 'black_cube', zh: '黑方块', en: 'Black cube', model: 'black_cube', icon: { rot: [0.12, -0.12, 0], scale: 0.95 } },
];

export function defineItems(ctx) {
  for (const def of ITEM_DEFS) {
    ctx.items.define({ id: def.id, name: { zh: def.zh, en: def.en }, model: def.make || (() => makeProp(def.model, def.opts || {})), icon: def.icon });
  }
  // 骨箭：箭杆 + 羽毛 + 尖骨头，任意顺序（规则在 rules.js 的 ARROW_RECIPES）
  for (const [a, b, out] of ARROW_RECIPES) {
    ctx.items.recipe(a, b, async (c) => {
      c.take(b); c.replace(a, out);   // b 是装上去的零件（羽毛 / 尖骨头），a 是箭杆
      c.say(out === 'bone_arrow' ? T.arrowDone : c.items.name(out), { kind: 'item' });
    });
  }
}

export { ITEM_DEFS };
