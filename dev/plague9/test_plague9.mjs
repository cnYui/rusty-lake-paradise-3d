// 第九灾规则验收：啄木鸟、研磨机、篝火影子、星座盘、月相仪、影子蜡烛和提示表；接受所有合法解，不只认自动通关的那一条。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOTS, BARK_SPOT, peckDropsBark, GRIND, grindable, SIGNS, SHADOWS, signOf,
  HANDS, DIAL_START, DIAL_ANSWER, turnHand, dialSolved, dialClicks,
  ORRERY_START, stepOrrery, isEclipse, eclipseClicks, CANDLE_START, CANDLE_ANSWER, candleSolved,
} from '../../src/chapters/plague9/rules.js';
import { HINTS } from '../../src/chapters/plague9/hints.js';

test('啄木鸟：五个疤里只有松树皮那一个会掉树皮', () => {
  assert.ok(BARK_SPOT >= 0 && BARK_SPOT < KNOTS);
  const drops = Array.from({ length: KNOTS }, (_, i) => peckDropsBark(i));
  assert.deepEqual(drops.filter(Boolean).length, 1);
  assert.equal(drops[BARK_SPOT], true);
  assert.equal(peckDropsBark(-1), false);
  assert.equal(peckDropsBark(undefined), false);
});

test('研磨机：五样东西各磨出一种粉，篝火里每种粉对应一个影子', () => {
  assert.deepEqual(Object.keys(GRIND).sort(), ['bark', 'blue_stone', 'bones', 'moon_stone', 'shell']);
  assert.equal(new Set(Object.values(GRIND)).size, 5);
  for (const powder of Object.values(GRIND)) assert.ok(powder in SHADOWS, powder);
  assert.equal(grindable('pickaxe'), false);
  assert.equal(grindable('toString'), false);
  assert.equal(grindable('bones'), true);
  // 四种星座粉末各是不同的星座，骨粉是母亲
  const signs = Object.entries(SHADOWS).filter(([, k]) => k !== 'mother').map(([p]) => signOf(p));
  assert.equal(new Set(signs).size, 4);
  signs.forEach((i) => assert.ok(i >= 0 && i < 12));
  assert.equal(signOf('powder_bone'), -1);
  assert.equal(SIGNS.length, 12);
});

test('星座盘：三根针按火里的星座停，开局没有一根对上，点几下就能拨到', () => {
  assert.deepEqual(DIAL_ANSWER, HANDS.map(signOf));
  assert.deepEqual(DIAL_ANSWER, [0, 6, 2]);
  assert.equal(dialSolved(DIAL_START), false);
  DIAL_START.forEach((v, i) => assert.notEqual(v, DIAL_ANSWER[i]));
  let hands = [...DIAL_START];
  dialClicks(DIAL_START).forEach((n, i) => { for (let k = 0; k < n; k++) hands = turnHand(hands, i); });
  assert.equal(dialSolved(hands), true);
  // 绕一整圈回到原处；非法输入返回 null
  let h = [...DIAL_START];
  for (let k = 0; k < 12; k++) h = turnHand(h, 1);
  assert.deepEqual(h, DIAL_START);
  assert.equal(turnHand(DIAL_START, 3), null);
  assert.equal(turnHand(null, 0), null);
  assert.equal(turnHand([0, 0], 0), null);
  // 任意两根针对上、第三根不对都不开
  for (let i = 0; i < 3; i++) { const w = [...DIAL_ANSWER]; w[i] = (w[i] + 1) % 12; assert.equal(dialSolved(w), false); }
});

test('月相仪：月亮在地球背着太阳的一侧就是月食，任何一个地球位置都算', () => {
  assert.equal(isEclipse(ORRERY_START), false);
  for (let e = 0; e < 8; e++) for (let m = 0; m < 8; m++) assert.equal(isEclipse({ earth: e, moon: m }), e === m);
  let o = { ...ORRERY_START };
  for (let k = 0; k < eclipseClicks(ORRERY_START); k++) o = stepOrrery(o, 'moon');
  assert.equal(isEclipse(o), true);
  // 只转地球也能做到
  o = { ...ORRERY_START };
  let n = 0;
  while (!isEclipse(o)) { o = stepOrrery(o, 'earth'); n++; assert.ok(n <= 8); }
  assert.equal(stepOrrery(ORRERY_START, 'sun'), null);
  assert.equal(stepOrrery(null, 'moon'), null);
  assert.deepEqual(stepOrrery({ earth: 7, moon: 7 }, 'earth'), { earth: 0, moon: 7 });
});

test('影子：蜡烛只有放在天蝎上才对，开局不在那里', () => {
  assert.equal(CANDLE_ANSWER, signOf('powder_red'));
  assert.equal(SIGNS[CANDLE_ANSWER], 'scorpio');
  assert.equal(candleSolved(CANDLE_START), false);
  assert.equal(Array.from({ length: 12 }, (_, i) => candleSolved(i)).filter(Boolean).length, 1);
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
  // 硬试出蜡烛位置（没做月食 / 红月石这一串）也不会让提示卡住
  const brute = new Set(['bark_taken', 'shell_taken', 'blue_stone_taken', 'drawer_open', 'copper_key_taken', 'padlock_open', 'ladder_down', 'shadows_done']);
  const s = { flag: (k) => brute.has(k), has: () => false };
  for (const id of ['eclipse', 'pickaxe', 'moon_stone', 'fire_red', 'shadows']) assert.ok(HINTS.find((h) => h.id === id).done(s), id);
});
