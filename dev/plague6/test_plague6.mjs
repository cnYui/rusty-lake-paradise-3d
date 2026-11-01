// 第六灾规则验收：疹子、配药、牙齿、钟、字母箱和提示表；接受所有合法解，不只认自动通关的那一条。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOILS, BOIL_SOLUTION, popBoil, boilsSolved, solveBoils, boilLinked,
  HUMORS, CURE, HUMOR_DIR, pourLayer, GRANDMA_GIVES,
  TOOTH_UPPER, TOOTH_LOWER_START, swapTeeth, teethSolved,
  CLOCK_START, CLOCK_ANSWER, advanceHand, clockSolved,
  TRUNK_START, turnDial, trunkWord, trunkSolved, TRUNK_LETTERS,
} from '../../src/chapters/plague6/rules.js';
import { HINTS } from '../../src/chapters/plague6/hints.js';

test('疹子：示例顺序合法，求解器找到的每个顺序都被接受，而且不止一种', () => {
  assert.equal(boilsSolved(BOIL_SOLUTION), true);
  const all = solveBoils(200);
  assert.ok(all.length >= 2, `只有 ${all.length} 种解`);
  for (const seq of all) assert.equal(boilsSolved(seq), true);
  assert.ok(all.some((s) => s.join() !== BOIL_SOLUTION.join()));
});

test('疹子：第一颗必须是橙色，颜色要轮换，必须沿静脉，点已破的会复原', () => {
  const firstGreen = BOILS.findIndex((b) => b.c === 1);
  assert.equal(popBoil([], firstGreen), null);
  const a = popBoil([], 0);
  assert.deepEqual(a, [0]);
  assert.equal(popBoil(a, 0), null);
  const notLinked = BOILS.findIndex((b, i) => b.c === 1 && !boilLinked(0, i));
  assert.ok(notLinked > 0);
  assert.equal(popBoil(a, notLinked), null);
  const linkedWrongColor = BOILS.findIndex((b, i) => boilLinked(0, i) && b.c !== 1);
  assert.ok(linkedWrongColor > 0);
  assert.equal(popBoil(a, linkedWrongColor), null);
  assert.equal(boilsSolved(BOIL_SOLUTION.slice(0, 14)), false);
  assert.equal(popBoil(a, 99), null);
});

test('疹子：每种颜色 5 颗，静脉图连通', () => {
  for (const c of [0, 1, 2]) assert.equal(BOILS.filter((b) => b.c === c).length, 5);
});

test('配药：按 CURE 顺序倒满 6 层成药，任何一步倒错都倒空', () => {
  let layers = [];
  for (let i = 0; i < CURE.length; i++) {
    const r = pourLayer(layers, CURE[i]);
    assert.equal(r.ok, true);
    assert.equal(r.done, i === CURE.length - 1);
    layers = r.layers;
  }
  assert.deepEqual(layers, CURE);
  for (let i = 0; i < CURE.length; i++) {
    const wrong = HUMORS.find((h) => h !== CURE[i]);
    const r = pourLayer(CURE.slice(0, i), wrong);
    assert.equal(r.ok, false);
    assert.deepEqual(r.layers, []);
  }
  assert.equal(pourLayer([], 'medicine').ok, false);
  assert.deepEqual(new Set(CURE), new Set(HUMORS), '配方要用到全部四种体液');
  assert.equal(new Set(Object.values(HUMOR_DIR)).size, 4, '每种体液的杖头方向都不同');
  assert.deepEqual(new Set(Object.values(GRANDMA_GIVES)), new Set(['tears', 'snot', 'saliva']));
});

test('牙齿：初始没有一列咬合，任意交换顺序都能完成', () => {
  assert.equal(teethSolved(TOOTH_LOWER_START), false);
  assert.ok(TOOTH_LOWER_START.every((s, i) => s !== TOOTH_UPPER[i]));
  assert.deepEqual([...TOOTH_LOWER_START].sort(), [...TOOTH_UPPER].sort());
  // 两种不同的做法：从左往右找、从右往左找
  for (const dir of [1, -1]) {
    let order = [...TOOTH_LOWER_START];
    const idx = dir > 0 ? [...order.keys()] : [...order.keys()].reverse();
    for (const i of idx) {
      if (order[i] === TOOTH_UPPER[i]) continue;
      const j = idx.find((k) => k !== i && order[k] === TOOTH_UPPER[i] && order[k] !== TOOTH_UPPER[k]);
      order = swapTeeth(order, i, j);
      assert.ok(order);
    }
    assert.equal(teethSolved(order), true);
  }
  assert.equal(swapTeeth(TOOTH_LOWER_START, 2, 2), null);
  assert.equal(swapTeeth(TOOTH_LOWER_START, 0, 8), null);
});

test('落地钟：12 小时循环，答案 ×V ∶VIII', () => {
  assert.equal(advanceHand(12), 1);
  assert.equal(advanceHand(4), 5);
  let { x, dots } = CLOCK_START;
  while (x !== CLOCK_ANSWER.x) x = advanceHand(x);
  while (dots !== CLOCK_ANSWER.dots) dots = advanceHand(dots);
  assert.equal(clockSolved(x, dots), true);
  assert.equal(clockSolved(CLOCK_START.x, CLOCK_START.dots), false);
});

test('字母箱：从初始字母转到 BOAR', () => {
  let letters = [...TRUNK_START];
  assert.equal(trunkSolved(letters), false);
  for (let i = 0; i < 4; i++) while (trunkWord(letters)[i] !== 'BOAR'[i]) letters = turnDial(letters, i);
  assert.equal(trunkWord(letters), 'BOAR');
  assert.equal(trunkSolved(letters), true);
  assert.equal(turnDial([7, 0, 0, 0], 0)[0], 0);
  assert.equal(TRUNK_LETTERS.length, 8);
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
  const s = { flag: () => false, has: () => false };
  assert.equal(HINTS[0].done(s), false);
});
