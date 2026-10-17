// Ultimes, comme les Final Smash de Smash Ultimate : une jauge qui se remplit en donnant et en recevant des coups ;
// pleine, A + X ensemble la déclenche. Le match se fige (comme un mini-jeu), la scène s'affiche (src/render/ultimate.js),
// puis le coup part : ceux qui sont dans sa zone sont attrapés et subissent la frappe cinématique ; les autres, rien.
// Tout est dans la simulation (déterministe, rollback) : l'état est `W.ult` (dans WORLD_KEYS) et `F.ult` (la jauge).
// Chaque perso décrit son ultime dans sa fiche (`ult: {...}`, voir anbuu.js) : nom, couleurs, zone, coups, derniers coups.
import { ULT_MAX } from './constants.js';
import { CHARS } from './chars/index.js';
import { startMove, setState, releaseGrab, stunFor } from './fighter.js';
import { DMath } from './dmath.js';
import { faceOf } from './util.js';
import { BTN } from '../core/input.js';

export { ULT_MAX };

// Réglages de la jauge (à la Smash Ultimate : donner ET recevoir la remplit, la jauge se vide au KO et à l'usage).
// Plus lente qu'avant (16 oct. 2026) et qui avantage celui qui encaisse, comme Smash Ultimate : un % reçu charge 1,8 fois plus qu'un % infligé.
// Jauge pleine : ~360 % infligés ou ~200 % reçus (un échange à parts égales de 150 % chacun : 42 + 75 = 117).
export const ULT_TUNE = { dealt: 0.28, taken: 0.5, perHit: 14 };

// La parade de l'ultime (17 oct. 2026) : pendant la fin de l'entrée en scène, celui qui est dans la zone peut lever son bouclier.
// Fenêtre = les `win` dernières images avant le tir (comme la garde parfaite), `gap` images minimum entre deux appuis (le bouclier
// met ce temps à se relever : marteler la touche ne marche pas), `cue` = quand l'anneau de rappel apparaît, `verdict` = la pause
// où l'on voit qui a paré et qui a raté AVANT que le coup parte. Deux niveaux (17 oct. 2026) : une parade dans la fenêtre ANNULE l'ultime
// (rien pour personne, la jauge du lanceur est perdue, et il reste étourdi `stun` images : il se fait punir) ; une parade PARFAITE (les
// `perfect` dernières images seulement, ~50 ms) le RENVOIE sur celui qui l'a lancé.
export const ULT_PARRY = { win: 9, perfect: 3, gap: 18, cue: 30, verdict: 30, stun: 80 };

const def = (F) => CHARS[F.char];
export const ultDef = (F) => (F && CHARS[F.char] ? CHARS[F.char].ult || null : null);
// la fiche de l'ultime en cours : celle du perso qui l'a lancé (u.cid), même quand une parade l'a renvoyé et que c'est un autre qui tire
export const ultDefOf = (u, F) => (u && u.cid && CHARS[u.cid] && CHARS[u.cid].ult) || ultDef(F);
const sideOf = (F) => (DMath.sin(F.facing) < 0 ? -1 : 1);

// la jauge d'un combattant en %, pour l'affichage (0 si son perso n'a pas d'ultime)
export const ultFrac = (F) => (ultDef(F) ? Math.min(1, F.ult / ULT_MAX) : 0);

// un coup (dégâts réels) : celui qui frappe et celui qui est frappé chargent leur jauge
export function ultCharge(W, A, V, dmg) {
  if (W.rules.ult === false || W.ult || W.phase !== 'play' || !(dmg > 0)) return;
  const rate = W.rules.ultRate ?? 1;
  const give = (F, k) => {
    if (!F || F.out || !ultDef(F) || F.ult >= ULT_MAX) return;
    const was = F.ult;
    F.ult = Math.min(ULT_MAX, F.ult + Math.min(ULT_TUNE.perHit, dmg) * k * rate);
    if (was < ULT_MAX && F.ult >= ULT_MAX) W.emit('ultReady', { s: F.slot, x: F.x, y: F.y, z: F.z });
  };
  if (A && A !== V) give(A, ULT_TUNE.dealt);
  give(V, ULT_TUNE.taken);
}

