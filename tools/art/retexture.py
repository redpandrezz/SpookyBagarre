"""Puts the texture baked by tools/blender/rebake.py on a rigged Meshy model (Ronare, 17 Oct 2026): the new UVs (a
vertex split where the new unwrap cuts), the baked colour as the only texture (Meshy's normal and roughness maps
followed the old atlas: dropped, a plain matte cloth instead), the bones, weights and vertex order untouched (the
transferred clips stay valid). The clothes are made clean: on the triangles of the T-shirt and the trousers (dark,
between the ankles and the neck), every pixel that is not dark (skin-coloured or white streaks) is painted with the
cloth's own colour; the chain on the chest is kept. Then the gaps between the islands are filled from their edges
(no colour bleeding in the mipmaps).
  python tools/art/retexture.py <id>     (tools/art/meshy/<id>/: rig.glb, kept first as rig_meshy.glb; bake/)
"""
import io
import json
import os
import shutil
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tripo_pack import read_glb, write_glb, accessor  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# the clothes: between these heights (share of the body, feet at 0), darker than DARK on the whole
CLOTH_H = (0.035, 0.785)  # (up to the collar: above, the neck's skin and the collar's edge stay as baked)
DARK = 70
# the chain: light grey (unsaturated) pixels on the front of the chest, kept
CHAIN_H = (0.6, 0.83)
CHAIN_X = 0.16


