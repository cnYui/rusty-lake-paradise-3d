"""石塔贴图调色：AI 烘出来的贴图偏写实（照片感的棕灰砖、木门、很多细噪点），这里改成锈湖原作的手绘风格——
中值滤波抹掉照片噪点 → 按亮度重映射到一条暖灰石头色带（墨黑窗洞 / 灰砂浆 / 暖灰石面 / 浅色檐线）→ 边缘加一点墨线。
用法：python tower_recolor.py 烘焙图.png 输出.jpg
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
sm = im.filter(ImageFilter.MedianFilter(7)).filter(ImageFilter.GaussianBlur(1.2))
a = np.asarray(sm).astype(np.float32) / 255
lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
lo, hi = np.percentile(lum, 3), np.percentile(lum, 97)
l = np.clip((lum - lo) / (hi - lo), 0, 1)
# 色带：位置 → 颜色（和岛上其他石头 #aaa69e / #77746e / #2b2724 同一套，略偏暖，贴近参考图里的米灰石塔）
stops = [(0.00, '#1b1815'), (0.14, '#2b2724'), (0.36, '#6f6a60'), (0.60, '#a49e8c'), (0.82, '#c3baa2'), (1.00, '#d9d0b6')]
xs = np.array([p for p, _ in stops], np.float32)
cols = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for _, c in stops], np.float32) / 255
out = np.stack([np.interp(l, xs, cols[:, k]) for k in range(3)], -1)
# 手绘墨线：亮度梯度大的地方（砖缝、窗框、檐口）压暗一点
gy, gx = np.gradient(np.asarray(sm.convert('L')).astype(np.float32) / 255)
edge = np.clip(np.hypot(gx, gy) * 14, 0, 1)
out = out * (1 - 0.38 * edge[..., None])
Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(dst, quality=88, optimize=True)
print('saved', dst)
