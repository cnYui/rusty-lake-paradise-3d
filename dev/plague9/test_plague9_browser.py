"""第九灾验收：自动通关、真实鼠标 / 数字键完整通关、中途读档、拿错东西和门禁、夜景、菜单 wip、触屏；本地截图不参与部署。"""
import json
import math
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'common'))
from shot import serve  # noqa: E402

OUT = Path(__file__).resolve().parent / 'media'
OUT.mkdir(parents=True, exist_ok=True)

TARGET = """id => {
  const c=RLP.ctx, spec=c.hotspots.get(id);
  if (!spec || !c.hotspots.enabled(id)) throw new Error('热点不可用：'+id);
  c.world.root.updateMatrixWorld(true); c.engine.camera.updateMatrixWorld(true);
  const rect=c.engine.canvas.getBoundingClientRect(), points=[];
  const sample=o=>{
    const b=new c.THREE.Box3().setFromObject(o), p=new c.THREE.Vector3();
    if(b.isEmpty()) return;
    for(const x of [.5,.25,.75,.1,.9]) for(const y of [.5,.25,.75,.1,.9]) {
      p.set(b.min.x+(b.max.x-b.min.x)*x,b.min.y+(b.max.y-b.min.y)*y,(b.min.z+b.max.z)/2);
      points.push(p.clone());
    }
    b.getCenter(p); points.unshift(p.clone());
  };
  sample(spec.object); spec.object.traverse(o=>{if(o.isMesh&&o.visible) sample(o);});
  for(const p of points) {
    p.project(c.engine.camera);
    if(p.z>1||p.z< -1||Math.abs(p.x)>.98||Math.abs(p.y)>.96) continue;
    const x=rect.left+(p.x+1)*rect.width/2, y=rect.top+(1-p.y)*rect.height/2;
    if(c.hotspots.pickAt(x,y)?.spec.id===id && document.elementFromPoint(x,y)===c.engine.canvas) return {x,y};
  }
  throw new Error('画面中找不到可点击的射线：'+id+'，视图：'+c.state.view);
}"""


def boot(page, base, url='index.html?autotest=1&chapter=9&norender=1'):
    page.set_default_timeout(120000)
    page.goto(base + url, wait_until='domcontentloaded')
    page.wait_for_function('window.RLP && RLP.ready')
    page.evaluate("""() => {
      if(RLP.bootError) throw new Error(RLP.bootError);
      RLP.timeScale=25; RLP.ctx.engine.renderEnabled=false;
    }""")


def shot(page, name):
    page.evaluate('async () => { await RLP.ctx.ui.fade(0,0); RLP.ctx.ui.clearSay(); RLP.ctx.engine.render(); }')
    page.screenshot(path=str(OUT / f'{name}.png'))


def settle(page):
    page.wait_for_function('RLP.ctx.ui.docOpen || (!RLP.ctx.hotspots.busy && !RLP.ctx.views.transitioning && !RLP.ctx.ui.locked)')
    if page.evaluate('RLP.ctx.ui.docOpen'):
        page.keyboard.press('Escape')
    page.evaluate('async () => { RLP.ctx.views.dropPointer(); await RLP.idle(); }')


def real_click(page, id, touch=False):
    # CSS 入场动画不随游戏加速，采样坐标前必须等画布稳定。
    page.evaluate("""async id => {
      const c=RLP.ctx;
      await Promise.all(c.engine.canvas.getAnimations().map(a=>a.finished)); await RLP.idle();
      if(c.views.freeMode) {
        c.world.root.updateMatrixWorld(true);
        const target=new c.THREE.Box3().setFromObject(c.hotspots.get(id).object).getCenter(new c.THREE.Vector3());
        RLP.roamTo(c.engine.camera.position.toArray(),target.toArray());
      }
      c.views.dropPointer(); await RLP.idle();
    }""", id)
    before = page.evaluate('id=>({view:RLP.state.view,goto:RLP.ctx.hotspots.get(id)?.goto,modal:RLP.ctx.ui.modalOpen})', id)
    try:
        assert not before['modal'], before
        point = page.evaluate(TARGET, id)
        if touch:
            page.touchscreen.tap(point['x'], point['y'])
        else:
            page.mouse.click(point['x'], point['y'])
        settle(page)
        if before.get('goto'):
            assert page.evaluate('RLP.state.view') == before['goto'], before
    except Exception:
        print('点击失败：', id, before, page.evaluate('RLP.info()'), flush=True)
        shot(page, 'failed-' + id)
        raise


