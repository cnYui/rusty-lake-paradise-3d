// 每关提示次数的纯逻辑检查（node --test dev/common/test_hint_count.mjs）：不需要浏览器。
// 2026-11-20 用户定：233 版每一关只有 3 次提示，界面上灯泡下面显示 3/3，用完不恢复，用完后每看一次广告换一条。
// 次数按章记在 localStorage（键 rlp3d.hintUsed.<章节 id>）；这里用替身 window / ui 走 hintflow.js 的真实流程。
import test from 'node:test';
import assert from 'node:assert/strict';
import { hintsPerLevel, hintsUsed, hintsLeft, useHint, initHints } from '../../src/core/hintflow.js';

const L1 = 'plague1';
const L2 = 'plague2';

/** 替身 window：perLevel 对应 window.__RLP_HINTS_PER_LEVEL；broken = localStorage 读写都抛错（隐私模式）。 */
function setWindow(perLevel, store = {}, { broken = false } = {}) {
  globalThis.window = {
    __RLP_HINTS_PER_LEVEL: perLevel,
    localStorage: broken
      ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }
      : { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  };
  return store;
}

test('没写 __RLP_HINTS_PER_LEVEL：不限次数（返回 -1），hintsPerLevel 是 0', () => {
  setWindow(undefined);
  assert.equal(hintsPerLevel(), 0);
  assert.equal(hintsLeft(L1), -1);
  setWindow(0);
  assert.equal(hintsLeft(L1), -1);
  setWindow('abc');
  assert.equal(hintsPerLevel(), 0);
});

test('每关 3 次：用一次少一次，用到 0 就是 0；各章互不影响；写进 localStorage', () => {
  const store = setWindow(3);
  assert.equal(hintsPerLevel(), 3);
  assert.equal(hintsLeft(L1), 3);
  useHint(L1);
  assert.equal(hintsLeft(L1), 2);
  assert.equal(store['rlp3d.hintUsed.' + L1], '1');
  useHint(L1); useHint(L1);
  assert.equal(hintsLeft(L1), 0);
  assert.equal(store['rlp3d.hintUsed.' + L1], '3');
  assert.equal(hintsLeft(L2), 3, '第二关还是满的');
  useHint(L1);                      // 多扣也不会变成负的
  assert.equal(hintsLeft(L1), 0);
  assert.equal(hintsUsed(L1), 4);
});

test('退出重进不恢复：localStorage 里已有的已用次数认账（模拟刷新后重新读）', () => {
  setWindow(3, { 'rlp3d.hintUsed.plague_old3': '3' });
  assert.equal(hintsLeft('plague_old3'), 0);
  setWindow(3, { 'rlp3d.hintUsed.plague_old2': '2' });
  assert.equal(hintsLeft('plague_old2'), 1);
});

test('脏数据（非数字 / 负数）当没用过', () => {
  setWindow(3, { 'rlp3d.hintUsed.plague_dirty1': 'abc', 'rlp3d.hintUsed.plague_dirty2': '-5' });
  assert.equal(hintsLeft('plague_dirty1'), 3);
  assert.equal(hintsLeft('plague_dirty2'), 3);
});

test('localStorage 抛错（隐私模式）：照样 3 次，改记内存，不抛错', () => {
  setWindow(3, {}, { broken: true });
  const lv = 'plague_mem';
  assert.equal(hintsLeft(lv), 3);
  useHint(lv); useHint(lv); useHint(lv);
  assert.equal(hintsLeft(lv), 0);
  assert.equal(hintsLeft(lv + '_other'), 3);
});

/** ui 替身：记录 dialog；on('hint-request') 的处理函数存下来，测试里直接调。 */
function fakeUi() {
  const calls = [];
  const handlers = {};
  return {
    calls,
    handlers,
    on(name, fn) { handlers[name] = fn; },
    dialog(opts) { calls.push(opts); const p = Promise.resolve(opts.buttons && opts.buttons.length ? opts.buttons[opts.buttons.length - 1].value : true); p.close = () => {}; return p; },
  };
}
const TASKS = [{ id: 'a', after: [], done: (s) => s.flag('a'), text: '去海滩看看。' }];
const fakeState = (flags = {}) => ({ flag: (k) => flags[k], has: () => false });

test('流程：前 3 次直接给一条提示（带“还剩几次”那行、没有广告按钮），第 4 次不再给提示', async () => {
  const store = setWindow(3);
  const ui = fakeUi();
  const lvl = 'plague_flow';
  initHints({ ui, state: fakeState(), ctx: { chapter: { id: lvl, completeFlag: lvl + '_complete', hints: TASKS } } });
  const want = ['（本关提示还剩 2 次）', '（本关提示还剩 1 次）', '（本关提示用完了，之后每条提示要观看一段广告。）'];
  for (let i = 0; i < 3; i++) {
    await ui.handlers['hint-request']();
    const d = ui.calls[ui.calls.length - 1];
    assert.deepEqual(d.lines, ['去海滩看看。', want[i]], `第 ${i + 1} 次的提示内容`);
    assert.ok(!d.buttons || d.buttons.map((b) => b.label).join() === '知道了', '只有默认的“知道了”按钮，没有广告按钮');
    assert.equal(hintsLeft(lvl), 2 - i);
  }
  assert.equal(store['rlp3d.hintUsed.' + lvl], '3');
  const n = ui.calls.length;
  await ui.handlers['hint-request']();      // 第 4 次：node 里没有 SDK → 说广告不可用，不给提示、不扣次数
  const d4 = ui.calls[n];
  assert.ok(d4 && !JSON.stringify(d4).includes('去大堂看看'), '第 4 次不能直接给提示');
  assert.equal(hintsLeft(lvl), 0);
  assert.equal(store['rlp3d.hintUsed.' + lvl], '3');
});

test('流程：通关 / 没有提示表时不放广告也不扣次数', async () => {
  setWindow(3);
  const ui = fakeUi();
  const lvl = 'plague_none';
  initHints({ ui, state: fakeState(), ctx: { chapter: { id: lvl, hints: [] } } });
  await ui.handlers['hint-request']();
  assert.equal(hintsLeft(lvl), 3);
  const ui2 = fakeUi();
  initHints({ ui: ui2, state: fakeState({ [lvl + '_done_complete']: true }), ctx: { chapter: { id: lvl + '_done', hints: TASKS } } });
  await ui2.handlers['hint-request']();
  assert.equal(hintsLeft(lvl + '_done'), 3);
});

test('流程：没写次数（开发预览）时不扣次数、直接走广告流程', async () => {
  setWindow(undefined);
  const ui = fakeUi();
  const lvl = 'plague_dev';
  initHints({ ui, state: fakeState(), ctx: { chapter: { id: lvl, completeFlag: lvl + '_complete', hints: TASKS } } });
  await ui.handlers['hint-request']();
  const d = ui.calls[ui.calls.length - 1];
  assert.ok(!JSON.stringify(d).includes('去大堂看看'), '没写次数时第 1 次也不能直接给提示');
  assert.equal(hintsLeft(lvl), -1);
});
