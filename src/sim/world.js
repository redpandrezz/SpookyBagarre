// The match: fighters, entities (projectiles, clouds, minions), stage, hits, KOs, rules.
// The host runs World.step() at 60 Hz; clients receive snapshots (and may predict their own fighters).
import { toTickInput } from '../core/input.js';
import { DT, TPS, BLAST, KB_TO_SPEED, HITSTUN_PER_KB, GRAVITY, KB_DECAY, SHIELD_MAX, PARRY_WINDOW, PLANE_Z } from './constants.js';
import { createFighter, stepFighter, startGrab, releaseGrab, shieldBreak, knockOut, setState, moveOf, applyLaunch } from './fighter.js';
import { StageSim } from './stage.js';
import { STAGES } from './stages/index.js';
import { ENTITIES } from './entities.js';
import { CHARS } from './chars/index.js';
import { capPoke } from './chars/specialTuning.js';
import { makeRng, localToWorld, segPointDist2, deg, clamp } from './util.js';
import { botInput } from './bot.js';
import { DMath } from './dmath.js';
import { stepMinigame, stepResume, tickMinigameClock } from './minigames.js';
import { stepUlt, ultCharge, botUlt } from './ultimate.js';

const EMPTY_INPUT = { mx: 0, my: 0, held: 0, pressed: 0 };

// hit volumes vs bodies (see overlaps, moveHitVolume); the combo pull stops at this much damage
const HURT_R = 0.7, HIT_R = 0.9, LINK_UNTIL = 70;
// the end of a match: the last KO in a big slow motion (x0.25 for END_SLOW frames, about 2 s), then the results
const END_SLOW = 28, END_K = 0.25;
// duels (two fighters left), like Smash Ultimate: the blow that will KO freezes in a slow motion with the camera zoomed
// in on it (ZOOM_KO frames at ZOOM_K, about 1 s); a very strong blow that will not, a shorter one, at most every
// ZOOM_GAP frames
const ZOOM_KO = 18, ZOOM_K = 0.3, ZOOM_GAP = 180, LETHAL_MARGIN = 0.92;
// a perfect guard against a blow: the attacker is frozen, then staggers PARRY_STUN frames (open for a counter, not
// for a combo: the guard is free as soon as its own short freeze ends)
const PARRY_STUN = 28;

export class World {
  constructor({ stage, roster, rules, seed }) {
    this.rules = { mode: 'stock', stocks: 3, time: 180, hazards: true, blood: 3, ...rules };
    this.seed = seed ?? (Math.random() * 1e9) | 0;
    this.rng = makeRng(this.seed);
    this.tick = 0;
    this.events = [];
    this.evSeq = 0;
    this.entities = [];
    this.entSeq = 1;
    this.pendingHits = [];
    this.hitLog = new Map();
    this.camYaw = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.freeze = 0;
    this.slowT = 0; this.slowK = 1;
    this.stageId = stage;
    this.stage = new StageSim(STAGES[stage], this);
    this.camYaw = STAGES[stage].camYaw || 0;
    this.bpm = STAGES[stage].bpm || 120;
    this.realTime = 0; // seconds since the match started (host clock, follows the music)
    this.frame = 0; this.slowAcc = 0; this.lastCnt = {}; // advance(): frames of wall time, slow motion, button counters
    const spawns = this.stage.spawnPoints(roster.length);
    this.fighters = [];
    roster.forEach((r, i) => {
      const F = createFighter(r.slot ?? i, r, spawns[i]);
      F.stocks = this.rules.mode === 'stock' ? this.rules.stocks : 99;
      this.fighters[F.slot] = F;
    });
    this.list = this.fighters.filter(Boolean);
    this.timeLeft = this.rules.time * TPS;
    this.winner = -1;
    this.placements = [];
    this.botMem = {};
    this.zoomCd = -1e4; // the tick of the last strong-blow zoom (duels)
    this.mg = null; // mini-jeu en cours (minigames.js) : le reste du match est figé
    this.mgBag = []; this.mgLast = null; // les prochains mini-jeux (tirés au hasard, minigames.js pickKind)
    this.mgNextKind = null; // le prochain mini-jeu, tiré d'avance pour l'annoncer (minigames.js tickMinigameClock)
    this.fpsBag = []; this.fpsLast = -1; // les prochaines variantes du duel au pistolet (src/sim/mg/duel.js)
    this.mgClock = 0; this.mgNext = 0; // images de combat depuis le dernier mini-jeu, et le délai tiré pour le prochain (minigames.js tickMinigameClock)
    this.ult = null; // l'ultime en cours (ultimate.js) : le reste du match est figé
    this.mgResume = null; // après un mini-jeu : le match figé 2 s, puis le coup au perdant (minigames.js stepResume)
  }

  emit(type, data) { this.events.push({ type, seq: ++this.evSeq, tick: this.tick, ...data }); }

  get timeScale() { return this.slowT > 0 ? this.slowK : 1; }

  // true near a beat of the stage music (Tung Tung Tung Sahur hits harder on the beat)
  onBeat(tol = 0.075) {
    const len = 60 / this.bpm;
    const ph = this.realTime % len;
    return ph < tol || ph > len - tol;
  }

  // One frame of wall time (1/60 s) from raw input samples { [slot]: {mx,my,held,cnt} }, all inside the simulation
  // so that every machine of an online match computes the same thing (rollback): the slow motion skips steps, the
  // music clock counts frames, and a button press is a counter that changed since the last step (a press during a
  // skipped frame still counts). Returns true if the match stepped.
  advance(samples) {
    this.events.length = 0;
    this.frame++;
    this.realTime = this.frame * DT;
    this.slowAcc += this.timeScale;
    if (this.slowAcc < 1) return false;
    this.slowAcc -= 1;
    const inputs = {};
    for (const F of this.list) {
      const s = samples[F.slot];
      if (!s) continue;
      if (s.bot && F.bot !== s.bot) F.bot = s.bot; // online: a player who left is played by the CPU from this frame on
      inputs[F.slot] = toTickInput(s, this.lastCnt[F.slot] || s.cnt);
      this.lastCnt[F.slot] = s.cnt.slice();
    }
    this.step(inputs);
    return true;
  }

