// 提示：每章的 hints.js 是一张任务表（id / after 前置 / done 判断 / text 文字），这里只做纯函数计算，
// 不碰 DOM，node 里也能直接 import 测试。设计见 docs/ai/context/20261025-133000-leyuan-hint-design.md。
//
// 任务 = { id, after: [前置任务 id], done: (s) => 布尔, text }，s 只有 flag(key) 和 has(itemId)（就是 state）。
// 状态全部来自 flags / 物品栏，所以读档后提示和读档前一致。

/** 任务做完了没有（done 出错一律当没做完）。 */
export function isDone(task, s) {
  try { return !!task.done(s); } catch { return false; }
}

/** 可以提示的任务：自己没做完，且所有前置都做完了；顺序就是表里的顺序（优先级）。 */
export function pendingHints(tasks, s) {
  const done = new Map(tasks.map((t) => [t.id, isDone(t, s)]));
  return tasks.filter((t) => !done.get(t.id) && (t.after || []).every((id) => done.get(id) !== false));
}

/**
 * 下一条提示。status：
 *   'task'     还有要做的事，task / text 是最该做的那一条；
 *   'complete' 本章已通关，不需要提示（调用方不必放广告）；
 *   'none'     本章没有提示表；
 *   'stuck'    没通关却找不到可做的任务（提示表漏了前置或旗标，测试里会抓到），给兜底文案。
 */
export function nextHint(chapter, s) {
  const tasks = (chapter && chapter.hints) || [];
  const flag = (chapter && (chapter.completeFlag || `${chapter.id}_complete`)) || '';
  if (flag && s.flag(flag)) return { status: 'complete', task: null, text: '这一章已经通关了。' };
  if (!tasks.length) return { status: 'none', task: null, text: '这一章暂时没有提示。' };
  const [task] = pendingHints(tasks, s);
  if (task) return { status: 'task', task, text: task.text };
  return { status: 'stuck', task: null, text: '暂时想不出更多线索，到各处再仔细看看。' };
}
