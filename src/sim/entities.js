// Entities: projectiles, shockwave rings, clouds, puddles, summoned minions.
// Character files register their own kinds in ENTITIES (see chars/*.js).
import { DT, GRAVITY } from './constants.js';
import { clamp } from './util.js';
import { DMath } from './dmath.js';

export const ENTITIES = {};
// what an entity does to whoever it hits, by name (e.hook: a string, so the state stays plain data for the
// rollback): registered by the character files (friendKit.js: 'poison', ...)
export const HOOKS = {};
const hookOf = (e) => (e.hook && HOOKS[e.hook] ? (V, W) => HOOKS[e.hook](e, V, W) : undefined);

// generic pack: a look id, a scale and one free value (enough for the renderer)
const pack = (e) => [e.look || '', e.s ?? 1, e.a ?? 0, e.b ?? 0];
const unpack = (e, x) => { if (x) { [e.look, e.s, e.a, e.b] = x; } };

function groundUnder(W, e, yPrev) {
  return W.stage.findLanding(e.x, e.z, yPrev, e.y);
}

// --- projectile -----------------------------------------------------------------------------------------------
ENTITIES.proj = {
  pack, unpack,
  defaults: () => ({ r: 0.35, dmg: 5, ang: 40, kbb: 20, kbg: 60, grav: 0, bounce: 0, life: 90, pierce: false, look: 'ball', s: 1, sfx: 'hitM', blood: 1, drag: 0, spin: 0 }),
  step(e, W) {
    const yPrev = e.y;
    if (e.grav) e.vy -= GRAVITY * e.grav * DT;
    if (e.drag) { const k = Math.max(0, 1 - e.drag * DT); e.vx *= k; e.vz *= k; e.vy *= e.grav ? 1 : k; }
    if (e.home && e.t > (e.homeDelay || 8)) {
      const T = nearestEnemy(W, e.owner, e.x, e.y, e.z, e.homeRange || 14);
      if (T) {
        const dx = T.x - e.x, dy = T.y + 1 - e.y, dz = T.z - e.z, d = DMath.hypot(dx, dy, dz) || 1;
        const sp = DMath.hypot(e.vx, e.vy, e.vz);
        const k = e.home;
        e.vx += ((dx / d) * sp - e.vx) * k; e.vy += ((dy / d) * sp - e.vy) * k; e.vz += ((dz / d) * sp - e.vz) * k;
      }
    }
    e.x += e.vx * DT; e.y += e.vy * DT; e.z += e.vz * DT;
    e.a = (e.a || 0) + (e.spin || 0) * DT;
    if (e.custom) { const C = ENTITIES[e.custom]; if (C && C.stepExtra) C.stepExtra(e, W); }
    if (e.vy <= 0) {
      let s = groundUnder(W, e, yPrev);
      if (s && e.landBelow !== undefined && W.stage.heightAt(s, e.x, e.z) > e.landBelow) s = null; // (falls through what is above its target)
      if (s) {
        e.y = W.stage.heightAt(s, e.x, e.z);
        if (e.bounce > 0 && Math.abs(e.vy) > 2) { e.vy = -e.vy * e.bounce; e.vx *= 0.8; e.vz *= 0.8; W.emit('bounceProj', { id: e.id, x: e.x, y: e.y, z: e.z, k: e.look }); }
        else if (e.slide) { e.vy = 0; e.y += 0.01; }
        else { landProj(e, W); }
      }
    }
    if (e.y < -20 || Math.abs(e.x) > 40 || Math.abs(e.z) > 40) e.dead = true;
  },
  hits(e, W) {
    if (e.t < (e.armT || 0) || e.dead || e.noHit) return null;
    return {
      owner: e.owner, key: 'e' + e.id + (e.keyx || ''), x: e.x, y: e.y, z: e.z, r: e.r, dmg: e.dmg, ang: e.ang, kbb: e.kbb, kbg: e.kbg, fkb: e.fkb, // (keyx: a new blow of the same thing)
      dir: e.dirMode || 'vel', vx: e.vx, vz: e.vz, ox: e.x - e.vx * 0.05, oz: e.z - e.vz * 0.05, ent: e.id, src: 'proj',
      sfx: e.sfx, blood: e.blood, rehit: e.rehit, effect: e.effect, stun: e.stun, hitlag: e.hitlag || 0.8, fx: e.look,
      unblockable: e.unblockable, multi: e.multi, move: 'proj:' + e.look, noLaunch: e.noLaunch, noFlinch: e.noFlinch,
      onHit: (V, W2) => {
        if (!e.pierce) e.dead = true;
        if (e.custom) { const C = ENTITIES[e.custom]; if (C && C.onHitFighter) C.onHitFighter(e, V, W2); }
        W2.emit('projHit', { id: e.id, k: e.look, x: e.x, y: e.y, z: e.z });
      },
      onShield: (V) => {
        const C = e.custom && ENTITIES[e.custom];
        if (C && C.onShield) { C.onShield(e, V, W); return; } // its own way of bouncing off a shield
        if (!e.pierce) { e.dead = true; W.emit('projBlock', { id: e.id, k: e.look, x: e.x, y: e.y, z: e.z }); }
      },
    };
  },
  onDie(e, W) {
    if (e.custom) { const C = ENTITIES[e.custom]; if (C && C.onDie) C.onDie(e, W); }
  },
};