  // inputs: { [slot]: {mx,my,held,pressed} }
  step(inputs) {
    this.events.length = 0;
    if (this.freeze > 0) { this.freeze--; return; }
    if (this.mg) { this.tick++; stepMinigame(this, inputs); return; }
    if (this.ult) { this.tick++; stepUlt(this, inputs); return; }
    if (this.mgResume) { this.tick++; stepResume(this); return; }
    if (this.slowT > 0) this.slowT--;
    this.tick++;
    this.phaseT++;
    if (this.phase === 'intro') {
      if (this.phaseT === 1) this.emit('countdown', { n: 3 });
      if (this.phaseT === 60) this.emit('countdown', { n: 2 });
      if (this.phaseT === 120) this.emit('countdown', { n: 1 });
      if (this.phaseT >= 180) { this.phase = 'play'; this.phaseT = 0; this.emit('go', {}); }
    }
    const playing = this.phase === 'play';
    this.stage.step(this);
    for (const F of this.list) {
      let I = inputs[F.slot] || EMPTY_INPUT;
      if (F.bot && playing) I = botUlt(F, this, botInput(F, this));
      // BIDO's kiss: the one he charmed moves with his pad (a CPU BIDO walks it to the nearest edge); BIDO stands still
      if (F.ctrlBy >= 0) {
        const C = this.fighters[F.ctrlBy];
        const m = this.stage.main(), past = Math.abs(F.x - m.cx) > m.r - 0.1;
        // over: time, the controller gone, or the victim in the air past the edge (it gets its pad back to recover)
        if (!C || C.out || --F.ctrlT <= 0 || F.state === 'dead' || F.state === 'respawn' || (past && !F.grounded)) { F.ctrlBy = -1; F.ctrlT = 0; }
        else {
          if (C.bot) I = { mx: F.x > m.cx ? 1 : -1, my: 0, held: 0, pressed: 0 };
          else I = inputs[C.slot] || EMPTY_INPUT;
          // a slow, heavy walk; never walked over the edge (a charm, not a free KO)
          F.speedMul = Math.min(F.speedMul || 1, 0.5); F.speedT = Math.max(F.speedT || 0, 2);
          const out = Math.sign(F.x - m.cx);
          if (Math.abs(F.x - m.cx) > m.r - 0.9 && I.mx * out > 0) I = { ...I, mx: 0 };
        }
      } else if (this.list.some((o) => o.ctrlBy === F.slot)) I = EMPTY_INPUT;
      if (!playing && this.phase !== 'end') I = EMPTY_INPUT;
      if (this.phase === 'end') I = EMPTY_INPUT;
      if (F.out) continue;
      stepFighter(F, I, this);
      const CD = CHARS[F.char];
      if (CD.tick) CD.tick(F, this); // per-character upkeep (J'san's shiba, Nymano's tears)
    }
    // carried by a multi-hit move (drag): stuck at its offset from the one carrying it, moving with it
    for (const V of this.list) {
      if (V.carryT <= 0) continue;
      const A = this.fighters[V.carryBy];
      if (!A || A.out || V.out || A.state !== 'move' || V.hitstun <= 0 || V.state === 'dead' || V.state === 'respawn') { V.carryT = 0; continue; }
      V.carryT--;
      const tx = A.x + V.carryX, ty = Math.max(A.y + V.carryY, this.stage.floorUnder(tx, V.y)); // never into the floor
      V.x += (tx - V.x) * 0.6;
      V.y += (ty - V.y) * 0.6;
      V.vx = A.vx; V.vy = A.vy;
    }
    for (const e of this.entities) {
      const B = ENTITIES[e.kind];
      e.t++;
      if (B && B.step) B.step(e, this);
      // 2D: everything that fights lives on the plane (keepZ: a helper standing a little behind, for the looks)
      if (!e.keepZ) { e.z = PLANE_Z; e.vz = 0; }
      if (e.life !== undefined && --e.life <= 0) e.dead = true;
    }
    this.collectAndResolveHits();
    this.entities = this.entities.filter((e) => {
      if (e.dead) { const B = ENTITIES[e.kind]; if (B && B.onDie) B.onDie(e, this); }
      return !e.dead;
    });
    this.separate();
    if (playing) this.checkBlast();
    if (this.phase === 'play') tickMinigameClock(this);
    if (playing && this.rules.mode === 'time') {
      this.timeLeft--;
      if (this.timeLeft <= 0) this.finish();
    }
    if (this.phase === 'end' && this.phaseT > END_SLOW) { this.phase = 'over'; this.emit('over', {}); }
    if (this.hitLog.size > 800 && this.tick % 120 === 0) {
      for (const [k, t] of this.hitLog) if (this.tick - t > 300) this.hitLog.delete(k);
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  spawn(kind, props) {
    const B = ENTITIES[kind];
    // a projectile thrown during a 'poke' special hurts little and barely pushes (specialTuning.js)
    if (kind === 'proj' && props && props.owner >= 0) {
      const O = this.fighters[props.owner];
      const M = O && O.move ? CHARS[O.char].moves[O.move] : null;
      if (M && M.poke) props = capPoke({ ...props });
    }
    if (props && props.owner >= 0 && !props.srcMove) {
      const O = this.fighters[props.owner];
      if (O && O.move) props = { ...props, srcMove: O.move }; // which move threw it (balance stats)
    }
    // its volley (the notes of a lick, the CDs of CD-Man): a perfect guard sends back all of it (reflect)
    if (kind === 'proj' && props && props.owner >= 0 && props.grp === undefined) {
      const O = this.fighters[props.owner];
      if (O && O.move) props = { ...props, grp: O.slot + ':' + O.mseq };
    }
    const e = { id: this.entSeq++, kind, t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, owner: -1, ...(B && B.defaults ? B.defaults() : {}), ...props };
    if (!e.keepZ) { e.z = PLANE_Z; e.vz = 0; }
    this.entities.push(e);
    if (B && B.onSpawn) B.onSpawn(e, this);
    this.emit('spawn', { id: e.id, k: kind, x: e.x, y: e.y, z: e.z, o: e.owner });
    return e;
  }

  addHit(hv) { this.pendingHits.push(hv); }

  // hit volume from a declarative move hitbox
  moveHitVolume(F, M, h, i) {
    const p = localToWorld(F, h.at);
    const mult = M.charge ? 1 + 0.45 * (F.mv.charge || 0) / M.charge.max : 1;
    const sz = F.size || 1;
    return {
      // a little tighter than drawn: the blow has to reach the body (see overlaps)
      clank: F.grounded ? 'ground' : 'air', trans: !!(h.trans || M.trans), // Ultimate's priority (resolveClanks)
      owner: F.slot, key: `m${F.slot}:${F.mseq}:${h.grp ?? i}`, x: p[0], y: p[1], z: p[2], r: h.r * HIT_R * (0.6 + 0.4 * sz),
      dmg: h.dmg * mult * (h.dmgMul || 1), ang: h.ang, kbb: h.kbb * (1 + (mult - 1) * 0.6), kbg: h.kbg, fkb: h.fkb,
      dir: h.dir || 'face', dirAngle: h.back ? F.facing + Math.PI : F.facing, ox: F.x, oz: F.z, hitlag: h.hitlag || 1, sfx: h.sfx || 'hitM',
      blood: h.blood ?? 1, rehit: h.rehit, effect: h.effect, unblockable: h.unblockable, shieldMul: h.shieldMul,
      grabAir: h.grabAir, smash: !!M.charge, charge: M.charge ? (F.mv.charge || 0) / M.charge.max : 0,
      onHit: h.onHit, hitsOwner: false, move: F.move, spike: h.spike, wide: h.wide,
      fx: h.fx, drag: h.drag, noLaunch: h.noLaunch, noFlinch: h.noFlinch, stun: h.stun,
      // the quick hits of a string (jabs, the first side tilts) keep the victim in front at low damage
      link: h.link ?? (M.next ? 1 : 0),
    };
  }

  collectAndResolveHits() {
    const vols = this.pendingHits;
    this.pendingHits = [];
    for (const F of this.list) {
      if (F.state !== 'move' || F.hitlag > 0 || F.af < 0) continue;
      const M = moveOf(F);
      if (!M || !M.hits) continue;
      M.hits.forEach((h, i) => {
        if (F.af >= h.f[0] && F.af <= h.f[1]) vols.push(this.moveHitVolume(F, M, h, i));
      });
    }
    for (const e of this.entities) {
      const B = ENTITIES[e.kind];
      if (B && B.hits && !e.dead) {
        const hv = B.hits(e, this);
        if (hv) for (const h of (Array.isArray(hv) ? hv : [hv])) { if (e.srcMove && !h.srcMove) h.srcMove = e.srcMove; vols.push(h); }
      }
    }
    const sd = this.stage.def;
    if (sd.hits && this.rules.hazards && this.phase === 'play') { const hv = sd.hits(this.stage, this); if (hv) vols.push(...hv); }

    // the order: a different fighter first each frame (nobody wins the ties for being player 1), each one's hitboxes
    // in their own order (the first of a move that connects is the one that hits); the grabs last (a blow beats a grab)
    const n = this.fighters.length || 1, rank = (hv) => (hv.effect === 'grab' ? 2 * n : 0) + (hv.owner < 0 ? -1 : (((hv.owner - this.tick) % n) + n) % n);
    const ordered = vols.map((hv, i) => [rank(hv), i, hv]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
    const block = this.resolveClanks(ordered);
    const live = ordered.filter((hv) => !hv.dead);
    const hitThisTick = new Set();
    for (const hv of live) {
      for (const V of this.list) {
        if (V.out || V.state === 'dead' || V.state === 'respawn') continue;
        if (V.slot === hv.owner && !hv.hitsOwner) continue;
        if (block.has(hv.owner + '>' + V.slot)) continue; // the frame of a clank: the stronger move does not hit yet
        if (hv.owner >= 0 && this.rules.teams && this.fighters[hv.owner] && this.fighters[hv.owner].team === V.team && V.slot !== hv.owner) continue;
        if (hitThisTick.has(V.slot) && !hv.multi) continue;
        if (!this.overlaps(hv, V)) continue;
        const k = hv.key + '|' + V.slot;
        const last = this.hitLog.get(k);
        if (last !== undefined && (!hv.rehit || this.tick - last < hv.rehit)) continue;
        if (V.intangible > 0 || V.invuln > 0) continue;
        this.hitLog.set(k, this.tick);
        if (this.applyHit(hv, V)) hitThisTick.add(V.slot);
      }
      // minions and other hurtable entities
      for (const e of this.entities) {
        if (!e.hurt || e.dead || (e.owner === hv.owner && !e.hurtByOwner) || e.id === hv.ent) continue;
        const dx = e.x - hv.x, dy = (e.y + (e.h || 1) * 0.5) - hv.y, dz = 0; // 2D: depth does not count
        const rr = (hv.r || 0.5) + (e.r || 0.5);
        if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
        const k = hv.key + '|e' + e.id;
        if (this.hitLog.has(k)) continue;
        this.hitLog.set(k, this.tick);
        const B = ENTITIES[e.kind];
        if (B && B.onHurt) B.onHurt(e, hv, this);
      }
    }
  }

  // 2D: hit volumes are tested in the x-y plane (their depth is ignored)
  overlaps(hv, V) {
    const sz = V.size || 1;
    const vz = hv.z ?? 0;
    // the body that takes the blows: about the width of the models (the fighters' radius is for pushing, ledges)
    const R = V.radius * HURT_R * (0.8 + 0.2 * sz) + 0.03;
    // crouched: the body is lower (high attacks pass over it, like in Smash)
    const tall = V.state === 'crouch' ? 0.6 : 1;
    const y0 = V.y + 0.25, y1 = V.y + Math.max(0.5, V.height * tall * (0.7 + 0.3 * sz) - 0.25);
    if (hv.shape === 'ring') {
      // expanding shockwave ring on the ground: hits fighters near the ring radius, low to the ground
      const d = Math.abs(V.x - hv.x);
      if (Math.abs(d - hv.r) > (hv.w || 0.8) + R) return false;
      return V.y < hv.y + (hv.h || 1.2) && V.y + V.height > hv.y - 0.3;
    }
    if (hv.shape === 'capsule') {
      // approximate: sample along the capsule
      const n = 6;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const px = hv.x + (hv.x2 - hv.x) * t, py = hv.y + (hv.y2 - hv.y) * t, pz = hv.z + (hv.z2 - hv.z) * t;
        const rr = hv.r + R;
        if (segPointDist2(px, py, 0, V.x, y0, 0, V.x, y1, 0) <= rr * rr) { hv.cx = px; hv.cy = py; hv.cz = pz; return true; }
      }
      return false;
    }
    const rr = hv.r + R;
    return segPointDist2(hv.x, hv.y, 0, V.x, y0, 0, V.x, y1, 0) <= rr * rr + 0 * vz;
  }

  knockback(hv, V, dmg) {
    if (hv.fkb !== undefined && hv.fkb !== null) return hv.fkb;
    const p = V.damage, w = CHARS[V.char].stats.weight * Math.sqrt(V.size || 1);
    const kb = ((p / 10 + (p * dmg) / 20) * (200 / (w + 100)) * 1.15 + 18) * ((hv.kbg ?? 100) / 100) + (hv.kbb ?? 0);
    return V.state === 'crouch' ? kb * 0.85 : kb; // crouch cancel: a crouched fighter holds better
  }

  // horizontal direction of a launch (an angle: x = sin, z = cos); in 2D it ends up exactly left or right
  launchDir(hv, V) {
    let ha;
    if (typeof hv.dir === 'number') ha = hv.dir;
    else if (hv.dir === 'away') ha = DMath.atan2(V.x - hv.ox, V.z - hv.oz);
    else if (hv.dir === 'radial') ha = DMath.atan2(V.x - hv.x, V.z - hv.z);
    else if (hv.dir === 'in') ha = DMath.atan2(hv.ox - V.x, hv.oz - V.z);
    else if (hv.dir === 'vel') ha = DMath.atan2(hv.vx || 0, hv.vz || 1);
    else if (hv.dir === 'center') ha = DMath.atan2(-V.x, -V.z) + Math.PI;
    else ha = hv.dirAngle ?? 0;
    let sx = DMath.sin(ha);
    if (Math.abs(sx) < 0.3) {
      // straight up or down the depth: push away from the hit (or the attacker's way)
      const ox = hv.ox ?? hv.x ?? V.x;
      const dx = V.x - ox;
      if (Math.abs(dx) > 0.05) sx = dx;
      else { const A = hv.owner >= 0 ? this.fighters[hv.owner] : null; sx = A ? DMath.sin(A.facing) : 1; }
    }
    return sx < 0 ? -Math.PI / 2 : Math.PI / 2;
  }

  // Ultimate's priority, when two hitboxes of different fighters meet (the moves, the projectiles):
  //   two ground attacks: within 9 % of damage, both are cancelled and both fighters rebound; else the weaker one is
  //     cancelled (its fighter rebounds), the stronger goes on (it may hit from the next frame)
  //   aerials never clank (with anything but projectiles: the projectile is destroyed unless 9 % stronger)
  //   projectile v projectile: the weaker one is destroyed, the stronger too unless 9 % stronger
  //   projectile v ground attack: the attack 9 % stronger destroys it; within 9 %, both cancelled; the projectile 9 %
  //     stronger makes the attack rebound and goes on
  //   transcendent hitboxes (trans) never clank; grabs neither (a blow beats a grab); two grabs at once cancel
  // Returns the pairs "attacker>victim" that cannot hit each other this frame. Marks the cancelled volumes dead.
  resolveClanks(vols) {
    const block = new Set(), gone = new Set();
    const kindOf = (hv) => {
      if (hv.trans || hv.owner < 0) return null;
      if (hv.src === 'proj') { const e = hv.ent !== undefined ? this.entities.find((x) => x.id === hv.ent) : null; return e && e.kind === 'proj' && !e.dead && !e.trans ? 'proj' : null; }
      return hv.clank || null;
    };
    const rebound = (F, d, hl) => {
      if (!F || F.state !== 'move') return;
      F.move = null; F.mv = {}; F.hitlag = Math.max(F.hitlag, hl);
      setState(F, 'rebound'); F.rebT = Math.min(58, Math.floor((Math.floor(d) + 4) * 15 / 8));
    };
    const kill = (hv) => { const e = this.entities.find((x) => x.id === hv.ent); if (e) e.dead = true; gone.add('e' + hv.ent); };
    for (let i = 0; i < vols.length; i++) {
      const a = vols[i], ka = kindOf(a);
      if (!ka || a.effect === 'grab') continue;
      for (let j = i + 1; j < vols.length; j++) {
        const b = vols[j], kb = kindOf(b);
        if (!kb || b.effect === 'grab' || a.owner === b.owner) continue;
        if (this.rules.teams && this.fighters[a.owner] && this.fighters[b.owner] && this.fighters[a.owner].team === this.fighters[b.owner].team) continue;
        if (ka !== 'proj' && kb !== 'proj' && (ka === 'air' || kb === 'air')) continue; // aerials pass through attacks
        const ga = ka === 'proj' ? 'e' + a.ent : 'm' + a.owner, gb = kb === 'proj' ? 'e' + b.ent : 'm' + b.owner;
        if (gone.has(ga) || gone.has(gb)) continue;
        const dx = a.x - b.x, dy = a.y - b.y, rr = (a.r || 0.5) + (b.r || 0.5);
        if (dx * dx + dy * dy > rr * rr) continue;
        const da = a.dmg || 0, db = b.dmg || 0, hl = Math.min(12, Math.floor(Math.max(da, db) * 0.5) + 3);
        const A = this.fighters[a.owner], B = this.fighters[b.owner];
        const big = Math.max(da, db);
        let hit = false;
        if (ka !== 'proj' && kb !== 'proj') {
          // two ground attacks
          if (Math.abs(da - db) <= 9) { rebound(A, big, hl); rebound(B, big, hl); gone.add(ga); gone.add(gb); }
          else if (da > db) { rebound(B, big, hl); gone.add(gb); block.add(a.owner + '>' + b.owner); if (A) A.hitlag = Math.max(A.hitlag, hl); }
          else { rebound(A, big, hl); gone.add(ga); block.add(b.owner + '>' + a.owner); if (B) B.hitlag = Math.max(B.hitlag, hl); }
          hit = true;
        } else if (ka === 'proj' && kb === 'proj') {
          if (da <= db) { kill(a); if (db < da + 9) kill(b); } else { kill(b); if (da < db + 9) kill(a); }
          hit = true;
        } else {
          const [P, pd, M, md, mk, Mf] = ka === 'proj' ? [a, da, b, db, kb, B] : [b, db, a, da, ka, A];
          if (mk === 'air') { if (pd < md + 9) kill(P); }
          else if (md > pd + 9) kill(P);
          else if (pd >= md + 9) { rebound(Mf, big, hl); gone.add('m' + M.owner); }
          else { kill(P); rebound(Mf, big, hl); gone.add('m' + M.owner); }
          hit = true;
        }
        if (hit) this.emit('clank', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 0, d: big });
      }
    }
    // two grabs at once: both cancelled (1 % each, a short rebound)
    const grabs = vols.filter((hv) => hv.effect === 'grab' && hv.owner >= 0);
    for (let i = 0; i < grabs.length; i++) for (let j = i + 1; j < grabs.length; j++) {
      const a = grabs[i], b = grabs[j], A = this.fighters[a.owner], B = this.fighters[b.owner];
      if (!A || !B || a.owner === b.owner || !this.overlaps(a, B) || !this.overlaps(b, A)) continue;
      for (const F of [A, B]) { F.damage = Math.min(999, F.damage + 1); rebound(F, 1, 4); }
      gone.add('m' + a.owner); gone.add('m' + b.owner);
      this.emit('clank', { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 + 1, z: 0, d: 1 });
    }
    for (const hv of vols) {
      if (hv.src === 'proj') { if (hv.ent !== undefined && gone.has('e' + hv.ent)) hv.dead = true; }
      else if (hv.clank && gone.has('m' + hv.owner)) hv.dead = true;
    }
    return block;
  }

  hitDirect(A, V, params) {
    const hv = { owner: A ? A.slot : -1, key: 'direct' + this.tick, x: V.x, y: V.y + 1, z: V.z, r: 0.5, dir: 'face', dirAngle: A ? A.facing : 0, ox: A ? A.x : V.x, oz: A ? A.z : V.z, ...params };
    return this.applyHit(hv, V);
  }

  applyHit(hv, V) {
    const A = hv.owner >= 0 ? this.fighters[hv.owner] : null;
    const cx = hv.cx ?? hv.x, cy = hv.cy ?? hv.y, cz = hv.cz ?? hv.z;
    const px = (cx + V.x) / 2, py = clamp(cy, V.y + 0.3, V.y + V.height), pz = (cz + V.z) / 2;
    // shield
    if (V.state === 'shield' && !hv.unblockable && hv.effect !== 'grab') {
      if (this.tick - V.shieldStart <= PARRY_WINDOW) {
        V.hitlag = 10; V.shieldStun = 0;
        const phys = !!(A && hv.src !== 'proj' && hv.owner !== V.slot);
        if (phys) {
          A.hitlag = Math.max(A.hitlag, 10);
          if (A.grabbing >= 0) releaseGrab(A, this);
          A.move = null; setState(A, 'stunned'); A.stun = PARRY_STUN;
          A.vx *= 0.2; A.kx = (A.x >= V.x ? 1 : -1) * 4; A.kz = 0; // knocked back a step
        }
        this.slow(phys ? 18 : 14, phys ? 0.3 : 0.35);
        this.emit('parry', { s: V.slot, a: hv.owner, x: px, y: py, z: pz, phys: phys ? 1 : 0 });
        // a projectile: back to its thrower, with the rest of its volley
        if (hv.src === 'proj' && hv.ent !== undefined && hv.key === 'e' + hv.ent) {
          const e = this.entities.find((x) => x.id === hv.ent);
          if (e && !e.dead && e.kind === 'proj') this.reflect(e, V, A, px, py, pz);
        }
        return true;
      }
      // Ultimate: the shield takes 1.19 x the damage; shieldstun = damage x 0.8 x (the move's multiplier) + 2; the
      // defender slides back (shieldstun + 1) x 0.09 units a frame, at most 1.3 (1 unit a frame = 4.886 m/s here)
      const dmg = (hv.dmg || 0) * (hv.shieldMul ?? 1);
      V.shield -= dmg * 1.19;
      V.shieldStun = Math.floor(dmg * 0.8 * (hv.shieldStun ?? 1) + 2);
      const ha = this.launchDir(hv, V);
      V.kx = DMath.sin(ha) * Math.min(1.3, (V.shieldStun + 1) * 0.09) * 4.886; V.kz = 0;
      V.hitlag = Math.min(12, Math.floor(dmg * 0.5) + 3);
      if (A && !hv.ent) A.hitlag = Math.max(A.hitlag, V.hitlag);
      this.emit('shieldHit', { s: V.slot, a: hv.owner, x: px, y: py, z: pz, d: dmg });
      if (V.shield <= 0) shieldBreak(V, this);
      if (hv.onShield) hv.onShield(V, this);
      return true;
    }
    if (hv.effect === 'grab') {
      if (!V.grounded && !hv.grabAir) return false;
      if (A && (A.state === 'move' || A.state === 'idle')) { startGrab(A, V, this); if (hv.onHit) hv.onHit(V, this, hv); return true; }
      return false;
    }
    if (V.grabbing >= 0 && !hv.noFlinch) releaseGrab(V, this);
    let dmg = hv.dmg || 0;
    if (A && CHARS[A.char].beatBonus && dmg > 0 && this.onBeat()) { dmg *= 1.25; hv = { ...hv, hitlag: (hv.hitlag || 1) * 1.25, beat: 1 }; }
    V.damage = Math.min(999, V.damage + dmg);
    V.stats.taken += dmg;
    if (A) A.stats.dealt += dmg;
    ultCharge(this, A, V, dmg);
    V.bloodied = Math.min(1, V.bloodied + dmg / 120);
    if (A && hv.owner !== V.slot) { V.lastHitBy = hv.owner; V.lastHitTick = this.tick; }
    const kb = this.knockback(hv, V, dmg);
    // hitlag (Smash Ultimate's formula): every blow freezes both fighters a moment, the heavy ones longer
    const hitlag = Math.min(26, Math.floor((dmg * 0.65 + 6) * (hv.hitlag || 1) * (hv.smash ? 1 + hv.charge * 0.5 : 1)));

    // no flinch (like Fox's blaster in Smash): the damage counts and shows (a flash, a spark), but the victim is not
    // stopped, not frozen, not pushed: it keeps running, attacking, through the stream
    if (hv.noFlinch) {
      this.emit('hit', { s: V.slot, a: hv.owner, x: px, y: py, z: pz, d: dmg, kb: 0, sfx: hv.sfx || 'hitS', b: (hv.blood ?? 1) * 0.3, small: 1, nf: 1, fx: hv.fx, m: hv.move });
      if (hv.onHit) hv.onHit(V, this, hv);
      return true;
    }
    if (hv.effect === 'stun') {
      V.move = null; setState(V, 'stunned'); V.stun = hv.stun || 60;
      V.hitlag = 3;
      this.emit('hit', { s: V.slot, a: hv.owner, x: px, y: py, z: pz, d: dmg, kb: 0, sfx: hv.sfx || 'poof', b: (hv.blood ?? 1) * 0.3, fx: 'stun', m: hv.move, sm: hv.srcMove });
      if (hv.onHit) hv.onHit(V, this, hv);
      return true;
    }
    if (hv.noLaunch) {
      V.hitlag = Math.max(V.hitlag, Math.floor(hitlag * 0.6));
      if (A && !hv.ent) A.hitlag = Math.max(A.hitlag, Math.floor(hitlag * 0.5));
      this.emit('hit', { s: V.slot, a: hv.owner, x: px, y: py, z: pz, d: dmg, kb: 0, sfx: hv.sfx || 'hitS', b: hv.blood ?? 1, small: 1 });
      if (hv.onHit) hv.onHit(V, this, hv);
      return true;
    }
    // armor (heavy moves keep going)
    if (V.armor > 0 && kb < V.armor) {
      V.hitlag = Math.floor(hitlag * 0.5);
      if (A && !hv.ent) A.hitlag = V.hitlag;
      this.emit('hit', { s: V.slot, a: hv.owner, x: px, y: py, z: pz, d: dmg, kb: 0, sfx: hv.sfx, b: hv.blood ?? 1, armor: 1 });
      return true;
    }
    if (hv.effect === 'slip') { V.slip = 90; }
    const ha = this.launchDir(hv, V);
    let ea = hv.ang ?? 45;
    if (ea === 361) ea = (V.grounded && kb < 32) ? 0 : 38;
    if (V.grounded && ea < 0) ea = -ea * 0.3; // grounded meteor -> pops up (a spike only sends down in the air)
    const sp = kb * KB_TO_SPEED;
    const ce = DMath.cos(deg(ea)), se = DMath.sin(deg(ea));
    V.pendingLaunch = { v: [DMath.sin(ha) * ce * sp, se * sp, 0], kb };
    V.launchKb = kb;
    V.move = null;
    if (V.grabbedBy >= 0) { const G = this.fighters[V.grabbedBy]; if (G && G.grabbing === V.slot) { G.grabbing = -1; if (G.state === 'grabbing') setState(G, 'idle'); } V.grabbedBy = -1; }
    setState(V, 'hitstun');
    V.airdodged = false; V.usedUp = false; V.upN = 0; V.airOnce = 0; V.lockLand = 0; // (Ultimate: a hit gives back the air dodge, the up special and the once-in-the-air specials; not the air jump)
    V.hitstun = Math.max(8, Math.floor(kb * HITSTUN_PER_KB));
    V.hitlag = hitlag + (kb > 100 ? 4 : 0);
    // combo strings: at low damage the blow does not push the victim out of reach, it keeps it in front of the
    // attacker (moving with it) long enough for the next hit to connect, like the jabs and tilts of Smash
    if (hv.link && A && V.damage < LINK_UNTIL && kb < 75) {
      const tx = A.x + DMath.sin(A.facing) * (A.radius + V.radius + 0.2);
      V.pendingLaunch.v = [(tx - V.x) * 5 + A.vx * 0.9, V.grounded ? 0 : Math.max(1.5, A.vy * 0.8 + 1.5), 0];
      V.hitstun = Math.max(V.hitstun, 14);
    }
    // drag: the victim is carried along with the attacker (a recovery that takes it up, a vacuum), [forward, up,
    // hitstun]; the move's last hit launches it for real
    if (hv.drag && A) {
      const d = hv.drag, tx = A.x + DMath.sin(A.facing) * d[0], ty = A.y + d[1];
      V.pendingLaunch.v = [(tx - V.x) * 7 + A.vx, (ty - V.y) * 7 + A.vy, 0];
      V.hitstun = Math.max(V.hitstun, d[2] || 14);
      V.hitlag = Math.min(V.hitlag, 3);
      // and held there until the next hit (carry, after the fighters move): it cannot fall out of the move
      V.carryBy = A.slot; V.carryT = d[2] || 14; V.carryX = DMath.sin(A.facing) * d[0]; V.carryY = d[1];
    } else if (A && V.carryBy === A.slot) V.carryT = 0; // the move's last hit lets go
    // (a multi-hit move: the attacker barely freezes, or it would never reach its next hit; one that carries its
    // victim not at all: a recovery goes as far whether it hits or not)
    if (A && !hv.ent && hv.owner !== V.slot) A.hitlag = Math.max(A.hitlag, hv.drag ? 0 : hv.rehit ? Math.min(hitlag, Math.max(1, hv.rehit - 3)) : hitlag);
    if (A && A.move) A.mv.landed = (A.mv.landed || 0) + 1;
    const strong = kb > 95 || hv.smash;
    let zoom = 0;
    if (this.phase === 'play' && A && hv.owner !== V.slot && kb > 55 && this.list.filter((o) => !o.out).length === 2) {
      if (this.lethal(V, V.pendingLaunch.v, kb)) zoom = 2;
      else if ((kb > 125 || (hv.smash && kb > 100)) && this.tick - this.zoomCd > ZOOM_GAP) zoom = 1;
    }
    if (zoom === 2) this.slow(ZOOM_KO, ZOOM_K);
    else if (zoom === 1) { this.slow(9, 0.4); this.zoomCd = this.tick; }
    else if (kb > 150) this.slow(8, 0.5); // a short slow-motion only on the big launches
    this.emit('hit', {
      s: V.slot, a: hv.owner, x: px, y: py, z: pz, d: dmg, kb, sfx: hv.sfx || 'hitM', b: hv.blood ?? 1,
      lx: V.pendingLaunch.v[0], ly: V.pendingLaunch.v[1], lz: V.pendingLaunch.v[2], smash: hv.smash ? 1 : 0, fx: hv.fx, m: hv.move, sm: hv.srcMove, beat: hv.beat ? 1 : 0,
    });
    if (zoom) this.emit('zoom', { s: V.slot, a: hv.owner, x: px, y: py, z: pz, k: zoom });
    if (hv.onHit) hv.onHit(V, this, hv);
    return true;
  }

  // will this launch carry the fighter past a blast line? Its flight is played ahead (no scenery): gravity (lighter in
  // hitstun), its fall speed, the launch losing speed; with LETHAL_MARGIN less speed (what a good DI saves), so that
  // the zoom rarely lies. Off the side, over the top, or under the arena away from it.
  lethal(V, v, kb) {
    const S = CHARS[V.char].stats, m = this.stage.main();
    const hs = Math.max(8, Math.floor(kb * HITSTUN_PER_KB)), g0 = GRAVITY * (S.gravity || 1), fall = S.fallSpeed || 17;
    let x = V.x, y = V.y, kx = v[0] * LETHAL_MARGIN, ky = v[1] * LETHAL_MARGIN, vy = 0;
    for (let f = 0; f < 180; f++) {
      vy -= g0 * (f < hs ? 0.62 : 1) * DT;
      if (vy < -fall) vy = -fall;
      const km = DMath.hypot(kx, ky);
      if (km > 0) { const k = Math.max(0, km - KB_DECAY * DT) / km; kx *= k; ky *= k; }
      x += kx * DT; y += (vy + ky) * DT;
      const dx = Math.abs(x - m.cx);
      if (dx > BLAST.side || y > BLAST.top || (y < BLAST.bottom && dx > (m.r || 12) + 2)) return true;
      if (km < 3 && f > hs) return false; // the launch is spent: it lives
    }
    return false;
  }

  // a perfect guard sends a projectile back, and the rest of its volley still in the air: it changes sides, flies back
  // a little faster and hurts a little more (at most twice its first damage, so that a ping-pong ends), a lob goes
  // back as a lob, a projectile falling or rising straight goes for its thrower
  reflect(e0, V, A, x, y, z) {
    const group = e0.grp !== undefined ? this.entities.filter((e) => e.kind === 'proj' && !e.dead && e.grp === e0.grp && e.owner === e0.owner) : [e0];
    const T = A || this.fighters[e0.owner];
    for (const e of group) {
      const sp = DMath.hypot(e.vx, e.vy);
      let vx = -e.vx, vy;
      if (Math.abs(e.vx) < 2 || Math.abs(e.vx) < Math.abs(e.vy) * 0.6) {
        const s = T ? (T.x > e.x ? 1 : -1) : (V.x > e.x ? -1 : 1);
        vx = s * Math.max(12, sp * 0.8);
        vy = e.grav ? 6 : 2;
      } else vy = e.grav ? Math.max(5, Math.abs(e.vy) * 0.6) : -e.vy * 0.5;
      e.vx = vx * 1.15; e.vy = vy; e.vz = 0;
      e.dir = e.vx < 0 ? -Math.PI / 2 : Math.PI / 2;
      e.owner = V.slot;
      if (e.dmg0 === undefined) e.dmg0 = e.dmg;
      e.dmg = Math.min(e.dmg0 * 2, e.dmg * 1.25);
      e.refl = (e.refl || 0) + 1;
      e.life = Math.max(e.life || 0, 50);
      if (e.outT) e.t = 0; // a boomerang flies out again (and comes back to its new owner)
    }
    this.emit('reflect', { s: V.slot, a: T ? T.slot : -1, n: group.length, x, y, z });
  }

  slow(frames, k) { this.slowT = Math.max(this.slowT, frames); this.slowK = Math.min(this.slowT > frames ? this.slowK : 1, k); }

  separate() {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.out || a.state === 'dead' || a.state === 'respawn' || a.state === 'grabbed' || a.state === 'ledge') continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.out || b.state === 'dead' || b.state === 'respawn' || b.state === 'grabbed' || b.state === 'ledge') continue;
        if (Math.abs(a.y - b.y) > Math.max(a.height, b.height) * 0.8) continue;
        if ((a.carryT > 0 && a.carryBy === b.slot) || (b.carryT > 0 && b.carryBy === a.slot)) continue; // carried: they stay together
        // 2D: fighters on top of each other slide apart along x (gently: they can still cross)
        const dx = b.x - a.x;
        const d = Math.abs(dx);
        const min = (a.radius + b.radius) * 0.85;
        if (d >= min) continue;
        const nx = d < 1e-4 ? (a.slot < b.slot ? 1 : -1) : Math.sign(dx);
        const push = Math.min(0.06, (min - d) * 0.22);
        a.x -= nx * push; b.x += nx * push;
      }
    }
  }

  checkBlast() {
    const m = this.stage.main();
    for (const F of this.list) {
      if (F.out || F.state === 'dead' || F.state === 'respawn') continue;
      const d = Math.abs(F.x - m.cx);
      let kind = null;
      if (F.y < BLAST.bottom) kind = 'bottom';
      else if (d > BLAST.side) kind = 'side';
      else if (F.y > BLAST.top && (F.state === 'hitstun' || F.state === 'tumble')) kind = 'top';
      if (!kind) continue;
      const lastStanding = this.rules.mode === 'stock' && F.stocks === 1 && this.list.filter((o) => !o.out && o !== F).length === 1;
      knockOut(F, this, kind);
      if (lastStanding || F.out) {
        if (lastStanding) this.freeze = 4; // a hit stop, then the slow motion of the end (finish)
        F.place = this.list.filter((o) => !o.out).length + 1;
        this.placements.push(F.slot);
      } else {
        this.slow(30, 0.45);
      }
      const alive = this.list.filter((o) => !o.out);
      if (this.rules.mode === 'stock') {
        const teamsAlive = new Set(alive.map((o) => (this.rules.teams ? o.team : o.slot)));
        if (teamsAlive.size <= 1) this.finish();
      }
    }
  }

  finish() {
    if (this.phase === 'end' || this.phase === 'over') return;
    this.phase = 'end'; this.phaseT = 0;
    // ranking
    let ranked;
    if (this.rules.mode === 'stock') {
      const alive = this.list.filter((o) => !o.out).sort((a, b) => b.stocks - a.stocks || a.damage - b.damage);
      const outs = this.placements.slice().reverse().map((s) => this.fighters[s]);
      ranked = [...alive, ...outs];
    } else {
      ranked = this.list.slice().sort((a, b) => (b.stats.kos - b.stats.falls - b.stats.sd * 0) - (a.stats.kos - a.stats.falls) || a.damage - b.damage);
    }
    ranked.forEach((F, i) => { F.place = i + 1; });
    this.winner = ranked[0] ? ranked[0].slot : -1;
    this.emit('game', { w: this.winner });
    this.slow(END_SLOW + 2, END_K);
  }

  // ---------------------------------------------------------------------------------------------------------
  // snapshot for the network (clients render it, interpolating between two of them)
  snapshot() {
    return {
      t: this.tick, ph: this.phase, pt: this.phaseT, tl: this.timeLeft, w: this.winner, ts: this.timeScale,
      f: this.list.map(packFighter),
      e: this.entities.map(packEntity),
      st: this.stage.getState(),
      mg: this.mg, mc: this.mgClock, mr: this.mgResume,
    };
  }

  applySnapshot(s) {
    this.tick = s.t; this.phase = s.ph; this.phaseT = s.pt; this.timeLeft = s.tl; this.winner = s.w;
    for (const pf of s.f) unpackFighter(this.fighters[pf[0]], pf);
    this.entities = s.e.map(unpackEntity);
    this.stage.setState(s.st);
    this.mg = s.mg || null; this.mgClock = s.mc || 0; this.mgResume = s.mr || null;
  }
}

