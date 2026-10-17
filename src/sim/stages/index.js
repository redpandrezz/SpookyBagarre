// The nine arenas (simulation side: surfaces and hazards). Visuals live in src/render/stages/.
// Every arena is a circular platform floating above something nasty. The fight is played in 2D, on the plane
// z = 0 that cuts through the middle of the disc: what counts is the width of each platform along x.
import { ENTITIES } from '../entities.js';
import { setState } from '../fighter.js';
import { DT } from '../constants.js';
import { DMath } from '../dmath.js';

// --- generic hazards -----------------------------------------------------------------------------------------
// telegraphed strike on an area (lightning, fork, gas geyser...)
ENTITIES.strike = {
  pack: (e) => [e.look || 'lightning', e.r, e.warn, 0],
  unpack: (e, x) => { if (x) { [e.look, e.r, e.warn] = x; } },
  defaults: () => ({ life: 100, warn: 70, r: 1.9, dmg: 15, ang: 80, kbb: 45, kbg: 70, look: 'lightning' }),
  step(e, W) { if (e.t === e.warn) W.emit('strike', { k: e.look, x: e.x, y: e.y, z: e.z, r: e.r }); },
  hits(e) {
    if (e.t < e.warn || e.t > e.warn + 4) return null;
    // a fighter's strike (Kerrian's giant fork: owner >= 0) is his attack: it can be shielded, it counts as his move
    const own = e.owner >= 0;
    return { owner: e.owner, key: 'e' + e.id, shape: 'capsule', x: e.x, y: e.y - 0.5, z: e.z, x2: e.x, y2: e.y + 4, z2: e.z, r: e.r,
      dmg: e.dmg, ang: e.ang, kbb: e.kbb, kbg: e.kbg, dir: 'radial', ent: e.id, src: 'proj', sfx: e.sfx || 'zap', blood: 1.8, unblockable: !own, move: own ? e.srcMove || 'sp_d' : 'hazard:' + e.look, fx: e.look, spike: e.spike };
  },
};

// a long bar sweeping across the platform (giant grater, wave)
ENTITIES.sweeper = {
  pack: (e) => [e.look || 'grater', e.a, e.warn, e.len],
  unpack: (e, x) => { if (x) { [e.look, e.a, e.warn, e.len] = x; } },
  defaults: () => ({ life: 300, warn: 90, speed: 7, len: 12, a: 0, dmg: 12, ang: 50, kbb: 40, kbg: 65, look: 'grater', h0: 0.25, h1: 1.2 }),
  step(e, W) {
    if (e.t === e.warn) W.emit('sweep', { k: e.look, id: e.id });
    if (e.t >= e.warn) { e.x += DMath.sin(e.a) * e.speed * DT; e.z += DMath.cos(e.a) * e.speed * DT; }
  },
  hits(e) {
    if (e.t < e.warn) return null;
    const px = DMath.cos(e.a), pz = -DMath.sin(e.a); // perpendicular
    const hl = e.len;
    return { owner: -1, key: 'e' + e.id, shape: 'capsule', x: e.x - px * hl, y: e.y + (e.h0 + e.h1) / 2, z: e.z - pz * hl,
      x2: e.x + px * hl, y2: e.y + (e.h0 + e.h1) / 2, z2: e.z + pz * hl, r: (e.h1 - e.h0) / 2 + 0.25,
      dmg: e.dmg, ang: e.ang, kbb: e.kbb, kbg: e.kbg, fkb: e.fkb, dir: e.a, ent: e.id, src: 'proj', sfx: e.sfx || 'grateHeavy', blood: e.blood ?? 2, rehit: 40, unblockable: e.unblockable, move: 'hazard:' + e.look, fx: e.look };
  },
};

function randomSpot(W, R) {
  return [(W.rng() * 2 - 1) * R, 0];
}

// aim at a random fighter most of the time (keeps the hazard relevant)
function hazardSpot(W, R) {
  const alive = W.list.filter((F) => !F.out && F.state !== 'dead' && F.state !== 'respawn' && Math.abs(F.x) < R + 1);
  if (alive.length && W.rng() < 0.75) {
    const F = alive[Math.floor(W.rng() * alive.length)];
    return [Math.max(-R, Math.min(R, F.x + (W.rng() - 0.5) * 3)), 0];
  }
  return randomSpot(W, R);
}

// a sweeper crosses the stage from one side to the other (a = +pi/2: from the left)
const sideAngle = (W) => (W.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);

