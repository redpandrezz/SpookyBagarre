// Rig settings of the seven friends (Aboueb, Tices, OMFU, Lolobiscotto, J'san, Nymano, BIDO): stance, and the props
// their moves bring out. Each prop sits on a socket and is shown while its F.va[] flag is up during a move
// (the flags are set by src/sim/chars/<id>.js).
import * as THREE from 'three';
import { mat, G, mesh } from '../materials.js';
import { ROT } from './library.js';
import { FRIEND_PROPS, FRIEND_BODY } from '../friendsView.js';
import { greyHeld } from '../entityView.js';
import { PASS_PROPS } from '../passView.js';
import { pieceSetup } from './capHide.js';
import { streamObj } from '../fxShaders.js';

const grp = (...c) => { const g = new THREE.Group(); c.forEach((o) => o && g.add(o)); return g; };
const hidden = (o) => { o.visible = false; return o; };

// the middle of the right hand (character space: +X left, +Y up, +Z forward), measured on the rigs
const HAND = {
  aboueb: [-0.505, 0.755, 0.055], tices: [-0.49, 0.83, 0.055], omfu: [-0.5, 0.76, 0.055], lolobiscotto: [-0.475, 0.775, 0.055],
  jsan: [-0.51, 0.8, 0.055], nymano: [-0.5, 0.725, 0.055], bido: [-0.55, 0.805, 0.055],
  kerrian: [-0.64, 1.35, -0.02], // Meshy rig, in T-pose at rest
};
const left = (p) => [-p[0], p[1], p[2]];
const inHand = (id, build, side = 'R') => ({ bone: 'hand.' + side, at: side === 'R' ? HAND[id] : left(HAND[id]), build: () => hidden(build()) });
const onBone = (bone, at, build) => ({ bone, at, build: () => hidden(build()) });

// a prop is out while the move runs and its flag is up
const out = (F, i) => F.state === 'move' && (F.va[i] || 0) > 0.02;
// Lolobiscotto empties the Ricard (down special): a stream of pastis from the neck of the bottle to the puddle
const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _bx = new THREE.Box3();
function pourStream(V, F, t) {
  let st = V.model._stream;
  const on = F.state === 'move' && F.move === 'sp_d' && F.mf >= 8 && F.mf <= 27;
  if (!st && !on) return;
  if (!st) { st = V.model._stream = streamObj('#e8d27a', { r: 0.045, op: 0.9 }); (V.root.parent || V.root).add(st); }
  st.visible = on;
  const b = V.sockets.ricard && V.sockets.ricard.obj;
  if (!on || !b) { st.visible = false; return; }
  const U = st.material.uniforms;
  b.updateWorldMatrix(true, true);
  _bx.setFromObject(b); _bx.getCenter(_sa); _sa.y = _bx.max.y - 0.02; // the neck: the top of the bottle
  const fx = Math.sin(F.facing);
  _sb.set(V.root.position.x + fx * 1.25, V.root.position.y + 0.04, V.root.position.z);
  U.uA.value.copy(_sa);
  U.uB.value.copy(_sb);
  U.uK.value.set(_sa.x + fx * 0.6, _sa.y + 0.22, _sa.z);
  U.uTime.value = t;
  // it reaches the floor in a few frames, and thins out to nothing at the end
  U.uEnd.value = Math.min(1, (F.mf - 7) / 4);
  U.uR.value = 0.045 * Math.min(1, (28 - F.mf) / 5);
}

function show(V, F, map) {
  for (const [name, i] of Object.entries(map)) {
    const s = V.sockets[name];
    if (s && s.obj) s.obj.visible = typeof i === 'function' ? i(F) : out(F, i);
  }
}

// keep a prop under the feet whatever the hips do (the sockets follow the hips)
const tmp = new THREE.Vector3();
function toFloor(V, o, lift = 0) {
  o.position.set(0, 0, 0);
  o.getWorldPosition(tmp);
  tmp.set(V.root.position.x, V.root.position.y + lift, V.root.position.z);
  o.parent.worldToLocal(tmp);
  o.position.copy(tmp);
}

