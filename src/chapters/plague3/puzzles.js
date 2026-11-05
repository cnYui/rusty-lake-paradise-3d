// 第三灾谜题的纯逻辑（不依赖 three / DOM），章节和测试共用。规则来源：docs/plague3_design.md 第 4 节。
//
// 自检（node 能直接按 ES module 载入本文件）：
//   node -e "import('./src/chapters/plague3/puzzles.js').then((m) => { const r = m.selfTest(); console.log(JSON.stringify(r, null, 1)); process.exit(r.ok ? 0 : 1); })"
// 浏览器里：RLP.ctx.p3.puzzles.selfTest()
//
// 美术里和这里重复的常量（滑块盒的格子、蜂孔数量、陶轮的目标器形）在浏览器里由 ctx.p3.checkArt() 对一遍，防止两边漂移。

// ============================================================================================
// 4.1 滑块盒
// ============================================================================================
// 26 格：第 0–2 行各 7 格（下标 0..20），第 3 行只有第 1–5 列（下标 21..25）。
export const SLIDER_N = 26;
export const SLIDER_START = { discs: [2, 10, 20], empty: 25 };
export const SLIDER_EYES = [12, 14, 22];

/** 格子下标 → [行, 列]。 */
export const sliderRC = (i) => (i < 21 ? [Math.floor(i / 7), i % 7] : [3, i - 21 + 1]);
/** [行, 列] → 格子下标，没有这一格返回 −1。 */
export function sliderIndex(r, c) {
  if (r < 0 || r > 3 || c < 0 || c > 6) return -1;
  if (r === 3) return c >= 1 && c <= 5 ? 21 + c - 1 : -1;
  return r * 7 + c;
}
/** 和 i 上下左右相邻的格子。 */
export function sliderNeighbors(i) {
  const [r, c] = sliderRC(i);
  return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => sliderIndex(a, b)).filter((x) => x >= 0);
}
/** 盘面快照（用于存档）：圆片块的位置（顺序固定，和美术里的圆片块一一对应）+ 空格。 */
export const sliderBoard = (b = SLIDER_START) => ({ discs: [...b.discs], empty: b.empty });
/** 点 cell 这一格的方块：和空格相邻才能滑，滑进空格。返回新盘面和这一步 { from, to, disc }（disc = 圆片块序号或 −1）；不能滑返回 null。 */
export function sliderPress(board, cell) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= SLIDER_N || cell === board.empty) return null;
  if (!sliderNeighbors(board.empty).includes(cell)) return null;
  const disc = board.discs.indexOf(cell);
  const discs = board.discs.map((d) => (d === cell ? board.empty : d));
  return { board: { discs, empty: cell }, from: cell, to: board.empty, disc };
}
/** 三块圆片块都停在眼睛格上（不要求空格位置、不要求哪块对哪只眼睛）。 */
export const sliderSolved = (board) => SLIDER_EYES.every((e) => board.discs.includes(e));
/** 点哪些格子还能动（和空格相邻的格子）。 */
export const sliderMovable = (board) => sliderNeighbors(board.empty);

// 设计文档里量出来的最短解（点哪一格的方块，23 步）；selfTest 验证它合法并且解开。
export const SLIDER_SOLUTION = [19, 20, 13, 12, 19, 18, 17, 10, 9, 2, 1, 8, 9, 16, 17, 23, 22, 16, 15, 8, 7, 14, 15];

/** 从任意盘面出发的 BFS 最短解（只给开发 / walkthrough / 测试用，玩家没有自动解）。返回点击序列，无解返回 null。 */
export function sliderSolve(board = SLIDER_START, maxStates = 200000) {
  const key = (b) => `${[...b.discs].sort((x, y) => x - y).join(',')}|${b.empty}`;   // 圆片块互相等价
  const seen = new Map([[key(board), null]]);
  const queue = [board];
  for (let head = 0; head < queue.length && seen.size < maxStates; head++) {
    const cur = queue[head];
    if (sliderSolved(cur)) {
      const path = [];
      for (let k = key(cur); seen.get(k); k = seen.get(k).prev) path.unshift(seen.get(k).cell);
      return path;
    }
    for (const cell of sliderMovable(cur)) {
      const { board: next } = sliderPress(cur, cell);
      const k = key(next);
      if (!seen.has(k)) { seen.set(k, { prev: key(cur), cell }); queue.push(next); }
    }
  }
  return null;
}

