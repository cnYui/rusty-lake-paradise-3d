// 第二灾（蛙灾）的全部屏幕文字 + 成就定义。
// 剧情文字照抄原作中文本地化（docs/plague2_design.md 第 6 节），标点也保持原样（例如 Ida 那句末尾的半角句点）；
// 操作提示是本复刻自己的说法，与第一灾一致。
// 这个文件不能 import 任何东西：src/core/context.js 会静态 import 这里的 ACHIEVEMENTS（标题菜单的成就面板要列出全部章节的成就）。
export const T = {
  // 开场：总览远景上的两行标题（第二行从画面下方滑入）
  chapter: ['第二灾', '蛙灾'],

  // 人物台词 / 回忆（原作原文）
  ida: '哥哥 很高兴能再一次见到你.',
  memory: 'Jakob Jakob 我的第一个孩子...',
  chestLocked: '锁上了',

  // 结尾卡
  ending: { zh: '第二灾 · 完', en: 'Plague II — complete' },

  // 操作提示（每份存档只出现一次，触屏版换成触屏说法）
  hintRoam: 'WASD 走动 · 鼠标移向画面边缘转身',
  hintRoamTouch: '左边拖动摇杆走路 · 右边拖动画面转身 · 轻点互动',
  hintBack: '点击向下的箭头或按 S 返回',
  hintBackTouch: '点击向下的箭头返回',
  hintUseItem: '按数字键选中物品，再点场景使用；依次按两个数字键可合成',
  hintUseItemTouch: '点物品栏选中物品，再点场景使用；先后点两件物品可合成',
  hintHouse: '屋里也能用 WASD 走动 · 走回门口点门出去',
  hintHouseTouch: '屋里也能用摇杆走动 · 走回门口点门出去',
};

// 成就（docs/plague2_design.md 第 5 节）：id → { zh, en }。粉笔图标在 src/core/ui.js 的 CHALK_ICONS 里按同一个 id 定义。
export const ACHIEVEMENTS = {
  the_first_frog: { zh: '第一只青蛙', en: 'The First Frog' },                       // 从蛙卵盆拿到青蛙（粉笔青蛙）
  reflection_in_the_water: { zh: '水中倒影', en: 'Reflection in the Water' },       // 拿走青蛙后点盆里的水（粉笔鹿头）
  a_rusty_key: { zh: '一把生锈的钥匙', en: 'A Rusty Key' },                         // 从 Gerard 的碗里拿到钥匙（粉笔钥匙）
};
