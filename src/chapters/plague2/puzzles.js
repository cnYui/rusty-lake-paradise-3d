// 第二灾谜题的纯逻辑（不依赖 three / DOM），章节和测试共用。规则来源：docs/plague2_design.md 第 3 节。
//
// 自检（node 24 能直接按 ES module 载入本文件）：
//   node -e "import('./src/chapters/plague2/puzzles.js').then((m) => { const r = m.selfTest(); console.log(JSON.stringify(r, null, 1)); process.exit(r.ok ? 0 : 1); })"
// 浏览器里：RLP.ctx.p2.puzzles.selfTest()
//
// 格子统一写成 [列, 行]（第 0 行在北、靠岸，俯视画面的上方）。

// ============================================================================================
// 3.2 睡莲叶跳青蛙
// ============================================================================================
export const LILY_COLS = 6;
export const LILY_ROWS = 5;
export const LILY_CELL = 0.55;     // 格距（米），和 lily_board 道具的默认 cell 一致

// 5 关：起点 start（一块石头，青蛙蹲在上面）、终点 goal（goalKind = 'stone' 石头 | 'stump' 圆木桩）、叶子 pads。
// solution 是设计文档里的参考解（不含起点，最后一步是终点），selfTest 会逐步验证它合法。
export const LILY_LEVELS = [
  {
    start: [3, 3], goal: [0, 1], goalKind: 'stone',
    pads: [[2, 1], [3, 1], [4, 1]],
    solution: [[3, 1], [4, 1], [2, 1], [0, 1]],
  },
  {
    start: [0, 1], goal: [3, 4], goalKind: 'stone',
    pads: [[1, 0], [3, 0], [4, 0], [2, 1], [4, 1], [1, 2], [2, 2], [3, 2], [4, 2], [4, 3]],
    solution: [[2, 1], [2, 2], [4, 2], [4, 3], [4, 1], [4, 0], [3, 0], [1, 0], [1, 2], [3, 2], [3, 4]],
  },
  {
    start: [3, 4], goal: [2, 0], goalKind: 'stone',
    pads: [[2, 1], [0, 2], [1, 2], [0, 3], [2, 3], [1, 4], [2, 4]],
    solution: [[2, 4], [1, 4], [1, 2], [0, 2], [0, 3], [2, 3], [2, 1], [2, 0]],
  },
  {
    start: [2, 0], goal: [5, 3], goalKind: 'stone',
    pads: [[0, 0], [1, 1], [3, 1], [0, 2], [1, 2], [2, 2], [1, 3], [2, 3], [3, 3]],
    solution: [[0, 0], [0, 2], [1, 2], [2, 2], [2, 3], [1, 3], [1, 1], [3, 1], [3, 3], [5, 3]],
  },
  {
    start: [5, 3], goal: [2, 0], goalKind: 'stump',
    pads: [[0, 0], [1, 1], [3, 1], [0, 2], [1, 2], [2, 2], [1, 3], [2, 3], [3, 3]],
    solution: [[3, 3], [3, 1], [1, 1], [1, 3], [2, 3], [2, 2], [1, 2], [0, 2], [0, 0], [2, 0]],
  },
];

/** [c, r] → 'c,r'（用作 Set / Map 的键）。 */
export const cellKey = ([c, r]) => `${c},${r}`;
export const sameCell = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
const inBoard = ([c, r]) => c >= 0 && c < LILY_COLS && r >= 0 && r < LILY_ROWS;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 关卡号（1..5）或关卡对象 → 关卡对象。 */
export function lilyLevel(level) {
  if (level && typeof level === 'object') return level;
  const def = LILY_LEVELS[(Number(level) || 1) - 1];
  if (!def) throw new Error(`lily level ${level} 不存在（只有 1..${LILY_LEVELS.length}）`);
  return def;
}

const keySet = (pads) => (pads instanceof Set ? new Set(pads) : new Set((pads || []).map(cellKey)));

