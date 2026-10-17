// ANBUU : pieds nus, il flotte comme par magie (il se déplace comme Mewtwo), des petites ailes d'ange dans le dos ;
// il joue le lick interdit (les sept notes du cliché jazz) et invoque de saintes 808 très bassy.
// Un perso de magie : presque tout passe par l'aura et l'énergie (la boule au bout de la main, la lumière, les ailes).
// Prop flags (src/render/rig/anbuuRig.js): va[0] the wings spread (the flight, the down smash), va[1] the waveform
// in his hands, va[2] the ball of energy at his palm (neutral A).
import { normals, dashAttack, hb, shoot, ring, rapidJab } from '../kit.js';
import { steerX } from './recovery.js';
import { ENTITIES } from '../entities.js';
import { stunFor } from '../fighter.js';
import { localToWorld } from '../util.js';

// a beam of light out of his palm (the side smash: like Pandrezz's kamehameha; the up smash: to the sky)
function lightBeam(F, W, at, b, o) {
  const c = (F.mv.charge || 0) / 60;
  const e = W.spawn('beam', { owner: F.slot, at, a: F.facing, b, c, look: 'holy', r: o.r, max: o.max + o.maxC * c, life: o.life, tick: o.tick,
    fin: o.fin * (1 + 0.45 * c), finAng: o.finAng, finKbb: o.finKbb + 12 * c, finKbg: o.finKbg, grow: o.grow, finFx: 'light', tickFx: 'light', tickAng: o.tickAng });
  const p = localToWorld(F, at); e.x = p[0]; e.y = p[1]; e.z = p[2];
  F.mv.beam = e.id;
  W.emit('holyFire', { s: F.slot, c: 0.25 + c * 0.4, x: p[0], y: p[1], z: p[2], up: b > 0 ? 1 : 0 });
  return e;
}