export function canStartUlt(F, W) {
  return W.rules.ult !== false && !W.ult && W.phase === 'play' && !F.out && !!ultDef(F) && F.ult >= ULT_MAX;
}

export function startUltimate(F, W) {
  if (!canStartUlt(F, W)) return false;
  const U = ultDef(F);
  // personne dans la zone = ultime raté : pas de cutscene, rien ne part, la jauge reste pleine
  const dir0 = sideOf(F), thr0 = threats(W, F, U, dir0);
  if (!thr0.length) return false;
  F.bufA = 0; F.bufX = 0; F.bufJ = 0; F.bufS = 0; F.bufG = 0;
  if (F.grabbing >= 0) releaseGrab(F, W);
  F.ult = 0;
  startMove(F, W, U.moves[0], { keepFacing: true });
  F.vx = F.vy = F.vz = F.kx = F.ky = F.kz = 0;
  const dir = dir0;
  W.ult = { slot: F.slot, t: 0, ph: 0, c: 0, dir, victims: [], x: F.x, y: F.y, cid: F.char, orig: F.slot, rf: 0, par: -1, vt: 0, thr: thr0 };
  W.emit('ultStart', { s: F.slot, x: F.x, y: F.y, z: F.z, dir });
  return true;
}

// qui est dans la zone devant le lanceur
function inReach(F, V, U, dir) {
  if (V === F || V.out || V.state === 'dead' || V.state === 'respawn') return false;
  // comme dans Smash Ultimate : rien ne se verrouille tout seul. Le rayon part tout droit devant le lanceur, à hauteur de poitrine ;
  // il faut que l'adversaire soit dans cette bande (U.aim : écart de hauteur des pieds, en m) et devant, pas derrière ni sur une autre plateforme
  const dy = V.y - F.y;
  return (V.x - F.x) * dir > -0.4 && Math.abs(V.x - F.x) <= U.reach && dy >= U.aim[0] && dy <= U.aim[1];
}

// ceux qui sont dans la zone au départ (le monde est figé pendant l'entrée en scène : personne ne bouge, la liste ne change pas) :
// ce sont eux qui peuvent parer. `bt` = l'image où un CPU lève son bouclier (-1 : il ne tente rien), tiré sans toucher au hasard du match.
function threats(W, F, U, dir) {
  const out = [];
  for (const V of W.list) {
    if (W.rules.teams && V.team === F.team) continue;
    if (!inReach(F, V, U, dir)) continue;
    out.push(threatOf(W, V, U));
  }
  return out;
}
// la fiche de parade de quelqu'un menacé ; `bt` = l'image où un CPU lève son bouclier (-1 : il ne tente rien)
function threatOf(W, V, U) {
  let bt = -1;
  if (V.bot) {
    const lvl = V.bot || 2, h = mix(W.seed | 0, V.slot + 1, W.tick | 0), L = Math.min(2, lvl - 1);
    const attempt = [0.1, 0.3, 0.6][L];
    if ((h % 1000) / 1000 < attempt) {
      const jit = [9, 6, 0][L], r = (h >>> 10) % (2 * jit + 1) - jit;
      bt = U.intro - Math.floor(ULT_PARRY.win / 2) + r;
      if (((h >>> 20) % 1000) / 1000 < [0, 0.06, 0.25][L]) bt = U.intro - 1; // (parfois pile dans la fenêtre parfaite : de quoi renvoyer)
    }
  }
  return { s: V.slot, last: -999, tried: 0, ok: 0, perf: 0, bad: 0, at: -1, bt };
}
const mix = (a, b, c) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ c; h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); return (h ^ (h >>> 15)) >>> 0; };

