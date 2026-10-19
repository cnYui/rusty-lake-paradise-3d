"""第二灾验收：真实鼠标、数字键与触屏通关，谜题中途读档、回退和漫游碰撞。"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from shot import serve

OUT = Path(__file__).resolve().parent / 'shots' / 'p2' / 'verification'
OUT.mkdir(parents=True, exist_ok=True)
TARGET = """id => {
  const c=RLP.ctx, spec=c.hotspots.get(id);
  if(!spec || !c.hotspots.enabled(id)) throw new Error('热点不可用：'+id);
  c.world.root.updateMatrixWorld(true);c.engine.camera.updateMatrixWorld(true);
  const rect=c.engine.canvas.getBoundingClientRect(),points=[];
  const sample=o=>{
    const b=new c.THREE.Box3().setFromObject(o),p=new c.THREE.Vector3();if(b.isEmpty())return;
    for(const z of [.5,.2,.8])for(const x of [.5,.25,.75,.1,.9])for(const y of [.5,.25,.75,.1,.9]){
      p.set(b.min.x+(b.max.x-b.min.x)*x,b.min.y+(b.max.y-b.min.y)*y,b.min.z+(b.max.z-b.min.z)*z);points.push(p.clone());
    }
    b.getCenter(p);points.unshift(p.clone());
  };
  sample(spec.object);spec.object.traverse(o=>{if(o.isMesh&&o.visible)sample(o);});
  for(const p of points){
    p.project(c.engine.camera);if(p.z>1||p.z< -1||Math.abs(p.x)>.95||Math.abs(p.y)>.92)continue;
    const x=rect.left+(p.x+1)*rect.width/2,y=rect.top+(1-p.y)*rect.height/2;
    if(c.hotspots.pickAt(x,y)?.spec.id===id&&document.elementFromPoint(x,y)===c.engine.canvas)return {x,y};
  }
  throw new Error('画面中找不到可点击的射线：'+id+'，视图：'+c.state.view);
}"""


def boot(page, base, url='index.html?autotest=1&chapter=2&norender=1'):
    page.set_default_timeout(90000)
    page.goto(base + url, wait_until='domcontentloaded')
    page.wait_for_function('window.RLP && RLP.ready')
    page.evaluate("""()=>{if(RLP.bootError)throw new Error(RLP.bootError);RLP.timeScale=25;}""")


def settle(page):
    page.wait_for_function('RLP.ctx.ui.docOpen || (!RLP.ctx.hotspots.busy && !RLP.ctx.views.transitioning && !RLP.ctx.ui.locked)')
    if page.evaluate('RLP.ctx.ui.docOpen'):
        page.keyboard.press('Escape')
    page.evaluate('async ()=>{RLP.ctx.views.dropPointer();await RLP.idle();}')


def shot(page, name):
    settle(page)
    page.evaluate('async ()=>{await RLP.ctx.ui.fade(0,0);RLP.ctx.ui.clearSay();RLP.ctx.engine.render();}')
    page.screenshot(path=str(OUT / f'{name}.png'))


def goto(page, view):
    page.evaluate('async id=>await RLP.goto(id,{instant:true,teleport:true})', view)
    settle(page)


def real_click(page, id, touch=False):
    page.evaluate("""async id=>{
      const c=RLP.ctx;await Promise.all(c.engine.canvas.getAnimations().map(a=>a.finished));await RLP.idle();
      if(c.views.freeMode){
        c.world.root.updateMatrixWorld(true);
        const target=new c.THREE.Box3().setFromObject(c.hotspots.get(id).object).getCenter(new c.THREE.Vector3());
        RLP.roamTo(c.engine.camera.position.toArray(),target.toArray());
      }
      c.views.dropPointer();await RLP.idle();
    }""", id)
    try:
        assert not page.evaluate('RLP.ctx.ui.modalOpen')
        point = page.evaluate(TARGET, id)
        if touch:
            page.touchscreen.tap(point['x'], point['y'])
        else:
            page.mouse.click(point['x'], point['y'])
        settle(page)
    except Exception:
        print('点击失败：', id, page.evaluate('RLP.info()'), flush=True)
        page.evaluate('RLP.ctx.engine.render()')
        page.screenshot(path=str(OUT / ('failed-' + id + '.png')))
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
    raw = page.evaluate('localStorage.getItem("rlp3d.save.plague2")')
    flags = page.evaluate('RLP.state.flags')
    inventory = page.evaluate('RLP.state.inventory')
    page.evaluate('async ()=>await RLP.start(2,{fresh:true,skipIntro:true})')
    page.evaluate("""async raw=>{
      localStorage.setItem('rlp3d.save.plague2',raw);await RLP.start(2,{fresh:false,skipIntro:true});
      RLP.chapter.sync(RLP.ctx);RLP.chapter.sync(RLP.ctx);
    }""", raw)
    assert page.evaluate('RLP.state.flags') == flags
    assert page.evaluate('RLP.state.inventory') == inventory
    if kind == 'spawn':
        assert not page.evaluate('RLP.ctx.p2.world.basin.getObjectByName("clump_7").visible')
        assert page.evaluate('RLP.state.flag("spawn_pending")') == 7
    if kind == 'lily':
        assert page.evaluate('RLP.state.flag("lily_progress").from') == [3, 1]
        assert page.evaluate('RLP.ctx.p2.world.lily.getObjectByName("pad_3_1").visible')
    if kind == 'pot':
        assert page.evaluate('RLP.ctx.p2.world.cauldron.userData.frogs()') == flags['pot_frogs']
        assert page.evaluate('RLP.ctx.p2.world.cauldron.getObjectByName("cauldron_fire").visible') == bool(flags.get('pot_lit'))
    if kind == 'temple':
        assert page.evaluate('RLP.ctx.p2.world.holder.userData.state.lowered') == 1.2
        assert page.evaluate('RLP.ctx.p2.world.font.userData.state.lit')
    print('中途读档与重复同步通过：', kind, flush=True)


def flat_steps(steps):
    for step in steps:
        if 'repeat' in step:
            for _ in range(step['repeat']):
                yield from flat_steps([step['step']])
        else:
            yield step


def verify_menu_and_movement(page, base, touch=False):
    boot(page, base, 'index.html?norender=1')
    assert page.locator('.plague').count() == 10
    assert 'open' in page.locator('.plague').nth(1).get_attribute('class')
    if touch:
        page.locator('.plague').nth(1).tap()
    else:
        page.locator('.plague').nth(1).click()
    page.wait_for_function('window.RLP && RLP.ready && RLP.chapter?.number===2 && RLP.state.view')
    assert page.evaluate('RLP.bootError') is None
    page.evaluate('async ()=>{RLP.timeScale=25;await RLP.start(2,{fresh:true,skipIntro:true,view:"beach_mid"});}')
    settle(page)
    page.evaluate('async ()=>await Promise.all(RLP.ctx.engine.canvas.getAnimations().map(a=>a.finished))')
    before = page.evaluate('RLP.ctx.views.roamInfo()')
    if touch:
        rect = page.locator('#game').bounding_box()
        cdp = page.context.new_cdp_session(page)
        def event(kind, x=None, y=None):
            points = [] if kind == 'touchEnd' else [{'x':x,'y':y,'id':1}]
            cdp.send('Input.dispatchTouchEvent', {'type':kind,'touchPoints':points})
        x, y = rect['x'] + rect['width'] * .2, rect['y'] + rect['height'] * .72
        event('touchStart', x, y); event('touchMove', x, y-60)
        page.wait_for_timeout(350); event('touchEnd'); settle(page)
        assert page.evaluate('RLP.ctx.views.roamInfo().pos')[2] < before['pos'][2] - .1
        yaw = page.evaluate('RLP.ctx.views.roamInfo().yaw')
        x, y = rect['x'] + rect['width'] * .75, rect['y'] + rect['height'] * .43
        event('touchStart', x, y); event('touchMove', x-30, y); event('touchMove', x-100, y)
        page.wait_for_timeout(200); event('touchEnd'); settle(page)
        assert abs(page.evaluate('RLP.ctx.views.roamInfo().yaw') - yaw) > .05
        assert page.evaluate('RLP.ctx.ui.touchMode')
        cdp.detach()
    else:
        page.keyboard.down('w');page.wait_for_timeout(350);page.keyboard.up('w');settle(page)
        assert page.evaluate('RLP.ctx.views.roamInfo().pos')[2] < before['pos'][2] - .1
        assert page.evaluate('document.pointerLockElement') is None
    assert page.locator('.arrows > .arrow.show').count() == 0
    print(('触屏摇杆和视角' if touch else '键盘走动') + '与正常首页进入第二灾通过', flush=True)
    return True


def play_real(page, touch=False):
    steps = list(flat_steps(page.evaluate('RLP.chapter.walkthrough')))
    clicks, checkpoints, captures = 0, set(), set()
    for step in steps:
        if 'go' in step:
            goto(page, step['go'])
        elif 'click' in step or 'use' in step:
            target = step.get('click', step.get('on'))
            if target == 'cauldron' and step.get('use') == 'frog' and 'recipe' not in checkpoints:
                before = page.evaluate('RLP.state.inventory')
                use(page, 'bowl', target, touch)
                assert page.evaluate('RLP.state.inventory') == before
                assert not page.evaluate('!!RLP.state.flag("soup_taken")')
                checkpoints.add('recipe')
            if 'use' in step:
                use(page, step['use'], target, touch)
            else:
                page.evaluate('RLP.state.select(null)')
                real_click(page, target, touch)
            clicks += 1
            if clicks % 20 == 0:
                print(('触屏' if touch else '鼠标 / 数字键') + '真实交互已通过：', clicks, flush=True)
            view = page.evaluate('RLP.state.view')
            if not touch and view not in captures and view in ['ida','gerard','spawn_basin','lily_pads','dial','cauldron','holder','david_rock']:
                shot(page, 'checked-' + view); captures.add(view)
            kind = None
            if not touch:
                if target == 'spawn_7' and 'spawn' not in checkpoints: kind = 'spawn'
                if target == 'lily_3_1' and 'lily' not in checkpoints: kind = 'lily'
                if target == 'dial_mid' and 'dial' not in checkpoints: kind = 'dial'
                if target == 'cauldron' and step.get('use') == 'frog' and 'pot' not in checkpoints: kind = 'pot'
                if target == 'ida_flute' and 'ida' not in checkpoints: kind = 'ida'
                if kind:
                    checkpoint(page, kind); checkpoints.add(kind)
        elif 'back' in step:
            if page.evaluate('RLP.ctx.views.freeMode'):
                real_click(page, 'house_exit', touch)
            elif touch:
                page.locator('.arrows > .arrow-down.show').tap(); settle(page)
            else:
                page.keyboard.press('ArrowDown'); settle(page)
        elif 'expectFlag' in step:
            assert page.evaluate('key=>!!RLP.state.flag(key)', step['expectFlag']), step
        elif 'expectItem' in step:
            assert page.evaluate('id=>RLP.state.has(id)', step['expectItem']), step
        elif 'expectView' in step:
            assert page.evaluate('RLP.state.view') == step['expectView'], step
    assert page.evaluate('!!RLP.state.flag("plague2_complete")')
    return {'clicks':clicks, 'checkpoints':sorted(checkpoints)}


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
            page.evaluate('async ()=>await RLP.start(2,{fresh:true,skipIntro:true})')
            auto = page.evaluate('async ()=>await RLP.autoplay({stepDelay:0,stepTimeout:60000})')
            (OUT / 'autoplay.json').write_text(json.dumps(auto, ensure_ascii=False, indent=2), encoding='utf-8')
            assert auto['ok'], auto['failedStep']
            assert auto['flags']['plague2_complete']
            results['autoplay'] = {'steps':auto['steps'],'total':auto['total'],'warnings':auto['warnings']}
            print('自动通关通过：', auto['steps'], flush=True)
            checkpoint(page, 'temple')
            page.evaluate('async ()=>await RLP.start(2,{fresh:true,skipIntro:true,view:"spawn_basin"})')
            reset = page.evaluate("""()=>{
              const w=RLP.ctx.p2.world;
              return {inventory:RLP.state.inventory,cube:w.holder.userData.state.cube,lower:w.holder.userData.state.lowered,
                lit:w.font.userData.state.lit,wood:w.cauldron.getObjectByName('cauldron_wood').visible,
                fire:w.cauldron.getObjectByName('cauldron_fire').visible,bowl:w.bowl.visible,candle:w.candle.visible,
                frog:w.ida.frog.visible,flute:w.ida.fluteObj.visible,clumps:Array.from({length:12},(_,i)=>w.basin.getObjectByName('clump_'+(i+1)).visible)};
            }""")
            assert reset == {'inventory':[],'cube':False,'lower':0,'lit':False,'wood':False,'fire':False,'bowl':True,'candle':True,'frog':True,'flute':False,'clumps':[True]*12}, reset
            results['new_game_reset'] = True
            for i in [7, 9, 1, 2]: real_click(page, f'spawn_{i}')
            assert page.evaluate('RLP.state.flag("spawn_mask")') == 0xfff
            assert page.evaluate('RLP.state.flag("spawn_pending")') == 0
            goto(page, 'lily_pads')
            for id in ['lily_3_1','lily_2_1','lily_0_1']: real_click(page, id)
            assert not page.evaluate('RLP.state.flag("lily_progress")')
            assert not page.evaluate('RLP.state.flag("lily_done")')
            results['wrong_pair_and_early_goal_retry'] = True
            page.evaluate('async ()=>await RLP.start(2,{fresh:true,skipIntro:true})')
            results['real_mouse_and_keyboard'] = play_real(page)
            shot(page, 'checked-ending')
            checkpoint(page, 'temple')
            print('真实鼠标与数字键完整通关通过', flush=True)

            page.evaluate('async ()=>await RLP.start(2,{fresh:true,skipIntro:true,view:"house_clearing"})')
            page.evaluate('RLP.roamTo([5,1.8,-3.5],[3,1.5,-11.35])')
            outside = page.evaluate('RLP.ctx.views.roamInfo().pos')
            real_click(page, 'house_entry')
            assert page.evaluate('RLP.ctx.views.roamInfo().pos') == [300,1.65,2.3]
            bounds = page.evaluate("""()=>({floor:RLP.ctx.views.canStand(300,2),wall:RLP.ctx.views.canStand(304,2),
              table:RLP.ctx.views.canStand(299.8,-.95),pot:RLP.ctx.views.canStand(301.1,-.85),chest:RLP.ctx.views.canStand(298.4,-1.25)})""")
            assert bounds == {'floor':True,'wall':False,'table':False,'pot':False,'chest':False}, bounds
            page.evaluate('RLP.roamTo([300.3,1.65,1.7],[301.1,.9,-.85])')
            inside = page.evaluate('RLP.ctx.views.roamInfo().pos')
            real_click(page, 'cauldron')
            page.keyboard.press('ArrowDown'); settle(page)
            assert page.evaluate('RLP.ctx.views.roamInfo().pos') == inside
            real_click(page, 'house_exit')
            assert page.evaluate('RLP.ctx.views.roamInfo().pos') == outside
            assert page.locator('.arrows > .arrow.show').count() == 0
            results['roam_collision_and_return'] = True
            print('室内家具碰撞和进出原位返回通过', flush=True)

            # 中断结尾的存档不能要求再拿一次已消耗的黑方块。
            page.evaluate('async ()=>await RLP.start(2,{fresh:true,skipIntro:true,view:"holder",flags:{cube_taken:true,cube_inserted:true,holder_open:true}})')
            real_click(page, 'holder')
            assert page.evaluate('!!RLP.state.flag("plague2_complete")')
            results['interrupted_ending_resumes'] = True
            results['normal_menu_and_keyboard_movement'] = verify_menu_and_movement(page, base)
            page.close()

            mobile = browser.new_context(viewport={'width':844,'height':390}, is_mobile=True, has_touch=True)
            phone = mobile.new_page()
            phone.on('pageerror', lambda e: errors.append(str(e)))
            phone.on('requestfailed', lambda r: failed_requests.append(r.url))
            boot(phone, base)
            phone.evaluate('async ()=>await RLP.start(2,{fresh:true,skipIntro:true})')
            results['real_touch_complete'] = play_real(phone, touch=True)
            assert phone.evaluate('RLP.ctx.ui.touchMode')
            shot(phone, 'checked-touch-ending')
            results['normal_touch_menu_joystick_and_look'] = verify_menu_and_movement(phone, base, touch=True)
            mobile.close();browser.close()
        assert not errors, errors
        assert not failed_requests, failed_requests
        results['page_errors'] = errors;results['failed_requests'] = failed_requests
        (OUT / 'browser-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(results, ensure_ascii=False, indent=2), flush=True)
    finally:
        server.shutdown()


if __name__ == '__main__':
    run()
