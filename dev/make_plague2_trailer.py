"""第二灾短片：把演示录像按 BGM 的节拍剪成约 40 秒（硬切 + 片头淡入 + 结尾淡出）。

BGM：JLRS日落fm 翻唱的 Family Tune（B 站 BV13t421j7xY），120 bpm、3/4 拍：一小节 1.5 秒，小节线在 0.04 + 1.5·n 秒。
段落：0–12 s 前奏（轻）、12–24 s 中段、24 s 起变响。镜头全部对齐小节线。

用法：
  python dev/make_plague2_trailer.py --bgm <bgm.wav> [--demo dev/shots/plague2/demo/plague2-demo.mp4] [--out ...]
素材时间点（SHOTS 里的 src）是演示录像里的秒数，重录演示后需要重新对一遍（用 contact sheet 看）。
"""
import argparse
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BAR = 1.5                 # 一小节（秒）
PHASE = 0.04              # 第一个小节线

# (说明, 演示录像里的起始秒)；除标题外每个镜头 1 小节，最后的结尾卡 2 秒
TITLE = ('片头：第二灾 / 蛙灾', 23.4, 2 * BAR + PHASE)
SHOTS = [
    ('海滩（操作提示）', 30.0),
    ('走向湖边的睡莲', 34.0),
    ('睡莲：跳青蛙', 72.5),
    ('睡莲：叶子亮起', 99.5),
    ('蛙卵盆', 174.5),
    ('蛙卵配对沉下', 185.0),
    ('青蛙从盆里浮起', 204.5),
    ('厨房里的 Margaret 和大锅', 226.5),
    ('神殿', 266.5),
    ('转盘锁柜子', 272.5),
    ('转盘锁转动', 281.5),
    ('蛙笛', 299.5),
    ('Ida 吹笛', 337.5),
    ('Ida 头顶的青蛙变橙', 341.2),
    ('David 站在石头上', 376.0),
    ('David 吃青蛙', 378.0),
    ('锅里放入青蛙', 424.5),
    ('点火煮汤', 440.0),
    ('Gerard 举起钥匙', 465.8),
    ('碗里的钥匙', 492.5),
    ('回忆：Caroline', 531.5),
    ('神殿吊架', 565.5),
    ('画里的光', 577.5),
]
END = ('结尾卡：第二灾 · 完', 588.5, 2.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bgm', required=True)
    ap.add_argument('--demo', default=str(ROOT / 'dev/shots/plague2/demo/plague2-demo.mp4'))
    ap.add_argument('--out', default=str(ROOT / 'dev/shots/plague2/trailer/plague2-trailer.mp4'))
    a = ap.parse_args()
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    shots = [TITLE] + [(n, s, BAR) for n, s in SHOTS] + [END]
    total = sum(d for _, _, d in shots)
    cut_times, t = [], 0.0
    for n, s, d in shots:
        cut_times.append((round(t, 2), n, s, round(d, 2)))
        t += d
    print(f'共 {len(shots)} 个镜头，总长 {total:.2f} s')
    for ct in cut_times:
        print('  %6.2f s  %-18s src %.1f  (%.2f s)' % (ct[0], ct[1], ct[2], ct[3]))

    cmd = ['ffmpeg', '-y', '-loglevel', 'error']
    for _, s, d in shots:
        cmd += ['-ss', f'{s:.3f}', '-t', f'{d:.3f}', '-i', a.demo]
    cmd += ['-i', a.bgm]
    n = len(shots)
    parts = [f'[{i}:v]setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=lanczos,setsar=1[v{i}]' for i in range(n)]
    concat = ''.join(f'[v{i}]' for i in range(n)) + f'concat=n={n}:v=1:a=0[vc]'
    vfade = f'[vc]fade=t=in:st=0:d=0.7,fade=t=out:st={total - 1.2:.2f}:d=1.2[v]'
    afx = f'[{n}:a]atrim=0:{total:.3f},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.5,afade=t=out:st={total - 2.2:.2f}:d=2.2,loudnorm=I=-16:TP=-1.5:LRA=11[a]'
    cmd += ['-filter_complex', ';'.join(parts + [concat, vfade, afx]), '-map', '[v]', '-map', '[a]',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', f'{total:.3f}', str(out)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit('ffmpeg 失败：' + r.stderr[-2000:])
    print('已输出：', out)


if __name__ == '__main__':
    main()
