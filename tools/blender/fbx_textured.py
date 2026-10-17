"""A textured FBX (a Meshy model downloaded from the site: <name>.fbx next to <name>.png, _normal, _roughness,
_metallic) -> one glb with its PBR textures, for the Meshy rigging (tools/meshy/meshy.py rig <id> --glb <file>).
  ./tools/blender/run.ps1 fbx_textured.py <in.fbx> <out.glb> [triangles=30000] [colour only: 0|1] [texture size: 0 = as is]
  (decimated to about that many triangles, UVs kept)
"""
import os
import sys

import bpy

a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]
TRIS = int(a[2]) if len(a) > 2 else 30000
COLOR_ONLY = len(a) > 3 and a[3] == '1'
SIZE = int(a[4]) if len(a) > 4 else 0
base = os.path.splitext(src)[0]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
print('[SB] objects', [(o.name, o.type) for o in bpy.data.objects])


def img(suffix, color=True):
    p = base + suffix + '.png'
    if not os.path.exists(p):
        return None
    im = bpy.data.images.load(p)
    if not color:
        im.colorspace_settings.name = 'Non-Color'
    return im


col, nrm, rough, metal = img(''), img('_normal', False), img('_roughness', False), img('_metallic', False)
if COLOR_ONLY: nrm = rough = metal = None
for im in (col, nrm, rough, metal):
    if im and SIZE and max(im.size) > SIZE: im.scale(SIZE, SIZE)
for o in meshes:
    for slot in o.material_slots or []:
        m = slot.material
        if not m:
            continue
        m.use_nodes = True
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            continue

        def tex(im, socket, normal=False):
            if not im:
                return
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = im
            if normal:
                nm = nt.nodes.new('ShaderNodeNormalMap')
                nt.links.new(t.outputs['Color'], nm.inputs['Color'])
                nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
            else:
                nt.links.new(t.outputs['Color'], bsdf.inputs[socket])
        tex(col, 'Base Color'); tex(rough, 'Roughness'); tex(metal, 'Metallic'); tex(nrm, None, True)
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if tris > TRIS:
        bpy.context.view_layer.objects.active = o
        mod = o.modifiers.new('dec', 'DECIMATE'); mod.ratio = TRIS / tris; mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
        print('[SB] decimated %d -> %d' % (tris, sum(len(p.vertices) - 2 for p in o.data.polygons)))
    dims = o.dimensions
    print('[SB] mesh %s tris %d dims %.2f %.2f %.2f' % (o.name, tris, dims.x, dims.y, dims.z))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=False, export_skins=False,
                          export_image_format='JPEG' if COLOR_ONLY else 'AUTO')  # (colour only: the light version to upload)
print('[SB] wrote', out, os.path.getsize(out) // 1024, 'KB')
