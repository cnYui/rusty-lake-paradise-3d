// 通关分享（src/core/share.js）的纯逻辑验收：笔记 / 评论文案的长度和敏感字、打码标题、附加状态大小、能力判断（客户端版本）。
// 画通关卡、调容器接口的整条流程在浏览器里测：python dev/minitool/test_share_xhs.py
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME, NOTE_TITLE_MAX, NOTE_CONTENT_MAX, SNAPSHOT_MAX, chapterName, clip, noteText, commentText, snapshotInfo, shareCaps } from '../../src/core/share.js';
import { CHAPTERS } from '../../src/chapters/index.js';

const len = (s) => Array.from(s).length;
const OPEN = CHAPTERS.filter((c) => c.load && !c.wip);   // 小红书包里开放的章节（wip 章节的 load 在打包副本里置空）

function info(c, over = {}) {
  const ids = c.achievements ? Object.keys(c.achievements) : [];
  return { game: GAME, chapter: { id: c.id, number: c.number, label: c.label, title: c.title }, achGot: ids.length, achTotal: ids.length, cleared: OPEN.length, total: OPEN.length, ...over };
}

test('开放的每一章：笔记标题 ≤ 20 字、正文 ≤ 1000 字，文案里没有审核敏感字', () => {
  assert.ok(OPEN.length >= 5, `开放章节只有 ${OPEN.length} 个`);
  for (const c of OPEN) {
    const { title, content } = noteText(info(c));
    assert.ok(len(title) <= NOTE_TITLE_MAX, `${c.id} 标题 ${len(title)} 字：${title}`);
    assert.ok(title.startsWith('我通关了') && title.includes(c.label.zh), `${c.id} 标题：${title}`);
    assert.ok(len(content) <= NOTE_CONTENT_MAX, `${c.id} 正文 ${len(content)} 字`);
    assert.ok(content.includes(`「${GAME.name}」`) && content.includes(chapterName(c)), `${c.id} 正文：${content}`);
    const comment = commentText(info(c));
    assert.ok(len(comment) <= 140, `${c.id} 评论 ${len(comment)} 字`);
    for (const s of [title, content, comment]) assert.ok(!/[死血]/.test(s), `${c.id} 文案里有敏感字：${s}`);
  }
});

test('成就和通关数写进文案；没有成就表的章节不写“成就”', () => {
  const c = OPEN[OPEN.length - 1];
  const { content } = noteText(info(c, { achGot: 3, achTotal: 5, cleared: 4, total: 5 }));
  assert.match(content, /成就 3 \/ 5/);
  assert.match(content, new RegExp(`${GAME.clearedWord} 4 / 5 ${GAME.unit}`));
  assert.match(commentText(info(c, { achGot: 3, achTotal: 5 })), /成就 3\/5/);
  const bare = { ...info(c, { achGot: 0, achTotal: 0 }) };
  assert.ok(!noteText(bare).content.includes('成就'));
  assert.ok(!commentText(bare).includes('成就'));
});

test('打码的标题（打包副本里换成字母的“x灾”“长子之S”）不写进文案，只写“第几灾”', () => {
  assert.equal(chapterName({ label: { zh: '第一灾' }, title: { zh: 'x灾' } }), '第一灾');
  assert.equal(chapterName({ label: { zh: '第十灾' }, title: { zh: '长子之S' } }), '第十灾');
  assert.equal(chapterName({ label: { zh: '第五灾' }, title: { zh: '疫灾' } }), '第五灾 · 疫灾');
  assert.equal(chapterName({ label: { zh: '第五灾' } }), '第五灾');
  const p1 = CHAPTERS.find((c) => c.id === 'plague1');
  assert.ok(!noteText(info(p1)).content.includes('x灾'));
});

test('标题按字截断，不切坏汉字', () => {
  assert.equal(clip('一二三四五', 3), '一二三');
  assert.equal(clip('ab', 5), 'ab');
  const long = noteText({ ...info(OPEN[0]), game: { ...GAME, short: '很长很长很长很长很长很长很长的名字' } }).title;
  assert.equal(len(long), NOTE_TITLE_MAX);
});

test('评论的附加状态是 JSON、不超过 2 KB，只带章节 id', () => {
  const s = snapshotInfo(info(OPEN[0]));
  assert.ok(s.length > 0 && s.length <= SNAPSHOT_MAX);
  assert.deepEqual(JSON.parse(s), { v: 1, from: 'ending', chapter: OPEN[0].id });
});

test('能力判断：没有 window.xhs 时都不能发；评论要客户端 9.49+，取不到版本按不支持', async () => {
  const saved = globalThis.window;
  try {
    delete globalThis.window;
    assert.deepEqual(await shareCaps(), { note: false, comment: false });
    const mt = { postNote() {}, interactionOpenApi() {} };
    globalThis.window = { xhs: { launchOptions: { miniToolEnv: { buildVersion: 9480012 } }, miniTool: mt } };
    assert.deepEqual(await shareCaps(), { note: true, comment: false }, '9.48 不能发评论');
    globalThis.window = { xhs: { launchOptions: { miniToolEnv: { buildVersion: 9490000 } }, miniTool: mt } };
    assert.deepEqual(await shareCaps(), { note: true, comment: true });
    globalThis.window = { xhs: { miniTool: { ...mt, getLaunchOptions: async () => ({ miniToolEnv: { buildVersion: 9512003 } }) } } };
    assert.deepEqual(await shareCaps(), { note: true, comment: true }, '同步读不到时异步取版本');
    globalThis.window = { xhs: { miniTool: { ...mt, getLaunchOptions: () => new Promise(() => {}) } } };
    assert.deepEqual(await shareCaps(), { note: true, comment: false }, '取版本超时按不支持');
    globalThis.window = { xhs: { miniTool: { interactionOpenApi() {} } } };
    assert.deepEqual(await shareCaps(), { note: false, comment: false }, '没有 postNote、也取不到版本');
  } finally {
    if (saved === undefined) delete globalThis.window; else globalThis.window = saved;
  }
});