const NO_GUARD = new Set(['hitstun', 'stunned', 'dizzy', 'grabbed', 'grabbing', 'down', 'getup', 'tech', 'ledge', 'dead', 'respawn', 'helpless', 'tumble']);
// un appui sur le bouclier pendant l'entrée en scène : bon (dans la fenêtre) ou trop tôt. Il faut `gap` images de calme avant : marteler ne vaut rien
function guardPress(W, u, e, t, U) {
  const V = W.fighters[e.s], quiet = t - e.last >= ULT_PARRY.gap;
  e.last = t;
  if (!V || V.out || V.hitstun > 0 || NO_GUARD.has(V.state)) return; // (celui qui est assommé, attrapé, à terre ou mort ne lève rien)
  if (V.state !== 'shield') {
    if (V.grabbing >= 0) releaseGrab(V, W);
    V.move = null; V.mf = 0; V.mv = {}; V.va[0] = 0; // (un coup en cours est coupé : on a levé la garde)
    setState(V, 'shield'); V.shieldStart = W.tick;
  }
  e.tried++;
  const inWin = t > U.intro - ULT_PARRY.win && t <= U.intro;
  if (quiet && inWin && !e.ok) { e.ok = 1; e.at = t; e.perf = t > U.intro - ULT_PARRY.perfect ? 1 : 0; W.emit('ultGuard', { s: e.s, ok: 1, perf: e.perf, x: V.x, y: V.y, z: V.z }); }
  else { e.bad = quiet ? 1 : 2; W.emit('ultGuard', { s: e.s, ok: 0, early: quiet ? 1 : 0, x: V.x, y: V.y, z: V.z }); }
}

// celui qui est attrapé par le rayon : il quitte ce qu'il faisait et reste suspendu dans la lumière
function catchVictim(W, V) {
  if (V.grabbing >= 0) releaseGrab(V, W);
  if (V.grabbedBy >= 0) { const G = W.fighters[V.grabbedBy]; if (G && G.grabbing === V.slot) { G.grabbing = -1; if (G.state === 'grabbing') setState(G, 'idle'); } V.grabbedBy = -1; }
  V.move = null; V.pendingLaunch = null; V.carryT = 0; V.carryBy = -1; V.va[0] = 0; V.mv = {};
  setState(V, 'hitstun'); V.hitstun = 999; V.launchKb = 0; V.shieldStun = 0;
}

// le coup part : la zone devant, ceux qui y sont sont attrapés dans la lumière
function beginStrike(W, u, F, U) {
  const dir = u.dir, Um = ultDef(F);
  u.ph = 1; F.move = Um.moves[1]; F.mf = 0;
  if (u.rf) { // renvoyé : seul celui qui l'a lancé le reçoit, ramené devant celui qui a paré
    const O = W.fighters[u.tgt != null ? u.tgt : u.orig];
    if (O && !O.out && O.state !== 'dead' && O.state !== 'respawn') { catchVictim(W, O); u.victims.push(O.slot); }
  } else {
    for (const V of W.list) {
      if (W.rules.teams && V.team === F.team) continue;
      if (!inReach(F, V, U, dir)) continue;
      catchVictim(W, V);
      u.victims.push(V.slot);
    }
  }
  W.emit('ultStrike', { s: F.slot, x: F.x, y: F.y, z: F.z, dir, n: u.victims.length, reach: U.reach, rf: u.rf });
}

