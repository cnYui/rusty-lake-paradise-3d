// Engine: renderer + scene + camera + OutlineEffect + the game clock.
// onUpdate(fn(dt, t)) runs every frame with GAME seconds (scaled by timeScale, dt clamped to
// 0.05 s before scaling). onFrame(fn(realDt, realT)) runs with real seconds (UI effects such as
// dust motes and the parallax smoothing that must not speed up in tests).
import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { bindClock } from './tween.js';

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    // 像素比：手机 / 平板最高 1.75（再高画面更细但手机 GPU 吃不消），电脑最高 2。
    // 动态分辨率：持续掉帧时逐级降低像素比（只降不升，避免来回跳）；自动化测试里关闭。
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.maxPixelRatio = Math.min(coarse ? 1.75 : 2, window.devicePixelRatio || 1);
    this.minPixelRatio = Math.min(this.maxPixelRatio, coarse ? 0.75 : 1);
    this.pixelRatio = this.maxPixelRatio;
    this.autoQuality = !navigator.webdriver;
    this._perf = { frames: 0, slow: 0 };
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(this.pixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.info.autoReset = false; // count both outline passes per frame
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#8f969a');
    this.camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 4000);
    this.camera.position.set(0, 2, 10);
    this.outline = new OutlineEffect(renderer, {
      defaultThickness: 0.0045, defaultColor: [0.05, 0.05, 0.05], defaultAlpha: 1, defaultKeepAlive: true,
    });

    this.timeScale = 1;
    this.elapsed = 0;       // game seconds
    this.realElapsed = 0;   // real seconds
    this.frame = 0;
    this.renderEnabled = true; // tests can switch rendering off to fast-forward the simulation
    this.lastDrawCalls = 0;
    this.lastTriangles = 0;
    this.width = 1;
    this.height = 1;

    this._update = [];
    this._frame = [];
    this._render = [];
    this._failed = new WeakSet();
    this._last = 0;
    this._raf = 0;
    this._running = false;

    bindClock(this); // tween.js tick runs first every frame

    this._resize = this._resize.bind(this);
    this._loop = this._loop.bind(this);
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(canvas);
    }
    window.addEventListener('resize', this._resize);
    this._resize();
  }

  /** Subscribe to the game-time update (dt, t in game seconds). Returns unsubscribe(). */
  onUpdate(fn) { return this._sub(this._update, fn); }
  /** Subscribe to the real-time frame hook (realDt, realT). Returns unsubscribe(). */
  onFrame(fn) { return this._sub(this._frame, fn); }
  /** Called right after each render (e.g. for screen-space projections). */
  onRender(fn) { return this._sub(this._render, fn); }

  _sub(list, fn) {
    list.push(fn);
    return () => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._last = this._startedAt = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this._raf);
  }

  /** Advance the simulation by `dt` game seconds without rendering (used by tests / tools). */
  step(dt) {
    this.frame++;
    this.elapsed += dt;
    this._call(this._update, dt, this.elapsed);
  }

  render() {
    const info = this.renderer.info;
    info.reset();
    this.outline.render(this.scene, this.camera);
    this.lastDrawCalls = info.render.calls;
    this.lastTriangles = info.render.triangles;
    this._call(this._render, 0, this.realElapsed);
  }

  /** Render now and return a data URL of the canvas (optionally downscaled to `width`). */
  capture({ width = 0, type = 'image/jpeg', quality = 0.8 } = {}) {
    this.render();
    const src = this.canvas;
    if (!width || width >= src.width) return src.toDataURL(type, quality);
    const c = document.createElement('canvas');
    c.width = width;
    c.height = Math.round((src.height / src.width) * width);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL(type, quality);
  }

  /** 设置渲染像素比（限制在 min..max 之间）并按当前画布尺寸重建绘制缓冲。 */
  setPixelRatio(pr) {
    this.pixelRatio = Math.max(this.minPixelRatio, Math.min(this.maxPixelRatio, pr));
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
  }

  // 每满 90 帧或 2 秒统计一次：超过一半的帧慢于 26 ms（约 38 fps 以下）就把像素比降 0.25。
  // 启动后的前 4 秒（编译着色器）和页面隐藏时不统计；单帧超过 1 秒（切后台回来）不计入。
  _adaptQuality(now, frameMs) {
    if (!this.autoQuality || !this.renderEnabled || now - this._startedAt < 4000 || document.hidden || frameMs > 1000) return;
    const p = this._perf;
    p.frames++;
    p.ms = (p.ms || 0) + frameMs;
    if (frameMs > 26) p.slow++;
    if (p.frames < 90 && (p.ms < 2000 || p.frames < 5)) return;
    const slow = p.slow / p.frames;
    p.frames = p.slow = p.ms = 0;
    if (slow > 0.5 && this.pixelRatio > this.minPixelRatio) this.setPixelRatio(this.pixelRatio - 0.25);
  }

  _loop(now) {
    if (!this._running) return;
    this._raf = requestAnimationFrame(this._loop);
    this._adaptQuality(now, now - this._last);
    const realDt = Math.min(0.05, Math.max(0, (now - this._last) / 1000));
    this._last = now;
    const dt = realDt * this.timeScale;
    this.frame++;
    this.elapsed += dt;
    this.realElapsed += realDt;
    this._call(this._update, dt, this.elapsed);
    this._call(this._frame, realDt, this.realElapsed);
    if (this.renderEnabled) this.render();
  }

  _call(list, a, b) {
    for (const fn of list.slice()) {
      try {
        fn(a, b);
      } catch (err) {
        // Report each failing subscriber once (as a window error) instead of spamming every frame.
        if (!this._failed.has(fn)) {
          this._failed.add(fn);
          console.error('[engine] frame callback failed:', err);
          try {
            window.dispatchEvent(new ErrorEvent('error', { error: err, message: String(err && err.message || err) }));
          } catch { /* ignore */ }
        }
      }
    }
  }

  _resize() {
    const w = Math.max(1, Math.round(this.canvas.clientWidth || this.canvas.width || 1));
    const h = Math.max(1, Math.round(this.canvas.clientHeight || this.canvas.height || 1));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this._running && this.renderEnabled) this.render();
  }
}
