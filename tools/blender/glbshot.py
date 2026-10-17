"""Close-up check of a model's textures: the GLB rendered flat (the raw texture, no light) from the front, the back
and both sides, 1024 px each, into <out>_<view>.png (white bleeding through seams, stretched islands...).
  ./tools/blender/run.ps1 glbshot.py <in.glb> <out prefix> [size=1024]
"""
import math
import os
import sys

import bpy
from mathutils import Vector

a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]
SIZE = int(a[2]) if len(a) > 2 else 1024
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in bpy.data.objects:   # the rest pose: no animation
    if o.animation_data:
        o.animation_data.action = None
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.context.view_layer.update()
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
mid, h = (lo + hi) / 2, max(hi.z - lo.z, 0.01)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT'
sc.display.shading.color_type = 'TEXTURE'
sc.view_settings.view_transform = 'Standard'
sc.render.resolution_x = sc.render.resolution_y = SIZE
sc.render.film_transparent = True
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = h * 1.05
for name, ang in (('front', 0), ('back', 180), ('left', 90), ('right', -90)):
    r = math.radians(ang)
    # the models face -Y in Blender (glTF +Z): the front camera stands at -Y
    cam.location = mid + Vector((math.sin(r) * 10, -math.cos(r) * 10, 0))
    cam.rotation_euler = (math.radians(90), 0, r)
    sc.render.filepath = '%s_%s.png' % (out, name)
    bpy.ops.render.render(write_still=True)
    print('[SB] wrote', sc.render.filepath)
