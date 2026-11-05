"""量第四灾布景里每个模型的真实尺寸（米），和 src/art/scale.js 里的现实参考对照。

用法（项目根目录）：python dev/plague4/measure_scale.py
输出两张表：布景模型（宽 × 高 × 深，只算当前可见的网格）和人物默认姿势的身高；超出容差标 ✗。
"""
import json
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'common'))
from shot import serve  # noqa: E402

MEASURE = """async () => {
  const { REAL, HUMAN, checkSize } = await import('/src/art/scale.js');
  const THREE = RLP.ctx.THREE, W = RLP.ctx.p4.world, box = new THREE.Box3(), size = new THREE.Vector3(), tmp = new THREE.Box3();
  W.ctx.world.root.updateMatrixWorld(true);
  const visibleBox = (root) => {
    box.makeEmpty();
    root.traverseVisible((c) => {
      if (!c.isMesh || !c.geometry || c.userData.proxy) return;
      if (c.isSkinnedMesh) {   // 蒙皮网格要按当前姿势算包围盒（geometry.boundingBox 是绑定姿势下的）
        c.skeleton.update(); c.boundingBox = null; c.computeBoundingBox(); tmp.copy(c.boundingBox).applyMatrix4(c.matrixWorld); box.union(tmp); return;
      }
      if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
      tmp.copy(c.geometry.boundingBox).applyMatrix4(c.matrixWorld); box.union(tmp);
    });
    return box.isEmpty() ? size.set(0, 0, 0) : box.getSize(size);
  };
  const rows = [];
  for (const [id, o] of Object.entries(W)) {
    if (!o || !o.isObject3D || id.endsWith('Rig')) continue;
    const wasVisible = o.visible; o.visible = true;
    visibleBox(o);
    const real = REAL.p4[id] || null;
    rows.push({ id, w: +size.x.toFixed(2), h: +size.y.toFixed(2), d: +size.z.toFixed(2), real, verdict: real ? checkSize(real, size) : null });
    o.visible = wasVisible;
  }
  const { makeCharacter, CHARACTER_IDS } = await import('/src/art/characters.js');
  const people = [];
  for (const id of CHARACTER_IDS) {
    try {
      const rig = makeCharacter(id); rig.root.updateMatrixWorld(true); visibleBox(rig.root);
      people.push({ id, h: +size.y.toFixed(2), w: +size.x.toFixed(2), d: +size.z.toFixed(2) });
    } catch (e) { people.push({ id, error: String(e).slice(0, 80) }); }
  }
  return { rows, people, HUMAN };
}"""

# 角色 id → scale.js 里 HUMAN 的键（id 里含这个词就算）
PEOPLE_KEYS = [('jakob_child', 'jakobChild'), ('jakobchild', 'jakobChild'), ('child', 'jakobChild'), ('nicholas', 'nicholas'),
               ('gerard', 'gerard'), ('david', 'david'), ('jakob', 'jakob'), ('caroline', 'caroline'), ('ida', 'ida'),
               ('margaret', 'margaret'), ('elizabeth', 'elizabeth'), ('soul', 'soul')]


def main():
    server, port = serve()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
            page = browser.new_page(viewport={'width': 1280, 'height': 720})
            page.goto(f'http://127.0.0.1:{port}/index.html?autotest=1&chapter=4&norender=1', wait_until='domcontentloaded', timeout=90000)
            page.wait_for_function('window.RLP && RLP.ready', timeout=90000)
            page.evaluate('async () => { RLP.ctx.engine.renderEnabled = false; await RLP.start(4, {skipIntro: true, fresh: true}); }')
            data = page.evaluate(MEASURE)
            browser.close()
    finally:
        server.shutdown()
    rows, people, human = data['rows'], data['people'], data['HUMAN']
    bad = 0
    print(f"{'名称':<14}{'宽 × 高 × 深 (m)':<24}{'现实参考':<34}结论")
    for r in rows:
        real, v = r['real'], r['verdict']
        mark = '' if v is None else ('✓' if v['ok'] else '✗ ' + v['why'])
        bad += bool(v and not v['ok'])
        print(f"{r['id']:<14}{r['w']:.2f} × {r['h']:.2f} × {r['d']:.2f}".ljust(38) + f"{(real or {}).get('note', ''):<34}{mark}")
    print(f'\n布景模型超出容差：{bad} 个')
    print('\n人物默认姿势的包围盒（含头发 / 帽子；默认姿势可能是坐姿或驼背，只作参考）：')
    for pr in people:
        if 'error' in pr:
            print(f"  {pr['id']:<18}出错 {pr['error']}"); continue
        key = next((k for pat, k in PEOPLE_KEYS if re.search(pat, pr['id'])), None)
        want = human.get(key) if key else None
        note = f"身高 {want:.2f}，差 {pr['h'] - want:+.2f}" if want else '表里没有'
        print(f"  {pr['id']:<18}高 {pr['h']:.2f}  宽 {pr['w']:.2f}  深 {pr['d']:.2f}   {note}")
    out = Path(__file__).with_name('media'); out.mkdir(exist_ok=True)
    (out / 'scale_report.json').write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
