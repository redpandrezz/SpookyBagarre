// La scène d'un ultime (Final Smash) : ce que l'on voit quand `W.ult` tourne (src/sim/ultimate.js). Tout est lu dans l'état
// de la simulation (rien d'autre à garder en phase : un retour en arrière en ligne refait la même scène).
//   - la caméra de cinéma : des plans qui se coupent (gros plan, plan large en contre-plongée, le rayon qui file, puis un
//     angle différent à chaque note du lick, et le tout dernier coup tout près) : `CameraRig.script`
//   - le fond : la scène est cachée, le décor devient une image dessinée à chaque image (dégradé de la couleur du perso,
//     lignes de vitesse en rayons, bandes horizontales du rayon) : `scene.background`
//   - le rayon de lumière (le plasma de fxShaders.js), des notes qui volent, l'aura immense du lanceur
//   - par-dessus : barres noires, flashs, titre de l'ultime, piliers de lumière, éclats pointus multicolores et éclairs
//     blancs au contour rouge (le style des effets de Smash Ultimate), dessinés en 2D sur un canevas (`fg`)
import * as THREE from 'three';
import { ultDef, ultDefOf, ULT_MAX, ULT_PARRY } from '../sim/ultimate.js';
import { energyBeam, updateEnergyBeam, ENERGY } from './fxShaders.js';
import { makeAura, setAura } from './aura.js';
import { LaserVfx } from './laserVfx.js';

// le plasma du rayon : rose → bleu clair → blanc (un rayon qui change de couleur le long de sa course)
ENERGY.lick = { c0: '#ff3fd0', c1: '#6fe0ff', c2: '#fffdf4', arc: '#ffffff', mote: '#ffd6f8', flare: '#ff8ae6' };

// une couleur (#rrggbb) ramenée à la clarté `l` (la teinte garde le perso), éventuellement avec de la transparence
const _tc = new THREE.Color(), _th = {};
function tint(c, l, a) {
  _tc.set(c).getHSL(_th); _tc.setHSL(_th.h, Math.min(1, _th.s * 1.1), l);
  return a === undefined ? '#' + _tc.getHexString() : `rgba(${Math.round(_tc.r * 255)},${Math.round(_tc.g * 255)},${Math.round(_tc.b * 255)},${a})`;
}

const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (x) => { x = cl(x); return x * x * (3 - 2 * x); };
const easeOut = (x) => 1 - (1 - cl(x)) * (1 - cl(x));
const back = (x) => { x = cl(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const rng = (seed) => { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
const hsl = (h, s = 100, l = 55, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;
const RAINBOW = [0, 48, 130, 190, 280, 325];

// ---- dessins 2D ------------------------------------------------------------------------------------------------------
// des lignes de vitesse en rayons autour d'un point : des triangles fins, pointe au centre, base au bord
function radialLines(ctx, W, H, cx, cy, n, seed, colors, inner, alpha, widen = 1) {
  const r = rng(seed), R = Math.hypot(W, H);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, w = (0.004 + r() * 0.011) * widen, r0 = R * (inner + r() * 0.3), r1 = R * (0.75 + r() * 0.35);
    ctx.fillStyle = colors[(r() * colors.length) | 0];
    ctx.globalAlpha = alpha * (0.35 + r() * 0.65);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a - w) * r1, cy + Math.sin(a - w) * r1);
    ctx.lineTo(cx + Math.cos(a + w) * r1, cy + Math.sin(a + w) * r1);
    ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// des traits horizontaux qui filent (le rayon, vu de côté) : des losanges très longs, tous dans le même sens
function streaks(ctx, W, H, cy, n, seed, t, dir, colors, thick) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const y = cy + (r() - 0.5) * H * 0.9 * (0.25 + r() * 0.75), len = W * (0.25 + r() * 0.7), sp = 0.8 + r() * 2.2, h = thick * (0.3 + r() * 1.1);
    const x = (((r() + t * sp * 0.9 * dir) % 1.3) + 1.3) % 1.3 * (W + len) - len;
    ctx.fillStyle = colors[(r() * colors.length) | 0];
    ctx.globalAlpha = 0.25 + r() * 0.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len * 0.5, y - h); ctx.lineTo(x + len, y); ctx.lineTo(x + len * 0.5, y + h); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// une étoile à quatre branches (les étincelles des nuages de Smash)
function sparkle(ctx, x, y, s, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s); ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
}

// l'explosion d'éclats pointus (le dernier coup, comme l'éclair arc-en-ciel d'un KO) : des pointes courbes aux flancs
// dentelés autour d'un cœur blanc, de toutes les couleurs ; e = 0..1 son avancement
function shards(ctx, cx, cy, e, size, cols, seed, core = true) {
  const r = rng(seed), n = 20, R = size * (0.18 + 0.82 * easeOut(e * 1.15)), a = 1 - ease((e - 0.5) / 0.5);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.28, L = R * (0.55 + r() * 0.75) * (i % 2 ? 0.72 : 1), w = L * (0.1 + r() * 0.09), r0 = R * 0.07;
    const ux = Math.cos(ang), uy = Math.sin(ang), px = -uy, py = ux, bend = (r() - 0.5) * L * 0.25;
    const col = cols[i % cols.length];
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = size * 0.05;
    ctx.beginPath();
    ctx.moveTo(cx + ux * r0 + px * w, cy + uy * r0 + py * w);
    ctx.quadraticCurveTo(cx + ux * L * 0.45 + px * (w * 1.6) + px * bend, cy + uy * L * 0.45 + py * (w * 1.6) + py * bend, cx + ux * L * 0.62 + px * w * 0.55, cy + uy * L * 0.62 + py * w * 0.55); // le flanc se creuse...
    ctx.lineTo(cx + ux * L * 0.55 + px * w * 1.15, cy + uy * L * 0.55 + py * w * 1.15);                                                                                                         // ...une dent
    ctx.quadraticCurveTo(cx + ux * L * 0.82 + px * w * 0.5 + px * bend, cy + uy * L * 0.82 + py * w * 0.5 + py * bend, cx + ux * L + px * bend * 1.6, cy + uy * L + py * bend * 1.6);
    ctx.quadraticCurveTo(cx + ux * L * 0.82 - px * w * 0.5 + px * bend, cy + uy * L * 0.82 - py * w * 0.5 + py * bend, cx + ux * L * 0.55 - px * w * 1.15, cy + uy * L * 0.55 - py * w * 1.15);
    ctx.lineTo(cx + ux * L * 0.62 - px * w * 0.55, cy + uy * L * 0.62 - py * w * 0.55);
    ctx.quadraticCurveTo(cx + ux * L * 0.45 - px * (w * 1.6) + px * bend, cy + uy * L * 0.45 - py * (w * 1.6) + py * bend, cx + ux * r0 - px * w, cy + uy * r0 - py * w);
    ctx.closePath(); ctx.fill();
  }
  ctx.shadowBlur = 0;
  if (core) {
    const cr = R * 0.34 * (1 - e * 0.5), g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, 7); ctx.fill();
    // deux lames blanches en croix, très fines
    ctx.fillStyle = '#fff';
    for (let k = 0; k < 2; k++) {
      const ang = -0.7 + k * 1.5 + (r() - 0.5) * 0.3, L = R * 1.25, w = R * 0.025;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * L, cy + Math.sin(ang) * L); ctx.lineTo(cx - Math.sin(ang) * w, cy + Math.cos(ang) * w); ctx.lineTo(cx - Math.cos(ang) * L, cy - Math.sin(ang) * L); ctx.lineTo(cx + Math.sin(ang) * w, cy - Math.cos(ang) * w); ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}

