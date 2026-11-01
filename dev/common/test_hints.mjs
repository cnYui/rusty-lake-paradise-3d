// 提示任务表的静态检查（node --test dev/common/test_hints.mjs）：纯数据，不需要浏览器。
// 动态检查（自动通关时每一步都有提示、通关后全部完成）见 dev/common/test_hints_browser.py。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { nextHint, pendingHints, isDone } from '../../src/core/hints.js';
import { isMockMode, normalizeAdResult } from '../../src/core/rewardad.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CHAPTERS = ['plague1', 'plague2', 'plague3', 'plague4', 'plague5', 'plague6', 'plague7'];

/** 状态替身：记录被读过的旗标 / 物品；flags 里没有的旗标读出 undefined。 */
function fakeState(flags = {}, inv = []) {
  const read = { flags: new Set(), items: new Set() };
  return {
    read,
    flag: (k) => { read.flags.add(k); return flags[k]; },
    has: (id) => { read.items.add(id); return inv.includes(id); },
  };
}

/**
 * 本章源码里出现过的旗标名，用来抓拼写错误：引号里的小写标识符，加上模板字符串里的 `p4_${id}_eaten` 这类
 * （转成正则，旗标名匹配其中任意一个就算存在）。返回 { has(name) }。
 */
function chapterFlags(dir) {
  const names = new Set();
  const patterns = [];
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.js') && f.name !== 'hints.js') {
        const src = readFileSync(p, 'utf8');
        for (const m of src.matchAll(/['"`]([a-z][a-z0-9_]+)['"`]/g)) names.add(m[1]);
        for (const m of src.matchAll(/`([a-z][a-z0-9_]*(?:\$\{[^}]*\}[a-z0-9_]*)+)`/g)) {
          const re = m[1].split(/\$\{[^}]*\}/).join('[a-z0-9_]+');   // 旗标名里只有小写字母 / 数字 / 下划线，不需要转义其它字符
          patterns.push(new RegExp(`^${re}$`));
        }
      }
    }
  };
  walk(path.join(ROOT, 'src/chapters', dir));
  return { has: (k) => names.has(k) || patterns.some((re) => re.test(k)) };
}

test('引擎：前置没做完的任务不会被提示，做完前置才出现', () => {
  const tasks = [
    { id: 'a', after: [], done: (s) => s.flag('a'), text: 'A' },
    { id: 'b', after: ['a'], done: (s) => s.flag('b'), text: 'B' },
    { id: 'c', after: ['a'], done: (s) => s.has('c_item'), text: 'C' },
  ];
  assert.deepEqual(pendingHints(tasks, fakeState()).map((t) => t.id), ['a']);
  assert.deepEqual(pendingHints(tasks, fakeState({ a: true })).map((t) => t.id), ['b', 'c']);
  assert.deepEqual(pendingHints(tasks, fakeState({ a: true, b: true }, ['c_item'])).map((t) => t.id), []);
  // done 出错当没做完
  assert.equal(isDone({ done: () => { throw new Error('x'); } }, fakeState()), false);
});

test('引擎：nextHint 的四种状态', () => {
  const ch = { id: 'x', hints: [{ id: 'a', after: [], done: (s) => s.flag('a'), text: 'A' }] };
  assert.equal(nextHint(ch, fakeState()).status, 'task');
  assert.equal(nextHint(ch, fakeState()).text, 'A');
  assert.equal(nextHint(ch, fakeState({ x_complete: true })).status, 'complete');
  assert.equal(nextHint({ id: 'x' }, fakeState()).status, 'none');
  assert.equal(nextHint(ch, fakeState({ a: true })).status, 'stuck');
  assert.equal(nextHint({ ...ch, completeFlag: 'done_flag' }, fakeState({ done_flag: 1 })).status, 'complete');
});

