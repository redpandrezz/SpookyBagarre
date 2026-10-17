// Juice: turns simulation events into blood, sparks, shakes, flashes, slow-mo feel, popup texts, rumble and sounds.
import * as THREE from 'three';
import { COLORS } from '../sim/constants.js';
import { CHARS } from '../sim/chars/index.js';
import { commentate, victoryLine } from '../audio/commentator.js';
import { friendFx } from './friendsView.js';
import { passFx } from './passFx.js';
import { hitShield, burstShield } from './shield.js';

// la teinte des lignes de vitesse vidéo d'un KO : la couleur du perso qui frappe, sinon une couleur tirée au hasard
const SPEED_TINTS = ['#ffcc33', '#ff5a5a', '#5ad0ff', '#c070ff', '#6aff9a', '#ff7ad8'];
const _sv = new THREE.Vector3(), _tc = new THREE.Color(), _hsl = {};
function speedTint(striker) {
  const def = striker && CHARS[striker.char];
  if (def && def.color) {
    _tc.set(def.color); _tc.getHSL(_hsl);
    if (_hsl.s > 0.3 && _hsl.l > 0.2 && _hsl.l < 0.92) return _tc.setHSL(_hsl.h, 1, 0.55).getHex();
  }
  return SPEED_TINTS[Math.floor(Math.random() * SPEED_TINTS.length)];
}

const v3 = new THREE.Vector3();

export class FX {
  constructor({ renderer, rig, particles, decals, views, popups, audio, rumble, settings, gore }) {
    Object.assign(this, { renderer, rig, particles, decals, views, popups, audio, rumble, settings, gore });
    this.blood = settings ? settings.blood ?? 3 : 3;
  }

  view(s) { return this.views[s]; }

