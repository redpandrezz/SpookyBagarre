"""Packs a character made with Meshy (tools/meshy/meshy.py) for the game: assets/models/<id>.glb with
  - the rigged model (tools/art/meshy/<id>/rig.glb) facing +Z, scaled to its height, feet on the ground, hips centred;
  - its bones renamed to the game's names (hips, spine, chest, neck, head, shoulder/upperarm/forearm/hand.L|R,
    thigh/shin/foot.L|R, toe.L|R; the middle spine bone is kept as spine1);
  - ONLY its own clips, all made on its own skeleton (Meshy library and text-to-motion: tools/art/meshy/<id>/anims/),
    copied as animated (same bones, no transfer), in place: the hips keep their height and bob, not their travel;
  - its textures brought down to TEX px (JPEG) so the file stays light.
Each character has its own pool of animations: nothing is borrowed from the others (see OWN in nativeMoves.js).

  python tools/art/meshy_pack.py <id> [--list]      (--list: the clips found in the source files, nothing written)
  python tools/art/meshy_pack.py --prop <name>      (a prop: tools/art/meshy/<name>/model.glb -> assets/models/props)
"""
import io
import json
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tripo_pack import read_glb, write_glb, add_data, add_quat, accessor, qmul, qinv, qrot, qyaw, qnorm, sample  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'tools', 'art', 'meshy')
TEX = 1024

BONES = {'Hips': 'hips', 'Spine02': 'spine', 'Spine01': 'spine1', 'Spine': 'chest', 'neck': 'neck', 'Head': 'head'}
for s, S in (('Left', 'L'), ('Right', 'R')):
    BONES.update({s + 'Shoulder': 'shoulder.' + S, s + 'Arm': 'upperarm.' + S, s + 'ForeArm': 'forearm.' + S, s + 'Hand': 'hand.' + S,
                  s + 'UpLeg': 'thigh.' + S, s + 'Leg': 'shin.' + S, s + 'Foot': 'foot.' + S, s + 'ToeBase': 'toe.' + S})