/** 从 from 出发横竖 1 格或 2 格能落到的所有格子（不管上面有没有东西；2 格可以越过任何东西）。 */
export function lilyReach(from) {
  const out = [];
  for (const [dc, dr] of DIRS) {
    for (const d of [1, 2]) {
      const cell = [from[0] + dc * d, from[1] + dr * d];
      if (inBoard(cell)) out.push(cell);
    }
  }
  return out;
}

/**
 * 当前能“成功”跳过去的格子（要高亮的叶子）：横竖 1 或 2 格，落点必须是还没踩过的叶子；
 * 所有叶子都踩完以后，终点也算。padsLeft = 还没踩过的叶子（[[c,r]…] 或 'c,r' 的 Set）。
 */
export function lilyTargets(level, padsLeft, from) {
  const def = lilyLevel(level);
  const left = keySet(padsLeft);
  return lilyReach(from).filter((cell) => left.has(cellKey(cell)) || (left.size === 0 && sameCell(cell, def.goal)));
}

/** 无路可走：叶子没踩完（或已经全踩完）却没有任何能成功跳过去的格子。站在终点上不算。 */
export function lilyIsStuck(level, padsLeft, from) {
  const def = lilyLevel(level);
  if (sameCell(from, def.goal)) return false;
  return lilyTargets(def, padsLeft, from).length === 0;
}

/**
 * 判定一次跳跃（点了 to 格）：
 *   'illegal' — 不是横竖 1/2 格、或落点上既不是剩下的叶子也不是终点（没有反应）
 *   'move'    — 跳上一片叶子；stuck = 落地后无路可走（章节随后压暗重置本关）
 *   'fail'    — 叶子没踩完就跳上终点（压暗、重置本关）
 *   'win'     — 叶子全踩完后跳上终点（过关）
 * 返回 { kind, padsLeft（新的数组）, stuck }。
 */
export function lilyJump(level, padsLeft, from, to) {
  const def = lilyLevel(level);
  const left = keySet(padsLeft);
  const reach = lilyReach(from).some((c) => sameCell(c, to));
  const arr = () => [...left].map((k) => k.split(',').map(Number));
  if (!reach) return { kind: 'illegal', padsLeft: arr(), stuck: false };
  if (sameCell(to, def.goal)) return { kind: left.size === 0 ? 'win' : 'fail', padsLeft: arr(), stuck: false };
  if (!left.has(cellKey(to))) return { kind: 'illegal', padsLeft: arr(), stuck: false };
  left.delete(cellKey(to));
  const next = arr();
  return { kind: 'move', padsLeft: next, stuck: lilyIsStuck(def, next, to) };
}

/** DFS 求一条通关路线（不含起点，最后一步是终点）；无解返回 null。 */
export function solveLily(level) {
  const def = lilyLevel(level);
  const path = [];
  const dfs = (from, left) => {
    for (const to of lilyTargets(def, left, from)) {
      path.push(to);
      if (sameCell(to, def.goal)) return true;
      const next = new Set(left);
      next.delete(cellKey(to));
      if (dfs(to, next)) return true;
      path.pop();
    }
    return false;
  };
  return dfs(def.start, keySet(def.pads)) ? path.slice() : null;
}

/** 按顺序检查一条路线是否合法（每一步都是 'move'，最后一步是 'win'）。返回 { ok, at, reason }。 */
export function checkLilyPath(level, steps) {
  const def = lilyLevel(level);
  let from = def.start, left = def.pads.map((c) => c.slice());
  for (let i = 0; i < steps.length; i++) {
    const res = lilyJump(def, left, from, steps[i]);
    const last = i === steps.length - 1;
    if (last ? res.kind !== 'win' : res.kind !== 'move') return { ok: false, at: i, reason: `第 ${i + 1} 步 ${cellKey(steps[i])} 判定为 ${res.kind}` };
    from = steps[i]; left = res.padsLeft;
  }
  return { ok: true, at: steps.length, reason: '' };
}

