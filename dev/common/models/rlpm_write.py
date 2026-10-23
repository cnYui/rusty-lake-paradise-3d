# 导出 .rlpm 的公共函数（动物 / 苍蝇人用）：骨骼线段距离反比权重、按 顶点+UV 展开、写文件。
# 坐标：骨架定义用游戏坐标（x 左、y 上、z 朝前），网格从 Blender 坐标（x, y, z）经 to_game 转换。
import bpy, json, math, os, struct
import numpy as np


def mesh_arrays(ob):
    me = ob.data
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32); me.vertices.foreach_get('co', co)
    return me, co.reshape(-1, 3)


def analytic_weights(gco, joints, T, side_soft=0.05, eps=0.02, power=3):
    """gco: (n,3) 游戏坐标顶点。joints: [{name, segs: [(a,b),...], side: 'L'|'R'|None}]。返回 W(n,4) I(n,4)。"""
    n = len(gco)
    wgt = np.zeros((n, len(joints)), np.float32)
    for j, jd in enumerate(joints):
        best = np.full(n, 1e9, np.float32)
        for a, b in jd['segs']:
            a = np.array(a, np.float32); b = np.array(b, np.float32); d = b - a; dd = float((d * d).sum())
            u = np.clip(((gco - a) @ d) / max(dd, 1e-9), 0, 1)
            dist = np.linalg.norm(gco - (a + u[:, None] * d), axis=1)
            best = np.minimum(best, dist)
        w = 1.0 / (best + eps * T) ** power
        side = jd.get('side')
        if side:
            sl = np.clip((gco[:, 0] + side_soft * T) / (2 * side_soft * T), 0, 1)
            w = w * (sl if side == 'L' else 1 - sl)
        wgt[:, j] = w
    order = np.argsort(-wgt, 1)[:, :4]
    W = np.take_along_axis(wgt, order, 1)
    W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
    return W.astype(np.float32), order.astype(np.uint8)


def write_rlpm(path, ob, to_game, W, I, hdr_extra, key, H, scale_note=0.0):
    """ob: 已缩放 / 平移好的低模（Blender 坐标）；to_game(co)->(n,3) 游戏坐标；W,I: 每个原始顶点的 4 个权重 / 骨骼序号。"""
    me = ob.data
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    gco = to_game(co)
    me.calc_loop_triangles()
    nt = len(me.loop_triangles)
    tl = np.empty(nt * 3, np.int32); me.loop_triangles.foreach_get('loops', tl)
    lv = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', lv)
    uv = np.empty(len(me.loops) * 2, np.float32); me.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    vn = np.empty(n * 3, np.float32); me.vertex_normals.foreach_get('vector', vn); vn = vn.reshape(-1, 3)
    gn = to_game(vn, direction=True)
    rows = np.concatenate([lv[tl][:, None].astype(np.int64), np.round(uv[tl] * 65536).astype(np.int64)], 1)
    uniq, inv = np.unique(rows, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    vi0 = uniq[:, 0]
    pos = gco[vi0].astype(np.float32)
    nor = np.clip(np.round(gn[vi0] * 127), -127, 127).astype(np.int8)
    nor = np.concatenate([nor, np.zeros((len(nor), 1), np.int8)], 1)
    uvo = (uniq[:, 1:3] / 65536.0).astype(np.float32)
    if W is not None:
        ski = I[vi0].astype(np.uint8)
        w8 = np.round(W[vi0] * 255).astype(np.int32)
        diff = 255 - w8.sum(1); w8[np.arange(len(w8)), np.argmax(w8, 1)] += diff
        w8 = np.clip(w8, 0, 255).astype(np.uint8)
    idx = inv.astype(np.uint32 if len(uniq) > 65535 else np.uint16)
    hdr = dict(id=key, H=H, vcount=int(len(uniq)), icount=int(len(idx)), indexBytes=int(idx.itemsize), texture=key + '.jpg',
               bounds=[pos.min(0).tolist(), pos.max(0).tolist()], **hdr_extra)
    blobs = [('position', pos.tobytes()), ('normal', nor.tobytes()), ('uv', uvo.tobytes())]
    if W is not None: blobs += [('skinIndex', ski.tobytes()), ('skinWeight', w8.tobytes())]
    blobs += [('index', idx.tobytes())]
    off = 0; hdr['arrays'] = {}
    for nm, b in blobs:
        hdr['arrays'][nm] = [off, len(b)]; off += len(b) + (-len(b)) % 4
    hj = json.dumps(hdr, ensure_ascii=False).encode('utf-8'); hj += b' ' * ((-len(hj)) % 4)
    with open(path, 'wb') as fh:
        fh.write(b'RLPM'); fh.write(struct.pack('<II', 1, len(hj))); fh.write(hj)
        for nm, b in blobs: fh.write(b); fh.write(b'\0' * ((-len(b)) % 4))
    return len(uniq), nt, pos
