# 山羊：按游戏里山羊的关节名绑骨骼（body / tail / 四条腿 / neck / head / jaw / tongue / 两只耳朵），导出 goat.rlpm。
# 用法：blender -b -P goat_export.py -- 低模目录 输出目录
import bpy, sys, os, math, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rlpm_write as RW

LO, OUT = sys.argv[sys.argv.index('--') + 1], sys.argv[sys.argv.index('--') + 2]
S = 1.25          # 缩放：肩高 ≈ 0.85 m，鼻尖到尾巴 ≈ 1.1 m（ANIMALS.goat：长 1.1、高 0.75）
CZ = -0.05        # 桶身中心（源坐标 x），放到游戏原点

bpy.ops.wm.open_mainfile(filepath=os.path.join(LO, 'cartoon_goat_lo.blend'))
ob = bpy.data.objects['cartoon_goat']

def G(xb, zb, lat=0.0):          # 源地标（x 向前、z 向上、侧向）→ 游戏坐标（x 侧向、y 上、z 前），已缩放
    return [lat * S, zb * S, (xb - CZ) * S]

def to_game(a, direction=False):
    out = np.stack([a[:, 1], a[:, 2], a[:, 0] - (0 if direction else CZ)], 1)
    return out if direction else out * S

# 关节：名字、父、绑定世界位置、绕 X 的世界转角（俯仰）、权重用的骨骼线段、左右
LW = 0.085
J = []
def add(name, parent, p, ex=0.0, segs=None, side=None, **kw):
    J.append(dict(name=name, parent=parent, p=p, ex=ex, segs=segs or [(p, p)], side=side, **kw))

hoofF, hoofB = G(0.07, 0.02), G(-0.375, 0.02)
add('body', None, G(CZ, 0.0), 0.0, segs=[(G(-0.20, 0.52), G(0.12, 0.54)), (G(-0.12, 0.40), G(0.05, 0.40))])
add('tail', 'body', G(-0.28, 0.58), 0.0, segs=[(G(-0.28, 0.58), G(-0.41, 0.52))])
for side, sg in (('L', 1), ('R', -1)):
    add('legF' + side, 'body', G(0.07, 0.45, sg * LW), 0.0, segs=[(G(0.07, 0.45, sg * LW), G(0.075, 0.20, sg * LW))], side=side)
    add('kneeF' + side, 'legF' + side, G(0.075, 0.20, sg * LW), 0.0, segs=[(G(0.075, 0.20, sg * LW), G(0.07, 0.02, sg * LW))], side=side)
    add('legB' + side, 'body', G(-0.22, 0.46, sg * 0.09), math.atan2(0.09, 0.25), segs=[(G(-0.22, 0.46, sg * 0.09), G(-0.31, 0.21, sg * 0.09))], side=side)
    add('kneeB' + side, 'legB' + side, G(-0.31, 0.21, sg * 0.09), math.atan2(0.065, 0.19), segs=[(G(-0.31, 0.21, sg * 0.09), G(-0.375, 0.02, sg * 0.09))], side=side)
neck_p, head_p = G(0.12, 0.58), G(0.33, 0.77)
th_n = math.atan2(head_p[2] - neck_p[2], head_p[1] - neck_p[1])
add('neck', 'body', neck_p, th_n, segs=[(neck_p, G(0.26, 0.70)), (G(0.18, 0.62), G(0.24, 0.68))])
th_h = 0.70
add('head', 'neck', head_p, th_h, segs=[(G(0.30, 0.74), G(0.44, 0.67)), (G(0.36, 0.83), G(0.10, 0.94)), (G(0.31, 0.78), G(0.36, 0.78))])
add('jaw', 'head', G(0.31, 0.715), th_h, segs=[(G(0.34, 0.675), G(0.445, 0.625)), (G(0.41, 0.62), G(0.40, 0.53))])
add('tongue', 'jaw', G(0.445, 0.655), th_h, segs=[(G(0.445, 0.655), G(0.45, 0.65))])
for side, sg in (('L', 1), ('R', -1)):
    add('ear' + side, 'head', G(0.37, 0.79, sg * 0.07), th_h, segs=[(G(0.37, 0.79, sg * 0.07), G(0.46, 0.81, sg * 0.16))], side=side)
names = [j['name'] for j in J]
byname = {j['name']: j for j in J}

# ---- 本地偏移（休息姿势：所有关节旋转为 0，层级里的平移）= 父关节绑定旋转的逆 × (子位置 - 父位置)
def rotx(a, v):      # 绕 X 转 a
    c, s = math.cos(a), math.sin(a)
    return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]
for j in J:
    if j['parent'] is None: j['offset'] = list(j['p'])
    else:
        par = byname[j['parent']]
        d = [j['p'][i] - par['p'][i] for i in range(3)]
        j['offset'] = rotx(-par['ex'], d)

# ---- 权重
me, co = RW.mesh_arrays(ob)
gco = to_game(co)
W, I = RW.analytic_weights(gco, [dict(name=j['name'], segs=j['segs'], side=j['side']) for j in J], 0.98 * S)

# ---- 头顶（成就 / 水蛭飞出的锚点）：头关节局部坐标
top = rotx(-th_h, [G(0.33, 0.93)[i] - head_p[i] for i in range(3)])
hdr = dict(kind='animal', joints=names, parents=[j['parent'] for j in J], offsets={j['name']: [round(v, 5) for v in j['offset']] for j in J},
           bind={j['name']: dict(p=[round(v, 5) for v in j['p']], e=[round(j['ex'], 5), 0, 0]) for j in J},
           headTop=[round(v, 5) for v in top], tongueAt=None)
nv, nt, pos = RW.write_rlpm(os.path.join(OUT, 'goat.rlpm'), ob, to_game, W, I, hdr, 'goat', 1.0)
print('LOG goat verts', nv, 'tris', nt, 'bounds', pos.min(0).round(3), pos.max(0).round(3))
print('LOG RESULT goat', os.path.getsize(os.path.join(OUT, 'goat.rlpm')))
