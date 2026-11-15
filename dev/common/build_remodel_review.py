"""按已上传的素材清单生成可离线打开的逐件审阅页；真实游戏机位与交换 GLB 分开展示。"""
import html
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'dev/common/remodel_assets/20261115'

def main():
    data=json.loads((OUT/'models/manifest.json').read_text(encoding='utf8'))
    title='锈湖旅馆' if data['project']=='hotel' else '锈湖天堂岛'
    models=data['models'];scenes=sorted((OUT/'scenes').glob('*.png'));refs=sorted((OUT/'references').glob('*.jpg'))
    cards=[]
    for m in models:
      label=html.escape(m['id']);module=html.escape(m['module']);glb=html.escape(m['glb']);image=html.escape(m['image'])
      cards.append(f'<figure data-key="{module} {label}"><a href="models/{image}"><img loading="lazy" src="models/{image}" alt="{label}"></a><figcaption>{label}<small>{module} · {m["vertices"]:,} 顶点</small><a href="models/{glb}" download>下载 GLB</a> · <a href="../../viewer.html?hud=0&amp;prop={label}&amp;mod={module}">旋转查看</a></figcaption></figure>')
    def images(files):
      return ''.join(f'<figure><a href="{p.relative_to(OUT).as_posix()}"><img loading="lazy" src="{p.relative_to(OUT).as_posix()}" alt="{html.escape(p.stem)}"></a><figcaption>{html.escape(p.stem)}</figcaption></figure>'for p in files)
    page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TITLE · 模型审阅</title>
<style>*{box-sizing:border-box}body{margin:0;background:#eeeae0;color:#292820;font:15px/1.7 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1360px;margin:auto;padding:32px 24px 70px}h1{font-size:28px;font-weight:500}h2{font-size:21px;font-weight:500;margin-top:40px}p{max-width:75ch}a{color:#6c572b}input{padding:10px 12px;min-width:280px;max-width:100%;font:inherit;border:1px solid #a6a795;background:#faf8f0}small{display:block;color:#666b5e}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:24px}figure{margin:0}img{width:100%;display:block;background:#c5c6bb}figcaption{padding:8px 0;overflow-wrap:anywhere}.scenes{grid-template-columns:repeat(auto-fit,minmax(420px,1fr))}@media(max-width:600px){.scenes{grid-template-columns:1fr}}</style>
<main><h1>TITLE · 模型审阅</h1><p>2026年11月15日。这里展示本批导出的 COUNT 个工厂/状态变体，点击图片可以看原尺寸。GLB 保存静态外观，剧情状态、人物骨架姿势和点击逻辑仍由源码控制。</p><p><a href="README.md">素材来源与重建说明</a> · <a href="models/manifest.json">逐件尺寸与 SHA256</a></p>
<h2>正式游戏机位</h2><div class="grid scenes">SCENES</div><h2>逐件交换素材</h2><p><input id="filter" placeholder="按道具或模块名筛选" aria-label="筛选道具"> <span id="count">COUNT / COUNT</span></p><div class="grid" id="models">CARDS</div>
<h2>原作实况参考帧</h2><p>仅保存用于核对外形与姿势的抽帧；视频链接和章节对应见说明。</p><div class="grid scenes">REFS</div></main>
<script>const input=document.querySelector('#filter'),cards=[...document.querySelectorAll('#models figure')];input.addEventListener('input',()=>{let n=0;for(const c of cards){c.hidden=!c.dataset.key.toLowerCase().includes(input.value.trim().toLowerCase());if(!c.hidden)n++;}document.querySelector('#count').textContent=n+' / '+cards.length;});</script></html>'''
    for key,value in [('TITLE',title),('COUNT',str(len(models))),('SCENES',images(scenes)),('CARDS',''.join(cards)),('REFS',images(refs))]:page=page.replace(key,value)
    (OUT/'index.html').write_text(page,encoding='utf8')
    print(title,len(models),'个变体；',len(scenes),'张实景；',len(refs),'组参考',flush=True)

if __name__=='__main__':main()
