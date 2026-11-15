"""重新载入导出的 GLB，检查交换素材不是空文件或损坏的访问器；不运行游戏关卡。"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from shot import ROOT,serve

def main():
    folder=Path(ROOT)/'dev/common/remodel_assets/20261115';manifest=json.loads((folder/'models/manifest.json').read_text(encoding='utf8'));records=[];errors=[]
    server,port=serve()
    try:
      with sync_playwright() as p:
        b=p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader']);page=b.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{port}/dev/common/viewer.html?freeze=1&hud=0');page.wait_for_function('window.VIEW_READY',timeout=180000)
        for model in manifest['models']:
          data=page.evaluate('''async file=>{const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');const gltf=await new GLTFLoader().loadAsync('/dev/common/remodel_assets/20261115/models/'+file);let meshes=0,vertices=0;gltf.scene.traverse(n=>{if(n.isMesh){meshes++;const p=n.geometry.attributes.position;vertices+=p.count;for(let i=0;i<p.count;i++)if(!Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)))throw Error('非法导出坐标 '+file);n.geometry.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material]){m.map?.dispose();m.dispose();}}});return{file,meshes,vertices};}''',model['glb'])
          assert data['meshes']>0 and data['vertices']>0,data;records.append(data)
        b.close()
      assert not errors,errors
      (folder/'verification').mkdir(exist_ok=True)
      (folder/'verification/glb_roundtrip.json').write_text(json.dumps({'models':records,'errors':errors},ensure_ascii=False,indent=2),encoding='utf8')
      print('GLB 重新载入通过：',len(records),flush=True)
    finally:server.shutdown()

if __name__=='__main__':main()
