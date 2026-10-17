// The blows hit as far as they look. While a normal's hitbox is out, the rig stretches the limb that throws it
// into the hitbox and steps the body into the blow (src/render/rig/reach.js); a hitbox that still goes well past
// that limb is brought back: its far edge at the stretched limb + 0.3 m (a little past it, as in Smash), never less
// than 65 % of what it was (the moves keep most of their range), the ball made no fatter than 0.6 m so that a
// shorter hitbox does not end up covering the fighter's own body.
// Measured on 14 Oct 2026 with tools/dev/reachcheck.js (fitTable) in quick matches, the head and backside blows of
// the shared kit left as they are. Epektase has his own table (epektase.js).
export const REACH_FIT = {
  frog: { jab1: 1.34, jab2: 1.4, jab3: 1.3, ftilt: 0.97, dtilt: 1.14, fair: 1.04, bair: 1.27 },
  micron: { jab2: 1.32, jab3: 1.33, ftilt: 1.36, dtilt: 1.35, fair: 1.38, bair: 1.31 },
  bubba: { jab2: 1.49, jab3: 1.53, ftilt: 1.17, dtilt: 1.27, fair: 0.97, bair: 1.45 },
  parmesan: { jab1: 1.18, jab2: 1.24, jab3: 1.15, ftilt: 0.89, dtilt: 1.04, fair: 0.9, bair: 1.08 },
  pika: { jab1: 1.08, jab2: 1.18, jab3: 1.09, ftilt: 0.78, dtilt: 1.13, fair: 0.82, bair: 0.97 },
  tung: { jab3: 1.26, ftilt: 1.16, fair: 1.18, bair: 1.44 },
  shark: { jab1: 1.39, jab3: 1.5, ftilt: 1.03, dtilt: 1.35, fair: 0.76, bair: 1.07 },
  catlady: { jab1: 1.31, jab2: 1.29, jab3: 1.21, ftilt: 1.16, dtilt: 1.19, fair: 1.16, bair: 1.1 },
  pandrezz: { jab3: 1.47, ftilt: 1.48, dtilt: 1.48, fair: 1.45, bair: 1.23 },
  aboueb: { jab2: 1.4, jab3: 1.45, ftilt: 1.46, dtilt: 1.48, fair: 1.48, bair: 1.34 },
  tices: { jab1: 1.31, jab2: 1.36, jab3: 1.62, ftilt: 1.51, dtilt: 1.5, fair: 1.53, bair: 1.22 },
  omfu: { jab2: 1.44, jab3: 1.52, ftilt: 1.42, dtilt: 1.44, fair: 1.08, bair: 1.33 },
  lolobiscotto: { jab1: 1.28, jab2: 1.35, jab3: 1.52, ftilt: 1.55, dtilt: 1.49, fair: 1.51, bair: 1.18 },
  jsan: { jab2: 1.41, ftilt: 1.52, dtilt: 1.49, fair: 1.52, bair: 1.35 },
  nymano: { jab1: 1.35, jab2: 1.4, jab3: 1.26, ftilt: 1.42, dtilt: 1.46, fair: 1.43, bair: 1.15 },
  bido: { jab3: 1.63, ftilt: 1.59, dtilt: 1.53, fair: 1.14, bair: 1.36 },
  kerrian: { jab3: 1.63, ftilt: 1.59, dtilt: 1.53, fair: 1.14, bair: 1.36 }, // BIDO's moveset, to measure on his model
  pprod: { jab2: 1.38, jab3: 1.46, ftilt: 1.69, dtilt: 1.47, fair: 1.55, bair: 1.27 },
  skanky: { jab3: 1.54, ftilt3: 1.6, dtilt: 1.54, fair: 1.59, bair: 1.31 }, // 15 Oct 2026
  anbuu: { jab2: 1.43, jab3: 1.55, ftilt: 1.76, ftilt2: 1.36, ftilt3: 1.58, dtilt: 1.55, fair: 1.59, bair: 1.28 },
};
const FLOOR = 0.65, MAX_R = 0.6;

// applied once to the character definitions (src/sim/chars/index.js)
export function applyReachFit(CHARS) {
  for (const [id, moves] of Object.entries(REACH_FIT)) {
    const C = CHARS[id];
    if (!C) continue;
    for (const [mv, fit] of Object.entries(moves)) {
      const M = C.moves[mv];
      if (!M || !M.hits) continue;
      // the far edge of the whole move, and where it goes now
      const old = Math.max(...M.hits.map((h) => Math.abs(h.at[2]) + h.r));
      const edge = Math.max(fit, old * FLOOR);
      for (const h of M.hits) {
        if (Math.abs(h.at[2]) + h.r <= edge) continue;
        const s = h.at[2] < 0 ? -1 : 1;
        h.r = Math.min(h.r, MAX_R);
        h.at = [h.at[0], h.at[1], s * Math.max(0.3, edge - h.r)];
      }
    }
  }
}
