"""Copies the clips of one packed game model onto another (assets/models/<from>.glb -> assets/models/<to>.glb), free:
the same transfer as tools/art/meshy_transfer.py (animated joint positions, never the source's rest pose), so a
Tripo character's clips play on a Meshy rig and the other way round. A clip of the same name in the target is
replaced, unless listed in --keep. Used to give a new character another one's moveset (Kerrian plays BIDO's).

  python tools/art/model_clips.py <from> <to> [--only a,b] [--keep walk,run] [--ref idle]

--ref: a neutral standing clip of the source (its heading and what straight wrists and head are). Clip times are
kept as they are (a clip trimmed by tripo_pack.py WINDOW keeps its absolute times: NATIVE_MOVES stays valid).
Run it again after a meshy_pack.py of the target (the pack rebuilds the model without these clips).
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tripo_pack as T  # noqa: E402
import meshy_transfer as MT  # noqa: E402
from mixamo_add import MODELS, game_names, rename, restore, drop_animation  # noqa: E402


def tracks(j, b, a):
    tr, tmax = {}, 0.0
    for ch in a['channels']:
        s = a['samplers'][ch['sampler']]
        t = T.accessor(j, b, s['input']); v = T.accessor(j, b, s['output'])
        tr.setdefault(ch['target']['node'], {})[ch['target']['path']] = (t, v)
        tmax = max(tmax, float(t[-1]))
    return tr, tmax


def main(args):
    opt = {}
    for flag in ('--only', '--keep', '--ref'):
        if flag in args:
            k = args.index(flag); opt[flag] = args[k + 1]; args = args[:k] + args[k + 2:]
    src_id, dst_id = args[0], args[1]
    only = set(opt['--only'].split(',')) if '--only' in opt else None
    keep = set(opt.get('--keep', '').split(',')) - {''}
    sj, sb = T.read_glb(os.path.join(MODELS, src_id + '.glb'))
    rename(sj, game_names(sj))
    src = T.Skel(sj, sb)
    anims = [a for a in sj.get('animations', []) if (only is None or a['name'] in only) and a['name'] not in keep]
    ref = next((a for a in sj['animations'] if a['name'] == opt.get('--ref', 'idle')), anims[0])

    path = os.path.join(MODELS, dst_id + '.glb')
    j, b = T.read_glb(path)
    for a in anims:
        b = drop_animation(j, b, a['name'])
    rename(j, game_names(j))
    tgt = T.Skel(j, b)

    def facing():   # the packed models face +Z; measured from the hips
        W = tgt.name_world()
        left = W['L_Thigh'][0] - W['R_Thigh'][0]
        return -math.atan2(-left[2], left[0])
    tgt.facing = facing
    MT.FPS = 30
    aim = dict(MT.AIM)
    MT.AIM.clear(); MT.AIM.update({k: v for k, v in aim.items() if v in tgt.idx and k in tgt.idx})
    try:
        X = MT.Transfer(src, tgt, tracks(sj, sb, ref))
        for a in anims:
            tr, tmax = tracks(sj, sb, a)
            times, rot, hips = X.bake(tr, tmax, center=False)   # the source is packed: its clips are in place already
            out = {'name': a['name'], 'channels': [], 'samplers': []}
            ti = T.add_data(j, b, times, 'SCALAR', minmax=True)
            for bone, q in rot.items():
                if bone not in tgt.idx:
                    continue
                oi = T.add_quat(j, b, np.array(q))
                out['samplers'].append({'input': ti, 'output': oi, 'interpolation': 'LINEAR'})
                out['channels'].append({'sampler': len(out['samplers']) - 1, 'target': {'node': tgt.idx[bone], 'path': 'rotation'}})
            oi = T.add_data(j, b, hips, 'VEC3')
            out['samplers'].append({'input': ti, 'output': oi, 'interpolation': 'LINEAR'})
            out['channels'].append({'sampler': len(out['samplers']) - 1, 'target': {'node': tgt.idx['Hip'], 'path': 'translation'}})
            j.setdefault('animations', []).append(out)
            print('  %-24s %.2fs' % (a['name'], tmax))
    finally:
        MT.AIM.clear(); MT.AIM.update(aim)
    restore(j)
    T.write_glb(path, j, b)
    print('%d clips %s -> %s: %d clips, %d KB' % (len(anims), src_id, dst_id, len(j['animations']), os.path.getsize(path) // 1024))


if __name__ == '__main__':
    main(sys.argv[1:])
