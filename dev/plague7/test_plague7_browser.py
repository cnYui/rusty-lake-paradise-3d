"""第七灾验收：自动通关、真实鼠标 / 数字键完整通关、中途读档、冰块死局重置、滑冰、菜单解锁、触屏；本地截图不参与部署。"""
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


def boot(page, base, url='index.html?autotest=1&chapter=7&norender=1'):
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
    raw = page.evaluate('localStorage.getItem("rlp3d.save.plague7")')
    flags = page.evaluate('RLP.state.flags')
    inventory = page.evaluate('RLP.state.inventory')
    page.evaluate('async ()=>await RLP.start(7,{fresh:true,skipIntro:true})')
    page.evaluate("""async raw=>{
      localStorage.setItem('rlp3d.save.plague7',raw);
      await RLP.start(7,{fresh:false,skipIntro:true});
      RLP.chapter.sync(RLP.ctx); RLP.chapter.sync(RLP.ctx);
    }""", raw)
    assert page.evaluate('RLP.state.flags') == flags
    assert page.evaluate('RLP.state.inventory') == inventory
    w = 'RLP.ctx.p7.world'
    if kind == 'skate':
        pos = page.evaluate(w + '.skater.position.toArray()')
        want = page.evaluate('p=>{const C=1.2;return [(p[0]-3)*C,0,(p[1]-2)*C];}', flags['skate_pos'])
        assert all(abs(a - b) < 1e-6 for a, b in zip(pos, want)), (pos, want)
    if kind == 'ice':
        pressed = page.evaluate(w + ".icepool.userData.cells.flat().filter(c=>c.visible&&c.getObjectByName('ice_pressed')).length")
        assert pressed == ''.join(flags['icepool_cells']).count('F'), pressed
    if kind == 'snowman':
        shown = page.evaluate(w + '.snowman.userData.parts')
        assert page.evaluate(w + '.snowman.userData.parts.scarf.visible') == ('scarf' in flags['snowman_parts'])
        assert shown is not None
    if kind == 'temple':
        assert page.evaluate(w + '.holder.userData.state.lowered') == 0.8
        assert page.evaluate(w + '.font.userData.state.lit')
        assert page.evaluate(w + '.painting.userData.state.framed') == 1
        assert page.evaluate(w + '.snowman.userData.face.visible')


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
            page.evaluate('async ()=>await RLP.start(7,{skipIntro:true})')
            auto = page.evaluate('async ()=>await RLP.autoplay({stepDelay:0,stepTimeout:60000})')
            (OUT / 'autoplay.json').write_text(json.dumps(auto, ensure_ascii=False, indent=2), encoding='utf-8')
            assert auto['ok'], auto['failedStep']
            assert auto['flags']['plague7_complete']
            assert sorted(auto['achievements']) == ['p7_ice_cream', 'p7_snowman', 'p7_three_diamonds'], auto['achievements']
            results['autoplay'] = {'steps': auto['steps'], 'total': auto['total'], 'warnings': auto['warnings']}
            print('自动通关通过：', auto['steps'], flush=True)

            page.evaluate('async ()=>await RLP.start(7,{fresh:true,skipIntro:true})')
            reset = page.evaluate("""()=>{
              const w=RLP.ctx.p7.world;
              return {inv:RLP.state.inventory,holder:w.holder.userData.state.cube,lower:w.holder.userData.state.lowered,
                lit:w.font.userData.state.lit,painting:w.painting.userData.state,cage:w.cage.visible,cube:w.cube.visible,
                hammer:w.templeHammer.visible,snowFace:w.snowman.userData.face.visible,ball:w.machine.userData.ball.visible};
            }""")
            assert reset == {'inv': [], 'holder': False, 'lower': 0, 'lit': False, 'painting': {'lit': 0, 'cleared': 0, 'framed': 0},
                             'cage': False, 'cube': False, 'hammer': True, 'snowFace': False, 'ball': True}, reset
            results['new_game_reset'] = True

            steps = page.evaluate('RLP.chapter.walkthrough')
            real_steps, checkpoints = 0, set()
            for step in steps:
                if 'go' in step:
                    page.evaluate('async id=>await RLP.goto(id,{instant:true})', step['go'])
                elif 'click' in step or 'use' in step:
                    target = step.get('click', step.get('on'))
                    # 冰池第一关：先故意走进死局（右上立冰压左上平冰之外的那块），点石头重来
                    if target == 'p7_ice_1_0' and 'ice_reset' not in results:
                        real_click(page, 'p7_ice_1_0'); real_click(page, 'p7_ice_2_0')
                        assert page.evaluate('RLP.state.flag("icepool_cells")')[0][2] == 'F'
                        real_click(page, 'p7_ice_reset')
                        assert page.evaluate('RLP.state.flag("icepool_cells")') is None
                        results['ice_reset'] = True
                    if 'use' in step:
                        use(page, step['use'], target)
                    else:
                        page.evaluate('RLP.state.select(null)')
                        real_click(page, target)
                    real_steps += 1
                    if real_steps % 25 == 0:
                        print('真实鼠标 / 数字键已通过：', real_steps, flush=True)
                    kind = None
                    if page.evaluate('!!RLP.state.flag("skate_pos")') and 'skate' not in checkpoints: kind = 'skate'
                    if page.evaluate('(RLP.state.flag("icepool_cells")||[]).join("").includes("F")') and 'ice' not in checkpoints: kind = 'ice'
                    if len(page.evaluate('RLP.state.flag("snowman_parts")||[]')) == 2 and 'snowman' not in checkpoints: kind = 'snowman'
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
            assert page.evaluate('!!RLP.state.flag("plague7_complete")')
            results['real_mouse_and_keyboard'] = real_steps
            shot(page, 'checked-ending')
            checkpoint(page, 'temple')
            results['partial_and_complete_save_load'] = sorted(checkpoints | {'temple'})
            print('真实输入完整通关和存档恢复通过', flush=True)

            # 门禁：Gerard 第一支只收草莓；冰块不先插尖木头敲不开
            page.evaluate('async ()=>await RLP.start(7,{fresh:true,skipIntro:true,view:"p7_gerard"})')
            page.evaluate('RLP.state.give("ice_cream_pistachio")')
            use(page, 'ice_cream_pistachio', 'p7_gerard')
            assert not page.evaluate('!!RLP.state.flag("gerard_ate_1")') and page.evaluate('RLP.state.has("ice_cream_pistachio")')
            page.evaluate('async ()=>{ RLP.state.give("hammer"); await RLP.goto("p7_iceblock",{instant:true}); }')
            use(page, 'hammer', 'p7_iceblock')
            assert not page.evaluate('!!RLP.state.flag("youth_free")')
            results['gates'] = True

            # 菜单：第七灾还是 wip，正常菜单“敬请期待”；?wip=1（同时跳过解锁顺序，见 progress.js）才能进
            boot(page, base, 'index.html?norender=1')
            assert 'open' not in page.locator('.plague').nth(6).get_attribute('class')
            page.evaluate("localStorage.setItem('rlp3d.profile', JSON.stringify({v: 1, ach: {}, cleared: {plague1: {t: 1}, plague2: {t: 1}, plague3: {t: 1}, plague4: {t: 1}, plague5: {t: 1}, plague6: {t: 1}}}))")
            boot(page, base, 'index.html?norender=1&wip=1')
            assert 'open' in page.locator('.plague').nth(6).get_attribute('class')
            page.locator('.plague').nth(6).click()
            page.wait_for_function('window.RLP && RLP.ready && RLP.chapter?.number===7')
            assert page.evaluate('RLP.bootError') is None
            results['menu_wip_and_unlock'] = True
            page.close()

            mobile = browser.new_context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True)
            phone = mobile.new_page()
            phone.on('pageerror', lambda e: errors.append(str(e)))
            phone.on('requestfailed', lambda r: failed_requests.append(r.url))
            boot(phone, base)
            phone.evaluate('async ()=>await RLP.start(7,{fresh:true,skipIntro:true,view:"p7_skate"})')
            real_click(phone, 'p7_rink_6_0', True)
            assert phone.evaluate('RLP.state.flag("skate_pos")') == [6, 0]
            real_click(phone, 'p7_rink_6_4', True)
            assert phone.evaluate('RLP.state.flag("skate_pos")') == [6, 4]
            shot(phone, 'checked-touch-skate')
            phone.evaluate('async ()=>await RLP.goto("p7_icepool",{instant:true})')
            real_click(phone, 'p7_ice_1_0', True)
            real_click(phone, 'p7_ice_0_0', True)
            assert phone.evaluate('RLP.state.flag("icepool_cells")')[0][0] == 'F'
            shot(phone, 'checked-touch-ice')
            phone.evaluate('async ()=>await RLP.goto("p7_forest",{instant:true})')
            real_click(phone, 'p7_branches', True)
            phone.locator('.slot').first.tap()
            assert phone.evaluate('RLP.state.selected') == 'branches'
            assert phone.evaluate('RLP.ctx.ui.touchMode')
            results['touch_skate_ice_and_inventory'] = True
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
