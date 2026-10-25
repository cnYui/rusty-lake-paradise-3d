// 提示任务表（纯数据，不 import 任何东西；node 测试会直接 import 本文件）。
// 第三灾 · 蚊灾和虱灾。每条：id / after（直接前置）/ done（只用 s.flag、s.has）/ text。
// 顺序 = 优先级：同时可做的任务，玩家更可能先去做的排前面。前置任务一定排在被依赖任务的前面。
// 做完与否一律看旗标（物品用掉后会从物品栏消失）；只有拿成就的可选内容（哈维 / 蝴蝶 / 第三个符号）不列。
export const HINTS = [
  // ---- 开局：各处的工具和零件，互相不依赖
  { id: 'get_swatter', after: [], done: (s) => s.flag('p3_swatter_taken'),
    text: '先点一下岛进入海滩：左边那块石头上斜靠着一只苍蝇拍，点石头看近景，把它拿走。' },
  { id: 'get_shovel', after: [], done: (s) => s.flag('p3_shovel_taken'),
    text: '沿海滩后面的小路穿过树林，走进北边的石屋；小桌旁靠着一把铲子，把它拿走。' },
  { id: 'get_gnats', after: ['get_swatter'], done: (s) => s.flag('p3_gnats_taken'),
    text: '到湖边去：坐在凳子上的 Margaret 脸上爬满了蚊子。把苍蝇拍给她，再把拍死的蚊子捡起来。' },
  { id: 'get_axe', after: [], done: (s) => s.flag('p3_axe_taken'),
    text: '湖边 Margaret 右手边有个木桩，点它看近景，把插在上面的斧子拿走。' },
  { id: 'get_snail', after: [], done: (s) => s.flag('p3_snail_taken'),
    text: '湖边 Margaret 右手边的木桩侧面趴着一只蜗牛，点木桩看近景，把蜗牛拿走。' },
  { id: 'get_scissors', after: [], done: (s) => s.flag('p3_scissors_taken'),
    text: '湖边再往前是神殿，进去后右边的凳子上放着一把剪刀，把它拿走。' },
  { id: 'get_honey', after: [], done: (s) => s.flag('p3_honey_taken'),
    text: '树林里往东的那块空地上，灰白大树的枝杈上挂着一个蜂巢。点蜂巢看近景，看清蜜蜂从哪个洞飞出来再点那个洞，直到蜂蜜流出来，再把蜂蜜取走。' },
  { id: 'get_clay', after: ['get_shovel'], done: (s) => (s.flag('p3_clay_taken') || 0) >= 2,
    text: '挂着蜂巢的那块空地上还有个土堆，用铲子把它挖开，把里面的黏土都拿走。' },

  // ---- 石屋：理发和陶轮
  { id: 'cut_hair', after: ['get_scissors'], done: (s) => (s.flag('p3_hair') || 0) >= 3,
    text: '回石屋，点正在理发的 Ida 凑近看，把剪刀递给她；然后点 Gerard 的头发，让她一刀一刀剪光。' },
  { id: 'get_ear', after: ['cut_hair'], done: (s) => s.flag('p3_ear_taken'),
    text: '头发剪光之后，再点一次 Gerard 的头发或耳朵，剪下他的耳朵，把它捡起来。' },
  { id: 'make_vases', after: ['get_clay'], done: (s) => s.flag('p3_vase_slim_made') && s.flag('p3_vase_urn_made'),
    text: '石屋里的陶轮：把黏土放上去，对照墙上的花瓶草图，点陶坯的上、中、下段改变形状，直到捏出草图上的花瓶。' },

  // ---- 海滩：贻贝、X 和滑块盒
  { id: 'pry_mussel', after: ['get_shovel'], done: (s) => s.flag('p3_mussel_taken'),
    text: '回海滩，右边那块石头上贴着一只贻贝，用铲子把它撬开，再把贝肉拿下来。' },
  { id: 'dig_x', after: ['get_shovel'], done: (s) => s.flag('p3_x_dug'),
    text: '海滩两块石头之间的沙地上画着一个 X，用铲子把它挖开。' },
  { id: 'solve_slider', after: ['dig_x'], done: (s) => s.flag('p3_slider_solved'),
    text: '点挖出来的盒子看俯视：点和空格相邻的方块，把圆片推到盒底的眼睛上。' },
  { id: 'box_bulb', after: ['solve_slider'], done: (s) => s.flag('p3_box_bulb_taken'),
    text: '滑块解开之后，点盒盖上的门闩把盒子打开，拿走里面的球茎。' },
  { id: 'jar_flower_1', after: ['box_bulb'], done: (s) => s.flag('p3_flower_orange_taken'),
    text: '石屋里小桌上有个钟罩：先把罩子掀开，把球茎种进花盆，盖上罩子等它开花，再掀开罩子把花摘下来。' },

  // ---- 林间空地：捕蝇草和红叉树
  { id: 'trap_flower', after: ['get_gnats', 'get_snail', 'pry_mussel', 'get_ear'], done: (s) => s.flag('p3_flower_taken'),
    text: '回到有捕蝇草的林间空地，点捕蝇草看近景，把蚊子、蜗牛、贻贝和耳朵都喂给它。它吃饱后会开花，把花摘下来。' },
  { id: 'fell_tree', after: ['get_axe'], done: (s) => s.flag('p3_xtree_felled'),
    text: '林间空地北边有一棵画着红叉的树，点它看近景，用斧子一下下把它砍倒；树后面会露出一个缺口。' },

  // ---- 白桦林：浆果、树汁、David 的桌子
  { id: 'get_berries', after: ['fell_tree'], done: (s) => s.flag('p3_berries_taken'),
    text: '穿过倒树后露出的缺口走进白桦林，采下浆果丛上的浆果。' },
  { id: 'birch_sap', after: ['fell_tree'], done: (s) => s.flag('p3_sap_taken'),
    text: '白桦林里有一棵能割汁的白桦：点它看近景，用斧子割一下让汁流出来，再把接满汁的罐子拿走。' },
  { id: 'feed_david', after: ['get_berries', 'birch_sap', 'get_honey'], done: (s) => s.flag('p3_david_covered'),
    text: '白桦林圆桌边坐着 David。点桌子看近景，把浆果、桦树汁和蜂蜜都放到他的桌上。' },
  { id: 'larva_bulb', after: ['feed_david'], done: (s) => s.flag('p3_larva_bulb_taken'),
    text: '桌前被蚊群盖住的黑团还有动静：点它让蚊子散开，再点它的嘴，把吐出来的球茎捡起来。' },
  { id: 'jar_flower_2', after: ['jar_flower_1', 'larva_bulb'], done: (s) => s.flag('p3_rose_taken'),
    text: '回石屋的钟罩，把另一个球茎也种下去：盖上罩子等它开花，再掀开罩子把这回开出的花摘下来。' },

  // ---- 神龛、回忆、黑方块
  { id: 'shrine_yellow', after: ['trap_flower', 'fell_tree'], done: (s) => s.flag('p3_shrine_flower_0'),
    text: '白桦林里的神龛有三根石柱：先把黄色的花插进原本就在那里的长颈瓶里。' },
  { id: 'shrine_vases', after: ['make_vases', 'fell_tree'], done: (s) => s.flag('p3_shrine_vase_1') && s.flag('p3_shrine_vase_2'),
    text: '把自己捏出来的两只花瓶摆到神龛另外两根石柱上。' },
  { id: 'shrine_flowers', after: ['shrine_vases', 'jar_flower_2'], done: (s) => s.flag('p3_shrine_flower_1') && s.flag('p3_shrine_flower_2'),
    text: '把钟罩里种出来的两朵花，分别插进神龛上这两只花瓶里。' },
  { id: 'see_memory', after: ['shrine_yellow', 'shrine_flowers'], done: (s) => s.flag('p3_memory_seen'),
    text: '三朵花插齐后，神龛上的画像会被蚊子围住；点画像凑近看，再点一下画像，看看会发生什么。' },
  { id: 'take_cube', after: ['see_memory'], done: (s) => s.flag('p3_cube_taken'),
    text: '回忆结束后，神龛的小方框里浮出了一块黑方块，把它拿走。' },
  { id: 'finale', after: ['take_cube'], done: (s) => s.flag('plague3_complete'),
    text: '把黑方块带回神殿：点吊架把它打开，再选中黑方块放进去，剩下的会自动演出。如果已经放进去了，点一下吊架或墙上的画就能继续。' },
];
