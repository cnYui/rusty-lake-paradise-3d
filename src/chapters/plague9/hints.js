// 提示任务表（纯数据，不 import 任何东西；node 测试会直接 import 本文件）。
// 第九灾：id / after（直接前置）/ done（只读旗标）/ text（去哪里 + 做什么，不报谜题答案）。数组顺序 = 同时可做时的优先级。
// 红月石、天蝎这一串是影子谜题的线索：玩家硬试出蜡烛的位置（shadows_done）也算做完，免得提示卡在可以跳过的支线上。
export const HINTS = [
  // ---- 三样能磨的东西 ----
  { id: 'bark', after: [], done: (s) => s.flag('bark_taken'),
    text: '去白桦林，走近那棵趴着啄木鸟的白桦树。点树干上的疤，啄木鸟会飞过去啄：找那块发白翘起来的树皮。' },
  { id: 'shell', after: [], done: (s) => s.flag('shell_taken'),
    text: '去湖边，猫头鹰站着的木箱旁边，沙子里半埋着一只海螺，捡起来。' },
  { id: 'blue_stone', after: [], done: (s) => s.flag('blue_stone_taken'),
    text: '去湖边的神殿里，圣水盆旁边的地上有一块青色的小石头。' },

  // ---- 磨成粉，撒进篝火 ----
  { id: 'fire_brown', after: ['bark'], done: (s) => s.flag('shadow_aries') || s.flag('drawer_open'),
    text: '进木屋，把树皮放进研磨机上面的斗里，摇侧面的手柄，拿走托盘里的粉末；再去塔下把粉末撒进篝火。' },
  { id: 'fire_white', after: ['shell'], done: (s) => s.flag('shadow_libra') || s.flag('drawer_open'),
    text: '把海螺放进木屋的研磨机磨成粉，撒进塔下的篝火，看看烟里浮出什么。' },
  { id: 'fire_blue', after: ['blue_stone'], done: (s) => s.flag('shadow_gemini') || s.flag('drawer_open'),
    text: '把青石放进木屋的研磨机磨成粉，撒进塔下的篝火，看看烟里浮出什么。' },

  // ---- 塔里一层 ----
  { id: 'dial', after: ['fire_brown', 'fire_white', 'fire_blue'], done: (s) => s.flag('drawer_open'),
    text: '进塔，走近木柜上的星座盘。针尖的颜色就是粉末的颜色：把每根针拨到那种粉末在火里浮出的星座上。' },
  { id: 'copper_key', after: ['dial'], done: (s) => s.flag('copper_key_taken'),
    text: '拿起星座盘下面弹出的抽屉里的铜钥匙。' },
  { id: 'padlock', after: ['copper_key'], done: (s) => s.flag('padlock_open'),
    text: '塔里左墙上有一条链条：选中铜钥匙，用在链条上的挂锁上。' },
  { id: 'ladder', after: ['padlock'], done: (s) => s.flag('ladder_down'),
    text: '摇链条下面的绞盘，把天花板洞口里的梯子放下来。' },

  // ---- 月食和红月石（影子谜题的线索）----
  { id: 'eclipse', after: ['dial'], done: (s) => s.flag('blood_moon') || s.flag('shadows_done'),
    text: '塔里桌上有一台月相仪：点地球或月亮让它转一格，让地球正好挡在太阳（中间的灯）和月亮中间。' },
  { id: 'pickaxe', after: ['eclipse'], done: (s) => s.flag('pickaxe_taken') || s.flag('moon_stone_taken') || s.flag('shadows_done'),
    text: '月亮上掉下来的东西冻在塔门边的冰里。先进木屋，拿起墙边的镐。' },
  { id: 'moon_stone', after: ['eclipse', 'pickaxe'], done: (s) => s.flag('moon_stone_taken') || s.flag('shadows_done'),
    text: '出塔门，门边雪地里有一块发红光的冰：选中镐用在冰上，再捡起里面的红月石。' },
  { id: 'fire_red', after: ['moon_stone'], done: (s) => s.flag('shadow_scorpio') || s.flag('shadows_done'),
    text: '把红月石放进木屋的研磨机磨成粉，撒进塔下的篝火，记住烟里浮出的星座。' },

  // ---- 阁楼和塔顶 ----
  { id: 'shadows', after: ['ladder', 'fire_red'], done: (s) => s.flag('shadows_done'),
    text: '爬梯子上阁楼，走近后墙。点地上的星座符号挪动蜡烛，让五个挂件的影子落进墙上的粉笔轮廓。' },
  { id: 'candle', after: ['shadows'], done: (s) => s.flag('candle_taken'),
    text: '拿起地上的蜡烛。' },
  { id: 'beacon', after: ['candle'], done: (s) => s.flag('beacon_lit'),
    text: '阁楼右墙的木门开了，门外是塔顶平台：选中蜡烛，用在火盆上。' },

  // ---- 母亲 ----
  { id: 'bones', after: ['beacon'], done: (s) => s.flag('bones_taken'),
    text: '去湖边，猫头鹰飞走了，打开的木箱里有一包骨头，拿起来。' },
  { id: 'mother', after: ['bones'], done: (s) => s.flag('fire_out'),
    text: '把骨头放进木屋的研磨机磨成骨粉，撒进塔下的篝火。' },
  { id: 'cube', after: ['mother'], done: (s) => s.flag('cube_taken'),
    text: '篝火烧尽了，拿起灰里的黑方块。' },

  // ---- 神殿 ----
  { id: 'place_cube', after: ['cube'], done: (s) => s.flag('holder_cube'),
    text: '去湖边的神殿，走近吊架，选中黑方块用在吊架上。' },
  { id: 'see_reflection', after: ['place_cube'], done: (s) => s.flag('reflection_seen'),
    text: '点吊架下面的圣水盆，看看水面。' },
  { id: 'lower_cube', after: ['see_reflection'], done: (s) => s.flag('font_lit'),
    text: '再点吊架，让它把黑方块降进圣水盆里。' },
  { id: 'finish_painting', after: ['lower_cube'], done: (s) => s.flag('plague9_complete'),
    text: '点圣水盆壁龛里的那幅画走近，再连续点画，直到画面不再变化。' },
];
