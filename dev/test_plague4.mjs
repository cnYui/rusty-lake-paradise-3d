// 验证导向规则的失败边界与完整解法，避免动画或自动流程掩盖谜题不可解。
import test from 'node:test';
import assert from 'node:assert/strict';
import { CRAB_LEVELS, initialShells, canPlaceShell, traceCrab, windowSolved } from '../src/chapters/plague4/puzzles.js';

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
