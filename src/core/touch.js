// 触屏输入（手机 / 平板）：
// - 室外漫游时，在画面左侧按住拖动 = 虚拟摇杆（推到底奔跑）；在其它位置拖动 = 转视角
//   （向右拖向右转，松手再拖可以一直转下去）；
// - 固定镜头（总览、室内、特写）里拖动画面只做小幅环视，松手后回正；
// - 手指没怎么移动就抬起 = 轻点，由 hotspots 拾取（摇杆区域也一样）。
// 这里只处理 pointerType 为 touch / pen 的指针，鼠标仍走桌面的“指针靠边转向”。
// 最近一次用的是手指还是鼠标，决定是否显示触屏界面（#stage.touch：摇杆、放大的按钮、可点的物品栏）。
import { ui } from './ui.js';

const SLOP = 12;           // 手指移动超过这么多像素才算拖动（推摇杆 / 转视角），否则算轻点
const STICK_ZONE = 0.42;   // 漫游时在画面左侧这一宽度比例内按下 = 摇杆
const STICK_TRAVEL = 3.2;  // 摇杆推到底时手指离起点的距离（em）
const ZERO = Object.freeze({ x: 0, y: 0 });

const tc = {
  active: false,
  canvas: null,
  el: null,
  knob: null,
  roaming: () => false,
  onActivate: null,
  stick: { id: null, ox: 0, oy: 0, x: 0, y: 0, on: false },
  look: { id: null, sx: 0, sy: 0, lx: 0, ly: 0, dx: 0, dy: 0, on: false },
};

function em() {
  const r = ui.stage ? ui.stage.getBoundingClientRect() : null;
  return (r && r.width / 80) || 16;
}

function isTouch(ev) {
  return ev.pointerType === 'touch' || ev.pointerType === 'pen';
}

function releaseStick() {
  Object.assign(tc.stick, { id: null, x: 0, y: 0, on: false });
  if (!tc.el) return;
  tc.el.classList.remove('on');
  tc.el.style.left = tc.el.style.top = '';
  tc.knob.style.transform = '';
}

function releaseLook() {
  Object.assign(tc.look, { id: null, dx: 0, dy: 0, on: false });
}

function setActive(on) {
  on = !!on;
  if (tc.active === on) return;
  tc.active = on;
  ui.stage?.classList.toggle('touch', on);
  releaseStick();
  releaseLook();
  if (on && tc.onActivate) tc.onActivate();
}

function onDown(ev) {
  if (!isTouch(ev)) return;
  setActive(true);
  const r = tc.canvas.getBoundingClientRect();
  const fx = (ev.clientX - r.left) / (r.width || 1);
  if (tc.stick.id === null && tc.roaming() && fx < STICK_ZONE) {
    Object.assign(tc.stick, { id: ev.pointerId, ox: ev.clientX, oy: ev.clientY, x: 0, y: 0, on: false });
    return;
  }
  if (tc.look.id === null) {
    Object.assign(tc.look, { id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, lx: ev.clientX, ly: ev.clientY, dx: 0, dy: 0, on: false });
  }
}

function onMove(ev) {
  const s = tc.stick;
  if (ev.pointerId === s.id) {
    const dx = ev.clientX - s.ox, dy = ev.clientY - s.oy;
    if (!s.on && Math.hypot(dx, dy) > SLOP) {
      s.on = true;
      // 摇杆底座出现在手指按下的位置
      const v = ui.vp.getBoundingClientRect();
      tc.el.style.left = `${s.ox - v.left}px`;
      tc.el.style.top = `${s.oy - v.top}px`;
      tc.el.classList.add('on');
    }
    if (s.on) {
      const R = STICK_TRAVEL * em();
      let x = dx / R, y = -dy / R;
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      s.x = x;
      s.y = y;
      tc.knob.style.transform = `translate(${x * R}px, ${-y * R}px)`;
    }
    return;
  }
  const L = tc.look;
  if (ev.pointerId !== L.id) return;
  if (!L.on && Math.hypot(ev.clientX - L.sx, ev.clientY - L.sy) > SLOP) {
    // 超过阈值才开始转，阈值内的抖动丢掉，避免轻点时画面一跳
    L.on = true;
    L.lx = ev.clientX;
    L.ly = ev.clientY;
  }
  if (L.on) {
    L.dx += ev.clientX - L.lx;
    L.dy += ev.clientY - L.ly;
    L.lx = ev.clientX;
    L.ly = ev.clientY;
  }
}

function onUp(ev) {
  if (ev.pointerId === tc.stick.id) releaseStick();
  if (ev.pointerId === tc.look.id) releaseLook();
}

export const touch = {
  SLOP,

  /** 是否处于触屏模式（最近一次操作用的是手指 / 触控笔）。 */
  get active() { return tc.active; },
  /** 摇杆方向：x 向右、y 向前（-1..1，推到底长度为 1）；没在推时为 0。 */
  get stick() { return tc.stick.on ? { x: tc.stick.x, y: tc.stick.y } : ZERO; },
  /** 是否正在拖动画面转视角。 */
  get looking() { return tc.look.on; },
  /** 取走上次调用以来拖动视角的位移（像素）。 */
  takeLook() {
    const { dx, dy } = tc.look;
    tc.look.dx = 0;
    tc.look.dy = 0;
    return { dx, dy };
  },

  /**
   * opts.roaming(): 当前是否在室外漫游（决定画面左侧是不是摇杆区）；
   * opts.onActivate(): 切换到触屏模式时调用（例如让桌面的指针靠边转向失效）。
   */
  init(engine, { roaming, onActivate } = {}) {
    tc.canvas = engine.canvas;
    if (roaming) tc.roaming = roaming;
    tc.onActivate = onActivate || null;
    const el = document.createElement('div');
    el.className = 'stick';
    el.innerHTML = '<div class="ring"></div><div class="knob"></div>';
    ui.vp.appendChild(el);
    tc.el = el;
    tc.knob = el.querySelector('.knob');

    const c = tc.canvas;
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onUp);
    // 手指在画布外（物品栏、按钮）按下也算触屏操作；鼠标真正移动时切回桌面界面
    window.addEventListener('pointerdown', (ev) => { if (isTouch(ev)) setActive(true); }, true);
    window.addEventListener('pointermove', (ev) => {
      if (ev.pointerType === 'mouse' && tc.active && (ev.movementX || ev.movementY)) setActive(false);
    }, true);
    window.addEventListener('blur', () => { releaseStick(); releaseLook(); });
    setActive(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  },

  setActive,
};
