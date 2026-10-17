// Shared pieces of the seven friends (Aboueb, Tices, OMFU, Lolobiscotto, J'san, Nymano, BIDO):
// burning, a cone of fire, a companion that fights for its owner (J'san's shiba), puddles and clouds.
import { ENTITIES, HOOKS, nearestEnemy } from '../entities.js';
import { stunFor } from '../fighter.js';
import { localToWorld } from '../util.js';
import { DT, GRAVITY } from '../constants.js';
import { DMath } from '../dmath.js';

// --- burning: a fighter on fire takes small hits for a while (no launch) ----------------------------------------
ENTITIES.burn = {
  pack: (e) => [e.look || 'burn', 1, 0, e.vic ?? -1],
  unpack: (e, x) => { if (x) { [e.look, , , e.vic] = x; } },
  defaults: () => ({ life: 120, every: 20, dmg: 1.6 }),
  step(e, W) {
    const V = W.fighters[e.vic];
    if (!V || V.out || V.state === 'dead' || V.state === 'respawn') { e.dead = true; return; }
    e.x = V.x; e.y = V.y + V.height * 0.5; e.z = V.z;
    if (e.t % e.every === 0) e.tickNow = 1;
    if (e.t % 6 === 0) W.emit('burnFx', { x: V.x, y: V.y + V.height * 0.5, z: V.z, s: e.vic, p: e.look === 'poison' ? 1 : e.look === 'coffee' ? 2 : 0 });
  },
  hits(e, W) {
    if (!e.tickNow) return null;
    e.tickNow = 0;
    const V = W.fighters[e.vic];
    if (!V) return null;
    return { owner: e.owner, key: 'burn' + e.id + ':' + e.t, x: V.x, y: V.y + V.height * 0.5, z: V.z, r: 1.2, dmg: e.dmg, ang: 80, kbb: 0, kbg: 0,
      dir: 'radial', noLaunch: true, ent: e.id, src: 'proj', sfx: e.look === 'poison' ? 'gurgle' : 'sizzle', blood: 0, multi: true, hitlag: 0.2, move: e.look === 'poison' ? 'poison' : 'burn', unblockable: true };
  },
};
// --- a slick on the floor (Lolobiscotto's Ricard, Nymano's tears, the shiba's poop): whoever walks on it slips,
// falls, gets hurt, and stays down `stun` frames (once per victim for a while); once: it is gone after one fall
ENTITIES.slick = {
  pack: (e) => [e.look || 'ricard', e.r, 0, 0],
  unpack: (e, x) => { if (x) { [e.look, e.r] = x; } },
  defaults: () => ({ r: 1.6, life: 480, look: 'ricard', dmg: 4, stun: 120, cd: {} }),
  step(e, W) {
    if (e.t < 6) return;
    for (const F of W.list) {
      if (F.slot === e.owner || F.out || !F.grounded || F.state === 'dead' || F.state === 'respawn' || F.intangible > 0 || F.buried) continue;
      if (F.state === 'stunned' || F.state === 'down' || F.state === 'grabbed') continue;
      if (Math.abs(F.x - e.x) > e.r || Math.abs(F.y - e.y) > 0.6) continue;
      const k = 'v' + F.slot;
      if ((e.cd[k] || 0) > W.tick) continue;
      e.cd[k] = W.tick + e.stun + 90;
      const A = W.fighters[e.owner];
      W.hitDirect(A || null, F, { dmg: e.dmg, ang: 90, kbb: 0, kbg: 0, noLaunch: true, sfx: 'slip', blood: 0.3, move: 'slick:' + e.look, ent: e.id, hitlag: 0.5 });
      stunFor(F, e.stun, { lie: true });
      W.emit('slipFall', { s: F.slot, x: F.x, y: F.y, z: 0, k: e.look });
      if (e.once) { e.dead = true; W.emit('slickGone', { x: e.x, y: e.y, z: 0, k: e.look }); break; }
    }
  },
};
// at most n of them per owner and look: the oldest goes
export function layslick(W, F, props, n = 1) {
  const mine = W.entities.filter((o) => o.kind === 'slick' && !o.dead && o.owner === F.slot && o.look === props.look);
  while (mine.length >= n) { const o = mine.shift(); o.dead = true; W.emit('slickGone', { x: o.x, y: o.y, z: 0, k: o.look }); }
  return W.spawn('slick', { owner: F.slot, z: 0, ...props, cd: {} });
}

