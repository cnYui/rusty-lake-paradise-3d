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

  // ------------------------------------------------------------------ 反复重载保护（轻量模式）
  // 有的手机上启动会被容器 / 系统判定“无响应”或进程被杀，页面被一遍遍重载，表现是白屏和载入页快速交替闪。
  // 每次启动先记一笔“开始了、还没走完”，启动完成（main.js 副本调 __RLP_BOOT_DONE）再改成“走完了”。
  // 30 秒内连续 2 次发现上一次没走完，这一次就进轻量模式：关阴影、像素比降到 1、关水面倒影（window.__RLP_LITE，
  // build.py 给引擎 / 世界副本加了对应的开关）。启动记录只用同步的 localStorage，读不了就当没有；正常设备永远走不到这里。
  var BOOT_KEY = 'rlp3d.boot';
  window.__RLP_LITE = false;
  try {
    var bootNow = Date.now(), bootRaw = localStorage.getItem(BOOT_KEY), bootSt = bootRaw ? JSON.parse(bootRaw) : null;
    var bootN = bootSt && !bootSt.done && bootNow - bootSt.t < 30000 ? bootSt.n : 0;
    window.__RLP_LITE = bootN >= 2;
    localStorage.setItem(BOOT_KEY, JSON.stringify({ t: bootNow, n: bootN + 1, done: false }));
  } catch (e) { /* 存储不可用：不做保护，照常启动 */ }
  window.__RLP_BOOT_DONE = function () {
    try { localStorage.setItem(BOOT_KEY, JSON.stringify({ t: Date.now(), n: 0, done: true })); } catch (e) { /* 忽略 */ }
  };

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
  // 让出主线程：距离上次“等整帧”不到 80 ms 时只让一个宏任务（输入事件照样能处理，省下每次 ~16 ms 的等帧），
  // 超过 80 ms 才等一次真正的 rAF（让页面合成出一帧）。桌面上启动要让出 90 多次，每次都等整帧就是 1.5 秒白白等待；
  // 慢手机每一段活本来就超过 80 ms，行为和以前一样（每段之间等整帧，不会长时间不出帧）。
  var lastFrame = performance.now();
  function tick() {
    return new Promise(function (resolve) {
      var done = false;
      function fin() { if (!done) { done = true; resolve(); } }
      if (performance.now() - lastFrame < 80) { setTimeout(fin, 0); return; }
      if (window.requestAnimationFrame) requestAnimationFrame(function () { lastFrame = performance.now(); setTimeout(fin, 0); });
      setTimeout(fin, 100);   // 页面在后台时 rAF 不触发，不能因此卡住启动
    });
  }
  window.__RLP_STAGE = function (text) {
    var b = document.getElementById('boot');
    if (b && text && !b.classList.contains('error')) b.textContent = text;
    return tick();
  };

  // ------------------------------------------------------------------ 分片预热着色器
  // 第一次渲染要把场景里用到的几十个着色器程序同步编译、链接完，是启动里最长的一次卡顿：桌面上 1.6 秒，手机 GPU 上要好几秒，
  // 期间主线程和 GPU 都被占满，页面合成不出来，表现成“白屏和载入页快速交替闪”，严重时还会被容器 / 系统判定无响应而重载。
  // 这里按材质把场景分成若干片，每次只让一片的物体可见、渲一帧（编译这一片用到的程序），累计超过 40 ms 就让出一帧；
  // 最后把可见性恢复原样。engine / world 由 build.py 给 main.js 副本加的调用传进来。
  window.__RLP_WARM = function (engine, world) {
    var ext = world && world.zones && world.zones.exterior;
    if (!ext || !engine || typeof engine.render !== 'function') return Promise.resolve();
    var entries = [];
    ext.traverse(function (o) {
      if (o.isMesh || o.isLine || o.isPoints || o.isSprite) entries.push({ m: o, v: o.visible, keep: o.name === 'lake' });
    });
    var byMat = {}, groups = [];
    entries.forEach(function (e) {
      var mats = Array.isArray(e.m.material) ? e.m.material : [e.m.material];
      var key = mats.map(function (x) { return x ? x.uuid : '-'; }).join(',');
      if (!byMat[key]) { byMat[key] = []; groups.push(byMat[key]); }
      byMat[key].push(e);
    });
    var per = Math.max(6, Math.ceil(groups.length / 30));          // 最多约 30 片
    var slices = [];
    for (var g = 0; g < groups.length; g += per) slices.push(groups.slice(g, g + per));
    // 水面每一片都保持可见：它的倒影是另一遍带裁剪面的渲染，每种材质都多一个着色器变体，不跟着分片的话会全堆到最后一次整体渲染里
    function hideAll() { entries.forEach(function (e) { if (!e.keep) e.m.visible = false; }); }
    function restore() { entries.forEach(function (e) { e.m.visible = e.v; }); }
    var i = 0, lastYield = performance.now();
    function step() {
      if (i >= slices.length) return Promise.resolve();
      hideAll();
      slices[i].forEach(function (grp) { grp.forEach(function (e) { e.m.visible = e.v; }); });
      engine.render();
      i++;
      if (performance.now() - lastYield < 40) return step();
      return window.__RLP_STAGE('准备画面 ' + i + '/' + slices.length + '…').then(function () { lastYield = performance.now(); return step(); });
    }
    return step().then(restore, function (err) { restore(); throw err; });
  };

  // ------------------------------------------------------------------ 竖屏旋转
  // 容器永远是竖屏、页面没法让它转：只要窗口是竖的就把画面转 90°，不管是不是手机（电脑上的小红书模拟器也是竖的）。
  // 网址加 ?rot=0 可以关掉（调试用）
  // 口袋方舟版（build.py --ark 生成的 ark_cfg.js 设置 window.__RLP_NOROT）：平台的 WebView 本来就是横屏，不旋转、不改事件坐标和元素矩形的读数，
  // 竖屏时由游戏自带的 .rotate-hint 提示玩家横过来；并把 #rot 的 safe-area padding（ark.css）从可用宽高里扣掉，舞台留在安全区内。
  var noRot = !!window.__RLP_NOROT;
  var canRot = !noRot && new URLSearchParams(location.search).get('rot') !== '0';
  var S = window.__RLP_ROT = { rot: false, fw: window.innerWidth, fh: window.innerHeight };

  function layout() {
    var fw = window.innerWidth || document.documentElement.clientWidth || 0;
    var fh = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!fw || !fh) return;   // 容器还没给 WebView 定大小：保持上一次的布局
    S.fw = fw; S.fh = fh;
    S.rot = canRot && fh > fw;
    var padW = 0, padH = 0;   // 安全区 padding（只有 noRot 版会有，其它情况恒为 0）
    if (noRot) {
      try {
        var cs = window.getComputedStyle(box);
        padW = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
        padH = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      } catch (e) { /* 读不到就当没有安全区 */ }
    }
    var vw = S.rot ? fh : fw - padW, vh = S.rot ? fw : fh - padH;
    box.style.width = (vw + padW) + 'px';   // box-sizing: border-box（ark.css），padding 在盒子里面；没有 padding 时就是 vw
    box.style.height = (vh + padH) + 'px';
    box.style.setProperty('--rw', vw + 'px');
    box.style.setProperty('--rh', vh + 'px');
    // 舞台（16:9）的大小：原来写在 CSS 里的 min()，Chrome 61 不认（79 才有），改在这里算好交给 CSS
    var sw = Math.min(vw, vh * 1.77778), sh = Math.min(vw * 0.5625, vh);
    box.style.setProperty('--sw', sw + 'px');
    box.style.setProperty('--sh', sh + 'px');
    box.style.setProperty('--fs', (sw / 80) + 'px');
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
  if (!noRot) {
    mapEventProto(window.MouseEvent && MouseEvent.prototype);
    mapEventProto(window.Touch && Touch.prototype);
  }

  // 元素矩形：游戏里的元素在屏幕上是转过来的外接矩形，换算成游戏横屏坐标里的矩形
  if (!noRot) {
    var gbcr = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      var r = gbcr.call(this);
      if (!S.rot || !box.contains(this)) return r;
      return new DOMRect(r.top, S.fw - r.right, r.height, r.width);
    };
  }

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
      '模式 ' + (window.__RLP_LITE ? '轻量（上几次启动没走完，已关阴影 / 倒影，像素比 1）' : '正常'),
      '声音 ' + (window.__RLP_AUDIO ? window.__RLP_AUDIO.summary() : '音频脚本没加载'),
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
