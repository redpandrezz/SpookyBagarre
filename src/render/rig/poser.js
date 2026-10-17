// Target pose of a rigged fighter for the current frame: stance, feet planted with leg IK, a walk/run cycle driven
// by the distance travelled, air and reaction poses, and the move keyframes synced to the simulation frames.
// Returns { pose, key, charge, shake, spin, body } where `body` asks the view for whole-body motion (tumbles,
// lying down, spins) that a skeleton alone cannot do.
import { stance, STATES, ATTACKS, attackPose, merge, D, ROT } from './library.js';
import { pitch, mirrorDir, mix, sample } from './animator.js';
import { moveTimeline } from '../poses.js';
import { hasClip, clipPose, clipLength, CLIPS } from './clips.js';
import { NATIVE_MOVES, NATIVE_POSES, NATIVE_STATES, LEDGE_CLIMB, GRABBED, FALLING, EMOTES, JUMPS, RUNS, RUN_OF, keysAt } from './nativeMoves.js';

const GROUND = new Set(['idle', 'walk', 'run', 'crouch', 'land', 'jumpsquat', 'shield', 'rebound', 'grabbing', 'dizzy', 'stunned', 'getup', 'tech', 'respawn', 'dodge']);
const SPIN_KEYS = new Set(['nair', 'frogleap', 'breach']);

// moves played from the Tripo clips: the clip segment [from, to] (clip frames) is stretched over the move so that
// its strike frame lands on the hitbox; the springs smooth it all
const CLIP_MOVES = {
  jab1: { clip: 'box_01', from: 9, strike: 17, to: 27 },       // left straight
  jab2: { clip: 'box_02', from: 45, strike: 54, to: 64 },      // right straight
  jab3: { clip: 'box_03', from: 11, strike: 20, to: 32 },      // left hook
  ftilt: { clip: 'front_kick_01', from: 18, strike: 30, to: 46 }, // front kick
  smash: { clip: 'chop', from: 38, strike: 61, to: 67 },       // big two-handed blow
  fair: { clip: 'front_kick_01', from: 20, strike: 30, to: 40 },   // flying kick
  uair: { clip: 'volleyball', from: 50, strike: 59, to: 66 },      // volleyball spike, overhead
  throw1: { clip: 'pitch_baseball', from: 38, strike: 55, to: 62 },
  throw2: { clip: 'pitch_baseball', from: 38, strike: 55, to: 62 },
};

function clipMove(CM, F, M, tl, base, hipK, charging) {
  const C = CLIPS[CM.clip];
  // wind-up squeezed before the hitbox, the strike held while it is out (+2 frames), then the follow-through
  const fh = Math.max(1, tl.a - 2), hold = Math.max(fh + 1, tl.b + 2), end = Math.max(hold + 2, M.dur);
  const mf = F.mf;
  let cf;
  if (charging) cf = CM.from + (CM.strike - CM.from) * 0.6;
  else if (mf <= fh) cf = CM.from + (CM.strike - CM.from) * Math.pow(mf / fh, 1.6);
  else if (mf <= hold) cf = CM.strike;
  else cf = CM.strike + (CM.to - CM.strike) * Math.min(1, (mf - hold) / (end - hold));
  // facing right, the character's left side is away from the camera: mirror the clip so the near arm strikes
  const p = clipPose(CM.clip, cf / C.fps, { loop: false, hipK, mirror: Math.sin(F.facing) > 0 });
  const k = Math.min(1, (mf + 1) / 3, (end - mf) / 5);
  return mix(base, p, Math.max(0, k));
}

const sides = (cfg) => (cfg.legs === 3 ? ['L', 'R', 'B'] : ['L', 'R']);

// planted feet (offsets from the rest ankles), knees bent by the hips' drop
function plant(cfg, extra) {
  const ik = {};
  const w = (cfg.wide || 0) * cfg.h;
  for (const s of sides(cfg)) ik[s] = [s === 'L' ? w : s === 'R' ? -w : 0, 0, s === 'B' ? -0.02 * cfg.h : 0.02 * cfg.h, 0];
  return Object.assign(ik, extra || {});
}

