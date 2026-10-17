// Ronare's rig settings (src/sim/chars/ronare.js sets the flags): his gold bass for the smashes (the Flying V model of
// Epektase, assets/models/props/guitar.glb, gilded and its neck longer) in the right hand (F.va[0]); the down smash's
// headstand (F.va[1]: 0 standing .. 1 upside down, the whole body turned forward over its hips) with his head in a pint;
// the turntable under his feet (F.va[2]); the big record he rides cross-legged (F.va[3]); the jack's cable from his
// right hand to the plug (F.va[4] length, F.va[5] angle); a record in the hand before it is thrown (F.va[6]).
// Bones: the Meshy rig renamed by tools/art/meshy_pack.py.
import * as THREE from 'three';
import { mat, G, mesh, canvasTex } from '../materials.js';
import { fitProp } from '../propModels.js';
import { P, D, ROT, sym } from './library.js';

const grp = (...c) => { const g = new THREE.Group(); c.forEach((o) => o && g.add(o)); return g; };

// rest positions in character space (+X his left, +Y up, +Z forward), measured on assets/models/ronare.glb (T-pose)
const PALM_R = [-0.79, 1.36, -0.03];
const HEAD = [0.009, 1.7, -0.03];
const JACK_H = 1.3; // (src/sim/chars/ronare.js: where the jack leaves from)

// --- the bass: the guitar model, gilded, a longer neck ----------------------------------------------------------------
function bassShape() {
  const body = mat('#d9a63a', { roughness: 0.4 }), neck = mat('#2a1a12');
  return grp(mesh(G.box(0.45, 0.06, 0.42), body, [0, 0, 0.62]), mesh(G.box(0.07, 0.05, 0.62), neck, [0, 0, 0.12]));
}
function gold(o) {
  o.traverse((m) => {
    if (!m.isMesh) return;
    m.material = m.material.clone();
    m.material.map = null;
    m.material.color.set('#e2b03c');
    if ('metalness' in m.material) { m.material.metalness = 0.55; m.material.roughness = 0.3; }
    m.material.needsUpdate = true;
    m.castShadow = true;
  });
  return o;
}
function bass() {
  const inner = gold(fitProp('guitar', bassShape()));
  inner.scale.z *= 1.18; // (a bass: the neck longer than a guitar's)
  const g = grp(inner);
  g.visible = false;
  return g;
}

// --- the pint: a beer glass his head sits in, the foam on top -----------------------------------------------------------
function pint() {
  const glass = mesh(G.cyl(0.2, 0.17, 0.42, 20), new THREE.MeshStandardMaterial({ color: '#dff4ff', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0, depthWrite: false }), [0, 0.02, 0]);
  const beer = mesh(G.cyl(0.185, 0.16, 0.3, 20), new THREE.MeshStandardMaterial({ color: '#f0a020', transparent: true, opacity: 0.55, roughness: 0.15, emissive: '#7a4200', emissiveIntensity: 0.25, depthWrite: false }), [0, -0.03, 0]);
  const foam = mesh(G.cyl(0.2, 0.19, 0.1, 20), mat('#fff8e6', { roughness: 0.9 }), [0, 0.17, 0]);
  const bub = mesh(G.ball(0.08, 1), mat('#fff8e6', { roughness: 0.9 }), [0.06, 0.22, 0.03]);
  glass.renderOrder = beer.renderOrder = 2;
  const g = grp(beer, glass, foam, bub);
  g.visible = false;
  return g;
}