test('广告：状态归一化（status 4 才是奖励，0 / 3 是过程态）', () => {
  const ev = (status) => normalizeAdResult({ adType: 1, code: 0, message: 'success', data: { type: 1, status } });
  assert.equal(ev(4).isRewarded, true);
  for (const s of [0, 1, 2, 3, -1]) assert.equal(ev(s).isRewarded, false, `status ${s}`);
  assert.equal(ev(0).isApiOk, true);
  assert.equal(normalizeAdResult({ code: 500 }).isApiOk, false);
});

test('广告：node 里没有 window 时不能抛错、不进入模拟模式', () => {
  assert.equal(isMockMode(), false);
});

/** 在假的 window 里跑一段，跑完还原。 */
async function withWindow(win, fn) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  globalThis.window = win;
  try { return await fn(); } finally { if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window; }
}
const ev = (status, code = 0) => ({ adType: 1, code, message: 'success', data: { type: 1, status } });

test('广告：真实 SDK 多次回调 0 → 3 → 4 → 4，只在 4 结算一次、不被过程态打断', async () => {
  const { showRewardVideoAd } = await import('../../src/core/rewardad.js');
  const sdk = { isAdSupport: (t, cb) => cb({ code: 0, data: 1 }), showAd: (t, cb) => { setTimeout(() => { cb(ev(0)); cb(ev(3)); cb(ev(4)); cb(ev(4)); }, 5); } };
  const r = await withWindow({ MetaH5Ad: sdk, location: { hostname: 'x.example' } }, () => showRewardVideoAd({ timeoutMs: 2000 }));
  assert.deepEqual([r.success, r.status, r.reason, r.mocked], [true, 4, 'rewarded', false]);
});

test('广告：关闭 / 跳过 / 失败 / code 非 0 / 超时都不给奖励', async () => {
  const { showRewardVideoAd } = await import('../../src/core/rewardad.js');
  const run = (events, timeoutMs = 2000) => {
    const sdk = { isAdSupport: (t, cb) => cb({ code: 0, data: 1 }), showAd: (t, cb) => setTimeout(() => events.forEach((e) => cb(e)), 5) };
    return withWindow({ MetaH5Ad: sdk, location: { hostname: 'x.example' } }, () => showRewardVideoAd({ timeoutMs }));
  };
  assert.equal((await run([ev(0), ev(1)])).reason, 'closed');
  assert.equal((await run([ev(0), ev(2)])).reason, 'skipped');
  assert.equal((await run([ev(-1)])).reason, 'failed');
  assert.equal((await run([ev(0, 500)])).reason, 'failed');
  const t = await run([ev(0), ev(3)], 80);          // 只有过程态，一直等到超时
  assert.deepEqual([t.success, t.reason, t.status], [false, 'timeout', 3]);
});

test('广告：不支持 / 没有 SDK 的真机环境不模拟，直接说不支持', async () => {
  const { showRewardVideoAd, isSupported } = await import('../../src/core/rewardad.js');
  const prod = { location: { hostname: 'game.example.com' } };                 // 线上、没注入档位、没有 SDK
  assert.equal(await withWindow(prod, () => isSupported()), false);
  assert.equal((await withWindow(prod, () => showRewardVideoAd({ pickMock: async () => 'rewarded' }))).reason, 'sdk_missing');
  const unsupported = { MetaH5Ad: { isAdSupport: (t, cb) => cb({ code: 0, data: 0 }), showAd() {} }, location: { hostname: 'localhost' } };
  assert.equal((await withWindow(unsupported, () => showRewardVideoAd())).reason, 'unsupported');   // 有 SDK 就不模拟，即使在 localhost
  assert.equal(await withWindow({ __PM_BUILD_PROFILE__: 'release', location: { hostname: 'x.example' } }, () => isMockMode()), false);
});

