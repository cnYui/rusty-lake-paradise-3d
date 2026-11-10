"""第五灾验收：真实输入、完整通关、读档复位与漫游；本地截图不参与部署。"""
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


def boot(page, base, url='index.html?autotest=1&chapter=5&norender=1'):
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
    raw = page.evaluate('localStorage.getItem("rlp3d.save.plague5")')
    flags = page.evaluate('RLP.state.flags')
    inventory = page.evaluate('RLP.state.inventory')
    page.evaluate('async ()=>await RLP.start(5,{fresh:true,skipIntro:true})')
    page.evaluate("""async raw=>{
      localStorage.setItem('rlp3d.save.plague5',raw);
      await RLP.start(5,{fresh:false,skipIntro:true});
      RLP.chapter.sync(RLP.ctx); RLP.chapter.sync(RLP.ctx);
    }""", raw)
    assert page.evaluate('RLP.state.flags') == flags
    assert page.evaluate('RLP.state.inventory') == inventory
    if kind == 'field':
        assert page.evaluate('RLP.ctx.p5.world.field.userData.cells[4].userData.piece') == 0
    if kind == 'threads':
        assert page.evaluate('RLP.ctx.p5.world.constellation.userData.lines.children.length') == len(flags['constellation_edges'])
    if kind == 'burger':
        assert page.evaluate('RLP.ctx.p5.world.burger.userData.layers') == flags['burger_layers']
    if kind == 'temple':
        assert page.evaluate('RLP.ctx.p5.world.holder.userData.state.lowered') == 0.8
        assert page.evaluate('RLP.ctx.p5.world.font.userData.state.lit')
        assert page.evaluate('RLP.ctx.p5.world.painting.userData.state.framed') == 1