// hooks of the clouds and rings (e.hook)
HOOKS.poison = (e, V, W) => setPoison(W, e.owner, V, 4, 1.2);
HOOKS.burn = (e, V, W) => setOnFire(W, e.owner, V, 3);

// poisoned: the same small hits over time, green (Tices' fart)
export function setPoison(W, owner, V, ticks = 4, dmg = 1.2) {
  for (const o of W.entities) if (o.kind === 'burn' && o.look === 'poison' && o.vic === V.slot && !o.dead) { o.life = Math.max(o.life, ticks * 20); return o; }
  W.emit('poisoned', { x: V.x, y: V.y + 1, z: V.z });
  return W.spawn('burn', { owner, vic: V.slot, x: V.x, y: V.y, z: V.z, life: ticks * 20 + 2, dmg, look: 'poison' });
}
export function setOnFire(W, owner, V, ticks = 5, dmg = 1.6) {
  for (const o of W.entities) if (o.kind === 'burn' && o.look !== 'poison' && o.vic === V.slot && !o.dead) { o.life = Math.max(o.life, ticks * 20); return o; }
  W.emit('ignite', { x: V.x, y: V.y + 1, z: V.z });
  return W.spawn('burn', { owner, vic: V.slot, x: V.x, y: V.y, z: V.z, life: ticks * 20 + 2, dmg });
}

// --- a cone of fire (or of anything) in front of the fighter: a few small hits along it ---------------------------
export function cone(W, F, key, len, h, r, p) {
  for (let i = 1; i <= 3; i++) {
    const d = (len * i) / 3;
    const c = localToWorld(F, [0, h, 0.4 + d]);
    W.addHit({ owner: F.slot, key: `${key}${F.mseq}:${i}`, x: c[0], y: c[1], z: c[2], r: r * (0.6 + i * 0.2), dir: 'face', dirAngle: F.facing,
      ox: F.x, oz: F.z, sfx: 'hitS', blood: 0.4, move: F.move, rehit: 6, ...p });
  }
}