// BIDO's jump rope (side special): a beaded rope cracked like a whip, from his hand to the point the simulation
// hits with (1.25 m up, 0.35 + len in front: src/sim/chars/bido.js)
const rA = new THREE.Vector3(), rB = new THREE.Vector3(), rC = new THREE.Vector3(), rD = new THREE.Vector3(), rX = new THREE.Vector3(0, 0, 1); // (the barbell lies along Z in its socket)
function ropeObj() {
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  g.add(pivot);
  const m = mat('#f4f0e8', { roughness: 0.6 }), m2 = mat('#e83a5a', { roughness: 0.6 });
  const balls = [];
  for (let i = 0; i < 30; i++) { const b = mesh(G.ball(0.03, 0), i % 3 ? m : m2); pivot.add(b); balls.push(b); }
  const handle = mesh(G.cyl(0.035, 0.035, 0.2, 6), m2, [0, 0, 0], [Math.PI / 2, 0, 0]);
  g.add(handle);
  g.userData = { pivot, balls };
  g.visible = false;
  return g;
}
function layRope(V, o, F, len, t) {
  const { pivot, balls } = o.userData;
  const R = V.root, fx = Math.sin(F.facing), fz = Math.cos(F.facing);
  o.getWorldPosition(rA);
  rB.set(R.position.x + fx * (0.35 + len), R.position.y + 1.25, R.position.z + fz * (0.35 + len));
  const lash = Math.max(0, 1 - len / 2.0);
  rC.copy(rA).lerp(rB, 0.5); rC.y += 0.3 * lash - 0.12 * (1 - lash);
  pivot.rotation.set(0, 0, 0); pivot.updateMatrixWorld(true);
  const n = balls.length;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1), u = 1 - k;
    rD.set(u * u * rA.x + 2 * u * k * rC.x + k * k * rB.x, u * u * rA.y + 2 * u * k * rC.y + k * k * rB.y, u * u * rA.z + 2 * u * k * rC.z + k * k * rB.z);
    rD.y += Math.sin(k * 8 + t * 30) * 0.02 * lash;
    pivot.worldToLocal(rD);
    balls[i].position.copy(rD);
  }
}

// OMFU's heap of earth (down special): a low mound with clods, around where his head sticks out
function moundObj() {
  const dirt = mat('#5a3e26', { roughness: 1 }), dark = mat('#3e2a18', { roughness: 1 });
  const g = grp(mesh(new THREE.SphereGeometry(0.62, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), dirt, [0, -0.05, 0], null, [1.25, 0.42, 0.9]));
  for (let i = 0; i < 9; i++) { const a = i * 0.7; g.add(mesh(G.ball(0.07 + (i % 3) * 0.03, 0), i % 2 ? dark : dirt, [Math.cos(a) * (0.55 + (i % 2) * 0.2), 0.05, Math.sin(a) * 0.45])); }
  return g;
}

// Tices' cap on the model's texture: the beige crown, the dark brown brim (measured, 16 Oct 2026)
const ticesBeige = (c) => c[0] >= 120 && c[1] >= 95 && c[2] >= 60 && c[0] - c[2] > 30;
const ticesBrim = (c) => c[0] >= 50 && c[0] <= 120 && c[0] > c[2] + 12 && c[1] < c[0];

// Aboueb's magic reflector (neutral special held): a hexagonal shell of energy around him, its edges lit
// (a faceted bubble: hexagons and triangles of light, like Fox's)
function reflectorObj() {
  const geo = new THREE.IcosahedronGeometry(1.2, 1);
  const shell = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#4fd8ff', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 1), new THREE.LineBasicMaterial({ color: '#d8fbff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  const g = grp(shell, edges);
  g.scale.set(1, 1.12, 1);
  return g;
}

