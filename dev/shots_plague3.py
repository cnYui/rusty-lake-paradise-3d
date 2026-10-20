"""第三灾视图巡检：开一次浏览器，按清单逐个切到视图（可先设旗标 / 给物品 / 跑一段 JS）并截图到 dev/shots/p3/ch/。

用法：
    python dev/shots_plague3.py                      # 全部
    python dev/shots_plague3.py beach_mid p3_slider  # 只拍指定名字
清单里每一项 = 名字、视图、start 时的 flags / give、进视图后的 JS（可选）。截图前会等交互空闲、关掉淡入黑场。
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from shot import serve

OUT = Path(__file__).resolve().parent / 'shots' / 'p3' / 'ch'
OUT.mkdir(parents=True, exist_ok=True)

ALL_ITEMS = 'p3_swatter,p3_shovel,p3_axe,p3_scissors,p3_gnats,p3_snail,p3_honey,p3_ear,p3_mussel,p3_berries,p3_sap,p3_bulb,p3_clay,p3_flower_yellow,p3_vase_slim,p3_vase_urn'

# 名字: (视图, flags, give, js)
SHOTS = {
    'overview': ('overview', '', '', ''),
    'beach_mid': ('beach_mid', '', '', ''),
    'rock_left': ('p3_rock_left', '', '', ''),
    'rock_right': ('p3_rock_right', 'p3_mussel_open', '', ''),
    'dig_before': ('p3_dig', '', '', ''),
    'dig_after': ('p3_dig', 'p3_x_dug', '', ''),
    'slider': ('p3_slider', 'p3_x_dug', '', ''),
    'slider_open': ('p3_slider', 'p3_x_dug,p3_slider_solved,p3_box_open', '', ''),
    'forest_clearing': ('forest_clearing', '', '', ''),
    'forest_clearing_felled': ('forest_clearing', 'p3_xtree_felled', '', ''),
    'flytrap': ('p3_flytrap', 'p3_trap_fed=2', '', ''),
    'flytrap_bloom': ('p3_flytrap', 'p3_trap_fed=4,p3_flower_bloomed', '', ''),
    'x_tree': ('p3_x_tree', '', '', ''),
    'pump_clearing': ('pump_clearing', '', '', ''),
    'mound': ('p3_mound', 'p3_mound_dug', '', ''),
    'hive': ('p3_hive', 'p3_hive_step=3', '', ''),
    'hive_honey': ('p3_hive', 'p3_hive_step=7,p3_honey_ready', '', ''),
    'house_int': ('house_int', '', '', ''),
    'barber': ('p3_barber', 'p3_scissors_given,p3_hair=1', '', ''),
    'barber_ear': ('p3_barber', 'p3_scissors_given,p3_hair=3,p3_ear_cut', '', ''),
    'scalp': ('p3_scalp', 'p3_scissors_given,p3_hair=3', '', ''),
    'bell_jar': ('p3_bell_jar', 'p3_jar_dome_up,p3_jar_plant=flower,p3_jar_kind=orange', '', ''),
    'wheel': ('p3_wheel', 'p3_wheel_clay,p3_wheel_shape=2,2,3', '', ''),
    'lake_shore': ('lake_shore', '', '', ''),
    'margaret': ('p3_margaret', '', '', ''),
    'margaret_swatted': ('p3_margaret', 'p3_margaret_swatted', '', ''),
    'stump': ('p3_stump', '', '', ''),
    'stump_cracked': ('p3_stump', 'p3_stump_hits=8,p3_axe_taken,p3_snail_taken', '', ''),
    'temple_int': ('temple_int', '', '', ''),
    'sill': ('p3_sill', 'p3_sill_flower=p3_flower_yellow', '', ''),
    'holder': ('holder', 'p3_holder_open', '', ''),
    'painting': ('painting', 'p3_cube_inserted,p3_painting_lit,p3_woman_banished', '', ''),
    'grove': ('p3_grove', '', '', ''),
    'grove_covered': ('p3_grove', 'p3_david_covered,p3_table_berries,p3_table_sap,p3_table_honey', '', ''),
    'berries': ('p3_berries', '', '', ''),
    'birch': ('p3_birch', 'p3_birch_tapped,p3_sap_taken,p3_cocoon=hanging', '', ''),
    'david': ('p3_david', 'p3_table_berries,p3_table_sap', '', ''),
    'larva': ('p3_david', 'p3_david_covered,p3_table_berries,p3_table_sap,p3_table_honey,p3_larva_cleared', '', ''),
    'shrine': ('p3_shrine', 'p3_shrine_vase_1=slim,p3_shrine_vase_2=urn,p3_shrine_flower_0=yellow,p3_shrine_flower_1=rose', '', ''),
    'portrait': ('p3_portrait', 'p3_shrine_vase_1=slim,p3_shrine_vase_2=urn,p3_shrine_flower_0=yellow,p3_shrine_flower_1=rose,p3_shrine_flower_2=orange,p3_portrait_eyes', '', ''),
    'memory': ('p3_memory', 'p3_portrait_eyes', '', "const c=RLP.ctx,w=c.p3.world;w.shrine.setPortrait('gone',{instant:true});w.shrine.drawFrame(1,{instant:true});w.frame.setProgress(1);for(const r of Object.values(w.family.rigs)){r.root.visible=true;r.setOpacity(.6);}"),
    'inventory': ('beach_mid', '', ALL_ITEMS, ''),
}


def main(names):
    names = names or list(SHOTS)
    httpd, port = serve()
    base = f'http://127.0.0.1:{port}/'
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        page = browser.new_page(viewport={'width': 1280, 'height': 720})
        page.set_default_timeout(120000)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(base + 'index.html?autotest=1&chapter=3', wait_until='domcontentloaded')
        page.wait_for_function('window.RLP && RLP.ready')
        assert not page.evaluate('RLP.bootError'), page.evaluate('RLP.bootError')
        for name in names:
            view, flags, give, js = SHOTS[name]
            page.evaluate("""async ([flags, give]) => { await RLP.start(3, { fresh: true, skipIntro: true, flags, give }); }""", [flags, give])
            page.evaluate("""async view => { await RLP.goto(view, { instant: true, teleport: true }); }""", view)
            if js:
                page.evaluate('async () => {' + js + '}')
            page.evaluate("""async () => { await RLP.idle(); await RLP.ctx.ui.fade(0, 0); RLP.ctx.ui.clearSay(); RLP.ctx.views.dropPointer(); await new Promise(r => setTimeout(r, 400)); RLP.ctx.engine.render(); }""")
            page.screenshot(path=str(OUT / f'{name}.png'))
            print('saved', name, flush=True)
        if errors:
            print('PAGE ERRORS:', errors)
        browser.close()
    httpd.shutdown()
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
