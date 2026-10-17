// KERRIAN : gilet cargo, pantalon baggy, Paraboot aux lacets rouges et l'air blasé (modèle Meshy). Un bagarreur de
// rue diabétique : droite, gauche, coup de tête ; crochets, genou, coups de hache à deux mains ; il plaque à la
// taille et finit en suplex allemand. Ses spéciaux : l'insuline (il se soigne, sinon il lance la seringue), un
// café brûlant, un dash nerveux vers le haut (deux fois, 2 % chacun) et une fourchette géante.
// Handicap : le diabète lui coûte 15 % toutes les 30 s de combat (tick) ; l'insuline les lui rend.
import { normals, dashAttack, hb, shoot, fwd } from '../kit.js';
import { setState, startMove } from '../fighter.js';
import { localToWorld, faceSign } from '../util.js';
import { cone } from './friendKit.js';
import { steerX } from './recovery.js';

const INSULIN_CD = 900;     // 15 s between two injections
const INSULIN_HEAL = 15;    // %
const DIABETES_EVERY = 1800; // 30 s of play
const DIABETES_DMG = 15;     // %
const DASH_SELF = 2;         // % that each hollow dash costs him

// a hot coffee burn: the same small hits over time as a fire (friendKit's burn entity), brown steam on screen
function scald(W, owner, V, ticks = 9, dmg = 0.8) {
  for (const o of W.entities) if (o.kind === 'burn' && o.look === 'coffee' && o.vic === V.slot && !o.dead) { o.life = Math.max(o.life, ticks * 20); return o; }
  W.emit('scalded', { x: V.x, y: V.y + 1, z: V.z, s: V.slot });
  return W.spawn('burn', { owner, vic: V.slot, x: V.x, y: V.y, z: V.z, life: ticks * 20 + 2, dmg, look: 'coffee' });
}

// the throws: grabbed at the waist like a tackle, then carried along a path (local [right, up, forward]) and let go
// at frame 13: back, a German suplex over his head into the floor behind; down, slammed on the floor in front;
// forward, a running tackle that throws; up, heaved straight up
function throwMove() {
  return {
    dur: 30, pose: 'throw',
    onFrame(F, W, f) {
      const V = W.fighters[F.mv.victim];
      if (!V || V.grabbedBy !== F.slot) return;
      const k = Math.min(1, f / 13), a = k * Math.PI;
      const kind = F.mv.kind || 'f';
      const at = kind === 'b' ? [0, 0.3 + Math.sin(a) * 1.15, Math.cos(a) * 0.75 - (k > 0.85 ? 0.15 : 0)]
        : kind === 'u' ? [0, 0.3 + k * 1.15, 0.6 - k * 0.3]
          : kind === 'd' ? (f < 8 ? [0, 0.3 + (f / 8) * 0.5, 0.65] : [0, 0.8 - ((f - 8) / 5) * 0.8, 0.65 + ((f - 8) / 5) * 0.35])
            : [0, 0.5 + Math.sin(a) * 0.25, 0.7 + k * 0.5];
      if (kind === 'f' && f < 12) F.vx = faceSign(F.facing) * 4.5; // the tackle runs a few steps
      const p = localToWorld(F, at);
      V.x = p[0]; V.y = p[1]; V.z = p[2];
      if (f === 13) {
        V.grabbedBy = -1;
        setState(V, 'air');
        const T = {
          f: { dmg: 9, ang: 35, kbb: 72, kbg: 62 },
          b: { dmg: 11, ang: -55, kbb: 62, kbg: 52, spike: 1 }, // into the floor behind him: it bounces back up
          u: { dmg: 8, ang: 90, kbb: 74, kbg: 64 },
          d: { dmg: 7, ang: -82, kbb: 62, kbg: 30, spike: 1 },
        }[kind];
        if (T.spike) V.grounded = false;
        W.hitDirect(F, V, { dmg: T.dmg, ang: T.ang, kbb: T.kbb, kbg: T.kbg, spike: T.spike, sfx: 'punchHeavy', blood: 2.2, dir: 'face', dirAngle: F.facing, hitlag: 1.25, key: 'throw' + F.mseq });
        if (T.spike) W.emit('quake', { x: V.x, y: V.y, z: V.z, k: kind === 'b' ? 0.45 : 0.25 });
      }
    },
  };
}

