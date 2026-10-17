// Epektase : le guitariste. Il cogne avec sa Flying V comme avec une hache, fouette avec son carré Hermès (il adore
// les foulards Hermès) et sort des solos ravageurs : notes qui fusent, power chord qui souffle tout, larsen qui sonne.
// Prop flags (src/render/rig/epektaseRig.js): va[0] the guitar played on the chest (else held like an axe),
// va[1] the scarf out (0..1, how far it reaches), va[2] the guitar glowing (solo, power chord, larsen).
import { normals, dashAttack, hb, shoot, ring, hitNow } from '../kit.js';
import { ENTITIES } from '../entities.js';
import { endMove } from '../fighter.js';
import { localToWorld } from '../util.js';
import { DMath } from '../dmath.js';

// the guitar thrown up (up smash): it spins over his head 1.5 s, cutting all the while (small hits that keep the
// foe in), the last one sends like a smash; then it flies back into his hand. Meanwhile his hand is empty
// (F.guitarOut: the rig hides it).
const SPIN = 90;
ENTITIES.guitarSpin = {
  stepExtra(e, W) {
    const F = W.fighters[e.home];
    if (!F || F.out || F.state === 'dead' || F.state === 'respawn') { e.dead = true; if (F) F.guitarOut = 0; return; }
    if (e.t < 8) { e.vy = (e.ty - e.y) * 9; e.vx = 0; } // up to its spot
    else if (e.t < SPIN) { e.vx = 0; e.vy = 0; }
    else {
      // home: back into his hand
      const dx = F.x - e.x, dy = F.y + 1.2 - e.y, d = DMath.hypot(dx, dy) || 1e-3;
      e.vx = (dx / d) * 20; e.vy = (dy / d) * 20; e.noHit = true;
      if (d < 0.6 || e.t > SPIN + 60) { e.dead = true; F.guitarOut = 0; W.emit('guitarCatch', { s: F.slot, x: e.x, y: e.y, z: 0 }); }
    }
    // the cutting: small hits that hold the foe in, then the big one
    if (e.t >= 8 && e.t < SPIN - 6 && e.t % 8 === 0) { e.dmg = 0.9; e.ang = 90; e.kbb = 0; e.kbg = 0; e.fkb = 14; e.rehit = 7; e.dirMode = 'in'; }
    if (e.t === SPIN - 6) { e.keyx = 'f'; e.dmg = e.fin; e.ang = 85; e.kbb = e.finKbb; e.kbg = 96; e.fkb = undefined; e.rehit = 99; e.dirMode = 'radial'; e.sfx = 'guitarSmash'; e.hitlag = 1.2; }
    if (e.t === SPIN - 2) e.noHit = true;
  },
  onDie(e, W) { const F = W.fighters[e.home]; if (F) F.guitarOut = 0; },
};

// a guitar for a broom (up special): steered with the stick for a few seconds, up as well as sideways
const BROOM = 150;

// the scarf goes out over a few frames, stays, then comes back
const lash = (f, out, hold, back) => (f < out[0] ? 0 : f < out[1] ? (f - out[0]) / (out[1] - out[0]) : f < hold ? 1 : f < back ? 1 - (f - hold) / (back - hold) : 0);

