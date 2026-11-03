// 第八灾规则验收：乐手木盒、蝗虫合唱和提示表；接受所有合法解，不只认自动通关的那一条。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTRS, MUSICIANS, BOX_COLUMNS, BOX_START, moveSlider, boxSolved, boxAnswer,
  LOCUST_LEVELS, SCORE, chorusPress, chorusDone, treeOfLevel, LURES,
} from '../../src/chapters/plague8/rules.js';
import { HINTS } from '../../src/chapters/plague8/hints.js';

test('木盒：六列各不相同，每个乐手恰好对上一列，开局没有对上', () => {
  const keys = BOX_COLUMNS.map((c) => c.join(''));
  assert.equal(new Set(keys).size, BOX_COLUMNS.length);
  BOX_COLUMNS.forEach((c) => assert.equal(c.length, ATTRS.length));
  assert.equal(new Set(MUSICIANS.map((m) => m.attrs.join(''))).size, MUSICIANS.length);
  for (const m of MUSICIANS) assert.equal(keys.filter((k) => k === m.attrs.join('')).length, 1, m.id);
  assert.equal(boxSolved(BOX_START), false);
  assert.ok(BOX_START.every((col, i) => col !== boxAnswer()[i]), '开局就有滑块停在正确的列上');
  assert.deepEqual(boxAnswer(), [2, 0, 1]);
  assert.equal(boxSolved(boxAnswer()), true);
});

test('木盒：挪滑块和那一列上的滑块互换，任意顺序都能摆对，只有一种摆法算对', () => {
  assert.deepEqual(moveSlider([0, 1, 2], 0, 2), [2, 1, 0]);
  assert.deepEqual(moveSlider([0, 1, 2], 1, 5), [0, 5, 2]);
  assert.deepEqual(moveSlider([0, 1, 2], 1, 1), [0, 1, 2]);
  assert.equal(moveSlider([0, 1, 2], 3, 0), null);
  assert.equal(moveSlider([0, 1, 2], 0, 6), null);
  assert.equal(moveSlider([0, 1, 2], 0, -1), null);
  assert.equal(moveSlider(null, 0, 1), null);
  const answer = boxAnswer();
  for (const order of [[0, 1, 2], [2, 1, 0], [1, 2, 0]]) {
    let slots = [...BOX_START];
    for (let pass = 0; pass < 2; pass++) for (const i of order) slots = moveSlider(slots, i, answer[i]);
    assert.equal(boxSolved(slots), true, order.join());
  }
  let solved = 0;
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) for (let c = 0; c < 6; c++) {
    if (a !== b && b !== c && a !== c && boxSolved([a, b, c])) solved++;
  }
  assert.equal(solved, 1);
});

test('合唱：五档高度各一只蝗虫，照乐谱点完就孵化；点错从头来', () => {
  assert.deepEqual([...LOCUST_LEVELS].sort(), [1, 2, 3, 4, 5]);
  assert.equal(SCORE.length, 6);
  assert.ok(SCORE.every((level) => treeOfLevel(level) >= 0));
  let step = 0;
  for (const level of SCORE) { assert.equal(chorusDone(step), false); step = chorusPress(step, level); }
  assert.equal(chorusDone(step), true);
  assert.equal(chorusPress(0, 4), 0);                       // 第一个音是 2
  assert.equal(chorusPress(3, 2), 1);                       // 点错的那只正好是第一个音：算开了个头
  assert.equal(chorusPress(3, 9), 0);
  assert.equal(chorusPress(undefined, SCORE[0]), 1);
  assert.equal(chorusPress(99, SCORE[0]), 1);
  // 两只蝗虫不会在同一棵树上，乐谱里相邻的音不重复（听得出差别）
  SCORE.slice(1).forEach((level, i) => assert.notEqual(level, SCORE[i]));
});

test('引螳螂：发光 / 发声的三样东西各对应一个目标', () => {
  assert.deepEqual(Object.keys(LURES).sort(), ['firefly', 'fog_horn', 'glow_moth']);
  assert.equal(new Set(Object.values(LURES)).size, 3);
});

test('提示表：id 唯一、前置都存在且无环、每条都有 done 和 text，通关后全部完成', () => {
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
  assert.ok(HINTS.every((h) => h.done({ flag: () => true, has: () => true })));
});