// --- a record: black grooves, a gold label ------------------------------------------------------------------------------
function recordTex() {
  return canvasTex('ronareVinyl', 128, (g, s) => {
    g.fillStyle = '#0d0d10'; g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, 6.29); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1;
    for (let r = 22; r < 62; r += 3) { g.beginPath(); g.arc(s / 2, s / 2, r, 0, 6.29); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 3;
    g.beginPath(); g.arc(s / 2, s / 2, 46, -0.7, 0.1); g.stroke(); // the light caught in the grooves
    g.fillStyle = '#e8b93a'; g.beginPath(); g.arc(s / 2, s / 2, 19, 0, 6.29); g.fill();
    g.fillStyle = '#b5322a'; g.fillRect(s / 2 - 12, s / 2 - 3, 24, 2);
    g.fillStyle = '#111'; g.beginPath(); g.arc(s / 2, s / 2, 3, 0, 6.29); g.fill();
  });
}
export function record(r, glow = 0) {
  const face = mat('#ffffff', { map: recordTex(), roughness: 0.3, emissive: '#ffffff', emissiveMap: recordTex(), emissiveIntensity: glow });
  const rim = mat('#141418', { roughness: 0.4 });
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.02, 32), [rim, face, face]);
}
function handRecord() { const g = grp(mesh(G.box(0.01, 0.01, 0.01), mat('#000'), [0, 0, 0])); const d = record(0.17); d.rotation.set(Math.PI / 2, 0, 0); d.position.set(-0.08, 0, 0.02); g.add(d); g.visible = false; return g; }

// --- the flying record (up special): under him, level -------------------------------------------------------------------
function seat() { const d = record(0.75, 0.15); const g = grp(d); g.userData.disc = d; g.visible = false; return g; }

// --- the turntable: a deck under his feet, the platter spinning, the arm on the record -----------------------------------
function turntable() {
  const base = mesh(G.box(1.25, 0.1, 0.95), mat('#1d1d24', { roughness: 0.5, metalness: 0.3 }), [0, 0.05, 0]);
  const plate = mesh(G.cyl(0.43, 0.43, 0.03, 32), mat('#9aa0aa', { metalness: 0.7, roughness: 0.3 }), [-0.12, 0.115, 0]);
  const disc = record(0.41, 0.2); disc.position.set(-0.12, 0.14, 0);
  const arm = grp(mesh(G.cyl(0.05, 0.05, 0.06, 10), mat('#c8ccd4', { metalness: 0.8 }), [0, 0.13, 0]),
    mesh(G.box(0.03, 0.03, 0.5), mat('#c8ccd4', { metalness: 0.8 }), [0, 0.17, -0.24], [0, 0.0, 0]));
  arm.position.set(0.42, 0, 0.32); arm.rotation.y = 0.5;
  const led = mesh(G.box(0.12, 0.02, 0.05), new THREE.MeshBasicMaterial({ color: '#ff3b6a' }), [0.45, 0.105, -0.35]);
  const g = grp(base, plate, disc, arm, led);
  g.userData.disc = disc;
  g.visible = false;
  return g;
}

// --- the jack's cable: a black cord from the hand to the gold plug ---------------------------------------------------
function jack() {
  const cord = mesh(G.cyl(0.022, 0.022, 1, 6), mat('#121214', { roughness: 0.6 }));
  const plug = grp(mesh(G.cyl(0.045, 0.045, 0.16, 10), mat('#e2b03c', { metalness: 0.8, roughness: 0.25 }), [0, 0.08, 0]),
    mesh(G.cyl(0.018, 0.018, 0.14, 8), mat('#e8e8ee', { metalness: 0.9, roughness: 0.2 }), [0, 0.23, 0]),
    mesh(G.ball(0.02, 1), mat('#e8e8ee', { metalness: 0.9 }), [0, 0.3, 0]));
  const g = grp(cord, plug);
  g.userData = { cord, plug };
  g.visible = false;
  return g;
}

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _m = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const inMove = (F) => F.state === 'move';
// turn a bone (after the animation) so that it points from itself toward `target` (world), its child giving its axis
const _t = new THREE.Vector3(), _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _v0 = new THREE.Vector3(), _v1 = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
function aim(bone, child, target) {
  bone.updateWorldMatrix(true, true);
  bone.getWorldPosition(_p0); child.getWorldPosition(_p1);
  _v0.subVectors(_p1, _p0).normalize(); _v1.subVectors(target, _p0).normalize();
  _qa.setFromUnitVectors(_v0, _v1);
  bone.getWorldQuaternion(_qb);
  _qb.premultiply(_qa);
  bone.parent.getWorldQuaternion(_qa);
  bone.quaternion.copy(_qa.invert().multiply(_qb));
  bone.updateWorldMatrix(false, true);
}