function landProj(e, W) {
  e.dead = true;
  W.emit('projLand', { id: e.id, k: e.look, x: e.x, y: e.y, z: e.z });
  if (e.custom) { const C = ENTITIES[e.custom]; if (C && C.onLand) C.onLand(e, W); }
}

export function nearestEnemy(W, owner, x, y, z, range = 99) {
  let best = null, bd = range;
  for (const F of W.list) {
    if (F.slot === owner || F.out || F.state === 'dead' || F.state === 'respawn') continue;
    const d = DMath.hypot(F.x - x, F.y - y, F.z - z);
    if (d < bd) { bd = d; best = F; }
  }
  return best;
}

// --- expanding shockwave ring on the ground -------------------------------------------------------------------
ENTITIES.ring = {
  pack: (e) => [e.look || 'shock', e.r, e.w ?? 0.8, e.h ?? 1.2],
  unpack: (e, x) => { if (x) { [e.look, e.r, e.w, e.h] = x; } },
  defaults: () => ({ r: 0.5, grow: 14, life: 30, dmg: 8, ang: 70, kbb: 40, kbg: 50, w: 0.8, h: 1.1, look: 'shock' }),
  step(e) { e.r += e.grow * DT; },
  hits(e) {
    return { shape: 'ring', owner: e.owner, key: 'e' + e.id, x: e.x, y: e.y, z: e.z, r: e.r, w: e.w, h: e.h, dmg: e.dmg, ang: e.ang,
      kbb: e.kbb, kbg: e.kbg, dir: 'radial', ent: e.id, src: 'proj', sfx: e.sfx || 'hitM', blood: e.blood ?? 1, unblockable: e.unblockable, move: 'ring:' + e.look,
      effect: e.effect, stun: e.stun, fx: e.fx, onHit: hookOf(e) };
  },
};

// --- lingering cloud (powder, parmesan dust...) -------------------------------------------------------------------
ENTITIES.cloud = {
  pack, unpack,
  defaults: () => ({ r: 1.8, life: 150, look: 'powder', effect: 'stun', stun: 50, dmg: 2, rehit: 70 }),
  step(e) { e.vx *= 0.92; e.vz *= 0.92; e.vy *= 0.9; e.x += e.vx * DT; e.y += e.vy * DT; e.z += e.vz * DT; e.s = Math.min(1, e.t / 12); },
  hits(e) {
    if (e.t < 4) return null;
    return { owner: e.owner, key: 'e' + e.id, x: e.x, y: e.y, z: e.z, r: e.r * e.s, dmg: e.dmg, ang: 30, kbb: 10, kbg: 10,
      dir: 'radial', effect: e.effect, stun: e.stun, rehit: e.rehit, ent: e.id, src: 'proj', sfx: e.sfx || 'poof', blood: 0.2, multi: true, move: 'cloud:' + e.look,
      hitsOwner: false, onHit: hookOf(e) };
  },
};

// --- puddle on the ground: makes fighters slip ----------------------------------------------------------------------
ENTITIES.puddle = {
  pack, unpack,
  defaults: () => ({ r: 2.2, life: 600, look: 'cheese' }),
  step(e, W) {
    for (const F of W.list) {
      if (!F.grounded || F.slot === e.owner && e.safeOwner) continue;
      if (DMath.hypot(F.x - e.x, F.z - e.z) < e.r) {
        F.slip = Math.max(F.slip, 20);
        if ((F.state === 'run') && W.rng() < 0.02 && !F.tripCD) {
          F.move = null; F.state = 'down'; F.st = 0; F.tripCD = 1;
          W.emit('trip', { s: F.slot, x: F.x, y: F.y, z: F.z });
          if (e.tripDmg) { F.damage += e.tripDmg; }
        }
      }
    }
    for (const F of W.list) if (F.tripCD && F.state !== 'down' && F.state !== 'getup') F.tripCD = 0;
  },
};