const moves = {
  ...normals({ power: 1.08, reach: 1.12, speed: 0.96, sfxS: 'slap', sfxM: 'guitarHit', sfxL: 'guitarHitL' }),
  // A while running: on his knees across the stage, guitar first (the rock star slide)
  dashattack: dashAttack({ pose: 'slide', boost: 12.5, fric: 13, dur: 42, iasa: 38,
    onStart(F, W) { W.emit('sfx', { s: F.slot, n: 'riff' }); },
    onFrame(F, W, f) { F.va[2] = f >= 4 && f <= 30 ? 1 : 0; },
    hits: [
      hb(5, 9, [0, 0.7, 0.95], 0.85, 10, 38, 42, 74, { sfx: 'guitarHitL', blood: 1.2 }),
      hb(10, 24, [0, 0.6, 0.85], 0.7, 5, 50, 28, 50, { sfx: 'guitarHit', blood: 0.6, grp: 1 }),
    ] }),

  // A + side: the Hermès scarf, a silk whip that reaches far (the tip hurts more)
  ftilt: {
    dur: 30, iasa: 24, pose: 'ftilt', next: 'ftilt2', nextWin: [14, 28], combo: true,
    onFrame(F, W, f) { F.va[1] = lash(f, [3, 9], 13, 20); if (f === 5) W.emit('sfx', { s: F.slot, n: 'silk' }); },
    hits: [
      hb(8, 11, [0, 1.15, 1.25], 0.6, 5, 34, 16, 42, { sfx: 'whip', blood: 0.5 }),
      hb(8, 11, [0, 1.15, 2.15], 0.55, 7.5, 38, 26, 62, { sfx: 'whip', blood: 0.9, grp: 0, hitlag: 1.2 }),
    ],
    onEnd(F) { F.va[1] = 0; },
  },
  // second tap: a spinning kick, the scarf trailing
  ftilt2: {
    dur: 28, iasa: 22, pose: 'buttbump', next: 'ftilt3', nextWin: [15, 26], combo: true,
    vel: [{ f: [6, 9], fwd: 3 }],
    hits: [hb(10, 13, [0, 1.0, 1.0], 0.8, 5.5, 40, 18, 44, { sfx: 'guitarHit', blood: 0.6 })],
  },
  // third tap: the guitar brought down like a sledgehammer
  ftilt3: {
    dur: 36, iasa: 32, pose: 'headbutt',
    vel: [{ f: [7, 10], fwd: 4 }],
    onFrame(F, W, f) { if (f === 14) W.emit('quake', { x: F.x + DMath.sin(F.facing) * 1.2, y: F.y, z: 0, k: 0.12 }); },
    hits: [hb(12, 15, [0, 0.9, 1.25], 0.85, 9.5, 42, 34, 88, { sfx: 'guitarSmash', blood: 1.6, hitlag: 1.2 })],
  },
  // side smash: the Flying V swung like an axe, full force
  smash: {
    dur: 46, charge: { at: 9, max: 60 }, pose: 'smash', tilt: 'ftilt',
    vel: [{ f: [11, 13], fwd: 5 }],
    hits: [
      hb(13, 16, [0, 1.1, 1.35], 1.0, 16.5, 38, 40, 102, { sfx: 'guitarSmash', blood: 2.4, hitlag: 1.25 }),
      hb(13, 16, [0, 1.0, 0.5], 0.75, 13, 38, 32, 94, { sfx: 'guitarHitL', blood: 1.6, grp: 0 }),
    ],
  },
  // up smash: the guitar swung up over his head
  // up smash: the guitar thrown up just over his head, spinning like a saw (1.5 s), the last cut sends like a smash
  usmash: {
    dur: 40, iasa: 34, charge: { at: 7, max: 60 }, pose: 'usmash', tilt: 'utilt',
    onFrame(F, W, f) {
      if (f === 10 && !F.guitarOut) {
        const c = (F.mv.charge || 0) / 60;
        const p = localToWorld(F, [0, 1.9, 0.2]);
        W.spawn('proj', { owner: F.slot, home: F.slot, x: p[0], y: p[1], z: 0, vx: 0, vy: 0, ty: F.y + 2.65, look: 'guitarSpin', custom: 'guitarSpin',
          r: 0.85, dmg: 0.9, ang: 90, kbb: 0, kbg: 0, fkb: 14, rehit: 7, dirMode: 'in', pierce: true, life: SPIN + 70, spin: 22, sfx: 'guitarHit', blood: 0.6, hitlag: 0.4,
          fin: 9 * (1 + 0.45 * c), finKbb: 40 + 12 * c, armT: 4 });
        F.guitarOut = 1;
        W.emit('guitarThrow', { s: F.slot, x: p[0], y: p[1], z: 0 });
      }
    },
    hits: [hb(9, 11, [0, 1.5, 0.45], 0.7, 7, 88, 40, 30, { sfx: 'guitarHit', blood: 0.8, dir: 'radial' })], // the throw pops a foe up into it
  },
  // down smash: the guitar slammed flat into the floor, the boards shake on both sides
  dsmash: {
    dur: 48, charge: { at: 7, max: 60 }, pose: 'dsmash', tilt: 'dtilt',
    onFrame(F, W, f) { if (f === 13) { W.emit('quake', { x: F.x, y: F.y, z: 0, k: 0.3 }); W.emit('sfx', { s: F.slot, n: 'riff' }); } },
    hits: [
      hb(13, 16, [0, 0.35, 1.1], 0.9, 14.5, 28, 36, 94, { sfx: 'guitarSmash', blood: 1.8, dir: 'away', hitlag: 1.1 }),
      hb(13, 16, [0, 0.35, -1.1], 0.9, 14.5, 28, 36, 94, { sfx: 'guitarSmash', blood: 1.8, dir: 'away', grp: 0 }),
      hb(13, 15, [0, 0.45, 0], 0.75, 11, 30, 30, 80, { sfx: 'guitarHit', blood: 1.2, dir: 'away', grp: 0 }),
    ],
  },
  // up tilt: the windmill strum, the arm wheeling over the strings
  utilt: {
    dur: 26, iasa: 19, pose: 'headbuttUp', combo: true,
    onFrame(F, W, f) { F.va[0] = f < 22 ? 1 : 0; if (f === 7) W.emit('sfx', { s: F.slot, n: 'note' }); },
    hits: [hb(7, 12, [0, 2.0, 0.3], 0.95, 6.5, 88, 26, 66, { sfx: 'guitarHit', blood: 0.8, dir: 'radial' })],
    onEnd(F) { F.va[0] = 0; },
  },

  // grab: the scarf thrown like a lasso, it catches far away (slower than a hand grab)
  grab: {
    dur: 40, pose: 'grab', groundOnly: true,
    onFrame(F, W, f) { F.va[1] = lash(f, [3, 9], 14, 24); if (f === 5) W.emit('sfx', { s: F.slot, n: 'silk' }); },
    hits: [hb(8, 13, [0, 1.05, 1.75], 0.85, 0, 0, 0, 0, { effect: 'grab' })],
    onEnd(F) { F.va[1] = 0; },
  },

  // Solo ravageur : a shred, the notes fly in a stream, the last one hits hard
  sp_n: {
    dur: 66, iasa: 60, pose: 'bite', airCtrl: 0.5,
    onFrame(F, W, f) {
      F.va[0] = f < 60 ? 1 : 0; F.va[2] = f >= 8 && f < 58 ? 1 : 0;
      if (f === 8) W.emit('sfx', { s: F.slot, n: 'shred' });
      if (f >= 10 && f <= 46 && (f - 10) % 6 === 0) {
        const k = (f - 10) / 6;
        // (17 Oct 2026, the creator: every note 1 %, without flinch, like Fox's blaster: they run through it)
        shoot(W, F, 'proj', 13 + (k % 3), { look: 'note', r: 0.34, dmg: 1, ang: 40, kbb: 0, kbg: 0, noFlinch: true, life: 38, sfx: 'hitS', blood: 0.2, b: k % 3 },
          [0, 1.05 + 0.25 * DMath.sin(k * 1.9), 0.8], F.facing, 1.2 * DMath.sin(k * 2.3));
      }
      if (f === 52) {
        shoot(W, F, 'proj', 15, { look: 'bignote', r: 0.55, dmg: 1, ang: 40, kbb: 0, kbg: 0, noFlinch: true, life: 40, sfx: 'guitarHitL', blood: 0.3 }, [0, 1.15, 0.8]);
        W.emit('sfx', { s: F.slot, n: 'riff' });
      }
    },
    onEnd(F) { F.va[0] = 0; F.va[2] = 0; },
  },

  // Power chord : one strum, a wall of sound in front of him that blows everyone away
  sp_s: {
    dur: 48, iasa: 42, pose: 'throw1', airCtrl: 0.5,
    onFrame(F, W, f) {
      F.va[0] = f < 40 ? 1 : 0; F.va[2] = f >= 10 && f < 30 ? 1 : 0;
      if (f === 12) {
        W.emit('sfx', { s: F.slot, n: 'powerchord' });
        hitNow(W, F, 'pc', [0, 1.1, 1.0], 1.0, { dmg: 9, ang: 38, kbb: 44, kbg: 70, sfx: 'guitarHitL', blood: 0.8, hitlag: 1.1 });
        shoot(W, F, 'proj', 17, { look: 'chord', r: 0.95, dmg: 7, ang: 36, kbb: 34, kbg: 58, life: 20, pierce: true, sfx: 'hitM', blood: 0.4, drag: 2.5 }, [0, 1.1, 1.0]);
      }
    },
    onEnd(F) { F.va[0] = 0; F.va[2] = 0; },
  },

  // Saut du rockeur : he leaps guitar first, the neck hits on the way up; near a ledge he flies to it
  // Guitare-balai : il chevauche sa guitare comme une sorcière son balai et vole où il veut quelques secondes
  // (le stick dans toutes les directions) ; la tête de la guitare cogne ce qu'elle croise
  sp_u: {
    dur: BROOM + 8, pose: 'jupiter', helpless: true, noGrav: [4, BROOM], airCtrl: 0, ledgeGrab: true,
    onFrame(F, W, f) {
      F.va[3] = f >= 2 && f <= BROOM ? 1 : 0; // on the broom
      if (f === 3) { F.grounded = false; F.vy = Math.max(F.vy, 6); W.emit('broomOn', { s: F.slot, x: F.x, y: F.y, z: 0 }); }
      if (f >= 4 && f <= BROOM) {
        // steered: toward the stick (8 ways), a gentle hover when it is let go
        const mag = DMath.hypot(F.mx, F.my);
        const tx = mag > 0.25 ? (F.mx / Math.max(1, mag)) * 10.5 : 0, ty = mag > 0.25 ? (F.my / Math.max(1, mag)) * 9.5 : 0.6;
        F.vx += (tx - F.vx) * 0.12; F.vy += (ty - F.vy) * 0.12;
        if (Math.abs(F.vx) > 1) F.facing = F.vx < 0 ? -Math.PI / 2 : Math.PI / 2;
        if (f % 4 === 0) W.emit('broomTrail', { s: F.slot, x: F.x, y: F.y + 0.4, z: 0 });
        // shield: off the broom
        if (f > 20 && F.bufS > 0) { F.bufS = 0; endMove(F, W); }
      }
    },
    hits: [
      hb(4, 10, [0, 0.9, 0.5], 1.0, 8, 80, 46, 66, { sfx: 'guitarHitL', blood: 1.0, dir: 'radial' }),
      hb(12, BROOM, [0, 0.55, 0.85], 0.6, 5, 45, 30, 50, { sfx: 'guitarHit', blood: 0.6, grp: 1, rehit: 30 }),
    ],
    onEnd(F) { F.va[3] = 0; },
  },

  // Larsen : the guitar held up to the amp, a screech that rings out all around him; up close it leaves you dizzy
  sp_d: {
    dur: 56, iasa: 50, pose: 'thunder', airCtrl: 0.4,
    onFrame(F, W, f) {
      F.va[0] = f < 48 ? 1 : 0; F.va[2] = f >= 8 && f < 44 ? 1 : 0;
      if (f === 8) W.emit('sfx', { s: F.slot, n: 'larsen' });
      if (f === 14) {
        hitNow(W, F, 'lz', [0, 1.0, 0], 1.45, { effect: 'stun', stun: 42, dmg: 3, sfx: 'zapS', blood: 0, dir: 'radial', unblockable: false });
        ring(W, F, { look: 'larsen', r: 0.8, grow: 12, life: 26, dmg: 5, ang: 75, kbb: 34, kbg: 42, w: 0.9, h: 1.6, sfx: 'zapS', blood: 0.2 });
      }
    },
    onEnd(F) { F.va[0] = 0; F.va[2] = 0; },
  },
};

