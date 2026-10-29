// 提示任务表（纯数据，不 import 任何东西；node 测试会直接 import 本文件）。
// 第五灾：id / after（直接前置）/ done（只读旗标，用掉的物品不靠物品栏判断）/ text（去哪里 + 做什么，不报谜题答案）。
// 数组顺序 = 同时可做时的优先级，也保证前置一定排在前面。
export const HINTS = [
  // ---- 天堂门前、树林：开局就能做的事 ----
  { id: 'pick_lettuce', after: [], done: (s) => s.flag('lettuce_taken'),
    text: '点一下画面里的小岛走进去，在天堂门前拿起那盆生菜。' },
  { id: 'cure_cow', after: [], done: (s) => s.flag('cow_cured'),
    text: '天堂门前有头牛。点牛走近，再点它的身侧，把身上同色的斑点两两配对。' },
  { id: 'get_bucket', after: [], done: (s) => s.flag('bucket_taken'),
    text: '往岛里面走到树林里，捡起地上的空桶。' },
  { id: 'field_puzzle', after: [], done: (s) => s.flag('field_solved'),
    text: '树林里有块菜地木牌，点它进入菜地特写。把菜苗挪进田格，让每行每列占的格数对上木牌上的红道，每块地都要整理好。' },
  { id: 'thread_puzzle', after: [], done: (s) => s.flag('constellation_solved'),
    text: '树林里还有块写着“林间连线”的牌子，点它走近钉板。照铜钉上小圆点的数量连线，把铜钉全部连通，有好几张图要解。' },
  { id: 'get_knife', after: [], done: (s) => s.flag('knife_taken'),
    text: '沿路往岛的更深处走到木屋，点屋门进去，拿起厨房里的刀。' },

  // ---- 牛身上的收获 ----
  { id: 'cow_meat', after: ['cure_cow', 'get_knife'], done: (s) => s.flag('cow_meat_taken'),
    text: '牛身上的斑点退掉后，回到天堂门前走近牛，选中刀用在牛身上，取一块生肉。' },
  { id: 'cow_milk', after: ['cure_cow', 'get_bucket'], done: (s) => s.flag('milk_taken'),
    text: '走近天堂门前的牛，选中空桶用在牛身上，挤一桶牛奶。' },
  { id: 'make_cheese', after: ['cow_milk'], done: (s) => s.flag('cheese_taken'),
    text: '回树林里走近木桶，选中牛奶桶用在木桶上，再点木桶取走奶酪。' },

  // ---- 厨房：加工食材 ----
  { id: 'grind_meat', after: ['cow_meat'], done: (s) => s.flag('meat_ground'),
    text: '进木屋厨房，选中生肉用在砧板上，让奶奶把它剁成肉馅。' },
  { id: 'slice_veg', after: ['field_puzzle', 'get_knife'], done: (s) => s.flag('tomato_cut') && s.flag('cucumber_cut'),
    text: '进木屋厨房，把番茄和黄瓜分别用在砧板上，让奶奶切成片。' },
  { id: 'fry_patty', after: ['grind_meat'], done: (s) => s.flag('patty_taken'),
    text: '在厨房点煎锅走近，选中肉馅用在锅上，再点煎锅，取出熟肉饼。' },

  // ---- 餐室：汉堡和 Gerard ----
  { id: 'get_buns', after: [], done: (s) => s.flag('buns_taken'),
    text: '从厨房里写着“餐室”的牌子走进餐室，点餐桌上的盘子走近，拿走旁边木板上的面包。' },
  { id: 'build_burger', after: ['get_buns', 'pick_lettuce', 'fry_patty', 'make_cheese', 'slice_veg'], done: (s) => s.flag('burger_complete'),
    text: '食材备齐了。到餐室桌上的盘子前，把物品栏里的食材一层层放上盘子，顺序看墙上的菜单。' },
  { id: 'feed_gerard', after: ['build_burger'], done: (s) => s.flag('gerard_fed'),
    text: '拿起盘子上做好的汉堡，退回餐室，选中汉堡用在饿着的 Gerard 身上。' },

  // ---- 厕所里的圆盘 ----
  { id: 'read_disk', after: ['feed_gerard', 'thread_puzzle'], done: (s) => s.flag('memory_seen') || s.flag('cube_taken'),
    text: 'Gerard 去了木屋外面的厕所。到厕所里去，点墙上的圆盘。' },
  { id: 'take_cube', after: ['read_disk'], done: (s) => s.flag('cube_taken'),
    text: '圆盘里的画面中有一块黑方块，点它拿走。' },

  // ---- 湖边神殿 ----
  { id: 'place_cube', after: ['take_cube'], done: (s) => s.flag('holder_cube'),
    text: '带着黑方块去湖边的神殿，进门后走近祭坛上方的吊架，选中黑方块用在吊架上。' },
  { id: 'see_reflection', after: ['place_cube'], done: (s) => s.flag('reflection_seen'),
    text: '点吊架下面的圣水盆，看看水面。' },
  { id: 'lower_cube', after: ['see_reflection'], done: (s) => s.flag('font_lit'),
    text: '再点吊架，让它把黑方块降进圣水盆里。' },
  { id: 'finish_painting', after: ['lower_cube'], done: (s) => s.flag('plague5_complete') || s.flag('boils_framed'),
    text: '点圣水盆壁龛里的那幅画走近，再连续点画，直到画面不再变化。' },
];
