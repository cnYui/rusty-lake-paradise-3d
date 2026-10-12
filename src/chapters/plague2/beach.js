// 第二灾 · 海滩（空壳，后续成员填充）。
//
// 要实现的内容（docs/plague2_design.md）：
//   §3.1 David（第 4 只青蛙）：makeCharacter('david_p2') 站在 W.davidTop（石头顶面，SPOTS.david.rotY 朝向）上；
//        热点 'david'（海滩开放视图上，点他 → goto 特写 'david'）、特写里点他播 eatFrog()（可无限重复）；
//        选中“腰带”点他（特写或漫游都行）→ take('belt')、setBelt(true)，石头上留下一只青蛙（makeProp('frog') 放在 W.davidTop 上）；
//        点那只青蛙 → give('frog')。旗标 david_belt、david_frog_taken。特写视图 'david'（closeup，zone exterior）在这里定义。
//   §3.2 睡莲叶跳青蛙（第 3 只青蛙）：makeProp('lily_board') 放在 SPOTS.lilyBoard.pos（原点 = (0,0) 格中心）；
//        俯视特写 'lily_pads'（closeup，look: 0，pos 与 target 之间留一点水平偏移，见 plague1/forest.js 的盘子特写）；
//        海滩开放视图上的热点（点浅水里的青蛙 → goto 'lily_pads'）；每格一个热点 lily_<列>_<行>（when：该格是当前可跳目标）；
//        规则全部用 ./puzzles.js：LILY_LEVELS / lilyTargets / lilyJump / lilyIsStuck；
//        旗标 lily_level（1..5 当前关）、lily_done；关内进度不存档（重进特写从本关起点重来）。第 5 关后 give('frog')。
//
// 约定（见 world.js 顶部和 docs/ai/context 的 chapter-scaffold 记录）：
//   - import { W, SPOTS, placeProp, addCircle, hint } from './world.js'；布景（湖、门、雾、石头）已由 world.js 摆好。
//   - 视图 beach_mid / beach_left / beach_right（开放）已由 world.js 定义，热点挂在这些视图上即可在漫游时点到。
//   - 状态只用 flags + inventory；sync() 用 { instant: true } 把模型恢复到旗标对应的样子（必须幂等）。
//   - walkthrough 只走公开路径（go / click / use / combine），world.js 的导航冒烟测试结束在 beach_mid。

export async function setup(ctx) { // eslint-disable-line no-unused-vars
}

export function sync(ctx) { // eslint-disable-line no-unused-vars
}

export const walkthrough = [];
