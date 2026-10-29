# 给低模绑 14 关节骨架（Blender 自动权重），导出游戏用的 .rlpm（自定义二进制：顶点 / UV / 蒙皮权重 / 绑定姿势）。
# 用法：blender -b -P rig_export.py -- 低模目录 输出目录 名字...
import bpy, sys, os, json, math, struct
import numpy as np
from mathutils import Vector

A = sys.argv[sys.argv.index('--') + 1:]
LO, OUT, NAMES = A[0], A[1], A[2:]
os.makedirs(OUT, exist_ok=True)
def log(*a): print('LOG', *a, flush=True)

JOINTS = ['body', 'torso', 'neck', 'head', 'armL', 'elbowL', 'handL', 'armR', 'elbowR', 'handR', 'legL', 'kneeL', 'footL', 'legR', 'kneeR', 'footR']

# 地标：x、y 都是“占低模总高 T 的比例”；H = 表里的身高（头骨顶）。
# top = 头骨顶（帽子不算），chin = 下巴，neck = 颈根，waist = 腰椎，hip = 髋关节，tip = 指尖。
CFG = {
    'cowboy_character': dict(key='david', H=1.78, top=0.93, chin=0.82, neck=0.795, waist=0.56, hip=(0.055, 0.455),
        shoulder=(0.105, 0.755), elbow=(0.24, 0.752), wrist=(0.37, 0.748), tip=(0.45, 0.745), knee=(0.055, 0.235), ankle=(0.055, 0.045)),
    'historical_character': dict(key='gerard', H=1.84, top=0.925, chin=0.80, neck=0.785, waist=0.52, hip=(0.07, 0.36),
        shoulder=(0.15, 0.735), elbow=(0.245, 0.718), wrist=(0.34, 0.705), tip=(0.46, 0.695), knee=(0.07, 0.17), ankle=(0.07, 0.05)),
    'historical_judge_character': dict(key='nicholas', H=1.88, top=0.995, chin=0.855, neck=0.82, waist=0.57, hip=(0.06, 0.47),
        shoulder=(0.10, 0.775), elbow=(0.26, 0.775), wrist=(0.40, 0.772), tip=(0.505, 0.77), knee=(0.06, 0.25), ankle=(0.065, 0.055)),
    'cartoon_man': dict(key='jakob_child', H=1.30, top=0.995, chin=0.825, neck=0.805, waist=0.54, hip=(0.065, 0.46),
        shoulder=(0.115, 0.755), elbow=(0.25, 0.732), wrist=(0.355, 0.714), tip=(0.44, 0.70), knee=(0.165, 0.255), ankle=(0.265, 0.055)),
    'cartoon_grandmother': dict(key='margaret', H=1.56, top=0.995, chin=0.85, neck=0.80, waist=0.54, hip=(0.06, 0.46),
        shoulder=(0.10, 0.765), elbow=(0.28, 0.75), wrist=(0.40, 0.735), tip=(0.49, 0.72), knee=(0.06, 0.26), ankle=(0.33, 0.065), dress=True, foot=(0.14, 0.09)),
    'historical_woman': dict(key='ida', H=1.58, top=0.985, chin=0.82, neck=0.775, waist=0.59, hip=(0.04, 0.50),
        shoulder=(0.10, 0.715), elbow=(0.19, 0.59), wrist=(0.285, 0.44), tip=(0.31, 0.36), knee=(0.04, 0.27), ankle=(0.04, 0.045), dress=True),
    # ---- 动物头人物（模型自带动物头 + 衣服，游戏里不再戴面具）
    'rabbit_character': dict(key='rabbit', H=1.78, top=0.905, chin=0.70, neck=0.69, waist=0.50, hip=(0.05, 0.425),
        shoulder=(0.09, 0.655), elbow=(0.22, 0.652), wrist=(0.315, 0.65), tip=(0.39, 0.648), knee=(0.05, 0.225), ankle=(0.05, 0.065)),
    'boar_man': dict(key='boar', H=1.84, top=0.985, chin=0.745, neck=0.73, waist=0.50, hip=(0.065, 0.41),
        shoulder=(0.12, 0.69), elbow=(0.23, 0.57), wrist=(0.33, 0.46), tip=(0.385, 0.395), knee=(0.065, 0.22), ankle=(0.065, 0.06)),
    'pigeon_humanoid': dict(key='pigeon', H=1.56, top=0.935, chin=0.765, neck=0.725, waist=0.55, hip=(0.06, 0.46),
        shoulder=(0.10, 0.71), elbow=(0.22, 0.83), wrist=(0.33, 0.93), tip=(0.39, 0.98), knee=(0.06, 0.27), ankle=(0.26, 0.05), dress=True, foot=(0.11, 0.08)),
    'deer_humanoid': dict(key='deer', H=1.88, top=0.80, chin=0.545, neck=0.52, waist=0.40, hip=(0.06, 0.365),
        shoulder=(0.09, 0.515), elbow=(0.24, 0.52), wrist=(0.34, 0.525), tip=(0.405, 0.53), knee=(0.175, 0.2125), ankle=(0.29, 0.06), footFollowsLeg=True),
}
_ov = os.path.join(OUT, 'cfg_override.json')
if os.path.exists(_ov):
    for kname, kv in json.load(open(_ov)).items(): CFG[kname].update(kv)

