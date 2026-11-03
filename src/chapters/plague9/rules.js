// 第九灾的谜题只依赖可序列化的数据：存档、点击和自动通关共用同一套规则（设计见 docs/plague9_10_design.md）。
// 本文件不 import three，node 测试直接 import。

// ---- 啄木鸟：树干上 5 个疤（从下往上 0–4），第 BARK_SPOT 个是发白翘起的松树皮 ----
export const KNOTS = 5;
export const BARK_SPOT = 3;
export const peckDropsBark = (knot) => knot === BARK_SPOT;

// ---- 研磨机：一次磨一样 ----
export const GRIND = { bark: 'powder_brown', shell: 'powder_white', blue_stone: 'powder_blue', moon_stone: 'powder_red', bones: 'powder_bone' };
export const grindable = (item) => Object.hasOwn(GRIND, item);

// ---- 篝火：撒一种粉末，烟里浮出一个星座的黑影（星座编号 0 白羊 … 11 双鱼）；骨粉浮出母亲的影子 ----
export const SIGNS = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
export const SHADOWS = { powder_brown: 'aries', powder_white: 'libra', powder_blue: 'gemini', powder_red: 'scorpio', powder_bone: 'mother' };
export const signOf = (powder) => SIGNS.indexOf(SHADOWS[powder]);   // 母亲不是星座：-1

// ---- 星座盘：三根针（针尖棕 / 白 / 蓝），点一根针它顺时针走一格；三根针停在火里那三种影子的星座上就开抽屉 ----
export const HANDS = ['powder_brown', 'powder_white', 'powder_blue'];
export const DIAL_START = [9, 3, 11];
export const DIAL_ANSWER = HANDS.map(signOf);            // [0 白羊, 6 天秤, 2 双子]
export function turnHand(hands, i) {
  if (!Array.isArray(hands) || hands.length !== HANDS.length || !(i in hands)) return null;
  const next = [...hands]; next[i] = (next[i] + 1) % 12; return next;
}
export const dialSolved = (hands) => Array.isArray(hands) && hands.length === HANDS.length && hands.every((v, i) => v === DIAL_ANSWER[i]);
/** 从 from 拨到答案每根针要点几下（自动通关用）。 */
export const dialClicks = (from = DIAL_START) => from.map((v, i) => (DIAL_ANSWER[i] - v + 12) % 12);

// ---- 月相仪：地球臂 8 个位置、月亮绕地球 8 个方向（绝对方向）；月亮正好在地球背着太阳的那一侧就是月食 ----
export const ORRERY_START = { earth: 2, moon: 6 };
export function stepOrrery(o, which) {
  if (!o || !['earth', 'moon'].includes(which)) return null;
  return { ...o, [which]: (o[which] + 1) % 8 };
}
export const isEclipse = (o) => !!o && o.moon === o.earth;
/** 从 o 起只转月亮要点几下才月食（自动通关用；只转地球同样可以）。 */
export const eclipseClicks = (o = ORRERY_START) => (o.earth - o.moon + 8) % 8;

// ---- 影子：蜡烛放在地上第 i 个星座符号上；粉笔轮廓画在“天蝎”那个位置的影子上 ----
export const CANDLE_START = 0;
export const CANDLE_ANSWER = signOf('powder_red');       // 7 天蝎
export const candleSolved = (at) => at === CANDLE_ANSWER;