  handle(ev, W) {
    const P = this.particles, R = this.renderer, A = this.audio;
    const B = this.blood;
    const bloodColor = B === 1 ? '#c81818' : '#7a0008';
    if (this.settings ? this.settings.commentator !== false : true) commentate(ev, W, A);
    if (passFx(this, ev, W)) return; // the big pass's moves (passFx.js)
    if (friendFx(this, ev, W)) return;
    switch (ev.type) {
      case 'hit': {
        const kb = ev.kb || 0, d = ev.d || 0;
        const V = this.view(ev.s), Av = ev.a >= 0 ? this.view(ev.a) : null;
        if (A) { // MICRON's own voice (assets/sfx/micron_hurt*.ogg, micron_hit.ogg): when he is hit, when he hits (not on every blow)
          const VF = W.fighters[ev.s], AF = ev.a >= 0 ? W.fighters[ev.a] : null;
          if (VF && VF.char === 'micron') { if (Math.random() < 0.3) A.playFile('micron_hurt', 1.3, 9, 'micron'); }
          else if (AF && AF.char === 'micron') { if (Math.random() < 0.25) A.playFile('micron_hit', 1.3, 12, 'micron'); }
        }
        const dir = [ev.lx || 0, ev.ly || 0, ev.lz || 0];
        const m = Math.hypot(dir[0], dir[1], dir[2]) || 1;
        const nd = [dir[0] / m, dir[1] / m, dir[2] / m];
        const strong = kb > 95 || ev.smash;
        // (the little repeated hits of a multi-hit move barely flash: the victim must stay readable)
        if (V && ev.nf) V.flash('#ff9a9a', 0.07); // (a hit without flinch: the flash tells it hurt)
        else if (V) { if (strong || d >= 2.5) V.flash(strong ? '#ffffff' : '#ffd0c0', strong ? 0.14 : 0.08); else if (d >= 1.6) V.flash('#ffd0c0', 0.03); V.impulse(strong ? -3.5 : d < 2.5 ? -0.7 : -1.6); }
        if (Av) Av.impulse(1.2);
        // the models touch: the attacker's limb goes onto the victim's body where it was hit (src/render/rig/reach.js)
        const AF = ev.a >= 0 ? W.fighters[ev.a] : null, VF = W.fighters[ev.s];
        if (Av && Av.rigModel && V && AF && VF && AF.state === 'move' && (!ev.m || !/^proj:|^ring:|^cloud:/.test(ev.m))) {
          Av.rigModel.contact = { seq: AF.mseq, move: AF.move, V, dy: Math.max(0.35, Math.min(VF.height - 0.2, (ev.y ?? VF.y + 1) - VF.y)), t: performance.now() };
        }
        this.lastHit = this.lastHit || {};
        this.lastHit[ev.s] = nd;
        // the one who hits close up gets the victim's blood on its own body (bloodSkin.js, render only)
        if (Av && B >= 2 && (!ev.m || !/^proj:|^ring:|^cloud:/.test(ev.m))) Av.splat = Math.min(1, (Av.splat || 0) + d / 45 * (ev.b ?? 1));
        if (B > 0) {
          // a spurt along the launch, not a red cloud: it must never hide the fighters
          const n = Math.min(90, Math.floor((3 + d * 1.2) * (ev.b ?? 1) * (B === 3 ? 2.6 : B === 2 ? 1.5 : 0.4))); // lots of blood (gore, 16 Oct 2026)
          P.blood(ev.x, ev.y, ev.z, nd, n, 0.8 + Math.min(1.4, kb / 100));
          if ((strong || d >= 8) && B >= 2) P.blood(ev.x, ev.y, ev.z, [-nd[0], 0.5, -nd[2]], Math.floor(n * 0.5), 0.9);
          if (this.decals && B >= 2 && d > 2) this.decals.splat(ev.x + nd[0] * 0.8, ev.z + nd[2] * 0.8, 0.6 + d * 0.05, bloodColor, true, ev.y, [nd[0] * 6, nd[2] * 6]);
          // the big blows (gore.js): a jet that pulses out of the wound; at « À FOISON », a gush of real liquid
          // (heavy gobs merged into one surface), else more heavy drops
          if (this.gore && B >= 2 && (strong || d >= 10 || (B === 3 && kb > 70)) && (ev.b ?? 1) > 0.4) {
            const pw = Math.min(1.5, Math.max(0.6, kb / 120));
            this.gore.jet(V, ev.x, ev.y, ev.z, nd, pw);
            if (!(B === 3 && this.gore.gush(ev.x, ev.y, ev.z, nd, pw))) P.blood(ev.x, ev.y, ev.z, [nd[0] * 0.5, 0.3, nd[2] * 0.5], Math.floor(8 + pw * 6), 0.7);
          }
        }
        // the impact: one crisp sprite where the blow lands (a burst, a jagged explosion on the strong ones, a slash
        // for the claws and blades, lightning for the zaps), turned along the launch; a few sparks; no cloud
        const ang = Math.atan2(nd[1], nd[0]);
        const sz = 0.42 + Math.min(0.85, d * 0.032 + kb / 320);
        const sharp = /slash|scratch|chomp|whip|grate|cut|stab/.test(ev.sfx || '');
        const kind = ev.fx === 'zap' ? 'zap' : sharp ? 'slash' : strong ? 'heavy' : 'burst';
        const tint = ev.beat ? '#ffe070' : ev.fx === 'cheese' ? '#fff0b0' : ev.fx === 'fire' ? '#ffb070' : null;
        // the animations of the creator's VFX video (vidFx.js), one per caption: « Physical Hit » for the blows that count,
        // « Spike Hit » for a launch toward the ground, « Sword Slash Hit » for claws and blades, « Alternate Physical Hit »
        // for the light ones; the colour follows the attacker's slot (« Alternate Colors »)
        const spike = nd[1] < -0.55 && (strong || d >= 6);
        const vid = !!this.vid && this.vid.hit({ x: ev.x, y: ev.y, z: ev.z, ang, sz, d, kb, strong, sharp, spike, fx: ev.fx, slot: ev.a });
        // Smash Ultimate style impacts (ssbuFx.js): flame horns, flash, rings, shards, lightning on the electric ones
        // (kept as the fallback while the video's sheets load, or if they are missing)
        const ssbu = !vid && this.ssbu && !sharp && (strong || d >= 3.5);
        if (vid) { /* drawn by vidFx.js */ } else if (ssbu) {
          const tier = kb > 190 ? 2 : (strong || d >= 9) ? 1 : 0;
          const style = ev.fx === 'zap' ? 'elec' : ev.fx === 'light' ? 'magic' : ev.fx === 'fire' ? 'fire' : 'normal';
          this.ssbu.hit(ev.x, ev.y, ev.z, { ang, tier, style, k: 0.75 + Math.min(0.45, kb / 400) });
        } else P.hit.spawn(kind, ev.x, ev.y, ev.z, sz * (kind === 'slash' ? 1.3 : 1), kind === 'slash' ? ang - 0.8 : ang + (ev.seq % 7) * 0.5, strong ? 0.2 : 0.14, tint);
        if (strong && !ssbu && !vid) P.hit.spawn('ring', ev.x, ev.y, ev.z, sz * 1.25, 0, 0.2);
        // more variety on top (the juice pass): a comic burst on the big ones, a crack on the huge ones, little stars
        // on the medium ones, a blood splat when it bleeds; all brief, all small next to the fighters
        if (kb > 140 && !sharp && !ssbu && !vid) P.hit.spawn('pow', ev.x, ev.y, ev.z, sz * 1.15, (Math.random() - 0.5) * 0.6, 0.2);
        if (kb > 190 && !ssbu && !vid) P.hit.spawn('crack', ev.x, ev.y, ev.z, sz * 1.4, Math.random() * 6, 0.22);
        if (!strong && d >= 5 && (ev.seq % 2) === 0 && !vid) P.hit.spawn('stars', ev.x + nd[0] * 0.3, ev.y + 0.2, ev.z, sz * 0.8, Math.random() * 6, 0.22, null, { vy: 1.2, spin: 2 });
        if (sharp && d >= 4 && !vid) P.hit.spawn('swipe', ev.x, ev.y, ev.z, sz * 1.2, ang, 0.14, null, { stretch: 1.3 });
        if (B >= 2 && d >= 6 && (ev.b ?? 1) > 0.4) P.hit.spawn('splat', ev.x + nd[0] * 0.2, ev.y, ev.z, sz * (0.7 + B * 0.12), ang, 0.22, B === 1 ? '#ff6060' : null, { vx: nd[0] * 1.5, vy: nd[1] * 1.5 - 1 });
        // a launch that will send far: a comet streak along the launch
        if (kb > 110 && !vid) P.hit.spawn('streak', ev.x + nd[0] * sz * 0.7, ev.y + nd[1] * sz * 0.7, ev.z, sz * 1.5, ang, 0.24, null, { stretch: 1.6 });
        const sparkC = ev.fx === 'zap' ? '#a8f0ff' : ev.fx === 'cheese' ? '#ffe28a' : ev.beat ? '#ffd23a' : '#fff4c0';
        if (strong || !vid) P.sparks(ev.x, ev.y, ev.z, strong ? 10 : 4, sparkC, strong ? 11 : 7, 0.25); // the little and medium hits: the gold animation alone
        // 3D shards thrown along the launch (particles.js shards): none for the little hits, a few for the medium ones, a
        // sheaf for the strong ones; the attacker's colour (the pool holds 160, the oldest go first)
        const nSh = strong ? Math.min(14, 6 + Math.floor(kb / 40)) : d >= 5 ? 4 : d >= 2.5 ? 2 : 0;
        if (nSh && !sharp && (strong || !vid)) P.shards(ev.x, ev.y, ev.z, nd, nSh, ev.a >= 0 ? COLORS[ev.a] : '#ffd080', 0.8 + Math.min(0.8, kb / 200));
        if (ev.fx === 'cheese') P.burst('flake', ev.x, ev.y, ev.z, 10, '#f2d77a', { speed: 5 });
        if (ev.fx === 'slime') P.burst('drop', ev.x, ev.y, ev.z, 20, '#9aff4a', { speed: 6 });
        if (ev.fx === 'ketchup') { P.burst('drop', ev.x, ev.y, ev.z, 26, '#d0141a', { speed: 8 }); P.burst('drop', ev.x, ev.y, ev.z, 14, '#f0c020', { speed: 7 }); }
        if (ev.fx === 'stamp') { this.popups.text('49.3 !', ev.x, ev.y + 1.5, ev.z, '#ff3030', 1.6); }
        // screen juice: light hits barely move the screen; the big ones get a short punch, the finishing blows an impact frame
        if (kb > 60) this.rig.shake(Math.min(0.9, (kb - 60) / 160 + d / 80));
        if (strong) {
          this.rig.punchIn(Math.min(1, kb / 160));
          // the camera leans toward the impact a moment (the hit freeze holds both fighters meanwhile)
          if (kb > 120 && !(this.rig.focus && this.rig.focusK > 0.3)) this.rig.focusOn({ x: ev.x, y: ev.y, z: ev.z }, 0.22, 0.3);
          R.kick('chroma', 0.4 + kb / 220);
          R.kick('radial', Math.min(0.8, kb / 190), { c: this.toScreen(ev.x, ev.y, ev.z) });
          if (kb > 190) R.kick('impact', 1);
        }
        if (ev.beat) this.popups.text('TUNG !', ev.x, ev.y + 1.2, ev.z, '#ffd23a', 1.1);
        if (kb > 200) this.popups.text(['BOUM !', 'CRAC !', 'SPLATCH !', 'AÏE !'][Math.floor(Math.random() * 4)], ev.x, ev.y + 1, ev.z, '#ffffff', 1.3);
        A && A.hit(ev.sfx, d, kb, this.pan(ev.x));
        if (this.rumble) { this.rumble(ev.s, 0.3 + kb / 180, 0.4 + d / 25, 90 + kb); if (ev.a >= 0) this.rumble(ev.a, 0.1 + kb / 400, 0.3, 60); }
        break;
      }
      case 'shieldHit': {
        const SV = this.view(ev.s);
        if (SV && SV.shield) hitShield(SV.shield, ev.x, ev.y, ev.z, SV.shieldT || 0); // the ripple from where it landed
        // the blow stops on the bubble (the limb does not go through it)
        const SA = ev.a >= 0 ? this.view(ev.a) : null, AF2 = ev.a >= 0 ? W.fighters[ev.a] : null, VF2 = W.fighters[ev.s];
        if (SA && SA.rigModel && SV && AF2 && VF2 && AF2.state === 'move') SA.rigModel.contact = { seq: AF2.mseq, move: AF2.move, V: SV, dy: Math.max(0.35, Math.min(VF2.height - 0.2, (ev.y ?? VF2.y + 1) - VF2.y)), t: performance.now(), out: SV.shield.scale.x * 0.92 };
        P.sparks(ev.x, ev.y, ev.z, 8, COLORS[ev.s], 7);
        A && A.sfx('shieldHit', this.pan(ev.x));
        this.rig.shake(0.08);
        break;
      }
      case 'reflect': {
        // a perfect guard sent the projectiles back (world.js reflect)
        const F = W.fighters[ev.s];
        P.sparks(ev.x, ev.y, ev.z, 40, '#ffd84a', 16);
        P.shockRing(ev.x, ev.y, ev.z, '#ffd84a', 2.2, 0.5);
        this.popups.text(ev.n > 1 ? `RENVOYÉS ×${ev.n} !` : 'RENVOYÉ !', ev.x, ev.y + 1.8, ev.z, '#ffd84a', 1.5);
        this.rig.shake(0.5);
        A && A.sfx('whoosh', this.pan(ev.x), 1);
        if (F && this.rumble) this.rumble(ev.s, 0.7, 0.9, 250);
        break;
      }
      case 'parry': {
        // a perfect guard: it must feel great. A freeze in slow motion (world.js), the camera snapping in, speed
        // lines, a white flash, a shock ring and a sheaf of sparks, a bright bell over a deep boom, the pad shaking
        const big = !!ev.phys;
        P.sparks(ev.x, ev.y, ev.z, big ? 40 : 30, '#ffffff', big ? 14 : 12, 0.6); // (never hiding the fighters)
        P.sparks(ev.x, ev.y, ev.z, 26, '#9fe8ff', 12);
        P.shockRing(ev.x, ev.y, ev.z, '#9fe8ff', big ? 1.8 : 1.5, 0.35);
        R.kick('flash', big ? 0.75 : 0.6, { color: '#ffffff' });
        R.kick('chroma', big ? 4 : 3);
        this.rig.zoomIn({ x: ev.x, y: ev.y, z: ev.z }, big ? 0.6 : 0.5, big ? 0.5 : 0.4);
        this.rig.shake(0.6);
        const [sx, sy] = this.popups.screenOf(ev.x, ev.y, ev.z);
        this.popups.zoomLines(Math.min(0.8, Math.max(0.2, sx)), Math.min(0.75, Math.max(0.25, sy)), false, big ? 0.55 : 0.45);
        this.popups.text(big ? 'CONTRE PARFAIT !' : 'PARADE PARFAITE !', ev.x, ev.y + 1.3, ev.z, '#bff0ff', big ? 2 : 1.7);
        const Vv = this.view(ev.s);
        if (Vv) Vv.flash('#bff0ff', 0.5);
        A && A.sfx('parry');
        A && A.sfx('perfect', this.pan(ev.x), 1);
        if (this.rumble) { this.rumble(ev.s, 0.8, 1, big ? 320 : 240); if (big && ev.a >= 0) this.rumble(ev.a, 1, 0.6, 400); }
        break;
      }
      case 'shieldBreak':
        if (this.root && this.addBurst) this.addBurst(burstShield(this.root, ev.x, ev.y, ev.z, COLORS[ev.s], 1.2)); // the bubble bursts into shards
        P.sparks(ev.x, ev.y, ev.z, 40, COLORS[ev.s], 14);
        this.popups.text('BOUCLIER BRISÉ !', ev.x, ev.y + 1.6, ev.z, '#ff4a4a', 1.4);
        A && A.sfx('glass');
        this.rig.shake(0.5);
        break;
      case 'ko': {
        const V = this.view(ev.s);
        const v = [ev.vx || 0, ev.vy || 0, ev.vz || 0];
        // gore burst at the blast zone edge, pulled back toward the arena so we see it
        const k = ev.kind === 'bottom' ? 0.0 : 0.15;
        const x = ev.x * (1 - k), y = Math.max(-12, Math.min(20, ev.y)), z = ev.z * (1 - k);
        if (B > 0) P.gore(x, y, z, v, B === 3 ? 40 : B === 2 ? 22 : 10);
        P.sparks(x, y, z, 60, COLORS[ev.s], 20, 0.7);
        P.shockRing(x, y, z, COLORS[ev.s], 3, 0.6);
        this.renderer.kick('flash', 0.6, { color: COLORS[ev.s] });
        this.renderer.kick('chroma', 3);
        this.rig.shake(1.0);
        this.rig.focusOn({ x, y, z }, 0.4, 0.25);
        if (W.phase !== 'end' && W.phase !== 'over') this.popups.banner(ev.left > 0 || ev.left === undefined ? `${CHARS[W.fighters[ev.s].char].name} ÉJECTÉ !` : `${CHARS[W.fighters[ev.s].char].name} EST HORS JEU !`, COLORS[ev.s]);
        A && A.ko(this.pan(ev.x));
        if (this.rumble) { this.rumble(ev.s, 1, 1, 450); if (ev.k >= 0) this.rumble(ev.k, 0.6, 0.8, 250); }
        if (V) V.flash('#ffffff', 0.3);
        if (this.onKO) this.onKO(ev, W);
        break;
      }
      case 'land':
        // a burst of smoke from the feet, all around them along the floor: bigger and faster the harder the drop,
        // carried on by the fighter's momentum (src/render/smoke.js)
        if (ev.v > 4) { const F = W.fighters[ev.s], k = Math.min(1, (ev.v - 4) / 18); this.particles.smoke.ring(F.x, F.y, F.z, Math.round(4 + k * 6 + (ev.hard ? 2 : 0)), 3.5 + k * 9, 0.17 + k * 0.17, F.vx || 0); }
        if (this.view(ev.s)) this.view(ev.s).impulse(-Math.min(4, (ev.v || 0) * 0.18));
        // a hard landing of a bleeding fighter: a puddle under the fighter (gore.js)
        if (ev.hard && B >= 2 && this.gore) { const F = W.fighters[ev.s]; if (F.damage > 40) this.gore.puddle(F.x, F.y, F.z, 0.45 + Math.min(0.9, F.damage / 200)); }
        A && ev.v > 6 && A.sfx(ev.hard ? 'thud' : 'land', this.pan(W.fighters[ev.s].x), Math.min(1, ev.v / 20));
        break;
      case 'jump': {
        const F = W.fighters[ev.s];
        if (this.view(ev.s)) this.view(ev.s).impulse(ev.air ? 2.2 : 3);
        if (!ev.air) this.particles.smoke.ring(F.x, F.y, F.z, 5, 2.6, 0.2, F.vx || 0); // pushed off the floor
        else this.particles.shockRing(F.x, F.y, F.z, '#ffffff', 0.35, 0.18);
        // Anbuu's air jump is a beat of his angel wings: a few feathers fall from it
        if (ev.air && F.char === 'anbuu') { this.particles.burst('flake', F.x, F.y + 1.3, F.z, 5, '#fff6dc', { speed: 2 }); A && A.sfx('flap', this.pan(F.x), 1.2); }
        A && A.sfx(ev.air ? 'jump2' : 'jump', this.pan(F.x));
        break;
      }
      case 'bounce':
        this.particles.smoke.ring(ev.x, ev.y, ev.z, 11, 6.5, 0.4);
        if (B >= 2 && this.gore) this.gore.puddle(ev.x, ev.y, ev.z, 0.8);
        if (B > 0) P.blood(ev.x, ev.y + 0.3, ev.z, [0, 1, 0], 30, 1.2);
        this.rig.shake(0.35);
        A && A.sfx('thud', this.pan(ev.x));
        break;
      case 'tech':
        P.sparks(ev.x, ev.y + 0.5, ev.z, 16, '#ffffff', 8);
        this.popups.text('TECH !', ev.x, ev.y + 1.5, ev.z, '#ffffff', 1);
        A && A.sfx('tech');
        break;
      case 'dash': {
        // smoke kicked back from the heels (a turn: thrown on along the old run, its momentum), a light whoosh
        const F = W.fighters[ev.s];
        if (F) { this.particles.smoke.kick(F.x - ev.d * 0.3, F.y, F.z, -ev.d, ev.turn ? 7 : 5, ev.turn ? 7 : 6, ev.turn ? 0.27 : 0.24); A && A.sfx('whoosh', this.pan(F.x), ev.turn ? 0.25 : 0.35); }
        break;
      }
      // RONARE (src/sim/chars/ronare.js): the pint broken on the floor, the needle dropped, the jack's jolt
      case 'pintSmash': {
        P.burst('drop', ev.x, ev.y + 0.25, ev.z, 26, '#f0a020', { speed: 7 });
        P.burst('drop', ev.x, ev.y + 0.25, ev.z, 12, '#fff8e6', { speed: 5 });
        P.sparks(ev.x, ev.y + 0.2, ev.z, 8, '#e8f6ff', 8, 0.25);
        if (A) A.sfx('glass', this.pan(ev.x), 0.9);
        this.rig.shake(0.35);
        break;
      }
      case 'turntable': P.sparks(ev.x, ev.y + 0.2, ev.z, 10, '#ff5ab8', 7, 0.3); break;
      case 'jackStun': P.sparks(ev.x, ev.y, ev.z, 8, '#ffe28a', 6, 0.25); this.popups.text('BZZT !', ev.x, ev.y + 1, ev.z, '#ffe28a', 1.1); break;
      case 'cdDeny': {
        // pressed while it recharges: a dry click, a wisp from the hands, the arc under the feet blinks red
        const F = W.fighters[ev.s], V = this.view(ev.s);
        if (V && V.denyCd) V.denyCd(ev.k);
        if (F) { this.particles.sparks(F.x + Math.sin(F.facing) * 0.4, F.y + 1.1, F.z, 3, '#9a9aa6', 2, 0.2); A && A.sfx('click', this.pan(F.x), 0.5); }
        break;
      }
      case 'skid': { const F = W.fighters[ev.s]; if (F && Math.abs(F.vx) > 4) this.particles.smoke.kick(F.x + Math.sign(F.vx) * 0.25, F.y, F.z, Math.sign(F.vx), 4, 2.5, 0.22, F.vx); break; } // the slide pushes it on ahead
      case 'ledge': A && A.sfx('ledge', this.pan(W.fighters[ev.s].x)); break;
      case 'grab': {
        // the catch: a thud, a small shake, a burst where the hands close
        if (A) { A.sfx('grab'); A.sfx('punchHeavy', this.pan(ev.x || 0), 0.45); }
        if (ev.x !== undefined) { P.sparks(ev.x, ev.y, ev.z, 10, '#fff2c8', 4); P.shockRing(ev.x, ev.y, ev.z, '#ffffff', 0.45, 0.18); }
        this.rig.shake(0.12);
        if (this.rumble) this.rumble(ev.a, 0.3, 0.2, 120);
        break;
      }
      case 'dodge': case 'airdodge': A && A.sfx('whoosh'); break;
      case 'charge': if (ev.c < 0.1) A && A.sfx('charge'); break;
      case 'move': if (A && ev.m) { // the swing through the air: a whoosh for every normal attack (full for smashes and aerials, lighter for jabs and tilts)
        const pf = W.fighters[ev.s], pn = pf ? this.pan(pf.x) : 0;
        if (/smash|fair|bair|nair|uair|dair|jab3/.test(ev.m)) A.sfx('whoosh', pn, 1);
        else if (/jab|tilt/.test(ev.m)) A.sfx('whoosh', pn, 0.7);
        if (/^jab/.test(ev.m)) A.sfx('hitS', pn, 0.9); // every press of the quick neutral attack: one of the hitS versions (hitS1, hitS2...)
      } break;
      case 'countdown': this.popups.countdown(ev.n); A && A.countdown(ev.n); break;
      case 'go': this.popups.countdown('BAGARRE !'); A && A.go(); break;
      case 'zoom': {
        // a duel's big blow (world.js lethal): the camera snaps onto the impact, speed lines, a flash; the KO one
        // (k 2) closer and longer, with its sound, the sim slowed meanwhile
        const big = ev.k === 2, T = big ? 1.05 : 0.45;
        this.rig.zoomIn({ x: ev.x, y: ev.y, z: ev.z }, T, big ? 1 : 0.55);
        const [sx, sy] = this.popups.screenOf(ev.x, ev.y, ev.z);
        if (!(big && this.speedvid)) this.popups.zoomLines(Math.min(0.8, Math.max(0.2, sx)), Math.min(0.75, Math.max(0.25, sy)), big, T); // le KO a ses lignes en vidéo (speedVideo.js)
        this.renderer.kick('flash', big ? 0.75 : 0.35, { color: big ? '#fff3d6' : '#ffffff' });
        if (big) { this.renderer.kick('chroma', 5); if (A) { A.sfx('kozoom', this.pan(ev.x), 1); A.finishHit(this.pan(ev.x)); } } // the creator's FinishHit sound layered on the built-in one
        if (big && this.vid) this.vid.kill(ev.x, ev.y, ev.z, ev.a); // « Kill Spark Effect » : la décharge à deux ailes, à la couleur de celui qui frappe
        if (big && this.speedvid) this.speedvid.play(Math.min(0.85, Math.max(0.15, sx)), Math.min(0.8, Math.max(0.2, sy)), this.renderer.camera.position.distanceTo(_sv.set(ev.x, ev.y, ev.z)), speedTint(W.fighters[ev.a]), T);
        // the blow that kills: the body bursts open (gore.js)
        if (big && this.gore && this.blood >= 2) this.gore.explode(this.view(ev.s), ev.x, ev.y, ev.z, (this.lastHit && this.lastHit[ev.s]) || [1, 0.4, 0]);
        if (this.rumble) this.rumble(ev.s, big ? 1 : 0.6, big ? 1 : 0.6, big ? 500 : 200);
        break;
      }
      case 'game': {
        // the last KO: the big slow motion (world.js END_SLOW), the commentator's victory line shouted and written
        // across the screen, the camera rushing onto the winner
        const line = victoryLine();
        this.popups.banner(line.toUpperCase(), '#ffffff', 2.3, 'vic');
        A && A.game(line);
        this.renderer.kick('flash', 0.8);
        this.renderer.kick('chroma', 4);
        const Wn = W.fighters[ev.w];
        if (Wn) { this.rig.focusOn({ x: Wn.x, y: Wn.y + 1, z: Wn.z }, 2.6, 0.8); this.rig.punchIn(2.2); }
        break;
      }
      case 'respawn': A && A.sfx('respawn'); break;
      case 'strike':
        if (ev.k === 'lightning') { P.sparks(ev.x, 2, ev.z, 50, '#cfe0ff', 16, 0.5); this.renderer.kick('flash', 0.7, { color: '#dfe8ff' }); this.rig.shake(0.6); A && A.sfx('thunder'); this.lightning && this.lightning(ev.x, ev.z); }
        if (ev.k === 'gas') { P.burst('dust', ev.x, ev.y + 0.5, ev.z, 14, '#8aff4a', { speed: 6, g: -3, life: 1.1 }); A && A.sfx('gas'); }
        if (ev.k === 'fork') { this.rig.shake(0.7); A && A.sfx('stab'); P.dust(ev.x, ev.y, ev.z, 20); }
        if (ev.k === 'catfall') { this.rig.shake(0.75); A && A.sfx('yowl'); A && A.sfx('thud'); P.dust(ev.x, ev.y, ev.z, 9, '#e0c8a0', 2.0); this.popups.text('MIAAAOU !', ev.x, ev.y + 2.4, ev.z, '#ffb03a', 1.2); }
        break;
      case 'sweep': A && A.sfx(ev.k === 'wave' ? 'wave' : ev.k === 'cats' ? 'yowl' : 'grateHeavy'); if (ev.k === 'cats') this.popups.banner('LA MEUTE !', '#ffb03a', 1.2); break;
      case 'stamp':
        this.rig.shake(0.9); this.renderer.kick('flash', 0.5, { color: '#ff4040' }); this.renderer.kick('chroma', 2);
        P.dust(ev.x, ev.y, ev.z, 9, '#c8c0b0', 2.0);
        if (this.decals) this.decals.stamp(ev.x, ev.z, ev.a || 0);
        this.popups.text('49.3 !', ev.x, ev.y + 2.5, ev.z, '#ff3030', 1.8);
        A && A.sfx('stamp');
        break;
      case 'decree': this.popups.text('PAR DÉCRET !', W.fighters[ev.s].x, W.fighters[ev.s].y + 2.6, W.fighters[ev.s].z, '#4a7aff', 1.1); A && A.sfx('decree'); break;
      case 'powder': P.burst('dust', ev.x, ev.y + 0.5, ev.z, 14, '#ffffff', { speed: 5, g: -1, life: 1.2, s: 1.0 }); A && A.sfx('poof'); break;
      case 'sniff': this.popups.text('SNIIIFF !', ev.x, ev.y + 0.6, ev.z, '#ffffff', 1.2); A && A.sfx('sniff'); break;
      case 'burgerBoom': P.burst('drop', ev.x, ev.y + 0.3, ev.z, 50, '#d0141a', { speed: 9 }); P.burst('drop', ev.x, ev.y + 0.3, ev.z, 30, '#f0c020', { speed: 8 }); P.burst('flake', ev.x, ev.y + 0.3, ev.z, 20, '#4ac83a', { speed: 7 }); this.rig.shake(0.4); A && A.sfx('splat'); break;
      case 'quake': this.rig.shake(0.3 + ev.k * 0.6); P.dust(ev.x, ev.y, ev.z, 4, '#a89884', 1.1); P.shockRing(ev.x, ev.y + 0.1, ev.z, '#e8dcc8', 1.0, 0.3); A && A.sfx('quake'); break; // (a little dust at the feet: never a cloud over the fighters)
      case 'tung': {
        const F = W.fighters[ev.s];
        this.popups.text(ev.n === 3 ? 'SAHUR !' : 'TUNG', F.x, F.y + 2.4 + ev.n * 0.2, F.z, ev.beat ? '#ffd23a' : '#e8b070', ev.n === 3 ? 1.3 : 0.9);
        A && A.sfx('tung', this.pan(F.x), 1, ev.n);
        if (ev.ground) P.shockRing(F.x, F.y + 0.1, F.z, ev.beat ? '#ffd23a' : '#e8a050', 1.2, 0.35);
        break;
      }
      case 'flakes': P.burst('flake', ev.x, ev.y, ev.z, ev.n || 5, '#f2d77a', { speed: 4, vx: Math.sin(ev.a) * 3, vz: Math.cos(ev.a) * 3, g: ev.down ? 9 : 6 }); break;
      // --- ANBUU: the lick, the 808s, the wings ---
      case 'anbuuLick': {
        const F = W.fighters[ev.s];
        if (ev.n === 0) { const pick = [0, 1, 3, 4, 5][Math.floor(Math.random() * 5)]; A && A.sfx('lick' + pick, this.pan(F.x), 1.5); } // one single lick, picked at random (the files that exist: lick0, 1, 3, 4, 5)
        if (ev.n === 0) this.popups.text('LE LICK…', F.x, F.y + 2.4, F.z, '#ffe17a', 0.9);
        if (ev.n === 6) { this.popups.text('JAZZ !', F.x, F.y + 2.5, F.z, '#ffd04a', 1.15); P.sparks(F.x, F.y + 1.3, F.z, 10, '#ffe17a', 5); }
        break;
      }
      case 'anbuu808': {
        const F = W.fighters[ev.s];
        if (ev.n === 0) { A && A.sfx('sub808', this.pan(F.x), 2.5); this.rig.shake(0.15); }
        if (ev.n === 1) { this.popups.text('SAINTE 808…', F.x, F.y + 2.5, F.z, '#f2e6a0', 1); A && A.sfx('charge', this.pan(F.x), 0.9); }
        if (ev.n === 2) {
          A && A.sfx('sub808', this.pan(ev.x), 3);
          this.popups.text('BOOM', ev.x, ev.y + 1.4, 0, '#c6a6ff', 1.3);
          P.shockRing(ev.x, ev.y + 0.1, 0, '#9d6bff', 1.3, 0.35); P.dust(ev.x, ev.y, 0, 10, '#d8d0c0', 1.2);
          this.rig.shake(0.45); R.kick('chroma', 1.2);
          if (this.rumble) this.rumble(ev.s, 0.5, 0.8, 400);
        }
        break;
      }
      case 'anbuuWings': { const F = W.fighters[ev.s]; A && A.sfx('flap', this.pan(F.x), 1.8); P.burst('flake', F.x, F.y + 1.4, F.z, 8, '#fff6dc', { speed: 3 }); break; }
      // --- SKANKY: the talk, the fraud and its train, the ollie, the funk de Lyon ---
      case 'skankyTalk': {
        const F = W.fighters[ev.s];
        const L = ['Wesh écoute-moi bien', 'Non mais attends, frère', 'Genre, en vrai, j\'te jure', 'Laisse-moi finir !', 'Bref. Bref. Bref.', 'C\'est pas ce que tu crois'];
        const line = L[(ev.n * 3 + Math.floor(Math.random() * L.length)) % L.length];
        this.popups.text(line.toUpperCase(), F.x, F.y + 2.4 + ev.n * 0.2, F.z, '#fff2e0', 0.75);
        if (A) A.say(line, 1.15, 1.45);
        break;
      }
      case 'skankyTrain': {
        const F = W.fighters[ev.s];
        this.popups.text('FRAUDE !', F.x, F.y + 2.3, F.z, '#ff4a4a', 1.2);
        if (A) { A.sfx('horn', this.pan(F.x), 0.9); A.sfx('rails', this.pan(F.x), 0.8); }
        this.rig.shake(0.5); R.kick('chroma', 1.2);
        if (this.rumble) this.rumble(ev.s, 0.3, 0.6, 400);
        break;
      }
      case 'skankyOllie': {
        const F = W.fighters[ev.s];
        this.popups.text('OLLIE !', F.x, F.y + 2.2, F.z, '#ffd23a', 1);
        P.dust(F.x, F.y + 0.05, F.z, 8, '#d8d0c0', 0.9);
        A && A.sfx('skate', this.pan(F.x), 1);
        break;
      }
      case 'skankyFunk': {
        const F = W.fighters[ev.s];
        if (ev.n === 0) { this.popups.text('FUNK DE LYON !', F.x, F.y + 2.5, F.z, '#ff8a2a', 1.15); A && A.say('Funk de Lyon !', 0.9, 1.2); }
        else this.rig.shake(0.12 + ev.n * 0.05); // the ring itself is the entity (entityView)
        A && A.sfx('funk', this.pan(F.x), 0.8 + ev.n * 0.1);
        break;
      }
      // --- Pandrezz: kamehameha, CD-Man, Vinylman ---
      case 'kameStart': { const F = W.fighters[ev.s]; A && A.sfx('kameCharge', this.pan(F.x), 0.85); break; }
      case 'kameSyl': {
        const F = W.fighters[ev.s], n = Math.max(0, Math.min(3, ev.n));
        this.popups.text(['KA...', 'MÉ...', 'HA...', 'MÉ...'][n], F.x, F.y + 2.25 + n * 0.12, F.z, '#7fd8ff', 0.95 + n * 0.12);
        P.sparks(F.x, F.y + 1.1, F.z, 8 + n * 4, '#9fe8ff', 4 + n);
        if (A) A.say(['Ka', 'Mé', 'Ha', 'Mé'][n], 0.95, 1.35);
        this.rig.shake(0.04 + n * 0.03);
        break;
      }
      case 'kameFire': {
        const c = ev.c || 0;
        this.rig.shake(0.35 + c * 0.6);
        R.kick('flash', 0.2 + c * 0.45, { color: '#c8f2ff' });
        R.kick('chroma', 1 + c * 2.4);
        if (!ev.down) R.kick('radial', 0.4 + c, { c: this.toScreen(ev.x, ev.y, ev.z) });
        P.shockRing(ev.x, ev.y, ev.z, '#7fd8ff', 0.5 + c * 0.9, 0.3);
        P.sparks(ev.x, ev.y, ev.z, 20 + Math.floor(c * 30), '#bff0ff', 10 + c * 8);
        this.popups.text(ev.down ? 'HA !' : c > 0.55 ? 'HAAAAAAAA !' : c > 0.2 ? 'HAAAA !' : 'HA !', ev.x, ev.y + 1.3, ev.z, '#bff0ff', 1 + c * 0.7);
        if (A) { A.sfx('kameFire', this.pan(ev.x), 0.6 + c * 0.6, 0, 0.5 + c * 0.4); if (c > 0.25) A.say('Haaaaaaa !', 0.85, 0.75); }
        if (this.rumble) this.rumble(ev.s, 0.4 + c * 0.6, 0.6 + c * 0.4, 300 + c * 600);
        break;
      }
      case 'summon': {
        const cd = ev.k === 'cdman';
        this.popups.text(cd ? 'CD-MAN !' : 'VINYLMAN !', ev.x, ev.y + (cd ? 2.3 : 3.2), ev.z, cd ? '#bfe8ff' : '#ff6ac0', 1.25);
        P.sparks(ev.x, ev.y + 0.3, ev.z, 26, cd ? '#e8f6ff' : '#ff8ad0', 8);
        if (cd) P.shockRing(ev.x, ev.y + 0.05, ev.z, '#c8f0ff', 1.1, 0.4);
        if (A) { A.sfx('summon', this.pan(ev.x), 0.9); A.say(cd ? 'Cédé-Mane !' : 'Vinyle-Mane !', 1.05, 1.15); }
        break;
      }
      case 'cdThrow': A && A.sfx('cdThrow', this.pan(ev.x), ev.g ? 1 : 0.75, ev.g ? 2 : 0); if (ev.g) this.popups.text("DISQUE D'OR !", ev.x, ev.y + 1.2, ev.z, '#ffd23a', 1); break;
      case 'vinylLand':
        this.rig.shake(0.7); R.kick('chroma', 1.6);
        P.dust(ev.x, ev.y, ev.z, 10, '#d8d0c0', 1.4); P.shockRing(ev.x, ev.y + 0.1, ev.z, '#ff5ab8', 1.6, 0.4);
        this.popups.text('DROP !', ev.x, ev.y + 2.6, ev.z, '#ff5ab8', 1.2);
        if (A) { A.sfx('thud', this.pan(ev.x), 1); A.sfx('bassDrop', this.pan(ev.x), 0.7); }
        if (this.decals) this.decals.splat(ev.x, ev.z, 1.4, '#2a2228');
        break;
      case 'vinylScratch': A && A.sfx('vinylScratch', this.pan(ev.x), 0.85); P.sparks(ev.x, ev.y, ev.z, 6, '#ff8ad0', 6); break;
      case 'vinylDrop':
        this.rig.shake(0.6); R.kick('chroma', 2.2); R.kick('flash', 0.25, { color: '#ffb0e0' });
        P.shockRing(ev.x, ev.y + 0.2, ev.z, '#ff5ab8', 2.4, 0.45); P.dust(ev.x, ev.y, ev.z, 8, '#d8d0c0', 1.6);
        this.popups.text('BASS DROP !', ev.x, ev.y + 2.8, ev.z, '#ff5ab8', 1.35);
        A && A.sfx('bassDrop', this.pan(ev.x), 1.1, 0, 0.5);
        break;
      case 'buddyOuch': this.popups.text('AÏE !', ev.x, ev.y + 0.6, ev.z, '#ffffff', 0.8); A && A.sfx('pop', this.pan(ev.x), 0.6); break;
      case 'buddyKO': this.popups.text(ev.k === 'cdman' ? 'CD RAYÉ !' : 'DISQUE RAYÉ !', ev.x, ev.y + 1, ev.z, '#ff8080', 1.1); A && A.sfx('vinylScratch', this.pan(ev.x), 1, 3); break;
      case 'buddyBye': this.popups.text(ev.k === 'cdman' ? 'SALUT !' : 'À PLUS !', ev.x, ev.y + 0.4, ev.z, ev.k === 'cdman' ? '#bfe8ff' : '#ff8ad0', 0.75); break;
      case 'buddyLeave': P.sparks(ev.x, ev.y, ev.z, 18, ev.k === 'cdman' ? '#e8f6ff' : '#ff8ad0', 7); P.dust(ev.x, ev.y - 0.6, ev.z, 8, '#ffffff', 1); A && A.sfx('pop', this.pan(ev.x), 0.7); break;
      case 'humanOut': this.popups.text('UN HUMAIN SAUVAGE APPARAÎT !', ev.x, ev.y + 2.2, ev.z, '#ffd23a', 0.8); P.sparks(ev.x, ev.y + 0.5, ev.z, 20, '#ffffff', 7); A && A.sfx('pop'); break;
      case 'captured': this.popups.text('CAPTURÉ !', ev.x, ev.y + 1.8, ev.z, '#ff4040', 1.1); A && A.sfx('pop'); break;
      case 'wobble': this.popups.text(['...1', '...2', '...3'][ev.n - 1] || '', ev.x, ev.y + 1.4, ev.z, '#ffffff', 0.8); A && A.sfx('wobble'); break;
      case 'capBreak': P.sparks(ev.x, ev.y + 0.5, ev.z, 40, '#ff4040', 14); this.rig.shake(0.5); if (ev.crit) this.popups.text('CAPTURE CRITIQUE !', ev.x, ev.y + 2, ev.z, '#ff3030', 1.2); A && A.sfx('boom'); break;
      case 'minionHit': if (B > 0) P.blood(ev.x, ev.y, ev.z, null, 12, 0.8); A && A.sfx('hitS', this.pan(ev.x)); break;
      case 'minionGore': if (B > 0) P.gore(ev.x, ev.y, ev.z, [ev.vx, ev.vy, ev.vz], 10); this.rig.shake(0.3); A && A.sfx('splatter'); break;
      case 'thunderBlast': P.sparks(ev.x, ev.y + 1, ev.z, 40, '#fff4a0', 14); P.shockRing(ev.x, ev.y + 0.5, ev.z, '#fff4a0', 2, 0.4); this.renderer.kick('flash', 0.6, { color: '#fff8c0' }); this.rig.shake(0.5); A && A.sfx('thunder'); break;
      case 'bolt': this.renderer.kick('flash', 0.3, { color: '#fff4c0' }); this.lightning && this.lightning(ev.x, ev.z, ev.y); break;
      case 'swallow': A && A.sfx('gulp'); break;
      case 'spit': A && A.sfx('spit'); break;
      case 'geyser': P.burst('drop', ev.x, ev.y, ev.z, 40, '#a8d8ff', { speed: 7, vy: 8 }); break;
      case 'submerge': case 'surface': P.burst('drop', ev.x, ev.y + 0.2, ev.z, 26, '#a8d8ff', { speed: 6, vy: 5 }); if (ev.attack) this.popups.text('CHOMP !', ev.x, ev.y + 2, ev.z, '#ff4040', 1.2); A && A.sfx('splash'); break;
      case 'wake': P.burst('drop', ev.x, ev.y + 0.1, ev.z, 3, '#a8d8ff', { speed: 2, vy: 2 }); break;
      case 'dust': P.dust(ev.x, ev.y, ev.z, ev.n || 6); break;
      case 'catPoof': P.burst('dust', ev.x, ev.y + 0.4, ev.z, 18, '#f2a23a', { speed: 4, g: -1, life: 0.9 }); A && A.sfx('poof', this.pan(ev.x), 0.6); break;
      case 'catOff': P.burst('flake', ev.x, ev.y, ev.z, 10, '#f2a23a', { speed: 5, g: 6 }); this.popups.text('MIAOU !', ev.x, ev.y + 0.8, ev.z, '#ffb03a', 0.8); A && A.sfx('meow', this.pan(ev.x)); break;
      case 'projHit': case 'projBlock': case 'projLand': {
        const c = { burger: '#d0141a', powderbag: '#ffffff', fry: '#ffd34a', merguez: '#9a3a20', coffee: '#5a2a10', bill: '#7bc265' }[ev.k];
        if (c) P.burst('drop', ev.x, ev.y, ev.z, 8, c, { speed: 4 });
        if (ev.k === 'bill') P.burst('bill', ev.x, ev.y, ev.z, 3, '#7bc265', { speed: 3, flutter: true, g: 2, life: 2 });
        break;
      }
      case 'trip': this.popups.text('GLISSADE !', ev.x, ev.y + 1.5, ev.z, '#ffe08a', 0.9); A && A.sfx('slip'); break;
      case 'padSink': A && A.sfx('splash'); break;
      case 'drumPop': this.rig.shake(0.25); if (this.stageView && this.stageView.pop !== undefined) this.stageView.pop = 1; A && A.sfx('tung', 0, 1.2, 3); break;
      case 'crowdThrow': this.popups.text('LE PUBLIC LANCE UNE HUMANBALL !', ev.x, 6, ev.z, '#ffffff', 0.7); break;
      case 'squirt': A && A.sfx('splat'); break;
      case 'sfx': A && A.sfx(ev.n, ev.s !== undefined && W.fighters[ev.s] ? this.pan(W.fighters[ev.s].x) : 0); break;
      case 'walkOff': break;
      default: break;
    }
  }

  pan(x) { return Math.max(-1, Math.min(1, (x - this.rig.target.x) / 16)); }

  toScreen(x, y, z) {
    v3.set(x, y, z).project(this.renderer.camera);
    return new THREE.Vector2(v3.x * 0.5 + 0.5, v3.y * 0.5 + 0.5);
  }
}