// walk / run: each foot follows z = S cos(p), lifted during its forward swing; arms swing opposite
function gait(cfg, p, amt, run, t) {
  const h = cfg.h;
  const S = (run ? 0.34 : 0.2) * h * (cfg.stride || 1);
  const lift = (run ? 0.17 : 0.08) * h;
  const w = (cfg.wide || 0) * h;
  const foot = (ph, x) => {
    const c = Math.cos(ph), s = Math.sin(ph);
    const up = Math.max(0, -s);
    return [x, lift * up * amt, S * c * amt + 0.02 * h, 28 * up * amt];
  };
  const ik = { L: foot(p, w), R: foot(p + Math.PI, -w) };
  if (cfg.legs === 3) ik.B = foot(p + Math.PI * 0.5, 0);
  const A = (run ? 58 : 30) * amt;
  const c = Math.cos(p);
  const g = cfg.guard;
  const base = g === 'claws' || g === 'boxer' ? [0.45, -0.85, 0.25] : [0.38, -0.92, 0.05];
  const fa = run ? [0.2, 0.25, 0.95] : [0.25, -0.55, 0.75];
  const bones = {
    'upperarm.L': { dir: pitch(base, c * A) }, 'forearm.L': { dir: pitch(fa, c * A * 0.6) },
    'upperarm.R': { dir: mirrorDir(pitch(base, -c * A)) }, 'forearm.R': { dir: mirrorDir(pitch(fa, -c * A * 0.6)) },
    spine: ROT((run ? 16 : 6) * amt + (cfg.lean || 0), Math.sin(p) * 8 * amt, 0),
    chest: ROT(0, -Math.sin(p) * 11 * amt, Math.cos(2 * p) * 2 * amt),
    head: ROT(-(run ? 10 : 4) * amt, Math.sin(p) * 5 * amt, 0),
  };
  const bob = (run ? 0.07 : 0.03) * h * amt;
  const hy = run ? -bob * (0.5 - 0.5 * Math.cos(2 * p)) - 0.05 * h * amt : bob * (0.5 + 0.5 * Math.cos(2 * p + Math.PI)) - 0.04 * h * amt;
  return { bones, ik, hips: { pos: [Math.sin(p) * 0.02 * h * amt, hy, 0], scl: [1, 1 + 0.03 * Math.abs(Math.cos(p)) * amt, 1] } };
}

// scale the hips motion written for a ~1.7 m character
function scaleHips(pose, k) {
  if (!pose || !pose.hips || !pose.hips.pos) return pose;
  return { ...pose, hips: { ...pose.hips, pos: [pose.hips.pos[0] * k, pose.hips.pos[1] * k, pose.hips.pos[2] * k] } };
}

function legsUsed(A) {
  const out = {};
  for (const k of ['wind', 'hit', 'follow']) {
    const P = A && A[k];
    if (!P || !P.bones) continue;
    for (const n of Object.keys(P.bones)) {
      const m = /^(thigh|shin)\.(L|R|B)$/.exec(n);
      if (m) out[m[2]] = true;
    }
  }
  return out;
}

export class Poser {
  constructor(cfg, mixer = null) {
    this.cfg = cfg;
    this.mixer = mixer; // packed Tripo characters: their own clips are played natively (see nativeLayers)
    this.dist = 0;     // distance travelled on the ground (drives the gait phase)
    this.walkAmt = 0;  // 0 idle .. 1 moving
    this.runAmt = 0;
    this.prevState = '';
    this.stateT = 0;
    this.jumpKind = null; this.jumpT = 9; this.vy0 = 9; this.standT = 9; // the last jump (JUMPS), the getting up out of a crouch
  }