// ============================================================================================
// 3.8 神殿柜门的同心圆转盘锁
// ============================================================================================
// step 是从“解开位置”顺时针数的步数：中圈每步 45°（8 步一圈），外圈每步 30°（12 步一圈）。
// 初始：中圈比解开位置顺时针多 135°（3 步，再点 5 次），外圈逆时针 120°（= 顺时针 8 步，再点 4 次）。
export const DIAL = {
  mid: { stepDeg: 45, steps: 8, start: 3 },
  out: { stepDeg: 30, steps: 12, start: 8 },
};
/** 点一下某一圈（顺时针一步）后的步数。 */
export function dialNext(ring, step) {
  const r = DIAL[ring];
  if (!r) throw new Error(`dial ring "${ring}" 不存在（mid | out）`);
  return (((Number(step) || 0) + 1) % r.steps + r.steps) % r.steps;
}
/** 两圈都转回解开位置。 */
export function dialSolved(mid, out) {
  return ((Number(mid) || 0) % DIAL.mid.steps) === 0 && ((Number(out) || 0) % DIAL.out.steps) === 0;
}
/** 还要点几次（从当前步数顺时针转回 0）。 */
export function dialClicksLeft(ring, step) {
  const r = DIAL[ring];
  return (r.steps - (((Number(step) || 0) % r.steps) + r.steps) % r.steps) % r.steps;
}

// ============================================================================================
// 3.4 Ida 吹蛙笛：头顶青蛙的变色顺序
// ============================================================================================
// IDA_COLORS[0] 是开始吹奏前的颜色；第 k 个乐句（ida_phrase = k）吹完后青蛙变成 IDA_COLORS[k]。
// 第 5 次变色（第二次变成橙色）时她睁眼、停止吹奏，这时才能拿走青蛙（物品 frog_orange）。
export const IDA_COLORS = ['lime', 'orange', 'green', 'teal', 'lime', 'orange'];
export const IDA_FINAL_PHRASE = IDA_COLORS.length - 1;   // 5
export const IDA_PHRASE_COOLDOWN_MS = 1200;              // 乐句之间的冷却

// ============================================================================================
// 3.5 厨房：锅里要放几只青蛙
// ============================================================================================
export const POT_FROGS_NEEDED = 4;

// ============================================================================================
// 3.3 蛙卵盆（占位）
// ============================================================================================
// TODO(蛙卵规则)：参考视频 1:45–3:38 的逐帧分析回来后按真实规则改写 press()；章节只依赖下面这几个接口。
// 状态用 12 位掩码表示（bit i-1 = 第 i 堆还浮在水面上），可以直接存进旗标。
// 已知线索（video_000-152.md 1:47–1:52）：点第 12 堆 → 第 12 堆连同芦苇沉下去，随后又冒出来，
// 同时别的堆被压扁回弹；video_331-524.md 3:30–3:31：最后剩两团时点其中一团，两团同时消失 → 成功。
export const SPAWN = {
  count: 12,
  // 旁边长着芦苇的堆：'lr' 左右两丛、'r' 右边一丛（和 spawn_basin 道具 API 的表一致）
  reeds: { 1: 'lr', 3: 'r', 7: 'r', 9: 'r', 11: 'r', 12: 'lr' },
  full: 0xfff,
  /** 开局：12 堆都在。 */
  initial() { return 0xfff; },
  /** 第 i 堆（1..12）是否还在。 */
  isOn(mask, i) { return ((mask >> (i - 1)) & 1) === 1; },
  /** 占位规则：点哪一堆就只把那一堆沉下去（已经沉了的点了没反应）。返回新的掩码。 */
  press(mask, i) {
    if (i < 1 || i > 12) return mask;
    return mask & ~(1 << (i - 1));
  },
  /** 清空了吗（全部沉下去 = 成功）。 */
  isCleared(mask) { return (mask & 0xfff) === 0; },
  /** 掩码 → 还在的堆号列表。 */
  list(mask) { const out = []; for (let i = 1; i <= 12; i++) if (SPAWN.isOn(mask, i)) out.push(i); return out; },
};

