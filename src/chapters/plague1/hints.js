// 提示任务表（纯数据，不 import 任何东西；node 测试会直接 import 本文件）。
// 第一灾：每一条是一个“里程碑”。after = 直接前置任务（真实卡关关系），数组顺序 = 同时可做时的优先级。
// done 里只用 s.flag(key) / s.has(itemId)；物品用掉就会消失，所以“做完了没有”优先看旗标。
// 文字里不出现“血”字，和游戏里一样用“壶 / 红色的水池”之类的说法绕开。
// 有两条不卡关的剧情小互动（talk_father / soul）：玩家越过它之后 done 也算完成，免得提示一直催着回头做。
export const HINTS = [
  // ---- 沙滩：先看一眼天堂门，再备齐钓虾的东西
  { id: 'gate_hand', after: [], done: (s) => s.flag('hand_out'),
    text: '点击远处的天堂门走上沙滩，再点一下门本身，看看它有什么反应。' },
  { id: 'open_box', after: [], done: (s) => s.flag('box_open'),
    text: '沙滩右边停着一条小船，点它凑近，再点船上的木箱把它打开，拿走里面的东西。' },
  { id: 'cut_bamboo', after: ['open_box'], done: (s) => s.flag('bamboo_cut'),
    text: '沙滩左边有一根光秃秃的竹竿，选中弯刀去砍它，会得到一根木棍。' },
  { id: 'chop_fruit', after: ['open_box'], done: (s) => (s.flag('fruit_chops') || 0) >= 5,
    text: '沙滩左边的沙地上有个带刺的果子，选中弯刀多砍几下，直到里面有东西爬出来。' },
  { id: 'make_rod', after: ['cut_bamboo', 'chop_fruit'], done: (s) => s.flag('rod') === 'worm' || s.flag('shrimp_caught'),
    text: '在物品栏里把木棍、线、鱼钩和虫子依次合到一起，做成一根挂好鱼饵的鱼竿。' },
  { id: 'catch_shrimp', after: ['make_rod'], done: (s) => s.flag('shrimp_caught'),
    text: '走到沙滩水边，选中挂好鱼饵的鱼竿，点前面的湖面钓点东西。' },
  { id: 'open_gate', after: ['catch_shrimp', 'gate_hand'], done: (s) => s.flag('gate_unlocked'),
    text: '选中钓到的虾，点沙滩上的天堂门，把它交给门上伸出来的手。' },

  // ---- 林间空地、石屋、水泵：凑齐四条水蛭
  { id: 'margaret_leech', after: ['open_gate'], done: (s) => s.flag('margaret_leech_taken'),
    text: '进门后的第一块林间空地上坐着玛格丽特，反复点她，直到她递给你一样东西。' },
  { id: 'plate_leech', after: ['open_gate'], done: (s) => s.flag('prawn_leech_taken'),
    text: '进石屋，点餐桌上的盘子凑近看，再想办法弄开盘子里的虾，把里面的东西拿走。' },
  { id: 'get_jug', after: ['open_gate'], done: (s) => s.flag('jug_taken'),
    text: '石屋里靠墙有个上了插销的柜子，一次次点它把它打开，拿走里面的壶。' },
  { id: 'talk_father', after: ['open_gate'], done: (s) => s.flag('father_asked') || s.flag('father_fed'),
    text: '石屋里坐在桌边的是你父亲，点他走近，听听他想要什么。' },
  { id: 'feed_goat', after: ['get_jug'], done: (s) => s.flag('bucket_filled'),
    text: '选中壶去林间空地东边的水泵，把壶灌满，再回到山羊旁边，把壶里的东西倒进木桶。' },
  { id: 'goat_leech', after: ['feed_goat'], done: (s) => s.flag('goat_leech_taken'),
    text: '山羊喝完以后，点点它，把粘在它舌头上的东西拿下来。' },
  { id: 'feed_father', after: ['get_jug'], done: (s) => s.flag('father_fed'),
    text: '把壶灌满，拿进石屋倒进父亲的杯子里；壶倒空了可以再回水泵灌。' },
  { id: 'father_leech', after: ['feed_father'], done: (s) => s.flag('father_leech_taken'),
    text: '父亲喝完后，杯底还剩了点东西，点他的杯子把它拿走。' },
  { id: 'owl_key', after: ['margaret_leech', 'plate_leech', 'goat_leech', 'father_leech'], done: (s) => s.flag('key_taken'),
    text: '带着拿到的水蛭去石屋旁边的猫头鹰图腾，选中水蛭一条条喂给它，直到它给你一样东西。' },
  { id: 'open_shed', after: ['owl_key'], done: (s) => s.flag('shed_open'),
    text: '选中钥匙，点石屋东边那座木小屋的门，把门打开。' },

  // ---- 湖边：棺材、神殿、画
  { id: 'soul', after: ['open_shed'], done: (s) => s.flag('soul_gone') || s.flag('coffin_risen'),
    text: '穿过打开的小屋门往北走，点前面的那个黑影，听它把话说完。' },
  { id: 'open_coffin', after: ['open_shed'], done: (s) => s.flag('cube_taken'),
    text: '继续往北走到湖边那片红色的水池，点水里的棺材让它浮起来，再把盖子上的钉子都拔掉，取出里面的东西。' },
  { id: 'place_cube', after: ['open_coffin'], done: (s) => s.flag('holder_closed'),
    text: '带着黑方块去水池旁边的神殿，进殿后选中它，放进悬在圣水盆上方、带翅膀的吊架里。' },
  { id: 'font', after: ['place_cube'], done: (s) => s.flag('reflection_seen'),
    text: '吊架合上以后，点一下它下面的圣水盆，看看水里有什么。' },
  { id: 'lower_holder', after: ['font'], done: (s) => s.flag('holder_lowered'),
    text: '再点一下那个带翅膀的吊架，让它降下来。' },
  { id: 'painting', after: ['lower_holder'], done: (s) => s.flag('painting_lit'),
    text: '点神殿墙上那幅小画，看看它有什么变化。' },
  { id: 'finish', after: ['painting'], done: (s) => s.flag('plague1_complete'),
    text: '画亮起来以后，再点一次那幅画，完成第一灾。' },
];
