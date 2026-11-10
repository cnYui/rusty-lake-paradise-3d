"""第三灾游玩预览：把演示录像按 BGM 的节拍剪成约 35 秒。

BGM：Fabrizio Paterlini《Rue des trois frères》（B 站 BV19P411M7Ew，钢琴曲，只在本机用来剪预览，不提交、不再分发）。
节拍：取 27.09 s 起的一段（前 8.4 s 轻、8.4–28.9 s 十六分音符的高潮、之后收尾），节拍间隔 0.4665 s（约 128.6 bpm），
所有切点都落在拍上（B = 一拍）。剪辑手法：
  淡入淡出（片头 / 片尾）、叠化（前奏的三个镜头、结尾）、交叉剪辑（蜂巢 ↔ 蚊群盖住 David）、跳剪（滑块盒连续几步）、
  匹配剪辑（花：捕蝇草开花 → 钟罩长花 → 玫瑰 → 神龛；花瓶：陶轮 → 神龛）、J/L 剪（游戏音效比画面早进 / 晚出）。

用法：
  python dev/plague3/make_plague3_preview.py --bgm <bgm.wav> [--demo dev/plague3/media/demo/plague3-demo.mp4] [--out ...]
素材时间点（CLIPS 里的 src）是演示录像里的秒数，重录演示后要重新对一遍（用 contact sheet 看）。
"""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREVIEW = ROOT / 'dev' / 'plague3' / 'media' / 'preview'
U = 0.4665                 # 一拍（秒）
BGM_START = 27.09          # BGM 里取的起点（一个音头）
TOTAL_BEATS = 76
W, H, FPS = 1280, 720, 30

# (名字, 演示录像里的起始秒, 占几拍, 进入方式：None = 硬切，数字 = 叠化秒数)
CLIPS = [
    # ---- 前奏（轻）：淡入 + 叠化
    ('标题', 25.2, 8, 'fade1.4'),
    ('左石上的苍蝇拍', 38.4, 4, 0.9),
    ('Margaret 拍脸', 86.6, 6, 0.9),
    # ---- 高潮 B18–B26：交叉剪辑（蜂巢的蜜蜂 ↔ 蚊群盖住 David），每拍一切
    ('蜜蜂 1', 152.0, 1, None), ('蚊群 1', 539.6, 1, None),
    ('蜜蜂 2', 156.0, 1, None), ('蚊群 2', 541.4, 1, None),
    ('蜜蜂 3', 160.0, 1, None), ('蚊群 3', 543.4, 1, None),
    ('蜜蜂 4', 164.0, 1, None), ('黑团', 546.0, 1, None),
    # ---- B26–B34：跳剪（滑块盒连走几步，每段 2 拍）
    ('滑块 1', 374.0, 2, None), ('滑块 2', 381.0, 2, None), ('滑块 3', 389.5, 2, None), ('滑块 4', 398.5, 2, None),
    # ---- B34–B42：匹配剪辑（花）
    ('捕蝇草开花', 439.8, 2, None), ('钟罩长花', 617.6, 2, 0.2), ('钟罩长玫瑰', 637.4, 2, 0.2), ('神龛的花', 684.0, 2, 0.2),
    # ---- B42–B50：匹配剪辑（花瓶）+ 幼虫
    ('陶轮 1', 289.4, 2, None), ('陶轮 2', 303.6, 2, 0.2), ('神龛的花瓶', 678.5, 2, 0.2), ('幼虫现身', 551.2, 2, None),
    # ---- B50–B58：回忆（J/L 剪）
    ('画像的眼睛', 695.8, 2, None), ('一家人', 703.9, 4, 0.5), ('黑方块', 713.2, 2, None),
    # ---- B58–B66：神殿
    ('吊架', 751.6, 2, None), ('圣水盆', 754.6, 2, None), ('画作发光', 756.6, 4, 0.5),
    # ---- 收尾：女人从画里消失，慢慢淡出，黑底上出现片尾字幕
    ('画作：女人消失', 758.6, 6, 0.4),
]
CLIPS_END = 72            # 镜头占到第 72 拍，之后是黑底 + 字幕
# 白闪（高潮开始、圣水盆的光）：拍号、时长
FLASHES = [(18, 0.30), (60, 0.35)]
# 游戏声音的 J/L 剪片段：(演示录像里的起点, 时长, 放在成片里的拍号偏移（拍，可为负）, 音量)；让音效比画面早进或晚出
GAME_AUDIO = [
    (703.2, 1.6, 52 - 1.3, 0.9),      # J 剪：回忆的声音在一家人出现前先响
    (439.9, 1.0, 34, 0.9),            # 捕蝇草开花的声音，对在匹配剪辑的第一个镜头上
    (754.7, 1.8, 60, 0.9),            # 圣水盆的圣光
    (760.0, 3.2, 67.5, 0.8),          # L 剪：女人消失的声音拖过画面的淡出，一直响到片尾字幕
]


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit('ffmpeg 失败：\n' + ' '.join(map(str, cmd))[:600] + '\n' + r.stderr[-1800:])


