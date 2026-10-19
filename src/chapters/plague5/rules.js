// 谜题只依赖可序列化的数据，使存档、点击和自动流程共用同一套约束。
export const FIELD_SIZE = [6, 5];
export const FIELD_LEVELS = [
  { pieces: [{ type: 'cucumber', size: [1, 2] }, { type: 'pumpkin', size: [1, 1] }], solution: [[4, 0], [1, 3]] },
  { pieces: [{ type: 'cucumber', size: [1, 2] }, { type: 'carrot', size: [1, 3] }, { type: 'pumpkin', size: [1, 1] }], solution: [[0, 0], [3, 1], [5, 4]] },
  { pieces: [{ type: 'cucumber', size: [1, 2] }, { type: 'carrot', size: [1, 3] }, { type: 'potato', size: [2, 1] }, { type: 'potato', size: [2, 1] }, { type: 'pumpkin', size: [1, 1] }, { type: 'pumpkin', size: [1, 1] }], solution: [[5, 1], [0, 0], [2, 0], [1, 4], [3, 2], [4, 3]] },
];

export function fieldCells(level, positions) {
  const cells = Array(FIELD_SIZE[0] * FIELD_SIZE[1]).fill(null);
  for (let i = 0; i < level.pieces.length; i++) {
    const p = positions[i];
    if (!p) continue;
    const [w, h] = level.pieces[i].size;
    if (!Number.isInteger(p[0]) || !Number.isInteger(p[1]) || p[0] < 0 || p[1] < 0 || p[0] + w > FIELD_SIZE[0] || p[1] + h > FIELD_SIZE[1]) return null;
    for (let y = p[1]; y < p[1] + h; y++) for (let x = p[0]; x < p[0] + w; x++) {
      const at = y * FIELD_SIZE[0] + x;
      if (cells[at] !== null) return null;
      cells[at] = i;
    }
  }
  return cells;
}

export function fieldCounts(level, positions) {
  const cells = fieldCells(level, positions);
  if (!cells) return null;
  const rows = Array(FIELD_SIZE[1]).fill(0), cols = Array(FIELD_SIZE[0]).fill(0);
  cells.forEach((piece, i) => { if (piece !== null) { rows[Math.floor(i / FIELD_SIZE[0])]++; cols[i % FIELD_SIZE[0]]++; } });
  return { rows, cols };
}

export function fieldSolved(level, positions) {
  if (positions.length !== level.pieces.length || positions.some((p) => !p)) return false;
  const counts = fieldCounts(level, positions), target = fieldCounts(level, level.solution);
  return !!counts && counts.rows.every((n, i) => n === target.rows[i]) && counts.cols.every((n, i) => n === target.cols[i]);
}

export function moveFieldPiece(level, positions, index, at) {
  if (!level.pieces[index]) return null;
  const next = level.pieces.map((_, i) => i === index ? [...at] : positions[i] ? [...positions[i]] : null);
  return fieldCells(level, next) ? next : null;
}

const SIX_DOTS = [[-1.8, 1.3], [-0.65, 0.35], [1.05, 0.8], [-1.65, -1.15], [1.55, -0.7], [0.1, -1.8]];
const NINE_DOTS = [[-2.0, 1.0], [-0.5, 1.5], [1.35, 0.7], [-2.55, -0.5], [-0.35, -0.35], [1.15, -1.1], [-1.6, -1.65], [0, -2.05], [2.0, -0.4]];

export const THREAD_LEVELS = [
  { dots: SIX_DOTS, edges: [[0, 2], [2, 4], [4, 5], [5, 1], [1, 3], [3, 0]] },
  { dots: SIX_DOTS, edges: [[0, 1], [1, 3], [3, 0], [0, 2], [2, 4], [4, 5], [5, 3]] },
  { dots: SIX_DOTS, edges: [[0, 2], [2, 4], [4, 3], [3, 1], [1, 0], [0, 3], [3, 5]] },
  { dots: SIX_DOTS, edges: [[0, 2], [2, 3], [3, 1], [1, 0], [0, 3], [3, 4], [4, 5]] },
  { dots: NINE_DOTS, edges: [[0, 1], [1, 2], [2, 8], [8, 5], [5, 7], [7, 6], [6, 3], [3, 0], [0, 4], [4, 1], [2, 4], [4, 3], [4, 6], [4, 7], [4, 8]] },
];

export function threadDegrees(level, edges = level.edges) {
  const degrees = Array(level.dots.length).fill(0);
  for (const [a, b] of edges) { degrees[a]++; degrees[b]++; }
  return degrees;
}

export function threadSolved(level, edges) {
  const keys = new Set();
  for (const [a, b] of edges) {
    const key = [a, b].sort((x, y) => x - y).join(':');
    if (a === b || !Number.isInteger(a) || !Number.isInteger(b) || !level.dots[a] || !level.dots[b] || keys.has(key)) return false;
    keys.add(key);
  }
  const degrees = threadDegrees(level, edges), target = threadDegrees(level);
  if (!degrees.every((n, i) => n === target[i])) return false;
  const visited = new Set([0]), queue = [0];
  while (queue.length) {
    const at = queue.shift();
    for (const edge of edges) if (edge.includes(at)) for (const n of edge) if (!visited.has(n)) { visited.add(n); queue.push(n); }
  }
  return visited.size === level.dots.length;
}

export function toggleThread(level, edges, a, b) {
  if (a === b || !level.dots[a] || !level.dots[b]) return null;
  const existing = edges.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (existing >= 0) return edges.filter((_, i) => i !== existing);
  const degrees = threadDegrees(level, edges), target = threadDegrees(level);
  if (degrees[a] >= target[a] || degrees[b] >= target[b]) return null;
  return [...edges.map((e) => [...e]), [a, b]];
}

export const COW_PAIRS = [0, 1, 2, 3, 4, 2, 0, 4, 1, 3];
export const BURGER_ORDER = ['bun_bottom', 'lettuce', 'cooked_meat', 'cheese', 'tomato_slice', 'cucumber_slice', 'bun_top'];