// Aboueb's curls: a rope of curls out of the back of his head, as long as F.va[0] (metres)
function hairRope() {
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  g.add(pivot);
  const m = mat('#3a2412', { roughness: 0.9 }), m2 = mat('#4e3018', { roughness: 0.9 });
  const balls = [];
  for (let i = 0; i < 26; i++) { const b = mesh(G.ball(0.13, 1), i % 2 ? m : m2); pivot.add(b); balls.push(b); }
  g.userData = { pivot, balls };
  g.visible = false;
  return g;
}
// laid in the world, from the back of his head to the point the simulation hits with (src/sim/chars/aboueb.js:
// HAIR_H metres up, 0.35 + len away along the angle ang: 0 forward, PI/2 up, -PI/2 down, PI behind; on the plane
// of the fight, where the hitboxes are), along a whip curve: the middle trails behind while it shoots out, then
// straightens. sweep: the nair spins it around him at the height of its hitboxes; floor (+1 / -1): the down smash
// pours it onto the floor in front / behind
const HAIR_H = 1.45;
const hA = new THREE.Vector3(), hB = new THREE.Vector3(), hC = new THREE.Vector3(), hP = new THREE.Vector3(), hS = new THREE.Vector3();
function layHair(V, o, len, t, sweep, F, ang = 0, floor = 0) {
  const { pivot, balls } = o.userData;
  const n = balls.length;
  const R = V.root, yaw = R.rotation.y;
  const fx = Math.sin(F.facing), fz = Math.cos(F.facing); // the fight's facing (not the model's three-quarter turn)
  o.parent.getWorldPosition(hA); // the back of the head
  const L = 0.35 + len;
  let dc = Math.cos(ang), ds = Math.sin(ang);
  if (floor) hB.set(R.position.x + fx * floor * L, R.position.y + 0.3, R.position.z + fz * floor * L);
  else if (sweep !== null) {
    const a = yaw + sweep;
    hB.set(R.position.x + Math.sin(a) * L, R.position.y + 0.75, R.position.z + Math.cos(a) * L);
    dc = 1; ds = 0;
  } else hB.set(R.position.x + fx * dc * L, R.position.y + HAIR_H + ds * L, R.position.z + fz * dc * L);
  // the whip: a control point off the middle, across the rope (behind it in its swing) and pulled back a little
  // (less as it straightens)
  const lash = Math.max(0, 1 - len / 3.5);
  hC.copy(hA).lerp(hB, 0.45);
  const px = -fx * ds, py = dc, pz = -fz * ds; // across the rope, in the plane of the fight
  const k1 = 0.35 * lash + 0.12, k2 = 0.4 * lash;
  hC.x += px * k1 - fx * dc * k2; hC.y += py * k1 - ds * k2; hC.z += pz * k1 - fz * dc * k2;
  if (floor) hC.y = Math.max(R.position.y + 0.25, hC.y - 0.4); // poured down: it sags to the floor
  pivot.rotation.set(0, 0, 0);
  pivot.updateMatrixWorld(true);
  pivot.getWorldScale(hS);
  const sc = 1 / Math.max(1e-3, hS.x);
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1), u = 1 - k;
    // quadratic Bézier head -> control -> tip, the curls wobbling around it
    hP.set(u * u * hA.x + 2 * u * k * hC.x + k * k * hB.x, u * u * hA.y + 2 * u * k * hC.y + k * k * hB.y, u * u * hA.z + 2 * u * k * hC.z + k * k * hB.z);
    hP.x += Math.sin(k * 9 + t * 20) * 0.04; hP.y += Math.cos(k * 7 + t * 16) * 0.04;
    pivot.worldToLocal(hP);
    balls[i].position.copy(hP);
    balls[i].scale.setScalar((0.85 - k * 0.4) * sc);
  }
}

