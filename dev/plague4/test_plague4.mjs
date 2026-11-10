// 验证导向规则的失败边界与完整解法，避免动画或自动流程掩盖谜题不可解。
import test from 'node:test';
import assert from 'node:assert/strict';
import { CRAB_LEVELS, initialShells, canPlaceShell, traceCrab, windowSolved, moveTab, WINDOW_SLOTS } from '../../src/chapters/plague4/puzzles.js';
import { HUMAN, REAL, checkSize, seatedTop } from '../../src/art/scale.js';

const solutions = [
  [[2, 2], [2, 0], [6, 0]],
  [[2, 3], [2, 1], [6, 1], [6, 5], [8, 5]],
  [[1, 4], [1, 1], [4, 1], [4, 7], [8, 7], [8, 2], [10, 2]],
];
CRAB_LEVELS.forEach((level, i) => {
  test(`第 ${i + 1} 轮：从起点绕开海胆到终点`, () => {
    const input = structuredClone(solutions[i]);
    const result = traceCrab(level, input);
    assert.equal(result.ok, true);
    assert.deepEqual(result.path.at(-1).pos, level.goal);
    assert.deepEqual(input, solutions[i]);
    for (const { pos } of result.path) assert.equal(level.hazards.some((p) => p[0] === pos[0] && p[1] === pos[1]), false);
  });
  test(`第 ${i + 1} 轮：初始摆放需要玩家调整`, () => {
    assert.equal(traceCrab(level, initialShells(level)).ok, false);
  });
});
test('贝壳不能占用海胆、起终点、另一只贝壳或盘外位置', () => {
  const level = CRAB_LEVELS[0], shells = initialShells(level);
  for (const p of [...level.hazards, level.start, level.goal, shells[1], [-1, 0], [7, 1], [0.5, 1]]) assert.equal(canPlaceShell(level, shells, 0, p), false);
  assert.equal(canPlaceShell(level, shells, 0, shells[0]), true);
  assert.equal(canPlaceShell(level, shells, -1, [2, 2]), false);
});
test('走进海胆后失败，重试仍可通关', () => {
  assert.equal(traceCrab(CRAB_LEVELS[0], initialShells(CRAB_LEVELS[0])).reason, 'urchin');
  assert.equal(traceCrab(CRAB_LEVELS[0], solutions[0]).ok, true);
});
test('出界和导向循环都能结束，不会卡住交互', () => {
  const level = { size: [5, 5], start: [0, 2], goal: [4, 2], hazards: [], shells: [{ dir: 'up' }, { dir: 'right' }, { dir: 'down' }, { dir: 'left' }] };
  const loop = [[1, 2], [1, 1], [2, 1], [2, 2]];
  assert.equal(traceCrab(level, loop).reason, 'loop');
  assert.equal(traceCrab(CRAB_LEVELS[0], [[2, 2], [0, 0], [5, 0]]).reason, 'edge');
});
test('无效摆放不会进入动画循环', () => {
  assert.equal(traceCrab(CRAB_LEVELS[0], []).reason, 'invalid');
  assert.equal(traceCrab(CRAB_LEVELS[0], [[2, 2], [2, 2], [6, 0]]).reason, 'invalid');
});
test('窗锁保留四个独立刻度，部分正确和多余刻度不能开窗', () => {
  assert.equal(windowSolved([1, 3, 8, 10]), true);
  for (const v of [[], [1, 3, 8], [1, 3, 8, 9], [1, 3, 8, 10, 1], ['1', 3, 8, 10]]) assert.equal(windowSolved(v), false);
});

// 窗锁的新交互：先选纹章滑片，再点罗马数字刻度。moveTab 是唯一的纯规则入口。
test('moveTab 返回新数组并只移动指定滑片，入参不被修改', () => {
  const input = [1, 1, 1, 1];
  const next = moveTab(input, 2, 5);
  assert.deepEqual(next, [1, 1, 5, 1]);
  assert.notEqual(next, input);
  assert.deepEqual(input, [1, 1, 1, 1]);
  assert.deepEqual(moveTab([1, 2, 3, 4], 0, 2), [2, 2, 3, 4]);
  assert.equal(WINDOW_SLOTS, 12);
});

test('两枚滑片可以落在同一刻度', () => {
  const input = [1, 2, 3, 4];
  assert.deepEqual(moveTab(input, 0, 2), [2, 2, 3, 4]);
  assert.deepEqual(moveTab(input, 3, 2), [1, 2, 3, 2]);
  assert.deepEqual(input, [1, 2, 3, 4]);
});

