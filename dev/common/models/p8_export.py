# 第八灾：门外三个弹曼陀林的乐手 + 雾里的巨型螳螂（2026-11-05 用户给的 Tripo 模型）。
# 乐手模型自己抱着琴，是一整块站姿网格：只绑 body（脚底）/ torso（腰，左右晃）/ head（脖子）/ strum（拨弦那只手的肘）四个关节；
# 螳螂绑 body（胸）/ 四条步足（股节根部）/ upper（前胸根部：前胸 + 头 + 捕捉足，出击时整个往前下方扑）/ head / fore（一对捕捉足）。
# 权重都是“到骨骼线段的距离反比”（rlpm_write.analytic_weights），地标是低模上量的（单位：模型总高 T 的比例；Blender 坐标 x 横、y 深、z 上）。
# 用法：python p8_export.py -- 低模目录 输出目录 [名字...]（名字：cartoon_musician mandolin mandolin_playing_man praying_mantis）
import bpy, sys, os, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rlpm_write as RW

ARGS = sys.argv[sys.argv.index('--') + 1:]
LO, OUT = ARGS[0], ARGS[1]
ONLY = set(ARGS[2:])

# ---- 乐手：人面朝 -y（游戏里朝 +z），头骨顶 = 身高（帽子在头骨顶之上）
# hip / waist / neck / skull：高度；strum：拨弦手的 [肩, 肘, 手]；fret：按弦手 [肩, 肘, 手]；lute：琴身中心、琴头
MUSICIANS = {
    'cartoon_musician': dict(key='musician_fat', H=1.84, skull=0.92, hip=0.27, waist=0.33, neck=0.73, legX=0.09,
                             strum=[[-0.17, 0.0, 0.68], [-0.27, 0.03, 0.47], [-0.10, -0.12, 0.58]],
                             fret=[[0.17, 0.0, 0.68], [0.20, 0.0, 0.47], [0.11, -0.12, 0.68]],
                             lute=[[-0.03, -0.13, 0.57], [0.24, -0.10, 0.77]]),
    'mandolin': dict(key='musician_feather', H=1.78, skull=0.92, hip=0.40, waist=0.46, neck=0.71, legX=0.06,
                     strum=[[-0.12, 0.0, 0.66], [-0.21, 0.02, 0.50], [-0.05, -0.12, 0.57]],
                     fret=[[0.12, 0.0, 0.66], [0.15, 0.0, 0.50], [0.10, -0.10, 0.70]],
                     lute=[[-0.02, -0.08, 0.62], [0.20, -0.06, 0.78]]),
    'mandolin_playing_man': dict(key='musician_old', H=1.88, skull=0.99, hip=0.33, waist=0.38, neck=0.78, legX=0.06,
                                 strum=[[0.13, 0.0, 0.72], [0.21, 0.0, 0.50], [0.05, -0.10, 0.64]],
                                 fret=[[-0.12, 0.0, 0.72], [-0.12, 0.0, 0.52], [-0.12, -0.08, 0.73]],
                                 lute=[[0.00, -0.09, 0.63], [-0.20, -0.06, 0.79]]),
}


