// Audio: every sound effect is synthesised once into a buffer (no samples to download), played with random pitch,
// stereo pan, and a bus compressor. The announcer uses the browser's speech synthesis, pitched down.
import { Music } from './music.js';
import { probeTracks, FilePlayer, ARENA_TRACK } from './tracks.js';
import { probeSfx, loadSfx } from './sfxfiles.js';

// Sober sound effects: the same sound never stacks on itself, a minimum gap between two of them, and a cap on the
// number of sounds at once (a crowd of cats, a beam raking someone, a multi-hit: one clean sound, not a wall of noise)
const SFX_RULES = {
  // [max at once, min gap in seconds]
  default: [2, 0.045],
  hitS: [2, 0.06], hitM: [2, 0.06], slap: [2, 0.06], zapS: [1, 0.12], zap: [1, 0.09], scratch: [1, 0.1], grate: [1, 0.1],
  wood: [2, 0.06], tung: [2, 0.08], chomp: [2, 0.07], pummel: [1, 0.12], cash: [1, 0.1],
  splat: [1, 0.12], splatter: [1, 0.25], hitL: [1, 0.1], punchHeavy: [1, 0.09],
  whoosh: [1, 0.12], click: [1, 0.15], land: [1, 0.08], thud: [1, 0.12], jump: [2, 0.05], jump2: [2, 0.05], charge: [1, 0.4],
  hiss: [1, 0.6], meow: [1, 0.35], yowl: [1, 0.7], broom: [1, 0.9], crowd: [1, 2.2], fizz: [1, 0.8], gas: [1, 0.8],
  wave: [1, 1], thunder: [1, 0.8], thunderCall: [1, 0.8], helico: [1, 0.8], sahur: [1, 0.8], kameCharge: [1, 1.2],
  kameFire: [1, 0.3], vinylScratch: [1, 0.3], bassDrop: [1, 0.5], grateHeavy: [1, 0.15], quake: [1, 0.25],
  poof: [1, 0.15], pop: [1, 0.1], cowbell: [2, 0.06], fart: [1, 0.25], flame: [1, 0.12], flameL: [1, 0.5], sizzle: [1, 0.25], sob: [1, 0.5], bark: [1, 0.2], skate: [1, 0.2], vape: [1, 0.6], heart: [1, 0.1], clank: [1, 0.08], wobble: [1, 0.2], splash: [1, 0.2], gurgle: [1, 0.4], slice: [1, 0.08], cdThrow: [1, 0.08],
  riff: [1, 0.15], shred: [1, 0.5], powerchord: [1, 0.3], larsen: [1, 0.8], silk: [2, 0.06], note: [2, 0.05],
  guitarHit: [2, 0.06], guitarHitL: [1, 0.1], guitarSmash: [1, 0.1], typing: [1, 0.5], blip: [2, 0.05], error: [1, 0.3],
  airhorn: [1, 0.9], hitmark: [2, 0.03], whinny: [1, 0.6],
  horn: [1, 0.8], rails: [1, 0.8], blabla: [2, 0.12], funk: [1, 0.6], sub808: [1, 1], flap: [1, 0.2], kozoom: [1, 0.06], perfect: [1, 0.03],
  zzWarp: [1, 2], zzArrive: [1, 1], zzBoomFar: [2, 0.25], zzBell: [1, 2], zzWhale: [1, 3],
  lick0: [1, 0.2], lick1: [1, 0.2], lick2: [1, 0.2], lick3: [1, 0.2], lick4: [1, 0.2], lick5: [1, 0.2], lick6: [1, 0.4],
};
const MAX_VOICES = 10;

const SR = 44100;

// --- tiny offline synth ---------------------------------------------------------------------------------------------
function biquad(type, f, q, sr = SR) {
  const w = (2 * Math.PI * f) / sr, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else { b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
}
function runBq(q, x) {
  const y = q.b0 * x + q.b1 * q.x1 + q.b2 * q.x2 - q.a1 * q.y1 - q.a2 * q.y2;
  q.x2 = q.x1; q.x1 = x; q.y2 = q.y1; q.y1 = y;
  return y;
}

// layer: { w: 'noise'|'sine'|'square'|'saw'|'tri', f:[f0,f1], d: seconds, a: attack, curve: decay power, g: gain,
//          flt: { t:'lp'|'hp'|'bp', f:[f0,f1], q }, dist, start, vib:[rate, depth], am:[rate, depth], seed }
function render(ctx, layers) {
  let len = 0;
  for (const L of layers) len = Math.max(len, (L.start || 0) + L.d);
  const n = Math.ceil((len + 0.02) * SR);
  const buf = ctx.createBuffer(1, n, SR);
  const out = buf.getChannelData(0);
  for (const L of layers) {
    const s0 = Math.floor((L.start || 0) * SR), ns = Math.floor(L.d * SR);
    let ph = 0, seed = L.seed || 12345;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
    const f0 = L.f ? L.f[0] : 440, f1 = L.f ? L.f[1] ?? f0 : f0;
    const flt = L.flt ? biquad(L.flt.t, L.flt.f[0], L.flt.q || 1) : null;
    let brown = 0;
    for (let i = 0; i < ns; i++) {
      const t = i / ns;
      const f = f0 * Math.pow(f1 / f0, t) * (L.vib ? 1 + Math.sin((i / SR) * L.vib[0] * 6.283) * L.vib[1] : 1);
      ph += f / SR;
      let v;
      switch (L.w) {
        case 'noise': v = rnd(); break;
        case 'brown': brown = (brown + rnd() * 0.12) * 0.985; v = brown * 3; break;
        case 'square': v = (ph % 1) < 0.5 ? 1 : -1; break;
        case 'saw': v = 2 * (ph % 1) - 1; break;
        case 'tri': v = 4 * Math.abs((ph % 1) - 0.5) - 1; break;
        default: v = Math.sin(ph * 6.283);
      }
      if (flt) {
        if (L.flt.f[1] && i % 64 === 0) { const ff = L.flt.f[0] * Math.pow(L.flt.f[1] / L.flt.f[0], t); Object.assign(flt, (({ b0, b1, b2, a1, a2 }) => ({ b0, b1, b2, a1, a2 }))(biquad(L.flt.t, ff, L.flt.q || 1))); }
        v = runBq(flt, v);
      }
      const att = L.a ? Math.min(1, i / (L.a * SR)) : 1;
      let env = att * Math.pow(1 - t, L.curve ?? 2);
      if (L.am) env *= 1 - L.am[1] * (0.5 + 0.5 * Math.sin((i / SR) * L.am[0] * 6.283));
      v *= env * (L.g ?? 0.5);
      if (L.dist) v = Math.tanh(v * L.dist) / Math.tanh(L.dist);
      out[s0 + i] += v;
    }
  }
  // normalise peaks
  let pk = 0;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(out[i]));
  if (pk > 0.98) for (let i = 0; i < n; i++) out[i] *= 0.98 / pk;
  return buf;
}