def seg_len(a, b): return math.hypot(a[0] - b[0], a[1] - b[1])
def ang(a, b):    # 左侧：骨骼从 a 指向 b，相对“竖直向下”的转角（绕前向轴，弧度）；朝外为正
    return math.atan2(b[0] - a[0], -(b[1] - a[1]))

for name in NAMES:
    c = CFG[name]; key = c['key']
    bpy.ops.wm.open_mainfile(filepath=os.path.join(LO, name + '_lo.blend'))
    ob = bpy.data.objects[name]; me = ob.data
    bpy.context.view_layer.objects.active = ob
    n = len(me.vertices); co = np.empty(n * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    T = float(co[:, 2].max())            # 低模总高（Blender z）
    f = lambda v: v * T
    pt = lambda t: (f(t[0]), f(t[1]))
    top, chin, neck, waist = f(c['top']), f(c['chin']), f(c['neck']), f(c['waist'])
    hip, sh, el, wr, tip, kn, an = (pt(c[q]) for q in ('hip', 'shoulder', 'elbow', 'wrist', 'tip', 'knee', 'ankle'))
    dress = c.get('dress', False)
    if dress:   # 腿藏在裙子里：腿长按 髋→踝 的真实距离（大字型摆直后的长度）平分；绑定时腿竖直，膝盖放在“摆直后的位置”，这样裙摆下半截不会被拉离地面
        thigh = shin = seg_len(hip, an) / 2
        kn = (hip[0], an[1] + shin)
    else:
        thigh, shin = seg_len(hip, kn), seg_len(kn, an)
    upper, fore = seg_len(sh, el), seg_len(el, wr)
    delta0 = (thigh + shin) - (hip[1] - an[1])               # 腿并拢后身体抬高的量
    H = c['H']
    s = H / (top + delta0)                                    # 缩放：休息姿势下头骨顶 = H
    log(name, key, 'T', round(T, 3), 'scale', round(s, 4), 'delta0', round(delta0, 4), 'H', H)
    ankle_rest = s * an[1]; knee_rest = ankle_rest + s * shin; hip_rest = knee_rest + s * thigh
    ry = s * (top - chin) / 2
    k = dict(head=ry / H, shoulder=(hip_rest + s * (sh[1] - hip[1])) / H, shoulderW=s * sh[0] / H, hip=hip_rest / H, hipW=s * hip[0] / H,
             knee=knee_rest / H, ankle=ankle_rest / H, upper=s * upper / H, fore=s * fore / H, neck=(hip_rest + s * (neck - hip[1])) / H,
             waist=s * (waist - hip[1]) / H)
    P = lambda x, y: [round(x * s, 5), round(y * s, 5), 0.0]
    th_arm, th_el = ang(sh, el), ang(el, wr)
    th_leg, th_kn = (0.0, 0.0) if dress else (ang(hip, kn), ang(kn, an))
    head_c = (top + chin) / 2
    bind = {'body': dict(p=P(0, hip[1]), r=0), 'torso': dict(p=P(0, waist), r=0), 'neck': dict(p=P(0, neck), r=0), 'head': dict(p=P(0, head_c), r=0)}
    for side, sg in (('L', 1), ('R', -1)):
        bind['arm' + side] = dict(p=P(sg * sh[0], sh[1]), r=sg * th_arm)
        bind['elbow' + side] = dict(p=P(sg * el[0], el[1]), r=sg * th_el)
        bind['hand' + side] = dict(p=P(sg * wr[0], wr[1]), r=sg * th_el)
        bind['leg' + side] = dict(p=P(sg * hip[0], hip[1]), r=sg * th_leg)
        bind['knee' + side] = dict(p=P(sg * kn[0], kn[1]), r=sg * th_kn)
        bind['foot' + side] = dict(p=P(sg * an[0], an[1]), r=0)
    # ---- 缩放网格
    ob.scale = (s, s, s); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # ---- 骨架（Blender 坐标：x, -z(深度), y）
    def Bv(p): return Vector((p[0], -p[2], p[1]))
    arm = bpy.data.armatures.new('rig'); ao = bpy.data.objects.new('rig', arm); bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
    def bone(nm, head, tail, parent=None):
        eb = arm.edit_bones.new(nm); eb.head = Bv(head); eb.tail = Bv(tail)
        if (eb.tail - eb.head).length < 0.01: eb.tail = eb.head + Vector((0, 0, 0.02))
        if parent: eb.parent = arm.edit_bones[parent]
    bone('body', bind['body']['p'], bind['torso']['p'])
    bone('torso', bind['torso']['p'], bind['neck']['p'], 'body')
    bone('neck', bind['neck']['p'], P(0, chin - 0.005 * T), 'torso')
    bone('head', P(0, chin), P(0, top), 'neck')
    for side in 'LR':
        sg = 1 if side == 'L' else -1
        bone('arm' + side, bind['arm' + side]['p'], bind['elbow' + side]['p'], 'torso')
        bone('elbow' + side, bind['elbow' + side]['p'], bind['hand' + side]['p'], 'arm' + side)
        bone('hand' + side, bind['hand' + side]['p'], P(sg * tip[0], tip[1]), 'elbow' + side)
        bone('leg' + side, bind['leg' + side]['p'], bind['knee' + side]['p'], 'body')
        bone('knee' + side, bind['knee' + side]['p'], bind['foot' + side]['p'], 'leg' + side)
        bone('foot' + side, bind['foot' + side]['p'], [sg * an[0] * s, 0.02 * s, 0.09 * T * s], 'knee' + side)
    bpy.ops.object.mode_set(mode='OBJECT')
    # ---- 自动权重
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); ao.select_set(True); bpy.context.view_layer.objects.active = ao
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    Ts = T * s                       # 缩放后的总高：下面的权重阈值都以它为尺度（网格已经缩放）
    gname = {i: g.name for i, g in enumerate(ob.vertex_groups)}
    bone_seg = {nm: (arm.bones[nm].head_local.copy(), arm.bones[nm].tail_local.copy()) for nm in JOINTS}
    W = np.zeros((n, 4), np.float32); I = np.zeros((n, 4), np.uint8); empty = 0
    co = np.empty(n * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    for vi, v in enumerate(me.vertices):
        gs = sorted(((g.weight, JOINTS.index(gname[g.group])) for g in v.groups if gname[g.group] in JOINTS), reverse=True)[:4]
        tot = sum(w for w, _ in gs)
        if tot < 1e-4:       # 没分到权重：找最近的骨头
            empty += 1; p = Vector(co[vi]); best = None
            for nm, (h, t) in bone_seg.items():
                d = t - h; u = max(0, min(1, (p - h).dot(d) / max(1e-9, d.dot(d)))); dist = (p - (h + d * u)).length
                if best is None or dist < best[0]: best = (dist, nm)
            gs = [(1.0, JOINTS.index(best[1]))]; tot = 1.0
        for j, (w, bi) in enumerate(gs): W[vi, j] = w / tot; I[vi, j] = bi
    log(name, 'verts', n, 'unweighted', empty)
    if empty > 0.2 * n:
        # 自动权重失败（网格不封闭 / 太碎）：改用“到骨骼线段的距离反比”权重，并且左右肢体不串边
        names = JOINTS; segs = np.array([[list(bone_seg[nm][0]), list(bone_seg[nm][1])] for nm in names], np.float32)   # (16,2,3)
        d = segs[:, 1] - segs[:, 0]; dd = (d * d).sum(1)
        pv = co[:, None, :] - segs[None, :, 0, :]
        u = np.clip((pv * d[None]).sum(2) / np.maximum(dd[None], 1e-9), 0, 1)
        dist = np.linalg.norm(pv - u[..., None] * d[None], axis=2)            # (n,16)
        wgt = 1.0 / (dist + 0.02 * Ts) ** 3
        sideL = np.clip((co[:, 0] + 0.06 * Ts) / (0.12 * Ts), 0, 1)             # 左右肢体软过渡，不要硬切
        for j, nm in enumerate(names):
            if nm.endswith('L'): wgt[:, j] *= sideL
            if nm.endswith('R'): wgt[:, j] *= 1 - sideL
        order = np.argsort(-wgt, 1)[:, :4]
        W[:] = 0; I[:] = 0
        for r in range(4):
            W[:, r] = wgt[np.arange(n), order[:, r]]; I[:, r] = order[:, r]
        W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
        log(name, 'analytic weights used')
    if dress:
        # 裙子：髋以下的顶点 = 身体 +（前面）随大腿 / 小腿摆动的权重；最下面一圈是鞋，整个跟脚走
        ss = lambda a, b, x: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))
        gx, gy, gz = co[:, 0], co[:, 2], -co[:, 1]
        sel = gy < (hip[1] - 0.01 * T) * s
        armJ = [JOINTS.index(n) for n in ('armL', 'elbowL', 'handL', 'armR', 'elbowR', 'handR')]
        sel &= ~np.isin(I[:, 0], armJ)             # 垂在髋以下的手臂（A 字姿势）不算裙子
        depth = (hip[1] * s - gy) / Ts
        front = ss(-0.03 * Ts, 0.05 * Ts, gz)
        wl = np.where(sel, ss(0.02, 0.30, depth) * 0.85 * front, 0)
        kf = ss((kn[1] + 0.06 * T) * s, (kn[1] - 0.04 * T) * s, gy)
        left = ss(-0.04 * Ts, 0.04 * Ts, gx)
        # 鞋 / 脚：脚关节附近（左右各一块）的顶点整个跟脚走；其余下摆顶点留在裙子上（腿在绑定时竖直，休息姿势下不动）
        footR, footY = c.get('foot', (0.13, 0.08))
        shoe = (gy < footY * Ts) & (np.abs(np.abs(gx) - an[0] * s) < footR * Ts)
        for vi in np.nonzero(sel)[0]:
            if shoe[vi]:
                side = 'L' if gx[vi] >= 0 else 'R'
                W[vi] = [1, 0, 0, 0]; I[vi] = [JOINTS.index('foot' + side), 0, 0, 0]; continue
            w = {'body': 1 - wl[vi]}
            for side, sf in (('L', left[vi]), ('R', 1 - left[vi])):
                w['leg' + side] = wl[vi] * (1 - kf[vi]) * sf; w['knee' + side] = wl[vi] * kf[vi] * sf
            items = sorted(((v, JOINTS.index(k)) for k, v in w.items() if v > 1e-4), reverse=True)[:4]
            tot = sum(v for v, _ in items)
            W[vi] = 0; I[vi] = 0
            for r, (v, bi) in enumerate(items): W[vi, r] = v / tot; I[vi, r] = bi
        log(name, 'skirt weights applied to', int(sel.sum()), 'verts')
    # ---- 脚的绑定朝向：大字型的脚尖是朝外撇的（鹿的靴子还跟着腿倾斜），摆直时要把脚尖转回正前方
    #      偏航 = 脚部网格（权重在脚骨上的顶点，取最低 35%）在水平面上的长轴方向；倾斜 = 靴子跟着腿的角度（footFollowsLeg）
    for side, sg in (('L', 1), ('R', -1)):
        jf = JOINTS.index('foot' + side)
        wj = (W * (I == jf)).sum(1)
        mk = wj > 0.5
        yaw = 0.0
        tilt = sg * th_kn if (c.get('footFollowsLeg') and not dress) else 0.0
        if mk.sum() > 40:
            gp = np.stack([co[mk, 0], co[mk, 2], -co[mk, 1]], 1).astype(np.float64)
            q = gp - np.array([sg * an[0] * s, an[1] * s, 0.0])
            cc, ss_ = math.cos(-tilt), math.sin(-tilt)
            x2 = q[:, 0] * cc - q[:, 1] * ss_; y2 = q[:, 0] * ss_ + q[:, 1] * cc
            low = y2 < y2.min() + 0.35 * (y2.max() - y2.min())
            if low.sum() > 30:
                P2 = np.stack([x2[low], q[low, 2]], 1); P2 -= P2.mean(0)
                _, sv, vt = np.linalg.svd(P2, full_matrices=False)
                axv = vt[0] * (1 if vt[0][1] >= 0 else -1)
                yaw = math.atan2(axv[0], axv[1])
                yaw = max(-1.2, min(1.2, yaw)) if sv[0] > 1.4 * sv[1] else 0.0     # 长宽比不明显（圆脚）就不转
                if abs(yaw) < 0.44: yaw = 0.0        # 偏航不到 25° 的是估计误差（两只脚符号还不对称），只纠正明显外撇的
        bind['foot' + side]['e'] = [0, round(yaw, 5), round(tilt, 5)]
        bind['foot' + side]['order'] = 'ZYX'
        log(name, 'foot' + side, 'yaw', round(math.degrees(yaw)), 'tilt', round(math.degrees(tilt)))
    # ---- 展开成游戏顶点（按 顶点 + UV 去重），转游戏坐标 (x, z, -y)
    me.calc_loop_triangles()
    nt = len(me.loop_triangles); tl = np.empty(nt * 3, np.int32); me.loop_triangles.foreach_get('loops', tl)
    lv = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', lv)
    uv = np.empty(len(me.loops) * 2, np.float32); me.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    vn = np.empty(n * 3, np.float32); me.vertex_normals.foreach_get('vector', vn); vn = vn.reshape(-1, 3)
    rows = np.concatenate([lv[tl][:, None].astype(np.int64), np.round(uv[tl] * 65536).astype(np.int64)], 1)
    uniq, inv = np.unique(rows, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    vi0 = uniq[:, 0]
    pos = np.stack([co[vi0, 0], co[vi0, 2], -co[vi0, 1]], 1).astype(np.float32)
    nor = np.stack([vn[vi0, 0], vn[vi0, 2], -vn[vi0, 1]], 1)
    nor = np.clip(np.round(nor * 127), -127, 127).astype(np.int8); nor = np.concatenate([nor, np.zeros((len(nor), 1), np.int8)], 1)
    uvo = (uniq[:, 1:3] / 65536.0).astype(np.float32)
    ski = I[vi0].astype(np.uint8)
    w8 = np.round(W[vi0] * 255).astype(np.int32)
    diff = 255 - w8.sum(1); w8[np.arange(len(w8)), np.argmax(w8, 1)] += diff
    w8 = np.clip(w8, 0, 255).astype(np.uint8)
    idx = inv.astype(np.uint32 if len(uniq) > 65535 else np.uint16)
    log(name, 'game verts', len(uniq), 'tris', nt, 'height', float(pos[:, 1].max()))
    hdr = dict(id=key, src=name, H=H, scale=s, vcount=int(len(uniq)), icount=int(len(idx)), indexBytes=int(idx.itemsize), joints=JOINTS, k=k, bind=bind,
               headJoint='head', texture=key + '.jpg')
    blobs = [('position', pos.tobytes()), ('normal', nor.tobytes()), ('uv', uvo.tobytes()), ('skinIndex', ski.tobytes()), ('skinWeight', w8.tobytes()), ('index', idx.tobytes())]
    off = 0; hdr['arrays'] = {}
    for nm, b in blobs:
        hdr['arrays'][nm] = [off, len(b)]; off += len(b) + (-len(b)) % 4
    hj = json.dumps(hdr, ensure_ascii=False).encode('utf-8'); hj += b' ' * ((-len(hj)) % 4)
    with open(os.path.join(OUT, key + '.rlpm'), 'wb') as fh:
        fh.write(b'RLPM'); fh.write(struct.pack('<II', 1, len(hj))); fh.write(hj)
        for nm, b in blobs: fh.write(b); fh.write(b'\0' * ((-len(b)) % 4))
    log('RESULT', key, os.path.getsize(os.path.join(OUT, key + '.rlpm')))