def use(page, item, target, touch=False):
    page.evaluate('RLP.state.select(null)')
    index = page.evaluate('id=>RLP.state.inventory.indexOf(id)', item)
    assert index >= 0, item
    if touch:
        page.locator('.slot').nth(index).tap()
    else:
        page.keyboard.press(['1','2','3','4','5','6','7','8','9','0','-','='][index])
    assert page.evaluate('RLP.state.selected') == item
    real_click(page, target, touch)


def close(a, b, eps=1e-3):
    return abs(a - b) < eps


def checkpoint(page, kind):
    page.evaluate('RLP.state.save()')
    raw = page.evaluate('localStorage.getItem("rlp3d.save.plague9")')
    flags = page.evaluate('RLP.state.flags')
    inventory = page.evaluate('RLP.state.inventory')
    page.evaluate('async ()=>await RLP.start(9,{fresh:true,skipIntro:true})')
    page.evaluate("""async raw=>{
      localStorage.setItem('rlp3d.save.plague9',raw);
      await RLP.start(9,{fresh:false,skipIntro:true});
      RLP.chapter.sync(RLP.ctx); RLP.chapter.sync(RLP.ctx);
    }""", raw)
    assert page.evaluate('RLP.state.flags') == flags
    assert page.evaluate('RLP.state.inventory') == inventory
    w = 'RLP.ctx.p9.world'
    if kind == 'grinder':
        # 斗里放着东西：露出的那一小块可见，托盘空
        assert page.evaluate(w + '.grinder.getObjectByName("grinder_inside").visible')
        assert not page.evaluate(w + '.grinder.getObjectByName("grinder_heap").visible')
    if kind == 'dial':
        rot = page.evaluate(w + '.cabinet.getObjectByName("cab_dial").children.filter(o=>o.name.startsWith("dial_hand_")).map(h=>h.rotation.z)')
        assert all(close(r, -h * math.pi / 6) for r, h in zip(rot, flags['dial_hands'])), (rot, flags['dial_hands'])
    if kind == 'orrery':
        e, m = page.evaluate(w + '.orrery.getObjectByName("earth_arm").rotation.y'), page.evaluate(w + '.orrery.getObjectByName("moon_arm").rotation.y')
        o = flags['orrery']
        assert close(e, o['earth'] * math.pi / 4) and close(m, (o['moon'] - o['earth']) * math.pi / 4), (e, m, o)
    if kind == 'candle':
        pos = page.evaluate(w + '.attic.getObjectByName("attic_candle").position.toArray()')
        want = page.evaluate("async i=>(await import('./src/art/props_p9_tower.js')).candleSpot(i)", flags['candle_at'])
        assert close(pos[0], want[0]) and close(pos[2], want[2]), (pos, want)
    if kind == 'fire':
        # 撒过的粉末：石头圈上亮着对应的符号；骨粉之前火还在烧
        assert page.evaluate(w + '.fire.userData.state.fire') == 'low'
        lit = page.evaluate(w + '.fire.userData.state.stones.filter(Boolean).length')
        assert lit == sum(1 for k in ('aries', 'libra', 'gemini', 'scorpio') if flags.get(f'shadow_{k}')), lit
    if kind == 'temple':
        assert page.evaluate(w + '.holder.userData.state.lowered') == 0.8
        assert page.evaluate(w + '.font.userData.state.lit')
        assert page.evaluate(w + '.painting.userData.state.framed') == 1
        assert page.evaluate(w + '.fire.userData.state.fire') == 'out' and not page.evaluate(w + '.fire.userData.cube.visible')
        assert not page.evaluate(w + '.crate.userData.owl.visible') and page.evaluate(w + '.crate.userData.lid.rotation.x') < -1