const moves = {
  ...normals({ power: 0.96, reach: 1.06, speed: 1.05, sfxS: 'slap', sfxM: 'hitM', sfxL: 'hitL' }),
  // side A tapped twice: an elbow; three times: a lunging roundhouse (his own clips)
  ftilt2: {
    dur: 26, iasa: 20, pose: 'jab2', next: 'ftilt3', nextWin: [14, 24], combo: true,
    vel: [{ f: [5, 8], fwd: 3 }],
    hits: [hb(9, 11, [0, 1.2, 0.8], 0.6, 5, 40, 16, 40, { sfx: 'hitM', blood: 0.6 })],
  },
  ftilt3: {
    dur: 34, iasa: 30, pose: 'ftilt',
    vel: [{ f: [6, 10], fwd: 4.5 }],
    hits: [hb(11, 14, [0, 1.15, 1.0], 0.6, 8.5, 40, 34, 88, { sfx: 'hitL', blood: 1.4, hitlag: 1.15 })],
  },
  // neutral A: his hand held out; mashing A grows a ball of energy at its end that keeps hitting; let go, it bursts
  jab1: { ...rapidJab({ loop: [5, 17], every: 4, start: 4, tail: 4, at: [0, 1.25, 1.0], r: 0.55, dmg: 1.0, ang: 80, kbb: 3, kbg: 3, fkb: 8, sfx: 'zapS', blood: 0.2,
    finisher: 'jab3', pose: 'jab1', extra: { fx: 'light' },
    onFrame(F) { F.va[2] = Math.min(1.3, 0.35 + ((F.mv.loops || 0) + F.mf / 17) * 0.14); } }), onEnd(F) { if (F.move !== 'jab3') F.va[2] = 0; } },
  jab3: {
    dur: 26, iasa: 22, pose: 'jab3',
    onStart(F, W) { W.emit('orbPop', { s: F.slot, x: F.x + Math.sin(F.facing) * 1.0, y: F.y + 1.25, z: 0 }); },
    onFrame(F, W, f) { F.va[2] = f < 3 ? 1.3 + f * 0.3 : Math.max(0, 2.2 - (f - 3) * 0.5); },
    hits: [hb(2, 5, [0, 1.25, 1.0], 0.72, 4.5, 40, 36, 64, { sfx: 'zap', blood: 0.4, fx: 'light', hitlag: 1.1 })],
    onEnd(F) { F.va[2] = 0; },
  },
  // side smash: Pandrezz's kamehameha, in light (he is an angel): short, it sends far
  smash: {
    dur: 50, charge: { at: 9, max: 60 }, pose: 'kame', tilt: 'ftilt',
    onCharge(F) { F.va[2] = 0.3 + (F.mv.charge / 60) * 0.6; },
    onFrame(F, W, f) {
      if (f < 13) F.va[2] = Math.max(F.va[2], (f / 13) * 0.35);
      if (f === 13) { lightBeam(F, W, [0, 1.25, 0.55], 0, { r: 0.5, max: 2.3, maxC: 1.1, life: 15, tick: 1.4, fin: 13, finAng: 36, finKbb: 40, finKbg: 96, grow: 90 }); F.va[2] = 0; }
    },
    onEnd(F) { F.va[2] = 0; },
  },
  // down smash: his wings spread wide and slam the floor on both sides (a wide reach)
  dsmash: {
    dur: 46, charge: { at: 6, max: 60 }, pose: 'dsmash', tilt: 'dtilt',
    onFrame(F, W, f) { F.va[0] = f >= 4 && f <= 30 ? 1 : 0; if (f === 11) W.emit('wingSlam', { s: F.slot, x: F.x, y: F.y, z: 0 }); },
    hits: [
      hb(11, 15, [0, 0.4, 1.55], 0.7, 14, 30, 36, 92, { sfx: 'hitL', blood: 1.2, dir: 'away', fx: 'light', hitlag: 1.15 }),
      hb(11, 15, [0, 0.4, -1.55], 0.7, 14, 30, 36, 92, { sfx: 'hitL', blood: 1.2, dir: 'away', fx: 'light', grp: 0 }),
      hb(11, 14, [0, 0.55, 0.7], 0.55, 11, 32, 30, 84, { sfx: 'hitM', blood: 0.8, dir: 'away', grp: 0 }),
      hb(11, 14, [0, 0.55, -0.7], 0.55, 11, 32, 30, 84, { sfx: 'hitM', blood: 0.8, dir: 'away', grp: 0 }),
    ],
    onEnd(F) { F.va[0] = 0; },
  },
  // up smash: a beam of light straight up to the sky (long, not endless): it holds whoever is in it, then sends
  usmash: {
    dur: 50, charge: { at: 7, max: 60 }, pose: 'thunder', tilt: 'utilt',
    onFrame(F, W, f) {
      if (f === 11) lightBeam(F, W, [0, 2.15, 0.2], Math.PI / 2, { r: 0.55, max: 5.5, maxC: 1.5, life: 26, tick: 1.1, fin: 10, finAng: 88, finKbb: 42, finKbg: 96, grow: 80, tickAng: 90 });
    },
  },
  // A while running: a psychic shove, both palms forward, he glides into it
  dashattack: dashAttack({ pose: 'jab3', boost: 12, fric: 11, dur: 36, iasa: 32,
    hits: [hb(5, 10, [0, 1.0, 0.95], 0.75, 8, 38, 40, 70, { sfx: 'zap', blood: 0.6, fx: 'zap' })] }),

  // Le Lick : the seven notes of the forbidden jazz lick, one after the other (the last one the strongest)
  sp_n: {
    dur: 56, iasa: 50, pose: 'bite', airCtrl: 0.5,
    onFrame(F, W, f) {
      const k = (f - 6) / 5;
      if (f >= 6 && f <= 36 && (f - 6) % 5 === 0) {
        const last = k === 6;
        // (17 Oct 2026, the creator: every note 1 %, without flinch, like Fox's blaster: they run through it)
        shoot(W, F, 'proj', last ? 13 : 11, { look: 'jazznote', b: k, r: last ? 0.45 : 0.32, dmg: 1, ang: 30,
          kbb: 0, kbg: 0, noFlinch: true, life: 48, sfx: 'zapS', blood: 0.1 },
          [0, 1.3 + Math.sin(k * 1.3) * 0.2, 0.6], F.facing, Math.sin(k * 1.7) * 1.5);
        W.emit('anbuuLick', { s: F.slot, n: k });
      }
    },
  },

  // Confusion : une onde courte devant lui, qui sonne et fait léviter un instant (comme le côté B de Mewtwo)
  sp_s: {
    dur: 38, iasa: 32, pose: 'throw1', airCtrl: 0.4,
    onFrame(F, W, f) {
      if (f === 8) W.emit('psyWave', { s: F.slot, x: F.x + Math.sin(F.facing) * 1.1, y: F.y + 1.15, z: 0, a: F.facing });
    },
    hits: [hb(8, 12, [0, 1.15, 1.1], 0.85, 6, 90, 0, 0, { sfx: 'zapS', blood: 0, fx: 'light',
      onHit: (V, W) => { if (stunFor(V, 42)) { V.levT = 42; V.grounded = false; V.vy = 3; V.y += 0.05; W.emit('levitate', { s: V.slot, x: V.x, y: V.y + 1.9, z: 0 }); } } })],
  },

  // Sainte 808 : he stomps, a holy 808 drops in front of him, the bass drop pushes everyone away
  sp_d: {
    dur: 58, iasa: 52, pose: 'bite', airCtrl: 0.3,
    onFrame(F, W, f) {
      if (f === 4) W.emit('anbuu808', { s: F.slot, n: 1 });
      if (f === 18) {
        const fx = Math.sin(F.facing) * 1.4;
        // from high up in the sky (a shadow warns where it lands), it crashes and blows up
        W.spawn('proj', { owner: F.slot, x: F.x + fx, y: F.y + 9, z: 0, vx: 0, vy: -24, vz: 0, dir: F.facing, look: 'holy808', r: 0.8, dmg: 8,
          ang: 70, kbb: 30, kbg: 50, life: 60, grav: 0, sfx: 'hitL', blood: 1, custom: 'holy808', hitlag: 1.2, landBelow: F.y + 0.5, noHit: true }); // (the blast hits, not the fall)
        W.emit('skyWarn', { s: F.slot, x: F.x + fx, y: F.y, z: 0 });
      }
    },
  },

  // Envol : the little angel wings carry him up (they hit on the way); steered with the stick
  sp_u: {
    dur: 50, pose: 'jupiter', noTrail: true, helpless: true, noGrav: [4, 34], airCtrl: 0.6, ledgeGrab: true,
    onFrame(F, W, f) {
      F.va[0] = f < 40 ? 1 : 0;
      if (f === 3) W.emit('anbuuWings', { s: F.slot, up: 1 });
      if (f < 4 && !F.grounded) F.vy = Math.max(F.vy, -1);
      if (f === 4) F.grounded = false;
      if (f >= 4 && f <= 34) { F.vy = 17 - (f - 4) * 0.3; steerX(F, 8.5); }
    },
    onEnd(F) { F.va[0] = 0; },
    hits: [
      hb(4, 8, [0, 1.4, 0.2], 0.95, 7, 80, 46, 66, { sfx: 'hitM', blood: 0.6, dir: 'radial' }),
      hb(9, 22, [0, 1.3, 0], 0.8, 2, 80, 20, 30, { sfx: 'hitS', blood: 0.2, grp: 1, rehit: 6, dir: 'radial' }),
    ],
  },

  // L'ULTIME (ultimate.js) : trois poses qui s'enchaînent pendant la scène (les ailes ouvertes, va[0])
  ult_a: { dur: 400, pose: 'jupiter', noTrail: true },
  ult_b: { dur: 400, pose: 'kame', noTrail: true },
  ult_c: { dur: 400, pose: 'thunder', noTrail: true },
};