// --- a companion that follows its owner and attacks on command (J'san's shiba) ------------------------------------
// e.cmd: '' idle, 'bite' (lunge in front), 'dash' (runs far ahead and back), 'jump' (headbutt upward),
// 'spin' (around the owner), 'bark' (shockwave), 'lift' (jumps up, pulling the owner on the leash)
ENTITIES.pet = {
  pack: (e) => [e.look || 'shiba', Math.round((e.a || 0) * 1000) / 1000, e.cmd || '', e.ct || 0],
  unpack: (e, x) => { if (x) { [e.look, e.a, e.cmd, e.ct] = x; } },
  defaults: () => ({ look: 'shiba', r: 0.4, h: 0.7, life: undefined, cmd: '', ct: 0, grounded: false, a: Math.PI / 2, keepZ: true }),
  step(e, W) {
    const F = W.fighters[e.owner];
    if (!F || F.out) { e.dead = true; return; }
    const fx = DMath.sin(F.facing);
    const hidden = F.state === 'dead' || F.state === 'respawn';
    e.ct++;
    const yPrev = e.y;
    const go = (tx, ty, k) => { e.vx = (tx - e.x) * k; if (ty !== undefined) e.vy = (ty - e.y) * k; };
    switch (e.cmd) {
      case 'bite': {
        const tx = F.x + fx * (0.9 + Math.min(1, e.ct / 6) * 1.2);
        go(tx, undefined, 18); e.a = F.facing; e.z = 0.25;
        if (e.ct === 6) e.attackNow = { k: 'bite', r: 0.75, dmg: e.dmg || 7, ang: 40, kbb: 26, kbg: 55 };
        if (e.ct > 16) e.cmd = '';
        break;
      }
      case 'dash': {
        // Va chercher ! : it sprints from J'san's side, jumps at the first foe it meets, hangs on biting, then
        // a last big bite sends the foe flying; it trots back after
        if (e.ct === 1) { e.dir = fx; e.a = F.facing; e.x = F.x + fx * 0.5; e.latch = -1; e.lt = 0; W.emit('bark', { id: e.id, x: e.x, y: e.y + 0.6, z: e.z, dash: 1 }); }
        e.z = 0.25;
        if (e.latch >= 0) {
          const V = W.fighters[e.latch];
          e.lt++;
          if (!V || V.state === 'dead' || V.out || V.state === 'respawn') { e.latch = -2; }
          else {
            // it hangs on and drags the foe back to J'san, gnawing; mashing breaks free (harder the more hurt)
            const home = F.x + DMath.sin(F.facing) * 1.1;
            const sx = home > V.x ? 1 : -1;
            if (Math.abs(home - V.x) > 0.15) V.x += sx * Math.min(Math.abs(home - V.x), 5.5 / 60);
            V.vx = 0; V.kx = 0; V.hitstun = Math.max(V.hitstun, 4); if (V.state !== 'hitstun') V.state = 'hitstun';
            e.x = V.x + sx * 0.35; e.y = V.y + 0.9; e.vx = 0; e.vy = 0; e.grounded = false; e.a = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
            if (e.lt % 9 === 0) e.attackNow = { k: 'gnaw', r: 0.9, dmg: 1.4, ang: 70, kbb: 0, kbg: 0, fkb: 0, dy: -0.4, rehit: 1, noLaunch: true };
            if (V.bufA > 0 || V.bufX > 0 || V.bufJ > 0 || V.bufS > 0) { e.esc = (e.esc || 0) + 1; V.bufA = V.bufX = V.bufJ = V.bufS = 0; }
            const need = 5 + Math.floor(V.damage / 30);
            const home2 = Math.abs(home - V.x) <= 0.2;
            if (e.esc >= need || home2 || e.lt > 150) {
              if (home2) { stunFor(V, 22); W.emit('petDrop', { s: V.slot, x: V.x, y: V.y + 1, z: 0 }); }
              else { V.hitstun = 0; W.emit('petShake', { id: e.id, x: e.x, y: e.y, z: 0 }); }
              e.latch = -2; e.vy = 6; e.vx = -sx * 4;
            }
            e.hidden = hidden ? 1 : 0;
            return;
          }
        }
        const out = e.latch === -1 && e.ct < 24;
        if (out) {
          e.vx = e.dir * 21;
          for (const V of W.fighters) {
            if (V === F || V.out || V.state === 'dead' || V.intangible > 0 || V.invuln > 0) continue;
            if (V.team === F.team && W.rules.teams) continue;
            if (Math.abs(V.x - e.x) < 0.9 && V.y - e.y < 1.6 && e.y - V.y < 1.4) {
              // a shield, or a blow out right now facing it: the dog bounces off with a yelp
              const blowOut = V.state === 'move' && V.af >= 0 && DMath.sin(V.facing) * (e.x - V.x) > 0;
              if (V.state === 'shield' || blowOut) { e.latch = -2; e.vx = -e.dir * 6; e.vy = 7; e.grounded = false; W.emit('petYelp', { id: e.id, x: e.x, y: e.y + 0.5, z: 0 }); break; }
              e.latch = V.slot; e.lt = 0; e.esc = 0; W.emit('petLatch', { s: V.slot, x: V.x, y: V.y + 1, z: 0 }); break;
            }
          }
        } else { e.vx = (F.x - e.x) > 0 ? 12 : -12; e.a = e.vx > 0 ? Math.PI / 2 : -Math.PI / 2; }
        if (e.ct > 80 || (!out && Math.abs(e.x - F.x) < 0.9)) e.cmd = '';
        break;
      }
      case 'jump': {
        go(F.x + fx * 0.6, undefined, 14); e.a = F.facing; e.z = 0.25;
        if (e.ct === 3) { e.vy = 15; e.grounded = false; }
        if (e.ct >= 4 && e.ct <= 12 && e.ct % 4 === 0) e.attackNow = { k: 'jump', r: 1.0, dmg: e.ct === 8 ? 11 : 4, ang: 86, kbb: 34, kbg: e.ct === 8 ? 82 : 30, dy: 0.4 };
        if (e.ct > 30) e.cmd = '';
        break;
      }
      case 'spin': {
        const a = e.ct * 0.55;
        e.x = F.x + DMath.sin(a) * 1.4; e.z = DMath.cos(a) * 1.0; e.vx = 0; e.a = a + Math.PI / 2;
        if (e.ct % 5 === 0) e.attackNow = { k: 'spin', r: 0.9, dmg: e.ct >= 20 ? 9 : 2.5, ang: e.ct >= 20 ? 30 : 50, kbb: e.ct >= 20 ? 34 : 10, kbg: e.ct >= 20 ? 84 : 20, dir: 'away' };
        if (e.ct > 24) { e.cmd = ''; e.z = 0.25; }
        break;
      }
      case 'bark': {
        e.vx = 0; e.a = F.facing;
        if (e.ct === 4) { const o = e.o || {}; W.spawn('ring', { owner: e.owner, x: e.x, y: e.y, z: 0, look: 'bark', r: 0.5, grow: o.grow ?? 13, life: o.life ?? 18, dmg: e.dmg > 1 ? e.dmg : 6, ang: 70, kbb: o.kbb ?? 28, kbg: o.kbg ?? 46, w: 0.9, h: 1.4, sfx: 'bark', blood: 0.3 }); W.emit('bark', { id: e.id, x: e.x, y: e.y + 0.6, z: e.z }); }
        if (e.ct > 22) e.cmd = '';
        break;
      }
      case 'hold': {
        // in J'san's arms (the smash charging): carried at his chest
        e.x = F.x + fx * 0.62; e.y = F.y + 0.8; e.z = 0.22; e.vx = 0; e.vy = 0; e.grounded = false; e.a = F.facing;
        if (F.state !== 'move' || (F.move !== 'smash' && F.move !== 'usmash') || e.ct > 150) e.cmd = '';
        e.hidden = hidden ? 1 : 0;
        return;
      }
      case 'thrown': {
        // thrown by J'san (side smash): it flies out in a short arc, mouth open; lands and trots back
        if (e.ct === 1) { e.x = F.x + fx * 0.5; e.y = F.y + 1.2; e.vx = fx * 13; e.vy = 5.5; e.grounded = false; e.a = F.facing; e.hitOnce = 0; }
        e.z = 0.25;
        if (!e.grounded && !e.hitOnce && e.ct > 1) e.attackNow = { k: 'thrown', r: 0.85, dmg: e.dmg || 15, ang: 38, kbb: (e.o && e.o.kbb) || 40, kbg: 96, dy: 0.1 };
        if (e.grounded && e.ct > 4) e.cmd = '';
        if (e.ct > 70) e.cmd = '';
        break;
      }
      case 'spin2': {
        // the down smash: once around him, in front first, then behind (through the near side)
        const th = Math.min(1, e.ct / 26) * Math.PI * 2;
        e.x = F.x + fx * 1.3 * DMath.cos(th); e.z = 0.25 + DMath.sin(th) * 1.0; e.y = F.y + 0.05; e.vx = 0; e.vy = 0; e.grounded = true;
        e.a = F.facing + (fx > 0 ? -1 : 1) * (th + Math.PI / 2);
        if (e.ct === 2) e.attackNow = { k: 'spinF', r: 0.85, dmg: e.dmg || 13, ang: 30, kbb: 34, kbg: 90, dir: 'away' };
        if (e.ct === 13) e.attackNow = { k: 'spinB', r: 0.85, dmg: e.dmg || 13, ang: 30, kbb: 34, kbg: 90, dir: 'away' };
        if (e.ct > 26) { e.cmd = ''; e.z = 0.25; }
        e.hidden = hidden ? 1 : 0;
        return;
      }
      case 'swing': {
        // the up smash: held by the tail, swung from low in front up over his head and slammed (the arc around his hand)
        const ph = e.ct < 4 ? -0.5 : Math.min(2.4, -0.5 + (e.ct - 4) * 0.36);
        e.x = F.x + fx * (0.2 + DMath.cos(ph) * 1.25); e.y = F.y + 1.35 + DMath.sin(ph) * 1.25 - 0.45; e.z = 0.3; e.vx = 0; e.vy = 0; e.grounded = false;
        e.a = F.facing; e.ph = ph;
        if (e.ct >= 7 && e.ct <= 10) e.attackNow = { k: 'swing', r: 0.85, dmg: e.dmg || 15, ang: 86, kbb: 38, kbg: 98, dir: 'radial', dy: 0 };
        if (e.ct > 22) { e.cmd = ''; e.vy = -2; }
        e.hidden = hidden ? 1 : 0;
        return;
      }
      case 'poop': {
        // squats behind him, and leaves it there (it stays until an enemy steps in it; four at most)
        e.vx = 0; e.a = F.facing;
        if (e.ct === 14) { layslick(W, F, { x: e.x, y: e.y, look: 'poop', r: 0.6, life: 1e9, dmg: 5, stun: 180, once: true }, 4); W.emit('petPoop', { id: e.id, x: e.x, y: e.y, z: 0 }); }
        if (e.ct > 26) e.cmd = '';
        break;
      }
      case 'lift': {
        // the shiba jumps up first; the owner follows on the leash (moved by the owner's own move)
        e.x = F.x; e.y = F.y + 2.2; e.z = 0.3; e.vx = 0; e.vy = 0; e.a = F.facing; e.grounded = false;
        if (e.ct > 60 || F.move !== 'sp_u') e.cmd = '';
        return;
      }
      default: {
        // follows behind the owner, a step in front in depth so he never hides him
        const tx = F.x - fx * 1.0;
        const d = tx - e.x;
        e.vx = Math.abs(d) > 0.35 ? Math.sign(d) * Math.min(11, Math.abs(d) * 6) : e.vx * 0.6;
        if (Math.abs(e.vx) > 0.5) e.a = e.vx > 0 ? Math.PI / 2 : -Math.PI / 2; else e.a = F.facing;
        e.z += (0.25 - e.z) * 0.2;
        // far away (owner flew off, respawned...): it pops back next to him
        if (Math.abs(F.x - e.x) > 9 || Math.abs(F.y - e.y) > 7) { e.x = F.x - fx * 0.8; e.y = F.y + 0.5; e.vy = 0; e.grounded = false; }
      }
    }
    if (!e.grounded) e.vy -= GRAVITY * DT;
    e.x += e.vx * DT; e.y += e.vy * DT;
    if (e.vy <= 0) {
      const s = W.stage.findLanding(e.x, 0, yPrev, e.y);
      if (s) { e.y = W.stage.heightAt(s, e.x, 0); e.vy = 0; e.grounded = true; e.surf = s.idx; }
      else if (e.grounded) { const su = W.stage.surfaces[e.surf ?? 0]; if (!W.stage.supports(su, e.x, 0)) e.grounded = false; else e.y = W.stage.heightAt(su, e.x, 0); }
    }
    if (e.y < -16) { e.x = F.x; e.y = F.y + 1; e.vy = 0; }
    e.hidden = hidden ? 1 : 0;
  },
  hits(e) {
    const h = e.attackNow; e.attackNow = null;
    if (!h || e.hidden) return null;
    return { owner: e.owner, key: 'pet' + e.id + ':' + h.k + ':' + (h.rehit ? Math.floor(e.ct / h.rehit) : h.k === 'spin' || h.k === 'jump' ? e.ct : e.ct0 || 0), x: e.x + DMath.sin(e.a) * 0.4, y: e.y + 0.45 + (h.dy || 0), z: 0,
      r: h.r, dmg: h.dmg, ang: h.ang, kbb: h.kbb, kbg: h.kbg, fkb: h.fkb, dir: h.dir || 'face', dirAngle: e.a, ox: e.x, oz: 0, ent: e.id, src: 'pet',
      sfx: h.k === 'bite' || h.k === 'dash' || h.k === 'gnaw' || h.k === 'shake' || h.k === 'thrown' ? 'chomp' : 'hitM', blood: 1, move: 'shiba:' + h.k, hitlag: 0.9,
      noLaunch: h.noLaunch, onHit: h.k === 'thrown' ? () => { e.hitOnce = 1; } : undefined };
  },
};
export function petOf(W, F) { return W.entities.find((e) => e.kind === 'pet' && e.owner === F.slot && !e.dead); }
export function ensurePet(W, F, look = 'shiba') {
  let p = petOf(W, F);
  if (!p) p = W.spawn('pet', { owner: F.slot, look, x: F.x - DMath.sin(F.facing), y: F.y + 0.3, z: 0.25, keepZ: true });
  return p;
}
export function petCmd(W, F, cmd, dmg, o) { const p = ensurePet(W, F); p.cmd = cmd; p.ct = 0; p.dmg = dmg; p.ct0 = F.mseq; p.o = o || null; return p; }

export { nearestEnemy };