  build(F, M, t, dt) {
    const cfg = this.cfg, h = cfg.h;
    const st = F.state;
    const was = this.prevState;
    if (st !== this.prevState) { this.prevState = st; this.stateT = 0; this.rolling = false; } else this.stateT += dt;
    // a jump starts: off the ground (out of the crouch before it, or up from a ledge), or an air jump spent
    this.jumpT += dt; this.standT += dt;
    if (st === 'air' && st !== was && (was === 'jumpsquat' || was === 'ledge') && (F.vy || 0) > 0) this.startJump(F, false);
    else if (st === 'air' && F.jumps < (this.lastJumps ?? F.jumps)) this.startJump(F, true);
    this.lastJumps = F.jumps;
    if (was === 'crouch' && st !== 'crouch') this.standT = 0;
    if (st === 'land' && was !== 'land') this.landT = 0;
    this.landT = (this.landT ?? 9) + dt;
    // up again after slipping or being knocked down: a slower blend out of lying down
    if (this.tripped && !(st === 'stunned' && F.lie) && st !== 'down') { this.tripped = false; this.upT = 0; }
    this.upT = (this.upT ?? 9) + dt;
    const grounded = F.grounded && GROUND.has(st) || (st === 'move' && F.grounded);
    const speed = Math.hypot(F.vx || 0, F.vz || 0); // units per second
    const moving = grounded && (st === 'walk' || st === 'run' || (st === 'move' && M && M.pose === 'sprint'));
    this.walkAmt += ((moving ? 1 : 0) - this.walkAmt) * Math.min(1, dt * 10);
    this.runAmt += ((moving && (st === 'run' || speed > 7) ? 1 : 0) - this.runAmt) * Math.min(1, dt * 8);
    if (grounded) this.dist += speed * dt;
    // how much of a long fall this is (0..1): the flailing clip (FALLING) and the lean of the body follow it
    const vy = F.vy || 0;
    this.fallT = !F.grounded && vy < -1 ? (this.fallT || 0) + dt : 0;
    let fk = 0;
    if (!F.grounded) {
      if (st === 'helpless' || (st === 'airdodge' && (F.st || 0) > ((F.mv && F.mv.e) || 20))) fk = 1;
      else if (st === 'tumble') fk = this.stateT > 0.3 ? 1 : 0;
      else if (st === 'air') fk = F.ff ? 1 : Math.max(0, Math.min(1, (-vy - 6) / 7)) * Math.max(0, Math.min(1, (this.fallT - 0.12) / 0.3));
    }
    this.fallK = fk;
    this.fallS = (this.fallS || 0) + (fk - (this.fallS || 0)) * Math.min(1, dt * 8);
    this.fallClipT = (this.fallClipT || 0) + dt * FALLING.rate * (0.8 + 0.6 * Math.max(0, Math.min(1, -vy / 18)));

    // --- base: stance (+ gait) ------------------------------------------------------------------------------
    let base = stance(cfg, t, F);
    const out = { key: null, charge: 0, shake: 0, spin: 0, body: null };
    const hipK = h * 0.5; // the clips' hip motion is relative to the hip height
    if (grounded) {
      base.ik = plant(cfg);
      // the idle clip breathes and shifts the weight under the character's own guard
      if (hasClip('idle')) base = mix(base, clipPose('idle', t + (F.slot || 0) * 3.1, { hipK }), cfg.idleClip ?? 0.55);
      if (this.walkAmt > 0.02) {
        const S = (this.runAmt > 0.5 ? 0.34 : 0.2) * h * (cfg.stride || 1);
        if (hasClip('walk') && hasClip('run')) {
          // walk / run clips, their cycle driven by the distance travelled: each clip plays at its own speed when
          // the character moves at WALK_V / RUN_V metres a second (cartoon strides: faster than the capture)
          const k = h / 1.8 * (cfg.stride || 1);
          const w = clipPose('walk', this.dist / (2.4 * k), { hipK });
          const r = clipPose('run', this.dist / (5.0 * k), { hipK: hipK * 0.5 });
          const g = mix(w, r, this.runAmt);
          base = mix(base, g, Math.min(1, this.walkAmt * 1.3));
          if (this.walkAmt > 0.35) delete base.ik; else base.ik = plant(cfg);
        } else {
          const p = this.dist / (4 * S) * Math.PI * 2;
          const run = this.runAmt > 0.5;
          const g = gait(cfg, p, this.walkAmt, run, t);
          base = mix(base, g, Math.min(1, this.walkAmt * 1.2));
          base.ik = g.ik;
        }
      }
    }

    // --- state poses -----------------------------------------------------------------------------------------
    let statePose = null;
    switch (st) {
      case 'jumpsquat': statePose = STATES.jumpsquat(cfg); break;
      case 'land': statePose = STATES.land(cfg); break;
      case 'crouch': statePose = STATES.crouch(cfg, t); out.fade = 26; break;
      case 'air': {
        // rising to falling as a blend over the apex (no pose switch)
        const up = F.jumps < (cfg.airJumps || 1) && this.stateT < 0.3 ? STATES.airjump(cfg) : STATES.rise(cfg);
        statePose = mix(up, STATES.fall(cfg), Math.max(0, Math.min(1, 0.5 - (F.vy || 0) / 9)));
        break;
      }
      case 'run': if (F.skidT > 0) { statePose = STATES.skid(cfg); out.fade = 30; } break;
      // tumbling: flips out of the launch, then (with the falling clip) rights itself and flails
      case 'tumble': statePose = STATES.tumble(cfg, t); if (!this.mixer || !this.mixer.has(FALLING.clip) || this.stateT < 0.3) out.body = { spinX: t * 9 }; break;
      case 'helpless': statePose = STATES.helpless(cfg, t); break;
      case 'hitstun':
        statePose = STATES.hitstun(cfg, t, F);
        // a real body blow reaction on the light hits (the hard ones send the body spinning)
        if (hasClip('hit_to_body_01') && (F.launchKb || 0) < 90) statePose = mix(statePose, clipPose('hit_to_body_01', 0.1 + this.stateT * 1.6, { loop: false, hipK }), 0.75);
        if (F.launchKb > 90 && !F.grounded) out.body = { spinX: -t * 14 };
        break;
      case 'down': statePose = STATES.down(cfg); out.body = { lie: 1 }; break;
      case 'getup': case 'tech': statePose = STATES.land(cfg); break;
      case 'shield': statePose = STATES.shield(cfg); break;
      case 'rebound': statePose = STATES.hitstun(cfg, t, F); break; // two attacks clanked: the recoil
      case 'dodge': {
        // a roll moves (a spot dodge stays put): curled up, one full forward turn, then back on the feet
        const rolling = Math.abs(F.vx || 0) > 1.5 || ((F.st || 0) < 4 && F.mv && F.mv.dx);
        const RT = (F.mv && F.mv.d && F.mv.d.total) || 31;
        if (rolling || (F.st > 2 && F.st < RT * 0.78 && this.rolling)) {
          this.rolling = true;
          const k = Math.max(0, Math.min(1, ((F.st || 0) - 2) / (RT * 0.62)));
          const e = k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);
          statePose = k < 0.97 ? STATES.roll(cfg) : null; // back on the feet into the guard
          out.body = { spinX: e * Math.PI * 2, pivot: 0.26 };
          out.fade = 40;
        } else { this.rolling = false; statePose = STATES.dodge(cfg); }
        break;
      }
      case 'airdodge': {
        const ae = (F.mv && F.mv.e) || 20;
        if ((F.st || 0) <= ae) { statePose = STATES.dodge(cfg); out.body = { spinY: (F.st || 0) * (Math.PI * 2 / ae) }; } // one turn while intangible
        else statePose = STATES.fall(cfg); // then a long fall (Ultimate: nothing to do until it ends)
        break;
      }
      case 'ledge': statePose = STATES.ledge(cfg, t); break;
      case 'grabbing': statePose = STATES.grabbing(cfg, t); break;
      case 'grabbed': case 'held': statePose = STATES.grabbed(cfg, t); if (F.lifted) out.body = { lie: 1 }; break; // (held up flat over a wrestler's head: OMFU)
      case 'dizzy': case 'stunned':
        // slipped on a puddle: down on the floor until it gets up
        if ((st === 'stunned' && F.lie) || (st === 'dizzy' && F.sleep)) { statePose = STATES.down(cfg); out.body = { lie: 1 }; } // (asleep: lying too)
        else statePose = STATES.dizzy(cfg, t);
        break;
      case 'respawn': statePose = STATES.rise(cfg); break;
      default: break;
    }
    if (statePose) {
      statePose = scaleHips(statePose, 1);
      base = mix(base, statePose, 1);
      if (statePose.bones) for (const s of sides(cfg)) if (statePose.bones['thigh.' + s] && !grounded) { if (base.ik) base.ik[s] = false; }
    }
    if (!grounded || (st === 'dodge' && this.rolling)) delete base.ik; // a roll tucks the legs (no planted feet)
    else if (base.ik && (st === 'jumpsquat' || st === 'land' || st === 'crouch' || st === 'shield' || st === 'getup' || st === 'tech')) base.ik = plant(cfg);

