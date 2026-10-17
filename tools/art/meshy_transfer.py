"""Transfers animation clips made on one Meshy skeleton onto another skeleton (another Meshy rig, or a Tripo rig),
free: no new purchase. Used to keep the clips bought on a rig that went wrong (its rest pose is crooked).

The motion is read from the source as animated joint POSITIONS, never against the source's rest pose:
  - each limb bone of the target is turned (smallest turn, after its parent) to point where the source bone points;
  - the hips and spine bones get a full orientation from two directions (up the spine, and hip to hip / shoulder to shoulder);
  - the hands (no bone past them to aim at) keep the source's turn relative to the forearm, the head its own turn,
    both measured against a neutral reference clip (a crooked source rest pose does not tilt them);
  - the hips' height follows the source's, scaled by the leg length.
So the two bodies may have different proportions and different rest poses.

  python tools/art/meshy_transfer.py <source rig.glb> <target rig.glb> <out.glb> <clip files...> [--only a,b] [--ref clip]
--ref: a neutral standing clip: it sets the source's forward direction (its average heading) and what a straight head
and straight wrists are (default: the first clip; with --pack, the plain idle m_idle0).
The output is the target rig with the transferred clips, for checking with tools/dev/clipview.html.
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tripo_pack as T  # noqa: E402
from tripo_pack import qmul, qinv, qrot, qnorm, qyaw  # noqa: E402

FPS = 30

# Meshy bone names -> Tripo names (the target may be either)
MESHY = {'Hips': 'Hip', 'Spine02': 'Waist', 'Spine01': 'Spine01', 'Spine': 'Spine02', 'neck': 'NeckTwist01', 'Head': 'Head'}
for s, S in (('Left', 'L'), ('Right', 'R')):
    MESHY.update({s + 'Shoulder': S + '_Clavicle', s + 'Arm': S + '_Upperarm', s + 'ForeArm': S + '_Forearm', s + 'Hand': S + '_Hand',
                  s + 'UpLeg': S + '_Thigh', s + 'Leg': S + '_Calf', s + 'Foot': S + '_Foot', s + 'ToeBase': S + '_ToeBase'})

# Mixamo bone names ("mixamorig:" taken off) -> Tripo names: Mixamo animations (tools/blender/fbx2glb.py) move onto
# the game's skeletons the same way
MIXAMO = {'Hips': 'Hip', 'Spine': 'Waist', 'Spine1': 'Spine01', 'Spine2': 'Spine02', 'Neck': 'NeckTwist01', 'Head': 'Head'}
for s, S in (('Left', 'L'), ('Right', 'R')):
    MIXAMO.update({s + 'Shoulder': S + '_Clavicle', s + 'Arm': S + '_Upperarm', s + 'ForeArm': S + '_Forearm', s + 'Hand': S + '_Hand',
                   s + 'UpLeg': S + '_Thigh', s + 'Leg': S + '_Calf', s + 'Foot': S + '_Foot', s + 'ToeBase': S + '_ToeBase'})

AIM = {'NeckTwist01': 'Head'}
for S in 'LR':
    AIM.update({S + '_Clavicle': S + '_Upperarm', S + '_Upperarm': S + '_Forearm', S + '_Forearm': S + '_Hand',
                S + '_Thigh': S + '_Calf', S + '_Calf': S + '_Foot', S + '_Foot': S + '_ToeBase'})
THIGHS, ARMS = ('L_Thigh', 'R_Thigh'), ('L_Upperarm', 'R_Upperarm')
# bone: (up from, up to, side pair)
FRAME = {'Hip': ('Hip', 'Spine01', THIGHS), 'Waist': ('Waist', 'Spine01', THIGHS),
         'Spine01': ('Spine01', 'Spine02', ARMS), 'Spine02': ('Spine02', 'NeckTwist01', ARMS)}
RELATIVE = {'L_Hand': 'L_Forearm', 'R_Hand': 'R_Forearm'}
# the head: its own turn in the world, against its average in the reference clip (looking straight ahead there)
ABSOLUTE = ('Head',)


def load(path):
    j, b = T.read_glb(path)
    if any(str(n.get('name', '')).startswith('mixamorig') for n in j['nodes']):   # a Mixamo skeleton
        import re
        for n in j['nodes']:
            n['orig'] = n.get('name')
            n['name'] = MIXAMO.get(re.sub(r'^mixamorig\d*:', '', n.get('name') or ''), n.get('name'))
        return j, b
    if any(n.get('name') == 'Hips' for n in j['nodes']):   # a Meshy rig (a Tripo one already has these names)
        for n in j['nodes']:
            n['orig'] = n.get('name')
            n['name'] = MESHY.get(n.get('name'), n.get('name'))
    return j, b


def clips(path):
    """[(name, tracks {node: {path: (times, values)}}, tmax)] of a file, its bones renamed"""
    j, b = load(path)
    out = []
    stem = os.path.splitext(os.path.basename(path))[0]
    anims = j.get('animations', [])
    for a in anims:
        tr, tmax = {}, 0
        for ch in a['channels']:
            s = a['samplers'][ch['sampler']]
            t = T.accessor(j, b, s['input']); v = T.accessor(j, b, s['output'])
            tr.setdefault(ch['target']['node'], {})[ch['target']['path']] = (t, v)
            tmax = max(tmax, float(t[-1]))
        out.append((stem if len(anims) == 1 else a.get('name') or stem, tr, tmax))
    return out


def unit(v):
    return v / (np.linalg.norm(v) or 1)


def from_to(a, b):
    """smallest rotation turning direction a onto direction b"""
    a, b = unit(a), unit(b)
    c = np.dot(a, b)
    if c < -0.9999:
        ax = np.cross(a, [1, 0, 0])
        if np.linalg.norm(ax) < 1e-4:
            ax = np.cross(a, [0, 1, 0])
        ax = unit(ax)
        return np.array([ax[0], ax[1], ax[2], 0.0])
    x = np.cross(a, b)
    return qnorm(np.array([x[0], x[1], x[2], 1 + c]))


def frame_q(up, side):
    """the rotation whose +Y is `up` and +X is `side` (made square to it)"""
    u = unit(up); s = unit(side - u * np.dot(side, u)); f = np.cross(s, u)
    m = np.array([s, u, f]).T
    tr = m[0, 0] + m[1, 1] + m[2, 2]
    if tr > 0:
        k = math.sqrt(tr + 1) * 2
        q = [(m[2, 1] - m[1, 2]) / k, (m[0, 2] - m[2, 0]) / k, (m[1, 0] - m[0, 1]) / k, k / 4]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        k = math.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [k / 4, (m[0, 1] + m[1, 0]) / k, (m[0, 2] + m[2, 0]) / k, (m[2, 1] - m[1, 2]) / k]
    elif m[1, 1] > m[2, 2]:
        k = math.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 1] + m[1, 0]) / k, k / 4, (m[1, 2] + m[2, 1]) / k, (m[0, 2] - m[2, 0]) / k]
    else:
        k = math.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[0, 2] + m[2, 0]) / k, (m[1, 2] + m[2, 1]) / k, k / 4, (m[1, 0] - m[0, 1]) / k]
    return qnorm(np.array(q))


def pose(sk, tracks, t):
    local = {}
    for i, ch in tracks.items():
        Tr, R, S = sk.rest[i]
        if 'rotation' in ch: R = T.sample(ch['rotation'], t, True)
        if 'translation' in ch: Tr = T.sample(ch['translation'], t, False)
        local[i] = (Tr, R, S)
    return sk.name_world(local)


def leg(W):
    return sum(np.linalg.norm(W[b][0] - W[a][0]) for a, b in (('L_Thigh', 'L_Calf'), ('L_Calf', 'L_Foot'), ('R_Thigh', 'R_Calf'), ('R_Calf', 'R_Foot'))) / 2


def heading(W):
    lv = W['L_Thigh'][0] - W['R_Thigh'][0]
    return math.atan2(-lv[2], lv[0])


def ankles(W):
    return min(W['L_Foot'][0][1], W['R_Foot'][0][1])


class Transfer:
    def __init__(self, src, tgt, ref):
        self.src, self.tgt = src, tgt
        tr, tmax = ref
        ys = yc = 0.0
        for t in np.linspace(0, tmax, 24):
            a = heading(pose(src, tr, t)); ys += math.sin(a); yc += math.cos(a)
        self.Ns = qyaw(-math.atan2(ys, yc))          # source space -> facing +Z
        tgt.facing_ = tgt.facing()
        self.Nt = qyaw(tgt.facing_)                   # target space -> facing +Z
        self.trest = tgt.name_world()
        self.srest = src.name_world()
        self.k = leg(self.trest) / leg(self.srest)
        # the head and the hands copy the source's turn relative to their parent, measured from the source's rest pose;
        # a crooked rest (a bad rig) would tilt them in every clip: the reference clip (a neutral standing idle, the
        # head and wrists straight) sets what "straight" is, its average turn is taken out
        self.cal = {nm: np.array([0, 0, 0, 1.0]) for nm in RELATIVE}
        acc = {nm: np.zeros(4) for nm in RELATIVE}
        for t in np.linspace(0, tmax, 24):
            sw = pose(src, tr, t)
            for nm in RELATIVE:
                if nm in sw:
                    q = self.rel(sw, nm)
                    if np.dot(q, acc[nm]) < 0: q = -q
                    acc[nm] += q
        for nm in RELATIVE:
            if np.linalg.norm(acc[nm]) > 0: self.cal[nm] = qnorm(acc[nm])
        self.abs_ref = {}
        for nm in ABSOLUTE:
            a = np.zeros(4)
            for t in np.linspace(0, tmax, 24):
                q = self.absq(pose(src, tr, t), nm)
                if np.dot(q, a) < 0: q = -q
                a += q
            self.abs_ref[nm] = qnorm(a)

    def rel(self, sw, nm):
        """the source bone's turn relative to its parent (world deltas from the source's rest)"""
        par = RELATIVE[nm]
        ds = qmul(sw[nm][1], qinv(self.srest[nm][1])); dp = qmul(sw[par][1], qinv(self.srest[par][1]))
        return qmul(qinv(dp), ds)

    def absq(self, sw, nm):
        """the source bone's world turn from its rest, in the facing frame"""
        return qmul(qmul(self.Ns, qmul(sw[nm][1], qinv(self.srest[nm][1]))), qinv(self.Ns))

    def to_t(self, v):
        """a vector in the source's space -> the target's space (both turned to face +Z)"""
        return qrot(qinv(self.Nt), qrot(self.Ns, v))

    def bake(self, tracks, tmax, center=True):
        """center: the hips' travel across the floor centred on its mean (a raw clip); False: kept where the source
        has it from its rest pose (a clip of a packed game model, already in place)"""
        src, tgt, tw0, srest = self.src, self.tgt, self.trest, self.srest
        n = max(2, int(round(tmax * FPS)) + 1)
        times = np.array([i / FPS for i in range(n)])
        names = [tgt.nodes[i]['name'] for i in tgt.order if i in tgt.joints and tgt.nodes[i].get('name') not in ('Root', 'Armature')]
        rot = {nm: [] for nm in names}
        hips = []
        for t in times:
            sw = pose(src, tracks, t)
            P = lambda b: sw[b][0]  # noqa: E731
            tw = {}
            for i in tgt.order:
                nm = tgt.nodes[i].get('name')
                p = tgt.parent[i]
                pw = tw.get(p) if p is not None else None
                w0 = qmul(pw, tgt.rest[i][1]) if pw is not None else (tw0[nm][1] if nm in tw0 else tgt.rest[i][1])
                w = w0
                if nm in FRAME and nm in sw:
                    a, b, (l, r) = FRAME[nm]
                    qs = frame_q(self.to_t(P(b) - P(a)), self.to_t(P(l) - P(r)))
                    qt = frame_q(tw0[b][0] - tw0[a][0], tw0[l][0] - tw0[r][0])
                    w = qmul(qmul(qs, qinv(qt)), tw0[nm][1])
                elif nm in AIM and nm in sw and AIM[nm] in sw:
                    c = AIM[nm]
                    d0 = qrot(w0, tgt.rest[tgt.idx[c]][0])   # where the bone points once its parent has moved
                    w = qmul(from_to(d0, self.to_t(P(c) - P(nm))), w0)
                elif nm in ABSOLUTE and nm in sw:
                    d = qmul(self.absq(sw, nm), qinv(self.abs_ref[nm]))
                    w = qmul(qmul(qmul(qinv(self.Nt), d), self.Nt), tw0[nm][1])
                elif nm in RELATIVE and nm in sw:
                    par = RELATIVE[nm]
                    # the source's turn of this bone relative to its parent (less the reference's), in the facing frame
                    rel = qmul(self.rel(sw, nm), qinv(self.cal[nm]))
                    rel = qmul(qmul(qinv(self.Nt), qmul(qmul(self.Ns, rel), qinv(self.Ns))), self.Nt)
                    dpt = qmul(tw[tgt.idx[par]], qinv(tw0[par][1]))
                    w = qmul(qmul(dpt, rel), tw0[nm][1])
                tw[i] = w
                if nm in rot:
                    rot[nm].append(qnorm(qmul(qinv(pw), w) if pw is not None else w))
            # hips: the source's position, its height measured from the ankles at rest, scaled to the target's legs
            h = qrot(self.Ns, P('Hip')); h[1] -= ankles(srest)
            hips.append(h * self.k)
        hips = np.array(hips)
        if center:
            hips[:, 0] -= hips[:, 0].mean(); hips[:, 2] -= hips[:, 2].mean()
        else:
            r0 = qrot(self.Ns, srest['Hip'][0]) * self.k
            hips[:, 0] -= r0[0]; hips[:, 2] -= r0[2]
        hip_i = tgt.idx['Hip']
        pW = tgt.name_world()[tgt.nodes[tgt.parent[hip_i]]['name']]
        out = []
        for hv in hips:
            d = qrot(qinv(self.Nt), np.array([hv[0], 0, hv[2]]))
            wpos = np.array([tw0['Hip'][0][0] + d[0], ankles(tw0) + hv[1], tw0['Hip'][0][2] + d[2]])
            out.append(qrot(qinv(pW[1]), wpos - pW[0]) / pW[2])
        for nm in rot:
            q = rot[nm]
            for k in range(1, len(q)):
                if np.dot(q[k], q[k - 1]) < 0:
                    q[k] = -q[k]
        return times, rot, np.array(out)