# per character: the clip names of each source file, in the order Meshy put them (a merged library batch holds one
# clip per action, in the order asked), and the height in metres
CHARACTERS = {
    'epektase': {
        'height': 1.8,
        'files': {
            'lotA': ['idle', 'm_walk_fight', 'run', 'm_jump', 'm_fall', 'm_block', 'm_roll', 'm_dodge', 'm_flyup', 'm_knockdown'],
            'lotB': ['m_standup', 'm_hang', 'm_headpain', 'hit_to_head', 'hit_to_body_01', 'hit_to_stomach', 'hit_to_side', 'm_grabthrow', 'm_chestpound', 'm_fistpump'],
            'lotC': ['m_rslash', 'm_lslash', 'm_thrust', 'm_reap', 'm_upslash', 'm_sweep', 'm_axechop', 'm_groundslam', 'm_axespin', 'm_jumpattack'],
            'lotD': ['m_spinkick', 'm_jumpslam', 'm_victory', 'm_combatidle', 'm_push', 'm_hammer', 'm_combo2', 'm_chargedslash', 'm_doublecombo', 'm_idle0'],
            'basic_walking': ['walk'], 'basic_running': ['m_run_basic'],
            # bought on the clean rig (14 Oct 2026, the reach pass): a one-handed weapon combo, kicks that stretch out
            'lotE': ['m_tricombo', 'm_wcombo', 'm_spartan', 'm_straightkick', 'm_legsweep'],
        },
        # text to motion: one clip per file, named after the file (m_<file>)
        # clips cut out of longer takes (seconds of the source): name: (source, t0, t1, options)
        #   loop: the end is faded into the start (a seamless cycle); still: the hips stay at their rest place
        #   (the poses of the air states: the sim moves the body, the clip must not lift or drop it)
        'derive': {
            'idle': ('idle', 3.6, 6.1, {'loop': True}),            # the guard with the guitar (the take starts crouched)
            's_rise': ('m_jump', 0.6, 0.8, {'still': True}),
            's_fall': ('m_jump', 0.9, 1.1, {'still': True}),
            's_squat': ('m_jump', 0.15, 0.3, {}),
            's_land': ('m_jump', 1.25, 1.55, {}),
            's_block': ('m_block', 1.0, 2.2, {'loop': True}),
            's_ledge': ('m_hang', 0.0, 4.6, {'loop': True}),
            's_down': ('m_knockdown', 1.4, 2.5, {}),
            's_getup': ('m_standup', 4.3, 6.2, {}),
            's_dizzy': ('m_headpain', 1.8, 3.4, {'loop': True}),
            's_crouch': ('m_groundslam', 1.85, 2.3, {}),
            's_airdodge': ('m_dodge', 0.0, 1.4, {'still': True}),
            # the climb over a ledge, moved from Skanky's rig (tools/art/meshy_transfer.py -> anims/ledgeclimb.glb)
            'l_climb': ('m_ledgeclimb', 0.15, 2.3, {'endRest': True}),
        },
    },
    'pprod': {
        'height': 1.78,
        'files': {
            'lotA': ['idle', 'm_jump', 'm_fall', 'm_block', 'm_roll', 'm_dodge', 'm_flyup', 'm_knockdown', 'm_standup', 'm_hang'],
            'lotB': ['m_headpain', 'hit_to_head', 'hit_to_body_01', 'hit_to_stomach', 'hit_to_side', 'm_grabthrow', 'm_victory', 'm_slide', 'm_chairsit', 'm_overthrow'],
            'lotC': ['m_ljab', 'm_rjab', 'm_bothfists', 'm_straightkick', 'm_elbow', 'm_roundhouse', 'm_legsweep', 'm_uppercut', 'm_prepunch', 'm_sweepkick'],
            'lotD': ['m_flykick', 'm_spinkick', 'm_highkick', 'm_jumppunch', 'm_risekick', 'm_crouchthrow', 'm_pullthrow', 'm_sitthumbs', 'm_sitanswer', 'm_fistpump'],
            'basic_walking': ['walk'], 'basic_running': ['m_run_basic'],
        },
        'derive': {
            'idle': ('idle', 0.0, 4.0, {'loop': True}),
            # he does not run, he surfs on his plate of spaghetti: leaning low, the start of the slide held
            'run': ('m_slide', 0.1, 0.2, {'loop': True}),
            's_rise': ('m_jump', 0.6, 0.8, {'still': True}),
            's_fall': ('m_fall', 0.0, 0.67, {'still': True, 'loop': True}),
            's_squat': ('m_jump', 0.15, 0.3, {}),
            's_land': ('m_jump', 1.25, 1.55, {}),
            's_block': ('m_block', 1.0, 2.2, {'loop': True}),
            's_ledge': ('m_hang', 0.0, 4.6, {'loop': True}),
            's_down': ('m_knockdown', 1.4, 2.5, {}),
            's_getup': ('m_standup', 4.3, 6.2, {}),
            's_dizzy': ('m_headpain', 1.8, 3.4, {'loop': True}),
            's_crouch': ('m_pullthrow', 1.2, 1.6, {}),
            's_airdodge': ('m_dodge', 0.0, 1.4, {'still': True}),
            # the aerials out of takes that jump: played where he is (the sim moves him)
            'a_flykick': ('m_flykick', 2.5, 3.6, {'still': True}),
            'a_spinkick': ('m_spinkick', 0.4, 1.63, {'still': True}),
            'a_jumppunch': ('m_jumppunch', 1.2, 2.1, {'still': True}),
            'l_climb': ('m_ledgeclimb', 0.15, 2.3, {'endRest': True}),
        },
    },
    'skanky': {
        'height': 1.85,
        'files': {
            'lotA': ['idle', 'm_jump', 'm_fall', 'm_block', 'm_roll', 'm_dodge', 'm_flyup', 'm_knockdown', 'm_standup', 'm_hang'],
            'lotB': ['hit_to_head', 'hit_to_body_01', 'hit_to_stomach', 'm_grabthrow', 'm_overthrow', 'm_victory', 'm_talk', 'm_talkopen', 'm_talkangry', 'm_vault'],
            'lotC': ['m_ljab', 'm_rjab', 'm_bothfists', 'm_straightkick', 'm_elbow', 'm_roundhouse', 'm_legsweep', 'm_uppercut', 'm_sweepkick', 'm_highkick'],
            'lotD': ['m_flykick', 'm_jumppunch', 'm_risekick', 'm_backflipkick', 'm_spinkick', 'm_shuffle', 'm_hiphop', 'm_funkywalk', 'm_slide'],
            'basic_walking': ['walk'], 'basic_running': ['m_run_basic'],
        },
        'derive': {
            'idle': ('idle', 0.0, 4.0, {'loop': True}),
            # he does not run, he rolls on his skateboard: the crouch of the ollie, arms out, held
            'run': ('m_ollie', 0.55, 0.65, {'loop': True}),
            's_rise': ('m_jump', 0.6, 0.8, {'still': True}),
            's_fall': ('m_fall', 0.0, 0.67, {'still': True, 'loop': True}),
            's_squat': ('m_jump', 0.15, 0.3, {}),
            's_land': ('m_jump', 1.25, 1.55, {}),
            's_block': ('m_block', 1.0, 2.2, {'loop': True}),
            's_ledge': ('m_hang', 0.0, 4.6, {'loop': True}),
            's_down': ('m_knockdown', 1.4, 2.5, {}),
            's_getup': ('m_standup', 4.3, 6.2, {}),
            # no head-in-pain take: dizzy is the blow to the stomach, slowed down and looped
            's_dizzy': ('hit_to_stomach', 0.35, 1.2, {'loop': True}),
            'hit_to_side': ('hit_to_head', 0.0, 2.83, {}),
            's_crouch': ('m_legsweep', 0.85, 1.2, {}),
            's_airdodge': ('m_dodge', 0.0, 1.4, {'still': True}),
            'a_flykick': ('m_flykick', 2.5, 3.6, {'still': True}),
            'a_spinkick': ('m_spinkick', 0.4, 1.63, {'still': True}),
            'a_jumppunch': ('m_jumppunch', 1.2, 2.1, {'still': True}),
            'a_risekick': ('m_risekick', 0.2, 1.0, {'still': True}),
            'a_backflip': ('m_backflipkick', 2.6, 4.2, {'still': True}),
            'a_ollie': ('m_ollie', 0.0, 2.97, {'still': True}),
            'a_vault': ('m_vault', 0.0, 1.97, {'still': True}),
            # bought on 15 Oct 2026: the climb over a ledge (text to motion), the hips rise from the hang to standing
            'l_climb': ('m_ledgeclimb', 0.15, 2.3, {'endRest': True}),
            # the character select: a burst of talk
            'm_select': ('m_talkangry', 2.0, 6.0, {}),
        },
    },
    'anbuu': {
        'height': 1.74,
        'files': {
            'lotA': ['idle', 'm_jump', 'm_fall', 'm_block', 'm_roll', 'm_dodge', 'm_flyup', 'm_knockdown', 'm_standup', 'm_hang'],
            'lotB': ['hit_to_head', 'hit_to_body_01', 'hit_to_stomach', 'm_grabthrow', 'm_overthrow', 'm_victory', 'm_chargecast', 'm_cast1', 'm_cast2', 'm_cast4'],
            'lotC': ['m_ljab', 'm_rjab', 'm_bothfists', 'm_straightkick', 'm_elbow', 'm_roundhouse', 'm_legsweep', 'm_uppercut', 'm_sweepkick', 'm_highkick'],
            'lotD': ['m_flykick', 'm_jumppunch', 'm_risekick', 'm_backflipkick', 'm_spinkick', 'm_cast6', 'm_cast8', 'm_stomp', 'm_chargecast2'],
        },
        'derive': {
            # he never walks: levitating on the spot, gliding to move (text to motion, the glide stood up from lying
            # flat into a lean: a little when walking, more when running, like Mewtwo's dash)
            'idle': ('m_levitate', 0.0, 3.97, {'loop': True}),
            'walk': ('m_glide', 0.67, 1.83, {'loop': True, 'still': True, 'tilt': 0.22}),
            'run': ('m_glide', 0.67, 1.83, {'loop': True, 'still': True, 'tilt': 0.55}),
            # the angel flight: the hips stay where the sim puts him (it already rises)
            'a_angel': ('m_angelflight', 0.0, 1.97, {'still': True}),
            's_rise': ('m_jump', 0.6, 0.8, {'still': True}),
            's_fall': ('m_fall', 0.0, 0.67, {'still': True, 'loop': True}),
            's_squat': ('m_jump', 0.15, 0.3, {}),
            's_land': ('m_jump', 1.25, 1.55, {}),
            's_block': ('m_block', 1.0, 2.2, {'loop': True}),
            's_ledge': ('m_hang', 0.0, 4.6, {'loop': True}),
            's_down': ('m_knockdown', 1.4, 2.5, {}),
            's_getup': ('m_standup', 4.3, 6.2, {}),
            's_dizzy': ('hit_to_stomach', 0.35, 1.2, {'loop': True}),
            'hit_to_side': ('hit_to_head', 0.0, 2.83, {}),
            's_crouch': ('m_legsweep', 0.85, 1.2, {}),
            's_airdodge': ('m_dodge', 0.0, 1.4, {'still': True}),
            'a_flykick': ('m_flykick', 2.5, 3.6, {'still': True}),
            'a_spinkick': ('m_spinkick', 0.4, 1.63, {'still': True}),
            'a_jumppunch': ('m_jumppunch', 1.2, 2.1, {'still': True}),
            'a_risekick': ('m_risekick', 0.2, 1.0, {'still': True}),
            'a_backflip': ('m_backflipkick', 2.6, 4.2, {'still': True}),
            'l_climb': ('m_ledgeclimb', 0.15, 2.3, {'endRest': True}),
            # the character select: a spell cast, arms wide
            'm_select': ('m_cast1', 0.0, 2.27, {}),
        },
    },
    # modelled on the Meshy website (high poly), decimated with a baked normal map (meshy_decimate.py), rigged with
    # `meshy.py rig --file`; then BIDO's and Skanky's clips are copied onto him from their packed models
    # (tools/art/model_clips.py: docs/NOUVEAU_PERSO.md); his own: the walk, the run and the library lots below
    'kerrian': {
        'height': 1.85,
        'files': {
            'basic_walking': ['walk'], 'basic_running': ['run'],
            # library lot (18 credits, 17 Oct 2026): right hook, left hook, knee, charged axe chop, over-the-shoulder
            # throw (the syringe dart), charged ground slam (the giant fork)
            'lotA': ['m_rhook', 'm_lhook', 'm_knee', 'm_axechop', 'm_dart', 'm_forkslam'],
        },
        'derive': {
            # the hollow dash (text to motion) flies flat like a superhero: stood up straight and stiff (tilt), in place
            # (the sim moves him up)
            'a_hdash': ('m_hdash', 0.0, 1.2, {'still': True, 'tilt': 0.1}),
        },
    },
}

