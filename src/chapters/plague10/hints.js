// 提示任务表（纯数据，不 import 任何东西；node 测试会直接 import 本文件）。
// 第十灾：id / after（直接前置）/ done（只读旗标和物品）/ text（去哪里 + 做什么，不报谜题答案）。数组顺序 = 同时可做时的优先级。
// 物品用掉会从物品栏消失，所以“做完没有”尽量用旗标判断；骨箭只有合成出来到射出去之间看物品栏。
export const HINTS = [
  // ---- 开局就能做的三件事 ----
  { id: 'feather', after: [], done: (s) => s.flag('feather_taken'),
    text: '去树林路口，树桩上站着一只仓鸮：捡起它抖落在树桩边的羽毛。' },
  { id: 'table', after: [], done: (s) => s.flag('shaft_taken') && s.flag('brush_taken') && s.flag('apple_taken'),
    text: '进木屋，走近桌子，把桌上的箭杆、刷子和苹果都拿走。' },
  { id: 'drum', after: [], done: (s) => s.flag('bone_dropped'),
    text: '去塔下，先点敲鼓的 Nicholas 看他敲一遍，再照着他的顺序点鼓面的左半边和右半边。' },
  { id: 'bone', after: ['drum'], done: (s) => s.flag('bone_taken'),
    text: '鼓敲对以后，门洞上那串骨头最下面的尖骨头掉在了地上，捡起来。' },

  // ---- 骨箭和苹果 ----
  { id: 'arrow', after: ['feather', 'table', 'bone'], done: (s) => s.has('bone_arrow') || s.flag('apple_shot'),
    text: '在物品栏里把箭杆、羽毛和尖骨头合在一起，做成一支完整的箭。' },
  { id: 'apple', after: ['table'], done: (s) => s.flag('apple_on_head') || s.flag('apple_shot'),
    text: '塔下白桦树前站着 David：选中苹果，用在他身上。' },
  { id: 'shoot', after: ['arrow', 'apple'], done: (s) => s.flag('apple_shot'),
    text: '选中做好的箭，交给塔下拿着弓的 Gerard。' },
  { id: 'worm', after: ['shoot'], done: (s) => s.flag('worm_taken'),
    text: '苹果被钉在了白桦树上，拿走从洞里探出头的虫子。' },

  // ---- 空地：母鸡和 Ida ----
  { id: 'hen', after: ['worm'], done: (s) => s.flag('hen_fed'),
    text: '去空地上的母鸡那里，选中虫子，用在母鸡或它的食盆上。' },
  { id: 'egg', after: ['hen'], done: (s) => s.flag('egg_taken'),
    text: '捡起母鸡下的蛋。' },
  { id: 'brush', after: ['table'], done: (s) => s.flag('face') || s.flag('face_done'),
    text: '去空地，走近举着手掌的 Ida：选中刷子，用在她身上。' },
  { id: 'face', after: ['brush'], done: (s) => s.flag('face_done'),
    text: '点 Ida 脸上的竖条换颜色。木屋墙上那幅竖条纹的面具画就是要画成的样子；画好了她会给你一根蜡烛。' },

  // ---- 木屋：孵小鸡 ----
  { id: 'pan', after: ['egg'], done: (s) => s.flag('egg_in_pan'),
    text: '进木屋，走近奶奶身边的炉子：选中蛋，放进平底锅。' },
  { id: 'stove', after: ['face'], done: (s) => s.flag('stove_lit'),
    text: '木屋的炉子没有火：选中蜡烛，用在炉门上。' },
  { id: 'chick', after: ['pan', 'stove'], done: (s) => s.flag('chick_taken'),
    text: '平底锅里孵出了一只小鸡，拿起来。' },

  // ---- 树林路口：仓鸮和食丸 ----
  { id: 'owl', after: ['chick'], done: (s) => s.flag('owl_fed'),
    text: '去树林路口，选中小鸡，用在树桩上的仓鸮身上。' },
  { id: 'pellet', after: ['owl'], done: (s) => s.flag('owls_read'),
    text: '走近仓鸮吐在树桩上的食丸，点每组骨头让它转动，直到四组都摆成正着的字母。' },

  // ---- 井下 ----
  { id: 'letters', after: ['pellet'], done: (s) => s.flag('letter_door_open'),
    text: '去空地，点石井顺着梯子下去。点石门上的字母轮，拼出食丸里那个词。' },
  { id: 'masks', after: ['letters'], done: (s) => (s.flag('masks_taken') || []).length >= 5 || s.flag('all_masked'),
    text: '石门后面的石室里，五尊石头动物面前各放着一副面具，全部拿走。' },
  { id: 'hex', after: ['letters'], done: (s) => s.flag('hex_done'),
    text: '石门后面右手边的侧室里有一尊石鹰：点底座上的六边形石片转动，拼出木屋里那幅红猫头鹰画的样子。' },
  { id: 'cube', after: ['hex'], done: (s) => s.flag('cube_taken'),
    text: '拿起石鹰底座上留下的黑方块。' },

  // ---- 是时候了 ----
  { id: 'give_masks', after: ['masks', 'cube'], done: (s) => s.flag('all_masked'),
    text: '把面具交给 Gerard、David、Ida、奶奶和 Nicholas，每人一副，想想谁是哪种动物；给错了对方不会接。' },
  { id: 'temple', after: ['give_masks'], done: (s) => s.flag('holder_cube'),
    text: '湖边的木头猫头鹰张开了栅门：走进它肚子里的神殿，选中黑方块，用在吊架上。' },
  { id: 'see_reflection', after: ['temple'], done: (s) => s.flag('reflection_seen'),
    text: '点吊架下面的圣水盆，看看水面。' },
  { id: 'lower_cube', after: ['see_reflection'], done: (s) => s.flag('plague10_complete'),
    text: '再点吊架，让它把黑方块降进圣水盆里。' },
];
