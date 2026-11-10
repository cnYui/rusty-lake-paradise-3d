# 牛：静态网格（不带骨骼），按游戏里程序化牛的大小放大（高 ≈ 2.3 m，世界里再 ×1.25），导出 cow.rlpm。
import bpy, sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rlpm_write as RW
LO, OUT = sys.argv[sys.argv.index('--') + 1], sys.argv[sys.argv.index('--') + 2]
bpy.ops.wm.open_mainfile(filepath=os.path.join(LO, 'cow_lo.blend'))
ob = bpy.data.objects['cow']
me, co = RW.mesh_arrays(ob)
S = 2.3 / float(co[:, 2].max()); SHIFT = 0.2
def to_game(a, direction=False):
    out = np.stack([a[:, 0], a[:, 2], -a[:, 1]], 1)
    return out if direction else out * S + np.array([SHIFT, 0, 0], np.float32)
nv, nt, pos = RW.write_rlpm(os.path.join(OUT, 'cow.rlpm'), ob, to_game, None, None, dict(kind='static', joints=[]), 'cow', 2.3)
print('LOG cow verts', nv, 'tris', nt, 'scale', round(S, 3), 'bounds', pos.min(0).round(2), pos.max(0).round(2))
print('LOG RESULT cow', os.path.getsize(os.path.join(OUT, 'cow.rlpm')))
