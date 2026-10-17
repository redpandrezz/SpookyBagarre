// PPROD : l'ingé son qui s'y connaît beaucoup trop, un gros geek. Il s'assoit sur sa chaise gamer et code : des bugs
// sortent du PC et sautent sur les adversaires ; il leur jette des pièces et des liasses de billets à la figure, des
// pizzas, et quand il court il glisse sur des spaghettis (il en laisse partout).
// Prop flags (src/render/rig/pprodRig.js): va[0] the gaming chair under him, va[1] the laptop on his lap,
// va[2] the chair spinning (the turbo chair), va[3] coins / cash in the hand, va[4] a pizza in the hand,
// va[5] the computer screen in his hands, va[6] the old PC in his hands, va[7] what the neutral A throws (1..5),
// va[8] flattened on his chair (down smash).
import { normals, dashAttack, hb, shoot, ring } from '../kit.js';
import { ENTITIES } from '../entities.js';
import { steerX } from './recovery.js';
import { DMath } from '../dmath.js';

// the money of the neutral A: a coin, a handful of coins, a wad of bills, a diamond, a gold bar, thrown in front.
// (17 Oct 2026, the creator: they went much too far (5.4 m); now ~3 m from him, the first four 1 to 2 % without flinch, like Fox's
// blaster; only the gold bar sends, a little, and the neutral A then rests 1 s: GOLD_CD)
const LOOT = [
  { look: 'coin', dmg: 1, r: 0.3 },
  { look: 'coinpile', dmg: 1.3, r: 0.36 },
  { look: 'billwad', dmg: 1.6, r: 0.36 },
  { look: 'diamond', dmg: 2, r: 0.34 },
  { look: 'goldbar', dmg: 4, kbb: 26, kbg: 44, r: 0.4 },
];
const LOOT_LIFE = 8, GOLD_CD = 60;
function lootThrow(n, next) {
  const L = LOOT[n];
  return {
    dur: n < 4 ? 15 : 30, iasa: n < 4 ? 12 : 26, pose: n % 2 ? 'jab2' : 'jab1', combo: true, next, nextWin: next ? [6, 14] : undefined, // (from 6: the throw on 5 always happens)
    onFrame(F, W, f) {
      F.va[7] = f < 5 ? n + 1 : 0;
      if (f === 5) {
        const gold = n === 4;
        shoot(W, F, 'proj', 17, { look: L.look, r: L.r, dmg: L.dmg, ang: 40, kbb: gold ? L.kbb : 0, kbg: gold ? L.kbg : 0, noFlinch: !gold, life: gold ? LOOT_LIFE + 2 : LOOT_LIFE, spin: 14,
          sfx: gold ? 'clank' : 'cash', blood: 0.3, hitlag: gold ? 1.1 : 0.6 }, [0, 1.3, 0.6], F.facing, gold ? 1 : 0.5);
        W.emit('loot', { s: F.slot, n, x: F.x + DMath.sin(F.facing) * 0.7, y: F.y + 1.3, z: 0 });
      }
    },
    onEnd(F) { F.va[7] = 0; if (n === 4) F.cd.a = F.cdMax.a = GOLD_CD; },
  };
}
// the old PC (side special): thrown in an arc, it blows up on whatever it touches
ENTITIES.crtBoom = {
  onLand(e, W) { boom(e, W); },
  onHitFighter(e, V, W) { boom(e, W); },
};
function boom(e, W) {
  if (e.boomed) return;
  e.boomed = 1; e.dead = true;
  W.addHit({ owner: e.owner, key: 'pc' + e.id, x: e.x, y: e.y + 0.4, z: 0, r: 1.7, dmg: 11, ang: 55, kbb: 34, kbg: 66, dir: 'radial',
    ent: e.id, src: 'proj', sfx: 'boom', blood: 0.6, move: 'sp_s', fx: 'boom' });
  W.emit('pcBoom', { x: e.x, y: e.y + 0.4, z: 0 });
}
// the pizza (down special): eaten by whoever it hits, it makes them bigger; the fifth in the same stock, they burst
ENTITIES.pizzaEat = {
  onHitFighter(e, V, W) {
    if (V.out || V.state === 'dead') return;
    V.pizzas = (V.pizzas || 0) + 1;
    if (V.pizzas >= 5) {
      V.pizzas = 0; V.size = 1;
      const A = W.fighters[e.owner];
      W.hitDirect(A || null, V, { dmg: 24, ang: 70, kbb: 62, kbg: 108, dir: 'radial', sfx: 'boom', blood: 2.5, hitlag: 1.5, fx: 'boom', move: 'pizza:burst', ox: V.x, oz: 0 });
      W.emit('pizzaBurst', { s: V.slot, x: V.x, y: V.y + 1.2, z: 0 });
    } else {
      V.size = 1 + V.pizzas * 0.1;
      W.emit('pizzaEat', { s: V.slot, n: V.pizzas, x: V.x, y: V.y + 1.6, z: 0 });
    }
  },
};

