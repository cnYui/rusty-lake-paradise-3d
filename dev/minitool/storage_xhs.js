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
//
// 云存储（内测，客户端 9.51.0+，buildVersion 去掉末 3 位 >= 9510）：在本地存档层之上再加一层，换设备 / 清缓存后能找回进度。
//   - 只同步 rlp3d.save.<章节> 和 rlp3d.profile（设置、最近章节是设备自己的东西，不上云）；
//   - collection 'rlp_saves'，一个键一条记录 content = { k: 键名, v: 游戏写的原始字符串, t: 上传时间 }，整条 < 60 KB 才传；
//   - 启动时本地层就绪后再等云最多 1.2 秒：save 取 savedAt 较大的、profile 取并集（和本地迁移同一套规则），
//     云上更新的写回本地；本地更新的（或云上没有的）排队上传；超过 1.2 秒云才回来也照样合并，只是菜单已经画完；
//   - 运行期写入攒 30 秒再上传一次（切后台 / 关页面时马上传）；removeItem（重置进度）也会删云上那条，不然下次启动又被云“复活”；
//   - 没授权（errCode 1005 / 1006 / 10003）、版本不够、接口缺失、连续失败：云层关掉，只用本地层，不影响游戏；
//   - 云读失败整次放弃（不当成“云上没有”去覆盖）；写入逐项看 status，FAILED 留着重试，UNKNOWN 先重新查一遍对账再写。
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

    var CLOUD_MIN_CLIENT = 9510;    // 客户端 9.51.0
    var CLOUD_COLLECTION = 'rlp_saves';
    var CLOUD_CALL_MS = 4000;       // 云调用是网络请求，比本地调用等得久一点
    var CLOUD_WAIT_MS = 1200;       // 启动时本地层就绪后，最多再等云这么久（之后在后台合并）
    var CLOUD_UPLOAD_MS = 30000;    // 运行期上传的合并窗口
    var CLOUD_MAX_BYTES = 60000;    // 单条 content（UTF-8）上限 64 KB，留余量
    var CLOUD_NEEDED = ['addCloudStorage', 'updateCloudStorage', 'queryCloudStorage', 'removeCloudStorage'];
    var cloud = { enabled: false, on: false, ids: {}, dirty: {}, gone: {}, extra: [], timer: 0, chain: Promise.resolve(), streak: 0, refresh: false };
    var cloudStats = { reason: '', queried: 0, imported: 0, uploaded: 0, removed: 0, failures: 0, skipped: 0 };
    var cloudPromise = null;

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
    function call(name, opts, ms) {
      return new Promise(function (resolve, reject) {
        var done = false;
        var t = setTimeout(function () {
          if (done) return;
          done = true;
          reject(new Error(name + ' 超时'));
        }, ms || CALL_MS);
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

    // =============================================================================== 云存储
    function isCloudKey(k) { return isManaged(k) && (k.indexOf(SAVE_PREFIX) === 0 || k === PROFILE_KEY); }
    function cloudCall(name, opts) { return call(name, opts, CLOUD_CALL_MS); }
    function utf8Len(str) { try { return unescape(encodeURIComponent(str)).length; } catch (e) { return str.length * 3; } }
    function cloudFatal(e) {
      var c = e && e.errCode;
      return c === 1005 || c === 1006 || c === 10003;
    }
    function cloudOff(reason) {
      cloud.on = false;
      cloudStats.reason = reason;
      if (cloud.timer) { clearTimeout(cloud.timer); cloud.timer = 0; }
    }

    // 两份原始字符串合并（a 是本地，b 是云）：raw 是合并结果，fromCloud = 本地要换成 raw，toCloud = 云要换成 raw
    function mergeRaw(key, a, b) {
      var out = { raw: a, fromCloud: false, toCloud: false };
      if (a === null || a === undefined) { out.raw = b; out.fromCloud = b !== null && b !== undefined; return out; }
      if (b === null || b === undefined) { out.toCloud = true; return out; }
      if (key === PROFILE_KEY) {
        var m = mergeProfile(a, b);
        if (!m) return out;
        out.raw = m.raw;
        var mo = parseObject(m.raw), ao = parseObject(a), bo = parseObject(b);
        out.fromCloud = !!(mo && ao && stable(mo) !== stable(ao)) || (!ao && !!mo);
        out.toCloud = !!(mo && bo && stable(mo) !== stable(bo)) || (!bo && !!mo);
        return out;
      }
      var ao2 = parseObject(a), bo2 = parseObject(b);
      if (!ao2 && !bo2) return out;
      if (!ao2) { out.raw = b; out.fromCloud = true; return out; }
      if (!bo2) { out.toCloud = true; return out; }
      var la = Number(ao2.savedAt) || 0, ca = Number(bo2.savedAt) || 0;
      if (ca > la) { out.raw = b; out.fromCloud = true; } else if (la > ca) { out.toCloud = true; }
      return out;
    }

    // 查出云上的全部记录（分页）；任何一页失败整次 reject，不当成“云上没有”
    function cloudQueryAll() {
      var out = [];
      function page(cursor, n) {
        var o = { collection: CLOUD_COLLECTION, limit: 100 };
        if (cursor) o.cursor = cursor;
        return cloudCall('queryCloudStorage', o).then(function (r) {
          var items = (r && r.items) || [], i;
          for (i = 0; i < items.length; i++) out.push(items[i]);
          cloudStats.queried += items.length;
          if (r && r.hasMore && r.nextCursor && n < 10) return page(r.nextCursor, n + 1);
        });
      }
      return page(null, 0).then(function () { return out; });
    }

    // 查云 → 和 cache 合并。返回云上更新、要写回本地的键
    function cloudMerge(items) {
      var byKey = {}, i, it, c, k, cur, res;
      cloud.extra = [];
      for (i = 0; i < items.length; i++) {
        it = items[i];
        c = it && it.content;
        if (!it || !it.id || !c || typeof c.k !== 'string' || typeof c.v !== 'string' || !isCloudKey(c.k)) continue;
        k = c.k;
        if (!byKey[k]) { byKey[k] = { id: it.id, raw: c.v }; continue; }
        // 同一个键有两条（两台设备同时第一次上传）：合并成一条，多出来的删掉
        cur = mergeRaw(k, byKey[k].raw, c.v);
        byKey[k].raw = cur.raw;
        byKey[k].dirtyDup = true;
        cloud.extra.push(it.id);
      }
      var keys = {}, changed = [];
      for (k in byKey) if (Object.prototype.hasOwnProperty.call(byKey, k)) keys[k] = 1;
      cache.forEach(function (v, key) { if (isCloudKey(key)) keys[key] = 1; });
      for (k in keys) {
        if (!Object.prototype.hasOwnProperty.call(keys, k)) continue;
        if (byKey[k]) cloud.ids[k] = byKey[k].id;
        if (cloud.gone[k] && !cache.has(k)) { cloud.dirty[k] = true; continue; }   // 重置进度时删掉的：不从云上拉回来，反而要删云上的
        res = mergeRaw(k, cache.has(k) ? cache.get(k) : null, byKey[k] ? byKey[k].raw : null);
        if (res.fromCloud && res.raw !== null && res.raw !== undefined) {
          cache.set(k, res.raw);
          localSet(k, res.raw);
          changed.push(k);
          cloudStats.imported++;
        }
        if (res.toCloud || (byKey[k] && byKey[k].dirtyDup)) cloud.dirty[k] = true;
        if (!byKey[k] && cache.has(k)) cloud.dirty[k] = true;
      }
      if (cloud.extra.length) cloud.refresh = false;
      return changed;
    }

    function cloudInit(bv) {
      var t = tool();
      if (Math.floor(bv / 1000) < CLOUD_MIN_CLIENT || !t || !CLOUD_NEEDED.every(function (n) { return typeof t[n] === 'function'; })) {
        cloudStats.reason = '客户端版本不够或没有云存储接口';
        return Promise.resolve();
      }
      cloud.enabled = true;
      return cloudQueryAll().then(function (items) {
        if (mode !== 'xhs') return;
        var changed = cloudMerge(items);
        cloud.on = true;
        return writeMerged(changed).then(function () {
          if (Object.keys(cloud.dirty).length || cloud.extra.length) cloudSchedule(50);
        });
      }).catch(function (e) {
        cloudStats.failures++;
        cloudOff(cloudFatal(e) ? ('云存储未授权 errCode ' + (e && e.errCode)) : String((e && (e.errMsg || e.message)) || e || '云存储初始化失败'));
      });
    }

    function cloudSchedule(ms) {
      if (!cloud.on || cloud.timer) return;
      cloud.timer = setTimeout(function () { cloud.timer = 0; cloudFlushNow(); }, ms);
    }
    function cloudFlushNow() {
      if (cloud.timer) { clearTimeout(cloud.timer); cloud.timer = 0; }
      cloud.chain = cloud.chain.then(doCloudFlush, doCloudFlush).catch(function () { return false; });
      return cloud.chain;
    }

    function doCloudFlush() {
      if (!cloud.on || mode !== 'xhs') return Promise.resolve();
      var run = Promise.resolve();
      if (cloud.refresh) {
        // 上一次新增的结果不确定（UNKNOWN）：先重新查一遍，把云上已有的记录 id 对上，别重复新增
        run = cloudQueryAll().then(function (items) {
          var i, c;
          for (i = 0; i < items.length; i++) {
            c = items[i] && items[i].content;
            if (items[i] && items[i].id && c && typeof c.k === 'string' && isCloudKey(c.k) && !cloud.ids[c.k]) cloud.ids[c.k] = items[i].id;
          }
          cloud.refresh = false;
        });
      }
      return run.then(function () {
        var adds = [], ups = [], rms = [], k, raw, content, i;
        for (k in cloud.dirty) {
          if (!Object.prototype.hasOwnProperty.call(cloud.dirty, k)) continue;
          if (!cache.has(k)) {
            if (cloud.ids[k]) rms.push(k);
            else delete cloud.dirty[k];
            continue;
          }
          raw = cache.get(k);
          content = { k: k, v: raw, t: Date.now() };
          if (utf8Len(JSON.stringify(content)) > CLOUD_MAX_BYTES) { cloudStats.skipped++; delete cloud.dirty[k]; continue; }
          if (cloud.ids[k]) ups.push({ k: k, raw: raw, item: { id: cloud.ids[k], content: content } });
          else adds.push({ k: k, raw: raw, item: { content: content } });
        }
        var ops = Promise.resolve();
        if (adds.length) ops = ops.then(function () { return cloudWrite('addCloudStorage', adds); });
        if (ups.length) ops = ops.then(function () { return cloudWrite('updateCloudStorage', ups); });
        if (rms.length || cloud.extra.length) {
          ops = ops.then(function () {
            var ids = [], seen = {}, j;
            for (j = 0; j < rms.length; j++) { if (!seen[cloud.ids[rms[j]]]) { seen[cloud.ids[rms[j]]] = 1; ids.push(cloud.ids[rms[j]]); } }
            for (j = 0; j < cloud.extra.length; j++) { if (!seen[cloud.extra[j]]) { seen[cloud.extra[j]] = 1; ids.push(cloud.extra[j]); } }
            if (!ids.length) return;
            return cloudCall('removeCloudStorage', { collection: CLOUD_COLLECTION, ids: ids }).then(function (r) {
              var data = (r && r.data) || [], j2, okAll = true;
              for (j2 = 0; j2 < data.length; j2++) { if (data[j2] && data[j2].status === 'SUCCESS') cloudStats.removed++; else okAll = false; }
              if (okAll || !data.length) {
                for (j2 = 0; j2 < rms.length; j2++) { delete cloud.ids[rms[j2]]; if (!cache.has(rms[j2])) delete cloud.dirty[rms[j2]]; }
                cloud.extra = [];
              }
            });
          });
        }
        return ops.then(function () {
          cloud.streak = 0;
          if (Object.keys(cloud.dirty).length && cloud.on) cloudSchedule(CLOUD_UPLOAD_MS);
        });
      }).catch(function (e) {
        cloudStats.failures++;
        if (cloudFatal(e)) { cloudOff('云存储未授权 errCode ' + (e && e.errCode)); return; }
        cloud.streak++;
        if (cloud.streak >= 6) { cloudOff('云存储连续失败，本次不再上传：' + String((e && (e.errMsg || e.message)) || e)); return; }
        cloudSchedule(Math.min(300000, CLOUD_UPLOAD_MS * Math.pow(2, cloud.streak)));
      });
    }

    // 一批 add / update：顶层成功不等于每条成功，逐项看 status（SUCCESS 完成 / FAILED 重试 / UNKNOWN 先对账）
    function cloudWrite(name, list) {
      var items = [], i;
      for (i = 0; i < list.length; i++) items.push(list[i].item);
      return cloudCall(name, { collection: CLOUD_COLLECTION, items: items }).then(function (r) {
        var data = (r && r.data) || [], st, id;
        for (i = 0; i < list.length; i++) {
          st = data[i] && data[i].status;
          id = data[i] && data[i].id;
          if (st === 'SUCCESS') {
            if (id) cloud.ids[list[i].k] = id;
            cloudStats.uploaded++;
            if (cache.get(list[i].k) === list[i].raw) delete cloud.dirty[list[i].k];   // 发送期间又写了新的就留着
          } else if (st === 'UNKNOWN') {
            if (id) cloud.ids[list[i].k] = id;
            cloud.refresh = true;
          } else {
            cloudStats.failures++;
          }
        }
      });
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
            cloudPromise = cloudInit(bv);     // 云层自己吞掉所有错误，永不 reject
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
        if (isCloudKey(k)) { delete cloud.gone[k]; cloud.dirty[k] = true; cloudSchedule(CLOUD_UPLOAD_MS); }
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
        if (isCloudKey(k)) { cloud.gone[k] = true; cloud.dirty[k] = true; cloudSchedule(2000); }   // 重置进度：云上那条也要删
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
      cloud: { stats: cloudStats, on: function () { return cloud.on; }, flush: function () { return cloudFlushNow(); } },
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
      // 本地层就绪后再等云最多 1.2 秒；云更慢也不拦启动，回来后在后台合并
      if (mode === 'xhs' && cloudPromise) {
        return new Promise(function (resolve) {
          var t = setTimeout(resolve, CLOUD_WAIT_MS);
          cloudPromise.then(function () { clearTimeout(t); resolve(); }, function () { clearTimeout(t); resolve(); });
        });
      }
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
          try { if (document.hidden) { flushNow(); if (cloud.on && Object.keys(cloud.dirty).length) cloudFlushNow(); } } catch (e) { /* 忽略 */ }
        });
      }
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('pagehide', function () { flushNow(); try { if (cloud.on && Object.keys(cloud.dirty).length) cloudFlushNow(); } catch (e) { /* 忽略 */ } });
      }
    } catch (e) { /* 忽略 */ }
  } catch (e) { /* 存档层出任何问题都不影响游戏：没有 window.__RLP_STORE 时游戏用 localStorage */ }
})();
