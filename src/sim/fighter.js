// Fighter simulation: state machine, controls, physics, ledges, shields, grabs.
// Everything on a fighter is plain serialisable data (snapshots, client prediction); the character
// definition (moves, stats) is looked up by id in CHARS.
import {
  DT, GRAVITY, KB_DECAY, BUFFER, CHORD, UP_WINDOW, SHIELD_MAX, SHIELD_DRAIN, SHIELD_REGEN, SHIELD_MIN, SHIELD_DROP, DODGE_RESET, ULT_MAX,
  LEDGE_INTANGIBLE, RESPAWN_INVULN, TUMBLE_KB, STICK_DIR, PLANE_Z,
} from './constants.js';
import { BTN, DIGITAL } from '../core/input.js';
import { approach, wrapAngle, faceSign, faceOf, RIGHT, LEFT } from './util.js';
import { CHARS } from './chars/index.js';
import { DMath } from './dmath.js';
import { startUltimate } from './ultimate.js';

export const ACTIONABLE = new Set(['idle', 'walk', 'run', 'crouch', 'air', 'tumble']);
const STOP_AT_EDGE = new Set(['move', 'shield', 'dodge', 'rebound', 'land', 'jumpsquat', 'getup', 'tech', 'grabbing', 'dizzy', 'stunned']);

export function createFighter(slot, info, spawn) {
  const def = CHARS[info.char];
  const S = def.stats;
  return {
    slot, char: info.char, name: info.name || def.name, color: info.color ?? slot, team: info.team ?? slot,
    bot: info.bot || 0, peer: info.peer || 'local',
    x: spawn.x, y: spawn.y, z: spawn.z, vx: 0, vy: 0, vz: 0, kx: 0, ky: 0, kz: 0,
    facing: spawn.facing, grounded: true, surf: 0, jumps: S.airJumps, airdodged: false,
    radius: S.radius, height: S.height,
    state: 'idle', st: 0, move: null, mf: 0, af: -1, mseq: 0, mv: {}, va: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    damage: 0, stocks: 3, hitlag: 0, hitstun: 0, invuln: 0, intangible: 0, armor: 0,
    shield: SHIELD_MAX, shieldStart: -999, shieldStun: 0, sPend: 0,
    usedUp: false, upN: 0, // up specials used in this time in the air (most: 1; OMFU's drums: upUses 3)
    airOnce: 0, rebT: 0, // the specials used once in this time in the air (bits: 1 side, 2 down); a rebound's length (a clank)
    lockLand: 0, // frames to stay stuck once landed (a move's afterLock, ended in the air: SKANKY's train)
    bufA: 0, bufX: 0, bufJ: 0, bufS: 0, bufG: 0, lastJump: -999, prevMag: 0, prevMy: 0, held: 0, mx: 0, my: 0,
    ff: false, ffArm: -999, dnUpT: 0, ffBlock: 0, helplessAfter: false, dropT: 0,
    dodgeP: 0, dodgeT: -999, sxLowT: -999, syLowT: -999, shBroke: false, // dodge staling (Ultimate); the stick last seen centred (flicks out of shield); shield broken
    prevMx: 0, tapDir: 0, tapT: -999, dashReq: 0, dashT: 0, runDir: 1, skidT: 0, // double-tap dash / run (Smash)
    xArm: true, yArm: true, xRelT: -999, yRelT: -999, downT: -999, dropReq: -999, // the stick back in the centre between two taps; double down
    xLowT: -999, xFlick: false, flickT: -999, adHelpless: false, // the stick last seen in the centre; a flick already used (one dash per flick)
    cd: { n: 0, s: 0, d: 0, a: 0 }, cdMax: { n: 1, s: 1, d: 1, a: 1 }, // special cooldowns (frames) (only a move asking for its own: cdOwn); a: the neutral A (PPROD's gold bar)
    grabbedBy: -1, grabbing: -1, grabT: 0,
    lastHitBy: -1, lastHitTick: -9999, pendingLaunch: null, launchKb: 0,
    ledgeCD: 0, ledgeGrabs: 0, ledgeT: 0, ledgeNx: 0, ledgeNz: 0,
    respawnT: 0, out: false, place: 0,
    dizzy: 0, slip: 0, speedMul: 1, stun: 0, size: 1, bloodied: 0,
    // statuses of the big pass (16 Oct 2026): asleep (a dizzy that mashing barely shortens), dancing (stunned with
    // the funk), steered by someone else (BIDO's kiss: ctrlBy his slot), pizzas eaten this stock (PPROD), buried (OMFU)
    sleep: 0, dance: 0, ctrlBy: -1, ctrlT: 0, pizzas: 0, buried: 0,
    carryBy: -1, carryT: 0, carryX: 0, carryY: 0, // held by a multi-hit move (World: drag), at that offset from it
    capOut: 0, guitarOut: 0, // Tices' cap flying (his head bare), Epektase's guitar spinning up there
    lie: 0, levT: 0, lifted: 0, // stunned lying on the floor (slipped on a puddle); levitating (ANBUU); held up flat (OMFU)
    stats: { dealt: 0, taken: 0, kos: 0, falls: 0, blood: 0, sd: 0 },
    ult: 0, // the ultimate gauge (ultimate.js), 0..ULT_MAX
    flags: 0,
  };
}

const def = (F) => CHARS[F.char];
export const moveOf = (F) => (F.move ? def(F).moves[F.move] : null);

function stickMag(F) { return DMath.hypot(F.mx, F.my); }
// 'n' neutral, 'u' up, 'd' down, 'f' toward the facing, 'b' behind (2D: the stick moves along x, my is up / down)
export function stickKind(F, th = STICK_DIR) {
  const ax = Math.abs(F.mx), ay = Math.abs(F.my);
  if (Math.max(ax, ay) < th) return 'n';
  if (ay >= ax * 0.95) return F.my > 0 ? 'u' : 'd';
  return Math.sign(F.mx) === faceSign(F.facing) ? 'f' : 'b';
}
// snap any facing to the plane (right or left)
export function snapFacing(F) { F.facing = faceSign(F.facing) < 0 ? LEFT : RIGHT; }

export function setState(F, s) {
  if (F.state !== s) {
    // out of a status (a hit wakes the sleeper up, gets the fallen one up, stops the dance)
    if (F.state === 'dizzy') F.sleep = 0;
    if (F.state === 'grabbed') F.lifted = 0;
    if (F.state === 'stunned') { F.lie = 0; F.dance = 0; }
    F.state = s; F.st = 0;
  }
  F.helplessAfter = false; // an aerial thrown after a recovery ends helpless again (endMove); anything else: no
}

export function startMove(F, W, id, opts = {}) {
  const M = def(F).moves[id];
  if (!M) return false;
  if (M.groundOnly && !F.grounded) return false;
  // the up special, once per time in the air (Smash): being hit does not give it back, landing, a ledge or a new
  // stock do (land, grabLedge, respawn). A recovery in several goes (upUses: OMFU's 3 drums) counts them: each one
  // whenever the player wants, until they are all used
  if (id === 'sp_u') {
    if (F.grounded) F.upN = 0;
    if (F.usedUp && !F.grounded) return false;
    F.upN = (F.upN || 0) + 1;
    F.usedUp = F.upN >= (M.upUses || 1);
  }
  F.state = 'move'; F.st = 0;
  F.move = id; F.mf = 0; F.af = -1; F.mseq++;
  F.mv = { charge: 0, ...opts };
  F.va.fill(0);
  // aerials never turn the fighter around (that is what makes back air possible); the rest turn toward the stick
  if (M.autoFace !== false && !M.air && Math.abs(F.mx) > 0.35 && opts.keepFacing !== true) F.facing = faceOf(F.mx);
  if (opts.dir !== undefined) F.facing = opts.dir;
  snapFacing(F);
  if (M.onStart) M.onStart(F, W);
  W.emit('move', { s: F.slot, m: id });
  return true;
}

// double tap a direction (twice within DASH_WIN frames) to dash: an initial burst, then the run while it is held
export const DASH_WIN = 18, DASH_LEN = 11, SKID_LEN = 8;
// A within this many frames of a flick: a smash (the flick and A rarely land on the same frame)
export const SMASH_WIN = 5;

