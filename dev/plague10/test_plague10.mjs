// 第十灾规则验收：鼓的节奏、骨箭合成、Ida 的脸、孵小鸡、食丸骨头字母、字母门、六边形、面具和提示表；接受所有合法解，不只认自动通关的那一条。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  RHYTHM, drumHit, drumDone, ARROW_RECIPES, combineArrow,
  FACE_CYCLE, FACE, FACE_START, paintStripe, faceDone, faceClicks, hatches,
  BONE_LETTERS, BONES_START, turnBones, bonesRead, bonesClicks,
  LETTERS, LETTER_WORD, LETTERS_START, readLetters, turnLetter, lettersOpen, letterClicks,
  HEX_START, turnHex, hexDone, hexClicks, PEOPLE, MASK_OF, MASKS, maskFits, allMasked,
} from '../../src/chapters/plague10/rules.js';
import { HINTS } from '../../src/chapters/plague10/hints.js';
import { pendingHints } from '../../src/core/hints.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const play = (seq, step = 0) => seq.reduce((s, side) => drumHit(s, side), step);
/** 从 step 起照 seq 敲，中途有没有敲成过（敲成以后鼓就不再响应，后面的不算）。 */
const reaches = (seq, step = 0) => { let s = step; for (const side of seq) { s = drumHit(s, side); if (drumDone(s)) return true; } return false; };

test('鼓：照 Nicholas 的节奏敲完就开；敲错从头来，错过之后再完整敲一遍一定能开', () => {
  assert.equal(RHYTHM.length, 5);
  RHYTHM.forEach((s) => assert.ok(s === 'L' || s === 'R'));
  assert.ok(RHYTHM.includes('L') && RHYTHM.includes('R'), '左右都要有');
  assert.equal(drumDone(play(RHYTHM)), true);
  assert.equal(drumDone(play(RHYTHM.slice(0, -1))), false);
  // 每一拍敲错：状态回到 0（或者敲错的这一下正好是第一拍，就算开了个头）
  for (let i = 0; i < RHYTHM.length; i++) {
    const wrong = RHYTHM[i] === 'L' ? 'R' : 'L';
    const after = drumHit(play(RHYTHM.slice(0, i)), wrong);
    assert.equal(after, wrong === RHYTHM[0] ? 1 : 0, `第 ${i + 1} 拍敲错`);
    assert.equal(reaches(RHYTHM, after), true, `第 ${i + 1} 拍敲错以后重新敲一遍`);
  }
  // 乱敲 12 下以内的任意序列之后，接着完整敲一遍都能开（不会卡在一个永远开不了的状态）
  for (let n = 0; n <= 12; n++) {
    for (let m = 0; m < 1 << n; m++) {
      const seq = Array.from({ length: n }, (_, k) => ((m >> k) & 1 ? 'R' : 'L'));
      if (reaches(seq)) continue;
      assert.equal(reaches(RHYTHM, play(seq)), true, seq.join(''));
    }
  }
  // 非法的步数当 0
  assert.equal(drumHit(undefined, RHYTHM[0]), 1);
  assert.equal(drumHit(-3, RHYTHM[0]), 1);
});

test('骨箭：箭杆、羽毛、尖骨头三样按任意顺序合成都得到骨箭，少一样不行', () => {
  const parts = ['arrow_shaft', 'feather', 'bone_tip'];
  for (const first of ['feather', 'bone_tip']) {
    const second = first === 'feather' ? 'bone_tip' : 'feather';
    const mid = combineArrow('arrow_shaft', first);
    assert.ok(mid, first);
    assert.equal(combineArrow(mid, second), 'bone_arrow');
    assert.equal(combineArrow(second, mid), 'bone_arrow', '对调顺序');
  }
  assert.equal(combineArrow('feather', 'bone_tip'), null, '没有箭杆不能合');
  assert.equal(combineArrow('bone_arrow', 'feather'), null);
  assert.equal(combineArrow('arrow_fletched', 'feather'), null, '同一样零件不能装两次');
  for (const [a, b] of ARROW_RECIPES) assert.ok(parts.includes(b), b);
});

