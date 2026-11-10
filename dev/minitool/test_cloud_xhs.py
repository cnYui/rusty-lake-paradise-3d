r"""验证小红书小工具存档层的云存储（dev/minitool/storage_xhs.js 的云层）。

只加载 storage_xhs.js 的空白页 + 模拟的 window.xhs.miniTool（Storage API + 云存储 add / update / query / remove）。
覆盖：版本边界、云上更新 / 本地更新 / 云上没有 / profile 并集、运行期 30 秒合并与 flush / pagehide、重置进度删云上记录且不被云“复活”、
未授权（1006）降级、云查询挂起或很慢不拦启动、单条过大跳过、add 结果 UNKNOWN 先对账不重复新增、add FAILED 重试、重复记录合并、零未处理拒绝。

用法：python dev/minitool/test_cloud_xhs.py          退出码：全部通过 0，有失败 1
"""
import json, os, sys, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
STORE_JS = open(os.path.join(HERE, 'storage_xhs.js'), encoding='utf-8').read()
results = []


def check(name, ok, detail=None):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + json.dumps(detail, ensure_ascii=False) if (detail is not None and not ok) else ''), flush=True)


MOCK = r"""
(function () {
  var cfg = %s;
  var store = {};
  var cloud = (cfg.cloudSeed || []).map(function (x) { return JSON.parse(JSON.stringify(x)); });
  var seq = 0, nid = function () { seq++; return ('0000000000000000000000' + seq.toString(16)).slice(-24); };
  var calls = { setStorage: 0, getStorage: 0, getStorageInfo: 0, removeStorage: 0, addCloud: 0, updateCloud: 0, queryCloud: 0, removeCloud: 0 };
  window.__MOCK = { store: store, cloud: cloud, calls: calls, cfg: cfg };
  window.__unhandled = 0;
  window.addEventListener('unhandledrejection', function () { window.__unhandled++; });
  try { var seeded = sessionStorage.getItem('__seeded'); if (!seeded) { var l = cfg.localSeed || {}; for (var k in l) localStorage.setItem(k, l[k]); sessionStorage.setItem('__seeded', '1'); } } catch (e) {}
  var lat = function (v, ms) { return new Promise(function (res) { setTimeout(function () { res(v); }, ms == null ? 5 : ms); }); };
  var never = function () { return new Promise(function () {}); };
  var cl = function () { return cfg.cloudLatency == null ? 5 : cfg.cloudLatency; };
  var fail = function (o) { return Promise.reject(o); };
  var env = { miniToolEnv: { buildVersion: cfg.buildVersion } };
  var mt = {
    getLaunchOptions: function () { return lat(env); },
    getStorageInfo: function () { calls.getStorageInfo++; return lat({ errMsg: 'ok', keys: Object.keys(store) }); },
    getStorage: function (o) { calls.getStorage++; return lat({ errMsg: 'ok', data: Object.prototype.hasOwnProperty.call(store, o.key) ? store[o.key] : null }); },
    setStorage: function (o) { calls.setStorage++; store[o.key] = o.data; return lat({ errMsg: 'ok' }); },
    removeStorage: function (o) { calls.removeStorage++; delete store[o.key]; return lat({ errMsg: 'ok' }); },
    queryCloudStorage: function (o) {
      calls.queryCloud++;
      if (cfg.hangQuery) return never();
      if (cfg.queryFail) return fail(cfg.queryFail);
      if (o.collection !== 'rlp_saves') return fail({ errMsg: 'bad collection' });
      return lat({ errMsg: 'ok', items: cloud.map(function (x) { return JSON.parse(JSON.stringify({ id: x.id, collection: 'rlp_saves', content: x.content })); }), hasMore: false }, cl());
    },
    addCloudStorage: function (o) {
      calls.addCloud++;
      if (cfg.writeFail) return fail(cfg.writeFail);
      var data = o.items.map(function (it, i) {
        if (typeof it.content !== 'object') return { id: '', status: 'FAILED' };
        if (cfg.addFailOnce && calls.addCloud === 1) return { id: '', status: 'FAILED' };
        var id = nid(); cloud.push({ id: id, content: JSON.parse(JSON.stringify(it.content)) });
        if (cfg.addUnknownOnce && calls.addCloud === 1) return { id: '', status: 'UNKNOWN' };
        return { id: id, status: 'SUCCESS' };
      });
      return lat({ errMsg: 'ok', data: data }, cl());
    },
    updateCloudStorage: function (o) {
      calls.updateCloud++;
      if (cfg.writeFail) return fail(cfg.writeFail);
      var data = o.items.map(function (it) {
        var rec = cloud.filter(function (x) { return x.id === it.id; })[0];
        if (!rec) return { id: it.id, status: 'FAILED' };
        rec.content = JSON.parse(JSON.stringify(it.content));
        return { id: it.id, status: 'SUCCESS' };
      });
      return lat({ errMsg: 'ok', data: data }, cl());
    },
    removeCloudStorage: function (o) {
      calls.removeCloud++;
      var data = o.ids.map(function (id) {
        for (var i = 0; i < cloud.length; i++) if (cloud[i].id === id) { cloud.splice(i, 1); break; }
        return { id: id, status: 'SUCCESS' };
      });
      return lat({ errMsg: 'ok', data: data }, cl());
    }
  };
  if (cfg.noCloudApi) delete mt.queryCloudStorage;
  if (cfg.noXhs) return;
  window.xhs = { miniTool: mt, launchOptions: env };
})();
"""


