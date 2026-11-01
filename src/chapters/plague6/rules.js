// 第六灾的谜题只依赖可序列化的数据：存档、点击和自动通关共用同一套规则（设计见 docs/plague6_7_design.md）。
// 本文件不 import three，node 测试直接 import。

// ---- 疹子：15 颗疹子排成 5 列 × 3 行，静脉只连上下左右相邻的两颗 ----
// 颜色 0 橙、1 绿、2 灰；第一颗必须是橙色，之后沿静脉走、颜色按 橙 → 绿 → 灰 → 橙 … 轮换。
export const BOIL_COLS = 5, BOIL_ROWS = 3;
export const BOIL_COLORS = [
  0, 1, 2, 0, 1,
  0, 2, 1, 0, 2,
  1, 2, 0, 1, 2,
];
export const BOIL_COLOR_HEX = ['#d79a5c', '#8fb07a', '#9aa8b4'];
// 胸口上的位置（米，相对胸口中心；x 向病人左手方向，y 向头），带一点错位，看起来不像棋盘
const JITTER = [[0.01, -0.012], [-0.008, 0.01], [0.006, 0.014], [-0.012, -0.004], [0.009, 0.008], [-0.006, 0.009], [0.012, -0.01], [-0.01, -0.006], [0.004, 0.012], [-0.009, -0.011], [0.008, 0.006], [-0.004, -0.013], [0.011, 0.004], [-0.012, 0.01], [0.006, -0.008]];
export const BOILS = BOIL_COLORS.map((c, i) => ({
  c, x: (i % BOIL_COLS - 2) * 0.07 + JITTER[i][0], y: (1 - Math.floor(i / BOIL_COLS)) * 0.075 + JITTER[i][1],
}));
export const BOIL_EDGES = [];
for (let i = 0; i < BOILS.length; i++) {
  if (i % BOIL_COLS < BOIL_COLS - 1) BOIL_EDGES.push([i, i + 1]);
  if (i + BOIL_COLS < BOILS.length) BOIL_EDGES.push([i, i + BOIL_COLS]);
}
export const boilLinked = (a, b) => BOIL_EDGES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
// 一个合法顺序（蛇形），只用来自动通关；规则接受任何合法顺序
export const BOIL_SOLUTION = [0, 1, 2, 3, 4, 9, 8, 7, 6, 5, 10, 11, 12, 13, 14];

/** 挑破第 i 颗：合法就返回新的已破顺序，不合法返回 null（全部复原）。 */
export function popBoil(popped, i) {
  if (!Number.isInteger(i) || !BOILS[i] || popped.includes(i)) return null;
  if (!popped.length) return BOILS[i].c === 0 ? [i] : null;
  const last = popped[popped.length - 1];
  if (!boilLinked(last, i) || BOILS[i].c !== (BOILS[last].c + 1) % 3) return null;
  return [...popped, i];
}

export function boilsSolved(popped) {
  if (!Array.isArray(popped) || popped.length !== BOILS.length) return false;
  let seq = [];
  for (const i of popped) { seq = popBoil(seq, i); if (!seq) return false; }
  return true;
}

/** 深度优先找出所有合法顺序（最多 limit 个），测试用来证明有解、并检查规则不止认示例解。 */
export function solveBoils(limit = 50) {
  const out = [];
  const walk = (seq) => {
    if (out.length >= limit) return;
    if (seq.length === BOILS.length) { out.push(seq); return; }
    for (let i = 0; i < BOILS.length; i++) { const next = popBoil(seq, i); if (next) walk(next); }
  };
  walk([]);
  return out;
}

// ---- 四体液与配药 ----
export const HUMORS = ['blood', 'tears', 'snot', 'saliva'];
export const HUMOR_NAMES = { blood: '血液', tears: '眼泪', snot: '鼻涕', saliva: '唾液' };
export const HUMOR_COLOR = { blood: '#a3282a', tears: '#dfe8ec', snot: '#9fb08a', saliva: '#d8cd76', medicine: '#5fc25a' };
// 医生的法杖指向（钟面上的钟点方向，12 点 = 正上方）：CURE 书里画的就是这些方向
export const HUMOR_DIR = { blood: 9, tears: 10.5, snot: 12, saliva: 1.5 };
// CURE 书的配方：从瓶底往上倒的顺序
export const CURE = ['tears', 'snot', 'saliva', 'snot', 'tears', 'blood'];

/** 往量瓶里倒一层：对了加一层，错了量瓶倒空。 */
export function pourLayer(layers, humor) {
  if (!HUMORS.includes(humor) || layers.length >= CURE.length) return { layers: [], ok: false, done: false };
  if (humor !== CURE[layers.length]) return { layers: [], ok: false, done: false };
  const next = [...layers, humor];
  return { layers: next, ok: true, done: next.length === CURE.length };
}

// 奶奶：给她什么就流出什么
export const GRANDMA_GIVES = { onion: 'tears', pepper: 'snot', mushroom: 'saliva' };

// ---- 牙齿：上排 8 颗缺口形状固定，下排是同一组形状打乱；交换两颗下牙，让每一列上下咬合 ----
export const TOOTH_UPPER = [0, 2, 1, 3, 0, 1, 3, 2];
export const TOOTH_LOWER_START = [3, 0, 2, 1, 2, 0, 1, 3];
export const TOOTH_MARKS = { x: 4, dots: 7 };   // 咬合后：下排第 5 颗画 ×，上排第 8 颗画 ∶

export function swapTeeth(order, a, b) {
  if (a === b || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= order.length || b >= order.length) return null;
  const next = [...order];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}
export const teethSolved = (order) => Array.isArray(order) && order.length === TOOTH_UPPER.length && order.every((s, i) => s === TOOTH_UPPER[i]);

// ---- 落地钟：×针和 ∶针各点一下走 1 小时 ----
export const CLOCK_START = { x: 12, dots: 3 };
export const CLOCK_ANSWER = { x: 5, dots: 8 };
export const advanceHand = (h) => (h % 12) + 1;
export const clockSolved = (x, dots) => x === CLOCK_ANSWER.x && dots === CLOCK_ANSWER.dots;

// ---- 字母箱：4 个转盘 ----
export const TRUNK_LETTERS = 'BORALTKW';
export const TRUNK_START = [5, 6, 4, 7];   // T K L W
export const TRUNK_ANSWER = 'BOAR';
export const turnDial = (letters, i) => letters.map((n, k) => (k === i ? (n + 1) % TRUNK_LETTERS.length : n));
export const trunkWord = (letters) => letters.map((n) => TRUNK_LETTERS[n]).join('');
export const trunkSolved = (letters) => trunkWord(letters) === TRUNK_ANSWER;