// No cooldowns on the specials (Ultimate): their own lag stops the spamming, and the ones that move the fighter in
// the air (airOnce: a dash, a stall) work once until landing, a ledge or being hit. A move can still ask for a
// cooldown of its own (cdOwn: frames).
function armCooldown(F, key) {
  if (!(key in F.cd)) return;
  const M = def(F).moves['sp_' + key];
  if (M && M.cdOwn) F.cd[key] = F.cdMax[key] = M.cdOwn;
}
const AIR_ONCE = { s: 1, d: 2 };

export function endMove(F, W) {
  const M = moveOf(F);
  if (M && M.onEnd) M.onEnd(F, W);
  const after = F.helplessAfter;
  F.move = null; F.mv = {};
  // stuck after it (afterLock): on the spot, or as soon as it lands
  if (M && M.afterLock) {
    if (F.grounded) { setState(F, 'stunned'); F.stun = M.afterLock; F.vx = 0; W && W.emit('stuck', { s: F.slot }); return; }
    F.lockLand = M.afterLock;
  }
  if (F.grounded) setState(F, 'idle');
  else setState(F, (M && M.helpless) || after ? 'helpless' : 'air');
}

// last active frame of a move's hitboxes (for the hit cancels)
const hitEnd = (M) => { if (M._hitEnd === undefined) M._hitEnd = (M.hits || []).reduce((m, h) => Math.max(m, h.f[1]), 0); return M._hitEnd; };

