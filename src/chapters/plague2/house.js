// 第二灾 · 石屋厨房（空壳，后续成员填充）。
//
// 要实现的内容（docs/plague2_design.md）：
//   §3.5 厨房：青蛙汤。house_int 区域（原点 [300,0,0]，后墙 z = -1.6，灰泥墙，不挂画）。建议位置见 SPOTS.kitchen：
//        小木箱 chest、三脚小桌 side_table（蜡烛、碗放在挂点 table_top 上，点了直接拿）、锅 cauldron + Margaret（margaret_cook）。
//        家具碰撞用 addKitchenObstacles({ circles, boxes })（world.js 已用墙内侧边界定义了 house_int 的漫游区域）。
//        点 Margaret → 思考泡“4× 青蛙”（ui.thought(anchor, null, { draw })）；点锅 → 特写 'cauldron'（closeup，zone house_int）。
//        锅接受青蛙（frog / frog_orange 各一只，dropFrog）、木头（setWood）、蜡烛（setLit，蜡烛不消耗）；
//        puzzles.POT_FROGS_NEEDED 只青蛙 + 火齐了以后用碗 → replace('bowl', 'frog_soup')。
//        旗标 kitchen_bowl_taken、kitchen_candle_taken、margaret_asked、pot_frogs、pot_wood、pot_lit、soup_taken。
//   §3.7 箱子与回忆：没钥匙点箱子 → ctx.say(T.chestLocked)；选中“钥匙”点箱子 → chest.open()，黑方块飘起；
//        点方块 → 回忆（memory_frame 描框 + Caroline 抱婴儿淡入 + ctx.say(T.memory)）；再点 → give('black_cube')。
//        旗标 chest_open、memory_seen、cube_taken。
//
// 约定：同 beach.js 顶部。视图 house_int（roam）和进出门热点 house_entry / house_exit 已由 world.js 定义。

export async function setup(ctx) { // eslint-disable-line no-unused-vars
}

export function sync(ctx) { // eslint-disable-line no-unused-vars
}

export const walkthrough = [];