    // --- moves ------------------------------------------------------------------------------------------------
    let pose = base;
    if (st === 'move' && M) {
      const ov = cfg.moves || {};
      const key = ov[F.move] ? F.move : M.pose;
      const A = ov[F.move] || ov[M.pose] || ATTACKS[M.pose];
      out.key = key;
      const CM = !ov[F.move] && !ov[M.pose] && CLIP_MOVES[M.pose];
      if (CM && hasClip(CM.clip)) {
        const tl = moveTimeline(M);
        const charging = M.charge && F.mf === M.charge.at && F.mv && F.mv.charge > 0;
        pose = clipMove(CM, F, M, tl, base, hipK, charging);
        pose = { ...pose, bones: { ...pose.bones } };
        delete pose.ik; // the clip moves the legs too (kicks, steps)
        pose.k = Math.max(pose.k || 1, F.mf <= tl.b + 2 ? 4.5 : 2);
        if (charging) { const c = F.mv.charge / M.charge.max; out.shake = 0.03 + c * 0.06; out.charge = c; }
      } else if (A) {
        const k = h / 1.7;
        const over = (P) => (P ? mix(base, scaleHips(P, k), 1) : null);
        const A2 = { wind: over(A.wind), hit: over(A.hit), follow: over(A.follow) };
        const tl = moveTimeline(M);
        // the strike pose is the target one frame before the hitbox comes out, so the (stiff) springs land it on time
        const fw = Math.max(1, tl.a - 2), fh = Math.max(fw + 0.5, tl.a - 1);
        const keys = [
          { f: 0, pose: base },
          { f: fw, pose: A2.wind || base, e: 'out' },
          { f: fh, pose: A2.hit || A2.wind || base, e: 'snap' },
          { f: tl.b + 2, pose: A2.follow || A2.hit || A2.wind || base, e: 'inout' },
          { f: Math.max(tl.b + 4, tl.dur), pose: base, e: 'inout' },
        ];
        const charging = M.charge && F.mf === M.charge.at && F.mv && F.mv.charge > 0;
        pose = charging ? (A2.wind || base) : (sample(keys, F.mf) || base);
        pose = { ...pose, bones: { ...pose.bones } };
        // a move that kicks takes that leg off the IK
        if (pose.ik) {
          const used = legsUsed(A);
          pose.ik = { ...pose.ik };
          for (const s of Object.keys(used)) pose.ik[s] = false;
        }
        if (SPIN_KEYS.has(M.pose) && F.mf >= tl.a && F.mf <= tl.b + 4) out.spin = (F.mf - tl.a) * 0.9;
        // the coup de fesse: half a turn to present the backside, then back
        if (A.turn) {
          const fw = Math.max(1, tl.a - 2), back = tl.b + 5;
          const u = F.mf <= fw ? F.mf / fw : F.mf <= tl.b + 1 ? 1 : Math.max(0, 1 - (F.mf - tl.b - 1) / Math.max(1, back - tl.b - 1));
          out.body = { spinY: Math.PI * (u * u * (3 - 2 * u)) };
        }
        if (A.grate && F.mf >= tl.a) out.grate = 1;
        if (A.propSpin) out.propSpin = F.va ? F.va[1] || 0 : 0;
        if (F.mf >= fw && F.mf <= tl.b + 1) pose.k = Math.max(pose.k || 1, 3);
        if (charging) {
          const c = F.mv.charge / M.charge.max;
          out.shake = 0.03 + c * 0.06;
          out.charge = c;
        }
      }
      if (M.pose === 'sprint' && F.grounded) {
        const S = 0.34 * h;
        const g = gait(cfg, this.dist / (4 * S) * Math.PI * 2, 1, true, t);
        pose = mix(pose, { bones: { ...g.bones, spine: ROT(35, 0, 0) }, hips: g.hips }, 1);
        pose.ik = g.ik;
      }
    }
    if (cfg.extra) pose = cfg.extra(pose, F, M, t, out) || pose;
    out.pose = pose;
    if (this.mixer) {
      out.layers = this.nativeLayers(F, M, t, grounded, st);
      // falling for real: the body leans into the drop and sways in the wind (not a tumble: it rights itself)
      const fs = this.fallS;
      if (fs > 0.02 && !out.body && st !== 'tumble' && st !== 'move' && this.mixer.has(FALLING.clip)) {
        out.body = { spinX: fs * (0.22 + Math.sin(t * 6.5) * 0.05), spinY: fs * Math.sin(t * 4.3) * 0.1 };
      }
      // and the limbs flail on top of the clip: arms windmilling a little, legs pedalling in turn (knees lagging
      // behind the thighs), the head jolted; wider the faster the drop, each fighter out of step with the others
      if (fs > 0.02 && st !== 'move' && this.mixer.has(FALLING.clip)) {
        const a = fs * (0.7 + 0.5 * Math.max(0, Math.min(1, -vy / 20))), u = t + (F.slot || 0) * 1.7, wg = this.wig || (this.wig = {});
        for (const [s, sg, ph] of [['L', 1, 0], ['R', -1, Math.PI]]) {
          wg['upperarm.' + s] = [a * Math.sin(u * 10.5 + ph) * 0.32, 0, sg * a * Math.sin(u * 7.3 + ph * 0.6) * 0.26];
          wg['forearm.' + s] = [a * Math.sin(u * 12.7 + ph + 0.9) * 0.4, 0, 0];
          wg['hand.' + s] = [0, 0, sg * a * Math.sin(u * 15 + ph) * 0.3];
          wg['thigh.' + s] = [a * Math.sin(u * 8.6 + ph) * 0.34, 0, sg * a * Math.sin(u * 5.9 + ph) * 0.1];
          wg['shin.' + s] = [a * Math.sin(u * 8.6 + ph - 1.1) * 0.42, 0, 0];
        }
        wg.head = [a * Math.sin(u * 5.2) * 0.1, a * Math.sin(u * 3.7) * 0.14, 0];
        out.wiggle = wg;
      }
      // a character with its own pool of clips: when its clip plays a move or a whole-body state, the procedural
      // spins and lying down are not added on top (the clip already turns the body)
      if (this.ownBody) { out.body = null; out.spin = 0; }
      // face: [in, full, hold until, out] (move frames): the body turns to face the camera for that move (a side
      // split, a pose for the screen), as in Smash
      const NM = st === 'move' && M && (NATIVE_MOVES[F.char] || {})[F.move];
      if (NM && NM.face) {
        const [a, b, c, d] = NM.face, f = F.mf;
        const u = f < a ? 0 : f < b ? (f - a) / (b - a) : f <= c ? 1 : f < d ? 1 - (f - c) / (d - c) : 0;
        out.body = { ...(out.body || {}), spinY: -(Math.sin(F.facing) < 0 ? -1 : 1) * 1.23 * u * u * (3 - 2 * u) };
      }
      // turn: [[frame, radians], ...] the body turned about itself (PI: its back to the facing; it turns through the
      // camera side), a kick behind then in front
      if (NM && NM.turn) out.body = { ...(out.body || {}), spinY: -(Math.sin(F.facing) < 0 ? -1 : 1) * keysAt(NM.turn, F.mf) };
      out.hip = NM && NM.hip;
      // the jumps, flips and crouch (jumpLayers): their own hip rule, and quick blends (a flip is short)
      if (this.jumpHip) { out.hip = this.jumpHip; out.fade = this.jumpFade; } else if (this.upT < 0.5) out.fade = 7; // (getting up after a slip)
    }
    if (st === 'move' && !out.fade) out.fade = 24; // attacks blend in fast (crisp starts)
    return out;
  }

  // the kind of jump that starts (JUMPS): backward a back flip; forward a front flip off the ground, a twisting one in
  // the air; straight up the plain jump off the ground, a front flip in the air
  startJump(F, air) {
    // (off the ground the speed is not there yet at takeoff: the stick held tells the way too)
    const rel = ((F.vx || 0) + (F.mx || 0) * 3) * (Math.sin(F.facing) < 0 ? -1 : 1);
    this.jumpKind = rel < -0.8 ? 'back' : rel > 1.2 ? (air ? 'twist' : 'flip') : (air ? 'flip' : null);
    this.jumpT = 0;
    this.vy0 = Math.max(4, F.vy || 0);
  }

  // the jumps, flips, landings and crouching out of the Mixamo clips (JUMPS); null when they do not apply
  jumpLayers(F, st, grounded) {
    const X = this.mixer, J = JUMPS;
    const has = (c) => c && X.has(c.clip);
    if (st === 'air' && has(J.jump)) {
      const L = [];
      // the flight: the clip's takeoff -> top -> touch along the vertical speed (up from the takeoff speed to 0, then
      // down to as fast again: the legs reach for the floor)
      const vy0 = this.vy0 || 9, vy = F.vy || 0, [a, b, c] = J.jump.air;
      const u = vy >= 0 ? 0.5 * (1 - Math.min(1, vy / vy0)) : 0.5 + 0.5 * Math.min(1, -vy / vy0);
      const tj = u < 0.5 ? a + (b - a) * u * 2 : b + (c - b) * (u - 0.5) * 2;
      // a flip over it from the takeoff, played through once, then let go into the flight
      const fl = this.jumpKind && J[this.jumpKind];
      let wf = 0;
      if (has(fl)) {
        const k = this.jumpT / fl.time;
        if (k < 1.2) { wf = k < 1 ? 1 : 1 - (k - 1) / 0.2; L.push({ name: fl.clip, t: fl.from + (fl.to - fl.from) * Math.min(1, k), w: wf }); }
      }
      if (wf < 1) L.push({ name: J.jump.clip, t: tj, w: 1 - wf });
      this.jumpHip = 'none'; this.jumpFade = 30;
      return L;
    }
    if (st === 'jumpsquat' && has(J.jump)) {
      const [a, b] = J.jump.squat;
      this.jumpHip = 'y'; this.jumpFade = 40;
      return [{ name: J.jump.clip, t: a + (b - a) * Math.min(1, this.stateT / 0.07), w: 1 }];
    }
    if (st === 'stunned' && F.lie && has(J.trip)) {
      // slipped: the clip falls and lies down by itself (no procedural lying down on top)
      const C = J.trip;
      this.tripped = true; this.ownBody = true;
      this.jumpHip = 'y'; this.jumpFade = 20;
      return [{ name: C.clip, t: C.from + (C.to - C.from) * Math.min(1, this.stateT / C.time), w: 1 }];
    }
    if (st === 'down' && has(J.down)) {
      // knocked down: on its back (the clip lies down by itself)
      const C = J.down;
      this.tripped = true; this.ownBody = true;
      this.jumpHip = 'y'; this.jumpFade = 30;
      return [{ name: C.clip, t: C.from + (C.to - C.from) * Math.min(1, this.stateT / C.time), w: 1 }];
    }
    if (st === 'stunned' && (F.levT || 0) > 0 && has(J.float)) {
      // levitating: it floats where the sim holds it (no height of the clip's own)
      this.jumpHip = 'none'; this.jumpFade = 20;
      return [{ name: J.float.clip, t: this.stateT * J.float.rate, loop: true, w: 1 }];
    }
    if (((st === 'dizzy' && !F.sleep) || (st === 'stunned' && !F.lie && !F.dance)) && has(J.dizzy)) {
      this.jumpHip = 'y'; this.jumpFade = 20;
      return [{ name: J.dizzy.clip, t: this.stateT * J.dizzy.rate + (F.slot || 0) * 0.7, loop: true, w: 1 }];
    }
    if (st === 'ledge' && has(J.hang)) {
      // caught the edge: the hands on it from the first frame (the clip from where its hands reach the ledge)
      const C = J.hang;
      this.jumpHip = 'none'; this.jumpFade = 30;
      return [{ name: C.clip, t: C.from + (C.to - C.from) * Math.min(1, this.stateT / C.time), w: 1 }];
    }
    if (st === 'dodge' && has(J.roll) && (Math.abs(F.vx || 0) > 1.5 || ((F.st || 0) < 4 && F.mv && F.mv.dx) || this.rolling)) {
      // the roll: the clip's dive and getting up along the roll's frames (the clip turns the body itself)
      const C = J.roll, RT = (F.mv && F.mv.d && F.mv.d.total) || 31;
      this.ownBody = true; this.jumpHip = 'y'; this.jumpFade = 40;
      return [{ name: C.clip, t: C.from + (C.to - C.from) * Math.min(1, (F.st || 0) / RT), w: 1 }];
    }
    if (st === 'crouch' && has(J.crouch)) {
      const C = J.crouch;
      this.jumpHip = 'y'; this.jumpFade = 30;
      return [{ name: C.clip, t: C.from + (C.to - C.from) * Math.min(1, this.stateT / C.time), w: 1 }];
    }
    if (this.landT < J.land.time && (st === 'land' || st === 'idle') && has(J.land)) {
      const C = J.land;
      this.jumpHip = 'y'; this.jumpFade = 30;
      return [{ name: C.clip, t: C.from + (C.to - C.from) * Math.min(1, this.landT / C.time), w: 1 }];
    }
    if (grounded && this.standT < J.stand.time && (st === 'idle' || st === 'walk' || st === 'run') && has(J.stand)) {
      const C = J.stand;
      this.jumpHip = 'y'; this.jumpFade = 30;
      return [{ name: C.clip, t: C.from + (C.to - C.from) * Math.min(1, this.standT / C.time), w: 1 }];
    }
    return null;
  }

  // which of the character's own clips play now (exactly as animated), with their weights; [] = procedural pose
  nativeLayers(F, M, t, grounded, st) {
    const X = this.mixer, h = this.cfg.h;
    const L = [];
    this.jumpHip = null;
    const own = NATIVE_STATES[F.char];
    this.ownBody = false;
    // an emote (character select, victory): the whole clip, as animated
    if (F.emote && X.has(F.emote)) { L.push({ name: F.emote, t: F.emoteT || 0, w: 1 }); return L; }
    if (st === 'move' && M) {
      const ov = this.cfg.moves || {};
      // the character's own signature clip (Uthana) first, then the shared Tripo strikes
      let CM = (NATIVE_MOVES[F.char] || {})[F.move] || NATIVE_POSES[M.pose];
      if (CM && CM.byKind && F.mv && CM.byKind[F.mv.kind]) CM = CM.byKind[F.mv.kind]; // a throw's clip by its direction (Kerrian: the suplex back)
      let sec = true;
      if (!CM || !X.has(CM.clip)) {
        CM = !ov[F.move] && !ov[M.pose] && CLIP_MOVES[M.pose];
        sec = false;
      }
      if (CM && own && X.has(CM.clip)) this.ownBody = true;
      if (CM) {
        const tl = moveTimeline(M);
        const charging = M.charge && F.mf === M.charge.at && F.mv && F.mv.charge > 0;
        const fh = Math.max(1, tl.a - 2), hold = Math.max(fh + 1, tl.b + 2);
        const end = CM.keys ? M.dur : Math.max(hold + 2, M.dur);
        const mf = F.mf;
        let cf;
        if (CM.cycle) {
          // a looping move (a rapid jab: the sim sends mf back to cycle[0] at cycle[1] while A is mashed): the clip
          // played on over the loops, back and forth between from and to (no jump from its end to its start)
          const [L0, L1] = CM.cycle;
          const tt = mf < L0 ? mf : ((F.mv && (F.mv.loops ?? F.mv.n)) || 0) * (L1 - L0) + mf; // (a held move counts in mv.n)
          const span = Math.max(1, (CM.to - CM.from) * 60 / (CM.rate || 1));
          const u = (tt % (2 * span)) / span;
          cf = CM.from + (CM.to - CM.from) * (u <= 1 ? u : 2 - u);
        } else if (CM.keys) cf = keysAt(CM.keys, mf);
        else if (charging) cf = CM.from + (CM.strike - CM.from) * 0.6;
        else if (mf <= fh) cf = CM.from + (CM.strike - CM.from) * Math.pow(mf / fh, 1.6);
        else if (mf <= hold) cf = CM.strike;
        else cf = CM.strike + (CM.to - CM.strike) * Math.min(1, (mf - hold) / (end - hold));
        // the arm on the camera side throws it: mirrored clip when facing right
        const name = Math.sin(F.facing) > 0 && X.has(CM.clip + '__m') ? CM.clip + '__m' : CM.clip;
        const k = Math.max(0, Math.min(1, (mf + 1) / 2, (end - mf) / 4));
        L.push({ name, t: sec ? cf : cf / 30, w: k });
      }
      return L;
    }
    // caught in SKANKY's funk: it dances (its own victory dance, else a shared one), whatever it is
    if (st === 'stunned' && F.dance) {
      const em = EMOTES[F.char];
      for (const c of [em && em.win && em.win.emote, 'dance_02', 'dance_01', 'm_funk']) {
        if (c && X.has(c)) { this.ownBody = true; L.push({ name: c, t: this.stateT, loop: true, w: 1 }); return L; }
      }
    }
    // a long fall: the flailing clip (FALLING), more and more of it as the drop goes on, over the jump's own clips
    // (JUMPS: the flight, a flip) or the character's own rise / fall, or the procedural pose
    const fk = this.fallK;
    const falling = fk > 0.01 && X.has(FALLING.clip) && (st === 'air' || st === 'helpless' || st === 'tumble' || st === 'airdodge');
    // jumps, flips, landings, crouching: the Mixamo clips, for everyone who has them
    const JL = this.jumpLayers(F, st, grounded);
    if (JL && !falling) return JL;
    if (falling) {
      if (JL && fk < 1) for (const l of JL) L.push({ ...l, w: l.w * (1 - fk) });
      else if (st === 'air' && own && own.rise && own.fall && X.has(own.rise.clip) && X.has(own.fall.clip) && fk < 1) {
        const R = own.rise, Fa = own.fall, k = Math.max(0, Math.min(1, 0.5 + (F.vy || 0) / 9));
        L.push({ name: R.clip, t: this.stateT * (R.rate || 1), loop: true, w: k * (1 - fk) });
        L.push({ name: Fa.clip, t: this.stateT * (Fa.rate || 1), loop: true, w: (1 - k) * (1 - fk) });
      }
      L.push({ name: FALLING.clip, t: this.fallClipT, loop: true, w: fk });
      return L;
    }
    // the states the character plays from its own clips (NATIVE_STATES)
    if (own) {
      let key = st;
      if (st === 'air') key = 'air';
      else if (st === 'getup' && F.mv && F.mv.ledge) key = own.ledgeclimb && X.has(own.ledgeclimb.clip) ? 'ledgeclimb' : 'jumpsquat'; // climbing over the edge, not up from the floor
      else if (st === 'dodge') key = Math.abs(F.vx || 0) > 1.5 || ((F.st || 0) < 4 && F.mv && F.mv.dx) || this.rolling ? 'roll' : 'dodge';
      if (key === 'air') {
        const R = own.rise, Fa = own.fall;
        if (R && Fa && X.has(R.clip) && X.has(Fa.clip)) {
          const k = Math.max(0, Math.min(1, 0.5 + (F.vy || 0) / 9));
          L.push({ name: R.clip, t: this.stateT * (R.rate || 1), loop: true, w: k });
          L.push({ name: Fa.clip, t: this.stateT * (Fa.rate || 1), loop: true, w: 1 - k });
          return L;
        }
      }
      const d = own[key];
      if (d && X.has(d.clip)) {
        if (d.body === false) this.ownBody = true;
        L.push({ name: d.clip, t: (d.from || 0) + this.stateT * (d.rate || 1), loop: !!d.loop, w: 1 });
        return L;
      }
    }
    // the climb over a ledge (the shared clip, for those without their own)
    if ((st === 'grabbed' || st === 'held') && X.has(GRABBED.clip)) {
      L.push({ name: GRABBED.clip, t: this.stateT * GRABBED.rate, loop: true, w: 1 });
      return L;
    }
    if (st === 'getup' && F.mv && F.mv.ledge && X.has(LEDGE_CLIMB.clip)) {
      L.push({ name: LEDGE_CLIMB.clip, t: this.stateT * LEDGE_CLIMB.rate, w: 1 });
      return L;
    }
    if (st === 'hitstun' && (F.launchKb || 0) < 90) {
      const pick = ['hit_to_body_01', 'hit_to_head', 'hit_to_side', 'hit_to_stomach'][(F.lastHitTick || 0) % 4];
      if (X.has(pick)) L.push({ name: pick, t: 0.05 + this.stateT * 1.4, w: 1 });
      return L;
    }
    if (grounded && (st === 'idle' || st === 'walk' || (st === 'run' && !(F.skidT > 0)))) {
      const k = h / 1.8 * (this.cfg.stride || 1);
      const wa = Math.min(1, this.walkAmt * 1.3);
      L.push({ name: 'idle', t: t + (F.slot || 0) * 3.1, loop: true, w: 1 - wa });
      if (wa > 0) {
        L.push({ name: 'walk', t: this.dist / (2.4 * k), loop: true, w: wa * (1 - this.runAmt) });
        // its own run (RUN_OF), at the pace of the distance run, else the model's run clip
        const RS = RUNS[RUN_OF[F.char]], own = RS && X.has(RS.clip);
        L.push({ name: own ? RS.clip : 'run', t: this.dist / ((own ? RS.speed : 5.0) * k), loop: true, w: wa * this.runAmt });
      }
    }
    return L;
  }
}

export { D, ROT, merge };