// un éclair : un trait blanc irrégulier au contour rouge lumineux, avec quelques branches ; w = épaisseur
function bolt(ctx, x0, y0, x1, y1, seed, w, a, glow = '#ff2438') {
  const r = rng(seed), n = 13, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, amp = len * 0.055;
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n, s = Math.sin(t * Math.PI), o = (r() - 0.5) * 2 * amp * (0.35 + s); pts.push([x0 + dx * t + nx * o, y0 + dy * t + ny * o]); }
  const draw = (P, lw, col, blur) => {
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
    ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.shadowColor = glow; ctx.shadowBlur = blur; ctx.stroke();
  };
  const branches = [];
  for (let b = 0; b < 2; b++) {
    const i0 = 2 + ((r() * (n - 5)) | 0), p = pts[i0], ang = Math.atan2(dy, dx) + (r() - 0.5) * 1.8, bl = len * (0.12 + r() * 0.16), q = [[p[0], p[1]]];
    for (let k = 1; k <= 5; k++) q.push([p[0] + Math.cos(ang) * bl * (k / 5) + (r() - 0.5) * amp * 0.8, p[1] + Math.sin(ang) * bl * (k / 5) + (r() - 0.5) * amp * 0.8]);
    branches.push(q);
  }
  ctx.save(); ctx.globalAlpha = a; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const P of [pts, ...branches]) draw(P, (P === pts ? w : w * 0.55) * 2.8, glow, w * 3);
  ctx.shadowBlur = 0;
  for (const P of [pts, ...branches]) draw(P, P === pts ? w : w * 0.55, '#ffffff', 0);
  ctx.restore();
}

// les piliers de lumière blancs, verticaux, qui s'étalent (l'entrée en scène)
function pillars(ctx, W, H, e, cx) {
  const a = 1 - ease((e - 0.25) / 0.75);
  if (a <= 0) return;
  const r = rng(77), n = 5;
  for (let i = 0; i < n; i++) {
    const x = cx + (r() - 0.5) * W * 0.55, w = W * (0.02 + r() * 0.05) * (0.3 + easeOut(e) * 1.3);
    const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.35, 'rgba(255,255,255,.9)'); g.addColorStop(0.5, '#fff'); g.addColorStop(0.65, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = a * (0.6 + r() * 0.4); ctx.fillStyle = g; ctx.fillRect(x - w, 0, w * 2, H);
  }
  ctx.globalAlpha = 1;
}

// un nuage blanc (plusieurs ronds), des étincelles et des confettis tout autour : la fumée des effets de Smash
function puffs(ctx, cx, cy, e, size, seed) {
  const r = rng(seed), a = 1 - ease((e - 0.55) / 0.45);
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  for (let i = 0; i < 12; i++) {
    const ang = r() * 7, d = size * (0.2 + r() * 0.55) * easeOut(e), rad = size * (0.07 + r() * 0.1) * (0.6 + e * 0.6);
    ctx.fillStyle = i % 4 === 0 ? '#e8e8f4' : '#ffffff'; ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d * 0.8, rad, 0, 7); ctx.fill();
  }
  for (let i = 0; i < 16; i++) {
    const ang = r() * 7, d = size * (0.4 + r() * 0.7) * easeOut(e), s = size * (0.012 + r() * 0.03);
    const col = hsl(r() * 360, 100, 65);
    if (i % 3 === 0) sparkle(ctx, cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, s * 2.4, '#fff');
    else { ctx.fillStyle = col; ctx.fillRect(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, s, s * 0.7); }
  }
  ctx.restore();
}

// ---- la scène ---------------------------------------------------------------------------------------------------------
export class UltView {
  constructor(mv) {
    this.mv = mv; this.R = mv.app.renderer;
    this.on = false; this.tail = 0; this.flash = 0; this.flashCol = '#fff';
    this.fxs = []; this.notes = [];
    // le fond (image dessinée à chaque image) et le canevas de devant
    this.bg = document.createElement('canvas'); this.bg.width = 800; this.bg.height = 450;
    this.bgx = this.bg.getContext('2d');
    this.bgTex = new THREE.CanvasTexture(this.bg);
    this.bgTex.colorSpace = THREE.SRGBColorSpace;
    this.fg = document.createElement('canvas');
    this.fg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;display:none;';
    this.fgx = this.fg.getContext('2d');
    mv.app.ui.appendChild(this.fg);
    // 3D : le rayon, l'aura immense du lanceur, les notes
    this.beam = energyBeam('lick'); this.beam.visible = false; mv.root.add(this.beam);
    // le rayon de la vidéo « laser » (laserVfx.js) : chargé seulement si un combattant du match a un ultime ; l'ancien plasma reste en repli
    LaserVfx.gl = this.R.gl;
    this.laser = mv.W && mv.W.list.some((F) => ultDef(F)) ? new LaserVfx(mv.root, mv.W.list.map((F) => ultDef(F)).filter(Boolean)) : null;
    this.laserF = -1;
    this.big = makeAura(); mv.root.add(this.big);
    const g = document.createElement('canvas'); g.width = g.height = 64;
    const x = g.getContext('2d'); x.font = '900 52px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff'; x.shadowColor = '#fff'; x.shadowBlur = 8; x.fillText('♪', 32, 34);
    this.noteTex = new THREE.CanvasTexture(g);
    this.hidden = []; this.saved = null;
  }

  get active() { return this.on; }

  // les shaders du rayon et de l'aura sont compilés avant le premier combat (sinon : un saut la première fois)
  warm(on) { this.beam.visible = on; this.big.visible = on; if (on) setAura(this.big, 0, 1, 1, 1); if (this.laser) this.laser.warm(on); }