const S = {
  hitS: [{ w: 'noise', d: 0.05, g: 0.6, flt: { t: 'bp', f: [2400], q: 0.8 } }, { w: 'sine', f: [180, 60], d: 0.08, g: 0.8 }],
  hitM: [{ w: 'noise', d: 0.07, g: 0.7, flt: { t: 'bp', f: [1800, 600], q: 0.7 }, dist: 2 }, { w: 'sine', f: [140, 45], d: 0.14, g: 1, dist: 1.5 }],
  hitL: [{ w: 'noise', d: 0.12, g: 0.9, flt: { t: 'lp', f: [5000, 400], q: 0.7 }, dist: 3 }, { w: 'sine', f: [110, 32], d: 0.32, g: 1.1, dist: 2.5 }, { w: 'noise', d: 0.03, g: 0.7, flt: { t: 'hp', f: [3000] } }],
  punchHeavy: [{ w: 'sine', f: [95, 30], d: 0.38, g: 1.2, dist: 3 }, { w: 'noise', d: 0.15, g: 0.8, flt: { t: 'lp', f: [3000, 300] }, dist: 3 }],
  slap: [{ w: 'noise', d: 0.045, g: 0.9, flt: { t: 'bp', f: [3200], q: 1.2 }, curve: 3 }, { w: 'sine', f: [300, 120], d: 0.05, g: 0.4 }],
  briefcase: [{ w: 'square', f: [220, 90], d: 0.12, g: 0.4, flt: { t: 'lp', f: [1600] } }, { w: 'sine', f: [120, 40], d: 0.25, g: 1, dist: 2 }, { w: 'noise', d: 0.06, g: 0.6, flt: { t: 'bp', f: [1200] } }],
  splat: [{ w: 'noise', d: 0.22, g: 0.9, flt: { t: 'lp', f: [2500, 200], q: 2 }, am: [30, 0.5] }, { w: 'sine', f: [200, 60], d: 0.12, g: 0.5 }],
  splatter: [{ w: 'noise', d: 0.45, g: 1, flt: { t: 'lp', f: [3000, 150], q: 3 }, am: [22, 0.6] }, { w: 'noise', d: 0.2, g: 0.6, start: 0.08, flt: { t: 'bp', f: [800] }, am: [40, 0.8] }, { w: 'sine', f: [90, 30], d: 0.3, g: 0.8, dist: 2 }],
  whoosh: [{ w: 'noise', d: 0.22, g: 0.45, a: 0.08, curve: 1.5, flt: { t: 'bp', f: [400, 2200], q: 1.5 } }],
  // a special pressed while it recharges: a dry empty click
  click: [{ w: 'square', f: [1700, 800], d: 0.035, g: 0.22, flt: { t: 'bp', f: [2000], q: 2 } }, { w: 'noise', d: 0.02, g: 0.25, flt: { t: 'hp', f: [4000] } }],
  jump: [{ w: 'square', f: [180, 520], d: 0.09, g: 0.18, flt: { t: 'lp', f: [3000] } }],
  jump2: [{ w: 'square', f: [300, 820], d: 0.1, g: 0.16, flt: { t: 'lp', f: [3500] } }, { w: 'noise', d: 0.1, g: 0.15, flt: { t: 'bp', f: [3000] } }],
  land: [{ w: 'noise', d: 0.06, g: 0.4, flt: { t: 'lp', f: [700] } }, { w: 'sine', f: [120, 60], d: 0.06, g: 0.4 }],
  thud: [{ w: 'sine', f: [90, 35], d: 0.25, g: 1, dist: 2 }, { w: 'noise', d: 0.12, g: 0.7, flt: { t: 'lp', f: [900, 200] } }],
  shield: [{ w: 'sine', f: [1200], d: 0.25, g: 0.4, curve: 3 }, { w: 'sine', f: [1820], d: 0.18, g: 0.25, curve: 3 }, { w: 'noise', d: 0.03, g: 0.3, flt: { t: 'hp', f: [4000] } }],
  shieldHit: [{ w: 'sine', f: [1200], d: 0.25, g: 0.4, curve: 3 }, { w: 'sine', f: [1820], d: 0.18, g: 0.25, curve: 3 }, { w: 'noise', d: 0.03, g: 0.3, flt: { t: 'hp', f: [4000] } }],
  parry: [{ w: 'sine', f: [1600, 2400], d: 0.4, g: 0.45, curve: 2 }, { w: 'sine', f: [2400, 3600], d: 0.3, g: 0.3 }, { w: 'tri', f: [800, 1600], d: 0.2, g: 0.3 }],
  glass: [{ w: 'noise', d: 0.5, g: 0.8, flt: { t: 'hp', f: [2500] }, am: [60, 0.7] }, { w: 'sine', f: [2600, 1800], d: 0.4, g: 0.25 }, { w: 'sine', f: [3400, 2900], d: 0.3, g: 0.2 }],
  ko: [{ w: 'noise', d: 1.4, g: 1, flt: { t: 'lp', f: [4000, 120], q: 0.8 }, dist: 3, curve: 1.6 }, { w: 'sine', f: [80, 22], d: 1.2, g: 1.2, dist: 3 }, { w: 'noise', d: 0.6, g: 0.5, start: 0.05, flt: { t: 'bp', f: [500] }, am: [18, 0.7] }],
  tung: [{ w: 'sine', f: [620, 560], d: 0.22, g: 0.8, curve: 4 }, { w: 'sine', f: [1240], d: 0.08, g: 0.3, curve: 4 }, { w: 'noise', d: 0.015, g: 0.5, flt: { t: 'bp', f: [2500] } }],
  tungL: [{ w: 'sine', f: [480, 400], d: 0.32, g: 1, curve: 3, dist: 1.5 }, { w: 'sine', f: [960], d: 0.12, g: 0.3 }, { w: 'noise', d: 0.03, g: 0.6, flt: { t: 'bp', f: [1800] } }, { w: 'sine', f: [100, 40], d: 0.2, g: 0.8 }],
  wood: [{ w: 'sine', f: [800, 700], d: 0.08, g: 0.6, curve: 4 }, { w: 'noise', d: 0.02, g: 0.5, flt: { t: 'bp', f: [2000] } }, { w: 'sine', f: [150, 70], d: 0.07, g: 0.6 }],
  woodM: [{ w: 'sine', f: [600, 500], d: 0.14, g: 0.8, curve: 4 }, { w: 'noise', d: 0.03, g: 0.6, flt: { t: 'bp', f: [1600] } }, { w: 'sine', f: [130, 50], d: 0.12, g: 0.8, dist: 1.5 }],
  woodL: [{ w: 'sine', f: [440, 360], d: 0.25, g: 1, curve: 3 }, { w: 'noise', d: 0.05, g: 0.7, flt: { t: 'bp', f: [1200] } }, { w: 'sine', f: [110, 35], d: 0.25, g: 1, dist: 2 }],
  zap: [{ w: 'saw', f: [180, 90], d: 0.2, g: 0.35, vib: [70, 0.3], flt: { t: 'lp', f: [3500] }, dist: 2 }, { w: 'noise', d: 0.15, g: 0.4, flt: { t: 'hp', f: [2000] }, am: [80, 0.8] }],
  zapS: [{ w: 'saw', f: [260, 160], d: 0.08, g: 0.3, vib: [90, 0.3], dist: 2 }, { w: 'noise', d: 0.05, g: 0.4, flt: { t: 'bp', f: [3000] } }],
  zapL: [{ w: 'saw', f: [140, 60], d: 0.35, g: 0.5, vib: [60, 0.4], dist: 3 }, { w: 'noise', d: 0.25, g: 0.5, flt: { t: 'hp', f: [1500] }, am: [70, 0.8] }, { w: 'sine', f: [100, 40], d: 0.2, g: 0.8 }],
  thunder: [{ w: 'brown', d: 2.0, g: 1, a: 0.01, curve: 1.3, flt: { t: 'lp', f: [900, 80] }, am: [8, 0.5] }, { w: 'noise', d: 0.2, g: 0.8, flt: { t: 'hp', f: [1500] } }],
  thunderCall: [{ w: 'saw', f: [60, 300], d: 0.6, g: 0.3, a: 0.5, curve: 0.2, vib: [40, 0.2], flt: { t: 'lp', f: [2000] } }],
  cash: [{ w: 'sine', f: [1568], d: 0.25, g: 0.4, curve: 3 }, { w: 'sine', f: [2093], d: 0.35, g: 0.4, start: 0.08, curve: 3 }, { w: 'noise', d: 0.05, g: 0.3, flt: { t: 'hp', f: [5000] } }],
  poof: [{ w: 'noise', d: 0.35, g: 0.6, flt: { t: 'lp', f: [1500, 300] }, a: 0.02 }],
  sniff: [{ w: 'noise', d: 0.5, g: 0.5, a: 0.4, curve: 0.3, flt: { t: 'bp', f: [800, 3000], q: 2 } }, { w: 'noise', d: 0.25, g: 0.4, start: 0.5, a: 0.2, curve: 0.4, flt: { t: 'bp', f: [1200, 3500], q: 2 } }],
  stamp: [{ w: 'sine', f: [70, 28], d: 0.6, g: 1.3, dist: 3 }, { w: 'noise', d: 0.3, g: 1, flt: { t: 'lp', f: [2500, 200] }, dist: 2 }, { w: 'noise', d: 0.05, g: 0.8, flt: { t: 'hp', f: [3000] } }],
  decree: [{ w: 'saw', f: [262], d: 0.18, g: 0.25, flt: { t: 'lp', f: [2000] } }, { w: 'saw', f: [330], d: 0.18, g: 0.25, start: 0.15, flt: { t: 'lp', f: [2000] } }, { w: 'saw', f: [392], d: 0.4, g: 0.3, start: 0.3, flt: { t: 'lp', f: [2200] }, curve: 1 }],
  grate: [{ w: 'noise', d: 0.12, g: 0.55, flt: { t: 'bp', f: [3200], q: 2 }, am: [55, 0.9] }],
  grateHeavy: [{ w: 'noise', d: 0.3, g: 0.8, flt: { t: 'bp', f: [2400, 1200], q: 1.5 }, am: [45, 0.9] }, { w: 'sine', f: [120, 50], d: 0.2, g: 0.7 }],
  chomp: [{ w: 'noise', d: 0.04, g: 0.8, flt: { t: 'bp', f: [1500] } }, { w: 'noise', d: 0.05, g: 0.8, start: 0.07, flt: { t: 'bp', f: [1100] } }, { w: 'sine', f: [160, 60], d: 0.15, g: 0.7, dist: 2 }],
  chompL: [{ w: 'noise', d: 0.06, g: 1, flt: { t: 'bp', f: [1300] } }, { w: 'saw', f: [70, 50], d: 0.35, g: 0.4, flt: { t: 'lp', f: [600] }, dist: 3 }, { w: 'sine', f: [120, 35], d: 0.3, g: 1, dist: 2.5 }, { w: 'noise', d: 0.25, g: 0.7, start: 0.05, flt: { t: 'lp', f: [2000, 200] }, am: [25, 0.6] }],
  jaws: [{ w: 'saw', f: [82], d: 0.3, g: 0.35, flt: { t: 'lp', f: [400] }, curve: 0.8 }, { w: 'saw', f: [87], d: 0.3, g: 0.35, start: 0.33, flt: { t: 'lp', f: [400] }, curve: 0.8 }],
  splash: [{ w: 'noise', d: 0.5, g: 0.8, flt: { t: 'lp', f: [5000, 300] }, a: 0.01, am: [16, 0.3] }],
  pop: [{ w: 'sine', f: [300, 1100], d: 0.08, g: 0.6 }, { w: 'noise', d: 0.02, g: 0.4, flt: { t: 'hp', f: [3000] } }],
  boing: [{ w: 'sine', f: [180, 760], d: 0.35, g: 0.5, vib: [18, 0.08] }],
  // ZINZIN BAGARRE (src/render/stages/zinzin.js) : l'hyperespace, l'arrivée dans un monde, les bruits de chaque monde, au loin
  zzWarp: [{ w: 'noise', d: 2.8, g: 0.7, a: 2.0, curve: 0.5, flt: { t: 'bp', f: [180, 4200], q: 1.2 } }, { w: 'saw', f: [55, 440], d: 2.8, g: 0.22, a: 1.8, curve: 0.4, flt: { t: 'lp', f: [300, 3200] } }, { w: 'sine', f: [38, 96], d: 2.8, g: 0.6, a: 1.6, curve: 0.4 }],
  zzArrive: [{ w: 'sine', f: [92, 26], d: 1.5, g: 1.1, dist: 2.5 }, { w: 'noise', d: 1.3, g: 0.7, flt: { t: 'lp', f: [7000, 180] }, curve: 1.5 }, { w: 'sine', f: [1320, 1760], d: 1.3, g: 0.14, start: 0.05, curve: 2 }, { w: 'sine', f: [1980, 2640], d: 1.1, g: 0.1, start: 0.1, curve: 2 }],
  zzBoomFar: [{ w: 'brown', d: 1.8, g: 1, a: 0.01, curve: 1.7, flt: { t: 'lp', f: [520, 60] }, dist: 2 }, { w: 'sine', f: [58, 24], d: 1.0, g: 0.8 }],
  zzRattle: [{ w: 'noise', d: 1.1, g: 0.55, flt: { t: 'bp', f: [900], q: 1.4 }, am: [13, 1], curve: 0.8 }],
  zzBell: [{ w: 'sine', f: [196], d: 3.6, g: 0.6, curve: 1.6 }, { w: 'sine', f: [466], d: 2.8, g: 0.22, curve: 2 }, { w: 'sine', f: [588], d: 2.2, g: 0.14, curve: 2.4 }, { w: 'sine', f: [98], d: 3.6, g: 0.3, curve: 1.4 }],
  zzWail: [{ w: 'sine', f: [540, 330], d: 2.3, g: 0.35, a: 0.8, vib: [5, 0.04], curve: 0.8 }, { w: 'tri', f: [800, 500], d: 2.0, g: 0.1, a: 0.9, vib: [5.5, 0.05] }],
  zzWhale: [{ w: 'sine', f: [170, 430], d: 1.7, g: 0.5, a: 0.5, curve: 0.7, vib: [3, 0.03] }, { w: 'sine', f: [430, 150], d: 2.1, g: 0.45, start: 1.5, a: 0.4, curve: 1, vib: [2.5, 0.03] }, { w: 'sine', f: [85, 215], d: 1.7, g: 0.25, a: 0.5, curve: 0.7 }],
  zzCar: [{ w: 'noise', d: 1.0, g: 0.6, a: 0.5, curve: 1.3, flt: { t: 'bp', f: [500, 2600], q: 2 } }, { w: 'saw', f: [150, 80], d: 1.0, g: 0.15, a: 0.45, flt: { t: 'lp', f: [900] } }],
  zzOrgan: [{ w: 'square', f: [131], d: 2.4, g: 0.16, a: 0.1, curve: 1.2, flt: { t: 'lp', f: [1400] } }, { w: 'square', f: [165], d: 2.4, g: 0.14, a: 0.1, curve: 1.2, flt: { t: 'lp', f: [1400] } }, { w: 'square', f: [196], d: 2.4, g: 0.14, a: 0.1, curve: 1.2, flt: { t: 'lp', f: [1600] } }, { w: 'square', f: [262], d: 2.4, g: 0.12, a: 0.1, curve: 1.2, flt: { t: 'lp', f: [1800] } }],
  zzFanfare: [{ w: 'saw', f: [392], d: 0.2, g: 0.25, flt: { t: 'lp', f: [2500] } }, { w: 'saw', f: [523], d: 0.2, g: 0.25, start: 0.17, flt: { t: 'lp', f: [2500] } }, { w: 'saw', f: [659], d: 0.2, g: 0.25, start: 0.34, flt: { t: 'lp', f: [2600] } }, { w: 'saw', f: [784], d: 0.7, g: 0.3, start: 0.51, curve: 1.2, flt: { t: 'lp', f: [2800] }, vib: [6, 0.01] }],
  zzChime: [{ w: 'sine', f: [1568], d: 1.0, g: 0.3, curve: 3 }, { w: 'sine', f: [2093], d: 1.0, g: 0.25, start: 0.08, curve: 3 }, { w: 'sine', f: [2637], d: 1.0, g: 0.22, start: 0.16, curve: 3 }, { w: 'sine', f: [3136], d: 1.2, g: 0.2, start: 0.24, curve: 3 }],
  zzTheremin: [{ w: 'sine', f: [300, 900], d: 1.6, g: 0.35, a: 0.2, vib: [6, 0.06], curve: 0.8 }, { w: 'sine', f: [900, 450], d: 1.0, g: 0.25, start: 1.4, vib: [7, 0.06] }],
  tongue: [{ w: 'noise', d: 0.18, g: 0.5, flt: { t: 'bp', f: [600, 3000], q: 3 } }, { w: 'sine', f: [300, 900], d: 0.12, g: 0.3 }],
  slurp: [{ w: 'noise', d: 0.35, g: 0.6, flt: { t: 'bp', f: [2500, 500], q: 4 }, am: [20, 0.6] }],
  whip: [{ w: 'noise', d: 0.05, g: 1, flt: { t: 'hp', f: [2500] }, curve: 4 }, { w: 'sine', f: [400, 150], d: 0.08, g: 0.5 }],
  gulp: [{ w: 'sine', f: [400, 120], d: 0.2, g: 0.6 }, { w: 'noise', d: 0.15, g: 0.4, flt: { t: 'lp', f: [800] } }],
  spit: [{ w: 'noise', d: 0.25, g: 0.8, flt: { t: 'bp', f: [1500, 600], q: 2 } }, { w: 'sine', f: [600, 200], d: 0.15, g: 0.4 }],
  gurgle: [{ w: 'sine', f: [150, 220], d: 0.3, g: 0.4, vib: [14, 0.4] }],
  throw: [{ w: 'noise', d: 0.15, g: 0.4, a: 0.03, flt: { t: 'bp', f: [600, 1800], q: 1.5 } }],
  // ultis (minigames) : la corne de brume des montages, le « tic » du hitmarker, un hennissement
  airhorn: [0, 0.32, 0.64].flatMap((t, i) => [
    { w: 'saw', f: [470, 462], d: i === 2 ? 0.55 : 0.24, g: 0.32, flt: { t: 'lp', f: [3200] }, start: t, curve: 0.5, vib: [7, 0.01] },
    { w: 'square', f: [352, 347], d: i === 2 ? 0.55 : 0.24, g: 0.16, flt: { t: 'lp', f: [2600] }, start: t, curve: 0.5 },
    { w: 'saw', f: [940, 925], d: i === 2 ? 0.55 : 0.24, g: 0.08, flt: { t: 'lp', f: [4000] }, start: t, curve: 0.5 },
  ]),
  hitmark: [{ w: 'square', f: [2700, 2300], d: 0.03, g: 0.2, flt: { t: 'hp', f: [1500] } }, { w: 'noise', d: 0.018, g: 0.22, flt: { t: 'hp', f: [5000] } }],
  whinny: [{ w: 'saw', f: [900, 1300], d: 0.5, g: 0.22, vib: [16, 0.08], flt: { t: 'bp', f: [1400], q: 2 } }, { w: 'noise', d: 0.4, g: 0.12, flt: { t: 'bp', f: [2200], q: 3 }, am: [18, 0.6] }],
  shotgun: [{ w: 'noise', d: 0.3, g: 1, flt: { t: 'lp', f: [6000, 400] }, dist: 3 }, { w: 'sine', f: [120, 40], d: 0.25, g: 1, dist: 2 }],
  fizz: [{ w: 'noise', d: 1.2, g: 0.6, flt: { t: 'hp', f: [3000] }, am: [35, 0.7], a: 0.1, curve: 1 }],
  helico: [{ w: 'noise', d: 0.9, g: 0.6, flt: { t: 'lp', f: [900] }, am: [16, 0.9], curve: 1 }],
  zip: [{ w: 'saw', f: [400, 2400], d: 0.15, g: 0.3, flt: { t: 'lp', f: [5000] }, dist: 2 }, { w: 'noise', d: 0.1, g: 0.4, flt: { t: 'hp', f: [3000] } }],
  go: [{ w: 'square', f: [520], d: 0.08, g: 0.2 }, { w: 'square', f: [780], d: 0.15, g: 0.2, start: 0.08 }],
  sahur: [{ w: 'saw', f: [220, 260], d: 0.25, g: 0.3, flt: { t: 'bp', f: [900], q: 2 } }, { w: 'saw', f: [260, 180], d: 0.4, g: 0.3, start: 0.22, flt: { t: 'bp', f: [700], q: 2 } }],
  boom: [{ w: 'noise', d: 0.7, g: 1, flt: { t: 'lp', f: [3000, 100] }, dist: 3 }, { w: 'sine', f: [90, 25], d: 0.6, g: 1.2, dist: 3 }],
  wobble: [{ w: 'sine', f: [500, 300], d: 0.1, g: 0.3 }, { w: 'sine', f: [300, 500], d: 0.1, g: 0.3, start: 0.1 }],
  flash: [{ w: 'noise', d: 0.1, g: 0.5, flt: { t: 'hp', f: [4000] } }, { w: 'sine', f: [3000, 1500], d: 0.2, g: 0.2 }],
  slip: [{ w: 'sine', f: [900, 200], d: 0.4, g: 0.4 }, { w: 'noise', d: 0.2, g: 0.3, start: 0.3, flt: { t: 'lp', f: [800] } }],
  gas: [{ w: 'brown', d: 1.2, g: 0.9, a: 0.05, flt: { t: 'lp', f: [400, 150] }, am: [12, 0.6] }, { w: 'noise', d: 0.6, g: 0.4, start: 0.3, flt: { t: 'bp', f: [700] } }],
  stab: [{ w: 'noise', d: 0.15, g: 1, flt: { t: 'hp', f: [1500] } }, { w: 'sine', f: [800, 600], d: 0.6, g: 0.3, curve: 3 }, { w: 'sine', f: [80, 30], d: 0.3, g: 1, dist: 2 }],
  wave: [{ w: 'brown', d: 2.2, g: 1, a: 0.6, curve: 1.2, flt: { t: 'lp', f: [600, 1500] } }],
  quake: [{ w: 'brown', d: 0.8, g: 1, flt: { t: 'lp', f: [300, 60] }, am: [9, 0.5] }, { w: 'sine', f: [55, 30], d: 0.6, g: 1, dist: 2 }],
  charge: [{ w: 'saw', f: [110, 330], d: 0.9, g: 0.12, a: 0.2, curve: 0.5, flt: { t: 'lp', f: [800, 2500] }, vib: [12, 0.05] }],
  ledge: [{ w: 'noise', d: 0.05, g: 0.4, flt: { t: 'bp', f: [1200] } }, { w: 'sine', f: [300, 200], d: 0.05, g: 0.3 }],
  grab: [{ w: 'noise', d: 0.08, g: 0.5, flt: { t: 'bp', f: [900] } }],
  tech: [{ w: 'sine', f: [800, 1600], d: 0.15, g: 0.3 }, { w: 'noise', d: 0.05, g: 0.3, flt: { t: 'hp', f: [3000] } }],
  respawn: [{ w: 'tri', f: [300, 900], d: 0.5, g: 0.25, vib: [8, 0.04] }],
  pummel: [{ w: 'noise', d: 0.05, g: 0.6, flt: { t: 'bp', f: [1200] } }, { w: 'sine', f: [160, 70], d: 0.07, g: 0.6 }],
  slice: [{ w: 'noise', d: 0.12, g: 0.8, flt: { t: 'hp', f: [2500, 6000] } }, { w: 'saw', f: [900, 400], d: 0.1, g: 0.2 }],
  countHi: [{ w: 'square', f: [440], d: 0.25, g: 0.2, flt: { t: 'lp', f: [2000] } }],
  countGo: [{ w: 'square', f: [880], d: 0.6, g: 0.22, flt: { t: 'lp', f: [3000] }, curve: 1 }, { w: 'square', f: [1320], d: 0.6, g: 0.12, flt: { t: 'lp', f: [3000] }, curve: 1 }],
  game: [{ w: 'noise', d: 2.5, g: 0.7, flt: { t: 'lp', f: [2000, 100] }, curve: 1.2 }, { w: 'sine', f: [60, 30], d: 2, g: 1, dist: 2 }],
  menuMove: [{ w: 'square', f: [660], d: 0.04, g: 0.12, flt: { t: 'lp', f: [3000] } }],
  menuOk: [{ w: 'square', f: [660, 990], d: 0.1, g: 0.15, flt: { t: 'lp', f: [3000] } }, { w: 'noise', d: 0.05, g: 0.2, flt: { t: 'bp', f: [2000] } }],
  menuBack: [{ w: 'square', f: [440, 220], d: 0.1, g: 0.14, flt: { t: 'lp', f: [2000] } }],
  crowd: [{ w: 'noise', d: 1.6, g: 0.7, a: 0.3, curve: 1.4, flt: { t: 'bp', f: [700, 1100], q: 0.6 }, am: [6, 0.4] }],
  // Pandrezz: kamehameha, CD-Man, Vinylman
  kameCharge: [{ w: 'saw', f: [85, 190], d: 1.5, g: 0.14, a: 0.25, curve: 0.45, flt: { t: 'lp', f: [420, 2400] }, vib: [16, 0.05] },
    { w: 'noise', d: 1.5, g: 0.12, a: 0.35, curve: 0.6, flt: { t: 'bp', f: [2400, 5200], q: 2 }, am: [32, 0.75] },
    { w: 'sine', f: [220, 440], d: 1.4, g: 0.08, a: 0.4, curve: 0.5, am: [9, 0.5] }],
  kameFire: [{ w: 'noise', d: 1.4, g: 1, a: 0.015, curve: 1.2, flt: { t: 'lp', f: [6000, 500] }, dist: 2 },
    { w: 'saw', f: [240, 80], d: 1.2, g: 0.35, flt: { t: 'lp', f: [2000, 350] }, dist: 2.5, vib: [26, 0.04] },
    { w: 'sine', f: [75, 38], d: 1.1, g: 0.9, dist: 2 }, { w: 'noise', d: 1.2, g: 0.25, a: 0.05, flt: { t: 'bp', f: [3000, 1500], q: 1.5 }, am: [40, 0.6] }],
  summon: [{ w: 'tri', f: [520, 1700], d: 0.38, g: 0.22, vib: [22, 0.05] }, { w: 'sine', f: [1100, 2400], d: 0.32, g: 0.14, start: 0.1, am: [30, 0.6] },
    { w: 'noise', d: 0.3, g: 0.22, flt: { t: 'hp', f: [5000] } }, { w: 'sine', f: [180, 90], d: 0.25, g: 0.4 }],
  cdThrow: [{ w: 'noise', d: 0.24, g: 0.6, flt: { t: 'bp', f: [1800, 4200], q: 3 }, am: [44, 0.6] }, { w: 'sine', f: [1500, 900], d: 0.16, g: 0.14 }],
  vinylScratch: [{ w: 'noise', d: 0.17, g: 0.85, flt: { t: 'bp', f: [700, 2800], q: 4 } }, { w: 'noise', d: 0.16, g: 0.85, start: 0.16, flt: { t: 'bp', f: [2800, 650], q: 4 } },
    { w: 'saw', f: [180, 620], d: 0.15, g: 0.14, flt: { t: 'lp', f: [1500] } }, { w: 'saw', f: [620, 160], d: 0.15, g: 0.14, start: 0.16, flt: { t: 'lp', f: [1500] } }],
  bassDrop: [{ w: 'sine', f: [120, 34], d: 1.0, g: 1.2, dist: 3 }, { w: 'saw', f: [58, 40], d: 0.9, g: 0.4, flt: { t: 'lp', f: [320] }, dist: 2 },
    { w: 'noise', d: 0.35, g: 0.5, flt: { t: 'lp', f: [1000, 100] } }],
  // La Folle Du Bus and her cats
  meow: [{ w: 'saw', f: [480, 940], d: 0.2, g: 0.22, vib: [9, 0.05], flt: { t: 'bp', f: [1100, 1700], q: 2 } }, { w: 'saw', f: [940, 430], d: 0.32, g: 0.22, start: 0.18, vib: [7, 0.06], flt: { t: 'bp', f: [1700, 1000], q: 2 } }, { w: 'tri', f: [700, 900], d: 0.4, g: 0.1 }],
  yowl: [{ w: 'saw', f: [360, 880], d: 0.55, g: 0.3, vib: [14, 0.1], flt: { t: 'bp', f: [800, 1600], q: 1.5 }, dist: 1.5 }, { w: 'noise', d: 0.4, g: 0.25, flt: { t: 'hp', f: [3000] }, am: [24, 0.5] }],
  hiss: [{ w: 'noise', d: 0.5, g: 0.6, a: 0.04, curve: 1.2, flt: { t: 'hp', f: [3600] }, am: [28, 0.3] }],
  scratch: [{ w: 'noise', d: 0.06, g: 0.7, flt: { t: 'bp', f: [4200, 2400], q: 3 } }, { w: 'noise', d: 0.05, g: 0.6, start: 0.07, flt: { t: 'bp', f: [3800, 2100], q: 3 } }, { w: 'sine', f: [600, 300], d: 0.05, g: 0.2 }],
  broom: [{ w: 'noise', d: 1.0, g: 0.5, a: 0.05, curve: 1, flt: { t: 'bp', f: [500, 1600], q: 1.2 }, am: [11, 0.6] }],
  // --- the seven friends ---
  // TR-808 cowbell: two square waves at 540 and 800 Hz through a band-pass, a fast then slower decay
  cowbell: [{ w: 'square', f: [540, 540], d: 0.32, g: 0.32, curve: 2.2, flt: { t: 'bp', f: [800, 800], q: 2.5 } }, { w: 'square', f: [800, 800], d: 0.32, g: 0.28, curve: 2.2, flt: { t: 'bp', f: [800, 800], q: 2.5 } }, { w: 'square', f: [540, 540], d: 0.04, g: 0.25, flt: { t: 'bp', f: [2600, 2600], q: 1 } }],
  fart: [{ w: 'saw', f: [95, 70], d: 0.55, g: 0.42, a: 0.02, curve: 1.2, vib: [26, 0.18], flt: { t: 'lp', f: [600, 300], q: 2 }, dist: 1.4 }, { w: 'noise', d: 0.45, g: 0.18, flt: { t: 'lp', f: [400, 200] }, am: [30, 0.7] }],
  flame: [{ w: 'noise', d: 0.3, g: 0.35, a: 0.03, curve: 1, flt: { t: 'bp', f: [700, 1400], q: 0.8 }, am: [17, 0.4] }],
  flameL: [{ w: 'noise', d: 0.9, g: 0.5, a: 0.06, curve: 1, flt: { t: 'lp', f: [1800, 900], q: 0.7 }, am: [13, 0.35] }, { w: 'sine', f: [90, 60], d: 0.6, g: 0.2 }],
  sizzle: [{ w: 'noise', d: 0.3, g: 0.28, curve: 1.4, flt: { t: 'hp', f: [4200, 4200] }, am: [40, 0.5] }],
  glug: [0, 1, 2, 3].map((i) => ({ w: 'sine', f: [220, 480], d: 0.12, g: 0.35, start: i * 0.15, curve: 2 })),
  clink: [{ w: 'sine', f: [2400, 2300], d: 0.25, g: 0.3, curve: 2.5 }, { w: 'sine', f: [3500, 3400], d: 0.18, g: 0.2, curve: 2.5 }, { w: 'noise', d: 0.04, g: 0.3, flt: { t: 'hp', f: [3000] } }],
  kiss: [{ w: 'sine', f: [500, 1400], d: 0.14, g: 0.3, curve: 1 }, { w: 'noise', d: 0.05, g: 0.3, start: 0.12, flt: { t: 'bp', f: [2500, 2500], q: 2 } }],
  heart: [{ w: 'tri', f: [660, 880], d: 0.18, g: 0.28, curve: 1.6 }, { w: 'tri', f: [990, 1320], d: 0.2, g: 0.2, start: 0.08, curve: 1.6 }],
  bark: [{ w: 'saw', f: [520, 300], d: 0.12, g: 0.4, flt: { t: 'bp', f: [900, 700], q: 1.6 }, dist: 1.6 }, { w: 'saw', f: [480, 280], d: 0.14, g: 0.36, start: 0.16, flt: { t: 'bp', f: [850, 650], q: 1.6 }, dist: 1.6 }],
  skate: [{ w: 'noise', d: 0.3, g: 0.25, a: 0.05, curve: 1, flt: { t: 'lp', f: [500, 500] }, am: [22, 0.3] }],
  kickflip: [{ w: 'noise', d: 0.05, g: 0.5, flt: { t: 'bp', f: [1800, 1800], q: 2 } }, { w: 'sine', f: [300, 180], d: 0.08, g: 0.3 }, { w: 'noise', d: 0.05, g: 0.4, start: 0.18, flt: { t: 'bp', f: [1500, 1500], q: 2 } }],
  sample: [{ w: 'square', f: [196, 196], d: 0.09, g: 0.25, flt: { t: 'lp', f: [1600, 900] } }, { w: 'square', f: [247, 247], d: 0.09, g: 0.22, start: 0.1, flt: { t: 'lp', f: [1600, 900] } }, { w: 'sine', f: [110, 55], d: 0.2, g: 0.35 }],
  sob: [{ w: 'tri', f: [520, 380], d: 0.35, g: 0.25, vib: [9, 0.06], curve: 1 }, { w: 'tri', f: [480, 330], d: 0.4, g: 0.22, start: 0.4, vib: [9, 0.06], curve: 1 }],
  vape: [{ w: 'noise', d: 0.9, g: 0.25, a: 0.25, curve: 1, flt: { t: 'bp', f: [1200, 700], q: 0.7 } }],
  carpet: [{ w: 'noise', d: 0.7, g: 0.3, a: 0.1, curve: 1, flt: { t: 'bp', f: [400, 1400], q: 1 } }, { w: 'tri', f: [440, 880], d: 0.5, g: 0.12 }],
  couscous: [{ w: 'noise', d: 0.35, g: 0.35, curve: 1.6, flt: { t: 'hp', f: [2500, 2500] }, am: [50, 0.6] }, { w: 'sine', f: [180, 90], d: 0.15, g: 0.3 }],
  bounceBall: [{ w: 'sine', f: [160, 90], d: 0.14, g: 0.45, curve: 2 }, { w: 'noise', d: 0.03, g: 0.25, flt: { t: 'bp', f: [1200, 1200] } }],
  clank: [{ w: 'square', f: [430, 410], d: 0.25, g: 0.18, curve: 2.4, flt: { t: 'bp', f: [1500, 1500], q: 3 } }, { w: 'sine', f: [1270, 1250], d: 0.3, g: 0.2, curve: 2.4 }, { w: 'noise', d: 0.05, g: 0.4, flt: { t: 'bp', f: [3000, 3000] } }],
  // Epektase's guitar: an overdriven E5 power chord (E2 B2 E3), a pentatonic shred, the feedback screech
  riff: [82.4, 123.5, 164.8].map((f, i) => ({ w: 'saw', f: [f], d: 0.55, g: 0.26 - i * 0.03, dist: 3, curve: 1.2, flt: { t: 'lp', f: [2600, 1200] } }))
    .concat([{ w: 'noise', d: 0.03, g: 0.4, flt: { t: 'bp', f: [2500] } }]),
  powerchord: [82.4, 123.5, 164.8].map((f, i) => ({ w: 'saw', f: [f, f * 0.995], d: 1.0, g: 0.3 - i * 0.04, dist: 3.5, curve: 1.1, vib: [5, 0.004], flt: { t: 'lp', f: [3200, 900] } }))
    .concat([{ w: 'sine', f: [82.4, 78], d: 0.8, g: 0.6, dist: 2 }, { w: 'noise', d: 0.05, g: 0.5, flt: { t: 'bp', f: [2200] } }]),
  shred: [659, 784, 880, 988, 1175, 988, 880, 1175, 1319, 1175, 1568, 1319].map((f, i) => ({ w: 'saw', f: [f], d: 0.09, g: 0.16, start: i * 0.07, dist: 3, vib: [9, 0.01], flt: { t: 'lp', f: [3800] } })),
  note: [{ w: 'saw', f: [880, 870], d: 0.15, g: 0.16, dist: 3, vib: [8, 0.01], flt: { t: 'lp', f: [3600] } }],
  larsen: [{ w: 'sine', f: [1400, 2600], d: 1.2, g: 0.22, a: 0.3, curve: 0.8, vib: [7, 0.03], dist: 4 }, { w: 'saw', f: [82.4], d: 1.0, g: 0.16, dist: 3, flt: { t: 'lp', f: [900] } },
    { w: 'sine', f: [2900, 3100], d: 1.0, g: 0.07, start: 0.2, am: [13, 0.5] }],
  silk: [{ w: 'noise', d: 0.22, g: 0.4, a: 0.04, curve: 1.4, flt: { t: 'bp', f: [2500, 5000], q: 1.2 } }],
  // PPROD: the keyboard rattling, a bug popping out of the PC (a little 8-bit blip), the Windows-ish error chord
  typing: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => ({ w: 'noise', d: 0.025, g: 0.35 + (i % 3) * 0.1, start: i * 0.055 + (i % 2) * 0.012, flt: { t: 'bp', f: [2600 + (i % 4) * 500], q: 2 } })),
  blip: [{ w: 'square', f: [880, 1760], d: 0.07, g: 0.14, flt: { t: 'lp', f: [5000] } }, { w: 'square', f: [1320, 2640], d: 0.06, g: 0.1, start: 0.06 }],
  // ANBUU: the seven notes of the lick (D E F G E C D, a breathy sax-like synth), the holy 808's sub, a wing beat
  ...Object.fromEntries([293.66, 329.63, 349.23, 392.0, 329.63, 261.63, 293.66].map((f, i) => ['lick' + i, [
    { w: 'saw', f: [f], d: i === 6 ? 0.55 : 0.16, g: 0.22, a: 0.012, curve: 1.4, vib: [5.5, 0.006], flt: { t: 'lp', f: [2400, 1100] } },
    { w: 'sine', f: [f * 2], d: i === 6 ? 0.45 : 0.12, g: 0.07, a: 0.01, curve: 1.6 },
    { w: 'noise', d: 0.05, g: 0.06, flt: { t: 'bp', f: [2800], q: 2 } }]])),
  sub808: [{ w: 'sine', f: [62, 41], d: 1.4, g: 1.0, a: 0.005, curve: 0.55, dist: 1.8 }, { w: 'sine', f: [124, 82], d: 0.5, g: 0.25, curve: 1.2 }, { w: 'noise', d: 0.03, g: 0.4, flt: { t: 'hp', f: [3000] } }],
  // a perfect guard: a bright bell (two notes), a crack of air, a deep boom under it
  perfect: [{ w: 'sine', f: [1568, 1568], d: 0.55, g: 0.45, a: 0.002, curve: 1.3 }, { w: 'sine', f: [2349, 2349], d: 0.4, g: 0.28, a: 0.002, curve: 1.6 },
    { w: 'noise', d: 0.12, g: 0.45, flt: { t: 'hp', f: [4500] } }, { w: 'sine', f: [95, 38], d: 0.35, g: 0.9, dist: 2 }],
  // the zoom of a blow that will KO (duels): a rushing wind, a deep boom under it
  kozoom: [{ w: 'noise', d: 0.9, g: 0.55, a: 0.02, curve: 1.1, flt: { t: 'bp', f: [3200, 300], q: 1.4 } }, { w: 'sine', f: [70, 28], d: 0.9, g: 1, dist: 2.2 },
    { w: 'saw', f: [880, 1760], d: 0.25, g: 0.12, flt: { t: 'hp', f: [1200] } }],
  flap: [{ w: 'noise', d: 0.22, g: 0.35, flt: { t: 'bp', f: [900, 400], q: 1.2 }, am: [9, 0.6], curve: 1.2 }],
  // SKANKY: the train's two-tone horn and its rumble, a burst of chatter, a slap bass lick
  horn: [311, 370, 466].map((f, i) => ({ w: 'saw', f: [f, f * 0.98], d: 1.1, g: 0.2 - i * 0.03, a: 0.04, curve: 0.6, vib: [4, 0.006], flt: { t: 'lp', f: [2400, 1500] } })),
  rails: [{ w: 'noise', d: 1.0, g: 0.7, flt: { t: 'lp', f: [700, 300] }, am: [11, 0.7], curve: 0.7 }, { w: 'sine', f: [55, 40], d: 1.0, g: 0.5, curve: 0.8 }],
  blabla: [0, 1, 2, 3, 4, 5].map((i) => ({ w: 'saw', f: [190 + (i * 53) % 90, 150 + (i * 37) % 70], d: 0.06, g: 0.18, start: i * 0.07, flt: { t: 'bp', f: [900 + (i % 3) * 500], q: 3 } })),
  funk: [[82.4, 0], [98, 0.14], [110, 0.21], [123.5, 0.35], [82.4, 0.42]].map(([f, s]) => ({ w: 'saw', f: [f], d: 0.13, g: 0.3, start: s, dist: 1.5, curve: 2.2, flt: { t: 'lp', f: [2600, 500] } })),
  error: [{ w: 'sine', f: [740], d: 0.18, g: 0.3, curve: 2 }, { w: 'sine', f: [587], d: 0.25, g: 0.28, start: 0.12, curve: 2 }, { w: 'tri', f: [370], d: 0.35, g: 0.2, start: 0.12 }],
  guitarHit: [{ w: 'noise', d: 0.05, g: 0.6, flt: { t: 'bp', f: [1500] } }, { w: 'saw', f: [196, 190], d: 0.25, g: 0.16, dist: 2, curve: 2, flt: { t: 'lp', f: [2000, 600] } }, { w: 'sine', f: [150, 60], d: 0.1, g: 0.7 }],
  guitarHitL: [{ w: 'noise', d: 0.1, g: 0.8, dist: 2, flt: { t: 'lp', f: [3500, 400] } }, { w: 'saw', f: [110, 104], d: 0.5, g: 0.22, dist: 3, curve: 1.6, flt: { t: 'lp', f: [2200, 500] } }, { w: 'sine', f: [110, 35], d: 0.3, g: 1, dist: 2 }],
  guitarSmash: [{ w: 'noise', d: 0.18, g: 1, dist: 3, flt: { t: 'lp', f: [5000, 300] } }, { w: 'saw', f: [82.4, 80], d: 0.8, g: 0.26, dist: 3.5, curve: 1.3, flt: { t: 'lp', f: [2600, 400] } },
    { w: 'saw', f: [123.5, 120], d: 0.8, g: 0.22, dist: 3.5, curve: 1.3, flt: { t: 'lp', f: [2600, 400] } }, { w: 'sine', f: [90, 28], d: 0.4, g: 1.2, dist: 2.5 }],
};

