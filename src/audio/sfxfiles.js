// Your own sound effects, in assets/sfx/ (see assets/sfx/README.md):
//   hitS.ogg, hitM.ogg, jump.ogg ...   one file per sound, named like the sound (the names are listed below)
// A sound that has a file there is played from that file instead of the built-in synthesised one. A missing file is
// fine: nothing changes for that sound. The folder cannot be listed on a static host (GitHub Pages), so each name is
// asked for in turn (ogg first, then mp3, then wav), like the music files in tracks.js.
// A few sounds (SFX_VARIANTS) can have several versions: hitS1.ogg, hitS2.ogg, hitS3.ogg... one of them is played at
// random each time (numbered without a gap, up to MAX_VARIANTS).
const DIR = 'assets/sfx/';

// the sounds that can be replaced by a file (names of the sounds in audio.js); add a name here to open another one
export const SFX_FILES = [
  // blows
  'hitS', 'hitM', 'hitL', 'punchHeavy', 'slap', 'whoosh', 'pummel',
  // defence, grabs, KO
  'shield', 'shieldHit', 'parry', 'grab', 'tech', 'ko', 'glass', 'elimination', 'finishHit',
  // movement
  'jump', 'jump2', 'land', 'thud', 'slip', 'ledge', 'respawn',
  // menus, countdown, match
  'click', 'menuMove', 'menuOk', 'menuBack', 'countHi', 'countGo', 'game', 'crowd',
  // general
  'boom', 'quake', 'charge', 'flash', 'poof',
  // ANBUU: the seven notes of the lick, the holy 808, the wings
  'lick0', 'lick1', 'lick2', 'lick3', 'lick4', 'lick5', 'lick6', 'sub808', 'flap',
  // PIKA, ANBUU: the electric zap
  'zap', 'zapS',
  // sounds of the fighters' moves / events that now have a file
  'whip', 'couscous', 'bounceBall', 'carpet', 'guitarHit', 'larsen', 'note', 'powerchord', 'shred', 'stamp', 'thunder',
  // EPEKTASE: the riff when a big move is released, the smash of the guitar on impact
  'riff', 'guitarSmash',
  // more moves: Catlady (broom, hiss, meow, yowl), Bido (clank, kiss), Bubba (shotgun, fizz, splat)
  'broom', 'clank', 'fizz', 'hiss', 'kiss', 'meow', 'shotgun', 'splat', 'yowl',
  // MICRON's voice: when he is hit (micron_hurt1, 2...), when he hits
  'micron_hit', 'micron_hurt',
  // the voice said when a fighter is picked in the menu (instead of the speech synthesis)
  'choose_frog', 'choose_micron', 'choose_bubba', 'choose_parmesan', 'choose_pika', 'choose_tung', 'choose_shark',
  'choose_catlady', 'choose_pandrezz', 'choose_aboueb', 'choose_tices', 'choose_omfu', 'choose_lolobiscotto', 'choose_jsan',
  'choose_nymano', 'choose_bido', 'choose_epektase', 'choose_pprod', 'choose_skanky', 'choose_anbuu',
];

// the sounds heard again and again, which can have several versions (hitS1, hitS2, hitS3...) instead of one file
export const SFX_VARIANTS = ['hitS', 'hitM', 'hitL', 'punchHeavy', 'slap', 'whoosh', 'jump', 'land', 'pummel', 'micron_hurt', 'zapS'];
const MAX_VARIANTS = 6;

// the formats this browser plays, best first: Safari often cannot play .ogg (Vorbis), then only mp3 and wav count
function formats() {
  let ogg = false;
  try { ogg = !!new window.Audio().canPlayType('audio/ogg; codecs="vorbis"'); } catch (e) { /* */ }
  return ogg ? ['ogg', 'mp3', 'wav'] : ['mp3', 'wav'];
}

async function exists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    if (r.ok) return true;
    if (r.status === 405 || r.status === 501) { // a server without HEAD
      const g = await fetch(url, { headers: { Range: 'bytes=0-1' }, cache: 'no-cache' });
      return g.ok;
    }
  } catch (e) { /* offline / blocked */ }
  return false;
}

// the first file of that name in a playable format
async function findFile(base, fmts) {
  for (const f of fmts) {
    const url = DIR + base + '.' + f;
    if (await exists(url)) return url;
  }
  return null;
}

// { name: [url, ...] } for every sound that has a file. For the names in SFX_VARIANTS, hitS1, hitS2... are other
// versions of the same sound, found one after the other until one is missing.
export function probeSfx(names = SFX_FILES) {
  const fmts = formats();
  return Promise.all(names.map(async (name) => {
    const urls = [];
    const one = await findFile(name, fmts);
    if (one) urls.push(one);
    if (SFX_VARIANTS.includes(name)) {
      const nums = [];
      for (let n = 1; n <= MAX_VARIANTS; n++) {
        if (SFX_FILES.includes(name + n)) continue; // jump2 is the double jump's own sound, not a version of jump
        const url = await findFile(name + n, fmts);
        if (!url) break;
        nums.push(url);
      }
      if (nums.length) { urls.length = 0; urls.push(...nums); } // numbered versions replace the plain file (so land.ogg is not played twice as often)
    }
    return urls.length ? [name, urls] : null;
  })).then((list) => Object.fromEntries(list.filter(Boolean)));
}

// decodes the files found: { name: [AudioBuffer, ...] }. A file that cannot be read is left out (a sound with no
// readable file keeps its synthesised version)
export async function loadSfx(ctx, found) {
  const out = {};
  await Promise.all(Object.entries(found).map(async ([name, urls]) => {
    const bufs = [];
    for (const url of urls) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        bufs.push(await ctx.decodeAudioData(await r.arrayBuffer()));
      } catch (e) { console.warn('[World of Bagarre] son illisible :', url, e && e.message); }
    }
    if (bufs.length) out[name] = bufs;
  }));
  return out;
}
