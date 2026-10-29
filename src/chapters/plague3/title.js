// 开场标题（原作 0:01–0:12）：总览远景上叠两行黑字。第一行淡入并略微上移，第二行从画面底边外滑上来；之后静止。
// 任意点击 / 按键、离开总览或约 12 秒后淡出。写法同第二灾（plague2/index.js 的 chapterTitle）：用自己的 DOM（沿用 .title-text 的样式），
// 不占用 ui.title；整段只用一个 animate 任务（跟随 timeScale）。
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const outCubic = (k) => 1 - Math.pow(1 - k, 3);
const outSine = (k) => Math.sin((k * Math.PI) / 2);

export function chapterTitle(ctx, lines, { holdMs = 9000 } = {}) {
  const IN = 2600, OUT = 800, OUT_SKIP = 350;
  const vp = ctx.ui.vp;
  vp.querySelectorAll('.p3-title').forEach((e) => e.remove());
  const box = document.createElement('div');
  box.className = 'title-text show p3-title';
  // 原作两行字中心分别在画面高度的 76% / 86%：45em 高的视口里约 34.3em / 38.5em
  box.style.top = '32.2em';
  const els = lines.map((t) => {
    const d = document.createElement('div');
    d.className = 'line';
    d.textContent = t;
    d.style.lineHeight = '1.72';
    d.style.willChange = 'transform, opacity';
    box.appendChild(d);
    return d;
  });
  vp.appendChild(box);

  let skip = false;
  const onInput = () => { skip = true; };
  const evOpts = { capture: true, passive: true };
  window.addEventListener('pointerdown', onInput, evOpts);
  window.addEventListener('keydown', onInput, evOpts);
  const offView = ctx.state.on('view', ({ id }) => { if (id !== 'overview') skip = true; });
  const offReset = ctx.state.on('reset', () => { skip = true; });

  // t：开场后的毫秒数
  const pose = (t) => {
    const [l1, l2] = els;
    if (l1) {
      l1.style.opacity = String(clamp01(t / 700));
      l1.style.transform = `translateY(${((1 - outSine(clamp01(t / 2000))) * 1.1).toFixed(3)}em)`;
    }
    if (l2) {
      const k = outCubic(clamp01((t - 1100) / 1400));
      l2.style.opacity = t >= 1100 ? '1' : '0';
      l2.style.transform = `translateY(${((1 - k) * 9).toFixed(3)}em)`;   // 从视口底边外（约 9em 以下）滑上来
    }
  };
  pose(0);

  return new Promise((resolve) => {
    let done = false, skipAt = null;
    const TOTAL = IN + holdMs + OUT;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('pointerdown', onInput, evOpts);
      window.removeEventListener('keydown', onInput, evOpts);
      offView(); offReset();
      box.remove();
      resolve();
    };
    ctx.animate(TOTAL, (k) => {
      if (done) return;
      const t = k * TOTAL;
      if (skip && skipAt === null) skipAt = t;
      const outStart = skipAt !== null ? skipAt : IN + holdMs;
      const outMs = skipAt !== null ? OUT_SKIP : OUT;
      pose(skipAt !== null ? Math.max(t, IN) : t);       // 跳过时直接摆到最终位置再淡出
      const fo = clamp01((t - outStart) / outMs);
      box.style.opacity = String(1 - fo);
      if (fo >= 1) finish();
    }, (k) => k).then(finish, finish);
  });
}