// the bugs out of the PC: they hop along the ground toward the nearest foe
ENTITIES.bug = {
  stepExtra(e) { if (e.t % 2 === 0) e.a = (e.a || 0) + 0.6; },
};
// the spaghetti he slides on: a slippery trail where he passed
function spaghetti(W, F, r = 1.3, life = 300) {
  W.spawn('puddle', { owner: F.slot, x: F.x, y: F.y, z: 0, r, life, look: 'spaghetti', safeOwner: true });
}

const moves = {
  ...normals({ power: 1.0, reach: 1.02, speed: 1.04, sfxS: 'slap', sfxM: 'hitM', sfxL: 'hitL' }),
  // side A tapped twice: an elbow; three times: a lunging roundhouse (his own clips, not the kit's backside and head)
  ftilt2: {
    dur: 26, iasa: 20, pose: 'jab2', next: 'ftilt3', nextWin: [14, 24], combo: true,
    vel: [{ f: [5, 8], fwd: 3 }],
    hits: [hb(9, 11, [0, 1.25, 0.8], 0.6, 5, 40, 16, 40, { sfx: 'hitM', blood: 0.6 })],
  },
  ftilt3: {
    dur: 34, iasa: 30, pose: 'ftilt',
    vel: [{ f: [6, 10], fwd: 4.5 }],
    hits: [hb(11, 14, [0, 1.15, 1.0], 0.6, 8.5, 40, 34, 88, { sfx: 'hitL', blood: 1.4, hitlag: 1.15 })],
  },
  // neutral A: five throws in a row, short range: a coin, a handful of coins, a wad of bills, a diamond, a gold bar
  // (the last one sends a little)
  jab1: lootThrow(0, 'jab2'),
  jab2: lootThrow(1, 'jab3'),
  jab3: lootThrow(2, 'jab4'),
  jab4: lootThrow(3, 'jab5'),
  jab5: lootThrow(4, null),
  // side smash: his computer screen brought down hard in front of him
  smash: {
    dur: 48, charge: { at: 8, max: 60 }, pose: 'smash', tilt: 'ftilt',
    onFrame(F, W, f) { F.va[5] = f < 36 ? 1 : 0; },
    vel: [{ f: [11, 13], fwd: 3.5 }],
    hits: [
      hb(14, 17, [0, 1.0, 1.15], 0.72, 17, 38, 42, 98, { sfx: 'clank', blood: 2.2, hitlag: 1.25 }),
      hb(14, 17, [0, 1.3, 0.55], 0.6, 13, 40, 34, 90, { sfx: 'hitL', blood: 1.4, grp: 0 }),
    ],
    onEnd(F) { F.va[5] = 0; },
  },
  // down smash: on his office chair, he goes flat and wide, spinning like a top: it sends both sides when he flattens
  dsmash: {
    dur: 46, charge: { at: 6, max: 60 }, pose: 'dsmash', tilt: 'dtilt',
    onFrame(F, W, f) {
      F.va[0] = f < 36 ? 1 : 0; F.va[2] = f >= 6 && f < 30 ? 1 : 0;
      F.va[8] = f < 9 ? 0 : f < 12 ? (f - 8) / 3 : f < 22 ? 1 : f < 30 ? 1 - (f - 21) / 8 : 0;
      if (f === 11) W.emit('pprodFlat', { s: F.slot, x: F.x, y: F.y + 0.5, z: 0 });
    },
    hits: [
      hb(11, 15, [0, 0.55, 1.1], 0.62, 14, 30, 38, 92, { sfx: 'hitL', blood: 1.6, dir: 'away', hitlag: 1.15 }),
      hb(11, 15, [0, 0.55, -1.1], 0.62, 14, 30, 38, 92, { sfx: 'hitL', blood: 1.6, dir: 'away', grp: 0 }),
      hb(11, 14, [0, 0.55, 0], 0.6, 10, 30, 30, 80, { sfx: 'hitM', blood: 1, dir: 'away', grp: 0 }),
    ],
    onEnd(F) { F.va[0] = 0; F.va[2] = 0; F.va[8] = 0; },
  },
  // up smash: on the chair, spinning, he rises a little: a flurry of hits, the last one sends up
  usmash: {
    dur: 48, charge: { at: 6, max: 60 }, pose: 'jupiter', tilt: 'utilt',
    vel: [{ f: [8, 9], up: 6.5 }],
    onFrame(F, W, f) { F.va[0] = f < 40 ? 1 : 0; F.va[2] = f >= 6 && f < 36 ? 1 : 0; if (f > 10 && f < 30 && !F.grounded) F.vy = Math.max(F.vy, -0.5); },
    hits: [
      hb(9, 29, [0, 1.0, 0.1], 1.0, 1.4, 85, 0, 0, { fkb: 16, rehit: 4, sfx: 'hitS', blood: 0.4, dir: 'radial', link: 1 }),
      hb(31, 33, [0, 1.4, 0.1], 1.1, 6, 88, 42, 96, { sfx: 'hitL', blood: 1.4, dir: 'radial', grp: 1, hitlag: 1.2 }),
    ],
    onEnd(F) { F.va[0] = 0; F.va[2] = 0; },
  },
  // A while running: a long slide on a plate of spaghetti, feet first, it leaves the pasta behind
  dashattack: dashAttack({ pose: 'slide', boost: 13, fric: 9, dur: 46, iasa: 42,
    onStart(F, W) { spaghetti(W, F, 1.5, 360); W.emit('sfx', { s: F.slot, n: 'splat' }); },
    onFrame(F, W, f) { if (f === 18) spaghetti(W, F, 1.3, 300); },
    hits: [
      hb(4, 9, [0, 0.4, 0.95], 0.75, 9, 30, 40, 70, { sfx: 'hitM', blood: 0.8 }),
      hb(10, 26, [0, 0.35, 0.85], 0.65, 4, 70, 30, 40, { sfx: 'hitS', blood: 0.4, grp: 1 }),
    ] }),

  // Compilation : he sits on his gaming chair, codes on his laptop, the bugs come out of it, then the 404 window
  sp_n: {
    dur: 72, iasa: 66, pose: 'bite', airCtrl: 0.3,
    onFrame(F, W, f) {
      F.va[0] = f < 66 ? 1 : 0; F.va[1] = f >= 4 && f < 62 ? 1 : 0;
      if (f === 6) W.emit('sfx', { s: F.slot, n: 'typing' });
      if (f === 20 || f === 32 || f === 44) {
        const k = (f - 20) / 12;
        shoot(W, F, 'proj', 6.5 + k, { look: 'bug', custom: 'bug', r: 0.36, dmg: 4, ang: 50, kbb: 18, kbg: 40, life: 150, grav: 1.2, bounce: 0.9,
          home: 0.05, homeDelay: 12, homeRange: 12, sfx: 'zapS', blood: 0.2, armT: 3 }, [0, 0.9, 0.7], F.facing, 6 + k);
        W.emit('sfx', { s: F.slot, n: 'blip' });
      }
      if (f === 54) {
        shoot(W, F, 'proj', 11, { look: 'popup', r: 0.6, dmg: 8, ang: 40, kbb: 32, kbg: 62, life: 46, sfx: 'zap', blood: 0.3 }, [0, 1.15, 0.8]);
        W.emit('sfx', { s: F.slot, n: 'error' });
      }
    },
    onEnd(F) { F.va[0] = 0; F.va[1] = 0; },
  },

  // Vieux PC : il balance un vieil ordinateur à écran cathodique, qui explose sur ce qu'il touche
  sp_s: {
    dur: 44, iasa: 38, pose: 'throw2', airCtrl: 0.5,
    onFrame(F, W, f) {
      F.va[6] = f < 14 ? 1 : 0;
      if (f === 14) {
        shoot(W, F, 'proj', 11, { look: 'crtpc', custom: 'crtBoom', r: 0.5, dmg: 4, ang: 45, kbb: 10, kbg: 20, life: 90, grav: 1.1, spin: 6, sfx: 'clank', blood: 0.3 }, [0, 1.5, 0.6], F.facing, 6);
        W.emit('sfx', { s: F.slot, n: 'throw' });
      }
    },
    onEnd(F) { F.va[6] = 0; },
  },

  // Pizza : une pizza lancée ; celui qu'elle touche la mange et grossit ; à la cinquième dans la même vie, il éclate
  sp_d: {
    dur: 40, iasa: 34, pose: 'throw1', airCtrl: 0.6,
    onFrame(F, W, f) {
      F.va[4] = f < 14 ? 1 : 0;
      if (f === 14) {
        shoot(W, F, 'proj', 12, { look: 'pizza', custom: 'pizzaEat', r: 0.55, dmg: 3, ang: 70, kbb: 4, kbg: 6, life: 62, grav: 0.35, bounce: 0.5, spin: 14, sfx: 'gulp', blood: 0 },
          [0, 1.2, 0.7], F.facing, 3);
        W.emit('sfx', { s: F.slot, n: 'throw' });
      }
    },
    onEnd(F) { F.va[4] = 0; },
  },

  // Chaise turbo : his gaming chair rockets him up, spinning (it hits on the way); near a ledge it flies to it
  sp_u: {
    dur: 62, pose: 'jupiter', helpless: true, noGrav: [6, 42], airCtrl: 0.5, ledgeGrab: true,
    onFrame(F, W, f) {
      F.va[0] = f < 50 ? 1 : 0; F.va[2] = f >= 6 && f < 44 ? 1 : 0;
      if (f === 5) W.emit('sfx', { s: F.slot, n: 'helico' });
      if (f < 6 && !F.grounded) F.vy = Math.max(F.vy, -1);
      if (f === 6) { F.grounded = false; }
      if (f >= 6 && f <= 42) {
        { F.vy = 18 - (f - 6) * 0.27; steerX(F, 9.5); } // no pull to the ledge: steered, it has to get there
      }
    },
    onEnd(F) { F.va[0] = 0; F.va[2] = 0; },
    // whoever the spinning chair catches is carried up with it (hits all along), the last one sends a little
    hits: [
      hb(6, 9, [0, 0.9, 0.3], 1.0, 3, 82, 10, 10, { sfx: 'hitM', blood: 0.6, drag: [0.5, 0.3, 14] }),
      hb(10, 40, [0, 0.8, 0.1], 0.95, 1.1, 85, 10, 10, { rehit: 5, sfx: 'hitS', blood: 0.3, grp: 1, drag: [0.5, 0.3, 12] }),
      hb(42, 44, [0, 0.9, 0.3], 1.05, 4, 78, 32, 60, { sfx: 'hitM', blood: 0.8, dir: 'radial', grp: 2 }),
    ],
  },
};

export default {
  id: 'pprod', name: 'PPROD', title: "L'ingé son beaucoup trop geek",
  color: '#9aa4b4',
  stats: { weight: 96, runSpeed: 9.0, walkSpeed: 3.5, airSpeed: 6.1, airAccel: 33, groundAccel: 62, friction: 40,
    jumpVel: 15.4, airJumpVel: 13.8, airJumps: 1, gravity: 1.0, fallSpeed: 17.5, height: 1.78, radius: 0.5 },
  moves,
  specialsInfo: { n: 'Compilation', s: 'Vieux PC (il explose)', u: 'Chaise turbo', d: 'Pizza (5 et ça éclate)' },
};
