// ANBUU's rig settings and props: he floats above the floor (his shadow stays on it), barefoot; little angel wings
// in his back, folded at rest, they beat on the air jump and spread for the flight (F.va[0]); the waveform glowing
// between his hands (F.va[1]). His projectiles: the jazz notes of the lick, the 808's bass wave, the holy 808 (merged
// into entityView's BUILD). Flags set by src/sim/chars/anbuu.js.
import * as THREE from 'three';
import { energyBall, updateEnergyBall } from '../fxShaders.js';
import { mat, G, mesh, canvasTex, glowTex } from '../materials.js';

const grp = (...c) => { const g = new THREE.Group(); c.forEach((o) => o && g.add(o)); return g; };
const hidden = (o) => { o.visible = false; return o; };

// --- the wings: three rows of long white feathers, each wing hinged at the shoulder blade ---------------------------
function featherTex() {
  return canvasTex('anbuu_feather', 64, (g, s) => {
    const gr = g.createLinearGradient(0, 0, s, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.15, 'rgba(255,252,240,1)'); gr.addColorStop(0.85, 'rgba(255,248,226,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(s / 2, s / 2, s * 0.48, s * 0.18, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(240,232,212,0.7)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(s * 0.05, s / 2); g.lineTo(s * 0.95, s / 2); g.stroke();
  });
}
function wing(side) {
  // they glow by themselves (emissiveMap): white from both sides, never brown against the light
  const tx = featherTex();
  const m = new THREE.MeshStandardMaterial({ map: tx, emissiveMap: tx, transparent: true, side: THREE.DoubleSide, roughness: 0.6, emissive: '#fff4d8', emissiveIntensity: 0.95, depthWrite: false });
  const hinge = new THREE.Group();
  const rows = [[6, 0.5, 0], [5, 0.36, 0.05], [4, 0.24, 0.1]];
  for (const [n, len, off] of rows) {
    for (let i = 0; i < n; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(len, len * 0.32), m);
      const a = -0.5 + (i / (n - 1)) * 0.95; // fanned out sideways, from up-out to a little down-out (a wing, not a sun)
      f.geometry.translate(len / 2, 0, 0);
      f.position.set(0, -off, -0.01 * i);
      f.rotation.set(0, 0, a);
      hinge.add(f);
    }
  }
  hinge.scale.x = side; // the left wing is the mirror
  return hinge;
}
function wings() {
  const g = new THREE.Group();
  const L = wing(-1), R = wing(1);
  g.add(L, R);
  g.userData = { L, R, flap: 0, lastJumps: null };
  return g;
}

