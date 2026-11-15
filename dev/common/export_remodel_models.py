"""从正式工厂导出逐件 GLB、缩略图和校验清单；代码工厂是可编辑来源，GLB 是跨软件交换素材。"""
import argparse
import base64
import hashlib
import json
import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright

PARADISE_IDS='p10_wood_owl,p10_feather,p10_apple,p10_worm,p10_egg,p10_bow,p3_mussel_shell,p3_stump,p3_swatter,p3_snail,p3_honey,p3_ear,p3_mussel,p3_berries,p5_lettuce,p5_tomato,p5_cucumber,p6_skull,p6_empty_bottle,p6_bottles,p6_blood,p6_tears,p6_snot,p6_saliva,p6_medicine,p6_mushroom,p6_onion,p6_onion_plant,p6_pepper,p6_needle_thread,p6_stump,p6_well,p6_staff,p6_clock,p6_clock_heart,p6_sick_heart,p6_flask,p6_chest,p7_hammer,p7_pistachio,p7_horn,p7_strawberry,p7_ice_cream_strawberry,p7_ice_cream_pistachio,p7_carrot,p7_skull_pile,p8_axe,p8_shovel,p8_key,p8_mandolin,p8_lantern,p8_bones,p9_bones,p9_copper_key'.split(',')
HOTEL_ENTRIES={
 'items_d4':['glass_plate','magnifier','brush','brush_bloody','developer','revolver','pheasant_breast'],
 'items_d5':['chaise5','sandwich','lettuce','hammer','toilet_paper','boar_ribs','tomatoes'],
 'props_room1':['deer_skull'],
}

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*_):pass

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--project',choices=['hotel','paradise'],required=True);ap.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);args=ap.parse_args()
    root=args.root.resolve();out=root/'dev/common/remodel_assets/20261115/models';out.mkdir(parents=True,exist_ok=True)
    if args.project=='hotel':modules=list(HOTEL_ENTRIES)
    else:modules=[p.stem for p in sorted((root/'src/art').glob('*.js')) if re.search(r'export const FACTORIES\s*=',p.read_text(encoding='utf8'))]
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(root)));threading.Thread(target=server.serve_forever,daemon=True).start();records=[];errors=[]
    try:
      with sync_playwright() as p:
        browser=p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        page=browser.new_page(viewport={'width':500,'height':400});page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/dev/common/viewer.html?hud=0&freeze=1')
        page.wait_for_function('window.VIEW_READY',timeout=180000)
        entries=page.evaluate('''async({modules,wanted,project,hotel})=>{
          const T=await import('three'),{GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
          VIEW.scene.add(new T.HemisphereLight('#f4eee1','#6f6559',2.2));const sun=new T.DirectionalLight('#fff4df',2);sun.position.set(3,5,7);VIEW.scene.add(sun);
          const entries=[];for(const mod of modules){const m=await import('/src/art/'+mod+'.js');for(const [id,make]of Object.entries(m.FACTORIES)){if(project==='hotel'?hotel[mod].includes(id):wanted.includes(id))entries.push({mod,id,make});}}
          window.EXPORT_MODELS={T,GLTFExporter,entries};return entries.map(({mod,id},i)=>({mod,id,i}));
        }''',{'modules':modules,'wanted':PARADISE_IDS,'project':args.project,'hotel':HOTEL_ENTRIES})
        assert len(entries)==(15 if args.project=='hotel' else 54),entries
        for e in entries:
          data=page.evaluate('''async i=>{
            const {T,GLTFExporter,entries}=EXPORT_MODELS,v=VIEW,e=entries[i];if(v.obj)v.scene.remove(v.obj);
            const obj=e.make({});v.obj=obj;v.scene.add(obj);obj.updateWorldMatrix(true,true);
            const bounds=new T.Box3();let vertices=0,triangles=0;
            obj.traverseVisible(n=>{if(!n.isMesh||n.userData.proxy||n.material?.visible===false)return;const g=n.geometry,p=g.attributes.position;g.computeBoundingBox();bounds.union(g.boundingBox.clone().applyMatrix4(n.matrixWorld));vertices+=p.count;triangles+=(g.index?g.index.count:p.count)/3;for(let j=0;j<p.count;j++){if(!Number.isFinite(p.getX(j)+p.getY(j)+p.getZ(j)))throw Error('非法顶点 '+e.id);}});
            const size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),dist=Math.max(size.y,size.x/1.25,size.z,.05)*1.9;
            v.camera.position.copy(center).add(new T.Vector3(.45,.24,1).normalize().multiplyScalar(dist));v.camera.near=dist/100;v.camera.far=dist*100;v.camera.fov=38;v.camera.updateProjectionMatrix();v.controls.target.copy(center);v.controls.update();v.render();
            const clone=obj.clone(true);clone.traverse(n=>{if(n.userData.proxy||n.material?.visible===false)n.visible=false;n.userData={};if(n.isMesh){const convert=m=>new T.MeshStandardMaterial({color:m.color||'#ffffff',map:m.map||null,roughness:1,metalness:0,side:m.side,transparent:m.transparent,opacity:m.opacity});n.material=Array.isArray(n.material)?n.material.map(convert):convert(n.material);}});
            // 热点透明代理不能进入交换素材；克隆前已标记的可见性另按原树同步。
            const originals=[],copies=[];obj.traverse(n=>originals.push(n));clone.traverse(n=>copies.push(n));originals.forEach((n,j)=>{if(n.userData.proxy)copies[j].visible=false;});
            const glb=await new GLTFExporter().parseAsync(clone,{binary:true,onlyVisible:true});const bytes=new Uint8Array(glb);let binary='';for(let j=0;j<bytes.length;j+=32768)binary+=String.fromCharCode(...bytes.subarray(j,j+32768));
            return{module:e.mod,id:e.id,source:'src/art/'+e.mod+'.js',sizeMeters:size.toArray(),vertices,triangles,binary:btoa(binary)};
          }''',e['i'])
          binary=base64.b64decode(data.pop('binary'));assert binary[:4]==b'glTF' and int.from_bytes(binary[8:12],'little')==len(binary)
          stem=e['mod']+'__'+e['id'];(out/(stem+'.glb')).write_bytes(binary);page.screenshot(path=str(out/(stem+'.png')))
          data.update(glb=stem+'.glb',image=stem+'.png',bytes=len(binary),sha256=hashlib.sha256(binary).hexdigest());records.append(data)
          if len(records)%10==0:print('逐件导出',len(records),'/',len(entries),flush=True)
        browser.close()
      assert not errors,errors
      (out/'manifest.json').write_text(json.dumps({'project':args.project,'date':'2026-11-15','models':records,'errors':errors},ensure_ascii=False,indent=2),encoding='utf8')
      for start in range(0,len(records),24):
        chunk=records[start:start+24];sheet=Image.new('RGB',(1600,((len(chunk)+3)//4)*346),'#e5e0d5');draw=ImageDraw.Draw(sheet)
        for i,r in enumerate(chunk):
          x=i%4*400;y=i//4*346;sheet.paste(Image.open(out/r['image']).convert('RGB').resize((400,320)),(x,y));draw.text((x+5,y+323),r['id'],fill='#272a23')
        sheet.save(out/f'contact_{start//24+1:02}.jpg',quality=90)
      print(json.dumps({'models':len(records),'bytes':sum(r['bytes']for r in records),'errors':errors},ensure_ascii=False),flush=True)
    finally:server.shutdown()

if __name__=='__main__':main()
