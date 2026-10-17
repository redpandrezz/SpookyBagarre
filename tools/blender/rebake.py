"""A rigged model's colour texture made again, clean (Ronare, 17 Oct 2026): the decimated mesh kept the original
atlas, whose islands now and then reach over the white background and the skin next to them (white and skin-coloured
streaks on the clothes in the game). Here the rigged mesh (its vertices, bones and weights untouched) gets a new
unwrap with margins, and its colour is baked from the full-detail source model (selected to active, Cycles).
  ./tools/blender/run.ps1 rebake.py <rig.glb> <source.glb> <out dir> [size=2048]
Writes <out dir>/bake.png and <out dir>/uv.json (the triangles: glTF vertex indices and their new UVs), applied to
the rig by tools/art/retexture.py.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

a = sys.argv[sys.argv.index('--') + 1:]
rig, src, out = a[0], a[1], os.path.abspath(a[2])   # (an image saved to a relative path lands who knows where)
SIZE = int(a[3]) if len(a) > 3 else 2048
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)


def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def bbox(objs):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


R_all = load(rig)
R = next(o for o in R_all if o.type == 'MESH')
for m in list(R.modifiers):   # the rest pose = the bind pose: the bones play no part in the bake
    R.modifiers.remove(m)
for o in R_all:
    if o.type == 'ARMATURE':
        o.data.pose_position = 'REST'
print('[SB] rig mesh', R.name, len(R.data.vertices), 'vertices', len(R.data.polygons), 'faces')
S = [o for o in load(src) if o.type == 'MESH']
# the source where the rig is: same height, feet on the same floor, centred
rlo, rhi = bbox([R]); slo, shi = bbox(S)
k = (rhi.z - rlo.z) / (shi.z - slo.z)
for o in S:
    o.matrix_world = o.matrix_world.copy()
    o.scale = o.scale * k
bpy.context.view_layer.update()
slo, shi = bbox(S)
d = Vector(((rlo.x + rhi.x - slo.x - shi.x) / 2, (rlo.y + rhi.y - slo.y - shi.y) / 2, rlo.z - slo.z))
for o in S:
    o.location = o.location + d
slo, shi = bbox(S)
print('[SB] rig box', tuple(round(v, 3) for v in rlo), tuple(round(v, 3) for v in rhi))
print('[SB] src box', tuple(round(v, 3) for v in slo), tuple(round(v, 3) for v in shi))
H = rhi.z - rlo.z

# the new unwrap: cut along the seams of the original atlas (its big clean islands), unwrapped again (no triangle
# reaching across a gap any more), packed with a margin between them
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = R
R.select_set(True)
R.data.uv_layers.active = R.data.uv_layers[0]
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.seams_from_islands(mark_seams=True)
bpy.ops.object.mode_set(mode='OBJECT')
uv = R.data.uv_layers.new(name='bake')
R.data.uv_layers.active = uv
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.unwrap(method='MINIMUM_STRETCH', margin=0.006)
bpy.ops.object.mode_set(mode='OBJECT')
# the head gets more pixels than the rest (the face is seen up close: portraits, the VS screen, the victory camera):
# its islands scaled up before the packing (which keeps the islands' relative sizes)
HEAD = 2.4
top = rlo.z + 0.84 * H
uv = R.data.uv_layers['bake']
for p in R.data.polygons:
    if (R.matrix_world @ p.center).z > top:
        for i in p.loop_indices:
            uv.data[i].uv *= HEAD
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.select_all(action='SELECT')
bpy.ops.uv.pack_islands(rotate=True, margin=0.006)
bpy.ops.object.mode_set(mode='OBJECT')
uv = R.data.uv_layers['bake']
print('[SB] seams', sum(1 for e in R.data.edges if e.use_seam))

img = bpy.data.images.new('bake', SIZE, SIZE, alpha=False)
mat = bpy.data.materials.new('bake'); mat.use_nodes = True
nt = mat.node_tree
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
nt.nodes.active = tn
R.data.materials.clear(); R.data.materials.append(mat)

sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 4
bk = sc.render.bake
bk.use_selected_to_active = True
bk.use_cage = False
bk.cage_extrusion = 0.02 * H
bk.max_ray_distance = 0.06 * H
bk.margin = 24
bk.margin_type = 'EXTEND'
bk.use_pass_direct = False
bk.use_pass_indirect = False
bk.use_pass_color = True
for o in S:
    o.select_set(True)
R.select_set(True)
bpy.context.view_layer.objects.active = R
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=24)
img.filepath_raw = os.path.join(out, 'bake.png'); img.file_format = 'PNG'
img.save()
print('[SB] wrote', img.filepath_raw)

# the triangles with their glTF vertex indices (the importer keeps one Blender vertex per glTF vertex) and new UVs
tris, uvs = [], []
uv = R.data.uv_layers['bake']   # (fetched again: the layer data moved when leaving edit mode)
for p in R.data.polygons:
    if len(p.loop_indices) != 3:
        continue
    tris.append([R.data.loops[i].vertex_index for i in p.loop_indices])
    uvs.append([[round(uv.data[i].uv.x, 6), round(uv.data[i].uv.y, 6)] for i in p.loop_indices])
json.dump({'vertices': len(R.data.vertices), 'tris': tris, 'uv': uvs}, open(os.path.join(out, 'uv.json'), 'w'))
print('[SB] wrote uv.json', len(tris), 'triangles')
