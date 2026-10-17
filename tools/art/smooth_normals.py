"""Smooth normals for a Meshy model: its remeshed output splits every vertex per face (flat shading, the model looks
faceted). The normals of the vertices that share a position are averaged (weighted by face area), in place, so the
file keeps its layout (same buffers, same sizes). Pure Python, no numpy.
  python3 tools/art/smooth_normals.py <in.glb> <out.glb>
"""
import json
import math
import struct
import sys


def smooth(src, dst):
    b = bytearray(open(src, 'rb').read())
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    base = 20 + jl + 8

    def where(i):
        a = j['accessors'][i]
        bv = j['bufferViews'][a['bufferView']]
        return base + bv.get('byteOffset', 0) + a.get('byteOffset', 0), a['count'], a.get('componentType')

    for mesh in j['meshes']:
        for p in mesh['primitives']:
            if 'NORMAL' not in p['attributes']:
                continue
            po, n, _ = where(p['attributes']['POSITION'])
            no, _, _ = where(p['attributes']['NORMAL'])
            io, ni, ct = where(p['indices'])
            P = struct.unpack_from('<%df' % (3 * n), b, po)
            I = struct.unpack_from('<%d%s' % (ni, {5125: 'I', 5123: 'H', 5121: 'B'}[ct]), b, io)
            key = [(round(P[3 * k], 5), round(P[3 * k + 1], 5), round(P[3 * k + 2], 5)) for k in range(n)]
            acc = {}
            for t in range(0, ni, 3):
                a, c, d = I[t], I[t + 1], I[t + 2]
                ux, uy, uz = P[3 * c] - P[3 * a], P[3 * c + 1] - P[3 * a + 1], P[3 * c + 2] - P[3 * a + 2]
                vx, vy, vz = P[3 * d] - P[3 * a], P[3 * d + 1] - P[3 * a + 1], P[3 * d + 2] - P[3 * a + 2]
                f = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
                for k in (a, c, d):
                    s = acc.setdefault(key[k], [0.0, 0.0, 0.0])
                    s[0] += f[0]; s[1] += f[1]; s[2] += f[2]
            out = []
            for k in range(n):
                x, y, z = acc.get(key[k], (0.0, 1.0, 0.0))
                m = math.sqrt(x * x + y * y + z * z) or 1.0
                out += [x / m, y / m, z / m]
            struct.pack_into('<%df' % (3 * n), b, no, *out)
            print('%s: %d vertices, %d positions' % (mesh.get('name', 'mesh'), n, len(acc)))
    open(dst, 'wb').write(b)


if __name__ == '__main__':
    smooth(sys.argv[1], sys.argv[2])
