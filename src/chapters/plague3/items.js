// 第三灾的物品（docs/plague3_design.md 第 3 节）。模型直接用道具工厂（props_p3_items 的物品、props_lake 的 black_cube），
// 物品栏图标、检视器和场景里的样子始终一致；中文名 / 英文名来自 props_p3_items 导出的 ITEM_SPECS。
// icon.rot 是物品栏里的摆放角度：长条工具（拍子、斧子、铲子、剪刀）横放略俯，花和花瓶是立着的，只微微侧转。
import { makeProp } from '../../art/props.js';
import { ITEM_SPECS } from '../../art/props_p3_items.js';

const TOOL = { rot: [0.3, -0.35, 0.18] };
const STAND = { rot: [0.12, -0.4, 0] };
export const ICONS = {
  p3_swatter: { rot: [0.2, -0.2, 0.55], scale: 0.95 },
  p3_gnats: { rot: [0.5, -0.3, 0], scale: 1.1 },
  p3_snail: { rot: [0.25, -0.35, 0], scale: 1.1 },
  p3_axe: { rot: [0.25, -0.3, 0.6], scale: 0.95 },
  p3_shovel: { rot: [0.2, -0.3, 0.7], scale: 0.9 },
  p3_scissors: { rot: [0.3, -0.25, 0.5], scale: 1.05 },
  p3_honey: { rot: [0.5, -0.3, 0], scale: 1.05 },
  p3_ear: { rot: [0.2, -0.45, 0], scale: 1.05 },
  p3_mussel: { rot: [0.55, -0.3, 0], scale: 1.05 },
  p3_berries: { rot: [0.45, -0.25, 0], scale: 1.05 },
  p3_sap: { rot: [0.3, -0.3, 0], scale: 1.05 },
  p3_bulb: { rot: [0.25, -0.3, 0], scale: 1.05 },
  p3_clay: { rot: [0.45, -0.3, 0], scale: 1.05 },
  p3_flower_yellow: STAND,
  p3_flower_orange: STAND,
  p3_rose: STAND,
  p3_vase_slim: STAND,
  p3_vase_urn: STAND,
  black_cube: { rot: [0.12, -0.12, 0], scale: 0.95 },
};

export const ITEM_DEFS = [
  ...Object.entries(ITEM_SPECS).map(([id, spec]) => ({ id, zh: spec.zh, en: spec.en, icon: ICONS[id] || TOOL })),
  { id: 'black_cube', zh: '黑方块', en: 'Black cube', icon: ICONS.black_cube },
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
