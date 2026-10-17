"""A high-poly model exported from the Meshy website (FBX or GLB, ~700k faces) -> a game-ready GLB, the input of
`meshy.py rig --file`. Runs in Blender (background):
  /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/art/meshy_decimate.py -- <in.fbx|glb> <out.glb>
      [--faces 40000] [--head 0.80] [--headshare 0.3] [--bake 2048]
- decimated (collapse) to about --faces, the head (above --head x height) decimated less: it gets --headshare of the
  budget (about twice its share of the surface), so the cartoon face stays round;
- smooth shading; only the base colour texture is kept from Meshy (its normal / roughness maps are for the
  high-poly surface);
- --bake N: a tangent-space normal map baked from the high-poly mesh onto the decimated one (N x N), so the sculpted
  locks, folds and the soft shading of the original survive (the game reads it: rigModel.js).
"""
import bpy
import sys

a = sys.argv[sys.argv.index('--') + 1:]
src, dst = a[0], a[1]


def opt(name, default):
    return type(default)(a[a.index(name) + 1]) if name in a else default


target, head, headshare, bake = opt('--faces', 40000), opt('--head', 0.80), opt('--headshare', 0.3), opt('--bake', 0)

bpy.ops.wm.read_factory_settings(use_empty=True)
if src.lower().endswith('.fbx'):
    bpy.ops.import_scene.fbx(filepath=src)
else:
    bpy.ops.import_scene.gltf(filepath=src)
hi = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
bpy.context.view_layer.objects.active = hi
hi.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
lo = hi.copy(); lo.data = hi.data.copy(); lo.name = 'body'
bpy.context.collection.objects.link(lo)
n = len(lo.data.polygons)

# split the budget: the head gets `headshare` of it, the body the rest
zs = [v.co.z for v in lo.data.vertices]
z0, z1 = min(zs), max(zs)
zc = z0 + head * (z1 - z0)
inhead = [all(lo.data.vertices[i].co.z > zc for i in p.vertices) for p in lo.data.polygons]
nh = sum(inhead); nb = n - nh
keep_h = min(nh, int(target * headshare)); keep_b = target - keep_h
print('SPLIT head %d faces -> %d, body %d -> %d' % (nh, keep_h, nb, keep_b))


def decimate(obj, ratio):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = obj; obj.select_set(True)
    m = obj.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = ratio
    m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=m.name)


# separate the head, decimate both parts, join them back and weld the cut
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = lo; lo.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
for p, h in zip(lo.data.polygons, inhead):
    p.select = h
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
hd = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o not in (hi, lo))
decimate(hd, keep_h / max(nh, 1))
decimate(lo, keep_b / max(nb, 1))
bpy.ops.object.select_all(action='DESELECT')
hd.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
bpy.ops.object.join()
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0005)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.shade_smooth()

# material of the low mesh: base colour only (a copy, the high mesh keeps its own for the bake)
mat = lo.data.materials[0].copy(); lo.data.materials[0] = mat
nt = mat.node_tree
bsdf = next(x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED')
for inp in ('Normal', 'Metallic', 'Roughness', 'Emission Color', 'Alpha'):
    if inp in bsdf.inputs:
        for l in list(bsdf.inputs[inp].links):
            nt.links.remove(l)
bsdf.inputs['Metallic'].default_value = 0.0
bsdf.inputs['Roughness'].default_value = 0.8
if 'Emission Strength' in bsdf.inputs:
    bsdf.inputs['Emission Strength'].default_value = 0.0

if bake:
    img = bpy.data.images.new('kerrian_normal', bake, bake, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.interpolation = 'Linear'
    nt.nodes.active = tex
    sc = bpy.context.scene
    try:
        sc.render.engine = 'CYCLES'
    except TypeError as e:
        print('engine', e)
    sc.cycles.samples = 1
    sc.render.bake.use_selected_to_active = True
    sc.render.bake.cage_extrusion = 0.01
    sc.render.bake.max_ray_distance = 0.03
    sc.render.bake.margin = 8
    bpy.ops.object.select_all(action='DESELECT')
    hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tex.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    print('BAKED normal map %d' % bake)

bpy.data.objects.remove(hi)
print('MESH %s: %d -> %d faces, size %s' % (lo.name, n, len(lo.data.polygons), tuple(round(x, 3) for x in lo.dimensions)))
bpy.ops.object.select_all(action='DESELECT'); lo.select_set(True)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=92,
                          use_selection=True)
