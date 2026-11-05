"""第六灾验收：自动通关、真实鼠标 / 数字键完整通关、中途读档、倒错体液、门禁、菜单解锁、触屏；本地截图不参与部署。"""
import json
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


def boot(page, base, url='index.html?autotest=1&chapter=6&norender=1'):
    page.set_default_timeout(90000)
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


def checkpoint(page, kind):
    page.evaluate('RLP.state.save()')
    raw = page.evaluate('localStorage.getItem("rlp3d.save.plague6")')
    flags = page.evaluate('RLP.state.flags')
    inventory = page.evaluate('RLP.state.inventory')
    page.evaluate('async ()=>await RLP.start(6,{fresh:true,skipIntro:true})')
    page.evaluate("""async raw=>{
      localStorage.setItem('rlp3d.save.plague6',raw);
      await RLP.start(6,{fresh:false,skipIntro:true});
      RLP.chapter.sync(RLP.ctx); RLP.chapter.sync(RLP.ctx);
    }""", raw)
    assert page.evaluate('RLP.state.flags') == flags
    assert page.evaluate('RLP.state.inventory') == inventory
    w = 'RLP.ctx.p6.world'
    if kind == 'boils':
        burst = page.evaluate(w + '.chest.userData.boils.map(b=>b.userData.burst.visible)')
        assert [i for i, v in enumerate(burst) if v] == sorted(flags['boils_popped']), burst
    if kind == 'flask':
        shown = page.evaluate(w + '.flask.userData.layers.filter(l=>l.visible).length')
        assert shown == len(flags['flask_layers']), shown
    if kind == 'teeth':
        assert page.evaluate(w + '.mouth.userData.state.order') == flags['teeth_order']
    if kind == 'temple':
        assert page.evaluate(w + '.holder.userData.state.lowered') == 0.8
        assert page.evaluate(w + '.font.userData.state.lit')
        assert page.evaluate(w + '.painting.userData.state.framed') == 1
        assert page.evaluate(w + '.chest.userData.clockHeart.visible')


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
            page.evaluate('async ()=>await RLP.start(6,{skipIntro:true})')
            auto = page.evaluate('async ()=>await RLP.autoplay({stepDelay:0,stepTimeout:60000})')
            (OUT / 'autoplay.json').write_text(json.dumps(auto, ensure_ascii=False, indent=2), encoding='utf-8')
            assert auto['ok'], auto['failedStep']
            assert auto['flags']['plague6_complete']
            assert sorted(auto['achievements']) == ['p6_clockwork', 'p6_four_humors', 'p6_lanced'], auto['achievements']
            results['autoplay'] = {'steps': auto['steps'], 'total': auto['total'], 'warnings': auto['warnings']}
            print('自动通关通过：', auto['steps'], flush=True)

            page.evaluate('async ()=>await RLP.start(6,{fresh:true,skipIntro:true})')
            reset = page.evaluate("""()=>{
              const w=RLP.ctx.p6.world;
              return {inv:RLP.state.inventory,holder:w.holder.userData.state.cube,lower:w.holder.userData.state.lowered,
                lit:w.font.userData.state.lit,painting:w.painting.userData.state,bottle:w.bottle.visible,doctor:w.doctor.visible,
                heart:w.chest.userData.heart.visible,boils:w.chest.userData.boils.every(b=>b.visible),
                clockOpen:w.clock.getObjectByName('clock_face_door').rotation.y};
            }""")
            assert reset == {'inv': [], 'holder': False, 'lower': 0, 'lit': False, 'painting': {'lit': 0, 'cleared': 0, 'framed': 0},
                             'bottle': True, 'doctor': False, 'heart': False, 'boils': True, 'clockOpen': 0}, reset
            results['new_game_reset'] = True

            steps = page.evaluate('RLP.chapter.walkthrough')
            real_steps, checkpoints = 0, set()
            for step in steps:
                if 'go' in step:
                    page.evaluate('async id=>await RLP.goto(id,{instant:true})', step['go'])
                elif 'click' in step or 'use' in step:
                    target = step.get('click', step.get('on'))
                    # 先故意倒错一次：量瓶倒空，体液留在物品栏
                    if target == 'p6_flask' and step.get('use') == 'tears' and 'wrong_pour_resets' not in results:
                        use(page, 'blood', 'p6_flask')
                        assert page.evaluate('RLP.state.flag("flask_layers")') == []
                        assert page.evaluate('RLP.state.has("blood")')
                        results['wrong_pour_resets'] = True
                    if 'use' in step:
                        use(page, step['use'], target)
                    else:
                        page.evaluate('RLP.state.select(null)')
                        real_click(page, target)
                    real_steps += 1
                    if real_steps % 25 == 0:
                        print('真实鼠标 / 数字键已通过：', real_steps, flush=True)
                    kind = None
                    if page.evaluate('(RLP.state.flag("boils_popped")||[]).length') == 6 and 'boils' not in checkpoints: kind = 'boils'
                    if len(page.evaluate('RLP.state.flag("flask_layers")||[]')) == 3 and 'flask' not in checkpoints: kind = 'flask'
                    if page.evaluate('!!RLP.state.flag("teeth_order")') and 'teeth' not in checkpoints: kind = 'teeth'
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
            assert page.evaluate('!!RLP.state.flag("plague6_complete")')
            results['real_mouse_and_keyboard'] = real_steps
            shot(page, 'checked-ending')
            checkpoint(page, 'temple')
            results['partial_and_complete_save_load'] = sorted(checkpoints | {'temple'})
            print('真实输入完整通关和存档恢复通过', flush=True)

            # 门禁：天堂门开之前走不进门内；钟拨对了但牙还没对上时不打开
            page.evaluate('async ()=>await RLP.start(6,{fresh:true,skipIntro:true,view:"p6_gate"})')
            assert not page.evaluate('RLP.ctx.views.canStand(0, 36)')
            page.evaluate('RLP.state.setFlag("clock_x",4); RLP.state.setFlag("clock_dots",8); RLP.chapter.sync(RLP.ctx)')
            page.evaluate('async ()=>await RLP.goto("p6_clock",{instant:true})')
            real_click(page, 'p6_hand_x')
            assert page.evaluate('RLP.state.flag("clock_x")') == 5
            assert not page.evaluate('!!RLP.state.flag("clock_open")')
            results['gates'] = True

            # 菜单：第六灾还是 wip，正常菜单“敬请期待”；?wip=1 且通关前五灾才能进
            boot(page, base, 'index.html?norender=1')
            assert 'open' not in page.locator('.plague').nth(5).get_attribute('class')
            page.evaluate("localStorage.setItem('rlp3d.profile', JSON.stringify({v: 1, ach: {}, cleared: {plague1: {t: 1}, plague2: {t: 1}, plague3: {t: 1}, plague4: {t: 1}, plague5: {t: 1}}}))")
            boot(page, base, 'index.html?norender=1&wip=1')
            assert 'open' in page.locator('.plague').nth(5).get_attribute('class')
            page.locator('.plague').nth(5).click()
            page.wait_for_function('window.RLP && RLP.ready && RLP.chapter?.number===6')
            assert page.evaluate('RLP.bootError') is None
            results['menu_wip_and_unlock'] = True
            page.close()

            mobile = browser.new_context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True)
            phone = mobile.new_page()
            phone.on('pageerror', lambda e: errors.append(str(e)))
            phone.on('requestfailed', lambda r: failed_requests.append(r.url))
            boot(phone, base)
            phone.evaluate('async ()=>await RLP.start(6,{fresh:true,skipIntro:true,view:"p6_chest"})')
            real_click(phone, 'p6_boil_0', True)
            real_click(phone, 'p6_boil_2', True)
            assert phone.evaluate('RLP.state.flag("boils_popped")') == []
            for i in [0, 1, 2, 3, 4, 9]:
                real_click(phone, f'p6_boil_{i}', True)
            assert phone.evaluate('RLP.state.flag("boils_popped")') == [0, 1, 2, 3, 4, 9]
            shot(phone, 'checked-touch-boils')
            phone.evaluate('async ()=>await RLP.goto("p6_gate",{instant:true})')
            real_click(phone, 'p6_bottle', True)
            phone.locator('.slot').first.tap()
            assert phone.evaluate('RLP.state.selected') == 'empty_bottle'
            assert phone.evaluate('RLP.ctx.ui.touchMode')
            results['touch_boils_and_inventory'] = True
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