export const FRIEND_RIGS = {
  aboueb: {
    h: 1.85, guard: 'boxer', crouch: 0.04, wide: 0.03, lean: 4, stride: 1.05,
    // his curls hit, not his hands: no limb stretched into those hitboxes (rig/reach.js)
    reach: { far: 0.85, moves: { jab1: false, jab2: false, jab3: false, ftilt: false, utilt: false, dtilt: false, smash: false, dsmash: false,
      nair: false, fair: false, bair: false, uair: false, dair: false, sp_n: false, sp_s: false, sp_u: false, ledgeattack: true } },
    // the trail follows the tip of the curls (where the simulation hits)
    strikeAt(RM, F, M, out) {
      const len = F.va[0] || 0;
      if (len < 0.3) return F.va[6] > 0.3 || F.va[2] > 0 ? false : undefined;
      const a = F.va[5] || 0, L = 0.35 + len, R = RM.root || RM.scene;
      R.getWorldPosition(out);
      out.x += Math.sin(F.facing) * Math.cos(a) * L; out.y += HAIR_H + Math.sin(a) * L; out.z += Math.cos(F.facing) * Math.cos(a) * L;
      return true;
    },
    sockets: {
      plate: inHand('aboueb', FRIEND_PROPS.plate),
      ball: inHand('aboueb', FRIEND_PROPS.basketball),
      hair: { bone: 'head', at: [0, 1.68, -0.08], build: hairRope },
      hair2: { bone: 'head', at: [0, 1.68, -0.08], build: hairRope }, // the second half of the curls (down smash)
      carpet: onBone('hips', [0, 0.04, 0], FRIEND_BODY.carpet),
      reflector: onBone('hips', [0, 1.0, 0], reflectorObj),
    },
    update(V, F, o, t) {
      show(V, F, { ball: 1, carpet: 4, reflector: 3 });
      const h = V.sockets.hair && V.sockets.hair.obj, h2 = V.sockets.hair2 && V.sockets.hair2.obj;
      const mv = F.state === 'move';
      const spread = mv ? F.va[6] || 0 : 0;
      if (h) {
        const spin = mv ? F.va[2] || 0 : 0;
        const len = mv ? Math.max(F.va[0] || 0, spin > 0 ? 1.3 : 0, spread) : 0;
        h.visible = len > 0.05;
        // the nair: the curls sweep all around him; the down smash: poured onto the floor on both sides
        if (h.visible) layHair(V, h, len, t, spin > 0 ? spin * 2 : null, F, F.va[5] || 0, spread > 0.05 ? 1 : 0);
      }
      if (h2) {
        const spin = mv ? F.va[2] || 0 : 0;
        h2.visible = spread > 0.05 || spin > 0;
        // the down smash: the other half poured behind him; the nair: the other half of the spin, opposite
        if (h2.visible) layHair(V, h2, spread > 0.05 ? spread : 1.3, t + 0.37, spin > 0 ? spin * 2 + Math.PI : null, F, 0, spread > 0.05 ? -1 : 0);
      }
      const rf = V.sockets.reflector && V.sockets.reflector.obj;
      if (rf && rf.visible) {
        const k = Math.min(1, F.va[3] || 0);
        const s = 0.4 + k * 0.6 + Math.sin(t * 40) * 0.02;
        rf.scale.set(s, s * 1.12, s);
        rf.rotation.set(0, t * 2.2, 0);
        rf.children.forEach((c, i) => { if (c.material) c.material.opacity = (i ? 0.9 : 0.28) * k * (0.85 + Math.sin(t * 30 + i) * 0.15); });
      }
      const c = V.sockets.carpet && V.sockets.carpet.obj;
      if (c && c.visible) { toFloor(V, c, 0.05); c.rotation.z = Math.sin(t * 9) * 0.06; }
    },
  },

  tices: {
    h: 1.82, guard: 'brute', crouch: 0.05, wide: 0.04, stride: 0.95,
    // the cap throws: the cap hits, not the hand
    reach: { far: 0.85, moves: { jab1: 'hand.R', jab3: 'hand.R', ftilt: true, ftilt2: true, ftilt3: true, dtilt: true, fair: true, bair: true, dair: true, ledgeattack: true, smash: false, usmash: false } },
    sockets: {
      cap: inHand('tices', PASS_PROPS.cap),
      flamm: inHand('tices', FRIEND_PROPS.flamm),
      // the rum bottle tipped into his mouth
      rum: { bone: 'head', at: [0, 1.6, 0.15], build: () => { const b = FRIEND_PROPS.rum(); b.rotation.x = -2.0; b.position.set(0, 0.19, 0.41); return hidden(grp(b)); } },
    },
    update(V, F) {
      show(V, F, { cap: 1, flamm: 2, rum: 3 });
      // his own cap (part of the model): off his head while it is in his hand or flying (rig/capHide.js)
      const RM = V.model;
      if (RM && RM._cap === undefined) RM._cap = pieceSetup(RM, {
        minY: 1.6, cover: '#1c130e', shrink: 0.9, shrinkY: 0.8, headDown: 0.08, curl: 0.014,
        pick: (c, p) => (ticesBeige(c) && p.y > 1.635) || (ticesBrim(c) && p.z > 0.04 && p.y > 1.64),
        coverPick: ticesBeige,
      });
      if (RM && RM._cap) RM._cap.show(!(F.capOut || (F.state === 'move' && (F.va[1] || 0) > 0.02)));
    },
  },

  omfu: {
    h: 1.85, guard: 'brute', crouch: 0.05, wide: 0.05, stride: 0.85,
    // the belly flop and the stomp: the body hits, not a hand stretched out
    reach: { far: 0.85, moves: { jab1: 'hand.R', jab2: 'hand.L', ftilt: true, ftilt2: true, ftilt3: true, dtilt: true, fair: true, bair: true, dair: true, ledgeattack: true, smash: false, dsmash: false, usmash: 'hand.R' } },
    sockets: {
      // the turntables set on a stand in front of him (scratch-wave)
      decks: onBone('hips', [0, 0.92, 0.55], () => grp(FRIEND_BODY.turntable(), mesh(G.cyl(0.04, 0.04, 0.9, 6), mat('#333338'), [0, -0.45, 0]))),
      // the turntable he bounces on (up special), under his feet
      pad: onBone('hips', [0, 0, 0], () => { const t = FRIEND_BODY.turntable(); t.scale.setScalar(1.7); return grp(t); }),
      // the heap of earth around his neck while he is under the ground (down special)
      mound: onBone('hips', [0, 0, 0], moundObj),
    },
    update(V, F, o, t) {
      show(V, F, { decks: 5, pad: 7, mound: 6 });
      const p = V.sockets.pad && V.sockets.pad.obj;
      if (p && p.visible) { toFloor(V, p, -0.02); p.rotation.y = t * 6; }
      // under the ground: the whole model sunk, only his head out of the heap of earth
      const sink = F.state === 'move' ? Math.min(1, F.va[6] || 0) : 0;
      if (sink > 0 && V.model && V.model.pivot) V.model.pivot.position.y -= sink * 1.52;
      const m = V.sockets.mound && V.sockets.mound.obj;
      if (m && m.visible) { toFloor(V, m, 0); m.scale.set(1, 0.3 + sink * 0.7, 1); }
    },
  },

  lolobiscotto: {
    h: 1.68, guard: 'low', crouch: 0.05, lean: 6, stride: 1.05,
    // the fireball and the bottle: no hand stretched into those hitboxes; the mawashi-geri: the kicking foot
    reach: { far: 0.85, moves: { jab1: 'hand.R', ftilt: true, ftilt2: true, ftilt3: true, dtilt: true, fair: true, bair: true, dair: true, ledgeattack: true, smash: false, dsmash: false, usmash: true } },
    sockets: {
      ricard: inHand('lolobiscotto', FRIEND_PROPS.ricard),
      ricardL: inHand('lolobiscotto', FRIEND_PROPS.ricard, 'L'), // thrown down with the left hand (down smash)
      chili: inHand('lolobiscotto', FRIEND_PROPS.chili),
      cat: inHand('lolobiscotto', () => greyHeld(0.5)),
    },
    update(V, F, out, t) { show(V, F, { ricard: 0, chili: 1, cat: 2, ricardL: 3 }); pourStream(V, F, t); },
  },

  jsan: {
    h: 1.82, guard: 'smug', crouch: 0.02, lean: -2, stride: 1.0,
    reach: { far: 0.85, moves: { jab1: true, jab2: true, jab3: true, ftilt: true, ftilt2: true, ftilt3: true, dtilt: true, fair: true, bair: true, dair: true, ledgeattack: true, sp_u: false } }, // the copter: the dog hits
    sockets: { vape: { bone: 'head', at: [-0.03, 1.6, 0.14], build: () => { const v = FRIEND_PROPS.vape(); v.rotation.x = 1.4; return hidden(grp(v)); } } },
    update(V, F) { show(V, F, { vape: 0 }); },
  },

  nymano: {
    h: 1.8, guard: 'low', crouch: 0.03, lean: 12, stride: 1.0,
    // the board hits (the hands hold it): the reach goes to the hand holding it
    reach: { far: 0.85, moves: { jab1: 'hand.R', jab2: 'hand.R', jab3: 'hand.R', ftilt: true, ftilt2: true, ftilt3: true, dtilt: true, fair: true, bair: true, dair: true, ledgeattack: true, smash: 'hand.R', dsmash: false } },
    sockets: {
      board: inHand('nymano', FRIEND_PROPS.skate),
      sampler: inHand('nymano', FRIEND_PROPS.sampler),
      // the kickflip above his head, and the board under his feet when he rides it
      flip: onBone('hips', [0, 2.05, 0.25], () => grp(FRIEND_BODY.skateboard())),
      ride: onBone('hips', [0, -0.02, 0], () => grp(FRIEND_BODY.skateboard())),
    },
    // always sad: the head hangs low when he is not attacking
    extra(pose, F) {
      if (F.state !== 'move') pose.bones = { ...pose.bones, head: ROT(20, 0, 0), neck: ROT(8, 0, 0) };
      return pose;
    },
    update(V, F) {
      show(V, F, { board: 0, sampler: 1, flip: 2, ride: 3 });
      const f = V.sockets.flip && V.sockets.flip.obj;
      if (f && f.visible) f.rotation.z = (F.va[2] || 0) * Math.PI * 4;
      const r = V.sockets.ride && V.sockets.ride.obj;
      if (r && r.visible) toFloor(V, r, -0.04);
    },
  },

  bido: {
    h: 1.9, guard: 'brute', crouch: 0.04, wide: 0.06, lean: 2, stride: 0.9,
    sockets: {
      dumbbell: inHand('bido', FRIEND_PROPS.dumbbell),
      kettlebell: inHand('bido', FRIEND_PROPS.kettlebell),
      plateR: inHand('bido', () => { const p = FRIEND_PROPS.plates(); p.rotation.z = Math.PI / 2; return grp(p); }),
      plateL: inHand('bido', () => { const p = FRIEND_PROPS.plates(); p.rotation.z = Math.PI / 2; return grp(p); }, 'L'),
      // the barbell pressed over his head
      barbell: onBone('chest', [0, 2.2, 0.05], () => { const b = FRIEND_PROPS.barbell(); b.rotation.y = Math.PI / 2; return grp(b); }),
      balloon: onBone('chest', [0, 1.8, -0.05], () => { const b = FRIEND_BODY.balloon(); b.rotation.y = Math.PI / 2; return grp(b); }),
      // the jump rope, from his right hand (side special)
      rope: { bone: 'hand.R', at: HAND.bido, build: ropeObj },
    },
    reach: { far: 0.85, moves: { jab1: 'hand.R', ftilt: true, ftilt2: true, ftilt3: true, dtilt: true, fair: true, bair: true, dair: true, ledgeattack: true, smash: 'hand.R', usmash: false, dsmash: false, sp_s: false } },
    update(V, F, o, t) {
      show(V, F, { dumbbell: 0, kettlebell: 1, barbell: 2, plateR: 3, plateL: 3, balloon: 4 });
      const b = V.sockets.balloon && V.sockets.balloon.obj;
      if (b && b.visible) b.rotation.z = Math.sin(t * 3) * 0.12;
      // the barbell between his two hands (low in the squat, up over his head on the press)
      const bb = V.sockets.barbell && V.sockets.barbell.obj;
      if (bb && bb.visible && V.rig.bones['hand.L'] && V.rig.bones['hand.R']) {
        V.rig.bones['hand.L'].getWorldPosition(rA); V.rig.bones['hand.R'].getWorldPosition(rB);
        rC.copy(rA).add(rB).multiplyScalar(0.5);
        bb.parent.updateWorldMatrix(true, false);
        bb.parent.worldToLocal(rC); bb.position.copy(rC);
        // along the shoulders: from one hand to the other (in the socket's frame)
        bb.parent.worldToLocal(rA); bb.parent.worldToLocal(rB);
        rD.subVectors(rA, rB).normalize();
        if (rD.lengthSq() > 0.5) bb.quaternion.setFromUnitVectors(rX, rD);
      }
      const rp = V.sockets.rope && V.sockets.rope.obj;
      if (rp) { rp.visible = F.state === 'move' && (F.va[6] || 0) > 0; if (rp.visible) layRope(V, rp, F, F.va[5] || 0.35, t); }
    },
  },
};

