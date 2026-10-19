// 小红书小工具：声音输出线路（普通脚本，在 game.js 之前加载；容器 CSP 不许内联脚本，所以单独一个文件）。
//
// 为什么要这个文件：游戏的声音全是 WebAudio 程序合成的（src/core/audio.js，没有任何音频文件，也就没有 mp3，更没有 data 或 blob 形式的媒体地址），
// 但 iPhone 上 WebAudio 会被侧边静音拨片吃掉——小红书容器里能运行、能出声音节点，就是听不到（银魂项目真机实测）。
// 实测有效的办法是两招同时用：
//   (a) navigator.audioSession.type = 'playback'（iOS 的 Audio Session API）
//   (b) 总线输出接到 ctx.createMediaStreamDestination()，再创建一个 Audio 元素、.srcObject = stream、.play()
//       （没有 URL，所以不受容器 CSP 的 media-src 限制；<audio> 元素的播放不受静音拨片管）
// 以及：iOS 只认“手势结束”事件（touchend / pointerup / click / keydown）里的 ctx.resume() 和 media.play()，
// pointerdown / touchstart 不算数，所以这几个事件都在 window 捕获阶段监听，每次点按都补一次（多调无害）。
// media.play() 被拒、且错误不是 NotAllowedError（没手势）时，回退直连 ctx.destination。
//
// 怎么接上：build.py 给 audio.js 的副本打补丁，把 comp.connect(ac.destination) 换成 window.__RLP_AUDIO_OUT(ac, comp)。
// 线路选择：iOS / 有 navigator.audioSession 的 WebKit 走媒体流；其它（安卓 WebView、电脑）直连，和原来一样，不引入新风险。
//          网址 ?audioroute=media 或 ?audioroute=direct 强制选线路（测试用）。
// 调试：window.RLP_AUDIO_DEBUG 为真（audio_cfg.js 设置，build.py --release 不带它）时，左下角显示一行状态条；
//       不论是否 release，连点画面左上角 5 下的排查面板（rotate.js）里也有一行“声音”。window.__RLP_AUDIO 是状态对象（测试用）。
(function () {
  'use strict';

  var DEBUG = !!window.RLP_AUDIO_DEBUG;
  var forced = null;
  try { forced = new URLSearchParams(location.search).get('audioroute'); } catch (e) { /* 老环境没有就算了 */ }
  var ua = navigator.userAgent || '';
  var isIOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);   // iPad 默认请求桌面版
  var hasSession = false;
  try { hasSession = !!navigator.audioSession; } catch (e) { /* 忽略 */ }
  var wantMedia = forced === 'media' || (forced !== 'direct' && (isIOS || hasSession));

  var S = window.__RLP_AUDIO = {
    ctx: null, node: null, msd: null, media: null,
    route: '未接', direct: false, session: '无', playState: '-',
    taps: 0, level: 0, err: '', wantMedia: wantMedia, debug: DEBUG, summary: summary,
  };

  function noop() {}
  function short(e) { return String((e && (e.name || e.message)) || e).slice(0, 50); }

  // ---------------------------------------------------------------- (a) 音频会话
  function setSession() {
    try {
      if (navigator.audioSession) { navigator.audioSession.type = 'playback'; S.session = String(navigator.audioSession.type); }
    } catch (e) { S.err = '会话 ' + short(e); }
  }
  setSession();   // 脚本一加载先设一次（和 ctx 无关），创建 ctx 时再设一次

  // ---------------------------------------------------------------- (b) 媒体流线路 + 回退
  function goDirect(why) {
    if (S.direct || !S.ctx || !S.node) return;
    S.direct = true;
    try { S.node.connect(S.ctx.destination); } catch (e) { /* 已经连着 */ }
    S.route = why ? '直连(' + why + ')' : '直连';
  }

  function tryPlay() {                                   // 只有在手势结束事件里才会成功；被拒（NotAllowedError）下次手势再试
    var m = S.media;
    if (!m || !(m.paused || m.ended)) return;
    try {
      var p = m.play();
      S.playState = '请求中';
      if (p && p.then) {
        p.then(function () { S.playState = '播放中'; }, function (e) {      // 注意：then 和 catch 必须写在同一个调用里，分开写会多出一条没人接的 rejection，触发全局报错横幅
          var n = e && e.name;
          if (n === 'NotAllowedError') { S.playState = '被拒(等点按)'; return; }   // 没手势（pointerdown / touchstart 不算），下次手势结束事件再试
          if (n === 'AbortError') { S.playState = '被打断'; return; }              // 被 pause() / 重新加载打断，下次手势再试
          S.playState = '失败 ' + short(e);
          goDirect('媒体流失败 ' + short(e));
        });
      } else S.playState = '播放中';
    } catch (e) { S.playState = '失败 ' + short(e); goDirect('媒体流失败 ' + short(e)); }
  }

  var primed = false;
  // iOS：第一个手势结束事件里「点播」一下 1 采样的静音缓冲（老做法，多一道保险；接的是原生 destination，静音，不影响线路）
  function prime(c) {
    if (primed) return;
    primed = true;
    try { var b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) { /* 忽略 */ }
  }

  var ENDS = { touchend: 1, pointerup: 1, click: 1, keydown: 1 };
  function onGesture(ev) {
    var c = S.ctx;
    if (ev && ENDS[ev.type]) S.taps++;
    if (!c) return;                                      // 游戏还没创建 AudioContext（它在第一次按下时才创建）
    if (c.state !== 'running') { try { var p = c.resume(); if (p && p.catch) p.catch(noop); } catch (e) { /* 忽略 */ } }
    tryPlay();
    if (ev && ENDS[ev.type]) prime(c);
  }
  ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown'].forEach(function (n) { window.addEventListener(n, onGesture, true); });
  // 切到后台就停声音（官方性能规范：页面不可见时停止媒体 / 定时器）；回到前台尽量恢复，iOS 不放行的话下一次点按里会补上
  document.addEventListener('visibilitychange', function () {
    var c = S.ctx, m = S.media;
    if (document.hidden) {
      try { if (c && c.state === 'running') { var p = c.suspend(); if (p && p.catch) p.catch(noop); } } catch (e) { /* 忽略 */ }
      try { if (m && !m.paused) m.pause(); } catch (e) { /* 忽略 */ }
    } else {
      onGesture(null);
    }
  });

  // 游戏（patch 过的 audio.js）创建 AudioContext 和总线后调用：node 是最后一级（压缩器），原来接 ctx.destination
  window.__RLP_AUDIO_OUT = function (ctx, node) {
    S.ctx = ctx; S.node = node; S.direct = false; S.msd = null; S.media = null;
    setSession();
    try { ctx.addEventListener('statechange', function () { if (ctx.state === 'running') tryPlay(); }); } catch (e) { /* 忽略 */ }
    var ok = false;
    if (wantMedia && ctx.createMediaStreamDestination && typeof Audio === 'function') {
      try {
        var msd = ctx.createMediaStreamDestination();
        node.connect(msd);
        var m = new Audio();
        m.setAttribute('playsinline', '');
        m.srcObject = msd.stream;
        m.addEventListener('error', function () { S.err = '媒体错误'; goDirect('媒体错误'); });
        S.msd = msd; S.media = m; S.route = '媒体流'; ok = true;
      } catch (e) { S.err = '媒体流 ' + short(e); S.msd = null; S.media = null; }
    }
    if (!ok) goDirect(wantMedia ? '媒体流创建失败' : '');
    if (DEBUG) meter(ctx, node);
    tryPlay();                                           // 万一就在手势里创建的（比如 keydown），当场就能起播
    if (ctx.state !== 'running') { try { var p = ctx.resume(); if (p && p.catch) p.catch(noop); } catch (e) { /* 忽略 */ } }
  };

  // ---------------------------------------------------------------- 状态摘要（状态条和排查面板共用）
  function gameAudio() {
    try { return window.RLP && window.RLP.ctx && window.RLP.ctx.audio; } catch (e) { return null; }
  }
  function summary() {
    var c = S.ctx, a = gameAudio();
    var parts = [
      c ? c.state : '还没创建',
      S.route,
      S.media ? (S.media.paused ? '<audio>暂停' : '<audio>播放中') : '无<audio>',
      '会话 ' + S.session,
      '电平 ' + S.level.toFixed(3),
      '手势结束 ' + S.taps,
    ];
    if (a) parts.push((a.currentAmbience || '-') + '/' + (a.currentMusic || '-') + (a.muted ? ' 已静音' : ''));
    if (S.playState !== '-' && S.playState !== '播放中') parts.push('play ' + S.playState);
    if (S.err) parts.push('⚠ ' + S.err);
    return parts.join(' | ');
  }

  // ---------------------------------------------------------------- 调试状态条（真机看一眼就知道哪一步出了问题）
  var meterRead = null;
  function meter(ctx, node) {                            // 总线电平：分清是“游戏没出声”还是“出了声但被静音拨片吃了”
    try {
      var an = ctx.createAnalyser();
      an.fftSize = 1024;
      node.connect(an);                                  // 不接任何输出也会被处理
      var buf = new Float32Array(an.fftSize);
      meterRead = function () {
        an.getFloatTimeDomainData(buf);
        var s = 0;
        for (var i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        var rms = Math.sqrt(s / buf.length);
        S.level = Math.max(rms, S.level * 0.85);
      };
    } catch (e) { S.err = '电平表 ' + short(e); }
  }
  if (DEBUG) {
    var bar = null;
    var mount = function () {
      if (bar) return;
      bar = document.createElement('div');
      // 放在 #rot 里，跟着游戏一起转（竖屏时画面转了 90°，状态条跟着转才读得出来）
      bar.style.cssText = 'position:absolute;left:4px;bottom:4px;z-index:2147483647;pointer-events:none;' +
        'font:10px/1.4 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#fff;background:rgba(0,0,0,.6);' +
        'padding:2px 6px;border-radius:4px;max-width:92%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      (document.getElementById('rot') || document.body || document.documentElement).appendChild(bar);
    };
    mount();
    setInterval(function () { if (meterRead) meterRead(); }, 100);
    setInterval(function () { mount(); bar.textContent = '♪ ' + summary(); }, 400);
  }
})();
