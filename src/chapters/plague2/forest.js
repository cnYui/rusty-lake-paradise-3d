// 第二灾 · 森林（空壳，后续成员填充）。
//
// 要实现的内容（docs/plague2_design.md）：
//   §3.6 Gerard（钥匙）：makeCharacter('gerard') 站在 SPOTS.gerard（白树空地 G，面向东南），addCircle 给他加碰撞；
//        特写 'gerard'（closeup）：第一次点 → swallowKey()，之后点 → 思考泡“冒尖的一碗汤”；
//        选中“青蛙汤”点他 → drinkSoup()，replace('frog_soup', 'bowl')；选中“碗”点他 → holdBowl + vomit，take('bowl')；
//        点他手里的碗 → 俯视特写 'gerard_bowl' → 点钥匙 → give('key')、ctx.achieve('a_rusty_key')。
//        旗标 gerard_swallowed、gerard_drank、gerard_bowl、key_taken。
//   §3.4 Ida 与蛙笛（橙色青蛙）：makeCharacter('ida') 站在 SPOTS.ida（水泵空地 P）；特写 'ida'：
//        第一次点 → ctx.say(T.ida)，之后点 → 思考泡（蛙笛）；选中“蛙笛”点她 → 吹奏；热点 ida_flute（点笛子 = 吹完一个乐句，
//        青蛙按 puzzles.IDA_COLORS 换色，冷却 IDA_PHRASE_COOLDOWN_MS）；第 IDA_FINAL_PHRASE 次后点青蛙 ida_frog → give('frog_orange')。
//        旗标 ida_talked、ida_playing、ida_phrase、ida_frog_taken。
//   §3.3 蛙卵盆（第 1 只青蛙 + 隐藏成就）：makeProp('spawn_basin') 放在 SPOTS.basin；俯视特写 'spawn_basin'；
//        12 个热点 spawn_1..12，规则用 puzzles.SPAWN（目前是占位规则，TODO 待补）；清空 → showFrog → 点青蛙 give('frog')、
//        achieve('the_first_frog')；之后点水 → showVision、achieve('reflection_in_the_water')。
//        旗标 spawn_cleared、spawn_frog_taken、reflection_seen。
//
// 约定：同 beach.js 顶部。视图 forest_clearing / pump_clearing / house_clearing / shed_clearing（开放）已由 world.js 定义；
// 小屋门框（W.shedDoor）也已摆好，不需要门禁。

export async function setup(ctx) { // eslint-disable-line no-unused-vars
}

export function sync(ctx) { // eslint-disable-line no-unused-vars
}

export const walkthrough = [];
