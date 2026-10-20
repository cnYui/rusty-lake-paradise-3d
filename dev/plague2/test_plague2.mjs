// 第二灾规则验收：依据参考视频核对配对和跳跃约束，并验证中途进度可序列化。
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPAWN, SPAWN_PAIRS, LILY_LEVELS, lilyJump, lilyTargets, checkLilyPath, DIAL, dialNext, dialSolved, IDA_COLORS } from '../../src/chapters/plague2/puzzles.js';

test('蛙卵六对与视频一致，先后顺序和配对次序均可改变', () => {
  assert.deepEqual(SPAWN_PAIRS, [[7, 9], [1, 12], [4, 10], [3, 11], [2, 8], [5, 6]]);
  for (let orientation = 0; orientation < 64; orientation++) {
    let state = { mask: 0xfff, pending: 0 };
    const pairs = [...SPAWN_PAIRS].reverse();
    for (let j = 0; j < pairs.length; j++) {
      const [a, b] = orientation & (1 << j) ? [...pairs[j]].reverse() : pairs[j];
      state = SPAWN.press(state, a);
      assert.equal(state.kind, 'first');
      assert.equal(state.pending, a);
      state = SPAWN.press(JSON.parse(JSON.stringify(state)), b);
      assert.equal(state.kind, j === pairs.length - 1 ? 'win' : 'pair');
      assert.equal(state.pending, 0);
    }
    assert.equal(state.mask, 0);
  }
});

test('错配会弹回之前配好的全部蛙卵，无效点击保留首选', () => {
  let state = SPAWN.press(SPAWN.press({}, 7), 9);
  assert.equal(SPAWN.isOn(state.mask, 7), false);
  state = SPAWN.press(state, 1);
  const saved = JSON.parse(JSON.stringify(state));
  for (const i of [0, 13, -1, 1.5, 1, 7]) {
    assert.deepEqual(SPAWN.press(saved, i), { ...saved, kind: 'ignored' });
  }
  const failed = SPAWN.press(saved, 2);
  assert.deepEqual(failed, { mask: 0xfff, pending: 0, kind: 'fail' });
  assert.equal(SPAWN.list(failed.mask).length, 12);
  assert.deepEqual(state, saved);
});

test('五关睡莲逐跳验收，早到终点、斜跳和重踩都不能过关', () => {
  for (const level of LILY_LEVELS) assert.equal(checkLilyPath(level, level.solution).ok, true);
  const level = LILY_LEVELS[0];
  const first = lilyJump(level, level.pads, level.start, [3, 1]);
  assert.equal(first.kind, 'move');
  assert.deepEqual(level.pads, [[2, 1], [3, 1], [4, 1]]);
  assert.equal(lilyJump(level, first.padsLeft, [3, 1], [4, 2]).kind, 'illegal');
  assert.equal(lilyJump(level, first.padsLeft, [4, 1], [3, 1]).kind, 'illegal');
  const second = lilyJump(level, first.padsLeft, [3, 1], [2, 1]);
  assert.equal(lilyJump(level, second.padsLeft, [2, 1], level.goal).kind, 'fail');
});

test('睡莲接受其它合法路线，中途存档还原后仍可完成', () => {
  const level = LILY_LEVELS[3], paths = [];
  const walk = (from, left, path) => {
    for (const to of lilyTargets(level, left, from)) {
      const next = lilyJump(level, left, from, to);
      if (next.kind === 'win') paths.push([...path, to]);
      else if (!next.stuck && paths.length < 2) walk(to, next.padsLeft, [...path, to]);
      if (paths.length >= 2) return;
    }
  };
  walk(level.start, level.pads, []);
  assert.equal(paths.length, 2);
  assert.notDeepEqual(paths[0], paths[1]);
  for (const path of paths) {
    let from = level.start, left = level.pads;
    path.forEach((to, i) => {
      const restored = JSON.parse(JSON.stringify({ from, left }));
      const next = lilyJump(level, restored.left, restored.from, to);
      assert.equal(next.kind, i === path.length - 1 ? 'win' : 'move');
      from = to; left = next.padsLeft;
    });
  }
});

test('转盘两圈独立，绕一整圈可回原位，两圈同时对齐才解锁', () => {
  let mid = DIAL.mid.start, out = DIAL.out.start;
  for (let i = 0; i < 5; i++) mid = dialNext('mid', mid);
  assert.equal(dialSolved(mid, out), false);
  for (let i = 0; i < 4; i++) out = dialNext('out', out);
  assert.equal(dialSolved(mid, out), true);
  for (const ring of ['mid', 'out']) {
    let step = DIAL[ring].start;
    for (let i = 0; i < DIAL[ring].steps; i++) step = dialNext(ring, step);
    assert.equal(step, DIAL[ring].start);
  }
  assert.deepEqual(IDA_COLORS, ['lime', 'orange', 'green', 'teal', 'lime', 'orange']);
});
