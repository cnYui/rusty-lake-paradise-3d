// 章节解锁、下一章和“继续哪一章”的规则：标题菜单、通关结尾和启动时选哪一章都用它。
// 只依赖 state（通关记录和存档在 localStorage 里，见 state.js），不 import 章节模块。
//
// 章节注册表（src/chapters/index.js）里的字段：
//   load      没有 = 敬请期待；wip: true = 开发中，只有 ?wip=1 / localStorage rlp3d.wip=1 时开放
//   requires  前置章节 id（一个，或一组：全部通关才解锁）：没通关就不能在菜单里选（第二灾 requires 第一灾，第三灾 requires 第一、二灾）
// 开发 / 测试用：?unlock=1（或 localStorage rlp3d.unlock=1，或 ?wip=1）跳过“前置章节没通关”的锁；?chapter=N 的开发跳转本来就不经过菜单。
import { state } from './state.js';

export function wipEnabled() {
  try { return /[?&]wip(=1|=true)?(&|$)/.test(location.search) || localStorage.getItem('rlp3d.wip') === '1'; } catch { return false; }
}

export function unlockEnabled() {
  try { return wipEnabled() || /[?&]unlock(=1|=true)?(&|$)/.test(location.search) || localStorage.getItem('rlp3d.unlock') === '1'; } catch { return false; }
}

/** 一章的前置章节 id 列表（`requires` 可以写一个 id，也可以写一组）。 */
const requiredIds = (c) => (c && c.requires ? [].concat(c.requires) : []);

/** 章节的通关旗标名（章节对象里的 completeFlag，没写就按 `<id>_complete`）。 */
export const completeFlag = (c) => c.completeFlag || `${c.id}_complete`;

/**
 * 'open' 可以进入 · 'locked' 前置章节还没通关 · 'soon' 尚未开放（没有 load，或开发中且没开 wip）。
 * 前置章节不存在于注册表时（比如小工具里被摘掉的）按没有前置处理，不把玩家锁死。
 */
export function chapterStatus(c, chapters = []) {
  if (!c || !c.load || (c.wip && !wipEnabled())) return 'soon';
  if (requiredIds(c).some((id) => chapters.some((x) => x.id === id) && !state.isCleared(id)) && !unlockEnabled()) return 'locked';
  return 'open';
}

/** 解锁这一章还差通关的那一章（有几个前置就返回第一个没通关的；都通关了返回第一个；没有前置就 null）：菜单提示“通关 X 后解锁”用。 */
export function requiredChapter(c, chapters = []) {
  const need = requiredIds(c).map((id) => chapters.find((x) => x.id === id)).filter(Boolean);
  return need.find((x) => !state.isCleared(x.id)) || need[0] || null;
}

/** 这一章没打完的存档（有存档且还没通关旗标），没有就 null。 */
export function liveSave(c) {
  const d = state.peekSave(c.id);
  return d && !(d.flags && d.flags[completeFlag(c)]) ? d : null;
}

/** 通关 `cur` 之后自动接着玩的那一章：编号 +1 且已经可以进入，否则 null（回主菜单）。 */
export function nextChapter(cur, chapters = []) {
  const n = chapters.find((x) => x.number === cur.number + 1);
  return n && chapterStatus(n, chapters) === 'open' ? n : null;
}

/**
 * 标题菜单的 ▶ 和启动时先装载哪一章：
 *   1. 最近玩的那一章，如果它还没打完；
 *   2. 否则第一个已开放、还没通关的章节（通关第一灾后就是第二灾）；
 *   3. 都通关了就从第一个已开放的章节重玩。
 */
export function resumeChapter(chapters = []) {
  const open = chapters.filter((c) => chapterStatus(c, chapters) === 'open');
  const last = state.lastChapter();
  const lastC = open.find((c) => c.id === last);
  if (lastC && liveSave(lastC)) return lastC;
  return open.find((c) => !state.isCleared(c.id)) || open[0] || chapters[0] || null;
}