FPS = 30


def sample_at(tr, t):
    times, vals = tr
    if len(times) < 2:
        return np.array(vals[0], float)
    return sample(tr, t, len(vals[0]) == 4)


def derive(tracks, t0, t1, opt, rest_hips):
    """a clip cut out of `tracks` between t0 and t1 (seconds), restarting at 0"""
    n = max(2, int(round((t1 - t0) * FPS)) + 1)
    ts = np.linspace(t0, t1, n)
    fade = min(0.35, (t1 - t0) * 0.3)
    out = {}
    for key, tr in tracks.items():
        node, path_ = key
        vals = []
        for t in ts:
            v = sample_at(tr, t)
            if opt.get('loop') and t > t1 - fade:
                # fade the last part into the frames before the start: the cycle closes without a jump
                k = (t - (t1 - fade)) / fade
                w = sample_at(tr, t0 - (t1 - t))
                if len(v) == 4:
                    if np.dot(v, w) < 0: w = -w
                    v = qnorm(v * (1 - k) + w * k)
                else:
                    v = v * (1 - k) + w * k
            vals.append(v)
        vals = np.array(vals)
        if path_ == 'translation' and opt.get('still') and rest_hips is not None:
            vals[:] = rest_hips
        # endRest: shifted up or down so that it ends at the rest height (a climb ends standing where the game puts
        # the fighter, it starts below: hanging from the ledge)
        if path_ == 'translation' and opt.get('endRest') and rest_hips is not None and len(vals):
            vals[:, 1] += rest_hips[1] - vals[-1, 1]
        out[key] = (ts - t0, vals)
    return out