test('moveTab 对越界滑片、非法刻度和非法数组返回 null', () => {
  const base = [1, 2, 3, 4];
  for (const tab of [-1, 4, 1.5, '1', null, undefined]) assert.equal(moveTab(base, tab, 5), null, `tab=${tab}`);
  for (const slot of [0, 13, 2.5, '3', null, undefined]) assert.equal(moveTab(base, 0, slot), null, `slot=${slot}`);
  for (const values of [[1, 2, 3], [1, 2, 3, 4, 5], [1, 2, 3, 4.5], [1, 2, 3, '4'], '1234', null, undefined]) {
    assert.equal(moveTab(values, 0, 5), null, `values=${JSON.stringify(values)}`);
  }
});

/** 全排列，用来验证四个刻度不论以什么顺序摆上去都不会提前判解。 */
function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)])
    .map((rest) => [item, ...rest]));
}

test('用 moveTab 从 [1,1,1,1] 按任意顺序摆到 [1,3,8,10]，只有四枚全对才判解', () => {
  const moves = [[0, 1], [1, 3], [2, 8], [3, 10]], solution = [1, 3, 8, 10];
  for (const order of permutations(moves)) {
    let values = [1, 1, 1, 1];
    order.forEach(([tab, slot], i) => {
      const next = moveTab(values, tab, slot);
      assert.notEqual(next, values);
      // tab0 本来就在 Ⅰ，所以 [0,1] 是空操作；其余三枚先摆对时四个值已经全对，允许此刻判解。
      const allCorrect = next.every((n, j) => n === solution[j]);
      assert.equal(windowSolved(next), allCorrect, `顺序 ${JSON.stringify(order)} 第 ${i} 步判解与四枚是否全对不一致`);
      if (!allCorrect) assert.equal(windowSolved(next), false, `顺序 ${JSON.stringify(order)} 第 ${i} 步提前判解`);
      values = next;
    });
    assert.deepEqual(values, solution);
    assert.equal(windowSolved(values), true);
  }
});

// 尺寸表是纯 ES 模块，不依赖 DOM；直接 import 就能测。
test('checkSize 接受范围内、拒绝范围外、exempt 跳过、数值按 tol 容差', () => {
  assert.equal(checkSize({ w: [1, 2], h: 1, d: [0.5, 0.8] }, { x: 1.5, y: 1.05, z: 0.6 }).ok, true);
  const out = checkSize({ w: [1, 2] }, { x: 2.3, y: 0, z: 0 });
  assert.equal(out.ok, false);
  assert.match(out.why, /宽/);
  assert.deepEqual(checkSize({ exempt: true, note: '按设计例外' }, { x: 99, y: 99, z: 99 }), { ok: true, why: '' });
  assert.equal(checkSize({ h: 1, tol: 0.1 }, { x: 0, y: 1.1, z: 0 }).ok, true);
  assert.equal(checkSize({ h: 1, tol: 0.1 }, { x: 0, y: 1.2, z: 0 }).ok, false);
  assert.equal(checkSize({ h: 1 }, { x: 0, y: 1.2, z: 0 }).ok, true);       // 默认 tol 0.2
  assert.equal(checkSize({ h: 1 }, { x: 0, y: 1.3, z: 0 }).ok, false);
  assert.equal(checkSize({ note: '没有尺寸项' }, { x: 99, y: 99, z: 99 }).ok, true);  // 缺省项不检查
});

test('seatedTop(1.88) 约等于 1.43', () => {
  assert.ok(Math.abs(seatedTop(1.88) - 1.43) < 0.01);
});

test('HUMAN 身高与 AGENTS.md 的人物模型一致', () => {
  assert.deepEqual(
    {
      nicholas: HUMAN.nicholas, gerard: HUMAN.gerard, david: HUMAN.david, jakob: HUMAN.jakob,
      caroline: HUMAN.caroline, ida: HUMAN.ida, margaret: HUMAN.margaret,
    },
    { nicholas: 1.88, gerard: 1.84, david: 1.78, jakob: 1.76, caroline: 1.66, ida: 1.58, margaret: 1.56 },
  );
});

test('REAL.p4 每项都有非空说明，且要么 exempt 要么尺寸范围有效', () => {
  for (const [id, real] of Object.entries(REAL.p4)) {
    assert.equal(typeof real.note, 'string', `${id} 缺 note`);
    assert.ok(real.note.trim().length > 0, `${id} 的 note 为空`);
    if (real.exempt) { assert.equal(real.exempt, true, `${id} 的 exempt 不是 true`); continue; }
    const present = ['w', 'h', 'd'].filter((k) => real[k] != null);
    assert.ok(present.length > 0, `${id} 没有 w / h / d`);
    for (const k of present) {
      const v = real[k];
      if (Array.isArray(v)) {
        assert.equal(v.length, 2, `${id}.${k} 不是 [lo, hi]`);
        assert.ok(Number.isFinite(v[0]) && Number.isFinite(v[1]), `${id}.${k} 含非数值`);
        assert.ok(v[0] < v[1], `${id}.${k} 的 lo 不小于 hi`);
      } else {
        assert.ok(Number.isFinite(v) && v > 0, `${id}.${k} 不是正数`);
      }
    }
  }
});
