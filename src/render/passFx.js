// Effects of the big animation pass (16 Oct 2026): the events the new moves emit (src/sim/chars/*.js) and the extra
// look of their hits (ev.fx). Called by fx.js before its own switch; true = handled. Everything stays small and brief:
// sparks, rings, a word, a sound; nothing covers the fighters.
export function passFx(fx, ev, W) {
  const P = fx.particles, A = fx.audio;
  const pan = (x) => fx.pan(x);
  const say = (t, x, y, c, s = 1) => fx.popups.text(t, x, y, 0, c, s);
  switch (ev.type) {
    case 'hit': {
      // the look of the hit, on top of the generic impact (fx.js goes on with it)
      const x = ev.x, y = ev.y, z = ev.z || 0;
      switch (ev.fx) {
        case 'slap': if ((ev.d || 0) >= 4) say(['PAF !', 'CLAC !', 'PIF !'][ev.seq % 3 || 0], x, y + 0.9, '#ffe6c0', 0.8); break;
        case 'kameBlast': P.shockRing(x, y, z, '#7fd8ff', 0.6, 0.24, true); P.sparks(x, y, z, 12, '#bff0ff', 10, 0.3); break;
        case 'light': if ((ev.d || 0) >= 3) { P.shockRing(x, y, z, '#c8bc80', 0.5, 0.22, true); P.sparks(x, y, z, 10, '#fff8d0', 9, 0.3); } else P.sparks(x, y, z, 2, '#fff8d0', 4, 0.2); break; // (the little ticks: a glint)
        case 'love': for (let i = 0; i < 5; i++) P.burst('heart', x, y, z, 1, i % 2 ? '#ff3a6a' : '#ff8ab4', { speed: 4, g: -2, life: 0.8, s: 0.8 }); break;
        case 'poison': P.burst('drop', x, y, z, 10, '#7cff3a', { speed: 4, g: 4, life: 0.6 }); break;
        case 'water': P.burst('drop', x, y, z, 14, '#8ad8ff', { speed: 5, g: 12, life: 0.6 }); break;
        case 'coffee': P.burst('drop', x, y, z, 10, '#7a4422', { speed: 4, g: 12, life: 0.5 }); P.burst('spark', x, y + 0.2, z, 2, '#efe8e0', { speed: 0.8, vy: 2, g: -2, life: 0.5, s: 1.1 }); break; // Kerrian's hot coffee
        case 'money': P.burst('flake', x, y, z, 10, '#ffd23a', { speed: 6, g: 12, life: 0.7 }); break;
        case 'fire': P.burst('spark', x, y, z, 5, '#ff7a1a', { speed: 4, g: -4, life: 0.3, s: 0.7 }); break;
        case 'dunk': say('DUNK !', x, y + 1, '#ff9a2a', 1.2); break;
        default: break;
      }
      return false;
    }
    // --- Pandrezz ---
    case 'genki': {
      const F = W.fighters[ev.s];
      if (!F) return true;
      say('GENKIDAMA !', F.x, F.y + 3.6, '#bff0ff', 1.3);
      P.shockRing(F.x, F.y + 2.6, 0, '#7fd8ff', 1.0, 0.35, true);
      P.sparks(F.x, F.y + 2.6, 0, 26, '#dff8ff', 12, 0.4);
      fx.rig.shake(0.35);
      if (A) A.sfx('kameFire', pan(F.x), 0.9, 0, 0.75);
      return true;
    }
    // --- Aboueb ---
    case 'reflectorOn': {
      const F = W.fighters[ev.s];
      if (F) { P.shockRing(F.x, F.y + 1, 0, '#7fe8ff', 0.55, 0.2, true); if (A) A.sfx('zapS', pan(F.x), 0.8, 0, 1.4); }
      return true;
    }
    case 'reflectorHit':
      P.sparks(ev.x, ev.y, 0, 22, '#c8f8ff', 12, 0.35);
      P.shockRing(ev.x, ev.y, 0, '#7fe8ff', 0.6, 0.22, true);
      say('RENVOYÉ !', ev.x, ev.y + 0.9, '#7fe8ff', 1.0);
      fx.rig.shake(0.25);
      if (A) A.sfx('zap', pan(ev.x), 1, 0, 1.3);
      return true;
    case 'hairBind':
      P.sparks(ev.x, ev.y, 0, 10, '#e8c890', 6, 0.3);
      say('LIGOTÉ !', ev.x, ev.y + 1.1, '#e8c890', 0.95);
      if (A) A.sfx('whip', pan(ev.x), 0.9, 0, 0.8);
      return true;
    case 'bballRelaunch': {
      const n = ev.n || 1;
      say(n >= 4 ? `x${n} !!!` : `x${n} !`, ev.x, ev.y + 0.9, '#ff9a2a', 0.9 + Math.min(0.6, n * 0.1));
      P.shockRing(ev.x, ev.y, 0, '#ff9a2a', 0.45 + n * 0.08, 0.22, true);
      if (A) A.sfx('bounceBall', pan(ev.x), 1, 0, 1 + n * 0.08);
      return true;
    }
    case 'bballPocket':
      say('Dans la poche.', ev.x, ev.y + 0.8, '#ffd8a0', 0.7);
      if (A) A.sfx('click', pan(ev.x), 0.6);
      return true;
    // --- Tices ---
    case 'capThrow':
      P.sparks(ev.x, ev.y, 0, 8, '#e8d0a0', 7, 0.25);
      if (A) A.sfx('whoosh', pan(ev.x), 0.9, 0, ev.v ? 1.25 : 1.05);
      return true;
    case 'capCatch':
      say('Hop !', ev.x, ev.y + 0.5, '#e8d0a0', 0.7);
      if (A) A.sfx('click', pan(ev.x), 0.7, 0, 1.2);
      return true;
    case 'flameKick':
      P.burst('spark', ev.x, ev.y, 0, 7, '#ff7a1a', { speed: 4, g: -5, life: 0.3, s: 0.7 });
      P.burst('spark', ev.x, ev.y, 0, 4, '#ffd23a', { speed: 2.5, g: -6, life: 0.25, s: 0.6 });
      if (A) A.sfx('flame', pan(ev.x), 0.8, 0, 1.2);
      return true;
    case 'slowed':
      say('RALENTI', ev.x, ev.y + 0.2, '#ffd8a0', 0.8);
      return true;
    case 'poisoned':
      say('EMPOISONNÉ !', ev.x, ev.y + 0.9, '#9aff4a', 0.9);
      P.burst('drop', ev.x, ev.y, 0, 12, '#7cff3a', { speed: 3, vy: 2, g: 6, life: 0.7 });
      return true;
    case 'burnFx':
      if (!ev.p) return false; // the fire: friendsView.js
      if (ev.p === 2) { // hot coffee (Kerrian): brown drops and a little steam
        P.burst('drop', ev.x + (Math.random() - 0.5) * 0.5, ev.y, 0.4, 2, Math.random() < 0.5 ? '#6b3a1e' : '#a0643a', { speed: 1.2, vy: 1.5, g: 6, life: 0.5 });
        P.burst('spark', ev.x + (Math.random() - 0.5) * 0.4, ev.y + 0.3, 0.4, 1, '#e8e2da', { speed: 0.6, vy: 2.5, g: -3, life: 0.6, s: 0.9 });
        return true;
      }
      P.burst('drop', ev.x + (Math.random() - 0.5) * 0.5, ev.y, 0.4, 2, Math.random() < 0.5 ? '#7cff3a' : '#3aa81a', { speed: 1.2, vy: 2.5, g: -2, life: 0.5 });
      return true;
    // --- OMFU ---
    case 'omLift':
      say('SOULEVÉ !', ev.x, ev.y + 0.6, '#9aff7a', 1.0);
      fx.rig.shake(0.2);
      if (A) A.sfx('grab', pan(ev.x), 1, 0, 0.8);
      return true;
    case 'omDig':
      P.dust(ev.x, ev.y + 0.1, 0, 14, '#6a4a2a', 1.2);
      P.burst('chunk', ev.x, ev.y + 0.2, 0, 8, '#5a3e26', { speed: 5, g: 16, life: 0.8, bounce: 0.3 });
      if (A) A.sfx('thud', pan(ev.x), 1, 0, 0.7);
      return true;
    case 'omDirt':
      P.dust(ev.x, ev.y + 0.1, 0, 3, '#6a4a2a', 0.6);
      return true;
    case 'omEmerge':
      P.dust(ev.x, ev.y + 0.1, 0, 18, '#6a4a2a', 1.5);
      P.burst('chunk', ev.x, ev.y + 0.3, 0, 14, '#5a3e26', { speed: 8, g: 16, life: 0.9, bounce: 0.3 });
      say('SURPRISE !', ev.x, ev.y + 2.2, '#ffd23a', 1.1);
      fx.rig.shake(0.35);
      if (A) A.sfx('quake', pan(ev.x), 1, 0, 1.2);
      return true;
    case 'deckBounce':
      P.shockRing(ev.x, ev.y + 0.1, 0, '#7fd8ff', 0.8 + (ev.n || 0) * 0.1, 0.25);
      P.sparks(ev.x, ev.y + 0.1, 0, 10, '#bfe8ff', 8, 0.3);
      if (A) A.sfx('vinylScratch', pan(ev.x), 0.9, 0, 1 + (ev.n || 0) * 0.15);
      say(['BOING !', 'BOOOING !', 'BOOOOING !'][ev.n || 0], ev.x, ev.y + 0.4, '#7fd8ff', 0.8);
      return true;
    // --- Lolobiscotto ---
    case 'fireSpit':
      P.burst('spark', ev.x, ev.y, 0, 8, '#ff7a1a', { speed: 4, g: -4, life: 0.3, s: 0.8 });
      say(ev.c > 0.5 ? 'PFFFOUAAA !' : 'PFFOU !', ev.x, ev.y + 0.7, '#ff9a3a', 0.9 + (ev.c || 0) * 0.4);
      if (A) A.sfx('flameL', pan(ev.x), 1, 0, 1.1);
      return true;
    case 'fireBurst':
      P.shockRing(ev.x, ev.y, 0, '#ff8a2a', ev.small ? 0.4 : 0.65, 0.25, true);
      P.burst('spark', ev.x, ev.y, 0, ev.small ? 5 : 9, '#ffb03a', { speed: 4, g: -5, life: 0.3, s: 0.7 });
      return true;
    case 'bottleSmash':
      P.burst('flake', ev.x, ev.y + 0.1, 0, 14, '#c8e8b0', { speed: 6, g: 16, life: 0.6 });
      P.burst('drop', ev.x, ev.y + 0.1, 0, 14, '#f2e6a0', { speed: 5, vy: 3, g: 14, life: 0.6 });
      say('CRASH !', ev.x, ev.y + 0.8, '#f2e6a0', 1.0);
      if (A) A.sfx('glass', pan(ev.x), 1);
      return true;
    case 'slipFall':
      P.burst('drop', ev.x, ev.y + 0.1, 0, 10, ev.k === 'tears' ? '#8ad8ff' : ev.k === 'poop' ? '#6a3a1a' : '#f2e6a0', { speed: 4, vy: 3, g: 14, life: 0.5 });
      say(ev.k === 'poop' ? 'BEURK !' : 'SPLATCH !', ev.x, ev.y + 1.2, ev.k === 'poop' ? '#c8a070' : '#ffffff', 1.0);
      fx.rig.shake(0.2);
      if (A) A.sfx('slip', pan(ev.x), 1);
      return true;
    case 'slickGone':
      P.burst('drop', ev.x, ev.y + 0.1, 0, 6, ev.k === 'tears' ? '#8ad8ff' : '#f2e6a0', { speed: 2, vy: 2, g: 10, life: 0.4 });
      return true;
    // --- J'san's shiba ---
    case 'petThrow':
      say('VA !', ev.x, ev.y + 0.8, '#ffe08a', 0.9);
      if (A) A.sfx('whoosh', pan(ev.x), 1, 0, 0.9);
      return true;
    case 'petLatch':
      say('CROC !', ev.x, ev.y + 0.6, '#ffe08a', 1.0);
      if (A) A.sfx('chomp', pan(ev.x), 1);
      return true;
    case 'petDrop':
      say('RAPPORTÉ !', ev.x, ev.y + 0.8, '#ffe08a', 0.9);
      if (A) A.sfx('bark', pan(ev.x), 0.8, 0, 1.15);
      return true;
    case 'petShake':
      say('LIBÉRÉ !', ev.x, ev.y + 1, '#ffffff', 0.85);
      return true;
    case 'petYelp':
      say('KAÏ !', ev.x, ev.y + 0.6, '#ffe08a', 0.9);
      P.sparks(ev.x, ev.y, 0, 8, '#ffffff', 6, 0.25);
      if (A) A.sfx('yowl', pan(ev.x), 0.8, 0, 1.4);
      return true;
    case 'petPoop':
      say('plop.', ev.x, ev.y + 0.6, '#c8a070', 0.75);
      if (A) A.sfx('splat', pan(ev.x), 0.6, 0, 0.8);
      return true;
    // --- Nymano ---
    case 'sp404': {
      // the music: soft rings and a few notes floating out of the sampler
      if (ev.on) { if (A) A.sfx('sample', pan(ev.x), 0.9); say('♪ chill ♪', ev.x, ev.y + 1.3, '#9ad8ff', 0.85); }
      // (one thin ring on the floor every 0.4 s, as wide as the zone: never a sheet of light)
      if ((ev.n || 0) % 24 === 0) P.shockRing(ev.x, ev.y - 1.15, 0, '#7fb8ff', 0.36, 0.55);
      if ((ev.n || 0) % 36 === 0) say(Math.random() < 0.5 ? '♪' : '♫', ev.x + (Math.random() - 0.5) * 1.4, ev.y + 0.9, Math.random() < 0.5 ? '#9ad8ff' : '#c8a8ff', 0.8);
      P.burst('spark', ev.x + (Math.random() - 0.5) * 1.2, ev.y + 0.6, 0, 1, '#9ad8ff', { speed: 0.5, vy: 1.4, g: -0.4, life: 0.9, s: 0.6 });
      if (A && !ev.on && (ev.n || 0) % 24 === 0) A.sfx('note', pan(ev.x), 0.35, 0, 0.8 + ((ev.n / 24) % 4) * 0.12);
      return true;
    }
    case 'asleep':
      say('Zzz...', ev.x, ev.y + 0.2, '#c8d8ff', 1.1);
      P.burst('spark', ev.x, ev.y, 0, 6, '#c8d8ff', { speed: 1.2, vy: 1, g: -1, life: 0.8, s: 0.7 });
      if (A) A.sfx('wobble', pan(ev.x), 0.7, 0, 0.7);
      return true;
    case 'snore':
      say(['z', 'Z', 'zZ'][Math.floor(Math.random() * 3)], ev.x + 0.3, ev.y + 0.4, '#c8d8ff', 0.7);
      return true;
    // two attacks (or projectiles) clanked (world.js resolveClanks): a bright clash, the clank, a little jolt
    // SKANKY caught after his fraud (the train): stuck 2.5 s
    case 'stuck': {
      const F = W.fighters[ev.s];
      if (F && F.char === 'skanky') say('CONTRÔLE DES BILLETS !', F.x, F.y + 2.3, '#ffd23a', 1.0);
      return true;
    }
    case 'clank':
      P.sparks(ev.x, ev.y, 0, 12, '#fff6c8', 8, 0.25);
      P.shockRing(ev.x, ev.y, 0, '#ffffff', 0.45, 0.18, true);
      if (A) A.sfx('clank', pan(ev.x), 1);
      fx.rig.shake(0.12);
      return true;
    case 'sob':
      if (!ev.burst) return false; // the usual sob: friendsView.js
      // the flood: two fountains out of the eyes, both sides, and a ripple on the floor
      for (const sd of [-1, 1]) P.burst('drop', ev.x + sd * 0.08, ev.y, 0.4, 18, '#7cc4ff', { speed: 1.6, vx: sd * 6, vy: 3, g: 14, life: 0.7, s: 0.38 });
      P.shockRing(ev.x, ev.y - 1.5, 0, '#4f7f9c', 0.9, 0.3);
      say('OUIIIIIN !', ev.x, ev.y + 0.6, '#8ad8ff', 1.3);
      fx.rig.shake(0.3);
      if (A) A.sfx('sob', pan(ev.x), 1, 0, 0.9);
      return true;
    // --- BIDO ---
    case 'charmed':
      say('SOUS LE CHARME !', ev.x, ev.y + 0.3, '#ff6fb1', 1.15);
      for (let i = 0; i < 8; i++) P.burst('heart', ev.x, ev.y, 0, 1, i % 2 ? '#ff3a6a' : '#ff8ab4', { speed: 3, g: -2, life: 0.9, s: 0.9 });
      fx.rig.shake(0.2);
      if (A) A.sfx('kiss', pan(ev.x), 1);
      return true;
    case 'charmTick':
      P.burst('heart', ev.x + (Math.random() - 0.5) * 0.6, ev.y, 0, 1, Math.random() < 0.5 ? '#ff3a6a' : '#ff8ab4', { speed: 0.6, vy: 1.2, g: -1, life: 0.8, s: 0.7 });
      return true;
    case 'loveWave':
      P.shockRing(ev.x, ev.y - 0.9, 0, '#ff6fb1', 0.3, 0.4);
      P.shockRing(ev.x, ev.y - 0.9, 0, '#ffb0d0', 0.22, 0.5);
      return true;
    case 'ropeCrack':
      if (A) A.sfx('whip', pan(W.fighters[ev.s] ? W.fighters[ev.s].x : 0), 1, 0, 1.1 + (ev.n || 0) * 0.08);
      if (ev.n === 2) { const F = W.fighters[ev.s]; if (F) say('CLAC !', F.x + Math.sin(F.facing) * 2.2, F.y + 1.6, '#ffffff', 0.9); }
      return true;
    // --- Epektase ---
    case 'guitarThrow':
      if (A) A.sfx('powerchord', pan(ev.x), 0.8, 0, 1.2);
      say('VRRRR !', ev.x, ev.y + 1.4, '#ff5a3a', 1.0);
      return true;
    case 'guitarCatch':
      if (A) A.sfx('guitarHit', pan(ev.x), 0.6, 0, 1.3);
      return true;
    case 'broomOn':
      say('EN SELLE !', ev.x, ev.y + 2.2, '#ff5a3a', 1.0);
      P.burst('spark', ev.x, ev.y + 0.5, 0, 12, '#ff8a3a', { speed: 4, g: -2, life: 0.4, s: 0.8 });
      if (A) A.sfx('riff', pan(ev.x), 1);
      return true;
    case 'broomTrail':
      P.burst('spark', ev.x, ev.y, 0, 2, Math.random() < 0.5 ? '#ff5a3a' : '#ffb03a', { speed: 1, g: -1, life: 0.5, s: 0.6 });
      return true;
    // --- PPROD ---
    case 'loot':
      if (A) A.sfx(ev.n === 4 ? 'clank' : 'cash', pan(ev.x), 0.7, 0, 1 + (ev.n || 0) * 0.08);
      if (ev.n === 4) say('LINGOT !', ev.x, ev.y + 0.7, '#ffd23a', 0.9);
      return true;
    case 'pcBoom':
      P.shockRing(ev.x, ev.y, 0, '#ffb03a', 1.0, 0.3);
      P.sparks(ev.x, ev.y, 0, 24, '#ffd080', 12, 0.35);
      P.burst('chunk', ev.x, ev.y, 0, 10, '#d8d0bc', { speed: 7, g: 16, life: 0.8, bounce: 0.3 });
      P.burst('spark', ev.x, ev.y, 0, 8, '#7fd8ff', { speed: 6, g: 4, life: 0.35 });
      say('BLUE SCREEN !', ev.x, ev.y + 1, '#7fd8ff', 1.1);
      fx.rig.shake(0.45);
      if (A) A.sfx('boom', pan(ev.x), 1);
      return true;
    case 'pizzaEat':
      say(`MIAM ! ${ev.n}/5`, ev.x, ev.y + 0.4, '#ffb03a', 0.9 + ev.n * 0.08);
      if (A) A.sfx('gulp', pan(ev.x), 1, 0, 1.2 - ev.n * 0.08);
      return true;
    case 'pizzaBurst':
      P.shockRing(ev.x, ev.y, 0, '#ff6a2a', 0.9, 0.32, true);
      P.burst('chunk', ev.x, ev.y, 0, 14, '#e8a040', { speed: 8, g: 16, life: 0.8, bounce: 0.3 });
      P.sparks(ev.x, ev.y, 0, 30, '#ffd080', 14, 0.4);
      say('IL A ÉCLATÉ !', ev.x, ev.y + 1, '#ff6a2a', 1.4);
      fx.rig.shake(0.7);
      if (A) A.sfx('boom', pan(ev.x), 1, 0, 0.8);
      return true;
    case 'pprodFlat':
      P.shockRing(ev.x, ev.y - 0.4, 0, '#c8d0dc', 0.6, 0.25);
      say('SPLOTCH !', ev.x, ev.y + 0.6, '#ffffff', 0.9);
      if (A) A.sfx('wobble', pan(ev.x), 1);
      return true;
    // --- SKANKY ---
    case 'funkCaught':
      say('ÇA DANSE !', ev.x, ev.y + 0.3, '#ff8a2a', 1.0);
      for (let i = 0; i < 3; i++) say(i % 2 ? '♪' : '♫', ev.x + (i - 1) * 0.5, ev.y + 0.6 + i * 0.15, '#ffb03a', 0.8);
      return true;
    // --- ANBUU ---
    case 'holyFire': {
      const c = ev.c || 0;
      fx.rig.shake(0.25 + c * 0.5);
      P.shockRing(ev.x, ev.y, ev.z, '#ffe080', 0.4 + c * 0.45, 0.28, true);
      P.sparks(ev.x, ev.y, ev.z, 16 + Math.floor(c * 20), '#fff4c8', 9 + c * 6);
      say(ev.up ? 'LUMIÈRE !' : 'HAAA !', ev.x, ev.y + 1.2, '#ffe080', 1 + c * 0.5);
      if (A) A.sfx('kameFire', pan(ev.x), 0.7, 0, 1.25);
      return true;
    }
    case 'orbPop':
      P.shockRing(ev.x, ev.y, 0, '#ffe080', 0.5, 0.24, true);
      P.sparks(ev.x, ev.y, 0, 14, '#fff4c8', 9, 0.3);
      if (A) A.sfx('zap', pan(ev.x), 0.9, 0, 1.3);
      return true;
    case 'wingSlam':
      P.burst('flake', ev.x, ev.y + 0.3, 0, 16, '#ffffff', { speed: 6, g: 4, life: 0.8 });
      P.shockRing(ev.x, ev.y + 0.1, 0, '#fff0b0', 0.9, 0.3);
      fx.rig.shake(0.3);
      if (A) A.sfx('flap', pan(ev.x), 1, 0, 0.8);
      return true;
    case 'psyWave':
      P.shockRing(ev.x, ev.y, 0, '#a088d8', 0.45, 0.25, true);
      P.sparks(ev.x, ev.y, 0, 10, '#e0d0ff', 6, 0.3);
      if (A) A.sfx('wave', pan(ev.x), 0.8, 0, 1.3);
      return true;
    case 'levitate':
      say('LÉVITE !', ev.x, ev.y + 0.2, '#c8a8ff', 0.95);
      return true;
    case 'skyWarn':
      P.shockRing(ev.x, ev.y + 0.05, 0, '#ff5a5a', 0.25, 0.7);
      say('!', ev.x, ev.y + 0.6, '#ff5a5a', 1.2);
      return true;
    case 'speakerCrash':
      P.shockRing(ev.x, ev.y, 0, '#ffd23a', 1.2, 0.35);
      P.burst('chunk', ev.x, ev.y, 0, 12, '#3a3a40', { speed: 8, g: 16, life: 0.8, bounce: 0.3 });
      P.sparks(ev.x, ev.y, 0, 26, '#fff4c8', 12, 0.35);
      say('BOOM !', ev.x, ev.y + 1, '#ffd23a', 1.3);
      fx.rig.shake(0.6);
      if (A) A.sfx('sub808', pan(ev.x), 1);
      return true;
    // --- Kerrian ---
    case 'heal': // the insulin: his % goes down
      say('−' + ev.n + ' %', ev.x, ev.y, '#5aff9a', 1.1);
      P.burst('spark', ev.x, ev.y - 0.6, 0, 12, '#9affc8', { speed: 3, vy: 3, g: -2, life: 0.6, s: 0.8 });
      P.shockRing(ev.x, ev.y - 0.9, 0, '#5aff9a', 0.6, 0.25, true);
      if (A) A.sfx('perfect', pan(ev.x), 0.5, 0, 1.4);
      return true;
    case 'insulin':
      say('INSULINE', ev.x, ev.y + 0.9, '#ffb000', 0.8);
      if (A) A.sfx('hitS', pan(ev.x), 0.4, 0, 1.8);
      return true;
    case 'diabetes': // the handicap: 15 % every 30 s
      say('DIABÈTE ! +' + ev.n + ' %', ev.x, ev.y, '#ff4a6a', 1.15);
      P.burst('flake', ev.x, ev.y - 0.4, 0, 12, '#ffffff', { speed: 3, vy: 2, g: 6, life: 0.8 }); // sugar
      fx.rig.shake(0.15);
      if (A) A.sfx('hitM', pan(ev.x), 0.6, 0, 0.7);
      return true;
    case 'selfHurt':
      say('+' + ev.n + ' %', ev.x, ev.y, '#ff8a8a', 0.7);
      return true;
    case 'hollowDash': { // a nervous dash up: a black streak and a burst of dark smoke at his feet
      for (let i = 0; i < 10; i++) P.burst('spark', ev.x + (Math.random() - 0.5) * 0.5, ev.y + 0.2 + i * 0.25, 0.2, 1, i % 2 ? '#1a1a22' : '#e8ecff', { speed: 0.6, vy: -4, g: 0, life: 0.3, s: 1.4 });
      P.shockRing(ev.x, ev.y + 0.2, 0, '#e8ecff', 0.5, 0.18, true);
      if (A) A.sfx('whoosh', pan(ev.x), 0.8, 0, ev.n ? 1.25 : 1.05);
      return true;
    }
    case 'coffee': { // the jet of hot coffee: brown drops thrown forward, a little steam
      for (let i = 0; i < 8; i++) {
        const vx = Math.sin(ev.a) * (7 + Math.random() * 6), vy = (Math.random() - 0.1) * 3;
        P.burst('drop', ev.x + Math.sin(ev.a) * 0.7, ev.y, 0.3, 1, i % 2 ? '#a0643a' : '#c8884a', { speed: 0.6, vx, vy, g: 9, life: 0.4, s: 1.8 });
      }
      for (let i = 0; i < 2; i++) P.burst('spark', ev.x + Math.sin(ev.a) * (0.9 + i * 0.8), ev.y + 0.2, 0.3, 1, '#f4efe8', { speed: 0.8, vy: 2, g: -2, life: 0.55, s: 1.6 });
      return true;
    }
    case 'scalded':
      say('BRÛLANT !', ev.x, ev.y + 0.9, '#c87a3a', 0.9);
      if (A) A.sfx('sizzle', pan(ev.x), 0.7);
      return true;
    default: return false;
  }
}