// --- the waveform between his hands -----------------------------------------------------------------------------
function waveCurve(len, amp, waves) {
  const pts = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push(new THREE.Vector3((t - 0.5) * len, Math.sin(t * Math.PI * 2 * waves) * amp * Math.sin(t * Math.PI), 0)); }
  return new THREE.CatmullRomCurve3(pts);
}
function waveMesh(len = 0.8, amp = 0.12, waves = 3, r = 0.025, color = '#b07bff') {
  return new THREE.Mesh(new THREE.TubeGeometry(waveCurve(len, amp, waves), 60, r, 6, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
}

// float above the floor: a little higher than the soles, bobbing slowly
const FLOAT = 0.16;

// the ball of light: a white core, a golden shell, sparks orbiting it
const _o = new THREE.Vector3();
function orbObj() {
  const b = energyBall('holy', { halo: 2.4 });
  b.scale.setScalar(0.34);
  return grp(b);
}

const HEAD_FIX = { walk: 0.4, run: 1.1 }; // radians of pitch given back to the head (neck 45 %, head 55 %)

const _m0 = new THREE.Quaternion(), _m1 = new THREE.Quaternion();
function mirrorLeg(B, rest) {
  for (const n of ['thigh', 'shin', 'foot']) {
    const r = B[n + '.L'], l = B[n + '.R'], rr = rest[n + '.L'] && rest[n + '.L'].local, rl = rest[n + '.R'] && rest[n + '.R'].local;
    if (!l || !r || !rl || !rr) continue;
    // the left bone's turn away from its own rest, mirrored across the body (x kept, y and z flipped), put on the right rest
    _m0.copy(rl).invert().multiply(l.quaternion);
    _m1.set(_m0.x, -_m0.y, -_m0.z, _m0.w);
    r.quaternion.copy(rr).multiply(_m1);
  }
}

export const ANBUU_RIG = {
  anbuu: {
    h: 1.74, guard: 'boxer', idleClip: 1, crouch: 0.02, wide: 0.02, lean: 2, stride: 0.9,
    sockets: {
      // in his back, a little under the shoulders (rest: +Z forward, so the back is -Z)
      wings: { bone: 'chest', at: [0, 1.38, -0.16], build: () => wings() },
      wave: { bone: 'hips', at: [0, 1.15, 0.38], build: () => hidden(grp(waveMesh())) },
      // the ball of energy at the end of his hand (neutral A): placed where the simulation hits with it
      orb: { bone: 'hips', at: [0, 1.0, 0], build: () => hidden(orbObj()) },
    },
    reach: { far: 0.85, moves: { jab1: 'hand.R', jab3: 'hand.R', smash: false, usmash: false, dsmash: false, ftilt: true, ftilt2: true, ftilt3: true, dtilt: true, fair: true, bair: true, dair: true, ledgeattack: true } },
    // moving along the floor (the glide clip leans his whole body, and the head with it: it hung far back): the head is
    // turned back upright on top of the clip (pitch only, shown only: poser.js out.wiggle → animator.js clip.add)
    extra(pose, F, M, t, out) {
      if (!F.grounded || (F.state !== 'run' && F.state !== 'walk')) return null;
      const k = HEAD_FIX[F.state];
      out.wiggle = { neck: [k * 0.45, 0, 0], head: [k * 0.55, 0, 0] };
      return null;
    },
    update(V, F, o, t) {
      // his right leg: the hover / jump clips (Meshy text to motion) leave it twisted (thigh turned ~30° about its axis, the
      // foot turned out sideways and pointed like a ballerina's); it takes the left leg's pose, mirrored
      // (not while walking, running or striking: those clips swing the legs on purpose)
      if (F.state !== 'move' && F.state !== 'walk' && F.state !== 'run') mirrorLeg(V.rig.bones, V.rig.rest);
      // floating: the whole body hovers (the shadow, drawn apart, stays on the floor)
      const lying = F.state === 'down' || F.state === 'dead' || F.state === 'ledge' || F.state === 'grabbed';
      if (!lying) V.root.position.y += FLOAT + Math.sin(t * 2.4 + (F.slot || 0)) * 0.04;
      const S = V.sockets;
      const w = S.wings && S.wings.obj;
      if (w) {
        const u = w.userData;
        // an air jump: one big beat
        if (u.lastJumps !== null && F.jumps < u.lastJumps && !F.grounded) u.flap = 1;
        u.lastJumps = F.jumps;
        u.flap = Math.max(0, u.flap - 0.045);
        const fly = F.state === 'move' && (F.va[0] || 0) > 0.5;
        // gliding along the floor: half open, trailing
        const glide = F.grounded && F.state === 'run' ? 0.35 : 0;
        u.glide = (u.glide || 0) + (glide - (u.glide || 0)) * 0.12;
        const spread = fly ? 1 : Math.max(u.glide, u.flap > 0 ? Math.sin(u.flap * Math.PI) : 0);
        const beat = fly ? Math.sin(t * 16) * 0.5 : u.flap > 0 ? Math.sin(u.flap * Math.PI * 3) * 0.6 : Math.sin(t * 1.6) * 0.06;
        const sc = 0.72 + spread * 0.55;
        for (const [k, side] of [[u.L, -1], [u.R, 1]]) {
          k.scale.set(side * sc, sc, sc);
          // folded: swept back and down; spread: out to the sides, beating
          // (seen from the side, the flight's wings go up and back: a V over his shoulders, not edge-on to the camera)
          const up = fly ? 1 : 0;
          k.rotation.set(-up * 0.35, side * (0.9 - spread * (0.85 - up * 0.45)), side * (-0.35 + spread * (0.25 + up * 0.55) + beat));
        }
      }
      const ob = S.orb && S.orb.obj;
      if (ob) {
        const k = F.state === 'move' ? F.va[2] || 0 : 0;
        ob.visible = k > 0.03;
        if (ob.visible) {
          // on the plane of the fight, 1 m in front, 1.25 m up (src/sim/chars/anbuu.js: jab1, jab3), the smash: at the palms
          const fwd = F.move === 'smash' ? 0.6 : 1.0;
          _o.set(V.root.position.x + Math.sin(F.facing) * fwd, V.root.position.y + 1.25, V.root.position.z);
          ob.parent.worldToLocal(_o); ob.position.copy(_o);
          ob.scale.setScalar(k * (1 + Math.sin(t * 40) * 0.05));
          updateEnergyBall(ob.children[0], t, k);
        }
      }
      const wv = S.wave && S.wave.obj;
      if (wv) {
        wv.visible = F.state === 'move' && (F.va[1] || 0) > 0.5;
        if (wv.visible) { wv.rotation.z = Math.sin(t * 20) * 0.1; wv.scale.y = 1 + Math.sin(t * 30) * 0.3; }
      }
    },
  },
};

// --- his projectiles --------------------------------------------------------------------------------------------
const NOTE_C = ['#ffe17a', '#ffd04a', '#ffb84a', '#ff9e5a', '#ffc7f0', '#c6a6ff', '#fff2a0'];
function noteTex(i) {
  return canvasTex('anbuu_note' + i, 128, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.font = '900 104px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 9; g.strokeStyle = '#1a1020'; g.strokeText(i % 2 ? '♫' : '♪', s / 2, s / 2 + 6);
    g.fillStyle = NOTE_C[i % NOTE_C.length]; g.fillText(i % 2 ? '♫' : '♪', s / 2, s / 2 + 6);
  });
}
function jazznote(e) {
  const i = Math.abs((e && e.b) | 0) % 7;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex(i), transparent: true, depthWrite: false }));
  s.scale.setScalar(i === 6 ? 1.0 : 0.7);
  return grp(s);
}
function waveform() {
  // the bass wave: a fat glowing sine standing on the floor, along its way (+Z)
  const g = new THREE.Group();
  const a = waveMesh(1.6, 0.45, 2.5, 0.07, '#9d6bff'), b = waveMesh(1.6, 0.3, 2.5, 0.035, '#e6d6ff');
  for (const m of [a, b]) { m.rotation.y = Math.PI / 2; m.position.y = 0.1; g.add(m); }
  return g;
}
function holy808() {
  // an 808 drum machine with a golden halo over it, glowing
  const body = mat('#4a4450', { roughness: 0.35, emissive: '#3a2c08' }), pad = mat('#ff7a2a', { emissive: '#7a2a00' }), gold = new THREE.MeshBasicMaterial({ color: '#ffe17a' });
  const g = grp(
    mesh(G.box(1.1, 0.22, 0.7), body, [0, 0, 0]),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => mesh(G.box(0.1, 0.04, 0.1), i % 4 === 0 ? pad : mat('#e8e2d0'), [-0.42 + i * 0.12, 0.13, 0.2])),
    mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 24), gold, [0, 0.55, 0], [Math.PI / 2, 0, 0]),
  );
  // a holy glow behind it (it must read against the night sky)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ffe9a0', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(2.4); halo.position.set(0, 0.2, -0.2);
  g.add(halo);
  return g;
}
export const ANBUU_BUILD = {
  jazznote: (e) => jazznote(e),
  waveform: () => waveform(),
  holy808: () => holy808(),
};