// Kerrian (Meshy rig): BIDO's stance; in his right hand the insulin syringe (neutral special) and the cup of hot
// coffee (side special); the giant fork is an entity (the strike of the stages)
const syringe = () => {
  const g = grp(
    mesh(G.cyl(0.035, 0.035, 0.2, 10), mat('#e8f4ff', { transparent: true, opacity: 0.75 }), [0, 0, 0]),   // the barrel
    mesh(G.cyl(0.026, 0.026, 0.17, 8), mat('#ffb000'), [0, -0.01, 0]),                                     // the insulin
    mesh(G.cyl(0.012, 0.012, 0.08, 6), mat('#d8dde4'), [0, 0.14, 0]), mesh(G.cyl(0.05, 0.05, 0.012, 10), mat('#d8dde4'), [0, 0.18, 0]), // the plunger
    mesh(G.cyl(0.004, 0.004, 0.09, 4), mat('#c0c6cf'), [0, -0.145, 0]));                                  // the needle
  g.rotation.x = Math.PI / 2;
  return grp(g);
};
const coffeeCup = () => grp(
  mesh(G.cyl(0.075, 0.056, 0.17, 12), mat('#f4efe6'), [0, 0, 0]),
  mesh(G.cyl(0.077, 0.068, 0.06, 12), mat('#c08a52'), [0, -0.01, 0]),   // the cardboard sleeve
  mesh(G.cyl(0.08, 0.078, 0.02, 12), mat('#f8f6f2'), [0, 0.094, 0]));  // the lid