def save_raw(n, **extra):
    d = {'v': 2, 'savedAt': n, 'flags': {}, 'tag': extra.get('tag', '')}
    return json.dumps(d, separators=(',', ':'))


def rec(rid, key, raw):
    return {'id': rid, 'content': {'k': key, 'v': raw, 't': 1}}


def page_for(browser, cfg):
    ctx = browser.new_context()
    page = ctx.new_page()
    page.route('http://store.test/**', lambda r: r.fulfill(status=200, content_type='text/html', body='<!doctype html><html><body></body></html>'))
    page.add_init_script(MOCK % json.dumps(cfg, ensure_ascii=False))
    page.add_init_script(STORE_JS)
    t0 = time.time()
    page.goto('http://store.test/')
    page.evaluate('window.__RLP_STORE.ready')
    return ctx, page, round(time.time() - t0, 2)


def S(page, js):
    return page.evaluate(js)


def cloud_map(page):
    return {r['content']['k']: r for r in S(page, 'window.__MOCK.cloud')}


def wait_for(page, expr, timeout=8.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(f'!!({expr})'):
            return True
        time.sleep(0.1)
    return False


K1 = 'rlp3d.save.plague1'
K2 = 'rlp3d.save.plague2'
PK = 'rlp3d.profile'
BASE = {'buildVersion': 9510000}


def run(browser):
    # 1 版本边界
    for label, bv, want in (('9.50.9 不用云', 9509999, 0), ('9.51.0 用云', 9510000, 1), ('9.53.2 用云', 9532004, 1)):
        ctx, page, took = page_for(browser, {'buildVersion': bv})
        calls = S(page, 'window.__MOCK.calls')
        check('版本：' + label, (calls['queryCloud'] >= 1) == bool(want) and S(page, 'window.__RLP_STORE.mode()') == 'xhs', calls)
        ctx.close()

    # 2 云上更新：云 savedAt 200 > 本地 100 → 写回本地（cache + xhs + localStorage），不上传
    cfg = dict(BASE, cloudSeed=[rec('a1', K1, save_raw(200, tag='cloud'))], localSeed={K1: save_raw(100, tag='local')})
    ctx, page, took = page_for(browser, cfg)
    got = S(page, f'window.__RLP_STORE.getItem("{K1}")')
    check('云上更新：getItem 拿到云上的存档', json.loads(got)['tag'] == 'cloud', got)
    check('云上更新：写回本地 xhs 和 localStorage', json.loads(json.loads(S(page, 'window.__MOCK.store')['rlp3d_2esave_2eplague1']))['tag'] == 'cloud'
          and json.loads(S(page, f'localStorage.getItem("{K1}")'))['tag'] == 'cloud')
    page.evaluate('window.__RLP_STORE.cloud.flush()')
    calls = S(page, 'window.__MOCK.calls')
    check('云上更新：不会把云的东西再上传', calls['addCloud'] == 0 and calls['updateCloud'] == 0, calls)
    ctx.close()

    # 3 本地更新：本地 300 > 云 100 → 上传（update，id 不变）
    cfg = dict(BASE, cloudSeed=[rec('a1', K1, save_raw(100, tag='cloud'))], localSeed={K1: save_raw(300, tag='local')})
    ctx, page, took = page_for(browser, cfg)
    check('本地更新：getItem 仍是本地的', json.loads(S(page, f'window.__RLP_STORE.getItem("{K1}")'))['tag'] == 'local')
    wait_for(page, 'window.__MOCK.calls.updateCloud >= 1')
    cm = cloud_map(page)
    check('本地更新：云上那条被整条覆盖，id 不变', json.loads(cm[K1]['content']['v'])['tag'] == 'local' and cm[K1]['id'] == 'a1' and len(cm) == 1, cm)
    ctx.close()

    # 4 云上没有：本地 save + profile 都新增
    prof = json.dumps({'v': 1, 'ach': {'a': {'t': 5}}, 'cleared': {'plague1': {'t': 9}}}, separators=(',', ':'))
    cfg = dict(BASE, localSeed={K1: save_raw(10), PK: prof, 'rlp3d.settings': '{"volume":0.5}', 'rlp3d.last': 'plague1'})
    ctx, page, took = page_for(browser, cfg)
    wait_for(page, 'window.__MOCK.calls.addCloud >= 1')
    cm = cloud_map(page)
    check('云上没有：save 和 profile 新增，设置 / 最近章节不上云', sorted(cm) == sorted([K1, PK]), sorted(cm))
    check('云上记录格式 content={k,v,t}', all(set(r['content']) == {'k', 'v', 't'} and isinstance(r['content']['v'], str) for r in cm.values()))
    ctx.close()

    # 5 profile 并集：本地 ach a，云 ach b → 两边都有 a、b
    pl = json.dumps({'v': 1, 'ach': {'a': {'t': 5}}, 'cleared': {}}, separators=(',', ':'))
    pc = json.dumps({'v': 1, 'ach': {'b': {'t': 6}}, 'cleared': {'plague2': {'t': 7}}}, separators=(',', ':'))
    cfg = dict(BASE, cloudSeed=[rec('p1', PK, pc)], localSeed={PK: pl})
    ctx, page, took = page_for(browser, cfg)
    local = json.loads(S(page, f'window.__RLP_STORE.getItem("{PK}")'))
    wait_for(page, 'window.__MOCK.calls.updateCloud >= 1')
    up = json.loads(cloud_map(page)[PK]['content']['v'])
    check('profile：本地并集 a、b、plague2', set(local['ach']) == {'a', 'b'} and 'plague2' in local['cleared'], local)
    check('profile：云上也并成并集', set(up['ach']) == {'a', 'b'} and 'plague2' in up['cleared'], up)
    ctx.close()

    # 6 运行期：setItem 不立刻上传（30 秒窗口），flush / pagehide 才传；removeItem 删云上那条
    ctx, page, took = page_for(browser, BASE)
    page.evaluate(f'window.__RLP_STORE.setItem("{K2}", {json.dumps(save_raw(50))})')
    time.sleep(0.5)
    check('运行期：setItem 后 0.5 秒还没上传（30 秒合并窗口）', S(page, 'window.__MOCK.calls.addCloud') == 0)
    page.evaluate('window.dispatchEvent(new Event("pagehide"))')
    check('运行期：pagehide 马上上传', wait_for(page, 'window.__MOCK.calls.addCloud >= 1') and K2 in cloud_map(page))
    page.evaluate(f'window.__RLP_STORE.setItem("{K2}", {json.dumps(save_raw(60))})')
    page.evaluate('window.__RLP_STORE.cloud.flush()')
    check('运行期：已有记录走 update', S(page, 'window.__MOCK.calls.updateCloud') >= 1 and json.loads(cloud_map(page)[K2]['content']['v'])['savedAt'] == 60)
    page.evaluate(f'window.__RLP_STORE.removeItem("{K2}")')
    page.evaluate('window.__RLP_STORE.cloud.flush()')
    check('重置进度：removeItem 后云上那条被删', K2 not in cloud_map(page), cloud_map(page))
    ctx.close()

    # 7 墓碑：云很慢（2 秒才回），ready 之后玩家重置进度 → 云回来的旧存档不能复活
    cfg = dict(BASE, cloudLatency=2000, cloudSeed=[rec('a1', K1, save_raw(500, tag='old'))], localSeed={K1: save_raw(100)})
    ctx, page, took = page_for(browser, cfg)
    check('慢云：ready 最多多等 1.2 秒', took < 2.6, took)
    page.evaluate(f'window.__RLP_STORE.removeItem("{K1}")')
    wait_for(page, 'window.__MOCK.calls.removeCloud >= 1', 10)
    check('墓碑：云上旧存档没有复活到本地', S(page, f'window.__RLP_STORE.getItem("{K1}")') is None and not json.loads(json.dumps(S(page, 'window.__MOCK.store'))).get('rlp3d_2esave_2eplague1'))
    check('墓碑：云上那条也被删了', K1 not in cloud_map(page), cloud_map(page))
    ctx.close()

    # 8 慢云（没被重置）：ready 后云回来 → 后台合并，getItem 变成云上更新的
    cfg = dict(BASE, cloudLatency=2000, cloudSeed=[rec('a1', K1, save_raw(500, tag='cloud'))], localSeed={K1: save_raw(100, tag='local')})
    ctx, page, took = page_for(browser, cfg)
    first = json.loads(S(page, f'window.__RLP_STORE.getItem("{K1}")'))['tag']
    wait_for(page, f'JSON.parse(window.__RLP_STORE.getItem("{K1}")).tag === "cloud"', 6)
    check('慢云：ready 时先是本地的，云回来后后台合并成云上的', first == 'local' and json.loads(S(page, f'window.__RLP_STORE.getItem("{K1}")'))['tag'] == 'cloud', first)
    ctx.close()

    # 9 云查询挂起：ready 不被拦住；4 秒调用超时后云层关掉，本地层照常
    cfg = dict(BASE, hangQuery=True, localSeed={K1: save_raw(1)})
    ctx, page, took = page_for(browser, cfg)
    check('云查询挂起：ready 在 1.2 秒云等待后就放行', took < 2.6 and S(page, 'window.__RLP_STORE.mode()') == 'xhs', took)
    check('云查询挂起：本地存档照常读写', S(page, f'window.__RLP_STORE.getItem("{K1}")') is not None)
    wait_for(page, '!window.__RLP_STORE.cloud.on() && window.__RLP_STORE.cloud.stats.reason', 7)
    check('云查询挂起：4 秒后云层关闭并记原因', S(page, 'window.__RLP_STORE.cloud.on()') is False and '超时' in S(page, 'window.__RLP_STORE.cloud.stats.reason'), S(page, 'window.__RLP_STORE.cloud.stats'))
    ctx.close()

    # 10 未授权 1006 / 1005：降级，不抛、不拦
    for code in (1006, 1005, 10003):
        cfg = dict(BASE, queryFail={'errMsg': 'queryCloudStorage:fail', 'errCode': code}, localSeed={K1: save_raw(1)})
        ctx, page, took = page_for(browser, cfg)
        page.evaluate(f'window.__RLP_STORE.setItem("{K2}", {json.dumps(save_raw(2))})')
        page.evaluate('window.__RLP_STORE.cloud.flush()')
        check(f'未授权 errCode {code}：云层关闭，本地层照常', S(page, 'window.__RLP_STORE.cloud.on()') is False and str(code) in S(page, 'window.__RLP_STORE.cloud.stats.reason')
              and S(page, f'window.__RLP_STORE.getItem("{K2}")') is not None and S(page, 'window.__MOCK.calls.addCloud') == 0, S(page, 'window.__RLP_STORE.cloud.stats'))
        ctx.close()

    # 11 单条过大：> 60 KB 不上传，其它照传
    big = json.dumps({'v': 2, 'savedAt': 9, 'pad': 'x' * 70000})
    cfg = dict(BASE, localSeed={K1: big, K2: save_raw(3)})
    ctx, page, took = page_for(browser, cfg)
    wait_for(page, 'window.__MOCK.calls.addCloud >= 1')
    cm = cloud_map(page)
    check('过大：70 KB 的存档不上云，小的照传', K1 not in cm and K2 in cm and S(page, 'window.__RLP_STORE.cloud.stats.skipped') == 1, sorted(cm))
    ctx.close()

    # 12 add 结果 UNKNOWN：下次先查一遍对账，不重复新增
    cfg = dict(BASE, addUnknownOnce=True, localSeed={K1: save_raw(10)})
    ctx, page, took = page_for(browser, cfg)
    wait_for(page, 'window.__MOCK.calls.addCloud >= 1')
    page.evaluate(f'window.__RLP_STORE.setItem("{K1}", {json.dumps(save_raw(20))})')
    page.evaluate('window.__RLP_STORE.cloud.flush()')
    cm = S(page, 'window.__MOCK.cloud')
    check('UNKNOWN 对账：云上只有一条，且是最新的（没有重复新增）', len(cm) == 1 and json.loads(cm[0]['content']['v'])['savedAt'] == 20 and S(page, 'window.__MOCK.calls.addCloud') == 1, cm)
    ctx.close()

    # 13 add FAILED：留着，下次重试成功
    cfg = dict(BASE, addFailOnce=True, localSeed={K1: save_raw(10)})
    ctx, page, took = page_for(browser, cfg)
    wait_for(page, 'window.__MOCK.calls.addCloud >= 1')
    page.evaluate('window.__RLP_STORE.cloud.flush()')
    check('FAILED 重试：第二次 flush 新增成功', K1 in cloud_map(page) and S(page, 'window.__MOCK.calls.addCloud') == 2, S(page, 'window.__MOCK.calls'))
    ctx.close()

    # 14 重复记录：两台设备同时第一次上传 → 合并成较新的一条，多余的删掉
    cfg = dict(BASE, cloudSeed=[rec('d1', K1, save_raw(10, tag='old')), rec('d2', K1, save_raw(90, tag='new'))])
    ctx, page, took = page_for(browser, cfg)
    wait_for(page, 'window.__MOCK.calls.removeCloud >= 1')
    cm = S(page, 'window.__MOCK.cloud')
    check('重复记录：合并后本地是较新的', json.loads(S(page, f'window.__RLP_STORE.getItem("{K1}")'))['tag'] == 'new')
    check('重复记录：云上只剩一条且是较新的', len(cm) == 1 and json.loads(cm[0]['content']['v'])['tag'] == 'new', cm)
    ctx.close()

    # 15 云写入连续失败：退避，不抛未处理拒绝，本地层不受影响
    cfg = dict(BASE, writeFail={'errMsg': 'x:fail net'}, localSeed={K1: save_raw(1)})
    ctx, page, took = page_for(browser, cfg)
    wait_for(page, 'window.__MOCK.calls.addCloud >= 1')
    check('云写入失败：本地照常、没有未处理拒绝', S(page, 'window.__RLP_STORE.mode()') == 'xhs' and S(page, 'window.__unhandled') == 0 and S(page, 'window.__RLP_STORE.cloud.stats.failures') >= 1, S(page, 'window.__RLP_STORE.cloud.stats'))
    ctx.close()

    # 16 没有云接口（老客户端的版本号但缺方法）→ 关闭
    ctx, page, took = page_for(browser, dict(BASE, noCloudApi=True, localSeed={K1: save_raw(1)}))
    check('缺云接口：云层不启用，本地层照常', S(page, 'window.__RLP_STORE.cloud.on()') is False and S(page, 'window.__MOCK.calls.queryCloud') == 0
          and S(page, 'window.__RLP_STORE.mode()') == 'xhs' and S(page, f'window.__RLP_STORE.getItem("{K1}")') is not None, S(page, 'window.__RLP_STORE.cloud.stats'))
    ctx.close()


if __name__ == '__main__':
    with sync_playwright() as p:
        browser = p.chromium.launch()
        run(browser)
        browser.close()
    ok = all(results)
    print(f'\n{sum(results)}/{len(results)} 通过', flush=True)
    sys.exit(0 if ok else 1)