// ============================================================================================
// 4.3 蜂巢
// ============================================================================================
// 7 个蜂孔（孔号见美术 HIVE_HOLES）+ 一条固定链：step = 已飞出的蜜蜂数（0..7）。
// step = 0：点任意孔 → 第 1 只蜜蜂从 HIVE_ORDER[0] 飞出；step = k (1..6)：必须点刚才那只蜜蜂飞出来的孔 HIVE_ORDER[k-1]，
// 下一只从 HIVE_ORDER[k] 飞出；点错 → 全部飞回，step = 0；第 7 只飞出 → 完成。
// 原作出蜂的具体顺序从录屏无法精确确认，这条链是本项目定的固定顺序。
export const HIVE_HOLE_COUNT = 7;
export const HIVE_ORDER = [4, 1, 5, 0, 6, 2, 3];

/** 点 hole 孔。返回 { kind: 'next' | 'done' | 'wrong' | 'ignored', step, release（要放出的蜜蜂所在孔，只有 next / done 有） }。 */
export function hivePress(step, hole) {
  if (!Number.isInteger(hole) || hole < 0 || hole >= HIVE_HOLE_COUNT || step >= HIVE_ORDER.length) return { kind: 'ignored', step };
  if (step === 0) return { kind: 'next', step: 1, release: HIVE_ORDER[0] };
  if (hole !== HIVE_ORDER[step - 1]) return { kind: 'wrong', step: 0 };
  const next = step + 1;
  return { kind: next >= HIVE_ORDER.length ? 'done' : 'next', step: next, release: HIVE_ORDER[step] };
}
/** 已飞出的蜜蜂所在孔（用于 setState({ bees })）。 */
export const hiveBees = (step) => HIVE_ORDER.slice(0, Math.max(0, Math.min(HIVE_ORDER.length, step)));

// ============================================================================================
// 4.4 陶轮
// ============================================================================================
// shape = [下, 中, 上] 三段各自的变体号（0..3，循环）。目标器形来自墙上的草图（美术里的 POT.targets）。
export const POT_START = [0, 0, 0];
export const POT_TARGETS = { slim: [2, 2, 3], urn: [3, 3, 1] };
export const POT_VARIANTS = 4;

/** 点第 seg 段（0 下 / 1 中 / 2 上）→ 这一段换成下一种变体。 */
export function potPoke(shape, seg) {
  if (!(seg >= 0 && seg <= 2)) return [...shape];
  const next = [...shape];
  next[seg] = (next[seg] + 1) % POT_VARIANTS;
  return next;
}
/** 器形等于哪个目标：'slim' | 'urn' | null。 */
export function potMatch(shape) {
  for (const [kind, t] of Object.entries(POT_TARGETS)) if (t.every((v, i) => v === shape[i])) return kind;
  return null;
}
/** 从起始泥团做出 kind 器形需要点哪几段（按下→中→上顺序），walkthrough 用：细颈瓶 下×2 中×2 上×3，罐 下×3 中×3 上×1。 */
export function potRecipe(kind, from = POT_START) {
  const t = POT_TARGETS[kind], out = [];
  for (let s = 0; s < 3; s++) for (let n = (t[s] - from[s] + POT_VARIANTS) % POT_VARIANTS; n > 0; n--) out.push(s);
  return out;
}
/** 器形的字符串形式（存进旗标）。 */
export const potKey = (shape) => shape.join(',');
export const potParse = (s) => {
  const a = typeof s === 'string' ? s.split(',').map(Number) : [];
  return a.length === 3 && a.every((v) => Number.isInteger(v) && v >= 0 && v < POT_VARIANTS) ? a : [...POT_START];
};

// ============================================================================================
// 4.2 捕蝇草
// ============================================================================================
export const TRAP_FOOD = ['p3_gnats', 'p3_snail', 'p3_mussel', 'p3_ear'];
export const TRAP_NEEDED = 4;
export const isTrapFood = (id) => TRAP_FOOD.includes(id);