const MAIN = (r, extra = {}) => ({ cx: 0, cz: 0, y: 0, r, solid: true, thick: 1.4, depth: 6.5, ...extra });

// --- the stages ----------------------------------------------------------------------------------------------
export const STAGES = {
  cemetery: {
    id: 'cemetery', name: 'Cimetière de la Bagarre', bpm: 112, music: 'cemetery',
    blurb: 'Une dalle de crypte qui flotte au-dessus des tombes. La foudre aime les vivants.',
    surfaces: [
      MAIN(13),
      { cx: -6.2, cz: -0.6, y: 3.4, r: 2.5, soft: true },
      { cx: 6.2, cz: -0.6, y: 3.4, r: 2.5, soft: true },
      { cx: 0, cz: -0.9, y: 6.6, r: 2.6, soft: true },
    ],
    init(S) { S.vars.next = 60 * 14; },
    step(S, W) {
      for (let i = 1; i <= 3; i++) { const s = S.surfaces[i]; const ny = (i === 3 ? 6.6 : 3.4) + DMath.sin(S.t * 0.02 + i * 2) * 0.3; s.dy = ny - s.y; s.y = ny; }
      if (!W.rules.hazards || W.phase !== 'play') return;
      if (--S.vars.next <= 0) {
        S.vars.next = 60 * (11 + W.rng() * 8);
        const [x, z] = hazardSpot(W, 12);
        W.spawn('strike', { x, y: 0, z, look: 'lightning', warn: 75, life: 100, r: 1.8, dmg: 16, sfx: 'thunder' });
      }
    },
  },

  swamp: {
    id: 'swamp', name: 'Marais Croâssant', bpm: 96, music: 'swamp',
    blurb: 'Un nénuphar géant sur un marais toxique. Les petits nénuphars coulent sous vos pieds.',
    surfaces: [
      MAIN(12),
      ...[-19.4, -14.9, 14.9, 19.4].map((x, i) => ({ cx: x, cz: i % 2 ? 1.0 : -1.2, y: 0, r: 2.0, soft: true, pad: 1 })),
    ],
    init(S) { S.vars.next = 60 * 10; S.vars.sink = [0, 0, 0, 0, 0]; S.vars.down = [0, 0, 0, 0, 0]; },
    step(S, W) {
      for (let i = 1; i <= 4; i++) {
        const s = S.surfaces[i];
        const occupied = W.list.some((F) => F.grounded && F.surf === i && F.state !== 'dead');
        if (S.vars.down[i] > 0) { if (--S.vars.down[i] === 0) { s.active = true; S.vars.sink[i] = 0; } }
        else if (occupied) S.vars.sink[i] += 0.012;
        else S.vars.sink[i] = Math.max(0, S.vars.sink[i] - 0.004);
        if (S.vars.sink[i] > 1) { s.active = false; S.vars.down[i] = 300; W.emit('padSink', { i }); }
        const ny = -S.vars.sink[i] * 1.2 + DMath.sin(S.t * 0.03 + i) * 0.08;
        s.dy = ny - s.y; s.y = ny;
      }
      if (!W.rules.hazards || W.phase !== 'play') return;
      if (--S.vars.next <= 0) {
        S.vars.next = 60 * (8 + W.rng() * 6);
        const [x, z] = hazardSpot(W, 11.5);
        W.spawn('strike', { x, y: 0, z, look: 'gas', warn: 80, life: 110, r: 1.6, dmg: 9, ang: 88, kbb: 70, kbg: 40, sfx: 'gas' });
      }
    },
  },

  elysee: {
    id: 'elysee', name: 'Élysée Hanté', bpm: 104, music: 'elysee',
    blurb: 'La rotonde présidentielle tourne lentement au-dessus d\'un Paris fantôme. Le tampon tombe sans vote.',
    surfaces: [MAIN(13, { spin: 0.1 }), { cx: -5.4, cz: 0, y: 3.8, r: 2.4, soft: true }, { cx: 5.4, cz: 0, y: 3.8, r: 2.4, soft: true }],
    init(S) { S.vars.next = 60 * 15; },
    step(S, W) {
      if (!W.rules.hazards || W.phase !== 'play') return;
      if (--S.vars.next <= 0) {
        S.vars.next = 60 * (14 + W.rng() * 8);
        const [x, z] = hazardSpot(W, 12);
        W.spawn('stamp', { owner: -1, x, y: 0, z, a: W.rng() * 6.28 });
      }
    },
  },

  diner: {
    id: 'diner', name: 'Diner de la Mort', bpm: 120, music: 'diner',
    blurb: 'Un burger géant au-dessus d\'un diner américain abandonné. La fourchette du géant a faim.',
    surfaces: [MAIN(13.5), { cx: 0, cz: 0, y: 4.4, r: 3.6, soft: true, spin: -0.25 }],
    init(S) { S.vars.next = 60 * 12; },
    step(S, W) {
      const top = S.surfaces[1];
      const ny = 4.4 + DMath.sin(S.t * 0.015) * 0.6;
      top.dy = ny - top.y; top.y = ny;
      if (!W.rules.hazards || W.phase !== 'play') return;
      if (--S.vars.next <= 0) {
        S.vars.next = 60 * (10 + W.rng() * 7);
        const [x, z] = hazardSpot(W, 12.5);
        if (W.rng() < 0.5) W.spawn('strike', { x, y: 0, z, look: 'fork', warn: 70, life: 96, r: 1.5, dmg: 17, ang: 75, sfx: 'stab' });
        else W.spawn('puddle', { owner: -1, x, y: 0, z, r: 2.6, life: 600, look: 'mustard' }), W.emit('squirt', { x, z });
      }
    },
  },

  cave: {
    id: 'cave', name: 'Cave d\'Affinage', bpm: 100, music: 'cave',
    blurb: 'Une meule de parmesan qui tourne dans une cave hantée. Sautez par-dessus la râpe géante.',
    surfaces: [MAIN(13, { spin: 0.17 })],
    init(S) { S.vars.next = 60 * 14; },
    step(S, W) {
      if (!W.rules.hazards || W.phase !== 'play') return;
      if (--S.vars.next <= 0) {
        S.vars.next = 60 * (14 + W.rng() * 6);
        const a = sideAngle(W);
        W.spawn('sweeper', { x: -DMath.sin(a) * 19, y: 0, z: 0, a, speed: 8, warn: 100, life: 100 + 300, len: 14, look: 'grater', dmg: 13, h0: 0.15, h1: 1.0 });
      }
    },
  },

  arena: {
    id: 'arena', name: 'Arène Pikaboo', bpm: 132, music: 'arena',
    blurb: 'Un stade fantôme. Le public jette des Humanballs : les humains sauvages frappent tout le monde.',
    surfaces: [MAIN(14), { cx: -7.4, cz: 0, y: 3.6, r: 2.7, soft: true }, { cx: 7.4, cz: 0, y: 3.6, r: 2.7, soft: true }],
    init(S) { S.vars.next = 60 * 12; },
    step(S, W) {
      if (!W.rules.hazards || W.phase !== 'play') return;
      if (--S.vars.next <= 0) {
        S.vars.next = 60 * (9 + W.rng() * 7);
        const [x, z] = randomSpot(W, 10.5);
        W.spawn('proj', { owner: -1, x, y: 15, z, vx: 0, vy: -2, vz: 0, grav: 0.7, look: 'humanball', custom: 'humanball', r: 0.35, dmg: 5, ang: 50, kbb: 20, kbg: 30, life: 240, spin: 8, sfx: 'pop' });
        W.emit('crowdThrow', { x, z });
      }
    },
  },

  village: {
    id: 'village', name: 'Village du Sahur', bpm: 118, music: 'village',
    blurb: 'Un tambour géant à l\'heure du sahur. Tous les quatre temps, la peau du tambour vous fait sauter.',
    surfaces: [MAIN(12.5), { cx: -6.0, cz: -0.8, y: 3.2, r: 2.3, soft: true }, { cx: 6.0, cz: -0.8, y: 3.2, r: 2.3, soft: true }],
    init(S) { S.vars.beat = -1; },
    step(S, W) {
      const b = Math.floor(W.realTime / (60 / W.bpm));
      if (b !== S.vars.beat) {
        S.vars.beat = b;
        if (W.phase === 'play' && W.rules.hazards && b % 4 === 0) {
          for (const F of W.list) {
            if (F.grounded && F.surf === 0 && !F.out && F.state !== 'shield') {
              F.vy = 8.5; F.grounded = false;
              if (['idle', 'walk', 'run', 'crouch', 'land'].includes(F.state)) setState(F, 'air');
            }
          }
          W.emit('drumPop', {});
        }
      }
    },
  },

  sea: {
    id: 'sea', name: 'Mer Tralala', bpm: 108, music: 'sea',
    blurb: 'Un radeau sur une mer en tempête. Il penche, il tangue, et les requins attendent dessous.',
    surfaces: [MAIN(13, { thick: 0.9, depth: 2.5 })],
    init(S) { S.vars.next = 60 * 16; },
    step(S, W) {
      const m = S.surfaces[0];
      const t = S.t / 60;
      m.tiltX = 0.055 * DMath.sin(t * 0.55);
      m.tiltZ = 0.055 * DMath.sin(t * 0.42 + 1.3);
      const ny = 0.3 * DMath.sin(t * 0.9);
      m.dy = ny - m.y; m.y = ny;
      if (!W.rules.hazards || W.phase !== 'play') return;
      if (--S.vars.next <= 0) {
        S.vars.next = 60 * (16 + W.rng() * 8);
        const a = sideAngle(W);
        W.spawn('sweeper', { x: -DMath.sin(a) * 20, y: 0, z: 0, a, speed: 9, warn: 110, life: 110 + 300, len: 15, look: 'wave', dmg: 4, fkb: 62, ang: 28, h0: 0, h1: 2.6, sfx: 'splash', blood: 0.2, unblockable: true });
      }
    },
  },

  attic: {
    id: 'attic', name: 'Grenier de la Folle Du Bus', bpm: 92, music: 'attic',
    blurb: 'Un vieux tapis rond flotte dans un grenier sans fond. Les chats de la Folle Du Bus déboulent en meute.',
    surfaces: [
      MAIN(13),
      { cx: -6.6, cz: -2.3, y: 3.0, r: 2.2, soft: true }, // the trunks stand just behind the fight line
      { cx: 6.6, cz: -2.3, y: 3.0, r: 2.2, soft: true },
      { cx: 0, cz: -1.0, y: 6.2, r: 1.9, soft: true },
    ],
    init(S) { S.vars.next = 60 * 12; S.vars.k = 0; },
    step(S, W) {
      // the trunk lids creak up and down, the cat tree sways
      for (let i = 1; i <= 3; i++) { const s = S.surfaces[i]; const base = i === 3 ? 6.2 : 3.0; const ny = base + DMath.sin(S.t * 0.025 + i * 1.7) * 0.25; s.dy = ny - s.y; s.y = ny; }
      if (!W.rules.hazards || W.phase !== 'play') return;
      if (--S.vars.next <= 0) {
        S.vars.next = 60 * (10 + W.rng() * 7);
        if (S.vars.k++ % 2 === 0) {
          // a stampede of cats crosses the rug
          const a = sideAngle(W);
          W.spawn('sweeper', { x: -DMath.sin(a) * 19, y: 0, z: 0, a, speed: 9, warn: 95, life: 95 + 260, len: 14, look: 'cats', dmg: 10, ang: 55, kbb: 38, kbg: 58, h0: 0.0, h1: 0.8, sfx: 'scratch', blood: 1.6 });
        } else {
          // the fattest cat drops from the rafters
          const [x, z] = hazardSpot(W, 12);
          W.spawn('strike', { x, y: 0, z, look: 'catfall', warn: 75, life: 105, r: 1.7, dmg: 14, ang: 70, kbb: 42, kbg: 66, sfx: 'punchHeavy' });
        }
      }
    },
  },

  mirror: {
    id: 'mirror', name: 'Horizon des Reflets', bpm: 100, music: 'mirror',
    blurb: 'Une dalle à néons sur une mer-miroir, sans plateformes ni pièges : seul le ciel change.',
    surfaces: [MAIN(13, { thick: 1.0, depth: 2.5 })],
    init() {},
    step() {}, // rien ne bouge : ni piège, ni plateforme
  },

  // ZINZIN BAGARRE (17 oct. 2026) : la destination finale. Une grande soucoupe ronde, ni plateformes ni pièges : tout le
  // spectacle est derrière (src/render/stages/zinzin.js : elle vole à toute vitesse à travers huit mondes)
  zinzin: {
    id: 'zinzin', name: 'ZINZIN BAGARRE', bpm: 128, music: 'zinzin',
    blurb: 'Une soucoupe lancée à toute vitesse à travers huit mondes. Aucun piège : juste toi, eux, et le voyage.',
    surfaces: [MAIN(14, { thick: 1.0, depth: 3.2 })],
    init() {},
    step() {},
  },
};

export const STAGE_ORDER = ['zinzin', 'mirror', 'cemetery', 'swamp', 'elysee', 'diner', 'cave', 'arena', 'village', 'sea', 'attic'];
