"""第二灾 Ida 吹笛：点 Ida 本人（不只是 2 cm 粗的笛子）也能吹一个乐句、让青蛙变色。

来源：小红书评论多人反馈“给了蛙笛，青蛙不变色”——笛子的点击范围太小，手机上点不中。
真实鼠标点击，通过则退出码 0。
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'common'))
from shot import serve  # noqa: E402

AIM_BODY = """() => {
  const c=RLP.ctx; c.world.root.updateMatrixWorld(true); c.engine.camera.updateMatrixWorld(true);
  const rect=c.engine.canvas.getBoundingClientRect(), root=c.hotspots.get('ida').object, pts=[];
  root.traverse(o=>{ if(!o.isMesh||!o.visible||o.userData.proxy) return;
    const b=new c.THREE.Box3().setFromObject(o); if(b.isEmpty()) return;
    pts.push(b.getCenter(new c.THREE.Vector3())); });
  for (const p of pts) { p.project(c.engine.camera);
    if (Math.abs(p.x)>.95||Math.abs(p.y)>.95||p.z>1) continue;
    const x=rect.left+(p.x+1)*rect.width/2, y=rect.top+(1-p.y)*rect.height/2;
    const hit=c.hotspots.pickAt(x,y);
    // 要点在 Ida 身体上（不是笛子、不是头顶的青蛙）
    if (hit && hit.spec.id==='ida') return {x,y};
  }
  throw new Error('画面里找不到能点到 Ida 的位置');
}"""


def run():
    httpd, port = serve()
    base = f'http://127.0.0.1:{port}/'
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        page = browser.new_page(viewport={'width': 1280, 'height': 720})
        page.set_default_timeout(120000)
        page.goto(base + 'index.html?autotest=1&chapter=2&norender=1', wait_until='domcontentloaded')
        page.wait_for_function('window.RLP && RLP.ready')
        page.evaluate("() => { RLP.timeScale = 25; RLP.ctx.engine.renderEnabled = false; }")
        page.evaluate("""async () => {
          await RLP.start(2, { fresh: true, skipIntro: true, view: 'ida' });
          RLP.state.setFlag('ida_talked', true); RLP.state.give('frog_flute'); RLP.chapter.sync(RLP.ctx);
          RLP.ctx.ui.clearSay(); await RLP.ctx.ui.fade(0, 0);
        }""")

        def settle():
            page.wait_for_function('!RLP.ctx.hotspots.busy && !RLP.ctx.views.transitioning && !RLP.ctx.ui.locked')
            page.evaluate('async () => { RLP.ctx.views.dropPointer(); await RLP.idle(); }')

        # 1) 选中蛙笛点 Ida：开始吹奏
        settle()
        pos = page.evaluate(AIM_BODY)
        page.evaluate("RLP.state.select('frog_flute')")
        page.mouse.click(pos['x'], pos['y'])
        settle()
        assert page.evaluate('!!RLP.state.flag("ida_playing")'), '给了蛙笛 Ida 没有开始吹奏'
        # 2) 不选任何东西，只点 Ida 的身体：每点一下吹一个乐句
        for k in range(1, 6):
            pos = page.evaluate(AIM_BODY)
            page.mouse.click(pos['x'], pos['y'])
            settle()
            got = page.evaluate('RLP.state.flag("ida_phrase")')
            assert got == k, f'点 Ida 本人第 {k} 下后 ida_phrase={got}'
        assert not page.evaluate('!!RLP.state.flag("ida_playing")'), '第 5 个乐句后她应该停止吹奏'
        print('点 Ida 本人吹 5 个乐句通过')
        browser.close()
    httpd.shutdown()


if __name__ == '__main__':
    run()