def rebuild(j, bin_, replace):
    """a new binary buffer with some bufferViews replaced (images), every view re-packed in order"""
    out = bytearray()
    for i, v in enumerate(j['bufferViews']):
        while len(out) % 4:
            out.append(0)
        data = replace.get(i)
        if data is None:
            o = v.get('byteOffset', 0)
            data = bytes(bin_[o:o + v['byteLength']])
        v['byteOffset'] = len(out)
        v['byteLength'] = len(data)
        out.extend(data)
    return out


def shrink_textures(j, bin_, tex=None):
    tex = tex or TEX
    rep = {}
    for im in j.get('images', []):
        bv = im.get('bufferView')
        if bv is None:
            continue
        v = j['bufferViews'][bv]
        o = v.get('byteOffset', 0)
        pic = Image.open(io.BytesIO(bytes(bin_[o:o + v['byteLength']])))
        has_alpha = pic.mode in ('RGBA', 'LA') and pic.getchannel('A').getextrema()[0] < 250
        if max(pic.size) > tex:
            pic = pic.resize((tex, tex * pic.size[1] // pic.size[0]), Image.LANCZOS)
        b = io.BytesIO()
        if has_alpha:
            pic.save(b, 'PNG', optimize=True); im['mimeType'] = 'image/png'
        else:
            pic.convert('RGB').save(b, 'JPEG', quality=88); im['mimeType'] = 'image/jpeg'
        rep[bv] = b.getvalue()
    return rebuild(j, bin_, rep)


def world_rest(j):
    """rest world positions of the nodes (name -> vec3), in the scene root's space"""
    N = j['nodes']
    par = {}
    for i, n in enumerate(N):
        for c in n.get('children', []):
            par[c] = i
    W = {}

    def get(i):
        if i in W:
            return W[i]
        n = N[i]
        T = np.array(n.get('translation', [0, 0, 0]), float); R = np.array(n.get('rotation', [0, 0, 0, 1]), float); S = np.array(n.get('scale', [1, 1, 1]), float)
        if i in par:
            pT, pR, pS = get(par[i])
            W[i] = (pT + qrot(pR, T * pS), qmul(pR, R), pS * S)
        else:
            W[i] = (T, R, S)
        return W[i]
    return {N[i].get('name'): get(i)[0] for i in range(len(N))}


def facing(j):
    """yaw that turns the rig to face +Z (toes forward, its left on +X)"""
    W = world_rest(j)
    fwd = (W['toe.L'] - W['foot.L']) + (W['toe.R'] - W['foot.R'])
    left = W['thigh.L'] - W['thigh.R']
    a1 = math.atan2(fwd[0], fwd[2]); a2 = math.atan2(-left[2], left[0])
    return -math.atan2(math.sin(a1) + math.sin(a2), math.cos(a1) + math.cos(a2))


def clips_in(path, names, j_tgt):
    """the animations of a source file, mapped onto the target's nodes by bone name"""
    j, bin_ = read_glb(path)
    for n in j['nodes']:
        n['name'] = BONES.get(n.get('name'), n.get('name'))
    idx = {n.get('name'): i for i, n in enumerate(j_tgt['nodes'])}
    out = []
    for k, a in enumerate(j.get('animations', [])):
        nm = a.get('name') if names is None else (names[k] if k < len(names) else None)
        if not nm:
            continue
        tracks = {}
        for ch in a['channels']:
            node = j['nodes'][ch['target']['node']].get('name')
            path_ = ch['target']['path']
            # bones only: an animated Armature node would undo the facing and the scale set by pack()
            if node not in idx or node not in BONES.values() or path_ not in ('rotation', 'translation'):
                continue
            if path_ == 'translation' and node != 'hips':
                continue
            s = a['samplers'][ch['sampler']]
            tracks[(idx[node], path_)] = (accessor(j, bin_, s['input']), accessor(j, bin_, s['output']))
        out.append((nm, a.get('name'), tracks))
    return out


def pack(cid, list_only=False):
    C = CHARACTERS[cid]
    d = os.path.join(SRC, cid)
    j, bin_ = read_glb(os.path.join(d, 'rig.glb'))
    for n in j['nodes']:
        n['name'] = BONES.get(n.get('name'), n.get('name'))
    # sources: the named library batches and basic clips, then every text-to-motion clip (m_<file>)
    sources = []
    for f, names in C['files'].items():
        p = os.path.join(d, 'anims', f + '.glb') if os.path.exists(os.path.join(d, 'anims', f + '.glb')) else os.path.join(d, f + '.glb')
        if os.path.exists(p):
            sources.append((p, names))
    ad = os.path.join(d, 'anims')
    # clips moved over from another rig of the same character (tools/art/meshy_transfer.py --pack), already named
    if os.path.exists(os.path.join(ad, 'transferred.glb')):
        sources.append((os.path.join(ad, 'transferred.glb'), None))
    for f in sorted(os.listdir(ad)) if os.path.isdir(ad) else []:
        if f.endswith('.glb') and f[:-4] not in C['files'] and f != 'transferred.glb':
            sources.append((os.path.join(ad, f), ['m_' + f[:-4]]))
    clips = []
    for p, names in sources:
        got = clips_in(p, names, j)
        for nm, orig, tr in got:
            tmax = max(float(t[-1]) for t, _ in tr.values()) if tr else 0
            if list_only:
                print('%-18s <- %-28s %-34s %.2fs' % (nm, os.path.basename(p), orig, tmax))
            clips.append((nm, tr))
    if list_only:
        return
    # the clips cut out of longer takes (replacing a clip of the same name)
    hips_i = next(i for i, n in enumerate(j['nodes']) if n.get('name') == 'hips')
    rest_hips = np.array(j['nodes'][hips_i].get('translation', [0, 0, 0]), float)
    have = dict(clips)
    for nm, (src, t0, t1, o) in C.get('derive', {}).items():
        if src not in have:
            print('  derive %s: no clip %s' % (nm, src)); continue
        tr = derive(have[src], t0, t1, o, rest_hips)
        if o.get('tilt') is not None and (hips_i, 'rotation') in tr:
            # tilt: the hips' turn away from rest kept only by this fraction (a glide lying flat, stood up into a lean)
            rq = np.array(j['nodes'][hips_i].get('rotation', [0, 0, 0, 1]), float)
            t_, q_ = tr[(hips_i, 'rotation')]
            out_q = []
            for q in q_:
                d = qmul(q, qinv(rq))
                if d[3] < 0: d = -d
                ang = 2 * math.acos(min(1.0, d[3])); s_ = math.sin(ang / 2)
                ax = d[:3] / s_ if s_ > 1e-6 else np.array([1.0, 0, 0])
                a2 = ang * o['tilt'] / 2
                out_q.append(qnorm(qmul(np.array([*(ax * math.sin(a2)), math.cos(a2)]), rq)))
            tr[(hips_i, 'rotation')] = (t_, np.array(out_q))
        clips = [c for c in clips if c[0] != nm] + [(nm, tr)]
    # normalise like the Tripo characters: the armature turns the rig to +Z, scales it to its height
    yaw = facing(j)
    arm = next(i for i, n in enumerate(j['nodes']) if n.get('name') == 'Armature')
    pos = j['accessors'][j['meshes'][0]['primitives'][0]['attributes']['POSITION']]
    an = j['nodes'][arm]
    # the skin is in metres (mesh space, bound with the armature's original scale s0, the bones in cm under it):
    # scaling the armature by k scales the skinned body by k / s0
    s0 = np.array(an.get('scale', [1, 1, 1]), float)[0]
    raw_h = pos['max'][1] - pos['min'][1]
    s = C['height'] / raw_h * s0
    yq = qyaw(yaw)
    an['rotation'] = yq.tolist()
    an['scale'] = [s, s, s]
    an['translation'] = [0, 0, 0]
    W = world_rest(j)
    floor = pos['min'][1] * s / s0
    hx = W['hips']
    an['translation'] = [-hx[0], -floor, -hx[2]]
    # the clips: rotations as int16, the hips' translation in place (travel across the floor removed)
    j['animations'] = []
    hips = next(i for i, n in enumerate(j['nodes']) if n.get('name') == 'hips')
    for nm, tr in clips:
        a = {'name': nm, 'channels': [], 'samplers': []}
        for (node, path_), (t, v) in tr.items():
            ti = add_data(j, bin_, t, 'SCALAR', minmax=True)
            if path_ == 'rotation':
                q = np.array(v, float)
                for k in range(1, len(q)):
                    if np.dot(q[k], q[k - 1]) < 0: q[k] = -q[k]
                oi = add_quat(j, bin_, q)
            else:
                v = np.array(v, float).copy()
                if node == hips and len(v) > 1:
                    # in place: remove the straight-line travel along x and z (the sim moves the fighter)
                    f = (t - t[0]) / max(1e-6, t[-1] - t[0])
                    for k in (0, 2):
                        v[:, k] -= v[0, k] + (v[-1, k] - v[0, k]) * f
                        v[:, k] -= v[:, k].mean() * 0  # keep the bob around the start
                        v[:, k] += np.array(j['nodes'][hips].get('translation', [0, 0, 0]), float)[k]
                oi = add_data(j, bin_, v, 'VEC3')
            a['samplers'].append({'input': ti, 'output': oi, 'interpolation': 'LINEAR'})
            a['channels'].append({'sampler': len(a['samplers']) - 1, 'target': {'node': node, 'path': path_}})
        j['animations'].append(a)
    bin_ = shrink_textures(j, bin_)
    out = os.path.join(ROOT, 'assets', 'models', cid + '.glb')
    write_glb(out, j, bin_)
    print('%s: %d clips, height %.2f, facing %+.0f deg, %d KB' % (cid, len(clips), C['height'], math.degrees(yaw), os.path.getsize(out) // 1024))


def pack_prop(name, tex=512):
    """a prop made with Meshy (tools/art/meshy/<name>/model.glb) -> assets/models/props/<name>.glb, textures shrunk
    (propModels.js fits it onto the prop's shape)"""
    j, bin_ = read_glb(os.path.join(SRC, name, 'model.glb'))
    bin_ = shrink_textures(j, bin_, tex)
    out = os.path.join(ROOT, 'assets', 'models', 'props', name + '.glb')
    write_glb(out, j, bin_)
    print('prop %s: %d KB' % (name, os.path.getsize(out) // 1024))


if __name__ == '__main__':
    args = sys.argv[1:]
    if '--prop' in args:
        pack_prop(args[args.index('--prop') + 1]); sys.exit()
    for cid in [a for a in args if not a.startswith('--')]:
        pack(cid, '--list' in args)