def run():
    server, port = serve()
    base = f'http://127.0.0.1:{port}/'
    results, errors, failed_requests = {}, [], []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
            page = browser.new_page(viewport={'width': 1280, 'height': 720})
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('requestfailed', lambda r: failed_requests.append(r.url))
            boot(page, base)
            page.evaluate('async ()=>await RLP.start(9,{skipIntro:true})')
            auto = page.evaluate('async ()=>await RLP.autoplay({stepDelay:0,stepTimeout:60000})')
            (OUT / 'autoplay.json').write_text(json.dumps(auto, ensure_ascii=False, indent=2), encoding='utf-8')
            assert auto['ok'], auto['failedStep']
            assert auto['flags']['plague9_complete']
            assert sorted(auto['achievements']) == ['p9_blood_moon', 'p9_shadow_play', 'p9_woodpecker', 'p9_zodiac'], auto['achievements']
            results['autoplay'] = {'steps': auto['steps'], 'total': auto['total'], 'warnings': auto['warnings']}
            print('自动通关通过：', auto['steps'], flush=True)

            page.evaluate('async ()=>await RLP.start(9,{fresh:true,skipIntro:true})')
            reset = page.evaluate("""()=>{
              const w=RLP.ctx.p9.world, f=w.fire.userData.state;
              return {inv:RLP.state.inventory, fire:f.fire, stones:f.stones.filter(Boolean).length, cube:w.fire.userData.cube.visible,
                owl:w.crate.userData.owl.visible, bones:w.crate.userData.bones.visible, bark:w.birch.userData.bark.visible,
                shell:w.shell.visible, pickaxe:w.pickaxe.visible, blueStone:w.blueStone.visible, ice:w.ice.visible,
                key:w.cabinet.userData.key.visible, holder:w.holder.userData.state.cube, lit:w.font.userData.state.lit,
                painting:w.painting.userData.state, moon:w.sky.userData.blood};
            }""")
            assert reset == {'inv': [], 'fire': 'low', 'stones': 0, 'cube': False, 'owl': True, 'bones': False, 'bark': True,
                             'shell': True, 'pickaxe': True, 'blueStone': True, 'ice': False, 'key': False, 'holder': False,
                             'lit': False, 'painting': {'lit': 0, 'cleared': 0, 'framed': 0}, 'moon': 0}, reset
            results['new_game_reset'] = True

            # 夜景：天染成深蓝；塔门前那块大石头压进了地里（门前 2 m 内没有高出地面的岩石顶点）；神殿窗户是夜空
            night = page.evaluate("""async ()=>{
              const { groundHeight } = await import('./src/art/island.js');
              const c=RLP.ctx, w=c.p9.world; let rocks=null;
              c.world.root.traverse(o=>{ if(!rocks && o.isMesh && o.name==='rocks') rocks=o; });
              const pos=rocks.geometry.attributes.position, d=w.towerDoor.position, a=w.towerDoor.rotation.y;
              const fx=d.x+Math.sin(a)*1.9, fz=d.z+Math.cos(a)*1.9; let blocking=0;
              for(let i=0;i<pos.count;i++){ const x=pos.getX(i), z=pos.getZ(i); if(Math.hypot(x-fx,z-fz)<1.6 && pos.getY(i)>groundHeight(x,z)+0.3) blocking++; }
              const win=c.world.zones.temple_int.getObjectByName('temple_int_windowL_view');
              return {tint:!!c.world.sky.fogState.tint, blocking, window:win.material.map===w.templeSky.material.map};
            }""")
            assert night == {'tint': True, 'blocking': 0, 'window': True}, night
            results['night_scene'] = night

            steps = page.evaluate('RLP.chapter.walkthrough')
            real_steps, checkpoints = 0, set()
            for step in steps:
                if 'go' in step:
                    page.evaluate('async id=>await RLP.goto(id,{instant:true})', step['go'])
                elif 'click' in step or 'use' in step:
                    target = step.get('click', step.get('on'))
                    if 'use' in step:
                        use(page, step['use'], target)
                    else:
                        page.evaluate('RLP.state.select(null)')
                        real_click(page, target)
                    real_steps += 1
                    if real_steps % 25 == 0:
                        print('真实鼠标 / 数字键已通过：', real_steps, flush=True)
                    kind = None
                    f = page.evaluate('RLP.state.flags')
                    if f.get('grinder_in') and 'grinder' not in checkpoints: kind = 'grinder'
                    if f.get('dial_hands') and not f.get('drawer_open') and 'dial' not in checkpoints: kind = 'dial'
                    if f.get('orrery') and not f.get('blood_moon') and 'orrery' not in checkpoints: kind = 'orrery'
                    if f.get('shadow_libra') and not f.get('fire_out') and 'fire' not in checkpoints: kind = 'fire'
                    if isinstance(f.get('candle_at'), int) and not f.get('shadows_done') and 'candle' not in checkpoints: kind = 'candle'
                    if kind:
                        checkpoint(page, kind); checkpoints.add(kind)
                        print('中途读档恢复通过：', kind, flush=True)
                elif 'back' in step:
                    page.keyboard.press('ArrowDown'); settle(page)
                elif 'expectFlag' in step:
                    assert page.evaluate('key=>!!RLP.state.flag(key)', step['expectFlag']), step
                elif 'expectItem' in step:
                    for item in [step['expectItem']] if isinstance(step['expectItem'], str) else step['expectItem']:
                        assert page.evaluate('id=>RLP.state.has(id)', item), item
                elif 'expectView' in step:
                    assert page.evaluate('RLP.state.view') == step['expectView'], step
            assert page.evaluate('!!RLP.state.flag("plague9_complete")')
            results['real_mouse_and_keyboard'] = real_steps
            shot(page, 'checked-ending')
            checkpoint(page, 'temple')
            results['partial_and_complete_save_load'] = sorted(checkpoints | {'temple'})
            print('真实输入完整通关和存档恢复通过', flush=True)

            # 门禁和拿错东西：梯子没放下不能上阁楼、月食前冰块点不了、影子没对上门打不开；
            # 树皮撒进火里、镐用在挂锁上都不会被用掉；研磨机斗里有东西时不能再放
            page.evaluate('async ()=>await RLP.start(9,{fresh:true,skipIntro:true})')
            # hotspots.enabled() 只看当前视图：逐个走到热点所在的视图再查
            GATES = [['ladder', 'p9_ladder_up', 'p9_tower'], ['ice', 'p9_ice_zoom', 'p9_tower_path'], ['beacon', 'p9_beacon_zoom', 'p9_attic'], ['cube', 'p9_fire_cube', 'p9_fire']]
            check_gates = """async (pairs)=>{ const out={}; for (const [k,id,view] of pairs) { await RLP.goto(view,{instant:true}); out[k]=RLP.ctx.hotspots.enabled(id); } return out; }"""
            gates = page.evaluate(check_gates, GATES)
            assert gates == {'ladder': False, 'ice': False, 'beacon': False, 'cube': False}, gates
            page.evaluate('async ()=>{ RLP.state.give("bark"); RLP.state.give("pickaxe"); RLP.state.give("shell"); await RLP.goto("p9_fire",{instant:true}); }')
            use(page, 'bark', 'p9_fire')
            assert page.evaluate('RLP.state.has("bark")') and not page.evaluate('!!RLP.state.flag("shadow_aries")')
            page.evaluate('async ()=>await RLP.goto("p9_chain",{instant:true})')
            use(page, 'pickaxe', 'p9_padlock')
            assert page.evaluate('RLP.state.has("pickaxe")') and not page.evaluate('!!RLP.state.flag("padlock_open")')
            page.evaluate('async ()=>await RLP.goto("p9_grinder",{instant:true})')
            use(page, 'bark', 'p9_hopper')
            assert page.evaluate('RLP.state.flag("grinder_in")') == 'bark' and not page.evaluate('RLP.state.has("bark")')
            use(page, 'shell', 'p9_hopper')
            assert page.evaluate('RLP.state.flag("grinder_in")') == 'bark' and page.evaluate('RLP.state.has("shell")')
            page.evaluate('RLP.state.setFlag("ladder_down"); RLP.state.setFlag("blood_moon"); RLP.state.setFlag("shadows_done"); RLP.state.setFlag("fire_out"); RLP.chapter.sync(RLP.ctx)')
            gates = page.evaluate(check_gates, GATES)
            assert gates == {'ladder': True, 'ice': True, 'beacon': True, 'cube': True}, gates
            results['gates_and_wrong_items'] = True

            # 菜单：第九灾还是 wip，正常菜单“敬请期待”；?wip=1（同时跳过解锁顺序，见 progress.js）才能进
            boot(page, base, 'index.html?norender=1')
            assert 'open' not in page.locator('.plague').nth(8).get_attribute('class')
            page.evaluate("localStorage.setItem('rlp3d.profile', JSON.stringify({v: 1, ach: {}, cleared: {plague1: {t: 1}, plague2: {t: 1}, plague3: {t: 1}, plague4: {t: 1}, plague5: {t: 1}, plague6: {t: 1}, plague7: {t: 1}, plague8: {t: 1}}}))")
            boot(page, base, 'index.html?norender=1&wip=1')
            assert 'open' in page.locator('.plague').nth(8).get_attribute('class')
            page.locator('.plague').nth(8).click()
            page.wait_for_function('window.RLP && RLP.ready && RLP.chapter?.number===9')
            assert page.evaluate('RLP.bootError') is None
            results['menu_wip_and_unlock'] = True
            page.close()

            mobile = browser.new_context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True)
            phone = mobile.new_page()
            phone.on('pageerror', lambda e: errors.append(str(e)))
            phone.on('requestfailed', lambda r: failed_requests.append(r.url))
            boot(phone, base)
            phone.evaluate('async ()=>await RLP.start(9,{fresh:true,skipIntro:true,view:"p9_woodpecker"})')
            real_click(phone, 'p9_knot_2', True)
            assert phone.evaluate('RLP.state.flag("pecks")') == 2
            shot(phone, 'checked-touch-woodpecker')
            phone.evaluate('async ()=>await RLP.goto("p9_dial",{instant:true})')
            real_click(phone, 'p9_hand_0', True)
            assert phone.evaluate('RLP.state.flag("dial_hands")')[0] == 10
            shot(phone, 'checked-touch-dial')
            phone.evaluate('async ()=>{ RLP.state.give("shell"); await RLP.goto("p9_grinder",{instant:true}); }')
            use(phone, 'shell', 'p9_hopper', True)
            assert phone.evaluate('RLP.state.flag("grinder_in")') == 'shell'
            assert phone.evaluate('RLP.ctx.ui.touchMode')
            results['touch_woodpecker_dial_and_inventory'] = True
            mobile.close()
            browser.close()
        assert not errors, errors
        assert not failed_requests, failed_requests
        (OUT / 'browser-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(results, ensure_ascii=False, indent=2), flush=True)
    finally:
        server.shutdown()


if __name__ == '__main__':
    run()
