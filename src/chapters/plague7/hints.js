// 提示任务表（纯数据，不 import 任何东西；node 测试会直接 import 本文件）。
// 第七灾：id / after（直接前置）/ done（只读旗标）/ text（去哪里 + 做什么，不报谜题答案）。数组顺序 = 同时可做时的优先级。
export const HINTS = [
  // ---- 开局就能做的事 ----
  { id: 'skate', after: [], done: (s) => s.flag('skate_done'),
    text: '点一下画面里的小岛走进去。天堂门前的湖结冰了，点 Caroline，帮她在冰上滑到裂纹那里，一共三次。' },
  { id: 'carrot', after: ['skate'], done: (s) => s.flag('carrot_taken'),
    text: '冰面裂开了，在滑冰的冰面上拿起冻在裂纹下的胡萝卜。' },
  { id: 'scarf', after: [], done: (s) => s.flag('scarf_taken'),
    text: '进树林，树枝上挂着一条黄色的围巾，取下来。' },
  { id: 'branches', after: [], done: (s) => s.flag('branches_taken'),
    text: '树林的雪地上有几根树枝，捡起来。' },
  { id: 'hammer', after: [], done: (s) => s.flag('hammer_taken'),
    text: '沿路一直走到湖边的神殿，进去拿起冻在圣水盆边上的锤子。' },
  { id: 'icepool', after: [], done: (s) => s.flag('icepool_done'),
    text: '白桦林的岩壁门洞前有一个冰池，走近它：点立着的冰块，再点旁边平躺的冰块把它压实，一共三层。' },
  { id: 'diamond_ice', after: ['icepool'], done: (s) => s.flag('diamond_ice_taken'),
    text: '拿起冰池里露出来的钻石。' },
  { id: 'horn', after: [], done: (s) => s.flag('horn_taken'),
    text: '木屋外的石堆上有个牛头骨，拔下它的牛角。' },
  { id: 'stake', after: [], done: (s) => s.flag('stake_taken'),
    text: '木屋外的柴堆里有一根尖的木头，拿走。' },
  { id: 'strawberry', after: [], done: (s) => s.flag('strawberry_taken'),
    text: '进木屋，玻璃罩里种着草莓，摘下来。' },

  // ---- 锤子能做的事 ----
  { id: 'vase', after: ['hammer'], done: (s) => s.flag('stones_taken'),
    text: '树林里有个陶罐。选中锤子用在陶罐上，再拿走里面的小石子。' },
  { id: 'squirrel', after: ['hammer'], done: (s) => s.flag('pistachio_taken'),
    text: '树林里有只松鼠，头顶的树枝挂满冰锥。选中锤子敲一敲那棵树，再看看松鼠。' },

  // ---- 冰淇淋和 Gerard ----
  { id: 'ice_cream_1', after: ['horn', 'strawberry'], done: (s) => s.flag('ice_cream_1_made'),
    text: '木屋的桌子上方挂着冰锥：用牛角敲冰锥让碎冰落进木桶，点木桶倒扣出雪球，再把草莓用在雪球上。' },
  { id: 'feed_1', after: ['ice_cream_1'], done: (s) => s.flag('gerard_ate_1'),
    text: '把草莓冰淇淋递给坐在凳子上的 Gerard。' },
  { id: 'ice_cream_2', after: ['feed_1', 'squirrel'], done: (s) => s.flag('ice_cream_2_made'),
    text: '再用牛角敲一次冰锥做一个雪球，这次用上开心果。' },
  { id: 'feed_2', after: ['ice_cream_2'], done: (s) => s.flag('hat_taken'),
    text: '把开心果冰淇淋递给 Gerard，他会把帽子给你。' },

  // ---- 雪人 ----
  { id: 'snowman', after: ['scarf', 'branches', 'vase', 'carrot', 'feed_2'], done: (s) => s.flag('snowman_alive'),
    text: '白桦林里的雪人还缺东西：把围巾、帽子、树枝、小石子、胡萝卜都给它装上。' },
  { id: 'diamond_snow', after: ['snowman'], done: (s) => s.flag('diamond_snow_taken'),
    text: '雪人说完话后，捡起它脚下的钻石。' },

  // ---- 冰中的年轻人 ----
  { id: 'free_youth', after: ['stake', 'hammer'], done: (s) => s.flag('youth_free'),
    text: '湖岸边的大冰块里冻着一个人：先把尖的木头用在冰块上，再用锤子敲。' },
  { id: 'warm_youth', after: ['free_youth', 'squirrel'], done: (s) => s.flag('diamond_youth_taken'),
    text: '他冻坏了。把松鼠毛递给他，他会给你一样东西。' },

  // ---- 雪景球机器和神殿 ----
  { id: 'machine', after: ['diamond_ice', 'diamond_snow', 'warm_youth'], done: (s) => s.flag('ball_taken'),
    text: '木屋里的金色雪景球机器有三个圆孔：把三颗钻石都放进去，再拿起顶上的水晶球。' },
  { id: 'place_ball', after: ['machine'], done: (s) => s.flag('cube_taken'),
    text: '带着水晶球去神殿，把它用在圣水盆上，看完之后捡起地上的黑方块。' },
  { id: 'place_cube', after: ['place_ball'], done: (s) => s.flag('holder_cube'),
    text: '走近吊架，选中黑方块用在吊架上。' },
  { id: 'see_reflection', after: ['place_cube'], done: (s) => s.flag('reflection_seen'),
    text: '点吊架下面的圣水盆，看看水面。' },
  { id: 'lower_cube', after: ['see_reflection'], done: (s) => s.flag('font_lit'),
    text: '再点吊架，让它把黑方块降进圣水盆里。' },
  { id: 'finish_painting', after: ['lower_cube'], done: (s) => s.flag('plague7_complete'),
    text: '点圣水盆壁龛里的那幅画走近，再连续点画，直到画面不再变化。' },
];