// ============================================================================================
// 4.7 神龛
// ============================================================================================
// 柱 0（左）原有长颈瓶，只接黄色花；柱 1、2 放自己做的花瓶（任意器形、任意柱），瓶里只接橙花 / 玫瑰。
export const VASE_KIND = { p3_vase_slim: 'slim', p3_vase_urn: 'urn' };
export const FLOWER_KIND = { p3_flower_yellow: 'yellow', p3_flower_orange: 'orange', p3_rose: 'rose' };
export const FLOWER_ITEM = { yellow: 'p3_flower_yellow', orange: 'p3_flower_orange', rose: 'p3_rose' };
export const VASE_ITEM = { slim: 'p3_vase_slim', urn: 'p3_vase_urn' };

/**
 * 在 slot 号柱上用 item 物品：返回 { kind: 'vase' | 'flower', value } 或 null（不合法）。
 * st = { vases: [柱1 的器形|null, 柱2 的器形|null], flowers: [柱0, 柱1, 柱2 的花色|null] }。
 */
export function shrineUse(st, slot, item) {
  if (VASE_KIND[item]) {
    if (slot < 1 || slot > 2 || st.vases[slot - 1]) return null;
    return { kind: 'vase', value: VASE_KIND[item] };
  }
  const flower = FLOWER_KIND[item];
  if (!flower || st.flowers[slot]) return null;
  if (slot === 0) return flower === 'yellow' ? { kind: 'flower', value: flower } : null;
  if (!st.vases[slot - 1] || flower === 'yellow') return null;
  return { kind: 'flower', value: flower };
}
export const shrineComplete = (st) => st.flowers.every(Boolean);

// ============================================================================================
// 自检
// ============================================================================================
export function selfTest() {
  const out = [];
  const check = (name, ok, info = '') => out.push({ name, ok: !!ok, info });
  // 滑块：格子映射、相邻、参考解
  check('slider: 26 格且互为反函数', Array.from({ length: SLIDER_N }, (_, i) => sliderIndex(...sliderRC(i)) === i).every(Boolean));
  check('slider: 起点空格在 25，邻居是 19 和 24', sliderNeighbors(25).sort((a, b) => a - b).join() === '19,24');
  let b = sliderBoard(), legal = true;
  for (const cell of SLIDER_SOLUTION) { const r = sliderPress(b, cell); if (!r) { legal = false; break; } b = r.board; }
  check('slider: 参考解每一步合法', legal);
  check('slider: 参考解走完解开', legal && sliderSolved(b), JSON.stringify(b));
  const bfs = sliderSolve(SLIDER_START);
  check('slider: BFS 能解起始盘面', !!bfs, bfs ? `${bfs.length} 步` : '');
  check('slider: 不相邻的点击无效', sliderPress(sliderBoard(), 0) === null && sliderPress(sliderBoard(), 25) === null);
  // 蜂巢：完整一遍、点错复位
  let step = 0, ok = true;
  const first = hivePress(0, 3); step = first.step;
  for (let k = 0; k < 6; k++) { const r = hivePress(step, HIVE_ORDER[k]); ok = ok && (k === 5 ? r.kind === 'done' : r.kind === 'next'); step = r.step; }
  check('hive: 任意孔 + 链上前 6 个孔 → 完成', ok && step === 7);
  check('hive: 点错复位', hivePress(3, 0).kind === 'wrong' && hivePress(3, 0).step === 0);
  // 陶轮
  check('pot: 细颈瓶配方 7 次点击', potRecipe('slim').length === 7 && potMatch(potRecipe('slim').reduce(potPoke, POT_START)) === 'slim');
  check('pot: 罐配方 7 次点击', potRecipe('urn').length === 7 && potMatch(potRecipe('urn').reduce(potPoke, POT_START)) === 'urn');
  // 神龛
  const st = { vases: [null, null], flowers: [null, null, null] };
  check('shrine: 左柱只接黄花', shrineUse(st, 0, 'p3_flower_yellow')?.value === 'yellow' && shrineUse(st, 0, 'p3_rose') === null);
  check('shrine: 没有花瓶不能插橙花', shrineUse(st, 1, 'p3_flower_orange') === null && shrineUse(st, 1, 'p3_vase_urn')?.kind === 'vase');
  return { ok: out.every((x) => x.ok), checks: out };
}
