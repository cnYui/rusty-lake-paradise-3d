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

  // ------------------------------------------------------------------ 分片预热着色器（按 zone、按材质）
  // 第一次渲染要把场景里用到的几十个着色器程序同步编译、链接完，是启动里最长的一次卡顿：桌面上 1.6 秒，手机 GPU 上要好几秒，
  // 期间主线程和 GPU 都被占满，页面合成不出来，表现成“白屏和载入页快速交替闪”，严重时还会被容器 / 系统判定无响应而重载。
  //
  // 程序缓存键里包含灯的数量，室内 zone 有自己的灯，所以不能把所有 zone 一起渲染（会编出真正游戏时用不到的变体）：
  // 对每个 zone 临时只让它自己可见，收集 zone 子树里所有可渲染物体（用 traverse，不用 traverseVisible：暂时隐藏的物体以后也会出现），
  // 按材质分组（多材质对象按 uuid 列表成键）。链接本身是异步的（gl.linkProgram 只是把命令发给 GPU 进程），真正卡主线程的是
  // three 在程序第一次使用时做的同步查询（WebGLProgram 的 getUniforms / getAttributes → onFirstUse，要等 GPU 进程链接完）。
  // 所以每组按三步走：
  //   a. 先只对组里的每个物体调 renderer.compile(物体, camera, scene) 发起编译、链接，不渲染、不做同步查询；
  //   b. 程序数增加了就用 fenceSync + setTimeout 轮询等 GPU 链接完（getSyncParameter 不阻塞，最多 20 秒），等待期间主线程空闲；
  //   c. 再只显示这一组、engine.render() 一次——主程序已经链接好，同步查询很快；阴影深度 / 水面倒影的变体在这里新建，
  //      render 后程序数又增加或 render 超过 25 ms，就再等一次 GPU，然后让出主线程。
  // 没有 fenceSync（WebGL1 / 老设备）时 waitGpu 直接返回，退回原来的同步行为；engine.camera 不存在时跳过 a。
  // 室外水面（name === 'lake'）在每一组都保持原可见性，倒影那遍的变体跟着当前组一起编出来，不会全堆到最后一次整体渲染。
  // 等过 GPU 或编出新程序就让出主线程；没编出新程序时按 25 ms 累计让出一次，保证两次让出之间最多只有一组的编译。
  // 全部结束后严格恢复每个物体原来的 visible / frustumCulled 和每个 zone 的 visible；出错也恢复。
  // engine / world 由 build.py 给 main.js 副本加的调用传进来；engine 或 world.zones 不存在时直接 resolve。
  window.__RLP_WARM = function (engine, world) {
    var zones = world && world.zones;
    if (!zones || !engine || typeof engine.render !== 'function' || !engine.renderer) return Promise.resolve();
    var stage = window.__RLP_STAGE || function () { return Promise.resolve(); };
    var info = engine.renderer.info;
    var programs = info && info.programs ? info.programs.length : 0;
    var gl = null;
    try { gl = engine.renderer.getContext ? engine.renderer.getContext() : null; } catch (e) { gl = null; }
    var ids = Object.keys(zones);
    // exterior 最先预热（标题菜单背后看到的就是它）；其余保持 Object.keys 的顺序
    var order = ids.indexOf('exterior') >= 0 ? ['exterior'] : [];
    for (var i = 0; i < ids.length; i++) if (ids[i] !== 'exterior') order.push(ids[i]);

    // 先只收集和分组，不渲染：记录每个节点的原状态，最后一次性恢复
    var plan = [];
    for (var n = 0; n < order.length; n++) {
      var id = order[n], zone = zones[id];
      if (!zone || typeof zone.traverse !== 'function') continue;
      var nodes = [], groups = [], byMat = Object.create(null);
      zone.traverse(function (o) {
        var rec = { o: o, vis: o.visible, fc: o.frustumCulled, render: !!(o.isMesh || o.isLine || o.isPoints || o.isSprite) };
        nodes.push(rec);
        if (!rec.render) return;
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        var key = mats.map(function (x) { return x ? x.uuid : '-'; }).join(',');
        var grp = byMat[key];
        if (!grp) { grp = byMat[key] = []; groups.push(grp); }
        grp.push(rec);
      });
      if (groups.length) plan.push({ id: id, zone: zone, vis: zone.visible, nodes: nodes, groups: groups });
    }
    if (!plan.length) return Promise.resolve();

    var total = 0;
    for (var t = 0; t < plan.length; t++) total += plan[t].groups.length;
    var pi = 0, gi = 0, done = 0, lastYield = performance.now(), restored = false;

    // 只显示这一组：本 zone 其它可渲染物体隐藏（室外水面除外），组和祖先可见、不剔出视锥
    function showGroup(p, grp) {
      for (var a = 0; a < p.nodes.length; a++) {
        var rec = p.nodes[a];
        if (!rec.render) continue;
        rec.o.visible = (p.id === 'exterior' && rec.o.name === 'lake') ? rec.vis : false;
      }
      for (var b = 0; b < grp.length; b++) {
        var e = grp[b];
        e.o.visible = true;
        e.o.frustumCulled = false;
        var up = e.o.parent;
        while (up && up !== p.zone) { up.visible = true; up = up.parent; }
      }
    }

    // 只让一个 zone 可见：程序缓存键里的灯数和真正游戏时一致
    function showZone(p) {
      for (var z = 0; z < plan.length; z++) plan[z].zone.visible = plan[z] === p;
    }

    function restore() {
      if (restored) return;
      restored = true;
      for (var z = 0; z < plan.length; z++) {
        var p = plan[z];
        for (var k = 0; k < p.nodes.length; k++) {
          p.nodes[k].o.visible = p.nodes[k].vis;
          p.nodes[k].o.frustumCulled = p.nodes[k].fc;
        }
        p.zone.visible = p.vis;
      }
    }

    // 等 GPU 把刚发起的链接做完：WebGL2 插一个 fence，用 setTimeout 轮询 getSyncParameter（不阻塞主线程），
    // 信号到了或累计超过 20 秒就删掉 fence 并 resolve；没有 fenceSync（WebGL1 / 老设备）或出错时直接 resolve，退回旧行为。
    // 不用 clientWaitSync 的非 0 超时（会阻塞主线程）。
    function waitGpu(gl) {
      return new Promise(function (resolve) {
        if (!gl || typeof gl.fenceSync !== 'function') { resolve(); return; }
        var s = null;
        try {
          s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          if (!s) { resolve(); return; }
          gl.flush();
        } catch (e) {
          if (s) { try { gl.deleteSync(s); } catch (e2) { /* 忽略 */ } }
          resolve();
          return;
        }
        var start = performance.now(), done = false;
        function fin() {
          if (done) return;
          done = true;
          try { gl.deleteSync(s); } catch (e) { /* 忽略 */ }
          resolve();
        }
        function poll() {
          if (done) return;
          var signaled = false;
          try { signaled = gl.getSyncParameter(s, gl.SYNC_STATUS) === gl.SIGNALED; } catch (e) { signaled = true; }
          if (signaled || performance.now() - start > 20000) { fin(); return; }
          setTimeout(poll, 16);
        }
        setTimeout(poll, 16);
      });
    }

    // 渲染一组；返回下一步：'continue' = 同一段任务里接着下一组，'wait' = 先等 GPU 再让出，'yield' = 直接让出
    function renderGroup(p, grp) {
      var before = info && info.programs ? info.programs.length : 0;
      showGroup(p, grp);
      var renderStart = performance.now();
      engine.render();
      var renderMs = performance.now() - renderStart;
      done++;
      var after = info && info.programs ? info.programs.length : before;
      if (after > before) programs = after;
      gi++;
      if (gi >= p.groups.length) { pi++; gi = 0; }
      var now = performance.now();
      if (after > before || renderMs > 25) return 'wait';
      if (now - lastYield < 25) return 'continue';
      return 'yield';
    }

    function yieldStep() {
      var text = '准备画面 ' + done + '/' + total + '…';
      if (programs) text = '准备画面 ' + done + '/' + total + '（已编译 ' + programs + ' 个程序）…';
      return stage(text).then(function () { lastYield = performance.now(); return step(); });
    }

    // 等完编译链接后的这一组：照旧渲染，再按程序数 / 渲染耗时决定要不要再等一次 GPU
    function afterCompileWait(p, grp) {
      var next = renderGroup(p, grp);
      if (next === 'wait') return waitGpu(gl).then(yieldStep);
      if (next === 'continue') return step();
      return yieldStep();
    }

    function step() {
      // 同一段任务里连续处理“没有编出新程序”的组；一旦等过 GPU 或累计超过 25 ms 就让出
      for (;;) {
        if (pi >= plan.length) return Promise.resolve();
        var p = plan[pi], grp = p.groups[gi];
        if (gi === 0) showZone(p);
        // a. 只发起编译、链接，不渲染（compile 只创建程序并 linkProgram，不做同步查询）
        var before = info && info.programs ? info.programs.length : 0;
        if (engine.camera) {
          for (var c = 0; c < grp.length; c++) {
            try { engine.renderer.compile(grp[c].o, engine.camera, engine.scene); } catch (e) { /* 单个物体编译失败就跳过 */ }
          }
        }
        var afterCompile = info && info.programs ? info.programs.length : before;
        if (afterCompile > before) programs = afterCompile;
        // b. 发起了新的链接：用 setTimeout 轮询 fence 等 GPU，等待期间主线程空闲
        if (afterCompile > before) return waitGpu(gl).then(function () { return afterCompileWait(p, grp); });
        // c. 没有新程序：直接照旧渲染这一组
        var next = renderGroup(p, grp);
        if (next === 'continue') continue;
        if (next === 'wait') return waitGpu(gl).then(yieldStep);
        return yieldStep();
      }
    }

    try {
      return step().then(restore, function (err) { restore(); throw err; });
    } catch (err) {
      restore();
      return Promise.reject(err);
    }
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
