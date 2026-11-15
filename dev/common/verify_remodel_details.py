"""对第三灾的羽毛拍、蜗牛、双壳使用真实输入验收；单独复查菜单，截图只保存本地。"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'plague3'))
from test_plague3_browser import TARGET,settle,test_menu,FAILS
from shot import serve

OUT=Path(__file__).resolve().parent/'media/remodel_20261114/p3_interaction'

def main():
    OUT.mkdir(parents=True,exist_ok=True);server,port=serve();base=f'http://127.0.0.1:{port}/';report={'clicks':[],'errors':[]}
    try:
      with sync_playwright() as p:
        b=p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']);page=b.new_page(viewport={'width':1280,'height':720});page.set_default_timeout(180000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.goto(base+'index.html?autotest=1&chapter=3&norender=1');page.wait_for_function('window.RLP?.ready');assert not page.evaluate('RLP.bootError');page.evaluate('RLP.timeScale=25')
        def start(view,give=[]):
          page.evaluate('async a=>{await RLP.start(3,{fresh:true,skipIntro:true,view:a.view,give:a.give});RLP.timeScale=25;await Promise.all(RLP.ctx.engine.canvas.getAnimations().map(a=>a.finished));}',{'view':view,'give':give});settle(page)
        def shot(name):
          page.evaluate('async()=>{RLP.ctx.ui.clearSay();await RLP.ctx.ui.fade(0,0);RLP.ctx.engine.render();}');page.screenshot(path=str(OUT/(name+'.png')))
        def click(id,expect):
          at=page.evaluate(TARGET,id);page.mouse.click(at['x'],at['y']);settle(page);assert page.evaluate(expect),id;report['clicks'].append({'id':id,'xy':at,'ok':True})
        start('p3_rock_left');shot('swatter_on_rock');click('p3_swatter','RLP.state.has("p3_swatter")')
        start('p3_stump');shot('snail_on_stump');click('p3_snail','RLP.state.flag("p3_snail_taken")')
        start('p3_rock_right',['p3_shovel']);shot('mussel_closed');page.keyboard.press('1');click('p3_mussel','RLP.state.flag("p3_mussel_open")');shot('mussel_open');click('p3_mussel','RLP.state.has("p3_mussel")')
        start('p3_rock_right');assert not page.evaluate('RLP.state.flag("p3_mussel_open")');shot('mussel_reset');report['newGameReset']=True
        (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        menu=b.new_page(viewport={'width':1280,'height':720});menu.set_default_timeout(180000)
        try:
          test_menu(menu,base);assert not FAILS,FAILS;report['menu']=True
        except Exception as error:
          report['menuError']=str(error);menu.screenshot(path=str(OUT/'menu_failure.png'))
          report['menuState']=menu.evaluate('()=>({url:location.href,ready:window.RLP?.ready,chapter:window.RLP?.chapter?.id,view:window.RLP?.state?.view,error:String(window.RLP?.bootError||""),dialogs:[...document.querySelectorAll("[role=dialog],.dialog")].map(e=>e.textContent)})')
          raise
        finally:(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        assert not report['errors'],report['errors'];b.close();print(json.dumps(report,ensure_ascii=False),flush=True)
    finally:server.shutdown()

if __name__=='__main__':main()