test('Ida 的脸：照面具画上的五道竖条，每道点一下换一种颜色，点三下回到原色', () => {
  assert.equal(FACE.length, 5);
  assert.deepEqual(FACE, [...FACE].reverse(), '面具画左右对称');
  FACE.forEach((c) => assert.ok(FACE_CYCLE.includes(c), c));
  assert.equal(faceDone(FACE_START), false);
  let face = [...FACE_START];
  faceClicks(FACE_START).forEach((n, i) => { for (let k = 0; k < n; k++) face = paintStripe(face, i); });
  assert.equal(faceDone(face), true);
  // 从任意配色出发都能画好；每道三下一圈
  for (let m = 0; m < 3 ** 5; m++) {
    const start = Array.from({ length: 5 }, (_, i) => FACE_CYCLE[Math.floor(m / 3 ** i) % 3]);
    let f = [...start];
    faceClicks(start).forEach((n, i) => { for (let k = 0; k < n; k++) f = paintStripe(f, i); });
    assert.equal(faceDone(f), true, start.join(','));
    assert.equal(faceDone(start), FACE.every((c, i) => start[i] === c));
  }
  let f = [...FACE_START];
  for (let k = 0; k < 3; k++) f = paintStripe(f, 2);
  assert.deepEqual(f, FACE_START);
  assert.equal(paintStripe(FACE_START, 5), null);
  assert.equal(paintStripe(null, 0), null);
  assert.equal(paintStripe(['white'], 0), null);
});

test('孵小鸡：蛋在锅里、炉子点着，两样都有才孵，先后随意', () => {
  assert.equal(hatches(true, true), true);
  assert.equal(hatches(true, false), false);
  assert.equal(hatches(false, true), false);
  assert.equal(hatches(undefined, undefined), false);
});

test('食丸里的骨头：四组都摆正才读出 OWLS；O 怎么转都行，S 转半圈也行，W / L 只有一个方向', () => {
  assert.equal(BONE_LETTERS.join(''), 'OWLS');
  assert.equal(bonesRead(BONES_START), false, '开局读不出来');
  let r = [...BONES_START];
  bonesClicks(BONES_START).forEach((n, i) => { for (let k = 0; k < n; k++) r = turnBones(r, i); });
  assert.equal(bonesRead(r), true);
  let solved = 0;
  for (let m = 0; m < 256; m++) {
    const rots = [m & 3, (m >> 2) & 3, (m >> 4) & 3, (m >> 6) & 3];
    if (bonesRead(rots)) solved++;
    let x = [...rots];
    bonesClicks(rots).forEach((n, i) => { assert.ok(n <= 3); for (let k = 0; k < n; k++) x = turnBones(x, i); });
    assert.equal(bonesRead(x), true, rots.join(','));
  }
  assert.equal(solved, 4 * 1 * 1 * 2, 'O 四个方向 × W 一个 × L 一个 × S 两个');
  assert.equal(turnBones(BONES_START, 4), null);
  assert.equal(turnBones(null, 0), null);
});

test('字母门：每列六个字母循环，只有拼成 OWLS 才开，开局不是', () => {
  assert.equal(LETTER_WORD, BONE_LETTERS.join(''), '门上的词就是骨头摆出的词');
  LETTERS.forEach((col, i) => {
    assert.equal(new Set(col).size, col.length, `第 ${i + 1} 列字母重复`);
    assert.ok(col.includes(LETTER_WORD[i]), `第 ${i + 1} 列没有 ${LETTER_WORD[i]}`);
  });
  assert.equal(lettersOpen(LETTERS_START), false);
  let open = 0;
  for (let m = 0; m < 6 ** 4; m++) {
    const idx = [0, 1, 2, 3].map((i) => Math.floor(m / 6 ** i) % 6);
    if (lettersOpen(idx)) open++;
  }
  assert.equal(open, 1, '只有一种拼法');
  let idx = [...LETTERS_START];
  letterClicks(LETTERS_START).forEach((n, i) => { for (let k = 0; k < n; k++) idx = turnLetter(idx, i); });
  assert.equal(readLetters(idx), 'OWLS');
  let w = [...LETTERS_START];
  for (let k = 0; k < 6; k++) w = turnLetter(w, 3);
  assert.deepEqual(w, LETTERS_START);
  assert.equal(turnLetter(LETTERS_START, 4), null);
  assert.equal(readLetters(null), '');
});

