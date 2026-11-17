"""逐件生成道具目录、三维尺寸和缩略图；可对两个项目使用，不改动玩法或存档。"""
import argparse
import json
import re
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    ap.add_argument('--out', default='dev/common/media/remodel_20261114/audit_before')
    ap.add_argument('--ids', default='')
    args = ap.parse_args()
    root = args.root.resolve()
    out = root / args.out
    out.mkdir(parents=True, exist_ok=True)
    modules = []
    for file in sorted((root / 'src/art').glob('*.js')):
        if re.search(r'export const FACTORIES\s*=', file.read_text(encoding='utf-8')):
            modules.append(file.stem)
    srv = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(root)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    records = []
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        page = browser.new_page(viewport={'width': 500, 'height': 400})
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{srv.server_port}/dev/common/viewer.html?hud=0')
        page.wait_for_function('window.VIEW_READY || window.VIEW_ERROR', timeout=120000)
        page.evaluate('''async modules => {
          const T=await import('three'); window.AUDIT={T, entries:[]};
          VIEW.scene.add(new T.HemisphereLight('#f4eee1','#6f6559',2.2));
          const sun=new T.DirectionalLight('#fff4df',2.0);sun.position.set(3,5,7);VIEW.scene.add(sun);
          for(const mod of modules){const m=await import('/src/art/'+mod+'.js');for(const [id,make] of Object.entries(m.FACTORIES))AUDIT.entries.push({mod,id,make});}
          window.AUDIT.render=(index)=>{
            const {T}=AUDIT, entry=AUDIT.entries[index],v=VIEW;
            if(AUDIT.object) v.scene.remove(AUDIT.object);
            const obj=entry.make({}); AUDIT.object=obj;v.obj=obj;v.scene.add(obj);
            obj.updateMatrixWorld(true);
            const b=new T.Box3();let vertices=0,meshes=0;
            obj.traverse(n=>{if(n.isMesh&&!n.userData.proxy&&n.visible){const g=n.geometry;if(!g.boundingBox)g.computeBoundingBox();b.union(g.boundingBox.clone().applyMatrix4(n.matrixWorld));vertices+=g.attributes.position.count;meshes++;}});
            if(b.isEmpty())b.setFromCenterAndSize(new T.Vector3(),new T.Vector3(1,1,1));
            const s=b.getSize(new T.Vector3()),c=b.getCenter(new T.Vector3()),dist=Math.max(s.y,s.x/1.25,s.z,.05)*1.9;
            v.camera.position.copy(c).add(new T.Vector3(.45,.24,1).normalize().multiplyScalar(dist));v.camera.near=dist/100;v.camera.far=dist*100;v.camera.fov=38;v.camera.updateProjectionMatrix();v.controls.target.copy(c);v.controls.update();v.render();
            return{module:entry.mod,id:entry.id,size:s.toArray(),vertices,meshes,placeholder:!!obj.userData.placeholder};
          };
        }''', modules)
        entries = page.evaluate('AUDIT.entries.map((e,i)=>({i,id:e.id,module:e.mod}))')
        wanted = set(args.ids.split(',')) if args.ids else None
        if wanted:
            missing=wanted-{e['id'] for e in entries}
            if missing:raise RuntimeError('指定道具未在项目中找到：'+','.join(sorted(missing)))
        for entry in entries:
            if wanted and entry['id'] not in wanted:
                continue
            try:
                record = page.evaluate('i=>AUDIT.render(i)', entry['i'])
                name = f"{entry['module']}__{entry['id']}.png"
                page.screenshot(path=str(out / name))
                record['image'] = name
                records.append(record)
            except Exception as e:
                records.append({**entry, 'error': str(e)[:500]})
            if len(records) % 25 == 0:
                print('已核对', len(records), '/', len(entries), flush=True)
        browser.close()
    srv.shutdown()
    (out / 'inventory.json').write_text(json.dumps({'models': records, 'pageErrors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
    images = [r for r in records if 'image' in r]
    for start in range(0, len(images), 24):
        chunk = images[start:start + 24]
        sheet = Image.new('RGB', (1600, ((len(chunk) + 3) // 4) * 346), '#dfdcd4')
        draw = ImageDraw.Draw(sheet)
        for i, record in enumerate(chunk):
            im = Image.open(out / record['image']).convert('RGB').resize((400, 320))
            x, y = i % 4 * 400, i // 4 * 346
            sheet.paste(im, (x, y))
            draw.text((x + 4, y + 322), record['id'], fill='black')
        sheet.save(out / f'contact_{start // 24 + 1:02}.jpg', quality=90)
    print(json.dumps({'models': len(records), 'failures': len([r for r in records if 'error' in r]), 'pageErrors': errors, 'output': str(out)}, ensure_ascii=False), flush=True)
    return bool(errors or any('error' in r for r in records))


if __name__ == '__main__':
    sys.exit(main())
