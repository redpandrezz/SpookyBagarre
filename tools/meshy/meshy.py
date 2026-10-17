"""Small Meshy API client (meshy.ai, the creator's Ultra plan): models, rigs, animations for SpookyBagarre.
The key is read from the Windows user variable MESHY_API_KEY (never written in the project). Before every paid task
the balance is read and the task refused if it would go under the floor; every task is written to
tools/meshy/ledger.jsonl (not published). A failed task is never retried automatically.

  python tools/meshy/meshy.py balance
  python tools/meshy/meshy.py library [--search kick] [--category Fighting]     (free: the animation library, json)
  python tools/meshy/meshy.py model <id> <image> [--polys 30000] [--tex 2k] [--pose none]   (image to 3D, about 30 credits; a prop: --pose none)
  python tools/meshy/meshy.py multi <id> <front.png,back.png> [--polys 30000]       (several views to 3D, already posed)
  python tools/meshy/meshy.py rig <id> [--height 1.8] [--file model.glb]           (5 credits; --file: a local model)
  python tools/meshy/meshy.py anim <id> <name> <action_id> [<action_id> ...]      (3 credits per action)
  python tools/meshy/meshy.py motion <id> <name> <seconds> "<prompt>"             (text to motion 10 + animation)
Files go to tools/art/meshy/<id>/ (state.json keeps the task ids).
"""
import base64
import json
import os
import sys
import time
import urllib.request

API = 'https://api.meshy.ai/openapi/v1'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LEDGER = os.path.join(ROOT, 'tools', 'meshy', 'ledger.jsonl')
OUT = os.path.join(ROOT, 'tools', 'art', 'meshy')
FLOOR = 300  # never go under this many credits