// --- packing ---------------------------------------------------------------------------------------------------
const STATES = ['idle', 'walk', 'run', 'air', 'tumble', 'jumpsquat', 'land', 'move', 'hitstun', 'shield', 'dodge', 'airdodge',
  'ledge', 'grabbing', 'grabbed', 'dead', 'respawn', 'helpless', 'down', 'getup', 'tech', 'dizzy', 'stunned', 'held', 'crouch', 'rebound'];
const STATE_ID = Object.fromEntries(STATES.map((s, i) => [s, i]));
const r3 = (v) => Math.round(v * 1000) / 1000;

export function packFighter(F) {
  return [F.slot, r3(F.x), r3(F.y), r3(F.z), r3(F.vx + F.kx), r3(F.vy + F.ky), r3(F.vz + F.kz), r3(F.facing),
    STATE_ID[F.state] ?? 0, F.st, F.move || '', F.mf, Math.round(F.damage * 10) / 10, F.stocks, F.hitlag,
    F.invuln, F.intangible, Math.round(F.shield * 10) / 10, F.grounded ? 1 : 0, F.va.map(r3), r3(F.size),
    F.out ? 1 : 0, F.place, F.mv.charge || 0, r3(F.bloodied), F.dizzy, F.stun, F.grabbedBy, F.grabbing,
    F.stats.kos, F.stats.falls, Math.round(F.stats.dealt), F.jumps, F.slip, F.speedMul !== 1 ? 1 : 0, F.respawnT > 1e8 ? 1 : 0, Math.round(F.launchKb || 0),
    ['n', 's', 'd'].map((k) => Math.round(100 * (F.cd ? F.cd[k] / (F.cdMax[k] || 1) : 0)) / 100)];
}

