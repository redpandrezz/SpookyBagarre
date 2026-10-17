// BIDO : le deuxième poids lourd, gros dégâts, grosses éjections, plus lent. Un lover qui se bat avec son matériel
// de muscu (haltère, kettlebell, barre de squat, corde à sauter en fouet) et ses bisous : celui qu'un bisou touche,
// c'est BIDO qui le dirige quelques secondes.
import { normals, dashAttack, hb, shoot, ring } from '../kit.js';
import { ENTITIES } from '../entities.js';
import { startMove, endMove } from '../fighter.js';
import { steerX } from './recovery.js';

// the kiss: on contact BIDO takes control of the one it hit (2.5 s), standing still meanwhile, lost in love
const CHARM = 130;
ENTITIES.charmKiss = {
  onHitFighter(e, V, W) {
    const F = W.fighters[e.owner];
    if (!F || F.out || V.out || V.state === 'dead') return;
    V.ctrlBy = F.slot; V.ctrlT = CHARM;
    W.emit('charmed', { s: V.slot, a: F.slot, x: V.x, y: V.y + 1.9, z: 0 });
    if (F.state !== 'dead' && F.state !== 'respawn') startMove(F, W, 'bidoLove', { victim: V.slot });
  },
};

// a fresh table at each call: the init passes (archetypes, specialTuning, reachFit) change the moves in place, so a
// fighter that borrows this moveset (Kerrian) gets its own copy
export function bidoMoves() {
  return {
  ...normals({ power: 1.14, reach: 1.06, speed: 0.86, sfxS: 'punchHeavy', sfxM: 'punchHeavy', sfxL: 'punchHeavy', smashLunge: 0.7 }),
  // A while running: its own dash attack
  dashattack: dashAttack({ pose: 'lariat', boost: 10, fric: 22, dur: 40, iasa: 36, hits: [hb(8, 11, [0, 1.4, 0.95], 0.95, 13, 42, 54, 82, { sfx: 'punchHeavy', blood: 1.8, hitlag: 1.25 })] }),

  // neutral A: one big blow of the dumbbell (it reaches, a bit slow, it sends)
  jab1: {
    dur: 34, iasa: 30, pose: 'jab1',
    onFrame(F) { F.va[0] = 1; }, onEnd(F) { F.va[0] = 0; },
    vel: [{ f: [7, 10], fwd: 3 }],
    hits: [hb(11, 14, [0, 1.15, 1.05], 0.65, 9, 40, 40, 72, { sfx: 'clank', blood: 1.5, hitlag: 1.2 })],
  },
  // side smash: the kettlebell swung full force
  smash: {
    dur: 50, charge: { at: 8, max: 60 }, pose: 'smash', tilt: 'ftilt',
    onFrame(F, W, f) { F.va[1] = f < 38 ? 1 : 0; },
    vel: [{ f: [12, 14], fwd: 4 }],
    hits: [
      hb(15, 18, [0, 1.15, 1.25], 0.75, 18, 34, 44, 96, { sfx: 'clank', blood: 2.4, hitlag: 1.3 }),
      hb(15, 18, [0, 1.0, 0.55], 0.62, 14, 38, 34, 92, { sfx: 'punchHeavy', blood: 1.6, grp: 0 }),
    ],
    onEnd(F) { F.va[1] = 0; },
  },
  // up smash: a squat with the loaded barbell: down low with it while charging, pressed up on the release
  usmash: {
    dur: 50, charge: { at: 7, max: 60 }, pose: 'jupiter', tilt: 'utilt',
    onFrame(F, W, f) { F.va[2] = f >= 1 && f <= 34 ? 1 : 0; },
    hits: [
      hb(12, 16, [0, 2.35, 0.1], 1.2, 18, 87, 42, 98, { sfx: 'clank', blood: 2, dir: 'radial', hitlag: 1.2 }),
      hb(11, 13, [0, 1.3, 0.5], 0.7, 12, 80, 34, 88, { sfx: 'clank', blood: 1.4, dir: 'radial', grp: 0 }),
    ],
    onEnd(F) { F.va[2] = 0; },
  },
  // down smash: bent over, both hands slammed into the floor (the ground shakes a little around him)
  dsmash: {
    dur: 48, charge: { at: 6, max: 60 }, pose: 'drum', tilt: 'dtilt',
    onFrame(F, W, f) {
      if (f === 11) {
        ring(W, F, { r: 0.4, grow: 9, life: 12, dmg: 11, ang: 60, kbb: 34, kbg: 70, w: 0.6, h: 0.8, look: 'shock', sfx: 'quake', blood: 0.5 });
        W.emit('quake', { x: F.x, y: F.y, z: 0, k: 0.5 });
      }
    },
    hits: [
      hb(11, 14, [0, 0.3, 0.8], 0.62, 16, 35, 40, 94, { sfx: 'punchHeavy', blood: 1.8, dir: 'away', hitlag: 1.2 }),
      hb(11, 14, [0, 0.3, -0.5], 0.55, 13, 35, 36, 88, { sfx: 'punchHeavy', blood: 1.4, dir: 'away', grp: 0 }),
    ],
  },

  // Bisou : un cœur qui file vers l'ennemi ; touché, c'est BIDO qui le dirige 2,5 s (BIDO, lui, reste figé, en amour)
  sp_n: {
    dur: 34, iasa: 28, pose: 'bite', airCtrl: 0.6,
    onFrame(F, W, f) {
      if (f === 6) W.emit('sfx', { s: F.slot, n: 'kiss' });
      if (f === 10) {
        shoot(W, F, 'proj', 9.5, { look: 'heart', custom: 'charmKiss', r: 0.45, dmg: 4, ang: 90, kbb: 0, kbg: 0, life: 90, home: 0.06, homeDelay: 6, homeRange: 12, spin: 0, sfx: 'heart', blood: 0, hitlag: 0.6 }, [0, 1.55, 0.6], F.facing, 0.5);
      }
    },
  },
  // (BIDO while he steers his victim: frozen in his heart pose; over when the charm is)
  bidoLove: {
    dur: CHARM + 10, pose: 'thunder', noCd: true,
    onFrame(F, W, f) {
      const V = W.fighters[F.mv.victim];
      if (!V || V.ctrlBy !== F.slot) { endMove(F, W); return; }
      if (f % 15 === 0) W.emit('charmTick', { s: V.slot, x: V.x, y: V.y + 2.0, z: 0 });
    },
  },

  // Corde à sauter : la corde claque comme un fouet trois fois devant lui (rapide) ; la troisième éjecte
  sp_s: {
    dur: 40, iasa: 36, pose: 'throw1', airCtrl: 0.4,
    onFrame(F, W, f) {
      // the rope out to the tip of each crack (F.va[5]: its length), back in between
      const cr = [6, 14, 22];
      let len = 0;
      for (const c of cr) if (f >= c - 3 && f <= c + 3) len = Math.max(len, 2.0 * (1 - Math.abs(f - c) / 4));
      F.va[5] = Math.max(0.35, len); F.va[6] = 1;
      if (cr.includes(f - 1)) W.emit('ropeCrack', { s: F.slot, n: cr.indexOf(f - 1) });
    },
    onEnd(F) { F.va[5] = 0; F.va[6] = 0; },
    hits: [
      hb(6, 7, [0, 1.25, 2.1], 0.5, 4, 35, 8, 18, { sfx: 'whip', blood: 0.8, link: 1 }),
      hb(6, 7, [0, 1.25, 1.2], 0.45, 3, 35, 8, 18, { sfx: 'whip', blood: 0.5, grp: 0, link: 1 }),
      hb(14, 15, [0, 1.15, 2.1], 0.5, 4, 35, 8, 18, { sfx: 'whip', blood: 0.8, grp: 2, link: 1 }),
      hb(14, 15, [0, 1.15, 1.2], 0.45, 3, 35, 8, 18, { sfx: 'whip', blood: 0.5, grp: 2, link: 1 }),
      hb(22, 23, [0, 1.25, 2.1], 0.55, 8, 40, 38, 72, { sfx: 'whip', blood: 1.4, grp: 4, hitlag: 1.15 }),
      hb(22, 23, [0, 1.25, 1.2], 0.5, 6, 40, 32, 64, { sfx: 'whip', blood: 1, grp: 4 }),
    ],
  },

  // Flex : une pose de culturiste, des ondes d'amour autour de lui ; ceux qu'elles touchent restent sous le charme
  // (étourdis)
  sp_d: {
    dur: 50, iasa: 44, pose: 'thunder', airCtrl: 0.3,
    onFrame(F, W, f) {
      if (f === 6) W.emit('sfx', { s: F.slot, n: 'kiss' });
      if (f === 14) {
        W.addHit({ owner: F.slot, key: 'bc' + F.mseq, x: F.x, y: F.y + 1.0, z: 0, r: 2.3, dmg: 5, ang: 70, kbb: 0, kbg: 0, dir: 'radial', effect: 'stun', stun: 55, sfx: 'heart', blood: 0, move: 'sp_d', fx: 'love' });
        W.emit('hearts', { s: F.slot, x: F.x, y: F.y + 1.2, z: 0, n: 16 });
        W.emit('loveWave', { s: F.slot, x: F.x, y: F.y + 1.0, z: 0 });
      }
    },
  },

  // Ballon-cœur : un énorme ballon en cœur le soulève, lentement mais longtemps (haut pour monter plus vite) ;
  // il frappe une fois au départ (moins qu'un smash)
  sp_u: {
    dur: 104, pose: 'jupiter', helpless: true, noGrav: [6, 94], airCtrl: 0.3, ledgeGrab: true,
    onFrame(F, W, f) {
      F.va[4] = f >= 4 && f <= 96 ? 1 : 0;
      if (f === 6) { F.grounded = false; W.emit('sfx', { s: F.slot, n: 'kiss' }); }
      if (f >= 6 && f <= 94) {
        F.vy += (8.5 + F.my * 4 - F.vy) * 0.15;
        steerX(F, 7.5, 0.1);
        if (f % 12 === 0) W.emit('hearts', { s: F.slot, x: F.x, y: F.y + 2.4, z: 0, n: 2 });
      }
    },
    hits: [hb(6, 12, [0, 1.0, 0.35], 1.1, 8, 80, 40, 64, { sfx: 'heart', blood: 0.3, dir: 'radial', fx: 'love' })],
    onEnd(F) { F.va[4] = 0; },
  },
  };
}

export default {
  id: 'bido', name: 'BIDO', title: 'Des muscles, de l\'amour, des bisous qui cognent',
  color: '#ff6fb1',
  stats: { weight: 125, runSpeed: 7.8, walkSpeed: 3.2, airSpeed: 5.6, airAccel: 28, groundAccel: 54, friction: 42,
    jumpVel: 14.8, airJumpVel: 13, airJumps: 1, gravity: 1.06, fallSpeed: 19.5, height: 1.9, radius: 0.62 },
  moves: bidoMoves(),
  specialsInfo: { n: 'Bisou (on le dirige)', s: 'Corde à sauter', u: 'Ballon-cœur', d: 'Flex (sous le charme)' },
};
