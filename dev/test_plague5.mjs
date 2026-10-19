// 第五灾规则验收：合法解、失败重试与约束，避免把展示状态误当谜题真值。
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_LEVELS, fieldCells, fieldCounts, fieldSolved, moveFieldPiece, THREAD_LEVELS, threadDegrees, threadSolved, toggleThread } from '../src/chapters/plague5/rules.js';

test('三轮菜地都有合法解，全部菜苗必须摆入田格', () => {
  for (const level of FIELD_LEVELS) {
    assert.equal(fieldSolved(level, level.solution), true);
    assert.equal(fieldSolved(level, level.pieces.map(() => null)), false);
    assert.equal(fieldSolved(level, level.solution.slice(1)), false);
    const counts = fieldCounts(level, level.solution);
    assert.equal(counts.rows.reduce((a, b) => a + b, 0), counts.cols.reduce((a, b) => a + b, 0));
  }
});

test('菜地拒绝越界和重叠，失败后保留原位置且仍可改正', () => {
  const level = FIELD_LEVELS[1], start = level.pieces.map(() => null);
  const first = moveFieldPiece(level, start, 0, [0, 0]);
  assert.deepEqual(start, [null, null, null]);
  assert.equal(moveFieldPiece(level, first, 1, [0, 1]), null);
  assert.equal(moveFieldPiece(level, first, 0, [6, 0]), null);
  assert.equal(moveFieldPiece(level, first, 0, [0, 4]), null);
  assert.equal(moveFieldPiece(level, first, 1, [-1, 0]), null);
  assert.equal(moveFieldPiece(level, first, 1, [1.5, 0]), null);
  assert.equal(moveFieldPiece(level, first, 12, [0, 0]), null);
  assert.equal(fieldCells(level, [[0, 0], [0, 0], null]), null);
  const second = moveFieldPiece(level, first, 1, [3, 1]);
  assert.equal(fieldSolved(level, moveFieldPiece(level, second, 2, [5, 4])), true);
});

test('菜地按行列计数验收，同尺寸菜苗换位仍能过关', () => {
  const level = FIELD_LEVELS[2], alternative = level.solution.map((p) => [...p]);
  [alternative[2], alternative[3]] = [alternative[3], alternative[2]];
  assert.notDeepEqual(alternative, level.solution);
  assert.equal(fieldSolved(level, alternative), true);
  const wrong = moveFieldPiece(FIELD_LEVELS[0], FIELD_LEVELS[0].solution, 1, [2, 3]);
  assert.ok(wrong);
  assert.equal(fieldSolved(FIELD_LEVELS[0], wrong), false);
});

test('五轮连线可通过逐条点击完成，度数达到上限后不再加边', () => {
  for (const level of THREAD_LEVELS) {
    let edges = [];
    for (const [a, b] of level.edges) {
      edges = toggleThread(level, edges, a, b);
      assert.ok(edges);
    }
    assert.equal(threadSolved(level, edges), true);
    assert.deepEqual(threadDegrees(level, edges), threadDegrees(level));
    const missing = level.dots.flatMap((_, a) => level.dots.map((_, b) => [a, b]))
      .find(([a, b]) => a !== b && !edges.some(([x, y]) => x === a && y === b || x === b && y === a));
    assert.equal(toggleThread(level, edges, ...missing), null);
  }
});

test('重复点击同一条边可撤销，自环和不存在的点不会改变结果', () => {
  const level = THREAD_LEVELS[0], edges = toggleThread(level, [], 0, 2);
  assert.deepEqual(toggleThread(level, edges, 2, 0), []);
  assert.deepEqual(edges, [[0, 2]]);
  assert.equal(toggleThread(level, edges, 0, 0), null);
  assert.equal(toggleThread(level, edges, 0, 99), null);
});

test('满足度数但分裂成两个闭环不能过关，另一条连通环可以过关', () => {
  const level = THREAD_LEVELS[0];
  const disconnected = [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3]];
  assert.deepEqual(threadDegrees(level, disconnected), threadDegrees(level));
  assert.equal(threadSolved(level, disconnected), false);
  const alternative = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]];
  assert.equal(threadSolved(level, alternative), true);
  assert.equal(threadSolved(level, [...level.edges, [0, 2]]), false);
  assert.equal(threadSolved(level, [[0, 99]]), false);
});