  // ---- évènements : les sons et les effets qui partent d'un coup ----
  onEvent(ev, W) {
    const A = this.mv.fx.audio, P = this.mv.particles, R = this.R, rig = this.mv.rig;
    const F = W.fighters[ev.s], u0 = W.ult, U = F && (u0 && u0.slot === ev.s ? ultDefOf(u0, F) : ultDef(F)), cols = (U && U.colors) || ['#fff1a8', '#ff6fd8', '#6fd8ff'];
    switch (ev.type) {
      case 'ultReady': {
        // la jauge est pleine : un anneau, des étincelles de toutes les couleurs, « ULTIME ! » au-dessus de la tête
        P.shockRing(ev.x, ev.y + 0.9, ev.z, '#ffffff', 2.4, 0.5, true);
        for (let i = 0; i < 6; i++) P.sparks(ev.x, ev.y + 0.9, ev.z, 5, hsl(RAINBOW[i], 100, 65), 8, 0.6);
        this.mv.popups.text('ULTIME PRÊT !', ev.x, ev.y + 2.3, ev.z, cols[1], 1.5);
        A && A.sfx('perfect', this.mv.fx.pan(ev.x), 1);
        const V = this.mv.views[ev.s]; if (V) V.flash('#ffffff', 0.25);
        break;
      }
      case 'ultStart': {
        this.flash = 1; this.flashCol = '#ffffff';
        rig.shake(0.7); R.kick('chroma', 1.4);
        A && (A.sfx('kozoom'), A.sfx('perfect', 0, 1));
        this.fxs.push({ k: 'pillars', t: 0, life: 0.7 });
        // les ailes du « Kill Spark » de la vidéo de VFX (vidFx.js) derrière le lanceur (il a des ailes d'ange) ; sans les planches : les nuages d'avant
        const vf = this.mv.vid, V0 = this.mv.views[ev.s];
        if (vf && vf.ready && V0) vf.play('kill', V0.root.position.x, V0.root.position.y + 1.2, V0.root.position.z, { size: 9, hue: 48, speed: 0.75 });
        else this.fxs.push({ k: 'puffs', t: 0, life: 0.8, who: ev.s, seed: 3 });
        break;
      }
      case 'ultStrike': {
        const LV = this.laser && this.laser.ready; // les plans d'impact noir et blanc de la vidéo couvrent l'écran : pas de flash rose par-dessus
        this.flash = LV ? 0.25 : 0.9; this.flashCol = cols[1]; rig.shake(0.8);
        A && (A.sfx('whoosh'), A.sfx('boom'));
        const vf = this.mv.vid, V0 = this.mv.views[ev.s];
        if (LV) { /* cachés sous les plans d'impact */ }
        else if (vf && vf.ready && V0) {
          const p = V0.root.position;
          vf.play('phys', p.x, p.y + 1.1, p.z, { size: 5.5, rot: 0.2, hue: 190 });
          vf.play('slash', p.x, p.y + 1.1, p.z, { size: 7, rot: -0.35, hue: 320, speed: 0.9 });
        } else this.fxs.push({ k: 'shards', t: 0, life: 0.4, who: ev.s, seed: 11, size: 0.4, cols: [cols[0], cols[1], cols[2], '#ffffff'] });
        break;
      }
      // la parade (17 oct. 2026) : le bouclier levé dans la fenêtre (ok) ou trop tôt, le verdict avant le tir, puis le renvoi
      case 'ultGuard': {
        const Vv = this.mv.views[ev.s], pan = this.mv.fx.pan(ev.x);
        if (ev.ok) {
          const gc = ev.perf ? '#ffe14a' : '#8ff4ff'; // (doré : une parade parfaite, qui renverra l'ultime ; cyan : une parade, qui l'annulera)
          P.shockRing(ev.x, ev.y + 1, ev.z, gc, ev.perf ? 2.8 : 2.2, 0.35, true);
          P.sparks(ev.x, ev.y + 1, ev.z, ev.perf ? 18 : 10, gc, 6, 0.4);
          A && A.sfx('perfect', pan, 1);
          if (Vv) Vv.flash(gc, 0.3);
        } else {
          A && A.sfx('blip', pan, 0.6);
          if (ev.early) this.mv.popups.text('TROP TÔT', ev.x, ev.y + 2.6, ev.z, '#b9b9c9', 1.1);
        }
        break;
      }
      case 'ultVerdict': {
        const Vv = this.mv.views[ev.s], pan = this.mv.fx.pan(ev.x);
        if (ev.ok && ev.perf) { // parade parfaite : l'ultime sera renvoyé
          this.flash = Math.max(this.flash, 0.55); this.flashCol = '#ffe14a'; rig.shake(0.55);
          A && (A.sfx('kozoom', pan, 1), A.sfx('perfect', pan, 1));
          P.shockRing(ev.x, ev.y + 1.2, ev.z, '#ffe14a', 4.2, 0.55, true);
          this.mv.popups.text('PARFAIT !', ev.x, ev.y + 2.9, ev.z, '#ffe14a', 2.9);
          const [sx, sy] = this.mv.popups.screenOf(ev.x, ev.y + 1.2, ev.z); this.mv.popups.zoomLines(sx, sy, true, 0.7);
          if (Vv) Vv.flash('#ffffff', 0.35);
        } else if (ev.ok) { // parade : l'ultime sera annulé
          this.flash = Math.max(this.flash, 0.35); this.flashCol = '#8ff4ff'; rig.shake(0.35);
          A && A.sfx('perfect', pan, 1);
          P.shockRing(ev.x, ev.y + 1.2, ev.z, '#8ff4ff', 3.4, 0.5, true);
          this.mv.popups.text('PARÉ !', ev.x, ev.y + 2.9, ev.z, '#8ff4ff', 2.3);
          if (Vv) Vv.flash('#8ff4ff', 0.35);
        } else {
          A && A.sfx('error', pan, 0.9);
          this.mv.popups.text('RATÉ…', ev.x, ev.y + 2.9, ev.z, '#ff5a5a', 1.9);
        }
        break;
      }
      // la parade normale : l'ultime est annulé (il se défait dans une gerbe d'étincelles, le lanceur reste étourdi)
      case 'ultCancel': {
        const Cv = this.mv.views[ev.a], pan = this.mv.fx.pan(ev.x);
        this.flash = Math.max(this.flash, 0.6); this.flashCol = '#8ff4ff'; rig.shake(0.6);
        A && (A.sfx('boom', pan, 0.8), A.sfx('whoosh', pan, 0.8));
        P.shockRing(ev.x, ev.y + 1.2, ev.z, '#8ff4ff', 5, 0.6, true);
        P.sparks(ev.x, ev.y + 1.2, ev.z, 36, '#bff9ff', 13, 0.6);
        if (Cv) Cv.flash('#ffffff', 0.4);
        this.mv.popups.text('ANNULÉ !', ev.x, ev.y + 3.1, ev.z, '#8ff4ff', 2.8);
        break;
      }
      case 'ultReflect': {
        this.flash = 1; this.flashCol = '#ffffff'; rig.shake(1); R.kick('chroma', 2.4);
        A && (A.sfx('boom'), A.sfx('whoosh'));
        P.shockRing(ev.x, ev.y + 1.2, ev.z, cols[1], 5.5, 0.7, true);
        P.sparks(ev.x, ev.y + 1.2, ev.z, 40, '#ffffff', 14, 0.7);
        const vf = this.mv.vid;
        if (vf && vf.ready) vf.play('kill', ev.x, ev.y + 1.2, ev.z + 0.3, { size: 8, hue: 48, speed: 0.9 });
        this.mv.popups.text(ev.ctr ? 'CONTRE !' : 'RENVOYÉ !', ev.x, ev.y + 3.1, ev.z, '#ffe14a', 3);
        break;
      }
      case 'ultCine': this.flash = 0.7; this.flashCol = cols[2]; A && A.sfx('whoosh'); break;
      case 'ultHit': {
        const last = ev.last, hue = RAINBOW[ev.n % RAINBOW.length];
        const c = hsl(hue, 100, 62);
        P.sparks(ev.x, ev.y, ev.z, last ? 60 : 22, c, last ? 16 : 11, last ? 0.8 : 0.5);
        // les animations de la vidéo de VFX (vidFx.js), en arc-en-ciel, à la place des éclats, éclairs et anneaux d'avant : chaque coup du lick
        // alterne « Physical Hit », « Sword Slash Hit » et « Alternate Physical Hit », le dernier est un « Kill Spark » avec un gros
        // « Physical Hit » dedans ; sans les planches : les impacts dessinés en code
        const vf = this.mv && this.mv.vid, sf = this.mv && this.mv.ssbu, nv = !!(vf && vf.ready);
        if (nv) {
          // (pendant la cinématique, le corps de la victime est à la place que lui donne la mise en scène : les effets s'y posent, pas aux coordonnées du combat)
          const T = this.mv.views[ev.s], hx = T ? T.root.position.x : ev.x, hy = T ? T.root.position.y + 1.1 : ev.y, hz = T ? T.root.position.z : ev.z;
          const rot = Math.random() * 6.28, k3 = ev.n % 3;
          if (last) {
            vf.kill(hx, hy, hz, -1, hue);
            vf.play('phys', hx, hy, hz + 0.2, { size: 8, rot, hue: hue + 25 });
            vf.play('slash', hx, hy, hz + 0.1, { size: 9, rot: rot + 1.4, hue: hue - 25, speed: 0.9 });
          } else if (k3 === 0) vf.play('phys', hx, hy, hz, { size: 4.2, rot, hue });
          else if (k3 === 1) vf.play('slash', hx, hy, hz, { size: 5, rot: (Math.random() - 0.5) * 1.2 + (ev.n % 2 ? 0.5 : -0.5), hue });
          else vf.play('alt', hx, hy, hz, { size: 3.8, rot, hue, flip: Math.random() < 0.5 ? 1 : -1 });
        } else {
          if (sf) sf.hit(ev.x, ev.y, ev.z, { ang: Math.random() * 6.28, tier: last ? 2 : 1, style: last ? 'elec' : 'magic', k: last ? 2.2 : 1.3 });
          else {
            P.hit.spawn(last ? 'crack' : 'heavy', ev.x, ev.y, ev.z + 0.4, last ? 4.2 : 2.1, Math.random() * 6, last ? 0.5 : 0.28);
            P.hit.spawn('pow', ev.x, ev.y, ev.z + 0.5, last ? 3.6 : 1.7, (Math.random() - 0.5) * 0.7, last ? 0.4 : 0.22, last ? null : c);
          }
          P.shockRing(ev.x, ev.y, ev.z, last ? '#ffffff' : c, last ? 4 : 2, last ? 0.6 : 0.35, true);
        }
        rig.shake(last ? 1 : 0.5); R.kick('chroma', last ? 3 : 1.2);
        this.flash = Math.max(this.flash, last ? 1 : 0.22); this.flashCol = last ? '#ffffff' : hsl(hue, 100, 70);
        A && (A.sfx(last ? 'boom' : 'zap', 0, 1), last || A.sfx('hitL'));
        if (this.mv.fx.rumble) this.mv.fx.rumble(ev.s, last ? 1 : 0.5, last ? 1 : 0.6, last ? 400 : 120);
        const V = this.mv.views[ev.s]; if (V) V.flash(last ? '#ffffff' : c, last ? 0.4 : 0.1);
        if (!nv) {
          this.fxs.push({ k: 'shards', t: 0, life: last ? 0.7 : 0.26, who: ev.s, seed: 100 + ev.n * 7, size: last ? 0.95 : 0.3, last, cols: last ? [0, 48, 130, 190, 280, 325].map((h) => hsl(h, 100, 62)).concat('#fff') : ['#fff27a', '#ffd23a', '#ffffff', c] });
          this.fxs.push({ k: 'bolt', t: 0, life: last ? 0.6 : 0.3, who: ev.s, seed: 300 + ev.n * 13, n: last ? 4 : 2, w: last ? 1 : 0.6 });
        }
        for (let i = 0; i < (last ? 14 : 6); i++) this.addNote(ev.x, ev.y, ev.z, hue + i * 30);
        break;
      }
      case 'ultEnd':
        if (ev.cx) { this.flash = Math.max(this.flash, 0.3); this.flashCol = '#8ff4ff'; } else { this.flash = 1; this.flashCol = '#ffffff'; }
        this.tail = 0.4;
        rig.dist = Math.max(8, rig.dist * 0.6); // the normal camera comes back from close and eases out
        break;
      default: break;
    }
  }

