// 第二灾的物品（docs/plague2_design.md 第 4 节）。模型直接用道具工厂（props_frogs / props_inner 的 key /
// props_lake 的 black_cube），物品栏图标、检视器和场景里的样子始终一致。
// icon.rot 按原作物品栏图标的角度调过（96 px 下检查）：青蛙侧身头朝左、碗和蜡烛正面略俯、腰带和蛙笛横放、
// 钥匙竖放（圈在上）、黑方块正面。
import { makeProp } from '../../art/props.js';

export const ITEM_DEFS = [
  // 两种青蛙在物品栏里都叫“青蛙”；frog 可以同时持有好几只（同 id 占多格，take 每次拿走一只）
  { id: 'frog', zh: '青蛙', en: 'Frog', icon: { rot: [0.12, -0.18, 0], scale: 1.05 } },
  { id: 'frog_orange', zh: '青蛙', en: 'Frog', icon: { rot: [0.12, -0.18, 0], scale: 1.05 } },
  { id: 'bowl', zh: '碗', en: 'Bowl', icon: { rot: [0.32, 0, 0], scale: 1.1 } },
  { id: 'frog_soup', zh: '青蛙汤', en: 'Frog soup', icon: { rot: [0.32, 0, 0], scale: 1.1 } },
  { id: 'candle', zh: '蜡烛', en: 'Candle', icon: { rot: [0.22, 0, 0], scale: 1.05 } },
  { id: 'wood', zh: '木头', en: 'Wood', icon: { rot: [0.35, -0.12, 0.05] } },
  { id: 'belt', zh: '腰带', en: 'Belt', icon: { rot: [0.25, 0, 0], scale: 1.1 } },
  { id: 'frog_flute', zh: '蛙笛', en: 'Frog flute', icon: { rot: [0.15, -0.1, 0.12], scale: 1.1 } },
  { id: 'key', zh: '钥匙', en: 'Key', icon: { rot: [0, 0, Math.PI / 2], scale: 1.05 } },
  { id: 'black_cube', zh: '黑方块', en: 'Black cube', icon: { rot: [0.12, -0.12, 0], scale: 0.95 } },
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