def export_musician(name, c):
    bpy.ops.wm.open_mainfile(filepath=os.path.join(LO, name + '_lo.blend'))
    ob = bpy.data.objects[name]
    me, co = RW.mesh_arrays(ob)
    T = float(co[:, 2].max())
    feet = co[co[:, 2] < 0.05 * T]
    cx, cy = float(feet[:, 0].mean()), float(feet[:, 1].mean())     # 两脚中间放到原点
    S = c['H'] / (c['skull'] * T)

    def G(p):        # T 比例的地标 → 游戏坐标
        return [(p[0] * T - cx) * S, p[2] * T * S, -(p[1] * T - cy) * S]

    def to_game(a, direction=False):
        if direction: return np.stack([a[:, 0], a[:, 2], -a[:, 1]], 1)
        return np.stack([(a[:, 0] - cx) * S, a[:, 2] * S, -(a[:, 1] - cy) * S], 1)

    st, fr, lu = c['strum'], c['fret'], c['lute']
    hip, waist, neck, lx = c['hip'], c['waist'], c['neck'], c['legX']
    top = 1.0
    J = [
        dict(name='body', parent=None, p=G([0, 0, 0]),
             segs=[(G([-lx, 0, 0.0]), G([-lx, 0, hip])), (G([lx, 0, 0.0]), G([lx, 0, hip])), (G([-lx, 0, hip]), G([lx, 0, hip]))]),
        dict(name='torso', parent='body', p=G([0, 0, waist]),
             segs=[(G([0, 0, waist]), G([0, 0, neck])), (G(st[0]), G(fr[0])), (G(st[0]), G(st[1])),
                   (G(fr[0]), G(fr[1])), (G(fr[1]), G(fr[2])), (G(lu[0]), G(lu[1]))]),
        dict(name='head', parent='torso', p=G([0, 0, neck]),
             segs=[(G([0, -0.02, neck + 0.03]), G([0, -0.02, top]))]),
        dict(name='strum', parent='torso', p=G(st[1]),
             segs=[(G(st[1]), G(st[2]))]),
    ]
    byname = {j['name']: j for j in J}
    for j in J:
        j['offset'] = list(j['p']) if j['parent'] is None else [j['p'][i] - byname[j['parent']]['p'][i] for i in range(3)]
    gco = to_game(co)
    W, I = RW.analytic_weights(gco, [dict(name=j['name'], segs=j['segs'], side=None) for j in J], c['H'])
    hdr = dict(kind='musician', joints=[j['name'] for j in J], parents=[j['parent'] for j in J],
               offsets={j['name']: [round(v, 5) for v in j['offset']] for j in J},
               bind={j['name']: dict(p=[round(v, 5) for v in j['p']], e=[0, 0, 0]) for j in J},
               headTop=[0, round((top - neck) * T * S, 4), 0], strumHand=[round(v, 4) for v in G(st[2])])
    key = c['key']
    nv, nt, pos = RW.write_rlpm(os.path.join(OUT, key + '.rlpm'), ob, to_game, W, I, hdr, key, c['H'])
    print('LOG', key, 'verts', nv, 'tris', nt, 'scale', round(S, 3), 'bounds', pos.min(0).round(3), pos.max(0).round(3))
    img = bpy.data.images.get(name + '_bake')
    print('LOG RESULT', key, os.path.getsize(os.path.join(OUT, key + '.rlpm')), 'bake', img and img.filepath)


# ---- 螳螂：头朝 -x（游戏里朝 +z），左边是 -y（游戏 +x）。按程序化螳螂的大小放大：头（眼睛）离地约 4.55 m
LEGS = {   # 股节根部、膝、脚尖（T 比例）；A / B 前面一对（中足），C / D 后面一对
    'legFL': [[-0.139, -0.097, 0.563], [-0.322, -0.146, 0.690], [-0.350, -0.163, 0.004]],
    'legFR': [[-0.145, 0.032, 0.572], [-0.227, 0.145, 0.600], [-0.308, 0.205, 0.008]],
    'legBR': [[-0.023, 0.051, 0.543], [0.075, 0.185, 0.612], [0.135, 0.280, 0.003]],
    'legBL': [[-0.003, -0.090, 0.554], [0.207, -0.151, 0.675], [0.361, -0.280, 0.000]],
}
COXA = {'legFL': [-0.107, -0.080, 0.700], 'legFR': [-0.111, 0.005, 0.693], 'legBR': [-0.040, 0.035, 0.590], 'legBL': [-0.030, -0.085, 0.600]}


