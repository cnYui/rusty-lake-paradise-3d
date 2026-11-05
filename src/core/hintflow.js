// 提示按钮（只在 233 乐园版出现，见 leyuan.js）的流程：点灯泡 → 先算出提示（没有可提示的就不放广告）→ 确认看广告 →
// 激励视频广告（rewardad.js，只有 status 4 才算看完）→ 显示一条提示。广告可以一直看，看一次显示一条（当前最该做的那一条）。
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

/** ui / state / ctx 由 main.js 传入（ctx.chapter 是当前装载的章节）。 */
export function initHints({ ui, state, ctx }) {
  let busy = false;

  const show = (lines) => ui.dialog({ title: '提示', lines });

  ui.on('hint-request', async () => {
    if (busy) return;
    busy = true;
    try {
      const first = nextHint(ctx.chapter, state);
      if (first.status !== 'task') { await show(first.text); return; }      // 通关 / 没有提示表：不放广告
      if (!(await rewardAd.isSupported())) { await show(FAIL_TEXT.unsupported); return; }

      const ok = await ui.dialog({
        title: '提示',
        lines: ['观看一段广告后，可以获得一条提示。'],
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