def run():
    server, port = serve()
    base = f'http://127.0.0.1:{port}/'
    results, errors, failed_requests = {}, [], []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
            page = browser.new_page(viewport={'width':1280,'height':720})
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('requestfailed', lambda r: failed_requests.append(r.url))
            boot(page, base)
            page.evaluate('async ()=>await RLP.start(5,{skipIntro:true})')
            auto = page.evaluate('async ()=>await RLP.autoplay({stepDelay:0,stepTimeout:60000})')
            (OUT / 'autoplay.json').write_text(json.dumps(auto, ensure_ascii=False, indent=2), encoding='utf-8')
            assert auto['ok'], auto['failedStep']
            assert auto['flags']['plague5_complete']
            results['autoplay'] = {'steps':auto['steps'],'total':auto['total'],'warnings':auto['warnings']}
            print('自动通关通过：', auto['steps'], flush=True)
            page.evaluate('async ()=>await RLP.start(5,{fresh:true,skipIntro:true})')
            reset = page.evaluate("""()=>{
              const w=RLP.ctx.p5.world;
              return {inv:RLP.state.inventory,holder:w.holder.userData.state.cube,lower:w.holder.userData.state.lowered,
                lit:w.font.userData.state.lit,reflect:w.font.userData.state.reflect,painting:w.painting.userData.state,
                knife:w.knife.visible,plant:w.plant.visible,bucket:w.bucket.visible,gerard:w.gerard.visible};
            }""")
            assert reset == {'inv':[],'holder':False,'lower':0,'lit':False,'reflect':False,'painting':{'lit':0,'cleared':0,'framed':0},'knife':True,'plant':True,'bucket':True,'gerard':True}, reset
            results['new_game_reset'] = True
            steps = page.evaluate('RLP.chapter.walkthrough')
            real_steps, captures, checkpoints = 0, set(), set()
            for step in steps:
                if 'go' in step:
                    page.evaluate('async id=>await RLP.goto(id,{instant:true})', step['go'])
                elif 'click' in step or 'use' in step:
                    target = step.get('click',step.get('on'))
                    if target == 'p5_plate' and not page.evaluate('!!RLP.state.flag("burger_layers")'):
                        before = page.evaluate('RLP.state.inventory')
                        use(page, 'bun_top', target)
                        assert page.evaluate('RLP.state.inventory') == before
                        assert not page.evaluate('!!RLP.state.flag("burger_layers")')
                        results['wrong_recipe_keeps_ingredient'] = True
                    if 'use' in step:
                        use(page, step['use'], target)
                    else:
                        page.evaluate('RLP.state.select(null)')
                        real_click(page, target)
                    real_steps += 1
                    if real_steps % 25 == 0:
                        print('真实鼠标 / 数字键已通过：', real_steps, flush=True)
                    view = page.evaluate('RLP.state.view')
                    if view not in captures and view in ['p5_cow','p5_skin','p5_field','p5_constellation','p5_kitchen','p5_cutboard','p5_dining','p5_table','p5_toilet','p5_memory','p5_altar','p5_painting']:
                        shot(page, 'checked-' + view); captures.add(view)
                    kind = None
                    if target == 'p5_field_cell_4' and 'field' not in checkpoints: kind = 'field'
                    if target == 'p5_thread_dot_2' and 'threads' not in checkpoints: kind = 'threads'
                    if page.evaluate('(RLP.state.flag("burger_layers")||[]).length') == 3 and 'burger' not in checkpoints: kind = 'burger'
                    if kind:
                        checkpoint(page, kind); checkpoints.add(kind)
                        print('中途读档恢复通过：', kind, flush=True)
                elif 'back' in step:
                    page.keyboard.press('ArrowDown'); settle(page)
                elif 'expectFlag' in step:
                    assert page.evaluate('key=>!!RLP.state.flag(key)', step['expectFlag']), step
            assert page.evaluate('!!RLP.state.flag("plague5_complete")')
            results['real_mouse_and_keyboard'] = real_steps
            shot(page, 'checked-ending')
            checkpoint(page, 'temple')
            results['partial_and_complete_save_load'] = sorted(checkpoints | {'temple'})
            print('真实输入完整通关、食材校验和存档恢复通过', flush=True)

            page.evaluate('async ()=>await RLP.start(5,{fresh:true,skipIntro:true,view:"p5_house"})')
            assert not page.evaluate('RLP.ctx.hotspots.enabled("p5_temple_entry")')
            assert not page.evaluate('RLP.ctx.views.neighbours(RLP.ctx.views.get("p5_temple")).up')
            assert not page.evaluate('RLP.ctx.hotspots.enabled("p5_toilet_entry")')
            assert page.locator('.arrows > .arrow.show').count() == 0
            page.evaluate('RLP.roamTo([5,1.8,-3.5],[3,1.5,-11.35])')
            outside = page.evaluate('RLP.ctx.views.roamInfo().pos')
            real_click(page, 'p5_house_entry')
            assert page.evaluate('RLP.ctx.views.roamInfo().pos') == [300,1.65,2.3]
            bounds = page.evaluate("""()=>({floor:RLP.ctx.views.canStand(300,2),wall:RLP.ctx.views.canStand(304,2),
              block:RLP.ctx.views.canStand(298.8,-.65),pan:RLP.ctx.views.canStand(301.25,-.7),person:RLP.ctx.views.canStand(298.8,-1.25)})""")
            assert bounds == {'floor':True,'wall':False,'block':False,'pan':False,'person':False}, bounds
            page.evaluate('RLP.roamTo([300.3,1.65,1.7],[301.25,.9,-.7])')
            inside = page.evaluate('RLP.ctx.views.roamInfo().pos')
            real_click(page, 'p5_pot_zoom')
            page.keyboard.press('ArrowDown'); settle(page)
            assert page.evaluate('RLP.ctx.views.roamInfo().pos') == inside
            assert not page.evaluate('RLP.ctx.hotspots.enabled("p5_field_entry")')
            real_click(page, 'p5_kitchen_exit')
            assert page.evaluate('RLP.ctx.views.roamInfo().pos') == outside
            real_click(page, 'p5_house_entry')
            assert page.evaluate('RLP.ctx.views.roamInfo().pos') == [300,1.65,2.3]
            results['roam_collision_return_and_gates'] = True
            print('室内碰撞、原位返回和门禁通过', flush=True)

            # 前五灾必须按顺序：空档时第五灾是锁着的，通关第一到第四灾后才开放（?unlock=1 / ?wip=1 跳过这把锁）
            boot(page, base, 'index.html?norender=1')
            assert page.locator('.plague').count() == 10
            assert 'open' not in page.locator('.plague').nth(4).get_attribute('class')
            results['normal_menu_fifth_locked_until_fourth_cleared'] = True
            page.evaluate("localStorage.setItem('rlp3d.profile', JSON.stringify({v: 1, ach: {}, cleared: {plague1: {t: 1}, plague2: {t: 1}, plague3: {t: 1}, plague4: {t: 1}}}))")
            boot(page, base, 'index.html?norender=1')
            assert 'open' in page.locator('.plague').nth(4).get_attribute('class')
            page.locator('.plague').nth(4).click()
            page.wait_for_function('window.RLP && RLP.ready && RLP.chapter?.number===5')
            assert page.evaluate('RLP.bootError') is None
            results['normal_menu_enters_fifth_after_fourth_cleared'] = True
            page.close()

            mobile = browser.new_context(viewport={'width':844,'height':390}, is_mobile=True, has_touch=True)
            phone = mobile.new_page()
            phone.on('pageerror', lambda e: errors.append(str(e)))
            phone.on('requestfailed', lambda r: failed_requests.append(r.url))
            boot(phone, base)
            phone.evaluate('async ()=>await RLP.start(5,{fresh:true,skipIntro:true,view:"p5_skin"})')
            for i in [0,1]: real_click(phone, f'p5_skin_dot_{i}', True)
            assert not phone.evaluate('RLP.state.flag("cow_pairs")?.length')
            for i in [0,6,1,8,2,5,3,9,4,7]: real_click(phone, f'p5_skin_dot_{i}', True)
            assert phone.evaluate('!!RLP.state.flag("cow_cured")')
            phone.evaluate('async ()=>await RLP.goto("p5_field",{instant:true})')
            real_click(phone, 'p5_field_tray_0', True)
            real_click(phone, 'p5_field_cell_24', True)
            assert not phone.evaluate('!!RLP.state.flag("field_positions")')
            real_click(phone, 'p5_field_cell_4', True)
            real_click(phone, 'p5_field_tray_1', True)
            real_click(phone, 'p5_field_cell_19', True)
            assert phone.evaluate('RLP.state.flag("field_round")') == 1
            shot(phone, 'checked-touch-field')
            phone.evaluate('async ()=>await RLP.goto("p5_constellation",{instant:true})')
            for i in [0,2,2,0]: real_click(phone, f'p5_thread_dot_{i}', True)
            assert phone.evaluate('RLP.state.flag("constellation_edges")') == []
            for i in [0,2]: real_click(phone, f'p5_thread_dot_{i}', True)
            assert phone.evaluate('RLP.state.flag("constellation_edges")') == [[0,2]]
            shot(phone, 'checked-touch-threads')
            phone.evaluate('async ()=>await RLP.goto("p5_gate",{instant:true})')
            real_click(phone, 'p5_lettuce', True)
            phone.locator('.slot').first.tap()
            assert phone.evaluate('RLP.state.selected') == 'lettuce'
            assert phone.evaluate('RLP.ctx.ui.touchMode')
            results['touch_pair_field_thread_and_inventory'] = True
            mobile.close(); browser.close()
        assert not errors, errors
        assert not failed_requests, failed_requests
        results['page_errors'] = errors
        results['failed_requests'] = failed_requests
        (OUT / 'browser-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(results, ensure_ascii=False, indent=2), flush=True)
    finally:
        server.shutdown()


if __name__ == '__main__':
    run()
