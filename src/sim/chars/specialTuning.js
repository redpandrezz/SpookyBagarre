// Every special's cooldown in one table: the ones that pay a lot wait a long time before coming back, the little
// pokes come back fast but barely push and barely hurt. The recoveries (up specials) have none.
//   cd:   frames (60 a second) before the special can be used again, counted once it is over
//   poke: the projectiles it throws are capped (damage, knockback): a nuisance, not a finisher
export const POKE = { dmg: 3, kbb: 4, kbg: 10, fkb: 14 };

// Cooldowns measured (tools/dev/balance.js: 80 CPU free-for-alls, damage and KOs per use of each special, 14 Oct
// 2026): what pays a lot waits a long time. Frames at 60 per second, counted once the special is over.
//   cheap pokes 0.8-1.2 s, mid projectiles 1.5-2.5 s, summons and AoE 3-5 s, stuns and kill moves 3.5-4.5 s
export const SPECIAL_TUNING = {
  frog: { sp_n: { cd: 70 }, sp_s: { cd: 110 }, sp_d: { cd: 150 } },                         // spit, tongue grab, swallow
  micron: { sp_n: { cd: 50, poke: true }, sp_s: { cd: 100, poke: true }, sp_d: { cd: 270 } }, // bills, powder, the 49.3 stamp (kills)
  bubba: { sp_n: { cd: 72, poke: true }, sp_s: { cd: 60, poke: true }, sp_d: { cd: 210 } },  // burger, fries, armoured belly flop
  parmesan: { sp_n: { cd: 70 }, sp_s: { cd: 150 }, sp_d: { cd: 120 } },                     // grater, cheese shards, cheese wheel
  pika: { sp_n: { cd: 180 }, sp_s: { cd: 270 }, sp_d: { cd: 210 } },                         // humanball, capture ball (kills), skybolt
  tung: { sp_n: { cd: 90 }, sp_s: { cd: 180 }, sp_d: { cd: 270 } },                          // drum, thrown bat, three shockwaves
  shark: { sp_n: { cd: 90 }, sp_s: { cd: 120 }, sp_d: { cd: 270 } },                         // spit, charge, the dive (intangible)
  catlady: { sp_n: { cd: 150 }, sp_s: { cd: 240 }, sp_d: { cd: 300 } },                      // cling cat, fat cat, the kittens
  pandrezz: { sp_n: { cd: 220 }, sp_s: { cd: 200 }, sp_d: { cd: 240 } },                     // kamehameha, CD-Man, Vinylman
  aboueb: { sp_n: { cd: 40 }, sp_s: { cd: 130 }, sp_d: { cd: 150 } },                       // reflector, curls grab (binds), the basketball (comes back)
  tices: { sp_n: { cd: 210 }, sp_s: { cd: 180 }, sp_d: { cd: 210 } },                        // flammekueche, rum and fire, the fart (stuns)
  omfu: { sp_n: { cd: 150 }, sp_s: { cd: 200 }, sp_d: { cd: 210 } },                       // the wrestler's hold, scratch waves, underground
  lolobiscotto: { sp_n: { cd: 70, poke: true }, sp_s: { cd: 220 }, sp_d: { cd: 260 } },      // chili (it still burns), grey cat (clings, slows), Ricard slick (falls)
  jsan: { sp_n: { cd: 210 }, sp_s: { cd: 200 }, sp_d: { cd: 150 } },                         // vape cloud (stuns), fetch (drags back), the poop (four at most)
  nymano: { sp_n: { cd: 150 }, sp_s: { cd: 120 }, sp_d: { cd: 160 } },                       // sample wave, skate dash, tears
  bido: { sp_n: { cd: 300 }, sp_s: { cd: 100 }, sp_d: { cd: 240 } },
  kerrian: { sp_n: { cd: 300 }, sp_s: { cd: 100 }, sp_d: { cd: 240 } }, // BIDO's moveset for now                         // the kiss (he steers the foe), jump rope, the flex (stuns)
  epektase: { sp_n: { cd: 190 }, sp_s: { cd: 150 }, sp_d: { cd: 230 } },                     // the solo (a stream of notes), power chord, larsen (stuns)
  pprod: { sp_n: { cd: 220 }, sp_s: { cd: 170 }, sp_d: { cd: 150 } },                        // the bugs out of the PC, the exploding PC, the pizza (5: it bursts)
  anbuu: { sp_n: { cd: 170 }, sp_s: { cd: 150 }, sp_d: { cd: 220 } },                       // the lick (7 notes), the waveform, the holy 808
  skanky: { sp_n: { cd: 200 }, sp_s: { cd: 330 }, sp_d: { cd: 400 } },                       // the talk (stuns), the fraud (the train), the funk (they dance)
};

