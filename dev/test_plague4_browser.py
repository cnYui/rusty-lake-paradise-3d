"""第四灾浏览器验收：自动流程、真实射线点击、触屏与存档恢复。"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from shot import serve

OUT = Path(__file__).resolve().parent / 'shots' / 'plague4'
OUT.mkdir(parents=True, exist_ok=True)

TARGET = """id => {
  const c = RLP.ctx, spec = c.hotspots.get(id);
  if (!spec || !c.hotspots.enabled(id)) throw new Error('热点不可用：' + id);
  c.world.root.updateMatrixWorld(true); c.engine.camera.updateMatrixWorld(true);
  const rect = c.engine.canvas.getBoundingClientRect(), points = [];
  const addBox = o => {
    const b = new c.THREE.Box3().setFromObject(o), p = new c.THREE.Vector3();
    if (b.isEmpty()) return;
    for (const x of [0.5,0.25,0.75,0.1,0.9]) for (const y of [0.5,0.25,0.75,0.1,0.9]) {
      p.set(b.min.x+(b.max.x-b.min.x)*x,b.min.y+(b.max.y-b.min.y)*y,(b.min.z+b.max.z)/2);
      points.push(p.clone());
    }
    b.getCenter(p); points.unshift(p.clone());
  };
  addBox(spec.object);
  spec.object.traverse(o => { if (o.isMesh && o.visible) addBox(o); });
  for (const p of points) {
    p.project(c.engine.camera);
    if (p.z > 1 || p.z < -1 || Math.abs(p.x)>.98 || Math.abs(p.y)>.96) continue;
    const x = rect.left+(p.x+1)*rect.width/2, y=rect.top+(1-p.y)*rect.height/2;
    if (c.hotspots.pickAt(x,y)?.spec.id === id && document.elementFromPoint(x,y) === c.engine.canvas) return {x,y};
  }
  throw new Error('画面中找不到可点击的射线：' + id + '，视图：' + c.state.view);
}"""


def boot(page, base, url='index.html?autotest=1&chapter=4&norender=1'):
    # 等 DOM 即可开始读 RLP；Three.js/字体等长资源不应阻塞移动端页面导航。
    page.goto(base + url, wait_until='domcontentloaded', timeout=90000)
    page.wait_for_function('window.RLP && RLP.ready', timeout=90000)
    page.evaluate("""() => {
      if (RLP.bootError) throw new Error(RLP.bootError);
      RLP.timeScale=25; RLP.ctx.engine.renderEnabled=false;
    }""")


def shot(page, name):
    page.evaluate('async () => { await RLP.ctx.ui.fade(0,0); RLP.ctx.ui.clearSay(); RLP.ctx.engine.render(); }')
    page.screenshot(path=str(OUT / f'{name}.png'))


def settle(page):
    page.wait_for_function('RLP.ctx.ui.docOpen || RLP.ctx.ui.imageOpen || (!RLP.ctx.hotspots.busy && !RLP.ctx.views.transitioning && !RLP.ctx.ui.locked)', timeout=20000)
    if page.evaluate('RLP.ctx.ui.docOpen || RLP.ctx.ui.imageOpen'):
        page.keyboard.press('Escape')
    page.evaluate('async () => { RLP.ctx.views.dropPointer(); await RLP.idle(); }')


def real_click(page, id, touch=False):
    # 舞台入场位移使用 CSS 时间，不能随游戏加速；坐标必须等它稳定后再采样。
    page.evaluate("""async id => {
      const c=RLP.ctx;
      await Promise.all(c.engine.canvas.getAnimations().map(a=>a.finished)); await RLP.idle();
      if(c.views.freeMode) {
        // 玩家可自由转身；每次采样前朝向目标，避免前一次靠边点击留下的视角偏移。
        c.world.root.updateMatrixWorld(true);
        const target=new c.THREE.Box3().setFromObject(c.hotspots.get(id).object).getCenter(new c.THREE.Vector3());
        RLP.roamTo(c.engine.camera.position.toArray(),target.toArray());
        c.views.dropPointer(); await RLP.idle();
      }
    }""", id)
    before = page.evaluate("""id => ({view:RLP.state.view, goto:RLP.ctx.hotspots.get(id)?.goto,
      modal:RLP.ctx.ui.modalOpen, inspect:RLP.ctx.ui.inspectOpen, selected:RLP.state.selected})""", id)
    try:
        assert not before['modal'], before
        point = page.evaluate(TARGET, id)
        if touch:
            page.touchscreen.tap(point['x'], point['y'])
        else:
            page.mouse.click(point['x'], point['y'])
        settle(page)
        if before.get('goto'):
            assert page.evaluate('RLP.state.view') == before['goto'], {'hotspot': id, 'before': before}
    except Exception:
        detail = page.evaluate("""() => ({view:RLP.state.view, locked:RLP.ctx.ui.locked,
          modal:RLP.ctx.ui.modalOpen, inspect:RLP.ctx.ui.inspectOpen, doc:RLP.ctx.ui.docOpen,
          stage:document.getElementById('stage').className, errors:RLP.errors})""")
        print('点击失败：', id, before, detail, flush=True)
        shot(page, 'failed-' + id)
        raise


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
            auto = page.evaluate('async () => await RLP.autoplay({stepDelay:0})')
            (OUT / 'autoplay.json').write_text(json.dumps(auto, ensure_ascii=False, indent=2), encoding='utf-8')
            assert auto['ok'], auto['failedStep']
            assert auto['flags'].get('plague4_complete')
            results['autoplay'] = {'steps': auto['steps'], 'total': auto['total'], 'warnings': auto['warnings']}
            print('自动流程通过：', results['autoplay'], flush=True)

            page.evaluate('async () => await RLP.start(4,{skipIntro:true,fresh:true})')
            reset = page.evaluate("""() => {
              const w=RLP.ctx.p4.world;
              return {inv:RLP.state.inventory, father:w.father.visible, cube:w.cube.visible, omen:w.omen.visible,
                water:w.font.userData.state.reflect, holder:w.holder.userData.state.cube, round:RLP.state.flag('p4_crab_round')||0};
            }""")
            assert reset == {'inv': [], 'father': True, 'cube': False, 'omen': False, 'water': False, 'holder': False, 'round': 0}, reset
            results['new_game_reset'] = True

            steps = page.evaluate('RLP.chapter.walkthrough')
            real_steps = 0
            for original in steps:
                for _ in range(original.get('repeat', 1)):
                    step = original.get('step', original)
                    if 'go' in step:
                        page.evaluate('async id => await RLP.goto(id,{instant:true})', step['go'])
                    elif 'click' in step or 'use' in step:
                        page.evaluate('RLP.state.select(null)')
                        if 'use' in step:
                            key = page.evaluate("id => { const i=RLP.state.inventory.indexOf(id); if(i<0) throw new Error(id); return ['1','2','3','4','5','6','7','8','9','0','-','='][i]; }", step['use'])
                            page.keyboard.press(key)
                            assert page.evaluate('RLP.state.selected') == step['use']
                        real_click(page, step.get('click', step.get('on')))
                        real_steps += 1
                        if real_steps % 20 == 0:
                            print(f'真实鼠标 / 键盘交互已通过 {real_steps} 次', flush=True)
                    elif 'back' in step:
                        # 固定镜头用键盘返回；室内漫游保留显式出口路径。
                        if page.evaluate('RLP.ctx.views.freeMode'):
                            page.evaluate('RLP.roamTo([300,1.65,1.8],[300,1.6,4])')
                            real_click(page, 'house_exit')
                        else:
                            page.keyboard.press('ArrowDown')
                            settle(page)
                    elif 'expectFlag' in step:
                        key = step['expectFlag']
                        if isinstance(key, list): assert page.evaluate('k=>RLP.state.flag(k)', key[0]) == key[1]
                        else: assert page.evaluate('k=>!!RLP.state.flag(k)', key), key
                    elif 'expectItem' in step or 'expectNoItem' in step:
                        ids = step.get('expectItem', step.get('expectNoItem'))
                        for id in ids if isinstance(ids, list) else [ids]:
                            assert page.evaluate('id=>RLP.state.has(id)', id) == ('expectItem' in step), step
                    elif 'expectView' in step:
                        assert page.evaluate('RLP.state.view') == step['expectView'], step
            results['real_mouse_and_keyboard'] = real_steps
            print(f'真实鼠标 / 数字键完整流程通过：{real_steps} 次交互', flush=True)
            shot(page, 'checked-ending')

            page.evaluate('async () => await RLP.start(4,{skipIntro:true,fresh:true,view:"crab_board"})')
            real_click(page, 'crab_start_0')
            assert page.evaluate('RLP.state.flag("p4_crab_round")||0') == 0
            real_click(page, 'crab_shell_0_0')
            real_click(page, 'crab_cell_0_2_2')
            page.evaluate('RLP.state.save()')
            saved = page.evaluate('localStorage.getItem("rlp3d.save.plague4")')
            page.evaluate('async () => await RLP.start(4,{skipIntro:true,fresh:true})')
            page.evaluate("raw => { localStorage.setItem('rlp3d.save.plague4',raw); RLP.state.load('plague4'); RLP.chapter.sync(RLP.ctx); RLP.chapter.sync(RLP.ctx); }", saved)
            positions = page.evaluate('RLP.ctx.p4.world.boards[0].shells.map(s=>s.position.toArray())')
            assert abs(positions[0][0] + 0.36) < 0.001 and abs(positions[0][2]) < 0.001, positions
            results['save_load_and_retry'] = True
            print('新游戏、失败重试、存档加载和重复同步通过', flush=True)

            for view in ['house_int', 'pit', 'owl', 'crab_board', 'temple_int', 'window', 'memory']:
                page.evaluate('async v=>await RLP.goto(v,{instant:true})', view)
                shot(page, f'checked-{view}')

            page.evaluate('async () => await RLP.start(4,{skipIntro:true,fresh:true,view:"house_clearing"})')
            page.evaluate('RLP.roamTo([5,1.8,-3.5],[3,1.5,-11.2])')
            outside = page.evaluate('RLP.ctx.views.roamInfo().pos')
            assert page.locator('.arrows > .arrow.show').count() == 0
            assert not page.evaluate('RLP.ctx.hotspots.enabled("temple_entry")')
            real_click(page, 'house_entry')
            entrance = page.evaluate('RLP.ctx.views.roamInfo().pos')
            assert entrance == [300, 1.65, 2.3], entrance
            bounds = page.evaluate("""() => ({inside:RLP.ctx.views.canStand(300,2),
              wall:RLP.ctx.views.canStand(304,2), table:RLP.ctx.views.canStand(298.6,-0.85),
              chest:RLP.ctx.views.canStand(300,-1.05),pot:RLP.ctx.views.canStand(301.3,-0.8)})""")
            assert bounds == {'inside':True,'wall':False,'table':False,'chest':False,'pot':False}, bounds
            page.evaluate('RLP.roamTo([300.8,1.65,1.8],[300,1.4,4])')
            real_click(page, 'house_exit')
            assert page.evaluate('RLP.ctx.views.roamInfo().pos') == outside
            real_click(page, 'house_entry')
            assert page.evaluate('RLP.ctx.views.roamInfo().pos') == entrance
            page.evaluate('async () => await RLP.goto("pit_clearing",{instant:true})')
            page.evaluate('RLP.roamTo([8.5,1.8,-3],[8.5,0.7,-6.5])')
            outside = page.evaluate('RLP.ctx.views.roamInfo().pos')
            real_click(page, 'pit_zoom')
            assert not page.evaluate('RLP.ctx.views.freeMode')
            page.keyboard.press('ArrowDown')
            settle(page)
            assert page.evaluate('RLP.ctx.views.freeMode')
            assert page.evaluate('RLP.ctx.views.roamInfo().pos') == outside
            results['roam_return_collision_and_gate'] = True
            print('漫游位置恢复、室内碰撞和神殿入口门禁通过', flush=True)

            # 普通无参数首页必须能显示菜单，且能实际选择第四灾重载进入。
            boot(page, base, 'index.html')
            page.wait_for_selector('.plague.open')
            assert page.locator('.plague').count() == 10
            card = page.locator('.plague').nth(3)
            assert 'open' in card.get_attribute('class')
            card.click()
            page.wait_for_function('window.RLP && RLP.ready && RLP.chapter?.number===4', timeout=90000)
            assert page.evaluate('RLP.bootError') is None
            results['normal_menu_chapter4'] = True
            print('普通首页菜单选择第四章通过', flush=True)
            # 菜单切章会重载并恢复连续渲染；桌面验收结束后释放其 WebGL 上下文。
            page.close()

            mobile = browser.new_context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True)
            phone = mobile.new_page()
            phone.on('pageerror', lambda e: errors.append(str(e)))
            boot(phone, base)
            phone.evaluate('async () => await RLP.start(4,{skipIntro:true,fresh:true,view:"crab_board"})')
            real_click(phone, 'crab_shell_0_0', True)
            assert phone.evaluate('RLP.state.flag("p4_crab_selected")') == 0
            real_click(phone, 'crab_cell_0_2_2', True)
            assert phone.evaluate('RLP.state.flag("p4_crab_shells")[0].join(",")') == '2,2'
            assert phone.evaluate('RLP.ctx.ui.touchMode')
            shot(phone, 'checked-touch-board')
            results['touch_shell_placement'] = True
            phone.evaluate('async () => await RLP.goto("house_int",{instant:true})')
            real_click(phone, 'candle', True)
            phone.locator('.slot').first.tap()
            assert phone.evaluate('RLP.state.selected') == 'candle'
            results['touch_inventory'] = True
            mobile.close()
            browser.close()
        assert not errors, errors
        assert not failed_requests, failed_requests
        results['page_errors'] = errors
        results['failed_requests'] = failed_requests
        (OUT / 'browser-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(results, ensure_ascii=False, indent=2))
    finally:
        server.shutdown()


if __name__ == '__main__':
    run()