// la parade a réussi : celui qui a paré devient celui qui tire, l'ultime repart sur son lanceur (même fiche : mêmes couleurs, mêmes dégâts)
// (17 oct. 2026) Le renvoi peut être contré UNE fois : celui qui vient de le recevoir (le lanceur) a sa propre fenêtre de parade ;
// parfaite : l'ultime repart sur l'autre, qui ne peut plus rien (`u.rf` = 2) ; simple : annulé ; rien : il le prend.
function reflectUlt(W, u, U) {
  const counter = u.rf === 1, O = W.fighters[u.slot], P = W.fighters[u.par]; // O = celui qui tirait jusque-là
  const dir = (O.x - P.x) * 1 >= 0 ? 1 : -1;
  // les autres qui avaient levé le bouclier le rebaissent
  for (const e of u.thr) { const Q = W.fighters[e.s]; if (Q && Q !== P && Q.state === 'shield') setState(Q, Q.grounded ? 'idle' : 'air'); }
  O.move = null; O.mf = 0; O.va[0] = 0; O.mv = {};
  if (O.state === 'move') setState(O, O.grounded ? 'idle' : 'air');
  u.tgt = O.slot;
  u.slot = P.slot; u.dir = dir; u.rf = counter ? 2 : 1; u.cw = 0; u.x = P.x; u.y = P.y;
  P.vx = P.vy = P.vz = P.kx = P.ky = P.kz = 0; P.hitlag = 0; P.bufA = P.bufX = P.bufJ = P.bufS = P.bufG = 0;
  if (P.grabbing >= 0) releaseGrab(P, W);
  startMove(P, W, ultDef(P).moves[0], { keepFacing: true });
  P.facing = faceOf(dir);
  P.invuln = Math.max(P.invuln, 30);
  W.emit('ultReflect', { s: P.slot, a: O.slot, x: P.x, y: P.y, z: P.z, dir, ctr: counter ? 1 : 0 });
  if (!counter && !O.out && O.state !== 'dead' && O.state !== 'respawn') {
    // la fenêtre de contre : on repart de l'anneau qui se resserre, seul O (celui qui visait) peut parer
    u.cw = 1; u.ph = 0; u.t = U.intro - ULT_PARRY.cue; u.vt = 0; P.mf = u.t;
    u.thr = [threatOf(W, O, U)];
    return;
  }
  beginStrike(W, u, P, U);
}

// la parade normale : l'ultime est annulé. Rien pour personne ; le lanceur a perdu sa jauge et reste étourdi (il se fait punir)
function cancelUlt(W, u, F, e) {
  const P = W.fighters[e.s];
  u.cx = 1; u.par = e.s;
  W.emit('ultCancel', { s: e.s, a: F.slot, x: F.x, y: F.y, z: F.z, px: P.x, py: P.y, pz: P.z, dir: u.dir });
  endUlt(W, F);
  stunFor(F, ULT_PARRY.stun);
}

function endUlt(W, F) {
  const U = ultDefOf(W.ult, F);
  F.move = null; F.mf = 0; F.va[0] = 0; F.mv = {};
  setState(F, F.grounded ? 'idle' : 'air');
  F.invuln = Math.max(F.invuln, 10);
  for (const e of W.ult.thr) { const Q = W.fighters[e.s]; if (Q && Q !== F && Q.state === 'shield') setState(Q, Q.grounded ? 'idle' : 'air'); } // ceux qui ont levé le bouclier le rebaissent
  W.emit('ultEnd', { s: F.slot, hit: W.ult.victims.length, x: F.x, y: F.y, z: F.z, id: U.id, rf: W.ult.rf, cx: W.ult.cx || 0 });
  W.ult = null;
}

