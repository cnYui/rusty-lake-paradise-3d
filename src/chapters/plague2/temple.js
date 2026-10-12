// 第二灾 · 神殿与湖岸（空壳，后续成员填充）。
//
// 要实现的内容（docs/plague2_design.md §3.8）：
//   - 门外木柴堆 wood_pile 放在 SPOTS.woodPile（湖岸，y 已按地形取好），addCircle 加碰撞；点它 → give('wood')，旗标 wood_taken。
//   - temple_int 区域（原点 [400,0,0]）：winged_holder（世界锚点 temple_int.holder）、font（temple_int.font）、
//     第二灾的画（plague_painting，SPOTS.temple.painting）、凳子 temple_stool（SPOTS.temple.stool，腰带放在 stool_top 上 → give('belt')）、
//     转盘锁柜子 dial_cabinet（SPOTS.temple.cabinet）。
//   - 特写 holder / cabinet / dial / painting（closeup，zone temple_int）；转盘规则用 puzzles.DIAL / dialNext / dialSolved
//     （旗标 dial_mid、dial_out 存当前步数，初始 DIAL.mid.start / DIAL.out.start）；解开 → 柜门消失 → give('frog_flute')。
//     旗标 holder_open、dial_mid、dial_out、dial_solved、cabinet_open、flute_taken、belt_taken。
//   - 结尾：选中“黑方块”点吊架 → 放进方窗、合拢 → 降进圣水盆 → 光束 → 画特写：cleanStream / banishFrogs / frameWoman →
//     最后调用 world.js 的 playEnding(ctx)（设 plague2_complete 并弹出“第二灾 · 完”结尾卡）。
//     旗标 cube_inserted、holder_closed、holder_lowered、frogs_banished、woman_framed、plague2_complete。
//
// 约定：同 beach.js 顶部。视图 lake_shore / temple_door（开放）、temple_int（固定全景，▼ 回门外）和进门热点 temple_entry
// 已由 world.js 定义。

export async function setup(ctx) { // eslint-disable-line no-unused-vars
}

export function sync(ctx) { // eslint-disable-line no-unused-vars
}

// 最后一步应断言 { expectFlag: 'plague2_complete' }
export const walkthrough = [];