export function unpackFighter(F, a) {
  if (!F) return;
  [, F.x, F.y, F.z, F.vx, F.vy, F.vz, F.facing] = a;
  F.state = STATES[a[8]]; F.st = a[9]; F.move = a[10] || null; F.mf = a[11]; F.damage = a[12]; F.stocks = a[13];
  F.hitlag = a[14]; F.invuln = a[15]; F.intangible = a[16]; F.shield = a[17]; F.grounded = !!a[18];
  F.va = a[19]; F.size = a[20]; F.out = !!a[21]; F.place = a[22]; F.mv = F.mv || {}; F.mv.charge = a[23];
  F.bloodied = a[24]; F.dizzy = a[25]; F.stun = a[26]; F.grabbedBy = a[27]; F.grabbing = a[28];
  F.stats.kos = a[29]; F.stats.falls = a[30]; F.stats.dealt = a[31]; F.jumps = a[32]; F.slip = a[33]; F.speedMul = a[34] ? 1.5 : 1; F.launchKb = a[36] || 0;
  F.cdFrac = a[37] || null; // the client only needs how much of each cooldown is left (HUD)
  F.kx = F.ky = F.kz = 0;
}

export function packEntity(e) {
  const B = ENTITIES[e.kind];
  const extra = B && B.pack ? B.pack(e) : 0;
  return [e.id, e.kind, r3(e.x), r3(e.y), r3(e.z), r3(e.vx), r3(e.vy), r3(e.vz), e.owner, e.t, r3(e.r || 0), e.life ?? -1, extra];
}

export function unpackEntity(a) {
  const e = { id: a[0], kind: a[1], x: a[2], y: a[3], z: a[4], vx: a[5], vy: a[6], vz: a[7], owner: a[8], t: a[9], r: a[10], life: a[11] };
  const B = ENTITIES[e.kind];
  if (B && B.unpack) B.unpack(e, a[12]);
  return e;
}