// --- summoned minion (humans from humanballs, etc.) -------------------------------------------------------------------
ENTITIES.minion = {
  pack: (e) => [e.look || 'jogger', e.s ?? 1, e.a ?? 0, e.st || 0],
  unpack: (e, x) => { if (x) { [e.look, e.s, e.a, e.st] = x; } },
  defaults: () => ({ r: 0.4, h: 1.6, hp: 12, hurt: true, life: 360, speed: 4, look: 'jogger', st: 0, cd: 30, grounded: false, dmg: 6, reach: 1.0, ang: 45, kbb: 30, kbg: 50 }),
  step(e, W) {
    const B = ENTITIES['minion_' + e.look];
    const yPrev = e.y;
    e.vy -= GRAVITY * DT;
    if (B && B.brain) B.brain(e, W);
    else defaultBrain(e, W);
    e.x += e.vx * DT; e.y += e.vy * DT; e.z += e.vz * DT;
    if (e.vy <= 0) {
      const s = W.stage.findLanding(e.x, e.z, yPrev, e.y);
      if (s) { e.y = W.stage.heightAt(s, e.x, e.z); e.vy = 0; e.grounded = true; e.surf = s.idx; }
      else if (e.grounded) {
        const su = W.stage.surfaces[e.surf ?? 0];
        if (!W.stage.supports(su, e.x, e.z)) e.grounded = false;
        else e.y = W.stage.heightAt(su, e.x, e.z);
      }
    }
    if (e.grounded) e.vy = Math.max(e.vy, 0);
    if (e.y < -18) { e.dead = true; W.emit('minionFall', { id: e.id, x: e.x, y: e.y, z: e.z, k: e.look }); }
  },
  hits(e) {
    if (!e.attackNow) return null;
    const a = e.attackNow; e.attackNow = null;
    return { owner: e.owner, key: 'e' + e.id + ':' + e.t, x: a.x, y: a.y, z: a.z, r: a.r, dmg: a.dmg, ang: a.ang, kbb: a.kbb, kbg: a.kbg,
      dir: 'face', dirAngle: e.a, ent: e.id, src: 'proj', sfx: a.sfx || 'hitM', blood: a.blood ?? 1, move: 'minion:' + e.look };
  },
  onHurt(e, hv, W) {
    e.hp -= hv.dmg || 4;
    const ha = W.launchDir(hv, { x: e.x, z: e.z });
    const k = 6 + (hv.dmg || 4);
    e.vx = DMath.sin(ha) * k; e.vz = DMath.cos(ha) * k; e.vy = 5 + (hv.dmg || 4) * 0.3; e.grounded = false; e.st = 1;
    W.emit('minionHit', { id: e.id, x: e.x, y: e.y + 0.9, z: e.z, d: hv.dmg, k: e.look });
    if (e.hp <= 0) { e.dead = true; W.emit('minionGore', { id: e.id, x: e.x, y: e.y + 0.8, z: e.z, k: e.look, vx: e.vx, vy: e.vy, vz: e.vz }); }
  },
};

function defaultBrain(e, W) {
  if (e.st > 0) { e.st++; if (e.st > 20) e.st = 0; return; }
  const T = nearestEnemy(W, e.owner, e.x, e.y, e.z, 30);
  if (!T || !e.grounded) { e.vx *= 0.98; e.vz *= 0.98; return; }
  const dx = T.x - e.x, dz = T.z - e.z, d = DMath.hypot(dx, dz) || 1;
  e.a = DMath.atan2(dx, dz);
  if (d > e.reach) { e.vx = (dx / d) * e.speed; e.vz = (dz / d) * e.speed; }
  else { e.vx *= 0.5; e.vz *= 0.5; }
  if (--e.cd <= 0 && d < e.reach + 0.5) {
    e.cd = e.atkCD || 50;
    e.attackNow = { x: e.x + DMath.sin(e.a) * 0.6, y: e.y + 1, z: e.z + DMath.cos(e.a) * 0.6, r: 0.7, dmg: e.dmg, ang: e.ang, kbb: e.kbb, kbg: e.kbg };
    W.emit('minionAttack', { id: e.id, k: e.look });
  }
}

// --- simple timed visual-only marker (telegraphs) ----------------------------------------------------------------------
ENTITIES.marker = { pack, unpack, defaults: () => ({ life: 60, look: 'warn', s: 1 }) };

export { clamp };