export const RONARE_RIG = {
  ronare: {
    h: 1.85, guard: 'boxer', crouch: 0.04, wide: 0.05, lean: 4, stride: 1.0,
    reach: {
      weapon: 'bass', weaponHand: 'hand.R', far: 0.85,
      moves: { jab1: 'hand.L', jab2: 'hand.R', jab3: 'hand.L', ftilt: true, ftilt2: true, ftilt3: true, dtilt: true, fair: true, bair: true, dair: true, ledgeattack: true,
        smash: 'weapon', usmash: 'weapon', dsmash: false },
    },
    sockets: {
      bass: { bone: 'hand.R', at: PALM_R, build: bass },
      pint: { bone: 'head', at: HEAD, build: pint },
      record: { bone: 'hand.R', at: PALM_R, build: handRecord },
      seat: { bone: 'hips', at: [0, 0.9, 0.05], build: seat },
    },
    moves: {
      // the headstand: the arms up past the head (the hands on the floor once he is upside down), the legs together
      pint: {
        wind: P({ ...sym({ upperarm: D(0.75, 0.45, 0.35), forearm: D(0.25, 1, 0.2), thigh: D(0.06, -1, 0.1), shin: D(0, -1, -0.15) }), spine: ROT(12, 0, 0), head: ROT(20, 0, 0) },
          { hips: { pos: [0, -0.12, 0], scl: [1.04, 0.96, 1.04] } }),
        hit: P({ ...sym({ upperarm: D(0.8, 0.5, 0.2), forearm: D(0.2, 1, 0.1), thigh: D(0.04, -1, -0.05), shin: D(0, -1, 0.05) }), spine: ROT(-4, 0, 0), head: ROT(10, 0, 0) }),
      },
    },
    update(V, F, o, t) {
      const S = V.sockets, R = V.root, M = inMove(F);
      const bs = S.bass && S.bass.obj;
      if (bs) {
        bs.visible = M && (F.va[0] || 0) > 0.5;
        // in line with the forearm (the clips come from Epektase's skeleton: the wrists do not turn the same way),
        // its face toward the camera: the bass is the arm's extension through the whole swing
        const fa = V.rig && V.rig.bones && V.rig.bones['forearm.R'], hd = V.rig && V.rig.bones && V.rig.bones['hand.R'];
        if (bs.visible && fa && hd) {
          fa.getWorldPosition(_a); hd.getWorldPosition(_b);
          _d.subVectors(_b, _a).normalize();
          _y.set(0, 0, 1).addScaledVector(_d, -_d.z).normalize();
          _x.crossVectors(_y, _d);
          _m.makeBasis(_x, _y, _d);
          _q.setFromRotationMatrix(_m);
          bs.parent.getWorldQuaternion(_q2);
          bs.quaternion.copy(_q2.invert().multiply(_q));
        }
      }
      if (S.record && S.record.obj) S.record.obj.visible = M && (F.va[6] || 0) > 0.5;
      // the headstand: turned forward over the hips, the head down to the floor; his head in a pint the whole time
      const inv = M ? F.va[1] || 0 : 0;
      if (S.pint && S.pint.obj) { S.pint.obj.visible = inv > 0.02; S.pint.obj.scale.setScalar(Math.min(1, inv * 3)); }
      if (inv > 0) {
        // pivot: the hips (c up); at PI the head is on the floor. The pivot stays put: the root goes up and back
        const c = 0.95, th = inv * Math.PI, back = -c * Math.sin(th);
        R.position.x += Math.sin(F.facing) * back; R.position.z += Math.cos(F.facing) * back;
        R.position.y += c - c * Math.cos(th);
        R.rotateX(th);
      }
      // the turntable under his feet (on the root: it stays flat on the floor)
      const tv = M ? F.va[2] || 0 : 0;
      let tt = V.model.ronareTT;
      if (!tt && tv > 0) { tt = V.model.ronareTT = turntable(); R.add(tt); }
      if (tt) {
        tt.visible = tv > 0.01;
        if (tt.visible) {
          const k = Math.min(1, tv * 1.4);
          R.position.y += 0.15 * k; // (standing on it: the deck is 15 cm tall)
          tt.position.set(0, (1 - k) * 0.3 - 0.15 * k, 0.05);
          tt.scale.set(k, k, k);
          tt.userData.disc.rotation.y = -t * 3.6 * 2 * Math.PI / 6; // 33 turns a minute, roughly
        }
      }
      // the flying record: level under him whatever his hips do, a slow spin, a little sway
      const sv = M ? F.va[3] || 0 : 0;
      const sd = S.seat && S.seat.obj;
      if (sd) {
        sd.visible = sv > 0.02;
        if (sd.visible) {
          sd.parent.getWorldQuaternion(_q); R.getWorldQuaternion(_q2);
          sd.quaternion.copy(_q.invert().multiply(_q2));
          sd.rotateZ(Math.sin(t * 5) * 0.06); sd.rotateX(Math.sin(t * 3.3) * 0.05);
          sd.userData.disc.rotation.y = t * 4;
          sd.scale.setScalar(Math.min(1, sv * 1.6));
        }
      }
      // the jack: a straight cord from the right hand to the plug (pulled tight)
      const jl = M ? F.va[4] || 0 : 0;
      let jk = V.model.ronareJack;
      if (!jk && jl > 0) { jk = V.model.ronareJack = jack(); R.parent ? R.parent.add(jk) : R.add(jk); }
      if (jk) {
        jk.visible = jl > 0.05;
        if (jk.visible) {
          const B = V.rig && V.rig.bones;
          // the arm held out toward the plug (the throw's clip leaves it by his side)
          if (B && B['upperarm.R'] && B['forearm.R'] && B['hand.R']) {
            const ang = F.va[5] || 0, fx = Math.sin(F.facing);
            _t.set(R.position.x + fx * Math.cos(ang) * (0.3 + jl), R.position.y + JACK_H + Math.sin(ang) * (0.3 + jl), R.position.z);
            aim(B['upperarm.R'], B['forearm.R'], _t);
            aim(B['forearm.R'], B['hand.R'], _t);
          }
          const hand = B && B['hand.R'];
          if (hand) hand.getWorldPosition(_a); else _a.set(R.position.x, R.position.y + JACK_H, R.position.z);
          const ang = F.va[5] || 0, fx = Math.sin(F.facing);
          _b.set(R.position.x + fx * Math.cos(ang) * (0.3 + jl), R.position.y + JACK_H + Math.sin(ang) * (0.3 + jl), R.position.z);
          const { cord, plug } = jk.userData;
          _d.subVectors(_b, _a); const len = Math.max(0.01, _d.length());
          cord.position.copy(_a).addScaledVector(_d, 0.5);
          cord.quaternion.setFromUnitVectors(_up, _d.normalize());
          cord.scale.set(1, len, 1);
          plug.position.copy(_b);
          plug.quaternion.copy(cord.quaternion);
        }
      }
    },
  },
};

// --- his projectile (merged into entityView's BUILD): the record thrown ------------------------------------------------
export const RONARE_BUILD = {
  vinyl: () => { const d = record(0.36, 0.25); const g = grp(d); g.userData.disc = d; return g; },
};
