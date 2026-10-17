// Ronare (21e perso, 17 oct. 2026) : le gardien, bassiste et DJ. Son modèle vient du site de Meshy
// (tools/blender/fbx_textured.py, riggé par tools/meshy/meshy.py rig --glb, texture refaite par tools/blender/rebake.py),
// ses animations sont recopiées d'autres persos sur son squelette (tools/art/meshy_transfer.py : celles de Pandrezz, les
// coups de guitare d'Epektase, le scratch d'OMFU, le tapis d'Aboueb, le frisbee de Tices).
// Son moveset (le créateur, 17 oct. 2026) :
//   A : trois coups classiques, le troisième éjecte un peu ; smash avant : un gros coup de basse vers l'avant ; smash
//   bas : il se met à l'envers et frappe le sol avec sa tête en pinte (dégâts de zone) ; smash haut : la basse en arc
//   vers le haut, tout autour ;
//   B : des vinyles lancés (ils repoussent un peu) ; B bas : une platine sous ses pieds, l'onde étourdit ; B côté : un
//   jack lancé dans la direction voulue, il ramène l'adversaire contre lui, un court étourdissement à l'arrivée (comme les
//   boucles d'Aboueb) ; B haut : assis en tailleur sur un vinyle, il monte (comme le tapis d'Aboueb).
// Drapeaux pour l'affichage (src/render/rig/ronareRig.js) : va[0] la basse en main, va[1] le poirier du smash bas
// (0 debout .. 1 à l'envers), va[2] la platine sous ses pieds, va[3] le vinyle volant, va[4] la longueur du jack,
// va[5] son angle, va[6] un vinyle dans la main.
import { normals, dashAttack, hb, shoot, ring } from '../kit.js';
import { endMove, stunFor } from '../fighter.js';
import { localToWorld } from '../util.js';
import { steerX } from './recovery.js';
import { DMath } from '../dmath.js';

// --- the jack: out of his right hand (JACK_H up), toward `ang` (0 ahead, up positive) ---------------------------------
const JACK_H = 1.3, JACK_MAX = 3.4;
const jackAt = (len, ang) => [0, JACK_H + DMath.sin(ang) * (0.3 + len), DMath.cos(ang) * (0.3 + len)];

// the bass in his hands for a smash: out of nowhere at the start, gone at the end
const bass = (n) => ({ onStart(F) { F.va[0] = 1; }, onFrame(F, W, f) { F.va[0] = f < n ? 1 : 0; }, onEnd(F) { F.va[0] = 0; } });