def export_mantis(name='praying_mantis', key='mantis'):
    bpy.ops.wm.open_mainfile(filepath=os.path.join(LO, name + '_lo.blend'))
    ob = bpy.data.objects[name]
    me, co = RW.mesh_arrays(ob)
    T = float(co[:, 2].max())
    x0, y0 = -0.07, -0.05            # 胸部正下方放到原点（T 比例）
    S = 4.55 / (0.905 * T)

    def G(p):
        return [-(p[1] - y0) * T * S, p[2] * T * S, -(p[0] - x0) * T * S]

    def to_game(a, direction=False):
        if direction: return np.stack([-a[:, 1], a[:, 2], -a[:, 0]], 1)
        return np.stack([-(a[:, 1] - y0 * T) * S, a[:, 2] * S, -(a[:, 0] - x0 * T) * S], 1)

    body_segs = [(G([-0.14, -0.04, 0.57]), G([0.0, -0.04, 0.56])), (G([-0.12, -0.04, 0.60]), G([-0.11, -0.05, 0.69])),
                 (G([-0.09, -0.04, 0.74]), G([0.07, -0.04, 0.61])), (G([-0.10, -0.04, 0.80]), G([0.05, -0.04, 0.65]))]
    body_segs += [(G(LEGS[k][0]), G(COXA[k])) for k in LEGS]
    J = [dict(name='body', parent=None, p=G([-0.07, -0.05, 0.57]), segs=body_segs)]
    for k, (base, knee, foot) in LEGS.items():
        J.append(dict(name=k, parent='body', p=G(base), segs=[(G(base), G(knee)), (G(knee), G(foot))]))
    J.append(dict(name='upper', parent='body', p=G([-0.11, -0.05, 0.69]), segs=[(G([-0.11, -0.05, 0.71]), G([-0.185, -0.065, 0.88]))]))
    J.append(dict(name='head', parent='upper', p=G([-0.195, -0.068, 0.905]),
                  segs=[(G([-0.24, -0.115, 0.915]), G([-0.24, -0.03, 0.915])), (G([-0.20, -0.07, 0.90]), G([-0.25, -0.075, 0.87])),
                        (G([-0.21, -0.07, 0.93]), G([-0.19, -0.06, 1.0]))]))
    fl = [(G([-0.17, -0.095, 0.84]), G([-0.21, -0.10, 0.75])), (G([-0.21, -0.10, 0.75]), G([-0.27, -0.115, 0.85])), (G([-0.27, -0.115, 0.85]), G([-0.28, -0.12, 0.72]))]
    fr = [(G([-0.16, -0.01, 0.84]), G([-0.19, 0.0, 0.75])), (G([-0.19, 0.0, 0.75]), G([-0.23, 0.0, 0.83])), (G([-0.23, 0.0, 0.83]), G([-0.22, 0.0, 0.73]))]
    J.append(dict(name='fore', parent='upper', p=G([-0.165, -0.05, 0.835]), segs=fl + fr))
    byname = {j['name']: j for j in J}
    for j in J:
        j['offset'] = list(j['p']) if j['parent'] is None else [j['p'][i] - byname[j['parent']]['p'][i] for i in range(3)]
    gco = to_game(co)
    H = T * S
    W, I = RW.analytic_weights(gco, [dict(name=j['name'], segs=j['segs'], side=None) for j in J], H, eps=0.01)
    feet = {k: [round(v, 4) for v in G(LEGS[k][2])] for k in LEGS}
    hdr = dict(kind='mantis', joints=[j['name'] for j in J], parents=[j['parent'] for j in J],
               offsets={j['name']: [round(v, 5) for v in j['offset']] for j in J},
               bind={j['name']: dict(p=[round(v, 5) for v in j['p']], e=[0, 0, 0]) for j in J}, feet=feet)
    nv, nt, pos = RW.write_rlpm(os.path.join(OUT, key + '.rlpm'), ob, to_game, W, I, hdr, key, round(H, 3))
    print('LOG', key, 'verts', nv, 'tris', nt, 'scale', round(S, 3), 'H', round(H, 3), 'bounds', pos.min(0).round(3), pos.max(0).round(3))
    print('LOG RESULT', key, os.path.getsize(os.path.join(OUT, key + '.rlpm')))


for name, c in MUSICIANS.items():
    if not ONLY or name in ONLY: export_musician(name, c)
if not ONLY or 'praying_mantis' in ONLY: export_mantis()
