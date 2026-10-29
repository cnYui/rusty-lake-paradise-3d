# 苍蝇人：13 个关节（pelvis / torso / head / 双臂 + 前臂 / 双腿 + 小腿 / 双翅），导出 fly.rlpm。
# 绑定姿势 = 模型本来的 T 字手臂 + 八字腿；休息姿势（全部转角为 0）手臂和腿竖直向下，和人物一致。
# 用法：blender -b -P fly_export.py -- 低模目录 输出目录
import bpy, sys, os, math
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rlpm_write as RW

LO, OUT = sys.argv[sys.argv.index('--') + 1], sys.argv[sys.argv.index('--') + 2]
NAME = 'anthropomorphic_fly'
bpy.ops.wm.open_mainfile(filepath=os.path.join(LO, NAME + '_lo.blend'))
ob = bpy.data.objects[NAME]
me, co = RW.mesh_arrays(ob)
T = float(co[:, 2].max())              # 低模总高（含翅膀尖 / 触角）
H = 1.9                                # 头骨顶高度（成年人 1.85–1.9，含翅膀约 2.7）
TOP = 0.725
# 腿是八字摆的：先按真实腿长摆直再量身高（头骨顶 = H），并拢后身体会抬高 delta0
HIP, KNEE, ANK = (0.07, 0.43), (0.235, 0.245), (0.40, 0.06)
_leg = (math.hypot(KNEE[0] - HIP[0], KNEE[1] - HIP[1]) + math.hypot(ANK[0] - KNEE[0], ANK[1] - KNEE[1])) * T
DELTA0 = _leg - (HIP[1] - ANK[1]) * T
S = H / (TOP * T + DELTA0)

def F(xf, yf, z=0.0):                  # 比例 → 游戏坐标（已缩放）：x 侧向（左 +）、y 上、z 前
    return [xf * T * S, yf * T * S, z * S]

def to_game(a, direction=False):
    out = np.stack([a[:, 0], a[:, 2], -a[:, 1]], 1)
    return out if direction else out * S

def ang(a, b): return math.atan2(b[0] - a[0], -(b[1] - a[1]))

J = []
def add(name, parent, p, ez=0.0, segs=None, side=None):
    J.append(dict(name=name, parent=parent, p=p, ez=ez, segs=segs or [(p, p)], side=side))

add('pelvis', None, F(0, 0.43), segs=[(F(0, 0.34), F(0, 0.47))])
add('torso', 'pelvis', F(0, 0.50), segs=[(F(0, 0.48), F(0, 0.60))])
add('head', 'torso', F(0, 0.675), segs=[(F(0, 0.63), F(0, 0.72)), (F(0, 0.64, 0.10), F(0, 0.43, 0.16)), (F(0.04, 0.72), F(0.10, 0.78, 0.06)), (F(-0.04, 0.72), F(-0.10, 0.78, 0.06))])
for side, sg in (('L', 1), ('R', -1)):
    sh, el, tip = (sg * 0.13, 0.575), (sg * 0.33, 0.575), (sg * 0.64, 0.565)
    th1 = ang((abs(sh[0]), sh[1]), (abs(el[0]), el[1])); th2 = ang((abs(el[0]), el[1]), (abs(tip[0]), tip[1]))
    add('arm' + side, 'torso', F(*sh), sg * th1, segs=[(F(*sh), F(*el))], side=side)
    add('fore' + side, 'arm' + side, F(*el), sg * th2, segs=[(F(*el), F(*tip))], side=side)
    hip, kn, an = (sg * 0.07, 0.43), (sg * 0.235, 0.245), (sg * 0.40, 0.06)
    th3 = ang((abs(hip[0]), hip[1]), (abs(kn[0]), kn[1])); th4 = ang((abs(kn[0]), kn[1]), (abs(an[0]), an[1]))
    add('hip' + side, 'pelvis', F(*hip), sg * th3, segs=[(F(*hip), F(*kn))], side=side)
    add('knee' + side, 'hip' + side, F(*kn), sg * th4, segs=[(F(*kn), F(*an)), (F(*an), F(an[0], 0.035, 0.09))], side=side)
    add('wing' + side, 'torso', F(sg * 0.10, 0.60), 0.0, segs=[(F(sg * 0.10, 0.60), F(sg * 0.33, 0.78)), (F(sg * 0.33, 0.78), F(sg * 0.63, 0.97))], side=side)
names = [j['name'] for j in J]; byname = {j['name']: j for j in J}

def rotz_inv(a, v):                    # 绕 z 转 -a
    c, s = math.cos(-a), math.sin(-a)
    return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]
for j in J:
    if j['parent'] is None: j['offset'] = [j['p'][0], j['p'][1] + DELTA0 * S, j['p'][2]]   # 休息姿势下腿摆直，骨盆抬高
    else:
        par = byname[j['parent']]
        j['offset'] = rotz_inv(par['ez'], [j['p'][i] - par['p'][i] for i in range(3)])

gco = to_game(co)
W, I = RW.analytic_weights(gco, [dict(name=j['name'], segs=j['segs'], side=j['side']) for j in J], T * S, side_soft=0.04, eps=0.015, power=3)
hdr = dict(kind='animal', joints=names, parents=[j['parent'] for j in J], offsets={j['name']: [round(v, 5) for v in j['offset']] for j in J},
           bind={j['name']: dict(p=[round(v, 5) for v in j['p']], e=[0, 0, round(j['ez'], 5)]) for j in J})
nv, nt, pos = RW.write_rlpm(os.path.join(OUT, 'fly.rlpm'), ob, to_game, W, I, hdr, 'fly', H)
print('LOG fly delta0', round(DELTA0 * S, 3), 'verts', nv, 'tris', nt, 'scale', round(S, 3), 'bounds', pos.min(0).round(2), pos.max(0).round(2))
print('LOG RESULT fly', os.path.getsize(os.path.join(OUT, 'fly.rlpm')))
