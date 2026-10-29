// 第三灾（蚊灾和虱灾）的全部屏幕文字 + 成就定义。
// 剧情文字照抄原作中文本地化（docs/plague3_design.md 第 7 节），标点保持原样（句末的半角句点）；
// 操作提示和“拿不下了”这类系统提示是本复刻自己的说法，与第一、二灾一致。
// 这个文件不能 import 任何东西：成就表会被标题菜单的成就面板静态引用。
export const T = {
  // 开场：总览远景上的两行标题
  chapter: ['第三灾', '蚊灾和虱灾'],

  // 人物台词（原作原文）
  ida: '我们不想看到虱子.',
  david: '我今天血糖非常低.',

  // 点不动时的一句话
  musselStuck: '贝壳粘得很牢',
  boxLocked: '盒子锁着',
  inventoryFull: '拿不下了',
  groveClosed: '树挡着路',
  portraitLocked: '画像上方有一团蚊子……',

  // 结尾卡
  ending: { zh: '第三灾 · 完', en: 'Plague III — complete' },

  // 操作提示（每份存档只出现一次，触屏版换成触屏说法）
  hintRoam: 'WASD 走动 · 鼠标移向画面边缘转身',
  hintRoamTouch: '左边拖动摇杆走路 · 右边拖动画面转身 · 轻点互动',
  hintBack: '点击向下的箭头或按 S 返回',
  hintBackTouch: '点击向下的箭头返回',
  hintUseItem: '按数字键选中物品，再点场景使用；依次按两个数字键可合成',
  hintUseItemTouch: '点物品栏选中物品，再点场景使用；先后点两件物品可合成',
  hintHouse: '屋里也能用 WASD 走动 · 走回门口点门出去',
  hintHouseTouch: '屋里也能用摇杆走动 · 走回门口点门出去',
  hintGrove: '白桦林里也能自由走动，转身从南面的缺口原路返回',
  hintGroveTouch: '白桦林里也能用摇杆走动，转身从南面的缺口原路返回',
  hintSlider: '点和空格相邻的方块，把三块圆片推到盒底的眼睛上',
  hintSliderTouch: '轻点和空格相邻的方块，把三块圆片推到盒底的眼睛上',
  hintHive: '看清蜜蜂从哪个洞飞出来，再点那个洞',
  hintHiveTouch: '看清蜜蜂从哪个洞飞出来，再轻点那个洞',
  hintWheel: '点陶坯的上、中、下段，改变它的形状',
  hintWheelTouch: '轻点陶坯的上、中、下段，改变它的形状',
};

// 成就（docs/plague3_design.md 第 6 节）：id → { zh, en }。粉笔图标在 src/core/ui.js 的 CHALK_ICONS 里按同一个 id 定义（没有就是默认星形）。
export const ACHIEVEMENTS = {
  spitting_larva: { zh: '吐东西的幼虫', en: 'Spitting Larva' },        // 幼虫吐出球茎
  earcut: { zh: '割耳', en: 'Earcut' },                                  // 拿到 Gerard 的耳朵
  the_butterfly: { zh: '蝴蝶', en: 'The Butterfly' },                    // 白桦上的茧孵出蝴蝶
  harvey: { zh: '哈维', en: 'Harvey' },                                  // 神殿窗台的鹦鹉
  the_third_symbol: { zh: '第三个符号', en: 'The Third Symbol' },        // 斧子把湖岸木桩砍裂，点里面的符号
};