test('六边形：七块每点一下转 60°，七块都转正才拼成红猫头鹰；开局每块都是歪的', () => {
  assert.equal(HEX_START.length, 7);
  HEX_START.forEach((v) => assert.ok(v > 0 && v < 6));
  assert.equal(hexDone(HEX_START), false);
  let h = [...HEX_START];
  hexClicks(HEX_START).forEach((n, i) => { for (let k = 0; k < n; k++) h = turnHex(h, i); });
  assert.equal(hexDone(h), true);
  // 任意一块差一格都不算
  for (let i = 0; i < 7; i++) { const x = Array(7).fill(0); x[i] = 1; assert.equal(hexDone(x), false); }
  let c = [...HEX_START];
  for (let k = 0; k < 6; k++) c = turnHex(c, 0);
  assert.deepEqual(c, HEX_START);
  assert.equal(turnHex(HEX_START, 7), null);
  assert.equal(hexDone([0, 0, 0]), false);
});

test('面具：五个人各有一副，给对了才接，五个都戴上（顺序随意）才唤醒木头猫头鹰', () => {
  assert.equal(PEOPLE.length, 5);
  assert.equal(new Set(MASKS).size, 5);
  assert.deepEqual(Object.keys(MASK_OF).sort(), [...PEOPLE].sort());
  for (const p of PEOPLE) for (const m of MASKS) assert.equal(maskFits(p, m), MASK_OF[p] === m, `${p} ${m}`);
  assert.equal(maskFits('caroline', 'mask_deer'), false);
  assert.equal(allMasked(['gerard', 'david', 'ida', 'margaret']), false);
  assert.equal(allMasked([...PEOPLE].reverse()), true);
  assert.equal(allMasked(null), false);
});

test('提示表：前置都排在前面，开局有起点，按通关顺序一路都有提示可给，通关后全部完成', () => {
  const ids = HINTS.map((h) => h.id);
  assert.equal(new Set(ids).size, ids.length);
  const seen = new Set();
  for (const h of HINTS) {
    for (const a of h.after) assert.ok(seen.has(a), `${h.id} 的前置 ${a} 必须排在它前面`);
    seen.add(h.id);
  }
  assert.ok(HINTS.every((h) => h.done({ flag: () => true, has: () => true })));
  // 照自动通关的顺序一个个立旗标：每一步都至少有一条能提示（没有“卡住”），最后全部完成
  const order = [
    'feather_taken', 'shaft_taken', 'brush_taken', 'apple_taken', 'bone_dropped', 'bone_taken', '+bone_arrow',
    'apple_on_head', '-bone_arrow', 'apple_shot', 'worm_taken', 'hen_fed', 'egg_taken', 'face', 'face_done', 'candle_taken',
    'egg_in_pan', 'stove_lit', 'chick_hatched', 'chick_taken', 'owl_fed', 'owls_read', 'letter_door_open',
    ['masks_taken', ['mask_rabbit', 'mask_pheasant', 'mask_deer', 'mask_pigeon', 'mask_boar']], 'hex_done', 'cube_taken',
    ['masked', ['ida', 'gerard', 'david', 'nicholas', 'margaret']], 'all_masked', 'owl_gate_open',
    'holder_open', 'holder_cube', 'holder_closed', 'reflection_seen', 'holder_lowered', 'font_lit', 'vision_seen', 'plague10_complete',
  ];
  const flags = {}, inv = new Set();
  const s = { flag: (k) => flags[k], has: (id) => inv.has(id) };
  assert.ok(pendingHints(HINTS, s).length > 0);
  for (const ev of order) {
    if (Array.isArray(ev)) flags[ev[0]] = ev[1];
    else if (ev[0] === '+') inv.add(ev.slice(1));
    else if (ev[0] === '-') inv.delete(ev.slice(1));
    else flags[ev] = ev === 'face' ? [...FACE_START] : true;
    const open = HINTS.filter((h) => !h.done(s));
    if (open.length) assert.ok(pendingHints(HINTS, s).length > 0, `立起 ${JSON.stringify(ev)} 以后提示卡住了：${open.map((h) => h.id).join(',')}`);
  }
  assert.deepEqual(HINTS.filter((h) => !h.done(s)).map((h) => h.id), []);
});

test('第十灾道具会静态打进小红书包：props_p10.js 里不能出现审核敏感字', () => {
  const src = readFileSync(path.join(ROOT, 'src/art/props_p10.js'), 'utf8');
  for (const ch of ['死', '血']) assert.equal(src.includes(ch), false, ch);
});