// the bazooka of his ultimate (BOOGIE ROCKET), in his right hand: a tube along +z, turned toward his facing
const bazooka = () => grp(
  mesh(G.cyl(0.11, 0.11, 1.15, 12), mat('#4a5a3a'), [0, 0.12, 0.35], [Math.PI / 2, 0, 0]),   // held from below, mostly in front
  mesh(G.cyl(0.14, 0.11, 0.18, 12), mat('#2e3626'), [0, 0.12, 0.97], [Math.PI / 2, 0, 0]),
  mesh(G.cyl(0.13, 0.13, 0.12, 12), mat('#ff5ad1', { emissive: '#5a1048' }), [0, 0.12, -0.2], [Math.PI / 2, 0, 0]),
  mesh(G.box(0.06, 0.2, 0.08), mat('#2e3626'), [0, -0.02, 0.1]));
const _bq = new THREE.Quaternion(), _by = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
FRIEND_RIGS.kerrian = {
  ...FRIEND_RIGS.bido,
  h: 1.85,
  sockets: {
    syringe: inHand('kerrian', syringe),
    cup: inHand('kerrian', coffeeCup),
    bazooka: inHand('kerrian', bazooka),
  },
  reach: { far: 0.85, moves: { jab1: 'hand.R', jab2: 'hand.L', jab3: false, ftilt: 'hand.R', utilt: false, dtilt: false, smash: true, usmash: 'hand.R', dsmash: false,
    nair: true, fair: true, bair: true, uair: true, dair: true, dashattack: 'hand.R', ledgeattack: true, sp_n: false, sp_s: false, sp_u: false, sp_d: false } },
  update(V, F) {
    show(V, F, { syringe: 0, cup: 2, bazooka: (G_) => !!(G_.move && G_.move.startsWith('ult_')) });
    const bz = V.sockets.bazooka && V.sockets.bazooka.obj;
    if (bz && bz.visible && bz.parent) {
      // whatever the hand does, the tube points where he faces (world: +x right, -x left)
      bz.parent.updateWorldMatrix(true, false);
      bz.parent.getWorldQuaternion(_bq).invert();
      _by.setFromAxisAngle(_up, Math.sin(F.facing) < 0 ? -Math.PI / 2 : Math.PI / 2);
      bz.quaternion.copy(_bq).multiply(_by);
    }
  },
};
