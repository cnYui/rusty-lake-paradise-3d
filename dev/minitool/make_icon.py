"""生成小红书小工具图标 icon.png（512×512）：上面是记忆场景截图，下面是标题。

2026-10-12：审核疑似“有血”，副标题里的“血灾”改成“x灾”，场景截图换成紫色版。
用法：
  python dev/common/shot.py "index.html?autotest=1" dev/minitool/media/purple/icon_scene.png \
      --js "document.getElementById('ui').style.display='none'; await RLP.goto('memory'); return 'ok'" --wait 2
  python dev/minitool/make_icon.py [场景截图] [输出图标]
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
scene_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'media', 'purple', 'icon_scene.png')  # 红色对照版：dev/minitool/media/red-x/icon_scene.png
out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'icon.png')

FONT_BOLD = r'C:\Windows\Fonts\msyhbd.ttc'
FONT_REG = r'C:\Windows\Fonts\msyh.ttc'
BG = (20, 24, 26)
TITLE_COLOR = (233, 226, 212)
# 副标题颜色：默认紫色（紫色版）；红色对照版用环境变量 ICON_SUB_COLOR=183,138,122（原来偏红的肉色）
SUB_COLOR = tuple(int(x) for x in os.environ.get('ICON_SUB_COLOR', '178,142,222').split(','))
TITLE = '锈湖：天堂岛'
SUB = '第一灾 · x灾 · 3D'

S = 512
SCENE_H = 346

img = Image.new('RGB', (S, S), BG)
scene = Image.open(scene_path).convert('RGB')
# 游戏画面 1280×720 里，舞台（带圆角暗角的 4:3 画面）在 x 108..1172
stage = scene.crop((108, 0, 1172, 720)).resize((S, SCENE_H), Image.LANCZOS)
img.paste(stage, (0, 0))

# 场景底部 40 行渐变融进面板底色
px = img.load()
for y in range(SCENE_H - 40, SCENE_H + 1):
    k = (y - (SCENE_H - 40)) / 40.0
    for x in range(S):
        r, g, b = px[x, y]
        px[x, y] = (round(r * (1 - k) + BG[0] * k), round(g * (1 - k) + BG[1] * k), round(b * (1 - k) + BG[2] * k))

d = ImageDraw.Draw(img)


def centered(text, font, y_center, color):
    l, t, r, b = d.textbbox((0, 0), text, font=font)
    x = (S - (r - l)) / 2 - l
    y = y_center - (t + b) / 2
    d.text((x, y), text, font=font, fill=color)


centered(TITLE, ImageFont.truetype(FONT_BOLD, 62), 391, TITLE_COLOR)
centered(SUB, ImageFont.truetype(FONT_REG, 27), 446, SUB_COLOR)
img.save(out_path)
print('saved', out_path)