test('广告：本机 localhost / 乐园预览（fast）且没有 SDK 才模拟，结果由 pickMock 决定', async () => {
  const { showRewardVideoAd, isSupported } = await import('../../src/core/rewardad.js');
  const local = { location: { hostname: '127.0.0.1' } };
  const fast = { __PM_BUILD_PROFILE__: 'fast', location: { hostname: 'preview.example' } };
  for (const win of [local, fast]) {
    assert.equal(await withWindow(win, () => isMockMode()), true);
    assert.equal(await withWindow(win, () => isSupported()), true);
    const ok = await withWindow(win, () => showRewardVideoAd({ pickMock: async () => 'rewarded' }));
    assert.deepEqual([ok.success, ok.status, ok.reason, ok.mocked], [true, 4, 'rewarded', true]);
    for (const [pick, reason] of [['closed', 'closed'], ['skipped', 'skipped'], ['failed', 'failed'], ['乱写', 'closed']]) {
      const r = await withWindow(win, () => showRewardVideoAd({ pickMock: async () => pick }));
      assert.deepEqual([r.success, r.reason], [false, reason], pick);
    }
    const threw = await withWindow(win, () => showRewardVideoAd({ pickMock: async () => { throw new Error('x'); } }));
    assert.equal(threw.reason, 'closed');
  }
});

for (const dir of CHAPTERS) {
  const file = path.join(ROOT, 'src/chapters', dir, 'hints.js');
  test(`${dir}：提示表结构`, async (t) => {
    if (!existsSync(file)) { t.skip('hints.js 还没有'); return; }
    const { HINTS } = await import(pathToFileURL(file).href);
    assert.ok(Array.isArray(HINTS) && HINTS.length >= 8, `任务太少：${HINTS && HINTS.length}`);
    const ids = HINTS.map((h) => h.id);
    assert.equal(new Set(ids).size, ids.length, 'id 重复');
    ids.forEach((id) => assert.match(id, /^[a-z][a-z0-9_]*$/, `id 格式：${id}`));
    HINTS.forEach((h, i) => {
      assert.equal(typeof h.done, 'function', `${h.id} 缺 done`);
      assert.ok(Array.isArray(h.after), `${h.id} 缺 after`);
      assert.match(h.text || '', /[一-鿿]/, `${h.id} 的 text 要是中文`);
      assert.ok(h.text.length >= 6 && h.text.length <= 120, `${h.id} 的 text 长度 ${h.text.length}`);
      for (const a of h.after) {
        const j = ids.indexOf(a);
        assert.ok(j >= 0, `${h.id} 的前置 ${a} 不存在`);
        assert.ok(j < i, `${h.id} 的前置 ${a} 必须排在它前面（无环）`);
      }
    });
    // 空状态：至少有一个任务可做，且全部是没前置的起点
    const start = pendingHints(HINTS, fakeState());
    assert.ok(start.length >= 1, '空状态下没有可提示的任务');
    assert.ok(start.every((h) => h.after.length === 0));
  });

  test(`${dir}：done 里读的旗标都真的存在`, async (t) => {
    if (!existsSync(file)) { t.skip('hints.js 还没有'); return; }
    const { HINTS } = await import(pathToFileURL(file).href);
    const known = chapterFlags(dir);
    const missing = [];
    for (const h of HINTS) {
      const s = fakeState();
      h.done(s);
      for (const k of s.read.flags) if (!known.has(k) && k !== 'intro_done') missing.push(`${h.id}: ${k}`);
    }
    assert.deepEqual(missing, [], '这些旗标在本章源码里找不到');
  });

  test(`${dir}：通关旗标立起来时最后一条能判定完成`, async (t) => {
    if (!existsSync(file)) { t.skip('hints.js 还没有'); return; }
    const { HINTS } = await import(pathToFileURL(file).href);
    const last = HINTS[HINTS.length - 1];
    const s = fakeState();
    last.done(s);
    assert.ok([...s.read.flags].some((k) => k.endsWith('_complete')), `最后一条 ${last.id} 的 done 要包含通关旗标`);
  });
}