export function kerrianMoves() {
  const N = normals({ power: 1.06, reach: 1.0, speed: 0.95, sfxS: 'hitM', sfxM: 'punchHeavy', sfxL: 'punchHeavy', smashLunge: 0.6 });
  return {
    ...N,
    // neutral A: right, left, then the head
    jab3: {
      dur: 32, iasa: 28, pose: 'headbutt',
      vel: [{ f: [4, 7], fwd: 3 }],
      hits: [hb(8, 11, [0, 1.55, 0.85], 0.62, 6, 42, 38, 90, { sfx: 'punchHeavy', blood: 1.5, hitlag: 1.15 })],
    },
    // side A: a hook
    ftilt: {
      dur: 26, iasa: 21, pose: 'jab3', combo: true,
      vel: [{ f: [5, 8], fwd: 2 }],
      hits: [hb(7, 9, [0, 1.15, 0.95], 0.7, 8, 38, 30, 72, { sfx: 'punchHeavy', blood: 1.1 })],
    },
    // up A: a knee
    utilt: {
      dur: 24, iasa: 18, pose: 'uair', combo: true,
      hits: [hb(5, 8, [0, 1.15, 0.5], 0.65, 7, 86, 34, 84, { sfx: 'hitM', blood: 0.9 })],
    },
    // down A: an axe blow, both hands locked
    dtilt: {
      dur: 30, iasa: 25, pose: 'smash', combo: true,
      hits: [hb(10, 12, [0, 0.45, 1.0], 0.72, 9, 72, 32, 62, { sfx: 'punchHeavy', blood: 1.2 })],
    },
    // side smash: a big Paraboot kick
    smash: {
      dur: 46, charge: { at: 9, max: 60 }, pose: 'ftilt', tilt: 'ftilt',
      vel: [{ f: [12, 14], fwd: 3 }],
      hits: [
        hb(13, 16, [0, 0.95, 1.25], 0.8, 17, 38, 40, 98, { sfx: 'punchHeavy', blood: 2.2, hitlag: 1.3 }),
        hb(13, 16, [0, 0.8, 0.55], 0.6, 13, 40, 34, 90, { sfx: 'punchHeavy', blood: 1.5, grp: 0 }),
      ],
    },
    // up smash: an uppercut
    usmash: {
      dur: 44, charge: { at: 7, max: 60 }, pose: 'usmash', tilt: 'utilt',
      hits: [
        hb(9, 13, [0, 1.95, 0.45], 0.85, 16, 88, 40, 96, { sfx: 'punchHeavy', blood: 2, hitlag: 1.2 }),
        hb(8, 10, [0, 1.0, 0.6], 0.6, 10, 80, 60, 40, { sfx: 'hitM', blood: 1, grp: 0 }),
      ],
    },
    // down smash: the axe, planted in the floor in front, then behind
    dsmash: {
      dur: 48, charge: { at: 6, max: 60 }, pose: 'smash', tilt: 'dtilt',
      onFrame(F, W, f) { if (f === 14 || f === 20) W.emit('quake', { x: F.x, y: F.y, z: 0, k: 0.35 }); },
      hits: [
        hb(14, 17, [0, 0.3, 1.05], 0.75, 15, 35, 40, 92, { sfx: 'punchHeavy', blood: 1.8, dir: 'away', hitlag: 1.2 }),
        hb(20, 23, [0, 0.3, -1.0], 0.7, 13, 35, 38, 88, { sfx: 'punchHeavy', blood: 1.4, dir: 'away', grp: 2 }),
      ],
    },
    // A while running: a charged hook
    dashattack: dashAttack({ pose: 'jab3', boost: 9, fric: 24, dur: 38, iasa: 34, hits: [hb(9, 12, [0, 1.15, 0.9], 0.8, 11, 40, 50, 80, { sfx: 'punchHeavy', blood: 1.6, hitlag: 1.2 })] }),
    // the grab: a tackle at the waist (a short lunge, the hands low)
    grab: {
      dur: 34, pose: 'grab', groundOnly: true,
      vel: [{ f: [3, 8], fwd: 5 }],
      hits: [hb(6, 11, [0, 0.75, 0.7], 0.55, 0, 0, 0, 0, { effect: 'grab' })],
    },
    throw: throwMove(),

    // Insuline : prête (toutes les 15 s), il se pique le bras et se soigne de 15 % (le coup `insulin`) ; sinon il
    // lance la seringue comme une fléchette (petits dégâts, presque pas d'éjection : jamais un KO)
    sp_n: {
      dur: 28, pose: 'throw1', airCtrl: 0.6,
      cdBypass: () => true, // the insulin's 15 s never block the special: meanwhile it is the dart
      onStart(F, W) {
        if (F.cd.n > 0) return;
        F.cd.n = F.cdMax.n = INSULIN_CD;
        startMove(F, W, 'insulin');
      },
      onFrame(F, W, f) {
        F.va[0] = f < 9 ? 1 : 0; // the syringe in his hand until it flies
        if (f === 9) shoot(W, F, 'proj', 17, { look: 'syringe', r: 0.22, dmg: 3, ang: 25, kbb: 6, kbg: 8, life: 50, spin: 0, sfx: 'hitS', blood: 0.4, hitlag: 0.6 }, [0, 1.4, 0.6], F.facing, 0.4);
      },
      onEnd(F) { F.va[0] = 0; },
    },
    insulin: {
      dur: 44, pose: 'throw1', airCtrl: 0.6, noCd: true,
      onFrame(F, W, f) {
        F.va[0] = 1; F.va[1] = 1; // the syringe, in his arm
        if (f === 8) W.emit('insulin', { s: F.slot, x: F.x, y: F.y + 1.3, z: 0 });
        if (f === 20) {
          F.damage = Math.max(0, F.damage - INSULIN_HEAL);
          W.emit('heal', { s: F.slot, x: F.x, y: F.y + 2.1, z: 0, n: INSULIN_HEAL });
        }
      },
      onEnd(F) { F.va[0] = 0; F.va[1] = 0; },
    },

    // Hot Coffee : un jet de café brûlant devant lui ; ceux qu'il touche brûlent 3 s (petits dégâts qui durent)
    sp_s: {
      dur: 46, iasa: 40, pose: 'shotgun', airCtrl: 0.4,
      onFrame(F, W, f) {
        F.va[2] = f < 36 ? 1 : 0; // the cup in his hand
        if (f === 6) W.emit('sfx', { s: F.slot, n: 'glug' });
        if (f >= 12 && f <= 30) {
          if (f % 2 === 0) W.emit('coffee', { s: F.slot, x: F.x, y: F.y + 1.3, z: 0, a: F.facing, len: 2.6 });
          if (f % 4 === 0) cone(W, F, 'kc', 2.4, 1.3, 0.6, { dmg: 0.8, ang: 30, fkb: 10, sfx: 'hitS', fx: 'coffee', blood: 0,
            onHit: (V, W2, hv) => scald(W2, hv.owner, V) });
        }
      },
      onEnd(F) { F.va[2] = 0; },
    },

    // Hollow Dash : un dash nerveux tout droit vers le haut, deux fois par saut ; chacun lui coûte 2 %
    sp_u: {
      dur: 26, pose: 'uair', helpless: true, airCtrl: 0.5, ledgeGrab: true, upUses: 2, noGrav: [4, 16],
      onStart(F, W) {
        F.damage = Math.min(999, F.damage + DASH_SELF);
        F.mv.n = Math.max(0, Math.min(1, (F.upN || 1) - 1));
        W.emit('selfHurt', { s: F.slot, x: F.x, y: F.y + 2.0, z: 0, n: DASH_SELF });
      },
      onFrame(F, W, f) {
        if (f < 4) { F.vy = Math.max(F.vy * 0.4, -0.5); F.vx *= 0.6; }
        if (f === 4) { F.grounded = false; W.emit('hollowDash', { s: F.slot, x: F.x, y: F.y, z: 0, n: F.mv.n }); }
        if (f >= 4 && f <= 14) { F.vy = 21; steerX(F, 3.5, 0.3); }
        if (f === 15) F.vy = 5;
      },
    },

    // Fourchette géante : elle tombe du ciel juste devant lui et se plante dans le sol (ceux qui sont dessous
    // décollent ; elle se voit venir)
    sp_d: {
      dur: 40, iasa: 36, pose: 'smash', airCtrl: 0.3,
      onFrame(F, W, f) {
        if (f === 3) {
          const p = fwd(F, 1.7);
          W.spawn('strike', { owner: F.slot, x: p[0], y: F.y, z: 0, look: 'fork', warn: 14, life: 26, r: 0.9, dmg: 14, ang: 78, kbb: 45, kbg: 72, sfx: 'stab' });
        }
      },
    },
  };
}

