# 石塔：静态网格（不带骨骼），按参考图放大到 38 m 高（要高出岛上约 25 m 的森林），底面中心放在原点、底面 y = 0，导出 tower.rlpm。
import bpy, sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rlpm_write as RW
LO, OUT = sys.argv[sys.argv.index('--') + 1], sys.argv[sys.argv.index('--') + 2]
HEIGHT = 38.0
bpy.ops.wm.open_mainfile(filepath=os.path.join(LO, 'stone_tower_lo.blend'))
ob = bpy.data.objects['stone_tower']
me, co = RW.mesh_arrays(ob)
S = HEIGHT / float(co[:, 2].max() - co[:, 2].min())
cx = float(co[:, 0].min() + co[:, 0].max()) / 2; cy = float(co[:, 1].min() + co[:, 1].max()) / 2; z0 = float(co[:, 2].min())
def to_game(a, direction=False):
    out = np.stack([a[:, 0], a[:, 2], -a[:, 1]], 1)
    if direction: return out
    return (out - np.array([cx, z0, -cy], np.float32)) * S
nv, nt, pos = RW.write_rlpm(os.path.join(OUT, 'tower.rlpm'), ob, to_game, None, None, dict(kind='static', joints=[]), 'tower', HEIGHT)
print('LOG tower verts', nv, 'tris', nt, 'scale', round(S, 2), 'bounds', pos.min(0).round(2), pos.max(0).round(2))
print('LOG RESULT tower', os.path.getsize(os.path.join(OUT, 'tower.rlpm')))
