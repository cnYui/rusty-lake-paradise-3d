// 第三灾规则验收：滑块盒、蜂巢、陶轮、捕蝇草、神龛的纯规则（不依赖 three / DOM）。
// 规则依据 docs/plague3_design.md 第 4 节；美术常量和这里的常量是否一致由浏览器里的 RLP.ctx.p3.checkArt() 核对。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SLIDER_START, SLIDER_EYES, SLIDER_SOLUTION, SLIDER_N, sliderRC, sliderIndex, sliderNeighbors, sliderBoard, sliderPress, sliderSolved, sliderSolve, sliderMovable,
  HIVE_ORDER, hivePress, hiveBees,
  POT_START, POT_TARGETS, potPoke, potMatch, potRecipe, potKey, potParse,
  isTrapFood, TRAP_NEEDED,
  shrineUse, shrineComplete, selfTest,
} from '../../src/chapters/plague3/puzzles.js';

const play = (clicks, board = sliderBoard()) => {
  for (const cell of clicks) {
    const r = sliderPress(board, cell);
    assert.ok(r, `第 ${cell} 格此时不能滑`);
    board = r.board;
  }
  return board;
};

test('滑块：26 格行列映射互为反函数，第 3 行只有第 1–5 列', () => {
  assert.equal(SLIDER_N, 26);
  for (let i = 0; i < SLIDER_N; i++) assert.equal(sliderIndex(...sliderRC(i)), i);
  assert.deepEqual(sliderRC(21), [3, 1]);
  assert.deepEqual(sliderRC(25), [3, 5]);
  assert.equal(sliderIndex(3, 0), -1);
  assert.equal(sliderIndex(3, 6), -1);
  assert.equal(sliderIndex(4, 2), -1);
});

test('滑块：只有和空格上下左右相邻的方块能滑，不相邻的点击无效且不改盘面', () => {
  const b = sliderBoard();
  assert.deepEqual(sliderMovable(b).sort((x, y) => x - y), [19, 24]);
  for (const cell of [0, 2, 10, 20, 21, 25, -1, 26, 1.5]) assert.equal(sliderPress(b, cell), null, `格 ${cell}`);
  assert.deepEqual(b, { discs: [2, 10, 20], empty: 25 }, '原盘面不能被改');
  const r = sliderPress(b, 24);
  assert.deepEqual(r.board.empty, 24);
  assert.equal(r.from, 24);
  assert.equal(r.to, 25);
  assert.equal(r.disc, -1);
});

test('滑块：点圆片块滑动时圆片块的位置跟着变（顺序不变）', () => {
  let b = play([19]);                  // 19 是普通方块
  assert.deepEqual(b.discs, [2, 10, 20]);
  b = play([20], b);                   // 20 是圆片块，滑进空格 19
  assert.deepEqual(b.discs, [2, 10, 19]);
  assert.equal(b.empty, 20);
});

test('滑块：设计文档的 23 步参考解合法并且解开，BFS 求出的最短解和它等长', () => {
  const end = play(SLIDER_SOLUTION);
  assert.equal(SLIDER_SOLUTION.length, 23);
  assert.ok(sliderSolved(end));
  assert.deepEqual([...end.discs].sort((a, b) => a - b), [...SLIDER_EYES].sort((a, b) => a - b));
  const bfs = sliderSolve(SLIDER_START);
  assert.equal(bfs.length, 23);
  assert.ok(sliderSolved(play(bfs)));
});

test('滑块：中途盘面（走一半）仍可解，解开不要求空格位置', () => {
  const mid = play(SLIDER_SOLUTION.slice(0, 9));
  assert.equal(sliderSolved(mid), false);
  const rest = sliderSolve(mid);
  assert.ok(rest && rest.length <= 14);
  assert.ok(sliderSolved(play(rest, mid)));
  assert.equal(sliderSolved(SLIDER_START), false);
});

test('滑块：随机滑 400 步后仍然可解，盘面始终是 3 块圆片块 + 1 个空格', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let b = sliderBoard();
  for (let i = 0; i < 400; i++) {
    const moves = sliderMovable(b);
    b = sliderPress(b, moves[Math.floor(rnd() * moves.length)]).board;
    assert.equal(new Set([...b.discs, b.empty]).size, 4);
  }
  const path = sliderSolve(b);
  assert.ok(path, '随机盘面应当可解');
  assert.ok(sliderSolved(play(path, b)));
});

test('蜂巢：任意孔开始，依次点蜜蜂飞出来的孔，第 7 只飞出后完成', () => {
  for (const first of [0, 3, 6]) {
    let r = hivePress(0, first);
    assert.equal(r.kind, 'next');
    assert.equal(r.step, 1);
    assert.equal(r.release, HIVE_ORDER[0]);
    for (let k = 0; k < 6; k++) {
      r = hivePress(r.step, HIVE_ORDER[k]);
      assert.equal(r.kind, k === 5 ? 'done' : 'next');
      assert.equal(r.release, HIVE_ORDER[k + 1]);
    }
    assert.equal(r.step, 7);
  }
  assert.deepEqual(hiveBees(3), HIVE_ORDER.slice(0, 3));
  assert.deepEqual(hiveBees(99), HIVE_ORDER);
});

