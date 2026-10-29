"""把现实尺寸表画成一张按真实比例的立面对照图（人物、桌椅、道具并排站着，纵轴 = 米）。

用法（项目根目录）：
  python dev/plague4/measure_scale.py          # 先量一次，生成 dev/plague4/media/scale_report.json
  python dev/common/make_scale_chart.py        # 输出 docs/art_scale_chart.png
数据：人物身高等来自 src/art/scale.js（用 node 读出），布景模型的实测尺寸来自 scale_report.json。
"""
import json
import subprocess
import sys
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle

ROOT = Path(__file__).resolve().parents[2]
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'DengXian']
plt.rcParams['axes.unicode_minus'] = False


def load_scale():
    code = "import('./src/art/scale.js').then(m=>console.log(JSON.stringify({HUMAN:m.HUMAN,SEATED_RATIO:m.SEATED_RATIO,FURNITURE:m.FURNITURE})))"
    out = subprocess.run(['node', '-e', code], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def measured():
    path = ROOT / 'dev' / 'plague4' / 'media' / 'scale_report.json'
    if not path.exists():
        sys.exit('先运行 python dev/plague4/measure_scale.py 生成 scale_report.json')
    return {r['id']: r for r in json.loads(path.read_text(encoding='utf-8'))['rows']}


def person(ax, x, h, label, color='#4b6a88', seated_on=None):
    """站着的人：头 + 身体矩形（比例示意），身高 h 为头顶。"""
    head = 0.115 * h / 1.75
    ax.add_patch(Rectangle((x - 0.2, 0), 0.4, h - 2 * head, fc=color, ec='k', lw=0.8, alpha=0.85))
    ax.add_patch(Circle((x, h - head), head, fc=color, ec='k', lw=0.8, alpha=0.95))
    ax.text(x, h + 0.05, f'{label}\n{h:.2f}', ha='center', va='bottom', fontsize=8)


def box(ax, x, w, h, label, y0=0.0, color='#c9a96e', note=None):
    ax.add_patch(Rectangle((x - w / 2, y0), w, h, fc=color, ec='k', lw=0.8, alpha=0.85))
    if label or note:
        ax.text(x, y0 + h + 0.04, f'{label}\n{note}' if label else note, ha='center', va='bottom', fontsize=7.5)


def setup(ax, title=None, top=2.6):
    ax.set_xlim(-0.3, 13.6); ax.set_ylim(-0.3, top); ax.set_aspect('equal')
    ax.axhline(0, color='k', lw=1.2)
    for y in [0.5, 1.0, 1.5, 2.0, 2.5]:
        ax.axhline(y, color='#999', lw=0.5, ls=':'); ax.text(-0.28, y + 0.015, f'{y:.1f} m', fontsize=8, color='#666')
    ax.set_xticks([]); ax.set_yticks([])
    for sp in ['top', 'right', 'bottom', 'left']:
        ax.spines[sp].set_visible(False)
    if title:
        ax.set_title(title, fontsize=11, loc='left')


def main():
    scale, rows = load_scale(), measured()
    human = scale['HUMAN']
    fig, (ax, bx) = plt.subplots(2, 1, figsize=(17, 9.2), dpi=100, gridspec_kw={'height_ratios': [2.9, 3.4]})
    setup(ax, '人物（站姿身高，头骨顶）+ 门 + 高背椅 / 圆桌（1 格 = 真实米数，横纵同比例）')
    setup(bx, '家具与道具（第四灾实测包围盒）', top=3.1)

    x = 0.6
    for key, label, col in [('elizabeth', '少年 Jakob', '#7aa17a'), ('ida', 'Ida', '#a67a9a'), ('margaret', 'Margaret', '#a67a9a'), ('caroline', 'Caroline', '#a67a9a'),
                            ('jakob', 'Jakob', '#4b6a88'), ('david', 'David', '#4b6a88'), ('gerard', 'Gerard', '#4b6a88'), ('nicholas', 'Nicholas', '#4b6a88')]:
        person(ax, x, human[key], label, col); x += 0.95

    box(ax, 8.6, 0.9, 2.0, '门（参照）', color='#e0d8c8', note='0.9×2.0')
    chair = rows['chair']
    box(ax, 10.0, chair['w'], chair['h'], '', color='#a87c4e', note='')
    ax.text(10.0, -0.04, f"高背椅 {chair['w']:.2f}×{chair['h']:.2f}", fontsize=7.5, ha='center', va='top')
    ax.plot([9.7, 10.3], [0.49, 0.49], color='r', lw=1); ax.text(10.35, 0.44, '椅面 0.49', fontsize=7, color='r', va='top')
    seated = 0.49 + human['nicholas'] * scale['SEATED_RATIO']
    ax.add_patch(Rectangle((9.8, 0.49), 0.4, seated - 0.49 - 0.2, fc='#4b6a88', ec='k', lw=0.8, alpha=0.85))
    ax.add_patch(Circle((10.0, seated - 0.11), 0.11, fc='#4b6a88', ec='k', lw=0.8))
    ax.text(10.45, seated - 0.05, f'Nicholas 坐着，头顶 {seated:.2f}\n（1.88 × 0.52 + 0.49）', fontsize=7.5, va='center')
    t = rows['table']
    box(ax, 12.1, t['w'], t['h'], '', color='#e8e4d8', note='')
    ax.text(12.1, -0.04, f"圆桌 Ø{t['w']:.2f}×{t['h']:.2f}", fontsize=7.5, ha='center', va='top')
    box(ax, 11.85, 0.34, 0.09, '', y0=t['h'], color='#9a4a2a', note='')
    box(ax, 12.45, 0.15, 0.15, '', y0=t['h'], color='#222', note='')
    ax.text(12.1, t['h'] + 0.2, '书(合) 0.36×0.09\n黑方块 0.15', fontsize=7, ha='center')

    items = [
        ('木凳', rows['memoryStool']['w'], rows['memoryStool']['h'], 0.0, '#a87c4e'),
        ('木箱', rows['chest']['w'], rows['chest']['h'], 0.0, '#8f7452'),
        ('铁锅(口径)', 1.04, rows['cauldron']['h'], 0.0, '#80776e'),
        ('蜡烛+碟', rows['candle']['w'], rows['candle']['h'], 0.0, '#e8dfba'),
        ('胡萝卜', rows['carrot']['w'], rows['carrot']['h'], 0.0, '#d68a3c'),
        ('兔(含耳)', rows['rabbit']['d'], rows['rabbit']['h'], 0.0, '#ece8dc'),
        ('小滨鹬', rows['bird']['d'], rows['bird']['h'], 0.0, '#a69b84'),
        ('地洞(蜷一个人)', rows['pit']['w'], 0.12, 0.0, '#6f5f43'),
        ('捕鸟石板', rows['trap']['w'], 0.06, 0.0, '#9aa09c'),
        ('盖坑木板', rows['branch0']['d'], 0.04, 0.0, '#a08c6c'),
        ('拱窗', rows['window']['w'], rows['window']['h'], 1.11, '#b8bcae'),
    ]
    x = 0.8
    for label, w, h, y0, col in items:
        x += w / 2 + 0.1 if label not in ('拱窗',) else 0
        if label == '拱窗':
            x = 12.4
        box(bx, x, w, h, label, y0=y0, color=col, note=f'{w:.2f}×{h:.2f}' + (' 窗台1.11' if y0 else ''))
        x += w / 2 + 0.55
    fig.suptitle('第四灾模型的真实比例对照（docs/art_scale.md；python dev/common/make_scale_chart.py 重画）', fontsize=13)
    out = ROOT / 'docs' / 'art_scale_chart.png'
    fig.tight_layout(rect=(0, 0, 1, 0.96)); fig.savefig(out); print('saved', out)


if __name__ == '__main__':
    main()
