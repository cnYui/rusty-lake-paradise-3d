// 第七灾规则验收：冰块、滑冰和提示表；接受所有合法解，不只认自动通关的那一条。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ICE_LEVELS, ICE_SOLUTIONS, pressIce, iceSolved, iceSolvable, iceCell,
  SKATE_LEVELS, SKATE_W, SKATE_H, slide, skateSolve, skateDone, directionTo,
  SNOWMAN_PARTS, DIAMONDS, ICE_CREAM_ORDER,
} from '../../src/chapters/plague7/rules.js';
import { HINTS } from '../../src/chapters/plague7/hints.js';

const count = (cells, c) => cells.join('').split(c).length - 1;

test('冰块：每关可解，示例解合法，立冰不少于平冰', () => {
  ICE_LEVELS.forEach((level, i) => {
    assert.ok(count(level, 'S') >= count(level, 'L'), `第 ${i + 1} 关`);
    assert.equal(iceSolvable(level), true);
    let cells = level;
    for (const [from, to] of ICE_SOLUTIONS[i]) { cells = pressIce(cells, from, to); assert.ok(cells, `第 ${i + 1} 关 ${from}→${to}`); }
    assert.equal(iceSolved(cells), true);
  });
});

test('冰块：任意顺序都接受；至少一关有会走进死局的第一步', () => {
  // 第一关反着顺序做
  let cells = ICE_LEVELS[0];
  for (const [from, to] of [...ICE_SOLUTIONS[0]].reverse()) cells = pressIce(cells, from, to);
  assert.equal(iceSolved(cells), true);
  let traps = 0;
  ICE_LEVELS.forEach((level) => level.forEach((row, y) => [...row].forEach((c, x) => {
    if (c !== 'S') return;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = pressIce(level, [x, y], [x + dx, y + dy]);
      if (next && !iceSolvable(next)) traps++;
    }
  })));
  assert.ok(traps >= 2, `只有 ${traps} 个死局`);
});

test('冰块：不相邻、压已压实的、拿平冰去压都被拒绝', () => {
  const level = ICE_LEVELS[0];
  assert.equal(pressIce(level, [0, 1], [2, 0]), null);
  assert.equal(pressIce(level, [0, 0], [1, 0]), null);
  const once = pressIce(level, [1, 0], [0, 0]);
  assert.equal(iceCell(once, [0, 0]), 'F');
  assert.equal(pressIce(once, [0, 1], [0, 0]), null);
  assert.equal(pressIce(level, [9, 9], [0, 0]), null);
  assert.equal(iceSolved(level), false);
});

test('滑冰：撞到树桩或边缘才停，每关可解且最少步数够多', () => {
  const need = [2, 3, 5];
  SKATE_LEVELS.forEach((level, i) => {
    const path = skateSolve(level);
    assert.ok(path, `第 ${i + 1} 关无解`);
    assert.ok(path.length >= need[i], `第 ${i + 1} 关只要 ${path.length} 步`);
    let p = level.start;
    for (const dir of path) p = slide(level, p, dir);
    assert.equal(skateDone(level, p), true);
    assert.equal(skateDone(level, level.start), false);
    for (const [x, y] of [...level.stumps, level.start, level.target]) assert.ok(x >= 0 && x < SKATE_W && y >= 0 && y < SKATE_H);
  });
  const L = SKATE_LEVELS[0];
  assert.deepEqual(slide(L, [0, 0], 'up'), [0, 0]);
  assert.deepEqual(slide(L, [0, 0], 'right'), [6, 0]);
  assert.deepEqual(slide(L, [0, 0], 'down'), [0, 3]);
  assert.equal(directionTo([2, 2], [5, 2]), 'right');
  assert.equal(directionTo([2, 2], [2, 0]), 'up');
  assert.equal(directionTo([2, 2], [3, 3]), null);
});

test('常量：雪人五个部件、三颗钻石、两种冰淇淋', () => {
  assert.equal(new Set(SNOWMAN_PARTS).size, 5);
  assert.equal(new Set(DIAMONDS).size, 3);
  assert.deepEqual(ICE_CREAM_ORDER, ['strawberry', 'pistachio']);
});

test('提示表：id 唯一、前置都存在且无环、每条都有 done 和 text', () => {
  const ids = HINTS.map((h) => h.id);
  assert.equal(new Set(ids).size, ids.length);
  const seen = new Set();
  for (const h of HINTS) {
    assert.equal(typeof h.done, 'function', h.id);
    assert.ok(h.text && h.text.length > 6, h.id);
    for (const a of h.after) assert.ok(seen.has(a), `${h.id} 的前置 ${a} 必须排在它前面`);
    seen.add(h.id);
  }
  assert.equal(HINTS[0].done({ flag: () => false, has: () => false }), false);
});