def main(args):
    opt = {}
    for flag in ('--only', '--ref', '--pack'):
        if flag in args:
            k = args.index(flag); opt[flag] = args[k + 1]; args = args[:k] + args[k + 2:]
    only = set(opt['--only'].split(',')) if '--only' in opt else None
    src_rig, tgt_rig, out = args[0], args[1], args[2]
    src = T.Skel(*load(src_rig))
    j, b = load(tgt_rig)
    tgt = T.Skel(j, b)
    found = []
    names = None
    if '--pack' in opt:
        # the clip names meshy_pack.py gives them: per file, in the order Meshy put them; text to motion: m_<file>
        from meshy_pack import CHARACTERS
        names = CHARACTERS[opt['--pack']]['files']
        opt.setdefault('--ref', 'm_idle0')
    for f in args[3:]:
        cs = clips(f)
        if names is not None:
            stem = os.path.splitext(os.path.basename(f))[0]
            lst = names.get(stem) or ['m_' + stem]
            cs = [(lst[k], tr, tm) for k, (_, tr, tm) in enumerate(cs) if k < len(lst) and lst[k]]
        found += cs
    ref = next((c for c in found if c[0] == opt.get('--ref')), found[0])
    X = Transfer(src, tgt, (ref[1], ref[2]))
    j['animations'] = []
    hip = tgt.idx['Hip']
    for nm, tr, tmax in found:
        if only and nm not in only:
            continue
        times, rot, hips = X.bake(tr, tmax)
        a = {'name': nm, 'channels': [], 'samplers': []}
        ti = T.add_data(j, b, times, 'SCALAR', minmax=True)
        for bone, q in rot.items():
            oi = T.add_quat(j, b, np.array(q))
            a['samplers'].append({'input': ti, 'output': oi, 'interpolation': 'LINEAR'})
            a['channels'].append({'sampler': len(a['samplers']) - 1, 'target': {'node': tgt.idx[bone], 'path': 'rotation'}})
        oi = T.add_data(j, b, hips, 'VEC3')
        a['samplers'].append({'input': ti, 'output': oi, 'interpolation': 'LINEAR'})
        a['channels'].append({'sampler': len(a['samplers']) - 1, 'target': {'node': hip, 'path': 'translation'}})
        j['animations'].append(a)
        print('  %-24s %.2fs' % (nm, tmax))
    for n in j['nodes']:   # back to the target's own bone names
        if 'orig' in n:
            n['name'] = n.pop('orig')
    T.write_glb(out, j, b)
    print(len(j['animations']), 'clips ->', out, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    main(sys.argv[1:])