// ============================================================================================
// 自检
// ============================================================================================
export function selfTest() {
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
  LILY_LEVELS.forEach((def, i) => {
    const n = i + 1;
    const all = [def.start, def.goal, ...def.pads].map(cellKey);
    check(`lily ${n}: 格子都在棋盘内且不重叠`, [def.start, def.goal, ...def.pads].every(inBoard) && new Set(all).size === all.length);
    const ref = checkLilyPath(def, def.solution);
    check(`lily ${n}: 参考解合法`, ref.ok, ref.reason);
    check(`lily ${n}: 参考解踩遍所有叶子`, def.solution.length === def.pads.length + 1);
    const sol = solveLily(def);
    check(`lily ${n}: solveLily 有解`, !!sol && checkLilyPath(def, sol).ok, sol ? sol.map(cellKey).join(' ') : 'null');
    // 叶子没踩完就跳上终点 = 失败
    const early = lilyReach(def.start).some((c) => sameCell(c, def.goal));
    if (early) check(`lily ${n}: 提前跳上终点判失败`, lilyJump(def, def.pads, def.start, def.goal).kind === 'fail');
  });
  // 每一关的终点是下一关的起点
  for (let i = 0; i + 1 < LILY_LEVELS.length; i++) {
    check(`lily ${i + 1}→${i + 2}: 终点 = 下一关起点`, sameCell(LILY_LEVELS[i].goal, LILY_LEVELS[i + 1].start));
  }
  check('lily: 第 1 关开局可跳的叶子 = (3,1)', JSON.stringify(lilyTargets(1, LILY_LEVELS[0].pads, LILY_LEVELS[0].start)) === JSON.stringify([[3, 1]]));
  check('lily: 无路可走判定', lilyIsStuck(1, [[0, 4]], [5, 0]) && !lilyIsStuck(1, [[2, 1]], [3, 1]));
  check('lily: 叶子没踩完跳上终点 = fail，踩完 = win', lilyJump(3, [[0, 2]], [2, 1], [2, 0]).kind === 'fail' && lilyJump(3, [], [2, 1], [2, 0]).kind === 'win');
  check('lily: 斜跳 / 3 格 / 空水面 = illegal', lilyJump(1, LILY_LEVELS[0].pads, [3, 3], [2, 1]).kind === 'illegal'
    && lilyJump(1, LILY_LEVELS[0].pads, [3, 3], [3, 0]).kind === 'illegal' && lilyJump(1, LILY_LEVELS[0].pads, [3, 3], [3, 2]).kind === 'illegal');
  // 转盘锁：中圈从 3 点 5 次、外圈从 8 点 4 次
  let mid = DIAL.mid.start, out = DIAL.out.start, clicksMid = 0, clicksOut = 0;
  while (mid !== 0 && clicksMid < 20) { mid = dialNext('mid', mid); clicksMid++; }
  while (out !== 0 && clicksOut < 20) { out = dialNext('out', out); clicksOut++; }
  check('dial: 中圈点 5 次解开', clicksMid === 5 && dialClicksLeft('mid', DIAL.mid.start) === 5);
  check('dial: 外圈点 4 次解开', clicksOut === 4 && dialClicksLeft('out', DIAL.out.start) === 4);
  check('dial: 初始未解开、归零后解开', !dialSolved(DIAL.mid.start, DIAL.out.start) && dialSolved(mid, out));
  check('ida: 第 5 次变色是橙色', IDA_FINAL_PHRASE === 5 && IDA_COLORS[IDA_FINAL_PHRASE] === 'orange' && IDA_COLORS[0] === 'lime');
  // 蛙卵占位规则：12 堆都点一遍就清空
  let m = SPAWN.initial();
  for (let i = 1; i <= 12; i++) m = SPAWN.press(m, i);
  check('spawn(占位): 12 堆点完即清空', SPAWN.isCleared(m) && SPAWN.list(SPAWN.initial()).length === 12);
  return { ok: results.every((r) => r.ok), failed: results.filter((r) => !r.ok), passed: results.filter((r) => r.ok).length, total: results.length, results };
}
