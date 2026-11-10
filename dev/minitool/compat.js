// 小红书小工具兼容垫片（普通脚本，必须最先加载，在 rotate.js / game.js 之前）。
// 兼容基线是 Android 8.1 出厂 Chrome / WebView 61（官方文档 https://miniapp-sandbox.xiaohongshu.com/minitool/doc §2.2）。
//
// 1. 补齐 Chrome 61 没有、而游戏代码直接调用了的接口（es2017_check.js 的 [接口] 提示里查到的）：
//      Array.prototype.flatMap  Chrome 69   characters_p2.js 模块顶层、props_beach.js 造门
//      Array.prototype.flat     Chrome 69   props_lake.js 造湖面几何
//      Promise.prototype.finally Chrome 63  ui.js 合成物品
//      CanvasRenderingContext2D.roundRect Chrome 99  materials.js / props_inner.js / props_lake.js 画贴图（建世界时就会调用，没有就抛 TypeError）
//    没有这几个，老安卓上启动就会抛 TypeError（flatMap 在模块顶层，等于整个游戏起不来）。
// 2. 检测 flex 容器里的 gap（Chrome 84 才支持）：不支持时给 <html> 加 class "no-flexgap"，
//    build.py 生成的兜底样式（用 margin 代替 gap）只在这个 class 下生效，现代浏览器不受影响。
//    网址加 ?flexgap=0 可强制走兜底（调试 / 测试用）。
(function () {
  'use strict';

  function define(proto, name, fn) {
    if (!proto[name]) Object.defineProperty(proto, name, { value: fn, writable: true, configurable: true });
  }

  function flatten(arr, depth, out) {
    for (var i = 0; i < arr.length; i++) {
      if (!(i in arr)) continue;                       // 跳过空位，和标准一致
      var v = arr[i];
      if (depth > 0 && Array.isArray(v)) flatten(v, depth - 1, out); else out.push(v);
    }
    return out;
  }
  define(Array.prototype, 'flat', function flat(depth) {
    var d = depth === undefined ? 1 : Number(depth);
    return flatten(this, d > 0 ? d : 0, []);
  });
  define(Array.prototype, 'flatMap', function flatMap(fn, thisArg) {
    if (typeof fn !== 'function') throw new TypeError('flatMap 需要一个函数');
    var out = [];
    for (var i = 0; i < this.length; i++) {
      if (!(i in this)) continue;
      var r = fn.call(thisArg, this[i], i, this);
      if (Array.isArray(r)) { for (var j = 0; j < r.length; j++) if (j in r) out.push(r[j]); } else out.push(r);
    }
    return out;
  });
  if (typeof Promise === 'function') {
    define(Promise.prototype, 'finally', function (fn) {
      if (typeof fn !== 'function') return this.then(fn, fn);
      var C = this.constructor || Promise;
      return this.then(
        function (v) { return C.resolve(fn()).then(function () { return v; }); },
        function (e) { return C.resolve(fn()).then(function () { throw e; }); }
      );
    });
  }

  // ---- Object.fromEntries（Chrome 73）：cast.js 模块顶层、第三灾 cast_p3.js / props_p3_placeholders.js / forest.js / grove.js / temple.js 都直接调用，
  //      Android 8 / Chrome 60 上没有它就在建世界时抛 TypeError（口袋方舟兼容要求按 Chrome 60 验收）。参数是 [键, 值] 的可迭代对象。
  if (typeof Object.fromEntries !== 'function') {
    Object.defineProperty(Object, 'fromEntries', {
      value: function fromEntries(iterable) {
        if (iterable == null) throw new TypeError('fromEntries 需要一个可迭代对象');
        var list = Array.from(iterable), out = {};
        for (var i = 0; i < list.length; i++) {
          var e = list[i];
          if (Object(e) !== e) throw new TypeError('fromEntries 的每一项都必须是 [键, 值]');
          Object.defineProperty(out, e[0], { value: e[1], writable: true, enumerable: true, configurable: true });
        }
        return out;
      },
      writable: true, configurable: true
    });
  }

  // ---- Canvas 2D 的 roundRect（Chrome 99）：游戏里 3 处画贴图用到，参数都是数字半径。按标准的写法补上：数字 / 1~4 个半径的数组 / {x, y} 取 x；
  //      半径过大时等比缩小；宽高为负时翻转。用 arcTo 拼，不需要 Path2D。
  if (typeof CanvasRenderingContext2D === 'function' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, radii) {
      var r = radii === undefined ? [0] : (Array.isArray(radii) ? radii.slice() : [radii]);
      if (!r.length || r.length > 4) throw new RangeError('roundRect: 半径个数必须是 1 到 4');
      r = r.map(function (v) { v = v && typeof v === 'object' ? v.x : v; v = Number(v) || 0; if (v < 0) throw new RangeError('roundRect: 半径不能是负数'); return v; });
      var tl, tr, br, bl;                                   // 左上、右上、右下、左下
      if (r.length === 1) { tl = tr = br = bl = r[0]; }
      else if (r.length === 2) { tl = br = r[0]; tr = bl = r[1]; }
      else if (r.length === 3) { tl = r[0]; tr = bl = r[1]; br = r[2]; }
      else { tl = r[0]; tr = r[1]; br = r[2]; bl = r[3]; }
      var t;
      if (w < 0) { x += w; w = -w; t = tl; tl = tr; tr = t; t = bl; bl = br; br = t; }
      if (h < 0) { y += h; h = -h; t = tl; tl = bl; bl = t; t = tr; tr = br; br = t; }
      var k = 1;
      if (tl + tr > 0) k = Math.min(k, w / (tl + tr));
      if (bl + br > 0) k = Math.min(k, w / (bl + br));
      if (tl + bl > 0) k = Math.min(k, h / (tl + bl));
      if (tr + br > 0) k = Math.min(k, h / (tr + br));
      if (k < 1) { tl *= k; tr *= k; br *= k; bl *= k; }
      this.moveTo(x + tl, y);
      this.lineTo(x + w - tr, y);
      this.arcTo(x + w, y, x + w, y + tr, tr);
      this.lineTo(x + w, y + h - br);
      this.arcTo(x + w, y + h, x + w - br, y + h, br);
      this.lineTo(x + bl, y + h);
      this.arcTo(x, y + h, x, y + h - bl, bl);
      this.lineTo(x, y + tl);
      this.arcTo(x, y, x + tl, y, tl);
      this.closePath();
    };
  }

  // ---- flex gap 检测：两个空 div 之间如果有 1px 的 gap，容器的 scrollHeight 就是 1
  try {
    var force = new URLSearchParams(location.search).get('flexgap') === '0';
    var ok = false;
    if (!force) {
      var d = document.createElement('div');
      d.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;left:-99px;top:0;visibility:hidden;pointer-events:none';
      d.appendChild(document.createElement('div'));
      d.appendChild(document.createElement('div'));
      (document.body || document.documentElement).appendChild(d);
      ok = d.scrollHeight === 1;
      d.parentNode.removeChild(d);
    }
    if (!ok) document.documentElement.className += ' no-flexgap';
  } catch (e) { /* 检测本身出错就当支持，不影响启动 */ }
})();
