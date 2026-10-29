# 焊接 → 减面 → 重新展 UV → 把原贴图烘到新 UV。用法：blender -b -P retopo_bake.py -- 输出目录 目标面数 贴图边长 名字...
import bpy, bmesh, sys, os, time, math, glob
A = sys.argv[sys.argv.index('--') + 1:]
OUT, TARGET, RES, NAMES = A[0], int(A[1]), int(A[2]), A[3:]
os.makedirs(OUT, exist_ok=True)

def log(*a): print('LOG', *a, flush=True)

def weld_clean(me, dist=1e-5):
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    for l in list(bm.loops.layers.uv): bm.loops.layers.uv.remove(l)
    bm.to_mesh(me); bm.free()
    for nm in ('custom_normal',):
        if nm in me.attributes: me.attributes.remove(me.attributes[nm])
    me.update()

def drop_parts(obj, keep_fn):
    """按连通块筛选：keep_fn(bbox_min, bbox_max, vcount) 为 False 的块整块删除。"""
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
    parts = [o for o in bpy.context.selected_objects if o.type == 'MESH']
    infos = []
    for o in parts:
        vs = [v.co for v in o.data.vertices]
        mn = [min(v[i] for v in vs) for i in range(3)]; mx = [max(v[i] for v in vs) for i in range(3)]
        infos.append((o, mn, mx, len(vs)))
    infos.sort(key=lambda t: -t[3])
    for o, mn, mx, n in infos[:12]: log('part', o.name, n, [round(x, 3) for x in mn], [round(x, 3) for x in mx])
    keep = [t[0] for t in infos if keep_fn(t[1], t[2], t[3])]
    for t in infos:
        if t[0] not in keep: bpy.data.objects.remove(t[0], do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in keep: o.select_set(True)
    bpy.context.view_layer.objects.active = keep[0]
    if len(keep) > 1: bpy.ops.object.join()
    return bpy.context.view_layer.objects.active

FILTERS = {}
_flt = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'filters.py')    # 要删掉的连通块（山羊的木盆）
if os.path.exists(_flt):
    exec(open(_flt, encoding='utf-8').read())

GLB_DIR = os.environ.get('RLP_GLB_DIR', 'C:/Users/yui/Downloads')      # 用户生成的原始 GLB（每个 60 MB，不入库）
files = {os.path.basename(f).replace('+3d+model.glb', '').replace('+', '_'): f for f in glob.glob(GLB_DIR + '/*3d+model.glb')}
files.update({os.path.basename(f).replace(' 3d model.glb', '').replace(' ', '_'): f for f in glob.glob(GLB_DIR + '/* 3d model.glb')})   # 文件名带空格的（stone tower 3d model.glb）
for name in NAMES:
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=files[name])
    hi = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
    bpy.context.view_layer.objects.active = hi; hi.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    hi.name = name + '_hi'
    # 发光烘焙：把基础色贴图接到 Emission，烘出来就是原色（没有光照）
    nt = hi.active_material.node_tree
    tex = next(n for n in nt.nodes if n.type == 'TEX_IMAGE'); outn = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(tex.outputs['Color'], em.inputs['Color']); nt.links.new(em.outputs['Emission'], outn.inputs['Surface'])
    log(name, 'imported', len(hi.data.polygons), f'{time.time()-t0:.0f}s')
    # 低模：复制、焊接、去 UV
    lo = hi.copy(); lo.data = hi.data.copy(); lo.name = name; bpy.context.scene.collection.objects.link(lo)
    weld_clean(lo.data)
    log(name, 'welded', len(lo.data.polygons), f'{time.time()-t0:.0f}s')
    if name in FILTERS:
        lo = drop_parts(lo, FILTERS[name]); lo.name = name
        log(name, 'filtered', len(lo.data.polygons))
    n0 = len(lo.data.polygons)
    bpy.context.view_layer.objects.active = lo; bpy.ops.object.select_all(action='DESELECT'); lo.select_set(True)
    m = lo.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = min(1.0, TARGET / n0); m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
    bpy.ops.object.shade_smooth()
    log(name, 'decimated', n0, '->', len(lo.data.polygons), len(lo.data.vertices), f'{time.time()-t0:.0f}s')
    # 展 UV
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.004) if hasattr(bpy.ops.uv, 'pack_islands') else None
    bpy.ops.object.mode_set(mode='OBJECT')
    # 烘焙目标
    img = bpy.data.images.new(name + '_bake', RES, RES, alpha=False)
    mat = bpy.data.materials.new(name + '_lo'); mat.use_nodes = True
    ntl = mat.node_tree; timg = ntl.nodes.new('ShaderNodeTexImage'); timg.image = img; ntl.nodes.active = timg
    lo.data.materials.clear(); lo.data.materials.append(mat)
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
    bk = sc.render.bake; bk.use_selected_to_active = True; bk.cage_extrusion = 0.012; bk.max_ray_distance = 0.0; bk.margin = 10; bk.margin_type = 'EXTEND'; bk.target = 'IMAGE_TEXTURES'
    bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
    bpy.ops.object.bake(type='EMIT')
    png = os.path.join(OUT, name + '_bake.png'); img.filepath_raw = png; img.file_format = 'PNG'; img.save()
    log(name, 'baked', f'{time.time()-t0:.0f}s')
    bpy.data.objects.remove(hi, do_unlink=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, name + '_lo.blend'))
    log('RESULT', name, 'done', f'{time.time()-t0:.0f}s')