// une image de l'ultime (le reste du match est figé : World.step)
export function stepUlt(W, inputs) {
  const u = W.ult, F = W.fighters[u.slot];
  if (!F || F.out || !ultDef(F)) { W.ult = null; return; }
  const U = ultDefOf(u, F), Um = ultDef(F), dir = u.dir;
  F.vx = F.vy = F.vz = F.kx = F.ky = F.kz = 0; F.hitlag = 0; F.mf++; F.st++; F.va[0] = 1;

  // la pause du verdict : le temps de l'ultime ne bouge plus, on voit qui a paré et qui a raté avant que le coup parte
  if (u.ph === 4) {
    if (++u.vt >= ULT_PARRY.verdict) {
      const first = (l) => l.slice().sort((a, b) => a.at - b.at || a.s - b.s)[0];
      const oks = u.thr.filter((e) => e.ok), perfs = oks.filter((e) => e.perf);
      if (perfs.length) { u.par = first(perfs).s; reflectUlt(W, u, U); }  // parade parfaite : renvoyé
      else if (oks.length) cancelUlt(W, u, F, first(oks));                // parade : annulé
      else beginStrike(W, u, F, U);
    }
    return;
  }

  const t = ++u.t;
  const foes = u.victims.map((s) => W.fighters[s]);
  const place = (V, i) => {
    const m = W.stage.main();
    let tx = F.x + dir * (U.hold[0] + U.hold[1] * i);
    tx = Math.max(m.cx - m.r - 6, Math.min(m.cx + m.r + 6, tx));
    const ty = F.y + U.hold[2] + U.hold[3] * i;
    V.x += (tx - V.x) * 0.32; V.y += (ty - V.y) * 0.32; V.z = 0;
    V.vx = V.vy = V.vz = V.kx = V.ky = V.kz = 0; V.hitlag = 0; V.hitstun = 999; V.facing = faceOf(-dir);
  };

  // 1. l'entrée en scène : pose dramatique, la caméra se rapproche. Ceux qui sont dans la zone peuvent lever leur bouclier
  if (u.ph === 0 && (!u.rf || u.cw)) {
    for (const e of u.thr) {
      const I = inputs && inputs[e.s];
      if (e.bt >= 0 ? t === e.bt : !!(I && (I.pressed & BTN.SHIELD))) guardPress(W, u, e, t, U);
    }
  }
  if (u.ph === 0 && t >= U.intro) {
    // sans personne qui ait tenté de parer : le coup part tout de suite ; sinon une pause (le verdict), puis le coup ou le renvoi
    if (u.thr.some((e) => e.tried)) {
      u.ph = 4; u.vt = 0; u.t = U.intro;
      for (const e of u.thr) if (e.tried) { const V = W.fighters[e.s]; W.emit('ultVerdict', { s: e.s, a: F.slot, ok: e.ok, perf: e.perf, x: V.x, y: V.y, z: V.z }); }
    } else beginStrike(W, u, F, U);
    return;
  }
  if (u.ph === 1) {
    foes.forEach(place);
    if (t >= U.intro + U.strike) {
      if (foes.length) { u.ph = 2; u.c = 0; F.move = Um.moves[2]; F.mf = 0; W.emit('ultCine', { s: F.slot, x: F.x, y: F.y, z: F.z, dir, n: foes.length }); }
      else { u.ph = 3; }
    }
    return;
  }
  if (u.ph === 3) { if (t >= U.intro + U.strike + U.whiff) endUlt(W, F); return; }
  if (u.ph === 2) {
    const c = ++u.c;
    foes.forEach(place);
    if (c % U.every === 3) {
      const n = Math.floor(c / U.every), last = n >= U.notes - 1;
      foes.forEach((V) => {
        if (last) {
          // la dernière note : un vrai coup (dégâts, éjection, sang, KO) par la même mécanique que les autres
          W.applyHit({ owner: F.slot, key: 'ult' + F.slot + ':' + W.tick, x: V.x, y: V.y + 1, z: 0, r: 0.5, ...U.final, dir: dir * Math.PI / 2, dirAngle: dir * Math.PI / 2,
            ox: F.x, oz: 0, hitlag: 1.6, sfx: 'boom', blood: 2, smash: true, charge: 1, move: 'ult', fx: 'light', hitsOwner: false, unblockable: true }, V);
        } else {
          V.damage = Math.min(999, V.damage + U.noteDmg); V.stats.taken += U.noteDmg; F.stats.dealt += U.noteDmg;
          V.bloodied = Math.min(1, V.bloodied + U.noteDmg / 120); V.lastHitBy = F.slot; V.lastHitTick = W.tick;
        }
        W.emit('ultHit', { s: V.slot, a: F.slot, n, last: last ? 1 : 0, x: V.x, y: V.y + 1, z: 0, d: last ? U.final.dmg : U.noteDmg, dir });
      });
      if (last) { W.slow(46, 0.28); endUlt(W, F); }
    }
  }
}

// un CPU qui a sa jauge pleine la lance quand un adversaire est dans la zone, devant lui (un tirage par image : pas de hasard)
export function botUlt(F, W, I) {
  if (!canStartUlt(F, W) || F.state === 'hitstun' || F.state === 'move' || W.tick % 9 !== 0) return I;
  const U = ultDef(F), dir = sideOf(F);
  for (const V of W.list) {
    if (V.slot !== F.slot && !(W.rules.teams && V.team === F.team) && inReach(F, V, U, dir) && Math.abs(V.x - F.x) > 1.2) {
      return { ...I, held: I.held | 3, pressed: I.pressed | 3 };
    }
  }
  return I;
}
