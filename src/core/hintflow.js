// 提示按钮（只在 233 乐园版出现，见 leyuan.js）的流程：点灯泡 → 先算出提示（没有可提示的就不放广告、不扣次数）→
// 这一关还有次数（233 包在 ark_cfg.js 里写 window.__RLP_HINTS_PER_LEVEL = 3）：直接显示这一条提示，不放广告 →
// 次数用完后：确认看广告 → 激励视频广告（rewardad.js，只有 status 4 才算看完）→ 显示一条提示。
// 广告可以一直看，看一次显示一条（当前最该做的那一条）。
//
// 每关提示次数（2026-11-20 用户定：每一关只有 3 次，界面上灯泡下面显示 3/3 并随使用递减，用完不恢复，用完后每看一次广告换一条）：
// 已用次数按章记在 localStorage（键 rlp3d.hintUsed.<章节 id>：换章互不影响，重新开始这一章、重置进度都不清），存不了（隐私模式）就只记在内存里；
// 只有真的给出一条提示才扣（通关 / 没有提示表 / 广告失败都不扣）；看广告换来的提示不扣次数。
// 没写 __RLP_HINTS_PER_LEVEL（开发时 ?leyuan=1 预览）= 不限次数，每条提示都要看广告，灯泡下面不显示数字。
import { nextHint } from './hints.js';
import { rewardAd } from './rewardad.js';

const FAIL_TEXT = {
  closed: '广告没有看完，没有获得提示。',
  skipped: '广告没有看完，没有获得提示。',
  timeout: '广告确认超时，请稍后再试。',
  sdk_missing: '当前环境暂不支持广告，请在 233 乐园 App 里打开游戏。',
  unsupported: '当前环境暂不支持广告，请在 233 乐园 App 里打开游戏。',
};
const FAIL_DEFAULT = '广告暂时不可用，请稍后再试。';

const KEY_PREFIX = 'rlp3d.hintUsed.';
const memUsed = {};

/** 每一关的提示次数（233 包写 window.__RLP_HINTS_PER_LEVEL；没写 = 0 = 不限次数）。 */
export function hintsPerLevel() {
  const n = Math.floor(Number(typeof window !== 'undefined' ? window.__RLP_HINTS_PER_LEVEL : 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
/** 这一关已经用掉的次数（localStorage 和内存里取大的那个）。 */
export function hintsUsed(levelId) {
  let v = 0;
  try { v = parseInt(window.localStorage.getItem(KEY_PREFIX + levelId), 10) || 0; } catch { v = 0; }
  return Math.max(v, memUsed[levelId] || 0);
}
/** 这一关还剩几次（没开次数限制返回 -1）。 */
export function hintsLeft(levelId) {
  const total = hintsPerLevel();
  return total > 0 ? Math.max(0, total - hintsUsed(levelId)) : -1;
}
export function useHint(levelId) {
  memUsed[levelId] = hintsUsed(levelId) + 1;
  try { window.localStorage.setItem(KEY_PREFIX + levelId, String(memUsed[levelId])); } catch { /* 存不了就只记在内存里 */ }
}

/** 灯泡按钮下面的小字“剩余/总数”（没开次数限制就没有）。样式写在行内：这个数字只在 233 包里出现。 */
function renderCount(levelId) {
  const btn = typeof document !== 'undefined' ? document.querySelector('.hint-btn') : null;
  if (!btn) return;
  const total = hintsPerLevel();
  let c = btn.querySelector('.hint-count');
  if (total <= 0) { if (c) c.remove(); return; }
  if (!c) {
    c = document.createElement('span');
    c.className = 'hint-count';
    const s = c.style;
    s.position = 'absolute'; s.left = '50%'; s.top = '100%'; s.transform = 'translateX(-50%)';
    s.whiteSpace = 'nowrap'; s.fontSize = '1.2em'; s.lineHeight = '1.3'; s.fontWeight = '600'; s.letterSpacing = '0.05em';
    s.padding = '0 0.45em'; s.borderRadius = '0.9em'; s.background = 'rgba(0,0,0,0.6)';
    s.textShadow = '0 0 3px #000'; s.pointerEvents = 'none';
    btn.appendChild(c);
  }
  const left = Math.max(0, total - hintsUsed(levelId));
  c.textContent = `${left}/${total}`;
  c.style.color = left > 0 ? '#f0d890' : '#e57a6a';
  c.setAttribute('data-left', String(left));
}

/** ui / state / ctx 由 main.js 传入（ctx.chapter 是当前装载的章节）。 */
export function initHints({ ui, state, ctx }) {
  let busy = false;
  const levelId = () => (ctx.chapter && ctx.chapter.id) || 'unknown';

  const show = (lines) => ui.dialog({ title: '提示', lines });

  renderCount(levelId());

  ui.on('hint-request', async () => {
    if (busy) return;
    busy = true;
    try {
      const first = nextHint(ctx.chapter, state);
      if (first.status !== 'task') { await show(first.text); return; }      // 通关 / 没有提示表：不放广告

      const total = hintsPerLevel();
      const left = hintsLeft(levelId());
      if (total > 0 && left > 0) {                                           // 这一关还有次数：直接给这一条（不用广告，SDK 没到也能给）
        useHint(levelId());
        renderCount(levelId());
        await show([].concat(first.text, left > 1
          ? `（本关提示还剩 ${left - 1} 次）`
          : '（本关提示用完了，之后每条提示要观看一段广告。）'));
        return;
      }

      if (!(await rewardAd.isSupported())) { await show(FAIL_TEXT.unsupported); return; }

      const ok = await ui.dialog({
        title: '提示',
        lines: [total > 0 ? '本关的提示已用完。观看一段广告后，可以获得一条提示。' : '观看一段广告后，可以获得一条提示。'],
        buttons: [{ label: '取消', value: false, esc: true }, { label: '观看广告', value: true }],
      });
      if (!ok) return;

      // 广告期间挡住游戏（真实广告是原生全屏，这里只是在广告返回前不让玩家继续操作）
      const waiting = ui.dialog({ title: '提示', lines: ['广告加载中……'], buttons: [] });
      let result;
      try {
        result = await rewardAd.showRewardVideoAd({
          pickMock: () => { waiting.close(); return mockPicker(ui); },
        });
      } finally { waiting.close(); }

      if (!result.success) { await show(FAIL_TEXT[result.reason] || FAIL_DEFAULT); return; }
      // 广告看完后再算一次（以此刻的状态为准）
      await show(nextHint(ctx.chapter, state).text);
    } catch (err) {
      console.error('[hint]', err);
    } finally {
      busy = false;
    }
  });
}

/** 本机测试 / 乐园预览里没有真实广告时，让测试者选广告结果（只在 rewardAd.isMockMode() 时会被调用）。 */
async function mockPicker(ui) {
  const v = await ui.dialog({
    title: '模拟广告（仅测试）',
    lines: ['这里没有真实广告，请选择广告结果：'],
    buttons: [
      { label: '中途关闭', value: 'closed', esc: true },
      { label: '跳过广告', value: 'skipped' },
      { label: '播放失败', value: 'failed' },
      { label: '完整观看', value: 'rewarded' },
    ],
  });
  return v;
}