// louder for the everyday movement sounds (a factor on the volume each caller asks for)
// Mix in the spirit of Smash Ultimate: the blows and the KO hit hard and clear, the charge of a move is heard, the
// movement sounds (jump, landing...) stay underneath
const SFX_BOOST = {
  jump: 0.85, jump2: 0.85, land: 0.9, thud: 1.5, slip: 1.5, ledge: 1.6, shield: 2, shieldHit: 1.6,
  charge: 1.8,
  hitM: 1.1, hitL: 1.25, punchHeavy: 1.25, guitarSmash: 1.2, grateHeavy: 1.2, parry: 1.3, ko: 1.3, boom: 1.2,
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.vol = { master: 0.8, music: 0.6, sfx: 0.9, voice: 1 };
    this.voice = null;
    this.speaking = 0;
    this.live = [];      // sound effects playing: { name, end }
    this.lastPlay = {};  // name -> last start time
    this.wantMusic = null;
    this.lastCombat = -1;
    this.tracks = probeTracks();
    this.sfxFiles = probeSfx(); // the player's own sound files (assets/sfx/, see sfxfiles.js)
    this.variants = {};    // name -> several files of one sound (hitS1, hitS2...), one is picked at random
    this.lastVariant = {}; // name -> the one played last
    this.fileLast = {};    // voices from the player's files (playFile): last time each one was played
    this.voiceNow = {};    // group -> the voice playing now (playFile)
    this.tracks.ready.then(() => { this.tracksReady = true; if (this.ctx && this.wantMusic) this.playMusic(this.wantMusic, this.wantOpts); });
  }

  // must be called from a user gesture
  unlock() {
    if (this.muted) return;
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); if (this.files) this.files.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12; this.comp.ratio.value = 4; this.comp.attack.value = 0.006; this.comp.release.value = 0.2; // lets the start of a blow through (punch), then holds the pile-ups
    this.sfxBus = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.sfxBus.connect(this.comp);
    this.musicBus.connect(this.master);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);
    // short room reverb for big hits. Its impulse is made at the context's own rate: Safari refuses a convolver
    // buffer at another rate (and an error here must never leave the game without sound)
    this.verbSend = this.ctx.createGain(); this.verbSend.gain.value = 0.25;
    try {
      const sr = this.ctx.sampleRate;
      this.verb = this.ctx.createConvolver();
      const len = Math.floor(sr * 1.6), ir = this.ctx.createBuffer(2, len, sr);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
      this.verb.buffer = ir;
      this.verbSend.connect(this.verb); this.verb.connect(this.comp);
    } catch (e) { console.warn('[World of Bagarre] pas de réverbération :', e && e.message); }
    this.applyVolumes();
    this.music = new Music(this.ctx, this.musicBus);
    this.files = new FilePlayer(this.ctx, this.musicBus);
    this.loadSfxFiles();
    this.pickVoice();
    if (this.wantMusic) this.playMusic(this.wantMusic, this.wantOpts);
  }

  applyVolumes() {
    if (!this.ctx) return;
    for (const b of [this.sfxBus, this.musicBus]) b.gain.cancelScheduledValues(0);
    this.master.gain.value = this.vol.master;
    this.sfxBus.gain.value = this.vol.sfx;
    this.musicBus.gain.value = this.vol.music;
    this.ducked = null;
  }

  // [music, sounds] factors while a voice talks (null: back to normal). Back by itself after a while, in case the
  // browser never tells that the speech ended.
  duck(f) {
    this.ducked = f;
    clearTimeout(this._duckT);
    if (!this.ctx) return;
    const t = this.ctx.currentTime, [m, s] = f || [1, 1];
    this.musicBus.gain.setTargetAtTime(this.vol.music * m, t, f ? 0.06 : 0.35);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx * s, t, f ? 0.06 : 0.35);
    if (f) this._duckT = setTimeout(() => { if (this.ducked === f) this.duck(null); }, 6000);
  }

  // the player's own sound files take the place of the synthesised sounds of the same name; a sound without a file
  // (or a file that cannot be read) keeps its synthesised version
  loadSfxFiles() {
    this.sfxFiles.then((found) => loadSfx(this.ctx, found)).then((all) => {
      for (const [name, bufs] of Object.entries(all)) {
        if (bufs.length > 1) this.variants[name] = bufs; else this.buffers[name] = bufs[0];
      }
    }).catch(() => { /* */ });
  }

  buf(name) {
    const vs = this.variants[name];
    if (vs) { // several files of that sound: one at random, never the same one twice in a row
      let i = Math.floor(Math.random() * vs.length);
      if (i === this.lastVariant[name]) i = (i + 1 + Math.floor(Math.random() * (vs.length - 1))) % vs.length;
      this.lastVariant[name] = i;
      return vs[i];
    }
    if (!this.buffers[name]) {
      const def = S[name];
      if (!def) return null;
      this.buffers[name] = render(this.ctx, def);
    }
    return this.buffers[name];
  }

  sfx(name, pan = 0, gain = 1, variant = 0, verb = 0) {
    if (!this.ctx || !name) return;
    const b = this.buf(name) || this.buf('hitM');
    if (!b) return;
    // limits (see SFX_RULES): no stacking, no machine-gun repeats, a few sounds at a time
    const now = this.ctx.currentTime;
    this.live = this.live.filter((v) => v.end > now);
    const [maxSame, gap] = SFX_RULES[name] || SFX_RULES.default;
    if (this.lastPlay[name] !== undefined && now - this.lastPlay[name] < gap) return;
    let same = 0;
    for (const v of this.live) if (v.name === name) same++;
    if (same >= maxSame) return;
    if (this.live.length >= MAX_VOICES && gain < 1) return;
    const crowd = this.live.length;
    gain *= SFX_BOOST[name] || 1; // movement sounds (jump, landing...) are quiet next to the blows
    gain *= (same ? 0.6 : 1) * (crowd > 4 ? Math.sqrt(4 / crowd) : 1);
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    const rate = (0.95 + Math.random() * 0.1) * (variant ? 1 + (variant - 1) * 0.12 : 1);
    src.playbackRate.value = rate;
    this.lastPlay[name] = now;
    this.live.push({ name, end: now + b.duration / rate });
    const g = this.ctx.createGain();
    g.gain.value = gain;
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); src.connect(g).connect(p).connect(this.sfxBus); if (verb) { const vg = this.ctx.createGain(); vg.gain.value = verb; p.connect(vg).connect(this.verbSend); } }
    else src.connect(g).connect(this.sfxBus);
    src.start();
    src.gainNode = g;
    return src;
  }

  // A sound that only exists as one of the player's files (the voices: choose_<fighter>, micron_hit...).
  // true: there is a file and it was played (or skipped because of `gap` seconds since the last one);
  // false: no file, the caller falls back to its own way (the speech synthesis).
  // `group`: voices of one group never overlap: a new one cuts the one before (a short fade, no click)
  playFile(name, gain = 1, gap = 0, group = '') {
    if (!this.ctx || this.muted || this.vol.voice <= 0) return false;
    const has = this.buffers[name] || this.variants[name];
    const key = name.replace(/\d+$/, ''), now = performance.now() / 1000;
    if (has && gap && this.fileLast[key] !== undefined && now - this.fileLast[key] < gap) return true; // too soon: the voice playing goes on
    if (group) this.stopVoice(group);
    if (!has) return false;
    this.fileLast[key] = now;
    const src = this.sfx(name, 0, gain);
    if (src && group) this.voiceNow[group] = src;
    return true;
  }

  stopVoice(group) {
    const src = this.voiceNow[group];
    if (!src) return;
    this.voiceNow[group] = null;
    try {
      const t = this.ctx.currentTime;
      if (src.gainNode) { src.gainNode.gain.cancelScheduledValues(t); src.gainNode.gain.setTargetAtTime(0, t, 0.015); }
      src.stop(t + 0.08);
    } catch (e) { /* already finished */ }
  }

  hit(name, dmg, kb, pan) {
    const big = kb > 95;
    // the small ticks of a multi-hit (beam rake, grater, scratches): one quiet sound only
    if (dmg < 2.6 && !big) { this.sfx(name, pan, 0.4 + dmg * 0.12); return; }
    this.sfx(name, pan, 0.72 + Math.min(0.4, dmg / 25), 0, big ? 0.45 : 0.06);
    if (dmg > 9) this.sfx(big ? 'splatter' : 'splat', pan, 0.28 + dmg / 45);
    if (big) this.sfx('hitL', pan, 0.5, 0, 0.6);
    if (kb > 150) this.crowd();
  }

  // the elimination (assets/sfx/elimination.ogg) when a fighter is out: layered on top of the KO sound that was there before
  // finishHit (assets/sfx/finishHit.ogg): the blow that kills, at the moment of impact: layered on top of kozoom (fx.js)
  finishHit(pan) { if (this.buffers.finishHit) this.sfx('finishHit', pan, 1.2, 0, 0.3); }
  ko(pan) { if (this.buffers.elimination) this.sfx('elimination', pan, 1.2, 0, 0.3); this.sfx('ko', pan, 1.1, 0, 1); this.sfx('splatter', pan, 0.8); this.sfx('crowd', 0, 0.7, 0, 1); }
  crowd() { this.sfx('crowd', 0, 0.25); }
  countdown(n) { this.sfx('countHi', 0, 1); this.say(['', 'Un', 'Deux', 'Trois'][n] || String(n)); }
  go() { this.sfx('countGo', 0, 1); this.say('Bagarre !', 0.55, 1.1); }
  // the end of a match: the boom, then the commentator shouts the victory line (excited, over everything)
  game(line) { this.sfx('game', 0, 1); this.say(line || 'Game !', line ? 1.3 : 0.5, line ? 1.12 : 0.9, line ? 'comment' : 'voice', 3); }

  pickVoice() {
    if (!window.speechSynthesis) return;
    const choose = () => {
      const vs = speechSynthesis.getVoices();
      this.voice = vs.find((v) => /fr/i.test(v.lang) && /male|thomas|paul|henri|claude/i.test(v.name)) || vs.find((v) => /fr/i.test(v.lang)) || vs[0] || null;
    };
    choose();
    speechSynthesis.onvoiceschanged = choose;
  }

  // the zany commentator (src/audio/commentator.js): never over a fighter's shout, a pause between two lines,
  // a KO (prio 2) may cut a lesser comment
  comment(text, prio = 0, delay = 0) {
    if (!text || !window.speechSynthesis || this.vol.voice <= 0) return;
    if (delay) { clearTimeout(this._ct); this._ct = setTimeout(() => this.comment(text, prio, 0), delay * 1000); return; }
    const busy = speechSynthesis.speaking || speechSynthesis.pending;
    const mine = this.lastKind === 'comment';
    if (busy && !(mine && prio > (this.lastPrio || 0))) return;
    if (mine && performance.now() - (this.lastSay || 0) < [3400, 2200, 700][prio]) return;
    this.say(text, 1.25 + Math.random() * 0.2, 1.18, 'comment', prio);
  }

  say(text, pitch = 0.4, rate = 0.95, kind = 'voice', prio = 3) {
    if (this.muted) return;
    if (!window.speechSynthesis || this.vol.voice <= 0 || !text) return;
    this.lastSay = performance.now(); this.lastKind = kind; this.lastPrio = prio;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      // the speech cannot go above 1: the music and the sounds step back while it talks instead (the commentator most)
      u.lang = 'fr-FR'; u.pitch = pitch; u.rate = rate; u.volume = Math.min(1, this.vol.voice * Math.sqrt(this.vol.master) * 1.25);
      const duck = kind === 'comment' ? [0.25, 0.45] : [0.6, 0.8];
      u.onstart = () => this.duck(duck);
      u.onend = u.onerror = () => { if (this.ducked === duck) this.duck(null); };
      this.duck(duck);
      speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }

  // the player's files (assets/music/, see tracks.js), and nothing else: no procedural song any more (17 Oct 2026),
  // a screen without a file is silent. Ids: menu, title, charsel, options, lobby, results, victory (the fanfare once,
  // then the results); anything else is a fight: the arena's id (its own combat_<id> file, else one of combat1...).
  // The title song (title.ogg) plays on the title, the menus, the character and arena select: the same file from one
  // screen to the next is never restarted (FilePlayer.play keeps it going).
  playMusic(id, opts) {
    const again = this.wantMusic === id;
    this.wantMusic = id; this.wantOpts = opts;
    if (!this.music) return;
    const T = this.tracks;
    let url = null;
    if (this.tracksReady) {
      const N = T.named || {};
      const home = N.title || N.titre || T.menu; // the menus' song
      const SCREEN = { title: N.title || N.titre, charsel: N.title || N.persos, options: N.options || N.title, lobby: N.salon || N.title, bar: N.bar };
      if (id === 'victory') {
        if (N.victoire) {
          if (this.files.playing(N.victoire)) return;
          this.music.stop(0.3);
          this.files.play(N.victoire, true, () => { if (this.wantMusic === 'victory') this.playMusic('results'); });
          return;
        }
        id = 'results';
      }
      if (id in SCREEN) { url = SCREEN[id] || T.menu; if (!url) id = 'menu'; }
      else if (id === 'menu') url = home;
      else if (id === 'results') url = N.resultats || home || null; // after the fanfare: the results song, else the menus'
      else if (N['combat_' + id] || N[ARENA_TRACK[id]]) url = N['combat_' + id] || N[ARENA_TRACK[id]];
      else if (T.combat.length) {
        if (again && this.files.cur && T.combat.includes(this.files.cur.url)) return;
        let i = Math.floor(Math.random() * T.combat.length);
        if (T.combat.length > 1 && i === this.lastCombat) i = (i + 1 + Math.floor(Math.random() * (T.combat.length - 1))) % T.combat.length;
        this.lastCombat = i;
        url = T.combat[i];
      }
    }
    this.music.stop(0.4);
    if (url) { this.files.play(url); return; }
    if (this.tracksReady) this.files.stop(0.4); // (no file for it: silence)
  }
  stopMusic(fade = 0.6) { this.wantMusic = null; if (this.music) this.music.stop(fade); if (this.files) this.files.stop(fade); }
  // song time for the beat (Tung Tung Tung Sahur, the village drum): only the procedural songs know their beat
  musicTime() { return this.files && this.files.cur ? 0 : this.music ? this.music.songTime() : 0; }
}

export const SOUND_NAMES = Object.keys(S);