// the holy 808: it falls, lands with the bass drop (a ring along the floor), and is gone
ENTITIES.holy808 = {
  onLand(e, W) { drop(e, W); },
  onHitFighter(e, V, W) { drop(e, W); },
};
function drop(e, W) {
  if (e.dropped) return;
  e.dropped = 1; e.dead = true;
  // the blast where it crashed, then the bass along the floor
  W.addHit({ owner: e.owner, key: 'h8' + e.id, x: e.x, y: e.y + 0.6, z: 0, r: 1.9, dmg: 13, ang: 65, kbb: 40, kbg: 74, dir: 'radial',
    ent: e.id, src: 'proj', sfx: 'boom', blood: 0.8, move: 'sp_d', fx: 'boom', hitlag: 1.2 });
  W.spawn('ring', { owner: e.owner, x: e.x, y: e.y, z: 0, r: 0.6, grow: 10, life: 20, dmg: 4, ang: 45, kbb: 30, kbg: 40, look: 'bass', sfx: 'hitM', blood: 0.2 });
  W.emit('anbuu808', { s: e.owner, n: 2, x: e.x, y: e.y });
  W.emit('speakerCrash', { x: e.x, y: e.y + 0.5, z: 0 });
}

export default {
  id: 'anbuu', name: 'ANBUU', title: 'Le lick interdit et les saintes 808',
  color: '#f2e6a0',
  stats: { weight: 79, runSpeed: 9.0, walkSpeed: 3.6, airSpeed: 6.8, airAccel: 30, groundAccel: 64, friction: 40,
    jumpVel: 15.4, airJumpVel: 17, airJumps: 1, gravity: 0.95, fallSpeed: 17, height: 1.74, radius: 0.46 },
  moves,
  // LICK DIVIN : il s'élève, les ailes grandes ouvertes, et lance un rayon de lumière devant lui ; ceux qu'il touche sont
  // pris dans les sept notes du lick interdit, la dernière est la sainte 808 qui les envoie au ciel
  ult: {
    id: 'lick', name: 'LICK DIVIN', sub: 'Le lick interdit · sainte 808',
    colors: ['#fff1a8', '#ff6fd8', '#6fd8ff'], // doré, rose, bleu clair : la scène, les traînées, l'aura
    moves: ['ult_a', 'ult_b', 'ult_c'],
    intro: 54, strike: 26, whiff: 22, // images : la pose, le rayon, (à vide) le temps de finir
    reach: 11, aim: [-1.2, 1.0], // la zone devant lui : le rayon part droit devant, il faut bien viser (écart de hauteur des pieds, en m)
    hold: [2.4, 1.6, 1.5, 0.35], // où il tient ses victimes : devant (m), écart entre elles, hauteur, écart de hauteur
    notes: 7, every: 13, noteDmg: 2.1, // les sept notes : 6 petites, la 7e est le coup final
    final: { dmg: 19, ang: 42, kbb: 62, kbg: 53 },
  },
  specialsInfo: { n: 'Le Lick', s: 'Confusion (lévitation)', u: 'Envol', d: 'Sainte 808 (elle tombe du ciel)' },
};