  addNote(x, y, z, hue) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.noteTex, color: new THREE.Color(hsl(hue, 100, 65)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set(x, y, z + 0.5);
    this.mv.root.add(s);
    const a = Math.random() * 6.28, sp = 2.5 + Math.random() * 4;
    this.notes.push({ s, t: 0, life: 0.7 + Math.random() * 0.4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 1.5, vz: 2 + Math.random() * 3 });
  }

  // ---- la scène entre et sort ----
  enter(W) {
    const R = this.R, mv = this.mv;
    this.on = true; this.fxs = this.fxs.filter((f) => f.k !== 'x');
    // (le brouillard repoussé au loin plutôt qu'enlevé : sans brouillard, tous les shaders de la scène se recompilaient,
    // 400 ms figées au premier ultime du match)
    const fog = R.scene.fog;
    this.saved = { fog, bg: R.scene.background, near: fog && fog.near, far: fog && fog.far, density: fog && fog.density };
    if (fog && fog.isFogExp2) fog.density = 0; else if (fog) { fog.near = 1e6; fog.far = 2e6; }
    R.fogAway = true; // (la caméra du combat ne le ramène plus à chaque image)
    R.scene.background = this.bgTex;
    mv.decals.mesh.visible = false;
    // the scenery goes (its lights stay: the fighters need them)
    this.hidden = [];
    mv.stageView.group.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) this.hidden.push([o, o.visible]); });
    this.fg.style.display = 'block';
    this.resize();
  }

  leave() {
    const R = this.R, mv = this.mv;
    this.on = false;
    for (const [o, v] of this.hidden) o.visible = v;
    this.hidden = [];
    if (this.saved) {
      const S = this.saved, fog = S.fog;
      if (fog && fog.isFogExp2) fog.density = S.density; else if (fog) { fog.near = S.near; fog.far = S.far; }
      R.scene.fog = fog; R.scene.background = S.bg; this.saved = null; R.fogAway = false;
    }
    mv.decals.mesh.visible = true;
    mv.rig.script = null;
    this.beam.visible = false; this.big.visible = false; if (this.laser) this.laser.hide();
    this.laserF = -1;
    for (const n of this.notes) { mv.root.remove(n.s); n.s.material.dispose(); }
    this.notes = [];
  }

  resize() {
    const w = Math.max(2, Math.round(this.fg.clientWidth * 0.6)), h = Math.max(2, Math.round(this.fg.clientHeight * 0.6));
    if (this.fg.width !== w || this.fg.height !== h) { this.fg.width = w; this.fg.height = h; }
  }

  // ---- chaque image : après la mise à jour des combattants (qui les rendent visibles), on cache ce qui ne joue pas ----
  afterViews(W) {
    const u = W.ult;
    if (u && !this.on) this.enter(W);
    if (!u && this.on) this.leave(); // the arena is back at once (a white flash and the bars leave over it: post)
    if (!this.on) return;
    for (const [o] of this.hidden) o.visible = false;
    const who = new Set(u ? [u.slot, ...u.victims, ...((u.ph === 0 || u.ph === 4) && (!u.rf || u.cw) ? u.thr.map((e) => e.s) : [])] : []);
    for (const F of W.list) {
      const V = this.mv.views[F.slot]; if (!V) continue;
      if (!who.has(F.slot)) V.root.visible = false;
      V.marker.visible = false; V.shadow.visible = false; V.cdRing.visible = false; V.slab.visible = false;
    }
  }

  // ---- la caméra de cinéma (avant CameraRig.update) ----
  pre(W, dt, alpha) {
    const rig = this.mv.rig, u = W.ult;
    if (this.tail > 0) this.tail -= dt;
    if (!u || !this.on) { rig.script = null; return; }
    const F = W.fighters[u.slot], U = ultDefOf(u, F), V = this.mv.views[u.slot];
    if (!F || !U || !V) { rig.script = null; return; }
    // (pendant le verdict de la parade le temps de l'ultime ne bouge plus : la charge reste à son maximum, juste avant le tir)
    const tt = u.ph === 4 ? U.intro - 0.5 : u.ph === 0 && (!u.rf || u.cw) && u.thr.length ? Math.min(U.intro - 0.5, u.t + cl(alpha || 0)) : u.t + cl(alpha || 0), d = u.dir, x = V.root.position.x, y = V.root.position.y;
    this.tt = tt; this.U = U; this.u = u; this.F = F;
    const I = U.intro, S = U.strike, c0 = I + S;
    const nv = u.victims.length, mx = x + d * (U.hold[0] + U.hold[1] * Math.max(0, nv - 1) * 0.5), my = y + U.hold[2] + 0.2;
    let sh;
    // la parade : à la fin de l'entrée en scène, un plan large sur le lanceur ET ceux qu'il menace (ils peuvent lever leur bouclier), puis, au verdict, plus près
    const thr = (u.ph === 0 || u.ph === 4) && (!u.rf || u.cw) && u.thr.length ? u.thr : null;
    if (thr && (u.ph === 4 || tt >= I - ULT_PARRY.cue)) {
      const ver = u.ph === 4, pick = ver && thr.some((e) => e.tried) ? thr.filter((e) => e.tried) : thr;
      const xs = [x, ...pick.map((e) => (this.mv.views[e.s] ? this.mv.views[e.s].root.position.x : x))];
      const x0 = Math.min(...xs), x1 = Math.max(...xs), midx = (x0 + x1) / 2, fov = ver ? 36 : 40;
      const half = Math.tan(fov * Math.PI / 360) * (this.R.camera.aspect || 1.78), zc = Math.max(ver ? 8 : 9, ((x1 - x0) / 2 + 3.6) / half);
      sh = { pos: [midx - d * 0.6, y + 1.9, zc], look: [midx, y + 1.9, 0], roll: ver ? d * 0.05 : 0, fov };
    } else if (tt < 26) { // 1. gros plan de face, en légère contre-plongée, qui avance
      const e = cl(tt / 26);
      sh = { pos: [x + d * 0.9, y + 0.5 + e * 0.3, lerp(4.4, 3.2, e)], look: [x, y + 1.4 + e * 0.1, 0], roll: d * 0.07, fov: 36 };
    } else if (tt < I) { // 2. plan large, très bas, les ailes ouvertes
      const e = cl((tt - 26) / (I - 26));
      sh = { pos: [x - d * (3.4 - e * 1.6), y + 0.15, lerp(8.8, 6.4, e)], look: [x + d * 0.3, y + 1.55, 0], roll: -d * 0.1 * (1 - e), fov: 50 };
    } else if (tt < c0) { // 3. de côté, la caméra file avec le rayon
      const e = cl((tt - I) / S);
      sh = { pos: [x + d * (0.5 + e * 7), y + 1.3, 9.5], look: [x + d * (2.5 + e * 7.5), y + 1.5, 0], roll: 0, fov: 42 };
    } else if (u.ph === 3) { // à vide : on recule, tout est dit
      const e = ease((tt - c0) / Math.max(1, U.whiff));
      sh = { pos: [x + d * lerp(7.5, 4, e), y + 1.5, lerp(9.5, 13, e)], look: [x + d * lerp(10, 5, e), y + 1.5, 0], roll: 0, fov: 42 };
    } else { // 4. la frappe : un autre angle à chaque note, tout près pour la dernière
      const c = tt - c0, n = Math.min(U.notes - 1, Math.floor(c / U.every)), e = cl((c - n * U.every) / U.every);
      if (n >= U.notes - 1) sh = { pos: [mx - d * 0.3, my, lerp(4.2, 2.8, e)], look: [mx, my, 0], roll: d * 0.05, fov: 30 };
      else switch (n % 4) {
        case 0: sh = { pos: [mx - d * 0.5, my + 0.4, lerp(11, 10, e)], look: [mx, my, 0], roll: 0, fov: 40 }; break;
        case 1: sh = { pos: [mx - d * 2.2, my - 0.7, lerp(5.6, 4.9, e)], look: [mx, my + 0.2, 0], roll: d * 0.16, fov: 34 }; break;
        case 2: sh = { pos: [x - d * 1.6, y + 2.0, lerp(6, 5.2, e)], look: [mx + d, my, 0], roll: -d * 0.08, fov: 38 }; break;
        default: sh = { pos: [mx + d * 1.5, my + 3.2, lerp(7.6, 7, e)], look: [mx, my - 0.2, 0], roll: d * 0.28, fov: 40 };
      }
    }
    rig.script = sh;
  }

  // ---- après CameraRig.update : l'image de fond, le rayon, puis le canevas de devant ----
  // the white flash and the bars that go back out (after the scene: over the arena that is back)
  finish(f, W2, H2, bar) {
    if (this.flash > 0.02) { f.globalAlpha = Math.min(1, this.flash); f.fillStyle = this.flashCol; f.fillRect(0, 0, W2, H2); f.globalAlpha = 1; }
    f.fillStyle = '#000'; f.fillRect(0, 0, W2, bar); f.fillRect(0, H2 - bar, W2, bar);
  }

  // les notes qui volent (elles vivent aussi après la scène, sinon elles restent figées à l'écran)
  stepNotes(dt) {
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i]; n.t += dt;
      n.s.position.x += n.vx * dt; n.s.position.y += n.vy * dt; n.s.position.z += n.vz * dt; n.vy -= 3 * dt;
      const k = n.t / n.life; n.s.scale.setScalar(0.9 + k * 0.8); n.s.material.opacity = 1 - k * k;
      if (k >= 1) { this.mv.root.remove(n.s); n.s.material.dispose(); this.notes.splice(i, 1); }
    }
  }

  post(W, dt) {
    const u = W.ult, cam = this.R.camera;
    this.stepNotes(dt);
    this.flash = Math.max(0, this.flash - dt * (this.on ? 4.5 : 3));
    if (!this.on) {
      if (this.tail > 0 || this.flash > 0.02) {
        this.fg.style.display = 'block'; this.resize();
        const f = this.fgx; f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, this.fg.width, this.fg.height);
        this.finish(f, this.fg.width, this.fg.height, this.fg.height * 0.11 * ease(Math.max(0, this.tail) / 0.4));
      } else this.fg.style.display = 'none';
      return;
    }
    this.resize();
    const tail = !u;
    const U = this.U || (u && ultDefOf(u, W.fighters[u.slot])), tt = this.tt || 0;
    if (!U) return;
    cam.updateMatrixWorld(true);
    const V = this.mv.views[this.F ? this.F.slot : 0];
    const pj = (x, y, z, w, h) => { const v = this._v || (this._v = new THREE.Vector3()); v.set(x, y, z).project(cam); return [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h]; };
    const t = this.mv.t;
    const P0 = V ? V.root.position : { x: 0, y: 0, z: 0 };
    const I = U.intro, S = U.strike, c0 = I + S, d = u ? u.dir : 1;
    const phase = tail ? 4 : tt < I ? 0 : tt < c0 ? 1 : 2;
    const c = Math.max(0, tt - c0), note = u ? Math.min(U.notes - 1, Math.floor(c / U.every)) : U.notes;

    // 3D : l'aura immense du lanceur et le rayon
    if (u) {
      const big = ease(tt / 14) * (phase < 2 ? 1 : 0.6);
      setAura(this.big, t, big * (phase === 0 ? 0.22 : 0.3), 4.2, 6.2, 0.1);
      this.big.material.uniforms.uBack.value = 1.6;
      this.big.position.set(P0.x, P0.y + 1.2, P0.z);
      const g = this.beam;
      const LV = this.laser && this.laser.ready;
      const len = phase === 0 ? 0 : phase === 1 ? U.reach * easeOut((tt - I) / (S * 0.8)) : phase === 2 && u.victims.length ? U.hold[0] + U.hold[1] * u.victims.length + 2.5 : Math.max(0, U.reach * (1 - ease((tt - c0) / U.whiff)));
      if (LV) {
        // la vidéo : la charge au bout de la main, les plans d'impact (canevas de devant), puis le rayon derrière les combattants
        g.visible = false;
        const hit = u.victims.length > 0;
        this.laser.look(U);
        this.laserF = this.laser.frameFor(tt, U, hit);
        const reveal = phase === 0 ? 99 : len;
        // la charge passe devant (sinon l'aura blanche du lanceur la noie), le rayon derrière les combattants (les victimes restent lisibles)
        this.laser.show(this.laserF, P0.x + d * 0.7, P0.y + 1.35, P0.z + (phase === 0 ? 0.9 : -0.4), d, reveal, U.reach);
        // le rayon en vrai 3D : il grossit pendant la frappe, gonfle à chaque note, et s'éteint sur le dernier coup
        const tEnd = c0 + (U.notes - 1) * U.every + 4, kick = phase === 2 ? Math.max(0, 1 - ((c - 3 + U.every) % U.every) / 6) : 0;
        const fade = phase === 0 ? 0 : hit ? Math.max(0, Math.min(1, (tEnd - tt) / 16)) : 1;
        const r3 = (phase === 1 ? 0.45 + 0.5 * ease((tt - I) / S) : 0.95) * ease(fade) * (1 + Math.sin(t * 40) * 0.05);
        this.laser.show3(P0.x + d * 0.7, P0.y + 1.35, P0.z + 0.1, d, len, r3, kick, t);
      } else {
        g.visible = len > 0.2;
        if (g.visible) {
          g.position.set(P0.x + d * 0.7, P0.y + 1.35, P0.z + 0.3);
          g.rotation.set(0, d * Math.PI / 2, 0);
          updateEnergyBeam(g, len, (phase === 1 ? 0.5 + 0.35 * ease((tt - I) / S) : 0.5) * (1 + Math.sin(t * 40) * 0.06), t);
        }
      }
    } else { this.big.visible = false; this.beam.visible = false; if (this.laser) this.laser.hide(); }
    // ---- le fond ----
    const bw = this.bg.width, bh = this.bg.height, b = this.bgx;
    const [fx0, fy0] = pj(P0.x, P0.y + 1.4, P0.z, bw, bh);
    let cx = fx0, cy = fy0;
    if (u && u.ph >= 2 && u.victims.length) { const T = this.mv.views[u.victims[0]]; if (T) [cx, cy] = pj(T.root.position.x, T.root.position.y + 1.2, 0, bw, bh); }
    const cols = U.colors;
    b.globalCompositeOperation = 'source-over';
    const hue = [210, 190, 320, 48, 130, 270, 0][Math.min(6, note)] + (c * 2.2);
    let g;
    if (phase === 0) { // violet profond, des rayons blancs, roses et bleus
      g = b.createRadialGradient(cx, cy, 0, cx, cy, bw * 0.75); g.addColorStop(0, tint(cols[1], 0.55)); g.addColorStop(0.35, tint(cols[1], 0.2)); g.addColorStop(1, tint(cols[1], 0.04));
      b.fillStyle = g; b.fillRect(0, 0, bw, bh);
      radialLines(b, bw, bh, cx, cy, 110, Math.floor(tt / 2.2) + 5, ['#ffffff', tint(cols[1], 0.8), cols[2], cols[0]], 0.1, 0.85);
    } else if (phase === 1) { // le rayon : un ciel sombre, de longues bandes qui filent et une grande traînée rose et blanche
      g = b.createLinearGradient(0, 0, 0, bh); g.addColorStop(0, tint(cols[1], 0.08)); g.addColorStop(0.5, tint(cols[1], 0.24)); g.addColorStop(1, tint(cols[1], 0.05));
      b.fillStyle = g; b.fillRect(0, 0, bw, bh);
      streaks(b, bw, bh, cy, 46, 9, t, d, ['#ffffff', cols[1], cols[2], cols[0]], bh * 0.012);
      const band = b.createLinearGradient(0, cy - bh * 0.2, 0, cy + bh * 0.2); band.addColorStop(0, tint(cols[1], 0.6, 0)); band.addColorStop(0.42, tint(cols[1], 0.7, 0.9)); band.addColorStop(0.5, '#ffffff'); band.addColorStop(0.58, tint(cols[1], 0.7, 0.9)); band.addColorStop(1, tint(cols[1], 0.6, 0));
      b.globalAlpha = (this.laser && this.laser.ready ? 0.35 : 0.9) * ease((tt - I) / 5); b.fillStyle = band; b.fillRect(0, cy - bh * 0.2, bw, bh * 0.4); b.globalAlpha = 1;
    } else { // la frappe : du bleu et du blanc qui rayonnent, la teinte glisse sur l'arc-en-ciel à chaque note
      g = b.createRadialGradient(cx, cy, 0, cx, cy, bw * 0.7); g.addColorStop(0, hsl(hue, 90, 62)); g.addColorStop(0.4, hsl(hue + 10, 85, 32)); g.addColorStop(1, hsl(hue + 20, 80, 8));
      b.fillStyle = g; b.fillRect(0, 0, bw, bh);
      radialLines(b, bw, bh, cx, cy, 150, Math.floor(tt / 2) + 40, ['#ffffff', '#ffffff', hsl(hue + 30, 100, 80), hsl(hue - 30, 100, 70)], 0.07, 0.9, 1.1);
    }
    this.bgTex.needsUpdate = true;

    // ---- le canevas de devant ----
    const f = this.fgx, W2 = this.fg.width, H2 = this.fg.height;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.clearRect(0, 0, W2, H2);
    const px = (x, y, z) => pj(x, y, z, W2, H2);
    // les effets 2D : piliers, nuage, éclats, éclairs
    for (let i = this.fxs.length - 1; i >= 0; i--) {
      const o = this.fxs[i]; o.t += dt;
      const e = o.t / o.life;
      if (e >= 1) { this.fxs.splice(i, 1); continue; }
      const T = o.who !== undefined ? this.mv.views[o.who] : null;
      const [sx, sy] = T ? px(T.root.position.x, T.root.position.y + 1.1, 0) : [W2 / 2, H2 / 2];
      f.globalCompositeOperation = 'source-over';
      if (o.k === 'pillars') pillars(f, W2, H2, e, sx);
      else if (o.k === 'puffs') puffs(f, sx, sy + H2 * 0.08, e, H2 * 0.6, o.seed);
      else if (o.k === 'shards') shards(f, sx, sy, e, H2 * (o.size || 0.5), o.cols, o.seed + Math.floor(o.t * 20), true);
      else if (o.k === 'bolt') {
        for (let k = 0; k < o.n; k++) {
          const r = rng(o.seed + k * 5 + Math.floor(o.t * 24)), ang = (k / o.n) * 6.28 + r() * 0.8, L = H2 * (0.5 + r() * 0.5);
          bolt(f, sx - Math.cos(ang) * L * 0.1, sy - Math.sin(ang) * L * 0.1, sx + Math.cos(ang) * L, sy + Math.sin(ang) * L, o.seed + k + Math.floor(o.t * 24), H2 * 0.008 * o.w, 1 - ease((e - 0.4) / 0.6));
        }
      }
    }
    // des traits qui filent devant tout (le rayon, la frappe)
    if (phase === 1) streaks(f, W2, H2, H2 * 0.5, 14, 31, t * 1.6, d, ['#ffffff', '#ff9ae8'], H2 * 0.006);
    // la parade (17 oct. 2026) : un anneau qui se resserre autour de chaque menacé (doré quand la fenêtre s'ouvre : c'est là qu'il faut lever
    // le bouclier), qui devient cyan si c'est bon et gris si c'est trop tôt ; au verdict (la pause avant le tir) : doré = parade, rouge = raté
    if (u && (!u.rf || u.cw) && (u.ph === 0 || u.ph === 4) && u.thr.length) {
      const cw0 = I - ULT_PARRY.cue, win0 = I - ULT_PARRY.win, ver = u.ph === 4;
      if (ver || tt >= cw0) {
        const k = ver ? 1 : cl((tt - cw0) / ULT_PARRY.cue), open = !ver && tt > win0, vt = ver ? u.vt / ULT_PARRY.verdict : 0;
        if (ver) { // la pause : les bords s'assombrissent, tout le monde regarde les anneaux
          const vg = f.createRadialGradient(W2 / 2, H2 / 2, H2 * 0.25, W2 / 2, H2 / 2, H2 * 0.95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + (0.6 * ease(vt * 4)).toFixed(2) + ')');
          f.fillStyle = vg; f.fillRect(0, 0, W2, H2);
        }
        for (const e of u.thr) {
          const T = this.mv.views[e.s], Fv = W.fighters[e.s]; if (!T || !Fv) continue;
          const [rx, ry] = px(T.root.position.x, T.root.position.y + 1.1, 0), R0 = H2 * 0.085;
          const good = e.ok, bad = e.tried && !e.ok, gold = good && e.perf;
          // verdict : doré = parade parfaite (renvoi), cyan = parade (annulé), rouge = raté ; avant : l'anneau devient doré quand la fenêtre
          // s'ouvre, puis blanc dans les dernières images (la fenêtre parfaite), cyan / doré une fois la parade faite
          const col = ver ? (gold ? '#ffe14a' : good ? '#8ff4ff' : bad ? '#ff5a5a' : '#ffffff') : gold ? '#ffe14a' : good ? '#8ff4ff' : bad ? '#9a9aae' : open ? (tt > I - ULT_PARRY.perfect ? '#ffffff' : '#ffe14a') : '#ffffff';
          const rr = ver ? R0 * (1 + 0.06 * Math.sin(vt * 30)) : R0 * (1 + (1 - ease(k)) * 3.2);
          f.save(); f.lineCap = 'round'; f.lineJoin = 'round';
          f.shadowColor = col; f.shadowBlur = H2 * (open || good || ver ? 0.03 : 0.012);
          // le cercle cible, fixe ; l'anneau qui se resserre dessus
          f.globalAlpha = 0.55 + (open || good ? 0.4 : 0); f.strokeStyle = col; f.lineWidth = H2 * (open || good ? 0.012 : 0.007);
          f.beginPath(); f.arc(rx, ry, R0, 0, 6.2832); f.stroke();
          if (!ver && !good && !bad) { f.globalAlpha = 0.95; f.lineWidth = H2 * 0.009; f.beginPath(); f.arc(rx, ry, rr, 0, 6.2832); f.stroke(); }
          if (open && !good && !bad) { f.globalAlpha = 0.28 + 0.2 * Math.sin(t * 40); f.fillStyle = col; f.beginPath(); f.arc(rx, ry, R0, 0, 6.2832); f.fill(); }
          if (good) { f.globalAlpha = ver ? 0.35 : 0.25; f.fillStyle = col; f.beginPath(); f.arc(rx, ry, R0 * 1.25, 0, 6.2832); f.fill(); }
          // un petit bouclier au-dessus de celui qui doit réagir (les CPU n'en ont pas besoin)
          if (!Fv.bot && !e.tried && !ver) {
            const sy = ry - R0 * 1.9, sz = H2 * 0.03 * (1 + (open ? 0.25 + 0.1 * Math.sin(t * 40) : 0));
            f.globalAlpha = 1; f.fillStyle = open ? '#ffe14a' : '#ffffff'; f.strokeStyle = '#12041f'; f.lineWidth = sz * 0.22;
            f.beginPath(); f.moveTo(rx - sz, sy - sz); f.lineTo(rx + sz, sy - sz); f.lineTo(rx + sz, sy); f.quadraticCurveTo(rx + sz, sy + sz * 0.9, rx, sy + sz * 1.25); f.quadraticCurveTo(rx - sz, sy + sz * 0.9, rx - sz, sy); f.closePath(); f.stroke(); f.fill();
            f.shadowBlur = 0; f.fillStyle = '#12041f'; f.font = `400 ${sz * 1.25}px Bangers, "Barlow Condensed", Impact, sans-serif`; f.textAlign = 'center'; f.textBaseline = 'middle';
            f.fillText('!', rx, sy - sz * 0.05);
          }
          f.restore();
        }
      }
    }
    // le titre : une bande penchée, le nom de l'ultime en grand, son sous-titre dessous
    if (u && tt > 14 && tt < I + 12 && u.ph !== 4) {
      const e = back((tt - 14) / 9), out = 1 - ease((tt - I) / 12), y = H2 * 0.76;
      f.save(); f.globalAlpha = out; f.translate((1 - e) * -W2 * 0.45, 0); f.transform(1, 0, -0.14, 1, H2 * 0.14 * 0.7, 0);
      const band = f.createLinearGradient(0, 0, W2, 0); band.addColorStop(0, 'rgba(8,0,24,0)'); band.addColorStop(0.1, 'rgba(8,0,24,.85)'); band.addColorStop(0.9, 'rgba(8,0,24,.85)'); band.addColorStop(1, 'rgba(8,0,24,0)');
      f.fillStyle = band; f.fillRect(0, y - H2 * 0.115, W2, H2 * 0.23);
      f.fillStyle = cols[1]; f.fillRect(0, y - H2 * 0.115, W2, H2 * 0.008); f.fillStyle = cols[2]; f.fillRect(0, y + H2 * 0.107, W2, H2 * 0.008);
      const fs = H2 * 0.15;
      f.font = `italic 400 ${fs}px Bangers, "Barlow Condensed", Impact, sans-serif`; f.textAlign = 'center'; f.textBaseline = 'middle';
      f.lineJoin = 'round'; f.lineWidth = fs * 0.16; f.strokeStyle = '#12041f'; f.strokeText(U.name, W2 * 0.5, y - H2 * 0.012);
      const tg = f.createLinearGradient(0, y - fs * 0.5, 0, y + fs * 0.5); tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.5, cols[0]); tg.addColorStop(1, cols[1]);
      f.fillStyle = tg; f.fillText(U.name, W2 * 0.5, y - H2 * 0.012);
      f.font = `italic 700 ${H2 * 0.04}px "Barlow Condensed", Impact, sans-serif`; f.fillStyle = '#ffffff'; f.shadowColor = cols[2]; f.shadowBlur = 8;
      f.fillText((this.F ? this.F.name : '') + (U.sub ? ' · ' + U.sub : ''), W2 * 0.5, y + H2 * 0.075);
      f.restore();
    }
    // les trois plans d'impact noir sur blanc de la vidéo (images 47 à 57), plein écran, au départ du rayon (par-dessus le titre)
    if (u && this.laser && this.laser.ready && this.laserF >= 0) {
      const e = this.laser.entry(this.laserF), im = e[0] === 2 ? this.laser.flashImage(e[1]) : null;
      if (im) {
        const k = Math.max(W2 / im.width, H2 / im.height), w = im.width * k, h = im.height * k;
        // la vidéo tire vers la droite : quand le lanceur tire vers la gauche, le plan est retourné pour que le rayon parte du bon côté
        if (u.dir < 0) { f.save(); f.translate(W2, 0); f.scale(-1, 1); }
        f.drawImage(im, (W2 - w) / 2, (H2 - h) / 2, w, h);
        if (u.dir < 0) f.restore();
      }
    }
    // les barres noires du cinéma : elles entrent d'un coup d'œil, et sortent à la fin
    this.finish(f, W2, H2, H2 * 0.11 * ease(tt / 6));
  }

  dispose() {
    if (this.on) this.leave();
    this.fg.remove();
    this.bgTex.dispose(); this.noteTex.dispose();
    if (this.laser) this.laser.dispose();
    for (const n of this.notes) { this.mv.root.remove(n.s); n.s.material.dispose(); }
    this.notes = [];
  }
}
