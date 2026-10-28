// 小红书小工具存档层（普通脚本，在 game.js 之前加载）。
//
// 容器不保证 localStorage 可用或持久：客户端 9.46.0（buildVersion 去掉末 3 位 >= 9460）起优先用
// window.xhs.miniTool 的 Storage JS API；版本不够、接口缺失、调用超时 / 失败时退回 localStorage。
// 这个文件整体包在 try/catch 里：出任何问题都不能影响游戏（没有 window.__RLP_STORE 时游戏照旧用 localStorage）。
//
// 接管范围：所有以 'rlp3d.' 开头的键，只有下面几个例外永远直接用 localStorage：
//   rlp3d.boot（rotate.js 的启动重载计数，必须同步）、rlp3d.probe、rlp3d.wip、rlp3d.unlock。
// 对外接口和 localStorage 一样是同步的：getItem / setItem / removeItem / key(i) / length，
// 另外提供 ready（一定 resolve，永不 reject）、mode()、ok()、flush()、stats。
//
// xhs 存储里的键名编码成只含字母数字下划线（文档没写 key 允许哪些字符）：
// 不是 [A-Za-z0-9] 的字符写成 '_' + 两位小写十六进制字符码（'_' 本身写成 '_5f'），可以解码回来；
// 字符码超过两位能表示的宽字符用 '_u' + 四位十六进制（正常业务键都是 ASCII，不会走到这里）。
// xhs 的 data 必须是 JSON 字符串，所以游戏写进来原始字符串时再 JSON.stringify 一层，读出来 JSON.parse 回去。
//
// 启动时（脚本一加载就开始）把 xhs 里的存档读进内存，并和 localStorage 里的旧值合并：
//   - rlp3d.save.*：两边都有时取 JSON 里 savedAt 更大的那份（解析失败的一方当没有）；
//   - rlp3d.profile：ach / cleared 按 id 取并集，同一个 id 保留 t 较小且非 0 的那条；
//   - rlp3d.last / rlp3d.settings / rlp3d.achievements：xhs 里有就以 xhs 为准，没有才导入 localStorage 的；
//   - 合并后有变化的键写回 xhs，localStorage 里的旧值保留作兜底。
// 运行期写入先更新内存并同步写一份 localStorage，攒 300ms 再交给原生（同一个 key 合并，按 key 串行）；
// 失败记 failures、ok 置 false，键留在队列里等下次重试。切后台 / 关页面时立即 flush。
(function () {
  'use strict';
  try {
    var MIN_CLIENT = 9460;          // 客户端 9.46.0
    var CALL_MS = 1200;             // 单次原生调用最多等多久
    var INIT_MS = 1500;             // 整个初始化最多等多久（含等 SDK、取版本、读所有键、迁移）
    var SDK_MS = 300;               // window.xhs 还没注入时最多轮询等多久
    var FLUSH_MS = 300;             // 运行期写入的合并窗口
    var PREFIX = 'rlp3d.';
    var SAVE_PREFIX = 'rlp3d.save.';
    var PROFILE_KEY = 'rlp3d.profile';
    var OTHER_KEYS = ['rlp3d.last', 'rlp3d.settings', 'rlp3d.achievements'];
    var NEEDED = ['setStorage', 'getStorage', 'getStorageInfo', 'removeStorage'];
    var EXCEPT = { 'rlp3d.boot': 1, 'rlp3d.probe': 1, 'rlp3d.wip': 1, 'rlp3d.unlock': 1 };

    var mode = 'local';             // 'xhs'：Storage API；'local'：localStorage 降级
    var abandoned = false;          // 初始化超时 / 出错放弃了：之后迟到的结果一律不采用
    var cache = new Map();          // xhs 模式下的内存缓存：key -> 游戏写入的原始字符串
    var pending = new Map();        // 还没写进原生的 key（同一个 key 只留一份，flush 时按 cache 当前值写）
    var timer = 0;
    var chain = Promise.resolve();
    var okFlag = true;              // xhs 模式下最近一次原生写入有没有失败
    var stats = { buildVersion: 0, reason: '', reads: 0, writes: 0, failures: 0, migrated: 0 };

    function tool() { return window.xhs && window.xhs.miniTool; }
    function isManaged(k) { return typeof k === 'string' && k.indexOf(PREFIX) === 0 && !EXCEPT[k]; }

    // ---------------------------------------------------------------- localStorage（降级路径 / 例外键 / 兜底副本）
    function ls() { try { return window.localStorage; } catch (e) { return null; } }
    function localGet(k) { try { var s = ls(); return s ? s.getItem(k) : null; } catch (e) { return null; } }
    function localSet(k, v) { try { var s = ls(); if (!s) return false; s.setItem(k, v); return true; } catch (e) { return false; } }
    function localDel(k) { try { var s = ls(); if (s) s.removeItem(k); } catch (e) { /* 忽略 */ } }
    function localKey(i) { try { var s = ls(); return s ? s.key(i) : null; } catch (e) { return null; } }
    function localLength() { try { var s = ls(); return s ? s.length : 0; } catch (e) { return 0; } }

    // ------------------------------------------------------------------------- key 编码（可逆）
    function isAlnum(c) {
      var n = c.charCodeAt(0);
      return (n >= 48 && n <= 57) || (n >= 65 && n <= 90) || (n >= 97 && n <= 122);
    }
    function isHex(s) { return /^[0-9a-fA-F]+$/.test(s); }
    function hex2(n) { var s = n.toString(16); return s.length >= 2 ? s : '0' + s; }
    function encKey(k) {
      var out = '', i, c, code;
      for (i = 0; i < k.length; i++) {
        c = k.charAt(i);
        code = k.charCodeAt(i);
        if (isAlnum(c)) out += c;
        else if (code <= 255) out += '_' + hex2(code);
        else out += '_u' + ('0000' + code.toString(16)).slice(-4);   // 两位装不下的宽字符
      }
      return out;
    }
    function decKey(s) {
      var out = '', i = 0, h4, h2;
      while (i < s.length) {
        if (s.charAt(i) === '_' && i + 1 < s.length) {
          if (s.charAt(i + 1) === 'u' && i + 5 < s.length) {
            h4 = s.substr(i + 2, 4);
            if (h4.length === 4 && isHex(h4)) { out += String.fromCharCode(parseInt(h4, 16)); i += 6; continue; }
          }
          if (i + 2 < s.length) {
            h2 = s.substr(i + 1, 2);
            if (h2.length === 2 && isHex(h2)) { out += String.fromCharCode(parseInt(h2, 16)); i += 3; continue; }
          }
        }
        out += s.charAt(i);
        i++;
      }
      return out;
    }

    // ------------------------------------------------------------- 原生调用：带超时，失败 / 没响应都按失败处理
    function call(name, opts) {
      return new Promise(function (resolve, reject) {
        var done = false;
        var t = setTimeout(function () {
          if (done) return;
          done = true;
          reject(new Error(name + ' 超时'));
        }, CALL_MS);
        var p;
        try {
          p = tool()[name](opts);
        } catch (e) {
          if (!done) { done = true; clearTimeout(t); reject(e); }
          return;
        }
        Promise.resolve(p).then(function (v) {
          if (done) return;
          done = true; clearTimeout(t); resolve(v);
        }, function (e) {
          if (done) return;
          done = true; clearTimeout(t); reject(e);
        });
      });
    }

    // ------------------------------------------------------------------------- 客户端版本
    function readBuildVersion(lo) {
      var env = lo && lo.miniToolEnv;
      return Number(env && env.buildVersion) || 0;
    }
    function getBuildVersion() {
      var x = window.xhs;
      var sync = readBuildVersion(x && x.launchOptions);
      if (sync) return Promise.resolve(sync);
      if (!x || !x.miniTool || typeof x.miniTool.getLaunchOptions !== 'function') return Promise.resolve(0);
      return call('getLaunchOptions').then(readBuildVersion, function () { return 0; });
    }

    // window.xhs 可能是页面加载后才注入的，最多等 300ms（初始化总时限独立计算）
    function waitSdk() {
      return new Promise(function (resolve) {
        var t0 = Date.now();
        (function poll() {
          if (window.xhs || Date.now() - t0 >= SDK_MS) { resolve(); return; }
          setTimeout(poll, 50);
        })();
      });
    }

    // ----------------------------------------------------- 从 xhs 读值：data 是 JSON 字符串，值本身又是字符串
    function decodeData(data) {
      if (data === null || data === undefined) return null;
      if (typeof data !== 'string') data = String(data);
      try {
        var v = JSON.parse(data);
        return typeof v === 'string' ? v : data;     // 不是我们写的字符串就按原样保留
      } catch (e) {
        return data;
      }
    }

    // getStorageInfo 的 keys 是编码后的；只认解码后以 rlp3d. 开头、且不在例外表里的键
    function loadXhs() {
      return call('getStorageInfo').then(function (info) {
        if (abandoned) return null;
        var keys = (info && info.keys) || [];
        if (!Array.isArray(keys)) keys = [];
        var wanted = [], seen = {}, i, k;
        for (i = 0; i < keys.length; i++) {
          if (typeof keys[i] !== 'string') continue;
          k = decKey(keys[i]);
          if (k.indexOf(PREFIX) !== 0 || EXCEPT[k] || seen[k]) continue;
          seen[k] = 1;
          wanted.push(k);
        }
        var reads = [];
        for (i = 0; i < wanted.length; i++) {
          (function (key) {
            reads.push(call('getStorage', { key: encKey(key) }).then(function (r) {
              if (abandoned) return;
              var v = decodeData(r && r.data);
              if (v !== null) {
                cache.set(key, v);
                stats.reads++;
              }
            }));
          })(wanted[i]);
        }
        return Promise.all(reads);
      });
    }

    // ------------------------------------------------------------------- 合并（内存缓存 ∪ localStorage）
    function parseObject(s) {
      if (typeof s !== 'string') return null;
      try {
        var v = JSON.parse(s);
        return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
      } catch (e) { return null; }
    }
    function stable(v) {
      if (v === null || typeof v !== 'object') return JSON.stringify(v);
      if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
      var keys = Object.keys(v).sort(), out = [], i;
      for (i = 0; i < keys.length; i++) out.push(JSON.stringify(keys[i]) + ':' + stable(v[keys[i]]));
      return '{' + out.join(',') + '}';
    }
    function localKeys() {
      var out = [], n = localLength(), i, k;
      for (i = 0; i < n; i++) {
        k = localKey(i);
        if (typeof k === 'string') out.push(k);
      }
      return out;
    }
    // 同一个 id 两边都有：保留 t 较小且非 0 的那条（两个都是 0 时保留 xhs 那边的）
    function pickRecord(a, b) {
      if (a === undefined || a === null) return b;
      if (b === undefined || b === null) return a;
      var ta = a && typeof a === 'object' ? (Number(a.t) || 0) : 0;
      var tb = b && typeof b === 'object' ? (Number(b.t) || 0) : 0;
      if (!ta && !tb) return a;
      if (!ta) return b;
      if (!tb) return a;
      return tb < ta ? b : a;
    }
    function mergeRecords(a, b) {
      var out = {}, k;
      a = a && typeof a === 'object' && !Array.isArray(a) ? a : {};
      b = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
      for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k];
      for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) out[k] = pickRecord(out[k], b[k]);
      return out;
    }
    function mergeProfile(xRaw, lRaw) {
      var x = parseObject(xRaw), l = parseObject(lRaw);
      if (!x && !l) return null;
      if (!x) return { raw: lRaw, changed: true };
      if (!l) return { raw: xRaw, changed: false };
      var merged = {
        v: x.v || l.v || 1,
        ach: mergeRecords(x.ach, l.ach),
        cleared: mergeRecords(x.cleared, l.cleared),
      };
      var changed = stable(merged) !== stable(x);
      return { raw: changed ? JSON.stringify(merged) : xRaw, changed: changed };
    }

    // 返回有变化的键（已经写进 cache，还没写回 xhs）
    function mergeAll() {
      var changed = [], i, key, raw, xd, ld, m;

      // 1. rlp3d.save.*：xhs 没有就导入；两边都有取 savedAt 更大的（解析失败的一方当没有）
      var keys = localKeys();
      for (i = 0; i < keys.length; i++) {
        key = keys[i];
        if (key.indexOf(SAVE_PREFIX) !== 0 || !isManaged(key)) continue;
        raw = localGet(key);
        if (raw === null) continue;
        xd = cache.has(key) ? parseObject(cache.get(key)) : null;
        ld = parseObject(raw);
        if (!xd && !ld) continue;                       // 两边都解析不了：保持 xhs 原样
        if (!xd) { cache.set(key, raw); changed.push(key); continue; }
        if (!ld) continue;
        if ((Number(ld.savedAt) || 0) > (Number(xd.savedAt) || 0)) { cache.set(key, raw); changed.push(key); }
      }

      // 2. rlp3d.profile：并集（同一 id 保留 t 较小且非 0 的那条）
      raw = localGet(PROFILE_KEY);
      m = mergeProfile(cache.has(PROFILE_KEY) ? cache.get(PROFILE_KEY) : null, raw);
      if (m && m.changed) { cache.set(PROFILE_KEY, m.raw); changed.push(PROFILE_KEY); }

      // 3. 其它键以 xhs 为准：xhs 没有才导入 localStorage 的
      for (i = 0; i < OTHER_KEYS.length; i++) {
        key = OTHER_KEYS[i];
        if (cache.has(key)) continue;
        raw = localGet(key);
        if (raw === null) continue;
        cache.set(key, raw);
        changed.push(key);
      }
      return changed;
    }

    // 初始化迁移：把合并后有变化的键写回 xhs；失败留在 pending 里等下次重试
    function writeMerged(keys) {
      if (!keys.length) return Promise.resolve();
      var writes = [], i;
      for (i = 0; i < keys.length; i++) {
        (function (key) {
          var value = cache.has(key) ? cache.get(key) : null;
          var p = value === null ? call('removeStorage', { key: encKey(key) })
            : call('setStorage', { key: encKey(key), data: JSON.stringify(value) });
          writes.push(p.then(function () {
            stats.writes++;
            if (!pending.size) okFlag = true;
          }, function () {
            stats.failures++;
            okFlag = false;
            pending.set(key, true);
          }));
        })(keys[i]);
      }
      stats.migrated += keys.length;
      return Promise.all(writes);
    }

    // --------------------------------------------------------------------------- 初始化
    function init() {
      return waitSdk().then(function () {
        if (abandoned) return null;
        return getBuildVersion();
      }).then(function (bv) {
        if (abandoned) return null;
        stats.buildVersion = bv;
        var t = tool();
        var usable = Math.floor(bv / 1000) >= MIN_CLIENT && t && NEEDED.every(function (n) { return typeof t[n] === 'function'; });
        if (!usable) {
          stats.reason = bv ? '客户端版本不够或接口缺失' : '没有取到客户端版本（按不支持处理）';
          return null;
        }
        return loadXhs().then(function () {
          if (abandoned) return null;
          var changed = mergeAll();
          if (abandoned) return null;
          return writeMerged(changed).then(function () {
            if (abandoned) return null;
            mode = 'xhs';
            if (pending.size) schedule();
          });
        });
      }).catch(function (e) {
        if (!abandoned && mode !== 'xhs') {
          abandoned = true;
          stats.reason = String((e && e.message) || e || '存档初始化失败');
        }
      });
    }

    // ------------------------------------------------------------------------- 运行期写入队列
    function schedule() {
      if (timer) return;
      timer = setTimeout(function () { timer = 0; flushNow(); }, FLUSH_MS);
    }
    function doFlush() {
      if (mode !== 'xhs') { pending.clear(); return Promise.resolve(false); }
      if (!pending.size) return Promise.resolve(true);
      var keys = [];
      pending.forEach(function (v, k) { keys.push(k); });
      pending.clear();
      var run = Promise.resolve(), i;
      for (i = 0; i < keys.length; i++) {
        (function (key) {
          run = run.then(function () {
            if (mode !== 'xhs' || abandoned) return;
            var has = cache.has(key);
            var value = has ? cache.get(key) : null;
            var op = has ? call('setStorage', { key: encKey(key), data: JSON.stringify(value) })
              : call('removeStorage', { key: encKey(key) });
            return op.then(function () {
              stats.writes++;
              if (!pending.size) okFlag = true;
            }, function () {
              stats.failures++;
              okFlag = false;
              pending.set(key, true);
            });
          });
        })(keys[i]);
      }
      return run;
    }
    function flushNow() {
      if (timer) { clearTimeout(timer); timer = 0; }
      chain = chain.then(doFlush, doFlush).catch(function () { return false; });
      return chain;
    }

    // ---------------------------------------------------------------------------- 对外接口
    function getItem(k) {
      try {
        k = String(k);
        if (isManaged(k) && mode === 'xhs') return cache.has(k) ? cache.get(k) : null;
        return localGet(k);
      } catch (e) { return null; }
    }
    function setItem(k, v) {
      try {
        k = String(k);
        v = String(v);
        if (!isManaged(k) || mode !== 'xhs') { localSet(k, v); return; }
        cache.set(k, v);
        localSet(k, v);                 // 同步写一份兜底；localStorage 不可用也不影响游戏
        pending.set(k, true);
        schedule();
      } catch (e) { /* 不影响游戏 */ }
    }
    function removeItem(k) {
      try {
        k = String(k);
        if (!isManaged(k) || mode !== 'xhs') { localDel(k); return; }
        cache.delete(k);
        localDel(k);
        pending.set(k, true);
        schedule();
      } catch (e) { /* 不影响游戏 */ }
    }
    function allKeys() {
      var out = [], seen = {}, i, k;
      if (mode !== 'xhs') {
        var n0 = localLength();
        for (i = 0; i < n0; i++) {
          k = localKey(i);
          if (typeof k === 'string') out.push(k);
        }
        return out;
      }
      // 缓存里的键 ∪ localStorage 里不归它管的键（例外键和其它前缀）
      cache.forEach(function (v, key) {
        if (!seen[key]) { seen[key] = 1; out.push(key); }
      });
      var n = localLength();
      for (i = 0; i < n; i++) {
        k = localKey(i);
        if (typeof k !== 'string' || seen[k] || isManaged(k)) continue;
        seen[k] = 1;
        out.push(k);
      }
      return out;
    }
    function key(i) {
      try {
        var a = allKeys();
        return i >= 0 && i < a.length ? a[i] : null;
      } catch (e) { return null; }
    }
    function ok() {
      if (mode === 'xhs') return okFlag && !abandoned;
      var s = ls();
      if (!s) return false;
      try {
        s.setItem('rlp3d.probe', '1');
        s.removeItem('rlp3d.probe');
        return true;
      } catch (e) { return false; }
    }
    function currentMode() { return mode; }

    var store = {
      ready: null,
      stats: stats,
      mode: currentMode,
      ok: ok,
      flush: flushNow,
      getItem: getItem,
      setItem: setItem,
      removeItem: removeItem,
      key: key,
    };
    Object.defineProperty(store, 'length', {
      get: function () { try { return allKeys().length; } catch (e) { return 0; } },
    });

    // 整个初始化最多 1.5 秒；ready 一定 resolve（超时 / 出错都降级到 localStorage）
    var masterTimer = 0;
    var master = new Promise(function (resolve, reject) {
      masterTimer = setTimeout(function () {
        masterTimer = 0;
        reject(new Error('存档初始化超时'));
      }, INIT_MS);
    });
    var ready = Promise.race([init(), master]).then(function () {
      if (masterTimer) { clearTimeout(masterTimer); masterTimer = 0; }
    }, function () {
      if (masterTimer) { clearTimeout(masterTimer); masterTimer = 0; }
      if (mode !== 'xhs') {
        abandoned = true;
        stats.reason = '存档初始化超时（1.5 秒），降级到 localStorage';
      }
    });
    store.ready = ready;
    window.__RLP_STORE = store;

    // 切后台 / 关页面时马上把没写的写掉；Promise 链自己吞掉错误，不留未处理的拒绝
    try {
      if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', function () {
          try { if (document.hidden) flushNow(); } catch (e) { /* 忽略 */ }
        });
      }
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('pagehide', function () { flushNow(); });
      }
    } catch (e) { /* 忽略 */ }
  } catch (e) { /* 存档层出任何问题都不影响游戏：没有 window.__RLP_STORE 时游戏用 localStorage */ }
})();
