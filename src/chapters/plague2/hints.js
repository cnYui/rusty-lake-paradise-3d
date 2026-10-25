// 提示任务表（纯数据，不 import 任何东西；node 测试会直接 import 本文件）。
// 第二灾（蛙灾）：四只青蛙（蛙卵盆、睡莲叶、David、Ida）→ 青蛙汤 → Gerard 的钥匙 → 箱子里的黑方块 → 神殿结尾。
// 顺序 = 同时可做时的优先级（从出生的海滩往北：海滩 → 树林 → 石屋 → 神殿）；after 只写直接前置。
// 做完的判断一律看旗标（物品用掉后会从物品栏消失）。
export const HINTS = [
  // ---- 起点：互不依赖、开局就能做
  { id: 'lily_frog', after: [], done: (s) => s.flag('lily_done'),
    text: '走到海滩右边的浅水里，点睡莲叶进入特写，让青蛙一片片跳过去。一共有好几关，全部通过才能拿到青蛙；跳错了这一关会重来。' },
  { id: 'spawn_frog', after: [], done: (s) => s.flag('spawn_frog_taken'),
    text: '去树林东边 Ida 站着的空地，点她旁边的浅木盆看盆里的蛙卵，把它们两两配成对点掉。配错会全部重来；配完后浮起来的青蛙点一下拿走。' },
  { id: 'kitchen_table', after: [], done: (s) => s.flag('kitchen_bowl_taken') && s.flag('kitchen_candle_taken'),
    text: '进树林北边的石屋，厨房的小桌上摆着碗和蜡烛，把它们都拿走。' },
  { id: 'get_wood', after: [], done: (s) => s.flag('wood_taken'),
    text: '去岛北边湖岸的神殿，门外左前方的地上有一堆木柴，拿一块木头。' },
  { id: 'get_belt', after: [], done: (s) => s.flag('belt_taken'),
    text: '进神殿，左边凳子上放着一条腰带，拿走它。' },
  { id: 'solve_dial', after: [], done: (s) => s.flag('dial_solved'),
    text: '神殿右边有个带转盘锁的柜子，点柜子再点柜门，进入转盘特写。点转盘上能转动的圈，把它们转到图案全部对上。' },

  // ---- 靠神殿里拿到的东西才能继续
  { id: 'get_flute', after: ['solve_dial'], done: (s) => s.flag('flute_taken'),
    text: '转盘解开后会回到柜子特写，点柜门打开它，拿走里面的蛙笛。' },
  { id: 'david_frog', after: ['get_belt'], done: (s) => s.flag('david_frog_taken'),
    text: '拿着腰带去海滩左边，选中腰带用在石头上的 David 身上，再拿走他脚边出现的青蛙。' },
  { id: 'ida_flute', after: ['get_flute'], done: (s) => s.flag('ida_playing') || (s.flag('ida_phrase') || 0) >= 1 || s.flag('ida_frog_taken'),
    text: '拿着蛙笛去树林东边的空地，选中蛙笛用在 Ida 身上。' },
  { id: 'ida_frog', after: ['ida_flute'], done: (s) => s.flag('ida_frog_taken'),
    text: 'Ida 吹笛时，点她手里的笛子，头上的青蛙会变色。多点几次，等她睁开眼睛停下来，再点青蛙把它拿走。' },

  // ---- 厨房：青蛙汤
  { id: 'put_frogs', after: ['lily_frog', 'spawn_frog', 'david_frog', 'ida_frog'], done: (s) => (s.flag('pot_frogs') || 0) >= 4,
    text: '青蛙齐了，去石屋的厨房，点锅进入特写，把青蛙一只只用在锅上。要放几只，点一下 Margaret 看她头上的图。' },
  { id: 'light_fire', after: ['get_wood', 'kitchen_table'], done: (s) => s.flag('pot_lit'),
    text: '在锅的特写里，先把木头用在锅下的火圈上，再选蜡烛点一下火圈，把火点着。' },
  { id: 'get_soup', after: ['put_frogs', 'light_fire'], done: (s) => s.flag('soup_taken'),
    text: '青蛙放进锅、火也点着后，选中碗再点锅，就能盛出一碗青蛙汤。' },

  // ---- Gerard：钥匙
  { id: 'gerard_soup', after: ['get_soup'], done: (s) => s.flag('gerard_drank'),
    text: '带着青蛙汤去树林里有白树的空地，点 Gerard 进特写，把汤用在他身上，让他喝下去。' },
  { id: 'gerard_bowl', after: ['gerard_soup'], done: (s) => s.flag('gerard_bowl'),
    text: '汤喝完后，空碗会回到物品栏。选中碗用在 Gerard 身上，等他弄完。' },
  { id: 'get_key', after: ['gerard_bowl'], done: (s) => s.flag('key_taken'),
    text: '点 Gerard 手里的碗进入特写，再点碗里的钥匙拿走。' },

  // ---- 箱子与神殿结尾
  { id: 'open_chest', after: ['get_key'], done: (s) => s.flag('chest_open'),
    text: '拿着钥匙回石屋的厨房，选中钥匙用在左边的小木箱上。' },
  { id: 'get_cube', after: ['open_chest'], done: (s) => s.flag('cube_taken'),
    text: '点箱子上方飘着的黑方块，看完之后再点一次，才能把它拿走。' },
  { id: 'insert_cube', after: ['get_cube'], done: (s) => s.flag('cube_inserted') || s.flag('plague2_complete'),
    text: '拿着黑方块回神殿，选中它，点神殿里挂着的、带翅膀的金色吊架。' },
  { id: 'finish', after: ['insert_cube'], done: (s) => s.flag('plague2_complete'),
    text: '黑方块已经放进吊架了，回神殿点一下吊架，或者点圣水盆前的那幅画，让结尾继续走完。' },
];
