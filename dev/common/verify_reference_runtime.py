"""跨项目逐章自动通关与最终场景截图，独立保存每章结果，不改用户存档。"""
import argparse
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*_):pass

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);ap.add_argument('--chapters',default='1,2,3,4,5');args=ap.parse_args()
    root=args.root.resolve();out=root/'dev/common/media/remodel_20261114/runtime';out.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(root)));threading.Thread(target=server.serve_forever,daemon=True).start()
    report=json.loads((out/'report.json').read_text(encoding='utf-8')).get('chapters',{}) if (out/'report.json').exists() else {};errors=[]
    try:
      with sync_playwright() as p:
        browser=p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']);page=browser.new_page(viewport={'width':1280,'height':720})
        page.on('pageerror',lambda e:errors.append(str(e)))
        for chapter in map(int,args.chapters.split(',')):
          page.goto(f'http://127.0.0.1:{server.server_port}/index.html?autotest=1&norender=1&labels=0&wip=1&chapter={chapter}')
          page.wait_for_function('window.RLP?.ready===true',timeout=240000)
          page.evaluate('''async n=>{if(RLP.bootError)throw Error(RLP.bootError);RLP.timeScale=60;RLP.ctx.ui.autoAdvance=false;await RLP.start(n,{fresh:true,skipIntro:true});}''',chapter)
          result=page.evaluate('''async()=>{
            const options={stepDelay:0,stepTimeout:45000};
            if(RLP.chapter.id!=='dinner1')return await RLP.autoplay(options);
            // 飞蛾只在短暂停留时可抓；按玩家正常时间等候及使用，不能在 60 倍速度下争抢同一帧。
            const steps=RLP.chapter.walkthrough,i=steps.findIndex(s=>s.act==='waitMoth'),all=[];
            for(const[a,b,speed]of [[0,i,60],[i,i+2,1],[i+2,steps.length,60]]){
              RLP.timeScale=speed;const r=await RLP.autoplay({...options,steps:steps.slice(a,b)});all.push(r);if(!r.ok)break;
            }
            return{ok:all.every(r=>r.ok),steps:all.reduce((n,r)=>n+r.steps,0),total:all.reduce((n,r)=>n+r.total,0),failedStep:all.find(r=>!r.ok)?.failedStep||null,warnings:all.flatMap(r=>r.warnings||[]),timedMothNormalSpeed:true};
          }''')
          (out/f'chapter_{chapter}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
          report[str(chapter)]={key:result.get(key) for key in ['ok','steps','total','failedStep','warnings']}
          print('CHAPTER',chapter,json.dumps(report[str(chapter)],ensure_ascii=False)[:1000],flush=True)
          if result.get('ok'):
            page.evaluate('RLP.ctx.engine.render()');page.screenshot(path=str(out/f'chapter_{chapter}.png'))
          (out/'report.json').write_text(json.dumps({'chapters':report,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
        browser.close()
    finally:server.shutdown()
    assert all(r['ok'] for r in report.values()) and not errors,(report,errors)

if __name__=='__main__':main()