def make_title_card(path):
    """片尾字幕：透明底 PNG（只有字）。"""
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    big = ImageFont.truetype('C:/Windows/Fonts/msyhl.ttc', 54)
    mid = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 24)
    small = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 17)
    def centered(text, font, y, fill):
        w = d.textlength(text, font=font)
        d.text(((W - w) / 2, y), text, font=font, fill=fill)
    centered('第三灾 · 蚊灾和虱灾', big, 262, (244, 240, 228, 255))
    centered('Plague III — Gnats & Lice', mid, 342, (214, 208, 192, 255))
    centered('《Rusty Lake Paradise》同人重制 · 非官方', small, 640, (190, 186, 174, 255))
    img.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bgm', default=str(PREVIEW / 'bgm' / 'bgm.wav'))
    ap.add_argument('--demo', default=str(ROOT / 'dev' / 'plague3' / 'media' / 'demo' / 'plague3-demo.mp4'))
    ap.add_argument('--out', default=str(PREVIEW / 'plague3-preview.mp4'))
    a = ap.parse_args()
    total = TOTAL_BEATS * U
    work = PREVIEW / 'work'
    work.mkdir(parents=True, exist_ok=True)
    card = work / 'card.png'
    make_title_card(card)

    # ---------- 时间线：每个镜头的起拍、叠化参数
    items, beat = [], 0
    for i, (name, src, beats, tr) in enumerate(CLIPS):
        fade = 0.0
        if isinstance(tr, str) and tr.startswith('fade'):
            fade = float(tr[4:])
        elif isinstance(tr, float):
            fade = tr
        items.append({'name': name, 'src': src, 'start': beat * U, 'slot': beats * U, 'fade': fade, 'first': isinstance(tr, str)})
        beat += beats
    if beat != CLIPS_END:
        sys.exit(f'镜头共 {beat} 拍，应为 {CLIPS_END}')
    # 每个镜头：叠化时往前多放 fade/2（先开始淡入），往后多放下一个镜头 fade/2（等它叠完）
    inputs, chains, last = [], [], 'base'
    base = f'color=c=black:s={W}x{H}:r={FPS}:d={total:.3f}[base]'
    for k, it in enumerate(items):
        pre = it['fade'] / 2 if not it['first'] else 0.0
        post = items[k + 1]['fade'] / 2 if k + 1 < len(items) else 0.0
        t_in = it['start'] - pre
        dur = it['slot'] + pre + post + 0.05
        src_start = it['src'] - pre
        inputs += ['-ss', f'{src_start:.3f}', '-t', f'{dur:.3f}', '-i', a.demo]
        f = f'[{k}:v]setpts=PTS-STARTPTS,fps={FPS},scale={W}:{H},format=yuva420p'
        if it['fade'] > 0:
            f += f',fade=t=in:st=0:d={it["fade"]:.3f}:alpha=1'
        if k == len(items) - 1:                           # 最后一个镜头在占完自己的拍之前淡出到黑
            f += f',fade=t=out:st={pre + it["slot"] - 1.0:.3f}:d=1.0:alpha=1'
        f += f',setpts=PTS+{t_in:.4f}/TB[c{k}]'
        chains.append(f)
    n = len(items)
    # 白闪
    for j, (b, d) in enumerate(FLASHES):
        chains.append(f'color=c=white:s={W}x{H}:r={FPS}:d={d:.3f},format=yuva420p,fade=t=out:st=0:d={d:.3f}:alpha=1,setpts=PTS+{b * U:.4f}/TB[flash{j}]')
    # 叠层
    cur = 'base'
    for k, it in enumerate(items):
        t0 = max(0.0, it['start'] - (it['fade'] / 2 if not it['first'] else 0.0))
        chains.append(f'[{cur}][c{k}]overlay=eof_action=pass:enable=\'gte(t,{t0:.4f})\'[v{k}]')
        cur = f'v{k}'
    for j, (b, d) in enumerate(FLASHES):
        chains.append(f'[{cur}][flash{j}]overlay=eof_action=pass[fl{j}]')
        cur = f'fl{j}'
    # 片尾字幕
    card_idx = n
    inputs += ['-loop', '1', '-t', f'{total:.3f}', '-i', str(card)]
    t_card = 69 * U
    chains.append(f'[{card_idx}:v]format=yuva420p,fade=t=in:st={t_card:.3f}:d=0.8:alpha=1,fade=t=out:st={total - 1.9:.3f}:d=0.8:alpha=1[card]')
    chains.append(f'[{cur}][card]overlay=eof_action=pass[vc]')
    chains.append(f'[vc]fade=t=out:st={total - 1.4:.3f}:d=1.4,format=yuv420p[vout]')

    # ---------- 声音：BGM + 游戏音效（J/L 剪）
    bgm_idx = card_idx + 1
    inputs += ['-ss', f'{BGM_START - 0.02:.3f}', '-t', f'{total + 1:.3f}', '-i', a.bgm]
    achains = [f'[{bgm_idx}:a]atrim=0:{total:.3f},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.06,afade=t=out:st={total - 2.6:.3f}:d=2.6,volume=1.0[bgm]']
    mix = ['[bgm]']
    for g, (gsrc, gdur, gbeat, vol) in enumerate(GAME_AUDIO):
        gi = bgm_idx + 1 + g
        inputs += ['-ss', f'{gsrc:.3f}', '-t', f'{gdur:.3f}', '-i', a.demo]
        at = max(0.0, gbeat * U)
        achains.append(f'[{gi}:a]asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:st=0:d=0.25,afade=t=out:st={gdur - 0.5:.3f}:d=0.5,volume={vol * 0.35:.3f},adelay={int(at * 1000)}|{int(at * 1000)}[g{g}]')
        mix.append(f'[g{g}]')
    achains.append(''.join(mix) + f'amix=inputs={len(mix)}:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[aout]')

    graph = ';'.join([base] + chains + achains)
    graph_file = work / 'graph.txt'
    graph_file.write_text(graph, encoding='utf-8')
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex_script', str(graph_file),
           '-map', '[vout]', '-map', '[aout]', '-t', f'{total:.3f}', '-r', str(FPS),
           '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
           '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', a.out]
    run(cmd)
    print('完成：', a.out, f'（{total:.1f} 秒，{n} 个镜头）')


if __name__ == '__main__':
    main()