// the blows hit as far as they look: the far edge of each hitbox brought back to where the guitar's tip (or the
// foot) gets once stretched (src/render/rig/reach.js), plus 0.2 m. Measured with tools/dev/reachcheck.js.
const REACH = { jab1: 1.39, jab2: 1.42, jab3: 1.64, ftilt2: 1.36, ftilt3: 1.64, dtilt: 1.2, fair: 1.47, bair: 1.26 };
for (const [mv, edge] of Object.entries(REACH)) {
  for (const h of moves[mv].hits) {
    const s = h.at[2] < 0 ? -1 : 1;
    if (Math.abs(h.at[2]) + h.r <= edge) continue;
    // a slimmer ball at the end of the blow (a big one pulled back would cover his own body, and hit behind him)
    h.r = Math.min(h.r, 0.55);
    h.at = [h.at[0], h.at[1], s * Math.max(0.3, edge - h.r)];
  }
}

export default {
  id: 'epektase', name: 'Epektase', title: 'Des solos ravageurs et un carré Hermès',
  color: '#d8262c',
  stats: { weight: 98, runSpeed: 8.5, walkSpeed: 3.6, airSpeed: 6.3, airAccel: 33, groundAccel: 64, friction: 46,
    jumpVel: 15.8, airJumpVel: 14.0, airJumps: 1, gravity: 1.0, fallSpeed: 17.5, height: 1.8, radius: 0.5 },
  moves,
  specialsInfo: { n: 'Solo ravageur', s: 'Power chord', u: 'Saut du rockeur', d: 'Larsen' },
};
