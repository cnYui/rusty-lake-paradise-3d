// 第七灾的谜题只依赖可序列化的数据：存档、点击和自动通关共用同一套规则（设计见 docs/plague6_7_design.md）。
// 本文件不 import three，node 测试直接 import。

// ---- 冰池：立着的冰块 S 压到上下左右相邻的平躺冰块 L 上，L 变成压实 F；场上没有 L 就过关 ----
// 格子用字符串数组表示（行从上到下），'.' 是空格。
export const ICE_LEVELS = [
  ['LSL', 'SLS'],
  ['SLSL.', '...SL', 'LSLS.'],
  ['SLSLS', 'L.L.L', 'SLS.S'],
];
// 每关一个示例解（[from, to]，坐标 [x, y]），只给自动通关用；规则接受任何合法顺序
export const ICE_SOLUTIONS = [
  [[[1, 0], [0, 0]], [[0, 1], [1, 1]], [[2, 1], [2, 0]]],
  [[[0, 0], [1, 0]], [[2, 0], [3, 0]], [[3, 1], [4, 1]], [[1, 2], [0, 2]], [[3, 2], [2, 2]]],
  [[[4, 2], [4, 1]], [[4, 0], [3, 0]], [[2, 0], [1, 0]], [[2, 2], [2, 1]], [[0, 2], [1, 2]], [[0, 0], [0, 1]]],
];

export const iceCell = (cells, [x, y]) => (cells[y] && cells[y][x]) || '.';
const setCell = (cells, [x, y], c) => cells.map((row, j) => (j === y ? row.slice(0, x) + c + row.slice(x + 1) : row));
const adjacent = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

/** 立冰 from 压到平冰 to 上：合法返回新格子，不合法返回 null。 */
export function pressIce(cells, from, to) {
  if (!Array.isArray(from) || !Array.isArray(to) || iceCell(cells, from) !== 'S' || iceCell(cells, to) !== 'L' || !adjacent(from, to)) return null;
  return setCell(setCell(cells, from, '.'), to, 'F');
}
export const iceSolved = (cells) => cells.every((row) => !row.includes('L'));

/** 还能不能解（二分图匹配：每块平冰都要有一块相邻的立冰，一块立冰只能用一次）。 */
export function iceSolvable(cells) {
  const S = [], L = [];
  cells.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'S') S.push([x, y]); if (c === 'L') L.push([x, y]); }));
  const match = new Map();
  const aug = (s, seen) => {
    for (let li = 0; li < L.length; li++) {
      if (!adjacent(S[s], L[li]) || seen.has(li)) continue;
      seen.add(li);
      if (!match.has(li) || aug(match.get(li), seen)) { match.set(li, s); return true; }
    }
    return false;
  };
  S.forEach((_, s) => aug(s, new Set()));
  return match.size === L.length;
}

// ---- 滑冰：Caroline 朝一个方向滑出去，撞上树桩或冰面边缘才停；停在目标裂纹上过关 ----
// 坐标 [x, y]：x 从左到右，y 从远到近（俯视图里从上到下）。
export const SKATE_W = 7, SKATE_H = 5;
export const SKATE_LEVELS = [
  { stumps: [[0, 4], [2, 1], [3, 3], [4, 2]], start: [0, 0], target: [2, 3] },
  { stumps: [[0, 0], [0, 2], [1, 2], [3, 3], [4, 2]], start: [6, 4], target: [1, 1] },
  { stumps: [[0, 2], [1, 4], [3, 0], [3, 1], [4, 4], [6, 1]], start: [0, 4], target: [1, 3] },
];
export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const isStump = (level, x, y) => level.stumps.some(([a, b]) => a === x && b === y);

export function slide(level, [x, y], dir) {
  const d = DIRS[dir];
  if (!d) return [x, y];
  for (;;) {
    const nx = x + d[0], ny = y + d[1];
    if (nx < 0 || ny < 0 || nx >= SKATE_W || ny >= SKATE_H || isStump(level, nx, ny)) return [x, y];
    x = nx; y = ny;
  }
}

/** 点了冰面上的某一格：只有和 Caroline 同一行 / 同一列才算方向，返回方向名或 null。 */
export function directionTo([x, y], [tx, ty]) {
  if (tx === x && ty === y) return null;
  if (ty === y) return tx > x ? 'right' : 'left';
  if (tx === x) return ty > y ? 'down' : 'up';
  return null;
}

/** 最少步数的一条路线（方向名数组），无解返回 null。 */
export function skateSolve(level) {
  const key = (p) => p.join(','), seen = new Set([key(level.start)]), queue = [[level.start, []]];
  while (queue.length) {
    const [p, path] = queue.shift();
    if (p[0] === level.target[0] && p[1] === level.target[1]) return path;
    for (const dir of Object.keys(DIRS)) {
      const n = slide(level, p, dir);
      if (!seen.has(key(n))) { seen.add(key(n)); queue.push([n, [...path, dir]]); }
    }
  }
  return null;
}
export const skateDone = (level, pos) => pos[0] === level.target[0] && pos[1] === level.target[1];

// ---- 冰淇淋、雪人、雪景球机器 ----
export const ICE_CREAM_ORDER = ['strawberry', 'pistachio'];   // Gerard 先要草莓，再要开心果
export const SNOWMAN_PARTS = ['scarf', 'hat', 'branches', 'stones', 'carrot'];
export const DIAMONDS = ['diamond_ice', 'diamond_snow', 'diamond_youth'];