def compact(j, bin_, extra):
    """a new buffer with only what the json still uses; extra: {bufferView index: new bytes}"""
    used_acc = set()
    for m in j.get('meshes', []):
        for p in m['primitives']:
            used_acc |= set(p['attributes'].values())
            if 'indices' in p:
                used_acc.add(p['indices'])
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s:
            used_acc.add(s['inverseBindMatrices'])
    for a in j.get('animations', []):
        for s in a['samplers']:
            used_acc |= {s['input'], s['output']}
    acc_map = {old: k for k, old in enumerate(sorted(used_acc))}
    accs = [j['accessors'][old] for old in sorted(used_acc)]
    used_bv = sorted({a['bufferView'] for a in accs if 'bufferView' in a} | {im['bufferView'] for im in j.get('images', []) if 'bufferView' in im})
    bv_map, views, out = {}, [], bytearray()
    for old in used_bv:
        v = j['bufferViews'][old]
        data = extra.get(old)
        if data is None:
            o = v.get('byteOffset', 0); data = bytes(bin_[o:o + v['byteLength']])
        while len(out) % 4:
            out.append(0)
        nv = {k: x for k, x in v.items() if k not in ('byteOffset', 'byteLength', 'buffer')}
        nv.update({'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)})
        bv_map[old] = len(views); views.append(nv); out.extend(data)
    for a in accs:
        if 'bufferView' in a:
            a['bufferView'] = bv_map[a['bufferView']]
    for im in j.get('images', []):
        if 'bufferView' in im:
            im['bufferView'] = bv_map[im['bufferView']]
    for m in j.get('meshes', []):
        for p in m['primitives']:
            p['attributes'] = {k: acc_map[v] for k, v in p['attributes'].items()}
            if 'indices' in p:
                p['indices'] = acc_map[p['indices']]
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s:
            s['inverseBindMatrices'] = acc_map[s['inverseBindMatrices']]
    for a in j.get('animations', []):
        for s in a['samplers']:
            s['input'] = acc_map[s['input']]; s['output'] = acc_map[s['output']]
    j['accessors'] = accs
    j['bufferViews'] = views
    return out


def add(j, extra, arr, ctype, typ, minmax=False, target=None):
    """a new accessor and its bufferView (bytes kept in extra until compact() lays them out)"""
    data = arr.tobytes()
    bv = {'buffer': 0, 'byteOffset': 0, 'byteLength': len(data)}
    if target:
        bv['target'] = target
    j['bufferViews'].append(bv)
    extra[len(j['bufferViews']) - 1] = data
    a = {'bufferView': len(j['bufferViews']) - 1, 'componentType': ctype, 'count': len(arr), 'type': typ}
    if minmax:
        a['min'] = arr.min(axis=0).tolist(); a['max'] = arr.max(axis=0).tolist()
    j['accessors'].append(a)
    return len(j['accessors']) - 1


def clean_cloth(img, tris, uvs, pos):
    """the T-shirt and trousers painted clean, then the gaps between islands filled"""
    S = img.shape[0]
    lum = img @ np.array([0.299, 0.587, 0.114])
    sat = img.max(axis=2) - img.min(axis=2)
    lab_img = Image.new('I', (S, S), -1)
    dr = ImageDraw.Draw(lab_img)
    for k, t in enumerate(uvs):
        dr.polygon([(u * S, (1 - v) * S) for u, v in t], fill=k, outline=k)
    lab = np.array(lab_img, dtype=np.int32)
    y = pos[:, 1]; h = (y - y.min()) / (y.max() - y.min())
    cx = (pos[:, 0].max() + pos[:, 0].min()) / 2
    hc = h[tris].mean(axis=1)
    xc = np.abs(pos[tris][:, :, 0].mean(axis=1) - cx)
    zc = pos[tris][:, :, 2].mean(axis=1)
    zmid = (pos[:, 2].max() + pos[:, 2].min()) / 2
    covered = lab >= 0
    flat = lab[covered]
    L = lum[covered]
    # the median brightness of each triangle's pixels
    order = np.argsort(flat, kind='stable')
    fl, Ls = flat[order], L[order]
    starts = np.searchsorted(fl, np.arange(len(tris)))
    ends = np.searchsorted(fl, np.arange(len(tris)), side='right')
    med = np.array([np.median(Ls[a:b]) if b > a else 255 for a, b in zip(starts, ends)])
    cloth = (hc > CLOTH_H[0]) & (hc < CLOTH_H[1]) & (med < DARK)
    chainy = cloth & (hc > CHAIN_H[0]) & (hc < CHAIN_H[1]) & (xc < CHAIN_X) & (zc > zmid)
    cloth_px = covered & cloth[np.maximum(lab, 0)]
    chain_px = covered & chainy[np.maximum(lab, 0)]
    dark = cloth_px & (lum < 45)
    base = np.median(img[dark], axis=0) if dark.any() else np.array([18, 19, 20.0])
    bad = cloth_px & ((lum > 48) | ((img[:, :, 0] - img[:, :, 2] > 22) & (lum > 30)))
    keep_chain = chain_px & (sat < 30) & (lum > 95)
    bad &= ~keep_chain
    # painted with the dark pixels around (a blur of the clean ones), never lighter than the cloth
    out = img.copy()
    good = cloth_px & ~bad
    acc = np.where(good[..., None], img, 0).astype(np.float64); w = good.astype(np.float64)
    for _ in range(3):
        acc = sum(np.roll(np.roll(acc, dy, 0), dx, 1) for dy in (-2, 0, 2) for dx in (-2, 0, 2))
        w = sum(np.roll(np.roll(w, dy, 0), dx, 1) for dy in (-2, 0, 2) for dx in (-2, 0, 2))
    fill = np.where(w[..., None] > 0, acc / np.maximum(w, 1e-6)[..., None], base)
    fill = np.minimum(fill, base + 12)
    out[bad] = fill[bad]
    print('cloth triangles %d of %d, %d pixels repainted, chain pixels kept %d, cloth colour %s'
          % (cloth.sum(), len(tris), bad.sum(), keep_chain.sum(), base.round().tolist()))
    # the gaps: filled from the islands' edges, outwards
    filled = covered.copy()
    for _ in range(64):
        if filled.all():
            break
        acc = np.zeros_like(out); n = np.zeros(filled.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            m = np.roll(np.roll(filled, dy, 0), dx, 1)
            acc += np.where(m[..., None], np.roll(np.roll(out, dy, 0), dx, 1), 0); n += m
        grow = ~filled & (n > 0)
        out[grow] = acc[grow] / n[grow][:, None]
        filled |= grow
    out[~filled] = base
    return out


def main(cid):
    d = os.path.join(ROOT, 'tools', 'art', 'meshy', cid)
    orig = os.path.join(d, 'rig_meshy.glb')
    if not os.path.exists(orig):
        shutil.copy(os.path.join(d, 'rig.glb'), orig)
    j, bin_ = read_glb(orig)
    U = json.load(open(os.path.join(d, 'bake', 'uv.json')))
    tris = np.array(U['tris'], np.int64)
    uvs = np.array(U['uv'], np.float64)
    prim = j['meshes'][0]['primitives'][0]
    A = prim['attributes']
    assert j['accessors'][A['POSITION']]['count'] == U['vertices'], 'vertex count differs from the bake'
    pos = accessor(j, bin_, A['POSITION'])
    # the texture: baked, then the clothes cleaned
    img = np.array(Image.open(os.path.join(d, 'bake', 'bake.png')).convert('RGB'), np.float64)
    img = clean_cloth(img, tris, uvs, pos)
    pic = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    pic.save(os.path.join(d, 'bake', 'clean.png'))
    # the vertices: one per (old vertex, new UV)
    key, new_of, src, nuv = {}, [], [], []
    for t, tu in zip(tris, uvs):
        row = []
        for vi, (u, v) in zip(t, tu):
            k = (int(vi), round(u, 5), round(v, 5))
            if k not in key:
                key[k] = len(src); src.append(int(vi)); nuv.append((u, 1 - v))
            row.append(key[k])
        new_of.append(row)
    src = np.array(src)
    extra = {}
    attrs = {}
    for name, idx in A.items():
        if name in ('TEXCOORD_0', 'TANGENT'):
            continue
        a = j['accessors'][idx]
        v = j['bufferViews'][a['bufferView']]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        dt = {5126: np.float32, 5121: np.uint8, 5123: np.uint16, 5125: np.uint32}[a['componentType']]
        o = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        raw = np.frombuffer(bytes(bin_), dtype=dt, count=a['count'] * n, offset=o).reshape(a['count'], n)[src]
        attrs[name] = add(j, extra, np.ascontiguousarray(raw), a['componentType'], a['type'], minmax=name == 'POSITION', target=34962)
    attrs['TEXCOORD_0'] = add(j, extra, np.array(nuv, np.float32), 5126, 'VEC2', target=34962)
    prim['attributes'] = attrs
    prim['indices'] = add(j, extra, np.array(new_of, np.uint32).reshape(-1), 5125, 'SCALAR', target=34963)
    # the one texture
    b = io.BytesIO(); pic.save(b, 'JPEG', quality=94)
    j['bufferViews'].append({'buffer': 0, 'byteOffset': 0, 'byteLength': len(b.getvalue())})
    extra[len(j['bufferViews']) - 1] = b.getvalue()
    j['images'] = [{'bufferView': len(j['bufferViews']) - 1, 'mimeType': 'image/jpeg', 'name': 'baked'}]
    j['textures'] = [{'source': 0, **({'sampler': 0} if j.get('samplers') else {})}]
    m = j['materials'][prim.get('material', 0)]
    m.pop('normalTexture', None); m.pop('occlusionTexture', None); m.pop('emissiveTexture', None)
    m['pbrMetallicRoughness'] = {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.0, 'roughnessFactor': 0.85}
    out = compact(j, bin_, extra)
    write_glb(os.path.join(d, 'rig.glb'), j, out)
    print('%s: %d vertices (was %d), rig.glb %d KB' % (cid, len(src), U['vertices'], os.path.getsize(os.path.join(d, 'rig.glb')) // 1024))


if __name__ == '__main__':
    main(sys.argv[1])