def key():
    k = os.environ.get('MESHY_API_KEY')
    if not k and os.name == 'nt':
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, 'Environment') as h:
                k = winreg.QueryValueEx(h, 'MESHY_API_KEY')[0]
        except OSError:
            k = None
    if not k:
        sys.exit('MESHY_API_KEY is not set')
    return k


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={'Authorization': 'Bearer ' + key(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        sys.exit('Meshy %s %s: %s %s' % (method, path, e.code, e.read()[:400]))


def balance():
    return call('GET', '/balance').get('balance', 0)


def guard(cost, what):
    b = balance()
    if b - cost < FLOOR:
        sys.exit('refused: %s needs ~%d credits, balance %d, floor %d' % (what, cost, b, FLOOR))
    return b


def log(entry):
    os.makedirs(os.path.dirname(LEDGER), exist_ok=True)
    entry = {'time': time.strftime('%Y-%m-%dT%H:%M:%S'), **entry}
    with open(LEDGER, 'a', encoding='utf-8') as f:
        f.write(json.dumps(entry, ensure_ascii=False) + '\n')
    print('ledger:', json.dumps(entry, ensure_ascii=False))


def wait(kind, tid, every=8):
    while True:
        t = call('GET', '/%s/%s' % (kind, tid))
        st = t.get('status')
        print('  %s %s %s%%' % (kind, st, t.get('progress', '')), flush=True)
        if st in ('SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED'):
            return t
        time.sleep(every)


def fetch(url, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with urllib.request.urlopen(url, timeout=300) as r, open(path, 'wb') as f:
        f.write(r.read())
    print('  saved', os.path.relpath(path, ROOT), os.path.getsize(path) // 1024, 'KB')


def state(cid, **upd):
    p = os.path.join(OUT, cid, 'state.json')
    s = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
    if upd:
        s.update(upd)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        json.dump(s, open(p, 'w', encoding='utf-8'), indent=1)
    return s


def opt(args, name, default):
    return args[args.index(name) + 1] if name in args else default


def data_uri(path):
    ext = os.path.splitext(path)[1].lower().lstrip('.')
    mime = {'jpg': 'jpeg', 'jpeg': 'jpeg', 'png': 'png', 'webp': 'webp'}[ext]
    return 'data:image/%s;base64,%s' % (mime, base64.b64encode(open(path, 'rb').read()).decode())


def cmd_model(cid, image, args):
    polys = int(opt(args, '--polys', 30000))
    tex = opt(args, '--tex', '2k')
    b = guard(40, 'model ' + cid)
    # meshy-7.1 with its image enhancement turned a single T-pose picture into FOUR characters (a turnaround sheet in
    # 3D, 14 Oct 2026): meshy-6 and no enhancement by default; check the result with `check` before rigging it
    body = {'image_url': data_uri(image), 'ai_model': opt(args, '--ai', 'meshy-6'), 'should_texture': True, 'enable_pbr': False,
            'should_remesh': True, 'topology': 'triangle', 'target_polycount': polys, 'pose_mode': opt(args, '--pose', 't-pose'),
            'texture_resolution': tex, 'target_formats': ['glb'], 'remove_lighting': True, 'image_enhancement': '--enhance' in args}
    if body['pose_mode'] == 'none':  # a prop: no pose to force
        del body['pose_mode']
    tid = call('POST', '/image-to-3d', body)['result']
    log({'id': cid, 'kind': 'image-to-3d', 'task': tid, 'balance_before': b, 'polys': polys, 'tex': tex})
    t = wait('image-to-3d', tid)
    log({'id': cid, 'kind': 'image-to-3d', 'task': tid, 'status': t['status'], 'consumed': t.get('consumed_credits')})
    if t['status'] != 'SUCCEEDED':
        sys.exit('failed: %s' % t.get('task_error'))
    d = os.path.join(OUT, cid)
    fetch(t['model_urls']['glb'], os.path.join(d, 'model.glb'))
    if t.get('thumbnail_url'): fetch(t['thumbnail_url'], os.path.join(d, 'model.png'))
    state(cid, model_task=tid)


def cmd_multi(cid, images, args):
    """several views of the same character (front, back...: comma separated) -> one model, same settings as `model`;
    the views are expected already in the wanted pose (no pose_mode)"""
    polys = int(opt(args, '--polys', 30000))
    b = guard(40, 'multi ' + cid)
    body = {'image_urls': [data_uri(p) for p in images.split(',')], 'ai_model': opt(args, '--ai', 'meshy-6'),
            'should_texture': True, 'enable_pbr': False, 'should_remesh': True, 'topology': 'triangle',
            'target_polycount': polys, 'symmetry_mode': 'auto'}
    tid = call('POST', '/multi-image-to-3d', body)['result']
    log({'id': cid, 'kind': 'multi-image-to-3d', 'task': tid, 'balance_before': b, 'polys': polys, 'images': images})
    t = wait('multi-image-to-3d', tid)
    log({'id': cid, 'kind': 'multi-image-to-3d', 'task': tid, 'status': t['status'], 'consumed': t.get('consumed_credits')})
    if t['status'] != 'SUCCEEDED':
        sys.exit('failed: %s' % t.get('task_error'))
    d = os.path.join(OUT, cid)
    fetch(t['model_urls']['glb'], os.path.join(d, 'model.glb'))
    if t.get('thumbnail_url'): fetch(t['thumbnail_url'], os.path.join(d, 'model.png'))
    state(cid, model_task=tid)


def bounds(path):
    import struct
    b = open(path, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    lo, hi = [1e9] * 3, [-1e9] * 3
    for m in j['meshes']:
        for p in m['primitives']:
            a = j['accessors'][p['attributes']['POSITION']]
            lo = [min(x, y) for x, y in zip(lo, a['min'])]; hi = [max(x, y) for x, y in zip(hi, a['max'])]
    return [h - l for h, l in zip(hi, lo)]


def check_single(cid):
    """one standing character: its depth is far smaller than its height (four copies side by side were 1.26 deep)"""
    w, h, d = bounds(os.path.join(OUT, cid, 'model.glb'))
    ok = h > 0 and d / h < 0.45 and w / h < 1.35
    print('model %s: width %.2f height %.2f depth %.2f -> %s' % (cid, w, h, d, 'one character' if ok else 'NOT ONE CHARACTER'))
    return ok


def cmd_rig(cid, args):
    s = state(cid)
    src = opt(args, '--file', None)  # a model made elsewhere (the Meshy website, decimated by meshy_decimate.py)
    if src:
        dst = os.path.join(OUT, cid, 'model.glb')
        if os.path.abspath(src) != os.path.abspath(dst):
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            open(dst, 'wb').write(open(src, 'rb').read())
    if not check_single(cid) and '--force' not in args:
        sys.exit('refused: the model does not look like one character (tools/art/meshy/%s/model.png)' % cid)
    b = guard(5, 'rig ' + cid)
    body = {'height_meters': float(opt(args, '--height', 1.8))}
    if src:
        body['model_url'] = 'data:application/octet-stream;base64,' + base64.b64encode(open(src, 'rb').read()).decode()
    else:
        body['input_task_id'] = s['model_task']
    tid = call('POST', '/rigging', body)['result']
    log({'id': cid, 'kind': 'rigging', 'task': tid, 'balance_before': b})
    t = wait('rigging', tid)
    log({'id': cid, 'kind': 'rigging', 'task': tid, 'status': t['status'], 'consumed': t.get('consumed_credits')})
    if t['status'] != 'SUCCEEDED':
        sys.exit('failed: %s' % t.get('task_error'))
    r = t['result']
    d = os.path.join(OUT, cid)
    fetch(r['rigged_character_glb_url'], os.path.join(d, 'rig.glb'))
    for name, urls in (r.get('basic_animations') or {}).items():
        u = urls.get('glb') if isinstance(urls, dict) else None
        u = u or (r['basic_animations'].get(name + '_glb_url') if isinstance(r['basic_animations'], dict) else None)
    # the basic walking / running clips (field names vary: take every *glb* url that is not the armature only)
    for k, v in (r.get('basic_animations') or {}).items():
        if isinstance(v, str) and v.startswith('http') and 'glb' in k and 'armature' not in k:
            fetch(v, os.path.join(d, 'basic_%s.glb' % k.replace('_glb_url', '')))
    state(cid, rig_task=tid)


def cmd_anim(cid, name, ids):
    s = state(cid)
    ids = [int(x) for x in ids]
    b = guard(3 * len(ids), 'anim %s %s' % (cid, name))
    body = {'rig_task_id': s['rig_task'], 'post_process': {'operation_type': 'change_fps', 'fps': 30}}
    if len(ids) == 1: body['action_id'] = ids[0]
    else: body['action_ids'] = ids
    tid = call('POST', '/animations', body)['result']
    log({'id': cid, 'kind': 'animation', 'name': name, 'actions': ids, 'task': tid, 'balance_before': b})
    t = wait('animations', tid, 5)
    log({'id': cid, 'kind': 'animation', 'name': name, 'task': tid, 'status': t['status'], 'consumed': t.get('consumed_credits')})
    if t['status'] != 'SUCCEEDED':
        sys.exit('failed: %s' % t.get('task_error'))
    fetch(t['result']['animation_glb_url'], os.path.join(OUT, cid, 'anims', name + '.glb'))
    anims = s.get('anims', {}); anims[name] = {'task': tid, 'actions': ids}
    state(cid, anims=anims)


def cmd_motion(cid, name, secs, prompt):
    s = state(cid)
    b = guard(13, 'motion %s %s' % (cid, name))
    tid = call('POST', '/text-to-motion', {'prompt': prompt, 'mode': 'prime', 'duration': float(secs)})['result']
    log({'id': cid, 'kind': 'text-to-motion', 'name': name, 'task': tid, 'prompt': prompt, 'secs': secs, 'balance_before': b})
    t = wait('text-to-motion', tid, 6)
    log({'id': cid, 'kind': 'text-to-motion', 'name': name, 'task': tid, 'status': t['status'], 'consumed': t.get('consumed_credits')})
    if t['status'] != 'SUCCEEDED':
        sys.exit('failed: %s' % t.get('task_error'))
    body = {'rig_task_id': s['rig_task'], 'motion_task_id': tid, 'post_process': {'operation_type': 'change_fps', 'fps': 30}}
    aid = call('POST', '/animations', body)['result']
    log({'id': cid, 'kind': 'animation', 'name': name, 'motion': tid, 'task': aid})
    a = wait('animations', aid, 5)
    log({'id': cid, 'kind': 'animation', 'name': name, 'task': aid, 'status': a['status'], 'consumed': a.get('consumed_credits')})
    if a['status'] != 'SUCCEEDED':
        sys.exit('failed: %s' % a.get('task_error'))
    fetch(a['result']['animation_glb_url'], os.path.join(OUT, cid, 'anims', name + '.glb'))
    mot = s.get('motions', {}); mot[name] = {'motion': tid, 'task': aid, 'prompt': prompt, 'secs': secs}
    state(cid, motions=mot)


def main(a):
    if not a or a[0] == 'balance':
        print('balance', call('GET', '/balance')); return
    c = a[0]
    if c == 'library':
        q = []
        for f in ('search', 'category', 'sub_category'):
            v = opt(a, '--' + f, None)
            if v: q.append('%s=%s' % (f, urllib.parse.quote(v)))
        res = call('GET', '/animations/library' + ('?' + '&'.join(q) if q else ''))
        out = os.path.join(OUT, 'library.json')
        os.makedirs(OUT, exist_ok=True)
        json.dump(res, open(out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
        items = res if isinstance(res, list) else res.get('result') or res.get('data') or res.get('items') or []
        print(len(items), 'actions ->', os.path.relpath(out, ROOT))
        return
    if c == 'model': cmd_model(a[1], a[2], a[3:])
    elif c == 'multi': cmd_multi(a[1], a[2], a[3:])
    elif c == 'rig': cmd_rig(a[1], a[2:])
    elif c == 'anim': cmd_anim(a[1], a[2], a[3:])
    elif c == 'motion': cmd_motion(a[1], a[2], a[3], a[4])
    else: sys.exit(__doc__)


if __name__ == '__main__':
    import urllib.parse
    main(sys.argv[1:])
