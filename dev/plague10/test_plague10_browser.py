"""第十灾验收：自动通关、真实鼠标 / 数字键完整通关、中途读档、拿错东西和门禁、黄昏布景、菜单 wip、触屏；本地截图不参与部署。"""
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

PEOPLE = ['gerard', 'david', 'ida', 'margaret', 'nicholas']


def boot(page, base, url='index.html?autotest=1&chapter=10&norender=1'):
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
    before = page.evaluate('id=>({view:RLP.state.view,goto:RLP.ctx.hotspots.get(id)?.goto,modal:RLP.ctx.ui.modalOpen,selected:RLP.state.selected})', id)
    try:
        assert not before['modal'], before
        point = page.evaluate(TARGET, id)
        if touch:
            page.touchscreen.tap(point['x'], point['y'])
        else:
            page.mouse.click(point['x'], point['y'])
        settle(page)
        # 拿着物品点的是物品处理（比如给错面具被拒），不会推近镜头
        if before.get('goto') and not before.get('selected'):
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
        page.keyboard.press(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='][index])
    assert page.evaluate('RLP.state.selected') == item
    real_click(page, target, touch)


def close(a, b, eps=1e-3):
    return abs(a - b) < eps


def same_angle(a, b):
    d = (a - b) % (2 * math.pi)
    return min(d, 2 * math.pi - d) < 1e-3


def checkpoint(page, kind):
    page.evaluate('RLP.state.save()')
    raw = page.evaluate('localStorage.getItem("rlp3d.save.plague10")')
    flags = page.evaluate('RLP.state.flags')
    inventory = page.evaluate('RLP.state.inventory')
    page.evaluate('async ()=>await RLP.start(10,{fresh:true,skipIntro:true})')
    page.evaluate("""async raw=>{
      localStorage.setItem('rlp3d.save.plague10',raw);
      await RLP.start(10,{fresh:false,skipIntro:true});
      RLP.chapter.sync(RLP.ctx); RLP.chapter.sync(RLP.ctx);
    }""", raw)
    assert page.evaluate('RLP.state.flags') == flags
    assert page.evaluate('RLP.state.inventory') == inventory
    w = 'RLP.ctx.p10.world'
    if kind == 'arrow':
        # 苹果顶在 David 头上、还没射：头上有苹果，树上没有钉着的箭
        assert page.evaluate(w + '.headApple.visible') and not page.evaluate(w + '.pinned.visible')
    if kind == 'face':
        ok = page.evaluate("""async face=>{
          const { STRIPE_COLORS } = await import('./src/art/props_p10.js');
          const w=RLP.ctx.p10.world, ms=w.facePaint.children.filter(o=>o.name.startsWith('face_stripe_'));
          return w.facePaint.visible && ms.length===5 && ms.every((m,i)=>m.material.color.equals(new RLP.ctx.THREE.Color(STRIPE_COLORS[face[i]])));
        }""", flags['face'])
        assert ok, flags['face']
    if kind == 'stove':
        assert page.evaluate(w + '.stove.userData.state.lit') == 0
        assert not page.evaluate(w + '.stove.getObjectByName("pan_chick").visible')
    if kind == 'bones':
        rot = page.evaluate(w + '.stump.userData.groups.map(h=>h.parent.rotation.y)')
        assert all(same_angle(r, -v * math.pi / 2) for r, v in zip(rot, flags['bones_rot'])), (rot, flags['bones_rot'])
    if kind == 'letters':
        assert page.evaluate(w + '.crypt.userData.state.letters') == flags['letters']
        assert page.evaluate(w + '.crypt.userData.state.open') == 0
    if kind == 'hex':
        assert page.evaluate(w + '.crypt.userData.state.hex') == flags['hex']
        assert page.evaluate(w + '.crypt.userData.state.solved') == 0
    if kind == 'masks':
        # 戴上面具的人换成动物头模型（Ida 是程序化面具），身边的火炬燃着；没戴的还是原样
        state = page.evaluate("""masked=>{
          const w=RLP.ctx.p10.world;
          return Object.fromEntries(Object.keys(w.torches).map(p=>[p,{
            lit:w.torches[p].userData.state.lit, plain:w.rigs[p].root.visible, alt:w.masked[p]?w.masked[p].root.visible:null}]));
        }""", flags['masked'])
        for p, s in state.items():
            on = p in flags['masked']
            assert s['lit'] == (1 if on else 0), (p, s)
            if s['alt'] is not None:
                assert s['alt'] == on and s['plain'] == (not on), (p, s)
    if kind == 'temple':
        assert page.evaluate(w + '.holder.userData.state.lowered') == 0.8
        assert page.evaluate(w + '.font.userData.state.lit')
        assert page.evaluate(w + '.owl.userData.state') == {'eyes': 1, 'open': 1}
        assert page.evaluate(w + '.templeFire.visible')
        assert all(page.evaluate(w + '.gateTorches.map(t=>t.userData.state.lit)'))


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
            page.evaluate('async ()=>await RLP.start(10,{skipIntro:true})')
            auto = page.evaluate('async ()=>await RLP.autoplay({stepDelay:0,stepTimeout:60000})')
            (OUT / 'autoplay.json').write_text(json.dumps(auto, ensure_ascii=False, indent=2), encoding='utf-8')
            assert auto['ok'], auto['failedStep']
            assert auto['flags']['plague10_complete']
            assert sorted(auto['achievements']) == ['p10_its_time', 'p10_owls', 'p10_tell', 'p10_true_colours'], auto['achievements']
            results['autoplay'] = {'steps': auto['steps'], 'total': auto['total'], 'warnings': auto['warnings']}
            print('自动通关通过：', auto['steps'], flush=True)

            page.evaluate('async ()=>await RLP.start(10,{fresh:true,skipIntro:true})')
            reset = page.evaluate("""()=>{
              const w=RLP.ctx.p10.world, st=w.stump.userData.state;
              return {inv:RLP.state.inventory, feather:st.feather, pellet:w.stump.userData.pellet.visible,
                tip:w.boneString.getObjectByName('string_tip').visible, headApple:w.headApple.visible, pinned:w.pinned.visible,
                worm:w.worm.visible, face:w.facePaint.visible, candle:w.idaCandle.visible, table:[w.shaft.visible,w.brush.visible,w.apple.visible],
                stove:w.stove.userData.state.lit, masks:Object.values(w.masks).every(m=>m.visible), door:w.crypt.userData.state.open,
                cube:w.crypt.userData.cube.visible, ghosts:w.rigs.shadow.root.visible||w.rigs.elizabeth.root.visible,
                owl:w.owl.userData.state, torches:[...Object.values(w.torches),...w.gateTorches].some(t=>t.userData.state.lit>0),
                maskedRigs:Object.values(w.masked).some(r=>r.root.visible), font:w.font.userData.state.lit, vision:w.vision.getObjectByName('vision_owl').visible};
            }""")
            assert reset == {'inv': [], 'feather': True, 'pellet': False, 'tip': True, 'headApple': False, 'pinned': False,
                             'worm': False, 'face': False, 'candle': False, 'table': [True, True, True], 'stove': 0, 'masks': True,
                             'door': 0, 'cube': False, 'ghosts': False, 'owl': {'eyes': 0, 'open': 0}, 'torches': False,
                             'maskedRigs': False, 'font': False, 'vision': False}, reset
            results['new_game_reset'] = True

            # 黄昏：天被染成橙红；神殿外面套着木头猫头鹰（原来的神殿顶藏起来）；塔门前的大石头压进了地里
            dusk = page.evaluate("""async ()=>{
              const { groundHeight } = await import('./src/art/island.js');
              const c=RLP.ctx, w=c.p10.world; let rocks=null, dome=null;
              c.world.root.traverse(o=>{ if(!rocks && o.isMesh && o.name==='rocks') rocks=o; if(o.name==='temple_owl') dome=o; });
              const pos=rocks.geometry.attributes.position, d=w.towerDoor.position, a=w.towerDoor.rotation.y;
              const fx=d.x+Math.sin(a)*1.9, fz=d.z+Math.cos(a)*1.9; let blocking=0;
              for(let i=0;i<pos.count;i++){ const x=pos.getX(i), z=pos.getZ(i); if(Math.hypot(x-fx,z-fz)<1.6 && pos.getY(i)>groundHeight(x,z)+0.3) blocking++; }
              return {tint:!!c.world.sky.fogState.tint, owl:!!w.owl.parent, dome:dome?dome.visible:false, blocking};
            }""")
            assert dusk == {'tint': True, 'owl': True, 'dome': False, 'blocking': 0}, dusk
            results['dusk_scene'] = dusk

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
                    if f.get('apple_on_head') and not f.get('apple_shot') and 'arrow' not in checkpoints: kind = 'arrow'
                    if isinstance(f.get('face'), list) and 'white' != f['face'][0] and not f.get('face_done') and 'face' not in checkpoints: kind = 'face'
                    if f.get('egg_in_pan') and not f.get('stove_lit') and 'stove' not in checkpoints: kind = 'stove'
                    if isinstance(f.get('bones_rot'), list) and not f.get('owls_read') and 'bones' not in checkpoints: kind = 'bones'
                    if isinstance(f.get('letters'), list) and not f.get('letter_door_open') and 'letters' not in checkpoints: kind = 'letters'
                    if isinstance(f.get('hex'), list) and not f.get('hex_done') and 'hex' not in checkpoints: kind = 'hex'
                    if f.get('masked') and not f.get('all_masked') and len(f['masked']) >= 2 and 'masks' not in checkpoints: kind = 'masks'
                    if kind:
                        checkpoint(page, kind); checkpoints.add(kind)
                        print('中途读档恢复通过：', kind, flush=True)
                elif 'combine' in step:
                    a, b = step['combine']
                    page.evaluate('RLP.state.select(null)')
                    keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=']
                    page.keyboard.press(keys[page.evaluate('id=>RLP.state.inventory.indexOf(id)', a)])
                    page.keyboard.press(keys[page.evaluate('id=>RLP.state.inventory.indexOf(id)', b)])
                    settle(page)
                elif 'back' in step:
                    page.keyboard.press('ArrowDown'); settle(page)
                elif 'expectFlag' in step:
                    assert page.evaluate('key=>!!RLP.state.flag(key)', step['expectFlag']), step
                elif 'expectItem' in step:
                    for item in [step['expectItem']] if isinstance(step['expectItem'], str) else step['expectItem']:
                        assert page.evaluate('id=>RLP.state.has(id)', item), item
                elif 'expectView' in step:
                    assert page.evaluate('RLP.state.view') == step['expectView'], step
            assert page.evaluate('!!RLP.state.flag("plague10_complete")')
            results['real_mouse_and_keyboard'] = real_steps
            shot(page, 'checked-ending')
            checkpoint(page, 'temple')
            results['partial_and_complete_save_load'] = sorted(checkpoints | {'temple'})
            print('真实输入完整通关和存档恢复通过', flush=True)

            # 门禁和拿错东西：拿黑方块之前面具谁都不接；拿了以后给错人不接；没顶苹果不射；小鸡喂不了母鸡；
            # 猫头鹰栅门没开时进不去、食丸 / 石鹰 / 神殿入口都关着
            page.evaluate('async ()=>await RLP.start(10,{fresh:true,skipIntro:true})')
            GATES = [['pellet', 'p10_pellet_zoom', 'p10_owl'], ['eagle', 'p10_eagle_zoom', 'p10_under'], ['temple', 'p10_temple_entry', 'p10_temple']]
            check_gates = """async (pairs)=>{ const out={}; for (const [k,id,view] of pairs) { await RLP.goto(view,{instant:true}); out[k]=RLP.ctx.hotspots.enabled(id); } return out; }"""
            inside = """async ()=>{ const { owlPoint } = await import('./src/chapters/plague10/world.js'); const [x,z]=owlPoint(0,5.4); return RLP.ctx.views.canStand(x,z); }"""
            gates = page.evaluate(check_gates, GATES)
            assert gates == {'pellet': False, 'eagle': False, 'temple': False}, gates
            assert page.evaluate(inside) is False
            page.evaluate('async ()=>{ for (const id of ["mask_boar","mask_rabbit","bone_arrow","chick"]) RLP.state.give(id); await RLP.goto("p10_tell",{instant:true}); }')
            use(page, 'mask_boar', 'p10_gerard')
            assert page.evaluate('RLP.state.has("mask_boar")') and not page.evaluate('RLP.state.flag("masked")')
            use(page, 'bone_arrow', 'p10_gerard')
            assert page.evaluate('RLP.state.has("bone_arrow")') and not page.evaluate('!!RLP.state.flag("apple_shot")')
            page.evaluate('RLP.state.setFlag("cube_taken")')
            use(page, 'mask_rabbit', 'p10_gerard')
            assert page.evaluate('RLP.state.has("mask_rabbit")') and not page.evaluate('RLP.state.flag("masked")')
            use(page, 'mask_boar', 'p10_gerard')
            assert page.evaluate('RLP.state.flag("masked")') == ['gerard'] and not page.evaluate('RLP.state.has("mask_boar")')
            page.evaluate('async ()=>await RLP.goto("p10_hen",{instant:true})')
            use(page, 'chick', 'p10_hen')
            assert page.evaluate('RLP.state.has("chick")') and not page.evaluate('!!RLP.state.flag("hen_fed")')
            page.evaluate('RLP.state.setFlag("owl_fed"); RLP.state.setFlag("letter_door_open"); RLP.state.setFlag("owl_gate_open"); RLP.chapter.sync(RLP.ctx)')
            gates = page.evaluate(check_gates, GATES)
            assert gates == {'pellet': True, 'eagle': True, 'temple': True}, gates
            assert page.evaluate(inside) is True
            results['gates_and_wrong_items'] = True

            # 菜单：第十灾还是 wip，正常菜单“敬请期待”；?wip=1（同时跳过解锁顺序，见 progress.js）才能进
            boot(page, base, 'index.html?norender=1')
            assert 'open' not in page.locator('.plague').nth(9).get_attribute('class')
            page.evaluate("localStorage.setItem('rlp3d.profile', JSON.stringify({v: 1, ach: {}, cleared: Object.fromEntries([1,2,3,4,5,6,7,8,9].map(n=>['plague'+n,{t:1}]))}))")
            boot(page, base, 'index.html?norender=1&wip=1')
            assert 'open' in page.locator('.plague').nth(9).get_attribute('class')
            page.locator('.plague').nth(9).click()
            page.wait_for_function('window.RLP && RLP.ready && RLP.chapter?.number===10')
            assert page.evaluate('RLP.bootError') is None
            results['menu_wip_and_unlock'] = True
            page.close()

            mobile = browser.new_context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True)
            phone = mobile.new_page()
            phone.on('pageerror', lambda e: errors.append(str(e)))
            phone.on('requestfailed', lambda r: failed_requests.append(r.url))
            boot(phone, base)
            phone.evaluate('async ()=>await RLP.start(10,{fresh:true,skipIntro:true,view:"p10_drum"})')
            first = phone.evaluate("async ()=>(await import('./src/chapters/plague10/rules.js')).RHYTHM[0]")
            real_click(phone, 'p10_drum_' + first, True)
            assert phone.evaluate('RLP.state.flag("drum_step")') == 1
            shot(phone, 'checked-touch-drum')
            phone.evaluate('async ()=>{ RLP.state.setFlag("face",["white","white","white","white","white"]); RLP.chapter.sync(RLP.ctx); await RLP.goto("p10_ida",{instant:true}); }')
            real_click(phone, 'p10_stripe_2', True)
            assert phone.evaluate('RLP.state.flag("face")')[2] == 'green'
            shot(phone, 'checked-touch-face')
            phone.evaluate('async ()=>{ RLP.state.give("worm"); await RLP.goto("p10_hen",{instant:true}); }')
            use(phone, 'worm', 'p10_hen', True)
            assert phone.evaluate('!!RLP.state.flag("hen_fed")')
            assert phone.evaluate('RLP.ctx.ui.touchMode')
            results['touch_drum_face_and_inventory'] = True
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