test('蜂巢：点错孔所有蜜蜂飞回，step 清零；越界和已完成的点击被忽略', () => {
  assert.deepEqual(hivePress(3, (HIVE_ORDER[2] + 1) % 7), { kind: 'wrong', step: 0 });
  assert.equal(hivePress(3, HIVE_ORDER[1]).kind, 'wrong', '点的是更早飞出来的孔也算错');
  assert.equal(hivePress(7, 0).kind, 'ignored');
  assert.equal(hivePress(2, 7).kind, 'ignored');
  assert.equal(hivePress(2, -1).kind, 'ignored');
});

test('陶轮：每点一段换成下一种变体（4 种循环），不影响别的段', () => {
  assert.deepEqual(potPoke([0, 0, 0], 1), [0, 1, 0]);
  assert.deepEqual(potPoke([3, 3, 3], 0), [0, 3, 3]);
  assert.deepEqual(potPoke([1, 2, 3], 5), [1, 2, 3], '越界的段不改');
  let s = [0, 0, 0];
  for (let i = 0; i < 4; i++) s = potPoke(s, 2);
  assert.deepEqual(s, [0, 0, 0]);
});

test('陶轮：两种目标器形都能做出来，中途不会误判，细颈瓶下×2 中×2 上×3、罐下×3 中×3 上×1', () => {
  for (const kind of ['slim', 'urn']) {
    let s = POT_START;
    const clicks = potRecipe(kind);
    assert.equal(clicks.length, 7);
    clicks.forEach((seg, i) => {
      s = potPoke(s, seg);
      assert.equal(potMatch(s), i === clicks.length - 1 ? kind : null, `${kind} 第 ${i + 1} 次`);
    });
    assert.deepEqual(s, POT_TARGETS[kind]);
  }
  assert.deepEqual(potRecipe('slim'), [0, 0, 1, 1, 2, 2, 2]);
  assert.deepEqual(potRecipe('urn'), [0, 0, 0, 1, 1, 1, 2]);
  assert.equal(potMatch([2, 2, 3]), 'slim');
  assert.equal(potMatch([3, 3, 1]), 'urn');
  assert.equal(potMatch([0, 0, 0]), null);
});

test('陶轮：器形可以存成字符串再读回；坏数据回到起始泥团', () => {
  assert.equal(potKey([2, 2, 3]), '2,2,3');
  assert.deepEqual(potParse('2,2,3'), [2, 2, 3]);
  for (const bad of [undefined, null, '', '1,2', '1,2,3,4', 'a,b,c', '4,0,0', '-1,0,0']) assert.deepEqual(potParse(bad), POT_START);
});

test('捕蝇草：四样食物，喂满 4 个开花', () => {
  assert.equal(TRAP_NEEDED, 4);
  for (const id of ['p3_gnats', 'p3_snail', 'p3_mussel', 'p3_ear']) assert.ok(isTrapFood(id), id);
  for (const id of ['p3_honey', 'p3_berries', 'p3_axe', 'black_cube']) assert.equal(isTrapFood(id), false, id);
});

test('神龛：黄花只插左柱，橙花 / 玫瑰要先有花瓶，花瓶放中右柱', () => {
  const st = { vases: [null, null], flowers: [null, null, null] };
  assert.deepEqual(shrineUse(st, 0, 'p3_flower_yellow'), { kind: 'flower', value: 'yellow' });
  assert.equal(shrineUse(st, 1, 'p3_flower_yellow'), null);
  assert.equal(shrineUse(st, 0, 'p3_rose'), null);
  assert.equal(shrineUse(st, 1, 'p3_rose'), null, '柱上没有花瓶');
  assert.deepEqual(shrineUse(st, 1, 'p3_vase_slim'), { kind: 'vase', value: 'slim' });
  assert.deepEqual(shrineUse(st, 2, 'p3_vase_urn'), { kind: 'vase', value: 'urn' });
  assert.equal(shrineUse(st, 0, 'p3_vase_urn'), null, '左柱已有长颈瓶');
  assert.equal(shrineUse(st, 1, 'p3_axe'), null);
  const full = { vases: ['urn', 'slim'], flowers: [null, null, null] };
  assert.deepEqual(shrineUse(full, 1, 'p3_rose'), { kind: 'flower', value: 'rose' }, '玫瑰 / 橙花任意柱、任意组合');
  assert.deepEqual(shrineUse(full, 2, 'p3_flower_orange'), { kind: 'flower', value: 'orange' });
  assert.equal(shrineUse({ ...full, vases: ['urn', 'slim'] }, 1, 'p3_vase_slim'), null, '已有花瓶的柱子不能再放');
});

test('神龛：三朵花都插上才算完成', () => {
  assert.equal(shrineComplete({ vases: ['slim', 'urn'], flowers: ['yellow', 'rose', null] }), false);
  assert.equal(shrineComplete({ vases: ['slim', 'urn'], flowers: ['yellow', 'rose', 'orange'] }), true);
});

test('内置自检全部通过', () => {
  const r = selfTest();
  assert.deepEqual(r.checks.filter((c) => !c.ok), []);
  assert.ok(r.ok);
});