function canAct(F) {
  if (ACTIONABLE.has(F.state)) return true;
  if (F.state === 'move') {
    const M = moveOf(F);
    if (!M) return false;
    if (M.iasa !== undefined && F.mf >= M.iasa) return true;
    // combos: a quick hit that connected can be cancelled into the next attack right after its hitbox
    if (M.combo && F.mv.landed && F.hitlag <= 0 && F.mf > hitEnd(M) + 1) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------
export function stepFighter(F, I, W) {
  // --- inputs & buffers
  F.mx = I.mx; F.my = I.my; F.held = I.held;
  const P = I.pressed;
  F.bufA = (P & BTN.A) ? BUFFER : Math.max(0, F.bufA - 1);
  F.bufX = (P & BTN.X) ? BUFFER : Math.max(0, F.bufX - 1);
  F.bufJ = (P & BTN.JUMP) ? BUFFER : Math.max(0, F.bufJ - 1);
  F.bufS = (P & BTN.SHIELD) ? BUFFER : Math.max(0, F.bufS - 1);
  F.bufG = (P & BTN.GRAB) ? BUFFER : Math.max(0, F.bufG - 1);
  if (P & BTN.JUMP) F.lastJump = W.tick;
  if (I.held & BTN.SHIELD) F.sPend++; else F.sPend = 0;
  // double tap: the stick (or a key) pushed from the centre to a side twice in a row, same side. A tap is the stick
  // going past 0.55 after it came back under 0.3, however many frames the push takes (an analog stick crosses the
  // middle over several frames: comparing with the previous frame alone missed half the taps)
  // The window runs from the moment the stick was let go: walk, let go, push again quickly = run.
  if (Math.abs(F.mx) < 0.3 && !F.xArm) { F.xArm = true; F.xRelT = W.tick; }
  // a hard flick (the stick from the centre to the edge within 4 frames, Smash's dash input) runs at once; a keyboard
  // (DIGITAL: every press is instant) and the bots (they run by pushing hard) keep their own way
  if (Math.abs(F.mx) < 0.3) { F.xLowT = W.tick; F.xFlick = false; }
  else if (!F.xFlick && !F.bot && !(I.held & DIGITAL) && Math.abs(F.mx) >= 0.8 && Math.abs(F.mx) >= Math.abs(F.my) * 0.8 && W.tick - F.xLowT <= 4) {
    F.xFlick = true; F.dashReq = Math.sign(F.mx); F.tapT = W.tick; F.tapDir = 0; F.flickT = W.tick;
  }
  // the keyboard runs as soon as a direction is pressed (held with the walk key, Ctrl, the stick is at half: it walks);
  // A right after it is still a smash (SMASH_WIN), as after a flick
  else if (!F.xFlick && (I.held & DIGITAL) && Math.abs(F.mx) >= 0.9 && Math.abs(F.mx) >= Math.abs(F.my) * 0.8) {
    F.xFlick = true; F.dashReq = Math.sign(F.mx); F.tapT = W.tick; F.tapDir = 0; F.flickT = W.tick;
  }
  // (and a direction still held when it lands, or once a move is over: it runs on, it does not walk)
  if ((I.held & DIGITAL) && F.state === 'walk' && Math.abs(F.mx) >= 0.9 && !F.dashReq) { F.dashReq = Math.sign(F.mx); F.tapT = W.tick; }
  const tap = F.xArm && Math.abs(F.mx) > 0.55 && Math.abs(F.mx) >= Math.abs(F.my) * 0.8 ? Math.sign(F.mx) : 0;
  if (tap) {
    F.xArm = false;
    if (F.tapDir === tap && W.tick - F.xRelT <= DASH_WIN) { F.dashReq = tap; F.tapT = -999; F.tapDir = 0; }
    else { F.tapDir = tap; F.tapT = W.tick; }
  }
  if (F.dashReq && W.tick - F.tapT > 1 && F.state !== 'idle' && F.state !== 'walk' && F.state !== 'run' && F.state !== 'crouch' && F.state !== 'land') F.dashReq = 0;
  // double down: drops through a thin platform (a single down crouches)
  if (F.my > -0.3 && !F.yArm) { F.yArm = true; F.yRelT = W.tick; }
  if (F.yArm && F.my < -0.6 && -F.my >= Math.abs(F.mx) * 0.8) {
    F.yArm = false;
    if (F.downT > -999 && W.tick - F.yRelT <= DASH_WIN) { F.dropReq = W.tick; F.downT = -999; } else F.downT = W.tick;
  }
  // special cooldowns run once the special is over
  for (const k in F.cd) if (F.cd[k] > 0 && F.move !== 'sp_' + k) F.cd[k]--;

  if (F.state === 'dead') {
    if (--F.respawnT <= 0) respawn(F, W);
    return;
  }

  // --- hitlag freeze (SDI nudges)
  if (F.hitlag > 0) {
    F.hitlag--;
    if (F.pendingLaunch && stickMag(F) > 0.6 && (P & (BTN.A | BTN.X | BTN.JUMP)) === 0) {
      F.x += F.mx * 0.06; F.y += Math.max(0, F.my) * 0.03;
    }
    if (F.hitlag === 0 && F.pendingLaunch) applyLaunch(F, W);
    return;
  }

  F.st++;
  F.armor = 0; // moves set it again every frame they want it
  if (F.invuln > 0) F.invuln--;
  if (F.intangible > 0) F.intangible--;
  if (F.ledgeCD > 0) F.ledgeCD--;
  if (F.shieldStun > 0) F.shieldStun--;
  if (F.slip > 0) F.slip--;
  if (F.stun > 0) F.stun--;
  if (F.grounded && F.move !== 'sp_u') { F.usedUp = false; F.upN = 0; F.airOnce = 0; } // an up special that never left the ground does not count
  if (F.dropT > 0) F.dropT--;
  // the stick last seen near the centre: a flick out of the shield rolls or spot dodges (a slow tilt does not)
  if (Math.abs(F.mx) < 0.3) F.sxLowT = W.tick;
  if (F.my > -0.3) F.syLowT = W.tick;
  if (F.state === 'dodge' || F.state === 'airdodge') F.dodgeT = W.tick;
  if (F.state !== 'shield' && !F.shBroke) F.shield = Math.min(SHIELD_MAX, F.shield + SHIELD_REGEN);
  if (F.speedT > 0) { F.speedT--; if (F.speedT === 0) F.speedMul = 1; }
  if (F.size < 1 && def(F).regrow) F.size = Math.min(1, F.size + def(F).regrow);

  const S = def(F).stats;

  switch (F.state) {
    case 'respawn': {
      F.vx = F.vz = F.vy = 0; F.kx = F.ky = F.kz = 0;
      const anyInput = stickMag(F) > 0.3 || (P & (BTN.A | BTN.X | BTN.JUMP | BTN.SHIELD));
      if ((F.st > 20 && anyInput) || F.st > 260) {
        setState(F, 'air'); F.grounded = false; F.jumps = S.airJumps; F.invuln = Math.max(F.invuln, 70);
        W.emit('respawnDrop', { s: F.slot });
      }
      return;
    }
    case 'grabbed': return stepGrabbed(F, W);
    case 'held': {
      // trapped inside an entity (humanball...): the entity moves us; mashing helps it break
      F.vx = F.vy = F.vz = F.kx = F.ky = F.kz = 0;
      F.intangible = Math.max(F.intangible, 2);
      if (P & (BTN.A | BTN.X | BTN.JUMP | BTN.SHIELD)) F.mash = (F.mash || 0) + 1;
      if (stickMag(F) > 0.7 && F.prevMag < 0.4) F.mash = (F.mash || 0) + 1;
      F.prevMag = stickMag(F);
      if (!W.entities.some((e) => e.id === F.heldBy && !e.dead)) { setState(F, 'air'); F.grounded = false; F.heldBy = 0; }
      return;
    }
    case 'grabbing': return stepGrabbing(F, I, W);
    case 'ledge': return stepLedge(F, I, W, S);
    case 'hitstun':
      if (--F.hitstun <= 0) setState(F, F.grounded ? 'idle' : (F.launchKb >= TUMBLE_KB ? 'tumble' : 'air'));
      break;
    case 'down':
      F.vx *= 0.8; F.vz *= 0.8;
      if ((F.st > 14 && (stickMag(F) > 0.5 || P)) || F.st > 50) { setState(F, 'getup'); F.intangible = 18; F.mv = {}; }
      break;
    case 'getup':
      // over a ledge it takes a little longer (Ultimate: about half a second), from the floor 20 frames
      if (F.st > (F.mv && F.mv.ledge ? 30 : 20)) setState(F, 'idle');
      break;
    case 'tech':
      if (F.st > 22) setState(F, 'idle');
      break;
    case 'dizzy':
      F.vx *= 0.85; F.vz *= 0.85;
      if (P) F.dizzy -= F.sleep ? 1 : 4; // asleep: mashing barely wakes you up
      if (F.sleep && F.dizzy % 40 === 20) W.emit('snore', { s: F.slot, x: F.x, y: F.y + 0.9, z: 0 });
      if (--F.dizzy <= 0) { F.sleep = 0; setState(F, 'idle'); if (F.shBroke) { F.shBroke = false; F.shield = SHIELD_MAX * 0.75; } } // (Ultimate: back at 75 %)
      break;
    case 'stunned':
      F.vx *= 0.85; F.vz *= 0.85;
      if (F.stun <= 0) { F.dance = 0; F.lie = 0; setState(F, F.grounded ? 'idle' : 'air'); }
      break;
    case 'jumpsquat':
      if (F.bufX > 0 && tryUpSpecialFromSquat(F, W)) break;
      if (F.bufA > 0) { F.bufA = 0; F.bufJ = 0; startMove(F, W, 'usmash'); break; }
      if (F.st >= 3) doJump(F, W, S, (F.held & BTN.JUMP) ? 1 : (S.shortHop || 0.68)); // jump released during the squat: a short hop (its archetype's)
      break;
    case 'land':
      if (F.st >= (F.landLag || 4)) setState(F, 'idle');
      break;
    case 'shield':
      stepShield(F, I, W, S);
      break;
    case 'dodge': {
      // roll or spot dodge, its intangible frames exactly (counted from 1 like Ultimate's; F.st from 0); back to the
      // shield if it is still held
      const spot = F.mv && F.mv.spot, d = F.mv.d || (F.mv.d = { ...def(F).stats.dodge[spot ? 'spot' : 'froll'] });
      if (F.st >= d.s - 1 && F.st <= d.e - 1) F.intangible = Math.max(F.intangible, 1);
      // a spot dodge cancelled into a ground attack or special (Ultimate: 5 frames early; not a grab)
      if (spot && d.cancel && F.st >= d.cancel && F.st < d.total && (F.bufA > 0 || F.bufX > 0) && !(F.held & BTN.SHIELD)) {
        F.bufG = 0; setState(F, 'idle'); readActions(F, I, W, S);
        if (F.state !== 'idle') break;
      }
      if (F.st >= d.total) {
        if (!spot && F.mv && F.mv.dx) F.facing = faceOf(-F.mv.dx); // back up facing where it rolled from
        if (F.held & BTN.SHIELD) { setState(F, 'shield'); F.shieldStart = -999; } else setState(F, 'idle');
      }
      break;
    }
    case 'airdodge': {
      // its intangible frames exactly, then nothing to do until its end (Ultimate: a directional one lasts long)
      if (!F.mv.total) F.mv = { dir: 0, ...def(F).stats.dodge.nad };
      const a = F.mv;
      if (F.st >= a.s - 1 && F.st <= a.e - 1) F.intangible = Math.max(F.intangible, 1);
      if (F.st >= a.total) { setState(F, F.adHelpless ? 'helpless' : 'air'); F.adHelpless = false; }
      break;
    }
    case 'move':
      stepMove(F, I, W);
      break;
    case 'helpless':
      // the fall after an up special: no jump, no other special; a hit ends it (the up special is back). Unlike Ultimate,
      // the air dodge (once in the air) and the aerials (A) stay possible: the fighter is helpless again once they are
      // over (no second recovery). A recovery in several goes (OMFU's drums: upUses) goes on from here
      if (F.bufX > 0 && !F.usedUp && (stickKind(F) === 'u' || W.tick - F.lastJump <= UP_WINDOW)) { F.bufX = 0; F.bufJ = 0; if (startMove(F, W, 'sp_u')) break; }
      if (!F.airdodged && F.bufS > 0 && (F.held & BTN.SHIELD)) { startAirDodge(F, W); F.adHelpless = true; break; }
      if (F.bufA > 0 || F.bufG > 0) {
        F.bufA = 0; F.bufG = 0;
        const k = stickKind(F);
        F.ffBlock = W.tick + 6; F.ffArm = -999;
        if (startMove(F, W, k === 'u' ? 'uair' : k === 'd' ? 'dair' : k === 'f' ? 'fair' : k === 'b' ? 'bair' : 'nair')) F.helplessAfter = true;
      }
      break;
    case 'rebound':
      // two attacks clanked (world.js resolveClanks): the fighter recoils, then can act again
      F.vx *= 0.8; F.vz *= 0.8;
      if (F.st >= (F.rebT || 20)) setState(F, F.grounded ? 'idle' : 'air');
      break;
    default: break;
  }

  if (canAct(F)) readActions(F, I, W, S);

  control(F, W, S);
  integrate(F, W, S);
  snapFacing(F);
  F.prevMag = stickMag(F);
  F.prevMy = F.my;
  F.prevMx = F.mx;
}

function tryUpSpecialFromSquat(F, W) {
  F.bufX = 0; F.bufJ = 0;
  return startMove(F, W, 'sp_u');
}

function readActions(F, I, W, S) {
  // jump + X pressed together (or the stick up) = up special; the jump chord stays for those who learned it
  const upChord = W.tick - F.lastJump <= UP_WINDOW;
  const shieldHeld = (F.held & BTN.SHIELD) !== 0;
  const k = stickKind(F);

  // the ultimate: A and X pressed together (both within the last 3 frames) with a full gauge
  if (F.ult >= ULT_MAX && F.bufA >= BUFFER - 3 && F.bufX >= BUFFER - 3 && startUltimate(F, W)) return;

  // specials
  if (F.bufX > 0) {
    F.bufX = 0;
    let id = 'sp_n';
    if (k === 'u' || upChord) { id = 'sp_u'; F.bufJ = 0; }
    else if (k === 'd' || shieldHeld) id = 'sp_d';
    else if (k === 'f' || k === 'b') id = 'sp_s';
    const key = id.slice(3);
    const Mx = def(F).moves[id];
    const once = Mx && Mx.airOnce && !F.grounded ? AIR_ONCE[key] || 0 : 0;
    // one at a time (Ultimate's limit on the projectiles that would be spammed): not again while what it threw is out
    const out = Mx && Mx.oneOut && W.entities.some((e) => !e.dead && e.owner === F.slot && e.srcMove === id);
    if ((F.cd[key] > 0 && !(Mx && Mx.cdBypass && Mx.cdBypass(F, W))) || (once && (F.airOnce & once)) || out) W.emit('cdDeny', { s: F.slot, k: key });
    else if (startMove(F, W, id)) { armCooldown(F, key); if (once) F.airOnce |= once; return; }
  }
  // attacks: on the ground smashes in every direction, in the air the five aerials
  if (F.bufA > 0 || F.bufG > 0) {
    const grab = F.bufG > 0;
    F.bufA = 0; F.bufG = 0;
    if (F.grounded) {
      if (grab || shieldHeld) { startMove(F, W, 'grab'); return; }
      // A right after the flick that started the run (within SMASH_WIN frames): it was a smash input, not a dash
      if (F.state === 'run' && (k === 'f' || k === 'b' || k === 'n') && W.tick - F.flickT <= SMASH_WIN) { F.vx *= 0.25; startMove(F, W, 'smash', { dir: faceOf(F.runDir) }); return; }
      // A while running: the character's dash attack (up still gives the up smash, like Smash)
      if (F.state === 'run' && k !== 'u' && def(F).moves.dashattack) { startMove(F, W, 'dashattack', { dir: faceOf(F.runDir), speed: Math.abs(F.vx) }); return; }
      if (upChord && F.bufJ > 0) { F.bufJ = 0; startMove(F, W, 'usmash'); return; }
      if (k === 'u') { startMove(F, W, 'usmash'); return; }
      if (k === 'd') { startMove(F, W, 'dsmash'); return; }
      if (k === 'f' || k === 'b') { startMove(F, W, 'smash'); return; }
      if (F.cd.a > 0) { W.emit('cdDeny', { s: F.slot, k: 'a' }); return; } // (the neutral A recharging)
      startMove(F, W, 'jab1'); return;
    } else {
      F.ffBlock = W.tick + 6; F.ffArm = -999; // the down of a down air is not a fast fall
      if (k === 'u') { startMove(F, W, 'uair'); return; }
      if (k === 'd' || shieldHeld) { startMove(F, W, 'dair'); return; }
      if (k === 'f') { startMove(F, W, 'fair'); return; }
      if (k === 'b') { startMove(F, W, 'bair'); return; }
      startMove(F, W, 'nair'); return;
    }
  }
  // jumps
  if (F.bufJ > 0 && F.state !== 'move') {
    if (F.grounded) { F.bufJ = 0; setState(F, 'jumpsquat'); return; }
    if (F.jumps > 0 && F.state !== 'helpless') { F.bufJ = 0; doJump(F, W, S, 1, true); return; }
  }
  if (F.state === 'move' && F.bufJ > 0) {
    // jump-cancel out of the end of a move
    if (F.grounded) { F.bufJ = 0; F.move = null; setState(F, 'jumpsquat'); return; }
    if (F.jumps > 0) { F.bufJ = 0; F.move = null; doJump(F, W, S, 1, true); return; }
  }
  // shield / roll / spot dodge, on the first frame (Ultimate): the stick already held when the shield is pressed rolls
  // or spot dodges at once (not out of a run: that is a shield); in the air, the air dodge. A second button with it
  // (A: grab, X: down special) still counts, from the shield (stepShield)
  if (shieldHeld) {
    if (F.grounded) {
      if (F.bufS > 0 && F.state !== 'run') {
        if (Math.abs(F.mx) > 0.6 && Math.abs(F.mx) >= Math.abs(F.my)) { F.bufS = 0; startDodge(F, W, Math.sign(F.mx)); return; }
        if (F.my < -0.65) { F.bufS = 0; startDodge(F, W, 0); return; }
      }
      if (F.state !== 'move') { F.bufS = 0; setState(F, 'shield'); F.shieldStart = W.tick - Math.max(0, F.sPend - 1); return; }
    } else if (!F.airdodged && F.bufS > 0) { startAirDodge(F, W); return; }
  }
}

// Ultimate's dodge staling: each dodge raises a penalty P (forward roll, spot and air dodge +0.06 up to 0.3, back roll
// +0.1 up to 0.5); a staled dodge lasts D x (1 + P) (+1 frame) and turns intangible later (up to 3 frames, 4 for
// the rolls); about a second without dodging and they are fresh again
const DODGE_INC = { spot: [0.06, 0.3, 3], froll: [0.06, 0.3, 4], broll: [0.1, 0.5, 4], air: [0.06, 0.3, 3] };
function staleDodge(F, W, kind) {
  if (W.tick - F.dodgeT > DODGE_RESET) F.dodgeP = 0;
  const [inc, cap, late] = DODGE_INC[kind];
  const p = Math.min(F.dodgeP, cap), k = p / cap;
  F.dodgeP = Math.min(cap, Math.max(F.dodgeP, 0) + inc);
  return { p, k, late: Math.round(late * k) };
}
const staled = (n, p) => Math.round(n * (1 + p)) + (p > 0 ? 1 : 0);

// air dodge, in the plane (once per time in the air: landing, a ledge or being hit give it back). Neutral: it keeps
// its momentum; directional: a burst of speed, then nothing to do until its end (its total depends on the direction)
function startAirDodge(F, W) {
  const D = def(F).stats.dodge, st = staleDodge(F, W, 'air');
  const mag = stickMag(F);
  F.bufS = 0; F.airdodged = true; setState(F, 'airdodge'); F.ff = false;
  if (mag > 0.3) {
    const k = 1 - 0.333 * st.k; // fully staled: a third shorter
    F.vx = (F.mx / mag) * 10.5 * k; F.vy = (F.my / mag) * 9 * k + 1;
    const ang = DMath.atan2(F.my, Math.abs(F.mx)) * 180 / Math.PI;
    const dir = ang > 67.5 ? 'up' : ang > 22.5 ? 'dup' : ang > -22.5 ? 'side' : ang > -67.5 ? 'ddown' : 'down';
    F.mv = { dir: 1, s: D.ad.s + st.late, e: D.ad.e, total: D.ad[dir] };
  } else F.mv = { dir: 0, s: D.nad.s + st.late, e: D.nad.e, total: D.nad.total, land: D.nad.land };
  W.emit('airdodge', { s: F.slot });
}

// roll along x (dir -1 / +1), forward (toward where the fighter faces) or back; dir 0 = spot dodge in place. Their
// frames: the archetype's (archetypes.js), staled
function startDodge(F, W, dir) {
  const D = def(F).stats.dodge;
  const back = dir !== 0 && (Math.sin(F.facing) >= 0 ? 1 : -1) !== dir;
  const kind = dir === 0 ? 'spot' : back ? 'broll' : 'froll';
  const st = staleDodge(F, W, kind), b = D[kind];
  const d = { s: b.s + st.late, e: b.e - (kind !== 'spot' && st.k >= 1 ? 1 : 0), total: staled(b.total, st.p), cancel: b.cancel ? staled(b.cancel, st.p) : 0 };
  F.move = null;
  setState(F, 'dodge');
  F.mv = { dx: dir, dz: 0, spot: dir === 0 ? 1 : 0, d, back: back ? 1 : 0 };
  if (dir) F.facing = faceOf(dir); // it rolls facing its way, and ends turned around (see the dodge state)
  W.emit('dodge', { s: F.slot, spot: dir === 0 ? 1 : 0 });
}

function doJump(F, W, S, scale, air = false) {
  F.grounded = false;
  F.ff = false;
  if (air) {
    F.jumps--;
    F.vy = S.airJumpVel;
    F.vx = F.mx * S.airSpeed; F.vz = 0;
    W.emit('jump', { s: F.slot, air: 1 });
  } else {
    F.vy = S.jumpVel * scale;
    W.emit('jump', { s: F.slot, air: 0 });
  }
  F.ky = Math.max(0, F.ky);
  setState(F, 'air');
}

function stepShield(F, I, W, S) {
  F.shield -= SHIELD_DRAIN;
  F.vx *= 0.7; F.vz *= 0.7;
  if (F.shield <= 0) return shieldBreak(F, W);
  if (F.shieldStun > 0) return;
  // out of shield (Ultimate): the up special and the up smash at once, the grab, the jump. X pressed with the shield
  // (its first CHORD frames) stays the down special (the chord)
  const up = stickKind(F) === 'u';
  if (F.bufX > 0 && (up || F.st < CHORD)) { F.bufX = 0; startMove(F, W, up ? 'sp_u' : 'sp_d'); return; }
  if (F.bufA > 0 || F.bufG > 0) { const us = F.bufA > 0 && F.my > 0.7; F.bufA = 0; F.bufG = 0; startMove(F, W, us ? 'usmash' : 'grab'); return; }
  if (F.bufJ > 0) { F.bufJ = 0; setState(F, 'jumpsquat'); return; }
  // a flick of the stick rolls (sideways) or spot dodges (down); a slow tilt only moves the bubble
  if (Math.abs(F.mx) >= 0.8 && Math.abs(F.mx) >= Math.abs(F.my) && W.tick - F.sxLowT <= 4) { startDodge(F, W, Math.sign(F.mx)); return; }
  if (F.my <= -0.8 && W.tick - F.syLowT <= 4) { startDodge(F, W, 0); return; }
  // let go: up at least SHIELD_MIN frames, then SHIELD_DROP frames to put it down
  if (!(F.held & BTN.SHIELD) && F.st >= SHIELD_MIN) { setState(F, 'land'); F.landLag = SHIELD_DROP; }
}

export function shieldBreak(F, W) {
  F.shield = 0; F.shBroke = true; // it comes back at 75 % once the fighter wakes up (the dizzy state)
  setState(F, 'dizzy');
  // Ultimate: the lower the damage, the longer (mashing shortens it). Our estimate: 320 frames at 0 %, 160 at 133 %+
  F.dizzy = Math.round(Math.max(160, 320 - F.damage * 1.2));
  F.grounded = false; F.vy = 17;
  W.emit('shieldBreak', { s: F.slot, x: F.x, y: F.y + 1, z: F.z });
}

// --- moves ---------------------------------------------------------------------------------------------------
function stepMove(F, I, W) {
  const M = moveOf(F);
  if (!M) { endMove(F, W); return; }
  F.af = F.mf;
  // a smash whose A was only tapped becomes its quick version (the tilt): combos when tapped, smashes when held (not
  // one already charged, whose charge starts by frame 5)
  if (M.tilt && F.mf === Math.min(5, M.charge ? M.charge.at : 5) && !(F.held & BTN.A) && !(F.mv && F.mv.charge > 0) && moveOf(F) === M && def(F).moves[M.tilt]) {
    const mf = F.mf;
    startMove(F, W, M.tilt, { keepFacing: true });
    F.mf = mf; F.af = mf;
    return;
  }
  // charge hold
  if (M.charge && F.mf === M.charge.at) {
    const btn = M.charge.btn === 'X' ? BTN.X : BTN.A;
    if ((F.held & btn) && F.mv.charge < M.charge.max) {
      F.mv.charge++;
      F.af = -1; // no hitbox while charging
      if (!M.air && Math.abs(F.mx) > 0.5) F.facing = faceOf(F.mx);
      if (M.onCharge) M.onCharge(F, W);
      if (F.mv.charge % 6 === 1) W.emit('charge', { s: F.slot, c: F.mv.charge / M.charge.max });
      return;
    }
  }
  if (M.onFrame) M.onFrame(F, W, F.mf, I);
  if (F.state !== 'move' || moveOf(F) !== M) return; // the move changed itself
  if (M.vel) {
    for (const v of M.vel) {
      if (F.mf >= v.f[0] && F.mf <= v.f[1]) {
        const fx = DMath.sin(F.facing), fz = DMath.cos(F.facing);
        if (v.fwd !== undefined) { F.vx = fx * v.fwd; F.vz = fz * v.fwd; }
        if (v.up !== undefined) { F.vy = v.up; F.grounded = F.grounded && v.up <= 0; }
      }
    }
  }
  // combo chain
  if (M.next && F.bufA > 0 && F.mf >= M.nextWin[0] - 3) { F.mv.queued = 1; F.bufA = 0; }
  // late chords: X then jump -> up special, X then shield -> down special (first frames only)
  if (F.mf <= 2 && F.move === 'sp_n' || F.mf <= 2 && F.move === 'sp_s') {
    const from = F.move.slice(3);
    if (F.bufJ > 0) { F.bufJ = 0; F.cd[from] = 0; startMove(F, W, 'sp_u'); return; }
    if (F.bufS > 0 && (F.held & BTN.SHIELD) && !(F.cd.d > 0)) { F.bufS = 0; F.cd[from] = 0; startMove(F, W, 'sp_d'); armCooldown(F, 'd'); return; }
  }
  if (F.mf <= 2 && (F.move === 'jab1' || F.move === 'smash') && F.bufJ > 0 && F.grounded) {
    F.bufJ = 0; startMove(F, W, 'usmash'); return;
  }
  F.mf++;
  if (F.mv.queued && M.next && F.mf >= M.nextWin[0]) { startMove(F, W, M.next, { keepFacing: true }); return; }
  if (F.mf >= M.dur) endMove(F, W);
}

// --- grabs ---------------------------------------------------------------------------------------------------
export function startGrab(A, V, W) {
  if (V.grabbing >= 0) releaseGrab(W.fighters[V.grabbing], W);
  A.move = null; setState(A, 'grabbing'); A.grabbing = V.slot; A.grabT = 0;
  A.mv = { pummel: 0 };
  setState(V, 'grabbed'); V.grabbedBy = A.slot; V.move = null;
  V.mv = { escape: 70 + V.damage * 0.55 };
  V.vx = V.vy = V.vz = V.kx = V.ky = V.kz = 0;
  // a short freeze on the catch, like a blow (it reads as a grab, not a slide into place)
  A.hitlag = V.hitlag = 5;
  W.emit('grab', { a: A.slot, v: V.slot, x: V.x, y: V.y + 1.0, z: V.z });
}

export function releaseGrab(A, W, push = true) {
  const V = W.fighters[A.grabbing];
  A.grabbing = -1;
  if (A.state === 'grabbing') setState(A, A.grounded ? 'idle' : 'air');
  if (V && V.grabbedBy === A.slot) {
    V.grabbedBy = -1;
    if (V.state === 'grabbed') setState(V, V.grounded ? 'idle' : 'air');
    if (push) {
      const fx = DMath.sin(A.facing), fz = DMath.cos(A.facing);
      V.kx = fx * 6; V.kz = fz * 6; A.kx = -fx * 4; A.kz = -fz * 4;
      W.emit('grabBreak', { a: A.slot, v: V.slot });
    }
  }
}

function stepGrabbing(F, I, W) {
  const V = W.fighters[F.grabbing];
  F.vx *= 0.6; F.vz *= 0.6;
  if (!V || V.state !== 'grabbed') { F.grabbing = -1; setState(F, 'idle'); return; }
  F.grabT++;
  const fx = DMath.sin(F.facing), fz = DMath.cos(F.facing);
  // held at arm's length (the hands on its chest, src/render/rig/reach.js), not a metre away
  const hold = (F.radius + V.radius) * 0.68 + 0.05;
  V.x = F.x + fx * hold; V.z = F.z + fz * hold;
  V.y = F.y + 0.25; V.facing = F.facing + Math.PI;
  if (F.mv.pummel > 0) F.mv.pummel--;
  const mag = stickMag(F);
  if (F.grabT > 8 && mag > 0.7) {
    // four throws: forward, back (turns around), up, down
    const kind = stickKind(F, 0.6);
    const dir = kind === 'b' ? F.facing + Math.PI : F.facing;
    const id = 'throw';
    V.grabbedBy = -1; F.grabbing = -1;
    startMove(F, W, id, { victim: V.slot, keepFacing: true, dir, kind: kind === 'n' ? 'f' : kind });
    setState(V, 'grabbed'); V.grabbedBy = F.slot; // still held during the throw animation
    return;
  }
  if (F.bufA > 0 && F.mv.pummel === 0) {
    F.bufA = 0; F.mv.pummel = 14;
    W.hitDirect(F, V, def(F).pummel || { dmg: 1.6, fkb: 1, ang: 0, sfx: 'pummel', blood: 1.5, hitlag: 0.6, noLaunch: true });
    F.va[0] = 1;
  }
  if (V.mv.escape <= 0 || F.grabT > 240) releaseGrab(F, W);
}

function stepGrabbed(F, W) {
  const A = W.fighters[F.grabbedBy];
  if (!A || (A.state !== 'grabbing' && A.state !== 'move')) { F.grabbedBy = -1; setState(F, 'air'); F.grounded = false; return; }
  if (F.held && (F.bufA || F.bufX || F.bufJ)) { F.mv.escape -= 5; F.bufA = F.bufX = F.bufJ = 0; }
  if (stickMag(F) > 0.7 && F.prevMag < 0.4) F.mv.escape -= 4;
  F.mv.escape -= 1;
  F.prevMag = stickMag(F);
}

// --- ledges --------------------------------------------------------------------------------------------------
function stepLedge(F, I, W, S) {
  F.vx = F.vy = F.vz = F.kx = F.ky = F.kz = 0;
  F.ledgeT++;
  const inward = -(F.ledgeNx * F.mx);
  const P = I.pressed;
  if (F.ledgeT < 8) return;
  const surf = W.stage.surfaces[F.surf];
  const top = W.stage.heightAt(surf, F.x, F.z);
  const climb = (targetState, dist) => {
    F.x -= F.ledgeNx * dist; F.z -= F.ledgeNz * dist; F.y = top; F.grounded = true;
    setState(F, targetState);
    F.mv = { ledge: 1 }; // the model climbs over the edge (fighterView, poser), it does not get up from the floor
  };
  if (F.bufJ > 0) {
    F.bufJ = 0; F.ledgeCD = 20;
    F.x -= F.ledgeNx * 0.3; F.z -= F.ledgeNz * 0.3; F.y = top - 0.2;
    F.grounded = false; F.vy = S.jumpVel * 1.05; F.vx = -F.ledgeNx * 3; F.vz = -F.ledgeNz * 3;
    setState(F, 'air'); W.emit('jump', { s: F.slot, air: 0 }); return;
  }
  if (F.bufA > 0) {
    F.bufA = 0; climb('idle', 1.0); F.intangible = 14;
    startMove(F, W, 'ledgeattack', { keepFacing: true }); return;
  }
  if (F.bufS > 0) {
    F.bufS = 0; climb('dodge', 0.9); F.mv = { dx: -F.ledgeNx, dz: -F.ledgeNz, ledge: 1, d: { ...def(F).stats.dodge.froll } }; F.intangible = 24; return; // (the roll's frames, its first 24 intangible)
  }
  if (inward > 0.6 || F.my > 0.6 || (F.bufX > 0)) {
    F.bufX = 0; climb('getup', 1.0); F.intangible = 28; return;
  }
  if (inward < -0.6 || F.my < -0.6 || F.ledgeT > 330) {
    setState(F, 'air'); F.grounded = false; F.ledgeCD = 35; F.x += F.ledgeNx * 0.25; F.z += F.ledgeNz * 0.25;
  }
}

function tryLedge(F, W, S) {
  if (F.ledgeCD > 0) return false;
  // during the recovery (up special) the ledge is caught even while rising, and from further away
  const rec = F.state === 'move' && F.move === 'sp_u';
  if (F.vy + F.ky > 0.5 && !rec) return false;
  if (!(F.state === 'air' || F.state === 'helpless' || F.state === 'tumble' || (F.state === 'airdodge' && F.st >= (F.mv.e || 20)) || (F.state === 'move' && (moveOf(F)?.ledgeGrab || F.helplessAfter)))) return false; // (the end of an air dodge catches it too)
  // a little further during a recovery, not much (no pull from afar: the fighter has to get there)
  const L = W.stage.ledgeFor(F, rec ? 0.75 : F.state === 'helpless' ? 0.45 : 0);
  if (!L) return false;
  // one fighter per ledge spot: steal it (Ultimate style)
  for (const o of W.fighters) {
    if (o !== F && o.state === 'ledge' && DMath.hypot(o.x - L.x, o.z - L.z) < 1.2) {
      setState(o, 'air'); o.grounded = false; o.ledgeCD = 40; o.vy = 6; o.x += L.nx * 0.4; o.z += L.nz * 0.4;
      W.emit('ledgeSteal', { s: F.slot, v: o.slot });
    }
  }
  F.move = null;
  setState(F, 'ledge');
  F.surf = L.s.idx;
  F.x = L.x; F.z = PLANE_Z; F.y = L.top - 1.35; F.ff = false;
  F.ledgeNx = L.nx; F.ledgeNz = 0; F.ledgeT = 0;
  F.facing = faceOf(-L.nx);
  F.jumps = S.airJumps; F.airdodged = false; F.adHelpless = false; F.usedUp = false; F.upN = 0; F.airOnce = 0;
  // Ultimate: a long intangibility on the first grab, almost none when regrabbing without having landed
  F.intangible = Math.max(F.intangible, F.ledgeGrabs === 0 ? LEDGE_INTANGIBLE : F.ledgeGrabs === 1 ? 20 : 6);
  F.ledgeGrabs++;
  W.emit('ledge', { s: F.slot });
  return true;
}

// --- movement & physics --------------------------------------------------------------------------------------
function control(F, W, S) {
  const st = F.state;
  const dx = F.mx;
  const mag = Math.abs(dx);
  const spd = F.speedMul * (F.size < 1 ? 1 + (1 - F.size) * 0.5 : 1);
  F.vz = 0;
  if (F.grounded) {
    let tvx = 0, accel = S.groundAccel;
    const fric = F.slip > 0 ? 3 : S.friction;
    if (st === 'idle' || st === 'walk' || st === 'run' || st === 'crouch') {
      // down tapped twice on a thin platform: drop through it (not the swamp lily pads: below them is the swamp)
      const s = W.stage.surfaces[F.surf];
      if (s && s.soft && !s.pad && W.tick - F.dropReq <= 3) {
        F.dropReq = -999;
        F.grounded = false; F.dropT = 14; F.y -= 0.1; F.vy = -2; setState(F, 'air');
        W.emit('drop', { s: F.slot });
        return;
      }
      // double tap: dash (also turns a run around on the spot, the dash dance)
      if (F.dashReq) {
        const d = F.dashReq; F.dashReq = 0;
        const turning = st === 'run' && d !== F.runDir && F.dashT > (S.dashFrames || DASH_LEN);
        setState(F, 'run'); F.runDir = d; F.facing = faceOf(d);
        F.dashT = 0; F.skidT = turning ? SKID_LEN : 0;
        if (!turning) F.vx = d * Math.max(Math.abs(F.vx) * (Math.sign(F.vx) === d ? 1 : 0), S.runSpeed * 0.7 * spd);
        W.emit('dash', { s: F.slot, d, turn: turning ? 1 : 0 });
      }
      // down held: crouch (it stops a run like a brake; the first frames of a dash keep going)
      const down = F.my < -0.6 && -F.my >= Math.abs(F.mx) * 0.95;
      if (down && !(F.state === 'run' && F.dashT <= (S.dashFrames || DASH_LEN))) {
        if (F.state !== 'crouch') { setState(F, 'crouch'); W.emit('crouch', { s: F.slot }); }
        F.vx = approach(F.vx, 0, fric * 1.3 * DT);
        return;
      }
      if (F.state === 'crouch') setState(F, 'idle');
      // bots run as soon as they push hard (they do not double tap)
      if (F.bot && mag > 0.72 && st !== 'run') { setState(F, 'run'); F.runDir = Math.sign(dx); F.dashT = (S.dashFrames || DASH_LEN) + 1; F.skidT = 0; }
      if (F.state === 'run') {
        F.dashT++;
        if (F.skidT > 0) {
          // run turnaround: skids, then runs the other way
          F.skidT--;
          F.vx = approach(F.vx, 0, fric * 1.6 * DT);
          if (F.skidT === 0) F.vx = F.runDir * S.runSpeed * 0.5 * spd;
          return;
        }
        const along = Math.sign(dx) === F.runDir && mag > 0.3;
        if (F.dashT <= (S.dashFrames || DASH_LEN)) {
          tvx = F.runDir * (S.dashSpeed || S.runSpeed * 1.12) * spd; // the initial dash (its archetype's speed and length)
          F.facing = faceOf(F.runDir);
          F.vx = approach(F.vx, tvx, accel * 2.2 * DT);
          return;
        }
        if (along) {
          F.facing = faceOf(F.runDir);
          F.vx = approach(F.vx, F.runDir * S.runSpeed * spd, (F.slip > 0 ? 6 : accel) * DT);
          return;
        }
        if (Math.sign(dx) === -F.runDir && mag > 0.6) {
          F.runDir = -F.runDir; F.facing = faceOf(F.runDir); F.skidT = SKID_LEN; F.dashT = (S.dashFrames || DASH_LEN) + 1;
          W.emit('dash', { s: F.slot, d: F.runDir, turn: 1 });
          return;
        }
        setState(F, mag > 0.15 ? 'walk' : 'idle'); // let go: skids to a stop
        if (mag <= 0.15) W.emit('skid', { s: F.slot });
      }
      if (mag > 0.15) {
        // walking: full tilt (or a key) walks briskly, a light tilt slowly
        const full = Math.max(S.walkSpeed * 1.35, S.runSpeed * 0.52);
        tvx = Math.sign(dx) * full * Math.min(1, mag / 0.8) * spd;
        F.facing = faceOf(dx);
        setState(F, 'walk');
        if (F.slip > 0) accel = 6;
      } else if (st !== 'idle') setState(F, 'idle');
      F.vx = approach(F.vx, tvx, (mag > 0.15 ? accel : fric) * DT);
      return;
    }
    if (st === 'dodge') {
      const t = F.st;
      // about 3.2 m whatever its length: it travels over its total minus its last 6 frames
      const n = Math.max(12, (F.mv.d ? F.mv.d.total : 29) - 6);
      const v = F.mv.spot ? 0 : (t >= 2 && t < n + 2 ? (15 * 23 / n) * (1 - (t - 2) / (n * 27 / 23)) : 0);
      F.vx = F.mv.dx * v;
      return;
    }
    if (st === 'move') {
      const M = moveOf(F);
      const f = (M && M.groundFric) ?? S.friction * 0.75;
      if (!M || !M.vel || !M.vel.some((v) => F.mf >= v.f[0] && F.mf <= v.f[1] && v.fwd !== undefined)) {
        F.vx = approach(F.vx, 0, f * DT);
      }
      return;
    }
    F.vx = approach(F.vx, 0, fric * DT);
    return;
  }
  // air: drift along x, no turning around (only specials can reverse)
  let ctrl = 1;
  if (st === 'hitstun') ctrl = 0.25;
  else if (st === 'airdodge') ctrl = 0.15;
  else if (st === 'helpless') ctrl = 0.6;
  else if (st === 'move') { const M = moveOf(F); ctrl = F.move === 'sp_u' ? 0 : M ? (M.airCtrl ?? 1) : 1; } // the recoveries steer themselves
  else if (st === 'dizzy' || st === 'stunned' || st === 'grabbed') ctrl = 0;
  if (ctrl > 0) {
    const tvx = dx * S.airSpeed * spd;
    const a = S.airAccel * ctrl * DT;
    const over = Math.abs(F.vx) > S.airSpeed * spd && Math.sign(F.vx) === Math.sign(dx);
    if (over) F.vx = approach(F.vx, tvx, a * 0.18); // a running jump keeps its speed for a while
    else if (mag > 0.1) F.vx = approach(F.vx, tvx, a);
    else F.vx = approach(F.vx, 0, a * 0.25);
  }
  // fast fall: down flicked while falling (or at the top of a jump)
  const Mv = st === 'move' ? moveOf(F) : null;
  const canFF = st === 'air' || st === 'tumble' || st === 'helpless' || (Mv && Mv.air);
  // only a quick flick of the stick down (from the centre to down in 3 frames or less; a key always is): held or
  // tilted down it never fast falls. Flicked while still rising, it is kept as long as the stick stays down and
  // fires at the top of the jump. The down of a down air is not one: an aerial started within 2 frames of the
  // flick drops it (and blocks a few frames): flick again to fast fall the aerial, like Melee
  if (F.my > -0.3) F.dnUpT = W.tick;
  if (!F.grounded && F.my < -0.65 && F.prevMy >= -0.65 && W.tick - F.dnUpT <= 3) F.ffArm = W.tick;
  if (F.my > -0.5) F.ffArm = -999;
  if (canFF && !F.ff && F.ffArm > -999 && W.tick - F.ffArm >= 2 && F.vy < 1.0 && W.tick >= F.ffBlock) {
    F.ff = true; F.ffArm = -999; F.vy = Math.min(F.vy, -S.fallSpeed * (S.ffMul || 1.6));
    W.emit('fastfall', { s: F.slot });
  }
  // down pushed in the air (a tap is enough, a diagonal too): the thin platforms let the fighter through for a
  // moment, so a fast fall goes past them (held, it keeps going through: integrate())
  if (!F.grounded && F.vy < 2.5 && F.my < -0.5 && F.prevMy >= -0.5) F.dropT = Math.max(F.dropT, 12);
}

function integrate(F, W, S) {
  const stage = W.stage;
  const M = F.state === 'move' ? moveOf(F) : null;
  // gravity
  if (!F.grounded) {
    let g = GRAVITY * S.gravity;
    if (F.state === 'hitstun') g *= 0.62;
    if (M && M.noGrav && F.mf >= M.noGrav[0] && F.mf <= M.noGrav[1]) g = 0;
    if (F.state === 'airdodge' && F.mv.dir && F.st < F.mv.e) g *= 0.25; // the burst of a directional air dodge
    if (F.levT > 0) { F.levT--; g *= 0.05; if (F.vy < 1.0) F.vy += (1.0 - F.vy) * 0.15; }
    F.vy -= g * DT;
    if (F.state === 'hitstun') F.ff = false;
    const maxFall = S.fallSpeed * (M && M.fallMul ? M.fallMul : 1) * (F.ff ? (S.ffMul || 1.6) : 1);
    if (F.vy < -maxFall) F.vy = -maxFall;
  }
  // launch decay
  const km = DMath.hypot(F.kx, F.ky, F.kz);
  if (km > 0) {
    const decay = F.grounded ? KB_DECAY * 2.2 : KB_DECAY;
    const nm = Math.max(0, km - decay * DT);
    const k = nm / km;
    F.kx *= k; F.ky *= k; F.kz *= k;
  }
  const yPrev = F.y;
  F.vz = 0; F.kz = 0;
  F.x += (F.vx + F.kx) * DT;
  F.z = PLANE_Z;
  F.y += (F.vy + F.ky) * DT;

  if (F.grounded) {
    const s = stage.surfaces[F.surf];
    // like Smash: attacks, shields, rolls and landings stop at the edge (only walking, running and being
    // launched take a fighter off a platform; a move can ask to slide off with slideOff)
    if (s && s.active && !stage.supports(s, F.x, F.z) && STOP_AT_EDGE.has(F.state) && !(M && M.slideOff)) {
      const side = F.x < s.cx ? -1 : 1;
      F.x = s.cx + side * (s.r + 0.15);
      F.vx = 0; if (F.kx * side > 0) F.kx = 0;
    }
    if (!stage.supports(s, F.x, F.z)) {
      F.grounded = false;
      if (['idle', 'walk', 'run', 'crouch', 'land', 'shield', 'dodge', 'getup', 'down', 'tech'].includes(F.state)) setState(F, 'air');
      F.ledgeGrabs = 0;
      W.emit('walkOff', { s: F.slot });
    } else {
      const [cx] = stage.carry(s);
      F.x += cx;
      F.y = stage.heightAt(s, F.x, PLANE_Z);
      if (s.tiltX) F.vx -= s.tiltX * 18 * DT * (F.slip ? 2 : 1);
      if (F.ky > 0.5 || F.vy > 0.5) {
        F.grounded = false; F.y += 0.02;
        if (['idle', 'walk', 'run', 'crouch', 'land'].includes(F.state)) setState(F, 'air');
      }
    }
  } else if (F.vy + F.ky <= 0) {
    // down held in the air falls through the thin platforms (the main ones always hold)
    const s = stage.findLanding(F.x, F.z, yPrev, F.y, F.dropT > 0 || F.my < -0.5);
    if (s) land(F, W, S, s);
  }
  stage.pushOut(F);
  if (!F.grounded && F.state !== 'ledge') tryLedge(F, W, S);
}

function land(F, W, S, s) {
  const impactVy = F.vy + F.ky;
  F.y = stage_h(W, s, F);
  F.grounded = true; F.surf = s.idx; F.ff = false; F.ffArm = -999;
  F.jumps = S.airJumps; F.airdodged = false; F.adHelpless = false; F.ledgeGrabs = 0; F.usedUp = false; F.upN = 0; F.airOnce = 0;
  const M = moveOf(F);
  if (F.state === 'hitstun' || F.state === 'tumble') {
    if (F.bufS > 0 && F.state === 'hitstun') {
      F.bufS = 0; setState(F, 'tech'); F.intangible = 20; F.vy = 0; F.ky = 0; F.kx *= 0.1; F.kz *= 0.1;
      W.emit('tech', { s: F.slot, x: F.x, y: F.y, z: F.z });
      return;
    }
    if (impactVy < -11 && F.state === 'hitstun') {
      // ground bounce
      F.grounded = false; F.ky = 0; F.vy = Math.min(16, -impactVy * 0.45); F.y += 0.05;
      F.kx *= 0.6; F.kz *= 0.6;
      W.emit('bounce', { s: F.slot, x: F.x, y: F.y, z: F.z, v: -impactVy });
      return;
    }
    F.vy = 0; F.ky = 0;
    if (F.launchKb < 45 && F.state === 'hitstun') { setState(F, 'land'); F.landLag = 8; }
    else setState(F, 'down');
    W.emit('land', { s: F.slot, hard: 1, v: -impactVy });
    return;
  }
  F.vy = 0; F.ky = 0;
  if (M) {
    if (M.onLand) { M.onLand(F, W); if (F.state !== 'move' || moveOf(F) !== M) return; }
    if (M.air) { F.move = null; setState(F, 'land'); F.landLag = M.landLag || 8; W.emit('land', { s: F.slot, v: -impactVy }); return; }
    return; // ground/special move keeps running
  }
  if (F.lockLand > 0) { setState(F, 'stunned'); F.stun = F.lockLand; F.lockLand = 0; F.vx = 0; W.emit('stuck', { s: F.slot }); W.emit('land', { s: F.slot, v: -impactVy }); return; }
  if (F.state === 'helpless') { setState(F, 'land'); F.landLag = 18; }
  else if (F.state === 'airdodge') {
    // the landing of an air dodge: neutral 10 frames; directional 19 early, down to 11 near its end (Ultimate)
    const a = F.mv;
    const lag = !a.dir ? (a.land || 10) : F.st <= a.e ? 19 : Math.round(19 - 8 * Math.min(1, (F.st - a.e) / Math.max(1, a.total - a.e)));
    setState(F, 'land'); F.landLag = lag;
  }
  else if (F.state === 'dizzy' || F.state === 'stunned' || F.state === 'grabbed') { /* stays */ }
  else { setState(F, 'land'); F.landLag = impactVy < -14 ? (S.landHard || 4) : 2; } // Ultimate: 2 frames, a hard landing 4 to 6
  W.emit('land', { s: F.slot, v: -impactVy });
}

function stage_h(W, s, F) { return W.stage.heightAt(s, F.x, PLANE_Z); }

// --- launches, KOs, respawn --------------------------------------------------------------------------------------
export function applyLaunch(F, W) {
  const L = F.pendingLaunch;
  F.pendingLaunch = null;
  let [lx, ly] = L.v;
  // DI: the stick held across the launch rotates it up to ~15° (in the x-y plane, like Smash)
  const sm = stickMag(F);
  if (sm > 0.4 && DMath.hypot(lx, ly) > 1) {
    const la = DMath.atan2(ly, lx), sa = DMath.atan2(F.my, F.mx);
    const rot = 0.26 * DMath.sin(wrapAngle(sa - la)) * Math.min(1, sm);
    const h = DMath.hypot(lx, ly), na = la + rot;
    lx = DMath.cos(na) * h; ly = DMath.sin(na) * h;
  }
  F.kx = lx; F.ky = ly; F.kz = 0;
  F.vx = 0; F.vz = 0; F.vy = 0;
  if (ly > 1 || L.kb > 30) { F.grounded = false; F.y += 0.03; }
}

export function knockOut(F, W, kind) {
  F.stocks--;
  F.stats.falls++;
  const killer = (F.lastHitBy >= 0 && W.tick - F.lastHitTick < 60 * 7) ? F.lastHitBy : -1;
  if (killer >= 0 && W.fighters[killer]) W.fighters[killer].stats.kos++;
  else F.stats.sd++;
  if (F.grabbing >= 0) releaseGrab(F, W, false);
  if (F.grabbedBy >= 0) { const A = W.fighters[F.grabbedBy]; if (A) { A.grabbing = -1; if (A.state === 'grabbing') setState(A, 'idle'); } }
  W.emit('ko', { s: F.slot, k: killer, x: F.x, y: F.y, z: F.z, kind, vx: F.kx + F.vx, vy: F.ky + F.vy, vz: F.kz + F.vz, left: F.stocks });
  F.move = null;
  setState(F, 'dead');
  F.respawnT = 75;
  F.kx = F.ky = F.kz = F.vx = F.vy = F.vz = 0;
  if (F.stocks <= 0 && W.rules.mode === 'stock') { F.out = true; F.respawnT = 1e9; }
}

export function respawn(F, W) {
  const p = W.stage.respawnPoint(F.slot);
  F.x = p.x; F.y = p.y; F.z = PLANE_Z;
  F.facing = faceOf(W.stage.main().cx - p.x);
  F.damage = 0; F.shield = SHIELD_MAX; F.size = 1; F.dizzy = 0; F.slip = 0; F.speedMul = 1; F.stun = 0; F.bloodied = 0; F.usedUp = false; F.upN = 0; F.airOnce = 0; F.lockLand = 0; // a clean body for the new stock
  F.sleep = 0; F.dance = 0; F.ctrlBy = -1; F.ctrlT = 0; F.pizzas = 0; F.buried = 0; F.carryBy = -1; F.carryT = 0; F.capOut = 0; F.guitarOut = 0; F.lie = 0; F.levT = 0; F.lifted = 0;
  F.grounded = false; F.invuln = RESPAWN_INVULN;
  F.cd.n = F.cd.s = F.cd.d = F.cd.a = 0;
  setState(F, 'respawn');
  W.emit('respawn', { s: F.slot });
}

// --- statuses (the big pass, 16 Oct 2026) -------------------------------------------------------------------------
// knocked out on its feet for `frames` (stunned: it cannot act; dance: it dances with SKANKY meanwhile)
export function stunFor(V, frames, opts = {}) {
  if (V.out || V.state === 'dead' || V.state === 'respawn' || V.state === 'grabbed') return false;
  V.move = null; setState(V, 'stunned'); V.stun = Math.max(V.stun || 0, frames); V.dance = opts.dance ? 1 : 0; V.lie = opts.lie ? 1 : 0;
  return true;
}
// asleep for `frames` (a dizzy that mashing barely shortens; a hit wakes it up)
export function sleepFor(V, frames) {
  if (V.out || V.state === 'dead' || V.state === 'respawn' || V.state === 'grabbed') return false;
  V.move = null; setState(V, 'dizzy'); V.dizzy = Math.max(V.dizzy || 0, frames); V.sleep = 1;
  return true;
}
// slowed down for `frames` (half speed by default)
export function slowFor(V, frames, k = 0.5) { V.speedMul = Math.min(V.speedMul || 1, k); V.speedT = Math.max(V.speedT || 0, frames); }