export default {
  id: 'kerrian', name: 'KERRIAN', title: 'Blasé, diabétique, en Paraboot',
  color: '#ff8a2b',
  stats: { weight: 112, runSpeed: 8.4, walkSpeed: 3.4, airSpeed: 5.8, airAccel: 30, groundAccel: 54, friction: 40,
    jumpVel: 15.0, airJumpVel: 13.2, airJumps: 1, gravity: 1.04, fallSpeed: 19, height: 1.85, radius: 0.6 },
  moves: kerrianMoves(),
  // the diabetes: 15 % every 30 s of play (not during the minigames or an ultimate: the world is frozen then)
  tick(F, W) {
    if (W.phase !== 'play' || F.out || F.state === 'dead' || F.state === 'respawn') return;
    if (W.phaseT > 0 && W.phaseT % DIABETES_EVERY === 0) {
      F.damage = Math.min(999, F.damage + DIABETES_DMG);
      F.stats.taken += DIABETES_DMG;
      W.emit('diabetes', { s: F.slot, x: F.x, y: F.y + 2.1, z: 0, n: DIABETES_DMG });
    }
  },
  specialsInfo: { n: 'Insuline (soin 15 %, sinon seringue)', s: 'Hot Coffee (brûlure)', u: 'Hollow Dash (×2, 2 % chacun)', d: 'Fourchette géante' },
};