// applied once to the character definitions (src/sim/chars/index.js)
export function applySpecialTuning(CHARS) {
  for (const [id, moves] of Object.entries(SPECIAL_TUNING)) {
    const C = CHARS[id];
    if (!C) continue;
    for (const [mv, t] of Object.entries(moves)) {
      const M = C.moves[mv];
      if (!M) continue;
      if (t.poke) M.poke = true; // (the cd numbers above are the old cooldowns: Ultimate has none, they are ignored)
    }
  }
  for (const [id, C] of Object.entries(CHARS)) {
    // the side and down specials that move the fighter in the air (a dash, a stall): once until landing, a ledge or
    // being hit (Ultimate)
    for (const k of ['sp_s', 'sp_d']) { const M = C.moves[k]; if (M && (M.noGrav || M.vel)) M.airOnce = true; }
    // the specials that paid far more than the fighter's own attacks when spammed (tools/dev/spamcheck.mjs, 16 Oct
    // 2026): one at a time, like Link's bomb (not again while the last one is out)
    for (const k of ONE_OUT[id] || []) if (C.moves[k]) C.moves[k].oneOut = true;
    // and more lag after the ones that still paid too much spammed point blank (Ultimate's way: the move's own lag)
    for (const [k, [iasa, dur]] of Object.entries(LAG[id] || {})) if (C.moves[k]) Object.assign(C.moves[k], { iasa, dur });
    // the recoveries hit like Ultimate's (a big blow to whoever is caught, now that the special fall is a real risk):
    // the carrying hits (rehit / drag) a little more, the launcher a lot more
    const R = RECOVERY[id], M = C.moves.sp_u;
    if (!R || !M || !M.hits) continue;
    const [dm, km, cm] = R;
    M.hits = M.hits.map((h) => (h.rehit || h.drag ? { ...h, dmg: +(h.dmg * cm).toFixed(2) } : { ...h, dmg: +(h.dmg * dm).toFixed(2), kbg: Math.round(h.kbg * km), kbb: Math.round(h.kbb * (1 + (km - 1) * 0.5)) }));
    if (R[3]) M.hits = [R[3], ...M.hits]; // a sweet spot first (it takes priority)
  }
}

const LAG = { micron: { sp_n: [44, 48] }, bubba: { sp_s: [50, 54] }, tung: { sp_s: [40, 44] }, epektase: { sp_n: [72, 78] } };
const ONE_OUT = { micron: ['sp_n'], tung: ['sp_s', 'sp_d'], bubba: ['sp_n', 'sp_s'], parmesan: ['sp_s'], pprod: ['sp_s'], catlady: ['sp_n'], epektase: ['sp_n'] };

// the up specials: [launcher damage x, its knockback growth x, carrying hits damage x, a sweet spot added first]
// (aimed at the archetype's Ultimate up special: about 10 to 15 % in all; Tices like Ness's PK Thunder, SKANKY like
// Luigi's Super Jump Punch on its first frame, Epektase like Marth's Dolphin Slash)
const RECOVERY = {
  frog: [1.25, 1.1, 1.2], micron: [1.5, 1.15, 1.5], bubba: [1.5, 1.12, 1.3], parmesan: [1.6, 1.12, 1.3], pika: [1.25, 1.1, 1.2],
  tung: [1.35, 1.1, 1.25], shark: [1.35, 1.1, 1.25], catlady: [1.1, 1.08, 1.1], pandrezz: [1.6, 1.2, 1.5], aboueb: [1.4, 1.12, 1.3],
  tices: [3.0, 1.3, 1.3], lolobiscotto: [1.75, 1.15, 1.3], jsan: [1.35, 1.12, 1.25], nymano: [1.25, 1.1, 1.2], bido: [1.7, 1.12, 1.2], kerrian: [1.7, 1.12, 1.2],
  epektase: [1.1, 1.15, 1.1], pprod: [1.25, 1.12, 1.25], anbuu: [1.2, 1.1, 1.2],
  skanky: [1.25, 1.1, 1, { f: [4, 4], at: [0, 0.9, 0.5], r: 0.6, dmg: 18, ang: 80, kbb: 30, kbg: 92, sfx: 'hitL', blood: 1.5, dir: 'radial', hitlag: 1.3 }],
};

// a projectile thrown during a poke special: capped damage and knockback
export function capPoke(props) {
  if (props.dmg !== undefined) props.dmg = Math.min(props.dmg, POKE.dmg);
  if (props.kbb !== undefined) props.kbb = Math.min(props.kbb, POKE.kbb);
  if (props.kbg !== undefined) props.kbg = Math.min(props.kbg, POKE.kbg);
  if (props.fkb !== undefined && props.fkb !== null) props.fkb = Math.min(props.fkb, POKE.fkb);
  return props;
}
