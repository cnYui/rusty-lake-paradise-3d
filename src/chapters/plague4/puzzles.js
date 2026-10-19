// 寄居蟹的导向规则独立于画面，存档只需保存轮次和贝壳坐标。
export const DIRECTIONS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
export const WINDOW_SOLUTION = [1, 3, 8, 10];

export const CRAB_LEVELS = [
  {
    size: [7, 5], start: [0, 2], goal: [6, 2], hazards: [[4, 2]],
    shells: [
      { dir: 'up', pos: [4, 4] }, { dir: 'right', pos: [1, 0] }, { dir: 'down', pos: [5, 0] },
    ],
  },
  {
    size: [9, 7], start: [0, 3], goal: [8, 3],
    hazards: [[4, 0], [7, 1], [4, 3], [5, 3], [4, 5], [4, 6], [7, 4]],
    shells: [
      { dir: 'up', pos: [3, 6] }, { dir: 'right', pos: [1, 1] }, { dir: 'down', pos: [7, 0] },
      { dir: 'right', pos: [1, 5] }, { dir: 'up', pos: [6, 6] },
    ],
  },
  {
    size: [11, 9], start: [0, 4], goal: [10, 4],
    hazards: [[3, 4], [5, 4], [6, 4], [7, 4], [6, 1], [2, 7], [9, 7], [5, 0], [5, 8], [9, 3], [2, 3], [7, 6]],
    shells: [
      { dir: 'up', pos: [2, 8] }, { dir: 'right', pos: [1, 0] }, { dir: 'down', pos: [8, 0] },
      { dir: 'right', pos: [3, 6] }, { dir: 'up', pos: [8, 8] }, { dir: 'right', pos: [2, 2] },
      { dir: 'down', pos: [10, 6] },
    ],
  },
];

export const sameCell = (a, b) => a[0] === b[0] && a[1] === b[1];
export const initialShells = (level) => level.shells.map((s) => [...s.pos]);
const inside = (level, [x, y]) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < level.size[0] && y < level.size[1];

export function canPlaceShell(level, shells, index, cell) {
  return Number.isInteger(index) && index >= 0 && index < level.shells.length && inside(level, cell)
    && !sameCell(cell, level.start) && !sameCell(cell, level.goal)
    && !level.hazards.some((p) => sameCell(p, cell))
    && !shells.some((p, i) => i !== index && sameCell(p, cell));
}

export function traceCrab(level, shells) {
  if (!Array.isArray(shells) || shells.length !== level.shells.length
    || !shells.every((p, i) => Array.isArray(p) && canPlaceShell(level, shells, i, p))) {
    return { ok: false, reason: 'invalid', path: [] };
  }
  let pos = [...level.start], dir = 'right';
  const path = [{ pos: [...pos], dir }], visited = new Set();
  for (;;) {
    if (sameCell(pos, level.goal)) return { ok: true, path };
    const key = `${pos}:${dir}`;
    if (visited.has(key)) return { ok: false, reason: 'loop', path };
    visited.add(key);
    const shell = shells.findIndex((p) => sameCell(p, pos));
    if (shell >= 0) dir = level.shells[shell].dir;
    const d = DIRECTIONS[dir];
    pos = [pos[0] + d[0], pos[1] + d[1]];
    if (!inside(level, pos)) return { ok: false, reason: 'edge', path };
    path.push({ pos: [...pos], dir });
    if (level.hazards.some((p) => sameCell(p, pos))) return { ok: false, reason: 'urchin', path };
  }
}

export const windowSolved = (values) => Array.isArray(values) && values.length === 4
  && values.every((n, i) => n === WINDOW_SOLUTION[i]);
