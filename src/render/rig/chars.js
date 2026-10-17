// Per-character settings of the rigged models: guard, crouch, stride, secondary bones (bellies, tails, ears, hats)
// with their springs, held props attached to hand sockets, and per-frame extras driven by the simulation (va[]).
import * as THREE from 'three';
import { mat, basic, G, mesh, stripes, canvasTex } from '../materials.js';
import { fitProp } from '../propModels.js';
import { ROT, D, P, sym } from './library.js';
import { catHeld } from '../entityView.js';
import { updateKame } from '../pandrezzView.js';
import { FRIEND_RIGS } from './friendRigs.js';
import { EPEKTASE_RIG } from './epektaseRig.js';
import { PPROD_RIG } from './pprodRig.js';
import { SKANKY_RIG } from './skankyRig.js';
import { ANBUU_RIG } from './anbuuRig.js';
import { RONARE_RIG } from './ronareRig.js';

const grp = (...c) => { const g = new THREE.Group(); c.forEach((o) => o && g.add(o)); return g; };

// --- props (built in character space at rest: +Y up, +Z forward, origin = the palm) ------------------------------
const PROPS = {
  cash: () => grp(
    mesh(G.box(0.2, 0.07, 0.11), mat('#6fb35a', { map: stripes('bill', '#7bc265', '#5c9a4b', 8, 1) }), [0, 0, 0.04]),
    mesh(G.box(0.05, 0.075, 0.115), mat('#c9a227'), [0, 0, 0.04]),
  ),
  burger: () => fitProp('burger', grp(
    mesh(G.cyl(0.15, 0.17, 0.07, 10), mat('#d99a43'), [0, 0.08, 0]),
    mesh(G.cyl(0.165, 0.165, 0.035, 10), mat('#4fae3a'), [0, 0.035, 0]),
    mesh(G.cyl(0.17, 0.17, 0.05, 10), mat('#5a2d14'), [0, 0, 0]),
    mesh(G.cyl(0.175, 0.15, 0.04, 10), mat('#d99a43'), [0, -0.05, 0]),
  )),
  grater: () => fitProp('grater', grp(
    mesh(G.box(0.26, 0.46, 0.06), mat('#c7ccd4', { metalness: 0.6, roughness: 0.35, map: canvasTex('grater', 32, (g, s) => { g.fillStyle = '#c7ccd4'; g.fillRect(0, 0, s, s); g.fillStyle = '#5c6470'; for (let i = 2; i < s; i += 6) for (let j = 2; j < s; j += 5) g.fillRect(i + (j % 2) * 2, j, 2, 2); }) }), [0, 0.3, 0.06], [0.25, 0, 0]),
    mesh(G.cyl(0.03, 0.03, 0.18, 6), mat('#222222'), [0, 0.0, 0.0]),
  )),
  bat: () => {
    const b = fitProp('bat', grp(mesh(G.cyl(0.09, 0.045, 1.15, 9), mat('#d8a868'), [0, 0.6, 0]), mesh(G.cyl(0.055, 0.055, 0.1, 8), mat('#4a2a10'), [0, 0.0, 0])));
    b.rotation.set(0.9, 0, 0); // up and forward at rest, over the shoulder in guard
    return grp(b);
  },
  humanball: () => grp(
    mesh(new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#7b3fc4'), [0, 0.1, 0.05]),
    mesh(new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#f4f0fa'), [0, 0.1, 0.05]),
    mesh(G.cyl(0.04, 0.04, 0.27, 12), mat('#222222'), [0, 0.1, 0.05], [0, 0, Math.PI / 2]),
    mesh(G.ball(0.04, 1), basic('#ffffff'), [0, 0.1, 0.18]),
  ),
};

function broom() {
  const g = grp(
    mesh(G.cyl(0.035, 0.035, 1.5, 8), mat('#7a4a22'), [0, 0, 0.05], [Math.PI / 2, 0, 0]),
    mesh(G.cone(0.2, 0.55, 10), mat('#d8b04f'), [0, 0, -0.85], [-Math.PI / 2, 0, 0]),
    mesh(G.cyl(0.07, 0.07, 0.06, 8), mat('#5a2a8a'), [0, 0, -0.58], [Math.PI / 2, 0, 0]),
  );
  g.visible = false;
  return g;
}

function tongue() {
  const t = mesh(G.cyl(0.06, 0.07, 1, 8), mat('#ff5d8f'), [0, 0, 0], [Math.PI / 2, 0, 0]);
  t.geometry.translate(0, 0.5, 0);
  const tip = mesh(G.ball(0.12, 1), mat('#ff3a75'), [0, 1, 0]);
  t.add(tip);
  t.visible = false;
  t.userData.tip = tip;
  return t;
}

// sockets: { bone, at:[x,y,z] (rest position in character space), build }
export const RIGS = {
  frog: {
    h: 1.45, guard: 'claws', crouch: 0.09, wide: 0.04, lean: 8, stride: 1.15, jaw: { bone: 'jaw', open: 34 },
    secondary: { belly: { k: 160, z: 0.22, inertia: 2.5 } },
    sockets: { tongue: { bone: 'head', at: [0, 1.25, 0.2], build: tongue } },
    update(V, F) {
      const t = V.sockets.tongue && V.sockets.tongue.obj;
      const len = F.va[0] || 0;
      if (t) {
        t.visible = len > 0.05;
        if (t.visible) { t.scale.set(1, Math.max(0.1, len), 1); t.userData.tip.scale.set(1, 1 / Math.max(0.1, len), 1); }
      }
      const b = V.rig.bones.belly;
      if (b) b.scale.setScalar(1 + (F.va[2] || 0) * 0.6);
    },
  },
  micron: {
    h: 1.85, guard: 'smug', crouch: 0.02, lean: -2,
    sockets: { cash: { bone: 'hand.R', at: [-0.407, 0.785, 0.056], build: PROPS.cash } },
  },
  bubba: {
    h: 2.0, guard: 'brute', crouch: 0.05, wide: 0.05, stride: 0.85,
    secondary: { belly: { k: 110, z: 0.18, inertia: 4 } },
    sockets: { burger: { bone: 'hand.L', at: [0.684, 0.826, -0.113], build: PROPS.burger } },
    update(V, F) { const s = V.sockets.burger; if (s && s.obj) s.obj.rotation.z = (F.va[0] || 0) * 0.5; },
  },
  parmesan: {
    h: 1.65, guard: 'boxer', crouch: 0.03, wide: 0.02, stride: 0.8,
    sockets: { grater: { bone: 'hand.R', at: [-0.544, 0.597, 0.018], build: PROPS.grater } },
    update(V, F, out, t) { const s = V.sockets.grater; if (s && s.obj) s.obj.rotation.z = ((F.va[0] || 0) + (out.grate ? 1 : 0)) * Math.sin(t * 50) * 0.3; },
  },
  pika: {
    h: 1.25, guard: 'claws', crouch: 0.07, wide: 0.03, stride: 1.2,
    secondary: {
      tail1: { k: 140, z: 0.3, inertia: 2 }, tail2: { k: 110, z: 0.28, inertia: 2.5 }, tail3: { k: 90, z: 0.25, inertia: 3 }, tail4: { k: 70, z: 0.22, inertia: 3.5 },
      'ear.L': { k: 180, z: 0.25, inertia: 1.5 }, 'ear.R': { k: 180, z: 0.25, inertia: 1.5 },
    },
    sockets: { ball: { bone: 'hand.R', at: [-0.39, 0.41, 0.26], build: PROPS.humanball } },
    extra(pose, F, M, t) {
      const w = Math.sin(t * 5);
      pose.bones = { ...pose.bones, tail1: ROT(0, w * 10, 0), tail2: ROT(0, w * 14, 0), tail3: ROT(w * 8, 0, 0) };
      return pose;
    },
  },
  tung: {
    h: 2.05, guard: 'low', crouch: 0.03, lean: 0, stride: 1.0,
    sockets: { bat: { bone: 'hand.R', at: [-0.494, 0.79, -0.022], build: PROPS.bat } },
    reach: { weapon: 'bat', weaponHand: 'hand.R', far: 0.85, moves: { jab1: true, jab2: true, jab3: true, ftilt: true, ftilt2: true, ftilt3: true, dtilt: true, fair: true, bair: true, dair: true, ledgeattack: true } },
    update(V, F, out) { const s = V.sockets.bat; if (s && s.obj) s.obj.rotation.y = (F.va[1] || 0) + (out.propSpin || 0) * 4; },
  },
  shark: {
    h: 1.7, guard: 'claws', crouch: 0.06, legs: 3, lean: 6, stride: 0.9, jaw: { bone: 'jaw', open: 30 },
    secondary: { tail1: { k: 120, z: 0.28, inertia: 3 }, tail2: { k: 80, z: 0.24, inertia: 4 }, dorsal: { k: 200, z: 0.3, inertia: 1.5 } },
    extra(pose, F, M, t) {
      const w = Math.sin(t * 4);
      pose.bones = { ...pose.bones, tail1: ROT(0, w * 12, 0), tail2: ROT(0, w * 18, 0) };
      return pose;
    },
    update(V, F) { V.root.position.y -= (F.va[0] || 0) * 1.35; },
  },
  pandrezz: {
    h: 1.85, guard: 'boxer', crouch: 0.04, wide: 0.05, lean: 4, stride: 1.0,
    reach: { far: 0.85, moves: { jab1: 'hand.R', jab2: 'hand.R', jab3: 'hand.L', ftilt: true, ftilt2: true, ftilt3: true, dtilt: true, fair: true, bair: true, dair: true, ledgeattack: true } },
    chargeTint: [0.12, 0.3, 0.5], chargeGlow: '#7fd8ff',
    moves: {
      // KA-ME-HA-ME... : the cupped palms at the right hip, shoulders turned, knees bent; HAAA : both arms thrust out
      kame: {
        wind: P({ 'upperarm.R': D(-0.28, -0.85, -0.42), 'forearm.R': D(0.12, -0.2, 0.97), 'upperarm.L': D(-0.4, -0.78, 0.3), 'forearm.L': D(-0.85, -0.2, -0.45),
          chest: ROT(6, 32, 0), spine: ROT(12, 12, 0), neck: ROT(0, -18, 0), head: ROT(-6, -22, 0) }, { hips: { pos: [0, -0.12, 0], scl: [1.04, 0.95, 1.04] } }),
        hit: P({ ...sym({ upperarm: D(-0.24, -0.06, 1), forearm: D(-0.55, 0.02, 1) }), chest: ROT(-4, 0, 0), spine: ROT(4, 0, 0), head: ROT(-6, 0, 0) },
          { hips: { pos: [0, -0.14, -0.06], scl: [1.06, 0.94, 1.06] } }),
      },
      // the rocket: knees tucked, both arms pointing straight down, blasting
      kamedown: {
        wind: P({ ...sym({ upperarm: D(-0.15, -0.9, 0.4), forearm: D(-0.4, -0.7, 0.55), thigh: D(0.2, -0.5, 0.8), shin: D(0.1, -1, 0.1) }), spine: ROT(20, 0, 0) }, { hips: { scl: [1.06, 0.92, 1.06] } }),
        hit: P({ ...sym({ upperarm: D(-0.15, -0.95, 0.35), forearm: D(-0.38, -0.95, 0.3), thigh: D(0.22, -0.3, 0.92), shin: D(0.1, -1, 0.2) }), spine: ROT(-12, 0, 0), head: ROT(14, 0, 0) }),
      },
      // CD-Man ! : snaps his fingers high, then points at the spot where his friend pops up (on his right)
      summon: {
        wind: P({ 'upperarm.R': D(-0.35, 0.9, -0.1), 'forearm.R': D(-0.1, 1, 0.15), 'upperarm.L': D(0.6, -0.75, -0.1), 'forearm.L': D(-0.35, -0.25, 0.9), spine: ROT(-6, 0, 0) }),
        hit: P({ 'upperarm.R': D(-0.9, 0.1, 0.45), 'forearm.R': D(-0.8, 0.25, 0.55), 'upperarm.L': D(0.6, -0.75, -0.1), 'forearm.L': D(-0.35, -0.25, 0.9), chest: ROT(0, -16, 0), head: ROT(0, -24, 0) }),
      },
      // Vinylman ! : both fists to the sky
      call: {
        wind: P({ ...sym({ upperarm: D(0.5, 0.15, 0.75), forearm: D(0.3, 0.6, 0.7) }), spine: ROT(10, 0, 0) }, { hips: { pos: [0, -0.08, 0], scl: [1.05, 0.93, 1.05] } }),
        hit: P({ ...sym({ upperarm: D(0.35, 0.92, 0.12), forearm: D(0.12, 1, 0.05) }), spine: ROT(-10, 0, 0), chest: ROT(-8, 0, 0), head: ROT(-30, 0, 0) }, { hips: { scl: [0.96, 1.06, 0.96] } }),
      },
    },
    update(V, F, out, t) { updateKame(V, F, t); },
  },
  catlady: {
    h: 1.75, guard: 'low', crouch: 0.06, lean: 12, stride: 0.85,
    secondary: { hat: { k: 70, z: 0.2, inertia: 3 } },
    sockets: {
      cat: { bone: 'hand.R', at: [-0.445, 0.712, 0.034], build: () => { const c = catHeld(0.62); c.visible = false; return c; } },
      broom: { bone: 'hips', at: [0, 0.62, 0.05], build: broom },
    },
    moves: {
      // astride the broom: knees up, both hands on the stick in front
      broom: {
        wind: P({ ...sym({ thigh: D(0.2, -0.3, 0.95), shin: D(0.1, -1, 0.15), upperarm: D(0.25, -0.5, 0.8), forearm: D(-0.3, -0.3, 0.9) }), spine: ROT(10, 0, 0) }, { hips: { scl: [1.05, 0.95, 1.05] } }),
        hit: P({ ...sym({ thigh: D(0.22, -0.25, 0.95), shin: D(0.1, -1, 0.2), upperarm: D(0.22, -0.55, 0.8), forearm: D(-0.3, -0.35, 0.88) }), spine: ROT(18, 0, 0), head: ROT(-12, 0, 0) }, { jaw: 1 }),
      },
      // shakes her cardigan open: arms wide, kittens tumble out
      sp_d: {
        wind: P({ ...sym({ upperarm: D(0.5, -0.5, 0.7), forearm: D(-0.4, 0.2, 0.9) }), spine: ROT(14, 0, 0) }),
        hit: P({ ...sym({ upperarm: D(0.95, 0.15, 0.2), forearm: D(0.9, 0.35, -0.1) }), spine: ROT(-14, 0, 0), chest: ROT(-10, 0, 0), head: ROT(-20, 0, 0) }, { hips: { scl: [1.06, 1.02, 1.06] } }),
      },
    },
    extra(pose, F, M, t) {
      if (F.va && F.va[0]) pose.bones = { ...pose.bones, chest: ROT(0, F.va[0] * 18, F.va[0] * 6) };
      return pose;
    },
    update(V, F) {
      const c = V.sockets.cat && V.sockets.cat.obj;
      if (c) {
        const big = F.state === 'move' && F.move === 'sp_s' && F.mf < 16;
        c.visible = F.state === 'move' && ((F.move === 'sp_n' && F.mf < 11) || big);
        c.scale.setScalar(big ? 1.9 : 1);
      }
      const b = V.sockets.broom && V.sockets.broom.obj;
      if (b) b.visible = (F.va[1] || 0) > 0.3 && F.state === 'move';
    },
  },
};
Object.assign(RIGS, FRIEND_RIGS, EPEKTASE_RIG, PPROD_RIG, SKANKY_RIG, ANBUU_RIG, RONARE_RIG);
