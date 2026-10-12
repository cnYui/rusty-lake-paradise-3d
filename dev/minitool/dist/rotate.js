// 小红书小工具壳（普通脚本，容器 CSP 不允许内联脚本，所以单独放一个文件，必须在 game.js 之前加载）。
//
// 1. 报错收集：原来 index.html 里的内联脚本，挪到这里（RLP.errors 要读）；出了没接住的错误时在画面顶上显示一条红色横幅。
// 2. 竖屏旋转：小工具容器永远是竖屏，拿不到陀螺仪、不能全屏、不能锁方向。手机竖着的时候把整个游戏顺时针转 90° 显示，
//    玩家把手机逆时针横过来拿（刘海在左）画面就是正的；窗口本身是横的就不转。
//    游戏代码里所有读屏幕坐标的地方（clientX / clientY、getBoundingClientRect）都照“没转过”的画面算，
//    所以这里把这两类读数换算成游戏横屏坐标，游戏源码一行不用改。
// 3. 启动进度：window.__RLP_STAGE(文字) 把阶段文字写到“载入中”页并让出一帧主线程（build.py 给 main.js / world.js 的副本加了调用），
//    启动不再是一条几十秒不让出主线程的长任务：页面的 load 事件能及时触发，容器也看得到页面有响应。
// 4. 排查面板：连点 5 下画面左上角（2 秒内）打开 / 关闭，显示设备、WebGL、启动耗时、帧率、最近一次点击和报错，真机上出问题时看它。
//
// 坐标约定：frame = 屏幕（竖屏）坐标，virtual = 游戏横屏坐标。顺时针转 90° 后 virtual(x, y) 在 frame 里是 (fw - y, x)，
// 反过来 frame(x, y) → virtual (y, fw - x)。
(function () {
  'use strict';

  window.__RLP_ERRORS = [];
  window.__RLP_CAPTURE = true;
  var box = document.getElementById('rot');

  // ------------------------------------------------------------------ 报错横幅
  var banner = null, bannerTimer = 0;
  function showError(msg) {
    try {
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'rlp-err';
        banner.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); banner.classList.remove('show'); });
        box.appendChild(banner);
      }
      banner.textContent = '出错了：' + String(msg).slice(0, 140) + '（点这里关闭）';
      banner.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(function () { banner.classList.remove('show'); }, 15000);
    } catch (e) { /* 横幅本身出错就算了 */ }
  }
  window.addEventListener('error', function (e) {
    var message = String(e.message || (e.error && e.error.message) || e);
    window.__RLP_ERRORS.push({ type: 'error', message: message, stack: e.error && e.error.stack, source: e.filename, line: e.lineno });
    showError(message);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    var message = String((r && r.message) || r);
    window.__RLP_ERRORS.push({ type: 'unhandledrejection', message: message, stack: r && r.stack });
    showError(message);
  });

  // ------------------------------------------------------------------ 启动进度
  function tick() {
    return new Promise(function (resolve) {
      var done = false;
      function fin() { if (!done) { done = true; resolve(); } }
      if (window.requestAnimationFrame) requestAnimationFrame(function () { setTimeout(fin, 0); });
      setTimeout(fin, 100);   // 页面在后台时 rAF 不触发，不能因此卡住启动
    });
  }
  window.__RLP_STAGE = function (text) {
    var b = document.getElementById('boot');
    if (b && text && !b.classList.contains('error')) b.textContent = text;
    return tick();
  };

  // ------------------------------------------------------------------ 竖屏旋转
  // 容器永远是竖屏、页面没法让它转：只要窗口是竖的就把画面转 90°，不管是不是手机（电脑上的小红书模拟器也是竖的）。
  // 网址加 ?rot=0 可以关掉（调试用）
  var canRot = new URLSearchParams(location.search).get('rot') !== '0';
  var S = window.__RLP_ROT = { rot: false, fw: window.innerWidth, fh: window.innerHeight };

  function layout() {
    var fw = window.innerWidth || document.documentElement.clientWidth || 0;
    var fh = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!fw || !fh) return;   // 容器还没给 WebView 定大小：保持上一次的布局
    S.fw = fw; S.fh = fh;
    S.rot = canRot && fh > fw;
    var vw = S.rot ? fh : fw, vh = S.rot ? fw : fh;
    box.style.width = vw + 'px';
    box.style.height = vh + 'px';
    box.style.setProperty('--rw', vw + 'px');
    box.style.setProperty('--rh', vh + 'px');
    box.style.transform = S.rot ? 'translateX(' + fw + 'px) rotate(90deg)' : 'none';
  }
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);
  window.addEventListener('pageshow', layout);
  window.addEventListener('load', layout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
  // 容器有时在页面加载之后才把 WebView 调到最终大小而不触发 resize：头几秒每 300 ms 对一次
  var relayouts = 0;
  var relayoutTimer = setInterval(function () { layout(); if (++relayouts >= 20) clearInterval(relayoutTimer); }, 300);

  // 事件坐标：屏幕点 → 游戏横屏坐标
  function mapEventProto(proto) {
    if (!proto) return;
    var gx = Object.getOwnPropertyDescriptor(proto, 'clientX'), gy = Object.getOwnPropertyDescriptor(proto, 'clientY');
    if (!gx || !gx.get || !gy || !gy.get) return;
    var rx = gx.get, ry = gy.get;
    var virtX = function () { return ry.call(this); };
    var virtY = function () { return S.fw - rx.call(this); };
    [['clientX', virtX], ['clientY', virtY], ['pageX', virtX], ['pageY', virtY], ['x', virtX], ['y', virtY]].forEach(function (p) {
      var d = Object.getOwnPropertyDescriptor(proto, p[0]);
      if (!d || !d.get) return;
      var orig = d.get, fn = p[1];
      Object.defineProperty(proto, p[0], { configurable: true, enumerable: d.enumerable, get: function () { return S.rot ? fn.call(this) : orig.call(this); } });
    });
  }
  mapEventProto(window.MouseEvent && MouseEvent.prototype);
  mapEventProto(window.Touch && Touch.prototype);

  // 元素矩形：游戏里的元素在屏幕上是转过来的外接矩形，换算成游戏横屏坐标里的矩形
  var gbcr = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    var r = gbcr.call(this);
    if (!S.rot || !box.contains(this)) return r;
    return new DOMRect(r.top, S.fw - r.right, r.height, r.width);
  };

  // ------------------------------------------------------------------ 排查面板
  var diag = null, diagOn = false, diagTimer = 0, taps = [], lastDown = '还没点过', fps = 0, fpsN = 0, fpsT = 0;

  function gpuInfo() {
    try {
      var e = window.RLP && window.RLP.ctx && window.RLP.ctx.engine;
      var gl = e && e.renderer && e.renderer.getContext();
      if (!gl) return '还没有';
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return gl.getParameter(gl.VERSION) + ' | ' + (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) +
        ' | 并行编译' + (gl.getExtension('KHR_parallel_shader_compile') ? '有' : '没有');
    } catch (err) { return '读取失败：' + err.message; }
  }

  function diagText() {
    var e = window.RLP && window.RLP.ctx && window.RLP.ctx.engine;
    var errs = window.__RLP_ERRORS;
    return [
      '窗口 ' + window.innerWidth + '×' + window.innerHeight + ' @' + (window.devicePixelRatio || 1) + (S.rot ? '（画面已转 90°）' : '（没转）'),
      '触点 ' + (navigator.maxTouchPoints || 0) + ' | 粗指针 ' + (window.matchMedia ? matchMedia('(pointer: coarse)').matches : '?') +
        ' | 核数 ' + (navigator.hardwareConcurrency || '?') + ' | 内存 ' + (navigator.deviceMemory || '?') + 'G',
      'GL ' + gpuInfo(),
      '启动(ms) ' + JSON.stringify((window.RLP && window.RLP.bootTimes) || '还没启动完'),
      '帧率 ' + fps + ' | 像素比 ' + (e ? e.pixelRatio : '?') + ' | 绘制 ' + (e ? e.lastDrawCalls : '?') + ' 次 ' + (e ? Math.round(e.lastTriangles / 1000) : '?') + 'k 三角形',
      '最近一次按下 ' + lastDown,
      '报错 ' + errs.length + ' 条' + (errs.length ? '：' + errs[errs.length - 1].message : ''),
      navigator.userAgent,
    ].join('\n');
  }

  function diagFrame() {
    if (!diagOn) return;
    fpsN++;
    var now = performance.now();
    if (now - fpsT >= 1000) { fps = Math.round(fpsN * 1000 / (now - fpsT)); fpsN = 0; fpsT = now; }
    requestAnimationFrame(diagFrame);
  }

  function toggleDiag() {
    if (!diag) {
      diag = document.createElement('pre');
      diag.className = 'rlp-diag';
      diag.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); toggleDiag(); });
      box.appendChild(diag);
    }
    diagOn = !diagOn;
    diag.classList.toggle('show', diagOn);
    clearInterval(diagTimer);
    if (diagOn) {
      fps = 0; fpsN = 0; fpsT = performance.now();
      requestAnimationFrame(diagFrame);
      diag.textContent = diagText();
      diagTimer = setInterval(function () { diag.textContent = diagText(); }, 500);
    }
  }

  // 在捕获阶段看所有按下：记下最近一次（类型、游戏坐标、点中的元素），并数左上角的连点
  window.addEventListener('pointerdown', function (ev) {
    try {
      var t = ev.target;
      var cls = t && typeof t.className === 'string' ? t.className.split(' ')[0] : '';
      lastDown = ev.pointerType + ' (' + Math.round(ev.clientX) + ',' + Math.round(ev.clientY) + ') ' + (t && t.tagName ? t.tagName.toLowerCase() : '?') + (cls ? '.' + cls : '');
      if (ev.clientX < 100 && ev.clientY < 100) {
        var now = Date.now();
        taps.push(now);
        taps = taps.filter(function (x) { return now - x < 2000; });
        if (taps.length >= 5) { taps = []; toggleDiag(); }
      }
    } catch (e) { /* 排查面板不能影响游戏 */ }
  }, true);
})();