const moves = {
  ...normals({ power: 1.0, reach: 1.0, speed: 1.0, sfxS: 'hitS', sfxM: 'hitM', sfxL: 'hitL' }),
  // neutral A: the kit's three classic blows (a jab, a cross, a stronger one that sends a little)
  // A while running: a flying side kick (Pandrezz's take, his clip)
  dashattack: dashAttack({ pose: 'slide', boost: 12, fric: 13, dur: 36, iasa: 32,
    hits: [hb(6, 11, [0, 1.0, 0.95], 0.75, 10, 38, 42, 72, { sfx: 'hitM', blood: 1.1 }), hb(12, 18, [0, 1.0, 0.85], 0.6, 6, 45, 30, 50, { sfx: 'hitS', blood: 0.6, grp: 1 })] }),

  // side smash: the bass swung forward with both hands, the head of the neck hits hardest
  smash: {
    dur: 50, charge: { at: 8, max: 60 }, pose: 'smash', tilt: 'ftilt', ...bass(44),
    vel: [{ f: [12, 14], fwd: 4.5 }],
    hits: [
      hb(15, 18, [0, 1.05, 1.55], 0.75, 17, 36, 40, 100, { sfx: 'guitarSmash', blood: 2.2, hitlag: 1.25 }),
      hb(15, 18, [0, 1.05, 0.75], 0.7, 14, 38, 34, 94, { sfx: 'guitarHitL', blood: 1.6, grp: 0 }),
    ],
  },
  // up smash: the bass in a circle, from in front, over his head, down behind: it hits all along
  usmash: {
    dur: 48, charge: { at: 7, max: 60 }, pose: 'usmash', tilt: 'utilt', ...bass(42),
    hits: [
      hb(10, 11, [0, 1.0, 1.2], 0.8, 8, 80, 30, 50, { sfx: 'guitarHit', blood: 0.8, dir: 'radial' }),
      hb(12, 15, [0, 2.15, 0.6], 0.95, 16, 86, 38, 98, { sfx: 'guitarSmash', blood: 2.0, dir: 'radial', hitlag: 1.15, grp: 1 }),
      hb(12, 15, [0, 2.3, -0.2], 0.85, 15, 90, 36, 96, { sfx: 'guitarHitL', blood: 1.6, dir: 'radial', grp: 1 }),
      hb(16, 18, [0, 1.4, -1.0], 0.75, 10, 70, 32, 80, { sfx: 'guitarHit', blood: 1.0, dir: 'radial', grp: 2 }),
    ],
  },
  // down smash: a jump into a headstand, the head (a pint) slammed into the floor; the shock spreads both ways
  dsmash: {
    dur: 52, charge: { at: 4, max: 60 }, pose: 'pint', tilt: 'dtilt',
    onFrame(F, W, f) {
      F.va[1] = f < 6 ? 0 : f < 13 ? (f - 6) / 7 : f < 36 ? 1 : Math.max(0, 1 - (f - 36) / 12);
      if (f === 13) {
        W.emit('pintSmash', { s: F.slot, x: F.x, y: F.y, z: 0 });
        W.emit('quake', { x: F.x, y: F.y, z: 0, k: 0.3 });
      }
    },
    onEnd(F) { F.va[1] = 0; },
    hits: [
      hb(13, 16, [0, 0.3, 0], 1.5, 16, 70, 36, 94, { sfx: 'glass', blood: 1.8, dir: 'radial', hitlag: 1.2 }),
      hb(14, 18, [0, 0.3, 1.6], 0.75, 11, 35, 32, 84, { sfx: 'hitL', blood: 1.0, dir: 'away', grp: 1 }),
      hb(14, 18, [0, 0.3, -1.6], 0.75, 11, 35, 32, 84, { sfx: 'hitL', blood: 1.0, dir: 'away', grp: 1 }),
    ],
  },

  // Vinyles : two records flung like frisbees, one after the other (moderate damage, a little push)
  sp_n: {
    dur: 40, iasa: 34, pose: 'throw1', airCtrl: 0.5,
    onFrame(F, W, f) {
      F.va[6] = f < 11 || (f >= 13 && f < 19) ? 1 : 0;
      if (f === 11 || f === 19) {
        shoot(W, F, 'proj', 15, { look: 'vinyl', r: 0.42, dmg: 5, ang: 32, kbb: 18, kbg: 30, life: 30, spin: 22, sfx: 'hitM', blood: 0.4, grp: 'v' + F.mseq },
          [0, 1.25, 0.6], F.facing, f === 19 ? 1.4 : 0);
        W.emit('sfx', { s: F.slot, n: 'cdThrow' });
      }
    },
    onEnd(F) { F.va[6] = 0; },
  },

  // Jack : thrown toward the stick (ahead by default, up, down; back: he turns round), it catches whoever it touches
  // and reels them in against him, a short stun when they arrive; off stage, it plugs into the edge and pulls him there
  sp_s: {
    dur: 58, pose: 'throw1', airCtrl: 0.2, noGrav: [0, 24], ledgeGrab: true,
    onStart(F) {
      F.mv.len = 0; F.mv.caught = -1;
      if (F.mx * DMath.sin(F.facing) < -0.3) F.facing = -F.facing;
      const fw = Math.abs(F.mx), up = F.my;
      F.mv.ang = fw < 0.25 && Math.abs(up) < 0.25 ? 0 : Math.max(-0.9, Math.min(1.2, DMath.atan2(up, Math.max(fw, 0.001))));
      if (!F.grounded) F.vy = Math.max(F.vy, 0) * 0.3;
    },
    onFrame(F, W, f) {
      F.va[5] = F.mv.ang;
      if (!F.grounded) { F.vx *= 0.9; if (F.vy < 0) F.vy *= 0.6; }
      if (f === 4) W.emit('sfx', { s: F.slot, n: 'whip' });
      if (F.mv.zip) {
        const dx = F.mv.tx - F.x, dy = F.mv.ty - F.y, d = DMath.hypot(dx, dy);
        F.va[4] = Math.max(0, d - 0.4);
        if (d < 1.1 || f > 40) { F.mv.zip = 0; F.vx = 0; F.vy = 0; endMove(F, W); return; }
        F.vx = (dx / d) * 22; F.vy = (dy / d) * 22;
        return;
      }
      // reeling in the one it caught: carried on the plug until it stands right in front of him
      if (F.mv.caught >= 0) {
        const V = W.fighters[F.mv.caught];
        F.mv.len = Math.max(0.5, F.mv.len - 0.6);
        F.va[4] = F.mv.len;
        if (V && !V.out && V.state !== 'dead' && V.state !== 'respawn') {
          const tip = jackAt(F.mv.len, F.mv.ang);
          V.carryBy = F.slot; V.carryT = 3; V.carryX = DMath.sin(F.facing) * tip[2]; V.carryY = Math.max(0, tip[1] - 1.05) * (F.grounded ? 0.3 : 1);
          V.hitstun = Math.max(V.hitstun, 4);
          if (F.mv.len <= 0.5) {
            V.carryT = 0;
            if (stunFor(V, 16)) W.emit('jackStun', { s: V.slot, x: V.x, y: V.y + 1, z: V.z });
            F.mv.caught = -1; F.mv.len = 0.5; F.mf = Math.max(F.mf, 40); // its end (18 frames) outlasts the stun (16)
          }
        } else F.mv.caught = -1;
        return;
      }
      if (f >= 5 && f <= 20) {
        F.mv.len = Math.min(JACK_MAX, F.mv.len + 0.3);
        F.va[4] = F.mv.len;
        const tip = localToWorld(F, jackAt(F.mv.len, F.mv.ang));
        W.addHit({ owner: F.slot, key: 'rj' + F.mseq, x: tip[0], y: tip[1], z: 0, r: 0.5, dmg: 5, ang: 20, fkb: 12,
          dir: 'in', ox: F.x, oz: 0, sfx: 'zap', blood: 0.6, move: 'sp_s', hitlag: 0.8, fx: 'zap', onHit: (V) => { if (V) F.mv.caught = V.slot; } });
        // off stage: the plug finds the edge of the platform and pulls him there
        if (!F.grounded) {
          const m = W.stage.main();
          const top = W.stage.heightAt(m, tip[0], 0);
          if (Math.abs(Math.abs(tip[0] - m.cx) - m.r) < 1.0 && tip[1] > top - 2.4 && tip[1] < top + 1.0 && Math.abs(F.x - m.cx) > m.r - 0.3) {
            const nx = tip[0] < m.cx ? -1 : 1;
            F.mv.zip = 1; F.mv.tx = m.cx + nx * (m.r + 0.3); F.mv.ty = top - 1.3;
            F.jumps = Math.max(F.jumps, 1);
          }
        }
      } else if (f > 20) { F.mv.len = Math.max(0, Math.min(F.mv.len, JACK_MAX) - 0.45); F.va[4] = F.mv.len; }
    },
    onEnd(F, W) { F.va[4] = 0; const V = W && W.fighters[F.mv.caught]; if (V && V.carryBy === F.slot) V.carryT = 0; },
  },

  // Platine : a turntable under his feet, he drops the needle: the wave stuns whoever it reaches
  sp_d: {
    dur: 48, iasa: 42, pose: 'jupiter', airCtrl: 0.3,
    onFrame(F, W, f) {
      F.va[2] = f < 6 ? f / 6 : f < 38 ? 1 : Math.max(0, 1 - (f - 38) / 8);
      if (f === 6) W.emit('sfx', { s: F.slot, n: 'vinylScratch' });
      if (f === 14) {
        ring(W, F, { look: 'vinyl', r: 0.6, grow: 10, life: 16, w: 0.6, h: 1.6, dmg: 3, effect: 'stun', stun: 55, sfx: 'scratch', blood: 0 });
        W.emit('sfx', { s: F.slot, n: 'bassDrop' });
        W.emit('turntable', { s: F.slot, x: F.x, y: F.y, z: 0 });
      }
    },
    onEnd(F) { F.va[2] = 0; },
  },

  // Vinyle volant : cross-legged on a big record, he goes up, steered; a foe it catches is carried, the last hit sends
  sp_u: {
    dur: 72, pose: 'jupiter', helpless: true, noGrav: [4, 58], airCtrl: 0.3, ledgeGrab: true,
    onFrame(F, W, f) {
      if (f === 4) { F.grounded = false; W.emit('sfx', { s: F.slot, n: 'carpet' }); W.emit('sfx', { s: F.slot, n: 'scratch' }); }
      if (f >= 4 && f <= 58) {
        F.va[3] = 1;
        F.vy = 12.5 - Math.max(0, f - 40) * 0.35 + F.my * 3;
        steerX(F, 8.5, 0.12);
      } else F.va[3] = Math.max(0, F.va[3] - 0.08);
    },
    hits: [
      hb(5, 8, [0, 0.4, 0.3], 1.25, 3, 85, 10, 10, { sfx: 'scratch', blood: 0.5, drag: [0.55, 0.15, 14] }),
      hb(11, 46, [0, 0.4, 0.3], 1.1, 1.0, 85, 10, 10, { sfx: 'hitS', blood: 0.3, drag: [0.55, 0.15, 14], rehit: 6, grp: 1 }),
      hb(48, 50, [0, 0.6, 0.4], 1.25, 4, 78, 46, 86, { sfx: 'hitL', blood: 1.2, dir: 'radial', grp: 2 }),
    ],
    onEnd(F) { F.va[3] = 0; },
  },
};

export default {
  id: 'ronare', name: 'Ronare', title: 'Le gardien. La basse, les platines, la pinte.',
  color: '#e8b93a',
  stats: { weight: 102, runSpeed: 8.4, walkSpeed: 3.6, airSpeed: 6.4, airAccel: 34, groundAccel: 64, friction: 46,
    jumpVel: 16.2, airJumpVel: 14.2, airJumps: 1, gravity: 1.0, fallSpeed: 17.5, height: 1.85, radius: 0.55 },
  moves,
  specialsInfo: { n: 'Vinyles', s: 'Jack (dans la direction voulue)', u: 'Vinyle volant', d: 'Platine (étourdit)' },
};
